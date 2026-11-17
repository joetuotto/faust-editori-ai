// Runs in jsdom (the default environment): a real EditorView from CodeMirror's
// CommonJS build. Only a test may require CodeMirror; the core gets the classes as an argument.
const { EditorState, EditorSelection, Annotation, Transaction } = require('@codemirror/state');
const { EditorView } = require('@codemirror/view');
const { createSmartTypingKit } = require('../../src/editor/smartTypingCore');

const { SmartTyping, smartTyping } = createSmartTypingKit({ EditorView, Annotation });

const views = [];

// An editor with the smart typing handler; `log` gets every transaction
function editor(doc = '', options = { enabled: true }, cursor = doc.length) {
  const settings = { current: options };
  const log = [];
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        smartTyping(() => settings.current),
        EditorView.updateListener.of((update) => {
          for (const tr of update.transactions) log.push(tr);
        })
      ]
    })
  });
  views.push(view);
  return { view, log, settings };
}

// What CodeMirror does for one typed character: offer it to the input handlers
// with the default insertion, and insert it when none of them took it
function press(view, text) {
  const { from, to } = view.state.selection.main;
  const insert = () => view.state.update({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    userEvent: 'input.type'
  });
  const handled = view.state.facet(EditorView.inputHandler).some(handler => handler(view, from, to, text, insert));
  if (!handled) view.dispatch(insert());
  return handled;
}

const type = (view, keys) => {
  for (const key of keys) press(view, key);
};
const text = (view) => view.state.doc.toString();
const caret = (view) => view.state.selection.main.head;

afterEach(() => {
  while (views.length > 0) views.pop().destroy();
});

describe('smart typing in a real editor', () => {
  test('typing " gives ” in a second transaction that carries the SmartTyping annotation', () => {
    const { view, log } = editor('Hän sanoi ');
    const handled = press(view, '"');
    expect(handled).toBe(true);
    expect(text(view)).toBe('Hän sanoi ”');
    expect(caret(view)).toBe(11);

    expect(log).toHaveLength(2);
    // First the character as typed, without the annotation
    expect(log[0].newDoc.toString()).toBe('Hän sanoi "');
    expect(log[0].annotation(SmartTyping)).toBeUndefined();
    expect(log[0].annotation(Transaction.userEvent)).toBe('input.type');
    // Then the replacement, marked with the rule name
    expect(log[1].newDoc.toString()).toBe('Hän sanoi ”');
    expect(log[1].annotation(SmartTyping)).toBe('lainausmerkki');
    expect(log[1].annotation(Transaction.userEvent)).toBe('input.type.smart');
    expect(log[1].isUserEvent('input.type')).toBe(true);
    expect(log[1].scrollIntoView).toBe(true);

    // A whole quotation, with ä and ö, and an apostrophe
    type(view, 'Älä mene yöllä", ja vaa\'an');
    expect(text(view)).toBe('Hän sanoi ”Älä mene yöllä”, ja vaa’an');
    expect(log.filter(tr => tr.annotation(SmartTyping)).map(tr => tr.annotation(SmartTyping)))
      .toEqual(['lainausmerkki', 'lainausmerkki', 'heittomerkki']);
  });

  test('typing -- gives – and at a line start – followed by a space', () => {
    const middle = editor('sana ');
    type(middle.view, '-- sana');
    expect(text(middle.view)).toBe('sana – sana');
    expect(middle.log.filter(tr => tr.annotation(SmartTyping)).map(tr => tr.annotation(SmartTyping))).toEqual(['ajatusviiva']);

    const start = editor('Eka rivi.\n');
    type(start.view, '--');
    expect(text(start.view)).toBe('Eka rivi.\n– ');
    expect(caret(start.view)).toBe(12);
    expect(start.log[start.log.length - 1].annotation(SmartTyping)).toBe('vuorosanaviiva');

    // The space the author types next is swallowed: no transaction at all
    const before = start.log.length;
    expect(press(start.view, ' ')).toBe(true);
    expect(start.log).toHaveLength(before);
    type(start.view, 'Hei');
    expect(text(start.view)).toBe('Eka rivi.\n– Hei');

    // Three hyphens are still a scene break
    const scene = editor('');
    type(scene.view, '---');
    expect(text(scene.view)).toBe('---');
    expect(caret(scene.view)).toBe(3);
  });

  test('a single line-start "- " stays as typed', () => {
    const { view, log } = editor('Eka rivi.\n');
    // The space after the hyphen is not ours: CodeMirror's own path inserts it
    press(view, '-');
    expect(press(view, ' ')).toBe(false);
    type(view, 'maito');
    expect(text(view)).toBe('Eka rivi.\n- maito');
    expect(log.some(tr => tr.annotation(SmartTyping))).toBe(false);

    // The same with the retired per-project option in the settings object
    const dialogue = editor('', { enabled: true, lineStartDash: 'dialogue' });
    type(dialogue.view, '- Hei');
    expect(text(dialogue.view)).toBe('- Hei');

    // A hyphen inside a word, and a scene break typed with spaces
    const word = editor('');
    type(word.view, 'maa-ala');
    expect(text(word.view)).toBe('maa-ala');
    const spaced = editor('');
    type(spaced.view, '- - -');
    expect(text(spaced.view)).toBe('- - -');
  });

  test('nothing is replaced when enabled is false or inside a [TODO: …] note', () => {
    const off = editor('', { enabled: false });
    expect(press(off.view, '"')).toBe(false);
    type(off.view, 'Hei" -- \'x\'');
    expect(text(off.view)).toBe('"Hei" -- \'x\'');
    expect(off.log.some(tr => tr.annotation(SmartTyping))).toBe(false);

    // No options at all (the editor is not ready, or the project is not Finnish)
    const none = editor('', null);
    type(none.view, '"--');
    expect(text(none.view)).toBe('"--');

    // The options are read at every key press: switching on takes effect at once
    off.settings.current = { enabled: true };
    type(off.view, ' "');
    expect(text(off.view)).toBe('"Hei" -- \'x\' ”');

    // Inside a note, closed or not, the typed characters stay as they are
    const note = editor('alku [TODO: ');
    type(note.view, 'tarkista "lainaus" -- lähde');
    expect(text(note.view)).toBe('alku [TODO: tarkista "lainaus" -- lähde');
    expect(note.log.some(tr => tr.annotation(SmartTyping))).toBe(false);
    type(note.view, '] "nyt"');
    expect(text(note.view)).toBe('alku [TODO: tarkista "lainaus" -- lähde] ”nyt”');

    const closed = editor('a [TODO: x] b', { enabled: true }, 10);
    type(closed.view, '"');
    expect(text(closed.view)).toBe('a [TODO: x"] b');
  });

  test('the literal character and the replacement are two transactions', () => {
    const { view, log } = editor('sana-');
    press(view, '-');
    expect(log.map(tr => tr.newDoc.toString())).toEqual(['sana--', 'sana–']);
    expect(log.map(tr => tr.docChanged)).toEqual([true, true]);
    expect(log.map(tr => tr.annotation(SmartTyping))).toEqual([undefined, 'ajatusviiva']);

    // Undoing the second one alone gives back exactly what was typed
    const undo = log[1].changes.invert(log[0].newDoc);
    view.dispatch({ changes: undo });
    expect(text(view)).toBe('sana--');
    // …and typing on does not convert it again
    type(view, 'x');
    expect(text(view)).toBe('sana--x');

    // A character that is not converted is one transaction, made by CodeMirror's own path
    const plain = editor('');
    expect(press(plain.view, 'a')).toBe(false);
    expect(plain.log).toHaveLength(1);
    // A trigger character without a replacement is still one transaction
    const hyphen = editor('maa');
    expect(press(hyphen.view, '-')).toBe(true);
    expect(hyphen.log).toHaveLength(1);
    expect(text(hyphen.view)).toBe('maa-');
  });

  test('pasted text, a selection replaced by a quote and several cursors', () => {
    // More than one character at once (paste, dictation, a spell-check replacement): untouched
    const paste = editor('');
    expect(press(paste.view, '"Hei" -- nyt')).toBe(false);
    expect(text(paste.view)).toBe('"Hei" -- nyt');

    // Typing a quote over a selection replaces the selection with ”
    const selection = editor('Hän sanoi xx');
    selection.view.dispatch({ selection: { anchor: 10, head: 12 } });
    press(selection.view, '"');
    expect(text(selection.view)).toBe('Hän sanoi ”');

    // A space typed over a selection right after a line-start "– " replaces the selection
    const dashSelection = editor('– xx');
    dashSelection.view.dispatch({ selection: { anchor: 2, head: 4 } });
    expect(press(dashSelection.view, ' ')).toBe(false);
    expect(text(dashSelection.view)).toBe('–  ');
    expect(caret(dashSelection.view)).toBe(3);

    // During IME composition the handler steps aside
    const composing = editor('Hän sanoi ');
    Object.defineProperty(composing.view, 'composing', { get: () => true });
    expect(press(composing.view, '"')).toBe(false);
    expect(text(composing.view)).toBe('Hän sanoi "');
    expect(composing.log.some(tr => tr.annotation(SmartTyping))).toBe(false);

    // With several cursors the handler steps aside
    const multi = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: 'a\nb',
        extensions: [EditorState.allowMultipleSelections.of(true), smartTyping(() => ({ enabled: true }))]
      })
    });
    views.push(multi);
    multi.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(3)]) });
    expect(multi.state.selection.ranges).toHaveLength(2);
    expect(multi.state.facet(EditorView.inputHandler)[0](multi, 1, 1, '"', () => multi.state.update({}))).toBe(false);
  });
});

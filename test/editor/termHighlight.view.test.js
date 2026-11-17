// jsdom environment (the Jest default): the kit is run with a real EditorView.
// CodeMirror is required here only; the module under test never loads it.
const state = require('@codemirror/state');
const view = require('@codemirror/view');
const { createTermHighlightKit } = require('../../src/editor/termHighlightCore');

const kit = createTermHighlightKit({
  StateField: state.StateField,
  StateEffect: state.StateEffect,
  Decoration: view.Decoration,
  ViewPlugin: view.ViewPlugin,
  EditorView: view.EditorView
});

const CODEX = [
  { id: 'cx-mari', type: 'hahmo', name: 'Mari', aliases: [], exclude: ['Marianne'], description: 'Vanhin sisar.', notes: '', state: 'mentioned' },
  { id: 'cx-satama', type: 'paikka', name: 'Satama', aliases: ['satama'], exclude: [], description: 'Kalasatama.', notes: '', state: 'always' }
];

// A document of a few lines: jsdom has no layout, and CodeMirror then treats
// the start of the document as visible
const DOC = [
  'Hehkuva aamu nousi sataman ylle, jotenkin hitaasti.',
  '– Tuletko sinä jo? Marin ääni kysyi. [TODO: hehku pois, kysy Marilta]',
  'Marianne ei vastannut, vain <u>Mari</u> hehkui.'
].join('\n');

const views = [];

function mount(config, callbacks, extra = []) {
  const editor = new view.EditorView({
    doc: DOC,
    extensions: [kit.termHighlight(config, callbacks), ...extra],
    parent: document.body
  });
  views.push(editor);
  return editor;
}

const marked = (editor, className) => Array.from(editor.contentDOM.querySelectorAll(`.${className}`));
const texts = (editor, className) => marked(editor, className).map(element => element.textContent);

function mouseDown(element, init = {}) {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...init });
  element.dispatchEvent(event);
  return event;
}

function setPlatform(value) {
  Object.defineProperty(window.navigator, 'platform', { value, configurable: true });
}

afterEach(() => {
  while (views.length > 0) views.pop().destroy();
  // Back to jsdom's own (empty) platform string
  delete window.navigator.platform;
});

test('an avoid word is marked with cm-faust-avoid and the same word inside a [TODO: …] note is not', () => {
  const editor = mount({ avoid: ['hehku', 'jotenkin', '”vain”'], codex: [] });

  // The stem rule of the list: "hehku" also marks Hehkuva and hehkui; the quoted "vain" only the word itself
  expect(texts(editor, 'cm-faust-avoid')).toEqual(['Hehkuva', 'jotenkin', 'vain', 'hehkui']);

  // The note on the second line holds "hehku" and is left alone
  const lines = editor.contentDOM.querySelectorAll('.cm-line');
  expect(lines).toHaveLength(3);
  expect(lines[1].textContent).toContain('[TODO: hehku pois, kysy Marilta]');
  expect(lines[1].querySelectorAll('.cm-faust-avoid')).toHaveLength(0);

  // Marks are decorations only: the text of the editor is the document
  expect(editor.contentDOM.textContent).toBe(DOC.replace(/\n/g, ''));
  expect(editor.state.doc.toString()).toBe(DOC);
});

test('an inflected form of an entry\'s name is marked with cm-faust-mention and carries the entry id', () => {
  const editor = mount({ avoid: [], codex: CODEX });

  const mentions = marked(editor, 'cm-faust-mention');
  // sataman (alias as stem), Marin (inflected), Mari inside <u> tags; Marianne is on the exclusion list
  // and Marilta stands inside a note
  expect(mentions.map(element => [element.textContent, element.getAttribute('data-codex-id')])).toEqual([
    ['sataman', 'cx-satama'],
    ['Marin', 'cx-mari'],
    ['Mari', 'cx-mari']
  ]);

  // The tooltip names the entry, its type and state, and how to open it (jsdom is not macOS)
  expect(mentions[1].getAttribute('title')).toBe('Mari · hahmo · Kun mainitaan. Ctrl-napsautus avaa merkinnän.');
  expect(mentions[0].getAttribute('title')).toBe('Satama · paikka · Aina mukana. Ctrl-napsautus avaa merkinnän.');
  expect(texts(editor, 'cm-faust-avoid')).toEqual([]);
});

test('the tooltip names the Cmd key on macOS', () => {
  setPlatform('MacIntel');
  const editor = mount({ avoid: [], codex: CODEX });
  expect(marked(editor, 'cm-faust-mention')[1].getAttribute('title')).toBe('Mari · hahmo · Kun mainitaan. ⌘-napsautus avaa merkinnän.');
});

test('setTermHighlightConfig replaces the marks and does not change the document', () => {
  const docChanges = [];
  const transactions = [];
  const listener = view.EditorView.updateListener.of((update) => {
    transactions.push(update);
    if (update.docChanged) docChanges.push(update);
  });
  const editor = mount({ avoid: ['hehku'], codex: [] }, {}, [listener]);
  expect(texts(editor, 'cm-faust-avoid')).toEqual(['Hehkuva', 'hehkui']);
  expect(texts(editor, 'cm-faust-mention')).toEqual([]);

  // A new list and the entries: old marks go, new ones come
  editor.dispatch({ effects: kit.setTermHighlightConfig.of({ avoid: ['jotenkin'], codex: CODEX }) });
  expect(texts(editor, 'cm-faust-avoid')).toEqual(['jotenkin']);
  expect(texts(editor, 'cm-faust-mention')).toEqual(['sataman', 'Marin', 'Mari']);

  // Both kinds on the same word: an avoid word that is also an entry's name
  editor.dispatch({ effects: kit.setTermHighlightConfig.of({ avoid: ['Mari'], codex: [CODEX[0]] }) });
  expect(texts(editor, 'cm-faust-avoid')).toEqual(['Marin', 'Marianne', 'Mari']);
  expect(texts(editor, 'cm-faust-mention')).toEqual(['Marin', 'Mari']);

  // Empty lists: nothing is drawn
  editor.dispatch({ effects: kit.setTermHighlightConfig.of({ avoid: [], codex: [] }) });
  expect(texts(editor, 'cm-faust-avoid')).toEqual([]);
  expect(texts(editor, 'cm-faust-mention')).toEqual([]);

  // No transaction changed the document, so onChange and undo have nothing to react to
  expect(transactions.length).toBeGreaterThanOrEqual(3);
  expect(docChanges).toEqual([]);
  expect(editor.state.doc.toString()).toBe(DOC);

  // The marks follow the text when the author types
  editor.dispatch({ effects: kit.setTermHighlightConfig.of({ avoid: ['hehku'], codex: [] }) });
  editor.dispatch({ changes: { from: 0, insert: 'Hehku. ' } });
  expect(texts(editor, 'cm-faust-avoid')).toEqual(['Hehku', 'Hehkuva', 'hehkui']);
  editor.dispatch({ changes: { from: 0, to: 14, insert: 'Kirkas' } });
  expect(editor.state.doc.line(1).text.startsWith('Kirkas aamu')).toBe(true);
  expect(texts(editor, 'cm-faust-avoid')).toEqual(['hehkui']);
});

test('a null config draws nothing', () => {
  const editor = mount(null);
  expect(texts(editor, 'cm-faust-avoid')).toEqual([]);
  expect(texts(editor, 'cm-faust-mention')).toEqual([]);
  expect(editor.contentDOM.querySelector('[data-codex-id]')).toBeNull();

  // Marks appear when a config arrives and go away again with null
  editor.dispatch({ effects: kit.setTermHighlightConfig.of({ avoid: ['hehku'], codex: CODEX }) });
  expect(texts(editor, 'cm-faust-avoid')).toHaveLength(2);
  expect(texts(editor, 'cm-faust-mention')).toHaveLength(3);
  editor.dispatch({ effects: kit.setTermHighlightConfig.of(null) });
  expect(texts(editor, 'cm-faust-avoid')).toEqual([]);
  expect(texts(editor, 'cm-faust-mention')).toEqual([]);
  expect(editor.state.doc.toString()).toBe(DOC);

  // Lists of the wrong shape and an undefined config are no config either
  for (const config of [undefined, {}, { avoid: 'hehku', codex: 'Mari' }, { avoid: ['...'], codex: [{ id: 'x', name: '' }] }]) {
    const other = mount(config);
    expect(texts(other, 'cm-faust-avoid')).toEqual([]);
    expect(texts(other, 'cm-faust-mention')).toEqual([]);
  }
});

test('Cmd- or Ctrl-click on a mention calls onMentionClick with the entry id; a plain click does not', () => {
  const onMentionClick = jest.fn();
  // A handler after the kit's: it sees only what the kit did not take, and keeps
  // the editor's own mouse selection (which needs layout) out of the test
  const passedOn = jest.fn(() => true);
  const editor = mount({ avoid: ['hehku'], codex: CODEX }, { onMentionClick }, [view.EditorView.domEventHandlers({ mousedown: passedOn })]);

  const [satama, marin] = marked(editor, 'cm-faust-mention');
  const plainWord = marked(editor, 'cm-faust-avoid')[0];

  // jsdom is not macOS: Ctrl is the key
  const ctrlClick = mouseDown(marin, { ctrlKey: true });
  expect(onMentionClick).toHaveBeenCalledTimes(1);
  expect(onMentionClick).toHaveBeenLastCalledWith('cx-mari');
  expect(ctrlClick.defaultPrevented).toBe(true);
  expect(passedOn).not.toHaveBeenCalled();

  mouseDown(satama, { ctrlKey: true });
  expect(onMentionClick).toHaveBeenLastCalledWith('cx-satama');
  expect(onMentionClick).toHaveBeenCalledTimes(2);

  // A plain click, and a click with the other platform's key, are ordinary clicks
  mouseDown(marin);
  mouseDown(marin, { metaKey: true });
  mouseDown(marin, { shiftKey: true, altKey: true });
  expect(onMentionClick).toHaveBeenCalledTimes(2);
  expect(passedOn).toHaveBeenCalledTimes(3);

  // Ctrl-click elsewhere in the text opens nothing
  mouseDown(plainWord, { ctrlKey: true });
  mouseDown(editor.contentDOM.querySelector('.cm-line'), { ctrlKey: true });
  expect(onMentionClick).toHaveBeenCalledTimes(2);
  expect(passedOn).toHaveBeenCalledTimes(5);

  // On macOS the key is Cmd, and Ctrl-click is left to the system (it opens the context menu)
  setPlatform('MacIntel');
  mouseDown(marin, { ctrlKey: true });
  expect(onMentionClick).toHaveBeenCalledTimes(2);
  const cmdClick = mouseDown(marin, { metaKey: true });
  expect(onMentionClick).toHaveBeenCalledTimes(3);
  expect(onMentionClick).toHaveBeenLastCalledWith('cx-mari');
  expect(cmdClick.defaultPrevented).toBe(true);

  // The document was never touched
  expect(editor.state.doc.toString()).toBe(DOC);
});

test('without a callback a modified click is an ordinary click', () => {
  const passedOn = jest.fn(() => true);
  const editor = mount({ avoid: [], codex: CODEX }, undefined, [view.EditorView.domEventHandlers({ mousedown: passedOn })]);
  mouseDown(marked(editor, 'cm-faust-mention')[0], { ctrlKey: true });
  expect(passedOn).toHaveBeenCalledTimes(1);

  // The callbacks object is read at click time, so a handler set later is used
  const callbacks = {};
  const later = mount({ avoid: [], codex: CODEX }, callbacks);
  callbacks.onMentionClick = jest.fn();
  mouseDown(marked(later, 'cm-faust-mention')[1], { ctrlKey: true });
  expect(callbacks.onMentionClick).toHaveBeenCalledWith('cx-mari');
});

test('the kit is one effect type and one extension factory, and two editors keep their own marks', () => {
  expect(Object.keys(kit).sort()).toEqual(['setTermHighlightConfig', 'termHighlight']);
  expect(typeof kit.termHighlight).toBe('function');
  expect(typeof kit.setTermHighlightConfig.of).toBe('function');

  const first = mount({ avoid: ['hehku'], codex: [] });
  const second = mount({ avoid: ['jotenkin'], codex: [] });
  expect(texts(first, 'cm-faust-avoid')).toEqual(['Hehkuva', 'hehkui']);
  expect(texts(second, 'cm-faust-avoid')).toEqual(['jotenkin']);

  first.dispatch({ effects: kit.setTermHighlightConfig.of(null) });
  expect(texts(first, 'cm-faust-avoid')).toEqual([]);
  expect(texts(second, 'cm-faust-avoid')).toEqual(['jotenkin']);

  // The effect is harmless in an editor that does not have the extension
  const bare = new view.EditorView({ doc: DOC, parent: document.body });
  views.push(bare);
  expect(() => bare.dispatch({ effects: kit.setTermHighlightConfig.of({ avoid: ['hehku'], codex: [] }) })).not.toThrow();
  expect(bare.contentDOM.querySelector('.cm-faust-avoid')).toBeNull();
});

test('marks land on the right words when the visible text does not start at the top of the document', () => {
  const lines = [
    'Mari yksi jotenkin.',
    'Rivi kaksi Marin kanssa, jotenkin.',
    'Rivi kolme: Marille [TODO: Mari jotenkin].',
    'Mari neljä.',
    'Viides jotenkin Mari.'
  ];
  const doc = lines.join('\n');
  const editor = new view.EditorView({ doc, extensions: [kit.termHighlight(null)], parent: document.body });
  views.push(editor);

  // jsdom has no layout, so the visible ranges are given by hand: from the middle of the
  // word "Marin" on line 2 to the start of line 3, and a point inside line 5
  const line2 = editor.state.doc.line(2);
  const line3 = editor.state.doc.line(3);
  const line5 = editor.state.doc.line(5);
  expect(doc.slice(line2.from + 11, line2.from + 16)).toBe('Marin');
  Object.defineProperty(editor, 'visibleRanges', {
    configurable: true,
    get: () => [{ from: line2.from + 13, to: line3.from + 4 }, { from: line5.from + 3, to: line5.from + 3 }]
  });
  editor.dispatch({ effects: kit.setTermHighlightConfig.of({ avoid: ['jotenkin'], codex: [CODEX[0]] }) });

  // Each mark with its place in the document
  const placed = (className) => marked(editor, className).map(element => [element.textContent, editor.posAtDOM(element.firstChild, 0)]);
  // The ranges are widened to whole lines; lines 1 and 4 are not visible and stay unmarked
  expect(placed('cm-faust-mention')).toEqual([
    ['Marin', doc.indexOf('Marin')],
    ['Marille', doc.indexOf('Marille')],
    ['Mari', doc.lastIndexOf('Mari')]
  ]);
  expect(placed('cm-faust-avoid')).toEqual([
    ['jotenkin', doc.indexOf('jotenkin', line2.from)],
    ['jotenkin', doc.indexOf('jotenkin', line5.from)]
  ]);
  for (const [word, at] of [...placed('cm-faust-mention'), ...placed('cm-faust-avoid')]) {
    expect(doc.slice(at, at + word.length)).toBe(word);
  }
});

test('a word in italics is marked like any other', () => {
  const editor = new view.EditorView({
    doc: 'He nousivat _Auroran_ kannelle, _jotenkin_ hitaasti.',
    extensions: [kit.termHighlight({ avoid: ['jotenkin'], codex: [{ id: 'cx-aurora', type: 'esine', name: 'Aurora', state: 'mentioned' }] })],
    parent: document.body
  });
  views.push(editor);
  expect(marked(editor, 'cm-faust-mention').map(element => [element.textContent, element.getAttribute('data-codex-id')])).toEqual([['Auroran', 'cx-aurora']]);
  expect(texts(editor, 'cm-faust-avoid')).toEqual(['jotenkin']);
});

test('the theme has the two rules of the highlight', () => {
  // A second kit whose EditorView records what the theme is made of
  const baseTheme = jest.fn(view.EditorView.baseTheme);
  createTermHighlightKit({
    StateField: state.StateField,
    StateEffect: state.StateEffect,
    Decoration: view.Decoration,
    ViewPlugin: view.ViewPlugin,
    EditorView: { baseTheme, domEventHandlers: view.EditorView.domEventHandlers }
  });

  expect(baseTheme).toHaveBeenCalledTimes(1);
  expect(baseTheme).toHaveBeenCalledWith({
    '.cm-faust-avoid': { backgroundColor: 'rgba(196, 92, 60, 0.20)', borderRadius: '2px' },
    '.cm-faust-mention': {
      textDecoration: 'underline dotted',
      textDecorationColor: 'var(--text-3, rgba(128,128,128,0.8))',
      textUnderlineOffset: '3px'
    }
  });
});

test('the core never loads CodeMirror itself', () => {
  const source = require('fs').readFileSync(require.resolve('../../src/editor/termHighlightCore'), 'utf8');
  expect(source).not.toMatch(/require\(\s*['"]@(?:codemirror|lezer)\//);
  expect(source).not.toMatch(/^\s*import\s/m);
  expect(source.match(/require\(([^)]*)\)/g)).toEqual(["require('./termMatch.js')", "require('../services/story/codex.js')"]);
});

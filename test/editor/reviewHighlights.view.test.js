// jsdom environment (the Jest default): the kit is run with a real EditorView.
// CodeMirror is required here only; the module under test never loads it.
const fs = require('fs');
const path = require('path');
const state = require('@codemirror/state');
const view = require('@codemirror/view');
const { createReviewHighlightsKit } = require('../../src/editor/reviewHighlightsCore');

const kit = createReviewHighlightsKit({
  StateField: state.StateField,
  StateEffect: state.StateEffect,
  EditorView: view.EditorView,
  Decoration: view.Decoration
});
const { setFindingHighlights, findingField, reviewHighlights, findingRanges } = kit;

// A document of a few lines: jsdom has no layout, and CodeMirror then treats
// the start of the document as visible
const DOC = [
  'Aamu oli jotenkin harmaa, ja Liisa seisoi laiturilla.',
  '– Tuletko sinä jo? hän huusi vihaisesti.',
  'Åke-setä oli tavallaan aina sanonut, että järvi ottaa omansa.'
].join('\n');

const rangeOf = (phrase, id) => ({ id, from: DOC.indexOf(phrase), to: DOC.indexOf(phrase) + phrase.length });
const ITEMS = [rangeOf('jotenkin', 'f-1'), rangeOf('vihaisesti', 'f-2'), rangeOf('tavallaan', 'f-3')];

const views = [];

// `after` and `before`: other extensions, behind the kit's or in front of it
function mount(callbacks, after = [], before = []) {
  const editor = new view.EditorView({
    doc: DOC,
    extensions: [...before, reviewHighlights(callbacks), ...after],
    parent: document.body
  });
  views.push(editor);
  return editor;
}

// The last handler of a test editor's chain takes the event, so that the editor's own
// mouse selection (which needs a layout jsdom does not have) is not started
const takeEvent = () => view.EditorView.domEventHandlers({ mousedown: () => true });

const show = (editor, value) => editor.dispatch({ effects: setFindingHighlights.of(value) });
const marks = (editor) => Array.from(editor.contentDOM.querySelectorAll('.cm-faust-finding'));
const marked = (editor) => marks(editor).map(element => [element.getAttribute('data-finding-id'), element.textContent]);
const type = (editor, pos, text) => editor.dispatch({ changes: { from: pos, insert: text } });

function mouseDown(element) {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
  element.dispatchEvent(event);
  return event;
}

afterEach(() => {
  while (views.length > 0) views.pop().destroy();
});

// Final polish round 1: a note's and an error's mark say so (the stylesheet draws a double line and a heavier wave)
test('a mark carries data-severity for a note and an error, and nothing for a warning', () => {
  const editor = mount();
  show(editor, { items: [{ ...ITEMS[0], severity: 'note' }, { ...ITEMS[1], severity: 'error' }, { ...ITEMS[2], severity: 'loud' }], activeId: null });
  expect(marks(editor).map(element => element.getAttribute('data-severity'))).toEqual(['note', 'error', null]);
  const css = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'styles', 'faust-components.css'), 'utf8');
  expect(css).toContain('.cm-faust-finding[data-severity="note"] { text-decoration-style: double; text-decoration-color: var(--hl-finding-note-line); }');
  expect(css).toContain('.cm-faust-finding[data-severity="error"] { text-decoration-color: var(--hl-finding-error-line);');
});

test('setFindingHighlights draws one mark per finding and gives the active one its class', () => {
  const editor = mount();
  expect(marks(editor)).toHaveLength(0);

  show(editor, { items: ITEMS, activeId: 'f-2' });
  expect(marked(editor)).toEqual([['f-1', 'jotenkin'], ['f-2', 'vihaisesti'], ['f-3', 'tavallaan']]);
  expect(marks(editor).map(element => element.className)).toEqual([
    'cm-faust-finding', 'cm-faust-finding cm-faust-finding-active', 'cm-faust-finding'
  ]);

  // A new set replaces the old one: another active finding, one finding less, in any order
  show(editor, { items: [ITEMS[2], ITEMS[0]], activeId: 'f-3' });
  expect(marked(editor)).toEqual([['f-1', 'jotenkin'], ['f-3', 'tavallaan']]);
  expect(editor.contentDOM.querySelectorAll('.cm-faust-finding-active')).toHaveLength(1);
  expect(editor.contentDOM.querySelector('.cm-faust-finding-active').textContent).toBe('tavallaan');
  show(editor, { items: ITEMS, activeId: null });
  expect(editor.contentDOM.querySelectorAll('.cm-faust-finding-active')).toHaveLength(0);

  // Ranges are clamped to the document; empty and reversed ones draw nothing
  show(editor, {
    items: [
      { id: 'end', from: DOC.length - 7, to: DOC.length + 50 },
      { id: 'beyond', from: DOC.length + 5, to: DOC.length + 9 },
      { id: 'empty', from: 4, to: 4 },
      { id: 'reversed', from: 9, to: 5 },
      { id: 'broken', from: null, to: 5 }
    ],
    activeId: 'end'
  });
  expect(marked(editor)).toEqual([['end', 'omansa.']]);

  // Marks are decorations only: the document and the text on screen are untouched
  expect(editor.state.doc.toString()).toBe(DOC);
  expect(editor.contentDOM.textContent).toBe(DOC.replace(/\n/g, ''));
});

test('a mark follows text typed in front of it and does not grow when text is typed at its edge', () => {
  const editor = mount();
  show(editor, { items: ITEMS, activeId: null });
  const [first] = ITEMS;

  type(editor, 0, 'Sinä päivänä ');
  expect(marked(editor)).toEqual([['f-1', 'jotenkin'], ['f-2', 'vihaisesti'], ['f-3', 'tavallaan']]);
  expect(findingRanges(editor.state)[0]).toEqual({ id: 'f-1', from: first.from + 13, to: first.to + 13 });

  // Right at the start of the mark and right at its end: the typed text stays outside
  type(editor, first.from + 13, 'aivan ');
  type(editor, first.to + 13 + 6, 'kin');
  expect(marked(editor)[0]).toEqual(['f-1', 'jotenkin']);
  expect(editor.state.doc.toString()).toContain('oli aivan jotenkinkin harmaa');

  // Typed inside, the mark keeps its edges and holds the new text
  type(editor, first.from + 13 + 6 + 3, 'XX');
  expect(marked(editor)[0]).toEqual(['f-1', 'jotXXenkin']);
});

test('a mark whose text is deleted disappears', () => {
  const editor = mount();
  show(editor, { items: ITEMS, activeId: 'f-2' });
  const second = ITEMS[1];

  // The marked word and a little around it
  editor.dispatch({ changes: { from: second.from - 1, to: second.to + 1 } });
  expect(marked(editor)).toEqual([['f-1', 'jotenkin'], ['f-3', 'tavallaan']]);
  expect(findingRanges(editor.state).map(range => range.id)).toEqual(['f-1', 'f-3']);

  // Exactly the marked word
  const first = ITEMS[0];
  editor.dispatch({ changes: { from: first.from, to: first.to } });
  expect(marked(editor)).toEqual([['f-3', 'tavallaan']]);

  // A part of it: the rest stays marked
  const third = findingRanges(editor.state)[0];
  editor.dispatch({ changes: { from: third.from, to: third.from + 5 } });
  expect(marked(editor)).toEqual([['f-3', 'laan']]);
});

test('a null effect removes every mark', () => {
  const editor = mount();
  show(editor, { items: ITEMS, activeId: 'f-1' });
  expect(marks(editor)).toHaveLength(3);

  show(editor, null);
  expect(marks(editor)).toHaveLength(0);
  expect(findingRanges(editor.state)).toEqual([]);
  expect(editor.state.field(findingField).size).toBe(0);

  // The same for a set without items
  show(editor, { items: ITEMS, activeId: null });
  show(editor, { items: [], activeId: null });
  expect(marks(editor)).toHaveLength(0);
  show(editor, { items: ITEMS, activeId: null });
  show(editor, { activeId: 'f-1' });
  expect(marks(editor)).toHaveLength(0);
});

test('setting the marks is not a document change', () => {
  const changes = [];
  const editor = mount({}, [view.EditorView.updateListener.of((update) => changes.push(update.docChanged))]);

  show(editor, { items: ITEMS, activeId: 'f-1' });
  show(editor, null);
  // Two transactions, neither touched the text: onChange, undo and the typewriter centring are not triggered
  expect(changes).toEqual([false, false]);
  expect(editor.state.doc.toString()).toBe(DOC);
});

test('mousedown inside a mark calls onFindingClick with the finding id and does not prevent the caret from moving', () => {
  const onFindingClick = jest.fn();
  // A handler that comes after the kit's runs only when the kit's handler says "not handled".
  // The editor's own caret placement is the last handler of the same chain.
  const passedOn = jest.fn(() => true);
  const editor = mount({ onFindingClick }, [view.EditorView.domEventHandlers({ mousedown: passedOn })]);
  show(editor, { items: ITEMS, activeId: null });

  mouseDown(marks(editor)[1]);
  expect(onFindingClick).toHaveBeenCalledTimes(1);
  expect(onFindingClick).toHaveBeenCalledWith('f-2');
  expect(passedOn).toHaveBeenCalledTimes(1);

  // Outside a mark nothing is reported, and the event is passed on all the same
  mouseDown(editor.contentDOM.querySelector('.cm-line'));
  expect(onFindingClick).toHaveBeenCalledTimes(1);
  expect(passedOn).toHaveBeenCalledTimes(2);

  // The chain is real: a handler in front of the kit's that takes the event keeps it from the kit
  const unseen = jest.fn();
  const blocked = mount({ onFindingClick: unseen }, [], [takeEvent()]);
  show(blocked, { items: ITEMS, activeId: null });
  mouseDown(marks(blocked)[1]);
  expect(unseen).not.toHaveBeenCalled();

  // Without any other handler the editor's own mouse handling takes over: it starts a selection
  // at the click and cancels the browser's default, which the kit's handler alone never does
  const plain = mount({ onFindingClick });
  show(plain, { items: ITEMS, activeId: null });
  const handled = mouseDown(marks(plain)[0]);
  expect(onFindingClick).toHaveBeenLastCalledWith('f-1');
  expect(handled.defaultPrevented).toBe(true);
  expect(plain.inputState.mouseSelection).not.toBeNull();
});

test('a click on another mark over the same words still finds the finding', () => {
  const onFindingClick = jest.fn();
  const third = ITEMS[2];
  const otherMark = view.Decoration.mark({ class: 'other-mark' });
  const otherField = state.StateField.define({
    create: () => view.Decoration.set([otherMark.range(third.from + 2, third.from + 6)]),
    update: (value, tr) => value.map(tr.changes),
    provide: field => view.EditorView.decorations.from(field)
  });

  // A field in front of the kit's (search, suggestions): its mark sits inside the finding's element
  const inside = mount({ onFindingClick }, [takeEvent()], [otherField]);
  show(inside, { items: ITEMS, activeId: null });
  const inner = inside.contentDOM.querySelector('.other-mark');
  expect(inner.parentNode.getAttribute('data-finding-id')).toBe('f-3');
  mouseDown(inner);
  expect(onFindingClick).toHaveBeenLastCalledWith('f-3');

  // A field behind it (underline, notes, term highlights): the finding's element is the inner one
  const outside = mount({ onFindingClick }, [otherField, takeEvent()]);
  show(outside, { items: ITEMS, activeId: null });
  const wrapped = outside.contentDOM.querySelector('.other-mark [data-finding-id]');
  expect(wrapped.textContent).toBe('vall');
  mouseDown(wrapped);
  expect(onFindingClick).toHaveBeenCalledTimes(2);
  expect(onFindingClick).toHaveBeenLastCalledWith('f-3');
  // The three pieces of the split mark carry the same id
  expect(Array.from(outside.contentDOM.querySelectorAll('[data-finding-id="f-3"]'), element => element.textContent).join('')).toBe('tavallaan');
});

test('the click callback is read at click time and a missing one is not an error', () => {
  const callbacks = {};
  const editor = mount(callbacks, [takeEvent()]);
  show(editor, { items: ITEMS, activeId: null });
  expect(() => mouseDown(marks(editor)[0])).not.toThrow();

  callbacks.onFindingClick = jest.fn();
  mouseDown(marks(editor)[0]);
  expect(callbacks.onFindingClick).toHaveBeenCalledWith('f-1');

  const bare = mount(undefined, [takeEvent()]);
  show(bare, { items: ITEMS, activeId: null });
  expect(() => mouseDown(marks(bare)[2])).not.toThrow();
});

test('findingRanges returns the current mapped ranges', () => {
  const editor = mount();
  expect(findingRanges(editor.state)).toEqual([]);

  show(editor, { items: [ITEMS[2], ITEMS[0], ITEMS[1]], activeId: 'f-3' });
  // In document order, whatever the order they were set in
  expect(findingRanges(editor.state)).toEqual(ITEMS);

  type(editor, DOC.indexOf('– Tuletko'), 'Uusi rivi.\n');
  expect(findingRanges(editor.state)).toEqual([
    ITEMS[0],
    { id: 'f-2', from: ITEMS[1].from + 11, to: ITEMS[1].to + 11 },
    { id: 'f-3', from: ITEMS[2].from + 11, to: ITEMS[2].to + 11 }
  ]);
  for (const range of findingRanges(editor.state)) {
    expect(['jotenkin', 'vihaisesti', 'tavallaan']).toContain(editor.state.sliceDoc(range.from, range.to));
  }

  // A state without the extension has no ranges
  const bare = state.EditorState.create({ doc: DOC });
  expect(findingRanges(bare)).toEqual([]);
});

test('search highlights of another field and finding marks do not touch each other', () => {
  // A stand-in for the editor's search highlight: its own effect and field
  const setSearch = state.StateEffect.define();
  const searchMark = view.Decoration.mark({ class: 'cm-faust-match' });
  const searchField = state.StateField.define({
    create: () => view.Decoration.none,
    update(value, tr) {
      let next = value.map(tr.changes);
      for (const effect of tr.effects) {
        if (effect.is(setSearch)) next = view.Decoration.set(effect.value.map(range => searchMark.range(range.from, range.to)), true);
      }
      return next;
    },
    provide: field => view.EditorView.decorations.from(field)
  });
  const editor = mount({}, [searchField]);

  show(editor, { items: ITEMS, activeId: 'f-1' });
  editor.dispatch({ effects: setSearch.of([rangeOf('jotenkin', 's'), rangeOf('Liisa', 's')]) });
  // Both mark the same word
  expect(marked(editor).map(([id]) => id)).toEqual(['f-1', 'f-2', 'f-3']);
  expect(Array.from(editor.contentDOM.querySelectorAll('.cm-faust-match'), element => element.textContent)).toEqual(['jotenkin', 'Liisa']);

  // Clearing one leaves the other
  editor.dispatch({ effects: setSearch.of([]) });
  expect(marks(editor)).toHaveLength(3);
  editor.dispatch({ effects: setSearch.of([rangeOf('Liisa', 's')]) });
  show(editor, null);
  expect(editor.contentDOM.querySelectorAll('.cm-faust-match')).toHaveLength(1);
});

test('the kit has the four documented members and the core never loads CodeMirror itself', () => {
  expect(Object.keys(kit).sort()).toEqual(['findingField', 'findingRanges', 'reviewHighlights', 'setFindingHighlights']);
  // The extension is the field, the click handler and the theme
  expect(reviewHighlights()).toHaveLength(3);
  expect(reviewHighlights()[0]).toBe(findingField);

  // A second copy of the editor state package in the bundle breaks the editor at run time. Its one require
  // is the pure drawing rule (F4: until then the file had none, and this case said "no require at all")
  const source = fs.readFileSync(path.join(__dirname, '../../src/editor/reviewHighlightsCore.js'), 'utf8');
  expect(source).not.toMatch(/require\(\s*['"]@(?:codemirror|lezer)\//);
  expect(source.match(/require\(([^)]*)\)/g)).toEqual(["require('./markDrawing.js')"]);
  expect(source).not.toMatch(/\bimport\b[^\n]*from/);
});

// F4: a finding's range may hold the space after its sentence (a model's quotation, a selection). The line is
// drawn from the first to the last character that is not white space; the range itself stays whole.
describe('the underline is drawn on the words, the range stays whole', () => {
  const from = DOC.indexOf(' ja Liisa');
  const WIDE = { id: 'f-9', from, to: from + ' ja Liisa seisoi '.length };

  test('white space at the ends of a finding is not underlined', () => {
    const editor = mount();
    show(editor, { items: [WIDE, ITEMS[1]], activeId: 'f-9' });
    expect(marked(editor)).toEqual([['f-9', 'ja Liisa seisoi'], ['f-2', 'vihaisesti']]);
    // The class of the selected finding and the severity stay on the drawn mark
    expect(marks(editor)[0].classList.contains('cm-faust-finding-active')).toBe(true);
    show(editor, { items: [{ ...WIDE, severity: 'note' }], activeId: null });
    expect(marks(editor).map(element => [element.textContent, element.getAttribute('data-severity')])).toEqual([['ja Liisa seisoi', 'note']]);
    // What the field keeps and gives out is the finding's own range
    expect(findingRanges(editor.state)).toEqual([WIDE]);
    expect(editor.state.sliceDoc(WIDE.from, WIDE.to)).toBe(' ja Liisa seisoi ');
  });

  test('the cut follows the text: when the last word of the range is deleted, the line ends at the word before it', () => {
    const editor = mount();
    show(editor, { items: [WIDE], activeId: null });
    const word = DOC.indexOf('seisoi');
    editor.dispatch({ changes: { from: word, to: word + 'seisoi'.length } });
    expect(editor.state.sliceDoc(findingRanges(editor.state)[0].from, findingRanges(editor.state)[0].to)).toBe(' ja Liisa  ');
    expect(marked(editor)).toEqual([['f-9', 'ja Liisa']]);
    // Typed at the edge of the range the text stays outside, as before
    type(editor, WIDE.from, 'XX');
    expect(marked(editor)).toEqual([['f-9', 'ja Liisa']]);
  });

  test('a finding of white space only keeps its mark (two spaces in a row are the finding)', () => {
    const editor = mount();
    type(editor, DOC.indexOf(' harmaa'), ' ');
    const at = editor.state.doc.toString().indexOf('  harmaa');
    show(editor, { items: [{ id: 'f-10', from: at, to: at + 2 }], activeId: null });
    expect(marked(editor)).toEqual([['f-10', '  ']]);
  });

  test('a finding without white space at its ends is drawn on its own range, and every mark asks for wrap gaps', () => {
    const editor = mount();
    show(editor, { items: ITEMS, activeId: null });
    expect(marked(editor)).toEqual([['f-1', 'jotenkin'], ['f-2', 'vihaisesti'], ['f-3', 'tavallaan']]);
    const flags = [];
    const cursor = editor.state.field(findingField).iter();
    while (cursor.value) { flags.push(cursor.value.spec.trimAtWrap); cursor.next(); }
    expect(flags).toEqual([true, true, true]);
  });
});

test('the finding marks take their colours from the design tokens only', () => {
  // Lead decision: no new hard-coded colours; the tokens are defined in styles/faust-tokens.css
  const source = fs.readFileSync(path.join(__dirname, '../../src/editor/reviewHighlightsCore.js'), 'utf8');
  expect(source).not.toMatch(/rgba?\(|hsla?\(|#[0-9a-f]{3,8}\b/i);
  expect(source).toMatch(/var\(--finding-line\)/);
  expect(source).toMatch(/var\(--finding-active-bg\)/);
});

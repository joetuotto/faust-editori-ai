// jsdom environment (the Jest default): the kit is run with a real EditorView.
// CodeMirror is required here only; the module under test never loads it.
//
// F4: the editor wraps with break-spaces, so the space at a soft wrap is a box at the end of the upper line
// and a mark's underline ran on under it, past the last word. wrapGapsCore.js measures where the marked text
// turns and puts a mark of the lowest precedence on that space; the stylesheet takes the line off inside it.
// jsdom has no layout: each test says where the characters stand (coordsAtPos of the view).
const fs = require('fs');
const path = require('path');
const state = require('@codemirror/state');
const view = require('@codemirror/view');
const { createWrapGapKit, GAP_CLASS } = require('../../src/editor/wrapGapsCore');
const { createReviewHighlightsKit } = require('../../src/editor/reviewHighlightsCore');

const cm = { ...state, ...view };
const kit = createWrapGapKit(cm);
const { wrapGaps, setWrapGaps, wrapGapField, wrapGapRanges, measureWrapGaps } = kit;
const review = createReviewHighlightsKit(cm);

const DOC = [
  'Hän oli hyvin väsynyt ja käveli hotellille, jonka ikkunat olivat samat kuin ennen: korkeat, kapeat ja pimeät.',
  'Aino Lehto nosti laukkunsa hyllyltä.'
].join('\n');

// The visual lines of the document, as a layout would wrap them: the space at a wrap ends the upper line
const WRAPPED = ['Hän oli hyvin väsynyt ja käveli hotellille, jonka ', 'ikkunat olivat samat kuin ennen: korkeat, ', 'kapeat ja pimeät.\n', 'Aino ', 'Lehto nosti laukkunsa hyllyltä.'];
const UNWRAPPED = [DOC.split('\n')[0] + '\n', DOC.split('\n')[1]];

function layoutOf(lines) {
  const lineOf = [];
  lines.forEach((line, index) => { for (let i = 0; i < line.length; i++) lineOf.push(index); });
  // coordsAtPos(pos, -1): the character before pos
  return (pos, side) => {
    const index = side < 0 ? pos - 1 : pos;
    if (index < 0 || index >= lineOf.length) return null;
    const top = lineOf[index] * 32;
    return { left: 0, right: 0, top, bottom: top + 25 };
  };
}

const rangeOf = (phrase) => ({ from: DOC.indexOf(phrase), to: DOC.indexOf(phrase) + phrase.length });
const SENTENCE = { id: 'f-1', ...rangeOf(DOC.split('\n')[0]) };
const NAME = { id: 'f-2', ...rangeOf('Aino Lehto') };
const GAPS = [rangeOf(' ikkunat'), rangeOf(' kapeat'), rangeOf(' Lehto')].map(range => ({ from: range.from, to: range.from + 1 }));

// A mark of another feature that does not ask for gaps (the search hits)
const plainMarks = state.StateField.define({
  create: () => view.Decoration.set([view.Decoration.mark({ class: 'cm-other' }).range(SENTENCE.from, SENTENCE.to)]),
  update: (value, tr) => value.map(tr.changes),
  provide: field => view.EditorView.decorations.from(field)
});

const views = [];
const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
// A measurement (the next animation frame), then the transaction it leads to (right after it)
const settled = async () => { await frame(); await Promise.resolve(); await frame(); await Promise.resolve(); };

function mount({ lines = WRAPPED, extensions = [review.reviewHighlights()], parent = document.body } = {}) {
  const updates = [];
  const editor = new view.EditorView({
    doc: DOC,
    extensions: [...extensions, wrapGaps(), view.EditorView.updateListener.of(update => updates.push(update))],
    parent
  });
  editor.layout = lines;
  editor.coordsAtPos = (pos, side) => layoutOf(editor.layout)(pos, side);
  views.push(editor);
  return { editor, updates };
}

const show = (editor, items) => editor.dispatch({ effects: review.setFindingHighlights.of({ items, activeId: null }) });
const gapElements = (editor) => Array.from(editor.contentDOM.querySelectorAll(`.${GAP_CLASS}`));
const transactions = (updates) => updates.flatMap(update => update.transactions);

afterEach(() => {
  while (views.length > 0) views.pop().destroy();
  document.body.innerHTML = '';
  document.body.removeAttribute('data-theme');
});

test('the space at each soft wrap inside a mark gets the gap mark, outermost, and the mark keeps its range', async () => {
  const { editor } = mount();
  show(editor, [SENTENCE, NAME]);
  expect(wrapGapRanges(editor.state)).toEqual([]);
  await settled();

  expect(wrapGapRanges(editor.state)).toEqual(GAPS);
  const gaps = gapElements(editor);
  expect(gaps.map(element => element.textContent)).toEqual([' ', ' ', ' ']);
  // The gap is the child of the line; the finding's piece over the space lies inside it
  for (const gap of gaps) {
    expect(gap.parentElement.classList.contains('cm-line')).toBe(true);
    expect(gap.firstElementChild.classList.contains('cm-faust-finding')).toBe(true);
  }
  expect(gaps[0].firstElementChild.getAttribute('data-finding-id')).toBe('f-1');
  expect(gaps[2].firstElementChild.getAttribute('data-finding-id')).toBe('f-2');
  // Outside the gaps the finding is drawn as before: the words of each visual line
  const drawn = Array.from(editor.contentDOM.querySelectorAll('.cm-faust-finding')).filter(element => !element.closest(`.${GAP_CLASS}`));
  expect(drawn.map(element => element.textContent)).toEqual([
    'Hän oli hyvin väsynyt ja käveli hotellille, jonka', 'ikkunat olivat samat kuin ennen: korkeat,', 'kapeat ja pimeät.', 'Aino', 'Lehto'
  ]);
  expect(review.findingRanges(editor.state)).toEqual([SENTENCE, NAME]);
  expect(editor.state.doc.toString()).toBe(DOC);
});

test('the gaps are set once: an effects-only transaction, and the measurement after it changes nothing', async () => {
  const { editor, updates } = mount();
  show(editor, [SENTENCE]);
  await settled();
  const own = transactions(updates).filter(tr => tr.effects.some(effect => effect.is(setWrapGaps)));
  expect(own).toHaveLength(1);
  expect(own[0].docChanged).toBe(false);
  expect(own[0].selection).toBeUndefined();
  expect(updates.some(update => update.docChanged)).toBe(false);

  const before = transactions(updates).length;
  await settled();
  await settled();
  expect(transactions(updates).length).toBe(before);
});

test('a mark on one visual line, and a mark that does not ask for gaps, get none', async () => {
  const { editor, updates } = mount({ lines: UNWRAPPED });
  show(editor, [SENTENCE, NAME]);
  await settled();
  expect(wrapGapRanges(editor.state)).toEqual([]);
  expect(transactions(updates).filter(tr => tr.effects.some(effect => effect.is(setWrapGaps)))).toEqual([]);

  // The same wrapped layout, but only a mark of another feature over the sentence
  const other = mount({ extensions: [plainMarks] });
  await settled();
  expect(other.editor.contentDOM.querySelector('.cm-other')).not.toBeNull();
  expect(wrapGapRanges(other.editor.state)).toEqual([]);
  expect(gapElements(other.editor)).toEqual([]);
});

test('the gaps follow the marks: no findings, no gaps', async () => {
  const { editor } = mount();
  show(editor, [SENTENCE]);
  await settled();
  expect(wrapGapRanges(editor.state)).toHaveLength(2);
  editor.dispatch({ effects: review.setFindingHighlights.of(null) });
  await settled();
  expect(wrapGapRanges(editor.state)).toEqual([]);
  expect(gapElements(editor)).toEqual([]);
});

test('typing moves the gaps with the text at once and the measurement after it puts them where the lines turn now', async () => {
  const { editor } = mount();
  show(editor, [SENTENCE]);
  await settled();
  // Four letters typed at the start of the paragraph: every gap moves with its space
  editor.layout = ['Niin ' + WRAPPED[0], ...WRAPPED.slice(1)];
  editor.dispatch({ changes: { from: 0, insert: 'Niin ' } });
  expect(wrapGapRanges(editor.state)).toEqual(GAPS.slice(0, 2).map(gap => ({ from: gap.from + 5, to: gap.to + 5 })));
  // The longer first line now turns one word earlier
  editor.layout = ['Niin Hän oli hyvin väsynyt ja käveli hotellille, ', 'jonka ikkunat olivat samat kuin ennen: korkeat, ', 'kapeat ja pimeät.\n', 'Aino ', 'Lehto nosti laukkunsa hyllyltä.'];
  editor.dispatch({ changes: { from: editor.state.doc.length, insert: '!' } });
  await settled();
  const text = editor.state.doc.toString();
  expect(wrapGapRanges(editor.state)).toEqual([text.indexOf(' jonka'), text.indexOf(' kapeat')].map(from => ({ from, to: from + 1 })));
});

test('a change of an ancestor\'s class, style or theme measures again (the lines can turn without the editor changing size)', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const { editor } = mount({ parent: host });
  show(editor, [SENTENCE]);
  await settled();
  expect(wrapGapRanges(editor.state)).toHaveLength(2);

  // A heavier face: the first line holds one word less. Nothing was dispatched and the editor's box is the same
  editor.layout = ['Hän oli hyvin väsynyt ja käveli hotellille, ', 'jonka ikkunat olivat samat kuin ennen: korkeat, ', 'kapeat ja pimeät.\n', 'Aino ', 'Lehto nosti laukkunsa hyllyltä.'];
  document.body.setAttribute('data-theme', 'DEIS');
  await settled();
  expect(wrapGapRanges(editor.state)).toEqual([DOC.indexOf(' jonka'), DOC.indexOf(' kapeat')].map(from => ({ from, to: from + 1 })));

  editor.layout = UNWRAPPED;
  host.style.setProperty('--ms-size', '14px');
  await settled();
  expect(wrapGapRanges(editor.state)).toEqual([]);
});

test('a layout that never agrees with itself is given up after three answers, until something else changes', async () => {
  const { editor, updates } = mount();
  // Every measurement sees the other of two layouts (a measurement starts by asking for the first character)
  let flip = false;
  let reads = 0;
  editor.coordsAtPos = (pos, side) => {
    if (pos === SENTENCE.from + 1 && side < 0) { reads += 1; flip = !flip; }
    return layoutOf(flip ? WRAPPED : ['Hän oli hyvin ', DOC.slice(14)])(pos, side);
  };
  show(editor, [SENTENCE]);
  for (let i = 0; i < 8; i++) await settled();
  const own = () => transactions(updates).filter(tr => tr.effects.some(effect => effect.is(setWrapGaps))).length;
  expect(own()).toBe(3);
  expect(reads).toBeGreaterThanOrEqual(3);

  const before = reads;
  for (let i = 0; i < 4; i++) await settled();
  expect(reads).toBe(before);

  // The author types: the count starts again (the next measurement is made to differ from the gaps in place)
  flip = !flip;
  editor.dispatch({ changes: { from: editor.state.doc.length, insert: '.' } });
  for (let i = 0; i < 8; i++) await settled();
  expect(own()).toBe(6);
});

test('measureWrapGaps merges the gaps of marks over the same words and ignores what is not drawn', () => {
  const { editor } = mount();
  // A finding over the name and a second one over the whole second line
  show(editor, [NAME, { id: 'f-3', ...rangeOf('Aino Lehto nosti laukkunsa hyllyltä.') }]);
  expect(measureWrapGaps(editor)).toEqual([GAPS[2]]);
  editor.coordsAtPos = () => null;
  expect(measureWrapGaps(editor)).toEqual([]);
});

test('setWrapGaps takes only ranges inside the document, and a destroyed editor is left alone', async () => {
  const { editor } = mount({ lines: UNWRAPPED });
  editor.dispatch({ effects: setWrapGaps.of([{ from: 3, to: 4 }, { from: 9, to: 9 }, { from: -1, to: 2 }, { from: 5, to: 9999 }, null, { from: 'x', to: 3 }]) });
  expect(wrapGapRanges(editor.state)).toEqual([{ from: 3, to: 4 }]);
  editor.dispatch({ effects: setWrapGaps.of(null) });
  expect(wrapGapRanges(editor.state)).toEqual([]);
  expect(editor.state.field(wrapGapField).size).toBe(0);

  const gone = mount();
  show(gone.editor, [SENTENCE]);
  gone.editor.destroy();
  await settled();
  expect(wrapGapRanges(gone.editor.state)).toEqual([]);
});

test('the kit has its five documented members and the core never loads CodeMirror itself', () => {
  expect(Object.keys(kit).sort()).toEqual(['measureWrapGaps', 'setWrapGaps', 'wrapGapField', 'wrapGapRanges', 'wrapGaps']);
  expect(wrapGaps()).toHaveLength(2);
  expect(wrapGaps()[0]).toBe(wrapGapField);
  expect(wrapGapRanges(state.EditorState.create({ doc: DOC }))).toEqual([]);

  const source = fs.readFileSync(path.join(__dirname, '../../src/editor/wrapGapsCore.js'), 'utf8');
  expect(source).not.toMatch(/require\(\s*['"]@(?:codemirror|lezer)\//);
  expect(source.match(/require\(([^)]*)\)/g)).toEqual(["require('./markDrawing.js')"]);
  expect(source).not.toMatch(/^\s*import\s/m);
});

test('the stylesheet takes the line and the ground off inside a gap, for every mark that asks for gaps', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../styles/faust-components.css'), 'utf8');
  const rule = css.split('\n').find(line => line.includes(`.${GAP_CLASS} :is(`));
  expect(rule).toBeDefined();
  expect(rule).toContain('text-decoration-line: none;');
  expect(rule).toContain('border-bottom-color: transparent;');
  expect(rule).toContain('background-color: transparent;');
  // The classes of the marks that carry trimAtWrap in the three cores
  for (const name of ['cm-faust-finding', 'cm-faust-sugg-del', 'cm-faust-sugg-orig', 'cm-faust-avoid', 'cm-faust-mention']) {
    expect(rule).toContain(`.${name}`);
  }
  const flagged = ['suggestionsCore.js', 'reviewHighlightsCore.js', 'termHighlightCore.js']
    .map(file => (fs.readFileSync(path.join(__dirname, '../../src/editor', file), 'utf8').match(/trimAtWrap: true/g) || []).length);
  expect(flagged).toEqual([1, 1, 2]);
});

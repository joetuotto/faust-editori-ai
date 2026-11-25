/**
 * @jest-environment node
 */
// Margin marks follow the editor's own changes (F1). FaustEditor hands onChange the change of an update as
// CodeMirror made it: update.changes.iterChanges, each range in offsets of the text before, the inserted Text
// as a string. This file builds that list from real ChangeSets and checks that the marks land where
// CodeMirror itself maps their ends.
const { ChangeSet, EditorState } = require('@codemirror/state');
const M = require('../../src/editor/annotationMapping');

// The list exactly as FaustEditor's update listener builds it: range by range (`individual`), because with
// touching ranges joined a mark inside the joined range would lose its words (the last test shows it)
function listOf(changeSet, individual = true) {
  const changes = [];
  changeSet.iterChanges((fromA, toA, fromB, toB, inserted) => {
    changes.push({ from: fromA, to: toA, insert: inserted.toString() });
  }, individual);
  return changes;
}

const TEXT = 'Aino astui laiturille.\nAsemalla ei ollut ketään.\n\nHän nosti laukkunsa ja lähti kävelemään kohti kylää.';
const markOn = (words, id) => ({ id, type: 'user_note', position: TEXT.indexOf(words), length: words.length, content: 'Huomautus' });

function randomSource(seed) {
  let state = seed >>> 0;
  return (limit) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * limit);
  };
}

test('a typed character, a paste with line breaks and a deletion arrive as lists that fit the two texts', () => {
  const state = EditorState.create({ doc: TEXT });
  const cases = [
    state.changes({ from: TEXT.indexOf('Asemalla'), insert: 'O' }),
    state.changes({ from: TEXT.indexOf('Asemalla'), insert: 'Oli jo ilta.\n\nTuuli yltyi.\n' }),
    state.changes({ from: 0, to: TEXT.indexOf('Asemalla') }),
    state.changes([{ from: 0, to: 4, insert: 'Aino Lehto' }, { from: TEXT.indexOf('ja lähti '), to: TEXT.indexOf('kävelemään') }])
  ];
  for (const set of cases) {
    const changes = listOf(set);
    const after = set.apply(state.doc).toString();
    expect(M.changesFit(changes, TEXT.length, after.length)).toBe(true);
    const marks = [markOn('ketään', 'a'), markOn('laukkunsa', 'b')];
    const moved = M.mapAnnotations(marks, changes);
    expect(moved.map(m => after.slice(m.position, m.position + m.length))).toEqual(['ketään', 'laukkunsa']);
  }
});

test('two transactions of one update arrive composed, in offsets of the text before both', () => {
  const state = EditorState.create({ doc: TEXT });
  const first = state.changes({ from: 0, insert: 'Yö. ' });
  const second = ChangeSet.of([{ from: first.newLength, insert: ' Loppu.' }], first.newLength);
  const both = first.compose(second);
  const changes = listOf(both);
  expect(changes).toEqual([{ from: 0, to: 0, insert: 'Yö. ' }, { from: TEXT.length, to: TEXT.length, insert: ' Loppu.' }]);
  const after = both.apply(state.doc).toString();
  const [moved] = M.mapAnnotations([markOn('laukkunsa', 'b')], changes);
  expect(after.slice(moved.position, moved.position + moved.length)).toBe('laukkunsa');
});

test('the marks land where CodeMirror maps their ends, on 400 random change sets', () => {
  const random = randomSource(20261125);
  let sets = 0;
  let checked = 0;
  while (sets < 400) {
    const length = 8 + random(40);
    const specs = [];
    let pos = random(6);
    while (pos <= length && specs.length < 4) {
      const to = Math.min(length, pos + random(5));
      const insert = 'xyzå\n'.slice(0, random(6));
      if (to > pos || insert) specs.push({ from: pos, to, insert });
      pos = to + random(5) + (to === pos && !insert ? 1 : 0);
    }
    if (!specs.length) continue;
    sets++;

    const set = ChangeSet.of(specs, length);
    const changes = listOf(set);
    expect(M.changesFit(changes, length, set.newLength)).toBe(true);

    const marks = [];
    for (let i = 0; i < 6; i++) {
      const position = random(length + 1);
      marks.push({ id: 'm' + i, position, length: i === 0 ? 0 : Math.min(length - position, random(8)) });
    }
    const moved = M.mapAnnotations(marks, changes);
    marks.forEach((mark, i) => {
      const start = set.mapPos(mark.position, 1);
      const end = Math.max(start, set.mapPos(mark.position + mark.length, -1));
      expect({ position: moved[i].position, length: moved[i].length }).toEqual({ position: start, length: end - start });
      checked++;
    });
  }
  expect(checked).toBe(2400);
});

test('two accepted suggestions side by side stay two ranges: a mark on the second keeps its words', () => {
  // "Hän nosti" → "Hän nosti hitaasti", and right behind it "laukkunsa" → "reppunsa"
  const at = TEXT.indexOf('laukkunsa');
  const set = ChangeSet.of([{ from: at, insert: 'hitaasti ' }, { from: at, to: at + 9, insert: 'reppunsa' }], TEXT.length);
  const after = set.apply(EditorState.create({ doc: TEXT }).doc).toString();
  const marks = [markOn('laukkunsa ja lähti', 'a')];

  const [exact] = M.mapAnnotations(marks, listOf(set));
  expect(after.slice(exact.position, exact.position + exact.length)).toBe('reppunsa ja lähti');

  // Joined by iterChanges' default they are one replacement that starts at the mark's start
  expect(listOf(set, false)).toHaveLength(1);
  const [joined] = M.mapAnnotations(marks, listOf(set, false));
  expect(after.slice(joined.position, joined.position + joined.length)).toBe('hitaasti reppunsa ja lähti');

  // FaustEditor asks for the ranges one by one
  const fs = require('fs');
  const path = require('path');
  const editor = fs.readFileSync(path.join(__dirname, '../../src/components/FaustEditor.js'), 'utf8');
  expect(editor).toMatch(/update\.changes\.iterChanges\(\(fromA, toA, fromB, toB, inserted\) => \{\s*changes\.push\(\{ from: fromA, to: toA, insert: inserted\.toString\(\) \}\);\s*\}, true\);/);
});

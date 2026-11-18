/** @jest-environment node */
// One source for the note and underline patterns (contracts.md rule 9, stage I-03).
//
// The editor marks a [TODO: …] note and a <u>…</u> underline with two MatchDecorators that it
// builds from TODO_PATTERN_SOURCE and UNDERLINE_PATTERN_SOURCE of src/editor/textTools.js.
// Several pure modules carry a copy of their own (they were written before the export existed).
// Jest cannot load FaustEditor.js (an ES module), so the reference here is what the two
// exports match, built exactly as the editor builds them, and every copy is held against it on
// the same six strings. A last case reads FaustEditor.js as text: it must build its regexes from
// the exports and hold no note or underline literal of its own.

const fs = require('fs');
const path = require('path');

const { TODO_PATTERN_SOURCE, UNDERLINE_PATTERN_SOURCE } = require('../../src/editor/textTools');
const { tokenize } = require('../../src/editor/wordDiff');
const { maskSpans } = require('../../src/services/ai/maskSpans');
const { todoRanges } = require('../../src/editor/termMatch');
const { plainView } = require('../../src/editor/plainView');
const { protectedRanges } = require('../../src/editor/typography.fi');
const { stripTodos } = require('../../src/services/ai/contextBuilder');
const { PROTECTED_PATTERN } = require('../../src/editor/pasteEdits');

const STRINGS = [
  '[TODO: x]',
  'a [TODO: tarkista "lainaus"] b',
  '[TODO: auki',
  '[TODO: a\nb]',
  '<u>sana</u>',
  '[muu: x]'
];

// What the editor marks: the same objects FaustEditor.js builds (new RegExp(source, 'g'))
const matchesOf = (source, text) => Array.from(text.matchAll(new RegExp(source, 'g')))
  .map(match => ({ from: match.index, to: match.index + match[0].length, text: match[0] }));
const notes = (text) => matchesOf(TODO_PATTERN_SOURCE, text);
const underlines = (text) => matchesOf(UNDERLINE_PATTERN_SOURCE, text);
// The editor dims the two tags of an underline (from..from+3 and to-4..to) and underlines the rest
const tagsOf = (text) => underlines(text).flatMap(u => [{ from: u.from, to: u.from + 3 }, { from: u.to - 4, to: u.to }]);
const span = ({ from, to }) => [from, to];

describe('the reference', () => {
  test('the two exports match what the editor marked before they existed', () => {
    expect(String(new RegExp(TODO_PATTERN_SOURCE, 'g'))).toBe(String(/\[TODO:[^\]\n]*\]/g));
    expect(String(new RegExp(UNDERLINE_PATTERN_SOURCE, 'g'))).toBe(String(/<u>([^<\n]+)<\/u>/g));
  });

  test('on the six strings: two closed notes, one underline, nothing else', () => {
    expect(STRINGS.map(text => notes(text).map(n => n.text))).toEqual([
      ['[TODO: x]'], ['[TODO: tarkista "lainaus"]'], [], [], [], []
    ]);
    expect(STRINGS.map(text => underlines(text).map(u => u.text))).toEqual([[], [], [], [], ['<u>sana</u>'], []]);
  });
});

describe('every copy agrees with the reference on what is a note', () => {
  test.each(STRINGS)('wordDiff.tokenize keeps each note as one atom: %j', (text) => {
    const atoms = tokenize(text).filter(token => token.type === 'atom').map(token => token.text);
    expect(atoms).toEqual(notes(text).map(n => n.text));
  });

  test.each(STRINGS)('maskSpans masks each note as one todo span and each underline tag as a tag: %j', (text) => {
    const { spans } = maskSpans(text);
    expect(spans.filter(s => s.kind === 'todo').map(span)).toEqual(notes(text).map(span));
    expect(spans.filter(s => s.kind === 'tag').map(span)).toEqual(tagsOf(text).map(span));
  });

  test.each(STRINGS)('termMatch.todoRanges finds the same notes: %j', (text) => {
    expect(todoRanges(text).map(r => [r.start, r.end])).toEqual(notes(text).map(span));
  });

  test.each(STRINGS)('plainView removes each note (with at most one neighbouring space) and the underline tags: %j', (text) => {
    const { removed } = plainView(text);
    const removedNotes = removed.filter(r => r.kind === 'todo');
    const reference = notes(text);
    expect(removedNotes).toHaveLength(reference.length);
    removedNotes.forEach((range, index) => {
      const note = reference[index];
      // The range covers the note and takes along nothing but one space next to it
      expect(range.from).toBeLessThanOrEqual(note.from);
      expect(range.to).toBeGreaterThanOrEqual(note.to);
      const extra = text.slice(range.from, note.from) + text.slice(note.to, range.to);
      expect(extra).toMatch(/^[ \t ]?$/);
    });
    expect(removed.filter(r => r.kind === 'tag').map(span)).toEqual(tagsOf(text).map(span));
  });

  test.each(STRINGS)('typography.fi.protectedRanges protects the same closed notes and tags: %j', (text) => {
    const ranges = protectedRanges(text);
    const tags = tagsOf(text).map(span);
    const noteRanges = ranges.filter(range => !tags.some(tag => tag[0] === range[0] && tag[1] === range[1]));
    expect(ranges.filter(range => tags.some(tag => tag[0] === range[0] && tag[1] === range[1]))).toEqual(tags);
    if (text === '[TODO: auki') {
      // Not a note for the editor; smart typing still leaves a note that is being written alone,
      // up to the end of its line (typography.fi.js, TODO_OPEN). The editor marks nothing here.
      expect(notes(text)).toEqual([]);
      expect(noteRanges).toEqual([[0, text.length]]);
    } else {
      expect(noteRanges).toEqual(notes(text).map(span));
    }
  });

  test.each(STRINGS)('contextBuilder.stripTodos removes exactly the notes: %j', (text) => {
    const stripped = stripTodos(text);
    if (notes(text).length === 0) {
      expect(stripped).toBe(text);
    } else {
      expect(stripped).not.toContain('[TODO:');
      // Only the notes and the spaces around them go
      const kept = (value) => value.replace(/\s+/g, '');
      expect(kept(stripped)).toBe(kept(text.replace(new RegExp(TODO_PATTERN_SOURCE, 'g'), '')));
    }
  });

  test.each(STRINGS)('pasteEdits.PROTECTED_PATTERN protects the same notes and the underline tags: %j', (text) => {
    const found = Array.from(text.matchAll(new RegExp(PROTECTED_PATTERN.source, 'g')))
      .map(match => ({ from: match.index, to: match.index + match[0].length, text: match[0] }));
    expect(found.filter(f => f.text.startsWith('[TODO:')).map(span)).toEqual(notes(text).map(span));
    expect(found.filter(f => !f.text.startsWith('[TODO:')).map(span)).toEqual(tagsOf(text).map(span));
  });
});

test('FaustEditor.js builds its two decorations from the exports and has no note or underline literal of its own', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'components', 'FaustEditor.js'), 'utf8');
  expect(source).toContain('new RegExp(TODO_PATTERN_SOURCE');
  expect(source).toContain('new RegExp(UNDERLINE_PATTERN_SOURCE');
  // A regex literal or a string-built pattern for a note holds \[TODO: ; one for the underline <\/u>
  expect(source).not.toContain('\\[TODO:');
  expect(source).not.toContain('<\\/u>');
});

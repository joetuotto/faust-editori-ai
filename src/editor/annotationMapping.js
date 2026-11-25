/**
 * Margin marks follow the text
 *
 * A margin mark (merkintä, src/utils/annotationTypes.js) says where it stands with `position` and
 * `length`: offsets into its chapter's text. This file owns the one rule by which those offsets
 * follow a change of that text, so a mark stays on the text it was placed on.
 *
 * The rule, for a mark [position, position + length):
 *  - text put in before the mark shifts it;
 *  - text typed exactly at its start goes before it (the mark moves right with its text);
 *  - text typed exactly at its end is not part of it;
 *  - a point mark (length 0) moves with the text that follows it;
 *  - a mark is never dropped: when all of its text is deleted it stays as a point at the place of
 *    the deletion. Text that replaces the mark's exact range takes its place under the mark.
 * The arithmetic is the position mapper of the suggestion layer (makeMapper, mapRange and
 * planRebase of suggestionModel.js, CodeMirror's ChangeDesc semantics); there is no second one.
 *
 * A change is known in one of two ways:
 *  - precisely, as the change list CodeMirror's ChangeSet gives ([{ from, to, insert }], sorted, in
 *    offsets of the old text): everything the editor itself does, and writers that know their
 *    ranges (Korvaa kaikki);
 *  - as the text before and after: the one range between their common start and end. Only when a
 *    mark lies inside that range is the range compared word by word, so a mark inside a passage
 *    that was reformatted or partly rewritten stays on its words.
 *
 * followEdits is where the rule is applied: the app's project setter passes every update of the
 * project through it (app.js), so no path that writes a chapter's text can leave the marks behind.
 *
 * Pure functions, no DOM, nothing from @codemirror (test/editor/annotationMapping.test.js).
 */

const { makeMapper, mapRange, planRebase } = require('./suggestionModel.js');
const { wordDiff } = require('./wordDiff.js');

// The finest word diff, as the suggestion layer uses it to keep its ranges through a text change
const rawDiff = (a, b) => wordDiff(a, b, { raw: true });

const textOf = (value) => (typeof value === 'string' ? value : '');
const lengthOf = (mark) => (Number.isFinite(mark.length) && mark.length > 0 ? mark.length : 0);
const hasPlace = (mark) => !!mark && Number.isFinite(mark.position);

/** The mark where the mapper puts it; the same object when it does not move. */
function movedMark(mark, mapPos) {
  if (!hasPlace(mark)) return mark;
  const length = lengthOf(mark);
  const range = mapRange(mark.position, mark.position + length, mapPos);
  if (range.from === mark.position && range.to - range.from === length) return mark;
  return { ...mark, position: range.from, length: range.to - range.from };
}

/** The mark at a place noted earlier ({ position, length }); the same object when it stands there. */
function placedMark(mark, place) {
  const length = lengthOf(place);
  if (mark.position === place.position && lengthOf(mark) === length) return mark;
  return { ...mark, position: place.position, length };
}

// A list with each mark replaced by move(mark); the same array when no mark moved
function eachMark(annotations, move) {
  if (!Array.isArray(annotations)) return annotations;
  let moved = null;
  annotations.forEach((mark, index) => {
    const next = move(mark);
    if (next === mark) return;
    if (!moved) moved = annotations.slice();
    moved[index] = next;
  });
  return moved || annotations;
}

/**
 * Is this the change list of a text of oldLength that gives a text of newLength? The list comes
 * from the editor, the lengths from the project: a list made for another text is not used.
 * @param {Array<{from: number, to: number, insert: string}>} changes
 */
function changesFit(changes, oldLength, newLength) {
  if (!Array.isArray(changes) || changes.length === 0) return false;
  let pos = 0;
  let delta = 0;
  for (const change of changes) {
    if (!change || !Number.isInteger(change.from) || !Number.isInteger(change.to) || typeof change.insert !== 'string') return false;
    if (change.from < pos || change.to < change.from || change.to > oldLength) return false;
    delta += change.insert.length - (change.to - change.from);
    pos = change.to;
  }
  return oldLength + delta === newLength;
}

/**
 * The marks after a change that is known precisely.
 * @param {object[]} annotations marks of one chapter (not changed)
 * @param {Array<{from: number, to: number, insert: string}>} changes sorted, in old-text offsets
 * @returns {object[]} the same array when no mark moved
 */
function mapAnnotations(annotations, changes) {
  if (!Array.isArray(annotations) || annotations.length === 0 || !Array.isArray(changes) || changes.length === 0) return annotations;
  const { mapPos } = makeMapper(changes);
  return eachMark(annotations, mark => movedMark(mark, mapPos));
}

// How newText is reached from oldText, for these marks: one range, read word by word where a mark lies in it
function mapperBetween(marks, oldText, newText) {
  const touched = (map) => marks.some(mark => hasPlace(mark) && map.touchesRange(mark.position, mark.position + lengthOf(mark)));
  return planRebase(oldText, newText, rawDiff, touched).looseMap;
}

/**
 * The marks after a change of which only the text before and after is known.
 * @returns {object[]} the same array when no mark moved
 */
function mapAnnotationsBetween(annotations, oldText, newText) {
  const from = textOf(oldText);
  const to = textOf(newText);
  if (!Array.isArray(annotations) || annotations.length === 0 || from === to) return annotations;
  const { mapPos } = mapperBetween(annotations, from, to);
  return eachMark(annotations, mark => movedMark(mark, mapPos));
}

// The marks of one chapter after an update that changed its text and left the marks as they were
function followChapter(before, chapter, edit) {
  const marks = chapter.annotations;
  // No marks; or the update brought its own (a tilannekuva, an added, edited or removed mark): as they are
  if (!Array.isArray(marks) || marks.length === 0 || marks !== before.annotations) return chapter;
  const from = textOf(before.content);
  const to = textOf(chapter.content);
  if (from === to) return chapter;

  // An undo or a redo puts back a text the marks have stood on: those that were there return to their places
  const earlier = edit && typeof edit.restore === 'function' ? edit.restore() : null;
  const places = new Map();
  if (Array.isArray(earlier)) {
    for (const mark of earlier) if (hasPlace(mark) && mark.id != null) places.set(mark.id, mark);
  }
  const placed = (mark) => !!mark && mark.id != null && places.has(mark.id);

  let mapPos = null;
  if (marks.some(mark => !placed(mark))) {
    mapPos = edit && changesFit(edit.changes, from.length, to.length)
      ? makeMapper(edit.changes).mapPos
      : mapperBetween(marks.filter(mark => !placed(mark)), from, to).mapPos;
  }

  const moved = eachMark(marks, mark => (placed(mark) ? placedMark(mark, places.get(mark.id)) : movedMark(mark, mapPos)));
  return moved === marks ? chapter : { ...chapter, annotations: moved };
}

/**
 * The project after an update, its margin marks moved onto the text the update wrote. Where the
 * update changed a chapter's `content` and left its `annotations` array as it was, the marks are
 * mapped; a chapter whose update set its own `annotations` (a restored tilannekuva, a new mark),
 * a new chapter (an import) and a chapter whose text did not change are returned as they are.
 *
 * @param {object} prev the project before the update
 * @param {object} next the project the update made (not changed; returned as it is when no mark moved)
 * @param {{ chapterId: string, changes?: Array<{from: number, to: number, insert: string}>,
 *           restore?: () => (object[] | null) }} [edit] what the writer knows about its change of
 *   one chapter's text: the precise change list (used when it fits the two texts), and for an
 *   undo or a redo the chapter's marks as they stood on the text being put back
 * @returns {object}
 */
function followEdits(prev, next, edit) {
  // This runs inside the state update that writes the text: whatever a stored mark looks like, the
  // write itself must go through
  try {
    return followed(prev, next, edit);
  } catch (error) {
    console.error('[Annotations] The margin marks could not follow a change of the text:', error);
    return next;
  }
}

function followed(prev, next, edit) {
  if (!prev || !next || prev === next) return next;
  const before = prev.structure;
  const after = next.structure;
  if (before === after || !Array.isArray(before) || !Array.isArray(after)) return next;

  let byId = null;
  let structure = null;
  for (let index = 0; index < after.length; index++) {
    const chapter = after[index];
    let old = before[index];
    if (!chapter || old === chapter) continue;
    if (!old || old.id !== chapter.id) {
      // The chapters were reordered, added or removed: find this one by its id
      if (!byId) byId = new Map(before.filter(Boolean).map(item => [item.id, item]));
      old = byId.get(chapter.id);
      if (!old || old === chapter) continue;
    }
    const followed = followChapter(old, chapter, edit && edit.chapterId === chapter.id ? edit : null);
    if (followed === chapter) continue;
    if (!structure) structure = after.slice();
    structure[index] = followed;
  }
  return structure ? { ...next, structure } : next;
}

module.exports = {
  changesFit,
  mapAnnotations,
  mapAnnotationsBetween,
  followEdits
};

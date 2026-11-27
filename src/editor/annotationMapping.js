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
 * Bookmarks (kirjanmerkit, project.bookmarks: { id, chapterId, position }) are places in a
 * chapter's text too, and they follow it by the same rule, as point marks: a bookmark stands in
 * front of the text that follows it, and one whose surroundings are deleted stays at the place of
 * the deletion. followEdits moves them in the same pass.
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

/** A place without a length (a bookmark) where the mapper puts it; the same object when it does not move. */
function movedPoint(point, mapPos) {
  if (!hasPlace(point)) return point;
  const position = mapRange(point.position, point.position, mapPos).from;
  return position === point.position ? point : { ...point, position };
}

/** The bookmark at a place noted earlier; the same object when it stands there. */
function placedPoint(point, place) {
  return point.position === place.position ? point : { ...point, position: place.position };
}

// The two kinds of things that stand on a text: a margin mark covers a range, a bookmark is a point
const AS_RANGE = { moved: movedMark, placed: placedMark };
const AS_POINT = { moved: movedPoint, placed: placedPoint };

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

// Marks that stood on the text `from` (a chapter's margin marks, or its bookmarks), on the text `to`
// an update wrote. `earlier` is the same kind of marks as they stood on `to` before, when the writer
// knows them (an undo, a redo); `as` is AS_RANGE or AS_POINT. The same array when no mark moved.
function followText(marks, from, to, edit, earlier, as) {
  // An undo or a redo puts back a text the marks have stood on: those that were there return to their places
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

  return eachMark(marks, mark => (placed(mark) ? as.placed(mark, places.get(mark.id)) : as.moved(mark, mapPos)));
}

// What the writer noted of the marks as they stood on the text being put back, if it noted any
const notedBy = (edit, name) => (edit && typeof edit[name] === 'function' ? edit[name]() : null);

// The marks of one chapter after an update that changed its text and left the marks as they were
function followChapter(before, chapter, edit) {
  const marks = chapter.annotations;
  // No marks; or the update brought its own (a tilannekuva, an added, edited or removed mark): as they are
  if (!Array.isArray(marks) || marks.length === 0 || marks !== before.annotations) return chapter;
  const from = textOf(before.content);
  const to = textOf(chapter.content);
  if (from === to) return chapter;

  const moved = followText(marks, from, to, edit, notedBy(edit, 'restore'), AS_RANGE);
  return moved === marks ? chapter : { ...chapter, annotations: moved };
}

// The project's bookmarks after an update that changed one chapter's text: those of that chapter
// follow it, the others are the same objects. The same array when no bookmark moved.
function followBookmarks(bookmarks, before, chapter, edit) {
  const from = textOf(before.content);
  const to = textOf(chapter.content);
  if (from === to) return bookmarks;
  const here = (mark) => !!mark && mark.chapterId === chapter.id;
  const own = bookmarks.filter(here);
  if (own.length === 0) return bookmarks;

  const noted = notedBy(edit, 'restoreBookmarks');
  const moved = followText(own, from, to, edit, Array.isArray(noted) ? noted.filter(here) : null, AS_POINT);
  if (moved === own) return bookmarks;
  const next = new Map(own.map((mark, index) => [mark, moved[index]]));
  return bookmarks.map(mark => (next.has(mark) ? next.get(mark) : mark));
}

/**
 * The project after an update, its margin marks and bookmarks moved onto the text the update
 * wrote. Where the update changed a chapter's `content` and left its `annotations` array as it
 * was, the marks are mapped; a chapter whose update set its own `annotations` (a restored
 * tilannekuva, a new mark), a new chapter (an import) and a chapter whose text did not change are
 * returned as they are. The same holds for `bookmarks`, the one list of the project: where the
 * update left it as it was, the bookmarks of every chapter whose text changed are mapped; a list
 * the update set itself (a new or removed bookmark, another project) is kept.
 *
 * @param {object} prev the project before the update
 * @param {object} next the project the update made (not changed; returned as it is when nothing moved)
 * @param {{ chapterId: string, changes?: Array<{from: number, to: number, insert: string}>,
 *           restore?: () => (object[] | null), restoreBookmarks?: () => (object[] | null) }} [edit]
 *   what the writer knows about its change of one chapter's text: the precise change list (used
 *   when it fits the two texts), and for an undo or a redo the chapter's marks and the project's
 *   bookmarks as they stood on the text being put back
 * @returns {object}
 */
function followEdits(prev, next, edit) {
  // This runs inside the state update that writes the text: whatever a stored mark looks like, the
  // write itself must go through
  try {
    return followed(prev, next, edit);
  } catch (error) {
    console.error('[Annotations] The margin marks and bookmarks could not follow a change of the text:', error);
    return next;
  }
}

function followed(prev, next, edit) {
  if (!prev || !next || prev === next) return next;
  const before = prev.structure;
  const after = next.structure;
  if (before === after || !Array.isArray(before) || !Array.isArray(after)) return next;

  // Bookmarks the update left as they were follow the text; a list it set itself is kept as it is
  const kept = Array.isArray(next.bookmarks) && next.bookmarks.length > 0 && next.bookmarks === prev.bookmarks
    ? next.bookmarks
    : null;
  let bookmarks = kept;
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
    const known = edit && edit.chapterId === chapter.id ? edit : null;
    if (bookmarks) bookmarks = followBookmarks(bookmarks, old, chapter, known);
    const followed = followChapter(old, chapter, known);
    if (followed === chapter) continue;
    if (!structure) structure = after.slice();
    structure[index] = followed;
  }
  if (!structure && bookmarks === kept) return next;
  const moved = { ...next };
  if (structure) moved.structure = structure;
  if (bookmarks !== kept) moved.bookmarks = bookmarks;
  return moved;
}

module.exports = {
  changesFit,
  mapAnnotations,
  mapAnnotationsBetween,
  followEdits
};

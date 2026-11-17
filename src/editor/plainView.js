/**
 * Plain view of a chapter
 *
 * The text a model reads in a review, with a map back to the stored text.
 * [TODO: …] notes and <u> / </u> tags are taken out; nothing else changes.
 * Placeholders (maskSpans) are for text a model edits: a model that only reads
 * quotes the placeholders or drops them, and its quote no longer matches. The
 * author's notes are not sent at all.
 *
 * "Raw" is the chapter text as stored, "plain" the text built here. Offsets
 * are UTF-16 offsets. Pure functions (test/editor/plainView.test.js).
 */

// The note rule is the one of the editor's note decoration (FaustEditor.js);
// every single tag is taken out, also one without its pair
const PLAIN_PATTERNS = Object.freeze({
  todo: /\[TODO:[^\]\n]*\]/g,
  tag: /<\/?u>/g
});

// Space, tab, no-break space
const SPACE = /[ \t\u00a0]/;
// What may follow a note without a space in between
const CLOSING = /[.,;:!?…)”»]/;
const isBreak = (ch) => ch === '\n' || ch === '\r';

// Every note with the one neighbouring space it takes along, so that no
// double space is left where it stood
function noteRanges(source) {
  const ranges = [];
  // A copy: the exported expression is global and would carry a lastIndex
  const pattern = new RegExp(PLAIN_PATTERNS.todo.source, 'g');
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const from = match.index;
    const to = from + match[0].length;

    // The last character kept in front of the note. Earlier notes that touch
    // this one are stepped over, so two notes in a row leave one space, not two.
    let at = from - 1;
    let first = ranges.length;
    while (first > 0 && ranges[first - 1].to > at) {
      at = ranges[first - 1].from - 1;
      first -= 1;
    }
    const prev = at >= 0 ? source[at] : '\n';
    const next = to < source.length ? source[to] : '\n';

    const range = { from, to, kind: 'todo' };
    if (SPACE.test(prev) && (isBreak(next) || SPACE.test(next) || CLOSING.test(next))) {
      // The space before goes too; it may stand in front of an earlier note
      if (first === ranges.length) range.from = at;
      else ranges[first].from = at;
    } else if (isBreak(prev) && SPACE.test(next)) {
      range.to = to + 1;
    }
    ranges.push(range);
  }
  return ranges;
}

// Every tag that is not inside a removed note
function tagRanges(source, notes) {
  const ranges = [];
  const pattern = new RegExp(PLAIN_PATTERNS.tag.source, 'g');
  let note = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    while (note < notes.length && notes[note].to <= from) note += 1;
    if (note < notes.length && notes[note].from < to) continue;
    ranges.push({ from, to, kind: 'tag' });
  }
  return ranges;
}

/**
 * The plain text of a chapter and the maps between the two texts.
 * @param {string} raw
 * @returns {{
 *   text: string,
 *   removed: Array<{from: number, to: number, kind: 'todo'|'tag', at: number}>,
 *   toRaw: (pos: number, side?: 'start'|'end') => number,
 *   toPlain: (rawPos: number) => number,
 *   rawRange: (from: number, to: number) => {from: number, to: number},
 *   protectedIn: (rawFrom: number, rawTo: number) => Array<{from: number, to: number, kind: string}>
 * }}
 */
function plainView(raw) {
  const source = raw == null ? '' : String(raw);
  const notes = noteRanges(source);
  const ranges = notes.concat(tagRanges(source, notes)).sort((a, b) => a.from - b.from);

  // `at` is where the removed range stood, as a position of the plain text
  const removed = [];
  let text = '';
  let cursor = 0;
  for (const range of ranges) {
    text += source.slice(cursor, range.from);
    removed.push({ from: range.from, to: range.to, kind: range.kind, at: text.length });
    cursor = range.to;
  }
  text += source.slice(cursor);

  // A start lands after what was removed at that position, an end before it:
  // the range of an underlined word is the word without its tags
  const toRaw = (pos, side = 'start') => {
    let shift = 0;
    for (const range of removed) {
      if (range.at < pos || (range.at === pos && side === 'start')) shift += range.to - range.from;
      else break;
    }
    return pos + shift;
  };

  const toPlain = (rawPos) => {
    let shift = 0;
    for (const range of removed) {
      if (rawPos >= range.to) shift += range.to - range.from;
      else if (rawPos > range.from) return range.at;
      else break;
    }
    return rawPos - shift;
  };

  const rawRange = (from, to) => {
    if (!(to > from)) {
      // An insertion goes in front of a note or tag that stands at that place
      const pos = toRaw(from, 'end');
      return { from: pos, to: pos };
    }
    const start = toRaw(from, 'start');
    return { from: start, to: Math.max(start, toRaw(to, 'end')) };
  };

  const protectedIn = (rawFrom, rawTo) => removed.filter(range => range.from < rawTo && range.to > rawFrom);

  return { text, removed, toRaw, toPlain, rawRange, protectedIn };
}

module.exports = { plainView, PLAIN_PATTERNS };

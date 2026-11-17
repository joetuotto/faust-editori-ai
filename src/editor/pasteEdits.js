/**
 * Paste as edits (Liitä muokkauksina)
 *
 * A text that was edited somewhere else (by an editor at the publisher, or by
 * an AI in another program) comes back on the clipboard. Instead of pasting
 * it over the manuscript, it is compared with the target and the differences
 * become suggestions. No model is called. Pure functions, unit-tested
 * (test/editor/pasteEdits.test.js); the word diff arrives as an argument.
 */

const { countWords } = require('./textTools.js');

// Above this share of changed words the clipboard probably holds another text
const PASTE_WARN_RATIO = 0.6;

// Notes and underline tags. Text that went through a chat or a formatted
// export has usually lost them; that must never turn into a proposal to
// delete them from the manuscript.
const PROTECTED_PATTERN = /\[TODO:[^\]\n]*\]|<\/?u>/g;

const normalizeNewlines = (text) => String(text == null ? '' : text).replace(/\r\n?/g, '\n');

/**
 * How paragraphs are separated: by one line break ('single'), by one blank
 * line ('double'), not at all ('none'), or in more than one way ('mixed').
 * Only the breaks between two lines that have text count.
 */
function paragraphBreakStyle(text) {
  const lines = normalizeNewlines(text).split('\n');
  let previous = -1;
  let single = 0;
  let double = 0;
  let other = 0;

  lines.forEach((line, index) => {
    if (!line.trim()) return;
    if (previous !== -1) {
      const blankLines = index - previous - 1;
      if (blankLines === 0) single++;
      else if (blankLines === 1) double++;
      else other++;
    }
    previous = index;
  });

  if (single + double + other === 0) return 'none';
  if (double === 0 && other === 0) return 'single';
  if (single === 0 && other === 0) return 'double';
  return 'mixed';
}

/**
 * Bring the clipboard text into the shape of the target, so that only real
 * edits remain as differences: line endings, the way paragraphs are
 * separated, and the whitespace around the whole text.
 */
function normalizeClipboard(targetText, clipboardText) {
  const target = normalizeNewlines(targetText);
  let body = normalizeNewlines(clipboardText).trim();

  const targetStyle = paragraphBreakStyle(target);
  const clipboardStyle = paragraphBreakStyle(body);
  if (targetStyle === 'double' && clipboardStyle === 'single') {
    body = body.replace(/\n/g, '\n\n');
  } else if (targetStyle === 'single' && clipboardStyle === 'double') {
    body = body.replace(/\n[^\S\n]*\n/g, '\n');
  }

  // A paragraph copied from another program ends in a line break the selection does not have
  if (!target.trim()) return target + body;
  const lead = target.match(/^\s*/)[0];
  const trail = target.match(/\s*$/)[0];
  return lead + body + trail;
}

function countMatches(text) {
  const counts = new Map();
  for (const match of String(text).match(PROTECTED_PATTERN) || []) {
    counts.set(match, (counts.get(match) || 0) + 1);
  }
  return counts;
}

function protectedSpans(text) {
  return Array.from(text.matchAll(PROTECTED_PATTERN), match => ({ from: match.index, to: match.index + match[0].length }));
}

/**
 * Would this change take a note or an underline tag out of the manuscript?
 * The rule: the original holds a note or tag that the replacement does not
 * hold as often. A change that cuts into one is widened to the whole note or
 * tag first, so a diff that splits "[TODO: x]" into pieces is judged the same
 * way as one that keeps it whole.
 */
function removesProtected(target, change, spans) {
  let from = change.from;
  let to = change.to;
  for (const span of spans) {
    if (span.from < change.to && span.to > change.from) {
      from = Math.min(from, span.from);
      to = Math.max(to, span.to);
    }
  }

  const before = countMatches(target.slice(from, to));
  if (!before.size) return false;
  const after = countMatches(target.slice(from, change.from) + normalizeNewlines(change.insert) + target.slice(change.to, to));
  for (const [match, count] of before) {
    if ((after.get(match) || 0) < count) return true;
  }
  return false;
}

// A change that reaches into a note or tag the selection cuts in two: the
// part inside the target does not look like a note, but it is one
function touchesCutSpan(change, cutSpans) {
  return cutSpans.some(span => (change.from === change.to
    ? change.from > span.from && change.from < span.to
    : change.from < span.to && change.to > span.from));
}

// Offsets in the LF copy of a text → offsets in the text itself (\r\n is one position in the copy)
function rawOffsets(raw) {
  if (!raw.includes('\r')) return null;
  const map = [];
  for (let index = 0; index < raw.length; index++) {
    map.push(index);
    if (raw[index] === '\r' && raw[index + 1] === '\n') index++;
  }
  map.push(raw.length);
  return map;
}

function toRawChange(change, raw, map) {
  if (!map) return change;
  const from = map[change.from];
  const to = map[change.to];
  const moved = { ...change, from, to };
  if ('original' in change) moved.original = raw.slice(from, to);
  return moved;
}

/**
 * Compare the clipboard with the target.
 * @param {string} targetText the selection, or the whole chapter
 * @param {string} clipboardText
 * @param {{ wordDiff: (original: string, revised: string) => Array<{from, to, insert, original?}>,
 *           changeRatio: (original: string, revised: string) => number }} deps
 * @param {Array<{from: number, to: number}>} [cutSpans] parts of notes or tags that the
 *   edges of the target cut (offsets in targetText); a change that reaches into one is protected
 * @returns {{ status: 'empty'|'identical'|'ok'|'protected-only', revised: string, changes: object[],
 *             protectedChanges: object[], protectedCount: number, ratio: number, warn: boolean,
 *             stats: { targetWords: number, clipboardWords: number, changeCount: number } }}
 *   `changes` are offsets into targetText (also when it holds \r\n). Straight quotes or hyphens on the
 *   clipboard against ” and – in the manuscript are real differences.
 */
function preparePasteEdits(targetText, clipboardText, deps, cutSpans) {
  const raw = String(targetText == null ? '' : targetText);
  const target = normalizeNewlines(raw);
  const offsets = rawOffsets(raw);
  // The cut spans arrive in targetText offsets; the comparison runs on the LF copy
  const toCopy = (pos) => (offsets ? Math.max(0, offsets.findIndex(at => at >= pos)) : pos);
  const cut = (Array.isArray(cutSpans) ? cutSpans : [])
    .filter(span => span && Number.isInteger(span.from) && Number.isInteger(span.to) && span.to > span.from)
    .map(span => ({ from: toCopy(span.from), to: toCopy(span.to) }));
  const clipboard = normalizeNewlines(clipboardText);
  const result = {
    status: 'empty',
    revised: '',
    changes: [],
    protectedChanges: [],
    protectedCount: 0,
    ratio: 0,
    warn: false,
    stats: { targetWords: countWords(target), clipboardWords: countWords(clipboard), changeCount: 0 }
  };
  if (!clipboard.trim()) return result;

  result.revised = normalizeClipboard(target, clipboard);
  if (result.revised === target) return { ...result, status: 'identical' };

  const spans = protectedSpans(target);
  for (const change of deps.wordDiff(target, result.revised) || []) {
    const kept = toRawChange(change, raw, offsets);
    if (removesProtected(target, change, spans) || touchesCutSpan(change, cut)) result.protectedChanges.push(kept);
    else result.changes.push(kept);
  }
  result.protectedCount = result.protectedChanges.length;
  result.stats.changeCount = result.changes.length;

  if (!result.changes.length) {
    // Every difference would have deleted a note or a tag, or the diff found none worth proposing
    return { ...result, status: result.protectedCount ? 'protected-only' : 'identical' };
  }

  const ratio = Number(deps.changeRatio(target, result.revised));
  result.ratio = Number.isFinite(ratio) ? ratio : 0;
  result.warn = result.ratio > PASTE_WARN_RATIO;
  result.status = 'ok';
  return result;
}

module.exports = {
  PASTE_WARN_RATIO,
  PROTECTED_PATTERN,
  paragraphBreakStyle,
  normalizeClipboard,
  preparePasteEdits
};

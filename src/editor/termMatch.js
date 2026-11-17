/**
 * Term matching for word lists
 *
 * One matcher for the avoid-word list, the names and aliases of Tarinakansio
 * entries and the local "vältettävät sanat" check. One rule for every list:
 * an item matches from the start of a word and any ending is allowed, so
 * "Mari" also finds "Marian". An item written inside quotation marks matches
 * that exact word only.
 *
 * Pure functions, no DOM (test/editor/termMatch.test.js). Offsets are UTF-16
 * offsets in the text that was searched.
 */

const { buildSearchPattern } = require('./textTools.js');

// Text pasted from a PDF can spell "ä" as "a" followed by U+0308. Such a
// mark belongs to the letter before it. The five blocks of combining
// diacritical marks are listed as ranges, because \p{M} in every term's
// expression made compiling a folder of entries more than twice as slow.
const MARK = '\\u0300-\\u036F\\u1AB0-\\u1AFF\\u1DC0-\\u1DFF\\u20D0-\\u20FF\\uFE20-\\uFE2F';

// Where a match may start and end: not next to a letter or a digit, and not
// in front of a mark. The whole-word option of textTools is not used, because
// it also counts "_" as part of a word, and "_" is the app's italic marker:
// "_Mari_" must match.
const WORD_START = `(?<![\\p{L}\\p{N}][${MARK}]*)`;
const WORD_END = `(?![\\p{L}\\p{N}${MARK}])`;

// What may follow the typed part of a word: more letters, and a colon ending
// such as "EU:n" or "EU:ssa". The typed part itself ends at a whole letter:
// "Peka" does not match the start of a decomposed "Pekän".
const WORD_ENDING = `(?![${MARK}])[\\p{L}\\p{N}${MARK}'’]*(?::[\\p{L}${MARK}]+)?`;

// Words of one term are separated by spaces on one line. A match never
// crosses a line break, because a line is a paragraph.
const WORD_GAP = '[ \\t\\u00A0]+';

const QUOTED_ITEM = /^["”“»](.+)["”“»]$/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

// Own literal copy of the note pattern (the editor's is in FaustEditor.js)
const TODO_PATTERN = /\[TODO:[^\]\n]*\]/g;

// "-" is not in this set on purpose: an escaped hyphen outside a class is a
// syntax error with the u flag, and the whole pattern would then match nothing
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\/]/;

// ---------------------------------------------------------------------------
// Parsing a list
// ---------------------------------------------------------------------------

/**
 * One list item as { text, exact }. An item wrapped in quotation marks is
 * exact. Returns null for an item without a letter or a digit.
 */
function parseTerm(raw) {
  let text = String(raw == null ? '' : raw).normalize('NFC').trim().replace(/\s+/g, ' ');
  let exact = false;

  const quoted = QUOTED_ITEM.exec(text);
  if (quoted && quoted[1].trim()) {
    exact = true;
    text = quoted[1].trim();
  }

  if (!text || !HAS_LETTER_OR_DIGIT.test(text)) return null;
  return { text, exact };
}

// Two items are the same term when they agree in this key
const termKey = (term) => (term.exact ? '=' : '~') + term.text;

/**
 * Split typed text into list items: one per line, comma or semicolon.
 * Items come back as typed (quotation marks kept), without later duplicates.
 */
function parseTermList(text) {
  const seen = new Set();
  const items = [];

  for (const piece of String(text == null ? '' : text).split(/[\r\n,;]+/)) {
    const item = piece.trim();
    const term = parseTerm(item);
    if (!term) continue;

    // Case does not make a new item: "Hehku" after "hehku" is a repeat
    const key = (term.exact ? '=' : '~') + term.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items;
}

/** The list as text again, one item per separator. */
function formatTermList(list, separator = '\n') {
  return (list || []).join(separator);
}

// ---------------------------------------------------------------------------
// Compiling
// ---------------------------------------------------------------------------

// A lowercase letter matches both cases, an uppercase letter only itself:
// "Mari" finds "MARI" but not "marina", "hehku" finds "Hehkuva"
function caseSource(char) {
  const lower = char.toLowerCase();
  const upper = char.toUpperCase();
  if (char === lower && upper !== lower && upper.length === 1) return `[${lower}${upper}]`;

  return REGEX_SPECIAL.test(char) ? `\\${char}` : char;
}

function charSource(char) {
  if (char === "'" || char === '’') return "['’]";
  if (char === '-' || char === '\u2011') return '[-\u2011]';

  // Terms are NFC, the text may not be: "ä" also matches "a" and U+0308.
  // The text itself is never normalised, so offsets stay offsets in it.
  const pieces = Array.from(char.normalize('NFD'));
  if (pieces.length < 2) return caseSource(char);
  return `(?:${caseSource(char)}|${pieces.map(caseSource).join('')})`;
}

function termSource(term) {
  return term.text
    .split(' ')
    .map(word => Array.from(word).map(charSource).join('') + (term.exact ? '' : WORD_ENDING))
    .join(WORD_GAP);
}

/**
 * Compile a list of raw items into one expression.
 * @returns {{ terms: Array<{text: string, exact: boolean}>, pattern: RegExp|null, sticky: RegExp|null }}
 */
function compileTerms(rawTerms) {
  const seen = new Set();
  const terms = [];

  for (const raw of rawTerms || []) {
    const term = parseTerm(raw);
    if (!term || seen.has(termKey(term))) continue;
    seen.add(termKey(term));
    terms.push(term);
  }

  if (terms.length === 0) return { terms, pattern: null, sticky: null };

  // Longest first, so that "Mari Virtase" wins over "Mari" at the same place.
  // The group name carries the term's index in the list.
  const source = terms
    .map((term, index) => ({ term, index }))
    .sort((a, b) => b.term.text.length - a.term.text.length || a.index - b.index)
    .map(({ term, index }) => `(?<t${index}>${termSource(term)})`)
    .join('|');

  const pattern = buildSearchPattern(`${WORD_START}(?:${source})${WORD_END}`, { regex: true, caseSensitive: true });
  const sticky = pattern ? new RegExp(pattern.source, 'uy') : null;
  return { terms, pattern, sticky };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

function overlapsAny(start, end, ranges) {
  for (const range of ranges) {
    if (start < range.end && range.start < end) return true;
  }
  return false;
}

/**
 * All matches of a compiled list, in order of position and never overlapping.
 *
 * options.exclude: a compiled list; a hit is dropped when one of its terms
 *   matches at the hit's start ("Marianne" removes "Mariannen" from "Mari").
 * options.skip: ranges { start, end }; a hit that overlaps one is dropped.
 *
 * @returns {Array<{ start: number, end: number, text: string, term: number }>}
 *   term is the index into compiled.terms
 */
function findTermMatches(text, compiled, options = {}) {
  if (!text || !compiled || !compiled.pattern) return [];

  const exclude = options && options.exclude && options.exclude.sticky ? options.exclude.sticky : null;
  const skip = options && Array.isArray(options.skip) && options.skip.length > 0 ? options.skip : null;
  const groupNames = compiled.terms.map((_term, index) => `t${index}`);

  const pattern = compiled.pattern;
  pattern.lastIndex = 0;

  const matches = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match[0].length === 0) {
      // An expression that matches nothing would loop forever
      pattern.lastIndex += 1;
      continue;
    }

    const start = match.index;
    const end = start + match[0].length;

    if (exclude) {
      exclude.lastIndex = start;
      if (exclude.test(text)) continue;
    }
    if (skip && overlapsAny(start, end, skip)) continue;

    let term = -1;
    for (let index = 0; index < groupNames.length; index++) {
      if (match.groups[groupNames[index]] !== undefined) {
        term = index;
        break;
      }
    }
    matches.push({ start, end, text: match[0], term });
  }
  return matches;
}

/** The [TODO: …] notes of a text as ranges. An unclosed note is not one. */
function todoRanges(text) {
  const ranges = [];
  if (!text) return ranges;

  TODO_PATTERN.lastIndex = 0;
  let match;
  while ((match = TODO_PATTERN.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

/**
 * How often each item of a list occurs in a text, notes not counted.
 * One row per item in list order, zero included.
 * @returns {Array<{ term: string, count: number }>}
 */
function countTerms(text, rawTerms) {
  const compiled = compileTerms(rawTerms);
  const rows = compiled.terms.map(term => ({ term: term.text, count: 0 }));

  for (const match of findTermMatches(text || '', compiled, { skip: todoRanges(text || '') })) {
    if (rows[match.term]) rows[match.term].count += 1;
  }
  return rows;
}

module.exports = {
  parseTerm,
  parseTermList,
  formatTermList,
  compileTerms,
  findTermMatches,
  todoRanges,
  countTerms
};

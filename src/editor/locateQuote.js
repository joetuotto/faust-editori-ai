/**
 * Finding a quoted passage
 *
 * A model reports a problem by quoting the text. locateQuote() finds the quote
 * in the chapter: exactly, then with spaces and quotation marks folded, then by
 * its longest beginning. Positions reported by a model are never used.
 * Pure functions (test/editor/locateQuote.test.js).
 */

// What folds to a plain ", ' and -. Characters that are invisible or look like
// another one are written as escapes.
const DOUBLE_QUOTES = '"“”„‟«»';
const SINGLE_QUOTES = '\'‘’‚‛‹›′´`';
// Hyphen-minus, hyphen, non-breaking hyphen, figure dash, en dash, em dash, horizontal bar, minus
const DASHES = '-\u2010\u2011\u2012–—\u2015\u2212';
// Emphasis markers, zero-width space, non-joiner and joiner, word joiner, byte-order mark, soft hyphen
const DROPPED = '*_~\u200b\u200c\u200d\u2060\ufeff\u00ad';
// Same class as the whole-word test of buildSearchPattern in textTools.js
const BOUNDARY_CHAR = /[\p{L}\p{N}_]/u;

const DEFAULT_MIN_PREFIX_WORDS = 3;
const MIN_PREFIX_CHARS = 12;

/**
 * Text folded for matching, with a map back to the source: starts[i] and
 * ends[i] are the source range of folded character i.
 * @returns {{text: string, starts: number[], ends: number[]}}
 */
function foldForMatch(source) {
  const value = source == null ? '' : String(source);
  // Collected in an array and joined once: endsWith on a string grown with += made
  // long chapters quadratic
  const chars = [];
  const starts = [];
  const ends = [];
  let lastIsSpace = false;
  const emit = (folded, from, to) => {
    for (let i = 0; i < folded.length; i++) {
      chars.push(folded[i]);
      starts.push(from);
      ends.push(to);
    }
    lastIsSpace = folded === ' ';
  };

  // An underline tag, or one character with its combining marks
  const cluster = /<\/?u>|[^\p{M}]\p{M}*|\p{M}+/gu;
  let match;
  while ((match = cluster.exec(value)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const raw = match[0];
    if (raw === '<u>' || raw === '</u>') continue;

    const ch = raw.normalize('NFC');
    if (DROPPED.includes(ch)) continue;
    if (/^\s$/u.test(ch)) {
      // A run of whitespace is one space whose range covers the run
      if (lastIsSpace) ends[ends.length - 1] = to;
      else emit(' ', from, to);
      continue;
    }
    if (DOUBLE_QUOTES.includes(ch)) { emit('"', from, to); continue; }
    if (SINGLE_QUOTES.includes(ch)) { emit('\'', from, to); continue; }
    if (DASHES.includes(ch)) { emit('-', from, to); continue; }
    if (ch === '…') { emit('...', from, to); continue; }
    emit(ch.toLowerCase(), from, to);
  }
  return { text: chars.join(''), starts, ends };
}

function occurrences(hay, needle) {
  const found = [];
  if (!needle) return found;
  let at = hay.indexOf(needle);
  while (at !== -1) {
    found.push(at);
    at = hay.indexOf(needle, at + 1);
  }
  return found;
}

// The character (code point) that ends before an index, and the one that starts at it
function charBefore(text, index) {
  if (index <= 0) return '';
  const unit = text.charCodeAt(index - 1);
  if (index >= 2 && unit >= 0xdc00 && unit <= 0xdfff) {
    const lead = text.charCodeAt(index - 2);
    if (lead >= 0xd800 && lead <= 0xdbff) return text.slice(index - 2, index);
  }
  return text[index - 1];
}
const charFrom = (text, index) => (index < text.length ? String.fromCodePoint(text.codePointAt(index)) : '');

// Prefer matches that do not start or end in the middle of a word: "se", not the inside of "katseli"
function wholeWordFirst(hay, needle, found) {
  const startsWord = BOUNDARY_CHAR.test(charFrom(needle, 0));
  const endsWord = BOUNDARY_CHAR.test(charBefore(needle, needle.length));
  const whole = found.filter((at) => {
    const before = charBefore(hay, at);
    const after = charFrom(hay, at + needle.length);
    return !(startsWord && before && BOUNDARY_CHAR.test(before)) && !(endsWord && after && BOUNDARY_CHAR.test(after));
  });
  return whole.length > 0 ? whole : found;
}

// The first match, or the one closest to `near`
function nearest(found, near) {
  if (!Number.isFinite(near)) return found[0];
  let best = found[0];
  for (const at of found) {
    if (Math.abs(at - near) < Math.abs(best - near)) best = at;
  }
  return best;
}

// The ellipses and the one pair of quotation marks a model puts around a quote.
// `wrapped` is the variant of the brief (ellipses outside, then the marks); `inner` also
// drops ellipses inside the marks (”…näin…”), and is tried only when `wrapped` finds
// nothing, because an ellipsis inside the marks may belong to the text (”Hän epäröi…”)
function stripWrapping(quote) {
  const withoutEllipses = (value) => value.replace(/^(?:\.{3}|…)\s*/u, '').replace(/\s*(?:\.{3}|…)$/u, '');
  const wrapped = withoutEllipses(quote.trim());
  let unquoted = wrapped;
  let inner = wrapped;
  const quotes = DOUBLE_QUOTES + SINGLE_QUOTES;
  if (wrapped.length >= 2 && quotes.includes(wrapped[0]) && quotes.includes(wrapped[wrapped.length - 1])) {
    unquoted = wrapped.slice(1, -1).trim();
    inner = withoutEllipses(unquoted);
  }
  return { wrapped: unquoted, inner };
}

/**
 * Find a passage a model quoted.
 * @param {string} text
 * @param {string} quote
 * @param {{near?: number, from?: number, to?: number, minPrefixWords?: number}} [options]
 *   near: choose the match closest to this offset; from, to: limit the search
 *   (returned offsets stay those of the whole text)
 * @returns {{from: number, to: number, method: 'exact'|'normalized'|'prefix', count: number, coverage: number}|null}
 */
function locateQuote(text, quote, options) {
  const given = options || {};
  const hay = text == null ? '' : String(text);
  const scopeFrom = Math.max(0, Math.min(Number.isFinite(given.from) ? given.from : 0, hay.length));
  const scopeTo = Math.max(scopeFrom, Math.min(Number.isFinite(given.to) ? given.to : hay.length, hay.length));
  const scope = hay.slice(scopeFrom, scopeTo);
  const near = Number.isFinite(given.near) ? given.near - scopeFrom : NaN;
  const minPrefixWords = Number.isFinite(given.minPrefixWords) ? given.minPrefixWords : DEFAULT_MIN_PREFIX_WORDS;

  const asGiven = (quote == null ? '' : String(quote)).trim();
  if (!asGiven || !scope) return null;
  const variants = [asGiven];
  const stripped = stripWrapping(asGiven);
  for (const variant of [stripped.wrapped, stripped.inner]) {
    if (variant && !variants.includes(variant)) variants.push(variant);
  }

  // 1. Exact: the quote as given, then without what the model wrapped it in
  for (const needle of variants) {
    const found = wholeWordFirst(scope, needle, occurrences(scope, needle));
    if (found.length > 0) {
      const at = nearest(found, near);
      return { from: scopeFrom + at, to: scopeFrom + at + needle.length, method: 'exact', count: found.length, coverage: 1 };
    }
  }

  // 2. Normalized: whitespace, quotation marks, dashes, ellipsis, emphasis markers and case folded
  const folded = foldForMatch(scope);
  let nearFolded = NaN;
  if (Number.isFinite(near)) {
    nearFolded = folded.starts.findIndex(start => start >= near);
    if (nearFolded === -1) nearFolded = folded.text.length;
  }
  // The brief's variant first; the one without inner ellipses only if that finds nothing
  const needles = [];
  for (const variant of [stripped.wrapped || asGiven, stripped.inner]) {
    const value = variant ? foldForMatch(variant).text.trim() : '';
    if (value && !needles.includes(value)) needles.push(value);
  }
  if (needles.length === 0) return null;

  // From the source start of the first matched character to the source end of the last,
  // so markers inside the match are covered
  const pick = (found, length, method, coverage) => {
    const at = nearest(found, nearFolded);
    return {
      from: scopeFrom + folded.starts[at],
      to: scopeFrom + folded.ends[at + length - 1],
      method,
      count: found.length,
      coverage
    };
  };

  for (const needle of needles) {
    if (needle.length < 2) continue;
    const found = wholeWordFirst(folded.text, needle, occurrences(folded.text, needle));
    if (found.length > 0) return pick(found, needle.length, 'normalized', 1);
  }

  // 3. The longest beginning of the quote, cut at a word end
  for (const needle of needles) {
    const words = needle.split(' ');
    for (let k = words.length - 1; k >= minPrefixWords; k--) {
      const prefix = words.slice(0, k).join(' ');
      if (prefix.length < MIN_PREFIX_CHARS) break;
      const found = occurrences(folded.text, prefix);
      if (found.length > 0) return pick(found, prefix.length, 'prefix', prefix.length / needle.length);
    }
  }
  return null;
}

module.exports = { locateQuote, foldForMatch };

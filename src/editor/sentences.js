/**
 * Sentences of Finnish prose
 *
 * splitSentences() finds sentence spans; trimToSentence() cuts an interrupted
 * text back to its last complete sentence. Pure functions
 * (test/editor/sentences.test.js).
 */

const TERMINATORS = '.!?…';
const CLOSERS = '”"’\'»“)]*_';

// A full stop after one of these does not end a sentence. jne, ym, yms and tms
// are left out on purpose: they usually end one.
const ABBREVIATIONS = new Set([
  'esim', 'mm', 'ns', 'ks', 'vrt', 'ts', 'nk', 'so', 'ko', 'ao', 'em', 'ed', 'po', 'ml', 'pl',
  'huom', 'nro', 'puh', 'os', 'tri', 'prof', 'dos', 'fil', 'toim', 'suom', 'synt', 'kuoll', 'klo',
  'vs', 'ca', 'mr', 'mrs', 'dr', 'st'
]);

const WORD_RUN_CHAR = /[\p{L}\p{N}\p{M}]/u;
const isSpace = (ch) => /\s/u.test(ch);
const isLower = (ch) => /\p{Ll}/u.test(ch);
const isDigit = (ch) => /\p{Nd}/u.test(ch);

// The run of letters and digits right before a position, read backwards so that
// a long paragraph is not scanned again for every full stop. Combining marks
// stay with their letter, so a decomposed "Ä." is still an initial.
function wordBefore(text, lineStart, pos) {
  let start = pos;
  while (start > lineStart) {
    let previous = start - 1;
    const unit = text.charCodeAt(previous);
    if (unit >= 0xdc00 && unit <= 0xdfff && previous > lineStart) {
      const lead = text.charCodeAt(previous - 1);
      if (lead >= 0xd800 && lead <= 0xdbff) previous -= 1;
    }
    if (!WORD_RUN_CHAR.test(String.fromCodePoint(text.codePointAt(previous)))) break;
    start = previous;
  }
  return text.slice(start, pos).normalize('NFC');
}

// A lone full stop after a number, an initial or an abbreviation does not end a sentence by itself
function weakStop(text, lineStart, pos, run) {
  if (run !== '.') return null;
  const word = wordBefore(text, lineStart, pos);
  if (!word) return null;
  if (/^\p{Nd}+$/u.test(word)) return 'number';
  if (/^\p{L}\p{M}*$/u.test(word)) return 'initial';
  if (ABBREVIATIONS.has(word.toLowerCase())) return 'abbreviation';
  return null;
}

/**
 * Sentences of a text. Lines are hard boundaries; a line that does not end in
 * . ! ? or … closes with an unterminated sentence.
 * @returns {Array<{from: number, to: number, terminated: boolean}>}
 */
function splitSentences(text) {
  const value = text == null ? '' : String(text);
  const out = [];
  const n = value.length;
  let lineStart = 0;

  while (lineStart <= n) {
    let lineEnd = value.indexOf('\n', lineStart);
    if (lineEnd === -1) lineEnd = n;

    let start = -1;
    let i = lineStart;
    while (i < lineEnd) {
      const ch = value[i];
      if (start === -1) {
        if (isSpace(ch)) { i++; continue; }
        start = i;
      }
      if (!TERMINATORS.includes(ch)) { i++; continue; }

      // The ending: a run of . ! ? … and the closing marks after it
      let j = i + 1;
      while (j < lineEnd && TERMINATORS.includes(value[j])) j++;
      const run = value.slice(i, j);
      let k = j;
      while (k < lineEnd && CLOSERS.includes(value[k])) k++;

      let boundary;
      let q = k;
      while (q < lineEnd && isSpace(value[q])) q++;
      if (q >= lineEnd) {
        boundary = true; // the end of the line
      } else if (q === k) {
        boundary = false; // nothing between: 3.5, 10.30, www.fi
      } else {
        const next = String.fromCodePoint(value.codePointAt(q));
        const weak = weakStop(value, lineStart, i, run);
        if (isLower(next)) boundary = false; // ”Mitä?” hän kysyi. / 12. toukokuuta / esim. näin
        else if (weak === 'initial' || weak === 'abbreviation') boundary = false;
        else if (weak === 'number' && isDigit(next)) boundary = false; // 12. 5. 2026
        else boundary = true;
      }

      if (boundary) {
        out.push({ from: start, to: k, terminated: true });
        start = -1;
      }
      i = k;
    }

    if (start !== -1) {
      let end = lineEnd;
      while (end > start && isSpace(value[end - 1])) end--;
      out.push({ from: start, to: end, terminated: false });
    }
    lineStart = lineEnd + 1;
  }
  return out;
}

// Finnish uses ” on both sides, so without “ the count of ” must be even; the same for » and «
function quotesBalanced(text) {
  const count = (ch) => text.split(ch).length - 1;
  if (count('"') % 2 !== 0) return false;
  const open = count('“');
  const close = count('”');
  if (open === 0 ? close % 2 !== 0 : open !== close) return false;
  const openAngle = count('«');
  const closeAngle = count('»');
  if (openAngle === 0 ? closeAngle % 2 !== 0 : openAngle !== closeAngle) return false;
  return true;
}

/**
 * The longest beginning of a text that ends in a complete sentence. Earlier
 * lines are complete as they are; '' when not even one sentence is complete.
 * Never adds a character and never ends in whitespace.
 */
function trimToSentence(text) {
  const value = text == null ? '' : String(text);
  const lastLineStart = value.lastIndexOf('\n') + 1;
  // trimEnd, not /\s+$/: that expression is quadratic on a long run of blank lines
  const trimmedEnd = value.trimEnd().length;

  const ends = [];
  for (const sentence of splitSentences(value)) {
    if (sentence.from < lastLineStart || !sentence.terminated) continue;
    if (sentence.to === trimmedEnd) {
      // The text stops right here: "esim.", "J." or "12." may be the middle of a sentence
      let i = sentence.to;
      while (i > sentence.from && CLOSERS.includes(value[i - 1])) i--;
      let runStart = i;
      while (runStart > sentence.from && TERMINATORS.includes(value[runStart - 1])) runStart--;
      if (weakStop(value, lastLineStart, runStart, value.slice(runStart, i))) continue;
    }
    ends.push(sentence.to);
  }

  const balanced = ends.filter(end => quotesBalanced(value.slice(lastLineStart, end)));
  if (balanced.length > 0) return value.slice(0, balanced[balanced.length - 1]);
  if (ends.length > 0) return value.slice(0, ends[ends.length - 1]);
  return value.slice(0, lastLineStart).trimEnd();
}

module.exports = { splitSentences, trimToSentence, ABBREVIATIONS };

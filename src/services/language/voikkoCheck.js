/**
 * Voikko check of a chapter (renderer side)
 *
 * Turns chapter text into what utils/voikko.js needs (words and paragraphs)
 * and its answers into findings with document offsets. Pure functions; the
 * tools themselves run in the main process (test/services/voikkoCheck.test.js).
 */
const { protectedRanges } = require('../../editor/typography.fi.js');

// "maa-" in "maa- ja metsätalous", "Marja-Liisa", "EU:n" and "vaa’an" stay whole
const WORD = /[\p{L}\p{N}]+(?:[-'’:][\p{L}\p{N}]+)*-?/gu;

const MAX_SUGGESTIONS = 5;
const SPELLING_MESSAGE = 'Voikko ei tunne sanaa.';
// libvoikko: 1 = spelling, 2 = extra whitespace, 3 = space before punctuation
const GC_SPELLING = 1;
const GC_WHITESPACE = new Set([2, 3]);
// libvoikko: 7 = "Sana on kirjoitettava isolla alkukirjaimella."
const GC_CAPITAL = 7;

// A speech tag continues its line of dialogue in lower case after ? or !:
// "– Onko tämä pääteasema? hän kysyi konduktööriltä." Voikko reads the mark as the end
// of a sentence and proposes a capital, which would put an error into the text.
function isSpeechTag(source, start) {
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const before = source.slice(lineStart, start);
  return /^[ \t]*(?:[–—][ \t\u00a0]|[”"»])/u.test(before) && /[?!][”"»]?[ \t\u00a0]+$/u.test(before);
}

const overlaps = (ranges, from, to) => ranges.some(([start, end]) => from < end && to > start);

/**
 * The words of a text with their offsets. Notes, tags and placeholders are
 * skipped, and so are tokens without a letter (plain numbers).
 * @returns {Array<{word: string, from: number, to: number}>}
 */
function tokenizeWords(text) {
  const value = String(text == null ? '' : text);
  const tokens = [];
  let lineStart = 0;

  for (const line of value.split('\n')) {
    const ranges = protectedRanges(line);
    for (const match of line.matchAll(WORD)) {
      const from = match.index;
      const to = from + match[0].length;
      if (!/\p{L}/u.test(match[0]) || overlaps(ranges, from, to)) continue;
      tokens.push({ word: match[0], from: lineStart + from, to: lineStart + to });
    }
    lineStart += line.length + 1;
  }
  return tokens;
}

// Same spans as parseInline in utils/manuscript.js (the underline tag is a protected range here)
const SPAN_WORD = 'A-Za-z0-9À-ÖØ-öø-ÿ';
const INLINE_SPAN = new RegExp(
  [
    '(\\*\\*|__)(?=\\S)([\\s\\S]+?)(?<=\\S)\\1',
    `(?<![${SPAN_WORD}_])_(?=\\S)([^_]+?)(?<=\\S)_(?![${SPAN_WORD}_])`,
    '(?<!\\*)\\*(?=[^\\s*])([^*]+?)(?<=[^\\s*])\\*(?!\\*)',
    '~~(?=\\S)([\\s\\S]+?)(?<=\\S)~~'
  ].join('|')
);
// Stands in for text that must not open or close a span while markers are searched
const FILLER = '\uE000';

// Ranges of the emphasis markers of one line, nested ones included
function markerRanges(line) {
  const ranges = [];
  const walk = (text, offset) => {
    let rest = text;
    let at = offset;
    while (rest.length > 0) {
      const match = INLINE_SPAN.exec(rest);
      if (!match) break;
      const start = at + match.index;
      const inner = match[2] !== undefined ? match[2]
        : match[3] !== undefined ? match[3]
          : match[4] !== undefined ? match[4]
            : match[5];
      const open = match[2] !== undefined || match[5] !== undefined ? 2 : 1;
      const innerStart = start + open;
      const closeStart = innerStart + inner.length;
      ranges.push([start, innerStart], [closeStart, start + match[0].length]);
      walk(inner, innerStart);
      rest = rest.slice(match.index + match[0].length);
      at = start + match[0].length;
    }
  };
  walk(line, 0);
  return ranges;
}

// A line with notes, tags, placeholders and emphasis markers turned into spaces of the same length
function blankLine(line) {
  const protectedParts = protectedRanges(line);
  const chars = line.split('');

  // Markers are searched in a copy where protected text and escaped markers are
  // solid filler: "**<u>sana</u>**" is still bold, "\*" opens nothing
  const probe = chars.slice();
  for (const [from, to] of protectedParts) probe.fill(FILLER, from, to);
  const solid = probe.join('').replace(/\\[*_#~>\\]/g, FILLER + FILLER);

  for (const [from, to] of [...protectedParts, ...markerRanges(solid)]) chars.fill(' ', from, to);
  return chars.join('');
}

/**
 * What a Voikko check sends: the distinct words, and the paragraph lines with
 * everything that is not prose blanked out. A blanked paragraph has the
 * length of the line, so an offset in it is the document offset minus `from`.
 * @param {string} text
 * @param {{splitBlocks?: Function}} [deps] default: src/editor/blocks.js
 * @returns {{words: string[], tokens: Array, paragraphs: Array<{from: number, text: string}>}}
 */
function buildVoikkoInput(text, deps) {
  const value = String(text == null ? '' : text);
  const splitBlocks = deps && deps.splitBlocks ? deps.splitBlocks : require('../../editor/blocks.js').splitBlocks;

  const tokens = tokenizeWords(value);
  const words = [...new Set(tokens.map(token => token.word))];
  const paragraphs = splitBlocks(value)
    .filter(block => block.kind === 'paragraph')
    .map(block => ({ from: block.from, text: blankLine(block.text) }));

  return { words, tokens, paragraphs };
}

/**
 * Findings of a Voikko check, in reading order.
 * @param {object} input
 * @param {string} input.text the checked text
 * @param {Array} input.tokens from buildVoikkoInput
 * @param {Array<{word: string, known: boolean, suggestions?: string[]}>} input.wordResults
 * @param {Array<{from: number, text: string}>} [input.paragraphs] from buildVoikkoInput
 * @param {Array<Array<{code, start, end, suggestions, explanation}>>} [input.grammarResults] one array per paragraph
 * @returns {Array<{id, kind: 'oikeinkirjoitus'|'kielioppi', from, to, quote, message, code, suggestions, count?}>}
 */
function voikkoFindings({ text, tokens, wordResults, paragraphs, grammarResults } = {}) {
  const value = String(text == null ? '' : text);
  const findings = [];

  // Spelling: every occurrence of an unknown word. A word without a result was not checked
  const byWord = new Map((wordResults || []).map(result => [result.word, result]));
  const counts = new Map();
  for (const token of tokens || []) counts.set(token.word, (counts.get(token.word) || 0) + 1);
  for (const token of tokens || []) {
    const result = byWord.get(token.word);
    if (!result || result.known !== false) continue;
    findings.push({
      id: `oikeinkirjoitus@${token.from}`,
      kind: 'oikeinkirjoitus',
      from: token.from,
      to: token.to,
      quote: value.slice(token.from, token.to),
      message: SPELLING_MESSAGE,
      code: null,
      suggestions: (result.suggestions || []).slice(0, MAX_SUGGESTIONS),
      count: counts.get(token.word)
    });
  }

  (paragraphs || []).forEach((paragraph, index) => {
    const source = value.slice(paragraph.from, paragraph.from + paragraph.text.length);
    const blanked = (pos) => pos >= 0 && pos < paragraph.text.length && paragraph.text[pos] !== source[pos];

    for (const error of (grammarResults && grammarResults[index]) || []) {
      // Spelling is already listed word by word
      if (error.code === GC_SPELLING) continue;
      if (GC_WHITESPACE.has(error.code)) {
        // The blanks that replaced a note or a marker cause these
        let touches = false;
        for (let pos = error.start - 1; pos <= error.end && !touches; pos++) touches = blanked(pos);
        if (touches) continue;
      }
      if (error.code === GC_CAPITAL && isSpeechTag(source, error.start)) continue;
      const from = paragraph.from + error.start;
      const to = paragraph.from + error.end;
      findings.push({
        id: `kielioppi-${error.code}@${from}`,
        kind: 'kielioppi',
        from,
        to,
        quote: value.slice(from, to),
        message: error.explanation || '',
        code: error.code,
        suggestions: error.suggestions || []
      });
    }
  });

  return findings.sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * Two ways to find the forms of a name: by Voikko's base form and by a plain
 * stem. The lists show what each way finds that the other one misses.
 * @returns {{byLemma: Array, byStem: Array, onlyLemma: string[], onlyStem: string[]}}
 */
function nameHits({ tokens, wordResults, name, stem } = {}) {
  const fold = (word) => String(word == null ? '' : word).toLocaleLowerCase('fi');
  const wanted = fold(name);
  const start = fold(stem || name);
  const byWord = new Map((wordResults || []).map(result => [result.word, result]));

  const hasLemma = (token) => {
    const result = byWord.get(token.word);
    return Boolean(result && (result.analyses || []).some(analysis => fold(analysis.BASEFORM) === wanted));
  };

  const byLemma = wanted ? (tokens || []).filter(hasLemma) : [];
  const byStem = start ? (tokens || []).filter(token => fold(token.word).startsWith(start)) : [];

  const forms = (list) => [...new Set(list.map(token => token.word))];
  const lemmaForms = forms(byLemma);
  const stemForms = forms(byStem);

  return {
    byLemma,
    byStem,
    onlyLemma: lemmaForms.filter(word => !stemForms.includes(word)),
    onlyStem: stemForms.filter(word => !lemmaForms.includes(word))
  };
}

module.exports = { tokenizeWords, buildVoikkoInput, voikkoFindings, nameHits };

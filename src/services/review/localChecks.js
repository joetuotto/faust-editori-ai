/**
 * The checks that run without a model
 *
 * Avoid words, long sentences and the typography questions are computed from
 * the live text every time it changes: they cost nothing, and a stale list of
 * avoid words is worse than none. No model, no network. The matcher, the
 * sentence splitter and the typography checker of the other modules arrive
 * in `deps` (test/services/localChecks.test.js).
 *
 * A finding here is { id, quote, from, to, located: true, approx: false,
 * before, after, note, suggestion: null, ref: null, data } with offsets of
 * the stored text and id = checkId + '@' + from.
 */

const { plainView } = require('../../editor/plainView.js');

const LOCAL = Object.freeze({
  DEFAULT_LONG_SENTENCE: 30,
  MIN_LONG_SENTENCE: 8,
  MAX_LONG_SENTENCE: 120,
  MAX_FINDINGS: 500,
  CONTEXT_CHARS: 32
});

// A lone dash is not a word; EU:n and maa-alue are one word each
const SENTENCE_WORD = /[\p{L}\p{N}][\p{L}\p{N}'’:-]*/gu;

const asText = (value) => (typeof value === 'string' ? value : '');

function localDraft(checkId, text, from, to, note, data) {
  return {
    id: `${checkId}@${from}`,
    quote: text.slice(from, to),
    from,
    to,
    located: true,
    approx: false,
    before: text.slice(Math.max(0, from - LOCAL.CONTEXT_CHARS), from),
    after: text.slice(to, to + LOCAL.CONTEXT_CHARS),
    note,
    suggestion: null,
    ref: null,
    data
  };
}

/**
 * One finding per place where a word of the project's avoid list is used.
 * @param {string} text
 * @param {string[]} words the list as the author wrote it
 * @param {{matchTerms: (text: string, words: string[]) => Array<{start: number, end: number, text: string, term: string}>}} deps
 *   the same matcher as the editor's highlight, so the list and the highlight always agree
 */
function avoidWordFindings(text, words, deps) {
  const value = asText(text);
  if (!value || !Array.isArray(words) || words.length === 0) return [];
  return deps.matchTerms(value, words).map(hit => localDraft(
    'avoid-words', value, hit.start, hit.end, `Vältettävä sana: ${hit.term}`, { term: hit.term }
  ));
}

/** Words of a sentence. Not the app's word count: that one is countWords in textTools. */
function sentenceWordCount(text) {
  const found = asText(text).match(SENTENCE_WORD);
  return found ? found.length : 0;
}

/** The limit of "Pitkät virkkeet" as an integer between 8 and 120; 30 when it is not a number. */
function clampLimit(n) {
  const value = typeof n === 'number' ? n : (typeof n === 'string' && n.trim() !== '' ? Number(n) : NaN);
  if (!Number.isFinite(value)) return LOCAL.DEFAULT_LONG_SENTENCE;
  return Math.min(LOCAL.MAX_LONG_SENTENCE, Math.max(LOCAL.MIN_LONG_SENTENCE, Math.round(value)));
}

/**
 * Sentences with more words than the limit. Paragraphs and list items are
 * checked, headings and > quote lines are not; notes do not count as words.
 * @param {string} text
 * @param {number} limit
 * @param {{splitBlocks: Function, splitSentences: Function}} deps
 */
function longSentenceFindings(text, limit, deps) {
  const value = asText(text);
  const max = clampLimit(limit);
  const view = plainView(value);
  const findings = [];

  for (const block of deps.splitBlocks(view.text)) {
    if (block.kind !== 'paragraph' && block.kind !== 'list') continue;
    for (const sentence of deps.splitSentences(block.body)) {
      const from = block.bodyFrom + sentence.from;
      const to = block.bodyFrom + sentence.to;
      const words = sentenceWordCount(view.text.slice(from, to));
      if (words <= max) continue;
      const range = view.rawRange(from, to);
      findings.push(localDraft(
        'long-sentences', value, range.from, range.to, `Virkkeessä on ${words} sanaa (raja ${max}).`, { words, limit: max }
      ));
    }
  }
  return findings;
}

/**
 * The lines the typography checker cannot decide: a list item or a line of
 * dialogue? The checker never fixes these itself. The finding covers the
 * whole line so that its highlight is visible.
 * @param {string} text
 * @param {{checkTypography: Function}} deps
 * @param {{language?: string, lineStartDash?: 'list'|'dialogue'}} [options]
 */
function typographyQuestionFindings(text, deps, options) {
  const value = asText(text);
  const { language = 'fi', lineStartDash = 'dialogue' } = options || {};
  if (!value || !deps || typeof deps.checkTypography !== 'function') return [];

  const findings = [];
  const seen = new Set();
  for (const hit of deps.checkTypography(value, { language, lineStartDash }) || []) {
    if (!hit || hit.level !== 'kysymys') continue;
    const from = value.lastIndexOf('\n', hit.from - 1) + 1;
    let to = value.indexOf('\n', hit.from);
    if (to === -1) to = value.length;
    if (to > from && value[to - 1] === '\r') to -= 1;
    if (seen.has(from)) continue;
    seen.add(from);
    findings.push(localDraft(
      'typography-questions', value, from, to, hit.message, { ruleId: hit.ruleId, url: hit.url, convert: hit.convert }
    ));
  }
  return findings;
}

/**
 * Run one local check on the live text.
 * @param {string} checkId
 * @param {{text: string, range: {from: number, to: number}|null, project: object, language?: string,
 *   lineStartDash?: 'list'|'dialogue'}} input
 * @param {object} deps matchTerms, splitBlocks, splitSentences, checkTypography?
 * @returns {{findings: Array<object>, message: string|null, total: number}}
 */
function runLocalCheck(checkId, input, deps) {
  const { text, range = null, project, language = 'fi', lineStartDash = 'dialogue' } = input || {};
  const value = asText(text);
  const none = (message = null) => ({ findings: [], message, total: 0 });
  if (!value) return none();

  let findings;
  if (checkId === 'avoid-words') {
    const words = project && Array.isArray(project.avoidWords) ? project.avoidWords.filter(word => asText(word).trim() !== '') : [];
    if (words.length === 0) return none('Vältettävien sanojen lista on tyhjä. Lisää sanat projektin asetuksissa.');
    findings = avoidWordFindings(value, words, deps);
  } else if (checkId === 'long-sentences') {
    findings = longSentenceFindings(value, project && project.review ? project.review.longSentenceWords : undefined, deps);
  } else if (checkId === 'typography-questions') {
    if (language !== 'fi') return none('Typografian tarkistus on tehty suomenkieliselle tekstille.');
    if (!deps || typeof deps.checkTypography !== 'function') return none('Typografian tarkistin ei ole käytettävissä.');
    // With a list setting a line-start "- " is a list item and nobody asks
    if (lineStartDash === 'list') return none('Projektin asetuksissa rivin alun viiva on luettelo, joten kysyttävää ei ole.');
    findings = typographyQuestionFindings(value, deps, { language, lineStartDash });
  } else {
    return none();
  }

  if (range) findings = findings.filter(finding => finding.from < range.to && finding.to > range.from);
  findings.sort((a, b) => a.from - b.from || a.to - b.to);

  const total = findings.length;
  if (total > LOCAL.MAX_FINDINGS) {
    return { findings: findings.slice(0, LOCAL.MAX_FINDINGS), message: 'Näytetään 500 ensimmäistä osumaa.', total };
  }
  return { findings, message: null, total };
}

module.exports = {
  LOCAL,
  avoidWordFindings,
  longSentenceFindings,
  typographyQuestionFindings,
  runLocalCheck,
  sentenceWordCount,
  clampLimit
};

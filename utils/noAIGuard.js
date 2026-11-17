/**
 * Wire guard for chapters marked "Ei tekoälylle"
 *
 * The checkbox promises that the chapter's text and summary are sent to no
 * model. The new features keep that promise in the context builder; the old
 * AI paths build their own prompts. This guard is the net under all of them:
 * the main process checks every outgoing request against the protected text
 * and refuses it when the two overlap.
 *
 * In FAUST a paragraph is one line, so whole lines are the wrong unit: a
 * sentence selected inside a paragraph must be found too. Two rules:
 *   1. any 40 characters of the request that start at a word start (also one
 *      right after a quotation mark or bracket) and also stand, from a word
 *      start, in a protected chapter;
 *   2. a whole line or sentence of the request, 20 characters or longer,
 *      that stands in a protected chapter.
 * A fragment under 20 characters gets through on purpose, and so does one of
 * 20 to 39 characters that is not a whole line or sentence of the request.
 *
 * Pure functions, loaded by the main process and by the renderer bundle
 * (test/utils/noAIGuard.test.js).
 */

const MIN_SEGMENT = 20;
const WINDOW = 40;

const SENTENCE_BREAK = /(?<=[.!?…])\s+/u;
const OUTER_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** NFC, every run of whitespace (no-break spaces included) as one space, trimmed. */
function squash(text) {
  return String(text == null ? '' : text).normalize('NFC').replace(/[\s\u00A0\u202F]+/g, ' ').trim();
}

const fieldText = (value) => (typeof value === 'string' ? value : '');

/**
 * The text and summaries of every protected chapter, children walked.
 * @returns {Array<{ title: string, text: string }>}
 */
function protectedChapters(project) {
  const chapters = [];

  const walk = (items) => {
    for (const item of Array.isArray(items) ? items : []) {
      if (!item || typeof item !== 'object') continue;
      if (item.noAI === true) {
        const text = squash([item.content, item.synopsis, item.synopsisManual, item.synopsisAI].map(fieldText).join('\n'));
        // Too short to be told apart from ordinary text
        if (text.length >= MIN_SEGMENT) {
          chapters.push({ title: fieldText(item.title).trim() || 'Nimetön luku', text });
        }
      }
      walk(item.children);
    }
  };

  walk(project && project.structure);
  return chapters;
}

// Offsets at which a word starts in squashed text
function wordStarts(text) {
  const starts = [];
  for (let index = 0; index < text.length; index++) {
    if (index === 0 || text[index - 1] === ' ') starts.push(index);
  }
  return starts;
}

// In a request, protected text often stands right after an opening quotation
// mark, bracket or tag on a line with other words. There a window also starts
// at a letter or digit that follows a character that is neither; the chapter
// side keeps the plain word starts.
function requestStarts(text) {
  const starts = [];
  let afterWordChar = false;
  for (let index = 0; index < text.length; index++) {
    const isWordChar = LETTER_OR_DIGIT.test(text[index]);
    if (index === 0 || text[index - 1] === ' ' || (isWordChar && !afterWordChar)) starts.push(index);
    afterWordChar = isWordChar;
  }
  return starts;
}

function indexChapter(chapter) {
  // Squashing again costs little and keeps the word starts right for any caller
  const text = squash(fieldText(chapter && chapter.text));
  const windows = new Set();
  for (const start of wordStarts(text)) {
    if (start + WINDOW > text.length) break;
    windows.add(text.slice(start, start + WINDOW));
  }
  return { title: fieldText(chapter && chapter.title), text, windows };
}

const isIndexed = (chapter) => Boolean(chapter) && chapter.windows instanceof Set;

/**
 * Prepare the protected chapters for many checks: every 40-character window
 * that starts at a word start. The main process builds this once per update.
 * @returns {Array<{ title: string, text: string, windows: Set<string> }>}
 */
function buildGuardIndex(chapters) {
  return (Array.isArray(chapters) ? chapters : [])
    .filter(chapter => chapter && typeof chapter === 'object')
    .map(chapter => (isIndexed(chapter) ? chapter : indexChapter(chapter)));
}

/**
 * Does a request text carry protected text?
 * @param {string} text everything the request would send
 * @param {Array} chaptersOrIndex protectedChapters(...) or buildGuardIndex(...)
 * @returns {{ title: string, snippet: string } | null} the chapter and at most
 *   40 characters of the matching text, so that the refusal can be understood
 */
function findProtected(text, chaptersOrIndex) {
  const index = buildGuardIndex(chaptersOrIndex);
  if (index.length === 0) return null;

  const request = squash(text);
  if (!request) return null;

  // 1. Windows: a sentence from inside a paragraph, short lines sent one
  // after another, a paragraph cut in the middle, text inside a prompt frame
  for (const start of requestStarts(request)) {
    if (start + WINDOW > request.length) break;
    const window = request.slice(start, start + WINDOW);
    for (const chapter of index) {
      if (chapter.windows.has(window)) return { title: chapter.title, snippet: window };
    }
  }

  // 2. Whole short pieces: a line or a sentence of 20 characters or more.
  // The line is a piece of its own: two or three short sentences that fill a
  // line are too short one by one, and a prompt frame puts a selection on its
  // own line.
  for (const line of String(text).split(/\r\n|\r|\n/)) {
    const sentences = line.split(SENTENCE_BREAK);
    for (const sentence of sentences.length > 1 ? [line, ...sentences] : sentences) {
      const piece = squash(sentence).replace(OUTER_PUNCTUATION, '');
      if (piece.length < MIN_SEGMENT) continue;
      for (const chapter of index) {
        if (chapter.text.includes(piece)) return { title: chapter.title, snippet: piece.slice(0, WINDOW) };
      }
    }
  }

  return null;
}

// Text of a message's content: a string, or blocks that carry text
function contentText(content) {
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  return content
    .map(part => (typeof part === 'string' ? part : part && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean);
}

/**
 * Every string a request payload would send, joined with line breaks: a bare
 * prompt string, or the prompt, system text and messages of an options object.
 */
function collectStrings(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';

  const parts = [];
  if (typeof payload.prompt === 'string') parts.push(payload.prompt);
  parts.push(...contentText(payload.system));
  for (const message of Array.isArray(payload.messages) ? payload.messages : []) {
    if (message && typeof message === 'object') parts.push(...contentText(message.content));
  }
  return parts.join('\n');
}

module.exports = {
  MIN_SEGMENT,
  WINDOW,
  squash,
  protectedChapters,
  buildGuardIndex,
  findProtected,
  collectStrings
};

/**
 * Text tools for the manuscript editor
 *
 * Pure functions: text and selection in, new text and selection out. The
 * editor content is plain text with Markdown-style markers, so "formatting"
 * means adding or removing markers. No DOM, no React, so everything here is
 * unit-tested (test/editor/textTools.test.js).
 *
 * An edit result is { text, selStart, selEnd }, or null when nothing changes.
 */

const WORD_CHAR = /[\p{L}\p{N}'’]/u;

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

/** Words in a text; 0 for empty or whitespace-only text. */
function countWords(text) {
  const trimmed = (text || '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Characters with and without whitespace (line breaks are not counted). */
function countCharacters(text) {
  const value = text || '';
  return {
    withSpaces: value.replace(/[\r\n]/g, '').length,
    withoutSpaces: value.replace(/\s/g, '').length
  };
}

/** Total words of all chapters, nested ones included. */
function countProjectWords(structure) {
  let total = 0;
  for (const item of structure || []) {
    if (!item) continue;
    total += countWords(item.content);
    total += countProjectWords(item.children);
  }
  return total;
}

/** Standard manuscript page: about 250 words. */
function estimatePages(words, wordsPerPage = 250) {
  return words > 0 ? Math.max(1, Math.ceil(words / wordsPerPage)) : 0;
}

// ---------------------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------------------

/** The word around a position, as [start, end]. Empty range if there is none. */
function wordAt(text, pos) {
  let start = pos;
  let end = pos;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) start--;
  while (end < text.length && WORD_CHAR.test(text[end])) end++;
  return [start, end];
}

/**
 * Wrap the selection in a marker pair, or remove the pair if it is already
 * there. With a bare cursor the word under it is used; with no word, an
 * empty pair is inserted and the cursor is placed inside it.
 */
function toggleInline(text, selStart, selEnd, open, close = open) {
  let start = Math.min(selStart, selEnd);
  let end = Math.max(selStart, selEnd);

  if (start === end) {
    [start, end] = wordAt(text, start);
    if (start === end) {
      // Cursor between an empty pair: take the pair away again
      if (text.slice(start - open.length, start) === open && text.slice(start, start + close.length) === close) {
        return {
          text: text.slice(0, start - open.length) + text.slice(start + close.length),
          selStart: start - open.length,
          selEnd: start - open.length
        };
      }
      return {
        text: text.slice(0, start) + open + close + text.slice(start),
        selStart: start + open.length,
        selEnd: start + open.length
      };
    }
  }

  // Markers must touch the text they wrap: leave surrounding spaces outside
  const selected = text.slice(start, end);
  start += selected.length - selected.trimStart().length;
  end -= selected.length - selected.trimEnd().length;
  if (start >= end) return null;

  // Pair just outside the selection: remove it
  if (text.slice(start - open.length, start) === open && text.slice(end, end + close.length) === close) {
    return {
      text: text.slice(0, start - open.length) + text.slice(start, end) + text.slice(end + close.length),
      selStart: start - open.length,
      selEnd: end - open.length
    };
  }

  // Pair at the edges inside the selection: remove it
  const inner = text.slice(start, end);
  if (inner.length >= open.length + close.length && inner.startsWith(open) && inner.endsWith(close)) {
    const bare = inner.slice(open.length, inner.length - close.length);
    return {
      text: text.slice(0, start) + bare + text.slice(end),
      selStart: start,
      selEnd: start + bare.length
    };
  }

  return {
    text: text.slice(0, start) + open + inner + close + text.slice(end),
    selStart: start + open.length,
    selEnd: end + open.length
  };
}

// ---------------------------------------------------------------------------
// Line formatting
// ---------------------------------------------------------------------------

const HEADING_PREFIX = /^#{1,6}\s+/;
const QUOTE_PREFIX = /^>\s?/;
const BULLET_PREFIX = /^[-+*]\s+(?!\*)/; // "* * *" is a scene break, not a list
const NUMBER_PREFIX = /^\d+[.)]\s+/;
const ANY_PREFIX = /^(#{1,6}\s+|>\s?|[-+*]\s+(?!\*)|\d+[.)]\s+)/;

/** The full lines touched by a selection. */
function lineRange(text, selStart, selEnd) {
  const from = Math.min(selStart, selEnd);
  let to = Math.max(selStart, selEnd);
  // A selection that ends right after a line break does not include the next line
  if (to > from && text[to - 1] === '\n') to -= 1;

  const start = text.lastIndexOf('\n', from - 1) + 1;
  let end = text.indexOf('\n', to);
  if (end === -1) end = text.length;
  return { start, end, lines: text.slice(start, end).split('\n') };
}

function replaceLines(text, selStart, selEnd, transform) {
  const range = lineRange(text, selStart, selEnd);
  const replaced = transform(range.lines).join('\n');
  if (replaced === text.slice(range.start, range.end)) return null;

  const single = range.lines.length === 1;
  return {
    text: text.slice(0, range.start) + replaced + text.slice(range.end),
    // One line: cursor at its end. Several: keep them selected for the next command.
    selStart: single ? range.start + replaced.length : range.start,
    selEnd: range.start + replaced.length
  };
}

/**
 * Make the selected lines a heading of the given level. Level 0, or the level
 * the line already has, turns it back into body text.
 */
function setHeading(text, selStart, selEnd, level) {
  return replaceLines(text, selStart, selEnd, (lines) => lines.map((line) => {
    if (!line.trim() && lines.length > 1) return line;
    const current = (HEADING_PREFIX.exec(line) || [''])[0].trim().length;
    const bare = line.replace(ANY_PREFIX, '');
    if (level === 0 || current === level) return bare;
    return `${'#'.repeat(level)} ${bare}`;
  }));
}

/**
 * Toggle a block quote, a bulleted list or a numbered list on the selected lines.
 * @param {'quote'|'bullet'|'numbered'} kind
 */
function toggleLinePrefix(text, selStart, selEnd, kind) {
  const pattern = { quote: QUOTE_PREFIX, bullet: BULLET_PREFIX, numbered: NUMBER_PREFIX }[kind];
  if (!pattern) return null;

  return replaceLines(text, selStart, selEnd, (lines) => {
    const filled = lines.filter(line => line.trim());
    const allHave = filled.length > 0 && filled.every(line => pattern.test(line));
    let number = 0;

    return lines.map((line) => {
      if (!line.trim() && lines.length > 1) return line;
      if (allHave) return line.replace(pattern, '');
      number += 1;
      const prefix = kind === 'quote' ? '> ' : kind === 'bullet' ? '- ' : `${number}. `;
      return prefix + line.replace(ANY_PREFIX, '');
    });
  });
}

/**
 * Enter inside a list or a quote: continue it on the next line, or end it if
 * the current item is empty. Returns null when the line is not a list or quote.
 */
function continueList(text, pos) {
  const start = text.lastIndexOf('\n', pos - 1) + 1;
  let end = text.indexOf('\n', pos);
  if (end === -1) end = text.length;
  const line = text.slice(start, end);

  const match = /^([-+*]\s+(?!\*)|(\d+)([.)])\s+|>\s?)/.exec(line);
  if (!match || pos < start + match[0].length) return null;

  // Empty item: remove the marker and stay on the line
  if (line.slice(match[0].length).trim() === '') {
    return { text: text.slice(0, start) + text.slice(end), selStart: start, selEnd: start };
  }

  const next = match[2] ? `${parseInt(match[2], 10) + 1}${match[3]} ` : match[0];
  const insert = `\n${next}`;
  return {
    text: text.slice(0, pos) + insert + text.slice(pos),
    selStart: pos + insert.length,
    selEnd: pos + insert.length
  };
}

// ---------------------------------------------------------------------------
// Plain edits
// ---------------------------------------------------------------------------

/** Replace the selection with text; the cursor ends up after it. */
function insertText(text, selStart, selEnd, insert) {
  if (!insert) return null;
  const start = Math.min(selStart, selEnd);
  const end = Math.max(selStart, selEnd);
  return {
    text: text.slice(0, start) + insert + text.slice(end),
    selStart: start + insert.length,
    selEnd: start + insert.length
  };
}

/** Run a function over the selected text and keep the result selected. */
function transformSelection(text, selStart, selEnd, transform) {
  const start = Math.min(selStart, selEnd);
  const end = Math.max(selStart, selEnd);
  if (start === end) return null;

  const replaced = transform(text.slice(start, end));
  if (replaced === text.slice(start, end)) return null;
  return {
    text: text.slice(0, start) + replaced + text.slice(end),
    selStart: start,
    selEnd: start + replaced.length
  };
}

/** Runs of spaces become one space; spaces at line ends go away. */
function trimSpaces(text) {
  return text.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/gm, '');
}

/** Several empty lines in a row become one. */
function collapseEmptyLines(text) {
  return text.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n');
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the search expression for find and replace.
 * Whole-word matching uses Unicode letter classes, so words that start or
 * end with ä, ö or å are found (\b only knows ASCII).
 * @returns {RegExp|null} null for an empty term or an invalid expression
 */
function buildSearchPattern(term, { caseSensitive = false, wholeWord = false, regex = false } = {}) {
  if (!term) return null;

  let source = regex ? term : escapeRegExp(term);
  if (wholeWord) {
    source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  }

  try {
    return new RegExp(source, `gu${caseSensitive ? '' : 'i'}`);
  } catch (error) {
    return null;
  }
}

/** All matches of a search in a text, as [{ start, end, text }]. */
function findMatches(text, term, options) {
  const pattern = buildSearchPattern(term, options);
  if (!pattern || !text) return [];

  const matches = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match[0].length === 0) {
      // An expression that matches nothing would loop forever
      pattern.lastIndex += 1;
      continue;
    }
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return matches;
}

/**
 * Replace every match in a text.
 * @returns {{ text: string, count: number }}
 */
function replaceAllMatches(text, term, replacement, options) {
  const matches = findMatches(text, term, options);
  if (matches.length === 0) return { text, count: 0 };

  let result = '';
  let cursor = 0;
  for (const match of matches) {
    result += text.slice(cursor, match.start) + replacement;
    cursor = match.end;
  }
  return { text: result + text.slice(cursor), count: matches.length };
}

module.exports = {
  countWords,
  countCharacters,
  countProjectWords,
  estimatePages,
  wordAt,
  toggleInline,
  setHeading,
  toggleLinePrefix,
  continueList,
  insertText,
  transformSelection,
  trimSpaces,
  collapseEmptyLines,
  buildSearchPattern,
  findMatches,
  replaceAllMatches
};

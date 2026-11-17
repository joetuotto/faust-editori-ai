/**
 * Lines of a chapter
 *
 * In FAUST a paragraph is one line. splitBlocks() numbers the lines of a text
 * and says what each one is, with the same rules as parseBlocks in
 * utils/manuscript.js. That module cannot be required here: it loads docx and
 * jszip, which do not belong in the renderer bundle. A parity test keeps the
 * two in step (test/editor/blocks.test.js).
 */

// The parseBlocks rules, in the parseBlocks order, with the marker kept apart
const SCENE_BREAK = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEADING = /^(#{1,6})(\s+)(.*)$/;
const QUOTE = /^(>\s?)(.*)$/;
const BULLET = /^(\s*([-*+])\s+)(.*)$/;
const NUMBERED = /^(\s*(\d+[.)])\s+)(.*)$/;
const DIALOGUE_DASH = /^[–—]/;

function describeLine(line) {
  if (!line.trim()) return { kind: 'blank', prefix: '', rest: '' };
  if (SCENE_BREAK.test(line)) return { kind: 'break', prefix: '', rest: '' };
  let match;
  if ((match = HEADING.exec(line))) {
    return { kind: 'heading', level: match[1].length, marker: match[1], prefix: match[1] + match[2], rest: match[3] };
  }
  if ((match = QUOTE.exec(line))) return { kind: 'quote', marker: '>', prefix: match[1], rest: match[2] };
  if ((match = BULLET.exec(line))) return { kind: 'list', ordered: false, marker: match[2], prefix: match[1], rest: match[3] };
  if ((match = NUMBERED.exec(line))) return { kind: 'list', ordered: true, marker: match[2], prefix: match[1], rest: match[3] };
  return { kind: 'paragraph', prefix: '', rest: line };
}

/**
 * One record per line, blank lines included, so blocks[n - 1].n === n and the
 * count equals the editor's line count. Offsets refer to the text given, also
 * when it uses \r\n or \r.
 * @returns {Array<{n: number, from: number, to: number, kind: string, text: string, prefix: string,
 *   body: string, bodyFrom: number, bodyTo: number, level?: number, ordered?: boolean, marker?: string,
 *   dialogue?: boolean}>}
 */
function splitBlocks(text) {
  const value = text == null ? '' : String(text);
  const blocks = [];
  const lineBreak = /\r\n|\r|\n/g;
  let from = 0;

  const push = (to) => {
    const line = value.slice(from, to);
    const info = describeLine(line);
    const empty = info.kind === 'blank' || info.kind === 'break';
    // The body is the editable text: after the marker and the indentation, without trailing spaces
    const body = info.rest.trim();
    const lead = info.rest.length - info.rest.trimStart().length;
    const bodyFrom = empty ? from : from + info.prefix.length + lead;

    const block = {
      n: blocks.length + 1,
      from,
      to,
      kind: info.kind,
      text: line,
      prefix: value.slice(from, bodyFrom),
      body,
      bodyFrom,
      bodyTo: bodyFrom + body.length
    };
    if (info.kind === 'heading') block.level = info.level;
    if (info.kind === 'list') block.ordered = info.ordered;
    if (info.marker) block.marker = info.marker;
    if (info.kind === 'paragraph') block.dialogue = DIALOGUE_DASH.test(body);
    blocks.push(block);
  };

  let match;
  while ((match = lineBreak.exec(value)) !== null) {
    push(match.index);
    from = match.index + match[0].length;
  }
  push(value.length);
  return blocks;
}

/**
 * The lines whose text may be sent to a model: `from`, `to` and `text` are
 * those of the body, so a list or quote marker never leaves the app.
 * @param {Array} blocks the result of splitBlocks
 * @param {{lists?: boolean, quotes?: boolean, dialogue?: boolean, dashDialogue?: boolean, from?: number, to?: number}} [options]
 * @returns {Array<{n: number, from: number, to: number, text: string, kind: string}>}
 */
function proseLines(blocks, options) {
  const { lists = true, quotes = false, dialogue = true, dashDialogue = false, from = 0, to = Infinity } = options || {};
  const out = [];
  for (const block of blocks || []) {
    if (!block.body) continue;
    // Only the lines a selection touches
    if (block.to < from || block.from > to) continue;

    let include = false;
    if (block.kind === 'paragraph') include = dialogue || !block.dialogue;
    // Dialogue typed as "- Hei" is a list line; with dashDialogue it follows the dialogue switch
    else if (block.kind === 'list') include = dashDialogue && block.marker === '-' ? dialogue : lists;
    else if (block.kind === 'quote') include = quotes;

    if (include) out.push({ n: block.n, from: block.bodyFrom, to: block.bodyTo, text: block.body, kind: block.kind });
  }
  return out;
}

/**
 * The line that contains a position. The end of a line belongs to that line,
 * and so does the inside of its \r\n. null outside the text.
 */
function blockAt(blocks, pos) {
  const list = blocks || [];
  if (!Number.isFinite(pos) || list.length === 0) return null;
  if (pos < list[0].from || pos > list[list.length - 1].to) return null;

  // The last line that starts at or before the position
  let low = 0;
  let high = list.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (list[middle].from <= pos) low = middle;
    else high = middle - 1;
  }
  const block = list[low];
  if (pos <= block.to) return block;
  // Past the end of the line but before the next one: between \r and \n
  const next = list[low + 1];
  return next && next.n === block.n + 1 ? block : null;
}

module.exports = { splitBlocks, proseLines, blockAt };

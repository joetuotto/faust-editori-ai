/**
 * Batches of lines for a model's window
 *
 * A long chapter is sent in pieces. batchParagraphs() packs lines (a paragraph
 * is one line) into batches that fit a budget; the unit of the budget is the
 * caller's: characters by default, estimated tokens with `measure`.
 * Pure function (test/services/batchParagraphs.test.js).
 */

// A reply is matched to its lines by number, and a short batch keeps one lost number from costing much
const DEFAULT_MAX_LINES = 40;
// What a line costs besides its text: its number and line break in the prompt
const DEFAULT_LINE_OVERHEAD = 8;

/**
 * Pack lines into batches that fit a budget. Order is kept and a line is never split.
 * @param {Array<string|{text: string}>} lines objects pass through untouched and by
 *   reference; a string becomes { n: position + 1, text }
 * @param {number|{max: number, maxLines?: number, lineOverhead?: number, measure?: (text: string, line: object) => number}} budget
 *   a number means { max: number }; maxChars is accepted as another name for max
 * @returns {Array<{index: number, lines: Array, size: number, oversize: boolean}>}
 * @throws {RangeError} when the budget is not a positive number
 */
function batchParagraphs(lines, budget) {
  const config = typeof budget === 'number' ? { max: budget } : (budget || {});
  const max = config.max !== undefined ? config.max : config.maxChars;
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) {
    throw new RangeError('batchParagraphs: budget must be a positive number');
  }
  const maxLines = Number.isFinite(config.maxLines) && config.maxLines >= 1 ? Math.floor(config.maxLines) : DEFAULT_MAX_LINES;
  const overhead = Number.isFinite(config.lineOverhead) && config.lineOverhead >= 0 ? config.lineOverhead : DEFAULT_LINE_OVERHEAD;
  const measure = typeof config.measure === 'function' ? config.measure : (text) => text.length;

  const batches = [];
  let current = null;
  const close = () => {
    if (current) batches.push(current);
    current = null;
  };

  (lines || []).forEach((line, position) => {
    const item = line !== null && typeof line === 'object' ? line : { n: position + 1, text: line == null ? '' : String(line) };
    const measured = Number(measure(item.text == null ? '' : String(item.text), item));
    const cost = (Number.isFinite(measured) && measured > 0 ? measured : 0) + overhead;

    if (cost > max) {
      // Over the budget by itself: a batch of its own, for the caller to decide about
      close();
      batches.push({ index: batches.length, lines: [item], size: cost, oversize: true });
      return;
    }
    if (current && (current.size + cost > max || current.lines.length >= maxLines)) close();
    if (!current) current = { index: batches.length, lines: [], size: 0, oversize: false };
    current.lines.push(item);
    current.size += cost;
  });
  close();
  return batches;
}

module.exports = { batchParagraphs };

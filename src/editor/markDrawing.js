/**
 * How a mark is drawn in the manuscript
 *
 * The suggestion layer, the Tarkistus findings, the avoid words and the Tarinakansio mentions each keep
 * a range of the text; this file owns the rules by which such a range becomes a drawing, so every mark
 * follows the same ones:
 *
 *  - trimmedRange: a mark's line (a deletion's strike, a finding's or a mention's underline) starts at
 *    the first and ends at the last character of its range that is not white space. Only the drawing is
 *    cut: the range itself stays as its owner made it, so accepting, rejecting and counting do not
 *    change. A range of white space only keeps its whole length, or it would not be seen at all.
 *  - softWrapGaps: where the text of a range goes on to the next visual line, the spaces at the turn
 *    carry no line either. The editor wraps with `white-space: break-spaces`, so the space at a soft
 *    wrap is a box at the end of the upper line and an underline would run on under it, past the last
 *    word. Where the lines turn is known only to the layout: the caller says where a character stands.
 *  - faceAt: the face of the manuscript at a position, read from the editor's own Markdown tree. An
 *    insertion suggestion is not document text, so the highlighter never sets it; it is drawn in the
 *    face that text put in at its place would get.
 *
 * Pure functions, no DOM, no CodeMirror or Lezer package (test/editor/markDrawing.test.js): the tree
 * and the layout arrive as arguments.
 */

/**
 * Where the line of a mark is drawn.
 * @param {string} text  the text of the mark's range
 * @param {number} from  the document offset of its first character
 * @returns {{ from: number, to: number }}
 */
function trimmedRange(text, from) {
  const value = typeof text === 'string' ? text : '';
  const inner = value.trim();
  if (!inner) return { from, to: from + value.length };
  const lead = value.length - value.trimStart().length;
  return { from: from + lead, to: from + lead + inner.length };
}

// b stands on a visual line below a: its top is under a's middle. Boxes of one visual line can differ by
// a few pixels (another face or size in the line), and the boxes of two tight lines can overlap.
const isBelow = (a, b) => b.top > (a.top + a.bottom) / 2;

/**
 * The white space at the soft wraps inside a range.
 * @param {string} text  the text of the range
 * @param {number} from  the document offset of its first character
 * @param {(pos: number) => ({ top: number, bottom: number } | null)} rectAt
 *   where the character at a document offset stands on screen; null when it is not drawn
 * @returns {Array<{ from: number, to: number }>} in document offsets, in order; empty when the range
 *   stands on one visual line, wraps inside a word, or is white space only
 */
function softWrapGaps(text, from, rectAt) {
  const value = typeof text === 'string' ? text : '';
  if (value.length < 2 || !value.trim() || !/[^\S\n\r]/.test(value)) return [];

  const rects = new Map();
  const rect = (index) => {
    if (!rects.has(index)) {
      const found = rectAt(from + index);
      rects.set(index, found && Number.isFinite(found.top) && Number.isFinite(found.bottom) ? found : null);
    }
    return rects.get(index);
  };

  // The indexes whose character is the first of a visual line. Lines only go down the page, so a
  // stretch whose two ends stand on one line has no turn inside it and is not looked into.
  const turns = [];
  const scan = (low, high) => {
    const a = rect(low);
    const b = rect(high);
    if (!a || !b || !isBelow(a, b)) return;
    if (high - low === 1) {
      turns.push(high);
      return;
    }
    const middle = (low + high) >> 1;
    scan(low, middle);
    scan(middle, high);
  };
  scan(0, value.length - 1);

  const gaps = [];
  for (const turn of turns) {
    let start = turn;
    let end = turn;
    while (start > 0 && /\s/.test(value[start - 1])) start--;
    while (end < value.length && /\s/.test(value[end])) end++;
    if (start === end) continue;                                  // the line turns inside a word
    if (/[\n\r]/.test(value.slice(start, end))) continue;        // a paragraph break, not a wrap
    const last = gaps[gaps.length - 1];
    if (last && from + start < last.to) continue;
    gaps.push({ from: from + start, to: from + end });
  }
  return gaps;
}

const HEADING = /^ATXHeading([1-6])$/;
// The width of the marker at each end of an inline node
const INLINE_MARK = { Emphasis: 1, StrongEmphasis: 2 };

/**
 * The face of the manuscript at a position: what text put in there would be set in.
 * Emphasis and strong count between their markers; a heading and a quotation from after their first
 * character to the end of their line (text typed at the end of a heading continues it).
 * @param {object} tree  the editor's Markdown syntax tree (Lezer: iterate({ from, to, enter }))
 * @param {number} pos   document offset
 * @returns {{ heading: number, quote: boolean, strong: boolean, emphasis: boolean }} heading: 0, or 1 to 6
 */
function faceAt(tree, pos) {
  const face = { heading: 0, quote: false, strong: false, emphasis: false };
  if (!tree || typeof tree.iterate !== 'function' || !Number.isInteger(pos)) return face;

  tree.iterate({
    from: pos,
    to: pos,
    enter(node) {
      const name = node.name;
      const heading = HEADING.exec(name);
      if (heading) {
        if (pos > node.from && pos <= node.to) face.heading = Number(heading[1]);
      } else if (name === 'Blockquote') {
        if (pos > node.from && pos <= node.to) face.quote = true;
      } else if (INLINE_MARK[name]) {
        const mark = INLINE_MARK[name];
        if (pos >= node.from + mark && pos <= node.to - mark) face[name === 'Emphasis' ? 'emphasis' : 'strong'] = true;
      }
    }
  });
  return face;
}

module.exports = { trimmedRange, softWrapGaps, faceAt };

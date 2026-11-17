/**
 * The target of a quick edit (Cmd+K)
 *
 * Decides which text an instruction applies to: the selection without the
 * whitespace at its ends, or, with a bare cursor, the paragraph under it
 * without its heading, list or quote marker. Pure function. The range is not
 * tracked here: the caller captures it in the editor, which maps it through
 * later changes.
 */

const WHITESPACE = /\s/;

/**
 * @param {string} text the chapter text
 * @param {number} selFrom
 * @param {number} selTo
 * @param {{ splitBlocks: Function, blockAt: Function }} [deps] default: ./blocks.js
 * @returns {{ ok: true, from: number, to: number, kind: 'selection'|'paragraph' } | { ok: false, code: 'no-paragraph' }}
 */
function resolveEditTarget(text, selFrom, selTo, deps) {
  const value = String(text == null ? '' : text);
  const clamp = (pos) => Math.max(0, Math.min(value.length, Number.isFinite(pos) ? pos : 0));
  let from = Math.min(clamp(selFrom), clamp(selTo));
  let to = Math.max(clamp(selFrom), clamp(selTo));
  const cursor = from;

  if (from !== to) {
    // A model trims its answer, so spaces at the ends would turn into suggestions
    while (from < to && WHITESPACE.test(value[from])) from += 1;
    while (to > from && WHITESPACE.test(value[to - 1])) to -= 1;
    if (from < to) return { ok: true, from, to, kind: 'selection' };
  }

  // Loaded here, not at the top: the module belongs to another package of the same change
  const blocks = deps && typeof deps.splitBlocks === 'function' && typeof deps.blockAt === 'function'
    ? deps
    : require('./blocks.js');

  const block = blocks.blockAt(blocks.splitBlocks(value), cursor);
  if (!block || block.kind === 'blank' || block.kind === 'break' || !block.body) {
    return { ok: false, code: 'no-paragraph' };
  }
  // The marker stays outside, so an edit cannot remove a heading or a list item
  return { ok: true, from: block.bodyFrom, to: block.bodyTo, kind: 'paragraph' };
}

module.exports = { resolveEditTarget };

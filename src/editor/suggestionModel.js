/**
 * Suggestion model for the manuscript editor
 *
 * A suggestion is a change that is drawn on top of the text and waits for the
 * author: the document does not change before it is accepted. All of that
 * logic lives here as plain data and pure functions (no DOM, no CodeMirror),
 * so it is unit-tested (test/editor/suggestionModel.test.js). The CodeMirror
 * shell (suggestionsCore.js) and the controller only call into this file.
 *
 * Offsets are UTF-16 offsets, half-open [from, to). from === to is a pure
 * insertion, insert === '' a pure deletion.
 *
 * One rule holds everywhere: every pending suggestion matches the text it sits
 * on (stillMatches). A change that touches a pending suggestion turns it into
 * a rejected one, which can come back only where its original still stands.
 */

const CONTEXT_CHARS = 16;
// Characters of old plus new text that one call of the word diff may get in a rebase
const REBASE_DIFF_LIMIT = 200000;
// Over that limit the lines are aligned first: at most this many lines put in or taken out
const LINE_EDIT_LIMIT = 2000;

const VIEW_MODES = ['changes', 'original', 'new'];

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

const counters = new Map();

/** 's1', 's2', … per prefix, unique for the app session. */
function nextId(prefix) {
  const next = (counters.get(prefix) || 0) + 1;
  counters.set(prefix, next);
  return prefix + next;
}

/** For tests. */
function resetIds() {
  counters.clear();
}

// ---------------------------------------------------------------------------
// Position mapping
// ---------------------------------------------------------------------------

const normalizeNewlines = (text) => String(text == null ? '' : text).replace(/\r\n?/g, '\n');

// Ends included: a change that only borders a range touches it
const touches = (aFrom, aTo, bFrom, bTo) => aFrom <= bTo && aTo >= bFrom;

/**
 * Position mapping over a list of changes (sorted, non-overlapping, in
 * old-text coordinates) with the semantics of CodeMirror's ChangeDesc.
 */
function makeMapper(changes) {
  // CodeMirror drops a change that changes nothing and joins two deletions
  // that touch into one section; the same here, so 'cover' is answered alike
  const list = [];
  for (const change of changes || []) {
    const previous = list[list.length - 1];
    if (change.from === change.to && change.insert === '') continue;
    if (previous && previous.insert === '' && change.insert === '' && change.from === previous.to) {
      list[list.length - 1] = { from: previous.from, to: change.to, insert: '' };
    } else {
      list.push(change);
    }
  }

  return {
    mapPos(pos, assoc = -1) {
      let delta = 0;
      for (const change of list) {
        if (change.from > pos) break;
        const length = change.to - change.from;
        if (change.to > pos || (change.to === pos && assoc < 0 && length === 0)) {
          return pos === change.from || assoc < 0
            ? change.from + delta
            : change.from + delta + change.insert.length;
        }
        delta += change.insert.length - length;
      }
      return pos + delta;
    },

    touchesRange(from, to = from) {
      for (const change of list) {
        if (change.from > to) break;
        if (change.to >= from) return change.from < from && change.to > to ? 'cover' : true;
      }
      return false;
    }
  };
}

// The start follows text inserted at it, the end does not: a range never
// grows over text typed at its edges
function mapRange(from, to, mapPos) {
  const start = mapPos(from, 1);
  return { from: start, to: Math.max(start, mapPos(to, -1)) };
}

function movedTo(item, mapPos) {
  const range = mapRange(item.from, item.to, mapPos);
  return range.from === item.from && range.to === item.to ? item : { ...item, from: range.from, to: range.to };
}

/**
 * Map a list of suggestions through a document change. A pending suggestion
 * that the change touches (ends included) is dropped; everything else moves.
 * @returns {{kept: object[], dropped: object[]}}
 */
function mapSuggestions(list, mapPos, touchesRange) {
  const kept = [];
  const dropped = [];
  for (const item of list || []) {
    if (item.state !== 'rejected' && touchesRange(item.from, item.to)) {
      dropped.push(item);
      continue;
    }
    kept.push(movedTo(item, mapPos));
  }
  return { kept, dropped };
}

/**
 * The stored context of an insertion point, cut back to the text this change
 * left alone. An insertion has no original to compare, so its context is what
 * stillMatches checks; text that a change next to it replaced can no longer be
 * expected to match. Call it with old-text positions, only for an item the
 * change does not touch (then the character on each side is always intact).
 * What it leaves is a shorter context, never a wrong one.
 */
function trimContext(item, touchesRange) {
  const context = item.context;
  if (!context) return item;

  let before = context.before.length;
  let after = context.after.length;
  if (before <= 1 && after <= 1) return item;
  if (!touchesRange(item.from - Math.max(before - 1, 0), item.to + Math.max(after - 1, 0))) return item;

  while (before > 1 && touchesRange(item.from - before + 1, item.from - 1)) before--;
  while (after > 1 && touchesRange(item.to + 1, item.to + after - 1)) after--;
  if (before === context.before.length && after === context.after.length) return item;

  return {
    ...item,
    context: {
      before: context.before.slice(context.before.length - before),
      after: context.after.slice(0, after)
    }
  };
}

// A collapsed range of a rejected replacement is not one: it still has its original
const isInsertion = (item) => item.from === item.to && !item.original;

// ---------------------------------------------------------------------------
// Comparing texts
// ---------------------------------------------------------------------------

/** The smallest single range that turns oldText into newText; null when equal. */
function singleChange(oldText, newText) {
  if (oldText === newText) return null;

  let start = 0;
  const shortest = Math.min(oldText.length, newText.length);
  while (start < shortest && oldText.charCodeAt(start) === newText.charCodeAt(start)) start++;

  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText.charCodeAt(oldEnd - 1) === newText.charCodeAt(newEnd - 1)) {
    oldEnd--;
    newEnd--;
  }

  return { from: start, to: oldEnd, insert: newText.slice(start, newEnd) };
}

/** Length of the common prefix (a valid position in both texts); -1 when equal. */
function firstDifference(a, b) {
  if (a === b) return -1;
  let index = 0;
  const shortest = Math.min(a.length, b.length);
  while (index < shortest && a.charCodeAt(index) === b.charCodeAt(index)) index++;
  return index;
}

/**
 * Is the text a suggestion was made for still in place? An insertion has no
 * text of its own, so its stored surroundings are compared instead.
 */
function stillMatches(docText, item) {
  if (docText.slice(item.from, item.to) !== item.original) return false;
  if (item.from !== item.to) return true;

  const context = item.context || { before: '', after: '' };
  return docText.slice(Math.max(0, item.from - context.before.length), item.from) === context.before &&
    docText.slice(item.to, item.to + context.after.length) === context.after;
}

/**
 * Where the text that was sent to a model stands now: the stored offsets
 * while it is still there, else its only occurrence, else null. For the two
 * old paths that write by stored offsets (voice editing, Hybrid rewrite).
 */
function relocateTarget(text, target) {
  if (!target || typeof target.text !== 'string' || target.text === '') return null;
  const source = String(text == null ? '' : text);

  if (Number.isInteger(target.start) && Number.isInteger(target.end) &&
      source.slice(target.start, target.end) === target.text) {
    return { from: target.start, to: target.end };
  }

  const first = source.indexOf(target.text);
  if (first === -1 || source.indexOf(target.text, first + 1) !== -1) return null;
  return { from: first, to: first + target.text.length };
}

// ---------------------------------------------------------------------------
// Rebasing onto another text
// ---------------------------------------------------------------------------

// A diff function comes from outside. Its result is used for positions only
// when it really is an edit script from a to b: sorted, inside a, and
// producing b. Anything else would move suggestions to the wrong words.
function isEditScript(changes, a, b) {
  if (!Array.isArray(changes)) return false;
  let pos = 0;
  let built = '';
  for (const change of changes) {
    if (!change || !Number.isInteger(change.from) || !Number.isInteger(change.to) || typeof change.insert !== 'string') return false;
    if (change.from < pos || change.to < change.from || change.to > a.length) return false;
    built += a.slice(pos, change.from) + change.insert;
    pos = change.to;
  }
  return built + a.slice(pos) === b;
}

// Lines with their line break; the last one without
function linesOf(text) {
  const lines = [];
  let start = 0;
  while (start < text.length) {
    const lineBreak = text.indexOf('\n', start);
    const end = lineBreak === -1 ? text.length : lineBreak + 1;
    lines.push({ text: text.slice(start, end), start });
    start = end;
  }
  return lines;
}

/**
 * Myers' greedy O(ND) alignment of two lists of lines, at most `cap` lines put
 * in or taken out. The blocks that differ, as [aFrom, aTo, bFrom, bTo] in line
 * indexes, or null over the cap.
 */
function alignLines(a, b, cap) {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const N = a.length - pre - suf;
  const M = b.length - pre - suf;
  if (N === 0 && M === 0) return [];
  if (N === 0 || M === 0) return [[pre, pre + N, pre, pre + M]];

  const max = Math.min(N + M, cap);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let found = -1;
  outer:
  for (let d = 0; d <= max; d++) {
    // The state after round d - 1, entries k = -d-1 .. d+1, for going back
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && a[pre + x] === b[pre + y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= N && y >= M) { found = d; break outer; }
    }
  }
  if (found === -1) return null;

  // Back from (N, M): the equal runs [x, y, length] of every round
  const runs = [];
  let x = N;
  let y = M;
  for (let d = found; d > 0; d--) {
    const prev = trace[d];
    const at = (k) => prev[k + d + 1];
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    const midX = down ? prevX : prevX + 1;
    const midY = down ? prevY + 1 : prevY;
    if (x > midX) runs.push([midX, midY, x - midX]);
    x = prevX;
    y = prevY;
  }
  if (x > 0) runs.push([0, 0, x]);
  runs.reverse();

  const blocks = [];
  let ax = 0;
  let by = 0;
  for (const [rx, ry, length] of runs) {
    if (rx > ax || ry > by) blocks.push([pre + ax, pre + rx, pre + by, pre + ry]);
    ax = rx + length;
    by = ry + length;
  }
  if (ax < N || by < M) blocks.push([pre + ax, pre + N, pre + by, pre + M]);
  return blocks;
}

/**
 * The edit script of a region too large for one call of the word diff (the
 * undo of "Hyväksy kaikki" in a long chapter): whole lines are aligned first,
 * then the word diff runs inside each block of lines that differs and is
 * within REBASE_DIFF_LIMIT. A larger block stays one replacement. With as many
 * lines on both sides and too many to align, line i is compared with line i.
 * Null when the lines cannot be aligned at all.
 */
function lineAlignedScript(oldPart, newPart, diff) {
  const linesA = linesOf(oldPart);
  const linesB = linesOf(newPart);
  let blocks = alignLines(linesA.map(line => line.text), linesB.map(line => line.text), LINE_EDIT_LIMIT);
  if (!blocks && linesA.length === linesB.length) {
    blocks = [];
    linesA.forEach((line, i) => { if (line.text !== linesB[i].text) blocks.push([i, i + 1, i, i + 1]); });
  }
  if (!blocks) return null;

  const startA = (i) => (i < linesA.length ? linesA[i].start : oldPart.length);
  const startB = (i) => (i < linesB.length ? linesB[i].start : newPart.length);
  const script = [];
  for (const [a0, a1, b0, b1] of blocks) {
    const from = startA(a0);
    const to = startA(a1);
    const before = oldPart.slice(from, to);
    const after = newPart.slice(startB(b0), startB(b1));
    let fine = null;
    if (before.length + after.length <= REBASE_DIFF_LIMIT) {
      try { fine = diff(before, after); } catch { fine = null; }
      if (!isEditScript(fine, before, after)) fine = null;
    }
    if (fine) fine.forEach(change => script.push({ from: change.from + from, to: change.to + from, insert: change.insert }));
    else script.push({ from, to, insert: after });
  }
  return script;
}

/**
 * How newText is reached from oldText: `coarse` is the one range between the
 * first and the last difference, `fineMap` the word-level mapping inside it
 * (only when something tracked lies there and a diff function was given). A
 * region larger than REBASE_DIFF_LIMIT is aligned by lines first, so the word
 * diff only sees the blocks that changed.
 */
function planRebase(oldText, newText, diff, somethingTouched) {
  const coarse = singleChange(oldText, newText);
  const coarseMap = makeMapper([coarse]);
  let fine = null;
  let fineMap = null;

  const size = (coarse.to - coarse.from) + coarse.insert.length;
  if (typeof diff === 'function' && somethingTouched(coarseMap)) {
    const oldPart = oldText.slice(coarse.from, coarse.to);
    let script = null;
    // A throwing diff must not break the editor's state update: fall back to the coarse range
    if (size <= REBASE_DIFF_LIMIT) {
      try { script = diff(oldPart, coarse.insert); } catch { script = null; }
    } else {
      script = lineAlignedScript(oldPart, coarse.insert, diff);
    }
    if (isEditScript(script, oldPart, coarse.insert)) {
      fine = script.map(change => ({
        from: change.from + coarse.from,
        to: change.to + coarse.from,
        insert: change.insert
      }));
      fineMap = makeMapper(fine);
    }
  }

  return { oldText, coarse, coarseMap, fine, fineMap, looseMap: fineMap || coarseMap };
}

/**
 * The same edit written one character further away from [from, to], or null
 * when it has no such form. An insertion or a deletion often has two equal
 * forms: taking "taas " out behind "Hän " is taking " taas" out behind "Hän".
 * Which one a diff reports is chance, and only one of them touches the word
 * that follows.
 */
function slidAway(changes, index, oldText, from, to) {
  const change = changes[index];
  const deletes = change.to > change.from;
  const text = change.insert;
  if (deletes === (text !== '')) return null;      // a replacement has one form only

  const previous = changes[index - 1];
  const next = changes[index + 1];

  // To the left: the character in front of the change equals the last one it removes or adds
  const atStart = deletes ? change.to === from : change.from === from;
  const last = deletes ? oldText[change.to - 1] : text[text.length - 1];
  if (atStart && change.from > 0 && (!previous || previous.to < change.from) && oldText[change.from - 1] === last) {
    return deletes
      ? { from: change.from - 1, to: change.to - 1, insert: '' }
      : { from: change.from - 1, to: change.from - 1, insert: oldText[change.from - 1] + text.slice(0, -1) };
  }

  // To the right: the character behind the change equals the first one it removes or adds
  const atEnd = change.from === to;
  const first = deletes ? oldText[change.from] : text[0];
  if (atEnd && change.to < oldText.length && (!next || next.from > change.to) && oldText[change.to] === first) {
    return deletes
      ? { from: change.from + 1, to: change.to + 1, insert: '' }
      : { from: change.from + 1, to: change.from + 1, insert: text.slice(1) + oldText[change.from] };
  }

  return null;
}

/**
 * A mapper under which no change touches [from, to], or null when a change
 * reaches into the range. A change that only borders it is rewritten in its
 * equal form further away when it has one.
 */
function mapperAround(from, to, changes, sharedMap, oldText) {
  let slid = null;
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index];
    if (change.from > to) break;
    if (change.to < from) continue;
    const away = slidAway(changes, index, oldText, from, to);
    if (!away) return null;
    if (!slid) slid = changes.slice();
    slid[index] = away;
  }
  return slid ? makeMapper(slid) : sharedMap;
}

// An insertion point moved by a mapper that does not touch it, its context cut
// back to the text the change left alone
const movedInsertion = (item, map) => movedTo(trimContext(item, map.touchesRange), map.mapPos);

// The word-level changes where the range lies inside the changed region, else the one coarse change
function mapperFor(from, to, plan) {
  const fine = plan.fine && plan.coarseMap.touchesRange(from, to);
  return fine
    ? mapperAround(from, to, plan.fine, plan.fineMap, plan.oldText)
    : mapperAround(from, to, [plan.coarse], plan.coarseMap, plan.oldText);
}

// A pending suggestion on the new text, or null when it did not survive
function rebasePending(item, plan, newText) {
  const map = mapperFor(item.from, item.to, plan);
  if (!map) return null;

  const moved = isInsertion(item) ? movedInsertion(item, map) : movedTo(item, map.mapPos);
  return stillMatches(newText, moved) ? moved : null;
}

// A rejected suggestion is never dropped. An insertion point that no change
// reaches keeps a context cut back like a pending one, so it can still be restored.
function rebaseRejected(item, plan) {
  if (isInsertion(item)) {
    const map = mapperFor(item.from, item.to, plan);
    if (map) return movedInsertion(item, map);
  }
  return movedTo(item, plan.looseMap.mapPos);
}

/**
 * Where a rejected suggestion stands after a change that put text back (the
 * undo of a deletion): its context and original, found exactly once around
 * the text the change inserted. Mapping alone cannot say this, because the
 * deletion collapsed the range. Null when it is not found or not unique.
 */
function findAgain(item, newText, plan) {
  const context = item.context || { before: '', after: '' };
  const needle = context.before + item.original + context.after;
  if (!needle) return null;

  const start = plan.coarse.from;
  const end = plan.coarse.from + plan.coarse.insert.length;
  let found = -1;
  for (let at = newText.indexOf(needle, Math.max(0, start - needle.length)); at !== -1 && at <= end; at = newText.indexOf(needle, at + 1)) {
    if (at + needle.length < start) continue;
    if (found !== -1) return null;
    found = at;
  }
  if (found === -1) return null;

  const from = found + context.before.length;
  return { ...item, from, to: from + item.original.length };
}

// Is the change within the length of the item's context and original from it?
function nearChange(item, plan) {
  const context = item.context || { before: '', after: '' };
  const reach = context.before.length + item.original.length + context.after.length;
  return touches(item.from - reach, item.to + reach, plan.coarse.from, plan.coarse.to);
}

/**
 * Move suggestions that are valid for oldText onto newText (an external
 * change, the return to a chapter, a proposal computed on an older text).
 * Pending suggestions survive only where their text is untouched; rejected
 * ones are never dropped, only mapped.
 * @param {(a: string, b: string) => Array<{from, to, insert}>} [diff] finest word diff
 * @returns {{kept: object[], dropped: object[]}}
 */
function rebaseSuggestions(list, oldText, newText, diff) {
  const items = list || [];
  if (oldText === newText) return { kept: items.slice(), dropped: [] };

  const plan = planRebase(oldText, newText, diff, map => items.some(item => map.touchesRange(item.from, item.to)));
  const kept = [];
  const dropped = [];
  for (const item of items) {
    if (item.state === 'rejected') {
      kept.push(rebaseRejected(item, plan));
      continue;
    }
    const moved = rebasePending(item, plan, newText);
    if (moved) kept.push(moved);
    else dropped.push(item);
  }
  return { kept, dropped };
}

// ---------------------------------------------------------------------------
// From changes to suggestions
// ---------------------------------------------------------------------------

function splitsSurrogatePair(text, pos) {
  if (pos <= 0 || pos >= text.length) return false;
  const high = text.charCodeAt(pos - 1);
  const low = text.charCodeAt(pos);
  return high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff;
}

/**
 * Check, sort and merge raw changes against the text they are for.
 * @returns {{changes: Array<{index, from, to, insert, id, meta}>, skipped: Array<{index: number, reason: 'range'|'mismatch'|'noop'|'overlap'}>}}
 *   `index` is the position in the input array (of the first part, for a merged change)
 */
function normalizeChanges(docText, changes) {
  const skipped = [];
  const valid = [];

  (changes || []).forEach((change, index) => {
    const from = change ? change.from : undefined;
    const to = change ? change.to : undefined;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > docText.length ||
        splitsSurrogatePair(docText, from) || splitsSurrogatePair(docText, to)) {
      skipped.push({ index, reason: 'range' });
      return;
    }

    const insert = normalizeNewlines(change.insert);
    const original = docText.slice(from, to);
    // The 5.7 check: the text the change was computed on is no longer there
    if (change.original != null && change.original !== original) {
      skipped.push({ index, reason: 'mismatch' });
      return;
    }
    if (insert === original) {
      skipped.push({ index, reason: 'noop' });
      return;
    }
    valid.push({ index, from, to, insert, id: change.id, meta: change.meta });
  });

  valid.sort((a, b) => a.from - b.from || a.to - b.to || a.index - b.index);

  const merged = [];
  for (const change of valid) {
    const previous = merged[merged.length - 1];
    if (previous && change.from < previous.to) {
      skipped.push({ index: change.index, reason: 'overlap' });
    } else if (previous && change.from === previous.to) {
      // Two changes end to start are one suggestion: accepting half of "" → ”” makes no sense
      previous.to = change.to;
      previous.insert += change.insert;
    } else {
      merged.push({ ...change });
    }
  }

  const result = merged.filter(change => {
    if (docText.slice(change.from, change.to) !== change.insert) return true;
    skipped.push({ index: change.index, reason: 'noop' });
    return false;
  });

  skipped.sort((a, b) => a.index - b.index);
  return { changes: result, skipped };
}

function contextAt(docText, from, to) {
  return {
    before: docText.slice(Math.max(0, from - CONTEXT_CHARS), from),
    after: docText.slice(to, to + CONTEXT_CHARS)
  };
}

function freshId(prefix, used) {
  let id = nextId(prefix);
  while (used.has(id)) id = nextId(prefix);
  return id;
}

/**
 * Turn changes into pending suggestions of one group. A change that touches
 * (ends included) a pending suggestion or the block position is skipped as
 * 'conflict', so two pending suggestions are always at least one unchanged
 * character apart and accepting one never touches another.
 * @returns {{items: object[], skipped: Array<{index, reason}>, indexes: number[]}}
 *   `indexes[i]` is the input index of `items[i]`
 */
function createSuggestions(docText, changes, options = {}) {
  const { meta = null, existing = [], blockPos = null } = options;
  const groupId = options.groupId || nextId('g');
  const normalized = normalizeChanges(docText, changes);
  const skipped = normalized.skipped.slice();
  const pending = existing.filter(item => item.state === 'pending');
  const usedIds = new Set(existing.map(item => item.id));
  const items = [];
  const indexes = [];

  for (const change of normalized.changes) {
    const conflict = pending.some(item => touches(change.from, change.to, item.from, item.to)) ||
      (blockPos != null && touches(change.from, change.to, blockPos, blockPos));
    if (conflict) {
      skipped.push({ index: change.index, reason: 'conflict' });
      continue;
    }

    const id = change.id != null && !usedIds.has(String(change.id)) ? String(change.id) : freshId('s', usedIds);
    usedIds.add(id);
    items.push({
      id,
      groupId,
      from: change.from,
      to: change.to,
      insert: change.insert,
      original: docText.slice(change.from, change.to),
      meta: change.meta != null ? change.meta : meta,
      context: contextAt(docText, change.from, change.to),
      state: 'pending'
    });
    indexes.push(change.index);
  }

  skipped.sort((a, b) => a.index - b.index);
  return { items, skipped, indexes };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function createState() {
  return {
    items: [],
    viewMode: 'changes',
    currentId: null,
    block: null,
    ranges: [],
    notice: null,
    rev: 0,
    event: null
  };
}

const pendingItems = (state) => state.items.filter(item => item.state === 'pending');
const rejectedItems = (state) => state.items.filter(item => item.state === 'rejected');
const pendingBlock = (state) => (state.block && state.block.state === 'pending' ? state.block : null);

/** Is there anything the review keys could act on? */
function hasReviewable(state) {
  return !!pendingBlock(state) || state.items.some(item => item.state === 'pending');
}

// Sorted by from, then to; equal ranges keep their proposal order (the sort is stable)
const sortItems = (items) => items.slice().sort((a, b) => a.from - b.from || a.to - b.to);

const sameList = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

// Nothing happened: the same object, unless an old event must be cleared
const unchanged = (state) => (state.event === null ? state : { ...state, event: null });

// A new state; rev grows with every event (and when `bump` says the drawing changed)
function changed(state, patch, event, bump = false) {
  return { ...state, ...patch, event: event || null, rev: state.rev + (event || bump ? 1 : 0) };
}

// The first pending suggestion at or after pos, else the first one, else the pending block
function currentFrom(items, block, pos) {
  let first = null;
  for (const item of items) {
    if (item.state !== 'pending') continue;
    if (item.from >= pos) return item.id;
    if (!first) first = item;
  }
  if (first) return first.id;
  return block && block.state === 'pending' ? block.id : null;
}

function isCurrent(items, block, id) {
  if (id == null) return false;
  if (block && block.state === 'pending' && block.id === id) return true;
  return items.some(item => item.id === id && item.state === 'pending');
}

function noticeFor(state, kind, count) {
  const showing = state.notice && state.notice.kind === kind ? state.notice.count : 0;
  return { kind, count: showing + count };
}

// A "dropped" notice less the suggestions that came back since (an undo of the edit that dropped
// them): null when none of them is gone any more, so the notification does not outlive its truth
function countOff(notice, broughtBack) {
  const reason = !notice ? null : notice.kind === 'dropped-edit' ? 'edited' : notice.kind === 'dropped-external' ? 'external' : null;
  const back = reason ? broughtBack[reason] || 0 : 0;
  if (!back) return notice;
  return notice.count > back ? { kind: notice.kind, count: notice.count - back } : null;
}

// --- The insert block -------------------------------------------------------

const shownAttempt = (block) => block.attempts[block.attempt] || null;
const isStreaming = (block) => block.attempts.some(attempt => attempt.status === 'streaming');

function cleanBlockText(text) {
  return normalizeNewlines(text).replace(/^\n+/, '').replace(/\s+$/, '');
}

/**
 * A block that leaves the screen keeps what it had: an attempt that was still
 * streaming is stored as stopped, an attempt without text is dropped. Null
 * when no attempt is left.
 */
function settleBlock(block) {
  if (!isStreaming(block)) return block;

  const shown = shownAttempt(block);
  const attempts = [];
  let shownIndex = -1;
  for (const attempt of block.attempts) {
    const streaming = attempt.status === 'streaming';
    if (streaming && attempt.text.trim() === '') continue;
    if (attempt === shown) shownIndex = attempts.length;
    attempts.push(streaming ? { ...attempt, status: 'stopped' } : attempt);
  }
  if (!attempts.length) return null;
  return { ...block, attempts, attempt: shownIndex === -1 ? attempts.length - 1 : shownIndex };
}

function blockAsSuggestion(block, insert) {
  const shown = shownAttempt(block);
  return {
    id: block.id,
    groupId: block.id,
    from: block.pos,
    to: block.pos,
    insert: typeof insert === 'string' ? insert : cleanBlockText(shown ? shown.text : ''),
    original: '',
    meta: block.meta,
    context: block.context,
    block: { attempts: block.attempts, attempt: block.attempt }
  };
}

// --- Mapping everything the state tracks ------------------------------------

function mapRanges(ranges, mapPos) {
  const next = ranges.map(range => movedTo(range, mapPos));
  return sameList(next, ranges) ? ranges : next;
}

/**
 * The block through a user edit. Text typed at its position goes in front of
 * it; only a change that reaches across the position rejects it.
 * @returns {{block: object|null, droppedId: string|null}}
 */
function mapBlock(block, mapPos, touchesRange) {
  if (!block) return { block, droppedId: null };

  const touched = touchesRange(block.pos, block.pos);
  const pos = mapPos(block.pos, 1);

  if (block.state !== 'pending') {
    return { block: pos === block.pos ? block : { ...block, pos }, droppedId: null };
  }
  if (touched === 'cover') {
    const settled = settleBlock(block);
    return { block: settled && { ...settled, pos, state: 'rejected', reason: 'edited' }, droppedId: block.id };
  }
  if (touched) {
    // The text right at the block changed on one side: only the other side still describes the place
    const afterHit = !!touchesRange(block.pos + 1, block.pos + 1);
    const beforeHit = (block.pos > 0 && !!touchesRange(block.pos - 1, block.pos - 1)) || !afterHit;
    const kept = trimContext({ from: block.pos, to: block.pos, context: block.context }, touchesRange).context;
    const context = { before: beforeHit ? '' : kept.before, after: afterHit ? '' : kept.after };
    return { block: { ...block, pos, context }, droppedId: null };
  }

  const trimmed = trimContext({ from: block.pos, to: block.pos, context: block.context }, touchesRange).context;
  if (pos === block.pos && trimmed === block.context) return { block, droppedId: null };
  return { block: { ...block, pos, context: trimmed }, droppedId: null };
}

/**
 * Suggestions through a document change that is known as a mapping (typing,
 * an accept). Touched pending ones become rejected/'edited'; the insertion
 * points that stay pending keep a context that matches the new text.
 */
function mapItems(items, mapPos, touchesRange) {
  // Rejected ones too: "Palauta hylätyt" compares the same context
  const prepared = items.map(item => (
    isInsertion(item) && !touchesRange(item.from, item.to) ? trimContext(item, touchesRange) : item
  ));
  const { kept, dropped } = mapSuggestions(prepared, mapPos, touchesRange);
  if (!dropped.length) return { items: sameList(kept, items) ? items : sortItems(kept), dropped: [] };

  const rejected = dropped.map(item => ({
    ...item,
    ...mapRange(item.from, item.to, mapPos),
    state: 'rejected',
    reason: 'edited'
  }));
  return { items: sortItems(kept.concat(rejected)), dropped: rejected };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

// Changes computed on an earlier text (baseText) become suggestions there,
// where every original matches by construction, and are then moved onto the
// document. What does not survive the move is skipped as 'target-changed'.
function changesInFrame(docText, changes, action) {
  const list = Array.isArray(changes) ? changes : [];
  const identity = { changes: list, sourceIndex: (index) => index, skipped: [] };
  if (typeof action.baseText !== 'string' || action.baseText === docText) return identity;

  const created = createSuggestions(action.baseText, list, { groupId: action.groupId, meta: action.meta });
  const moved = rebaseSuggestions(created.items, action.baseText, docText, action.diff);
  const inputIndex = new Map(created.items.map((item, i) => [item.id, created.indexes[i]]));
  const kept = new Set(moved.kept.map(item => item.id));

  const skipped = created.skipped.slice();
  for (const item of created.items) {
    if (!kept.has(item.id)) skipped.push({ index: inputIndex.get(item.id), reason: 'target-changed' });
  }

  const sources = moved.kept.map(item => inputIndex.get(item.id));
  return {
    changes: moved.kept.map(item => ({
      from: item.from, to: item.to, insert: item.insert, original: item.original, id: item.id, meta: item.meta
    })),
    sourceIndex: (index) => sources[index],
    skipped
  };
}

function proposedState(state, items, block, newIds, firstNew, skipped, action, groupId) {
  const reported = skipped.slice().sort((a, b) => a.index - b.index);
  const blocked = reported.filter(entry => entry.reason === 'conflict' || entry.reason === 'mismatch').length;
  const notice = blocked ? { kind: 'skipped', count: blocked } : null;

  if (!newIds.length && !reported.length && items === state.items && block === state.block) return unchanged(state);

  let currentId = state.currentId;
  if (firstNew != null && action.select !== false) currentId = firstNew;
  if (!isCurrent(items, block, currentId)) currentId = currentFrom(items, block, 0);

  return changed(state, { items, block, notice, currentId }, {
    type: 'proposed',
    ids: newIds,
    groupId,
    skipped: reported
  });
}

function reducePropose(state, action) {
  const docText = String(action.docText == null ? '' : action.docText);

  // A new attempt for the same target swaps the old group out: not rejected, not restorable
  let items = state.items;
  if (action.replaceGroupId != null) {
    const without = items.filter(item => !(item.state === 'pending' && item.groupId === action.replaceGroupId));
    if (without.length !== items.length) items = without;
  }

  if (action.restore) return reduceProposeRestore(state, items, action, docText);

  const groupId = action.groupId || nextId('g');
  const framed = changesInFrame(docText, action.changes, { ...action, groupId });
  const block = pendingBlock(state);
  const created = createSuggestions(docText, framed.changes, {
    groupId,
    meta: action.meta == null ? null : action.meta,
    existing: items,
    blockPos: block ? block.pos : null
  });

  const skipped = framed.skipped.concat(created.skipped.map(entry => ({
    index: framed.sourceIndex(entry.index),
    reason: entry.reason
  })));
  if (created.items.length) items = sortItems(items.concat(created.items));

  return proposedState(
    state, items, state.block,
    created.items.map(item => item.id),
    created.items.length ? created.items[0].id : null,
    skipped, action, groupId
  );
}

// Suggestions coming back after the undo of an accept: full objects with their
// own ids, groups and meta. They are what the text had before the accept, so
// whatever is pending in their place gives way.
function reduceProposeRestore(state, baseItems, action, docText) {
  const incoming = (Array.isArray(action.changes) ? action.changes : [])
    .map((change, index) => ({ change, index }))
    .sort((a, b) => ((a.change && a.change.from) || 0) - ((b.change && b.change.from) || 0) || a.index - b.index);

  const skipped = [];
  const restored = [];
  let block = state.block;
  let blockRestored = false;

  for (const { change, index } of incoming) {
    const checked = normalizeChanges(docText, change && change.block ? [{ ...change, insert: change.insert || ' ' }] : [change]);
    if (!checked.changes.length) {
      skipped.push({ index, reason: checked.skipped[0].reason });
      continue;
    }
    const { from, to, insert } = checked.changes[0];
    if (restored.some(item => touches(from, to, item.from, item.to)) ||
        (blockRestored && touches(from, to, block.pos, block.pos))) {
      skipped.push({ index, reason: 'overlap' });
      continue;
    }

    if (change.block) {
      // One block per chapter: a block that is on screen now stays
      const showing = pendingBlock({ block });
      if (blockRestored || (showing && showing.id !== change.id)) {
        skipped.push({ index, reason: 'conflict' });
        continue;
      }
      const attempts = Array.isArray(change.block.attempts) ? change.block.attempts : [];
      if (!attempts.length) {
        skipped.push({ index, reason: 'noop' });
        continue;
      }
      block = {
        id: change.id != null ? String(change.id) : nextId('b'),
        pos: from,
        attempts,
        attempt: Math.max(0, Math.min(attempts.length - 1, change.block.attempt | 0)),
        meta: change.meta == null ? null : change.meta,
        context: contextAt(docText, from, from),
        state: 'pending'
      };
      blockRestored = true;
      continue;
    }

    restored.push({
      id: change.id != null ? String(change.id) : nextId('s'),
      groupId: change.groupId || action.groupId || nextId('g'),
      from,
      to,
      insert,
      original: docText.slice(from, to),
      meta: change.meta != null ? change.meta : (action.meta == null ? null : action.meta),
      // The surroundings as they are now: the old ones may predate other accepts
      context: contextAt(docText, from, to),
      state: 'pending'
    });
  }

  let items = baseItems;
  if (restored.length || blockRestored) {
    const ids = new Set(restored.map(item => item.id));
    const inTheWay = (item) => restored.some(r => touches(item.from, item.to, r.from, r.to)) ||
      (blockRestored && touches(item.from, item.to, block.pos, block.pos));
    items = sortItems(baseItems
      .filter(item => !ids.has(item.id))
      .map(item => (item.state === 'pending' && inTheWay(item) ? { ...item, state: 'rejected', reason: 'external' } : item))
      .concat(restored));

    // A block on screen where a restored suggestion lands gives way as well
    if (!blockRestored && block && block.state === 'pending' && restored.some(r => touches(r.from, r.to, block.pos, block.pos))) {
      const settled = settleBlock(block);
      block = settled && { ...settled, state: 'rejected', reason: 'external' };
    }
  }

  const newIds = restored.map(item => item.id).concat(blockRestored ? [block.id] : []);
  const firstNew = restored.length && (!blockRestored || restored[0].from <= block.pos)
    ? restored[0].id
    : (blockRestored ? block.id : null);
  const groupId = action.groupId || (restored.length ? restored[0].groupId : (blockRestored ? block.id : null));

  return proposedState(state, items, block, newIds, firstNew, skipped, action, groupId);
}

function reduceAccepted(state, action) {
  const wanted = new Set(action.ids || []);
  const accepted = state.items.filter(item => item.state === 'pending' && wanted.has(item.id));
  if (!accepted.length) return unchanged(state);

  const rest = state.items.filter(item => !(item.state === 'pending' && wanted.has(item.id)));
  const mapped = mapItems(rest, action.mapPos, action.touchesRange);
  const block = mapBlock(state.block, action.mapPos, action.touchesRange).block;
  const patch = {
    items: mapped.items,
    block,
    ranges: mapRanges(state.ranges, action.mapPos),
    currentId: currentFrom(mapped.items, block, action.mapPos(accepted[0].from, 1))
  };
  if (mapped.dropped.length) patch.notice = noticeFor(state, 'dropped-edit', mapped.dropped.length);

  return changed(state, patch, {
    type: 'accepted',
    ids: accepted.map(item => item.id),
    items: accepted,
    bulk: accepted.length > 1
  });
}

function reduceReject(state, action) {
  const wanted = new Set(action.ids || []);
  const targets = state.items.filter(item => item.state === 'pending' && wanted.has(item.id));
  if (!targets.length) return unchanged(state);

  const items = state.items.map(item => (
    item.state === 'pending' && wanted.has(item.id) ? { ...item, state: 'rejected', reason: 'user' } : item
  ));
  return changed(state, { items, currentId: currentFrom(items, state.block, targets[0].from) }, {
    type: 'rejected',
    ids: targets.map(item => item.id),
    items: targets,
    bulk: targets.length > 1,
    reason: 'user'
  });
}

function reduceRestore(state, action) {
  const docText = String(action.docText == null ? '' : action.docText);
  const rejectedBlock = state.block && state.block.state === 'rejected' ? state.block : null;
  if (!rejectedBlock && !state.items.some(item => item.state === 'rejected')) return unchanged(state);

  const livePending = pendingItems(state);
  const blockNow = pendingBlock(state);
  const ids = [];
  let failed = 0;

  const items = state.items.map(item => {
    if (item.state !== 'rejected') return item;
    if (!stillMatches(docText, item) || livePending.some(p => touches(item.from, item.to, p.from, p.to)) ||
        (blockNow && touches(item.from, item.to, blockNow.pos, blockNow.pos))) {
      failed++;
      return item;
    }
    const { reason, ...rest } = item;
    const restored = { ...rest, state: 'pending' };
    livePending.push(restored);
    ids.push(item.id);
    return restored;
  });

  let block = state.block;
  if (rejectedBlock) {
    const place = { from: rejectedBlock.pos, to: rejectedBlock.pos, original: '', context: rejectedBlock.context };
    if (stillMatches(docText, place) && !livePending.some(p => touches(place.from, place.to, p.from, p.to))) {
      const { reason, ...rest } = rejectedBlock;
      block = { ...rest, state: 'pending' };
      ids.push(block.id);
    } else {
      failed++;
    }
  }

  let notice = state.notice;
  if (failed > 0) notice = { kind: 'restore-failed', count: failed };
  else if (notice && notice.kind === 'restore-failed') notice = null;

  let currentId = state.currentId;
  if (!isCurrent(items, block, currentId)) currentId = ids.length ? currentFrom(items, block, 0) : null;

  return changed(state, { items, block, notice, currentId }, { type: 'restored', ids, auto: false, failed });
}

function reduceMap(state, action) {
  if (!state.items.length && !state.block && !state.ranges.length) return unchanged(state);

  const mapped = mapItems(state.items, action.mapPos, action.touchesRange);
  const movedBlock = mapBlock(state.block, action.mapPos, action.touchesRange);
  const ranges = mapRanges(state.ranges, action.mapPos);

  const droppedIds = mapped.dropped.map(item => item.id).concat(movedBlock.droppedId ? [movedBlock.droppedId] : []);
  if (!droppedIds.length) {
    if (mapped.items === state.items && movedBlock.block === state.block && ranges === state.ranges) return unchanged(state);
    return changed(state, { items: mapped.items, block: movedBlock.block, ranges }, null);
  }

  let currentId = state.currentId;
  if (!isCurrent(mapped.items, movedBlock.block, currentId)) {
    const at = mapped.dropped.length ? mapped.dropped[0].from : action.mapPos(state.block.pos, 1);
    currentId = currentFrom(mapped.items, movedBlock.block, at);
  }

  return changed(state, {
    items: mapped.items,
    block: movedBlock.block,
    ranges,
    currentId,
    notice: noticeFor(state, 'dropped-edit', droppedIds.length)
  }, { type: 'dropped', ids: droppedIds, reason: 'edited' });
}

function reduceRebase(state, action) {
  const oldText = String(action.oldText == null ? '' : action.oldText);
  const newText = String(action.newText == null ? '' : action.newText);
  if (oldText === newText) return unchanged(state);
  if (!state.items.length && !state.block && !state.ranges.length) return unchanged(state);

  const plan = planRebase(oldText, newText, action.diff, map => (
    state.items.some(item => map.touchesRange(item.from, item.to)) ||
    (state.block && map.touchesRange(state.block.pos, state.block.pos)) ||
    state.ranges.some(range => map.touchesRange(range.from, range.to))
  ));
  const loose = plan.looseMap;
  const droppedIds = [];
  const restoredIds = [];

  // 1. Pending suggestions survive only where their text is untouched
  let items = state.items.map(item => {
    if (item.state !== 'pending') return rebaseRejected(item, plan);
    const moved = rebasePending(item, plan, newText);
    if (moved) return moved;
    droppedIds.push(item.id);
    return { ...movedTo(item, loose.mapPos), state: 'rejected', reason: 'external' };
  });

  // 2. The block: an insertion point that must still be the same place
  let block = state.block;
  let blockWasPending = false;
  if (block) {
    if (block.state === 'pending') {
      blockWasPending = true;
      const around = mapperFor(block.pos, block.pos, plan);
      const map = around || loose;
      const pos = map.mapPos(block.pos, 1);
      // Where no change reaches the place, only the text the change left alone is compared
      const context = around
        ? trimContext({ from: block.pos, to: block.pos, context: block.context }, map.touchesRange).context
        : block.context;
      const covered = loose.touchesRange(block.pos, block.pos) === 'cover';
      if (!covered && stillMatches(newText, { from: pos, to: pos, original: '', context })) {
        if (pos !== block.pos || context !== block.context) block = { ...block, pos, context };
      } else {
        droppedIds.push(block.id);
        const settled = settleBlock(block);
        block = settled && { ...settled, pos, state: 'rejected', reason: 'external' };
      }
    } else {
      const pos = loose.mapPos(block.pos, 1);
      if (pos !== block.pos) block = { ...block, pos };
    }
  }

  // 3. What an earlier change pushed aside comes back when this change put its text back
  //    (type into a suggestion, press Cmd+Z). Never what the author rejected.
  const pendingNow = items.filter(item => item.state === 'pending');
  const blockPending = () => (block && block.state === 'pending' ? block : null);
  const free = (from, to) => !pendingNow.some(p => touches(from, to, p.from, p.to)) &&
    !(blockPending() && touches(from, to, block.pos, block.pos));
  const pushedAside = (entry) => entry.reason === 'edited' || entry.reason === 'external';
  const broughtBack = { edited: 0, external: 0 };

  items = items.map((item, index) => {
    const before = state.items[index];
    if (before.state !== 'rejected') return item;
    const touched = !!plan.coarseMap.touchesRange(before.from, before.to);
    // A range that an earlier deletion collapsed finds its text again where this change put it
    // back; a collapsed range may sit just outside the change, within the reach of its context
    let placed = item;
    if (!stillMatches(newText, item) && (touched || nearChange(before, plan))) placed = findAgain(item, newText, plan) || item;
    if (!touched && placed === item) return item;
    if (!pushedAside(before) || !stillMatches(newText, placed) || !free(placed.from, placed.to)) return placed;
    const { reason, ...rest } = placed;
    broughtBack[before.reason] += 1;
    const restored = { ...rest, state: 'pending' };
    pendingNow.push(restored);
    restoredIds.push(item.id);
    return restored;
  });

  if (block && !blockWasPending && block.state === 'rejected' && plan.coarseMap.touchesRange(state.block.pos, state.block.pos)) {
    const place = { from: block.pos, to: block.pos, original: '', context: block.context };
    const found = stillMatches(newText, place) ? null : findAgain(place, newText, plan);
    if (found) block = { ...block, pos: found.from };
  }
  if (block && !blockWasPending && block.state === 'rejected' && pushedAside(block) &&
      plan.coarseMap.touchesRange(state.block.pos, state.block.pos) &&
      stillMatches(newText, { from: block.pos, to: block.pos, original: '', context: block.context }) &&
      !pendingNow.some(p => touches(block.pos, block.pos, p.from, p.to))) {
    const { reason, ...rest } = block;
    broughtBack[reason] += 1;
    block = { ...rest, state: 'pending' };
    restoredIds.push(block.id);
  }

  items = sameList(items, state.items) ? state.items : sortItems(items);
  const ranges = mapRanges(state.ranges, loose.mapPos);

  if (!droppedIds.length && !restoredIds.length) {
    if (items === state.items && block === state.block && ranges === state.ranges) return unchanged(state);
    return changed(state, { items, block, ranges }, null);
  }

  let currentId = state.currentId;
  if (!isCurrent(items, block, currentId)) currentId = currentFrom(items, block, plan.coarseMap.mapPos(plan.coarse.from, -1));

  // What this change brought back is no longer gone: the notice that said so counts it off (C-L7)
  const notice = countOff(state.notice, broughtBack);
  const patch = { items, block, ranges, currentId, notice };
  if (droppedIds.length) patch.notice = noticeFor({ notice }, 'dropped-external', droppedIds.length);

  return changed(state, patch, droppedIds.length
    ? { type: 'dropped', ids: droppedIds, reason: 'external', restored: restoredIds }
    : { type: 'restored', ids: restoredIds, auto: true, failed: 0 });
}

function reduceRemove(state, action) {
  const wanted = new Set(action.ids || []);
  const removed = state.items.filter(item => wanted.has(item.id));
  const dropBlock = !!state.block && wanted.has(state.block.id);
  if (!removed.length && !dropBlock) return unchanged(state);

  const items = removed.length ? state.items.filter(item => !wanted.has(item.id)) : state.items;
  const block = dropBlock ? null : state.block;
  let currentId = state.currentId;
  if (!isCurrent(items, block, currentId)) {
    currentId = currentFrom(items, block, removed.length ? removed[0].from : state.block.pos);
  }

  return changed(state, { items, block, currentId }, {
    type: 'removed',
    ids: removed.map(item => item.id).concat(dropBlock ? [state.block.id] : [])
  });
}

function reduceCursor(state, action) {
  const head = action.head;
  const under = state.items.find(item => item.state === 'pending' && head >= item.from && head <= item.to);
  if (!under || under.id === state.currentId) return unchanged(state);
  return changed(state, { currentId: under.id }, { type: 'current', id: under.id });
}

function reduceSetCurrent(state, action) {
  if (action.id === state.currentId || !isCurrent(state.items, state.block, action.id)) return unchanged(state);
  return changed(state, { currentId: action.id }, { type: 'current', id: action.id });
}

// The review order: pending suggestions by position, plus the finished block at its place
function reviewOrder(state) {
  const order = pendingItems(state).map(item => ({ id: item.id, from: item.from }));
  const block = pendingBlock(state);
  if (block && !isStreaming(block)) {
    const at = order.findIndex(entry => entry.from > block.pos);
    order.splice(at === -1 ? order.length : at, 0, { id: block.id, from: block.pos });
  }
  return order;
}

function reduceStep(state, action) {
  const order = reviewOrder(state);
  if (!order.length) return unchanged(state);

  const forward = action.direction !== -1;
  const index = order.findIndex(entry => entry.id === state.currentId);
  let target;
  if (index !== -1) {
    target = order[(index + (forward ? 1 : -1) + order.length) % order.length];
  } else {
    const head = Number.isFinite(action.head) ? action.head : 0;
    if (forward) target = order.find(entry => entry.from > head) || order[0];
    else target = order.filter(entry => entry.from < head).pop() || order[order.length - 1];
  }

  if (target.id === state.currentId) return unchanged(state);
  return changed(state, { currentId: target.id }, { type: 'current', id: target.id });
}

function reduceRange(state, action) {
  if (action.type === 'rangeAdd') {
    if (action.id == null || !Number.isInteger(action.from) || !Number.isInteger(action.to) || action.to < action.from) {
      return unchanged(state);
    }
    const range = {
      id: action.id,
      from: action.from,
      to: action.to,
      text: String(action.text == null ? '' : action.text),
      highlight: !!action.highlight
    };
    const previous = state.ranges.find(entry => entry.id === action.id);
    const others = previous ? state.ranges.filter(entry => entry !== previous) : state.ranges;
    return changed(state, { ranges: others.concat([range]) }, null, range.highlight || !!(previous && previous.highlight));
  }

  const existing = state.ranges.find(entry => entry.id === action.id);
  if (!existing) return unchanged(state);

  if (action.type === 'rangeRemove') {
    return changed(state, { ranges: state.ranges.filter(entry => entry !== existing) }, null, existing.highlight);
  }

  // rangeHighlight
  const highlight = !!action.highlight;
  if (existing.highlight === highlight) return unchanged(state);
  return changed(state, {
    ranges: state.ranges.map(entry => (entry === existing ? { ...entry, highlight } : entry))
  }, null, true);
}

function reduceBlock(state, action) {
  const blockEvent = (name, blockId, extra) => ({ type: 'block', action: name, blockId, ...extra });

  if (action.type === 'blockStart') {
    const id = action.id != null ? String(action.id) : nextId('b');
    if (pendingBlock(state)) return changed(state, {}, blockEvent('refused', id, { reason: 'busy' }));

    const docText = String(action.docText == null ? '' : action.docText);
    let pos = Math.max(0, Math.min(docText.length, Number.isInteger(action.pos) ? action.pos : docText.length));
    if (splitsSurrogatePair(docText, pos)) pos -= 1;
    if (state.items.some(item => item.state === 'pending' && touches(pos, pos, item.from, item.to))) {
      return changed(state, {}, blockEvent('refused', id, { reason: 'conflict' }));
    }

    const block = {
      id,
      pos,
      attempts: [{ text: '', status: 'streaming', note: null }],
      attempt: 0,
      meta: action.meta == null ? null : action.meta,
      context: contextAt(docText, pos, pos),
      state: 'pending'
    };
    return changed(state, { block, currentId: id }, blockEvent('start', id));
  }

  const block = pendingBlock(state);
  if (!block || block.id !== action.id) return unchanged(state);
  const shown = shownAttempt(block);
  const withAttempt = (attempt) => block.attempts.map((entry, index) => (index === block.attempt ? attempt : entry));

  switch (action.type) {
    case 'blockAppend': {
      const text = normalizeNewlines(action.text);
      if (!shown || shown.status !== 'streaming' || text === '') return unchanged(state);
      return changed(state, { block: { ...block, attempts: withAttempt({ ...shown, text: shown.text + text }) } },
        blockEvent('append', block.id));
    }

    case 'blockFinish': {
      // Only a streaming attempt can be finished: a late result must never empty an attempt the author kept
      if (!shown || shown.status !== 'streaming') return unchanged(state);
      const status = action.status === 'stopped' || action.status === 'error' ? action.status : 'done';
      const text = typeof action.text === 'string' ? normalizeNewlines(action.text) : shown.text;
      const meta = action.meta != null ? action.meta : block.meta;

      if (text.trim() === '') {
        const attempts = block.attempts.filter((entry, index) => index !== block.attempt);
        if (!attempts.length) {
          const currentId = state.currentId === block.id ? currentFrom(state.items, null, block.pos) : state.currentId;
          return changed(state, { block: null, currentId }, blockEvent('empty', block.id));
        }
        return changed(state, { block: { ...block, attempts, attempt: attempts.length - 1, meta } }, blockEvent('empty', block.id));
      }

      const note = action.note == null || action.note === '' ? null : String(action.note);
      return changed(state, { block: { ...block, attempts: withAttempt({ text, status, note }), meta } },
        blockEvent('finish', block.id));
    }

    case 'blockRetry': {
      if (isStreaming(block)) return unchanged(state);
      const attempts = block.attempts.concat([{ text: '', status: 'streaming', note: null }]);
      return changed(state, { block: { ...block, attempts, attempt: attempts.length - 1 } }, blockEvent('retry', block.id));
    }

    case 'blockShow': {
      if (isStreaming(block) || !Number.isFinite(action.index)) return unchanged(state);
      const index = Math.max(0, Math.min(block.attempts.length - 1, Math.trunc(action.index)));
      if (index === block.attempt) return unchanged(state);
      return changed(state, { block: { ...block, attempt: index } }, blockEvent('show', block.id));
    }

    case 'blockReject': {
      const settled = settleBlock(block);
      const rejected = settled && { ...settled, state: 'rejected', reason: 'user' };
      return changed(state, { block: rejected, currentId: currentFrom(state.items, null, block.pos) }, {
        type: 'rejected',
        ids: [block.id],
        items: [blockAsSuggestion(settled || block, action.insert)],
        bulk: false,
        reason: 'user',
        block: true
      });
    }

    case 'blockAccepted': {
      if (!shown || shown.status === 'streaming') return unchanged(state);
      const mapped = mapItems(state.items, action.mapPos, action.touchesRange);
      const patch = {
        items: mapped.items,
        block: null,
        ranges: mapRanges(state.ranges, action.mapPos),
        currentId: currentFrom(mapped.items, null, action.mapPos(block.pos, 1))
      };
      if (mapped.dropped.length) patch.notice = noticeFor(state, 'dropped-edit', mapped.dropped.length);
      return changed(state, patch, {
        type: 'accepted',
        ids: [block.id],
        items: [blockAsSuggestion(block, action.insert)],
        bulk: false,
        block: { attempts: block.attempts, attempt: block.attempt }
      });
    }

    default:
      return unchanged(state);
  }
}

/**
 * The reducer. It never mutates its input. `event` says what this call did
 * (null for pure position mapping and for a call that changed nothing) and
 * `rev` grows by one with every event. A call that changes nothing returns the
 * state it was given; only a left-over `event` is cleared in a copy.
 */
function reduce(state, action) {
  if (!action || typeof action.type !== 'string') return unchanged(state);

  switch (action.type) {
    case 'propose': return reducePropose(state, action);
    case 'accepted': return reduceAccepted(state, action);
    case 'reject': return reduceReject(state, action);
    case 'restore': return reduceRestore(state, action);
    case 'map': return reduceMap(state, action);
    case 'rebase': return reduceRebase(state, action);
    case 'remove': return reduceRemove(state, action);
    case 'cursor': return reduceCursor(state, action);
    case 'setCurrent': return reduceSetCurrent(state, action);
    case 'step': return reduceStep(state, action);

    case 'setView':
      if (!VIEW_MODES.includes(action.viewMode) || action.viewMode === state.viewMode) return unchanged(state);
      return changed(state, { viewMode: action.viewMode }, { type: 'view', viewMode: action.viewMode });

    case 'clearNotice':
      if (state.notice === null) return unchanged(state);
      return changed(state, { notice: null }, { type: 'notice' });

    case 'rangeAdd':
    case 'rangeRemove':
    case 'rangeHighlight':
      return reduceRange(state, action);

    case 'blockStart':
    case 'blockAppend':
    case 'blockFinish':
    case 'blockRetry':
    case 'blockShow':
    case 'blockReject':
    case 'blockAccepted':
      return reduceBlock(state, action);

    default:
      return unchanged(state);
  }
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * The changes of the pending suggestions among `ids` (null: all of them),
 * sorted by position. One list is one editor transaction.
 */
function acceptChanges(state, ids) {
  const wanted = ids == null ? null : new Set(ids);
  return pendingItems(state)
    .filter(item => !wanted || wanted.has(item.id))
    .map(item => ({ from: item.from, to: item.to, insert: item.insert }));
}

/**
 * The pending suggestions a bulk accept takes, in document order: those of
 * the group (null: of the chapter), never one on a dialogue line. Dialogue is
 * accepted one suggestion at a time.
 */
function bulkAcceptIds(state, groupId) {
  return pendingItems(state)
    .filter(item => groupId == null || item.groupId === groupId)
    .filter(item => !(item.meta && item.meta.dialogue === true))
    .map(item => item.id);
}

const TIGHT_AFTER = /^[\s.,;:!?…)”»]/;

/**
 * What accepting the block inserts at pos: the model's text fitted to its
 * place, as a paragraph of its own between paragraphs and inline inside one.
 */
function blockInsertText(docText, pos, text) {
  const body = cleanBlockText(text);
  if (!body) return '';

  const source = String(docText == null ? '' : docText);
  const lineStart = source.lastIndexOf('\n', pos - 1) + 1;
  let lineEnd = source.indexOf('\n', pos);
  if (lineEnd === -1) lineEnd = source.length;
  const before = source.slice(lineStart, pos);
  const after = source.slice(pos, lineEnd);
  // Chapters are written either with or without a blank line between paragraphs
  const gap = /\n[ \t]*\n/.test(source) ? '\n\n' : '\n';

  if (!before.trim() && !after.trim()) return body;
  if (!after.trim()) return gap + body;
  if (!before.trim()) return body + gap;

  const lead = /\s$/.test(before) || TIGHT_AFTER.test(body) ? '' : ' ';
  const trail = TIGHT_AFTER.test(after) ? '' : ' ';
  return lead + body + trail;
}

/** The change that accepts the block, or null (no block, still streaming, failed, nothing to insert). */
function blockChange(state, docText) {
  const block = pendingBlock(state);
  if (!block) return null;
  const shown = shownAttempt(block);
  // A failed attempt shows "Ei tekstiä." and has no Hyväksy: ⌘↩ must not insert it either
  if (!shown || shown.status === 'streaming' || shown.status === 'error') return null;
  const insert = blockInsertText(docText, block.pos, shown.text);
  return insert ? { from: block.pos, to: block.pos, insert } : null;
}

/**
 * Plain descriptions of what to draw, sorted by position. The shell turns
 * them into decorations.
 */
function decorationSpecs(state) {
  const specs = [];
  const add = (at, spec) => specs.push({ at, order: specs.length, spec });
  const mode = state.viewMode;

  for (const item of state.items) {
    if (item.state !== 'pending') continue;
    const { id, from, to } = item;
    const current = id === state.currentId;
    const ranged = from < to;

    if (mode === 'changes') {
      if (ranged) add(from, { kind: 'del', from, to, id, current });
      for (let i = item.original.indexOf('\n'); i !== -1 && ranged; i = item.original.indexOf('\n', i + 1)) {
        add(from + i, { kind: 'break', pos: from + i, id });
      }
      if (item.insert !== '') add(to, { kind: 'ins', pos: to, id, text: item.insert, current, plain: false });
    } else if (mode === 'original') {
      if (ranged) add(from, { kind: 'orig', from, to, id, current });
      else add(from, { kind: 'point', pos: from, id, current });
    } else {
      if (ranged) add(from, { kind: 'hide', from, to, id });
      if (item.insert !== '') add(to, { kind: 'ins', pos: to, id, text: item.insert, current, plain: true });
    }
  }

  const block = pendingBlock(state);
  if (block && mode !== 'original') {
    const shown = shownAttempt(block);
    add(block.pos, {
      kind: 'block',
      pos: block.pos,
      id: block.id,
      text: shown ? shown.text : '',
      status: shown ? shown.status : 'error',
      attempt: block.attempt,
      attemptCount: block.attempts.length,
      note: shown ? shown.note : null,
      current: block.id === state.currentId
    });
  }

  for (const range of state.ranges) {
    if (range.highlight && range.from < range.to) add(range.from, { kind: 'target', from: range.from, to: range.to, id: range.id });
  }

  return specs.sort((a, b) => a.at - b.at || a.order - b.order).map(entry => entry.spec);
}

/** What the bar, the menu and the features read. */
function snapshot(state) {
  const pending = pendingItems(state);
  const block = state.block;
  const shown = block ? shownAttempt(block) : null;

  return {
    pending,
    rejected: rejectedItems(state),
    currentId: state.currentId,
    currentIndex: pending.findIndex(item => item.id === state.currentId),
    viewMode: state.viewMode,
    notice: state.notice,
    rev: state.rev,
    block: block ? {
      id: block.id,
      pos: block.pos,
      state: block.state,
      status: shown ? shown.status : 'error',
      text: shown ? shown.text : '',
      attempt: block.attempt,
      attemptCount: block.attempts.length,
      note: shown ? shown.note : null,
      meta: block.meta
    } : null
  };
}

module.exports = {
  CONTEXT_CHARS,
  REBASE_DIFF_LIMIT,
  nextId,
  resetIds,
  makeMapper,
  mapSuggestions,
  singleChange,
  firstDifference,
  stillMatches,
  relocateTarget,
  rebaseSuggestions,
  normalizeChanges,
  createSuggestions,
  createState,
  reduce,
  pendingItems,
  rejectedItems,
  hasReviewable,
  acceptChanges,
  bulkAcceptIds,
  blockInsertText,
  blockChange,
  decorationSpecs,
  snapshot
};

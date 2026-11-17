/**
 * Word-level diff for prose
 *
 * wordDiff(original, revised) returns the changes that turn one text into the
 * other, as [{ from, to, insert, original }] in offsets of the original text.
 * The suggestion layer, "Liitä muokkauksina", Kielenhuolto and the comparison
 * views are all built on it.
 *
 * Pure functions, no DOM and nothing from @codemirror, so everything here is
 * unit-tested (test/editor/wordDiff.test.js).
 */

// STUB(src/editor/textTools.js#WORD_CHAR): replaced at I-03
const WORD_CHAR = require('./textTools.js').WORD_CHAR || /[\p{L}\p{N}\p{M}'’]/u;
const { splitSentences } = require('./sentences.js');

const SPACE_CHAR = /\s/u;
// Hyphen-minus, hyphen, non-breaking hyphen, soft hyphen
const JOINERS = '-\u2010\u2011\u00ad';
// Same rule as the editor's note decoration (contracts section 0, rule 9)
const TODO_NOTE = /\[TODO:[^\]\n]*\]/y;

const DEFAULT_MAX_EDITS = 2000;
const DEFAULT_SENTENCE_THRESHOLD = 0.5;
const STATS_MAX_EDITS = 6000;

const asText = (value) => (value == null ? '' : String(value));

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

// The caller's expression is never touched: g and y would carry a lastIndex
function stickyCopy(regex) {
  if (!regex || typeof regex.source !== 'string' || typeof regex.flags !== 'string') return null;
  return new RegExp(regex.source, `${regex.flags.replace(/[gy]/g, '')}y`);
}

/**
 * Split a text into tokens that cover it completely and in order.
 * @param {string} text
 * @param {{atomic?: RegExp}} [options] every match of `atomic` is one token
 * @returns {Array<{text: string, start: number, end: number, type: 'word'|'space'|'newline'|'punct'|'atom'}>}
 */
function tokenize(text, options) {
  const value = asText(text);
  const atomic = stickyCopy(options && options.atomic);
  const tokens = [];
  const n = value.length;

  const charAt = (pos) => String.fromCodePoint(value.codePointAt(pos));
  const atomAt = (pos) => {
    if (!atomic) return 0;
    atomic.lastIndex = pos;
    const match = atomic.exec(value);
    return match ? match[0].length : 0;
  };
  const push = (start, end, type) => tokens.push({ text: value.slice(start, end), start, end, type });

  let i = 0;
  while (i < n) {
    const atomLength = atomAt(i);
    if (atomLength > 0) {
      push(i, i + atomLength, 'atom');
      i += atomLength;
      continue;
    }

    if (value.startsWith('[TODO:', i)) {
      // A note to self is one token, so a change never cuts through it
      TODO_NOTE.lastIndex = i;
      const note = TODO_NOTE.exec(value);
      if (note) {
        push(i, i + note[0].length, 'atom');
        i += note[0].length;
        continue;
      }
    }

    const ch = charAt(i);
    if (ch === '\n') {
      push(i, i + 1, 'newline');
      i += 1;
      continue;
    }

    let j = i + ch.length;
    let type = 'punct';
    if (SPACE_CHAR.test(ch)) {
      type = 'space';
      while (j < n) {
        const next = charAt(j);
        if (next === '\n' || !SPACE_CHAR.test(next) || atomAt(j) > 0) break;
        j += next.length;
      }
    } else if (WORD_CHAR.test(ch)) {
      type = 'word';
      while (j < n) {
        // A custom atom ends the word even when it begins with a letter or a digit
        if (atomAt(j) > 0) break;
        const next = charAt(j);
        if (WORD_CHAR.test(next)) {
          j += next.length;
          continue;
        }
        // A hyphen between two word characters stays inside the word (linja-auto, 10-12)
        const after = j + next.length;
        if (JOINERS.includes(next) && after < n && WORD_CHAR.test(charAt(after)) && atomAt(after) === 0) {
          j = after;
          continue;
        }
        break;
      }
    }
    push(i, j, type);
    i = j;
  }
  return tokens;
}

const countWordTokens = (text, options) => tokenize(text, options).filter(token => token.type === 'word').length;

// ---------------------------------------------------------------------------
// Myers
// ---------------------------------------------------------------------------

/**
 * Myers' greedy O(ND) diff of two string arrays, limited to maxEdits
 * insertions plus deletions. Hunks are [aFrom, aTo, bFrom, bTo] in indexes.
 * @returns {{hunks: number[][]}|{exceeded: true, pre: number, suf: number}}
 */
function myers(a, b, maxEdits) {
  const n0 = a.length;
  const m0 = b.length;
  let pre = 0;
  while (pre < n0 && pre < m0 && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < n0 - pre && suf < m0 - pre && a[n0 - 1 - suf] === b[m0 - 1 - suf]) suf++;

  const N = n0 - pre - suf;
  const M = m0 - pre - suf;
  if (N === 0 && M === 0) return { hunks: [] };
  // One side is empty: a single hunk whatever the cap, nothing to search
  if (N === 0 || M === 0) return { hunks: [[pre, pre + N, pre, pre + M]] };

  const max = Math.min(N + M, maxEdits);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let found = -1;

  outer:
  for (let d = 0; d <= max; d++) {
    // The state after round d - 1, entries k = -d-1 .. d+1, for backtracking
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && a[pre + x] === b[pre + y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= N && y >= M) { found = d; break outer; }
    }
  }
  if (found === -1) return { exceeded: true, pre, suf };

  // Backtrack from (N, M): collect the equal runs [x, y, length] of every round
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

  const hunks = [];
  let ax = 0;
  let by = 0;
  for (const [rx, ry, length] of runs) {
    if (rx > ax || ry > by) hunks.push([pre + ax, pre + rx, pre + by, pre + ry]);
    ax = rx + length;
    by = ry + length;
  }
  if (ax < N || by < M) hunks.push([pre + ax, pre + N, pre + by, pre + M]);
  return { hunks };
}

/** Edit distance (insertions + deletions) of two string arrays, or -1 when it is over the cap. */
function editDistance(a, b, cap) {
  const n0 = a.length;
  const m0 = b.length;
  let pre = 0;
  while (pre < n0 && pre < m0 && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < n0 - pre && suf < m0 - pre && a[n0 - 1 - suf] === b[m0 - 1 - suf]) suf++;
  const N = n0 - pre - suf;
  const M = m0 - pre - suf;
  if (N === 0 || M === 0) return N + M <= cap ? N + M : -1;

  const max = Math.min(N + M, cap);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < N && y < M && a[pre + x] === b[pre + y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= N && y >= M) return d;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Hunks: { from, to } in the original, { rFrom, rTo } in the revised text
// ---------------------------------------------------------------------------

function toCharHunk(tokA, tokB, [a0, a1, b0, b1], lenA, lenB, baseA = 0, baseB = 0) {
  const from = a0 < tokA.length ? tokA[a0].start : lenA;
  const to = a1 > a0 ? tokA[a1 - 1].end : from;
  const rFrom = b0 < tokB.length ? tokB[b0].start : lenB;
  const rTo = b1 > b0 ? tokB[b1 - 1].end : rFrom;
  return { from: baseA + from, to: baseA + to, rFrom: baseB + rFrom, rTo: baseB + rTo };
}

/** Token-level hunks, or null when the edit distance is over the cap. */
function tokenHunks(original, revised, options, baseA = 0, baseB = 0) {
  const tokA = tokenize(original, options);
  const tokB = tokenize(revised, options);
  const result = myers(tokA.map(token => token.text), tokB.map(token => token.text), options.maxEdits);
  if (result.exceeded) return null;
  return result.hunks.map(hunk => toCharHunk(tokA, tokB, hunk, original.length, revised.length, baseA, baseB));
}

// Coarse tokens: every line with its line break; the last line without one
function lineTokens(text) {
  const tokens = [];
  let start = 0;
  while (start < text.length) {
    const lineBreak = text.indexOf('\n', start);
    const end = lineBreak === -1 ? text.length : lineBreak + 1;
    tokens.push({ text: text.slice(start, end), start, end });
    start = end;
  }
  return tokens;
}

/** Fallback over the cap: align whole lines first, then refine each changed block. */
function lineHunks(original, revised, options, baseA = 0, baseB = 0) {
  const tokA = lineTokens(original);
  const tokB = lineTokens(revised);
  const result = myers(tokA.map(token => token.text), tokB.map(token => token.text), options.maxEdits);

  // Even the lines are over the cap: one block between the common leading and trailing lines
  const coarse = result.exceeded
    ? [toCharHunk(tokA, tokB, [result.pre, tokA.length - result.suf, result.pre, tokB.length - result.suf], original.length, revised.length)]
    : result.hunks.map(hunk => toCharHunk(tokA, tokB, hunk, original.length, revised.length));

  const hunks = [];
  for (const block of coarse) {
    const bothSides = block.to > block.from && block.rTo > block.rFrom;
    if (bothSides) {
      const fine = tokenHunks(
        original.slice(block.from, block.to), revised.slice(block.rFrom, block.rTo),
        options, baseA + block.from, baseB + block.rFrom
      );
      if (fine) {
        hunks.push(...fine);
        continue;
      }
      // Every paragraph edited: the block has no unchanged line, so it is over the cap
      // again. With as many lines on both sides, line i was edited into line i: refine
      // pair by pair, each with its own cap, so a long copy-edited chapter stays readable
      const linesA = lineTokens(original.slice(block.from, block.to));
      const linesB = lineTokens(revised.slice(block.rFrom, block.rTo));
      if (linesA.length > 1 && linesA.length === linesB.length) {
        linesA.forEach((lineA, i) => {
          const lineB = linesB[i];
          if (lineA.text === lineB.text) return;
          const fromA = block.from + lineA.start;
          const fromB = block.rFrom + lineB.start;
          const pair = tokenHunks(lineA.text, lineB.text, options, baseA + fromA, baseB + fromB);
          hunks.push(...(pair || [wholeHunk(original, revised, fromA, block.from + lineA.end, fromB, block.rFrom + lineB.end, baseA, baseB)]));
        });
        continue;
      }
    }
    hunks.push(wholeHunk(original, revised, block.from, block.to, block.rFrom, block.rTo, baseA, baseB));
  }
  return hunks;
}

// A block replaced as a whole leaves the line break both sides end with outside the change
function wholeHunk(original, revised, from, to, rFrom, rTo, baseA, baseB) {
  const bothSides = to > from && rTo > rFrom;
  const shared = bothSides && original[to - 1] === '\n' && revised[rTo - 1] === '\n' ? 1 : 0;
  return { from: baseA + from, to: baseA + to - shared, rFrom: baseB + rFrom, rTo: baseB + rTo - shared };
}

function segmentHunks(original, revised, options, baseA, baseB) {
  if (original === revised) return [];
  return tokenHunks(original, revised, options, baseA, baseB) || lineHunks(original, revised, options, baseA, baseB);
}

/**
 * The unmerged hunks of two texts. When both hold the same notes (atoms) in
 * the same order, the notes are fixed points and only the text between them
 * is compared, so no hunk can touch a note. `anchor: false` skips that.
 * Exported for maskSpans, which aligns a model's reply with the masked text.
 * @returns {Array<{from: number, to: number, rFrom: number, rTo: number}>}
 */
function rawHunks(original, revised, options) {
  const opts = normalizeOptions(options);
  const a = asText(original);
  const b = asText(revised);
  if (!opts.anchor) return segmentHunks(a, b, opts, 0, 0);

  const atomsA = tokenize(a, opts).filter(token => token.type === 'atom');
  const atomsB = tokenize(b, opts).filter(token => token.type === 'atom');
  const anchored = atomsA.length > 0 && atomsA.length === atomsB.length &&
    atomsA.every((token, index) => token.text === atomsB[index].text);
  if (!anchored) return segmentHunks(a, b, opts, 0, 0);

  const hunks = [];
  let fromA = 0;
  let fromB = 0;
  for (let i = 0; i <= atomsA.length; i++) {
    const toA = i < atomsA.length ? atomsA[i].start : a.length;
    const toB = i < atomsB.length ? atomsB[i].start : b.length;
    hunks.push(...segmentHunks(a.slice(fromA, toA), b.slice(fromB, toB), opts, fromA, fromB));
    if (i < atomsA.length) {
      fromA = atomsA[i].end;
      fromB = atomsB[i].end;
    }
  }
  return hunks;
}

// A word changed, then one word kept, then a word changed reads better as one change
function mergeNear(hunks, original, revised, options) {
  if (hunks.length < 2) return hunks;
  const describe = (hunk) => {
    const removed = original.slice(hunk.from, hunk.to);
    const added = revised.slice(hunk.rFrom, hunk.rTo);
    return {
      wordy: countWordTokens(removed, options) + countWordTokens(added, options) > 0,
      multiline: removed.includes('\n') || added.includes('\n')
    };
  };

  const out = [{ ...hunks[0] }];
  let previousInfo = describe(hunks[0]);
  for (let i = 1; i < hunks.length; i++) {
    const hunk = hunks[i];
    const previous = out[out.length - 1];
    const info = describe(hunk);
    let merge = false;
    if (previousInfo.wordy && info.wordy && !previousInfo.multiline && !info.multiline) {
      // Punctuation, a line break or a note between two changes keeps them apart
      const gap = tokenize(original.slice(previous.to, hunk.from), options);
      const words = gap.filter(token => token.type === 'word').length;
      const others = gap.filter(token => token.type !== 'word' && token.type !== 'space').length;
      merge = others === 0 && words <= 1;
    }
    if (merge) {
      previous.to = hunk.to;
      previous.rTo = hunk.rTo;
      previousInfo = { wordy: true, multiline: false };
    } else {
      out.push({ ...hunk });
      previousInfo = info;
    }
  }
  return out;
}

// A sentence with more than the threshold of its words changed becomes one change
function collapseSentences(hunks, original, revised, options) {
  if (hunks.length < 2) return hunks;
  const isMultiline = (hunk) =>
    original.slice(hunk.from, hunk.to).includes('\n') || revised.slice(hunk.rFrom, hunk.rTo).includes('\n');
  const touches = (hunk, unit) => (hunk.from === hunk.to
    ? hunk.from >= unit.from && hunk.from <= unit.to
    : hunk.from < unit.to && hunk.to > unit.from);
  const inside = (hunk, unit) => hunk.from >= unit.from && hunk.to <= unit.to;

  // Units: the sentences of the original, joined where a one-line hunk reaches into two
  const units = splitSentences(original).map(sentence => ({ from: sentence.from, to: sentence.to }));
  for (const hunk of hunks) {
    if (hunk.from === hunk.to || isMultiline(hunk)) continue;
    let first = -1;
    let last = -1;
    for (let i = 0; i < units.length; i++) {
      if (!touches(hunk, units[i])) continue;
      if (first === -1) first = i;
      last = i;
    }
    if (last > first) units.splice(first, last - first + 1, { from: units[first].from, to: units[last].to });
  }

  const out = [];
  let i = 0;
  while (i < hunks.length) {
    const unit = units.find(candidate => touches(hunks[i], candidate));
    if (!unit) {
      out.push(hunks[i]);
      i++;
      continue;
    }

    let j = i + 1;
    while (j < hunks.length && touches(hunks[j], unit)) j++;
    const members = hunks.slice(i, j);
    i = j;

    // A note between two changes keeps them apart
    const noteBetween = members.some((member, index) => index > 0 &&
      tokenize(original.slice(members[index - 1].to, member.from), options).some(token => token.type === 'atom'));

    if (members.length >= 2 && !noteBetween && members.every(member => !isMultiline(member) && inside(member, unit))) {
      const total = countWordTokens(original.slice(unit.from, unit.to), options);
      let removed = 0;
      let added = 0;
      for (const member of members) {
        removed += countWordTokens(original.slice(member.from, member.to), options);
        added += countWordTokens(revised.slice(member.rFrom, member.rTo), options);
      }
      // Words of the old sentence plus words of the new one
      const denominator = 2 * total - removed + added;
      if (denominator > 0 && (removed + added) / denominator > options.sentenceThreshold) {
        const lastMember = members[members.length - 1];
        out.push({ from: members[0].from, to: lastMember.to, rFrom: members[0].rFrom, rTo: lastMember.rTo });
        continue;
      }
    }
    out.push(...members);
  }
  return out;
}

// Tokens both sides of a change start or end with go back to the unchanged text
function trimHunks(hunks, original, revised, options) {
  return hunks.map((hunk) => {
    const a = tokenize(original.slice(hunk.from, hunk.to), options);
    const b = tokenize(revised.slice(hunk.rFrom, hunk.rTo), options);
    let pre = 0;
    while (pre < a.length && pre < b.length && a[pre].text === b[pre].text) pre++;
    let suf = 0;
    while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf].text === b[b.length - 1 - suf].text) suf++;
    if (pre === 0 && suf === 0) return hunk;

    const cutA = pre > 0 ? a[pre - 1].end : 0;
    const cutB = pre > 0 ? b[pre - 1].end : 0;
    const endA = suf > 0 ? a[a.length - suf].start : hunk.to - hunk.from;
    const endB = suf > 0 ? b[b.length - suf].start : hunk.rTo - hunk.rFrom;
    return { from: hunk.from + cutA, to: hunk.from + endA, rFrom: hunk.rFrom + cutB, rTo: hunk.rFrom + endB };
  });
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Options with their defaults filled in. Safe to call on its own result.
 * Exported for maskSpans.
 */
function normalizeOptions(options) {
  const given = options || {};
  return {
    maxEdits: Number.isFinite(given.maxEdits) && given.maxEdits >= 0 ? Math.floor(given.maxEdits) : DEFAULT_MAX_EDITS,
    sentenceThreshold: Number.isFinite(given.sentenceThreshold) ? given.sentenceThreshold : DEFAULT_SENTENCE_THRESHOLD,
    // raw: true is another way to write merge: false (the finest word-level changes)
    merge: given.merge !== false && given.raw !== true,
    atomic: given.atomic || null,
    anchor: given.anchor !== false
  };
}

// A model or a clipboard may return CRLF; that is no change in a text that uses LF
function prepare(original, revised) {
  const a = asText(original);
  let b = asText(revised);
  if (!a.includes('\r')) b = b.replace(/\r\n?/g, '\n');
  return [a, b];
}

/**
 * Word-level changes that turn `original` into `revised`.
 * Options: maxEdits (2000), sentenceThreshold (0.5), merge (true; raw: true
 * means merge: false), atomic (RegExp whose matches are single tokens).
 * @returns {Array<{from: number, to: number, insert: string, original: string}>}
 */
function wordDiff(original, revised, options) {
  const opts = normalizeOptions(options);
  const [a, b] = prepare(original, revised);
  if (a === b) return [];

  let hunks = rawHunks(a, b, opts);
  if (opts.merge) {
    hunks = mergeNear(hunks, a, b, opts);
    hunks = collapseSentences(hunks, a, b, opts);
    hunks = trimHunks(hunks, a, b, opts);
  }
  return hunks
    .map(hunk => ({ from: hunk.from, to: hunk.to, insert: b.slice(hunk.rFrom, hunk.rTo), original: a.slice(hunk.from, hunk.to) }))
    .filter(change => change.insert !== change.original);
}

/**
 * Apply changes to a text. They must be sorted, apart and inside the text.
 * @throws {RangeError}
 */
function applyChanges(original, changes) {
  const text = asText(original);
  let out = '';
  let cursor = 0;
  for (const change of changes || []) {
    if (change.from < cursor || change.to < change.from || change.to > text.length) {
      throw new RangeError('applyChanges: changes must be sorted, non-overlapping and inside the text');
    }
    out += text.slice(cursor, change.from) + change.insert;
    cursor = change.to;
  }
  return out + text.slice(cursor);
}

/** Copies of the changes moved by `delta`: from a selection's offsets to the chapter's. */
function offsetChanges(changes, delta) {
  return (changes || []).map(change => ({ ...change, from: change.from + delta, to: change.to + delta }));
}

/**
 * The same diff as a flat list of pieces. `same` and `removed` joined give the
 * original, `same` and `added` the revised text.
 * @returns {Array<{type: 'same'|'removed'|'added', text: string}>}
 */
function diffSegments(original, revised, options) {
  const [a] = prepare(original, revised);
  const segments = [];
  let cursor = 0;
  for (const change of wordDiff(original, revised, options)) {
    if (change.from > cursor) segments.push({ type: 'same', text: a.slice(cursor, change.from) });
    if (change.original) segments.push({ type: 'removed', text: change.original });
    if (change.insert) segments.push({ type: 'added', text: change.insert });
    cursor = change.to;
  }
  if (cursor < a.length) segments.push({ type: 'same', text: a.slice(cursor) });
  return segments;
}

/**
 * How much of the words changed. Spaces, punctuation and notes are not counted.
 * @returns {{ratio: number, originalWords: number, revisedWords: number, commonWords: number,
 *   removedWords: number, addedWords: number, approximate: boolean}}
 */
function changeStats(original, revised, options) {
  const given = options || {};
  const cap = Number.isFinite(given.maxEdits) && given.maxEdits >= 0 ? Math.floor(given.maxEdits) : STATS_MAX_EDITS;
  const [a, b] = prepare(original, revised);
  const wordsA = tokenize(a).filter(token => token.type === 'word').map(token => token.text);
  const wordsB = tokenize(b).filter(token => token.type === 'word').map(token => token.text);
  const total = wordsA.length + wordsB.length;

  let common;
  let approximate = false;
  const distance = editDistance(wordsA, wordsB, cap);
  if (distance === -1) {
    // Too different to align within the cap. Two upper bounds for the common words:
    // the words the texts share in any order, and what a distance above the cap leaves
    approximate = true;
    const counts = new Map();
    for (const word of wordsA) counts.set(word, (counts.get(word) || 0) + 1);
    let shared = 0;
    for (const word of wordsB) {
      const left = counts.get(word) || 0;
      if (left > 0) {
        shared++;
        counts.set(word, left - 1);
      }
    }
    common = Math.min(shared, Math.floor((total - (cap + 1)) / 2));
  } else {
    common = (total - distance) / 2;
  }

  return {
    ratio: total === 0 ? 0 : (total - 2 * common) / total,
    originalWords: wordsA.length,
    revisedWords: wordsB.length,
    commonWords: common,
    removedWords: wordsA.length - common,
    addedWords: wordsB.length - common,
    approximate
  };
}

/** Share of the words that changed, 0…1. */
function changeRatio(original, revised, options) {
  return changeStats(original, revised, options).ratio;
}

module.exports = {
  tokenize,
  wordDiff,
  applyChanges,
  offsetChanges,
  diffSegments,
  changeStats,
  changeRatio,
  // For maskSpans only
  rawHunks,
  normalizeOptions
};

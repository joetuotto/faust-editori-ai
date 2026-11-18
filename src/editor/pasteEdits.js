/**
 * Paste as edits (Liitä muokkauksina)
 *
 * A text that was edited somewhere else (by an editor at the publisher, or by
 * an AI in another program) comes back on the clipboard. Instead of pasting
 * it over the manuscript, it is compared with the target and the differences
 * become suggestions. No model is called. Pure functions, unit-tested
 * (test/editor/pasteEdits.test.js); the word diff arrives as an argument.
 * The words of the dialog (src/components/PasteEditsDialog.js) are at the end.
 */

const { countWords, UNDERLINE_PATTERN_SOURCE } = require('./textTools.js');

// Above this share of changed words the clipboard probably holds another text
const PASTE_WARN_RATIO = 0.6;

// Notes and underline tags. Text that went through a chat or a formatted
// export has usually lost them; that must never turn into a proposal to
// delete them from the manuscript.
const PROTECTED_PATTERN = /\[TODO:[^\]\n]*\]|<\/?u>/g;

const normalizeNewlines = (text) => String(text == null ? '' : text).replace(/\r\n?/g, '\n');

/**
 * How paragraphs are separated: by one line break ('single'), by one blank
 * line ('double'), not at all ('none'), or in more than one way ('mixed').
 * Only the breaks between two lines that have text count.
 */
function paragraphBreakStyle(text) {
  const lines = normalizeNewlines(text).split('\n');
  let previous = -1;
  let single = 0;
  let double = 0;
  let other = 0;

  lines.forEach((line, index) => {
    if (!line.trim()) return;
    if (previous !== -1) {
      const blankLines = index - previous - 1;
      if (blankLines === 0) single++;
      else if (blankLines === 1) double++;
      else other++;
    }
    previous = index;
  });

  if (single + double + other === 0) return 'none';
  if (double === 0 && other === 0) return 'single';
  if (single === 0 && other === 0) return 'double';
  return 'mixed';
}

/**
 * Bring the clipboard text into the shape of the target, so that only real
 * edits remain as differences: line endings, the way paragraphs are
 * separated, and the whitespace around the whole text.
 */
function normalizeClipboard(targetText, clipboardText) {
  const target = normalizeNewlines(targetText);
  let body = normalizeNewlines(clipboardText).trim();

  const targetStyle = paragraphBreakStyle(target);
  const clipboardStyle = paragraphBreakStyle(body);
  if (targetStyle === 'double' && clipboardStyle === 'single') {
    body = body.replace(/\n/g, '\n\n');
  } else if (targetStyle === 'single' && clipboardStyle === 'double') {
    body = body.replace(/\n[^\S\n]*\n/g, '\n');
  }

  // A paragraph copied from another program ends in a line break the selection does not have
  if (!target.trim()) return target + body;
  const lead = target.match(/^\s*/)[0];
  const trail = target.match(/\s*$/)[0];
  return lead + body + trail;
}

function countMatches(text) {
  const counts = new Map();
  for (const match of String(text).match(PROTECTED_PATTERN) || []) {
    counts.set(match, (counts.get(match) || 0) + 1);
  }
  return counts;
}

function protectedSpans(text) {
  return Array.from(text.matchAll(PROTECTED_PATTERN), match => ({ from: match.index, to: match.index + match[0].length }));
}

/**
 * Would this change take a note or an underline tag out of the manuscript?
 * The rule: the original holds a note or tag that the replacement does not
 * hold as often. A change that cuts into one is widened to the whole note or
 * tag first, so a diff that splits "[TODO: x]" into pieces is judged the same
 * way as one that keeps it whole.
 */
function removesProtected(target, change, spans) {
  let from = change.from;
  let to = change.to;
  for (const span of spans) {
    if (span.from < change.to && span.to > change.from) {
      from = Math.min(from, span.from);
      to = Math.max(to, span.to);
    }
  }

  const before = countMatches(target.slice(from, to));
  if (!before.size) return false;
  const after = countMatches(target.slice(from, change.from) + normalizeNewlines(change.insert) + target.slice(change.to, to));
  for (const [match, count] of before) {
    if ((after.get(match) || 0) < count) return true;
  }
  return false;
}

// A change that reaches into a note or tag the selection cuts in two: the
// part inside the target does not look like a note, but it is one
function touchesCutSpan(change, cutSpans) {
  return cutSpans.some(span => (change.from === change.to
    ? change.from > span.from && change.from < span.to
    : change.from < span.to && change.to > span.from));
}

// The pieces rebuild the change exactly: inside it, sorted, apart, and applied they give its insert
function rebuilds(original, insert, pieces) {
  let out = '';
  let at = 0;
  for (const piece of pieces) {
    if (!piece || !Number.isInteger(piece.from) || !Number.isInteger(piece.to) || typeof piece.insert !== 'string') return false;
    if (piece.from < at || piece.to < piece.from || piece.to > original.length) return false;
    out += original.slice(at, piece.from) + piece.insert;
    at = piece.to;
  }
  return out + original.slice(at) === insert;
}

/**
 * A protected change of the merged diff, taken apart (stage I-04, scenario X-27). The notes and tags
 * that the clipboard lost are taken out of the change's original text first (a note with the
 * whitespace of its place), the rest is compared with the clipboard text by the finest word diff, and its pieces
 * are put back in place: a word changed beside a lost note, or inside an underline whose tags were
 * lost, is proposed on its own and the note and the tags stay. Returns those pieces (proposed) and
 * what is set aside (kept): one change per lost note or underline (its two tags together), with any
 * piece that would still take one with it or that would leave text against a lost note. The change
 * stays whole when its edges cut a note or a tag, when the clipboard still holds a copy of one it lost
 * (which one went cannot be told), when it holds nothing but lost notes or tags and their whitespace,
 * when the finest diff is missing or does not rebuild the text, or when nothing in it can go alone.
 */
function splitProtected(target, change, isProtected, deps, cutSpans) {
  const whole = { proposed: [], kept: [change] };
  const insert = normalizeNewlines(change.insert);
  if (cutSpans.some(span => span.from < change.to && span.to > change.from)) return whole;

  const lost = [];
  for (const match of target.matchAll(PROTECTED_PATTERN)) {
    const from = match.index;
    const to = from + match[0].length;
    if (to <= change.from || from >= change.to) continue;
    if (from < change.from || to > change.to || insert.includes(match[0])) return whole;
    lost.push({ from, to, note: match[0].startsWith('[') });
  }
  if (!lost.length) return whole;

  // What leaves with each one. A note at the start of a line takes the line breaks and spaces after it
  // ("[TODO: x]" on a line of its own goes with its blank line), or, when the change ends at the note
  // (the diff took the breaks before it: "\n\n[TODO: x]"), the breaks before it, so the paragraph above
  // is never proposed to run into the note; a note inside a line takes the spaces before it, or after it
  // when those are not in the change ("a [TODO: x] b" reads "a b"). Tags take nothing.
  const removed = [];
  for (const item of lost) {
    let { from, to } = item;
    const floor = removed.length ? removed[removed.length - 1].to : change.from;
    if (item.note) {
      const lineStart = from === 0 || target[from - 1] === '\n';
      if (lineStart) {
        while (to < change.to && /\s/.test(target[to])) to += 1;
        if (to === item.to) {
          while (from - 1 >= floor && /\s/.test(target[from - 1])) from -= 1;
        }
      } else if (target[from - 1] === ' ' && from - 1 >= floor) {
        while (from - 1 >= floor && target[from - 1] === ' ') from -= 1;
      } else if (target[from - 1] === ' ') {
        while (to < change.to && target[to] === ' ') to += 1;
      }
    }
    removed.push({ from, to, item });
  }

  // The change's original without them, and where each of its characters stands in the target
  const kept = [];
  let rest = '';
  for (let i = change.from, r = 0; i < change.to; i++) {
    while (r < removed.length && removed[r].to <= i) r++;
    if (r < removed.length && removed[r].from <= i) continue;
    kept.push(i);
    rest += target[i];
  }
  // Nothing but lost notes or tags and their whitespace: what the clipboard has in their place
  // ("a [TODO: x] b" → "a uusi b") could only be put against them, so the change stays whole
  if (!kept.length) return whole;

  const finest = typeof deps.rawDiff === 'function' ? deps.rawDiff : (a, b) => deps.wordDiff(a, b, { raw: true });
  let pieces;
  try {
    pieces = finest(rest, insert);
  } catch (error) {
    return whole;
  }
  if (!Array.isArray(pieces) || !pieces.length || !rebuilds(rest, insert, pieces)) return whole;

  const place = (k) => (k < kept.length ? kept[k] : (kept.length ? kept[kept.length - 1] + 1 : change.from));
  const placed = pieces.map(piece => {
    const from = place(piece.from);
    const to = piece.to > piece.from ? kept[piece.to - 1] + 1 : from;
    return { from, to, insert: piece.insert, original: target.slice(from, to) };
  });
  // A piece that spans a lost note or tag would still delete it, and one that brings a note or a tag
  // in is the rewritten form of a lost one ([TODO: x] → [TODO: y]): both are set aside with it
  const bringsIn = (piece) => (piece.insert.match(PROTECTED_PATTERN) || []).length > 0;
  // A piece right at a lost note that would put another character than before against the note, where
  // whitespace or a line edge stood or another mark ("a uusi[TODO: x] b", "tähän.[TODO: x]",
  // "[TODO: x]uusi:"), is set aside with that note: the clipboard lost the note, so it says nothing
  // about the note's neighbours
  const blank = (ch) => ch === undefined || /\s/.test(ch);
  const against = (now, was) => !blank(now) && now !== was;
  const gluedTo = (piece) => lost.find(item => item.note && (
    (piece.to === item.from &&
      against(piece.insert ? piece.insert[piece.insert.length - 1] : target[piece.from - 1], target[item.from - 1])) ||
    (piece.from === item.to &&
      against(piece.insert ? piece.insert[0] : target[piece.to], target[item.to]))
  ));
  const proposed = [];
  const stuck = [];
  for (const piece of placed) {
    const note = gluedTo(piece);
    if (isProtected(piece) || bringsIn(piece) || note) stuck.push({ piece, note });
    else proposed.push(piece);
  }
  if (!proposed.length) return whole;

  // One loss per note, and per underline (its opening and closing tag)
  const underlines = Array.from(target.matchAll(new RegExp(UNDERLINE_PATTERN_SOURCE, 'g')), match => ({ from: match.index, to: match.index + match[0].length }));
  const groups = [];
  for (const entry of removed) {
    const pair = entry.item.note ? -1 : underlines.findIndex(span => span.from <= entry.item.from && span.to >= entry.item.to);
    const same = pair !== -1 && groups.find(group => group.pair === pair);
    if (same) same.ranges.push(entry);
    else groups.push({ pair, ranges: [entry] });
  }
  for (const { piece, note } of stuck) {
    const owner = groups.find(group => group.ranges.some(range => (note
      ? range.item === note
      : range.from < Math.max(piece.to, piece.from + 1) && range.to > piece.from)));
    if (owner) owner.ranges.push({ from: piece.from, to: piece.to });
  }

  const setAside = groups.map(group => {
    const from = Math.min(...group.ranges.map(range => range.from));
    const to = Math.max(...group.ranges.map(range => range.to));
    // Informative only (nothing proposes it): the group's notes and tags taken out
    let text = '';
    for (let i = from; i < to; i++) {
      if (!group.ranges.some(range => range.item && range.from <= i && i < range.to)) text += target[i];
    }
    return { from, to, insert: text, original: target.slice(from, to) };
  }).sort((a, b) => a.from - b.from);
  return { proposed, kept: setAside };
}

// Offsets in the LF copy of a text → offsets in the text itself (\r\n is one position in the copy)
function rawOffsets(raw) {
  if (!raw.includes('\r')) return null;
  const map = [];
  for (let index = 0; index < raw.length; index++) {
    map.push(index);
    if (raw[index] === '\r' && raw[index + 1] === '\n') index++;
  }
  map.push(raw.length);
  return map;
}

function toRawChange(change, raw, map) {
  if (!map) return change;
  const from = map[change.from];
  const to = map[change.to];
  const moved = { ...change, from, to };
  if ('original' in change) moved.original = raw.slice(from, to);
  return moved;
}

/**
 * Compare the clipboard with the target.
 * @param {string} targetText the selection, or the whole chapter
 * @param {string} clipboardText
 * @param {{ wordDiff: (original: string, revised: string) => Array<{from, to, insert, original?}>,
 *           changeRatio: (original: string, revised: string) => number,
 *           rawDiff?: (original: string, revised: string) => Array<{from, to, insert}> }} deps
 *   rawDiff is the finest word diff (default: wordDiff with { raw: true }); it takes apart a merged
 *   change that would delete a note or a tag, so that the other words in it are still proposed
 * @param {Array<{from: number, to: number}>} [cutSpans] parts of notes or tags that the
 *   edges of the target cut (offsets in targetText); a change that reaches into one is protected
 * @returns {{ status: 'empty'|'identical'|'ok'|'protected-only', revised: string, changes: object[],
 *             protectedChanges: object[], protectedCount: number, ratio: number, warn: boolean,
 *             stats: { targetWords: number, clipboardWords: number, changeCount: number } }}
 *   `changes` are offsets into targetText (also when it holds \r\n). Straight quotes or hyphens on the
 *   clipboard against ” and – in the manuscript are real differences.
 */
function preparePasteEdits(targetText, clipboardText, deps, cutSpans) {
  const raw = String(targetText == null ? '' : targetText);
  const target = normalizeNewlines(raw);
  const offsets = rawOffsets(raw);
  // The cut spans arrive in targetText offsets; the comparison runs on the LF copy
  const toCopy = (pos) => (offsets ? Math.max(0, offsets.findIndex(at => at >= pos)) : pos);
  const cut = (Array.isArray(cutSpans) ? cutSpans : [])
    .filter(span => span && Number.isInteger(span.from) && Number.isInteger(span.to) && span.to > span.from)
    .map(span => ({ from: toCopy(span.from), to: toCopy(span.to) }));
  const clipboard = normalizeNewlines(clipboardText);
  const result = {
    status: 'empty',
    revised: '',
    changes: [],
    protectedChanges: [],
    protectedCount: 0,
    ratio: 0,
    warn: false,
    stats: { targetWords: countWords(target), clipboardWords: countWords(clipboard), changeCount: 0 }
  };
  if (!clipboard.trim()) return result;

  result.revised = normalizeClipboard(target, clipboard);
  if (result.revised === target) return { ...result, status: 'identical' };

  const spans = protectedSpans(target);
  const isProtected = (change) => removesProtected(target, change, spans) || touchesCutSpan(change, cut);
  for (const change of deps.wordDiff(target, result.revised) || []) {
    if (!isProtected(change)) {
      result.changes.push(toRawChange(change, raw, offsets));
      continue;
    }
    // The merged diff joins nearby edits: a word changed one word away from a lost tag is in the same
    // change. Only what deletes a note or a tag is set aside; the other words are still proposed.
    const split = splitProtected(target, change, isProtected, deps, cut);
    for (const piece of split.proposed) result.changes.push(toRawChange(piece, raw, offsets));
    for (const piece of split.kept) result.protectedChanges.push(toRawChange(piece, raw, offsets));
  }
  result.protectedCount = result.protectedChanges.length;
  result.stats.changeCount = result.changes.length;

  // The diff found no difference worth proposing
  if (!result.changes.length && !result.protectedCount) return { ...result, status: 'identical' };

  // Measured also when every difference would have deleted a note or a tag ('protected-only'): an unrelated
  // text over a passage with a note is one such change, and the author is told that the clipboard is wrong
  const ratio = Number(deps.changeRatio(target, result.revised));
  result.ratio = Number.isFinite(ratio) ? ratio : 0;
  result.warn = result.ratio > PASTE_WARN_RATIO;
  result.status = result.changes.length ? 'ok' : 'protected-only';
  return result;
}

// --- The dialog's words (stage I-04) -----------------------------------------
// PasteEditsDialog.js draws them; they live here so that Jest reads them. Wording: the brief's
// string table as amended by reconcile R-32 / R-81 ("Verrataan", "verrattava teksti",
// "muistutus"), contracts 8.1 for the two sources.

const PASTE_TEXT = {
  title: 'Liitä muokkauksina',
  targetKey: 'Verrataan:',
  clipboardKey: 'Leikepöydällä:',
  sourceLabel: 'Kuka muokkasi tekstin?',
  sources: [
    { id: 'editor', label: 'Kustannustoimittaja', hint: 'ihmisen tekemät korjaukset' },
    { id: 'external-ai', label: 'Tekoäly muualla', hint: 'esimerkiksi Cherry Studion keskustelu' }
  ],
  identical: 'Leikepöydän teksti on sama kuin verrattava teksti. Muutoksia ei ole.',
  empty: 'Leikepöydällä ei ole tekstiä.',
  noEditor: 'Liitä muokkauksina toimii, kun jokin luku on auki.',
  cancel: 'Peruuta',
  confirm: 'Liitä muokkauksina',
  close: 'Sulje'
};

/**
 * What the "Liitä muokkauksina" dialog says about one request of the controller
 * (suggestionController.pasteAsEdits): its rows, its notes and whether it can paste.
 * @param {{ status: 'no-editor'|'empty'|'identical'|'protected-only'|'ok', scope: 'selection'|'chapter',
 *           stats: { targetWords, clipboardWords, changeCount }, ratio: number, warn: boolean,
 *           protectedCount?: number } | null} request
 * @returns {{ target: { key, value } | null, clipboard: { key, value } | null, result: string | null,
 *             protectedLine: string | null, warning: string | null, notice: string | null, canPaste: boolean }}
 *   `target` and `clipboard` are inline rows: the key and the value read as one line
 *   (`Verrataan: valinta, 120 sanaa`). `notice` is the state of a request that cannot paste.
 */
function pasteDialogText(request) {
  // contracts 0.7: another task's helper is taken inside the function
  const { formatCount, plural } = require('../services/format.fi.js');
  const words = (n) => `${formatCount(n)} ${plural(n, 'sana', 'sanaa')}`;
  const changes = (n) => `${formatCount(n)} ${plural(n, 'muutos', 'muutosta')}`;

  const status = request && request.status;
  const stats = (request && request.stats) || {};
  const text = { target: null, clipboard: null, result: null, protectedLine: null, warning: null, notice: null, canPaste: status === 'ok' };

  if (!status || status === 'no-editor') {
    text.notice = PASTE_TEXT.noEditor;
    return text;
  }
  if (status === 'empty') {
    text.notice = PASTE_TEXT.empty;
    return text;
  }

  const targetWords = Number(stats.targetWords) || 0;
  text.target = {
    key: PASTE_TEXT.targetKey,
    value: request.scope === 'chapter'
      ? `koko luku, ${words(targetWords)} (mitään ei ollut valittuna)`
      : `valinta, ${words(targetWords)}`
  };
  text.clipboard = { key: PASTE_TEXT.clipboardKey, value: words(Number(stats.clipboardWords) || 0) };

  if (status === 'identical') {
    text.notice = PASTE_TEXT.identical;
    return text;
  }

  // 'ok' and 'protected-only' (nothing but protected changes: 0 to paste, and the line says why)
  text.result = changes(Number(stats.changeCount) || 0);
  const protectedCount = Number(request.protectedCount) || 0;
  if (protectedCount > 0) {
    text.protectedLine = protectedCount === 1
      ? '1 muutos poistaisi muistutuksen tai alleviivauksen. Se jätetään pois.'
      : `${formatCount(protectedCount)} muutosta poistaisi muistutuksen tai alleviivauksen. Ne jätetään pois.`;
  }
  // Also over 'protected-only': a wrong clipboard over a passage with a note is set aside whole, and the
  // warning, not the note, is what the author needs to hear
  if (request.warn) {
    const pct = Math.round((Number(request.ratio) || 0) * 100);
    text.warning = `Leikepöydän teksti poikkeaa verrattavasta tekstistä paljon: noin ${pct} % sanoista muuttuisi. Tarkista, että leikepöydällä on oikea teksti.`;
  }
  return text;
}

module.exports = {
  PASTE_WARN_RATIO,
  PROTECTED_PATTERN,
  paragraphBreakStyle,
  normalizeClipboard,
  preparePasteEdits,
  PASTE_TEXT,
  pasteDialogText
};

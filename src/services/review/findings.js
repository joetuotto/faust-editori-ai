/**
 * Stored findings of the Tarkistus tab
 *
 * A finding lives in chapter.findings with its status. The quote and the 32
 * characters around it are the anchor; the stored offsets are only a hint, so
 * a finding follows its passage through edits and says so when the passage is
 * gone. A new run replaces the open findings of its check and keeps what the
 * author has decided. Run records (chapter.reviewRuns) say how the last run
 * of each check ended: a failed run never reads as "no findings".
 *
 * Pure functions; locateQuote of the text modules arrives in `deps`
 * (test/services/findings.test.js).
 */

const STATUSES = Object.freeze(['open', 'done', 'disagree', 'invalid']);

const STATUS_LABELS = Object.freeze({ open: 'Avoin', done: 'Tehty', disagree: 'Eri mieltä', invalid: 'Virheellinen' });

const STATUS_HINTS = Object.freeze({
  open: 'Ei vielä käsitelty.',
  done: 'Korjasin kohdan.',
  disagree: 'Kohta on tarkoituksella näin. Sitä ei näytetä uudelleen.',
  invalid: 'Malli oli väärässä: havainto ei pidä paikkaansa.'
});

const FINDINGS = Object.freeze({ CONTEXT_CHARS: 32, MIN_CONTEXT_MATCH: 6, MAX_STORED: 400 });

const KINDS = ['model', 'continuity', 'local'];
// A deterministic hit cannot be "wrong": Virheellinen comes with the model checks
const LOCAL_STATUSES = Object.freeze(['open', 'done', 'disagree']);
const SEVERITY_ORDER = ['high', 'medium', 'low'];

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const asText = (value) => (typeof value === 'string' ? value : '');
const textOrNull = (value) => (typeof value === 'string' && value !== '' ? value : null);
const refKey = (ref) => (ref ? `${ref.kind}:${ref.id}` : '');
const overlaps = (a, b) => a.from < b.to && a.to > b.from;

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `f-${Date.now().toString(36)}-${idCounter}`;
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/**
 * A stored finding from a draft of a run or of a local check.
 * @param {object} draft
 * @param {{checkId: string, checkLabel: string, kind: 'model'|'continuity'|'local', runId?: string, model?: string,
 *   logId?: string, now?: string, id?: string, status?: string, feedback?: boolean}} meta
 *   feedback: the draft is reading feedback; its severity word is stored in data and it never has a suggestion
 */
function createFinding(draft, meta) {
  const given = draft || {};
  const info = meta || {};
  const now = info.now || new Date().toISOString();
  const status = STATUSES.includes(info.status) ? info.status : 'open';
  const located = given.located === true && Number.isInteger(given.from) && Number.isInteger(given.to);

  let data = isRecord(given.data) ? given.data : null;
  if (info.feedback) data = { ...data, severity: given.severity == null ? null : given.severity };

  const finding = {
    id: info.id || given.id || nextId(),
    checkId: info.checkId,
    checkLabel: asText(info.checkLabel),
    kind: KINDS.includes(info.kind) ? info.kind : 'model',
    quote: asText(given.quote),
    from: located ? given.from : null,
    to: located ? given.to : null,
    located,
    approx: located && given.approx === true,
    before: asText(given.before),
    after: asText(given.after),
    note: asText(given.note),
    suggestion: info.feedback ? null : textOrNull(given.suggestion),
    ref: isRecord(given.ref) ? given.ref : null,
    data,
    status,
    statusAt: status === 'open' ? null : now,
    createdAt: now,
    runId: textOrNull(info.runId),
    model: textOrNull(info.model),
    logId: textOrNull(info.logId)
  };
  // The model's own wording is worth keeping only where the place is approximate
  if (finding.approx && given.modelQuote) finding.modelQuote = String(given.modelQuote);
  // The model's quote was not in its batch. Marked, so that re-anchoring can
  // tell it from a finding that had a place and lost it in an edit.
  if (!located) finding.unanchored = true;
  return finding;
}

function normalizeRef(ref) {
  if (!isRecord(ref)) return null;
  return {
    kind: ref.kind === 'codex' || ref.kind === 'summary' ? ref.kind : null,
    id: textOrNull(ref.id),
    label: asText(ref.label),
    quote: asText(ref.quote),
    located: ref.located === true
  };
}

/**
 * chapter.findings as it can be trusted: malformed entries are dropped,
 * missing fields are filled, unknown extra fields are kept. A hand-edited
 * file cannot break the tab.
 */
function normalizeFindings(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const findings = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '') continue;
    if (typeof entry.checkId !== 'string' || entry.checkId === '' || seen.has(entry.id)) continue;
    seen.add(entry.id);

    const ranged = Number.isInteger(entry.from) && Number.isInteger(entry.to) && entry.from >= 0 && entry.from <= entry.to;
    findings.push({
      ...entry,
      checkLabel: asText(entry.checkLabel),
      kind: KINDS.includes(entry.kind) ? entry.kind : 'model',
      quote: asText(entry.quote),
      from: ranged ? entry.from : null,
      to: ranged ? entry.to : null,
      located: ranged,
      approx: ranged && entry.approx === true,
      before: asText(entry.before),
      after: asText(entry.after),
      note: asText(entry.note),
      suggestion: textOrNull(entry.suggestion),
      ref: normalizeRef(entry.ref),
      data: isRecord(entry.data) ? entry.data : null,
      status: STATUSES.includes(entry.status) ? entry.status : 'open',
      statusAt: textOrNull(entry.statusAt),
      createdAt: asText(entry.createdAt),
      runId: textOrNull(entry.runId),
      model: textOrNull(entry.model),
      logId: textOrNull(entry.logId)
    });
  }
  return findings;
}

/** The statuses a finding can be given. */
function statusesFor(finding) {
  return finding && finding.kind === 'local' ? LOCAL_STATUSES.slice() : STATUSES.slice();
}

// ---------------------------------------------------------------------------
// Re-anchoring
// ---------------------------------------------------------------------------

function occurrencesOf(text, needle) {
  const found = [];
  if (!needle) return found;
  let at = text.indexOf(needle);
  while (at !== -1) {
    found.push(at);
    at = text.indexOf(needle, at + 1);
  }
  return found;
}

// Characters of the stored context that still stand around a place
function contextScore(text, at, length, before, after) {
  let score = 0;
  for (let i = 1; i <= before.length && at - i >= 0 && text[at - i] === before[before.length - i]; i++) score += 1;
  for (let i = 0; i < after.length && at + length + i < text.length && text[at + length + i] === after[i]; i++) score += 1;
  return score;
}

const contextAround = (text, from, to) => ({
  before: text.slice(Math.max(0, from - FINDINGS.CONTEXT_CHARS), from),
  after: text.slice(to, to + FINDINGS.CONTEXT_CHARS)
});

function placedAt(text, finding, from, to, quote) {
  if (finding.located && finding.from === from && finding.to === to && finding.quote === quote) return finding;
  return { ...finding, quote, from, to, located: true, ...contextAround(text, from, to) };
}

// Status, note and the stored context stay: the passage may come back
function unplaced(finding) {
  if (!finding.located && finding.from == null && finding.to == null) return finding;
  return { ...finding, from: null, to: null, located: false };
}

// `shift`: how far the findings before this one moved (an edit earlier in the
// chapter moves every later finding by the same amount)
function reanchor(text, finding, deps, shift) {
  const quote = asText(finding.quote);
  if (!quote) return unplaced(finding);

  const hasPlace = Number.isInteger(finding.from) && Number.isInteger(finding.to);
  if (hasPlace && text.slice(finding.from, finding.to) === quote) return placedAt(text, finding, finding.from, finding.to, quote);

  // A finding that never had a place is not searched for: the model read
  // only its batch, and the same words elsewhere are another passage
  if (!hasPlace && finding.unanchored === true) return unplaced(finding);

  if (hasPlace && shift && text.slice(finding.from + shift, finding.to + shift) === quote) {
    return placedAt(text, finding, finding.from + shift, finding.to + shift, quote);
  }

  const found = occurrencesOf(text, quote);
  if (found.length === 1) return placedAt(text, finding, found[0], found[0] + quote.length, quote);
  if (found.length > 1) {
    const before = asText(finding.before);
    const after = asText(finding.after);
    let best = found[0];
    let bestScore = -1;
    for (const at of found) {
      const score = contextScore(text, at, quote.length, before, after);
      const closer = hasPlace && Math.abs(at - finding.from) < Math.abs(best - finding.from);
      if (score > bestScore || (score === bestScore && closer)) {
        best = at;
        bestScore = score;
      }
    }
    // With a short quote such as "vain", guessing would attach a decision to the wrong sentence
    if (bestScore < FINDINGS.MIN_CONTEXT_MATCH && before.length + after.length >= FINDINGS.MIN_CONTEXT_MATCH) {
      return unplaced(finding);
    }
    return placedAt(text, finding, best, best + quote.length, quote);
  }

  // The author changed a quotation mark or a dash inside the passage. A hit
  // by the beginning only is not accepted: the passage has been rewritten.
  const hit = deps && typeof deps.locateQuote === 'function'
    ? deps.locateQuote(text, quote, { near: hasPlace ? finding.from : undefined })
    : null;
  if (hit && (hit.method === 'normalized' || hit.method === 'exact')) {
    return placedAt(text, finding, hit.from, hit.to, text.slice(hit.from, hit.to));
  }
  return unplaced(finding);
}

/**
 * Find one finding in the text as it is now.
 * @param {string} text
 * @param {object} finding
 * @param {{locateQuote: Function}} deps
 * @returns {object} the same object when nothing changes
 */
function reanchorOne(text, finding, deps) {
  return reanchor(asText(text), finding, deps, 0);
}

/**
 * Find every finding in the text as it is now.
 * @returns {{findings: Array<object>, changed: boolean, located: Set<string>}} the input array when nothing changed
 */
function reanchorAll(text, findings, deps) {
  const value = asText(text);
  const list = Array.isArray(findings) ? findings : [];
  const result = list.slice();

  // In the order of the stored places, so that the running shift is that of the text before each finding
  const order = list
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => {
      const aFrom = Number.isInteger(a.finding.from) ? a.finding.from : Infinity;
      const bFrom = Number.isInteger(b.finding.from) ? b.finding.from : Infinity;
      return aFrom - bFrom || a.index - b.index;
    });

  let shift = 0;
  let changed = false;
  for (const { finding, index } of order) {
    const next = reanchor(value, finding, deps, shift);
    if (next !== finding) {
      changed = true;
      result[index] = next;
    }
    if (next.located && Number.isInteger(finding.from)) shift = next.from - finding.from;
  }

  const located = new Set(result.filter(finding => finding.located).map(finding => finding.id));
  return { findings: changed ? result : list, changed, located };
}

// ---------------------------------------------------------------------------
// A new run
// ---------------------------------------------------------------------------

function byAge(a, b) {
  const aAt = a.finding.statusAt || a.finding.createdAt || '';
  const bAt = b.finding.statusAt || b.finding.createdAt || '';
  if (aAt !== bAt) return aAt < bAt ? -1 : 1;
  return a.index - b.index;
}

/**
 * Keep the stored list under its limit: the oldest Tehty go first, then the
 * oldest Virheellinen. Avoin and Eri mieltä are never dropped.
 */
function capStored(findings, max = FINDINGS.MAX_STORED) {
  const list = Array.isArray(findings) ? findings : [];
  let excess = list.length - max;
  if (excess <= 0) return list;

  const dropped = new Set();
  for (const status of ['done', 'invalid']) {
    const candidates = list
      .map((finding, index) => ({ finding, index }))
      .filter(entry => entry.finding.status === status)
      .sort(byAge);
    for (const entry of candidates) {
      if (excess <= 0) break;
      dropped.add(entry.index);
      excess -= 1;
    }
  }
  return list.filter((_finding, index) => !dropped.has(index));
}

/**
 * Put the findings of a run into the stored list.
 * @param {Array} existing re-anchored stored findings
 * @param {Array} incoming the run's findings
 * @param {{checkId: string, ranges: Array<{from: number, to: number}>|null}} scope
 *   ranges: what the run read; null = the whole chapter
 * @returns {{findings: Array, replaced: number, suppressed: number}}
 */
function mergeRun(existing, incoming, scope) {
  const { checkId, ranges = null } = scope || {};
  const read = Array.isArray(ranges) ? ranges : null;

  // Open findings of the check that the run covered are replaced; those in a part it did not read stay
  const kept = [];
  let replaced = 0;
  for (const finding of Array.isArray(existing) ? existing : []) {
    const covered = finding.checkId === checkId && finding.status === 'open'
      && (read === null || (finding.located && read.some(range => overlaps(finding, range))));
    if (covered) replaced += 1;
    else kept.push(finding);
  }

  // What the author decided sticks: the same passage is not reported again by the same check
  const decided = kept.filter(finding => finding.checkId === checkId && finding.status !== 'open' && finding.located);
  const added = [];
  let suppressed = 0;
  for (const finding of Array.isArray(incoming) ? incoming : []) {
    const known = finding.located
      && decided.some(old => overlaps(finding, old) && refKey(old.ref) === refKey(finding.ref));
    if (known) suppressed += 1;
    else added.push(finding);
  }

  return { findings: capStored(kept.concat(added)), replaced, suppressed };
}

/**
 * Ranges of an old text as ranges of a new one, for a run that ends after the
 * author has typed. The texts are taken to differ in one region.
 */
function shiftRanges(ranges, oldText, newText) {
  const list = Array.isArray(ranges) ? ranges : [];
  const before = asText(oldText);
  const after = asText(newText);
  if (before === after) return list;

  const shortest = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < shortest && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < shortest - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;

  const oldEnd = before.length - suffix;
  const newEnd = after.length - suffix;
  const delta = after.length - before.length;
  // Before the region a position stays, after it it moves, inside it it goes to the region's new end
  const move = (pos) => (pos <= prefix ? pos : pos >= oldEnd ? pos + delta : newEnd);

  return list
    .map(range => ({ from: move(range.from), to: move(range.to) }))
    .filter(range => range.to > range.from);
}

/** A new list in which one finding has another status; the input when nothing can change. */
function applyStatus(findings, id, status, nowIso) {
  const list = Array.isArray(findings) ? findings : [];
  const index = list.findIndex(finding => finding.id === id);
  if (index === -1) return list;
  const finding = list[index];
  if (!statusesFor(finding).includes(status) || finding.status === status) return list;

  const next = list.slice();
  next[index] = { ...finding, status, statusAt: nowIso || new Date().toISOString() };
  return next;
}

function removeByCheck(findings, checkId) {
  return (Array.isArray(findings) ? findings : []).filter(finding => finding.checkId !== checkId);
}

/** What is written to the file: open local findings are recomputed from the text, so they are left out. */
function storable(findings) {
  return (Array.isArray(findings) ? findings : []).filter(finding => !(finding.kind === 'local' && finding.status === 'open'));
}

// ---------------------------------------------------------------------------
// Lists and highlights
// ---------------------------------------------------------------------------

// Reading order; findings without a place last
function byPosition(a, b) {
  if (a.located !== b.located) return a.located ? -1 : 1;
  if (a.located && (a.from !== b.from || a.to !== b.to)) return a.from - b.from || a.to - b.to;
  const aAt = a.createdAt || '';
  const bAt = b.createdAt || '';
  return aAt < bAt ? -1 : aAt > bAt ? 1 : 0;
}

/**
 * The findings the list shows.
 * @param {Array} findings
 * @param {{status?: string, checkId?: string|null}} [filter] status: one of the four or 'all'; checkId null = all checks
 */
function filterForList(findings, filter) {
  const { status = 'all', checkId = null } = filter || {};
  return (Array.isArray(findings) ? findings : [])
    .filter(finding => (status === 'all' || finding.status === status) && (checkId == null || finding.checkId === checkId))
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => byPosition(a.finding, b.finding) || a.index - b.index)
    .map(entry => entry.finding);
}

/** Counts for the filter row; `unlocated` are the open findings without a place. */
function countByStatus(findings) {
  const counts = { open: 0, done: 0, disagree: 0, invalid: 0, all: 0, unlocated: 0 };
  for (const finding of Array.isArray(findings) ? findings : []) {
    if (!STATUSES.includes(finding.status)) continue;
    counts[finding.status] += 1;
    counts.all += 1;
    if (finding.status === 'open' && !finding.located) counts.unlocated += 1;
  }
  return counts;
}

/**
 * How heavy a finding is for the eye: 'note' | 'warning' | 'error' (visual foundations 9.4, entry VF-2).
 * A local hit, what works and a small concern are notes, a serious concern is an error, every other
 * finding a warning. The card (ReviewPanel) and the mark in the manuscript read the same rule.
 */
function findingSeverity(finding) {
  if (!finding) return 'warning';
  if (finding.kind === 'local') return 'note';
  if (finding.data && Object.prototype.hasOwnProperty.call(finding.data, 'severity')) {
    const severity = finding.data.severity;
    if (severity === 'works' || severity === 'low') return 'note';
    if (severity === 'high') return 'error';
  }
  return 'warning';
}

/**
 * What the editor underlines: open findings with a place. Decided findings are not highlighted.
 * An item carries `severity` when it is not the default warning ('note' or 'error').
 */
function highlightItems(findings, docLength) {
  const length = Number.isFinite(docLength) ? docLength : Infinity;
  const items = [];
  for (const finding of Array.isArray(findings) ? findings : []) {
    if (!finding.located || finding.status !== 'open') continue;
    const from = Math.max(0, Math.min(finding.from, length));
    const to = Math.max(0, Math.min(finding.to, length));
    if (!(to > from)) continue;
    const severity = findingSeverity(finding);
    items.push(severity === 'warning' ? { id: finding.id, from, to } : { id: finding.id, from, to, severity });
  }
  return items.sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * The reading feedback as the two groups of its list: what works, in reading
 * order, and the concerns from suuri to pieni. A concern whose severity word
 * could not be read comes last. Models do not order reliably, so it is done here.
 * @returns {{works: Array, concerns: Array}}
 */
function feedbackGroups(findings) {
  const list = Array.isArray(findings) ? findings : [];
  const severityOf = (finding) => (finding.data && typeof finding.data.severity === 'string' ? finding.data.severity : null);
  const rank = (finding) => {
    const at = SEVERITY_ORDER.indexOf(severityOf(finding));
    return at === -1 ? SEVERITY_ORDER.length : at;
  };
  const sorted = (items, compare) => items
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => compare(a.finding, b.finding) || a.index - b.index)
    .map(entry => entry.finding);

  return {
    works: sorted(list.filter(finding => severityOf(finding) === 'works'), byPosition),
    concerns: sorted(list.filter(finding => severityOf(finding) !== 'works'), (a, b) => rank(a) - rank(b) || byPosition(a, b))
  };
}

// ---------------------------------------------------------------------------
// Run records
// ---------------------------------------------------------------------------

const OUTCOMES = ['ok', 'partial', 'failed', 'stopped', 'blocked'];
const count = (value) => (Number.isInteger(value) && value > 0 ? value : 0);

// What a run cut short means for its list: said once, by the run's own line
const MAY_MISS = 'Havaintoja voi puuttua.';
// A record stored before 25 Nov 2026 also ends a cut answer's message with it
const withoutSentence = (text, sentence) => text.split(sentence).map(part => part.trim()).filter(Boolean).join(' ');

/**
 * The record of a finished run.
 * @param {object} result the run's result
 * @param {{at: string, scope: 'chapter'|'selection', suppressed?: number, fingerprint: string, model?: string|null,
 *   found?: number, unlocated?: number}} extra model: the display name; found and unlocated: what reached the list
 */
function runRecord(result, extra) {
  const run = result || {};
  const info = extra || {};
  const suppressed = count(info.suppressed);
  const drafts = Array.isArray(run.drafts) ? run.drafts.length : 0;
  return {
    at: asText(info.at) || new Date().toISOString(),
    model: info.model !== undefined ? textOrNull(info.model) : textOrNull(run.model),
    scope: info.scope === 'selection' ? 'selection' : 'chapter',
    outcome: OUTCOMES.includes(run.outcome) ? run.outcome : 'failed',
    batches: count(run.batches),
    failedBatches: Array.isArray(run.failed) ? run.failed.length : 0,
    found: info.found !== undefined ? count(info.found) : Math.max(0, drafts - suppressed),
    unlocated: info.unlocated !== undefined ? count(info.unlocated) : count(run.unlocated),
    suppressed,
    message: textOrNull(run.message),
    dropped: textOrNull(run.dropped),
    fingerprint: asText(info.fingerprint)
  };
}

/** chapter.reviewRuns as it can be trusted. */
function normalizeRuns(value) {
  const runs = {};
  if (!isRecord(value)) return runs;
  for (const [checkId, record] of Object.entries(value)) {
    if (!isRecord(record) || typeof record.at !== 'string' || !record.at || !OUTCOMES.includes(record.outcome)) continue;
    runs[checkId] = record;
  }
  return runs;
}

/** Length and an unsigned 32-bit djb2 hash over the UTF-16 units: enough to see that a text changed. */
function textFingerprint(text) {
  const value = asText(text);
  let hash = 5381;
  for (let i = 0; i < value.length; i++) hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0;
  return `${value.length.toString(36)}-${hash.toString(36)}`;
}

/**
 * The last run of a check in words.
 * @param {object|null} record
 * @param {{stale?: boolean, formatTime?: (iso: string) => string}} [options]
 * @returns {{kind: 'none'|'ok'|'warn'|'error', lines: string[]}}
 */
function describeRun(record, options) {
  const { stale = false, formatTime = (iso) => asText(iso) } = options || {};
  if (!isRecord(record)) return { kind: 'none', lines: ['Tätä tarkistusta ei ole vielä ajettu tässä luvussa.'] };

  const time = formatTime(record.at);
  const message = asText(record.message);
  const lines = [];
  let kind;

  if (record.outcome === 'ok') {
    kind = 'ok';
    const found = count(record.found);
    let line = `Tarkistettu ${time}. `;
    if (found === 0) line += 'Ei havaintoja.';
    else line += found === 1 ? '1 havainto.' : `${found} havaintoa.`;
    if (found > 0 && count(record.unlocated) > 0) line += ` ${record.unlocated} ilman sijaintia.`;
    lines.push(line);
    // A reading feedback that was given in parts says so
    if (message) lines.push(message);
  } else if (record.outcome === 'partial') {
    kind = 'warn';
    const failed = count(record.failedBatches);
    lines.push(`Tarkistus jäi kesken ${time}: ${failed} ${failed > 1 ? 'osaa' : 'osa'} ${count(record.batches)}:stä epäonnistui. ${MAY_MISS}`);
    const reason = withoutSentence(message, MAY_MISS);
    if (reason) lines.push(reason);
  } else if (record.outcome === 'stopped') {
    kind = 'warn';
    lines.push(`Tarkistus pysäytettiin ${time}. ${MAY_MISS}`);
  } else if (record.outcome === 'blocked') {
    kind = 'error';
    if (message) lines.push(message);
  } else {
    kind = 'error';
    lines.push(`Tarkistus epäonnistui ${time}.`);
    if (message) lines.push(message);
  }

  const suppressed = count(record.suppressed);
  if (suppressed === 1) lines.push('1 aiemmin käsitelty havainto jätettiin pois.');
  else if (suppressed > 1) lines.push(`${suppressed} aiemmin käsiteltyä havaintoa jätettiin pois.`);
  if (record.dropped) lines.push(`Osa taustatiedoista ei mahtunut mallin ikkunaan. ${record.dropped}`);
  if (stale) lines.push('Luku on muuttunut tarkistuksen jälkeen.');

  return { kind, lines };
}

/**
 * Findings and Virheellinen marks per model over a project's chapters, most
 * findings first. Evidence about the model, not a score of the text.
 * @param {Array} chapters chapter objects; children are walked
 * @returns {Array<{model: string, total: number, invalid: number}>}
 */
function modelStats(chapters) {
  const byModel = new Map();
  const walk = (list) => {
    for (const chapter of Array.isArray(list) ? list : []) {
      if (!isRecord(chapter)) continue;
      for (const finding of normalizeFindings(chapter.findings)) {
        if (finding.kind === 'local' || !finding.model) continue;
        const row = byModel.get(finding.model) || { model: finding.model, total: 0, invalid: 0 };
        row.total += 1;
        if (finding.status === 'invalid') row.invalid += 1;
        byModel.set(finding.model, row);
      }
      walk(chapter.children);
    }
  };
  walk(chapters);
  return Array.from(byModel.values()).sort((a, b) => b.total - a.total || (a.model < b.model ? -1 : a.model > b.model ? 1 : 0));
}

module.exports = {
  STATUSES,
  STATUS_LABELS,
  STATUS_HINTS,
  FINDINGS,
  createFinding,
  normalizeFindings,
  statusesFor,
  reanchorOne,
  reanchorAll,
  mergeRun,
  shiftRanges,
  applyStatus,
  removeByCheck,
  storable,
  capStored,
  filterForList,
  countByStatus,
  highlightItems,
  findingSeverity,
  runRecord,
  normalizeRuns,
  describeRun,
  textFingerprint,
  modelStats,
  feedbackGroups
};

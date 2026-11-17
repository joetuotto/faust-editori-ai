/**
 * AI usage log of a project (project.aiLog)
 *
 * What the author can show to a publisher: which requests went to a model,
 * with which instruction, and which suggestions were accepted, rejected or
 * undone. A request row is written by the request client, a decision row by
 * the suggestion layer. The log never holds the prompt or the manuscript,
 * only the author's own instruction and, for a single decision, the changed
 * words (at most 500 characters each).
 *
 * Pure functions: a log goes in and a new log comes out. Unit-tested in
 * test/services/usageLog.test.js.
 */

const { fiDate, fiDateTime, modelLabel } = require('../format.fi.js');

const MAX_ROWS = 2000;
const MAX_TEXT = 500;
const SOURCES = ['faust', 'editor', 'external-ai'];
const SOURCE_LABELS = { faust: 'FAUSTin pyyntö', editor: 'kustannustoimittaja', 'external-ai': 'tekoäly muualla' };

// When the log is full, this many of the oldest rows become totals
const FOLD_ROWS = 500;

const OUTCOMES = ['ok', 'no_suggestion', 'cancelled', 'error'];
const DECISIONS = ['accepted', 'rejected', 'accept_undone'];
const DECISION_LABELS = { accepted: 'Hyväksytty', rejected: 'Hylätty', accept_undone: 'Hyväksyntä kumottu' };
const REDO_LABEL = 'Hyväksytty (tehty uudelleen)';
const MINUS = '\u2212';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const textOf = (value) => (typeof value === 'string' ? value : '');
const textOrNull = (value) => (typeof value === 'string' && value !== '' ? value : null);
const numberOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const amount = (value) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
const isIso = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const isoOrNow = (value) => (isIso(value) ? value : new Date().toISOString());

// Cut to MAX_TEXT characters plus an ellipsis, never between the two halves
// of a surrogate pair (an emoji would otherwise turn into a broken character)
function cutText(value) {
  const text = textOf(value);
  if (text.length <= MAX_TEXT) return { text, cut: false };
  let end = MAX_TEXT;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return { text: text.slice(0, end) + '…', cut: true };
}

let rowCounter = 0;

function nextRowId(nowIso) {
  rowCounter += 1;
  return `log-${Date.parse(nowIso).toString(36)}-${rowCounter}`;
}

// ---------------------------------------------------------------------------
// The log
// ---------------------------------------------------------------------------

/** An empty log that starts now. */
function createLog(nowIso) {
  return { version: 1, startedAt: isoOrNow(nowIso), rows: [], archived: null };
}

const emptySources = () => ({ faust: 0, editor: 0, 'external-ai': 0 });

// Totals of rows that were folded away. The numbers are plain sums (accepted
// minus undone where both exist) and may be negative here: they are clamped
// only when they are read, together with the rows that are still in the log.
function normalizeArchive(value) {
  if (!isPlainObject(value)) return null;
  const sources = isPlainObject(value.acceptedBySource) ? value.acceptedBySource : {};
  const chapters = isPlainObject(value.charsByChapter) ? value.charsByChapter : {};

  const charsByChapter = {};
  for (const [chapterId, entry] of Object.entries(chapters)) {
    if (!isPlainObject(entry)) continue;
    charsByChapter[chapterId] = {
      title: textOf(entry.title),
      faust: numberOrNull(entry.faust) || 0,
      editor: numberOrNull(entry.editor) || 0,
      'external-ai': numberOrNull(entry['external-ai']) || 0,
      count: numberOrNull(entry.count) || 0
    };
  }

  return {
    until: isIso(value.until) ? value.until : null,
    rows: amount(value.rows),
    requests: amount(value.requests),
    accepted: amount(value.accepted),
    rejected: amount(value.rejected),
    undone: amount(value.undone),
    undoneChars: amount(value.undoneChars),
    acceptedBySource: {
      faust: numberOrNull(sources.faust) || 0,
      editor: numberOrNull(sources.editor) || 0,
      'external-ai': numberOrNull(sources['external-ai']) || 0
    },
    charsByChapter
  };
}

// A deterministic tool's change is never logged (contract 1.1): such a row
// would otherwise be shown and counted as a FAUST model request
const isLocalDecision = (row) => isPlainObject(row) && row.kind === 'decision' && row.source === 'local';

/** A valid log from whatever the project file holds. */
function normalizeLog(value, nowIso) {
  if (!isPlainObject(value)) return createLog(nowIso);
  return {
    version: 1,
    startedAt: isIso(value.startedAt) ? value.startedAt : isoOrNow(nowIso),
    rows: Array.isArray(value.rows) ? value.rows.filter(row => isPlainObject(row) && !isLocalDecision(row)) : [],
    archived: normalizeArchive(value.archived)
  };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/**
 * One finished request. `fields` may leave anything out: missing strings
 * become '', missing numbers null. `contextUsed` is the share of the model's
 * window the prompt took; it is computed from `tokensIn` and `window` when
 * it is not given.
 */
function requestRow(fields, nowIso, id) {
  const f = isPlainObject(fields) ? fields : {};
  const at = isoOrNow(nowIso);
  const tokensIn = numberOrNull(f.tokensIn);

  let contextUsed = numberOrNull(f.contextUsed);
  if (contextUsed === null && tokensIn !== null && numberOrNull(f.window) > 0) contextUsed = tokensIn / f.window;
  if (contextUsed !== null) contextUsed = Math.round(Math.min(1, Math.max(0, contextUsed)) * 100) / 100;

  return {
    id: textOrNull(id) || nextRowId(at),
    at,
    kind: 'request',
    action: textOf(f.action),
    actionLabel: textOf(f.actionLabel),
    instruction: cutText(f.instruction).text,
    source: 'faust',
    provider: textOf(f.provider),
    model: textOf(f.model),
    outcome: OUTCOMES.includes(f.outcome) ? f.outcome : 'ok',
    reason: textOrNull(f.reason),
    stopReason: textOf(f.stopReason),
    requests: Math.max(1, amount(f.requests)),
    runId: textOrNull(f.runId),
    chapterId: textOrNull(f.chapterId),
    tokensIn,
    tokensOut: numberOrNull(f.tokensOut),
    contextUsed,
    promptChars: numberOrNull(f.promptChars),
    sawThinking: f.sawThinking === true
  };
}

/**
 * One decision about suggestions: a single one (with the changed words) or a
 * group (counts only). A redo of an accept is `decision: 'accepted', redo: true`.
 */
function decisionRow(fields, nowIso, id) {
  const f = isPlainObject(fields) ? fields : {};
  const at = isoOrNow(nowIso);
  const scope = f.scope === 'group' ? 'group' : 'single';

  let before = null;
  let after = null;
  let truncated = false;
  if (scope === 'single') {
    if (typeof f.before === 'string') {
      const cut = cutText(f.before);
      before = cut.text;
      truncated = truncated || cut.cut;
    }
    if (typeof f.after === 'string') {
      const cut = cutText(f.after);
      after = cut.text;
      truncated = truncated || cut.cut;
    }
  }

  return {
    id: textOrNull(id) || nextRowId(at),
    at,
    kind: 'decision',
    decision: DECISIONS.includes(f.decision) ? f.decision : 'accepted',
    redo: f.redo === true,
    scope,
    source: SOURCES.includes(f.source) || f.source === 'local' ? f.source : 'faust',
    action: textOf(f.action),
    actionLabel: textOf(f.actionLabel),
    instruction: cutText(f.instruction).text,
    provider: textOrNull(f.provider),
    model: textOrNull(f.model),
    chapterId: textOrNull(f.chapterId),
    chapterTitle: textOf(f.chapterTitle),
    count: typeof f.count === 'number' && Number.isFinite(f.count) && f.count >= 0 ? Math.round(f.count) : 1,
    charsAdded: amount(f.charsAdded),
    charsRemoved: amount(f.charsRemoved),
    before,
    after,
    truncated,
    snapshotId: textOrNull(f.snapshotId),
    requestLogId: textOrNull(f.requestLogId)
  };
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

// Every number here is a plain sum, so rows can be added in any grouping:
// folding old rows into the archive leaves the totals as they were
function emptyTally() {
  return {
    until: null,
    rows: 0,
    requests: 0,
    accepted: 0,
    rejected: 0,
    undone: 0,
    undoneChars: 0,
    acceptedBySource: emptySources(),
    chapters: new Map()   // chapter id ('' when unknown) → { title, faust, editor, 'external-ai', count }, by first appearance
  };
}

function chapterTally(tally, chapterId, title) {
  const key = textOf(chapterId);
  let entry = tally.chapters.get(key);
  if (!entry) {
    entry = { title: '', ...emptySources(), count: 0 };
    tally.chapters.set(key, entry);
  }
  if (title) entry.title = title;
  return entry;
}

function addArchive(tally, archived) {
  if (!archived) return;
  if (archived.until && (tally.until === null || archived.until > tally.until)) tally.until = archived.until;
  tally.rows += archived.rows;
  tally.requests += archived.requests;
  tally.accepted += archived.accepted;
  tally.rejected += archived.rejected;
  tally.undone += archived.undone;
  tally.undoneChars += archived.undoneChars;
  for (const source of SOURCES) tally.acceptedBySource[source] += archived.acceptedBySource[source];
  for (const [chapterId, stored] of Object.entries(archived.charsByChapter)) {
    const entry = chapterTally(tally, chapterId, stored.title);
    for (const source of SOURCES) entry[source] += stored[source];
    entry.count += stored.count;
  }
}

function addRow(tally, row) {
  tally.rows += 1;
  if (isIso(row.at) && (tally.until === null || row.at > tally.until)) tally.until = row.at;

  if (row.kind === 'request') {
    tally.requests += Math.max(1, amount(row.requests));
    return;
  }
  if (row.kind !== 'decision') return;

  const count = amount(row.count);
  const chars = amount(row.charsAdded);
  const source = SOURCES.includes(row.source) ? row.source : 'faust';

  if (row.decision === 'rejected') {
    tally.rejected += count;
  } else if (row.decision === 'accepted' || row.decision === 'accept_undone') {
    // An undone acceptance takes back what the acceptance added
    const sign = row.decision === 'accepted' ? 1 : -1;
    if (sign === 1) {
      tally.accepted += count;
    } else {
      tally.undone += count;
      tally.undoneChars += chars;
    }
    tally.acceptedBySource[source] += sign * count;
    const entry = chapterTally(tally, row.chapterId, textOf(row.chapterTitle));
    entry[source] += sign * chars;
    entry.count += sign * count;
  }
}

function tallyOf(log) {
  const tally = emptyTally();
  addArchive(tally, log.archived);
  for (const row of log.rows) addRow(tally, row);
  return tally;
}

function foldRows(archived, rows) {
  const tally = emptyTally();
  addArchive(tally, archived);
  for (const row of rows) addRow(tally, row);

  const charsByChapter = {};
  for (const [chapterId, entry] of tally.chapters) charsByChapter[chapterId] = { ...entry };

  return {
    until: tally.until,
    rows: tally.rows,
    requests: tally.requests,
    accepted: tally.accepted,
    rejected: tally.rejected,
    undone: tally.undone,
    undoneChars: tally.undoneChars,
    acceptedBySource: { ...tally.acceptedBySource },
    charsByChapter
  };
}

const addNullable = (a, b) => (numberOrNull(a) === null && numberOrNull(b) === null ? null : (numberOrNull(a) || 0) + (numberOrNull(b) || 0));

// Requests of one run are one row. The worse outcome stays: a run with one
// failed batch is not "valmis" because its last batch went through.
function mergeRequestRows(older, newer) {
  const keepOlder = newer.outcome === 'ok' && older.outcome !== 'ok';
  const from = keepOlder ? older : newer;
  const usedOlder = numberOrNull(older.contextUsed);
  const usedNewer = numberOrNull(newer.contextUsed);

  return {
    ...older,
    at: from.at,
    outcome: from.outcome,
    reason: from.reason,
    stopReason: from.stopReason,
    provider: newer.provider || older.provider,
    model: newer.model || older.model,
    requests: Math.max(1, amount(older.requests)) + Math.max(1, amount(newer.requests)),
    tokensIn: addNullable(older.tokensIn, newer.tokensIn),
    tokensOut: addNullable(older.tokensOut, newer.tokensOut),
    promptChars: addNullable(older.promptChars, newer.promptChars),
    contextUsed: usedOlder === null || usedNewer === null ? (usedOlder === null ? usedNewer : usedOlder) : Math.max(usedOlder, usedNewer),
    sawThinking: older.sawThinking === true || newer.sawThinking === true
  };
}

/**
 * The log with one more row. Returns a new log; the input is not changed.
 * A request row that continues the run of the last row is merged into it.
 */
function appendRow(log, row, nowIso) {
  const base = normalizeLog(log, nowIso);
  if (!isPlainObject(row) || isLocalDecision(row)) return base;

  const rows = base.rows.slice();
  const last = rows[rows.length - 1];
  const sameRun = row.kind === 'request'
    && typeof row.runId === 'string' && row.runId !== ''
    && last && last.kind === 'request' && last.runId === row.runId;

  if (sameRun) rows[rows.length - 1] = mergeRequestRows(last, row);
  else rows.push(row);

  if (rows.length <= MAX_ROWS) return { ...base, rows };

  return {
    ...base,
    rows: rows.slice(FOLD_ROWS),
    archived: foldRows(base.archived, rows.slice(0, FOLD_ROWS))
  };
}

/**
 * Totals of the whole log, the archive included. Accepted counts and
 * characters are what is left after undone acceptances, never below zero.
 */
function summarize(log) {
  const data = normalizeLog(log);
  const tally = tallyOf(data);
  const left = (value) => Math.max(0, value);

  const byChapter = [];
  let chars = 0;
  for (const [key, entry] of tally.chapters) {
    const perSource = { faust: left(entry.faust), editor: left(entry.editor), 'external-ai': left(entry['external-ai']) };
    const total = perSource.faust + perSource.editor + perSource['external-ai'];
    // A chapter whose every acceptance was undone has nothing to show
    if (total === 0 && entry.count <= 0) continue;
    chars += total;
    byChapter.push({ chapterId: key === '' ? null : key, chapterTitle: entry.title, chars: total, ...perSource });
  }

  const bySource = {
    faust: left(tally.acceptedBySource.faust),
    editor: left(tally.acceptedBySource.editor),
    'external-ai': left(tally.acceptedBySource['external-ai'])
  };

  return {
    startedAt: data.startedAt,
    requests: tally.requests,
    // The sum of the clamped sources, so that count, bySource and chars describe the same acceptances
    accepted: { count: bySource.faust + bySource.editor + bySource['external-ai'], chars },
    rejected: { count: tally.rejected },
    undone: { count: tally.undone, chars: tally.undoneChars },
    bySource,
    byChapter
  };
}

// ---------------------------------------------------------------------------
// The text the author saves
// ---------------------------------------------------------------------------

function outcomeText(row) {
  if (row.outcome === 'ok') return 'valmis';
  if (row.outcome === 'cancelled') return 'pysäytetty';
  const word = row.outcome === 'no_suggestion' ? 'ei ehdotusta' : 'virhe';
  return row.reason ? `${word} (${row.reason})` : word;
}

function requestLines(row) {
  const parts = [fiDateTime(row.at), 'Pyyntö', row.actionLabel || row.action || 'tekoälypyyntö'];
  if (row.model) parts.push(`malli ${modelLabel(row.model)}`);
  parts.push(outcomeText(row));

  const tokensIn = numberOrNull(row.tokensIn);
  const tokensOut = numberOrNull(row.tokensOut);
  if (tokensIn !== null && tokensOut !== null) parts.push(`${tokensIn} → ${tokensOut} tokenia`);

  const used = numberOrNull(row.contextUsed);
  if (used !== null) parts.push(`konteksti ${Math.round(used * 100)} %`);

  const requests = amount(row.requests);
  if (requests > 1) parts.push(`${requests} pyyntöä`);

  const lines = [parts.join(' · ')];
  if (row.instruction) lines.push(`    ohje: ”${row.instruction}”`);
  return lines;
}

function decisionLines(row, titleOf) {
  const label = row.decision === 'accepted' && row.redo === true ? REDO_LABEL : (DECISION_LABELS[row.decision] || DECISION_LABELS.accepted);
  const count = amount(row.count);

  const parts = [
    fiDateTime(row.at),
    label,
    titleOf(row.chapterId, row.chapterTitle),
    SOURCE_LABELS[row.source] || SOURCE_LABELS.faust
  ];
  const action = row.actionLabel || row.action;
  if (action) parts.push(action);
  if (row.model) parts.push(`malli ${modelLabel(row.model)}`);
  parts.push(`${count} ${count === 1 ? 'ehdotus' : 'ehdotusta'}`);
  parts.push(`+${amount(row.charsAdded)} / ${MINUS}${amount(row.charsRemoved)} merkkiä`);
  if (row.snapshotId) parts.push(`tilannekuva ${row.snapshotId}`);

  const lines = [parts.join(' · ')];
  if (typeof row.before === 'string' && typeof row.after === 'string') {
    lines.push(`    ennen: ”${row.before}”`);
    lines.push(`    jälkeen: ”${row.after}”`);
  }
  return lines;
}

/**
 * The log as plain text. `chapterTitles` maps chapter ids to their current
 * titles; a row's stored title is the fallback. Numbers are plain digits.
 */
function exportText(log, options) {
  const { projectTitle = '', now = new Date(), chapterTitles = {} } = isPlainObject(options) ? options : {};
  const data = normalizeLog(log);
  const summary = summarize(data);
  const titles = isPlainObject(chapterTitles) ? chapterTitles : {};
  const titleOf = (chapterId, stored) => {
    if (typeof chapterId === 'string' && own(titles, chapterId) && titles[chapterId]) return titles[chapterId];
    return stored || '(poistettu luku)';
  };

  const lines = [
    'Tekoälyn käyttöloki',
    `Projekti: ${textOf(projectTitle)}`,
    `Viety: ${fiDateTime(now)}`,
    `Loki on ollut käytössä ${fiDate(data.startedAt)} alkaen. Sitä aiempi tekoälyn käyttö ei näy tässä lokissa.`,
    '',
    'Yhteenveto',
    `Pyyntöjä tekoälylle: ${summary.requests}`,
    `Hyväksyttyjä ehdotuksia: ${summary.accepted.count} (${summary.accepted.chars} merkkiä)`,
    `Hylättyjä ehdotuksia: ${summary.rejected.count}`,
    `Kumottuja hyväksyntöjä: ${summary.undone.count}`,
    '',
    'Hyväksytyt merkit luvuittain'
  ];

  if (summary.byChapter.length === 0) {
    lines.push('Ei hyväksyttyjä ehdotuksia.');
  } else {
    for (const chapter of summary.byChapter) {
      lines.push(
        `${titleOf(chapter.chapterId, chapter.chapterTitle)}: ${chapter.chars} merkkiä `
        + `(${SOURCE_LABELS.faust} ${chapter.faust}, ${SOURCE_LABELS.editor} ${chapter.editor}, ${SOURCE_LABELS['external-ai']} ${chapter['external-ai']})`
      );
    }
  }

  lines.push('', 'Tapahtumat');
  if (data.archived) {
    lines.push(`Vanhemmat tapahtumat (${data.archived.rows} kpl, ${fiDate(data.archived.until)} asti) on tiivistetty yhteenvetoon.`);
  }
  const events = data.rows.filter(row => row.kind === 'request' || row.kind === 'decision');
  if (events.length === 0 && !data.archived) lines.push('Lokissa ei ole vielä tapahtumia.');
  for (const row of events) {
    lines.push(...(row.kind === 'request' ? requestLines(row) : decisionLines(row, titleOf)));
  }

  return lines.join('\n') + '\n';
}

module.exports = {
  MAX_ROWS, MAX_TEXT, SOURCES, SOURCE_LABELS,
  createLog, normalizeLog, appendRow, requestRow, decisionRow,
  summarize, exportText
};

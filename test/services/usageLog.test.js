/**
 * @jest-environment node
 */
const usageLog = require('../../src/services/ai/usageLog');

const {
  MAX_ROWS,
  MAX_TEXT,
  SOURCES,
  SOURCE_LABELS,
  createLog,
  normalizeLog,
  appendRow,
  requestRow,
  decisionRow,
  summarize,
  exportText
} = usageLog;

// Times are built from local parts, so the printed clock is the same in every time zone
const at = (hour, minute, day = 16) => new Date(2026, 10, day, hour, minute).toISOString();
const START = at(9, 5);
const MODEL = 'c91fb219-b725-43d2-925d-3c6e66bef527:glm-5.3-flash';

const request = (fields = {}, when = at(19, 2), id) => requestRow({
  action: 'quick-edit',
  actionLabel: 'Tiivistä',
  instruction: 'Tiivistä tämä kappale.',
  provider: 'cherry',
  model: MODEL,
  outcome: 'ok',
  stopReason: 'end_turn',
  chapterId: 'c1',
  tokensIn: 1200,
  tokensOut: 300,
  window: 32000,
  promptChars: 3300,
  ...fields
}, when, id);

const decision = (fields = {}, when = at(19, 3), id) => decisionRow({
  decision: 'accepted',
  scope: 'single',
  source: 'faust',
  action: 'quick-edit',
  actionLabel: 'Tiivistä',
  instruction: 'Tiivistä tämä kappale.',
  provider: 'cherry',
  model: MODEL,
  chapterId: 'c1',
  chapterTitle: 'Ensimmäinen luku',
  count: 1,
  charsAdded: 12,
  charsRemoved: 20,
  before: 'vanha teksti',
  after: 'uusi teksti',
  ...fields
}, when, id);

const build = (rows, start = START) => rows.reduce((log, row) => appendRow(log, row, start), createLog(start));

describe('constants', () => {
  test('limits, sources and their Finnish names', () => {
    expect(MAX_ROWS).toBe(2000);
    expect(MAX_TEXT).toBe(500);
    expect(SOURCES).toEqual(['faust', 'editor', 'external-ai']);
    expect(SOURCE_LABELS).toEqual({ faust: 'FAUSTin pyyntö', editor: 'kustannustoimittaja', 'external-ai': 'tekoäly muualla' });
  });

  test('the date and model-name rules live in format.fi.js, not here', () => {
    expect('fiDate' in usageLog).toBe(false);
    expect('fiDateTime' in usageLog).toBe(false);
    expect('modelLabel' in usageLog).toBe(false);
  });
});

describe('createLog and normalizeLog', () => {
  test('createLog sets version, startedAt and empty rows', () => {
    expect(createLog(START)).toEqual({ version: 1, startedAt: START, rows: [], archived: null });
    // Two logs never share their rows array
    expect(createLog(START).rows).not.toBe(createLog(START).rows);
  });

  test('normalizeLog repairs a missing or malformed log and keeps an existing startedAt', () => {
    for (const broken of [undefined, null, 'loki', 7, []]) {
      expect(normalizeLog(broken, START)).toEqual({ version: 1, startedAt: START, rows: [], archived: null });
    }

    const earlier = at(8, 0, 2);
    expect(normalizeLog({ version: 1, startedAt: earlier, rows: 'rikki' }, START))
      .toEqual({ version: 1, startedAt: earlier, rows: [], archived: null });
    expect(normalizeLog({ rows: [] }, START).startedAt).toBe(START);
    expect(normalizeLog({ startedAt: 'ei päivä', rows: [] }, START).startedAt).toBe(START);

    const row = request();
    const kept = normalizeLog({ version: 1, startedAt: earlier, rows: [row, null, 'x'], archived: 'rikki' }, START);
    expect(kept.startedAt).toBe(earlier);
    expect(kept.rows).toEqual([row]);
    expect(kept.archived).toBeNull();
  });
});

describe('requestRow', () => {
  test('requestRow fills the whole row shape', () => {
    const row = request({ runId: 'run-1' }, at(19, 2), 'log-test-1');
    expect(row).toEqual({
      id: 'log-test-1',
      at: at(19, 2),
      kind: 'request',
      action: 'quick-edit',
      actionLabel: 'Tiivistä',
      instruction: 'Tiivistä tämä kappale.',
      source: 'faust',
      provider: 'cherry',
      model: MODEL,
      outcome: 'ok',
      reason: null,
      stopReason: 'end_turn',
      requests: 1,
      runId: 'run-1',
      chapterId: 'c1',
      tokensIn: 1200,
      tokensOut: 300,
      contextUsed: 0.04,
      promptChars: 3300,
      sawThinking: false
    });
  });

  test('requestRow may be called with the fields alone: the time and a fresh id are filled in', () => {
    const before = Date.now();
    const first = requestRow({ action: 'review' });
    const second = requestRow({ action: 'review' });

    expect(first.id).toMatch(/^log-[0-9a-z]+-\d+$/);
    expect(second.id).not.toBe(first.id);
    expect(Date.parse(first.at)).toBeGreaterThanOrEqual(before);
    expect(first).toMatchObject({
      kind: 'request', action: 'review', actionLabel: '', instruction: '', source: 'faust', provider: '', model: '',
      outcome: 'ok', reason: null, stopReason: '', requests: 1, runId: null, chapterId: null,
      tokensIn: null, tokensOut: null, contextUsed: null, promptChars: null, sawThinking: false
    });
    expect(requestRow(undefined).kind).toBe('request');
  });

  test('requestRow cuts the instruction at 500 characters with `…` and does not split a surrogate pair', () => {
    const exact = 'ä'.repeat(500);
    expect(requestRow({ instruction: exact }).instruction).toBe(exact);

    const long = 'ö'.repeat(501);
    const cut = requestRow({ instruction: long }).instruction;
    expect(cut).toBe('ö'.repeat(500) + '…');
    expect(cut.length).toBe(501);

    // The emoji straddles the limit: both of its halves go, not one
    const straddling = 'a'.repeat(499) + '😀' + 'loppu';
    const safe = requestRow({ instruction: straddling }).instruction;
    expect(safe).toBe('a'.repeat(499) + '…');
    expect(safe).not.toMatch(/[\ud800-\udbff]…$/);

    // An emoji that fits whole is kept
    const fitting = 'a'.repeat(498) + '😀' + 'loppu';
    expect(requestRow({ instruction: fitting }).instruction).toBe('a'.repeat(498) + '😀…');
  });

  test('requestRow leaves token fields null when the server sent none', () => {
    const row = request({ tokensIn: null, tokensOut: undefined });
    expect(row.tokensIn).toBeNull();
    expect(row.tokensOut).toBeNull();
    expect(row.contextUsed).toBeNull();

    // One number alone is kept; the context share needs the prompt size and the window
    const half = request({ tokensIn: null, tokensOut: 55 });
    expect(half.tokensOut).toBe(55);
    expect(half.contextUsed).toBeNull();
    expect(request({ window: undefined }).contextUsed).toBeNull();
  });

  test('requestRow gives the share of the window with two decimals, between 0 and 1', () => {
    expect(request({ tokensIn: 8000, window: 32000 }).contextUsed).toBe(0.25);
    expect(request({ tokensIn: 12345, window: 32000 }).contextUsed).toBe(0.39);
    expect(request({ tokensIn: 40000, window: 32000 }).contextUsed).toBe(1);
    // A share the caller worked out itself wins
    expect(request({ contextUsed: 0.5 }).contextUsed).toBe(0.5);
  });

  test('requestRow keeps promptChars and sawThinking', () => {
    const row = request({ promptChars: 8421, sawThinking: true });
    expect(row.promptChars).toBe(8421);
    expect(row.sawThinking).toBe(true);

    const bare = request({ promptChars: undefined, sawThinking: undefined });
    expect(bare.promptChars).toBeNull();
    expect(bare.sawThinking).toBe(false);
  });

  test('requestRow keeps the outcome, the reason and the number of requests', () => {
    const row = request({ outcome: 'no_suggestion', reason: 'missing_tag', stopReason: 'end_turn', requests: 2 });
    expect(row).toMatchObject({ outcome: 'no_suggestion', reason: 'missing_tag', requests: 2 });
    expect(request({ outcome: 'error', reason: 'unreachable', stopReason: 'error' }).reason).toBe('unreachable');
  });
});

describe('decisionRow', () => {
  test('a decision of a deterministic tool (source local) is never logged or counted', () => {
    const local = decision({ source: 'local', chapterId: 'c1', charsAdded: 3, count: 3 });
    expect(local.source).toBe('local');

    const log = appendRow(createLog(START), local, START);
    expect(log.rows).toEqual([]);
    expect(summarize(log).accepted).toEqual({ count: 0, chars: 0 });

    // A local row that is already in a project file is left out too
    const stored = { ...createLog(START), rows: [local, decision({ chapterId: 'c1', charsAdded: 20 })] };
    expect(summarize(stored).bySource).toEqual({ faust: 1, editor: 0, 'external-ai': 0 });
    expect(exportText(stored, { projectTitle: 'Kirja', now: new Date(2026, 10, 20, 14, 30) })).not.toContain('3 ehdotusta');
  });

  test('decisionRow keeps before and after only for a single change and caps them at 500 characters', () => {
    const short = decision({ before: 'Hän meni', after: 'Hän lähti' });
    expect(short.before).toBe('Hän meni');
    expect(short.after).toBe('Hän lähti');
    expect(short.truncated).toBe(false);

    const long = decision({ before: 'x'.repeat(700), after: 'lyhyt' });
    expect(long.before).toBe('x'.repeat(500) + '…');
    expect(long.after).toBe('lyhyt');
    expect(long.truncated).toBe(true);

    const longAfter = decision({ before: 'lyhyt', after: 'y'.repeat(501) });
    expect(longAfter.after).toBe('y'.repeat(500) + '…');
    expect(longAfter.truncated).toBe(true);

    // An insertion has an empty "before": that is a text, not a missing one
    expect(decision({ before: '', after: ', ' }).before).toBe('');
  });

  test('decisionRow for a group stores the counts and the snapshot id and no texts', () => {
    const row = decision({
      scope: 'group', count: 14, charsAdded: 230, charsRemoved: 180, snapshotId: 'snapshot-1794859460964',
      before: 'ei saa tallentua', after: 'ei tämäkään', requestLogId: 'log-abc-7'
    }, at(19, 10), 'log-test-2');

    expect(row).toEqual({
      id: 'log-test-2',
      at: at(19, 10),
      kind: 'decision',
      decision: 'accepted',
      redo: false,
      scope: 'group',
      source: 'faust',
      action: 'quick-edit',
      actionLabel: 'Tiivistä',
      instruction: 'Tiivistä tämä kappale.',
      provider: 'cherry',
      model: MODEL,
      chapterId: 'c1',
      chapterTitle: 'Ensimmäinen luku',
      count: 14,
      charsAdded: 230,
      charsRemoved: 180,
      before: null,
      after: null,
      truncated: false,
      snapshotId: 'snapshot-1794859460964',
      requestLogId: 'log-abc-7'
    });
  });

  test('decisionRow fills defaults and may be called with the fields alone', () => {
    const row = decisionRow({ decision: 'rejected', source: 'editor' });
    expect(row.id).toMatch(/^log-[0-9a-z]+-\d+$/);
    expect(row).toMatchObject({
      kind: 'decision', decision: 'rejected', redo: false, scope: 'single', source: 'editor',
      action: '', actionLabel: '', instruction: '', provider: null, model: null, chapterId: null, chapterTitle: '',
      count: 1, charsAdded: 0, charsRemoved: 0, before: null, after: null, truncated: false, snapshotId: null, requestLogId: null
    });
    expect(decisionRow({ decision: 'accepted', redo: true }).redo).toBe(true);
    expect(decisionRow({ decision: 'accept_undone' }).decision).toBe('accept_undone');
  });
});

describe('appendRow', () => {
  test('appendRow returns a new log and does not mutate the old one', () => {
    const log = build([request()]);
    const frozen = JSON.parse(JSON.stringify(log));
    Object.freeze(log);
    Object.freeze(log.rows);

    const next = appendRow(log, decision(), START);

    expect(next).not.toBe(log);
    expect(next.rows).not.toBe(log.rows);
    expect(next.rows).toHaveLength(2);
    expect(log).toEqual(frozen);
    expect(next.startedAt).toBe(log.startedAt);
  });

  test('appendRow accepts an undefined log', () => {
    const row = request();
    const log = appendRow(undefined, row, START);
    expect(log).toEqual({ version: 1, startedAt: START, rows: [row], archived: null });

    // And a log that the project file has damaged
    expect(appendRow({ rows: 'rikki' }, row, START).rows).toEqual([row]);
  });

  test('appendRow merges request rows that share a runId and keeps the worse outcome', () => {
    const first = request({ runId: 'run-7', tokensIn: 1000, tokensOut: 200, promptChars: 2700 }, at(19, 2), 'log-a');
    const failed = request({ runId: 'run-7', outcome: 'no_suggestion', reason: 'max_tokens', stopReason: 'max_tokens', tokensIn: 1100, tokensOut: null, promptChars: 3000, sawThinking: true }, at(19, 3), 'log-b');
    const last = request({ runId: 'run-7', tokensIn: null, tokensOut: 150, promptChars: 2500 }, at(19, 4), 'log-c');

    const two = build([first, failed]);
    expect(two.rows).toHaveLength(1);
    expect(two.rows[0]).toMatchObject({
      id: 'log-a',
      at: at(19, 3),
      outcome: 'no_suggestion',
      reason: 'max_tokens',
      stopReason: 'max_tokens',
      requests: 2,
      tokensIn: 2100,
      tokensOut: 200,
      promptChars: 5700,
      sawThinking: true,
      runId: 'run-7'
    });

    // The newer row is fine, the older was not: the worse outcome and its time stay
    const three = appendRow(two, last, START);
    expect(three.rows).toHaveLength(1);
    expect(three.rows[0]).toMatchObject({
      at: at(19, 3),
      outcome: 'no_suggestion',
      reason: 'max_tokens',
      stopReason: 'max_tokens',
      requests: 3,
      tokensIn: 2100,
      tokensOut: 350
    });

    // Both unknown stays unknown
    const blind = build([
      request({ runId: 'r', tokensIn: null, tokensOut: null }),
      request({ runId: 'r', tokensIn: null, tokensOut: null })
    ]);
    expect(blind.rows[0].tokensIn).toBeNull();
    expect(blind.rows[0].tokensOut).toBeNull();

    // A newer failure replaces an older success
    const worse = build([request({ runId: 'x' }, at(19, 2)), request({ runId: 'x', outcome: 'error', reason: 'unreachable', stopReason: 'error' }, at(19, 6))]);
    expect(worse.rows[0]).toMatchObject({ at: at(19, 6), outcome: 'error', reason: 'unreachable', requests: 2 });

    // The merged row is a new object: the row that was appended first is untouched
    expect(first.requests).toBe(1);
    expect(first.tokensIn).toBe(1000);
  });

  test('appendRow keeps rows without a runId, and rows of different runs, apart', () => {
    const log = build([request(), request(), request({ runId: 'a' }), request({ runId: 'b' }), request({ runId: 'b' })]);
    expect(log.rows.map(row => row.requests)).toEqual([1, 1, 1, 2]);
  });

  test('appendRow does not merge across a decision row', () => {
    const log = build([request({ runId: 'run-7' }), decision(), request({ runId: 'run-7' })]);
    expect(log.rows.map(row => row.kind)).toEqual(['request', 'decision', 'request']);
    expect(log.rows[0].requests).toBe(1);
    expect(log.rows[2].requests).toBe(1);

    // Also when the row in between happens to carry the same run id: only request rows merge
    const tagged = { ...decision(), runId: 'run-7' };
    const second = build([tagged, request({ runId: 'run-7' })]);
    expect(second.rows.map(row => row.kind)).toEqual(['decision', 'request']);
    expect(second.rows[0]).toBe(tagged);
  });

  test('appendRow folds the oldest rows into `archived` above MAX_ROWS, and summarize gives the same totals before and after', () => {
    // A mixed log: requests (some merged runs), accepts from all three sources, rejects and undos in five chapters
    const rows = [];
    for (let i = 0; i < MAX_ROWS; i += 1) {
      const when = at(8, 0, 1 + Math.floor(i / 100));
      const chapter = `c${i % 5}`;
      const kind = i % 6;
      if (kind === 0) rows.push(request({ chapterId: chapter, requests: 1 + (i % 3) }, when));
      else if (kind === 1) rows.push(decision({ chapterId: chapter, chapterTitle: `Luku ${i % 5}`, charsAdded: 10 + (i % 7), count: 1 }, when));
      else if (kind === 2) rows.push(decision({ chapterId: chapter, chapterTitle: `Luku ${i % 5}`, source: 'editor', scope: 'group', count: 4, charsAdded: 40 }, when));
      else if (kind === 3) rows.push(decision({ chapterId: chapter, chapterTitle: `Luku ${i % 5}`, source: 'external-ai', charsAdded: 5 }, when));
      else if (kind === 4) rows.push(decision({ chapterId: chapter, decision: 'rejected', count: 2 }, when));
      else rows.push(decision({ chapterId: chapter, chapterTitle: `Luku ${i % 5}`, decision: 'accept_undone', charsAdded: 10 + ((i - 4) % 7), count: 1 }, when));
    }
    const full = { version: 1, startedAt: START, rows, archived: null };
    expect(full.rows).toHaveLength(MAX_ROWS);
    expect(appendRow(full, null, START).archived).toBeNull();

    const extra = decision({ chapterId: 'c9', chapterTitle: 'Uusi luku', charsAdded: 77 }, at(8, 0, 25));
    // The same rows in a log that was never folded
    const expected = summarize({ ...full, rows: [...rows, extra] });

    const folded = appendRow(full, extra, START);

    expect(folded.rows).toHaveLength(MAX_ROWS + 1 - 500);
    expect(folded.rows[0]).toBe(rows[500]);
    expect(folded.rows[folded.rows.length - 1]).toBe(extra);
    expect(folded.archived.rows).toBe(500);
    expect(folded.archived.until).toBe(rows[499].at);
    expect(summarize(folded)).toEqual(expected);
    expect(expected.requests).toBeGreaterThan(300);
    expect(expected.accepted.chars).toBeGreaterThan(0);
    expect(expected.undone.count).toBeGreaterThan(0);
    // By first appearance in an accepted or undone row: rows 1, 2, 3, 5 (c0), 9 (c4), then the new one
    expect(expected.byChapter.map(chapter => chapter.chapterId)).toEqual(['c1', 'c2', 'c3', 'c0', 'c4', 'c9']);

    // The input was not touched
    expect(full.rows).toHaveLength(MAX_ROWS);
    expect(full.archived).toBeNull();

    // Folding again adds to the archive instead of replacing it
    let again = folded;
    const later = [];
    for (let i = 0; i < 500; i += 1) {
      const row = i % 2 === 0
        ? request({ chapterId: 'c1' }, at(9, 0, 26))
        : decision({ chapterId: 'c1', chapterTitle: 'Luku 1', decision: 'accept_undone', charsAdded: 3 }, at(9, 0, 26));
      later.push(row);
      again = appendRow(again, row, START);
    }
    expect(again.archived.rows).toBe(1000);
    expect(again.rows).toHaveLength(MAX_ROWS + 1 - 500);
    expect(summarize(again)).toEqual(summarize({ ...full, rows: [...rows, extra, ...later] }));
  });
});

describe('summarize', () => {
  test('summarize counts accepted characters per chapter and per source and subtracts undone acceptances', () => {
    const log = build([
      request({ requests: 1 }),
      request({ runId: 'run-1' }),
      request({ runId: 'run-1' }),
      decision({ chapterId: 'c2', chapterTitle: 'Toinen luku', charsAdded: 100, count: 3, scope: 'group' }),
      decision({ chapterId: 'c1', chapterTitle: 'Ensimmäinen luku', charsAdded: 40 }),
      decision({ chapterId: 'c1', chapterTitle: 'Ensimmäinen luku', source: 'editor', charsAdded: 25, count: 2, scope: 'group', model: null, provider: null }),
      decision({ chapterId: 'c1', chapterTitle: 'Ensimmäinen luku', source: 'external-ai', charsAdded: 7 }),
      decision({ chapterId: 'c1', decision: 'rejected', count: 4, scope: 'group' }),
      decision({ chapterId: 'c1', chapterTitle: 'Ensimmäinen luku', decision: 'accept_undone', charsAdded: 40 }),
      decision({ chapterId: 'c1', chapterTitle: 'Ensimmäinen luku (uusi nimi)', charsAdded: 15 })
    ]);

    expect(summarize(log)).toEqual({
      startedAt: START,
      requests: 3,
      accepted: { count: 7, chars: 147 },
      rejected: { count: 4 },
      undone: { count: 1, chars: 40 },
      bySource: { faust: 4, editor: 2, 'external-ai': 1 },
      byChapter: [
        { chapterId: 'c2', chapterTitle: 'Toinen luku', chars: 100, faust: 100, editor: 0, 'external-ai': 0 },
        { chapterId: 'c1', chapterTitle: 'Ensimmäinen luku (uusi nimi)', chars: 47, faust: 15, editor: 25, 'external-ai': 7 }
      ]
    });
  });

  test('summarize never goes below zero', () => {
    // The acceptance was made before the log began: only its undo is in the log
    const log = build([
      decision({ chapterId: 'c1', decision: 'accept_undone', charsAdded: 500, count: 3, scope: 'group' }),
      decision({ chapterId: 'c1', source: 'editor', charsAdded: 20, count: 1 }),
      decision({ chapterId: 'c2', decision: 'accept_undone', charsAdded: 10 })
    ]);
    const summary = summarize(log);

    // The count is the sum of the clamped sources: it describes the same acceptances as the characters
    expect(summary.accepted).toEqual({ count: 1, chars: 20 });
    expect(summary.bySource).toEqual({ faust: 0, editor: 1, 'external-ai': 0 });
    expect(summary.byChapter).toEqual([
      { chapterId: 'c1', chapterTitle: 'Ensimmäinen luku', chars: 20, faust: 0, editor: 20, 'external-ai': 0 }
    ]);
    expect(summary.undone).toEqual({ count: 4, chars: 510 });
  });

  test('summarize of a missing or empty log is all zeros', () => {
    for (const log of [undefined, null, createLog(START)]) {
      expect(summarize(log)).toMatchObject({
        requests: 0,
        accepted: { count: 0, chars: 0 },
        rejected: { count: 0 },
        undone: { count: 0, chars: 0 },
        bySource: { faust: 0, editor: 0, 'external-ai': 0 },
        byChapter: []
      });
    }
    expect(summarize(createLog(START)).startedAt).toBe(START);
  });

  test('a chapter whose only acceptance was undone is not listed, a deletion-only acceptance is', () => {
    const undone = build([
      decision({ chapterId: 'c1', charsAdded: 30 }),
      decision({ chapterId: 'c1', decision: 'accept_undone', charsAdded: 30 })
    ]);
    expect(summarize(undone).byChapter).toEqual([]);
    expect(summarize(undone).accepted).toEqual({ count: 0, chars: 0 });

    const deletion = build([decision({ chapterId: 'c1', charsAdded: 0, charsRemoved: 14 })]);
    expect(summarize(deletion).byChapter).toEqual([
      { chapterId: 'c1', chapterTitle: 'Ensimmäinen luku', chars: 0, faust: 0, editor: 0, 'external-ai': 0 }
    ]);
    expect(summarize(deletion).accepted).toEqual({ count: 1, chars: 0 });
  });
});

describe('exportText', () => {
  const now = new Date(2026, 10, 20, 14, 30);

  test('exportText: the fourth line is `Loki on ollut käytössä 16.11.2026 alkaen. Sitä aiempi tekoälyn käyttö ei näy tässä lokissa.`', () => {
    for (const log of [createLog(START), build([request(), decision()])]) {
      const lines = exportText(log, { projectTitle: 'Sateen kirja', now }).split('\n');
      expect(lines[0]).toBe('Tekoälyn käyttöloki');
      expect(lines[1]).toBe('Projekti: Sateen kirja');
      expect(lines[2]).toBe('Viety: 20.11.2026 klo 14.30');
      expect(lines[3]).toBe('Loki on ollut käytössä 16.11.2026 alkaen. Sitä aiempi tekoälyn käyttö ei näy tässä lokissa.');
      expect(lines[4]).toBe('');
    }
  });

  test('exportText prints the whole layout', () => {
    const log = build([
      request({ runId: 'run-1', tokensIn: 1200, tokensOut: 300, window: 4000 }, at(19, 2)),
      request({ runId: 'run-1', tokensIn: 800, tokensOut: 100, window: 4000 }, at(19, 3)),
      decision({ before: 'meni', after: 'lähti', charsAdded: 5, charsRemoved: 4, requestLogId: 'log-x' }, at(19, 4)),
      decision({ scope: 'group', count: 3, charsAdded: 40, charsRemoved: 12, snapshotId: 'snapshot-17', chapterId: 'c2', chapterTitle: 'Toinen luku' }, at(19, 5)),
      request({ action: 'proofread', actionLabel: '', instruction: '', outcome: 'no_suggestion', reason: 'missing_tag', tokensIn: null, tokensOut: null, window: undefined }, at(19, 6)),
      request({ action: '', actionLabel: '', instruction: '', outcome: 'cancelled', stopReason: 'cancelled', tokensIn: 10, tokensOut: null, window: undefined }, at(19, 7)),
      request({ actionLabel: 'Koepyyntö', instruction: '', outcome: 'error', reason: 'unreachable', stopReason: 'error', tokensIn: null, tokensOut: null, model: 'claude-test-model' }, at(19, 8)),
      decision({ decision: 'rejected', source: 'editor', action: 'paste-edits', actionLabel: 'Liitä muokkauksina', model: null, provider: null, scope: 'group', count: 2, charsAdded: 9, charsRemoved: 3 }, at(19, 9)),
      decision({ decision: 'accept_undone', before: 'meni', after: 'lähti', charsAdded: 5, charsRemoved: 4 }, at(19, 10))
    ]);

    const text = exportText(log, { projectTitle: 'Sateen kirja', now, chapterTitles: { c1: 'Ensimmäinen luku', c2: 'Toinen luku' } });

    expect(text).toBe([
      'Tekoälyn käyttöloki',
      'Projekti: Sateen kirja',
      'Viety: 20.11.2026 klo 14.30',
      'Loki on ollut käytössä 16.11.2026 alkaen. Sitä aiempi tekoälyn käyttö ei näy tässä lokissa.',
      '',
      'Yhteenveto',
      'Pyyntöjä tekoälylle: 5',
      'Hyväksyttyjä ehdotuksia: 3 (40 merkkiä)',
      'Hylättyjä ehdotuksia: 2',
      'Kumottuja hyväksyntöjä: 1',
      '',
      'Hyväksytyt merkit luvuittain',
      'Toinen luku: 40 merkkiä (FAUSTin pyyntö 40, kustannustoimittaja 0, tekoäly muualla 0)',
      '',
      'Tapahtumat',
      '16.11.2026 klo 19.03 · Pyyntö · Tiivistä · malli glm-5.3-flash · valmis · 2000 → 400 tokenia · konteksti 30 % · 2 pyyntöä',
      '    ohje: ”Tiivistä tämä kappale.”',
      '16.11.2026 klo 19.04 · Hyväksytty · Ensimmäinen luku · FAUSTin pyyntö · Tiivistä · malli glm-5.3-flash · 1 ehdotus · +5 / −4 merkkiä',
      '    ennen: ”meni”',
      '    jälkeen: ”lähti”',
      '16.11.2026 klo 19.05 · Hyväksytty · Toinen luku · FAUSTin pyyntö · Tiivistä · malli glm-5.3-flash · 3 ehdotusta · +40 / −12 merkkiä · tilannekuva snapshot-17',
      '16.11.2026 klo 19.06 · Pyyntö · proofread · malli glm-5.3-flash · ei ehdotusta (missing_tag)',
      '16.11.2026 klo 19.07 · Pyyntö · tekoälypyyntö · malli glm-5.3-flash · pysäytetty',
      '16.11.2026 klo 19.08 · Pyyntö · Koepyyntö · malli claude-test-model · virhe (unreachable)',
      '16.11.2026 klo 19.09 · Hylätty · Ensimmäinen luku · kustannustoimittaja · Liitä muokkauksina · 2 ehdotusta · +9 / −3 merkkiä',
      '16.11.2026 klo 19.10 · Hyväksyntä kumottu · Ensimmäinen luku · FAUSTin pyyntö · Tiivistä · malli glm-5.3-flash · 1 ehdotus · +5 / −4 merkkiä',
      '    ennen: ”meni”',
      '    jälkeen: ”lähti”',
      ''
    ].join('\n'));

    // The minus sign is U+2212, not a hyphen
    expect(text).toContain('/ \u22124 merkkiä');
    expect(text).not.toContain('/ -4');
  });

  test('exportText prints a request line with tokens and context percentage, and without them when they are null', () => {
    const withNumbers = exportText(build([request({ tokensIn: 12345, tokensOut: 678, window: 32000 })]), { now });
    expect(withNumbers).toContain(' · valmis · 12345 → 678 tokenia · konteksti 39 %\n');

    const without = exportText(build([request({ tokensIn: null, tokensOut: null })]), { now });
    expect(without).toContain('16.11.2026 klo 19.02 · Pyyntö · Tiivistä · malli glm-5.3-flash · valmis\n');
    expect(without).not.toContain('tokenia');
    expect(without).not.toContain('konteksti');

    // One number alone is not printed as a pair, but the share of the window is
    const half = exportText(build([request({ tokensIn: 3200, tokensOut: null, window: 32000 })]), { now });
    expect(half).not.toContain('tokenia');
    expect(half).toContain(' · valmis · konteksti 10 %\n');

    // One request is not counted aloud, and an empty instruction has no line
    expect(withNumbers).not.toContain('pyyntöä');
    expect(exportText(build([request({ instruction: '' })]), { now })).not.toContain('ohje:');
  });

  test('exportText prints the three sources as `FAUSTin pyyntö`, `kustannustoimittaja`, `tekoäly muualla`', () => {
    const log = build([
      decision({ source: 'faust', charsAdded: 10 }, at(19, 3)),
      decision({ source: 'editor', model: null, provider: null, action: 'paste-edits', actionLabel: 'Liitä muokkauksina', charsAdded: 20 }, at(19, 4)),
      decision({ source: 'external-ai', model: null, provider: null, action: 'paste-edits', actionLabel: 'Liitä muokkauksina', charsAdded: 30 }, at(19, 5))
    ]);
    const text = exportText(log, { now });

    expect(text).toContain('Ensimmäinen luku: 60 merkkiä (FAUSTin pyyntö 10, kustannustoimittaja 20, tekoäly muualla 30)\n');
    expect(text).toContain('klo 19.03 · Hyväksytty · Ensimmäinen luku · FAUSTin pyyntö · Tiivistä · malli glm-5.3-flash · 1 ehdotus');
    expect(text).toContain('klo 19.04 · Hyväksytty · Ensimmäinen luku · kustannustoimittaja · Liitä muokkauksina · 1 ehdotus');
    expect(text).toContain('klo 19.05 · Hyväksytty · Ensimmäinen luku · tekoäly muualla · Liitä muokkauksina · 1 ehdotus');
  });

  test('exportText leaves the action part out of a decision line when there is neither a label nor an id', () => {
    const text = exportText(build([decision({ action: '', actionLabel: '', model: null, source: 'editor' })]), { now });
    expect(text).toContain('klo 19.03 · Hyväksytty · Ensimmäinen luku · kustannustoimittaja · 1 ehdotus · +12 / −20 merkkiä\n');
  });

  test('exportText prints before and after texts unchanged: `”Hän meni Åboon – eikä palannut.”`, a dialogue dash, `[TODO: …]` and `<u>…</u>`', () => {
    const before = '”Hän meni Åboon – eikä palannut.” [TODO: tarkista vuosi] <u>tärkeä</u>';
    const after = '– Hän meni Åboon – eikä palannut, äiti sanoi. [TODO: tarkista vuosi] <u>tärkeä</u>';
    const instruction = 'Muuta vuorosanaksi – älä koske ”sitaatteihin”';
    const log = build([
      request({ instruction }),
      decision({ before, after, instruction })
    ]);

    const text = exportText(log, { now });

    expect(text).toContain(`    ohje: ”${instruction}”\n`);
    expect(text).toContain(`    ennen: ”${before}”\n`);
    expect(text).toContain(`    jälkeen: ”${after}”\n`);
  });

  test('exportText leaves the before and after lines out when either is missing', () => {
    const group = exportText(build([decision({ scope: 'group', count: 5 })]), { now });
    expect(group).not.toContain('ennen:');
    expect(group).not.toContain('jälkeen:');

    const onlyAfter = exportText(build([decision({ before: undefined, after: 'lisäys' })]), { now });
    expect(onlyAfter).not.toContain('ennen:');
    expect(onlyAfter).not.toContain('jälkeen:');
  });

  test('exportText uses the current chapter title, then the stored one, then `(poistettu luku)`', () => {
    const log = build([
      decision({ chapterId: 'c1', chapterTitle: 'Vanha nimi', charsAdded: 10 }, at(19, 3)),
      decision({ chapterId: 'c2', chapterTitle: 'Tallennettu nimi', charsAdded: 20 }, at(19, 4)),
      decision({ chapterId: 'c3', chapterTitle: '', charsAdded: 30 }, at(19, 5))
    ]);
    const text = exportText(log, { now, chapterTitles: { c1: 'Nykyinen nimi' } });

    expect(text).toContain('Nykyinen nimi: 10 merkkiä');
    expect(text).toContain('Tallennettu nimi: 20 merkkiä');
    expect(text).toContain('(poistettu luku): 30 merkkiä');
    expect(text).toContain('klo 19.03 · Hyväksytty · Nykyinen nimi · ');
    expect(text).toContain('klo 19.04 · Hyväksytty · Tallennettu nimi · ');
    expect(text).toContain('klo 19.05 · Hyväksytty · (poistettu luku) · ');
    expect(text).not.toContain('Vanha nimi');
  });

  test('exportText on an empty log says `Lokissa ei ole vielä tapahtumia.` and `Ei hyväksyttyjä ehdotuksia.`', () => {
    const text = exportText(createLog(START), { projectTitle: 'Tyhjä', now });
    expect(text).toBe([
      'Tekoälyn käyttöloki',
      'Projekti: Tyhjä',
      'Viety: 20.11.2026 klo 14.30',
      'Loki on ollut käytössä 16.11.2026 alkaen. Sitä aiempi tekoälyn käyttö ei näy tässä lokissa.',
      '',
      'Yhteenveto',
      'Pyyntöjä tekoälylle: 0',
      'Hyväksyttyjä ehdotuksia: 0 (0 merkkiä)',
      'Hylättyjä ehdotuksia: 0',
      'Kumottuja hyväksyntöjä: 0',
      '',
      'Hyväksytyt merkit luvuittain',
      'Ei hyväksyttyjä ehdotuksia.',
      '',
      'Tapahtumat',
      'Lokissa ei ole vielä tapahtumia.',
      ''
    ].join('\n'));

    // A log with requests only has events but nothing accepted
    const requestsOnly = exportText(build([request()]), { now });
    expect(requestsOnly).toContain('Ei hyväksyttyjä ehdotuksia.\n');
    expect(requestsOnly).not.toContain('Lokissa ei ole vielä tapahtumia.');
  });

  test('exportText mentions the archive line when rows were folded', () => {
    let log = createLog(START);
    for (let i = 0; i < MAX_ROWS + 1; i += 1) {
      log = appendRow(log, decision({ charsAdded: 1 }, at(10, 0, 1 + Math.floor(i / 500))), START);
    }
    expect(log.archived.rows).toBe(500);

    const lines = exportText(log, { now }).split('\n');
    const events = lines.indexOf('Tapahtumat');
    expect(lines[events + 1]).toBe('Vanhemmat tapahtumat (500 kpl, 1.11.2026 asti) on tiivistetty yhteenvetoon.');
    expect(lines[events + 2]).toContain(' · Hyväksytty · ');
    // The totals still cover every row
    expect(lines).toContain(`Hyväksyttyjä ehdotuksia: ${MAX_ROWS + 1} (${MAX_ROWS + 1} merkkiä)`);

    expect(exportText(build([decision()]), { now })).not.toContain('Vanhemmat tapahtumat');
  });

  test('a redo row is printed as Hyväksytty (tehty uudelleen) and counted as accepted', () => {
    const log = build([
      decision({ charsAdded: 12 }, at(19, 3)),
      decision({ decision: 'accept_undone', charsAdded: 12 }, at(19, 4)),
      decision({ decision: 'accepted', redo: true, charsAdded: 12 }, at(19, 5))
    ]);

    const text = exportText(log, { now });
    expect(text).toContain('16.11.2026 klo 19.03 · Hyväksytty · Ensimmäinen luku');
    expect(text).toContain('16.11.2026 klo 19.04 · Hyväksyntä kumottu · Ensimmäinen luku');
    expect(text).toContain('16.11.2026 klo 19.05 · Hyväksytty (tehty uudelleen) · Ensimmäinen luku');

    const summary = summarize(log);
    expect(summary.accepted).toEqual({ count: 1, chars: 12 });
    expect(summary.undone).toEqual({ count: 1, chars: 12 });
    expect(summary.bySource.faust).toBe(1);
    expect(text).toContain('Hyväksyttyjä ehdotuksia: 1 (12 merkkiä)\n');

    // redo belongs to an acceptance only
    expect(exportText(build([decision({ decision: 'rejected', redo: true })]), { now })).toContain(' · Hylätty · ');
  });

  test('exportText prints numbers as plain digits and model names without the provider id', () => {
    const text = exportText(build([
      request({ tokensIn: 1234567, tokensOut: 20000, window: undefined }),
      decision({ charsAdded: 12345, charsRemoved: 6789, count: 1000, scope: 'group' })
    ]), { now });

    expect(text).toContain('1234567 → 20000 tokenia');
    expect(text).toContain('1000 ehdotusta · +12345 / −6789 merkkiä');
    expect(text).toContain('Hyväksyttyjä ehdotuksia: 1000 (12345 merkkiä)');
    expect(text).not.toContain('\u00a0');
    expect(text).toContain('malli glm-5.3-flash');
    expect(text).not.toContain('c91fb219');
  });

  test('exportText ends with exactly one line break', () => {
    for (const log of [createLog(START), build([request()]), build([request(), decision()]), undefined]) {
      const text = exportText(log, { now });
      expect(text.endsWith('\n')).toBe(true);
      expect(text.endsWith('\n\n')).toBe(false);
      expect(text).not.toContain('\r');
    }
    // Options may be left out altogether
    expect(exportText(createLog(START)).endsWith('tapahtumia.\n')).toBe(true);
  });
});

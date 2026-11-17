/**
 * @jest-environment node
 */
const {
  STATUSES, STATUS_LABELS, STATUS_HINTS, FINDINGS,
  createFinding, normalizeFindings, statusesFor,
  reanchorOne, reanchorAll,
  mergeRun, shiftRanges, applyStatus, removeByCheck, storable, capStored,
  filterForList, countByStatus, highlightItems,
  runRecord, normalizeRuns, describeRun, textFingerprint, modelStats, feedbackGroups
} = require('../../src/services/review/findings');

// Stand-in for locateQuote of another task (src/editor/locateQuote.js): exact,
// then with spaces, quotation marks, dashes and case folded, then the
// beginning of the quote
function locateQuote(text, quote, options = {}) {
  const fold = (source) => {
    let folded = '';
    const starts = [];
    for (let i = 0; i < source.length; i++) {
      let ch = source[i];
      if ('"“”„«»'.includes(ch)) ch = '"';
      else if ('-‐–—'.includes(ch)) ch = '-';
      else if (/\s/.test(ch)) ch = ' ';
      else ch = ch.toLowerCase();
      folded += ch;
      starts.push(i);
    }
    return { folded, starts };
  };
  const nearest = (found) => found.reduce(
    (best, at) => (Number.isFinite(options.near) && Math.abs(at - options.near) < Math.abs(best - options.near) ? at : best),
    found[0]
  );
  const all = (hay, needle) => {
    const found = [];
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) found.push(at);
    return found;
  };
  if (!quote) return null;

  const exact = all(text, quote);
  if (exact.length > 0) {
    const at = nearest(exact);
    return { from: at, to: at + quote.length, method: 'exact', count: exact.length, coverage: 1 };
  }
  const hay = fold(text);
  const needle = fold(quote).folded;
  const normalized = all(hay.folded, needle);
  if (normalized.length > 0) {
    const at = nearest(normalized);
    return { from: at, to: at + needle.length, method: 'normalized', count: normalized.length, coverage: 1 };
  }
  const head = needle.split(' ').slice(0, 3).join(' ');
  const prefix = head.length >= 12 ? all(hay.folded, head) : [];
  if (prefix.length > 0) return { from: prefix[0], to: prefix[0] + head.length, method: 'prefix', count: prefix.length, coverage: head.length / needle.length };
  return null;
}

const deps = { locateQuote };

const T0 = '2026-11-16T17:00:00.000Z';
const T1 = '2026-11-16T18:00:00.000Z';
const T2 = '2026-11-16T19:02:00.000Z';

// Every start of a word in a text
function occurrences(text, needle) {
  const found = [];
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) found.push(at);
  return found;
}

let counter = 0;
// A stored finding for a passage of a text
function findingAt(text, quote, extra = {}) {
  const from = extra.at !== undefined ? extra.at : text.indexOf(quote);
  const rest = { ...extra };
  delete rest.at;
  counter += 1;
  return {
    id: `f-${counter}`,
    checkId: 'filler',
    checkLabel: 'Täytesanat',
    kind: 'model',
    quote,
    from,
    to: from + quote.length,
    located: true,
    approx: false,
    before: text.slice(Math.max(0, from - 32), from),
    after: text.slice(from + quote.length, from + quote.length + 32),
    note: 'Täytesana.',
    suggestion: null,
    ref: null,
    data: null,
    status: 'open',
    statusAt: null,
    createdAt: T0,
    runId: 'run-1',
    model: 'deepseek-test',
    logId: 'log-1',
    ...rest
  };
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

describe('shape', () => {
  const draft = {
    quote: 'Hän vain katsoi.',
    modelQuote: null,
    from: 6,
    to: 22,
    located: true,
    approx: false,
    before: 'Alku. ',
    after: ' Loppu.',
    note: 'Vain on täytesana.',
    suggestion: 'Hän katsoi.',
    ref: null,
    severity: null
  };

  test('createFinding copies the draft and stamps check, run and model', () => {
    const finding = createFinding(draft, {
      checkId: 'filler', checkLabel: 'Täytesanat', kind: 'model', runId: 'run-1', model: 'deepseek-test', logId: 'log-7', now: T0, id: 'f-abc-1'
    });

    expect(finding).toEqual({
      id: 'f-abc-1',
      checkId: 'filler',
      checkLabel: 'Täytesanat',
      kind: 'model',
      quote: 'Hän vain katsoi.',
      from: 6,
      to: 22,
      located: true,
      approx: false,
      before: 'Alku. ',
      after: ' Loppu.',
      note: 'Vain on täytesana.',
      suggestion: 'Hän katsoi.',
      ref: null,
      data: null,
      status: 'open',
      statusAt: null,
      createdAt: T0,
      runId: 'run-1',
      model: 'deepseek-test',
      logId: 'log-7'
    });

    // Another status is stamped with the time it was given
    expect(createFinding(draft, { checkId: 'filler', kind: 'model', now: T1, id: 'x', status: 'disagree' })).toMatchObject({ status: 'disagree', statusAt: T1, createdAt: T1 });

    // A continuity draft keeps its reference; an approximate one the model's own wording
    const ref = { kind: 'codex', id: 'liisa', label: 'Liisa Koskela', quote: 'Siniset silmät.', located: true };
    const continuity = createFinding({ ...draft, ref, approx: true, modelQuote: 'Antti vain katsoi.' }, { checkId: 'continuity', checkLabel: 'Jatkuvuus', kind: 'continuity', now: T0, id: 'c-1' });
    expect(continuity).toMatchObject({ kind: 'continuity', ref, approx: true, modelQuote: 'Antti vain katsoi.' });
    expect(finding).not.toHaveProperty('modelQuote');

    // A draft without a place
    const lost = createFinding({ ...draft, from: null, to: null, located: false, before: '', after: '' }, { checkId: 'filler', kind: 'model', now: T0, id: 'l-1' });
    expect(lost).toMatchObject({ from: null, to: null, located: false, approx: false, quote: 'Hän vain katsoi.', unanchored: true });
    expect(createFinding(draft, { checkId: 'filler', kind: 'model', now: T0, id: 'p-1' })).not.toHaveProperty('unanchored');

    // A local draft brings its own id and data; without any id one is made as f-<time>-<counter>
    const local = createFinding({ ...draft, id: 'avoid-words@6', suggestion: null, data: { term: 'vain' } }, { checkId: 'avoid-words', checkLabel: 'Vältettävät sanat', kind: 'local', now: T0 });
    expect(local).toMatchObject({ id: 'avoid-words@6', kind: 'local', data: { term: 'vain' }, runId: null, model: null, logId: null });
    const first = createFinding(draft, { checkId: 'filler', kind: 'model' });
    const second = createFinding(draft, { checkId: 'filler', kind: 'model' });
    expect(first.id).toMatch(/^f-[0-9a-z]+-\d+$/);
    expect(second.id).not.toBe(first.id);
    expect(Number.isNaN(Date.parse(first.createdAt))).toBe(false);
  });

  test('a reading-feedback finding stores its severity in data and has no suggestion', () => {
    const meta = { checkId: 'reading-feedback', checkLabel: 'Lukupalaute', kind: 'model', now: T0, feedback: true };
    const works = createFinding({ ...draft, severity: 'works', suggestion: null }, { ...meta, id: 'w-1' });
    expect(works).toMatchObject({ checkId: 'reading-feedback', data: { severity: 'works' }, suggestion: null, status: 'open' });

    // No EHDOTUS is asked; one that came anyway is not kept
    const high = createFinding({ ...draft, severity: 'high', suggestion: 'Kirjoita kohtaus uudelleen.' }, { ...meta, id: 'h-1' });
    expect(high.data).toEqual({ severity: 'high' });
    expect(high.suggestion).toBeNull();

    // A severity word that could not be read is stored as such: the finding is a concern without a word
    expect(createFinding({ ...draft, severity: null }, { ...meta, id: 'n-1' }).data).toEqual({ severity: null });
    expect(createFinding({ ...draft, severity: undefined }, { ...meta, id: 'n-2' }).data).toEqual({ severity: null });

    // Other checks store no severity, whatever the draft carries
    expect(createFinding({ ...draft, severity: 'high' }, { checkId: 'filler', kind: 'model', now: T0, id: 'o-1' }).data).toBeNull();
    // It survives the file
    expect(normalizeFindings(JSON.parse(JSON.stringify([works, high])))).toEqual([works, high]);
  });

  test('normalizeFindings drops malformed entries, repairs ranges and keeps unknown fields', () => {
    expect(normalizeFindings(undefined)).toEqual([]);
    expect(normalizeFindings({ id: 'a' })).toEqual([]);

    const good = findingAt('Hän vain katsoi.', 'vain');
    const result = normalizeFindings([
      good,
      null,
      'teksti',
      { checkId: 'filler', quote: 'ei tunnistetta' },
      { id: 'x1', quote: 'ei tarkistusta' },
      { id: 42, checkId: 'filler' },
      { ...good, quote: 'sama tunniste uudelleen' },
      { id: 'bare', checkId: 'cliche' },
      { id: 'range-1', checkId: 'filler', quote: 'q', from: 9, to: 4, located: true, approx: true },
      { id: 'range-2', checkId: 'filler', quote: 'q', from: 3, to: null },
      { id: 'range-3', checkId: 'filler', quote: 'q', from: 2.5, to: 4 },
      { id: 'odd', checkId: 'filler', kind: 'robot', status: 'maybe', suggestion: '', ref: 'Luku 2', data: 'x', extra: { kept: true }, severityNote: 'säilyy' }
    ]);

    expect(result.map(finding => finding.id)).toEqual([good.id, 'bare', 'range-1', 'range-2', 'range-3', 'odd']);
    expect(result[0]).toEqual(good);
    expect(result[1]).toEqual({
      id: 'bare', checkId: 'cliche', checkLabel: '', kind: 'model', quote: '', from: null, to: null, located: false, approx: false,
      before: '', after: '', note: '', suggestion: null, ref: null, data: null, status: 'open', statusAt: null, createdAt: '',
      runId: null, model: null, logId: null
    });
    // A range is kept only when both ends are integers and in order; located follows it
    for (const repaired of result.slice(2, 5)) {
      expect(repaired).toMatchObject({ from: null, to: null, located: false, approx: false });
    }
    expect(result[5]).toMatchObject({ kind: 'model', status: 'open', suggestion: null, ref: null, data: null, extra: { kept: true }, severityNote: 'säilyy' });

    // A reference is repaired field by field
    const [withRef] = normalizeFindings([{ id: 'r', checkId: 'continuity', ref: { kind: 'wiki', id: 7, label: 'Luku 2', located: 'yes' } }]);
    expect(withRef.ref).toEqual({ kind: null, id: null, label: 'Luku 2', quote: '', located: false });
  });

  test('statusesFor offers Virheellinen only for model and continuity findings', () => {
    expect(statusesFor({ kind: 'model' })).toEqual(['open', 'done', 'disagree', 'invalid']);
    expect(statusesFor({ kind: 'continuity' })).toEqual(['open', 'done', 'disagree', 'invalid']);
    expect(statusesFor({ kind: 'local' })).toEqual(['open', 'done', 'disagree']);

    expect(STATUSES).toEqual(['open', 'done', 'disagree', 'invalid']);
    expect(STATUS_LABELS).toEqual({ open: 'Avoin', done: 'Tehty', disagree: 'Eri mieltä', invalid: 'Virheellinen' });
    expect(STATUS_HINTS).toEqual({
      open: 'Ei vielä käsitelty.',
      done: 'Korjasin kohdan.',
      disagree: 'Kohta on tarkoituksella näin. Sitä ei näytetä uudelleen.',
      invalid: 'Malli oli väärässä: havainto ei pidä paikkaansa.'
    });
    expect(FINDINGS).toEqual({ CONTEXT_CHARS: 32, MIN_CONTEXT_MATCH: 6, MAX_STORED: 400 });
    // The lists handed out are copies
    statusesFor({ kind: 'local' }).push('invalid');
    expect(statusesFor({ kind: 'local' })).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Re-anchoring
// ---------------------------------------------------------------------------

describe('re-anchoring', () => {
  const TEXT = 'Aamu oli harmaa. Hän vain katsoi merta. Sitten hän vain nauroi ääneen. Lopuksi hän vain lähti kotiin.';
  const second = TEXT.indexOf('vain nauroi');

  test('reanchorOne keeps a finding whose text is still at its place', () => {
    const finding = findingAt(TEXT, 'Hän vain katsoi merta.');
    expect(reanchorOne(TEXT, finding, deps)).toBe(finding);

    // Also when the same words stand elsewhere and the text around has changed: the place is trusted first
    const repeated = findingAt(TEXT, 'vain', { at: second });
    const edited = TEXT.replace('nauroi ääneen', 'itki hiljaa');
    expect(reanchorOne(edited, repeated, deps)).toBe(repeated);
  });

  test('reanchorOne follows a passage that moved', () => {
    const finding = findingAt(TEXT, 'Hän vain katsoi merta.', { status: 'disagree', statusAt: T1 });
    const moved = `Uusi alku tuli tähän. ${TEXT}`;
    const next = reanchorOne(moved, finding, deps);

    expect(next).not.toBe(finding);
    expect(next).toMatchObject({ from: finding.from + 22, to: finding.to + 22, located: true, quote: finding.quote, status: 'disagree', statusAt: T1 });
    expect(moved.slice(next.from, next.to)).toBe('Hän vain katsoi merta.');
    // The context is that of the new place
    expect(next.before).toBe(moved.slice(next.from - 32, next.from));
    expect(next.after).toBe(moved.slice(next.to, next.to + 32));
    // The finding handed in is not touched
    expect(finding.from).toBe(TEXT.indexOf('Hän vain'));
  });

  test('reanchorOne picks the occurrence with the same context when the quote repeats (vain ×3)', () => {
    const finding = findingAt(TEXT, 'vain', { at: second });
    expect(finding.before.endsWith('Sitten hän ')).toBe(true);

    const moved = `Uusi alku. ${TEXT}`;
    const next = reanchorOne(moved, finding, deps);
    expect(next.from).toBe(moved.indexOf('vain nauroi'));
    expect(moved.slice(next.from, next.to + 7)).toBe('vain nauroi');

    // Text removed from the start: the nearest "vain" to the old place is another one, the context still decides
    const cut = TEXT.slice(TEXT.indexOf('Sitten'));
    expect(reanchorOne(cut, finding, deps).from).toBe(cut.indexOf('vain nauroi'));

    // The same context twice: the occurrence nearest to the old place
    const twin = 'Sitten hän vain nauroi. Väli. Sitten hän vain nauroi.';
    const twinFinding = findingAt(twin, 'vain', { at: twin.lastIndexOf('vain'), before: 'Sitten hän ', after: ' nauroi.' });
    const shifted = `X ${twin}`;
    expect(reanchorOne(shifted, twinFinding, deps).from).toBe(shifted.lastIndexOf('vain'));
  });

  test('reanchorOne does not guess between repeated quotes when the context is gone', () => {
    const finding = findingAt(TEXT, 'vain', { at: second, status: 'disagree', statusAt: T1 });
    // Both sides of the passage were rewritten, and the text before it grew. No "vain" has
    // six characters of the stored context around it any more.
    const rewritten = 'Uusi alku. Liisa vain katsoi merta. Myöhemmin Antti vain hymyili hieman. Lopuksi äiti vain lähti kotiin.';
    const next = reanchorOne(rewritten, finding, deps);

    expect(next).toMatchObject({ from: null, to: null, located: false, status: 'disagree', quote: 'vain' });
    // The stored context stays, so the finding is found again if the passage comes back
    expect(next.before).toBe(finding.before);
    expect(reanchorOne(`Lisäys. ${TEXT}`, next, deps)).toMatchObject({ located: true, from: second + 8 });

    // With one occurrence left there is nothing to guess
    const single = 'Aivan muuta tekstiä, jossa hän vain istuu.';
    expect(reanchorOne(single, finding, deps)).toMatchObject({ located: true, from: single.indexOf('vain') });
    // Six characters are enough, and they may be as ordinary as " hän " and a space
    const ordinary = 'Uusi alku. Liisa vain katsoi merta. Myöhemmin Antti vain hymyili. Lopuksi hän vain lähti kotiin.';
    expect(reanchorOne(ordinary, finding, deps)).toMatchObject({ located: true, from: ordinary.lastIndexOf('vain') });
    // A finding stored without context is placed by the nearest occurrence
    const bare = { ...finding, before: '', after: '' };
    expect(reanchorOne(rewritten, bare, deps)).toMatchObject({ located: true, from: rewritten.indexOf('vain', 40) });
  });

  test('reanchorOne follows a passage whose quotation marks changed from " to ” and updates the quote', () => {
    const before = 'Hän sanoi: "Tule jo" - ja lähti. Loppu.';
    const finding = findingAt(before, 'sanoi: "Tule jo" - ja lähti.');
    const after = 'Uusi alku. Hän sanoi: ”Tule jo” – ja lähti. Loppu.';

    const next = reanchorOne(after, finding, deps);
    expect(next).toMatchObject({ located: true, quote: 'sanoi: ”Tule jo” – ja lähti.', from: after.indexOf('sanoi') });
    expect(after.slice(next.from, next.to)).toBe(next.quote);
    expect(next.before).toBe('Uusi alku. Hän ');
    // From here on the new wording is the anchor
    expect(reanchorOne(after, next, deps)).toBe(next);
  });

  test('reanchorOne marks a rewritten passage as not located and keeps status and note', () => {
    const finding = findingAt(TEXT, 'Sitten hän vain nauroi ääneen.', { status: 'done', statusAt: T1, note: 'Täytesana ja toisto.', suggestion: 'Sitten hän nauroi.' });
    const rewritten = TEXT.replace('Sitten hän vain nauroi ääneen.', 'Sitten hän vain purskahti itkuun.');
    const next = reanchorOne(rewritten, finding, deps);

    // The beginning still matches, but a rewritten passage is not the passage
    expect(locateQuote(rewritten, finding.quote).method).toBe('prefix');
    expect(next).toMatchObject({
      from: null, to: null, located: false, status: 'done', statusAt: T1, note: 'Täytesana ja toisto.', suggestion: 'Sitten hän nauroi.', quote: finding.quote
    });
    // Already without a place and still not found: the same object
    expect(reanchorOne(rewritten, next, deps)).toBe(next);
    // An empty quote has no place
    expect(reanchorOne(TEXT, { ...finding, quote: '' }, deps)).toMatchObject({ located: false, from: null });
  });

  test('a finding that never had a place is not searched for', () => {
    // The model's quote was not in its batch. The same words elsewhere in the chapter are another passage.
    const lost = createFinding({ quote: 'Lopuksi hän vain lähti kotiin.', from: null, to: null, located: false, before: '', after: '', note: 'Täytesana.' }, { checkId: 'filler', kind: 'model', now: T0, id: 'l-2' });
    expect(reanchorOne(TEXT, lost, deps)).toBe(lost);
    expect(reanchorAll(TEXT, [lost], deps)).toMatchObject({ changed: false, located: new Set() });
  });

  test('a finding whose quote is the whole chapter is placed again after an edit is undone', () => {
    const whole = 'Hän vain katsoi.';
    const finding = findingAt(whole, whole);
    expect([finding.before, finding.after]).toEqual(['', '']);

    const lost = reanchorOne('Hän vain katsoi!', finding, deps);
    expect(lost).toMatchObject({ located: false, from: null });
    expect(reanchorOne(whole, lost, deps)).toMatchObject({ located: true, from: 0, to: whole.length });
  });

  test('reanchorAll uses the running shift and returns the same array when nothing moved', () => {
    const findings = [
      findingAt(TEXT, 'vain', { at: TEXT.lastIndexOf('vain') }),
      findingAt(TEXT, 'Aamu oli harmaa.'),
      findingAt(TEXT, 'vain', { at: second }),
      findingAt(TEXT, 'vain', { at: TEXT.indexOf('vain') })
    ];
    const same = reanchorAll(TEXT, findings, deps);
    expect(same.findings).toBe(findings);
    expect(same.changed).toBe(false);
    expect(same.located).toEqual(new Set(findings.map(finding => finding.id)));

    // Text typed in front of everything moves every finding by the same amount. The three
    // "vain" findings are told apart without a search, in whatever order they are stored.
    const moved = `Lisätty virke. ${TEXT}`;
    const calls = jest.fn(locateQuote);
    const result = reanchorAll(moved, findings, { locateQuote: calls });
    expect(result.changed).toBe(true);
    expect(result.findings).not.toBe(findings);
    expect(result.findings.map(finding => finding.id)).toEqual(findings.map(finding => finding.id));
    expect(result.findings.map(finding => finding.from)).toEqual(findings.map(finding => finding.from + 15));
    expect(calls).not.toHaveBeenCalled();

    // An edit in the middle: what stands before it is the same object, what stands after it moves
    const middle = TEXT.replace('Sitten hän', 'Sitten taas hän');
    const partly = reanchorAll(middle, findings, deps);
    expect(partly.findings[1]).toBe(findings[1]);
    expect(partly.findings[3]).toBe(findings[3]);
    expect(partly.findings[2].from).toBe(second + 5);
    expect(partly.findings[0].from).toBe(TEXT.lastIndexOf('vain') + 5);

    // One passage deleted: the others keep their places and the set of located ids says which is gone
    const deleted = TEXT.replace(' Sitten hän vain nauroi ääneen.', '');
    const gone = reanchorAll(deleted, [findingAt(TEXT, 'Sitten hän vain nauroi ääneen.', { id: 'gone' }), findingAt(TEXT, 'Lopuksi hän vain lähti kotiin.', { id: 'kept' })], deps);
    expect(gone.located).toEqual(new Set(['kept']));
    expect(gone.findings.map(finding => finding.located)).toEqual([false, true]);
    expect(reanchorAll(TEXT, [], deps)).toMatchObject({ findings: [], changed: false });
  });

  test('reanchorAll tells identical sentences apart by the running shift alone', () => {
    // Every vain has the same 32 characters around it, and the nearest one
    // to the old offset is the wrong one: only the shift can place them.
    const text = `Aamu. ${'Hän vain katsoi. '.repeat(6)}`.trimEnd();
    const vains = occurrences(text, 'vain');
    const findings = [
      findingAt(text, 'Aamu.'),
      findingAt(text, 'vain', { at: vains[3] }),
      findingAt(text, 'vain', { at: vains[4] })
    ];
    const typed = 'Ilta tuli. ';
    const result = reanchorAll(typed + text, findings, deps);
    expect(result.findings.map(finding => finding.from)).toEqual(findings.map(finding => finding.from + typed.length));
  });
});

// ---------------------------------------------------------------------------
// A new run
// ---------------------------------------------------------------------------

describe('a new run', () => {
  const TEXT = 'Aamu oli jotenkin harmaa. Hän vain katsoi merta. Aika tuntui pysähtyvän. Lopuksi hän vain lähti kotiin.';
  const incoming = (quote, extra = {}) => findingAt(TEXT, quote, { runId: 'run-2', createdAt: T2, ...extra });

  test('mergeRun replaces the open findings of the same check and keeps other checks', () => {
    const oldOpen = findingAt(TEXT, 'jotenkin');
    const oldLost = { ...findingAt(TEXT, 'vain'), from: null, to: null, located: false };
    const cliche = findingAt(TEXT, 'Aika tuntui pysähtyvän.', { checkId: 'cliche', checkLabel: 'Kliseet' });
    const fresh = [incoming('Hän vain katsoi merta.'), incoming('Lopuksi hän vain lähti kotiin.')];

    const merged = mergeRun([oldOpen, cliche, oldLost], fresh, { checkId: 'filler', ranges: null });
    // A whole-chapter run replaces every open finding of its check, located or not
    expect(merged.findings).toEqual([cliche, ...fresh]);
    expect(merged.replaced).toBe(2);
    expect(merged.suppressed).toBe(0);
  });

  test('mergeRun keeps Tehty, Eri mieltä and Virheellinen', () => {
    const done = findingAt(TEXT, 'jotenkin', { status: 'done', statusAt: T1 });
    const disagree = findingAt(TEXT, 'Aika tuntui pysähtyvän.', { status: 'disagree', statusAt: T1 });
    const invalid = { ...findingAt(TEXT, 'vain'), from: null, to: null, located: false, status: 'invalid', statusAt: T1 };
    const open = findingAt(TEXT, 'Lopuksi hän vain lähti kotiin.');
    const fresh = [incoming('Hän vain katsoi merta.')];

    const merged = mergeRun([done, open, disagree, invalid], fresh, { checkId: 'filler', ranges: null });
    expect(merged.findings).toEqual([done, disagree, invalid, ...fresh]);
    expect(merged.replaced).toBe(1);
  });

  test('mergeRun does not report a passage again that is marked Eri mieltä', () => {
    const disagree = findingAt(TEXT, 'Hän vain katsoi merta.', { status: 'disagree', statusAt: T1 });
    const invalid = findingAt(TEXT, 'jotenkin', { status: 'invalid', statusAt: T1 });
    const fresh = [
      // The same sentence again, a part of it, and the word marked wrong inside a longer quote
      incoming('Hän vain katsoi merta.'),
      incoming('vain', { at: TEXT.indexOf('vain') }),
      incoming('Aamu oli jotenkin harmaa.'),
      incoming('Lopuksi hän vain lähti kotiin.')
    ];

    const merged = mergeRun([disagree, invalid], fresh, { checkId: 'filler', ranges: null });
    expect(merged.findings).toEqual([disagree, invalid, fresh[3]]);
    expect(merged.suppressed).toBe(3);

    // Another check's decision does not silence this check, and a decision without a place silences nothing
    const other = { ...disagree, checkId: 'cliche' };
    expect(mergeRun([other], [fresh[0]], { checkId: 'filler', ranges: null }).suppressed).toBe(0);
    const lost = { ...disagree, from: null, to: null, located: false };
    expect(mergeRun([lost], [fresh[0]], { checkId: 'filler', ranges: null }).findings).toEqual([lost, fresh[0]]);
    // A finding without a place is never dropped as a repeat
    const unplaced = { ...fresh[0], from: null, to: null, located: false };
    expect(mergeRun([disagree], [unplaced], { checkId: 'filler', ranges: null }).suppressed).toBe(0);
  });

  test('mergeRun with ranges replaces only open findings inside them', () => {
    const first = findingAt(TEXT, 'jotenkin');
    const last = findingAt(TEXT, 'Lopuksi hän vain lähti kotiin.');
    const lost = { ...findingAt(TEXT, 'vain'), from: null, to: null, located: false };
    const selection = [{ from: 0, to: TEXT.indexOf('Hän vain') }];
    const fresh = [incoming('Aamu oli jotenkin harmaa.')];

    const merged = mergeRun([first, last, lost], fresh, { checkId: 'filler', ranges: selection });
    // The finding outside the selection and the one without a place were not covered by this run
    expect(merged.findings).toEqual([last, lost, ...fresh]);
    expect(merged.replaced).toBe(1);

    // A range that only touches a finding's edge does not cover it
    const touching = [{ from: first.to, to: first.to + 10 }];
    expect(mergeRun([first], [], { checkId: 'filler', ranges: touching }).findings).toEqual([first]);
    // No ranges at all: nothing was read, nothing is replaced
    expect(mergeRun([first, last], fresh, { checkId: 'filler', ranges: [] })).toMatchObject({ replaced: 0, findings: [first, last, ...fresh] });
  });

  test('mergeRun after a partial run keeps the open findings of the part that failed', () => {
    const inFirst = findingAt(TEXT, 'jotenkin');
    const inSecond = findingAt(TEXT, 'Aika tuntui pysähtyvän.');
    const inThird = findingAt(TEXT, 'Lopuksi hän vain lähti kotiin.');
    // The middle batch failed: only the first and the last part were read
    const covered = [
      { from: 0, to: TEXT.indexOf(' Aika') },
      { from: TEXT.indexOf('Lopuksi'), to: TEXT.length }
    ];
    const fresh = [incoming('Hän vain katsoi merta.')];

    const merged = mergeRun([inFirst, inSecond, inThird], fresh, { checkId: 'filler', ranges: covered });
    expect(merged.findings).toEqual([inSecond, ...fresh]);
    expect(merged.replaced).toBe(2);
  });

  test('mergeRun keeps two continuity findings on one passage with different sources', () => {
    const liisa = { kind: 'codex', id: 'liisa', label: 'Liisa Koskela', quote: 'Siniset silmät.', located: true };
    const luku2 = { kind: 'summary', id: 'c2', label: 'Luku 2: Matka', quote: 'Antti lopetti.', located: true };
    const base = { checkId: 'continuity', checkLabel: 'Jatkuvuus', kind: 'continuity' };
    const decided = findingAt(TEXT, 'Hän vain katsoi merta.', { ...base, ref: liisa, status: 'invalid', statusAt: T1 });
    const fresh = [
      incoming('Hän vain katsoi merta.', { ...base, ref: liisa }),
      incoming('Hän vain katsoi merta.', { ...base, ref: luku2 })
    ];

    const merged = mergeRun([decided], fresh, { checkId: 'continuity', ranges: null });
    // Only the finding against the source that was marked wrong is left out
    expect(merged.findings).toEqual([decided, fresh[1]]);
    expect(merged.suppressed).toBe(1);
    // Without a decision both come in
    expect(mergeRun([], fresh, { checkId: 'continuity', ranges: null }).findings).toEqual(fresh);
  });

  test('shiftRanges moves ranges after an insertion and leaves ranges before it alone', () => {
    const oldText = 'Alku tässä. Keskikohta tässä. Loppu tässä.';
    const ranges = [{ from: 0, to: 11 }, { from: 12, to: 29 }, { from: 30, to: 42 }];

    expect(shiftRanges(ranges, oldText, oldText)).toBe(ranges);

    const inserted = oldText.replace('Keskikohta', 'Uusi sana. Keskikohta');
    expect(shiftRanges(ranges, oldText, inserted)).toEqual([{ from: 0, to: 11 }, { from: 12, to: 40 }, { from: 41, to: 53 }]);
    // Each moved range still holds its own text
    const moved = shiftRanges([{ from: 30, to: 42 }], oldText, inserted)[0];
    expect(inserted.slice(moved.from, moved.to)).toBe('Loppu tässä.');

    // A deletion pulls later ranges back; a range inside the deleted text is dropped
    const deleted = oldText.replace(' Keskikohta tässä.', '');
    expect(shiftRanges(ranges, oldText, deleted)).toEqual([{ from: 0, to: 11 }, { from: 12, to: 24 }]);
    // A range that reaches into a rewritten region ends at the region's new end
    const rewritten = oldText.replace('Keskikohta tässä', 'Jotain muuta');
    expect(shiftRanges([{ from: 0, to: 20 }], oldText, rewritten)).toEqual([{ from: 0, to: 24 }]);
    expect(rewritten.slice(0, 24)).toBe('Alku tässä. Jotain muuta');
    expect(shiftRanges([], oldText, inserted)).toEqual([]);
  });

  test('applyStatus sets the status and the time and refuses Virheellinen for a local finding', () => {
    const model = findingAt(TEXT, 'jotenkin');
    const local = findingAt(TEXT, 'vain', { kind: 'local', checkId: 'avoid-words', status: 'done', statusAt: T0 });
    const list = [model, local];

    const next = applyStatus(list, model.id, 'invalid', T2);
    expect(next).not.toBe(list);
    expect(next[0]).toEqual({ ...model, status: 'invalid', statusAt: T2 });
    expect(next[0]).not.toBe(model);
    expect(next[1]).toBe(local);
    expect(model.status).toBe('open');

    // Back to open: the time of the change is stored as well
    expect(applyStatus(next, model.id, 'open', T2)[0]).toMatchObject({ status: 'open', statusAt: T2 });
    expect(applyStatus(list, local.id, 'disagree', T2)[1]).toMatchObject({ status: 'disagree', statusAt: T2 });

    // Nothing to change: the input array
    expect(applyStatus(list, local.id, 'invalid', T2)).toBe(list);
    expect(applyStatus(list, 'missing', 'done', T2)).toBe(list);
    expect(applyStatus(list, model.id, 'ehkä', T2)).toBe(list);
    expect(applyStatus(list, model.id, 'open', T2)).toBe(list);
  });

  test('storable leaves out open local findings and keeps decided ones', () => {
    const list = [
      findingAt(TEXT, 'jotenkin'),
      findingAt(TEXT, 'vain', { kind: 'local', checkId: 'avoid-words' }),
      findingAt(TEXT, 'vain', { kind: 'local', checkId: 'avoid-words', status: 'disagree', statusAt: T1 }),
      findingAt(TEXT, 'vain', { kind: 'local', checkId: 'avoid-words', status: 'done', statusAt: T1 }),
      findingAt(TEXT, 'Aika tuntui pysähtyvän.', { kind: 'continuity', checkId: 'continuity' })
    ];
    expect(storable(list)).toEqual([list[0], list[2], list[3], list[4]]);
    expect(storable(undefined)).toEqual([]);

    expect(removeByCheck(list, 'avoid-words')).toEqual([list[0], list[4]]);
    expect(removeByCheck(list, 'missing')).toEqual(list);
  });

  test('capStored drops the oldest Tehty first and never Avoin or Eri mieltä', () => {
    const at = (minute) => `2026-11-16T10:${String(minute).padStart(2, '0')}:00.000Z`;
    const make = (id, status, minute) => findingAt(TEXT, 'vain', { id, status, statusAt: status === 'open' ? null : at(minute), createdAt: at(0) });
    const list = [
      make('open-1', 'open', 0), make('done-new', 'done', 30), make('disagree-1', 'disagree', 1), make('invalid-old', 'invalid', 2),
      make('done-old', 'done', 5), make('invalid-new', 'invalid', 40), make('open-2', 'open', 0), make('done-mid', 'done', 10)
    ];
    const kept = (max) => capStored(list, max).map(finding => finding.id);

    expect(capStored(list, 8)).toBe(list);
    expect(kept(7)).toEqual(['open-1', 'done-new', 'disagree-1', 'invalid-old', 'invalid-new', 'open-2', 'done-mid']);
    expect(kept(6)).toEqual(['open-1', 'done-new', 'disagree-1', 'invalid-old', 'invalid-new', 'open-2']);
    // Every Tehty goes before the first Virheellinen
    expect(kept(5)).toEqual(['open-1', 'disagree-1', 'invalid-old', 'invalid-new', 'open-2']);
    expect(kept(4)).toEqual(['open-1', 'disagree-1', 'invalid-new', 'open-2']);
    // Avoin and Eri mieltä stay even when the list is then over the limit
    expect(kept(1)).toEqual(['open-1', 'disagree-1', 'open-2']);

    // The default limit is 400, and mergeRun applies it
    const many = Array.from({ length: 405 }, (_unused, index) => make(`d-${index}`, 'done', index % 60));
    expect(capStored(many)).toHaveLength(400);
    const merged = mergeRun(many, [make('new-open', 'open', 0)], { checkId: 'cliche', ranges: null });
    expect(merged.findings).toHaveLength(400);
    expect(merged.findings[399].id).toBe('new-open');
  });
});

// ---------------------------------------------------------------------------
// Lists and highlights
// ---------------------------------------------------------------------------

describe('lists and highlights', () => {
  const TEXT = 'Aamu oli jotenkin harmaa. Hän vain katsoi merta. Aika tuntui pysähtyvän. Lopuksi hän vain lähti kotiin.';
  const lost = (id, createdAt, extra = {}) => ({ ...findingAt(TEXT, 'kadonnut kohta', { id, createdAt, ...extra }), from: null, to: null, located: false });

  test('filterForList sorts by position and puts findings without a place last', () => {
    const list = [
      lost('lost-late', T2),
      findingAt(TEXT, 'Lopuksi hän vain lähti kotiin.', { id: 'last' }),
      findingAt(TEXT, 'jotenkin', { id: 'first', status: 'done', statusAt: T1 }),
      lost('lost-early', T0, { checkId: 'cliche' }),
      findingAt(TEXT, 'Hän vain katsoi merta.', { id: 'outer' }),
      findingAt(TEXT, 'Hän vain', { id: 'inner', checkId: 'cliche' }),
      findingAt(TEXT, 'Hän vain', { id: 'inner-newer', createdAt: T2 })
    ];
    const ids = (filter) => filterForList(list, filter).map(finding => finding.id);

    // By start, then by end, then by age; without a place by age
    expect(ids({ status: 'all', checkId: null })).toEqual(['first', 'inner', 'inner-newer', 'outer', 'last', 'lost-early', 'lost-late']);
    expect(ids({ status: 'open', checkId: null })).toEqual(['inner', 'inner-newer', 'outer', 'last', 'lost-early', 'lost-late']);
    expect(ids({ status: 'done', checkId: null })).toEqual(['first']);
    expect(ids({ status: 'invalid', checkId: null })).toEqual([]);
    expect(ids({ status: 'all', checkId: 'cliche' })).toEqual(['inner', 'lost-early']);
    expect(ids({ status: 'open', checkId: 'filler' })).toEqual(['inner-newer', 'outer', 'last', 'lost-late']);
    // No filter is every finding; the input is not reordered
    expect(ids()).toHaveLength(7);
    expect(list[0].id).toBe('lost-late');
    expect(filterForList(null, { status: 'all' })).toEqual([]);
  });

  test('countByStatus counts open findings without a place', () => {
    const list = [
      findingAt(TEXT, 'jotenkin'),
      lost('l1', T0),
      lost('l2', T0, { status: 'done', statusAt: T1 }),
      findingAt(TEXT, 'vain', { status: 'disagree', statusAt: T1 }),
      findingAt(TEXT, 'vain', { status: 'invalid', statusAt: T1 }),
      findingAt(TEXT, 'Aika tuntui pysähtyvän.')
    ];
    // A decided finding that lost its place is not counted as one that needs looking for
    expect(countByStatus(list)).toEqual({ open: 3, done: 1, disagree: 1, invalid: 1, all: 6, unlocated: 1 });
    expect(countByStatus([])).toEqual({ open: 0, done: 0, disagree: 0, invalid: 0, all: 0, unlocated: 0 });
    expect(countByStatus(undefined).all).toBe(0);
  });

  test('highlightItems returns only open, located findings, clamped to the document', () => {
    const list = [
      findingAt(TEXT, 'Lopuksi hän vain lähti kotiin.', { id: 'last' }),
      findingAt(TEXT, 'jotenkin', { id: 'done', status: 'done', statusAt: T1 }),
      lost('lost', T0),
      findingAt(TEXT, 'Hän vain katsoi merta.', { id: 'second' }),
      findingAt(TEXT, 'vain', { id: 'disagree', status: 'disagree', statusAt: T1 }),
      { ...findingAt(TEXT, 'Aamu', { id: 'empty' }), to: 0 }
    ];

    expect(highlightItems(list, TEXT.length)).toEqual([
      { id: 'second', from: TEXT.indexOf('Hän vain'), to: TEXT.indexOf('Hän vain') + 22 },
      { id: 'last', from: TEXT.indexOf('Lopuksi'), to: TEXT.length }
    ]);

    // A document shorter than the stored places: the last range is cut, one beyond the end is dropped
    const shorter = TEXT.indexOf('Lopuksi') + 5;
    expect(highlightItems(list, shorter)).toEqual([
      { id: 'second', from: TEXT.indexOf('Hän vain'), to: TEXT.indexOf('Hän vain') + 22 },
      { id: 'last', from: TEXT.indexOf('Lopuksi'), to: shorter }
    ]);
    expect(highlightItems(list, 30).map(item => item.id)).toEqual(['second']);
    expect(highlightItems(list, 10)).toEqual([]);
    expect(highlightItems(undefined, 10)).toEqual([]);
  });

  test('feedbackGroups puts what works first and sorts the concerns from suuri to pieni', () => {
    const feedback = (quote, severity, extra = {}) => findingAt(TEXT, quote, {
      checkId: 'reading-feedback', checkLabel: 'Lukupalaute', data: { severity }, id: `${severity}-${quote.slice(0, 6)}`, ...extra
    });
    // The order of the recorded answer that did not sort its concerns: works, works, low, medium, high, low
    const list = [
      feedback('Lopuksi hän vain lähti kotiin.', 'works'),
      feedback('Aamu oli jotenkin harmaa.', 'works'),
      feedback('Aika tuntui pysähtyvän.', 'low'),
      feedback('Hän vain katsoi merta.', 'medium'),
      feedback('jotenkin', 'high'),
      feedback('vain', 'low', { at: TEXT.indexOf('vain') }),
      feedback('harmaa', null),
      { ...feedback('merta', 'medium', { id: 'medium-lost' }), from: null, to: null, located: false },
      feedback('kotiin', 'valtava')
    ];

    const groups = feedbackGroups(list);
    // What works, in reading order
    expect(groups.works.map(finding => finding.quote)).toEqual(['Aamu oli jotenkin harmaa.', 'Lopuksi hän vain lähti kotiin.']);
    // Concerns: suuri, keskisuuri, pieni, then those without a readable word; by position inside each,
    // a finding without a place last in its group
    expect(groups.concerns.map(finding => [finding.data.severity, finding.quote])).toEqual([
      ['high', 'jotenkin'],
      ['medium', 'Hän vain katsoi merta.'],
      ['medium', 'merta'],
      ['low', 'vain'],
      ['low', 'Aika tuntui pysähtyvän.'],
      [null, 'harmaa'],
      ['valtava', 'kotiin']
    ]);
    // Every finding is in exactly one group, and nothing is computed from them: no score
    expect(groups.works.length + groups.concerns.length).toBe(list.length);
    expect(Object.keys(groups)).toEqual(['works', 'concerns']);

    // A finding without data is a concern without a word
    expect(feedbackGroups([findingAt(TEXT, 'vain')])).toMatchObject({ works: [], concerns: [{ quote: 'vain' }] });
    expect(feedbackGroups(undefined)).toEqual({ works: [], concerns: [] });
  });
});

// ---------------------------------------------------------------------------
// Run records
// ---------------------------------------------------------------------------

describe('run records', () => {
  const formatTime = (iso) => (iso === T2 ? '16.11.2026 klo 19.02' : `aika(${iso})`);
  const record = (extra = {}) => ({
    at: T2, model: 'deepseek-test', scope: 'chapter', outcome: 'ok', batches: 3, failedBatches: 0, found: 0, unlocated: 0,
    suppressed: 0, message: null, dropped: null, fingerprint: textFingerprint('teksti'), ...extra
  });
  const describe1 = (extra, options = {}) => describeRun(record(extra), { formatTime, ...options });
  const hasNoFindingsClaim = (lines) => lines.some(line => line.includes('Ei havaintoja'));

  test('textFingerprint changes when one character changes and is stable for ä, ö, å', () => {
    const text = 'Åke-setä sanoi: ”Älä!” – ja lähti öiseen metsään.';
    expect(textFingerprint(text)).toBe(textFingerprint(`${text}`));
    expect(textFingerprint(text)).toMatch(/^[0-9a-z]+-[0-9a-z]+$/);
    // The length in base 36, then the hash
    expect(textFingerprint(text).split('-')[0]).toBe(text.length.toString(36));

    expect(textFingerprint(text.replace('Älä', 'Ala'))).not.toBe(textFingerprint(text));
    expect(textFingerprint(text.replace('ö', 'o'))).not.toBe(textFingerprint(text));
    expect(textFingerprint(text.replace('”Älä!”', '"Älä!"'))).not.toBe(textFingerprint(text));
    expect(textFingerprint(`${text} `)).not.toBe(textFingerprint(text));
    // Two characters swapped: the same length, another hash
    expect(textFingerprint('ab')).not.toBe(textFingerprint('ba'));

    // djb2 over the UTF-16 units, unsigned 32 bits, start 5381
    expect(textFingerprint('')).toBe(`0-${(5381).toString(36)}`);
    expect(textFingerprint('a')).toBe(`1-${(((5381 * 33) ^ 97) >>> 0).toString(36)}`);
    const hash = (value) => {
      let h = 5381;
      for (let i = 0; i < value.length; i++) h = ((h * 33) ^ value.charCodeAt(i)) >>> 0;
      return h;
    };
    expect(textFingerprint(text)).toBe(`${text.length.toString(36)}-${hash(text).toString(36)}`);
    // Composed and decomposed ä are different texts: nothing is normalised
    expect(textFingerprint('ä')).not.toBe(textFingerprint('a\u0308'));
    expect(textFingerprint(null)).toBe(textFingerprint(''));
  });

  test('runRecord takes the counts from the run and the rest from the caller', () => {
    const result = {
      runId: 'run-1', checkId: 'filler', outcome: 'partial', batches: 3, done: 3,
      failed: [{ index: 1, reason: 'http_502', message: 'Yhdyskäytävä ei vastannut (502).' }],
      drafts: [{}, {}, {}, {}], covered: [], unlocated: 1, duplicates: 0, model: 'c91f:deepseek-test', logId: 'log-1',
      dropped: 'Ei mahtunut: tiivistelmät', message: 'Yhdyskäytävä ei vastannut (502).'
    };
    expect(runRecord(result, { at: T2, scope: 'selection', suppressed: 1, fingerprint: 'k-abc', model: 'deepseek-test' })).toEqual({
      at: T2,
      model: 'deepseek-test',
      scope: 'selection',
      outcome: 'partial',
      batches: 3,
      failedBatches: 1,
      // What reached the list: the drafts without the one that was left out
      found: 3,
      unlocated: 1,
      suppressed: 1,
      message: 'Yhdyskäytävä ei vastannut (502).',
      dropped: 'Ei mahtunut: tiivistelmät',
      fingerprint: 'k-abc'
    });

    // The caller's counts win when it gives them; without a display name the run's model id is kept
    expect(runRecord(result, { at: T2, scope: 'chapter', suppressed: 0, fingerprint: 'x', found: 2, unlocated: 0 }))
      .toMatchObject({ found: 2, unlocated: 0, scope: 'chapter', model: 'c91f:deepseek-test' });
    expect(runRecord({ outcome: 'blocked', message: 'Ei vertailtavaa.' }, { at: T2, fingerprint: 'x' }))
      .toMatchObject({ outcome: 'blocked', batches: 0, failedBatches: 0, found: 0, model: null, dropped: null, scope: 'chapter' });
  });

  test('normalizeRuns drops entries without a time and an outcome', () => {
    expect(normalizeRuns(null)).toEqual({});
    expect(normalizeRuns([record()])).toEqual({});
    const good = record();
    expect(normalizeRuns({
      filler: good,
      cliche: { outcome: 'ok' },
      dialogue: { at: T2 },
      continuity: { at: T2, outcome: 'ehkä' },
      broken: 'teksti',
      'custom:a': record({ outcome: 'failed' })
    })).toEqual({ filler: good, 'custom:a': record({ outcome: 'failed' }) });
  });

  test('describeRun: never run', () => {
    expect(describeRun(null, { formatTime })).toEqual({ kind: 'none', lines: ['Tätä tarkistusta ei ole vielä ajettu tässä luvussa.'] });
    expect(describeRun(undefined)).toEqual({ kind: 'none', lines: ['Tätä tarkistusta ei ole vielä ajettu tässä luvussa.'] });
    // Nothing was run, so nothing is stale
    expect(describeRun(null, { formatTime, stale: true }).lines).toHaveLength(1);
  });

  test('describeRun: ok with 0, 1 and 7 findings, with and without unlocated', () => {
    expect(describe1({ found: 0 })).toEqual({ kind: 'ok', lines: ['Tarkistettu 16.11.2026 klo 19.02. Ei havaintoja.'] });
    expect(describe1({ found: 1 })).toEqual({ kind: 'ok', lines: ['Tarkistettu 16.11.2026 klo 19.02. 1 havainto.'] });
    expect(describe1({ found: 7 })).toEqual({ kind: 'ok', lines: ['Tarkistettu 16.11.2026 klo 19.02. 7 havaintoa.'] });
    expect(describe1({ found: 7, unlocated: 2 })).toEqual({ kind: 'ok', lines: ['Tarkistettu 16.11.2026 klo 19.02. 7 havaintoa. 2 ilman sijaintia.'] });
    expect(describe1({ found: 1, unlocated: 1 }).lines).toEqual(['Tarkistettu 16.11.2026 klo 19.02. 1 havainto. 1 ilman sijaintia.']);

    // The lines that are added when they apply, in this order
    expect(describe1({ found: 3, suppressed: 1 }).lines).toEqual([
      'Tarkistettu 16.11.2026 klo 19.02. 3 havaintoa.',
      '1 aiemmin käsitelty havainto jätettiin pois.'
    ]);
    expect(describe1({ found: 0, suppressed: 4, dropped: 'Ei mahtunut: tiivistelmät (osa)' }, { stale: true }).lines).toEqual([
      'Tarkistettu 16.11.2026 klo 19.02. Ei havaintoja.',
      '4 aiemmin käsiteltyä havaintoa jätettiin pois.',
      'Osa taustatiedoista ei mahtunut mallin ikkunaan. Ei mahtunut: tiivistelmät (osa)',
      'Luku on muuttunut tarkistuksen jälkeen.'
    ]);
    // A reading feedback that was given in parts says so under its line
    const parts = 'Luku ei mahtunut yhteen pyyntöön. Palaute on annettu 3 osassa, eikä malli nähnyt lukua kokonaisena.';
    expect(describe1({ found: 5, message: parts }).lines).toEqual(['Tarkistettu 16.11.2026 klo 19.02. 5 havaintoa.', parts]);
    // Without a formatter the stored time is shown as it is
    expect(describeRun(record({ found: 1 })).lines).toEqual([`Tarkistettu ${T2}. 1 havainto.`]);
  });

  test('describeRun: partial names failed batches and never says Ei havaintoja', () => {
    const one = describe1({ outcome: 'partial', failedBatches: 1, found: 0, message: 'Yhdyskäytävä ei vastannut (502).' });
    expect(one).toEqual({
      kind: 'warn',
      lines: ['Tarkistus jäi kesken 16.11.2026 klo 19.02: 1 osa 3:stä epäonnistui. Havaintoja voi puuttua.', 'Yhdyskäytävä ei vastannut (502).']
    });
    const two = describe1({ outcome: 'partial', batches: 5, failedBatches: 2, found: 4 });
    expect(two.lines).toEqual(['Tarkistus jäi kesken 16.11.2026 klo 19.02: 2 osaa 5:stä epäonnistui. Havaintoja voi puuttua.']);
    expect(hasNoFindingsClaim(one.lines)).toBe(false);
    expect(hasNoFindingsClaim(two.lines)).toBe(false);

    // A stopped run
    const stopped = describe1({ outcome: 'stopped', found: 0, message: 'ei näytetä' });
    expect(stopped).toEqual({ kind: 'warn', lines: ['Tarkistus pysäytettiin 16.11.2026 klo 19.02. Havaintoja voi puuttua.'] });
    expect(hasNoFindingsClaim(stopped.lines)).toBe(false);
  });

  test('describeRun: failed shows the message and never says Ei havaintoja', () => {
    const failed = describe1({ outcome: 'failed', found: 0, failedBatches: 2, message: 'Mallin vastausta ei voitu tulkita. Se ei ollut pyydetyssä muodossa.' });
    expect(failed).toEqual({
      kind: 'error',
      lines: ['Tarkistus epäonnistui 16.11.2026 klo 19.02.', 'Mallin vastausta ei voitu tulkita. Se ei ollut pyydetyssä muodossa.']
    });
    expect(hasNoFindingsClaim(failed.lines)).toBe(false);
    expect(describe1({ outcome: 'failed', found: 0, message: null }).lines).toEqual(['Tarkistus epäonnistui 16.11.2026 klo 19.02.']);

    // A blocked run shows only its message
    const blocked = describe1({ outcome: 'blocked', found: 0, batches: 0, message: 'Ei vertailtavaa: Tarinakansiossa ei ole tähän tekstiin liittyviä merkintöjä eikä aiemmilla luvuilla ole tiivistelmiä.' });
    expect(blocked).toEqual({
      kind: 'error',
      lines: ['Ei vertailtavaa: Tarinakansiossa ei ole tähän tekstiin liittyviä merkintöjä eikä aiemmilla luvuilla ole tiivistelmiä.']
    });
    for (const outcome of ['partial', 'failed', 'stopped', 'blocked']) {
      expect(hasNoFindingsClaim(describe1({ outcome, found: 0, message: 'Virhe.' }, { stale: true }).lines)).toBe(false);
    }
  });

  test('describeRun: stale adds Luku on muuttunut tarkistuksen jälkeen.', () => {
    expect(describe1({ found: 2 }, { stale: true }).lines).toEqual([
      'Tarkistettu 16.11.2026 klo 19.02. 2 havaintoa.',
      'Luku on muuttunut tarkistuksen jälkeen.'
    ]);
    expect(describe1({ found: 2 }, { stale: false }).lines).toHaveLength(1);
    // After any outcome, always as the last line
    for (const outcome of ['partial', 'failed', 'stopped', 'blocked']) {
      const lines = describe1({ outcome, failedBatches: 1, message: 'Virhe.' }, { stale: true }).lines;
      expect(lines[lines.length - 1]).toBe('Luku on muuttunut tarkistuksen jälkeen.');
    }
  });

  test('modelStats counts findings and Virheellinen per model across chapters', () => {
    const f = (model, status, extra = {}) => findingAt('vain', 'vain', { model, status, ...extra });
    const chapters = [
      { id: 'c1', findings: [f('deepseek-test', 'open'), f('deepseek-test', 'invalid'), f('glm-test', 'invalid'), f(null, 'open', { kind: 'local', checkId: 'avoid-words', status: 'done' })] },
      { id: 'c2', findings: [f('deepseek-test', 'done'), f('glm-test', 'invalid', { kind: 'continuity' }), f('glm-test', 'disagree'), f('', 'invalid')] },
      {
        id: 'folder',
        findings: 'rikki',
        children: [{ id: 'c3', findings: [f('deepseek-test', 'invalid'), f('pieni-malli', 'open'), f('deepseek-test', 'open')] }]
      },
      null,
      { id: 'c4' }
    ];

    // Most findings first; local findings and findings without a model name are not counted
    expect(modelStats(chapters)).toEqual([
      { model: 'deepseek-test', total: 5, invalid: 2 },
      { model: 'glm-test', total: 3, invalid: 2 },
      { model: 'pieni-malli', total: 1, invalid: 0 }
    ]);
    expect(modelStats([])).toEqual([]);
    expect(modelStats(undefined)).toEqual([]);
  });
});

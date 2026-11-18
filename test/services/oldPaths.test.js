/**
 * @jest-environment node
 */
// What the old AI paths of app.js share (I-02 review): the failure reason, the sentences shown as
// they are (reconcile R-21) and the whole-book run without the chapters marked "Ei tekoälylle"
// (contracts.md rule 16).
const { failureReason, asIsNotice, bookRunPlan } = require('../../src/services/ai/oldPaths');

const WIRE = 'Kehotteessa on tekstiä luvusta ”Saapuminen”, joka on merkitty Ei tekoälylle (”Laiturilla ei ollut ketään, vain lumi, j…”). Mitään ei lähetetty.';

describe('failureReason', () => {
  test('leaves the full stop to the template and names a missing reason', () => {
    expect(failureReason(new Error('Yhteys katkesi.'))).toBe('Yhteys katkesi');
    expect(failureReason('Yhteys katkesi...')).toBe('Yhteys katkesi');
    expect(failureReason(null)).toBe('tuntematon virhe');
    expect(failureReason(new Error('Unknown error'))).toBe('tuntematon virhe');
  });
});

describe('asIsNotice (R-21)', () => {
  test('a stop, the switch and the wire guard are shown as they are, with their kinds', () => {
    expect(asIsNotice(new Error('Pyyntö pysäytettiin.'))).toEqual({ kind: 'info', text: 'Pyyntö pysäytettiin.' });
    expect(asIsNotice('Tekoäly pois -asetus on päällä.')).toEqual({ kind: 'warning', text: 'Tekoäly pois -asetus on päällä.' });
    expect(asIsNotice(new Error(WIRE))).toEqual({ kind: 'error', text: WIRE });
  });

  test('a sentence that went through failureReason gets its full stop back (Kirjoita luku uudelleen)', () => {
    // RefinementManager's caller used to throw failureReason(response.error): the stop then lost its full stop
    expect(asIsNotice(new Error(failureReason('Pyyntö pysäytettiin.')))).toEqual({ kind: 'info', text: 'Pyyntö pysäytettiin.' });
    expect(asIsNotice(new Error(failureReason('Tekoäly pois -asetus on päällä.')))).toEqual({ kind: 'warning', text: 'Tekoäly pois -asetus on päällä.' });
    expect(asIsNotice(new Error(failureReason(WIRE)))).toEqual({ kind: 'error', text: WIRE });
  });

  test('any other failure is not shown as it is', () => {
    expect(asIsNotice(new Error('Cherry Studioon ei saada yhteyttä.'))).toBeNull();
    expect(asIsNotice(new Error('Pyyntö pysäytettiin, koska jokin muu.'))).toBeNull();
    expect(asIsNotice(new Error(''))).toBeNull();
    expect(asIsNotice(null)).toBeNull();
  });
});

describe('bookRunPlan (Magnum Opus, all chapters)', () => {
  const chapter = (id, extra = {}) => ({
    id, title: `Luku ${id}`, content: `Teksti ${id}, jonka pituus on yli kaksikymmentä merkkiä.`, synopsis: `Tiivistelmä ${id}`, ...extra
  });

  test('without a protected chapter the whole book is one run and the project is lent as it is', () => {
    const project = { title: 'Kirja', structure: [chapter('a'), chapter('b'), chapter('c')] };
    const plan = bookRunPlan(project);
    expect(plan.runs).toEqual([{ startFrom: 0, stopAt: 3 }]);
    expect(plan.written).toBe(3);
    expect(plan.skipped).toEqual([]);
    expect(plan.lent).toBe(project);
  });

  test('a protected chapter is not written, keeps its place, and lends no text or summary to the others', () => {
    const own = chapter('b', { noAI: true, synopsisAI: 'Oma tiivistelmä', synopsisManual: 'Käsin' });
    const project = { title: 'Kirja', structure: [chapter('a'), own, chapter('c'), chapter('d'), chapter('e', { noAI: true })] };
    const plan = bookRunPlan(project);
    expect(plan.runs).toEqual([{ startFrom: 0, stopAt: 1 }, { startFrom: 2, stopAt: 4 }]);
    expect(plan.written).toBe(3);
    expect(plan.skipped).toEqual([{ id: 'b', title: 'Luku b' }, { id: 'e', title: 'Luku e' }]);

    // The run reads the book at its full length: a chapter's number and the chapters before it stay
    expect(plan.lent.structure.map(ch => ch.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(plan.lent.structure[1]).toMatchObject({ id: 'b', title: 'Luku b', noAI: true, content: '', synopsis: '', synopsisAI: '', synopsisManual: '' });
    expect(plan.lent.structure[2]).toBe(project.structure[2]);
    // The author's project is not changed
    expect(project.structure[1].content).toBe(own.content);
    expect(JSON.stringify(plan.lent)).not.toContain('Oma tiivistelmä');
  });

  test('a book whose chapters are all protected has nothing to write', () => {
    const plan = bookRunPlan({ structure: [chapter('a', { noAI: true })] });
    expect(plan.runs).toEqual([]);
    expect(plan.written).toBe(0);
    expect(bookRunPlan(null)).toMatchObject({ runs: [], written: 0, skipped: [] });
  });
});

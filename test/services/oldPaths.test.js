/**
 * @jest-environment node
 */
// What the old AI paths of app.js share (I-02 review): the failure reason, the sentences shown as
// they are (reconcile R-21), the whole-book run without the chapters marked "Ei tekoälylle"
// (contracts.md rule 16), and the guard that sends an old path's result back to the text it was
// made for (I-03 step 8, R-18, R-19; contracts.md 10.2, 11.2 C and rule 14).
const fs = require('fs');
const path = require('path');
const { failureReason, asIsNotice, bookRunPlan, sentTarget, placeSentText } = require('../../src/services/ai/oldPaths');

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

describe('the old-path guard (voice editing, Hybrid rewrite, Liminal Engine)', () => {
  const TEXT = 'Laiturilla ei ollut ketään. Kaupunki oli pienempi kuin hän muisti. Asema oli kylmä.';
  const SENT = 'Kaupunki oli pienempi kuin hän muisti.';
  const start = TEXT.indexOf(SENT);
  const selection = { text: SENT, start, end: start + SENT.length };
  const here = { chapterId: 'chapter-1', epoch: 3 };

  test('sentTarget keeps the chapter, the text, its offsets and the project epoch; no selection, no target', () => {
    expect(sentTarget('chapter-1', selection, 3)).toEqual({ chapterId: 'chapter-1', text: SENT, start, end: start + SENT.length, epoch: 3 });
    expect(sentTarget('chapter-1', null, 3)).toBeNull();
    expect(sentTarget('chapter-1', { text: '', start: 0, end: 0 }, 3)).toBeNull();
  });

  test('the result replaces exactly the text that was sent, also after an edit in front of it (C-L21 a)', () => {
    const target = sentTarget('chapter-1', selection, 3);
    expect(placeSentText(TEXT, target, here, 'UUSI.')).toBe(TEXT.replace(SENT, 'UUSI.'));
    const typedInFront = 'Ja niin. ' + TEXT;
    expect(placeSentText(typedInFront, target, here, 'UUSI.')).toBe(typedInFront.replace(SENT, 'UUSI.'));
  });

  test('a changed word inside the sent text, or the text twice, refuses (C-L21 b)', () => {
    const target = sentTarget('chapter-1', selection, 3);
    expect(placeSentText(TEXT.replace('pienempi', 'pieni'), target, here, 'UUSI.')).toBeNull();
    expect(placeSentText(SENT + ' ' + TEXT.replace('Laiturilla', 'Laiturilla taas'), target, here, 'UUSI.')).toBeNull();
  });

  test('a result never goes into another chapter or into a project opened after it was asked for (rule 14)', () => {
    const target = sentTarget('chapter-1', selection, 3);
    // B is a copy of A: the same chapter id and the sentence at the same offsets
    expect(placeSentText(TEXT, target, { chapterId: 'chapter-1', epoch: 4 }, 'A:N EHDOTUS')).toBeNull();
    expect(placeSentText(TEXT, target, { chapterId: 'chapter-2', epoch: 3 }, 'UUSI.')).toBeNull();
    expect(placeSentText(TEXT, null, here, 'UUSI.')).toBeNull();
  });

  // app.js is one component that Jest cannot render: these read how it uses the two functions
  const app = fs.readFileSync(path.join(__dirname, '..', '..', 'app.js'), 'utf8');
  const body = (name) => {
    const from = app.indexOf(`const ${name} = `);
    expect(from).toBeGreaterThan(-1);
    const next = app.indexOf('\n  const ', from + 10);
    return app.slice(from, next === -1 ? undefined : next);
  };

  test('each target is stored together with the result it answers, never when the request is sent (I-03 review)', () => {
    const stores = app.match(/oldPathTargetRef\.current\.(voice|rewrite|liminal) = [^;]+;/g) || [];
    expect(stores).toEqual([
      'oldPathTargetRef.current.voice = target;',
      'oldPathTargetRef.current.rewrite = target;',
      'oldPathTargetRef.current.liminal = target;'
    ]);
    expect(body('handleVoiceEdit')).toMatch(/oldPathTargetRef\.current\.voice = target;\s*setVoiceDiffView\(diffResult\);/);
    expect(body('handleRewriteSection')).toMatch(/oldPathTargetRef\.current\.rewrite = target;\s*setContinuePreview\(result\.rewritten\);/);
    expect(body('sendAiAssistantMessage')).toMatch(/oldPathTargetRef\.current\.liminal = target;\s*setAiSuggestion\(\{/);
    // A new request with a selection takes the older result off the screen
    expect(body('handleVoiceEdit')).toMatch(/setVoiceDiffView\(null\);[\s\S]*sentTarget\(/);
    expect(body('sendAiAssistantMessage')).toMatch(/if \(target\) setAiSuggestion\(null\);/);
  });

  test('accepting goes through placeSentText with the open chapter and the project epoch', () => {
    expect(body('placeOldPathText')).toMatch(/placeSentText\(liveText, target, \{ chapterId: activeChapter\.id, epoch: projectEpochRef\.current \}, revised\)/);
    ['acceptVoiceEdit', 'acceptRewrite', 'applyAiSuggestion'].forEach(name => {
      expect(body(name)).toMatch(/placeOldPathText\(oldPathTargetRef\.current\.(voice|rewrite|liminal), /);
      expect(body(name)).not.toMatch(/textSelection\.(start|end|text)/);
    });
  });

  test('openProject leaves no old-path result or target behind (X-25)', () => {
    expect(body('openProject')).toMatch(/suggestionsRef\.current\.reset\(\);[\s\S]*oldPathTargetRef\.current = \{ voice: null, rewrite: null, liminal: null \};\s*setVoiceDiffView\(null\); setAiSuggestion\(null\); setContinuePreview\(''\);/);
  });
});

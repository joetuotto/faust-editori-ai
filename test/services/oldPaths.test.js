/**
 * @jest-environment node
 */
// What the old AI paths of app.js share (I-02 review): the failure reason, the sentences shown as
// they are (reconcile R-21), the whole-book run without the chapters marked "Ei tekoälylle"
// (contracts.md rule 16), and the guard that sends an old path's result back to the text it was
// made for (I-03 step 8, R-18, R-19; contracts.md 10.2, 11.2 C and rule 14). Final pass, package E:
// the answer language of the old prompts (T-096, menu spec D.7) and the summary next to the
// author's own with Tee tiivistelmä's line about the card (T-010).
const fs = require('fs');
const path = require('path');
const {
  failureReason, asIsNotice, bookRunPlan, sentTarget, placeSentText,
  answerLanguageRule, SUMMARY_NOTES, ownSummary, summaryFields, summaryNote
} = require('../../src/services/ai/oldPaths');

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

// app.js is one component that Jest cannot render: the blocks below read how it uses the functions
const APP = fs.readFileSync(path.join(__dirname, '..', '..', 'app.js'), 'utf8');
const appBody = (name) => {
  const from = APP.indexOf(`const ${name} = `);
  expect(from).toBeGreaterThan(-1);
  const next = APP.indexOf('\n  const ', from + 10);
  return APP.slice(from, next === -1 ? undefined : next);
};

describe('answerLanguageRule: the old prompts ask for free text in the project language (T-096, menu spec D.7)', () => {
  test('a JSON answer: free text in the language, the keys and the named fixed values as the format gives them', () => {
    expect(answerLanguageRule('fi', ['type', 'severity', 'readiness', 'speed'])).toBe(
      'Write every free-text value in Finnish, names as they are. Keep the JSON keys and the values of "type", "severity", "readiness" and "speed" exactly as given above, in English.'
    );
    expect(answerLanguageRule('fi', ['category'])).toBe(
      'Write every free-text value in Finnish, names as they are. Keep the JSON keys and the values of "category" exactly as given above, in English.'
    );
    expect(answerLanguageRule('fi', [])).toBe(
      'Write every free-text value in Finnish, names as they are. Keep the JSON keys exactly as given above, in English.'
    );
    expect(answerLanguageRule('fi', ['', null, 'stage'])).toMatch(/Keep the JSON keys and the values of "stage" exactly/);
  });

  test('a plain answer names only the language', () => {
    expect(answerLanguageRule('fi')).toBe('Write the answer in Finnish.');
    expect(answerLanguageRule('en')).toBe('Write the answer in English.');
  });

  test('the project language decides; an unset language is Finnish, an unknown code is named by its code', () => {
    expect(answerLanguageRule('en', [])).toMatch(/^Write every free-text value in English, /);
    [undefined, null, '', '  '].forEach(language => {
      expect(answerLanguageRule(language)).toBe('Write the answer in Finnish.');
    });
    expect(answerLanguageRule(' sv ')).toBe('Write the answer in the language whose code is "sv".');
  });

  test('every old prompt of app.js ends with the sentence, after its format', () => {
    // ☿ Analysoi luku: the fixed values the app maps (Tempo: hidas) and the other enums of its format
    const analysis = appBody('analyzeChapterContent');
    expect(analysis).toMatch(/Return ONLY valid JSON\.\n\$\{answerLanguageRule\(project\.language, \['type', 'severity', 'readiness', 'speed'\]\)\}`;/);
    ['"type": "pacing"', '"severity": "medium"', '"readiness": "draft|needs-revision|ready-for-review|final"', '"speed": "slow|medium|fast"']
      .forEach(field => expect(analysis).toContain(field));
    // ⚗ Pika-arvio and Suunnittele hahmot: free text only; the cast plan's type is copied from the input
    expect(appBody('quickQualityCheck')).toMatch(/\}\n\$\{answerLanguageRule\(project\.language, \[\]\)\}`;/);
    const cast = appBody('analyzeCast');
    expect(cast).toMatch(/\}\n\n\$\{answerLanguageRule\(project\.language, \[\]\)\}`;/);
    expect(cast).toContain('"type": "the character type exactly as written above"');
    // 🜍 Tee tiivistelmä: a plain answer in the project language, no fixed Finnish
    const summary = appBody('generateSynopsis');
    expect(summary).toMatch(/Return ONLY the summary, no extra text\. \$\{answerLanguageRule\(project\.language\)\}`;/);
    expect(summary).not.toContain('(in Finnish)');
    // Uusi hahmo: the questions and the profile
    const questions = appBody('generateCharacterQuestions');
    expect(questions).toMatch(/\}\n\n\$\{answerLanguageRule\(project\.language, \['category'\]\)\}`;/);
    expect(appBody('generateCharacterProfile')).toContain(
      'languageRule: answerLanguageRule(project.language, window.CharacterGenerator.FIXED_VALUES)'
    );
  });

  test('the old JSON paths leave room for reasoning and the Finnish answer: max_tokens 8 000 (T-062)', () => {
    // Analysoi luku had it (I-02); the cast plan and the questions get the same, the profile in CharacterGenerator.js
    expect(appBody('analyzeChapterContent')).toContain('await callAIWithMode(prompt, { temperature: 0.3, max_tokens: 8000 });');
    expect(appBody('analyzeCast')).toContain('await callAIWithMode(prompt, { max_tokens: 8000 });');
    expect(appBody('generateCharacterQuestions')).toContain('await callAIWithMode(prompt, { max_tokens: 8000 });');
  });

  test('the question categories the prompt lists are the ones the builder shows in Finnish', () => {
    const listed = appBody('generateCharacterQuestions').match(/"category": "([a-z|]+)"/);
    expect(listed).not.toBeNull();
    const map = APP.match(/const questionCategory = \{([^}]*)\}/);
    expect(map).not.toBeNull();
    const mapped = Array.from(map[1].matchAll(/(\w+):/g), m => m[1]);
    expect(listed[1].split('|')).toEqual(mapped);
  });
});

describe('the AI summary next to the author\'s own, and Tee tiivistelmä\'s line (T-010)', () => {
  const own = { id: 'a', synopsis: 'Oma tiivistelmä.', synopsisManual: 'Oma tiivistelmä.', synopsisAI: '' };
  const imported = { id: 'b', synopsis: 'Tuotu Scrivenerista.', synopsisManual: 'Tuotu Scrivenerista.' };
  const none = { id: 'c', synopsis: 'Edellinen tekoälyn tiivistelmä.', synopsisManual: '', synopsisAI: 'Edellinen tekoälyn tiivistelmä.' };

  test('the words: on the card, or only here when the author\'s own keeps its place there', () => {
    expect(SUMMARY_NOTES).toEqual({
      onCard: 'Se näkyy myös luvun kortissa korttinäkymässä.',
      ownKept: 'Luvun kortissa korttinäkymässä näkyy edelleen oma tiivistelmäsi, joten tämä näkyy vain tässä.'
    });
  });

  test('an own or imported summary stays on the card; the note says so', () => {
    [own, imported].forEach(chapter => {
      expect(summaryFields(chapter, 'Tekoälyn tiivistelmä.')).toEqual({ synopsisAI: 'Tekoälyn tiivistelmä.', synopsis: chapter.synopsisManual });
      expect(summaryNote(chapter)).toBe(SUMMARY_NOTES.ownKept);
    });
  });

  test('without one the AI summary goes on the card and the note says it is there too', () => {
    [none, { id: 'd' }, { id: 'e', synopsisManual: '   ' }, { id: 'f', synopsisManual: 5 }, null].forEach(chapter => {
      expect(ownSummary(chapter)).toBe('');
      expect(summaryFields(chapter, 'Tekoälyn tiivistelmä.')).toEqual({ synopsisAI: 'Tekoälyn tiivistelmä.', synopsis: 'Tekoälyn tiivistelmä.' });
      expect(summaryNote(chapter)).toBe(SUMMARY_NOTES.onCard);
    });
  });

  test('both writers use the fields, and the note travels from generateSynopsis to the notification and the popover', () => {
    expect(appBody('analyzeChapterContent')).toContain('...summaryFields(ch, analysis.synopsis),');
    const summary = appBody('generateSynopsis');
    expect(summary).toContain('{ ...ch, ...summaryFields(ch, synopsis) }');
    expect(summary).toMatch(/const live = \(projectRef\.current \|\| project\)\.structure\.find\(ch => ch\.id === chapterId\);/);
    expect(summary).toContain('return { synopsis, note: summaryNote(live) };');
    expect(appBody('runSummary')).toContain("showSigilResult({ kind: 'summary', chapterId, synopsis: result.synopsis, note: result.note });");
    expect(appBody('showSigilResult')).toContain("detail: result.synopsis + '\\n\\n' + result.note,");
    expect(APP).toContain("e('div', { className: 'faust-meta' }, sigilResult.note)");
    // The sentence has one home: the module
    expect(APP).not.toContain('Se näkyy myös luvun kortissa');
    expect(APP).not.toMatch(/synopsis: ch\.synopsisManual \|\|/);
  });
});

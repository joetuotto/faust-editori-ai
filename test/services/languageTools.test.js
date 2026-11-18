/** @jest-environment node */
// Stage I-06: the decisions of Kielen työkalut that need no React (src/services/language/languageTools.js).
// The text functions are P-01's real modules, so the batching is the one a run uses.

const {
  TEXT_DEPS, TYPOGRAPHY_META, VOIKKO_META, PROOFREAD_META, SET_ASIDE_REASONS, setAsideReason, runSummary,
  languageName, typographyView, excerptAround, proofPlan, batchNumberOf, notRunText,
  resumePlace, locatePassage, setAsideChanges, voikkoWordRows, voikkoChange
} = require('../../src/services/language/languageTools');
const { checkTypography } = require('../../src/editor/typography.fi');
const { runProofread, PROOFREAD_DEFAULTS } = require('../../src/services/ai/proofreadPass');
const { splitBlocks } = require('../../src/editor/blocks');
const { batchParagraphs } = require('../../src/services/ai/batchParagraphs');
const { maskSpans, unmaskSpans, placeholderInstruction } = require('../../src/services/ai/maskSpans');
const { wordDiff, changeRatio, applyChanges } = require('../../src/editor/wordDiff');
const { trimToSentence, splitSentences } = require('../../src/editor/sentences');

const deps = { splitBlocks, batchParagraphs, maskSpans, unmaskSpans, placeholderInstruction, wordDiff, changeRatio, trimToSentence, splitSentences };

describe('typography tab', () => {
  test('typographyView groups the listed findings by rule in the rules\' order and keeps the question apart', () => {
    const text = [
      'Hän sanoi "Hei" ja lähti kello 16:30.',
      '- Hei, sanoi Pekka.',
      'Vuosina 1939-1945 hinnat nousivat 11%.',
      'Hän odotti...'
    ].join('\n');
    const view = typographyView(checkTypography(text, { language: 'fi', lineStartDash: 'dialogue' }));
    const ids = view.groups.map(group => group.ruleId);
    expect(ids).toEqual(['suora-lainausmerkki', 'lukuvali-yhdysmerkki', 'prosentti-vali', 'kellonaika-kaksoispiste', 'kolme-pistetta']);
    expect(view.questions.map(q => q.ruleId)).toEqual(['rivin-alun-viiva']);
    // Two straight quotes, one range, one percent, the clock and the dots: the question is not counted
    expect(view.listed).toBe(6);
    expect(view.recommendations).toBe(2);
    expect(view.groups[0]).toMatchObject({ title: 'Suora lainausmerkki', level: 'normi' });
    expect(view.groups[0].findings).toHaveLength(2);
    expect(view.groups[0].url).toMatch(/^https:\/\/www\.kielitoimistonohjepankki\.fi\//);
    // With Luettelo nothing is asked
    expect(typographyView(checkTypography(text, { language: 'fi', lineStartDash: 'list' })).questions).toEqual([]);
  });

  test('excerptAround marks the range inside its line and cuts long lines with an ellipsis', () => {
    const text = 'Ensimmäinen rivi.\nHän sanoi "Hei" ja lähti.\nKolmas.';
    const from = text.indexOf('"');
    expect(excerptAround(text, from, from + 1)).toEqual({ before: 'Hän sanoi ', hit: '"', after: 'Hei" ja lähti.' });
    const long = 'a'.repeat(100) + 'X' + 'b'.repeat(100);
    const part = excerptAround(long, 100, 101, 10);
    expect(part).toEqual({ before: '…' + 'a'.repeat(10), hit: 'X', after: 'b'.repeat(10) + '…' });
    // An emoji at the cut is never split
    const emoji = 'x😀' + 'a'.repeat(9) + 'Y';
    expect(excerptAround(emoji, emoji.length - 1, emoji.length, 10).before).not.toMatch(/[\uDC00-\uDFFF]/u);
    expect(languageName('en')).toBe('englanti');
  });
});

describe('Kielenhuolto runs', () => {
  const paragraphs = Array.from({ length: 14 }, (_, i) => `Kappale ${i + 1} jossa on pilkku virhe ja toinen lause.`);
  const text = ['# Otsikko', ...paragraphs, '* * *', '- listan kohta'].join('\n');
  const options = { ...PROOFREAD_DEFAULTS, dashDialogue: true };
  const budget = { maxChars: 400, maxLines: 4 };

  test('proofPlan sends the lines and batches that runProofread sends', async () => {
    const plan = proofPlan(text, options, budget, deps);
    // Headings and scene breaks are not sent; a "- " line is, its marker stays local
    expect(plan.lines).toHaveLength(15);
    expect(plan.dashListLines).toBe(1);
    expect(plan.skipped.structural).toBe(2);

    // The run itself: one request per batch, each with the lines of the plan's batch
    const sent = [];
    const request = (opts) => {
      const lines = opts.original.split('\n');
      sent.push(lines.length);
      return { result: Promise.resolve({ ok: true, accepted: true, inner: opts.original, model: 'm' }), cancel() {} };
    };
    await runProofread({ text, options, budget, deps, request });
    expect(sent).toEqual(plan.batches.map(batch => batch.length));
    expect(plan.batches.length).toBeGreaterThan(2);
  });

  test('batchNumberOf and notRunText name the batches a stopped run left', () => {
    const plan = proofPlan(text, options, budget, deps);
    const third = plan.batches[2][0];
    expect(batchNumberOf(plan, third.index)).toBe(3);
    expect(batchNumberOf(plan, 999)).toBeNull();
    expect(notRunText(3, plan.batches.length)).toBe(`Erät 3–${plan.batches.length} jäivät ajamatta.`);
    expect(notRunText(4, 4)).toBe('Erä 4 jäi ajamatta.');
    expect(notRunText(0, 4)).toBe('');
  });

  test('resumePlace finds the resume line in the current text, falls back to the same line index and gives null past the end', () => {
    const before = 'Yksi.\nKaksi.\nKolme.';
    // A line typed above: the line is found by its text, at its new place
    const now = 'Uusi.\nYksi.\nKaksi.\nKolme.';
    expect(resumePlace(now, { index: 1, text: 'Kaksi.' })).toEqual({ from: 12, to: 18 });
    // The line itself was edited: the line with the same index
    expect(resumePlace('Yksi.\nKaksi muuttui.\nKolme.', { index: 1, text: 'Kaksi.' })).toEqual({ from: 6, to: 20 });
    // No such line any more
    expect(resumePlace('Yksi.', { index: 4, text: 'Viisi.' })).toBeNull();
    expect(resumePlace(before, null)).toBeNull();
  });

  test('locatePassage finds a passage at its offsets or the nearest occurrence', () => {
    const value = 'kello löi. kello löi. kello löi.';
    expect(locatePassage(value, 'kello', 11)).toEqual({ from: 11, to: 16 });
    expect(locatePassage(value, 'kello', 13)).toEqual({ from: 11, to: 16 });
    expect(locatePassage('Uusi alku. ' + value, 'kello', 0)).toEqual({ from: 11, to: 16 });
    expect(locatePassage(value, 'puuttuu', 0)).toBeNull();
    expect(locatePassage(value, '', 0)).toBeNull();
  });

  test('setAsideChanges proposes the line\'s word diff in the run\'s frame, with the dialogue flag', () => {
    const baseText = 'Otsikon alla.\n– Kyllä mä sen tierän, sanoi hän.\nIsoisän kello tikitti.\n- Hei sanoi Pekka';
    const narration = { key: 'L2', from: baseText.indexOf('Isoisän'), original: 'Isoisän kello tikitti.', revised: 'Isäisän kello tikitti.', reason: 'suspect' };
    narration.to = narration.from + narration.original.length;
    const run = { baseText, runId: 'r1', model: 'p:m', provider: 'cherry', dashDialogue: true };
    const changes = setAsideChanges(narration, run, deps);
    expect(changes).toHaveLength(1);
    expect(applyChanges(baseText, changes)).toBe(baseText.replace('Isoisän', 'Isäisän'));
    expect(changes[0].meta).toMatchObject({ source: 'faust', action: 'proofread', actionLabel: 'Kielenhuolto', runId: 'r1', model: 'p:m', provider: 'cherry', dialogue: false });
    expect(changes[0].meta.line).toEqual({ key: 'L2', original: narration.original, revised: narration.revised });

    // A dialogue line: no bulk accept may take it
    const spoken = { key: 'L1', from: baseText.indexOf('– Kyllä'), original: '– Kyllä mä sen tierän, sanoi hän.', revised: '– Kyllä mä sen tiedän, sanoi hän.' };
    expect(setAsideChanges(spoken, run, deps).every(change => change.meta.dialogue === true)).toBe(true);
    // A "- " list line is dialogue only with Vuorosanaviiva; its body starts after the marker
    const listed = { key: 'L3', from: baseText.indexOf('Hei sanoi'), original: 'Hei sanoi Pekka', revised: 'Hei, sanoi Pekka' };
    expect(setAsideChanges(listed, run, deps)[0].meta.dialogue).toBe(true);
    expect(setAsideChanges(listed, { ...run, dashDialogue: false }, deps)[0].meta.dialogue).toBe(false);
    // Nothing to propose
    expect(setAsideChanges({ ...narration, revised: null }, run, deps)).toEqual([]);
  });

  test('SET_ASIDE_REASONS has a sentence for every reason of a ProofreadResult', () => {
    for (const reason of ['rewritten', 'missing', 'duplicate', 'split', 'multiline', 'truncated', 'moved', 'protected', 'suspect']) {
      expect(typeof SET_ASIDE_REASONS[reason]).toBe('string');
    }
    expect(SET_ASIDE_REASONS.moved).toBe('Rivi muuttui ajon aikana');
    expect(SET_ASIDE_REASONS.protected).toBe('Muutos olisi koskenut muistutusta tai alleviivausta');
    expect(SET_ASIDE_REASONS.suspect).toBe('Malli vaihtoi tunnetun sanan tuntemattomaan');
  });

  test('a line the structure guard set aside names the structure, not a note, when its notes came back unchanged (I-06 review)', async () => {
    // The model put the full stop after a line-start day number: the line would become a numbered list
    const text = 'Alku.\n16 marraskuuta oli kylmä [TODO: tarkista päivä].\nHän sanoi että tulee <u>huomenna</u>.';
    const reply = (opts) => opts.original.split('\n').map((line) => line
      .replace('16 marraskuuta', '16. marraskuuta')
      .replace('sanoi että', 'sanoi, että')).join('\n');
    const request = (opts) => ({
      result: Promise.resolve({ ok: true, accepted: true, cancelled: false, inner: reply(opts), text: '', model: 'm', logMeta: {} }),
      cancel() {}
    });
    const result = await runProofread({ text, deps, meta: { chapterId: 'c' }, request, onBatch: () => ({ skipped: [] }) });
    const aside = result.setAside.find(entry => entry.original.startsWith('16 marraskuuta'));
    expect(aside).toMatchObject({ reason: 'protected', revised: '16. marraskuuta oli kylmä [TODO: tarkista päivä].' });
    expect(setAsideReason(aside)).toBe('Muutos olisi tehnyt rivistä luettelon tai otsikon');
    // The comma of the third line was proposed
    expect(result.corrections).toBe(1);

    // A change that would rewrite a note or a tag keeps the run's own reason
    expect(setAsideReason({ reason: 'protected', original: 'a [TODO: x] b', revised: 'a [TODO: y] b' })).toBe(SET_ASIDE_REASONS.protected);
    expect(setAsideReason({ reason: 'protected', original: 'a <u>b</u>', revised: 'a b' })).toBe(SET_ASIDE_REASONS.protected);
    expect(setAsideReason({ reason: 'protected', original: 'a', revised: null })).toBe(SET_ASIDE_REASONS.protected);
    // Every other reason reads as before
    expect(setAsideReason({ reason: 'moved', original: 'a', revised: 'b' })).toBe('Rivi muuttui ajon aikana');
  });

  test('runSummary says that a run stopped or failed before any answer, not that nothing needed correcting (I-06 review)', () => {
    const none = { corrections: 0, setAside: [], linesUnchanged: 0, linesChanged: 0, linesSent: 10 };
    expect(runSummary({ ...none, status: 'stopped' })).toBe('Pysäytetty ennen ensimmäistä vastausta.');
    expect(runSummary({ ...none, status: 'failed' })).toBe('Keskeytyi virheeseen ennen ensimmäistä vastausta.');
    // A finished run that found nothing, and runs with answers, keep summaryLine
    expect(runSummary({ ...none, status: 'done' })).toBe('Ei korjattavaa');
    expect(runSummary({ ...none, status: 'stopped', linesUnchanged: 10 })).toBe('Pysäytetty: Ei korjattavaa');
    expect(runSummary({ ...none, status: 'stopped', corrections: 4, linesChanged: 3, setAside: [{}] })).toBe('Pysäytetty: 4 korjausta, 1 rivi ohitettu');
    expect(runSummary({ ...none, status: 'failed', setAside: [{}, {}] })).toBe('Keskeytyi virheeseen: Ei korjattavaa, 2 riviä ohitettu');
  });
});

describe('what the panel and the chip share', () => {
  test('TEXT_DEPS holds every text function a run and Miksi? take, as functions', () => {
    expect(Object.keys(TEXT_DEPS).sort()).toEqual(Object.keys(deps).sort());
    for (const [name, fn] of Object.entries(TEXT_DEPS)) expect([name, typeof fn]).toEqual([name, 'function']);
    expect(TEXT_DEPS.splitBlocks).toBe(splitBlocks);
    expect(TEXT_DEPS.wordDiff).toBe(wordDiff);
  });

  test('the three metas are the contract\'s, and the Voikko and set-aside proposals use them', () => {
    const local = { instruction: '', provider: null, model: null, requestLogId: null };
    expect(TYPOGRAPHY_META).toEqual({ source: 'local', action: 'typography', actionLabel: 'Typografia', ...local });
    expect(VOIKKO_META).toEqual({ source: 'local', action: 'voikko', actionLabel: 'Voikko', ...local });
    expect(PROOFREAD_META).toEqual({ source: 'faust', action: 'proofread', actionLabel: 'Kielenhuolto', ...local });
    expect(voikkoChange({ from: 0, to: 1, quote: 'a' }, 'b').meta).toEqual(VOIKKO_META);
  });
});

describe('Voikko tab', () => {
  const findings = [
    { id: 'o@0', kind: 'oikeinkirjoitus', from: 0, to: 5, quote: 'Ainon', suggestions: ['Ainoon', 'Ainon', 'Aino', 'Aikon'] },
    { id: 'o@20', kind: 'oikeinkirjoitus', from: 20, to: 25, quote: 'Ainon', suggestions: ['Ainoon'] },
    { id: 'o@30', kind: 'oikeinkirjoitus', from: 30, to: 36, quote: 'kirrja', suggestions: ['kirja'] },
    { id: 'k@40', kind: 'kielioppi', from: 40, to: 45, quote: 'on on', suggestions: ['on'] }
  ];

  test('voikkoWordRows groups unknown words, keeps three suggestions and leaves out ignored words', () => {
    const rows = voikkoWordRows(findings, new Set());
    expect(rows.map(row => [row.word, row.count])).toEqual([['Ainon', 2], ['kirrja', 1]]);
    expect(rows[0].first.from).toBe(0);
    expect(rows[0].suggestions).toEqual(['Ainoon', 'Ainon', 'Aino']);
    expect(voikkoWordRows(findings, new Set(['Ainon'])).map(row => row.word)).toEqual(['kirrja']);
  });

  test('voikkoChange carries Voikko\'s local meta', () => {
    expect(voikkoChange(findings[2], 'kirja')).toEqual({
      from: 30, to: 36, insert: 'kirja', original: 'kirrja',
      meta: { source: 'local', action: 'voikko', actionLabel: 'Voikko', instruction: '', provider: null, model: null, requestLogId: null }
    });
  });
});

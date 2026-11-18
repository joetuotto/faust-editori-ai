/**
 * @jest-environment node
 */
const {
  PROOFREAD_DEFAULTS,
  PROOFREAD_ROLE,
  proofreadRules,
  EXPLAIN_SYSTEM,
  proofBudget,
  selectProofLines,
  formatBatch,
  proofreadTask,
  renderProofreadRequest,
  answerTokensForBatch,
  parseNumberedLines,
  alignBatch,
  reviseLine,
  locateLines,
  guardChanges,
  runProofread,
  buildExplainRequest,
  explainChange,
  summaryLine,
  meetsProofreadThreshold,
  modelNote,
  createProofreadSelection
} = require('../../src/services/ai/proofreadPass');
const proofreadModelNotes = require('../../src/services/ai/proofreadModelNotes');
const { createWordCheck } = require('../../src/services/language/wordCheck');

// ---------------------------------------------------------------------------
// Small fakes in the shapes of the real text modules (src/editor/blocks.js,
// maskSpans.js, batchParagraphs.js, wordDiff.js, sentences.js)
// ---------------------------------------------------------------------------

function splitBlocks(text) {
  const blocks = [];
  let from = 0;
  String(text).split('\n').forEach((line, index) => {
    let kind = 'paragraph';
    let prefix = /^\s*/.exec(line)[0];
    let marker;
    let match;
    if (!line.trim()) {
      kind = 'blank';
      prefix = '';
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      kind = 'break';
      prefix = '';
    } else if ((match = /^(#{1,6})\s+/.exec(line))) {
      kind = 'heading';
      prefix = match[0];
      marker = match[1];
    } else if ((match = /^>\s?/.exec(line))) {
      kind = 'quote';
      prefix = match[0];
      marker = '>';
    } else if ((match = /^\s*([-*+])\s+/.exec(line)) || (match = /^\s*(\d+[.)])\s+/.exec(line))) {
      kind = 'list';
      prefix = match[0];
      marker = match[1];
    }
    const body = kind === 'blank' || kind === 'break' ? '' : line.slice(prefix.length).trim();
    const block = { n: index + 1, from, to: from + line.length, kind, text: line, prefix, body, bodyFrom: from + prefix.length, bodyTo: from + prefix.length + body.length };
    if (marker) block.marker = marker;
    blocks.push(block);
    from += line.length + 1;
  });
  return blocks;
}

// [TODO: …] notes and <u> tags become ⟦n⟧
function maskSpans(text) {
  const spans = [];
  let masked = '';
  let cursor = 0;
  for (const match of String(text).matchAll(/\[TODO:[^\]\n]*\]|<\/?u>/g)) {
    masked += text.slice(cursor, match.index);
    const token = `⟦${spans.length + 1}⟧`;
    spans.push({ id: spans.length + 1, text: match[0], token, at: masked.length });
    masked += token;
    cursor = match.index + match[0].length;
  }
  masked += text.slice(cursor);
  return { text: masked, source: text, spans, hasProse: /[\p{L}\p{N}]/u.test(masked.replace(/⟦\d+⟧/g, ' ')) };
}

// A placeholder the model dropped goes back after the word it followed, with the spaces it had
function unmaskSpans(output, mask) {
  let text = String(output);
  const restored = [];
  for (const span of mask.spans) {
    if (text.includes(span.token)) continue;
    const [, anchor = '', gap = ''] = /(\S*)(\s*)$/.exec(mask.text.slice(0, span.at));
    const spaceAfter = /^\s/.test(mask.text.slice(span.at + span.token.length));
    const found = anchor ? text.indexOf(anchor) : 0;
    let at = found === -1 ? Math.min(span.at, text.length) : found + anchor.length;
    let piece = span.token;
    if (found !== -1 && gap && text.startsWith(gap, at)) at += gap.length;
    else if (found !== -1) piece = gap + piece;
    if (spaceAfter && at < text.length && !/\s/.test(text[at])) piece += ' ';
    text = text.slice(0, at) + piece + text.slice(at);
    restored.push(span.id);
  }
  for (const span of mask.spans) text = text.split(span.token).join(span.text);
  return { text, restored, repositioned: [], displaced: [], duplicates: [], dropped: [], unknown: 0 };
}

function batchParagraphs(lines, { max, maxLines = 40, lineOverhead = 8, measure = (text) => text.length }) {
  const batches = [];
  let current = null;
  const close = () => {
    if (current) batches.push(current);
    current = null;
  };
  for (const line of lines) {
    const cost = measure(line.text, line) + lineOverhead;
    if (cost > max) {
      close();
      batches.push({ index: batches.length, lines: [line], size: cost, oversize: true });
      continue;
    }
    if (current && (current.size + cost > max || current.lines.length >= maxLines)) close();
    if (!current) current = { index: batches.length, lines: [], size: 0, oversize: false };
    current.lines.push(line);
    current.size += cost;
  }
  close();
  return batches;
}

// Word-level diff: a changed word is replaced whole, punctuation is a token of its own
const WORD_TOKENS = /\s+|[\p{L}\p{N}'’-]+|[^\s\p{L}\p{N}'’-]/gu;
const isWord = (token) => /[\p{L}\p{N}]/u.test(token);

function wordDiff(original, revised) {
  const a = original.match(WORD_TOKENS) || [];
  const b = revised.match(WORD_TOKENS) || [];
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const changes = [];
  let open = null;
  let pos = 0;
  const close = () => {
    if (open) changes.push(open);
    open = null;
  };
  for (let i = 0, j = 0; i < a.length || j < b.length;) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      close();
      pos += a[i].length;
      i += 1;
      j += 1;
      continue;
    }
    if (!open) open = { from: pos, to: pos, insert: '', original: '' };
    if (j < b.length && (i >= a.length || table[i][j + 1] >= table[i + 1][j])) {
      open.insert += b[j];
      j += 1;
    } else {
      open.original += a[i];
      open.to += a[i].length;
      pos += a[i].length;
      i += 1;
    }
  }
  close();
  return changes;
}

// Share of the words that changed (a comma alone changes no word)
function changeRatio(original, revised) {
  const words = (text) => (text.match(WORD_TOKENS) || []).filter(isWord).length;
  const changed = wordDiff(original, revised).reduce((sum, change) => sum + Math.max(words(change.original), words(change.insert)), 0);
  return Math.min(1, changed / Math.max(words(original), words(revised), 1));
}

const trimToSentence = (text) => {
  const match = /^[\s\S]*[.!?…]/.exec(text);
  return match ? match[0] : '';
};
const placeholderInstruction = (language) => (language === 'en' ? 'Keep every placeholder ⟦1⟧ as it is.' : 'Säilytä jokainen paikkamerkki ⟦1⟧ sellaisenaan.');

const deps = { splitBlocks, maskSpans, unmaskSpans, batchParagraphs, wordDiff, changeRatio, trimToSentence, placeholderInstruction };

// ---------------------------------------------------------------------------
// A fake request layer in the shape of aiClient.requestEdit
// ---------------------------------------------------------------------------

const LOG_META = { source: 'faust', action: 'proofread', actionLabel: 'Kielenhuolto', instruction: '', provider: 'cherry', model: 'malli-a', requestLogId: 'log-7' };

const accepted = (inner, extra = {}) => ({
  ok: true, accepted: true, cancelled: false, reason: null, reasonText: null,
  inner, text: `<teksti>\n${inner}\n</teksti>`, model: 'malli-a', logMeta: LOG_META, ...extra
});
const rejected = (reason, reasonText) => ({
  ok: true, accepted: false, cancelled: false, reason, reasonText, inner: null, text: '[1] kesken', model: 'malli-a', logMeta: LOG_META
});
const errored = (message) => ({
  ok: false, accepted: false, cancelled: false, reason: 'error', reasonText: `Ei ehdotusta: ${message}`,
  inner: null, text: '', model: 'malli-a', error: { code: 'network', message, status: null }, logMeta: LOG_META
});
const cancelledResult = () => ({
  ok: true, accepted: false, cancelled: true, reason: 'cancelled', reasonText: 'Pyyntö pysäytettiin.', inner: null, text: '', model: 'malli-a', logMeta: LOG_META
});

// The numbered lines of a request, as the model gets them
const sentLines = (opts) => opts.original.split('\n').map((line) => {
  const match = /^\[(\d+)\] (.*)$/.exec(line);
  return { n: Number(match[1]), text: match[2] };
});
const numbered = (lines) => lines.map(line => `[${line.n}] ${line.text}`).join('\n');

// A model that answers request number `index` with reply(lines, index, opts)
function fakeModel(reply) {
  const calls = [];
  let running = 0;
  const stats = { maxRunning: 0, cancels: 0 };
  const request = (opts) => {
    const index = calls.length;
    calls.push(opts);
    running += 1;
    stats.maxRunning = Math.max(stats.maxRunning, running);
    const result = new Promise(resolve => setImmediate(resolve))
      .then(() => reply(sentLines(opts), index, opts))
      .finally(() => {
        running -= 1;
      });
    return { result, cancel: () => { stats.cancels += 1; } };
  };
  return { request, calls, stats };
}

// Answers every line through fix(text, n, callIndex)
const fixing = (fix) => (lines, index) => accepted(numbered(lines.map(line => ({ n: line.n, text: fix(line.text, line.n, index) }))));
const addComma = (text) => text.replace(' että', ', että');
const echo = fixing(text => text);

function apply(text, changes) {
  let out = '';
  let cursor = 0;
  for (const change of [...changes].sort((a, b) => a.from - b.from)) {
    out += text.slice(cursor, change.from) + change.insert;
    cursor = change.to;
  }
  return out + text.slice(cursor);
}

// Run with the fakes; collects what onBatch got
async function run(text, reply, extra = {}) {
  const model = fakeModel(reply);
  const batches = [];
  const result = await runProofread({
    text,
    deps,
    meta: { chapterId: 'c1' },
    runId: 'ajo-1',
    request: model.request,
    onBatch: (batch) => {
      batches.push(batch);
    },
    ...extra
  });
  return { result, batches, calls: model.calls, stats: model.stats, changes: batches.flatMap(batch => batch.changes) };
}

const lineOf = (text, options) => selectProofLines(text, options, deps).lines[0];
const ONE_PER_BATCH = { maxChars: 2000, maxLines: 1 };

const CHAPTER = [
  '# Ensimmäinen luku',
  '',
  'Hän sanoi että tulee.',
  '- maitoa ja leipää',
  '1. ensimmäinen kohta',
  '> Lainattu rivi että näin.',
  '',
  '* * *',
  '',
  '– Minä tiedän että tulet, hän sanoi.',
  'Ilta oli hiljainen.'
].join('\n');

// ---------------------------------------------------------------------------

describe('budget and line selection', () => {
  test('proofBudget gives 2000 characters and 10 lines without model info and never leaves 500–2000', () => {
    expect(proofBudget()).toEqual({ maxChars: 2000, maxLines: 10 });
    expect(proofBudget({})).toEqual({ maxChars: 2000, maxLines: 10 });
    expect(PROOFREAD_DEFAULTS.budget).toEqual({ maxChars: 2000, maxLines: 10 });

    // A quarter of the prompt budget, or what the output limit leaves at three tokens per character
    expect(proofBudget({ promptBudgetChars: 6000 })).toEqual({ maxChars: 1500, maxLines: 10 });
    expect(proofBudget({ maxOutputTokens: 4000 })).toEqual({ maxChars: 1000, maxLines: 10 });
    expect(proofBudget({ promptBudgetChars: 6000, maxOutputTokens: 4000 }).maxChars).toBe(1000);

    for (const info of [{ promptBudgetChars: 0 }, { promptBudgetChars: 100 }, { maxOutputTokens: 0 }, { maxOutputTokens: 1200 },
      { promptBudgetChars: 1e9, maxOutputTokens: 1e9 }, { promptBudgetChars: NaN, maxOutputTokens: undefined }]) {
      const { maxChars, maxLines } = proofBudget(info);
      expect(maxChars).toBeGreaterThanOrEqual(500);
      expect(maxChars).toBeLessThanOrEqual(2000);
      expect(maxLines).toBe(10);
    }
    expect(proofBudget({ promptBudgetChars: 100 }).maxChars).toBe(500);
    expect(proofBudget({ promptBudgetChars: 1e9, maxOutputTokens: 1e9 }).maxChars).toBe(2000);
  });

  test('the defaults are the trial\'s numbers', () => {
    expect(PROOFREAD_DEFAULTS).toEqual({
      skipQuoteLines: true,
      skipDialogue: false,
      dashDialogue: false,
      keepNote: '',
      maxRatio: 0.3,
      shortLineWords: 8,
      maxLineChars: 12000,
      budget: { maxChars: 2000, maxLines: 10 },
      tokensPerChar: 3,
      answerExtra: 1000
    });
  });

  test('selectProofLines sends paragraphs and list item bodies and skips headings and scene breaks', () => {
    const { lines, skipped } = selectProofLines(CHAPTER, {}, deps);
    expect(lines.map(line => line.text)).toEqual([
      'Hän sanoi että tulee.',
      'maitoa ja leipää',
      'ensimmäinen kohta',
      '– Minä tiedän että tulet, hän sanoi.',
      'Ilta oli hiljainen.'
    ]);
    expect(skipped).toEqual({ structural: 2, quote: 1, dialogue: 0, empty: 0, tooLong: 0 });
    // key, index and the whole-line range in the text
    const first = lines[0];
    expect(first).toMatchObject({ key: 'L2', index: 2, from: 20, to: 41, prefix: '', masked: 'Hän sanoi että tulee.', dialogue: false });
    expect(CHAPTER.slice(first.from, first.to)).toBe('Hän sanoi että tulee.');
    for (const line of lines) {
      expect(CHAPTER.slice(line.from + line.prefix.length, line.from + line.prefix.length + line.text.length)).toBe(line.text);
    }
  });

  test('a list marker is never part of the text that is sent', () => {
    const { lines } = selectProofLines('- maitoa ja leipää\n  * sisennetty kohta\n12) numeroitu kohta', {}, deps);
    expect(lines.map(line => [line.prefix, line.text])).toEqual([
      ['- ', 'maitoa ja leipää'],
      ['  * ', 'sisennetty kohta'],
      ['12) ', 'numeroitu kohta']
    ]);
    expect(formatBatch(lines)).toBe('[1] maitoa ja leipää\n[2] sisennetty kohta\n[3] numeroitu kohta');
    expect(proofreadTask(lines, {}, deps).payload).not.toMatch(/^\[\d+\] (- |\* |12\) )/m);
  });

  test('a "- " line is a dialogue line only with dashDialogue', () => {
    const text = '- Hei, sanoi Pekka.\n* tähtikohta\n– Oikea repliikki.\nKerrontaa.';
    const plain = selectProofLines(text, {}, deps).lines;
    expect(plain.map(line => line.dialogue)).toEqual([false, false, true, false]);
    const dash = selectProofLines(text, { dashDialogue: true }, deps).lines;
    expect(dash.map(line => line.dialogue)).toEqual([true, false, true, false]);
    // With "Ohita vuorosanat" those lines are then left out
    const skipping = selectProofLines(text, { dashDialogue: true, skipDialogue: true }, deps);
    expect(skipping.lines.map(line => line.text)).toEqual(['tähtikohta', 'Kerrontaa.']);
    expect(skipping.skipped.dialogue).toBe(2);
  });

  test('selectProofLines skips quote lines by default and sends them without the marker when asked', () => {
    expect(selectProofLines(CHAPTER, {}, deps).lines.some(line => line.text.includes('Lainattu'))).toBe(false);
    const { lines, skipped } = selectProofLines(CHAPTER, { skipQuoteLines: false }, deps);
    const quote = lines.find(line => line.text.includes('Lainattu'));
    expect(quote).toMatchObject({ prefix: '> ', text: 'Lainattu rivi että näin.', masked: 'Lainattu rivi että näin.' });
    expect(skipped.quote).toBe(0);
  });

  test('selectProofLines skips dialogue-dash lines with skipDialogue', () => {
    const { lines, skipped } = selectProofLines(CHAPTER, { skipDialogue: true }, deps);
    expect(lines.map(line => line.text)).toEqual(['Hän sanoi että tulee.', 'maitoa ja leipää', 'ensimmäinen kohta', 'Ilta oli hiljainen.']);
    expect(skipped.dialogue).toBe(1);
    // Off by default: dialogue is sent and flagged
    expect(selectProofLines(CHAPTER, {}, deps).lines.find(line => line.dialogue).text).toBe('– Minä tiedän että tulet, hän sanoi.');
  });

  test('selectProofLines counts hyphen list lines in dashListLines', () => {
    const text = '- yksi\n- kaksi\n* kolme\n+ neljä\n1. viisi\n- - -\nKappale.';
    const selection = selectProofLines(text, {}, deps);
    expect(selection.dashListLines).toBe(2);
    expect(selection.skipped).not.toHaveProperty('dashList');
    expect(selectProofLines('Kappale.', {}, deps).dashListLines).toBe(0);
  });

  test('selectProofLines honours a range', () => {
    const text = 'Eka kappale.\nToka kappale.\n# Otsikko\nKolmas kappale.';
    const from = text.indexOf('Toka') + 2;
    const inRange = selectProofLines(text, { range: { from, to: from + 3 } }, deps);
    expect(inRange.lines.map(line => line.text)).toEqual(['Toka kappale.']);
    // Lines outside the range are not counted as skipped either
    expect(inRange.skipped.structural).toBe(0);
    const wide = selectProofLines(text, { range: { from, to: text.length } }, deps);
    expect(wide.lines.map(line => line.text)).toEqual(['Toka kappale.', 'Kolmas kappale.']);
    expect(wide.skipped.structural).toBe(1);
    // A range that ends where a line starts does not take that line
    const edge = selectProofLines(text, { range: { from: 0, to: text.indexOf('Toka') } }, deps);
    expect(edge.lines.map(line => line.text)).toEqual(['Eka kappale.']);
  });

  test('selectProofLines leaves out lines without prose and over-long lines', () => {
    const text = '[TODO: kirjoita tämä kohtaus]\n1939–1945\nLyhyt kappale.\n' + 'sana '.repeat(30).trim();
    const { lines, skipped } = selectProofLines(text, { maxLineChars: 100 }, deps);
    expect(lines.map(line => line.text)).toEqual(['Lyhyt kappale.']);
    expect(skipped).toEqual({ structural: 0, quote: 0, dialogue: 0, empty: 2, tooLong: 1 });
    expect(selectProofLines('', {}, deps)).toEqual({ lines: [], skipped: { structural: 0, quote: 0, dialogue: 0, empty: 0, tooLong: 0 }, dashListLines: 0 });
  });

  test('a note and <u> tags are masked in the line that is sent', () => {
    const line = lineOf('Juna lähti [TODO: tarkista aika] ja <u>vaunu</u> oli tyhjä.');
    expect(line.masked).toBe('Juna lähti ⟦1⟧ ja ⟦2⟧vaunu⟦3⟧ oli tyhjä.');
    expect(line.mask.spans.map(span => span.text)).toEqual(['[TODO: tarkista aika]', '<u>', '</u>']);
  });

  test('formatBatch numbers from 1 in every batch', () => {
    const { lines } = selectProofLines('Eka.\nToka.\nKolmas.', {}, deps);
    expect(formatBatch(lines.slice(0, 2))).toBe('[1] Eka.\n[2] Toka.');
    expect(formatBatch(lines.slice(2))).toBe('[1] Kolmas.');
    expect(formatBatch([])).toBe('');
  });
});

describe('the request', () => {
  const lines = selectProofLines('Hän sanoi että tulee.\nJuna lähti [TODO: aika] illalla.', {}, deps).lines;

  test('proofreadTask carries the trial\'s rules, the placeholder instruction as rule 4 and the numbered lines as payload', () => {
    const task = proofreadTask(lines, { keepNote: '' }, deps);
    expect(task).toEqual({
      id: 'proofread',
      role: 'Olet suomen kielen oikolukija. Saat numeroituja rivejä kirjan käsikirjoituksesta. Jokainen rivi on yksi kappale.',
      rules: [
        'Korjaa vain selvät kielivirheet: lyöntivirheet, yhdyssanavirheet, pilkkuvirheet, väärät taivutusmuodot, kongruenssivirheet ja selvät typografiset virheet.',
        '1. Älä muuta tyyliä, sanavalintoja, sanajärjestystä tai rytmiä. Älä tiivistä, selkeytä tai paranna tekstiä.',
        '2. Jos rivillä ei ole virhettä, palauta se merkilleen samana.',
        '3. Palauta jokainen rivi omalla rivillään ja samalla numerolla: [1], [2] ja niin edelleen. Rivejä on vastauksessa täsmälleen yhtä monta kuin sait. Älä yhdistä, jaa, lisää tai poista rivejä.',
        '4. Säilytä jokainen paikkamerkki ⟦1⟧ sellaisenaan.',
        '5. Vuorosanaviivalla (–) alkavat rivit ovat repliikkejä. Niiden puhekieli ja murre ovat tahallisia: älä muuta niitä yleiskieleksi. Korjaa repliikistä vain selvä lyöntivirhe.',
        '6. Suomen lainausmerkki on ” ja ajatusviiva –. Älä vaihda niitä suoriin lainausmerkkeihin (") tai yhdysmerkkeihin (-).',
        '7. Vastaa vain korjatuilla riveillä <teksti>-tagien sisällä. Ei selityksiä, ei otsikoita, ei koodilohkoja, ei mitään tagien ulkopuolella.',
        'Vastauksen muoto:',
        '<teksti>',
        '[1] ensimmäinen rivi korjattuna',
        '[2] toinen rivi korjattuna',
        '</teksti>'
      ],
      instruction: 'Oikolue nämä 2 riviä. Palauta 2 riviä samoilla numeroilla <teksti>-tagien sisällä.',
      payload: '[1] Hän sanoi että tulee.\n[2] Juna lähti ⟦1⟧ illalla.',
      payloadTag: 'teksti',
      payloadLabel: 'kappaleet',
      parts: ['style', 'names'],
      answerTokens: answerTokensForBatch('[1] Hän sanoi että tulee.\n[2] Juna lähti ⟦1⟧ illalla.'.length)
    });
    expect(task.role).toBe(PROOFREAD_ROLE);
    expect(task.rules).toEqual(proofreadRules(deps, ''));

    // One line has its own wording; a batch object of batchParagraphs is accepted as well
    expect(proofreadTask(lines.slice(0, 1), {}, deps).instruction)
      .toBe('Oikolue tämä 1 rivi. Palauta 1 rivi samalla numerolla <teksti>-tagien sisällä.');
    expect(proofreadTask({ index: 0, lines, size: 0, oversize: false }, {}, deps).payload).toBe(task.payload);
  });

  test('proofreadTask adds the keep note only when it is not empty', () => {
    expect(proofreadTask(lines, { keepNote: '' }, deps).rules).toHaveLength(13);
    expect(proofreadTask(lines, { keepNote: '  \n ' }, deps).rules).toHaveLength(13);
    expect(proofreadTask(lines, {}, deps).rules).toHaveLength(13);

    const rules = proofreadTask(lines, { keepNote: ' murre repliikeissä,\npuhekielen ”ketä” ' }, deps).rules;
    expect(rules).toHaveLength(14);
    expect(rules[13]).toBe('Kirjoittaja on merkinnyt nämä tahallisiksi, älä korjaa niitä: murre repliikeissä, puhekielen ”ketä”');

    // At most 1 000 characters of the note
    const long = proofreadRules(deps, 'ä'.repeat(1500));
    expect(long[13]).toBe(`Kirjoittaja on merkinnyt nämä tahallisiksi, älä korjaa niitä: ${'ä'.repeat(1000)}`);
  });

  test('answerTokensForBatch is three tokens per character plus 1000', () => {
    expect(answerTokensForBatch(0)).toBe(1000);
    expect(answerTokensForBatch(100)).toBe(1300);
    expect(answerTokensForBatch(2000)).toBe(7000);
    expect(answerTokensForBatch(333)).toBe(1999);
  });

  test('renderProofreadRequest puts role, language rule and rules into system and <teksti> then <ohje> into the user message', () => {
    const task = proofreadTask(lines, {}, deps);
    const request = renderProofreadRequest(task);
    expect(request.system).toBe(`${PROOFREAD_ROLE}\nKirjoita ja vastaa suomeksi.\n\n${task.rules.join('\n')}`);
    expect(request.messages).toEqual([{
      role: 'user',
      content: '<teksti>\n[1] Hän sanoi että tulee.\n[2] Juna lähti ⟦1⟧ illalla.\n</teksti>\n\n<ohje>\nOikolue nämä 2 riviä. Palauta 2 riviä samoilla numeroilla <teksti>-tagien sisällä.\n</ohje>'
    }]);
    expect(Object.keys(request).sort()).toEqual(['messages', 'system']);
    expect(renderProofreadRequest(task, 'fi')).toEqual(request);
    expect(renderProofreadRequest(task, 'en').system.split('\n')[1]).toBe('Write and answer in English.');
  });
});

describe('the answer', () => {
  test('parseNumberedLines reads [1] … lines and ignores a preamble', () => {
    const parsed = parseNumberedLines('Tässä korjatut rivit:\n\n[1] Eka rivi.\r\n[2]Toka rivi.\n  [3] Kolmas – ääkkösin: äöå.\n');
    expect([...parsed.entries]).toEqual([[1, ['Eka rivi.']], [2, ['Toka rivi.']], [3, ['Kolmas – ääkkösin: äöå.']]]);
    expect(parsed.preamble).toEqual(['Tässä korjatut rivit:']);
    expect(parsed.continued.size).toBe(0);
    expect(parseNumberedLines('').entries.size).toBe(0);
    expect(parseNumberedLines(undefined).entries.size).toBe(0);
  });

  test('parseNumberedLines marks a continuation line as split', () => {
    const parsed = parseNumberedLines('[1] Eka rivi alkaa\nja jatkuu tässä.\n\n[2] Toka rivi.');
    expect([...parsed.continued]).toEqual([1]);
    expect(parsed.entries.get(1)).toEqual(['Eka rivi alkaa']);
    expect(parsed.entries.get(2)).toEqual(['Toka rivi.']);
  });

  test('parseNumberedLines keeps duplicates visible', () => {
    const parsed = parseNumberedLines('[1] Eka.\n[2] Toka.\n[2] Toka toisin.');
    expect(parsed.entries.get(2)).toEqual(['Toka.', 'Toka toisin.']);
    expect(parsed.entries.get(1)).toEqual(['Eka.']);
  });

  test('parseNumberedLines does not accept 1. …', () => {
    const parsed = parseNumberedLines('1. Eka rivi.\n2) Toka rivi.\n(3) Kolmas.');
    expect(parsed.entries.size).toBe(0);
    expect(parsed.preamble).toEqual(['1. Eka rivi.', '2) Toka rivi.', '(3) Kolmas.']);
    // After a numbered line such a line is a continuation of it
    expect([...parseNumberedLines('[1] Eka.\n2. Toka.').continued]).toEqual([1]);
  });

  test('alignBatch reports missing, duplicate and split lines', () => {
    const { lines } = selectProofLines('Eka.\nToka.\nKolmas.\nNeljäs.\nViides.', {}, deps);
    const parsed = parseNumberedLines('[1] Eka!\n[2] Toka.\n[2] Toka taas.\n[4] Neljäs\njatkuu.\n[5]\n[9] Ylimääräinen.');
    const aligned = alignBatch(lines, parsed);
    expect(aligned.map(entry => entry.status)).toEqual(['ok', 'duplicate', 'missing', 'split', 'missing']);
    expect(aligned[0]).toEqual({ line: lines[0], status: 'ok', revisedMasked: 'Eka!' });
    expect(aligned[1]).toEqual({ line: lines[1], status: 'duplicate' });
    expect(aligned.map(entry => entry.line)).toEqual(lines);
  });
});

describe('reviseLine', () => {
  const revise = (text, answer, options = PROOFREAD_DEFAULTS, withDeps = deps) => {
    const line = lineOf(text);
    return reviseLine(line, answer === undefined ? line.masked : answer, options, withDeps);
  };

  test('reviseLine returns unchanged for an identical line', () => {
    const outcome = revise('Hän sanoi, että tulee.');
    expect(outcome).toMatchObject({ status: 'unchanged', revised: 'Hän sanoi, että tulee.', ratio: 0, changes: [], dropped: { protected: 0, dialogue: 0 } });
    expect(outcome.line.text).toBe('Hän sanoi, että tulee.');
    // Spaces around the answer do not count
    expect(revise('Hän tuli.', '  Hän tuli.  ').status).toBe('unchanged');
  });

  test('reviseLine returns unchanged when the model only changed ” to " and – to -', () => {
    const text = 'Hän sanoi: ”Tule tänne” – ja lähti… vuosina 1939–1945.';
    const outcome = revise(text, 'Hän sanoi: "Tule tänne" - ja lähti... vuosina 1939-1945.');
    expect(outcome.status).toBe('unchanged');
    expect(outcome.revised).toBe(text);
    expect(outcome.changes).toEqual([]);
  });

  test('reviseLine proposes a comma fix in Hän sanoi että tulee.', () => {
    const outcome = revise('Hän sanoi että tulee.', 'Hän sanoi, että tulee.');
    expect(outcome.status).toBe('changes');
    expect(outcome.revised).toBe('Hän sanoi, että tulee.');
    expect(outcome.changes).toEqual([{ from: 9, to: 9, insert: ',', original: '' }]);
    expect(outcome.ratio).toBeLessThan(0.3);
  });

  test('reviseLine sets a line aside as rewritten above the ratio', () => {
    const text = 'Aamulla järvi oli tyyni kuin lasi ja sumu nousi hitaasti.';
    const outcome = revise(text, 'Varhain aamulla vesi lepäsi peilityynenä, ja usva kohosi verkkaan rannasta.');
    expect(outcome.status).toBe('rewritten');
    expect(outcome.ratio).toBeGreaterThan(0.3);
    expect(outcome.revised).toBe('Varhain aamulla vesi lepäsi peilityynenä, ja usva kohosi verkkaan rannasta.');
    // The same answer passes when the limit is raised
    expect(revise(text, 'Varhain aamulla vesi lepäsi peilityynenä, ja usva kohosi verkkaan rannasta.', { ...PROOFREAD_DEFAULTS, maxRatio: 1 }).status).toBe('changes');
  });

  test('reviseLine does not set aside a one-word fix in a four-word line', () => {
    const half = { ...deps, changeRatio: () => 0.5 };
    // Four words, one change: a fix, whatever the ratio says
    const short = revise('Hän tuli kotin illalla.', 'Hän tuli kotiin illalla.', PROOFREAD_DEFAULTS, half);
    expect(short.status).toBe('changes');
    expect(short.changes).toHaveLength(1);
    expect(short.ratio).toBe(0.5);
    // Eight words with the same ratio: set aside
    const long = revise('Hän tuli kotin illalla ja meni heti nukkumaan.', 'Hän tuli kotiin illalla ja meni heti nukkumaan.', PROOFREAD_DEFAULTS, half);
    expect(long.status).toBe('rewritten');
    // A short line with more than two changes: set aside as well
    const many = revise('Hän tuli kotin illala.', 'Hen tuli kotiin illalla!', PROOFREAD_DEFAULTS, half);
    expect(many.changes.length).toBe(0);
    expect(many.status).toBe('rewritten');
  });

  test('reviseLine restores a TODO note the model dropped and proposes nothing for it', () => {
    const text = 'Juna lähti kello kuusi [TODO: tarkista aikataulu], ja vaunu oli tyhjä.';
    const dropped = revise(text, 'Juna lähti kello kuusi, ja vaunu oli tyhjä.');
    expect(dropped.status).toBe('unchanged');
    expect(dropped.revised).toBe(text);

    // The note stays also when the model fixes something else on the line
    const fixedElsewhere = revise('Juna lähti kello kuusi [TODO: tarkista aikataulu] ja tiesin että se myöhästyy.',
      'Juna lähti kello kuusi ja tiesin, että se myöhästyy.');
    expect(fixedElsewhere.status).toBe('changes');
    expect(fixedElsewhere.revised).toBe('Juna lähti kello kuusi [TODO: tarkista aikataulu] ja tiesin, että se myöhästyy.');
    expect(fixedElsewhere.changes.map(change => change.insert)).toEqual([',']);
  });

  test('reviseLine keeps <u> tags when the model removed them', () => {
    const text = 'Hän oli <u>hyvin</u> väsynyt.';
    const outcome = revise(text, 'Hän oli hyvin väsynyt.');
    expect(outcome.status).toBe('unchanged');
    expect(outcome.revised).toBe(text);
  });

  test('a change that reaches into a note or a tag is dropped and counted', () => {
    // A mask that gives the note back in another form: the diff then touches the note itself
    const altered = { ...deps, unmaskSpans: (output) => ({ text: output.replace('⟦1⟧', '[TODO: muutettu]') }) };
    const outcome = revise('Juna lähti [TODO: tarkista] illalla ja tiesin että se myöhästyy.',
      'Juna lähti ⟦1⟧ illalla ja tiesin, että se myöhästyy.', PROOFREAD_DEFAULTS, altered);
    expect(outcome.dropped.protected).toBeGreaterThan(0);
    expect(outcome.changes.map(change => change.insert)).toEqual([',']);
    expect(outcome.status).toBe('changes');
  });

  test('reviseLine drops changes inside quotation marks with skipDialogue', () => {
    const text = 'Hän sanoi: ”Mä en tiiä että mitä”, ja tiesin että hän valehteli.';
    const answer = 'Hän sanoi: ”Mä en tiiä, että mitä”, ja tiesin, että hän valehteli.';
    const skipping = revise(text, answer, { ...PROOFREAD_DEFAULTS, skipDialogue: true });
    expect(skipping.status).toBe('changes');
    expect(skipping.changes).toHaveLength(1);
    expect(skipping.changes[0].from).toBeGreaterThan(text.indexOf('”, ja'));
    expect(skipping.dropped).toEqual({ protected: 0, dialogue: 1 });
    // Without the option both commas are proposed
    const all = revise(text, answer);
    expect(all.changes).toHaveLength(2);
    expect(all.dropped.dialogue).toBe(0);
  });

  test('reviseLine handles ä, ö and å in changed words', () => {
    const text = 'Äiti söi päärynän yölä Åbossa.';
    const outcome = revise(text, 'Äiti söi päärynän yöllä Åbossa.');
    expect(outcome.status).toBe('changes');
    expect(outcome.changes).toHaveLength(1);
    const [change] = outcome.changes;
    expect(text.slice(0, change.from) + change.insert + text.slice(change.to)).toBe('Äiti söi päärynän yöllä Åbossa.');
    expect(change.original).toBe(text.slice(change.from, change.to));
  });

  test('a multi-line answer and an empty answer are never changes', () => {
    const multi = reviseLine(lineOf('Hän tuli kotiin.'), 'Hän tuli.\nKotiin.', PROOFREAD_DEFAULTS, { ...deps, unmaskSpans: (output) => ({ text: output }) });
    expect(multi.status).toBe('multiline');
    expect(multi.changes).toEqual([]);
    const empty = revise('Hän tuli kotiin.', '   ');
    expect(empty.status).toBe('rewritten');
    expect(empty.changes).toEqual([]);
  });
});

describe('locateLines and guardChanges', () => {
  test('locateLines finds a repeated line by the nearest index', () => {
    const text = '– Niin.\nEka kappale.\n– Niin.\nToka kappale.\n– Niin.';
    const starts = [0, 8, 21, 29, 43];
    const at = (index) => ({ from: starts[index], to: starts[index] + text.split('\n')[index].length });

    // The third "– Niin." of the old text is still the third one
    expect(locateLines(text, [{ key: 'L4', index: 4, prefix: '', text: '– Niin.' }]).get('L4')).toEqual(at(4));
    expect(locateLines(text, [{ key: 'L2', index: 2, prefix: '', text: '– Niin.' }]).get('L2')).toEqual(at(2));
    // Two lines were inserted above: the nearest one is taken; a tie goes to the later line
    expect(locateLines(text, [{ key: 'L3', index: 3, prefix: '', text: '– Niin.' }]).get('L3')).toEqual(at(4));
    expect(locateLines(text, [{ key: 'L1', index: 1, prefix: '', text: '– Niin.' }]).get('L1')).toEqual(at(2));

    // Each current line is used once, in the order of the lines asked for
    const both = locateLines(text, [
      { key: 'a', index: 0, prefix: '', text: '– Niin.' },
      { key: 'b', index: 0, prefix: '', text: '– Niin.' }
    ]);
    expect(both.get('a')).toEqual(at(0));
    expect(both.get('b')).toEqual(at(2));

    // A resume line of a result has only index and text: its key is 'L' + index
    expect(locateLines('Uusi alku.\n- maitoa ja leipää\nLoppu.', [{ index: 0, text: '- maitoa ja leipää' }]).get('L0')).toEqual({ from: 11, to: 29 });
    // prefix + text is compared with the whole line
    expect(locateLines('- maitoa ja leipää  \nLoppu.', [{ key: 'L0', index: 0, prefix: '- ', text: 'maitoa ja leipää' }]).get('L0')).toEqual({ from: 0, to: 20 });
  });

  test('locateLines returns null for an edited line', () => {
    const found = locateLines('Eka kappale muuttui.\nToka kappale.', [
      { key: 'L0', index: 0, prefix: '', text: 'Eka kappale.' },
      { key: 'L1', index: 1, prefix: '', text: 'Toka kappale.' }
    ]);
    expect(found.get('L0')).toBeNull();
    expect(found.get('L1')).toEqual({ from: 21, to: 34 });
    expect(locateLines('', [{ key: 'L0', index: 0, prefix: '', text: 'Poissa.' }]).get('L0')).toBeNull();
    expect(locateLines('Teksti.', []).size).toBe(0);
  });

  test('guardChanges drops a change that would alter a heading', () => {
    const text = '# Otsikko\nHän sanoi että tulee.\n- kohta\n\n* * *\nLoppu [TODO: x] ja <u>sana</u>.';
    const comma = { from: text.indexOf(' että'), to: text.indexOf(' että'), insert: ',' };
    const heading = { from: 2, to: 9, insert: 'Uusi otsikko' };
    const guard = guardChanges(text, [heading, comma]);
    expect(guard.safe).toEqual([comma]);
    expect(guard.dropped).toEqual([heading]);

    // Correct input: nothing is dropped
    expect(guardChanges(text, [comma])).toEqual({ safe: [comma], dropped: [] });
    expect(guardChanges(text, [])).toEqual({ safe: [], dropped: [] });
  });

  test('guardChanges drops changes that touch a list marker, a scene break, a note or a tag, line by line', () => {
    const text = '# Otsikko\nHän sanoi että tulee.\n- kohta\n\n* * *\nLoppu [TODO: x] ja <u>sana</u>.';
    const at = (needle) => text.indexOf(needle);
    const comma = { from: at(' että'), to: at(' että'), insert: ',' };
    const cases = [
      { from: at('- kohta'), to: at('- kohta') + 2, insert: '' },           // list marker removed
      { from: at('* * *'), to: at('* * *') + 5, insert: 'Uusi kappale.' },  // scene break replaced
      { from: at('[TODO: x]'), to: at('[TODO: x]') + 9, insert: '' },       // note deleted
      { from: at('<u>'), to: at('<u>') + 3, insert: '' },                   // tag deleted
      { from: at('Hän'), to: at('Hän'), insert: '# ' },                     // a paragraph turned into a heading
      { from: at('Loppu'), to: at('Loppu'), insert: 'Rivi.\n' }             // a new line above the note
    ];
    for (const bad of cases) {
      const guard = guardChanges(text, [bad, comma]);
      if (bad.from === at('Hän')) {
        // Same line as the comma: the whole line's changes go
        expect(guard.safe).toEqual([]);
        expect(guard.dropped).toHaveLength(2);
      } else {
        expect(guard.safe).toEqual([comma]);
        expect(guard.dropped).toEqual([bad]);
      }
    }
    // A change of the body of a list line is fine: only the marker is structure
    const body = { from: at('kohta'), to: at('kohta') + 5, insert: 'kohtaa' };
    expect(guardChanges(text, [body]).dropped).toEqual([]);
    // Overlapping or out-of-range changes cannot be applied at all
    const overlap = guardChanges(text, [{ from: 12, to: 16, insert: 'x' }, { from: 14, to: 18, insert: 'y' }, { from: 5, to: 9999, insert: '' }]);
    expect(overlap.safe).toEqual([{ from: 12, to: 16, insert: 'x' }]);
    expect(overlap.dropped).toHaveLength(2);
  });
});

describe('runProofread', () => {
  const FOUR = 'Hän sanoi että tulee.\nMinä tiesin että sataa.\nSinä luulit että ehdit.\nMe näimme että ovi oli auki.';
  const FOUR_FIXED = 'Hän sanoi, että tulee.\nMinä tiesin, että sataa.\nSinä luulit, että ehdit.\nMe näimme, että ovi oli auki.';

  test('runProofread runs batches one at a time', async () => {
    const progress = [];
    const { result, batches, calls, stats } = await run(FOUR, fixing(addComma), {
      budget: { maxChars: 2000, maxLines: 2 },
      onProgress: (info) => progress.push(info)
    });
    expect(stats.maxRunning).toBe(1);
    expect(calls.map(call => call.original)).toEqual([
      '[1] Hän sanoi että tulee.\n[2] Minä tiesin että sataa.',
      '[1] Sinä luulit että ehdit.\n[2] Me näimme että ovi oli auki.'
    ]);
    expect(batches.map(batch => [batch.batchIndex, batch.batchCount, batch.changes.length])).toEqual([[0, 2, 2], [1, 2, 2]]);
    expect(batches.every(batch => batch.baseText === FOUR)).toBe(true);
    expect(result).toMatchObject({
      status: 'done', runId: 'ajo-1', model: 'malli-a', baseText: FOUR,
      batchCount: 2, batchesDone: 2, linesSent: 4, linesUnchanged: 0, linesChanged: 4,
      corrections: 4, dialogueCorrections: 0, setAside: [], failedBatches: [],
      skipped: { structural: 0, quote: 0, dialogue: 0, empty: 0, tooLong: 0 }, dashListLines: 0,
      resumeLine: null, error: null, summary: '4 korjausta'
    });
    // The result has the contract's fields and no others
    expect(Object.keys(result).sort()).toEqual([
      'baseText', 'batchCount', 'batchesDone', 'corrections', 'dashListLines', 'dialogueCorrections', 'error',
      'failedBatches', 'linesChanged', 'linesSent', 'linesUnchanged', 'model', 'resumeLine', 'runId', 'setAside',
      'skipped', 'status', 'summary'
    ]);
    expect(Object.keys(batches[0]).sort()).toEqual(['baseText', 'batchCount', 'batchIndex', 'changes', 'setAside']);
    // Progress before and after each batch
    expect(progress[0]).toEqual({ batchIndex: 0, batchCount: 2, linesDone: 0, linesTotal: 4, corrections: 0 });
    expect(progress[progress.length - 1]).toEqual({ batchIndex: 1, batchCount: 2, linesDone: 4, linesTotal: 4, corrections: 4 });
  });

  test('the next batch waits for onBatch', async () => {
    const order = [];
    const model = fakeModel((lines, index) => {
      order.push(`request ${index}`);
      return fixing(addComma)(lines, index);
    });
    await runProofread({
      text: FOUR, deps, meta: { chapterId: 'c1' }, budget: { maxChars: 2000, maxLines: 2 }, request: model.request,
      onBatch: async ({ batchIndex }) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        order.push(`proposed ${batchIndex}`);
      }
    });
    expect(order).toEqual(['request 0', 'proposed 0', 'request 1', 'proposed 1']);
  });

  test('runProofread stops between batches when the signal is aborted and reports resumeLine', async () => {
    const controller = new AbortController();
    const model = fakeModel(fixing(addComma));
    const batches = [];
    const result = await runProofread({
      text: FOUR, deps, meta: { chapterId: 'c1' }, budget: { maxChars: 2000, maxLines: 2 },
      request: model.request, signal: controller.signal,
      onBatch: (batch) => {
        batches.push(batch);
        controller.abort();
      }
    });
    expect(model.calls).toHaveLength(1);
    expect(batches).toHaveLength(1);
    expect(result.status).toBe('stopped');
    expect(result.batchesDone).toBe(1);
    expect(result.corrections).toBe(2);
    expect(result.resumeLine).toEqual({ index: 2, text: 'Sinä luulit että ehdit.' });
    expect(result).not.toHaveProperty('resumeFrom');
    expect(result.summary).toBe('Pysäytetty: 2 korjausta');

    // Aborted before the start: no request at all
    const early = new AbortController();
    early.abort();
    const none = await run(FOUR, fixing(addComma), { signal: early.signal });
    expect(none.calls).toHaveLength(0);
    expect(none.result.status).toBe('stopped');
    expect(none.result.resumeLine).toEqual({ index: 0, text: 'Hän sanoi että tulee.' });
  });

  test('a list line is resumed with its marker', async () => {
    const text = '- maitoa ja leipää\n- voita ja juustoa';
    const { result } = await run(text, () => cancelledResult(), { budget: ONE_PER_BATCH });
    expect(result.resumeLine).toEqual({ index: 0, text: '- maitoa ja leipää' });
    expect(locateLines(`Uusi rivi.\n${text}`, [result.resumeLine]).get('L0')).toEqual({ from: 11, to: 29 });
  });

  test('runProofread reports cancelled requests as stopped', async () => {
    const { result, calls, batches } = await run(FOUR, (lines, index) => (index === 0 ? fixing(addComma)(lines) : cancelledResult()), {
      budget: { maxChars: 2000, maxLines: 2 }
    });
    expect(calls).toHaveLength(2);
    expect(batches).toHaveLength(1);
    expect(result.status).toBe('stopped');
    expect(result.resumeLine).toEqual({ index: 2, text: 'Sinä luulit että ehdit.' });

    // Aborting the signal during a request cancels that request
    const controller = new AbortController();
    let cancels = 0;
    const request = () => {
      let finish;
      const pending = new Promise((resolve) => {
        finish = resolve;
      });
      setTimeout(() => controller.abort(), 5);
      return {
        result: pending,
        cancel: () => {
          cancels += 1;
          finish(cancelledResult());
        }
      };
    };
    const stopped = await runProofread({ text: FOUR, deps, meta: { chapterId: 'c1' }, request, signal: controller.signal });
    expect(cancels).toBe(1);
    expect(stopped.status).toBe('stopped');
    expect(stopped.corrections).toBe(0);
  });

  test('runProofread retries a mostly misaligned batch as two halves, once', async () => {
    // First answer: only one of four lines comes back
    const reply = (lines, index) => (index === 0 ? accepted(`[1] ${addComma(lines[0].text)}`) : fixing(addComma)(lines));
    const { result, calls, changes } = await run(FOUR, reply);
    expect(calls.map(call => call.original)).toEqual([
      '[1] Hän sanoi että tulee.\n[2] Minä tiesin että sataa.\n[3] Sinä luulit että ehdit.\n[4] Me näimme että ovi oli auki.',
      '[1] Hän sanoi että tulee.\n[2] Minä tiesin että sataa.',
      '[1] Sinä luulit että ehdit.\n[2] Me näimme että ovi oli auki.'
    ]);
    expect(apply(FOUR, changes)).toBe(FOUR_FIXED);
    expect(result).toMatchObject({ status: 'done', batchCount: 1, batchesDone: 1, linesSent: 4, corrections: 4, setAside: [] });

    // The halves are not halved again: what is still misaligned is set aside
    const stubborn = await run(FOUR, (lines) => accepted(`[1] ${addComma(lines[0].text)}`));
    expect(stubborn.calls).toHaveLength(3);
    expect(apply(FOUR, stubborn.changes)).toBe('Hän sanoi, että tulee.\nMinä tiesin että sataa.\nSinä luulit, että ehdit.\nMe näimme että ovi oli auki.');
    expect(stubborn.result.setAside.map(aside => [aside.key, aside.reason])).toEqual([['L1', 'missing'], ['L3', 'missing']]);
  });

  test('runProofread sets aside one bad line and keeps the rest of the batch', async () => {
    const reply = (lines) => accepted([
      `[1] ${addComma(lines[0].text)}`,
      `[2] ${addComma(lines[1].text)}`,
      `[2] ${lines[1].text}`,
      `[3] ${addComma(lines[2].text)}`,
      'ja tässä jatkoa.',
      `[4] ${addComma(lines[3].text)}`
    ].join('\n'));
    // Two of four lines are bad: not more than half, so nothing is resent
    const { result, calls, changes, batches } = await run(FOUR, reply);
    expect(calls).toHaveLength(1);
    expect(apply(FOUR, changes)).toBe('Hän sanoi, että tulee.\nMinä tiesin että sataa.\nSinä luulit että ehdit.\nMe näimme, että ovi oli auki.');
    expect(result.setAside).toEqual([
      { key: 'L1', from: 22, to: 45, original: 'Minä tiesin että sataa.', revised: null, reason: 'duplicate', ratio: null },
      { key: 'L2', from: 46, to: 69, original: 'Sinä luulit että ehdit.', revised: null, reason: 'split', ratio: null }
    ]);
    expect(batches[0].setAside).toEqual(result.setAside);
    expect(result).toMatchObject({ corrections: 2, linesChanged: 2, linesUnchanged: 0, summary: '2 korjausta, 2 riviä ohitettu' });
    for (const aside of result.setAside) expect(FOUR.slice(aside.from, aside.to)).toBe(aside.original);
  });

  test('a rewritten line is set aside with the model\'s version and its ratio', async () => {
    const text = 'Aamulla järvi oli tyyni kuin lasi ja sumu nousi hitaasti.\nHän sanoi että tulee.';
    const reply = (lines) => accepted(`[1] Varhain aamulla vesi lepäsi peilityynenä, ja usva kohosi verkkaan rannasta.\n[2] ${addComma(lines[1].text)}`);
    const { result, changes } = await run(text, reply);
    expect(changes).toHaveLength(1);
    expect(result.setAside).toHaveLength(1);
    expect(result.setAside[0]).toMatchObject({
      key: 'L0', reason: 'rewritten', original: 'Aamulla järvi oli tyyni kuin lasi ja sumu nousi hitaasti.',
      revised: 'Varhain aamulla vesi lepäsi peilityynenä, ja usva kohosi verkkaan rannasta.'
    });
    expect(result.setAside[0].ratio).toBeGreaterThan(0.3);
  });

  test('an answer that is not accepted is rejected whole and resent once as two halves', async () => {
    const reply = (lines, index) => (index === 0
      ? rejected('max_tokens', 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.')
      : fixing(addComma)(lines));
    const { result, calls, changes, batches } = await run(FOUR, reply);
    expect(calls.map(call => sentLines(call).length)).toEqual([4, 2, 2]);
    expect(batches).toHaveLength(1);
    expect(apply(FOUR, changes)).toBe(FOUR_FIXED);
    expect(result).toMatchObject({ status: 'done', batchesDone: 1, corrections: 4, setAside: [], failedBatches: [] });

    // Every kind of unaccepted answer is treated the same way
    for (const reason of ['reasoning_exhausted', 'missing_tag', 'empty', 'stop_reason', 'refusal', 'prompt_truncated']) {
      const again = await run(FOUR, (lines, index) => (index === 0 ? rejected(reason, 'Ei ehdotusta.') : fixing(addComma)(lines)));
      expect(again.calls).toHaveLength(3);
      expect(again.result.corrections).toBe(4);
    }
  });

  test('after the halves fail too, the lines are set aside as truncated and nothing is proposed', async () => {
    const { result, calls, changes, batches } = await run(FOUR, () => rejected('max_tokens', 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.'));
    expect(calls).toHaveLength(3);
    expect(changes).toEqual([]);
    expect(batches).toHaveLength(1);
    expect(result.setAside.map(aside => [aside.key, aside.reason, aside.revised])).toEqual([
      ['L0', 'truncated', null], ['L1', 'truncated', null], ['L2', 'truncated', null], ['L3', 'truncated', null]
    ]);
    expect(result).toMatchObject({ status: 'done', corrections: 0, linesChanged: 0, summary: 'Ei korjattavaa, 4 riviä ohitettu' });

    // One half comes through: its lines are used, the other half is set aside
    const half = await run(FOUR, (lines, index) => (index === 2 ? fixing(addComma)(lines) : rejected('missing_tag', 'Ei ehdotusta.')));
    expect(apply(FOUR, half.changes)).toBe('Hän sanoi että tulee.\nMinä tiesin että sataa.\nSinä luulit, että ehdit.\nMe näimme, että ovi oli auki.');
    expect(half.result.setAside.map(aside => aside.key)).toEqual(['L0', 'L1']);

    // A batch of one line cannot be halved
    const single = await run('Hän sanoi että tulee.', () => rejected('max_tokens', 'Ei ehdotusta.'));
    expect(single.calls).toHaveLength(1);
    expect(single.result.setAside.map(aside => aside.reason)).toEqual(['truncated']);
  });

  test('runProofread sends temperature 0, the masked payload as original and no thinking option', async () => {
    const text = 'Juna lähti [TODO: tarkista aika] ja tiesin että <u>vaunu</u> oli tyhjä.\n- maitoa ja leipää';
    const { calls, result } = await run(text, echo, { options: { keepNote: 'murre' } });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    const payload = '[1] Juna lähti ⟦1⟧ ja tiesin että ⟦2⟧vaunu⟦3⟧ oli tyhjä.\n[2] maitoa ja leipää';
    expect(call.original).toBe(payload);
    expect(call.temperature).toBe(0);
    expect(call).not.toHaveProperty('thinking');
    expect(call.maxTokens).toBe(answerTokensForBatch(payload.length));
    expect(call.meta).toEqual({ action: 'proofread', actionLabel: 'Kielenhuolto', instruction: '', chapterId: 'c1', runId: 'ajo-1' });
    expect(Object.keys(call).sort()).toEqual(['maxTokens', 'messages', 'meta', 'original', 'system', 'temperature']);
    // The notes and tags themselves never leave the app
    expect(JSON.stringify(call)).not.toContain('TODO');
    expect(JSON.stringify(call)).not.toContain('<u>');
    expect(call.system).toContain('Kirjoittaja on merkinnyt nämä tahallisiksi, älä korjaa niitä: murre');
    expect(result).toMatchObject({ status: 'done', linesSent: 2, linesUnchanged: 2, corrections: 0, summary: 'Ei korjattavaa' });
  });

  test('runProofread uses build when it is given and the plain layout when it is not', async () => {
    const plain = await run('Hän sanoi että tulee.', echo);
    const task = proofreadTask(selectProofLines('Hän sanoi että tulee.', {}, deps).lines, PROOFREAD_DEFAULTS, deps);
    expect(plain.calls[0].system).toBe(renderProofreadRequest(task).system);
    expect(plain.calls[0].messages).toEqual(renderProofreadRequest(task).messages);

    const tasks = [];
    const build = (given) => {
      tasks.push(given);
      return { system: 'RAKENTAJAN JÄRJESTELMÄVIESTI', messages: [{ role: 'user', content: `<kappaleet>\n${given.payload}\n</kappaleet>` }], blocked: null, overBudget: false };
    };
    const built = await run('Hän sanoi että tulee.', fixing(addComma), { build });
    expect(tasks).toEqual([task]);
    expect(built.calls[0].system).toBe('RAKENTAJAN JÄRJESTELMÄVIESTI');
    expect(built.calls[0].messages).toEqual([{ role: 'user', content: '<kappaleet>\n[1] Hän sanoi että tulee.\n</kappaleet>' }]);
    expect(built.calls[0].maxTokens).toBe(task.answerTokens);
    expect(built.result.corrections).toBe(1);
    // A builder may be asynchronous
    const later = await run('Hän sanoi että tulee.', fixing(addComma), { build: async (given) => build(given) });
    expect(later.result.corrections).toBe(1);
  });

  test('a blocked or over-budget build sends nothing and fails the batch with the reason', async () => {
    const blocked = await run(FOUR, echo, {
      budget: ONE_PER_BATCH,
      build: () => ({ system: '', messages: [], blocked: 'noAI', overBudget: false })
    });
    expect(blocked.calls).toHaveLength(0);
    expect(blocked.result.status).toBe('failed');
    expect(blocked.result.linesSent).toBe(0);
    expect(blocked.result.failedBatches).toEqual([
      { index: 0, reason: 'noAI', message: 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.' },
      { index: 1, reason: 'noAI', message: 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.' }
    ]);
    expect(blocked.result.error).toBe('Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.');

    const over = await run('Hän sanoi että tulee.', echo, {
      build: () => ({ system: 's', messages: [], blocked: null, overBudget: true, totalTokens: 9000, budgetTokens: 4000 })
    });
    expect(over.calls).toHaveLength(0);
    expect(over.result.failedBatches).toEqual([{ index: 0, reason: 'over_budget', message: 'Erä ei mahdu mallin ikkunaan: noin 9\u00A0000 tokenia, tilaa 4\u00A0000.' }]);
    expect(over.result.status).toBe('failed');
  });

  test('runProofread continues after one failed batch and fails after two in a row', async () => {
    const text = `${FOUR}\nHe kuulivat että juna tuli.`;
    const fates = ['error', 'ok', 'error', 'error', 'ok'];
    const reply = (lines, index) => (fates[index] === 'ok' ? fixing(addComma)(lines) : errored(`yhteys katkesi ${index}`));
    const { result, calls, changes } = await run(text, reply, { budget: ONE_PER_BATCH });
    expect(calls).toHaveLength(4);
    expect(result.status).toBe('failed');
    expect(result.failedBatches).toEqual([
      { index: 0, reason: 'network', message: 'Ei ehdotusta: yhteys katkesi 0' },
      { index: 2, reason: 'network', message: 'Ei ehdotusta: yhteys katkesi 2' },
      { index: 3, reason: 'network', message: 'Ei ehdotusta: yhteys katkesi 3' }
    ]);
    expect(result.error).toBe('Ei ehdotusta: yhteys katkesi 3');
    expect(result.batchesDone).toBe(1);
    expect(apply(text, changes)).toBe(text.replace('Minä tiesin että', 'Minä tiesin, että'));
    // "Jatka" starts from the first line of the two failed batches
    expect(result.resumeLine).toEqual({ index: 2, text: 'Sinä luulit että ehdit.' });
    expect(result.summary).toBe('Keskeytyi virheeseen: 1 korjaus');

    // Failures that are not in a row do not end the run
    const patchy = await run(FOUR, (lines, index) => (index % 2 === 0 ? errored('katko') : fixing(addComma)(lines)), { budget: ONE_PER_BATCH });
    expect(patchy.calls).toHaveLength(4);
    expect(patchy.result.status).toBe('done');
    expect(patchy.result.failedBatches.map(batch => batch.index)).toEqual([0, 2]);
    expect(patchy.result.corrections).toBe(2);
    expect(patchy.result.resumeLine).toBeNull();

    // A request promise that rejects is a failed batch too, not a crash
    const rejecting = await runProofread({
      text: FOUR, deps, meta: { chapterId: 'c1' }, budget: { maxChars: 2000, maxLines: 2 },
      request: () => ({ result: Promise.reject(new Error('putki poikki')), cancel() {} })
    });
    expect(rejecting.status).toBe('failed');
    // The raw exception text never reaches the screen
    expect(rejecting.error).toBe('Pyyntö epäonnistui.');
    // …and so is a request function that throws at once
    const throwing = await runProofread({
      text: FOUR, deps, meta: { chapterId: 'c1' }, budget: { maxChars: 2000, maxLines: 2 },
      request: () => {
        throw new Error('asiakas ei ole valmis');
      }
    });
    expect(throwing).toMatchObject({ status: 'failed', error: 'Pyyntö epäonnistui.', linesSent: 0 });
    expect(throwing.failedBatches).toHaveLength(2);
  });

  test('a run whose only batch fails is failed, not "Ei korjattavaa"', async () => {
    const { result } = await run('Hän sanoi että tulee.', () => errored('yhteys katkesi'));
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Ei ehdotusta: yhteys katkesi');
    expect(result.resumeLine).toEqual({ index: 0, text: 'Hän sanoi että tulee.' });
    expect(result.summary).toBe('Keskeytyi virheeseen: Ei korjattavaa');
  });

  test('runProofread never changes a heading, a list line, a scene break, a TODO note or a <u> tag when the fake model rewrites every line it gets', async () => {
    const text = [
      '# Ensimmäinen luku',
      '',
      'Lyhyt rivi [TODO: tarkista] tässä.',
      'Aamulla järvi oli <u>tyyni</u> kuin lasi ja sumu nousi hitaasti vastarannalta.',
      '- maitoa ja leipää',
      '2. toinen kohta',
      '> Lainattu rivi.',
      '',
      '* * *',
      '',
      '## Väliotsikko',
      '– Minä tulen [TODO: milloin?] kohta.',
      '---',
      'Viimeinen <u>sana</u>.'
    ].join('\n');

    // The model shouts, throws the placeholders away, and tries a heading, a list and a note of its own
    const vandal = (lines) => accepted(lines.map((line) => {
      const bare = line.text.replace(/⟦\/?\d+⟧/g, '').toUpperCase();
      const tricks = ['# ', '- ', '', '[TODO: MALLIN OMA] ', '<u>'];
      return `[${line.n}] ${tricks[line.n % tricks.length]}${bare}`;
    }).join('\n'));

    for (const options of [{}, { skipQuoteLines: false }, { dashDialogue: true }]) {
      const { result, changes } = await run(text, vandal, { options, budget: { maxChars: 2000, maxLines: 3 } });
      expect(result.status).toBe('done');
      const after = apply(text, changes);
      const beforeLines = text.split('\n');
      const afterLines = after.split('\n');
      expect(afterLines).toHaveLength(beforeLines.length);

      beforeLines.forEach((line, index) => {
        // Headings and scene breaks: untouched
        if (/^#{1,6}\s/.test(line) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) expect(afterLines[index]).toBe(line);
        // List and quote markers: untouched
        const marker = /^(\s*(?:[-*+]|\d+[.)])\s+|>\s?)/.exec(line);
        if (marker) expect(afterLines[index].startsWith(marker[0])).toBe(true);
        // A line never becomes a structural line
        expect(/^#{1,6}\s/.test(afterLines[index])).toBe(/^#{1,6}\s/.test(line));
      });
      // Notes and tags: the same ones in the same order
      const marks = (value) => value.match(/\[TODO:[^\]\n]*\]|<\/?u>/g);
      expect(marks(after)).toEqual(marks(text));
      // No change sits on a heading, a scene break or a marker
      for (const change of changes) {
        const line = splitBlocks(text).find(block => change.from >= block.from && change.to <= block.to);
        expect(['paragraph', 'list', 'quote']).toContain(line.kind);
        expect(change.from).toBeGreaterThanOrEqual(line.bodyFrom);
      }
      // The run did change something: the test is not passing on an empty result
      expect(changes.length + result.setAside.length).toBeGreaterThan(3);
    }
  });

  test('a change the guard refuses sets its line aside as protected', async () => {
    // A diff that tries to put a heading marker in front of a paragraph
    const sly = { ...deps, wordDiff: (original, revised) => [{ from: 0, to: 0, insert: '# ', original: '' }, ...wordDiff(original, revised)] };
    const text = 'Hän sanoi että tulee.\nMinä tiesin että sataa.';
    const model = fakeModel((lines) => accepted(`[1] ${addComma(lines[0].text)}\n[2] ${lines[1].text}`));
    const batches = [];
    const result = await runProofread({ text, deps: sly, meta: { chapterId: 'c1' }, request: model.request, onBatch: (batch) => batches.push(batch) });
    expect(batches[0].changes).toEqual([]);
    expect(result.setAside).toEqual([
      { key: 'L0', from: 0, to: 21, original: 'Hän sanoi että tulee.', revised: 'Hän sanoi, että tulee.', reason: 'protected', ratio: expect.any(Number) }
    ]);
    expect(result.corrections).toBe(0);
  });

  test('runProofread makes no request for a chapter with only headings', async () => {
    const onProgress = jest.fn();
    const { result, calls, batches } = await run('# Otsikko\n\n## Toinen otsikko\n\n* * *\n\n[TODO: kirjoita]', echo, { onProgress });
    expect(calls).toHaveLength(0);
    expect(batches).toHaveLength(0);
    expect(result).toMatchObject({
      status: 'done', model: null, batchCount: 0, batchesDone: 0, linesSent: 0, linesUnchanged: 0, linesChanged: 0,
      corrections: 0, dialogueCorrections: 0, setAside: [], failedBatches: [], resumeLine: null, error: null,
      skipped: { structural: 3, quote: 0, dialogue: 0, empty: 1, tooLong: 0 }, summary: 'Ei korjattavaa'
    });
    const empty = await run('', echo);
    expect(empty.calls).toHaveLength(0);
    expect(empty.result.status).toBe('done');
  });

  test('runProofread drops changes outside the range', async () => {
    const text = 'Hän sanoi että tulee, ja minä tiesin että sataa.\nSinä luulit että ehdit.';
    const from = text.indexOf('ja minä');
    const to = text.indexOf('sataa.') + 'sataa.'.length;
    const everyComma = fixing(line => line.replace(/ että/g, ', että'));
    const { result, calls, changes } = await run(text, everyComma, { options: { range: { from, to } } });
    // The whole first line is sent, the second line is not
    expect(calls.map(call => call.original)).toEqual(['[1] Hän sanoi että tulee, ja minä tiesin että sataa.']);
    expect(changes).toHaveLength(1);
    expect(changes[0].from).toBeGreaterThanOrEqual(from);
    expect(changes[0].to).toBeLessThanOrEqual(to);
    expect(apply(text, changes)).toBe('Hän sanoi että tulee, ja minä tiesin, että sataa.\nSinä luulit että ehdit.');
    expect(result).toMatchObject({ corrections: 1, linesChanged: 1, linesSent: 1 });

    // A line whose every change falls outside the range counts as unchanged
    const none = await run(text, everyComma, { options: { range: { from: 0, to: 5 } } });
    expect(none.changes).toEqual([]);
    expect(none.result).toMatchObject({ corrections: 0, linesChanged: 0, linesUnchanged: 1 });
  });

  test('every change carries source, runId and the line\'s original and revised text', async () => {
    const text = [
      'Hän sanoi että tulee ja tiesi että myöhästyy.',
      '– Mä tiedän että sä tuut.',
      'Hän sanoi: ”Luulin että ehdit”, ja minä uskoin että niin oli.',
      '- sanoin että tulen'
    ].join('\n');
    const { changes, result } = await run(text, fixing(line => line.replace(/ että/g, ', että')), { options: { dashDialogue: true } });
    expect(changes).toHaveLength(6);
    for (const change of changes) {
      expect(Object.keys(change).sort()).toEqual(['from', 'insert', 'meta', 'original', 'to']);
      expect(change.original).toBe(text.slice(change.from, change.to));
      expect(change.meta).toMatchObject({
        source: 'faust', action: 'proofread', actionLabel: 'Kielenhuolto', instruction: '',
        provider: 'cherry', model: 'malli-a', requestLogId: 'log-7', runId: 'ajo-1'
      });
      expect(Object.keys(change.meta).sort()).toEqual(
        ['action', 'actionLabel', 'dialogue', 'instruction', 'line', 'model', 'provider', 'requestLogId', 'runId', 'source']);
      expect(typeof change.meta.dialogue).toBe('boolean');
    }
    // One shared line object per line, with what "Miksi?" needs
    expect(changes[0].meta.line).toEqual({
      key: 'L0', original: 'Hän sanoi että tulee ja tiesi että myöhästyy.', revised: 'Hän sanoi, että tulee ja tiesi, että myöhästyy.'
    });
    expect(changes[1].meta.line).toBe(changes[0].meta.line);
    expect(changes[3].meta.line).toEqual({
      key: 'L2', original: 'Hän sanoi: ”Luulin että ehdit”, ja minä uskoin että niin oli.',
      revised: 'Hän sanoi: ”Luulin, että ehdit”, ja minä uskoin, että niin oli.'
    });
    expect(changes[5].meta.line.original).toBe('sanoin että tulen');

    // dialogue: a dialogue line, the inside of quotation marks, a "- " line with dashDialogue
    expect(changes.map(change => change.meta.dialogue)).toEqual([false, false, true, true, false, true]);
    expect(result.corrections).toBe(6);
    expect(result.dialogueCorrections).toBe(3);

    // Without dashDialogue the "- " line is a plain list item
    const plain = await run(text, fixing(line => line.replace(/ että/g, ', että')));
    expect(plain.changes.map(change => change.meta.dialogue)).toEqual([false, false, true, true, false, false]);
    expect(plain.result.dialogueCorrections).toBe(2);

    // A run without a runId makes one, the same for every change
    const model = fakeModel(fixing(addComma));
    const seen = [];
    const auto = await runProofread({ text: FOUR, deps, request: model.request, onBatch: (batch) => seen.push(...batch.changes) });
    expect(auto.runId).toMatch(/\S+/);
    expect(new Set(seen.map(change => change.meta.runId))).toEqual(new Set([auto.runId]));
    expect(model.calls[0].meta.chapterId).toBeNull();
  });

  test('every change is an offset in the run-start text, also in the second batch', async () => {
    const text = '# Luku\n\n- sanoin että tulen\n\nMinä tiesin että sataa.\n> lainaus\nSinä luulit että ehdit.';
    const accepts = [];
    const model = fakeModel(fixing(addComma));
    const result = await runProofread({
      text, deps, meta: { chapterId: 'c1' }, budget: ONE_PER_BATCH, request: model.request,
      onBatch: ({ changes, baseText }) => {
        // The author accepts each batch at once: the document moves on, the run's frame does not
        accepts.push({ changes, baseText });
      }
    });
    expect(model.calls).toHaveLength(3);
    expect(accepts.map(batch => batch.baseText)).toEqual([text, text, text]);
    expect(result.baseText).toBe(text);

    const all = accepts.flatMap(batch => batch.changes);
    expect(all).toHaveLength(3);
    // Insert-only changes: each one sits right before " että" of its own line in the run-start text
    for (const change of all) {
      expect(change).toMatchObject({ insert: ',', original: '' });
      expect(change.from).toBe(change.to);
      expect(text.slice(change.from, change.from + 5)).toBe(' että');
    }
    expect(all.map(change => change.from)).toEqual([16, 40, 74]);
    expect(apply(text, all)).toBe('# Luku\n\n- sanoin, että tulen\n\nMinä tiesin, että sataa.\n> lainaus\nSinä luulit, että ehdit.');
    // Applying the second batch alone lands on the second line, whatever happened to the first
    expect(apply(text, accepts[1].changes)).toBe(text.replace('Minä tiesin että', 'Minä tiesin, että'));
  });

  test('runProofread never asks for another text', async () => {
    const getText = jest.fn(() => {
      throw new Error('the run must not read the editor');
    });
    const { result, changes } = await run(FOUR, fixing(addComma), { getText, budget: { maxChars: 2000, maxLines: 2 } });
    expect(getText).not.toHaveBeenCalled();
    expect(result.status).toBe('done');
    expect(apply(FOUR, changes)).toBe(FOUR_FIXED);
  });

  test('a change that onBatch reports as target-changed sets its line aside as moved and is not counted', async () => {
    const text = 'Hän sanoi että tulee ja tiesi että myöhästyy.\n– Mä tiedän että sä tuut.\nMinä tiesin että sataa.';
    const model = fakeModel(fixing(line => line.replace(/ että/g, ', että')));
    const seen = [];
    let given = null;
    const result = await runProofread({
      text, deps, meta: { chapterId: 'c1' }, runId: 'ajo-1', request: model.request,
      onBatch: async ({ changes, setAside }) => {
        seen.push(...changes);
        given = setAside;
        // The suggestion layer could not place three of the four: the author had edited those places
        return {
          skipped: [
            { index: 0, reason: 'target-changed' },
            { index: 1, reason: 'mismatch' },
            { index: 2, reason: 'target-changed' },
            { index: 99, reason: 'target-changed' }
          ]
        };
      }
    });
    expect(seen).toHaveLength(4);
    expect(result.corrections).toBe(1);
    expect(result.dialogueCorrections).toBe(0);
    expect(result.linesChanged).toBe(1);
    // Each line once, however many of its changes were skipped
    expect(result.setAside).toEqual([
      { key: 'L0', from: 0, to: 45, original: 'Hän sanoi että tulee ja tiesi että myöhästyy.', revised: 'Hän sanoi, että tulee ja tiesi, että myöhästyy.', reason: 'moved', ratio: expect.any(Number) },
      { key: 'L1', from: 46, to: 71, original: '– Mä tiedän että sä tuut.', revised: '– Mä tiedän, että sä tuut.', reason: 'moved', ratio: expect.any(Number) }
    ]);
    expect(result.summary).toBe('1 korjaus, 2 riviä ohitettu');
    // The list that onBatch got is not touched afterwards: the moved lines are in the result only
    expect(given).toEqual([]);

    // A change skipped for another reason is not counted, and its line is not "moved"
    const other = await run(FOUR, fixing(addComma), {
      onBatch: () => ({ skipped: [{ index: 1, reason: 'conflict' }, { index: 2, reason: 'overlap' }] })
    });
    expect(other.result.corrections).toBe(2);
    expect(other.result.linesChanged).toBe(2);
    expect(other.result.setAside).toEqual([]);
  });

  test('a change from a known word to an unknown one sets the line aside as suspect', async () => {
    const text = 'Isoisän verstaassa tuoksui terva.\nHöylät riippui seinällä.\nHän sanoi että tulee.';
    const reply = (lines) => accepted([
      `[1] ${lines[0].text.replace('Isoisän', 'Isäisän')}`,
      `[2] ${lines[1].text.replace('riippui', 'riippuivat')}`,
      `[3] ${addComma(lines[2].text)}`
    ].join('\n'));
    const checkWords = jest.fn(async (words) => Object.fromEntries(words.map(word => [word, word !== 'Isäisän'])));
    const { result, changes } = await run(text, reply, { checkWords });

    // Asked once for the batch, with the words of the one-word changes only
    expect(checkWords).toHaveBeenCalledTimes(1);
    expect([...checkWords.mock.calls[0][0]].sort()).toEqual(['Isoisän', 'Isäisän', 'riippui', 'riippuivat'].sort());
    expect(result.setAside).toEqual([{
      key: 'L0', from: 0, to: 33, original: 'Isoisän verstaassa tuoksui terva.', revised: 'Isäisän verstaassa tuoksui terva.',
      reason: 'suspect', ratio: expect.any(Number)
    }]);
    expect(apply(text, changes)).toBe('Isoisän verstaassa tuoksui terva.\nHöylät riippuivat seinällä.\nHän sanoi, että tulee.');
    expect(result.corrections).toBe(2);

    // Unknown to unknown (a name, a dialect word) and known to known are left alone
    const lenient = await run('Mummo kaatoi kahiva kuppiin.', fixing(line => line.replace('kahiva', 'kahvia')), {
      checkWords: async () => ({ kahiva: false, kahvia: true })
    });
    expect(lenient.result.setAside).toEqual([]);
    expect(lenient.result.corrections).toBe(1);
    const unknownToUnknown = await run('Mummo kaatoi kahiva kuppiin.', fixing(line => line.replace('kahiva', 'kahivaa')), {
      checkWords: async () => ({ kahiva: false, kahivaa: false })
    });
    expect(unknownToUnknown.result.setAside).toEqual([]);
    expect(unknownToUnknown.result.corrections).toBe(1);
    const knownToKnown = await run('Höylät riippui seinällä.', fixing(line => line.replace('riippui', 'riippuivat')), {
      checkWords: async () => ({ riippui: true, riippuivat: true })
    });
    expect(knownToKnown.result.setAside).toEqual([]);
    expect(knownToKnown.result.corrections).toBe(1);
    // No answer for the new word is not "unknown": the line is proposed
    const silent = await run('Isoisän verstaassa tuoksui terva.', fixing(line => line.replace('Isoisän', 'Isäisän')), {
      checkWords: async () => ({ Isoisän: true })
    });
    expect(silent.result.setAside).toEqual([]);
    expect(silent.result.corrections).toBe(1);
    // The same word pair twice in a batch: each word is asked once
    const twice = jest.fn(async () => ({}));
    await run('Höylät riippui seinällä.\nSahat riippui naulassa.', fixing(line => line.replace('riippui', 'riippuivat')), { checkWords: twice });
    expect(twice).toHaveBeenCalledTimes(1);
    expect(twice.mock.calls[0][0]).toEqual(['riippui', 'riippuivat']);

    // A checker that fails, or answers nonsense, switches the guard off for that batch
    for (const broken of [async () => { throw new Error('Voikko kaatui'); }, () => { throw new Error('heti'); }, async () => null]) {
      const unguarded = await run(text, reply, { checkWords: broken });
      expect(unguarded.result.status).toBe('done');
      expect(unguarded.result.setAside).toEqual([]);
      expect(unguarded.result.corrections).toBe(3);
    }
  });

  test('without checkWords nothing is asked', async () => {
    const text = 'Isoisän verstaassa tuoksui terva.';
    const { result, changes } = await run(text, fixing(line => line.replace('Isoisän', 'Isäisän')));
    expect(result.setAside).toEqual([]);
    expect(apply(text, changes)).toBe('Isäisän verstaassa tuoksui terva.');

    // With a checker, but no one-word change in the batch: the checker is not called
    const checkWords = jest.fn(async () => ({}));
    await run('Hän sanoi että tulee.', fixing(addComma), { checkWords });
    expect(checkWords).not.toHaveBeenCalled();
  });
});

describe('"Miksi?"', () => {
  const plainRequest = (text, extra = {}) => {
    const calls = [];
    const request = (opts) => {
      calls.push(opts);
      return { result: Promise.resolve({ ok: true, cancelled: false, text, ...extra }), cancel() {} };
    };
    return { request, calls };
  };
  const CHANGE = { original: 'Hän sanoi että tulee.', revised: 'Hän sanoi, että tulee.', before: '', after: ',' };

  test('explainChange returns one sentence of at most 240 characters', async () => {
    const model = plainRequest(' Että-sivulauseen eteen tulee pilkku, esim. tässä. Toinen virke, jota ei näytetä. Kolmas jää kesk');
    const answer = await explainChange({ ...CHANGE, request: model.request, deps });
    expect(answer).toEqual({ ok: true, text: 'Että-sivulauseen eteen tulee pilkku, esim. tässä.' });

    // The request: the explain prompt, thinking off, its own action
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0]).toEqual({
      ...buildExplainRequest(CHANGE),
      thinking: 'off',
      meta: { action: 'proofread-explain', actionLabel: 'Miksi?', instruction: '' }
    });

    const long = await explainChange({ ...CHANGE, request: plainRequest(`${'Hyvin pitkä perustelu '.repeat(20)}loppuu tähän.`).request, deps });
    expect(long.ok).toBe(true);
    expect(long.text.length).toBeLessThanOrEqual(240);
    expect(long.text.endsWith('…')).toBe(true);

    // An answer without a full stop is still shown
    const bare = await explainChange({ ...CHANGE, request: plainRequest('Pilkku erottaa sivulauseen').request, deps });
    expect(bare).toEqual({ ok: true, text: 'Pilkku erottaa sivulauseen' });
  });

  test('explainChange does not end the sentence at an abbreviation or a list number', async () => {
    // The sentence splitter of src/editor/sentences.js (the lazy default) knows the abbreviations
    for (const [answer, expected] of [
      ['Sana kirjoitetaan yhteen, ks. Kielitoimiston ohjepankki. Toinen virke.', 'Sana kirjoitetaan yhteen, ks. Kielitoimiston ohjepankki.'],
      ['Yhdyssana kirjoitetaan yhteen (esim. Helsingin Sanomat käyttää samaa muotoa).', 'Yhdyssana kirjoitetaan yhteen (esim. Helsingin Sanomat käyttää samaa muotoa).'],
      ['Erisnimi alkaa isolla, esim. Helsinki. Muuta ei tarvita.', 'Erisnimi alkaa isolla, esim. Helsinki.'],
      ['1. Pilkku tulee sivulauseen eteen.', 'Pilkku tulee sivulauseen eteen.']
    ]) {
      const answered = await explainChange({ ...CHANGE, request: plainRequest(answer).request, deps });
      expect([answer, answered]).toEqual([answer, { ok: true, text: expected }]);
    }
    // An injected splitter is used; when it finds nothing the plain pattern decides
    const splitSentences = jest.fn(() => []);
    const fallback = await explainChange({ ...CHANGE, request: plainRequest('Pilkku puuttui. Toinen.').request, deps: { ...deps, splitSentences } });
    expect(splitSentences).toHaveBeenCalled();
    expect(fallback).toEqual({ ok: true, text: 'Pilkku puuttui.' });
  });

  test('explainChange never cuts an emoji in half and turns a throwing request into a failure', async () => {
    const answer = `${'a'.repeat(238)}\u{1F600}${'b'.repeat(20)}.`;
    const cut = await explainChange({ ...CHANGE, request: plainRequest(answer).request, deps });
    expect(cut.ok).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(240);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(cut.text)).toBe(false);
    expect(cut.text).toBe(`${'a'.repeat(238)}…`);

    const throwing = await explainChange({ ...CHANGE, deps, request: () => { throw new Error('boom'); } });
    expect(throwing).toEqual({ ok: false, reason: 'error', message: 'Perustelua ei saatu.' });
    const rejecting = await explainChange({ ...CHANGE, deps, request: () => ({ result: Promise.reject(new Error('late')), cancel() {} }) });
    expect(rejecting).toEqual({ ok: false, reason: 'error', message: 'Perustelua ei saatu.' });
  });

  test('explainChange asks once per change when it has a cache', async () => {
    const cache = new Map();
    const model = plainRequest('Sivulauseen eteen tulee pilkku.');
    const first = await explainChange({ ...CHANGE, request: model.request, deps, cache });
    const second = await explainChange({ ...CHANGE, request: model.request, deps, cache });
    expect(second).toEqual(first);
    expect(model.calls).toHaveLength(1);
    expect([...cache]).toEqual([['Hän sanoi että tulee.\u0000\u0000,', 'Sivulauseen eteen tulee pilkku.']]);
    // Another change on the same line is another question
    await explainChange({ ...CHANGE, before: 'tulee', after: 'tulisi', request: model.request, deps, cache });
    expect(model.calls).toHaveLength(2);
  });

  test('explainChange reports an error, a cancelled request and an empty answer', async () => {
    const failing = (result) => ({ result: Promise.resolve(result), cancel() {} });
    const cache = new Map();
    expect(await explainChange({ ...CHANGE, deps, cache, request: () => failing({ ok: false, cancelled: false, text: '', error: { code: 'network', message: 'Yhteys katkesi.' } }) }))
      .toEqual({ ok: false, reason: 'error', message: 'Yhteys katkesi.' });
    expect(await explainChange({ ...CHANGE, deps, cache, request: () => failing({ ok: true, cancelled: true, text: '' }) }))
      .toEqual({ ok: false, reason: 'cancelled', message: 'Pyyntö pysäytettiin.' });
    expect(await explainChange({ ...CHANGE, deps, cache, request: () => failing({ ok: true, cancelled: false, text: '  \n ' }) }))
      .toEqual({ ok: false, reason: 'empty', message: 'Perustelua ei saatu.' });
    // A failure is not remembered
    expect(cache.size).toBe(0);
  });

  test('buildExplainRequest words an insertion and a deletion correctly', () => {
    expect(EXPLAIN_SYSTEM).toBe('Olet suomen kielen oikolukija. Perustele yksi tekstiin tehty korjaus yhdellä lyhyellä suomenkielisellä virkkeellä. Älä ehdota muita muutoksia äläkä toista tekstiä.');
    const replace = buildExplainRequest({ original: 'Hyllyt notkui.', revised: 'Hyllyt notkuivat.', before: 'notkui', after: 'notkuivat' });
    expect(replace).toEqual({
      system: EXPLAIN_SYSTEM,
      messages: [{
        role: 'user',
        content: 'Alkuperäinen rivi: Hyllyt notkui.\nKorjattu rivi: Hyllyt notkuivat.\nMuutos: ”notkui” → ”notkuivat”\nMiksi tämä muutos tehtiin?'
      }],
      maxTokens: 300,
      temperature: 0
    });
    expect(buildExplainRequest(CHANGE).messages[0].content.split('\n')[2]).toBe('Muutos: lisätty ”,”');
    expect(buildExplainRequest({ original: 'a, b', revised: 'a b', before: ',', after: '' }).messages[0].content.split('\n')[2]).toBe('Muutos: poistettu ”,”');
  });

  test('Miksi? never sends a [TODO: …] note of the line, which the run itself kept home (I-06 review)', async () => {
    const text = 'Otsikko\n\nHän sanoi että satoi [TODO: salainen muistiinpano kustantajalle] ja oli kylmä.\n';
    const { calls, changes } = await run(text, fixing(addComma));
    // The run masked the note
    expect(JSON.stringify(calls)).not.toContain('salainen muistiinpano');
    expect(changes).toHaveLength(1);
    const change = changes[0];
    // meta.line holds the author's line as it is (the bar shows it); the request is what must not
    expect(change.meta.line.original).toContain('[TODO: salainen muistiinpano kustantajalle]');

    // As app.js asks it: the line's original and revised text, the change's two sides
    const model = plainRequest('Että-sivulauseen eteen tulee pilkku.');
    const answer = await explainChange({
      original: change.meta.line.original,
      revised: change.meta.line.revised,
      before: change.original,
      after: change.insert,
      request: model.request,
      deps
    });
    expect(answer.ok).toBe(true);
    const sent = JSON.stringify(model.calls[0]);
    expect(sent).not.toContain('salainen muistiinpano');
    expect(sent).not.toContain('[TODO:');
    expect(model.calls[0].messages[0].content).toBe(
      'Alkuperäinen rivi: Hän sanoi että satoi ja oli kylmä.\nKorjattu rivi: Hän sanoi, että satoi ja oli kylmä.\nMuutos: lisätty ”,”\nMiksi tämä muutos tehtiin?'
    );
    // An injected stripTodos is used
    const stripTodos = jest.fn((value) => value.replace(/\[TODO:[^\]\n]*\]/g, '[muistutus]'));
    expect(buildExplainRequest({ original: 'a [TODO: x] b', revised: 'a, [TODO: x] b', before: '', after: ',' }, { stripTodos }).messages[0].content.split('\n')[0])
      .toBe('Alkuperäinen rivi: a [muistutus] b');
  });
});

describe('summary and the model caveat', () => {
  test('summaryLine: Ei korjattavaa, 1 korjaus, 37 korjausta, 2 riviä ohitettu, Pysäytetty: 5 korjausta', () => {
    const aside = (count) => Array.from({ length: count }, () => ({}));
    expect(summaryLine({ status: 'done', corrections: 0, setAside: [] })).toBe('Ei korjattavaa');
    expect(summaryLine({ status: 'done', corrections: 1, setAside: [] })).toBe('1 korjaus');
    expect(summaryLine({ status: 'done', corrections: 37, setAside: aside(2) })).toBe('37 korjausta, 2 riviä ohitettu');
    expect(summaryLine({ status: 'stopped', corrections: 5, setAside: [] })).toBe('Pysäytetty: 5 korjausta');
    expect(summaryLine({ status: 'done', corrections: 2, setAside: aside(1) })).toBe('2 korjausta, 1 rivi ohitettu');
    expect(summaryLine({ status: 'failed', corrections: 0, setAside: aside(3) })).toBe('Keskeytyi virheeseen: Ei korjattavaa, 3 riviä ohitettu');
  });

  test('meetsProofreadThreshold applies the three conditions of report 4.4', () => {
    const good = { planted: 52, fixed: 51, wrong: 1, paragraphs: 28, rewritten: 0 };
    expect(meetsProofreadThreshold(good)).toBe(true);
    // At least half of the planted errors fixed
    expect(meetsProofreadThreshold({ ...good, fixed: 26 })).toBe(true);
    expect(meetsProofreadThreshold({ ...good, fixed: 25 })).toBe(false);
    // Fewer wrong corrections than fixes
    expect(meetsProofreadThreshold({ ...good, fixed: 30, wrong: 29 })).toBe(true);
    expect(meetsProofreadThreshold({ ...good, fixed: 30, wrong: 30 })).toBe(false);
    // Under a fifth of the paragraphs rewritten
    expect(meetsProofreadThreshold({ ...good, rewritten: 5 })).toBe(true);
    expect(meetsProofreadThreshold({ ...good, paragraphs: 25, rewritten: 5 })).toBe(false);
    // Own limits, and nothing to judge
    expect(meetsProofreadThreshold({ ...good, fixed: 40 }, { minFixedShare: 0.9 })).toBe(false);
    expect(meetsProofreadThreshold({ ...good, rewritten: 2 }, { maxRewrittenShare: 0.05 })).toBe(false);
    expect(meetsProofreadThreshold({ planted: 0, fixed: 0, wrong: 0, paragraphs: 0, rewritten: 0 })).toBe(false);
    expect(meetsProofreadThreshold(undefined)).toBe(false);
  });

  test('modelNote gives the four caveat texts', () => {
    const notes = {
      testedAt: '2026-11-06',
      ownText: true,
      models: [
        { id: 'p:hyvä', label: 'hyvä', planted: 52, fixed: 49, wrong: 2, paragraphs: 28, rewritten: 0 },
        { id: 'p:heikko', label: 'heikko', planted: 52, fixed: 20, wrong: 5, paragraphs: 28, rewritten: 3 },
        { id: 'p:yksi', label: 'yksi', planted: 52, fixed: 51, wrong: 1, paragraphs: 28, rewritten: 0 }
      ]
    };
    expect(modelNote('p:hyvä', { testedAt: null, models: [] }))
      .toEqual({ kind: 'not-run', text: 'Mallikoetta ei ole vielä ajettu. Tarkista jokainen ehdotus.' });
    expect(modelNote('p:hyvä', undefined).kind).toBe('not-run');

    expect(modelNote('p:hyvä', notes)).toEqual({
      kind: 'recommended',
      text: 'Mallikokeessa 6.11.2026 tämä malli korjasi 49 / 52 istutetusta kielivirheestä, teki 2 väärää korjausta ja kirjoitti uusiksi 0 / 28 kappaletta.'
    });
    expect(modelNote('p:heikko', notes)).toEqual({
      kind: 'weak',
      text: 'Mallikokeessa 6.11.2026 tämä malli korjasi 20 / 52 istutetusta kielivirheestä, teki 5 väärää korjausta ja kirjoitti uusiksi 3 / 28 kappaletta. Se ei täyttänyt rajaa: tarkista jokainen ehdotus.'
    });
    expect(modelNote('p:tuntematon', notes))
      .toEqual({ kind: 'untested', text: 'Tätä mallia ei ole kokeiltu suomen kielenhuollossa. Tarkista jokainen ehdotus.' });
    expect(modelNote(undefined, notes).kind).toBe('untested');

    // One wrong correction is written in the singular
    expect(modelNote('p:yksi', notes).text).toContain('teki 1 väärän korjauksen ja kirjoitti');
    // The same model behind another provider id is the same model
    expect(modelNote('toinen-asennus:hyvä', notes).kind).toBe('recommended');

    // The test was run and nothing passed: both the weak and the untested text say so
    const nonePass = { testedAt: '2026-11-16', ownText: true, models: [notes.models[1]] };
    expect(modelNote('p:heikko', nonePass).text)
      .toBe('Mallikokeessa 16.11.2026 tämä malli korjasi 20 / 52 istutetusta kielivirheestä, teki 5 väärää korjausta ja kirjoitti uusiksi 3 / 28 kappaletta. Se ei täyttänyt rajaa: tarkista jokainen ehdotus. Yksikään kokeiltu malli ei täyttänyt rajaa.');
    expect(modelNote('p:muu', nonePass).text)
      .toBe('Tätä mallia ei ole kokeiltu suomen kielenhuollossa. Tarkista jokainen ehdotus. Yksikään kokeiltu malli ei täyttänyt rajaa.');
  });

  test('modelNote says when the trial text was not the author\'s own', () => {
    const recommended = modelNote(proofreadModelNotes.models[0].id, proofreadModelNotes);
    expect(recommended).toEqual({
      kind: 'recommended',
      text: 'Mallikokeessa 16.11.2026 tämä malli korjasi 51 / 52 istutetusta kielivirheestä, teki 1 väärän korjauksen ja kirjoitti uusiksi 0 / 28 kappaletta. Koeaineisto oli kokeeseen kirjoitettua tekstiä, ei omaa käsikirjoitustasi.'
    });
    const weakNotes = { testedAt: '2026-11-16', ownText: false, models: [{ id: 'm', label: 'm', planted: 52, fixed: 10, wrong: 0, paragraphs: 28, rewritten: 0 }] };
    expect(modelNote('m', weakNotes).text.endsWith('Yksikään kokeiltu malli ei täyttänyt rajaa. Koeaineisto oli kokeeseen kirjoitettua tekstiä, ei omaa käsikirjoitustasi.')).toBe(true);
    // The untested and not-run texts say nothing about the trial text; own text adds nothing
    expect(modelNote('muu', proofreadModelNotes).text).toBe('Tätä mallia ei ole kokeiltu suomen kielenhuollossa. Tarkista jokainen ehdotus.');
    expect(modelNote(proofreadModelNotes.models[0].id, { ...proofreadModelNotes, ownText: true }).text.endsWith('0 / 28 kappaletta.')).toBe(true);
  });

  test('every model of the notes file passes meetsProofreadThreshold and the first one is the recommended model', () => {
    const P = 'c91fb219-b725-43d2-925d-3c6e66bef527:';
    expect(proofreadModelNotes).toEqual({
      testedAt: '2026-11-16',
      ownText: false,
      scope: 'language',
      typography: { planted: 5, fixedByModel: 4, keptByKielenhuolto: 1 },
      models: [
        { id: `${P}deepseek-v4.1-flash-abliterated-fast`, label: 'deepseek-v4.1-flash-abliterated-fast', planted: 52, fixed: 51, wrong: 1, paragraphs: 28, rewritten: 0 },
        { id: `${P}deepseek-v4.1-flash-abliterated`, label: 'deepseek-v4.1-flash-abliterated', planted: 52, fixed: 51, wrong: 2, paragraphs: 28, rewritten: 0 },
        { id: `${P}glm-5.3-abliterated`, label: 'glm-5.3-abliterated', planted: 52, fixed: 49, wrong: 2, paragraphs: 28, rewritten: 0 },
        { id: `${P}glm-5.3-flash-abliterated`, label: 'glm-5.3-flash-abliterated', planted: 52, fixed: 42, wrong: 0, paragraphs: 28, rewritten: 0 }
      ]
    });
    for (const model of proofreadModelNotes.models) {
      expect(meetsProofreadThreshold(model)).toBe(true);
      expect(modelNote(model.id, proofreadModelNotes).kind).toBe('recommended');
    }
    // Recommended: the passing model with the highest fixed minus wrong
    const best = [...proofreadModelNotes.models].sort((a, b) => (b.fixed - b.wrong) - (a.fixed - a.wrong))[0];
    expect(best).toBe(proofreadModelNotes.models[0]);
    expect(best.id).toBe(`${P}deepseek-v4.1-flash-abliterated-fast`);
  });
});

describe('the real diff\'s shapes and other edges of a run', () => {
  const FOUR = 'Hän sanoi että tulee.\nMinä tiesin että sataa.\nSinä luulit että ehdit.\nMe näimme että ovi oli auki.';

  // P-01's wordDiff merges neighbouring changed words, and a word with the comma after it, into one change
  const mergedDiff = (original, revised) => {
    let start = 0;
    while (start < original.length && start < revised.length && original[start] === revised[start]) start += 1;
    let end = 0;
    while (end < original.length - start && end < revised.length - start
      && original[original.length - 1 - end] === revised[revised.length - 1 - end]) end += 1;
    // Widen to whole words on both sides
    while (start > 0 && !/\s/.test(original[start - 1])) start -= 1;
    while (end > 0 && !/\s/.test(original[original.length - end])) end -= 1;
    if (start === original.length - end && original === revised) return [];
    return [{ from: start, to: original.length - end, insert: revised.slice(start, revised.length - end), original: original.slice(start, original.length - end) }];
  };
  const merged = { ...deps, wordDiff: mergedDiff };

  test('a paraphrased short line is set aside as rewritten also when the diff gives one change', () => {
    const line = (text) => selectProofLines(text, {}, merged).lines[0];
    for (const [text, answer] of [
      ['– Älä höpise siinä.', '– Lopeta tuo puhuminen heti.'],
      ['Hän tuli kotiin.', 'I cannot help with that.'],
      ['Hän tuli kotin illala.', 'Hen tuli kotiin illalla!']
    ]) {
      const outcome = reviseLine(line(text), answer, PROOFREAD_DEFAULTS, merged);
      expect([text, mergedDiff(text, outcome.revised).length, outcome.status]).toEqual([text, 1, 'rewritten']);
    }
    // A one-word fix and a fix with the comma after it are still fixes
    const half = { ...merged, changeRatio: () => 0.5 };
    expect(reviseLine(line('Hän tuli kotin illalla.'), 'Hän tuli kotiin illalla.', PROOFREAD_DEFAULTS, half).status).toBe('changes');
    expect(reviseLine(line('Hän sanoi että tulee.'), 'Hän sanoi, että tulee.', PROOFREAD_DEFAULTS, half).status).toBe('changes');
    expect(reviseLine(line('Isoisän talo oli.'), 'Isän talo oli.', PROOFREAD_DEFAULTS, half).status).toBe('changes');
  });

  test('a short line with none of its own words left is set aside as rewritten', () => {
    const line = (text) => selectProofLines(text, {}, merged).lines[0];
    for (const [text, answer] of [
      ['Hän [TODO: x] tuli.', '[TODO: x]'],
      ['Hän tuli.', 'Me menimme.']
    ]) {
      const outcome = reviseLine(line(text), answer, PROOFREAD_DEFAULTS, merged);
      expect([text, outcome.status]).toEqual([text, 'rewritten']);
    }
    // The same with the per-word diff
    expect(reviseLine(line('Hän [TODO: x] tuli.'), '[TODO: x]', PROOFREAD_DEFAULTS, deps).status).toBe('rewritten');
    // One kept word is enough for a fix, and a one-word line can be fixed
    const half = { ...merged, changeRatio: () => 0.5 };
    expect(reviseLine(line('Hän tuliu.'), 'Hän tuli.', PROOFREAD_DEFAULTS, half).status).toBe('changes');
    expect(reviseLine(line('Talo'), 'Talot', PROOFREAD_DEFAULTS, { ...merged, changeRatio: () => 1 }).status).toBe('changes');
  });

  test('the suspect-word guard sees a word that came with a comma or a changed neighbour', async () => {
    const checkWords = jest.fn(async (words) => Object.fromEntries(words.map(word => [word, !['Isäisän', 'tolo'].includes(word)])));
    for (const [text, answer] of [
      ['Isoisän verstaassa tuoksui terva.', 'Isäisän, verstaassa tuoksui terva.'],
      ['Isoisän talo seisoi mäellä.', 'Isäisän tolo seisoi mäellä.']
    ]) {
      const { result, changes } = await run(text, () => accepted(`[1] ${answer}`), { deps: merged, checkWords });
      expect([text, changes, result.setAside.map(aside => aside.reason)]).toEqual([text, [], ['suspect']]);
    }
    expect(checkWords.mock.calls[0][0]).toEqual(['Isoisän', 'Isäisän']);
    expect(checkWords.mock.calls[1][0]).toEqual(['Isoisän', 'Isäisän', 'talo', 'tolo']);
  });

  test('two lines joined into one are set aside, not proposed as an addition', async () => {
    // Two of four lines misaligned: not more than half, so the batch is not halved
    const text = 'Hän sanoi että tulee.\nHän odotti.\nMinä tiesin että sataa.\nIlta oli hiljainen.';
    const reply = () => accepted('[1] Hän sanoi, että tulee. [2] Hän odotti.\n[3] Minä tiesin, että sataa.\n[4] Ilta oli hiljainen.');
    const { result, changes, calls } = await run(text, reply);
    expect(calls).toHaveLength(1);
    expect(result.setAside.map(aside => [aside.key, aside.reason])).toEqual([['L0', 'split'], ['L1', 'missing']]);
    expect(apply(text, changes)).toBe('Hän sanoi että tulee.\nHän odotti.\nMinä tiesin, että sataa.\nIlta oli hiljainen.');
    // A line that really contains "[2]" is not a join
    const own = parseNumberedLines('[1] Katso kohta [2] alla.\n[2] Toinen.');
    expect(alignBatch([{ masked: 'Katso kohta [2] alla.' }, { masked: 'Toinen.' }], own).map(entry => entry.status)).toEqual(['ok', 'ok']);
    // ... also when line 2 is missing from the answer
    const ownMissing = parseNumberedLines('[1] Katso kohta [2] alla.\n[3] Kolmas.');
    const lines = [{ masked: 'Katso kohta [2] alla.' }, { masked: 'Toinen.' }, { masked: 'Kolmas.' }];
    expect(alignBatch(lines, ownMissing).map(entry => entry.status)).toEqual(['ok', 'missing', 'ok']);
    const ownText = 'Katso kohta [2] alla että.\nToinen.\nKolmas.';
    const ownRun = await run(ownText, () => accepted('[1] Katso kohta [2] alla, että.\n[3] Kolmas.'));
    expect(ownRun.result.setAside.map(aside => [aside.key, aside.reason])).toEqual([['L1', 'missing']]);
    expect(apply(ownText, ownRun.changes)).toBe('Katso kohta [2] alla, että.\nToinen.\nKolmas.');
  });

  test('a change skipped as mismatch alone sets its line aside as moved', async () => {
    const { result } = await run(FOUR, fixing(addComma), {
      onBatch: () => ({ skipped: [{ index: 2, reason: 'mismatch' }] })
    });
    expect(result.setAside.map(aside => [aside.key, aside.reason])).toEqual([['L2', 'moved']]);
    expect(result.corrections).toBe(3);
  });

  test('a set-aside list line points at its body in the run-start text', async () => {
    const text = 'Otsikko alla.\n- maitoa ja leipää että\n  Hän sanoi että tulee.';
    const { result } = await run(text, (lines) => accepted(numbered(lines.map(line => ({ n: line.n, text: 'Täysin toinen rivi jossa ei ole mitään samaa enää tänään.' })))));
    expect(result.setAside.length).toBeGreaterThan(0);
    for (const aside of result.setAside) expect(text.slice(aside.from, aside.to)).toBe(aside.original);
    expect(result.setAside.map(aside => aside.original)).toContain('maitoa ja leipää että');
  });

  test('an answer that arrives after the signal was aborted is not used', async () => {
    const controller = new AbortController();
    const request = () => ({
      result: new Promise(resolve => setImmediate(resolve)).then(() => {
        controller.abort();
        return fixing(addComma)([{ n: 1, text: 'Hän sanoi että tulee.' }]);
      }),
      // A request layer that cannot cancel
      cancel() {}
    });
    const changes = [];
    const result = await runProofread({
      text: 'Hän sanoi että tulee.', deps, meta: { chapterId: 'c1' }, request, signal: controller.signal,
      onBatch: (batch) => {
        changes.push(...batch.changes);
      }
    });
    expect(result.status).toBe('stopped');
    expect(changes).toEqual([]);
    expect(result.corrections).toBe(0);
  });

  test('the reason of an answer that was not accepted is kept', async () => {
    const text = 'Hän sanoi että tulee.\nMinä tiesin että sataa.';
    const { result } = await run(text, () => rejected('refusal', 'Ei ehdotusta: malli kieltäytyi tehtävästä.'));
    expect(result.setAside.map(aside => aside.reason)).toEqual(['truncated', 'truncated']);
    expect(result.status).toBe('done');
    expect(result.error).toBeNull();
    expect(result.failedBatches).toEqual([
      { index: 0, reason: 'refusal', message: 'Ei ehdotusta: malli kieltäytyi tehtävästä.' },
      { index: 0, reason: 'refusal', message: 'Ei ehdotusta: malli kieltäytyi tehtävästä.' }
    ]);
    const single = await run('Hän sanoi että tulee.', () => rejected('max_tokens', 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.'));
    expect(single.result.failedBatches).toEqual([
      { index: 0, reason: 'max_tokens', message: 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.' }
    ]);

    // The Cmd+K chip says why nothing came
    const selection = createProofreadSelection({
      getProject: () => ({}), textDeps: deps, request: fakeModel(() => rejected('max_tokens', 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.')).request
    });
    expect(await selection({ text: 'Hän sanoi että tulee.', chapterId: 'c1' })).toMatchObject({
      ok: false, changes: [], reasonText: 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.'
    });
    // Some lines answered: the run is ok
    const mixed = createProofreadSelection({
      getProject: () => ({}), textDeps: deps, getBudget: () => ({ maxChars: 2000, maxLines: 1 }),
      request: fakeModel((lines, index) => (index === 0 ? rejected('max_tokens', 'Ei ehdotusta.') : fixing(addComma)(lines))).request
    });
    expect(await mixed({ text: FOUR, chapterId: 'c1' })).toMatchObject({ ok: true, reasonText: null });
  });

  test('the lines of a half that failed with an error are counted as set aside', async () => {
    const fates = ['max_tokens', 'ok', 'error'];
    const reply = (lines, index) => {
      if (fates[index] === 'ok') return fixing(addComma)(lines);
      if (fates[index] === 'error') return errored('yhteys katkesi');
      return rejected('max_tokens', 'Ei ehdotusta.');
    };
    const { result } = await run(FOUR, reply);
    expect(result.status).toBe('done');
    expect(result.setAside.map(aside => [aside.key, aside.reason])).toEqual([['L2', 'truncated'], ['L3', 'truncated']]);
    expect(result.failedBatches).toEqual([{ index: 0, reason: 'network', message: 'Ei ehdotusta: yhteys katkesi' }]);
    expect(result.linesUnchanged + result.linesChanged + result.setAside.length).toBe(result.linesSent);

    // Both halves fail: one failed batch, and a run of only that batch is failed
    const both = await run(FOUR, (lines, index) => (index === 0 ? rejected('max_tokens', 'Ei ehdotusta.') : errored(`katko ${index}`)));
    expect(both.calls).toHaveLength(3);
    expect(both.result.failedBatches).toEqual([{ index: 0, reason: 'network', message: 'Ei ehdotusta: katko 2' }]);
    expect(both.result).toMatchObject({ status: 'failed', error: 'Ei ehdotusta: katko 2', batchesDone: 0 });
  });

  test('a budget field that is not a positive number falls back to the default', async () => {
    for (const budget of [{ maxChars: undefined }, { maxChars: 0 }, { maxChars: Number.NaN, maxLines: 0 }, { maxChars: -5 }, null]) {
      const { result, calls } = await run(FOUR, fixing(addComma), { budget });
      expect([budget, result.status, result.corrections, calls.length]).toEqual([budget, 'done', 4, 1]);
    }
    const lines = await run(FOUR, fixing(addComma), { budget: { maxChars: undefined, maxLines: 2 } });
    expect(lines.calls).toHaveLength(2);
  });

  test('a programming error never reaches the screen as its own text', async () => {
    const outcome = await createProofreadSelection({})({ text: 'Hän sanoi että tulee.' });
    expect(outcome).toMatchObject({ ok: false, reasonText: 'Pyyntö epäonnistui.' });
    const run2 = await runProofread({ text: 'Hän sanoi että tulee.', deps });
    expect(run2).toMatchObject({ status: 'failed', error: 'Pyyntö epäonnistui.' });
    const broken = await runProofread({ text: 'Hän sanoi että tulee.', deps, request: fixing(addComma), build: () => { throw new TypeError('x is undefined'); } });
    expect(broken.failedBatches).toEqual([{ index: 0, reason: 'error', message: 'Pyyntö epäonnistui.' }]);
  });
});

describe('createProofreadSelection', () => {
  const TEXT = '# Luku\n\nHän sanoi että tulee.\n– Mä tiedän että sä tuut.\nMinä tiesin että sataa.';
  const project = { proofread: { skipQuoteLines: true, skipDialogue: false }, keepNote: 'murre repliikeissä', genre: 'fiction' };

  function selectionWith(reply, extra = {}) {
    const model = fakeModel(reply);
    const built = [];
    const selection = createProofreadSelection({
      getProject: () => project,
      textDeps: deps,
      build: (task, info) => {
        built.push({ task, info });
        return { ...renderProofreadRequest(task), blocked: null, overBudget: false };
      },
      request: model.request,
      getCheckWords: () => undefined,
      getBudget: () => ({ maxChars: 2000, maxLines: 10 }),
      dashDialogue: () => true,
      ...extra
    });
    return { selection, model, built };
  }

  test('the selection run returns changes in the frame of the text it was given, each with its own meta', async () => {
    const { selection, model, built } = selectionWith(fixing(addComma));
    const from = TEXT.indexOf('Hän');
    const to = TEXT.indexOf('sä tuut.') + 'sä tuut.'.length;
    const progress = [];
    const outcome = await selection({ text: TEXT, range: { from, to }, chapterId: 'c7', onProgress: (info) => progress.push(info) });

    expect(Object.keys(outcome).sort()).toEqual(['baseText', 'changes', 'logMeta', 'note', 'ok', 'reasonText']);
    expect(outcome.ok).toBe(true);
    expect(outcome.baseText).toBe(TEXT);
    expect(outcome.note).toBe('2 korjausta');
    expect(outcome.reasonText).toBeNull();

    // Only the lines the selection touches were sent, and the changes are offsets in TEXT
    expect(model.calls.map(call => call.original)).toEqual(['[1] Hän sanoi että tulee.\n[2] – Mä tiedän että sä tuut.']);
    expect(outcome.changes).toHaveLength(2);
    expect(apply(TEXT, outcome.changes)).toBe('# Luku\n\nHän sanoi, että tulee.\n– Mä tiedän, että sä tuut.\nMinä tiesin että sataa.');

    // Each change has its own meta: the dialogue flag and the line for "Miksi?"
    expect(outcome.changes.map(change => change.meta.dialogue)).toEqual([false, true]);
    expect(outcome.changes[0].meta.line).toEqual({ key: 'L2', original: 'Hän sanoi että tulee.', revised: 'Hän sanoi, että tulee.' });
    expect(outcome.changes[1].meta.line.key).toBe('L3');
    const runId = outcome.changes[0].meta.runId;
    expect(outcome.changes.every(change => change.meta.runId === runId && change.meta.action === 'proofread')).toBe(true);
    // logMeta: what the changes share, without line and dialogue
    expect(outcome.logMeta).toEqual({
      source: 'faust', action: 'proofread', actionLabel: 'Kielenhuolto', instruction: '',
      provider: 'cherry', model: 'malli-a', requestLogId: 'log-7', runId
    });

    // The project's options and the chapter went into the run
    expect(built).toHaveLength(1);
    expect(built[0].info).toEqual({ chapterId: 'c7', text: TEXT, model: undefined });
    expect(built[0].task.rules[13]).toBe('Kirjoittaja on merkinnyt nämä tahallisiksi, älä korjaa niitä: murre repliikeissä');
    expect(model.calls[0].meta).toMatchObject({ action: 'proofread', chapterId: 'c7', runId });
    expect(model.calls[0]).not.toHaveProperty('model');
    expect(progress.length).toBeGreaterThan(0);
  });

  test('the selection run passes another model on to the builder, the budget and the request', async () => {
    const getBudget = jest.fn(() => ({ maxChars: 2000, maxLines: 1 }));
    const { selection, model, built } = selectionWith(echo, { getBudget });
    const outcome = await selection({ text: TEXT, chapterId: 'c7', model: 'p:toinen-malli' });
    expect(getBudget).toHaveBeenCalledWith('p:toinen-malli');
    expect(model.calls).toHaveLength(3);
    expect(model.calls.every(call => call.model === 'p:toinen-malli')).toBe(true);
    expect(built.every(entry => entry.info.model === 'p:toinen-malli')).toBe(true);
    // Nothing to correct: still ok, with a log meta of its own
    expect(outcome).toMatchObject({ ok: true, changes: [], note: 'Ei korjattavaa', reasonText: null });
    expect(outcome.logMeta).toEqual({
      source: 'faust', action: 'proofread', actionLabel: 'Kielenhuolto', instruction: '',
      provider: null, model: 'malli-a', requestLogId: null, runId: expect.any(String)
    });
  });

  test('the selection run asks for the word checker when it runs, not when it was created', async () => {
    const voikkoAnalyze = jest.fn(async ({ words }) => ({ success: true, results: words.map(word => ({ word, known: word !== 'Isäisän' })) }));
    const wordCheck = createWordCheck({ voikkoStatus: async () => ({ available: true }), voikkoAnalyze });
    const getCheckWords = jest.fn(() => wordCheck.current());
    const text = 'Isoisän verstaassa tuoksui terva.';
    const { selection } = selectionWith(fixing(line => line.replace('Isoisän', 'Isäisän')), { getCheckWords });
    expect(getCheckWords).not.toHaveBeenCalled();

    // The Voikko status has not been awaited yet: no checker, the change goes through
    const first = await selection({ text, chapterId: 'c1' });
    expect(getCheckWords).toHaveBeenCalledTimes(1);
    expect(voikkoAnalyze).not.toHaveBeenCalled();
    expect(first.changes).toHaveLength(1);

    // Now it has: the same selection function gets the checker, and through it Voikko
    await wordCheck.refresh();
    const second = await selection({ text, chapterId: 'c1' });
    expect(getCheckWords).toHaveBeenCalledTimes(2);
    expect(voikkoAnalyze).toHaveBeenCalledTimes(1);
    expect(voikkoAnalyze.mock.calls[0][0].words.sort()).toEqual(['Isoisän', 'Isäisän'].sort());
    expect(second.changes).toEqual([]);
    expect(second.note).toBe('Ei korjattavaa, 1 rivi ohitettu');
    expect(second.ok).toBe(true);
  });

  test('a stopped selection run is not ok and says Pyyntö pysäytettiin.', async () => {
    const { selection } = selectionWith(() => cancelledResult());
    const stopped = await selection({ text: TEXT, chapterId: 'c1' });
    expect(stopped).toMatchObject({ ok: false, changes: [], baseText: TEXT, reasonText: 'Pyyntö pysäytettiin.', note: 'Pysäytetty: Ei korjattavaa' });

    // An aborted signal stops it the same way
    const controller = new AbortController();
    controller.abort();
    const { selection: second, model } = selectionWith(fixing(addComma));
    const aborted = await second({ text: TEXT, chapterId: 'c1', signal: controller.signal });
    expect(model.calls).toHaveLength(0);
    expect(aborted).toMatchObject({ ok: false, reasonText: 'Pyyntö pysäytettiin.' });

    // A failed run gives the error as its reason
    const { selection: third } = selectionWith(() => errored('yhteys katkesi'));
    const failed = await third({ text: TEXT, chapterId: 'c1' });
    expect(failed).toMatchObject({ ok: false, changes: [], reasonText: 'Ei ehdotusta: yhteys katkesi', note: 'Keskeytyi virheeseen: Ei korjattavaa' });
  });
});

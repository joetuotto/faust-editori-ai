/**
 * @jest-environment node
 */
const RP = require('../../src/services/ai/reviewPass');
const { plainView } = require('../../src/editor/plainView');
const { BUILTIN_CHECKS } = require('../../src/services/review/reviewChecks');

const {
  REVIEW, LABELS, NONE_MARKERS, SEVERITY_WORDS,
  buildReviewTask, renderReviewRequest, selectReviewLines, planBatches, planReview,
  parseFindings, judgeBatch, anchorQuote, anchorFindings,
  contextSources, resolveSource, anchorReference, fixChanges, runReview
} = RP;

// ---------------------------------------------------------------------------
// Stand-ins for the text modules of another task (src/editor/locateQuote.js,
// blocks.js, sentences.js, wordDiff.js, src/services/ai/batchParagraphs.js):
// the same shapes, with the rules these tests need.
// ---------------------------------------------------------------------------

function foldText(source) {
  let text = '';
  const starts = [];
  const ends = [];
  for (let i = 0; i < source.length; i++) {
    let ch = source[i];
    if (/\s/.test(ch)) {
      if (text.endsWith(' ')) {
        ends[ends.length - 1] = i + 1;
        continue;
      }
      ch = ' ';
    } else if ('"“”„«»'.includes(ch)) ch = '"';
    else if ('\'‘’'.includes(ch)) ch = '\'';
    else if ('-‐–—'.includes(ch)) ch = '-';
    else if (ch === '…') ch = '...';
    else ch = ch.toLowerCase();
    for (const folded of ch) {
      text += folded;
      starts.push(i);
      ends.push(i + 1);
    }
  }
  return { text, starts, ends };
}

// Exact, then with spaces, quotation marks, dashes and case folded, then the longest beginning
function locateQuote(text, quote, options = {}) {
  const from = Number.isFinite(options.from) ? Math.max(0, options.from) : 0;
  const to = Number.isFinite(options.to) ? Math.min(text.length, options.to) : text.length;
  const scope = text.slice(from, Math.max(from, to));
  const wanted = String(quote || '').trim();
  if (!wanted || !scope) return null;

  const all = (hay, needle) => {
    const found = [];
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) found.push(at);
    return found;
  };
  // The first match, or the one closest to `near`
  const nearest = (found, near) => found.reduce(
    (best, at) => (Number.isFinite(near) && Math.abs(at - near) < Math.abs(best - near) ? at : best),
    found[0]
  );
  const near = Number.isFinite(options.near) ? options.near - from : NaN;

  const exact = all(scope, wanted);
  if (exact.length > 0) {
    const at = nearest(exact, near);
    return { from: from + at, to: from + at + wanted.length, method: 'exact', count: exact.length, coverage: 1 };
  }

  const folded = foldText(scope);
  const needle = foldText(wanted).text.trim();
  let nearFolded = NaN;
  if (Number.isFinite(near)) {
    nearFolded = folded.starts.findIndex(start => start >= near);
    if (nearFolded === -1) nearFolded = folded.text.length;
  }
  const pick = (found, length, method, coverage) => {
    const at = nearest(found, nearFolded);
    return { from: from + folded.starts[at], to: from + folded.ends[at + length - 1], method, count: found.length, coverage };
  };
  if (needle.length >= 2) {
    const found = all(folded.text, needle);
    if (found.length > 0) return pick(found, needle.length, 'normalized', 1);
  }
  const words = needle.split(' ');
  for (let k = words.length - 1; k >= 3; k--) {
    const prefix = words.slice(0, k).join(' ');
    if (prefix.length < 12) break;
    const found = all(folded.text, prefix);
    if (found.length > 0) return pick(found, prefix.length, 'prefix', prefix.length / needle.length);
  }
  return null;
}

function splitBlocks(text) {
  const blocks = [];
  let from = 0;
  for (const line of String(text).split('\n')) {
    const to = from + line.length;
    let kind = 'paragraph';
    let prefix = '';
    let match;
    if (!line.trim()) kind = 'blank';
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) kind = 'break';
    else if ((match = /^#{1,6}\s+/.exec(line))) {
      kind = 'heading';
      prefix = match[0];
    } else if ((match = /^>\s?/.exec(line))) {
      kind = 'quote';
      prefix = match[0];
    } else if ((match = /^\s*(?:[-*+]|\d+[.)])\s+/.exec(line))) {
      kind = 'list';
      prefix = match[0];
    }
    const empty = kind === 'blank' || kind === 'break';
    const rest = empty ? '' : line.slice(prefix.length);
    const body = rest.trim();
    const bodyFrom = empty ? from : from + prefix.length + (rest.length - rest.trimStart().length);
    blocks.push({ n: blocks.length + 1, from, to, kind, text: line, prefix: text.slice(from, bodyFrom), body, bodyFrom, bodyTo: bodyFrom + body.length });
    from = to + 1;
  }
  return blocks;
}

function proseLines(blocks, { quotes = false, from = 0, to = Infinity } = {}) {
  return blocks
    .filter(block => block.body && !(block.to < from || block.from > to))
    .filter(block => block.kind === 'paragraph' || block.kind === 'list' || (block.kind === 'quote' && quotes))
    .map(block => ({ n: block.n, from: block.bodyFrom, to: block.bodyTo, text: block.body, kind: block.kind }));
}

// A sentence ends at . ! ? … when the line ends there or a capital, a digit or a dash follows
function splitSentences(text) {
  const out = [];
  let lineStart = 0;
  for (const line of String(text).split('\n')) {
    let start = -1;
    let i = 0;
    while (i < line.length) {
      if (start === -1) {
        if (/\s/.test(line[i])) {
          i++;
          continue;
        }
        start = i;
      }
      if (!'.!?…'.includes(line[i])) {
        i++;
        continue;
      }
      let end = i + 1;
      while (end < line.length && '.!?…”"’\')]'.includes(line[end])) end++;
      let next = end;
      while (next < line.length && /\s/.test(line[next])) next++;
      if (next >= line.length || (next > end && !/\p{Ll}/u.test(line[next]))) {
        out.push({ from: lineStart + start, to: lineStart + end, terminated: true });
        start = -1;
      }
      i = end;
    }
    if (start !== -1) out.push({ from: lineStart + start, to: lineStart + line.trimEnd().length, terminated: false });
    lineStart += line.length + 1;
  }
  return out;
}

// Word-level changes: runs of tokens that are not in the longest common subsequence
function wordDiff(original, revised) {
  const tokens = (text) => text.match(/[\p{L}\p{N}'’]+|\s+|[^\p{L}\p{N}\s]/gu) || [];
  const a = tokens(original);
  const b = tokens(revised);
  const common = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i][j] = a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const changes = [];
  let current = null;
  let pos = 0;
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      current = null;
      pos += a[i].length;
      i++;
      j++;
      continue;
    }
    if (!current) {
      current = { from: pos, to: pos, insert: '' };
      changes.push(current);
    }
    if (j < b.length && (i === a.length || common[i][j + 1] >= common[i + 1][j])) {
      current.insert += b[j];
      j++;
    } else {
      pos += a[i].length;
      current.to = pos;
      i++;
    }
  }
  return changes.map(change => ({ ...change, original: original.slice(change.from, change.to) }));
}

function batchParagraphs(lines, { max, maxLines = 40, lineOverhead = 8 }) {
  const batches = [];
  let current = null;
  const close = () => {
    if (current) batches.push(current);
    current = null;
  };
  for (const line of lines) {
    const cost = line.text.length + lineOverhead;
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

const deps = { locateQuote, splitBlocks, proseLines, splitSentences, wordDiff, batchParagraphs };

// The real text modules, when they are in the tree: the stand-ins above must
// not hide a difference in shape. Missing modules skip those cases.
function loadRealDeps() {
  try {
    const blocks = require('../../src/editor/blocks.js');
    return {
      locateQuote: require('../../src/editor/locateQuote.js').locateQuote,
      splitBlocks: blocks.splitBlocks,
      proseLines: blocks.proseLines,
      splitSentences: require('../../src/editor/sentences.js').splitSentences,
      wordDiff: require('../../src/editor/wordDiff.js').wordDiff,
      batchParagraphs: require('../../src/services/ai/batchParagraphs.js').batchParagraphs
    };
  } catch (error) {
    return null;
  }
}
const realDeps = loadRealDeps();
const withRealModules = realDeps ? test : test.skip;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const check = (id) => BUILTIN_CHECKS.find(entry => entry.id === id);

const OWN_CHECK = {
  id: 'custom:pov',
  kind: 'model',
  types: ['fiction', 'nonfiction'],
  builtin: false,
  suggest: false,
  label: 'Näkökulma',
  instruction: 'Etsi kohdat, joissa näkökulma vaihtuu kesken kappaleen.',
  description: 'Etsi kohdat, joissa näkökulma vaihtuu kesken kappaleen.'
};

// The findings of one answer placed in a text, batch by batch
function place(raw, answer, { sources, maxChars = 9000, batch = 0, textDeps = deps } = {}) {
  const view = plainView(raw);
  const batches = planBatches(selectReviewLines(view.text, null, textDeps), maxChars, textDeps);
  const parsed = typeof answer === 'string' ? parseFindings(answer) : answer;
  return { view, batches, ...anchorFindings(parsed, { raw, view, batch: batches[batch], sources }, textDeps) };
}

// The context builder of another task, as far as a run needs it: the plain
// layout, and whatever a test adds (budget numbers, parts, a blocked state)
function fakeBuild(extra) {
  return jest.fn((task) => {
    const request = renderReviewRequest(task, task.payload);
    const base = {
      ...request,
      parts: [],
      blocked: null,
      overBudget: false,
      dropped: [],
      totalChars: request.system.length + request.messages[0].content.length
    };
    return { ...base, ...(typeof extra === 'function' ? extra(task, base) : extra) };
  });
}

// A window so small that every batch gets the smallest size
const TIGHT = { budgetTokens: 400, charsPerToken: 3 };

const answer = (text, extra = {}) => ({
  ok: true,
  text,
  cancelled: false,
  truncated: false,
  refused: false,
  promptTruncated: false,
  sawThinking: false,
  error: null,
  model: 'c91f:deepseek-test',
  logId: 'log-1',
  ...extra
});
const failure = (code, message) => answer('', { ok: false, error: { code, message, status: null } });

// The request layer of another task: answers come from a list or a function,
// each a tick later, and the stand-in notes how many requests were open at once
function fakeRequest(answers) {
  const state = { open: 0, mostOpen: 0 };
  const request = jest.fn((options) => {
    const index = request.mock.calls.length - 1;
    const given = typeof answers === 'function' ? answers(options, index) : answers[index];
    state.open += 1;
    state.mostOpen = Math.max(state.mostOpen, state.open);
    const result = new Promise((resolve) => {
      setTimeout(() => {
        state.open -= 1;
        resolve(given);
      }, 0);
    });
    return { result, cancel: jest.fn() };
  });
  request.state = state;
  return request;
}

const payloadOf = (options) => /<teksti>\n([\s\S]*)\n<\/teksti>/.exec(options.messages[0].content)[1];

// Three paragraphs that each fill a batch of the smallest size
const filler = (word, count) => Array.from({ length: count }, (_unused, index) => `${word}${index}`).join(' ');
const PARAGRAPHS = [
  `Ensimmäinen kappale alkaa tästä. Hän vain katsoi merta. ${filler('alku', 100)}.`,
  `Toinen kappale alkaa tästä. Aika tuntui pysähtyvän. ${filler('keski', 100)}.`,
  `Kolmas kappale alkaa tästä. Åke-setä oli tavallaan hiljaa. ${filler('loppu', 100)}.`
];
const LONG_CHAPTER = PARAGRAPHS.join('\n\n');
const PARAGRAPH_ANSWERS = [
  'LAINAUS: Hän vain katsoi merta.\nHUOMIO: Vain on täytesana.\nEHDOTUS: Hän katsoi merta.',
  'LAINAUS: Aika tuntui pysähtyvän.\nHUOMIO: Kulunut kielikuva.\nEHDOTUS: -',
  'LAINAUS: Åke-setä oli tavallaan hiljaa.\nHUOMIO: Tavallaan on täytesana.\nEHDOTUS: Åke-setä oli hiljaa.'
];
// The answer that belongs to the paragraph a request carries
const answerByParagraph = (options) => {
  const index = PARAGRAPHS.findIndex(paragraph => payloadOf(options) === paragraph);
  return answer(PARAGRAPH_ANSWERS[index]);
};

function startRun(params) {
  return runReview({
    check: check('filler'),
    text: LONG_CHAPTER,
    range: null,
    note: '',
    build: fakeBuild(TIGHT),
    meta: { chapterId: 'c1' },
    deps,
    makeId: () => 'run-1',
    ...params
  });
}

// ---------------------------------------------------------------------------
// Recorded answers of the model gateway, 16 Nov 2026 (synthetic Finnish text).
// Copied from the design round's probe files; the texts the models read are below.
// ---------------------------------------------------------------------------

const RECORDED_TEXTS = {
  // A scene with a note and an underlined word
  scene: [
    'Aamu oli jotenkin harmaa, ja Liisa seisoi laiturilla ikään kuin odottaen jotakin. Järven pinta oli tyyni kuin peili. Hän oli oikeastaan aika väsynyt, mutta ei halunnut näyttää sitä.',
    '',
    '– Tuletko sinä jo? hän huusi vihaisesti. – Kuten tiedät, isä kuoli viime keväänä ja jätti meille tämän mökin, jonka me nyt omistamme yhdessä.',
    '',
    '– Minä tulen, kun ehdin, Antti vastasi ja kohautti olkapäitään. ”Ei tässä mitään kiirettä ole”, hän ajatteli. [TODO: tarkista Antin ikä]',
    '',
    'Liisan sydän hakkasi rinnassa. Aika tuntui pysähtyvän, ja hiljaisuus oli käsinkosketeltava. Hän vain katsoi veljeään, joka käveli <u>hitaasti</u> rantaa kohti, eikä sanonut mitään – ei yhtään mitään.',
    '',
    'Åke-setä oli tavallaan aina sanonut, että järvi ottaa omansa. Se oli itse asiassa ainoa asia, jonka Liisa hänestä muisti.'
  ].join('\n'),
  // A passage written to have no faults
  clean: 'Liisa sitoi veneen laituriin ja nosti airot telineeseen. Vesi oli noussut yöllä kaksi lautaa. Antti kantoi verkot aittaan eikä puhunut matkalla mitään.',
  continuity: [
    'Liisa sukelsi laiturilta ja ui pitkin vedoin kohti saarta. Hänen ruskeat silmänsä kirvelivät, kun hän nousi pintaan.',
    '',
    'Antti istui kuistilla ja sytytti tupakan oikealla kädellään. Hän oli ajanut mökille omalla autollaan jo edellisenä iltana.',
    '',
    '– Laita valot päälle, Liisa huusi rannasta. Antti napsautti katkaisijaa, ja kuistin lamppu syttyi. Oli heinäkuun alku, ja järvi oli lämmin.'
  ].join('\n'),
  nonfiction: [
    'Suomalaiset lukevat vähemmän kuin koskaan. Vuonna 2023 vain 37 prosenttia aikuisista luki kirjan kuukaudessa, ja luku on puolittunut kymmenessä vuodessa. Lukutaito on kuitenkin edelleen maailman huippua.',
    '',
    'Lukemisen vähenemistä on selitetty älypuhelimilla. Kännyköiden yleistyminen osuu samaan aikaan kuin lukuharrastuksen lasku. Mobiililaitteet eivät silti selitä kaikkea, sillä lasku alkoi jo 1990-luvulla. Omassa lapsuudessani kirjastoauto kävi kylällä joka toinen viikko.'
  ].join('\n'),
  feedback: [
    'Aamu oli jotenkin harmaa, ja Liisa seisoi laiturilla ikään kuin odottaen jotakin. Järven pinta oli tyyni kuin peili. Hän oli oikeastaan aika väsynyt, mutta ei halunnut näyttää sitä.',
    '',
    '– Tuletko sinä jo? hän huusi vihaisesti. – Kuten tiedät, isä kuoli viime keväänä ja jätti meille tämän mökin, jonka me nyt omistamme yhdessä.',
    '',
    '– Minä tulen, kun ehdin, Antti vastasi ja kohautti olkapäitään. ”Ei tässä mitään kiirettä ole”, hän ajatteli.',
    '',
    'Liisan sydän hakkasi rinnassa. Aika tuntui pysähtyvän, ja hiljaisuus oli käsinkosketeltava. Hän vain katsoi veljeään, joka käveli hitaasti rantaa kohti, eikä sanonut mitään – ei yhtään mitään.',
    '',
    'Antti laski kassin laiturille. Kassista työntyi esiin isän vanha virveli, sama, jonka kahvaan Liisa oli seitsemänvuotiaana kaivertanut nimensä puukolla ja saanut siitä selkäänsä. Hän ei ollut nähnyt sitä kahteenkymmeneen vuoteen.',
    '',
    '– Löysin sen vintiltä, Antti sanoi. – Ajattelin, että sinä haluat sen.',
    '',
    'Liisa otti virvelin käteensä. Kaiverrus oli yhä siinä, vinot kirjaimet, ja niiden vieressä toinen nimi, jota hän ei ollut koskaan ennen nähnyt: Marjatta.',
    '',
    'Åke-setä oli tavallaan aina sanonut, että järvi ottaa omansa. Se oli itse asiassa ainoa asia, jonka Liisa hänestä muisti. Sitten he menivät sisään ja keittivät kahvia ja puhuivat säästä ja naapurin uudesta veneestä ja siitä, pitäisikö katto uusia tänä vuonna vai vasta ensi vuonna.'
  ].join('\n')
};

// [model, check of the probe, the text it read, the answer]
const RECORDED = [
  {
    model: 'glm-5.3-flash-abliterated',
    check: 'tayte',
    source: 'scene',
    text: [
      'LAINAUS: Aamu oli jotenkin harmaa, ja Liisa seisoi laiturilla ikään kuin odottaen jotakin.',
      'HUOMIO: "Jotenkin" ja "ikään kuin" ovat täytesanoja, jotka eivät lisää virkkeeseen mitään.',
      'EHDOTUS: Aamu oli harmaa, ja Liisa seisoi laiturilla odottaen jotakin.',
      '',
      'LAINAUS: Hän oli oikeastaan aika väsynyt, mutta ei halunnut näyttää sitä.',
      'HUOMIO: Sekä "oikeastaan" että "aika" ovat täytesanoja, jotka voi poistaa merkityksen muuttumatta.',
      'EHDOTUS: Hän oli väsynyt, mutta ei halunnut näyttää sitä.',
      '',
      'LAINAUS: Hän vain katsoi veljeään, joka käveli hitaasti rantaa kohti, eikä sanonut mitään – ei yhtään mitään.',
      'HUOMIO: "Vain" ei lisää virkkeeseen mitään ja voidaan poistaa.',
      'EHDOTUS: Hän katsoi veljeään, joka käveli hitaasti rantaa kohti, eikä sanonut mitään – ei yhtään mitään.',
      '',
      'LAINAUS: Åke-setä oli tavallaan aina sanonut, että järvi ottaa omansa.',
      'HUOMIO: "Tavallaan" on täytesana, joka heikentää lausetta ilman lisäarvoa.',
      'EHDOTUS: Åke-setä oli aina sanonut, että järvi ottaa omansa.',
      '',
      'LAINAUS: Se oli itse asiassa ainoa asia, jonka Liisa hänestä muisti.',
      'HUOMIO: "Itse asiassa" on täytesana, joka voi poistua merkityksen muuttumatta.',
      'EHDOTUS: Se oli ainoa asia, jonka Liisa hänestä muisti.'
    ].join('\n')
  },
  {
    model: 'deepseek-v4.1-flash-abliterated-fast',
    check: 'klisee',
    source: 'scene',
    text: [
      'LAINAUS: Järven pinta oli tyyni kuin peili.',
      'HUOMIO: Vertaus on yksi kuluneimmista järvikuvauksista, eikä se kerro tässä muusta ympäristöstä mitään.',
      'EHDOTUS: Järven pinta heijasti harmaan taivaan.',
      '',
      'LAINAUS: Liisan sydän hakkasi rinnassa.',
      'HUOMIO: Sydämen hakkaaminen rinnassa on vakiintunut fraasi, joka toistuu sellaisenaan lukemattomissa teksteissä.',
      'EHDOTUS: Liisan sydän jyskytti.',
      '',
      'LAINAUS: Aika tuntui pysähtyvän,',
      'HUOMIO: Ajan pysähtyminen on valmis kielikuva, joka tulee tässä ilman omaa sävyä.',
      'EHDOTUS: -',
      '',
      'LAINAUS: ja hiljaisuus oli käsinkosketeltava.',
      'HUOMIO: Käsinkosketeltava hiljaisuus on niin ikään kulunut ilmaus, ja se esiintyy samassa virkkeessä edellisen kliseen kanssa.',
      'EHDOTUS: ja hiljaisuus painui korviin.'
    ].join('\n')
  },
  {
    model: 'deepseek-v4.1-flash-abliterated-fast',
    check: 'dialogi',
    source: 'scene',
    text: [
      'LAINAUS: – Kuten tiedät, isä kuoli viime keväänä ja jätti meille tämän mökin, jonka me nyt omistamme yhdessä.',
      'HUOMIO: Repliikki on kirjakielinen ja kertaa asian, jonka molemmat veljen kanssa jo tietävät. Loppuosa "jonka me nyt omistamme yhdessä" toistaa sen, minkä "jätti meille" jo sanoo.',
      'EHDOTUS: – Isä kuoli viime keväänä ja jätti meille tämän mökin.',
      '',
      'LAINAUS: – Tuletko sinä jo? hän huusi vihaisesti.',
      'HUOMIO: Johtolauseen "vihaisesti" toistaa saman, minkä lyhyt ja kärsimätön repliikki jo ilmaisee.',
      'EHDOTUS: – Tuletko sinä jo? hän huusi.'
    ].join('\n')
  },
  {
    model: 'glm-5.3-flash-abliterated',
    check: 'puhdas',
    source: 'clean',
    text: [
      'LAINAUS: Antti kantoi verkot aittaan eikä puhunut matkalla mitään.',
      'HUOMIO: Vaikeneminen jännitteen merkkinä on kulunut keino, ja ilmaus "ei puhunut mitään" on valmis fraasi.',
      'EHDOTUS: -'
    ].join('\n')
  },
  {
    model: 'glm-5.3-flash-abliterated',
    check: 'jatkuvuus',
    source: 'continuity',
    text: [
      'LAINAUS: Hänen ruskeat silmänsä kirvelivät, kun hän nousi pintaan.',
      'VERTAA: Liisa Koskela (hahmo): Siniset silmät.',
      'LÄHDE: [K1]',
      'HUOMIO: Teksti kertoo Liisan silmien olevan ruskeat, mutta taustatiedoissa ne ovat siniset.',
      '',
      'LAINAUS: Antti istui kuistilla ja sytytti tupakan oikealla kädellään.',
      'VERTAA: Antti on juuri lopettanut tupakoinnin.',
      'LÄHDE: [T2]',
      'HUOMIO: Antti polttaa tupakkaa, vaikka hän on juuri lopettanut tupakoinnin.',
      '',
      'LAINAUS: Antti istui kuistilla ja sytytti tupakan oikealla kädellään.',
      'VERTAA: Vasenkätinen.',
      'LÄHDE: [K2]',
      'HUOMIO: Antti käyttää oikeaa kättään, vaikka hän on vasenkätinen.',
      '',
      'LAINAUS: Hän oli ajanut mökille omalla autollaan jo edellisenä iltana.',
      'VERTAA: Sisarukset ajavat Liisan autolla mökille toukokuun lopussa.',
      'LÄHDE: [T2]',
      'HUOMIO: Tekstissä Antti ajaa omalla autollaan, mutta taustatiedoissa matka tehdään Liisan autolla.',
      '',
      'LAINAUS: Oli heinäkuun alku',
      'VERTAA: Sisarukset ajavat Liisan autolla mökille toukokuun lopussa.',
      'LÄHDE: [T2]',
      'HUOMIO: Tekstin tapahtumat sijoittuvat heinäkuun alkuun, mutta taustatiedoissa matka mökille tapahtuu toukokuun lopussa.',
      '',
      'LAINAUS: Antti napsautti katkaisijaa, ja kuistin lamppu syttyi.',
      'VERTAA: Mökissä ei ole sähköä.',
      'LÄHDE: [K3]',
      'HUOMIO: Tekstissä lamppu syttyy katkaisijasta, mikä ei ole mahdollista mökissä, jossa ei ole sähköä.'
    ].join('\n')
  },
  {
    model: 'deepseek-v4.1-flash-abliterated-fast',
    check: 'jatkuvuus',
    source: 'continuity',
    text: [
      'LAINAUS: Liisa sukelsi laiturilta ja ui pitkin vedoin kohti saarta.',
      'VERTAA: Ei osaa uida.',
      'LÄHDE: [K1]',
      'HUOMIO: Teksti kuvaa Liisan uivan, vaikka taustatiedon mukaan hän ei osaa uida.',
      '',
      'LAINAUS: Hänen ruskeat silmänsä kirvelivät',
      'VERTAA: Siniset silmät.',
      'LÄHDE: [K1]',
      'HUOMIO: Liisan silmien väriksi sanotaan ruskea, mutta taustatiedoissa se on sininen.',
      '',
      'LAINAUS: sytytti tupakan oikealla kädellään',
      'VERTAA: Vasenkätinen.',
      'LÄHDE: [K2]',
      'HUOMIO: Antti toimii oikealla kädellä, vaikka hänet on määritelty vasenkätiseksi.',
      '',
      'LAINAUS: sytytti tupakan oikealla kädellään',
      'VERTAA: Antti on juuri lopettanut tupakoinnin.',
      'LÄHDE: [T2]',
      'HUOMIO: Antti polttaa tupakan, vaikka on juuri lopettanut tupakoinnin.',
      '',
      'LAINAUS: Hän oli ajanut mökille omalla autollaan jo edellisenä iltana.',
      'VERTAA: Antti kertoo myyneensä autonsa.',
      'LÄHDE: [T1]',
      'HUOMIO: Antti saapuu mökille omalla autollaan, vaikka on kertonut myyneensä autonsa.',
      '',
      'LAINAUS: Sisarukset ajavat Liisan autolla mökille',
      'VERTAA: Hän oli ajanut mökille omalla autollaan jo edellisenä iltana.',
      'LÄHDE: [T2]',
      'HUOMIO: Yhteisen matkan mukaan ajetaan Liisan autolla, mutta teksti kertoo Antin ajaneen omalla autollaan.',
      '',
      'LAINAUS: Laita valot päälle, Liisa huusi rannasta. Antti napsautti katkaisijaa, ja kuistin lamppu syttyi.',
      'VERTAA: Mökissä ei ole sähköä.',
      'LÄHDE: [K3]',
      'HUOMIO: Kuistin lamppu syttyy katkaisijasta, vaikka mökissä ei ole sähköä.',
      '',
      'LAINAUS: Oli heinäkuun alku, ja järvi oli lämmin.',
      'VERTAA: Sisarukset ajavat Liisan autolla mökille toukokuun lopussa.',
      'LÄHDE: [T2]',
      'HUOMIO: Ajankohdaksi sanotaan heinäkuun alku, mutta matkan ajankohta on toukokuun loppu.'
    ].join('\n')
  },
  {
    model: 'glm-5.3-abliterated',
    check: 'dialogi',
    source: 'scene',
    text: [
      'LAINAUS: – Kuten tiedät, isä kuoli viime keväänä ja jätti meille tämän mökin, jonka me nyt omistamme yhdessä.',
      'HUOMIO: Repliikki kuulostaa kirjoitetulta ja selittää Antille asian, jonka molemmat selvästi jo tietävät – sisarusten ei tarvitse kertoa toisilleen isänsä kuolemasta ja yhteisomistuksesta.',
      'EHDOTUS: – Isä kuoli viime keväänä, ja mökki jäi meille kummallekin.',
      '',
      'LAINAUS: Liisan sydän hakkasi rinnassa. Aika tuntui pysähtyvän, ja hiljaisuus oli käsinkosketeltava.',
      'HUOMIO: Johdolauseet toistavat sen, mitä repliikki ja tilanne jo osoittavat: vihanneen huudon ja hiljaisen odotuksen jälkeen näiden kliisevien metaforien ei ole tarpeen.',
      'EHDOTUS: -'
    ].join('\n')
  },
  {
    model: 'glm-5.3-flash-abliterated',
    check: 'layout-tayte',
    source: 'scene',
    text: [
      'LAINAUS: Aamu oli jotenkin harmaa, ja Liisa seisoi laiturilla ikään kuin odottaen jotakin.',
      'HUOMIO: Täytesanat "jotenkin" ja "ikään kuin" eivät lisää virkkeeseen mitään ja voidaan poistaa merkityksen muuttumatta.',
      'EHDOTUS: Aamu oli harmaa, ja Liisa seisoi laiturilla odottaen jotakin.',
      '',
      'LAINAUS: Hän oli oikeastaan aika väsynyt, mutta ei halunnut näyttää sitä.',
      'HUOMIO: Sekä "oikeastaan" että "aika" ovat täytesanoja, joiden voi poistaa.',
      'EHDOTUS: Hän oli väsynyt, mutta ei halunnut näyttää sitä.',
      '',
      'LAINAUS: Hän vain katsoi veljeään, joka käveli hitaasti rantaa kohti, eikä sanonut mitään – ei yhtään mitään.',
      'HUOMIO: Sana "vain" on täytesana, jonka voi poistaa. Lainausmerkintä ei kuulu tähän tarkistukseen, joten lopun toistoa ei huomauteta.',
      'EHDOTUS: Hän katsoi veljeään, joka käveli hitaasti rantaa kohti, eikä sanonut mitään – ei yhtään mitään.',
      '',
      'LAINAUS: Åke-setä oli tavallaan aina sanonut, että järvi ottaa omansa.',
      'HUOMIO: "Tavallaan" on täytesana, jonka voi poistaa merkityksen muuttumatta.',
      'EHDOTUS: Åke-setä oli aina sanonut, että järvi ottaa omansa.',
      '',
      'LAINAUS: Se oli itse asiassa ainoa asia, jonka Liisa hänestä muisti.',
      'HUOMIO: "Itse asiassa" on täytesana, jonka voi poistaa.',
      'EHDOTUS: Se oli ainoa asia, jonka Liisa hänestä muisti.'
    ].join('\n')
  },
  {
    model: 'deepseek-v4.1-flash-abliterated-fast',
    check: 'layout-klisee',
    source: 'scene',
    text: [
      'LAINAUS: Järven pinta oli tyyni kuin peili.',
      'HUOMIO: Vertaus on kulunut ja lukija on nähnyt sen monta kertaa.',
      '',
      'LAINAUS: Liisan sydän hakkasi rinnassa.',
      'HUOMIO: Valmis fraasi, joka ei kerro paljonkaan hahmon tilasta.',
      '',
      'LAINAUS: Aika tuntui pysähtyvän, ja hiljaisuus oli käsinkosketeltava.',
      'HUOMIO: Kaksi kulunutta ilmausta peräkkäin samassa virkkeessä.',
      '',
      'LAINAUS: Åke-setä oli tavallaan aina sanonut, että järvi ottaa omansa.',
      'HUOMIO: Sanonta on tunnettu, mutta sen ympärillä oleva "tavallaan" pehmentää sitä tarpeettomasti.'
    ].join('\n')
  },
  {
    model: 'glm-5.3-flash-abliterated',
    check: 'layout-lahde',
    source: 'nonfiction',
    text: [
      'LAINAUS: Suomalaiset lukevat vähemmän kuin koskaan.',
      'HUOMIO: Väite lukemisen historiallisesta vähenemisestä esitetään ilman lähdettä.',
      '',
      'LAINAUS: Vuonna 2023 vain 37 prosenttia aikuisista luki kirjan kuukaudessa, ja luku on puolittunut kymmenessä vuodessa.',
      'HUOMIO: Tilastoluvut ja niiden kehitys esitetään ilman lähdettä.',
      '',
      'LAINAUS: Lukutaito on kuitenkin edelleen maailman huippua.',
      'HUOMIO: Kansainvälinen vertailuväite esitetään ilman lähdettä.',
      '',
      'LAINAUS: Lukemisen vähenemistä on selitetty älypuhelimilla.',
      'HUOMIO: Toisten näkemys esitetään ilman, että kerrotaan, kuka sen on esittänyt.',
      '',
      'LAINAUS: Mobiililaitteet eivät silti selitä kaikkea, sillä lasku alkoi jo 1990-luvulla.',
      'HUOMIO: Historiallinen väite laskun alkamisajankohdasta esitetään ilman lähdettä.'
    ].join('\n')
  },
  {
    model: 'deepseek-v4.1-flash-abliterated-fast',
    check: 'layout-termi',
    source: 'nonfiction',
    text: [
      'LAINAUS: Lukemisen vähenemistä on selitetty älypuhelimilla.',
      'HUOMIO: Aiemmin puhuttiin lukemisesta, nyt käytetään termiä lukemisen väheneminen.',
      'EHDOTUS: -',
      '',
      'LAINAUS: Kännyköiden yleistyminen osuu samaan aikaan kuin lukuharrastuksen lasku.',
      'HUOMIO: Älypuhelimista siirrytään kännyköihin, ja lukemisen väheneminen saa nimen lukuharrastuksen lasku.',
      'EHDOTUS: -',
      '',
      'LAINAUS: Mobiililaitteet eivät silti selitä kaikkea',
      'HUOMIO: Kolmas termi samalle asialle: älypuhelimet, kännykät ja nyt mobiililaitteet.',
      'EHDOTUS: -'
    ].join('\n')
  },
  {
    model: 'glm-5.3-flash-abliterated',
    check: 'layout-jatkuvuus',
    source: 'continuity',
    text: [
      'LAINAUS: Hänen ruskeat silmänsä kirvelivät, kun hän nousi pintaan.',
      'VERTAA: Liisa Koskela (hahmo): Antin isosisko, 41-vuotias. Siniset silmät.',
      'LÄHDE: tarinakansio_mainitut: Liisa Koskela (hahmo)',
      'HUOMIO: Tekstissä Liisan silmät ovat ruskeat, mutta taustatiedoissa ne ovat siniset.',
      '',
      'LAINAUS: sytytti tupakan oikealla kädellään',
      'VERTAA: Antti Koskela (hahmo): Liisan pikkuveli, 36-vuotias. Vasenkätinen.',
      'LÄHDE: tarinakansio_mainitut: Antti Koskela (hahmo)',
      'HUOMIO: Antti käyttää tekstissä oikeaa kättään, vaikka hän on vasenkätinen.',
      '',
      'LAINAUS: Antti napsautti katkaisijaa, ja kuistin lamppu syttyi.',
      'VERTAA: Mökki (paikka): Hirsimökki Päijänteen rannalla. Isä rakensi sen vuonna 1978. Mökissä ei ole sähköä.',
      'LÄHDE: tarinakansio: Mökki (paikka)',
      'HUOMIO: Mökissä ei ole sähköä, joten lamppu ei voi syttyä katkaisijasta.',
      '',
      'LAINAUS: Antti oli ajanut mökille omalla autollaan jo edellisenä iltana.',
      'VERTAA: Antti kertoo myyneensä autonsa.',
      'LÄHDE: Luku 1',
      'HUOMIO: Antti myi autonsa, joten hän ei voi ajaa omalla autollaan mökille.',
      '',
      'LAINAUS: Antti istui kuistilla ja sytytti tupakan',
      'VERTAA: Antti on juuri lopettanut tupakoinnin.',
      'LÄHDE: Luku 2',
      'HUOMIO: Antti on lopettanut tupakoinnin, joten tupakan sytyttäminen on ristiriidassa tämän kanssa.'
    ].join('\n')
  },
  {
    model: 'deepseek-v4.1-flash-abliterated-fast',
    check: 'layout-jatkuvuus',
    source: 'continuity',
    text: [
      'LAINAUS: Hänen ruskeat silmänsä kirvelivät, kun hän nousi pintaan.',
      'VERTAA: Liisa Koskela (hahmo): Antin isosisko, 41-vuotias. Siniset silmät.',
      'LÄHDE: Liisa Koskela',
      'HUOMIO: Tekstissä Liisan silmät ovat ruskeat, taustatiedossa siniset.',
      '',
      'LAINAUS: Liisa sukelsi laiturilta ja ui pitkin vedoin kohti saarta.',
      'VERTAA: Liisa Koskela (hahmo): Antin isosisko, 41-vuotias. Siniset silmät. Ei osaa uida.',
      'LÄHDE: Liisa Koskela',
      'HUOMIO: Liisa sekä sukeltaa että ui, vaikka taustatiedon mukaan hän ei osaa uida.',
      '',
      'LAINAUS: Antti istui kuistilla ja sytytti tupakan oikealla kädellään.',
      'VERTAA: Antti Koskela (hahmo): Liisan pikkuveli, 36-vuotias. Vasenkätinen.',
      'LÄHDE: Antti Koskela',
      'HUOMIO: Tekstissä tupakka sytytetään oikealla kädellä, vaikka Antti on vasenkätinen.',
      '',
      'LAINAUS: Antti istui kuistilla ja sytytti tupakan oikealla kädellään.',
      'VERTAA: Luku 2: Matka – Sisarukset ajavat Liisan autolla mökille toukokuun lopussa. Antti on juuri lopettanut tupakoinnin.',
      'LÄHDE: Luku 2',
      'HUOMIO: Antti on juuri lopettanut tupakoinnin, mutta sytyttää silti tupakan.',
      '',
      'LAINAUS: Hän oli ajanut mökille omalla autollaan jo edellisenä iltana.',
      'VERTAA: Luku 1: Hautajaiset – Isä haudataan huhtikuussa. Liisa ja Antti riitelevät perinnöstä. Antti kertoo myyneensä autonsa.',
      'LÄHDE: Luku 1',
      'HUOMIO: Antti saapuu omalla autolla, vaikka on kertonut myyneensä autonsa. Lisäksi luvussa 2 mökille ajetaan Liisan autolla.',
      '',
      'LAINAUS: – Laita valot päälle, Liisa huusi rannasta. Antti napsautti katkaisijaa, ja kuistin lamppu syttyi.',
      'VERTAA: Mökki (paikka): Hirsimökki Päijänteen rannalla. Isä rakensi sen vuonna 1978. Mökissä ei ole sähköä.',
      'LÄHDE: Mökki',
      'HUOMIO: Kuistin lamppu syttyy katkaisijasta, vaikka mökissä ei ole sähköä.'
    ].join('\n')
  }
];

const RECORDED_FEEDBACK = [
  {
    model: 'deepseek-v4.1-flash-abliterated-fast',
    text: [
      'LAINAUS: Kassista työntyi esiin isän vanha virveli, sama, jonka kahvaan Liisa oli seitsemänvuotiaana kaivertanut nimensä puukolla ja saanut siitä selkäänsä.',
      'HUOMIO: Esine kantaa koko tarinan painon: se tuo isän, lapsuuden ja riidan yhdellä kuvalla. Lukija ymmärtää heti, että tässä on muutakin kuin kala.',
      'VAKAVUUS: toimii',
      '',
      'LAINAUS: niiden vieressä toinen nimi, jota hän ei ollut koskaan ennen nähnyt: Marjatta',
      'HUOMIO: Nimi avaa arvoituksen juuri kun tilanne on rentoutumassa, ja lukija haluaa tietää, kuka Marjatta on. Hyvä sijoitus luvun loppuun.',
      'VAKAVUUS: toimii',
      '',
      'LAINAUS: Åke-setä oli tavallaisesti aina sanonut, että järvi ottaa omansa.',
      'HUOMIO: Lause jää mieleen ja sävyttää koko loppukohtausta uhkaavasti. Sivuhahmon repliikki kantaa enemmän kuin painonsa.',
      'VAKAVUUS: toimii',
      '',
      'LAINAUS: – Tuletko sinä jo? hän huusi vihaisesti. – Kuten tiedät, isä kuoli viime keväänä ja jätti meille tämän mökin, jonka me nyt omistamme yhdessä.',
      'HUOMIO: Ensimmäinen repliikki on arkinen huuto, mutta heti perään tulee tiivis paketti perhesuhteista ja omistuksesta. Lukija putoaa kärryiltä, koska hän ei tiedä, kenelle "kuten tiedät" on tarkoitettu ja miksi asia kerrotaan juuri nyt.',
      'VAKAVUUS: keskisuuri',
      '',
      'LAINAUS: Aamu oli jotenkin harmaa, ja Liisa seisoi laiturilla ikään kuin odottaen jotakin.',
      'HUOMIO: "Jotenkin" ja "ikään kuin" pehmentävät alkua niin, ettei lukija saa otetta Liisan mielentilasta. Epämääräisyys tuntuu siltä, ettei kirjoittaja itsekään ole päättänyt, mitä Liisa odottaa.',
      'VAKAVUUS: keskisuuri',
      '',
      'LAINAUS: Hän vain katsoi veljeään, joka käveli hitaasti rantaa kohti, eikä sanonut mitään – ei yhtään mitään.',
      'HUOMIO: Saman kohdan toisto tehokeinona on perusteltu, mutta ympärillä on paljon muita hiljaisuuden kuvauksia: sydän hakkasi, aika pysähtyi, hiljaisuus oli käsinkosketeltava. Yksi pois jättäisi tilaa muille.',
      'VAKAVUUS: pieni'
    ].join('\n')
  },
  {
    model: 'glm-5.3-flash-abliterated',
    text: [
      'LAINAUS: Kaiverrus oli yhä siinä, vinot kirjaimet, ja niiden vieressä toinen nimi, jota hän ei ollut koskaan ennen nähnyt: Marjatta.',
      'HUOMIO: Hyvä käänne, joka herättää kysymyksen ja houkuttelee lukijaa jatkamaan. Liisan seitsemänvuotiaana kaiverrama nimi tekee kohteesta konkreettisen.',
      'VAKAVUUS: toimii',
      '',
      'LAINAUS: Hän ei ollut nähnyt sitä kahteenkymmeneen vuoteen.',
      'HUOMIO: Lyhyt lause tuo esiin aikaulottuvuuden ja antaa virvelille emotionaalista painoa ennen paljastusta.',
      'VAKAVUUS: toimii',
      '',
      'LAINAUS: – Tuletko sinä jo? hän huusi vihaisesti.',
      'HUOMIO: Vihaisuus yllättää, sillä edellä ei ollut vihjeitä siitä, miksi Liisa olisi vihainen. Voi kuitenkin vihjata sisaruusten välisestä jännitteestä.',
      'VAKAVUUS: pieni',
      '',
      'LAINAUS: – Kuten tiedät, isä kuoli viime keväänä ja jätti meille tämän mökin, jonka me nyt omistamme yhdessä.',
      'HUOMIO: Tämä on puhetta kahden sisaruksen välillä, jotka tietävät asian jo valmiiksi. Kuulostaa selostukselta lukijalle, ei luontevalta repliikiltä, ja katkaisee uppoutumisen.',
      'VAKAVUUS: keskisuuri',
      '',
      'LAINAUS: Liisan sydän hakkasi rinnassa. Aika tuntui pysähtyvän, ja hiljaisuus oli käsinkosketeltava.',
      'HUOMIO: Kliseiset ilmaukset peräkkäin, eikä niille ole näkyvää syytä – Liisa odotti vain veljeään, eikä kohtauksessa ole tapahtunut mitään, joka oikeuttaisi näin voimakkaan reaktion.',
      'VAKAVUUS: keskisuuri',
      '',
      'LAINAUS: Åke-setä oli tavallaan aina sanonut, että järvi ottaa omansa. Se oli itse asiassa ainoa asia, jonka Liisa hänestä muisti.',
      'HUOMIO: Uusi hahmo ilmaantuu viimeisenä lauseena ilman johdantoa, ja "itse asiassa" ja "tavallaan" pehmentävät turhaan. Lukija jää miettimään, miksi tämä mainitaan juuri nyt – voi olla tarkoituksellinen vihjaus, mutta se jää irralliseksi.',
      'VAKAVUUS: keskisuuri',
      '',
      'LAINAUS: Sitten he menivät sisään ja keittivät kahvia ja puhuivat säästä ja naapurin uudesta veneestä ja siitä, pitäisikö katto uusia tänä vuonna vai vasta ensi vuonna.',
      'HUOMIO: Kertova siirtymä tuntuu hätäisesti tehdyltä heti Marjatta-paljastuksen jälkeen. Arkinen selostus tappoo juuri heränneen jännityksen, eikä Marjatta-kysymystä avata lainkaan.',
      'VAKAVUUS: suuri',
      '',
      'LAINAUS: Hän oli oikeastaan aika väsynyt, mutta ei halunnut näyttää sitä.',
      'HUOMIO: Tämä jää irralliseksi yksityiskohdaksi, jolla ei näy jälkeä kohtauksessa. Lukija odottaa, että väsymys tai sen peittäminen tulee myöhemmin relevantiksi.',
      'VAKAVUUS: pieni'
    ].join('\n')
  }
];

// The sources of the continuity probe: three entries and two chapter summaries
const SOURCES = [
  { key: 'codex:mokki', kind: 'codex', id: 'mokki', label: 'Mökki', text: 'Mökki (paikka): Hirsimökki Päijänteen rannalla. Isä rakensi sen vuonna 1978. Mökissä ei ole sähköä.' },
  { key: 'summary:c1', kind: 'summary', id: 'c1', label: 'Luku 1: Hautajaiset', text: 'Luku 1: Hautajaiset – Isä haudataan huhtikuussa. Liisa ja Antti riitelevät perinnöstä. Antti kertoo myyneensä autonsa.' },
  { key: 'summary:c2', kind: 'summary', id: 'c2', label: 'Luku 2: Matka', text: 'Luku 2: Matka – Sisarukset ajavat Liisan autolla mökille toukokuun lopussa. Antti on juuri lopettanut tupakoinnin.' },
  { key: 'codex:liisa', kind: 'codex', id: 'liisa', label: 'Liisa Koskela', text: 'Liisa Koskela (hahmo): Antin isosisko, 41-vuotias. Siniset silmät. Ei osaa uida. Asuu Tampereella.' },
  { key: 'codex:antti', kind: 'codex', id: 'antti', label: 'Antti Koskela', text: 'Antti Koskela (hahmo): Liisan pikkuveli, 36-vuotias. Vasenkätinen. Työskentelee puuseppänä.' }
];

// The parts of a built request that carry those sources, in the context builder's shape
function builtParts({ withText = true } = {}) {
  const item = (source) => {
    const entry = { key: source.key, label: source.label, chars: source.text.length };
    if (withText) entry.text = source.text;
    return entry;
  };
  const part = (id, where, sources) => ({
    id,
    where,
    label: id,
    state: 'sent',
    locked: false,
    text: sources.map(source => source.text).join('\n'),
    items: sources.map(item)
  });
  return [
    { id: 'task', where: 'system', label: 'tehtävän säännöt', state: 'sent', locked: true, text: 'säännöt' },
    part('codexAlways', 'system', [SOURCES[0]]),
    part('summaries', 'user', [SOURCES[1], SOURCES[2]]),
    part('codexMentioned', 'user', [SOURCES[3], SOURCES[4]]),
    { id: 'payload', where: 'user', label: 'tarkistettava teksti', state: 'sent', locked: true, text: 'teksti' }
  ];
}

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

describe('the request', () => {
  const SUGGEST_RULES = [
    '- Tarkista vain se asia, joka on annettu kohdassa <ohje>. Älä kommentoi mitään muuta.',
    '- Jokainen havainto on kolme riviä täsmälleen tässä muodossa:',
    'LAINAUS: kohta tekstistä sanasta sanaan, enintään 25 sanaa',
    'HUOMIO: mikä kohdassa on vialla, yksi tai kaksi virkettä',
    'EHDOTUS: lainattu kohta korjattuna, tai viiva (-), jos et ehdota uutta sanamuotoa',
    '- Lainaa vain <teksti>-osasta ja täsmälleen niin kuin se on kirjoitettu: samat sanat, sama järjestys, samat välimerkit. Älä lyhennä kolmella pisteellä äläkä yhdistä kahta kohtaa.',
    '- Jätä tyhjä rivi havaintojen väliin. Älä numeroi, älä käytä lihavointia, älä kirjoita johdantoa tai yhteenvetoa.',
    '- Älä anna arvosanaa tai pistemäärää äläkä kehu.',
    '- Jos huomautettavaa ei ole, vastaa vain: EI HAVAINTOJA',
    '- Enintään 12 havaintoa. Valitse tärkeimmät.',
    '- Jos ohjeessa on rivi Tahallista, kirjoittaja kertoo siinä, mikä on tarkoituksellista. Älä huomauta niistä asioista.'
  ];

  test('buildReviewTask for a suggest check asks for three lines with EHDOTUS', () => {
    const task = buildReviewTask({ check: check('filler'), note: '' });

    expect(task.rules).toEqual(SUGGEST_RULES);
    expect(task.role).toBe('Olet kustannustoimittaja. Luet käsikirjoituksen kohdan ja raportoit havaintosi yhdestä asiasta.');
    expect(task).toMatchObject({ id: 'review', payloadTag: 'teksti', payloadLabel: 'tarkistettava teksti', answerTokens: 1500 });
    // Every rule is one line of the system text
    for (const rule of task.rules) expect(rule).not.toContain('\n');
  });

  test('buildReviewTask for a check without suggest asks for two lines and has no EHDOTUS line', () => {
    const task = buildReviewTask({ check: check('cliche'), note: '' });

    const expected = SUGGEST_RULES.filter(rule => !rule.startsWith('EHDOTUS:'));
    expected[1] = '- Jokainen havainto on kaksi riviä täsmälleen tässä muodossa:';
    expect(task.rules).toEqual(expected);
    expect(task.rules.join('\n')).not.toContain('EHDOTUS');
    // An own check follows its own flag
    expect(buildReviewTask({ check: OWN_CHECK }).rules).toEqual(expected);
    expect(buildReviewTask({ check: { ...OWN_CHECK, suggest: true } }).rules).toEqual(SUGGEST_RULES);
  });

  test('buildReviewTask puts the check label and instruction into the instruction', () => {
    const filler = check('filler');
    expect(buildReviewTask({ check: filler, note: '' }).instruction).toBe(`Tarkistus: Täytesanat\n${filler.instruction}`);
    expect(buildReviewTask({ check: OWN_CHECK }).instruction)
      .toBe('Tarkistus: Näkökulma\nEtsi kohdat, joissa näkökulma vaihtuu kesken kappaleen.');
    expect(buildReviewTask({ check: check('continuity') }).instruction)
      .toBe('Tarkistus: Jatkuvuus\nVertaa tekstiä taustatietoihin ja raportoi ristiriidat.');
  });

  test('buildReviewTask adds Tahallista only when the note is not empty, as one line, cut at 1000 characters', () => {
    const filler = check('filler');
    const base = `Tarkistus: Täytesanat\n${filler.instruction}`;

    for (const empty of ['', '   ', '\n\n', null, undefined]) {
      expect(buildReviewTask({ check: filler, note: empty }).instruction).toBe(base);
    }
    expect(buildReviewTask({ check: filler, note: '  Liisan repliikit ovat murretta.\nLyhyet virkkeet ovat tyylikeino.\r\n\r\nÅke puhuu ruotsia. ' }).instruction)
      .toBe(`${base}\n\nTahallista: Liisan repliikit ovat murretta. Lyhyet virkkeet ovat tyylikeino. Åke puhuu ruotsia.`);

    const long = buildReviewTask({ check: filler, note: 'ä'.repeat(1500) }).instruction;
    expect(long).toBe(`${base}\n\nTahallista: ${'ä'.repeat(1000)}`);
    expect(REVIEW.NOTE_MAX_CHARS).toBe(1000);
  });

  test('buildReviewTask for continuity asks for LAINAUS, VERTAA, LÄHDE, HUOMIO and the entry and summary parts', () => {
    const task = buildReviewTask({ check: check('continuity'), note: '' });

    expect(task.role).toBe('Olet kustannustoimittaja. Vertaat käsikirjoituksen kohtaa kirjan taustatietoihin ja raportoit ristiriidat.');
    expect(task.rules).toEqual([
      '- Etsi vain ristiriitoja: kohdat, joissa <teksti> sanoo jotakin, mikä ei voi olla totta yhtä aikaa taustatietojen kanssa. Taustatietoja ovat <tarinakansio>, <tarinakansio_mainitut>, <tarinakansio_lisatyt> ja <aiemmat_luvut>. Älä kommentoi tyyliä, kieltä tai juonta.',
      '- Tieto, jota taustatiedoissa ei mainita, ei ole ristiriita. Älä arvaile.',
      '- Jokainen havainto on neljä riviä täsmälleen tässä muodossa:',
      'LAINAUS: kohta <teksti>-osasta sanasta sanaan, enintään 25 sanaa',
      'VERTAA: kohta taustatiedoista sanasta sanaan, enintään 25 sanaa',
      'LÄHDE: mistä taustatiedosta kohta on: merkinnän nimi tai Luku ja sen numero',
      'HUOMIO: mikä on ristiriidassa, yksi tai kaksi virkettä',
      '- Lainaa molemmat kohdat täsmälleen niin kuin ne on kirjoitettu: samat sanat, sama järjestys, samat välimerkit. Älä lyhennä kolmella pisteellä.',
      '- Jätä tyhjä rivi havaintojen väliin. Älä numeroi, älä käytä lihavointia, älä kirjoita johdantoa tai yhteenvetoa.',
      '- Jos ristiriitoja ei ole, vastaa vain: EI HAVAINTOJA',
      '- Enintään 12 havaintoa. Valitse selvimmät.',
      '- Jos ohjeessa on rivi Tahallista, kirjoittaja kertoo siinä, mikä on tarkoituksellista. Älä huomauta niistä asioista.'
    ]);
    expect(task.parts).toEqual(['codexAlways', 'codexMentioned', 'summaries']);
    expect(task.limits).toEqual({ summaries: 6000 });
    expect(task.answerTokens).toBe(2000);
    expect(task.rules.join('\n')).not.toContain('EHDOTUS');
  });

  test('model checks ask only for the style and brief parts', () => {
    for (const id of ['filler', 'cliche', 'dialogue', 'unsourced-claim', 'term-variation', 'paragraph-point']) {
      const task = buildReviewTask({ check: check(id), note: 'Huomio.' });
      expect(task.parts).toEqual(['style', 'brief']);
      expect(task).not.toHaveProperty('limits');
      expect(task.answerTokens).toBe(REVIEW.ANSWER_TOKENS);
    }
    expect(buildReviewTask({ check: OWN_CHECK }).parts).toEqual(['style', 'brief']);
  });

  test('buildReviewTask for reading feedback asks for LAINAUS, HUOMIO and VAKAVUUS and not for EHDOTUS', () => {
    const feedback = check('reading-feedback');
    const task = buildReviewTask({ check: feedback, note: 'Loppu on tarkoituksella avoin.' });

    expect(task.role).toBe('Olet kustannustoimittaja. Luet käsikirjoituksen luvun kokonaan ja annat lukupalautteen.');
    expect(task.rules).toEqual([
      '- Anna palaute vain tästä tekstistä. Älä kirjoita tekstiä uudelleen äläkä ehdota uusia sanamuotoja.',
      '- Jokainen havainto on kolme riviä täsmälleen tässä muodossa:',
      'LAINAUS: kohta tekstistä sanasta sanaan, enintään 25 sanaa',
      'HUOMIO: mitä lukija tässä kokee ja miksi, yksi tai kaksi virkettä',
      'VAKAVUUS: toimii, pieni, keskisuuri tai suuri',
      '- Kirjoita VAKAVUUS: toimii, kun kohta on onnistunut. Muut arvot ovat huolia sen mukaan, kuinka paljon kohta haittaa lukijaa.',
      '- Lainaa vain <teksti>-osasta ja täsmälleen niin kuin se on kirjoitettu: samat sanat, sama järjestys, samat välimerkit. Älä lyhennä kolmella pisteellä äläkä yhdistä kahta kohtaa.',
      '- Jätä tyhjä rivi havaintojen väliin. Älä numeroi, älä käytä lihavointia, älä kirjoita johdantoa tai yhteenvetoa.',
      '- Älä anna arvosanaa tai pistemäärää.',
      '- Jos sanottavaa ei ole, vastaa vain: EI HAVAINTOJA',
      '- Enintään 10 havaintoa: ensin kaksi tai kolme, jotka toimivat, sitten huolet tärkeimmästä alkaen.',
      '- Jos ohjeessa on rivi Tahallista, kirjoittaja kertoo siinä, mikä on tarkoituksellista. Älä pidä niitä huolina.'
    ]);
    expect(task.rules.join('\n')).not.toContain('EHDOTUS');
    expect(task.parts).toEqual(['style', 'brief', 'summaries']);
    expect(task.limits).toEqual({ summaries: 3000 });
    expect(task.answerTokens).toBe(2000);
    expect(task.instruction).toBe(`Tarkistus: Lukupalaute\n${feedback.instruction}\n\nTahallista: Loppu on tarkoituksella avoin.`);
    expect(task).toMatchObject({ id: 'review', payloadTag: 'teksti', payloadLabel: 'tarkistettava teksti' });
  });

  test('renderReviewRequest puts role, language rule and rules into system and <teksti> then <ohje> into the user message', () => {
    const task = buildReviewTask({ check: check('filler'), note: 'Murre on tahallista.' });
    const { system, messages } = renderReviewRequest(task, 'Hän vain katsoi.\n\n– Tuletko jo?');

    expect(system.split('\n')).toEqual([task.role, 'Kirjoita ja vastaa suomeksi.', ...task.rules]);
    expect(messages).toEqual([{
      role: 'user',
      content: `<teksti>\nHän vain katsoi.\n\n– Tuletko jo?\n</teksti>\n\n<ohje>\n${task.instruction}\n</ohje>`
    }]);
    // The text comes first and the author's note is the last thing the model reads
    expect(messages[0].content.endsWith('Tahallista: Murre on tahallista.\n</ohje>')).toBe(true);
  });

  test('renderReviewRequest uses the English language rule for en and the same Finnish rules', () => {
    const task = buildReviewTask({ check: check('cliche'), note: '' });
    const english = renderReviewRequest(task, 'The lake was calm.', 'en');
    const finnish = renderReviewRequest(task, 'The lake was calm.');

    expect(english.system.split('\n')).toEqual([task.role, 'Write and answer in English.', ...task.rules]);
    expect(english.messages[0].content).toBe(finnish.messages[0].content);
    // A language without a rule of its own gets the Finnish one
    expect(renderReviewRequest(task, 'x', 'sv').system).toBe(finnish.system);
  });
});

// ---------------------------------------------------------------------------
// What is sent
// ---------------------------------------------------------------------------

describe('what is sent', () => {
  const CHAPTER = [
    '# Ensimmäinen luku',
    '',
    'Aamu oli harmaa, ja Liisa seisoi laiturilla.',
    '',
    '* * *',
    '',
    '> Lainattu rivi kirjeestä.',
    '- luettelon kohta',
    '2) numeroitu kohta',
    '– Tuletko sinä jo? hän huusi.',
    '   '
  ].join('\n');

  test('selectReviewLines leaves out headings, scene breaks, blank lines and > quote lines', () => {
    const lines = selectReviewLines(CHAPTER, null, deps);
    expect(lines.map(line => line.text)).toEqual([
      'Aamu oli harmaa, ja Liisa seisoi laiturilla.',
      'luettelon kohta',
      'numeroitu kohta',
      '– Tuletko sinä jo? hän huusi.'
    ]);
    expect(lines.map(line => line.kind)).toEqual(['paragraph', 'list', 'list', 'paragraph']);
  });

  test('selectReviewLines sends a list line without its marker', () => {
    const lines = selectReviewLines(CHAPTER, null, deps);
    const item = lines[1];
    expect(item.text).toBe('luettelon kohta');
    // The offsets are those of the body: the marker stays local
    expect(CHAPTER.slice(item.from, item.to)).toBe('luettelon kohta');
    expect(CHAPTER.slice(item.from - 2, item.from)).toBe('- ');
    expect(CHAPTER.slice(lines[2].from, lines[2].to)).toBe('numeroitu kohta');
  });

  test('selectReviewLines widens a selection to whole lines', () => {
    const inside = CHAPTER.indexOf('Liisa');
    expect(selectReviewLines(CHAPTER, { from: inside, to: inside + 5 }, deps).map(line => line.text))
      .toEqual(['Aamu oli harmaa, ja Liisa seisoi laiturilla.']);

    // From the middle of one line to the middle of another: every line in between, whole
    const from = CHAPTER.indexOf('kohta');
    const to = CHAPTER.indexOf('sinä');
    expect(selectReviewLines(CHAPTER, { from, to }, deps).map(line => line.text))
      .toEqual(['luettelon kohta', 'numeroitu kohta', '– Tuletko sinä jo? hän huusi.']);

    // A selection inside a heading selects nothing that is sent
    expect(selectReviewLines(CHAPTER, { from: 2, to: 8 }, deps)).toEqual([]);
  });

  test('planBatches keeps order, never splits a line and joins lines with a blank line', () => {
    const text = ['Yksi kappale on tässä näin.', 'Toinen kappale on tässä näin.', 'Kolmas kappale on tässä.', 'Neljäs kappale on tässä.', 'Viides kappale.'].join('\n');
    const lines = selectReviewLines(text, null, deps);
    const spy = jest.fn(batchParagraphs);
    // Each line costs its length and the two characters of the blank line that joins it
    const batches = planBatches(lines, 60, { ...deps, batchParagraphs: spy });

    expect(spy).toHaveBeenCalledWith(lines, { max: 60, maxLines: REVIEW.BATCH_MAX_LINES, lineOverhead: 2 });
    expect(batches.map(batch => batch.text)).toEqual([
      'Yksi kappale on tässä näin.\n\nToinen kappale on tässä näin.',
      'Kolmas kappale on tässä.\n\nNeljäs kappale on tässä.',
      'Viides kappale.'
    ]);
    expect(batches.map(batch => batch.index)).toEqual([0, 1, 2]);
    expect(batches.every(batch => batch.oversize === false)).toBe(true);
    // A batch reaches from the start of its first line to the end of its last
    expect(batches[0]).toMatchObject({ from: 0, to: text.indexOf('\nKolmas') });
    expect(batches[1].from).toBe(text.indexOf('Kolmas'));
    expect(batches[2].to).toBe(text.length);
    // Every line is in exactly one batch
    expect(batches.map(batch => batch.text).join('\n\n')).toBe(lines.map(line => line.text).join('\n\n'));
  });

  test('planBatches gives an oversize line its own batch', () => {
    const long = `Pitkä kappale ${filler('sana', 30)}.`;
    const text = ['Lyhyt alku.', long, 'Lyhyt loppu.'].join('\n');
    const batches = planBatches(selectReviewLines(text, null, deps), 100, deps);

    expect(batches.map(batch => [batch.text, batch.oversize])).toEqual([
      ['Lyhyt alku.', false],
      [long, true],
      ['Lyhyt loppu.', false]
    ]);
  });

  test('planReview reports an empty selection as blocked without calling build twice', () => {
    const raw = 'Kappale yksi.\n\n# Otsikko\n\nKappale kaksi.';
    const build = fakeBuild();
    const heading = raw.indexOf('Otsikko');
    const plan = planReview({ check: check('filler'), text: raw, range: { from: heading, to: heading + 4 }, note: '', build, deps });

    expect(plan.blocked).toEqual({ reason: 'empty', message: 'Tarkistettavaa tekstiä ei ole.' });
    expect(plan.batches).toEqual([]);
    expect(build.mock.calls.length).toBeLessThan(2);
    // Nothing to send means nothing to measure: the builder is not asked at all
    expect(build).not.toHaveBeenCalled();
    // The task is there for the preview all the same
    expect(plan.task.instruction).toContain('Tarkistus: Täytesanat');

    for (const empty of ['', '   \n\n ', '# Vain otsikko\n\n* * *', '[TODO: kirjoita tämä luku]']) {
      expect(planReview({ check: check('filler'), text: empty, range: null, build, deps }).blocked.reason).toBe('empty');
    }
    expect(build).not.toHaveBeenCalled();
  });

  test('planReview passes on noAI with the context builder\'s message', () => {
    const build = jest.fn(() => ({ system: '', messages: [], parts: [], blocked: 'noAI' }));
    const plan = planReview({
      check: check('filler'), text: 'Hän vain katsoi.', range: null, note: '', build, deps, noAIMessage: 'Rakentajan oma lause.'
    });

    expect(plan.blocked).toEqual({ reason: 'noAI', message: 'Rakentajan oma lause.' });
    expect(plan.batches).toEqual([]);
    // One probe, without the text
    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0][0]).toMatchObject({ id: 'review', payload: '', payloadTag: 'teksti' });

    // Without a builder's sentence the one wording of the app is used
    expect(planReview({ check: check('filler'), text: 'Hän vain katsoi.', range: null, build, deps }).blocked.message)
      .toBe('Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.');

    const missing = planReview({ check: check('filler'), text: 'Hän vain katsoi.', range: null, build: () => ({ blocked: 'no-chapter' }), deps });
    expect(missing.blocked).toEqual({ reason: 'no-chapter', message: 'Lukua ei löytynyt.' });
  });

  test('planReview clamps the batch size between 1200 and 9000 characters, and to 6000 for continuity', () => {
    const text = 'Hän vain katsoi.';
    const sized = (id, numbers) => planReview({
      check: check(id), text, range: null, note: '', deps, build: () => ({ blocked: null, parts: [], ...numbers })
    }).maxChars;

    // available = floor(budgetTokens × charsPerToken) − totalChars − 40
    expect(sized('filler', { budgetTokens: 2000, charsPerToken: 3, totalChars: 1000 })).toBe(4960);
    expect(sized('filler', { budgetTokens: 2000, charsPerToken: 2.7, totalChars: 1000 })).toBe(4360);
    expect(sized('filler', { budgetTokens: 30000, charsPerToken: 3, totalChars: 1000 })).toBe(9000);
    expect(sized('filler', { budgetTokens: 500, charsPerToken: 3, totalChars: 1000 })).toBe(1200);
    expect(sized('filler', { budgetTokens: 100, charsPerToken: 3, totalChars: 5000 })).toBe(1200);

    // Continuity keeps half of the room for the entries the batch mentions
    expect(sized('continuity', { budgetTokens: 2000, charsPerToken: 3, totalChars: 1000 })).toBe(2480);
    expect(sized('continuity', { budgetTokens: 30000, charsPerToken: 3, totalChars: 1000 })).toBe(6000);
    expect(sized('continuity', { budgetTokens: 500, charsPerToken: 3, totalChars: 1000 })).toBe(1200);

    // A builder without budget numbers: the largest size of the check
    expect(sized('filler', {})).toBe(9000);
    expect(sized('continuity', {})).toBe(6000);
    expect([REVIEW.BATCH_MIN_CHARS, REVIEW.BATCH_MAX_CHARS, REVIEW.CONTINUITY_BATCH_MAX_CHARS]).toEqual([1200, 9000, 6000]);
  });

  test('planReview maps a raw selection onto the plain text and plans its lines only', () => {
    const raw = 'Eka kappale [TODO: tarkista] jatkuu.\n\nToka <u>kappale</u> on tässä.\n\nKolmas kappale.';
    const from = raw.indexOf('kappale</u>');
    const plan = planReview({ check: check('filler'), text: raw, range: { from, to: from + 7 }, note: '', build: fakeBuild(), deps });

    expect(plan.blocked).toBeNull();
    expect(plan.view.text).toBe('Eka kappale jatkuu.\n\nToka kappale on tässä.\n\nKolmas kappale.');
    expect(plan.batches.map(batch => batch.text)).toEqual(['Toka kappale on tässä.']);
    // Batch offsets are plain offsets; the view maps them back
    const range = plan.view.rawRange(plan.batches[0].from, plan.batches[0].to);
    expect(raw.slice(range.from, range.to)).toBe('Toka <u>kappale</u> on tässä.');

    // Without a range the whole chapter is planned, notes left out
    const whole = planReview({ check: check('filler'), text: raw, range: null, note: '', build: fakeBuild(), deps });
    expect(whole.batches.map(batch => batch.text)).toEqual(['Eka kappale jatkuu.\n\nToka kappale on tässä.\n\nKolmas kappale.']);
    expect(whole.message).toBeNull();
  });

  test('planReview for reading feedback ignores a selection and plans one batch for a chapter that fits', () => {
    // 120 short lines and about 16 000 characters: over the line limit and the 9 000 limit of the other checks
    const chapter = Array.from({ length: 120 }, (_unused, index) => `– Repliikki ${index}, hän sanoi. ${filler('sana', 14)}.`).join('\n');
    expect(chapter.length).toBeGreaterThan(REVIEW.BATCH_MAX_CHARS);
    const roomy = { budgetTokens: 30000, charsPerToken: 2.7 };

    const plan = planReview({
      check: check('reading-feedback'), text: chapter, range: { from: 10, to: 40 }, note: '', build: fakeBuild(roomy), deps
    });
    expect(plan.blocked).toBeNull();
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0].text).toBe(chapter.split('\n').join('\n\n'));
    expect(plan.maxChars).toBe(60000);
    expect(plan.message).toBeNull();

    // The same chapter and window with another check: several requests, and the selection counts
    const other = planReview({ check: check('filler'), text: chapter, range: null, note: '', build: fakeBuild(roomy), deps });
    expect(other.batches.length).toBeGreaterThan(1);
    const selected = planReview({ check: check('filler'), text: chapter, range: { from: 10, to: 40 }, note: '', build: fakeBuild(roomy), deps });
    expect(selected.batches.map(batch => batch.text)).toEqual([chapter.split('\n')[0]]);

    // The window, not the constant, is the limit when it is smaller
    const medium = planReview({
      check: check('reading-feedback'), text: chapter, range: null, note: '', deps,
      build: () => ({ blocked: null, parts: [], budgetTokens: 10000, charsPerToken: 3, totalChars: 2000 })
    });
    expect(medium.maxChars).toBe(27960);
    expect(medium.batches).toHaveLength(1);
  });

  test('a chapter that does not fit is planned in parts and the message says so', () => {
    const chapter = Array.from({ length: 30 }, (_unused, index) => `Kappale ${index} ${filler('sana', 60)}.`).join('\n\n');
    const small = () => ({ blocked: null, parts: [], budgetTokens: 3000, charsPerToken: 3, totalChars: 2000 });

    const plan = planReview({ check: check('reading-feedback'), text: chapter, range: null, note: '', build: small, deps });
    expect(plan.maxChars).toBe(6960);
    expect(plan.batches.length).toBeGreaterThan(1);
    // As few parts as the size allows: no two neighbours would fit into one
    for (let i = 1; i < plan.batches.length; i++) {
      expect(plan.batches[i - 1].text.length + 2 + plan.batches[i].text.length).toBeGreaterThan(plan.maxChars - 4);
    }
    expect(plan.message).toBe(`Luku ei mahtunut yhteen pyyntöön. Palaute on annettu ${plan.batches.length} osassa, eikä malli nähnyt lukua kokonaisena.`);
  });
});

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

describe('the parser', () => {
  const finding = (fields) => ({ quote: '', note: '', suggestion: null, compare: null, source: null, severity: null, complete: true, ...fields });

  test('parses three findings in the plain format', () => {
    const parsed = parseFindings([
      'LAINAUS: Aamu oli jotenkin harmaa',
      'HUOMIO: Jotenkin on täytesana.',
      'EHDOTUS: Aamu oli harmaa',
      '',
      'LAINAUS: Hän oli oikeastaan aika väsynyt',
      'HUOMIO: Kaksi täytesanaa peräkkäin.',
      'EHDOTUS: Hän oli väsynyt',
      '',
      'LAINAUS: Se oli itse asiassa ainoa asia',
      'HUOMIO: Itse asiassa ei lisää mitään.',
      'EHDOTUS: Se oli ainoa asia'
    ].join('\n'));

    expect(parsed).toEqual({
      findings: [
        finding({ quote: 'Aamu oli jotenkin harmaa', note: 'Jotenkin on täytesana.', suggestion: 'Aamu oli harmaa' }),
        finding({ quote: 'Hän oli oikeastaan aika väsynyt', note: 'Kaksi täytesanaa peräkkäin.', suggestion: 'Hän oli väsynyt' }),
        finding({ quote: 'Se oli itse asiassa ainoa asia', note: 'Itse asiassa ei lisää mitään.', suggestion: 'Se oli ainoa asia' })
      ],
      none: false,
      stray: 0,
      extra: 0,
      format: 'ok'
    });
  });

  test('keeps a leading dialogue dash in LAINAUS and EHDOTUS (– Kuten tiedät, isä kuoli.)', () => {
    const parsed = parseFindings('LAINAUS: – Kuten tiedät, isä kuoli.\nHUOMIO: Selittää asian, jonka molemmat tietävät.\nEHDOTUS: – Isä kuoli.');
    expect(parsed.findings).toEqual([
      finding({ quote: '– Kuten tiedät, isä kuoli.', note: 'Selittää asian, jonka molemmat tietävät.', suggestion: '– Isä kuoli.' })
    ]);
    // A plain hyphen as a dialogue dash is kept the same way
    expect(parseFindings('LAINAUS: - Tuletko?\nHUOMIO: x y').findings[0].quote).toBe('- Tuletko?');
  });

  test('EHDOTUS: - and EHDOTUS: – and EHDOTUS: ei ehdotusta mean no suggestion', () => {
    for (const value of ['-', '–', '—', '--', 'ei ehdotusta', 'Ei ehdotusta.', 'EI MUUTOSTA', 'ei korjausta', 'n/a', 'none', 'No suggestion.', '', '   ']) {
      const parsed = parseFindings(`LAINAUS: Aika tuntui pysähtyvän,\nHUOMIO: Klisee.\nEHDOTUS: ${value}`);
      expect(parsed.findings).toEqual([finding({ quote: 'Aika tuntui pysähtyvän,', note: 'Klisee.' })]);
      expect(parsed.stray).toBe(0);
    }
  });

  test('EHDOTUS: – Isä kuoli. is a suggestion', () => {
    expect(parseFindings('LAINAUS: – Kuten tiedät, isä kuoli.\nHUOMIO: x y\nEHDOTUS: – Isä kuoli.').findings[0].suggestion).toBe('– Isä kuoli.');
    expect(parseFindings('LAINAUS: a b\nHUOMIO: x y\nEHDOTUS: - Isä kuoli.').findings[0].suggestion).toBe('- Isä kuoli.');
    expect(parseFindings('LAINAUS: a b\nHUOMIO: x y\nEHDOTUS: Ei, hän sanoi.').findings[0].suggestion).toBe('Ei, hän sanoi.');
  });

  test('a suggestion equal to the quote is no suggestion', () => {
    expect(parseFindings('LAINAUS: Hän istui.\nHUOMIO: x y\nEHDOTUS: Hän istui.').findings[0].suggestion).toBeNull();
    // Compared after trimming, in either order of the fields
    expect(parseFindings('EHDOTUS:   Hän istui.  \nHUOMIO: x y\nLAINAUS: Hän istui.').findings[0].suggestion).toBeNull();
  });

  test('accepts **LAINAUS:**, 1. LAINAUS:, - Huomio:, ### EHDOTUS: and mixed case', () => {
    const parsed = parseFindings([
      'Tässä havaintoni:',
      '',
      '1. **LAINAUS:** ”Ei tässä mitään kiirettä ole”',
      '   **HUOMIO:** Ajatus on *turha*.',
      '   **EHDOTUS:** –',
      '',
      '2. **Lainaus**: Åke-setä oli tavallaan',
      '   - Huomio: täytesana',
      '   ### EHDOTUS: Åke-setä oli',
      '',
      '3) `lainaus`: Hän vain katsoi',
      '• huomio : vain on turha',
      '* _Ehdotus:_ Hän katsoi'
    ].join('\n'));

    expect(parsed.findings).toEqual([
      finding({ quote: '”Ei tässä mitään kiirettä ole”', note: 'Ajatus on *turha*.' }),
      finding({ quote: 'Åke-setä oli tavallaan', note: 'täytesana', suggestion: 'Åke-setä oli' }),
      finding({ quote: 'Hän vain katsoi', note: 'vain on turha', suggestion: 'Hän katsoi' })
    ]);
    expect(parsed.stray).toBe(1);
  });

  test('accepts the aliases SITAATTI, HUOMAUTUS, KORJAUS and QUOTE, NOTE, SUGGESTION', () => {
    expect(parseFindings('SITAATTI: Järvi oli tyyni.\nHUOMAUTUS: Klisee.\nKORJAUS: Järvi lepäsi.').findings).toEqual([
      finding({ quote: 'Järvi oli tyyni.', note: 'Klisee.', suggestion: 'Järvi lepäsi.' })
    ]);
    expect(parseFindings('QUOTE: The lake was calm.\nNOTE: Cliché.\nSUGGESTION: none').findings).toEqual([
      finding({ quote: 'The lake was calm.', note: 'Cliché.' })
    ]);
    // The longer name wins: KORJAUSEHDOTUS is not KORJAUS followed by text
    expect(parseFindings('KOHTA: a b\nONGELMA: c d\nKORJAUSEHDOTUS: e f').findings).toEqual([
      finding({ quote: 'a b', note: 'c d', suggestion: 'e f' })
    ]);
    expect(parseFindings('LAINAUS: a b\nTOINEN   LAINAUS: c d\nHAVAINTO: e f').findings).toEqual([
      finding({ quote: 'a b', note: 'e f', compare: 'c d' })
    ]);
  });

  test('accepts LAHDE without dots and a full-width colon', () => {
    const parsed = parseFindings('LAINAUS： Hänen ruskeat silmänsä\nVERTAA： Siniset silmät.\nLAHDE： Liisa Koskela\nHUOMIO： Väri vaihtuu.');
    expect(parsed.findings).toEqual([
      finding({ quote: 'Hänen ruskeat silmänsä', note: 'Väri vaihtuu.', compare: 'Siniset silmät.', source: 'Liisa Koskela' })
    ]);
    expect(parseFindings('lähde: Luku 2\nlainaus: a b\nhuomio: c d').findings[0].source).toBe('Luku 2');
  });

  test('keeps colons inside values (Hän sanoi: ”Tule.”)', () => {
    const parsed = parseFindings('LAINAUS: Hän sanoi: ”Tule.”\nHUOMIO: Huomio: kaksoispiste arvossa.\nEHDOTUS: Hän sanoi: tule.');
    expect(parsed.findings).toEqual([
      finding({ quote: 'Hän sanoi: ”Tule.”', note: 'Huomio: kaksoispiste arvossa.', suggestion: 'Hän sanoi: tule.' })
    ]);
  });

  test('keeps ä, ö, å, ” and – in values byte for byte (Åke-setä sanoi: ”Älä!” – ja lähti.)', () => {
    const quote = 'Åke-setä sanoi: ”Älä!” – ja lähti.';
    const parsed = parseFindings(`LAINAUS: ${quote}\nHUOMIO: Öinen ääni – ”hyvä” näin.\nEHDOTUS: Åke-setä sanoi: ”Älä!” Ja lähti.`);
    expect(parsed.findings[0].quote).toBe(quote);
    expect(parsed.findings[0].quote.normalize('NFC')).toBe(quote);
    expect(Array.from(parsed.findings[0].quote).map(ch => ch.codePointAt(0))).toEqual(Array.from(quote).map(ch => ch.codePointAt(0)));
    expect(parsed.findings[0].note).toBe('Öinen ääni – ”hyvä” näin.');
    expect(parsed.findings[0].suggestion).toBe('Åke-setä sanoi: ”Älä!” Ja lähti.');
  });

  test('does not strip wrapping quotation marks from a quote (”Ei tässä mitään kiirettä ole”)', () => {
    expect(parseFindings('LAINAUS: ”Ei tässä mitään kiirettä ole”\nHUOMIO: Ajatus toistaa repliikin.').findings[0].quote)
      .toBe('”Ei tässä mitään kiirettä ole”');
    expect(parseFindings('LAINAUS: "Ei tässä mitään kiirettä ole"\nHUOMIO: x y').findings[0].quote).toBe('"Ei tässä mitään kiirettä ole"');
  });

  test('a continuation line is appended to its field, also when it starts with a dash', () => {
    const parsed = parseFindings('LAINAUS: – Tuletko?\nHUOMIO: Kaksi\nriviä huomiota.\nEHDOTUS: – Tuletko jo?\n– Tulen.');
    expect(parsed.findings).toEqual([
      finding({ quote: '– Tuletko?', note: 'Kaksi riviä huomiota.', suggestion: '– Tuletko jo?\n– Tulen.' })
    ]);
    expect(parsed.stray).toBe(0);

    // A value that starts on the line after its label
    expect(parseFindings('LAINAUS:\nAamu oli harmaa\nja sumuinen.\nHUOMIO: x y').findings[0].quote).toBe('Aamu oli harmaa\nja sumuinen.');
  });

  test('a blank line ends the field but not the finding', () => {
    const parsed = parseFindings('LAINAUS: Hän istui.\n\nHUOMIO: Lyhyt.\n\nirrallinen rivi\nEHDOTUS: Hän istahti.');
    expect(parsed.findings).toEqual([finding({ quote: 'Hän istui.', note: 'Lyhyt.', suggestion: 'Hän istahti.' })]);
    // The loose line after the blank line was not added to the note
    expect(parsed.stray).toBe(1);
  });

  test('HUOMIO before LAINAUS belongs to the same finding', () => {
    const parsed = parseFindings('HUOMIO: Luvussa ei ole jännitettä.\nLAINAUS: Hän istui.\nEHDOTUS: -');
    expect(parsed.findings).toEqual([finding({ quote: 'Hän istui.', note: 'Luvussa ei ole jännitettä.' })]);
  });

  test('a second HUOMIO without LAINAUS starts a finding with an empty quote, which is kept', () => {
    const parsed = parseFindings('HUOMIO: Luvussa ei ole jännitettä.\nLAINAUS: Hän istui.\nEHDOTUS: -\nHUOMIO: Toinen ilman lainausta.');
    expect(parsed.findings).toEqual([
      finding({ quote: 'Hän istui.', note: 'Luvussa ei ole jännitettä.' }),
      finding({ quote: '', note: 'Toinen ilman lainausta.', complete: false })
    ]);
    expect(parsed.format).toBe('ok');
  });

  test('a second EHDOTUS in one finding is ignored and counted as stray', () => {
    const parsed = parseFindings('LAINAUS: a b\nHUOMIO: c d\nEHDOTUS: eka\nEHDOTUS: toka\njatkorivi');
    expect(parsed.findings).toEqual([finding({ quote: 'a b', note: 'c d', suggestion: 'eka' })]);
    // The ignored field and the line that continued it
    expect(parsed.stray).toBe(2);
  });

  test('preamble and closing summary lines are counted as stray and change nothing', () => {
    const body = 'LAINAUS: Hän vain katsoi.\nHUOMIO: Täytesana.\nEHDOTUS: Hän katsoi.';
    const plain = parseFindings(body);
    const wrapped = parseFindings(`Tässä ovat havaintoni tekstistä.\nKäytin pyydettyä muotoa.\n\n${body}\n\nYhteensä löytyi yksi täytesana.`);

    expect(wrapped.findings).toEqual(plain.findings);
    expect(wrapped.stray).toBe(3);
    expect(plain.stray).toBe(0);
    expect(wrapped.format).toBe('ok');
  });

  test('code fences are skipped', () => {
    const parsed = parseFindings('```text\nLAINAUS: Aamu oli harmaa\nja sumuinen.\nHUOMIO: Kaksi\nriviä.\n```\n~~~\nLAINAUS: Toinen kohta.\n~~~\nHUOMIO: Aidan jälkeen.');
    expect(parsed.findings).toEqual([
      finding({ quote: 'Aamu oli harmaa\nja sumuinen.', note: 'Kaksi riviä.' }),
      finding({ quote: 'Toinen kohta.', note: 'Aidan jälkeen.' })
    ]);
    expect(parsed.stray).toBe(0);
  });

  test('a leading <think> block is removed, including label lines inside it', () => {
    const parsed = parseFindings('<think>\nLAINAUS: ei tätä\nHUOMIO: ei tätäkään\n</think>\n\nLAINAUS: Oikea kohta.\nHUOMIO: Kyllä.');
    expect(parsed.findings).toEqual([finding({ quote: 'Oikea kohta.', note: 'Kyllä.' })]);
    expect(parsed.stray).toBe(0);

    expect(parseFindings('  <THINKING>mietin</THINKING>LAINAUS: a b\nHUOMIO: c d').findings).toHaveLength(1);
    expect(parseFindings('<reasoning>LAINAUS: x y</reasoning>\nEI HAVAINTOJA')).toMatchObject({ findings: [], none: true, format: 'ok' });
    // Only reasoning came back
    expect(parseFindings('<think>LAINAUS: a b\nHUOMIO: c d</think>').format).toBe('empty');
    // A block in the middle of an answer is not reasoning that was sent first
    expect(parseFindings('LAINAUS: a b\nHUOMIO: c d\n<think>loppu</think>').findings[0].note).toBe('c d <think>loppu</think>');
  });

  test('a <think> block that never closes leaves an empty answer', () => {
    // The answer was cut inside the reasoning: label lines in it are not findings
    const parsed = parseFindings('<think>\nKäyn tekstin läpi.\nLAINAUS: Hän vain katsoi.\nHUOMIO: ehkä tämä');
    expect(parsed).toEqual({ findings: [], none: false, stray: 0, extra: 0, format: 'empty' });
  });

  test('EI HAVAINTOJA alone gives none true and format ok', () => {
    expect(parseFindings('EI HAVAINTOJA')).toEqual({ findings: [], none: true, stray: 0, extra: 0, format: 'ok' });
    expect(parseFindings('\n  ei havaintoja  \n')).toMatchObject({ none: true, format: 'ok', stray: 0 });
  });

  test('**Ei havaintoja.** and EI RISTIRIITOJA are markers too', () => {
    for (const marker of ['**Ei havaintoja.**', 'EI RISTIRIITOJA', '- Ei huomautettavaa.', 'EI LÖYDÖKSIÄ!', 'No findings.', '> ei   ristiriitoja <']) {
      expect(parseFindings(marker)).toMatchObject({ findings: [], none: true, format: 'ok', stray: 0 });
    }
    // The words inside a sentence are not a marker
    expect(parseFindings('Tekstissä ei havaintoja kannata tehdä.')).toMatchObject({ none: false, format: 'unparsed' });
  });

  test('findings win when a marker is also present', () => {
    const parsed = parseFindings('EI HAVAINTOJA\n\nLAINAUS: Hän vain katsoi.\nHUOMIO: Täytesana.');
    expect(parsed.none).toBe(true);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.format).toBe('ok');
  });

  test('prose without any label is unparsed, not "no findings"', () => {
    const parsed = parseFindings('Teksti on erinomaista, en löytänyt huomautettavaa mistään.\nJatka samaan malliin.');
    expect(parsed).toEqual({ findings: [], none: false, stray: 2, extra: 0, format: 'unparsed' });
    // Labels without any value are nothing either
    expect(parseFindings('LAINAUS:\nHUOMIO:').format).toBe('unparsed');
  });

  test('an empty or whitespace answer is empty', () => {
    for (const text of ['', '  \n\t\n', null, undefined]) {
      expect(parseFindings(text)).toEqual({ findings: [], none: false, stray: 0, extra: 0, format: 'empty' });
    }
  });

  test('at most 40 findings; the rest are counted in extra', () => {
    const many = Array.from({ length: 45 }, (_unused, index) => `LAINAUS: kohta ${index}\nHUOMIO: huomio ${index}`).join('\n\n');
    const parsed = parseFindings(many);
    expect(parsed.findings).toHaveLength(40);
    expect(parsed.extra).toBe(5);
    expect(parsed.findings[39].quote).toBe('kohta 39');
    expect(REVIEW.MAX_PARSED).toBe(40);

    const capped = parseFindings(many, { max: 3 });
    expect([capped.findings.length, capped.extra]).toEqual([3, 42]);
  });

  test('continuity fields VERTAA and LÄHDE are read', () => {
    const parsed = parseFindings('LAINAUS: Hänen ruskeat silmänsä kirvelivät\nVERTAA: Siniset\nsilmät.\nLÄHDE: tarinakansio:\nLiisa Koskela (hahmo)\nHUOMIO: Väri vaihtuu.');
    expect(parsed.findings).toEqual([
      finding({
        quote: 'Hänen ruskeat silmänsä kirvelivät',
        note: 'Väri vaihtuu.',
        compare: 'Siniset\nsilmät.',
        source: 'tarinakansio: Liisa Koskela (hahmo)'
      })
    ]);
    // A second VERTAA in one finding is noise, like a second EHDOTUS
    expect(parseFindings('LAINAUS: a b\nVERTAA: c d\nVERTAA: e f\nHUOMIO: g h')).toMatchObject({ stray: 1, findings: [{ compare: 'c d' }] });
  });

  test('the last finding of a cut answer is marked incomplete when it has no HUOMIO', () => {
    const parsed = parseFindings('LAINAUS: Hän vain katsoi.\nHUOMIO: Täytesana.\nEHDOTUS: Hän katsoi.\n\nLAINAUS: Aika tuntui pysäht');
    expect(parsed.findings.map(entry => entry.complete)).toEqual([true, false]);
    expect(parsed.findings[1]).toEqual(finding({ quote: 'Aika tuntui pysäht', complete: false }));
  });

  test('CRLF line ends are read like LF', () => {
    const unix = parseFindings('LAINAUS: – Tule!\nHUOMIO: Kaksi\nriviä.\n\nLAINAUS: Toinen.\nHUOMIO: x y');
    const windows = parseFindings('LAINAUS: – Tule!\r\nHUOMIO: Kaksi\r\nriviä.\r\n\r\nLAINAUS: Toinen.\r\nHUOMIO: x y');
    const oldMac = parseFindings('LAINAUS: – Tule!\rHUOMIO: Kaksi\rriviä.\r\rLAINAUS: Toinen.\rHUOMIO: x y');
    expect(windows).toEqual(unix);
    expect(oldMac).toEqual(unix);
    expect(unix.findings).toHaveLength(2);
    expect(JSON.stringify(windows)).not.toContain('\\r');
  });

  test('decoration that wraps a whole label line is removed at both ends', () => {
    const parsed = parseFindings('**LAINAUS: Hän vain katsoi.**\n**HUOMIO: Täytesana.**\n_EHDOTUS: Hän katsoi._');
    expect(parsed.findings).toEqual([finding({ quote: 'Hän vain katsoi.', note: 'Täytesana.', suggestion: 'Hän katsoi.' })]);
    // Emphasis that belongs to the value stays
    expect(parseFindings('**LAINAUS:** Hän sanoi **ei**\nHUOMIO: x y').findings[0].quote).toBe('Hän sanoi **ei**');
    expect(parseFindings('LAINAUS: Hän sanoi **ei**\nHUOMIO: x y').findings[0].quote).toBe('Hän sanoi **ei**');
  });

  test('parseFindings reads VAKAVUUS: toimii, pieni, keskisuuri and suuri, also written as **Vakavuus:** Suuri.', () => {
    const parsed = parseFindings([
      'LAINAUS: Kassista työntyi esiin isän vanha virveli',
      'HUOMIO: Esine kantaa tarinaa.',
      'VAKAVUUS: toimii',
      '',
      'LAINAUS: – Tuletko sinä jo? hän huusi vihaisesti.',
      'HUOMIO: Vihaisuus yllättää.',
      'VAKAVUUS: pieni',
      '',
      'LAINAUS: Liisan sydän hakkasi rinnassa.',
      'HUOMIO: Kliseitä peräkkäin.',
      'VAKAVUUS: keskisuuri',
      '',
      '**Lainaus:** Sitten he menivät sisään',
      '**Huomio:** Jännite katoaa.',
      '**Vakavuus:** Suuri.'
    ].join('\n'));

    expect(parsed.findings.map(entry => entry.severity)).toEqual(['works', 'low', 'medium', 'high']);
    expect(parsed.findings.every(entry => entry.complete && entry.suggestion === null)).toBe(true);
    expect(parsed.stray).toBe(0);

    // The first word decides; case, emphasis and what follows do not matter
    const severityOf = (value) => parseFindings(`LAINAUS: a b\nHUOMIO: c d\nVAKAVUUS: ${value}`).findings[0].severity;
    expect(severityOf('TOIMII')).toBe('works');
    expect(severityOf('*suuri*')).toBe('high');
    expect(severityOf('suuri, koska jännite katoaa')).toBe('high');
    expect(severityOf('Keskisuuri (lukija hämmentyy)')).toBe('medium');
    expect(severityOf('vähäinen')).toBe('low');
    expect(severityOf('kohtalainen.')).toBe('medium');
    expect(severityOf('vakava!')).toBe('high');
    expect(parseFindings('QUOTE: a b\nNOTE: c d\nSEVERITY: major').findings[0].severity).toBe('high');
    expect(parseFindings('LAINAUS: a b\nHUOMIO: c d\nVAKAVUUSASTE: pieni').findings[0].severity).toBe('low');
    expect(SEVERITY_WORDS).toEqual({
      works: ['toimii', 'toimiva', 'works'],
      low: ['pieni', 'vähäinen', 'low', 'minor'],
      medium: ['keskisuuri', 'kohtalainen', 'medium'],
      high: ['suuri', 'vakava', 'high', 'major']
    });
  });

  test('an unknown severity word gives null and the finding is kept', () => {
    const parsed = parseFindings('LAINAUS: Hän istui.\nHUOMIO: Lyhyt virke.\nVAKAVUUS: valtava\n\nLAINAUS: Toinen kohta.\nHUOMIO: Ilman vakavuutta.\n\nLAINAUS: Kolmas.\nHUOMIO: Tyhjä vakavuus.\nVAKAVUUS:');
    expect(parsed.findings).toEqual([
      finding({ quote: 'Hän istui.', note: 'Lyhyt virke.' }),
      finding({ quote: 'Toinen kohta.', note: 'Ilman vakavuutta.' }),
      finding({ quote: 'Kolmas.', note: 'Tyhjä vakavuus.' })
    ]);
    expect(parsed.format).toBe('ok');
    // A number is not a severity: no score is read
    expect(parseFindings('LAINAUS: a b\nHUOMIO: c d\nVAKAVUUS: 4/5').findings[0].severity).toBeNull();
  });

  test('VAKAVUUS never starts a new finding and a second one is stray', () => {
    const parsed = parseFindings('VAKAVUUS: suuri\nLAINAUS: Hän istui.\nHUOMIO: Lyhyt.\nVAKAVUUS: pieni\nLAINAUS: Toinen.\nVAKAVUUS: toimii\nHUOMIO: Hyvä.');
    expect(parsed.findings).toEqual([
      finding({ quote: 'Hän istui.', note: 'Lyhyt.', severity: 'high' }),
      finding({ quote: 'Toinen.', note: 'Hyvä.', severity: 'works' })
    ]);
    expect(parsed.stray).toBe(1);
  });

  test('LABELS and NONE_MARKERS are the documented lists', () => {
    expect(LABELS).toEqual({
      quote: ['LAINAUS', 'SITAATTI', 'KOHTA', 'QUOTE'],
      note: ['HUOMIO', 'HUOMAUTUS', 'HAVAINTO', 'ONGELMA', 'NOTE', 'COMMENT', 'ISSUE'],
      suggestion: ['EHDOTUS', 'KORJAUSEHDOTUS', 'KORJAUS', 'SUGGESTION', 'FIX'],
      compare: ['VERTAA', 'VERTAILU', 'TOINEN LAINAUS', 'COMPARE'],
      source: ['LÄHDE', 'LAHDE', 'SOURCE'],
      severity: ['VAKAVUUS', 'VAKAVUUSASTE', 'SEVERITY']
    });
    expect(NONE_MARKERS).toEqual(['EI HAVAINTOJA', 'EI HUOMAUTETTAVAA', 'EI LÖYDÖKSIÄ', 'EI RISTIRIITOJA', 'NO FINDINGS']);
    // Every name is read as its own field
    for (const [field, names] of Object.entries(LABELS)) {
      for (const name of names) {
        const parsed = parseFindings(`LAINAUS: a b\nHUOMIO: c d\n${name}: toimii`);
        if (field === 'quote' || field === 'note') expect(parsed.findings).toHaveLength(2);
        else expect(parsed.findings[0][field]).not.toBeNull();
      }
    }
  });

  // What each recorded answer holds: findings, and how many of them carry a suggestion
  const EXPECTED = [
    ['tayte', 5, 5], ['klisee', 4, 3], ['dialogi', 2, 2], ['puhdas', 1, 0], ['jatkuvuus', 6, 0], ['jatkuvuus', 8, 0],
    ['dialogi', 2, 1], ['layout-tayte', 5, 5], ['layout-klisee', 4, 0], ['layout-lahde', 5, 0], ['layout-termi', 3, 0],
    ['layout-jatkuvuus', 5, 0], ['layout-jatkuvuus', 6, 0]
  ];

  function placeRecorded(textDeps) {
    const totals = { findings: 0, located: 0, approximate: [], references: 0, referencesLocated: 0, duplicates: 0 };
    for (const row of RECORDED) {
      const continuity = row.source === 'continuity';
      const placed = place(RECORDED_TEXTS[row.source], row.text, { sources: continuity ? SOURCES : undefined, textDeps });
      totals.findings += placed.drafts.length;
      totals.located += placed.drafts.filter(draft => draft.located).length;
      totals.approximate.push(...placed.drafts.filter(draft => draft.approx).map(draft => draft.modelQuote));
      totals.duplicates += placed.duplicates;
      if (continuity) {
        totals.references += placed.drafts.length;
        totals.referencesLocated += placed.drafts.filter(draft => draft.ref && draft.ref.located).length;
      }
    }
    return totals;
  }
  const RECORDED_TOTALS = {
    findings: 56,
    located: 56,
    // One model wrote the character's name where the text has "Hän"
    approximate: ['Antti oli ajanut mökille omalla autollaan jo edellisenä iltana.'],
    references: 25,
    referencesLocated: 25,
    duplicates: 0
  };

  test('parses the recorded gateway answers of 16 Nov 2026', () => {
    expect(RECORDED).toHaveLength(13);
    RECORDED.forEach((row, index) => {
      const parsed = parseFindings(row.text);
      const [name, findings, suggestions] = EXPECTED[index];
      expect(row.check).toBe(name);
      // Every answer used the labels exactly: no preamble, no numbering, nothing left over
      expect(parsed).toMatchObject({ format: 'ok', none: false, stray: 0, extra: 0 });
      expect(parsed.findings).toHaveLength(findings);
      expect(parsed.findings.filter(entry => entry.suggestion !== null)).toHaveLength(suggestions);
      expect(parsed.findings.every(entry => entry.complete)).toBe(true);
      if (row.source === 'continuity') {
        expect(parsed.findings.every(entry => entry.compare && entry.source)).toBe(true);
      }
    });

    // A dialogue line keeps its dash through the parser, in the quote and in the suggestion
    const dialogue = parseFindings(RECORDED[2].text).findings[1];
    expect(dialogue.quote).toBe('– Tuletko sinä jo? hän huusi vihaisesti.');
    expect(dialogue.suggestion).toBe('– Tuletko sinä jo? hän huusi.');
    // "EHDOTUS: -" is no suggestion
    expect(parseFindings(RECORDED[1].text).findings[2]).toMatchObject({ quote: 'Aika tuntui pysähtyvän,', suggestion: null });

    // Every finding is found in the text its model read, notes and tags in the source or not
    expect(placeRecorded(deps)).toEqual(RECORDED_TOTALS);
  });

  withRealModules('the recorded answers are placed the same way by the real text modules', () => {
    expect(placeRecorded(realDeps)).toEqual(RECORDED_TOTALS);
  });

  test('parses the recorded reading-feedback answers of 16 Nov 2026', () => {
    expect(RECORDED_FEEDBACK.map(row => row.model)).toEqual(['deepseek-v4.1-flash-abliterated-fast', 'glm-5.3-flash-abliterated']);
    const [fast, flash] = RECORDED_FEEDBACK.map(row => parseFindings(row.text));

    for (const parsed of [fast, flash]) {
      // All three fields in every finding, no stray lines, no suggestion asked or given
      expect(parsed).toMatchObject({ format: 'ok', none: false, stray: 0, extra: 0 });
      expect(parsed.findings.every(entry => entry.complete && entry.severity !== null && entry.suggestion === null)).toBe(true);
    }
    expect(fast.findings.map(entry => entry.severity)).toEqual(['works', 'works', 'works', 'medium', 'medium', 'low']);
    // This model did not order its concerns by severity: the list is sorted locally
    expect(flash.findings.map(entry => entry.severity)).toEqual(['works', 'works', 'low', 'medium', 'medium', 'medium', 'high', 'low']);

    const placedFast = place(RECORDED_TEXTS.feedback, fast, { maxChars: REVIEW.FEEDBACK_BATCH_MAX_CHARS });
    const placedFlash = place(RECORDED_TEXTS.feedback, flash, { maxChars: REVIEW.FEEDBACK_BATCH_MAX_CHARS });
    expect(placedFast.batches).toHaveLength(1);
    // 13 of the 14 quotes are word for word. The misquoted one ("tavallaisesti" for "tavallaan")
    // is found by its tail and marked approximate.
    expect(placedFast.drafts.map(draft => [draft.located, draft.approx])).toEqual([
      [true, false], [true, false], [true, true], [true, false], [true, false], [true, false]
    ]);
    expect(placedFast.drafts[2]).toMatchObject({
      quote: 'aina sanonut, että järvi ottaa omansa.',
      modelQuote: 'Åke-setä oli tavallaisesti aina sanonut, että järvi ottaa omansa.',
      severity: 'works'
    });
    expect(placedFlash.drafts.every(draft => draft.located && !draft.approx)).toBe(true);
    expect(placedFlash.drafts.map(draft => draft.severity)).toEqual(flash.findings.map(entry => entry.severity));
    expect(placedFast.duplicates + placedFlash.duplicates).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Judging one answer
// ---------------------------------------------------------------------------

describe('judging', () => {
  const FINDINGS_TEXT = 'LAINAUS: Hän vain katsoi.\nHUOMIO: Täytesana.';
  const judge = (result) => judgeBatch(result, parseFindings(result.text));

  test('a cancelled result is stopped', () => {
    expect(judge(answer(FINDINGS_TEXT, { cancelled: true }))).toEqual({ status: 'stopped', reason: 'cancelled', message: null, fatal: false });
    // Cancelling wins over everything else that is also true of the result
    expect(judge(answer('', { cancelled: true, ok: false, error: { code: 'aborted', message: 'x' } })).status).toBe('stopped');
  });

  test('an error result is failed with the error message, and fatal for ai_off, no_bridge and no_model', () => {
    expect(judge(failure('http_502', 'Yhdyskäytävä ei vastannut (502).')))
      .toEqual({ status: 'failed', reason: 'http_502', message: 'Yhdyskäytävä ei vastannut (502).', fatal: false });

    for (const code of ['ai_off', 'no_bridge', 'no_model']) {
      expect(judge(failure(code, 'Viesti.'))).toEqual({ status: 'failed', reason: code, message: 'Viesti.', fatal: true });
    }
    expect(REVIEW.FATAL_CODES).toEqual(['ai_off', 'no_bridge', 'no_model']);

    // An error result without details is still a failure with something to show
    const bare = judgeBatch({ ok: false, text: '' }, parseFindings(''));
    expect(bare).toMatchObject({ status: 'failed', reason: 'error', fatal: false });
    expect(bare.message).toBe('Pyyntö epäonnistui.');
  });

  test('a refusal is failed', () => {
    expect(judge(answer('En voi auttaa tässä.', { refused: true })))
      .toEqual({ status: 'failed', reason: 'refusal', message: 'Malli kieltäytyi tehtävästä.', fatal: false });
    expect(judge(answer(FINDINGS_TEXT, { refused: true })).reason).toBe('refusal');
  });

  test('promptTruncated is failed even when findings were parsed', () => {
    expect(judge(answer(FINDINGS_TEXT, { promptTruncated: true }))).toEqual({
      status: 'failed',
      reason: 'prompt-truncated',
      message: 'Malli ei nähnyt koko tekstiä. Pienennä kontekstia tai tarkista mallin ikkunan koko asetuksista.',
      fatal: false
    });
  });

  test('an empty answer after thinking with max_tokens names the reasoning headroom', () => {
    expect(judge(answer('', { truncated: true, sawThinking: true }))).toEqual({
      status: 'failed',
      reason: 'reasoning-exhausted',
      message: 'Mallin päättely käytti koko vastausrajan. Suurenna mallin päättelyvaraa asetuksista.',
      fatal: false
    });
    // Without thinking, or without the cut, it is just an empty answer
    expect(judge(answer('  \n', { truncated: true }))).toMatchObject({ status: 'failed', reason: 'empty', message: 'Malli palautti tyhjän vastauksen.' });
    expect(judge(answer('', { sawThinking: true })).reason).toBe('empty');
    expect(judge(answer('')).reason).toBe('empty');
  });

  test('an unparsed answer is failed with the "ei voitu tulkita" message', () => {
    expect(judge(answer('Teksti on hyvää, ei mitään huomautettavaa tällä kertaa.'))).toEqual({
      status: 'failed',
      reason: 'unparsed',
      message: 'Mallin vastausta ei voitu tulkita. Se ei ollut pyydetyssä muodossa.',
      fatal: false
    });
    expect(judge(answer('Selitystä ilman muotoa.', { truncated: true })).reason).toBe('unparsed');
  });

  test('max_tokens with parsed findings is truncated, not failed', () => {
    expect(judge(answer(`${FINDINGS_TEXT}\n\nLAINAUS: Aika tuntui pys`, { truncated: true })))
      .toEqual({ status: 'truncated', reason: 'max-tokens', message: 'Vastaus katkesi kesken. Havaintoja voi puuttua.', fatal: false });
    expect(judge(answer('EI HAVAINTOJA', { truncated: true })).status).toBe('truncated');
  });

  test('an unknown stop reason with a readable answer is ok', () => {
    expect(judge(answer(FINDINGS_TEXT, { stopReason: 'something_new' }))).toEqual({ status: 'ok', reason: null, message: null, fatal: false });
    expect(judge(answer('EI HAVAINTOJA', { stopReason: 'unknown' })).status).toBe('ok');
    expect(judge(answer(FINDINGS_TEXT)).status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Anchoring
// ---------------------------------------------------------------------------

describe('anchoring', () => {
  const SCENE = RECORDED_TEXTS.scene;

  test('an exact quote is located and is not approximate', () => {
    const text = 'Aamu oli harmaa. Liisa seisoi laiturilla ja odotti.';
    expect(anchorQuote(text, 'Liisa seisoi laiturilla', {}, deps))
      .toEqual({ from: text.indexOf('Liisa'), to: text.indexOf(' ja odotti'), approx: false, method: 'exact' });

    const placed = place(text, 'LAINAUS: Liisa seisoi laiturilla\nHUOMIO: Passiivinen.');
    expect(placed.drafts).toEqual([{
      quote: 'Liisa seisoi laiturilla',
      modelQuote: null,
      from: 17,
      to: 40,
      located: true,
      approx: false,
      before: 'Aamu oli harmaa. ',
      after: ' ja odotti.',
      note: 'Passiivinen.',
      suggestion: null,
      ref: null,
      severity: null
    }]);
    expect([placed.unlocated, placed.duplicates]).toEqual([0, 0]);
  });

  test('a quote with straight quotes and a hyphen finds the text with ” and –', () => {
    const text = 'Hän sanoi: ”Tule jo” – ja lähti.';
    expect(anchorQuote(text, 'Hän sanoi: "Tule jo" - ja lähti.', {}, deps))
      .toEqual({ from: 0, to: text.length, approx: false, method: 'normalized' });

    const placed = place(`Alku. ${text} Loppu.`, 'LAINAUS: sanoi: "Tule jo" - ja lähti.\nHUOMIO: Katkonainen.');
    // The stored quote is the text as the author wrote it, not as the model typed it
    expect(placed.drafts[0]).toMatchObject({ quote: 'sanoi: ”Tule jo” – ja lähti.', located: true, approx: false, modelQuote: null });
  });

  test('a quote without <u> tags finds the underlined passage, and the raw range contains the tags', () => {
    const placed = place(SCENE, 'LAINAUS: Hän vain katsoi veljeään, joka käveli hitaasti rantaa kohti\nHUOMIO: Vain on täytesana.');
    const [draft] = placed.drafts;
    expect(draft).toMatchObject({ located: true, approx: false });
    expect(draft.quote).toBe('Hän vain katsoi veljeään, joka käveli <u>hitaasti</u> rantaa kohti');
    expect(SCENE.slice(draft.from, draft.to)).toBe(draft.quote);

    // Only the underlined word: the range is the word, the tags stay outside
    const word = place(SCENE, 'LAINAUS: hitaasti\nHUOMIO: Adverbi.').drafts[0];
    expect(SCENE.slice(word.from, word.to)).toBe('hitaasti');
    expect(SCENE.slice(word.from - 3, word.to + 4)).toBe('<u>hitaasti</u>');
  });

  test('a quote across a removed [TODO: …] note is located, and the raw range contains the note', () => {
    const raw = 'Antti kohautti olkapäitään [TODO: tarkista ikä] ja lähti. Liisa jäi rantaan.';
    const [draft] = place(raw, 'LAINAUS: kohautti olkapäitään ja lähti.\nHUOMIO: Ele toistuu.').drafts;

    expect(draft).toMatchObject({ located: true, approx: false });
    expect(draft.quote).toBe('kohautti olkapäitään [TODO: tarkista ikä] ja lähti.');
    expect(raw.slice(draft.from, draft.to)).toBe(draft.quote);
    // The note of the recorded scene stands after its sentence: the sentence is found without it
    const scene = place(SCENE, 'LAINAUS: ”Ei tässä mitään kiirettä ole”, hän ajatteli.\nHUOMIO: Ajatus toistaa repliikin.').drafts[0];
    expect(scene.quote).toBe('”Ei tässä mitään kiirettä ole”, hän ajatteli.');
    expect(scene.after.startsWith(' [TODO: tarkista Antin ikä]')).toBe(true);
  });

  test('a quote shortened with … in the middle is located as approximate from its start to its end', () => {
    const text = 'Aamu oli harmaa, ja Liisa seisoi laiturilla pitkään ennen kuin lähti kävelemään kohti mökkiä. Sitten satoi.';
    const sentence = text.slice(0, text.indexOf(' Sitten'));

    for (const quote of ['Aamu oli harmaa … kohti mökkiä.', 'Aamu oli harmaa... kohti mökkiä.', 'Aamu oli harmaa [...] kohti mökkiä.', 'Aamu oli harmaa (…) kohti mökkiä.', '…Aamu oli harmaa [ … ] kohti mökkiä.…']) {
      const hit = anchorQuote(text, quote, {}, deps);
      expect(hit).toEqual({ from: 0, to: sentence.length, approx: true, method: 'gap' });
    }

    const [draft] = place(text, 'LAINAUS: Aamu oli harmaa … kohti mökkiä.\nHUOMIO: Pitkä virke.').drafts;
    expect(draft).toMatchObject({ quote: sentence, located: true, approx: true, modelQuote: 'Aamu oli harmaa … kohti mökkiä.' });

    // Only the beginning is in the text: its range, still approximate
    expect(anchorQuote(text, 'Aamu oli harmaa … kohti saunaa.', {}, deps)).toEqual({ from: 0, to: 15, approx: true, method: 'gap' });
    // The end must follow within 600 characters
    const far = `Aamu oli harmaa. ${filler('sana', 120)} Ilta oli kirkas.`;
    expect(anchorQuote(far, 'Aamu oli harmaa … Ilta oli kirkas.', {}, deps)).toEqual({ from: 0, to: 15, approx: true, method: 'gap' });
    expect(REVIEW.GAP_MAX_CHARS).toBe(600);
  });

  test('a quote whose first word was replaced (Antti for Hän) is located by its tail as approximate', () => {
    const text = 'Antti istui kuistilla. Hän oli ajanut mökille omalla autollaan jo edellisenä iltana.';
    const hit = anchorQuote(text, 'Antti oli ajanut mökille omalla autollaan jo edellisenä iltana.', {}, deps);
    expect(hit).toEqual({ from: text.indexOf('oli ajanut'), to: text.length, approx: true, method: 'tail' });

    const [draft] = place(text, 'LAINAUS: Antti oli ajanut mökille omalla autollaan jo edellisenä iltana.\nHUOMIO: Auto on myyty.').drafts;
    expect(draft).toMatchObject({
      quote: 'oli ajanut mökille omalla autollaan jo edellisenä iltana.',
      modelQuote: 'Antti oli ajanut mökille omalla autollaan jo edellisenä iltana.',
      located: true,
      approx: true
    });

    // At most three words are given up, and four must remain
    expect(anchorQuote(text, 'Hänen veljensä Antti Koskela oli ajanut mökille omalla autollaan', {}, deps)).toBeNull();
    expect(anchorQuote(text, 'Antti oli ajanut mökille', {}, deps)).toBeNull();
  });

  test('a quote that only begins like the text is located by that beginning as approximate', () => {
    const text = 'Liisa seisoi laiturilla ja katseli järvelle päin. Sitten hän kääntyi.';
    const hit = anchorQuote(text, 'Liisa seisoi laiturilla ja mietti tulevaa talvea.', {}, deps);
    expect(hit).toEqual({ from: 0, to: text.indexOf(' katseli'), approx: true, method: 'prefix' });
  });

  test('a quote of one character is not located', () => {
    const text = 'Aamu oli harmaa.';
    expect(anchorQuote(text, 'a', {}, deps)).toBeNull();
    expect(anchorQuote(text, '  A ', {}, deps)).toBeNull();
    expect(anchorQuote(text, '', {}, deps)).toBeNull();
    expect(anchorQuote(text, null, {}, deps)).toBeNull();
    // Two characters are enough
    expect(anchorQuote(text, 'li', {}, deps)).toMatchObject({ approx: false });
    expect(REVIEW.MIN_QUOTE_CHARS).toBe(2);

    const placed = place(text, 'LAINAUS: a\nHUOMIO: Liian lyhyt lainaus.');
    expect(placed.drafts[0]).toMatchObject({ located: false, quote: 'a' });
  });

  test('a quote that is nowhere in the batch is kept as not located with the model\'s wording', () => {
    const placed = place('Aamu oli harmaa. Liisa seisoi laiturilla.', 'LAINAUS: Ilta oli kirkas ja tuulinen.\nHUOMIO: Sää vaihtuu.\nEHDOTUS: Ilta oli tyyni.');
    expect(placed.drafts).toEqual([{
      quote: 'Ilta oli kirkas ja tuulinen.',
      modelQuote: null,
      from: null,
      to: null,
      located: false,
      approx: false,
      before: '',
      after: '',
      note: 'Sää vaihtuu.',
      suggestion: 'Ilta oli tyyni.',
      ref: null,
      severity: null
    }]);
    expect(placed.unlocated).toBe(1);

    // A finding without a quote is kept as well
    const bare = place('Aamu oli harmaa.', 'HUOMIO: Luvussa ei ole jännitettä.');
    expect(bare.drafts[0]).toMatchObject({ quote: '', located: false, note: 'Luvussa ei ole jännitettä.' });
  });

  test('the search does not leave the batch even when the quote exists elsewhere in the chapter', () => {
    const answerText = 'LAINAUS: Aika tuntui pysähtyvän.\nHUOMIO: Kulunut kielikuva.';
    const first = place(LONG_CHAPTER, answerText, { maxChars: 1200, batch: 0 });
    expect(first.batches).toHaveLength(3);
    expect(first.drafts[0]).toMatchObject({ located: false, quote: 'Aika tuntui pysähtyvän.' });

    // The batch that holds the sentence finds it
    const second = place(LONG_CHAPTER, answerText, { maxChars: 1200, batch: 1 });
    expect(second.drafts[0]).toMatchObject({ located: true, from: LONG_CHAPTER.indexOf('Aika tuntui') });

    // A sentence that stands in two batches is placed in the batch that was read
    const twice = `${PARAGRAPHS[0]}\n\n${PARAGRAPHS[1]}\n\nHän vain katsoi merta. ${filler('uusi', 100)}.`;
    const last = place(twice, 'LAINAUS: Hän vain katsoi merta.\nHUOMIO: Täytesana.', { maxChars: 1200, batch: 2 });
    expect(last.drafts[0].from).toBe(twice.lastIndexOf('Hän vain katsoi merta.'));
    expect(last.drafts[0].from).toBeGreaterThan(twice.indexOf('Hän vain katsoi merta.'));
  });

  test('repeated quotes are assigned in reading order (two findings quoting vain get two different places)', () => {
    const text = 'Hän vain katsoi. Sitten hän vain nauroi. Lopuksi hän vain lähti.';
    const places = [text.indexOf('vain'), text.indexOf('vain', 10), text.lastIndexOf('vain')];
    const findingText = (count) => Array.from({ length: count }, (_unused, index) => `LAINAUS: vain\nHUOMIO: Täytesana ${index + 1}.`).join('\n\n');

    const two = place(text, findingText(2));
    expect(two.drafts.map(draft => draft.from)).toEqual(places.slice(0, 2));
    expect(two.duplicates).toBe(0);

    const three = place(text, findingText(3));
    expect(three.drafts.map(draft => [draft.from, draft.note])).toEqual([
      [places[0], 'Täytesana 1.'], [places[1], 'Täytesana 2.'], [places[2], 'Täytesana 3.']
    ]);
    expect(three.drafts.map(draft => [draft.before.slice(-4), draft.after.slice(0, 5)])).toEqual([
      ['Hän ', ' kats'], ['hän ', ' naur'], ['hän ', ' läht']
    ]);

    // A fourth finding has no place of its own left
    const four = place(text, findingText(4));
    expect(four.drafts).toHaveLength(3);
    expect(four.duplicates).toBe(1);
  });

  test('the same finding repeated word for word is one finding even when its words occur again', () => {
    const text = 'Hän vain katsoi merta. Sitten hän vain nauroi.';
    const placed = place(text, 'LAINAUS: vain\nHUOMIO: Täytesana vain.\n\nLAINAUS: vain\nHUOMIO: Täytesana  vain.');
    expect(placed.drafts.map(draft => [draft.from, draft.note])).toEqual([[text.indexOf('vain'), 'Täytesana vain.']]);
    expect(placed.duplicates).toBe(1);
  });

  test('a repeated quote finds a free place before the last one used when the model did not quote in reading order', () => {
    const text = 'Anna vain istui. Bertta vain seisoi. Cecilia vain makasi.';
    const placed = place(text, [
      'LAINAUS: Anna vain\nHUOMIO: Yksi.',
      'LAINAUS: Cecilia vain makasi.\nHUOMIO: Kaksi.',
      'LAINAUS: vain\nHUOMIO: Kolme.',
      'LAINAUS: vain\nHUOMIO: Neljä.',
      'LAINAUS: vain\nHUOMIO: Viisi.'
    ].join('\n\n'));
    const vains = [5, 24, 45].map(at => text.indexOf('vain', at));
    expect(placed.drafts.map(draft => draft.from).slice(2).sort((a, b) => a - b)).toEqual(vains);
    // The first finding took vain inside Anna vain only as part of a longer range
    expect(placed.duplicates).toBe(0);
  });

  withRealModules('repeated quotes are assigned in reading order by the real locateQuote too', () => {
    const text = 'Hän vain katsoi. Sitten hän vain nauroi. Lopuksi hän vain lähti.';
    const placed = place(text, 'LAINAUS: vain\nHUOMIO: Yksi.\n\nLAINAUS: vain\nHUOMIO: Kaksi.\n\nLAINAUS: vain\nHUOMIO: Kolme.', { textDeps: realDeps });
    expect(placed.drafts.map(draft => draft.from)).toEqual([text.indexOf('vain'), text.indexOf('vain', 10), text.lastIndexOf('vain')]);
  });

  test('two findings on the same range are deduplicated', () => {
    const text = 'Aamu oli jotenkin harmaa. Liisa odotti.';
    const placed = place(text, 'LAINAUS: Aamu oli jotenkin harmaa.\nHUOMIO: Täytesana.\n\nLAINAUS: Aamu oli jotenkin harmaa.\nHUOMIO: Sama uudelleen.\n\nLAINAUS: Liisa odotti.\nHUOMIO: Lyhyt.');
    expect(placed.drafts.map(draft => [draft.quote, draft.note])).toEqual([
      ['Aamu oli jotenkin harmaa.', 'Täytesana.'],
      ['Liisa odotti.', 'Lyhyt.']
    ]);
    expect(placed.duplicates).toBe(1);
    expect(placed.unlocated).toBe(0);

    // Findings without a place are never merged: nothing says they are the same
    const lost = place(text, 'LAINAUS: Ilta oli kirkas.\nHUOMIO: Yksi.\n\nLAINAUS: Ilta oli kirkas.\nHUOMIO: Kaksi.');
    expect([lost.drafts.length, lost.duplicates, lost.unlocated]).toEqual([2, 0, 2]);
  });

  test('before and after hold up to 32 raw characters', () => {
    const raw = `Alku. ${filler('edeltävä', 8)} Hän vain <u>katsoi</u> merta. ${filler('seuraava', 8)} Loppu.`;
    const [draft] = place(raw, 'LAINAUS: Hän vain katsoi merta.\nHUOMIO: Täytesana.').drafts;

    expect(draft.before).toHaveLength(32);
    expect(draft.after).toHaveLength(32);
    expect(draft.before).toBe(raw.slice(draft.from - 32, draft.from));
    expect(draft.after).toBe(raw.slice(draft.to, draft.to + 32));
    // Raw characters: tags and notes around the passage are part of the context
    const tagged = 'Sana <u>yksi</u> [TODO: x] Hän istui. <u>Sitten</u> loppu.';
    const near = place(tagged, 'LAINAUS: Hän istui.\nHUOMIO: Lyhyt.').drafts[0];
    expect(near.before).toBe('Sana <u>yksi</u> [TODO: x] ');
    expect(near.after).toBe(' <u>Sitten</u> loppu.');

    // At the edges of the text there is less
    const edge = place('Hän istui. Loppu.', 'LAINAUS: Hän istui.\nHUOMIO: Lyhyt.').drafts[0];
    expect([edge.before, edge.after]).toEqual(['', ' Loppu.']);
    expect(REVIEW.CONTEXT_CHARS).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// Continuity
// ---------------------------------------------------------------------------

describe('continuity', () => {
  const CONTINUITY_TEXT = RECORDED_TEXTS.continuity;

  test('contextSources cuts entries and summaries out of the built parts by their lengths', () => {
    const sources = contextSources({ parts: builtParts({ withText: false }) });
    // In the order of the parts: entries that are always sent, mentioned ones, then the summaries
    expect(sources).toEqual([SOURCES[0], SOURCES[3], SOURCES[4], SOURCES[1], SOURCES[2]]);
    expect(sources[3]).toEqual({
      key: 'summary:c1',
      kind: 'summary',
      id: 'c1',
      label: 'Luku 1: Hautajaiset',
      text: 'Luku 1: Hautajaiset – Isä haudataan huhtikuussa. Liisa ja Antti riitelevät perinnöstä. Antti kertoo myyneensä autonsa.'
    });

    // Parts that were dropped, excluded or are not sources give nothing
    const parts = builtParts({ withText: false });
    parts[1].state = 'dropped';
    parts[2].state = 'cut';
    parts[3].state = 'excluded';
    expect(contextSources({ parts }).map(source => source.key)).toEqual(['summary:c1', 'summary:c2']);

    // Entries the author added by hand are sources too
    const manual = { ...builtParts({ withText: false })[1], id: 'codexManual' };
    expect(contextSources({ parts: [manual] })).toEqual([SOURCES[0]]);
    expect(contextSources(null)).toEqual([]);
    expect(contextSources({ parts: [] })).toEqual([]);
  });

  test('contextSources returns nothing for a part whose lengths do not add up', () => {
    const parts = builtParts({ withText: false });
    parts[3].items[0].chars -= 1;
    // The mentioned entries cannot be cut apart; the other parts still give theirs
    expect(contextSources({ parts }).map(source => source.key)).toEqual(['codex:mokki', 'summary:c1', 'summary:c2']);

    const short = builtParts({ withText: false });
    short[2].items.pop();
    expect(contextSources({ parts: short }).map(source => source.key)).toEqual(['codex:mokki', 'codex:liisa', 'codex:antti']);

    const noSeparator = builtParts({ withText: false });
    noSeparator[2].text = noSeparator[2].text.replace('\n', ' ');
    expect(contextSources({ parts: noSeparator }).some(source => source.kind === 'summary')).toBe(false);
  });

  test('contextSources reads the item texts directly when they are present', () => {
    expect(contextSources({ parts: builtParts() })).toEqual([SOURCES[0], SOURCES[3], SOURCES[4], SOURCES[1], SOURCES[2]]);

    // The texts are taken as they are: lengths are not needed and not checked
    const parts = builtParts();
    for (const part of parts) {
      for (const item of part.items || []) delete item.chars;
    }
    parts[2].text = 'jotakin aivan muuta';
    expect(contextSources({ parts })).toEqual([SOURCES[0], SOURCES[3], SOURCES[4], SOURCES[1], SOURCES[2]]);

    // A summary without a title is named by its chapter number
    const untitled = { id: 'summaries', state: 'sent', text: 'Luku 3 – Liisa lähtee.', items: [{ key: 'summary:c3', label: 'Luku 3', text: 'Luku 3 – Liisa lähtee.' }] };
    expect(contextSources({ parts: [untitled] })).toEqual([
      { key: 'summary:c3', kind: 'summary', id: 'c3', label: 'Luku 3', text: 'Luku 3 – Liisa lähtee.' }
    ]);
    // Items of other kinds are not sources
    const odd = { id: 'codexAlways', state: 'sent', text: 'x', items: [{ key: 'style', label: 'tyyli', text: 'x' }] };
    expect(contextSources({ parts: [odd] })).toEqual([]);
  });

  test('resolveSource finds Luku 2, luku 2: Matka and tarinakansio: Mökki (paikka)', () => {
    expect(resolveSource('Luku 2', SOURCES)).toBe(SOURCES[2]);
    expect(resolveSource('luku 2: Matka', SOURCES)).toBe(SOURCES[2]);
    expect(resolveSource('aiemmat_luvut, Luku  1', SOURCES)).toBe(SOURCES[1]);
    expect(resolveSource('tarinakansio: Mökki (paikka)', SOURCES)).toBe(SOURCES[0]);
    expect(resolveSource('tarinakansio_mainitut: Liisa Koskela (hahmo)', SOURCES)).toBe(SOURCES[3]);
    expect(resolveSource('MÖKKI', SOURCES)).toBe(SOURCES[0]);

    // A chapter that was not sent, a probe's own tag, nothing at all
    expect(resolveSource('Luku 7', SOURCES)).toBeNull();
    expect(resolveSource('[K1]', SOURCES)).toBeNull();
    expect(resolveSource('', SOURCES)).toBeNull();
    expect(resolveSource(null, SOURCES)).toBeNull();
    expect(resolveSource('Luku 2', [])).toBeNull();
    // "Luku 2" is not the beginning of "Luku 21"
    const later = { key: 'summary:c21', kind: 'summary', id: 'c21', label: 'Luku 21: Loppu', text: 'Luku 21: Loppu – Kaikki päättyy.' };
    expect(resolveSource('Luku 2', [later, SOURCES[2]])).toBe(SOURCES[2]);
    expect(resolveSource('Luku 21', [SOURCES[2], later])).toBe(later);
  });

  test('resolveSource prefers the longest entry name (Liisa Koskela over Liisa)', () => {
    const liisa = { key: 'codex:l', kind: 'codex', id: 'l', label: 'Liisa', text: 'Liisa (hahmo): Naapurin tyttö.' };
    expect(resolveSource('Liisa Koskela', [liisa, ...SOURCES])).toBe(SOURCES[3]);
    expect(resolveSource('Liisa Koskela (hahmo)', [...SOURCES, liisa])).toBe(SOURCES[3]);
    expect(resolveSource('Liisa', [liisa, ...SOURCES])).toBe(liisa);
    expect(resolveSource('liisa (hahmo)', [...SOURCES, liisa])).toBe(liisa);
  });

  test('anchorReference finds VERTAA in the named source', () => {
    const ref = anchorReference({ compare: 'Antti on juuri lopettanut tupakoinnin.', source: 'Luku 2' }, SOURCES, deps);
    expect(ref).toEqual({ kind: 'summary', id: 'c2', label: 'Luku 2: Matka', quote: 'Antti on juuri lopettanut tupakoinnin.', located: true });

    // The source's own wording is stored, not the model's
    const folded = anchorReference({ compare: 'mökissä ei ole  sähköä', source: 'Mökki' }, SOURCES, deps);
    expect(folded).toEqual({ kind: 'codex', id: 'mokki', label: 'Mökki', quote: 'Mökissä ei ole sähköä', located: true });

    // The named source is searched first: the same words in another source do not win
    const twice = [
      { key: 'codex:a', kind: 'codex', id: 'a', label: 'Aitta', text: 'Aitta (paikka): Ei ole sähköä.' },
      { key: 'codex:m', kind: 'codex', id: 'm', label: 'Mökki', text: 'Mökki (paikka): Ei ole sähköä.' }
    ];
    expect(anchorReference({ compare: 'Ei ole sähköä.', source: 'Mökki' }, twice, deps).id).toBe('m');
    expect(anchorReference({ compare: 'Ei ole sähköä.', source: null }, twice, deps).id).toBe('a');
  });

  test('anchorReference finds VERTAA in another source when LÄHDE is wrong or missing', () => {
    // The model named the wrong chapter
    expect(anchorReference({ compare: 'Antti kertoo myyneensä autonsa.', source: 'Luku 2' }, SOURCES, deps))
      .toEqual({ kind: 'summary', id: 'c1', label: 'Luku 1: Hautajaiset', quote: 'Antti kertoo myyneensä autonsa.', located: true });
    // A tag of its own, or no LÄHDE at all
    expect(anchorReference({ compare: 'Vasenkätinen.', source: '[K2]' }, SOURCES, deps)).toMatchObject({ kind: 'codex', id: 'antti', located: true });
    expect(anchorReference({ compare: 'Ei osaa uida.', source: null }, SOURCES, deps)).toMatchObject({ id: 'liisa', quote: 'Ei osaa uida.', located: true });
  });

  test('anchorReference uses the last sentence that is found when the entry name was stitched to it', () => {
    // The entry reads "Liisa Koskela (hahmo): Antin isosisko, 41-vuotias. Siniset silmät. …"
    const ref = anchorReference({ compare: 'Liisa Koskela (hahmo): Siniset silmät.', source: '[K1]' }, SOURCES, deps);
    expect(ref).toEqual({ kind: 'codex', id: 'liisa', label: 'Liisa Koskela', quote: 'Siniset silmät.', located: true });

    // Two sentences stitched together: the last one that is found
    expect(anchorReference({ compare: 'Liisan pikkuveli on nuori. Työskentelee puuseppänä.', source: 'Antti Koskela' }, SOURCES, deps))
      .toMatchObject({ id: 'antti', quote: 'Työskentelee puuseppänä.', located: true });
    expect(anchorReference({ compare: 'Isä rakensi sen vuonna 1978. Mökissä on sähköt.', source: 'Mökki' }, SOURCES, deps))
      .toMatchObject({ id: 'mokki', quote: 'Isä rakensi sen vuonna 1978.', located: true });
    // A single word is too little to stand for the passage
    expect(anchorReference({ compare: 'Antti Koskela (hahmo): Oikeakätinen.', source: 'Antti Koskela' }, SOURCES, deps).quote)
      .not.toBe('Oikeakätinen.');
  });

  withRealModules('the stitched entry name is resolved with the real sentence splitter too', () => {
    const ref = anchorReference({ compare: 'Liisa Koskela (hahmo): Siniset silmät.', source: '[K1]' }, SOURCES, realDeps);
    expect(ref).toMatchObject({ id: 'liisa', quote: 'Siniset silmät.', located: true });
  });

  test('anchorReference keeps a reference that is nowhere, marked not located', () => {
    expect(anchorReference({ compare: 'Liisalla on vihreät silmät ja punainen tukka.', source: 'Liisa Koskela' }, SOURCES, deps))
      .toEqual({ kind: 'codex', id: 'liisa', label: 'Liisa Koskela', quote: 'Liisalla on vihreät silmät ja punainen tukka.', located: false });
    // An unknown source keeps the model's own name for it
    expect(anchorReference({ compare: 'Talo paloi vuonna 1950.', source: 'Luku 9' }, SOURCES, deps))
      .toEqual({ kind: null, id: null, label: 'Luku 9', quote: 'Talo paloi vuonna 1950.', located: false });
    expect(anchorReference({ compare: null, source: null }, SOURCES, deps)).toEqual({ kind: null, id: null, label: '', quote: '', located: false });
    expect(anchorReference({ compare: 'Vasenkätinen.', source: 'Antti Koskela' }, [], deps))
      .toEqual({ kind: null, id: null, label: 'Antti Koskela', quote: 'Vasenkätinen.', located: false });
  });

  test('swapped LAINAUS and VERTAA are exchanged', () => {
    const placed = place(CONTINUITY_TEXT, [
      'LAINAUS: Sisarukset ajavat Liisan autolla mökille',
      'VERTAA: Hän oli ajanut mökille omalla autollaan jo edellisenä iltana.',
      'LÄHDE: Luku 2',
      'HUOMIO: Teksti kertoo Antin ajaneen omalla autollaan.'
    ].join('\n'), { sources: SOURCES });

    expect(placed.drafts).toHaveLength(1);
    expect(placed.drafts[0]).toMatchObject({
      quote: 'Hän oli ajanut mökille omalla autollaan jo edellisenä iltana.',
      located: true,
      approx: false,
      ref: { kind: 'summary', id: 'c2', label: 'Luku 2: Matka', quote: 'Sisarukset ajavat Liisan autolla mökille', located: true }
    });
    expect(CONTINUITY_TEXT.slice(placed.drafts[0].from, placed.drafts[0].to)).toBe(placed.drafts[0].quote);

    // Not exchanged when the first passage is in no source either: it stays as the model wrote it
    const unknown = place(CONTINUITY_TEXT, 'LAINAUS: Jotakin aivan muuta tekstiä\nVERTAA: Oli heinäkuun alku\nLÄHDE: Luku 2\nHUOMIO: Outo.', { sources: SOURCES });
    expect(unknown.drafts[0]).toMatchObject({ quote: 'Jotakin aivan muuta tekstiä', located: false });
    expect(unknown.drafts[0].ref).toMatchObject({ quote: 'Oli heinäkuun alku', located: false });
  });

  test('the same passage against two sources gives two findings', () => {
    const placed = place(CONTINUITY_TEXT, [
      'LAINAUS: sytytti tupakan oikealla kädellään',
      'VERTAA: Vasenkätinen.',
      'LÄHDE: Antti Koskela',
      'HUOMIO: Antti on vasenkätinen.',
      '',
      'LAINAUS: sytytti tupakan oikealla kädellään',
      'VERTAA: Antti on juuri lopettanut tupakoinnin.',
      'LÄHDE: Luku 2',
      'HUOMIO: Antti lopetti tupakoinnin.',
      '',
      'LAINAUS: sytytti tupakan oikealla kädellään',
      'VERTAA: Vasenkätinen.',
      'LÄHDE: Antti Koskela',
      'HUOMIO: Sama havainto uudelleen.'
    ].join('\n'), { sources: SOURCES });

    expect(placed.drafts.map(draft => [draft.from, draft.ref.kind, draft.ref.id])).toEqual([
      [CONTINUITY_TEXT.indexOf('sytytti'), 'codex', 'antti'],
      [CONTINUITY_TEXT.indexOf('sytytti'), 'summary', 'c2']
    ]);
    // The third repeats the first: same passage, same source
    expect(placed.duplicates).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The fix
// ---------------------------------------------------------------------------

describe('the fix', () => {
  const CHAPTER = 'Alku. Hän vain katsoi veljeään, joka käveli <u>hitaasti</u> rantaa kohti [TODO: mihin?], eikä sanonut mitään. Loppu.';
  const from = CHAPTER.indexOf('Hän vain');
  const to = CHAPTER.indexOf(' Loppu.');
  const located = (suggestion, extra = {}) => ({
    located: true, approx: false, from, to, quote: CHAPTER.slice(from, to), suggestion, ...extra
  });
  const apply = (text, changes) => changes.slice().reverse().reduce(
    (result, change) => result.slice(0, change.from) + change.insert + result.slice(change.to),
    text
  );

  test('fixChanges removes only the filler word (Hän vain katsoi → Hän katsoi)', () => {
    const fix = fixChanges(CHAPTER, located('Hän katsoi veljeään, joka käveli hitaasti rantaa kohti, eikä sanonut mitään.'), { wordDiff });

    expect(fix).toEqual({
      ok: true,
      changes: [{ from: CHAPTER.indexOf('vain '), to: CHAPTER.indexOf('katsoi'), insert: '', original: 'vain ' }]
    });
    // The rest of the chapter, tags and note included, is as it was
    expect(apply(CHAPTER, fix.changes)).toBe(CHAPTER.replace('Hän vain katsoi', 'Hän katsoi'));

    const short = 'Hän vain katsoi.';
    expect(fixChanges(short, { located: true, approx: false, from: 0, to: short.length, quote: short, suggestion: 'Hän katsoi.' }, { wordDiff }))
      .toEqual({ ok: true, changes: [{ from: 4, to: 9, insert: '', original: 'vain ' }] });
  });

  test('fixChanges keeps <u> tags when the underlined word itself is replaced', () => {
    const fix = fixChanges(CHAPTER, located('Hän vain katsoi veljeään, joka käveli verkkaan rantaa kohti, eikä sanonut mitään.'), { wordDiff });

    expect(fix.ok).toBe(true);
    expect(fix.changes).toEqual([{ from: CHAPTER.indexOf('hitaasti'), to: CHAPTER.indexOf('</u>'), insert: 'verkkaan', original: 'hitaasti' }]);
    expect(apply(CHAPTER, fix.changes)).toContain('käveli <u>verkkaan</u> rantaa');
  });

  test('fixChanges refuses a change that would delete a <u> tag (reason protected)', () => {
    // "käveli hitaasti" → "asteli": the change reaches over the opening tag
    expect(fixChanges(CHAPTER, located('Hän vain katsoi veljeään, joka asteli rantaa kohti, eikä sanonut mitään.'), { wordDiff }))
      .toEqual({ ok: false, reason: 'protected' });
    // One refused change refuses the whole fix: the filler word is not removed alone
    expect(fixChanges(CHAPTER, located('Hän katsoi veljeään, joka asteli rantaa kohti, eikä sanonut mitään.'), { wordDiff }))
      .toEqual({ ok: false, reason: 'protected' });
  });

  test('fixChanges refuses a change that would delete a [TODO: …] note (reason protected)', () => {
    // "kohti, eikä" → "päin ja ei": the words on both sides of the note change together
    expect(fixChanges(CHAPTER, located('Hän vain katsoi veljeään, joka käveli hitaasti rantaa päin ja ei sanonut mitään.'), { wordDiff }))
      .toEqual({ ok: false, reason: 'protected' });
  });

  test('fixChanges leaves a note alone when the change ends right before it', () => {
    const fix = fixChanges(CHAPTER, located('Hän vain katsoi veljeään, joka käveli hitaasti järvelle, eikä sanonut mitään.'), { wordDiff });

    expect(fix.ok).toBe(true);
    expect(fix.changes).toEqual([{ from: CHAPTER.indexOf('rantaa kohti'), to: CHAPTER.indexOf(' [TODO'), insert: 'järvelle', original: 'rantaa kohti' }]);
    expect(apply(CHAPTER, fix.changes)).toContain('<u>hitaasti</u> järvelle [TODO: mihin?], eikä');

    // And when it starts right after it: the comma goes, the note stays
    const after = fixChanges(CHAPTER, located('Hän vain katsoi veljeään, joka käveli hitaasti rantaa kohti eikä sanonut mitään.'), { wordDiff });
    expect(after.ok).toBe(true);
    expect(apply(CHAPTER, after.changes)).toContain('rantaa kohti [TODO: mihin?] eikä sanonut');
  });

  test('fixChanges keeps ” and – when normaliseModelText is given and the model wrote " and -', () => {
    const text = 'Hän sanoi vain: ”Tule jo” – ja lähti.';
    const finding = { located: true, approx: false, from: 0, to: text.length, quote: text, suggestion: 'Hän sanoi: "Tule jo" - ja lähti.' };
    // The typography module's job, here as a stand-in: straight marks back to the author's forms
    const normaliseModelText = jest.fn((modelText) => modelText.replace(/"/g, '”').replace(/ - /g, ' – '));

    const fix = fixChanges(text, finding, { wordDiff, normaliseModelText });
    expect(normaliseModelText).toHaveBeenCalledWith('Hän sanoi: "Tule jo" - ja lähti.', text);
    expect(fix).toEqual({ ok: true, changes: [{ from: 9, to: 14, insert: '', original: ' vain' }] });
    expect(apply(text, fix.changes)).toBe('Hän sanoi: ”Tule jo” – ja lähti.');

    // Without it the model's typography shows up as changes of its own
    const plain = fixChanges(text, finding, { wordDiff });
    expect(plain.ok).toBe(true);
    expect(apply(text, plain.changes)).toBe('Hän sanoi: "Tule jo" - ja lähti.');
    expect(plain.changes.length).toBeGreaterThan(1);
  });

  test('fixChanges keeps a leading dialogue dash (– Tuletko sinä jo? hän huusi vihaisesti. → – Tuletko sinä jo? hän huusi.)', () => {
    const text = 'Alku.\n– Tuletko sinä jo? hän huusi vihaisesti.\nLoppu.';
    const start = text.indexOf('–');
    const end = text.indexOf('\nLoppu');
    const finding = { located: true, approx: false, from: start, to: end, quote: text.slice(start, end), suggestion: '– Tuletko sinä jo? hän huusi.' };

    const fix = fixChanges(text, finding, { wordDiff });
    expect(fix).toEqual({ ok: true, changes: [{ from: text.indexOf(' vihaisesti'), to: text.indexOf('.\nLoppu'), insert: '', original: ' vihaisesti' }] });
    expect(apply(text, fix.changes)).toBe('Alku.\n– Tuletko sinä jo? hän huusi.\nLoppu.');
  });

  test('fixChanges reports no-suggestion, not-located, approximate, text-changed and same', () => {
    const suggestion = 'Hän katsoi veljeään, joka käveli hitaasti rantaa kohti, eikä sanonut mitään.';
    expect(fixChanges(CHAPTER, located(null), { wordDiff })).toEqual({ ok: false, reason: 'no-suggestion' });
    expect(fixChanges(CHAPTER, located(''), { wordDiff })).toEqual({ ok: false, reason: 'no-suggestion' });
    expect(fixChanges(CHAPTER, located(suggestion, { located: false, from: null, to: null }), { wordDiff })).toEqual({ ok: false, reason: 'not-located' });
    expect(fixChanges(CHAPTER, located(suggestion, { approx: true }), { wordDiff })).toEqual({ ok: false, reason: 'approximate' });
    expect(fixChanges(CHAPTER.replace('veljeään', 'siskoaan'), located(suggestion), { wordDiff })).toEqual({ ok: false, reason: 'text-changed' });
    // The order of the checks: a missing suggestion is said before a missing place
    expect(fixChanges(CHAPTER, located(null, { located: false, approx: true }), { wordDiff }).reason).toBe('no-suggestion');
    expect(fixChanges(CHAPTER, located(suggestion, { located: false, approx: true }), { wordDiff }).reason).toBe('not-located');

    // The passage as it is, with or without the tags and the note, or with other outer spaces
    const same = 'Hän vain katsoi veljeään, joka käveli hitaasti rantaa kohti, eikä sanonut mitään.';
    expect(fixChanges(CHAPTER, located(same), { wordDiff })).toEqual({ ok: false, reason: 'same' });
    expect(fixChanges(CHAPTER, located(`  ${same}\n`), { wordDiff })).toEqual({ ok: false, reason: 'same' });
    expect(fixChanges(CHAPTER, located(CHAPTER.slice(from, to).replace('[TODO: mihin?]', '[TODO: minne?]')), { wordDiff })).toEqual({ ok: false, reason: 'same' });
  });

  test('fixChanges keeps the outer whitespace of the passage', () => {
    const text = 'Alku.  Hän vain katsoi. \nLoppu.';
    const start = text.indexOf(' Hän');
    const end = text.indexOf('\nLoppu');
    const finding = { located: true, approx: false, from: start, to: end, quote: text.slice(start, end), suggestion: 'Hän katsoi.' };
    expect(finding.quote).toBe(' Hän vain katsoi. ');

    const fix = fixChanges(text, finding, { wordDiff });
    expect(fix.ok).toBe(true);
    expect(apply(text, fix.changes)).toBe('Alku.  Hän katsoi. \nLoppu.');
  });

  withRealModules('the fixes come out the same with the real wordDiff', () => {
    const filler = fixChanges(CHAPTER, located('Hän katsoi veljeään, joka käveli hitaasti rantaa kohti, eikä sanonut mitään.'), { wordDiff: realDeps.wordDiff });
    expect(filler).toEqual({ ok: true, changes: [{ from: CHAPTER.indexOf('vain '), to: CHAPTER.indexOf('katsoi'), insert: '', original: 'vain ' }] });
    expect(fixChanges(CHAPTER, located('Hän vain katsoi veljeään, joka asteli rantaa kohti, eikä sanonut mitään.'), { wordDiff: realDeps.wordDiff }))
      .toEqual({ ok: false, reason: 'protected' });
    const word = fixChanges(CHAPTER, located('Hän vain katsoi veljeään, joka käveli verkkaan rantaa kohti, eikä sanonut mitään.'), { wordDiff: realDeps.wordDiff });
    expect(apply(CHAPTER, word.changes)).toContain('<u>verkkaan</u>');
  });
});

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

describe('the run', () => {
  test('one batch, three findings: outcome ok, drafts in raw offsets', async () => {
    const raw = RECORDED_TEXTS.scene;
    const request = fakeRequest([answer([
      'LAINAUS: Aamu oli jotenkin harmaa, ja Liisa seisoi laiturilla ikään kuin odottaen jotakin.',
      'HUOMIO: Kaksi täytesanaa.',
      'EHDOTUS: Aamu oli harmaa, ja Liisa seisoi laiturilla odottaen jotakin.',
      '',
      'LAINAUS: Hän vain katsoi veljeään, joka käveli hitaasti rantaa kohti',
      'HUOMIO: Vain on täytesana.',
      'EHDOTUS: Hän katsoi veljeään, joka käveli hitaasti rantaa kohti',
      '',
      'LAINAUS: Åke-setä oli tavallaan aina sanonut, että järvi ottaa omansa.',
      'HUOMIO: Tavallaan on täytesana.',
      'EHDOTUS: Åke-setä oli aina sanonut, että järvi ottaa omansa.'
    ].join('\n'))]);
    const build = fakeBuild();

    const result = await startRun({ text: raw, build, request }).done;

    expect(result).toMatchObject({
      runId: 'run-1',
      checkId: 'filler',
      outcome: 'ok',
      batches: 1,
      done: 1,
      failed: [],
      unlocated: 0,
      duplicates: 0,
      model: 'c91f:deepseek-test',
      logId: 'log-1',
      dropped: null,
      message: null
    });
    expect(result.drafts).toHaveLength(3);
    for (const draft of result.drafts) {
      expect(draft.located).toBe(true);
      // Offsets of the stored text, tags and notes counted in
      expect(raw.slice(draft.from, draft.to)).toBe(draft.quote);
    }
    expect(result.drafts[1].quote).toBe('Hän vain katsoi veljeään, joka käveli <u>hitaasti</u> rantaa kohti');
    expect(result.drafts[1].suggestion).toBe('Hän katsoi veljeään, joka käveli hitaasti rantaa kohti');
    // The one batch covers the chapter from its first sent line to its last
    expect(result.covered).toEqual([{ from: 0, to: raw.length }]);

    // One probe without the text, then the batch
    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls.map(call => call[0].payload.length > 0)).toEqual([false, true]);
    expect(request).toHaveBeenCalledTimes(1);
    // The note and the tags never leave the app
    const sent = payloadOf(request.mock.calls[0][0]);
    expect(sent).not.toContain('[TODO');
    expect(sent).not.toContain('<u>');
    expect(sent).toContain('joka käveli hitaasti rantaa kohti');
  });

  test('three batches are requested one after another with the same runId', async () => {
    const request = fakeRequest(answerByParagraph);
    const progress = [];
    const result = await startRun({ request, onProgress: (step) => progress.push(step) }).done;

    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.map(call => payloadOf(call[0]))).toEqual(PARAGRAPHS);
    // Never two requests open at once
    expect(request.state.mostOpen).toBe(1);
    expect(request.mock.calls.map(call => call[0].meta.runId)).toEqual(['run-1', 'run-1', 'run-1']);

    expect(result).toMatchObject({ outcome: 'ok', batches: 3, done: 3, failed: [] });
    expect(result.drafts.map(draft => draft.quote)).toEqual(['Hän vain katsoi merta.', 'Aika tuntui pysähtyvän.', 'Åke-setä oli tavallaan hiljaa.']);
    expect(result.drafts.map(draft => LONG_CHAPTER.slice(draft.from, draft.to))).toEqual(result.drafts.map(draft => draft.quote));
    // Once when the plan is ready, then after every batch
    expect(progress).toEqual([
      { batch: 0, batches: 3, found: 0 },
      { batch: 1, batches: 3, found: 1 },
      { batch: 2, batches: 3, found: 2 },
      { batch: 3, batches: 3, found: 3 }
    ]);
  });

  test('a failed middle batch gives partial, keeps the findings of the others and lists only their ranges as covered', async () => {
    const request = fakeRequest((options, index) => (index === 1 ? failure('http_502', 'Yhdyskäytävä ei vastannut (502).') : answerByParagraph(options)));
    const result = await startRun({ request }).done;

    expect(request).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ outcome: 'partial', batches: 3, done: 3, message: 'Yhdyskäytävä ei vastannut (502).' });
    expect(result.failed).toEqual([{ index: 1, reason: 'http_502', message: 'Yhdyskäytävä ei vastannut (502).' }]);
    expect(result.drafts.map(draft => draft.quote)).toEqual(['Hän vain katsoi merta.', 'Åke-setä oli tavallaan hiljaa.']);

    const second = LONG_CHAPTER.indexOf(PARAGRAPHS[1]);
    const third = LONG_CHAPTER.indexOf(PARAGRAPHS[2]);
    expect(result.covered).toEqual([
      { from: 0, to: PARAGRAPHS[0].length },
      { from: third, to: LONG_CHAPTER.length }
    ]);
    // The paragraph of the failed batch is in no covered range
    expect(result.covered.some(range => range.from < second + 10 && range.to > second)).toBe(false);
  });

  test('all batches failed gives failed and no drafts', async () => {
    const twoParagraphs = PARAGRAPHS.slice(0, 2).join('\n\n');
    const request = fakeRequest(() => failure('http_502', 'Yhdyskäytävä ei vastannut (502).'));
    const result = await startRun({ text: twoParagraphs, request }).done;

    expect(result).toMatchObject({ outcome: 'failed', batches: 2, done: 2, drafts: [], covered: [], message: 'Yhdyskäytävä ei vastannut (502).' });
    expect(result.failed.map(entry => entry.index)).toEqual([0, 1]);

    // An answer that cannot be read is a failed call too, and its beginning is kept for the author
    const prose = 'Teksti on erinomaista, en löytänyt siitä mitään huomautettavaa. '.repeat(8);
    const unread = await startRun({ text: 'Hän vain katsoi.', request: fakeRequest([answer(prose)]) }).done;
    expect(unread.outcome).toBe('failed');
    expect(unread.failed).toEqual([{
      index: 0,
      reason: 'unparsed',
      message: 'Mallin vastausta ei voitu tulkita. Se ei ollut pyydetyssä muodossa.',
      answer: prose.slice(0, 300)
    }]);
    expect(unread.drafts).toEqual([]);
  });

  test('two failures in a row stop the run', async () => {
    const four = [...PARAGRAPHS, `Neljäs kappale alkaa tästä. ${filler('lisä', 100)}.`].join('\n\n');
    const request = fakeRequest((options, index) => (index === 0 ? answerByParagraph(options) : failure('http_502', 'Virhe.')));
    const result = await startRun({ text: four, request }).done;

    // The fourth batch was never sent
    expect(request).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ outcome: 'partial', batches: 4, done: 3 });
    expect(result.failed.map(entry => entry.index)).toEqual([1, 2]);
    expect(result.drafts).toHaveLength(1);
    expect(REVIEW.STOP_AFTER_FAILURES).toBe(2);

    // A success in between resets the count
    const alternating = fakeRequest((options, index) => (index % 2 === 0 ? failure('http_502', 'Virhe.') : answer('EI HAVAINTOJA')));
    const all = await startRun({ text: four, request: alternating }).done;
    expect(alternating).toHaveBeenCalledTimes(4);
    expect(all).toMatchObject({ outcome: 'partial', done: 4 });
  });

  test('a fatal error stops the run after the first batch', async () => {
    const request = fakeRequest(() => failure('no_model', 'Mallia ei ole valittu.'));
    const result = await startRun({ request }).done;

    expect(request).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ outcome: 'failed', batches: 3, done: 1, drafts: [], message: 'Mallia ei ole valittu.' });
    expect(result.failed).toEqual([{ index: 0, reason: 'no_model', message: 'Mallia ei ole valittu.' }]);
  });

  test('cancel during the second batch gives stopped and keeps the first batch\'s findings', async () => {
    const cancels = [];
    const request = jest.fn((options) => {
      const index = request.mock.calls.length - 1;
      if (index === 0) return { result: Promise.resolve(answerByParagraph(options)), cancel: () => cancels.push(0) };
      // The second request stays open until it is cancelled, as the request layer's does
      let resolve;
      const result = new Promise((done) => {
        resolve = done;
      });
      return {
        result,
        cancel: () => {
          cancels.push(index);
          resolve(answer('', { cancelled: true }));
        }
      };
    });

    let run = null;
    const stopped = new Promise((resolve) => {
      run = startRun({
        request,
        onProgress: (step) => {
          // After the first batch the second request goes out; cancel once it is open
          if (step.batch === 1) setTimeout(() => resolve(run.cancel()), 0);
        }
      });
    });
    await stopped;
    const result = await run.done;

    expect(request).toHaveBeenCalledTimes(2);
    expect(cancels).toEqual([1]);
    expect(result).toMatchObject({ outcome: 'stopped', batches: 3, done: 1, failed: [], message: null });
    expect(result.drafts.map(draft => draft.quote)).toEqual(['Hän vain katsoi merta.']);
    expect(result.covered).toEqual([{ from: 0, to: PARAGRAPHS[0].length }]);
  });

  test('a noAI chapter is blocked and request is never called', async () => {
    const request = fakeRequest([]);
    const build = jest.fn(() => ({ system: '', messages: [], parts: [], blocked: 'noAI' }));
    const result = await startRun({ build, request, noAIMessage: 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.' }).done;

    expect(request).not.toHaveBeenCalled();
    expect(build).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      outcome: 'blocked', batches: 0, done: 0, drafts: [], failed: [], message: 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.'
    });

    // Marked while the run is going on: the next batch is not sent and the run ends
    let calls = 0;
    const late = fakeBuild(() => {
      calls += 1;
      return calls >= 3 ? { blocked: 'noAI' } : TIGHT;
    });
    const lateRequest = fakeRequest(answerByParagraph);
    const interrupted = await startRun({ build: late, request: lateRequest }).done;
    expect(lateRequest).toHaveBeenCalledTimes(1);
    expect(interrupted).toMatchObject({ outcome: 'partial', done: 2 });
    expect(interrupted.failed).toEqual([{ index: 1, reason: 'noAI', message: 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.' }]);

    // The chapter was removed while the run was going on: the same, with its own message
    let builds = 0;
    const removed = fakeBuild(() => {
      builds += 1;
      return builds >= 3 ? { blocked: 'no-chapter', messages: [] } : TIGHT;
    });
    const removedRequest = fakeRequest(answerByParagraph);
    const gone = await startRun({ build: removed, request: removedRequest }).done;
    expect(removedRequest).toHaveBeenCalledTimes(1);
    expect(gone.failed).toEqual([{ index: 1, reason: 'no-chapter', message: 'Lukua ei löytynyt.' }]);
  });

  test('an over-budget batch is failed without a request', async () => {
    const request = fakeRequest([]);
    const build = fakeBuild((task) => ({ overBudget: task.payload !== '' }));
    const result = await startRun({ text: 'Hän vain katsoi.', build, request }).done;

    expect(request).not.toHaveBeenCalled();
    expect(result).toMatchObject({ outcome: 'failed', batches: 1, done: 1, drafts: [] });
    expect(result.failed).toEqual([{
      index: 0,
      reason: 'over-budget',
      message: 'Teksti ei mahdu mallin ikkunaan. Pienennä kontekstia tai suurenna mallin ikkunaa asetuksista.'
    }]);
    expect(result.message).toBe('Teksti ei mahdu mallin ikkunaan. Pienennä kontekstia tai suurenna mallin ikkunaa asetuksista.');
  });

  test('continuity without any source is blocked with the "Ei vertailtavaa" message', async () => {
    const request = fakeRequest([]);
    const result = await startRun({ check: check('continuity'), text: RECORDED_TEXTS.continuity, build: fakeBuild(), request }).done;

    expect(request).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      outcome: 'blocked',
      batches: 1,
      done: 1,
      failed: [],
      drafts: [],
      message: 'Ei vertailtavaa: Tarinakansiossa ei ole tähän tekstiin liittyviä merkintöjä eikä aiemmilla luvuilla ole tiivistelmiä.'
    });

    const nonfiction = await startRun({
      check: check('continuity'), text: RECORDED_TEXTS.continuity, build: fakeBuild(), request, folderName: 'Kirjan kansio'
    }).done;
    expect(nonfiction.message).toBe('Ei vertailtavaa: Kirjan kansiossa ei ole tähän tekstiin liittyviä merkintöjä eikä aiemmilla luvuilla ole tiivistelmiä.');
    expect(request).not.toHaveBeenCalled();
  });

  test('continuity with sources sends the batch and places both passages', async () => {
    const request = fakeRequest([answer(RECORDED[12].text)]);
    const result = await startRun({
      check: check('continuity'), text: RECORDED_TEXTS.continuity, build: fakeBuild({ parts: builtParts() }), request
    }).done;

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].maxTokens).toBe(2000);
    expect(result.outcome).toBe('ok');
    expect(result.drafts).toHaveLength(6);
    expect(result.drafts.every(draft => draft.located && draft.ref.located && draft.suggestion === null)).toBe(true);
    expect(result.drafts[1].ref).toEqual({
      kind: 'codex',
      id: 'liisa',
      label: 'Liisa Koskela',
      quote: 'Liisa Koskela (hahmo): Antin isosisko, 41-vuotias. Siniset silmät. Ei osaa uida.',
      located: true
    });

    // A batch that mentions nothing is skipped; one with sources is sent
    let builds = 0;
    const mixed = fakeBuild(() => {
      builds += 1;
      return { ...TIGHT, parts: builds === 3 ? builtParts() : [] };
    });
    const mixedRequest = fakeRequest([answer('EI HAVAINTOJA')]);
    const some = await startRun({ check: check('continuity'), build: mixed, request: mixedRequest }).done;
    expect(mixedRequest).toHaveBeenCalledTimes(1);
    expect(payloadOf(mixedRequest.mock.calls[0][0])).toBe(PARAGRAPHS[1]);
    expect(some).toMatchObject({ outcome: 'ok', batches: 3, done: 3, failed: [] });
    expect(some.covered).toHaveLength(1);
  });

  test('the request carries action review, the check label and the chapter id', async () => {
    const request = fakeRequest([answer('EI HAVAINTOJA')]);
    const build = fakeBuild();
    await startRun({ text: 'Hän vain katsoi.', build, request, meta: { chapterId: 'chapter-7' } }).done;

    const sent = request.mock.calls[0][0];
    expect(sent.meta).toEqual({ action: 'review', actionLabel: 'Tarkistus: Täytesanat', instruction: '', chapterId: 'chapter-7', runId: 'run-1' });
    // Exactly what the builder made, and nothing a feature must not send
    const built = build.mock.results[1].value;
    expect(sent).toEqual({ system: built.system, messages: built.messages, maxTokens: 1500, meta: sent.meta });
    expect(Object.keys(sent).sort()).toEqual(['maxTokens', 'messages', 'meta', 'system']);
    expect(sent).not.toHaveProperty('thinking');
    expect(sent).not.toHaveProperty('stopSequences');
    expect(sent.messages[0].content).toContain('<teksti>\nHän vain katsoi.\n</teksti>');
    expect(sent.messages[0].content).toContain('Tarkistus: Täytesanat');
  });

  test('the instruction of a built-in check is not put into the log meta; that of an own check is', async () => {
    const builtin = fakeRequest([answer('EI HAVAINTOJA')]);
    await startRun({ text: 'Hän vain katsoi.', build: fakeBuild(), request: builtin }).done;
    expect(builtin.mock.calls[0][0].meta.instruction).toBe('');

    const own = fakeRequest([answer('EI HAVAINTOJA')]);
    await startRun({ check: OWN_CHECK, text: 'Hän vain katsoi.', build: fakeBuild(), request: own }).done;
    expect(own.mock.calls[0][0].meta).toMatchObject({
      action: 'review',
      actionLabel: 'Tarkistus: Näkökulma',
      instruction: 'Etsi kohdat, joissa näkökulma vaihtuu kesken kappaleen.'
    });
    // The instruction also goes to the model, inside <ohje>
    expect(own.mock.calls[0][0].messages[0].content).toContain('Etsi kohdat, joissa näkökulma vaihtuu kesken kappaleen.');
  });

  test('done never rejects when request throws', async () => {
    const throwing = jest.fn(() => {
      throw new Error('silta on poikki');
    });
    const result = await startRun({ text: 'Hän vain katsoi.', build: fakeBuild(), request: throwing }).done;
    expect(result).toMatchObject({ outcome: 'failed', batches: 1, done: 1, drafts: [] });
    expect(result.failed).toEqual([{ index: 0, reason: 'exception', message: 'Tarkistuspyyntö epäonnistui odottamatta. (silta on poikki)' }]);

    // A result promise that rejects, a builder that throws, a missing answer: all end as a result
    const rejecting = () => ({ result: Promise.reject(new Error('katkesi')), cancel() {} });
    await expect(startRun({ text: 'Hän vain katsoi.', build: fakeBuild(), request: rejecting }).done).resolves.toMatchObject({ outcome: 'failed' });

    const brokenBuild = () => {
      throw new Error('rakentaja kaatui');
    };
    const broken = await startRun({ text: 'Hän vain katsoi.', build: brokenBuild, request: fakeRequest([]) }).done;
    expect(broken.outcome).toBe('failed');
    expect(broken.message).toContain('rakentaja kaatui');

    const silent = await startRun({ text: 'Hän vain katsoi.', build: fakeBuild(), request: () => ({ result: Promise.resolve(undefined), cancel() {} }) }).done;
    expect(silent).toMatchObject({ outcome: 'failed', failed: [{ reason: 'empty' }] });

    // A listener that throws does not end the run
    const noisy = await startRun({
      text: 'Hän vain katsoi.',
      build: fakeBuild(),
      request: fakeRequest([answer('EI HAVAINTOJA')]),
      onProgress: () => {
        throw new Error('paneeli kaatui');
      }
    }).done;
    expect(noisy.outcome).toBe('ok');
  });

  test('a cut answer keeps its complete findings, drops the cut one and is listed as failed', async () => {
    const cut = `${PARAGRAPH_ANSWERS[0]}\n\nLAINAUS: Ensimmäinen kappale alkaa täs`;
    const request = fakeRequest([answer(cut, { truncated: true })]);
    const result = await startRun({ text: PARAGRAPHS[0], build: fakeBuild(), request }).done;

    expect(result.outcome).toBe('partial');
    expect(result.drafts.map(draft => draft.quote)).toEqual(['Hän vain katsoi merta.']);
    expect(result.failed).toEqual([{ index: 0, reason: 'max-tokens', message: 'Vastaus katkesi kesken. Havaintoja voi puuttua.' }]);
    // What was read was read: the batch counts as covered
    expect(result.covered).toEqual([{ from: 0, to: PARAGRAPHS[0].length }]);

    // A last finding that is complete is kept
    const whole = fakeRequest([answer(`${PARAGRAPH_ANSWERS[0]}\n\nLAINAUS: Ensimmäinen kappale alkaa tästä.\nHUOMIO: Toteava alku.`, { truncated: true })]);
    const kept = await startRun({ text: PARAGRAPHS[0], build: fakeBuild(), request: whole }).done;
    expect(kept.drafts).toHaveLength(2);
  });

  test('a suggestion nobody asked for is not kept', async () => {
    const text = 'Järven pinta oli tyyni kuin peili. Liisa odotti.';
    const answerText = 'LAINAUS: Järven pinta oli tyyni kuin peili.\nHUOMIO: Kulunut vertaus.\nEHDOTUS: Järven pinta heijasti harmaan taivaan.';

    const cliche = await startRun({ check: check('cliche'), text, build: fakeBuild(), request: fakeRequest([answer(answerText)]) }).done;
    expect(cliche.drafts).toHaveLength(1);
    expect(cliche.drafts[0]).toMatchObject({ located: true, suggestion: null });

    const filler = await startRun({ check: check('filler'), text, build: fakeBuild(), request: fakeRequest([answer(answerText)]) }).done;
    expect(filler.drafts[0].suggestion).toBe('Järven pinta heijasti harmaan taivaan.');
  });

  test('the run reports what did not fit, from the first batch that says so', async () => {
    const request = fakeRequest(answerByParagraph);
    let builds = 0;
    const build = fakeBuild(() => {
      builds += 1;
      return { ...TIGHT, dropped: builds >= 3 ? ['summaries'] : [] };
    });
    // The context builder's describeParts, here as a stand-in
    const describeParts = jest.fn((built, folder) => ({ dropped: built.dropped.length > 0 ? `Ei mahtunut: tiivistelmät (${folder})` : '' }));

    const result = await startRun({ build, request, describeParts, folderName: 'Tarinakansio' }).done;
    expect(result.dropped).toBe('Ei mahtunut: tiivistelmät (Tarinakansio)');
    // Asked for each batch until one says something; the probe is not a batch
    expect(describeParts).toHaveBeenCalledTimes(2);

    const without = await startRun({ request: fakeRequest(answerByParagraph) }).done;
    expect(without.dropped).toBeNull();
  });

  test('a reading-feedback run sends the whole chapter in one request and keeps the severity words', async () => {
    const request = fakeRequest([answer(RECORDED_FEEDBACK[1].text)]);
    const range = { from: 0, to: 20 };
    const result = await startRun({
      check: check('reading-feedback'), text: RECORDED_TEXTS.feedback, range, build: fakeBuild({ budgetTokens: 30000, charsPerToken: 2.7 }), request
    }).done;

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].maxTokens).toBe(2000);
    expect(request.mock.calls[0][0].meta.actionLabel).toBe('Tarkistus: Lukupalaute');
    // The selection was ignored: every paragraph went out
    expect(payloadOf(request.mock.calls[0][0])).toBe(RECORDED_TEXTS.feedback);
    expect(result).toMatchObject({ outcome: 'ok', batches: 1, message: null });
    expect(result.drafts.map(draft => draft.severity)).toEqual(['works', 'works', 'low', 'medium', 'medium', 'medium', 'high', 'low']);
    expect(result.drafts.every(draft => draft.located && draft.suggestion === null)).toBe(true);

    // In parts, the run says so
    const parts = await startRun({
      check: check('reading-feedback'), text: LONG_CHAPTER, build: fakeBuild(TIGHT), request: fakeRequest(() => answer('EI HAVAINTOJA'))
    }).done;
    expect(parts).toMatchObject({
      outcome: 'ok',
      batches: 3,
      message: 'Luku ei mahtunut yhteen pyyntöön. Palaute on annettu 3 osassa, eikä malli nähnyt lukua kokonaisena.'
    });
  });

  test('a reading-feedback run in parts keeps the parts message when a part fails', async () => {
    const request = fakeRequest((_options, index) => (index === 1 ? failure('http_502', 'Yhdyskäytävä ei vastannut (502).') : answer('EI HAVAINTOJA')));
    const result = await startRun({ check: check('reading-feedback'), text: LONG_CHAPTER, build: fakeBuild(TIGHT), request }).done;

    expect(result).toMatchObject({
      outcome: 'partial',
      batches: 3,
      message: 'Yhdyskäytävä ei vastannut (502). Luku ei mahtunut yhteen pyyntöön. Palaute on annettu 3 osassa, eikä malli nähnyt lukua kokonaisena.'
    });
  });

  test('a run without an id maker makes its own id and uses it on every batch', async () => {
    const request = fakeRequest(answerByParagraph);
    const result = await runReview({
      check: check('filler'), text: LONG_CHAPTER, range: null, note: '', build: fakeBuild(TIGHT), request, meta: { chapterId: 'c1' }, deps
    }).done;

    expect(result.runId).toMatch(/^r-[0-9a-z]+-[0-9a-z]{4}$/);
    expect(new Set(request.mock.calls.map(call => call[0].meta.runId))).toEqual(new Set([result.runId]));
  });

  test('a selection is planned and placed in the selected lines only', async () => {
    const request = fakeRequest(answerByParagraph);
    const start = LONG_CHAPTER.indexOf('Aika tuntui');
    const result = await startRun({ request, range: { from: start, to: start + 4 } }).done;

    expect(request).toHaveBeenCalledTimes(1);
    expect(payloadOf(request.mock.calls[0][0])).toBe(PARAGRAPHS[1]);
    expect(result).toMatchObject({ outcome: 'ok', batches: 1 });
    expect(result.covered).toEqual([{ from: LONG_CHAPTER.indexOf(PARAGRAPHS[1]), to: LONG_CHAPTER.indexOf(PARAGRAPHS[1]) + PARAGRAPHS[1].length }]);
  });
});

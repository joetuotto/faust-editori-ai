/**
 * @jest-environment node
 */
const {
  LOCAL,
  avoidWordFindings,
  longSentenceFindings,
  typographyQuestionFindings,
  runLocalCheck,
  sentenceWordCount,
  clampLimit
} = require('../../src/services/review/localChecks');

// ---------------------------------------------------------------------------
// Stand-ins for the modules of other tasks: the same shapes, the rules these
// tests need.
// ---------------------------------------------------------------------------

// src/editor/blocks.js
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

// src/editor/sentences.js: a sentence ends at . ! ? … when the line ends there
// or a capital, a digit or a dash follows
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

// The avoid-list matcher (src/editor/termMatch.js behind the controller's
// wrapper): an item matches from the start of a word with any ending, an item
// in quotation marks only the word itself; notes are skipped
function matchTerms(text, words) {
  const notes = Array.from(text.matchAll(/\[TODO:[^\]\n]*\]/g), match => [match.index, match.index + match[0].length]);
  const hits = [];
  for (const raw of words) {
    const exact = /^[”"].+[”"]$/.test(raw);
    const term = exact ? raw.slice(1, -1) : raw;
    const source = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${source}${exact ? '' : '[\\p{L}\\p{N}]*'}(?![\\p{L}\\p{N}])`, 'giu');
    for (const match of text.matchAll(pattern)) {
      const end = match.index + match[0].length;
      if (notes.some(([from, to]) => match.index < to && end > from)) continue;
      hits.push({ start: match.index, end, text: match[0], term });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

const DASH_URL = 'https://kielitoimistonohjepankki.fi/ohje/ajatusviiva/';
const DASH_MESSAGE = 'Rivi alkaa yhdysmerkillä ja välillä, joten FAUST käsittelee sen luettelokohtana. Jos rivi on repliikki, sen alkuun kuuluu vuorosanaviiva (– ).';

// The typography checker (src/editor/typography.fi.js): a straight quotation
// mark is a norm with a fix, a line-start "- " a question with a convert change
function checkTypography(text, { language = 'fi', lineStartDash = 'dialogue' } = {}) {
  if (language !== 'fi') return [];
  const findings = [];
  let offset = 0;
  let line = 0;
  for (const row of text.split('\n')) {
    line += 1;
    for (const match of row.matchAll(/"/g)) {
      const from = offset + match.index;
      findings.push({
        id: `suora-lainausmerkki@${from}`, ruleId: 'suora-lainausmerkki', level: 'normi', line, from, to: from + 1, quote: '"',
        message: 'Suora lainausmerkki.', url: 'https://example.invalid/lainausmerkit', fix: { from, to: from + 1, insert: '”' }
      });
    }
    const dash = /^[ \t]*-[ \t]+(?=\S)/.exec(row);
    if (dash && lineStartDash === 'dialogue') {
      const from = offset + dash[0].indexOf('-');
      const to = offset + dash[0].length;
      findings.push({
        id: `rivin-alun-viiva@${from}`, ruleId: 'rivin-alun-viiva', level: 'kysymys', line, from, to, quote: text.slice(from, to),
        message: DASH_MESSAGE, url: DASH_URL, fix: null, convert: { from, to, insert: '– ' }
      });
    }
    offset += row.length + 1;
  }
  return findings.sort((a, b) => a.from - b.from);
}

const deps = { matchTerms, splitBlocks, splitSentences, checkTypography };

// The real modules, when they are in the tree: the stand-ins must not hide a
// difference in shape. Missing modules skip those cases.
function loadReal() {
  try {
    const terms = require('../../src/editor/termMatch.js');
    return {
      splitBlocks: require('../../src/editor/blocks.js').splitBlocks,
      splitSentences: require('../../src/editor/sentences.js').splitSentences,
      checkTypography: require('../../src/editor/typography.fi.js').checkTypography,
      matchTerms: (text, words) => {
        const compiled = terms.compileTerms(words);
        return terms.findTermMatches(text, compiled, { skip: terms.todoRanges(text) })
          .map(match => ({ start: match.start, end: match.end, text: match.text, term: compiled.terms[match.term].text }));
      }
    };
  } catch (error) {
    return null;
  }
}
const real = loadReal();
const withRealModules = real ? test : test.skip;

const words = (count, word = 'sana') => Array.from({ length: count }, (_unused, index) => `${word}${index + 1}`).join(' ');
const capital = (text) => text[0].toUpperCase() + text.slice(1);
// "Sana1 sana2 … sanaN.": a sentence starts with a capital, or the one before it does not end
const sentenceOf = (count) => `${capital(words(count))}.`;

// ---------------------------------------------------------------------------
// Avoid words
// ---------------------------------------------------------------------------

describe('avoid words', () => {
  const TEXT = 'Hehkuva aamu. Jotenkin hän vain jäi. [TODO: jotenkin outo] Vainaja ei hehkui, mutta hehku jäi.';

  test('avoidWordFindings returns one finding per hit with the list item in the note', () => {
    const findings = avoidWordFindings(TEXT, ['jotenkin', '”vain”'], deps);

    expect(findings.map(finding => [finding.quote, finding.note])).toEqual([
      ['Jotenkin', 'Vältettävä sana: jotenkin'],
      ['vain', 'Vältettävä sana: vain']
    ]);
    // The item in quotation marks matches the word itself, not Vainaja; the note is skipped
    expect(findings[0]).toEqual({
      id: `avoid-words@${TEXT.indexOf('Jotenkin')}`,
      quote: 'Jotenkin',
      from: TEXT.indexOf('Jotenkin'),
      to: TEXT.indexOf('Jotenkin') + 8,
      located: true,
      approx: false,
      before: 'Hehkuva aamu. ',
      after: ' hän vain jäi. [TODO: jotenkin o',
      note: 'Vältettävä sana: jotenkin',
      suggestion: null,
      ref: null,
      data: { term: 'jotenkin' }
    });
    expect(findings[0].after).toHaveLength(LOCAL.CONTEXT_CHARS);
    expect(findings[1].data).toEqual({ term: 'vain' });
  });

  test('avoidWordFindings uses the matcher\'s ranges unchanged (Hehkuva, hehku, hehkui for hehku)', () => {
    const spy = jest.fn(matchTerms);
    const list = ['hehku'];
    const findings = avoidWordFindings(TEXT, list, { matchTerms: spy });

    // One call with the text and the list as they are: the same call the editor's highlight makes
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(TEXT, list);
    const hits = spy.mock.results[0].value;
    expect(hits.map(hit => hit.text)).toEqual(['Hehkuva', 'hehkui', 'hehku']);
    expect(findings.map(finding => [finding.from, finding.to])).toEqual(hits.map(hit => [hit.start, hit.end]));
    expect(findings.map(finding => finding.quote)).toEqual(['Hehkuva', 'hehkui', 'hehku']);
    expect(findings.every(finding => finding.note === 'Vältettävä sana: hehku')).toBe(true);
    expect(findings.map(finding => finding.id)).toEqual(hits.map(hit => `avoid-words@${hit.start}`));

    // Whatever the matcher says is taken as it is, also a range this module would not have chosen
    const fixed = avoidWordFindings('abcdef', ['x'], { matchTerms: () => [{ start: 2, end: 5, text: 'cde', term: 'x' }] });
    expect(fixed.map(finding => [finding.from, finding.to, finding.quote])).toEqual([[2, 5, 'cde']]);
  });

  test('an empty list gives the "lista on tyhjä" message and no findings', () => {
    const message = 'Vältettävien sanojen lista on tyhjä. Lisää sanat projektin asetuksissa.';
    const spy = jest.fn(matchTerms);
    for (const project of [{ avoidWords: [] }, { avoidWords: ['', '  '] }, {}, { avoidWords: 'jotenkin' }, null, undefined]) {
      expect(runLocalCheck('avoid-words', { text: TEXT, range: null, project }, { ...deps, matchTerms: spy }))
        .toEqual({ findings: [], message, total: 0 });
    }
    expect(spy).not.toHaveBeenCalled();
    expect(avoidWordFindings(TEXT, [], deps)).toEqual([]);

    // With a list the check runs and has no message
    const result = runLocalCheck('avoid-words', { text: TEXT, range: null, project: { avoidWords: ['jotenkin'] } }, deps);
    expect(result.message).toBeNull();
    expect(result.findings.map(finding => finding.quote)).toEqual(['Jotenkin']);
    expect(result.total).toBe(1);
  });

  withRealModules('the real matcher gives the same hits for a stem and for an exact word', () => {
    const findings = runLocalCheck('avoid-words', { text: TEXT, range: null, project: { avoidWords: ['hehku', '”vain”'] } }, real).findings;
    expect(findings.map(finding => [finding.quote, finding.note])).toEqual([
      ['Hehkuva', 'Vältettävä sana: hehku'],
      ['vain', 'Vältettävä sana: vain'],
      ['hehkui', 'Vältettävä sana: hehku'],
      ['hehku', 'Vältettävä sana: hehku']
    ]);
    expect(findings.every(finding => TEXT.slice(finding.from, finding.to) === finding.quote)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Long sentences
// ---------------------------------------------------------------------------

describe('long sentences', () => {
  test('sentenceWordCount counts EU:n, maa-alue and Åke-setä as one word each and a lone – as none', () => {
    expect(sentenceWordCount('EU:n maa-alue')).toBe(2);
    expect(sentenceWordCount('Åke-setä')).toBe(1);
    expect(sentenceWordCount('–')).toBe(0);
    expect(sentenceWordCount('– Tule! hän huusi.')).toBe(3);
    expect(sentenceWordCount('Åke-setä osti EU:n tuella maa-alueen – ja myi sen.')).toBe(8);
    // Apostrophes stay inside a word; digits are words; punctuation alone is none
    expect(sentenceWordCount('Vaa’an kieli näytti 12 ja rock’n’roll soi.')).toBe(7);
    expect(sentenceWordCount('… - — ”” ()')).toBe(0);
    expect(sentenceWordCount('')).toBe(0);
    expect(sentenceWordCount(null)).toBe(0);
    expect(sentenceWordCount('yksi\nkaksi\tkolme  neljä')).toBe(4);
  });

  test('clampLimit keeps 8–120 and falls back to 30', () => {
    expect([8, 30, 45, 120].map(clampLimit)).toEqual([8, 30, 45, 120]);
    expect([7, 0, -5].map(clampLimit)).toEqual([8, 8, 8]);
    expect([121, 5000].map(clampLimit)).toEqual([120, 120]);
    // An integer comes out
    expect(clampLimit(12.4)).toBe(12);
    expect(clampLimit(12.5)).toBe(13);
    // What a number field hands over
    expect(clampLimit('45')).toBe(45);
    expect(clampLimit(' 9 ')).toBe(9);
    // Not a number
    for (const value of [undefined, null, '', '  ', 'kolmekymmentä', NaN, Infinity, {}, [], true]) {
      expect(clampLimit(value)).toBe(30);
    }
    expect(LOCAL).toEqual({ DEFAULT_LONG_SENTENCE: 30, MIN_LONG_SENTENCE: 8, MAX_LONG_SENTENCE: 120, MAX_FINDINGS: 500, CONTEXT_CHARS: 32 });
  });

  test('longSentenceFindings flags a sentence over the limit and not one at the limit', () => {
    const atLimit = sentenceOf(10);
    const over = sentenceOf(11);
    const text = `${atLimit} ${over} Lyhyt virke.`;
    const findings = longSentenceFindings(text, 10, deps);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: `long-sentences@${atLimit.length + 1}`,
      quote: over,
      from: atLimit.length + 1,
      to: atLimit.length + 1 + over.length,
      located: true,
      approx: false,
      suggestion: null,
      ref: null,
      data: { words: 11, limit: 10 }
    });
    expect(longSentenceFindings(text, 11, deps)).toEqual([]);
    // The limit is clamped like the setting: 3 means 8, nothing means 30
    expect(longSentenceFindings(text, 3, deps).map(finding => finding.data)).toEqual([{ words: 10, limit: 8 }, { words: 11, limit: 8 }]);
    expect(longSentenceFindings(`${sentenceOf(30)} ${sentenceOf(31)}`, undefined, deps).map(finding => finding.data)).toEqual([{ words: 31, limit: 30 }]);
  });

  test('longSentenceFindings does not count a [TODO: …] note as words and returns raw offsets around it', () => {
    const note = '[TODO: tarkista tämä pitkä kohta ja kirjoita se kokonaan uudelleen ennen kuin lähetät]';
    const raw = `Alku. ${capital(words(4))} ${note} ${words(4, 'loppu')}. Toinen virke.`;

    // Eight words with the note left out: at the limit, not over it
    expect(longSentenceFindings(raw, 8, deps)).toEqual([]);

    const longer = raw.replace('loppu4.', 'loppu4 vielä.');
    const [finding] = longSentenceFindings(longer, 8, deps);
    expect(finding.data).toEqual({ words: 9, limit: 8 });
    // The range is that of the stored text: the sentence with its note inside
    expect(finding.quote).toBe(`${capital(words(4))} ${note} ${words(4, 'loppu')} vielä.`);
    expect(longer.slice(finding.from, finding.to)).toBe(finding.quote);
    expect(finding.before).toBe('Alku. ');
    expect(finding.after).toBe(' Toinen virke.');

    // Underline tags are not words and stay inside the range
    const [tagged] = longSentenceFindings(`${capital(words(8))} <u>yhdeksäs</u>.`, 8, deps);
    expect(tagged.data.words).toBe(9);
    expect(tagged.quote).toBe(`${capital(words(8))} <u>yhdeksäs</u>.`);
  });

  test('longSentenceFindings skips headings and > quote lines and checks list items', () => {
    const long = sentenceOf(9);
    const text = [`# ${long}`, '', `> ${long}`, `- ${long}`, `2. ${long}`, '* * *', long].join('\n');
    const findings = longSentenceFindings(text, 8, deps);

    expect(findings).toHaveLength(3);
    // The list marker is not part of the sentence
    expect(findings.map(finding => finding.quote)).toEqual([long, long, long]);
    expect(findings.map(finding => text.slice(finding.from - 3, finding.from))).toEqual(['\n- ', '2. ', ' *\n']);
    expect(findings.every(finding => text.slice(finding.from, finding.to) === long)).toBe(true);
  });

  test('longSentenceFindings treats a dialogue line as its own sentences (– Tule! hän huusi.)', () => {
    // A reporting clause in lower case belongs to its line of dialogue: one sentence of 11 words, the dash not counted
    const dialogue = '– Tule nyt jo sieltä rannasta tänne ylös! hän huusi kovaa veljelleen.';
    const text = `${dialogue} Sitten hän lähti.`;
    const findings = longSentenceFindings(text, 8, deps);
    expect(findings.map(finding => [finding.quote, finding.data.words])).toEqual([[dialogue, 11]]);
    // Cut at the exclamation mark neither half (7 and 4 words) would be over the limit
    expect(sentenceWordCount('– Tule nyt jo sieltä rannasta tänne ylös!')).toBe(7);

    // A line is a hard boundary: a short line of dialogue is never added to the paragraph before it
    const lines = `Hän seisoi rannalla ja katsoi kauas merelle\n– Tule! hän huusi.\n${words(6)}`;
    expect(longSentenceFindings(lines, 8, deps)).toEqual([]);
    // and the next sentence after a line of dialogue starts at its capital
    const after = `– Tule! hän huusi. ${sentenceOf(9)}`;
    expect(longSentenceFindings(after, 8, deps).map(finding => finding.quote)).toEqual([sentenceOf(9)]);
  });

  test('the note reads Virkkeessä on 34 sanaa (raja 30).', () => {
    const [finding] = longSentenceFindings(sentenceOf(34), 30, deps);
    expect(finding.note).toBe('Virkkeessä on 34 sanaa (raja 30).');

    const result = runLocalCheck('long-sentences', { text: sentenceOf(34), range: null, project: { review: { longSentenceWords: 30 } } }, deps);
    expect(result).toMatchObject({ message: null, total: 1 });
    expect(result.findings[0].note).toBe('Virkkeessä on 34 sanaa (raja 30).');
    // The project's limit decides; a project without one uses 30
    expect(runLocalCheck('long-sentences', { text: sentenceOf(34), range: null, project: { review: { longSentenceWords: 40 } } }, deps).findings).toEqual([]);
    expect(runLocalCheck('long-sentences', { text: sentenceOf(34), range: null, project: {} }, deps).findings[0].data).toEqual({ words: 34, limit: 30 });
    expect(runLocalCheck('long-sentences', { text: sentenceOf(13), range: null, project: { review: { longSentenceWords: 12 } } }, deps).findings[0].note)
      .toBe('Virkkeessä on 13 sanaa (raja 12).');
  });

  withRealModules('the real blocks and sentences give the same long sentences', () => {
    const note = '[TODO: tarkista]';
    const text = [`# ${sentenceOf(9)}`, `- ${words(4)} ${note} ${words(5, 'loppu')}.`, '– Tule nyt jo sieltä rannasta tänne ylös! hän huusi kovaa veljelleen.'].join('\n');
    const findings = longSentenceFindings(text, 8, real);
    expect(findings.map(finding => finding.data.words)).toEqual([9, 11]);
    expect(findings[0].quote).toBe(`${words(4)} ${note} ${words(5, 'loppu')}.`);
    expect(findings.every(finding => text.slice(finding.from, finding.to) === finding.quote)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Typography questions
// ---------------------------------------------------------------------------

describe('typography questions', () => {
  const TEXT = ['Hän sanoi "ei".', '- Tuletko sinä jo?', '  - sisennetty kohta', '– Oikea vuorosana.', '---', 'Loppu - ei viiva rivin alussa.'].join('\n');

  test('typographyQuestionFindings keeps only kysymys findings and covers the whole line', () => {
    const findings = typographyQuestionFindings(TEXT, deps, { language: 'fi', lineStartDash: 'dialogue' });

    // The straight quotation marks are the checker's own business, not a question
    expect(findings.map(finding => finding.quote)).toEqual(['- Tuletko sinä jo?', '  - sisennetty kohta']);
    const first = TEXT.indexOf('- Tuletko');
    expect(findings[0]).toMatchObject({
      id: `typography-questions@${first}`,
      from: first,
      to: first + '- Tuletko sinä jo?'.length,
      located: true,
      approx: false,
      note: DASH_MESSAGE,
      suggestion: null,
      ref: null
    });
    // From the start of the line, indentation included, to its end
    expect(TEXT[findings[1].from - 1]).toBe('\n');
    expect(TEXT[findings[1].to]).toBe('\n');
    expect(findings[0].before).toBe('Hän sanoi "ei".\n');
  });

  test('typographyQuestionFindings carries the convert change and the url', () => {
    const findings = typographyQuestionFindings(TEXT, deps, { language: 'fi', lineStartDash: 'dialogue' });
    const first = TEXT.indexOf('- Tuletko');

    expect(findings[0].data).toEqual({ ruleId: 'rivin-alun-viiva', url: DASH_URL, convert: { from: first, to: first + 2, insert: '– ' } });
    // The change of an indented line starts at its dash
    const second = TEXT.indexOf('- sisennetty');
    expect(findings[1].data.convert).toEqual({ from: second, to: second + 2, insert: '– ' });
    expect(TEXT.slice(second, second + 2)).toBe('- ');

    // The options go on to the checker as they are
    const spy = jest.fn(checkTypography);
    typographyQuestionFindings(TEXT, { checkTypography: spy }, { language: 'fi', lineStartDash: 'dialogue' });
    expect(spy).toHaveBeenCalledWith(TEXT, { language: 'fi', lineStartDash: 'dialogue' });
  });

  test('typography is skipped with a message for a non-Finnish project', () => {
    const spy = jest.fn(checkTypography);
    const result = runLocalCheck('typography-questions', { text: TEXT, range: null, project: {}, language: 'en', lineStartDash: 'dialogue' }, { ...deps, checkTypography: spy });
    expect(result).toEqual({ findings: [], message: 'Typografian tarkistus on tehty suomenkieliselle tekstille.', total: 0 });
    expect(spy).not.toHaveBeenCalled();

    // Finnish is the default language
    expect(runLocalCheck('typography-questions', { text: TEXT, range: null, project: {} }, deps)).toMatchObject({ message: null, total: 2 });
  });

  test('typography questions are not asked in a project whose line-start dash is a list', () => {
    const spy = jest.fn(checkTypography);
    const result = runLocalCheck('typography-questions', { text: TEXT, range: null, project: {}, language: 'fi', lineStartDash: 'list' }, { ...deps, checkTypography: spy });
    expect(result).toEqual({ findings: [], message: 'Projektin asetuksissa rivin alun viiva on luettelo, joten kysyttävää ei ole.', total: 0 });
    expect(spy).not.toHaveBeenCalled();

    // The setting goes to the checker: with 'dialogue' the same text has two questions
    const asked = runLocalCheck('typography-questions', { text: TEXT, range: null, project: {}, language: 'fi', lineStartDash: 'dialogue' }, { ...deps, checkTypography: spy });
    expect(spy).toHaveBeenCalledWith(TEXT, { language: 'fi', lineStartDash: 'dialogue' });
    expect(asked).toMatchObject({ message: null, total: 2 });
    // Called directly with 'list', the checker is told so and finds nothing to ask
    expect(typographyQuestionFindings(TEXT, deps, { language: 'fi', lineStartDash: 'list' })).toEqual([]);
  });

  test('without a typography checker the check says so', () => {
    const result = runLocalCheck('typography-questions', { text: TEXT, range: null, project: {}, language: 'fi' }, { matchTerms, splitBlocks, splitSentences });
    expect(result).toEqual({ findings: [], message: 'Typografian tarkistin ei ole käytettävissä.', total: 0 });
    expect(typographyQuestionFindings(TEXT, {}, {})).toEqual([]);
  });

  withRealModules('the real checker asks about the same lines', () => {
    const result = runLocalCheck('typography-questions', { text: TEXT, range: null, project: {}, language: 'fi', lineStartDash: 'dialogue' }, real);
    expect(result.findings.map(finding => finding.quote)).toEqual(['- Tuletko sinä jo?', '  - sisennetty kohta']);
    const first = TEXT.indexOf('- Tuletko');
    expect(result.findings[0].data.convert).toEqual({ from: first, to: first + 2, insert: '– ' });
    expect(result.findings[0].data.ruleId).toBe('rivin-alun-viiva');
    expect(typeof result.findings[0].data.url).toBe('string');
    expect(runLocalCheck('typography-questions', { text: TEXT, range: null, project: {}, language: 'fi', lineStartDash: 'list' }, real).findings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runLocalCheck
// ---------------------------------------------------------------------------

describe('runLocalCheck', () => {
  test('runLocalCheck filters by range and sorts by position', () => {
    const text = 'Jotenkin alku. Keskellä hän vain jäi. Lopussa jotenkin taas.';
    const project = { avoidWords: ['”vain”', 'jotenkin'] };

    // The matcher answers term by term; the list is in reading order
    const unsorted = { ...deps, matchTerms: (value, list) => matchTerms(value, list).reverse() };
    const all = runLocalCheck('avoid-words', { text, range: null, project }, unsorted);
    expect(all.findings.map(finding => finding.quote)).toEqual(['Jotenkin', 'vain', 'jotenkin']);
    expect(all.findings.map(finding => finding.from)).toEqual([0, text.indexOf('vain'), text.lastIndexOf('jotenkin')]);

    // Only what the selection touches
    const middle = { from: text.indexOf('Keskellä'), to: text.indexOf('Lopussa') };
    expect(runLocalCheck('avoid-words', { text, range: middle, project }, deps)).toMatchObject({ total: 1, findings: [{ quote: 'vain' }] });
    // A selection that cuts into a hit keeps it; one that only touches its edge does not
    const cut = { from: 4, to: 6 };
    expect(runLocalCheck('avoid-words', { text, range: cut, project }, deps).findings.map(finding => finding.quote)).toEqual(['Jotenkin']);
    const edge = { from: 8, to: 12 };
    expect(runLocalCheck('avoid-words', { text, range: edge, project }, deps).findings).toEqual([]);

    // The other checks are filtered the same way
    const long = `${sentenceOf(9)} ${sentenceOf(9)}`;
    const second = { from: long.lastIndexOf('Sana1 '), to: long.length };
    expect(runLocalCheck('long-sentences', { text: long, range: second, project: { review: { longSentenceWords: 8 } } }, deps).findings.map(finding => finding.from))
      .toEqual([sentenceOf(9).length + 1]);
  });

  test('runLocalCheck caps at 500 and says so', () => {
    const text = Array.from({ length: 520 }, () => 'jotenkin').join(' ');
    const result = runLocalCheck('avoid-words', { text, range: null, project: { avoidWords: ['jotenkin'] } }, deps);

    expect(result.findings).toHaveLength(500);
    expect(result.total).toBe(520);
    expect(result.message).toBe('Näytetään 500 ensimmäistä osumaa.');
    // The first 500 in reading order
    expect(result.findings[0].from).toBe(0);
    expect(result.findings[499].from).toBe(499 * 9);

    const exactly = runLocalCheck('avoid-words', { text: text.slice(0, 500 * 9 - 1), range: null, project: { avoidWords: ['jotenkin'] } }, deps);
    expect(exactly).toMatchObject({ total: 500, message: null });
    expect(exactly.findings).toHaveLength(500);
  });

  test('empty text gives no findings and no message, whatever the check', () => {
    for (const id of ['avoid-words', 'long-sentences', 'typography-questions']) {
      for (const text of ['', null, undefined]) {
        // Not even the "list is empty" message: there is nothing to check
        expect(runLocalCheck(id, { text, range: null, project: { avoidWords: [] }, language: 'en', lineStartDash: 'list' }, deps))
          .toEqual({ findings: [], message: null, total: 0 });
      }
    }
  });

  test('an unknown check id gives nothing', () => {
    expect(runLocalCheck('filler', { text: 'Hän vain katsoi.', range: null, project: {} }, deps)).toEqual({ findings: [], message: null, total: 0 });
    expect(runLocalCheck(undefined, { text: 'Hän vain katsoi.' }, deps)).toEqual({ findings: [], message: null, total: 0 });
  });
});

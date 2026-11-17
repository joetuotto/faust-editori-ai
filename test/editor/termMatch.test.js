/**
 * @jest-environment node
 */
const {
  parseTerm,
  parseTermList,
  formatTermList,
  compileTerms,
  findTermMatches,
  todoRanges,
  countTerms
} = require('../../src/editor/termMatch');

// The matched spellings of a term list in a text, in order
function found(terms, text, options) {
  return findTermMatches(text, compileTerms(terms), options).map(match => match.text);
}

describe('parseTerm', () => {
  test('trims, normalises to NFC and collapses inner whitespace', () => {
    expect(parseTerm('  Musta   Torni \t')).toEqual({ text: 'Musta Torni', exact: false });
    // "ä" typed as a + combining diaeresis becomes the one-character form
    expect(parseTerm('ha\u0308ma\u0308ra\u0308')).toEqual({ text: 'hämärä', exact: false });
    expect(parseTerm('Musta\u00A0Torni')).toEqual({ text: 'Musta Torni', exact: false });
  });

  test('a quoted item is exact: "vain", ”vain”, »vain»', () => {
    expect(parseTerm('"vain"')).toEqual({ text: 'vain', exact: true });
    expect(parseTerm('”vain”')).toEqual({ text: 'vain', exact: true });
    expect(parseTerm('»vain»')).toEqual({ text: 'vain', exact: true });
    expect(parseTerm('“vain”')).toEqual({ text: 'vain', exact: true });
    expect(parseTerm(' ” ihan kuin ” ')).toEqual({ text: 'ihan kuin', exact: true });
    // A quotation mark on one side only is not a pair
    expect(parseTerm('”vain')).toEqual({ text: '”vain', exact: false });
  });

  test('returns null for empty, punctuation-only and quote-only input', () => {
    expect(parseTerm('')).toBeNull();
    expect(parseTerm('   ')).toBeNull();
    expect(parseTerm('...')).toBeNull();
    expect(parseTerm('– –')).toBeNull();
    expect(parseTerm('””')).toBeNull();
    expect(parseTerm('"…"')).toBeNull();
    expect(parseTerm(null)).toBeNull();
    expect(parseTerm(undefined)).toBeNull();
    // A digit is enough
    expect(parseTerm('1917')).toEqual({ text: '1917', exact: false });
  });
});

describe('parseTermList and formatTermList', () => {
  test('splits on line breaks, commas and semicolons', () => {
    expect(parseTermList('hehku, jotenkin; ikään kuin\nselkeästi\r\n  tavallaan  ')).toEqual([
      'hehku', 'jotenkin', 'ikään kuin', 'selkeästi', 'tavallaan'
    ]);
    expect(parseTermList(',,;\n\n...,””')).toEqual([]);
    expect(parseTermList('')).toEqual([]);
    expect(parseTermList(undefined)).toEqual([]);
  });

  test('drops later duplicates case-insensitively and keeps the first spelling', () => {
    expect(parseTermList('Hehku\nhehku\nHEHKU\njotenkin\nÄiti\näiti')).toEqual(['Hehku', 'jotenkin', 'Äiti']);
  });

  test('keeps a quoted and an unquoted spelling of the same word as two items', () => {
    expect(parseTermList('vain\n”vain”\n"Vain"')).toEqual(['vain', '”vain”']);
  });

  test('round trip keeps order', () => {
    const list = ['jotenkin', '”vain”', 'Musta Torni', 'hehku'];
    expect(parseTermList(formatTermList(list))).toEqual(list);
    expect(formatTermList(list)).toBe('jotenkin\n”vain”\nMusta Torni\nhehku');
    expect(parseTermList(formatTermList(list, ', '))).toEqual(list);
    expect(formatTermList([])).toBe('');
    expect(formatTermList(undefined)).toBe('');
  });
});

describe('findTermMatches', () => {
  test('a stem matches from the start of a word: Mari finds Mari, Marian, Mariannen, not marina or Rosmariini', () => {
    const matches = findTermMatches('Mari näki Marian ja Mariannen. marina, Rosmariini, MARI', compileTerms(['Mari']));
    expect(matches.map(match => match.text)).toEqual(['Mari', 'Marian', 'Mariannen', 'MARI']);
    expect(matches[1]).toEqual({ start: 10, end: 16, text: 'Marian', term: 0 });
  });

  test('an uppercase letter in the term must be uppercase in the text: Mari does not find mari, finds MARI', () => {
    expect(found(['Mari'], 'mari ja marin, MARI ja MARIN')).toEqual(['MARI', 'MARIN']);
    expect(found(['EU'], 'eu, Eu, EU')).toEqual(['EU']);
  });

  test('a lowercase term finds a capitalised word: hehku finds Hehkuva, jotenkin finds Jotenkin', () => {
    expect(found(['hehku', 'jotenkin'], 'Hehkuva hehku hehkui. Jotenkin se – jotenkin.')).toEqual([
      'Hehkuva', 'hehku', 'hehkui', 'Jotenkin', 'jotenkin'
    ]);
  });

  test('ä, ö and å: Åke finds Åken, öljy finds Öljy and öljyinen, Älä does not find älä', () => {
    expect(found(['Åke', 'öljy', 'Älä'], 'Åken öljyinen Öljy. älä, Älä!')).toEqual(['Åken', 'öljyinen', 'Öljy', 'Älä']);
    // A word boundary before ä, ö and å is a real boundary: no match inside a longer word
    expect(found(['äiti'], 'isoäiti ja äiti, Äidin äitiys')).toEqual(['äiti', 'äitiys']);
  });

  test('a quoted term finds the whole word only: ”vain” finds Vain, not vainaja; unquoted ihan finds ihana', () => {
    expect(found(['"vain"', 'ihan', '”siis”'], 'Vain vainaja oli ihan ihana, siis siisti. Vain.')).toEqual([
      'Vain', 'ihan', 'ihana', 'siis', 'Vain'
    ]);
  });

  test('colon inflection: EU finds EU:n and EU:ssa, not Eurooppa or eu', () => {
    expect(found(['EU'], 'EU:n ja EU:ssa, Eurooppa, eu, EU.')).toEqual(['EU:n', 'EU:ssa', 'EU']);
  });

  test('several words: each may take an ending, Musta Torni finds Mustan Tornin and Mustassa  Tornissa', () => {
    expect(found(['Musta Torni'], 'Mustan Tornin juurella, Mustassa  Tornissa.')).toEqual(['Mustan Tornin', 'Mustassa  Tornissa']);
    // A no-break space between the words is still one line
    expect(found(['Musta Torni'], 'Mustan\u00A0Tornin varjo')).toEqual(['Mustan\u00A0Tornin']);
  });

  test('a match never crosses a line break', () => {
    expect(found(['Musta Torni'], 'Musta\nTorni')).toEqual([]);
    expect(found(['Musta Torni'], 'Musta\r\nTorni ja Musta \n Torni')).toEqual([]);
  });

  test('hyphen and apostrophe variants: Jean-Luc finds Jean-Lucin, O\'Brien finds O’Brienin', () => {
    expect(found(['Jean-Luc'], 'Jean-Lucin kanssa. – Jean-Luc, hän sanoi.')).toEqual(['Jean-Lucin', 'Jean-Luc']);
    // The non-breaking hyphen U+2011 is the same hyphen
    expect(found(['Jean-Luc'], 'Jean\u2011Lucin kanssa')).toEqual(['Jean\u2011Lucin']);
    expect(found(["O'Brien"], "O’Brienin ja O'Brienin")).toEqual(['O’Brienin', "O'Brienin"]);
    expect(found(['O’Brien'], "O'Brienin talo")).toEqual(["O'Brienin"]);
  });

  test('the longest term wins at one position: Mari and Mari Virtase on "Mari Virtasen talo ja Mari."', () => {
    const matches = findTermMatches('Mari Virtasen talo ja Mari.', compileTerms(['Mari', 'Mari Virtase']));
    expect(matches).toEqual([
      { start: 0, end: 13, text: 'Mari Virtasen', term: 1 },
      { start: 22, end: 26, text: 'Mari', term: 0 }
    ]);
  });

  test('a dialogue dash and quotation marks do not block a match: "– Pekka, tule!" and "”Pekka!”"', () => {
    expect(found(['Pekka'], '– Pekka, tule!')).toEqual(['Pekka']);
    expect(found(['Pekka'], '”Pekka!”')).toEqual(['Pekka']);
    expect(found(['Peka', 'Pekka'], '– Pekka antoi Pekan kirjan Pekalle. ”Pekka!”')).toEqual(['Pekka', 'Pekan', 'Pekalle', 'Pekka']);
  });

  test('an en dash between two names: "Mari–Pekka" finds both', () => {
    expect(found(['Mari', 'Pekka'], 'Mari–Pekka-akseli')).toEqual(['Mari', 'Pekka']);
  });

  test('a term inside underline tags: `<u>Mari</u>` finds Mari', () => {
    const matches = findTermMatches('Tämä on <u>Mari</u>.', compileTerms(['Mari']));
    expect(matches).toEqual([{ start: 11, end: 15, text: 'Mari', term: 0 }]);
  });

  test('the italic marker is not part of a word: _Mari_ finds Mari, _Marin_ finds Marin, _jotenkin_ finds jotenkin', () => {
    expect(findTermMatches('_Mari_ tuli.', compileTerms(['Mari']))).toEqual([{ start: 1, end: 5, text: 'Mari', term: 0 }]);
    expect(findTermMatches('_Hän näki Marin_.', compileTerms(['Mari']))).toEqual([{ start: 10, end: 15, text: 'Marin', term: 0 }]);
    expect(found(['Mari'], '_Mari tuli kotiin_, hän ajatteli.')).toEqual(['Mari']);
    // A quoted item is still the whole word only
    expect(found(['jotenkin', '”vain”'], 'Se oli _jotenkin_ outoa, _vain_ outoa, _vainaja_.')).toEqual(['jotenkin', 'vain']);
    // The other inline markers of the app, also stacked
    expect(found(['Mari'], '**Mari** ja ~~Marin~~ ja _**Marille**_')).toEqual(['Mari', 'Marin', 'Marille']);
    // Still only from the start of a word
    expect(found(['Mari'], 'Rosmariini, marina, 2Mari, _Rosmariini_')).toEqual([]);
    // The exclusion list works on a word in italics too
    expect(found(['Mari'], '_Marianne_ ja _Marin_', { exclude: compileTerms(['Marianne']) })).toEqual(['Marin']);
  });

  test('decomposed letters in the text: Äiti finds A + combining diaeresis, and a match never ends in front of a combining mark', () => {
    // Text pasted from a PDF: "ä" as "a" and U+0308. Terms are NFC, the text is searched as it is.
    const DIAERESIS = String.fromCharCode(0x308);
    const composed = 'Äiti tuli hämärässä. Öljymäki näkyi. Pekän, EU:ssä.';
    const decomposed = composed.normalize('NFD');
    expect(decomposed).toHaveLength(composed.length + 10);

    const terms = ['Äiti', 'hämärä', 'Öljymäki', 'Pek', 'EU'];
    const words = ['Äiti', 'hämärässä', 'Öljymäki', 'Pekän', 'EU:ssä'];
    expect(found(terms, composed)).toEqual(words);

    const matches = findTermMatches(decomposed, compileTerms(terms));
    expect(matches.map(match => match.text.normalize('NFC'))).toEqual(words);
    // Offsets are offsets in the text that was searched, and the whole letter is inside the match
    for (const match of matches) expect(decomposed.slice(match.start, match.end)).toBe(match.text);
    expect(matches[0]).toEqual({ start: 0, end: 5, text: `A${DIAERESIS}iti`, term: 0 });
    expect(matches[3]).toEqual({ start: 45, end: 51, text: `Peka${DIAERESIS}n`, term: 3 });

    // "Peka" is not the start of "Pekän", however the ä is written
    expect(found(['Peka'], 'Pekän ja Pekan')).toEqual(['Pekan']);
    expect(found(['Peka'], `Peka${DIAERESIS}n ja Pekan`)).toEqual(['Pekan']);
    // A word does not start in the middle of a decomposed one
    expect(found(['iti'], `a${DIAERESIS}iti ja iti`)).toEqual(['iti']);
    // The case rule holds for a decomposed letter as well
    expect(found(['äiti'], `A${DIAERESIS}iti ja a${DIAERESIS}itiys`)).toEqual([`A${DIAERESIS}iti`, `a${DIAERESIS}itiys`]);
    expect(found(['Äiti'], `a${DIAERESIS}iti`)).toEqual([]);
    // A quoted item: the whole word, with its last letter whole
    expect(found(['”pekä”'], `Peka${DIAERESIS} ja peka${DIAERESIS}n ja Peka`)).toEqual([`Peka${DIAERESIS}`]);
    const exact = findTermMatches(`Peka${DIAERESIS} ja Peka`, compileTerms(['”Peka”']));
    expect(exact).toEqual([{ start: 9, end: 13, text: 'Peka', term: 0 }]);
    // The exclusion list is read at the same place in the same text
    expect(found(['Mari'], `Maria${DIAERESIS} ja Marin`, { exclude: compileTerms(['Mariä']) })).toEqual(['Marin']);
  });

  test('exclude: Marianne and Marika removed, quoted ”Maria” removes only Maria', () => {
    const text = 'Mari näki Marian ja Mariannen, Marikan. Maria.';
    const exclude = compileTerms(['Marianne', 'Marika', '"Maria"']);
    expect(found(['Mari'], text, { exclude })).toEqual(['Mari', 'Marian']);
    // Without the list everything that starts with Mari counts
    expect(found(['Mari'], text)).toEqual(['Mari', 'Marian', 'Mariannen', 'Marikan', 'Maria']);
    // An empty exclusion list changes nothing
    expect(found(['Mari'], text, { exclude: compileTerms([]) })).toHaveLength(5);
  });

  test('skip ranges: a hit inside "[TODO: kysy Marilta]" is dropped', () => {
    const text = 'Mari tuli. [TODO: kysy Marilta] Marin takki.';
    expect(found(['Mari'], text, { skip: todoRanges(text) })).toEqual(['Mari', 'Marin']);
    expect(found(['Mari'], text)).toEqual(['Mari', 'Marilta', 'Marin']);
    // A hit that only partly overlaps a range is dropped too
    expect(found(['Mari'], 'Marin takki', { skip: [{ start: 3, end: 8 }] })).toEqual([]);
    expect(found(['Mari'], 'Marin takki', { skip: [{ start: 5, end: 8 }] })).toEqual(['Marin']);
  });

  test('regex characters in a term are literal: C++, (x)', () => {
    expect(found(['C++', '(x)'], 'C++ on kieli, (x) on merkintä, Cxx ja x eivät.')).toEqual(['C++', '(x)']);
    expect(found(['a.b', 'mitä?', '[sic]', 'a|b', '1/2', 'a\\b', '$5', 'x^2', '{n}'],
      'a.b axb mitä? [sic] a|b 1/2 a\\b $5 x^2 {n}')).toEqual(['a.b', 'mitä?', '[sic]', 'a|b', '1/2', 'a\\b', '$5', 'x^2', '{n}']);
  });

  test('a term that is only punctuation is ignored', () => {
    const compiled = compileTerms(['C++', '...', '””', '–', '']);
    expect(compiled.terms).toEqual([{ text: 'C++', exact: false }]);
    expect(findTermMatches('C++ on kieli... – niin.', compiled).map(match => match.text)).toEqual(['C++']);
  });

  test('an empty list has a null pattern and finds nothing', () => {
    for (const list of [[], undefined, null, ['...', '']]) {
      const compiled = compileTerms(list);
      expect(compiled).toEqual({ terms: [], pattern: null, sticky: null });
      expect(findTermMatches('Mari tuli.', compiled)).toEqual([]);
    }
    expect(findTermMatches('', compileTerms(['Mari']))).toEqual([]);
    expect(findTermMatches(undefined, compileTerms(['Mari']))).toEqual([]);
    expect(findTermMatches('Mari', null)).toEqual([]);
  });

  test('matches are sorted and never overlap', () => {
    const text = 'Mari Virtasen Mari-täti ja Virtasen Mari, Mari Mari Virtanen. Marin Virtaset.';
    const matches = findTermMatches(text, compileTerms(['Mari', 'Virta', 'Mari Virta', 'täti']));
    expect(matches.length).toBeGreaterThan(5);
    for (let index = 0; index < matches.length; index++) {
      const match = matches[index];
      expect(match.end).toBeGreaterThan(match.start);
      expect(text.slice(match.start, match.end)).toBe(match.text);
      if (index > 0) expect(match.start).toBeGreaterThanOrEqual(matches[index - 1].end);
    }
  });

  test('the same compiled list can be used again and again', () => {
    const compiled = compileTerms(['Mari']);
    expect(findTermMatches('Mari ja Mari', compiled)).toHaveLength(2);
    expect(findTermMatches('Mari', compiled)).toHaveLength(1);
    expect(findTermMatches('Marin Mari', compiled)).toHaveLength(2);
  });

  test('compileTerms drops repeats, keeps a quoted and an unquoted item apart and numbers terms in list order', () => {
    const compiled = compileTerms(['Mari', 'Mari', '”Mari”', 'mari', '  Mari  ']);
    expect(compiled.terms).toEqual([
      { text: 'Mari', exact: false },
      { text: 'Mari', exact: true },
      { text: 'mari', exact: false }
    ]);
    expect(compiled.sticky.sticky).toBe(true);
    expect(compiled.pattern.global).toBe(true);
  });
});

describe('todoRanges', () => {
  test('finds closed markers; an unclosed marker and a marker broken by a line break are not ranges', () => {
    const text = 'a [TODO: x] b [TODO: auki\n] c [TODO: y][TODO: z';
    expect(todoRanges(text)).toEqual([{ start: 2, end: 11 }, { start: 30, end: 39 }]);
    expect(text.slice(30, 39)).toBe('[TODO: y]');
    expect(todoRanges('[TODO:]')).toEqual([{ start: 0, end: 7 }]);
    expect(todoRanges('ei merkintöjä')).toEqual([]);
    expect(todoRanges('')).toEqual([]);
    expect(todoRanges(undefined)).toEqual([]);
  });
});

describe('countTerms', () => {
  test('one row per term in list order, zero included, TODO markers not counted', () => {
    const text = 'Hehkuva hehku. [TODO: hehku pois] Vain vainaja.\nJotain muuta.';
    expect(countTerms(text, ['hehku', '”vain”', 'jotenkin', '...'])).toEqual([
      { term: 'hehku', count: 2 },
      { term: 'vain', count: 1 },
      { term: 'jotenkin', count: 0 }
    ]);
    // A word in italics is counted like any other
    expect(countTerms('Se oli _jotenkin_ outoa, jotenkin.', ['jotenkin'])).toEqual([{ term: 'jotenkin', count: 2 }]);
    expect(countTerms('', ['hehku'])).toEqual([{ term: 'hehku', count: 0 }]);
    expect(countTerms(undefined, ['hehku'])).toEqual([{ term: 'hehku', count: 0 }]);
    expect(countTerms('hehku', [])).toEqual([]);
  });
});

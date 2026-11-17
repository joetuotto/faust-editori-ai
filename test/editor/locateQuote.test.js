/**
 * @jest-environment node
 */
const { locateQuote, foldForMatch } = require('../../src/editor/locateQuote');

const text = 'Kissa istui **ikkunalla** ja katseli  sadetta. ”Tule tänne”, äiti sanoi – ja kissa tuli.\n' +
  'Sitten se nukahti… Aamulla kissa istui taas ikkunalla ja katseli lintuja.';
const found = (quote, options) => {
  const hit = locateQuote(text, quote, options);
  return hit && [text.slice(hit.from, hit.to), hit.method];
};
// "ä" as a + combining dots, written as an escape so that no editor composes it silently
const DECOMPOSED_AE = 'A\u0308';

describe('locateQuote: exact', () => {
  test('finds the quote as it is', () => {
    expect(locateQuote(text, 'katseli  sadetta')).toEqual({ from: 29, to: 45, method: 'exact', count: 1, coverage: 1 });
  });

  test('prefers a whole word to a part of a word', () => {
    // "se" is also inside "katseli"
    expect(locateQuote(text, 'se')).toMatchObject({ from: 96, to: 98, method: 'exact', count: 1 });
  });

  test('several matches: the first by default, the nearest with near, and the count', () => {
    const repeated = 'kissa istui ja kissa makasi ja kissa nukkui';
    expect(locateQuote(repeated, 'kissa')).toMatchObject({ from: 0, count: 3 });
    expect(locateQuote(repeated, 'kissa', { near: 30 })).toMatchObject({ from: 31, count: 3 });
  });

  test('quotation marks and ellipses a model puts around the quote are ignored', () => {
    expect(found('”kissa istui”')).toEqual(['kissa istui', 'exact']);
    expect(found('…ja kissa tuli…')).toEqual(['ja kissa tuli', 'exact']);
  });

  // Cases beyond the named list

  test('the quote is trimmed, and other wrappings go too: "…", ‘…’, three dots, both at once', () => {
    expect(found('  katseli  sadetta \n')).toEqual(['katseli  sadetta', 'exact']);
    expect(found('"äiti sanoi"')).toEqual(['äiti sanoi', 'exact']);
    expect(found('‘äiti sanoi’')).toEqual(['äiti sanoi', 'exact']);
    expect(found('...ja kissa tuli...')).toEqual(['ja kissa tuli', 'exact']);
    // the ellipses outside the quotation marks, and inside them
    expect(found('…”ja kissa tuli”…')).toEqual(['ja kissa tuli', 'exact']);
    expect(found('”…ja kissa tuli…”')).toEqual(['ja kissa tuli', 'exact']);
    expect(found('"... ja kissa tuli ..."')).toEqual(['ja kissa tuli', 'exact']);
  });

  test('a quote that is in the text with its quotation marks is found with them', () => {
    expect(found('”Tule tänne”')).toEqual(['”Tule tänne”', 'exact']);
  });

  test('when only parts of words match, they all count; whole words are counted alone', () => {
    expect(locateQuote('katseli ja katsoi', 'kats')).toMatchObject({ from: 0, method: 'exact', count: 2 });
    // "se" stands alone twice; the ones inside "sen" and "katseli" are not counted
    expect(locateQuote('se katseli sen, ja se lähti', 'se')).toMatchObject({ from: 0, count: 2 });
    expect(locateQuote('se katseli sen, ja se lähti', 'se', { near: 20 })).toMatchObject({ from: 19, count: 2 });
  });

  test('a word that starts or ends with ä, ö or å is a whole word', () => {
    expect(locateQuote('pääskynen ja pää', 'pää')).toMatchObject({ from: 13, to: 16, count: 1 });
    expect(locateQuote('yötä ja yö', 'yö')).toMatchObject({ from: 8, to: 10, count: 1 });
  });
});

describe('locateQuote: normalized', () => {
  test('emphasis markers in the text and runs of spaces do not matter; the range covers them', () => {
    expect(found('Kissa istui ikkunalla ja katseli sadetta.')).toEqual(['Kissa istui **ikkunalla** ja katseli  sadetta.', 'normalized']);
  });

  test('straight quotes and a hyphen match ” and –', () => {
    expect(found('"Tule tänne", äiti sanoi - ja kissa tuli.')).toEqual(['”Tule tänne”, äiti sanoi – ja kissa tuli.', 'normalized']);
  });

  test('three dots match …', () => {
    expect(found('Sitten se nukahti... Aamulla')).toEqual(['Sitten se nukahti… Aamulla', 'normalized']);
  });

  test('case differences do not matter', () => {
    expect(found('TULE TÄNNE')).toEqual(['Tule tänne', 'normalized']);
  });

  test('<u> tags are skipped', () => {
    expect(locateQuote('Hän sanoi <u>todella</u> hyvin.', 'sanoi todella hyvin')).toMatchObject({ from: 4, to: 30, method: 'normalized' });
  });

  test('a decomposed ä matches a precomposed one, both ways', () => {
    expect(locateQuote(`${DECOMPOSED_AE}iti tuli. Äiti lähti.`, 'Äiti tuli')).toMatchObject({ from: 0, to: 10, method: 'normalized' });
    expect(locateQuote('Aiti tuli. Äiti lähti.', `${DECOMPOSED_AE}iti lähti`)).toMatchObject({ from: 11, to: 21, method: 'normalized' });
  });

  // Cases beyond the named list

  test('a line break, a no-break space, a soft hyphen and a zero-width space in the text do not matter', () => {
    expect(found('kissa tuli. Sitten se nukahti')).toEqual(['kissa tuli.\nSitten se nukahti', 'normalized']);
    const odd = 'Hinta oli 5\u00a0% ja yhdys\u00adsana toi\u200bmi.';
    const hit = locateQuote(odd, '5 % ja yhdyssana toimi');
    expect(hit).toMatchObject({ method: 'normalized', count: 1, coverage: 1 });
    expect(odd.slice(hit.from, hit.to)).toBe('5\u00a0% ja yhdys\u00adsana toi\u200bmi');
  });

  test('the whole-word preference, near and the count work on the folded text too', () => {
    const repeated = 'Se **kissa** nukkui. Kissat ja kissa. Vielä KISSA.';
    const hit = locateQuote(repeated, 'Kissa ');
    // exact "Kissa" is only inside "Kissat", so the exact step takes that one
    expect(hit).toMatchObject({ from: 21, to: 26, method: 'exact', count: 1 });
    // folded, three whole words remain; near picks the last
    expect(locateQuote(repeated, 'kIssa')).toMatchObject({ from: 5, to: 10, method: 'normalized', count: 3 });
    expect(locateQuote(repeated, 'kIssa', { near: 45 })).toMatchObject({ from: 44, to: 49, method: 'normalized', count: 3 });
  });

  test('a folded quote of one character is not searched', () => {
    expect(locateQuote('Kissa a b', '*A*')).toBeNull();
  });
});

describe('locateQuote: longest beginning', () => {
  test('a quote whose end was reworded is found by its beginning, cut at a word', () => {
    const hit = locateQuote(text, 'Aamulla kissa istui taas ikkunalla ja katsoi ulos pihalle');
    expect(text.slice(hit.from, hit.to)).toBe('Aamulla kissa istui taas ikkunalla ja');
    expect(hit.method).toBe('prefix');
    expect(hit.coverage).toBeCloseTo(0.649, 3);
  });

  test('a beginning under three words or twelve characters is not accepted', () => {
    expect(locateQuote('Yksi kaksi kolme neljä.', 'Yksi kaksi viisi kuusi seitsemän')).toBeNull();
    expect(locateQuote('Oi ja a b c.', 'Oi ja a x y z')).toBeNull();
    expect(locateQuote('Yksi kaksi kolme neljä viisi.', 'Yksi kaksi kolme seitsemän kahdeksan')).toMatchObject({ from: 0, to: 16, method: 'prefix' });
  });

  // Cases beyond the named list

  test('minPrefixWords moves the word limit; the twelve characters stay', () => {
    const source = 'Aamulla aikaisin lähdettiin matkaan.';
    const quote = 'Aamulla aikaisin herättiin kaikki';
    expect(locateQuote(source, quote)).toBeNull();
    expect(locateQuote(source, quote, { minPrefixWords: 2 })).toMatchObject({ from: 0, to: 16, method: 'prefix', count: 1 });
    expect(locateQuote(source, quote, { minPrefixWords: 2 }).coverage).toBeCloseTo(16 / 33, 5);
    // two words, but only ten characters
    expect(locateQuote('Yksi kaksi kolme.', 'Yksi kaksi viisi kuusi', { minPrefixWords: 2 })).toBeNull();
  });

  test('the beginning is matched on the folded text and covers markers inside it', () => {
    const source = 'Sitten **vanha** kissa  nousi ylös ja lähti.';
    const hit = locateQuote(source, 'sitten vanha kissa nousi hitaasti seisomaan');
    expect(hit.method).toBe('prefix');
    expect(source.slice(hit.from, hit.to)).toBe('Sitten **vanha** kissa  nousi');
  });

  test('the whole quote is never a prefix match: at least its last word is dropped', () => {
    // every word is in the text, but not next to each other
    expect(locateQuote('Yksi kaksi kolme neljä. Viisi.', 'Yksi kaksi kolme viisi')).toMatchObject({ from: 0, to: 16, method: 'prefix' });
  });
});

describe('locateQuote: ellipses', () => {
  test('an ellipsis inside the quotation marks that belongs to the text is covered', () => {
    expect(locateQuote('Hän epäröi… ja lähti.', '”Hän epäröi…”')).toEqual({ from: 0, to: 11, method: 'exact', count: 1, coverage: 1 });
    expect(locateQuote('…ja sitten hän lähti.', '”…ja sitten hän lähti.”')).toMatchObject({ from: 0, to: 21 });
    expect(locateQuote('a … b', '”…”')).toMatchObject({ from: 2, to: 3 });
    // the normalized step too tries the variant with the ellipsis first
    expect(locateQuote('Hän  epäröi… ja lähti.', '”Hän epäröi…”')).toMatchObject({ from: 0, to: 12, method: 'normalized' });
  });

  test('ellipses inside the marks are dropped only when the quote is not found with them', () => {
    expect(locateQuote('Sano näin, ja mene.', '”…näin…”')).toMatchObject({ from: 5, to: 9, method: 'exact' });
    expect(locateQuote('Sano  NÄIN, ja mene.', '”…näin…”')).toMatchObject({ from: 6, to: 10, method: 'normalized' });
  });
});

describe('locateQuote: limits', () => {
  test('nothing found, an empty quote or an empty text give null', () => {
    expect(locateQuote(text, 'tätä ei ole tekstissä lainkaan')).toBeNull();
    expect(locateQuote(text, '')).toBeNull();
    expect(locateQuote(text, '   ')).toBeNull();
    expect(locateQuote('', 'kissa')).toBeNull();
    expect(locateQuote(undefined, undefined)).toBeNull();
  });

  test('from and to limit the search; offsets stay those of the whole text', () => {
    expect(locateQuote(text, 'kissa istui taas', { from: 100 })).toMatchObject({ from: 116, to: 132 });
    expect(locateQuote(text, 'Kissa istui', { to: 50 })).toMatchObject({ from: 0, to: 11 });
    expect(locateQuote(text, 'lintuja', { to: 50 })).toBeNull();
  });

  // Cases beyond the named list

  test('from, to and near work together, also for a normalized match; an empty range gives null', () => {
    const repeated = 'kissa istui. Kissa makasi. kissa nukkui.';
    expect(locateQuote(repeated, 'kissa', { from: 1 })).toMatchObject({ from: 27, method: 'exact', count: 1 });
    expect(locateQuote(repeated, 'KISSA', { from: 1 })).toMatchObject({ from: 13, to: 18, method: 'normalized', count: 2 });
    expect(locateQuote(repeated, 'KISSA', { from: 1, near: 30 })).toMatchObject({ from: 27, to: 32, method: 'normalized', count: 2 });
    expect(locateQuote(repeated, 'kissa', { from: 20, to: 20 })).toBeNull();
    expect(locateQuote(repeated, 'kissa', { from: 500 })).toBeNull();
  });
});

describe('foldForMatch', () => {
  test('folds the text and maps every folded character back to its source', () => {
    const folded = foldForMatch(`${DECOMPOSED_AE}iti  ”sanoi” – *hei*…`);
    expect(folded.text).toBe('äiti "sanoi" - hei...');
    // ä comes from two units, the double space from two, … gives three dots
    expect(folded.starts.slice(0, 6)).toEqual([0, 2, 3, 4, 5, 7]);
    expect(folded.ends.slice(0, 6)).toEqual([2, 3, 4, 5, 7, 8]);
    expect(folded.starts.slice(-3)).toEqual([22, 22, 22]);
    expect(folded.ends.slice(-3)).toEqual([23, 23, 23]);
  });

  // Cases beyond the named list

  test('every kind of quotation mark, apostrophe and dash folds to its plain form', () => {
    expect(foldForMatch('"“”„‟«»').text).toBe('"""""""');
    expect(foldForMatch('\'‘’‚‛‹›′´`').text).toBe('\'\'\'\'\'\'\'\'\'\'');
    expect(foldForMatch('-\u2010\u2011\u2012–—\u2015\u2212').text).toBe('--------');
  });

  test('tags, emphasis markers, zero-width characters and the soft hyphen are dropped', () => {
    expect(foldForMatch('<u>ali</u> **lihava** _kurs_ ~~yli~~ a\u200bb\u200cc\u200dd\u2060e\ufefff\u00adg').text).toBe('ali lihava kurs yli abcdefg');
  });

  test('a run of any whitespace is one space whose range covers the run', () => {
    const folded = foldForMatch('a \t\u00a0\nb');
    expect(folded.text).toBe('a b');
    expect([folded.starts[1], folded.ends[1]]).toEqual([1, 5]);
    // a dropped marker inside the run does not split it
    const marked = foldForMatch('a *\n* b');
    expect(marked.text).toBe('a b');
    expect([marked.starts[1], marked.ends[1]]).toEqual([1, 6]);
  });

  test('the maps are as long as the folded text; empty and missing text fold to nothing', () => {
    const folded = foldForMatch('Äiti… 😀 ÅKE');
    expect(folded.text).toBe('äiti... 😀 åke');
    expect(folded.starts).toHaveLength(folded.text.length);
    expect(folded.ends).toHaveLength(folded.text.length);
    expect(foldForMatch('')).toEqual({ text: '', starts: [], ends: [] });
    expect(foldForMatch(null)).toEqual({ text: '', starts: [], ends: [] });
  });

  test('a long chapter folds in linear time', () => {
    const chapter = 'Kissa istui  ikkunalla ja katseli sadetta.\n'.repeat(15000); // 660 000 characters
    const started = Date.now();
    const folded = foldForMatch(chapter);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(folded.text.length).toBe(42 * 15000);
  });
});

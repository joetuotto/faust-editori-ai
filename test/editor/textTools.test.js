/**
 * @jest-environment node
 */
const {
  WORD_CHAR,
  countWords,
  countCharacters,
  countProjectWords,
  estimatePages,
  wordAt,
  toggleInline,
  setHeading,
  toggleLinePrefix,
  continueList,
  insertText,
  transformSelection,
  trimSpaces,
  collapseEmptyLines,
  buildSearchPattern,
  findMatches,
  replaceAllMatches
} = require('../../src/editor/textTools');

// "Kissa |istui| tässä" style helper: | marks the selection (one | = cursor)
function sel(marked) {
  const first = marked.indexOf('|');
  const rest = marked.slice(first + 1);
  const second = rest.indexOf('|');
  const text = marked.replace(/\|/g, '');
  return second === -1 ? [text, first, first] : [text, first, first + second];
}

function show(result) {
  if (!result) return null;
  const { text, selStart, selEnd } = result;
  if (selStart === selEnd) return text.slice(0, selStart) + '|' + text.slice(selStart);
  return text.slice(0, selStart) + '|' + text.slice(selStart, selEnd) + '|' + text.slice(selEnd);
}

describe('counting', () => {
  test('countWords', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n ')).toBe(0);
    expect(countWords(undefined)).toBe(0);
    expect(countWords('Kissa istui  ikkunalla.\nSatoi.')).toBe(4);
  });

  test('countCharacters ignores line breaks', () => {
    expect(countCharacters('ab c\nd')).toEqual({ withSpaces: 5, withoutSpaces: 4 });
    expect(countCharacters('')).toEqual({ withSpaces: 0, withoutSpaces: 0 });
  });

  test('countProjectWords includes nested chapters', () => {
    expect(countProjectWords([
      { content: 'yksi kaksi', children: [{ content: 'kolme' }] },
      { content: '' },
      null,
      { content: 'neljä viisi kuusi' }
    ])).toBe(6);
    expect(countProjectWords(undefined)).toBe(0);
  });

  test('estimatePages', () => {
    expect(estimatePages(0)).toBe(0);
    expect(estimatePages(1)).toBe(1);
    expect(estimatePages(250)).toBe(1);
    expect(estimatePages(251)).toBe(2);
  });
});

describe('toggleInline', () => {
  test('wraps a selection and keeps it selected', () => {
    expect(show(toggleInline(...sel('Kissa |istui| tässä'), '**'))).toBe('Kissa **|istui|** tässä');
  });

  test('removes markers that surround the selection', () => {
    expect(show(toggleInline(...sel('Kissa **|istui|** tässä'), '**'))).toBe('Kissa |istui| tässä');
  });

  test('removes markers that are inside the selection', () => {
    expect(show(toggleInline(...sel('Kissa |**istui**| tässä'), '**'))).toBe('Kissa |istui| tässä');
  });

  test('a bare cursor formats the word under it, ä and ö included', () => {
    expect(show(toggleInline(...sel('Pöy|tä on täällä'), '_'))).toBe('_|Pöytä|_ on täällä');
    expect(show(toggleInline(...sel('_Pöy|tä_ on'), '_'))).toBe('|Pöytä| on');
  });

  test('a cursor with no word inserts an empty pair and removes it again', () => {
    expect(show(toggleInline(...sel('a | b'), '**'))).toBe('a **|** b');
    expect(show(toggleInline(...sel('a **|** b'), '**'))).toBe('a | b');
  });

  test('keeps spaces outside the markers', () => {
    expect(show(toggleInline(...sel('a| sana |b'), '**'))).toBe('a **|sana|** b');
  });

  test('supports different opening and closing markers', () => {
    expect(show(toggleInline(...sel('|sana|'), '<u>', '</u>'))).toBe('<u>|sana|</u>');
    expect(show(toggleInline(...sel('<u>|sana|</u>'), '<u>', '</u>'))).toBe('|sana|');
  });

  test('a selection of only spaces changes nothing', () => {
    expect(toggleInline(...sel('a|   |b'), '**')).toBeNull();
  });
});

describe('setHeading', () => {
  test('adds, changes and removes a heading on the current line', () => {
    expect(show(setHeading(...sel('eka\nto|ka\nkolmas'), 1))).toBe('eka\n# toka|\nkolmas');
    expect(show(setHeading(...sel('# to|ka'), 2))).toBe('## toka|');
    expect(show(setHeading(...sel('## to|ka'), 2))).toBe('toka|');
    expect(show(setHeading(...sel('### to|ka'), 0))).toBe('toka|');
  });

  test('never stacks markers', () => {
    const once = setHeading('toka', 0, 0, 1);
    const twice = setHeading(once.text, once.selStart, once.selEnd, 1);
    expect(twice.text).toBe('toka');
  });

  test('replaces a list or quote marker instead of keeping it', () => {
    expect(show(setHeading(...sel('- koh|ta'), 2))).toBe('## kohta|');
  });

  test('body text on a plain line changes nothing', () => {
    expect(setHeading('toka', 1, 1, 0)).toBeNull();
  });
});

describe('toggleLinePrefix', () => {
  test('quote on and off', () => {
    expect(show(toggleLinePrefix(...sel('rivi| yksi'), 'quote'))).toBe('> rivi yksi|');
    expect(show(toggleLinePrefix(...sel('> rivi| yksi'), 'quote'))).toBe('rivi yksi|');
  });

  test('bulleted list over several lines, skipping empty ones', () => {
    expect(show(toggleLinePrefix(...sel('|yksi\n\nkaksi|\nkolme'), 'bullet'))).toBe('|- yksi\n\n- kaksi|\nkolme');
    expect(show(toggleLinePrefix(...sel('|- yksi\n- kaksi|'), 'bullet'))).toBe('|yksi\nkaksi|');
  });

  test('numbered list numbers the lines and converts from bullets', () => {
    expect(show(toggleLinePrefix(...sel('|- a\n- b\n- c|'), 'numbered'))).toBe('|1. a\n2. b\n3. c|');
    expect(show(toggleLinePrefix(...sel('|1. a\n2. b|'), 'numbered'))).toBe('|a\nb|');
  });

  test('a selection ending at a line start leaves the next line alone', () => {
    expect(show(toggleLinePrefix(...sel('|yksi\n|kaksi'), 'bullet'))).toBe('- yksi|\nkaksi');
  });

  test('a scene break is not mistaken for a list item', () => {
    expect(show(toggleLinePrefix(...sel('* *| *'), 'bullet'))).toBe('- * * *|');
  });
});

describe('continueList', () => {
  test('continues bullets, numbers and quotes', () => {
    expect(show(continueList(...sel('- yksi|').slice(0, 2)))).toBe('- yksi\n- |');
    expect(show(continueList(...sel('9. yhdeksän|').slice(0, 2)))).toBe('9. yhdeksän\n10. |');
    expect(show(continueList(...sel('> lainaus|').slice(0, 2)))).toBe('> lainaus\n> |');
  });

  test('splits an item at the cursor', () => {
    expect(show(continueList(...sel('- yksi| kaksi').slice(0, 2)))).toBe('- yksi\n- | kaksi');
  });

  test('ends the list on an empty item', () => {
    expect(show(continueList(...sel('- yksi\n- |').slice(0, 2)))).toBe('- yksi\n|');
  });

  test('does nothing on ordinary lines, scene breaks or inside the marker', () => {
    expect(continueList('tavallinen rivi', 5)).toBeNull();
    expect(continueList('* * *', 5)).toBeNull();
    expect(continueList('- yksi', 1)).toBeNull();
  });
});

describe('plain edits', () => {
  test('insertText replaces the selection', () => {
    expect(show(insertText(...sel('a|bc|d'), 'XY'))).toBe('aXY|d');
    expect(insertText('abc', 1, 1, '')).toBeNull();
  });

  test('transformSelection keeps the result selected', () => {
    expect(show(transformSelection(...sel('a|bc|d'), s => s.toUpperCase()))).toBe('a|BC|d');
    expect(transformSelection('abc', 1, 1, s => s.toUpperCase())).toBeNull();
    expect(transformSelection('aBCd', 1, 3, s => s.toUpperCase())).toBeNull();
  });

  test('trimSpaces and collapseEmptyLines', () => {
    expect(trimSpaces('a   b \nc\t\td  ')).toBe('a b\nc d');
    expect(collapseEmptyLines('a\n\n\n\nb\n\nc\n \n\t\nd')).toBe('a\n\nb\n\nc\n\nd');
  });
});

describe('search', () => {
  const text = 'Äiti näki äidin. Äitinsä ei. äiti?';

  test('is case-insensitive by default', () => {
    expect(findMatches(text, 'äiti').map(m => m.start)).toEqual([0, 17, 29]);
  });

  test('respects case when asked', () => {
    expect(findMatches(text, 'äiti', { caseSensitive: true }).map(m => m.start)).toEqual([29]);
  });

  test('whole word works with Finnish letters', () => {
    expect(findMatches(text, 'äiti', { wholeWord: true }).map(m => m.start)).toEqual([0, 29]);
    expect(findMatches('pää päässä', 'pää', { wholeWord: true })).toEqual([{ start: 0, end: 3, text: 'pää' }]);
  });

  test('treats the term literally unless regex is on', () => {
    expect(findMatches('a.b axb', 'a.b')).toHaveLength(1);
    expect(findMatches('a.b axb', 'a.b', { regex: true })).toHaveLength(2);
  });

  test('an invalid or empty expression finds nothing instead of throwing', () => {
    expect(buildSearchPattern('(', { regex: true })).toBeNull();
    expect(findMatches(text, '(', { regex: true })).toEqual([]);
    expect(findMatches(text, '')).toEqual([]);
    expect(findMatches('abc', 'x*', { regex: true })).toEqual([]);
  });

  test('replaceAllMatches replaces every match and reports the count', () => {
    expect(replaceAllMatches('kissa ja Kissa', 'kissa', 'koira')).toEqual({ text: 'koira ja koira', count: 2 });
    expect(replaceAllMatches('kissa', 'koira', 'x')).toEqual({ text: 'kissa', count: 0 });
    // The replacement is literal: $1 is not a back-reference
    expect(replaceAllMatches('a b', 'a', '$1')).toEqual({ text: '$1 b', count: 1 });
  });

  // Stage I-06 (contracts.md 11.2 F): smart typing writes ” ’ –, the author types " ' -
  test('a typed straight quote also finds ”', () => {
    const typed = 'Hän sanoi ”Hei” ja lähti. Toinen sanoi "Hei" ja jäi.';
    expect(findMatches(typed, '"Hei"').map(m => m.text)).toEqual(['”Hei”', '"Hei"']);
    // The opening marks of other languages are found too; the straight mark still finds itself
    expect(findMatches('“Hei” ja „Hei”', '"Hei"')).toHaveLength(2);
    expect(findMatches('Hän sanoi ”Hei”', '"', { wholeWord: false }).map(m => m.start)).toEqual([10, 14]);
    // Whole word and case still apply to the rest of the term
    expect(findMatches('”hei” ja ”Hei”', '"Hei"', { caseSensitive: true }).map(m => m.start)).toEqual([9]);
    expect(replaceAllMatches('Hän sanoi ”Hei”.', '"Hei"', '”Moi”')).toEqual({ text: 'Hän sanoi ”Moi”.', count: 1 });
  });

  test('a typed apostrophe also finds ’', () => {
    expect(findMatches('vaa’an ja vaa\'an', 'vaa\'an').map(m => m.text)).toEqual(['vaa’an', 'vaa\'an']);
    expect(findMatches('‘lainaus’', '\'lainaus\'').map(m => m.text)).toEqual(['‘lainaus’']);
    // Whole word: the apostrophe inside a word does not end it
    expect(findMatches('Jussi’n ja Jussi', 'Jussi\'n', { wholeWord: true }).map(m => m.start)).toEqual([0]);
  });

  test('a typed hyphen also finds –', () => {
    expect(findMatches('vuosina 1939–1945 ja 1939-1945', '1939-1945').map(m => m.start)).toEqual([8, 21]);
    expect(findMatches('Hän tuli – ja lähti.', 'tuli - ja')).toHaveLength(1);
    // The long dash is another mark and is not matched by a hyphen
    expect(findMatches('tuli — ja', 'tuli - ja')).toEqual([]);
    // Nothing else changes: a term without these marks finds what it found before
    expect(findMatches('a.b axb', 'a.b')).toHaveLength(1);
  });

  test('a regex search is not changed', () => {
    // In a regular expression the three marks keep their own meaning
    expect(findMatches('”Hei”', '"Hei"', { regex: true })).toEqual([]);
    expect(findMatches('vaa’an', 'vaa\'an', { regex: true })).toEqual([]);
    expect(findMatches('1939–1945', '1939-1945', { regex: true })).toEqual([]);
    expect(findMatches('b-c', '[a-c]-c', { regex: true }).map(m => m.text)).toEqual(['b-c']);
    expect(buildSearchPattern('[a-c]', { regex: true }).source).toBe('[a-c]');
    // termMatch builds its expressions through the regex path
    expect(buildSearchPattern('Marja-Liisa', { regex: true, caseSensitive: true }).source).toBe('Marja-Liisa');
  });
});

describe('wordAt', () => {
  test('finds the word around a position', () => {
    expect(wordAt('yksi kaksi', 6)).toEqual([5, 10]);
    expect(wordAt('yksi  kaksi', 5)).toEqual([5, 5]);
  });

  test('a decomposed ä (a + combining dots) does not end the word', () => {
    // 'pää' written as p, a, U+0308, a, U+0308: five code units
    const decomposed = 'pa\u0308a\u0308 on';
    expect(decomposed.normalize('NFC')).toBe('pää on');
    expect(wordAt(decomposed, 1)).toEqual([0, 5]);
    expect(wordAt(decomposed, 4)).toEqual([0, 5]);
  });
});

describe('WORD_CHAR', () => {
  test('is exported: letters, digits, combining marks and apostrophes are word characters', () => {
    for (const ch of ['a', 'ä', 'Å', '7', '\u0308', "'", '’']) expect(WORD_CHAR.test(ch)).toBe(true);
    for (const ch of [' ', '-', '–', '”', '.', '_', '\n']) expect(WORD_CHAR.test(ch)).toBe(false);
  });
});

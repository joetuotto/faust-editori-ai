/**
 * @jest-environment node
 */
const {
  formatCount,
  fiDate,
  fiDateTime,
  modelLabel,
  plural,
  pendingSuggestions,
  pendingWords,
  exportScopeHint,
  AI_OFF_SENTENCE
} = require('../../src/services/format.fi');

const NBSP = '\u00a0';

describe('formatCount', () => {
  test('formatCount groups thousands with a no-break space', () => {
    expect(formatCount(84512)).toBe(`84${NBSP}512`);
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe(`1${NBSP}000`);
    expect(formatCount(1234567)).toBe(`1${NBSP}234${NBSP}567`);
    expect(formatCount(0)).toBe('0');
    expect(formatCount(7)).toBe('7');

    // The separator is U+00A0, not an ordinary space: the number must not wrap
    expect(formatCount(84512)).not.toBe('84 512');
    expect(formatCount(84512).charCodeAt(2)).toBe(0x00a0);
  });

  test('formatCount gives a whole number', () => {
    expect(formatCount(1499.6)).toBe(`1${NBSP}500`);
    expect(formatCount(12.2)).toBe('12');
  });

  test('formatCount gives 0 for negative and missing numbers', () => {
    expect(formatCount(-1)).toBe('0');
    expect(formatCount(-84512)).toBe('0');
    expect(formatCount(Number.NaN)).toBe('0');
    expect(formatCount(undefined)).toBe('0');
    expect(formatCount(null)).toBe('0');
    expect(formatCount()).toBe('0');
    expect(formatCount(Number.POSITIVE_INFINITY)).toBe('0');
    expect(formatCount('84512')).toBe('0');
  });
});

describe('fiDate and fiDateTime', () => {
  test('fiDate and fiDateTime give 16.11.2026 and 16.11.2026 klo 9.05', () => {
    // Built from local parts, so the test reads the same in every time zone
    const morning = new Date(2026, 10, 16, 9, 5, 42);
    expect(fiDate(morning)).toBe('16.11.2026');
    expect(fiDateTime(morning)).toBe('16.11.2026 klo 9.05');
  });

  test('no leading zeros in the day, the month or the hour; two digits in the minutes', () => {
    const early = new Date(2026, 0, 3, 0, 0);
    expect(fiDate(early)).toBe('3.1.2026');
    expect(fiDateTime(early)).toBe('3.1.2026 klo 0.00');
    expect(fiDateTime(new Date(2026, 11, 31, 19, 2))).toBe('31.12.2026 klo 19.02');
    expect(fiDateTime(new Date(2027, 5, 9, 23, 59))).toBe('9.6.2027 klo 23.59');
  });

  test('fiDate accepts an ISO string', () => {
    const iso = new Date(2026, 10, 16, 9, 5).toISOString();
    expect(iso).toMatch(/^2026-11-1[56]T\d\d:\d\d:00\.000Z$/);
    expect(fiDate(iso)).toBe('16.11.2026');
    expect(fiDateTime(iso)).toBe('16.11.2026 klo 9.05');
    // An ISO string without a zone is local time
    expect(fiDateTime('2026-11-16T19:02:11')).toBe('16.11.2026 klo 19.02');
  });

  test('something that is not a time gives an empty string', () => {
    for (const value of [undefined, null, '', 'eilen', new Date('ei päivä')]) {
      expect(fiDate(value)).toBe('');
      expect(fiDateTime(value)).toBe('');
    }
  });
});

describe('modelLabel', () => {
  test('modelLabel drops the provider id before the colon and leaves a plain id alone', () => {
    expect(modelLabel('c91fb219-b725-43d2-925d-3c6e66bef527:glm-5.3-flash')).toBe('glm-5.3-flash');
    expect(modelLabel('claude-sonnet-4-5')).toBe('claude-sonnet-4-5');
    // Only the first colon separates the provider
    expect(modelLabel('c91f:deepseek:v4.1')).toBe('deepseek:v4.1');
    expect(modelLabel('')).toBe('');
  });

  test('modelLabel gives an empty string for a missing id and keeps an id that ends in a colon', () => {
    expect(modelLabel(undefined)).toBe('');
    expect(modelLabel(null)).toBe('');
    expect(modelLabel(12)).toBe('');
    expect(modelLabel('c91f:')).toBe('c91f:');
  });
});

describe('plural', () => {
  test('plural picks the singular only for 1', () => {
    expect(plural(1, 'ehdotus', 'ehdotusta')).toBe('ehdotus');
    expect(plural(0, 'ehdotus', 'ehdotusta')).toBe('ehdotusta');
    expect(plural(2, 'ehdotus', 'ehdotusta')).toBe('ehdotusta');
    expect(plural(21, 'luku', 'lukua')).toBe('lukua');
    expect(plural(undefined, 'luku', 'lukua')).toBe('lukua');
    expect(plural('1', 'luku', 'lukua')).toBe('lukua');
  });
});

describe('fixed wordings', () => {
  test('pendingSuggestions says 1 käsittelemätön ehdotus and 12 käsittelemätöntä ehdotusta', () => {
    expect(pendingSuggestions(1)).toBe('1 käsittelemätön ehdotus');
    expect(pendingSuggestions(12)).toBe('12 käsittelemätöntä ehdotusta');
    expect(pendingSuggestions(0)).toBe('0 käsittelemätöntä ehdotusta');
    expect(pendingSuggestions(2)).toBe('2 käsittelemätöntä ehdotusta');
    // The count goes through formatCount
    expect(pendingSuggestions(1200)).toBe(`1${NBSP}200 käsittelemätöntä ehdotusta`);
    expect(pendingSuggestions(undefined)).toBe('0 käsittelemätöntä ehdotusta');
  });

  // Moved here from the suggestion controller in the final-pass review, so the import's Korvaa guard says the same
  test('pendingWords names the suggestions by their count and a draft by its own name, apart (contracts 8.1)', () => {
    expect(pendingWords({ suggestions: 9, blocks: 1 })).toBe('9 käsittelemätöntä ehdotusta ja tekoälyn luonnos');
    expect(pendingWords({ suggestions: 1, blocks: 0 })).toBe('1 käsittelemätön ehdotus');
    expect(pendingWords({ suggestions: 0, blocks: 1 })).toBe('käsittelemätön tekoälyn luonnos');
    expect(pendingWords({ suggestions: 0, blocks: 2 })).toBe('2 käsittelemätöntä tekoälyn luonnosta');
    expect(pendingWords({ suggestions: 4, blocks: 2 })).toBe('4 käsittelemätöntä ehdotusta ja 2 tekoälyn luonnosta');
    expect(pendingWords({ suggestions: 1200 })).toBe(`1${NBSP}200 käsittelemätöntä ehdotusta`);
  });

  // Vie käsikirjoitus, the hint beside Koko käsikirjoitus
  test('exportScopeHint counts the chapters and says how many stay out for having no text', () => {
    expect(exportScopeHint(4, 0)).toBe('4 lukua');
    expect(exportScopeHint(1, 0)).toBe('1 luku');
    expect(exportScopeHint(3, 1)).toBe('4 lukua, joista 1 tyhjä jätetään pois');
    expect(exportScopeHint(8, 3)).toBe('11 lukua, joista 3 tyhjää jätetään pois');
    expect(exportScopeHint(1, 1)).toBe('2 lukua, joista 1 tyhjä jätetään pois');
    expect(exportScopeHint(1200, 1300)).toBe(`2${NBSP}500 lukua, joista 1${NBSP}300 tyhjää jätetään pois`);
  });

  test('exportScopeHint does not count the same chapters twice when nothing is written yet', () => {
    // Was: 1 luku, joista 1 tyhjä jätetään pois
    expect(exportScopeHint(0, 1)).toBe('1 luku, jossa ei ole vielä tekstiä');
    expect(exportScopeHint(0, 3)).toBe('3 lukua, joissa ei ole vielä tekstiä');
    expect(exportScopeHint(0, 0)).toBe('0 lukua');
    expect(exportScopeHint(undefined, undefined)).toBe('0 lukua');
  });

  test('AI_OFF_SENTENCE is Tekoäly pois -asetus on päällä.', () => {
    expect(AI_OFF_SENTENCE).toBe('Tekoäly pois -asetus on päällä.');
  });
});

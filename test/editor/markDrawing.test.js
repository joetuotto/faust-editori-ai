/**
 * @jest-environment node
 */
// How a mark is drawn in the manuscript (F4).
//
// Three defects had one root each: a deletion's strike and a finding's underline were drawn over the whole
// range, the space at its end included; a line ran on under the space at a soft wrap, because the editor
// wraps with break-spaces and that space is a box of the upper line; an insertion suggestion is a widget,
// which the highlighter never sets, so inside *emphasis*, **strong** or a heading it stood in the plain
// face. The rules are in src/editor/markDrawing.js. The Markdown parser is loaded here, in the test only.
const { parser, Strikethrough } = require('@lezer/markdown');
const { trimmedRange, softWrapGaps, faceAt } = require('../../src/editor/markDrawing');

describe('trimmedRange: a line starts at the first and ends at the last character that is not white space', () => {
  const drawn = (text, from = 100) => {
    const range = trimmedRange(text, from);
    return text.slice(range.from - from, range.to - from);
  };

  test('a deleted word keeps its strike, the space after it does not', () => {
    expect(trimmedRange('hyvin ', 350)).toEqual({ from: 350, to: 355 });
    expect(drawn('hyvin ')).toBe('hyvin');
  });

  test('the space before a word is cut the same way, and both ends at once', () => {
    expect(trimmedRange(' aina', 532)).toEqual({ from: 533, to: 537 });
    expect(drawn('  ja sitten \t')).toBe('ja sitten');
  });

  test('white space inside the range stays under the line', () => {
    expect(trimmedRange('hyvin väsynyt', 10)).toEqual({ from: 10, to: 23 });
    expect(drawn(' Hän oli   hyvin väsynyt. ')).toBe('Hän oli   hyvin väsynyt.');
  });

  test('a paragraph break and a no-break space at an end are white space too', () => {
    expect(drawn('loppu.\n\n')).toBe('loppu.');
    expect(drawn('\nAlku')).toBe('Alku');
    expect(drawn('5 ')).toBe('5');
    expect(drawn(' sana ')).toBe('sana');
  });

  test('a range of white space only keeps its whole length, so it stays visible', () => {
    expect(trimmedRange(' ', 7)).toEqual({ from: 7, to: 8 });
    expect(trimmedRange('  \n ', 7)).toEqual({ from: 7, to: 11 });
    expect(trimmedRange('', 7)).toEqual({ from: 7, to: 7 });
  });

  test('a range without white space at its ends is returned as it is', () => {
    expect(trimmedRange('”Älä mene.”', 11)).toEqual({ from: 11, to: 22 });
    expect(trimmedRange('–', 0)).toEqual({ from: 0, to: 1 });
  });

  test('anything that is no string is an empty range at its place', () => {
    expect(trimmedRange(undefined, 4)).toEqual({ from: 4, to: 4 });
    expect(trimmedRange(null, 4)).toEqual({ from: 4, to: 4 });
  });
});

describe('softWrapGaps: no line under the space at a soft wrap', () => {
  // A layout: the visual lines of a text as the editor wraps them (break-spaces: the space at a wrap is
  // the last box of the upper line). `tops` gives a line another pitch or a few pixels of offset.
  const PITCH = 32;
  const BOX = 25;
  function layout(lines, { pitch = PITCH, box = BOX, from = 0, jitter = null } = {}) {
    const lineOf = [];
    lines.forEach((line, index) => { for (let i = 0; i < line.length; i++) lineOf.push(index); });
    const calls = [];
    const rectAt = (pos) => {
      calls.push(pos);
      const index = pos - from;
      if (index < 0 || index >= lineOf.length) return null;
      const shift = jitter ? jitter(index) : 0;
      const top = lineOf[index] * pitch + shift;
      return { top, bottom: top + box };
    };
    return { text: lines.join(''), rectAt, calls };
  }
  const gapsOf = (lines, options = {}) => {
    const { text, rectAt } = layout(lines, options);
    const from = options.from || 0;
    return softWrapGaps(text, from, rectAt).map(gap => [gap.from - from, gap.to - from, text.slice(gap.from - from, gap.to - from)]);
  };

  test('a finding over three visual lines has a gap at each turn, on the space that ends the upper line', () => {
    const lines = ['Hän oli hyvin väsynyt ja käveli hotellille, jonka ikkunat olivat samat ', 'kuin ennen: korkeat, kapeat ja pimeät, eikä kukaan ollut luvannut ', 'hänelle, että ovi olisi auki.'];
    expect(gapsOf(lines)).toEqual([[70, 71, ' '], [136, 137, ' ']]);
  });

  test('the gaps are document offsets: the range\'s own start is added', () => {
    const { text, rectAt } = layout(['Aino ', 'Lehto'], { from: 342 });
    expect(softWrapGaps(text, 342, rectAt)).toEqual([{ from: 346, to: 347 }]);
  });

  test('a range on one visual line has no gap, and is settled by looking at its two ends only', () => {
    const { text, rectAt, calls } = layout(['Hän oli hyvin väsynyt ja käveli hotellille.']);
    expect(softWrapGaps(text, 0, rectAt)).toEqual([]);
    expect(calls).toEqual([0, text.length - 1]);
  });

  test('a long range costs a few looks per turn, not one per character', () => {
    const lines = Array.from({ length: 8 }, (_, i) => 'sana '.repeat(15) + (i === 7 ? 'loppu.' : ''));
    const { text, rectAt, calls } = layout(lines);
    expect(softWrapGaps(text, 0, rectAt)).toHaveLength(7);
    expect(new Set(calls).size).toBeLessThan(text.length / 4);
  });

  test('several spaces at a turn are one gap, and spaces that start the lower line belong to it', () => {
    expect(gapsOf(['Juna pysähtyi.  ', 'Laiturilla ei ollut ketään.'])).toEqual([[14, 16, '  ']]);
    expect(gapsOf(['Juna pysähtyi. ', ' Laiturilla ei ollut ketään.'])).toEqual([[14, 16, '  ']]);
  });

  test('a line that turns inside a word or after a hyphen has nothing to leave out', () => {
    expect(gapsOf(['kaksikymmentä-', 'vuotias mies'])).toEqual([]);
    expect(gapsOf(['epäjärjestelmällistyttämättö', 'myydellänsäkään ja'])).toEqual([]);
  });

  test('a paragraph break inside the range is no soft wrap: the space before it is left as it is', () => {
    expect(gapsOf(['Eka kappale. \n', 'Toka kappale.'])).toEqual([]);
    expect(gapsOf(['Eka kappale.\n', '\n', 'Toka kappale jatkuu ', 'toisella rivillä.'])).toEqual([[33, 34, ' ']]);
  });

  test('a range of white space only, a single character and a range without a space have no gap', () => {
    expect(gapsOf([' ', ' '])).toEqual([]);
    expect(gapsOf(['a'])).toEqual([]);
    expect(gapsOf(['epäjärjestel', 'mällisyys'])).toEqual([]);
  });

  test('boxes of one line that differ by a few pixels are one line (an italic word, a smaller chip)', () => {
    const lines = ['Hän *käveli* hitaasti [TODO: x] kotiin ', 'lumisateessa.'];
    expect(gapsOf(lines, { jitter: (index) => (index % 7 === 0 ? 4 : index % 5 === 0 ? -3 : 0) })).toEqual([[38, 39, ' ']]);
  });

  test('tight lines whose boxes overlap are still two lines (a heading: 35px apart, boxes of 39px)', () => {
    expect(gapsOf(['Saapuminen yöllä ja ', 'aamulla'], { pitch: 35, box: 39 })).toEqual([[19, 20, ' ']]);
  });

  test('a character that is not drawn gives no gap instead of a guess', () => {
    const { text } = layout(['Aino ', 'Lehto']);
    expect(softWrapGaps(text, 0, () => null)).toEqual([]);
    expect(softWrapGaps(text, 0, (pos) => (pos < 5 ? { top: 0, bottom: 25 } : null))).toEqual([]);
    expect(softWrapGaps(text, 0, () => ({ top: NaN, bottom: NaN }))).toEqual([]);
  });
});

describe('faceAt: the face of the manuscript at a position', () => {
  // The parser as FaustEditor.js configures it
  const markdown = parser.configure([Strikethrough, { remove: ['IndentedCode', 'SetextHeading'] }]);
  const PLAIN = { heading: 0, quote: false, strong: false, emphasis: false };
  const faceIn = (text, needle, offset = 0) => {
    const at = text.indexOf(needle);
    if (at === -1) throw new Error('not in the text: ' + needle);
    return faceAt(markdown.parse(text), at + offset);
  };

  const TEXT = [
    '# Saapuminen yöllä',
    '',
    'Juna pysähtyi. *Hän käveli hitaasti kotiin.* Laiturilla ei ollut ketään.',
    '',
    '**Aino nosti laukkunsa** ja jäi seisomaan.',
    '',
    '> Kotiin palaaminen on *aina* saapumista.',
    '',
    '### Väliotsikko ja **vahva** sana'
  ].join('\n');

  test('inside *emphasis* the face is italic: in the middle, after the first marker and before the last', () => {
    expect(faceIn(TEXT, 'hitaasti', 8)).toEqual({ ...PLAIN, emphasis: true });
    expect(faceIn(TEXT, '*Hän', 1)).toEqual({ ...PLAIN, emphasis: true });
    expect(faceIn(TEXT, 'kotiin.*', 7)).toEqual({ ...PLAIN, emphasis: true });
  });

  test('outside the markers the face is plain: before the first and after the last', () => {
    expect(faceIn(TEXT, '*Hän')).toEqual(PLAIN);
    expect(faceIn(TEXT, 'kotiin.*', 8)).toEqual(PLAIN);
    expect(faceIn(TEXT, 'Laiturilla', 10)).toEqual(PLAIN);
  });

  test('inside **strong** the face is bold, and not between the two characters of a marker', () => {
    expect(faceIn(TEXT, 'laukkunsa', 9)).toEqual({ ...PLAIN, strong: true });
    expect(faceIn(TEXT, '**Aino', 2)).toEqual({ ...PLAIN, strong: true });
    expect(faceIn(TEXT, '**Aino', 1)).toEqual(PLAIN);
    expect(faceIn(TEXT, 'laukkunsa**', 10)).toEqual(PLAIN);
    expect(faceIn(TEXT, 'laukkunsa**', 11)).toEqual(PLAIN);
  });

  test('a heading holds to the end of its line, where an insertion after its last word stands', () => {
    expect(faceIn(TEXT, 'yöllä', 5)).toEqual({ ...PLAIN, heading: 1 });
    expect(faceIn(TEXT, 'Saapuminen yöllä', 10)).toEqual({ ...PLAIN, heading: 1 });
    expect(faceIn(TEXT, '# Saapuminen')).toEqual(PLAIN);
    expect(faceIn(TEXT, 'Juna')).toEqual(PLAIN);
  });

  test('a face inside a face gives both: strong in a heading, emphasis in a quotation', () => {
    expect(faceIn(TEXT, 'vahva', 5)).toEqual({ ...PLAIN, heading: 3, strong: true });
    expect(faceIn(TEXT, 'sana', 4)).toEqual({ ...PLAIN, heading: 3 });
    expect(faceIn(TEXT, 'aina', 4)).toEqual({ ...PLAIN, quote: true, emphasis: true });
    expect(faceIn(TEXT, 'saapumista.', 11)).toEqual({ ...PLAIN, quote: true });
  });

  test('emphasis that runs over a line break of its paragraph is still emphasis on the second line', () => {
    const text = 'Kappale *alkaa\njatkuu tässä* ja loppuu.';
    expect(faceAt(markdown.parse(text), text.indexOf('jatkuu') + 6)).toEqual({ ...PLAIN, emphasis: true });
    expect(faceAt(markdown.parse(text), text.indexOf('loppuu'))).toEqual(PLAIN);
  });

  test('an unclosed marker, a scene break and a list star are no emphasis', () => {
    expect(faceIn('Hän sanoi *ei ja lähti.', 'lähti')).toEqual(PLAIN);
    expect(faceIn('Eka.\n\n* * *\n\nToka.', 'Toka', 4)).toEqual(PLAIN);
    expect(faceIn('* kohta yksi\n* kohta kaksi', 'yksi', 4)).toEqual(PLAIN);
  });

  test('without a tree, or with a position that is no offset, the face is plain', () => {
    expect(faceAt(null, 3)).toEqual(PLAIN);
    expect(faceAt({}, 3)).toEqual(PLAIN);
    expect(faceAt(markdown.parse(TEXT), undefined)).toEqual(PLAIN);
  });
});

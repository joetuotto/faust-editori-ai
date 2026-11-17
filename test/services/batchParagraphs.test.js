/**
 * @jest-environment node
 */
const { batchParagraphs } = require('../../src/services/ai/batchParagraphs');

const lines = ['a'.repeat(10), 'b'.repeat(20), 'c'.repeat(30), 'd'.repeat(200), 'e'.repeat(5)];
const numbers = (batches) => batches.map(batch => batch.lines.map(line => line.n));

describe('batchParagraphs', () => {
  test('packs lines in order until the next one would not fit', () => {
    // every line costs its length + 8
    expect(batchParagraphs(lines, 60).map(b => [b.index, b.lines.map(l => l.n), b.size, b.oversize])).toEqual([
      [0, [1, 2], 46, false],
      [1, [3], 38, false],
      [2, [4], 208, true],
      [3, [5], 13, false]
    ]);
  });

  test('a line that is over the budget by itself gets its own batch, marked oversize, and is never split', () => {
    const batches = batchParagraphs(lines, 60);
    expect(batches[2].oversize).toBe(true);
    expect(batches[2].lines[0].text).toHaveLength(200);
    expect(batches[2].lines).toHaveLength(1);
  });

  test('maxLines caps the number of lines in a batch', () => {
    expect(numbers(batchParagraphs(lines, { max: 1000, maxLines: 2 }))).toEqual([[1, 2], [3, 4], [5]]);
    expect(numbers(batchParagraphs(Array.from({ length: 45 }, () => 'x'), 100000)).map(b => b.length)).toEqual([40, 5]);
  });

  test('measure and lineOverhead change the unit, for example to estimated tokens', () => {
    const batches = batchParagraphs(lines, { max: 100, lineOverhead: 0, measure: text => Math.ceil(text.length / 3) });
    expect(batches.map(b => [b.lines.length, b.size])).toEqual([[5, 90]]);
  });

  test('maxChars is another name for max, and measure also gets the line itself', () => {
    expect(numbers(batchParagraphs(lines, { maxChars: 60 }))).toEqual([[1, 2], [3], [4], [5]]);
    const sized = [{ n: 1, text: 'a', cost: 50 }, { n: 2, text: 'b', cost: 50 }, { n: 3, text: 'c', cost: 10 }];
    expect(numbers(batchParagraphs(sized, { max: 60, lineOverhead: 0, measure: (_text, line) => line.cost }))).toEqual([[1], [2, 3]]);
  });

  test('objects pass through untouched; strings get their position as n', () => {
    const line = { n: 7, text: 'kissa', from: 3, to: 8 };
    const batches = batchParagraphs([line], 100);
    expect(batches).toEqual([{ index: 0, lines: [line], size: 13, oversize: false }]);
    expect(batches[0].lines[0]).toBe(line);
    expect(batchParagraphs(['a', 'b'], 100)[0].lines).toEqual([{ n: 1, text: 'a' }, { n: 2, text: 'b' }]);
  });

  test('no lines give no batches', () => {
    expect(batchParagraphs([], 10)).toEqual([]);
    expect(batchParagraphs(undefined, 10)).toEqual([]);
  });

  test('a budget that is not a positive number throws', () => {
    expect(() => batchParagraphs(lines, 0)).toThrow(RangeError);
    expect(() => batchParagraphs(lines, { max: NaN })).toThrow(RangeError);
    expect(() => batchParagraphs(lines)).toThrow(RangeError);
  });

  // Cases beyond the named list

  test('the limit is "more than max": a batch that costs exactly max is full, and a line that costs exactly max is not oversize', () => {
    // 12 + 8 and 22 + 8 make 50
    expect(batchParagraphs(['a'.repeat(12), 'b'.repeat(22), 'c'], 50).map(b => [b.lines.length, b.size, b.oversize])).toEqual([
      [2, 50, false], [1, 9, false]
    ]);
    expect(batchParagraphs(['a'.repeat(42)], 50)).toMatchObject([{ size: 50, oversize: false }]);
    expect(batchParagraphs(['a'.repeat(43)], 50)).toMatchObject([{ size: 51, oversize: true }]);
  });

  test('an oversize line in the middle closes the batch before it; the order and the indexes stay', () => {
    const batches = batchParagraphs(['eka', 'x'.repeat(100), 'toka', 'kolmas'], 40);
    expect(batches.map(b => [b.index, b.lines.map(l => l.n), b.oversize])).toEqual([
      [0, [1], false], [1, [2], true], [2, [3, 4], false]
    ]);
    expect(batches.flatMap(b => b.lines.map(l => l.text))).toEqual(['eka', 'x'.repeat(100), 'toka', 'kolmas']);
  });

  test('the defaults are 8 units of overhead per line and 40 lines; odd values fall back to them', () => {
    expect(batchParagraphs(['abc'], 100)[0].size).toBe(11);
    expect(batchParagraphs(['abc'], { max: 100, lineOverhead: -1 })[0].size).toBe(11);
    expect(batchParagraphs(['abc'], { max: 100, lineOverhead: NaN })[0].size).toBe(11);
    expect(batchParagraphs(['abc'], { max: 100, lineOverhead: 2.5 })[0].size).toBe(5.5);
    const many = Array.from({ length: 45 }, () => 'x');
    expect(batchParagraphs(many, { max: 100000, maxLines: 0 }).map(b => b.lines.length)).toEqual([40, 5]);
    expect(batchParagraphs(many, { max: 100000, maxLines: 20.9 }).map(b => b.lines.length)).toEqual([20, 20, 5]);
  });

  test('the default measure is the length in UTF-16 units: ä counts one, an emoji two', () => {
    expect(batchParagraphs(['äöå', '😀'], { max: 100, lineOverhead: 0 })[0].size).toBe(5);
  });

  test('a measure that returns nothing usable costs only the overhead; an empty or missing line is a line', () => {
    expect(batchParagraphs(['abc', 'def'], { max: 100, measure: () => NaN })[0].size).toBe(16);
    expect(batchParagraphs(['abc'], { max: 100, measure: () => -5 })[0].size).toBe(8);
    expect(batchParagraphs(['', null, { n: 9 }], 100)).toEqual([
      { index: 0, lines: [{ n: 1, text: '' }, { n: 2, text: '' }, { n: 9 }], size: 24, oversize: false }
    ]);
  });

  test('every shape of a bad budget throws the documented error, also when there are no lines', () => {
    const message = 'batchParagraphs: budget must be a positive number';
    for (const budget of [0, -10, NaN, Infinity, '100', null, {}, { max: 0 }, { max: '60' }, { maxChars: -1 }, { max: Infinity }]) {
      expect(() => batchParagraphs(lines, budget)).toThrow(new RangeError(message));
    }
    expect(() => batchParagraphs([], 0)).toThrow(RangeError);
    // max wins when both names are given
    expect(numbers(batchParagraphs(lines, { max: 1000, maxChars: 1 }))).toEqual([[1, 2, 3, 4, 5]]);
  });

  test('every line lands in exactly one batch, in order, and no batch is over its limits unless it is oversize', () => {
    let state = 99;
    const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
    for (let round = 0; round < 50; round++) {
      const input = Array.from({ length: Math.floor(random() * 60) }, (_unused, i) => ({ n: i + 1, text: 'x'.repeat(Math.floor(random() * 120)) }));
      const max = 20 + Math.floor(random() * 200);
      const maxLines = 1 + Math.floor(random() * 10);
      const batches = batchParagraphs(input, { max, maxLines });
      expect(batches.flatMap(b => b.lines)).toEqual(input);
      batches.forEach((batch, index) => {
        expect(batch.index).toBe(index);
        expect(batch.size).toBe(batch.lines.reduce((sum, line) => sum + line.text.length + 8, 0));
        if (batch.oversize) {
          expect(batch.lines).toHaveLength(1);
          expect(batch.size).toBeGreaterThan(max);
        } else {
          expect(batch.size).toBeLessThanOrEqual(max);
          expect(batch.lines.length).toBeLessThanOrEqual(maxLines);
          expect(batch.lines.length).toBeGreaterThan(0);
        }
      });
    }
  });
});

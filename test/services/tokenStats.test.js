/**
 * @jest-environment node
 */
const {
  DEFAULT_CHARS_PER_TOKEN,
  MIN_CALIBRATION_CHARS,
  MAX_PLAUSIBLE_CHARS_PER_TOKEN,
  MIN_PLAUSIBLE_CHARS_PER_TOKEN,
  estimateTokens,
  updateCalibration,
  looksTruncated
} = require('../../src/services/ai/tokenStats');

describe('constants', () => {
  test('start at 2.7 characters per token for the gateway and 3 for Claude', () => {
    expect(DEFAULT_CHARS_PER_TOKEN).toEqual({ cherry: 2.7, anthropic: 3 });
    expect(MIN_CALIBRATION_CHARS).toBe(1500);
    expect(MAX_PLAUSIBLE_CHARS_PER_TOKEN).toBe(6.5);
    expect(MIN_PLAUSIBLE_CHARS_PER_TOKEN).toBe(1.2);
  });
});

describe('estimateTokens', () => {
  test('estimateTokens rounds up and uses 3 characters per token by default', () => {
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(1)).toBe(1);
    expect(estimateTokens(3)).toBe(1);
    expect(estimateTokens(4)).toBe(2);
    expect(estimateTokens(3000)).toBe(1000);
    expect(estimateTokens(3001)).toBe(1001);
  });

  test('estimateTokens uses the ratio it is given', () => {
    expect(estimateTokens(2700, 2.7)).toBe(1000);
    expect(estimateTokens(2701, 2.7)).toBe(1001);
    expect(estimateTokens(100, 2.5)).toBe(40);
    // A ratio that is not a positive number falls back to 3
    expect(estimateTokens(300, 0)).toBe(100);
    expect(estimateTokens(300, undefined)).toBe(100);
    expect(estimateTokens(300, Number.NaN)).toBe(100);
  });

  test('estimateTokens gives 0 for a missing or negative length', () => {
    expect(estimateTokens(undefined)).toBe(0);
    expect(estimateTokens(-5)).toBe(0);
    expect(estimateTokens(Number.NaN)).toBe(0);
  });
});

describe('updateCalibration', () => {
  test('updateCalibration is a running mean capped at 50 samples', () => {
    // First sample: the ratio itself
    const first = updateCalibration(undefined, { promptChars: 2700, inputTokens: 1000 });
    expect(first).toEqual({ charsPerToken: 2.7, samples: 1 });

    // Second: the mean of the two, to two decimals
    const second = updateCalibration(first, { promptChars: 2900, inputTokens: 1000 });
    expect(second).toEqual({ charsPerToken: 2.8, samples: 2 });

    const third = updateCalibration(second, { promptChars: 3000, inputTokens: 1200 });
    expect(third).toEqual({ charsPerToken: 2.7, samples: 3 });

    // The 50th sample still counts with weight 1/50 ...
    const fifty = updateCalibration({ charsPerToken: 3, samples: 49 }, { promptChars: 4000, inputTokens: 1000 });
    expect(fifty).toEqual({ charsPerToken: 3.02, samples: 50 });

    // ... and so does every sample after it: the count stays at 50
    const more = updateCalibration({ charsPerToken: 3, samples: 50 }, { promptChars: 4000, inputTokens: 1000 });
    expect(more).toEqual({ charsPerToken: 3.02, samples: 50 });

    // The weight of a new sample never drops below 1/50: with 3.76 against a
    // mean of 3 that is 3.0152, where a weight of 1/51 would round to 3.01
    expect(updateCalibration({ charsPerToken: 3, samples: 50 }, { promptChars: 37600, inputTokens: 10000 }))
      .toEqual({ charsPerToken: 3.02, samples: 50 });
    // A stored count above the cap (a hand-edited file) is treated as the cap
    expect(updateCalibration({ charsPerToken: 3, samples: 80 }, { promptChars: 37600, inputTokens: 10000 }))
      .toEqual({ charsPerToken: 3.02, samples: 50 });

    // So a changed ratio is followed, down to where one step (1/50 of the
    // distance) rounds away: within 0.25 characters per token of the new ratio
    let state = { charsPerToken: 3, samples: 50 };
    for (let i = 0; i < 200; i += 1) state = updateCalibration(state, { promptChars: 5000, inputTokens: 2000 });
    expect(state.samples).toBe(50);
    expect(state.charsPerToken).toBeGreaterThanOrEqual(2.5);
    expect(state.charsPerToken).toBeLessThanOrEqual(2.75);
  });

  test('updateCalibration follows the first samples exactly', () => {
    // With few samples every step is large, so the mean is the true mean
    let state;
    const ratios = [2.61, 2.72, 2.8, 2.92, 2.64];
    for (const ratio of ratios) state = updateCalibration(state, { promptChars: Math.round(ratio * 10000), inputTokens: 10000 });
    const mean = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
    expect(state.samples).toBe(5);
    expect(Math.abs(state.charsPerToken - mean)).toBeLessThan(0.011);
  });

  test('updateCalibration does not change the previous value', () => {
    const prev = { charsPerToken: 2.7, samples: 4 };
    const next = updateCalibration(prev, { promptChars: 3000, inputTokens: 1000 });
    expect(prev).toEqual({ charsPerToken: 2.7, samples: 4 });
    expect(next).not.toBe(prev);
  });

  test('updateCalibration ignores prompts under 1500 characters, missing token counts and ratios outside 1.2–6.5', () => {
    const prev = { charsPerToken: 2.7, samples: 4 };

    // Too short: the fixed overhead of a request would dominate
    expect(updateCalibration(prev, { promptChars: 1499, inputTokens: 550 })).toBe(prev);
    expect(updateCalibration(undefined, { promptChars: 400, inputTokens: 150 })).toBeUndefined();
    expect(updateCalibration(prev, { promptChars: 1500, inputTokens: 550 })).not.toBe(prev);

    // No usable token count
    for (const inputTokens of [undefined, null, 0, -10, Number.NaN, '1000']) {
      expect(updateCalibration(prev, { promptChars: 3000, inputTokens })).toBe(prev);
    }
    expect(updateCalibration(prev, undefined)).toBe(prev);
    expect(updateCalibration(prev, {})).toBe(prev);

    // Implausible ratios: 1.19 and 6.51 are out, 1.2 and 6.5 are in
    expect(updateCalibration(prev, { promptChars: 11900, inputTokens: 10000 })).toBe(prev);
    expect(updateCalibration(prev, { promptChars: 65100, inputTokens: 10000 })).toBe(prev);
    expect(updateCalibration(undefined, { promptChars: 12000, inputTokens: 10000 })).toEqual({ charsPerToken: 1.2, samples: 1 });
    expect(updateCalibration(undefined, { promptChars: 65000, inputTokens: 10000 })).toEqual({ charsPerToken: 6.5, samples: 1 });
  });

  test('updateCalibration starts over from a stored value that is broken', () => {
    expect(updateCalibration({ charsPerToken: 'x', samples: 3 }, { promptChars: 3000, inputTokens: 1000 }))
      .toEqual({ charsPerToken: 3, samples: 1 });
    expect(updateCalibration(null, { promptChars: 3000, inputTokens: 1000 })).toEqual({ charsPerToken: 3, samples: 1 });
  });
});

describe('looksTruncated', () => {
  test('looksTruncated is true above 6.5 characters per token', () => {
    expect(looksTruncated({ promptChars: 65001, inputTokens: 10000 })).toBe(true);
    expect(looksTruncated({ promptChars: 60000, inputTokens: 8192 })).toBe(true);
    expect(looksTruncated({ promptChars: 65000, inputTokens: 10000 })).toBe(false);
  });

  test('looksTruncated is true when two prompts of clearly different length got the same input token count', () => {
    // A server that cuts everything to 8 192 tokens: the ratio alone (4.9) is not yet suspicious
    const history = [{ promptChars: 30000, inputTokens: 8192 }];
    expect(looksTruncated({ promptChars: 40000, inputTokens: 8192, history })).toBe(true);
    // Within one per cent counts as the same count
    expect(looksTruncated({ promptChars: 40000, inputTokens: 8150, history })).toBe(true);
    // The shorter of the two is flagged as well: one of them hit the ceiling
    expect(looksTruncated({ promptChars: 30000, inputTokens: 8192, history: [{ promptChars: 40000, inputTokens: 8192 }] })).toBe(true);
    // The second entry of the history is read too
    const two = [{ promptChars: 9000, inputTokens: 3300 }, { promptChars: 30000, inputTokens: 8192 }];
    expect(looksTruncated({ promptChars: 40000, inputTokens: 8192, history: two })).toBe(true);

    // The same prompt sent twice is not a ceiling
    expect(looksTruncated({ promptChars: 30000, inputTokens: 8192, history })).toBe(false);
    // Lengths within 15 % of each other are not "clearly different"
    expect(looksTruncated({ promptChars: 33000, inputTokens: 8192, history })).toBe(false);
    // A different token count is an ordinary pair of prompts
    expect(looksTruncated({ promptChars: 40000, inputTokens: 11000, history })).toBe(false);
  });

  test('looksTruncated is false without usage numbers and for a normal Finnish ratio (3.4)', () => {
    expect(looksTruncated({ promptChars: 34000, inputTokens: null })).toBe(false);
    expect(looksTruncated({ promptChars: 34000, inputTokens: undefined })).toBe(false);
    expect(looksTruncated({ promptChars: 34000, inputTokens: 0 })).toBe(false);
    expect(looksTruncated({ promptChars: 34000 })).toBe(false);
    expect(looksTruncated({})).toBe(false);
    expect(looksTruncated()).toBe(false);

    expect(looksTruncated({ promptChars: 34000, inputTokens: 10000 })).toBe(false);
    expect(looksTruncated({ promptChars: 34000, inputTokens: 10000, history: [] })).toBe(false);
    expect(looksTruncated({ promptChars: 34000, inputTokens: 10000, history: [{ promptChars: 27000, inputTokens: 8000 }, null] })).toBe(false);
    // The measured gateway ratio
    expect(looksTruncated({ promptChars: 27000, inputTokens: 10000 })).toBe(false);
  });
});

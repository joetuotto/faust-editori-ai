/**
 * Token arithmetic for prompts
 *
 * The app budgets a prompt in characters and the server counts it in tokens.
 * These pure functions hold the starting ratio, learn the real one from the
 * usage numbers of finished requests, and notice when the server counted far
 * fewer tokens than the prompt can hold (a gateway that cut the prompt
 * silently). Unit-tested in test/services/tokenStats.test.js.
 */

// Finnish measured 2.61–2.92 characters per token on the gateway models
const DEFAULT_CHARS_PER_TOKEN = { cherry: 2.7, anthropic: 3 };

// The fixed overhead of a request (32–70 tokens) would skew a shorter sample
const MIN_CALIBRATION_CHARS = 1500;

const MAX_PLAUSIBLE_CHARS_PER_TOKEN = 6.5;
const MIN_PLAUSIBLE_CHARS_PER_TOKEN = 1.2;

const MAX_SAMPLES = 50;

// looksTruncated: the same token count for prompts of clearly different length
const SAME_TOKENS_TOLERANCE = 0.01;
const DIFFERENT_LENGTH_RATIO = 0.15;

const isPositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Tokens a text of `chars` characters is expected to take; rounds up. */
function estimateTokens(chars, charsPerToken = 3) {
  if (!isPositive(chars)) return 0;
  const ratio = isPositive(charsPerToken) ? charsPerToken : 3;
  return Math.ceil(chars / ratio);
}

/**
 * Running mean of characters per token for one model, capped at 50 samples
 * so that an old tokenizer does not outweigh a new one for ever.
 * A sample that cannot be trusted returns `prev` unchanged.
 */
function updateCalibration(prev, sample) {
  const promptChars = sample ? sample.promptChars : undefined;
  const inputTokens = sample ? sample.inputTokens : undefined;

  if (!isPositive(promptChars) || promptChars < MIN_CALIBRATION_CHARS) return prev;
  if (!isPositive(inputTokens)) return prev;

  const ratio = promptChars / inputTokens;
  if (ratio < MIN_PLAUSIBLE_CHARS_PER_TOKEN || ratio > MAX_PLAUSIBLE_CHARS_PER_TOKEN) return prev;

  const known = prev && isPositive(prev.charsPerToken) && isPositive(prev.samples);
  const samples = known ? Math.floor(prev.samples) : 0;
  const n = Math.min(samples, MAX_SAMPLES - 1);
  const mean = known ? (prev.charsPerToken * n + ratio) / (n + 1) : ratio;

  return {
    charsPerToken: Math.round(mean * 100) / 100,
    samples: Math.min(samples + 1, MAX_SAMPLES)
  };
}

/**
 * True when the model probably did not see the whole prompt.
 * `history` holds the last prompts of the same model as { promptChars, inputTokens }.
 */
function looksTruncated({ promptChars, inputTokens, history } = {}) {
  if (!isPositive(inputTokens) || !isPositive(promptChars)) return false;

  // The server counted far fewer tokens than this many characters can be
  if (promptChars / inputTokens > MAX_PLAUSIBLE_CHARS_PER_TOKEN) return true;

  // A fixed ceiling: two prompts of clearly different length, one token count
  for (const earlier of Array.isArray(history) ? history : []) {
    if (!earlier || !isPositive(earlier.inputTokens) || !isPositive(earlier.promptChars)) continue;
    const sameTokens = Math.abs(earlier.inputTokens - inputTokens) <= SAME_TOKENS_TOLERANCE * inputTokens;
    const longer = Math.max(earlier.promptChars, promptChars);
    const differentLength = Math.abs(earlier.promptChars - promptChars) > DIFFERENT_LENGTH_RATIO * longer;
    if (sameTokens && differentLength) return true;
  }

  return false;
}

module.exports = {
  DEFAULT_CHARS_PER_TOKEN,
  MIN_CALIBRATION_CHARS,
  MAX_PLAUSIBLE_CHARS_PER_TOKEN,
  MIN_PLAUSIBLE_CHARS_PER_TOKEN,
  estimateTokens,
  updateCalibration,
  looksTruncated
};

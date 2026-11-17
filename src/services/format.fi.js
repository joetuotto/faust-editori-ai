/**
 * Finnish formatting helpers
 *
 * One owner for the small text rules that several features share: grouped
 * numbers, dates, the short name of a model and two fixed wordings. Pure
 * functions, no DOM, so everything here is unit-tested
 * (test/services/format.fi.test.js).
 */

const NO_BREAK_SPACE = '\u00a0';

// The one sentence for the state in which the "Tekoäly pois" switch is on.
// utils/aiRequest.js carries the same literal: the packaged main process cannot load src/.
const AI_OFF_SENTENCE = 'Tekoäly pois -asetus on päällä.';

/** Whole number with a no-break space between groups of three digits. */
function formatCount(n) {
  const value = typeof n === 'number' ? n : Number.NaN;
  if (!Number.isFinite(value) || value < 0) return '0';
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, NO_BREAK_SPACE);
}

// A Date or an ISO string; null when it is not a real point in time
function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 16.11.2026 (local time, no leading zeros). */
function fiDate(value) {
  const date = toDate(value);
  if (!date) return '';
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}

/** 16.11.2026 klo 9.05 (hour without a leading zero, minutes with two digits). */
function fiDateTime(value) {
  const date = toDate(value);
  if (!date) return '';
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${fiDate(date)} klo ${date.getHours()}.${minutes}`;
}

/**
 * Short name of a model: gateway ids look like "providerId:modelId" and only
 * the part after the first colon means something to the author.
 */
function modelLabel(id) {
  if (typeof id !== 'string' || id === '') return '';
  const colon = id.indexOf(':');
  if (colon === -1) return id;
  return id.slice(colon + 1) || id;
}

/** The singular only for exactly one. */
function plural(n, one, many) {
  return n === 1 ? one : many;
}

/** The one wording for suggestions nobody has decided yet. */
function pendingSuggestions(n) {
  if (n === 1) return '1 käsittelemätön ehdotus';
  return `${formatCount(n)} käsittelemätöntä ehdotusta`;
}

module.exports = { formatCount, fiDate, fiDateTime, modelLabel, plural, pendingSuggestions, AI_OFF_SENTENCE };

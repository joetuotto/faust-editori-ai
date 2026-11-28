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

/**
 * What is pending, suggestions by their count and a pending draft by the name of its head (Tekoälyn luonnos),
 * apart (contracts 8.1; lead decision "Counts" of the final pass): `9 käsittelemätöntä ehdotusta ja tekoälyn
 * luonnos`, `1 käsittelemätön ehdotus`, `käsittelemätön tekoälyn luonnos`. A chapter has at most one draft, so
 * more than one comes from several chapters. The suggestion controller's questions and the import's Korvaa
 * guard use it; electron.js carries the same words for the close question (the main process cannot load src/).
 */
function pendingWords({ suggestions = 0, blocks = 0 } = {}) {
  const drafts = Number(blocks) || 0;
  if (!suggestions) return drafts === 1 ? 'käsittelemätön tekoälyn luonnos' : `${formatCount(drafts)} käsittelemätöntä tekoälyn luonnosta`;
  if (!drafts) return pendingSuggestions(suggestions);
  return `${pendingSuggestions(suggestions)} ja ${drafts === 1 ? 'tekoälyn luonnos' : `${formatCount(drafts)} tekoälyn luonnosta`}`;
}

/**
 * The hint beside 'Koko käsikirjoitus' in the export dialog: how many chapters the project has and
 * how many of them stay out of the export for having no text.
 * `4 lukua, joista 1 tyhjä jätetään pois`, `11 lukua, joista 3 tyhjää jätetään pois`, and when nothing
 * is written yet `1 luku, jossa ei ole vielä tekstiä` or `3 lukua, joissa ei ole vielä tekstiä`
 * ('joista 1 tyhjä' of a single chapter would count the same chapter twice).
 * @param {number} written chapters with text
 * @param {number} skipped chapters without text
 */
function exportScopeHint(written, skipped) {
  const withText = Math.max(0, Number(written) || 0);
  const empty = Math.max(0, Number(skipped) || 0);
  const total = withText + empty;
  const chapters = `${formatCount(total)} ${plural(total, 'luku', 'lukua')}`;
  if (empty === 0) return chapters;
  if (withText === 0) return `${chapters}, ${plural(total, 'jossa', 'joissa')} ei ole vielä tekstiä`;
  return `${chapters}, joista ${formatCount(empty)} ${plural(empty, 'tyhjä', 'tyhjää')} jätetään pois`;
}

module.exports = { formatCount, fiDate, fiDateTime, modelLabel, plural, pendingSuggestions, pendingWords, exportScopeHint, AI_OFF_SENTENCE };

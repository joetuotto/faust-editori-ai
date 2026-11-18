/**
 * What the old AI paths of app.js share (the callers of claude-api and claude-api-stream)
 *
 * Kept out of the component so that Jest reads it: the reason in
 * '<Toiminto> epäonnistui: <syy>.', the sentences that are shown as they are
 * instead of a failure (a stop, the "Tekoäly pois" switch, the "Ei tekoälylle"
 * wire guard), the plan of a whole-book run of Magnum Opus that leaves the
 * chapters marked "Ei tekoälylle" out, and the guard that sends a result of
 * voice editing, the Hybrid rewrite or the Liminal Engine back to the text it
 * was made for (contracts.md 10.2 and 11.2 C, rule 14).
 *
 * Pure functions, no DOM (test/services/oldPaths.test.js).
 */

const { AI_OFF_SENTENCE } = require('../format.fi.js');
const { reasonText } = require('./aiClient.js');
const { relocateTarget } = require('../../editor/suggestionModel.js');

/**
 * The reason in '<Toiminto> epäonnistui: <syy>.' (menu spec B.12): one trailing
 * full stop is left to the template, and a missing or English placeholder
 * reason reads 'tuntematon virhe'.
 */
function failureReason(error) {
  const text = String((error && error.message) || error || '').trim().replace(/\.+$/, '');
  if (!text || /^unknown error$/i.test(text)) return 'tuntematon virhe';
  return text;
}

// The kind of notification of each sentence that is not a failure of the action (R-72)
const AS_IS_KINDS = {
  [reasonText('cancelled')]: 'info',          // Pyyntö pysäytettiin.
  [AI_OFF_SENTENCE]: 'warning'                // Tekoäly pois -asetus on päällä.
};
const WIRE_GUARD = /^Kehotteessa on tekstiä luvusta /;

/**
 * A stop, the "Tekoäly pois" switch and the "Ei tekoälylle" wire guard are not
 * failures of the action that was asked for: their sentences are shown as they
 * are, never inside '<Toiminto> epäonnistui: …' (reconcile R-21). A caller may
 * have passed the sentence through failureReason, which drops its full stop:
 * the sentence is given back whole. Returns { kind, text } or null.
 */
function asIsNotice(error) {
  const text = String((error && error.message) || error || '').trim();
  const whole = text.replace(/\.+$/, '') + '.';
  if (Object.prototype.hasOwnProperty.call(AS_IS_KINDS, whole)) return { kind: AS_IS_KINDS[whole], text: whole };
  if (WIRE_GUARD.test(text)) return { kind: 'error', text: whole };
  return null;
}

/**
 * Magnum Opus, all chapters, without the chapters marked "Ei tekoälylle"
 * (contracts.md rule 16): those are not written and lend no text to the other
 * chapters' requests.
 *
 * BatchProcessor numbers a chapter by its place in the book and reads the
 * chapters before it, so the run is planned as runs of neighbouring chapters
 * (processChapters' startFrom / stopAt) over the whole book. `lent` is the
 * project the run reads: a protected chapter keeps its title, its text and
 * summaries are empty.
 *
 * @returns { runs: [{ startFrom, stopAt }], written: number, skipped: [{ id, title }], lent }
 */
function bookRunPlan(project) {
  const structure = project && Array.isArray(project.structure) ? project.structure : [];
  const isProtected = (chapter) => !!chapter && chapter.noAI === true;
  const runs = [];
  const skipped = [];
  let written = 0;

  structure.forEach((chapter, index) => {
    if (isProtected(chapter)) {
      skipped.push({ id: chapter.id, title: chapter.title || '' });
      return;
    }
    written += 1;
    const last = runs[runs.length - 1];
    if (last && last.stopAt === index) last.stopAt = index + 1;
    else runs.push({ startFrom: index, stopAt: index + 1 });
  });

  const lent = skipped.length === 0 ? project : {
    ...project,
    structure: structure.map(chapter => (isProtected(chapter)
      ? { ...chapter, content: '', synopsis: '', synopsisAI: '', synopsisManual: '' }
      : chapter))
  };

  return { runs, written, skipped, lent };
}

/**
 * What an old path sent to the model: the chapter, the selected text and its
 * offsets, and the project epoch (contracts.md 4.4). The caller keeps it with
 * the result that answers it, never before the answer: a newer request must not
 * re-point an older result that is still on screen. Null without a selection.
 * @returns {{ chapterId, text: string, start: number, end: number, epoch }|null}
 */
function sentTarget(chapterId, selection, epoch) {
  if (!selection || typeof selection.text !== 'string' || selection.text === '') return null;
  return { chapterId, text: selection.text, start: selection.start, end: selection.end, epoch };
}

/**
 * The chapter text with `revised` in place of the text that was sent, or null
 * when the result cannot go back: it belongs to another project or another
 * chapter, or the sent text stands neither at its stored offsets nor exactly
 * once elsewhere (relocateTarget). `here` is { chapterId, epoch } of the open chapter.
 */
function placeSentText(liveText, target, here, revised) {
  if (!target || !here || target.epoch !== here.epoch || target.chapterId !== here.chapterId) return null;
  const text = String(liveText == null ? '' : liveText);
  const place = relocateTarget(text, target);
  if (!place) return null;
  return text.slice(0, place.from) + String(revised == null ? '' : revised) + text.slice(place.to);
}

module.exports = { failureReason, asIsNotice, bookRunPlan, sentTarget, placeSentText };

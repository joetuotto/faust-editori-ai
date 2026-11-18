/**
 * Kielen työkalut: the decisions of the panel that do not need React (stage I-06)
 *
 * src/components/LanguagePanel.js draws the three tabs (Typografia, Kielenhuolto, Voikko); what it shows
 * and what it proposes is computed here, so Jest can read it: the typography findings grouped by rule,
 * the lines and batches a Kielenhuolto run will send (the same batching as runProofread), the batch a
 * resumed run starts from, where "Jatka" resumes, the change "Ehdota silti" proposes for a line the run
 * set aside, where a passage of an earlier text stands now, and the Voikko rows and changes.
 *
 * Pure CommonJS module: no DOM, no React. The text functions (splitBlocks, maskSpans, batchParagraphs,
 * wordDiff) are injected as `deps`, as in proofreadPass.js.
 */
const { TYPOGRAPHY_RULES, isDialogueLine, quoteSpans } = require('../../editor/typography.fi.js');
const { selectProofLines, locateLines } = require('../ai/proofreadPass.js');

// Why a line was set aside, in the panel's words (brief I-06 step 6, reconcile R-82)
const SET_ASIDE_REASONS = {
  rewritten: 'Malli kirjoitti rivin uudelleen',
  missing: 'Rivi puuttui vastauksesta',
  duplicate: 'Rivi tuli vastauksessa kahdesti',
  split: 'Malli jakoi rivin useaksi',
  multiline: 'Malli jakoi rivin useaksi',
  truncated: 'Vastaus katkesi tämän rivin kohdalla',
  moved: 'Rivi muuttui ajon aikana',
  protected: 'Muutos olisi koskenut muistutusta tai alleviivausta',
  suspect: 'Malli vaihtoi tunnetun sanan tuntemattomaan'
};

const LANGUAGE_NAMES = { fi: 'suomi', en: 'englanti', sv: 'ruotsi' };

/** The project's language as a word in a sentence ("Tämän projektin kieli on englanti."). */
function languageName(code) {
  const key = String(code || '').toLowerCase();
  return LANGUAGE_NAMES[key] || key || 'suomi';
}

/**
 * The checker's findings as the Typografia tab lists them: one group per rule, in the rules' order;
 * the "Luettelo vai vuorosana?" question apart (it is asked in its own block, never listed).
 * @param {Array} findings from checkTypography
 * @returns {{groups: Array<{ruleId, title, message, url, level, findings: Array}>, questions: Array,
 *   listed: number, recommendations: number}}
 */
function typographyView(findings) {
  const groups = new Map();
  const questions = [];
  let recommendations = 0;
  for (const finding of findings || []) {
    if (!finding) continue;
    if (finding.level === 'kysymys') {
      questions.push(finding);
      continue;
    }
    if (finding.level === 'suositus') recommendations += 1;
    if (!groups.has(finding.ruleId)) {
      const rule = TYPOGRAPHY_RULES[finding.ruleId] || {};
      groups.set(finding.ruleId, {
        ruleId: finding.ruleId,
        title: rule.title || finding.ruleId,
        message: finding.message || rule.message || '',
        url: finding.url || rule.url || '',
        level: finding.level,
        findings: []
      });
    }
    groups.get(finding.ruleId).findings.push(finding);
  }
  const order = Object.keys(TYPOGRAPHY_RULES);
  const list = [...groups.values()].sort((a, b) => order.indexOf(a.ruleId) - order.indexOf(b.ruleId));
  return { groups: list, questions, listed: list.reduce((sum, group) => sum + group.findings.length, 0), recommendations };
}

/**
 * The line around a range, cut to about `radius` characters on each side, with the range itself apart,
 * so the excerpt can mark the flagged characters.
 * @returns {{before: string, hit: string, after: string}}
 */
function excerptAround(text, from, to, radius = 40) {
  const value = String(text == null ? '' : text);
  const start = Math.max(0, Math.min(from, value.length));
  const end = Math.max(start, Math.min(to, value.length));
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = value.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  let left = Math.max(lineStart, start - radius);
  let right = Math.min(lineEnd, end + radius);
  // Never inside a surrogate pair (an emoji)
  if (left > lineStart && /[\uDC00-\uDFFF]/.test(value[left] || '')) left += 1;
  if (right < lineEnd && /[\uD800-\uDBFF]/.test(value[right - 1] || '')) right -= 1;
  return {
    before: (left > lineStart ? '…' : '') + value.slice(left, start),
    hit: value.slice(start, end),
    after: value.slice(end, right) + (right < lineEnd ? '…' : '')
  };
}

/**
 * What a Kielenhuolto run on `text` sends: its lines and its batches, batched exactly as runProofread
 * does (the masked line is what is measured). The panel shows the count and builds the first batch's
 * request for "Mitä malli näkee".
 * @param {string} text
 * @param {object} options PROOFREAD_DEFAULTS fields (skipQuoteLines, skipDialogue, dashDialogue, range…)
 * @param {{maxChars: number, maxLines: number}} budget
 * @param {object} deps splitBlocks, maskSpans, batchParagraphs
 * @returns {{lines: Array, batches: Array<Array>, skipped: object, dashListLines: number}}
 */
function proofPlan(text, options, budget, deps) {
  const selection = selectProofLines(text, options, deps);
  const lines = selection.lines;
  const batched = lines.length === 0 ? [] : deps.batchParagraphs(lines, {
    max: budget.maxChars,
    maxLines: budget.maxLines,
    measure: (value, line) => (line && typeof line.masked === 'string' ? line.masked : value).length
  });
  const batches = batched.map(batch => (Array.isArray(batch) ? batch : batch.lines));
  return { lines, batches, skipped: selection.skipped, dashListLines: selection.dashListLines };
}

/** The 1-based number of the batch that holds the line with this index, or null. */
function batchNumberOf(plan, lineIndex) {
  const batches = plan && Array.isArray(plan.batches) ? plan.batches : [];
  for (let i = 0; i < batches.length; i++) {
    if (batches[i].some(line => line.index === lineIndex)) return i + 1;
  }
  return null;
}

/** "Erät 3–5 jäivät ajamatta." or, for the last one alone, "Erä 5 jäi ajamatta." */
function notRunText(first, last) {
  if (!(first >= 1) || !(last >= first)) return '';
  return first === last ? `Erä ${last} jäi ajamatta.` : `Erät ${first}–${last} jäivät ajamatta.`;
}

/**
 * Where "Jatka" starts in the current text (brief I-06 step 6): the line that locateLines finds for
 * the run's resumeLine; when it is not found, the start of the line with the same index; when the text
 * has no such line, null ("Jatka" becomes "Aja uudelleen").
 * @param {string} currentText
 * @param {{index: number, text: string}} resumeLine
 * @returns {{from: number, to: number} | null}
 */
function resumePlace(currentText, resumeLine) {
  if (!resumeLine || !Number.isInteger(resumeLine.index)) return null;
  const value = String(currentText == null ? '' : currentText);
  const found = locateLines(value, [{ index: resumeLine.index, text: resumeLine.text }]).get(`L${resumeLine.index}`);
  if (found) return { from: found.from, to: found.to };
  const lines = value.split('\n');
  if (resumeLine.index >= lines.length) return null;
  let from = 0;
  for (let i = 0; i < resumeLine.index; i++) from += lines[i].length + 1;
  return { from, to: from + lines[resumeLine.index].length };
}

/**
 * Where a passage of an earlier text stands in the current one: at the same offsets when it is still
 * there, else the occurrence nearest to them, else null. For "Näytä" on a line a run set aside and on a
 * Voikko finding after the text changed.
 * @returns {{from: number, to: number} | null}
 */
function locatePassage(currentText, passage, near) {
  const value = String(currentText == null ? '' : currentText);
  const needle = String(passage == null ? '' : passage);
  if (!needle) return null;
  const at = Number.isFinite(near) ? near : 0;
  if (value.slice(at, at + needle.length) === needle) return { from: at, to: at + needle.length };
  let best = null;
  for (let index = value.indexOf(needle); index !== -1; index = value.indexOf(needle, index + 1)) {
    if (best === null || Math.abs(index - at) < Math.abs(best - at)) best = index;
  }
  return best === null ? null : { from: best, to: best + needle.length };
}

const touches = (ranges, from, to) => ranges.some(([start, end]) => (from === to ? from > start && from < end : from < end && to > start));

/**
 * "Ehdota silti" for a line the run set aside (rewritten or suspect): that line's word diff, as offsets
 * in the text the run started on, each change with the run's meta and its own dialogue flag and line.
 * @param {object} entry SetAside of the run: { key, from, to, original, revised }
 * @param {object} run { baseText, runId, model, provider, dashDialogue }
 * @param {{wordDiff: Function}} deps
 * @returns {Array<{from, to, insert, original, meta}>}
 */
function setAsideChanges(entry, run, deps) {
  if (!entry || typeof entry.revised !== 'string' || entry.revised === entry.original) return [];
  const baseText = String((run && run.baseText) || '');
  // The marker of a list line stays local: a "- " line is dialogue only with "Vuorosanaviiva"
  const lineStart = baseText.lastIndexOf('\n', entry.from - 1) + 1;
  const prefix = baseText.slice(lineStart, entry.from);
  const dashLine = /^[ \t]*-[ \t]/.test(prefix) && run && run.dashDialogue === true;
  const dialogueLine = isDialogueLine(entry.original) || dashLine;
  const quoted = quoteSpans(entry.original);
  const line = { key: entry.key, original: entry.original, revised: entry.revised };
  return (deps.wordDiff(entry.original, entry.revised) || []).map(change => ({
    from: entry.from + change.from,
    to: entry.from + change.to,
    insert: change.insert,
    original: typeof change.original === 'string' ? change.original : entry.original.slice(change.from, change.to),
    meta: {
      source: 'faust',
      action: 'proofread',
      actionLabel: 'Kielenhuolto',
      instruction: '',
      provider: (run && run.provider) || null,
      model: (run && run.model) || null,
      requestLogId: null,
      runId: (run && run.runId) || null,
      dialogue: dialogueLine || touches(quoted, change.from, change.to),
      line
    }
  }));
}

/**
 * Voikko's spelling findings as rows: one per distinct word with its count, the first occurrence and
 * at most three suggestions. Words ignored for the session are left out.
 * @returns {Array<{word, count, first, suggestions: string[]}>}
 */
function voikkoWordRows(findings, ignored) {
  const skip = ignored instanceof Set ? ignored : new Set(ignored || []);
  const rows = new Map();
  for (const finding of findings || []) {
    if (!finding || finding.kind !== 'oikeinkirjoitus' || skip.has(finding.quote)) continue;
    const row = rows.get(finding.quote);
    if (row) row.count += 1;
    else rows.set(finding.quote, { word: finding.quote, count: 1, first: finding, suggestions: (finding.suggestions || []).slice(0, 3) });
  }
  return [...rows.values()];
}

/** The change a Voikko "Ehdota: …" proposes, with Voikko's meta (a local tool: never logged). */
function voikkoChange(finding, suggestion) {
  return {
    from: finding.from,
    to: finding.to,
    insert: String(suggestion),
    original: finding.quote,
    meta: { source: 'local', action: 'voikko', actionLabel: 'Voikko', instruction: '', provider: null, model: null, requestLogId: null }
  };
}

module.exports = {
  SET_ASIDE_REASONS,
  languageName,
  typographyView,
  excerptAround,
  proofPlan,
  batchNumberOf,
  notRunText,
  resumePlace,
  locatePassage,
  setAsideChanges,
  voikkoWordRows,
  voikkoChange
};

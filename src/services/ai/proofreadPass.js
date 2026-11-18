/**
 * Kielenhuolto: corrections-only proofreading
 *
 * A chapter is sent to the model as numbered lines, one paragraph per line, in
 * small batches. The answer is aligned line by line, cleaned of typographic
 * noise and turned into word-level changes. A line the model rewrote, split,
 * dropped or returned twice is set aside and never proposed.
 *
 * One coordinate frame: every offset a run produces is an offset in the text
 * the run started on (params.text, returned as baseText). The run never reads
 * the editor; the suggestion layer moves the changes onto the document.
 *
 * Pure module: the request, the context builder, the word checker and the
 * text functions (lines, masking, diff) are injected, so everything here runs
 * with fakes in test/services/proofreadPass.test.js.
 */
const {
  normaliseModelText,
  protectedRanges,
  isDialogueLine,
  quoteSpans,
  SCENE_BREAK
} = require('../../editor/typography.fi.js');

// Batch size and token numbers come from the model trial of 16 Nov 2026
const PROOFREAD_DEFAULTS = {
  skipQuoteLines: true,
  skipDialogue: false,
  dashDialogue: false,
  keepNote: '',
  maxRatio: 0.3,
  shortLineWords: 8,
  maxLineChars: 12000,
  budget: { maxChars: 2000, maxLines: 10 },
  tokensPerChar: 3,
  answerExtra: 1000
};

const ACTION = 'proofread';
const ACTION_LABEL = 'Kielenhuolto';
const KEEP_NOTE_MAX = 1000;
const EXPLAIN_MAX_CHARS = 240;

// The wording of contextBuilder.MESSAGES.noAI (a copy: this module loads nothing of the builder)
const BLOCKED_NO_AI = 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.';
const BLOCKED_OTHER = 'Luvussa ei ole lähetettävää tekstiä.';
const REQUEST_FAILED = 'Pyyntö epäonnistui.';
const STOPPED_TEXT = 'Pyyntö pysäytettiin.';
const EXPLAIN_FAILED = 'Perustelua ei saatu.';

// ---------------------------------------------------------------------------
// The text functions of src/editor and src/services/ai (wordDiff, blocks,
// maskSpans, …). A caller passes them in `deps`; a missing one is loaded here,
// when it is first needed and never at module load.
// ---------------------------------------------------------------------------

const DEFAULT_DEPS = {
  splitBlocks: () => require('../../editor/blocks.js').splitBlocks,
  batchParagraphs: () => require('./batchParagraphs.js').batchParagraphs,
  maskSpans: () => require('./maskSpans.js').maskSpans,
  unmaskSpans: () => require('./maskSpans.js').unmaskSpans,
  placeholderInstruction: () => require('./maskSpans.js').placeholderInstruction,
  wordDiff: () => require('../../editor/wordDiff.js').wordDiff,
  changeRatio: () => require('../../editor/wordDiff.js').changeRatio,
  trimToSentence: () => require('../../editor/sentences.js').trimToSentence,
  splitSentences: () => require('../../editor/sentences.js').splitSentences,
  stripTodos: () => require('./contextBuilder.js').stripTodos
};

function dep(deps, name) {
  if (deps && typeof deps[name] === 'function') return deps[name];
  return DEFAULT_DEPS[name]();
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// An insertion (from === to) only counts strictly inside a range
function touchesRanges(ranges, from, to) {
  if (from === to) return ranges.some(([start, end]) => from > start && from < end);
  return ranges.some(([start, end]) => from < end && to > start);
}

// ---------------------------------------------------------------------------
// Selecting and batching lines
// ---------------------------------------------------------------------------

/**
 * How much text goes into one request. The trial's batch is 2 000 characters
 * and 10 lines; a small window or a low output limit makes it smaller, never
 * below 500 characters.
 * @param {{promptBudgetChars?: number, maxOutputTokens?: number}} [info]
 * @returns {{maxChars: number, maxLines: number}}
 */
function proofBudget(info = {}) {
  const { promptBudgetChars, maxOutputTokens } = info || {};
  const defaults = PROOFREAD_DEFAULTS;
  const byPrompt = Math.floor((Number.isFinite(promptBudgetChars) ? promptBudgetChars : Infinity) * 0.25);
  const byOutput = Math.floor(((Number.isFinite(maxOutputTokens) ? maxOutputTokens : 32000) - defaults.answerExtra) / defaults.tokensPerChar);
  return {
    maxChars: clamp(Math.min(defaults.budget.maxChars, byPrompt, byOutput), 500, defaults.budget.maxChars),
    maxLines: defaults.budget.maxLines
  };
}

/**
 * The lines of a text that are sent: paragraphs, list item bodies (the marker
 * stays local, in `prefix`) and, when asked, quote line bodies. Headings and
 * scene breaks are never sent.
 * @param {string} text
 * @param {object} options PROOFREAD_DEFAULTS fields, plus range?: { from, to }
 * @param {object} deps splitBlocks, maskSpans
 * @returns {{lines: Array, skipped: {structural, quote, dialogue, empty, tooLong}, dashListLines: number}}
 */
function selectProofLines(text, options, deps) {
  const settings = { ...PROOFREAD_DEFAULTS, ...(options || {}) };
  const value = String(text == null ? '' : text);
  const splitBlocks = dep(deps, 'splitBlocks');
  const maskSpans = dep(deps, 'maskSpans');
  const range = settings.range && Number.isFinite(settings.range.from) && Number.isFinite(settings.range.to)
    ? settings.range
    : null;

  const lines = [];
  const skipped = { structural: 0, quote: 0, dialogue: 0, empty: 0, tooLong: 0 };
  let dashListLines = 0;

  splitBlocks(value).forEach((block, position) => {
    if (block.kind === 'blank') return;
    if (range && !(block.to > range.from && block.from < range.to)) return;

    if (block.kind === 'quote' && settings.skipQuoteLines) {
      skipped.quote += 1;
      return;
    }
    if (block.kind !== 'paragraph' && block.kind !== 'list' && block.kind !== 'quote') {
      skipped.structural += 1;
      return;
    }

    const dashList = block.kind === 'list' && block.marker === '-';
    if (dashList) dashListLines += 1;

    const prefix = typeof block.prefix === 'string' ? block.prefix : '';
    const body = typeof block.body === 'string' ? block.body : String(block.text || '').slice(prefix.length);
    // With "Rivin alun viiva: Vuorosanaviiva" an existing "- " line is read as dialogue
    const dialogue = isDialogueLine(body) || (dashList && settings.dashDialogue === true);
    if (dialogue && settings.skipDialogue) {
      skipped.dialogue += 1;
      return;
    }

    const mask = maskSpans(body);
    const prose = String(mask.text).replace(/⟦\/?\d+⟧/g, ' ');
    if (mask.hasProse === false || !/\p{L}/u.test(prose)) {
      skipped.empty += 1;
      return;
    }
    if (body.length > settings.maxLineChars) {
      skipped.tooLong += 1;
      return;
    }

    const index = Number.isInteger(block.n) ? block.n - 1 : position;
    lines.push({
      key: `L${index}`,
      index,
      from: block.from,
      to: block.to,
      prefix,
      text: body,
      masked: mask.text,
      mask,
      dialogue
    });
  });

  return { lines, skipped, dashListLines };
}

/** The numbered lines of one request. Numbering restarts at 1 in every batch. */
function formatBatch(lines) {
  return (lines || []).map((line, index) => `[${index + 1}] ${line.masked}`).join('\n');
}

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

const PROOFREAD_ROLE = 'Olet suomen kielen oikolukija. Saat numeroituja rivejä kirjan käsikirjoituksesta. Jokainen rivi on yksi kappale.';

/**
 * The rules of the request, one item per line: the text that passed the model
 * trial, kept as trialled (changing it would un-test it). Rule 4 is the
 * placeholder instruction of the masking module.
 * @param {object} deps placeholderInstruction
 * @param {string} [keepNote] the author's "Tahallista / huomioi" field
 * @returns {string[]}
 */
function proofreadRules(deps, keepNote) {
  const rules = [
    'Korjaa vain selvät kielivirheet: lyöntivirheet, yhdyssanavirheet, pilkkuvirheet, väärät taivutusmuodot, kongruenssivirheet ja selvät typografiset virheet.',
    '1. Älä muuta tyyliä, sanavalintoja, sanajärjestystä tai rytmiä. Älä tiivistä, selkeytä tai paranna tekstiä.',
    '2. Jos rivillä ei ole virhettä, palauta se merkilleen samana.',
    '3. Palauta jokainen rivi omalla rivillään ja samalla numerolla: [1], [2] ja niin edelleen. Rivejä on vastauksessa täsmälleen yhtä monta kuin sait. Älä yhdistä, jaa, lisää tai poista rivejä.',
    `4. ${dep(deps, 'placeholderInstruction')('fi')}`,
    '5. Vuorosanaviivalla (–) alkavat rivit ovat repliikkejä. Niiden puhekieli ja murre ovat tahallisia: älä muuta niitä yleiskieleksi. Korjaa repliikistä vain selvä lyöntivirhe.',
    '6. Suomen lainausmerkki on ” ja ajatusviiva –. Älä vaihda niitä suoriin lainausmerkkeihin (") tai yhdysmerkkeihin (-).',
    '7. Vastaa vain korjatuilla riveillä <teksti>-tagien sisällä. Ei selityksiä, ei otsikoita, ei koodilohkoja, ei mitään tagien ulkopuolella.',
    'Vastauksen muoto:',
    '<teksti>',
    '[1] ensimmäinen rivi korjattuna',
    '[2] toinen rivi korjattuna',
    '</teksti>'
  ];
  const note = String(keepNote == null ? '' : keepNote).replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, KEEP_NOTE_MAX);
  if (note) rules.push(`Kirjoittaja on merkinnyt nämä tahallisiksi, älä korjaa niitä: ${note}`);
  return rules;
}

/** Answer budget of a batch: three tokens per character plus 1 000 (the trial's numbers). */
function answerTokensForBatch(chars) {
  return Math.ceil(chars * PROOFREAD_DEFAULTS.tokensPerChar) + PROOFREAD_DEFAULTS.answerExtra;
}

/**
 * One batch as a task for the context builder (the one assembler of requests).
 * @param {Array|{lines: Array}} batch ProofLines, or a batch of batchParagraphs
 * @returns {object} ContextTask
 */
function proofreadTask(batch, options, deps) {
  const lines = Array.isArray(batch) ? batch : (batch && batch.lines) || [];
  const count = lines.length;
  const payload = formatBatch(lines);
  return {
    id: 'proofread',
    role: PROOFREAD_ROLE,
    rules: proofreadRules(deps, options && options.keepNote),
    instruction: count === 1
      ? 'Oikolue tämä 1 rivi. Palauta 1 rivi samalla numerolla <teksti>-tagien sisällä.'
      : `Oikolue nämä ${count} riviä. Palauta ${count} riviä samoilla numeroilla <teksti>-tagien sisällä.`,
    payload,
    payloadTag: 'teksti',
    payloadLabel: 'kappaleet',
    parts: ['style', 'names'],
    answerTokens: answerTokensForBatch(payload.length)
  };
}

/**
 * The request of a task without a context builder: the layout the trial used.
 * @returns {{system: string, messages: Array<{role: 'user', content: string}>}}
 */
function renderProofreadRequest(task, language = 'fi') {
  const languageRule = language === 'en' ? 'Write and answer in English.' : 'Kirjoita ja vastaa suomeksi.';
  return {
    system: `${task.role}\n${languageRule}\n\n${(task.rules || []).join('\n')}`,
    messages: [{ role: 'user', content: `<teksti>\n${task.payload}\n</teksti>\n\n<ohje>\n${task.instruction}\n</ohje>` }]
  };
}

// ---------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------

/**
 * Read "[n] text" lines. Only this form counts: "1." or "1)" may begin a
 * manuscript line. A number that comes twice keeps both texts, so the
 * duplicate stays visible; a line without a number after a numbered one means
 * the model split a line.
 * @returns {{entries: Map<number, string[]>, continued: Set<number>, preamble: string[]}}
 */
function parseNumberedLines(responseText) {
  const entries = new Map();
  const continued = new Set();
  const preamble = [];
  let current = null;

  for (const rawLine of String(responseText == null ? '' : responseText).split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const match = /^\s*\[(\d{1,4})\][ \t]?(.*)$/.exec(line);
    if (match) {
      current = Number(match[1]);
      if (!entries.has(current)) entries.set(current, []);
      entries.get(current).push(match[2]);
    } else if (line.trim() === '') {
      continue;
    } else if (current === null) {
      preamble.push(line);
    } else {
      continued.add(current);
    }
  }
  return { entries, continued, preamble };
}

/**
 * Match the parsed answer to the lines that were sent. Numbers outside the
 * batch are ignored.
 * @returns {Array<{line: object, status: 'ok'|'missing'|'duplicate'|'split', revisedMasked?: string}>}
 */
function alignBatch(batch, parsed) {
  const lines = Array.isArray(batch) ? batch : (batch && batch.lines) || [];
  const aligned = lines.map((line, index) => {
    const found = parsed.entries.get(index + 1);
    if (!found || found.length === 0) return { line, status: 'missing' };
    if (found.length > 1) return { line, status: 'duplicate' };
    if (parsed.continued.has(index + 1)) return { line, status: 'split' };
    // A number with nothing after it: the line itself did not come back
    if (found[0].trim() === '') return { line, status: 'missing' };
    return { line, status: 'ok', revisedMasked: found[0] };
  });

  // Two lines joined into one: the missing line's number stands inside another
  // line, and its text would be proposed as an addition to that line
  const missing = new Set();
  aligned.forEach((entry, index) => {
    if (entry.status === 'missing') missing.add(index + 1);
  });
  if (missing.size === 0) return aligned;
  return aligned.map((entry) => {
    if (entry.status !== 'ok') return entry;
    const sent = String(entry.line.masked == null ? entry.line.text : entry.line.masked);
    const joined = [...entry.revisedMasked.matchAll(/\[(\d{1,4})\]/g)]
      .some(match => missing.has(Number(match[1])) && !sent.includes(match[0]));
    return joined ? { line: entry.line, status: 'split' } : entry;
  });
}

const countWords = (text) => {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};
// Words with a letter or a digit: an added comma is not a changed word
const countProse = (text) => String(text || '').split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length;

// True when the line has at least two prose words outside protected spans
// and the changes touch every one of them
function noProseKept(text, changes, guarded) {
  let total = 0;
  let kept = 0;
  for (const match of String(text).matchAll(/\S+/g)) {
    const from = match.index;
    const to = from + match[0].length;
    if (!/[\p{L}\p{N}]/u.test(match[0]) || touchesRanges(guarded, from, to)) continue;
    total += 1;
    if (!changes.some(change => change.from < to && change.to > from)) kept += 1;
  }
  return total >= 2 && kept === 0;
}

/**
 * One answered line turned into changes.
 * @returns {{line, status: 'unchanged'|'changes'|'rewritten'|'multiline', revised: string, ratio: number,
 *   changes: Array<{from, to, insert, original}>, dropped: {protected: number, dialogue: number}}}
 *   offsets are relative to line.text
 */
function reviseLine(line, revisedMasked, options, deps) {
  const settings = { ...PROOFREAD_DEFAULTS, ...(options || {}) };
  const outcome = { line, status: 'unchanged', revised: line.text, ratio: 0, changes: [], dropped: { protected: 0, dialogue: 0 } };

  // A placeholder the model dropped comes back at its own place, so a note cannot turn into a deletion
  const unmasked = dep(deps, 'unmaskSpans')(revisedMasked, line.mask);
  let revised = typeof unmasked === 'string' ? unmasked : String((unmasked && unmasked.text) || '');
  revised = normaliseModelText(revised, line.text);
  revised = /^\s*/.exec(line.text)[0] + revised.trim() + (line.text.trim() ? /\s*$/.exec(line.text)[0] : '');
  outcome.revised = revised;

  if (revised.includes('\n')) return { ...outcome, status: 'multiline' };
  if (revised === line.text) return outcome;
  // An empty answer is not a correction: the line would be proposed for deletion
  if (revised.trim() === '') return { ...outcome, status: 'rewritten', ratio: 1 };

  const ratio = dep(deps, 'changeRatio')(line.text, revised);
  const changes = (dep(deps, 'wordDiff')(line.text, revised) || []).map(change => ({
    from: change.from,
    to: change.to,
    insert: change.insert,
    original: typeof change.original === 'string' ? change.original : line.text.slice(change.from, change.to)
  }));
  outcome.ratio = ratio;

  // A one-word fix in a four-word line has a high ratio and is still a fix.
  // "More than two changes" counts changed words: the diff merges neighbouring
  // words into one change, so a paraphrased short line is often a single change
  const changedWords = changes.reduce((sum, change) => sum + Math.max(countProse(change.original), countProse(change.insert)), 0);
  if (ratio > settings.maxRatio && (countWords(line.text) >= settings.shortLineWords || changedWords > 2)) {
    return { ...outcome, status: 'rewritten' };
  }
  // A short line whose own words are all gone (only a note left, or every
  // word replaced) is a rewrite, not a fix to accept in bulk
  const guarded = protectedRanges(line.text);
  if (ratio > settings.maxRatio && noProseKept(line.text, changes, guarded)) {
    return { ...outcome, status: 'rewritten' };
  }

  const quoted = settings.skipDialogue ? quoteSpans(line.text) : [];
  const kept = [];
  for (const change of changes) {
    if (touchesRanges(guarded, change.from, change.to)) {
      outcome.dropped.protected += 1;
    } else if (change.insert.includes('\n')) {
      continue;
    } else if (touchesRanges(quoted, change.from, change.to)) {
      outcome.dropped.dialogue += 1;
    } else {
      kept.push(change);
    }
  }
  outcome.changes = kept;
  outcome.status = kept.length > 0 ? 'changes' : 'unchanged';
  return outcome;
}

// ---------------------------------------------------------------------------
// Finding a line again, guarding the structure
// ---------------------------------------------------------------------------

/**
 * Find lines of an earlier text in the current text, for "Jatka" after a stop.
 * A line matches by its exact text (prefix + text); of several identical lines
 * the one nearest to the old line index is taken (a tie goes to the later
 * one). Never used for offsets of changes.
 * @param {string} currentText
 * @param {Array<{key?: string, index: number, prefix?: string, text: string}>} lines
 * @returns {Map<string, {from: number, to: number}|null>} keyed by line.key, or 'L' + index
 */
function locateLines(currentText, lines) {
  const current = [];
  let start = 0;
  for (const line of String(currentText == null ? '' : currentText).split('\n')) {
    current.push({ text: line.trimEnd(), from: start, to: start + line.length, used: false });
    start += line.length + 1;
  }

  const found = new Map();
  for (const line of lines || []) {
    if (!line) continue;
    const wanted = ((line.prefix || '') + line.text).trimEnd();
    let best = -1;
    current.forEach((candidate, position) => {
      if (candidate.used || candidate.text !== wanted) return;
      if (best === -1 || Math.abs(position - line.index) <= Math.abs(best - line.index)) best = position;
    });
    if (best !== -1) current[best].used = true;
    found.set(line.key || `L${line.index}`, best === -1 ? null : { from: current[best].from, to: current[best].to });
  }
  return found;
}

function applyChangeList(text, changes) {
  let out = '';
  let cursor = 0;
  for (const change of changes) {
    out += text.slice(cursor, change.from) + change.insert;
    cursor = change.to;
  }
  return out + text.slice(cursor);
}

// What a correction must never alter: structural lines with their markers, notes and underline tags
function structureOf(text) {
  const lines = text.split('\n');
  const marks = [];
  lines.forEach((line, index) => {
    let match;
    if (SCENE_BREAK.test(line)) marks.push(`${index} break ${line}`);
    else if (/^#{1,6}\s/.test(line)) marks.push(`${index} heading ${line}`);
    else if ((match = /^\s*(?:[-*+]|\d+[.)])\s+/.exec(line))) marks.push(`${index} list ${match[0]}`);
    else if ((match = /^>\s?/.exec(line))) marks.push(`${index} quote ${match[0]}`);
  });
  const notes = text.match(/\[TODO:[^\]\n]*\]|<\/?u>/g) || [];
  return JSON.stringify([lines.length, marks, notes]);
}

/**
 * Defence in depth: apply the changes to a copy and compare the structural
 * lines, the notes and the underline tags before and after. The changes of a
 * line that alters any of them are dropped. With correct inputs nothing is.
 * @returns {{safe: Array, dropped: Array}}
 */
function guardChanges(currentText, changes) {
  const text = String(currentText == null ? '' : currentText);
  const sorted = [...(changes || [])].sort((a, b) => a.from - b.from || a.to - b.to);

  let safe = [];
  const dropped = [];
  let lastEnd = 0;
  for (const change of sorted) {
    const valid = Number.isInteger(change.from) && Number.isInteger(change.to)
      && change.from >= lastEnd && change.to >= change.from && change.to <= text.length
      && typeof change.insert === 'string';
    if (!valid) {
      dropped.push(change);
      continue;
    }
    safe.push(change);
    lastEnd = change.to;
  }

  const lineStarts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) lineStarts.push(i + 1);
  const lineOf = (pos) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (lineStarts[middle] <= pos) low = middle;
      else high = middle - 1;
    }
    return low;
  };

  const before = structureOf(text);
  while (safe.length > 0 && structureOf(applyChangeList(text, safe)) !== before) {
    const byLine = new Map();
    for (const change of safe) {
      const line = lineOf(change.from);
      if (!byLine.has(line)) byLine.set(line, []);
      byLine.get(line).push(change);
    }
    let offender = null;
    for (const [line, group] of byLine) {
      if (structureOf(applyChangeList(text, group)) !== before) {
        offender = line;
        break;
      }
    }
    if (offender === null) {
      // Harmful only together: none of them is proposed
      dropped.push(...safe);
      safe = [];
      break;
    }
    dropped.push(...byLine.get(offender));
    safe = safe.filter(change => lineOf(change.from) !== offender);
  }

  return { safe, dropped };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const ONE_WORD = /^[\p{L}\p{N}'’-]+$/u;
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

// The word pairs of a change for the suspect-word guard. The diff merges a word
// with the comma after it and with a changed neighbour ("Isoisän" → "Isäisän,",
// "Isoisän talo" → "Isäisän tolo"), so punctuation at the edges of each word is
// left out and words are paired in order when both sides have as many
function wordPairs(change) {
  const words = (text) => String(text || '').split(/\s+/).filter(Boolean).map(word => word.replace(EDGE_PUNCTUATION, ''));
  const before = words(change.original);
  const after = words(change.insert);
  if (before.length === 0 || before.length !== after.length) return [];
  const pairs = [];
  before.forEach((word, index) => {
    const next = after[index];
    if (word !== next && ONE_WORD.test(word) && ONE_WORD.test(next)) pairs.push({ original: word, insert: next });
  });
  return pairs;
}
const MISALIGNED = new Set(['missing', 'duplicate', 'split']);

const newRunId = () => `kh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
// A thrown exception carries a programmer's message (often English): the
// screen gets the Finnish sentence instead
const errorText = () => REQUEST_FAILED;
// A budget field counts only when it is a positive number; else the default
function budgetOf(given) {
  const usable = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const source = given && typeof given === 'object' ? given : {};
  return {
    maxChars: usable(source.maxChars) ? source.maxChars : PROOFREAD_DEFAULTS.budget.maxChars,
    maxLines: usable(source.maxLines) ? source.maxLines : PROOFREAD_DEFAULTS.budget.maxLines
  };
}
const resumePoint = (line) => ({ index: line.index, text: line.prefix + line.text });

function blockedMessage(built) {
  if (built.blocked === 'noAI') return BLOCKED_NO_AI;
  if (built.blocked) return BLOCKED_OTHER;
  // Token numbers go through the shared formatter, taken when the text is built
  const { formatCount } = require('../format.fi.js');
  return `Erä ei mahdu mallin ikkunaan: noin ${formatCount(built.totalTokens)} tokenia, tilaa ${formatCount(built.budgetTokens)}.`;
}

/**
 * Proofread a text. Batches run strictly one after another.
 *
 * @param {object} params
 * @param {string} params.text the text the run works on; every offset is an offset in it
 * @param {object} [params.options] PROOFREAD_DEFAULTS fields, plus range?: { from, to }
 * @param {{maxChars: number, maxLines: number}} [params.budget]
 * @param {object} params.deps the text functions (see DEFAULT_DEPS)
 * @param {{chapterId: string}} [params.meta]
 * @param {(task: object) => object} [params.build] the context builder; without it the plain layout
 * @param {(opts: object) => {result: Promise<object>, cancel: Function}} params.request requestEdit of the AI client
 * @param {(words: string[]) => Promise<object>} [params.checkWords] known-word lookup for the suspect-word guard
 * @param {string} [params.runId]
 * @param {AbortSignal} [params.signal]
 * @param {Function} [params.onProgress] ({ batchIndex, batchCount, linesDone, linesTotal, corrections })
 * @param {Function} [params.onBatch] ({ batchIndex, batchCount, changes, setAside, baseText }); may
 *   return (or resolve to) { skipped: [{ index, reason }] }, the result of the caller's propose
 * @returns {Promise<object>} ProofreadResult
 */
async function runProofread(params) {
  const { deps, request, build, checkWords, signal, onProgress, onBatch } = params;
  const baseText = String(params.text == null ? '' : params.text);
  const options = { ...PROOFREAD_DEFAULTS, ...(params.options || {}) };
  const budget = budgetOf(params.budget || options.budget);
  const runId = params.runId || newRunId();
  const chapterId = params.meta && params.meta.chapterId !== undefined ? params.meta.chapterId : null;
  const range = options.range && Number.isFinite(options.range.from) && Number.isFinite(options.range.to)
    ? options.range
    : null;

  const selection = selectProofLines(baseText, options, deps);
  const lines = selection.lines;
  const batches = lines.length === 0 ? [] : dep(deps, 'batchParagraphs')(lines, {
    max: budget.maxChars,
    maxLines: budget.maxLines,
    // What is sent is the masked line
    measure: (text, line) => (line && typeof line.masked === 'string' ? line.masked : text).length
  });
  const linesOf = (batch) => (Array.isArray(batch) ? batch : batch.lines);

  const result = {
    status: 'done',
    runId,
    model: null,
    baseText,
    batchCount: batches.length,
    batchesDone: 0,
    linesSent: 0,
    linesUnchanged: 0,
    linesChanged: 0,
    corrections: 0,
    dialogueCorrections: 0,
    setAside: [],
    skipped: selection.skipped,
    dashListLines: selection.dashListLines,
    failedBatches: [],
    resumeLine: null,
    error: null,
    summary: ''
  };

  const aborted = () => Boolean(signal && signal.aborted);
  const setAsideEntry = (line, reason, revised = null, ratio = null) => {
    const from = line.from + line.prefix.length;
    return { key: line.key, from, to: from + line.text.length, original: line.text, revised, reason, ratio };
  };

  // One request for some lines: 'stopped', 'failed' (an error, or nothing could
  // be sent), 'rejected' (an answer that is not accepted) or 'answer'
  async function ask(askedLines) {
    const task = proofreadTask(askedLines, options, deps);
    let built;
    try {
      built = build ? await build(task) : renderProofreadRequest(task);
    } catch (error) {
      return { kind: 'failed', sent: false, reason: 'error', message: errorText(error) };
    }
    if (!built || built.blocked || built.overBudget) {
      const reason = !built ? 'error' : built.blocked || 'over_budget';
      return { kind: 'failed', sent: false, reason, message: built ? blockedMessage(built) : REQUEST_FAILED };
    }
    if (aborted()) return { kind: 'stopped', sent: false };

    let handle;
    try {
      handle = request({
        system: built.system,
        messages: built.messages,
        maxTokens: task.answerTokens,
        temperature: 0,
        original: task.payload,
        meta: { action: ACTION, actionLabel: ACTION_LABEL, instruction: '', chapterId, runId }
      });
    } catch (error) {
      return { kind: 'failed', sent: false, reason: 'error', message: errorText(error) };
    }
    const cancel = () => {
      if (handle && typeof handle.cancel === 'function') handle.cancel();
    };
    if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', cancel);

    let response;
    try {
      response = await (handle && handle.result ? handle.result : handle);
    } catch (error) {
      response = { ok: false, error: { code: 'error', message: errorText(error) } };
    } finally {
      if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', cancel);
    }

    if (response && !result.model) result.model = response.model || (response.logMeta && response.logMeta.model) || null;
    if (!response) return { kind: 'failed', sent: true, reason: 'error', message: REQUEST_FAILED };
    if (response.cancelled || aborted()) return { kind: 'stopped', sent: true };
    if (response.accepted) {
      const aligned = alignBatch(askedLines, parseNumberedLines(response.inner));
      return { kind: 'answer', sent: true, entries: aligned.map(entry => ({ ...entry, logMeta: response.logMeta || null })) };
    }
    if (response.ok === false) {
      return {
        kind: 'failed',
        sent: true,
        reason: (response.error && response.error.code) || response.reason || 'error',
        message: response.reasonText || (response.error && response.error.message) || REQUEST_FAILED
      };
    }
    // max_tokens, missing_tag, empty, refusal, …: nothing of this answer is used
    return { kind: 'rejected', sent: true, reason: response.reason || 'stop_reason', message: response.reasonText || '' };
  }

  // A whole batch: one request, or two halves when the first answer is unusable
  async function processBatch(batchLines) {
    const first = await ask(batchLines);
    if (first.kind === 'stopped' || first.kind === 'failed') return first;

    const misaligned = first.kind === 'answer' ? first.entries.filter(entry => MISALIGNED.has(entry.status)).length : 0;
    if (first.kind === 'answer' && !(batchLines.length >= 2 && misaligned > batchLines.length / 2)) {
      return { kind: 'done', sent: true, entries: first.entries, failures: [], rejections: [] };
    }
    const truncated = (some) => some.map(line => ({ line, status: 'truncated' }));
    if (batchLines.length < 2) {
      // The reason of the unaccepted answer is kept for the panel and the chip
      const rejections = first.kind === 'rejected' ? [first] : [];
      return { kind: 'done', sent: true, entries: truncated(batchLines), failures: [], rejections };
    }

    // Once more as two halves, each numbered from 1. There is no further retry
    const middle = Math.ceil(batchLines.length / 2);
    const entries = [];
    const failures = [];
    // Only the answers whose lines end as truncated are reported: a first answer
    // that the halves made good is not
    const rejections = [];
    for (const half of [batchLines.slice(0, middle), batchLines.slice(middle)]) {
      const answer = await ask(half);
      if (answer.kind === 'stopped') return { ...answer, sent: true };
      if (answer.kind === 'failed') {
        failures.push(answer);
        // Its lines are accounted for as well: set aside, not lost from the counts
        entries.push(...truncated(half));
      } else if (answer.kind === 'rejected') {
        rejections.push(answer);
        entries.push(...truncated(half));
      } else {
        entries.push(...answer.entries);
      }
    }
    if (failures.length === 2) return { ...failures[1], sent: true };
    return { kind: 'done', sent: true, entries, failures, rejections };
  }

  // The lines whose one-word change replaced a known word with an unknown one
  async function suspectLines(outcomes) {
    if (typeof checkWords !== 'function') return new Set();
    const candidates = [];
    for (const outcome of outcomes) {
      for (const change of outcome.changes) {
        for (const pair of wordPairs(change)) candidates.push({ outcome, change: pair });
      }
    }
    if (candidates.length === 0) return new Set();

    const words = [...new Set(candidates.flatMap(({ change }) => [change.original, change.insert]))];
    let known;
    try {
      known = await checkWords(words);
    } catch (error) {
      // No answer from the checker: the guard is off for this batch
      return new Set();
    }
    if (!known || typeof known !== 'object') return new Set();
    return new Set(candidates
      .filter(({ change }) => known[change.original] === true && known[change.insert] === false)
      .map(({ outcome }) => outcome.line.key));
  }

  const linesTotal = lines.length;
  let linesDone = 0;
  let failuresInRow = 0;
  let firstFailedLine = null;
  const progress = (batchIndex) => {
    if (typeof onProgress !== 'function') return;
    onProgress({ batchIndex, batchCount: batches.length, linesDone, linesTotal, corrections: result.corrections });
  };

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batchLines = linesOf(batches[batchIndex]);
    if (aborted()) {
      result.status = 'stopped';
      result.resumeLine = resumePoint(batchLines[0]);
      break;
    }
    progress(batchIndex);

    const done = await processBatch(batchLines);
    if (done.sent) result.linesSent += batchLines.length;

    if (done.kind === 'stopped') {
      result.status = 'stopped';
      result.resumeLine = resumePoint(batchLines[0]);
      break;
    }
    if (done.kind === 'failed') {
      result.failedBatches.push({ index: batchIndex, reason: done.reason, message: done.message });
      if (failuresInRow === 0) firstFailedLine = batchLines[0];
      failuresInRow += 1;
      if (failuresInRow >= 2) {
        result.status = 'failed';
        result.error = done.message;
        result.resumeLine = resumePoint(firstFailedLine);
        break;
      }
      linesDone += batchLines.length;
      progress(batchIndex);
      continue;
    }
    failuresInRow = 0;
    for (const failure of done.failures) {
      result.failedBatches.push({ index: batchIndex, reason: failure.reason, message: failure.message });
    }
    // An answer that was not accepted: its lines are set aside as truncated, and
    // its reason text (contracts 8.3) is kept here so the panel can show it
    for (const rejection of done.rejections) {
      result.failedBatches.push({ index: batchIndex, reason: rejection.reason, message: rejection.message || REQUEST_FAILED });
    }

    // Line by line: unchanged, changes, or set aside
    const setAside = [];
    const outcomes = [];
    for (const entry of done.entries) {
      if (entry.status !== 'ok') {
        setAside.push(setAsideEntry(entry.line, entry.status));
        continue;
      }
      const outcome = reviseLine(entry.line, entry.revisedMasked, options, deps);
      outcome.logMeta = entry.logMeta;
      if (outcome.status === 'rewritten') setAside.push(setAsideEntry(entry.line, 'rewritten', outcome.revised, outcome.ratio));
      else if (outcome.status === 'multiline') setAside.push(setAsideEntry(entry.line, 'multiline', outcome.revised, null));
      else if (outcome.status === 'unchanged') result.linesUnchanged += 1;
      else outcomes.push(outcome);
    }

    const suspects = await suspectLines(outcomes);

    // Offsets in the run-start text: line start + marker + offset in the line
    let changes = [];
    const lineByKey = new Map();
    for (const outcome of outcomes) {
      const line = outcome.line;
      if (suspects.has(line.key)) {
        setAside.push(setAsideEntry(line, 'suspect', outcome.revised, outcome.ratio));
        continue;
      }
      const at = line.from + line.prefix.length;
      const quoted = quoteSpans(line.text);
      const lineInfo = { key: line.key, original: line.text, revised: outcome.revised };
      const logMeta = outcome.logMeta || {};
      const lineChanges = [];
      for (const change of outcome.changes) {
        const from = at + change.from;
        const to = at + change.to;
        if (range && (from < range.from || to > range.to)) continue;
        lineChanges.push({
          from,
          to,
          insert: change.insert,
          original: change.original,
          meta: {
            source: 'faust',
            action: ACTION,
            actionLabel: ACTION_LABEL,
            instruction: '',
            provider: logMeta.provider === undefined ? null : logMeta.provider,
            model: logMeta.model === undefined ? null : logMeta.model,
            requestLogId: logMeta.requestLogId === undefined ? null : logMeta.requestLogId,
            runId,
            dialogue: line.dialogue === true || touchesRanges(quoted, change.from, change.to),
            line: lineInfo
          }
        });
      }
      if (lineChanges.length === 0) {
        result.linesUnchanged += 1;
        continue;
      }
      lineByKey.set(line.key, { line, outcome });
      changes.push(...lineChanges);
    }

    const guard = guardChanges(baseText, changes);
    if (guard.dropped.length > 0) {
      const droppedKeys = new Set(guard.dropped.map(change => change.meta.line.key));
      for (const key of droppedKeys) {
        const { line, outcome } = lineByKey.get(key);
        setAside.push(setAsideEntry(line, 'protected', outcome.revised, outcome.ratio));
        lineByKey.delete(key);
      }
      changes = guard.safe.filter(change => !droppedKeys.has(change.meta.line.key));
    } else {
      changes = guard.safe;
    }

    // The caller proposes the batch and says what the suggestion layer skipped
    let reply = null;
    if (typeof onBatch === 'function') {
      reply = await onBatch({ batchIndex, batchCount: batches.length, changes, setAside, baseText });
    }
    const skippedIndexes = new Set();
    const moved = new Set();
    for (const skip of (reply && Array.isArray(reply.skipped) ? reply.skipped : [])) {
      const change = skip ? changes[skip.index] : null;
      if (!change || skippedIndexes.has(skip.index)) continue;
      skippedIndexes.add(skip.index);
      // The author edited that place during the run
      if (skip.reason === 'target-changed' || skip.reason === 'mismatch') moved.add(change.meta.line.key);
    }
    // Known only now: these go to the result, not into the list onBatch was given
    const movedAside = [...moved].map((key) => {
      const { line, outcome } = lineByKey.get(key);
      return setAsideEntry(line, 'moved', outcome.revised, outcome.ratio);
    });

    const changedLines = new Set();
    changes.forEach((change, index) => {
      if (skippedIndexes.has(index)) return;
      result.corrections += 1;
      if (change.meta.dialogue) result.dialogueCorrections += 1;
      changedLines.add(change.meta.line.key);
    });
    result.linesChanged += changedLines.size;
    result.setAside.push(...setAside, ...movedAside);
    result.batchesDone += 1;
    linesDone += batchLines.length;
    progress(batchIndex);
  }

  // A run in which every request failed did not "find nothing to correct"
  if (result.status === 'done' && result.batchesDone === 0 && result.failedBatches.length > 0) {
    const last = result.failedBatches[result.failedBatches.length - 1];
    result.status = 'failed';
    result.error = last.message;
    result.resumeLine = firstFailedLine ? resumePoint(firstFailedLine) : null;
  }

  result.summary = summaryLine(result);
  return result;
}

// ---------------------------------------------------------------------------
// "Miksi?"
// ---------------------------------------------------------------------------

const EXPLAIN_SYSTEM = 'Olet suomen kielen oikolukija. Perustele yksi tekstiin tehty korjaus yhdellä lyhyellä suomenkielisellä virkkeellä. Älä ehdota muita muutoksia äläkä toista tekstiä.';

/**
 * The small request behind "Miksi?". The model reads the line, so its [TODO: …] notes stay home, as
 * they do in every read-only context (stripTodos of the context builder): the run itself sent the line
 * with its notes masked, and the change never touches a note.
 * @param {{original: string, revised: string, before: string, after: string}} fields
 * @param {object} [deps] stripTodos (else the context builder's)
 * @returns {{system: string, messages: Array, maxTokens: 300, temperature: 0}}
 */
function buildExplainRequest(fields, deps) {
  const strip = dep(deps, 'stripTodos');
  const clean = (value) => strip(String(value == null ? '' : value));
  const original = clean(fields.original);
  const revised = clean(fields.revised);
  const before = clean(fields.before);
  const after = clean(fields.after);
  let change = `Muutos: ”${before}” → ”${after}”`;
  if (!before) change = `Muutos: lisätty ”${after}”`;
  else if (!after) change = `Muutos: poistettu ”${before}”`;

  return {
    system: EXPLAIN_SYSTEM,
    messages: [{
      role: 'user',
      content: `Alkuperäinen rivi: ${original}\nKorjattu rivi: ${revised}\n${change}\nMiksi tämä muutos tehtiin?`
    }],
    maxTokens: 300,
    temperature: 0
  };
}

// Up to the first sentence end that is followed by a capital letter or the end
// of the text ("esim. että" does not end a sentence). Only the fallback: the
// sentence splitter knows the abbreviations ("esim. Helsinki", "ks. Kielitoimiston")
function firstSentenceByPattern(line) {
  const match = /^[\s\S]*?[.!?…]+[”"’')\]]*(?=\s+\p{Lu}|\s*$)/u.exec(line);
  return match ? match[0] : line;
}

function firstSentence(text, deps) {
  const line = (text.split('\n').find(part => part.trim()) || '').trim();
  if (!line) return '';
  let sentences = null;
  try {
    sentences = dep(deps, 'splitSentences')(line);
  } catch (error) {
    sentences = null;
  }
  if (!Array.isArray(sentences) || sentences.length === 0) return firstSentenceByPattern(line);
  // A list number ("1.") is not the explanation
  const pieces = sentences
    .map(sentence => line.slice(sentence.from, sentence.to).trim())
    .filter(Boolean);
  const first = pieces.find(piece => !/^\d+[.)]$/.test(piece));
  return first || firstSentenceByPattern(line);
}

// Cut to at most `max` characters with an ellipsis, never inside a surrogate pair
function cutText(text, max) {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, '');
  return `${head.trimEnd()}…`;
}

/**
 * Ask the model why one correction was made: one sentence, at most 240
 * characters. With a cache (a Map) the same change is asked only once.
 * @returns {Promise<{ok: true, text: string} | {ok: false, reason: string, message: string}>}
 */
async function explainChange({ original, revised, before, after, request, signal, deps, cache } = {}) {
  const key = `${original}\u0000${before}\u0000${after}`;
  if (cache && cache.has(key)) return { ok: true, text: cache.get(key) };

  let handle;
  try {
    handle = request({
      ...buildExplainRequest({ original, revised, before, after }, deps),
      thinking: 'off',
      meta: { action: 'proofread-explain', actionLabel: 'Miksi?', instruction: '' }
    });
  } catch (error) {
    return { ok: false, reason: 'error', message: EXPLAIN_FAILED };
  }
  const cancel = () => {
    if (handle && typeof handle.cancel === 'function') handle.cancel();
  };
  if (signal && typeof signal.addEventListener === 'function') signal.addEventListener('abort', cancel);

  let result;
  try {
    result = await (handle && handle.result ? handle.result : handle);
  } catch (error) {
    result = { ok: false, error: { message: EXPLAIN_FAILED } };
  } finally {
    if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', cancel);
  }

  if (!result) return { ok: false, reason: 'error', message: EXPLAIN_FAILED };
  if (result.cancelled) return { ok: false, reason: 'cancelled', message: STOPPED_TEXT };
  if (result.ok === false) {
    return { ok: false, reason: 'error', message: (result.error && result.error.message) || EXPLAIN_FAILED };
  }

  const raw = String(result.text || '').trim();
  // An answer without a full stop is still an answer
  const whole = raw ? (dep(deps, 'trimToSentence')(raw) || raw) : '';
  const text = cutText(firstSentence(whole, deps), EXPLAIN_MAX_CHARS);
  if (!text) return { ok: false, reason: 'empty', message: EXPLAIN_FAILED };

  if (cache) cache.set(key, text);
  return { ok: true, text };
}

// ---------------------------------------------------------------------------
// Summary and the model caveat
// ---------------------------------------------------------------------------

/** "37 korjausta, 2 riviä ohitettu", with a prefix for a stopped or failed run. */
function summaryLine(result) {
  const corrections = (result && result.corrections) || 0;
  const aside = result && Array.isArray(result.setAside) ? result.setAside.length : 0;

  let line = 'Ei korjattavaa';
  if (corrections === 1) line = '1 korjaus';
  else if (corrections > 1) line = `${corrections} korjausta`;

  if (aside === 1) line += ', 1 rivi ohitettu';
  else if (aside > 1) line += `, ${aside} riviä ohitettu`;

  if (result && result.status === 'stopped') return `Pysäytetty: ${line}`;
  if (result && result.status === 'failed') return `Keskeytyi virheeseen: ${line}`;
  return line;
}

/**
 * The decision rule of the model trial: at least half of the planted errors
 * fixed, fewer wrong corrections than fixes, under a fifth of the paragraphs
 * rewritten.
 */
function meetsProofreadThreshold(stats, threshold = {}) {
  const { minFixedShare = 0.5, maxRewrittenShare = 0.2 } = threshold || {};
  if (!stats || !(stats.planted > 0) || !(stats.paragraphs > 0)) return false;
  return stats.fixed / stats.planted >= minFixedShare
    && stats.wrong < stats.fixed
    && stats.rewritten / stats.paragraphs < maxRewrittenShare;
}

// The trial's day in the notes file is a calendar date ('2026-11-16'): read as that day where the
// author is, not as midnight UTC, then written by the shared formatter (taken when the text is built)
function trialDate(value) {
  const { fiDate } = require('../format.fi.js');
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  return fiDate(parts ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])) : value);
}

const shortModelId = (id) => String(id == null ? '' : id).replace(/^[^:]*:/, '');

/**
 * The caveat shown under the model line of the Kielenhuolto panel.
 * @param {string} modelId the model of the role "Muokkaus"
 * @param {object} notes src/services/ai/proofreadModelNotes.js
 * @returns {{kind: 'not-run'|'recommended'|'weak'|'untested', text: string}}
 */
function modelNote(modelId, notes) {
  const data = notes || {};
  if (!data.testedAt) {
    return { kind: 'not-run', text: 'Mallikoetta ei ole vielä ajettu. Tarkista jokainen ehdotus.' };
  }

  const models = Array.isArray(data.models) ? data.models : [];
  const nonePassed = models.some(model => meetsProofreadThreshold(model)) ? '' : ' Yksikään kokeiltu malli ei täyttänyt rajaa.';
  // The provider prefix of a gateway id differs between installations
  const tested = models.find(model => model.id === modelId)
    || models.find(model => modelId && shortModelId(model.id) === shortModelId(modelId));
  if (!tested) {
    return { kind: 'untested', text: `Tätä mallia ei ole kokeiltu suomen kielenhuollossa. Tarkista jokainen ehdotus.${nonePassed}` };
  }

  const wrong = tested.wrong === 1 ? '1 väärän korjauksen' : `${tested.wrong} väärää korjausta`;
  const sentence = `Mallikokeessa ${trialDate(data.testedAt)} tämä malli korjasi ${tested.fixed} / ${tested.planted} istutetusta kielivirheestä, teki ${wrong} ja kirjoitti uusiksi ${tested.rewritten} / ${tested.paragraphs} kappaletta.`;
  const notOwnText = data.ownText === false ? ' Koeaineisto oli kokeeseen kirjoitettua tekstiä, ei omaa käsikirjoitustasi.' : '';

  if (meetsProofreadThreshold(tested)) return { kind: 'recommended', text: sentence + notOwnText };
  return { kind: 'weak', text: `${sentence} Se ei täyttänyt rajaa: tarkista jokainen ehdotus.${nonePassed}${notOwnText}` };
}

// ---------------------------------------------------------------------------
// The Cmd+K chip "Kielenhuolto – vain virheet"
// ---------------------------------------------------------------------------

/**
 * The selection run of the quick-edit chip: the same pipeline as the panel's,
 * on the lines the selection touches.
 *
 * @param {object} deps
 * @param {() => object} deps.getProject
 * @param {object} deps.textDeps the text functions
 * @param {(task: object, info: {chapterId, text, model}) => object} [deps.build]
 * @param {(opts: object) => {result: Promise<object>, cancel: Function}} deps.request
 * @param {() => (Function|undefined)} [deps.getCheckWords] read when a run starts, not when this is created
 * @param {(model?: string) => {maxChars: number, maxLines: number}} [deps.getBudget]
 * @param {(project: object) => boolean} [deps.dashDialogue]
 * @returns {(args: {text, range, chapterId, model, onProgress, signal}) =>
 *   Promise<{ok: boolean, changes: Array, baseText: string, note: string, reasonText: string|null, logMeta: object}>}
 */
function createProofreadSelection(deps) {
  return async function proofreadSelection({ text, range, chapterId, model, onProgress, signal } = {}) {
    const project = typeof deps.getProject === 'function' ? deps.getProject() : null;
    const changes = [];

    const result = await runProofread({
      text,
      options: {
        ...((project && project.proofread) || {}),
        keepNote: (project && project.keepNote) || '',
        dashDialogue: typeof deps.dashDialogue === 'function' ? deps.dashDialogue(project) === true : false,
        range
      },
      budget: typeof deps.getBudget === 'function' ? deps.getBudget(model) : undefined,
      deps: deps.textDeps,
      meta: { chapterId },
      build: typeof deps.build === 'function' ? (task) => deps.build(task, { chapterId, text, model }) : undefined,
      request: (opts) => deps.request(model ? { ...opts, model } : opts),
      checkWords: typeof deps.getCheckWords === 'function' ? deps.getCheckWords() : undefined,
      signal,
      onProgress,
      onBatch: (batch) => {
        changes.push(...batch.changes);
      }
    });

    let logMeta;
    if (changes.length > 0) {
      // What the changes share: the first one's meta without its own line and dialogue flag
      logMeta = { ...changes[0].meta };
      delete logMeta.line;
      delete logMeta.dialogue;
    } else {
      logMeta = {
        source: 'faust',
        action: ACTION,
        actionLabel: ACTION_LABEL,
        instruction: '',
        provider: null,
        model: result.model,
        requestLogId: null,
        runId: result.runId
      };
    }

    let reasonText = null;
    let ok = result.status === 'done';
    if (result.status === 'stopped') reasonText = STOPPED_TEXT;
    else if (result.status === 'failed') reasonText = result.error;

    // Nothing proposed because every answer was not accepted: say why (contracts 8.3)
    const rejected = result.failedBatches.filter(failure => failure.message);
    if (ok && changes.length === 0 && result.linesSent > 0 && rejected.length > 0
      && result.setAside.length === result.linesSent && result.setAside.every(entry => entry.reason === 'truncated')) {
      ok = false;
      reasonText = rejected[rejected.length - 1].message;
    }

    return {
      ok,
      changes,
      // The changes are offsets in the text that was given
      baseText: result.baseText,
      note: summaryLine(result),
      reasonText,
      logMeta
    };
  };
}

module.exports = {
  PROOFREAD_DEFAULTS,
  PROOFREAD_ROLE,
  proofreadRules,
  EXPLAIN_SYSTEM,
  proofBudget,
  selectProofLines,
  formatBatch,
  proofreadTask,
  renderProofreadRequest,
  answerTokensForBatch,
  parseNumberedLines,
  alignBatch,
  reviseLine,
  locateLines,
  guardChanges,
  runProofread,
  buildExplainRequest,
  explainChange,
  summaryLine,
  meetsProofreadThreshold,
  modelNote,
  createProofreadSelection
};

/**
 * Context builder: the one place that assembles a request for a model
 *
 * Every new AI feature passes a task (role, rules, working text, the author's
 * instruction) and gets back the system text, the user message and a list of
 * parts with their sizes. The builder adds the language rule, the book's own
 * fields, the Tarinakansio entries, the summaries of earlier chapters and the
 * text around the working text. It spends the prompt budget of the model in a
 * fixed, visible drop order, strips [TODO: …] notes from everything the model
 * only reads, and refuses a chapter marked "Ei tekoälylle".
 *
 * What stays the same from one request to the next is in the system text;
 * what changes with the place and the request comes last.
 *
 * Pure functions, no DOM (test/services/contextBuilder.test.js).
 */

const { folderName, selectForContext, formatEntry, normalizeCodex } = require('../story/codex.js');
const { parseTerm, parseTermList, todoRanges } = require('../../editor/termMatch.js');

// While a model's characters per token are not measured from its own usage,
// only this share of the budget is spent (2.7 × 0.9 is under the lowest
// rate the gateway reported for Finnish)
const UNCALIBRATED_MARGIN = 0.9;

// false ships Tarinakansio without mention detection: "Kun mainitaan" then
// behaves like "Vain käsin"
const MENTION_DETECTION = true;

const FALLBACK_CHARS_PER_TOKEN = 2.7;
const FALLBACK_BUDGET_TOKENS = 5000;
const SUMMARY_MAX_CHARS = 600;
const CHAPTER_SUMMARY_MAX_CHARS = 1200;

// What is nearest to the cursor and what the author wrote as a rule survive
// longest; what was retrieved from elsewhere goes first
const DROP_ORDER = [
  'summaries', 'chapterSummary', 'after', 'codexMentioned', 'before',
  'codexAlways', 'codexManual', 'names', 'avoid', 'brief', 'style'
];

const LANGUAGE_RULES = {
  fi: 'Kirjoita ja vastaa suomeksi.',
  en: 'Write and answer in English.'
};

// The one wording for a blocked chapter
const MESSAGES = {
  noAI: 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.'
};

const STANDARD_PARTS = ['style', 'brief', 'avoid', 'codexAlways', 'codexMentioned', 'summaries', 'before', 'after'];
const STANDARD_LIMITS = { before: 6000, after: 1500, summaries: 3000 };

// The input tag of an edit is "valinta", not "teksti": the answer of an edit
// comes back inside <teksti> tags and the two must not be confused
const TASK_PROFILES = {
  edit: {
    role: 'Olet kirjailijan toimittaja. Muokkaat vain annettua tekstiä kirjailijan ohjeen mukaan.',
    parts: STANDARD_PARTS,
    limits: STANDARD_LIMITS,
    payloadTag: 'valinta',
    payloadLabel: 'valinta'
  },
  write: {
    role: 'Olet kirjailijan kirjoitusapuri. Jatkat tekstiä kirjailijan omalla äänellä.',
    parts: ['style', 'brief', 'avoid', 'codexAlways', 'codexMentioned', 'summaries', 'chapterSummary', 'before', 'after'],
    limits: { before: 12000, after: 1500, summaries: 6000 },
    payloadTag: null,
    payloadLabel: null
  },
  proofread: {
    role: 'Olet suomen kielen kielenhuoltaja. Korjaat vain virheet etkä muuta tyyliä.',
    parts: ['style', 'names', 'before'],
    limits: { before: 600 },
    payloadTag: 'kappaleet',
    payloadLabel: 'kappaleet'
  },
  review: {
    role: 'Olet kustannustoimittaja. Luet tekstin ja raportoit havaintosi.',
    parts: ['style', 'brief', 'avoid', 'codexAlways', 'codexMentioned', 'summaries'],
    limits: { summaries: 6000 },
    payloadTag: 'luku',
    payloadLabel: 'luku'
  },
  custom: {
    role: 'Olet kirjailijan avustaja.',
    parts: STANDARD_PARTS,
    limits: STANDARD_LIMITS,
    payloadTag: 'aineisto',
    payloadLabel: 'teksti'
  }
};

// Where each optional part goes, and in which order
const SYSTEM_PARTS = ['style', 'brief', 'avoid', 'codexAlways', 'names'];
const USER_PARTS_BEFORE_PAYLOAD = ['summaries', 'chapterSummary', 'codexMentioned', 'codexManual', 'before'];
const OPTIONAL_PARTS_BEFORE_PAYLOAD = [...SYSTEM_PARTS, ...USER_PARTS_BEFORE_PAYLOAD];

const PART_TAGS = {
  style: 'tyyliohje',
  brief: 'kirjan_ydin',
  avoid: 'valtettavat_sanat',
  codexAlways: 'tarinakansio',
  names: 'erisnimet',
  summaries: 'aiemmat_luvut',
  chapterSummary: 'luvun_tiivistelma',
  codexMentioned: 'tarinakansio_mainitut',
  codexManual: 'tarinakansio_lisatyt',
  before: 'edeltava_teksti',
  after: 'seuraava_teksti'
};

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const asText = (value) => (typeof value === 'string' ? value : '');

// STUB(src/services/format.fi.js#formatCount): replaced at I-02
function formatCount(n) {
  const value = typeof n === 'number' ? n : Number.NaN;
  if (!Number.isFinite(value) || value < 0) return '0';
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

// ---------------------------------------------------------------------------
// Chapters and summaries
// ---------------------------------------------------------------------------

// Every item of the structure in document order, children after their parent
function allItems(project) {
  const items = [];
  const walk = (list) => {
    for (const item of Array.isArray(list) ? list : []) {
      if (!isRecord(item)) continue;
      items.push(item);
      walk(item.children);
    }
  };
  walk(project && project.structure);
  return items;
}

// A folder without text of its own is a heading, not a chapter
const isChapter = (item) => item.type !== 'folder' || asText(item.content).trim() !== '';

/** The chapters in reading order: children walked, a folder without text skipped. */
function chaptersInOrder(project) {
  return allItems(project).filter(isChapter);
}

/** True only when that chapter is marked "Ei tekoälylle". */
function isChapterBlocked(project, chapterId) {
  const chapter = allItems(project).find(item => item.id === chapterId);
  return Boolean(chapter && chapter.noAI === true);
}

/** The one place that decides which summary field is read. */
function readSummary(chapter) {
  for (const field of ['synopsis', 'synopsisManual', 'synopsisAI']) {
    const value = chapter ? asText(chapter[field]).trim() : '';
    if (value) return value;
  }
  return '';
}

/** Repair the context fields of a loaded project file. */
function normalizeContextFields(data) {
  const source = isRecord(data) ? data : {};
  const strings = (value) => (Array.isArray(value) ? value.filter(item => typeof item === 'string') : []);
  return {
    brief: asText(source.brief),
    style: asText(source.style),
    avoidWords: typeof source.avoidWords === 'string' ? parseTermList(source.avoidWords) : strings(source.avoidWords),
    codex: normalizeCodex(source.codex),
    codexLegacyHandled: strings(source.codexLegacyHandled)
  };
}

// ---------------------------------------------------------------------------
// Read-only text: notes out, cuts at line boundaries
// ---------------------------------------------------------------------------

const TODO_PATTERN = /\[TODO:[^\]\n]*\]/g;

// Join the text on both sides of a removed note without leaving a gap:
// "Hän tuli. | Ovi kävi." keeps one space, "– Niin |, hän sanoi." loses the
// space before the comma, and a note at the line start takes its space with it
function joinAcrossNote(left, right) {
  if (right.startsWith(' ') && (left === '' || left.endsWith(' '))) return left + right.slice(1);
  if (left.endsWith(' ') && /^[.,;:!?…]/.test(right)) return left.slice(0, -1) + right;
  return left + right;
}

/**
 * Remove [TODO: …] notes from text a model only reads. A line that held only
 * notes goes away; a blank line stays; an unclosed note is not a note.
 */
function stripTodos(text) {
  if (!text) return '';

  const lines = [];
  for (const line of String(text).split('\n')) {
    TODO_PATTERN.lastIndex = 0;
    let cleaned = '';
    let last = 0;
    let found = false;
    let match;
    while ((match = TODO_PATTERN.exec(line)) !== null) {
      const piece = line.slice(last, match.index);
      cleaned = found ? joinAcrossNote(cleaned, piece) : piece;
      found = true;
      last = match.index + match[0].length;
    }

    if (!found) {
      lines.push(line);
      continue;
    }
    cleaned = joinAcrossNote(cleaned, line.slice(last)).trimEnd();
    if (cleaned.trim()) lines.push(cleaned);
  }
  return lines.join('\n');
}

const trimBlankLines = (text) => text.replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '');

const SENTENCE_START = /[.!?…]["”»)]?\s+(?=\S)/gu;
const WORD_START = /\s+(?=\S)/g;
const SENTENCE_END = /[.!?…]["”»)]?(?=\s)/gu;
const WORD_END = /\S(?=\s)/g;

// First place at or after `from` where the pattern ends (a sentence or word starts there)
function firstStartFrom(line, from, pattern) {
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const start = match.index + match[0].length;
    if (start >= from) return start;
  }
  return null;
}

// Last place at or before `until` where the pattern ends (a sentence or word ends there)
function lastEndUntil(line, until, pattern) {
  pattern.lastIndex = 0;
  let found = null;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const end = match.index + match[0].length;
    if (end > until) break;
    found = end;
  }
  return found;
}

/**
 * The end of a text in at most maxChars characters, as whole lines. A line is
 * never split while a whole line fits, so a dialogue line keeps its dash.
 * When not even the last line fits, it starts at a sentence or else at a word
 * and gets "… " in front.
 */
function tailLines(text, maxChars) {
  const value = trimBlankLines(String(text || ''));
  const max = Math.floor(Number(maxChars) || 0);
  if (max <= 0 || !value.trim()) return '';
  if (value.length <= max) return value;

  const lineBreak = value.indexOf('\n', value.length - max - 1);
  if (lineBreak !== -1) {
    const rest = trimBlankLines(value.slice(lineBreak + 1));
    if (rest.trim()) return rest;
  }

  if (max < 3) return '';
  const lastLine = value.slice(value.lastIndexOf('\n') + 1);
  const from = lastLine.length - (max - 2);
  let start = firstStartFrom(lastLine, from, SENTENCE_START);
  if (start === null) start = firstStartFrom(lastLine, from, WORD_START);
  return start === null ? '' : `… ${lastLine.slice(start)}`;
}

/**
 * The start of a text in at most maxChars characters, as whole lines. An
 * over-long first line is cut after its last sentence that fits, or else
 * after a word, and gets " …" at the end.
 */
function headLines(text, maxChars) {
  const value = trimBlankLines(String(text || ''));
  const max = Math.floor(Number(maxChars) || 0);
  if (max <= 0 || !value.trim()) return '';
  if (value.length <= max) return value;

  const lineBreak = value.lastIndexOf('\n', max);
  if (lineBreak > 0) {
    const rest = trimBlankLines(value.slice(0, lineBreak));
    if (rest.trim()) return rest;
  }

  if (max < 3) return '';
  const firstBreak = value.indexOf('\n');
  const firstLine = firstBreak === -1 ? value : value.slice(0, firstBreak);
  let end = lastEndUntil(firstLine, max - 2, SENTENCE_END);
  if (end === null) end = lastEndUntil(firstLine, max - 2, WORD_END);
  return end === null ? '' : `${firstLine.slice(0, end)} …`;
}

// A summary as one line without notes
const summaryLine = (chapter) => stripTodos(readSummary(chapter)).replace(/\s*\n\s*/g, ' ').trim();

// Chapter numbers as ranges: 1–3, 5–7
function numberRanges(numbers) {
  const ranges = [];
  let first = null;
  let previous = null;
  const close = () => {
    if (first !== null) ranges.push(first === previous ? String(first) : `${first}–${previous}`);
  };
  for (const number of numbers) {
    if (first !== null && number === previous + 1) {
      previous = number;
      continue;
    }
    close();
    first = number;
    previous = number;
  }
  close();
  return ranges.join(', ');
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

const block = (tag, text) => `<${tag}>\n${text}\n</${tag}>`;
const itemsText = (items) => items.map(item => item.text).join('\n');

function languageRule(code) {
  return has(LANGUAGE_RULES, code) ? LANGUAGE_RULES[code] : `Kirjoita ja vastaa tällä kielellä: ${code}.`;
}

// What the caller's budget object means in characters
function readBudget(budget, overheadChars) {
  const given = isRecord(budget) ? budget : {};
  // Anything that is not a number counts as not given
  const number = (value) => (typeof value === 'number' && !Number.isNaN(value) ? value : undefined);
  const charsPerToken = number(given.charsPerToken) > 0 ? given.charsPerToken : FALLBACK_CHARS_PER_TOKEN;
  const promptBudgetChars = number(given.promptBudgetChars)
    ?? Math.round((number(given.promptBudgetTokens) ?? FALLBACK_BUDGET_TOKENS) * charsPerToken);
  const margin = given.calibrated === true ? 1 : UNCALIBRATED_MARGIN;
  const budgetChars = Math.max(0, Math.floor(promptBudgetChars * margin) - (Number(overheadChars) || 0));
  return { charsPerToken, budgetChars, budgetTokens: Math.round(budgetChars / charsPerToken) };
}

// The profile's limits with the task's own on top; a value that is not a size is ignored
function readLimits(profile, given) {
  const limits = { ...STANDARD_LIMITS, ...profile.limits };
  if (isRecord(given)) {
    for (const key of Object.keys(limits)) {
      if (typeof given[key] === 'number' && given[key] >= 0) limits[key] = given[key];
    }
  }
  return limits;
}

// Selection as { start, end }, or the cursor as an empty range; clamped to the text
function readRange(selection, cursor, length) {
  const clamp = (value) => Math.max(0, Math.min(length, Math.round(value)));
  if (isRecord(selection)) {
    const a = selection.start ?? selection.from;
    const b = selection.end ?? selection.to ?? a;
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { start: clamp(Math.min(a, b)), end: clamp(Math.max(a, b)) };
    }
  }
  const at = Number.isFinite(cursor) ? clamp(cursor) : length;
  return { start: at, end: at };
}

// The text before and after the range. A note that the range cuts in two is
// left out whole, so that half a note is never sent.
function surroundingText(content, range) {
  let beforeEnd = range.start;
  let afterStart = range.end;
  for (const note of todoRanges(content)) {
    if (note.start < beforeEnd && beforeEnd < note.end) beforeEnd = note.start;
    if (note.start < afterStart && afterStart < note.end) afterStart = note.end;
  }
  return {
    before: trimBlankLines(stripTodos(content.slice(0, beforeEnd))),
    after: trimBlankLines(stripTodos(content.slice(afterStart)))
  };
}

// The avoid list as the model reads it: quotation marks of exact items removed
function avoidItems(value) {
  const raw = typeof value === 'string' ? parseTermList(value) : Array.isArray(value) ? value : [];
  const seen = new Set();
  const items = [];
  for (const item of raw) {
    const term = parseTerm(item);
    if (!term || seen.has(term.text)) continue;
    seen.add(term.text);
    items.push(term.text);
  }
  return items;
}

/**
 * Assemble one request.
 *
 * task: an id ('edit', 'write', 'proofread', 'review', 'custom') or an object
 *   { id, role?, rules?, instruction?, payload?, payloadTag?, payloadLabel?,
 *     parts?, limits?, overheadChars? }. The payload is never changed here: a
 *   caller that edits text passes it already masked.
 * text: the chapter's live text (defaults to the stored content).
 * selection: { start, end } or { from, to }; cursor: used without a selection.
 *   Offsets are offsets in the text with \n line breaks.
 * budget: what aiClient.budgetFor returns.
 * exclude: part ids and item keys ('codex:<id>', 'summary:<chapterId>').
 * include: 'codex:<id>' keys the author added by hand.
 *
 * @returns Built: { system, messages, parts, totalChars, totalTokens,
 *   budgetTokens, charsPerToken, overBudget, blocked, dropped, language }
 */
function buildContext({
  task, project, chapterId, text, cursor = null, selection = null, budget = {}, exclude = [], include = []
} = {}) {
  const spec = typeof task === 'string' ? { id: task } : (isRecord(task) ? task : {});
  const profile = has(TASK_PROFILES, spec.id) ? TASK_PROFILES[spec.id] : TASK_PROFILES.custom;
  const limits = readLimits(profile, spec.limits);
  const wanted = new Set(Array.isArray(spec.parts) ? spec.parts : profile.parts);
  const excluded = new Set(Array.isArray(exclude) ? exclude : []);
  const language = asText(project && project.language).trim() || 'fi';
  const folder = folderName(project);

  const { charsPerToken, budgetChars, budgetTokens } = readBudget(budget, spec.overheadChars);
  const tokens = (chars) => Math.ceil(chars / charsPerToken);
  const empty = {
    system: '',
    messages: [],
    parts: [],
    totalChars: 0,
    totalTokens: 0,
    budgetTokens,
    charsPerToken,
    overBudget: false,
    blocked: null,
    dropped: [],
    language
  };

  const items = allItems(project);
  const chapter = items.find(item => item.id === chapterId);
  if (!chapter) return { ...empty, blocked: 'no-chapter' };
  if (chapter.noAI === true) return { ...empty, blocked: 'noAI' };

  // --- The fixed parts: rules, working text, the author's instruction ---

  const content = (typeof text === 'string' ? text : asText(chapter.content)).replace(/\r\n?/g, '\n');
  const range = readRange(selection, cursor, content.length);

  // A payload without a tag to put it in (a write task that was given one) uses the neutral tag
  let payloadTag = spec.payloadTag !== undefined ? spec.payloadTag : profile.payloadTag;
  let payloadLabel = spec.payloadLabel || profile.payloadLabel;
  if (spec.payloadTag === undefined && !payloadTag && asText(spec.payload)) {
    payloadTag = TASK_PROFILES.custom.payloadTag;
  }
  if (payloadTag && !payloadLabel) payloadLabel = TASK_PROFILES.custom.payloadLabel;
  const payload = payloadTag
    ? (typeof spec.payload === 'string' ? spec.payload : content.slice(range.start, range.end))
    : '';

  const instruction = asText(spec.instruction).trim();
  const rules = Array.isArray(spec.rules) ? spec.rules.filter(rule => typeof rule === 'string' && rule !== '') : [];
  const head = [asText(spec.role).trim() || profile.role, languageRule(language), ...rules].join('\n');

  // --- The optional parts ---
  // items: what is included now; full: the size before the limit and budget
  // cuts; shrink: how the part gives way when the budget runs out

  const parts = {};
  const addPart = (id, where, label, included, full, shrink, extra = {}) => {
    const off = excluded.has(id);
    parts[id] = { id, where, label, items: off ? [] : included, full, shrink, state: off ? 'excluded' : 'sent', ...extra };
  };
  const whole = (id, where, label, value) => {
    addPart(id, where, label, [{ key: id, label, text: value }], value.length, 'whole');
  };

  const style = asText(project.style).trim();
  if (wanted.has('style') && style) whole('style', 'system', 'tyyliohje', style);

  const brief = asText(project.brief).trim();
  if (wanted.has('brief') && brief) whole('brief', 'system', 'käsikirjoituksen ydin', brief);

  const avoid = avoidItems(project.avoidWords);
  if (wanted.has('avoid') && avoid.length > 0) {
    whole('avoid', 'system', 'vältettävät sanat', `Älä käytä näitä sanoja tai ilmauksia: ${avoid.join(', ')}`);
  }

  const around = wanted.has('before') || wanted.has('after') ? surroundingText(content, range) : { before: '', after: '' };
  const before = wanted.has('before') ? tailLines(around.before, limits.before) : '';
  const after = wanted.has('after') ? headLines(around.after, limits.after) : '';
  if (before) {
    addPart('before', 'user', 'teksti ennen', [{ key: 'before', label: 'teksti ennen', text: before }], around.before.length, 'tail');
  }
  if (after) {
    addPart('after', 'user', 'teksti jälkeen', [{ key: 'after', label: 'teksti jälkeen', text: after }], around.after.length, 'head');
  }

  // Mentions are looked for in what is being sent, as capped by the limits
  // and before any budget cut; an excluded part is not searched
  const searched = [payload, excluded.has('before') ? '' : before, excluded.has('after') ? '' : after, instruction].join('\n');
  const chosen = selectForContext({
    entries: Array.isArray(project.codex) ? project.codex : [],
    text: searched,
    include: Array.isArray(include) ? include : [],
    exclude: Array.from(excluded),
    detectMentions: MENTION_DETECTION
  });
  const entryItems = (entries) => entries.map(entry => ({
    key: `codex:${entry.id}`,
    label: entry.name.trim(),
    text: formatEntry(entry)
  }));
  const addEntries = (id, where, label, entries) => {
    const included = entryItems(entries);
    addPart(id, where, label, included, itemsText(included).length, 'last');
  };
  if (wanted.has('codexAlways') && chosen.always.length > 0) {
    addEntries('codexAlways', 'system', `${folder}: aina mukana`, chosen.always);
  }
  if (wanted.has('codexMentioned') && chosen.mentioned.length > 0) {
    addEntries('codexMentioned', 'user', `${folder}: mainitut`, chosen.mentioned);
  }
  // Entries the author added by hand for this request go out with any task
  if (chosen.manual.length > 0) {
    addEntries('codexManual', 'user', `${folder}: käsin lisätyt`, chosen.manual);
  }

  if (wanted.has('names')) {
    const names = [...chosen.always, ...chosen.mentioned, ...chosen.manual].map(entry => entry.name.trim());
    if (names.length > 0) whole('names', 'system', 'erisnimet', `Erisnimet ja termit, joita ei korjata: ${names.join(', ')}`);
  }

  if (wanted.has('summaries') && limits.summaries > 0) {
    const earlier = [];
    for (const item of items) {
      if (item === chapter) break;
      if (isChapter(item)) earlier.push(item);
    }

    const lines = [];
    const skippedNoAI = [];
    earlier.forEach((item, index) => {
      const number = index + 1;
      // A protected chapter contributes neither its text nor its summary
      if (item.noAI === true) {
        skippedNoAI.push(number);
        return;
      }
      const summary = headLines(summaryLine(item), SUMMARY_MAX_CHARS);
      if (!summary || excluded.has(`summary:${item.id}`)) return;
      const title = asText(item.title).trim();
      const label = title ? `Luku ${number}: ${title}` : `Luku ${number}`;
      lines.push({ key: `summary:${item.id}`, label, number, text: `${label} – ${summary}` });
    });

    if (lines.length > 0) {
      // Over the limit the oldest chapters are left out first
      const kept = lines.slice();
      while (kept.length > 0 && itemsText(kept).length > limits.summaries) kept.shift();
      addPart('summaries', 'user', 'tiivistelmät', kept, itemsText(lines).length, 'first', { skippedNoAI });
      if (parts.summaries.state === 'sent' && kept.length < lines.length) {
        parts.summaries.state = kept.length > 0 ? 'cut' : 'dropped';
      }
    }
  }

  if (wanted.has('chapterSummary')) {
    const own = headLines(summaryLine(chapter), CHAPTER_SUMMARY_MAX_CHARS);
    if (own) whole('chapterSummary', 'user', 'luvun tiivistelmä', own);
  }

  // --- Layout ---

  const partBlock = (id) => (parts[id] && parts[id].items.length > 0 ? [block(PART_TAGS[id], itemsText(parts[id].items))] : []);
  const render = () => {
    const system = [head, ...SYSTEM_PARTS.flatMap(partBlock)];
    const user = USER_PARTS_BEFORE_PAYLOAD.flatMap(partBlock);
    if (payloadTag && payload) user.push(block(payloadTag, payload));
    user.push(...partBlock('after'));
    if (instruction) user.push(block('ohje', instruction));
    return { system: system.join('\n\n'), user: user.join('\n\n') };
  };

  // --- Budget ---

  let out = render();
  const size = () => out.system.length + out.user.length;
  const dropped = [];

  // Rules, working text and instruction are never dropped. When they alone do
  // not fit, nothing else is sent either and the caller must not send.
  const saved = {};
  for (const id of Object.keys(parts)) {
    saved[id] = parts[id].items;
    parts[id].items = [];
  }
  const fixed = render();
  for (const id of Object.keys(parts)) parts[id].items = saved[id];
  const overBudget = fixed.system.length + fixed.user.length > budgetChars;

  if (overBudget) {
    for (const id of DROP_ORDER) {
      const part = parts[id];
      if (!part || part.items.length === 0) continue;
      part.items = [];
      part.state = 'dropped';
      dropped.push(id);
    }
    out = render();
  } else {
    for (const id of DROP_ORDER) {
      if (size() <= budgetChars) break;
      const part = parts[id];
      if (!part || part.items.length === 0) continue;

      while (size() > budgetChars && part.items.length > 0) {
        if (part.shrink === 'head' || part.shrink === 'tail') {
          // The lines farthest from the working text go first
          const current = part.items[0].text;
          const room = current.length - (size() - budgetChars);
          const shorter = part.shrink === 'tail' ? tailLines(current, room) : headLines(current, room);
          part.items = shorter && shorter.length < current.length ? [{ ...part.items[0], text: shorter }] : [];
        } else if (part.shrink === 'first') {
          part.items = part.items.slice(1);
        } else if (part.shrink === 'last') {
          part.items = part.items.slice(0, -1);
        } else {
          // Half a style guide is worse than a visible "ei mahtunut"
          part.items = [];
        }
        part.state = part.items.length > 0 ? 'cut' : 'dropped';
        out = render();
      }
      dropped.push(id);
    }
  }

  // --- Result ---

  const list = [];
  const push = (id, label, where, value, fullChars, state, locked, extra = {}) => {
    list.push({ id, label, where, text: value, chars: value.length, tokens: tokens(value.length), fullChars, state, locked, ...extra });
  };
  const pushPart = (id) => {
    const part = parts[id];
    if (!part) return;

    let label = part.label;
    const extra = {};
    if (part.shrink === 'first' || part.shrink === 'last') {
      extra.items = part.items.map(item => ({ key: item.key, label: item.label, chars: item.text.length, text: item.text }));
    }
    if (id === 'summaries') {
      if (part.items.length > 0) label = `${label} ${numberRanges(part.items.map(item => item.number))}`;
      extra.skippedNoAI = part.skippedNoAI;
    }
    push(id, label, part.where, itemsText(part.items), part.full, part.state, false, extra);
  };

  push('task', 'tehtävän säännöt', 'system', head, head.length, 'sent', true);
  OPTIONAL_PARTS_BEFORE_PAYLOAD.forEach(pushPart);
  if (payloadTag) push('payload', payloadLabel, 'user', payload, payload.length, payload ? 'sent' : 'empty', true);
  pushPart('after');
  if (instruction) push('instruction', 'oma ohje', 'user', instruction, instruction.length, 'sent', true);

  const totalChars = size();
  return {
    ...empty,
    system: out.system,
    messages: out.user ? [{ role: 'user', content: out.user }] : [],
    parts: list,
    totalChars,
    totalTokens: tokens(totalChars),
    overBudget,
    blocked: out.user ? null : 'empty',
    dropped
  };
}

/**
 * The "Mitä malli näkee" row as text. The numbers of the line are
 * characters; the total is an estimate in tokens.
 * @returns {{ line: string, total: string, dropped: string }}
 */
function describeParts(built, folder = 'Tarinakansio') {
  const list = built && Array.isArray(built.parts) ? built.parts : [];
  const byId = {};
  for (const part of list) byId[part.id] = part;

  const sentChars = (id) => {
    const part = byId[id];
    return part && (part.state === 'sent' || part.state === 'cut') ? part.chars : 0;
  };
  const sum = (ids) => ids.reduce((total, id) => total + sentChars(id), 0);

  const segments = [];
  const segment = (label, chars) => {
    if (chars > 0) segments.push(`${label} ${formatCount(chars)}`);
  };
  const own = (id) => segment(byId[id] ? byId[id].label : '', sentChars(id));

  own('payload');
  segment('ympäröivä teksti', sum(['before', 'after']));
  own('style');
  own('brief');
  own('avoid');
  segment(folder, sum(['codexAlways', 'codexMentioned', 'codexManual']));
  own('names');
  own('summaries');
  own('chapterSummary');
  own('instruction');

  const missing = list
    .filter(part => part.state === 'dropped' || part.state === 'cut')
    .map(part => (part.state === 'cut' ? `${part.label} (osa)` : part.label));

  return {
    line: `Lähetetään: ${segments.join(' · ')}`.trimEnd(),
    total: `noin ${formatCount(built ? built.totalTokens : 0)} / ${formatCount(built ? built.budgetTokens : 0)} tokenia`,
    dropped: missing.length > 0 ? `Ei mahtunut: ${missing.join(', ')}` : ''
  };
}

module.exports = {
  buildContext,
  describeParts,
  isChapterBlocked,
  chaptersInOrder,
  readSummary,
  normalizeContextFields,
  stripTodos,
  tailLines,
  headLines,
  DROP_ORDER,
  TASK_PROFILES,
  LANGUAGE_RULES,
  UNCALIBRATED_MARGIN,
  MENTION_DETECTION,
  MESSAGES
};

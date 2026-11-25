/**
 * One review check from request to findings
 *
 * A model check sends the text in batches, each with one instruction, and
 * reads the answer as findings in a fixed line format (LAINAUS, HUOMIO, …).
 * A finding is placed in the text by its quote: positions reported by a model
 * are never used, the format does not even ask for them. An answer that
 * cannot be read is a failed call, never "no findings".
 *
 * Functions of the text modules and of the request layer arrive as arguments,
 * so this file needs nothing but plainView (test/services/reviewPass.test.js).
 * "Raw" is the chapter text as stored, "plain" the text of plainView.
 */

const { plainView } = require('../../editor/plainView.js');

const REVIEW = Object.freeze({
  // The visible answer: the list of findings
  ANSWER_TOKENS: 1500,
  CONTINUITY_ANSWER_TOKENS: 2000,
  FEEDBACK_ANSWER_TOKENS: 2000,
  // A reasoning model reads the whole batch before its first word. The model's
  // own Päättelyvara (2 000 by default) is sized for short tasks: on a full
  // batch of 8 927 characters the default model used 8 978 tokens in all
  // (25 Nov 2026), and with 1 500 + 2 000 the answer was cut. A check reserves
  // this much more, but never more than this share of what the model's window
  // leaves for the prompt, so that a small window still has room for text.
  REASONING_TOKENS: 10000,
  REASONING_SHARE: 0.5,
  BATCH_MAX_CHARS: 9000,
  BATCH_MIN_CHARS: 1200,
  CONTINUITY_BATCH_MAX_CHARS: 6000,
  // The reading feedback wants the whole chapter in one request
  FEEDBACK_BATCH_MAX_CHARS: 60000,
  BATCH_MAX_LINES: 80,
  MAX_PER_BATCH: 12, // asked of the model
  FEEDBACK_MAX_FINDINGS: 10,
  MAX_PARSED: 40, // accepted from one answer
  NOTE_MAX_CHARS: 1000, // "Tahallista / huomioi"
  CONTINUITY_SUMMARY_CHARS: 6000,
  FEEDBACK_SUMMARY_CHARS: 3000,
  CONTEXT_CHARS: 32,
  MIN_QUOTE_CHARS: 2,
  GAP_MAX_CHARS: 600,
  TAIL_MAX_DROP: 3,
  TAIL_MIN_WORDS: 4,
  STOP_AFTER_FAILURES: 2,
  ANSWER_SAMPLE_CHARS: 300,
  FATAL_CODES: Object.freeze(['ai_off', 'no_bridge', 'no_model'])
});

// The field names a model may use. The first of each row is the one asked for.
const LABELS = Object.freeze({
  quote: Object.freeze(['LAINAUS', 'SITAATTI', 'KOHTA', 'QUOTE']),
  note: Object.freeze(['HUOMIO', 'HUOMAUTUS', 'HAVAINTO', 'ONGELMA', 'NOTE', 'COMMENT', 'ISSUE']),
  suggestion: Object.freeze(['EHDOTUS', 'KORJAUSEHDOTUS', 'KORJAUS', 'SUGGESTION', 'FIX']),
  compare: Object.freeze(['VERTAA', 'VERTAILU', 'TOINEN LAINAUS', 'COMPARE']),
  source: Object.freeze(['LÄHDE', 'LAHDE', 'SOURCE']),
  severity: Object.freeze(['VAKAVUUS', 'VAKAVUUSASTE', 'SEVERITY'])
});

const NONE_MARKERS = Object.freeze(['EI HAVAINTOJA', 'EI HUOMAUTETTAVAA', 'EI LÖYDÖKSIÄ', 'EI RISTIRIITOJA', 'NO FINDINGS']);

// The words of VAKAVUUS. 'works' is praise; the other three are concerns.
const SEVERITY_WORDS = Object.freeze({
  works: Object.freeze(['toimii', 'toimiva', 'works']),
  low: Object.freeze(['pieni', 'vähäinen', 'low', 'minor']),
  medium: Object.freeze(['keskisuuri', 'kohtalainen', 'medium']),
  high: Object.freeze(['suuri', 'vakava', 'high', 'major'])
});

// The one wording for a protected chapter (contextBuilder MESSAGES.noAI). The
// caller passes the builder's own string; this copy is for a run without one.
const NO_AI_MESSAGE = 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.';

const NO_CHAPTER_MESSAGE = 'Lukua ei löytynyt.';

const LANGUAGE_RULES = { fi: 'Kirjoita ja vastaa suomeksi.', en: 'Write and answer in English.' };

const asText = (value) => (value == null ? '' : String(value));
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

const MODEL_ROLE = 'Olet kustannustoimittaja. Luet käsikirjoituksen kohdan ja raportoit havaintosi yhdestä asiasta.';
const CONTINUITY_ROLE = 'Olet kustannustoimittaja. Vertaat käsikirjoituksen kohtaa kirjan taustatietoihin ja raportoit ristiriidat.';
const FEEDBACK_ROLE = 'Olet kustannustoimittaja. Luet käsikirjoituksen luvun kokonaan ja annat lukupalautteen.';

// Each item is one line of the system text. The lines of the format belong
// to the rule above them.
function modelRules(suggest) {
  return [
    '- Tarkista vain se asia, joka on annettu kohdassa <ohje>. Älä kommentoi mitään muuta.',
    suggest
      ? '- Jokainen havainto on kolme riviä täsmälleen tässä muodossa:'
      : '- Jokainen havainto on kaksi riviä täsmälleen tässä muodossa:',
    'LAINAUS: kohta tekstistä sanasta sanaan, enintään 25 sanaa',
    'HUOMIO: mikä kohdassa on vialla, yksi tai kaksi virkettä',
    ...(suggest ? ['EHDOTUS: lainattu kohta korjattuna, tai viiva (-), jos et ehdota uutta sanamuotoa'] : []),
    '- Lainaa vain <teksti>-osasta ja täsmälleen niin kuin se on kirjoitettu: samat sanat, sama järjestys, samat välimerkit. Älä lyhennä kolmella pisteellä äläkä yhdistä kahta kohtaa.',
    '- Jätä tyhjä rivi havaintojen väliin. Älä numeroi, älä käytä lihavointia, älä kirjoita johdantoa tai yhteenvetoa.',
    '- Älä anna arvosanaa tai pistemäärää äläkä kehu.',
    '- Jos huomautettavaa ei ole, vastaa vain: EI HAVAINTOJA',
    `- Enintään ${REVIEW.MAX_PER_BATCH} havaintoa. Valitse tärkeimmät.`,
    '- Jos ohjeessa on rivi Tahallista, kirjoittaja kertoo siinä, mikä on tarkoituksellista. Älä huomauta niistä asioista.'
  ];
}

function continuityRules() {
  return [
    '- Etsi vain ristiriitoja: kohdat, joissa <teksti> sanoo jotakin, mikä ei voi olla totta yhtä aikaa taustatietojen kanssa. Taustatietoja ovat <tarinakansio>, <tarinakansio_mainitut>, <tarinakansio_lisatyt> ja <aiemmat_luvut>. Älä kommentoi tyyliä, kieltä tai juonta.',
    '- Tieto, jota taustatiedoissa ei mainita, ei ole ristiriita. Älä arvaile.',
    '- Jokainen havainto on neljä riviä täsmälleen tässä muodossa:',
    'LAINAUS: kohta <teksti>-osasta sanasta sanaan, enintään 25 sanaa',
    'VERTAA: kohta taustatiedoista sanasta sanaan, enintään 25 sanaa',
    'LÄHDE: mistä taustatiedosta kohta on: merkinnän nimi tai Luku ja sen numero',
    'HUOMIO: mikä on ristiriidassa, yksi tai kaksi virkettä',
    '- Lainaa molemmat kohdat täsmälleen niin kuin ne on kirjoitettu: samat sanat, sama järjestys, samat välimerkit. Älä lyhennä kolmella pisteellä.',
    '- Jätä tyhjä rivi havaintojen väliin. Älä numeroi, älä käytä lihavointia, älä kirjoita johdantoa tai yhteenvetoa.',
    '- Jos ristiriitoja ei ole, vastaa vain: EI HAVAINTOJA',
    `- Enintään ${REVIEW.MAX_PER_BATCH} havaintoa. Valitse selvimmät.`,
    '- Jos ohjeessa on rivi Tahallista, kirjoittaja kertoo siinä, mikä on tarkoituksellista. Älä huomauta niistä asioista.'
  ];
}

function feedbackRules() {
  return [
    '- Anna palaute vain tästä tekstistä. Älä kirjoita tekstiä uudelleen äläkä ehdota uusia sanamuotoja.',
    '- Jokainen havainto on kolme riviä täsmälleen tässä muodossa:',
    'LAINAUS: kohta tekstistä sanasta sanaan, enintään 25 sanaa',
    'HUOMIO: mitä lukija tässä kokee ja miksi, yksi tai kaksi virkettä',
    'VAKAVUUS: toimii, pieni, keskisuuri tai suuri',
    '- Kirjoita VAKAVUUS: toimii, kun kohta on onnistunut. Muut arvot ovat huolia sen mukaan, kuinka paljon kohta haittaa lukijaa.',
    '- Lainaa vain <teksti>-osasta ja täsmälleen niin kuin se on kirjoitettu: samat sanat, sama järjestys, samat välimerkit. Älä lyhennä kolmella pisteellä äläkä yhdistä kahta kohtaa.',
    '- Jätä tyhjä rivi havaintojen väliin. Älä numeroi, älä käytä lihavointia, älä kirjoita johdantoa tai yhteenvetoa.',
    '- Älä anna arvosanaa tai pistemäärää.',
    '- Jos sanottavaa ei ole, vastaa vain: EI HAVAINTOJA',
    `- Enintään ${REVIEW.FEEDBACK_MAX_FINDINGS} havaintoa: ensin kaksi tai kolme, jotka toimivat, sitten huolet tärkeimmästä alkaen.`,
    '- Jos ohjeessa on rivi Tahallista, kirjoittaja kertoo siinä, mikä on tarkoituksellista. Älä pidä niitä huolina.'
  ];
}

// The author's "Tahallista / huomioi" text as one line of the instruction
function cleanNote(note) {
  return asText(note).trim().replace(/\s*[\r\n]+\s*/g, ' ').slice(0, REVIEW.NOTE_MAX_CHARS);
}

const isContinuity = (check) => !!check && check.kind === 'continuity';
const isFeedback = (check) => !!check && check.feedback === true;

/**
 * The task object of the context builder for one check: role and rules go to
 * the system text, the batch into <teksti>, the instruction into <ohje>.
 * The prompt is Finnish for every project language; the builder's language
 * rule decides the language of the answer.
 * @param {{check: object, note?: string}} input
 * @returns {{id: 'review', role: string, rules: string[], instruction: string, payloadTag: 'teksti',
 *   payloadLabel: string, parts: string[], limits?: {summaries: number}, answerTokens: number}}
 */
function buildReviewTask({ check, note } = {}) {
  const given = check || {};
  const kept = cleanNote(note);
  let instruction = `Tarkistus: ${asText(given.label)}\n${asText(given.instruction)}`;
  if (kept) instruction += `\n\nTahallista: ${kept}`;

  const task = { id: 'review', payloadTag: 'teksti', payloadLabel: 'tarkistettava teksti', instruction };

  if (isContinuity(given)) {
    // Entries added by hand in the "Mitä malli näkee" row arrive through the builder's include
    return {
      ...task,
      role: CONTINUITY_ROLE,
      rules: continuityRules(),
      parts: ['codexAlways', 'codexMentioned', 'summaries'],
      limits: { summaries: REVIEW.CONTINUITY_SUMMARY_CHARS },
      answerTokens: REVIEW.CONTINUITY_ANSWER_TOKENS
    };
  }
  if (isFeedback(given)) {
    return {
      ...task,
      role: FEEDBACK_ROLE,
      rules: feedbackRules(),
      parts: ['style', 'brief', 'summaries'],
      limits: { summaries: REVIEW.FEEDBACK_SUMMARY_CHARS },
      answerTokens: REVIEW.FEEDBACK_ANSWER_TOKENS
    };
  }
  // A style check needs the author's rules, not the plot: summaries and
  // entries would be sent again with every batch for nothing
  return {
    ...task,
    role: MODEL_ROLE,
    rules: modelRules(given.suggest === true),
    parts: ['style', 'brief'],
    answerTokens: REVIEW.ANSWER_TOKENS
  };
}

/**
 * The same layout without a context builder: for tests and for running before
 * the builder is wired.
 * @returns {{system: string, messages: Array<{role: 'user', content: string}>}}
 */
function renderReviewRequest(task, payload, language = 'fi') {
  const rule = LANGUAGE_RULES[language] || LANGUAGE_RULES.fi;
  return {
    system: [task.role, rule, ...(task.rules || [])].join('\n'),
    messages: [{
      role: 'user',
      content: `<teksti>\n${asText(payload)}\n</teksti>\n\n<ohje>\n${task.instruction}\n</ohje>`
    }]
  };
}

// ---------------------------------------------------------------------------
// What is sent
// ---------------------------------------------------------------------------

/**
 * The lines of the plain text that go to the model: paragraphs and list
 * bodies. Headings, scene breaks, blank lines and > quote lines stay; a
 * selection is widened to whole lines.
 * @param {string} plainText
 * @param {{from: number, to: number}|null} range plain offsets
 * @param {object} deps needs splitBlocks and proseLines
 * @returns {Array<{n: number, from: number, to: number, text: string, kind: string}>}
 */
function selectReviewLines(plainText, range, deps) {
  return deps.proseLines(deps.splitBlocks(plainText), {
    quotes: false,
    from: range ? range.from : 0,
    to: range ? range.to : Infinity
  });
}

/**
 * Lines packed into batches. A line is never split; a line that is over the
 * limit by itself is sent alone.
 * @param {Array} lines the result of selectReviewLines
 * @param {number} maxChars
 * @param {object} deps needs batchParagraphs
 * @param {{maxLines?: number}} [options]
 * @returns {Array<{index: number, from: number, to: number, text: string, oversize: boolean}>}
 */
function planBatches(lines, maxChars, deps, options) {
  const maxLines = options && options.maxLines > 0 ? options.maxLines : REVIEW.BATCH_MAX_LINES;
  // lineOverhead 2: the blank line that joins two lines in the request
  return deps.batchParagraphs(lines, { max: maxChars, maxLines, lineOverhead: 2 }).map((batch, index) => ({
    index,
    from: batch.lines[0].from,
    to: batch.lines[batch.lines.length - 1].to,
    text: batch.lines.map(line => line.text).join('\n\n'),
    oversize: !!batch.oversize
  }));
}

/**
 * The tokens a check adds to its answer for the model's reasoning: REASONING_TOKENS,
 * or REASONING_SHARE of the prompt room the probe reports when that is less.
 * Without a reported room (a builder without a budget) the whole reserve.
 * @param {{budgetTokens?: number}} probe the request built without text, with the visible answer only
 * @returns {number}
 */
function reasoningReserve(probe) {
  if (!probe || !Number.isFinite(probe.budgetTokens)) return REVIEW.REASONING_TOKENS;
  return Math.min(REVIEW.REASONING_TOKENS, Math.floor(Math.max(0, probe.budgetTokens) * REVIEW.REASONING_SHARE));
}

/**
 * Everything that is decided before the first request. The run and the
 * panel's preview both use it, so they agree.
 * @param {object} input
 * @param {object} input.check
 * @param {string} input.text raw chapter text
 * @param {{from: number, to: number}|null} input.range raw offsets; null = the whole chapter
 * @param {string} [input.note]
 * @param {(task: object) => object} input.build the context builder bound to project and chapter
 * @param {object} input.deps needs splitBlocks, proseLines and batchParagraphs
 * @param {string} [input.noAIMessage] the builder's sentence for a protected chapter
 * @returns {{task: object, view: object, batches: Array, maxChars: number,
 *   blocked: null|{reason: string, message: string}, message: string|null}}
 *   task.answerTokens includes the reasoning reserve (reasoningReserve): every batch is built and sent with it
 */
function planReview({ check, text, range = null, note = '', build, deps, noAIMessage } = {}) {
  const view = plainView(text);
  const base = buildReviewTask({ check, note });
  const plan = { task: base, view, batches: [], maxChars: 0, blocked: null, message: null };

  // The reading feedback is always about the whole chapter
  const plainRange = range && !isFeedback(check)
    ? { from: view.toPlain(range.from), to: view.toPlain(range.to) }
    : null;
  const lines = selectReviewLines(view.text, plainRange, deps);
  if (lines.length === 0) {
    plan.blocked = { reason: 'empty', message: 'Tarkistettavaa tekstiä ei ole.' };
    return plan;
  }

  // Built once without the text: what is left of the window is the room for it
  const probe = build({ ...base, payload: '' }) || {};
  if (probe.blocked === 'noAI') {
    plan.blocked = { reason: 'noAI', message: noAIMessage || NO_AI_MESSAGE };
    return plan;
  }
  if (probe.blocked === 'no-chapter') {
    plan.blocked = { reason: 'no-chapter', message: NO_CHAPTER_MESSAGE };
    return plan;
  }

  // The reasoning reserve comes out of the same room. Every batch is built and
  // sent with it; the room is counted without the builder's uncalibrated
  // margin on the reserve, so the plan errs on the small side.
  const reserve = reasoningReserve(probe);
  plan.task = { ...base, answerTokens: base.answerTokens + reserve };

  const hasBudget = Number.isFinite(probe.budgetTokens) && probe.budgetTokens > 0
    && Number.isFinite(probe.charsPerToken) && probe.charsPerToken > 0;
  const used = Number.isFinite(probe.totalChars) ? probe.totalChars : 0;
  const available = hasBudget ? Math.floor((probe.budgetTokens - reserve) * probe.charsPerToken) - used - 40 : Infinity;

  if (isFeedback(check)) {
    plan.maxChars = clamp(available, REVIEW.BATCH_MIN_CHARS, REVIEW.FEEDBACK_BATCH_MAX_CHARS);
    // No line limit either: a chapter that fits goes out in one request
    plan.batches = planBatches(lines, plan.maxChars, deps, { maxLines: lines.length });
    if (plan.batches.length > 1) {
      plan.message = `Luku ei mahtunut yhteen pyyntöön. Palaute on annettu ${plan.batches.length} osassa, eikä malli nähnyt lukua kokonaisena.`;
    }
    return plan;
  }
  if (isContinuity(check)) {
    // The other half of the room is for the entries the batch mentions
    plan.maxChars = clamp(hasBudget ? Math.floor(available / 2) : Infinity, REVIEW.BATCH_MIN_CHARS, REVIEW.CONTINUITY_BATCH_MAX_CHARS);
  } else {
    plan.maxChars = clamp(available, REVIEW.BATCH_MIN_CHARS, REVIEW.BATCH_MAX_CHARS);
  }
  plan.batches = planBatches(lines, plan.maxChars, deps);
  return plan;
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

const FIELD_OF = new Map();
for (const [field, names] of Object.entries(LABELS)) {
  for (const name of names) FIELD_OF.set(name, field);
}
const alternation = (names) => names.map(name => name.replace(/ /g, '\\s+')).join('|');
// Longest first, so that KORJAUSEHDOTUS is not read as KORJAUS
const LABEL_NAMES = alternation(Array.from(FIELD_OF.keys()).sort((a, b) => b.length - a.length));

// Groups: 1 decoration in front of the label, 2 the label, 3 decoration
// before the colon, 4 decoration after it, 5 the value
const LABEL_LINE = new RegExp(
  '^\\s*(?:(?:[-*•+]|\\d{1,3}[.)])\\s+)?(?:#{1,6}\\s+)?([*_`]{0,3})\\s*(' + LABEL_NAMES
    + ')\\s*([*_`]{0,3})\\s*[:：]\\s*([*_`]{0,3})\\s*(.*)$',
  'iu'
);
const NONE_LINE = new RegExp(`^[\\s\\p{P}\\p{S}]*(?:${alternation(NONE_MARKERS)})[\\s\\p{P}\\p{S}]*$`, 'iu');
const NO_SUGGESTION = /^(?:[-–—‐]+|ei ehdotusta|ei muutosta|ei korjausta|n\/a|none|no suggestion)\.?$/iu;
const FENCE_LINE = /^\s*(?:```|~~~)[\w-]*\s*$/;
const THINK_BLOCK = /^\s*<(think|thinking|reasoning)>[\s\S]*?<\/\1>\s*/i;
const THINK_OPEN = /^\s*<(?:think|thinking|reasoning)>/i;

// The request layer removes reasoning in the main process; this is the second line
function stripReasoning(text) {
  let rest = text;
  while (THINK_BLOCK.test(rest)) rest = rest.replace(THINK_BLOCK, '');
  // A block that never closes: the answer was cut inside the reasoning
  return THINK_OPEN.test(rest) ? '' : rest;
}

// The first word of a VAKAVUUS value, as one of the four levels
function readSeverity(value) {
  const first = asText(value).trim().split(/\s+/)[0] || '';
  const word = first.toLowerCase().replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
  if (!word) return null;
  for (const [level, words] of Object.entries(SEVERITY_WORDS)) {
    if (words.includes(word)) return level;
  }
  return null;
}

const oneLine = (value) => value.replace(/\s*\n\s*/g, ' ').trim();

/**
 * Read a model's answer as findings. The fields may come in any order and any
 * of them may be missing; a value may start with a dialogue dash and may
 * contain colons. Wrapping quotation marks are kept: they may be the text itself.
 * @param {string} responseText
 * @param {{max?: number}} [options]
 * @returns {{
 *   findings: Array<{quote: string, note: string, suggestion: string|null, compare: string|null,
 *     source: string|null, severity: 'works'|'low'|'medium'|'high'|null, complete: boolean}>,
 *   none: boolean, stray: number, extra: number, format: 'ok'|'empty'|'unparsed'
 * }}
 */
function parseFindings(responseText, options) {
  const max = options && options.max > 0 ? options.max : REVIEW.MAX_PARSED;
  const out = { findings: [], none: false, stray: 0, extra: 0, format: 'ok' };

  const text = stripReasoning(asText(responseText).replace(/\r\n?/g, '\n'));
  if (!text.trim()) {
    out.format = 'empty';
    return out;
  }

  const all = [];
  let current = null;
  let field = null;
  const start = () => {
    current = { values: {} };
    all.push(current);
  };

  for (const line of text.split('\n')) {
    if (FENCE_LINE.test(line)) {
      field = null;
      continue;
    }

    const match = LABEL_LINE.exec(line);
    if (match) {
      const name = FIELD_OF.get(match[2].toUpperCase().replace(/\s+/g, ' '));
      let value = match[5].trim();
      // **LAINAUS: x**: the decoration opened in front of the label closes at
      // the end of the line. Left in, it would be proposed as new text.
      if (match[1] && !match[3] && !match[4] && value.endsWith(match[1])) {
        value = value.slice(0, -match[1].length).trim();
      }

      // A second quote or note starts the next finding; any other repeated field is noise
      if (!current) start();
      else if ((name === 'quote' || name === 'note') && name in current.values) start();
      if (name in current.values) {
        out.stray += 1;
        field = null;
        continue;
      }
      current.values[name] = value;
      field = name;
      continue;
    }

    if (!line.trim()) {
      // A blank line ends the field, not the finding
      field = null;
      continue;
    }
    if (NONE_LINE.test(line)) {
      out.none = true;
      field = null;
      continue;
    }
    if (current && field) {
      current.values[field] += (current.values[field] ? '\n' : '') + line.trim();
      continue;
    }
    // Preamble, summary
    out.stray += 1;
  }

  for (const { values } of all) {
    const quote = asText(values.quote).trim();
    const note = oneLine(asText(values.note));
    let suggestion = asText(values.suggestion).trim();
    if (!suggestion || suggestion === quote || NO_SUGGESTION.test(suggestion)) suggestion = null;
    const compare = asText(values.compare).trim() || null;
    const source = oneLine(asText(values.source)) || null;
    const severity = 'severity' in values ? readSeverity(values.severity) : null;

    if (!quote && !note) {
      out.stray += 1;
      continue;
    }
    if (out.findings.length >= max) {
      out.extra += 1;
      continue;
    }
    out.findings.push({ quote, note, suggestion, compare, source, severity, complete: quote !== '' && note !== '' });
  }

  // Text came back and nothing in it could be read: that is a failed call
  if (out.findings.length === 0 && !out.none) out.format = 'unparsed';
  return out;
}

// ---------------------------------------------------------------------------
// Judging one answer
// ---------------------------------------------------------------------------

const verdict = (status, reason, message, fatal = false) => ({ status, reason, message, fatal });

/**
 * What one answer is worth. The first matching row wins.
 * @param {object} result the request layer's result
 * @param {object} parsed the result of parseFindings for its text
 * @returns {{status: 'ok'|'truncated'|'failed'|'stopped', reason: string|null, message: string|null, fatal: boolean}}
 */
function judgeBatch(result, parsed) {
  const given = result || {};
  const format = parsed ? parsed.format : 'empty';

  if (given.cancelled) return verdict('stopped', 'cancelled', null);
  if (given.ok === false) {
    const code = given.error && given.error.code ? String(given.error.code) : 'error';
    const message = given.error && given.error.message ? String(given.error.message) : 'Pyyntö epäonnistui.';
    return verdict('failed', code, message, REVIEW.FATAL_CODES.includes(code));
  }
  if (given.refused) return verdict('failed', 'refusal', 'Malli kieltäytyi tehtävästä.');
  if (given.promptTruncated) {
    return verdict('failed', 'prompt-truncated', 'Malli ei nähnyt koko tekstiä. Pienennä kontekstia tai tarkista mallin ikkunan koko tietopaneelin Tekoäly-välilehdeltä.');
  }
  if (format === 'empty' && given.truncated && given.sawThinking) {
    return verdict('failed', 'reasoning-exhausted', 'Mallin päättely käytti koko vastausrajan. Suurenna mallin päättelyvaraa tietopaneelin Tekoäly-välilehdellä.');
  }
  if (format === 'empty') return verdict('failed', 'empty', 'Malli palautti tyhjän vastauksen.');
  if (format === 'unparsed') {
    return verdict('failed', 'unparsed', 'Mallin vastausta ei voitu tulkita. Se ei ollut pyydetyssä muodossa.');
  }
  // A cut list of findings cannot damage the text; the caller drops a last
  // finding that was cut mid-way. What follows for the run (Havaintoja voi
  // puuttua.) is said once, by the run's own line (findings.js describeRun).
  if (given.truncated) return verdict('truncated', 'max-tokens', 'Vastaus katkesi kesken.');
  return verdict('ok', null, null);
}

// ---------------------------------------------------------------------------
// Anchoring
// ---------------------------------------------------------------------------

const GAP = /\s*(?:\[\s*(?:\.{3}|…)\s*\]|\(\s*(?:\.{3}|…)\s*\)|\.{3,}|…)\s*/u;
const LEADING_ELLIPSIS = /^(?:\.{3,}|…)\s*/u;
const TRAILING_ELLIPSIS = /\s*(?:\.{3,}|…)$/u;

const isFirm = (hit) => !!hit && (hit.method === 'exact' || hit.method === 'normalized');
const wordsOf = (text) => text.trim().split(/\s+/).filter(Boolean);

/**
 * Find a model's quote in a text. A hit that is not word for word is marked
 * approximate: a shortened middle (gap), a changed beginning (tail) or only
 * the beginning (prefix).
 * @param {string} text
 * @param {string} quote
 * @param {{from?: number, to?: number, near?: number}} options limit and steer the search as in locateQuote
 * @param {object} deps needs locateQuote
 * @returns {{from: number, to: number, approx: boolean, method: string}|null}
 */
function anchorQuote(text, quote, options, deps) {
  const scope = options || {};
  const wanted = asText(quote).trim();
  if (wanted.length < REVIEW.MIN_QUOTE_CHARS) return null;

  const hit = deps.locateQuote(text, wanted, scope);
  if (isFirm(hit)) return { from: hit.from, to: hit.to, approx: false, method: hit.method };

  // "alku … loppu": the model shortened the middle
  const inner = wanted.replace(LEADING_ELLIPSIS, '').replace(TRAILING_ELLIPSIS, '');
  const parts = inner.split(GAP).map(part => part.trim()).filter(part => part.length >= REVIEW.MIN_QUOTE_CHARS);
  if (parts.length >= 2) {
    const head = deps.locateQuote(text, parts[0], scope);
    if (isFirm(head)) {
      const limit = Number.isFinite(scope.to) ? scope.to : asText(text).length;
      const tail = deps.locateQuote(text, parts[parts.length - 1], {
        from: head.to,
        to: Math.min(limit, head.to + REVIEW.GAP_MAX_CHARS)
      });
      if (isFirm(tail)) return { from: head.from, to: tail.to, approx: true, method: 'gap' };
      return { from: head.from, to: head.to, approx: true, method: 'gap' };
    }
  }

  // A changed beginning: seen with a character's name where the text has "Hän"
  const words = wordsOf(wanted);
  for (let drop = 1; drop <= REVIEW.TAIL_MAX_DROP && words.length - drop >= REVIEW.TAIL_MIN_WORDS; drop++) {
    const tail = deps.locateQuote(text, words.slice(drop).join(' '), scope);
    if (isFirm(tail)) return { from: tail.from, to: tail.to, approx: true, method: 'tail' };
  }

  if (hit) return { from: hit.from, to: hit.to, approx: true, method: 'prefix' };
  return null;
}

const refKey = (ref) => (ref ? `${ref.kind}:${ref.id}` : '');

// The quote and note of a finding as one comparable key
const sameSaying = (quote, note) => [quote, note].map(part => asText(part).replace(/\s+/g, ' ').trim().toLowerCase()).join('\n');

// The first exact or normalized occurrence of the quote in the batch whose
// range is still free: first after the hit, then from the batch start up to it.
function freeOccurrence(view, quote, hit, batch, taken, deps) {
  for (const [low, high] of [[hit.to, batch.to], [batch.from, hit.from]]) {
    let cursor = low;
    while (cursor < high) {
      const next = anchorQuote(view.text, quote, { from: cursor, to: high, near: cursor }, deps);
      if (!next || next.approx || next.from < cursor || next.to <= cursor) break;
      const range = view.rawRange(next.from, next.to);
      if (!taken(range)) return { hit: next, range };
      cursor = next.to;
    }
  }
  return null;
}

/**
 * Place the findings of one answer in the chapter. The search never leaves
 * the batch: the model read nothing else. A finding without a place is kept.
 * @param {object} parsed the result of parseFindings
 * @param {{raw: string, view: object, batch: object, sources?: Array}} ctx sources only for the continuity check
 * @param {object} deps needs locateQuote, and splitSentences for the continuity check
 * @returns {{drafts: Array<object>, unlocated: number, duplicates: number}}
 */
function anchorFindings(parsed, ctx, deps) {
  const { raw, view, batch } = ctx;
  const continuity = Array.isArray(ctx.sources);
  const drafts = [];
  const taken = [];
  let unlocated = 0;
  let duplicates = 0;
  let near = batch.from;

  const isTaken = (range, key) => taken.some(used => used.from === range.from && used.to === range.to && used.key === key);

  for (const finding of parsed && Array.isArray(parsed.findings) ? parsed.findings : []) {
    let quote = finding.quote;
    let compare = finding.compare;
    const scope = () => ({ from: batch.from, to: batch.to, near });
    let hit = anchorQuote(view.text, quote, scope(), deps);

    // Seen: a model wrote the passage of the text under VERTAA and the background under LAINAUS
    if (!hit && continuity && compare) {
      const other = anchorQuote(view.text, compare, scope(), deps);
      if (other && !other.approx && ctx.sources.some(source => anchorQuote(source.text, quote, {}, deps))) {
        [quote, compare] = [compare, quote];
        hit = other;
      }
    }

    const ref = continuity ? anchorReference({ ...finding, quote, compare }, ctx.sources, deps) : null;
    const draft = {
      quote,
      modelQuote: null,
      from: null,
      to: null,
      located: false,
      approx: false,
      before: '',
      after: '',
      note: finding.note,
      suggestion: finding.suggestion,
      ref,
      severity: finding.severity == null ? null : finding.severity
    };

    if (!hit) {
      unlocated += 1;
      drafts.push(draft);
      continue;
    }

    let range = view.rawRange(hit.from, hit.to);
    const key = refKey(ref);
    const said = sameSaying(quote, finding.note);
    // A model that repeats a finding word for word means the same place:
    // moving the copy onto another passage would mark text it never read.
    const repeated = isTaken(range, key) && taken.some(used => used.key === key && used.said === said);
    // Words that repeat in the batch: locateQuote prefers the place nearest
    // to the last finding, which is that finding's own place. A different
    // finding with the same words belongs to a free place, which can lie
    // after it or, when the model did not quote in reading order, before it.
    if (!repeated && !hit.approx && isTaken(range, key)) {
      const free = freeOccurrence(view, quote, hit, batch, (other) => isTaken(other, key), deps);
      if (free) ({ hit, range } = free);
    }
    // The same passage against the same source twice is one finding
    if (isTaken(range, key)) {
      duplicates += 1;
      continue;
    }
    taken.push({ from: range.from, to: range.to, key, said });
    near = hit.from;

    draft.from = range.from;
    draft.to = range.to;
    draft.located = true;
    draft.approx = hit.approx;
    draft.quote = raw.slice(range.from, range.to);
    draft.modelQuote = hit.approx ? quote : null;
    draft.before = raw.slice(Math.max(0, range.from - REVIEW.CONTEXT_CHARS), range.from);
    draft.after = raw.slice(range.to, range.to + REVIEW.CONTEXT_CHARS);
    drafts.push(draft);
  }

  return { drafts, unlocated, duplicates };
}

// ---------------------------------------------------------------------------
// Continuity sources
// ---------------------------------------------------------------------------

const SOURCE_PARTS = ['codexAlways', 'codexMentioned', 'codexManual', 'summaries'];
const SUMMARY_SEPARATOR = ' – ';

// The texts of a part's items. The builder gives them; an older shape gives
// only lengths, and then the part's text is cut by them. Lengths that do not
// add up give nothing: no guessing.
function itemTexts(part, items) {
  if (items.every(item => item && typeof item.text === 'string')) return items.map(item => item.text);

  const whole = asText(part.text);
  const texts = [];
  let pos = 0;
  for (let i = 0; i < items.length; i++) {
    const chars = items[i] ? items[i].chars : NaN;
    if (!Number.isInteger(chars) || chars < 0 || pos + chars > whole.length) return null;
    texts.push(whole.slice(pos, pos + chars));
    pos += chars;
    if (i < items.length - 1) {
      if (whole[pos] !== '\n') return null;
      pos += 1;
    }
  }
  return pos === whole.length ? texts : null;
}

/**
 * The entries and summaries a built request carries, each as the model saw it.
 * @param {object} built the context builder's result
 * @returns {Array<{key: string, kind: 'codex'|'summary', id: string, label: string, text: string}>}
 */
function contextSources(built) {
  const parts = built && Array.isArray(built.parts) ? built.parts : [];
  const sources = [];
  const seen = new Set();

  for (const id of SOURCE_PARTS) {
    const part = parts.find(candidate => candidate && candidate.id === id);
    if (!part || (part.state !== 'sent' && part.state !== 'cut')) continue;
    const items = Array.isArray(part.items) ? part.items : [];
    const texts = itemTexts(part, items);
    if (!texts) continue;

    items.forEach((item, index) => {
      const key = asText(item.key);
      const kind = key.startsWith('codex:') ? 'codex' : key.startsWith('summary:') ? 'summary' : null;
      const text = texts[index];
      if (!kind || !text || seen.has(key)) return;
      seen.add(key);

      let label = asText(item.label).trim();
      if (kind === 'summary') {
        // "Luku 2: Matka – …": the part before the dash names the chapter
        const cut = text.indexOf(SUMMARY_SEPARATOR);
        if (cut > 0) label = text.slice(0, cut);
        else if (!label) label = text;
      }
      sources.push({ key, kind, id: key.slice(key.indexOf(':') + 1), label, text });
    });
  }
  return sources;
}

/**
 * The source a model named under LÄHDE: "Luku 2", "luku 2: Matka",
 * "Liisa Koskela", "tarinakansio: Mökki (paikka)".
 * @returns {object|null}
 */
function resolveSource(label, sources) {
  const named = asText(label).trim();
  const list = Array.isArray(sources) ? sources : [];
  if (!named) return null;

  const chapter = /Luku\s+(\d+)/i.exec(named);
  if (chapter) {
    const start = new RegExp(`^Luku\\s+${chapter[1]}(?!\\d)`, 'i');
    const summary = list.find(source => source.kind === 'summary' && start.test(source.text));
    if (summary) return summary;
  }

  // The longest name first: "Liisa Koskela" before "Liisa"
  const folded = named.toLowerCase();
  return list
    .filter(source => source.kind === 'codex' && source.label)
    .sort((a, b) => b.label.length - a.label.length)
    .find(source => folded.includes(source.label.toLowerCase())) || null;
}

/**
 * Find the second passage of a continuity finding in what was sent. Both
 * passages are always shown; `located` says whether this one was found.
 * @param {{compare: string|null, source: string|null}} finding
 * @param {Array} sources the result of contextSources
 * @param {object} deps needs locateQuote and splitSentences
 * @returns {{kind: 'codex'|'summary'|null, id: string|null, label: string, quote: string, located: boolean}}
 */
function anchorReference(finding, sources, deps) {
  const list = Array.isArray(sources) ? sources : [];
  const compare = asText(finding && finding.compare).trim();
  const named = resolveSource(finding && finding.source, list);
  // The named source first, then all the others in order
  const order = named ? [named, ...list.filter(source => source !== named)] : list;
  const found = (source, hit) => ({
    kind: source.kind,
    id: source.id,
    label: source.label,
    quote: source.text.slice(hit.from, hit.to),
    located: true
  });

  if (compare) {
    let loose = null;
    for (const source of order) {
      const hit = anchorQuote(source.text, compare, {}, deps);
      if (hit && !hit.approx) return found(source, hit);
      if (hit && !loose) loose = { source, hit };
    }

    // Seen: "Liisa Koskela (hahmo): Siniset silmät.", the entry's name
    // stitched to the sentence that matters. The last sentence that is found
    // word for word is the one. The sentence splitter does not cut at a
    // colon, so the part after an entry's "Nimi (tyyppi): " is tried as well.
    const sentences = typeof deps.splitSentences === 'function' ? deps.splitSentences(compare) : [];
    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = compare.slice(sentences[i].from, sentences[i].to).trim();
      const colon = sentence.indexOf(': ');
      const pieces = colon === -1 ? [sentence] : [sentence, sentence.slice(colon + 2).trim()];
      for (const piece of pieces) {
        if (wordsOf(piece).length < 2) continue;
        for (const source of order) {
          const hit = anchorQuote(source.text, piece, {}, deps);
          if (hit && !hit.approx) return found(source, hit);
        }
      }
    }

    if (loose) return found(loose.source, loose.hit);
  }

  return {
    kind: named ? named.kind : null,
    id: named ? named.id : null,
    label: named ? named.label : asText(finding && finding.source).trim(),
    quote: compare,
    located: false
  };
}

// ---------------------------------------------------------------------------
// The fix
// ---------------------------------------------------------------------------

/**
 * The suggestion of a finding as word-level changes of the chapter. Half a
 * fix would mislead, and a note or tag must never appear as a deletion, so a
 * change that would touch one refuses the whole fix.
 * @param {string} raw the chapter text now
 * @param {object} finding
 * @param {{wordDiff: Function, normaliseModelText?: Function}} deps
 * @returns {{ok: true, changes: Array<{from: number, to: number, insert: string, original: string}>}
 *   | {ok: false, reason: 'no-suggestion'|'not-located'|'approximate'|'text-changed'|'same'|'protected'}}
 */
function fixChanges(raw, finding, deps) {
  const text = asText(raw);
  const given = finding || {};
  if (!given.suggestion) return { ok: false, reason: 'no-suggestion' };
  if (!given.located) return { ok: false, reason: 'not-located' };
  if (given.approx) return { ok: false, reason: 'approximate' };

  const original = text.slice(given.from, given.to);
  if (original !== given.quote) return { ok: false, reason: 'text-changed' };

  const view = plainView(original);
  // In case the model added tags or notes of its own
  let revised = plainView(given.suggestion).text;
  // Keeps ” and – where the model wrote " and -
  if (deps && typeof deps.normaliseModelText === 'function') revised = deps.normaliseModelText(revised, view.text);
  // The passage keeps its own outer whitespace
  const lead = /^\s*/.exec(view.text)[0];
  const trail = view.text.length > lead.length ? /\s*$/.exec(view.text)[0] : '';
  revised = lead + asText(revised).trim() + trail;
  if (revised === view.text) return { ok: false, reason: 'same' };

  const changes = [];
  for (const change of deps.wordDiff(view.text, revised)) {
    const range = view.rawRange(change.from, change.to);
    if (view.protectedIn(range.from, range.to).length > 0) return { ok: false, reason: 'protected' };
    changes.push({
      from: given.from + range.from,
      to: given.from + range.to,
      insert: change.insert,
      original: original.slice(range.from, range.to)
    });
  }
  if (changes.length === 0) return { ok: false, reason: 'same' };
  return { ok: true, changes };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const OVER_BUDGET_MESSAGE = 'Teksti ei mahdu mallin ikkunaan. Pienennä kontekstia tai suurenna mallin ikkunaa tietopaneelin Tekoäly-välilehdellä.';
const UNEXPECTED_MESSAGE = 'Tarkistuspyyntö epäonnistui odottamatta.';

// A continuity check with nothing to compare: the run's message, and the panel's before a run
const nothingToCompare = (folderName) => `Ei vertailtavaa: ${folderName === 'Käsikirjoituksen kansio' ? 'Käsikirjoituksen kansiossa' : 'Tarinakansiossa'} ei ole tähän tekstiin liittyviä kohteita eikä aiemmilla luvuilla ole tiivistelmiä.`;

function defaultRunId() {
  const random = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
  return `r-${Date.now().toString(36)}-${random}`;
}

const unexpected = (error) => (error && error.message ? `${UNEXPECTED_MESSAGE} (${error.message})` : UNEXPECTED_MESSAGE);

/**
 * Run one check over a chapter or a selection: plan, then one request per
 * batch, one after another. `done` never rejects.
 *
 * @param {object} params
 * @param {object} params.check
 * @param {string} params.text raw chapter text when the run starts
 * @param {{from: number, to: number}|null} params.range raw offsets; null = the whole chapter
 * @param {string} [params.note] the "Tahallista / huomioi" text
 * @param {string} [params.folderName] 'Tarinakansio' or 'Käsikirjoituksen kansio'
 * @param {(task: object) => object} params.build the context builder bound to project, chapter and role
 * @param {(request: {system, messages, maxTokens, meta}) => {result: Promise<object>, cancel: Function}} params.request
 * @param {{chapterId?: string}} [params.meta]
 * @param {object} params.deps the text functions
 * @param {(progress: {batch: number, batches: number, found: number}) => void} [params.onProgress]
 *   called once when the plan is ready (batch 0) and after every batch
 * @param {() => string} [params.makeId]
 * @param {(built: object, folderName?: string) => {dropped: string}} [params.describeParts] the context builder's
 * @param {string} [params.noAIMessage]
 * @returns {{done: Promise<object>, cancel: () => void}}
 *
 * The result: { runId, checkId, outcome: 'ok'|'partial'|'failed'|'stopped'|'blocked', batches, done, failed,
 * drafts, covered, unlocated, duplicates, model, logId, dropped, message }. `done` counts the batches that were
 * worked through (answered, failed or skipped); `drafts` have raw offsets valid for params.text; `covered` are
 * the raw ranges of the batches that gave a readable answer; `model` is the id as the request layer reports it.
 */
function runReview(params) {
  const { check, text, range = null, note = '', folderName, build, request, deps, onProgress, describeParts, noAIMessage } = params;
  const chapterId = params.meta && params.meta.chapterId !== undefined ? params.meta.chapterId : undefined;
  const runId = typeof params.makeId === 'function' ? params.makeId() : defaultRunId();
  const continuity = isContinuity(check);

  let cancelled = false;
  let active = null;

  const result = {
    runId,
    checkId: check.id,
    outcome: 'ok',
    batches: 0,
    done: 0,
    failed: [],
    drafts: [],
    covered: [],
    unlocated: 0,
    duplicates: 0,
    model: null,
    logId: null,
    dropped: null,
    message: null
  };

  const report = (batch) => {
    if (typeof onProgress !== 'function') return;
    try {
      onProgress({ batch, batches: result.batches, found: result.drafts.length });
    } catch (error) {
      // A broken listener must not end the run
    }
  };

  // One batch: 'ok' | 'failed' | 'skipped' | 'stopped' | 'fatal'
  async function runBatch(plan, batch) {
    const fail = (reason, message, extra) => {
      result.failed.push({ index: batch.index, reason, message, ...extra });
    };

    const built = build({ ...plan.task, payload: batch.text }) || {};
    if (built.blocked) {
      // The chapter was marked "Ei tekoälylle", or removed, while the run was going on
      fail(String(built.blocked), built.blocked === 'noAI' ? noAIMessage || NO_AI_MESSAGE : NO_CHAPTER_MESSAGE);
      return 'fatal';
    }
    if (built.overBudget) {
      fail('over-budget', OVER_BUDGET_MESSAGE);
      return 'failed';
    }
    if (result.dropped === null && typeof describeParts === 'function') {
      const described = describeParts(built, folderName);
      if (described && described.dropped) result.dropped = described.dropped;
    }

    const sources = continuity ? contextSources(built) : undefined;
    // Nothing to compare this batch with: no request
    if (continuity && sources.length === 0) return 'skipped';

    active = request({
      system: built.system,
      messages: built.messages,
      maxTokens: plan.task.answerTokens,
      meta: {
        action: 'review',
        actionLabel: `Tarkistus: ${check.label}`,
        // An own check's instruction is the author's text; a built-in one is ours
        instruction: check.builtin ? '' : asText(check.instruction),
        chapterId,
        runId
      }
    });
    const answer = (await active.result) || {};
    active = null;
    // Also of a failed call: the run record names the model that was asked
    if (!result.model && answer.model) result.model = answer.model;
    if (!result.logId && answer.logId) result.logId = answer.logId;

    const parsed = parseFindings(answer.text);
    const judged = judgeBatch(answer, parsed);
    if (judged.status === 'stopped') return 'stopped';
    if (judged.status === 'failed') {
      const extra = judged.reason === 'unparsed' ? { answer: asText(answer.text).slice(0, REVIEW.ANSWER_SAMPLE_CHARS) } : {};
      fail(judged.reason, judged.message, extra);
      return judged.fatal ? 'fatal' : 'failed';
    }

    let findings = parsed.findings;
    if (judged.status === 'truncated') {
      // The last finding of a cut answer was cut mid-way
      if (findings.length > 0 && !findings[findings.length - 1].complete) findings = findings.slice(0, -1);
      fail(judged.reason, judged.message);
    }

    const anchored = anchorFindings({ ...parsed, findings }, { raw: text, view: plan.view, batch, sources }, deps);
    for (const draft of anchored.drafts) {
      // A suggestion nobody asked for is not shown as one
      if (check.suggest !== true) draft.suggestion = null;
      result.drafts.push(draft);
    }
    result.unlocated += anchored.unlocated;
    result.duplicates += anchored.duplicates;
    result.covered.push(plan.view.rawRange(batch.from, batch.to));
    return 'ok';
  }

  async function work() {
    const plan = planReview({ check, text, range, note, build, deps, noAIMessage });
    if (plan.blocked) {
      result.outcome = 'blocked';
      result.message = plan.blocked.message;
      return result;
    }
    result.batches = plan.batches.length;
    report(0);

    let succeeded = 0;
    let skipped = 0;
    let failedBatches = 0;
    let failuresInRow = 0;
    let stopped = false;

    for (const batch of plan.batches) {
      if (cancelled) {
        stopped = true;
        break;
      }

      let outcome;
      try {
        outcome = await runBatch(plan, batch);
      } catch (error) {
        active = null;
        result.failed.push({ index: batch.index, reason: 'exception', message: unexpected(error) });
        outcome = 'failed';
      }

      if (outcome === 'stopped') {
        stopped = true;
        break;
      }
      result.done += 1;
      if (outcome === 'ok') {
        succeeded += 1;
        failuresInRow = 0;
      } else if (outcome === 'skipped') {
        skipped += 1;
      } else {
        failedBatches += 1;
        failuresInRow += 1;
      }
      report(result.done);

      if (outcome === 'fatal' || failuresInRow >= REVIEW.STOP_AFTER_FAILURES) break;
    }

    // A feedback run in parts says so whatever the outcome: the writer must
    // know that the model did not see the chapter whole.
    const failed = result.failed.length > 0 ? result.failed[0].message : null;
    const firstFailure = [failed, plan.message].filter(Boolean).join(' ') || null;
    if (stopped || cancelled) {
      result.outcome = 'stopped';
      result.message = firstFailure;
    } else if (continuity && skipped === plan.batches.length) {
      result.outcome = 'blocked';
      result.message = nothingToCompare(folderName);
    } else if (succeeded === 0 && failedBatches > 0) {
      result.outcome = 'failed';
      result.message = firstFailure;
    } else if (result.failed.length > 0 || result.done < result.batches) {
      result.outcome = 'partial';
      result.message = firstFailure;
    } else {
      result.outcome = 'ok';
      result.message = plan.message;
    }
    return result;
  }

  const done = work().catch((error) => {
    result.outcome = 'failed';
    result.failed.push({ index: result.done, reason: 'exception', message: unexpected(error) });
    result.message = result.failed[0].message;
    return result;
  });

  return {
    done,
    cancel() {
      cancelled = true;
      const handle = active;
      if (handle && typeof handle.cancel === 'function') {
        try {
          handle.cancel();
        } catch (error) {
          // The flag alone ends the run after this batch
        }
      }
    }
  };
}

module.exports = {
  REVIEW,
  LABELS,
  NONE_MARKERS,
  SEVERITY_WORDS,
  buildReviewTask,
  renderReviewRequest,
  selectReviewLines,
  planBatches,
  planReview,
  parseFindings,
  judgeBatch,
  anchorQuote,
  anchorFindings,
  contextSources,
  resolveSource,
  anchorReference,
  fixChanges,
  runReview,
  nothingToCompare
};

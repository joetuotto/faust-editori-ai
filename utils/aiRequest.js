/**
 * AI request layer (main process)
 *
 * One path for every new AI feature: a request is validated, turned into
 * Messages API parameters for the selected provider (Claude direct or the
 * Cherry Studio gateway), streamed, and answered with one result object that
 * says how the answer ended. Errors become Finnish messages that never
 * contain a key.
 *
 * No Electron dependency: electron.js passes in the config, the SDK client
 * and the "Tekoäly pois" switch, so everything here is unit-tested directly
 * (test/utils/aiRequest.test.js).
 */

const { APIError, APIConnectionError, APIConnectionTimeoutError, APIUserAbortError } = require('@anthropic-ai/sdk');

// ---------------------------------------------------------------------------
// Constants (measured on the gateway on 16 Nov 2026 where a value is not obvious)
// ---------------------------------------------------------------------------

const AI_CONSTANTS = {
  CONNECT_TIMEOUT_MS: 180000,         // SDK timeout until response headers; the gateway sends them with the first token
  FIRST_EVENT_TIMEOUT_MS: 180000,     // wait for the first stream event (cold model load)
  // Longest silence between two stream events. The SDK drops `ping` before
  // it emits streamEvent, so keep-alive pings do not count as an event here
  STREAM_IDLE_TIMEOUT_MS: 120000,
  MAX_RETRIES: { cherry: 0, anthropic: 1 },   // the SDK default would repeat a 502 three times
  CHUNK_FLUSH_MS: 30,                 // text deltas are coalesced for this long; 0 = send each delta
  MAX_ACTIVE_REQUESTS: 8,
  MAX_MESSAGES: 200,
  MAX_PROMPT_CHARS: 2000000,
  MAX_OUTPUT_TOKENS: { cherry: 32000, anthropic: 64000 },
  DEFAULT_WINDOW_TOKENS: { cherry: 32000, anthropic: 200000 },
  DEFAULT_HEADROOM_TOKENS: { cherry: 2000, anthropic: 16000 },
  DEFAULT_SYSTEM_AS_USER: { cherry: false, anthropic: false },
  SEND_TEMPERATURE: { cherry: true, anthropic: false },   // current Claude models answer a temperature with 400
  SEND_THINKING_OFF: { cherry: true, anthropic: false },  // thinking: { type: 'disabled' } is a gateway hint only
  STOP_REASON_ALIASES: { stop: 'end_turn', eos: 'end_turn', length: 'max_tokens', content_filter: 'refusal' },
  THINK_TAGS: ['think', 'thinking', 'reasoning'],
  CONTEXT_OVERFLOW_PATTERNS: [/context (length|window)/i, /maximum context/i, /too many tokens/i, /prompt is too long/i],
  SYSTEM_REJECTED_PATTERNS: [/system (role|message|prompt).*(not supported|not allowed|unsupported)/i, /does not support.*system/i],
  MODEL_UNAVAILABLE_PATTERN: /is not available through the API gateway|Invalid model format/,
  STOP_LATCH_MS: 3000                 // after "Pysäytä tekoäly" the old handlers refuse for this long
};

// The same sentence as AI_OFF_SENTENCE in src/services/format.fi.js: the
// packaged main process cannot load src/, so the literal lives here too.
const AI_OFF_MESSAGE = 'Tekoäly pois -asetus on päällä.';

const INVALID_PREFIX = 'Virheellinen tekoälypyyntö: ';
const BUSY_MESSAGE = 'Liian monta tekoälypyyntöä on käynnissä yhtä aikaa. Odota, että edellinen valmistuu.';
const CANCELLED_MESSAGE = 'Pyyntö pysäytettiin.';
const STREAM_ERROR_MESSAGE = 'Mallin vastaus katkesi palvelimen virheeseen. Saapunut teksti on tallessa; yritä uudelleen.';

// Codes set by codedError that already carry their own Finnish text
const CODED = ['no_key', 'no_model', 'ai_off', 'busy', 'invalid_request', 'duplicate_id', 'timeout', 'protected'];

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const timeoutMessage = (ms) => `Malli ei vastannut ${Math.round(ms / 1000)} sekunnissa. Pyyntö keskeytettiin.`;

/** An Error with a machine-readable code; the fields of `extra` are copied on. */
function codedError(code, message, extra) {
  const error = new Error(message);
  error.code = code;
  if (isPlainObject(extra)) Object.assign(error, extra);
  return error;
}

// ---------------------------------------------------------------------------
// Request → Messages API parameters
// ---------------------------------------------------------------------------

/**
 * Check a request that came from the renderer.
 * Returns a fresh object with the known fields only. Text is never trimmed,
 * normalised or re-encoded.
 * @returns {{ok: true, value: object} | {ok: false, message: string}}
 */
function validateRequest(req, constants = AI_CONSTANTS) {
  const bad = (message) => ({ ok: false, message });

  if (!isPlainObject(req)) return bad('pyyntö puuttuu');

  if (typeof req.id !== 'string' || !ID_PATTERN.test(req.id)) return bad('tunnus puuttuu tai on virheellinen');

  const list = req.messages;
  if (!Array.isArray(list) || list.length < 1 || list.length > constants.MAX_MESSAGES) {
    return bad('viestit puuttuvat tai ovat virheellisiä');
  }
  const messages = [];
  for (const item of list) {
    const valid = isPlainObject(item)
      && (item.role === 'user' || item.role === 'assistant')
      && typeof item.content === 'string'
      && item.content.length > 0;
    if (!valid) return bad('viestit puuttuvat tai ovat virheellisiä');
    messages.push({ role: item.role, content: item.content });
  }

  // No assistant prefill: current Claude models answer it with 400, and open models differ
  if (messages[0].role !== 'user' || messages[messages.length - 1].role !== 'user') {
    return bad('ensimmäisen ja viimeisen viestin pitää olla käyttäjän');
  }

  if (req.system !== undefined && req.system !== null && typeof req.system !== 'string') {
    return bad('ohjeet eivät ole tekstiä');
  }
  const system = typeof req.system === 'string' ? req.system : '';

  if (req.model !== undefined && req.model !== null && (typeof req.model !== 'string' || req.model.length > 200)) {
    return bad('mallin tunnus on virheellinen');
  }
  const model = typeof req.model === 'string' ? req.model : '';

  if (!Number.isInteger(req.maxTokens) || req.maxTokens < 1) return bad('vastausraja puuttuu');

  if (req.temperature !== undefined) {
    const t = req.temperature;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > 2) return bad('lämpötila on virheellinen');
  }

  let stopSequences = [];
  if (req.stopSequences !== undefined) {
    const stops = req.stopSequences;
    const valid = Array.isArray(stops)
      && stops.length <= 4
      && stops.every(stop => typeof stop === 'string' && stop.length >= 1 && stop.length <= 40);
    if (!valid) return bad('lopetusjonot ovat virheellisiä');
    stopSequences = stops.slice();
  }

  if (req.thinking !== undefined && req.thinking !== 'off') return bad('päättelyasetus on virheellinen');
  const thinking = req.thinking === 'off' ? 'off' : '';

  const total = messages.reduce((sum, message) => sum + message.content.length, system.length);
  if (total > constants.MAX_PROMPT_CHARS) return bad('pyyntö on liian pitkä');

  return {
    ok: true,
    value: { id: req.id, system, messages, model, maxTokens: req.maxTokens, temperature: req.temperature, stopSequences, thinking }
  };
}

/**
 * The model id that is sent. Gateway ids look like "providerId:modelId";
 * anything else is a Claude name, so an id of the wrong kind falls back to
 * the configured model of the selected provider.
 */
function resolveModel(cfg, requested) {
  if (cfg && cfg.provider === 'cherry') {
    if (typeof requested === 'string' && requested.includes(':')) return requested;
    if (cfg.model) return cfg.model;
    throw codedError('no_model', 'Mallia ei ole valittu. Valitse malli tietopaneelin Tekoäly-välilehdellä.');
  }

  if (typeof requested === 'string' && requested !== '' && !requested.includes(':')) return requested;
  if (cfg && cfg.anthropicModel) return cfg.anthropicModel;
  throw codedError('no_model', 'Claude-mallia ei ole valittu. Valitse malli tietopaneelin Tekoäly-välilehdellä.');
}

/** Window, reasoning headroom and system handling of one model, defaults filled in. */
function modelSettingsFor(cfg, model, constants = AI_CONSTANTS) {
  const provider = cfg && cfg.provider === 'cherry' ? 'cherry' : 'anthropic';
  const all = cfg && isPlainObject(cfg.modelSettings) ? cfg.modelSettings : {};
  const stored = Object.prototype.hasOwnProperty.call(all, model) && isPlainObject(all[model]) ? all[model] : {};

  return {
    window: Number.isFinite(stored.window) ? stored.window : constants.DEFAULT_WINDOW_TOKENS[provider],
    headroom: Number.isFinite(stored.headroom) ? stored.headroom : constants.DEFAULT_HEADROOM_TOKENS[provider],
    systemAsUser: typeof stored.systemAsUser === 'boolean' ? stored.systemAsUser : constants.DEFAULT_SYSTEM_AS_USER[provider]
  };
}

/**
 * Messages API parameters for a validated request. Pure.
 * The reasoning headroom is not added here: the renderer adds it before
 * sending, so that it knows the exact number it reserved. Main only clamps.
 */
function buildParams(value, cfg, constants = AI_CONSTANTS) {
  const provider = cfg && cfg.provider === 'cherry' ? 'cherry' : 'anthropic';
  const model = resolveModel(cfg, value.model);
  const settings = modelSettingsFor(cfg, model, constants);

  const messages = value.messages.map(message => ({ role: message.role, content: message.content }));
  const params = {
    model,
    max_tokens: Math.min(value.maxTokens, constants.MAX_OUTPUT_TOKENS[provider]),
    messages
  };

  if (value.system !== '') {
    if (settings.systemAsUser) {
      // Models that reject the system role get the instructions in the first user message
      messages[0] = { role: 'user', content: value.system + '\n\n' + messages[0].content };
    } else {
      params.system = value.system;
    }
  }

  if (constants.SEND_TEMPERATURE[provider] === true && typeof value.temperature === 'number') {
    params.temperature = value.temperature;
  }

  if (Array.isArray(value.stopSequences) && value.stopSequences.length > 0) {
    params.stop_sequences = value.stopSequences.slice();
  }

  if (value.thinking === 'off' && constants.SEND_THINKING_OFF[provider] === true) {
    params.thinking = { type: 'disabled' };
  }

  return { params, model, provider, systemAsUser: settings.systemAsUser };
}

// ---------------------------------------------------------------------------
// Answer → result fields
// ---------------------------------------------------------------------------

/** One vocabulary for how an answer ended; unknown strings pass through. */
function normalizeStopReason(raw, constants = AI_CONSTANTS) {
  if (raw === null || raw === undefined || raw === '') return 'unknown';
  const aliases = constants.STOP_REASON_ALIASES;
  if (typeof raw === 'string' && Object.prototype.hasOwnProperty.call(aliases, raw)) return aliases[raw];
  return raw;
}

/**
 * Token counts as the app uses them. The prompt size includes cached tokens:
 * without them a cache hit would look like a truncated prompt.
 */
function normalizeUsage(usage) {
  if (!isPlainObject(usage)) return null;
  // A count that is not a number (a back end that sends strings) adds nothing
  const n = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  const inputTokens = typeof usage.input_tokens === 'number' && Number.isFinite(usage.input_tokens)
    ? usage.input_tokens + n(usage.cache_read_input_tokens) + n(usage.cache_creation_input_tokens)
    : null;
  const outputTokens = typeof usage.output_tokens === 'number' && Number.isFinite(usage.output_tokens) ? usage.output_tokens : null;
  if (inputTokens === null && outputTokens === null) return null;
  return { inputTokens, outputTokens };
}

// Later usage numbers replace earlier ones; a null never erases a number
function mergeUsage(base, extra) {
  if (!isPlainObject(extra)) return base;
  const merged = { ...(base || {}) };
  for (const [key, value] of Object.entries(extra)) {
    if (value !== null && value !== undefined) merged[key] = value;
  }
  return merged;
}

/**
 * Removes a leading <think>…</think> block from streamed text.
 * Some gateway back ends put their reasoning into the text. The filter acts
 * only at the very start of the response (after optional whitespace); a tag
 * later in the text is the author's business and is never touched.
 */
function createThinkFilter(tags = AI_CONSTANTS.THINK_TAGS) {
  const known = tags.map(tag => ({ open: `<${tag}>`.toLowerCase(), close: `</${tag}>`.toLowerCase() }));

  let state = 'head';   // head → inside → after → pass
  let held = '';        // head: everything so far; inside: the tail that may hold a split closing tag
  let close = '';
  let saw = false;

  // After the block: line breaks are dropped until the first other character
  function afterBlock(chunk, thinking) {
    const text = chunk.replace(/^[\r\n]+/, '');
    if (text !== '') state = 'pass';
    return { text, thinking };
  }

  function insideBlock(chunk) {
    held += chunk;
    const at = held.toLowerCase().indexOf(close);
    if (at === -1) {
      held = held.slice(-(close.length - 1));
      return { text: '', thinking: true };
    }
    const rest = held.slice(at + close.length);
    held = '';
    state = 'after';
    return afterBlock(rest, true);
  }

  function push(delta) {
    const chunk = typeof delta === 'string' ? delta : '';
    if (state === 'pass') return { text: chunk, thinking: false };
    if (state === 'inside') return insideBlock(chunk);
    if (state === 'after') return afterBlock(chunk, false);

    held += chunk;
    const start = held.replace(/^\s+/, '');
    const lower = start.toLowerCase();

    const tag = known.find(candidate => lower.startsWith(candidate.open));
    if (tag) {
      saw = true;
      state = 'inside';
      close = tag.close;
      held = '';
      return insideBlock(start.slice(tag.open.length));
    }

    // Still undecided: only whitespace, or the beginning of a think tag
    if (lower === '' || known.some(candidate => candidate.open.startsWith(lower))) {
      return { text: '', thinking: false };
    }

    state = 'pass';
    const text = held;
    held = '';
    return { text, thinking: false };
  }

  /** Characters that were held back and never released; '' inside an unclosed block. */
  function end() {
    const text = state === 'head' ? held : '';
    held = '';
    if (state === 'head') state = 'pass';
    return text;
  }

  return { push, end, sawThinking: () => saw };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

// The short text the server sent, without the status prefix the SDK adds
function serverMessageOf(error, status) {
  const body = error && error.error;
  if (isPlainObject(body)) {
    if (isPlainObject(body.error) && typeof body.error.message === 'string') return body.error.message;
    if (typeof body.error === 'string') return body.error;
    if (typeof body.message === 'string') return body.message;
  }
  const raw = error && typeof error.message === 'string' ? error.message : '';
  return status !== null && raw.startsWith(`${status} `) ? raw.slice(String(status).length + 1) : raw;
}

/**
 * Turn an SDK, network or coded error into { code, message, status }.
 * The message is Finnish, says what to do, and never contains a key.
 */
function classifyAIError(error, cfg, context = {}) {
  const config = cfg || {};
  const cherry = config.provider === 'cherry';
  const model = context && typeof context.model === 'string' ? context.model : '';
  const status = error && typeof error.status === 'number' ? error.status : null;

  // Longest first: a key that is the start of the other must not leave its tail behind
  const keys = [config.cherryKey, config.anthropicKey]
    .filter(key => typeof key === 'string' && key !== '')
    .sort((a, b) => b.length - a.length);
  const scrub = (text) => keys.reduce((result, key) => result.split(key).join('***'), String(text));

  const rawMessage = scrub(error && typeof error.message === 'string' ? error.message : String(error));
  const serverMessage = scrub(serverMessageOf(error, status)) || rawMessage;
  const says = (pattern) => pattern.test(serverMessage) || pattern.test(rawMessage);
  const result = (code, message) => ({ code, message, status });

  if (error && CODED.includes(error.code)) return result(error.code, rawMessage);

  // A stop is not a failure; the old handlers show this text for an aborted call
  if (error instanceof APIUserAbortError || (error && error.name === 'AbortError')) {
    return result('cancelled', CANCELLED_MESSAGE);
  }

  if (status === 401 || status === 403) {
    return result('auth', cherry
      ? 'Cherry Studio hylkäsi API-avaimen. Kopioi avain Cherry Studiosta (Settings → API Gateway → API Key) ja tallenna se tietopaneelin Tekoäly-välilehdellä.'
      : 'Claude hylkäsi API-avaimen. Tarkista avain tietopaneelin Tekoäly-välilehdeltä.');
  }

  // The SDK's own timeout runs until the response headers, which the gateway
  // sends with the first token: the model did not answer, the address is fine
  if (error instanceof APIConnectionTimeoutError) {
    const limit = context && context.timeoutMs > 0 ? context.timeoutMs : AI_CONSTANTS.CONNECT_TIMEOUT_MS;
    return result('timeout', timeoutMessage(limit));
  }

  // undici raises a plain "terminated" TypeError when the server goes away mid-answer
  const causeCode = error && error.cause && typeof error.cause.code === 'string' ? error.cause.code : '';
  const dropped = status === null && !(error instanceof APIError)
    && (/terminated|ECONNRESET|socket|other side closed/i.test(rawMessage) || causeCode === 'UND_ERR_SOCKET' || causeCode === 'ECONNRESET');

  const connection = !dropped && error instanceof APIConnectionError
    || (status === null && !(error instanceof APIError) && /connect|ECONNREFUSED|fetch failed|network/i.test(rawMessage));
  if (connection) {
    return result('unreachable', cherry
      ? `Cherry Studioon ei saada yhteyttä (${config.gatewayUrl}). Varmista, että Cherry Studio on käynnissä ja sen API Gateway päällä.`
      : 'Clauden palveluun ei saada yhteyttä. Tarkista verkkoyhteys.');
  }

  const named = model ? `Mallia ”${model}”` : 'Mallia';

  if (status === 404) return result('model_not_found', `${named} ei löytynyt. Tarkista malli tietopaneelin Tekoäly-välilehdeltä.`);

  if (status === 413 || (status === 400 && AI_CONSTANTS.CONTEXT_OVERFLOW_PATTERNS.some(says))) {
    return result('too_long', 'Pyyntö on liian pitkä tälle mallille. Lyhennä valintaa tai pienennä kontekstia.');
  }

  if (status === 400 && AI_CONSTANTS.SYSTEM_REJECTED_PATTERNS.some(says)) {
    return result('system_rejected', 'Malli hylkäsi järjestelmäviestin. Valitse tietopaneelin Tekoäly-välilehden mallin asetuksista ”Lähetä ohjeet käyttäjäviestinä” ja yritä uudelleen.');
  }

  // The gateway answers an unknown or unprefixed model id with 400, not 404
  if (status === 400 && says(AI_CONSTANTS.MODEL_UNAVAILABLE_PATTERN)) {
    return result('model_not_found', `${named} ei löydy Cherry Studiosta. Valitse malli uudelleen tietopaneelin Tekoäly-välilehdellä.`);
  }

  if (status === 400 || status === 422) return result('bad_request', `Palvelin hylkäsi pyynnön: ${serverMessage}`);

  if (status === 429) return result('rate_limit', 'Palvelin rajoittaa pyyntöjä juuri nyt. Yritä hetken kuluttua uudelleen.');

  // An SSE "error" event in the middle of a stream (api_error from the gateway,
  // overloaded_error from Claude): the SDK raises an APIError without a status
  // whose parsed body is { type: 'error', error: { type } }
  const body = error && error.error;
  const streamBroke = status === null && error instanceof APIError
    && isPlainObject(body) && isPlainObject(body.error) && typeof body.error.type === 'string';
  if (status === 502 || streamBroke || dropped) {
    return result('stream_error', STREAM_ERROR_MESSAGE);
  }

  if (status !== null && status >= 500) {
    return result('overloaded', `Palvelin ei pysty juuri nyt vastaamaan (virhe ${status}). Yritä hetken kuluttua uudelleen.`);
  }

  return result('unknown', `Tekoälypyyntö epäonnistui: ${rawMessage}`);
}

// ---------------------------------------------------------------------------
// Running requests
// ---------------------------------------------------------------------------

const noop = () => {};

// Text of a finished message. Gateway models may put a thinking block first.
function messageText(message) {
  if (!message || !Array.isArray(message.content)) return '';
  return message.content
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('');
}

function lastMessage(stream) {
  const received = stream && stream.receivedMessages;
  return Array.isArray(received) && received.length > 0 ? received[received.length - 1] : null;
}

/**
 * The table of running requests.
 *
 * start() streams one request and resolves with a MainResult; it never
 * rejects. cancel() and abortAll() stop requests; track() lets the old
 * handlers register their own AbortController, so that one command stops
 * everything.
 */
function createRequestTable(deps = {}) {
  const {
    getConfig,            // () => cfg
    getClient,            // (cfg) => client with messages.stream(params, options)
    isAiOff,              // () => boolean
    refuse,               // optional (value) => string | null: a string means "must not leave the machine"
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    constants = AI_CONSTANTS
  } = deps;

  const entries = new Map();    // id → entry of a request this table started
  const tracked = new Set();    // AbortControllers of requests the old handlers started
  let latchedUntil = 0;

  function emptyResult(id, startedAt) {
    return {
      ok: false,
      id,
      text: '',
      stopReason: 'error',
      stopSequence: null,
      usage: null,
      model: '',
      requestedModel: '',
      provider: null,
      maxTokens: 0,
      systemAsUser: false,
      sawThinking: false,
      refusal: null,
      ms: Math.max(0, now() - startedAt)
    };
  }

  // Nothing is sent for a request once it was cancelled: the SDK may still
  // deliver a few buffered events after abort()
  function emit(entry, chunk) {
    if (entry.cancelled) return;
    try {
      entry.send(chunk);
    } catch {
      // A closed window must not break the stream
    }
  }

  function flush(entry) {
    if (entry.flushTimer !== null) {
      clearTimer(entry.flushTimer);
      entry.flushTimer = null;
    }
    if (entry.pending === '') return;
    const text = entry.pending;
    entry.pending = '';
    emit(entry, { id: entry.id, type: 'text', text });
  }

  function addText(entry, text) {
    if (text === '') return;
    if (!entry.writingSent) {
      entry.writingSent = true;
      emit(entry, { id: entry.id, type: 'phase', phase: 'writing' });
    }
    entry.text += text;
    entry.pending += text;

    if (!(constants.CHUNK_FLUSH_MS > 0)) {
      flush(entry);
    } else if (entry.flushTimer === null) {
      entry.flushTimer = setTimer(() => {
        entry.flushTimer = null;
        flush(entry);
      }, constants.CHUNK_FLUSH_MS);
    }
  }

  // Reasoning text is never forwarded or stored; the renderer only learns that it happened
  function markThinking(entry) {
    entry.sawThinking = true;
    if (entry.thinkingSent) return;
    entry.thinkingSent = true;
    emit(entry, { id: entry.id, type: 'phase', phase: 'thinking' });
  }

  function abortStream(entry) {
    try {
      entry.stream.abort();
    } catch {
      // Already ended
    }
  }

  function armSilenceTimer(entry, ms) {
    if (entry.timer !== null) clearTimer(entry.timer);
    entry.timer = setTimer(() => {
      entry.timer = null;
      if (entry.cancelled || entry.finished) return;
      entry.timedOut = true;
      entry.timeoutMs = ms;
      abortStream(entry);
    }, ms);
  }

  function onStreamEvent(entry, event) {
    if (!event || entry.cancelled || entry.timedOut || entry.finished) return;
    armSilenceTimer(entry, constants.STREAM_IDLE_TIMEOUT_MS);

    if (event.type === 'message_start') {
      const message = event.message || {};
      if (typeof message.model === 'string') entry.servedModel = message.model;
      entry.usageRaw = mergeUsage(entry.usageRaw, message.usage);
    } else if (event.type === 'content_block_start') {
      const block = event.content_block || {};
      if (block.type === 'thinking' || block.type === 'redacted_thinking') {
        markThinking(entry);
      } else if (block.type === 'text' && typeof block.text === 'string' && block.text !== '') {
        takeText(entry, block.text);
      }
    } else if (event.type === 'content_block_delta') {
      const delta = event.delta || {};
      if (delta.type === 'thinking_delta') {
        markThinking(entry);
      } else if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        takeText(entry, delta.text);
      }
    } else if (event.type === 'message_delta') {
      const delta = event.delta || {};
      if (delta.stop_reason !== undefined && delta.stop_reason !== null) entry.stopReason = delta.stop_reason;
      if (delta.stop_sequence !== undefined && delta.stop_sequence !== null) entry.stopSequence = delta.stop_sequence;
      if (delta.stop_details !== undefined && delta.stop_details !== null) entry.stopDetails = delta.stop_details;
      // The gateway sends zeros in message_start and the real numbers here
      entry.sawMessageDelta = true;
      entry.usageRaw = mergeUsage(entry.usageRaw, event.usage);
    }
  }

  function takeText(entry, text) {
    entry.sawTextDelta = true;
    const out = entry.filter.push(text);
    if (out.thinking) markThinking(entry);
    addText(entry, out.text);
  }

  // Everything up to the stream object, synchronously: a cancel sent right
  // after the request must find the entry in the table
  function prepare(req, send, startedAt) {
    const rawId = req && typeof req.id === 'string' ? req.id : '';
    const fail = (error, fields) => ({
      result: { ...emptyResult(rawId, startedAt), ...fields, ok: false, stopReason: 'error', error }
    });
    const coded = (code, message) => fail({ code, message, status: null });

    const checked = validateRequest(req, constants);
    if (!checked.ok) return coded('invalid_request', INVALID_PREFIX + checked.message);
    const value = checked.value;

    if (isAiOff()) return coded('ai_off', AI_OFF_MESSAGE);

    const refusal = typeof refuse === 'function' ? refuse(value) : null;
    if (typeof refusal === 'string' && refusal !== '') return coded('protected', refusal);

    if (entries.has(value.id)) return coded('duplicate_id', INVALID_PREFIX + 'tunnus on jo käytössä');
    if (entries.size >= constants.MAX_ACTIVE_REQUESTS) return coded('busy', BUSY_MESSAGE);

    let cfg = null;
    let built = null;
    let stream = null;
    const known = () => (built
      ? { provider: built.provider, requestedModel: built.model, maxTokens: built.params.max_tokens, systemAsUser: built.systemAsUser }
      : { provider: cfg && (cfg.provider === 'cherry' || cfg.provider === 'anthropic') ? cfg.provider : null });
    try {
      cfg = getConfig();
      built = buildParams(value, cfg, constants);
      const client = getClient(cfg);
      stream = client.messages.stream(built.params, {
        maxRetries: constants.MAX_RETRIES[built.provider],
        timeout: constants.CONNECT_TIMEOUT_MS
      });
    } catch (error) {
      const model = built ? built.model : value.model;
      return fail(classifyAIError(error, cfg, { model, timeoutMs: constants.CONNECT_TIMEOUT_MS }), known());
    }

    const entry = {
      id: value.id,
      stream,
      text: '',
      filter: createThinkFilter(constants.THINK_TAGS),
      cancelled: false,
      timedOut: false,
      timeoutMs: 0,
      finished: false,
      sawThinking: false,
      sawTextDelta: false,
      thinkingSent: false,
      writingSent: false,
      stopReason: null,
      stopSequence: null,
      stopDetails: null,
      usageRaw: null,
      sawMessageDelta: false,
      servedModel: '',
      startedAt,
      timer: null,
      pending: '',
      flushTimer: null,
      send: typeof send === 'function' ? send : noop,
      cfg,
      built
    };
    entries.set(entry.id, entry);

    try {
      // Without listeners the SDK raises an unhandled rejection on abort and on error
      stream.on('abort', noop);
      stream.on('error', noop);
      stream.on('streamEvent', (event) => {
        try {
          onStreamEvent(entry, event);
        } catch {
          // A malformed event must not break the stream
        }
      });
      armSilenceTimer(entry, constants.FIRST_EVENT_TIMEOUT_MS);
    } catch (error) {
      // The request is already on its way: stop it and leave nothing in the table
      entry.finished = true;
      if (entry.timer !== null) clearTimer(entry.timer);
      abortStream(entry);
      entries.delete(entry.id);
      return fail(classifyAIError(error, cfg, { model: built.model }), known());
    }

    return { entry };
  }

  // What the final message knows and the raw events did not say
  function fillFromFinalMessage(entry, final) {
    if (!final) return;
    if (entry.stopReason === null && final.stop_reason) entry.stopReason = final.stop_reason;
    if (entry.stopSequence === null && final.stop_sequence) entry.stopSequence = final.stop_sequence;
    if (entry.stopDetails === null && final.stop_details) entry.stopDetails = final.stop_details;
    if (!entry.servedModel && typeof final.model === 'string') entry.servedModel = final.model;
    entry.usageRaw = mergeUsage(final.usage, entry.usageRaw) || entry.usageRaw;
  }

  function settle(entry, thrown) {
    if (entry.timer !== null) {
      clearTimer(entry.timer);
      entry.timer = null;
    }
    entry.finished = true;

    const completed = !thrown && !entry.cancelled && !entry.timedOut;
    const final = lastMessage(entry.stream);
    if (completed) fillFromFinalMessage(entry, final);

    // A held "<te" that never became a think tag is ordinary text
    addText(entry, entry.filter.end());

    // A gateway that sends the text only in the final block
    if (completed && !entry.sawTextDelta && final) {
      if (Array.isArray(final.content) && final.content.some(block => block && (block.type === 'thinking' || block.type === 'redacted_thinking'))) {
        markThinking(entry);
      }
      const filter = createThinkFilter(constants.THINK_TAGS);
      const visible = filter.push(messageText(final)).text + filter.end();
      if (filter.sawThinking()) markThinking(entry);
      addText(entry, visible);
    }

    flush(entry);
    entries.delete(entry.id);

    // Before message_delta the gateway's counts are placeholder zeros: unknown, not "nothing used"
    let usage = normalizeUsage(entry.usageRaw);
    if (usage && !entry.sawMessageDelta) {
      const known = (value) => (value === 0 ? null : value);
      usage = { inputTokens: known(usage.inputTokens), outputTokens: known(usage.outputTokens) };
      if (usage.inputTokens === null && usage.outputTokens === null) usage = null;
    }

    const { built, cfg } = entry;
    const base = {
      ok: true,
      id: entry.id,
      text: entry.text,
      stopReason: 'unknown',
      stopSequence: typeof entry.stopSequence === 'string' ? entry.stopSequence : null,
      usage,
      model: entry.servedModel || built.model,
      requestedModel: built.model,
      provider: built.provider,
      maxTokens: built.params.max_tokens,
      systemAsUser: built.systemAsUser,
      sawThinking: entry.sawThinking,
      refusal: null,
      ms: Math.max(0, now() - entry.startedAt)
    };

    if (entry.cancelled) return { ...base, stopReason: 'cancelled' };

    if (entry.timedOut) {
      const error = { code: 'timeout', message: timeoutMessage(entry.timeoutMs), status: null };
      return { ...base, ok: false, stopReason: 'error', error };
    }

    if (thrown) {
      const error = classifyAIError(thrown, cfg, { model: built.model, timeoutMs: constants.CONNECT_TIMEOUT_MS });
      return { ...base, ok: false, stopReason: 'error', error };
    }

    // A stream that ended without a stop reason was cut off: failed, never complete, text kept
    if (entry.stopReason === null || entry.stopReason === undefined || entry.stopReason === '') {
      const error = { code: 'stream_error', message: STREAM_ERROR_MESSAGE, status: null };
      return { ...base, ok: false, stopReason: 'error', error };
    }

    const stopReason = normalizeStopReason(entry.stopReason, constants);
    const details = isPlainObject(entry.stopDetails) ? entry.stopDetails : {};
    const refusal = stopReason === 'refusal'
      ? {
        category: typeof details.category === 'string' ? details.category : null,
        explanation: typeof details.explanation === 'string' ? details.explanation : null
      }
      : null;
    return { ...base, stopReason, refusal };
  }

  async function run(entry) {
    let thrown = null;
    try {
      await entry.stream.done();
    } catch (error) {
      thrown = error || new Error('tuntematon virhe');
    }
    return settle(entry, thrown);
  }

  /** Stream one request. Resolves with a MainResult and never rejects. */
  function start(req, send) {
    const startedAt = now();
    const rawId = req && typeof req.id === 'string' ? req.id : '';
    const unexpected = (error) => ({
      ...emptyResult(rawId, startedAt),
      error: classifyAIError(error, null, {})
    });

    let prepared;
    try {
      prepared = prepare(req, send, startedAt);
    } catch (error) {
      // A guard that throws fails closed: nothing was sent
      return Promise.resolve(unexpected(error));
    }
    if (prepared.result) return Promise.resolve(prepared.result);

    const entry = prepared.entry;
    return run(entry).catch((error) => {
      if (entry.timer !== null) clearTimer(entry.timer);
      if (entry.flushTimer !== null) clearTimer(entry.flushTimer);
      entries.delete(entry.id);
      return { ...unexpected(error), text: entry.text };
    });
  }

  /** Stop one request of this table. False when the id is not running. */
  function cancel(id) {
    const entry = entries.get(id);
    if (!entry) return false;
    if (!entry.timedOut) entry.cancelled = true;
    abortStream(entry);
    return true;
  }

  /**
   * Stop everything: own requests and the tracked requests of the old
   * handlers. With latchMs the old handlers also refuse for that long, so
   * that a batch loop cannot start its next chapter.
   */
  function abortAll(options) {
    const latchMs = options && options.latchMs > 0 ? options.latchMs : 0;
    let count = 0;

    for (const id of Array.from(entries.keys())) {
      if (cancel(id)) count += 1;
    }
    for (const controller of Array.from(tracked)) {
      try {
        controller.abort();
      } catch {
        // Already ended
      }
      count += 1;
    }

    if (latchMs > 0) latchedUntil = now() + latchMs;
    return count;
  }

  /**
   * Register the AbortController of a request this table did not start.
   * Returns release(), which may be called more than once.
   */
  function track(abortController) {
    if (!abortController || typeof abortController.abort !== 'function') return noop;
    tracked.add(abortController);
    return () => {
      tracked.delete(abortController);
    };
  }

  // Only the old handlers ask: a new request right after a stop must work
  const isLatched = () => now() < latchedUntil;

  const size = () => entries.size + tracked.size;

  return { start, cancel, abortAll, size, track, isLatched };
}

module.exports = {
  AI_CONSTANTS,
  codedError, validateRequest, resolveModel, modelSettingsFor, buildParams,
  normalizeStopReason, normalizeUsage, createThinkFilter,
  classifyAIError, createRequestTable
};

/**
 * @jest-environment node
 */
const { APIError, APIConnectionError, APIConnectionTimeoutError, APIUserAbortError } = require('@anthropic-ai/sdk');
const {
  AI_CONSTANTS,
  codedError,
  validateRequest,
  resolveModel,
  modelSettingsFor,
  buildParams,
  normalizeStopReason,
  normalizeUsage,
  createThinkFilter,
  classifyAIError,
  createRequestTable
} = require('../../utils/aiRequest');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_KEY = 'sk-test-000';
const GATEWAY_MODEL = 'c91f:glm-5.3-flash';

// The controller the old handlers register with track()
const { AbortController } = global;

const cherryCfg = (extra = {}) => ({
  provider: 'cherry',
  gatewayUrl: 'http://127.0.0.1:23333',
  model: GATEWAY_MODEL,
  cherryKey: TEST_KEY,
  anthropicKey: '',
  anthropicModel: '',
  roles: { prose: '', edit: '', analysis: '' },
  modelSettings: {},
  ...extra
});

const anthropicCfg = (extra = {}) => ({
  provider: 'anthropic',
  gatewayUrl: 'http://127.0.0.1:23333',
  model: '',
  cherryKey: '',
  anthropicKey: TEST_KEY,
  anthropicModel: 'claude-test-model',
  roles: { prose: '', edit: '', analysis: '' },
  modelSettings: {},
  ...extra
});

const request = (extra = {}) => ({
  id: 'r1',
  messages: [{ role: 'user', content: 'Hei' }],
  maxTokens: 500,
  ...extra
});

// The validated form of a request, for the functions that take it
const valid = (extra = {}) => {
  const checked = validateRequest(request(extra));
  if (!checked.ok) throw new Error(checked.message);
  return checked.value;
};

// Raw stream events in the shape the Messages API sends them
const ev = {
  start: (model = GATEWAY_MODEL, usage = { input_tokens: 0, output_tokens: 0 }) => ({
    type: 'message_start',
    message: { id: 'msg_1', type: 'message', role: 'assistant', content: [], model, stop_reason: null, stop_sequence: null, usage }
  }),
  thinkingStart: () => ({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }),
  thinking: (text) => ({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: text } }),
  textStart: (index = 0) => ({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } }),
  text: (text, index = 0) => ({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } }),
  delta: (stopReason, usage, extra = {}) => ({
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null, stop_details: null, ...extra },
    usage
  }),
  stop: () => ({ type: 'message_stop' })
};

/**
 * Stand-in for the SDK's MessageStream. It plays `script` when done() is
 * first called: raw events, then { end: message } or { error }. A script
 * without either waits; the test then drives it with event(), end(), fail().
 */
function fakeStream(script = []) {
  const listeners = {};
  let settled = false;
  let started = false;
  let resolveDone;
  let rejectDone;
  const finished = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  finished.catch(() => {});

  const emit = (name, ...args) => (listeners[name] || []).slice().forEach(listener => listener(...args));

  const stream = {
    aborted: false,
    abortCalls: 0,
    receivedMessages: [],
    currentMessage: undefined,
    on(name, listener) {
      (listeners[name] = listeners[name] || []).push(listener);
      return stream;
    },
    listenerCount: (name) => (listeners[name] || []).length,
    abort() {
      stream.abortCalls += 1;
      if (settled) return;
      settled = true;
      stream.aborted = true;
      const error = new APIUserAbortError();
      emit('abort', error);
      rejectDone(error);
    },
    done() {
      if (!started) {
        started = true;
        script.forEach(step => stream.play(step));
      }
      return finished;
    },
    play(step) {
      if (step && Object.prototype.hasOwnProperty.call(step, 'end')) return stream.end(step.end);
      if (step && step.error) return stream.fail(step.error);
      return stream.event(step);
    },
    // Also after abort(): the SDK may still deliver a few buffered events
    event(event) {
      emit('streamEvent', event, stream.currentMessage);
    },
    end(message) {
      if (settled) return;
      settled = true;
      if (message) stream.receivedMessages.push(message);
      emit('end');
      resolveDone();
    },
    fail(error) {
      if (settled) return;
      settled = true;
      emit('error', error);
      rejectDone(error);
    }
  };
  return stream;
}

/** Client whose messages.stream records its arguments and returns the next stream. */
function fakeClient(streams) {
  const calls = [];
  let next = 0;
  return {
    calls,
    messages: {
      stream(params, options) {
        calls.push({ params, options });
        const stream = streams[next];
        next += 1;
        if (!stream) throw new Error('no fake stream left');
        return stream;
      }
    }
  };
}

/** setTimer / clearTimer that only move when the test says so. */
function manualTimers() {
  let time = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => time,
    setTimer(fn, ms) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { fn, at: time + ms, ms });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    advance(ms) {
      const target = time + ms;
      for (;;) {
        let dueId = null;
        for (const [id, timer] of timers) {
          if (timer.at <= target && (dueId === null || timer.at < timers.get(dueId).at)) dueId = id;
        }
        if (dueId === null) break;
        const timer = timers.get(dueId);
        timers.delete(dueId);
        time = timer.at;
        timer.fn();
      }
      time = target;
    },
    waiting: () => Array.from(timers.values()).map(timer => timer.ms)
  };
}

function collector() {
  const chunks = [];
  return {
    chunks,
    send: (chunk) => chunks.push(chunk),
    texts: () => chunks.filter(chunk => chunk.type === 'text').map(chunk => chunk.text),
    phases: () => chunks.filter(chunk => chunk.type === 'phase').map(chunk => chunk.phase)
  };
}

function setup(options = {}) {
  const timers = manualTimers();
  const streams = options.streams || [fakeStream()];
  const client = fakeClient(streams);
  const getClient = options.getClient || jest.fn(() => client);
  const cfg = options.cfg || cherryCfg();
  const state = { aiOff: options.aiOff === true };
  const deps = {
    getConfig: () => cfg,
    getClient,
    isAiOff: () => state.aiOff,
    now: timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    constants: options.constants || AI_CONSTANTS
  };
  if (options.refuse) deps.refuse = options.refuse;
  const table = createRequestTable(deps);
  return { table, timers, streams, client, getClient, cfg, state };
}

const headers = { get: () => null };
const apiError = (status, body) => APIError.generate(status, body, undefined, headers);
const envelope = (type, message) => ({ type: 'error', error: { type, message } });
// What the SDK throws for an SSE "error" event in the middle of a stream
const sseError = () => new APIError(undefined, envelope('api_error', 'Failed to process successful response'), undefined, headers);

const FINNISH = 'Hän sanoi: ”Älä mene Åboon.” – Ei hän mennyt.';
const DIALOGUE = '– Tule tänne, hän sanoi.';
const NOTE = '[TODO: tarkista vuosi]';
const UNDERLINE = '<u>tärkeä</u>';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('AI_CONSTANTS', () => {
  test('carries the values measured on the gateway', () => {
    expect(AI_CONSTANTS.CONNECT_TIMEOUT_MS).toBe(180000);
    expect(AI_CONSTANTS.FIRST_EVENT_TIMEOUT_MS).toBe(180000);
    expect(AI_CONSTANTS.STREAM_IDLE_TIMEOUT_MS).toBe(120000);
    expect(AI_CONSTANTS.MAX_RETRIES).toEqual({ cherry: 0, anthropic: 1 });
    expect(AI_CONSTANTS.CHUNK_FLUSH_MS).toBe(30);
    expect(AI_CONSTANTS.MAX_ACTIVE_REQUESTS).toBe(8);
    expect(AI_CONSTANTS.MAX_MESSAGES).toBe(200);
    expect(AI_CONSTANTS.MAX_PROMPT_CHARS).toBe(2000000);
    expect(AI_CONSTANTS.MAX_OUTPUT_TOKENS).toEqual({ cherry: 32000, anthropic: 64000 });
    expect(AI_CONSTANTS.DEFAULT_WINDOW_TOKENS).toEqual({ cherry: 32000, anthropic: 200000 });
    expect(AI_CONSTANTS.DEFAULT_HEADROOM_TOKENS).toEqual({ cherry: 2000, anthropic: 16000 });
    expect(AI_CONSTANTS.DEFAULT_SYSTEM_AS_USER).toEqual({ cherry: false, anthropic: false });
    expect(AI_CONSTANTS.SEND_TEMPERATURE).toEqual({ cherry: true, anthropic: false });
    expect(AI_CONSTANTS.SEND_THINKING_OFF).toEqual({ cherry: true, anthropic: false });
    expect(AI_CONSTANTS.STOP_REASON_ALIASES).toEqual({ stop: 'end_turn', eos: 'end_turn', length: 'max_tokens', content_filter: 'refusal' });
    expect(AI_CONSTANTS.THINK_TAGS).toEqual(['think', 'thinking', 'reasoning']);
    expect(AI_CONSTANTS.STOP_LATCH_MS).toBe(3000);
    expect(AI_CONSTANTS.MODEL_UNAVAILABLE_PATTERN.source).toBe('is not available through the API gateway|Invalid model format');
    expect(AI_CONSTANTS.CONTEXT_OVERFLOW_PATTERNS).toHaveLength(4);
    expect(AI_CONSTANTS.SYSTEM_REJECTED_PATTERNS).toHaveLength(2);
  });

  test('codedError sets the code and copies the extra fields', () => {
    const error = codedError('no_key', 'Avain puuttuu.', { status: 401 });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('no_key');
    expect(error.message).toBe('Avain puuttuu.');
    expect(error.status).toBe(401);
    expect(codedError('busy', 'x').code).toBe('busy');
  });
});

// ---------------------------------------------------------------------------
// validateRequest
// ---------------------------------------------------------------------------

describe('validateRequest', () => {
  test('accepts a minimal request and returns copies of the messages', () => {
    const messages = [{ role: 'user', content: 'Hei' }];
    const checked = validateRequest({ id: 'ai-1', messages, maxTokens: 100 });

    expect(checked).toEqual({
      ok: true,
      value: {
        id: 'ai-1',
        system: '',
        messages: [{ role: 'user', content: 'Hei' }],
        model: '',
        maxTokens: 100,
        temperature: undefined,
        stopSequences: [],
        thinking: ''
      }
    });
    expect(checked.value.messages).not.toBe(messages);
    expect(checked.value.messages[0]).not.toBe(messages[0]);
  });

  test('rejects a request that is not an object', () => {
    for (const bad of [undefined, null, 'teksti', 7, [request()]]) {
      expect(validateRequest(bad)).toEqual({ ok: false, message: 'pyyntö puuttuu' });
    }
  });

  test('rejects a missing, empty or over-long id and an id with other characters', () => {
    const message = 'tunnus puuttuu tai on virheellinen';
    expect(validateRequest(request({ id: undefined }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ id: '' }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ id: 'a'.repeat(65) }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ id: 'ai 1' }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ id: 'ai.1' }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ id: 'äi-1' }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ id: 12 }))).toEqual({ ok: false, message });

    expect(validateRequest(request({ id: 'a'.repeat(64) })).ok).toBe(true);
    expect(validateRequest(request({ id: 'ai-1_B' })).ok).toBe(true);
  });

  test('rejects empty messages, an unknown role and empty content', () => {
    const message = 'viestit puuttuvat tai ovat virheellisiä';
    expect(validateRequest(request({ messages: undefined }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ messages: [] }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ messages: 'Hei' }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ messages: [{ role: 'system', content: 'Hei' }] }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ messages: [{ role: 'user', content: '' }] }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ messages: [{ role: 'user', content: ['Hei'] }] }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ messages: [null] }))).toEqual({ ok: false, message });
  });

  test('rejects more than MAX_MESSAGES messages', () => {
    const many = (count) => Array.from({ length: count }, (_item, index) => ({ role: index % 2 === 0 ? 'user' : 'assistant', content: 'x' }));
    expect(validateRequest(request({ messages: many(199) })).ok).toBe(true);
    expect(validateRequest(request({ messages: many(201) }))).toEqual({ ok: false, message: 'viestit puuttuvat tai ovat virheellisiä' });
  });

  test('rejects a first message from the assistant and a last message from the assistant (no prefill)', () => {
    const message = 'ensimmäisen ja viimeisen viestin pitää olla käyttäjän';
    const first = [{ role: 'assistant', content: 'Hei' }, { role: 'user', content: 'Jatka' }];
    const last = [{ role: 'user', content: 'Kirjoita' }, { role: 'assistant', content: '<teksti>' }];
    expect(validateRequest(request({ messages: first }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ messages: last }))).toEqual({ ok: false, message });

    const turns = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }];
    expect(validateRequest(request({ messages: turns })).ok).toBe(true);
  });

  test('rejects a system text or a model id that is not text', () => {
    expect(validateRequest(request({ system: 12 }))).toEqual({ ok: false, message: 'ohjeet eivät ole tekstiä' });
    expect(validateRequest(request({ system: null })).value.system).toBe('');
    expect(validateRequest(request({ model: 12 }))).toEqual({ ok: false, message: 'mallin tunnus on virheellinen' });
    expect(validateRequest(request({ model: 'm'.repeat(201) }))).toEqual({ ok: false, message: 'mallin tunnus on virheellinen' });
    expect(validateRequest(request({ model: null })).value.model).toBe('');
    expect(validateRequest(request({ model: GATEWAY_MODEL })).value.model).toBe(GATEWAY_MODEL);
  });

  test('rejects a missing, zero or fractional maxTokens', () => {
    const message = 'vastausraja puuttuu';
    expect(validateRequest(request({ maxTokens: undefined }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ maxTokens: 0 }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ maxTokens: 12.5 }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ maxTokens: '500' }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ maxTokens: Number.NaN }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ maxTokens: 1 })).ok).toBe(true);
  });

  test('rejects more than four stop sequences and a stop sequence longer than 40 characters', () => {
    const message = 'lopetusjonot ovat virheellisiä';
    expect(validateRequest(request({ stopSequences: ['a', 'b', 'c', 'd', 'e'] }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ stopSequences: ['x'.repeat(41)] }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ stopSequences: [''] }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ stopSequences: '</teksti>' }))).toEqual({ ok: false, message });

    const stops = ['</teksti>', 'x'.repeat(40)];
    const checked = validateRequest(request({ stopSequences: stops }));
    expect(checked.value.stopSequences).toEqual(stops);
    expect(checked.value.stopSequences).not.toBe(stops);
  });

  test('rejects a temperature outside 0–2', () => {
    const message = 'lämpötila on virheellinen';
    expect(validateRequest(request({ temperature: -0.1 }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ temperature: 2.1 }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ temperature: '1' }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ temperature: Number.NaN }))).toEqual({ ok: false, message });
    expect(validateRequest(request({ temperature: 0 })).value.temperature).toBe(0);
    expect(validateRequest(request({ temperature: 2 })).value.temperature).toBe(2);
  });

  test('accepts thinking off or nothing, and rejects any other thinking value', () => {
    expect(validateRequest(request({ thinking: 'off' })).value.thinking).toBe('off');
    expect(validateRequest(request()).value.thinking).toBe('');
    for (const bad of ['on', true, null, { type: 'disabled' }, '']) {
      expect(validateRequest(request({ thinking: bad }))).toEqual({ ok: false, message: 'päättelyasetus on virheellinen' });
    }
  });

  test('rejects a prompt longer than MAX_PROMPT_CHARS, counting the system text too', () => {
    const limit = AI_CONSTANTS.MAX_PROMPT_CHARS;
    const exact = request({ system: 'x'.repeat(10), messages: [{ role: 'user', content: 'y'.repeat(limit - 10) }] });
    expect(validateRequest(exact).ok).toBe(true);

    const over = request({ system: 'x'.repeat(11), messages: [{ role: 'user', content: 'y'.repeat(limit - 10) }] });
    expect(validateRequest(over)).toEqual({ ok: false, message: 'pyyntö on liian pitkä' });
  });

  test('drops unknown fields', () => {
    const checked = validateRequest(request({
      tools: [{ name: 'x' }],
      apiKey: TEST_KEY,
      messages: [{ role: 'user', content: 'Hei', cache_control: { type: 'ephemeral' }, name: 'kirjoittaja' }]
    }));

    expect(Object.keys(checked.value).sort()).toEqual(
      ['id', 'maxTokens', 'messages', 'model', 'stopSequences', 'system', 'temperature', 'thinking']
    );
    expect(checked.value.messages).toEqual([{ role: 'user', content: 'Hei' }]);
  });

  test('keeps Finnish text byte for byte: `Hän sanoi: ”Älä mene Åboon.” – Ei hän mennyt.`, a dialogue-dash line `– Tule tänne, hän sanoi.`, `[TODO: tarkista vuosi]` and `<u>tärkeä</u>`', () => {
    const content = `${FINNISH}\n${DIALOGUE}\n${NOTE} ${UNDERLINE}`;
    const system = `  Älä muuta merkintöjä ${NOTE} äläkä ${UNDERLINE}.  \n`;
    const checked = validateRequest(request({ system, messages: [{ role: 'user', content }] }));

    expect(checked.value.messages[0].content).toBe(content);
    expect(checked.value.system).toBe(system);
  });

  test('keeps CRLF line breaks, surrounding spaces and decomposed characters as they came', () => {
    const content = '  Ensimmäinen rivi.\r\nToinen rivi.\r\n\r\nA\u0308iti tuli.  ';
    const checked = validateRequest(request({ messages: [{ role: 'user', content }] }));
    expect(checked.value.messages[0].content).toBe(content);
    expect(checked.value.messages[0].content.length).toBe(content.length);
  });
});

// ---------------------------------------------------------------------------
// resolveModel, modelSettingsFor
// ---------------------------------------------------------------------------

describe('resolveModel', () => {
  test('cherry keeps an id with a colon', () => {
    expect(resolveModel(cherryCfg(), 'c91f:deepseek-v4.1')).toBe('c91f:deepseek-v4.1');
  });

  test('cherry replaces a Claude name with the default gateway model', () => {
    expect(resolveModel(cherryCfg(), 'claude-sonnet-4-5')).toBe(GATEWAY_MODEL);
    expect(resolveModel(cherryCfg(), '')).toBe(GATEWAY_MODEL);
    expect(resolveModel(cherryCfg(), undefined)).toBe(GATEWAY_MODEL);
  });

  test('cherry throws `no_model` with the Finnish text when no default is set', () => {
    let thrown = null;
    try {
      resolveModel(cherryCfg({ model: '' }), 'claude-sonnet-4-5');
    } catch (error) {
      thrown = error;
    }
    expect(thrown.code).toBe('no_model');
    expect(thrown.message).toBe('Mallia ei ole valittu. Valitse malli tietopaneelin Tekoäly-välilehdellä.');
  });

  test('anthropic uses the requested id', () => {
    expect(resolveModel(anthropicCfg(), 'claude-other-model')).toBe('claude-other-model');
  });

  test('anthropic falls back to the model field for an empty request and for a gateway id', () => {
    expect(resolveModel(anthropicCfg(), '')).toBe('claude-test-model');
    expect(resolveModel(anthropicCfg(), undefined)).toBe('claude-test-model');
    expect(resolveModel(anthropicCfg(), GATEWAY_MODEL)).toBe('claude-test-model');
  });

  test('anthropic throws `no_model` when the field is empty', () => {
    let thrown = null;
    try {
      resolveModel(anthropicCfg({ anthropicModel: '' }), '');
    } catch (error) {
      thrown = error;
    }
    expect(thrown.code).toBe('no_model');
    expect(thrown.message).toBe('Claude-mallia ei ole valittu. Valitse malli tietopaneelin Tekoäly-välilehdellä.');
  });
});

describe('modelSettingsFor', () => {
  test('returns provider defaults for an unknown model', () => {
    expect(modelSettingsFor(cherryCfg(), 'c91f:uusi')).toEqual({ window: 32000, headroom: 2000, systemAsUser: false });
    expect(modelSettingsFor(anthropicCfg(), 'claude-test-model')).toEqual({ window: 200000, headroom: 16000, systemAsUser: false });
    expect(modelSettingsFor(cherryCfg({ modelSettings: undefined }), 'c91f:uusi').window).toBe(32000);
  });

  test('a stored field overrides only itself', () => {
    const cfg = cherryCfg({ modelSettings: { [GATEWAY_MODEL]: { headroom: 400 }, 'c91f:toinen': { window: 8192, systemAsUser: true } } });
    expect(modelSettingsFor(cfg, GATEWAY_MODEL)).toEqual({ window: 32000, headroom: 400, systemAsUser: false });
    expect(modelSettingsFor(cfg, 'c91f:toinen')).toEqual({ window: 8192, headroom: 2000, systemAsUser: true });
  });

  test('a headroom of zero is a stored value, not a missing one', () => {
    const cfg = cherryCfg({ modelSettings: { [GATEWAY_MODEL]: { headroom: 0 } } });
    expect(modelSettingsFor(cfg, GATEWAY_MODEL).headroom).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildParams
// ---------------------------------------------------------------------------

describe('buildParams', () => {
  test('returns the parameters, the model, the provider and the system handling', () => {
    const built = buildParams(valid({ system: 'Ohje.' }), cherryCfg());
    expect(built).toEqual({
      params: { model: GATEWAY_MODEL, max_tokens: 500, messages: [{ role: 'user', content: 'Hei' }], system: 'Ohje.' },
      model: GATEWAY_MODEL,
      provider: 'cherry',
      systemAsUser: false
    });
  });

  test('never sends temperature in anthropic mode', () => {
    const built = buildParams(valid({ temperature: 0.7 }), anthropicCfg());
    expect(built.provider).toBe('anthropic');
    expect('temperature' in built.params).toBe(false);
  });

  test('sends temperature to the gateway only when the caller set it', () => {
    expect(buildParams(valid({ temperature: 0 }), cherryCfg()).params.temperature).toBe(0);
    expect(buildParams(valid({ temperature: 1.2 }), cherryCfg()).params.temperature).toBe(1.2);
    expect('temperature' in buildParams(valid(), cherryCfg()).params).toBe(false);
  });

  test('omits system when it is empty', () => {
    expect('system' in buildParams(valid(), cherryCfg()).params).toBe(false);
    expect('system' in buildParams(valid({ system: '' }), cherryCfg()).params).toBe(false);
  });

  test('moves the system text into the first user message when systemAsUser is on, with one empty line between', () => {
    const cfg = cherryCfg({ modelSettings: { [GATEWAY_MODEL]: { systemAsUser: true } } });
    const built = buildParams(valid({ system: 'Olet kielenhuoltaja.', messages: [{ role: 'user', content: DIALOGUE }] }), cfg);

    expect('system' in built.params).toBe(false);
    expect(built.params.messages[0]).toEqual({ role: 'user', content: `Olet kielenhuoltaja.\n\n${DIALOGUE}` });
    expect(built.systemAsUser).toBe(true);
  });

  test('leaves later messages unchanged when systemAsUser is on', () => {
    const cfg = cherryCfg({ modelSettings: { [GATEWAY_MODEL]: { systemAsUser: true } } });
    const messages = [
      { role: 'user', content: 'Ensimmäinen' },
      { role: 'assistant', content: 'Vastaus' },
      { role: 'user', content: 'Toinen' }
    ];
    const value = valid({ system: 'Ohje.', messages });
    const built = buildParams(value, cfg);

    expect(built.params.messages.slice(1)).toEqual(messages.slice(1));
    // The validated request itself is not changed
    expect(value.messages[0].content).toBe('Ensimmäinen');
  });

  test('systemAsUser without a system text changes nothing', () => {
    const cfg = cherryCfg({ modelSettings: { [GATEWAY_MODEL]: { systemAsUser: true } } });
    const built = buildParams(valid(), cfg);
    expect(built.params.messages).toEqual([{ role: 'user', content: 'Hei' }]);
    expect('system' in built.params).toBe(false);
  });

  test('passes stop_sequences through and omits an empty list', () => {
    expect(buildParams(valid({ stopSequences: ['</teksti>'] }), cherryCfg()).params.stop_sequences).toEqual(['</teksti>']);
    expect('stop_sequences' in buildParams(valid(), cherryCfg()).params).toBe(false);
    expect('stop_sequences' in buildParams(valid({ stopSequences: [] }), cherryCfg()).params).toBe(false);
  });

  test('clamps max_tokens to the provider cap', () => {
    expect(buildParams(valid({ maxTokens: 50000 }), cherryCfg()).params.max_tokens).toBe(32000);
    expect(buildParams(valid({ maxTokens: 50000 }), anthropicCfg()).params.max_tokens).toBe(50000);
    expect(buildParams(valid({ maxTokens: 90000 }), anthropicCfg()).params.max_tokens).toBe(64000);
    expect(buildParams(valid({ maxTokens: 800 }), cherryCfg()).params.max_tokens).toBe(800);
  });

  test('adds no thinking, tools or output_config', () => {
    for (const cfg of [cherryCfg(), anthropicCfg()]) {
      const { params } = buildParams(valid({ system: 'Ohje.', temperature: 0.5, stopSequences: ['x'] }), cfg);
      for (const field of ['thinking', 'tools', 'tool_choice', 'output_config']) {
        expect(field in params).toBe(false);
      }
      // No prefill either: the last message is the caller's own
      expect(params.messages[params.messages.length - 1]).toEqual({ role: 'user', content: 'Hei' });
    }
  });

  test('adds thinking disabled for the gateway only when the request says thinking off', () => {
    expect(buildParams(valid({ thinking: 'off' }), cherryCfg()).params.thinking).toEqual({ type: 'disabled' });
    expect('thinking' in buildParams(valid(), cherryCfg()).params).toBe(false);

    const noHint = { ...AI_CONSTANTS, SEND_THINKING_OFF: { cherry: false, anthropic: false } };
    expect('thinking' in buildParams(valid({ thinking: 'off' }), cherryCfg(), noHint).params).toBe(false);
  });

  test('never adds thinking in anthropic mode', () => {
    expect('thinking' in buildParams(valid({ thinking: 'off' }), anthropicCfg()).params).toBe(false);
    expect('thinking' in buildParams(valid(), anthropicCfg()).params).toBe(false);
  });

  test('throws the coded no_model error when no model can be resolved', () => {
    expect(() => buildParams(valid(), cherryCfg({ model: '' }))).toThrow('Mallia ei ole valittu');
  });

  test('sends Finnish text unchanged', () => {
    const content = `${FINNISH}\n${DIALOGUE}\n${NOTE} ${UNDERLINE}`;
    const built = buildParams(valid({ messages: [{ role: 'user', content }] }), cherryCfg());
    expect(built.params.messages[0].content).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// normalizeStopReason, normalizeUsage
// ---------------------------------------------------------------------------

describe('normalizeStopReason and normalizeUsage', () => {
  test('maps `stop`, `eos`, `length` and `content_filter`', () => {
    expect(normalizeStopReason('stop', AI_CONSTANTS)).toBe('end_turn');
    expect(normalizeStopReason('eos', AI_CONSTANTS)).toBe('end_turn');
    expect(normalizeStopReason('length', AI_CONSTANTS)).toBe('max_tokens');
    expect(normalizeStopReason('content_filter', AI_CONSTANTS)).toBe('refusal');
  });

  test('returns `unknown` for null and passes other strings through', () => {
    expect(normalizeStopReason(null, AI_CONSTANTS)).toBe('unknown');
    expect(normalizeStopReason(undefined, AI_CONSTANTS)).toBe('unknown');
    expect(normalizeStopReason('', AI_CONSTANTS)).toBe('unknown');
    for (const reason of ['end_turn', 'max_tokens', 'stop_sequence', 'refusal', 'tool_use', 'pause_turn', 'gateway_special']) {
      expect(normalizeStopReason(reason, AI_CONSTANTS)).toBe(reason);
    }
    // Words that happen to be object members are not aliases
    expect(normalizeStopReason('constructor', AI_CONSTANTS)).toBe('constructor');
    expect(normalizeStopReason('stop')).toBe('end_turn');
  });

  test('adds cache tokens to inputTokens', () => {
    expect(normalizeUsage({ input_tokens: 87, cache_read_input_tokens: 400, cache_creation_input_tokens: 13, output_tokens: 331 }))
      .toEqual({ inputTokens: 500, outputTokens: 331 });
    expect(normalizeUsage({ input_tokens: 87, cache_read_input_tokens: null, cache_creation_input_tokens: 0, output_tokens: 5 }))
      .toEqual({ inputTokens: 87, outputTokens: 5 });
  });

  test('a cache count that is not a number adds nothing and is never concatenated', () => {
    expect(normalizeUsage({ input_tokens: 5, cache_read_input_tokens: '10', output_tokens: 2 })).toEqual({ inputTokens: 5, outputTokens: 2 });
    expect(normalizeUsage({ input_tokens: 5, cache_creation_input_tokens: NaN })).toEqual({ inputTokens: 5, outputTokens: null });
  });

  test('returns null when the server sent no numbers, and null fields when it sent one', () => {
    expect(normalizeUsage(null)).toBeNull();
    expect(normalizeUsage(undefined)).toBeNull();
    expect(normalizeUsage({})).toBeNull();
    expect(normalizeUsage({ input_tokens: null, output_tokens: null })).toBeNull();
    expect(normalizeUsage({ output_tokens: 12 })).toEqual({ inputTokens: null, outputTokens: 12 });
    expect(normalizeUsage({ input_tokens: 40 })).toEqual({ inputTokens: 40, outputTokens: null });
    expect(normalizeUsage({ cache_read_input_tokens: 900 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createThinkFilter
// ---------------------------------------------------------------------------

describe('createThinkFilter', () => {
  const feed = (filter, deltas) => deltas.map(delta => filter.push(delta));

  test('passes ordinary text through from the first delta', () => {
    const filter = createThinkFilter();
    expect(filter.push('Hän ')).toEqual({ text: 'Hän ', thinking: false });
    expect(filter.push('sanoi: ”Älä.”')).toEqual({ text: 'sanoi: ”Älä.”', thinking: false });
    expect(filter.end()).toBe('');
    expect(filter.sawThinking()).toBe(false);
  });

  test('passes `<teksti>…` through after holding `<te` for one delta', () => {
    const filter = createThinkFilter();
    expect(filter.push('<t')).toEqual({ text: '', thinking: false });
    expect(filter.push('e')).toEqual({ text: '<te', thinking: false });
    expect(filter.push('ksti>– Tule tänne.</teksti>')).toEqual({ text: 'ksti>– Tule tänne.</teksti>', thinking: false });
    expect(filter.sawThinking()).toBe(false);
  });

  test('drops a leading `<think>` block split across three deltas and emits what follows without the leading line break', () => {
    const filter = createThinkFilter();
    const out = feed(filter, ['<thi', 'nk>Mietin, mitä käyttäjä tarkoittaa.</th', 'ink>\n\n<teksti>Äiti tuli.</teksti>']);

    expect(out.map(step => step.text).join('')).toBe('<teksti>Äiti tuli.</teksti>');
    expect(out[0]).toEqual({ text: '', thinking: false });
    expect(out[1]).toEqual({ text: '', thinking: true });
    expect(filter.push(' Loppu.')).toEqual({ text: ' Loppu.', thinking: false });
    expect(filter.sawThinking()).toBe(true);
  });

  test('reports thinking while inside the block', () => {
    const filter = createThinkFilter();
    expect(filter.push('  <thinking>')).toEqual({ text: '', thinking: true });
    expect(filter.push('ensin tämä')).toEqual({ text: '', thinking: true });
    expect(filter.push(', sitten tuo')).toEqual({ text: '', thinking: true });
    expect(filter.push('</thinking>')).toEqual({ text: '', thinking: true });
    // Line breaks after the block may come in a delta of their own
    expect(filter.push('\r\n')).toEqual({ text: '', thinking: false });
    expect(filter.push('\nValmis.')).toEqual({ text: 'Valmis.', thinking: false });
    expect(filter.push('\nToinen rivi.')).toEqual({ text: '\nToinen rivi.', thinking: false });
  });

  test('knows all three tag names and ignores their case', () => {
    for (const tag of ['think', 'thinking', 'reasoning', 'THINK', 'Reasoning']) {
      const filter = createThinkFilter();
      expect(filter.push(`<${tag}>salaista</${tag}>\nNäkyvää`).text).toBe('Näkyvää');
      expect(filter.sawThinking()).toBe(true);
    }
  });

  test('an unclosed think block gives empty text and sawThinking true', () => {
    const filter = createThinkFilter();
    const out = feed(filter, ['<think>', 'Pohdin tätä pitkään', ' enkä ehdi loppuun']);

    expect(out.map(step => step.text).join('')).toBe('');
    expect(filter.end()).toBe('');
    expect(filter.sawThinking()).toBe(true);
  });

  test('leaves a `<think>` later in the text alone', () => {
    const filter = createThinkFilter();
    const text = 'Hän kirjoitti: <think>tämä jää</think> ja jatkoi.';
    expect(filter.push('Hän kirjoitti: ').text).toBe('Hän kirjoitti: ');
    expect(filter.push('<think>tämä jää</think> ja jatkoi.').text).toBe('<think>tämä jää</think> ja jatkoi.');
    expect(filter.sawThinking()).toBe(false);

    // Also after a real leading block: only the first one is reasoning
    const second = createThinkFilter();
    expect(second.push(`<think>a</think>\n${text}`).text).toBe(text);
  });

  test('end() releases a held prefix that never resolved', () => {
    const filter = createThinkFilter();
    expect(filter.push('\n<thin')).toEqual({ text: '', thinking: false });
    expect(filter.end()).toBe('\n<thin');
    expect(filter.end()).toBe('');
    expect(filter.sawThinking()).toBe(false);
  });

  test('a lone `<` that turns into another tag is released whole, leading whitespace included', () => {
    const filter = createThinkFilter();
    expect(filter.push('\n ')).toEqual({ text: '', thinking: false });
    expect(filter.push('<')).toEqual({ text: '', thinking: false });
    expect(filter.push('u>tärkeä</u>')).toEqual({ text: '\n <u>tärkeä</u>', thinking: false });
  });

  test('accepts its own tag list', () => {
    const filter = createThinkFilter(['pohdinta']);
    expect(filter.push('<pohdinta>x</pohdinta>Teksti').text).toBe('Teksti');
    expect(createThinkFilter(['pohdinta']).push('<think>x</think>Teksti').text).toBe('<think>x</think>Teksti');
  });
});

// ---------------------------------------------------------------------------
// classifyAIError
// ---------------------------------------------------------------------------

describe('classifyAIError', () => {
  const GATEWAY_AUTH = 'Cherry Studio hylkäsi API-avaimen. Kenttään kuuluu Cherry Studion oman API Gatewayn avain, ei mallin tarjoajan avain: kopioi se Cherry Studiosta (Settings → API Gateway → API Key) ja tallenna tietopaneelin Tekoäly-välilehdellä.';

  test('401 and 403 give `auth` with the gateway text in cherry mode and the Anthropic text in anthropic mode', () => {
    // The gateway answers a bad key with 403 and this body, not with the Anthropic envelope
    expect(classifyAIError(apiError(403, { error: 'Forbidden' }), cherryCfg())).toEqual({ code: 'auth', message: GATEWAY_AUTH, status: 403 });
    expect(classifyAIError(apiError(401, envelope('authentication_error', 'invalid x-api-key')), cherryCfg()))
      .toEqual({ code: 'auth', message: GATEWAY_AUTH, status: 401 });

    const anthropic = 'Claude hylkäsi API-avaimen. Tarkista avain tietopaneelin Tekoäly-välilehdeltä.';
    expect(classifyAIError(apiError(401, envelope('authentication_error', 'invalid x-api-key')), anthropicCfg()))
      .toEqual({ code: 'auth', message: anthropic, status: 401 });
    expect(classifyAIError(apiError(403, envelope('permission_error', 'forbidden')), anthropicCfg()))
      .toEqual({ code: 'auth', message: anthropic, status: 403 });

    // The model list handler passes a plain object with a status
    expect(classifyAIError({ status: 403, message: 'Forbidden' }, cherryCfg()).code).toBe('auth');
  });

  test('a connection error gives `unreachable` naming the gateway address', () => {
    const error = new APIConnectionError({ message: 'Connection error.', cause: new Error('fetch failed') });
    expect(classifyAIError(error, cherryCfg())).toEqual({
      code: 'unreachable',
      message: 'Cherry Studioon ei saada yhteyttä (http://127.0.0.1:23333). Varmista, että Cherry Studio on käynnissä ja sen API Gateway päällä.',
      status: null
    });
    expect(classifyAIError(error, anthropicCfg())).toEqual({
      code: 'unreachable',
      message: 'Clauden palveluun ei saada yhteyttä. Tarkista verkkoyhteys.',
      status: null
    });
    // A network failure that did not come through the SDK
    expect(classifyAIError(new Error('connect ECONNREFUSED 127.0.0.1:23333'), cherryCfg()).code).toBe('unreachable');
  });

  test('404 gives `model_not_found` naming the model in ” ” quotes', () => {
    const error = apiError(404, envelope('not_found_error', 'model: claude-vanha'));
    expect(classifyAIError(error, anthropicCfg(), { model: 'claude-vanha' })).toEqual({
      code: 'model_not_found',
      message: 'Mallia ”claude-vanha” ei löytynyt. Tarkista malli tietopaneelin Tekoäly-välilehdeltä.',
      status: 404
    });
  });

  test('413 and a 400 with a context-length message give `too_long`', () => {
    const message = 'Pyyntö on liian pitkä tälle mallille. Lyhennä valintaa tai pienennä kontekstia.';
    expect(classifyAIError(apiError(413, envelope('request_too_large', 'Request exceeds the maximum size')), anthropicCfg()))
      .toEqual({ code: 'too_long', message, status: 413 });
    for (const text of [
      'prompt is too long: 250000 tokens > 200000 maximum',
      'This model\'s maximum context length is 8192 tokens',
      'input exceeds the context window',
      'too many tokens in the request'
    ]) {
      expect(classifyAIError(apiError(400, envelope('invalid_request_error', text)), cherryCfg()))
        .toEqual({ code: 'too_long', message, status: 400 });
    }
  });

  test('a 400 about the system role gives `system_rejected` with the hint', () => {
    const message = 'Malli hylkäsi järjestelmäviestin. Valitse tietopaneelin Tekoäly-välilehden mallin asetuksista ”Lähetä ohjeet käyttäjäviestinä” ja yritä uudelleen.';
    expect(classifyAIError(apiError(400, envelope('invalid_request_error', 'System role is not supported by this model')), cherryCfg()))
      .toEqual({ code: 'system_rejected', message, status: 400 });
    expect(classifyAIError(apiError(400, envelope('invalid_request_error', 'This template does not support a system message')), cherryCfg()).code)
      .toBe('system_rejected');
  });

  test('a 400 that says the model is not available gives model_not_found with the gateway text', () => {
    const missing = apiError(400, envelope('invalid_request_error', 'Model "c91f:poistettu" is not available through the API gateway'));
    expect(classifyAIError(missing, cherryCfg(), { model: 'c91f:poistettu' })).toEqual({
      code: 'model_not_found',
      message: 'Mallia ”c91f:poistettu” ei löydy Cherry Studiosta. Valitse malli uudelleen tietopaneelin Tekoäly-välilehdellä.',
      status: 400
    });

    const format = apiError(400, envelope('invalid_request_error', 'Invalid model format: "claude-sonnet-4-5". Expected "providerId:apiModelId".'));
    expect(classifyAIError(format, cherryCfg(), { model: 'claude-sonnet-4-5' }).code).toBe('model_not_found');
  });

  test('another 400 gives `bad_request` with the server message', () => {
    const text = 'temperature must be in [0, 2], got 5.0. (parameter=temperature, value=5.0)';
    expect(classifyAIError(apiError(400, envelope('invalid_request_error', text)), cherryCfg()))
      .toEqual({ code: 'bad_request', message: `Palvelin hylkäsi pyynnön: ${text}`, status: 400 });
    expect(classifyAIError(apiError(422, envelope('invalid_request_error', 'unprocessable')), anthropicCfg()))
      .toEqual({ code: 'bad_request', message: 'Palvelin hylkäsi pyynnön: unprocessable', status: 422 });
  });

  test('429 gives `rate_limit`; 500, 503 and 529 give `overloaded` with the status', () => {
    expect(classifyAIError(apiError(429, envelope('rate_limit_error', 'slow down')), anthropicCfg())).toEqual({
      code: 'rate_limit',
      message: 'Palvelin rajoittaa pyyntöjä juuri nyt. Yritä hetken kuluttua uudelleen.',
      status: 429
    });
    for (const status of [500, 503, 529]) {
      expect(classifyAIError(apiError(status, envelope('overloaded_error', 'Overloaded')), anthropicCfg())).toEqual({
        code: 'overloaded',
        message: `Palvelin ei pysty juuri nyt vastaamaan (virhe ${status}). Yritä hetken kuluttua uudelleen.`,
        status
      });
    }
  });

  test('an SSE error event and a 502 give stream_error', () => {
    const message = 'Mallin vastaus katkesi palvelimen virheeseen. Saapunut teksti on tallessa; yritä uudelleen.';
    expect(classifyAIError(sseError(), cherryCfg())).toEqual({ code: 'stream_error', message, status: null });
    expect(classifyAIError(apiError(502, envelope('api_error', 'Bad gateway')), cherryCfg())).toEqual({ code: 'stream_error', message, status: 502 });
    expect(classifyAIError(apiError(502, undefined), anthropicCfg()).code).toBe('stream_error');

    // An APIError without a status whose body is not an error envelope stays unknown
    const other = new APIError(undefined, { jotain: 'muuta' }, 'jotain muuta', headers);
    expect(classifyAIError(other, cherryCfg()).code).toBe('unknown');
  });

  test('an SSE error event of any type, such as overloaded_error, gives stream_error and no raw JSON', () => {
    const message = 'Mallin vastaus katkesi palvelimen virheeseen. Saapunut teksti on tallessa; yritä uudelleen.';
    for (const type of ['overloaded_error', 'invalid_request_error']) {
      const raw = JSON.stringify(envelope(type, 'Overloaded'));
      const sse = new APIError(undefined, envelope(type, 'Overloaded'), raw, headers);
      expect(classifyAIError(sse, anthropicCfg())).toEqual({ code: 'stream_error', message, status: null });
    }
  });

  test('a connection dropped in the middle of an answer gives stream_error, not English', () => {
    const message = 'Mallin vastaus katkesi palvelimen virheeseen. Saapunut teksti on tallessa; yritä uudelleen.';
    // What undici raises when Cherry Studio quits while streaming
    const terminated = new TypeError('terminated');
    expect(classifyAIError(terminated, cherryCfg())).toEqual({ code: 'stream_error', message, status: null });
    expect(classifyAIError(new Error('read ECONNRESET'), cherryCfg()).code).toBe('stream_error');
    expect(classifyAIError(new Error('other side closed'), cherryCfg()).code).toBe('stream_error');
    const withCause = new TypeError('jotain');
    withCause.cause = { code: 'UND_ERR_SOCKET' };
    expect(classifyAIError(withCause, cherryCfg()).code).toBe('stream_error');
    // A refused connection is still the unreachable text
    expect(classifyAIError(new Error('connect ECONNREFUSED 127.0.0.1:8080'), cherryCfg()).code).toBe('unreachable');
  });

  test('a coded error keeps its code and text', () => {
    for (const code of ['no_key', 'no_model', 'ai_off', 'busy', 'invalid_request', 'duplicate_id', 'timeout', 'protected']) {
      expect(classifyAIError(codedError(code, `Teksti: ${code}.`), cherryCfg())).toEqual({ code, message: `Teksti: ${code}.`, status: null });
    }
    // Another code is not trusted to carry a Finnish text
    expect(classifyAIError(codedError('muu', 'x'), cherryCfg())).toEqual({ code: 'unknown', message: 'Tekoälypyyntö epäonnistui: x', status: null });
  });

  test('a server message that contains the key is returned with `***` in its place', () => {
    const leaky = apiError(400, envelope('invalid_request_error', `header x-api-key ${TEST_KEY} is malformed (${TEST_KEY})`));
    const classified = classifyAIError(leaky, cherryCfg());
    expect(classified).toEqual({
      code: 'bad_request',
      message: 'Palvelin hylkäsi pyynnön: header x-api-key *** is malformed (***)',
      status: 400
    });

    const unknown = classifyAIError(new Error(`odd failure with ${TEST_KEY}`), anthropicCfg());
    expect(unknown.code).toBe('unknown');
    expect(unknown.message).toBe('Tekoälypyyntö epäonnistui: odd failure with ***');

    const coded = classifyAIError(codedError('no_key', `avain ${TEST_KEY} puuttuu`), cherryCfg());
    expect(coded.message).toBe('avain *** puuttuu');

    for (const result of [classified, unknown, coded]) {
      expect(JSON.stringify(result)).not.toContain(TEST_KEY);
    }

    // One key the start of the other: no tail of the longer key is left
    const overlap = cherryCfg({ cherryKey: 'sk-test-000', anthropicKey: 'sk-test-0001234' });
    const both = classifyAIError(apiError(400, envelope('invalid_request_error', 'key sk-test-0001234 rejected')), overlap);
    expect(both.message).toBe('Palvelin hylkäsi pyynnön: key *** rejected');
    expect(classifyAIError(new Error('boom sk-test-000 and sk-test-0001234'), overlap).message)
      .toBe('Tekoälypyyntö epäonnistui: boom *** and ***');
  });

  test('the SDK timeout gives `timeout` with the limit in seconds, not the unreachable text', () => {
    expect(classifyAIError(new APIConnectionTimeoutError(), cherryCfg())).toEqual({
      code: 'timeout',
      message: 'Malli ei vastannut 180 sekunnissa. Pyyntö keskeytettiin.',
      status: null
    });
    expect(classifyAIError(new APIConnectionTimeoutError(), cherryCfg(), { timeoutMs: 60000 }).message)
      .toBe('Malli ei vastannut 60 sekunnissa. Pyyntö keskeytettiin.');
  });

  test('an aborted call gives `cancelled` with the stop text', () => {
    expect(classifyAIError(new APIUserAbortError(), cherryCfg())).toEqual({ code: 'cancelled', message: 'Pyyntö pysäytettiin.', status: null });
  });

  test('anything else gives `unknown` with the message, also without a config', () => {
    expect(classifyAIError(new Error('jotain outoa'), cherryCfg())).toEqual({
      code: 'unknown',
      message: 'Tekoälypyyntö epäonnistui: jotain outoa',
      status: null
    });
    expect(classifyAIError(new Error('jotain outoa'), null).code).toBe('unknown');
    expect(classifyAIError(undefined, undefined).code).toBe('unknown');
    expect(classifyAIError(apiError(418, envelope('teapot', 'olen teepannu')), anthropicCfg())).toEqual({
      code: 'unknown',
      message: expect.stringContaining('Tekoälypyyntö epäonnistui: 418'),
      status: 418
    });
  });
});

// ---------------------------------------------------------------------------
// createRequestTable
// ---------------------------------------------------------------------------

describe('createRequestTable', () => {
  const finalMessage = (text, extra = {}) => ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: GATEWAY_MODEL,
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 87, output_tokens: 12 },
    ...extra
  });

  test('streams text chunks tagged with the request id and resolves with text, stopReason and usage', async () => {
    const stream = fakeStream([
      ev.start(),
      ev.textStart(),
      ev.text('Hei, '),
      ev.text('maailma.'),
      ev.delta('end_turn', { input_tokens: 87, output_tokens: 12 }),
      ev.stop(),
      { end: finalMessage('Hei, maailma.') }
    ]);
    const { table, timers } = setup({ streams: [stream] });
    const out = collector();

    const promise = table.start(request({ id: 'ai-7' }), out.send);
    timers.advance(25);
    const result = await promise;

    expect(out.chunks.every(chunk => chunk.id === 'ai-7')).toBe(true);
    expect(out.texts().join('')).toBe('Hei, maailma.');
    expect(result).toEqual({
      ok: true,
      id: 'ai-7',
      text: 'Hei, maailma.',
      stopReason: 'end_turn',
      stopSequence: null,
      usage: { inputTokens: 87, outputTokens: 12 },
      model: GATEWAY_MODEL,
      requestedModel: GATEWAY_MODEL,
      provider: 'cherry',
      maxTokens: 500,
      systemAsUser: false,
      sawThinking: false,
      refusal: null,
      ms: 25
    });
  });

  test('the entry is in the table before start() returns its promise', async () => {
    const { table, streams } = setup();
    expect(table.size()).toBe(0);

    const promise = table.start(request(), () => {});
    // No await yet: a cancel sent right after the request must find the entry
    expect(table.size()).toBe(1);
    expect(table.cancel('r1')).toBe(true);
    expect(streams[0].abortCalls).toBe(1);

    const result = await promise;
    expect(result.stopReason).toBe('cancelled');
  });

  test('two concurrent requests keep their chunks apart', async () => {
    const first = fakeStream();
    const second = fakeStream();
    const { table } = setup({ streams: [first, second], constants: { ...AI_CONSTANTS, CHUNK_FLUSH_MS: 0 } });
    const out = collector();

    const a = table.start(request({ id: 'a' }), out.send);
    const b = table.start(request({ id: 'b' }), out.send);
    first.event(ev.text('Kissa '));
    second.event(ev.text('Koira '));
    first.event(ev.text('istui.'));
    second.event(ev.text('haukkui.'));
    first.event(ev.delta('end_turn', { output_tokens: 3 }));
    second.event(ev.delta('max_tokens', { output_tokens: 4 }));
    first.end();
    second.end();
    const [resultA, resultB] = await Promise.all([a, b]);

    const textOf = (id) => out.chunks.filter(chunk => chunk.id === id && chunk.type === 'text').map(chunk => chunk.text).join('');
    expect(textOf('a')).toBe('Kissa istui.');
    expect(textOf('b')).toBe('Koira haukkui.');
    expect(resultA.text).toBe('Kissa istui.');
    expect(resultA.stopReason).toBe('end_turn');
    expect(resultB.text).toBe('Koira haukkui.');
    expect(resultB.stopReason).toBe('max_tokens');
  });

  test('cancel aborts the stream and resolves ok with stopReason `cancelled` and the partial text', async () => {
    const { table, streams, timers } = setup();
    const out = collector();

    const promise = table.start(request(), out.send);
    streams[0].event(ev.start(GATEWAY_MODEL, { input_tokens: 40, output_tokens: 0 }));
    streams[0].event(ev.text('Puolikas vas'));
    timers.advance(30);
    expect(table.cancel('r1')).toBe(true);
    const result = await promise;

    expect(streams[0].aborted).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.stopReason).toBe('cancelled');
    expect(result.text).toBe('Puolikas vas');
    // Without message_delta a zero is the gateway's placeholder, not a count
    expect(result.usage).toEqual({ inputTokens: 40, outputTokens: null });
    expect('error' in result).toBe(false);
  });

  test('a stop before message_delta reports the gateway\'s placeholder zeros as unknown usage', async () => {
    const { table, streams, timers } = setup();

    const promise = table.start(request(), () => {});
    streams[0].event(ev.start(GATEWAY_MODEL, { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }));
    streams[0].event(ev.text('Puolikas'));
    timers.advance(30);
    table.cancel('r1');
    const result = await promise;
    expect(result.stopReason).toBe('cancelled');
    expect(result.usage).toBeNull();

    // An error before message_delta: the same
    const broken = fakeStream([ev.start(GATEWAY_MODEL, { input_tokens: 0, output_tokens: 0 }), ev.text('Alku'), { error: sseError() }]);
    const second = setup({ streams: [broken] });
    expect((await second.table.start(request(), () => {})).usage).toBeNull();
  });

  test('cancel after the silence timer fired still resolves with code timeout', async () => {
    const { table, streams, timers } = setup();

    const promise = table.start(request(), () => {});
    streams[0].event(ev.start());
    streams[0].event(ev.text('Alku'));
    // The timer fires; the abort is sent but the SDK has not settled yet
    streams[0].abort = function abortLater() {
      this.abortCalls += 1;
    };
    timers.advance(AI_CONSTANTS.STREAM_IDLE_TIMEOUT_MS);
    expect(table.cancel('r1')).toBe(true);
    streams[0].fail(new APIUserAbortError());
    const result = await promise;

    expect(result.ok).toBe(false);
    expect(result.stopReason).toBe('error');
    expect(result.error.code).toBe('timeout');
    expect(result.text).toBe('Alku');
  });

  test('after a cancel or an error the final message\'s text and stop reason are not used', async () => {
    const final = {
      id: 'msg_1', type: 'message', role: 'assistant', model: GATEWAY_MODEL,
      content: [{ type: 'text', text: 'Valmis vastaus.' }],
      stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 3 }
    };

    const { table, streams } = setup();
    const promise = table.start(request(), () => {});
    streams[0].receivedMessages.push(final);
    table.cancel('r1');
    const cancelled = await promise;
    expect(cancelled.stopReason).toBe('cancelled');
    expect(cancelled.text).toBe('');

    const broken = fakeStream([{ error: sseError() }]);
    broken.receivedMessages.push(final);
    const second = setup({ streams: [broken] });
    const failed = await second.table.start(request(), () => {});
    expect(failed.ok).toBe(false);
    expect(failed.text).toBe('');
    expect(failed.error.code).toBe('stream_error');
  });

  test('events that arrive after cancel are not sent', async () => {
    const { table, streams, timers } = setup();
    const out = collector();

    const promise = table.start(request(), out.send);
    streams[0].event(ev.text('Ennen. '));
    timers.advance(30);
    streams[0].event(ev.text('Vielä puskurissa.'));
    const sentBefore = out.chunks.length;

    table.cancel('r1');
    // The SDK may still deliver up to five buffered events after abort()
    streams[0].event(ev.thinkingStart());
    streams[0].event(ev.text(' Jälkeen 1.'));
    streams[0].event(ev.text(' Jälkeen 2.'));
    streams[0].event(ev.delta('end_turn', { output_tokens: 99 }));
    timers.advance(1000);
    const result = await promise;
    timers.advance(1000);

    expect(out.chunks.length).toBe(sentBefore);
    expect(out.texts().join('')).toBe('Ennen. ');
    // The result keeps what had arrived before the stop, sent or not
    expect(result.text).toBe('Ennen. Vielä puskurissa.');
    expect(result.stopReason).toBe('cancelled');
    expect(result.sawThinking).toBe(false);
  });

  test('cancel of an unknown id and of a finished id returns false', async () => {
    const stream = fakeStream([ev.text('Valmis.'), ev.delta('end_turn'), { end: undefined }]);
    const { table } = setup({ streams: [stream] });

    expect(table.cancel('ei-ole')).toBe(false);
    expect(table.cancel(undefined)).toBe(false);

    await table.start(request(), () => {});
    expect(table.cancel('r1')).toBe(false);
    expect(stream.abortCalls).toBe(0);
  });

  test('a duplicate id is refused while the first is running and accepted after it finished', async () => {
    const first = fakeStream();
    const second = fakeStream([ev.text('Toinen.'), ev.delta('end_turn'), { end: undefined }]);
    const { table, client } = setup({ streams: [first, second] });

    const running = table.start(request(), () => {});
    const refused = await table.start(request(), () => {});
    expect(refused.ok).toBe(false);
    expect(refused.id).toBe('r1');
    expect(refused.stopReason).toBe('error');
    expect(refused.error).toEqual({ code: 'duplicate_id', message: 'Virheellinen tekoälypyyntö: tunnus on jo käytössä', status: null });
    expect(client.calls).toHaveLength(1);
    // The refusal did not disturb the running request
    expect(table.size()).toBe(1);

    first.event(ev.delta('end_turn'));
    first.end();
    await running;

    const again = await table.start(request(), () => {});
    expect(again.ok).toBe(true);
    expect(again.text).toBe('Toinen.');
  });

  test('the ninth concurrent request is refused with `busy`', async () => {
    const streams = Array.from({ length: 9 }, () => fakeStream());
    const { table, client } = setup({ streams });

    const running = [];
    for (let i = 1; i <= 8; i += 1) running.push(table.start(request({ id: `r${i}` }), () => {}));
    expect(table.size()).toBe(8);

    const ninth = await table.start(request({ id: 'r9' }), () => {});
    expect(ninth.ok).toBe(false);
    expect(ninth.error).toEqual({
      code: 'busy',
      message: 'Liian monta tekoälypyyntöä on käynnissä yhtä aikaa. Odota, että edellinen valmistuu.',
      status: null
    });
    expect(client.calls).toHaveLength(8);

    expect(table.abortAll()).toBe(8);
    await Promise.all(running);
    expect(table.size()).toBe(0);
  });

  test('the first-event timeout aborts and resolves with error code `timeout` and the Finnish text', async () => {
    const { table, streams, timers } = setup();

    const promise = table.start(request(), () => {});
    timers.advance(AI_CONSTANTS.FIRST_EVENT_TIMEOUT_MS - 1);
    expect(streams[0].aborted).toBe(false);
    timers.advance(1);
    expect(streams[0].aborted).toBe(true);

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual({ code: 'timeout', message: 'Malli ei vastannut 180 sekunnissa. Pyyntö keskeytettiin.', status: null });
  });

  test('the idle timeout restarts on every stream event, thinking deltas included', async () => {
    const { table, streams, timers } = setup();
    const idle = AI_CONSTANTS.STREAM_IDLE_TIMEOUT_MS;

    const promise = table.start(request(), () => {});
    timers.advance(1000);
    streams[0].event(ev.start());
    // From the first event on, the shorter idle limit applies
    expect(timers.waiting()).toEqual([idle]);

    timers.advance(idle - 1);
    streams[0].event(ev.thinkingStart());
    timers.advance(idle - 1);
    streams[0].event(ev.thinking('pitkä pohdinta'));
    timers.advance(idle - 1);
    streams[0].event(ev.text('Alku'));
    timers.advance(idle - 1);
    streams[0].event({ type: 'content_block_stop', index: 0 });
    timers.advance(idle - 1);
    expect(streams[0].aborted).toBe(false);

    timers.advance(1);
    expect(streams[0].aborted).toBe(true);
    const result = await promise;
    expect(result.error).toEqual({ code: 'timeout', message: 'Malli ei vastannut 120 sekunnissa. Pyyntö keskeytettiin.', status: null });
    expect(result.text).toBe('Alku');
    expect(result.sawThinking).toBe(true);
  });

  test('an API error resolves ok false with the classified error and the partial text', async () => {
    const stream = fakeStream([ev.start(), ev.text('Teksti, joka ehti tul'), { error: sseError() }]);
    const { table } = setup({ streams: [stream] });
    const out = collector();

    const result = await table.start(request(), out.send);

    expect(result.ok).toBe(false);
    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual({
      code: 'stream_error',
      message: 'Mallin vastaus katkesi palvelimen virheeseen. Saapunut teksti on tallessa; yritä uudelleen.',
      status: null
    });
    expect(result.text).toBe('Teksti, joka ehti tul');
    expect(out.texts().join('')).toBe('Teksti, joka ehti tul');
    expect(result.provider).toBe('cherry');
    expect(result.requestedModel).toBe(GATEWAY_MODEL);
  });

  test('an error names the model that was asked for and never the key', async () => {
    const body = envelope('invalid_request_error', `Model "c91f:poistettu" is not available through the API gateway (key ${TEST_KEY})`);
    const stream = fakeStream([{ error: apiError(400, body) }]);
    const { table } = setup({ streams: [stream] });

    const result = await table.start(request({ model: 'c91f:poistettu' }), () => {});

    expect(result.error.code).toBe('model_not_found');
    expect(result.error.message).toBe('Mallia ”c91f:poistettu” ei löydy Cherry Studiosta. Valitse malli uudelleen tietopaneelin Tekoäly-välilehdellä.');
    expect(JSON.stringify(result)).not.toContain(TEST_KEY);
  });

  test('start never rejects, also when getClient throws', async () => {
    const coded = setup({
      getClient: () => {
        throw codedError('no_key', 'Cherry Studion API-avain puuttuu. Lisää se tietopaneelin Tekoäly-välilehdellä.');
      }
    });
    const noKey = await coded.table.start(request(), () => {});
    expect(noKey.ok).toBe(false);
    expect(noKey.error).toEqual({
      code: 'no_key',
      message: 'Cherry Studion API-avain puuttuu. Lisää se tietopaneelin Tekoäly-välilehdellä.',
      status: null
    });
    expect(noKey.provider).toBe('cherry');
    expect(coded.table.size()).toBe(0);

    const plain = setup({
      getClient: () => {
        throw new Error('rikki');
      }
    });
    await expect(plain.table.start(request(), () => {})).resolves.toMatchObject({
      ok: false,
      error: { code: 'unknown', message: 'Tekoälypyyntö epäonnistui: rikki' }
    });

    // No model configured: buildParams throws the coded error before the client is asked for
    const noModel = setup({ cfg: cherryCfg({ model: '' }) });
    const result = await noModel.table.start(request(), () => {});
    expect(result.error.code).toBe('no_model');
    expect(noModel.getClient).not.toHaveBeenCalled();

    // The SDK call itself throws
    const throwing = setup({ getClient: () => ({ messages: { stream: () => { throw new Error('stream rikki'); } } }) });
    const thrown = await throwing.table.start(request(), () => {});
    expect(thrown.error.code).toBe('unknown');
    expect(throwing.table.size()).toBe(0);

    // The stream object is broken: the request that is already on its way is stopped and nothing stays in the table
    const odd = fakeStream();
    odd.on = () => {
      throw new Error('kuuntelija rikki');
    };
    const listening = setup({ streams: [odd] });
    const refusedStream = await listening.table.start(request(), () => {});
    expect(refusedStream.ok).toBe(false);
    expect(refusedStream.error.code).toBe('unknown');
    expect(odd.abortCalls).toBe(1);
    expect(listening.table.size()).toBe(0);
    expect(listening.timers.waiting()).toEqual([]);

    // A broken dependency and a broken request object
    const broken = createRequestTable({ getConfig: () => cherryCfg(), getClient: () => null, isAiOff: () => { throw new Error('asetukset rikki'); } });
    await expect(broken.start(request(), () => {})).resolves.toMatchObject({ ok: false, stopReason: 'error' });
    await expect(setup().table.start(null, () => {})).resolves.toMatchObject({
      ok: false,
      id: '',
      error: { code: 'invalid_request', message: 'Virheellinen tekoälypyyntö: pyyntö puuttuu' }
    });
  });

  test('an invalid request is refused with the reason and never reaches the client', async () => {
    const { table, getClient } = setup();
    const result = await table.start(request({ maxTokens: 0 }), () => {});
    expect(result.error).toEqual({ code: 'invalid_request', message: 'Virheellinen tekoälypyyntö: vastausraja puuttuu', status: null });
    expect(result.id).toBe('r1');
    expect(getClient).not.toHaveBeenCalled();
    expect(table.size()).toBe(0);
  });

  test('a send that throws does not break the stream', async () => {
    const stream = fakeStream([ev.text('Teksti.'), ev.delta('end_turn'), { end: undefined }]);
    const { table } = setup({ streams: [stream] });
    const result = await table.start(request(), () => {
      throw new Error('ikkuna suljettu');
    });
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Teksti.');
  });

  test('removes the entry after completion, error, cancel and timeout', async () => {
    const done = fakeStream([ev.text('a'), ev.delta('end_turn'), { end: undefined }]);
    const failed = fakeStream([{ error: apiError(500, envelope('api_error', 'boom')) }]);
    const cancelled = fakeStream();
    const silent = fakeStream();
    const { table, timers } = setup({ streams: [done, failed, cancelled, silent] });

    await table.start(request({ id: 'done' }), () => {});
    expect(table.size()).toBe(0);

    const failure = await table.start(request({ id: 'failed' }), () => {});
    expect(failure.error.code).toBe('overloaded');
    expect(table.size()).toBe(0);

    const stopping = table.start(request({ id: 'cancelled' }), () => {});
    expect(table.size()).toBe(1);
    table.cancel('cancelled');
    await stopping;
    expect(table.size()).toBe(0);

    const waiting = table.start(request({ id: 'silent' }), () => {});
    expect(table.size()).toBe(1);
    timers.advance(AI_CONSTANTS.FIRST_EVENT_TIMEOUT_MS);
    await waiting;
    expect(table.size()).toBe(0);
    // No timer is left behind
    expect(timers.waiting()).toEqual([]);
  });

  test('reads stop_reason, stop_sequence, stop_details and usage from the raw message_delta event', async () => {
    const stream = fakeStream([
      // The gateway sends zeros at the start and the real numbers in message_delta
      ev.start('c91f:served-model', { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
      ev.text('<teksti>Valmis'),
      ev.delta('stop_sequence', { input_tokens: 87, output_tokens: 331, cache_read_input_tokens: 10, cache_creation_input_tokens: 3 }, { stop_sequence: '</teksti>' }),
      { end: undefined }
    ]);
    const { table } = setup({ streams: [stream] });

    const result = await table.start(request(), () => {});

    expect(result.stopReason).toBe('stop_sequence');
    expect(result.stopSequence).toBe('</teksti>');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 331 });
    expect(result.model).toBe('c91f:served-model');
    expect(result.requestedModel).toBe(GATEWAY_MODEL);
    expect(result.refusal).toBeNull();
  });

  test('keeps the prompt size of message_start when message_delta only brings the output count', async () => {
    const stream = fakeStream([
      ev.start('claude-test-model', { input_tokens: 1200, output_tokens: 1, cache_read_input_tokens: 300 }),
      ev.text('Vastaus.'),
      ev.delta('end_turn', { output_tokens: 45, input_tokens: null }),
      { end: undefined }
    ]);
    const { table } = setup({ streams: [stream], cfg: anthropicCfg() });

    const result = await table.start(request(), () => {});
    expect(result.usage).toEqual({ inputTokens: 1500, outputTokens: 45 });
    expect(result.provider).toBe('anthropic');
  });

  test('a zero in message_delta is a real count, not the gateway\'s placeholder', async () => {
    const stream = fakeStream([
      ev.start(GATEWAY_MODEL, { input_tokens: 0, output_tokens: 0 }),
      ev.delta('end_turn', { input_tokens: 40, output_tokens: 0 }),
      { end: undefined }
    ]);
    const { table } = setup({ streams: [stream] });

    const result = await table.start(request(), () => {});
    // An empty answer really used 0 output tokens once message_delta says so
    expect(result.usage).toEqual({ inputTokens: 40, outputTokens: 0 });
  });

  test('maps a gateway alias of the stop reason', async () => {
    const stream = fakeStream([ev.text('Katkesi'), ev.delta('length', { output_tokens: 500 }), { end: undefined }]);
    const { table } = setup({ streams: [stream] });
    expect((await table.start(request(), () => {})).stopReason).toBe('max_tokens');
  });

  test('a stream that ends without a stop reason is failed and keeps its text', async () => {
    const stream = fakeStream([ev.start(), ev.text('Kesken jäänyt lau'), { end: undefined }]);
    const { table } = setup({ streams: [stream] });

    const result = await table.start(request(), () => {});
    expect(result.ok).toBe(false);
    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual({
      code: 'stream_error',
      message: 'Mallin vastaus katkesi palvelimen virheeseen. Saapunut teksti on tallessa; yritä uudelleen.',
      status: null
    });
    expect(result.text).toBe('Kesken jäänyt lau');

    // An empty stop reason is no stop reason either
    const empty = fakeStream([ev.text('Kesken'), ev.delta(''), { end: undefined }]);
    const second = setup({ streams: [empty] });
    expect((await second.table.start(request(), () => {})).error.code).toBe('stream_error');
  });

  test('refusal: stopReason `refusal` with category and explanation', async () => {
    const details = { type: 'refusal', category: 'cyber', explanation: 'Pyyntö koskee haittaohjelmaa.' };
    const stream = fakeStream([ev.start(), ev.delta('refusal', { output_tokens: 0 }, { stop_details: details }), { end: undefined }]);
    const { table } = setup({ streams: [stream], cfg: anthropicCfg() });

    const result = await table.start(request(), () => {});
    expect(result.ok).toBe(true);
    expect(result.stopReason).toBe('refusal');
    expect(result.refusal).toEqual({ category: 'cyber', explanation: 'Pyyntö koskee haittaohjelmaa.' });
    expect(result.text).toBe('');

    // A refusal without details still has the object, with nulls
    const bare = fakeStream([ev.delta('refusal'), { end: undefined }]);
    const second = setup({ streams: [bare] });
    expect((await second.table.start(request(), () => {})).refusal).toEqual({ category: null, explanation: null });
  });

  test('a thinking block sets sawThinking and sends exactly one `thinking` phase chunk; thinking text is never sent', async () => {
    const secret = 'Käyttäjä haluaa, että korjaan pilkut. Mietin ensin.';
    const stream = fakeStream([
      ev.start(),
      ev.thinkingStart(),
      ev.thinking(secret.slice(0, 20)),
      ev.thinking(secret.slice(20)),
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'abc' } },
      { type: 'content_block_stop', index: 0 },
      // A second thinking block does not send the phase again
      { type: 'content_block_start', index: 1, content_block: { type: 'redacted_thinking', data: 'xyz' } },
      ev.textStart(2),
      ev.text('Näkyvä vastaus.', 2),
      ev.delta('end_turn', { output_tokens: 50 }),
      { end: undefined }
    ]);
    const { table } = setup({ streams: [stream] });
    const out = collector();

    const result = await table.start(request(), out.send);

    expect(result.sawThinking).toBe(true);
    expect(out.phases().filter(phase => phase === 'thinking')).toHaveLength(1);
    expect(out.phases()).toEqual(['thinking', 'writing']);
    expect(result.text).toBe('Näkyvä vastaus.');
    expect(JSON.stringify(out.chunks)).not.toContain('Mietin');
    expect(JSON.stringify(result)).not.toContain('Mietin');
  });

  test('a redacted_thinking block alone sets sawThinking and sends the thinking phase', async () => {
    const stream = fakeStream([
      ev.start(),
      { type: 'content_block_start', index: 0, content_block: { type: 'redacted_thinking', data: 'xyz' } },
      { type: 'content_block_stop', index: 0 },
      ev.textStart(1),
      ev.text('Vastaus.', 1),
      ev.delta('end_turn', { output_tokens: 5 }),
      { end: undefined }
    ]);
    const { table } = setup({ streams: [stream] });
    const out = collector();

    const result = await table.start(request(), out.send);
    expect(result.sawThinking).toBe(true);
    expect(out.phases()).toEqual(['thinking', 'writing']);
    expect(JSON.stringify(out.chunks)).not.toContain('xyz');
  });

  test('reasoning written into the text as a think block is removed and counted as thinking', async () => {
    const stream = fakeStream([
      ev.text('<think>Pohdin '),
      ev.text('salassa.</think>\n\n'),
      ev.text('<teksti>Äiti tuli kotiin.</teksti>'),
      ev.delta('end_turn'),
      { end: undefined }
    ]);
    const { table } = setup({ streams: [stream] });
    const out = collector();

    const result = await table.start(request(), out.send);

    expect(result.text).toBe('<teksti>Äiti tuli kotiin.</teksti>');
    expect(result.sawThinking).toBe(true);
    expect(out.phases()).toEqual(['thinking', 'writing']);
    expect(out.texts().join('')).toBe('<teksti>Äiti tuli kotiin.</teksti>');
  });

  test('a held tag start that never became a think tag is part of the text', async () => {
    const stream = fakeStream([ev.text('<thin'), ev.delta('max_tokens'), { end: undefined }]);
    const { table } = setup({ streams: [stream] });
    const out = collector();

    const result = await table.start(request(), out.send);
    expect(result.text).toBe('<thin');
    expect(out.texts().join('')).toBe('<thin');
  });

  test('the first visible text sends one `writing` phase chunk', async () => {
    const { table, streams, timers } = setup();
    const out = collector();

    const promise = table.start(request(), out.send);
    streams[0].event(ev.start());
    streams[0].event(ev.textStart());
    expect(out.phases()).toEqual([]);

    streams[0].event(ev.text('Ensimmäinen '));
    // The phase goes out at once, before the coalesced text
    expect(out.chunks).toEqual([{ id: 'r1', type: 'phase', phase: 'writing' }]);

    streams[0].event(ev.text('ja toinen.'));
    timers.advance(30);
    streams[0].event(ev.text(' Kolmas.'));
    streams[0].event(ev.delta('end_turn'));
    streams[0].end();
    await promise;

    expect(out.phases()).toEqual(['writing']);
    expect(out.chunks[0]).toEqual({ id: 'r1', type: 'phase', phase: 'writing' });
  });

  test('falls back to the final message\'s text blocks when no text delta arrived', async () => {
    const final = {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'c91f:final-only',
      content: [
        { type: 'thinking', thinking: 'salainen pohdinta' },
        { type: 'text', text: '<teksti>Koko vastaus ' },
        { type: 'text', text: 'kerralla.</teksti>' }
      ],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 60, output_tokens: 9 }
    };
    const stream = fakeStream([{ end: final }]);
    const { table } = setup({ streams: [stream] });
    const out = collector();

    const result = await table.start(request(), out.send);

    expect(result.ok).toBe(true);
    expect(result.text).toBe('<teksti>Koko vastaus kerralla.</teksti>');
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage).toEqual({ inputTokens: 60, outputTokens: 9 });
    expect(result.model).toBe('c91f:final-only');
    expect(result.sawThinking).toBe(true);
    // The renderer gets the same text it would have got from deltas
    expect(out.texts().join('')).toBe('<teksti>Koko vastaus kerralla.</teksti>');
    expect(JSON.stringify(out.chunks)).not.toContain('salainen');
  });

  test('does not use the final message when text deltas did arrive', async () => {
    const stream = fakeStream([ev.text('Suoratoistettu.'), ev.delta('end_turn'), { end: finalMessage('Eri teksti.') }]);
    const { table } = setup({ streams: [stream] });
    expect((await table.start(request(), () => {})).text).toBe('Suoratoistettu.');
  });

  test('refuses to start when isAiOff returns true, without calling getClient', async () => {
    const { table, getClient, state } = setup({ aiOff: true });

    const result = await table.start(request(), () => {});
    expect(result.ok).toBe(false);
    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual({ code: 'ai_off', message: 'Tekoäly pois -asetus on päällä.', status: null });
    expect(getClient).not.toHaveBeenCalled();
    expect(table.size()).toBe(0);

    // The switch is read for every request
    state.aiOff = false;
    const next = table.start(request(), () => {});
    expect(getClient).toHaveBeenCalledTimes(1);
    table.cancel('r1');
    await next;
  });

  test('a request that refuse() rejects never reaches the client and resolves with code protected', async () => {
    const text = 'Kehotteessa on tekstiä luvusta ”Kolmas luku”, joka on merkitty Ei tekoälylle (”Äiti seisoi laiturilla ja katsoi…”). Mitään ei lähetetty.';
    const refuse = jest.fn(() => text);
    const { table, getClient, client } = setup({ refuse });

    const result = await table.start(request({ system: 'Ohje.', messages: [{ role: 'user', content: 'Äiti seisoi laiturilla.' }] }), () => {});

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: 'protected', message: text, status: null });
    expect(getClient).not.toHaveBeenCalled();
    expect(client.calls).toHaveLength(0);
    expect(table.size()).toBe(0);
    // The guard sees the validated request: the texts that would be sent
    expect(refuse).toHaveBeenCalledTimes(1);
    expect(refuse.mock.calls[0][0]).toMatchObject({
      id: 'r1',
      system: 'Ohje.',
      messages: [{ role: 'user', content: 'Äiti seisoi laiturilla.' }]
    });
  });

  test('refuse() is asked after the switch and a guard that throws fails closed', async () => {
    const refuse = jest.fn(() => 'ei');
    const off = setup({ refuse, aiOff: true });
    expect((await off.table.start(request(), () => {})).error.code).toBe('ai_off');
    expect(refuse).not.toHaveBeenCalled();

    const throwing = setup({ refuse: () => { throw new Error('vartija rikki'); } });
    const result = await throwing.table.start(request(), () => {});
    expect(result.ok).toBe(false);
    expect(throwing.getClient).not.toHaveBeenCalled();
  });

  test('without refuse nothing changes', async () => {
    const script = () => fakeStream([ev.text('Sama vastaus.'), ev.delta('end_turn', { input_tokens: 5, output_tokens: 3 }), { end: undefined }]);
    const plain = setup({ streams: [script()] });
    const allowing = setup({ streams: [script()], refuse: () => null });

    const a = await plain.table.start(request(), () => {});
    const b = await allowing.table.start(request(), () => {});

    expect(a.ok).toBe(true);
    expect(a.text).toBe('Sama vastaus.');
    expect(b).toEqual(a);
    expect(plain.client.calls).toHaveLength(1);
    expect(allowing.client.calls).toHaveLength(1);
  });

  test('abortAll cancels every running request and returns the count', async () => {
    const streams = [fakeStream(), fakeStream(), fakeStream()];
    const { table } = setup({ streams });

    const running = ['a', 'b', 'c'].map(id => table.start(request({ id }), () => {}));
    streams[1].event(ev.text('Osa'));

    expect(table.abortAll()).toBe(3);
    const results = await Promise.all(running);

    expect(streams.every(stream => stream.aborted)).toBe(true);
    expect(results.map(result => result.stopReason)).toEqual(['cancelled', 'cancelled', 'cancelled']);
    expect(results[1].text).toBe('Osa');
    expect(table.size()).toBe(0);
    expect(table.abortAll()).toBe(0);
  });

  test('abortAll aborts tracked controllers too and counts them', async () => {
    const { table, streams } = setup();
    const oldOne = new AbortController();
    const oldTwo = new AbortController();
    table.track(oldOne);
    table.track(oldTwo);

    const running = table.start(request(), () => {});
    expect(table.size()).toBe(3);

    expect(table.abortAll()).toBe(3);
    expect(oldOne.signal.aborted).toBe(true);
    expect(oldTwo.signal.aborted).toBe(true);
    expect(streams[0].aborted).toBe(true);
    await running;
  });

  test('tracked controllers do not count against MAX_ACTIVE_REQUESTS', async () => {
    const streams = Array.from({ length: 8 }, () => fakeStream());
    const { table } = setup({ streams });
    for (let i = 0; i < 10; i += 1) table.track(new AbortController());

    const running = [];
    for (let i = 1; i <= 8; i += 1) running.push(table.start(request({ id: `r${i}` }), () => {}));
    expect(table.size()).toBe(18);

    table.abortAll();
    const results = await Promise.all(running);
    expect(results.every(result => result.stopReason === 'cancelled')).toBe(true);
  });

  test('release removes a tracked controller and may be called twice', () => {
    const { table } = setup();
    const controller = new AbortController();
    const other = new AbortController();

    const release = table.track(controller);
    table.track(other);
    expect(table.size()).toBe(2);

    release();
    expect(table.size()).toBe(1);
    expect(() => release()).not.toThrow();
    expect(table.size()).toBe(1);

    // A released controller is no longer aborted, the other one is
    expect(table.abortAll()).toBe(1);
    expect(controller.signal.aborted).toBe(false);
    expect(other.signal.aborted).toBe(true);

    // Something that is not a controller is ignored
    expect(() => table.track(null)()).not.toThrow();
    expect(table.size()).toBe(1);
  });

  test('isLatched is true for latchMs after abortAll and false without latchMs', () => {
    const { table, timers } = setup();
    expect(table.isLatched()).toBe(false);

    table.abortAll();
    expect(table.isLatched()).toBe(false);
    table.abortAll({});
    expect(table.isLatched()).toBe(false);

    table.abortAll({ latchMs: AI_CONSTANTS.STOP_LATCH_MS });
    expect(table.isLatched()).toBe(true);
    timers.advance(2999);
    expect(table.isLatched()).toBe(true);
    timers.advance(1);
    expect(table.isLatched()).toBe(false);
  });

  test('start is not refused while latched', async () => {
    const stream = fakeStream([ev.text('Uusi pyyntö toimii.'), ev.delta('end_turn'), { end: undefined }]);
    const { table } = setup({ streams: [stream] });

    table.abortAll({ latchMs: 3000 });
    expect(table.isLatched()).toBe(true);

    const result = await table.start(request(), () => {});
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Uusi pyyntö toimii.');
  });

  test('coalesces deltas that arrive within CHUNK_FLUSH_MS and flushes before resolving', async () => {
    const { table, streams, timers } = setup();
    const out = collector();
    let resolved = false;

    const promise = table.start(request(), out.send).then((result) => {
      resolved = true;
      out.chunks.push({ marker: 'resolved' });
      return result;
    });

    streams[0].event(ev.text('Yksi '));
    streams[0].event(ev.text('kaksi '));
    streams[0].event(ev.text('kolme.'));
    expect(out.texts()).toEqual([]);

    timers.advance(AI_CONSTANTS.CHUNK_FLUSH_MS - 1);
    expect(out.texts()).toEqual([]);
    timers.advance(1);
    expect(out.texts()).toEqual(['Yksi kaksi kolme.']);

    // The tail is still waiting for its timer when the stream ends
    streams[0].event(ev.text(' Neljä'));
    streams[0].event(ev.text(' viisi.'));
    streams[0].event(ev.delta('end_turn'));
    expect(out.texts()).toEqual(['Yksi kaksi kolme.']);
    streams[0].end();
    const result = await promise;

    expect(resolved).toBe(true);
    expect(out.texts()).toEqual(['Yksi kaksi kolme.', ' Neljä viisi.']);
    expect(out.chunks[out.chunks.length - 1]).toEqual({ marker: 'resolved' });
    expect(result.text).toBe('Yksi kaksi kolme. Neljä viisi.');
    // Nothing is sent twice afterwards
    timers.advance(1000);
    expect(out.texts()).toHaveLength(2);
  });

  test('CHUNK_FLUSH_MS 0 sends each delta at once', async () => {
    const { table, streams } = setup({ constants: { ...AI_CONSTANTS, CHUNK_FLUSH_MS: 0 } });
    const out = collector();

    const promise = table.start(request(), out.send);
    streams[0].event(ev.text('a'));
    streams[0].event(ev.text('b'));
    expect(out.texts()).toEqual(['a', 'b']);
    streams[0].event(ev.delta('end_turn'));
    streams[0].end();
    await promise;
    expect(out.texts()).toEqual(['a', 'b']);
  });

  test('text split in the middle of `”Kyllä.” – Niin` is reassembled exactly', async () => {
    const whole = `”Kyllä.” – Niin\n${DIALOGUE}\n${FINNISH} ${NOTE} ${UNDERLINE}\r\nÅ😀ö`;

    // Every split point, including between the two halves of the emoji
    for (let cut = 1; cut < whole.length; cut += 1) {
      const stream = fakeStream([ev.text(whole.slice(0, cut)), ev.text(whole.slice(cut)), ev.delta('end_turn'), { end: undefined }]);
      const { table, timers } = setup({ streams: [stream] });
      const out = collector();

      const promise = table.start(request(), out.send);
      timers.advance(30);
      const result = await promise;

      expect(result.text).toBe(whole);
      expect(out.texts().join('')).toBe(whole);
    }

    const pieces = ['”Kyl', 'lä.', '” ', '–', ' Niin'];
    const stream = fakeStream([...pieces.map(piece => ev.text(piece)), ev.delta('end_turn'), { end: undefined }]);
    const { table } = setup({ streams: [stream], constants: { ...AI_CONSTANTS, CHUNK_FLUSH_MS: 0 } });
    const out = collector();
    const result = await table.start(request(), out.send);
    expect(result.text).toBe('”Kyllä.” – Niin');
    expect(out.texts()).toEqual(pieces);
  });

  test('passes maxRetries and timeout to the SDK call', async () => {
    const gateway = setup();
    const first = gateway.table.start(request({ system: 'Ohje.', temperature: 0, thinking: 'off' }), () => {});
    expect(gateway.client.calls[0].options).toEqual({ maxRetries: 0, timeout: 180000 });
    expect(gateway.client.calls[0].params).toEqual({
      model: GATEWAY_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: 'Hei' }],
      system: 'Ohje.',
      temperature: 0,
      thinking: { type: 'disabled' }
    });
    expect(gateway.getClient).toHaveBeenCalledWith(gateway.cfg);
    gateway.table.cancel('r1');
    await first;

    const direct = setup({ cfg: anthropicCfg() });
    const second = direct.table.start(request({ temperature: 0.4, thinking: 'off' }), () => {});
    expect(direct.client.calls[0].options).toEqual({ maxRetries: 1, timeout: 180000 });
    expect(direct.client.calls[0].params).toEqual({
      model: 'claude-test-model',
      max_tokens: 500,
      messages: [{ role: 'user', content: 'Hei' }]
    });
    direct.table.cancel('r1');
    await second;
  });

  test('registers listeners for abort and error, so that the SDK raises no unhandled rejection', async () => {
    const { table, streams } = setup();
    const promise = table.start(request(), () => {});
    expect(streams[0].listenerCount('abort')).toBeGreaterThan(0);
    expect(streams[0].listenerCount('error')).toBeGreaterThan(0);
    expect(streams[0].listenerCount('streamEvent')).toBe(1);
    table.cancel('r1');
    await promise;
  });

  test('reports the clamped max_tokens and the system handling that was used', async () => {
    const cfg = cherryCfg({ modelSettings: { [GATEWAY_MODEL]: { systemAsUser: true } } });
    const stream = fakeStream([ev.text('ok'), ev.delta('end_turn'), { end: undefined }]);
    const { table, client } = setup({ streams: [stream], cfg });

    const result = await table.start(request({ system: 'Ohje.', maxTokens: 90000 }), () => {});
    expect(result.maxTokens).toBe(32000);
    expect(result.systemAsUser).toBe(true);
    expect(client.calls[0].params.messages[0].content).toBe('Ohje.\n\nHei');
  });
});

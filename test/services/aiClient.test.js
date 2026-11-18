/**
 * @jest-environment node
 */
const {
  CLIENT_CONSTANTS,
  ROLES,
  ROLE_LABELS,
  judgeEdit,
  reasonText,
  stopNote,
  createAIClient,
  getAIClient
} = require('../../src/services/ai/aiClient');
const aiClientModule = require('../../src/services/ai/aiClient');
const { createSettingsStore } = require('../../src/services/settingsStore');
const { appendRow, summarize } = require('../../src/services/ai/usageLog');
const { AI_CONSTANTS } = require('../../utils/aiRequest');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'c91f:glm-5.3-flash';
const EDIT_MODEL = 'c91f:deepseek-fast';

const DEFAULTS = {
  window: { cherry: 32000, anthropic: 200000 },
  headroom: { cherry: 2000, anthropic: 16000 },
  maxOutput: { cherry: 32000, anthropic: 64000 }
};

const cherryConfig = (extra = {}) => ({
  provider: 'cherry',
  gatewayUrl: 'http://127.0.0.1:23333',
  model: DEFAULT_MODEL,
  anthropicModel: '',
  hasCherryKey: true,
  hasAnthropicKey: false,
  providerFromEnv: false,
  keyFromEnv: { cherry: false, anthropic: false },
  roles: { prose: '', edit: EDIT_MODEL, analysis: '' },
  modelSettings: { [EDIT_MODEL]: { headroom: 400 } },
  defaults: DEFAULTS,
  ...extra
});

const anthropicConfig = (extra = {}) => cherryConfig({
  provider: 'anthropic',
  anthropicModel: 'claude-test-model',
  hasCherryKey: false,
  hasAnthropicKey: true,
  ...extra
});

/**
 * The `clean` of these tests: the last closing tag, the last opening tag
 * before it, one line break trimmed at each end. The real rule is
 * cleanModelOutput of the text modules, tested there.
 */
function stubClean(raw, { tag = 'teksti' } = {}) {
  const text = String(raw || '');
  const close = text.lastIndexOf(`</${tag}>`);
  const hadCloseTag = close !== -1;
  const head = hadCloseTag ? text.slice(0, close) : text;
  const open = head.lastIndexOf(`<${tag}>`);
  const inner = (open === -1 ? head : head.slice(open + tag.length + 2)).replace(/^\r?\n/, '').replace(/\r?\n$/, '');
  return { text: inner, complete: hadCloseTag && inner.trim() !== '', hadOpenTag: open !== -1, hadCloseTag, notes: [] };
}

// A result as the client hands it to judgeEdit
const aiResult = (extra = {}) => ({
  ok: true,
  id: 'ai-1',
  text: '<teksti>Äiti tuli kotiin.</teksti>',
  stopReason: 'end_turn',
  stopSequence: null,
  usage: { inputTokens: 300, outputTokens: 40 },
  model: EDIT_MODEL,
  requestedModel: EDIT_MODEL,
  provider: 'cherry',
  maxTokensSent: 1000,
  systemAsUser: false,
  sawThinking: false,
  refusal: null,
  ms: 900,
  cancelled: false,
  truncated: false,
  refused: false,
  promptChars: 800,
  promptTruncated: false,
  retried: false,
  error: null,
  logId: null,
  logMeta: null,
  ...extra
});

const judge = (extra, options = {}) => judgeEdit(aiResult(extra), { clean: stubClean, ...options });

/**
 * Stand-in for window.electronAPI. aiRequest waits until the test answers:
 * bridge.calls[i] has the request, chunk() to push stream chunks and
 * answer() to resolve with a MainResult built around the request.
 */
function fakeBridge(config = cherryConfig()) {
  const calls = [];
  const bridge = {
    config,
    calls,
    aiGetProvider: jest.fn(async () => ({ success: true, ...bridge.config })),
    aiRequest: jest.fn((request, onChunk) => new Promise((resolve, reject) => {
      const call = {
        request,
        done: false,
        chunk: (chunk) => onChunk({ id: request.id, ...chunk }),
        answer(extra = {}) {
          call.done = true;
          resolve({
            ok: true,
            id: request.id,
            text: '',
            stopReason: 'end_turn',
            stopSequence: null,
            usage: null,
            model: request.model || bridge.config.model || bridge.config.anthropicModel,
            requestedModel: request.model || bridge.config.model || bridge.config.anthropicModel,
            provider: bridge.config.provider,
            maxTokens: Math.min(request.maxTokens, DEFAULTS.maxOutput[bridge.config.provider]),
            systemAsUser: false,
            sawThinking: false,
            refusal: null,
            ms: 1200,
            ...extra
          });
        },
        fail(error) {
          call.done = true;
          reject(error);
        }
      };
      calls.push(call);
    })),
    // Main aborts the stream and answers the request itself as cancelled
    aiCancel: jest.fn(async (id) => {
      const call = calls.find(candidate => candidate.request.id === id && !candidate.done);
      if (call && bridge.answerCancels) call.answer({ stopReason: 'cancelled', text: 'Kesken jäi' });
      return { ok: true, found: !!call };
    }),
    answerCancels: true,
    aiListCherryModels: jest.fn(async () => ({
      success: true,
      models: [
        { id: DEFAULT_MODEL, name: 'glm-5.3-flash', owner: 'cherry' },
        { id: EDIT_MODEL, name: 'deepseek-fast', owner: 'cherry' }
      ]
    })),
    aiListAnthropicModels: jest.fn(async () => ({
      success: true,
      models: [{ id: 'claude-test-model', name: 'Claude Test', window: 200000, maxOutput: 64000 }]
    }))
  };
  return bridge;
}

// One turn of the event loop: every promise that is ready has run
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function until(condition) {
  for (let i = 0; i < 50; i += 1) {
    if (condition()) return;
    await flush();
  }
  throw new Error('the condition never became true');
}

function setup(options = {}) {
  const bridge = options.bridge === undefined ? fakeBridge(options.config) : options.bridge;
  const settings = options.settings === undefined ? createSettingsStore(null) : options.settings;
  const rows = [];
  let time = 1794859460964;
  let ids = 0;
  const client = createAIClient({
    bridge,
    settings,
    now: () => time,
    makeId: () => {
      ids += 1;
      return `ai-test-${ids}`;
    },
    cleanModelOutput: stubClean,
    ...options.deps
  });
  if (options.sink !== false) client.setUsageSink((row) => rows.push(row));
  return { client, bridge, settings, rows, tick: (ms) => { time += ms; } };
}

const user = (content) => [{ role: 'user', content }];

// Send one request and answer it; returns the result
async function roundTrip(context, opts, answer, method = 'request') {
  const before = context.bridge.calls.length;
  const handle = context.client[method]({ messages: user('Hei'), maxTokens: 600, ...opts });
  await until(() => context.bridge.calls.length === before + 1);
  context.bridge.calls[before].answer(answer);
  return handle.result;
}

const MANUSCRIPT = 'Hän sanoi: ”Älä mene Åboon.” – Ei hän mennyt.\n– Tule tänne, hän sanoi. [TODO: tarkista vuosi] <u>tärkeä</u>';

// ---------------------------------------------------------------------------
// Constants and exports
// ---------------------------------------------------------------------------

describe('constants', () => {
  test('roles, their Finnish names and the client constants', () => {
    expect(ROLES).toEqual(['prose', 'edit', 'analysis']);
    expect(ROLE_LABELS).toEqual({ prose: 'Proosa', edit: 'Muokkaus', analysis: 'Analyysi' });
    expect(CLIENT_CONSTANTS).toEqual({
      EDIT_TAG: 'teksti',
      ACCEPT_STOP_REASONS: ['end_turn', 'stop_sequence'],
      ACCEPT_UNKNOWN_STOP_REASON_WITH_TAG: false,
      POST_CANCEL_COOLDOWN_MS: 0,
      SAFETY_TOKENS: 200,
      LOG_INSTRUCTION_MAX: 500,
      RETRY_ON_REASONING_EXHAUSTED: true
    });
    expect('EDIT_USE_STOP_SEQUENCE' in CLIENT_CONSTANTS).toBe(false);
  });

  test('the tag rule and the shared formatting helpers are not exported from here', () => {
    expect('extractTagged' in aiClientModule).toBe(false);
    expect('modelLabel' in aiClientModule).toBe(false);
    expect('fiDate' in aiClientModule).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// judgeEdit
// ---------------------------------------------------------------------------

describe('judgeEdit', () => {
  test('accepts end_turn with a closing tag', () => {
    const verdict = judge({ text: `<teksti>\n${MANUSCRIPT}\n</teksti>` });
    expect(verdict.accepted).toBe(true);
    expect(verdict.reason).toBeNull();
    expect(verdict.reasonText).toBeNull();
    // The inner text is what clean returned, byte for byte
    expect(verdict.inner).toBe(MANUSCRIPT);
    expect(verdict.cleaned).toEqual({ text: MANUSCRIPT, complete: true, hadOpenTag: true, hadCloseTag: true, notes: [] });
    expect(Object.keys(verdict).sort()).toEqual(['accepted', 'cleaned', 'inner', 'reason', 'reasonText']);
  });

  test('accepts stop_sequence with a closing tag', () => {
    expect(judge({ stopReason: 'stop_sequence', stopSequence: '###' }).accepted).toBe(true);
  });

  test('rejects stop_sequence without the tag when the tag was not among the stop sequences', () => {
    // The closing tag is never appended for the model: without it there is no suggestion
    const verdict = judge({ stopReason: 'stop_sequence', stopSequence: '</teksti>', text: '<teksti>Äiti tuli kotiin.' });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe('missing_tag');
    expect(verdict.inner).toBeNull();
    expect(verdict.cleaned.hadCloseTag).toBe(false);
  });

  test('rejects max_tokens even when a closing tag is present', () => {
    const verdict = judge({ stopReason: 'max_tokens', truncated: true });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe('max_tokens');
    expect(verdict.reasonText).toBe('Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.');
    expect(verdict.inner).toBeNull();
  });

  test('rejects max_tokens with empty text as reasoning_exhausted when thinking was seen, as max_tokens when not', () => {
    const exhausted = judge({ stopReason: 'max_tokens', text: ' \n', sawThinking: true });
    expect(exhausted.reason).toBe('reasoning_exhausted');
    expect(exhausted.reasonText).toBe('Ei ehdotusta: mallin päättely käytti koko vastausrajan. Suurenna mallin päättelyvaraa tietopaneelin Tekoäly-välilehdellä.');

    expect(judge({ stopReason: 'max_tokens', text: '', sawThinking: false }).reason).toBe('max_tokens');
    // Thinking was seen but some text arrived: an ordinary cut
    expect(judge({ stopReason: 'max_tokens', text: '<teksti>Äiti tu', sawThinking: true }).reason).toBe('max_tokens');
  });

  test('rejects a refusal and appends the explanation', () => {
    const explained = judge({ stopReason: 'refusal', refused: true, text: '', refusal: { category: 'cyber', explanation: 'Pyyntö koskee haittaohjelmaa.' } });
    expect(explained.accepted).toBe(false);
    expect(explained.reason).toBe('refusal');
    expect(explained.reasonText).toBe('Ei ehdotusta: malli kieltäytyi tehtävästä. Pyyntö koskee haittaohjelmaa.');

    const bare = judge({ stopReason: 'refusal', text: '', refusal: { category: null, explanation: null } });
    expect(bare.reasonText).toBe('Ei ehdotusta: malli kieltäytyi tehtävästä.');
    expect(judge({ stopReason: 'refusal', refusal: null }).reasonText).toBe('Ei ehdotusta: malli kieltäytyi tehtävästä.');
  });

  test('rejects end_turn without a closing tag (a plain-text refusal from an open model)', () => {
    const verdict = judge({ text: 'En valitettavasti voi auttaa tässä.' });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe('missing_tag');
    expect(verdict.reasonText).toBe('Ei ehdotusta: vastauksesta puuttuu sulkeva </teksti>-tagi. Vastaus katkesi tai malli vastasi muulla kuin muokatulla tekstillä.');
    expect(verdict.inner).toBeNull();
    // What clean made of the answer is still there for a display
    expect(verdict.cleaned.text).toBe('En valitettavasti voi auttaa tässä.');
  });

  test('rejects whitespace-only inner text', () => {
    const verdict = judge({ text: '<teksti>\n   \n</teksti>' });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe('empty');
    expect(verdict.reasonText).toBe('Ei ehdotusta: malli palautti tyhjän tekstin.');

    // No text at all is the same reason, found before the tags are looked at
    const clean = jest.fn(stubClean);
    const blank = judge({ text: '  \n ' }, { clean });
    expect(blank.reason).toBe('empty');
    expect(clean).not.toHaveBeenCalled();
    expect(blank.cleaned).toBeNull();
  });

  test('rejects a cancelled request', () => {
    const verdict = judge({ stopReason: 'cancelled', cancelled: true, text: '<teksti>Valmis.</teksti>' });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe('cancelled');
    expect(verdict.reasonText).toBe('Pyyntö pysäytettiin.');
  });

  test('rejects an error result and carries the error message', () => {
    const message = 'Cherry Studioon ei saada yhteyttä (http://127.0.0.1:23333). Varmista, että Cherry Studio on käynnissä ja sen API Gateway päällä.';
    const verdict = judge({ ok: false, stopReason: 'error', text: '<teksti>Osa ehti tulla.</teksti>', error: { code: 'unreachable', message, status: null } });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe('error');
    expect(verdict.reasonText).toBe(`Ei ehdotusta: ${message}`);
    expect(verdict.inner).toBeNull();
  });

  test('rejects an unknown stop reason, and accepts it with a tag when the constant allows', () => {
    const verdict = judge({ stopReason: 'unknown' });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe('stop_reason');
    expect(verdict.reasonText).toBe('Ei ehdotusta: vastaus päättyi odottamatta (syy: tuntematon).');

    const other = judge({ stopReason: 'pause_turn' });
    expect(other.reason).toBe('stop_reason');
    expect(other.reasonText).toBe('Ei ehdotusta: vastaus päättyi odottamatta (syy: pause_turn).');

    const allowing = { ...CLIENT_CONSTANTS, ACCEPT_UNKNOWN_STOP_REASON_WITH_TAG: true };
    expect(judge({ stopReason: 'unknown' }, { constants: allowing }).accepted).toBe(true);
    // The constant lets the tag decide; without the tag there is still no suggestion
    expect(judge({ stopReason: 'unknown', text: 'Ei tagia.' }, { constants: allowing }).reason).toBe('missing_tag');
    // And it opens the door for 'unknown' only
    expect(judge({ stopReason: 'pause_turn' }, { constants: allowing }).reason).toBe('stop_reason');
  });

  test('rejects when the prompt was truncated', () => {
    const verdict = judge({ promptTruncated: true });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe('prompt_truncated');
    expect(verdict.reasonText).toBe('Ei ehdotusta: malli ei nähnyt koko kehotetta. Pienennä kontekstia tai tarkista mallin ikkunan koko tietopaneelin Tekoäly-välilehdeltä.');
    expect(verdict.inner).toBeNull();
  });

  test('the reasons are tried in the agreed order', () => {
    // error > cancelled > refusal > reasoning_exhausted > max_tokens > stop_reason > empty > missing_tag > empty inside > prompt_truncated
    const everything = { ok: false, error: { code: 'x', message: 'virhe' }, cancelled: true, stopReason: 'refusal', promptTruncated: true, text: '' };
    expect(judge(everything).reason).toBe('error');
    expect(judge({ ...everything, ok: true }).reason).toBe('cancelled');
    expect(judge({ ...everything, ok: true, cancelled: false }).reason).toBe('refusal');
    expect(judge({ stopReason: 'max_tokens', text: '', sawThinking: true, promptTruncated: true }).reason).toBe('reasoning_exhausted');
    expect(judge({ stopReason: 'max_tokens', promptTruncated: true }).reason).toBe('max_tokens');
    expect(judge({ stopReason: 'tool_use', text: '', promptTruncated: true }).reason).toBe('stop_reason');
    expect(judge({ text: '', promptTruncated: true }).reason).toBe('empty');
    expect(judge({ text: 'ei tagia', promptTruncated: true }).reason).toBe('missing_tag');
    expect(judge({ text: '<teksti></teksti>', promptTruncated: true }).reason).toBe('empty');
    expect(judge({ promptTruncated: true }).reason).toBe('prompt_truncated');
  });

  test('a closing tag is not enough: only a complete cleaned text is accepted (contracts 3)', () => {
    // A cleaner that saw the closing tag but found the reply incomplete
    const incomplete = (raw, opts) => ({ ...stubClean(raw, opts), complete: false });
    const verdict = judge({}, { clean: incomplete });
    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toBe('missing_tag');
    expect(verdict.inner).toBeNull();
    expect(verdict.cleaned.hadCloseTag).toBe(true);

    // The same through the real cleanModelOutput: a stray closing tag after the answer
    const { cleanModelOutput } = require('../../src/services/ai/cleanModelOutput.js');
    const stray = judge({ text: '<teksti>Oikea vastaus.</teksti>\nHuom: lisäsin </teksti>-tagin loppuun.' }, { clean: cleanModelOutput });
    expect(stray.reason).toBe('missing_tag');
    // and a format example followed by an answer that never closed
    const unclosed = judge({ text: 'Muoto: <teksti>esimerkki</teksti>\n<teksti>Oikea vastaus.' }, { clean: cleanModelOutput });
    expect(unclosed.reason).toBe('missing_tag');
    expect(judge({ text: '<teksti>Oikea vastaus.</teksti>' }, { clean: cleanModelOutput }).inner).toBe('Oikea vastaus.');
  });

  test('passes the tag and the original text to clean, and uses the tag in the reason', () => {
    const clean = jest.fn(stubClean);
    const original = 'Äiti tuli kottiin.';
    const verdict = judge({ text: '<korjattu>Äiti tuli kotiin.</korjattu>' }, { clean, tag: 'korjattu', original });

    expect(clean).toHaveBeenCalledTimes(1);
    expect(clean).toHaveBeenCalledWith('<korjattu>Äiti tuli kotiin.</korjattu>', { tag: 'korjattu', original });
    expect(verdict.accepted).toBe(true);
    expect(verdict.inner).toBe('Äiti tuli kotiin.');

    // The default tag
    judge({}, { clean });
    expect(clean).toHaveBeenLastCalledWith('<teksti>Äiti tuli kotiin.</teksti>', { tag: 'teksti', original: undefined });

    expect(judge({ text: 'ei tagia' }, { tag: 'korjattu' }).reasonText)
      .toBe('Ei ehdotusta: vastauksesta puuttuu sulkeva </korjattu>-tagi. Vastaus katkesi tai malli vastasi muulla kuin muokatulla tekstillä.');
  });

  test('without a clean function the real cleanModelOutput module is required when it is first needed', () => {
    const real = jest.fn(stubClean);
    jest.isolateModules(() => {
      jest.doMock('../../src/services/ai/cleanModelOutput.js', () => ({ cleanModelOutput: real }), { virtual: true });
      const isolated = require('../../src/services/ai/aiClient');

      // Not at load, and not for an answer that is rejected before the tags matter
      expect(isolated.judgeEdit(aiResult({ ok: false, error: { code: 'x', message: 'virhe' } })).reason).toBe('error');
      expect(real).not.toHaveBeenCalled();

      const verdict = isolated.judgeEdit(aiResult(), { original: 'Äiti tuli kottiin.' });
      expect(real).toHaveBeenCalledWith('<teksti>Äiti tuli kotiin.</teksti>', { tag: 'teksti', original: 'Äiti tuli kottiin.' });
      expect(verdict.accepted).toBe(true);
      expect(verdict.inner).toBe('Äiti tuli kotiin.');
    });
    jest.dontMock('../../src/services/ai/cleanModelOutput.js');
  });

  test('every reason code has a Finnish text; all but `cancelled` start with `Ei ehdotusta`', () => {
    const codes = ['max_tokens', 'reasoning_exhausted', 'refusal', 'missing_tag', 'empty', 'cancelled', 'prompt_truncated', 'stop_reason', 'error'];
    const texts = codes.map(code => reasonText(code, 'yksityiskohta'));

    for (const [index, text] of texts.entries()) {
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(10);
      if (codes[index] === 'cancelled') expect(text).toBe('Pyyntö pysäytettiin.');
      else expect(text.startsWith('Ei ehdotusta')).toBe(true);
    }
    // No two reasons read the same
    expect(new Set(texts).size).toBe(codes.length);

    expect(reasonText('stop_reason', 'pause_turn')).toBe('Ei ehdotusta: vastaus päättyi odottamatta (syy: pause_turn).');
    expect(reasonText('error', 'Palvelin rajoittaa pyyntöjä juuri nyt. Yritä hetken kuluttua uudelleen.'))
      .toBe('Ei ehdotusta: Palvelin rajoittaa pyyntöjä juuri nyt. Yritä hetken kuluttua uudelleen.');
    expect(reasonText('refusal', '')).toBe('Ei ehdotusta: malli kieltäytyi tehtävästä.');
    expect(reasonText('missing_tag')).toContain('</teksti>-tagi');
    expect(reasonText('missing_tag', undefined, 'korjattu')).toContain('</korjattu>-tagi');
    // A code this table does not know still says the one thing that is true
    expect(reasonText('jotain-uutta')).toBe('Ei ehdotusta.');
  });
});

describe('stopNote', () => {
  test('stopNote returns the four Finnish notes and an empty string for end_turn', () => {
    expect(stopNote(aiResult({ stopReason: 'max_tokens', truncated: true }))).toBe('vastaus katkesi');
    expect(stopNote(aiResult({ stopReason: 'cancelled', cancelled: true }))).toBe('pysäytetty');
    expect(stopNote(aiResult({ stopReason: 'refusal', refused: true }))).toBe('malli kieltäytyi vastaamasta');
    expect(stopNote(aiResult({ ok: false, stopReason: 'error', error: { code: 'unknown', message: 'x', status: null } }))).toBe('virhe');
    expect(stopNote(aiResult())).toBe('');
    expect(stopNote(aiResult({ stopReason: 'stop_sequence' }))).toBe('');
    expect(stopNote(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// createAIClient: sending
// ---------------------------------------------------------------------------

describe('createAIClient', () => {
  test('request sends the model of the role and maxTokens plus the model\'s headroom', async () => {
    const context = setup();
    const messages = [{ role: 'user', content: MANUSCRIPT }];

    const handle = context.client.request({ role: 'edit', system: 'Olet kielenhuoltaja.', messages, maxTokens: 600 });
    await until(() => context.bridge.calls.length === 1);

    // The edit role has its own model, and that model's headroom is 400
    expect(context.bridge.calls[0].request).toEqual({
      id: handle.id,
      system: 'Olet kielenhuoltaja.',
      messages: [{ role: 'user', content: MANUSCRIPT }],
      model: EDIT_MODEL,
      maxTokens: 1000
    });
    expect(context.bridge.calls[0].request.messages).not.toBe(messages);

    context.bridge.calls[0].answer({ text: 'Valmis.' });
    const result = await handle.result;
    expect(result.maxTokensSent).toBe(1000);
    expect(result.model).toBe(EDIT_MODEL);
  });

  test('a role without its own model uses the default gateway model', async () => {
    const context = setup();
    const handle = context.client.request({ role: 'prose', messages: user('Hei'), maxTokens: 600 });
    await until(() => context.bridge.calls.length === 1);

    expect(context.bridge.calls[0].request.model).toBe(DEFAULT_MODEL);
    // No stored headroom for that model: the gateway default of 2 000
    expect(context.bridge.calls[0].request.maxTokens).toBe(2600);
    expect(context.client.modelFor('prose')).toBe(DEFAULT_MODEL);
    expect(context.client.modelFor('analysis')).toBe(DEFAULT_MODEL);
    expect(context.client.modelFor('edit')).toBe(EDIT_MODEL);
    expect(context.client.modelFor('tuntematon')).toBe(DEFAULT_MODEL);
    expect(context.client.modelFor(undefined)).toBe(DEFAULT_MODEL);
    expect(context.client.modelFor('constructor')).toBe(DEFAULT_MODEL);

    context.bridge.calls[0].answer();
    await handle.result;
  });

  test('in anthropic mode every role resolves to the model field', async () => {
    const context = setup({ config: anthropicConfig() });
    await context.client.getConfig();

    for (const role of ROLES) {
      const model = context.client.modelFor(role);
      expect(typeof model).toBe('string');
      expect(model).toBe('claude-test-model');
    }

    const result = await roundTrip(context, { role: 'edit' });
    // The gateway role models are ignored and the Claude headroom is added
    expect(context.bridge.calls[0].request.model).toBe('claude-test-model');
    expect(context.bridge.calls[0].request.maxTokens).toBe(16600);
    expect(result.provider).toBe('anthropic');
  });

  test('an explicit model overrides the role', async () => {
    const context = setup({ config: cherryConfig({ modelSettings: { [EDIT_MODEL]: { headroom: 400 }, 'c91f:toinen': { headroom: 100 } } }) });
    await roundTrip(context, { role: 'edit', model: 'c91f:toinen' });

    expect(context.bridge.calls[0].request.model).toBe('c91f:toinen');
    // The headroom is that of the model that is used
    expect(context.bridge.calls[0].request.maxTokens).toBe(700);
  });

  test('temperature, thinking off and stop sequences are passed through only when given', async () => {
    const context = setup();
    await roundTrip(context, { temperature: 0, thinking: 'off', stopSequences: ['###'] });
    expect(context.bridge.calls[0].request).toMatchObject({ temperature: 0, thinking: 'off', stopSequences: ['###'] });

    await roundTrip(context, {});
    const plain = context.bridge.calls[1].request;
    expect(Object.keys(plain).sort()).toEqual(['id', 'maxTokens', 'messages', 'model', 'system']);
    expect(plain.system).toBe('');

    // Only 'off' is a thinking value; anything else is left to the model
    await roundTrip(context, { thinking: 'on', stopSequences: [] });
    expect('thinking' in context.bridge.calls[2].request).toBe(false);
    expect('stopSequences' in context.bridge.calls[2].request).toBe(false);
  });

  test('onText receives the delta and the text so far; result.text comes from the final result', async () => {
    const context = setup();
    const seen = [];
    const handle = context.client.request({ messages: user('Hei'), maxTokens: 600, onText: (delta, soFar) => seen.push([delta, soFar]) });
    await until(() => context.bridge.calls.length === 1);

    context.bridge.calls[0].chunk({ type: 'text', text: '”Kyl' });
    context.bridge.calls[0].chunk({ type: 'text', text: 'lä.” – ' });
    context.bridge.calls[0].chunk({ type: 'text', text: 'Niin' });
    // Main's own text is the answer; the chunks were for the display only
    context.bridge.calls[0].answer({ text: '”Kyllä.” – Niin.' });
    const result = await handle.result;

    expect(seen).toEqual([
      ['”Kyl', '”Kyl'],
      ['lä.” – ', '”Kyllä.” – '],
      ['Niin', '”Kyllä.” – Niin']
    ]);
    expect(result.text).toBe('”Kyllä.” – Niin.');
    expect(result.ok).toBe(true);

    // Chunks that come after the answer are ignored
    context.bridge.calls[0].chunk({ type: 'text', text: ' myöhässä' });
    expect(seen).toHaveLength(3);
  });

  test('onPhase receives connecting, thinking and writing in order', async () => {
    const context = setup();
    const phases = [];
    const handle = context.client.request({ messages: user('Hei'), maxTokens: 600, onPhase: (phase) => phases.push(phase) });
    await until(() => context.bridge.calls.length === 1);
    expect(phases).toEqual(['connecting']);

    context.bridge.calls[0].chunk({ type: 'phase', phase: 'thinking' });
    context.bridge.calls[0].chunk({ type: 'phase', phase: 'writing' });
    context.bridge.calls[0].chunk({ type: 'text', text: 'Hei' });
    context.bridge.calls[0].answer({ text: 'Hei', sawThinking: true });
    const result = await handle.result;

    expect(phases).toEqual(['connecting', 'thinking', 'writing']);
    expect(result.sawThinking).toBe(true);
  });

  test('a callback that throws does not fail the request', async () => {
    const context = setup();
    const handle = context.client.request({
      messages: user('Hei'),
      maxTokens: 600,
      onText: () => { throw new Error('näyttö rikki'); },
      onPhase: () => { throw new Error('näyttö rikki'); }
    });
    await until(() => context.bridge.calls.length === 1);
    context.bridge.calls[0].chunk({ type: 'text', text: 'Hei' });
    context.bridge.calls[0].answer({ text: 'Hei' });

    await expect(handle.result).resolves.toMatchObject({ ok: true, text: 'Hei' });
  });

  test('the id is available before the result resolves', async () => {
    const context = setup();
    const handle = context.client.request({ messages: user('Hei'), maxTokens: 600 });

    // Synchronously, before anything was awaited
    expect(handle.id).toBe('ai-test-1');
    expect(typeof handle.cancel).toBe('function');
    expect(handle.result).toBeInstanceOf(Promise);

    await until(() => context.bridge.calls.length === 1);
    expect(context.bridge.calls[0].request.id).toBe(handle.id);
    context.bridge.calls[0].answer();
    expect((await handle.result).id).toBe(handle.id);

    // The default ids fit what the main process accepts
    const plain = createAIClient({ bridge: fakeBridge(), settings: null });
    const first = plain.request({ messages: user('a'), maxTokens: 10 });
    const second = plain.request({ messages: user('b'), maxTokens: 10 });
    expect(first.id).toMatch(/^ai-[0-9a-z]+-\d+$/);
    expect(first.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(second.id).not.toBe(first.id);
    first.cancel();
    second.cancel();
    await Promise.all([first.result, second.result]);
  });

  test('cancel before the request is sent resolves cancelled without calling the bridge', async () => {
    const context = setup();
    const handle = context.client.requestEdit({ messages: user('Hei'), maxTokens: 600 });
    handle.cancel();
    handle.cancel();
    const result = await handle.result;

    expect(result.ok).toBe(true);
    expect(result.cancelled).toBe(true);
    expect(result.stopReason).toBe('cancelled');
    expect(result.text).toBe('');
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('cancelled');
    expect(context.bridge.aiRequest).not.toHaveBeenCalled();
    expect(context.bridge.aiCancel).not.toHaveBeenCalled();
    // Nothing was requested, so there is nothing to log
    expect(context.rows).toEqual([]);
    expect(result.logId).toBeNull();
  });

  test('cancel inside onPhase(\'connecting\') never reaches the bridge', async () => {
    const context = setup();
    let handle = null;
    handle = context.client.request({
      messages: user('Hei'),
      maxTokens: 600,
      onPhase: (phase) => {
        if (phase === 'connecting') handle.cancel();
      }
    });
    const result = await handle.result;

    expect(context.bridge.aiRequest).not.toHaveBeenCalled();
    expect(result.cancelled).toBe(true);
    expect(result.stopReason).toBe('cancelled');
    expect(context.rows).toEqual([]);
  });

  test('cancel resolves cancelled also when the request ends at the switch or at a missing bridge', async () => {
    const settings = createSettingsStore(null);
    await settings.set('aiOff', true);
    const context = setup({ settings });
    const handle = context.client.requestEdit({ messages: user('Hei'), maxTokens: 600 });
    handle.cancel();
    const off = await handle.result;
    expect(off.cancelled).toBe(true);
    expect(off.stopReason).toBe('cancelled');
    expect(off.error).toBeNull();
    expect(off.reason).toBe('cancelled');

    const bare = setup({ bridge: null });
    const second = bare.client.request({ messages: user('Hei'), maxTokens: 600 });
    second.cancel();
    const missing = await second.result;
    expect(missing.cancelled).toBe(true);
    expect(missing.ok).toBe(true);
  });

  test('cancel during the stream calls bridge.aiCancel with the id, once', async () => {
    const context = setup();
    const handle = context.client.request({ messages: user('Hei'), maxTokens: 600 });
    await until(() => context.bridge.calls.length === 1);
    context.bridge.calls[0].chunk({ type: 'text', text: 'Kesken' });

    handle.cancel();
    handle.cancel();
    context.client.cancelAll();
    const result = await handle.result;

    expect(context.bridge.aiCancel).toHaveBeenCalledTimes(1);
    expect(context.bridge.aiCancel).toHaveBeenCalledWith(handle.id);
    expect(result.cancelled).toBe(true);
    expect(result.stopReason).toBe('cancelled');
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Kesken jäi');

    // Cancelling a finished request does nothing
    handle.cancel();
    expect(context.bridge.aiCancel).toHaveBeenCalledTimes(1);
  });

  test('chunks that arrive after cancel are not shown', async () => {
    const context = setup();
    context.bridge.answerCancels = false;
    const seen = [];
    const handle = context.client.request({ messages: user('Hei'), maxTokens: 600, onText: (delta) => seen.push(delta) });
    await until(() => context.bridge.calls.length === 1);

    context.bridge.calls[0].chunk({ type: 'text', text: 'Ennen' });
    handle.cancel();
    context.bridge.calls[0].chunk({ type: 'text', text: ' jälkeen' });
    context.bridge.calls[0].answer({ stopReason: 'cancelled', text: 'Ennen' });
    await handle.result;

    expect(seen).toEqual(['Ennen']);
  });

  test('the bridge is not called when Tekoäly pois is on', async () => {
    const settings = createSettingsStore(null);
    await settings.set('aiOff', true);
    const context = setup({ settings });

    const result = await context.client.request({ messages: user('Hei'), maxTokens: 600 }).result;

    expect(result.ok).toBe(false);
    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual({ code: 'ai_off', message: 'Tekoäly pois -asetus on päällä.', status: null });
    expect(context.bridge.aiRequest).not.toHaveBeenCalled();
    expect(context.rows).toEqual([]);

    const edit = await context.client.requestEdit({ messages: user('Hei'), maxTokens: 600 }).result;
    expect(edit.accepted).toBe(false);
    expect(edit.reason).toBe('error');
    expect(edit.reasonText).toBe('Ei ehdotusta: Tekoäly pois -asetus on päällä.');
    expect(context.bridge.aiRequest).not.toHaveBeenCalled();

    // Switched back, requests go out again
    await settings.set('aiOff', false);
    await roundTrip(context, {});
    expect(context.bridge.aiRequest).toHaveBeenCalledTimes(1);
  });

  test('the switch is read only after the settings have loaded', async () => {
    // The file says the switch is on; before the load the store still answers with the fallback
    const prefs = {
      prefsGet: jest.fn(async () => ({ success: true, prefs: { aiOff: true } })),
      prefsSet: jest.fn(async () => ({ success: true, prefs: {} })),
      onPrefsChanged: jest.fn()
    };
    const settings = createSettingsStore(prefs);
    const context = setup({ settings });
    expect(settings.get('aiOff', false)).toBe(false);

    const result = await context.client.request({ messages: user('Hei'), maxTokens: 600 }).result;

    expect(prefs.prefsGet).toHaveBeenCalledTimes(1);
    expect(result.error.code).toBe('ai_off');
    expect(context.bridge.aiRequest).not.toHaveBeenCalled();
  });

  test('without a bridge the result is the no_bridge error', async () => {
    for (const bridge of [null, {}, { aiGetProvider: async () => ({ success: true }) }]) {
      const context = setup({ bridge });
      const result = await context.client.request({ messages: user('Hei'), maxTokens: 600 }).result;

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ code: 'no_bridge', message: 'Tekoälypyynnöt toimivat vain FAUST-sovelluksessa.', status: null });
      expect(result.stopReason).toBe('error');
      expect(context.rows).toEqual([]);
    }
  });

  test('the result never rejects when the bridge throws', async () => {
    const context = setup();

    const rejecting = context.client.request({ messages: user('Hei'), maxTokens: 600 });
    await until(() => context.bridge.calls.length === 1);
    context.bridge.calls[0].chunk({ type: 'text', text: 'Osa ehti' });
    context.bridge.calls[0].fail(new Error('ipc rikki'));
    const result = await rejecting.result;
    expect(result.ok).toBe(false);
    expect(result.stopReason).toBe('error');
    expect(result.error).toEqual({ code: 'unknown', message: 'Tekoälypyyntö epäonnistui: ipc rikki', status: null });
    // What had been shown is not thrown away
    expect(result.text).toBe('Osa ehti');
    expect(stopNote(result)).toBe('virhe');

    // A bridge that throws at once
    context.bridge.aiRequest.mockImplementationOnce(() => {
      throw new Error('ei kanavaa');
    });
    await expect(context.client.request({ messages: user('Hei'), maxTokens: 600 }).result)
      .resolves.toMatchObject({ ok: false, error: { code: 'unknown', message: 'Tekoälypyyntö epäonnistui: ei kanavaa' } });

    // A bridge that answers with nothing
    context.bridge.aiRequest.mockImplementationOnce(async () => undefined);
    await expect(context.client.requestEdit({ messages: user('Hei'), maxTokens: 600 }).result)
      .resolves.toMatchObject({ ok: false, accepted: false, reason: 'error', error: { code: 'unknown' } });

    // Settings that cannot be fetched: the request still goes out, with main's default model
    const broken = fakeBridge();
    broken.aiGetProvider = jest.fn(async () => {
      throw new Error('asetukset rikki');
    });
    const second = setup({ bridge: broken });
    const handle = second.client.request({ messages: user('Hei'), maxTokens: 600 });
    await until(() => broken.calls.length === 1);
    expect(broken.calls[0].request.model).toBe('');
    broken.calls[0].answer({ text: 'ok', model: DEFAULT_MODEL, requestedModel: DEFAULT_MODEL });
    await expect(handle.result).resolves.toMatchObject({ ok: true, model: DEFAULT_MODEL });

    expect(context.client.activeCount()).toBe(0);
  });

  test('a request without an answer budget is sent without one, for main to refuse', async () => {
    const context = setup();
    for (const maxTokens of [undefined, '600', null]) {
      const before = context.bridge.calls.length;
      const handle = context.client.request({ messages: user('Hei'), maxTokens });
      await until(() => context.bridge.calls.length === before + 1);
      // Never a text like "6002000": the headroom is added to numbers only
      expect(context.bridge.calls[before].request.maxTokens).toBeUndefined();
      context.bridge.calls[before].answer({ ok: false, stopReason: 'error', error: { code: 'invalid_request', message: 'Virheellinen tekoälypyyntö: vastausraja puuttuu', status: null } });
      await expect(handle.result).resolves.toMatchObject({ ok: false, error: { code: 'invalid_request' } });
    }
  });

  test('an error result of the main process is passed on with its code and message', async () => {
    const context = setup();
    const error = { code: 'model_not_found', message: 'Mallia ”c91f:poistettu” ei löydy Cherry Studiosta. Valitse malli uudelleen tietopaneelin Tekoäly-välilehdellä.', status: 400 };
    const result = await roundTrip(context, {}, { ok: false, stopReason: 'error', text: '', error });

    expect(result.ok).toBe(false);
    expect(result.error).toEqual(error);
    expect(result.cancelled).toBe(false);
    expect(context.rows[0]).toMatchObject({ outcome: 'error', reason: 'model_not_found', stopReason: 'error' });
    // The row carries the code, never the message
    expect(JSON.stringify(context.rows[0])).not.toContain('poistettu');
  });

  test('the result has the whole shape, with the flags that follow from the stop reason', async () => {
    const context = setup();
    const result = await roundTrip(
      context,
      { role: 'edit', system: 'Ohje.', messages: user('Hei'), meta: { action: 'quick-edit', actionLabel: 'Tiivistä', instruction: 'Tiivistä.' } },
      { text: 'Katkesi', stopReason: 'max_tokens', usage: { inputTokens: 20, outputTokens: 1000 }, sawThinking: true, systemAsUser: true }
    );

    expect(result).toEqual({
      ok: true,
      id: 'ai-test-1',
      text: 'Katkesi',
      stopReason: 'max_tokens',
      stopSequence: null,
      usage: { inputTokens: 20, outputTokens: 1000 },
      model: EDIT_MODEL,
      requestedModel: EDIT_MODEL,
      provider: 'cherry',
      maxTokensSent: 1000,
      systemAsUser: true,
      sawThinking: true,
      refusal: null,
      ms: 1200,
      cancelled: false,
      truncated: true,
      refused: false,
      promptChars: 8,
      promptTruncated: false,
      retried: false,
      error: null,
      logId: context.rows[0].id,
      logMeta: {
        source: 'faust',
        action: 'quick-edit',
        actionLabel: 'Tiivistä',
        instruction: 'Tiivistä.',
        provider: 'cherry',
        model: EDIT_MODEL,
        requestLogId: context.rows[0].id
      }
    });
    expect(stopNote(result)).toBe('vastaus katkesi');

    const refused = await roundTrip(context, {}, { stopReason: 'refusal', refusal: { category: 'cyber', explanation: 'Ei käy.' } });
    expect(refused.refused).toBe(true);
    expect(refused.refusal).toEqual({ category: 'cyber', explanation: 'Ei käy.' });
    expect(stopNote(refused)).toBe('malli kieltäytyi vastaamasta');
  });

  // -------------------------------------------------------------------------
  // Running requests
  // -------------------------------------------------------------------------

  test('cancelAll cancels every running request; activeCount and onActivity follow', async () => {
    const context = setup();
    const counts = [];
    const stop = context.client.onActivity((count) => counts.push(count));
    expect(context.client.activeCount()).toBe(0);

    const first = context.client.request({ messages: user('a'), maxTokens: 100 });
    const second = context.client.request({ messages: user('b'), maxTokens: 100 });
    const third = context.client.requestEdit({ messages: user('c'), maxTokens: 100 });
    expect(context.client.activeCount()).toBe(3);
    expect(counts).toEqual([1, 2, 3]);
    await until(() => context.bridge.calls.length === 3);

    expect(context.client.cancelAll()).toBe(3);
    await Promise.all([first.result, second.result, third.result]);

    expect(context.bridge.aiCancel.mock.calls.map(call => call[0]).sort()).toEqual([first.id, second.id, third.id].sort());
    expect(context.client.activeCount()).toBe(0);
    expect(counts).toEqual([1, 2, 3, 2, 1, 0]);
    expect(context.client.cancelAll()).toBe(0);

    // An unsubscribed listener hears nothing more
    stop();
    await roundTrip(context, {});
    expect(counts).toEqual([1, 2, 3, 2, 1, 0]);
  });

  test('cancelAll resolves every running result as cancelled', async () => {
    const context = setup();
    // Main answers by itself here, each request in its own way
    context.bridge.answerCancels = false;
    const first = context.client.request({ messages: user('a'), maxTokens: 100 });
    const second = context.client.requestEdit({ messages: user('b'), maxTokens: 100 });
    const third = context.client.request({ messages: user('c'), maxTokens: 100 });
    await until(() => context.bridge.calls.length === 3);

    context.client.cancelAll();
    // One was stopped in main, one had just finished, one failed on the way down
    context.bridge.calls[0].answer({ stopReason: 'cancelled', text: 'Puolikas' });
    context.bridge.calls[1].answer({ stopReason: 'end_turn', text: '<teksti>Ehti valmiiksi.</teksti>' });
    context.bridge.calls[2].answer({ ok: false, stopReason: 'error', text: '', error: { code: 'stream_error', message: 'Mallin vastaus katkesi palvelimen virheeseen. Saapunut teksti on tallessa; yritä uudelleen.', status: null } });
    const results = await Promise.all([first.result, second.result, third.result]);

    for (const result of results) {
      expect(result.cancelled).toBe(true);
      expect(result.stopReason).toBe('cancelled');
      expect(result.ok).toBe(true);
      expect(result.error).toBeNull();
      expect(stopNote(result)).toBe('pysäytetty');
    }
    expect(results[0].text).toBe('Puolikas');
    // A stop is a stop: the edit that had just finished is not turned into a suggestion
    expect(results[1].accepted).toBe(false);
    expect(results[1].reason).toBe('cancelled');
    expect(context.rows.map(row => row.outcome)).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });

  test('with a cooldown the next request waits after a cancel before it sends', async () => {
    const timers = [];
    const context = setup({
      deps: {
        constants: { ...CLIENT_CONSTANTS, POST_CANCEL_COOLDOWN_MS: 500 },
        setTimer: (fn, ms) => timers.push({ fn, ms })
      }
    });

    const first = context.client.request({ messages: user('a'), maxTokens: 100 });
    await until(() => context.bridge.calls.length === 1);
    first.cancel();
    await first.result;

    context.tick(200);
    const second = context.client.request({ messages: user('b'), maxTokens: 100 });
    await until(() => timers.length === 1);
    expect(timers[0].ms).toBe(300);
    expect(context.bridge.calls).toHaveLength(1);

    timers[0].fn();
    await until(() => context.bridge.calls.length === 2);
    context.bridge.calls[1].answer();
    await second.result;

    // Long after the cancel nothing waits
    context.tick(1000);
    await roundTrip(context, {});
    expect(timers).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Usage rows
  // -------------------------------------------------------------------------

  test('one request row goes to the usage sink, with tokens when the server sent them and null when not', async () => {
    const context = setup();

    const withUsage = await roundTrip(context, { role: 'edit' }, { text: 'Valmis.', usage: { inputTokens: 1600, outputTokens: 120 }, sawThinking: true });
    expect(context.rows).toHaveLength(1);
    expect(context.rows[0]).toEqual({
      id: withUsage.logId,
      at: new Date(1794859460964).toISOString(),
      kind: 'request',
      action: '',
      actionLabel: '',
      instruction: '',
      source: 'faust',
      provider: 'cherry',
      model: EDIT_MODEL,
      outcome: 'ok',
      reason: null,
      stopReason: 'end_turn',
      requests: 1,
      runId: null,
      chapterId: null,
      tokensIn: 1600,
      tokensOut: 120,
      contextUsed: 0.05,
      promptChars: 3,
      sawThinking: true
    });
    expect(withUsage.logId).toMatch(/^log-/);

    const without = await roundTrip(context, { role: 'edit' }, { text: 'Valmis.', usage: null });
    expect(context.rows).toHaveLength(2);
    expect(context.rows[1]).toMatchObject({ tokensIn: null, tokensOut: null, contextUsed: null, outcome: 'ok' });
    expect(without.usage).toBeNull();
    expect(without.logId).toBe(context.rows[1].id);
    expect(without.logId).not.toBe(withUsage.logId);

    // One number alone is kept as it came
    await roundTrip(context, {}, { usage: { inputTokens: null, outputTokens: 7 } });
    expect(context.rows[2]).toMatchObject({ tokensIn: null, tokensOut: 7, contextUsed: null });

    // A stopped request is a row too
    const handle = context.client.request({ messages: user('Hei'), maxTokens: 600 });
    await until(() => context.bridge.calls.length === 4);
    handle.cancel();
    await handle.result;
    expect(context.rows[3]).toMatchObject({ outcome: 'cancelled', reason: null, stopReason: 'cancelled' });
  });

  test('log false writes nothing', async () => {
    const context = setup();
    const result = await roundTrip(context, { log: false }, { text: 'toimii', usage: { inputTokens: 10, outputTokens: 2 } });

    expect(context.rows).toEqual([]);
    expect(result.logId).toBeNull();
    expect(result.logMeta.requestLogId).toBeNull();
    expect(result.ok).toBe(true);
  });

  test('without a sink nothing is logged and the result has no row id', async () => {
    const context = setup({ sink: false });
    const result = await roundTrip(context, {}, { text: 'ok' });
    expect(result.logId).toBeNull();
    expect(result.logMeta).toMatchObject({ source: 'faust', requestLogId: null });

    // A sink that throws does not fail the request, and is removed with null
    const second = setup();
    second.client.setUsageSink(() => {
      throw new Error('loki rikki');
    });
    await expect(roundTrip(second, {}, { text: 'ok' })).resolves.toMatchObject({ ok: true, logId: null });
    second.client.setUsageSink(null);
    await expect(roundTrip(second, {}, { text: 'ok' })).resolves.toMatchObject({ ok: true, logId: null });
  });

  test('meta.instruction, action, chapterId and runId reach the row; the prompt and the manuscript text do not', async () => {
    const context = setup();
    const system = 'Olet kustannustoimittaja. SALAINEN-JÄRJESTELMÄOHJE.';
    const instruction = 'Tiivistä – älä muuta ”sitaatteja”';

    const result = await roundTrip(context, {
      role: 'edit',
      system,
      messages: user(`<teksti>${MANUSCRIPT}</teksti>`),
      meta: { action: 'quick-edit', actionLabel: 'Tiivistä', instruction, chapterId: 'chapter-7', runId: 'run-3', source: 'editor' }
    }, { text: `<teksti>${MANUSCRIPT}</teksti>`, usage: { inputTokens: 90, outputTokens: 80 } }, 'requestEdit');

    const row = context.rows[0];
    expect(row).toMatchObject({
      action: 'quick-edit',
      actionLabel: 'Tiivistä',
      instruction,
      chapterId: 'chapter-7',
      runId: 'run-3',
      // A request through this client is always FAUST's own
      source: 'faust'
    });

    const stored = JSON.stringify(row);
    expect(stored).not.toContain('SALAINEN');
    expect(stored).not.toContain('Åboon');
    expect(stored).not.toContain('Tule tänne');
    expect(stored).not.toContain('<teksti>');

    // The meta that travels with the suggestions carries the same things, and no text either
    expect(result.logMeta).toEqual({
      source: 'faust',
      action: 'quick-edit',
      actionLabel: 'Tiivistä',
      instruction,
      provider: 'cherry',
      model: EDIT_MODEL,
      requestLogId: row.id,
      runId: 'run-3'
    });
    expect(JSON.stringify(result.logMeta)).not.toContain('Åboon');
  });

  test('a long instruction is cut to 500 characters in the row and in the meta', async () => {
    const context = setup();
    const result = await roundTrip(context, { meta: { action: 'quick-edit', instruction: 'ä'.repeat(600) } });

    expect(context.rows[0].instruction).toBe('ä'.repeat(500) + '…');
    expect(result.logMeta.instruction).toBe('ä'.repeat(500) + '…');
  });

  test('rows of one run are merged by the log into one row', async () => {
    const context = setup();
    for (let batch = 0; batch < 3; batch += 1) {
      await roundTrip(context, { meta: { action: 'proofread', runId: 'run-9', chapterId: 'c1' } }, { usage: { inputTokens: 500, outputTokens: 100 } });
    }
    const log = context.rows.reduce((current, row) => appendRow(current, row, row.at), undefined);

    expect(context.rows).toHaveLength(3);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toMatchObject({ requests: 3, tokensIn: 1500, tokensOut: 300, runId: 'run-9' });
    expect(summarize(log).requests).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Scope
  // -------------------------------------------------------------------------

  test('a row of a request started before the scope changed is not delivered', async () => {
    const context = setup();
    let epoch = 1;
    context.client.setScopeSource(() => epoch);

    const handle = context.client.requestEdit({ messages: user('Hei'), maxTokens: 600, meta: { action: 'quick-edit', chapterId: 'chapter-1', instruction: 'Edellisen projektin ohje' } });
    await until(() => context.bridge.calls.length === 1);
    // Another project is opened while the request runs
    epoch = 2;
    context.bridge.calls[0].answer({ text: '<teksti>Valmis.</teksti>', usage: { inputTokens: 50, outputTokens: 9 } });
    const result = await handle.result;

    expect(context.rows).toEqual([]);
    expect(result.logId).toBeNull();
    expect(result.logMeta.requestLogId).toBeNull();
    // The answer itself is still returned to whoever asked
    expect(result.accepted).toBe(true);

    // A request that starts and ends under the new scope is delivered
    const next = await roundTrip(context, {}, { text: 'ok' });
    expect(context.rows).toHaveLength(1);
    expect(next.logId).toBe(context.rows[0].id);

    // The scope source can also be given when the client is created
    let scope = 'a';
    const second = setup({ deps: { getScope: () => scope } });
    const pending = second.client.request({ messages: user('Hei'), maxTokens: 600 });
    await until(() => second.bridge.calls.length === 1);
    scope = 'b';
    second.bridge.calls[0].answer();
    expect((await pending.result).logId).toBeNull();
    expect(second.rows).toEqual([]);
  });

  test('without a scope source every row is delivered', async () => {
    const context = setup();
    await roundTrip(context, {}, { text: 'yksi' });
    await roundTrip(context, {}, { text: 'kaksi' });
    expect(context.rows).toHaveLength(2);

    // Taking the source away again brings that behaviour back
    let epoch = 1;
    context.client.setScopeSource(() => epoch);
    context.client.setScopeSource(null);
    const handle = context.client.request({ messages: user('Hei'), maxTokens: 600 });
    await until(() => context.bridge.calls.length === 3);
    epoch = 2;
    context.bridge.calls[2].answer();
    await handle.result;
    expect(context.rows).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // Tokens
  // -------------------------------------------------------------------------

  test('promptTruncated is set when the server counted far fewer tokens than the prompt can hold', async () => {
    const context = setup();
    const long = 'Pitkä käsikirjoitus. '.repeat(3500);   // 73 500 characters

    // 73 500 characters cannot be 8 192 tokens: the gateway cut the prompt
    const cut = await roundTrip(context, { messages: user(long) }, { text: '<teksti>ok</teksti>', usage: { inputTokens: 8192, outputTokens: 5 } }, 'requestEdit');
    expect(cut.promptChars).toBe(long.length);
    expect(cut.promptTruncated).toBe(true);
    expect(cut.accepted).toBe(false);
    expect(cut.reason).toBe('prompt_truncated');
    expect(context.rows[0]).toMatchObject({ outcome: 'no_suggestion', reason: 'prompt_truncated', promptChars: long.length });

    // A plausible count for the same prompt is fine
    const whole = await roundTrip(context, { model: 'c91f:toinen', messages: user(long) }, { text: '<teksti>ok</teksti>', usage: { inputTokens: 27000, outputTokens: 5 } }, 'requestEdit');
    expect(whole.promptTruncated).toBe(false);
    expect(whole.accepted).toBe(true);

    // Without usage numbers nothing can be said
    const blind = await roundTrip(context, { messages: user(long) }, { text: 'ok', usage: null });
    expect(blind.promptTruncated).toBe(false);
  });

  test('promptTruncated is set when two prompts of clearly different length got the same token count', async () => {
    const context = setup();
    const shorter = 'a'.repeat(30000);
    const longer = 'a'.repeat(40000);

    const first = await roundTrip(context, { messages: user(shorter) }, { usage: { inputTokens: 8192, outputTokens: 5 } });
    expect(first.promptTruncated).toBe(false);
    const second = await roundTrip(context, { messages: user(longer) }, { usage: { inputTokens: 8192, outputTokens: 5 } });
    expect(second.promptTruncated).toBe(true);

    // The history is kept per model: another model's prompts are not compared
    const other = await roundTrip(context, { model: 'c91f:toinen', messages: user(longer) }, { usage: { inputTokens: 8192, outputTokens: 5 } });
    expect(other.promptTruncated).toBe(false);
  });

  test('calibration is stored only for untruncated prompts of at least 1500 characters', async () => {
    const context = setup();
    const calibration = () => context.settings.get('aiCalibration', {});

    // Too short
    await roundTrip(context, { messages: user('a'.repeat(1499)) }, { usage: { inputTokens: 550, outputTokens: 5 } });
    expect(calibration()).toEqual({});

    // Truncated
    await roundTrip(context, { messages: user('a'.repeat(70000)) }, { usage: { inputTokens: 8192, outputTokens: 5 } });
    expect(calibration()).toEqual({});

    // No usage numbers
    await roundTrip(context, { messages: user('a'.repeat(5400)) }, { usage: null });
    expect(calibration()).toEqual({});

    // A usable sample: 5 400 characters, 2 000 tokens; the system text counts as prompt too
    await roundTrip(context, { system: 'b'.repeat(400), messages: user('a'.repeat(5000)) }, { usage: { inputTokens: 2000, outputTokens: 5 } });
    expect(calibration()).toEqual({ [DEFAULT_MODEL]: { charsPerToken: 2.7, samples: 1 } });

    // The ratio is kept per model that answered the request
    await roundTrip(context, { role: 'edit', messages: user('a'.repeat(6000)) }, { usage: { inputTokens: 2000, outputTokens: 5 } });
    expect(calibration()).toEqual({
      [DEFAULT_MODEL]: { charsPerToken: 2.7, samples: 1 },
      [EDIT_MODEL]: { charsPerToken: 3, samples: 1 }
    });

    await roundTrip(context, { messages: user('a'.repeat(5800)) }, { usage: { inputTokens: 2000, outputTokens: 5 } });
    expect(calibration()[DEFAULT_MODEL]).toEqual({ charsPerToken: 2.8, samples: 2 });

    // A prompt that hit a fixed ceiling has a believable ratio of its own (4 here),
    // but the model did not see all of it: it must not teach the ratio
    const third = 'c91f:kolmas';
    const first = await roundTrip(context, { model: third, messages: user('a'.repeat(6000)) }, { usage: { inputTokens: 2000, outputTokens: 5 } });
    expect(first.promptTruncated).toBe(false);
    expect(calibration()[third]).toEqual({ charsPerToken: 3, samples: 1 });
    const capped = await roundTrip(context, { model: third, messages: user('a'.repeat(8000)) }, { usage: { inputTokens: 2000, outputTokens: 5 } });
    expect(capped.promptTruncated).toBe(true);
    expect(calibration()[third]).toEqual({ charsPerToken: 3, samples: 1 });
  });

  test('budgetFor: promptBudgetTokens is window minus answer, headroom and safety, never negative', async () => {
    const context = setup({ config: cherryConfig({ modelSettings: { [EDIT_MODEL]: { headroom: 400, window: 8192 } } }) });
    await context.client.getConfig();

    expect(context.client.budgetFor(EDIT_MODEL, 600)).toEqual({
      model: EDIT_MODEL,
      window: 8192,
      headroom: 400,
      maxTokensSent: 1000,
      promptBudgetTokens: 6992,                 // 8192 − 600 − 400 − 200
      charsPerToken: 2.7,
      promptBudgetChars: Math.floor(6992 * 2.7),
      calibrated: false
    });

    // Provider defaults for a model without stored settings
    expect(context.client.budgetFor(DEFAULT_MODEL, 1000)).toMatchObject({
      window: 32000, headroom: 2000, maxTokensSent: 3000, promptBudgetTokens: 28800
    });

    // An answer larger than the window leaves nothing, not a negative budget
    const none = context.client.budgetFor(EDIT_MODEL, 9000);
    expect(none.promptBudgetTokens).toBe(0);
    expect(none.promptBudgetChars).toBe(0);

    // No answer reserved at all
    expect(context.client.budgetFor(EDIT_MODEL, 0).promptBudgetTokens).toBe(8192 - 400 - 200);

    // modelSettings is the same table the budget reads
    expect(context.client.modelSettings(EDIT_MODEL)).toEqual({ window: 8192, headroom: 400, systemAsUser: false });
    expect(context.client.modelSettings(DEFAULT_MODEL)).toEqual({ window: 32000, headroom: 2000, systemAsUser: false });
  });

  test('budgetFor reports calibrated only after three samples and uses 2.7 for the gateway before that', async () => {
    const context = setup();
    await context.client.getConfig();
    const sample = () => roundTrip(context, { messages: user('a'.repeat(6000)) }, { usage: { inputTokens: 2400, outputTokens: 5 } });

    expect(context.client.budgetFor(DEFAULT_MODEL, 1000)).toMatchObject({ charsPerToken: 2.7, calibrated: false });
    expect(context.client.charsPerToken(DEFAULT_MODEL)).toBe(2.7);

    await sample();
    await sample();
    // Two samples say 2.5, but two are not enough to trust
    expect(context.settings.get('aiCalibration')[DEFAULT_MODEL]).toEqual({ charsPerToken: 2.5, samples: 2 });
    expect(context.client.budgetFor(DEFAULT_MODEL, 1000)).toMatchObject({ charsPerToken: 2.7, calibrated: false });
    expect(context.client.charsPerToken(DEFAULT_MODEL)).toBe(2.7);

    await sample();
    const budget = context.client.budgetFor(DEFAULT_MODEL, 1000);
    expect(budget.calibrated).toBe(true);
    expect(budget.charsPerToken).toBe(2.5);
    expect(budget.promptBudgetChars).toBe(Math.floor(28800 * 2.5));
    expect(context.client.charsPerToken(DEFAULT_MODEL)).toBe(2.5);

    // Another model is still at the starting value
    expect(context.client.budgetFor(EDIT_MODEL, 1000)).toMatchObject({ charsPerToken: 2.7, calibrated: false });
  });

  test('Claude direct starts at 3 characters per token', async () => {
    const context = setup({ config: anthropicConfig() });
    await context.client.getConfig();

    expect(context.client.charsPerToken('claude-test-model')).toBe(3);
    expect(context.client.budgetFor('claude-test-model', 1000)).toMatchObject({
      window: 200000, headroom: 16000, maxTokensSent: 17000, promptBudgetTokens: 182800, charsPerToken: 3, calibrated: false
    });
  });

  test('the calibration lives in memory when there is no settings store', async () => {
    const context = setup({ settings: null });
    await context.client.getConfig();
    for (let i = 0; i < 3; i += 1) {
      await roundTrip(context, { messages: user('a'.repeat(6000)) }, { usage: { inputTokens: 2000, outputTokens: 5 } });
    }
    expect(context.client.budgetFor(DEFAULT_MODEL, 1000)).toMatchObject({ charsPerToken: 3, calibrated: true });
  });

  test('before the settings have arrived the budget uses the same defaults as the main process', () => {
    const context = setup();
    expect(context.client.configSnapshot()).toBeNull();
    expect(context.client.modelFor('edit')).toBe('');

    // A gateway id and a Claude name get the defaults of their provider
    expect(context.client.modelSettings('c91f:malli')).toEqual({
      window: AI_CONSTANTS.DEFAULT_WINDOW_TOKENS.cherry,
      headroom: AI_CONSTANTS.DEFAULT_HEADROOM_TOKENS.cherry,
      systemAsUser: false
    });
    expect(context.client.modelSettings('claude-test-model')).toEqual({
      window: AI_CONSTANTS.DEFAULT_WINDOW_TOKENS.anthropic,
      headroom: AI_CONSTANTS.DEFAULT_HEADROOM_TOKENS.anthropic,
      systemAsUser: false
    });
    expect(context.client.budgetFor('c91f:malli', 1000)).toMatchObject({ promptBudgetTokens: 32000 - 3000 - 200, charsPerToken: 2.7, calibrated: false });
    expect(context.client.budgetFor('claude-test-model', 1000).charsPerToken).toBe(3);
  });

  // -------------------------------------------------------------------------
  // requestEdit
  // -------------------------------------------------------------------------

  test('requestEdit returns accepted, inner and logMeta, and logs outcome ok', async () => {
    const context = setup();
    const original = 'Äiti tuli kottiin.';
    const result = await roundTrip(context, {
      role: 'edit',
      system: 'Olet kielenhuoltaja.',
      messages: user(`<teksti>${original}</teksti>`),
      original,
      meta: { action: 'proofread', actionLabel: 'Kielenhuolto', instruction: '', chapterId: 'c1' }
    }, { text: 'Tässä korjattu teksti:\n<teksti>\nÄiti tuli kotiin.\n</teksti>', usage: { inputTokens: 60, outputTokens: 20 } }, 'requestEdit');

    expect(result.accepted).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.reasonText).toBeNull();
    expect(result.inner).toBe('Äiti tuli kotiin.');
    expect(result.cleaned).toEqual({ text: 'Äiti tuli kotiin.', complete: true, hadOpenTag: true, hadCloseTag: true, notes: [] });
    // The raw answer is still there
    expect(result.text).toBe('Tässä korjattu teksti:\n<teksti>\nÄiti tuli kotiin.\n</teksti>');
    expect(result.retried).toBe(false);

    expect(context.rows).toHaveLength(1);
    expect(context.rows[0]).toMatchObject({ outcome: 'ok', reason: null, action: 'proofread', actionLabel: 'Kielenhuolto', chapterId: 'c1' });
    expect(result.logMeta).toEqual({
      source: 'faust',
      action: 'proofread',
      actionLabel: 'Kielenhuolto',
      instruction: '',
      provider: 'cherry',
      model: EDIT_MODEL,
      requestLogId: context.rows[0].id
    });
    expect(result.logId).toBe(context.rows[0].id);
  });

  test('requestEdit passes the tag and the original text to the cleaner', async () => {
    const clean = jest.fn(stubClean);
    const context = setup({ deps: { cleanModelOutput: clean } });
    const result = await roundTrip(context, { tag: 'korjattu', original: 'Alkuperäinen ⟦1⟧ teksti.' }, { text: '<korjattu>Uusi ⟦1⟧ teksti.</korjattu>' }, 'requestEdit');

    expect(clean).toHaveBeenCalledWith('<korjattu>Uusi ⟦1⟧ teksti.</korjattu>', { tag: 'korjattu', original: 'Alkuperäinen ⟦1⟧ teksti.' });
    expect(result.inner).toBe('Uusi ⟦1⟧ teksti.');

    // request() does not judge and has no edit fields
    const plain = await roundTrip(context, {}, { text: '<teksti>a</teksti>' });
    expect('accepted' in plain).toBe(false);
    expect('inner' in plain).toBe(false);
  });

  test('requestEdit logs outcome no_suggestion with the reason', async () => {
    const context = setup();

    const refusal = await roundTrip(context, { role: 'edit' }, { text: 'En valitettavasti voi auttaa tässä.' }, 'requestEdit');
    expect(refusal.accepted).toBe(false);
    expect(refusal.reason).toBe('missing_tag');
    expect(refusal.reasonText).toBe('Ei ehdotusta: vastauksesta puuttuu sulkeva </teksti>-tagi. Vastaus katkesi tai malli vastasi muulla kuin muokatulla tekstillä.');
    expect(refusal.inner).toBeNull();
    expect(context.rows[0]).toMatchObject({ outcome: 'no_suggestion', reason: 'missing_tag', stopReason: 'end_turn' });

    const cut = await roundTrip(context, { role: 'edit' }, { text: '<teksti>Äiti tuli ko', stopReason: 'max_tokens' }, 'requestEdit');
    expect(cut.reason).toBe('max_tokens');
    expect(context.rows[1]).toMatchObject({ outcome: 'no_suggestion', reason: 'max_tokens', stopReason: 'max_tokens' });

    // Exactly one row per request
    expect(context.rows).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // The automatic retry
  // -------------------------------------------------------------------------

  const exhausted = (extra = {}) => ({ text: '', stopReason: 'max_tokens', sawThinking: true, usage: { inputTokens: 300, outputTokens: 1000 }, ms: 4000, ...extra });

  test('cancel inside onPhase(\'retrying\') sends no second request and resolves cancelled', async () => {
    const context = setup();
    let handle = null;
    handle = context.client.requestEdit({
      messages: user('<teksti>Äiti.</teksti>'),
      maxTokens: 600,
      onPhase: (phase) => {
        if (phase === 'retrying') handle.cancel();
      }
    });
    await until(() => context.bridge.calls.length === 1);
    context.bridge.calls[0].answer(exhausted());
    const result = await handle.result;

    expect(context.bridge.aiRequest).toHaveBeenCalledTimes(1);
    expect(result.cancelled).toBe(true);
    expect(result.stopReason).toBe('cancelled');
    expect(result.reason).toBe('cancelled');
    expect(context.rows.map(row => row.outcome)).toEqual(['cancelled']);
  });

  test('requestEdit retries once with a doubled limit when reasoning used the whole limit', async () => {
    const context = setup();
    const phases = [];
    const texts = [];
    const handle = context.client.requestEdit({
      role: 'edit',
      system: 'Ohje.',
      messages: user('<teksti>Äiti tuli kottiin.</teksti>'),
      maxTokens: 600,
      thinking: 'off',
      temperature: 0,
      onPhase: (phase) => phases.push(phase),
      onText: (delta, soFar) => texts.push(soFar)
    });
    await until(() => context.bridge.calls.length === 1);
    expect(context.bridge.calls[0].request.maxTokens).toBe(1000);
    context.bridge.calls[0].chunk({ type: 'phase', phase: 'thinking' });
    context.bridge.calls[0].answer(exhausted());

    await until(() => context.bridge.calls.length === 2);
    const second = context.bridge.calls[1].request;
    // The same request with twice the limit that was sent, under an id of its own
    expect(second.maxTokens).toBe(2000);
    expect(second.id).not.toBe(handle.id);
    expect(second.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect({ ...second, id: null, maxTokens: null }).toEqual({ ...context.bridge.calls[0].request, id: null, maxTokens: null });

    context.bridge.calls[1].chunk({ type: 'phase', phase: 'thinking' });
    context.bridge.calls[1].chunk({ type: 'phase', phase: 'writing' });
    context.bridge.calls[1].chunk({ type: 'text', text: '<teksti>Äiti tuli kotiin.</teksti>' });
    context.bridge.calls[1].answer({ text: '<teksti>Äiti tuli kotiin.</teksti>', sawThinking: true, usage: { inputTokens: 300, outputTokens: 1400 }, ms: 6000 });
    const result = await handle.result;

    expect(phases).toEqual(['connecting', 'thinking', 'retrying', 'thinking', 'writing']);
    expect(texts).toEqual(['<teksti>Äiti tuli kotiin.</teksti>']);
    expect(result.retried).toBe(true);
    expect(result.accepted).toBe(true);
    expect(result.inner).toBe('Äiti tuli kotiin.');
    expect(result.id).toBe(handle.id);
    expect(result.maxTokensSent).toBe(2000);
    // The usage of the result is that of the answer; the time covers both sends
    expect(result.usage).toEqual({ inputTokens: 300, outputTokens: 1400 });
    expect(result.ms).toBe(10000);
    expect(context.bridge.aiRequest).toHaveBeenCalledTimes(2);
  });

  test('the doubled limit stops at the provider cap, and a request already at the cap is not sent again', async () => {
    const context = setup();
    const handle = context.client.requestEdit({ messages: user('Hei'), maxTokens: 18000 });
    await until(() => context.bridge.calls.length === 1);
    expect(context.bridge.calls[0].request.maxTokens).toBe(20000);
    context.bridge.calls[0].answer(exhausted());
    await until(() => context.bridge.calls.length === 2);
    expect(context.bridge.calls[1].request.maxTokens).toBe(32000);
    context.bridge.calls[1].answer({ text: '<teksti>ok</teksti>' });
    expect((await handle.result).retried).toBe(true);

    // 40 000 was clamped to 32 000 by main: there is no larger limit to try
    const capped = await roundTrip(context, { maxTokens: 40000 }, exhausted({ maxTokens: 32000 }), 'requestEdit');
    expect(capped.retried).toBe(false);
    expect(capped.reason).toBe('reasoning_exhausted');
    expect(context.bridge.aiRequest).toHaveBeenCalledTimes(3);
  });

  test('the retry is logged as one row with requests 2', async () => {
    const context = setup();
    const handle = context.client.requestEdit({ role: 'edit', messages: user('a'.repeat(100)), maxTokens: 600, meta: { action: 'quick-edit', chapterId: 'c1' } });
    await until(() => context.bridge.calls.length === 1);
    context.bridge.calls[0].answer(exhausted({ usage: { inputTokens: 300, outputTokens: 1000 } }));
    await until(() => context.bridge.calls.length === 2);
    context.bridge.calls[1].answer({ text: '<teksti>ok</teksti>', sawThinking: false, usage: { inputTokens: 320, outputTokens: 1400 } });
    const result = await handle.result;

    expect(context.rows).toHaveLength(1);
    expect(context.rows[0]).toMatchObject({
      requests: 2,
      tokensIn: 620,
      tokensOut: 2400,
      outcome: 'ok',
      reason: null,
      stopReason: 'end_turn',
      // Both sends carried the prompt, and one of them was seen thinking
      promptChars: 200,
      sawThinking: true,
      // The share of the window is that of one prompt, not of the sum
      contextUsed: 0.01,
      action: 'quick-edit',
      chapterId: 'c1'
    });
    expect(result.logId).toBe(context.rows[0].id);

    const log = appendRow(undefined, context.rows[0], context.rows[0].at);
    expect(summarize(log).requests).toBe(2);
  });

  test('a second reasoning_exhausted is returned, not retried again', async () => {
    const context = setup();
    const handle = context.client.requestEdit({ role: 'edit', messages: user('Hei'), maxTokens: 600 });
    await until(() => context.bridge.calls.length === 1);
    context.bridge.calls[0].answer(exhausted());
    await until(() => context.bridge.calls.length === 2);
    context.bridge.calls[1].answer(exhausted({ usage: { inputTokens: 300, outputTokens: 2000 } }));
    const result = await handle.result;
    await flush();

    expect(context.bridge.aiRequest).toHaveBeenCalledTimes(2);
    expect(result.retried).toBe(true);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('reasoning_exhausted');
    expect(result.reasonText).toBe('Ei ehdotusta: mallin päättely käytti koko vastausrajan. Suurenna mallin päättelyvaraa tietopaneelin Tekoäly-välilehdellä.');
    expect(context.rows).toHaveLength(1);
    expect(context.rows[0]).toMatchObject({ requests: 2, outcome: 'no_suggestion', reason: 'reasoning_exhausted', tokensOut: 3000 });
  });

  test('request retries only when retryOnEmpty is set, and never when the constant is off', async () => {
    const context = setup();

    const plain = await roundTrip(context, {}, exhausted());
    expect(plain.retried).toBe(false);
    expect(context.bridge.aiRequest).toHaveBeenCalledTimes(1);

    const handle = context.client.request({ messages: user('Hei'), maxTokens: 600, retryOnEmpty: true });
    await until(() => context.bridge.calls.length === 2);
    context.bridge.calls[1].answer(exhausted());
    await until(() => context.bridge.calls.length === 3);
    expect(context.bridge.calls[2].request.maxTokens).toBe(5200);
    context.bridge.calls[2].answer({ text: 'Vastaus.' });
    await expect(handle.result).resolves.toMatchObject({ retried: true, text: 'Vastaus.' });

    // An ordinary cut answer (some text arrived) is not retried
    const cut = await roundTrip(context, { retryOnEmpty: true }, { text: 'Katkesi kesk', stopReason: 'max_tokens', sawThinking: true });
    expect(cut.retried).toBe(false);

    const off = setup({ deps: { constants: { ...CLIENT_CONSTANTS, RETRY_ON_REASONING_EXHAUSTED: false } } });
    const single = await roundTrip(off, {}, exhausted(), 'requestEdit');
    expect(single.retried).toBe(false);
    expect(single.reason).toBe('reasoning_exhausted');
    expect(off.bridge.aiRequest).toHaveBeenCalledTimes(1);
  });

  test('a cancel during the retry stops the second send and resolves cancelled', async () => {
    const context = setup();
    const handle = context.client.requestEdit({ messages: user('Hei'), maxTokens: 600 });
    await until(() => context.bridge.calls.length === 1);
    context.bridge.calls[0].answer(exhausted());
    await until(() => context.bridge.calls.length === 2);

    handle.cancel();
    const result = await handle.result;

    expect(context.bridge.aiCancel).toHaveBeenCalledTimes(1);
    expect(context.bridge.aiCancel).toHaveBeenCalledWith(context.bridge.calls[1].request.id);
    expect(result.cancelled).toBe(true);
    expect(result.retried).toBe(true);
    expect(result.reason).toBe('cancelled');
    expect(context.rows[0]).toMatchObject({ requests: 2, outcome: 'cancelled' });
  });

  // -------------------------------------------------------------------------
  // Settings and models
  // -------------------------------------------------------------------------

  test('getConfig is fetched once; refreshConfig fetches again and drops the model list', async () => {
    const context = setup();
    expect(context.client.configSnapshot()).toBeNull();

    const [first, second] = await Promise.all([context.client.getConfig(), context.client.getConfig()]);
    const third = await context.client.getConfig();
    expect(context.bridge.aiGetProvider).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(context.client.configSnapshot()).toBe(first);
    expect(first.provider).toBe('cherry');
    expect(first.roles).toEqual({ prose: '', edit: EDIT_MODEL, analysis: '' });
    expect('success' in first).toBe(false);

    const models = await context.client.listModels();
    await context.client.listModels();
    expect(models).toEqual([{ id: DEFAULT_MODEL, name: 'glm-5.3-flash' }, { id: EDIT_MODEL, name: 'deepseek-fast' }]);
    expect(context.bridge.aiListCherryModels).toHaveBeenCalledTimes(1);

    // The author switches to Claude direct and saves
    context.bridge.config = anthropicConfig();
    const refreshed = await context.client.refreshConfig();
    expect(context.bridge.aiGetProvider).toHaveBeenCalledTimes(2);
    expect(refreshed.provider).toBe('anthropic');
    expect(context.client.configSnapshot()).toBe(refreshed);
    expect(context.client.modelFor('edit')).toBe('claude-test-model');

    expect(await context.client.listModels()).toEqual([{ id: 'claude-test-model', name: 'Claude Test' }]);
    expect(context.bridge.aiListAnthropicModels).toHaveBeenCalledTimes(1);
    expect(context.bridge.aiListCherryModels).toHaveBeenCalledTimes(1);
  });

  test('getConfig fills in what an older main process does not send', async () => {
    const bridge = fakeBridge();
    bridge.aiGetProvider = jest.fn(async () => ({ success: true, provider: 'cherry', gatewayUrl: 'http://127.0.0.1:23333', model: DEFAULT_MODEL, hasCherryKey: true, hasAnthropicKey: false, providerFromEnv: false }));
    const context = setup({ bridge });

    const config = await context.client.getConfig();
    expect(config.roles).toEqual({ prose: '', edit: '', analysis: '' });
    expect(config.modelSettings).toEqual({});
    // The stand-in numbers are the ones the main process would have sent
    expect(config.defaults).toEqual({
      window: AI_CONSTANTS.DEFAULT_WINDOW_TOKENS,
      headroom: AI_CONSTANTS.DEFAULT_HEADROOM_TOKENS,
      maxOutput: AI_CONSTANTS.MAX_OUTPUT_TOKENS
    });
    expect(config.anthropicModel).toBe('');
    expect(context.client.modelFor('edit')).toBe(DEFAULT_MODEL);
  });

  test('a failed settings fetch is not cached', async () => {
    const bridge = fakeBridge();
    bridge.aiGetProvider = jest.fn()
      .mockImplementationOnce(async () => ({ success: false, error: 'ei onnistu' }))
      .mockImplementation(async () => ({ success: true, ...cherryConfig() }));
    const context = setup({ bridge });

    expect(await context.client.getConfig()).toBeNull();
    expect((await context.client.getConfig()).provider).toBe('cherry');
    expect(bridge.aiGetProvider).toHaveBeenCalledTimes(2);
  });

  test('listModels returns an empty list when the bridge call fails', async () => {
    const context = setup();
    context.bridge.aiListCherryModels
      .mockImplementationOnce(async () => {
        throw new Error('ipc rikki');
      })
      .mockImplementationOnce(async () => ({ success: false, error: 'Cherry Studion API-avain puuttuu.' }))
      .mockImplementationOnce(async () => ({ success: true, models: 'rikki' }));

    expect(await context.client.listModels()).toEqual([]);
    expect(await context.client.listModels()).toEqual([]);
    expect(await context.client.listModels()).toEqual([]);

    // A failure is not remembered: the next call asks again and gets the list
    const models = await context.client.listModels();
    expect(models).toHaveLength(2);
    expect(models.every(model => Object.keys(model).sort().join() === 'id,name')).toBe(true);
    expect(context.bridge.aiListCherryModels).toHaveBeenCalledTimes(4);

    // The caller gets its own copy
    models.pop();
    expect(await context.client.listModels()).toHaveLength(2);

    // Without a bridge there is nothing to list
    expect(await setup({ bridge: null }).client.listModels()).toEqual([]);
  });
});

describe('getAIClient', () => {
  test('returns one client, also where there is no window', () => {
    expect(typeof window).toBe('undefined');
    const client = getAIClient();
    expect(getAIClient()).toBe(client);

    for (const method of ['request', 'requestEdit', 'getConfig', 'refreshConfig', 'configSnapshot', 'modelFor', 'modelSettings',
      'charsPerToken', 'budgetFor', 'listModels', 'cancelAll', 'activeCount', 'onActivity', 'setUsageSink', 'setScopeSource']) {
      expect(typeof client[method]).toBe('function');
    }
    expect(client.activeCount()).toBe(0);
    expect(client.modelFor('edit')).toBe('');
  });

  test('is built over window.electronAPI and the settings store when there is a window', async () => {
    const bridge = fakeBridge();
    bridge.prefsGet = jest.fn(async () => ({ success: true, prefs: { aiOff: true } }));
    bridge.prefsSet = jest.fn(async () => ({ success: true, prefs: {} }));
    bridge.onPrefsChanged = jest.fn();
    global.window = { electronAPI: bridge };
    try {
      let client;
      jest.isolateModules(() => {
        client = require('../../src/services/ai/aiClient').getAIClient();
      });

      expect((await client.getConfig()).provider).toBe('cherry');
      // The switch of the settings file is honoured by the singleton
      const result = await client.request({ messages: user('Hei'), maxTokens: 100 }).result;
      expect(result.error.code).toBe('ai_off');
      expect(bridge.prefsGet).toHaveBeenCalledTimes(1);
      expect(bridge.aiRequest).not.toHaveBeenCalled();
    } finally {
      delete global.window;
    }
  });
});

/**
 * AI request client (renderer)
 *
 * The one door through which every new AI feature sends a request: it picks
 * the model of the task, adds the model's reasoning headroom, streams the
 * answer, says how the answer ended, decides whether an edit answer may
 * become a suggestion, keeps the token arithmetic and writes one usage row
 * per request.
 *
 * Nothing here touches the DOM when the module is loaded: `window` is read
 * only inside getAIClient(). Everything else is injected, so the client is
 * unit-tested with a fake bridge (test/services/aiClient.test.js).
 */

const tokenStats = require('./tokenStats.js');
const usageLog = require('./usageLog.js');
const { AI_OFF_SENTENCE } = require('../format.fi.js');
const { getSettingsStore } = require('../settingsStore.js');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Which role a task uses: edit for quick edit, Kielenhuolto and "Miksi?";
// prose for write-at-cursor; analysis for review checks and summaries
const ROLES = ['prose', 'edit', 'analysis'];
const ROLE_LABELS = { prose: 'Proosa', edit: 'Muokkaus', analysis: 'Analyysi' };

const CLIENT_CONSTANTS = {
  EDIT_TAG: 'teksti',
  ACCEPT_STOP_REASONS: ['end_turn', 'stop_sequence'],
  ACCEPT_UNKNOWN_STOP_REASON_WITH_TAG: false,
  POST_CANCEL_COOLDOWN_MS: 0,
  SAFETY_TOKENS: 200,                    // covers the fixed overhead of a request (32–70 tokens)
  LOG_INSTRUCTION_MAX: 500,
  RETRY_ON_REASONING_EXHAUSTED: true     // one resend with a doubled limit when reasoning used all of it
};

// A model counts as calibrated from this many usable requests on
const CALIBRATED_SAMPLES = 3;

// The last prompts per model that looksTruncated compares with
const HISTORY_LENGTH = 2;

// Used only until the settings of the main process have arrived (they come
// with PublicConfig.defaults); the same numbers as AI_CONSTANTS in utils/aiRequest.js
const FALLBACK_DEFAULTS = {
  window: { cherry: 32000, anthropic: 200000 },
  headroom: { cherry: 2000, anthropic: 16000 },
  maxOutput: { cherry: 32000, anthropic: 64000 }
};

const NO_BRIDGE_MESSAGE = 'Tekoälypyynnöt toimivat vain FAUST-sovelluksessa.';
const FAILED_PREFIX = 'Tekoälypyyntö epäonnistui: ';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const textOf = (value) => (typeof value === 'string' ? value : '');
const isPositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const addNullable = (a, b) => (isFiniteNumber(a) || isFiniteNumber(b) ? (isFiniteNumber(a) ? a : 0) + (isFiniteNumber(b) ? b : 0) : null);
const noop = () => {};

// ---------------------------------------------------------------------------
// How an answer ended
// ---------------------------------------------------------------------------

/** The one table of reasons a request gave no suggestion. */
function reasonText(code, detail, tag = CLIENT_CONSTANTS.EDIT_TAG) {
  switch (code) {
    case 'max_tokens':
      return 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.';
    case 'reasoning_exhausted':
      return 'Ei ehdotusta: mallin päättely käytti koko vastausrajan. Suurenna mallin päättelyvaraa tietopaneelin Tekoäly-välilehdellä.';
    case 'refusal':
      return 'Ei ehdotusta: malli kieltäytyi tehtävästä.' + (detail ? ` ${detail}` : '');
    case 'missing_tag':
      return `Ei ehdotusta: vastauksesta puuttuu sulkeva </${tag}>-tagi. Vastaus katkesi tai malli vastasi muulla kuin muokatulla tekstillä.`;
    case 'empty':
      return 'Ei ehdotusta: malli palautti tyhjän tekstin.';
    case 'cancelled':
      return 'Pyyntö pysäytettiin.';
    case 'prompt_truncated':
      return 'Ei ehdotusta: malli ei nähnyt koko kehotetta. Pienennä kontekstia tai tarkista mallin ikkunan koko tietopaneelin Tekoäly-välilehdeltä.';
    case 'stop_reason':
      return `Ei ehdotusta: vastaus päättyi odottamatta (syy: ${detail || 'tuntematon'}).`;
    case 'error':
      return `Ei ehdotusta: ${detail || 'tuntematon virhe.'}`;
    default:
      return 'Ei ehdotusta.';
  }
}

// Reasoning ate the whole limit before the first visible character
const reasoningExhausted = (result) => result.stopReason === 'max_tokens'
  && textOf(result.text).trim() === ''
  && result.sawThinking === true;

/**
 * May this answer of an edit task become a suggestion?
 *
 * Only when the request succeeded, the model stopped by itself, the cleaned
 * text is complete (the closing tag is there and something is inside) and
 * the model saw the whole prompt. Everything else is "no suggestion" with a
 * reason. The tag rule itself lives in cleanModelOutput; nobody else parses
 * <teksti> tags.
 */
function judgeEdit(result, options = {}) {
  const opts = isPlainObject(options) ? options : {};
  const constants = opts.constants || CLIENT_CONSTANTS;
  const tag = textOf(opts.tag) || constants.EDIT_TAG;
  const res = isPlainObject(result) ? result : { ok: false };
  const text = textOf(res.text);

  const reject = (reason, detail, cleaned = null) => ({
    accepted: false,
    reason,
    reasonText: reasonText(reason, detail, tag),
    inner: null,
    cleaned
  });

  if (res.ok === false) return reject('error', res.error && res.error.message);
  if (res.cancelled) return reject('cancelled');
  if (res.stopReason === 'refusal') return reject('refusal', res.refusal && res.refusal.explanation);
  if (reasoningExhausted(res)) return reject('reasoning_exhausted');
  if (res.stopReason === 'max_tokens') return reject('max_tokens');

  const unknownAllowed = res.stopReason === 'unknown' && constants.ACCEPT_UNKNOWN_STOP_REASON_WITH_TAG === true;
  if (!constants.ACCEPT_STOP_REASONS.includes(res.stopReason) && !unknownAllowed) {
    // 'unknown' is this app's own word for "the server gave no reason"
    return reject('stop_reason', res.stopReason === 'unknown' || !res.stopReason ? 'tuntematon' : res.stopReason);
  }

  if (text.trim() === '') return reject('empty');

  // The default is required here, not at load: the module belongs to another package of the same build
  const clean = typeof opts.clean === 'function' ? opts.clean : require('./cleanModelOutput.js').cleanModelOutput;
  const cleaned = clean(text, { tag, original: opts.original });

  if (!cleaned || !cleaned.hadCloseTag) return reject('missing_tag', undefined, cleaned || null);
  if (textOf(cleaned.text).trim() === '') return reject('empty', undefined, cleaned);
  // A closing tag alone is not enough: a stray tag or an answer that never closed leaves complete false
  if (cleaned.complete !== true) return reject('missing_tag', undefined, cleaned);
  if (res.promptTruncated) return reject('prompt_truncated', undefined, cleaned);

  return { accepted: true, reason: null, reasonText: null, inner: cleaned.text, cleaned };
}

/** A short note for chat-like displays; the text that arrived is always kept. */
function stopNote(result) {
  if (!result) return '';
  if (result.ok === false) return 'virhe';
  if (result.cancelled || result.stopReason === 'cancelled') return 'pysäytetty';
  if (result.stopReason === 'max_tokens') return 'vastaus katkesi';
  if (result.stopReason === 'refusal') return 'malli kieltäytyi vastaamasta';
  return '';
}

// ---------------------------------------------------------------------------
// Settings as the renderer gets them
// ---------------------------------------------------------------------------

// A gateway id looks like "providerId:modelId"; anything else is a Claude name
const providerOf = (config, model) => {
  if (config && (config.provider === 'cherry' || config.provider === 'anthropic')) return config.provider;
  return textOf(model) === '' || textOf(model).includes(':') ? 'cherry' : 'anthropic';
};

function normalizeConfig(answer) {
  const { success: _success, ...rest } = answer;
  const defaults = isPlainObject(rest.defaults) ? rest.defaults : {};
  const table = (name) => ({ ...FALLBACK_DEFAULTS[name], ...(isPlainObject(defaults[name]) ? defaults[name] : {}) });

  return {
    ...rest,
    provider: rest.provider === 'cherry' ? 'cherry' : 'anthropic',
    model: textOf(rest.model),
    anthropicModel: textOf(rest.anthropicModel),
    roles: { prose: '', edit: '', analysis: '', ...(isPlainObject(rest.roles) ? rest.roles : {}) },
    modelSettings: isPlainObject(rest.modelSettings) ? rest.modelSettings : {},
    defaults: { window: table('window'), headroom: table('headroom'), maxOutput: table('maxOutput') }
  };
}

// Cut like a usage row cuts: never between the halves of a surrogate pair
function cutInstruction(value, max) {
  const text = textOf(value);
  if (text.length <= max) return text;
  let end = max;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end) + '…';
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

/**
 * deps = {
 *   bridge,             // { aiRequest(request, onChunk), aiCancel(id), aiGetProvider(), aiListCherryModels(), aiListAnthropicModels() }
 *   settings,           // settings store or null
 *   now, makeId, constants, stats, log,
 *   cleanModelOutput,   // passed to judgeEdit; default: the real module, required when first needed
 *   getScope            // () => any; a usage row is delivered only when the value is the same at start and at end
 * }
 */
function createAIClient(deps = {}) {
  const bridge = deps.bridge || null;
  const settings = deps.settings || null;
  const now = typeof deps.now === 'function' ? deps.now : Date.now;
  const constants = deps.constants || CLIENT_CONSTANTS;
  const stats = deps.stats || tokenStats;
  const log = deps.log || usageLog;
  const setTimer = typeof deps.setTimer === 'function' ? deps.setTimer : setTimeout;

  let idCounter = 0;
  const makeId = typeof deps.makeId === 'function'
    ? deps.makeId
    : () => {
      idCounter += 1;
      return `ai-${now().toString(36)}-${idCounter}`;
    };

  let config = null;            // the last settings that arrived (also while a refresh runs)
  let configFresh = false;
  let configPromise = null;
  let configEpoch = 0;
  let modelList = null;

  let usageSink = null;
  let scopeSource = typeof deps.getScope === 'function' ? deps.getScope : null;

  const running = new Map();    // handle id → cancel()
  const activityListeners = new Set();
  const promptHistory = new Map();   // model → last { promptChars, inputTokens }
  let memoryCalibration = {};   // used when there is no settings store
  let lastCancelAt = null;

  // --- settings ------------------------------------------------------------

  function loadConfig() {
    if (!bridge || typeof bridge.aiGetProvider !== 'function') return Promise.resolve(config);
    const epoch = configEpoch;
    const pending = Promise.resolve()
      .then(() => bridge.aiGetProvider())
      .then((answer) => {
        if (epoch === configEpoch && isPlainObject(answer) && answer.success !== false) {
          config = normalizeConfig(answer);
          configFresh = true;
        }
      }, noop)
      .then(() => {
        if (configPromise === pending) configPromise = null;
        return config;
      });
    configPromise = pending;
    return pending;
  }

  /** The settings of the main process; fetched once, then cached. */
  function getConfig() {
    if (config && configFresh) return Promise.resolve(config);
    return configPromise || loadConfig();
  }

  /** Fetch the settings again and forget the model list. Called after every save. */
  function refreshConfig() {
    configEpoch += 1;
    configFresh = false;
    configPromise = null;
    modelList = null;
    return loadConfig();
  }

  const configSnapshot = () => config;

  /** The model id of a role: '' means "main's default". */
  function modelFor(role, cfg = config) {
    if (!cfg) return '';
    if (cfg.provider !== 'cherry') return textOf(cfg.anthropicModel);
    const roles = isPlainObject(cfg.roles) ? cfg.roles : {};
    const ownModel = own(roles, role) ? textOf(roles[role]) : '';
    return ownModel || textOf(cfg.model);
  }

  /** Window, reasoning headroom and system handling of one model, defaults filled in. */
  function modelSettings(model, cfg = config) {
    const provider = providerOf(cfg, model);
    const defaults = cfg && isPlainObject(cfg.defaults) ? cfg.defaults : FALLBACK_DEFAULTS;
    const all = cfg && isPlainObject(cfg.modelSettings) ? cfg.modelSettings : {};
    const stored = own(all, model) && isPlainObject(all[model]) ? all[model] : {};
    const fromDefaults = (name) => {
      const table = isPlainObject(defaults[name]) ? defaults[name] : {};
      return isFiniteNumber(table[provider]) ? table[provider] : FALLBACK_DEFAULTS[name][provider];
    };

    return {
      window: isFiniteNumber(stored.window) ? stored.window : fromDefaults('window'),
      headroom: isFiniteNumber(stored.headroom) ? stored.headroom : fromDefaults('headroom'),
      systemAsUser: typeof stored.systemAsUser === 'boolean' ? stored.systemAsUser : false
    };
  }

  function storedCalibration(model) {
    const all = settings ? settings.get('aiCalibration', {}) : memoryCalibration;
    const entry = isPlainObject(all) && own(all, model) ? all[model] : null;
    return isPlainObject(entry) && isPositive(entry.charsPerToken) && isPositive(entry.samples) ? entry : null;
  }

  // The measured ratio counts only after a few requests; before that the starting value is used
  function calibrationOf(model, cfg = config) {
    const stored = storedCalibration(model);
    if (stored && stored.samples >= CALIBRATED_SAMPLES) return { charsPerToken: stored.charsPerToken, calibrated: true };
    const fallback = stats.DEFAULT_CHARS_PER_TOKEN[providerOf(cfg, model)];
    return { charsPerToken: isPositive(fallback) ? fallback : 3, calibrated: false };
  }

  /** Characters per token of a model: measured, else the provider's starting value. */
  const charsPerToken = (model) => calibrationOf(model).charsPerToken;

  /** What a prompt may hold when `answerTokens` are reserved for the visible answer. */
  function budgetFor(model, answerTokens, cfg = config) {
    const { window: windowTokens, headroom } = modelSettings(model, cfg);
    const answer = isPositive(answerTokens) ? Math.ceil(answerTokens) : 0;
    const maxTokensSent = answer + headroom;
    const promptBudgetTokens = Math.max(0, windowTokens - maxTokensSent - constants.SAFETY_TOKENS);
    const calibration = calibrationOf(model, cfg);

    return {
      model,
      window: windowTokens,
      headroom,
      maxTokensSent,
      promptBudgetTokens,
      charsPerToken: calibration.charsPerToken,
      promptBudgetChars: Math.floor(promptBudgetTokens * calibration.charsPerToken),
      calibrated: calibration.calibrated
    };
  }

  /** The models the selected provider offers, as [{ id, name }]; [] on failure. */
  async function listModels() {
    if (modelList) return modelList.map(model => ({ ...model }));
    const epoch = configEpoch;
    const cfg = await getConfig();
    if (!cfg || !bridge) return [];

    const method = cfg.provider === 'cherry' ? 'aiListCherryModels' : 'aiListAnthropicModels';
    if (typeof bridge[method] !== 'function') return [];

    let answer = null;
    try {
      answer = await bridge[method]();
    } catch {
      return [];
    }
    if (!isPlainObject(answer) || answer.success === false || !Array.isArray(answer.models)) return [];

    const models = answer.models
      .filter(model => isPlainObject(model) && typeof model.id === 'string' && model.id !== '')
      .map(model => ({ id: model.id, name: textOf(model.name) || model.id }));
    // A list that was asked for before a settings change is not kept
    if (epoch === configEpoch) modelList = models;
    return models.map(model => ({ ...model }));
  }

  // --- running requests ------------------------------------------------------

  function announceActivity() {
    for (const listener of Array.from(activityListeners)) {
      try {
        listener(running.size);
      } catch {
        // A broken indicator must not disturb a request
      }
    }
  }

  const activeCount = () => running.size;

  function onActivity(listener) {
    if (typeof listener !== 'function') return noop;
    activityListeners.add(listener);
    return () => {
      activityListeners.delete(listener);
    };
  }

  /** Stop every running request of this client. Returns how many there were. */
  function cancelAll() {
    const cancels = Array.from(running.values());
    for (const cancel of cancels) cancel();
    return cancels.length;
  }

  function setUsageSink(fn) {
    usageSink = typeof fn === 'function' ? fn : null;
  }

  function setScopeSource(fn) {
    scopeSource = typeof fn === 'function' ? fn : null;
  }

  function readScope() {
    if (!scopeSource) return undefined;
    try {
      return scopeSource();
    } catch {
      return undefined;
    }
  }

  function cooldown() {
    const wait = constants.POST_CANCEL_COOLDOWN_MS;
    if (!(wait > 0) || lastCancelAt === null) return Promise.resolve();
    const left = lastCancelAt + wait - now();
    return left > 0 ? new Promise((resolve) => setTimer(resolve, left)) : Promise.resolve();
  }

  // --- token bookkeeping -------------------------------------------------------

  function storeCalibration(model, sample) {
    const prev = storedCalibration(model);
    const next = stats.updateCalibration(prev || undefined, sample);
    if (!next || next === prev) return;
    if (prev && next.charsPerToken === prev.charsPerToken && next.samples === prev.samples) return;

    if (!settings) {
      memoryCalibration = { ...memoryCalibration, [model]: next };
      return;
    }
    try {
      const write = settings.update('aiCalibration', (all) => ({ ...(isPlainObject(all) ? all : {}), [model]: next }), {});
      if (write && typeof write.catch === 'function') write.catch(noop);
    } catch {
      // The ratio is a convenience; a failed write must not fail the request
    }
  }

  // Did the model see the whole prompt? Also teaches the ratio when it did.
  function checkPrompt(model, promptChars, usage) {
    const inputTokens = usage ? usage.inputTokens : null;
    if (!isPositive(inputTokens) || !isPositive(promptChars)) return false;

    const history = promptHistory.get(model) || [];
    const truncated = stats.looksTruncated({ promptChars, inputTokens, history }) === true;
    promptHistory.set(model, [...history, { promptChars, inputTokens }].slice(-HISTORY_LENGTH));
    if (!truncated) storeCalibration(model, { promptChars, inputTokens });
    return truncated;
  }

  // --- one request ---------------------------------------------------------------

  function launch(options, edit) {
    const opts = isPlainObject(options) ? options : {};
    const meta = isPlainObject(opts.meta) ? opts.meta : {};
    const id = makeId();
    const scopeAtStart = readScope();
    const startedAt = now();

    const system = textOf(opts.system);
    const messages = Array.isArray(opts.messages)
      ? opts.messages.map(message => (isPlainObject(message) ? { role: message.role, content: message.content } : message))
      : opts.messages;
    const promptChars = system.length + (Array.isArray(messages)
      ? messages.reduce((sum, message) => sum + (isPlainObject(message) ? textOf(message.content).length : 0), 0)
      : 0);
    const instruction = cutInstruction(meta.instruction, constants.LOG_INSTRUCTION_MAX);

    const state = { cancelled: false, finished: false, sendId: null, cancelSent: false, sends: 0 };

    // A callback of the caller must not be able to fail the request
    const tell = (name, ...args) => {
      if (typeof opts[name] !== 'function') return;
      try {
        opts[name](...args);
      } catch {
        // The display is the caller's business
      }
    };

    function cancel() {
      if (state.finished) return;
      if (!state.cancelled) {
        state.cancelled = true;
        lastCancelAt = now();
      }
      if (state.sendId === null || state.cancelSent) return;
      state.cancelSent = true;
      if (!bridge || typeof bridge.aiCancel !== 'function') return;
      try {
        const sent = bridge.aiCancel(state.sendId);
        if (sent && typeof sent.catch === 'function') sent.catch(noop);
      } catch {
        // Main answers the request itself when it ends
      }
    }

    const judge = (result) => judgeEdit(result, {
      tag: textOf(opts.tag) || constants.EDIT_TAG,
      original: opts.original,
      clean: deps.cleanModelOutput,
      constants
    });

    // The result shape, from whatever main answered
    function shape(main, extra) {
      const answer = isPlainObject(main) ? main : {};
      const ok = answer.ok === true;
      const stopReason = ok ? (textOf(answer.stopReason) || 'unknown') : 'error';
      const usage = isPlainObject(answer.usage)
        ? {
          inputTokens: isFiniteNumber(answer.usage.inputTokens) ? answer.usage.inputTokens : null,
          outputTokens: isFiniteNumber(answer.usage.outputTokens) ? answer.usage.outputTokens : null
        }
        : null;
      const error = ok ? null : {
        code: textOf(answer.error && answer.error.code) || 'unknown',
        message: textOf(answer.error && answer.error.message) || `${FAILED_PREFIX}sovellus ei palauttanut vastausta.`,
        status: answer.error && isFiniteNumber(answer.error.status) ? answer.error.status : null
      };

      return {
        ok,
        id,
        text: typeof answer.text === 'string' ? answer.text : textOf(extra.streamed),
        stopReason,
        stopSequence: typeof answer.stopSequence === 'string' ? answer.stopSequence : null,
        usage,
        model: textOf(answer.model) || textOf(answer.requestedModel) || extra.model,
        requestedModel: textOf(answer.requestedModel) || extra.model,
        provider: answer.provider === 'cherry' || answer.provider === 'anthropic' ? answer.provider : extra.provider,
        maxTokensSent: isFiniteNumber(answer.maxTokens) ? answer.maxTokens : (isFiniteNumber(extra.maxTokens) ? extra.maxTokens : 0),
        systemAsUser: answer.systemAsUser === true,
        sawThinking: answer.sawThinking === true,
        refusal: isPlainObject(answer.refusal)
          ? { category: answer.refusal.category ?? null, explanation: answer.refusal.explanation ?? null }
          : null,
        ms: isFiniteNumber(answer.ms) ? answer.ms : Math.max(0, now() - startedAt),
        cancelled: stopReason === 'cancelled',
        truncated: stopReason === 'max_tokens',
        refused: stopReason === 'refusal',
        promptChars,
        promptTruncated: false,
        retried: false,
        error,
        logId: null,
        logMeta: null
      };
    }

    const failed = (code, message, extra) => shape({ ok: false, text: '', error: { code, message, status: null } }, extra);

    // Callers treat a stop in one place: whatever main answered, a request
    // that was cancelled resolves as cancelled
    function asCancelled(result) {
      return { ...result, ok: true, stopReason: 'cancelled', cancelled: true, truncated: false, refused: false, error: null };
    }

    // One send through the bridge
    async function send(model, provider, maxTokens) {
      const sendId = state.sends === 0 ? id : makeId();
      state.sends += 1;
      state.sendId = sendId;
      state.cancelSent = false;

      const request = { id: sendId, system, messages, model, maxTokens };
      if (typeof opts.temperature === 'number') request.temperature = opts.temperature;
      if (Array.isArray(opts.stopSequences) && opts.stopSequences.length > 0) request.stopSequences = opts.stopSequences.slice();
      if (opts.thinking === 'off') request.thinking = 'off';

      let streamed = '';
      let open = true;
      const onChunk = (chunk) => {
        if (!open || state.cancelled || !isPlainObject(chunk)) return;
        if (chunk.type === 'text' && typeof chunk.text === 'string') {
          streamed += chunk.text;
          tell('onText', chunk.text, streamed);
        } else if (chunk.type === 'phase' && typeof chunk.phase === 'string') {
          tell('onPhase', chunk.phase);
        }
      };

      let result;
      try {
        const main = await bridge.aiRequest(request, onChunk);
        result = isPlainObject(main)
          ? shape(main, { streamed, model, provider, maxTokens })
          : failed('unknown', `${FAILED_PREFIX}sovellus ei palauttanut vastausta.`, { streamed, model, provider, maxTokens });
      } catch (error) {
        const detail = textOf(error && error.message) || 'tuntematon virhe';
        result = { ...failed('unknown', FAILED_PREFIX + detail, { model, provider, maxTokens }), text: streamed };
      }
      open = false;
      state.sendId = null;

      if (state.cancelled) result = asCancelled(result);
      result.promptTruncated = checkPrompt(result.requestedModel || model, promptChars, result.usage);
      return result;
    }

    function logMetaFor(result, logId) {
      const logMeta = {
        source: 'faust',
        action: textOf(meta.action),
        actionLabel: textOf(meta.actionLabel),
        instruction,
        provider: result.provider || null,
        model: result.model || null,
        requestLogId: logId
      };
      if (typeof meta.runId === 'string' && meta.runId !== '') logMeta.runId = meta.runId;
      return logMeta;
    }

    // The usage row of this request: one row, also when it was sent twice
    function deliverRow(result, verdict, sendResults, windowTokens) {
      if (opts.log === false || !usageSink || sendResults.length === 0) return null;
      // A request that began under another project must not write into this one
      if (readScope() !== scopeAtStart) return null;

      let outcome = 'ok';
      let reason = null;
      if (result.cancelled) {
        outcome = 'cancelled';
      } else if (!result.ok) {
        outcome = 'error';
        reason = result.error ? result.error.code : null;
      } else if (verdict && !verdict.accepted) {
        outcome = 'no_suggestion';
        reason = verdict.reason;
      }

      const tokens = (name) => sendResults.reduce((sum, sent) => addNullable(sum, sent.usage ? sent.usage[name] : null), null);
      const lastIn = result.usage ? result.usage.inputTokens : null;

      const row = log.requestRow({
        action: textOf(meta.action),
        actionLabel: textOf(meta.actionLabel),
        instruction,
        provider: result.provider || '',
        model: result.model,
        outcome,
        reason,
        stopReason: result.stopReason,
        requests: sendResults.length,
        runId: meta.runId,
        chapterId: meta.chapterId,
        tokensIn: tokens('inputTokens'),
        tokensOut: tokens('outputTokens'),
        contextUsed: isPositive(lastIn) && isPositive(windowTokens) ? lastIn / windowTokens : null,
        promptChars: promptChars * sendResults.length,
        sawThinking: sendResults.some(sent => sent.sawThinking)
      }, new Date(now()).toISOString());

      try {
        usageSink(row);
      } catch {
        return null;
      }
      return row.id;
    }

    function finish(result, sendResults, windowTokens) {
      const verdict = edit ? judge(result) : null;
      const logId = deliverRow(result, verdict, sendResults, windowTokens);
      const complete = { ...result, logId, logMeta: logMetaFor(result, logId) };
      return verdict ? { ...complete, ...verdict } : complete;
    }

    // A request that ends before it was sent still resolves as cancelled after cancel()
    const unsentFailure = (code, message, extra) => {
      const result = failed(code, message, extra);
      return state.cancelled ? asCancelled(result) : result;
    };

    async function perform() {
      const unsent = { model: textOf(opts.model), provider: null, maxTokens: 0 };

      if (settings) {
        try {
          await settings.load();
        } catch {
          // An unreadable settings file is handled by the store itself
        }
        if (settings.get('aiOff', false) === true) return finish(unsentFailure('ai_off', AI_OFF_SENTENCE, unsent), [], 0);
      }

      if (!bridge || typeof bridge.aiRequest !== 'function') return finish(unsentFailure('no_bridge', NO_BRIDGE_MESSAGE, unsent), [], 0);

      const cfg = await getConfig();
      const model = textOf(opts.model) || modelFor(opts.role, cfg);
      const provider = cfg ? cfg.provider : null;
      const { window: windowTokens, headroom } = modelSettings(model, cfg);
      // The answer budget plus the model's reasoning headroom; a missing budget
      // is left missing, so that main refuses the request with its own text
      const maxTokens = typeof opts.maxTokens === 'number' ? opts.maxTokens + headroom : undefined;
      const known = { model, provider, maxTokens: 0 };

      if (!state.cancelled) await cooldown();
      if (state.cancelled) return finish(asCancelled(shape({ ok: true, text: '' }, known)), [], windowTokens);

      tell('onPhase', 'connecting');
      // The callback may itself have pressed stop: then nothing leaves the machine
      if (state.cancelled) return finish(asCancelled(shape({ ok: true, text: '' }, known)), [], windowTokens);
      const first = await send(model, provider, maxTokens);
      const sendResults = [first];
      let result = first;

      // Reasoning used the whole limit: once more with room for the answer
      const mayRetry = constants.RETRY_ON_REASONING_EXHAUSTED === true && (edit || opts.retryOnEmpty === true);
      if (mayRetry && first.ok && !first.cancelled && reasoningExhausted(first) && !state.cancelled) {
        const cap = cfg && isPlainObject(cfg.defaults) && isPlainObject(cfg.defaults.maxOutput) ? cfg.defaults.maxOutput[first.provider] : undefined;
        const doubled = 2 * first.maxTokensSent;
        const bigger = isPositive(cap) ? Math.min(cap, doubled) : doubled;
        // At the provider's cap already: the same request again would end the same way
        if (bigger > first.maxTokensSent) {
          tell('onPhase', 'retrying');
          if (state.cancelled) {
            result = asCancelled(first);
          } else {
            const second = await send(model, provider, bigger);
            sendResults.push(second);
            result = { ...second, retried: true, ms: first.ms + second.ms };
          }
        }
      }

      return finish(result, sendResults, windowTokens);
    }

    running.set(id, cancel);
    announceActivity();

    const result = perform()
      .catch((error) => {
        // Nothing may reject: a bug here becomes an error result like any other
        const detail = textOf(error && error.message) || 'tuntematon virhe';
        const base = unsentFailure('unknown', FAILED_PREFIX + detail, { model: textOf(opts.model), provider: null, maxTokens: 0 });
        const complete = { ...base, logMeta: logMetaFor(base, null) };
        return edit ? { ...complete, ...judgeEdit(complete, { tag: textOf(opts.tag) || constants.EDIT_TAG, constants }) } : complete;
      })
      .then((value) => {
        state.finished = true;
        running.delete(id);
        announceActivity();
        return value;
      });

    return { id, result, cancel };
  }

  /** Send a request. The id is there at once; `result` never rejects. */
  const request = (opts) => launch(opts, false);

  /** The same, for an edit task: the result also says whether it may become a suggestion. */
  const requestEdit = (opts) => launch(opts, true);

  return {
    request,
    requestEdit,
    getConfig,
    refreshConfig,
    configSnapshot,
    modelFor,
    modelSettings,
    charsPerToken,
    budgetFor,
    listModels,
    cancelAll,
    activeCount,
    onActivity,
    setUsageSink,
    setScopeSource
  };
}

let singleton = null;

/** The one client of the app, over window.electronAPI and the settings store. */
function getAIClient() {
  if (!singleton) {
    const bridge = typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : null;
    singleton = createAIClient({ bridge, settings: getSettingsStore() });
  }
  return singleton;
}

module.exports = {
  CLIENT_CONSTANTS, ROLES, ROLE_LABELS,
  judgeEdit, reasonText, stopNote,
  createAIClient, getAIClient
};

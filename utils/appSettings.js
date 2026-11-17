/**
 * Settings rules (main process)
 *
 * Pure helpers behind the settings handlers of electron.js: what the
 * renderer may learn about the keys (two booleans), how one key is written,
 * how the provider settings are patched, and how the UI preferences are
 * merged. The handlers stay a few lines each and the rules are unit-tested
 * (test/utils/appSettings.test.js).
 *
 * A key value is never logged here and never returned outside `config`.
 */

const KEY_NAMES = ['ANTHROPIC_API_KEY', 'CHERRY_API_KEY'];
const ROLE_NAMES = ['prose', 'edit', 'analysis'];

const MAX_MODEL_ID = 200;
const WINDOW_RANGE = [1024, 2000000];
const HEADROOM_RANGE = [0, 64000];
const PREF_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const MAX_PREFS_CHARS = 512 * 1024;

// As an object key this name would reach the prototype instead of storing a value
const UNSAFE_KEY = '__proto__';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const inRange = (value, [min, max]) => Number.isInteger(value) && value >= min && value <= max;
const isModelId = (id) => typeof id === 'string' && id !== '' && id.length <= MAX_MODEL_ID && id !== UNSAFE_KEY;

/** What the renderer may know about the keys: whether each one is set. */
function publicKeyStatus(cfg) {
  return {
    ANTHROPIC_API_KEY: !!(cfg && cfg.anthropicKey),
    CHERRY_API_KEY: !!(cfg && cfg.cherryKey)
  };
}

/**
 * Write or delete one key. The other settings are carried over untouched,
 * because the renderer no longer has them to send back.
 * @returns {{ok: true, config: object} | {ok: false, error: string}}
 */
function applyKeyWrite(apiConfig, name, value) {
  if (!KEY_NAMES.includes(name)) return { ok: false, error: 'Tuntematon avaimen nimi.' };
  if (typeof value !== 'string') return { ok: false, error: 'Avain ei ole tekstiä.' };

  const config = { ...(isPlainObject(apiConfig) ? apiConfig : {}) };
  const trimmed = value.trim();
  if (trimmed === '') delete config[name];
  else config[name] = trimmed;
  return { ok: true, config };
}

/** Role → model id, '' for a role that follows the default model. */
function readRoles(apiConfig) {
  const stored = isPlainObject(apiConfig) && isPlainObject(apiConfig.AI_ROLE_MODELS) ? apiConfig.AI_ROLE_MODELS : {};
  const roles = {};
  for (const role of ROLE_NAMES) {
    roles[role] = own(stored, role) && typeof stored[role] === 'string' ? stored[role] : '';
  }
  return roles;
}

/** A copy of the per-model settings, {} when there are none. */
function readModelSettings(apiConfig) {
  const stored = isPlainObject(apiConfig) && isPlainObject(apiConfig.AI_MODEL_SETTINGS) ? apiConfig.AI_MODEL_SETTINGS : {};
  const settings = {};
  for (const [id, entry] of Object.entries(stored)) {
    if (isModelId(id) && isPlainObject(entry)) settings[id] = { ...entry };
  }
  return settings;
}

// One model's settings after a patch. A field set to null goes back to the
// default; a field that is not valid is ignored and never stored.
function patchModelEntry(current, patch) {
  const entry = { ...current };

  if (own(patch, 'window')) {
    if (patch.window === null) delete entry.window;
    else if (inRange(patch.window, WINDOW_RANGE)) entry.window = patch.window;
  }
  if (own(patch, 'headroom')) {
    if (patch.headroom === null) delete entry.headroom;
    else if (inRange(patch.headroom, HEADROOM_RANGE)) entry.headroom = patch.headroom;
  }
  if (own(patch, 'systemAsUser')) {
    if (patch.systemAsUser === null) delete entry.systemAsUser;
    else if (typeof patch.systemAsUser === 'boolean') entry.systemAsUser = patch.systemAsUser;
  }
  return entry;
}

/**
 * Provider settings after a patch from the settings block. Returns a new
 * object; unknown and invalid fields of the patch are ignored. Keys are not
 * written here (applyKeyWrite does that, one at a time).
 */
function applyProviderPatch(apiConfig, next) {
  const config = { ...(isPlainObject(apiConfig) ? apiConfig : {}) };
  const patch = isPlainObject(next) ? next : {};

  if (patch.provider === 'cherry' || patch.provider === 'anthropic') {
    config.AI_PROVIDER = patch.provider;
  }
  if (typeof patch.gatewayUrl === 'string' && patch.gatewayUrl.trim()) {
    config.CHERRY_GATEWAY_URL = patch.gatewayUrl.trim();
  }
  if (typeof patch.model === 'string') {
    config.CHERRY_MODEL = patch.model;
  }

  if (typeof patch.anthropicModel === 'string' && patch.anthropicModel.trim().length <= MAX_MODEL_ID) {
    config.ANTHROPIC_MODEL = patch.anthropicModel.trim();
  }

  if (isPlainObject(patch.roles)) {
    const roles = readRoles(config);
    for (const role of ROLE_NAMES) {
      if (!own(patch.roles, role) || typeof patch.roles[role] !== 'string') continue;
      const id = patch.roles[role].trim();
      if (id.length <= MAX_MODEL_ID) roles[role] = id;
    }
    // Only the roles that have their own model are stored
    config.AI_ROLE_MODELS = {};
    for (const role of ROLE_NAMES) {
      if (roles[role] !== '') config.AI_ROLE_MODELS[role] = roles[role];
    }
  }

  if (isPlainObject(patch.modelSettings)) {
    const settings = readModelSettings(config);
    for (const [id, value] of Object.entries(patch.modelSettings)) {
      if (!isModelId(id)) continue;
      if (value === null) {
        delete settings[id];
      } else if (isPlainObject(value)) {
        const entry = patchModelEntry(settings[id] || {}, value);
        if (Object.keys(entry).length > 0) settings[id] = entry;
        else delete settings[id];
      }
    }
    config.AI_MODEL_SETTINGS = settings;
  }

  return config;
}

/**
 * UI preferences after a patch. Shallow: a value replaces the key, null or
 * undefined deletes it.
 * @returns {{ok: true, prefs: object} | {ok: false, error: string}}
 */
function mergePrefs(prev, patch) {
  const invalid = { ok: false, error: 'Virheellinen asetus.' };
  if (!isPlainObject(patch)) return invalid;

  const prefs = { ...(isPlainObject(prev) ? prev : {}) };
  for (const key of Object.keys(patch)) {
    if (!PREF_KEY.test(key)) return invalid;
    const value = patch[key];
    if (value === null || value === undefined) delete prefs[key];
    else prefs[key] = value;
  }

  let serialized;
  try {
    serialized = JSON.stringify(prefs);
  } catch {
    // A value that cannot be written to the file (a cycle, a BigInt)
    return invalid;
  }
  if (serialized.length > MAX_PREFS_CHARS) {
    return { ok: false, error: 'Asetukset ovat liian suuret tallennettaviksi.' };
  }
  return { ok: true, prefs };
}

module.exports = { KEY_NAMES, ROLE_NAMES, publicKeyStatus, applyKeyWrite, applyProviderPatch, readRoles, readModelSettings, mergePrefs };

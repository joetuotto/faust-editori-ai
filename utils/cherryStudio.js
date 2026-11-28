/**
 * Cherry Studio on this computer (main process)
 *
 * FAUST's Cherry Studio source talks to Cherry Studio's local API gateway, and the gateway wants
 * its own key. The writer should not have to copy that key by hand, and a model provider's key
 * pasted in its place is rejected by the gateway. So FAUST reads the gateway's settings from
 * Cherry Studio's own preferences: whether the gateway is on, its address, its key, and the model
 * Cherry Studio uses by default.
 *
 * Read-only, through the system's sqlite3. Nothing is written. The key is never logged, never
 * stored by FAUST and never leaves the main process, and resolveProvider() uses it only for a
 * gateway on this computer: a loopback address on the port Cherry Studio itself listens on.
 *
 * The rules are pure functions (parseRows, normalizeGateway, sameGateway, resolveProvider) and are
 * unit-tested (test/utils/cherryStudio.test.js); readLocalGateway does the one read.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:23333';
const DEFAULT_PORT = 23333;
const MAX_MODEL_ID = 200;

// Fixed places, as in utils/voikko.js: an app opened from Finder has a bare PATH
const SQLITE_CANDIDATES = ['/usr/bin/sqlite3', '/opt/homebrew/bin/sqlite3', '/usr/local/bin/sqlite3'];

const PREFERENCE_KEYS = [
  'feature.api_gateway.enabled',
  'feature.api_gateway.host',
  'feature.api_gateway.port',
  'feature.api_gateway.api_key',
  'chat.default_model_id'
];

// Fixed text: nothing from outside goes into the statement
const QUERY = `SELECT key, value FROM preference WHERE scope = 'default' AND key IN (${PREFERENCE_KEYS.map(k => `'${k}'`).join(', ')});`;

// Unit and record separators: no preference value contains them
const FIELD = '\x1f';
const RECORD = '\x1e';

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]'];
// The gateway listens on every interface: this computer reaches it at the loopback address
const ANY_HOSTS = ['0.0.0.0', '::', '[::]'];

/** Where Cherry Studio keeps its preferences, or null on a system FAUST does not read them on. */
function preferencesPath({ platform = process.platform, home = os.homedir(), env = process.env } = {}) {
  const tail = ['CherryStudio', 'Data', 'cherrystudio.sqlite'];
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', ...tail);
  if (platform === 'linux') return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), ...tail);
  return null;
}

/** sqlite3's output (FIELD between key and value, RECORD after each row) as { key: value }. */
function parseRows(stdout) {
  const prefs = {};
  for (const record of String(stdout || '').split(RECORD)) {
    const row = record.replace(/^\s+/, '');
    const at = row.indexOf(FIELD);
    if (at <= 0) continue;
    const key = row.slice(0, at);
    if (!PREFERENCE_KEYS.includes(key)) continue;
    const raw = row.slice(at + 1);
    // Cherry Studio stores each value as JSON text: "127.0.0.1", 23333, true
    try { prefs[key] = JSON.parse(raw); } catch (error) { prefs[key] = raw; }
  }
  return prefs;
}

/** Cherry Studio writes a model as provider::model, its gateway lists it as provider:model. */
function toGatewayModelId(id) {
  if (typeof id !== 'string') return '';
  const model = id.trim().replace('::', ':');
  return model && model.length <= MAX_MODEL_ID && !/\s/.test(model) ? model : '';
}

/**
 * The gateway as FAUST uses it, or null when Cherry Studio has no gateway key.
 * url is null when the gateway does not listen on a loopback address: FAUST then takes nothing from it.
 * @returns {{enabled: boolean, url: string|null, key: string, defaultModel: string}|null}
 */
function normalizeGateway(prefs) {
  if (!prefs || typeof prefs !== 'object') return null;
  const key = typeof prefs['feature.api_gateway.api_key'] === 'string' ? prefs['feature.api_gateway.api_key'].trim() : '';
  if (!key) return null;

  const rawHost = String(prefs['feature.api_gateway.host'] || '127.0.0.1').trim().toLowerCase();
  const host = ANY_HOSTS.includes(rawHost) ? '127.0.0.1' : rawHost;
  const portNumber = Number(prefs['feature.api_gateway.port']);
  const port = Number.isInteger(portNumber) && portNumber > 0 && portNumber < 65536 ? portNumber : DEFAULT_PORT;
  const literal = host === '::1' ? '[::1]' : host;

  return {
    enabled: prefs['feature.api_gateway.enabled'] === true || prefs['feature.api_gateway.enabled'] === 'true',
    url: LOOPBACK_HOSTS.includes(host) ? `http://${literal}:${port}` : null,
    key,
    defaultModel: toGatewayModelId(prefs['chat.default_model_id'])
  };
}

// { loopback, port } of an address, null when it is not an http(s) address
function endpoint(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
    return { loopback: LOOPBACK_HOSTS.includes(parsed.hostname.toLowerCase()), port };
  } catch (error) {
    return null;
  }
}

/** Is `url` the gateway of the Cherry Studio on this computer: a loopback address on its port? */
function sameGateway(url, local) {
  if (!local || !local.url) return false;
  const wanted = endpoint(url);
  const own = endpoint(local.url);
  return !!(wanted && own && wanted.loopback && own.loopback && wanted.port === own.port);
}

const cleanUrl = (url) => String(url).trim().replace(/\/+$/, '').replace(/\/v1$/, '');
const text = (value) => (typeof value === 'string' ? value : '');

/**
 * The provider settings in use, and where each one came from.
 *
 * Order: what FAUST was started with (env), then the Cherry Studio on this computer for its own
 * gateway's key, then what the writer saved in FAUST (stored), then Cherry Studio for what the
 * writer has not chosen (address, model, and the source itself when nothing at all is set).
 *
 * The gateway's key comes from Cherry Studio before a saved one, because for that gateway it is
 * the key: a saved key that differs from it is one the gateway rejects.
 *
 * @param {{env?: object, stored?: object, local?: object|null}} sources
 */
function resolveProvider({ env = {}, stored = {}, local = null } = {}) {
  const from = { provider: 'default', gatewayUrl: 'default', cherryKey: null, model: null };

  const anthropicKey = text(env.ANTHROPIC_API_KEY) || text(stored.ANTHROPIC_API_KEY);

  let gatewayUrl = DEFAULT_GATEWAY_URL;
  if (text(env.CHERRY_GATEWAY_URL).trim()) { gatewayUrl = env.CHERRY_GATEWAY_URL; from.gatewayUrl = 'env'; }
  else if (text(stored.CHERRY_GATEWAY_URL).trim()) { gatewayUrl = stored.CHERRY_GATEWAY_URL; from.gatewayUrl = 'stored'; }
  else if (local && local.url) { gatewayUrl = local.url; from.gatewayUrl = 'cherry-studio'; }
  gatewayUrl = cleanUrl(gatewayUrl);

  // Only for the gateway the key belongs to, and only on this computer
  const own = sameGateway(gatewayUrl, local);

  let cherryKey = '';
  if (text(env.CHERRY_API_KEY)) { cherryKey = env.CHERRY_API_KEY; from.cherryKey = 'env'; }
  else if (own) { cherryKey = local.key; from.cherryKey = 'cherry-studio'; }
  else if (text(stored.CHERRY_API_KEY)) { cherryKey = stored.CHERRY_API_KEY; from.cherryKey = 'stored'; }

  let model = '';
  if (text(env.CHERRY_MODEL)) { model = env.CHERRY_MODEL; from.model = 'env'; }
  else if (text(stored.CHERRY_MODEL)) { model = stored.CHERRY_MODEL; from.model = 'stored'; }
  else if (own && local.defaultModel) { model = local.defaultModel; from.model = 'cherry-studio'; }

  let provider = 'anthropic';
  const chosen = text(env.FAUST_AI_PROVIDER) || text(stored.AI_PROVIDER);
  if (chosen) {
    provider = chosen.toLowerCase() === 'cherry' ? 'cherry' : 'anthropic';
    from.provider = text(env.FAUST_AI_PROVIDER) ? 'env' : 'stored';
  } else if (own && !anthropicKey) {
    // Nothing chosen and no Claude key: the Cherry Studio that is here is the source
    provider = 'cherry';
    from.provider = 'cherry-studio';
  }

  return {
    provider,
    gatewayUrl,
    model,
    cherryKey,
    anthropicKey,
    // FAUST_ANTHROPIC_MODEL, not ANTHROPIC_MODEL: a value set in the shell for other tools is not picked up
    anthropicModel: (text(env.FAUST_ANTHROPIC_MODEL) || text(stored.ANTHROPIC_MODEL)).trim(),
    from
  };
}

const defaultExists = (file) => fs.promises.access(file, fs.constants.R_OK).then(() => true, () => false);

const defaultRun = (file, args, timeoutMs) => new Promise((resolve, reject) => {
  execFile(file, args, { timeout: timeoutMs, maxBuffer: 64 * 1024, windowsHide: true }, (error, stdout) => {
    if (error) reject(error);
    else resolve(stdout);
  });
});

/**
 * Read the gateway settings of the Cherry Studio on this computer.
 * Resolves to null when there is no Cherry Studio, no sqlite3, no gateway key, or the read fails:
 * FAUST then works as it does without Cherry Studio. Never rejects.
 * @param {{exists?: Function, run?: Function, dbPath?: string|null, candidates?: string[], timeoutMs?: number}} [deps]
 */
async function readLocalGateway({
  exists = defaultExists,
  run = defaultRun,
  dbPath = preferencesPath(),
  candidates = SQLITE_CANDIDATES,
  timeoutMs = 3000
} = {}) {
  try {
    if (!dbPath || !(await exists(dbPath))) return null;

    let sqlite = null;
    for (const candidate of candidates) {
      if (await exists(candidate)) { sqlite = candidate; break; }
    }
    if (!sqlite) return null;

    // -init /dev/null: the writer's ~/.sqliterc must not change the output; -readonly: nothing is written
    const stdout = await run(sqlite, [
      '-init', '/dev/null', '-readonly', '-batch', '-list', '-separator', FIELD, '-newline', RECORD, dbPath, QUERY
    ], timeoutMs);
    return normalizeGateway(parseRows(stdout));
  } catch (error) {
    // No message: an error text could quote the output
    return null;
  }
}

module.exports = {
  DEFAULT_GATEWAY_URL,
  PREFERENCE_KEYS,
  QUERY,
  FIELD,
  RECORD,
  preferencesPath,
  parseRows,
  toGatewayModelId,
  normalizeGateway,
  sameGateway,
  resolveProvider,
  readLocalGateway
};

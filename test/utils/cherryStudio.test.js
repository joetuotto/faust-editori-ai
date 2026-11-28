/**
 * @jest-environment node
 */
// The Cherry Studio on this computer: FAUST reads the gateway's own key, address and default model
// from Cherry Studio's preferences, so the writer copies nothing by hand (a model provider's key
// pasted into the key field is rejected by the gateway). No test here holds a real key.
const {
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
} = require('../../utils/cherryStudio');

const GATEWAY_KEY = 'cs-sk-test-0000';
const OTHER_KEY = 'provider-key-pasted-by-mistake';
const MODEL = 'c91fb219-b725-43d2-925d-3c6e66bef527:deepseek-flash';

// sqlite3's output for the query, in the CLI's own order (by key)
const rows = (prefs) => Object.entries(prefs).map(([key, value]) => `${key}${FIELD}${value}${RECORD}`).join('');
const OUTPUT = rows({
  'chat.default_model_id': '"c91fb219-b725-43d2-925d-3c6e66bef527::deepseek-flash"',
  'feature.api_gateway.api_key': `"${GATEWAY_KEY}"`,
  'feature.api_gateway.enabled': 'true',
  'feature.api_gateway.host': '"127.0.0.1"',
  'feature.api_gateway.port': '23333'
});
const LOCAL = { enabled: true, url: 'http://127.0.0.1:23333', key: GATEWAY_KEY, defaultModel: MODEL };

describe('where Cherry Studio keeps its preferences', () => {
  test('macOS and Linux have a path, other systems none', () => {
    expect(preferencesPath({ platform: 'darwin', home: '/Users/aino', env: {} }))
      .toBe('/Users/aino/Library/Application Support/CherryStudio/Data/cherrystudio.sqlite');
    expect(preferencesPath({ platform: 'linux', home: '/home/aino', env: {} }))
      .toBe('/home/aino/.config/CherryStudio/Data/cherrystudio.sqlite');
    expect(preferencesPath({ platform: 'linux', home: '/home/aino', env: { XDG_CONFIG_HOME: '/x' } }))
      .toBe('/x/CherryStudio/Data/cherrystudio.sqlite');
    expect(preferencesPath({ platform: 'win32', home: 'C:\\Users\\aino', env: {} })).toBeNull();
  });

  test('the statement is fixed text that names only the five preferences', () => {
    for (const key of PREFERENCE_KEYS) expect(QUERY).toContain(`'${key}'`);
    expect(QUERY).toMatch(/^SELECT key, value FROM preference WHERE scope = 'default' AND key IN \(/);
    expect(QUERY).not.toMatch(/insert|update|delete|drop|attach|pragma/i);
  });
});

describe('parseRows', () => {
  test('reads each value as the JSON text Cherry Studio stores', () => {
    expect(parseRows(OUTPUT)).toEqual({
      'chat.default_model_id': 'c91fb219-b725-43d2-925d-3c6e66bef527::deepseek-flash',
      'feature.api_gateway.api_key': GATEWAY_KEY,
      'feature.api_gateway.enabled': true,
      'feature.api_gateway.host': '127.0.0.1',
      'feature.api_gateway.port': 23333
    });
  });

  test('keeps a value that is not JSON as text, and ignores rows it did not ask for', () => {
    const out = `feature.api_gateway.host${FIELD}127.0.0.1${RECORD}other.key${FIELD}"x"${RECORD}no-separator${RECORD}`;
    expect(parseRows(out)).toEqual({ 'feature.api_gateway.host': '127.0.0.1' });
  });

  test('empty output is no preferences', () => {
    expect(parseRows('')).toEqual({});
    expect(parseRows(undefined)).toEqual({});
  });
});

describe('normalizeGateway', () => {
  test('gives the address, the key and the default model in the gateway\'s own spelling', () => {
    expect(normalizeGateway(parseRows(OUTPUT))).toEqual(LOCAL);
  });

  test('no gateway key, no gateway', () => {
    expect(normalizeGateway({})).toBeNull();
    expect(normalizeGateway(null)).toBeNull();
    expect(normalizeGateway({ 'feature.api_gateway.api_key': '  ' })).toBeNull();
    expect(normalizeGateway({ 'feature.api_gateway.api_key': 12345 })).toBeNull();
  });

  test('a gateway that is switched off keeps its key and says it is off', () => {
    const off = normalizeGateway({ 'feature.api_gateway.api_key': GATEWAY_KEY, 'feature.api_gateway.enabled': false });
    expect(off).toEqual({ enabled: false, url: DEFAULT_GATEWAY_URL, key: GATEWAY_KEY, defaultModel: '' });
  });

  test('a gateway that listens on every interface is reached at the loopback address', () => {
    const any = normalizeGateway({ 'feature.api_gateway.api_key': GATEWAY_KEY, 'feature.api_gateway.host': '0.0.0.0', 'feature.api_gateway.port': 8080 });
    expect(any.url).toBe('http://127.0.0.1:8080');
    expect(normalizeGateway({ 'feature.api_gateway.api_key': GATEWAY_KEY, 'feature.api_gateway.host': 'localhost' }).url).toBe('http://localhost:23333');
    expect(normalizeGateway({ 'feature.api_gateway.api_key': GATEWAY_KEY, 'feature.api_gateway.host': '::1' }).url).toBe('http://[::1]:23333');
  });

  test('a gateway on another address gives no address: FAUST takes nothing from it', () => {
    const lan = normalizeGateway({ 'feature.api_gateway.api_key': GATEWAY_KEY, 'feature.api_gateway.host': '192.168.1.20' });
    expect(lan.url).toBeNull();
    expect(sameGateway('http://192.168.1.20:23333', lan)).toBe(false);
  });

  test('a port that is not a port falls back to the default one', () => {
    for (const port of ['abc', 0, 70000, 1.5, null]) {
      expect(normalizeGateway({ 'feature.api_gateway.api_key': GATEWAY_KEY, 'feature.api_gateway.port': port }).url).toBe(DEFAULT_GATEWAY_URL);
    }
  });

  test('toGatewayModelId turns provider::model into provider:model and refuses what is not an id', () => {
    expect(toGatewayModelId('abc::deepseek-flash')).toBe('abc:deepseek-flash');
    expect(toGatewayModelId('abc:deepseek-flash')).toBe('abc:deepseek-flash');
    expect(toGatewayModelId('')).toBe('');
    expect(toGatewayModelId(null)).toBe('');
    expect(toGatewayModelId('two words')).toBe('');
    expect(toGatewayModelId('x'.repeat(201))).toBe('');
  });
});

describe('sameGateway', () => {
  test('a loopback address on Cherry Studio\'s port is its gateway, whatever the loopback name', () => {
    expect(sameGateway('http://127.0.0.1:23333', LOCAL)).toBe(true);
    expect(sameGateway('http://localhost:23333', LOCAL)).toBe(true);
    expect(sameGateway('http://[::1]:23333/', LOCAL)).toBe(true);
  });

  test('another port, another computer or no address is not', () => {
    expect(sameGateway('http://127.0.0.1:9999', LOCAL)).toBe(false);
    expect(sameGateway('http://example.com:23333', LOCAL)).toBe(false);
    expect(sameGateway('https://gateway.example.com', LOCAL)).toBe(false);
    expect(sameGateway('not an address', LOCAL)).toBe(false);
    expect(sameGateway('file:///etc/passwd', LOCAL)).toBe(false);
    expect(sameGateway('http://127.0.0.1:23333', null)).toBe(false);
  });
});

describe('resolveProvider', () => {
  test('nothing set anywhere: Claude, no keys, the default address', () => {
    expect(resolveProvider()).toEqual({
      provider: 'anthropic',
      gatewayUrl: DEFAULT_GATEWAY_URL,
      model: '',
      cherryKey: '',
      anthropicKey: '',
      anthropicModel: '',
      from: { provider: 'default', gatewayUrl: 'default', cherryKey: null, model: null }
    });
  });

  test('nothing set in FAUST and a Cherry Studio on this computer: it is the source, with its key and model', () => {
    const cfg = resolveProvider({ env: {}, stored: {}, local: LOCAL });
    expect(cfg).toMatchObject({ provider: 'cherry', gatewayUrl: LOCAL.url, cherryKey: GATEWAY_KEY, model: MODEL });
    expect(cfg.from).toEqual({ provider: 'cherry-studio', gatewayUrl: 'cherry-studio', cherryKey: 'cherry-studio', model: 'cherry-studio' });
  });

  // The owner's case: Cherry Studio chosen and a model provider's key saved in the key field
  test('the gateway\'s own key is used instead of a saved key that is not the gateway\'s', () => {
    const cfg = resolveProvider({ env: {}, stored: { AI_PROVIDER: 'cherry', CHERRY_API_KEY: OTHER_KEY }, local: LOCAL });
    expect(cfg.cherryKey).toBe(GATEWAY_KEY);
    expect(cfg.from.cherryKey).toBe('cherry-studio');
    expect(cfg.provider).toBe('cherry');
    expect(cfg.from.provider).toBe('stored');
    // No model chosen in FAUST yet: Cherry Studio's default
    expect(cfg.model).toBe(MODEL);
  });

  test('what the writer chose in FAUST stays: source, model and address', () => {
    const stored = { AI_PROVIDER: 'cherry', CHERRY_MODEL: 'abc:other-model', CHERRY_GATEWAY_URL: 'http://localhost:23333/v1/' };
    const cfg = resolveProvider({ env: {}, stored, local: LOCAL });
    expect(cfg.model).toBe('abc:other-model');
    expect(cfg.gatewayUrl).toBe('http://localhost:23333');
    expect(cfg.from).toEqual({ provider: 'stored', gatewayUrl: 'stored', cherryKey: 'cherry-studio', model: 'stored' });
  });

  test('a Claude key or a chosen Claude source is not overridden by a Cherry Studio that happens to be installed', () => {
    expect(resolveProvider({ stored: { ANTHROPIC_API_KEY: 'claude-key' }, local: LOCAL }).provider).toBe('anthropic');
    expect(resolveProvider({ stored: { AI_PROVIDER: 'anthropic' }, local: LOCAL }).provider).toBe('anthropic');
    expect(resolveProvider({ env: { ANTHROPIC_API_KEY: 'claude-key' }, local: LOCAL }).provider).toBe('anthropic');
  });

  test('the key never goes to an address that is not Cherry Studio\'s own gateway on this computer', () => {
    for (const url of ['http://example.com:23333', 'https://gateway.example.com', 'http://127.0.0.1:9999', 'http://192.168.1.20:23333']) {
      const cfg = resolveProvider({ stored: { AI_PROVIDER: 'cherry', CHERRY_GATEWAY_URL: url }, local: LOCAL });
      expect(cfg.cherryKey).toBe('');
      expect(cfg.model).toBe('');
      expect(cfg.from.cherryKey).toBeNull();
    }
    // There the saved key is the one in use
    const cfg = resolveProvider({ stored: { AI_PROVIDER: 'cherry', CHERRY_GATEWAY_URL: 'http://example.com:23333', CHERRY_API_KEY: OTHER_KEY }, local: LOCAL });
    expect(cfg.cherryKey).toBe(OTHER_KEY);
    expect(cfg.from.cherryKey).toBe('stored');
  });

  test('what FAUST was started with wins over everything', () => {
    const env = { FAUST_AI_PROVIDER: 'Cherry', CHERRY_API_KEY: 'env-key', CHERRY_MODEL: 'env:model', CHERRY_GATEWAY_URL: 'http://127.0.0.1:23333', FAUST_ANTHROPIC_MODEL: ' claude-x ' };
    const cfg = resolveProvider({ env, stored: { AI_PROVIDER: 'anthropic', CHERRY_API_KEY: OTHER_KEY, CHERRY_MODEL: 'stored:model' }, local: LOCAL });
    expect(cfg).toMatchObject({ provider: 'cherry', cherryKey: 'env-key', model: 'env:model', anthropicModel: 'claude-x' });
    expect(cfg.from).toEqual({ provider: 'env', gatewayUrl: 'env', cherryKey: 'env', model: 'env' });
  });

  test('without a Cherry Studio the saved settings work as before', () => {
    const stored = { AI_PROVIDER: 'cherry', CHERRY_API_KEY: OTHER_KEY, CHERRY_MODEL: 'abc:m', ANTHROPIC_MODEL: 'claude-y' };
    const cfg = resolveProvider({ env: {}, stored, local: null });
    expect(cfg).toMatchObject({ provider: 'cherry', gatewayUrl: DEFAULT_GATEWAY_URL, cherryKey: OTHER_KEY, model: 'abc:m', anthropicModel: 'claude-y' });
    expect(cfg.from).toEqual({ provider: 'stored', gatewayUrl: 'default', cherryKey: 'stored', model: 'stored' });
  });

  test('settings that are not text are not used', () => {
    const cfg = resolveProvider({ stored: { AI_PROVIDER: 5, CHERRY_API_KEY: {}, CHERRY_MODEL: [], CHERRY_GATEWAY_URL: 7 } });
    expect(cfg).toMatchObject({ provider: 'anthropic', cherryKey: '', model: '', gatewayUrl: DEFAULT_GATEWAY_URL });
  });
});

describe('readLocalGateway', () => {
  const DB = '/home/CherryStudio/Data/cherrystudio.sqlite';
  const deps = (over = {}) => ({
    dbPath: DB,
    candidates: ['/usr/bin/sqlite3', '/opt/homebrew/bin/sqlite3'],
    exists: async () => true,
    run: async () => OUTPUT,
    ...over
  });

  test('reads the preferences read-only with the fixed statement', async () => {
    const calls = [];
    const found = await readLocalGateway(deps({ run: async (file, args, timeoutMs) => { calls.push({ file, args, timeoutMs }); return OUTPUT; } }));
    expect(found).toEqual(LOCAL);
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe('/usr/bin/sqlite3');
    expect(calls[0].args).toEqual(['-init', '/dev/null', '-readonly', '-batch', '-list', '-separator', FIELD, '-newline', RECORD, DB, QUERY]);
    expect(calls[0].timeoutMs).toBe(3000);
  });

  test('takes the first sqlite3 that exists', async () => {
    let used = null;
    await readLocalGateway(deps({
      exists: async (file) => file !== '/usr/bin/sqlite3',
      run: async (file) => { used = file; return OUTPUT; }
    }));
    expect(used).toBe('/opt/homebrew/bin/sqlite3');
  });

  test('no Cherry Studio, no sqlite3 or no path: null, and nothing is run', async () => {
    const run = jest.fn(async () => OUTPUT);
    expect(await readLocalGateway(deps({ run, exists: async (file) => file !== DB }))).toBeNull();
    expect(await readLocalGateway(deps({ run, exists: async (file) => file === DB }))).toBeNull();
    expect(await readLocalGateway(deps({ run, dbPath: null }))).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  test('a read that fails or times out is null, never an error', async () => {
    expect(await readLocalGateway(deps({ run: async () => { throw new Error('database is locked'); } }))).toBeNull();
    expect(await readLocalGateway(deps({ exists: async () => { throw new Error('EPERM'); } }))).toBeNull();
    expect(await readLocalGateway(deps({ run: async () => '' }))).toBeNull();
  });
});

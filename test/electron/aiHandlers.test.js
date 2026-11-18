/** @jest-environment node */
// Stage I-02 in the main process: electron.js loaded with a fake Electron, a fake SDK client and
// a temporary userData folder. dotenv is replaced, so no .env file is read. Checked here: keys come
// back only as booleans (A-L11), "Tekoäly pois" and "Pysäytä tekoäly" in the menu (R-6) and in
// the old handlers, the "Ei tekoälylle" wire guard on the old and the new path (E-7), the Claude
// direct wrapper (no temperature, the model field decides) and the thinking handler's removal.

const fs = require('fs');
const os = require('os');
const path = require('path');

const mockState = {
  handlers: {},
  listeners: {},
  menus: [],
  clients: [],
  calls: [],
  userData: null,
  respond: null      // (params, options) => Promise, set by each case
};

jest.mock('dotenv', () => ({ config: () => ({}) }));

jest.mock('electron', () => ({
  app: {
    getPath: () => mockState.userData,
    on: () => {},
    whenReady: () => new Promise(() => {}),   // the window is never created here
    quit: () => {},
    name: 'FAUST'
  },
  BrowserWindow: class { static getAllWindows() { return []; } },
  ipcMain: {
    handle: (channel, fn) => { mockState.handlers[channel] = fn; },
    on: (channel, fn) => { mockState.listeners[channel] = fn; }
  },
  dialog: { showSaveDialog: async () => ({}), showOpenDialog: async () => ({}), showMessageBoxSync: () => 2, showMessageBox: async () => ({ response: 2 }) },
  Menu: {
    buildFromTemplate: (template) => { mockState.menus.push(template); return {}; },
    setApplicationMenu: () => {}
  },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { openExternal: async () => {} },
  nativeTheme: {}
}));

// The SDK's error classes stay real (utils/aiRequest.js classifies by them); a client is a fake
// that records what it is asked and answers through mockState.respond
jest.mock('@anthropic-ai/sdk', () => {
  const actual = jest.requireActual('@anthropic-ai/sdk');
  function FakeAnthropic(options) {
    const client = {
      options,
      messages: {
        create: (params, opts) => {
          mockState.calls.push({ kind: 'create', params, options: opts });
          return mockState.respond(params, opts);
        },
        stream: (params, opts) => {
          mockState.calls.push({ kind: 'stream', params, options: opts });
          throw new Error('stream is not used in these cases');
        }
      }
    };
    mockState.clients.push(client);
    return client;
  }
  Object.assign(FakeAnthropic, actual);
  return FakeAnthropic;
});

const KEY = 'sk-test-000';
const ENV_NAMES = ['CHERRY_API_KEY', 'ANTHROPIC_API_KEY', 'FAUST_AI_PROVIDER', 'CHERRY_MODEL', 'CHERRY_GATEWAY_URL', 'FAUST_ANTHROPIC_MODEL'];
const savedEnv = {};

const invoke = (channel, ...args) => mockState.handlers[channel]({ sender: { send: (...a) => mockState.sent.push(a), isDestroyed: () => false } }, ...args);
const lastMenu = () => mockState.menus[mockState.menus.length - 1];
const submenu = (template, label) => (template.find(item => item.label === label) || {}).submenu || [];
const labels = (items) => items.filter(item => item.type !== 'separator').map(item => item.label);
const aiSubmenu = () => submenu(submenu(lastMenu(), 'Työkalut'), 'Tekoäly');

// A create call that answers with text, or waits until its signal aborts
const answer = (text) => async () => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, model: 'm' });
const hangUntilAborted = () => (_params, opts) => new Promise((resolve, reject) => {
  const { APIUserAbortError } = jest.requireActual('@anthropic-ai/sdk');
  opts.signal.addEventListener('abort', () => reject(new APIUserAbortError()));
});

beforeAll(() => {
  for (const name of ENV_NAMES) { savedEnv[name] = process.env[name]; delete process.env[name]; }
  mockState.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'faust-i02-'));
  mockState.sent = [];
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  require('../../electron.js');
});

// The menu is built when the switch changes (the window, which builds it at start, is never made here)
beforeAll(async () => {
  await invoke('prefs:set', { aiOff: true });
  await invoke('prefs:set', { aiOff: false });
});

afterAll(() => {
  for (const name of ENV_NAMES) { if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name]; }
  fs.rmSync(mockState.userData, { recursive: true, force: true });
  jest.restoreAllMocks();
});

beforeEach(() => {
  mockState.calls = [];
  mockState.sent = [];
  mockState.respond = answer('toimii');
  mockState.listeners['ai:set-protected'](null, []);
});

describe('keys and settings (A-L11, A-L12)', () => {
  test('a saved key comes back only as a boolean, and Poista avain removes it', async () => {
    const saved = await invoke('keys:set', { name: 'CHERRY_API_KEY', value: KEY });
    expect(saved).toMatchObject({ success: true, keys: { CHERRY_API_KEY: true, ANTHROPIC_API_KEY: false } });
    const loaded = await invoke('load-api-keys');
    expect(loaded).toEqual({ success: true, keys: { CHERRY_API_KEY: true, ANTHROPIC_API_KEY: false } });
    const provider = await invoke('ai:get-provider');
    expect(JSON.stringify([saved, loaded, provider])).not.toContain(KEY);
    expect(provider).toMatchObject({ hasCherryKey: true, keyFromEnv: { cherry: false, anthropic: false }, defaults: { window: { cherry: 32000 } } });

    const removed = await invoke('keys:set', { name: 'CHERRY_API_KEY', value: '' });
    expect(removed.keys.CHERRY_API_KEY).toBe(false);
  });

  test('an unknown key name is refused and nothing is written', async () => {
    const result = await invoke('keys:set', { name: 'OTHER_KEY', value: KEY });
    expect(result).toEqual({ success: false, error: 'Tuntematon avaimen nimi.' });
  });

  test('the old key handlers and the thinking handler are gone', () => {
    expect(mockState.handlers['save-api-keys']).toBeUndefined();
    expect(mockState.handlers['claude-api-thinking']).toBeUndefined();
    const preload = fs.readFileSync(path.join(__dirname, '..', '..', 'preload.js'), 'utf8');
    expect(preload).not.toMatch(/claudeAPIThinking|saveApiKeys/);
  });
});

describe('Tekoäly pois and Pysäytä tekoäly in the menu (R-6, A-L18)', () => {
  test('with the switch on, every AI door leaves the menu and the way back stays', async () => {
    await invoke('prefs:set', { aiOff: true });
    const tools = submenu(lastMenu(), 'Työkalut');
    expect(labels(aiSubmenu())).toEqual(['Tekoälyasetukset…', 'Tekoäly pois']);
    expect(aiSubmenu().find(item => item.label === 'Tekoäly pois').checked).toBe(true);
    expect(labels(tools)).not.toContain('Suunnittele hahmot…');
    expect(labels(tools)).not.toContain('Uusi hahmo…');
    expect(labels(submenu(lastMenu(), 'Näytä'))).not.toEqual(expect.arrayContaining(['Liminal Engine (tekoälyavustaja)']));
    expect(labels(submenu(lastMenu(), 'Näytä'))).not.toContain('Keskustelu');

    await invoke('prefs:set', { aiOff: false });
    const ai = aiSubmenu();
    expect(labels(ai).slice(-3)).toEqual(['Pysäytä tekoäly', 'Tekoälyasetukset…', 'Tekoäly pois']);
    expect(ai.find(item => item.label === 'Pysäytä tekoäly').accelerator).toBe('CmdOrCtrl+.');
    expect(labels(submenu(lastMenu(), 'Näytä'))).toContain('Keskustelu');
  });

  test('the old handlers refuse while the switch is on, and no client is made', async () => {
    await invoke('keys:set', { name: 'CHERRY_API_KEY', value: KEY });
    await invoke('ai:set-provider', { provider: 'cherry', model: 'p:model-a' });
    await invoke('prefs:set', { aiOff: true });
    const made = mockState.clients.length;
    expect(await invoke('claude-api', { prompt: 'Hei' })).toEqual({ success: false, error: 'Tekoäly pois -asetus on päällä.' });
    const stream = await invoke('claude-api-stream', { prompt: 'Hei' });
    expect(stream).toEqual({ success: false, error: 'Tekoäly pois -asetus on päällä.' });
    expect(mockState.sent).toContainEqual(['claude-stream-chunk', { error: 'Tekoäly pois -asetus on päällä.', type: 'error' }]);
    const request = await invoke('ai:request', { id: 'r1', messages: [{ role: 'user', content: 'Hei' }], maxTokens: 10 });
    expect(request.error).toMatchObject({ code: 'ai_off', message: 'Tekoäly pois -asetus on päällä.' });
    expect(mockState.clients.length).toBe(made);
    await invoke('prefs:set', { aiOff: false });
  });
});

describe('the "Ei tekoälylle" wire guard (E-7)', () => {
  const paragraph = 'Ensimmäinen lause on lyhyt. Toinen lause kertoo, että Aino käveli pitkin hiljaista rantaa ja ajatteli isäänsä, joka ei koskaan palannut merelle. Kolmas lause päättää kappaleen.';

  beforeEach(async () => {
    await invoke('keys:set', { name: 'CHERRY_API_KEY', value: KEY });
    await invoke('ai:set-provider', { provider: 'cherry', model: 'p:model-a' });
    mockState.listeners['ai:set-protected'](null, [{ title: 'Salainen luku', text: paragraph }]);
  });

  test('a sentence from inside a protected paragraph is refused on the old path with the chapter and the snippet', async () => {
    const sentence = 'Toinen lause kertoo, että Aino käveli pitkin hiljaista rantaa';
    const result = await invoke('claude-api', { prompt: `Käyttäjä kysyy: ${sentence}. Mitä tästä ajattelet?` });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^Kehotteessa on tekstiä luvusta ”Salainen luku”, joka on merkitty Ei tekoälylle \(”Toinen lause kertoo, .{0,40}…”\)\. Mitään ei lähetetty\.$/);
    expect(mockState.calls).toEqual([]);
  });

  test('the stream handler and the request layer refuse the same text', async () => {
    const text = 'ajatteli isäänsä, joka ei koskaan palannut merelle';
    const stream = await invoke('claude-api-stream', { messages: [{ role: 'user', content: text }] });
    expect(stream.error).toMatch(/^Kehotteessa on tekstiä luvusta ”Salainen luku”/);
    const request = await invoke('ai:request', { id: 'r2', system: 'Ohje', messages: [{ role: 'user', content: text }], maxTokens: 10 });
    expect(request.error.code).toBe('protected');
    expect(mockState.calls).toEqual([]);
  });

  test('a request without protected text goes through', async () => {
    const result = await invoke('claude-api', { prompt: 'Mikä on hyvä luvun nimi?' });
    expect(result).toMatchObject({ success: true, data: 'toimii' });
  });
});

describe('the old handlers choose no model themselves (A-L13, A-L16)', () => {
  test('in Cherry Studio mode the selected gateway model answers a call without a model', async () => {
    await invoke('keys:set', { name: 'CHERRY_API_KEY', value: KEY });
    await invoke('ai:set-provider', { provider: 'cherry', model: 'p:model-a' });
    await invoke('claude-api', { prompt: 'Hei' });
    expect(mockState.calls[0].params.model).toBe('p:model-a');
    expect(mockState.calls[0].options.signal).toBeDefined();
  });

  test('Claude directly: the model field decides, temperature is never sent and max_tokens is at least 16 000', async () => {
    await invoke('keys:set', { name: 'ANTHROPIC_API_KEY', value: KEY });
    await invoke('ai:set-provider', { provider: 'anthropic', anthropicModel: 'claude-model-x' });
    await invoke('claude-api', { prompt: 'Hei', model: '', temperature: 0.7, max_tokens: 2000 });
    const { params } = mockState.calls[0];
    expect(params.model).toBe('claude-model-x');
    expect(params).not.toHaveProperty('temperature');
    expect(params.max_tokens).toBe(16000);
  });

  test('Claude directly without a model field and without a model of the caller gives its reason', async () => {
    await invoke('keys:set', { name: 'ANTHROPIC_API_KEY', value: KEY });
    await invoke('ai:set-provider', { provider: 'anthropic', anthropicModel: '' });
    const result = await invoke('claude-api', { prompt: 'Hei' });
    expect(result).toEqual({ success: false, error: 'Claude-mallia ei ole valittu. Valitse malli tietopaneelin Tekoäly-välilehdellä.' });
    expect(mockState.calls).toEqual([]);
  });

  test('no retired model id literal is left where requests are routed', () => {
    const root = path.join(__dirname, '..', '..');
    const files = ['electron.js', 'preload.js', 'app.js', 'src/services/ai/HybridWritingFlow.js'];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => (
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.js') ? [path.join(dir, entry.name)] : []));
    const all = [...files.map(file => path.join(root, file)), ...walk(path.join(root, 'src', 'components'))];
    const hits = all.filter(file => /claude-(3|sonnet|opus|haiku)[a-z0-9.-]*/.test(fs.readFileSync(file, 'utf8')));
    expect(hits.map(file => path.relative(root, file))).toEqual([]);
  });
});

// Last in the file: the latch of Pysäytä tekoäly runs on the request table's own clock (real time)
describe('Pysäytä tekoäly and the old handlers (X-22)', () => {
  test('Pysäytä tekoäly stops a running old request, refuses the next one for three seconds, then lets it through', async () => {
    await invoke('keys:set', { name: 'CHERRY_API_KEY', value: KEY });
    await invoke('ai:set-provider', { provider: 'cherry', model: 'p:model-a' });
    mockState.respond = hangUntilAborted();
    const running = invoke('claude-api', { prompt: 'Kirjoita luku', max_tokens: 4096 });
    await new Promise(resolve => setImmediate(resolve));
    aiSubmenu().find(item => item.label === 'Pysäytä tekoäly').click();
    expect(await running).toEqual({ success: false, error: 'Pyyntö pysäytettiin.' });

    const created = mockState.calls.length;
    expect(await invoke('claude-api', { prompt: 'Seuraava luku' })).toEqual({ success: false, error: 'Pyyntö pysäytettiin.' });
    expect(mockState.calls.length).toBe(created);

    await new Promise(resolve => setTimeout(resolve, 3100));
    mockState.respond = answer('toimii');
    expect(await invoke('claude-api', { prompt: 'Seuraava luku' })).toMatchObject({ success: true, data: 'toimii' });
  }, 10000);
});

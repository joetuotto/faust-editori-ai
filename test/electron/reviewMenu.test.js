/** @jest-environment node */
// Stage I-08 in the main process: Näytä ▸ Tarkistus (⌘3), which shows Tietopaneeli on its Tarkistus tab.
// electron.js is loaded with a fake Electron whose app becomes ready; utils/voikko.js is replaced by a
// fake that finds nothing, so no program is run; dotenv is replaced: no .env file is read.

const fs = require('fs');
const os = require('os');
const path = require('path');

const mockState = {
  listeners: {},
  handlers: {},
  menus: [],
  windows: [],
  userData: null
};

jest.mock('dotenv', () => ({ config: () => ({}) }));

jest.mock('../../utils/voikko', () => ({
  createVoikko: () => {
    const none = { available: false, reason: 'not-found', binDir: null, version: null, hasMorphology: false, hasGrammar: false, gcArgs: null, checkedAt: 0 };
    return {
      detect: () => Promise.resolve(none),
      status: () => none,
      analyze: () => Promise.resolve([]),
      grammar: () => Promise.resolve([])
    };
  }
}));

jest.mock('electron', () => {
  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.events = {};
      this.contentEvents = {};
      this.sent = [];
      this.webContents = {
        on: (event, fn) => { (this.contentEvents[event] = this.contentEvents[event] || []).push(fn); },
        send: (...args) => this.sent.push(args),
        setWindowOpenHandler: () => {},
        replaceMisspelling: () => {},
        session: { setSpellCheckerEnabled: () => {}, addWordToSpellCheckerDictionary: () => {} }
      };
      mockState.windows.push(this);
    }
    static getAllWindows() { return mockState.windows; }
    on(event, fn) { (this.events[event] = this.events[event] || []).push(fn); }
    loadFile() { return Promise.resolve(); }
    isDestroyed() { return false; }
    close() {}
    setBackgroundColor() {}
    isFullScreen() { return false; }
  }
  return {
    app: { getPath: () => mockState.userData, on: () => {}, whenReady: () => Promise.resolve(), quit: () => {}, name: 'FAUST' },
    BrowserWindow: FakeWindow,
    ipcMain: { handle: (channel, fn) => { mockState.handlers[channel] = fn; }, on: (channel, fn) => { mockState.listeners[channel] = fn; } },
    clipboard: { readText: () => '' },
    dialog: {
      showSaveDialog: async () => ({}),
      showOpenDialog: async () => ({}),
      showMessageBoxSync: (_win, options) => options.cancelId,
      showMessageBox: async () => ({ response: 2 })
    },
    Menu: {
      buildFromTemplate: (template) => { mockState.menus.push(template); return { popup: () => {} }; },
      setApplicationMenu: () => {}
    },
    safeStorage: { isEncryptionAvailable: () => false },
    shell: { openExternal: async () => {} },
    nativeTheme: {}
  };
});

const ENV_NAMES = ['CHERRY_API_KEY', 'ANTHROPIC_API_KEY', 'FAUST_AI_PROVIDER', 'CHERRY_MODEL', 'CHERRY_GATEWAY_URL', 'FAUST_ANTHROPIC_MODEL'];
const savedEnv = {};

const win = () => mockState.windows[0];
const appMenu = () => {
  for (let i = mockState.menus.length - 1; i >= 0; i--) {
    if (mockState.menus[i].some(item => item && item.label === 'Työkalut')) return mockState.menus[i];
  }
  return null;
};
const menuOf = (label) => appMenu().find(item => item.label === label).submenu;
const labelsOf = (items) => items.map(item => (item.type === 'separator' ? '—' : item.label));
const find = (items, label) => items.find(item => item.label === label);
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

beforeAll(async () => {
  for (const name of ENV_NAMES) { savedEnv[name] = process.env[name]; delete process.env[name]; }
  mockState.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'faust-i08-'));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  require('../../electron.js');
  for (let i = 0; i < 100 && !win(); i++) await new Promise(resolve => setTimeout(resolve, 10));
  await settle();
});

afterAll(() => {
  for (const name of ENV_NAMES) { if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name]; }
  fs.rmSync(mockState.userData, { recursive: true, force: true });
  jest.restoreAllMocks();
});

beforeEach(() => {
  win().sent = [];
});

describe('Näytä ▸ Tarkistus (stage I-08)', () => {
  test('Tarkistus stands directly after Tietopaneeli with ⌘3 and sends show-review', () => {
    const view = menuOf('Näytä');
    const labels = labelsOf(view);
    const at = labels.indexOf('Tietopaneeli');
    expect(labels.slice(at, at + 3)).toEqual(['Tietopaneeli', 'Tarkistus', 'Liminal Engine (tekoälyavustaja)']);
    const item = find(view, 'Tarkistus');
    expect(item.accelerator).toBe('CmdOrCtrl+3');
    item.click();
    expect(win().sent).toEqual([['menu-action', 'show-review', undefined]]);
  });

  test('no other item of the menu carries ⌘3', () => {
    const accelerators = [];
    const walk = (items) => {
      for (const item of items || []) {
        if (!item) continue;
        if (item.accelerator) accelerators.push([item.label, item.accelerator]);
        walk(item.submenu);
      }
    };
    walk(appMenu());
    expect(accelerators.filter(([, key]) => key === 'CmdOrCtrl+3')).toEqual([['Tarkistus', 'CmdOrCtrl+3']]);
  });

  test('with Tekoäly pois Tarkistus stays (its local checks need no model) and the AI items of Näytä go', async () => {
    expect(await mockState.handlers['prefs:set'](null, { aiOff: true })).toMatchObject({ success: true });   // rebuilds the menu
    try {
      const labels = labelsOf(menuOf('Näytä'));
      expect(labels).toContain('Tarkistus');
      expect(labels).not.toContain('Liminal Engine (tekoälyavustaja)');
      expect(find(menuOf('Näytä'), 'Tarkistus').accelerator).toBe('CmdOrCtrl+3');
    } finally {
      await mockState.handlers['prefs:set'](null, { aiOff: false });
    }
  });
});

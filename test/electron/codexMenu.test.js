/** @jest-environment node */
// Stage I-07 in the main process: Työkalut ▸ Tarinakansio (⇧⌘J) and the two checkboxes of Näytä,
// Korosta vältettävät sanat and Alleviivaa Tarinakansion maininnat, with their ui-prefs keys.
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

const AVOID = 'Korosta vältettävät sanat';
const MENTIONS = 'Alleviivaa Tarinakansion maininnat';

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
const prefsFile = () => JSON.parse(fs.readFileSync(path.join(mockState.userData, 'ui-prefs.json'), 'utf8'));
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

beforeAll(async () => {
  for (const name of ENV_NAMES) { savedEnv[name] = process.env[name]; delete process.env[name]; }
  mockState.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'faust-i07-'));
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

describe('Työkalut ▸ Tarinakansio (stage I-07)', () => {
  test('Tarinakansio stands directly after Tutkimuskansio with ⇧⌘J and sends show-codex', () => {
    const tools = menuOf('Työkalut');
    const labels = labelsOf(tools);
    const at = labels.indexOf('Tarinakansio');
    expect(labels.slice(at - 1, at + 2)).toEqual(['Tutkimuskansio', 'Tarinakansio', '—']);
    const item = find(tools, 'Tarinakansio');
    expect(item.accelerator).toBe('CmdOrCtrl+Shift+J');
    item.click();
    expect(win().sent).toEqual([['menu-action', 'show-codex', undefined]]);
  });

  test('no other item of the menu carries ⇧⌘J, and Tarinakansio is not in Näytä', () => {
    const accelerators = [];
    const walk = (items) => {
      for (const item of items || []) {
        if (!item) continue;
        if (item.accelerator) accelerators.push([item.label, item.accelerator]);
        walk(item.submenu);
      }
    };
    walk(appMenu());
    expect(accelerators.filter(([, key]) => key === 'CmdOrCtrl+Shift+J')).toEqual([['Tarinakansio', 'CmdOrCtrl+Shift+J']]);
    expect(labelsOf(menuOf('Näytä'))).not.toContain('Tarinakansio');
  });
});

describe('Näytä: the two marks of the manuscript (stage I-07)', () => {
  test('the two checkboxes form a group of their own directly after Kirjoituskonetila, without accelerators', () => {
    const view = menuOf('Näytä');
    const labels = labelsOf(view);
    const at = labels.indexOf('Kirjoituskonetila');
    expect(labels.slice(at, at + 5)).toEqual(['Kirjoituskonetila', '—', AVOID, MENTIONS, '—']);
    for (const label of [AVOID, MENTIONS]) {
      expect(find(view, label).type).toBe('checkbox');
      expect(find(view, label).accelerator).toBeUndefined();
    }
  });

  test('both are on by default, and prefs:get gives the two keys as true', async () => {
    expect(find(menuOf('Näytä'), AVOID).checked).toBe(true);
    expect(find(menuOf('Näytä'), MENTIONS).checked).toBe(true);
    const answer = await mockState.handlers['prefs:get']();
    expect(answer.prefs).toMatchObject({ 'context.highlightAvoidWords': true, 'context.underlineMentions': true });
  });

  test('a click saves its key in ui-prefs.json and sends prefs:changed to the renderer; a second click switches it back', async () => {
    await find(menuOf('Näytä'), AVOID).click({ checked: false });
    expect(prefsFile()['context.highlightAvoidWords']).toBe(false);
    const changed = win().sent.filter(([channel]) => channel === 'prefs:changed');
    expect(changed.length).toBeGreaterThanOrEqual(1);
    expect(changed[changed.length - 1][1]).toMatchObject({ 'context.highlightAvoidWords': false, 'context.underlineMentions': true });

    await find(menuOf('Näytä'), MENTIONS).click({ checked: false });
    expect(prefsFile()).toMatchObject({ 'context.highlightAvoidWords': false, 'context.underlineMentions': false });

    await find(menuOf('Näytä'), AVOID).click({ checked: true });
    await find(menuOf('Näytä'), MENTIONS).click({ checked: true });
    expect(prefsFile()).toMatchObject({ 'context.highlightAvoidWords': true, 'context.underlineMentions': true });
    // Neither switch is a menu action of the renderer
    expect(win().sent.filter(([channel]) => channel === 'menu-action')).toEqual([]);
  });

  test('a rebuilt menu shows what the file holds', async () => {
    await find(menuOf('Näytä'), MENTIONS).click({ checked: false });
    expect(await mockState.handlers['prefs:set'](null, { aiOff: true })).toMatchObject({ success: true });    // rebuilds the menu
    try {
      expect(find(menuOf('Näytä'), MENTIONS).checked).toBe(false);
      expect(find(menuOf('Näytä'), AVOID).checked).toBe(true);
    } finally {
      await mockState.handlers['prefs:set'](null, { aiOff: false });
      await find(menuOf('Näytä'), MENTIONS).click({ checked: true });
    }
  });

  test('with Tekoäly pois Tarinakansio and both checkboxes stay (none of them calls a model)', async () => {
    expect(await mockState.handlers['prefs:set'](null, { aiOff: true })).toMatchObject({ success: true });
    try {
      expect(labelsOf(menuOf('Työkalut'))).toContain('Tarinakansio');
      expect(labelsOf(menuOf('Näytä'))).toEqual(expect.arrayContaining([AVOID, MENTIONS]));
    } finally {
      await mockState.handlers['prefs:set'](null, { aiOff: false });
    }
  });
});

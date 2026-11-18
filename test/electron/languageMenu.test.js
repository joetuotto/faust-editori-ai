/** @jest-environment node */
// Stage I-06 in the main process: the language tools of the menu (Työkalut ▸ Tarkista typografia,
// Voikko-tarkistus…, Voikon asennusohje; Työkalut ▸ Tekoäly ▸ Kielenhuolto…; Lisää ▸ Erikoismerkki ▸
// Heittomerkki ’) and the three Voikko channels. electron.js is loaded with a fake Electron whose app
// becomes ready, and utils/voikko.js is replaced by a fake whose detection the test decides, so the
// result does not depend on whether Voikko is installed here. dotenv is replaced: no .env file is read.

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

// The fake Voikko: status null until the first detect() resolves; the test sets what is found
const mockVoikko = {
  found: { available: false, reason: 'not-found', binDir: null, version: null, hasMorphology: false, hasGrammar: false, gcArgs: null, checkedAt: 0 },
  cached: null,
  detectCalls: [],
  analyze: jest.fn(),
  grammar: jest.fn()
};

jest.mock('dotenv', () => ({ config: () => ({}) }));

jest.mock('../../utils/voikko', () => ({
  createVoikko: () => ({
    detect: (options) => {
      mockVoikko.detectCalls.push(options || {});
      mockVoikko.cached = { ...mockVoikko.found };
      return Promise.resolve(mockVoikko.cached);
    },
    status: () => mockVoikko.cached,
    analyze: (...args) => mockVoikko.analyze(...args),
    grammar: (...args) => mockVoikko.grammar(...args)
  })
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
const toolsMenu = () => menuOf('Työkalut');
const aiMenu = () => toolsMenu().find(item => item.label === 'Tekoäly').submenu;
const find = (items, label) => items.find(item => item.label === label);
const setAiOff = (on) => mockState.handlers['prefs:set'](null, { aiOff: on });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

beforeAll(async () => {
  for (const name of ENV_NAMES) { savedEnv[name] = process.env[name]; delete process.env[name]; }
  mockState.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'faust-i06-'));
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

describe('Työkalut: the language tools (stage I-06)', () => {
  test('detection runs once after the window exists and the menu is built again with what it found', () => {
    expect(mockVoikko.detectCalls.length).toBeGreaterThanOrEqual(1);
    expect(mockVoikko.detectCalls[0]).toEqual({});
    // At least two application menus: the window's own, then the one after detection
    expect(mockState.menus.filter(template => template.some(item => item && item.label === 'Työkalut')).length).toBeGreaterThanOrEqual(2);
  });

  test('Tarkista typografia, Voikko-tarkistus… and Voikon asennusohje stand directly after Oikoluku, before Hahmot', () => {
    const labels = labelsOf(toolsMenu());
    const at = labels.indexOf('Oikoluku');
    expect(labels.slice(at, at + 6)).toEqual(['Oikoluku', 'Tarkista typografia', 'Voikko-tarkistus…', 'Voikon asennusohje', '—', 'Hahmot']);
    // No accelerator on any of them
    for (const label of ['Tarkista typografia', 'Voikko-tarkistus…', 'Voikon asennusohje']) expect(find(toolsMenu(), label).accelerator).toBeUndefined();
  });

  test('without Voikko the check is greyed out with the install hint, and the guide sends voikko-help', () => {
    const check = find(toolsMenu(), 'Voikko-tarkistus…');
    expect(check.enabled).toBe(false);
    expect(check.toolTip).toBe('Voikkoa ei löytynyt. Asenna: brew install libvoikko');
    find(toolsMenu(), 'Voikon asennusohje').click();
    find(toolsMenu(), 'Tarkista typografia').click();
    expect(win().sent).toEqual([['menu-action', 'voikko-help', undefined], ['menu-action', 'check-typography', undefined]]);
  });

  test('Kielenhuolto… stands after Muokkaa valintaa puhumalla and before Pysäytä tekoäly, and sends proofread-chapter', () => {
    const labels = labelsOf(aiMenu());
    const at = labels.indexOf('Kielenhuolto…');
    expect(labels.slice(at - 1, at + 3)).toEqual(['Muokkaa valintaa puhumalla', 'Kielenhuolto…', '—', 'Pysäytä tekoäly']);
    expect(find(aiMenu(), 'Kielenhuolto…').accelerator).toBeUndefined();
    find(aiMenu(), 'Kielenhuolto…').click();
    expect(win().sent).toEqual([['menu-action', 'proofread-chapter', undefined]]);
  });

  test('with Tekoäly pois Kielenhuolto… is gone and the local tools stay', async () => {
    expect(await setAiOff(true)).toMatchObject({ success: true });
    try {
      expect(labelsOf(aiMenu())).not.toContain('Kielenhuolto…');
      expect(labelsOf(toolsMenu())).toEqual(expect.arrayContaining(['Tarkista typografia', 'Voikko-tarkistus…', 'Voikon asennusohje']));
    } finally {
      await setAiOff(false);
    }
    expect(labelsOf(aiMenu())).toContain('Kielenhuolto…');
  });

  test('Lisää ▸ Erikoismerkki has Heittomerkki ’ after Lainausmerkki ”, inserting the mark', () => {
    const special = find(menuOf('Lisää'), 'Erikoismerkki').submenu;
    const labels = labelsOf(special);
    const at = labels.indexOf('Heittomerkki ’');
    expect(labels.slice(at - 1, at + 2)).toEqual(['Lainausmerkki ”', 'Heittomerkki ’', 'Kulmalainausmerkki »']);
    special[at].click();
    expect(win().sent).toEqual([['menu-action', 'insert-text', '’']]);
  });
});

describe('the Voikko channels (stage I-06)', () => {
  test('voikko:status answers the cached status; recheck looks again and rebuilds the menu, so the item is enabled without a restart', async () => {
    const plain = await mockState.handlers['voikko:status'](null, undefined);
    expect(plain).toMatchObject({ available: false, reason: 'not-found' });

    mockVoikko.found = { available: true, reason: null, binDir: '/opt/homebrew/bin', version: '4.3.2', hasMorphology: true, hasGrammar: true, gcArgs: [], checkedAt: 1 };
    const menusBefore = mockState.menus.length;
    try {
      const found = await mockState.handlers['voikko:status'](null, { recheck: true });
      expect(found).toMatchObject({ available: true, version: '4.3.2' });
      expect(mockVoikko.detectCalls[mockVoikko.detectCalls.length - 1]).toEqual({ force: true });
      expect(mockState.menus.length).toBeGreaterThan(menusBefore);
      const check = find(toolsMenu(), 'Voikko-tarkistus…');
      expect(check.enabled).toBe(true);
      expect(check.toolTip).toBeUndefined();
      expect(labelsOf(toolsMenu())).not.toContain('Voikon asennusohje');
      check.click();
      expect(win().sent).toEqual([['menu-action', 'voikko-check-chapter', undefined]]);
    } finally {
      mockVoikko.found = { available: false, reason: 'not-found', binDir: null, version: null, hasMorphology: false, hasGrammar: false, gcArgs: null, checkedAt: 2 };
      await mockState.handlers['voikko:status'](null, { recheck: true });
    }
    expect(find(toolsMenu(), 'Voikko-tarkistus…').enabled).toBe(false);
  });

  test('voikko:analyze and voikko:grammar answer success with the results or the error, and take only arrays', async () => {
    mockVoikko.analyze.mockResolvedValueOnce([{ word: 'kirja', known: true, analyses: [], suggestions: [] }]);
    expect(await mockState.handlers['voikko:analyze'](null, { words: ['kirja'], suggest: 1 }))
      .toEqual({ success: true, results: [{ word: 'kirja', known: true, analyses: [], suggestions: [] }] });
    expect(mockVoikko.analyze).toHaveBeenLastCalledWith(['kirja'], { suggest: true });

    mockVoikko.analyze.mockResolvedValueOnce([]);
    await mockState.handlers['voikko:analyze'](null, { words: 'kirja' });
    expect(mockVoikko.analyze).toHaveBeenLastCalledWith([], { suggest: false });

    mockVoikko.analyze.mockRejectedValueOnce(new Error('Voikko ei ole käytettävissä'));
    expect(await mockState.handlers['voikko:analyze'](null, {})).toEqual({ success: false, error: 'Voikko ei ole käytettävissä' });

    mockVoikko.grammar.mockResolvedValueOnce([[]]);
    expect(await mockState.handlers['voikko:grammar'](null, { paragraphs: ['Hän on on.'] })).toEqual({ success: true, results: [[]] });
    expect(mockVoikko.grammar).toHaveBeenLastCalledWith(['Hän on on.']);
    mockVoikko.grammar.mockRejectedValueOnce(new Error('Voikko-ohjelma päättyi virheeseen'));
    expect(await mockState.handlers['voikko:grammar'](null, { paragraphs: null })).toEqual({ success: false, error: 'Voikko-ohjelma päättyi virheeseen' });
    expect(mockVoikko.grammar).toHaveBeenLastCalledWith([]);
  });
});

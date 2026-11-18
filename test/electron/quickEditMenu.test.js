/** @jest-environment node */
// Stage I-05 in the main process: Muokkaa ▸ Pikamuokkaus… (Cmd+K, an AI item) and the right-click
// submenu Tekoäly ▸ for a selection in the manuscript (report 4.15, reconcile R-8). electron.js is
// loaded with a fake Electron whose app becomes ready, so the window, its context-menu handler and
// the menu exist; the renderer's report arrives on the channel context:manuscript. dotenv is
// replaced, so no .env file is read.

const fs = require('fs');
const os = require('os');
const path = require('path');

const mockState = {
  listeners: {},      // ipcMain.on channels
  handlers: {},       // ipcMain.handle channels
  menus: [],          // every template given to Menu.buildFromTemplate, in order
  popups: [],         // the templates that were shown as a context menu
  windows: [],
  userData: null
};

jest.mock('dotenv', () => ({ config: () => ({}) }));

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
    app: {
      getPath: () => mockState.userData,
      on: () => {},
      whenReady: () => Promise.resolve(),
      quit: () => {},
      name: 'FAUST'
    },
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
      buildFromTemplate: (template) => {
        mockState.menus.push(template);
        return { popup: () => { mockState.popups.push(template); } };
      },
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
  // The application menu is the last template with a Muokkaa menu (a context menu has none)
  for (let i = mockState.menus.length - 1; i >= 0; i--) {
    const template = mockState.menus[i];
    if (template.some(item => item && item.label === 'Muokkaa')) return template;
  }
  return null;
};
const editMenu = () => appMenu().find(item => item.label === 'Muokkaa').submenu;
const viewMenu = () => appMenu().find(item => item.label === 'Näytä').submenu;
const quickEditItem = () => editMenu().find(item => item.label === 'Pikamuokkaus…');
const setAiOff = (on) => mockState.handlers['prefs:set'](null, { aiOff: on });

const ACTIONS = [
  { id: 'proofread', label: 'Kielenhuolto – vain virheet' },
  { id: 'tighten', label: 'Tiivistä' },
  { id: 'clarify', label: 'Selkeytä' },
  { id: 'show', label: 'Näytä, älä kerro' }
];
// The renderer's report of a right click (the inline prompt's contextmenu handler, quickEdit.js)
const report = (info) => mockState.listeners['context:manuscript'](null, info);
// Electron's own context-menu event for a click at (x, y)
function rightClick(params) {
  mockState.popups = [];
  const full = {
    x: 100, y: 200, isEditable: true, selectionText: 'Kaupunki oli pienempi',
    misspelledWord: '', dictionarySuggestions: [],
    editFlags: { canCut: true, canCopy: true, canPaste: true },
    ...params
  };
  for (const fn of win().contentEvents['context-menu']) fn({}, full);
  return mockState.popups[0] || null;
}
const aiSubmenu = (template) => (template || []).find(item => item && item.label === 'Tekoäly') || null;

beforeAll(async () => {
  for (const name of ENV_NAMES) { savedEnv[name] = process.env[name]; delete process.env[name]; }
  mockState.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'faust-i05-'));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  require('../../electron.js');
  for (let i = 0; i < 100 && !win(); i++) await new Promise(resolve => setTimeout(resolve, 10));
});

afterAll(() => {
  for (const name of ENV_NAMES) { if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name]; }
  fs.rmSync(mockState.userData, { recursive: true, force: true });
  jest.restoreAllMocks();
});

beforeEach(() => {
  win().sent = [];
});

describe('Muokkaa ▸ Pikamuokkaus… (stage I-05)', () => {
  test('the item stands after the separator that follows Etsi ja korvaa… and before Ehdotukset, on CmdOrCtrl+K', () => {
    const labels = editMenu().map(item => item.type === 'separator' ? '—' : item.label);
    const at = labels.indexOf('Pikamuokkaus…');
    expect(labels.slice(at - 2, at + 2)).toEqual(['Etsi ja korvaa…', '—', 'Pikamuokkaus…', 'Ehdotukset']);
    expect(quickEditItem().accelerator).toBe('CmdOrCtrl+K');
  });

  test('choosing it sends the menu action quick-edit', () => {
    quickEditItem().click();
    expect(win().sent).toEqual([['menu-action', 'quick-edit', undefined]]);
  });

  test('its tooltip names the Liminal Engine panel with the key of the platform', () => {
    const key = process.platform === 'darwin' ? '⇧⌘K' : 'Ctrl+Shift+K';
    expect(quickEditItem().toolTip).toBe(`Kirjoita ohje valitun tekstin kohdalle. Muutos tulee ehdotuksena tekstiin. Keskustelu tekstistä: Liminal Engine (${key}).`);
  });

  test('the Liminal Engine panel keeps Shift+Cmd+K, and no other item of the menu takes Cmd+K', () => {
    const liminal = viewMenu().find(item => item.label === 'Liminal Engine (tekoälyavustaja)');
    expect(liminal.accelerator).toBe('CmdOrCtrl+Shift+K');
    const all = [];
    const walk = (items) => items.forEach(item => { if (item.accelerator) all.push([item.label, item.accelerator]); if (Array.isArray(item.submenu)) walk(item.submenu); });
    walk(appMenu());
    expect(all.filter(([, accelerator]) => accelerator === 'CmdOrCtrl+K')).toEqual([['Pikamuokkaus…', 'CmdOrCtrl+K']]);
  });

  test('with Tekoäly pois on it is left out of the menu (its key goes with it) and comes back when switched off', async () => {
    expect(await setAiOff(true)).toMatchObject({ success: true });
    try {
      expect(quickEditItem()).toBeUndefined();
      expect(viewMenu().map(item => item.label)).not.toContain('Liminal Engine (tekoälyavustaja)');
      // The separator still divides Etsi from Ehdotukset
      const labels = editMenu().map(item => item.type === 'separator' ? '—' : item.label);
      expect(labels.slice(-3)).toEqual(['Etsi ja korvaa…', '—', 'Ehdotukset']);
    } finally {
      await setAiOff(false);
    }
    expect(quickEditItem().accelerator).toBe('CmdOrCtrl+K');
  });
});

describe('Tekoäly ▸ in the context menu of the manuscript (stage I-05, R-8)', () => {
  test('a reported right click with a selection gets the submenu after the edit commands, with the actions and Oma ohje…', () => {
    report({ x: 100, y: 200, hasSelection: true, actions: ACTIONS });
    const template = rightClick({ x: 100, y: 200 });
    const labels = template.map(item => item.type === 'separator' ? '—' : item.label);
    expect(labels).toEqual(['Leikkaa', 'Kopioi', 'Liitä', '—', 'Valitse kaikki', '—', 'Tekoäly']);
    const submenu = aiSubmenu(template).submenu;
    expect(submenu.map(item => item.type === 'separator' ? '—' : item.label))
      .toEqual(['Kielenhuolto – vain virheet', 'Tiivistä', 'Selkeytä', 'Näytä, älä kerro', '—', 'Oma ohje…']);
  });

  test('an action sends ai-action with its id, and Oma ohje… sends custom', () => {
    report({ x: 10, y: 20, hasSelection: true, actions: ACTIONS });
    const submenu = aiSubmenu(rightClick({ x: 10, y: 20 })).submenu;
    submenu.find(item => item.label === 'Tiivistä').click();
    submenu.find(item => item.label === 'Oma ohje…').click();
    expect(win().sent).toEqual([['menu-action', 'ai-action', 'tighten'], ['menu-action', 'ai-action', 'custom']]);
  });

  test('the spelling items stay first and the submenu follows them and the edit commands', () => {
    report({ x: 5, y: 5, hasSelection: true, actions: ACTIONS });
    const template = rightClick({ x: 5, y: 5, misspelledWord: 'kaupnki', dictionarySuggestions: ['kaupunki'], selectionText: 'kaupnki' });
    const labels = template.map(item => item.type === 'separator' ? '—' : item.label);
    expect(labels).toEqual(['kaupunki', '—', 'Lisää sanastoon', '—', 'Leikkaa', 'Kopioi', 'Liitä', '—', 'Valitse kaikki', '—', 'Tekoäly']);
  });

  test('no submenu without a report: chapter notes, the search field and the chat input never report', () => {
    expect(aiSubmenu(rightClick({ x: 300, y: 400 }))).toBeNull();
  });

  test('a report is used by one right click only, and only at its own point', () => {
    report({ x: 100, y: 200, hasSelection: true, actions: ACTIONS });
    expect(aiSubmenu(rightClick({ x: 140, y: 200 }))).toBeNull();       // another point
    expect(aiSubmenu(rightClick({ x: 100, y: 200 }))).toBeNull();       // the report was taken by the click before
    report({ x: 100, y: 200, hasSelection: true, actions: ACTIONS });
    expect(aiSubmenu(rightClick({ x: 102, y: 197 }))).not.toBeNull();   // a few pixels off is the same click
    expect(aiSubmenu(rightClick({ x: 102, y: 197 }))).toBeNull();       // and used once
  });

  test('no submenu for a click without a selection, on a field that is not editable, or for an empty report', () => {
    report({ x: 1, y: 1, hasSelection: false, actions: ACTIONS });
    expect(aiSubmenu(rightClick({ x: 1, y: 1, selectionText: '' }))).toBeNull();
    report({ x: 1, y: 1, hasSelection: true, actions: ACTIONS });
    expect(aiSubmenu(rightClick({ x: 1, y: 1, selectionText: '   ' }))).toBeNull();
    report({ x: 1, y: 1, hasSelection: true, actions: ACTIONS });
    expect(aiSubmenu(rightClick({ x: 1, y: 1, isEditable: false }))).toBeNull();
    // A chapter marked "Ei tekoälylle" reports no actions: main shows nothing for an empty list
    report({ x: 1, y: 1, hasSelection: true, actions: [] });
    expect(aiSubmenu(rightClick({ x: 1, y: 1 }))).toBeNull();
  });

  test('a right click on a word that was not selected gets the submenu for that word (I-05 review)', () => {
    // The renderer reported before macOS selected the word under the pointer
    report({ x: 30, y: 40, hasSelection: false, actions: ACTIONS });
    const template = rightClick({ x: 30, y: 40, selectionText: 'juna' });
    expect(aiSubmenu(template)).not.toBeNull();
    aiSubmenu(template).submenu.find(item => item.label === 'Tiivistä').click();
    expect(win().sent).toEqual([['menu-action', 'ai-action', 'tighten']]);
    // Empty space selects nothing: no submenu
    report({ x: 30, y: 40, hasSelection: false, actions: ACTIONS });
    expect(aiSubmenu(rightClick({ x: 30, y: 40, selectionText: '' }))).toBeNull();
  });

  test('a report older than two seconds is not used', () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      report({ x: 50, y: 60, hasSelection: true, actions: ACTIONS });
      clock.mockReturnValue(now + 1500);
      expect(aiSubmenu(rightClick({ x: 50, y: 60 }))).not.toBeNull();
      report({ x: 50, y: 60, hasSelection: true, actions: ACTIONS });
      clock.mockReturnValue(now + 1500 + 2500);
      expect(aiSubmenu(rightClick({ x: 50, y: 60 }))).toBeNull();
    } finally {
      clock.mockRestore();
    }
  });

  test('with Tekoäly pois on there is no submenu, also for a report that came before the switch', async () => {
    report({ x: 7, y: 8, hasSelection: true, actions: ACTIONS });
    await setAiOff(true);
    try {
      const template = rightClick({ x: 7, y: 8 });
      expect(aiSubmenu(template)).toBeNull();
      expect(template.map(item => item.label).filter(Boolean)).toEqual(['Leikkaa', 'Kopioi', 'Liitä', 'Valitse kaikki']);
    } finally {
      await setAiOff(false);
    }
    // Switched back on, the next reported right click has it again
    report({ x: 7, y: 8, hasSelection: true, actions: ACTIONS });
    expect(aiSubmenu(rightClick({ x: 7, y: 8 }))).not.toBeNull();
  });
});

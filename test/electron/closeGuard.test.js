/** @jest-environment node */
// Stage I-03 in the main process: the close guard for pending suggestions (reconcile R-24) and the
// Muokkaa ▸ Ehdotukset submenu. electron.js is loaded with a fake Electron whose app becomes ready,
// so the window and its close handler exist; the native questions are answered from a queue.
// dotenv is replaced, so no .env file is read.

const fs = require('fs');
const os = require('os');
const path = require('path');

const mockState = {
  listeners: {},
  menus: [],
  windows: [],
  answers: [],        // what showMessageBoxSync answers, in order
  asked: [],          // the messages it was asked
  userData: null
};

jest.mock('dotenv', () => ({ config: () => ({}) }));

jest.mock('electron', () => {
  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.events = {};
      this.sent = [];
      this.closed = 0;
      this.webContents = {
        on: () => {},
        send: (...args) => this.sent.push(args),
        setWindowOpenHandler: () => {},
        session: { setSpellCheckerEnabled: () => {} }
      };
      mockState.windows.push(this);
    }
    static getAllWindows() { return mockState.windows; }
    on(event, fn) { (this.events[event] = this.events[event] || []).push(fn); }
    loadFile() { return Promise.resolve(); }
    isDestroyed() { return false; }
    close() { this.closed += 1; }
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
    ipcMain: { handle: () => {}, on: (channel, fn) => { mockState.listeners[channel] = fn; } },
    dialog: {
      showSaveDialog: async () => ({}),
      showOpenDialog: async () => ({}),
      showMessageBoxSync: (_win, options) => {
        mockState.asked.push(options.message);
        return mockState.answers.length ? mockState.answers.shift() : options.cancelId;
      },
      showMessageBox: async () => ({ response: 2 })
    },
    Menu: {
      buildFromTemplate: (template) => { mockState.menus.push(template); return {}; },
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
// One close of the window: the guard's answer is whether it let the window go
function close() {
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  for (const fn of win().events.close) fn(event);
  return event;
}
const setPending = (count) => mockState.listeners['suggestions:set-pending'](null, count);
const setDirty = (dirty) => mockState.listeners['project:set-dirty'](null, dirty);
const SUGGESTIONS_3 = 'Käsikirjoituksessa on 3 käsittelemätöntä ehdotusta.';
const UNSAVED = 'Projektissa on tallentamattomia muutoksia.';

beforeAll(async () => {
  for (const name of ENV_NAMES) { savedEnv[name] = process.env[name]; delete process.env[name]; }
  mockState.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'faust-i03-'));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  require('../../electron.js');
  // whenReady resolves at once; settings are read from the empty folder, then the window is made
  for (let i = 0; i < 100 && !win(); i++) await new Promise(resolve => setTimeout(resolve, 10));
});

afterAll(() => {
  for (const name of ENV_NAMES) { if (savedEnv[name] === undefined) delete process.env[name]; else process.env[name] = savedEnv[name]; }
  fs.rmSync(mockState.userData, { recursive: true, force: true });
  jest.restoreAllMocks();
});

beforeEach(() => {
  mockState.answers = [];
  mockState.asked = [];
  setPending(0);
  setDirty(false);
  mockState.listeners['project:close-cancelled']();
  win().sent = [];
});

describe('the close guard (R-24)', () => {
  test('without pending suggestions and unsaved changes the window closes without a question', () => {
    expect(win()).toBeDefined();
    expect(close().prevented).toBe(false);
    expect(mockState.asked).toEqual([]);
  });

  test('pending suggestions are asked about first; Palaa ehdotuksiin keeps the window open', () => {
    setPending(3);
    mockState.answers = [0];
    expect(close().prevented).toBe(true);
    expect(mockState.asked).toEqual([SUGGESTIONS_3]);
  });

  test('one pending suggestion is named in the singular', () => {
    setPending(1);
    mockState.answers = [0];
    close();
    expect(mockState.asked).toEqual(['Käsikirjoituksessa on 1 käsittelemätön ehdotus.']);
  });

  test('Sulje ja hylkää ehdotukset on a saved project lets the window close', () => {
    setPending(3);
    mockState.answers = [1];
    expect(close().prevented).toBe(false);
    expect(mockState.asked).toEqual([SUGGESTIONS_3]);
  });

  test('with unsaved changes the unsaved question follows, and the close after the save asks nothing', () => {
    setPending(3);
    setDirty(true);
    mockState.answers = [1, 0];               // Sulje ja hylkää ehdotukset, then Tallenna
    expect(close().prevented).toBe(true);
    expect(mockState.asked).toEqual([SUGGESTIONS_3, UNSAVED]);
    expect(win().sent).toContainEqual(['menu-action', 'save-and-close']);

    // The renderer saved and confirmed: the second close goes through without a question
    mockState.listeners['project:close-confirmed']();
    expect(close().prevented).toBe(false);
    expect(mockState.asked).toEqual([SUGGESTIONS_3, UNSAVED]);
  });

  test('Peruuta at the unsaved question means the next close asks about the suggestions again', () => {
    setPending(3);
    setDirty(true);
    mockState.answers = [1, 2];               // Sulje ja hylkää ehdotukset, then Peruuta
    expect(close().prevented).toBe(true);
    mockState.answers = [0];
    expect(close().prevented).toBe(true);
    expect(mockState.asked).toEqual([SUGGESTIONS_3, UNSAVED, SUGGESTIONS_3]);
  });

  test('a cancelled save means the next close asks about the suggestions again', () => {
    setPending(3);
    setDirty(true);
    mockState.answers = [1, 0];
    close();
    mockState.listeners['project:close-cancelled']();
    mockState.answers = [0];
    close();
    expect(mockState.asked).toEqual([SUGGESTIONS_3, UNSAVED, SUGGESTIONS_3]);
  });
});

describe('Muokkaa ▸ Ehdotukset', () => {
  const editMenu = () => mockState.menus[mockState.menus.length - 1].find(item => item.label === 'Muokkaa').submenu;

  test('the submenu ends Muokkaa after a separator and carries the seven commands without accelerators', () => {
    const items = editMenu();
    const last = items[items.length - 1];
    expect(last.label).toBe('Ehdotukset');
    expect(items[items.length - 2].type).toBe('separator');
    const commands = last.submenu.filter(item => item.type !== 'separator');
    expect(commands.map(item => item.label)).toEqual([
      'Hyväksy ehdotus', 'Hylkää ehdotus', 'Seuraava ehdotus', 'Edellinen ehdotus',
      'Hyväksy kaikki ehdotukset', 'Hylkää kaikki ehdotukset', 'Palauta hylätyt ehdotukset'
    ]);
    expect(commands.every(item => item.accelerator === undefined)).toBe(true);
    expect(last.submenu.map(item => item.type === 'separator' ? '—' : 'x').join('')).toBe('xx—xx—xxx');
  });

  test('each command sends the menu action suggestion with its argument', () => {
    const commands = editMenu()[editMenu().length - 1].submenu.filter(item => item.type !== 'separator');
    for (const item of commands) item.click();
    expect(win().sent).toEqual(['accept', 'reject', 'next', 'previous', 'accept-all', 'reject-all', 'restore']
      .map(arg => ['menu-action', 'suggestion', arg]));
  });
});

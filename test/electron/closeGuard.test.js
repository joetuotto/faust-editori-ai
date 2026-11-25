/** @jest-environment node */
// Stage I-03 in the main process: the close guard for pending suggestions (reconcile R-24) and the
// Muokkaa ▸ Ehdotukset submenu; stage I-04: Muokkaa ▸ Liitä muokkauksina… (the clipboard read in main).
// electron.js is loaded with a fake Electron whose app becomes ready, so the window and its close
// handler exist; the native questions are answered from a queue. dotenv is replaced, so no .env file is read.

const fs = require('fs');
const os = require('os');
const path = require('path');

const mockState = {
  listeners: {},
  menus: [],
  windows: [],
  answers: [],        // what showMessageBoxSync answers, in order
  asked: [],          // the messages it was asked
  details: [],        // and their details
  buttons: [],        // and their buttons
  handlers: {},       // ipcMain.handle channels
  clipboard: '',      // what clipboard.readText returns
  clipboardReads: 0,
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
    ipcMain: { handle: (channel, fn) => { mockState.handlers[channel] = fn; }, on: (channel, fn) => { mockState.listeners[channel] = fn; } },
    clipboard: { readText: () => { mockState.clipboardReads += 1; return mockState.clipboard; } },
    dialog: {
      showSaveDialog: async () => ({}),
      showOpenDialog: async () => ({}),
      showMessageBoxSync: (_win, options) => {
        mockState.asked.push(options.message);
        mockState.details.push(options.detail);
        mockState.buttons.push(options.buttons);
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
  mockState.details = [];
  mockState.buttons = [];
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

  // Final pass (T-009): the renderer reports suggestions and pending drafts apart, and the question names
  // the draft (Tekoälyn luonnos) on its own, as the bar and the project-switch question do
  test('a pending draft is named apart from the suggestions, in the message and in the detail', () => {
    const ask = (counts) => {
      mockState.asked = [];
      mockState.details = [];
      setPending(counts);
      mockState.answers = [0];
      expect(close().prevented).toBe(true);
      return [mockState.asked[0], mockState.details[0]];
    };
    expect(ask({ suggestions: 9, blocks: 1 })).toEqual([
      'Käsikirjoituksessa on 9 käsittelemätöntä ehdotusta ja tekoälyn luonnos.',
      'Ehdotukset ja luonnos eivät säily sovelluksen sulkemisen yli. Käsikirjoituksen tekstiä ne eivät ole muuttaneet.'
    ]);
    expect(ask({ suggestions: 0, blocks: 1 })).toEqual([
      'Käsikirjoituksessa on käsittelemätön tekoälyn luonnos.',
      'Luonnos ei säily sovelluksen sulkemisen yli. Käsikirjoituksen tekstiä se ei ole muuttanut.'
    ]);
    expect(ask({ suggestions: 1, blocks: 2 })).toEqual([
      'Käsikirjoituksessa on 1 käsittelemätön ehdotus ja 2 tekoälyn luonnosta.',
      'Ehdotukset ja luonnokset eivät säily sovelluksen sulkemisen yli. Käsikirjoituksen tekstiä ne eivät ole muuttaneet.'
    ]);
    expect(ask({ suggestions: 0, blocks: 2 })).toEqual([
      'Käsikirjoituksessa on 2 käsittelemätöntä tekoälyn luonnosta.',
      'Luonnokset eivät säily sovelluksen sulkemisen yli. Käsikirjoituksen tekstiä ne eivät ole muuttaneet.'
    ]);
    expect(ask({ suggestions: 1200, blocks: 0 })).toEqual([
      'Käsikirjoituksessa on 1\u00a0200 käsittelemätöntä ehdotusta.',
      'Ehdotukset eivät säily sovelluksen sulkemisen yli. Käsikirjoituksen tekstiä ne eivät ole muuttaneet.'
    ]);
    // A bare number is the older form: suggestions
    expect(ask(3)[0]).toBe(SUGGESTIONS_3);
  });

  // Final-pass review: with no suggestion the buttons do not speak of suggestions either
  test('the buttons name the suggestions while there is one, and a draft alone by its own name', () => {
    const buttonsFor = (counts) => {
      mockState.buttons = [];
      setPending(counts);
      mockState.answers = [0];
      expect(close().prevented).toBe(true);
      return mockState.buttons[0];
    };
    expect(buttonsFor({ suggestions: 3, blocks: 0 })).toEqual(['Palaa ehdotuksiin', 'Sulje ja hylkää ehdotukset']);
    expect(buttonsFor({ suggestions: 9, blocks: 1 })).toEqual(['Palaa ehdotuksiin', 'Sulje ja hylkää ehdotukset']);
    expect(buttonsFor({ suggestions: 0, blocks: 1 })).toEqual(['Palaa luonnokseen', 'Sulje ja hylkää luonnos']);
    expect(buttonsFor({ suggestions: 0, blocks: 2 })).toEqual(['Palaa luonnoksiin', 'Sulje ja hylkää luonnokset']);
    expect(buttonsFor(1)).toEqual(['Palaa ehdotuksiin', 'Sulje ja hylkää ehdotukset']);
  });

  test('nothing pending of either kind asks nothing, and a draft alone is enough to ask', () => {
    setPending({ suggestions: 0, blocks: 0 });
    expect(close().prevented).toBe(false);
    expect(mockState.asked).toEqual([]);
    setPending({ suggestions: 0, blocks: 1 });
    mockState.answers = [1];
    expect(close().prevented).toBe(false);
    expect(mockState.asked).toEqual(['Käsikirjoituksessa on käsittelemätön tekoälyn luonnos.']);
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
    // Stage I-05 puts Pikamuokkaus… (an AI item) between the separator and the submenu (reconcile 12.2)
    const before = items.slice(0, -1).filter(item => item.label !== 'Pikamuokkaus…');
    expect(before[before.length - 1].type).toBe('separator');
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

describe('Muokkaa ▸ Liitä muokkauksina… (stage I-04)', () => {
  const editMenu = () => mockState.menus[mockState.menus.length - 1].find(item => item.label === 'Muokkaa').submenu;
  const pasteItem = () => editMenu().find(item => item.label === 'Liitä muokkauksina…');

  test('the item stands between Liitä and Valitse kaikki with the accelerator CmdOrCtrl+Alt+V', () => {
    const labels = editMenu().map(item => item.label || '—');
    const at = labels.indexOf('Liitä muokkauksina…');
    expect(labels.slice(at - 1, at + 2)).toEqual(['Liitä', 'Liitä muokkauksina…', 'Valitse kaikki']);
    expect(pasteItem().accelerator).toBe('CmdOrCtrl+Alt+V');
    expect(pasteItem().role).toBeUndefined();
  });

  test('the clipboard is read only when the item is chosen, and goes to the renderer as the argument', () => {
    mockState.clipboardReads = 0;
    mockState.clipboard = 'Muokattu kappale.\r\nToinen rivi.';
    expect(pasteItem()).toBeDefined();
    expect(mockState.clipboardReads).toBe(0);
    pasteItem().click();
    expect(mockState.clipboardReads).toBe(1);
    expect(win().sent).toEqual([['menu-action', 'paste-as-edits', 'Muokattu kappale.\r\nToinen rivi.']]);
  });

  test('it is not an AI item: with Tekoäly pois on it stays in Muokkaa and still sends the clipboard', async () => {
    const viewMenu = () => mockState.menus[mockState.menus.length - 1].find(item => item.label === 'Näytä').submenu.map(item => item.label);
    expect(viewMenu()).toContain('Liminal Engine (tekoälyavustaja)');
    expect(await mockState.handlers['prefs:set'](null, { aiOff: true })).toMatchObject({ success: true });
    try {
      // The menu was rebuilt without the AI items (the Liminal Engine item of Näytä is one of them)
      expect(viewMenu()).not.toContain('Liminal Engine (tekoälyavustaja)');
      expect(editMenu().map(item => item.label)).toContain('Liitä muokkauksina…');
      mockState.clipboard = 'Teksti.';
      pasteItem().click();
      expect(win().sent).toContainEqual(['menu-action', 'paste-as-edits', 'Teksti.']);
    } finally {
      await mockState.handlers['prefs:set'](null, { aiOff: false });
    }
  });
});

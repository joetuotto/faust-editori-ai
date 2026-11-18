const { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage, shell, nativeTheme, clipboard } = require('electron');
const { createRequestTable, classifyAIError, codedError, AI_CONSTANTS, AI_OFF_MESSAGE, CANCELLED_MESSAGE } = require('./utils/aiRequest');
const appSettings = require('./utils/appSettings');
const { buildGuardIndex, findProtected, collectStrings } = require('./utils/noAIGuard');
const manuscript = require('./utils/manuscript');
const importFolder = require('./utils/importFolder');
const aiContextMenu = require('./utils/aiContextMenu');
// Voikko's command-line tools, when installed ("brew install libvoikko"); detection never delays the window
const voikko = require('./utils/voikko').createVoikko();
const path = require('path');
const fs = require('fs').promises;

// Load environment variables
require('dotenv').config();

// Claude AI Client (exclusive AI provider for FAUST v2.0)
const Anthropic = require('@anthropic-ai/sdk');

// Global config (now encrypted)
let apiConfig = {};

// Config path (lazy initialization to avoid calling app.getPath() before ready)
let configPath = null;

function getConfigPath() {
  if (!configPath) {
    configPath = path.join(app.getPath('userData'), 'config.json');
  }
  return configPath;
}

// v1.4.3: Secure API key storage using Electron safeStorage
async function loadApiConfig() {
  try {
    const data = await fs.readFile(getConfigPath(), 'utf-8');
    const config = JSON.parse(data);

    // If encrypted data exists, decrypt it
    if (config.apiKeysEncrypted && safeStorage.isEncryptionAvailable()) {
      const encryptedBuffer = Buffer.from(config.apiKeysEncrypted, 'base64');
      const decrypted = safeStorage.decryptString(encryptedBuffer);
      apiConfig = JSON.parse(decrypted);
      console.log('[Security] API keys loaded from encrypted storage');
    } else if (config.apiKeys) {
      // Legacy plain text fallback
      apiConfig = config.apiKeys;
      console.warn('[Security] API keys loaded in plain text (consider re-saving)');
    } else {
      apiConfig = {};
    }
  } catch (error) {
    console.log('[Config] No saved API keys found');
    apiConfig = {};
  }
}

// Persist the config object (keys + AI provider settings), encrypted when possible
async function persistApiConfig(keys) {
  let config;

  if (safeStorage.isEncryptionAvailable()) {
    const keysJson = JSON.stringify(keys);
    const encrypted = safeStorage.encryptString(keysJson);
    const encryptedBase64 = encrypted.toString('base64');

    config = {
      apiKeysEncrypted: encryptedBase64,
      version: '1.4.3',
      encryptionMethod: 'electron-safeStorage'
    };
    console.log('[Security] API keys encrypted with safeStorage');
  } else {
    // Fallback to plain text if encryption unavailable
    config = { apiKeys: keys };
    console.warn('[Security] Encryption unavailable, storing in plain text');
  }

  await fs.writeFile(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
  await loadApiConfig(); // Reload
  return { encrypted: safeStorage.isEncryptionAvailable() };
}

// ============================================
// AI PROVIDER: Claude (Anthropic) or Cherry Studio API Gateway
// ============================================
// Cherry Studio exposes an Anthropic-compatible endpoint on its local API
// gateway (Cherry Studio: Settings → API Gateway). Pointing the Anthropic SDK
// at it gives FAUST every model configured in Cherry Studio without changing
// the call sites: the same messages.create / messages.stream calls are used.

const CHERRY_DEFAULT_GATEWAY_URL = 'http://127.0.0.1:23333';

function getAIProviderConfig() {
  const provider = String(process.env.FAUST_AI_PROVIDER || apiConfig.AI_PROVIDER || 'anthropic').toLowerCase();
  const gatewayUrl = String(process.env.CHERRY_GATEWAY_URL || apiConfig.CHERRY_GATEWAY_URL || CHERRY_DEFAULT_GATEWAY_URL)
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '');

  return {
    provider: provider === 'cherry' ? 'cherry' : 'anthropic',
    gatewayUrl,
    model: process.env.CHERRY_MODEL || apiConfig.CHERRY_MODEL || '',
    cherryKey: process.env.CHERRY_API_KEY || apiConfig.CHERRY_API_KEY || '',
    anthropicKey: process.env.ANTHROPIC_API_KEY || apiConfig.ANTHROPIC_API_KEY || '',
    // FAUST_ANTHROPIC_MODEL, not ANTHROPIC_MODEL: a value set in the shell for other tools is not picked up
    anthropicModel: String(process.env.FAUST_ANTHROPIC_MODEL || apiConfig.ANTHROPIC_MODEL || '').trim(),
    roles: appSettings.readRoles(apiConfig),
    modelSettings: appSettings.readModelSettings(apiConfig)
  };
}

// Settings as shown to the renderer: never includes key values
function publicAIProviderConfig() {
  const cfg = getAIProviderConfig();
  return {
    provider: cfg.provider,
    gatewayUrl: cfg.gatewayUrl,
    model: cfg.model,
    anthropicModel: cfg.anthropicModel,
    roles: cfg.roles,
    modelSettings: cfg.modelSettings,
    defaults: {
      window: AI_CONSTANTS.DEFAULT_WINDOW_TOKENS,
      headroom: AI_CONSTANTS.DEFAULT_HEADROOM_TOKENS,
      maxOutput: AI_CONSTANTS.MAX_OUTPUT_TOKENS
    },
    hasCherryKey: !!cfg.cherryKey,
    hasAnthropicKey: !!cfg.anthropicKey,
    providerFromEnv: !!process.env.FAUST_AI_PROVIDER,
    keyFromEnv: { cherry: !!process.env.CHERRY_API_KEY, anthropic: !!process.env.ANTHROPIC_API_KEY }
  };
}

// Text of a Messages API response. Gateway models may put a thinking block first,
// so content[0].text is not reliable.
function messageText(message) {
  if (!message || !Array.isArray(message.content)) return '';
  return message.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

// Anthropic-SDK-shaped client that talks to the Cherry Studio gateway.
// It swaps Claude model names for the selected gateway model, drops the
// Claude-only "thinking" parameter and keeps text blocks first.
function createCherryClient({ apiKey, baseURL, model }) {
  const inner = new Anthropic({ apiKey, baseURL });

  const prepare = (params = {}) => {
    // Gateway model ids look like "providerId:modelId"; anything else is a Claude name
    const requested = typeof params.model === 'string' && params.model.includes(':') ? params.model : model;
    const next = { ...params, model: requested };
    delete next.thinking;
    return next;
  };

  const textFirst = (message) => {
    if (message && Array.isArray(message.content)) {
      const text = message.content.filter(b => b.type === 'text');
      const rest = message.content.filter(b => b.type !== 'text');
      message.content = text.length > 0 ? [...text, ...rest] : [{ type: 'text', text: '' }, ...rest];
    }
    return message;
  };

  return {
    isCherryGateway: true,
    model,
    messages: {
      create: async (params, options) => {
        const prepared = prepare(params);
        const result = await inner.messages.create(prepared, options);
        return prepared.stream ? result : textFirst(result);
      },
      stream: (params, options) => inner.messages.stream(prepare(params), options)
    }
  };
}

// Anthropic-SDK-shaped client for Claude directly, for the old handlers in Anthropic mode. The
// model field of the settings decides, as the selected gateway model does in Cherry Studio mode;
// with the field empty the caller's model is used. Current Claude models answer a request that
// carries temperature with 400, and they think by default inside the same max_tokens.
function createDirectClient({ apiKey, model }) {
  const inner = new Anthropic({ apiKey });

  const prepare = (params = {}) => {
    const next = { ...params, model: model || params.model };
    if (!next.model) {
      throw codedError('no_model', 'Claude-mallia ei ole valittu. Valitse malli tietopaneelin Tekoäly-välilehdellä.');
    }
    delete next.temperature;
    delete next.top_p;
    delete next.top_k;
    // The old handlers send 2 000 or 4 096 (reconcile R-11)
    next.max_tokens = Math.max(Number(next.max_tokens) || 0, 16000);
    return next;
  };

  return {
    messages: {
      create: async (params, options) => inner.messages.create(prepare(params), options),
      stream: (params, options) => inner.messages.stream(prepare(params), options)
    }
  };
}

// Client for the selected provider. Throws a user-facing error if it is not configured.
function getClaudeClient() {
  const cfg = getAIProviderConfig();

  if (cfg.provider === 'cherry') {
    if (!cfg.cherryKey) {
      throw codedError('no_key', 'Cherry Studion API-avain puuttuu. Lisää se tietopaneelin Tekoäly-välilehdellä.');
    }
    if (!cfg.model) {
      throw codedError('no_model', 'Cherry Studion mallia ei ole valittu. Valitse malli tietopaneelin Tekoäly-välilehdellä.');
    }
    return createCherryClient({ apiKey: cfg.cherryKey, baseURL: cfg.gatewayUrl, model: cfg.model });
  }

  if (!cfg.anthropicKey) {
    throw codedError('no_key', 'Clauden API-avain puuttuu. Lisää se tietopaneelin Tekoäly-välilehdellä.');
  }
  return createDirectClient({ apiKey: cfg.anthropicKey, model: cfg.anthropicModel });
}

// The bare SDK client for ai:request, whose parameters buildParams (utils/aiRequest.js) has made final
function getRawAIClient(cfg) {
  if (cfg.provider === 'cherry') {
    if (!cfg.cherryKey) {
      throw codedError('no_key', 'Cherry Studion API-avain puuttuu. Lisää se tietopaneelin Tekoäly-välilehdellä.');
    }
    return new Anthropic({ apiKey: cfg.cherryKey, baseURL: cfg.gatewayUrl });
  }
  if (!cfg.anthropicKey) {
    throw codedError('no_key', 'Clauden API-avain puuttuu. Lisää se tietopaneelin Tekoäly-välilehdellä.');
  }
  return new Anthropic({ apiKey: cfg.anthropicKey });
}

// Turn SDK/network errors into messages that say what to do (one table: utils/aiRequest.js)
function describeAIError(error) {
  return classifyAIError(error, getAIProviderConfig()).message;
}

// --- "Ei tekoälylle": the wire guard ---
// The renderer sends the text and summaries of every chapter marked "Ei tekoälylle"
// (useNoAIGuard); every request, old or new, whose text overlaps them is refused here.
let protectedIndex = [];
ipcMain.on('ai:set-protected', (_event, chapters) => {
  const list = Array.isArray(chapters)
    ? chapters.filter(c => c && typeof c.title === 'string' && typeof c.text === 'string')
    : [];
  protectedIndex = buildGuardIndex(list);
});

function refuseProtected(payload) {
  const hit = findProtected(collectStrings(payload), protectedIndex);
  return hit
    ? `Kehotteessa on tekstiä luvusta ”${hit.title}”, joka on merkitty Ei tekoälylle (”${hit.snippet}…”). Mitään ei lähetetty.`
    : null;
}

// The two sentences the old handlers answer with when they did not send (contracts.md 8.1, 8.3):
// the request layer's own, from utils/aiRequest.js, so that main carries each literal once
const AI_OFF_SENTENCE = AI_OFF_MESSAGE;
const STOPPED_SENTENCE = CANCELLED_MESSAGE;

// --- UI prefs kept by the main process ---
// Panels and editor settings live in the renderer (localStorage). The theme lives there too;
// the renderer reports it ('theme-changed') and the copy kept here (uiPrefs.theme, 'NOX' or
// 'DEIS') is what the native layer and the window's first frame are painted from. Settings
// of the new features live here too and reach the renderer through prefs:get / prefs:changed.
let uiPrefs = {
  spellCheck: true,
  aiOff: false,
  // The two highlights of the manuscript (Näytä menu, stage I-07): Vältettävät sanat and the mentions of
  // Tarinakansio entries. The editor follows them through prefs:changed.
  'context.highlightAvoidWords': true,
  'context.underlineMentions': true
};

// The two --surface-page values of styles/faust-tokens.css: the window is this colour
// before the page has painted, so no window starts white.
function themeBackground(theme) {
  return theme === 'DEIS' ? '#F8F2E8' : '#141210';
}

// What the operating system draws (context menu, application menu, the open list of a
// select, confirm boxes) follows the app's theme, not the system's appearance.
function applyNativeTheme(theme) {
  nativeTheme.themeSource = theme === 'DEIS' ? 'light' : 'dark';
}

let uiPrefsPath = null;

function getUiPrefsPath() {
  if (!uiPrefsPath) {
    uiPrefsPath = path.join(app.getPath('userData'), 'ui-prefs.json');
  }
  return uiPrefsPath;
}

async function loadUiPrefs() {
  try {
    const raw = await fs.readFile(getUiPrefsPath(), 'utf-8');
    uiPrefs = { ...uiPrefs, ...JSON.parse(raw) };
    // Key names only: a value (a saved prompt, say) never goes to the console
    console.log('[UI Prefs] Loaded:', Object.keys(uiPrefs).join(', '));
  } catch (error) {
    console.log('[UI Prefs] First run, using defaults');
  }
}

// One change of the preferences: merged by the rules of utils/appSettings.js, written atomically,
// one write after another (two quick theme switches cannot tear the file), and sent to the
// renderer, whose settings store follows it. Resolves with { success, prefs } or { success, error }.
// uiPrefs takes the change at once (the next change and the theme check compare against it); each
// write takes uiPrefs as it is at its turn. A failed write takes the change back, unless a later
// change has replaced it, and tells the renderer, so that main, the menu and the renderer stay on
// what the file holds.
let uiPrefsSaving = Promise.resolve();
const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function saveUiPrefs(next) {
  const merged = appSettings.mergePrefs(uiPrefs, next);
  if (!merged.ok) return Promise.resolve({ success: false, error: merged.error });
  const before = uiPrefs;
  uiPrefs = merged.prefs;
  const keys = Object.keys(next);
  const turn = uiPrefsSaving
    .then(() => writeFileAtomic(getUiPrefsPath(), JSON.stringify(uiPrefs, null, 2)))
    .then(() => {
      console.log('[UI Prefs] Saved:', keys.join(', '));
      sendToRenderer('prefs:changed', uiPrefs);
      return { success: true, prefs: uiPrefs };
    }, (error) => {
      console.error('[UI Prefs] Save error:', error.message);
      const restored = { ...uiPrefs };
      for (const key of keys) {
        if (!sameValue(uiPrefs[key], merged.prefs[key])) continue;      // changed again since
        if (Object.prototype.hasOwnProperty.call(before, key)) restored[key] = before[key];
        else delete restored[key];
      }
      uiPrefs = restored;
      // After the reply: the renderer's store has then dropped its own unsent value and takes this
      setImmediate(() => sendToRenderer('prefs:changed', uiPrefs));
      return { success: false, error: 'Asetusten tallennus epäonnistui.' };
    });
  uiPrefsSaving = turn.catch(() => {});
  return turn;
}

// --- v1.4.1: Timeout wrapper for AI calls ---
async function withTimeout(promise, ms = 30000) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Aikakatkaisu (${Math.round(ms / 1000)} s)`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

let mainWindow;

// Unsaved-changes state reported by the renderer. Guards window close and quit.
let rendererDirty = false;
let quitRequested = false;
// Pending AI suggestions reported by the renderer. They do not survive a restart, so closing asks first.
let pendingSuggestions = 0;
let discardSuggestionsOnClose = false;

// Send to the renderer if the window still exists (on macOS the app outlives its window)
function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

// Menu items talk to the renderer through one channel: (action, argument)
function menuAction(action, arg) {
  sendToRenderer('menu-action', action, arg);
}

// The running AI requests: those of the one request layer (ai:request) and, tracked, those of the
// old handlers, so that "Pysäytä tekoäly" and "Tekoäly pois" stop every one of them
const aiRequests = createRequestTable({
  getConfig: getAIProviderConfig,
  getClient: getRawAIClient,
  isAiOff: () => uiPrefs.aiOff === true,
  refuse: (value) => refuseProtected(value)
});

function createWindow() {
  rendererDirty = false;
  pendingSuggestions = 0;
  discardSuggestionsOnClose = false;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: themeBackground(uiPrefs.theme),   // the first frame is the page colour
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,           // v1.4.1: Enhanced security
      spellcheck: true,        // switched on and off at runtime, see setSpellCheck()
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    // The lights on the centre line of the 52px header: the position is that of the 16pt
    // button frame, the 12pt circle sits 2pt inside it (measured: y 18 puts the circles at 20 to 32pt)
    trafficLightPosition: { x: 16, y: 18 }
  });

  // Load production app
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

  // The window only ever shows the app: a file dropped on it or a link must not navigate away
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  setSpellCheck(uiPrefs.spellCheck !== false);
  attachContextMenu(mainWindow);
  attachCloseGuard(mainWindow);
  attachFullScreenReport(mainWindow);

  // Luo valikko
  createMenu();
}

// In native fullscreen the window controls are gone and the header drops its inset for them.
// The menu channel is the only one from here to the renderer.
function attachFullScreenReport(win) {
  const report = (on) => {
    if (!win.isDestroyed()) win.webContents.send('menu-action', 'fullscreen-changed', on);
  };
  win.on('enter-full-screen', () => report(true));
  win.on('leave-full-screen', () => report(false));
}

function setSpellCheck(enabled) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.session.setSpellCheckerEnabled(enabled);
  }
}

// Right-click menu: spelling suggestions and the standard edit commands
function attachContextMenu(win) {
  win.webContents.on('context-menu', (_event, params) => {
    const template = [];

    if (params.misspelledWord) {
      const suggestions = params.dictionarySuggestions.slice(0, 6);
      for (const suggestion of suggestions) {
        template.push({
          label: suggestion,
          click: () => win.webContents.replaceMisspelling(suggestion)
        });
      }
      if (suggestions.length === 0) {
        template.push({ label: 'Ei ehdotuksia', enabled: false });
      }
      template.push(
        { type: 'separator' },
        {
          label: 'Lisää sanastoon',
          click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
        },
        { type: 'separator' }
      );
    }

    if (params.isEditable) {
      template.push(
        { label: 'Leikkaa', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Kopioi', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Liitä', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Valitse kaikki', role: 'selectAll' }
      );
    } else if (params.selectionText) {
      template.push({ label: 'Kopioi', role: 'copy' });
    }

    // Tekoäly ▸ for a selection in the manuscript (I-05): the renderer reported this click a moment
    // ago; the point ties the report to it, so a right click in another field never gets the submenu.
    // A chapter marked "Ei tekoälylle" reports nothing, and "Tekoäly pois" leaves it out (R-8).
    const context = aiContextMenu.takeContext(manuscriptContext, params, Date.now());
    manuscriptContext = null;
    if (context && context.actions.length > 0 && uiPrefs.aiOff !== true) {
      template.push({ type: 'separator' }, aiContextMenu.buildAiSubmenu(context, (id) => menuAction('ai-action', id)));
    }

    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup({ window: win });
    }
  });
}

const UNSAVED_DIALOG = {
  type: 'warning',
  message: 'Projektissa on tallentamattomia muutoksia.',
  detail: 'Jos et tallenna, tallentamattomat muutokset menetetään. Jos projektia ei ole vielä tallennettu tiedostoon, koko teksti menetetään.',
  buttons: ['Tallenna', 'Älä tallenna', 'Peruuta'],
  defaultId: 0,
  cancelId: 2
};

// Pending suggestions live in memory only: the question comes before the unsaved-changes one (R-24)
const pendingSuggestionsDialog = (count) => ({
  type: 'warning',
  message: count === 1
    ? 'Käsikirjoituksessa on 1 käsittelemätön ehdotus.'
    : `Käsikirjoituksessa on ${count} käsittelemätöntä ehdotusta.`,
  detail: 'Ehdotukset eivät säily sovelluksen sulkemisen yli. Käsikirjoituksen tekstiä ne eivät ole muuttaneet.',
  buttons: ['Palaa ehdotuksiin', 'Sulje ja hylkää ehdotukset'],
  defaultId: 0,
  cancelId: 0
});

// Ask before a window with unsaved changes closes (also covers Cmd+Q)
function attachCloseGuard(win) {
  win.on('close', (event) => {
    // "Palaa ehdotuksiin" stops the close before any save question; after "Sulje ja hylkää ehdotukset"
    // the unsaved-changes flow runs as before, and the close that follows a save does not ask again
    if (pendingSuggestions > 0 && !discardSuggestionsOnClose) {
      const answer = dialog.showMessageBoxSync(win, pendingSuggestionsDialog(pendingSuggestions));
      if (answer === 0) {
        event.preventDefault();
        quitRequested = false;
        return;
      }
      discardSuggestionsOnClose = true;
    }
    if (!rendererDirty) return;

    event.preventDefault();
    const choice = dialog.showMessageBoxSync(win, UNSAVED_DIALOG);

    if (choice === 0) {
      // The renderer saves (asking for a file name if there is none) and
      // answers with project:close-confirmed or project:close-cancelled
      win.webContents.send('menu-action', 'save-and-close');
    } else if (choice === 1) {
      // Discarded on purpose: there is nothing to recover next time. Once the recovery copy is
      // gone, finish what was asked: Lopeta FAUST quits, a closed window closes. Deferred like
      // the 'Tallenna' path, because a quit issued inside the close it has just cancelled is lost.
      rendererDirty = false;
      fs.unlink(getRecoveryPath()).catch(() => {}).then(() => {
        if (quitRequested) app.quit();
        else if (!win.isDestroyed()) win.close();
      });
    } else {
      quitRequested = false;
      discardSuggestionsOnClose = false;
    }
  });

  win.on('closed', () => {
    // A request still streaming has nowhere to go
    aiRequests.abortAll();
    if (mainWindow === win) mainWindow = null;
  });
}

app.on('before-quit', () => {
  quitRequested = true;
});

ipcMain.on('project:set-dirty', (_event, dirty) => {
  rendererDirty = !!dirty;
});

// A right click in the manuscript, reported by the renderer just before Electron's own
// context-menu event: { x, y, hasSelection, actions } (the inline prompt, stage I-05)
let manuscriptContext = null;
ipcMain.on('context:manuscript', (_event, info) => {
  manuscriptContext = aiContextMenu.sanitizeContext(info, Date.now());
});

ipcMain.on('suggestions:set-pending', (_event, count) => {
  pendingSuggestions = Math.max(0, Number(count) || 0);
  if (pendingSuggestions === 0) discardSuggestionsOnClose = false;
});

// The renderer reports its theme at start and on every switch. Only the two names are accepted.
ipcMain.on('theme-changed', (_event, theme) => {
  const next = theme === 'DEIS' ? 'DEIS' : 'NOX';
  applyNativeTheme(next);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(themeBackground(next));
    // The first report comes after the renderer has mounted and listens on the menu channel, so it
    // is also the moment to tell it the fullscreen state (after a reload, or a window restored in
    // fullscreen, no enter-full-screen event follows). Repeating it on a theme switch is harmless.
    mainWindow.webContents.send('menu-action', 'fullscreen-changed', mainWindow.isFullScreen());
  }
  if (uiPrefs.theme !== next) {
    saveUiPrefs({ theme: next }).catch((error) => console.error('[UI Prefs] Save error:', error));
  }
});

ipcMain.on('project:close-confirmed', () => {
  rendererDirty = false;
  if (quitRequested) {
    app.quit();
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

ipcMain.on('project:close-cancelled', () => {
  quitRequested = false;
  discardSuggestionsOnClose = false;
});

// Save / Don't save / Cancel, for New and Open in the renderer
ipcMain.handle('dialog:unsaved-changes', async () => {
  const { response } = await dialog.showMessageBox(mainWindow, UNSAVED_DIALOG);
  return ['save', 'discard', 'cancel'][response] || 'cancel';
});

// Application menu. Every item either uses a native role or sends one action
// to the renderer (see the menu handler in app.js); nothing here is a stub.
function createMenu() {
  const isMac = process.platform === 'darwin';
  const item = (label, action, accelerator, arg) => ({
    label,
    accelerator,
    click: () => menuAction(action, arg)
  });
  const separator = { type: 'separator' };
  const insertText = (label, text) => ({ label, click: () => menuAction('insert-text', text) });
  // Every AI door of the menu goes through this: with "Tekoäly pois" on, it is absent (reconcile R-6).
  // The way back, Työkalut ▸ Tekoäly ▸ Tekoälyasetukset… and Tekoäly pois, is never inside it.
  const aiItems = (...items) => (uiPrefs.aiOff === true ? [] : items);
  // What the last Voikko detection found (null before the first one has finished)
  const voikkoAvailable = () => !!(voikko.status() && voikko.status().available);

  const template = [
    // App menu (macOS)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        // The name is written out: app.name can be the lower-case package name
        { label: 'Tietoja: FAUST', role: 'about' },
        separator,
        item('Asetukset…', 'show-settings', 'CmdOrCtrl+,'),
        separator,
        { label: 'Kätke FAUST', role: 'hide' },
        { label: 'Kätke muut', role: 'hideOthers' },
        { label: 'Näytä kaikki', role: 'unhide' },
        separator,
        { label: 'Lopeta FAUST', role: 'quit' }
      ]
    }] : []),

    {
      label: 'Tiedosto',
      submenu: [
        item('Uusi projekti', 'new-project', 'CmdOrCtrl+N'),
        item('Avaa…', 'open-project', 'CmdOrCtrl+O'),
        separator,
        item('Tallenna', 'save-project', 'CmdOrCtrl+S'),
        item('Tallenna nimellä…', 'save-project-as', 'CmdOrCtrl+Shift+S'),
        item('Tilannekuvat', 'show-snapshots'),
        separator,
        item('Projektin asetukset…', 'show-project-settings'),
        separator,
        item('Tuo tekstiä…', 'import-document'),
        item('Tuo kansio…', 'import-folder'),
        item('Vie…', 'show-export', 'CmdOrCtrl+E'),
        item('Tulosta…', 'print', 'CmdOrCtrl+P'),
        separator,
        { label: 'Sulje ikkuna', accelerator: 'CmdOrCtrl+W', role: 'close' },
        ...(isMac ? [] : [
          separator,
          item('Asetukset…', 'show-settings', 'CmdOrCtrl+,'),
          { label: 'Lopeta', role: 'quit' }
        ])
      ]
    },

    {
      label: 'Muokkaa',
      submenu: [
        item('Kumoa', 'undo', 'CmdOrCtrl+Z'),
        item('Tee uudelleen', 'redo', 'CmdOrCtrl+Shift+Z'),
        separator,
        { label: 'Leikkaa', role: 'cut' },
        { label: 'Kopioi', role: 'copy' },
        { label: 'Liitä', role: 'paste' },
        // A local tool, not an AI door (never inside aiItems, R-6). The clipboard is read here, only when
        // the author chooses the item, and goes to this window's renderer as the action's argument (I-04)
        {
          label: 'Liitä muokkauksina…',
          accelerator: 'CmdOrCtrl+Alt+V',
          click: () => menuAction('paste-as-edits', clipboard.readText())
        },
        { label: 'Valitse kaikki', role: 'selectAll' },
        separator,
        item('Etsi…', 'show-find', 'CmdOrCtrl+F'),
        item('Etsi seuraava', 'find-next', 'CmdOrCtrl+G'),
        item('Etsi edellinen', 'find-previous', 'CmdOrCtrl+Shift+G'),
        item('Etsi ja korvaa…', 'show-find-replace', 'CmdOrCtrl+Alt+F'),
        separator,
        // An instruction at the selection; the change comes as suggestions (I-05). The panel on ⇧⌘K is the
        // conversation about the text, and each path names the other (R-1)
        ...aiItems({
          ...item('Pikamuokkaus…', 'quick-edit', 'CmdOrCtrl+K'),
          toolTip: 'Kirjoita ohje valitun tekstin kohdalle. Muutos tulee ehdotuksena tekstiin. Keskustelu tekstistä: Liminal Engine (' + (isMac ? '⇧⌘K' : 'Ctrl+Shift+K') + ').'
        }),
        // The review keys live in the editor while something is pending; here without accelerators (R-5)
        {
          label: 'Ehdotukset',
          submenu: [
            item('Hyväksy ehdotus', 'suggestion', undefined, 'accept'),
            item('Hylkää ehdotus', 'suggestion', undefined, 'reject'),
            separator,
            item('Seuraava ehdotus', 'suggestion', undefined, 'next'),
            item('Edellinen ehdotus', 'suggestion', undefined, 'previous'),
            separator,
            item('Hyväksy kaikki ehdotukset', 'suggestion', undefined, 'accept-all'),
            item('Hylkää kaikki ehdotukset', 'suggestion', undefined, 'reject-all'),
            item('Palauta hylätyt ehdotukset', 'suggestion', undefined, 'restore')
          ]
        }
      ]
    },

    {
      label: 'Muotoile',
      submenu: [
        item('Lihavointi', 'format-bold', 'CmdOrCtrl+B'),
        item('Kursivointi', 'format-italic', 'CmdOrCtrl+I'),
        item('Alleviivaus', 'format-underline', 'CmdOrCtrl+U'),
        item('Yliviivaus', 'format-strikethrough', 'CmdOrCtrl+Shift+X'),
        separator,
        item('Otsikko 1', 'format-heading', 'CmdOrCtrl+Alt+1', 1),
        item('Otsikko 2', 'format-heading', 'CmdOrCtrl+Alt+2', 2),
        item('Otsikko 3', 'format-heading', 'CmdOrCtrl+Alt+3', 3),
        item('Leipäteksti', 'format-heading', 'CmdOrCtrl+Alt+0', 0),
        separator,
        item('Lainaus', 'format-quote'),
        item('Luettelo', 'format-list', 'CmdOrCtrl+Shift+8'),
        item('Numeroitu luettelo', 'format-numbered-list', 'CmdOrCtrl+Shift+7'),
        separator,
        item('Isoiksi kirjaimiksi', 'text-uppercase', 'CmdOrCtrl+Shift+U'),
        item('Pieniksi kirjaimiksi', 'text-lowercase', 'CmdOrCtrl+Shift+L'),
        separator,
        item('Poista luvusta ylimääräiset välilyönnit', 'text-trim-spaces'),
        item('Poista luvusta ylimääräiset tyhjät rivit', 'text-remove-empty-lines')
      ]
    },

    {
      label: 'Lisää',
      submenu: [
        item('Uusi luku', 'new-chapter', 'CmdOrCtrl+Shift+N'),
        separator,
        {
          label: 'Päivämäärä',
          click: () => menuAction('insert-text', new Date().toLocaleDateString('fi-FI'))
        },
        insertText('Kohtauksen erotin', '\n\n* * *\n\n'),
        item('Muistutus', 'insert-todo'),
        item('Kirjanmerkki…', 'add-bookmark'),
        separator,
        {
          label: 'Erikoismerkki',
          submenu: [
            insertText('Ajatusviiva –', '–'),
            insertText('Pitkä ajatusviiva —', '—'),
            insertText('Kolme pistettä …', '…'),
            insertText('Lainausmerkki ”', '”'),
            // The path to the mark while Älykäs kirjoitus is off (I-06)
            insertText('Heittomerkki ’', '’'),
            insertText('Kulmalainausmerkki »', '»'),
            insertText('Sitova välilyönti', ' ')
          ]
        }
      ]
    },

    {
      label: 'Näytä',
      submenu: [
        item('Sivupalkki', 'toggle-sidebar', 'CmdOrCtrl+1'),
        item('Tietopaneeli', 'toggle-inspector', 'CmdOrCtrl+2'),
        ...aiItems(
          { ...item('Liminal Engine (tekoälyavustaja)', 'toggle-ai-panel', 'CmdOrCtrl+Shift+K'), toolTip: 'Näytä tai kätke tekoälyavustajan paneeli' },
          item('Keskustelu', 'toggle-chat-window')
        ),
        separator,
        item('Korttinäkymä', 'toggle-corkboard'),
        item('Jaettu näkymä', 'toggle-split-view'),
        item('Kirjanmerkit', 'toggle-bookmarks'),
        separator,
        item('Keskittymistila', 'toggle-focus-mode', 'CmdOrCtrl+Shift+F'),
        item('Kirjoituskonetila', 'toggle-typewriter'),
        separator,
        // The two marks of the manuscript (I-07): local, never inside aiItems; they stay with "Tekoäly pois"
        {
          label: 'Korosta vältettävät sanat',
          type: 'checkbox',
          checked: uiPrefs['context.highlightAvoidWords'] !== false,
          click: async (menuItem) => {
            const saved = await saveUiPrefs({ 'context.highlightAvoidWords': menuItem.checked });
            if (!saved.success) createMenu();      // the checkbox shows what main holds
          }
        },
        {
          label: 'Alleviivaa Tarinakansion maininnat',
          type: 'checkbox',
          checked: uiPrefs['context.underlineMentions'] !== false,
          click: async (menuItem) => {
            const saved = await saveUiPrefs({ 'context.underlineMentions': menuItem.checked });
            if (!saved.success) createMenu();
          }
        },
        separator,
        item('Lähennä', 'zoom-in', 'CmdOrCtrl+Plus'),
        item('Loitonna', 'zoom-out', 'CmdOrCtrl+-'),
        item('Todellinen koko', 'zoom-reset', 'CmdOrCtrl+0'),
        separator,
        { ...item('Teema: NOX (tumma) / DEIS (vaalea)', 'toggle-theme', 'CmdOrCtrl+Shift+D'), toolTip: 'Vaihda tumman NOX-teeman ja vaalean DEIS-teeman välillä' },
        separator,
        { label: 'Koko näyttö', accelerator: isMac ? 'Ctrl+Command+F' : 'F11', role: 'togglefullscreen' }
      ]
    },

    {
      label: 'Työkalut',
      submenu: [
        {
          label: 'Oikoluku',
          type: 'checkbox',
          checked: uiPrefs.spellCheck !== false,
          click: async (menuItem) => {
            const saved = await saveUiPrefs({ spellCheck: menuItem.checked });
            setSpellCheck(uiPrefs.spellCheck !== false);
            if (!saved.success) createMenu();      // the checkbox shows what main holds
          }
        },
        // Local language tools (I-06): never inside aiItems, they work with "Tekoäly pois" (R-6).
        // Voikko is greyed until detection has found it; the install hint then leaves the menu.
        item('Tarkista typografia', 'check-typography'),
        {
          label: 'Voikko-tarkistus…',
          enabled: voikkoAvailable(),
          toolTip: voikkoAvailable() ? undefined : 'Voikkoa ei löytynyt. Asenna: brew install libvoikko',
          click: () => menuAction('voikko-check-chapter')
        },
        ...(voikkoAvailable() ? [] : [item('Voikon asennusohje', 'voikko-help')]),
        separator,
        item('Hahmot', 'show-characters'),
        item('Paikat', 'show-locations'),
        item('Juonilangat', 'show-threads'),
        item('Aikajana', 'show-timeline', 'CmdOrCtrl+Shift+T'),
        item('Tutkimuskansio', 'show-research', 'CmdOrCtrl+Shift+R'),
        // The section of the sidebar (I-07); the menu says Tarinakansio in every project, also nonfiction
        item('Tarinakansio', 'show-codex', 'CmdOrCtrl+Shift+J'),
        separator,
        ...aiItems(
          item('Suunnittele hahmot…', 'show-cast-plan'),
          item('Uusi hahmo…', 'show-character-builder')
        ),
        item('Luvun versiot', 'show-version-history'),
        separator,
        {
          label: 'Tekoäly',
          submenu: [
            // The action items and Pysäytä tekoäly are one group, left out as one while the
            // settings group below stays (reconcile R-4, R-6)
            ...aiItems(
              item('Analysoi luku', 'ai-analyze'),
              item('Pika-arvio', 'ai-quick-check'),
              item('Tee tiivistelmä', 'ai-summary'),
              separator,
              {
                label: 'Magnum Opus',
                toolTip: 'Tekoäly kirjoittaa kokonaisia lukuja alusta loppuun',
                submenu: [
                  item('Kirjoita luku…', 'magnum-opus-chapter'),
                  item('Kirjoita kaikki luvut…', 'magnum-opus-all')
                ]
              },
              separator,
              item('Kirjoita tekoälyn kanssa…', 'show-ai-writing'),
              item('Muokkaa valintaa puhumalla', 'voice-edit'),
              // The AI proofreading of the open chapter, in Kielen työkalut (I-06)
              item('Kielenhuolto…', 'proofread-chapter'),
              separator,
              // One command stops everything: the request layer and the tracked old handlers stop in
              // main, which then refuses the old handlers for STOP_LATCH_MS, so that a batch loop
              // cannot start its next chapter; the renderer's client stops its own handles
              {
                label: 'Pysäytä tekoäly',
                accelerator: 'CmdOrCtrl+.',
                click: () => {
                  aiRequests.abortAll({ latchMs: AI_CONSTANTS.STOP_LATCH_MS });
                  menuAction('ai-stop-all');
                }
              },
              separator
            ),
            item('Tekoälyasetukset…', 'show-ai-settings'),
            {
              label: 'Tekoäly pois',
              type: 'checkbox',
              checked: uiPrefs.aiOff === true,
              // Acts on what main holds after the save: a failed write leaves the switch as it was
              click: async (menuItem) => {
                const saved = await saveUiPrefs({ aiOff: menuItem.checked });
                if (saved.success && uiPrefs.aiOff === true) aiRequests.abortAll();
                createMenu();
              }
            }
          ]
        }
      ]
    },

    {
      label: 'Ikkuna',
      submenu: [
        { label: 'Pienennä', role: 'minimize' },
        { label: isMac ? 'Zoomaa' : 'Suurenna', role: 'zoom' },
        // Closing is Tiedosto ▸ Sulje ikkuna
        ...(isMac ? [
          separator,
          { label: 'Tuo kaikki eteen', role: 'front' }
        ] : [])
      ]
    },

    {
      label: 'Ohje',
      submenu: [
        item('Pikanäppäimet', 'show-shortcuts'),
        separator,
        // Kept in every build: the owner runs his own packaged app and needs it there
        {
          label: 'Kehittäjätyökalut',
          accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: () => mainWindow && mainWindow.webContents.toggleDevTools()
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Write a file so that a crash mid-write cannot leave a truncated project
async function writeFileAtomic(filePath, text) {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tempPath, text, 'utf-8');
  await fs.rename(tempPath, filePath);
}

app.whenReady().then(async () => {
  await loadApiConfig();
  await loadUiPrefs();  // v1.4.1: Load UI preferences
  applyNativeTheme(uiPrefs.theme);  // before the window and its menus exist
  createWindow();
  // Voikko is looked for after the window exists; the menu follows what was found
  voikko.detect().then(() => createMenu()).catch(() => {});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Tallenna projekti (.faust format)
// options.filePath: write there without asking. Without it (or with
// options.saveAs) the save dialog is shown.
ipcMain.handle('save-project', async (event, projectData, options = {}) => {
  try {
    let filePath = options.saveAs ? null : options.filePath;

    if (!filePath) {
      // One file type: a project opened from an old .json file is offered under its .faust name
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Tallenna projekti',
        message: 'Anna projektille nimi ja valitse tallennuspaikka.',
        buttonLabel: 'Tallenna',
        defaultPath: options.filePath ? options.filePath.replace(/\.json$/i, '.faust') : `${projectData.title || 'projekti'}.faust`,
        filters: [
          { name: 'FAUST-projekti', extensions: ['faust'] }
        ]
      });
      filePath = result.filePath;
    }

    if (!filePath) {
      return { success: false, canceled: true };
    }

    const dataWithMeta = {
      ...projectData,
      modified: new Date().toISOString(),
      version: '2.0'  // FAUST v2.0 format
    };

    await writeFileAtomic(filePath, JSON.stringify(dataWithMeta, null, 2));
    return { success: true, path: filePath };
  } catch (error) {
    console.error('[Save Project] Error:', error);
    return { success: false, error: error.message };
  }
});

// Lataa projekti (.faust or .json)
ipcMain.handle('load-project', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Avaa projekti',
      message: 'Valitse avattava FAUST-projekti.',
      buttonLabel: 'Avaa',
      filters: [
        { name: 'FAUST-projektit', extensions: ['faust', 'json'] }
      ],
      properties: ['openFile']
    });

    if (filePaths && filePaths[0]) {
      const data = await fs.readFile(filePaths[0], 'utf-8');
      const project = JSON.parse(data);

      // Store current file path for autosave
      return {
        success: true,
        data: project,
        filePath: filePaths[0]
      };
    }
    return { success: false };
  } catch (error) {
    console.error('[Load Project] Error:', error);
    return { success: false, error: error.message };
  }
});

// Load project from specific path (for recent files)
ipcMain.handle('load-project-from-path', async (event, filePath) => {
  try {
    if (!filePath) {
      return { success: false, error: 'tiedoston polku puuttuu' };
    }

    const data = await fs.readFile(filePath, 'utf-8');
    const project = JSON.parse(data);

    return {
      success: true,
      data: project,
      filePath: filePath
    };
  } catch (error) {
    console.error('[Load Project From Path] Error:', error);
    return { success: false, error: error.message };
  }
});

// Autosave (save without dialog)
ipcMain.handle('autosave-project', async (event, { projectData, filePath }) => {
  try {
    if (!filePath) {
      return { success: false, error: 'tiedoston polku puuttuu' };
    }

    // Add metadata
    const dataWithMeta = {
      ...projectData,
      modified: new Date().toISOString()
    };

    await writeFileAtomic(filePath, JSON.stringify(dataWithMeta, null, 2));
    return { success: true, path: filePath };
  } catch (error) {
    console.error('[Autosave] Error:', error);
    return { success: false, error: error.message };
  }
});

// ============================================
// EXPORT, PRINT, IMPORT (conversion lives in utils/manuscript.js)
// ============================================

const EXPORT_FORMATS = {
  txt: { name: 'Tekstitiedosto', extension: 'txt' },
  md: { name: 'Markdown', extension: 'md' },
  html: { name: 'HTML', extension: 'html' },
  rtf: { name: 'RTF-asiakirja', extension: 'rtf' },
  docx: { name: 'Word-asiakirja', extension: 'docx' },
  pdf: { name: 'PDF', extension: 'pdf' },
  epub: { name: 'EPUB-e-kirja', extension: 'epub' }
};

function safeFileName(name) {
  return String(name || 'kasikirjoitus').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'kasikirjoitus';
}

// Load HTML into a hidden window (through a temp file, so a whole novel fits)
// and hand the window to `use`
async function withHiddenPage(html, use) {
  const tempPath = path.join(app.getPath('temp'), `faust-${process.pid}-${Date.now()}.html`);
  await fs.writeFile(tempPath, html, 'utf-8');

  const page = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, javascript: false }
  });

  try {
    await page.loadFile(tempPath);
    return await use(page);
  } finally {
    if (!page.isDestroyed()) page.destroy();
    fs.unlink(tempPath).catch(() => {});
  }
}

const PDF_FOOTER = '<div style="width:100%;text-align:center;font-family:Georgia,serif;font-size:9px;color:#555;"><span class="pageNumber"></span></div>';

// Export the whole project, or only the chapters listed in chapterIds
ipcMain.handle('export-manuscript', async (_event, { project, format, chapterIds = null } = {}) => {
  try {
    const target = EXPORT_FORMATS[format];
    if (!target) {
      return { success: false, error: `Tuntematon vientimuoto: ${format}` };
    }

    const book = manuscript.buildManuscript(project, { chapterIds });
    if (book.chapters.length === 0) {
      return { success: false, error: 'Projektissa ei ole vietävää tekstiä.' };
    }

    const baseName = safeFileName(book.single ? book.chapters[0].title : book.title);
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Vie käsikirjoitus',
      message: 'Anna vietävälle tiedostolle nimi ja valitse tallennuspaikka.',
      buttonLabel: 'Vie',
      defaultPath: `${baseName}.${target.extension}`,
      filters: [{ name: target.name, extensions: [target.extension] }]
    });

    if (!filePath) {
      return { success: false, canceled: true };
    }

    let data;
    switch (format) {
      case 'txt': data = manuscript.toPlainText(book); break;
      case 'md': data = manuscript.toMarkdown(book); break;
      case 'html': data = manuscript.toHTML(book); break;
      case 'rtf': data = manuscript.toRTF(book); break;
      case 'docx': data = await manuscript.toDocx(book); break;
      case 'epub': data = await manuscript.toEPUB(book); break;
      case 'pdf':
        data = await withHiddenPage(manuscript.toHTML(book), (page) => page.webContents.printToPDF({
          pageSize: 'A4',
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: '<span></span>',
          footerTemplate: PDF_FOOTER,
          margins: { top: 1, bottom: 1, left: 1, right: 1 } // inches
        }));
        break;
    }

    await fs.writeFile(filePath, data);
    console.log('[Export]', format, '->', filePath);
    return { success: true, path: filePath };
  } catch (error) {
    console.error('[Export] Error:', error);
    return { success: false, error: error.message };
  }
});

// Print the whole project, or only the chapters listed in chapterIds, through the system print dialog
ipcMain.handle('print-manuscript', async (_event, { project, chapterIds = null } = {}) => {
  try {
    const book = manuscript.buildManuscript(project, { chapterIds });
    if (book.chapters.length === 0) {
      return { success: false, error: 'Projektissa ei ole tulostettavaa tekstiä.' };
    }

    return await withHiddenPage(manuscript.toHTML(book), (page) => new Promise((resolve) => {
      page.webContents.print({ printBackground: true }, (success, failureReason) => {
        if (success) resolve({ success: true });
        else if (/cancel/i.test(failureReason || '')) resolve({ success: false, canceled: true });
        else resolve({ success: false, error: failureReason || 'Tulostus epäonnistui' });
      });
    }));
  } catch (error) {
    console.error('[Print] Error:', error);
    return { success: false, error: error.message };
  }
});

// Menu spec B.12: an import failure gives its reason in Finnish. The import modules' own reasons
// are Finnish sentences (Tiedosto…, Kansio…, Alikansiota…) and pass as they are. A system error
// (Node's "ENOENT: no such file or directory, scandir '/…'", also inside readImportFolder's
// "Kansiota ei voitu lukea: …") or a library's English message (JSZip on a file that is not a
// .docx) is replaced; the original goes to the log. The path is returned apart from the sentence.
// subject: 'folder' or 'file'; fileName: the file read, for the Word case.
const OWN_IMPORT_REASON = /^(Tiedosto|Kansio|Alikansio)/;
function importFailureReason(error, subject, fileName) {
  const message = String((error && error.message) || error || '').trim();
  const code = (error && typeof error.code === 'string' && error.code) || (/\b(E[A-Z]{2,}):/.exec(message) || [])[1] || '';
  const folder = subject === 'folder';
  if (code === 'ENOENT' || code === 'ENOTDIR') return folder ? 'Kansiota ei löytynyt.' : 'Tiedostoa ei löytynyt.';
  if (code === 'EACCES' || code === 'EPERM') return folder ? 'Kansioon ei ole lukuoikeutta.' : 'Tiedostoon ei ole lukuoikeutta.';
  // readImportFolder's "Kansiota ei voitu lukea: <system message>" never passes with its English tail
  if (!code && OWN_IMPORT_REASON.test(message) && !/^Kansiota ei voitu lukea:/.test(message)) return message;
  if (!code && /\.docx$/i.test(fileName || '')) return 'Tiedosto ei ole kelvollinen Word-asiakirja.';
  return folder ? 'Kansiota ei voitu lukea.' : 'Tiedostoa ei voitu lukea.';
}

// Read a .txt, .md or .docx file as chapters. The renderer shows them in the
// import preview; nothing is written to the project here.
ipcMain.handle('import-document', async () => {
  let filePath = null;
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Tuo tekstiä',
      message: 'Valitse tuotava tiedosto (.txt, .md tai .docx). Näet luvut esikatselussa ennen kuin mitään tuodaan.',
      buttonLabel: 'Tuo',
      filters: [{ name: 'Tekstit ja Word-asiakirjat', extensions: ['txt', 'md', 'markdown', 'docx'] }],
      properties: ['openFile']
    });

    if (!filePaths || !filePaths[0]) {
      return { success: false, canceled: true };
    }

    filePath = filePaths[0];
    const buffer = await fs.readFile(filePath);
    const imported = await manuscript.importDocument(buffer, filePath);
    return { success: true, kind: 'file', filePath, name: path.basename(filePath).normalize('NFC'), ...imported };
  } catch (error) {
    console.error('[Import] Error:', error);
    return { success: false, error: importFailureReason(error, 'file', filePath), path: filePath || undefined };
  }
});

// The folder last read by the import. The renderer may ask for one of its
// direct sub-folders by name, never for a path of its own.
let lastImportFolder = null;

// Read the .txt, .md and .docx files of a folder as chapters. Read only.
ipcMain.handle('import-folder', async (_event, request = {}) => {
  let folderPath = null;
  try {
    if (request && typeof request.subfolder === 'string') {
      folderPath = lastImportFolder
        ? await importFolder.resolveSubfolder(lastImportFolder, request.subfolder)
        : null;
      if (!folderPath) return { success: false, error: 'Alikansiota ei löytynyt.' };
    } else {
      const { filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Tuo kansio',
        message: 'Valitse kansio, jonka tiedostot tuodaan luvuiksi.',
        buttonLabel: 'Valitse',
        properties: ['openDirectory']
      });
      if (!filePaths || !filePaths[0]) return { success: false, canceled: true };
      folderPath = filePaths[0];
    }

    const source = await importFolder.readImportFolder(folderPath);
    lastImportFolder = folderPath;
    // A file of the folder that could not be read is reported in the preview (report.failed):
    // its reason in Finnish too, by the same rule
    const failed = source.report && Array.isArray(source.report.failed)
      ? source.report.failed.map(entry => ({ ...entry, error: importFailureReason({ message: entry.error }, 'file', entry.name) }))
      : [];
    console.log('[Import folder]', source.chapters.length, 'files');
    return { success: true, ...source, report: { ...source.report, failed } };
  } catch (error) {
    console.error('[Import folder] Error:', error.message);
    return { success: false, error: importFailureReason(error, 'folder'), path: folderPath || undefined };
  }
});

// Open a web page in the system browser. Only https links.
ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
    return { success: false };
  }
  await shell.openExternal(url);
  return { success: true };
});

// Voikko (stage I-06). The status says whether the tools were found; recheck looks again and rebuilds the
// menu, so an installation made while FAUST runs needs no restart. Text travels only through stdin.
ipcMain.handle('voikko:status', async (_event, { recheck = false } = {}) => {
  const status = await voikko.detect({ force: !!recheck });
  if (recheck) createMenu();
  return status;
});
ipcMain.handle('voikko:analyze', async (_event, { words, suggest } = {}) => {
  try { return { success: true, results: await voikko.analyze(Array.isArray(words) ? words : [], { suggest: !!suggest }) }; }
  catch (error) { return { success: false, error: error.message }; }
});
ipcMain.handle('voikko:grammar', async (_event, { paragraphs } = {}) => {
  try { return { success: true, results: await voikko.grammar(Array.isArray(paragraphs) ? paragraphs : []) }; }
  catch (error) { return { success: false, error: error.message }; }
});

// Which keys are set: two booleans, never a value
ipcMain.handle('load-api-keys', async () => {
  return { success: true, keys: appSettings.publicKeyStatus(getAIProviderConfig()) };
});

// Write or delete one key ('' deletes). The other settings are merged here, because the renderer
// no longer has them to send back. No log line names a value.
ipcMain.handle('keys:set', async (_event, { name, value } = {}) => {
  const result = appSettings.applyKeyWrite(apiConfig, name, value);
  if (!result.ok) return { success: false, error: result.error };
  try {
    const { encrypted } = await persistApiConfig(result.config);
    return { success: true, encrypted, keys: appSettings.publicKeyStatus(getAIProviderConfig()) };
  } catch (error) {
    // The reason only: the settings block writes 'Avaimen tallennus epäonnistui: <syy>.' (6.2)
    return { success: false, error: 'asetustiedostoa ei voitu kirjoittaa' };
  }
});

// AI provider settings: Claude (Anthropic) or Cherry Studio gateway
ipcMain.handle('ai:get-provider', async () => {
  return { success: true, ...publicAIProviderConfig() };
});

ipcMain.handle('ai:set-provider', async (_event, next = {}) => {
  try {
    const updated = appSettings.applyProviderPatch(apiConfig, next);
    await persistApiConfig(updated);
    console.log('[AI Provider] Settings saved:', publicAIProviderConfig());
    return { success: true, ...publicAIProviderConfig() };
  } catch (error) {
    console.error('[AI Provider] Save error:', error);
    return { success: false, error: error.message };
  }
});

// List the models Cherry Studio offers through its gateway
ipcMain.handle('ai:list-cherry-models', async () => {
  const cfg = getAIProviderConfig();
  if (!cfg.cherryKey) {
    return { success: false, error: 'Cherry Studion API-avain puuttuu.' };
  }

  try {
    const response = await withTimeout(
      fetch(`${cfg.gatewayUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${cfg.cherryKey}` }
      }),
      8000
    );

    if (response.status === 401 || response.status === 403) {
      return { success: false, error: describeAIError({ status: response.status, message: 'Forbidden' }) };
    }
    if (!response.ok) {
      return { success: false, error: `Cherry Studio vastasi virheellä ${response.status}.` };
    }

    const body = await response.json();
    const models = (body.data || []).map(m => ({
      id: m.id,
      name: String(m.id).split(':').slice(1).join(':') || m.id,
      owner: m.owned_by || ''
    }));
    return { success: true, models };
  } catch (error) {
    return {
      success: false,
      error: `Cherry Studioon ei saada yhteyttä (${cfg.gatewayUrl}). Varmista, että Cherry Studio on käynnissä ja sen API Gateway päällä.`
    };
  }
});

// The models Claude offers to this key, with each one's window when the list says it
ipcMain.handle('ai:list-anthropic-models', async () => {
  const cfg = getAIProviderConfig();
  if (!cfg.anthropicKey) {
    return { success: false, error: 'Clauden API-avain puuttuu.' };
  }
  try {
    const page = await withTimeout(new Anthropic({ apiKey: cfg.anthropicKey }).models.list({ limit: 100 }), 8000);
    const data = page && Array.isArray(page.data) ? page.data : [];
    return {
      success: true,
      models: data.map(m => ({
        id: m.id,
        name: m.display_name || m.id,
        window: m.max_input_tokens ?? null,
        maxOutput: m.max_tokens ?? null
      }))
    };
  } catch (error) {
    return { success: false, error: describeAIError(error) };
  }
});

// Send one short request through the selected provider. The model is the configured one: both
// wrappers fill it in, and an empty Claude model field gives its own reason.
ipcMain.handle('ai:test-provider', async () => {
  try {
    const client = getClaudeClient();
    const started = Date.now();
    const message = await withTimeout(
      client.messages.create({
        model: '',
        max_tokens: 1000,
        messages: [{ role: 'user', content: 'Vastaa yhdellä sanalla: toimii' }]
      }),
      90000
    );
    return {
      success: true,
      text: messageText(message).trim(),
      model: message.model,
      ms: Date.now() - started
    };
  } catch (error) {
    return { success: false, error: describeAIError(error) };
  }
});

// Chat Memory Log (Liminal Engine context persistence)
const getChatLogPath = () => {
  return path.join(app.getPath('userData'), 'liminal-memory.json');
};

ipcMain.handle('chat:load-memory', async () => {
  try {
    const logPath = getChatLogPath();
    // Use fs.access to check if file exists (async version)
    try {
      await fs.access(logPath);
      const data = await fs.readFile(logPath, 'utf-8');
      const log = JSON.parse(data);
      console.log('[Chat Memory] Loaded', log.entries?.length || 0, 'entries');
      return { success: true, data: log };
    } catch (accessError) {
      // File doesn't exist, return empty data
      return { success: true, data: { entries: [], lastUpdated: null } };
    }
  } catch (error) {
    console.error('[Chat Memory] Load error:', error);
    return { success: false, error: error.message, data: { entries: [], lastUpdated: null } };
  }
});

ipcMain.handle('chat:save-memory', async (_event, entry) => {
  try {
    const logPath = getChatLogPath();
    let log = { entries: [], lastUpdated: null };

    // Load existing log (use fs.access for async check)
    try {
      await fs.access(logPath);
      const data = await fs.readFile(logPath, 'utf-8');
      log = JSON.parse(data);
    } catch {
      // File doesn't exist yet, use empty log
    }

    // Add new entry
    log.entries.push({
      timestamp: new Date().toISOString(),
      ...entry
    });

    // Keep last 100 entries
    if (log.entries.length > 100) {
      log.entries = log.entries.slice(-100);
    }

    log.lastUpdated = new Date().toISOString();

    // Save
    await fs.writeFile(logPath, JSON.stringify(log, null, 2), 'utf-8');
    console.log('[Chat Memory] Saved entry:', entry.type);
    return { success: true };
  } catch (error) {
    console.error('[Chat Memory] Save error:', error);
    return { success: false, error: error.message };
  }
});

// Recovery copy of unsaved work. Written while the project has unsaved
// changes, removed when it is saved or deliberately discarded, and offered
// on the next start if it is still there (crash, power loss, force quit).
function getRecoveryPath() {
  return path.join(app.getPath('userData'), 'recovery.json');
}

// A copy is kept only while the project is dirty. The close question blocks this process, so a
// write the renderer sent meanwhile can arrive after 'Älä tallenna' (or a save) has removed the
// copy; it is dropped, before it starts or before its rename, so the discarded work never returns.
const NOT_DIRTY = { success: false, error: 'ei tallentamattomia muutoksia' };

ipcMain.handle('save-backup', async (event, { project, filePath = null } = {}) => {
  try {
    if (!rendererDirty) return NOT_DIRTY;
    if (!project) return { success: false, error: 'projekti puuttuu' };
    const recovery = { savedAt: new Date().toISOString(), filePath, project };
    const recoveryPath = getRecoveryPath();
    const tempPath = `${recoveryPath}.tmp-${process.pid}`;
    await fs.writeFile(tempPath, JSON.stringify(recovery), 'utf-8');
    if (!rendererDirty) {
      await fs.unlink(tempPath).catch(() => {});
      return NOT_DIRTY;
    }
    await fs.rename(tempPath, recoveryPath);
    return { success: true };
  } catch (error) {
    console.error('[Recovery] Save error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-backup', async () => {
  try {
    const data = await fs.readFile(getRecoveryPath(), 'utf-8');
    const recovery = JSON.parse(data);
    if (!recovery || !recovery.project || !Array.isArray(recovery.project.structure)) {
      return { success: false };
    }
    return { success: true, ...recovery };
  } catch (error) {
    return { success: false };
  }
});

ipcMain.handle('clear-backup', async () => {
  try {
    await fs.unlink(getRecoveryPath());
  } catch (error) {
    // Nothing to remove
  }
  return { success: true };
});

// --- One request layer (report 5.3): every new AI feature sends through ai:request ---
// The renderer's client (src/services/ai/aiClient.js) sends AIRequest objects; the answer streams
// back as ai:chunk messages tagged with the request id, and the call resolves with one result that
// says how the answer ended. It never rejects.
ipcMain.handle('ai:request', (event, request) => aiRequests.start(request, (chunk) => {
  if (!event.sender.isDestroyed()) event.sender.send('ai:chunk', chunk);
}));
ipcMain.handle('ai:cancel', (_event, { id } = {}) => ({ ok: true, found: aiRequests.cancel(id) }));

// Renderer settings kept in ui-prefs.json (the renderer's settings store reads and writes them here)
ipcMain.handle('prefs:get', () => ({ success: true, prefs: uiPrefs }));
ipcMain.handle('prefs:set', async (_event, patch) => {
  const before = uiPrefs.aiOff === true;
  const result = await saveUiPrefs(patch);
  // uiPrefs is what the file holds: after a failed write it is unchanged, and so is the menu
  if (result.success && (uiPrefs.aiOff === true) !== before) {
    if (uiPrefs.aiOff === true) aiRequests.abortAll();
    createMenu();
  }
  return result;
});

// Save a text the renderer produced (the usage log export)
ipcMain.handle('file:save-text', async (_event, { title, defaultName, text } = {}) => {
  try {
    if (typeof text !== 'string') return { success: false, error: 'Ei tallennettavaa tekstiä.' };
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: title || 'Tallenna',
      defaultPath: `${safeFileName(defaultName || 'teksti')}.txt`,
      filters: [{ name: 'Tekstitiedosto', extensions: ['txt'] }]
    });
    if (!filePath) return { success: false, canceled: true };
    await fs.writeFile(filePath, text, 'utf-8');
    return { success: true, path: filePath };
  } catch (error) {
    console.error('[Save text] Error:', error.message);
    return { success: false, error: error.message };
  }
});

// Claude API (Anthropic SDK). Stays for its old callers, with three guards: the "Tekoäly pois"
// switch, the "Ei tekoälylle" wire guard and the abort table (Pysäytä tekoäly stops it, and for a
// few seconds after a stop it refuses, so that a batch loop cannot go on to its next chapter).
ipcMain.handle('claude-api', async (event, promptOrOptions) => {
  const abort = new AbortController();
  const release = aiRequests.track(abort);
  try {
    if (uiPrefs.aiOff === true) return { success: false, error: AI_OFF_SENTENCE };
    if (aiRequests.isLatched()) return { success: false, error: STOPPED_SENTENCE };
    const refused = refuseProtected(promptOrOptions);
    if (refused) return { success: false, error: refused };

    // Support both string prompt and { prompt, model, temperature, max_tokens } object
    const prompt = typeof promptOrOptions === 'string' ? promptOrOptions : promptOrOptions.prompt;
    const model = typeof promptOrOptions === 'object' ? promptOrOptions.model : null;
    const temperature = typeof promptOrOptions === 'object' ? promptOrOptions.temperature : 0.7;
    // The Messages API requires max_tokens: callers that pass an object without it get the default too
    const maxTokens = (typeof promptOrOptions === 'object' && promptOrOptions.max_tokens) || 2000;

    // Claude directly, or the model selected in Cherry Studio's gateway; '' = the configured model
    const anthropic = getClaudeClient();

    const message = await anthropic.messages.create({
      model: model || '',
      max_tokens: maxTokens,
      temperature: temperature,
      messages: [{ role: 'user', content: prompt }]
    }, { signal: abort.signal });

    return {
      success: true,
      data: messageText(message),
      usage: message.usage
    };
  } catch (error) {
    if (abort.signal.aborted) return { success: false, error: STOPPED_SENTENCE };
    console.error('Claude API error:', error);
    return { success: false, error: describeAIError(error) };
  } finally {
    release();
  }
});

// Claude API Streaming - Real-time token-by-token response. The same three guards; every
// failure, a refusal included, also goes to the renderer as an error chunk.
ipcMain.handle('claude-api-stream', async (event, options) => {
  const abort = new AbortController();
  const release = aiRequests.track(abort);
  const fail = (message) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('claude-stream-chunk', { error: message, type: 'error' });
    }
    return { success: false, error: message };
  };
  try {
    if (uiPrefs.aiOff === true) return fail(AI_OFF_SENTENCE);
    if (aiRequests.isLatched()) return fail(STOPPED_SENTENCE);
    const refused = refuseProtected(options);
    if (refused) return fail(refused);

    const {
      prompt,
      messages = [],
      model,
      temperature = 0.7,
      maxTokens = 4096,
      system = null
    } = options;

    const anthropic = getClaudeClient();

    // Build messages array
    const apiMessages = messages.length > 0
      ? messages
      : [{ role: 'user', content: prompt }];

    // Create streaming request ('' = the configured model)
    const streamParams = {
      model: model || '',
      max_tokens: maxTokens,
      temperature: temperature,
      messages: apiMessages
    };

    // Add system prompt if provided
    if (system) {
      streamParams.system = system;
    }

    const stream = anthropic.messages.stream(streamParams, { signal: abort.signal });

    // Send chunks as they arrive
    stream.on('text', (text) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('claude-stream-chunk', {
          text,
          type: 'text'
        });
      }
    });

    // Wait for completion
    const finalMessage = await stream.finalMessage();

    return {
      success: true,
      usage: finalMessage.usage,
      stopReason: finalMessage.stop_reason,
      model: finalMessage.model
    };
  } catch (error) {
    if (abort.signal.aborted) return fail(STOPPED_SENTENCE);
    console.error('Claude Stream API error:', error);
    return fail(describeAIError(error));
  } finally {
    release();
  }
});

// NOTE: Other AI providers (OpenAI, Grok, DeepSeek, Gemini) removed in v2.0.
// Models other than Claude are reached through the Cherry Studio gateway
// (see getClaudeClient above), not through separate provider handlers.

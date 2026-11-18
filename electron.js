const { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage, shell, nativeTheme } = require('electron');
const manuscript = require('./utils/manuscript');
const importFolder = require('./utils/importFolder');
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
    anthropicKey: process.env.ANTHROPIC_API_KEY || apiConfig.ANTHROPIC_API_KEY || ''
  };
}

// Settings as shown to the renderer: never includes key values
function publicAIProviderConfig() {
  const cfg = getAIProviderConfig();
  return {
    provider: cfg.provider,
    gatewayUrl: cfg.gatewayUrl,
    model: cfg.model,
    hasCherryKey: !!cfg.cherryKey,
    hasAnthropicKey: !!cfg.anthropicKey,
    providerFromEnv: !!process.env.FAUST_AI_PROVIDER
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

// Client for the selected provider. Throws a user-facing error if it is not configured.
function getClaudeClient() {
  const cfg = getAIProviderConfig();

  if (cfg.provider === 'cherry') {
    if (!cfg.cherryKey) {
      throw new Error('Cherry Studion API-avain puuttuu. Lisää se tietopaneelin Tekoäly-välilehdellä.');
    }
    if (!cfg.model) {
      throw new Error('Cherry Studion mallia ei ole valittu. Valitse malli tietopaneelin Tekoäly-välilehdellä.');
    }
    return createCherryClient({ apiKey: cfg.cherryKey, baseURL: cfg.gatewayUrl, model: cfg.model });
  }

  if (!cfg.anthropicKey) {
    throw new Error('Clauden API-avain puuttuu. Lisää se tietopaneelin Tekoäly-välilehdellä.');
  }
  return new Anthropic({ apiKey: cfg.anthropicKey });
}

// Turn SDK/network errors into messages that say what to do
function describeAIError(error) {
  const message = (error && error.message) || String(error);
  const cfg = getAIProviderConfig();
  if (cfg.provider !== 'cherry') return message;

  const status = error && error.status;
  if (status === 401 || status === 403) {
    return 'Cherry Studio hylkäsi API-avaimen. Kopioi avain Cherry Studiosta (Settings → API Gateway → API Key) ja tallenna se tietopaneelin Tekoäly-välilehdellä.';
  }
  if (!status && /connect|ECONNREFUSED|fetch failed|network/i.test(message)) {
    return `Cherry Studioon ei saada yhteyttä (${cfg.gatewayUrl}). Varmista, että Cherry Studio on käynnissä ja sen API Gateway päällä.`;
  }
  return message;
}

// --- UI prefs kept by the main process ---
// Panels and editor settings live in the renderer (localStorage). The theme lives there too;
// the renderer reports it ('theme-changed') and the copy kept here (uiPrefs.theme, 'NOX' or
// 'DEIS') is what the native layer and the window's first frame are painted from.
let uiPrefs = {
  spellCheck: true
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
    console.log('[UI Prefs] Loaded:', uiPrefs);
  } catch (error) {
    console.log('[UI Prefs] First run, using defaults');
  }
}

let uiPrefsSaving = Promise.resolve();
async function saveUiPrefs(next) {
  uiPrefs = { ...uiPrefs, ...next };
  // Saves run one after another and each writes atomically: two quick theme switches cannot tear the file
  const text = JSON.stringify(uiPrefs, null, 2);
  uiPrefsSaving = uiPrefsSaving.catch(() => {}).then(() => writeFileAtomic(getUiPrefsPath(), text));
  await uiPrefsSaving;
  console.log('[UI Prefs] Saved:', uiPrefs);
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

function createWindow() {
  rendererDirty = false;

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

// Ask before a window with unsaved changes closes (also covers Cmd+Q)
function attachCloseGuard(win) {
  win.on('close', (event) => {
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
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
}

app.on('before-quit', () => {
  quitRequested = true;
});

ipcMain.on('project:set-dirty', (_event, dirty) => {
  rendererDirty = !!dirty;
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
        { label: 'Valitse kaikki', role: 'selectAll' },
        separator,
        item('Etsi…', 'show-find', 'CmdOrCtrl+F'),
        item('Etsi seuraava', 'find-next', 'CmdOrCtrl+G'),
        item('Etsi edellinen', 'find-previous', 'CmdOrCtrl+Shift+G'),
        item('Etsi ja korvaa…', 'show-find-replace', 'CmdOrCtrl+Alt+F')
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
        { ...item('Liminal Engine (tekoälyavustaja)', 'toggle-ai-panel', 'CmdOrCtrl+Shift+K'), toolTip: 'Näytä tai kätke tekoälyavustajan paneeli' },
        item('Keskustelu', 'toggle-chat-window'),
        separator,
        item('Korttinäkymä', 'toggle-corkboard'),
        item('Jaettu näkymä', 'toggle-split-view'),
        item('Kirjanmerkit', 'toggle-bookmarks'),
        separator,
        item('Keskittymistila', 'toggle-focus-mode', 'CmdOrCtrl+Shift+F'),
        item('Kirjoituskonetila', 'toggle-typewriter'),
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
            await saveUiPrefs({ spellCheck: menuItem.checked });
            setSpellCheck(menuItem.checked);
          }
        },
        separator,
        item('Hahmot', 'show-characters'),
        item('Paikat', 'show-locations'),
        item('Juonilangat', 'show-threads'),
        item('Aikajana', 'show-timeline', 'CmdOrCtrl+Shift+T'),
        item('Tutkimuskansio', 'show-research', 'CmdOrCtrl+Shift+R'),
        separator,
        item('Suunnittele hahmot…', 'show-cast-plan'),
        item('Uusi hahmo…', 'show-character-builder'),
        item('Luvun versiot', 'show-version-history'),
        separator,
        {
          label: 'Tekoäly',
          submenu: [
            // The action items are one array, so that they can be left out as one
            // while the settings group below stays (reconcile R-4, R-6)
            ...[
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
              item('Muokkaa valintaa puhumalla', 'voice-edit')
            ],
            separator,
            item('Tekoälyasetukset…', 'show-ai-settings')
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

// Read a .txt, .md or .docx file as chapters. The renderer shows them in the
// import preview; nothing is written to the project here.
ipcMain.handle('import-document', async () => {
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

    const buffer = await fs.readFile(filePaths[0]);
    const imported = await manuscript.importDocument(buffer, filePaths[0]);
    return { success: true, kind: 'file', filePath: filePaths[0], name: path.basename(filePaths[0]).normalize('NFC'), ...imported };
  } catch (error) {
    console.error('[Import] Error:', error);
    return { success: false, error: error.message };
  }
});

// The folder last read by the import. The renderer may ask for one of its
// direct sub-folders by name, never for a path of its own.
let lastImportFolder = null;

// Read the .txt, .md and .docx files of a folder as chapters. Read only.
ipcMain.handle('import-folder', async (_event, request = {}) => {
  try {
    let folderPath;
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
    console.log('[Import folder]', source.chapters.length, 'files');
    return { success: true, ...source };
  } catch (error) {
    console.error('[Import folder] Error:', error.message);
    return { success: false, error: error.message };
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

// Load API Keys
ipcMain.handle('load-api-keys', async () => {
  return { success: true, keys: apiConfig };
});

// Save API Keys (v1.4.3: with encryption)
ipcMain.handle('save-api-keys', async (event, keys) => {
  try {
    const { encrypted } = await persistApiConfig(keys);
    return { success: true, encrypted };
  } catch (error) {
    console.error('[Security] Save API keys error:', error);
    return { success: false, error: error.message };
  }
});

// AI provider settings: Claude (Anthropic) or Cherry Studio gateway
ipcMain.handle('ai:get-provider', async () => {
  return { success: true, ...publicAIProviderConfig() };
});

ipcMain.handle('ai:set-provider', async (_event, next = {}) => {
  try {
    const updated = { ...apiConfig };
    if (next.provider === 'cherry' || next.provider === 'anthropic') {
      updated.AI_PROVIDER = next.provider;
    }
    if (typeof next.gatewayUrl === 'string' && next.gatewayUrl.trim()) {
      updated.CHERRY_GATEWAY_URL = next.gatewayUrl.trim();
    }
    if (typeof next.model === 'string') {
      updated.CHERRY_MODEL = next.model;
    }
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

// Send one short request through the selected provider
ipcMain.handle('ai:test-provider', async () => {
  try {
    const client = getClaudeClient();
    const started = Date.now();
    const message = await withTimeout(
      client.messages.create({
        model: 'claude-sonnet-4-20250514',
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

// Claude API (Anthropic SDK - REAL IMPLEMENTATION)
ipcMain.handle('claude-api', async (event, promptOrOptions) => {
  try {
    // Support both string prompt and { prompt, model, temperature, max_tokens } object
    const prompt = typeof promptOrOptions === 'string' ? promptOrOptions : promptOrOptions.prompt;
    const model = typeof promptOrOptions === 'object' ? promptOrOptions.model : null;
    const temperature = typeof promptOrOptions === 'object' ? promptOrOptions.temperature : 0.7;
    // The Messages API requires max_tokens: callers that pass an object without it get the default too
    const maxTokens = (typeof promptOrOptions === 'object' && promptOrOptions.max_tokens) || 2000;

    // Claude directly, or the model selected in Cherry Studio's gateway
    const anthropic = getClaudeClient();

    const message = await anthropic.messages.create({
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: maxTokens,
      temperature: temperature,
      messages: [{ role: 'user', content: prompt }]
    });

    return {
      success: true,
      data: messageText(message),
      usage: message.usage
    };
  } catch (error) {
    console.error('Claude API error:', error);
    return { success: false, error: describeAIError(error) };
  }
});

// Claude API Streaming - Real-time token-by-token response
ipcMain.handle('claude-api-stream', async (event, options) => {
  try {
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

    // Create streaming request
    const streamParams = {
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature: temperature,
      messages: apiMessages
    };

    // Add system prompt if provided
    if (system) {
      streamParams.system = system;
    }

    const stream = anthropic.messages.stream(streamParams);

    // Send chunks as they arrive
    stream.on('text', (text) => {
      event.sender.send('claude-stream-chunk', {
        text,
        type: 'text'
      });
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
    console.error('Claude Stream API error:', error);
    const message = describeAIError(error);
    event.sender.send('claude-stream-chunk', {
      error: message,
      type: 'error'
    });
    return { success: false, error: message };
  }
});

// Claude API with Extended Thinking - Deep analysis mode
ipcMain.handle('claude-api-thinking', async (event, options) => {
  try {
    const {
      prompt,
      messages = [],
      budgetTokens = 10000,
      maxTokens = 16000,
      stream = false
    } = options;

    // With the Cherry Studio gateway the "thinking" parameter is dropped and
    // the selected model decides on its own whether it reasons first
    const anthropic = getClaudeClient();

    // Build messages array
    const apiMessages = messages.length > 0
      ? messages
      : [{ role: 'user', content: prompt }];

    // Extended thinking requires specific model and settings
    const thinkingParams = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      thinking: {
        type: 'enabled',
        budget_tokens: budgetTokens
      },
      messages: apiMessages
    };

    if (stream) {
      // Streaming with extended thinking
      const streamResponse = anthropic.messages.stream(thinkingParams);

      streamResponse.on('contentBlockStart', (block) => {
        if (block.content_block?.type === 'thinking') {
          event.sender.send('claude-stream-chunk', {
            type: 'thinking_start'
          });
        }
      });

      streamResponse.on('text', (text, snapshot) => {
        // Check if this is thinking or text content
        const currentBlock = snapshot.content?.[snapshot.content.length - 1];
        const chunkType = currentBlock?.type === 'thinking' ? 'thinking' : 'text';

        event.sender.send('claude-stream-chunk', {
          text,
          type: chunkType
        });
      });

      const finalMessage = await streamResponse.finalMessage();

      // Extract thinking and text content
      const thinkingBlocks = finalMessage.content.filter(b => b.type === 'thinking');
      const textBlocks = finalMessage.content.filter(b => b.type === 'text');

      return {
        success: true,
        thinking: thinkingBlocks.map(b => b.thinking).join('\n'),
        response: textBlocks.map(b => b.text).join('\n'),
        usage: finalMessage.usage,
        stopReason: finalMessage.stop_reason
      };
    } else {
      // Non-streaming extended thinking
      const response = await anthropic.messages.create(thinkingParams);

      // Extract thinking and text content
      const thinkingBlocks = response.content.filter(b => b.type === 'thinking');
      const textBlocks = response.content.filter(b => b.type === 'text');

      return {
        success: true,
        thinking: thinkingBlocks.map(b => b.thinking).join('\n'),
        response: textBlocks.map(b => b.text).join('\n'),
        usage: response.usage,
        stopReason: response.stop_reason
      };
    }
  } catch (error) {
    console.error('Claude Thinking API error:', error);
    return { success: false, error: describeAIError(error) };
  }
});

// NOTE: Other AI providers (OpenAI, Grok, DeepSeek, Gemini) removed in v2.0.
// Models other than Claude are reached through the Cherry Studio gateway
// (see getClaudeClient above), not through separate provider handlers.

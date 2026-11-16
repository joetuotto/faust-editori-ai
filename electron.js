const { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage } = require('electron');
const { convertToRTF, convertToHTML, convertToDocx } = require("./utils/documentConverters");
const path = require('path');
const fs = require('fs').promises;

// Load environment variables
require('dotenv').config();

// Claude AI Client (exclusive AI provider for FAUST v2.0)
const Anthropic = require('@anthropic-ai/sdk');

// AI Modules (loaded lazily to avoid circular dependencies)
let StoryContinuityTracker, BatchProcessor, HybridWritingFlow, CostOptimizer;

function loadAIModules() {
  if (!StoryContinuityTracker) {
    StoryContinuityTracker = require('./modules/StoryContinuityTracker');
    BatchProcessor = require('./modules/BatchProcessor');
    HybridWritingFlow = require('./modules/HybridWritingFlow');
    CostOptimizer = require('./modules/CostOptimizer');
  }
}

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
      throw new Error('Cherry Studion yhdyskäytävän avain puuttuu. Mene Asetuksiin (Cmd+,) ja syötä avain.');
    }
    if (!cfg.model) {
      throw new Error('Cherry Studion mallia ei ole valittu. Mene Asetuksiin (Cmd+,) ja valitse malli.');
    }
    return createCherryClient({ apiKey: cfg.cherryKey, baseURL: cfg.gatewayUrl, model: cfg.model });
  }

  if (!cfg.anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY puuttuu. Mene Asetuksiin (Cmd+,) ja syötä avain, tai luo .env tiedosto.');
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
    return 'Cherry Studion yhdyskäytävä hylkäsi avaimen. Kopioi avain Cherry Studiosta (Settings → API Gateway → API Key) ja tallenna se FAUSTin asetuksiin.';
  }
  if (!status && /connect|ECONNREFUSED|fetch failed|network/i.test(message)) {
    return `Cherry Studion yhdyskäytävään ei saada yhteyttä (${cfg.gatewayUrl}). Varmista, että Cherry Studio on käynnissä ja API Gateway on päällä.`;
  }
  return message;
}

// --- v1.4.1: UI Prefs (persist theme/layout/modes) ---
let uiPrefs = {
  theme: 'NOX',            // 'NOX' | 'DEIS'
  newLayout: false,        // v1.4.0 feature flag
  focusMode: false,
  zenMode: false,
  inspectorVisible: false,  // default from Faust spec
  aiPanelVisible: false
};

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

async function saveUiPrefs(next) {
  uiPrefs = { ...uiPrefs, ...next };
  await fs.writeFile(getUiPrefsPath(), JSON.stringify(uiPrefs, null, 2), 'utf-8');
  console.log('[UI Prefs] Saved:', uiPrefs);
}

// --- v1.4.1: Timeout wrapper for AI calls ---
async function withTimeout(promise, ms = 30000) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout (${ms}ms)`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,           // v1.4.1: Enhanced security
      spellcheck: false,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 16 }
    // v1.4.1: Removed backgroundColor to allow theme CSS to control background
  });

  // Load production app
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  
  // Luo valikko
  createMenu();
}

// Luo macOS/Word-tyylinen valikko
function createMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    // App Menu (macOS)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { label: `Tietoja - ${app.name}`, role: 'about' },
        { type: 'separator' },
        { 
          label: 'Asetukset...',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('show-settings')
        },
        { type: 'separator' },
        { label: 'Piilota', role: 'hide' },
        { label: 'Piilota muut', role: 'hideOthers' },
        { label: 'Näytä kaikki', role: 'unhide' },
        { type: 'separator' },
        { label: 'Lopeta', role: 'quit' }
      ]
    }] : []),
    
    // File Menu
    {
      label: 'Tiedosto',
      submenu: [
        {
          label: 'Uusi projekti',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('new-project')
        },
        {
          label: 'Avaa projekti...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await loadProject();
            if (result.success) {
              mainWindow.webContents.send('load-project-data', result.data);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Tallenna',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('save-project-trigger')
        },
        {
          label: 'Tallenna nimellä...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('save-project-as-trigger')
        },
        { type: 'separator' },
        {
          label: 'Vie',
          submenu: [
            {
              label: 'Vie tekstitiedostona (.txt)',
              click: () => mainWindow.webContents.send('export-trigger', 'txt')
            },
            {
              label: 'Vie Markdown (.md)',
              click: () => mainWindow.webContents.send('export-trigger', 'md')
            },
            {
              label: 'Vie HTML',
              click: () => mainWindow.webContents.send('export-trigger', 'html')
            },
            {
              label: 'Vie RTF',
              click: () => mainWindow.webContents.send('export-trigger', 'rtf')
            },
            { type: 'separator' },
            {
              label: 'Vie PDF...',
              accelerator: 'CmdOrCtrl+P',
              click: () => mainWindow.webContents.send('export-pdf-trigger')
            },
            {
              label: 'Vie EPUB...',
              click: () => mainWindow.webContents.send('export-epub-trigger')
            },
            {
              label: 'Vie MOBI (Kindle)...',
              click: () => mainWindow.webContents.send('export-mobi-trigger')
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Sulje ikkuna',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        }
      ]
    },
    
    // Edit Menu
    {
      label: 'Muokkaa',
      submenu: [
        {
          label: 'Kumoa',
          accelerator: 'CmdOrCtrl+Z',
          click: () => mainWindow.webContents.send('undo')
        },
        {
          label: 'Tee uudelleen',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => mainWindow.webContents.send('redo')
        },
        { type: 'separator' },
        { label: 'Leikkaa', role: 'cut' },
        { label: 'Kopioi', role: 'copy' },
        { label: 'Liitä', role: 'paste' },
        { label: 'Valitse kaikki', role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Etsi...',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow.webContents.send('show-find')
        },
        {
          label: 'Etsi seuraava',
          accelerator: 'CmdOrCtrl+G',
          click: () => mainWindow.webContents.send('find-next')
        },
        {
          label: 'Etsi ja korvaa...',
          accelerator: 'CmdOrCtrl+Alt+F',
          click: () => mainWindow.webContents.send('show-find-replace')
        }
      ]
    },
    
    // View Menu (v1.4.1: synced with uiPrefs)
    {
      label: 'Näytä',
      submenu: [
        // Paneelit
        {
          label: 'Sivupalkki',
          accelerator: 'CmdOrCtrl+1',
          type: 'checkbox',
          checked: true,
          click: () => mainWindow.webContents.send('toggle-sidebar')
        },
        {
          label: 'Inspector',
          accelerator: 'CmdOrCtrl+2',
          type: 'checkbox',
          checked: !!uiPrefs?.inspectorVisible,
          click: () => mainWindow.webContents.send('toggle-inspector')
        },
        {
          label: 'AI-paneeli',
          accelerator: 'CmdOrCtrl+3',
          type: 'checkbox',
          checked: !!uiPrefs?.aiPanelVisible,
          click: () => mainWindow.webContents.send('toggle-ai-panel')
        },
        { type: 'separator' },
        // Kirjoitustilat
        {
          label: 'Focus Mode',
          accelerator: 'CmdOrCtrl+Shift+F',
          type: 'checkbox',
          checked: uiPrefs.focusMode,
          click: async (item) => {
            await saveUiPrefs({
              focusMode: item.checked,
              zenMode: item.checked ? false : uiPrefs.zenMode
            });
            mainWindow.webContents.send('ui-prefs-changed', uiPrefs);
          }
        },
        {
          label: 'Zen Mode',
          accelerator: 'CmdOrCtrl+Shift+Z',
          type: 'checkbox',
          checked: uiPrefs.zenMode,
          click: async (item) => {
            await saveUiPrefs({
              zenMode: item.checked,
              focusMode: item.checked ? false : uiPrefs.focusMode
            });
            mainWindow.webContents.send('ui-prefs-changed', uiPrefs);
          }
        },
        { type: 'separator' },
        // Projektin näkymät
        {
          label: 'Aikajana',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => mainWindow.webContents.send('show-timeline')
        },
        {
          label: 'Tutkimuskansio',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow.webContents.send('show-research')
        },
        { type: 'separator' },
        // Ulkoasu
        {
          label: 'Teema',
          submenu: [
            {
              label: 'NOX (tumma)',
              type: 'radio',
              checked: uiPrefs.theme === 'NOX',
              click: async () => {
                await saveUiPrefs({ theme: 'NOX' });
                mainWindow.webContents.send('ui-prefs-changed', uiPrefs);
              }
            },
            {
              label: 'DEIS (valoisa)',
              type: 'radio',
              checked: uiPrefs.theme === 'DEIS',
              click: async () => {
                await saveUiPrefs({ theme: 'DEIS' });
                mainWindow.webContents.send('ui-prefs-changed', uiPrefs);
              }
            }
          ]
        },
        {
          label: 'Keskitetty layout',
          type: 'checkbox',
          checked: uiPrefs.newLayout,
          click: async (item) => {
            await saveUiPrefs({ newLayout: item.checked });
            mainWindow.webContents.send('ui-prefs-changed', uiPrefs);
          }
        },
        { type: 'separator' },
        {
          label: 'Koko näyttö',
          accelerator: isMac ? 'Ctrl+Command+F' : 'F11',
          role: 'togglefullscreen'
        },
        { type: 'separator' },
        {
          label: 'Kehittäjätyökalut',
          accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: () => mainWindow.webContents.toggleDevTools()
        }
      ]
    },
    
    // Insert Menu
    {
      label: 'Lisää',
      submenu: [
        {
          label: 'Uusi luku',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('new-chapter')
        },
        { type: 'separator' },
        {
          label: 'Päivämäärä',
          click: () => {
            const now = new Date();
            const dateStr = now.toLocaleDateString('fi-FI');
            mainWindow.webContents.send('insert-text', dateStr);
          }
        },
        {
          label: 'Kohtauksen erotin',
          click: () => {
            mainWindow.webContents.send('insert-text', '\n\n* * *\n\n');
          }
        }
      ]
    },
    
    // Text Menu (replaces Format - FAUST uses plain text)
    {
      label: 'Teksti',
      submenu: [
        {
          label: 'Muunna isoiksi kirjaimiksi',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: () => mainWindow.webContents.send('text-uppercase')
        },
        {
          label: 'Muunna pieniksi kirjaimiksi',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => mainWindow.webContents.send('text-lowercase')
        },
        { type: 'separator' },
        {
          label: 'Poista ylimääräiset välit',
          click: () => mainWindow.webContents.send('text-trim-spaces')
        },
        {
          label: 'Poista tyhjät rivit',
          click: () => mainWindow.webContents.send('text-remove-empty-lines')
        }
      ]
    },
    
    // Tools Menu
    {
      label: 'Työkalut',
      submenu: [
        {
          label: 'Projektin tilastot',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('show-project-stats')
        },
        {
          label: 'Kirjoitustavoitteet...',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => mainWindow.webContents.send('show-target-settings')
        },
        { type: 'separator' },
        {
          label: 'Oikoluku',
          click: () => mainWindow.webContents.send('spell-check')
        },
        { type: 'separator' },
        {
          label: 'Asetukset...',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('show-settings')
        }
      ]
    },
    
    // Window Menu
    {
      label: 'Ikkuna',
      submenu: [
        { label: 'Pienennä', role: 'minimize' },
        { label: 'Suurenna', role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { label: 'Tuo etualalle', role: 'front' },
          { type: 'separator' },
          { label: 'Ikkuna', role: 'window' }
        ] : [
          { label: 'Sulje', role: 'close' }
        ])
      ]
    },
    
    // Help Menu
    {
      label: 'Apua',
      submenu: [
        {
          label: 'Dokumentaatio',
          click: () => mainWindow.webContents.send('show-help')
        },
        {
          label: 'Pikaohjeet',
          accelerator: 'CmdOrCtrl+?',
          click: () => mainWindow.webContents.send('show-shortcuts')
        },
        { type: 'separator' },
        {
          label: 'Ilmoita ongelmasta',
          click: () => {
            require('electron').shell.openExternal('https://github.com/yourusername/kirjoitusstudio/issues');
          }
        },
        ...(!isMac ? [
          { type: 'separator' },
          {
            label: 'Tietoja',
            click: () => mainWindow.webContents.send('show-about')
          }
        ] : [])
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Helper: Load project
async function loadProject() {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Avaa projekti',
      filters: [{ name: 'Kirjoitusstudio projektit', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (filePaths && filePaths[0]) {
      const data = await fs.readFile(filePaths[0], 'utf-8');
      return { success: true, data: JSON.parse(data) };
    }
    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

app.whenReady().then(async () => {
  await loadApiConfig();
  await loadUiPrefs();  // v1.4.1: Load UI preferences
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
ipcMain.handle('save-project', async (event, projectData) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Tallenna projekti',
      defaultPath: `${projectData.title || 'projekti'}.faust`,
      filters: [
        { name: 'FAUST projektit', extensions: ['faust'] },
        { name: 'JSON (legacy)', extensions: ['json'] }
      ]
    });

    if (filePath) {
      // Add metadata
      const dataWithMeta = {
        ...projectData,
        modified: new Date().toISOString(),
        version: '2.0'  // FAUST v2.0 format
      };

      await fs.writeFile(filePath, JSON.stringify(dataWithMeta, null, 2), 'utf-8');
      return { success: true, path: filePath };
    }
    return { success: false };
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
      filters: [
        { name: 'FAUST projektit', extensions: ['faust', 'json'] }
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
      return { success: false, error: 'No file path provided' };
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
      return { success: false, error: 'No file path' };
    }

    // Add metadata
    const dataWithMeta = {
      ...projectData,
      modified: new Date().toISOString()
    };

    await fs.writeFile(filePath, JSON.stringify(dataWithMeta, null, 2), 'utf-8');
    return { success: true, path: filePath };
  } catch (error) {
    console.error('[Autosave] Error:', error);
    return { success: false, error: error.message };
  }
});

// Vie dokumentti
ipcMain.handle('export-document', async (event, { content, title, format }) => {
  try {
    const filters = {
      txt: { name: 'Tekstitiedosto', extensions: ['txt'] },
      md: { name: 'Markdown', extensions: ['md'] },
      rtf: { name: 'Rich Text Format', extensions: ['rtf'] },
      html: { name: 'HTML', extensions: ['html'] },
      docx: { name: 'Word Document', extensions: ['docx'] }
    };

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Vie dokumentti',
      defaultPath: `${title}.${format}`,
      filters: [filters[format]]
    });

    if (!filePath) return { success: false };

    if (format === 'docx') {
      const buffer = await convertToDocx(content, title);
      await fs.writeFile(filePath, buffer);
    } else {
      let fileContent = content;

      if (format === 'rtf') {
        fileContent = convertToRTF(content);
      } else if (format === 'html') {
        fileContent = convertToHTML(content, title);
      }

      await fs.writeFile(filePath, fileContent, 'utf-8');
    }
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Vie koko projekti
ipcMain.handle('export-full-project', async (event, { project, format }) => {
  try {
    const filters = {
      txt: { name: 'Tekstitiedosto', extensions: ['txt'] },
      md: { name: 'Markdown', extensions: ['md'] },
      rtf: { name: 'Rich Text Format', extensions: ['rtf'] },
      html: { name: 'HTML', extensions: ['html'] }
    };

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Vie koko projekti',
      defaultPath: `${project.title}.${format}`,
      filters: [filters[format]]
    });

    if (!filePath) return { success: false };

    let fullContent = '';

    const collectContent = (items, level = 0) => {
      items.forEach(item => {
        if (item.type === 'chapter' && item.content) {
          if (format === 'md') {
            fullContent += `${'#'.repeat(level + 1)} ${item.title}\n\n${item.content}\n\n`;
          } else if (format === 'html') {
            fullContent += `<h${level + 1}>${item.title}</h${level + 1}>\n${item.content.split('\n').map(p => `<p>${p}</p>`).join('\n')}\n\n`;
          } else {
            fullContent += `${item.title}\n${'='.repeat(item.title.length)}\n\n${item.content}\n\n`;
          }
        }
        if (item.children) {
          collectContent(item.children, level + 1);
        }
      });
    };

    collectContent(project.items);

    let fileContent = fullContent;

    if (format === 'rtf') {
      fileContent = convertToRTF(fullContent);
    } else if (format === 'html') {
      fileContent = convertToHTML(fullContent, project.title);
    }

    await fs.writeFile(filePath, fileContent, 'utf-8');
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Vie PDF (v1.4.1: improved cleanup & pageRanges)
ipcMain.handle('export-pdf', async (event, { html, title }) => {
  let pdfWindow;
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Vie PDF',
      defaultPath: `${title}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (!filePath) return { success: false };

    pdfWindow = new BrowserWindow({ show: false });
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const pdfData = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 2,
        bottom: 2,
        left: 2,
        right: 2
      },
      pageRanges: '1-'  // v1.4.1: deterministic output
    });

    await fs.writeFile(filePath, pdfData);
    
    // v1.4.1: Safe cleanup
    if (pdfWindow && !pdfWindow.isDestroyed()) {
      pdfWindow.close();
    }

    return { success: true, path: filePath };
  } catch (error) {
    console.error('[PDF Export] Error:', error);
    // v1.4.1: Cleanup on error
    if (pdfWindow && !pdfWindow.isDestroyed()) {
      pdfWindow.close();
    }
    return { 
      success: false, 
      error: error.message,
      errorTitle: 'PDF-vienti epäonnistui',
      errorHint: 'Tarkista että tiedostopolku on kirjoitettavissa.'
    };
  }
});

// Export EPUB (Simple HTML-based version)
ipcMain.handle('export-epub', async (event, { metadata, chapters }) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Vie EPUB',
      defaultPath: `${metadata.title}.epub`,
      filters: [{ name: 'EPUB E-Book', extensions: ['epub'] }]
    });

    if (!filePath) return { success: false };

    // Generate simple HTML-based EPUB content
    let html = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${metadata.language}">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <title>${metadata.title}</title>
  <meta name="author" content="${metadata.author}"/>
  <meta name="generator" content="FAUST Writer"/>
  <style type="text/css">
    body {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 1.1em;
      line-height: 1.6;
      text-align: justify;
      margin: 2em;
    }
    h1.title-page {
      font-size: 2.5em;
      text-align: center;
      margin: 4em 0 2em 0;
      page-break-after: always;
    }
    .author {
      text-align: center;
      font-size: 1.3em;
      font-style: italic;
      margin-bottom: 4em;
    }
    h1.chapter {
      font-size: 1.8em;
      text-align: center;
      margin: 3em 0 2em 0;
      page-break-before: always;
    }
    p {
      margin: 0.8em 0;
      text-indent: 1.5em;
    }
    p:first-of-type {
      text-indent: 0;
    }
  </style>
</head>
<body>
  <h1 class="title-page">${metadata.title}</h1>
  <p class="author">${metadata.author}</p>
`;

    // Add chapters
    chapters.forEach(chapter => {
      html += `\n  <h1 class="chapter">${chapter.title}</h1>\n`;

      // Split content into paragraphs
      const paragraphs = chapter.content.split('\n\n').filter(p => p.trim());
      paragraphs.forEach(p => {
        const formatted = p.replace(/\n/g, ' ').trim();
        html += `  <p>${formatted}</p>\n`;
      });
    });

    html += `</body>\n</html>`;

    // Write file (Note: This is a simplified EPUB - a single HTML file)
    // A proper EPUB would require ZIP packaging with container.xml, content.opf, etc.
    // This MVP version can be opened in most e-readers or converted with Calibre
    await fs.writeFile(filePath, html, 'utf-8');

    console.log('[EPUB Export] Created simple EPUB at:', filePath);
    return { success: true, path: filePath };

  } catch (error) {
    console.error('[EPUB Export] Error:', error);
    return {
      success: false,
      error: error.message,
      errorTitle: 'EPUB-vienti epäonnistui',
      errorHint: 'Tarkista että tiedostopolku on kirjoitettavissa.'
    };
  }
});

// MOBI Export (Kindle format)
ipcMain.handle('export-mobi', async (event, { metadata, chapters }) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Vie MOBI (Kindle)',
      defaultPath: `${metadata.title}.mobi`,
      filters: [{ name: 'Kindle E-Book', extensions: ['mobi'] }]
    });

    if (!filePath) return { success: false };

    // Generate simple HTML-based MOBI content
    // MOBI format is similar to EPUB - this MVP version works with most Kindle readers
    // and can be converted to proper MOBI format with Amazon Kindle Previewer or Calibre
    let html = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${metadata.language}">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <title>${metadata.title}</title>
  <meta name="author" content="${metadata.author}"/>
  <meta name="generator" content="FAUST Writer"/>
  <style type="text/css">
    body {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 1.1em;
      line-height: 1.6;
      text-align: justify;
      margin: 2em;
    }
    h1.title-page {
      font-size: 2.5em;
      text-align: center;
      margin: 4em 0 2em 0;
      page-break-after: always;
    }
    .author {
      text-align: center;
      font-size: 1.3em;
      font-style: italic;
      margin-bottom: 4em;
    }
    h1.chapter {
      font-size: 1.8em;
      text-align: center;
      margin: 3em 0 2em 0;
      page-break-before: always;
    }
    p {
      margin: 0.8em 0;
      text-indent: 1.5em;
    }
    p:first-of-type {
      text-indent: 0;
    }
  </style>
</head>
<body>
  <h1 class="title-page">${metadata.title}</h1>
  <p class="author">${metadata.author}</p>
`;

    // Add chapters
    chapters.forEach(chapter => {
      html += `\n  <h1 class="chapter">${chapter.title}</h1>\n`;

      // Split content into paragraphs
      const paragraphs = chapter.content.split('\n\n').filter(p => p.trim());
      paragraphs.forEach(p => {
        const formatted = p.replace(/\n/g, ' ').trim();
        html += `  <p>${formatted}</p>\n`;
      });
    });

    html += `</body>\n</html>`;

    // Write file (Note: This is a simplified MOBI - a single HTML file)
    // A proper MOBI would require Amazon's KindleGen or similar tool
    // This MVP version can be opened in Kindle apps or converted with Calibre
    await fs.writeFile(filePath, html, 'utf-8');

    console.log('[MOBI Export] Created simple MOBI at:', filePath);
    return { success: true, path: filePath };

  } catch (error) {
    console.error('[MOBI Export] Error:', error);
    return {
      success: false,
      error: error.message,
      errorTitle: 'MOBI-vienti epäonnistui',
      errorHint: 'Tarkista että tiedostopolku on kirjoitettavissa.'
    };
  }
});

// Document conversion functions are now imported from utils/documentConverters.js

// Web Search API
ipcMain.handle('web-search', async (event, query) => {
  try {
    // Käytetään yksinkertaista mock-hakua kehitykseen
    // Todellisessa toteutuksessa käyttäisi jotain web search API:ta
    const mockResults = {
      facts: {
        history: `Mock-historian tiedot paikasta: ${query}`,
        architecture: ["betoni", "lasi", "moderni"],
        features: ["metroasema", "kauppakeskus", "liikennekeskus"],
        atmosphere: ["vilkas", "kiireinen", "urbaani"]
      },
      visual: {
        colors_day: ["harmaa", "valkoinen", "sininen"],
        colors_night: ["musta", "neon", "keltainen"],
        lighting: ["keinovalot", "liikennevalot", "neon"],
        textures: ["sileä betoni", "lasi", "asfaltti"]
      },
      writing_tips: [
        "Käytä betonin tekstuuria symbolina kylmyydestä",
        "Neonvalot voivat luoda klaustrofobisen tunnelman",
        "Väkijoukon äänet korostavat yksinäisyyttä"
      ]
    };

    return { success: true, data: mockResults };
  } catch (error) {
    return { success: false, error: error.message };
  }
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
    return { success: false, error: 'Cherry Studion yhdyskäytävän avain puuttuu.' };
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
      return { success: false, error: `Yhdyskäytävä vastasi virheellä ${response.status}.` };
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
      error: `Cherry Studion yhdyskäytävään ei saada yhteyttä (${cfg.gatewayUrl}). Varmista, että Cherry Studio on käynnissä ja API Gateway on päällä.`
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

// v1.4.1: UI Preferences IPC
ipcMain.handle('ui:get-prefs', async () => {
  return { success: true, data: uiPrefs };
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

ipcMain.handle('ui:set-prefs', async (_event, next) => {
  try {
    await saveUiPrefs(next);
    // Notify renderer of changes
    mainWindow?.webContents.send('ui-prefs-changed', uiPrefs);
    return { success: true, data: uiPrefs };
  } catch (error) {
    console.error('[UI Prefs] Save error:', error);
    return { success: false, error: error.message };
  }
});

// v1.4.1: Spec Runner (internal end-to-end test)
ipcMain.handle('spec:run', async (_event, scenario = 'default') => {
  console.log(`[Spec Runner] Starting scenario: ${scenario}`);
  return new Promise((resolve) => {
    const id = Date.now();
    const timeout = setTimeout(() => {
      console.error('[Spec Runner] Timeout after 45s');
      resolve({ ok: false, error: 'spec-timeout', id, scenario });
    }, 45000);

    function onDone(_ev, payload) {
      if (payload?.id !== id) return;
      clearTimeout(timeout);
      mainWindow.webContents.removeListener('spec:done', onDone);
      console.log('[Spec Runner] Completed:', payload.result);
      resolve(payload.result);
    }

    mainWindow.webContents.on('spec:done', onDone);
    mainWindow.webContents.send('spec:start', { id, scenario });
  });
});

// After save-api-keys
ipcMain.handle('save-backup', async (event, project) => {
  const backupPath = path.join(app.getPath('userData'), 'backup.json');
  await fs.writeFile(backupPath, JSON.stringify(project, null, 2), 'utf-8');
  return { success: true };
});

ipcMain.handle('load-backup', async () => {
  try {
    const backupPath = path.join(app.getPath('userData'), 'backup.json');
    const data = await fs.readFile(backupPath, 'utf-8');
    return { success: true, data: JSON.parse(data) };
  } catch (error) {
    return { success: false };
  }
});

// Claude API (Anthropic SDK - REAL IMPLEMENTATION)
ipcMain.handle('claude-api', async (event, promptOrOptions) => {
  try {
    // Support both string prompt and { prompt, model, temperature, max_tokens } object
    const prompt = typeof promptOrOptions === 'string' ? promptOrOptions : promptOrOptions.prompt;
    const model = typeof promptOrOptions === 'object' ? promptOrOptions.model : null;
    const temperature = typeof promptOrOptions === 'object' ? promptOrOptions.temperature : 0.7;
    const maxTokens = typeof promptOrOptions === 'object' ? promptOrOptions.max_tokens : 2000;

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

// Add after export handlers or before AI APIs
ipcMain.on('show-context-menu', async (event, { x, y, selection, isEditable }) => {
  const { Menu } = require('electron');
  const template = [
    {
      label: 'Kopioi',
      accelerator: 'CmdOrCtrl+C',
      click: () => {
        // Renderer handles copy
      }
    },
    {
      label: 'Liitä',
      accelerator: 'CmdOrCtrl+V',
      click: () => {
        // Renderer handles paste
      }
    },
    { type: 'separator' },
    {
      label: 'AI-ehdotus valitulle tekstille',
      enabled: !!selection,
      click: () => {
        mainWindow.webContents.send('ai-suggest', selection);
      }
    },
    {
      label: 'Etsi',
      click: () => {
        mainWindow.webContents.send('show-find');
      }
    },
    { type: 'separator' },
    {
      label: 'Lisää kommentti',
      click: () => {
        mainWindow.webContents.send('insert-comment');
      }
    },
    {
      label: 'Lisää muistiinpano',
      click: () => {
        mainWindow.webContents.send('insert-note');
      }
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow, x, y });
});

// ============================================
// AI MODULES - Story Generation & Continuity
// ============================================

// getClaudeClient() is defined near the top of this file (AI PROVIDER section)

// Generate chapter content with Claude AI
ipcMain.handle('ai:generate-chapter', async (event, { chapterId, project, mode = 'production' }) => {
  try {
    // Load AI modules lazily
    loadAIModules();

    console.log('[AI Generate] Chapter:', chapterId, 'Mode:', mode);

    // Get Claude client
    const claudeClient = getClaudeClient();

    // Configure modules
    StoryContinuityTracker.configure({
      deepseekClient: null,
      getProject: () => project
    });

    HybridWritingFlow.configure({
      claudeClient: claudeClient,
      getProject: () => project
    });

    // Get chapter
    const chapter = project.structure.find(ch => ch.id === chapterId);
    if (!chapter) {
      return { success: false, error: 'Chapter not found' };
    }

    // Get mode settings
    const modeConfig = project.ai?.modes?.[mode] || project.ai?.modes?.production || {
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt: 'Write coherently following the outline and story consistency.'
    };

    // Check continuity before writing
    const continuityCheck = await StoryContinuityTracker.checkContinuityBeforeWriting(
      chapter.order,
      chapter.synopsis || 'No synopsis provided'
    );

    // Build prompt
    const prompt = `You are writing Chapter ${chapter.order + 1}: "${chapter.title}"

PROJECT INFO:
- Title: ${project.title}
- Genre: ${project.genre}
- Target: ${project.targets.totalWords} words

CHAPTER BRIEF:
${chapter.synopsis || 'No synopsis provided'}

CONTINUITY CONTEXT:
${continuityCheck.suggestions?.join('\n') || 'No specific continuity requirements'}

INSTRUCTIONS:
${modeConfig.systemPrompt}

Write the chapter content (aim for ${Math.floor(project.targets.totalWords / project.structure.length)} words).

Return ONLY the chapter text, no meta-commentary.`;

    console.log('[AI Generate] Calling Claude API...');

    // Generate with Claude
    const modelName = project.ai?.model || 'claude-sonnet-4-20250514';
    const message = await claudeClient.messages.create({
      model: modelName,
      max_tokens: modeConfig.maxTokens,
      temperature: modeConfig.temperature,
      messages: [{ role: 'user', content: prompt }]
    });

    const generatedContent = messageText(message);
    const usage = message.usage;

    // Update continuity tracker
    await StoryContinuityTracker.updateMemory(chapter.order, generatedContent);

    console.log('[AI Generate] Success! Generated', generatedContent.length, 'characters');

    return {
      success: true,
      content: generatedContent,
      wordCount: generatedContent.trim().split(/\s+/).length,
      usage,
      continuityCheck
    };

  } catch (error) {
    console.error('[AI Generate] Error:', error);
    return { success: false, error: error.message };
  }
});

// Check continuity for a chapter
ipcMain.handle('ai:check-continuity', async (event, { chapterId, content, project }) => {
  try {
    console.log('[AI Continuity] Checking chapter:', chapterId);

    StoryContinuityTracker.configure({
      deepseekClient: null,
      getProject: () => project
    });

    const chapter = project.structure.find(ch => ch.id === chapterId);
    if (!chapter) {
      return { success: false, error: 'Chapter not found' };
    }

    const result = await StoryContinuityTracker.checkContinuityBeforeWriting(
      chapter.order,
      content || chapter.content
    );

    return { success: true, ...result };

  } catch (error) {
    console.error('[AI Continuity] Error:', error);
    return { success: false, error: error.message };
  }
});

// Batch process multiple chapters with Claude
ipcMain.handle('ai:batch-process', async (event, { project, operation = 'continuityCheck', options = {} }) => {
  try {
    console.log('[AI Batch] Starting:', operation);

    const claudeClient = getClaudeClient();

    // Configure modules
    StoryContinuityTracker.configure({
      deepseekClient: null,
      getProject: () => project
    });

    BatchProcessor.configure({
      getProject: () => project,
      setProject: () => {}, // Read-only for now
      onProgress: (progress) => {
        console.log('[AI Batch] Progress:', progress);
        // Send progress to renderer
        event.sender.send('batch-progress', {
          current: progress.current || 0,
          total: progress.total || 0,
          chapter: progress.chapter || '',
          message: progress.message || `Käsitellään ${progress.current}/${progress.total}...`,
          percentage: progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
        });
      }
    });

    HybridWritingFlow.configure({
      claudeClient: claudeClient,
      getProject: () => project
    });

    const result = await BatchProcessor.processFullNovel({
      operation,
      ...options
    });

    console.log('[AI Batch] Complete:', result.processed, 'chapters');

    return { success: true, ...result };

  } catch (error) {
    console.error('[AI Batch] Error:', error);
    return { success: false, error: error.message };
  }
});

// Export functions for testing
// Note: Exports commented out as this is the main Electron process file
// module.exports = {
//   convertToRTF,
//   convertToHTML,
//   convertToDocx
// };

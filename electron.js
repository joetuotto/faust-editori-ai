const { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage } = require('electron');
const { convertToRTF, convertToHTML, convertToDocx } = require("./utils/documentConverters");
const path = require('path');
const fs = require('fs').promises;

// Load environment variables
require('dotenv').config();

// AI API Clients
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
        {
          label: 'Sivupalkki',
          accelerator: 'CmdOrCtrl+Shift+B',
          type: 'checkbox',
          checked: true,
          click: () => mainWindow.webContents.send('toggle-sidebar')
        },
        {
          label: 'Inspector',
          accelerator: 'CmdOrCtrl+Alt+I',
          type: 'checkbox',
          checked: !!uiPrefs?.inspectorVisible,
          click: () => mainWindow.webContents.send('toggle-inspector')
        },
        {
          label: 'AI-Avustajat',
          accelerator: 'CmdOrCtrl+Alt+A',
          type: 'checkbox',
          checked: !!uiPrefs?.aiPanelVisible,
          click: () => mainWindow.webContents.send('toggle-ai-panel')
        },
        { type: 'separator' },
        {
          label: 'Uusi layout (paperi keskellä)',
          type: 'checkbox',
          checked: uiPrefs.newLayout,
          click: async (item) => {
            await saveUiPrefs({ newLayout: item.checked });
            mainWindow.webContents.send('ui-prefs-changed', uiPrefs);
          }
        },
        {
          label: 'Teema: DEIS (valoisa)',
          type: 'checkbox',
          checked: uiPrefs.theme === 'DEIS',
          click: async (item) => {
            await saveUiPrefs({ theme: item.checked ? 'DEIS' : 'NOX' });
            mainWindow.webContents.send('ui-prefs-changed', uiPrefs);
          }
        },
        { type: 'separator' },
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
          accelerator: 'CmdOrCtrl+Enter',
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
          accelerator: 'CmdOrCtrl+Alt+N',
          click: () => mainWindow.webContents.send('new-chapter')
        },
        {
          label: 'Uusi kohtaus',
          accelerator: 'CmdOrCtrl+Alt+S',
          click: () => mainWindow.webContents.send('new-scene')
        },
        { type: 'separator' },
        {
          label: 'Kommentti',
          accelerator: 'CmdOrCtrl+Alt+C',
          click: () => mainWindow.webContents.send('insert-comment')
        },
        {
          label: 'Muistiinpano',
          accelerator: 'CmdOrCtrl+Alt+M',
          click: () => mainWindow.webContents.send('insert-note')
        },
        { type: 'separator' },
        {
          label: 'Päivämäärä ja aika',
          accelerator: 'CmdOrCtrl+Alt+D',
          click: () => {
            const now = new Date();
            const dateStr = now.toLocaleDateString('fi-FI') + ' ' + now.toLocaleTimeString('fi-FI');
            mainWindow.webContents.send('insert-text', dateStr);
          }
        }
      ]
    },
    
    // Format Menu
    {
      label: 'Muotoilu',
      submenu: [
        {
          label: 'Lihavointi',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow.webContents.send('format-bold')
        },
        {
          label: 'Kursivointi',
          accelerator: 'CmdOrCtrl+I',
          click: () => mainWindow.webContents.send('format-italic')
        },
        {
          label: 'Alleviivaus',
          accelerator: 'CmdOrCtrl+U',
          click: () => mainWindow.webContents.send('format-underline')
        },
        { type: 'separator' },
        {
          label: 'Otsikko 1',
          accelerator: 'CmdOrCtrl+Alt+1',
          click: () => mainWindow.webContents.send('format-heading', 1)
        },
        {
          label: 'Otsikko 2',
          accelerator: 'CmdOrCtrl+Alt+2',
          click: () => mainWindow.webContents.send('format-heading', 2)
        },
        {
          label: 'Otsikko 3',
          accelerator: 'CmdOrCtrl+Alt+3',
          click: () => mainWindow.webContents.send('format-heading', 3)
        },
        { type: 'separator' },
        {
          label: 'Lainaus',
          accelerator: 'CmdOrCtrl+Shift+Q',
          click: () => mainWindow.webContents.send('format-quote')
        },
        {
          label: 'Luettelo',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => mainWindow.webContents.send('format-list')
        }
      ]
    },
    
    // Tools Menu
    {
      label: 'Työkalut',
      submenu: [
        {
          label: 'Sanamäärä',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => mainWindow.webContents.send('show-word-count')
        },
        {
          label: 'Tavoitteen asetus',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => mainWindow.webContents.send('show-target-settings')
        },
        { type: 'separator' },
        {
          label: 'Oikoluku',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => mainWindow.webContents.send('spell-check')
        },
        { type: 'separator' },
        {
          label: 'Projektin statistiikka',
          click: () => mainWindow.webContents.send('show-project-stats')
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

// Tallenna projekti
ipcMain.handle('save-project', async (event, projectData) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Tallenna projekti',
      defaultPath: 'projekti.json',
      filters: [{ name: 'Kirjoitusstudio projektit', extensions: ['json'] }]
    });

    if (filePath) {
      await fs.writeFile(filePath, JSON.stringify(projectData, null, 2), 'utf-8');
      return { success: true, path: filePath };
    }
    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Lataa projekti
ipcMain.handle('load-project', async () => {
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
  return apiConfig;
});

// Save API Keys (v1.4.3: with encryption)
ipcMain.handle('save-api-keys', async (event, keys) => {
  try {
    let config;

    // Try to encrypt if available
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
    return { success: true, encrypted: safeStorage.isEncryptionAvailable() };
  } catch (error) {
    console.error('[Security] Save API keys error:', error);
    return { success: false, error: error.message };
  }
});

// v1.4.1: UI Preferences IPC
ipcMain.handle('ui:get-prefs', async () => {
  return { success: true, data: uiPrefs };
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
ipcMain.handle('claude-api', async (event, prompt) => {
  try {
    let apiKey = process.env.ANTHROPIC_API_KEY || apiConfig.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        error: 'ANTHROPIC_API_KEY puuttuu. Mene Asetuksiin (Cmd+,) ja syötä avain, tai luo .env tiedosto.'
      };
    }

    const anthropic = new Anthropic({ apiKey });
    
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022', // Latest model
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    return { 
      success: true, 
      data: message.content[0].text,
      usage: message.usage 
    };
  } catch (error) {
    console.error('Claude API error:', error);
    return { success: false, error: error.message };
  }
});

// Grok API (xAI)
ipcMain.handle('grok-api', async (event, prompt) => {
  try {
    let apiKey = process.env.GROK_API_KEY || apiConfig.GROK_API_KEY || 'your-grok-api-key-here';

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "grok-beta",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Grok API error: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data: data.choices[0].message.content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// OpenAI API (SDK - REAL IMPLEMENTATION)
ipcMain.handle('openai-api', async (event, prompt) => {
  try {
    let apiKey = process.env.OPENAI_API_KEY || apiConfig.OPENAI_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        error: 'OPENAI_API_KEY puuttuu. Mene Asetuksiin (Cmd+,) ja syötä avain, tai luo .env tiedosto.'
      };
    }

    const openai = new OpenAI({ apiKey });
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview', // or 'gpt-4', 'gpt-3.5-turbo'
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.7
    });

    return { 
      success: true, 
      data: completion.choices[0].message.content,
      usage: completion.usage
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    return { success: false, error: error.message };
  }
});

// Google Gemini API (SDK - REAL IMPLEMENTATION)
ipcMain.handle('gemini-api', async (event, prompt) => {
  try {
    let apiKey = process.env.GOOGLE_API_KEY || apiConfig.GOOGLE_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        error: 'GOOGLE_API_KEY puuttuu. Mene Asetuksiin (Cmd+,) ja syötä avain, tai luo .env tiedosto.'
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return { 
      success: true, 
      data: text
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    return { success: false, error: error.message };
  }
});

// Cursor API (oletetaan että tämä on custom API)
ipcMain.handle('cursor-api', async (event, prompt) => {
  try {
    let apiKey = process.env.CURSOR_API_KEY || apiConfig.CURSOR_API_KEY || 'your-cursor-api-key-here';

    const response = await fetch("https://api.cursor.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "cursor-pro",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Cursor API error: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data: data.choices[0].message.content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// DeepSeek API (OpenAI-compatible)
ipcMain.handle('deepseek-api', async (event, payload) => {
  try {
    let apiKey = process.env.DEEPSEEK_API_KEY || apiConfig.DEEPSEEK_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        error: 'DEEPSEEK_API_KEY puuttuu. Mene Asetuksiin (Cmd+,) ja syötä avain, tai luo .env tiedosto.'
      };
    }

    const { prompt, options = {} } = typeof payload === 'object' && payload !== null
      ? { prompt: payload.prompt, options: payload.options || {} }
      : { prompt: payload, options: {} };

    if (!prompt || typeof prompt !== 'string') {
      throw new Error('DeepSeek API error: invalid prompt payload');
    }

    const temperature = typeof options.temperature === 'number' ? options.temperature : 0.7;
    const maxTokens = typeof options.max_tokens === 'number' ? options.max_tokens : 2000;
    const topP = typeof options.top_p === 'number' ? options.top_p : 0.9;
    const model = options.model || 'deepseek-chat';

    // v1.4.1: Timeout protection
    const response = await withTimeout(
      fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature,
          top_p: topP,
          stream: false
        })
      }),
      30000  // 30s timeout
    );

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data: data.choices[0].message.content, usage: data.usage };
  } catch (error) {
    console.error('DeepSeek API error:', error);
    return { success: false, error: error.message };
  }
});

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

// Export functions for testing
module.exports = {
  convertToRTF,
  convertToHTML,
  convertToDocx
};

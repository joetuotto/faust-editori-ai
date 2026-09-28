const { app, BrowserWindow, ipcMain, dialog, Menu, safeStorage, shell } = require('electron');
const { convertToRTF, convertToHTML, convertToDocx } = require("./utils/documentConverters");
const { writeFileAtomic, backupBeforeOverwrite } = require('./utils/safeWrite');
const path = require('path');
const fs = require('fs').promises;

// Load environment variables
require('dotenv').config();

// AI API Clients
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenAI } = require('@google/genai');
const { resolveModel, acceptsSampling, usesAdaptiveThinking } = require('./src/utils/models');

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
  await writeFileAtomic(getUiPrefsPath(), JSON.stringify(uiPrefs, null, 2));
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

  // Never open new windows or navigate away from the app; external links go to the browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
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

// Rotating copies of project files, taken before each overwrite
function getProjectBackupDir() {
  return path.join(app.getPath('userData'), 'backups');
}

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

      await backupBeforeOverwrite(filePath, getProjectBackupDir(), { minIntervalMs: 0 });
      await writeFileAtomic(filePath, JSON.stringify(dataWithMeta, null, 2));
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

    await backupBeforeOverwrite(filePath, getProjectBackupDir());
    await writeFileAtomic(filePath, JSON.stringify(dataWithMeta, null, 2));
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

    await writeFileAtomic(getConfigPath(), JSON.stringify(config, null, 2));
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
    await writeFileAtomic(logPath, JSON.stringify(log, null, 2));
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
  await writeFileAtomic(backupPath, JSON.stringify(project, null, 2));
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

// ---------------------------------------------------------------------------
// AI provider handlers
// Model IDs are resolved through src/utils/models.js so retired IDs saved in
// old projects fall back to a current default instead of failing.
// ---------------------------------------------------------------------------

// Accepts a plain prompt string or { prompt, messages, model, temperature,
// max_tokens | maxTokens, system, options } (DeepSeek historically nested options)
function normalizeAIParams(input, provider) {
  const p = typeof input === 'string' ? { prompt: input } : { ...(input || {}), ...((input && input.options) || {}) };
  const messages = Array.isArray(p.messages) && p.messages.length > 0
    ? p.messages
    : [{ role: 'user', content: p.prompt }];
  return {
    messages,
    model: resolveModel(provider, p.model),
    temperature: typeof p.temperature === 'number' ? p.temperature : 0.7,
    maxTokens: p.max_tokens || p.maxTokens || null,
    system: p.system || null,
    topP: typeof p.top_p === 'number' ? p.top_p : undefined
  };
}

function missingKeyError(name) {
  return {
    success: false,
    error: `${name} puuttuu. Mene Asetuksiin (Cmd+,) ja syötä avain, tai luo .env tiedosto.`
  };
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY || apiConfig.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey }) : null;
}

// Build a Messages API request. Current Claude models reject sampling
// parameters and budget_tokens, and refusals are rescued by server-side fallbacks.
function buildClaudeRequest({ messages, model, temperature, maxTokens, system }, extra = {}) {
  const request = {
    model,
    max_tokens: maxTokens || 16000,
    messages,
    ...extra
  };
  if (system) request.system = system;
  if (acceptsSampling('anthropic', model) && !extra.thinking) {
    request.temperature = temperature;
  }
  if (/^claude-(opus-5|fable-5-1)/.test(model)) {
    request.betas = ['server-side-fallback-2026-07-01'];
    request.fallbacks = 'default';
  }
  return request;
}

function claudeResultFromMessage(message) {
  if (message.stop_reason === 'refusal') {
    const category = message.stop_details?.category;
    return {
      success: false,
      error: `Malli kieltäytyi vastaamasta${category ? ` (${category})` : ''}.`,
      stopReason: 'refusal'
    };
  }
  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const thinking = message.content.filter(b => b.type === 'thinking').map(b => b.thinking).join('\n');
  return {
    success: true,
    data: text,
    response: text,
    thinking,
    usage: message.usage,
    stopReason: message.stop_reason,
    model: message.model
  };
}

// Claude API
ipcMain.handle('claude-api', async (event, promptOrOptions) => {
  try {
    const anthropic = getAnthropicClient();
    if (!anthropic) return missingKeyError('ANTHROPIC_API_KEY');

    const params = normalizeAIParams(promptOrOptions, 'anthropic');
    // Streaming avoids HTTP timeouts on long generations
    const message = await anthropic.beta.messages.stream(buildClaudeRequest(params)).finalMessage();
    return claudeResultFromMessage(message);
  } catch (error) {
    console.error('Claude API error:', error);
    return { success: false, error: error.message };
  }
});

// Claude API Streaming - Real-time token-by-token response
ipcMain.handle('claude-api-stream', async (event, options) => {
  try {
    const anthropic = getAnthropicClient();
    if (!anthropic) return missingKeyError('ANTHROPIC_API_KEY');

    const params = normalizeAIParams(options, 'anthropic');
    const stream = anthropic.beta.messages.stream(buildClaudeRequest(params));

    stream.on('text', (text) => {
      event.sender.send('claude-stream-chunk', { text, type: 'text' });
    });

    const finalMessage = await stream.finalMessage();
    const result = claudeResultFromMessage(finalMessage);
    if (!result.success) {
      event.sender.send('claude-stream-chunk', { error: result.error, type: 'error' });
    }
    return result;
  } catch (error) {
    console.error('Claude Stream API error:', error);
    event.sender.send('claude-stream-chunk', {
      error: error.message,
      type: 'error'
    });
    return { success: false, error: error.message };
  }
});

// Claude API with thinking - Deep analysis mode.
// Adaptive thinking replaces the old fixed budget_tokens; `budgetTokens` from
// older callers is ignored, and depth is controlled with effort instead.
ipcMain.handle('claude-api-thinking', async (event, options = {}) => {
  try {
    const anthropic = getAnthropicClient();
    if (!anthropic) return missingKeyError('ANTHROPIC_API_KEY');

    const params = normalizeAIParams({ ...options, maxTokens: options.maxTokens || 32000 }, 'anthropic');
    const thinking = usesAdaptiveThinking(params.model)
      ? { thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: options.effort || 'high' } }
      : { thinking: { type: 'enabled', budget_tokens: Math.min(options.budgetTokens || 10000, params.maxTokens - 1) } };

    const stream = anthropic.beta.messages.stream(buildClaudeRequest(params, thinking));

    if (options.stream) {
      stream.on('streamEvent', (ev) => {
        if (ev.type === 'content_block_start' && ev.content_block?.type === 'thinking') {
          event.sender.send('claude-stream-chunk', { type: 'thinking_start' });
        } else if (ev.type === 'content_block_delta') {
          if (ev.delta?.type === 'thinking_delta') {
            event.sender.send('claude-stream-chunk', { text: ev.delta.thinking, type: 'thinking' });
          } else if (ev.delta?.type === 'text_delta') {
            event.sender.send('claude-stream-chunk', { text: ev.delta.text, type: 'text' });
          }
        }
      });
    }

    const finalMessage = await stream.finalMessage();
    return claudeResultFromMessage(finalMessage);
  } catch (error) {
    console.error('Claude Thinking API error:', error);
    return { success: false, error: error.message };
  }
});

// OpenAI-compatible chat completions (xAI, DeepSeek)
async function openAICompatibleChat({ url, apiKey, params, timeoutMs = 120000 }) {
  const body = {
    model: params.model,
    messages: params.system
      ? [{ role: 'system', content: params.system }, ...params.messages]
      : params.messages,
    max_tokens: params.maxTokens || 4000,
    temperature: params.temperature
  };
  if (params.topP !== undefined) body.top_p = params.topP;

  const response = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    }),
    timeoutMs
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  return { success: true, data: data.choices[0].message.content, usage: data.usage, model: data.model };
}

// Grok API (xAI)
ipcMain.handle('grok-api', async (event, promptOrOptions) => {
  try {
    const apiKey = process.env.GROK_API_KEY || apiConfig.GROK_API_KEY;
    if (!apiKey) return missingKeyError('GROK_API_KEY');

    return await openAICompatibleChat({
      url: 'https://api.x.ai/v1/chat/completions',
      apiKey,
      params: normalizeAIParams(promptOrOptions, 'grok')
    });
  } catch (error) {
    console.error('Grok API error:', error);
    return { success: false, error: error.message };
  }
});

// OpenAI API
ipcMain.handle('openai-api', async (event, promptOrOptions) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY || apiConfig.OPENAI_API_KEY;
    if (!apiKey) return missingKeyError('OPENAI_API_KEY');

    const params = normalizeAIParams(promptOrOptions, 'openai');
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: params.model,
      messages: params.system
        ? [{ role: 'system', content: params.system }, ...params.messages]
        : params.messages,
      max_completion_tokens: params.maxTokens || 4000
    });

    return {
      success: true,
      data: completion.choices[0].message.content,
      usage: completion.usage,
      model: completion.model
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    return { success: false, error: error.message };
  }
});

// Google Gemini API
ipcMain.handle('gemini-api', async (event, promptOrOptions) => {
  try {
    const apiKey = process.env.GOOGLE_API_KEY || apiConfig.GOOGLE_API_KEY;
    if (!apiKey) return missingKeyError('GOOGLE_API_KEY');

    const params = normalizeAIParams(promptOrOptions, 'gemini');
    const client = new GoogleGenAI({ apiKey });
    const response = await client.models.generateContent({
      model: params.model,
      contents: params.messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
      })),
      config: {
        ...(params.system ? { systemInstruction: params.system } : {}),
        temperature: params.temperature,
        ...(params.maxTokens ? { maxOutputTokens: params.maxTokens } : {})
      }
    });

    return { success: true, data: response.text ?? '' };
  } catch (error) {
    console.error('Gemini API error:', error);
    return { success: false, error: error.message };
  }
});

// DeepSeek API (OpenAI-compatible)
ipcMain.handle('deepseek-api', async (event, payload) => {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY || apiConfig.DEEPSEEK_API_KEY;
    if (!apiKey) return missingKeyError('DEEPSEEK_API_KEY');

    return await openAICompatibleChat({
      url: 'https://api.deepseek.com/v1/chat/completions',
      apiKey,
      params: normalizeAIParams(payload, 'deepseek')
    });
  } catch (error) {
    console.error('DeepSeek API error:', error);
    return { success: false, error: error.message };
  }
});

// List the models an API key can use, so the UI can offer current models
// instead of a hard-coded list
ipcMain.handle('ai:list-models', async (event, provider) => {
  try {
    const bearer = (key) => ({ headers: { Authorization: `Bearer ${key}` } });
    const getJSON = async (url, init) => {
      const res = await withTimeout(fetch(url, init), 15000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };

    switch (provider) {
      case 'anthropic': {
        const anthropic = getAnthropicClient();
        if (!anthropic) return missingKeyError('ANTHROPIC_API_KEY');
        const models = [];
        for await (const m of anthropic.models.list()) {
          models.push({ id: m.id, name: m.display_name || m.id });
        }
        return { success: true, models };
      }
      case 'openai': {
        const key = process.env.OPENAI_API_KEY || apiConfig.OPENAI_API_KEY;
        if (!key) return missingKeyError('OPENAI_API_KEY');
        const data = await getJSON('https://api.openai.com/v1/models', bearer(key));
        return { success: true, models: data.data.map(m => ({ id: m.id, name: m.id })) };
      }
      case 'grok': {
        const key = process.env.GROK_API_KEY || apiConfig.GROK_API_KEY;
        if (!key) return missingKeyError('GROK_API_KEY');
        const data = await getJSON('https://api.x.ai/v1/models', bearer(key));
        return { success: true, models: data.data.map(m => ({ id: m.id, name: m.id })) };
      }
      case 'deepseek': {
        const key = process.env.DEEPSEEK_API_KEY || apiConfig.DEEPSEEK_API_KEY;
        if (!key) return missingKeyError('DEEPSEEK_API_KEY');
        const data = await getJSON('https://api.deepseek.com/models', bearer(key));
        return { success: true, models: data.data.map(m => ({ id: m.id, name: m.id })) };
      }
      case 'gemini': {
        const key = process.env.GOOGLE_API_KEY || apiConfig.GOOGLE_API_KEY;
        if (!key) return missingKeyError('GOOGLE_API_KEY');
        const data = await getJSON('https://generativelanguage.googleapis.com/v1beta/models', {
          headers: { 'x-goog-api-key': key }
        });
        return {
          success: true,
          models: data.models
            .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
            .map(m => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }))
        };
      }
      default:
        return { success: false, error: `Tuntematon palveluntarjoaja: ${provider}` };
    }
  } catch (error) {
    console.error('List models error:', error);
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

// ============================================
// AI MODULES - Story Generation & Continuity
// ============================================

// Helper: Get AI client for provider
function getAIClient(providerName) {
  let apiKey;

  if (providerName === 'openai') {
    apiKey = process.env.OPENAI_API_KEY || apiConfig.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key missing');
    return { client: new OpenAI({ apiKey }), provider: 'openai' };
  } else if (providerName === 'grok' || providerName === 'deepseek') {
    // Grok and DeepSeek use native https (no SDK client)
    if (providerName === 'grok') {
      apiKey = process.env.GROK_API_KEY || apiConfig.GROK_API_KEY;
      if (!apiKey) throw new Error('Grok API key missing');
    } else {
      apiKey = process.env.DEEPSEEK_API_KEY || apiConfig.DEEPSEEK_API_KEY;
      if (!apiKey) throw new Error('DeepSeek API key missing');
    }
    return { client: null, provider: providerName, apiKey };
  } else {
    // Default: Anthropic
    apiKey = process.env.ANTHROPIC_API_KEY || apiConfig.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Anthropic API key missing');
    return { client: new Anthropic({ apiKey }), provider: 'anthropic' };
  }
}

// Generate chapter content with AI
ipcMain.handle('ai:generate-chapter', async (event, { chapterId, project, mode = 'production', provider = 'anthropic' }) => {
  try {
    // Load AI modules lazily
    loadAIModules();

    console.log('[AI Generate] Chapter:', chapterId, 'Mode:', mode, 'Provider:', provider);

    // Get API key based on provider
    let apiKey;
    let aiClient;

    if (provider === 'openai') {
      apiKey = process.env.OPENAI_API_KEY || apiConfig.OPENAI_API_KEY;
      if (!apiKey) return { success: false, error: 'OpenAI API key missing' };
      aiClient = new OpenAI({ apiKey });
    } else if (provider === 'grok') {
      apiKey = process.env.GROK_API_KEY || apiConfig.GROK_API_KEY;
      if (!apiKey) return { success: false, error: 'Grok API key missing' };
      // Grok uses fetch, not a client
    } else if (provider === 'deepseek') {
      apiKey = process.env.DEEPSEEK_API_KEY || apiConfig.DEEPSEEK_API_KEY;
      if (!apiKey) return { success: false, error: 'DeepSeek API key missing' };
      // DeepSeek uses fetch, not a client
    } else {
      // Default: Anthropic/Claude
      apiKey = process.env.ANTHROPIC_API_KEY || apiConfig.ANTHROPIC_API_KEY;
      if (!apiKey) return { success: false, error: 'Anthropic API key missing' };
      aiClient = new Anthropic({ apiKey });
    }

    // Configure modules
    StoryContinuityTracker.configure({
      deepseekClient: null,
      getProject: () => project
    });

    HybridWritingFlow.configure({
      claudeClient: aiClient, // Works for Anthropic
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

    console.log('[AI Generate] Calling', provider, 'API...');

    // Generate with selected provider
    let generatedContent;
    let usage = null;

    const params = normalizeAIParams({
      prompt,
      model: project.ai?.models?.[provider],
      temperature: modeConfig.temperature,
      maxTokens: modeConfig.maxTokens
    }, provider);

    if (provider === 'openai') {
      const completion = await aiClient.chat.completions.create({
        model: params.model,
        messages: params.messages,
        max_completion_tokens: params.maxTokens
      });
      generatedContent = completion.choices[0].message.content;
      usage = completion.usage;

    } else if (provider === 'grok' || provider === 'deepseek') {
      const result = await openAICompatibleChat({
        url: provider === 'grok'
          ? 'https://api.x.ai/v1/chat/completions'
          : 'https://api.deepseek.com/v1/chat/completions',
        apiKey,
        params
      });
      generatedContent = result.data;
      usage = result.usage;

    } else {
      // Anthropic/Claude
      const message = await aiClient.beta.messages.stream(buildClaudeRequest(params)).finalMessage();
      const result = claudeResultFromMessage(message);
      if (!result.success) throw new Error(result.error);
      generatedContent = result.data;
      usage = result.usage;
    }

    // Update continuity tracker
    await StoryContinuityTracker.updateMemory(chapter.order, generatedContent);

    console.log('[AI Generate] Success! Generated', generatedContent.length, 'characters');

    return {
      success: true,
      content: generatedContent,
      wordCount: generatedContent.trim().split(/\s+/).length,
      usage,
      continuityCheck,
      provider
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

// Batch process multiple chapters
ipcMain.handle('ai:batch-process', async (event, { project, operation = 'continuityCheck', options = {} }) => {
  try {
    console.log('[AI Batch] Starting:', operation);

    let apiKey = process.env.ANTHROPIC_API_KEY || apiConfig.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'API key missing' };
    }

    const anthropic = new Anthropic({ apiKey });

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
      claudeClient: anthropic,
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

const { convertToRTF, convertToHTML, convertToDocx } = require("./utils/documentConverters");
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// Load environment variables
require('dotenv').config();

// AI API Clients
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 16 },
    backgroundColor: '#1f2937'
  });

  mainWindow.loadFile('index.html');
  
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
    
    // View Menu
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
          checked: false,
          click: () => mainWindow.webContents.send('toggle-inspector')
        },
        {
          label: 'AI-Avustajat',
          accelerator: 'CmdOrCtrl+Alt+A',
          type: 'checkbox',
          checked: false,
          click: () => mainWindow.webContents.send('toggle-ai-panel')
        },
        { type: 'separator' },
        {
          label: 'Focus Mode',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => mainWindow.webContents.send('toggle-focus-mode')
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

app.whenReady().then(() => {
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

    let fileContent = content;

    if (format === 'rtf') {
      fileContent = convertToRTF(content);
    } else if (format === 'html') {
      fileContent = convertToHTML(content, title);
    } else if (format === 'docx') {
      fileContent = convertToDocx(content, title);
    }

    await fs.writeFile(filePath, fileContent, 'utf-8');
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

// Vie PDF
ipcMain.handle('export-pdf', async (event, { html, title }) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Vie PDF',
      defaultPath: `${title}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (!filePath) return { success: false };

    const pdfWindow = new BrowserWindow({ show: false });
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const pdfData = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 2,
        bottom: 2,
        left: 2,
        right: 2
      }
    });

    await fs.writeFile(filePath, pdfData);
    pdfWindow.close();

    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: error.message };
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

// Claude API (Anthropic SDK - REAL IMPLEMENTATION)
ipcMain.handle('claude-api', async (event, prompt) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        error: 'ANTHROPIC_API_KEY puuttuu. Luo .env tiedosto ja lisää avain. Katso API_KEYS.md'
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
    const apiKey = process.env.GROK_API_KEY || 'your-grok-api-key-here';

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
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        error: 'OPENAI_API_KEY puuttuu. Luo .env tiedosto ja lisää avain. Katso API_KEYS.md'
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
    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      return {
        success: false,
        error: 'GOOGLE_API_KEY puuttuu. Luo .env tiedosto ja lisää avain. Katso API_KEYS.md'
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
    const apiKey = process.env.CURSOR_API_KEY || 'your-cursor-api-key-here';

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

// Export functions for testing
module.exports = {
  convertToRTF,
  convertToHTML,
  convertToDocx
};

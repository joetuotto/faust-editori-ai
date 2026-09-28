import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import type { MenuCommand } from '../shared/api';
import { INTERNAL_FILES } from '../shared/api';
import type { AIRequest, BibleEntry, Doc, ExportFormat, OpenProject, ProjectManifest, ProviderId, Result } from '../shared/types';
import { EXPORT_EXTENSIONS } from '../shared/types';
import { generate, listModels } from './ai';
import { exportProject } from './export';
import { commitAll, history, readAt } from './history';
import { keyStatus, setKey } from './keys';
import * as language from './language';
import { importLegacyFile } from './legacyImport';
import {
  createProject,
  isProjectFolder,
  MANIFEST_FILE,
  openProject,
  readInternal,
  trashFiles,
  writeBibleEntry,
  writeDoc,
  writeInternal,
  writeManifest
} from './projectStore';
import { forgetProject, getSettings, rememberProject, updateSettings } from './settings';
import { writeFileAtomic } from './fsutil';

let mainWindow: BrowserWindow | null = null;
let currentProject: string | null = null;

/* ---------- automatic history ---------- */

// Changes are committed a while after the last save, and always on close
const AUTO_COMMIT_DELAY = 2 * 60 * 1000;
let commitTimer: NodeJS.Timeout | null = null;

function scheduleCommit() {
  if (commitTimer) clearTimeout(commitTimer);
  commitTimer = setTimeout(() => void flushCommit('Automaattinen tallennus'), AUTO_COMMIT_DELAY);
}

async function flushCommit(message: string): Promise<string | null> {
  if (commitTimer) {
    clearTimeout(commitTimer);
    commitTimer = null;
  }
  if (!currentProject) return null;
  try {
    return await commitAll(currentProject, message);
  } catch (error) {
    console.error('[history] commit failed:', error);
    return null;
  }
}

/* ---------- helpers ---------- */

function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

function fail(error: unknown): { success: false; error: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

function requireProject(): string {
  if (!currentProject) throw new Error('Projektia ei ole avattu.');
  return currentProject;
}

async function activate(projectPath: string): Promise<Result<OpenProject>> {
  try {
    const project = await openProject(projectPath);
    if (currentProject && currentProject !== projectPath) await flushCommit('Projekti suljettu');
    currentProject = projectPath;
    await language.loadDictionaries(projectPath);
    await rememberProject(projectPath, project.manifest.title);
    // First commit of an imported or new project
    void commitAll(projectPath, 'Projekti avattu').catch(() => {});
    mainWindow?.setTitle(`${project.manifest.title} — FAUST`);
    mainWindow?.setRepresentedFilename?.(projectPath);
    return ok(project);
  } catch (error) {
    return fail(error);
  }
}

function sendMenu(command: MenuCommand) {
  mainWindow?.webContents.send('menu', command);
}

/* ---------- window & menu ---------- */

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Tiedosto',
      submenu: [
        { label: 'Uusi projekti…', accelerator: 'CmdOrCtrl+Shift+N', click: () => sendMenu('new-project') },
        { label: 'Avaa projekti…', accelerator: 'CmdOrCtrl+O', click: () => sendMenu('open-project') },
        { label: 'Tuo vanha .faust-tiedosto…', click: () => sendMenu('import-legacy') },
        { type: 'separator' },
        { label: 'Tallenna versio', accelerator: 'CmdOrCtrl+S', click: () => sendMenu('snapshot') },
        { label: 'Versiohistoria…', accelerator: 'CmdOrCtrl+Shift+H', click: () => sendMenu('show-history') },
        { label: 'Vie käsikirjoitus…', accelerator: 'CmdOrCtrl+E', click: () => sendMenu('export') },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Sulje ikkuna' } : { role: 'quit', label: 'Lopeta' }
      ]
    },
    {
      label: 'Muokkaa',
      submenu: [
        { role: 'undo', label: 'Kumoa' },
        { role: 'redo', label: 'Tee uudelleen' },
        { type: 'separator' },
        { role: 'cut', label: 'Leikkaa' },
        { role: 'copy', label: 'Kopioi' },
        { role: 'paste', label: 'Liitä' },
        { role: 'selectAll', label: 'Valitse kaikki' }
      ]
    },
    {
      label: 'Lisää',
      submenu: [
        { label: 'Uusi luku', accelerator: 'CmdOrCtrl+Shift+L', click: () => sendMenu('new-chapter') },
        { label: 'Uusi kohtaus', accelerator: 'CmdOrCtrl+Shift+K', click: () => sendMenu('new-scene') }
      ]
    },
    {
      label: 'Näytä',
      submenu: [
        { label: 'DEIS / NOX', accelerator: 'CmdOrCtrl+Shift+D', click: () => sendMenu('toggle-theme') },
        { label: 'Fokustila', accelerator: 'CmdOrCtrl+Shift+F', click: () => sendMenu('focus-mode') },
        { type: 'separator' },
        { label: 'Sisällys', accelerator: 'CmdOrCtrl+1', click: () => sendMenu('toggle-binder') },
        { label: 'Tarkastelija', accelerator: 'CmdOrCtrl+2', click: () => sendMenu('toggle-inspector') },
        { label: 'AI-avustaja', accelerator: 'CmdOrCtrl+K', click: () => sendMenu('toggle-ai') },
        { label: 'Tarinan tietopankki', accelerator: 'CmdOrCtrl+B', click: () => sendMenu('show-bible') },
        { type: 'separator' },
        { label: 'Asetukset', accelerator: 'CmdOrCtrl+,', click: () => sendMenu('show-settings') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Koko näyttö' },
        { role: 'toggleDevTools', label: 'Kehittäjätyökalut' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'FAUST',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#141210',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });

  // No new windows or navigation away from the app; links open in the browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/* ---------- IPC ---------- */

function registerIpc() {
  ipcMain.handle('app:getSettings', () => getSettings());
  ipcMain.handle('app:setTheme', async (_e, theme: 'NOX' | 'DEIS') => {
    await updateSettings({ theme });
  });
  ipcMain.handle('app:setSpellcheck', async (_e, spellcheck: boolean) => {
    await updateSettings({ spellcheck });
  });
  ipcMain.handle('app:forgetRecent', (_e, p: string) => forgetProject(p));

  ipcMain.handle('project:create', async (_e, title: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
      title: 'Valitse kansio, johon projekti luodaan',
      properties: ['openDirectory', 'createDirectory']
    });
    if (canceled || !filePaths[0]) return null;
    try {
      return activate(await createProject(filePaths[0], title));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('project:openDialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
      title: 'Avaa FAUST-projekti',
      properties: ['openDirectory', 'openFile', 'treatPackageAsDirectory'],
      filters: [{ name: 'FAUST-projekti', extensions: ['json', 'faust'] }]
    });
    if (canceled || !filePaths[0]) return null;
    let target = filePaths[0];
    if (path.basename(target) === MANIFEST_FILE) target = path.dirname(target);
    if (!(await isProjectFolder(target))) {
      return fail(new Error('Valittu kohde ei ole FAUST-projektikansio. Vanhat .faust-tiedostot tuodaan kohdasta "Tuo vanha .faust-tiedosto".'));
    }
    return activate(target);
  });

  ipcMain.handle('project:open', (_e, p: string) => activate(p));

  ipcMain.handle('project:importLegacy', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
      title: 'Tuo vanha FAUST-projekti',
      properties: ['openFile'],
      filters: [{ name: 'FAUST 1.x/2.x', extensions: ['faust', 'json'] }]
    });
    if (canceled || !filePaths[0]) return null;
    try {
      const projectPath = await importLegacyFile(filePaths[0], path.dirname(filePaths[0]));
      return activate(projectPath);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('project:close', async () => {
    await flushCommit('Projekti suljettu');
    currentProject = null;
    await language.loadDictionaries(null);
    await updateSettings({ lastProject: null });
    mainWindow?.setTitle('FAUST');
  });

  ipcMain.handle('project:saveManifest', async (_e, manifest: ProjectManifest) => {
    try {
      await writeManifest(requireProject(), { ...manifest, modified: new Date().toISOString() });
      scheduleCommit();
      return ok(undefined);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('project:saveDoc', async (_e, file: string, doc: Doc) => {
    try {
      await writeDoc(requireProject(), file, doc);
      scheduleCommit();
      return ok(undefined);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('project:saveBible', async (_e, entry: BibleEntry) => {
    try {
      await writeBibleEntry(requireProject(), entry);
      scheduleCommit();
      return ok(undefined);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('project:trash', async (_e, files: string[]) => {
    try {
      await trashFiles(requireProject(), files);
      scheduleCommit();
      return ok(undefined);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('project:snapshot', async (_e, message: string) => {
    try {
      requireProject();
      return ok(await flushCommit(message || 'Tallennettu versio'));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('project:history', async (_e, file?: string) => (currentProject ? history(currentProject, file) : []));
  ipcMain.handle('project:readAt', async (_e, oid: string, file: string) =>
    currentProject ? readAt(currentProject, oid, file) : null
  );

  ipcMain.handle('project:readInternal', async (_e, name: string) => {
    if (!currentProject || !(INTERNAL_FILES as readonly string[]).includes(name)) return null;
    return readInternal(currentProject, name);
  });
  ipcMain.handle('project:writeInternal', async (_e, name: string, content: string) => {
    try {
      if (!(INTERNAL_FILES as readonly string[]).includes(name)) throw new Error(`Not allowed: ${name}`);
      await writeInternal(requireProject(), name, content);
      return ok(undefined);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('project:reveal', async () => {
    if (currentProject) shell.showItemInFolder(path.join(currentProject, MANIFEST_FILE));
  });

  ipcMain.handle('project:export', async (_e, format: ExportFormat) => {
    try {
      const project = await openProject(requireProject());
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
        title: 'Vie käsikirjoitus',
        defaultPath: path.join(
          path.dirname(currentProject!),
          `${project.manifest.title}${format === 'manuscript' ? ' (käsikirjoitus)' : ''}.${EXPORT_EXTENSIONS[format]}`
        ),
        filters: [{ name: EXPORT_EXTENSIONS[format].toUpperCase(), extensions: [EXPORT_EXTENSIONS[format]] }]
      });
      if (canceled || !filePath) return null;
      const content = await exportProject(project, format);
      await writeFileAtomic(filePath, content);
      return ok(filePath);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle('lang:available', () => language.isAvailable());
  ipcMain.handle('lang:check', (_e, words: string[]) => language.check(words));
  ipcMain.handle('lang:suggest', (_e, word: string) => language.suggest(word));
  ipcMain.handle('lang:grammar', (_e, paragraphs: string[]) => language.grammar(paragraphs));
  ipcMain.handle('lang:addWord', (_e, word: string, scope: 'project' | 'user') => language.addWord(word, scope));

  ipcMain.handle('ai:keyStatus', () => keyStatus());
  ipcMain.handle('ai:setKey', (_e, provider: ProviderId, key: string) => setKey(provider, key));
  ipcMain.handle('ai:listModels', (_e, provider: ProviderId) => listModels(provider));

  const running = new Map<string, AbortController>();
  ipcMain.handle('ai:generate', async (event, id: string, request: AIRequest, options?: { think?: boolean }) => {
    const controller = new AbortController();
    running.set(id, controller);
    try {
      return await generate(request, {
        signal: controller.signal,
        think: options?.think,
        onText: text => {
          if (!event.sender.isDestroyed()) event.sender.send('ai:chunk', id, text);
        }
      });
    } finally {
      running.delete(id);
    }
  });
  ipcMain.on('ai:cancel', (_e, id: string) => running.get(id)?.abort());
}

/* ---------- lifecycle ---------- */

app.whenReady().then(async () => {
  registerIpc();
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let quitting = false;
app.on('before-quit', event => {
  // Commit pending changes before quitting (once)
  if (quitting || !currentProject) return;
  event.preventDefault();
  quitting = true;
  void flushCommit('Sovellus suljettu').finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

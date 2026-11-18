const { contextBridge, ipcRenderer } = require('electron');

// ai:request chunks, routed by request id
const aiChunkHandlers = new Map();
ipcRenderer.on('ai:chunk', (_event, chunk) => {
  const handler = chunk && aiChunkHandlers.get(chunk.id);
  if (handler) handler(chunk);
});

// Turvallinen IPC-yhteys Reactille
contextBridge.exposeInMainWorld('electronAPI', {
  // Project files
  // saveProject(data, { filePath, saveAs }): writes to filePath without asking;
  // shows the save dialog when there is no path or saveAs is true
  saveProject: (data, options) => ipcRenderer.invoke('save-project', data, options),
  loadProject: () => ipcRenderer.invoke('load-project'),
  loadProjectFromPath: (filePath) => ipcRenderer.invoke('load-project-from-path', filePath),
  autosaveProject: (data) => ipcRenderer.invoke('autosave-project', data),

  // Unsaved changes: the main process asks before the window closes
  setDirty: (dirty) => ipcRenderer.send('project:set-dirty', !!dirty),
  confirmUnsavedChanges: () => ipcRenderer.invoke('dialog:unsaved-changes'), // 'save' | 'discard' | 'cancel'
  confirmClose: () => ipcRenderer.send('project:close-confirmed'),
  cancelClose: () => ipcRenderer.send('project:close-cancelled'),

  // Recovery copy of unsaved work
  saveBackup: (payload) => ipcRenderer.invoke('save-backup', payload),
  loadBackup: () => ipcRenderer.invoke('load-backup'),
  clearBackup: () => ipcRenderer.invoke('clear-backup'),

  // Export, print, import (see utils/manuscript.js)
  exportManuscript: (payload) => ipcRenderer.invoke('export-manuscript', payload),
  printManuscript: (payload) => ipcRenderer.invoke('print-manuscript', payload),
  importDocument: () => ipcRenderer.invoke('import-document'),
  importFolder: (request) => ipcRenderer.invoke('import-folder', request),

  // AI calls. Go to Claude or to the model selected in Cherry Studio,
  // depending on the provider setting (see aiGetProvider).
  claudeAPI: (prompt) => ipcRenderer.invoke('claude-api', prompt),

  // Streaming: real-time responses
  claudeAPIStream: (options) => {
    return new Promise((resolve, reject) => {
      const chunkHandler = (_event, chunk) => {
        if (options.onChunk && chunk.type !== 'error') {
          options.onChunk(chunk);
        }
        if (chunk.type === 'error') {
          reject(new Error(chunk.error));
        }
      };

      ipcRenderer.on('claude-stream-chunk', chunkHandler);

      ipcRenderer.invoke('claude-api-stream', {
        prompt: options.prompt,
        messages: options.messages,
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        system: options.system
      })
        .then(result => {
          ipcRenderer.removeListener('claude-stream-chunk', chunkHandler);
          resolve(result);
        })
        .catch(error => {
          ipcRenderer.removeListener('claude-stream-chunk', chunkHandler);
          reject(error);
        });
    });
  },

  // AI provider: Claude (Anthropic) or Cherry Studio gateway
  aiGetProvider: () => ipcRenderer.invoke('ai:get-provider'),
  aiSetProvider: (settings) => ipcRenderer.invoke('ai:set-provider', settings),
  aiListCherryModels: () => ipcRenderer.invoke('ai:list-cherry-models'),
  aiTestProvider: () => ipcRenderer.invoke('ai:test-provider'),

  // One request layer: always streaming, chunks tagged with the request id
  aiRequest: (request, onChunk) => {
    const id = request && request.id;
    if (id && typeof onChunk === 'function') aiChunkHandlers.set(id, onChunk);
    return ipcRenderer.invoke('ai:request', request).finally(() => aiChunkHandlers.delete(id));
  },
  aiCancel: (id) => ipcRenderer.invoke('ai:cancel', { id }),
  aiListAnthropicModels: () => ipcRenderer.invoke('ai:list-anthropic-models'),

  // Which keys are set (booleans); one key at a time is written, values never come back
  loadApiKeys: () => ipcRenderer.invoke('load-api-keys'),
  setApiKey: (name, value) => ipcRenderer.invoke('keys:set', { name, value }),

  // Renderer settings kept in ui-prefs.json
  prefsGet: () => ipcRenderer.invoke('prefs:get'),
  prefsSet: (patch) => ipcRenderer.invoke('prefs:set', patch),
  onPrefsChanged: (callback) => {
    ipcRenderer.on('prefs:changed', (_event, prefs) => callback(prefs));
  },

  // Save a text the renderer produced (usage log export)
  saveTextFile: (payload) => ipcRenderer.invoke('file:save-text', payload),

  // The text and summaries of the chapters marked "Ei tekoälylle", for the wire guard in main
  setProtectedText: (chapters) => ipcRenderer.send('ai:set-protected', chapters),

  // Chat Memory Log (Liminal Engine)
  loadChatMemory: () => ipcRenderer.invoke('chat:load-memory'),
  saveChatMemory: (entry) => ipcRenderer.invoke('chat:save-memory', entry),

  // Open a web page in the system browser (https only, checked in the main process)
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Theme ('NOX' or 'DEIS'): the main process mirrors it into the native layer
  // (menus, select lists, confirm boxes) and into the window's background
  setTheme: (theme) => ipcRenderer.send('theme-changed', theme),

  // Menu actions: one channel, callback(action, argument)
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (_event, action, arg) => callback(action, arg));
  }
});

console.log('Preload script loaded successfully');

const { contextBridge, ipcRenderer } = require('electron');

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

  // Extended thinking: deep analysis mode
  claudeAPIThinking: (options) => {
    return new Promise((resolve, reject) => {
      const chunkHandler = (_event, chunk) => {
        if (options.onChunk) {
          options.onChunk(chunk);
        }
      };

      if (options.stream) {
        ipcRenderer.on('claude-stream-chunk', chunkHandler);
      }

      ipcRenderer.invoke('claude-api-thinking', {
        prompt: options.prompt,
        messages: options.messages,
        budgetTokens: options.budgetTokens,
        maxTokens: options.maxTokens,
        stream: options.stream || false
      })
        .then(result => {
          if (options.stream) {
            ipcRenderer.removeListener('claude-stream-chunk', chunkHandler);
          }
          resolve(result);
        })
        .catch(error => {
          if (options.stream) {
            ipcRenderer.removeListener('claude-stream-chunk', chunkHandler);
          }
          reject(error);
        });
    });
  },

  // AI provider: Claude (Anthropic) or Cherry Studio gateway
  aiGetProvider: () => ipcRenderer.invoke('ai:get-provider'),
  aiSetProvider: (settings) => ipcRenderer.invoke('ai:set-provider', settings),
  aiListCherryModels: () => ipcRenderer.invoke('ai:list-cherry-models'),
  aiTestProvider: () => ipcRenderer.invoke('ai:test-provider'),

  // API Key management
  loadApiKeys: () => ipcRenderer.invoke('load-api-keys'),
  saveApiKeys: (keys) => ipcRenderer.invoke('save-api-keys', keys),

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

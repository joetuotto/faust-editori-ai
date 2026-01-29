const { contextBridge, ipcRenderer } = require('electron');

// Turvallinen IPC-yhteys Reactille
contextBridge.exposeInMainWorld('electronAPI', {
  // Project operations
  saveProject: (data) => ipcRenderer.invoke('save-project', data),
  loadProject: () => ipcRenderer.invoke('load-project'),
  loadProjectFromPath: (filePath) => ipcRenderer.invoke('load-project-from-path', filePath),
  autosaveProject: (data) => ipcRenderer.invoke('autosave-project', data),
  
  // Export operations
  exportDocument: (data) => ipcRenderer.invoke('export-document', data),
  exportFullProject: (data) => ipcRenderer.invoke('export-full-project', data),
  exportPDF: (data) => ipcRenderer.invoke('export-pdf', data),
  exportEPUB: (data) => ipcRenderer.invoke('export-epub', data),
  exportMOBI: (data) => ipcRenderer.invoke('export-mobi', data),

  // AI APIs
  claudeAPI: (prompt) => ipcRenderer.invoke('claude-api', prompt),
  openaiAPI: (prompt) => ipcRenderer.invoke('openai-api', prompt),
  geminiAPI: (prompt) => ipcRenderer.invoke('gemini-api', prompt),
  grokAPI: (prompt) => ipcRenderer.invoke('grok-api', prompt),
  cursorAPI: (prompt) => ipcRenderer.invoke('cursor-api', prompt),
  deepseekAPI: (payload) => ipcRenderer.invoke('deepseek-api', payload),
  webSearch: (query) => ipcRenderer.invoke('web-search', query),

  // Claude Streaming API - Real-time responses
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

  // Claude Extended Thinking API - Deep analysis mode
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

  // AI Modules - Story Generation & Continuity
  aiGenerateChapter: (params) => ipcRenderer.invoke('ai:generate-chapter', params),
  aiCheckContinuity: (params) => ipcRenderer.invoke('ai:check-continuity', params),
  aiBatchProcess: (params) => ipcRenderer.invoke('ai:batch-process', params),

  // API Key management
  loadApiKeys: () => ipcRenderer.invoke('load-api-keys'),
  saveApiKeys: (keys) => ipcRenderer.invoke('save-api-keys', keys),
  saveBackup: (project) => ipcRenderer.invoke('save-backup', project),
  loadBackup: () => ipcRenderer.invoke('load-backup'),

  // v1.4.1: UI Preferences
  getUiPrefs: () => ipcRenderer.invoke('ui:get-prefs'),
  setUiPrefs: (prefs) => ipcRenderer.invoke('ui:set-prefs', prefs),
  onUiPrefsChanged: (callback) => {
    ipcRenderer.on('ui-prefs-changed', (_event, prefs) => callback(prefs));
  },

  // Chat Memory Log (Liminal Engine)
  loadChatMemory: () => ipcRenderer.invoke('chat:load-memory'),
  saveChatMemory: (entry) => ipcRenderer.invoke('chat:save-memory', entry),

  // Batch Progress Listener
  onBatchProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('batch-progress', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('batch-progress', handler);
  },

  // v1.4.1: Spec Runner (internal testing)
  runSpec: (scenario) => ipcRenderer.invoke('spec:run', scenario),
  sendSpecResult: (payload) => ipcRenderer.send('spec:done', payload),
  onSpecStart: (callback) => {
    ipcRenderer.on('spec:start', (_event, data) => callback(data));
  },
  
  // Menu actions (listening)
  onMenuAction: (callback) => {
    const events = [
      // File menu
      'new-project', 'save-project-trigger', 'save-project-as-trigger',
      'export-trigger', 'export-pdf-trigger', 'export-epub-trigger', 'export-mobi-trigger', 'load-project-data',
      // Edit menu
      'undo', 'redo', 'show-find', 'find-next', 'show-find-replace',
      // View menu
      'toggle-sidebar', 'toggle-inspector', 'toggle-ai-panel', 'toggle-focus-mode',
      // Insert menu
      'new-chapter', 'new-scene', 'insert-comment', 'insert-note', 'insert-text',
      // Format menu
      'format-bold', 'format-italic', 'format-underline', 'format-heading', 
      'format-quote', 'format-list',
      // Tools menu
      'show-word-count', 'show-target-settings', 'spell-check', 'show-project-stats',
      // Help menu
      'show-help', 'show-shortcuts', 'show-about', 'show-settings',
      // v1.4.1: UI prefs
      'ui-prefs-changed'
    ];
    
    events.forEach(event => {
      ipcRenderer.on(event, (_, arg) => callback(event, arg));
    });
  }
});

console.log('Preload script loaded successfully');

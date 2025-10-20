const { contextBridge, ipcRenderer } = require('electron');

// Turvallinen IPC-yhteys Reactille
contextBridge.exposeInMainWorld('electronAPI', {
  // Project operations
  saveProject: (data) => ipcRenderer.invoke('save-project', data),
  loadProject: () => ipcRenderer.invoke('load-project'),
  
  // Export operations
  exportDocument: (data) => ipcRenderer.invoke('export-document', data),
  exportFullProject: (data) => ipcRenderer.invoke('export-full-project', data),
  exportPDF: (data) => ipcRenderer.invoke('export-pdf', data),
  
  // AI APIs
  claudeAPI: (prompt) => ipcRenderer.invoke('claude-api', prompt),
  openaiAPI: (prompt) => ipcRenderer.invoke('openai-api', prompt),
  geminiAPI: (prompt) => ipcRenderer.invoke('gemini-api', prompt),
  grokAPI: (prompt) => ipcRenderer.invoke('grok-api', prompt),
  cursorAPI: (prompt) => ipcRenderer.invoke('cursor-api', prompt),
  deepseekAPI: (payload) => ipcRenderer.invoke('deepseek-api', payload),
  webSearch: (query) => ipcRenderer.invoke('web-search', query),

  // API Key management
  loadApiKeys: () => ipcRenderer.invoke('load-api-keys'),
  saveApiKeys: (keys) => ipcRenderer.invoke('save-api-keys', keys),
  saveBackup: (project) => ipcRenderer.invoke('save-backup', project),
  loadBackup: () => ipcRenderer.invoke('load-backup'),
  
  // Menu actions (listening)
  onMenuAction: (callback) => {
    const events = [
      // File menu
      'new-project', 'save-project-trigger', 'save-project-as-trigger', 
      'export-trigger', 'export-pdf-trigger', 'load-project-data',
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
      'show-help', 'show-shortcuts', 'show-about', 'show-settings'
    ];
    
    events.forEach(event => {
      ipcRenderer.on(event, (_, arg) => callback(event, arg));
    });
  }
});

console.log('Preload script loaded successfully');

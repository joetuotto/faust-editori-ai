import { contextBridge, ipcRenderer } from 'electron';
import type { FaustAPI, MenuCommand } from '../shared/api';

let requestCounter = 0;

const api: FaustAPI = {
  app: {
    getSettings: () => ipcRenderer.invoke('app:getSettings'),
    setTheme: theme => ipcRenderer.invoke('app:setTheme', theme),
    setSpellcheck: enabled => ipcRenderer.invoke('app:setSpellcheck', enabled),
    setNoxAssist: enabled => ipcRenderer.invoke('app:setNoxAssist', enabled),
    setPrices: prices => ipcRenderer.invoke('app:setPrices', prices),
    forgetRecent: path => ipcRenderer.invoke('app:forgetRecent', path),
    onMenu: handler => {
      const listener = (_e: unknown, command: MenuCommand) => handler(command);
      ipcRenderer.on('menu', listener);
      return () => ipcRenderer.removeListener('menu', listener);
    }
  },
  project: {
    create: title => ipcRenderer.invoke('project:create', title),
    openDialog: () => ipcRenderer.invoke('project:openDialog'),
    open: path => ipcRenderer.invoke('project:open', path),
    importLegacy: () => ipcRenderer.invoke('project:importLegacy'),
    close: () => ipcRenderer.invoke('project:close'),
    saveManifest: manifest => ipcRenderer.invoke('project:saveManifest', manifest),
    saveDoc: (file, doc) => ipcRenderer.invoke('project:saveDoc', file, doc),
    saveBible: entry => ipcRenderer.invoke('project:saveBible', entry),
    trash: files => ipcRenderer.invoke('project:trash', files),
    snapshot: message => ipcRenderer.invoke('project:snapshot', message),
    history: file => ipcRenderer.invoke('project:history', file),
    readAt: (oid, file) => ipcRenderer.invoke('project:readAt', oid, file),
    readInternal: name => ipcRenderer.invoke('project:readInternal', name),
    writeInternal: (name, content) => ipcRenderer.invoke('project:writeInternal', name, content),
    reveal: () => ipcRenderer.invoke('project:reveal'),
    export: (format, options) => ipcRenderer.invoke('project:export', format, options)
  },
  lang: {
    available: () => ipcRenderer.invoke('lang:available'),
    check: words => ipcRenderer.invoke('lang:check', words),
    suggest: word => ipcRenderer.invoke('lang:suggest', word),
    grammar: paragraphs => ipcRenderer.invoke('lang:grammar', paragraphs),
    addWord: (word, scope) => ipcRenderer.invoke('lang:addWord', word, scope)
  },
  ai: {
    keyStatus: () => ipcRenderer.invoke('ai:keyStatus'),
    setKey: (provider, key) => ipcRenderer.invoke('ai:setKey', provider, key),
    listModels: provider => ipcRenderer.invoke('ai:listModels', provider),
    generate: (request, onText, options) => {
      const id = `ai-${Date.now()}-${++requestCounter}`;
      const listener = (_e: unknown, chunkId: string, text: string) => {
        if (chunkId === id) onText?.(text);
      };
      const toolListener = (_e: unknown, callId: string, label: string) => {
        if (callId === id) options?.onTool?.(label);
      };
      ipcRenderer.on('ai:chunk', listener);
      ipcRenderer.on('ai:tool', toolListener);
      const result = ipcRenderer
        .invoke('ai:generate', id, request, { think: options?.think })
        .finally(() => {
          ipcRenderer.removeListener('ai:chunk', listener);
          ipcRenderer.removeListener('ai:tool', toolListener);
        });
      return { id, result };
    },
    cancel: id => ipcRenderer.send('ai:cancel', id)
  }
};

contextBridge.exposeInMainWorld('faust', api);

// Global type definitions for FAUST

interface ElectronAPI {
  // File operations
  saveProject: (projectData: any) => Promise<{ success: boolean; path?: string; error?: string }>;
  loadProject: () => Promise<{ success: boolean; data?: any; filePath?: string; error?: string }>;
  loadProjectFromPath: (filePath: string) => Promise<{ success: boolean; data?: any; filePath?: string; error?: string }>;
  autosaveProject: (params: { projectData: any; filePath: string }) => Promise<{ success: boolean; error?: string }>;
  saveBackup: (params: { projectData: any; filePath: string }) => Promise<{ success: boolean; backupPath?: string; error?: string }>;

  // AI API calls
  claudeAPI: (params: { prompt: string; model?: string; temperature?: number; max_tokens?: number } | string) => Promise<{ success: boolean; data?: string; error?: string }>;
  openaiAPI: (params: { prompt: string; model?: string; temperature?: number; max_tokens?: number } | string) => Promise<{ success: boolean; data?: string; error?: string }>;
  grokAPI: (params: { prompt: string; model?: string; temperature?: number; max_tokens?: number } | string) => Promise<{ success: boolean; data?: string; error?: string }>;
  deepseekAPI: (params: { prompt: string; options?: { model?: string; temperature?: number; max_tokens?: number } } | string) => Promise<{ success: boolean; data?: string; error?: string }>;

  // Export operations
  exportDocument: (params: { content: string; title: string; format: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
  exportFullProject: (params: { project: any; format: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
  exportPDF: (params: { html: string; title: string }) => Promise<{ success: boolean; path?: string; error?: string }>;

  // Menu events
  onMenuEvent: (callback: (event: string, arg?: any) => void) => void;

  // API key management
  getAPIKey: (provider: string) => Promise<string | null>;
  setAPIKey: (provider: string, key: string) => Promise<void>;
}

interface Window {
  electronAPI?: ElectronAPI;
}

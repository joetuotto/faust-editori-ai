import type { Project } from './types';

interface ExportOptions {
  format: 'pdf' | 'docx' | 'txt';
  title?: string;
  content?: string;
}

interface FileResult {
  success: boolean;
  data?: Project | string;
  error?: string;
}

export class FileManager {
  async saveProject(project: Project): Promise<FileResult> {
    if (!window.electronAPI) {
      return { success: false, error: 'Electron API not available' };
    }

    const projectWithAll = {
      ...project,
      // ... ensure all fields
    };
    const result = await window.electronAPI.saveProject(projectWithAll);
    if (result.success) {
      alert('Projekti tallennettu!');
    }
    return result;
  }

  async loadProject(): Promise<FileResult> {
    if (!window.electronAPI) {
      return { success: false, error: 'Electron API not available' };
    }

    const result = await window.electronAPI.loadProject();
    if (result.success) {
      // Apply loaded project
      alert('Projekti ladattu!');
    }
    return result;
  }

  async exportDocument(format: string, activeItem: any): Promise<FileResult> {
    if (!window.electronAPI) {
      return { success: false, error: 'Electron API not available' };
    }

    if (format === 'pdf') {
      const html = `<!DOCTYPE html><html>...</html>`; // From app.js
      return await window.electronAPI.exportPDF({ html, title: activeItem.title });
    }
    return await window.electronAPI.exportDocument({
      content: activeItem.content,
      title: activeItem.title,
      format
    });
  }

  async exportFullProject(project: Project, format: string): Promise<FileResult> {
    if (!window.electronAPI) {
      return { success: false, error: 'Electron API not available' };
    }

    return await window.electronAPI.exportFullProject({ project, format });
  }

  // Import logic
  async importDocument(filePath: string): Promise<FileResult> {
    // Impl using electronAPI
    return { success: false, error: 'Not implemented' };
  }

  static create(): FileManager {
    return new FileManager();
  }
}


















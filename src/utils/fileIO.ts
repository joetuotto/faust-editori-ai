/**
 * File I/O Utilities
 * Handles project save/load operations through Electron API
 */

import type { Project } from '../types';

export interface SaveResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface LoadResult {
  success: boolean;
  data?: Project;
  filePath?: string;
  error?: string;
}

/**
 * Save project to disk
 */
export async function saveProject(project: Project): Promise<SaveResult> {
  if (!window.electronAPI?.saveProject) {
    return { success: false, error: 'Electron API not available' };
  }

  try {
    const result = await window.electronAPI.saveProject(project);
    return result;
  } catch (error: any) {
    console.error('[FileIO] Save error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Load project from disk (with file picker)
 */
export async function loadProject(): Promise<LoadResult> {
  if (!window.electronAPI?.loadProject) {
    return { success: false, error: 'Electron API not available' };
  }

  try {
    const result = await window.electronAPI.loadProject();
    return result;
  } catch (error: any) {
    console.error('[FileIO] Load error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Load project from specific path
 */
export async function loadProjectFromPath(filePath: string): Promise<LoadResult> {
  if (!window.electronAPI?.loadProjectFromPath) {
    return { success: false, error: 'Electron API not available' };
  }

  try {
    const result = await window.electronAPI.loadProjectFromPath(filePath);
    return result;
  } catch (error: any) {
    console.error('[FileIO] Load from path error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Autosave project (background save)
 */
export async function autosaveProject(project: Project): Promise<SaveResult> {
  if (!window.electronAPI?.autosaveProject) {
    return { success: false, error: 'Electron API not available' };
  }

  try {
    const result = await window.electronAPI.autosaveProject(project);
    return result;
  } catch (error: any) {
    console.error('[FileIO] Autosave error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save backup
 */
export async function saveBackup(project: Project): Promise<SaveResult> {
  if (!window.electronAPI?.saveBackup) {
    return { success: false, error: 'Electron API not available' };
  }

  try {
    const result = await window.electronAPI.saveBackup(project);
    return result;
  } catch (error: any) {
    console.error('[FileIO] Backup save error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Load backup
 */
export async function loadBackup(): Promise<LoadResult> {
  if (!window.electronAPI?.loadBackup) {
    return { success: false, error: 'Electron API not available' };
  }

  try {
    const result = await window.electronAPI.loadBackup();
    return result;
  } catch (error: any) {
    console.error('[FileIO] Backup load error:', error);
    return { success: false, error: error.message };
  }
}

export default {
  saveProject,
  loadProject,
  loadProjectFromPath,
  autosaveProject,
  saveBackup,
  loadBackup
};

/**
 * useProject Hook
 * Manages project state, chapters, characters, and story elements
 */

import { useState, useCallback, useEffect } from 'react';
import type { Project, Chapter, Character, Location, PlotThread } from '../types';
import { saveProject as saveProjectAPI, autosaveProject as autosaveProjectAPI } from '../utils/fileIO';
import { validateProject } from '../utils/validators';

const DEFAULT_PROJECT: Project = {
  title: 'Untitled Project',
  author: '',
  genre: 'fiction',
  language: 'fi',
  description: '',
  targetWordCount: 50000,
  created: new Date().toISOString(),
  modified: new Date().toISOString(),
  structure: [],
  characters: [],
  locations: [],
  plotThreads: [],
  apiConfig: {
    provider: 'anthropic',
    isConfigured: false,
    anthropic: {},
    openai: {},
    deepseek: {},
    grok: {},
    google: {},
    local: { endpoint: 'http://localhost:1234/v1' }
  }
};

export function useProject() {
  const [project, setProject] = useState<Project>(DEFAULT_PROJECT);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);

  // Get active chapter
  const activeChapter = project.structure.find(ch => ch.id === activeChapterId) || null;

  // Update project and mark as modified
  const updateProject = useCallback((updates: Partial<Project> | ((prev: Project) => Project)) => {
    setProject(prev => {
      const next = typeof updates === 'function' ? updates(prev) : { ...prev, ...updates };
      return {
        ...next,
        modified: new Date().toISOString()
      };
    });
    setUnsavedChanges(true);
  }, []);

  // Chapter operations
  const addChapter = useCallback((title: string = 'New Chapter') => {
    const newChapter: Chapter = {
      id: `chapter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      content: '',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      wordCount: 0,
      status: 'draft',
      annotations: []
    };

    updateProject(prev => ({
      ...prev,
      structure: [...prev.structure, newChapter]
    }));

    setActiveChapterId(newChapter.id);
    return newChapter.id;
  }, [updateProject]);

  const updateChapter = useCallback((chapterId: string, updates: Partial<Chapter>) => {
    updateProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === chapterId
          ? { ...ch, ...updates, modified: new Date().toISOString() }
          : ch
      )
    }));
  }, [updateProject]);

  const deleteChapter = useCallback((chapterId: string) => {
    updateProject(prev => ({
      ...prev,
      structure: prev.structure.filter(ch => ch.id !== chapterId)
    }));

    // If deleted chapter was active, select another
    if (activeChapterId === chapterId) {
      const remaining = project.structure.filter(ch => ch.id !== chapterId);
      setActiveChapterId(remaining.length > 0 ? remaining[0].id : null);
    }
  }, [updateProject, activeChapterId, project.structure]);

  const reorderChapters = useCallback((fromIndex: number, toIndex: number) => {
    updateProject(prev => {
      const newStructure = [...prev.structure];
      const [removed] = newStructure.splice(fromIndex, 1);
      newStructure.splice(toIndex, 0, removed);
      return { ...prev, structure: newStructure };
    });
  }, [updateProject]);

  // Character operations
  const addCharacter = useCallback((character: Character) => {
    updateProject(prev => ({
      ...prev,
      characters: [...prev.characters, character]
    }));
  }, [updateProject]);

  const updateCharacter = useCallback((characterId: string, updates: Partial<Character>) => {
    updateProject(prev => ({
      ...prev,
      characters: prev.characters.map(char =>
        char.id === characterId ? { ...char, ...updates } : char
      )
    }));
  }, [updateProject]);

  const deleteCharacter = useCallback((characterId: string) => {
    updateProject(prev => ({
      ...prev,
      characters: prev.characters.filter(char => char.id !== characterId)
    }));
  }, [updateProject]);

  // Location operations
  const addLocation = useCallback((location: Location) => {
    updateProject(prev => ({
      ...prev,
      locations: [...prev.locations, location]
    }));
  }, [updateProject]);

  const deleteLocation = useCallback((locationId: string) => {
    updateProject(prev => ({
      ...prev,
      locations: prev.locations.filter(loc => loc.id !== locationId)
    }));
  }, [updateProject]);

  // Plot thread operations
  const addPlotThread = useCallback((thread: PlotThread) => {
    updateProject(prev => ({
      ...prev,
      plotThreads: [...prev.plotThreads, thread]
    }));
  }, [updateProject]);

  const deletePlotThread = useCallback((threadId: string) => {
    updateProject(prev => ({
      ...prev,
      plotThreads: prev.plotThreads.filter(t => t.id !== threadId)
    }));
  }, [updateProject]);

  // Save operations
  const saveProject = useCallback(async () => {
    if (!validateProject(project)) {
      console.error('[useProject] Invalid project data');
      return { success: false, error: 'Invalid project data' };
    }

    const result = await saveProjectAPI(project);
    if (result.success) {
      setUnsavedChanges(false);
      if (result.filePath) {
        setFilePath(result.filePath);
      }
    }
    return result;
  }, [project]);

  // Auto-save (debounced in parent component)
  const autosave = useCallback(async () => {
    if (!unsavedChanges) return { success: true };
    return autosaveProjectAPI(project);
  }, [project, unsavedChanges]);

  // New project
  const newProject = useCallback(() => {
    if (unsavedChanges) {
      if (!window.confirm('You have unsaved changes. Create new project anyway?')) {
        return;
      }
    }
    setProject(DEFAULT_PROJECT);
    setUnsavedChanges(false);
    setActiveChapterId(null);
    setFilePath(null);
  }, [unsavedChanges]);

  // Load project
  const loadProject = useCallback((loadedProject: Project, loadedFilePath?: string) => {
    if (!validateProject(loadedProject)) {
      console.error('[useProject] Invalid project data');
      return false;
    }

    setProject(loadedProject);
    setUnsavedChanges(false);
    setFilePath(loadedFilePath || null);

    // Set active chapter to first chapter if exists
    if (loadedProject.structure.length > 0) {
      setActiveChapterId(loadedProject.structure[0].id);
    }

    return true;
  }, []);

  // Calculate total word count
  const totalWordCount = project.structure.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);

  return {
    // State
    project,
    unsavedChanges,
    activeChapterId,
    activeChapter,
    filePath,
    totalWordCount,

    // Project operations
    setProject,
    updateProject,
    newProject,
    loadProject,
    saveProject,
    autosave,

    // Chapter operations
    addChapter,
    updateChapter,
    deleteChapter,
    reorderChapters,
    setActiveChapterId,

    // Character operations
    addCharacter,
    updateCharacter,
    deleteCharacter,

    // Location operations
    addLocation,
    deleteLocation,

    // Plot thread operations
    addPlotThread,
    deletePlotThread
  };
}

export default useProject;

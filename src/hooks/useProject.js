import { useState, useEffect, useCallback } from 'react';
import StorageManager from '../services/storage/StorageManager';

export function useProject() {
  const [project, setProject] = useState({
    title: 'Untitled Project',
    story: {
      chapters: [],
      outline: '',
      timeline: []
    },
    characters: [],
    scenes: [],
    mirrorBlocks: []
  });

  const saveProject = useCallback(() => {
    return StorageManager.saveProject(project);
  }, [project]);

  const loadProject = useCallback(() => {
    const loaded = StorageManager.loadProject();
    if (loaded) setProject(loaded);
  }, []);

  useEffect(() => {
    loadProject();
  }, []);

  return {
    project,
    setProject,
    saveProject,
    loadProject
  };
}


















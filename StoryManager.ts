import React, { createContext, useContext, useState, useReducer, ReactNode } from 'react';
import type { Project, ActiveItem } from './types';

interface StoryContextType {
  project: Project;
  setProject: (project: Project) => void;
  activeItemId: string;
  setActiveItemId: (id: string) => void;
  getActiveItem: () => ActiveItem | null;
  updateEditorContent: (content: string, start: number, end: number, options?: any) => void;
  checkFirst: boolean;
  setCheckFirst: (val: boolean) => void;
  // ... other states
}

const StoryContext = createContext<StoryContextType | undefined>(undefined);

export const StoryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [project, setProject] = useState<Project>(() => createDefaultProject()); // Fixed arrow function
  const [activeItemId, setActiveItemId] = useState<string>('');
  const [checkFirst, setCheckFirst] = useState<boolean>(true);
  // ... other states

  const getActiveItem = (): ActiveItem | null => {
    // Extracted logic
    if (!project.items) return null;
    // Simple find for now - expand later
    return project.items.find(item => item.id === activeItemId) || null;
  };

  const updateEditorContent = (newContent: string, selectionStart: number, selectionEnd: number, options = {}) => {
    // Placeholder impl - full history in future
    setProject(prev => ({ ...prev, items: prev.items.map(item => 
      item.id === activeItemId ? { ...item, content: newContent } : item 
    ) }));
  };

  // Continuity logic
  const checkContinuity = async (chapter: number, content: string): Promise<{ issues: any[] }> => {
    // Use StoryContinuityTracker - mock for now
    return { issues: [] };
  };

  const value = {
    project,
    setProject,
    activeItemId,
    setActiveItemId,
    getActiveItem,
    updateEditorContent,
    checkFirst,
    setCheckFirst,
    // ...
  };

  return (
    <StoryContext.Provider value={value}>
      {children}
    </StoryContext.Provider>
  );
};

export const useStory = () => {
  const context = useContext(StoryContext);
  if (!context) throw new Error('useStory must be used within StoryProvider');
  return context;
};

// Types
export interface Project {
  items: any[];
  story: {
    chapters: any[];
    outline: string[];
    // ...
  };
  characters: any[];
  // ...
}

export interface ActiveItem {
  id: string;
  title: string;
  content: string;
  type: string;
  // ...
}

const createDefaultProject = (): Project => ({
  // Default from app.js
  items: [],
  story: { chapters: [], outline: [] },
  characters: [],
  // ...
});

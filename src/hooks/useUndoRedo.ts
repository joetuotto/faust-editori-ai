/**
 * useUndoRedo Hook
 * Implements command pattern for undo/redo functionality
 */

import { useState, useCallback } from 'react';

export interface Command<T = any> {
  execute: () => T;
  undo: () => void;
  description?: string;
}

interface UseUndoRedoOptions {
  maxHistorySize?: number;
}

export function useUndoRedo<T = any>(options: UseUndoRedoOptions = {}) {
  const { maxHistorySize = 50 } = options;

  const [history, setHistory] = useState<Command<T>[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const canUndo = currentIndex >= 0;
  const canRedo = currentIndex < history.length - 1;

  /**
   * Execute a command and add it to history
   */
  const execute = useCallback((command: Command<T>): T => {
    const result = command.execute();

    setHistory(prev => {
      // Remove any commands after current index (we're creating a new branch)
      const newHistory = prev.slice(0, currentIndex + 1);

      // Add new command
      newHistory.push(command);

      // Trim history if it exceeds max size
      if (newHistory.length > maxHistorySize) {
        newHistory.shift();
        setCurrentIndex(prev => prev - 1);
      }

      return newHistory;
    });

    setCurrentIndex(prev => Math.min(prev + 1, maxHistorySize - 1));

    return result;
  }, [currentIndex, maxHistorySize]);

  /**
   * Undo the last command
   */
  const undo = useCallback(() => {
    if (!canUndo) {
      console.warn('[useUndoRedo] Cannot undo: no commands in history');
      return;
    }

    const command = history[currentIndex];
    command.undo();
    setCurrentIndex(prev => prev - 1);

    console.log(`[useUndoRedo] Undid: ${command.description || 'unnamed command'}`);
  }, [canUndo, history, currentIndex]);

  /**
   * Redo the next command
   */
  const redo = useCallback(() => {
    if (!canRedo) {
      console.warn('[useUndoRedo] Cannot redo: no commands to redo');
      return;
    }

    const command = history[currentIndex + 1];
    command.execute();
    setCurrentIndex(prev => prev + 1);

    console.log(`[useUndoRedo] Redid: ${command.description || 'unnamed command'}`);
  }, [canRedo, history, currentIndex]);

  /**
   * Clear all history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  /**
   * Get current command description
   */
  const getCurrentCommand = useCallback(() => {
    if (currentIndex < 0 || currentIndex >= history.length) {
      return null;
    }
    return history[currentIndex];
  }, [history, currentIndex]);

  return {
    execute,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    getCurrentCommand,
    historySize: history.length,
    currentIndex
  };
}

/**
 * Helper: Create a command for updating state
 */
export function createStateUpdateCommand<T>(
  prevState: T,
  nextState: T,
  updateFn: (state: T) => void,
  description?: string
): Command<void> {
  return {
    execute: () => updateFn(nextState),
    undo: () => updateFn(prevState),
    description: description || 'Update state'
  };
}

/**
 * Helper: Create a command for text editing
 */
export function createTextEditCommand(
  prevText: string,
  nextText: string,
  updateFn: (text: string) => void,
  description?: string
): Command<void> {
  return {
    execute: () => updateFn(nextText),
    undo: () => updateFn(prevText),
    description: description || 'Edit text'
  };
}

export default useUndoRedo;

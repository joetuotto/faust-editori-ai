/**
 * CommandManager - Centralized Undo/Redo System
 *
 * Implements Command Pattern for all project operations.
 * Max 50 undo steps to prevent memory issues.
 */

class CommandManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.maxUndoSteps = 50;
  }

  /**
   * Execute a command and add to undo stack
   * @param {Command} command
   */
  execute(command) {
    command.execute();
    this.undoStack.push(command);

    // Clear redo stack when new action is performed
    this.redoStack = [];

    // Limit undo stack size
    if (this.undoStack.length > this.maxUndoSteps) {
      this.undoStack.shift();
    }

    console.log('[CommandManager] Executed:', command.name, '| Undo stack:', this.undoStack.length);
  }

  /**
   * Undo last command
   * @returns {boolean} Success
   */
  undo() {
    if (this.undoStack.length === 0) {
      console.log('[CommandManager] Nothing to undo');
      return false;
    }

    const command = this.undoStack.pop();
    command.undo();
    this.redoStack.push(command);

    console.log('[CommandManager] Undid:', command.name, '| Undo stack:', this.undoStack.length);
    return true;
  }

  /**
   * Redo last undone command
   * @returns {boolean} Success
   */
  redo() {
    if (this.redoStack.length === 0) {
      console.log('[CommandManager] Nothing to redo');
      return false;
    }

    const command = this.redoStack.pop();
    command.execute();
    this.undoStack.push(command);

    console.log('[CommandManager] Redid:', command.name, '| Redo stack:', this.redoStack.length);
    return true;
  }

  /**
   * Check if undo is available
   * @returns {boolean}
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   * @returns {boolean}
   */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Clear all history
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    console.log('[CommandManager] History cleared');
  }

  /**
   * Get undo stack info
   * @returns {Object}
   */
  getInfo() {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      maxSteps: this.maxUndoSteps,
      recentActions: this.undoStack.slice(-5).map(cmd => cmd.name)
    };
  }
}

// ============================================
// CONCRETE COMMANDS
// ============================================

/**
 * Update chapter content
 */
class UpdateContentCommand {
  constructor(setProject, chapterId, oldContent, newContent) {
    this.name = 'Update Content';
    this.setProject = setProject;
    this.chapterId = chapterId;
    this.oldContent = oldContent;
    this.newContent = newContent;
  }

  execute() {
    this.setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === this.chapterId
          ? { ...ch, content: this.newContent, wordCount: this.newContent.trim().split(/\s+/).length }
          : ch
      )
    }));
  }

  undo() {
    this.setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === this.chapterId
          ? { ...ch, content: this.oldContent, wordCount: this.oldContent.trim().split(/\s+/).length }
          : ch
      )
    }));
  }
}

/**
 * Add character
 */
class AddCharacterCommand {
  constructor(setProject, character) {
    this.name = 'Add Character';
    this.setProject = setProject;
    this.character = character;
  }

  execute() {
    this.setProject(prev => ({
      ...prev,
      characters: [...prev.characters, this.character]
    }));
  }

  undo() {
    this.setProject(prev => ({
      ...prev,
      characters: prev.characters.filter(ch => ch.id !== this.character.id)
    }));
  }
}

/**
 * Delete character
 */
class DeleteCharacterCommand {
  constructor(setProject, character, index) {
    this.name = 'Delete Character';
    this.setProject = setProject;
    this.character = character;
    this.index = index;
  }

  execute() {
    this.setProject(prev => ({
      ...prev,
      characters: prev.characters.filter(ch => ch.id !== this.character.id)
    }));
  }

  undo() {
    this.setProject(prev => {
      const newCharacters = [...prev.characters];
      newCharacters.splice(this.index, 0, this.character);
      return {
        ...prev,
        characters: newCharacters
      };
    });
  }
}

/**
 * Update character
 */
class UpdateCharacterCommand {
  constructor(setProject, characterId, oldData, newData) {
    this.name = 'Update Character';
    this.setProject = setProject;
    this.characterId = characterId;
    this.oldData = oldData;
    this.newData = newData;
  }

  execute() {
    this.setProject(prev => ({
      ...prev,
      characters: prev.characters.map(ch =>
        ch.id === this.characterId ? { ...ch, ...this.newData } : ch
      )
    }));
  }

  undo() {
    this.setProject(prev => ({
      ...prev,
      characters: prev.characters.map(ch =>
        ch.id === this.characterId ? { ...ch, ...this.oldData } : ch
      )
    }));
  }
}

/**
 * Update project settings
 */
class UpdateProjectSettingsCommand {
  constructor(setProject, oldSettings, newSettings) {
    this.name = 'Update Project Settings';
    this.setProject = setProject;
    this.oldSettings = oldSettings;
    this.newSettings = newSettings;
  }

  execute() {
    this.setProject(prev => ({
      ...prev,
      ...this.newSettings
    }));
  }

  undo() {
    this.setProject(prev => ({
      ...prev,
      ...this.oldSettings
    }));
  }
}

/**
 * Add chapter
 */
class AddChapterCommand {
  constructor(setProject, setActiveChapterId, chapter) {
    this.name = 'Add Chapter';
    this.setProject = setProject;
    this.setActiveChapterId = setActiveChapterId;
    this.chapter = chapter;
  }

  execute() {
    this.setProject(prev => ({
      ...prev,
      structure: [...prev.structure, this.chapter]
    }));
    this.setActiveChapterId(this.chapter.id);
  }

  undo() {
    this.setProject(prev => ({
      ...prev,
      structure: prev.structure.filter(ch => ch.id !== this.chapter.id)
    }));
  }
}

/**
 * Delete chapter
 */
class DeleteChapterCommand {
  constructor(setProject, chapter, index) {
    this.name = 'Delete Chapter';
    this.setProject = setProject;
    this.chapter = chapter;
    this.index = index;
  }

  execute() {
    this.setProject(prev => ({
      ...prev,
      structure: prev.structure.filter(ch => ch.id !== this.chapter.id)
    }));
  }

  undo() {
    this.setProject(prev => {
      const newStructure = [...prev.structure];
      newStructure.splice(this.index, 0, this.chapter);
      return {
        ...prev,
        structure: newStructure
      };
    });
  }
}

/**
 * Update chapter metadata
 */
class UpdateChapterMetadataCommand {
  constructor(setProject, chapterId, oldMetadata, newMetadata) {
    this.name = 'Update Chapter Metadata';
    this.setProject = setProject;
    this.chapterId = chapterId;
    this.oldMetadata = oldMetadata;
    this.newMetadata = newMetadata;
  }

  execute() {
    this.setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === this.chapterId ? { ...ch, ...this.newMetadata } : ch
      )
    }));
  }

  undo() {
    this.setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === this.chapterId ? { ...ch, ...this.oldMetadata } : ch
      )
    }));
  }
}

// Export classes
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CommandManager,
    UpdateContentCommand,
    AddCharacterCommand,
    DeleteCharacterCommand,
    UpdateCharacterCommand,
    UpdateProjectSettingsCommand,
    AddChapterCommand,
    DeleteChapterCommand,
    UpdateChapterMetadataCommand
  };
}

// For browser (window global)
if (typeof window !== 'undefined') {
  window.CommandManager = CommandManager;
  window.UpdateContentCommand = UpdateContentCommand;
  window.AddCharacterCommand = AddCharacterCommand;
  window.DeleteCharacterCommand = DeleteCharacterCommand;
  window.UpdateCharacterCommand = UpdateCharacterCommand;
  window.UpdateProjectSettingsCommand = UpdateProjectSettingsCommand;
  window.AddChapterCommand = AddChapterCommand;
  window.DeleteChapterCommand = DeleteChapterCommand;
  window.UpdateChapterMetadataCommand = UpdateChapterMetadataCommand;
}

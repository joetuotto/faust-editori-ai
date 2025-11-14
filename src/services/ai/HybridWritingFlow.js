/**
 * HybridWritingFlow - Mix manual and AI writing
 *
 * Features:
 * - Continue from user's text
 * - Expand on user's outline
 * - Rewrite sections with AI
 * - Maintain author's voice and style
 */

class HybridWritingFlow {
  constructor(electronAPI, project, continuityTracker = null) {
    this.electronAPI = electronAPI;
    this.project = project;
    this.continuityTracker = continuityTracker;
  }

  /**
   * Continue writing from where user left off
   * @param {Number} chapterIndex
   * @param {String} existingContent - What user has written so far
   * @param {Object} options - { paragraphs, tone, mode }
   */
  async continueFromText(chapterIndex, existingContent, options = {}) {
    const {
      paragraphs = 2,
      tone = 'match',  // 'match' = match existing tone, or specify: 'dramatic', 'lighthearted', etc.
      mode = null
    } = options;

    // Get AI mode
    const aiMode = mode || this.project.ai.currentMode || 'production';
    const modeConfig = this.project.ai.modes[aiMode];

    // Build continuation prompt
    let prompt = `${modeConfig.systemPrompt}\n\n`;
    prompt += `Continue writing the following text. Write ${paragraphs} more paragraphs in the same style and tone.\n\n`;

    // Add continuity context if available
    if (this.continuityTracker) {
      const context = this.continuityTracker.getContextForChapter(chapterIndex);
      const contextText = this.continuityTracker.formatContextAsText(context);
      if (contextText) {
        prompt += contextText + '\n';
      }
    }

    prompt += `EXISTING TEXT:\n${existingContent}\n\n`;
    prompt += `Continue writing (${paragraphs} paragraphs):`;

    // Call AI
    const result = await this.callAI(prompt, mode);

    return {
      success: result.success,
      continuation: result.data,
      existingContent,
      combined: existingContent + '\n\n' + result.data
    };
  }

  /**
   * Expand an outline into full prose
   * @param {Number} chapterIndex
   * @param {String} outline - Brief outline/synopsis
   * @param {Object} options - { targetWords, style, mode }
   */
  async expandOutline(chapterIndex, outline, options = {}) {
    const {
      targetWords = 2000,
      style = 'vivid', // 'vivid', 'concise', 'descriptive', 'dialogue-heavy'
      mode = null
    } = options;

    const aiMode = mode || this.project.ai.currentMode || 'production';
    const modeConfig = this.project.ai.modes[aiMode];

    let prompt = `${modeConfig.systemPrompt}\n\n`;
    prompt += `Expand the following outline into full prose. Target length: approximately ${targetWords} words.\n`;
    prompt += `Style: ${style}\n\n`;

    // Add continuity context
    if (this.continuityTracker) {
      const context = this.continuityTracker.getContextForChapter(chapterIndex);
      const contextText = this.continuityTracker.formatContextAsText(context);
      if (contextText) {
        prompt += contextText + '\n';
      }
    }

    // Add chapter info
    const chapter = this.project.structure[chapterIndex];
    if (chapter) {
      prompt += `CHAPTER: ${chapter.title}\n\n`;
    }

    prompt += `OUTLINE:\n${outline}\n\n`;
    prompt += `Write the full chapter:`;

    const result = await this.callAI(prompt, mode);

    return {
      success: result.success,
      content: result.data,
      outline,
      wordCount: result.data ? result.data.split(/\s+/).length : 0
    };
  }

  /**
   * Rewrite a section with specific instructions
   * @param {String} originalText
   * @param {String} instruction - e.g., "make it more dramatic", "add more dialogue"
   * @param {Object} options - { mode }
   */
  async rewriteSection(originalText, instruction, options = {}) {
    const { mode = null } = options;

    const aiMode = mode || this.project.ai.currentMode || 'production';
    const modeConfig = this.project.ai.modes[aiMode];

    let prompt = `${modeConfig.systemPrompt}\n\n`;
    prompt += `Rewrite the following text according to this instruction: "${instruction}"\n\n`;
    prompt += `ORIGINAL TEXT:\n${originalText}\n\n`;
    prompt += `REWRITTEN VERSION:`;

    const result = await this.callAI(prompt, mode);

    return {
      success: result.success,
      original: originalText,
      rewritten: result.data,
      instruction
    };
  }

  /**
   * Generate a scene from a brief description
   * @param {Number} chapterIndex
   * @param {String} sceneDescription - Brief scene setup
   * @param {Object} options - { length, focus, mode }
   */
  async generateScene(chapterIndex, sceneDescription, options = {}) {
    const {
      length = 'medium', // 'short' (~500 words), 'medium' (~1000), 'long' (~2000)
      focus = 'balanced', // 'action', 'dialogue', 'description', 'balanced'
      mode = null
    } = options;

    const targetWords = length === 'short' ? 500 : length === 'long' ? 2000 : 1000;

    const aiMode = mode || this.project.ai.currentMode || 'production';
    const modeConfig = this.project.ai.modes[aiMode];

    let prompt = `${modeConfig.systemPrompt}\n\n`;
    prompt += `Write a scene based on the following description. Target length: ~${targetWords} words.\n`;
    prompt += `Focus: ${focus}\n\n`;

    // Add continuity context
    if (this.continuityTracker) {
      const context = this.continuityTracker.getContextForChapter(chapterIndex);
      const contextText = this.continuityTracker.formatContextAsText(context);
      if (contextText) {
        prompt += contextText + '\n';
      }
    }

    prompt += `SCENE DESCRIPTION:\n${sceneDescription}\n\n`;
    prompt += `Write the scene:`;

    const result = await this.callAI(prompt, mode);

    return {
      success: result.success,
      scene: result.data,
      description: sceneDescription,
      wordCount: result.data ? result.data.split(/\s+/).length : 0
    };
  }

  /**
   * Get writing suggestions for improving text
   * @param {String} text
   * @param {String} aspect - 'pacing', 'dialogue', 'description', 'all'
   */
  async getSuggestions(text, aspect = 'all') {
    const aiMode = 'polish'; // Always use polish mode for critique
    const modeConfig = this.project.ai.modes[aiMode];

    let prompt = `${modeConfig.systemPrompt}\n\n`;
    prompt += `Analyze the following text and provide specific suggestions for improvement.\n`;
    prompt += `Focus on: ${aspect}\n\n`;
    prompt += `TEXT:\n${text}\n\n`;
    prompt += `Provide 3-5 specific, actionable suggestions:`;

    const result = await this.callAI(prompt, aiMode);

    return {
      success: result.success,
      suggestions: result.data,
      aspect
    };
  }

  /**
   * Call AI with appropriate provider
   */
  async callAI(prompt, mode = null) {
    if (!this.electronAPI) {
      throw new Error('Electron API not available');
    }

    const provider = this.project.ai.provider || 'anthropic';
    const modelName = this.project.ai.models?.[provider];

    let result;
    if (provider === 'anthropic') {
      result = await this.electronAPI.claudeAPI({ prompt, model: modelName });
    } else if (provider === 'openai') {
      result = await this.electronAPI.openaiAPI({ prompt, model: modelName });
    } else if (provider === 'grok') {
      result = await this.electronAPI.grokAPI({ prompt, model: modelName });
    } else if (provider === 'deepseek') {
      result = await this.electronAPI.deepseekAPI({ prompt, model: modelName });
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    if (!result?.success) {
      throw new Error(result?.error || 'AI generation failed');
    }

    return {
      success: true,
      data: result.data.trim()
    };
  }
}

// Export for use in app.js (Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HybridWritingFlow;
}

// Make available globally for browser
if (typeof window !== 'undefined') {
  window.HybridWritingFlow = HybridWritingFlow;
}

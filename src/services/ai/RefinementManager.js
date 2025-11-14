/**
 * RefinementManager
 *
 * Manages iterative refinement of chapters with user feedback
 * - Regenerate chapters with specific feedback
 * - Version comparison
 * - Rating and feedback tracking
 */

class RefinementManager {
  constructor(electronAPI, project, continuityTracker = null) {
    this.electronAPI = electronAPI;
    this.project = project;
    this.continuityTracker = continuityTracker;
  }

  /**
   * Regenerate chapter with user feedback
   */
  async regenerateChapter(chapter, userFeedback, mode = 'production', options = {}) {
    if (!this.electronAPI) {
      throw new Error('Electron API not available');
    }

    // Get current content (from latest version)
    const currentVersion = chapter.versions?.find(v => v.id === chapter.currentVersion);
    const currentContent = currentVersion?.content || chapter.content;

    // Build refinement prompt
    const prompt = this.buildRefinementPrompt(chapter, currentContent, userFeedback, options);

    // Get mode configuration
    const modeConfig = this.project.ai.modes[mode];
    if (!modeConfig) {
      throw new Error(`Unknown mode: ${mode}`);
    }

    // Get provider and model
    const provider = this.project.ai.provider || 'anthropic';
    const modelName = this.project.ai.models[provider];

    try {
      // Call AI API
      let result;
      if (provider === 'anthropic') {
        result = await this.electronAPI.claudeAPI({
          prompt,
          model: modelName,
          temperature: modeConfig.temperature,
          maxTokens: modeConfig.maxTokens
        });
      } else if (provider === 'openai') {
        result = await this.electronAPI.openaiAPI({
          prompt,
          model: modelName,
          temperature: modeConfig.temperature,
          maxTokens: modeConfig.maxTokens
        });
      } else if (provider === 'grok') {
        result = await this.electronAPI.grokAPI({
          prompt,
          model: modelName,
          temperature: modeConfig.temperature,
          maxTokens: modeConfig.maxTokens
        });
      } else if (provider === 'deepseek') {
        result = await this.electronAPI.deepseekAPI({
          prompt,
          model: modelName,
          temperature: modeConfig.temperature,
          maxTokens: modeConfig.maxTokens
        });
      }

      if (!result.success) {
        throw new Error(result.error || 'Generation failed');
      }

      const newContent = result.data;
      const wordCount = newContent.split(/\s+/).filter(w => w.length > 0).length;

      // Create new version
      const newVersion = {
        id: `v${(chapter.versions?.length || 0) + 1}`,
        content: newContent,
        timestamp: new Date().toISOString(),
        generatedFrom: {
          mode,
          model: modelName,
          provider,
          prompt,
          basedOn: chapter.currentVersion,
          userFeedback,
          isRefinement: true
        },
        userRating: null,
        userFeedback: null,
        wordCount,
        cost: 0 // Will be calculated by CostOptimizer
      };

      return {
        success: true,
        version: newVersion,
        content: newContent,
        wordCount
      };

    } catch (error) {
      console.error('[RefinementManager] Generation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Build refinement prompt with feedback
   */
  buildRefinementPrompt(chapter, currentContent, userFeedback, options = {}) {
    const { includeContext = true } = options;

    let prompt = `${this.project.ai.modes[this.project.ai.currentMode]?.systemPrompt || ''}\n\n`;

    prompt += `You are refining a chapter of a book based on the author's feedback.\n\n`;

    // Project context
    if (includeContext) {
      prompt += `BOOK CONTEXT:\n`;
      prompt += `Title: ${this.project.title}\n`;
      prompt += `Genre: ${this.project.genre}\n`;
      if (this.project.synopsis) {
        prompt += `Synopsis: ${this.project.synopsis}\n`;
      }
      prompt += `\n`;
    }

    // Chapter info
    prompt += `CHAPTER:\n`;
    prompt += `${chapter.title}\n\n`;

    // Current version
    prompt += `CURRENT VERSION:\n`;
    prompt += `${currentContent}\n\n`;

    // User feedback
    prompt += `AUTHOR'S FEEDBACK:\n`;
    prompt += `${userFeedback}\n\n`;

    // Continuity context
    if (this.continuityTracker && includeContext) {
      const chapterIndex = this.project.structure.findIndex(ch => ch.id === chapter.id);
      if (chapterIndex !== -1) {
        const context = this.continuityTracker.getContextForChapter(chapterIndex);
        const contextText = this.continuityTracker.formatContextAsText(context);
        if (contextText) {
          prompt += `STORY CONTINUITY:\n`;
          prompt += `${contextText}\n\n`;
        }
      }
    }

    // Task
    prompt += `TASK:\n`;
    prompt += `Rewrite the chapter addressing the author's feedback while maintaining:\n`;
    prompt += `- Story consistency and continuity\n`;
    prompt += `- Character voices and traits\n`;
    prompt += `- The overall narrative flow\n`;
    prompt += `- The chapter's role in the larger story\n\n`;

    prompt += `Return ONLY the rewritten chapter content, no additional commentary.\n`;

    return prompt;
  }

  /**
   * Restore a previous version
   */
  restoreVersion(chapter, versionId) {
    const version = chapter.versions?.find(v => v.id === versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    return {
      success: true,
      content: version.content,
      wordCount: version.wordCount,
      versionId: version.id
    };
  }

  /**
   * Rate a version
   */
  rateVersion(chapter, versionId, rating, feedback = null) {
    const version = chapter.versions?.find(v => v.id === versionId);
    if (!version) {
      throw new Error(`Version ${versionId} not found`);
    }

    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    return {
      success: true,
      versionId,
      rating,
      feedback
    };
  }

  /**
   * Compare two versions (returns diff data)
   */
  compareVersions(version1, version2) {
    // Simple word-based diff
    const words1 = version1.content.split(/\s+/);
    const words2 = version2.content.split(/\s+/);

    return {
      version1: {
        id: version1.id,
        wordCount: version1.wordCount,
        timestamp: version1.timestamp
      },
      version2: {
        id: version2.id,
        wordCount: version2.wordCount,
        timestamp: version2.timestamp
      },
      changes: {
        wordsAdded: Math.max(0, words2.length - words1.length),
        wordsRemoved: Math.max(0, words1.length - words2.length),
        totalWords1: words1.length,
        totalWords2: words2.length
      }
    };
  }

  /**
   * Get version statistics
   */
  getVersionStats(chapter) {
    if (!chapter.versions || chapter.versions.length === 0) {
      return null;
    }

    const versions = chapter.versions;
    const rated = versions.filter(v => v.userRating !== null);
    const totalCost = versions.reduce((sum, v) => sum + (v.cost || 0), 0);

    return {
      totalVersions: versions.length,
      ratedVersions: rated.length,
      averageRating: rated.length > 0
        ? rated.reduce((sum, v) => sum + v.userRating, 0) / rated.length
        : null,
      totalCost,
      refinements: versions.filter(v => v.generatedFrom?.isRefinement).length,
      modes: {
        exploration: versions.filter(v => v.generatedFrom?.mode === 'exploration').length,
        production: versions.filter(v => v.generatedFrom?.mode === 'production').length,
        polish: versions.filter(v => v.generatedFrom?.mode === 'polish').length
      }
    };
  }
}

// Export for use in app.js (Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RefinementManager;
}

// Make available globally for browser
if (typeof window !== 'undefined') {
  window.RefinementManager = RefinementManager;
}

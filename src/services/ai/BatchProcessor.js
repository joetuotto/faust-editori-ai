/**
 * BatchProcessor - Generate multiple chapters sequentially
 *
 * Features:
 * - Generate full book from outline
 * - Use current AI Writing Mode
 * - Track progress and costs
 * - Maintain story continuity
 */

class BatchProcessor {
  constructor(electronAPI, project, costOptimizer, continuityTracker, callAIWithMode) {
    this.electronAPI = electronAPI;
    this.project = project;
    this.costOptimizer = costOptimizer;
    this.continuityTracker = continuityTracker;
    this.callAIWithMode = callAIWithMode; // Function to call AI with mode awareness
    this.isProcessing = false;
    this.currentChapter = null;
    this.onProgress = null; // Callback(chapterIndex, total, status)
  }

  /**
   * Generate multiple chapters from outline
   * @param {Array} outlineChapters - Array of {title, synopsis, notes}
   * @param {Object} options - { startFrom, stopAt, mode }
   */
  async processChapters(outlineChapters, options = {}) {
    if (this.isProcessing) {
      throw new Error('Batch processing already in progress');
    }

    const {
      startFrom = 0,
      stopAt = outlineChapters.length,
      mode = null, // Use project's current mode if null
      onProgress = null
    } = options;

    this.isProcessing = true;
    this.onProgress = onProgress;

    const results = [];
    const errors = [];

    try {
      for (let i = startFrom; i < stopAt; i++) {
        const outline = outlineChapters[i];
        this.currentChapter = i;

        if (this.onProgress) {
          this.onProgress(i, stopAt, 'generating', { title: outline.title });
        }

        try {
          const result = await this.generateChapter(outline, i, mode);
          results.push(result);

          if (this.onProgress) {
            this.onProgress(i, stopAt, 'completed', {
              title: outline.title,
              wordCount: result.wordCount
            });
          }

          // Small delay to avoid rate limiting
          await this.delay(1000);

        } catch (error) {
          console.error(`[BatchProcessor] Error generating chapter ${i}:`, error);
          errors.push({ chapterIndex: i, error: error.message });

          if (this.onProgress) {
            this.onProgress(i, stopAt, 'error', {
              title: outline.title,
              error: error.message
            });
          }
        }
      }

      return {
        success: errors.length === 0,
        results,
        errors,
        totalChapters: stopAt - startFrom,
        completedChapters: results.length
      };

    } finally {
      this.isProcessing = false;
      this.currentChapter = null;
      this.onProgress = null;
    }
  }

  /**
   * Generate a single chapter
   * @param {Object} outline - {title, synopsis, notes}
   * @param {Number} chapterIndex
   * @param {String} mode - AI mode to use (exploration/production/polish)
   */
  async generateChapter(outline, chapterIndex, mode = null) {
    if (!this.electronAPI) {
      throw new Error('Electron API not available');
    }

    // Get AI mode configuration
    const aiMode = mode || this.project.ai.currentMode || 'production';
    const modeConfig = this.project.ai.modes[aiMode];

    // Build context from previous chapters
    const previousContent = (this.project.structure || [])
      .slice(0, chapterIndex)
      .map(ch => `## ${ch.title}\n${ch.content}`)
      .join('\n\n');

    // Build generation prompt (without system prompt, callAIWithMode will add it)
    const prompt = this.buildGenerationPrompt(outline, chapterIndex, previousContent);

    console.log(`[BatchProcessor] Generating chapter ${chapterIndex + 1} in ${aiMode} mode...`);

    let result;
    try {
      // Use callAIWithMode if available (integrates with AI Writing Modes)
      if (this.callAIWithMode) {
        result = await this.callAIWithMode(prompt, {
          temperature: modeConfig.temperature || 0.7,
          max_tokens: modeConfig.maxTokens || 4096
        });
      } else {
        // Fallback to direct API calls
        const provider = this.project.ai.provider || 'anthropic';
        const modelName = this.project.ai.models?.[provider];

        if (provider === 'anthropic') {
          result = await this.electronAPI.claudeAPI({
            prompt: `${modeConfig.systemPrompt}\n\n${prompt}`,
            model: modelName,
            temperature: modeConfig.temperature || 0.7,
            max_tokens: modeConfig.maxTokens || 4096
          });
        } else if (provider === 'openai') {
          result = await this.electronAPI.openaiAPI({
            prompt: `${modeConfig.systemPrompt}\n\n${prompt}`,
            model: modelName,
            temperature: modeConfig.temperature || 0.7,
            max_tokens: modeConfig.maxTokens || 4096
          });
        } else if (provider === 'grok') {
          result = await this.electronAPI.grokAPI({
            prompt: `${modeConfig.systemPrompt}\n\n${prompt}`,
            model: modelName,
            temperature: modeConfig.temperature || 0.7,
            max_tokens: modeConfig.maxTokens || 4096
          });
        } else if (provider === 'deepseek') {
          result = await this.electronAPI.deepseekAPI({
            prompt: `${modeConfig.systemPrompt}\n\n${prompt}`,
            options: {
              model: modelName,
              temperature: modeConfig.temperature || 0.7,
              max_tokens: modeConfig.maxTokens || 4096
            }
          });
        } else {
          throw new Error(`Unknown provider: ${provider}`);
        }
      }
    } catch (error) {
      console.error(`[BatchProcessor] API call failed:`, error);
      throw new Error(`AI generation error: ${error.message}`);
    }

    if (result && result.success === false) {
      const errorMessage = result.error || 'AI generation failed';
      console.error('[BatchProcessor] AI provider returned error:', errorMessage);
      throw new Error(errorMessage);
    }

    console.log(`[BatchProcessor] Chapter generated successfully`);

    // Handle different response formats
    let content;
    if (typeof result === 'string') {
      content = result.trim();
    } else if (result?.success && result?.data) {
      content = result.data.trim();
    } else if (result?.content) {
      content = result.content.trim();
    } else if (result?.text) {
      content = result.text.trim();
    } else if (result && typeof result === 'object') {
      // Debug: log unexpected format
      console.warn('[BatchProcessor] Unexpected AI response format:', {
        keys: Object.keys(result),
        type: typeof result,
        result
      });
      // Try to extract text from common variations
      if (result.choices && result.choices[0]?.message?.content) {
        content = result.choices[0].message.content.trim();
      } else if (result.choices && result.choices[0]?.text) {
        content = result.choices[0].text.trim();
      } else if (result.message?.content) {
        content = result.message.content.trim();
      } else {
        throw new Error('AI response in unexpected format: ' + JSON.stringify(Object.keys(result)));
      }
    } else {
      throw new Error('AI response in unexpected format: result is ' + typeof result);
    }
    const wordCount = content.split(/\s+/).length;

    return {
      success: true,
      title: outline.title,
      content,
      wordCount,
      mode: aiMode,
      chapterIndex,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Build AI generation prompt with context (without system prompt)
   * System prompt is added by callAIWithMode based on AI Writing Mode
   */
  buildGenerationPrompt(outline, chapterIndex, previousContent) {
    // Language settings
    const language = this.project.language || 'fi';
    const languageNames = {
      'fi': 'Finnish',
      'en': 'English'
    };
    const languageName = languageNames[language] || 'Finnish';

    let prompt = `CRITICAL: You MUST write ENTIRELY in ${languageName}. Every single word, sentence, and paragraph must be in ${languageName}.\n\n`;
    prompt += `You are writing Chapter ${chapterIndex + 1} of a novel.\n\n`;

    // Project context
    prompt += `BOOK TITLE: ${this.project.title}\n`;
    prompt += `LANGUAGE: ${languageName} (write everything in ${languageName})\n`;
    prompt += `TARGET LENGTH: ${this.project.targets.totalWords} words\n`;
    if (this.project.synopsis) {
      prompt += `SYNOPSIS: ${this.project.synopsis}\n`;
    }
    prompt += `\n`;

    // Chapter outline
    prompt += `CHAPTER ${chapterIndex + 1}: ${outline.title}\n`;
    if (outline.synopsis) {
      prompt += `Synopsis: ${outline.synopsis}\n`;
    }
    if (outline.notes) {
      prompt += `Notes: ${outline.notes}\n`;
    }
    prompt += `\n`;

    // Previous chapters context (last 2000 words to avoid token limits)
    if (previousContent) {
      const recentContext = previousContent.slice(-8000); // ~2000 words
      prompt += `PREVIOUS CHAPTERS (for continuity):\n${recentContext}\n\n`;
    }

    // Characters
    if (this.project.characters && this.project.characters.length > 0) {
      prompt += `CHARACTERS:\n`;
      this.project.characters.forEach(char => {
        prompt += `- ${char.name || 'Unnamed'}: ${char.basicInfo?.description || ''}\n`;
      });
      prompt += `\n`;
    }

    prompt += `Now write Chapter ${chapterIndex + 1}. Write approximately 2000-3000 words. Focus on vivid descriptions, compelling dialogue, and maintaining story continuity.\n\n`;
    prompt += `REMINDER: Write EVERYTHING in ${languageName}. Do not use any other language.\n\n`;
    prompt += `Begin writing in ${languageName}:`;

    return prompt;
  }

  /**
   * Cancel ongoing batch processing
   */
  cancel() {
    this.isProcessing = false;
  }

  /**
   * Utility delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for use in app.js (Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BatchProcessor;
}

// Make available globally for browser
if (typeof window !== 'undefined') {
  window.BatchProcessor = BatchProcessor;
}

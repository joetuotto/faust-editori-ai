/**
 * PlotThreadTracker
 *
 * Tracks plot threads across chapters and warns about unresolved threads
 * - Automatically detects threads from content
 * - Tracks when threads are introduced/developed/resolved
 * - Warns about forgotten threads
 */

class PlotThreadTracker {
  constructor(project) {
    this.project = project;

    // Initialize plot threads if not exists
    if (!this.project.plotThreads) {
      this.project.plotThreads = [];
    }
  }

  /**
   * Auto-detect threads from all content (using AI)
   */
  async detectThreads(electronAPI) {
    if (!electronAPI) {
      throw new Error('Electron API not available');
    }

    // Build content from all chapters
    const allContent = (this.project.structure || [])
      .map((ch, idx) => `[Chapter ${idx + 1}: ${ch.title}]\n${ch.content}`)
      .join('\n\n---\n\n');

    if (!allContent.trim()) {
      return { success: true, threads: [] };
    }

    const prompt = `Analyze this book and identify the main plot threads.

BOOK CONTEXT:
Title: ${this.project.title}
Genre: ${this.project.genre}

CONTENT:
${allContent}

For each plot thread, identify:
1. Thread name (short, descriptive)
2. Type (main_plot, subplot, mystery, character_arc)
3. Which chapter it's introduced
4. Key developments (chapter numbers)
5. Whether it's resolved (and in which chapter)
6. Open questions
7. Priority (high, medium, low)

Return ONLY valid JSON in this format:
{
  "threads": [
    {
      "name": "Maria's investigation",
      "type": "main_plot",
      "introducedChapter": 1,
      "developments": [3, 5, 7],
      "resolvedChapter": 9,
      "isResolved": true,
      "openQuestions": ["Who sent the letter?"],
      "priority": "high"
    }
  ]
}`;

    try {
      // Call AI API based on provider
      const provider = this.project.ai.provider || 'anthropic';
      const modelName = this.project.ai.models[provider];

      let result;
      if (provider === 'anthropic') {
        result = await electronAPI.claudeAPI({ prompt, model: modelName });
      } else if (provider === 'openai') {
        result = await electronAPI.openaiAPI({ prompt, model: modelName });
      } else if (provider === 'grok') {
        result = await electronAPI.grokAPI({ prompt, model: modelName });
      } else if (provider === 'deepseek') {
        result = await electronAPI.deepseekAPI({ prompt, model: modelName });
      }

      if (!result.success) {
        throw new Error(result.error || 'Thread detection failed');
      }

      // Parse AI response
      const parsed = JSON.parse(result.data);
      const threads = parsed.threads || [];

      // Convert to internal format
      const detectedThreads = threads.map((t, idx) => ({
        id: `thread-${Date.now()}-${idx}`,
        name: t.name,
        description: t.name,
        type: t.type || 'subplot',
        status: t.isResolved ? 'resolved' : 'active',
        priority: t.priority || 'medium',
        color: this.getThreadColor(idx),

        introduced: {
          chapterIndex: (t.introducedChapter || 1) - 1,
          chapterId: this.project.structure[Math.min((t.introducedChapter || 1) - 1, this.project.structure.length - 1)]?.id
        },

        developments: (t.developments || []).map(chNum => ({
          chapterIndex: chNum - 1,
          chapterId: this.project.structure[Math.min(chNum - 1, this.project.structure.length - 1)]?.id,
          timestamp: new Date().toISOString()
        })),

        resolved: t.isResolved ? {
          chapterIndex: (t.resolvedChapter || this.project.structure.length) - 1,
          chapterId: this.project.structure[Math.min((t.resolvedChapter || this.project.structure.length) - 1, this.project.structure.length - 1)]?.id
        } : null,

        openQuestions: t.openQuestions || [],
        lastMentioned: Math.max(t.introducedChapter || 1, ...(t.developments || []), t.resolvedChapter || 0) - 1
      }));

      return {
        success: true,
        threads: detectedThreads
      };

    } catch (error) {
      console.error('[PlotThreadTracker] Detection error:', error);
      return {
        success: false,
        error: error.message,
        threads: []
      };
    }
  }

  /**
   * Get color for thread visualization
   */
  getThreadColor(index) {
    const colors = [
      '#8F7A53', // Bronze
      '#B68B5C', // Light bronze
      '#715C38', // Dark bronze
      '#D4A574', // Gold
      '#9B8259', // Medium bronze
      '#6B5D4F'  // Gray bronze
    ];
    return colors[index % colors.length];
  }

  /**
   * Add new thread manually
   */
  addThread(threadData) {
    const newThread = {
      id: `thread-${Date.now()}`,
      name: threadData.name,
      description: threadData.description || threadData.name,
      type: threadData.type || 'subplot',
      status: 'active',
      priority: threadData.priority || 'medium',
      color: threadData.color || this.getThreadColor(this.project.plotThreads.length),

      introduced: {
        chapterIndex: threadData.introducedChapterIndex,
        chapterId: this.project.structure[threadData.introducedChapterIndex]?.id
      },

      developments: [],
      resolved: null,
      openQuestions: threadData.openQuestions || [],
      lastMentioned: threadData.introducedChapterIndex
    };

    this.project.plotThreads.push(newThread);
    return newThread;
  }

  /**
   * Add development to thread
   */
  addDevelopment(threadId, chapterIndex, description = '') {
    const thread = this.project.plotThreads.find(t => t.id === threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }

    thread.developments.push({
      chapterIndex,
      chapterId: this.project.structure[chapterIndex]?.id,
      description,
      timestamp: new Date().toISOString()
    });

    thread.lastMentioned = chapterIndex;
    return thread;
  }

  /**
   * Resolve thread
   */
  resolveThread(threadId, chapterIndex, description = '') {
    const thread = this.project.plotThreads.find(t => t.id === threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }

    thread.status = 'resolved';
    thread.resolved = {
      chapterIndex,
      chapterId: this.project.structure[chapterIndex]?.id,
      description,
      timestamp: new Date().toISOString()
    };

    thread.lastMentioned = chapterIndex;
    return thread;
  }

  /**
   * Get warnings about threads
   */
  getWarnings() {
    const warnings = [];
    const currentChapterCount = (this.project.structure || []).length;

    (this.project.plotThreads || []).forEach(thread => {
      // Warning: Thread not mentioned in many chapters
      if (thread.status === 'active') {
        const chaptersSince = currentChapterCount - 1 - thread.lastMentioned;

        if (chaptersSince >= 3) {
          warnings.push({
            type: 'forgotten_thread',
            severity: chaptersSince >= 5 ? 'high' : 'medium',
            threadId: thread.id,
            threadName: thread.name,
            message: `Thread "${thread.name}" ei mainittu ${chaptersSince} lukuun`,
            lastMentioned: thread.lastMentioned,
            recommendation: 'Mainitse tai ratkaise lähitulevissa luvuissa'
          });
        }
      }

      // Warning: Unresolved at end
      if (thread.status === 'active' && currentChapterCount > 5) {
        const isNearEnd = currentChapterCount - thread.lastMentioned <= 3;

        if (isNearEnd && !thread.resolved) {
          warnings.push({
            type: 'unresolved_ending',
            severity: 'high',
            threadId: thread.id,
            threadName: thread.name,
            message: `Thread "${thread.name}" ei ratkaistu`,
            recommendation: 'Ratkaise ennen kirjan loppua',
            chaptersRemaining: currentChapterCount - thread.lastMentioned
          });
        }
      }

      // Warning: Too many open questions
      if (thread.openQuestions && thread.openQuestions.length > 3) {
        warnings.push({
          type: 'too_many_questions',
          severity: 'low',
          threadId: thread.id,
          threadName: thread.name,
          message: `Thread "${thread.name}" sisältää ${thread.openQuestions.length} avointa kysymystä`,
          recommendation: 'Vastaa joihinkin kysymyksiin luvuissa'
        });
      }
    });

    return warnings;
  }

  /**
   * Get thread statistics
   */
  getStats() {
    const threads = this.project.plotThreads || [];

    return {
      total: threads.length,
      active: threads.filter(t => t.status === 'active').length,
      resolved: threads.filter(t => t.status === 'resolved').length,
      byType: {
        main_plot: threads.filter(t => t.type === 'main_plot').length,
        subplot: threads.filter(t => t.type === 'subplot').length,
        mystery: threads.filter(t => t.type === 'mystery').length,
        character_arc: threads.filter(t => t.type === 'character_arc').length
      },
      warnings: this.getWarnings().length
    };
  }

  /**
   * Get thread timeline (for visualization)
   */
  getTimeline(threadId) {
    const thread = this.project.plotThreads.find(t => t.id === threadId);
    if (!thread) return null;

    const timeline = [];

    // Add introduction
    timeline.push({
      type: 'introduced',
      chapterIndex: thread.introduced.chapterIndex,
      chapterTitle: this.project.structure[thread.introduced.chapterIndex]?.title
    });

    // Add developments
    thread.developments.forEach(dev => {
      timeline.push({
        type: 'development',
        chapterIndex: dev.chapterIndex,
        chapterTitle: this.project.structure[dev.chapterIndex]?.title,
        description: dev.description
      });
    });

    // Add resolution
    if (thread.resolved) {
      timeline.push({
        type: 'resolved',
        chapterIndex: thread.resolved.chapterIndex,
        chapterTitle: this.project.structure[thread.resolved.chapterIndex]?.title,
        description: thread.resolved.description
      });
    }

    return timeline.sort((a, b) => a.chapterIndex - b.chapterIndex);
  }
}

// Export for use in app.js (Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlotThreadTracker;
}

// Make available globally for browser
if (typeof window !== 'undefined') {
  window.PlotThreadTracker = PlotThreadTracker;
}

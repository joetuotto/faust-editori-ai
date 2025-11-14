/**
 * Story Complexity Analyzer for FAUST
 *
 * Analyzes story complexity and recommends continuity system upgrades.
 * Based on research: docs/CONTINUITY_SYSTEM_ANALYSIS.md
 *
 * Scoring formula:
 * score = (wordCount / 1000) * 0.3 +
 *         characterCount * 2 +
 *         plotThreadCount * 3 +
 *         timelineCount * 5 +
 *         (hasNonLinear ? 10 : 0)
 *
 * Thresholds:
 * - 0-30: Simple (current system OK)
 * - 30-60: Medium (consider Phase 1 optimizations)
 * - 60-100: Complex (recommend Phase 2: Graph Memory)
 * - 100+: Epic (recommend Phase 3: Full Hybrid)
 */

const ComplexityAnalyzer = {
  /**
   * Analyze project complexity
   * @param {Object} project - The project object
   * @returns {Object} Complexity metrics and recommendation
   */
  analyze(project) {
    // Word count
    const wordCount = project.structure.reduce((sum, ch) =>
      sum + (ch.wordCount || 0), 0
    );

    // Unique characters mentioned across all chapters
    const allCharacters = new Set();
    project.structure.forEach(ch => {
      if (ch.notesAI?.characterMentions) {
        ch.notesAI.characterMentions.forEach(name => allCharacters.add(name));
      }
    });
    const characterCount = allCharacters.size || project.characters?.length || 0;

    // Plot threads (from StoryContinuityTracker if available)
    const plotThreadCount = project.plotThreads
      ? Object.keys(project.plotThreads).length
      : this.estimatePlotThreads(project);

    // Detect timelines
    const timelineCount = this.detectTimelineCount(project);

    // Detect non-linear structure
    const hasNonLinear = this.detectNonLinearStructure(project);

    // Calculate complexity score
    const score =
      (wordCount / 1000) * 0.3 +
      characterCount * 2 +
      plotThreadCount * 3 +
      timelineCount * 5 +
      (hasNonLinear ? 10 : 0);

    // Determine phase recommendation
    const phase = this.recommendPhase(score);

    return {
      wordCount,
      characterCount,
      plotThreadCount,
      timelineCount,
      hasNonLinear,
      score: Math.round(score),
      phase,
      recommendation: this.getRecommendation(phase, score)
    };
  },

  /**
   * Estimate plot threads from chapter synopses
   */
  estimatePlotThreads(project) {
    // Simple heuristic: count unique themes across chapters
    const themes = new Set();
    project.structure.forEach(ch => {
      if (ch.notesAI?.themes) {
        ch.notesAI.themes.forEach(theme => themes.add(theme));
      }
    });
    // Assume 1 theme ≈ 0.5 plot threads
    return Math.max(1, Math.floor(themes.size * 0.5));
  },

  /**
   * Detect number of timelines
   */
  detectTimelineCount(project) {
    // Check for temporal keywords in synopses
    const timeKeywords = {
      past: /aikaisemmin|aiemmin|silloin|muinoin|nuorena|lapsuudessa/i,
      future: /tulevaisuudessa|myöhemmin|jonain päivänä|tulee|aikoo/i,
      parallel: /samaan aikaan|samalla hetkellä|meanwhile|sillä välin/i
    };

    let timelines = 1; // Always at least one (present)
    let hasPast = false;
    let hasFuture = false;
    let hasParallel = false;

    project.structure.forEach(ch => {
      const text = (ch.synopsis || '') + ' ' + (ch.notesAI?.timeframe || '');

      if (timeKeywords.past.test(text)) hasPast = true;
      if (timeKeywords.future.test(text)) hasFuture = true;
      if (timeKeywords.parallel.test(text)) hasParallel = true;
    });

    if (hasPast) timelines++;
    if (hasFuture) timelines++;
    if (hasParallel) timelines++;

    return timelines;
  },

  /**
   * Detect non-linear narrative structure
   */
  detectNonLinearStructure(project) {
    // Check for flashbacks, flash-forwards, or time jumps
    const nonLinearKeywords = /takaumat|flashback|hyppää ajassa|muisto|palataan|flash forward/i;

    return project.structure.some(ch => {
      const text = (ch.synopsis || '') + ' ' + (ch.notes || '');
      return nonLinearKeywords.test(text);
    });
  },

  /**
   * Recommend continuity system phase
   */
  recommendPhase(score) {
    if (score < 30) return 0; // Current system OK
    if (score < 60) return 1; // Micro-optimizations
    if (score < 100) return 2; // Lite Graph Memory
    return 3; // Full Hybrid
  },

  /**
   * Get human-readable recommendation
   */
  getRecommendation(phase, score) {
    const recommendations = {
      0: {
        title: '✅ Yksinkertainen tarina',
        message: 'Nykyinen järjestelmä toimii erinomaisesti.',
        accuracy: '85%',
        action: 'Ei toimenpiteitä tarvita.',
        color: '#4CAF50'
      },
      1: {
        title: '📊 Keskimääräinen kompleksisuus',
        message: 'Tarina kasvaa monimutkaisemmaksi.',
        accuracy: '85-90%',
        action: 'Harkitse Phase 1 optimointeja jos havaitset ongelmia.',
        color: '#FF9800'
      },
      2: {
        title: '🌟 Monimutkainen tarina',
        message: 'Suuri hahmojen määrä tai monimutkaiset juonilangat.',
        accuracy: '90-95%',
        action: 'Suositellaan Graph Memory -järjestelmää (Phase 2).',
        color: '#FF5722'
      },
      3: {
        title: '🎭 Eeppinen sarja',
        message: 'Erittäin laaja ja monimutkainen teos.',
        accuracy: '95-97%',
        action: 'Harkitse Full Hybrid -järjestelmää (Phase 3).',
        color: '#9C27B0'
      }
    };

    return recommendations[phase] || recommendations[0];
  },

  /**
   * Format complexity score for display
   */
  formatScore(complexity) {
    const { score, phase, recommendation } = complexity;

    return {
      score,
      phase,
      level: ['Yksinkertainen', 'Keskitaso', 'Monimutkainen', 'Eeppinen'][phase],
      color: recommendation.color,
      badge: ['✅', '📊', '🌟', '🎭'][phase],
      ...recommendation
    };
  },

  /**
   * Get detailed breakdown for UI
   */
  getBreakdown(complexity) {
    return [
      {
        label: 'Sanamäärä',
        value: complexity.wordCount.toLocaleString('fi-FI'),
        contribution: Math.round((complexity.wordCount / 1000) * 0.3)
      },
      {
        label: 'Hahmot',
        value: complexity.characterCount,
        contribution: complexity.characterCount * 2
      },
      {
        label: 'Juonilangat',
        value: complexity.plotThreadCount,
        contribution: complexity.plotThreadCount * 3
      },
      {
        label: 'Aikajanat',
        value: complexity.timelineCount,
        contribution: complexity.timelineCount * 5
      },
      {
        label: 'Epälineaarinen',
        value: complexity.hasNonLinear ? 'Kyllä' : 'Ei',
        contribution: complexity.hasNonLinear ? 10 : 0
      }
    ];
  }
};

export default ComplexityAnalyzer;

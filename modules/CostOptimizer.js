const StoryContinuityTracker = require('./StoryContinuityTracker');

const DEFAULT_CHECK_INTERVAL = 5;

const CostOptimizer = (() => {
  let lastCheckChapter = 0;
  const checkpoints = {
    global: {
      timelineLength: 0,
      factsLength: 0,
      characters: {},
      updatedAt: Date.now()
    }
  };

  const shouldCheckContinuity = (chapter, lastCheck = lastCheckChapter, options = {}) => {
    const chapterNumber = Number(chapter) || 0;
    if (options.forced) return true;
    if (chapterNumber <= 1) return true;

    if (chapterNumber - lastCheck >= DEFAULT_CHECK_INTERVAL) return true;
    if (hasPlotTwist(chapterNumber)) return true;
    return false;
  };

  const hasPlotTwist = (chapterNumber) => {
    const project = StoryContinuityTracker.getProject?.();
    if (!project?.story?.events) return false;
    return project.story.events.some((event) => {
      if (!event) return false;
      if (event.chapter && Number(event.chapter) !== chapterNumber) return false;
      const description = (event.description || '').toLowerCase();
      const keywords = ['twist', 'paljastuu', 'paljastus', 'huipentuu', 'käänne'];
      const hasKeyword = keywords.some((keyword) => description.includes(keyword));
      return hasKeyword || event.significance === 'major';
    });
  };

  const registerCheckpoint = (chapter) => {
    const memory = StoryContinuityTracker.getStoryMemory();
    checkpoints.global = {
      timelineLength: memory.timeline.length,
      factsLength: memory.establishedFacts.length,
      characters: Object.fromEntries(
        Object.entries(memory.characterStates).map(([name, state]) => [name, state.lastSeen])
      ),
      updatedAt: Date.now(),
      chapter
    };
    lastCheckChapter = Number(chapter) || lastCheckChapter;
    return checkpoints.global;
  };

  const getDiffContext = (chapter) => {
    const memory = StoryContinuityTracker.getStoryMemory();
    const checkpoint = checkpoints.global;

    const timelineChanges = memory.timeline.slice(checkpoint.timelineLength);
    const factChanges = memory.establishedFacts.slice(checkpoint.factsLength);

    const characterChanges = Object.entries(memory.characterStates).reduce((acc, [name, state]) => {
      const lastSeen = state.lastSeen || 0;
      const previous = checkpoint.characters[name] || 0;
      if (lastSeen > previous) {
        acc[name] = state;
      }
      return acc;
    }, {});

    return {
      minimalContext: true,
      checkpointChapter: checkpoint.chapter || 0,
      chapter,
      changes: {
        timeline: timelineChanges,
        facts: factChanges,
        characters: characterChanges
      }
    };
  };

  const selectOptimalModel = (checkType) => {
    switch (checkType) {
      case 'factCheck':
        return 'deepseek';
      case 'characterConsistency':
        return 'deepseek';
      case 'creative':
        return 'claude';
      case 'structural':
        return 'deepseek';
      default:
        return 'deepseek';
    }
  };

  const estimateFullNovelCost = (options = {}) => {
    const {
      chapters = 20,
      deepseekChecks = Math.ceil(chapters * 2),
      creativeCalls = Math.ceil(chapters * 5),
      deepseekUnitCost = 0.001,
      creativeUnitCost = 0.01
    } = options;
    return Number((deepseekChecks * deepseekUnitCost + creativeCalls * creativeUnitCost).toFixed(2));
  };

  const trackRequest = (provider, model, inputText, outputText) => {
    try {
      // This is a simplified version for the modules context
      // The actual cost tracking happens in src/services/ai/CostOptimizer.js
      const inputTokens = Math.ceil((inputText || '').length / 4);
      const outputTokens = Math.ceil((outputText || '').length / 4);
      const totalTokens = inputTokens + outputTokens;
      
      console.log(`[CostOptimizer] Request tracked: ${provider}/${model}, ${totalTokens} tokens`);
      
      return {
        inputTokens,
        outputTokens,
        totalTokens,
        cost: 0,
        runningTotal: 0
      };
    } catch (error) {
      console.error('[CostOptimizer] Tracking failed:', error);
      return {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cost: 0,
        runningTotal: 0
      };
    }
  };

  return {
    shouldCheckContinuity,
    registerCheckpoint,
    getDiffContext,
    selectOptimalModel,
    estimateFullNovelCost,
    trackRequest,
    getLastCheck: () => lastCheckChapter
  };
})();

module.exports = CostOptimizer;

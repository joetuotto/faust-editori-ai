const CostOptimizer = {
  // Full object
  hasPlotTwist: (chapter) => {
    const chapterContent = project.story.chapters[chapter - 1]?.content || '';
    const twistKeywords = ['reveal', 'surprise', 'twist', 'discover', 'truth', 'actually'];
    return twistKeywords.some(keyword => chapterContent.toLowerCase().includes(keyword));
  },
  getLastCheckpoint: (chapter) => {
    return StoryContinuityTracker.storyMemory.timeline
      .filter(t => t.chapter <= chapter)
      .slice(-1)[0] || {};
  },
  diffMemory: (old, current) => {
    return {
      changes: Object.keys(current).filter(key => 
        JSON.stringify(old[key]) !== JSON.stringify(current[key])
      )
    };
  },
  // ... other methods
};

export default CostOptimizer;



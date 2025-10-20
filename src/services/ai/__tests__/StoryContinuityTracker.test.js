import StoryContinuityTracker from '../StoryContinuityTracker';

describe('StoryContinuityTracker', () => {
  beforeEach(() => {
    StoryContinuityTracker.storyMemory = {
      timeline: [],
      characterStates: {},
      establishedFacts: [],
      plotThreads: {},
      locations: {},
      items: {}
    };
  });

  test('should track timeline events', async () => {
    const result = await StoryContinuityTracker.updateMemory(1, 'Chapter 1 content');
    expect(StoryContinuityTracker.storyMemory.timeline).toHaveLength(1);
  });

  test('should detect continuity issues', async () => {
    const result = await StoryContinuityTracker.checkContinuityBeforeWriting(1, 'Inconsistent content');
    expect(result.issues).toBeDefined();
  });

  test('should compress memory efficiently', async () => {
    // Add multiple events
    for (let i = 1; i <= 15; i++) {
      await StoryContinuityTracker.updateMemory(i, `Chapter ${i}`);
    }
    const before = StoryContinuityTracker.storyMemory.timeline.length;
    await StoryContinuityTracker.compressMemory();
    const after = StoryContinuityTracker.storyMemory.timeline.length;
    expect(after).toBeLessThan(before);
  });
});



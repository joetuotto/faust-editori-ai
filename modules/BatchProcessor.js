const StoryContinuityTracker = require('./StoryContinuityTracker');
const HybridWritingFlow = require('./HybridWritingFlow');
const CostOptimizer = require('./CostOptimizer');

const BatchProcessor = (() => {
  let projectResolver = () => null;
  let projectUpdater = () => {};
  let progressReporter = () => {};

  const configure = ({ getProject, setProject, onProgress } = {}) => {
    if (typeof getProject === 'function') {
      projectResolver = getProject;
    }
    if (typeof setProject === 'function') {
      projectUpdater = setProject;
    }
    if (typeof onProgress === 'function') {
      progressReporter = onProgress;
    }
    return BatchProcessor;
  };

  const initializeMemoryFromProject = async () => {
    const project = projectResolver?.();
    return StoryContinuityTracker.initializeMemoryFromProject(project || {});
  };

  const processFullNovel = async (options = {}) => {
    const project = projectResolver?.();
    if (!project) {
      throw new Error('BatchProcessor: project not available');
    }

    const chapters = collectChapters(project);
    if (chapters.length === 0) {
      return { processed: 0, issues: [], cost: 0, time: 0, summary: 'No chapters to process' };
    }

    const {
      startChapter = 1,
      endChapter = chapters.length,
      batchSize = 5,
      operation = 'continuityCheck'
    } = options;

    const results = {
      processed: 0,
      issues: [],
      cost: 0,
      time: Date.now(),
      batches: []
    };

    await initializeMemoryFromProject();

    for (let index = startChapter; index <= endChapter; index += batchSize) {
      const slice = chapters.slice(index - 1, index - 1 + batchSize);
      if (slice.length === 0) continue;

      progressReporter({
        stage: 'batch-start',
        current: Math.min(index + batchSize - 1, endChapter),
        total: endChapter,
        batchSize: slice.length
      });

      const batchAnalysis = await analyzeBatch(slice);
      results.issues.push(...(batchAnalysis.issues || []));
      results.batches.push(batchAnalysis.summary || `Batch ${index}-${index + slice.length - 1}`);

      if (operation === 'rewrite' || operation === 'polish') {
        const rewrites = await rewriteProblemChapters(slice, batchAnalysis, { operation });
        if (rewrites.updatedProject) {
          projectUpdater(rewrites.updatedProject);
        }
        results.processed += rewrites.updatedCount;
      } else if (operation === 'continuityCheck') {
        results.processed += slice.length;
      }

      progressReporter({
        stage: 'batch-complete',
        current: Math.min(index + batchSize - 1, endChapter),
        total: endChapter,
        cost: StoryContinuityTracker.costs.total
      });

      if (index % 20 === 0) {
        await StoryContinuityTracker.compressMemory();
      }
    }

    results.cost = StoryContinuityTracker.costs.total;
    results.time = Date.now() - results.time;
    return results;
  };

  const analyzeBatch = async (chapters) => {
    if (!chapters || chapters.length === 0) {
      return { issues: [], chaptersNeedingWork: [], summary: 'No chapters provided' };
    }

    const batchContent = chapters
      .map((chapter) => `Chapter ${chapter.number} - ${chapter.title || 'Untitled'}:\n${(chapter.content || '').slice(0, 1000)}...`)
      .join('\n---\n');

    const analysisPrompt = `
Analyze these chapters for continuity as a batch:
${batchContent}

Look for:
- Cross-chapter timeline issues
- Character development inconsistencies
- Unresolved plot threads
- Contradicting facts

Return JSON:
{
  "issues": [...],
  "chaptersNeedingWork": [chapterNumbers],
  "summary": "brief overview"
}
`;

    const raw = await StoryContinuityTracker.callDeepSeek(analysisPrompt, { max_tokens: 1000, temperature: 0.1 });
    let parsed = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch (error) {
      console.warn('BatchProcessor: Failed to parse batch analysis', error);
      parsed = {};
    }

    return {
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      chaptersNeedingWork: Array.isArray(parsed.chaptersNeedingWork) ? parsed.chaptersNeedingWork : [],
      summary: parsed.summary || 'Batch analyzed'
    };
  };

  const rewriteProblemChapters = async (chapters, analysis, { operation } = {}) => {
    const result = {
      updatedProject: null,
      updatedCount: 0
    };
    const project = projectResolver?.();
    if (!project) return result;

    const chaptersNeedingWork = analysis.chaptersNeedingWork || [];
    if (chaptersNeedingWork.length === 0) return result;

    const updatedProject = { ...project };
    const updatedItems = cloneItems(project.items);

    for (const chapter of chapters) {
      if (!chaptersNeedingWork.includes(chapter.number)) continue;

      const rewritePrompt = operation === 'polish'
        ? `Polish this chapter while fixing continuity issues:\n${chapter.content}`
        : `Rewrite this chapter to fix continuity issues and maintain tone:\n${chapter.content}`;

      const rewrite = await HybridWritingFlow.writeWithContinuity(rewritePrompt, {
        chapter: chapter.number,
        autoFix: true,
        checkFirst: true,
        onProgress: progressReporter
      });

      if (rewrite.success && rewrite.data) {
        applyChapterUpdate(updatedItems, chapter.id, rewrite.data);
        result.updatedCount += 1;
      }
    }

    if (result.updatedCount > 0) {
      result.updatedProject = { ...updatedProject, items: updatedItems };
    }
    return result;
  };

  const collectChapters = (project) => {
    if (!project) return [];
    if (Array.isArray(project.story?.chapters)) {
      return project.story.chapters.map((chapter, index) => ({
        id: chapter.id || index + 1,
        number: chapter.number || chapter.chapter || index + 1,
        title: chapter.title,
        content: chapter.content || '',
        reference: chapter
      }));
    }

    const chapters = [];
    const traverse = (items) => {
      if (!Array.isArray(items)) return;
      items.forEach((item) => {
        if (!item) return;
        if (item.type === 'chapter' || item.type === 'scene') {
          chapters.push({
            id: item.id,
            number: chapters.length + 1,
            title: item.title,
            content: item.content || '',
            reference: item
          });
        }
        if (item.children) traverse(item.children);
      });
    };
    traverse(project.items);
    return chapters;
  };

  const cloneItems = (items) => {
    if (!Array.isArray(items)) return [];
    return items.map((item) => ({
      ...item,
      children: cloneItems(item.children)
    }));
  };

  const applyChapterUpdate = (items, chapterId, newContent) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item) continue;
      if (item.id === chapterId) {
        item.content = newContent;
        item.wordCount = (newContent || '').split(/\s+/).filter(Boolean).length;
        return;
      }
      if (item.children) {
        applyChapterUpdate(item.children, chapterId, newContent);
      }
    }
  };

  return {
    configure,
    initializeMemoryFromProject,
    processFullNovel,
    analyzeBatch
  };
})();

module.exports = BatchProcessor;

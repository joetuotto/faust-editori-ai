const StoryContinuityTracker = require('./StoryContinuityTracker');
const CostOptimizer = require('./CostOptimizer');

const HybridWritingFlow = (() => {
  let callModel = null;
  let defaultCreativeModel = 'claude';
  let projectResolver = () => null;

  const configure = ({ callAI, getProject, defaultModel } = {}) => {
    if (typeof callAI === 'function') {
      callModel = callAI;
    }
    if (typeof getProject === 'function') {
      projectResolver = getProject;
    }
    if (defaultModel) {
      defaultCreativeModel = defaultModel;
    }
    return HybridWritingFlow;
  };

  const writeWithContinuity = async (prompt, options = {}) => {
    if (!callModel) {
      throw new Error('HybridWritingFlow: callAI client not configured');
    }
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const chapter = options.chapter || 1;
    const creativeModel = options.creativeModel || defaultCreativeModel;
    const checkFirst = options.checkFirst !== false;
    const autoFix = options.autoFix !== false;

    let workingPrompt = prompt;
    let continuityCheck = { issues: [], warnings: [], cleared: true };

    if (checkFirst) {
      onProgress({ stage: 'planning', message: 'Checking story continuity...' });
      continuityCheck = await StoryContinuityTracker.checkContinuityBeforeWriting(
        chapter,
        prompt,
        options.checkOptions || {}
      );

      if (!continuityCheck.cleared && continuityCheck.issues.length > 0) {
        onProgress({
          stage: 'issues',
          message: `Found ${continuityCheck.issues.length} continuity issues`,
          issues: continuityCheck.issues
        });

        if (autoFix) {
          workingPrompt = enhancePromptWithFixes(prompt, continuityCheck);
        } else if (options.interactivePrompt) {
          const proceed = await options.interactivePrompt(continuityCheck);
          if (!proceed) {
            return { success: false, cancelled: true, issues: continuityCheck.issues };
          }
        }
      }
    }

    onProgress({ stage: 'writing', message: `Writing with ${creativeModel}...` });
    const creativePrompt = buildCreativePrompt(workingPrompt, chapter, options);
    const creativeResult = await callModel(creativeModel, creativePrompt);

    if (!creativeResult?.success) {
      return {
        success: false,
        error: creativeResult?.error || 'Creative model returned an error',
        issues: continuityCheck.issues
      };
    }

    const generatedText = creativeResult.data;
    onProgress({ stage: 'updating', message: 'Updating story memory...' });
    await StoryContinuityTracker.updateMemory(chapter, generatedText, { autoCompress: true });
    CostOptimizer.registerCheckpoint(chapter);

    let postCheck = null;
    if (options.doubleCheck) {
      onProgress({ stage: 'validating', message: 'Running post-generation continuity check...' });
      postCheck = await StoryContinuityTracker.checkContinuityBeforeWriting(
        chapter,
        generatedText,
        options.checkOptions || {}
      );
    }

    return {
      success: true,
      data: generatedText,
      continuityCheck,
      postCheck,
      model: creativeModel,
      usage: creativeResult.usage
    };
  };

  const buildCreativePrompt = (userPrompt, chapter, options = {}) => {
    const project = projectResolver?.() || {};
    const relevantContext = StoryContinuityTracker.getRelevantMemory(chapter);
    const genre = project.genre || 'literary fiction';
    const targetLength = options.targetLength || '500-1000 words';

    const recentEvents = relevantContext.timeline.slice(-3).flatMap((entry) => entry.events || []);
    const openThreads = relevantContext.openPlots
      .map((plot) => plot.description || `Thread ${plot.id}`)
      .join('; ');

    return `
You are a world-class fiction author continuing Chapter ${chapter}.

CONTEXT:
- Recent events: ${recentEvents.join('; ') || 'No recent events'}
- Active characters: ${Object.keys(relevantContext.characters).join(', ') || 'Unknown'}
- Open plot threads: ${openThreads || 'None'}
- Established facts: ${relevantContext.facts.join('; ') || 'None'}

TASK:
${userPrompt}

REQUIREMENTS:
- Maintain continuity with the context.
- Keep character voices consistent.
- Honor established facts.
- Tone & genre: ${genre}
- Length: ${targetLength}

Write immersive, high-quality prose in Finnish unless instructed otherwise.
`;
  };

  const enhancePromptWithFixes = (originalPrompt, continuityCheck) => {
    const issues = Array.isArray(continuityCheck.issues) ? continuityCheck.issues : [];
    if (issues.length === 0) return originalPrompt;

    let enhanced = `${originalPrompt}\n\nCONTINUITY NOTES:\n`;
    issues.forEach((issue) => {
      if (!issue) return;
      const type = issue.type ? issue.type.toUpperCase() : 'GENERAL';
      const detail = issue.suggestion || issue.detail || 'Fix inconsistency';
      enhanced += `- ${type}: ${detail}\n`;
    });
    enhanced += '\nPlease incorporate these fixes naturally into the text.';
    return enhanced;
  };

  return {
    configure,
    writeWithContinuity,
    buildCreativePrompt,
    enhancePromptWithFixes
  };
})();

module.exports = HybridWritingFlow;

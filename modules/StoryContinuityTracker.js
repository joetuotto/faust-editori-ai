const DEFAULT_CONTEXT_WINDOW = 3;
const DEFAULT_COMPRESSION_INTERVAL = 10;
const SAFE_JSON_FALLBACK = {
  newEvents: [],
  characterUpdates: {},
  newFacts: [],
  plotThreadUpdates: {},
  continuityIssues: []
};

const StoryContinuityTracker = (() => {
  let deepSeekClient = null;
  let projectResolver = () => null;
  let lastCompressionSnapshot = 0;

  const storyMemory = {
    timeline: [],
    characterStates: {},
    establishedFacts: [],
    plotThreads: {},
    locations: {},
    items: {}
  };

  const costs = {
    total: 0,
    checks: 0,
    tokens: { input: 0, output: 0 }
  };

  const safeParseJSON = (payload, fallback = {}) => {
    if (!payload) return { ...fallback };
    try {
      if (typeof payload === 'string') {
        return JSON.parse(payload);
      }
      if (typeof payload === 'object') {
        return payload;
      }
      return { ...fallback };
    } catch (error) {
      console.warn('StoryContinuityTracker: Failed to parse JSON', { payload, error });
      return { ...fallback };
    }
  };

  const ensureList = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  };

  const upsertCharacterState = (name, updates, chapter) => {
    if (!name) return;
    const current = storyMemory.characterStates[name] || {
      name,
      chapterIntroduced: chapter,
      knowledge: [],
      location: '',
      relationships: {},
      lastSeen: chapter || 0,
      notes: []
    };

    if (updates.knowledge) {
      const additions = ensureList(updates.knowledge);
      additions.forEach((item) => {
        if (item && !current.knowledge.includes(item)) current.knowledge.push(item);
      });
    }

    if (updates.location) current.location = updates.location;
    if (updates.relationships) {
      current.relationships = {
        ...current.relationships,
        ...updates.relationships
      };
    }
    if (updates.notes) {
      const additions = ensureList(updates.notes);
      additions.forEach((note) => {
        if (note && !current.notes.includes(note)) current.notes.push(note);
      });
    }

    current.lastSeen = Math.max(current.lastSeen || 0, chapter || 0);
    storyMemory.characterStates[name] = current;
  };

  const appendTimelineEvents = (chapter, events) => {
    if (!events || events.length === 0) return;
    const entry = {
      chapter,
      events: events.map((event) => (typeof event === 'string' ? event : JSON.stringify(event))),
      timestamp: new Date().toISOString()
    };
    storyMemory.timeline.push(entry);
  };

  const registerEstablishedFacts = (facts) => {
    ensureList(facts).forEach((fact) => {
      if (fact && !storyMemory.establishedFacts.includes(fact)) {
        storyMemory.establishedFacts.push(fact);
      }
    });
  };

  const mergePlotThreads = (updates, chapter) => {
    if (!updates) return;
    Object.entries(updates).forEach(([threadName, status]) => {
      if (!threadName) return;
      const existing = storyMemory.plotThreads[threadName] || {
        introduced: chapter,
        resolved: null,
        status: 'open',
        notes: []
      };

      if (typeof status === 'object') {
        const { state, note } = status;
        if (state) existing.status = state;
        if (note) existing.notes.push(note);
        if (state === 'resolved') existing.resolved = chapter;
      } else if (typeof status === 'string') {
        existing.status = status;
        if (status === 'resolved') existing.resolved = chapter;
      }

      storyMemory.plotThreads[threadName] = existing;
    });
  };

  const mergeLocations = (locations, chapter) => {
    if (!locations) return;
    Object.entries(locations).forEach(([name, details]) => {
      if (!name) return;
      const current = storyMemory.locations[name] || {
        name,
        introduced: chapter,
        details: []
      };
      if (details) {
        ensureList(details).forEach((detail) => {
          if (detail && !current.details.includes(detail)) {
            current.details.push(detail);
          }
        });
      }
      storyMemory.locations[name] = current;
    });
  };

  const resetMemory = () => {
    storyMemory.timeline = [];
    storyMemory.characterStates = {};
    storyMemory.establishedFacts = [];
    storyMemory.plotThreads = {};
    storyMemory.locations = {};
    storyMemory.items = {};
    lastCompressionSnapshot = 0;
  };

  const initializeMemoryFromProject = (project = {}) => {
    resetMemory();

    const outline = project?.story?.outline || [];
    outline.forEach((chapter) => {
      const chapterNumber = chapter.chapter ?? chapter.id ?? storyMemory.timeline.length + 1;
      const summary = chapter.summary || chapter.title || '';
      if (summary) appendTimelineEvents(chapterNumber, [summary]);
    });

    const events = project?.story?.events || [];
    events.forEach((event) => {
      const chapterNumber = event.chapter ?? null;
      if (!event.description) return;
      appendTimelineEvents(chapterNumber, [event.description]);

      if (Array.isArray(event.character_involved)) {
        event.character_involved.forEach((characterId) => {
          const character = project?.characters?.find((c) => c.id === characterId || c.name === characterId);
          const name = character?.name || characterId;
          if (name) {
            upsertCharacterState(name, { knowledge: event.requires, location: event.location }, chapterNumber);
          }
        });
      }
    });

    const immutableFacts = project?.story?.immutable_facts || [];
    registerEstablishedFacts(immutableFacts.map((fact) => fact.description || fact));

    const threads = project?.story?.threads || [];
    threads.forEach((thread) => {
      if (!thread?.title && !thread?.id) return;
      const threadId = thread.title || thread.id;
      storyMemory.plotThreads[threadId] = {
        introduced: thread.opened_chapter ?? null,
        resolved: thread.closed_chapter ?? null,
        status: thread.status || 'open',
        description: thread.description || '',
        importance: thread.importance || 'minor',
        notes: []
      };
    });

    const characters = project?.characters || [];
    characters.forEach((character, index) => {
      if (!character?.name) return;
      upsertCharacterState(character.name, {
        knowledge: character.knowledge || [],
        location: character.location || character.origin,
        relationships: character.relationships || {},
        notes: character.traits || character.notes || []
      }, character.appears_in || outline[index]?.chapter || index + 1);
    });

    const locations = project?.locations || [];
    locations.forEach((location, index) => {
      if (!location?.name) return;
      storyMemory.locations[location.name] = {
        name: location.name,
        introduced: location.first_appearance || index + 1,
        details: ensureList(location.details || location.description || [])
      };
    });

    lastCompressionSnapshot = storyMemory.timeline.length;
    return storyMemory;
  };

  const configure = ({ deepseekClient: client, getProject } = {}) => {
    if (typeof client === 'function') {
      deepSeekClient = client;
    }
    if (typeof getProject === 'function') {
      projectResolver = getProject;
    }
    return StoryContinuityTracker;
  };

  const getRelevantMemory = (currentChapter, windowSize = DEFAULT_CONTEXT_WINDOW) => {
    const chapterNumber = Number(currentChapter) || 0;
    const lower = chapterNumber - windowSize;
    const upper = chapterNumber + windowSize;

    const filteredTimeline = storyMemory.timeline.filter((entry) => {
      if (!entry.chapter && entry.chapter !== 0) return true;
      return entry.chapter >= lower && entry.chapter <= upper;
    });

    const characters = Object.entries(storyMemory.characterStates).reduce((acc, [name, state]) => {
      if (!state.lastSeen) {
        acc[name] = state;
        return acc;
      }
      if (Math.abs(state.lastSeen - chapterNumber) <= windowSize + 1) {
        acc[name] = state;
      }
      return acc;
    }, {});

    const openPlots = Object.entries(storyMemory.plotThreads)
      .filter(([, thread]) => thread.status === 'open')
      .map(([threadId, thread]) => ({
        id: threadId,
        description: thread.description || '',
        introduced: thread.introduced,
        status: thread.status
      }));

    return {
      timeline: filteredTimeline,
      characters,
      openPlots,
      facts: storyMemory.establishedFacts.slice(-8),
      locations: storyMemory.locations
    };
  };

  const trackCost = (usage) => {
    if (!usage) return;
    const promptTokens = usage.prompt_tokens || usage.input_tokens || 0;
    const completionTokens = usage.completion_tokens || usage.output_tokens || 0;
    costs.tokens.input += promptTokens;
    costs.tokens.output += completionTokens;
    const computeCost = (tokens, rate) => (tokens * rate) / 1000;
    costs.total += computeCost(promptTokens, 0.00014) + computeCost(completionTokens, 0.00028);
    costs.checks += 1;
  };

  const callDeepSeek = async (prompt, options = {}) => {
    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error('StoryContinuityTracker.callDeepSeek requires a prompt string');
    }

    const request = {
      prompt,
      options: {
        model: 'deepseek-chat',
        temperature: typeof options.temperature === 'number' ? options.temperature : 0.1,
        max_tokens: options.max_tokens || 500,
        top_p: typeof options.top_p === 'number' ? options.top_p : 0.9,
        stream: false,
        ...options.extra
      }
    };

    if (!deepSeekClient) {
      console.warn('StoryContinuityTracker: DeepSeek client not configured');
      return options.fallback || JSON.stringify(SAFE_JSON_FALLBACK);
    }

    try {
      const result = await deepSeekClient(request);
      if (!result?.success) {
        throw new Error(result?.error || 'Unknown DeepSeek error');
      }
      if (result.usage) {
        trackCost(result.usage);
      }
      return result.data;
    } catch (error) {
      console.error('StoryContinuityTracker: DeepSeek request failed', error);
      return options.fallback || JSON.stringify(SAFE_JSON_FALLBACK);
    }
  };

  const updateMemory = async (chapter, newContent, options = {}) => {
    const chapterNumber = Number(chapter) || 0;
    const analysisPrompt = `
Current story memory:
${JSON.stringify(storyMemory, null, 2)}

New content (Chapter ${chapterNumber}):
${newContent}

Extract and return JSON:
{
  "newEvents": ["list of plot events"],
  "characterUpdates": {"name": {"knowledge": [], "location": ""}},
  "newFacts": ["established facts"],
  "plotThreadUpdates": {"threadName": "status"},
  "continuityIssues": [
    {"type": "timeline|character|fact", "issue": "description", "severity": 1-3}
  ],
  "locations": {"place": ["details or status updates"]},
  "items": {"itemName": {"introduced": <chapter>, "owner": "character"}}
}
`;

    const response = await callDeepSeek(analysisPrompt, { temperature: 0.1, ...options });
    const parsed = safeParseJSON(response, SAFE_JSON_FALLBACK);

    appendTimelineEvents(chapterNumber, parsed.newEvents);
    Object.entries(parsed.characterUpdates || {}).forEach(([name, updates]) => {
      upsertCharacterState(name, updates || {}, chapterNumber);
    });
    registerEstablishedFacts(parsed.newFacts);
    mergePlotThreads(parsed.plotThreadUpdates, chapterNumber);
    mergeLocations(parsed.locations, chapterNumber);

    if (parsed.items) {
      Object.entries(parsed.items).forEach(([itemName, data]) => {
        if (!itemName) return;
        const existing = storyMemory.items[itemName] || {};
        storyMemory.items[itemName] = {
          ...existing,
          ...data,
          lastSeen: chapterNumber
        };
      });
    }

    if (options.autoCompress && storyMemory.timeline.length - lastCompressionSnapshot >= DEFAULT_COMPRESSION_INTERVAL) {
      await compressMemory();
    }

    return parsed;
  };

  const checkContinuityBeforeWriting = async (chapter, plannedContent, options = {}) => {
    const chapterNumber = Number(chapter) || 0;
    const relevantMemory = getRelevantMemory(chapterNumber);
    const checkPrompt = `
Story context up to Chapter ${chapterNumber}:
Timeline: ${JSON.stringify(relevantMemory.timeline)}
Characters: ${JSON.stringify(relevantMemory.characters)}
Open plots: ${JSON.stringify(relevantMemory.openPlots)}
Established facts: ${JSON.stringify(relevantMemory.facts)}

Planned content:
${plannedContent}

Check for issues:
1. Timeline conflicts (would this break chronology?)
2. Character knowledge (do they know what they reference?)
3. Location consistency (are they where they should be?)
4. Plot consistency (does this contradict established facts?)

Return JSON:
{
  "issues": [
    {"type": "timeline", "detail": "X happens before Y was established", "suggestion": "Move to chapter Z"}
  ],
  "warnings": ["potential issues but not breaking"],
  "cleared": true
}
`;

    const response = await callDeepSeek(checkPrompt, { temperature: 0.1, max_tokens: 500, ...options });
    const parsed = safeParseJSON(response, { issues: [], warnings: [], cleared: true });

    if (!Array.isArray(parsed.issues)) parsed.issues = [];
    if (!Array.isArray(parsed.warnings)) parsed.warnings = [];
    parsed.cleared = parsed.cleared !== false && parsed.issues.length === 0;
    return parsed;
  };

  const compressMemory = async (options = {}) => {
    const compressionPrompt = `
Compress this story memory, keeping only essential continuity information:
${JSON.stringify(storyMemory)}

Return compressed JSON with same structure but fewer tokens.
`;

    const response = await callDeepSeek(compressionPrompt, { temperature: 0, max_tokens: 800, ...options });
    const parsed = safeParseJSON(response, storyMemory);

    if (parsed.timeline) storyMemory.timeline = parsed.timeline;
    if (parsed.characterStates) storyMemory.characterStates = parsed.characterStates;
    if (parsed.establishedFacts) storyMemory.establishedFacts = parsed.establishedFacts;
    if (parsed.plotThreads) storyMemory.plotThreads = parsed.plotThreads;
    if (parsed.locations) storyMemory.locations = parsed.locations;
    if (parsed.items) storyMemory.items = parsed.items;
    lastCompressionSnapshot = storyMemory.timeline.length;

    return storyMemory;
  };

  const exportMemory = () => JSON.stringify({
    generatedAt: new Date().toISOString(),
    ...storyMemory,
    costs
  }, null, 2);

  const getStoryMemory = () => storyMemory;

  const estimateNovelCost = ({ chapters = 20, deepseekChecks = 40, creativeCalls = 100 }) => {
    const deepseekCost = deepseekChecks * 0.001;
    const creativeCost = creativeCalls * 0.01;
    return Number((deepseekCost + creativeCost).toFixed(2));
  };

  const getProject = () => projectResolver?.() ?? null;

  return {
    configure,
    initializeMemoryFromProject,
    updateMemory,
    checkContinuityBeforeWriting,
    getRelevantMemory,
    compressMemory,
    callDeepSeek,
    trackCost,
    exportMemory,
    getStoryMemory,
    estimateNovelCost,
    costs,
    storyMemory,
    getProject
  };
})();

module.exports = StoryContinuityTracker;

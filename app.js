/**
 * FAUST - Simple Clean Implementation
 * Uses new faust-simple-layout.css
 * v2.0: Project structure for AI book generation
 */

const { createElement: e, useState, useEffect, useRef } = React;

// CharacterGenerator, callAIProvider, and RefinementManager
// are now loaded from src/services/ai/ as IIFE modules

// Create default project structure
const createDefaultProject = () => ({
  title: 'Nimetön projekti',
  author: '',
  genre: 'fiction',
  language: 'fi',
  created: new Date().toISOString(),
  modified: new Date().toISOString(),
  version: '2.0',

  // Content structure (hierarchical)
  // Types: 'folder', 'chapter', 'scene'
  structure: [
    {
      id: 'chapter-1',
      type: 'chapter',
      title: 'Luku 1',
      order: 0,
      content: '',
      wordCount: 0,
      children: [],

      // AI-Enhanced Metadata
      synopsis: '',  // AI-generated or manual
      synopsisAI: '', // AI-generated version
      synopsisManual: '', // User override

      notes: '',     // Research notes, ideas
      notesAI: {
        characterMentions: [],  // AI-detected characters
        locations: [],          // AI-detected places
        timeframe: '',          // AI-detected time
        mood: '',               // AI-analyzed mood
        themes: [],             // AI-detected themes
        continuityIssues: []    // AI-found problems
      },

      // Status & Quality
      status: 'draft', // draft, revised, final
      aiQuality: {
        score: 0,              // 0-10 AI quality rating
        lastAnalyzed: null,
        issues: [],            // [{type, severity, msg}]
        strengths: [],         // What's good
        suggestions: [],       // How to improve
        readiness: 'draft'     // AI recommendation
      },

      // Structure hints
      structureHints: {
        shouldBeSplit: false,       // AI suggests splitting
        suggestedSceneBreaks: [],   // Positions for scene breaks
        relatedChapters: [],        // Similar content elsewhere
        missingTransition: false    // Needs better flow
      },

      // Pacing
      pacing: {
        speed: 'medium',      // slow, medium, fast (AI-analyzed)
        tension: 0,           // 0-10
        wordDensity: 0,       // words per concept
        dialogueRatio: 0      // % dialogue vs narrative
      },

      label: '',     // User-defined label/color
      color: '',     // For corkboard view

      created: new Date().toISOString(),
      modified: new Date().toISOString(),

      // Version history
      versions: []   // [{timestamp, content, aiDiff}]
    }
  ],

  // Outline for AI generation
  outline: [],

  // Knowledge base
  characters: [],
  locations: [],
  timeline: [],

  // Bookmarks - quick navigation points
  bookmarks: [],  // [{id, chapterId, position, name, color, created}]

  // Named snapshots - manual project-level saves
  snapshots: [],  // [{id, name, created, description, structure (deep copy of chapters)}]

  // Collections - dynamic chapter groupings
  collections: [],  // [{id, name, type, filter, chapterIds, color}]

  // Export presets - saved export configurations
  exportPresets: [
    { id: 'preset-kindle', name: 'Kindle (MOBI)', format: 'mobi', includeMetadata: true, includeSynopsis: false, includeToc: true },
    { id: 'preset-epub', name: 'eBook (EPUB)', format: 'epub', includeMetadata: true, includeSynopsis: false, includeToc: true },
    { id: 'preset-pdf', name: 'PDF (tulostus)', format: 'pdf', includeMetadata: true, includeSynopsis: false, includeToc: true },
    { id: 'preset-sample', name: 'Lukunäyte (3 lukua)', format: 'pdf', includeMetadata: true, includeSynopsis: true, includeToc: false, chapterLimit: 3 }
  ],

  // Cast planning (Phase 1 of Character Archetype Builder)
  castPlan: {
    defined: false,
    characterTypes: [],  // User-defined types like "stoic elder", "young idealist"
    totalCharacters: 0,
    suggestedArchetypes: [],  // AI suggestions
    castDynamics: null,  // AI-analyzed relationships
    warnings: []
  },

  // Goals
  targets: {
    totalWords: 80000,
    dailyWords: 1000,
    currentTotal: 0
  },

  // AI settings
  ai: {
    provider: 'anthropic',  // Global fallback
    model: 'claude-sonnet-4-5',
    activeModel: 'claude-3-5-sonnet-20241022',  // Currently selected model (NEW: unified model selection)
    batchGeneration: false,

    // Provider configuration per function
    providers: {
      generation: 'anthropic',      // Chapter/scene generation
      continuity: 'anthropic',      // Continuity checks
      analysis: 'anthropic',        // Quality analysis, synopsis
      batchProcessing: 'anthropic', // Batch operations
      characterBuilder: 'anthropic' // Character archetype building
    },

    // Model names per provider (can be customized)
    models: {
      anthropic: 'claude-3-5-sonnet-20241022',
      openai: 'gpt-4-turbo-preview',
      grok: 'grok-2-1212',
      deepseek: 'deepseek-chat'
    },

    // Writing modes
    currentMode: 'production',
    modes: {
      exploration: {
        name: 'Exploration',
        temperature: 0.9,
        maxTokens: 4096,
        systemPrompt: 'Be creative and experimental. Generate multiple variations. Try different approaches.',
        useCase: 'Ideointivaihe, kokeile vaihtoehtoja',
        color: '#B68B5C'
      },
      production: {
        name: 'Production',
        temperature: 0.7,
        maxTokens: 4096,
        systemPrompt: 'Write coherently following the outline and story consistency. Balance creativity with structure.',
        useCase: 'Normaali kirjoitus, seuraa suunnitelmaa',
        color: '#8F7A53'
      },
      polish: {
        name: 'Polish',
        temperature: 0.3,
        maxTokens: 2048,
        systemPrompt: 'Focus on grammar, style consistency, and clarity. Make minimal creative changes. Preserve the author\'s voice.',
        useCase: 'Viimeistely, johdonmukaisuus, kielioppi',
        color: '#715C38'
      }
    },

    costTracking: {
      totalSpent: 0,
      estimatedRemaining: 0,
      tokensUsed: 0,
      requestCount: 0
    }
  },

  // API Configuration
  apiConfig: {
    provider: 'anthropic', // anthropic, openai, local
    anthropic: {
      apiKey: '',
      model: 'claude-sonnet-4-5',
      maxTokens: 4096
    },
    openai: {
      apiKey: '',
      model: 'gpt-4',
      maxTokens: 4096
    },
    local: {
      endpoint: 'http://localhost:1234',
      model: 'local-model'
    },
    lastTested: null,
    isConfigured: false
  }
});

// ComplexityAnalyzer is now loaded from src/services/story/ComplexityAnalyzer.js as IIFE module

// Character Engine Logo Helper
const CharacterEngineLogo = (size = 16, style = {}) => {
  return e('img', {
    src: './build/character-engine-logo.png',
    alt: 'Character Engine',
    style: {
      width: `${size}px`,
      height: `${size}px`,
      display: 'inline-block',
      verticalAlign: 'middle',
      marginRight: '4px',
      filter: 'brightness(0.9)',
      ...style
    }
  });
};

function FAUSTApp() {
  // Project state
  const [project, setProject] = useState(createDefaultProject);
  const [currentFilePath, setCurrentFilePath] = useState(null);
  const [activeChapterId, setActiveChapterId] = useState('chapter-1');
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [savingState, setSavingState] = useState('idle'); // 'idle', 'saving', 'saved', 'error'

  // Complexity analysis state
  const [complexity, setComplexity] = useState(null);

  // UI state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('faust-theme');
    return saved ? saved === 'NOX' : true;
  });
  const [showInspector, setShowInspector] = useState(false);
  const [showCastPlanDialog, setShowCastPlanDialog] = useState(false);
  const [castPlanStep, setCastPlanStep] = useState(1); // 1=input, 2=AI analysis, 3=review
  const [showCharacterBuilder, setShowCharacterBuilder] = useState(false);
  const [selectedCharacterType, setSelectedCharacterType] = useState(null);
  const [characterBuilderStep, setCharacterBuilderStep] = useState(1); // 1=select type, 2=input people, 3=questions, 4=AI gen, 5=review
  const [characterRealPeople, setCharacterRealPeople] = useState('');
  const [characterQuestions, setCharacterQuestions] = useState([]);
  const [characterAnswers, setCharacterAnswers] = useState({});
  const [characterProfile, setCharacterProfile] = useState(null);

  // CharacterSheet modal state (view/edit existing characters)
  const [showCharacterSheet, setShowCharacterSheet] = useState(false);
  const [characterModalState, setCharacterModalState] = useState({
    isOpen: false,
    character: null,
    mode: 'create'
  });

  // LocationSheet modal state
  const [showLocationSheet, setShowLocationSheet] = useState(false);
  const [showLocationFormModal, setShowLocationFormModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationFormMode, setLocationFormMode] = useState('create'); // 'create', 'edit', 'view'

  // ThreadSheet modal state (plot threads)
  const [showThreadSheet, setShowThreadSheet] = useState(false);
  const [showThreadFormModal, setShowThreadFormModal] = useState(false);
  const [selectedThread, setSelectedThread] = useState(null);
  const [threadFormMode, setThreadFormMode] = useState('create'); // 'create', 'edit', 'view'

  // ChapterSheet modal state
  const [showChapterSheetModal, setShowChapterSheetModal] = useState(false);

  // ExportModal state
  const [showExportModal, setShowExportModal] = useState(false);

  // AI Toolbar state
  // showAIToolbar removed - unused state with no associated panel
  const [aiToolbarPosition, setAIToolbarPosition] = useState(() => {
    const saved = localStorage.getItem('faust-ai-toolbar-position');
    return saved ? JSON.parse(saved) : { x: window.innerWidth - 500, y: 80 };
  });
  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Handler to save chapter data from modal
  const handleChapterSheetSave = (chapterData) => {
    setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === activeChapterId ? { ...ch, ...chapterData, modified: new Date().toISOString() } : ch
      )
    }));
    setUnsavedChanges(true);
    setShowChapterSheetModal(false);
    console.log('[ChapterSheet] Chapter updated:', activeChapterId);
  };

  // Character modal helpers
  const openCharacterModal = (mode = 'create', character = null) => {
    setCharacterModalState({
      isOpen: true,
      character,
      mode
    });
  };

  const closeCharacterModal = () => {
    setCharacterModalState({
      isOpen: false,
      character: null,
      mode: 'create'
    });
  };

  const handleCharacterSave = async (characterData) => {
    setProject(prev => {
      const characters = [...(prev.characters || [])];
      const index = characters.findIndex(c => {
        if (c.id && characterData.id) {
          return c.id === characterData.id;
        }
        return c === characterModalState.character;
      });

      if (index === -1) {
        characters.push(characterData);
      } else {
        characters[index] = { ...characters[index], ...characterData };
      }

      return {
        ...prev,
        characters
      };
    });

    setUnsavedChanges(true);
  };

  const handleCharacterDelete = (character) => {
    if (!character) return;

    const name = character.basicInfo?.name || character.name || 'hahmo';
    if (!confirm(`Delete character "${name}"?`)) {
      return;
    }

    setProject(prev => ({
      ...prev,
      characters: (prev.characters || []).filter(c => {
        if (character.id && c.id) {
          return c.id !== character.id;
        }
        return c !== character;
      })
    }));

    if (
      characterModalState.isOpen &&
      characterModalState.character &&
      ((character.id && characterModalState.character.id === character.id) || characterModalState.character === character)
    ) {
      closeCharacterModal();
    }

    setUnsavedChanges(true);
  };

  // Handler to save location data from modal
  const handleLocationSave = (locationData) => {
    if (!project.continuity) {
      project.continuity = { locations: {}, characters: {}, threads: {} };
    }
    if (!project.continuity.locations) {
      project.continuity.locations = {};
    }

    // Create or update location
    project.continuity.locations[locationData.name] = locationData;

    setProject({ ...project });
    setUnsavedChanges(true);
    setShowLocationFormModal(false);
    setSelectedLocation(null);
    console.log('[LocationSheet] Location saved:', locationData.name);
  };

  // Handler to save thread data from modal
  const handleThreadSave = (threadData) => {
    if (!project.plotThreads) {
      project.plotThreads = [];
    }

    if (threadFormMode === 'edit' && selectedThread) {
      // Update existing thread
      const threadIndex = project.plotThreads.findIndex(t => t.id === selectedThread.id);
      if (threadIndex > -1) {
        project.plotThreads[threadIndex] = threadData;
      }
    } else {
      // Create new thread
      project.plotThreads.push(threadData);
    }

    setProject({ ...project });
    setUnsavedChanges(true);
    setShowThreadFormModal(false);
    setSelectedThread(null);
    console.log('[ThreadSheet] Thread saved:', threadData.name);
  };

  // Handler to export from modal
  const handleExportFromModal = async (exportData) => {
    if (!window.electronAPI) {
      throw new Error('Electron API ei ole käytettävissä');
    }

    console.log('[Export] Processing export:', exportData);

    // Handle different formats
    if (exportData.format === 'epub') {
      const result = await window.electronAPI.exportEPUB({
        metadata: exportData.metadata,
        chapters: exportData.chapters
      });
      if (!result.success) {
        throw new Error(result.error || 'EPUB-vienti epäonnistui');
      }
      return result;
    } else if (exportData.format === 'mobi') {
      const result = await window.electronAPI.exportMOBI({
        metadata: exportData.metadata,
        chapters: exportData.chapters
      });
      if (!result.success) {
        throw new Error(result.error || 'MOBI-vienti epäonnistui');
      }
      return result;
    } else {
      // TXT, DOCX, PDF
      const result = await window.electronAPI.exportFullProject({
        project: {
          ...project,
          structure: exportData.chapters.map(ch => ({
            title: ch.title,
            content: ch.content
          }))
        },
        format: exportData.format
      });
      if (!result.success) {
        throw new Error(result.error || `${exportData.format.toUpperCase()}-vienti epäonnistui`);
      }
      return result;
    }
  };

  // Refinement state
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerateFeedback, setRegenerateFeedback] = useState('');
  const [regenerateMode, setRegenerateMode] = useState('production');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showVersionComparison, setShowVersionComparison] = useState(false);
  const [comparisonVersionId, setComparisonVersionId] = useState(null);

  // Plot thread state
  const [plotThreads, setPlotThreads] = useState([]);
  const [detectingThreads, setDetectingThreads] = useState(false);

  // HybridWritingFlow state
  const [showContinueDialog, setShowContinueDialog] = useState(false);
  const [hybridMode, setHybridMode] = useState('continue'); // 'continue', 'expand', 'rewrite', 'scene'
  const [continueParagraphs, setContinueParagraphs] = useState(2);
  const [continuePreview, setContinuePreview] = useState('');
  const [continuingWriting, setContinuingWriting] = useState(false);
  const [hybridInput, setHybridInput] = useState(''); // For outline/instructions/scene description
  const [hybridTargetWords, setHybridTargetWords] = useState(1000);
  const [hybridStyle, setHybridStyle] = useState('vivid'); // 'vivid', 'concise', 'descriptive', 'dialogue-heavy'

  // Consistency check state
  const [consistencyErrors, setConsistencyErrors] = useState([]);
  const [checkingConsistency, setCheckingConsistency] = useState(false);

  // Voice state
  const [voiceInputAvailable, setVoiceInputAvailable] = useState(false);
  const [voiceState, setVoiceState] = useState('idle'); // idle, listening, processing, error
  const [textSelection, setTextSelection] = useState(null); // { text, start, end }
  const [voiceDiffView, setVoiceDiffView] = useState(null); // { original, revised, instruction }

  // AI Assistant Chat state (Cursor-style)
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [aiAssistantCollapsed, setAiAssistantCollapsed] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState([]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatVoiceState, setAiChatVoiceState] = useState('idle');

  // Scrivener-style editor controls
  const [editorFont, setEditorFont] = useState('EB Garamond');
  const [textAlign, setTextAlign] = useState('left');
  const [lineSpacing, setLineSpacing] = useState('1.8');
  const [editorZoom, setEditorZoom] = useState('100');
  const [paragraphSpacing, setParagraphSpacing] = useState('1.5');
  const [aiChatProcessing, setAiChatProcessing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null); // { original, revised, applied }
  const [chatMemory, setChatMemory] = useState({ entries: [], lastUpdated: null });

  // Project Settings state
  const [showProjectSettings, setShowProjectSettings] = useState(false);

  // Recent Files state (tracked in localStorage)
  const [recentFiles, setRecentFiles] = useState(() => {
    try {
      const stored = localStorage.getItem('faust-recent-files');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showRecentFilesMenu, setShowRecentFilesMenu] = useState(false);

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('api'); // api, general, advanced
  const [apiTestResult, setApiTestResult] = useState(null); // {success, message}

  // AI Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(null); // {stage, message}

  // API key input state
  const [showApiKeyInput, setShowApiKeyInput] = useState(null); // null or provider name
  const [apiKeyInputValue, setApiKeyInputValue] = useState('');

  // Panel collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);

  // Split View state
  const [splitViewEnabled, setSplitViewEnabled] = useState(false);
  const [splitViewChapterId, setSplitViewChapterId] = useState(null);
  const [splitViewType, setSplitViewType] = useState('chapter'); // 'chapter', 'character', 'location', 'outline'

  // Corkboard state
  const [corkboardEnabled, setCorkboardEnabled] = useState(false);
  const [draggedChapterId, setDraggedChapterId] = useState(null);

  // Bookmarks state
  const [showBookmarksPanel, setShowBookmarksPanel] = useState(false);

  // Snapshots state
  const [showSnapshotsPanel, setShowSnapshotsPanel] = useState(false);

  // Collections state
  const [showCollectionsPanel, setShowCollectionsPanel] = useState(false);
  const [activeCollectionId, setActiveCollectionId] = useState(null);

  // Claude Chat state
  const [claudeChatOpen, setClaudeChatOpen] = useState(false);

  // Inspector tabs state
  const [inspectorTab, setInspectorTab] = useState('editor'); // editor, chapter, project, ai
  const [apiKeysStatus, setApiKeysStatus] = useState({}); // {anthropic: true, openai: false, ...}

  // Find & Replace state
  const [showFindDialog, setShowFindDialog] = useState(false);
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [searchInAllChapters, setSearchInAllChapters] = useState(false);
  const [searchGlobally, setSearchGlobally] = useState(false); // Search in chapters, characters, locations, threads
  const [searchResults, setSearchResults] = useState([]); // Array of {type, start, end, text, chapterId, chapterTitle, itemId, itemName}
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  const [searchHistory, setSearchHistory] = useState(() => {
    const saved = localStorage.getItem('faust-search-history');
    return saved ? JSON.parse(saved) : [];
  });

  const editorRef = useRef(null);
  const autosaveTimerRef = useRef(null);
  const [autosaveRetryCount, setAutosaveRetryCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [autosaveError, setAutosaveError] = useState(null);
  const backupTimerRef = useRef(null);
  const voiceInputRef = useRef(null);
  const historyTimerRef = useRef(null); // Debounce timer for history

  // AI Modules refs
  const commandManagerRef = useRef(null);
  const batchProcessorRef = useRef(null);
  const costOptimizerRef = useRef(null);
  const continuityTrackerRef = useRef(null);
  const hybridFlowRef = useRef(null);
  const refinementManagerRef = useRef(null);
  const plotThreadTrackerRef = useRef(null);
  const consistencyCheckerRef = useRef(null);

  // Get active chapter
  const activeChapter = project.structure.find(ch => ch.id === activeChapterId) || project.structure[0];
  const activeChapterIndex = project.structure.findIndex(ch => ch.id === activeChapterId);

  // Get split view chapter (if enabled)
  const splitViewChapter = splitViewEnabled && splitViewChapterId
    ? project.structure.find(ch => ch.id === splitViewChapterId)
    : null;

  // Apply theme
  useEffect(() => {
    const theme = isDarkMode ? 'NOX' : 'DEIS';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('faust-theme', theme);
    console.log(`[Theme] ${theme}`);
  }, [isDarkMode]);

  // Sync plot threads from project
  useEffect(() => {
    if (project.plotThreads && project.plotThreads.length > 0) {
      setPlotThreads(project.plotThreads);
    }
  }, [project.plotThreads]);

  // Load API keys status on mount
  useEffect(() => {
    const loadApiKeysStatus = async () => {
      if (!window.electronAPI) return;

      try {
        const result = await window.electronAPI.loadApiKeys();
        if (result.success && result.keys) {
          const status = {
            anthropic: !!(result.keys.ANTHROPIC_API_KEY),
            openai: !!(result.keys.OPENAI_API_KEY),
            deepseek: !!(result.keys.DEEPSEEK_API_KEY),
            grok: !!(result.keys.GROK_API_KEY)
          };
          setApiKeysStatus(status);
          console.log('[API Keys] Status loaded:', status);
        }
      } catch (error) {
        console.error('[API Keys] Load error:', error);
      }
    };

    loadApiKeysStatus();
  }, []);

  // Listen for batch progress updates
  useEffect(() => {
    if (!window.electronAPI?.onBatchProgress) return;

    const cleanup = window.electronAPI.onBatchProgress((progress) => {
      console.log('[Batch Progress]', progress);
      setGenerationProgress({
        stage: 'batch',
        current: progress.current,
        total: progress.total,
        percentage: progress.percentage,
        message: progress.message || `Käsitellään lukua ${progress.current}/${progress.total}...`
      });

      // Clear progress when complete
      if (progress.current >= progress.total) {
        setTimeout(() => {
          setGenerationProgress(null);
        }, 2000);
      }
    });

    return cleanup;
  }, []);

  // Update complexity analysis when project changes
  useEffect(() => {
    const analysis = window.ComplexityAnalyzer.analyze(project);
    setComplexity(analysis);
    console.log('[Complexity] Score:', analysis.score, 'Phase:', analysis.phase);
  }, [project.structure, project.characters]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyboardShortcuts = (event) => {
      // ESC key for modals
      if (event.key === 'Escape' || event.keyCode === 27) {
        // Close modals in priority order (last opened first)
        if (showFindDialog || showReplaceDialog) {
          setShowFindDialog(false);
          setShowReplaceDialog(false);
          console.log('[ESC] Closed Find/Replace dialog');
        } else if (showRegenerateDialog) {
          setShowRegenerateDialog(false);
          setRegenerateFeedback('');
          console.log('[ESC] Closed Regenerate dialog');
        } else if (characterModalState.isOpen) {
          closeCharacterModal();
          console.log('[ESC] Closed Character Modal');
        } else if (showCharacterSheet) {
          setShowCharacterSheet(false);
          console.log('[ESC] Closed Character Sheet');
        } else if (showLocationSheet) {
          setShowLocationSheet(false);
          console.log('[ESC] Closed Location Sheet');
        } else if (showThreadSheet) {
          setShowThreadSheet(false);
          console.log('[ESC] Closed Thread Sheet');
        } else if (showContinueDialog) {
          setShowContinueDialog(false);
          setContinuePreview('');
          console.log('[ESC] Closed Continue Writing dialog');
        } else if (showCharacterBuilder) {
          setShowCharacterBuilder(false);
          setCharacterBuilderStep(1);
          console.log('[ESC] Closed Character Builder');
        } else if (showCastPlanDialog) {
          setShowCastPlanDialog(false);
          setCastPlanStep(1);
          console.log('[ESC] Closed Cast Plan dialog');
        } else if (showProjectSettings) {
          setShowProjectSettings(false);
          console.log('[ESC] Closed Project Settings');
        } else if (showSettings) {
          setShowSettings(false);
          console.log('[ESC] Closed Settings');
        } else if (showVersionHistory) {
          setShowVersionHistory(false);
          console.log('[ESC] Closed Version History');
        } else if (showVersionComparison) {
          setShowVersionComparison(false);
          setComparisonVersionId(null);
          console.log('[ESC] Closed Version Comparison');
        } else if (showRecentFilesMenu) {
          setShowRecentFilesMenu(false);
          console.log('[ESC] Closed Recent Files menu');
        }
        return;
      }

      // Cmd+Shift+V for voice dictation
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'v') {
        event.preventDefault();

        if (voiceInputAvailable && textSelection && voiceState === 'idle') {
          console.log('[Shortcut] Cmd+Shift+V - Starting voice dictation');
          handleVoiceEdit();
        } else if (!voiceInputAvailable) {
          alert('Äänisyöte ei ole käytettävissä tässä selaimessa.');
        } else if (!textSelection) {
          alert('Valitse ensin tekstiä jonka haluat muuttaa äänellä.');
        }
        return;
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyboardShortcuts);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, [
    showFindDialog,
    showReplaceDialog,
    showRegenerateDialog,
    characterModalState,
    showCharacterSheet,
    showLocationSheet,
    showThreadSheet,
    showContinueDialog,
    showCharacterBuilder,
    showCastPlanDialog,
    showProjectSettings,
    showSettings,
    showVersionHistory,
    showVersionComparison,
    showRecentFilesMenu,
    voiceInputAvailable,
    textSelection,
    voiceState
  ]);

  // Listen to menu events
  useEffect(() => {
    if (!window.electronAPI || !window.electronAPI.onMenuAction) return;

    window.electronAPI.onMenuAction((event, arg) => {
      console.log('[Menu Event]', event, arg);

      switch (event) {
        // Edit menu
        case 'undo':
          undo();
          break;
        case 'redo':
          redo();
          break;
        case 'show-find':
          setShowFindDialog(true);
          setShowReplaceDialog(false);
          break;
        case 'find-next':
          findNext();
          break;
        case 'show-find-replace':
          setShowFindDialog(true);
          setShowReplaceDialog(true);
          break;

        // Format menu
        case 'format-bold':
          formatBold();
          break;
        case 'format-italic':
          formatItalic();
          break;
        case 'format-underline':
          formatUnderline();
          break;
        case 'format-heading':
          formatHeading(arg || 1);
          break;
        case 'format-quote':
          formatQuote();
          break;
        case 'format-list':
          formatList();
          break;

        // File menu
        case 'new-project':
          newProject();
          break;
        case 'save-project-trigger':
          saveProject();
          break;
        case 'load-project-data':
          if (arg) {
            setProject(arg);
            setActiveChapterId(arg.structure[0]?.id || 'chapter-1');
            setUnsavedChanges(false);
          }
          break;

        // Export menu - Open Export Modal
        case 'export-trigger':
        case 'export-pdf-trigger':
        case 'export-epub-trigger':
        case 'export-mobi-trigger':
          setShowExportModal(true);
          break;

        // View menu
        case 'toggle-sidebar':
          setSidebarCollapsed(prev => !prev);
          break;
        case 'toggle-inspector':
          setInspectorCollapsed(prev => !prev);
          break;
        case 'toggle-ai-panel':
          setAiAssistantOpen(prev => !prev);
          break;

        // Settings menu
        case 'show-settings':
          setShowProjectSettings(true);
          break;

        // Insert menu
        case 'new-chapter':
          addNewChapter();
          break;
        case 'insert-text':
          if (arg && editorRef.current) {
            const textarea = editorRef.current;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const content = textarea.value;
            const newContent = content.substring(0, start) + arg + content.substring(end);
            updateChapterContent(newContent);
          }
          break;

        // UI Preferences changed from menu
        case 'ui-prefs-changed':
          if (arg) {
            console.log('[UI Prefs] Updated from menu:', arg);
            // Note: theme is handled by electron menu directly via window.setTheme
            if (typeof arg.inspectorVisible === 'boolean') {
              setInspectorCollapsed(!arg.inspectorVisible);
            }
            if (typeof arg.aiPanelVisible === 'boolean') {
              setAiAssistantOpen(arg.aiPanelVisible);
            }
            // Add more UI prefs as needed
          }
          break;

        default:
          console.log('[Menu Event] Unhandled:', event);
      }
    });
  }, []);

  // NEW: Update chapter content using Command Pattern
  const updateChapterContent = (newContent, skipHistory = false) => {
    if (!activeChapter) return;

    const oldContent = activeChapter.content || '';

    // Don't create command if content hasn't changed
    if (oldContent === newContent) return;

    // Use Command Pattern for undo/redo
    if (!skipHistory && commandManagerRef.current && window.UpdateContentCommand) {
      const command = new window.UpdateContentCommand(
        setProject,
        activeChapterId,
        oldContent,
        newContent
      );
      commandManagerRef.current.execute(command);
    } else {
      // Fallback: direct update
      const words = newContent.trim().split(/\s+/).filter(w => w.length > 0);
      setProject(prev => ({
        ...prev,
        structure: prev.structure.map(ch =>
          ch.id === activeChapterId
            ? { ...ch, content: newContent, wordCount: words.length }
            : ch
        )
      }));
    }

    setUnsavedChanges(true);
  };

  // Text formatting functions (Markdown-based)
  const applyFormatting = (prefix, suffix = prefix) => {
    if (!editorRef.current) return;

    const textarea = editorRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const content = textarea.value;

    // If text is selected, wrap it with formatting
    if (start !== end) {
      const before = content.substring(0, start);
      const after = content.substring(end);
      const newContent = before + prefix + selectedText + suffix + after;

      updateChapterContent(newContent);

      // Restore selection
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      }, 0);
    }
  };

  const formatBold = () => applyFormatting('**');
  const formatItalic = () => applyFormatting('*');
  const formatUnderline = () => applyFormatting('__');

  const formatHeading = (level) => {
    if (!editorRef.current) return;

    const textarea = editorRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const content = textarea.value;

    // Find the start of the current line
    let lineStart = start;
    while (lineStart > 0 && content[lineStart - 1] !== '\n') {
      lineStart--;
    }

    // Find the end of the current line
    let lineEnd = end;
    while (lineEnd < content.length && content[lineEnd] !== '\n') {
      lineEnd++;
    }

    const line = content.substring(lineStart, lineEnd);
    const prefix = '#'.repeat(level) + ' ';

    // Check if line already has heading markers
    const headingMatch = line.match(/^#+\s/);
    let newLine;

    if (headingMatch) {
      // Replace existing heading level or remove if same level
      if (headingMatch[0] === prefix) {
        newLine = line.replace(/^#+\s/, '');
      } else {
        newLine = line.replace(/^#+\s/, prefix);
      }
    } else {
      // Add heading marker
      newLine = prefix + line;
    }

    const before = content.substring(0, lineStart);
    const after = content.substring(lineEnd);
    const newContent = before + newLine + after;

    updateChapterContent(newContent);

    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      const newPos = lineStart + newLine.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const formatQuote = () => {
    if (!editorRef.current) return;

    const textarea = editorRef.current;
    const start = textarea.selectionStart;
    const content = textarea.value;

    // Find the start of the current line
    let lineStart = start;
    while (lineStart > 0 && content[lineStart - 1] !== '\n') {
      lineStart--;
    }

    const before = content.substring(0, lineStart);
    const after = content.substring(lineStart);

    // Check if line already starts with >
    if (after.startsWith('> ')) {
      // Remove quote marker
      updateChapterContent(before + after.substring(2));
    } else {
      // Add quote marker
      updateChapterContent(before + '> ' + after);
    }
  };

  const formatList = () => {
    if (!editorRef.current) return;

    const textarea = editorRef.current;
    const start = textarea.selectionStart;
    const content = textarea.value;

    // Find the start of the current line
    let lineStart = start;
    while (lineStart > 0 && content[lineStart - 1] !== '\n') {
      lineStart--;
    }

    const before = content.substring(0, lineStart);
    const after = content.substring(lineStart);

    // Check if line already starts with list marker
    if (after.match(/^[-*]\s/)) {
      // Remove list marker
      updateChapterContent(before + after.replace(/^[-*]\s/, ''));
    } else {
      // Add list marker
      updateChapterContent(before + '- ' + after);
    }
  };

  // Undo/Redo - Command Pattern
  const undo = () => {
    if (!commandManagerRef.current) {
      console.log('[Undo] CommandManager not initialized');
      return;
    }

    const success = commandManagerRef.current.undo();
    if (success) {
      setUnsavedChanges(true);
      const info = commandManagerRef.current.getInfo();
      console.log('[Undo] Success. Undo stack:', info.undoCount, 'Redo stack:', info.redoCount);
    }
  };

  const redo = () => {
    if (!commandManagerRef.current) {
      console.log('[Redo] CommandManager not initialized');
      return;
    }

    const success = commandManagerRef.current.redo();
    if (success) {
      setUnsavedChanges(true);
      const info = commandManagerRef.current.getInfo();
      console.log('[Redo] Success. Undo stack:', info.undoCount, 'Redo stack:', info.redoCount);
    }
  };

  // Find & Replace functions
  const performSearch = (term = searchTerm) => {
    if (!term) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }

    // Add to search history
    addToSearchHistory(term);

    const results = [];
    let searchPattern;

    try {
      // Build regex based on options
      const flags = caseSensitive ? 'g' : 'gi';
      let pattern;

      if (useRegex) {
        // Use term as raw regex
        pattern = term;
      } else {
        // Escape special chars, optionally add word boundaries
        pattern = matchWholeWord ? `\\b${escapeRegex(term)}\\b` : escapeRegex(term);
      }

      searchPattern = new RegExp(pattern, flags);

      // Search in all chapters or just active chapter
      const chaptersToSearch = searchInAllChapters ? project.structure : [activeChapter];

      chaptersToSearch.forEach(chapter => {
        if (!chapter || !chapter.content) return;

        const content = chapter.content;
        let match;
        const regex = new RegExp(pattern, flags); // Create new regex for each chapter

        while ((match = regex.exec(content)) !== null) {
          // Get context (50 chars before and after)
          const contextStart = Math.max(0, match.index - 50);
          const contextEnd = Math.min(content.length, match.index + match[0].length + 50);
          const context = content.substring(contextStart, contextEnd);

          results.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[0],
            context: context,
            chapterId: chapter.id,
            chapterTitle: chapter.title || 'Nimetön luku'
          });
        }
      });

      // If global search enabled, also search in characters, locations, and plot threads
      if (searchGlobally) {
        // Search in characters
        (project.characters || []).forEach(char => {
          const searchableText = [
            char.name,
            char.description,
            char.background,
            char.occupation,
            char.notes
          ].filter(Boolean).join(' ');

          let match;
          const regex = new RegExp(pattern, flags);
          while ((match = regex.exec(searchableText)) !== null) {
            results.push({
              type: 'character',
              start: match.index,
              end: match.index + match[0].length,
              text: match[0],
              context: searchableText.substring(Math.max(0, match.index - 30), match.index + match[0].length + 30),
              itemId: char.id,
              itemName: char.name,
              chapterId: null,
              chapterTitle: null
            });
          }
        });

        // Search in locations
        (project.locations || []).forEach(loc => {
          const searchableText = [
            loc.name,
            loc.description,
            loc.historicalContext,
            loc.notes
          ].filter(Boolean).join(' ');

          let match;
          const regex = new RegExp(pattern, flags);
          while ((match = regex.exec(searchableText)) !== null) {
            results.push({
              type: 'location',
              start: match.index,
              end: match.index + match[0].length,
              text: match[0],
              context: searchableText.substring(Math.max(0, match.index - 30), match.index + match[0].length + 30),
              itemId: loc.id,
              itemName: loc.name,
              chapterId: null,
              chapterTitle: null
            });
          }
        });

        // Search in plot threads
        (project.plotThreads || []).forEach(thread => {
          const searchableText = [
            thread.name,
            thread.description,
            thread.resolution,
            thread.notes
          ].filter(Boolean).join(' ');

          let match;
          const regex = new RegExp(pattern, flags);
          while ((match = regex.exec(searchableText)) !== null) {
            results.push({
              type: 'thread',
              start: match.index,
              end: match.index + match[0].length,
              text: match[0],
              context: searchableText.substring(Math.max(0, match.index - 30), match.index + match[0].length + 30),
              itemId: thread.id,
              itemName: thread.name,
              chapterId: null,
              chapterTitle: null
            });
          }
        });
      }

      setSearchResults(results);
      setCurrentSearchIndex(results.length > 0 ? 0 : -1);

      console.log('[Find] Found', results.length, 'matches for:', term,
        searchGlobally ? '(global)' : searchInAllChapters ? '(all chapters)' : '(current chapter)');

      // Highlight first result
      if (results.length > 0) {
        jumpToResult(0);
      }
    } catch (error) {
      console.error('[Find] Search error:', error);
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      alert(`Hakuvirhe: ${error.message}\n\nTarkista regex-syntaksi.`);
    }
  };

  // Add to search history
  const addToSearchHistory = (term) => {
    setSearchHistory(prev => {
      const filtered = prev.filter(t => t !== term);
      const updated = [term, ...filtered].slice(0, 10); // Keep max 10
      localStorage.setItem('faust-search-history', JSON.stringify(updated));
      return updated;
    });
  };

  // Jump to specific search result
  const jumpToResult = (index) => {
    if (index < 0 || index >= searchResults.length) return;

    const result = searchResults[index];

    // Switch to the chapter if needed
    if (result.chapterId !== activeChapterId) {
      setActiveChapterId(result.chapterId);
      // Wait for chapter to load
      setTimeout(() => {
        highlightResult(result);
      }, 100);
    } else {
      highlightResult(result);
    }
  };

  // Bookmark functions
  const addBookmark = (name = '') => {
    if (!editorRef.current || !activeChapterId) return;

    const position = editorRef.current.selectionStart;
    const content = activeChapter.content || '';
    const contextStart = Math.max(0, position - 20);
    const contextEnd = Math.min(content.length, position + 30);
    const context = content.substring(contextStart, contextEnd);

    const bookmark = {
      id: `bookmark-${Date.now()}`,
      chapterId: activeChapterId,
      chapterTitle: activeChapter.title,
      position: position,
      name: name || `Kirjanmerkki ${(project.bookmarks || []).length + 1}`,
      context: context,
      color: '#d4af37', // Default gold color
      created: new Date().toISOString()
    };

    setProject(prev => ({
      ...prev,
      bookmarks: [...(prev.bookmarks || []), bookmark]
    }));
    setUnsavedChanges(true);
    console.log('[Bookmarks] Added:', bookmark.name, 'at position', position);
  };

  const deleteBookmark = (bookmarkId) => {
    setProject(prev => ({
      ...prev,
      bookmarks: (prev.bookmarks || []).filter(b => b.id !== bookmarkId)
    }));
    setUnsavedChanges(true);
  };

  const jumpToBookmark = (bookmark) => {
    // Switch to chapter if needed
    if (bookmark.chapterId !== activeChapterId) {
      setActiveChapterId(bookmark.chapterId);
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          editorRef.current.setSelectionRange(bookmark.position, bookmark.position);
          // Scroll to position
          const lineHeight = 24;
          const linesBeforeBookmark = (activeChapter.content || '').substring(0, bookmark.position).split('\n').length;
          editorRef.current.scrollTop = linesBeforeBookmark * lineHeight - 200;
        }
      }, 100);
    } else {
      if (editorRef.current) {
        editorRef.current.focus();
        editorRef.current.setSelectionRange(bookmark.position, bookmark.position);
        const lineHeight = 24;
        const linesBeforeBookmark = (activeChapter.content || '').substring(0, bookmark.position).split('\n').length;
        editorRef.current.scrollTop = linesBeforeBookmark * lineHeight - 200;
      }
    }
    setShowBookmarksPanel(false);
  };

  const renameBookmark = (bookmarkId, newName) => {
    setProject(prev => ({
      ...prev,
      bookmarks: (prev.bookmarks || []).map(b =>
        b.id === bookmarkId ? { ...b, name: newName } : b
      )
    }));
    setUnsavedChanges(true);
  };

  // Simple diff algorithm for text comparison
  const computeTextDiff = (oldText, newText) => {
    const oldWords = (oldText || '').split(/(\s+)/);
    const newWords = (newText || '').split(/(\s+)/);
    const result = [];

    let oldIdx = 0;
    let newIdx = 0;

    while (oldIdx < oldWords.length || newIdx < newWords.length) {
      if (oldIdx >= oldWords.length) {
        // Added words
        result.push({ type: 'added', text: newWords[newIdx] });
        newIdx++;
      } else if (newIdx >= newWords.length) {
        // Removed words
        result.push({ type: 'removed', text: oldWords[oldIdx] });
        oldIdx++;
      } else if (oldWords[oldIdx] === newWords[newIdx]) {
        // Same
        result.push({ type: 'same', text: newWords[newIdx] });
        oldIdx++;
        newIdx++;
      } else {
        // Find if old word appears later in new
        const foundInNew = newWords.slice(newIdx + 1, newIdx + 10).indexOf(oldWords[oldIdx]);
        const foundInOld = oldWords.slice(oldIdx + 1, oldIdx + 10).indexOf(newWords[newIdx]);

        if (foundInNew !== -1 && (foundInOld === -1 || foundInNew < foundInOld)) {
          // New words were added
          result.push({ type: 'added', text: newWords[newIdx] });
          newIdx++;
        } else if (foundInOld !== -1) {
          // Old word was removed
          result.push({ type: 'removed', text: oldWords[oldIdx] });
          oldIdx++;
        } else {
          // Changed
          result.push({ type: 'removed', text: oldWords[oldIdx] });
          result.push({ type: 'added', text: newWords[newIdx] });
          oldIdx++;
          newIdx++;
        }
      }
    }

    return result;
  };

  // Snapshot functions (project-level named versions)
  const createSnapshot = (name, description = '') => {
    // Deep copy of current project structure
    const snapshotData = {
      id: `snapshot-${Date.now()}`,
      name: name || `Snapshot ${new Date().toLocaleString('fi-FI')}`,
      description: description,
      created: new Date().toISOString(),
      totalWords: project.targets.currentTotal,
      chapterCount: project.structure.length,
      // Deep copy of structure with content
      structure: JSON.parse(JSON.stringify(project.structure))
    };

    setProject(prev => ({
      ...prev,
      snapshots: [...(prev.snapshots || []), snapshotData]
    }));
    setUnsavedChanges(true);
    console.log('[Snapshots] Created:', snapshotData.name);
    return snapshotData;
  };

  const deleteSnapshot = (snapshotId) => {
    setProject(prev => ({
      ...prev,
      snapshots: (prev.snapshots || []).filter(s => s.id !== snapshotId)
    }));
    setUnsavedChanges(true);
  };

  const restoreSnapshot = (snapshotId) => {
    const snapshot = (project.snapshots || []).find(s => s.id === snapshotId);
    if (!snapshot) return;

    // Confirm restoration
    if (!confirm(`Palauta snapshot "${snapshot.name}"?\n\nTämä korvaa nykyisen tekstin. Suosittelemme luomaan uuden snapshotin ennen palautusta.`)) {
      return;
    }

    // Restore structure from snapshot
    setProject(prev => ({
      ...prev,
      structure: JSON.parse(JSON.stringify(snapshot.structure)),
      modified: new Date().toISOString()
    }));
    setUnsavedChanges(true);
    setShowSnapshotsPanel(false);
    console.log('[Snapshots] Restored:', snapshot.name);
  };

  const compareWithSnapshot = (snapshotId) => {
    const snapshot = (project.snapshots || []).find(s => s.id === snapshotId);
    if (!snapshot) return;

    // Find the same chapter in snapshot
    const snapshotChapter = snapshot.structure.find(ch => ch.id === activeChapterId);
    if (!snapshotChapter) {
      alert('Tämä luku ei löydy valitusta snapshotista.');
      return;
    }

    // Show comparison in a simple alert (could be improved with a modal)
    const currentWords = (activeChapter.content || '').split(/\s+/).filter(Boolean).length;
    const snapshotWords = (snapshotChapter.content || '').split(/\s+/).filter(Boolean).length;
    const diff = currentWords - snapshotWords;

    alert(`Vertailu: "${snapshot.name}"\n\n` +
          `Luku: ${activeChapter.title}\n\n` +
          `Nykyinen: ${currentWords} sanaa\n` +
          `Snapshot: ${snapshotWords} sanaa\n` +
          `Ero: ${diff > 0 ? '+' : ''}${diff} sanaa`);
  };

  // Collection functions (dynamic chapter groupings)
  const createCollection = (name, type = 'manual', filter = null) => {
    const collection = {
      id: `collection-${Date.now()}`,
      name: name || 'Uusi kokoelma',
      type: type, // 'manual', 'status', 'character', 'search'
      filter: filter, // Filter criteria for dynamic collections
      chapterIds: [], // For manual collections
      color: '#d4af37',
      created: new Date().toISOString()
    };

    setProject(prev => ({
      ...prev,
      collections: [...(prev.collections || []), collection]
    }));
    setUnsavedChanges(true);
    return collection;
  };

  const deleteCollection = (collectionId) => {
    setProject(prev => ({
      ...prev,
      collections: (prev.collections || []).filter(c => c.id !== collectionId)
    }));
    if (activeCollectionId === collectionId) {
      setActiveCollectionId(null);
    }
    setUnsavedChanges(true);
  };

  const addChapterToCollection = (collectionId, chapterId) => {
    setProject(prev => ({
      ...prev,
      collections: (prev.collections || []).map(c =>
        c.id === collectionId && c.type === 'manual'
          ? { ...c, chapterIds: [...new Set([...c.chapterIds, chapterId])] }
          : c
      )
    }));
    setUnsavedChanges(true);
  };

  const removeChapterFromCollection = (collectionId, chapterId) => {
    setProject(prev => ({
      ...prev,
      collections: (prev.collections || []).map(c =>
        c.id === collectionId && c.type === 'manual'
          ? { ...c, chapterIds: c.chapterIds.filter(id => id !== chapterId) }
          : c
      )
    }));
    setUnsavedChanges(true);
  };

  // Get chapters that belong to a collection (supports both manual and dynamic)
  const getCollectionChapters = (collection) => {
    if (!collection) return [];

    if (collection.type === 'manual') {
      return project.structure.filter(ch => collection.chapterIds.includes(ch.id));
    }

    // Dynamic collections based on filter
    if (collection.type === 'status' && collection.filter) {
      return project.structure.filter(ch => ch.status === collection.filter);
    }

    if (collection.type === 'character' && collection.filter) {
      // Find chapters mentioning this character
      const charName = collection.filter.toLowerCase();
      return project.structure.filter(ch =>
        (ch.content || '').toLowerCase().includes(charName) ||
        (ch.notesAI?.characterMentions || []).some(m => m.toLowerCase().includes(charName))
      );
    }

    if (collection.type === 'search' && collection.filter) {
      const searchTerm = collection.filter.toLowerCase();
      return project.structure.filter(ch =>
        (ch.content || '').toLowerCase().includes(searchTerm) ||
        (ch.title || '').toLowerCase().includes(searchTerm)
      );
    }

    return [];
  };

  // Highlight a search result in editor
  const highlightResult = (result) => {
    if (editorRef.current) {
      editorRef.current.focus();
      editorRef.current.setSelectionRange(result.start, result.end);
      // Scroll to selection
      const textarea = editorRef.current;
      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
      const totalLines = textarea.value.split('\n').length;
      const currentLine = textarea.value.substring(0, result.start).split('\n').length;
      const scrollPosition = (currentLine / totalLines) * textarea.scrollHeight;
      textarea.scrollTop = Math.max(0, scrollPosition - textarea.clientHeight / 2);
    }
  };

  const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const findNext = () => {
    if (searchResults.length === 0) {
      performSearch();
      return;
    }

    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    jumpToResult(nextIndex);

    console.log('[Find] Jump to result', nextIndex + 1, 'of', searchResults.length);
  };

  const findPrevious = () => {
    if (searchResults.length === 0) return;

    const prevIndex = currentSearchIndex - 1 < 0 ? searchResults.length - 1 : currentSearchIndex - 1;
    setCurrentSearchIndex(prevIndex);
    jumpToResult(prevIndex);

    console.log('[Find] Jump to result', prevIndex + 1, 'of', searchResults.length);
  };

  const replaceCurrent = () => {
    if (currentSearchIndex < 0 || currentSearchIndex >= searchResults.length) return;

    const result = searchResults[currentSearchIndex];
    const content = activeChapter.content;
    const newContent = content.substring(0, result.start) + replaceTerm + content.substring(result.end);

    updateChapterContent(newContent);

    // Re-search with updated content
    setTimeout(() => {
      performSearch();
    }, 100);

    console.log('[Replace] Replaced match', currentSearchIndex + 1);
  };

  const replaceAll = () => {
    if (searchResults.length === 0) return;

    let content = activeChapter.content;
    let offset = 0;

    // Replace all occurrences from end to start (to maintain positions)
    const sortedResults = [...searchResults].sort((a, b) => b.start - a.start);

    sortedResults.forEach(result => {
      content = content.substring(0, result.start) + replaceTerm + content.substring(result.end);
    });

    updateChapterContent(content);

    const count = searchResults.length;
    setSearchResults([]);
    setCurrentSearchIndex(-1);

    console.log('[Replace All] Replaced', count, 'matches');
  };

  const closeFindDialog = () => {
    setShowFindDialog(false);
    setShowReplaceDialog(false);
    setSearchResults([]);
    setCurrentSearchIndex(-1);
  };

  // Save project
  // Update recent files list
  const addToRecentFiles = (filePath, projectTitle) => {
    setRecentFiles(prev => {
      // Remove duplicates and add to top
      const filtered = prev.filter(f => f.path !== filePath);
      const updated = [
        { path: filePath, title: projectTitle, lastOpened: new Date().toISOString() },
        ...filtered
      ].slice(0, 10); // Keep max 10 recent files

      // Save to localStorage
      localStorage.setItem('faust-recent-files', JSON.stringify(updated));
      return updated;
    });
  };

  const saveProject = async () => {
    if (!window.electronAPI) {
      console.error('[Save] Electron API not available');
      return;
    }

    try {
      setSavingState('saving');
      const result = await window.electronAPI.saveProject(project);
      if (result.success) {
        setCurrentFilePath(result.path);
        setUnsavedChanges(false);
        setSavingState('saved');
        addToRecentFiles(result.path, project.title);
        console.log('[Save] Project saved:', result.path);

        // Clear 'saved' state after 2 seconds
        setTimeout(() => {
          setSavingState('idle');
        }, 2000);
      } else {
        setSavingState('error');
        setTimeout(() => {
          setSavingState('idle');
        }, 3000);
      }
    } catch (error) {
      console.error('[Save] Error:', error);
      setSavingState('error');
      setTimeout(() => {
        setSavingState('idle');
      }, 3000);
    }
  };

  // Load project
  const loadProject = async () => {
    if (!window.electronAPI) {
      console.error('[Load] Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.loadProject();
      if (result.success) {
        setProject(result.data);
        setCurrentFilePath(result.filePath);
        setActiveChapterId(result.data.structure[0]?.id || 'chapter-1');
        setUnsavedChanges(false);
        addToRecentFiles(result.filePath, result.data.title);
        console.log('[Load] Project loaded:', result.filePath);
      }
    } catch (error) {
      console.error('[Load] Error:', error);
    }
  };

  // Load recent file
  const loadRecentFile = async (filePath) => {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.loadProjectFromPath(filePath);
      if (result.success) {
        setProject(result.data);
        setCurrentFilePath(filePath);
        setActiveChapterId(result.data.structure[0]?.id || 'chapter-1');
        setUnsavedChanges(false);
        addToRecentFiles(filePath, result.data.title);
        console.log('[Load] Recent file loaded:', filePath);
      }
    } catch (error) {
      console.error('[Load Recent] Error:', error);
      // Remove from recent files if it failed to load
      setRecentFiles(prev => {
        const updated = prev.filter(f => f.path !== filePath);
        localStorage.setItem('faust-recent-files', JSON.stringify(updated));
        return updated;
      });
    }
  };

  // New project
  const newProject = () => {
    if (unsavedChanges) {
      const confirmed = confirm('Tallentamattomat muutokset katoavat. Jatketaanko?');
      if (!confirmed) return;
    }

    setProject(createDefaultProject());
    setCurrentFilePath(null);
    setActiveChapterId('chapter-1');
    setUnsavedChanges(false);
    console.log('[New] New project created');
  };

  // Export document (current chapter)
  const exportDocument = async (format) => {
    if (!window.electronAPI) {
      console.error('[Export] Electron API not available');
      return;
    }

    if (!activeChapter) {
      alert('Ei aktiivista lukua vietäväksi.');
      return;
    }

    try {
      const result = await window.electronAPI.exportDocument({
        content: activeChapter.content,
        title: activeChapter.title,
        format: format
      });

      if (result.success) {
        console.log('[Export] Document exported:', result.path);
      } else {
        alert('Vienti epäonnistui: ' + (result.error || 'Tuntematon virhe'));
      }
    } catch (error) {
      console.error('[Export] Error:', error);
      alert('Vienti epäonnistui: ' + error.message);
    }
  };

  // Export full project (all chapters)
  const exportFullProject = async (format) => {
    if (!window.electronAPI) {
      console.error('[Export] Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.exportFullProject({
        project: project,
        format: format
      });

      if (result.success) {
        console.log('[Export] Full project exported:', result.path);
      } else {
        alert('Vienti epäonnistui: ' + (result.error || 'Tuntematon virhe'));
      }
    } catch (error) {
      console.error('[Export] Error:', error);
      alert('Vienti epäonnistui: ' + error.message);
    }
  };

  // Export EPUB
  const exportEPUB = async () => {
    if (!window.electronAPI) {
      console.error('[Export EPUB] Electron API not available');
      return;
    }

    try {
      const today = new Date().toLocaleDateString('fi-FI', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Prepare EPUB metadata
      const metadata = {
        title: project.title,
        author: project.author || 'Unknown Author',
        language: project.language || 'fi',
        date: today,
        description: project.synopsis || '',
        publisher: project.author || 'Self-published'
      };

      // Prepare chapters
      const chapters = project.structure
        .filter(ch => ch.content && ch.content.trim())
        .map((ch, idx) => ({
          id: `chapter-${idx + 1}`,
          title: ch.title,
          content: ch.content
        }));

      if (chapters.length === 0) {
        alert('Ei vietäviä lukuja. Lisää sisältöä ensin.');
        return;
      }

      console.log(`[Export EPUB] Exporting ${chapters.length} chapters...`);

      const result = await window.electronAPI.exportEPUB({
        metadata,
        chapters
      });

      if (result.success) {
        console.log('[Export EPUB] Success:', result.path);
      } else {
        alert('EPUB-vienti epäonnistui: ' + (result.error || 'Tuntematon virhe'));
      }
    } catch (error) {
      console.error('[Export EPUB] Error:', error);
      alert('EPUB-vienti epäonnistui: ' + error.message);
    }
  };

  // Export MOBI (Kindle format)
  const exportMOBI = async () => {
    if (!window.electronAPI) {
      console.error('[Export MOBI] Electron API not available');
      return;
    }

    try {
      const today = new Date().toLocaleDateString('fi-FI', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Prepare MOBI metadata
      const metadata = {
        title: project.title,
        author: project.author || 'Unknown Author',
        language: project.language || 'fi',
        date: today,
        description: project.synopsis || '',
        publisher: project.author || 'Self-published'
      };

      // Prepare chapters
      const chapters = project.structure
        .filter(ch => ch.content && ch.content.trim())
        .map((ch, idx) => ({
          id: `chapter-${idx + 1}`,
          title: ch.title,
          content: ch.content
        }));

      if (chapters.length === 0) {
        alert('Ei vietäviä lukuja. Lisää sisältöä ensin.');
        return;
      }

      console.log(`[Export MOBI] Exporting ${chapters.length} chapters...`);

      const result = await window.electronAPI.exportMOBI({
        metadata,
        chapters
      });

      if (result.success) {
        console.log('[Export MOBI] Success:', result.path);
      } else {
        alert('MOBI-vienti epäonnistui: ' + (result.error || 'Tuntematon virhe'));
      }
    } catch (error) {
      console.error('[Export MOBI] Error:', error);
      alert('MOBI-vienti epäonnistui: ' + error.message);
    }
  };

  // Export PDF
  const exportPDF = async () => {
    if (!window.electronAPI) {
      console.error('[Export PDF] Electron API not available');
      return;
    }

    try {
      const today = new Date().toLocaleDateString('fi-FI', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Generate HTML from all chapters with enhanced formatting
      let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="author" content="${project.author || 'Unknown'}">
  <meta name="description" content="${project.title}">
  <title>${project.title}</title>
  <style>
    @page {
      size: A4;
      margin: 2.5cm 2cm;
      @bottom-center {
        content: counter(page);
        font-family: 'EB Garamond', Georgia, serif;
        font-size: 10pt;
        color: #666;
      }
    }

    body {
      font-family: 'EB Garamond', Georgia, serif;
      font-size: 12pt;
      line-height: 1.8;
      color: #1a1a1a;
      text-align: justify;
      hyphens: auto;
    }

    /* Title page */
    .title-page {
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      page-break-after: always;
    }

    .title-page h1 {
      font-size: 36pt;
      margin-bottom: 40px;
      font-weight: normal;
      letter-spacing: 2px;
    }

    .title-page .author {
      font-size: 18pt;
      margin-top: 60px;
      font-style: italic;
    }

    .title-page .date {
      font-size: 11pt;
      margin-top: 20px;
      color: #666;
    }

    /* Chapter styling */
    .chapter {
      page-break-before: always;
    }

    .chapter:first-of-type {
      page-break-before: avoid;
    }

    h1.chapter-title {
      font-size: 24pt;
      margin-top: 80px;
      margin-bottom: 40px;
      text-align: center;
      font-weight: normal;
      letter-spacing: 1px;
    }

    p {
      margin: 0 0 12px 0;
      text-indent: 24px;
    }

    p:first-of-type {
      text-indent: 0;
    }

    /* Improve typography */
    p {
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }

    /* Better quote marks */
    q {
      quotes: "'" "'" """ """;
    }

    /* Widow/orphan control */
    p {
      orphans: 3;
      widows: 3;
    }
  </style>
</head>
<body>
  <!-- Title Page -->
  <div class="title-page">
    <h1>${project.title}</h1>
    ${project.author ? `<div class="author">${project.author}</div>` : ''}
    <div class="date">${today}</div>
  </div>

  <!-- Chapters -->
`;

      // Add chapters with enhanced formatting
      project.structure.forEach((chapter, index) => {
        if (chapter.content) {
          html += `  <div class="chapter">\n`;
          html += `    <h1 class="chapter-title">${chapter.title}</h1>\n`;

          // Split content into paragraphs and improve typography
          const paragraphs = chapter.content.split('\n\n').filter(p => p.trim());
          paragraphs.forEach(p => {
            // Improve typography: replace straight quotes, em dashes, ellipses
            let formatted = p
              .replace(/\n/g, ' ')
              .replace(/"/g, '\u201C')  // Left double quote
              .replace(/'/g, '\u2019')   // Right single quote (apostrophe)
              .replace(/--/g, '\u2014')  // Em dash
              .replace(/\.\.\./g, '\u2026')  // Ellipsis
              .trim();

            html += `    <p>${formatted}</p>\n`;
          });

          html += `  </div>\n`;
        }
      });

      html += `</body>\n</html>`;

      const result = await window.electronAPI.exportPDF({
        html: html,
        title: project.title
      });

      if (result.success) {
        console.log('[Export PDF] Success:', result.path);
      } else {
        alert('PDF-vienti epäonnistui: ' + (result.error || 'Tuntematon virhe'));
      }
    } catch (error) {
      console.error('[Export PDF] Error:', error);
      alert('PDF-vienti epäonnistui: ' + error.message);
    }
  };

  // Helper: Create new document with full AI structure
  const createDocument = (type, title, parentId = null) => {
    const timestamp = new Date().toISOString();
    return {
      id: `${type}-${Date.now()}`,
      type,
      title,
      order: 0,
      content: '',
      wordCount: 0,
      children: [],
      parentId,

      // AI-Enhanced Metadata
      synopsis: '',
      synopsisAI: '',
      synopsisManual: '',

      notes: '',
      notesAI: {
        characterMentions: [],
        locations: [],
        timeframe: '',
        mood: '',
        themes: [],
        continuityIssues: []
      },

      status: 'plan', // plan, draft, revision, final
      povCharacter: null, // ID of POV character
      mood: '', // User-set mood/tone
      storyTimestamp: '', // Time in story (e.g., "Day 3, Morning")

      // Annotations array for margin notes, highlights, and AI suggestions
      annotations: [],

      aiQuality: {
        score: 0,
        lastAnalyzed: null,
        issues: [],
        strengths: [],
        suggestions: [],
        readiness: 'draft'
      },

      structureHints: {
        shouldBeSplit: false,
        suggestedSceneBreaks: [],
        relatedChapters: [],
        missingTransition: false
      },

      pacing: {
        speed: 'medium',
        tension: 0,
        wordDensity: 0,
        dialogueRatio: 0
      },

      label: '',
      color: '',

      created: timestamp,
      modified: timestamp,

      versions: []
    };
  };

  // Add new chapter
  const addChapter = () => {
    const newChapterNumber = project.structure.length + 1;
    const newChapter = createDocument('chapter', `Luku ${newChapterNumber}`);

    setProject(prev => ({
      ...prev,
      structure: [...prev.structure, newChapter]
    }));

    setActiveChapterId(newChapter.id);
    setUnsavedChanges(true);
    console.log('[Chapter] New chapter added:', newChapter.id);
  };

  // Add new folder (for organizing chapters)
  const addFolder = () => {
    const newFolder = createDocument('folder', 'Uusi kansio');

    setProject(prev => ({
      ...prev,
      structure: [...prev.structure, newFolder]
    }));

    setUnsavedChanges(true);
    console.log('[Folder] New folder added:', newFolder.id);
  };

  // Add scene to chapter
  const addScene = (parentChapterId) => {
    const parent = project.structure.find(ch => ch.id === parentChapterId);
    if (!parent) return;

    const newSceneNumber = (parent.children?.length || 0) + 1;
    const newScene = createDocument('scene', `Kohtaus ${newSceneNumber}`, parentChapterId);

    setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === parentChapterId
          ? { ...ch, children: [...(ch.children || []), newScene] }
          : ch
      )
    }));

    setActiveChapterId(newScene.id);
    setUnsavedChanges(true);
    console.log('[Scene] New scene added to chapter:', parentChapterId);
  };

  // Delete chapter
  const deleteChapter = (chapterId) => {
    if (project.structure.length === 1) {
      alert('Et voi poistaa viimeistä lukua');
      return;
    }

    const confirmed = confirm('Haluatko varmasti poistaa tämän luvun?');
    if (!confirmed) return;

    const deletedIndex = project.structure.findIndex(ch => ch.id === chapterId);

    setProject(prev => ({
      ...prev,
      structure: prev.structure.filter(ch => ch.id !== chapterId)
    }));

    // Switch to previous chapter or first chapter
    const newActiveId = project.structure[Math.max(0, deletedIndex - 1)]?.id || project.structure[0]?.id;
    setActiveChapterId(newActiveId);
    setUnsavedChanges(true);
    console.log('[Chapter] Deleted:', chapterId);
  };

  // Move chapter up
  const moveChapterUp = (chapterId) => {
    const index = project.structure.findIndex(ch => ch.id === chapterId);
    if (index === 0) return; // Already first

    setProject(prev => {
      const newStructure = [...prev.structure];
      [newStructure[index - 1], newStructure[index]] = [newStructure[index], newStructure[index - 1]];

      // Update order numbers
      newStructure.forEach((ch, idx) => ch.order = idx);

      return { ...prev, structure: newStructure };
    });

    setUnsavedChanges(true);
  };

  // Move chapter down
  const moveChapterDown = (chapterId) => {
    const index = project.structure.findIndex(ch => ch.id === chapterId);
    if (index === project.structure.length - 1) return; // Already last

    setProject(prev => {
      const newStructure = [...prev.structure];
      [newStructure[index], newStructure[index + 1]] = [newStructure[index + 1], newStructure[index]];

      // Update order numbers
      newStructure.forEach((ch, idx) => ch.order = idx);

      return { ...prev, structure: newStructure };
    });

    setUnsavedChanges(true);
  };

  // Change AI mode
  const setAIMode = (modeName) => {
    setProject(prev => ({
      ...prev,
      ai: {
        ...prev.ai,
        currentMode: modeName
      }
    }));
    setUnsavedChanges(true);
    console.log('[AI Mode] Changed to:', modeName);
  };

  // Change AI provider
  const setAIProvider = (providerName) => {
    setProject(prev => ({
      ...prev,
      ai: {
        ...prev.ai,
        provider: providerName
      }
    }));
    setUnsavedChanges(true);
    console.log('[AI Provider] Changed to:', providerName);
  };

  // Toggle API key input for provider
  const toggleApiKeyInput = (providerName) => {
    if (showApiKeyInput === providerName) {
      setShowApiKeyInput(null);
      setApiKeyInputValue('');
    } else {
      setShowApiKeyInput(providerName);
      setApiKeyInputValue('');
    }
  };

  // Save API key
  const saveApiKey = async (providerName, apiKey) => {
    if (!window.electronAPI) {
      alert('Electron API ei käytettävissä');
      return;
    }

    const keyMap = {
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      grok: 'GROK_API_KEY',
      gemini: 'GEMINI_API_KEY',
      cursor: 'CURSOR_API_KEY'
    };

    try {
      // Load existing keys first to preserve them
      const existingResult = await window.electronAPI.loadApiKeys();
      const existingKeys = existingResult.keys || {};

      // Merge new key with existing keys
      const updatedKeys = {
        ...existingKeys,
        [keyMap[providerName]]: apiKey
      };

      // Save all keys
      const result = await window.electronAPI.saveApiKeys(updatedKeys);

      if (result.success) {
        console.log('[API Key] Saved for:', providerName);
        setShowApiKeyInput(null);
        setApiKeyInputValue('');

        // Update status
        setApiKeysStatus(prev => ({
          ...prev,
          [providerName]: true
        }));

        alert(`API-avain tallennettu: ${providerName}`);
      } else {
        alert('Virhe tallennuksessa: ' + result.error);
      }
    } catch (error) {
      console.error('[API Key] Save error:', error);
      alert('Virhe tallennuksessa: ' + error.message);
    }
  };

  // Get current mode config
  const getCurrentMode = () => {
    return project.ai.modes[project.ai.currentMode] || project.ai.modes.production;
  };

  // Helper function: Call AI with current mode settings
  const callAIWithMode = async (userPrompt, options = {}) => {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    const mode = getCurrentMode();

    // Build full prompt with mode's system prompt
    const fullPrompt = mode.systemPrompt
      ? `${mode.systemPrompt}\n\n${userPrompt}`
      : userPrompt;

    // Merge mode settings with optional overrides
    const apiParams = {
      prompt: fullPrompt,
      temperature: options.temperature ?? mode.temperature,
      max_tokens: options.max_tokens ?? mode.maxTokens,
      model: options.model ?? project.ai.model
    };

    console.log(`[AI Mode] Using ${project.ai.currentMode} mode (temp: ${apiParams.temperature})`);

    // Call AI API based on provider
    const provider = project.ai.provider || 'anthropic';
    let response;

    switch (provider) {
      case 'anthropic':
        response = await window.electronAPI.claudeAPI(apiParams);
        break;
      case 'openai':
        response = await window.electronAPI.openaiAPI(apiParams);
        break;
      case 'grok':
        response = await window.electronAPI.grokAPI(apiParams);
        break;
      case 'deepseek':
        response = await window.electronAPI.deepseekAPI(apiParams);
        break;
      case 'gemini':
        response = await window.electronAPI.geminiAPI(apiParams);
        break;
      case 'cursor':
        response = await window.electronAPI.cursorAPI(apiParams);
        break;
      default:
        console.warn(`[AI] Unknown provider: ${provider}, falling back to Anthropic`);
        response = await window.electronAPI.claudeAPI(apiParams);
    }

    // Track cost with CostOptimizer
    if (costOptimizerRef.current) {
      try {
        let outputText = '';
        if (typeof response === 'string') {
          outputText = response;
        } else if (response?.content) {
          outputText = response.content;
        } else if (response?.text) {
          outputText = response.text;
        } else if (response?.data) {
          outputText = response.data;
        }

        const trackingInfo = costOptimizerRef.current.trackRequest(
          project.ai.provider || 'anthropic',
          apiParams.model,
          fullPrompt,
          outputText
        );

        console.log(`[CostOptimizer] Request: $${trackingInfo.cost.toFixed(4)}, Total: $${trackingInfo.runningTotal.toFixed(2)}`);

        // Trigger re-render to update UI
        setProject({ ...project });
      } catch (err) {
        console.error('[CostOptimizer] Tracking failed:', err);
      }
    }

    return response;
  };

  // AI Cast Analysis
  const analyzeCast = async (characterTypes) => {
    const prompt = `You are a character psychologist analyzing a book's cast.

The author wants these character types:
${characterTypes.map((type, idx) => `${idx + 1}. ${type}`).join('\n')}

For each character type, suggest:
1. Archetypal family (e.g., "The Sage/Hermit", "The Innocent/Crusader")
2. 3-4 real-world examples (historical figures, authors, etc.)
3. Function in story
4. What they balance against (other characters)
5. Potential flaws

Also analyze:
- Cast dynamics (conflicts, triangles)
- Warnings (e.g., "too dark", "missing gender balance")

Return ONLY valid JSON (no markdown, no extra text):
{
  "suggestions": [
    {
      "type": "character type from input",
      "archetypeFamily": "The Sage/Hermit",
      "examples": ["Marcus Aurelius", "Epictetus", "Miyamoto Musashi"],
      "functionInStory": "Mentor who teaches through detachment",
      "balances": "Young idealist (emotion vs reason)",
      "flaws": "Emotional unavailability, rigidity"
    }
  ],
  "dynamics": {
    "conflicts": ["description of key conflicts"],
    "triangles": [
      {"name": "triangle name", "members": ["char1", "char2", "char3"], "dynamic": "description"}
    ]
  },
  "warnings": ["warning messages"]
}`;

    try {
      console.log('[AI] Analyzing cast...');
      const result = await callAIWithMode(prompt);

      if (result.success) {
        try {
          // Try to parse response
          let data = result.data;

          // Remove markdown code blocks if present
          data = data.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

          return JSON.parse(data);
        } catch (parseError) {
          console.error('[AI] Failed to parse JSON:', parseError);
          console.log('[AI] Raw response:', result.data);

          // Try to extract JSON from response
          const jsonMatch = result.data.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
          return null;
        }
      } else {
        console.error('[AI] API error:', result.error);
        alert('AI-virhe: ' + result.error);
        return null;
      }
    } catch (error) {
      console.error('[AI] Exception:', error);
      alert('AI-virhe: ' + error.message);
      return null;
    }
  };

  // AI Editor Analysis - Analyze chapter/scene content
  const analyzeChapterContent = async (chapterId) => {
    if (!window.electronAPI) {
      console.error('[AI Editor] Electron API not available');
      return null;
    }

    const chapter = project.structure.find(ch => ch.id === chapterId);
    if (!chapter || !chapter.content || chapter.content.trim().length < 50) {
      console.log('[AI Editor] Chapter too short to analyze');
      return null;
    }

    const prompt = `You are an expert writing analyst. Analyze this text comprehensively.

TEXT:
${chapter.content}

PROJECT CONTEXT:
- Characters: ${project.characters.map(c => c.name).join(', ')}
- Genre: ${project.genre}

Provide detailed analysis in JSON format:
{
  "synopsis": "Brief 2-3 sentence summary",
  "notesAI": {
    "characterMentions": ["character names found"],
    "locations": ["places mentioned"],
    "timeframe": "when this takes place",
    "mood": "overall emotional tone",
    "themes": ["themes present"],
    "continuityIssues": ["any contradictions or issues"]
  },
  "aiQuality": {
    "score": 7.5,
    "issues": [
      {"type": "pacing", "severity": "medium", "msg": "Middle section drags"},
      {"type": "dialogue", "severity": "low", "msg": "Some dialogue feels unnatural"}
    ],
    "strengths": ["What works well"],
    "suggestions": ["How to improve"],
    "readiness": "draft|needs-revision|ready-for-review|final"
  },
  "structureHints": {
    "shouldBeSplit": false,
    "suggestedSceneBreaks": [],
    "relatedChapters": [],
    "missingTransition": false
  },
  "pacing": {
    "speed": "slow|medium|fast",
    "tension": 7,
    "wordDensity": 15.5,
    "dialogueRatio": 0.35
  }
}

Return ONLY valid JSON.`;

    try {
      console.log('[AI Editor] Analyzing chapter:', chapterId);
      // Use Polish mode for analysis (precision over creativity)
      const result = await callAIWithMode(prompt, { temperature: 0.3 });

      if (result.success) {
        try {
          let data = result.data.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const analysis = JSON.parse(data);

          // Update chapter with AI analysis
          setProject(prev => ({
            ...prev,
            structure: prev.structure.map(ch =>
              ch.id === chapterId
                ? {
                    ...ch,
                    synopsisAI: analysis.synopsis,
                    synopsis: ch.synopsisManual || analysis.synopsis,
                    notesAI: analysis.notesAI,
                    aiQuality: {
                      ...analysis.aiQuality,
                      lastAnalyzed: new Date().toISOString()
                    },
                    structureHints: analysis.structureHints,
                    pacing: analysis.pacing
                  }
                : ch
            )
          }));

          setUnsavedChanges(true);
          console.log('[AI Editor] Analysis complete:', analysis);
          return analysis;
        } catch (parseError) {
          console.error('[AI Editor] Parse error:', parseError);
          const jsonMatch = result.data.match(/\{[\s\S]*\}/);
          if (jsonMatch) return JSON.parse(jsonMatch[0]);
          return null;
        }
      } else {
        console.error('[AI Editor] API error:', result.error);
        return null;
      }
    } catch (error) {
      console.error('[AI Editor] Exception:', error);
      return null;
    }
  };

  // AI Editor - Generate auto-synopsis for chapter
  const generateSynopsis = async (chapterId) => {
    const chapter = project.structure.find(ch => ch.id === chapterId);
    if (!chapter || !chapter.content || chapter.content.trim().length < 50) {
      return 'Tyhjä tai liian lyhyt';
    }

    if (!window.electronAPI) return null;

    const prompt = `Summarize this chapter in 2-3 sentences (in Finnish):

${chapter.content}

Return ONLY the summary, no extra text.`;

    try {
      const result = await callAIWithMode(prompt);
      if (result.success) {
        const synopsis = result.data.trim();

        setProject(prev => ({
          ...prev,
          structure: prev.structure.map(ch =>
            ch.id === chapterId
              ? {
                  ...ch,
                  synopsisAI: synopsis,
                  synopsis: ch.synopsisManual || synopsis
                }
              : ch
          )
        }));

        setUnsavedChanges(true);
        return synopsis;
      }
    } catch (error) {
      console.error('[AI Synopsis] Error:', error);
    }
    return null;
  };

  // AI Editor - Quick quality check (lighter than full analysis)
  const quickQualityCheck = async (chapterId) => {
    const chapter = project.structure.find(ch => ch.id === chapterId);
    if (!chapter || !chapter.content || chapter.content.trim().length < 50) {
      return { score: 0, issues: [], suggestions: [] };
    }

    if (!window.electronAPI) return null;

    const prompt = `Rate this text quality (1-10) and give 1-2 quick improvement suggestions:

${chapter.content.substring(0, 2000)}...

Return JSON: {"score": 7.5, "suggestions": ["suggestion1", "suggestion2"]}`;

    try {
      const result = await callAIWithMode(prompt);
      if (result.success) {
        let data = result.data.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const quality = JSON.parse(data);

        setProject(prev => ({
          ...prev,
          structure: prev.structure.map(ch =>
            ch.id === chapterId
              ? {
                  ...ch,
                  aiQuality: {
                    ...ch.aiQuality,
                    score: quality.score,
                    suggestions: quality.suggestions,
                    lastAnalyzed: new Date().toISOString()
                  }
                }
              : ch
          )
        }));

        setUnsavedChanges(true);
        return quality;
      }
    } catch (error) {
      console.error('[AI Quality] Error:', error);
    }
    return null;
  };

  // AI Generate Chapter
  const generateChapter = async (chapterId) => {
    if (!window.electronAPI) {
      console.error('[Generate] Electron API not available');
      return;
    }

    if (!batchProcessorRef.current) {
      console.error('[Generate] BatchProcessor not initialized');
      alert('AI-moduulit eivät ole valmiina. Odota hetki ja yritä uudelleen.');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress({ stage: 'preparing', message: 'Valmistellaan generointia...' });

    try {
      // Find chapter index
      const chapterIndex = project.structure.findIndex(ch => ch.id === chapterId);
      if (chapterIndex === -1) {
        throw new Error('Chapter not found');
      }

      const chapter = project.structure[chapterIndex];

      // Use BatchProcessor to generate chapter
      setGenerationProgress({ stage: 'generating', message: 'AI generoi lukua...' });

      const result = await batchProcessorRef.current.generateChapter(
        chapter.title,
        chapterIndex,
        project.ai.currentMode
      );

      if (result.success) {
        setGenerationProgress({ stage: 'updating', message: 'Päivitetään sisältöä...' });

        // Extract continuity data if available
        let continuityData = null;
        if (continuityTrackerRef.current && result.content) {
          setGenerationProgress({ stage: 'updating', message: 'Analysoidaan jatkuvuutta...' });
          await continuityTrackerRef.current.extractFromChapter(chapterIndex, result.content);
          continuityData = continuityTrackerRef.current.getContextForChapter(chapterIndex + 1);
        }

        // Update chapter content with version history
        setProject(prev => ({
          ...prev,
          structure: prev.structure.map(ch => {
            if (ch.id !== chapterId) return ch;

            // Create version object
            const newVersion = {
              id: `v${(ch.versions?.length || 0) + 1}`,
              content: result.content,
              timestamp: new Date().toISOString(),
              generatedFrom: {
                mode: project.ai.currentMode,
                model: result.model || project.ai.models[project.ai.provider],
                provider: project.ai.provider,
                prompt: result.prompt || 'Chapter generation',
                basedOn: ch.versions?.length > 0 ? ch.versions[ch.versions.length - 1].id : null
              },
              userRating: null,
              userFeedback: null,
              wordCount: result.wordCount,
              cost: result.cost || 0
            };

            return {
              ...ch,
              content: result.content,
              wordCount: result.wordCount,
              versions: [...(ch.versions || []), newVersion],
              currentVersion: newVersion.id,
              continuityData: continuityData,
              modified: new Date().toISOString()
            };
          }),
          targets: {
            ...prev.targets,
            currentTotal: prev.structure.reduce((sum, ch) =>
              sum + (ch.id === chapterId ? result.wordCount : ch.wordCount), 0
            )
          }
        }));

        setUnsavedChanges(true);

        // Show cost info if available
        const costMsg = result.cost
          ? `Generoitu ${result.wordCount} sanaa! Hinta: $${result.cost.toFixed(4)}`
          : `Generoitu ${result.wordCount} sanaa!`;

        setGenerationProgress({ stage: 'complete', message: costMsg });

        console.log('[Generate] Success:', result.wordCount, 'words', result.cost ? `$${result.cost}` : '');

        // Clear progress after 3 seconds
        setTimeout(() => {
          setGenerationProgress(null);
          setIsGenerating(false);
        }, 3000);

      } else {
        throw new Error(result.error || 'Generation failed');
      }

    } catch (error) {
      console.error('[Generate] Exception:', error);
      alert('Generointi epäonnistui: ' + error.message);
      setGenerationProgress(null);
      setIsGenerating(false);
    }
  };

  // AI Generate All Chapters (Batch)
  const generateAllChapters = async () => {
    if (!window.electronAPI) {
      console.error('[Batch Generate] Electron API not available');
      return;
    }

    if (!batchProcessorRef.current) {
      console.error('[Batch Generate] BatchProcessor not initialized');
      alert('AI-moduulit eivät ole valmiina. Odota hetki ja yritä uudelleen.');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress({ stage: 'preparing', message: 'Valmistellaan batch-generointia...' });

    try {
      // Set up progress callback
      batchProcessorRef.current.onProgress = (current, total, status, info) => {
        if (status === 'starting') {
          setGenerationProgress({
            stage: 'generating',
            message: `Generoidaan lukua ${current + 1}/${total}...`
          });
        } else if (status === 'completed') {
          const percentage = Math.round(((current + 1) / total) * 100);
          setGenerationProgress({
            stage: 'generating',
            message: `Valmis: ${current + 1}/${total} (${percentage}%) - ${info.wordCount} sanaa`
          });
        } else if (status === 'error') {
          setGenerationProgress({
            stage: 'error',
            message: `Virhe luvussa ${current + 1}: ${info.error}`
          });
        }
      };

      // Get chapter outlines
      const outlineChapters = project.structure.map(ch => ({
        title: ch.title,
        outline: ch.synopsis || ch.title
      }));

      // Process all chapters
      const results = await batchProcessorRef.current.processChapters(
        outlineChapters,
        {
          mode: project.ai.currentMode,
          startFrom: 0,
          stopAt: project.structure.length
        }
      );

      if (results.success) {
        setGenerationProgress({ stage: 'updating', message: 'Päivitetään sisältöä...' });

        // Extract continuity data for all chapters
        if (continuityTrackerRef.current) {
          setGenerationProgress({ stage: 'updating', message: 'Analysoidaan jatkuvuutta...' });
          for (let idx = 0; idx < results.results.length; idx++) {
            const result = results.results[idx];
            if (result?.content) {
              await continuityTrackerRef.current.extractFromChapter(idx, result.content);
            }
          }
        }

        // Update all chapters with version history
        setProject(prev => ({
          ...prev,
          structure: prev.structure.map((ch, idx) => {
            const result = results.results[idx];
            if (!result) return ch;

            // Create version object
            const newVersion = {
              id: `v${(ch.versions?.length || 0) + 1}`,
              content: result.content,
              timestamp: new Date().toISOString(),
              generatedFrom: {
                mode: project.ai.currentMode,
                model: result.model || project.ai.models[project.ai.provider],
                provider: project.ai.provider,
                prompt: result.prompt || `Batch generation - Chapter ${idx + 1}`,
                basedOn: ch.versions?.length > 0 ? ch.versions[ch.versions.length - 1].id : null,
                batchGeneration: true
              },
              userRating: null,
              userFeedback: null,
              wordCount: result.wordCount,
              cost: result.cost || 0
            };

            // Get continuity data if available
            const continuityData = continuityTrackerRef.current
              ? continuityTrackerRef.current.getContextForChapter(idx + 1)
              : null;

            return {
              ...ch,
              content: result.content,
              wordCount: result.wordCount,
              versions: [...(ch.versions || []), newVersion],
              currentVersion: newVersion.id,
              continuityData: continuityData,
              modified: new Date().toISOString()
            };
          }),
          targets: {
            ...prev.targets,
            currentTotal: results.results.reduce((sum, result) =>
              sum + (result?.wordCount || 0), 0
            )
          }
        }));

        setUnsavedChanges(true);

        // Show summary
        const totalWords = results.results.reduce((sum, r) => sum + (r?.wordCount || 0), 0);
        const totalCost = results.totalCost || 0;
        const successCount = results.completedChapters || results.results.length;

        setGenerationProgress({
          stage: 'complete',
          message: `Valmis! ${successCount}/${project.structure.length} lukua generoitu. ${totalWords} sanaa. Hinta: $${totalCost.toFixed(4)}`
        });

        console.log('[Batch Generate] Success:', successCount, 'chapters', totalWords, 'words', `$${totalCost.toFixed(4)}`);

        // Clear progress after 5 seconds
        setTimeout(() => {
          setGenerationProgress(null);
          setIsGenerating(false);
        }, 5000);

      } else {
        throw new Error(results.error || 'Batch generation failed');
      }

    } catch (error) {
      console.error('[Batch Generate] Exception:', error);
      alert('Batch-generointi epäonnistui: ' + error.message);
      setGenerationProgress(null);
      setIsGenerating(false);
    }
  };

  // Regenerate Chapter with Feedback (Iterative Refinement)
  const regenerateChapter = async () => {
    if (!refinementManagerRef.current) {
      alert('RefinementManager ei ole valmis. Odota hetki ja yritä uudelleen.');
      return;
    }

    if (!regenerateFeedback.trim()) {
      alert('Anna palaute ennen regenerointia.');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress({ stage: 'preparing', message: 'Valmistellaan regenerointia...' });

    try {
      const chapter = project.structure.find(ch => ch.id === activeChapterId);
      if (!chapter) {
        throw new Error('Chapter not found');
      }

      setGenerationProgress({ stage: 'generating', message: 'AI generoi parannettua versiota...' });

      const result = await refinementManagerRef.current.regenerateChapter(
        chapter,
        regenerateFeedback,
        regenerateMode
      );

      if (result.success) {
        // Extract continuity data
        if (continuityTrackerRef.current && result.content) {
          const chapterIndex = project.structure.findIndex(ch => ch.id === activeChapterId);
          if (chapterIndex !== -1) {
            await continuityTrackerRef.current.extractFromChapter(chapterIndex, result.content);
          }
        }

        // Update chapter with new version
        setProject(prev => ({
          ...prev,
          structure: prev.structure.map(ch => {
            if (ch.id !== activeChapterId) return ch;

            return {
              ...ch,
              content: result.content,
              wordCount: result.wordCount,
              versions: [...(ch.versions || []), result.version],
              currentVersion: result.version.id,
              modified: new Date().toISOString()
            };
          })
        }));

        setUnsavedChanges(true);
        setGenerationProgress({ stage: 'complete', message: `Uusi versio ${result.version.id} generoitu!` });
        setShowRegenerateDialog(false);
        setRegenerateFeedback('');

        setTimeout(() => {
          setGenerationProgress(null);
          setIsGenerating(false);
        }, 2000);
      } else {
        throw new Error(result.error || 'Regeneration failed');
      }
    } catch (error) {
      console.error('[Regenerate] Exception:', error);
      alert('Regenerointi epäonnistui: ' + error.message);
      setGenerationProgress(null);
      setIsGenerating(false);
    }
  };

  // Restore Previous Version
  const restoreVersion = (versionId) => {
    if (!refinementManagerRef.current) {
      alert('RefinementManager ei ole valmis.');
      return;
    }

    try {
      // RefinementManager handles updating project state via setProject
      refinementManagerRef.current.restoreVersion(activeChapterId, versionId);
      setUnsavedChanges(true);
    } catch (error) {
      console.error('[Restore] Error:', error);
      alert('Version palautus epäonnistui: ' + error.message);
    }
  };

  // Rate Version
  const rateVersion = (versionId, rating, feedback = null) => {
    if (!refinementManagerRef.current) {
      return;
    }

    try {
      // RefinementManager handles updating project state via setProject
      refinementManagerRef.current.rateVersion(activeChapterId, versionId, rating, feedback);
      setUnsavedChanges(true);
    } catch (error) {
      console.error('[Rate] Error:', error);
      alert('Arvostelu epäonnistui: ' + error.message);
    }
  };

  // Run Consistency Check
  const runConsistencyCheck = async () => {
    if (!consistencyCheckerRef.current) {
      alert('ConsistencyChecker ei ole valmis.');
      return;
    }

    setCheckingConsistency(true);

    try {
      const result = await consistencyCheckerRef.current.runFullCheck();

      if (result.success) {
        setConsistencyErrors(result.errors);
        console.log('[Consistency] Found', result.errors.length, 'issues');

        if (result.errors.length === 0) {
          alert('✅ Ei ristiriitoja havaittu!');
        }
      } else {
        throw new Error(result.error || 'Consistency check failed');
      }
    } catch (error) {
      console.error('[Consistency] Error:', error);
      alert('Johdonmukaisuustarkistus epäonnistui: ' + error.message);
    } finally {
      setCheckingConsistency(false);
    }
  };

  // Detect Plot Threads
  const detectPlotThreads = async () => {
    if (!plotThreadTrackerRef.current) {
      alert('PlotThreadTracker ei ole valmis.');
      return;
    }

    setDetectingThreads(true);

    try {
      const result = await plotThreadTrackerRef.current.detectThreads(window.electronAPI);

      if (result.success) {
        // Update project with detected threads
        setProject(prev => ({
          ...prev,
          plotThreads: result.threads
        }));

        setPlotThreads(result.threads);
        setUnsavedChanges(true);

        console.log('[Plot Threads] Detected:', result.threads.length, 'threads');
      } else {
        throw new Error(result.error || 'Thread detection failed');
      }
    } catch (error) {
      console.error('[Plot Threads] Error:', error);
      alert('Juonilankahavainnointivir epäonnistui: ' + error.message);
    } finally {
      setDetectingThreads(false);
    }
  };

  // Character Builder Phase 2 - Generate clarifying questions
  const generateCharacterQuestions = async (characterType, realPeople, archetypeInfo) => {
    if (!window.electronAPI) {
      console.error('[Character Builder] Electron API not available');
      return null;
    }

    const prompt = `You are a character psychologist helping an author create a detailed fictional character.

CHARACTER TYPE: ${characterType}
ARCHETYPE: ${archetypeInfo.archetypeFamily}
REAL PEOPLE INSPIRATION: ${realPeople}

Based on the cast analysis, this character:
- Function: ${archetypeInfo.functionInStory}
- Examples: ${archetypeInfo.examples.join(', ')}
- Potential flaws: ${archetypeInfo.flaws}

Generate 5-7 clarifying questions to help define this character's unique traits.
Questions should explore:
1. Core motivation (what drives them?)
2. Shadow aspects (hidden darkness, Jung's shadow)
3. Relationships (how do they relate to others?)
4. Voice & mannerisms (how do they speak/act?)
5. Transformation arc (how might they change?)

Return ONLY valid JSON:
{
  "questions": [
    {
      "id": 1,
      "category": "motivation",
      "question": "What is this character's deepest fear?"
    },
    ...
  ]
}`;

    try {
      console.log('[Character Builder] Generating questions...');
      const result = await callAIWithMode(prompt);

      if (result.success) {
        try {
          let data = result.data.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          return JSON.parse(data);
        } catch (parseError) {
          console.error('[Character Builder] Parse error:', parseError);
          const jsonMatch = result.data.match(/\{[\s\S]*\}/);
          if (jsonMatch) return JSON.parse(jsonMatch[0]);
          return null;
        }
      } else {
        console.error('[Character Builder] API error:', result.error);
        alert('AI-virhe: ' + result.error);
        return null;
      }
    } catch (error) {
      console.error('[Character Builder] Exception:', error);
      alert('Hahmovirhe: ' + error.message);
      return null;
    }
  };

  // Character Builder Phase 2 - Generate full profile
  const generateCharacterProfile = async (characterType, realPeople, archetypeInfo, answers) => {
    console.log('[Character Builder] Generating profile with 4-layer model...');

    try {
      // Create CharacterGenerator instance with current provider
      const generator = new window.CharacterGenerator(
        project.ai?.provider || 'anthropic',
        project.ai?.model || null
      );
      generator.setStoryContext(project.genre || 'fiction', project.title || '');

      // Generate character using the new 4-layer system
      const result = await generator.generateCharacter({
        name: '',
        role: 'supporting', // Will be inferred from archetype
        characterType: characterType,
        realPeople: realPeople,
        answers: answers,
        archetypeInfo: archetypeInfo
      });

      if (result.success) {
        // Add additional metadata
        result.character.characterType = characterType;
        result.character.realPeopleInspiration = realPeople;
        result.character.archetype = archetypeInfo;
        result.character.created = new Date().toISOString();

        console.log('[Character Builder] Profile generated successfully with 4 layers:', result.character.name);
        return result.character;
      } else {
        console.error('[Character Builder] Generation failed:', result.error);
        alert('Profiilin generointi epäonnistui: ' + result.error);
        return null;
      }
    } catch (error) {
      console.error('[Character Builder] Exception:', error);
      alert('Profiilivirhe: ' + error.message);
      return null;
    }
  };

  // API Settings - Handler functions
  const updateApiKey = (provider, key) => {
    setProject(prev => ({
      ...prev,
      apiConfig: {
        ...prev.apiConfig,
        [provider]: {
          ...prev.apiConfig[provider],
          apiKey: key
        },
        isConfigured: key.trim().length > 0
      }
    }));
    setUnsavedChanges(true);
    setApiTestResult(null); // Clear previous test result
    console.log('[API] Updated key for:', provider);
  };

  const setActiveApiProvider = (provider) => {
    setProject(prev => ({
      ...prev,
      apiConfig: {
        ...prev.apiConfig,
        provider
      }
    }));
    setUnsavedChanges(true);
    console.log('[API] Active provider changed to:', provider);
  };

  const testApiConnection = async () => {
    const provider = project.apiConfig.provider;
    const config = project.apiConfig[provider];

    if (!config.apiKey || config.apiKey.trim().length === 0) {
      setApiTestResult({
        success: false,
        message: 'API-avain puuttuu. Syötä avain ensin.'
      });
      return;
    }

    setApiTestResult({ success: null, message: 'Testataan yhteyttä...' });

    try {
      // Test with a simple prompt
      const testPrompt = 'Respond with exactly: "API connection successful"';

      if (!window.electronAPI) {
        setApiTestResult({
          success: false,
          message: 'Electron API ei saatavilla'
        });
        return;
      }

      const result = await callAIWithMode(testPrompt);

      if (result.success) {
        setProject(prev => ({
          ...prev,
          apiConfig: {
            ...prev.apiConfig,
            lastTested: new Date().toISOString(),
            isConfigured: true
          }
        }));

        setApiTestResult({
          success: true,
          message: `✓ Yhteys toimii! Model: ${config.model}`
        });
      } else {
        setApiTestResult({
          success: false,
          message: `Virhe: ${result.error || 'Tuntematon virhe'}`
        });
      }
    } catch (error) {
      setApiTestResult({
        success: false,
        message: `Yhteysvirhe: ${error.message}`
      });
    }
  };

  // Character Builder - Handler functions
  const startCharacterBuilder = (characterType) => {
    const typeIndex = project.castPlan.characterTypes.indexOf(characterType);
    const archetypeInfo = project.castPlan.suggestedArchetypes[typeIndex];

    setSelectedCharacterType({ type: characterType, archetype: archetypeInfo });
    setCharacterBuilderStep(2);
    setShowCharacterBuilder(true);
    console.log('[Character Builder] Started for:', characterType);
  };

  const handleCharacterPeopleSubmit = async () => {
    if (!characterRealPeople.trim()) {
      alert('Syötä vähintään yksi henkilö (esim. "Ernst Jünger + C.G. Jung")');
      return;
    }

    // Move to step 3 (AI generates questions)
    setCharacterBuilderStep(3);

    const questions = await generateCharacterQuestions(
      selectedCharacterType.type,
      characterRealPeople,
      selectedCharacterType.archetype
    );

    if (questions && questions.questions) {
      setCharacterQuestions(questions.questions);
      setCharacterBuilderStep(4); // Move to questions step
    } else {
      alert('Kysymysten generointi epäonnistui');
      setCharacterBuilderStep(2);
    }
  };

  const handleCharacterAnswersSubmit = async () => {
    // Check if all questions are answered
    const unanswered = characterQuestions.filter(q => !characterAnswers[q.id] || !characterAnswers[q.id].trim());

    if (unanswered.length > 0) {
      const confirmed = confirm(
        `${unanswered.length} kysymystä vastausta. Jatketaanko silti?\n\n` +
        `Paremmat vastaukset = parempi hahmo.`
      );
      if (!confirmed) return;
    }

    // Move to step 5 (AI generates profile)
    setCharacterBuilderStep(5);

    const profile = await generateCharacterProfile(
      selectedCharacterType.type,
      characterRealPeople,
      selectedCharacterType.archetype,
      characterAnswers
    );

    if (profile) {
      setCharacterProfile(profile);
      setCharacterBuilderStep(6); // Move to review step
    } else {
      alert('Profiilin generointi epäonnistui');
      setCharacterBuilderStep(4);
    }
  };

  const saveCharacterProfile = () => {
    if (!characterProfile) return;

    setProject(prev => ({
      ...prev,
      characters: [...prev.characters, characterProfile]
    }));

    // Reset builder
    setShowCharacterBuilder(false);
    setCharacterBuilderStep(1);
    setSelectedCharacterType(null);
    setCharacterRealPeople('');
    setCharacterQuestions([]);
    setCharacterAnswers({});
    setCharacterProfile(null);
    setUnsavedChanges(true);

    console.log('[Character Builder] Profile saved:', characterProfile.name);
  };

  const cancelCharacterBuilder = () => {
    const confirmed = confirm('Haluatko varmasti peruuttaa? Kaikki syötetyt tiedot katoavat.');
    if (!confirmed) return;

    setShowCharacterBuilder(false);
    setCharacterBuilderStep(1);
    setSelectedCharacterType(null);
    setCharacterRealPeople('');
    setCharacterQuestions([]);
    setCharacterAnswers({});
    setCharacterProfile(null);
  };

  // Voice Edit Selected Text
  const editByVoice = async (selectedText, voiceInstruction) => {
    if (!window.electronAPI) {
      console.error('[Voice] Electron API not available');
      return null;
    }

    const currentMode = getCurrentMode();

    const prompt = `ORIGINAL TEXT:
${selectedText}

USER INSTRUCTION (spoken):
"${voiceInstruction}"

TASK:
Rewrite the text following the instruction.
Preserve the general meaning but apply the requested change.
${currentMode.systemPrompt}

Return ONLY the rewritten text, no explanations or extra commentary.`;

    try {
      console.log('[Voice] Sending to AI...');
      setVoiceState('processing');

      const result = await callAIWithMode(prompt);

      if (result.success) {
        console.log('[Voice] AI response received');
        setVoiceState('idle');
        return {
          original: selectedText,
          revised: result.data.trim(),
          instruction: voiceInstruction
        };
      } else {
        console.error('[Voice] AI error:', result.error);
        alert('AI-virhe: ' + result.error);
        setVoiceState('error');
        return null;
      }
    } catch (error) {
      console.error('[Voice] Exception:', error);
      alert('Äänivirhe: ' + error.message);
      setVoiceState('error');
      return null;
    }
  };

  // Handle voice command for selected text
  const handleVoiceEdit = async () => {
    if (!textSelection || !textSelection.text.trim()) {
      alert('Ei valittua tekstiä. Valitse ensin teksti jota haluat muuttaa.');
      return;
    }

    if (!voiceInputRef.current) {
      alert('Äänisyöte ei ole käytettävissä tässä selaimessa.');
      return;
    }

    try {
      setVoiceState('listening');
      console.log('[Voice] Listening for instruction...');

      const result = await voiceInputRef.current.listen();

      if (result && result.transcript) {
        console.log('[Voice] Heard:', result.transcript);

        if (result.confidence < 0.5) {
          const confirmed = confirm(
            `Kuulin: "${result.transcript}"\n\n` +
            `Luotettavuus alhainen (${Math.round(result.confidence * 100)}%). Jatketaanko?`
          );
          if (!confirmed) {
            setVoiceState('idle');
            return;
          }
        }

        // Send to AI
        const diffResult = await editByVoice(textSelection.text, result.transcript);

        if (diffResult) {
          setVoiceDiffView(diffResult);
        }
      }
    } catch (error) {
      console.error('[Voice] Error:', error);
      alert(error.message);
      setVoiceState('error');
      setTimeout(() => setVoiceState('idle'), 2000);
    }
  };

  // Accept voice edit
  const acceptVoiceEdit = () => {
    if (!voiceDiffView) return;

    // Replace selected text with AI-generated text
    const content = activeChapter.content;
    const before = content.substring(0, textSelection.start);
    const after = content.substring(textSelection.end);
    const newContent = before + voiceDiffView.revised + after;

    updateChapterContent(newContent);

    // Clear diff view and selection
    setVoiceDiffView(null);
    setTextSelection(null);
    console.log('[Voice] Edit accepted');
  };

  // Reject voice edit
  const rejectVoiceEdit = () => {
    setVoiceDiffView(null);
    console.log('[Voice] Edit rejected');
  };

  // Continue Writing from current cursor position
  const handleContinueWriting = async () => {
    if (!activeChapter || !hybridFlowRef.current) {
      console.error('[HybridFlow] No active chapter or hybrid flow not initialized');
      return;
    }

    setContinuingWriting(true);
    setContinuePreview('');

    try {
      const result = await hybridFlowRef.current.continueFromText(
        activeChapterIndex,
        activeChapter.content,
        {
          paragraphs: continueParagraphs,
          mode: project.ai.currentMode
        }
      );

      if (result.success) {
        setContinuePreview(result.continuation);
        console.log('[HybridFlow] Generated continuation:', result.continuation.substring(0, 100) + '...');
      } else {
        alert('Jatkaminen epäonnistui');
      }
    } catch (error) {
      console.error('[HybridFlow] Error:', error);
      alert('Virhe jatkamisessa: ' + error.message);
    } finally {
      setContinuingWriting(false);
    }
  };

  // Accept continue writing suggestion
  const acceptContinuation = () => {
    if (!continuePreview || !activeChapter) return;

    const newContent = activeChapter.content + '\n\n' + continuePreview;
    updateChapterContent(newContent);

    setContinuePreview('');
    setShowContinueDialog(false);
    console.log('[HybridFlow] Continuation accepted');
  };

  // Reject continuation
  const rejectContinuation = () => {
    setContinuePreview('');
    setShowContinueDialog(false);
    setHybridInput('');
    console.log('[HybridFlow] Continuation rejected');
  };

  // Expand outline using HybridWritingFlow
  const handleExpandOutline = async () => {
    if (!activeChapter || !hybridFlowRef.current || !hybridInput.trim()) {
      console.error('[HybridFlow] Missing requirements for expand');
      return;
    }

    setContinuingWriting(true);
    setContinuePreview('');

    try {
      const result = await hybridFlowRef.current.expandOutline(
        activeChapterIndex,
        hybridInput,
        {
          targetWords: hybridTargetWords,
          style: hybridStyle,
          mode: project.ai.currentMode
        }
      );

      if (result.success) {
        setContinuePreview(result.content);
        console.log('[HybridFlow] Outline expanded:', result.wordCount, 'words');
      } else {
        alert('Laajentaminen epäonnistui');
      }
    } catch (error) {
      console.error('[HybridFlow] Expand error:', error);
      alert('Virhe: ' + error.message);
    } finally {
      setContinuingWriting(false);
    }
  };

  // Rewrite section using HybridWritingFlow
  const handleRewriteSection = async () => {
    if (!textSelection?.text || !hybridFlowRef.current || !hybridInput.trim()) {
      console.error('[HybridFlow] Missing requirements for rewrite');
      return;
    }

    setContinuingWriting(true);
    setContinuePreview('');

    try {
      const result = await hybridFlowRef.current.rewriteSection(
        textSelection.text,
        hybridInput,
        { mode: project.ai.currentMode }
      );

      if (result.success) {
        setContinuePreview(result.rewritten);
        console.log('[HybridFlow] Section rewritten');
      } else {
        alert('Uudelleenkirjoitus epäonnistui');
      }
    } catch (error) {
      console.error('[HybridFlow] Rewrite error:', error);
      alert('Virhe: ' + error.message);
    } finally {
      setContinuingWriting(false);
    }
  };

  // Generate scene using HybridWritingFlow
  const handleGenerateScene = async () => {
    if (!activeChapter || !hybridFlowRef.current || !hybridInput.trim()) {
      console.error('[HybridFlow] Missing requirements for scene');
      return;
    }

    setContinuingWriting(true);
    setContinuePreview('');

    try {
      const length = hybridTargetWords <= 600 ? 'short' : hybridTargetWords >= 1500 ? 'long' : 'medium';
      const result = await hybridFlowRef.current.generateScene(
        activeChapterIndex,
        hybridInput,
        {
          length,
          focus: hybridStyle === 'dialogue-heavy' ? 'dialogue' : 'balanced',
          mode: project.ai.currentMode
        }
      );

      if (result.success) {
        setContinuePreview(result.scene);
        console.log('[HybridFlow] Scene generated:', result.wordCount, 'words');
      } else {
        alert('Kohtauksen luonti epäonnistui');
      }
    } catch (error) {
      console.error('[HybridFlow] Scene error:', error);
      alert('Virhe: ' + error.message);
    } finally {
      setContinuingWriting(false);
    }
  };

  // Accept rewrite (replaces selected text)
  const acceptRewrite = () => {
    if (!continuePreview || !textSelection) return;

    const content = activeChapter.content;
    const before = content.substring(0, textSelection.start);
    const after = content.substring(textSelection.end);
    const newContent = before + continuePreview + after;

    updateChapterContent(newContent);
    setContinuePreview('');
    setShowContinueDialog(false);
    setTextSelection(null);
    setHybridInput('');
    console.log('[HybridFlow] Rewrite accepted');
  };

  // Accept scene/expansion (replaces or appends)
  const acceptExpansion = () => {
    if (!continuePreview || !activeChapter) return;

    // For expand/scene, replace entire chapter content
    updateChapterContent(continuePreview);
    setContinuePreview('');
    setShowContinueDialog(false);
    setHybridInput('');
    console.log('[HybridFlow] Expansion accepted');
  };

  // Track text selection in editor
  const handleTextSelection = () => {
    if (!editorRef.current) return;

    const textarea = editorRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      const selectedText = textarea.value.substring(start, end);
      setTextSelection({ text: selectedText, start, end });
      console.log('[Voice] Text selected:', selectedText.substring(0, 50) + '...');
    } else {
      setTextSelection(null);
    }
  };

  // Editor dimensions tracking for AnnotationMargin
  const [editorDimensions, setEditorDimensions] = useState({
    scrollTop: 0,
    clientHeight: 0,
    scrollHeight: 0
  });

  // Track editor scroll and dimensions
  useEffect(() => {
    const updateEditorDimensions = () => {
      if (editorRef.current) {
        setEditorDimensions({
          scrollTop: editorRef.current.scrollTop,
          clientHeight: editorRef.current.clientHeight,
          scrollHeight: editorRef.current.scrollHeight
        });
      }
    };

    // Initial measurement
    updateEditorDimensions();

    // Add scroll listener
    if (editorRef.current) {
      editorRef.current.addEventListener('scroll', updateEditorDimensions);
    }

    // Update on window resize
    window.addEventListener('resize', updateEditorDimensions);

    return () => {
      if (editorRef.current) {
        editorRef.current.removeEventListener('scroll', updateEditorDimensions);
      }
      window.removeEventListener('resize', updateEditorDimensions);
    };
  }, [activeChapterId]); // Re-attach listeners when chapter changes

  // Annotation handlers
  const handleAnnotationClick = (annotation) => {
    console.log('[Annotation] Clicked:', annotation);
    // TODO: Show annotation details in a tooltip or modal
  };

  const handleCreateAnnotation = (position, length, content) => {
    if (!activeChapter) return;

    const newAnnotation = window.AnnotationUtils.createAnnotation({
      type: window.AnnotationUtils.ANNOTATION_TYPES.USER_NOTE,
      position,
      length,
      content,
      priority: window.AnnotationUtils.ANNOTATION_PRIORITY.INFO
    });

    setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === activeChapterId
          ? { ...ch, annotations: [...(ch.annotations || []), newAnnotation] }
          : ch
      )
    }));

    setUnsavedChanges(true);
    console.log('[Annotation] Created:', newAnnotation);
  };

  const handleUpdateAnnotation = (annotationId, updates) => {
    if (!activeChapter) return;

    setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === activeChapterId
          ? {
              ...ch,
              annotations: (ch.annotations || []).map(ann =>
                ann.id === annotationId
                  ? window.AnnotationUtils.updateAnnotation(ann, updates)
                  : ann
              )
            }
          : ch
      )
    }));

    setUnsavedChanges(true);
    console.log('[Annotation] Updated:', annotationId);
  };

  const handleDeleteAnnotation = (annotationId) => {
    if (!activeChapter) return;

    setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === activeChapterId
          ? {
              ...ch,
              annotations: (ch.annotations || []).filter(ann => ann.id !== annotationId)
            }
          : ch
      )
    }));

    setUnsavedChanges(true);
    console.log('[Annotation] Deleted:', annotationId);
  };

  // AI Chat - Send message (text or voice)
  const sendAiChatMessage = async (message, forceEdit = false) => {
    if (!message || !message.trim()) return;
    if (!window.electronAPI) {
      console.error('[AI Chat] Electron API not available');
      return;
    }

    const userMessage = message.trim();

    // Add user message to history
    setAiChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setAiChatInput('');

    // Check if user wants to edit text (keywords or forceEdit flag)
    const editKeywords = /muokkaa|kirjoita uudelleen|paranna|muuta|korjaa|rewrite|edit|improve/i;
    const wantsToEdit = forceEdit || editKeywords.test(userMessage);

    // If editing and has selected text, use edit mode
    if (wantsToEdit && (textSelection?.text || activeChapter?.content)) {
      await editTextFromChat(userMessage);
      return;
    }

    // Otherwise, respond as assistant
    const currentMode = getCurrentMode();
    const prompt = `You are FAUST AI, an intelligent writing assistant helping a Finnish author.

CONTEXT:
- Project: ${project.title}
- Current chapter: ${activeChapter.title}
- AI Mode: ${project.ai.currentMode} (${currentMode.useCase})
- Words written: ${project.targets.currentTotal} / ${project.targets.totalWords}

USER QUESTION:
${userMessage}

Respond helpfully and concisely. If the question is about the current chapter, you can reference it. Keep responses focused and actionable.`;

    try {
      console.log('[AI Chat] Sending message...');
      setAiChatVoiceState('processing');

      const result = await callAIWithMode(prompt);

      if (result.success) {
        console.log('[AI Chat] Response received');
        setAiChatHistory(prev => [...prev, { role: 'assistant', content: result.data.trim() }]);
        setAiChatVoiceState('idle');
      } else {
        console.error('[AI Chat] AI error:', result.error);
        setAiChatHistory(prev => [...prev, { role: 'error', content: 'Virhe: ' + result.error }]);
        setAiChatVoiceState('error');
      }
    } catch (error) {
      console.error('[AI Chat] Exception:', error);
      setAiChatHistory(prev => [...prev, { role: 'error', content: 'Virhe: ' + error.message }]);
      setAiChatVoiceState('error');
    }
  };

  // AI Chat - Edit text based on chat instruction
  const editTextFromChat = async (instruction) => {
    const targetText = textSelection?.text || activeChapter?.content;
    if (!targetText) {
      setAiChatHistory(prev => [...prev, { role: 'error', content: 'Ei tekstiä muokattavaksi. Valitse teksti tai varmista että luvussa on sisältöä.' }]);
      return;
    }

    if (!window.electronAPI) {
      console.error('[AI Chat Edit] Electron API not available');
      setAiChatHistory(prev => [...prev, { role: 'error', content: 'Electron API ei saatavilla' }]);
      return;
    }

    const currentMode = getCurrentMode();
    const prompt = `ORIGINAL TEXT:
${targetText}

USER INSTRUCTION:
"${instruction}"

TASK:
Rewrite the text following the instruction. Keep the story context and language consistent.
${currentMode.systemPrompt}

Return ONLY the rewritten text, no explanations.`;

    try {
      console.log('[AI Chat Edit] Processing...');
      setAiChatVoiceState('processing');

      const result = await callAIWithMode(prompt);

      if (result.success) {
        console.log('[AI Chat Edit] AI response received');
        const revised = result.data.trim();

        // Show diff view
        setVoiceDiffView({
          original: targetText,
          revised: revised,
          instruction: instruction
        });

        setAiChatHistory(prev => [...prev, {
          role: 'assistant',
          content: `✅ Muokattu ${textSelection?.text ? 'valittu teksti' : 'koko luku'}. Katso diff-näkymä editorissa.`
        }]);
        setAiChatVoiceState('idle');
      } else {
        console.error('[AI Chat Edit] AI error:', result.error);
        setAiChatHistory(prev => [...prev, { role: 'error', content: 'Virhe: ' + result.error }]);
        setAiChatVoiceState('error');
      }
    } catch (error) {
      console.error('[AI Chat Edit] Exception:', error);
      setAiChatHistory(prev => [...prev, { role: 'error', content: 'Virhe: ' + error.message }]);
      setAiChatVoiceState('error');
    }
  };

  // AI Chat - Voice input
  const handleAiChatVoice = async () => {
    if (!voiceInputRef.current) {
      alert('Äänisyöte ei ole käytettävissä tässä selaimessa.');
      return;
    }

    try {
      setAiChatVoiceState('listening');
      console.log('[AI Chat Voice] Listening...');

      const result = await voiceInputRef.current.listen();

      if (result && result.transcript) {
        console.log('[AI Chat Voice] Heard:', result.transcript);

        if (result.confidence < 0.5) {
          const confirmed = confirm(
            `Kuulin: "${result.transcript}"\n\n` +
            `Luotettavuus alhainen (${Math.round(result.confidence * 100)}%). Jatketaanko?`
          );
          if (!confirmed) {
            setAiChatVoiceState('idle');
            return;
          }
        }

        // Send voice message to AI
        await sendAiChatMessage(result.transcript);
      }
    } catch (error) {
      console.error('[AI Chat Voice] Error:', error);
      alert(error.message);
      setAiChatVoiceState('error');
      setTimeout(() => setAiChatVoiceState('idle'), 2000);
    }
  };

  // AI Assistant Panel - Send message with model selection
  const sendAiAssistantMessage = async () => {
    if (!aiChatInput.trim()) return;
    if (!window.electronAPI) {
      console.error('[AI Assistant] Electron API not available');
      return;
    }

    const userMessage = aiChatInput.trim();
    const selectedText = textSelection?.text || '';

    // Add user message to chat
    setAiChatMessages(prev => [...prev, { role: 'user', content: userMessage, selectedText }]);
    setAiChatInput('');
    setAiChatProcessing(true);

    // Build memory context from recent important decisions
    const memoryContext = chatMemory.entries
      .filter(e => e.type === 'decision' || e.type === 'direction')
      .slice(-5)
      .map(e => `- ${e.summary}`)
      .join('\n');

    // Build context-aware prompt
    const currentMode = getCurrentMode();
    const contextPrompt = selectedText
      ? `The user has selected this text:\n"""${selectedText}"""\n\nUser instruction: ${userMessage}\n\nPlease provide a revised version of the selected text based on the instruction.`
      : `User question: ${userMessage}\n\nRespond helpfully about their writing project.`;

    const fullPrompt = `You are FAUST AI Assistant (Liminal Engine), helping with creative writing.

PROJECT CONTEXT:
- Title: ${project.title}
- Current chapter: ${activeChapter.title}
- AI Mode: ${project.ai.currentMode} (${currentMode.useCase})
- Progress: ${project.targets.currentTotal} / ${project.targets.totalWords} words

${memoryContext ? `RECENT DECISIONS & DIRECTIONS:\n${memoryContext}\n` : ''}
${contextPrompt}`;

    try {
      // Get selected provider and model
      const provider = project.ai.provider || 'anthropic';
      const modelName = project.ai.models?.[provider] ||
        (provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' :
         provider === 'openai' ? 'gpt-4-turbo-preview' :
         provider === 'grok' ? 'grok-2-1212' : 'deepseek-chat');

      let result;
      // Call appropriate API based on provider
      if (provider === 'anthropic') {
        result = await window.electronAPI.claudeAPI({ prompt: fullPrompt, model: modelName });
      } else if (provider === 'openai') {
        result = await window.electronAPI.openaiAPI({ prompt: fullPrompt, model: modelName });
      } else if (provider === 'grok') {
        result = await window.electronAPI.grokAPI({ prompt: fullPrompt, model: modelName });
      } else if (provider === 'deepseek') {
        result = await window.electronAPI.deepseekAPI({ prompt: fullPrompt, model: modelName });
      }

      if (result?.success) {
        const responseText = result.data.trim();
        setAiChatMessages(prev => [...prev, { role: 'assistant', content: responseText }]);

        // Save to chat memory if it's about decisions or directions
        const isImportant = userMessage.toLowerCase().match(
          /decide|plan|direction|character|plot|theme|structure|approach|strategy|goal|want to|should|going to/
        );

        if (isImportant && window.electronAPI.saveChatMemory) {
          await window.electronAPI.saveChatMemory({
            type: 'decision',
            summary: userMessage.length > 100 ? userMessage.substring(0, 97) + '...' : userMessage,
            userMessage,
            aiResponse: responseText.substring(0, 200),
            project: project.title,
            chapter: activeChapter.title
          });
          console.log('[Chat Memory] Saved important message');
        }

        // If there was selected text, show as suggestion
        if (selectedText) {
          setAiSuggestion({
            original: selectedText,
            revised: responseText,
            applied: false
          });
        }
      } else {
        setAiChatMessages(prev => [...prev, { role: 'error', content: 'Virhe: ' + (result?.error || 'Unknown error') }]);
      }
    } catch (error) {
      console.error('[AI Assistant] Error:', error);
      setAiChatMessages(prev => [...prev, { role: 'error', content: 'Virhe: ' + error.message }]);
    } finally {
      setAiChatProcessing(false);
    }
  };

  // AI Assistant - Voice input
  const handleAiAssistantVoice = async () => {
    if (!voiceInputRef.current) {
      alert('Äänisyöte ei ole käytettävissä tässä selaimessa.');
      return;
    }

    try {
      setAiChatVoiceState('listening');
      console.log('[AI Assistant Voice] Listening...');

      const result = await voiceInputRef.current.listen();

      if (result && result.transcript) {
        console.log('[AI Assistant Voice] Heard:', result.transcript);

        if (result.confidence < 0.5) {
          const confirmed = confirm(
            `Kuulin: "${result.transcript}"\n\n` +
            `Luotettavuus alhainen (${Math.round(result.confidence * 100)}%). Jatketaanko?`
          );
          if (!confirmed) {
            setAiChatVoiceState('idle');
            return;
          }
        }

        // Set the transcript as input and send
        setAiChatInput(result.transcript);
        setAiChatVoiceState('idle');
      } else {
        setAiChatVoiceState('idle');
      }
    } catch (error) {
      console.error('[AI Assistant Voice] Error:', error);
      alert(error.message);
      setAiChatVoiceState('error');
      setTimeout(() => setAiChatVoiceState('idle'), 2000);
    }
  };

  // AI Assistant - Apply suggestion
  const applyAiSuggestion = () => {
    if (!aiSuggestion || !textSelection) return;

    const textarea = document.getElementById('chapter-content-editor');
    if (!textarea) return;

    const content = activeChapter.content;
    const newContent = content.substring(0, textSelection.start) +
                       aiSuggestion.revised +
                       content.substring(textSelection.end);

    setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === activeChapter.id ? { ...ch, content: newContent } : ch
      )
    }));

    setAiSuggestion({ ...aiSuggestion, applied: true });
    setTextSelection(null);
    setUnsavedChanges(true);
  };

  // Load chat memory on mount
  useEffect(() => {
    const loadMemory = async () => {
      if (window.electronAPI?.loadChatMemory) {
        const result = await window.electronAPI.loadChatMemory();
        if (result.success) {
          setChatMemory(result.data);
          console.log('[Chat Memory] Loaded', result.data.entries?.length || 0, 'entries');
        }
      }
    };
    loadMemory();
  }, []);

  // Initialize voice input on mount
  useEffect(() => {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      // Dynamically load VoiceInput class
      const script = document.createElement('script');
      script.src = './src/utils/voiceInput.js';
      script.onerror = (err) => {
        console.error('[Voice] Failed to load voiceInput.js:', err);
      };
      script.onload = () => {
        try {
          // VoiceInput is now globally available
          if (window.VoiceInput) {
            const voiceInput = new window.VoiceInput('fi-FI');
            voiceInput.onStateChange = (state) => {
              console.log('[Voice] State change:', state);
              if (state === 'listening') setVoiceState('listening');
              else if (state === 'idle') setVoiceState('idle');
            };
            voiceInputRef.current = voiceInput;
            setVoiceInputAvailable(true);
            console.log('[Voice] Voice input initialized');

            const browserWarning = window.VoiceInput.getBrowserRecommendation();
            if (browserWarning) {
              console.warn('[Voice]', browserWarning);
            }
          }
        } catch (error) {
          console.error('[Voice] Failed to initialize:', error);
        }
      };
      document.head.appendChild(script);
    } else {
      console.warn('[Voice] Web Speech API not supported');
    }
  }, []);

  // Initialize AI modules on mount
  useEffect(() => {
    const loadAIModules = async () => {
      try {
        // Load all AI module scripts
        const modules = [
          { name: 'CommandManager', src: './src/utils/CommandManager.js' },
          { name: 'BatchProcessor', src: './src/services/ai/BatchProcessor.js' },
          { name: 'CostOptimizer', src: './src/services/ai/CostOptimizer.js' },
          { name: 'StoryContinuityTracker', src: './src/services/ai/StoryContinuityTracker.js' },
          { name: 'HybridWritingFlow', src: './src/services/ai/HybridWritingFlow.js' },
          { name: 'RefinementManager', src: './src/services/ai/RefinementManager.js' },
          { name: 'PlotThreadTracker', src: './src/services/story/PlotThreadTracker.js' },
          { name: 'ConsistencyChecker', src: './src/services/validation/ConsistencyChecker.js' }
        ];

        const loadScript = (src) => {
          return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            // Don't use type='module' - we want regular scripts that expose globals
            script.onload = () => resolve();
            script.onerror = (err) => reject(err);
            document.head.appendChild(script);
          });
        };

        // Load all scripts
        for (const module of modules) {
          try {
            await loadScript(module.src);
            console.log(`[AI] Loaded ${module.name}`);
          } catch (err) {
            console.error(`[AI] Failed to load ${module.name}:`, err);
          }
        }

        // Wait a bit for modules to be available globally
        setTimeout(() => {
          try {
            // Initialize CommandManager FIRST (used by other systems)
            if (window.CommandManager) {
              commandManagerRef.current = new window.CommandManager();
              console.log('[CommandManager] Initialized');
            }

            // Initialize modules
            if (window.CostOptimizer) {
              costOptimizerRef.current = new window.CostOptimizer(project);
              console.log('[AI] CostOptimizer initialized');
            }

            if (window.StoryContinuityTracker) {
              continuityTrackerRef.current = new window.StoryContinuityTracker(project);
              console.log('[AI] StoryContinuityTracker initialized');
            }

            if (window.HybridWritingFlow) {
              hybridFlowRef.current = new window.HybridWritingFlow(
                window.electronAPI,
                project,
                continuityTrackerRef.current
              );
              console.log('[AI] HybridWritingFlow initialized');
            }

            if (window.BatchProcessor) {
              batchProcessorRef.current = new window.BatchProcessor(
                window.electronAPI,
                project,
                costOptimizerRef.current,
                continuityTrackerRef.current,
                callAIWithMode // Pass AI mode-aware function
              );
              console.log('[AI] BatchProcessor initialized with AI Writing Modes');
            }

            // Initialize RefinementManager from dynamically loaded module
            refinementManagerRef.current = new window.RefinementManager(
              project,
              setProject,
              callAIWithMode
            );
            console.log('[AI] RefinementManager initialized');

            if (window.PlotThreadTracker) {
              plotThreadTrackerRef.current = new window.PlotThreadTracker(project);
              console.log('[AI] PlotThreadTracker initialized');
            }

            if (window.ConsistencyChecker) {
              consistencyCheckerRef.current = new window.ConsistencyChecker(
                project,
                window.electronAPI,
                callAIWithMode  // Pass AI mode-aware function
              );
              console.log('[AI] ConsistencyChecker initialized with AI Writing Modes');
            }

            console.log('[AI] All AI modules initialized successfully');
          } catch (error) {
            console.error('[AI] Failed to initialize modules:', error);
          }
        }, 100);
      } catch (error) {
        console.error('[AI] Error loading AI modules:', error);
      }
    };

    loadAIModules();
  }, []); // Load only once on mount, not on every project change

  // Update project references in AI modules when project changes
  useEffect(() => {
    if (costOptimizerRef.current) {
      costOptimizerRef.current.project = project;
    }
    if (continuityTrackerRef.current) {
      continuityTrackerRef.current.project = project;
    }
    if (hybridFlowRef.current) {
      hybridFlowRef.current.project = project;
    }
    if (batchProcessorRef.current) {
      batchProcessorRef.current.project = project;
    }
    if (refinementManagerRef.current) {
      refinementManagerRef.current.project = project;
    }
    if (plotThreadTrackerRef.current) {
      plotThreadTrackerRef.current.project = project;
    }
    if (consistencyCheckerRef.current) {
      consistencyCheckerRef.current.project = project;
      consistencyCheckerRef.current.electronAPI = window.electronAPI;
      consistencyCheckerRef.current.callAIWithMode = callAIWithMode;
    }
  }, [project]);

  // Online/Offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      console.log('[Network] Back online');
      // If there were unsaved changes while offline, try to save now
      if (unsavedChanges && autosaveRetryCount > 0) {
        setAutosaveRetryCount(0);
        console.log('[Autosave] Retrying save after coming back online');
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
      console.log('[Network] Offline detected');
      setAutosaveError('Offline - tallennus odotetaan yhteyttä');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOffline(!navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [unsavedChanges, autosaveRetryCount]);

  // Enhanced autosave with retry logic and offline detection
  useEffect(() => {
    if (!unsavedChanges || !currentFilePath || !window.electronAPI) {
      return;
    }

    // Clear existing timer
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    // Function to attempt save with retry
    const attemptSave = async (retryCount = 0) => {
      // Check if offline
      if (!navigator.onLine || isOffline) {
        console.log('[Autosave] Skipping - offline');
        setAutosaveError('Offline - tallennus odotetaan yhteyttä');
        setSavingState('error');
        return;
      }

      try {
        setSavingState('saving');
        setAutosaveError(null);

        const result = await window.electronAPI.autosaveProject({
          projectData: project,
          filePath: currentFilePath
        });

        if (result.success) {
          setUnsavedChanges(false);
          setSavingState('saved');
          setAutosaveRetryCount(0);
          setAutosaveError(null);
          console.log('[Autosave] Project autosaved');

          // Clear 'saved' state after 2 seconds
          setTimeout(() => {
            setSavingState('idle');
          }, 2000);
        } else {
          throw new Error(result.error || 'Autosave failed');
        }
      } catch (error) {
        console.error('[Autosave] Error (attempt ' + (retryCount + 1) + '):', error);

        // Retry logic with exponential backoff
        const maxRetries = 3;
        if (retryCount < maxRetries) {
          const backoffDelay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
          console.log(`[Autosave] Retrying in ${backoffDelay}ms...`);

          setAutosaveRetryCount(retryCount + 1);
          setAutosaveError(`Tallennus epäonnistui - yritetään uudelleen (${retryCount + 1}/${maxRetries})`);

          setTimeout(() => {
            attemptSave(retryCount + 1);
          }, backoffDelay);
        } else {
          // Max retries reached
          console.error('[Autosave] Max retries reached');
          setAutosaveError('Automaattitallennus epäonnistui - tallenna manuaalisesti');
          setSavingState('error');
          setAutosaveRetryCount(0);

          // Keep error visible longer
          setTimeout(() => {
            setSavingState('idle');
          }, 5000);
        }
      }
    };

    // Set autosave timer (30 seconds)
    autosaveTimerRef.current = setTimeout(() => {
      attemptSave(0);
    }, 30000);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [unsavedChanges, currentFilePath, project, isOffline]);

  // Auto-backup (every 5 minutes)
  useEffect(() => {
    if (!currentFilePath || !window.electronAPI) {
      return;
    }

    // Clear existing timer
    if (backupTimerRef.current) {
      clearInterval(backupTimerRef.current);
    }

    // Set new timer (5 minutes = 300000ms)
    backupTimerRef.current = setInterval(async () => {
      try {
        const result = await window.electronAPI.saveBackup({
          projectData: project,
          filePath: currentFilePath
        });

        if (result.success) {
          console.log('[Auto-backup] Backup created:', result.backupPath);
        }
      } catch (error) {
        console.error('[Auto-backup] Error:', error);
      }
    }, 300000);

    return () => {
      if (backupTimerRef.current) {
        clearInterval(backupTimerRef.current);
      }
    };
  }, [currentFilePath, project]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd+S = Save
      if (e.metaKey && e.key === 's') {
        e.preventDefault();
        saveProject();
      }
      // Cmd+O = Open
      if (e.metaKey && e.key === 'o') {
        e.preventDefault();
        loadProject();
      }
      // Cmd+N = New Project
      if (e.metaKey && e.key === 'n') {
        e.preventDefault();
        newProject();
      }
      // Cmd+I = Toggle Inspector
      if (e.metaKey && e.key === 'i') {
        e.preventDefault();
        setShowInspector(prev => !prev);
      }
      // Cmd+Shift+D = Toggle Theme
      if (e.metaKey && e.shiftKey && e.key === 'd') {
        e.preventDefault();
        setIsDarkMode(prev => !prev);
      }
      // Cmd+K = Toggle AI Assistant
      if (e.metaKey && e.key === 'k') {
        e.preventDefault();
        setAiAssistantOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project, unsavedChanges, currentFilePath, aiAssistantOpen]);

  return e('div', { className: 'faust-app' },
    // Header
    e('div', { className: 'faust-header' },
      e('div', { style: { padding: '16px', paddingLeft: '80px', color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          // FAUST with 8-pointed star
          e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            e('span', { style: { fontFamily: 'EB Garamond', fontSize: '18px', fontWeight: 600 } }, 'FAUST'),
            // 8-pointed chaos star - adapts to NOX/DEIS theme
            e('svg', {
              xmlns: 'http://www.w3.org/2000/svg',
              width: '18',
              height: '18',
              viewBox: '0 0 100 100',
              style: { opacity: 0.75, color: 'var(--ink)', display: 'block' }
            },
              e('path', {
                d: 'M 50,2 L 58,31 L 84,16 L 69,42 L 98,50 L 69,58 L 84,84 L 58,69 L 50,98 L 42,69 L 16,84 L 31,58 L 2,50 L 31,42 L 16,16 L 42,31 Z',
                fill: 'currentColor'
              })
            )
          ),
          e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
            e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)' } },
              project.title + (unsavedChanges ? ' •' : '')),

            // Autosave indicator with error details
            (savingState !== 'idle' || isOffline) && e('span', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '10px',
                padding: '2px 8px',
                borderRadius: '3px',
                background: isOffline ? 'rgba(158, 158, 158, 0.2)' :
                           savingState === 'saving' ? 'rgba(255, 193, 7, 0.2)' :
                           savingState === 'saved' ? 'rgba(76, 175, 80, 0.2)' :
                           'rgba(244, 67, 54, 0.2)',
                color: isOffline ? '#999' :
                       savingState === 'saving' ? '#FFA726' :
                       savingState === 'saved' ? '#66BB6A' :
                       '#EF5350',
                border: `1px solid ${isOffline ? '#999' :
                                      savingState === 'saving' ? '#FFA726' :
                                      savingState === 'saved' ? '#66BB6A' :
                                      '#EF5350'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: autosaveError ? 'help' : 'default',
                title: autosaveError || ''
              }
            },
              isOffline ? '📡 Offline' :
              savingState === 'saving' ? '💾 Tallennetaan...' :
              savingState === 'saved' ? '✓ Tallennettu' :
              autosaveError ? `✗ ${autosaveError}` : '✗ Virhe'
            )
          )
        ),
        e('div', { style: { display: 'flex', gap: '8px' } },
          e('button', {
            onClick: newProject,
            title: 'Uusi projekti (Cmd+N)',
            style: {
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text)',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px'
            }
          }, 'Uusi'),
          e('button', {
            onClick: loadProject,
            title: 'Avaa projekti (Cmd+O)',
            style: {
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text)',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px'
            }
          }, 'Avaa'),

          // Recent Files Dropdown
          recentFiles.length > 0 ? e('div', {
            style: { position: 'relative' }
          },
            e('button', {
              onClick: () => setShowRecentFilesMenu(prev => !prev),
              title: 'Viimeisimmät projektit',
              style: {
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text)',
                padding: '4px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px'
              }
            }, 'Viimeisimmät ▾'),
            showRecentFilesMenu ? e('div', {
              style: {
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                background: 'var(--bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                padding: '4px',
                minWidth: '300px',
                maxHeight: '400px',
                overflow: 'auto',
                zIndex: 1000,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
              },
              onClick: (ev) => ev.stopPropagation()
            },
              recentFiles.map(file =>
                e('div', {
                  key: file.path,
                  onClick: () => {
                    loadRecentFile(file.path);
                    setShowRecentFilesMenu(false);
                  },
                  style: {
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderRadius: '2px',
                    transition: 'background 0.2s',
                    ':hover': { background: 'var(--bg-1)' }
                  },
                  onMouseEnter: (ev) => ev.currentTarget.style.background = 'var(--bg-1)',
                  onMouseLeave: (ev) => ev.currentTarget.style.background = 'transparent'
                },
                  e('div', {
                    style: {
                      fontFamily: 'EB Garamond',
                      fontSize: '14px',
                      color: 'var(--text)',
                      marginBottom: '2px'
                    }
                  }, file.title || 'Nimetön projekti'),
                  e('div', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '10px',
                      color: 'var(--text-3)'
                    }
                  }, file.path.split('/').pop() + ' • ' + new Date(file.lastOpened).toLocaleDateString('fi-FI'))
                )
              ),
              e('div', {
                style: {
                  borderTop: '1px solid var(--border-color)',
                  marginTop: '4px',
                  paddingTop: '4px'
                }
              },
                e('button', {
                  onClick: () => {
                    setRecentFiles([]);
                    localStorage.removeItem('faust-recent-files');
                    setShowRecentFilesMenu(false);
                  },
                  style: {
                    width: '100%',
                    padding: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-3)',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    textAlign: 'left'
                  },
                  onMouseEnter: (ev) => ev.currentTarget.style.color = 'var(--text)',
                  onMouseLeave: (ev) => ev.currentTarget.style.color = 'var(--text-3)'
                }, 'Tyhjennä historia')
              )
            ) : null
          ) : null,

          e('button', {
            onClick: saveProject,
            title: 'Tallenna projekti (Cmd+S)',
            style: {
              background: unsavedChanges ? 'var(--bronze)' : 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text)',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px'
            }
          }, 'Tallenna'),

          // Snapshots button with dropdown
          e('div', {
            style: { position: 'relative' }
          },
            e('button', {
              onClick: () => setShowSnapshotsPanel(prev => !prev),
              title: `Snapshotit (${(project.snapshots || []).length}) - Tallenna ja palauta versioita`,
              style: {
                background: showSnapshotsPanel ? 'var(--bronze)' : 'transparent',
                border: '1px solid var(--border-color)',
                color: showSnapshotsPanel ? '#000' : 'var(--text)',
                padding: '4px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                fontWeight: showSnapshotsPanel ? 600 : 400
              }
            }, `📸 ${(project.snapshots || []).length}`),

            // Snapshots dropdown panel
            showSnapshotsPanel && e('div', {
              style: {
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                background: 'var(--bg-1)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px',
                minWidth: '320px',
                maxHeight: '500px',
                overflow: 'auto',
                zIndex: 1000,
                boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
              },
              onClick: (ev) => ev.stopPropagation()
            },
              // Header
              e('div', {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid var(--border-color)'
                }
              },
                e('h4', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '13px',
                    color: 'var(--text)',
                    margin: 0
                  }
                }, 'Snapshotit'),
                e('button', {
                  onClick: () => setShowSnapshotsPanel(false),
                  style: {
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-2)',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }
                }, '×')
              ),

              // Create new snapshot button
              e('button', {
                onClick: () => {
                  const name = prompt('Snapshotin nimi:', `Ennen muokkausta ${new Date().toLocaleDateString('fi-FI')}`);
                  if (name !== null) {
                    const desc = prompt('Kuvaus (valinnainen):', '');
                    createSnapshot(name, desc || '');
                  }
                },
                style: {
                  width: '100%',
                  padding: '10px',
                  marginBottom: '12px',
                  background: 'var(--bronze)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#000',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  fontWeight: 600
                }
              }, '+ Luo uusi snapshot'),

              // Snapshots list
              (project.snapshots || []).length === 0
                ? e('p', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px',
                      color: 'var(--text-3)',
                      textAlign: 'center',
                      padding: '16px'
                    }
                  }, 'Ei snapshoteja. Luo snapshot tallentaaksesi projektin nykyisen tilan.')
                : [...(project.snapshots || [])].reverse().map(snapshot =>
                    e('div', {
                      key: snapshot.id,
                      style: {
                        padding: '10px',
                        borderRadius: '4px',
                        marginBottom: '8px',
                        background: 'var(--bg-2)',
                        border: '1px solid var(--border-color)'
                      }
                    },
                      // Snapshot info
                      e('div', {
                        style: {
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '6px'
                        }
                      },
                        e('div', null,
                          e('div', {
                            style: {
                              fontFamily: 'IBM Plex Mono',
                              fontSize: '12px',
                              color: 'var(--text)',
                              fontWeight: 500
                            }
                          }, snapshot.name),
                          e('div', {
                            style: {
                              fontFamily: 'IBM Plex Mono',
                              fontSize: '10px',
                              color: 'var(--text-3)',
                              marginTop: '2px'
                            }
                          }, new Date(snapshot.created).toLocaleString('fi-FI'))
                        ),
                        e('button', {
                          onClick: () => {
                            if (confirm(`Poista snapshot "${snapshot.name}"?`)) {
                              deleteSnapshot(snapshot.id);
                            }
                          },
                          style: {
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--error)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            padding: '2px 6px'
                          }
                        }, '×')
                      ),

                      // Stats
                      e('div', {
                        style: {
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '10px',
                          color: 'var(--text-3)',
                          marginBottom: '8px'
                        }
                      }, `${snapshot.chapterCount || 0} lukua • ${snapshot.totalWords || 0} sanaa`),

                      // Description
                      snapshot.description && e('div', {
                        style: {
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '11px',
                          color: 'var(--text-2)',
                          fontStyle: 'italic',
                          marginBottom: '8px'
                        }
                      }, snapshot.description),

                      // Action buttons
                      e('div', {
                        style: {
                          display: 'flex',
                          gap: '4px'
                        }
                      },
                        e('button', {
                          onClick: () => restoreSnapshot(snapshot.id),
                          style: {
                            flex: 1,
                            padding: '6px',
                            background: 'transparent',
                            border: '1px solid var(--bronze)',
                            borderRadius: '4px',
                            color: 'var(--bronze)',
                            cursor: 'pointer',
                            fontFamily: 'IBM Plex Mono',
                            fontSize: '10px'
                          }
                        }, '↩ Palauta'),
                        e('button', {
                          onClick: () => compareWithSnapshot(snapshot.id),
                          style: {
                            flex: 1,
                            padding: '6px',
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            color: 'var(--text-2)',
                            cursor: 'pointer',
                            fontFamily: 'IBM Plex Mono',
                            fontSize: '10px'
                          }
                        }, '⊏ Vertaa')
                      )
                    )
                  )
            )
          ),

          e('button', {
            onClick: () => setIsDarkMode(prev => !prev),
            style: {
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text)',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px'
            }
          }, isDarkMode ? 'NOX' : 'DEIS'),
          e('button', {
            onClick: () => setShowInspector(prev => !prev),
            style: {
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text)',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px'
            }
          }, showInspector ? 'Piilota' : 'Inspector'),
          // Split View toggle button
          e('button', {
            onClick: () => {
              if (!splitViewEnabled) {
                // Enable split view - default to next chapter or first different chapter
                const otherChapter = project.structure.find(ch => ch.id !== activeChapterId);
                if (otherChapter) {
                  setSplitViewChapterId(otherChapter.id);
                  setSplitViewType('chapter');
                  setSplitViewEnabled(true);
                }
              } else {
                setSplitViewEnabled(false);
              }
            },
            title: splitViewEnabled ? 'Sulje jaettu näkymä' : 'Avaa jaettu näkymä (näytä kaksi lukua rinnakkain)',
            style: {
              background: splitViewEnabled ? 'var(--bronze)' : 'transparent',
              border: '1px solid var(--border-color)',
              color: splitViewEnabled ? '#000' : 'var(--text)',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              fontWeight: splitViewEnabled ? 600 : 400
            }
          }, splitViewEnabled ? '◧ Split' : '▢ Split'),
          // Corkboard toggle button
          e('button', {
            onClick: () => setCorkboardEnabled(prev => !prev),
            title: corkboardEnabled ? 'Palaa editoriin' : 'Avaa korttinäkymä (visuaalinen lukujen järjestely)',
            style: {
              background: corkboardEnabled ? 'var(--bronze)' : 'transparent',
              border: '1px solid var(--border-color)',
              color: corkboardEnabled ? '#000' : 'var(--text)',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              fontWeight: corkboardEnabled ? 600 : 400
            }
          }, corkboardEnabled ? '▦ Kortit' : '▤ Kortit'),
          e('button', {
            onClick: () => setAiAssistantOpen(prev => !prev),
            style: {
              background: aiAssistantOpen ? 'var(--gold)' : 'transparent',
              border: '1px solid var(--border-color)',
              color: aiAssistantOpen ? '#000' : 'var(--text)',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              fontWeight: aiAssistantOpen ? 600 : 400
            }
          }, 'LIMINAL ENGINE'),
          // AI Työkalut button removed - had no associated panel
          e('button', {
            onClick: () => setShowSettings(true),
            style: {
              background: project.apiConfig.isConfigured ? 'transparent' : 'var(--bronze)',
              border: '1px solid var(--border-color)',
              color: project.apiConfig.isConfigured ? 'var(--text)' : '#000',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              fontWeight: project.apiConfig.isConfigured ? 400 : 600
            }
          }, '⚙️ Asetukset')
        )
      )
    ),

    // Main content - three columns
    e('div', { className: 'faust-main' },
      // Left sidebar - Chapter list
      e('div', { className: sidebarCollapsed ? 'faust-sidebar collapsed' : 'faust-sidebar' },
        // Collapse button (always visible)
        e('button', {
          onClick: () => setSidebarCollapsed(!sidebarCollapsed),
          title: sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar',
          style: {
            position: 'absolute',
            top: '12px',
            right: sidebarCollapsed ? '4px' : '8px',
            width: sidebarCollapsed ? '32px' : '24px',
            height: '24px',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text-2)',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            zIndex: 10
          }
        }, sidebarCollapsed ? '→' : '←'),

        !sidebarCollapsed && e('div', { style: { padding: '16px', color: 'var(--text)' } },
          e('h3', { style: { fontFamily: 'EB Garamond', fontSize: '16px', marginBottom: '12px' } }, project.title),

          // Project stats
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text-3)',
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--border-color)'
            }
          },
            e('div', null, `${project.targets.currentTotal} / ${project.targets.totalWords} sanaa`),
            e('div', null, `${project.structure.length} lukua`)
          ),

          // Chapter list
          e('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' } },
            project.structure.map((chapter, idx) =>
              e('div', {
                key: chapter.id,
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  background: chapter.id === activeChapterId ? 'var(--bg-tertiary, rgba(143,122,83,0.1))' : 'transparent',
                  borderLeft: chapter.id === activeChapterId ? '2px solid var(--bronze)' : '2px solid transparent',
                  transition: 'all 0.2s'
                }
              },
                // Chapter info (clickable)
                e('div', {
                  onClick: () => setActiveChapterId(chapter.id),
                  style: {
                    flex: 1,
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '13px',
                    color: chapter.id === activeChapterId ? 'var(--text)' : 'var(--text-2)'
                  }
                },
                  e('div', { style: { marginBottom: '4px' } }, chapter.title),
                  e('div', { style: { fontSize: '11px', color: 'var(--text-3)' } }, `${chapter.wordCount} sanaa`)
                ),

                // Chapter controls (only show for active chapter)
                chapter.id === activeChapterId ? e('div', { style: { display: 'flex', gap: '2px' } },
                  // Move up
                  idx > 0 ? e('button', {
                    onClick: () => moveChapterUp(chapter.id),
                    title: 'Siirrä ylös',
                    style: {
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-3)',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontSize: '14px'
                    }
                  }, '↑') : null,

                  // Move down
                  idx < project.structure.length - 1 ? e('button', {
                    onClick: () => moveChapterDown(chapter.id),
                    title: 'Siirrä alas',
                    style: {
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-3)',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontSize: '14px'
                    }
                  }, '↓') : null,

                  // Delete
                  project.structure.length > 1 ? e('button', {
                    onClick: () => deleteChapter(chapter.id),
                    title: 'Poista luku',
                    style: {
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--error)',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontSize: '14px',
                      transition: 'all 0.2s'
                    }
                  }, '×') : null
                ) : null
              )
            )
          ),

          // Add chapter button
          e('button', {
            onClick: addChapter,
            style: {
              width: '100%',
              padding: '8px',
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text-2)',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              transition: 'all 0.2s'
            }
          }, '+ Uusi luku'),

          // Collections section
          e('div', {
            style: {
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-color)'
            }
          },
            e('div', {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px'
              }
            },
              e('span', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-3)',
                  textTransform: 'uppercase'
                }
              }, 'Kokoelmat'),
              e('button', {
                onClick: () => {
                  const name = prompt('Kokoelman nimi:');
                  if (name) {
                    const typeChoice = prompt('Tyyppi:\n1 = Manuaalinen\n2 = Status (draft/revised/final)\n3 = Hahmo (nimen mukaan)\n4 = Haku (tekstin mukaan)', '1');
                    let type = 'manual';
                    let filter = null;

                    if (typeChoice === '2') {
                      type = 'status';
                      filter = prompt('Status (draft, revised, final):', 'draft');
                    } else if (typeChoice === '3') {
                      type = 'character';
                      filter = prompt('Hahmon nimi:');
                    } else if (typeChoice === '4') {
                      type = 'search';
                      filter = prompt('Hakusana:');
                    }

                    createCollection(name, type, filter);
                  }
                },
                style: {
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  padding: '2px 4px'
                }
              }, '+')
            ),

            // Collections list
            (project.collections || []).length === 0
              ? e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '10px',
                    color: 'var(--text-3)',
                    textAlign: 'center',
                    padding: '8px'
                  }
                }, 'Ei kokoelmia')
              : (project.collections || []).map(collection => {
                  const chapters = getCollectionChapters(collection);
                  const isActive = activeCollectionId === collection.id;
                  return e('div', {
                    key: collection.id,
                    style: {
                      marginBottom: '4px'
                    }
                  },
                    e('div', {
                      onClick: () => setActiveCollectionId(isActive ? null : collection.id),
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        background: isActive ? 'rgba(143,122,83,0.15)' : 'transparent',
                        borderLeft: isActive ? '2px solid var(--bronze)' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }
                    },
                      e('div', {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }
                      },
                        e('span', {
                          style: { fontSize: '12px' }
                        }, collection.type === 'manual' ? '📁' :
                           collection.type === 'status' ? '📋' :
                           collection.type === 'character' ? '👤' : '🔍'),
                        e('span', {
                          style: {
                            fontFamily: 'IBM Plex Mono',
                            fontSize: '11px',
                            color: isActive ? 'var(--text)' : 'var(--text-2)'
                          }
                        }, collection.name)
                      ),
                      e('div', {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }
                      },
                        e('span', {
                          style: {
                            fontFamily: 'IBM Plex Mono',
                            fontSize: '10px',
                            color: 'var(--text-3)'
                          }
                        }, `${chapters.length}`),
                        e('button', {
                          onClick: (ev) => {
                            ev.stopPropagation();
                            if (confirm(`Poista kokoelma "${collection.name}"?`)) {
                              deleteCollection(collection.id);
                            }
                          },
                          style: {
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--error)',
                            cursor: 'pointer',
                            fontSize: '10px',
                            padding: '0 2px',
                            opacity: 0.6
                          }
                        }, '×')
                      )
                    ),
                    // Expanded collection chapters
                    isActive && chapters.length > 0 && e('div', {
                      style: {
                        marginLeft: '12px',
                        marginTop: '4px'
                      }
                    },
                      chapters.map(ch =>
                        e('div', {
                          key: ch.id,
                          onClick: () => setActiveChapterId(ch.id),
                          style: {
                            padding: '4px 8px',
                            fontFamily: 'IBM Plex Mono',
                            fontSize: '10px',
                            color: ch.id === activeChapterId ? 'var(--bronze)' : 'var(--text-3)',
                            cursor: 'pointer',
                            borderRadius: '2px',
                            background: ch.id === activeChapterId ? 'rgba(143,122,83,0.1)' : 'transparent'
                          }
                        }, ch.title || 'Nimetön')
                      )
                    )
                  );
                })
          )
        )
      ),

      // Center editor area (supports split view)
      e('div', {
        className: 'faust-editor-area',
        style: {
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden'
        }
      },
        // Corkboard view (when enabled)
        corkboardEnabled ? e('div', {
          className: 'faust-corkboard',
          style: {
            flex: 1,
            padding: '24px',
            background: 'var(--bg-secondary)',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column'
          }
        },
          // Corkboard header
          e('div', {
            style: {
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }
          },
            e('h2', {
              style: {
                fontFamily: 'EB Garamond',
                fontSize: '24px',
                color: 'var(--text)'
              }
            }, 'Korttinäkymä'),
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text-3)'
              }
            }, `${project.structure.length} lukua • Vedä ja pudota järjestääksesi`)
          ),

          // Cards grid
          e('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '16px',
              flex: 1
            }
          },
            project.structure.map((chapter, idx) =>
              e('div', {
                key: chapter.id,
                draggable: true,
                onDragStart: (ev) => {
                  setDraggedChapterId(chapter.id);
                  ev.dataTransfer.effectAllowed = 'move';
                },
                onDragEnd: () => setDraggedChapterId(null),
                onDragOver: (ev) => {
                  ev.preventDefault();
                  ev.dataTransfer.dropEffect = 'move';
                },
                onDrop: (ev) => {
                  ev.preventDefault();
                  if (draggedChapterId && draggedChapterId !== chapter.id) {
                    // Reorder chapters
                    const fromIdx = project.structure.findIndex(ch => ch.id === draggedChapterId);
                    const toIdx = project.structure.findIndex(ch => ch.id === chapter.id);
                    if (fromIdx !== -1 && toIdx !== -1) {
                      setProject(prev => {
                        const newStructure = [...prev.structure];
                        const [moved] = newStructure.splice(fromIdx, 1);
                        newStructure.splice(toIdx, 0, moved);
                        return { ...prev, structure: newStructure };
                      });
                      setUnsavedChanges(true);
                    }
                  }
                  setDraggedChapterId(null);
                },
                onClick: () => {
                  setActiveChapterId(chapter.id);
                  setCorkboardEnabled(false);
                },
                style: {
                  background: chapter.id === activeChapterId ? 'rgba(143,122,83,0.15)' : 'var(--bg-1)',
                  border: draggedChapterId === chapter.id
                    ? '2px dashed var(--bronze)'
                    : chapter.id === activeChapterId
                      ? '2px solid var(--bronze)'
                      : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '16px',
                  cursor: 'grab',
                  transition: 'all 0.2s',
                  minHeight: '160px',
                  display: 'flex',
                  flexDirection: 'column',
                  opacity: draggedChapterId === chapter.id ? 0.5 : 1,
                  transform: draggedChapterId === chapter.id ? 'scale(0.95)' : 'scale(1)'
                }
              },
                // Card header
                e('div', {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px'
                  }
                },
                  e('span', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px',
                      color: 'var(--bronze)',
                      background: 'var(--bg-2)',
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }
                  }, `${idx + 1}`),
                  e('span', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '10px',
                      color: chapter.status === 'final' ? '#4CAF50' : chapter.status === 'revised' ? '#FFA726' : 'var(--text-3)',
                      textTransform: 'uppercase'
                    }
                  }, chapter.status || 'draft')
                ),

                // Card title
                e('h3', {
                  style: {
                    fontFamily: 'EB Garamond',
                    fontSize: '16px',
                    color: 'var(--text)',
                    marginBottom: '8px',
                    lineHeight: '1.3'
                  }
                }, chapter.title || 'Nimetön luku'),

                // Synopsis preview
                e('p', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-3)',
                    lineHeight: '1.4',
                    flex: 1,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical'
                  }
                }, chapter.synopsis || chapter.synopsisAI || (chapter.content ? chapter.content.substring(0, 100) + '...' : 'Ei sisältöä')),

                // Card footer
                e('div', {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '12px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border-color)'
                  }
                },
                  e('span', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '10px',
                      color: 'var(--text-3)'
                    }
                  }, `${chapter.wordCount || 0} sanaa`),
                  chapter.aiQuality && chapter.aiQuality.score > 0 && e('span', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '10px',
                      color: chapter.aiQuality.score >= 8 ? '#4CAF50' :
                             chapter.aiQuality.score >= 6 ? '#FFA726' : '#EF5350'
                    }
                  }, `AI: ${chapter.aiQuality.score.toFixed(1)}`)
                )
              )
            ),

            // Add chapter card
            e('div', {
              onClick: () => {
                addChapter();
              },
              style: {
                background: 'transparent',
                border: '2px dashed var(--border-color)',
                borderRadius: '8px',
                padding: '16px',
                cursor: 'pointer',
                minHeight: '160px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              },
              onMouseEnter: (ev) => {
                ev.currentTarget.style.borderColor = 'var(--bronze)';
                ev.currentTarget.style.background = 'rgba(143,122,83,0.05)';
              },
              onMouseLeave: (ev) => {
                ev.currentTarget.style.borderColor = 'var(--border-color)';
                ev.currentTarget.style.background = 'transparent';
              }
            },
              e('span', {
                style: {
                  fontSize: '32px',
                  color: 'var(--text-3)',
                  marginBottom: '8px'
                }
              }, '+'),
              e('span', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  color: 'var(--text-3)'
                }
              }, 'Uusi luku')
            )
          )
        ) :

        // Primary editor pane (normal view)
        e('div', {
          className: 'faust-editor',
          style: splitViewEnabled ? { flex: 1, borderRight: '2px solid var(--border-color)' } : {}
        },
        // AI Loading Indicator - floating overlay
        isGenerating ? e('div', {
          style: {
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(0, 0, 0, 0.85)',
            border: '2px solid var(--bronze)',
            borderRadius: '8px',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 1000,
            animation: 'fadeIn 0.3s ease',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
          }
        },
          // Spinner
          e('div', {
            style: {
              width: '20px',
              height: '20px',
              border: '3px solid var(--bg-2)',
              borderTop: '3px solid var(--bronze)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }
          }),
          // Text
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--sigil)',
              fontWeight: 500
            }
          }, 'AI generoi sisältöä...')
        ) : null,

        e('div', { className: 'faust-editor-content' },
          // Chapter title
          e('input', {
            value: activeChapter.title,
            onChange: (ev) => {
              setProject(prev => ({
                ...prev,
                structure: prev.structure.map(ch =>
                  ch.id === activeChapterId ? { ...ch, title: ev.target.value } : ch
                )
              }));
              setUnsavedChanges(true);
            },
            placeholder: 'Luvun otsikko',
            style: {
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--ink)',
              fontFamily: 'EB Garamond',
              fontSize: '32px',
              fontWeight: 600,
              marginBottom: '8px',
              borderBottom: '2px solid transparent'
            }
          }),

          // Word count and AI quality bar
          e('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '8px'
            }
          },
            // Word count
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '13px',
                color: 'var(--text-3)'
              }
            }, `${activeChapter.wordCount} sanaa`),

            // AI Quality score
            activeChapter.aiQuality && activeChapter.aiQuality.score > 0 ? e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: activeChapter.aiQuality.score >= 8 ? '#4CAF50' :
                       activeChapter.aiQuality.score >= 6 ? '#FFA726' : '#EF5350',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'var(--bg-2)',
                border: '1px solid currentColor'
              }
            }, `AI: ${activeChapter.aiQuality.score.toFixed(1)}/10`) : null,

            // Status badge
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'var(--bg-2)',
                textTransform: 'uppercase'
              }
            }, activeChapter.status || 'draft'),

            // Pacing indicator
            activeChapter.pacing && activeChapter.pacing.speed ? e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)'
              }
            }, `Tempo: ${activeChapter.pacing.speed}`) : null
          ),

          // Floating AI Toolbar (absolute positioned, doesn't take document flow space)
          e('div', {
            style: {
              position: 'absolute',
              top: isGenerating ? '104px' : '80px', // Below title area and loading indicator
              right: '20px', // Changed from left to right to avoid title
              display: 'flex',
              gap: '6px',
              background: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '8px',
              zIndex: 100,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              animation: 'fadeIn 0.3s ease'
            }
          },
            // Analyze button - Alchemical Mercury symbol (☿ - transformation, analysis)
            e('button', {
              onClick: async () => {
                console.log('[UI] Analysoi clicked');
                const result = await analyzeChapterContent(activeChapterId);
                if (result) {
                  alert('Analyysi valmis! Tarkista luvun AI Quality -arvosana.');
                } else {
                  alert('Analyysi epäonnistui. Tarkista että:\n1. Claude API-avain on asetettu\n2. Luvussa on tekstiä (vähintään 50 merkkiä)');
                }
              },
              disabled: !activeChapter.content || activeChapter.content.length < 50,
              title: '☿ SCRUTINIUM PROFUNDUM\n\nMitä: Analysoi luvun laadun ja sisällön AI:lla\nTulos: Antaa arvosanan 1-10 ja yksityiskohtaiset ehdotukset\nVaatimus: Vähintään 50 merkkiä tekstiä\nKesto: ~15-30 sekuntia\n\n💡 Vinkki: Käytä kun luku on lähes valmis',
              className: 'ai-toolbar-btn',
              style: {
                padding: '8px 14px',
                background: (!activeChapter.content || activeChapter.content.length < 50)
                  ? 'linear-gradient(135deg, rgba(25, 20, 15, 0.5), rgba(35, 28, 20, 0.5))'
                  : 'linear-gradient(135deg, rgba(25, 20, 15, 0.9), rgba(35, 28, 20, 0.9))',
                border: '1px solid',
                borderImage: 'linear-gradient(135deg, #8b6914, #c7b386, #8b6914) 1',
                borderRadius: '4px',
                color: (!activeChapter.content || activeChapter.content.length < 50) ? 'rgba(199, 179, 134, 0.4)' : '#c7b386',
                cursor: (!activeChapter.content || activeChapter.content.length < 50) ? 'not-allowed' : 'pointer',
                fontFamily: '"EB Garamond", serif',
                fontSize: '18px',
                fontWeight: 500,
                letterSpacing: '0.5px',
                opacity: (!activeChapter.content || activeChapter.content.length < 50) ? 0.5 : 1,
                minWidth: '40px',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.4)',
                transition: 'all 0.3s ease',
                transform: 'scale(1)'
              },
              onMouseEnter: (e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 105, 20, 0.3), rgba(199, 179, 134, 0.3))';
                  e.currentTarget.style.color = '#d4af37';
                  e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4), 0 0 16px rgba(212, 175, 55, 0.4)';
                  e.currentTarget.style.textShadow = '0 0 10px rgba(212, 175, 55, 0.8)';
                }
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.background = (!activeChapter.content || activeChapter.content.length < 50)
                  ? 'linear-gradient(135deg, rgba(25, 20, 15, 0.5), rgba(35, 28, 20, 0.5))'
                  : 'linear-gradient(135deg, rgba(25, 20, 15, 0.9), rgba(35, 28, 20, 0.9))';
                e.currentTarget.style.color = (!activeChapter.content || activeChapter.content.length < 50) ? 'rgba(199, 179, 134, 0.4)' : '#c7b386';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4)';
                e.currentTarget.style.textShadow = 'none';
              }
            }, '☿'),

            // Quick quality check - Alchemical Alembic (⚗ - distillation, purification)
            e('button', {
              onClick: async () => {
                if (!activeChapter.content || activeChapter.content.trim().length === 0) {
                  alert('Luku on tyhjä. Kirjoita ensin jotain sisältöä.');
                  return;
                }
                console.log('[UI] Pika-arvio clicked');
                const result = await quickQualityCheck(activeChapterId);
                if (result && result.score) {
                  alert(`Pika-arvio valmis!\n\nPisteet: ${result.score}/10\n\nEhdotukset:\n${result.suggestions?.join('\n') || 'Ei ehdotuksia'}`);
                } else {
                  alert('Pika-arvio epäonnistui. Tarkista että:\n1. Claude API-avain on asetettu\n2. Luvussa on tekstiä');
                }
              },
              disabled: !activeChapter.content || activeChapter.content.trim().length === 0,
              title: '⚗ EXAMEN CELERITER\n\nMitä: Nopea laatutarkistus AI:lla\nTulos: Pisteet 1-10 ja lyhyet ehdotukset\nVaatimus: Mitä tahansa tekstiä (ei minimiä)\nKesto: ~5-10 sekuntia\n\n💡 Vinkki: Käytä kirjoittaessa säännöllisesti',
              className: 'ai-toolbar-btn',
              style: {
                padding: '8px 14px',
                background: (!activeChapter.content || activeChapter.content.trim().length === 0)
                  ? 'linear-gradient(135deg, rgba(25, 20, 15, 0.5), rgba(35, 28, 20, 0.5))'
                  : 'linear-gradient(135deg, rgba(25, 20, 15, 0.9), rgba(35, 28, 20, 0.9))',
                border: '1px solid',
                borderImage: 'linear-gradient(135deg, #8b6914, #c7b386, #8b6914) 1',
                borderRadius: '4px',
                color: (!activeChapter.content || activeChapter.content.trim().length === 0) ? 'rgba(199, 179, 134, 0.4)' : '#c7b386',
                cursor: (!activeChapter.content || activeChapter.content.trim().length === 0) ? 'not-allowed' : 'pointer',
                fontFamily: '"EB Garamond", serif',
                fontSize: '18px',
                fontWeight: 500,
                letterSpacing: '0.5px',
                opacity: (!activeChapter.content || activeChapter.content.trim().length === 0) ? 0.5 : 1,
                minWidth: '40px',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.4)',
                transition: 'all 0.3s ease',
                transform: 'scale(1)'
              },
              onMouseEnter: (e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 105, 20, 0.3), rgba(199, 179, 134, 0.3))';
                  e.currentTarget.style.color = '#d4af37';
                  e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4), 0 0 16px rgba(212, 175, 55, 0.4)';
                  e.currentTarget.style.textShadow = '0 0 10px rgba(212, 175, 55, 0.8)';
                }
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.background = (!activeChapter.content || activeChapter.content.trim().length === 0)
                  ? 'linear-gradient(135deg, rgba(25, 20, 15, 0.5), rgba(35, 28, 20, 0.5))'
                  : 'linear-gradient(135deg, rgba(25, 20, 15, 0.9), rgba(35, 28, 20, 0.9))';
                e.currentTarget.style.color = (!activeChapter.content || activeChapter.content.trim().length === 0) ? 'rgba(199, 179, 134, 0.4)' : '#c7b386';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4)';
                e.currentTarget.style.textShadow = 'none';
              }
            }, '⚗'),

            // Generate synopsis - Alchemical Sulfur (🜍 - essence, spirit, summary)
            e('button', {
              onClick: async () => {
                if (!activeChapter.content || activeChapter.content.trim().length === 0) {
                  alert('Luku on tyhjä. Kirjoita ensin jotain sisältöä.');
                  return;
                }
                console.log('[UI] Synopsis clicked');
                const result = await generateSynopsis(activeChapterId);
                if (result) {
                  alert(`Synopsis luotu:\n\n${result}`);
                } else {
                  alert('Synopsis-luonti epäonnistui. Tarkista että:\n1. Claude API-avain on asetettu\n2. Luvussa on tekstiä');
                }
              },
              disabled: !activeChapter.content || activeChapter.content.trim().length === 0,
              title: '🜍 EPITOME BREVIS\n\nMitä: Luo lyhyt synopsis/yhteenveto luvusta\nTulos: 2-4 lauseen tiivistelmä luvun tapahtumista\nVaatimus: Mitä tahansa tekstiä (ei minimiä)\nKesto: ~10-15 sekuntia\n\n💡 Vinkki: Hyödyllinen luvun tallennukseen ja muistiinpanoihin',
              className: 'ai-toolbar-btn',
              style: {
                padding: '8px 14px',
                background: (!activeChapter.content || activeChapter.content.trim().length === 0)
                  ? 'linear-gradient(135deg, rgba(25, 20, 15, 0.5), rgba(35, 28, 20, 0.5))'
                  : 'linear-gradient(135deg, rgba(25, 20, 15, 0.9), rgba(35, 28, 20, 0.9))',
                border: '1px solid',
                borderImage: 'linear-gradient(135deg, #8b6914, #c7b386, #8b6914) 1',
                borderRadius: '4px',
                color: (!activeChapter.content || activeChapter.content.trim().length === 0) ? 'rgba(199, 179, 134, 0.4)' : '#c7b386',
                cursor: (!activeChapter.content || activeChapter.content.trim().length === 0) ? 'not-allowed' : 'pointer',
                fontFamily: '"EB Garamond", serif',
                fontSize: '18px',
                fontWeight: 500,
                letterSpacing: '0.5px',
                opacity: (!activeChapter.content || activeChapter.content.trim().length === 0) ? 0.5 : 1,
                minWidth: '40px',
                boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.4)',
                transition: 'all 0.3s ease',
                transform: 'scale(1)'
              },
              onMouseEnter: (e) => {
                if (!e.currentTarget.disabled) {
                  e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 105, 20, 0.3), rgba(199, 179, 134, 0.3))';
                  e.currentTarget.style.color = '#d4af37';
                  e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4), 0 0 16px rgba(212, 175, 55, 0.4)';
                  e.currentTarget.style.textShadow = '0 0 10px rgba(212, 175, 55, 0.8)';
                }
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.background = (!activeChapter.content || activeChapter.content.trim().length === 0)
                  ? 'linear-gradient(135deg, rgba(25, 20, 15, 0.5), rgba(35, 28, 20, 0.5))'
                  : 'linear-gradient(135deg, rgba(25, 20, 15, 0.9), rgba(35, 28, 20, 0.9))';
                e.currentTarget.style.color = (!activeChapter.content || activeChapter.content.trim().length === 0) ? 'rgba(199, 179, 134, 0.4)' : '#c7b386';
                e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.4)';
                e.currentTarget.style.textShadow = 'none';
              }
            }, '🜍'),

            // Generate chapter - Alchemical Philosopher's Stone (Circle-Triangle-Square-Circle - magnum opus, creation)
            e('button', {
              onClick: () => generateChapter(activeChapterId),
              disabled: isGenerating,
              title: isGenerating ? '⧖ OPUS IN PROGRESSU...\n\nOdota, AI kirjoittaa lukua...' : '◉ MAGNUM OPUS\n\nMitä: AI kirjoittaa kokonaisen luvun puolestasi\nTulos: 1000-3000 sanan luku projektisi tyyliin\nVaatimus: Ei vaatimuksia (voi olla tyhjä)\nKesto: ~30-90 sekuntia\n\n💡 Vinkki: AI käyttää aiempia lukuja kontekstina',
              className: 'ai-toolbar-btn-primary',
              style: {
                padding: '8px 16px',
                background: isGenerating
                  ? 'linear-gradient(135deg, rgba(25, 20, 15, 0.5), rgba(35, 28, 20, 0.5))'
                  : 'linear-gradient(135deg, rgba(139, 105, 20, 0.9), rgba(199, 179, 134, 0.8))',
                border: '2px solid',
                borderImage: isGenerating
                  ? 'linear-gradient(135deg, #5a4a0f, #7a6a2f, #5a4a0f) 1'
                  : 'linear-gradient(135deg, #c7b386, #d4af37, #c7b386) 1',
                borderRadius: '4px',
                color: isGenerating ? 'rgba(199, 179, 134, 0.4)' : '#1a1510',
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                fontFamily: '"EB Garamond", serif',
                fontSize: '20px',
                fontWeight: 600,
                letterSpacing: '1px',
                opacity: isGenerating ? 0.5 : 1,
                minWidth: '44px',
                boxShadow: isGenerating
                  ? 'inset 0 2px 4px rgba(0, 0, 0, 0.4)'
                  : 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(199, 179, 134, 0.3)',
                transition: 'all 0.3s ease',
                transform: 'scale(1)'
              },
              onMouseEnter: (e) => {
                if (!isGenerating) {
                  e.currentTarget.style.transform = 'scale(1.08) translateY(-3px)';
                  e.currentTarget.style.background = 'linear-gradient(135deg, rgba(212, 175, 55, 0.95), rgba(255, 215, 0, 0.9))';
                  e.currentTarget.style.color = '#000';
                  e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 8px 20px rgba(212, 175, 55, 0.6)';
                  e.currentTarget.style.textShadow = '0 0 12px rgba(255, 215, 0, 0.9)';
                }
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.background = isGenerating
                  ? 'linear-gradient(135deg, rgba(25, 20, 15, 0.5), rgba(35, 28, 20, 0.5))'
                  : 'linear-gradient(135deg, rgba(139, 105, 20, 0.9), rgba(199, 179, 134, 0.8))';
                e.currentTarget.style.color = isGenerating ? 'rgba(199, 179, 134, 0.4)' : '#1a1510';
                e.currentTarget.style.boxShadow = isGenerating
                  ? 'inset 0 2px 4px rgba(0, 0, 0, 0.4)'
                  : 'inset 0 2px 4px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(199, 179, 134, 0.3)';
                e.currentTarget.style.textShadow = 'none';
              }
            },
              isGenerating ? '⧖' :
              // Custom Philosopher's Stone SVG - Circle, Triangle, Square, Circle
              e('svg', {
                width: '24',
                height: '24',
                viewBox: '0 0 100 100',
                style: { display: 'inline-block', verticalAlign: 'middle' }
              },
                // Outer circle
                e('circle', {
                  cx: '50',
                  cy: '50',
                  r: '48',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: '2'
                }),
                // Triangle (pointing up from center)
                e('path', {
                  d: 'M 50 10 L 88 75 L 12 75 Z',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: '2'
                }),
                // Square (inside triangle, centered)
                e('rect', {
                  x: '34',
                  y: '38',
                  width: '32',
                  height: '32',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: '2'
                }),
                // Inner circle (centered in square)
                e('circle', {
                  cx: '50',
                  cy: '54',
                  r: '11',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: '2'
                })
              )
            )
          ),

          // Generation progress indicator with progress bar
          generationProgress && e('div', {
            style: {
              padding: '12px 16px',
              background: 'var(--sigil)' + '22',
              border: '1px solid var(--sigil)',
              borderRadius: '4px',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: 'var(--sigil)',
              marginTop: '8px'
            }
          },
            e('div', {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: generationProgress.percentage ? '8px' : '0'
              }
            },
              e('span', null, generationProgress.message),
              generationProgress.percentage && e('span', {
                style: { fontWeight: 600 }
              }, `${generationProgress.percentage}%`)
            ),
            // Progress bar
            generationProgress.percentage && e('div', {
              style: {
                width: '100%',
                height: '4px',
                background: 'var(--surface-2)',
                borderRadius: '2px',
                overflow: 'hidden'
              }
            },
              e('div', {
                style: {
                  width: `${generationProgress.percentage}%`,
                  height: '100%',
                  background: 'var(--sigil)',
                  borderRadius: '2px',
                  transition: 'width 0.3s ease'
                }
              })
            )
          ),

          // AI Suggestions (if any)
          activeChapter.aiQuality && activeChapter.aiQuality.suggestions && activeChapter.aiQuality.suggestions.length > 0 ? e('div', {
            style: {
              marginBottom: '16px',
              padding: '12px',
              background: 'rgba(255,193,7,0.1)',
              border: '1px solid rgba(255,193,7,0.3)',
              borderRadius: '4px'
            }
          },
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: '#FFA726',
                marginBottom: '8px',
                fontWeight: 600
              }
            }, '💡 AI:n ehdotukset:'),
            ...activeChapter.aiQuality.suggestions.map((suggestion, idx) =>
              e('div', {
                key: idx,
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  color: 'var(--text)',
                  marginBottom: '4px'
                }
              }, `• ${suggestion}`)
            )
          ) : null,

          // Editor wrapper with AnnotationMargin
          e('div', {
            style: {
              position: 'relative',
              display: 'flex',
              width: '100%',
              height: '100%'
            }
          },
            // AnnotationMargin (left side)
            window.AnnotationMargin && e(window.AnnotationMargin, {
              annotations: activeChapter.annotations || [],
              content: activeChapter.content,
              onAnnotationClick: handleAnnotationClick,
              onCreateAnnotation: handleCreateAnnotation,
              onUpdateAnnotation: handleUpdateAnnotation,
              onDeleteAnnotation: handleDeleteAnnotation,
              editorDimensions: editorDimensions
            }),

            // Editor container with formatting toolbar
            e('div', {
              style: {
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                height: '100%'
              }
            },
              // Formatting toolbar
              e('div', {
                className: 'formatting-toolbar',
                style: {
                  display: 'flex',
                  gap: '4px',
                  padding: '8px 12px',
                  background: 'var(--bg-2)',
                  borderBottom: '1px solid var(--border-color)',
                  borderRadius: '4px 4px 0 0',
                  marginBottom: '8px'
                }
              },
                // Bold button
                e('button', {
                  onClick: () => {
                    if (!editorRef.current) return;
                    const textarea = editorRef.current;
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const text = textarea.value;
                    const selectedText = text.substring(start, end);
                    if (selectedText) {
                      const newText = text.substring(0, start) + '**' + selectedText + '**' + text.substring(end);
                      updateChapterContent(newText);
                      setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(start + 2, end + 2);
                      }, 0);
                    }
                  },
                  title: 'Lihavointi (Cmd+B) - Lisää **teksti**',
                  style: {
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontFamily: 'EB Garamond',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }
                }, 'B'),

                // Italic button
                e('button', {
                  onClick: () => {
                    if (!editorRef.current) return;
                    const textarea = editorRef.current;
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const text = textarea.value;
                    const selectedText = text.substring(start, end);
                    if (selectedText) {
                      const newText = text.substring(0, start) + '_' + selectedText + '_' + text.substring(end);
                      updateChapterContent(newText);
                      setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(start + 1, end + 1);
                      }, 0);
                    }
                  },
                  title: 'Kursiivi (Cmd+I) - Lisää _teksti_',
                  style: {
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontFamily: 'EB Garamond',
                    fontSize: '14px',
                    fontStyle: 'italic'
                  }
                }, 'I'),

                // Strikethrough button
                e('button', {
                  onClick: () => {
                    if (!editorRef.current) return;
                    const textarea = editorRef.current;
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const text = textarea.value;
                    const selectedText = text.substring(start, end);
                    if (selectedText) {
                      const newText = text.substring(0, start) + '~~' + selectedText + '~~' + text.substring(end);
                      updateChapterContent(newText);
                      setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(start + 2, end + 2);
                      }, 0);
                    }
                  },
                  title: 'Yliviivaus - Lisää ~~teksti~~',
                  style: {
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontFamily: 'EB Garamond',
                    fontSize: '14px',
                    textDecoration: 'line-through'
                  }
                }, 'S'),

                // Separator
                e('div', { style: { width: '1px', background: 'var(--border-color)', margin: '0 4px' } }),

                // Heading 1
                e('button', {
                  onClick: () => {
                    if (!editorRef.current) return;
                    const textarea = editorRef.current;
                    const start = textarea.selectionStart;
                    const text = textarea.value;
                    // Find start of line
                    let lineStart = start;
                    while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
                    const newText = text.substring(0, lineStart) + '# ' + text.substring(lineStart);
                    updateChapterContent(newText);
                    setTimeout(() => {
                      textarea.focus();
                      textarea.setSelectionRange(start + 2, start + 2);
                    }, 0);
                  },
                  title: 'Otsikko 1 - Lisää # rivin alkuun',
                  style: {
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px'
                  }
                }, 'H1'),

                // Heading 2
                e('button', {
                  onClick: () => {
                    if (!editorRef.current) return;
                    const textarea = editorRef.current;
                    const start = textarea.selectionStart;
                    const text = textarea.value;
                    let lineStart = start;
                    while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
                    const newText = text.substring(0, lineStart) + '## ' + text.substring(lineStart);
                    updateChapterContent(newText);
                    setTimeout(() => {
                      textarea.focus();
                      textarea.setSelectionRange(start + 3, start + 3);
                    }, 0);
                  },
                  title: 'Otsikko 2 - Lisää ## rivin alkuun',
                  style: {
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px'
                  }
                }, 'H2'),

                // Separator
                e('div', { style: { width: '1px', background: 'var(--border-color)', margin: '0 4px' } }),

                // Quote
                e('button', {
                  onClick: () => {
                    if (!editorRef.current) return;
                    const textarea = editorRef.current;
                    const start = textarea.selectionStart;
                    const text = textarea.value;
                    let lineStart = start;
                    while (lineStart > 0 && text[lineStart - 1] !== '\n') lineStart--;
                    const newText = text.substring(0, lineStart) + '> ' + text.substring(lineStart);
                    updateChapterContent(newText);
                    setTimeout(() => {
                      textarea.focus();
                      textarea.setSelectionRange(start + 2, start + 2);
                    }, 0);
                  },
                  title: 'Lainaus - Lisää > rivin alkuun',
                  style: {
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontFamily: 'EB Garamond',
                    fontSize: '14px'
                  }
                }, '❝'),

                // Scene break
                e('button', {
                  onClick: () => {
                    if (!editorRef.current) return;
                    const textarea = editorRef.current;
                    const start = textarea.selectionStart;
                    const text = textarea.value;
                    const sceneBreak = '\n\n* * *\n\n';
                    const newText = text.substring(0, start) + sceneBreak + text.substring(start);
                    updateChapterContent(newText);
                    setTimeout(() => {
                      textarea.focus();
                      textarea.setSelectionRange(start + sceneBreak.length, start + sceneBreak.length);
                    }, 0);
                  },
                  title: 'Kohtauksen vaihto - Lisää * * *',
                  style: {
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px'
                  }
                }, '***'),

                // Separator
                e('div', { style: { width: '1px', background: 'var(--border-color)', margin: '0 4px' } }),

                // Comment/Note marker
                e('button', {
                  onClick: () => {
                    if (!editorRef.current) return;
                    const textarea = editorRef.current;
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const text = textarea.value;
                    const selectedText = text.substring(start, end);
                    const comment = selectedText ? `[TODO: ${selectedText}]` : '[TODO: ]';
                    const newText = text.substring(0, start) + comment + text.substring(end);
                    updateChapterContent(newText);
                    setTimeout(() => {
                      textarea.focus();
                      const cursorPos = selectedText ? start + comment.length : start + 7;
                      textarea.setSelectionRange(cursorPos, cursorPos);
                    }, 0);
                  },
                  title: 'Lisää TODO-merkintä',
                  style: {
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--bronze)',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px'
                  }
                }, 'TODO'),

                // Separator
                e('div', { style: { width: '1px', background: 'var(--border-color)', margin: '0 4px' } }),

                // Add bookmark button
                e('button', {
                  onClick: () => {
                    const name = prompt('Kirjanmerkin nimi:', `Kirjanmerkki ${(project.bookmarks || []).length + 1}`);
                    if (name !== null) {
                      addBookmark(name);
                    }
                  },
                  title: 'Lisää kirjanmerkki nykyiseen kohtaan',
                  style: {
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--gold)',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px'
                  }
                }, '🔖+'),

                // Show bookmarks panel button
                e('button', {
                  onClick: () => setShowBookmarksPanel(prev => !prev),
                  title: `Näytä kirjanmerkit (${(project.bookmarks || []).length})`,
                  style: {
                    background: showBookmarksPanel ? 'var(--bronze)' : 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: showBookmarksPanel ? '#000' : 'var(--text)',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    fontWeight: showBookmarksPanel ? 600 : 400
                  }
                }, `🔖 ${(project.bookmarks || []).length}`)
              ),

              // Bookmarks panel (floating)
              showBookmarksPanel && e('div', {
                style: {
                  position: 'absolute',
                  top: '48px',
                  right: '12px',
                  background: 'var(--bg-1)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '12px',
                  minWidth: '280px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  zIndex: 200,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
                }
              },
                e('div', {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px'
                  }
                },
                  e('h4', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '12px',
                      color: 'var(--text)',
                      margin: 0
                    }
                  }, `Kirjanmerkit (${(project.bookmarks || []).length})`),
                  e('button', {
                    onClick: () => setShowBookmarksPanel(false),
                    style: {
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-2)',
                      cursor: 'pointer',
                      fontSize: '16px'
                    }
                  }, '×')
                ),
                (project.bookmarks || []).length === 0
                  ? e('p', {
                      style: {
                        fontFamily: 'IBM Plex Mono',
                        fontSize: '11px',
                        color: 'var(--text-3)',
                        textAlign: 'center',
                        padding: '16px'
                      }
                    }, 'Ei kirjanmerkkejä. Käytä 🔖+ lisätäksesi.')
                  : (project.bookmarks || []).map(bookmark =>
                      e('div', {
                        key: bookmark.id,
                        style: {
                          padding: '8px',
                          borderRadius: '4px',
                          marginBottom: '4px',
                          background: 'var(--bg-2)',
                          cursor: 'pointer',
                          borderLeft: `3px solid ${bookmark.color || 'var(--gold)'}`
                        },
                        onClick: () => jumpToBookmark(bookmark)
                      },
                        e('div', {
                          style: {
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }
                        },
                          e('span', {
                            style: {
                              fontFamily: 'IBM Plex Mono',
                              fontSize: '12px',
                              color: 'var(--text)',
                              fontWeight: 500
                            }
                          }, bookmark.name),
                          e('button', {
                            onClick: (ev) => {
                              ev.stopPropagation();
                              if (confirm(`Poista kirjanmerkki "${bookmark.name}"?`)) {
                                deleteBookmark(bookmark.id);
                              }
                            },
                            style: {
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--error)',
                              cursor: 'pointer',
                              fontSize: '12px',
                              padding: '2px 4px'
                            }
                          }, '×')
                        ),
                        e('div', {
                          style: {
                            fontFamily: 'IBM Plex Mono',
                            fontSize: '10px',
                            color: 'var(--text-3)',
                            marginTop: '4px'
                          }
                        }, `📖 ${bookmark.chapterTitle || 'Nimetön luku'}`),
                        bookmark.context && e('div', {
                          style: {
                            fontFamily: 'EB Garamond',
                            fontSize: '11px',
                            color: 'var(--text-2)',
                            fontStyle: 'italic',
                            marginTop: '4px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }
                        }, `"...${bookmark.context}..."`)
                      )
                    )
              ),

              // Textarea
              e('textarea', {
                ref: editorRef,
                className: 'faust-textarea',
                value: activeChapter.content,
                onChange: (ev) => updateChapterContent(ev.target.value),
                onMouseUp: handleTextSelection,
                onKeyUp: handleTextSelection,
                placeholder: 'Aloita kirjoittaminen...',
                style: {
                  flex: 1,
                  fontFamily: editorFont,
                  fontSize: `${18 * (parseInt(editorZoom) / 100)}px`,
                  lineHeight: lineSpacing,
                  textAlign: textAlign,
                  paddingBottom: `${parseFloat(paragraphSpacing) * 16}px`,
                  paddingLeft: '60px' // Add left padding for annotation margin
                }
              })
            ) // Close editor container with formatting toolbar
          ),

          // Voice edit button (appears when text is selected)
          voiceInputAvailable && textSelection && !voiceDiffView ? e('div', {
            style: {
              position: 'absolute',
              bottom: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--bg-1)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '12px 20px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              zIndex: 100
            }
          },
            e('button', {
              onClick: handleVoiceEdit,
              disabled: voiceState !== 'idle',
              style: {
                background: voiceState === 'listening' ? '#ff4444' :
                           voiceState === 'processing' ? '#ffaa00' : 'var(--bronze)',
                border: 'none',
                borderRadius: '50%',
                width: '48px',
                height: '48px',
                fontSize: '24px',
                cursor: voiceState === 'idle' ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: voiceState === 'listening' ? 'pulse 1s infinite' : 'none'
              }
            },
              voiceState === 'listening' ? '🔴' :
              voiceState === 'processing' ? '⏸️' : '🎤'
            ),
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text-2)'
              }
            },
              voiceState === 'listening' ? 'Kuuntelen...' :
              voiceState === 'processing' ? 'Käsittelen...' :
              'Kerro miten haluat muuttaa tekstiä'
            )
          ) : null,

          // Find & Replace dialog
          showFindDialog ? e('div', {
            style: {
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'var(--bg-1)',
              border: '2px solid var(--border-color)',
              borderRadius: '8px',
              padding: '16px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              minWidth: '320px',
              zIndex: 300
            }
          },
            e('div', { style: { marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              e('h3', { style: { fontFamily: 'IBM Plex Mono', fontSize: '14px', margin: 0 } }, showReplaceDialog ? 'Etsi ja korvaa' : 'Etsi'),
              e('button', {
                onClick: closeFindDialog,
                style: {
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                  fontSize: '18px'
                }
              }, '×')
            ),
            e('input', {
              id: 'search-term',
              name: 'searchTerm',
              type: 'text',
              value: searchTerm,
              onChange: (ev) => setSearchTerm(ev.target.value),
              onKeyDown: (ev) => {
                if (ev.key === 'Enter') performSearch();
                if (ev.key === 'Escape') closeFindDialog();
              },
              placeholder: 'Hae...',
              autoFocus: true,
              style: {
                width: '100%',
                padding: '8px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'IBM Plex Mono',
                fontSize: '13px',
                marginBottom: '8px'
              }
            }),
            showReplaceDialog ? e('input', {
              id: 'replace-term',
              name: 'replaceTerm',
              type: 'text',
              value: replaceTerm,
              onChange: (ev) => setReplaceTerm(ev.target.value),
              placeholder: 'Korvaa...',
              style: {
                width: '100%',
                padding: '8px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'IBM Plex Mono',
                fontSize: '13px',
                marginBottom: '8px'
              }
            }) : null,
            // Options row 1
            e('div', { style: { display: 'flex', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' } },
              e('label', { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' } },
                e('input', {
                  id: 'search-case-sensitive',
                  name: 'caseSensitive',
                  type: 'checkbox',
                  checked: caseSensitive,
                  onChange: (ev) => setCaseSensitive(ev.target.checked)
                }),
                'Aa (case)'
              ),
              e('label', { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' } },
                e('input', {
                  id: 'search-whole-word',
                  name: 'matchWholeWord',
                  type: 'checkbox',
                  checked: matchWholeWord,
                  onChange: (ev) => setMatchWholeWord(ev.target.checked)
                }),
                'Koko sana'
              ),
              e('label', { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' } },
                e('input', {
                  id: 'search-regex',
                  name: 'useRegex',
                  type: 'checkbox',
                  checked: useRegex,
                  onChange: (ev) => setUseRegex(ev.target.checked)
                }),
                'Regex'
              ),
              e('label', { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' } },
                e('input', {
                  id: 'search-all-chapters',
                  name: 'searchInAllChapters',
                  type: 'checkbox',
                  checked: searchInAllChapters,
                  onChange: (ev) => setSearchInAllChapters(ev.target.checked)
                }),
                'Kaikki luvut'
              ),
              e('label', {
                style: {
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: searchGlobally ? 'var(--bronze)' : 'inherit'
                }
              },
                e('input', {
                  id: 'search-globally',
                  name: 'searchGlobally',
                  type: 'checkbox',
                  checked: searchGlobally,
                  onChange: (ev) => {
                    setSearchGlobally(ev.target.checked);
                    if (ev.target.checked) {
                      setSearchInAllChapters(true); // Global implies all chapters
                    }
                  }
                }),
                '🌐 Globaali'
              )
            ),
            // Global search info
            searchGlobally && e('div', {
              style: {
                fontSize: '10px',
                color: 'var(--text-3)',
                marginBottom: '8px',
                fontFamily: 'IBM Plex Mono'
              }
            }, 'Hakee luvuista, hahmoista, paikoista ja juonista'),
            // Search history dropdown
            searchHistory.length > 0 ? e('details', { style: { marginBottom: '8px' } },
              e('summary', {
                style: {
                  fontSize: '11px',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  userSelect: 'none',
                  fontFamily: 'IBM Plex Mono'
                }
              }, `Historia (${searchHistory.length})`),
              e('div', { style: { marginTop: '4px', maxHeight: '150px', overflowY: 'auto' } },
                ...searchHistory.map((term, idx) =>
                  e('div', {
                    key: idx,
                    onClick: () => {
                      setSearchTerm(term);
                      performSearch(term);
                    },
                    style: {
                      padding: '4px 8px',
                      fontSize: '12px',
                      fontFamily: 'IBM Plex Mono',
                      color: 'var(--text-2)',
                      cursor: 'pointer',
                      borderRadius: '3px',
                      background: 'var(--bg-2)',
                      marginBottom: '2px'
                    },
                    onMouseEnter: (ev) => ev.target.style.background = 'var(--bg-3)',
                    onMouseLeave: (ev) => ev.target.style.background = 'var(--bg-2)'
                  }, term.length > 40 ? term.substring(0, 40) + '...' : term)
                )
              )
            ) : null,
            searchResults.length > 0 ? e('div', {
              style: {
                fontSize: '11px',
                color: 'var(--text-2)',
                fontFamily: 'IBM Plex Mono',
                marginBottom: '8px',
                padding: '4px 8px',
                background: 'var(--bg-2)',
                borderRadius: '4px'
              }
            },
              `${currentSearchIndex + 1} / ${searchResults.length} tulosta`,
              searchInAllChapters && searchResults[currentSearchIndex] ?
                e('div', { style: { fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' } },
                  (() => {
                    const result = searchResults[currentSearchIndex];
                    const typeIcon = result.type === 'character' ? '👤' :
                                     result.type === 'location' ? '📍' :
                                     result.type === 'thread' ? '🧵' : '📖';
                    const typeName = result.type === 'character' ? result.itemName :
                                     result.type === 'location' ? result.itemName :
                                     result.type === 'thread' ? result.itemName :
                                     result.chapterTitle;
                    return `${typeIcon} ${typeName}`;
                  })(),
                  e('div', { style: { fontStyle: 'italic', marginTop: '2px', opacity: 0.7 } },
                    `"...${searchResults[currentSearchIndex].context}..."`
                  )
                ) : null
            ) : null,
            e('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
              e('button', {
                onClick: performSearch,
                style: {
                  padding: '6px 12px',
                  background: 'var(--bronze)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#000',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px'
                }
              }, 'Etsi'),
              e('button', {
                onClick: findNext,
                disabled: searchResults.length === 0,
                style: {
                  padding: '6px 12px',
                  background: searchResults.length === 0 ? 'var(--bg-2)' : 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  cursor: searchResults.length === 0 ? 'not-allowed' : 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px'
                }
              }, 'Seuraava'),
              showReplaceDialog ? e('button', {
                onClick: replaceCurrent,
                disabled: currentSearchIndex < 0,
                style: {
                  padding: '6px 12px',
                  background: currentSearchIndex < 0 ? 'var(--bg-2)' : 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  cursor: currentSearchIndex < 0 ? 'not-allowed' : 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px'
                }
              }, 'Korvaa') : null,
              showReplaceDialog ? e('button', {
                onClick: replaceAll,
                disabled: searchResults.length === 0,
                style: {
                  padding: '6px 12px',
                  background: searchResults.length === 0 ? 'var(--bg-2)' : 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  cursor: searchResults.length === 0 ? 'not-allowed' : 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px'
                }
              }, 'Korvaa kaikki') : null
            )
          ) : null,

          // Voice diff view (when AI has generated new version) - with diff highlighting
          voiceDiffView ? (() => {
            const diffResult = computeTextDiff(voiceDiffView.original, voiceDiffView.revised);
            const origWords = (voiceDiffView.original || '').split(/\s+/).filter(Boolean).length;
            const newWords = (voiceDiffView.revised || '').split(/\s+/).filter(Boolean).length;
            const addedCount = diffResult.filter(d => d.type === 'added' && d.text.trim()).length;
            const removedCount = diffResult.filter(d => d.type === 'removed' && d.text.trim()).length;

            return e('div', {
              style: {
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'var(--bg-1)',
                border: '2px solid var(--bronze)',
                borderRadius: '8px',
                padding: '24px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                maxWidth: '90%',
                width: '700px',
                maxHeight: '85%',
                overflow: 'auto',
                zIndex: 200
              }
            },
              // Header with instruction and stats
              e('div', {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '16px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--border-color)'
                }
              },
                e('div', null,
                  e('div', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px',
                      color: 'var(--text-3)',
                      marginBottom: '4px'
                    }
                  }, '🎤 ÄÄNIOHJE:'),
                  e('h3', {
                    style: {
                      fontFamily: 'EB Garamond',
                      fontSize: '18px',
                      color: 'var(--bronze)',
                      margin: 0
                    }
                  }, `"${voiceDiffView.instruction}"`)
                ),
                e('div', {
                  style: {
                    display: 'flex',
                    gap: '12px',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px'
                  }
                },
                  e('span', { style: { color: '#4CAF50' } }, `+${addedCount}`),
                  e('span', { style: { color: '#f44336' } }, `-${removedCount}`),
                  e('span', { style: { color: 'var(--text-2)' } },
                    `${newWords - origWords > 0 ? '+' : ''}${newWords - origWords} sanaa`
                  )
                )
              ),

              // Side-by-side comparison
              e('div', {
                style: {
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                  marginBottom: '20px'
                }
              },
                // Original text
                e('div', {
                  style: {
                    padding: '12px',
                    background: 'var(--bg-2)',
                    borderRadius: '4px',
                    border: '1px solid var(--border-color)'
                  }
                },
                  e('div', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px',
                      color: 'var(--text-3)',
                      marginBottom: '8px',
                      display: 'flex',
                      justifyContent: 'space-between'
                    }
                  },
                    e('span', null, '📄 ALKUPERÄINEN'),
                    e('span', null, `${origWords} sanaa`)
                  ),
                  e('div', {
                    style: {
                      fontFamily: 'EB Garamond',
                      fontSize: '15px',
                      color: 'var(--text-2)',
                      lineHeight: '1.7'
                    }
                  }, voiceDiffView.original)
                ),

                // Revised text with diff highlighting
                e('div', {
                  style: {
                    padding: '12px',
                    background: 'var(--bronze)' + '11',
                    borderRadius: '4px',
                    border: '1px solid var(--bronze)'
                  }
                },
                  e('div', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px',
                      color: 'var(--bronze)',
                      marginBottom: '8px',
                      display: 'flex',
                      justifyContent: 'space-between'
                    }
                  },
                    e('span', null, '✨ UUSI VERSIO'),
                    e('span', null, `${newWords} sanaa`)
                  ),
                  e('div', {
                    style: {
                      fontFamily: 'EB Garamond',
                      fontSize: '15px',
                      lineHeight: '1.7'
                    }
                  },
                    // Render with diff highlighting
                    ...diffResult.map((part, idx) => {
                      if (part.type === 'same') {
                        return e('span', { key: idx, style: { color: 'var(--text)' } }, part.text);
                      } else if (part.type === 'added') {
                        return e('span', {
                          key: idx,
                          style: {
                            background: '#4CAF5044',
                            color: '#4CAF50',
                            borderRadius: '2px',
                            padding: '0 2px'
                          }
                        }, part.text);
                      } else if (part.type === 'removed') {
                        return e('span', {
                          key: idx,
                          style: {
                            background: '#f4433633',
                            color: '#f44336',
                            textDecoration: 'line-through',
                            borderRadius: '2px',
                            padding: '0 2px'
                          }
                        }, part.text);
                      }
                      return null;
                    })
                  )
                )
              ),

              // Actions
              e('div', {
                style: {
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end'
                }
              },
                e('button', {
                  onClick: rejectVoiceEdit,
                  style: {
                    padding: '10px 20px',
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-2)',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px'
                  }
                }, '❌ Hylkää'),
                e('button', {
                  onClick: acceptVoiceEdit,
                  style: {
                    padding: '10px 20px',
                    background: 'var(--bronze)',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#000',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px',
                    fontWeight: 600
                  }
                }, '✓ Hyväksy muutos')
              )
            );
          })() : null
        )
      ),

        // Split View Secondary Pane (shown when split view is enabled, only in editor mode not corkboard)
        !corkboardEnabled && splitViewEnabled && splitViewChapter && e('div', {
          className: 'faust-editor faust-editor-split',
          style: {
            flex: 1,
            position: 'relative',
            background: 'var(--paper)',
            borderLeft: '1px solid var(--border-color)'
          }
        },
          // Split view header with selector
          e('div', {
            style: {
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }
          },
            // View type selector
            e('select', {
              value: splitViewType,
              onChange: (ev) => setSplitViewType(ev.target.value),
              style: {
                background: 'var(--bg-2)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                padding: '4px 8px',
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                cursor: 'pointer'
              }
            },
              e('option', { value: 'chapter' }, 'Luku'),
              e('option', { value: 'character' }, 'Hahmo'),
              e('option', { value: 'location' }, 'Paikka'),
              e('option', { value: 'outline' }, 'Synopsis')
            ),

            // Chapter/item selector (depends on type)
            splitViewType === 'chapter' && e('select', {
              value: splitViewChapterId || '',
              onChange: (ev) => setSplitViewChapterId(ev.target.value),
              style: {
                flex: 1,
                background: 'var(--bg-2)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                padding: '4px 8px',
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                cursor: 'pointer'
              }
            },
              project.structure.map(ch =>
                e('option', { key: ch.id, value: ch.id }, ch.title || `Luku ${project.structure.indexOf(ch) + 1}`)
              )
            ),

            splitViewType === 'character' && e('select', {
              value: splitViewChapterId || '',
              onChange: (ev) => setSplitViewChapterId(ev.target.value),
              style: {
                flex: 1,
                background: 'var(--bg-2)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                padding: '4px 8px',
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                cursor: 'pointer'
              }
            },
              (project.characters || []).length === 0
                ? e('option', { value: '' }, 'Ei hahmoja')
                : (project.characters || []).map(char =>
                    e('option', { key: char.id, value: char.id }, char.name)
                  )
            ),

            splitViewType === 'location' && e('select', {
              value: splitViewChapterId || '',
              onChange: (ev) => setSplitViewChapterId(ev.target.value),
              style: {
                flex: 1,
                background: 'var(--bg-2)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                padding: '4px 8px',
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                cursor: 'pointer'
              }
            },
              (project.locations || []).length === 0
                ? e('option', { value: '' }, 'Ei paikkoja')
                : (project.locations || []).map(loc =>
                    e('option', { key: loc.id, value: loc.id }, loc.name)
                  )
            ),

            // Close button
            e('button', {
              onClick: () => setSplitViewEnabled(false),
              title: 'Sulje jaettu näkymä',
              style: {
                background: 'transparent',
                border: 'none',
                color: 'var(--text-2)',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '4px'
              }
            }, '×')
          ),

          // Split view content area
          e('div', {
            className: 'faust-editor-content',
            style: {
              padding: '24px',
              overflow: 'auto',
              height: 'calc(100% - 50px)'
            }
          },
            // Chapter view
            splitViewType === 'chapter' && splitViewChapter && e('div', null,
              e('h2', {
                style: {
                  fontFamily: 'EB Garamond',
                  fontSize: '24px',
                  color: 'var(--ink)',
                  marginBottom: '8px'
                }
              }, splitViewChapter.title || 'Nimetön luku'),
              e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-3)',
                  marginBottom: '16px'
                }
              }, `${splitViewChapter.wordCount || 0} sanaa • ${splitViewChapter.status || 'draft'}`),
              e('div', {
                style: {
                  fontFamily: 'EB Garamond',
                  fontSize: '16px',
                  lineHeight: '1.8',
                  color: 'var(--ink)',
                  whiteSpace: 'pre-wrap'
                }
              }, splitViewChapter.content || 'Ei sisältöä')
            ),

            // Character view
            splitViewType === 'character' && (() => {
              const char = (project.characters || []).find(c => c.id === splitViewChapterId);
              if (!char) return e('div', { style: { color: 'var(--text-3)' } }, 'Valitse hahmo');
              return e('div', null,
                e('h2', {
                  style: {
                    fontFamily: 'EB Garamond',
                    fontSize: '24px',
                    color: 'var(--ink)',
                    marginBottom: '16px'
                  }
                }, char.name),
                char.age && e('div', { style: { marginBottom: '8px', color: 'var(--text-2)', fontFamily: 'IBM Plex Mono', fontSize: '12px' } }, `Ikä: ${char.age}`),
                char.occupation && e('div', { style: { marginBottom: '8px', color: 'var(--text-2)', fontFamily: 'IBM Plex Mono', fontSize: '12px' } }, `Ammatti: ${char.occupation}`),
                char.description && e('div', {
                  style: { marginTop: '16px', marginBottom: '16px' }
                },
                  e('h4', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--bronze)', marginBottom: '8px' } }, 'Kuvaus'),
                  e('p', { style: { fontFamily: 'EB Garamond', fontSize: '14px', lineHeight: '1.6', color: 'var(--ink)' } }, char.description)
                ),
                char.background && e('div', {
                  style: { marginBottom: '16px' }
                },
                  e('h4', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--bronze)', marginBottom: '8px' } }, 'Tausta'),
                  e('p', { style: { fontFamily: 'EB Garamond', fontSize: '14px', lineHeight: '1.6', color: 'var(--ink)' } }, char.background)
                ),
                char.archetypal && char.archetypal.primaryArchetype && e('div', {
                  style: { marginBottom: '16px' }
                },
                  e('h4', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--bronze)', marginBottom: '8px' } }, 'Arkkityyppi'),
                  e('p', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text)' } }, char.archetypal.primaryArchetype)
                ),
                char.notes && e('div', {
                  style: { marginTop: '16px', padding: '12px', background: 'var(--bg-2)', borderRadius: '4px' }
                },
                  e('h4', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'Muistiinpanot'),
                  e('p', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', whiteSpace: 'pre-wrap' } }, char.notes)
                )
              );
            })(),

            // Location view
            splitViewType === 'location' && (() => {
              const loc = (project.locations || []).find(l => l.id === splitViewChapterId);
              if (!loc) return e('div', { style: { color: 'var(--text-3)' } }, 'Valitse paikka');
              return e('div', null,
                e('h2', {
                  style: {
                    fontFamily: 'EB Garamond',
                    fontSize: '24px',
                    color: 'var(--ink)',
                    marginBottom: '16px'
                  }
                }, loc.name),
                loc.type && e('div', { style: { marginBottom: '8px', color: 'var(--text-2)', fontFamily: 'IBM Plex Mono', fontSize: '12px' } }, `Tyyppi: ${loc.type}`),
                loc.atmosphere && e('div', { style: { marginBottom: '8px', color: 'var(--text-2)', fontFamily: 'IBM Plex Mono', fontSize: '12px' } }, `Tunnelma: ${loc.atmosphere}`),
                loc.description && e('div', {
                  style: { marginTop: '16px', marginBottom: '16px' }
                },
                  e('h4', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--bronze)', marginBottom: '8px' } }, 'Kuvaus'),
                  e('p', { style: { fontFamily: 'EB Garamond', fontSize: '14px', lineHeight: '1.6', color: 'var(--ink)' } }, loc.description)
                ),
                loc.sensoryDetails && e('div', {
                  style: { marginBottom: '16px' }
                },
                  e('h4', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--bronze)', marginBottom: '8px' } }, 'Aistihavainnot'),
                  loc.sensoryDetails.visual && e('p', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' } }, `👁 ${loc.sensoryDetails.visual}`),
                  loc.sensoryDetails.auditory && e('p', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' } }, `👂 ${loc.sensoryDetails.auditory}`),
                  loc.sensoryDetails.olfactory && e('p', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' } }, `👃 ${loc.sensoryDetails.olfactory}`)
                ),
                loc.notes && e('div', {
                  style: { marginTop: '16px', padding: '12px', background: 'var(--bg-2)', borderRadius: '4px' }
                },
                  e('h4', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'Muistiinpanot'),
                  e('p', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', whiteSpace: 'pre-wrap' } }, loc.notes)
                )
              );
            })(),

            // Outline/Synopsis view
            splitViewType === 'outline' && e('div', null,
              e('h2', {
                style: {
                  fontFamily: 'EB Garamond',
                  fontSize: '24px',
                  color: 'var(--ink)',
                  marginBottom: '16px'
                }
              }, 'Lukujen synopsikset'),
              project.structure.map((ch, idx) =>
                e('div', {
                  key: ch.id,
                  style: {
                    marginBottom: '16px',
                    padding: '12px',
                    background: ch.id === activeChapterId ? 'rgba(143,122,83,0.1)' : 'transparent',
                    borderLeft: ch.id === activeChapterId ? '3px solid var(--bronze)' : '3px solid transparent',
                    borderRadius: '4px'
                  }
                },
                  e('h4', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '12px',
                      color: 'var(--bronze)',
                      marginBottom: '4px'
                    }
                  }, `${idx + 1}. ${ch.title || 'Nimetön'}`),
                  e('p', {
                    style: {
                      fontFamily: 'EB Garamond',
                      fontSize: '13px',
                      color: 'var(--text-2)',
                      lineHeight: '1.5'
                    }
                  }, ch.synopsis || ch.synopsisAI || '(Ei synopsista)')
                )
              )
            )
          )
        )
      ),

      // Right inspector (hidden by default)
      showInspector && e('div', { className: inspectorCollapsed ? 'faust-inspector collapsed' : 'faust-inspector visible' },
        // Collapse button (always visible on right edge)
        e('button', {
          onClick: () => setInspectorCollapsed(!inspectorCollapsed),
          title: inspectorCollapsed ? 'Expand Inspector' : 'Collapse Inspector',
          style: {
            position: 'absolute',
            top: '12px',
            right: inspectorCollapsed ? '4px' : '268px', // From right edge, not left
            width: inspectorCollapsed ? '32px' : '24px',
            height: '24px',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text-2)',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            zIndex: 10
          }
        }, inspectorCollapsed ? '→' : '←'), // Swapped arrows for right-side positioning

        !inspectorCollapsed && e('div', { style: { padding: '16px', color: 'var(--text)' } },
          e('h3', { style: { fontFamily: 'EB Garamond', fontSize: '16px', marginBottom: '12px' } }, 'Inspector'),

          // Tab Navigation
          e('div', {
            style: {
              display: 'flex',
              gap: '4px',
              marginBottom: '16px',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '8px'
            }
          },
            ['editor', 'chapter', 'project', 'ai'].map(tab =>
              e('button', {
                key: tab,
                onClick: () => setInspectorTab(tab),
                style: {
                  flex: 1,
                  padding: '6px 8px',
                  background: inspectorTab === tab ? 'var(--bg-2)' : 'transparent',
                  border: inspectorTab === tab ? '1px solid var(--bronze)' : '1px solid var(--border-color)',
                  borderBottom: inspectorTab === tab ? '2px solid var(--bronze)' : '1px solid var(--border-color)',
                  borderRadius: '4px 4px 0 0',
                  color: inspectorTab === tab ? 'var(--text)' : 'var(--text-3)',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  fontWeight: inspectorTab === tab ? 600 : 400,
                  transition: 'all 0.2s'
                }
              }, {
                'editor': 'Editor',
                'chapter': 'Chapter',
                'project': 'Project',
                'ai': 'AI'
              }[tab])
            )
          ),

          // EDITOR TAB
          inspectorTab === 'editor' && e('div', { style: { marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '12px', textTransform: 'uppercase' } }, 'Editor Controls'),

            // Font selector
            e('div', { style: { marginBottom: '16px' } },
              e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' } }, 'Fontti:'),
              e('select', {
                value: editorFont,
                onChange: (ev) => setEditorFont(ev.target.value),
                style: {
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px'
                }
              },
                e('option', { value: 'EB Garamond' }, 'EB Garamond'),
                e('option', { value: 'Georgia' }, 'Georgia'),
                e('option', { value: 'SF Pro' }, 'SF Pro'),
                e('option', { value: 'Times' }, 'Times'),
                e('option', { value: 'Palatino' }, 'Palatino'),
                e('option', { value: 'Courier' }, 'Courier')
              )
            ),

            // Text alignment
            e('div', { style: { marginBottom: '16px' } },
              e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' } }, 'Tasaus:'),
              e('div', { style: { display: 'flex', gap: '4px' } },
                ['left', 'center', 'right', 'justify'].map(align =>
                  e('button', {
                    key: align,
                    onClick: () => setTextAlign(align),
                    title: { left: 'Vasen', center: 'Keskitetty', right: 'Oikea', justify: 'Tasattu' }[align],
                    style: {
                      flex: 1,
                      padding: '6px',
                      background: textAlign === align ? 'var(--sigil)' : 'transparent',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      color: textAlign === align ? '#000' : 'var(--text-2)',
                      cursor: 'pointer',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '10px',
                      transition: 'all 0.2s'
                    }
                  }, { left: '⬅️', center: '↔️', right: '➡️', justify: '⬌' }[align])
                )
              )
            ),

            // Line spacing
            e('div', { style: { marginBottom: '16px' } },
              e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' } }, 'Riviväli:'),
              e('select', {
                value: lineSpacing,
                onChange: (ev) => setLineSpacing(ev.target.value),
                style: {
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px'
                }
              },
                e('option', { value: '1.0' }, '1.0'),
                e('option', { value: '1.15' }, '1.15'),
                e('option', { value: '1.5' }, '1.5'),
                e('option', { value: '1.8' }, '1.8 (oletus)'),
                e('option', { value: '2.0' }, '2.0')
              )
            ),

            // Zoom
            e('div', { style: { marginBottom: '16px' } },
              e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' } }, 'Zoomaus:'),
              e('select', {
                value: editorZoom,
                onChange: (ev) => setEditorZoom(ev.target.value),
                style: {
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px'
                }
              },
                e('option', { value: '80' }, '80%'),
                e('option', { value: '90' }, '90%'),
                e('option', { value: '100' }, '100% (oletus)'),
                e('option', { value: '110' }, '110%'),
                e('option', { value: '120' }, '120%')
              )
            ),

            // Paragraph spacing
            e('div', { style: { marginBottom: '8px' } },
              e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' } }, 'Kappaleväli:'),
              e('select', {
                value: paragraphSpacing,
                onChange: (ev) => setParagraphSpacing(ev.target.value),
                style: {
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px'
                }
              },
                e('option', { value: '1.0' }, 'Normaali'),
                e('option', { value: '1.5' }, 'Keskisuuri (oletus)'),
                e('option', { value: '2.0' }, 'Suuri')
              )
            )
          ),

          // CHAPTER TAB
          inspectorTab === 'chapter' && activeChapter && e('div', { style: { marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '12px', textTransform: 'uppercase' } }, 'Chapter Metadata'),

            // Status
            e('div', { style: { marginBottom: '16px' } },
              e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' } }, 'Status:'),
              e('select', {
                value: activeChapter.status || 'plan',
                onChange: (ev) => {
                  setProject(prev => ({
                    ...prev,
                    structure: prev.structure.map(ch =>
                      ch.id === activeChapter.id ? { ...ch, status: ev.target.value } : ch
                    )
                  }));
                  setUnsavedChanges(true);
                },
                style: {
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px'
                }
              },
                e('option', { value: 'plan' }, '📋 Plan'),
                e('option', { value: 'draft' }, '✍️ Draft'),
                e('option', { value: 'revision' }, '🔄 Revision'),
                e('option', { value: 'final' }, '✅ Final')
              )
            ),

            // POV Character
            e('div', { style: { marginBottom: '16px' } },
              e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' } }, 'POV Character:'),
              e('select', {
                value: activeChapter.povCharacter || '',
                onChange: (ev) => {
                  setProject(prev => ({
                    ...prev,
                    structure: prev.structure.map(ch =>
                      ch.id === activeChapter.id ? { ...ch, povCharacter: ev.target.value || null } : ch
                    )
                  }));
                  setUnsavedChanges(true);
                },
                style: {
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px'
                }
              },
                e('option', { value: '' }, '— None —'),
                project.characters.map(char =>
                  e('option', {
                    key: char.id || char.name,
                    value: char.id || char.name
                  }, char.basicInfo?.name || char.name || 'Unnamed')
                )
              )
            ),

            // Story Timestamp
            e('div', { style: { marginBottom: '16px' } },
              e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' } }, 'Story Time:'),
              e('input', {
                type: 'text',
                value: activeChapter.storyTimestamp || '',
                onChange: (ev) => {
                  setProject(prev => ({
                    ...prev,
                    structure: prev.structure.map(ch =>
                      ch.id === activeChapter.id ? { ...ch, storyTimestamp: ev.target.value } : ch
                    )
                  }));
                  setUnsavedChanges(true);
                },
                placeholder: 'e.g., Day 3, Morning',
                style: {
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px'
                }
              })
            ),

            // Mood/Tone
            e('div', { style: { marginBottom: '16px' } },
              e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' } }, 'Mood/Tone:'),
              e('input', {
                type: 'text',
                value: activeChapter.mood || '',
                onChange: (ev) => {
                  setProject(prev => ({
                    ...prev,
                    structure: prev.structure.map(ch =>
                      ch.id === activeChapter.id ? { ...ch, mood: ev.target.value } : ch
                    )
                  }));
                  setUnsavedChanges(true);
                },
                placeholder: 'e.g., Tense, Melancholic',
                style: {
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px'
                }
              })
            ),

            // Custom Notes
            e('div', { style: { marginBottom: '8px' } },
              e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' } }, 'Notes:'),
              e('textarea', {
                value: activeChapter.notes || '',
                onChange: (ev) => {
                  setProject(prev => ({
                    ...prev,
                    structure: prev.structure.map(ch =>
                      ch.id === activeChapter.id ? { ...ch, notes: ev.target.value } : ch
                    )
                  }));
                  setUnsavedChanges(true);
                },
                placeholder: 'Chapter notes...',
                style: {
                  width: '100%',
                  minHeight: '60px',
                  padding: '6px 8px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  resize: 'vertical'
                }
              })
            ),

            // Open ChapterSheet button
            e('button', {
              onClick: () => setShowChapterSheetModal(true),
              style: {
                width: '100%',
                padding: '10px',
                marginTop: '16px',
                background: 'var(--bronze)',
                border: 'none',
                borderRadius: '4px',
                color: '#000',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                fontWeight: 600
              }
            }, '📋 Open Chapter Sheet')
          ),

          // PROJECT TAB
          inspectorTab === 'project' && e('div', { style: { marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '12px', textTransform: 'uppercase' } }, 'Project Info'),
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-2)', marginBottom: '4px' } },
              `Genre: ${project.genre}`),

            // Language selector
            e('div', { style: { marginBottom: '8px' } },
              e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' } }, 'Tarinan kieli:'),
              e('select', {
                value: project.language || 'fi',
                onChange: (ev) => {
                  setProject(prev => ({
                    ...prev,
                    language: ev.target.value
                  }));
                  setUnsavedChanges(true);
                },
                style: {
                  width: '100%',
                  padding: '6px 8px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px'
                }
              },
                e('option', { value: 'fi' }, '🇫🇮 Suomi'),
                e('option', { value: 'en' }, '🇬🇧 English')
              )
            ),

            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-2)', marginBottom: '4px' } },
              `Tavoite: ${project.targets.totalWords} sanaa`),
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-2)' } },
              `Edistyminen: ${Math.round(project.targets.currentTotal / project.targets.totalWords * 100)}%`)
          ),

          // AI TAB
          inspectorTab === 'ai' && e('div', { style: { marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '12px', textTransform: 'uppercase' } }, 'AI Writing Mode'),

            // Mode selector buttons
            e('div', { style: { display: 'flex', gap: '4px', marginBottom: '16px' } },
              Object.keys(project.ai.modes).map(modeName =>
                e('button', {
                  key: modeName,
                  onClick: () => setAIMode(modeName),
                  style: {
                    flex: 1,
                    padding: '6px',
                    background: project.ai.currentMode === modeName ? project.ai.modes[modeName].color : 'transparent',
                    border: `1px solid ${project.ai.modes[modeName].color}`,
                    borderRadius: '4px',
                    color: project.ai.currentMode === modeName ? '#000' : 'var(--text-2)',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '10px',
                    fontWeight: project.ai.currentMode === modeName ? 600 : 400,
                    transition: 'all 0.2s'
                  }
                }, project.ai.modes[modeName].name)
              )
            ),

            // Current mode info
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-2)', marginBottom: '4px' } },
              `Lämpötila: ${getCurrentMode().temperature}`),
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', fontStyle: 'italic' } },
              getCurrentMode().useCase)
          ),

          // Continue Writing (HybridWritingFlow)
          activeChapter && hybridFlowRef.current && e('div', { style: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'HYBRID WRITING'),

            e('button', {
              onClick: () => setShowContinueDialog(true),
              disabled: !activeChapter.content || activeChapter.content.trim().length === 0,
              style: {
                width: '100%',
                padding: '10px',
                background: activeChapter.content && activeChapter.content.trim().length > 0 ? 'var(--sigil)' : 'var(--bg-2)',
                border: 'none',
                borderRadius: '4px',
                color: activeChapter.content && activeChapter.content.trim().length > 0 ? '#000' : 'var(--text-3)',
                cursor: activeChapter.content && activeChapter.content.trim().length > 0 ? 'pointer' : 'not-allowed',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                fontWeight: 600
              }
            }, '✍️ Continue Writing'),

            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)', marginTop: '8px', fontStyle: 'italic' } },
              'AI jatkaa kirjoittamista tekstisi lopusta')
          ),

          // AI Provider
          e('div', { style: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'AI PROVIDER'),

            // Provider selector buttons with API key input
            e('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' } },
              ['anthropic', 'openai', 'deepseek', 'grok'].map(providerName => {
                const labels = {
                  anthropic: 'Claude (Anthropic)',
                  openai: 'GPT-4 (OpenAI)',
                  deepseek: 'DeepSeek',
                  grok: 'Grok (xAI)'
                };
                const isActive = (project.ai.provider || 'anthropic') === providerName;
                const showInput = showApiKeyInput === providerName;

                const hasKey = apiKeysStatus[providerName];

                return e('div', { key: providerName, style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                  // Provider button (click to select AND open API input)
                  e('button', {
                    onClick: () => {
                      setAIProvider(providerName);
                      toggleApiKeyInput(providerName);
                    },
                    style: {
                      width: '100%',
                      padding: '8px 12px',
                      background: isActive ? 'var(--sigil)' : 'transparent',
                      border: `1px solid ${isActive ? 'var(--sigil)' : 'var(--border-color)'}`,
                      borderRadius: '4px',
                      color: isActive ? '#000' : 'var(--text-2)',
                      cursor: 'pointer',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px',
                      fontWeight: isActive ? 600 : 400,
                      textAlign: 'left',
                      transition: 'all 0.2s',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }
                  },
                    e('span', null, labels[providerName]),
                    e('span', { style: { fontSize: '14px' } },
                      hasKey ? '✅' : '❌'
                    )
                  ),

                  // API key input (shown when clicked)
                  showInput && e('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px', background: 'var(--bg-2)', borderRadius: '4px', border: '1px solid var(--border-color)' } },
                    e('input', {
                      type: 'password',
                      placeholder: 'API-avain...',
                      value: apiKeyInputValue,
                      onChange: (ev) => setApiKeyInputValue(ev.target.value),
                      style: {
                        padding: '6px 8px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        color: 'var(--text)',
                        fontFamily: 'IBM Plex Mono',
                        fontSize: '11px'
                      }
                    }),
                    e('div', { style: { display: 'flex', gap: '4px' } },
                      e('button', {
                        onClick: () => saveApiKey(providerName, apiKeyInputValue),
                        disabled: !apiKeyInputValue.trim(),
                        style: {
                          flex: 1,
                          padding: '4px 8px',
                          background: apiKeyInputValue.trim() ? 'var(--sigil)' : 'var(--bg-2)',
                          border: '1px solid var(--sigil)',
                          borderRadius: '4px',
                          color: apiKeyInputValue.trim() ? '#000' : 'var(--text-3)',
                          cursor: apiKeyInputValue.trim() ? 'pointer' : 'not-allowed',
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '10px',
                          fontWeight: 600
                        }
                      }, 'Tallenna'),
                      e('button', {
                        onClick: () => toggleApiKeyInput(providerName),
                        style: {
                          padding: '4px 8px',
                          background: 'transparent',
                          border: '1px solid var(--border-color)',
                          borderRadius: '4px',
                          color: 'var(--text-2)',
                          cursor: 'pointer',
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '10px'
                        }
                      }, 'Peruuta')
                    )
                  )
                );
              })
            ),

            // Current provider info
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)', fontStyle: 'italic' } },
              'Oletusprovider kaikille toiminnoille'),

            // Advanced: Per-function providers
            e('details', { style: { marginTop: '12px' } },
              e('summary', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '10px',
                  color: 'var(--sigil)',
                  cursor: 'pointer',
                  userSelect: 'none',
                  marginBottom: '8px'
                }
              }, '▸ Toimintokohtaiset providerit'),

              e('div', { style: { marginTop: '8px', padding: '8px', background: 'var(--bg-2)', borderRadius: '4px', border: '1px solid var(--border-color)' } },
                // Generation provider
                e('div', { style: { marginBottom: '8px' } },
                  e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)', marginBottom: '4px' } }, 'Luku-generointi:'),
                  e('select', {
                    value: project.ai.providers?.generation || 'anthropic',
                    onChange: (ev) => {
                      setProject(prev => ({
                        ...prev,
                        ai: {
                          ...prev.ai,
                          providers: {
                            ...prev.ai.providers,
                            generation: ev.target.value
                          }
                        }
                      }));
                      setUnsavedChanges(true);
                    },
                    style: {
                      width: '100%',
                      padding: '4px 8px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      color: 'var(--text)',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px'
                    }
                  },
                    e('option', { value: 'anthropic' }, 'Claude (Anthropic)'),
                    e('option', { value: 'openai' }, 'GPT-4 (OpenAI)'),
                    e('option', { value: 'deepseek' }, 'DeepSeek'),
                    e('option', { value: 'grok' }, 'Grok (xAI)')
                  )
                ),

                // Continuity provider
                e('div', { style: { marginBottom: '8px' } },
                  e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)', marginBottom: '4px' } }, 'Jatkuvuustarkistus:'),
                  e('select', {
                    value: project.ai.providers?.continuity || 'anthropic',
                    onChange: (ev) => {
                      setProject(prev => ({
                        ...prev,
                        ai: {
                          ...prev.ai,
                          providers: {
                            ...prev.ai.providers,
                            continuity: ev.target.value
                          }
                        }
                      }));
                      setUnsavedChanges(true);
                    },
                    style: {
                      width: '100%',
                      padding: '4px 8px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      color: 'var(--text)',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px'
                    }
                  },
                    e('option', { value: 'anthropic' }, 'Claude (Anthropic)'),
                    e('option', { value: 'openai' }, 'GPT-4 (OpenAI)'),
                    e('option', { value: 'deepseek' }, 'DeepSeek'),
                    e('option', { value: 'grok' }, 'Grok (xAI)')
                  )
                ),

                // Analysis provider
                e('div', { style: { marginBottom: '0' } },
                  e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)', marginBottom: '4px' } }, 'Laatuanalyysi:'),
                  e('select', {
                    value: project.ai.providers?.analysis || 'anthropic',
                    onChange: (ev) => {
                      setProject(prev => ({
                        ...prev,
                        ai: {
                          ...prev.ai,
                          providers: {
                            ...prev.ai.providers,
                            analysis: ev.target.value
                          }
                        }
                      }));
                      setUnsavedChanges(true);
                    },
                    style: {
                      width: '100%',
                      padding: '4px 8px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      color: 'var(--text)',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px'
                    }
                  },
                    e('option', { value: 'anthropic' }, 'Claude (Anthropic)'),
                    e('option', { value: 'openai' }, 'GPT-4 (OpenAI)'),
                    e('option', { value: 'deepseek' }, 'DeepSeek'),
                    e('option', { value: 'grok' }, 'Grok (xAI)')
                  )
                ),

                e('div', { style: { marginTop: '8px', fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-3)', fontStyle: 'italic' } },
                  '💡 Voit käyttää eri malleja eri toiminnoille (esim. DeepSeek generointi, Claude jatkuvuus)')
              )
            )
          ),

          // Batch Generation
          e('div', { style: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'BATCH GENERATION'),

            // Cost estimation
            costOptimizerRef.current && e('div', { style: { marginBottom: '12px', padding: '8px', background: 'var(--bg-2)', borderRadius: '4px', border: '1px solid var(--border-color)' } },
              e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)', marginBottom: '4px' } }, 'KUSTANNUSARVIO'),
              e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-2)' } },
                `Provider: ${project.ai.provider || 'anthropic'}`),
              e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-2)' } },
                `Luvut: ${project.structure.length}`),
              e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--sigil)', marginTop: '4px', fontWeight: 600 } },
                `Arvioitu: $${costOptimizerRef.current.estimateGenerationCost(project.structure.length).estimatedCost.toFixed(4)}`)
            ),

            // Generate All Chapters button
            e('button', {
              onClick: () => {
                if (confirm(`Haluatko generoida kaikki ${project.structure.length} lukua AI:lla?\n\nArvioitu hinta: $${costOptimizerRef.current?.estimateGenerationCost(project.structure.length).estimatedCost.toFixed(4) || 'N/A'}`)) {
                  generateAllChapters();
                }
              },
              disabled: isGenerating || !batchProcessorRef.current,
              style: {
                width: '100%',
                padding: '12px',
                background: isGenerating || !batchProcessorRef.current ? 'var(--bg-2)' : 'var(--sigil)',
                border: `1px solid var(--sigil)`,
                borderRadius: '4px',
                color: isGenerating || !batchProcessorRef.current ? 'var(--text-3)' : '#000',
                cursor: isGenerating || !batchProcessorRef.current ? 'not-allowed' : 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                fontWeight: 600,
                opacity: isGenerating || !batchProcessorRef.current ? 0.5 : 1
              }
            }, isGenerating ? '⏳ Generoidaan...' : '🚀 Generoi Kaikki Luvut'),

            // Total cost tracking
            costOptimizerRef.current && costOptimizerRef.current.getStats().totalSpent > 0 && e('div', {
              style: {
                marginTop: '12px',
                padding: '8px',
                background: 'rgba(255,193,7,0.1)',
                borderRadius: '4px',
                border: '1px solid rgba(255,193,7,0.3)'
              }
            },
              e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)', marginBottom: '4px' } }, 'YHTEENSÄ KÄYTETTY'),
              e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '13px', color: '#FFA726', fontWeight: 600 } },
                `$${costOptimizerRef.current.getStats().totalSpent.toFixed(4)}`),
              e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)', marginTop: '2px' } },
                `${costOptimizerRef.current.getStats().totalRequests} pyyntöä`)
            )
          ),

          // AI Cost Tracking
          costOptimizerRef.current && e('div', { style: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              e('span', null, 'AI COST TRACKING'),
              e('button', {
                onClick: () => {
                  if (confirm('Nollataanko kustannusseuranta? Tämä ei vaikuta projektiin, vain tilastoihin.')) {
                    costOptimizerRef.current.reset();
                    setProject({ ...project });
                  }
                },
                style: {
                  padding: '2px 6px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '3px',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '9px'
                }
              }, 'Nollaa')
            ),

            // Overall stats
            (() => {
              const stats = costOptimizerRef.current.getStats();
              return e('div', { style: { marginBottom: '12px', padding: '10px', background: 'var(--bg-2)', borderRadius: '4px', border: '1px solid var(--border-color)' } },
                // Total spent (highlighted)
                e('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' } },
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-2)' } }, 'Kokonaiskustannus:'),
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '14px', color: '#4CAF50', fontWeight: 600 } },
                    `$${stats.totalSpent.toFixed(4)}`)
                ),

                // Request count
                e('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } }, 'Pyyntöjä:'),
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-2)' } },
                    stats.totalRequests.toLocaleString())
                ),

                // Token count
                e('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } }, 'Tokeneita:'),
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-2)' } },
                    stats.totalTokens.toLocaleString())
                ),

                // Average per request
                e('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' } },
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } }, 'Keskiarvo/pyyntö:'),
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: '#FFA726' } },
                    `$${stats.averageCostPerRequest.toFixed(4)}`)
                )
              );
            })(),

            // By provider breakdown
            (() => {
              const stats = costOptimizerRef.current.getStats();
              const providers = Object.keys(stats.byProvider || {});

              if (providers.length === 0) {
                return null;
              }

              return e('details', { style: { marginTop: '8px' } },
                e('summary', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '10px',
                    color: 'var(--sigil)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    marginBottom: '8px'
                  }
                }, `▸ Kustannukset providereittain (${providers.length})`),

                e('div', { style: { marginTop: '8px' } },
                  providers.map(provider => {
                    const providerStats = stats.byProvider[provider];
                    const providerLabels = {
                      anthropic: 'Claude',
                      openai: 'OpenAI',
                      deepseek: 'DeepSeek',
                      grok: 'Grok'
                    };

                    return e('div', {
                      key: provider,
                      style: {
                        marginBottom: '8px',
                        padding: '8px',
                        background: 'var(--bg-2)',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)'
                      }
                    },
                      // Provider name and cost
                      e('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
                        e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 600, color: 'var(--text)' } },
                          providerLabels[provider] || provider),
                        e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: '#4CAF50', fontWeight: 600 } },
                          `$${providerStats.cost.toFixed(4)}`)
                      ),

                      // Requests and tokens
                      e('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                        e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-3)' } },
                          `${providerStats.requests} pyyntöä`),
                        e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-3)' } },
                          `${providerStats.tokens.toLocaleString()} tokenia`)
                      )
                    );
                  })
                )
              );
            })()
          ),

          // Story Continuity Tracker
          continuityTrackerRef.current && e('div', { style: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'STORY CONTINUITY'),

            // Stats overview
            (() => {
              const cont = project.continuity || { characters: {}, locations: {}, timeline: [], facts: [] };
              const numCharacters = Object.keys(cont.characters || {}).length;
              const numLocations = Object.keys(cont.locations || {}).length;
              const numEvents = (cont.timeline || []).length;
              const numFacts = (cont.facts || []).length;

              return e('div', { style: { marginBottom: '12px', padding: '10px', background: 'var(--bg-2)', borderRadius: '4px', border: '1px solid var(--border-color)' } },
                e('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } }, 'Tracked characters:'),
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-2)', fontWeight: 600 } },
                    numCharacters)
                ),
                e('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } }, 'Tracked locations:'),
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-2)', fontWeight: 600 } },
                    numLocations)
                ),
                e('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } },
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } }, 'Timeline events:'),
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-2)', fontWeight: 600 } },
                    numEvents)
                ),
                e('div', { style: { display: 'flex', justifyContent: 'space-between' } },
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } }, 'Story facts:'),
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-2)', fontWeight: 600 } },
                    numFacts)
                )
              );
            })(),

            // Quick action buttons
            e('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } },
              Object.keys(project.continuity?.locations || {}).length > 0 && e('button', {
                onClick: () => setShowLocationSheet(true),
                style: {
                  flex: 1,
                  padding: '6px',
                  background: 'transparent',
                  border: '1px solid var(--sigil)',
                  borderRadius: '4px',
                  color: 'var(--sigil)',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '10px'
                }
              }, `📍 Locations (${Object.keys(project.continuity?.locations || {}).length})`),

              (project.plotThreads || []).length > 0 && e('button', {
                onClick: () => setShowThreadSheet(true),
                style: {
                  flex: 1,
                  padding: '6px',
                  background: 'transparent',
                  border: '1px solid var(--sigil)',
                  borderRadius: '4px',
                  color: 'var(--sigil)',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '10px'
                }
              }, `🧵 Threads (${(project.plotThreads || []).length})`)
            ),

            // Plot Thread Warnings (from PlotThreadTracker)
            (() => {
              if (!window.PlotThreadTracker) return null;
              const tracker = new window.PlotThreadTracker(project);
              const warnings = tracker.getWarnings();
              if (warnings.length === 0) return null;

              return e('div', {
                style: {
                  marginBottom: '12px',
                  padding: '10px',
                  background: 'rgba(255,152,0,0.1)',
                  border: '1px solid rgba(255,152,0,0.3)',
                  borderRadius: '4px'
                }
              },
                e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '10px',
                    color: '#FFA726',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }
                },
                  e('span', null, '⚠️'),
                  e('span', { style: { fontWeight: 600 } }, `JUONIVAROITUKSET (${warnings.length})`)
                ),
                warnings.slice(0, 5).map((warning, idx) =>
                  e('div', {
                    key: idx,
                    style: {
                      marginBottom: idx < warnings.length - 1 ? '8px' : 0,
                      padding: '6px 8px',
                      background: warning.severity === 'high' ? 'rgba(244,67,54,0.15)' : 'rgba(255,193,7,0.15)',
                      borderRadius: '3px',
                      borderLeft: `3px solid ${warning.severity === 'high' ? '#f44336' : '#FFC107'}`
                    }
                  },
                    e('div', {
                      style: {
                        fontFamily: 'IBM Plex Mono',
                        fontSize: '11px',
                        color: 'var(--text)',
                        marginBottom: '2px'
                      }
                    }, warning.threadName),
                    e('div', {
                      style: {
                        fontFamily: 'IBM Plex Mono',
                        fontSize: '9px',
                        color: 'var(--text-2)'
                      }
                    }, warning.message),
                    e('div', {
                      style: {
                        fontFamily: 'IBM Plex Mono',
                        fontSize: '9px',
                        color: 'var(--text-3)',
                        fontStyle: 'italic',
                        marginTop: '2px'
                      }
                    }, warning.recommendation)
                  )
                ),
                warnings.length > 5 && e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '9px',
                    color: 'var(--text-3)',
                    textAlign: 'center',
                    marginTop: '8px'
                  }
                }, `...ja ${warnings.length - 5} muuta varoitusta`)
              );
            })(),

            // Characters detail
            (() => {
              const characters = Object.values(project.continuity?.characters || {});
              if (characters.length === 0) return null;

              return e('details', { style: { marginBottom: '8px' } },
                e('summary', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--sigil)', cursor: 'pointer', userSelect: 'none', marginBottom: '8px' } },
                  `▸ Characters (${characters.length})`),
                e('div', { style: { marginTop: '8px', maxHeight: '200px', overflowY: 'auto' } },
                  characters.slice(0, 20).map(char => e('div', {
                    key: char.name,
                    style: { marginBottom: '6px', padding: '6px', background: 'var(--bg-2)', borderRadius: '3px', border: '1px solid var(--border-color)' }
                  },
                    e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' } }, char.name),
                    e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-3)' } },
                      `${(char.appearances || []).length} appearances: ${(char.appearances || []).slice(0, 5).map(i => `#${i + 1}`).join(', ')}${(char.appearances || []).length > 5 ? '...' : ''}`)
                  )),
                  characters.length > 20 && e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-3)', fontStyle: 'italic', marginTop: '8px', textAlign: 'center' } },
                    `...and ${characters.length - 20} more`)
                )
              );
            })(),

            // Locations detail
            (() => {
              const locations = Object.values(project.continuity?.locations || {});
              if (locations.length === 0) return null;

              return e('details', { style: { marginBottom: '8px' } },
                e('summary', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--sigil)', cursor: 'pointer', userSelect: 'none', marginBottom: '8px' } },
                  `▸ Locations (${locations.length})`),
                e('div', { style: { marginTop: '8px', maxHeight: '200px', overflowY: 'auto' } },
                  locations.slice(0, 15).map(loc => e('div', {
                    key: loc.name,
                    style: { marginBottom: '6px', padding: '6px', background: 'var(--bg-2)', borderRadius: '3px', border: '1px solid var(--border-color)' }
                  },
                    e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' } }, loc.name),
                    e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-3)' } },
                      `First: Chapter #${loc.firstMentioned + 1}, ${(loc.appearances || []).length} total`)
                  )),
                  locations.length > 15 && e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-3)', fontStyle: 'italic', marginTop: '8px', textAlign: 'center' } },
                    `...and ${locations.length - 15} more`)
                )
              );
            })()
          ),

          // Version History (for active chapter)
          activeChapter && activeChapter.versions && activeChapter.versions.length > 0 && e('div', { style: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'VERSION HISTORY'),

            // Version count
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', marginBottom: '12px' } },
              `${activeChapter.versions.length} versio${activeChapter.versions.length !== 1 ? 'ta' : ''}`),

            // Version list (show last 5)
            activeChapter.versions.slice(-5).reverse().map((version, idx) => {
              const isCurrent = version.id === activeChapter.currentVersion;
              const versionDate = new Date(version.timestamp);
              const dateStr = versionDate.toLocaleDateString('fi-FI', { day: '2-digit', month: '2-digit', year: 'numeric' });
              const timeStr = versionDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });

              return e('div', {
                key: version.id,
                style: {
                  marginBottom: '8px',
                  padding: '8px',
                  background: isCurrent ? 'var(--sigil)' + '22' : 'var(--bg-2)',
                  border: `1px solid ${isCurrent ? 'var(--sigil)' : 'var(--border-color)'}`,
                  borderRadius: '4px'
                }
              },
                // Version ID and timestamp
                e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } },
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 600, color: isCurrent ? 'var(--sigil)' : 'var(--text)' } },
                    `${version.id}${isCurrent ? ' (current)' : ''}`),
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-3)' } },
                    `${dateStr} ${timeStr}`)
                ),

                // Mode and model
                e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-2)', marginBottom: '2px' } },
                  `Mode: ${version.generatedFrom?.mode || 'unknown'}`),
                e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-2)', marginBottom: '2px' } },
                  `Model: ${version.generatedFrom?.model || 'unknown'}`),

                // Word count and cost
                e('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '4px' } },
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } },
                    `${version.wordCount} sanaa`),
                  version.cost > 0 && e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: '#FFA726' } },
                    `$${version.cost.toFixed(4)}`)
                ),

                // User rating if exists
                version.userRating && e('div', { style: { marginTop: '4px' } },
                  e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px' } },
                    '⭐'.repeat(version.userRating))
                ),

                // User feedback if exists
                version.userFeedback && e('div', { style: { marginTop: '4px', fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-3)', fontStyle: 'italic' } },
                  `"${version.userFeedback}"`),

                // Action buttons
                e('div', { style: { display: 'flex', gap: '4px', marginTop: '8px' } },
                  // Restore button (only if not current)
                  !isCurrent && e('button', {
                    onClick: () => {
                      if (confirm(`Palauta versio ${version.id}?`)) {
                        restoreVersion(version.id);
                      }
                    },
                    style: {
                      flex: 1,
                      padding: '4px 8px',
                      background: 'var(--sigil)',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#000',
                      cursor: 'pointer',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '9px',
                      fontWeight: 600
                    }
                  }, '↩️ Palauta'),

                  // Rate button
                  e('button', {
                    onClick: () => {
                      const rating = parseInt(prompt('Arvostele versio (1-5 tähteä):'));
                      if (rating >= 1 && rating <= 5) {
                        const feedback = prompt('Vapaaehtoinen palaute:');
                        rateVersion(version.id, rating, feedback);
                      }
                    },
                    style: {
                      flex: 1,
                      padding: '4px 8px',
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      color: 'var(--text-2)',
                      cursor: 'pointer',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '9px'
                    }
                  }, version.userRating ? `⭐ ${version.userRating}/5` : '⭐ Arvostele')
                )
              );
            }),

            // Regenerate button (at top of version history)
            e('button', {
              onClick: () => setShowRegenerateDialog(true),
              disabled: isGenerating,
              style: {
                width: '100%',
                padding: '8px 12px',
                marginTop: '12px',
                background: isGenerating ? 'var(--bg-2)' : 'var(--bronze)',
                border: 'none',
                borderRadius: '4px',
                color: isGenerating ? 'var(--text-3)' : '#000',
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                fontWeight: 600
              }
            }, isGenerating ? '⏳ Generoidaan...' : '🔄 Generoi Uudelleen'),

            // Show more link if there are more than 5 versions
            activeChapter.versions.length > 5 && e('div', { style: { textAlign: 'center', marginTop: '8px' } },
              e('button', {
                style: {
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--sigil)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '10px',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }
              }, `Näytä kaikki ${activeChapter.versions.length} versiota...`)
            )
          ),

          // Story Complexity
          complexity && e('div', { style: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'TARINAN KOMPLEKSISUUS'),

            // Complexity score badge
            e('div', {
              style: {
                display: 'inline-block',
                padding: '4px 8px',
                background: complexity.recommendation.color + '22',
                border: `1px solid ${complexity.recommendation.color}`,
                borderRadius: '4px',
                marginBottom: '8px'
              }
            },
              e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '14px', fontWeight: 600, color: complexity.recommendation.color } },
                `${complexity.score} / 100`)
            ),

            // Phase indicator
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text)', marginBottom: '4px', fontWeight: 500 } },
              complexity.recommendation.title),

            // Breakdown
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } },
              e('div', null, `📖 ${complexity.wordCount.toLocaleString('fi-FI')} sanaa`),
              e('div', null, `👥 ${complexity.characterCount} hahmoa`),
              e('div', null, `📍 ${complexity.plotThreadCount} juonilankaa`),
              e('div', null, `⏰ ${complexity.timelineCount} aikajanaa`),
              complexity.hasNonLinear && e('div', null, `🔀 Epälineaarinen`)
            ),

            // Recommendation
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)', marginTop: '8px', padding: '8px', background: 'var(--bg-2)', borderRadius: '4px', borderLeft: `3px solid ${complexity.recommendation.color}` } },
              e('div', { style: { fontWeight: 500, marginBottom: '4px' } }, complexity.recommendation.message),
              e('div', { style: { fontStyle: 'italic' } }, complexity.recommendation.action),
              e('div', { style: { marginTop: '4px', color: complexity.recommendation.color } }, `Tarkkuus: ${complexity.recommendation.accuracy}`)
            )
          ),

          // Consistency Checker Section
          e('div', { style: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)',
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }
            },
              e('span', null, 'JOHDONMUKAISUUSTARKISTUS'),
              e('button', {
                onClick: async () => {
                  if (!window.ConsistencyChecker) {
                    alert('ConsistencyChecker ei ole ladattu');
                    return;
                  }
                  setGenerationProgress({ stage: 'checking', message: 'Tarkistetaan johdonmukaisuutta...' });
                  try {
                    const checker = new window.ConsistencyChecker(project, window.electronAPI);
                    const result = await checker.runFullCheck();
                    setGenerationProgress(null);
                    if (result.success) {
                      if (result.errors.length === 0) {
                        alert('✅ Ei johdonmukaisuusvirheitä!');
                      } else {
                        alert(`⚠️ Löydettiin ${result.errors.length} johdonmukaisuusongelmaa:\n\n` +
                          `Kriittisiä: ${result.summary.critical}\n` +
                          `Korkeita: ${result.summary.high}\n` +
                          `Keskitasoa: ${result.summary.medium}\n` +
                          `Matalia: ${result.summary.low}\n\n` +
                          'Tarkasta merkinnät editorissa.');
                      }
                      setProject({ ...project });
                    } else {
                      alert('Tarkistus epäonnistui: ' + result.error);
                    }
                  } catch (err) {
                    setGenerationProgress(null);
                    console.error('[ConsistencyChecker]', err);
                    alert('Virhe: ' + err.message);
                  }
                },
                style: {
                  padding: '4px 8px',
                  background: 'var(--sigil)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#000',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '9px',
                  fontWeight: 600
                }
              }, '🔍 Tarkista')
            ),

            // Show current chapter annotations count
            activeChapter && activeChapter.annotations && e('div', {
              style: {
                marginBottom: '8px',
                padding: '8px',
                background: 'var(--bg-2)',
                borderRadius: '4px',
                border: '1px solid var(--border-color)'
              }
            },
              e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '4px'
                }
              }, `Luvussa ${activeChapter.annotations.length} merkintää`),
              (() => {
                const aiAnnotations = (activeChapter.annotations || []).filter(a => a.source === 'ai');
                const consistencyAnnotations = aiAnnotations.filter(a => a.type === 'ai-consistency' || a.metadata?.category);
                if (consistencyAnnotations.length === 0) return null;
                return e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '10px',
                    color: 'var(--text-3)'
                  }
                }, `${consistencyAnnotations.length} johdonmukaisuusmerkintää`);
              })()
            ),

            // Quick info about what this does
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '9px',
                color: 'var(--text-3)',
                fontStyle: 'italic'
              }
            }, 'Tarkistaa hahmojen johdonmukaisuuden, aikajanan ja sijainnit.')
          ),

          // Plot Threads
          e('div', { style: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'JUONILANGAT'),

            // Thread stats
            plotThreadTrackerRef.current && plotThreads.length > 0 && (() => {
              const stats = plotThreadTrackerRef.current.getStats();
              const warnings = plotThreadTrackerRef.current.getWarnings();

              return e('div', null,
                // Stats
                e('div', { style: { marginBottom: '12px' } },
                  e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)' } },
                    `${stats.total} lankaa • ${stats.active} aktiivinen • ${stats.resolved} ratkaistu`),
                  warnings.length > 0 && e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: '#ff6b6b', marginTop: '4px' } },
                    `⚠️ ${warnings.length} varoitus${warnings.length !== 1 ? 'ta' : ''}`)
                ),

                // Threads list
                plotThreads.slice(0, 5).map(thread => {
                  const isResolved = thread.status === 'resolved';
                  const timeline = plotThreadTrackerRef.current.getTimeline(thread.id);

                  return e('div', {
                    key: thread.id,
                    style: {
                      marginBottom: '8px',
                      padding: '8px',
                      background: 'var(--bg-2)',
                      border: `1px solid ${isResolved ? 'var(--text-3)' : thread.color}`,
                      borderLeft: `3px solid ${thread.color}`,
                      borderRadius: '4px'
                    }
                  },
                    e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' } },
                      `${thread.name} ${isResolved ? '✓' : ''}`),
                    e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-3)' } },
                      `${thread.type.replace('_', ' ')} • ${thread.priority}`),
                    timeline && e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-3)', marginTop: '4px' } },
                      `Ch ${timeline[0].chapterIndex + 1} → Ch ${timeline[timeline.length - 1].chapterIndex + 1}`)
                  );
                }),

                plotThreads.length > 5 && e('div', { style: { textAlign: 'center', marginTop: '8px' } },
                  e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } },
                    `+${plotThreads.length - 5} lisää lankaa`)
                ),

                // Warnings
                warnings.length > 0 && e('div', { style: { marginTop: '12px', padding: '8px', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: '4px' } },
                  e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: '#ff6b6b', fontWeight: 600, marginBottom: '4px' } },
                    `⚠️ VAROITUKSET`),
                  warnings.slice(0, 3).map((w, idx) =>
                    e('div', { key: idx, style: { fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-2)', marginTop: '2px' } },
                      `• ${w.message}`)
                  )
                )
              );
            })(),

            // Detect threads button
            e('button', {
              onClick: detectPlotThreads,
              disabled: detectingThreads || !plotThreadTrackerRef.current,
              style: {
                width: '100%',
                padding: '8px',
                marginTop: '8px',
                background: detectingThreads || !plotThreadTrackerRef.current ? 'var(--bg-2)' : 'var(--bronze)',
                border: 'none',
                borderRadius: '4px',
                color: detectingThreads || !plotThreadTrackerRef.current ? 'var(--text-3)' : '#000',
                cursor: detectingThreads || !plotThreadTrackerRef.current ? 'not-allowed' : 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                fontWeight: 600
              }
            }, detectingThreads ? '🔍 Analysoidaan...' : plotThreads.length > 0 ? '🔄 Päivitä Langat' : '🔍 Havaitse Juonilangat')
          ),

          // Consistency Check
          e('div', { style: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'JOHDONMUKAISUUS'),

            // Error summary
            consistencyErrors.length > 0 && e('div', { style: { marginBottom: '12px' } },
              e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' } },
                `${consistencyErrors.length} ongelma${consistencyErrors.length !== 1 ? 'a' : ''} havaittu`),

              // Errors by severity
              e('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } },
                consistencyErrors.filter(e => e.severity === 'critical').length > 0 && e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: '#ff6b6b' } },
                  `🔴 ${consistencyErrors.filter(e => e.severity === 'critical').length}`),
                consistencyErrors.filter(e => e.severity === 'high').length > 0 && e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: '#ffa726' } },
                  `🟡 ${consistencyErrors.filter(e => e.severity === 'high').length}`),
                consistencyErrors.filter(e => e.severity === 'medium').length > 0 && e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: '#66bb6a' } },
                  `🟢 ${consistencyErrors.filter(e => e.severity === 'medium').length}`)
              )
            ),

            // Error list
            consistencyErrors.slice(0, 5).map((error, idx) => {
              const severityColor =
                error.severity === 'critical' ? '#ff6b6b' :
                error.severity === 'high' ? '#ffa726' :
                error.severity === 'medium' ? '#66bb6a' : 'var(--text-3)';

              return e('div', {
                key: idx,
                style: {
                  marginBottom: '8px',
                  padding: '8px',
                  background: 'var(--bg-2)',
                  border: `1px solid ${severityColor}`,
                  borderLeft: `3px solid ${severityColor}`,
                  borderRadius: '4px'
                }
              },
                e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', fontWeight: 600, color: severityColor, marginBottom: '2px' } },
                  error.type.replace(/_/g, ' ').toUpperCase()),
                e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-2)', marginBottom: '4px' } },
                  error.message),
                error.suggestedFix && e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '9px', color: 'var(--text-3)', fontStyle: 'italic' } },
                  `💡 ${error.suggestedFix}`)
              );
            }),

            consistencyErrors.length > 5 && e('div', { style: { textAlign: 'center', marginTop: '8px' } },
              e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } },
                `+${consistencyErrors.length - 5} lisää ongelmaa`)
            ),

            // Check button
            e('button', {
              onClick: runConsistencyCheck,
              disabled: checkingConsistency || !consistencyCheckerRef.current,
              style: {
                width: '100%',
                padding: '8px',
                marginTop: '8px',
                background: checkingConsistency || !consistencyCheckerRef.current ? 'var(--bg-2)' : 'var(--bronze)',
                border: 'none',
                borderRadius: '4px',
                color: checkingConsistency || !consistencyCheckerRef.current ? 'var(--text-3)' : '#000',
                cursor: checkingConsistency || !consistencyCheckerRef.current ? 'not-allowed' : 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                fontWeight: 600
              }
            }, checkingConsistency ? '🔍 Tarkistetaan...' : consistencyErrors.length > 0 ? '🔄 Tarkista Uudelleen' : '🔍 Tarkista Johdonmukaisuus')
          ),

          // Characters
          e('div', { style: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'HAHMOT'),

            project.castPlan.defined
              ? e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-2)', marginBottom: '8px' } },
                  `${project.characters.length} / ${project.castPlan.totalCharacters} hahmoa`)
              : e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-3)', marginBottom: '8px', fontStyle: 'italic' } },
                  'Ei suunniteltua cast:ia'),

            // Plan Cast button (or Build Characters if cast is defined)
            !project.castPlan.defined
              ? e('button', {
                  onClick: () => setShowCastPlanDialog(true),
                  style: {
                    width: '100%',
                    padding: '8px',
                    marginTop: '8px',
                    background: 'var(--bronze)',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#000',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px',
                    fontWeight: 600
                  }
                }, '🎭 Plan Cast')
              : e('div', { style: { marginTop: '8px' } },
                  // List of character types from cast plan
                  e('div', { style: { marginBottom: '8px' } },
                    project.castPlan.characterTypes.map((type, idx) =>
                      e('div', {
                        key: idx,
                        style: {
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '11px',
                          color: 'var(--text-3)',
                          marginBottom: '4px'
                        }
                      }, `${idx + 1}. ${type.length > 30 ? type.substring(0, 30) + '...' : type}`)
                    )
                  ),

                  // Build detailed characters button
                  e('button', {
                    onClick: () => {
                      setShowCharacterBuilder(true);
                      setCharacterBuilderStep(1);
                    },
                    style: {
                      width: '100%',
                      padding: '8px',
                      background: 'var(--bronze)',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#000',
                      cursor: 'pointer',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '12px',
                      fontWeight: 600
                    }
                  },
                    CharacterEngineLogo(14),
                    'Build Characters'
                  ),

                  // View Characters button (if characters exist)
                  project.characters && project.characters.length > 0 && e('button', {
                    onClick: () => {
                      setShowCharacterSheet(true);
                      setCharacterSheetMode('list');
                    },
                    style: {
                      width: '100%',
                      padding: '8px',
                      marginTop: '8px',
                      background: 'transparent',
                      border: '1px solid var(--bronze)',
                      borderRadius: '4px',
                      color: 'var(--bronze)',
                      cursor: 'pointer',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px',
                      fontWeight: 500
                    }
                  },
                    CharacterEngineLogo(12),
                    `View Characters (${project.characters.length})`
                  )
                )
          ),

          // AI Chat
          e('div', { style: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'AI CHAT'),

            // Chat history
            e('div', {
              style: {
                maxHeight: '300px',
                overflowY: 'auto',
                marginBottom: '12px',
                padding: '8px',
                background: 'var(--bg-1)',
                borderRadius: '4px',
                border: '1px solid var(--border-color)'
              }
            },
              aiChatMessages.length === 0
                ? e('div', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px',
                      color: 'var(--text-3)',
                      fontStyle: 'italic',
                      textAlign: 'center',
                      padding: '12px'
                    }
                  }, 'Kysy AI:lta mitä tahansa...')
                : aiChatMessages.map((msg, idx) =>
                    e('div', {
                      key: idx,
                      style: {
                        marginBottom: '12px',
                        padding: '8px',
                        background: msg.role === 'user' ? 'var(--bg-2)' :
                                   msg.role === 'error' ? 'rgba(255,68,68,0.1)' : 'transparent',
                        borderLeft: msg.role === 'user' ? '2px solid var(--bronze)' :
                                   msg.role === 'error' ? '2px solid #ff4444' : '2px solid var(--sigil)',
                        borderRadius: '4px'
                      }
                    },
                      e('div', {
                        style: {
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '10px',
                          color: 'var(--text-3)',
                          marginBottom: '4px',
                          textTransform: 'uppercase'
                        }
                      }, msg.role === 'user' ? 'Sinä' : msg.role === 'error' ? 'Virhe' : 'FAUST AI'),
                      e('div', {
                        style: {
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '12px',
                          color: 'var(--text)',
                          lineHeight: '1.5',
                          whiteSpace: 'pre-wrap'
                        }
                      }, msg.content)
                    )
                  )
            ),

            // Input area
            e('div', {
              style: {
                display: 'flex',
                gap: '8px',
                marginBottom: '8px'
              }
            },
              e('input', {
                type: 'text',
                value: aiChatInput,
                onChange: (ev) => setAiChatInput(ev.target.value),
                onKeyPress: (ev) => {
                  if (ev.key === 'Enter') {
                    sendAiChatMessage(aiChatInput);
                  }
                },
                placeholder: 'Kirjoita tai puhu...',
                disabled: aiChatVoiceState === 'processing',
                style: {
                  flex: 1,
                  padding: '8px',
                  background: 'var(--bg-1)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  outline: 'none'
                }
              }),

              // Voice button
              voiceInputAvailable ? e('button', {
                onClick: handleAiChatVoice,
                disabled: aiChatVoiceState !== 'idle',
                style: {
                  padding: '8px 12px',
                  background: aiChatVoiceState === 'listening' ? '#ff4444' :
                             aiChatVoiceState === 'processing' ? '#ffaa00' : 'var(--bronze)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#000',
                  cursor: aiChatVoiceState === 'idle' ? 'pointer' : 'not-allowed',
                  fontSize: '16px',
                  animation: aiChatVoiceState === 'listening' ? 'pulse 1s infinite' : 'none'
                }
              },
                aiChatVoiceState === 'listening' ? '🔴' :
                aiChatVoiceState === 'processing' ? '⏸️' : '🎤'
              ) : null
            ),

            // Buttons row
            e('div', {
              style: {
                display: 'flex',
                gap: '8px'
              }
            },
              // Send button
              e('button', {
                onClick: () => sendAiChatMessage(aiChatInput),
                disabled: !aiChatInput.trim() || aiChatVoiceState === 'processing',
                style: {
                  flex: 1,
                  padding: '8px',
                  background: aiChatInput.trim() && aiChatVoiceState !== 'processing' ? 'var(--bronze)' : 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: aiChatInput.trim() && aiChatVoiceState !== 'processing' ? '#000' : 'var(--text-3)',
                  cursor: aiChatInput.trim() && aiChatVoiceState !== 'processing' ? 'pointer' : 'not-allowed',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  fontWeight: 600
                }
              },
                aiChatVoiceState === 'processing' ? 'Käsittelen...' : 'Lähetä'
              ),

              // Edit button (forces edit mode)
              e('button', {
                onClick: () => sendAiChatMessage(aiChatInput, true),
                disabled: !aiChatInput.trim() || aiChatVoiceState === 'processing' || (!textSelection?.text && !activeChapter?.content),
                title: textSelection?.text ? 'Muokkaa valittua tekstiä' : 'Muokkaa koko lukua',
                style: {
                  padding: '8px 12px',
                  background: aiChatInput.trim() && aiChatVoiceState !== 'processing' ? 'var(--sigil)' : 'transparent',
                  border: '1px solid var(--sigil)',
                  borderRadius: '4px',
                  color: aiChatInput.trim() && aiChatVoiceState !== 'processing' ? '#000' : 'var(--text-3)',
                  cursor: aiChatInput.trim() && aiChatVoiceState !== 'processing' ? 'pointer' : 'not-allowed',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  fontWeight: 600
                }
              },
                '✏️ Muokkaa'
              )
            )
          ),

          // AI Tools (placeholder)
          e('div', null,
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'AI-TYÖKALUT'),
            e('button', {
              disabled: true,
              style: {
                width: '100%',
                padding: '8px',
                marginBottom: '8px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-3)',
                borderRadius: '4px',
                cursor: 'not-allowed',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px'
              }
            }, 'Jatka kirjoitusta'),
            e('button', {
              disabled: true,
              style: {
                width: '100%',
                padding: '8px',
                marginBottom: '8px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-3)',
                borderRadius: '4px',
                cursor: 'not-allowed',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px'
              }
            }, 'Generoi kirja')
          )
        )
      )
    ),

    // Footer / Status bar
    e('div', { className: 'faust-footer' },
      e('div', {
        style: {
          padding: '4px 16px',
          color: 'var(--text-2)',
          fontSize: '12px',
          fontFamily: 'IBM Plex Mono',
          display: 'flex',
          justifyContent: 'space-between'
        }
      },
        e('span', null, activeChapter.title + (unsavedChanges ? ' •' : '')),
        e('span', null, `${activeChapter.wordCount} / ${project.targets.currentTotal} sanaa` +
          (currentFilePath ? ` • ${currentFilePath.split('/').pop()}` : ' • Tallentamaton'))
      )
    ),

    // Cast Planning Dialog
    showCastPlanDialog ? e('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      },
      onClick: (ev) => {
        if (ev.target === ev.currentTarget) {
          setShowCastPlanDialog(false);
          setCastPlanStep(1);
        }
      }
    },
      e('div', {
        style: {
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          width: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          padding: '24px'
        }
      },
        // Dialog header
        e('h2', {
          style: {
            fontFamily: 'EB Garamond',
            fontSize: '24px',
            color: 'var(--text)',
            marginBottom: '16px'
          }
        }, '🎭 Plan Cast'),

        e('p', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '13px',
            color: 'var(--text-2)',
            marginBottom: '24px'
          }
        }, 'Määrittele millaisia hahmotyyppejä kirjassasi on. AI ehdottaa arkkityyppejä ja analysoi hahmodynamiikkaa.'),

        // Step 1: Character types input
        castPlanStep === 1 ? e('div', null,
          e('label', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: 'var(--text-3)',
              display: 'block',
              marginBottom: '8px'
            }
          }, 'HAHMOTYYPIT (yksi per rivi):'),

          e('textarea', {
            placeholder: 'Esim:\nStoalainen vanhus - viisas mutta etäinen\nNuori idealisti - naiivi mutta intohimoinen\nKorruptoitunut poliitikko - viehättävä mutta ontto',
            style: {
              width: '100%',
              minHeight: '200px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text)',
              padding: '12px',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              lineHeight: '1.6',
              resize: 'vertical'
            },
            id: 'cast-types-input'
          }),

          // Actions
          e('div', { style: { marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' } },
            e('button', {
              onClick: () => {
                setShowCastPlanDialog(false);
                setCastPlanStep(1);
              },
              style: {
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-2)',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px'
              }
            }, 'Peruuta'),

            e('button', {
              onClick: async () => {
                const input = document.getElementById('cast-types-input').value;
                const types = input.split('\n').filter(line => line.trim().length > 0);

                if (types.length === 0) {
                  alert('Syötä vähintään yksi hahmotyyppi');
                  return;
                }

                // Save types to project
                setProject(prev => ({
                  ...prev,
                  castPlan: {
                    ...prev.castPlan,
                    characterTypes: types,
                    totalCharacters: types.length
                  }
                }));

                // Move to step 2 and start AI analysis
                setCastPlanStep(2);

                // Run AI analysis
                const analysis = await analyzeCast(types);

                if (analysis) {
                  // Save analysis results
                  setProject(prev => ({
                    ...prev,
                    castPlan: {
                      ...prev.castPlan,
                      suggestedArchetypes: analysis.suggestions || [],
                      castDynamics: analysis.dynamics || null,
                      warnings: analysis.warnings || []
                    }
                  }));

                  setCastPlanStep(3); // Move to review step
                } else {
                  alert('AI-analyysi epäonnistui. Tarkista API-avain.');
                  setCastPlanStep(1); // Back to input
                }
              },
              style: {
                padding: '8px 16px',
                background: 'var(--bronze)',
                border: 'none',
                borderRadius: '4px',
                color: '#000',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                fontWeight: 600
              }
            }, 'Analysoi AI:lla →')
          )
        ) : null,

        // Step 2: AI Analysis loading
        castPlanStep === 2 ? e('div', null,
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text-2)',
              textAlign: 'center',
              padding: '40px'
            }
          },
            e('div', { style: { fontSize: '32px', marginBottom: '16px' } }, '🤖'),
            e('div', null, 'AI analysoi hahmotyyppejä...'),
            e('div', { style: { fontSize: '11px', color: 'var(--text-3)', marginTop: '8px' } }, 'Tämä voi kestää 10-30 sekuntia')
          )
        ) : null,

        // Step 3: AI Analysis Results
        castPlanStep === 3 ? e('div', null,
          e('div', { style: { marginBottom: '16px' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'AI-EHDOTUKSET'),

            // Archetype suggestions
            project.castPlan.suggestedArchetypes.map((suggestion, idx) =>
              e('div', {
                key: idx,
                style: {
                  marginBottom: '16px',
                  padding: '12px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px'
                }
              },
                e('div', { style: { fontFamily: 'EB Garamond', fontSize: '16px', color: 'var(--text)', marginBottom: '4px', fontWeight: 600 } },
                  suggestion.type),
                e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--bronze)', marginBottom: '8px' } },
                  suggestion.archetypeFamily),

                e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' } },
                  `Esimerkit: ${suggestion.examples.join(', ')}`),
                e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' } },
                  `Rooli: ${suggestion.functionInStory}`),
                e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-3)' } },
                  `Haasteet: ${suggestion.flaws}`)
              )
            )
          ),

          // Warnings
          project.castPlan.warnings && project.castPlan.warnings.length > 0 ? e('div', { style: { marginBottom: '16px' } },
            e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, '⚠️ HUOMIOT'),
            project.castPlan.warnings.map((warning, idx) =>
              e('div', {
                key: idx,
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  color: 'var(--text-2)',
                  marginBottom: '4px'
                }
              }, `• ${warning}`)
            )
          ) : null,

          // Actions
          e('div', { style: { marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' } },
            e('button', {
              onClick: () => setCastPlanStep(1),
              style: {
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-2)',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px'
              }
            }, '← Muokkaa'),

            e('button', {
              onClick: () => {
                // Mark cast plan as defined
                setProject(prev => ({
                  ...prev,
                  castPlan: {
                    ...prev.castPlan,
                    defined: true
                  }
                }));
                setUnsavedChanges(true);
                setShowCastPlanDialog(false);
                setCastPlanStep(1);
              },
              style: {
                padding: '8px 16px',
                background: 'var(--bronze)',
                border: 'none',
                borderRadius: '4px',
                color: '#000',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                fontWeight: 600
              }
            }, 'Vahvista cast →')
          )
        ) : null
      )
    ) : null,

    // Regenerate with Feedback Dialog
    showRegenerateDialog ? e('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      },
      onClick: (ev) => {
        if (ev.target === ev.currentTarget) {
          setShowRegenerateDialog(false);
          setRegenerateFeedback('');
        }
      }
    },
      e('div', {
        style: {
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          width: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          padding: '24px'
        }
      },
        e('h2', {
          style: {
            fontFamily: 'EB Garamond',
            fontSize: '24px',
            color: 'var(--text)',
            marginBottom: '8px'
          }
        }, '✨ Regenerate Chapter'),

        e('p', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '13px',
            color: 'var(--text-2)',
            marginBottom: '24px'
          }
        }, 'Anna palautetta nykyisestä versiosta. AI kirjoittaa luvun uudelleen palautteen perusteella.'),

        // Feedback textarea
        e('label', {
          style: {
            display: 'block',
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: 'var(--text-2)',
            marginBottom: '8px'
          }
        }, 'Palaute ja toiveet:'),

        e('textarea', {
          value: regenerateFeedback,
          onChange: (ev) => setRegenerateFeedback(ev.target.value),
          placeholder: 'Esim. "Lisää jännitystä dialogiin" tai "Lyhennä kuvauksia" tai "Vaihda näkökulma"...',
          style: {
            width: '100%',
            minHeight: '120px',
            fontFamily: 'IBM Plex Mono',
            fontSize: '13px',
            padding: '12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text)',
            resize: 'vertical',
            marginBottom: '16px'
          }
        }),

        // Mode selector
        e('label', {
          style: {
            display: 'block',
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: 'var(--text-2)',
            marginBottom: '8px'
          }
        }, 'Writing Mode:'),

        e('div', {
          style: {
            display: 'flex',
            gap: '8px',
            marginBottom: '24px'
          }
        },
          ['exploration', 'production', 'polish'].map(mode =>
            e('button', {
              key: mode,
              onClick: () => setRegenerateMode(mode),
              style: {
                flex: 1,
                padding: '12px',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                background: regenerateMode === mode ? 'var(--sigil)' : 'var(--bg-secondary)',
                color: regenerateMode === mode ? 'var(--bg-primary)' : 'var(--text-2)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }
            },
              mode === 'exploration' ? '🔮 Exploration' :
              mode === 'production' ? '✍️ Production' :
              '✨ Polish'
            )
          )
        ),

        // Action buttons
        e('div', {
          style: {
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
          }
        },
          e('button', {
            onClick: () => {
              setShowRegenerateDialog(false);
              setRegenerateFeedback('');
            },
            style: {
              padding: '10px 20px',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-2)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              cursor: 'pointer'
            }
          }, 'Peruuta'),

          e('button', {
            onClick: async () => {
              if (!regenerateFeedback.trim()) {
                alert('Anna ensin palautetta!');
                return;
              }

              if (!refinementManagerRef.current) {
                alert('RefinementManager ei ole käytettävissä');
                return;
              }

              try {
                setShowRegenerateDialog(false);
                const feedback = regenerateFeedback;
                const mode = regenerateMode;
                setRegenerateFeedback('');
                setRegenerateMode('production');

                // Show loading indicator
                alert('Generating new version...');

                await refinementManagerRef.current.regenerateChapter(
                  activeChapterId,
                  feedback,
                  mode
                );

                alert('✅ New version created! Check the Version History panel.');
              } catch (error) {
                console.error('[Regenerate] Error:', error);
                alert('Error: ' + error.message);
              }
            },
            style: {
              padding: '10px 20px',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              background: 'var(--sigil)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }
          }, '🔄 Regenerate')
        )
      )
    ) : null,

    // Character Builder Dialog
    showCharacterBuilder ? e('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }
    },
      e('div', {
        style: {
          background: 'var(--bg-1)',
          border: '2px solid var(--bronze)',
          borderRadius: '8px',
          padding: '32px',
          maxWidth: '800px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative'
        }
      },
        // Header
        e('h2', {
          style: {
            fontFamily: 'EB Garamond',
            fontSize: '24px',
            color: 'var(--text)',
            marginBottom: '8px'
          }
        }, '👤 Character Archetype Builder'),

        e('p', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: 'var(--text-2)',
            marginBottom: '24px'
          }
        }, selectedCharacterType ? `Tyyppi: ${selectedCharacterType.type}` : 'Valitse hahmotyyppi'),

        // Cancel button (top right)
        e('button', {
          onClick: cancelCharacterBuilder,
          style: {
            position: 'absolute',
            top: '24px',
            right: '24px',
            background: 'transparent',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text-3)',
            padding: '4px 12px',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px'
          }
        }, 'Peru'),

        // Step 1: Select character type
        characterBuilderStep === 1 ? e('div', null,
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text-2)',
              marginBottom: '16px'
            }
          }, 'Valitse haluamasi hahmotyyppi cast-suunnitelmasta:'),

          e('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }
          },
            project.castPlan.characterTypes.map((type, idx) =>
              e('button', {
                key: idx,
                onClick: () => startCharacterBuilder(type),
                style: {
                  padding: '12px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '13px',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }
              }, `${idx + 1}. ${type}`)
            )
          )
        ) : null,

        // Step 2: Input real people
        characterBuilderStep === 2 ? e('div', null,
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text-2)',
              marginBottom: '16px'
            }
          }, 'Anna oikeita henkilöitä inspiraatioksi:'),

          e('div', {
            style: {
              marginBottom: '16px',
              padding: '12px',
              background: 'var(--bg-2)',
              borderRadius: '4px',
              border: '1px solid var(--sigil)'
            }
          },
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)',
                marginBottom: '8px'
              }
            }, 'ARKKITYYPPI:'),
            e('div', {
              style: {
                fontFamily: 'EB Garamond',
                fontSize: '14px',
                color: 'var(--sigil)',
                marginBottom: '4px'
              }
            }, selectedCharacterType.archetype.archetypeFamily),
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)'
              }
            }, `Esimerkit: ${selectedCharacterType.archetype.examples.join(', ')}`)
          ),

          e('textarea', {
            value: characterRealPeople,
            onChange: (ev) => setCharacterRealPeople(ev.target.value),
            placeholder: 'Esim:\nErnst Jünger + C.G. Jung\n\nYhdistele 1-3 henkilöä per rivi. Voit lisätä useita rivillä.',
            style: {
              width: '100%',
              minHeight: '120px',
              padding: '12px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              resize: 'vertical',
              marginBottom: '16px'
            }
          }),

          e('button', {
            onClick: handleCharacterPeopleSubmit,
            disabled: !characterRealPeople.trim(),
            style: {
              width: '100%',
              padding: '12px',
              background: characterRealPeople.trim() ? 'var(--bronze)' : 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: characterRealPeople.trim() ? '#000' : 'var(--text-3)',
              cursor: characterRealPeople.trim() ? 'pointer' : 'not-allowed',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              fontWeight: 600
            }
          }, 'Jatka kysymyksiin →')
        ) : null,

        // Step 3: AI generating questions (loading)
        characterBuilderStep === 3 ? e('div', {
          style: {
            textAlign: 'center',
            padding: '48px'
          }
        },
          e('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '🤖'),
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '14px',
              color: 'var(--text)',
              marginBottom: '8px'
            }
          }, 'AI generoi tarkentavia kysymyksiä...'),
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: 'var(--text-3)'
            }
          }, 'Tämä voi kestää 10-20 sekuntia')
        ) : null,

        // Step 4: Answer questions
        characterBuilderStep === 4 ? e('div', null,
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text-2)',
              marginBottom: '16px'
            }
          }, `Vastaa AI:n kysymyksiin (${characterQuestions.length} kpl):`),

          e('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              marginBottom: '24px'
            }
          },
            characterQuestions.map((q, idx) =>
              e('div', {
                key: q.id,
                style: {
                  padding: '16px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px'
                }
              },
                e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-3)',
                    marginBottom: '8px',
                    textTransform: 'uppercase'
                  }
                }, `${idx + 1}. ${q.category}`),
                e('div', {
                  style: {
                    fontFamily: 'EB Garamond',
                    fontSize: '15px',
                    color: 'var(--text)',
                    marginBottom: '12px'
                  }
                }, q.question),
                e('textarea', {
                  value: characterAnswers[q.id] || '',
                  onChange: (ev) => {
                    setCharacterAnswers(prev => ({
                      ...prev,
                      [q.id]: ev.target.value
                    }));
                  },
                  placeholder: 'Vastauksesi...',
                  style: {
                    width: '100%',
                    minHeight: '80px',
                    padding: '12px',
                    background: 'var(--bg-1)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px',
                    resize: 'vertical'
                  }
                })
              )
            )
          ),

          e('button', {
            onClick: handleCharacterAnswersSubmit,
            style: {
              width: '100%',
              padding: '12px',
              background: 'var(--bronze)',
              border: 'none',
              borderRadius: '4px',
              color: '#000',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              fontWeight: 600
            }
          }, 'Generoi hahmon profiili →')
        ) : null,

        // Step 5: AI generating profile (loading)
        characterBuilderStep === 5 ? e('div', {
          style: {
            textAlign: 'center',
            padding: '48px'
          }
        },
          e('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '✨'),
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '14px',
              color: 'var(--text)',
              marginBottom: '8px'
            }
          }, 'AI luo yksityiskohtaisen psykologisen profiilin...'),
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: 'var(--text-3)'
            }
          }, 'Tämä voi kestää 20-40 sekuntia')
        ) : null,

        characterBuilderStep === 6 && characterProfile ? e('div', null,
  e('div', {
    style: {
      fontFamily: 'IBM Plex Mono',
      fontSize: '13px',
      color: 'var(--text-2)',
      marginBottom: '16px'
    }
  }, '🧠 Tarkista hahmon 4-tasoinen profiili:'),

  // Scrollable profile content
  e('div', {
    style: {
      maxHeight: '60vh',
      overflowY: 'auto',
      marginBottom: '24px',
      padding: '16px',
      background: 'var(--bg-2)',
      borderRadius: '4px',
      border: '1px solid var(--sigil)'
    }
  },
    // Basic info
    e('div', { style: { marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
      e('h3', {
        style: {
          fontFamily: 'EB Garamond',
          fontSize: '24px',
          color: 'var(--sigil)',
          marginBottom: '8px'
        }
      }, characterProfile.name),
      e('div', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px',
          color: 'var(--text-2)',
          marginBottom: '8px'
        }
      }, `${characterProfile.age || 'N/A'} \u2022 ${characterProfile.occupation || 'N/A'}`),
      characterProfile.appearance ? e('div', {
        style: {
          fontFamily: 'EB Garamond',
          fontSize: '14px',
          color: 'var(--text)',
          fontStyle: 'italic'
        }
      }, characterProfile.appearance) : null,
      characterProfile.description ? e('div', {
        style: {
          fontFamily: 'EB Garamond',
          fontSize: '13px',
          color: 'var(--text-2)',
          marginTop: '8px'
        }
      }, characterProfile.description) : null
    ),

    // LAYER 1: PSYCHOLOGICAL
    characterProfile.psychological ? e('div', { style: { marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
      e('div', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--bronze)',
          marginBottom: '12px',
          textTransform: 'uppercase',
          fontWeight: 600
        }
      }, '🧠 TASO 1: PSYKOLOGINEN'),

      // Big Five
      characterProfile.psychological.bigFive ? e('div', { style: { marginBottom: '16px' } },
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '10px',
            color: 'var(--text-3)',
            marginBottom: '8px'
          }
        }, 'Big Five Personality:'),
        ...Object.entries(characterProfile.psychological.bigFive).map(([trait, value]) =>
          e('div', {
            key: trait,
            style: {
              marginBottom: '6px'
            }
          },
            e('div', {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-2)',
                marginBottom: '2px'
              }
            },
              e('span', null, trait.charAt(0).toUpperCase() + trait.slice(1)),
              e('span', { style: { color: 'var(--sigil)' } }, Math.round(value * 100) + '%')
            ),
            e('div', {
              style: {
                width: '100%',
                height: '4px',
                background: 'var(--bg-1)',
                borderRadius: '2px',
                overflow: 'hidden'
              }
            },
              e('div', {
                style: {
                  width: `${value * 100}%`,
                  height: '100%',
                  background: value > 0.7 ? '#4CAF50' : value > 0.4 ? '#FFC107' : '#FF5722',
                  transition: 'width 0.3s ease'
                }
              })
            )
          )
        )
      ) : null,

      // DSM & Existential Terror
      e('div', { style: { display: 'flex', gap: '12px', marginBottom: '12px' } },
        characterProfile.psychological.dsmCategory && characterProfile.psychological.dsmCategory !== 'none' ? e('div', {
          style: {
            flex: 1,
            padding: '8px',
            background: 'var(--bg-1)',
            borderRadius: '4px',
            border: '1px solid var(--border-color)'
          }
        },
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '9px',
              color: 'var(--text-3)',
              marginBottom: '4px'
            }
          }, 'DSM Category'),
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text)'
            }
          }, characterProfile.psychological.dsmCategory)
        ) : null,

        characterProfile.psychological.existentialTerror ? e('div', {
          style: {
            flex: 1,
            padding: '8px',
            background: 'var(--bg-1)',
            borderRadius: '4px',
            border: '1px solid var(--border-color)'
          }
        },
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '9px',
              color: 'var(--text-3)',
              marginBottom: '4px'
            }
          }, 'Coping (Becker)'),
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text)'
            }
          }, characterProfile.psychological.existentialTerror.copingMechanism)
        ) : null
      ),

      // Trauma
      characterProfile.psychological.trauma ? e('div', {
        style: {
          padding: '12px',
          background: 'rgba(255, 87, 34, 0.1)',
          borderRadius: '4px',
          border: '1px solid rgba(255, 87, 34, 0.3)',
          marginBottom: '12px'
        }
      },
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '10px',
            color: '#FF5722',
            marginBottom: '6px',
            fontWeight: 600
          }
        }, '\u26A0\uFE0F Trauma'),
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            color: 'var(--text-2)'
          }
        }, `${characterProfile.psychological.trauma.type} (severity: ${Math.round(characterProfile.psychological.trauma.severity * 100)}%)`)
      ) : null,

      // Belief System
      characterProfile.psychological.beliefSystem ? e('div', null,
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '10px',
            color: 'var(--text-3)',
            marginBottom: '6px'
          }
        }, 'Core Beliefs:'),
        e('div', {
          style: {
            fontFamily: 'EB Garamond',
            fontSize: '12px',
            color: 'var(--text)',
            marginBottom: '8px'
          }
        }, characterProfile.psychological.beliefSystem.core_beliefs?.join(' \u2022 ') || 'N/A'),
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '10px',
            color: 'var(--text-3)',
            marginBottom: '4px'
          }
        }, `Worldview: ${characterProfile.psychological.beliefSystem.worldview}`)
      ) : null
    ) : null,

    // LAYER 2: TRANSACTIONAL
    characterProfile.transactional ? e('div', { style: { marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
      e('div', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--bronze)',
          marginBottom: '12px',
          textTransform: 'uppercase',
          fontWeight: 600
        }
      }, '\uD83D\uDD04 TASO 2: TRANSAKTIIVINEN (Berne)'),

      // Ego States
      characterProfile.transactional.egoStates ? e('div', { style: { marginBottom: '12px' } },
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '10px',
            color: 'var(--text-3)',
            marginBottom: '8px'
          }
        }, 'Ego States:'),
        e('div', { style: { display: 'flex', gap: '8px' } },
          ['parent', 'adult', 'child'].map(state => {
            const value = characterProfile.transactional.egoStates[state];
            const isDominant = characterProfile.transactional.dominantState === state;
            return e('div', {
              key: state,
              style: {
                flex: 1,
                padding: '8px',
                background: isDominant ? 'var(--bronze)' : 'var(--bg-1)',
                color: isDominant ? '#000' : 'var(--text-2)',
                borderRadius: '4px',
                textAlign: 'center',
                border: `2px solid ${isDominant ? 'var(--bronze)' : 'var(--border-color)'}`
              }
            },
              e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '9px',
                  marginBottom: '4px',
                  textTransform: 'uppercase'
                }
              }, state),
              e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '14px',
                  fontWeight: 600
                }
              }, Math.round(value * 100) + '%')
            );
          })
        )
      ) : null,

      // Social Game & Communication
      e('div', { style: { display: 'flex', gap: '12px', marginTop: '12px' } },
        characterProfile.transactional.socialGame && characterProfile.transactional.socialGame.game !== 'none' ? e('div', {
          style: {
            flex: 1,
            padding: '8px',
            background: 'rgba(255, 193, 7, 0.1)',
            borderRadius: '4px',
            border: '1px solid rgba(255, 193, 7, 0.3)'
          }
        },
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '9px',
              color: '#FFC107',
              marginBottom: '4px'
            }
          }, 'Drama Triangle'),
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text)'
            }
          }, characterProfile.transactional.socialGame.game)
        ) : null,

        characterProfile.transactional.communicationStyle ? e('div', {
          style: {
            flex: 1,
            padding: '8px',
            background: 'var(--bg-1)',
            borderRadius: '4px',
            border: '1px solid var(--border-color)'
          }
        },
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '9px',
              color: 'var(--text-3)',
              marginBottom: '4px'
            }
          }, 'Communication'),
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text)'
            }
          }, characterProfile.transactional.communicationStyle)
        ) : null
      )
    ) : null,

    // LAYER 3: ARCHETYPAL
    characterProfile.archetypal ? e('div', { style: { marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
      e('div', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--bronze)',
          marginBottom: '12px',
          textTransform: 'uppercase',
          fontWeight: 600
        }
      }, '\u2728 TASO 3: ARKKITYYPPI (Jung)'),

      // Primary Archetype
      e('div', {
        style: {
          padding: '12px',
          background: 'var(--bg-1)',
          borderRadius: '4px',
          border: '2px solid var(--sigil)',
          marginBottom: '12px'
        }
      },
        e('div', {
          style: {
            fontFamily: 'EB Garamond',
            fontSize: '16px',
            color: 'var(--sigil)',
            marginBottom: '4px',
            fontWeight: 600
          }
        }, characterProfile.archetypal.primaryArchetype),
        characterProfile.archetypal.secondaryArchetypes && characterProfile.archetypal.secondaryArchetypes.length > 0 ? e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '10px',
            color: 'var(--text-3)'
          }
        }, `Secondary: ${characterProfile.archetypal.secondaryArchetypes.join(', ')}`) : null
      ),

      // Mythic Journey
      characterProfile.archetypal.mythicJourney ? e('div', { style: { marginBottom: '12px' } },
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '10px',
            color: 'var(--text-3)',
            marginBottom: '6px'
          }
        }, 'Hero\'s Journey:'),
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            color: 'var(--text-2)',
            marginBottom: '4px'
          }
        }, characterProfile.archetypal.mythicJourney.stage.replace(/_/g, ' ')),
        e('div', {
          style: {
            width: '100%',
            height: '6px',
            background: 'var(--bg-1)',
            borderRadius: '3px',
            overflow: 'hidden'
          }
        },
          e('div', {
            style: {
              width: `${characterProfile.archetypal.mythicJourney.completion * 100}%`,
              height: '100%',
              background: 'var(--sigil)',
              transition: 'width 0.3s ease'
            }
          })
        )
      ) : null,

      // Shadow Work
      characterProfile.archetypal.shadowWork ? e('div', {
        style: {
          padding: '10px',
          background: 'rgba(156, 39, 176, 0.1)',
          borderRadius: '4px',
          border: '1px solid rgba(156, 39, 176, 0.3)'
        }
      },
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '10px',
            color: '#9C27B0',
            marginBottom: '6px',
            fontWeight: 600
          }
        }, '\uD83C\uDF11 Shadow'),
        characterProfile.archetypal.shadowWork.suppressedTraits && characterProfile.archetypal.shadowWork.suppressedTraits.length > 0 ? e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            color: 'var(--text-2)'
          }
        }, `Suppressed: ${characterProfile.archetypal.shadowWork.suppressedTraits.join(', ')}`) : null
      ) : null
    ) : null,

    // LAYER 4: ENSEMBLE
    characterProfile.ensemble ? e('div', { style: { marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' } },
      e('div', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--bronze)',
          marginBottom: '12px',
          textTransform: 'uppercase',
          fontWeight: 600
        }
      }, '\uD83C\uDFAD TASO 4: ENSEMBLE'),

      // Story Fit
      characterProfile.ensemble.storyFit ? e('div', { style: { marginBottom: '12px' } },
        e('div', {
          style: {
            display: 'flex',
            gap: '12px'
          }
        },
          e('div', {
            style: {
              flex: 1,
              padding: '8px',
              background: 'var(--bg-1)',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }
          },
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '9px',
                color: 'var(--text-3)',
                marginBottom: '4px'
              }
            }, 'Theme Fit'),
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '14px',
                color: 'var(--sigil)',
                fontWeight: 600
              }
            }, Math.round(characterProfile.ensemble.storyFit.themeCompatibility * 100) + '%')
          ),
          e('div', {
            style: {
              flex: 1,
              padding: '8px',
              background: 'var(--bg-1)',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              textAlign: 'center'
            }
          },
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '9px',
                color: 'var(--text-3)',
                marginBottom: '4px'
              }
            }, 'Genre Fit'),
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '14px',
                color: 'var(--sigil)',
                fontWeight: 600
              }
            }, Math.round(characterProfile.ensemble.storyFit.genreAlignment * 100) + '%')
          )
        ),
        e('div', {
          style: {
            marginTop: '8px',
            padding: '8px',
            background: 'var(--bronze)',
            color: '#000',
            borderRadius: '4px',
            textAlign: 'center',
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            fontWeight: 600
          }
        }, `Role: ${characterProfile.ensemble.storyFit.narrativeRole}`)
      ) : null,

      // Group Dynamics
      characterProfile.ensemble.groupDynamics ? e('div', null,
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '10px',
            color: 'var(--text-3)',
            marginBottom: '6px'
          }
        }, 'Group Role:'),
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: 'var(--text-2)'
          }
        }, characterProfile.ensemble.groupDynamics.roleInGroup)
      ) : null
    ) : null,

    // Legacy fields for backward compatibility
    // Psychology (MBTI/Enneagram)
    characterProfile.psychology ? e('div', { style: { marginBottom: '16px' } },
      e('div', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '10px',
          color: 'var(--text-3)',
          marginBottom: '6px'
        }
      }, 'Myers-Briggs / Enneagram:'),
      e('div', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px',
          color: 'var(--text-2)'
        }
      }, `${characterProfile.psychology.mbti} \u2022 ${characterProfile.psychology.enneagram}`)
    ) : null,

    // Voice samples
    characterProfile.voice && characterProfile.voice.examples && characterProfile.voice.examples.length > 0 ? e('div', { style: { marginBottom: '16px' } },
      e('div', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '10px',
          color: 'var(--text-3)',
          marginBottom: '8px'
        }
      }, '\uD83D\uDCAC Puhetyyli:'),
      ...characterProfile.voice.examples.map((example, idx) =>
        e('div', {
          key: idx,
          style: {
            fontFamily: 'EB Garamond',
            fontSize: '13px',
            color: 'var(--text)',
            marginBottom: '6px',
            paddingLeft: '12px',
            borderLeft: '2px solid var(--bronze)',
            fontStyle: 'italic'
          }
        }, `"${example}"`)
      )
    ) : null
  ),

  // Action buttons
  e('div', {
    style: {
      display: 'flex',
      gap: '12px'
    }
  },
    e('button', {
      onClick: () => {
        setCharacterBuilderStep(4);
        setCharacterProfile(null);
      },
      style: {
        flex: 1,
        padding: '12px',
        background: 'transparent',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        color: 'var(--text-2)',
        cursor: 'pointer',
        fontFamily: 'IBM Plex Mono',
        fontSize: '12px'
      }
    }, '\u2190 Takaisin kysymyksiin'),
    e('button', {
      onClick: saveCharacterProfile,
      style: {
        flex: 2,
        padding: '12px',
        background: 'var(--bronze)',
        border: 'none',
        borderRadius: '4px',
        color: '#000',
        cursor: 'pointer',
        fontFamily: 'IBM Plex Mono',
        fontSize: '13px',
        fontWeight: 600
      }
    }, '\u2713 Tallenna hahmo')
  )
) : null
      )
    ) : null,

    // Settings Dialog
    showSettings ? e('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }
    },
      e('div', {
        style: {
          background: 'var(--bg-1)',
          border: '2px solid var(--bronze)',
          borderRadius: '8px',
          padding: '32px',
          maxWidth: '700px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative'
        }
      },
        // Header
        e('h2', {
          style: {
            fontFamily: 'EB Garamond',
            fontSize: '24px',
            color: 'var(--text)',
            marginBottom: '8px'
          }
        }, '⚙️ Asetukset'),

        e('p', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: 'var(--text-2)',
            marginBottom: '24px'
          }
        }, 'Konfiguroi FAUST AI -asetukset'),

        // Close button
        e('button', {
          onClick: () => setShowSettings(false),
          style: {
            position: 'absolute',
            top: '24px',
            right: '24px',
            background: 'transparent',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text-3)',
            padding: '4px 12px',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px'
          }
        }, 'Sulje'),

        // Tabs
        e('div', {
          style: {
            display: 'flex',
            gap: '8px',
            marginBottom: '24px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '12px'
          }
        },
          ['api', 'general'].map(tab =>
            e('button', {
              key: tab,
              onClick: () => setSettingsTab(tab),
              style: {
                padding: '8px 16px',
                background: settingsTab === tab ? 'var(--bronze)' : 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: settingsTab === tab ? '#000' : 'var(--text-2)',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                fontWeight: settingsTab === tab ? 600 : 400
              }
            }, tab === 'api' ? 'API Asetukset' : 'Yleiset')
          )
        ),

        // API Settings Tab
        settingsTab === 'api' ? e('div', null,
          // API Type Selection
          e('div', {
            style: {
              marginBottom: '24px'
            }
          },
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text-3)',
                marginBottom: '8px',
                textTransform: 'uppercase'
              }
            }, 'API Type'),

            e('div', {
              style: {
                display: 'flex',
                gap: '8px'
              }
            },
              ['cloud', 'local'].map(type =>
                e('button', {
                  key: type,
                  onClick: () => {
                    const newProvider = type === 'cloud' ? 'anthropic' : 'local';
                    setActiveApiProvider(newProvider);
                  },
                  style: {
                    flex: 1,
                    padding: '12px',
                    background: project.apiConfig.provider !== 'local' ?
                      (type === 'cloud' ? 'var(--bg-2)' : 'transparent') :
                      (type === 'local' ? 'var(--bg-2)' : 'transparent'),
                    border: `2px solid ${
                      project.apiConfig.provider !== 'local' ?
                        (type === 'cloud' ? 'var(--bronze)' : 'var(--border-color)') :
                        (type === 'local' ? 'var(--bronze)' : 'var(--border-color)')
                    }`,
                    borderRadius: '4px',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '13px'
                  }
                },
                  type === 'cloud' ? '☁️ Cloud API' : '🖥️ Local Server'
                )
              )
            )
          ),

          // Cloud API Configuration
          project.apiConfig.provider !== 'local' ? e('div', null,
            // API Key
            e('div', {
              style: {
                marginBottom: '16px'
              }
            },
              e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  color: 'var(--text-3)',
                  marginBottom: '8px',
                  textTransform: 'uppercase'
                }
              }, 'API Key'),

              e('input', {
                type: 'password',
                value: project.apiConfig[project.apiConfig.provider]?.apiKey || project.apiConfig.anthropic.apiKey,
                onChange: (ev) => updateApiKey(project.apiConfig.provider === 'local' ? 'anthropic' : project.apiConfig.provider, ev.target.value),
                placeholder: 'sk-ant-... tai sk-... tai xai-...',
                style: {
                  width: '100%',
                  padding: '12px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '13px',
                  outline: 'none'
                }
              }),

              e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-3)',
                  marginTop: '8px',
                  fontStyle: 'italic'
                }
              }, '🔑 Hanki API-avain: console.anthropic.com, platform.openai.com, x.ai, deepseek.com')
            ),

            // Model Name
            e('div', {
              style: {
                marginBottom: '16px'
              }
            },
              e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  color: 'var(--text-3)',
                  marginBottom: '8px',
                  textTransform: 'uppercase'
                }
              }, 'Model Name'),

              e('input', {
                type: 'text',
                value: project.ai?.activeModel || 'claude-3-5-sonnet-20241022',
                onChange: (ev) => {
                  setProject(prev => ({
                    ...prev,
                    ai: {
                      ...prev.ai,
                      activeModel: ev.target.value
                    }
                  }));
                  setUnsavedChanges(true);
                },
                placeholder: 'claude-3-5-sonnet-20241022',
                style: {
                  width: '100%',
                  padding: '12px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '13px',
                  outline: 'none'
                }
              }),

              e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-3)',
                  marginTop: '8px',
                  fontStyle: 'italic'
                }
              }, '📝 Syötä täsmällinen mallin nimi (esim. claude-3-5-sonnet-20241022, gpt-4-turbo, grok-2-1212)')
            ),

            // Quick Select buttons
            e('div', {
              style: {
                marginBottom: '24px'
              }
            },
              e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-3)',
                  marginBottom: '8px'
                }
              }, 'PIKA-VALINTA:'),

              e('div', {
                style: {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px'
                }
              },
                [
                  { name: 'Claude 3.5 Sonnet', model: 'claude-3-5-sonnet-20241022' },
                  { name: 'GPT-4 Turbo', model: 'gpt-4-turbo-preview' },
                  { name: 'Grok 2', model: 'grok-2-1212' },
                  { name: 'DeepSeek V3', model: 'deepseek-chat' }
                ].map(preset =>
                  e('button', {
                    key: preset.model,
                    onClick: () => {
                      setProject(prev => ({
                        ...prev,
                        ai: {
                          ...prev.ai,
                          activeModel: preset.model
                        }
                      }));
                      setUnsavedChanges(true);
                    },
                    style: {
                      padding: '8px',
                      background: project.ai?.activeModel === preset.model ? 'var(--bronze)' : 'var(--bg-2)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      color: project.ai?.activeModel === preset.model ? '#000' : 'var(--text-2)',
                      cursor: 'pointer',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px',
                      fontWeight: project.ai?.activeModel === preset.model ? 600 : 400
                    }
                  }, preset.name)
                )
              )
            )
          ) : null,

          // Local Endpoint Configuration
          project.apiConfig.provider === 'local' ? e('div', {
            style: {
              marginBottom: '24px'
            }
          },
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text-3)',
                marginBottom: '8px',
                textTransform: 'uppercase'
              }
            }, 'Local Endpoint URL'),

            e('input', {
              type: 'text',
              value: project.apiConfig.local.endpoint,
              onChange: (ev) => {
                setProject(prev => ({
                  ...prev,
                  apiConfig: {
                    ...prev.apiConfig,
                    local: {
                      ...prev.apiConfig.local,
                      endpoint: ev.target.value
                    }
                  }
                }));
                setUnsavedChanges(true);
              },
              placeholder: 'http://localhost:1234/v1',
              style: {
                width: '100%',
                padding: '12px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'IBM Plex Mono',
                fontSize: '13px',
                outline: 'none'
              }
            }),

            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)',
                marginTop: '8px',
                fontStyle: 'italic'
              }
            }, '🖥️ Esim. Ollama, LM Studio tai muu OpenAI-yhteensopiva palvelin')
          ) : null,

          // Divider
          e('div', {
            style: {
              borderTop: '1px solid var(--border-color)',
              marginTop: '32px',
              paddingTop: '24px'
            }
          }),

          // Test connection button
          e('button', {
            onClick: testApiConnection,
            style: {
              width: '100%',
              padding: '12px',
              background: 'var(--bronze)',
              border: 'none',
              borderRadius: '4px',
              color: '#000',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '16px'
            }
          }, '🔍 Testaa yhteyttä'),

          // Test result
          apiTestResult ? e('div', {
            style: {
              padding: '12px',
              background: apiTestResult.success === null ? 'var(--bg-2)' :
                         apiTestResult.success ? 'rgba(76,175,80,0.1)' : 'rgba(239,83,80,0.1)',
              border: `1px solid ${apiTestResult.success === null ? 'var(--border-color)' :
                                   apiTestResult.success ? '#4CAF50' : '#EF5350'}`,
              borderRadius: '4px',
              marginBottom: '16px'
            }
          },
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: apiTestResult.success === null ? 'var(--text-2)' :
                       apiTestResult.success ? '#4CAF50' : '#EF5350'
              }
            }, apiTestResult.message)
          ) : null,

          // API Usage stats
          e('div', {
            style: {
              padding: '16px',
              background: 'var(--bg-2)',
              borderRadius: '4px',
              border: '1px solid var(--border-color)'
            }
          },
            e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)',
                marginBottom: '12px',
                textTransform: 'uppercase'
              }
            }, 'API Käyttö'),

            e('div', {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }
            },
              e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  color: 'var(--text-2)'
                }
              }, `Pyyntöjä: ${project.ai.costTracking.requestCount}`),
              e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  color: 'var(--text-2)'
                }
              }, `Tokeneita: ${project.ai.costTracking.tokensUsed}`),
              e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  color: 'var(--text-2)'
                }
              }, `Kustannukset: ~$${project.ai.costTracking.totalSpent.toFixed(2)}`),
              project.apiConfig.lastTested ? e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-3)',
                  fontStyle: 'italic',
                  marginTop: '4px'
                }
              }, `Viimeksi testattu: ${new Date(project.apiConfig.lastTested).toLocaleString('fi-FI')}`) : null
            )
          )
        ) : null,

        // General Settings Tab
        settingsTab === 'general' ? e('div', null,
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text-2)',
              textAlign: 'center',
              padding: '48px'
            }
          }, 'Yleisiä asetuksia tulossa...')
        ) : null
      )
    ) : null,

    // AI Assistant Panel (Cursor-style) - Slides in from right
    aiAssistantOpen && e('div', {
      className: 'liminal-engine-panel',
      style: {
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: aiAssistantCollapsed ? '48px' : '500px',
        background: 'var(--bg-primary)',
        borderLeft: '2px solid var(--bronze)',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999,
        transition: 'width 0.3s ease-out',
        overflow: 'hidden'
      }
    },
      // Collapsed state - vertical tab
      aiAssistantCollapsed ? e('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          cursor: 'pointer',
          position: 'relative'
        },
        onClick: () => setAiAssistantCollapsed(false)
      },
        e('div', {
          style: {
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-2)',
            letterSpacing: '2px',
            userSelect: 'none'
          }
        }, 'LIMINAL ENGINE'),
        e('div', {
          style: {
            position: 'absolute',
            top: '16px',
            fontFamily: 'IBM Plex Mono',
            fontSize: '16px',
            color: 'var(--gold)'
          }
        }, '›')
      ) : [
        // Header
        e('div', {
          key: 'header',
          style: {
            padding: '16px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }
        },
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text)'
            }
          }, 'Liminal Engine'),
          e('div', { style: { display: 'flex', gap: '8px' } },
            e('button', {
              onClick: () => setAiAssistantCollapsed(true),
              title: 'Pienennä (collapse)',
              style: {
                background: 'transparent',
                border: 'none',
                color: 'var(--text-2)',
                cursor: 'pointer',
                padding: '4px 8px',
                fontFamily: 'IBM Plex Mono',
                fontSize: '16px'
              }
            }, '‹'),
            e('button', {
              onClick: () => setAiAssistantOpen(false),
              title: 'Sulje',
              style: {
                background: 'transparent',
                border: 'none',
                color: 'var(--text-2)',
                cursor: 'pointer',
                padding: '4px 8px',
                fontFamily: 'IBM Plex Mono',
                fontSize: '18px'
              }
            }, '×')
          )
        ),

        // Model selector dropdown
        e('div', {
          key: 'model-selector',
          style: {
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)'
          }
        },
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '10px',
            color: 'var(--text-3)',
            marginBottom: '6px',
            textTransform: 'uppercase'
          }
        }, 'Provider'),
        e('select', {
          value: project.ai.provider || 'anthropic',
          onChange: (ev) => {
            setProject(prev => ({
              ...prev,
              ai: {
                ...prev.ai,
                provider: ev.target.value
              }
            }));
            setUnsavedChanges(true);
          },
          style: {
            width: '100%',
            padding: '8px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text)',
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            cursor: 'pointer',
            outline: 'none',
            marginBottom: '8px'
          }
        },
          e('option', { value: 'anthropic' }, 'Anthropic Claude'),
          e('option', { value: 'openai' }, 'OpenAI GPT'),
          e('option', { value: 'grok' }, 'Grok (xAI)'),
          e('option', { value: 'deepseek' }, 'DeepSeek')
        ),
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '10px',
            color: 'var(--text-3)',
            marginBottom: '6px',
            textTransform: 'uppercase',
            marginTop: '4px'
          }
        }, 'Model'),
        e('input', {
          type: 'text',
          value: project.ai.models?.[project.ai.provider || 'anthropic'] ||
                 (project.ai.provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' :
                  project.ai.provider === 'openai' ? 'gpt-4-turbo-preview' :
                  project.ai.provider === 'grok' ? 'grok-2-1212' : 'deepseek-chat'),
          onChange: (ev) => {
            const provider = project.ai.provider || 'anthropic';
            setProject(prev => ({
              ...prev,
              ai: {
                ...prev.ai,
                models: {
                  ...prev.ai.models,
                  [provider]: ev.target.value
                }
              }
            }));
            setUnsavedChanges(true);
          },
          placeholder: 'e.g. claude-opus-4-20250514',
          style: {
            width: '100%',
            padding: '8px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--gold)',
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            outline: 'none'
          }
        })
        ),

        // Selected text context badge
        textSelection ? e('div', {
          key: 'text-selection',
          style: {
          padding: '12px 16px',
          background: 'var(--bronze)',
          color: '#000',
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          borderBottom: '1px solid var(--border-color)'
        }
      },
        e('div', { style: { fontWeight: 600, marginBottom: '4px' } }, '✓ Text Selected'),
          e('div', { style: { opacity: 0.8, maxHeight: '40px', overflow: 'hidden' } },
            textSelection.text.substring(0, 80) + (textSelection.text.length > 80 ? '...' : ''))
        ) : null,

        // Chat messages
        e('div', {
          key: 'chat-messages',
          style: {
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }
      },
        aiChatMessages.length === 0
          ? e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text-3)',
                textAlign: 'center',
                padding: '48px 24px',
                fontStyle: 'italic'
              }
            }, 'Select text and ask me to revise it, or ask me anything about your writing.')
          : aiChatMessages.map((msg, idx) =>
              e('div', {
                key: idx,
                style: {
                  padding: '12px',
                  background: msg.role === 'user' ? 'var(--bg-secondary)' :
                             msg.role === 'error' ? 'rgba(255,68,68,0.1)' : 'transparent',
                  borderLeft: msg.role === 'user' ? '3px solid var(--bronze)' :
                             msg.role === 'error' ? '3px solid #ff4444' : '3px solid var(--gold)',
                  borderRadius: '4px'
                }
              },
                e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '9px',
                    color: 'var(--text-3)',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    fontWeight: 600
                  }
                }, msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : 'AI'),
                msg.selectedText ? e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '10px',
                    color: 'var(--text-3)',
                    fontStyle: 'italic',
                    marginBottom: '8px',
                    padding: '6px',
                    background: 'var(--bg-primary)',
                    borderRadius: '2px',
                    maxHeight: '60px',
                    overflow: 'hidden'
                  }
                }, '📝 ' + msg.selectedText.substring(0, 100) + (msg.selectedText.length > 100 ? '...' : '')) : null,
                e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px',
                    color: 'var(--text)',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap'
                  }
                }, msg.content)
              )
            )
        ),

        // AI Suggestion diff preview
        aiSuggestion && !aiSuggestion.applied ? e('div', {
          key: 'suggestion',
          style: {
          padding: '16px',
          borderTop: '2px solid var(--gold)',
          background: 'var(--bg-secondary)'
        }
      },
        e('div', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            color: 'var(--text-3)',
            marginBottom: '8px',
            textTransform: 'uppercase',
            fontWeight: 600
          }
        }, 'Suggestion'),
        e('div', {
          style: {
            marginBottom: '12px',
            maxHeight: '150px',
            overflowY: 'auto',
            padding: '12px',
            background: 'var(--bg-primary)',
            borderRadius: '4px',
            fontFamily: 'EB Garamond',
            fontSize: '14px',
            lineHeight: '1.6',
            color: 'var(--text)'
          }
        }, aiSuggestion.revised),
        e('div', {
          style: {
            display: 'flex',
            gap: '8px'
          }
        },
          e('button', {
            onClick: applyAiSuggestion,
            style: {
              flex: 1,
              padding: '10px',
              background: 'var(--gold)',
              border: 'none',
              borderRadius: '4px',
              color: '#000',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              fontWeight: 600
            }
          }, 'Apply'),
          e('button', {
            onClick: () => setAiSuggestion(null),
            style: {
              flex: 1,
              padding: '10px',
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text)',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px'
            }
          }, 'Dismiss')
        )
        ) : null,

        // Input area
        e('div', {
          key: 'input',
          style: {
          padding: '16px',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)'
        }
      },
        e('div', {
          style: {
            display: 'flex',
            gap: '8px'
          }
        },
          voiceInputAvailable ? e('button', {
            onClick: handleAiAssistantVoice,
            disabled: aiChatVoiceState !== 'idle',
            title: 'Voice input (Finnish)',
            style: {
              padding: '12px 16px',
              background: aiChatVoiceState === 'listening' ? 'var(--gold)' : 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: aiChatVoiceState === 'listening' ? '#000' : 'var(--text)',
              cursor: aiChatVoiceState === 'idle' ? 'pointer' : 'not-allowed',
              fontFamily: 'IBM Plex Mono',
              fontSize: '16px'
            }
          }, aiChatVoiceState === 'listening' ? '🎙️' : '🎤') : null,
          e('input', {
            type: 'text',
            value: aiChatInput,
            onChange: (ev) => setAiChatInput(ev.target.value),
            onKeyDown: (ev) => {
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                sendAiAssistantMessage();
              }
            },
            placeholder: textSelection ? 'How should I revise this?' : 'Ask me anything...',
            disabled: aiChatProcessing,
            style: {
              flex: 1,
              padding: '12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              outline: 'none'
            }
          }),
          e('button', {
            onClick: sendAiAssistantMessage,
            disabled: aiChatProcessing || !aiChatInput.trim(),
            style: {
              padding: '12px 20px',
              background: aiChatProcessing || !aiChatInput.trim() ? 'var(--bg-2)' : 'var(--bronze)',
              border: 'none',
              borderRadius: '4px',
              color: aiChatProcessing || !aiChatInput.trim() ? 'var(--text-3)' : '#000',
              cursor: aiChatProcessing || !aiChatInput.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              fontWeight: 600
            }
          }, aiChatProcessing ? '...' : '↑')
        ),
        e('div', {
          style: {
            marginTop: '8px',
            fontFamily: 'IBM Plex Mono',
            fontSize: '9px',
            color: 'var(--text-3)',
            textAlign: 'center'
          }
        }, 'Cmd+K to toggle • Enter to send')
        )
      ],

      // Regenerate Dialog
      showRegenerateDialog && e('div', {
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        },
        onClick: () => setShowRegenerateDialog(false)
      },
        e('div', {
          style: {
            background: 'var(--bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%'
          },
          onClick: (ev) => ev.stopPropagation()
        },
          e('h3', {
            style: {
              fontFamily: 'EB Garamond',
              fontSize: '20px',
              color: 'var(--text)',
              marginBottom: '16px'
            }
          }, 'Regeneroi Luku Palautteella'),

          // Feedback textarea
          e('div', { style: { marginBottom: '16px' } },
            e('label', {
              style: {
                display: 'block',
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)',
                marginBottom: '8px'
              }
            }, 'Anna palaute (mitä haluat muuttaa):'),
            e('textarea', {
              value: regenerateFeedback,
              onChange: (ev) => setRegenerateFeedback(ev.target.value),
              placeholder: 'Esim: "Tee tästä dramaattisempi", "Lisää dialogia", "Pidennä jännitystä"...',
              style: {
                width: '100%',
                minHeight: '100px',
                padding: '12px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                resize: 'vertical'
              }
            })
          ),

          // Mode selector
          e('div', { style: { marginBottom: '16px' } },
            e('label', {
              style: {
                display: 'block',
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)',
                marginBottom: '8px'
              }
            }, 'AI Mode:'),
            e('div', { style: { display: 'flex', gap: '4px' } },
              ['exploration', 'production', 'polish'].map(mode =>
                e('button', {
                  key: mode,
                  onClick: () => setRegenerateMode(mode),
                  style: {
                    flex: 1,
                    padding: '8px',
                    background: regenerateMode === mode ? project.ai.modes[mode].color : 'transparent',
                    border: `1px solid ${project.ai.modes[mode].color}`,
                    borderRadius: '4px',
                    color: regenerateMode === mode ? '#000' : 'var(--text-2)',
                    cursor: 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '10px',
                    fontWeight: regenerateMode === mode ? 600 : 400
                  }
                }, project.ai.modes[mode].name)
              )
            )
          ),

          // Buttons
          e('div', { style: { display: 'flex', gap: '8px', justifyContent: 'space-between' } },
            e('button', {
              onClick: () => {
                setShowRegenerateDialog(false);
                setShowVersionHistory(true);
              },
              style: {
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-2)',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px'
              }
            }, '📜 Versiohistoria'),
            e('div', { style: { display: 'flex', gap: '8px' } },
              e('button', {
                onClick: () => {
                  setShowRegenerateDialog(false);
                  setRegenerateFeedback('');
                },
                style: {
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px'
                }
              }, 'Peruuta'),
              e('button', {
                onClick: regenerateChapter,
                disabled: !regenerateFeedback.trim() || isGenerating,
                style: {
                  padding: '8px 16px',
                  background: !regenerateFeedback.trim() || isGenerating ? 'var(--bg-2)' : 'var(--bronze)',
                  border: 'none',
                  borderRadius: '4px',
                  color: !regenerateFeedback.trim() || isGenerating ? 'var(--text-3)' : '#000',
                  cursor: !regenerateFeedback.trim() || isGenerating ? 'not-allowed' : 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  fontWeight: 600
                }
              }, isGenerating ? 'Generoidaan...' : 'Generoi')
            )
          )
        )
      ),

      // Version History Dialog
      showVersionHistory && e('div', {
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001
        },
        onClick: () => setShowVersionHistory(false)
      },
        e('div', {
          style: {
            background: 'var(--bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '800px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          },
          onClick: (ev) => ev.stopPropagation()
        },
          e('h3', {
            style: {
              fontFamily: 'EB Garamond',
              fontSize: '20px',
              color: 'var(--text)',
              marginBottom: '16px'
            }
          }, 'Versiohistoria - ' + activeChapter.title),

          // Version list
          activeChapter.versions && activeChapter.versions.length > 0 ?
            activeChapter.versions.map((version, idx) =>
              e('div', {
                key: version.id,
                style: {
                  background: version.id === activeChapter.currentVersion ? 'var(--bg-2)' : 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '12px',
                  marginBottom: '12px'
                }
              },
                e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
                  e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    e('span', {
                      style: {
                        fontFamily: 'IBM Plex Mono',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text)'
                      }
                    }, version.id),
                    version.id === activeChapter.currentVersion ? e('span', {
                      style: {
                        fontSize: '11px',
                        color: 'var(--bronze)',
                        background: 'var(--bronze)' + '22',
                        padding: '2px 8px',
                        borderRadius: '3px',
                        fontFamily: 'IBM Plex Mono'
                      }
                    }, 'Nykyinen') : null
                  ),
                  e('span', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px',
                      color: 'var(--text-3)'
                    }
                  }, new Date(version.timestamp).toLocaleString('fi-FI'))
                ),

                // Version info
                version.generatedFrom && e('div', {
                  style: {
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '8px',
                    fontFamily: 'IBM Plex Mono'
                  }
                },
                  version.generatedFrom.isRefinement && version.generatedFrom.userFeedback ?
                    `Palaute: "${version.generatedFrom.userFeedback}"` :
                    `Generoitu: ${version.generatedFrom.mode} (${version.generatedFrom.model})`
                ),

                // Word count
                e('div', {
                  style: {
                    fontSize: '11px',
                    color: 'var(--text-3)',
                    marginBottom: '8px',
                    fontFamily: 'IBM Plex Mono'
                  }
                }, `${version.wordCount || 0} sanaa`),

                // Star rating
                e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } },
                  e('span', { style: { fontSize: '11px', color: 'var(--text-3)' } }, 'Arvio:'),
                  [1,2,3,4,5].map(star =>
                    e('span', {
                      key: star,
                      onClick: () => rateVersion(version.id, star),
                      style: {
                        cursor: 'pointer',
                        fontSize: '16px',
                        color: version.userRating && star <= version.userRating ? '#FFB800' : 'var(--text-3)'
                      }
                    }, '★')
                  )
                ),

                // User feedback
                version.userFeedback && e('div', {
                  style: {
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '8px',
                    fontFamily: 'IBM Plex Mono',
                    fontStyle: 'italic'
                  }
                }, `"${version.userFeedback}"`),

                // Actions
                e('div', { style: { display: 'flex', gap: '8px' } },
                  version.id !== activeChapter.currentVersion ? e('button', {
                    onClick: () => {
                      restoreVersion(version.id);
                      setShowVersionHistory(false);
                    },
                    style: {
                      padding: '4px 12px',
                      background: 'var(--bronze)',
                      border: 'none',
                      borderRadius: '4px',
                      color: '#000',
                      cursor: 'pointer',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px'
                    }
                  }, 'Palauta') : null,
                  e('button', {
                    onClick: () => {
                      setComparisonVersionId(version.id);
                      setShowVersionComparison(true);
                      setShowVersionHistory(false);
                    },
                    style: {
                      padding: '4px 12px',
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px'
                    }
                  }, 'Vertaa')
                )
              )
            ) :
            e('div', {
              style: {
                textAlign: 'center',
                padding: '40px',
                color: 'var(--text-3)',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px'
              }
            }, 'Ei versioita'),

          // Close button
          e('div', { style: { marginTop: '16px', display: 'flex', justifyContent: 'flex-end' } },
            e('button', {
              onClick: () => setShowVersionHistory(false),
              style: {
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px'
              }
            }, 'Sulje')
          )
        )
      ),

      // Project Settings Dialog
      showProjectSettings && e('div', {
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10002
        },
        onClick: () => setShowProjectSettings(false)
      },
        e('div', {
          style: {
            background: 'var(--bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '32px',
            width: '600px',
            maxHeight: '80vh',
            overflow: 'auto'
          },
          onClick: (ev) => ev.stopPropagation()
        },
          // Header
          e('h2', {
            style: {
              fontFamily: 'EB Garamond',
              fontSize: '24px',
              color: 'var(--text)',
              marginBottom: '24px',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '12px'
            }
          }, 'Projektin asetukset'),

          // Title
          e('div', { style: { marginBottom: '20px' } },
            e('label', {
              htmlFor: 'project-title',
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)',
                display: 'block',
                marginBottom: '6px',
                textTransform: 'uppercase'
              }
            }, 'Projektin nimi'),
            e('input', {
              id: 'project-title',
              name: 'projectTitle',
              type: 'text',
              value: project.title,
              onChange: (ev) => {
                setProject(prev => ({ ...prev, title: ev.target.value }));
                setUnsavedChanges(true);
              },
              style: {
                width: '100%',
                padding: '10px',
                background: 'var(--bg-1)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'EB Garamond',
                fontSize: '16px'
              }
            })
          ),

          // Author
          e('div', { style: { marginBottom: '20px' } },
            e('label', {
              htmlFor: 'project-author',
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)',
                display: 'block',
                marginBottom: '6px',
                textTransform: 'uppercase'
              }
            }, 'Kirjoittaja'),
            e('input', {
              id: 'project-author',
              name: 'projectAuthor',
              type: 'text',
              value: project.author || '',
              onChange: (ev) => {
                setProject(prev => ({ ...prev, author: ev.target.value }));
                setUnsavedChanges(true);
              },
              style: {
                width: '100%',
                padding: '10px',
                background: 'var(--bg-1)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'EB Garamond',
                fontSize: '16px'
              }
            })
          ),

          // Genre
          e('div', { style: { marginBottom: '20px' } },
            e('label', {
              htmlFor: 'project-genre',
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)',
                display: 'block',
                marginBottom: '6px',
                textTransform: 'uppercase'
              }
            }, 'Genre'),
            e('select', {
              id: 'project-genre',
              name: 'projectGenre',
              value: project.genre || 'fiction',
              onChange: (ev) => {
                setProject(prev => ({ ...prev, genre: ev.target.value }));
                setUnsavedChanges(true);
              },
              style: {
                width: '100%',
                padding: '10px',
                background: 'var(--bg-1)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'IBM Plex Mono',
                fontSize: '14px'
              }
            },
              e('option', { value: 'fiction' }, 'Fiktio'),
              e('option', { value: 'fantasy' }, 'Fantasia'),
              e('option', { value: 'scifi' }, 'Sci-fi'),
              e('option', { value: 'mystery' }, 'Mysteeri'),
              e('option', { value: 'thriller' }, 'Trilleri'),
              e('option', { value: 'romance' }, 'Romanssi'),
              e('option', { value: 'horror' }, 'Kauhu'),
              e('option', { value: 'literary' }, 'Kaunokirjallisuus'),
              e('option', { value: 'nonfiction' }, 'Tietokirja')
            )
          ),

          // Target word count
          e('div', { style: { marginBottom: '20px' } },
            e('label', {
              htmlFor: 'project-target-wordcount',
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)',
                display: 'block',
                marginBottom: '6px',
                textTransform: 'uppercase'
              }
            }, 'Tavoitesanamäärä'),
            e('input', {
              id: 'project-target-wordcount',
              name: 'projectTargetWordCount',
              type: 'number',
              value: project.targetWordCount || 50000,
              onChange: (ev) => {
                setProject(prev => ({ ...prev, targetWordCount: parseInt(ev.target.value) || 0 }));
                setUnsavedChanges(true);
              },
              style: {
                width: '100%',
                padding: '10px',
                background: 'var(--bg-1)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'IBM Plex Mono',
                fontSize: '14px'
              }
            })
          ),

          // Language
          e('div', { style: { marginBottom: '24px' } },
            e('label', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)',
                display: 'block',
                marginBottom: '6px',
                textTransform: 'uppercase'
              }
            }, 'Tarinan kieli'),
            e('select', {
              value: project.language || 'fi',
              onChange: (ev) => {
                setProject(prev => ({ ...prev, language: ev.target.value }));
                setUnsavedChanges(true);
              },
              style: {
                width: '100%',
                padding: '10px',
                background: 'var(--bg-1)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'IBM Plex Mono',
                fontSize: '14px'
              }
            },
              e('option', { value: 'fi' }, '🇫🇮 Suomi'),
              e('option', { value: 'en' }, '🇬🇧 English')
            )
          ),

          // Buttons
          e('div', { style: { display: 'flex', gap: '12px', justifyContent: 'flex-end' } },
            e('button', {
              onClick: () => setShowProjectSettings(false),
              style: {
                padding: '10px 20px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '13px'
              }
            }, 'Peruuta'),
            e('button', {
              onClick: () => {
                setShowProjectSettings(false);
                if (currentFilePath) {
                  saveProject();
                }
              },
              style: {
                padding: '10px 20px',
                background: 'var(--bronze)',
                border: 'none',
                borderRadius: '4px',
                color: '#000',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '13px',
                fontWeight: 600
              }
            }, 'Tallenna')
          )
        )
      ),

      // Version Comparison Dialog with Diff Highlighting
      showVersionComparison && comparisonVersionId && (() => {
        const compVersion = activeChapter.versions?.find(v => v.id === comparisonVersionId);
        const compContent = compVersion?.content || '';
        const currentContent = activeChapter.content || '';
        const diffResult = computeTextDiff(compContent, currentContent);
        const addedCount = diffResult.filter(d => d.type === 'added' && d.text.trim()).length;
        const removedCount = diffResult.filter(d => d.type === 'removed' && d.text.trim()).length;
        const currentWords = currentContent.split(/\s+/).filter(Boolean).length;
        const compWords = compContent.split(/\s+/).filter(Boolean).length;

        return e('div', {
          style: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10002
          },
          onClick: () => setShowVersionComparison(false)
        },
          e('div', {
            style: {
              background: 'var(--bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '1400px',
              width: '95%',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            },
            onClick: (ev) => ev.stopPropagation()
          },
            // Header with stats
            e('div', {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                paddingBottom: '12px',
                borderBottom: '1px solid var(--border-color)'
              }
            },
              e('h3', {
                style: {
                  fontFamily: 'EB Garamond',
                  fontSize: '20px',
                  color: 'var(--text)',
                  margin: 0
                }
              }, 'Versiovertailu - ' + activeChapter.title),
              e('div', {
                style: {
                  display: 'flex',
                  gap: '16px',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px'
                }
              },
                e('span', { style: { color: '#4CAF50' } }, `+${addedCount} lisätty`),
                e('span', { style: { color: '#f44336' } }, `-${removedCount} poistettu`),
                e('span', { style: { color: 'var(--text-2)' } },
                  `${currentWords - compWords > 0 ? '+' : ''}${currentWords - compWords} sanaa`
                )
              )
            ),

            // View mode tabs
            e('div', {
              style: {
                display: 'flex',
                gap: '8px',
                marginBottom: '16px'
              }
            },
              e('button', {
                onClick: () => {},
                style: {
                  padding: '6px 12px',
                  background: 'var(--bronze)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#000',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  fontWeight: 600
                }
              }, '📊 Vierekkäin'),
              e('button', {
                onClick: () => {},
                style: {
                  padding: '6px 12px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px'
                }
              }, '🔀 Yhdistetty diff')
            ),

            // Side-by-side comparison
            e('div', {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                flex: 1,
                overflow: 'hidden'
              }
            },
              // Comparison version (old)
              e('div', {
                style: {
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }
              },
                e('div', {
                  style: {
                    padding: '12px 16px',
                    background: 'var(--surface-2)',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }
                },
                  e('h4', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '12px',
                      color: 'var(--text-2)',
                      margin: 0
                    }
                  }, `📸 ${comparisonVersionId}`),
                  e('span', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px',
                      color: 'var(--text-3)'
                    }
                  }, `${compWords} sanaa`)
                ),
                e('div', {
                  style: {
                    padding: '16px',
                    overflow: 'auto',
                    flex: 1,
                    fontFamily: 'EB Garamond',
                    fontSize: '14px',
                    lineHeight: '1.8',
                    color: 'var(--text)',
                    whiteSpace: 'pre-wrap'
                  }
                }, compContent || 'Tyhjä versio')
              ),

              // Current version (new)
              e('div', {
                style: {
                  border: '1px solid var(--bronze)',
                  borderRadius: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }
              },
                e('div', {
                  style: {
                    padding: '12px 16px',
                    background: 'var(--bronze)' + '22',
                    borderBottom: '1px solid var(--bronze)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }
                },
                  e('h4', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '12px',
                      color: 'var(--bronze)',
                      margin: 0
                    }
                  }, `✏️ Nykyinen (${activeChapter.currentVersion})`),
                  e('span', {
                    style: {
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '11px',
                      color: 'var(--text-3)'
                    }
                  }, `${currentWords} sanaa`)
                ),
                e('div', {
                  style: {
                    padding: '16px',
                    overflow: 'auto',
                    flex: 1,
                    fontFamily: 'EB Garamond',
                    fontSize: '14px',
                    lineHeight: '1.8'
                  }
                },
                  // Render diff with highlighting
                  ...diffResult.map((part, idx) => {
                    if (part.type === 'same') {
                      return e('span', { key: idx, style: { color: 'var(--text)' } }, part.text);
                    } else if (part.type === 'added') {
                      return e('span', {
                        key: idx,
                        style: {
                          background: '#4CAF5033',
                          color: '#4CAF50',
                          borderRadius: '2px'
                        }
                      }, part.text);
                    } else if (part.type === 'removed') {
                      return e('span', {
                        key: idx,
                        style: {
                          background: '#f4433633',
                          color: '#f44336',
                          textDecoration: 'line-through',
                          borderRadius: '2px'
                        }
                      }, part.text);
                    }
                    return null;
                  })
                )
              )
            ),

            // Actions
            e('div', {
              style: {
                marginTop: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }
            },
              e('button', {
                onClick: () => {
                  if (confirm('Palauta tämä versio? Nykyinen sisältö korvataan.')) {
                    restoreVersion(comparisonVersionId);
                    setShowVersionComparison(false);
                  }
                },
                style: {
                  padding: '8px 16px',
                  background: 'var(--bronze)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#000',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  fontWeight: 600
                }
              }, '⏪ Palauta tämä versio'),
              e('button', {
                onClick: () => setShowVersionComparison(false),
                style: {
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px'
                }
              }, 'Sulje')
            )
          )
        );
      })()
    ),

    // CharacterSheet Modal (View/Edit Characters)
    showCharacterSheet && e('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }
    },
      e('div', {
        style: {
          background: 'var(--bg-1)',
          border: '2px solid var(--bronze)',
          borderRadius: '8px',
          padding: '32px',
          maxWidth: '900px',
          width: '95%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative'
        }
      },
        // Header
        e('h2', {
          style: {
            fontFamily: 'EB Garamond',
            fontSize: '24px',
            color: 'var(--text)',
            marginBottom: '8px'
          }
        }, characterSheetMode === 'list' ?
           e('span', null, CharacterEngineLogo(20), ' Characters') :
           characterSheetMode === 'view' ?
           e('span', null, CharacterEngineLogo(20), ` ${selectedCharacter?.basicInfo?.name || selectedCharacter?.name || 'Character'}`) :
           '✏️ Edit Character'),

        e('p', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: 'var(--text-2)',
            marginBottom: '24px'
          }
        }, characterSheetMode === 'list' ? `${project.characters.length} characters in your story` :
           characterSheetMode === 'view' ? 'View character profile' :
           'Edit character details'),

        // Close button
        e('button', {
          onClick: () => {
            setShowCharacterSheet(false);
            setCharacterSheetMode('list');
            setSelectedCharacter(null);
          },
          style: {
            position: 'absolute',
            top: '24px',
            right: '24px',
            background: 'transparent',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text-3)',
            padding: '4px 12px',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px'
          }
        }, 'Close'),

        // LIST MODE: Show all characters
        characterSheetMode === 'list' && e('div', null,
          e('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px'
            }
          },
            project.characters.map((char, idx) => {
              const name = char.basicInfo?.name || char.name || `Character ${idx + 1}`;
              const role = char.basicInfo?.role || char.role || '';
              const archetype = char.archetype?.primaryArchetype || '';

              return e('div', {
                key: idx,
                onClick: () => {
                  setSelectedCharacter(char);
                  setCharacterSheetMode('view');
                },
                style: {
                  padding: '16px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }
              },
                e('h3', {
                  style: {
                    fontFamily: 'EB Garamond',
                    fontSize: '18px',
                    color: 'var(--text)',
                    marginBottom: '6px'
                  }
                }, name),

                role && e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '4px'
                  }
                }, role),

                archetype && e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '10px',
                    color: 'var(--bronze)',
                    marginTop: '8px'
                  }
                }, `Archetype: ${archetype}`)
              );
            })
          )
        ),

        // VIEW MODE: Show character details
        characterSheetMode === 'view' && selectedCharacter && e('div', null,
          // Basic Info
          e('div', {
            style: {
              marginBottom: '24px',
              padding: '16px',
              background: 'var(--bg-2)',
              borderRadius: '6px',
              border: '1px solid var(--border-color)'
            }
          },
            e('h3', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text-3)',
                marginBottom: '12px'
              }
            }, 'BASIC INFO'),

            selectedCharacter.basicInfo && Object.entries(selectedCharacter.basicInfo).map(([key, value]) =>
              e('div', {
                key,
                style: {
                  marginBottom: '8px',
                  display: 'flex',
                  gap: '8px'
                }
              },
                e('span', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-3)',
                    minWidth: '120px'
                  }
                }, key + ':'),
                e('span', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px',
                    color: 'var(--text)'
                  }
                }, String(value))
              )
            )
          ),

          // Psychological Layer
          selectedCharacter.psychological && e('div', {
            style: {
              marginBottom: '24px',
              padding: '16px',
              background: 'var(--bg-2)',
              borderRadius: '6px',
              border: '1px solid var(--border-color)'
            }
          },
            e('h3', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text-3)',
                marginBottom: '12px'
              }
            }, 'PSYCHOLOGICAL PROFILE'),

            e('div', {
              style: {
                fontFamily: 'EB Garamond',
                fontSize: '14px',
                lineHeight: '1.7',
                color: 'var(--text)',
                whiteSpace: 'pre-wrap'
              }
            }, typeof selectedCharacter.psychological === 'string'
               ? selectedCharacter.psychological
               : JSON.stringify(selectedCharacter.psychological, null, 2))
          ),

          // Back button
          e('div', {
            style: {
              marginTop: '24px',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-start'
            }
          },
            e('button', {
              onClick: () => setCharacterSheetMode('list'),
              style: {
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px'
              }
            }, '← Back to List'),

            e('button', {
              onClick: () => {
                if (confirm(`Delete character "${selectedCharacter.basicInfo?.name || selectedCharacter.name}"?`)) {
                  const charIndex = project.characters.indexOf(selectedCharacter);
                  if (charIndex > -1) {
                    project.characters.splice(charIndex, 1);
                    setProject({ ...project });
                    setUnsavedChanges(true);
                    setCharacterSheetMode('list');
                    setSelectedCharacter(null);
                  }
                }
              },
              style: {
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid #f44336',
                borderRadius: '4px',
                color: '#f44336',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px'
              }
            }, '🗑️ Delete Character')
          )
        )
      )
    ),

    // LocationSheet Modal (List View)
    showLocationSheet && e('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }
    },
      e('div', {
        style: {
          background: 'var(--bg-1)',
          border: '2px solid var(--bronze)',
          borderRadius: '8px',
          padding: '32px',
          maxWidth: '800px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative'
        }
      },
        e('h2', { style: { fontFamily: 'EB Garamond', fontSize: '24px', color: 'var(--text)', marginBottom: '8px' } }, '📍 Story Locations'),
        e('p', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', marginBottom: '16px' } },
          `${Object.keys(project.continuity?.locations || {}).length} locations tracked`),

        // Close button
        e('button', {
          onClick: () => setShowLocationSheet(false),
          style: {
            position: 'absolute',
            top: '24px',
            right: '24px',
            background: 'transparent',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text-3)',
            padding: '4px 12px',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px'
          }
        }, 'Close'),

        // Create Location button
        e('button', {
          onClick: () => {
            setSelectedLocation(null);
            setLocationFormMode('create');
            setShowLocationFormModal(true);
          },
          style: {
            width: '100%',
            padding: '12px',
            marginBottom: '16px',
            background: 'var(--bronze)',
            border: 'none',
            borderRadius: '4px',
            color: '#000',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono',
            fontSize: '13px',
            fontWeight: 600
          }
        }, '+ Create New Location'),

        // Locations grid
        e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' } },
          Object.values(project.continuity?.locations || {}).map(loc =>
            e('div', {
              key: loc.name,
              onClick: () => {
                setSelectedLocation(loc);
                setLocationFormMode('view');
                setShowLocationFormModal(true);
              },
              style: {
                padding: '12px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }
            },
              e('h3', { style: { fontFamily: 'EB Garamond', fontSize: '16px', color: 'var(--text)', marginBottom: '6px' } }, loc.name),
              e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)', marginBottom: '4px' } },
                `First mentioned: Chapter ${loc.firstMentioned + 1}`),
              e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } },
                `Appearances: ${(loc.appearances || []).length}`)
            )
          )
        )
      )
    ),

    // LocationSheet Form Modal (Create/Edit/View) - External Component
    showLocationFormModal && window.LocationSheetModal && e(window.LocationSheetModal, {
      isOpen: showLocationFormModal,
      onClose: () => {
        setShowLocationFormModal(false);
        setSelectedLocation(null);
      },
      location: selectedLocation,
      locations: Object.values(project.continuity?.locations || {}),
      onSave: handleLocationSave,
      mode: locationFormMode
    }),

    // ThreadSheet Modal (Plot Threads List View)
    showThreadSheet && e('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }
    },
      e('div', {
        style: {
          background: 'var(--bg-1)',
          border: '2px solid var(--bronze)',
          borderRadius: '8px',
          padding: '32px',
          maxWidth: '900px',
          width: '95%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative'
        }
      },
        e('h2', { style: { fontFamily: 'EB Garamond', fontSize: '24px', color: 'var(--text)', marginBottom: '8px' } }, '🧵 Plot Threads'),
        e('p', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', marginBottom: '16px' } },
          `${(project.plotThreads || []).length} threads in your story`),

        // Close button
        e('button', {
          onClick: () => setShowThreadSheet(false),
          style: {
            position: 'absolute',
            top: '24px',
            right: '24px',
            background: 'transparent',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text-3)',
            padding: '4px 12px',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px'
          }
        }, 'Close'),

        // Create Thread button
        e('button', {
          onClick: () => {
            setSelectedThread(null);
            setThreadFormMode('create');
            setShowThreadFormModal(true);
          },
          style: {
            width: '100%',
            padding: '12px',
            marginBottom: '16px',
            background: 'var(--bronze)',
            border: 'none',
            borderRadius: '4px',
            color: '#000',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono',
            fontSize: '13px',
            fontWeight: 600
          }
        }, '+ Create New Thread'),

        // Threads list
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
          (project.plotThreads || []).map((thread, idx) =>
            e('div', {
              key: idx,
              onClick: () => {
                setSelectedThread(thread);
                setThreadFormMode('view');
                setShowThreadFormModal(true);
              },
              style: {
                padding: '16px',
                background: 'var(--bg-2)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }
            },
              e('h3', { style: { fontFamily: 'EB Garamond', fontSize: '18px', color: 'var(--text)', marginBottom: '8px' } },
                thread.name || `Thread ${idx + 1}`),
              thread.description && e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', marginBottom: '8px' } },
                thread.description),
              e('div', { style: { display: 'flex', gap: '12px', marginTop: '8px' } },
                thread.type && e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--sigil)' } },
                  `Type: ${thread.type}`),
                thread.status && e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: thread.status === 'resolved' ? '#4CAF50' : '#FFA726' } },
                  `Status: ${thread.status}`)
              )
            )
          )
        )
      )
    ),

    // ThreadSheet Form Modal (Create/Edit/View) - External Component
    showThreadFormModal && window.ThreadSheetModal && e(window.ThreadSheetModal, {
      isOpen: showThreadFormModal,
      onClose: () => {
        setShowThreadFormModal(false);
        setSelectedThread(null);
      },
      thread: selectedThread,
      threads: project.plotThreads || [],
      onSave: handleThreadSave,
      mode: threadFormMode
    }),

    // ChapterSheet Modal (Edit Chapter Details)
    showChapterSheetModal && window.ChapterSheetModal && e(window.ChapterSheetModal, {
      chapter: activeChapter,
      mode: 'edit',
      onSave: handleChapterSheetSave,
      onClose: () => setShowChapterSheetModal(false)
    }),

    // Export Modal (Interactive Export Dialog)
    showExportModal && window.ExportModal && e(window.ExportModal, {
      isOpen: showExportModal,
      onClose: () => setShowExportModal(false),
      project: project,
      activeChapter: activeChapter,
      onExport: handleExportFromModal,
      exportPresets: project.exportPresets || [],
      onSavePreset: (preset) => {
        setProject(prev => ({
          ...prev,
          exportPresets: [...(prev.exportPresets || []), { ...preset, id: `preset-${Date.now()}` }]
        }));
        setUnsavedChanges(true);
      },
      onDeletePreset: (presetId) => {
        setProject(prev => ({
          ...prev,
          exportPresets: (prev.exportPresets || []).filter(p => p.id !== presetId)
        }));
        setUnsavedChanges(true);
      }
    }),

    // Hybrid Writing Flow Dialog (Continue/Expand/Rewrite/Scene)
    showContinueDialog && e('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }
    },
      e('div', {
        style: {
          background: 'var(--bg-1)',
          border: '2px solid var(--bronze)',
          borderRadius: '8px',
          padding: '32px',
          maxWidth: '900px',
          width: '95%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative'
        }
      },
        // Header
        e('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '24px'
          }
        },
          e('div', null,
            e('h2', { style: { fontFamily: 'EB Garamond', fontSize: '24px', color: 'var(--text)', marginBottom: '8px' } }, '✍️ Hybrid Writing Flow'),
            e('p', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)' } },
              'AI avustaa kirjoitustyössäsi eri tavoilla')
          ),
          e('button', {
            onClick: () => {
              setShowContinueDialog(false);
              setContinuePreview('');
              setHybridInput('');
            },
            style: {
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text-3)',
              padding: '6px 14px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px'
            }
          }, '✕ Sulje')
        ),

        // Mode selector tabs
        !continuePreview && e('div', {
          style: {
            display: 'flex',
            gap: '8px',
            marginBottom: '24px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '16px'
          }
        },
          ['continue', 'expand', 'rewrite', 'scene'].map(mode => {
            const labels = {
              continue: '📝 Jatka',
              expand: '📖 Laajenna',
              rewrite: '🔄 Uudelleenkirjoita',
              scene: '🎬 Luo kohtaus'
            };
            const isActive = hybridMode === mode;
            const isDisabled = mode === 'rewrite' && !textSelection?.text;

            return e('button', {
              key: mode,
              onClick: () => !isDisabled && setHybridMode(mode),
              disabled: isDisabled,
              style: {
                flex: 1,
                padding: '10px 12px',
                background: isActive ? 'var(--bronze)' : 'transparent',
                border: `1px solid ${isActive ? 'var(--bronze)' : 'var(--border-color)'}`,
                borderRadius: '4px',
                color: isActive ? '#000' : isDisabled ? 'var(--text-3)' : 'var(--text)',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                fontWeight: isActive ? 600 : 400,
                opacity: isDisabled ? 0.5 : 1
              }
            }, labels[mode]);
          })
        ),

        // Mode-specific content
        !continuePreview && e('div', { style: { marginBottom: '24px' } },
          // Continue mode
          hybridMode === 'continue' && e('div', null,
            e('div', { style: { marginBottom: '16px' } },
              e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', display: 'block', marginBottom: '8px' } },
                `Kappaleiden määrä: ${continueParagraphs}`),
              e('input', {
                type: 'range',
                min: 1,
                max: 5,
                value: continueParagraphs,
                onChange: (ev) => setContinueParagraphs(parseInt(ev.target.value)),
                style: { width: '100%', cursor: 'pointer' }
              })
            ),
            e('div', {
              style: {
                padding: '12px',
                background: 'var(--bg-2)',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)'
              }
            }, '💡 AI jatkaa kirjoittamista nykyisen tekstisi lopusta samassa tyylissä.')
          ),

          // Expand mode
          hybridMode === 'expand' && e('div', null,
            e('div', { style: { marginBottom: '16px' } },
              e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', display: 'block', marginBottom: '8px' } }, 'Tiivistelmä tai synopsis:'),
              e('textarea', {
                value: hybridInput,
                onChange: (ev) => setHybridInput(ev.target.value),
                placeholder: 'Kirjoita lyhyt tiivistelmä tai sisällysluettelo, jonka haluat laajentaa täysiksi kappaleiksi...',
                style: {
                  width: '100%',
                  height: '120px',
                  padding: '12px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              })
            ),
            e('div', { style: { display: 'flex', gap: '16px', marginBottom: '16px' } },
              e('div', { style: { flex: 1 } },
                e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' } },
                  `Tavoite: ${hybridTargetWords} sanaa`),
                e('input', {
                  type: 'range',
                  min: 500,
                  max: 4000,
                  step: 500,
                  value: hybridTargetWords,
                  onChange: (ev) => setHybridTargetWords(parseInt(ev.target.value)),
                  style: { width: '100%' }
                })
              ),
              e('div', { style: { flex: 1 } },
                e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' } }, 'Tyyli:'),
                e('select', {
                  value: hybridStyle,
                  onChange: (ev) => setHybridStyle(ev.target.value),
                  style: {
                    width: '100%',
                    padding: '6px 8px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px'
                  }
                },
                  e('option', { value: 'vivid' }, 'Eloisa'),
                  e('option', { value: 'concise' }, 'Tiivis'),
                  e('option', { value: 'descriptive' }, 'Kuvaileva'),
                  e('option', { value: 'dialogue-heavy' }, 'Dialogipainotteinen')
                )
              )
            )
          ),

          // Rewrite mode
          hybridMode === 'rewrite' && e('div', null,
            textSelection?.text ? e('div', null,
              e('div', {
                style: {
                  marginBottom: '16px',
                  padding: '12px',
                  background: 'var(--bg-2)',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)'
                }
              },
                e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)', marginBottom: '8px' } }, 'VALITTU TEKSTI:'),
                e('div', {
                  style: {
                    fontFamily: 'EB Garamond',
                    fontSize: '14px',
                    color: 'var(--text)',
                    maxHeight: '100px',
                    overflow: 'auto'
                  }
                }, textSelection.text)
              ),
              e('div', { style: { marginBottom: '16px' } },
                e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', display: 'block', marginBottom: '8px' } }, 'Ohjeet uudelleenkirjoitukseen:'),
                e('input', {
                  type: 'text',
                  value: hybridInput,
                  onChange: (ev) => setHybridInput(ev.target.value),
                  placeholder: 'esim. "tee dramaattisemmaksi", "lisää dialogia", "tiivistä"...',
                  style: {
                    width: '100%',
                    padding: '12px',
                    background: 'var(--bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px'
                  }
                })
              )
            ) : e('div', {
              style: {
                padding: '24px',
                background: 'var(--bg-2)',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                textAlign: 'center'
              }
            },
              e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-3)' } },
                '⚠️ Valitse ensin tekstiä editorista, jota haluat uudelleenkirjoittaa.')
            )
          ),

          // Scene mode
          hybridMode === 'scene' && e('div', null,
            e('div', { style: { marginBottom: '16px' } },
              e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', display: 'block', marginBottom: '8px' } }, 'Kohtauksen kuvaus:'),
              e('textarea', {
                value: hybridInput,
                onChange: (ev) => setHybridInput(ev.target.value),
                placeholder: 'Kuvaile kohtaus lyhyesti: keitä on paikalla, mitä tapahtuu, mikä on tunnelma...',
                style: {
                  width: '100%',
                  height: '100px',
                  padding: '12px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              })
            ),
            e('div', { style: { display: 'flex', gap: '16px' } },
              e('div', { style: { flex: 1 } },
                e('label', { style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', display: 'block', marginBottom: '4px' } },
                  `Pituus: ~${hybridTargetWords} sanaa`),
                e('input', {
                  type: 'range',
                  min: 300,
                  max: 2500,
                  step: 100,
                  value: hybridTargetWords,
                  onChange: (ev) => setHybridTargetWords(parseInt(ev.target.value)),
                  style: { width: '100%' }
                })
              )
            )
          )
        ),

        // Generate button
        !continuePreview && e('button', {
          onClick: () => {
            if (hybridMode === 'continue') handleContinueWriting();
            else if (hybridMode === 'expand') handleExpandOutline();
            else if (hybridMode === 'rewrite') handleRewriteSection();
            else if (hybridMode === 'scene') handleGenerateScene();
          },
          disabled: continuingWriting || (hybridMode !== 'continue' && !hybridInput.trim()) || (hybridMode === 'rewrite' && !textSelection?.text),
          style: {
            width: '100%',
            padding: '14px',
            background: continuingWriting ? 'var(--bg-2)' : 'var(--sigil)',
            border: 'none',
            borderRadius: '4px',
            color: continuingWriting ? 'var(--text-3)' : '#000',
            cursor: continuingWriting ? 'not-allowed' : 'pointer',
            fontFamily: 'IBM Plex Mono',
            fontSize: '13px',
            fontWeight: 600,
            opacity: (continuingWriting || (hybridMode !== 'continue' && !hybridInput.trim())) ? 0.5 : 1
          }
        }, continuingWriting ? '⏳ Generoidaan...' : '✨ Generoi'),

        // Preview
        continuePreview && e('div', null,
          e('div', {
            style: {
              marginBottom: '16px',
              padding: '20px',
              background: 'var(--bg-2)',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              maxHeight: '400px',
              overflow: 'auto'
            }
          },
            e('div', {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
              }
            },
              e('h3', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--bronze)', margin: 0 } },
                hybridMode === 'continue' ? '📝 JATKO' : hybridMode === 'expand' ? '📖 LAAJENNETTU' : hybridMode === 'rewrite' ? '🔄 UUDELLEENKIRJOITETTU' : '🎬 KOHTAUS'),
              e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } },
                `${continuePreview.split(/\s+/).length} sanaa`)
            ),
            e('div', {
              style: {
                fontFamily: 'EB Garamond',
                fontSize: '14px',
                lineHeight: '1.8',
                color: 'var(--text)',
                whiteSpace: 'pre-wrap'
              }
            }, continuePreview)
          ),

          // Accept/Reject buttons
          e('div', { style: { display: 'flex', gap: '12px' } },
            e('button', {
              onClick: () => {
                if (hybridMode === 'continue') acceptContinuation();
                else if (hybridMode === 'rewrite') acceptRewrite();
                else acceptExpansion();
              },
              style: {
                flex: 1,
                padding: '12px',
                background: 'var(--sigil)',
                border: 'none',
                borderRadius: '4px',
                color: '#000',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                fontWeight: 600
              }
            }, hybridMode === 'continue' ? '✓ Liitä loppuun' : hybridMode === 'rewrite' ? '✓ Korvaa valittu' : '✓ Korvaa luku'),
            e('button', {
              onClick: () => {
                setContinuePreview('');
              },
              style: {
                flex: 1,
                padding: '12px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px'
              }
            }, '🔄 Generoi uudelleen'),
            e('button', {
              onClick: rejectContinuation,
              style: {
                padding: '12px 20px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-2)',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px'
              }
            }, '✗ Hylkää')
          )
        )
      )
    ),

    // Claude Chat Component
    window.ClaudeChat && e(window.ClaudeChat, {
      project: project,
      activeChapter: activeChapter,
      isOpen: claudeChatOpen,
      onClose: () => setClaudeChatOpen(false),
      onInsertText: (text) => {
        if (activeChapter) {
          const newContent = (activeChapter.content || '') + '\n\n' + text;
          handleTextChange(newContent);
        }
      }
    }),

    // Claude Chat Toggle Button (floating)
    !claudeChatOpen && e('button', {
      onClick: () => setClaudeChatOpen(true),
      title: 'Avaa Claude Assistentti',
      style: {
        position: 'fixed',
        right: '20px',
        bottom: '20px',
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: 'var(--accent, #8b7355)',
        border: 'none',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        zIndex: 999,
        transition: 'transform 0.2s, box-shadow 0.2s'
      },
      onMouseEnter: (ev) => {
        ev.target.style.transform = 'scale(1.1)';
        ev.target.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.3)';
      },
      onMouseLeave: (ev) => {
        ev.target.style.transform = 'scale(1)';
        ev.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
      }
    }, '✨')
  );
}

// Mount the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(e(FAUSTApp));

console.log('[FAUST] Simple app loaded ✨');
console.log('[FAUST] VERSION: 2025-10-22-23:40 - LIMINAL ENGINE ADDED');

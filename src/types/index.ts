/**
 * FAUST - TypeScript Type Definitions
 * Version: 2.1.0
 *
 * This file contains type definitions for the FAUST project.
 * Use these types to improve code safety and IDE autocomplete.
 */

// ============================================================================
// PROJECT & STRUCTURE TYPES
// ============================================================================

export interface Project {
  // Metadata
  title: string;
  author: string;
  genre?: string;
  language?: string;
  description?: string;
  targetWordCount?: number;
  created: string;
  modified: string;

  // Structure
  structure: Chapter[];

  // Story Elements
  characters: Character[];
  locations: Location[];
  plotThreads: PlotThread[];

  // AI Configuration
  apiConfig: APIConfig;
  ai?: AISettings;

  // Cast Plan
  castPlan?: CastPlan;

  // Version History
  versions?: Version[];

  // Metadata
  metadata?: {
    [key: string]: any;
  };
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  synopsis?: string;
  created: string;
  modified: string;
  wordCount: number;
  status?: 'plan' | 'draft' | 'revision' | 'final';
  povCharacter?: string;
  storyTimestamp?: string;
  mood?: string;
  notes?: string;
  annotations?: Annotation[];
  versions?: ChapterVersion[];
}

export interface ChapterVersion {
  id: string;
  content: string;
  timestamp: string;
  wordCount: number;
  rating?: number;
  feedback?: string;
}

// ============================================================================
// CHARACTER TYPES
// ============================================================================

export interface Character {
  id: string;
  name: string;
  description: string;
  age?: number;
  occupation?: string;
  background?: string;
  appearance?: string;
  createdAt: string;

  // 4-Layer Character System
  psychological?: PsychologicalLayer;
  transactional?: TransactionalLayer;
  archetypal?: ArchetypalLayer;
  characterArc?: CharacterArc;

  // Legacy fields
  psychology?: LegacyPsychology;
  shadow?: Shadow;
  voice?: Voice;
}

export interface PsychologicalLayer {
  bigFive: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  dsmCategory?: 'anxiety' | 'mood' | 'personality' | 'trauma_related' | 'none';
  existentialTerror?: {
    deathAnxiety: number;
    copingMechanism: 'heroism' | 'religiosity' | 'creativity' | 'relationships' | 'denial';
  };
  trauma?: {
    type: 'childhood' | 'loss' | 'violence' | 'betrayal' | 'other';
    severity: number;
    triggers: string[];
    coping: string;
  } | null;
  beliefSystem?: {
    core_beliefs: string[];
    values: string[];
    worldview: 'optimistic' | 'pessimistic' | 'realistic' | 'cynical';
  };
}

export interface TransactionalLayer {
  egoStates: {
    parent: number;
    adult: number;
    child: number;
  };
  dominantState: 'parent' | 'adult' | 'child';
  socialGame?: {
    game: 'victim' | 'rescuer' | 'persecutor' | 'none';
    pattern?: string;
  };
  communicationStyle: 'assertive' | 'passive' | 'aggressive' | 'passive_aggressive';
  attachmentStyle: 'secure' | 'anxious' | 'avoidant' | 'disorganized';
}

export interface ArchetypalLayer {
  primaryArchetype: Archetype;
  secondaryArchetypes?: Archetype[];
  mythicJourney?: {
    stage: JourneyStage;
    completion: number;
  };
  symbols?: string[];
  shadowWork?: {
    suppressedTraits: string[];
    projections: string[];
  };
}

export type Archetype =
  | 'hero'
  | 'mentor'
  | 'threshold_guardian'
  | 'herald'
  | 'shapeshifter'
  | 'shadow'
  | 'ally'
  | 'trickster'
  | 'innocent'
  | 'sage'
  | 'explorer'
  | 'outlaw'
  | 'magician'
  | 'lover'
  | 'jester'
  | 'caregiver'
  | 'creator'
  | 'ruler';

export type JourneyStage =
  | 'ordinary_world'
  | 'call_to_adventure'
  | 'refusal'
  | 'meeting_mentor'
  | 'crossing_threshold'
  | 'tests'
  | 'approach'
  | 'ordeal'
  | 'reward'
  | 'road_back'
  | 'resurrection'
  | 'return_with_elixir';

export interface CharacterArc {
  beginning: string;
  catalyst?: string;
  end: string;
  transformationType: 'positive' | 'negative' | 'tragic' | 'flat';
}

export interface LegacyPsychology {
  mbti?: string;
  enneagram?: string;
  traits?: string[];
}

export interface Shadow {
  hidden: string;
  fear: string;
  desire: string;
}

export interface Voice {
  style: string;
  examples: string[];
}

// ============================================================================
// LOCATION TYPES
// ============================================================================

export interface Location {
  id: string;
  name: string;
  type?: string;
  description?: string;
  atmosphere?: {
    mood?: string;
    colorPalette?: string;
    sounds?: string;
    scents?: string;
  };
  importance?: 'main' | 'secondary' | 'mentioned';
  appearances?: number;
  createdAt: string;
}

// ============================================================================
// PLOT THREAD TYPES
// ============================================================================

export interface PlotThread {
  id: string;
  name: string;
  type: 'main_plot' | 'subplot' | 'mystery' | 'character_arc' | 'theme';
  description?: string;
  status?: 'active' | 'resolved' | 'abandoned';
  linkedCharacters?: string[];
  linkedLocations?: string[];
  chapterAppearances?: string[];
  timeline?: ThreadTimelineEvent[];
  createdAt: string;
}

export interface ThreadTimelineEvent {
  chapterId: string;
  event: string;
  timestamp?: string;
}

// ============================================================================
// ANNOTATION TYPES
// ============================================================================

export interface Annotation {
  id: string;
  type: AnnotationType;
  position: number;
  length: number;
  content?: string;
  priority: AnnotationPriority;
  timestamp: string;
  resolved?: boolean;
}

export type AnnotationType =
  | 'USER_NOTE'
  | 'AI_SUGGESTION'
  | 'INCONSISTENCY'
  | 'PLOT_HOLE'
  | 'CHARACTER_ERROR'
  | 'TIMELINE_ERROR'
  | 'STYLE_ISSUE'
  | 'GRAMMAR'
  | 'HIGHLIGHT';

export type AnnotationPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

// ============================================================================
// API & AI TYPES
// ============================================================================

export interface APIConfig {
  provider: 'anthropic' | 'openai' | 'deepseek' | 'grok' | 'google' | 'local';
  isConfigured?: boolean;
  lastTested?: string;

  anthropic?: ProviderConfig;
  openai?: ProviderConfig;
  deepseek?: ProviderConfig;
  grok?: ProviderConfig;
  google?: ProviderConfig;
  local?: LocalProviderConfig;
}

export interface ProviderConfig {
  apiKey?: string;
  model?: string;
  lastTested?: string;
  status?: 'connected' | 'disconnected' | 'error';
}

export interface LocalProviderConfig {
  endpoint: string;
  model?: string;
}

export interface AISettings {
  activeModel?: string;
  mode?: 'exploration' | 'production' | 'polish';
  temperature?: number;
  maxTokens?: number;
}

// ============================================================================
// CAST PLAN TYPES
// ============================================================================

export interface CastPlan {
  characterTypes: string[];
  suggestedArchetypes: ArchetypeInfo[];
  relationships?: CharacterRelationship[];
}

export interface ArchetypeInfo {
  archetypeFamily: string;
  description: string;
}

export interface CharacterRelationship {
  characterId1: string;
  characterId2: string;
  type: 'friend' | 'enemy' | 'family' | 'romantic' | 'rival' | 'mentor' | 'other';
  description?: string;
}

// ============================================================================
// CONSISTENCY CHECKER TYPES
// ============================================================================

export interface ConsistencyIssue {
  id: string;
  type: 'character' | 'location' | 'timeline' | 'plot' | 'other';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  chapters: string[];
  suggestion?: string;
  autoFixable?: boolean;
}

// ============================================================================
// EXPORT TYPES
// ============================================================================

export interface ExportOptions {
  format: 'txt' | 'md' | 'html' | 'rtf' | 'docx' | 'pdf' | 'epub' | 'mobi';
  includeMetadata?: boolean;
  includeChapterNumbers?: boolean;
  fontSize?: number;
  fontFamily?: string;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

export interface UIPreferences {
  theme: 'NOX' | 'DEIS';
  newLayout?: boolean;
  focusMode?: boolean;
  zenMode?: boolean;
  inspectorVisible?: boolean;
  aiPanelVisible?: boolean;
  sidebarCollapsed?: boolean;
}

// ============================================================================
// ELECTRON API TYPES
// ============================================================================

export interface ElectronAPI {
  // Project operations
  saveProject: (data: Project) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  loadProject: () => Promise<{ success: boolean; data?: Project; filePath?: string; error?: string }>;
  loadProjectFromPath: (filePath: string) => Promise<{ success: boolean; data?: Project; error?: string }>;
  autosaveProject: (data: Project) => Promise<{ success: boolean; error?: string }>;

  // Export operations
  exportDocument: (data: { format: string; content: string; title: string }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  exportFullProject: (data: { format: string; project: Project }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  exportPDF: (data: { project: Project; options?: ExportOptions }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  exportEPUB: (data: { project: Project; options?: ExportOptions }) => Promise<{ success: boolean; filePath?: string; error?: string }>;
  exportMOBI: (data: { project: Project; options?: ExportOptions }) => Promise<{ success: boolean; filePath?: string; error?: string }>;

  // AI APIs
  claudeAPI: (prompt: string | { prompt: string; model?: string }) => Promise<AIResponse>;
  openaiAPI: (prompt: string | { prompt: string; model?: string }) => Promise<AIResponse>;
  geminiAPI: (prompt: string) => Promise<AIResponse>;
  grokAPI: (prompt: string | { prompt: string; model?: string }) => Promise<AIResponse>;
  deepseekAPI: (payload: { prompt: string; model?: string }) => Promise<AIResponse>;

  // API management
  loadApiKeys: () => Promise<{ success: boolean; keys: { [key: string]: string } }>;
  saveApiKeys: (keys: { [key: string]: string }) => Promise<{ success: boolean; encrypted?: boolean; error?: string }>;
  testApiConnection: (params: { provider: string; apiKey: string; model?: string }) => Promise<ConnectionTestResult>;

  // Backup
  saveBackup: (project: Project) => Promise<{ success: boolean; error?: string }>;
  loadBackup: () => Promise<{ success: boolean; data?: Project; error?: string }>;

  // UI Preferences
  getUiPrefs: () => Promise<{ success: boolean; data: UIPreferences }>;
  setUiPrefs: (prefs: Partial<UIPreferences>) => Promise<{ success: boolean }>;
  onUiPrefsChanged: (callback: (prefs: UIPreferences) => void) => void;

  // Menu actions
  onMenuAction: (callback: (event: string, arg?: any) => void) => void;
}

export interface AIResponse {
  success: boolean;
  data?: string;
  error?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

export interface ConnectionTestResult {
  success: boolean;
  message?: string;
  model?: string;
  error?: string;
  details?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface Version {
  id: string;
  timestamp: string;
  description?: string;
  snapshot: Project;
}

// ============================================================================
// WINDOW AUGMENTATION
// ============================================================================

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    React?: any;
    AnnotationMargin?: any;
    AnnotationUtils?: {
      createAnnotation: (params: Partial<Annotation>) => Annotation;
      updateAnnotation: (annotation: Annotation, updates: Partial<Annotation>) => Annotation;
      ANNOTATION_TYPES: {
        [key: string]: AnnotationType;
      };
      ANNOTATION_PRIORITY: {
        [key: string]: AnnotationPriority;
      };
    };
  }
}

export {};

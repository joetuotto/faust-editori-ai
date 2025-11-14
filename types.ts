export interface Project {
  id?: string;
  title: string;
  items: Item[];
  story: Story;
  characters: Character[];
  locations: Location[];
  genre: string;
  // ...
}

export interface Item {
  id: string;
  title: string;
  type: 'folder' | 'chapter' | 'scene';
  content?: string;
  children?: Item[];
  // ...
}

export interface Story {
  chapters: Chapter[];
  outline: string[];
  events: Event[];
  threads: Thread[];
  // ...
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  content: string;
  status: 'draft' | 'review' | 'done';
  // ...
}

// ============================================================================
// CHARACTER MODEL - 4-Layer Deep Character System
// ============================================================================

// Psychological Layer - Big Five + DSM + Becker + Trauma + Beliefs
export interface PsychologicalLayer {
  bigFive: {
    openness: number;           // 0-1: Curiosity, imagination
    conscientiousness: number;  // 0-1: Organization, discipline
    extraversion: number;       // 0-1: Sociability, energy
    agreeableness: number;      // 0-1: Compassion, cooperation
    neuroticism: number;        // 0-1: Emotional stability
  };
  dsmCategory?: 'anxiety' | 'mood' | 'personality' | 'trauma_related' | 'none';
  existentialTerror?: {
    deathAnxiety: number;       // 0-1: Becker's terror management
    copingMechanism: 'heroism' | 'religiosity' | 'creativity' | 'relationships' | 'denial';
  };
  trauma?: {
    type: 'childhood' | 'loss' | 'violence' | 'betrayal' | 'other';
    severity: number;           // 0-1
    triggerWords: string[];
    copingStrategy: string;
  };
  beliefSystem: {
    core_beliefs: string[];     // "I am worthy", "World is dangerous", etc.
    values: string[];           // "loyalty", "freedom", "justice", etc.
    worldview: 'optimistic' | 'pessimistic' | 'realistic' | 'cynical';
  };
}

// Transactional Layer - Berne's Transactional Analysis
export interface TransactionalLayer {
  egoStates: {
    parent: number;             // 0-1: Critical/Nurturing parent
    adult: number;              // 0-1: Rational, objective
    child: number;              // 0-1: Free/Adapted child
  };
  dominantState: 'parent' | 'adult' | 'child';
  socialGame?: {
    game: 'victim' | 'rescuer' | 'persecutor' | 'none';  // Karpman Drama Triangle
    pattern: string;            // Description of repeated social pattern
  };
  communicationStyle: 'assertive' | 'passive' | 'aggressive' | 'passive_aggressive';
  attachmentStyle?: 'secure' | 'anxious' | 'avoidant' | 'disorganized';
}

// Archetypal Layer - Jungian archetypes + mythic journey
export interface ArchetypalLayer {
  primaryArchetype:
    | 'hero' | 'mentor' | 'threshold_guardian' | 'herald' | 'shapeshifter'
    | 'shadow' | 'ally' | 'trickster' | 'innocent' | 'sage' | 'explorer'
    | 'outlaw' | 'magician' | 'lover' | 'jester' | 'caregiver' | 'creator' | 'ruler';
  secondaryArchetypes?: string[];
  mythicJourney?: {
    stage: 'ordinary_world' | 'call_to_adventure' | 'refusal' | 'meeting_mentor'
         | 'crossing_threshold' | 'tests' | 'approach' | 'ordeal' | 'reward'
         | 'road_back' | 'resurrection' | 'return_with_elixir';
    completion: number;         // 0-1: How far through the journey
  };
  symbols?: string[];           // Associated symbolic elements
  shadowWork?: {
    suppressedTraits: string[];
    projections: string[];      // What they project onto others
  };
}

// Ensemble Layer - Group dynamics and story fit
export interface EnsembleLayer {
  storyFit: {
    themeCompatibility: number;  // 0-1: How well character fits story theme
    genreAlignment: number;      // 0-1: Fit to story genre
    narrativeRole: 'protagonist' | 'antagonist' | 'deuteragonist' | 'supporting' | 'minor';
  };
  groupDynamics?: {
    tuckmanStage?: 'forming' | 'storming' | 'norming' | 'performing';
    roleInGroup?: 'leader' | 'mediator' | 'rebel' | 'follower' | 'outsider' | 'scapegoat';
    conflicts?: string[];        // With which character IDs
    synergies?: string[];        // With which character IDs
  };
  relationshipMatrix?: {
    [characterId: string]: {
      type: 'ally' | 'enemy' | 'rival' | 'mentor' | 'protege' | 'lover' | 'family' | 'neutral';
      intensity: number;         // 0-1
      dynamic: string;           // Brief description
    };
  };
  ensembleResonance?: number;   // 0-1: How well character harmonizes with ensemble
}

// Complete Character with all 4 layers
export interface Character {
  id: string;
  name: string;
  description: string;

  // Demographics (neutral, focused on narrative utility)
  age?: number;
  occupation?: string;
  background?: string;

  // 4-Layer Model
  psychological?: PsychologicalLayer;
  transactional?: TransactionalLayer;
  archetypal?: ArchetypalLayer;
  ensemble?: EnsembleLayer;

  // Story integration
  appearanceInChapters?: string[];  // Chapter IDs where character appears
  characterArc?: {
    beginning: string;
    middle: string;
    end: string;
    transformationType?: 'positive' | 'negative' | 'tragic' | 'flat';
  };

  // Metadata
  createdAt?: string;
  modifiedAt?: string;
  notes?: string;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  // ...
}

export interface Event {
  id: string;
  title: string;
  description: string;
  chapterId?: string;
  timestamp?: string;
  type?: 'plot' | 'character' | 'world';
  // ...
}

export interface Thread {
  id: string;
  title: string;
  description: string;
  type: 'main_plot' | 'subplot' | 'character_arc' | 'mystery' | 'romance';
  status: 'active' | 'resolved' | 'abandoned';
  chapters: string[]; // chapter IDs
  priority?: 'low' | 'medium' | 'high';
  // ...
}

// AI types
export interface AIResponse {
  success: boolean;
  data?: string;
  error?: string;
  // ...
}

export interface ActiveItem extends Item {
  // ...
}


















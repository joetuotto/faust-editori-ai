/**
 * Adaptive Continuity System for FAUST
 *
 * Progressive enhancement architecture that starts minimal and adds
 * complexity only when story demands it.
 *
 * Phase 0: Base tracker (always active)
 * Phase 1: Micro-optimizations (minimal overhead)
 * Phase 2: Lite Graph Memory (lazy-loaded for complex stories)
 * Phase 3: Full Hybrid (embedding search, multi-book)
 */

interface Project {
  title: string;
  structure: Chapter[];
  characters: Character[];
  [key: string]: any;
}

interface Chapter {
  id: string;
  type: string;
  title: string;
  content: string;
  wordCount: number;
  order: number;
  synopsis?: string;
  notesAI?: {
    characterMentions?: string[];
    locations?: string[];
    timeframe?: string;
    mood?: string;
    themes?: string[];
    continuityIssues?: ContinuityIssue[];
  };
}

interface Character {
  id: string;
  name: string;
  [key: string]: any;
}

interface ContinuityConfig {
  enableGraph: boolean;
  enableEmbeddings: boolean;
  enableMultiBook: boolean;
  autoDetectComplexity: boolean;
}

interface ComplexityMetrics {
  wordCount: number;
  characterCount: number;
  plotThreadCount: number;
  timelineCount: number;
  nonLinear: boolean;
  score: number;
}

interface ContinuityIssue {
  type: string;
  detail: string;
  severity: number;
  suggestion?: string;
}

interface ContinuityCheckResult {
  issues: ContinuityIssue[];
  warnings: string[];
  suggestions?: string[];
  cleared: boolean;
}

interface SystemStatus {
  baseTracker: string;
  graphMemory: string;
  embeddingSearch: string;
  memoryUsage: string;
  costs: {
    total: number;
    checks: number;
    tokens: { input: number; output: number };
  };
}

class AdaptiveContinuitySystem {
  private baseTracker: any; // StoryContinuityTracker
  private graphMemory?: any; // LiteGraphMemory
  private embeddingSearch?: any; // EmbeddingSearch
  private config: ContinuityConfig;

  constructor(baseTracker: any, config: Partial<ContinuityConfig> = {}) {
    this.baseTracker = baseTracker;
    this.config = {
      enableGraph: false,
      enableEmbeddings: false,
      enableMultiBook: false,
      autoDetectComplexity: true,
      ...config
    };
  }

  /**
   * Analyze story complexity and recommend system upgrades
   */
  analyzeComplexity(project: Project): ComplexityMetrics {
    const wordCount = project.structure.reduce((sum, ch) =>
      sum + (ch.wordCount || 0), 0
    );

    const characterCount = new Set(
      project.structure.flatMap(ch =>
        ch.notesAI?.characterMentions || []
      )
    ).size;

    const plotThreadCount = Object.keys(
      this.baseTracker.storyMemory?.plotThreads || {}
    ).length;

    const timelineCount = this.detectTimelineCount(project);
    const nonLinear = this.detectNonLinearStructure(project);

    const score =
      (wordCount / 1000) * 0.3 +
      characterCount * 2 +
      plotThreadCount * 3 +
      timelineCount * 5 +
      (nonLinear ? 10 : 0);

    return {
      wordCount,
      characterCount,
      plotThreadCount,
      timelineCount,
      nonLinear,
      score
    };
  }

  /**
   * Auto-upgrade system based on complexity
   */
  async autoUpgrade(complexity: ComplexityMetrics): Promise<string[]> {
    if (!this.config.autoDetectComplexity) return [];

    const upgrades: string[] = [];

    // Activate Lite Graph for complex stories
    if (complexity.score > 60 && !this.graphMemory) {
      console.log('📊 Activating Graph Memory (complexity:', complexity.score, ')');
      await this.activateGraphMemory();
      upgrades.push('graph_memory');
    }

    // Activate Embeddings for epic stories
    if (complexity.score > 100 && !this.embeddingSearch) {
      console.log('🔍 Activating Embedding Search (complexity:', complexity.score, ')');
      await this.activateEmbeddingSearch();
      upgrades.push('embedding_search');
    }

    return upgrades;
  }

  /**
   * Lazy-load graph memory module
   */
  private async activateGraphMemory(): Promise<void> {
    if (this.graphMemory) return;

    // Lazy import
    const { LiteGraphMemory } = await import('./LiteGraphMemory');
    this.graphMemory = new LiteGraphMemory();

    // Populate graph from existing memory
    const memory = this.baseTracker.storyMemory;
    if (memory?.characterStates) {
      Object.entries(memory.characterStates).forEach(([name, state]: [string, any]) => {
        if (state.relationships) {
          Object.entries(state.relationships).forEach(([other, relation]) => {
            this.graphMemory!.addRelationship(
              name,
              other,
              typeof relation === 'string' ? relation : 'knows',
              state.lastSeen || 0
            );
          });
        }
      });
    }

    this.config.enableGraph = true;
  }

  /**
   * Lazy-load embedding search module
   */
  private async activateEmbeddingSearch(): Promise<void> {
    if (this.embeddingSearch) return;

    // Lazy import
    const { EmbeddingSearch } = await import('./EmbeddingSearch');
    this.embeddingSearch = new EmbeddingSearch();

    // Index existing timeline
    const memory = this.baseTracker.storyMemory;
    if (memory?.timeline) {
      for (const entry of memory.timeline) {
        for (const event of entry.events || []) {
          await this.embeddingSearch.addEvent(event, entry.chapter);
        }
      }
    }

    this.config.enableEmbeddings = true;
  }

  /**
   * Unified continuity check with fallback cascade
   */
  async checkContinuity(
    chapter: number,
    content: string
  ): Promise<ContinuityCheckResult> {
    // Level 1: Base system (always runs)
    let result = await this.baseTracker.checkContinuityBeforeWriting(
      chapter,
      content
    );

    // Ensure result has required structure
    if (!result.issues) result.issues = [];
    if (!result.warnings) result.warnings = [];
    if (!result.suggestions) result.suggestions = [];

    // Level 2: Graph queries (if active and issues found)
    if (this.graphMemory && result.issues.length > 0) {
      const graphIssues = await this.checkGraphConsistency(content);
      result.issues.push(...graphIssues);
    }

    // Level 3: Semantic similarity (if active and warnings exist)
    if (this.embeddingSearch && result.warnings.length > 0) {
      const similarEvents = await this.embeddingSearch.findSimilar(
        content.substring(0, 500),
        3
      );
      result.suggestions.push(
        `Similar plot points found in: ${similarEvents.map((e: any) => `Chapter ${e.chapter}`).join(', ')}`
      );
    }

    // Update cleared status
    result.cleared = result.issues.length === 0;

    return result;
  }

  /**
   * Check graph-based relationship consistency
   */
  private async checkGraphConsistency(content: string): Promise<ContinuityIssue[]> {
    if (!this.graphMemory) return [];

    const issues: ContinuityIssue[] = [];

    // Extract character mentions from content
    const mentions = this.extractCharacterMentions(content);

    // Check if relationships are established
    for (let i = 0; i < mentions.length; i++) {
      for (let j = i + 1; j < mentions.length; j++) {
        const path = this.graphMemory.findPath(mentions[i], mentions[j]);
        if (!path) {
          issues.push({
            type: 'relationship',
            detail: `${mentions[i]} and ${mentions[j]} interact but have no established relationship`,
            severity: 2,
            suggestion: `Establish how they know each other earlier in the story`
          });
        }
      }
    }

    return issues;
  }

  /**
   * Phase 1: Fuzzy character name matching
   */
  private fuzzyMatchCharacter(name: string, candidates: string[]): string | null {
    const normalized = name.toLowerCase().trim();

    // Exact match
    const exact = candidates.find(c => c.toLowerCase() === normalized);
    if (exact) return exact;

    // Partial match (e.g., "John" matches "John Smith")
    const partial = candidates.find(c =>
      c.toLowerCase().includes(normalized) ||
      normalized.includes(c.toLowerCase())
    );
    if (partial) return partial;

    // Levenshtein distance < 3
    for (const candidate of candidates) {
      if (this.levenshteinDistance(normalized, candidate.toLowerCase()) < 3) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Levenshtein distance for fuzzy matching
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Phase 1: Adaptive context window
   */
  getAdaptiveContextWindow(chapter: number): number {
    const memory = this.baseTracker.storyMemory;
    if (!memory?.plotThreads) return 3;

    // Count active plot threads at this chapter
    const activePlots = Object.values(memory.plotThreads).filter((thread: any) =>
      (thread.introduced || 0) <= chapter &&
      (thread.resolved || Infinity) >= chapter
    ).length;

    // More plots = wider window needed
    if (activePlots > 5) return 5;
    if (activePlots > 3) return 4;
    return 3;
  }

  /**
   * Detect number of timelines in story
   */
  private detectTimelineCount(project: Project): number {
    const timeMarkers = new Set<string>();
    project.structure.forEach(ch => {
      const time = ch.notesAI?.timeframe;
      if (time) timeMarkers.add(time);
    });
    return Math.max(1, timeMarkers.size);
  }

  /**
   * Detect non-linear narrative structure
   */
  private detectNonLinearStructure(project: Project): boolean {
    const keywords = ['flashback', 'flash-back', 'earlier', 'years later', 'meanwhile',
                     'in parallel', 'takaumassa', 'aiemmin', 'myöhemmin', 'samaan aikaan'];
    return project.structure.some(ch =>
      keywords.some(kw =>
        ch.content?.toLowerCase().includes(kw) ||
        ch.synopsis?.toLowerCase().includes(kw)
      )
    );
  }

  /**
   * Extract character names from text
   */
  private extractCharacterMentions(text: string): string[] {
    const memory = this.baseTracker.storyMemory;
    if (!memory?.characterStates) return [];

    const knownNames = Object.keys(memory.characterStates);
    return knownNames.filter(name =>
      text.toLowerCase().includes(name.toLowerCase())
    );
  }

  /**
   * Get system status for UI display
   */
  getStatus(): SystemStatus {
    return {
      baseTracker: 'active',
      graphMemory: this.graphMemory ? 'active' : 'inactive',
      embeddingSearch: this.embeddingSearch ? 'active' : 'inactive',
      memoryUsage: this.estimateMemoryUsage(),
      costs: this.baseTracker.costs || { total: 0, checks: 0, tokens: { input: 0, output: 0 } }
    };
  }

  /**
   * Estimate total memory usage
   */
  private estimateMemoryUsage(): string {
    let bytes = 50000; // Base tracker ~50KB
    if (this.graphMemory) bytes += 100000; // Graph ~100KB
    if (this.embeddingSearch) bytes += 5000000; // Model ~5MB

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Get recommendations for user
   */
  getRecommendations(complexity: ComplexityMetrics): string[] {
    const recommendations: string[] = [];

    if (complexity.score > 60 && !this.graphMemory) {
      recommendations.push(
        `Your story is complex (score: ${complexity.score.toFixed(0)}). ` +
        `Consider enabling Graph Memory for better relationship tracking.`
      );
    }

    if (complexity.score > 100 && !this.embeddingSearch) {
      recommendations.push(
        `Your story is epic-scale (score: ${complexity.score.toFixed(0)}). ` +
        `Consider enabling Embedding Search for semantic similarity detection.`
      );
    }

    if (complexity.wordCount > 100000) {
      recommendations.push(
        `You've written ${(complexity.wordCount / 1000).toFixed(0)}k words! ` +
        `Consider using memory compression to optimize performance.`
      );
    }

    return recommendations;
  }
}

export default AdaptiveContinuitySystem;
export type { ComplexityMetrics, ContinuityCheckResult, SystemStatus };

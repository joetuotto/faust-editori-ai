/**
 * Embedding Search - Phase 3 Enhancement
 *
 * Semantic similarity search using text embeddings.
 * Enables queries like:
 * - "Find chapters similar to this plot point"
 * - "Which character arcs are most similar?"
 * - "What previous events relate to this scene?"
 *
 * Uses @xenova/transformers (runs in Node.js/Electron)
 * Model: all-MiniLM-L6-v2 (23MB, fast inference)
 *
 * Memory: ~5MB (model) + 500KB per 100k words (embeddings)
 * Latency: ~100-200ms per query
 */

interface EmbeddingEntry {
  text: string;
  embedding: number[];
  chapter: number;
  type: 'event' | 'character' | 'scene' | 'synopsis';
  metadata?: Record<string, any>;
}

interface SimilarityResult {
  text: string;
  chapter: number;
  similarity: number;
  type: string;
}

class EmbeddingSearch {
  private index: EmbeddingEntry[] = [];
  private embedder: any = null;
  private modelLoaded: boolean = false;

  /**
   * Initialize the embedding model (lazy-loaded)
   */
  async initialize(): Promise<void> {
    if (this.modelLoaded) return;

    try {
      // Dynamic import to avoid loading if not needed
      // Note: @xenova/transformers is optional and only needed for Phase 3 semantic search
      const transformers = await import('@xenova/transformers').catch(() => null);

      if (!transformers) {
        console.warn('⚠️  @xenova/transformers not installed. Embedding search disabled.');
        console.warn('   Install with: npm install @xenova/transformers');
        return;
      }

      this.embedder = await transformers.pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );

      this.modelLoaded = true;
      console.log('✅ Embedding model loaded (all-MiniLM-L6-v2)');
    } catch (error) {
      console.error('Failed to load embedding model:', error);
      console.warn('Embedding search disabled. Install @xenova/transformers to enable.');
    }
  }

  /**
   * Add a text entry to the index
   */
  async addEvent(
    text: string,
    chapter: number,
    type: EmbeddingEntry['type'] = 'event',
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.modelLoaded) {
      await this.initialize();
    }

    if (!text || text.trim().length === 0) {
      return;
    }

    // Generate embedding
    const embedding = await this.embedder(text, {
      pooling: 'mean',
      normalize: true
    });

    this.index.push({
      text,
      embedding: Array.from(embedding.data),
      chapter,
      type,
      metadata: metadata || {}
    });
  }

  /**
   * Find similar entries to a query
   */
  async findSimilar(
    query: string,
    topK: number = 5,
    typeFilter?: EmbeddingEntry['type']
  ): Promise<SimilarityResult[]> {
    if (!this.modelLoaded) {
      await this.initialize();
    }

    if (this.index.length === 0) {
      return [];
    }

    // Generate query embedding
    const queryEmbedding = await this.embedder(query, {
      pooling: 'mean',
      normalize: true
    });

    const queryVector = Array.from(queryEmbedding.data) as number[];

    // Calculate similarities
    let scores = this.index.map(item => ({
      text: item.text,
      chapter: item.chapter,
      type: item.type,
      similarity: this.cosineSimilarity(queryVector, item.embedding)
    }));

    // Apply type filter
    if (typeFilter) {
      scores = scores.filter(s => s.type === typeFilter);
    }

    // Sort by similarity and return top K
    return scores
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Find events similar to a specific chapter
   */
  async findSimilarChapters(
    chapterNumber: number,
    topK: number = 5
  ): Promise<SimilarityResult[]> {
    // Find all events from this chapter
    const chapterEvents = this.index.filter(item => item.chapter === chapterNumber);

    if (chapterEvents.length === 0) {
      return [];
    }

    // Use the first event as query (or combine them)
    const combinedText = chapterEvents.map(e => e.text).join(' ');
    const results = await this.findSimilar(combinedText, topK + 1);

    // Exclude the chapter itself
    return results.filter(r => r.chapter !== chapterNumber).slice(0, topK);
  }

  /**
   * Cluster similar events (simple k-means-like approach)
   */
  async clusterEvents(k: number = 5): Promise<Array<{ cluster: number; items: SimilarityResult[] }>> {
    if (this.index.length === 0 || !this.modelLoaded) {
      return [];
    }

    // Simple clustering: pick k random centroids, assign closest
    const centroids: number[][] = [];
    const clusterAssignments: number[] = new Array(this.index.length);

    // Initialize centroids randomly
    for (let i = 0; i < k; i++) {
      const randomIdx = Math.floor(Math.random() * this.index.length);
      centroids.push([...this.index[randomIdx].embedding]);
    }

    // Assign each point to nearest centroid (1 iteration, good enough)
    for (let i = 0; i < this.index.length; i++) {
      let bestCluster = 0;
      let bestSimilarity = -1;

      for (let j = 0; j < k; j++) {
        const similarity = this.cosineSimilarity(
          this.index[i].embedding,
          centroids[j]
        );
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestCluster = j;
        }
      }

      clusterAssignments[i] = bestCluster;
    }

    // Group results by cluster
    const clusters: Array<{ cluster: number; items: SimilarityResult[] }> = [];
    for (let i = 0; i < k; i++) {
      const items = this.index
        .map((item, idx) => ({
          text: item.text,
          chapter: item.chapter,
          type: item.type,
          similarity: 1.0,
          clusterIdx: clusterAssignments[idx]
        }))
        .filter(item => item.clusterIdx === i);

      if (items.length > 0) {
        clusters.push({ cluster: i, items });
      }
    }

    return clusters;
  }

  /**
   * Detect timeline anomalies (events out of chronological order)
   */
  async detectTimelineAnomalies(): Promise<Array<{ chapter1: number; chapter2: number; reason: string }>> {
    const anomalies: Array<{ chapter1: number; chapter2: number; reason: string }> = [];

    // Check if later chapters have very high similarity to much earlier ones
    for (let i = 0; i < this.index.length; i++) {
      for (let j = i + 5; j < this.index.length; j++) {
        // Only check events 5+ chapters apart
        const similarity = this.cosineSimilarity(
          this.index[i].embedding,
          this.index[j].embedding
        );

        if (similarity > 0.9) {
          anomalies.push({
            chapter1: this.index[i].chapter,
            chapter2: this.index[j].chapter,
            reason: `Very similar events (${(similarity * 100).toFixed(0)}% similarity) - possible repetition or timeline issue`
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Export index for persistence
   */
  export(): EmbeddingEntry[] {
    return this.index;
  }

  /**
   * Import index from persistence
   */
  import(entries: EmbeddingEntry[]): void {
    this.index = entries;
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.index = [];
  }

  /**
   * Get index statistics
   */
  getStats(): {
    entryCount: number;
    memoryUsageKB: number;
    avgEmbeddingSize: number;
  } {
    const entryCount = this.index.length;
    const avgEmbeddingSize = this.index.length > 0
      ? this.index[0].embedding.length
      : 0;

    // Rough estimate: 4 bytes per float32 + text overhead
    const memoryUsageKB = entryCount * (avgEmbeddingSize * 4 + 100) / 1024;

    return {
      entryCount,
      memoryUsageKB: parseFloat(memoryUsageKB.toFixed(2)),
      avgEmbeddingSize
    };
  }
}

export { EmbeddingSearch };
export type { EmbeddingEntry, SimilarityResult };

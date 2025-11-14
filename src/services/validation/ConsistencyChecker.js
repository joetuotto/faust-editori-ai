/**
 * ConsistencyChecker
 *
 * Detects contradictions and inconsistencies across the book
 * - Character inconsistencies (appearance, traits)
 * - Timeline errors
 * - Location contradictions
 * - Naming variations
 */

class ConsistencyChecker {
  constructor(project, electronAPI, callAIWithMode) {
    this.project = project;
    this.electronAPI = electronAPI;
    this.callAIWithMode = callAIWithMode; // AI Writing Modes support
  }

  /**
   * Run full consistency check and generate annotations
   */
  async runFullCheck() {
    const errors = [];
    const annotations = [];

    try {
      // Run all checks in parallel
      const [
        characterErrors,
        namingErrors,
        timelineErrors,
        locationErrors
      ] = await Promise.all([
        this.checkCharacterConsistency(),
        this.checkNamingConsistency(),
        this.checkTimeline(),
        this.checkLocationConsistency()
      ]);

      errors.push(...characterErrors, ...namingErrors, ...timelineErrors, ...locationErrors);

      // Generate annotations from errors
      errors.forEach(error => {
        const annotation = this.errorToAnnotation(error);
        if (annotation) {
          annotations.push(annotation);
        }
      });

      // Update project chapters with annotations
      if (annotations.length > 0 && this.project.structure) {
        this.mergeAnnotationsIntoProject(annotations);
      }

      return {
        success: true,
        errors,
        annotations,
        summary: {
          total: errors.length,
          critical: errors.filter(e => e.severity === 'critical').length,
          high: errors.filter(e => e.severity === 'high').length,
          medium: errors.filter(e => e.severity === 'medium').length,
          low: errors.filter(e => e.severity === 'low').length
        }
      };

    } catch (error) {
      console.error('[ConsistencyChecker] Error:', error);
      return {
        success: false,
        error: error.message,
        errors: [],
        annotations: []
      };
    }
  }

  /**
   * Convert error to annotation
   */
  errorToAnnotation(error) {
    if (!window.AnnotationUtils) {
      console.error('[ConsistencyChecker] AnnotationUtils not available');
      return null;
    }

    // Find the first occurrence in chapters
    const occurrence = error.occurrences?.[0];
    if (!occurrence || !occurrence.chapterId) {
      return null;
    }

    // Find chapter index
    const chapterIndex = this.project.structure.findIndex(ch => ch.id === occurrence.chapterId);
    if (chapterIndex === -1) {
      return null;
    }

    const chapter = this.project.structure[chapterIndex];
    if (!chapter.content) {
      return null;
    }

    // Find position in content (simple text search)
    let position = 0;
    let length = 50;

    if (occurrence.content) {
      const foundPos = chapter.content.indexOf(occurrence.content);
      if (foundPos !== -1) {
        position = foundPos;
        length = occurrence.content.length;
      }
    } else if (occurrence.context) {
      // Try to find context
      const foundPos = chapter.content.indexOf(occurrence.context.replace(/\.\.\./g, ''));
      if (foundPos !== -1) {
        position = foundPos;
        length = 50;
      }
    }

    // Determine annotation type and priority
    let annotationType = window.AnnotationUtils.ANNOTATION_TYPES.AI_CONSISTENCY;
    let priority = window.AnnotationUtils.ANNOTATION_PRIORITY.MEDIUM;

    if (error.severity === 'critical') {
      priority = window.AnnotationUtils.ANNOTATION_PRIORITY.CRITICAL;
    } else if (error.severity === 'high') {
      priority = window.AnnotationUtils.ANNOTATION_PRIORITY.HIGH;
    } else if (error.severity === 'low') {
      priority = window.AnnotationUtils.ANNOTATION_PRIORITY.LOW;
    }

    // Create annotation
    const annotation = window.AnnotationUtils.createAnnotation({
      type: annotationType,
      position,
      length,
      content: error.message,
      priority,
      metadata: {
        errorId: error.id,
        errorType: error.type,
        category: error.category,
        autoFixable: error.autoFixable,
        evidence: error.evidence,
        chapters: error.chapters
      },
      aiSuggestion: error.suggestedFix,
      source: 'ai',
      chapterId: occurrence.chapterId,
      chapterIndex
    });

    return annotation;
  }

  /**
   * Merge generated annotations into project chapters
   */
  mergeAnnotationsIntoProject(annotations) {
    // Group annotations by chapter
    const annotationsByChapter = new Map();

    annotations.forEach(annotation => {
      if (annotation.chapterIndex === undefined) return;

      const chapterIndex = annotation.chapterIndex;
      if (!annotationsByChapter.has(chapterIndex)) {
        annotationsByChapter.set(chapterIndex, []);
      }
      annotationsByChapter.get(chapterIndex).push(annotation);
    });

    // Update chapters
    annotationsByChapter.forEach((chapterAnnotations, chapterIndex) => {
      const chapter = this.project.structure[chapterIndex];
      if (!chapter) return;

      // Initialize annotations array if needed
      if (!chapter.annotations) {
        chapter.annotations = [];
      }

      // Remove old AI_CONSISTENCY annotations
      chapter.annotations = chapter.annotations.filter(
        ann => ann.type !== window.AnnotationUtils.ANNOTATION_TYPES.AI_CONSISTENCY
      );

      // Add new annotations
      chapter.annotations.push(...chapterAnnotations);

      console.log(`[ConsistencyChecker] Added ${chapterAnnotations.length} annotations to chapter ${chapterIndex + 1}`);
    });
  }

  /**
   * Check character consistency using AI
   */
  async checkCharacterConsistency() {
    if (!this.electronAPI) {
      return [];
    }

    const errors = [];

    // Check each character
    for (const character of this.project.characters || []) {
      // Collect all mentions of this character
      const mentions = [];

      (this.project.structure || []).forEach((chapter, idx) => {
        if (chapter.content && chapter.content.includes(character.name)) {
          const sentences = chapter.content.match(/[^.!?]+[.!?]+/g) || [];
          const characterSentences = sentences.filter(s =>
            s.toLowerCase().includes(character.name.toLowerCase())
          );

          if (characterSentences.length > 0) {
            mentions.push({
              chapterIndex: idx,
              chapterTitle: chapter.title,
              sentences: characterSentences.slice(0, 5) // First 5 mentions
            });
          }
        }
      });

      if (mentions.length < 2) {
        continue; // Need at least 2 chapters to check consistency
      }

      // Use AI to detect contradictions
      const contradictions = await this.detectCharacterContradictions(character, mentions);
      errors.push(...contradictions);
    }

    return errors;
  }

  /**
   * Use AI to detect character contradictions
   */
  async detectCharacterContradictions(character, mentions) {
    const mentionsText = mentions
      .map(m => `[${m.chapterTitle}]\n${m.sentences.join(' ')}`)
      .join('\n\n');

    const prompt = `Analyze this character for contradictions in a book.

CHARACTER: ${character.name}
DESCRIPTION: ${character.description || 'No description provided'}

MENTIONS ACROSS CHAPTERS:
${mentionsText}

Detect any contradictions:
- Physical appearance changes (eye color, height, hair, etc.)
- Personality contradictions
- Skill/ability contradictions
- Background story contradictions

Return ONLY valid JSON in this format:
{
  "contradictions": [
    {
      "type": "physical_appearance",
      "severity": "high",
      "message": "Eye color changes from blue to brown",
      "chapters": ["Chapter 1", "Chapter 5"],
      "evidence": ["blue eyes sparkled", "brown eyes narrowed"],
      "suggestedFix": "Standardize to blue eyes"
    }
  ]
}

If no contradictions found, return: {"contradictions": []}`;

    try {
      let result;

      // Use callAIWithMode if available (supports AI Writing Modes)
      if (this.callAIWithMode) {
        result = await this.callAIWithMode(prompt, {
          temperature: 0.3  // Use low temperature for analysis precision
        });
      } else {
        // Fallback to direct API calls
        const provider = this.project.ai.provider || 'anthropic';
        const modelName = this.project.ai.models[provider];

        if (provider === 'anthropic') {
          result = await this.electronAPI.claudeAPI({ prompt, model: modelName, temperature: 0.3 });
        } else if (provider === 'openai') {
          result = await this.electronAPI.openaiAPI({ prompt, model: modelName, temperature: 0.3 });
        } else if (provider === 'grok') {
          result = await this.electronAPI.grokAPI({ prompt, model: modelName, temperature: 0.3 });
        } else if (provider === 'deepseek') {
          result = await this.electronAPI.deepseekAPI({ prompt, model: modelName, temperature: 0.3 });
        }
      }

      // Handle different response formats
      let responseData;
      if (typeof result === 'string') {
        responseData = result;
      } else if (result?.success && result?.data) {
        responseData = result.data;
      } else if (result?.content) {
        responseData = result.content;
      } else if (result?.text) {
        responseData = result.text;
      } else {
        return [];
      }

      const parsed = JSON.parse(responseData);
      const contradictions = parsed.contradictions || [];

      return contradictions.map((c, idx) => ({
        id: `char-${character.id}-${idx}`,
        type: 'character_inconsistency',
        severity: c.severity || 'medium',
        category: 'character',
        characterId: character.id,
        characterName: character.name,
        message: c.message,
        chapters: c.chapters || [],
        evidence: c.evidence || [],
        suggestedFix: c.suggestedFix || 'Manual review needed',
        autoFixable: c.type === 'physical_appearance' || c.type === 'name_variation'
      }));

    } catch (error) {
      console.error('[ConsistencyChecker] Character check error:', error);
      return [];
    }
  }

  /**
   * Check naming consistency (simple pattern matching)
   */
  async checkNamingConsistency() {
    const errors = [];

    // Check each character for name variations
    for (const character of this.project.characters || []) {
      const variations = new Set();
      const baseName = character.name;

      // Look for variations like "Maria" vs "Marja", "Jussi" vs "Juhani"
      (this.project.structure || []).forEach(chapter => {
        if (!chapter.content) return;

        // Find words similar to character name
        const words = chapter.content.match(/\b[A-ZÄÖÅ][a-zäöå]+\b/g) || [];
        words.forEach(word => {
          // Simple similarity check (first 3 letters match)
          if (word !== baseName &&
              baseName.substring(0, 3).toLowerCase() === word.substring(0, 3).toLowerCase()) {
            variations.add(word);
          }
        });
      });

      if (variations.size > 0) {
        errors.push({
          id: `name-${character.id}`,
          type: 'name_variation',
          severity: 'medium',
          category: 'naming',
          characterId: character.id,
          characterName: baseName,
          message: `Possible name variations: ${Array.from(variations).join(', ')}`,
          variations: [baseName, ...Array.from(variations)],
          suggestedFix: `Standardize to "${baseName}"`,
          autoFixable: true
        });
      }
    }

    return errors;
  }

  /**
   * Check timeline consistency
   * Detects chronological errors where later chapters reference earlier dates
   */
  async checkTimeline() {
    const errors = [];
    const timeReferences = [];

    // Extract all date/time references from chapters
    (this.project.structure || []).forEach((chapter, chapterIndex) => {
      if (!chapter.content) return;

      const dates = this.extractDates(chapter.content);
      dates.forEach(dateInfo => {
        timeReferences.push({
          ...dateInfo,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          chapterIndex: chapterIndex
        });
      });
    });

    // Check for chronological errors
    for (let i = 1; i < timeReferences.length; i++) {
      const prev = timeReferences[i - 1];
      const curr = timeReferences[i];

      // If chapter order is later but date is earlier, it's an error
      if (curr.chapterIndex > prev.chapterIndex && curr.date < prev.date) {
        errors.push({
          id: `timeline-${i}`,
          type: 'timeline_error',
          severity: 'critical',
          category: 'timeline',
          message: 'Timeline contradiction',
          description: `${curr.chapterTitle} (${curr.dateText}) tapahtuu ennen ${prev.chapterTitle} (${prev.dateText})`,
          occurrences: [
            {
              chapterId: prev.chapterId,
              chapterTitle: prev.chapterTitle,
              content: prev.dateText,
              context: prev.context
            },
            {
              chapterId: curr.chapterId,
              chapterTitle: curr.chapterTitle,
              content: curr.dateText,
              context: curr.context
            }
          ],
          suggestedFix: `Tarkista aikajana - tapahtumat ovat väärässä järjestyksessä`,
          autoFixable: false
        });
      }
    }

    return errors;
  }

  /**
   * Extract dates from text
   * Supports multiple date formats
   */
  extractDates(text) {
    const dates = [];

    // Pattern 1: DD.MM.YYYY or DD/MM/YYYY
    const pattern1 = /(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})/g;
    let match;
    while ((match = pattern1.exec(text)) !== null) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1; // JS months are 0-indexed
      const year = parseInt(match[3]);
      const date = new Date(year, month, day);

      if (!isNaN(date.getTime())) {
        dates.push({
          dateText: match[0],
          date: date,
          position: match.index,
          context: this.getContextAround(text, match.index, 50)
        });
      }
    }

    // Pattern 2: YYYY-MM-DD (ISO format)
    const pattern2 = /(\d{4})-(\d{2})-(\d{2})/g;
    while ((match = pattern2.exec(text)) !== null) {
      const year = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      const day = parseInt(match[3]);
      const date = new Date(year, month, day);

      if (!isNaN(date.getTime())) {
        dates.push({
          dateText: match[0],
          date: date,
          position: match.index,
          context: this.getContextAround(text, match.index, 50)
        });
      }
    }

    // Pattern 3: Month names in Finnish
    const monthNames = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu',
                        'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
    const pattern3 = new RegExp(`(\\d{1,2})\\.?\\s+(${monthNames.join('|')})\\s+(\\d{4})`, 'gi');
    while ((match = pattern3.exec(text)) !== null) {
      const day = parseInt(match[1]);
      const monthName = match[2].toLowerCase();
      const month = monthNames.indexOf(monthName);
      const year = parseInt(match[3]);

      if (month !== -1) {
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          dates.push({
            dateText: match[0],
            date: date,
            position: match.index,
            context: this.getContextAround(text, match.index, 50)
          });
        }
      }
    }

    return dates;
  }

  /**
   * Check location consistency
   * Detects contradictions in character locations
   */
  async checkLocationConsistency() {
    const errors = [];
    const characterLocations = new Map();

    // Track character locations per chapter
    for (const character of this.project.characters || []) {
      const locations = [];

      (this.project.structure || []).forEach((chapter, idx) => {
        if (!chapter.content || !chapter.content.includes(character.name)) return;

        // Extract location mentions for this character
        const locationMatches = this.extractCharacterLocation(chapter.content, character.name);
        if (locationMatches.length > 0) {
          locations.push({
            chapterIndex: idx,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            locations: locationMatches
          });
        }
      });

      if (locations.length >= 2) {
        characterLocations.set(character.id, {
          character: character,
          locations: locations
        });
      }
    }

    // Check for contradictions
    for (const [characterId, data] of characterLocations.entries()) {
      const { character, locations } = data;

      // Check consecutive chapters for location contradictions
      for (let i = 1; i < locations.length; i++) {
        const prev = locations[i - 1];
        const curr = locations[i];

        // If consecutive chapters, check if location changed without explanation
        if (curr.chapterIndex === prev.chapterIndex + 1) {
          const prevLoc = prev.locations[0];
          const currLoc = curr.locations[0];

          if (prevLoc !== currLoc && !this.hasTransitionKeywords(curr.chapterTitle)) {
            errors.push({
              id: `location-${characterId}-${i}`,
              type: 'location_inconsistency',
              severity: 'medium',
              category: 'location',
              characterId: characterId,
              characterName: character.name,
              message: `${character.name}'s location changes without explanation`,
              description: `${character.name}: ${prevLoc} (${prev.chapterTitle}) → ${currLoc} (${curr.chapterTitle})`,
              occurrences: [
                {
                  chapterId: prev.chapterId,
                  chapterTitle: prev.chapterTitle,
                  content: `Location: ${prevLoc}`
                },
                {
                  chapterId: curr.chapterId,
                  chapterTitle: curr.chapterTitle,
                  content: `Location: ${currLoc}`
                }
              ],
              suggestedFix: `Lisää kohtaus jossa ${character.name} siirtyy paikasta ${prevLoc} paikkaan ${currLoc}, tai korjaa sijaintiviittaukset`,
              autoFixable: false
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Extract location for a character from text
   */
  extractCharacterLocation(text, characterName) {
    const locations = [];

    // Pattern: "Name ... in/at/to Location"
    const patterns = [
      new RegExp(`${characterName}[^.]*?(?:asuu|oli|on|kävi|meni|tuli)\\s+([A-ZÄÖÅ][a-zäöå]+(?:ssa|ssä|sta|stä|lle|aan|ään))`, 'g'),
      new RegExp(`${characterName}[^.]*?(?:in|at|to|from)\\s+([A-ZÄÖÅ][a-zäöå]+)`, 'gi'),
      new RegExp(`([A-ZÄÖÅ][a-zäöå]+(?:ssa|ssä|sta|stä|lle)),[^.]*${characterName}`, 'g')
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
          // Clean location name (remove Finnish case endings)
          let location = match[1]
            .replace(/ssa$|ssä$/i, '')
            .replace(/sta$|stä$/i, '')
            .replace(/aan$|ään$/i, '')
            .replace(/lle$/i, '');

          if (location.length > 2) {
            locations.push(location);
          }
        }
      }
    });

    return [...new Set(locations)]; // Remove duplicates
  }

  /**
   * Check if chapter has transition keywords
   */
  hasTransitionKeywords(chapterTitle) {
    const keywords = ['matka', 'saapuu', 'lähtö', 'muutto', 'matkalla', 'journey', 'arrival', 'departure'];
    return keywords.some(keyword => chapterTitle.toLowerCase().includes(keyword));
  }

  /**
   * Get context around a position in text
   */
  getContextAround(text, position, length = 50) {
    const start = Math.max(0, position - length);
    const end = Math.min(text.length, position + length);
    const context = text.substring(start, end);
    return (start > 0 ? '...' : '') + context + (end < text.length ? '...' : '');
  }

  /**
   * Apply auto-fix for simple errors
   */
  async applyAutoFix(error) {
    if (!error.autoFixable) {
      throw new Error('Error is not auto-fixable');
    }

    switch (error.type) {
      case 'name_variation':
        return this.fixNameVariations(error);

      default:
        throw new Error(`No auto-fix available for ${error.type}`);
    }
  }

  /**
   * Fix name variations
   */
  fixNameVariations(error) {
    const correctName = error.characterName;
    const variations = error.variations.filter(v => v !== correctName);

    let fixCount = 0;

    (this.project.structure || []).forEach(chapter => {
      if (!chapter.content) return;

      variations.forEach(variation => {
        const regex = new RegExp(`\\b${variation}\\b`, 'g');
        const before = chapter.content;
        chapter.content = chapter.content.replace(regex, correctName);

        if (chapter.content !== before) {
          fixCount++;
        }
      });
    });

    return {
      success: true,
      message: `Fixed ${fixCount} instances of name variations`,
      correctName
    };
  }

  /**
   * Get error statistics
   */
  getErrorStats(errors) {
    return {
      total: errors.length,
      bySeverity: {
        critical: errors.filter(e => e.severity === 'critical').length,
        high: errors.filter(e => e.severity === 'high').length,
        medium: errors.filter(e => e.severity === 'medium').length,
        low: errors.filter(e => e.severity === 'low').length
      },
      byCategory: {
        character: errors.filter(e => e.category === 'character').length,
        timeline: errors.filter(e => e.category === 'timeline').length,
        location: errors.filter(e => e.category === 'location').length,
        naming: errors.filter(e => e.category === 'naming').length
      },
      autoFixable: errors.filter(e => e.autoFixable).length
    };
  }
}

// Export for use in app.js (Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConsistencyChecker;
}

// Make available globally for browser
if (typeof window !== 'undefined') {
  window.ConsistencyChecker = ConsistencyChecker;
}

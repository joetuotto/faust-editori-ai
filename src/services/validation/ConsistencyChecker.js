/**
 * ConsistencyChecker
 *
 * Detects contradictions and inconsistencies across the book
 * - Character inconsistencies (appearance, traits): the model reads the sentences that mention a character
 * - Timeline errors
 * - Location contradictions
 * - Naming variations
 *
 * The pattern rules (which words are a character's name, name variations, dates, places) live in
 * consistencyRules.js, a pure module with its own tests. This file is a plain script and cannot
 * import it: app.js hands the module over; under Node (Jest) it is required.
 */

class ConsistencyChecker {
  constructor(project, electronAPI, callAIWithMode, rules) {
    this.project = project;
    this.electronAPI = electronAPI;
    this.callAIWithMode = callAIWithMode; // AI Writing Modes support
    this.rules = rules || null;
  }

  /** The pattern rules. Without them nothing can be checked: a run fails with this reason. */
  patternRules() {
    if (!this.rules && typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      this.rules = require('./consistencyRules.js');
    }
    if (!this.rules) throw new Error('tarkistussääntöjä ei ole ladattu');
    return this.rules;
  }

  /**
   * Run full consistency check and generate annotations.
   * @param {{ languageRule?: string }} [options] languageRule: the last line of the character check's
   *   prompt, the answer language of the project (oldPaths.answerLanguageRule, built by app.js: this
   *   file is a plain script and cannot import it). Without it the prompt ends with its format.
   */
  async runFullCheck(options = {}) {
    const errors = [];
    const annotations = [];
    // AI calls that failed during this run. An empty result with failures is
    // "could not check", not "no contradictions".
    this.failures = [];
    this.languageRule = options && typeof options.languageRule === 'string' ? options.languageRule.trim() : '';

    // The project the rules read. The app hands the checker a new project on every change of its
    // state, also while the model step waits, and the place of a finding is an offset in the text
    // as it was when the rules ran (they run before the first wait, in the calls below). So the
    // marks are placed and merged on this project, and the app moves them onto the text as it is
    // by then (app.js runConsistencyCheck: mapAnnotationsBetween from this text to the state's).
    const read = this.project;

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

      // Back on the text the places were counted in (see above)
      this.project = read;

      // Generate annotations from errors
      errors.forEach(error => {
        const annotation = this.errorToAnnotation(error);
        if (annotation) {
          annotations.push(annotation);
        }
      });

      // Update project chapters with annotations. A complete run replaces the marks of an earlier
      // run in every chapter, so a contradiction that is gone leaves no mark behind; a run with
      // failed requests replaces them only in the chapters it marked.
      if (this.project.structure) {
        this.mergeAnnotationsIntoProject(annotations, { replaceAll: this.failures.length === 0 });
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

    // The place of the mark: the rule's own offset in the chapter's text, where it gives one (a
    // text search would find the first copy of the words, which may stand inside a note)
    let position = 0;
    let length = 50;

    if (Number.isInteger(occurrence.position) && occurrence.position >= 0 &&
        Number.isInteger(occurrence.length) && occurrence.position + occurrence.length <= chapter.content.length) {
      position = occurrence.position;
      length = occurrence.length;
    } else if (occurrence.content) {
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

    // Create annotation. The margin shows its text: in Finnish, rebuilt from the fields where the
    // checker's own message is English (the same rule as the Projekti tab's list)
    const annotation = window.AnnotationUtils.createAnnotation({
      type: annotationType,
      position,
      length,
      content: ConsistencyChecker.markText(error),
      priority,
      metadata: {
        errorId: error.id,
        errorType: error.type,
        category: error.category,
        autoFixable: error.autoFixable,
        evidence: error.evidence,
        chapters: error.chapters
      },
      aiSuggestion: ConsistencyChecker.markFix(error),
      source: 'ai',
      chapterId: occurrence.chapterId,
      chapterIndex
    });

    return annotation;
  }

  /**
   * Merge generated annotations into project chapters. The project the checker holds is the app's
   * state, so it is not mutated: this.project becomes a new object whose changed chapters are new
   * objects, and the app carries their marks into its state by chapter id.
   *
   * An annotation goes to the chapter of its chapterId, else of its chapterIndex. In a chapter that
   * gets marks the checker's earlier marks are replaced; with replaceAll (a complete run) they are
   * replaced in every chapter, also by none. Every other annotation is kept.
   */
  mergeAnnotationsIntoProject(annotations, { replaceAll = false } = {}) {
    const AI_CONSISTENCY = window.AnnotationUtils.ANNOTATION_TYPES.AI_CONSISTENCY;
    const structure = this.project.structure || [];

    // Group annotations by chapter
    const annotationsByChapter = new Map();
    annotations.forEach(annotation => {
      let chapterIndex = annotation.chapterId !== undefined
        ? structure.findIndex(ch => ch.id === annotation.chapterId)
        : -1;
      if (chapterIndex === -1 && Number.isInteger(annotation.chapterIndex) && structure[annotation.chapterIndex]) {
        chapterIndex = annotation.chapterIndex;
      }
      if (chapterIndex === -1) return;

      if (!annotationsByChapter.has(chapterIndex)) {
        annotationsByChapter.set(chapterIndex, []);
      }
      annotationsByChapter.get(chapterIndex).push(annotation);
    });

    if (annotationsByChapter.size === 0 && !replaceAll) return;

    this.project = {
      ...this.project,
      structure: structure.map((chapter, chapterIndex) => {
        const chapterAnnotations = annotationsByChapter.get(chapterIndex);
        if (!chapter || (!chapterAnnotations && !replaceAll)) return chapter;

        const kept = (chapter.annotations || []).filter(ann => ann.type !== AI_CONSISTENCY);
        if (!chapterAnnotations && kept.length === (chapter.annotations || []).length) return chapter;
        if (chapterAnnotations) {
          console.log(`[ConsistencyChecker] Added ${chapterAnnotations.length} annotations to chapter ${chapterIndex + 1}`);
        }
        return { ...chapter, annotations: [...kept, ...(chapterAnnotations || [])] };
      })
    };
  }

  /**
   * The text of a mark in the margin, in Finnish. The checker writes three types in English
   * (name variations, timeline, location); their text is rebuilt from the fields.
   */
  static markText(error) {
    if (error.type === 'name_variation') {
      return 'Nimen kirjoitusasu vaihtelee: ' + (error.variations || []).join(', ');
    }
    if ((error.type === 'timeline_error' || error.type === 'location_inconsistency') && error.description) {
      return error.description;
    }
    return error.message;
  }

  /** The correction a mark suggests, in Finnish, or null. */
  static markFix(error) {
    if (error.type === 'name_variation') {
      const name = error.characterName || (error.variations || [])[0] || '';
      return name ? `Käytä kaikkialla muotoa ”${name}”.` : null;
    }
    if (error.suggestedFix === 'Manual review needed') return 'Tarkista käsin.';
    return error.suggestedFix || null;
  }

  /**
   * Check character consistency using AI. The pattern side (which sentences mention the character)
   * is rules.mentionSentences: the Tarinakansio matcher finds the name, its words and the aliases of
   * the entry of the same name in any inflected form, notes are left out, and the sentences are cut
   * by the app's sentence rule.
   */
  async checkCharacterConsistency() {
    if (!this.electronAPI) {
      return [];
    }

    const rules = this.patternRules();
    const errors = [];

    // Check each character
    for (const character of this.project.characters || []) {
      // The first five sentences that mention the character, per chapter
      const mentions = rules.mentionSentences(this.project, character, 5);

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

If no contradictions found, return: {"contradictions": []}${this.languageRule ? '\n' + this.languageRule : ''}`;

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
          result = await this.electronAPI.claudeAPI({ prompt, model: modelName, temperature: 0.3 });
        } else if (provider === 'grok') {
          result = await this.electronAPI.claudeAPI({ prompt, model: modelName, temperature: 0.3 });
        } else if (provider === 'deepseek') {
          result = await this.electronAPI.claudeAPI({ prompt, model: modelName, temperature: 0.3 });
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
        (this.failures = this.failures || []).push(`${character.name}: ${result?.error || 'malli ei vastannut'}`);
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
        // No fix exists for what the model finds: applyAutoFix knows name variations only
        autoFixable: false
      }));

    } catch (error) {
      console.error('[ConsistencyChecker] Character check error:', error);
      (this.failures = this.failures || []).push(`${character.name}: ${error.message}`);
      return [];
    }
  }

  /**
   * Check naming consistency: a name written in two base spellings (Katariina / Katarina).
   * Inflected forms, other characters, aliases, entries and places are never variations.
   */
  async checkNamingConsistency() {
    return this.patternRules().nameFindings(this.project);
  }

  /**
   * Check timeline consistency
   * Detects chronological errors where a later chapter's dates lie before an earlier chapter's.
   * The dates are read by rules.extractDates: a number that is no day of the calendar is not a date.
   */
  async checkTimeline() {
    return this.patternRules().timelineFindings(this.project);
  }

  /**
   * Check location consistency
   * Detects a character who is clearly said to be in two places in consecutive chapters with no move told
   */
  async checkLocationConsistency() {
    return this.patternRules().locationFindings(this.project);
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
   * Fix name variations: every place where a variation is written gets the kept spelling, and
   * the ending of the word stays as written (Katarinan → Katariinan). The plan is rules.planNameFix;
   * a plan that is not safe changes nothing and throws.
   *
   * The project the checker holds is the app's state, so it is not changed in place: this.project
   * becomes a new object whose changed chapters are new objects. The caller writes `chapters`
   * (id, content, changes) into its own state.
   */
  fixNameVariations(error) {
    const plan = this.patternRules().planNameFix(this.project, error);
    if (!plan.safe) {
      throw new Error('Error is not auto-fixable');
    }

    const texts = new Map(plan.chapters.map(chapter => [chapter.id, chapter.content]));
    this.project = {
      ...this.project,
      structure: (this.project.structure || []).map(chapter =>
        chapter && texts.has(chapter.id) ? { ...chapter, content: texts.get(chapter.id) } : chapter)
    };

    return {
      success: true,
      message: `Fixed ${plan.count} instances of name variations`,
      correctName: plan.correctName,
      fixCount: plan.count,
      chapters: plan.chapters
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

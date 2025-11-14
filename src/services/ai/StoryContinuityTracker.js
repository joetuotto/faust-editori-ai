/**
 * StoryContinuityTracker - Maintain story facts and consistency
 *
 * Features:
 * - Track characters, locations, items, events
 * - Maintain timeline of story events
 * - Detect inconsistencies
 * - Provide context to AI for generation
 */

class StoryContinuityTracker {
  constructor(project) {
    this.project = project;

    // Ensure continuity structure exists
    if (!this.project.continuity) {
      this.project.continuity = {
        characters: {}, // { name: { appearances: [], traits: {}, state: {} } }
        locations: {}, // { name: { descriptions: [], firstMentioned: chapterIndex } }
        timeline: [], // [ { chapter, event, timestamp } ]
        facts: [], // [ { fact, source: chapterIndex } ]
        plotThreads: {} // { threadId: { introduced, resolved, status } }
      };
    }
  }

  /**
   * Extract story elements from chapter content
   * This would ideally use AI, but for now use simple pattern matching
   */
  async extractFromChapter(chapterIndex, content) {
    const chapter = this.project.structure[chapterIndex];
    if (!chapter) return;

    // Extract character mentions
    const characterNames = this.extractCharacterMentions(content);
    characterNames.forEach(name => {
      this.trackCharacterAppearance(name, chapterIndex);
    });

    // Extract location mentions
    const locations = this.extractLocationMentions(content);
    locations.forEach(location => {
      this.trackLocation(location, chapterIndex);
    });

    console.log(`[Continuity] Extracted from Chapter ${chapterIndex + 1}:`, {
      characters: characterNames.length,
      locations: locations.length
    });
  }

  /**
   * Extract character names from text
   * Uses character list from project if available
   */
  extractCharacterMentions(content) {
    const mentions = new Set();

    // Use characters from project
    if (this.project.characters && this.project.characters.length > 0) {
      (this.project.characters || []).forEach(char => {
        const name = char.name || char.basicInfo?.name;
        if (name && content.includes(name)) {
          mentions.add(name);
        }
      });
    }

    // Also look for capitalized words (potential names)
    // Simple heuristic: consecutive capitalized words
    const capitalizedPattern = /\b[A-ZÄÖÅ][a-zäöå]+(?:\s+[A-ZÄÖÅ][a-zäöå]+)?\b/g;
    const matches = content.match(capitalizedPattern) || [];

    matches.forEach(match => {
      // Filter out common words that aren't names
      const commonWords = ['The', 'A', 'An', 'In', 'On', 'At', 'To', 'For', 'Chapter', 'He', 'She', 'It', 'They'];
      if (!commonWords.includes(match) && match.length > 2) {
        mentions.add(match);
      }
    });

    return Array.from(mentions);
  }

  /**
   * Extract location mentions
   */
  extractLocationMentions(content) {
    const locations = new Set();

    // Common location patterns
    const locationPatterns = [
      /(?:in|at|to|from|near)\s+([A-ZÄÖÅ][a-zäöå]+(?:\s+[A-ZÄÖÅ][a-zäöå]+)?)/g,
      /([A-ZÄÖÅ][a-zäöå]+(?:\s+[A-ZÄÖÅ][a-zäöå]+)?)\s+(?:city|town|village|castle|house|room|street|road)/gi
    ];

    locationPatterns.forEach(pattern => {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const location = match[1];
        if (location && location.length > 2) {
          locations.add(location);
        }
      }
    });

    return Array.from(locations);
  }

  /**
   * Track character appearance in chapter
   */
  trackCharacterAppearance(characterName, chapterIndex) {
    if (!this.project.continuity.characters[characterName]) {
      this.project.continuity.characters[characterName] = {
        name: characterName,
        appearances: [],
        traits: {},
        state: {}
      };
    }

    const character = this.project.continuity.characters[characterName];

    if (!character.appearances.includes(chapterIndex)) {
      character.appearances.push(chapterIndex);
      character.appearances.sort((a, b) => a - b);
    }
  }

  /**
   * Track location mention
   */
  trackLocation(locationName, chapterIndex) {
    if (!this.project.continuity.locations[locationName]) {
      this.project.continuity.locations[locationName] = {
        name: locationName,
        firstMentioned: chapterIndex,
        appearances: [],
        descriptions: []
      };
    }

    const location = this.project.continuity.locations[locationName];

    if (!location.appearances.includes(chapterIndex)) {
      location.appearances.push(chapterIndex);
      location.appearances.sort((a, b) => a - b);
    }
  }

  /**
   * Add a timeline event
   */
  addTimelineEvent(chapterIndex, event, timestamp = null) {
    this.project.continuity.timeline.push({
      chapter: chapterIndex,
      event,
      timestamp: timestamp || new Date().toISOString()
    });

    // Sort by chapter
    this.project.continuity.timeline.sort((a, b) => a.chapter - b.chapter);
  }

  /**
   * Add a story fact
   */
  addFact(fact, sourceChapter) {
    const existing = this.project.continuity.facts.find(f =>
      f.fact.toLowerCase() === fact.toLowerCase()
    );

    if (!existing) {
      this.project.continuity.facts.push({
        fact,
        source: sourceChapter,
        addedAt: new Date().toISOString()
      });
    }
  }

  /**
   * Get context for AI generation
   * Returns relevant continuity info for a specific chapter
   */
  getContextForChapter(chapterIndex) {
    const context = {
      characters: [],
      locations: [],
      recentEvents: [],
      establishedFacts: []
    };

    // Get characters that have appeared before this chapter
    Object.values(this.project.continuity?.characters || {}).forEach(char => {
      if (char.appearances && char.appearances.some(app => app < chapterIndex)) {
        context.characters.push({
          name: char.name,
          appearances: char.appearances.filter(app => app < chapterIndex),
          lastSeen: Math.max(...char.appearances.filter(app => app < chapterIndex))
        });
      }
    });

    // Get locations mentioned before this chapter
    Object.values(this.project.continuity?.locations || {}).forEach(loc => {
      if (loc.appearances && loc.appearances.some(app => app < chapterIndex)) {
        context.locations.push({
          name: loc.name,
          firstMentioned: loc.firstMentioned
        });
      }
    });

    // Get recent timeline events (last 5 before this chapter)
    context.recentEvents = (this.project.continuity?.timeline || [])
      .filter(evt => evt.chapter < chapterIndex)
      .slice(-5);

    // Get all facts
    context.establishedFacts = (this.project.continuity?.facts || [])
      .filter(fact => fact.source < chapterIndex)
      .map(f => f.fact);

    return context;
  }

  /**
   * Format context as text for AI prompt
   */
  formatContextAsText(context) {
    let text = '';

    if (context.characters.length > 0) {
      text += 'CHARACTERS (previously introduced):\n';
      context.characters.forEach(char => {
        text += `- ${char.name} (last seen in Chapter ${char.lastSeen + 1})\n`;
      });
      text += '\n';
    }

    if (context.locations.length > 0) {
      text += 'LOCATIONS (previously mentioned):\n';
      context.locations.forEach(loc => {
        text += `- ${loc.name}\n`;
      });
      text += '\n';
    }

    if (context.recentEvents.length > 0) {
      text += 'RECENT EVENTS:\n';
      context.recentEvents.forEach(evt => {
        text += `- Chapter ${evt.chapter + 1}: ${evt.event}\n`;
      });
      text += '\n';
    }

    if (context.establishedFacts.length > 0) {
      text += 'ESTABLISHED FACTS:\n';
      context.establishedFacts.forEach(fact => {
        text += `- ${fact}\n`;
      });
      text += '\n';
    }

    return text;
  }

  /**
   * Check for potential inconsistencies
   * This is a simple version - full version would use AI
   */
  checkInconsistencies() {
    const issues = [];

    // Check for characters that disappear for many chapters
    Object.values(this.project.continuity?.characters || {}).forEach(char => {
      if (char.appearances.length < 2) return;

      const gaps = [];
      for (let i = 1; i < char.appearances.length; i++) {
        const gap = char.appearances[i] - char.appearances[i - 1];
        if (gap > 5) {
          gaps.push({
            character: char.name,
            from: char.appearances[i - 1],
            to: char.appearances[i],
            gap
          });
        }
      }

      if (gaps.length > 0) {
        issues.push({
          type: 'character_gap',
          severity: 'medium',
          message: `${char.name} disappeared for ${gaps[0].gap} chapters (Ch${gaps[0].from + 1} → Ch${gaps[0].to + 1})`
        });
      }
    });

    return issues;
  }

  /**
   * Get summary statistics
   */
  getStats() {
    return {
      totalCharacters: Object.keys(this.project.continuity?.characters || {}).length,
      totalLocations: Object.keys(this.project.continuity?.locations || {}).length,
      timelineEvents: (this.project.continuity?.timeline || []).length,
      establishedFacts: (this.project.continuity?.facts || []).length,
      plotThreads: Object.keys(this.project.continuity?.plotThreads || {}).length
    };
  }
}

// Export for use in app.js (Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StoryContinuityTracker;
}

// Make available globally for browser
if (typeof window !== 'undefined') {
  window.StoryContinuityTracker = StoryContinuityTracker;
}

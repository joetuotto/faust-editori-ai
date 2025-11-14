/**
 * CharacterGenerator.js
 *
 * AI-powered character generation using the 4-layer model:
 * 1. Psychological Layer (Big Five, DSM, Becker, Trauma, Beliefs)
 * 2. Transactional Layer (Berne's TA, Social Games)
 * 3. Archetypal Layer (Jungian Archetypes, Mythic Journey)
 * 4. Ensemble Layer (Story Fit, Group Dynamics)
 */

class CharacterGenerator {
  constructor(aiManager) {
    this.aiManager = aiManager;
    this.genre = 'fiction';
    this.storyTheme = '';
  }

  /**
   * Set story context for character generation
   */
  setStoryContext(genre, theme, targetAudience = 'adult') {
    this.genre = genre;
    this.storyTheme = theme;
    this.targetAudience = targetAudience;
  }

  /**
   * Generate a complete character with all 4 layers
   */
  async generateCharacter(params = {}) {
    const {
      name = '',
      role = 'supporting', // 'protagonist', 'antagonist', 'supporting', 'minor'
      archetypeHint = null,
      relationToExistingCharacters = [],
      complexity = 'medium' // 'simple', 'medium', 'complex'
    } = params;

    try {
      // Build AI prompt
      const prompt = this._buildCharacterPrompt(name, role, archetypeHint, complexity, relationToExistingCharacters);

      // Call AI to generate character
      const response = await this.aiManager.callAI('claude', prompt);

      if (!response.success) {
        throw new Error(response.error || 'Failed to generate character');
      }

      // Parse AI response
      const characterData = this._parseAIResponse(response.data);

      // Calculate ensemble layer metrics
      const ensembleLayer = await this._calculateEnsembleMetrics(
        characterData,
        relationToExistingCharacters
      );

      // Combine all layers
      const character = {
        id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name || characterData.name,
        description: characterData.description,
        age: characterData.age,
        occupation: characterData.occupation,
        background: characterData.background,
        psychological: characterData.psychological,
        transactional: characterData.transactional,
        archetypal: characterData.archetypal,
        ensemble: ensembleLayer,
        characterArc: characterData.characterArc,
        createdAt: new Date().toISOString(),
        notes: ''
      };

      return { success: true, character };
    } catch (error) {
      console.error('[CharacterGenerator] Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate an entire ensemble (5-20 characters) for a story
   */
  async generateEnsemble(params = {}) {
    const {
      storyDescription,
      characterCount = 5,
      complexity = 'medium'
    } = params;

    try {
      // Generate protagonist first
      const protagonist = await this.generateCharacter({
        role: 'protagonist',
        complexity: 'complex'
      });

      if (!protagonist.success) {
        throw new Error('Failed to generate protagonist');
      }

      const characters = [protagonist.character];

      // Generate antagonist
      const antagonist = await this.generateCharacter({
        role: 'antagonist',
        complexity: 'complex',
        relationToExistingCharacters: [
          { id: protagonist.character.id, relation: 'enemy' }
        ]
      });

      if (antagonist.success) {
        characters.push(antagonist.character);
      }

      // Generate supporting characters
      const supportingCount = Math.max(0, characterCount - characters.length);

      for (let i = 0; i < supportingCount; i++) {
        const supporting = await this.generateCharacter({
          role: i < 2 ? 'deuteragonist' : 'supporting',
          complexity: i < 2 ? 'medium' : 'simple',
          relationToExistingCharacters: characters.map(c => ({
            id: c.id,
            relation: 'neutral'
          }))
        });

        if (supporting.success) {
          characters.push(supporting.character);
        }
      }

      // Calculate ensemble-wide metrics
      const ensembleMetrics = this._calculateEnsembleCoherence(characters);

      return {
        success: true,
        characters,
        ensembleMetrics
      };
    } catch (error) {
      console.error('[CharacterGenerator] Ensemble generation error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Build AI prompt for character generation
   */
  _buildCharacterPrompt(name, role, archetypeHint, complexity, relations) {
    const complexityInstructions = {
      simple: 'Create a simple, clear character with basic psychological traits.',
      medium: 'Create a moderately complex character with defined personality and some depth.',
      complex: 'Create a deeply complex character with rich psychological depth, trauma, and nuanced motivations.'
    };

    return `Generate a ${role} character for a ${this.genre} story with theme: "${this.storyTheme}".

${name ? `Character name: ${name}` : 'Generate an appropriate name.'}
${archetypeHint ? `Primary archetype should be: ${archetypeHint}` : ''}

Complexity level: ${complexity}
${complexityInstructions[complexity]}

Please provide a complete character using this 4-layer model:

1. PSYCHOLOGICAL LAYER:
   - Big Five personality traits (openness, conscientiousness, extraversion, agreeableness, neuroticism) as 0-1 scores
   - DSM category if applicable (anxiety, mood, personality, trauma_related, or none)
   - Existential terror (death anxiety 0-1, coping mechanism)
   - Trauma (if any): type, severity, triggers, coping strategy
   - Belief system: core beliefs, values, worldview

2. TRANSACTIONAL LAYER:
   - Ego states (parent, adult, child) as 0-1 scores
   - Dominant ego state
   - Social game (victim/rescuer/persecutor or none)
   - Communication style (assertive/passive/aggressive/passive_aggressive)
   - Attachment style

3. ARCHETYPAL LAYER:
   - Primary archetype (hero, shadow, mentor, trickster, etc.)
   - Secondary archetypes
   - Mythic journey stage
   - Associated symbols
   - Shadow work (suppressed traits, projections)

4. CHARACTER ARC:
   - Beginning state
   - Middle transformation
   - End state
   - Transformation type (positive/negative/tragic/flat)

${relations.length > 0 ? `\nRELATIONS TO EXISTING CHARACTERS:\n${relations.map(r => `- ${r.id}: ${r.relation}`).join('\n')}` : ''}

Return ONLY valid JSON matching this structure:
{
  "name": "Character Name",
  "description": "Brief description",
  "age": 30,
  "occupation": "occupation",
  "background": "backstory",
  "psychological": {
    "bigFive": {
      "openness": 0.7,
      "conscientiousness": 0.6,
      "extraversion": 0.5,
      "agreeableness": 0.8,
      "neuroticism": 0.4
    },
    "dsmCategory": "none",
    "existentialTerror": {
      "deathAnxiety": 0.3,
      "copingMechanism": "relationships"
    },
    "trauma": null,
    "beliefSystem": {
      "core_beliefs": ["I am capable", "People are trustworthy"],
      "values": ["honesty", "loyalty", "growth"],
      "worldview": "optimistic"
    }
  },
  "transactional": {
    "egoStates": {
      "parent": 0.3,
      "adult": 0.5,
      "child": 0.2
    },
    "dominantState": "adult",
    "socialGame": {
      "game": "none",
      "pattern": ""
    },
    "communicationStyle": "assertive",
    "attachmentStyle": "secure"
  },
  "archetypal": {
    "primaryArchetype": "hero",
    "secondaryArchetypes": ["explorer"],
    "mythicJourney": {
      "stage": "ordinary_world",
      "completion": 0.1
    },
    "symbols": ["sword", "light"],
    "shadowWork": {
      "suppressedTraits": ["anger", "selfishness"],
      "projections": []
    }
  },
  "characterArc": {
    "beginning": "naive and idealistic",
    "middle": "tested and growing",
    "end": "wise and mature",
    "transformationType": "positive"
  }
}`;
  }

  /**
   * Parse AI response to extract character data
   */
  _parseAIResponse(aiResponse) {
    try {
      // Extract JSON from response (AI might include explanatory text)
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const data = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!data.name || !data.psychological || !data.transactional || !data.archetypal) {
        throw new Error('Missing required character layers in AI response');
      }

      return data;
    } catch (error) {
      console.error('[CharacterGenerator] Parse error:', error);
      // Return minimal valid character
      return {
        name: 'Unnamed Character',
        description: 'Character description unavailable',
        age: 30,
        occupation: 'Unknown',
        background: 'Background unavailable',
        psychological: this._getDefaultPsychological(),
        transactional: this._getDefaultTransactional(),
        archetypal: this._getDefaultArchetypal(),
        characterArc: {
          beginning: 'Initial state',
          middle: 'Transformation',
          end: 'Final state',
          transformationType: 'flat'
        }
      };
    }
  }

  /**
   * Calculate ensemble layer metrics
   */
  async _calculateEnsembleMetrics(characterData, relations) {
    // Calculate story fit based on character's archetype and psychological traits
    const themeCompatibility = this._calculateThemeCompatibility(characterData);
    const genreAlignment = this._calculateGenreAlignment(characterData);

    // Determine narrative role (already provided in params, but validate)
    let narrativeRole = 'supporting';
    if (characterData.archetypal?.primaryArchetype === 'hero') {
      narrativeRole = 'protagonist';
    } else if (characterData.archetypal?.primaryArchetype === 'shadow') {
      narrativeRole = 'antagonist';
    }

    // Build relationship matrix from provided relations
    const relationshipMatrix = {};
    relations.forEach(rel => {
      relationshipMatrix[rel.id] = {
        type: rel.relation || 'neutral',
        intensity: 0.5,
        dynamic: `${rel.relation} relationship`
      };
    });

    // Calculate ensemble resonance (placeholder - would be more sophisticated)
    const ensembleResonance = relations.length > 0 ? 0.7 : 0.5;

    return {
      storyFit: {
        themeCompatibility,
        genreAlignment,
        narrativeRole
      },
      groupDynamics: {
        tuckmanStage: 'forming',
        roleInGroup: this._inferGroupRole(characterData),
        conflicts: [],
        synergies: []
      },
      relationshipMatrix,
      ensembleResonance
    };
  }

  /**
   * Calculate how well character fits story theme
   */
  _calculateThemeCompatibility(characterData) {
    // Placeholder - could use semantic similarity or keyword matching
    // For now, return reasonable default
    return 0.75;
  }

  /**
   * Calculate how well character fits genre
   */
  _calculateGenreAlignment(characterData) {
    const genreTraits = {
      horror: { neuroticism: 0.7, openness: 0.6 },
      romance: { agreeableness: 0.7, extraversion: 0.6 },
      thriller: { conscientiousness: 0.6, neuroticism: 0.5 },
      fantasy: { openness: 0.8, extraversion: 0.5 },
      'sci-fi': { openness: 0.8, conscientiousness: 0.7 },
      mystery: { conscientiousness: 0.7, openness: 0.6 }
    };

    const idealTraits = genreTraits[this.genre] || {};
    const characterTraits = characterData.psychological?.bigFive || {};

    // Calculate similarity (simple distance metric)
    let totalDiff = 0;
    let count = 0;

    Object.keys(idealTraits).forEach(trait => {
      if (characterTraits[trait] !== undefined) {
        totalDiff += Math.abs(idealTraits[trait] - characterTraits[trait]);
        count++;
      }
    });

    return count > 0 ? 1 - (totalDiff / count) : 0.5;
  }

  /**
   * Infer character's role in group from their traits
   */
  _inferGroupRole(characterData) {
    const psych = characterData.psychological;
    const trans = characterData.transactional;

    if (!psych || !trans) return 'follower';

    // Leader: high extraversion + conscientiousness, parent ego state
    if (psych.bigFive.extraversion > 0.7 && psych.bigFive.conscientiousness > 0.6 && trans.dominantState === 'parent') {
      return 'leader';
    }

    // Mediator: high agreeableness + adult ego state
    if (psych.bigFive.agreeableness > 0.7 && trans.dominantState === 'adult') {
      return 'mediator';
    }

    // Rebel: low agreeableness + child ego state
    if (psych.bigFive.agreeableness < 0.4 && trans.dominantState === 'child') {
      return 'rebel';
    }

    // Outsider: low extraversion
    if (psych.bigFive.extraversion < 0.3) {
      return 'outsider';
    }

    return 'follower';
  }

  /**
   * Calculate coherence of entire ensemble
   */
  _calculateEnsembleCoherence(characters) {
    if (characters.length === 0) return { coherence: 0, diversity: 0, balance: 0 };

    // Diversity: how different are characters from each other
    const diversity = this._calculateDiversity(characters);

    // Balance: do we have good distribution of archetypes and roles
    const balance = this._calculateBalance(characters);

    // Overall coherence
    const coherence = (diversity + balance) / 2;

    return {
      coherence,
      diversity,
      balance,
      archetypeDistribution: this._getArchetypeDistribution(characters),
      conflictPotential: this._assessConflictPotential(characters),
      synergyOpportunities: this._assessSynergyOpportunities(characters)
    };
  }

  _calculateDiversity(characters) {
    // Calculate average pairwise distance in Big Five space
    let totalDistance = 0;
    let pairs = 0;

    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        const c1 = characters[i].psychological?.bigFive;
        const c2 = characters[j].psychological?.bigFive;

        if (c1 && c2) {
          const distance = Math.sqrt(
            Math.pow(c1.openness - c2.openness, 2) +
            Math.pow(c1.conscientiousness - c2.conscientiousness, 2) +
            Math.pow(c1.extraversion - c2.extraversion, 2) +
            Math.pow(c1.agreeableness - c2.agreeableness, 2) +
            Math.pow(c1.neuroticism - c2.neuroticism, 2)
          );
          totalDistance += distance;
          pairs++;
        }
      }
    }

    return pairs > 0 ? Math.min(totalDistance / pairs / Math.sqrt(5), 1) : 0;
  }

  _calculateBalance(characters) {
    const archetypes = characters.map(c => c.archetypal?.primaryArchetype).filter(Boolean);
    const uniqueArchetypes = new Set(archetypes);

    // More unique archetypes = better balance
    return Math.min(uniqueArchetypes.size / Math.min(characters.length, 8), 1);
  }

  _getArchetypeDistribution(characters) {
    const distribution = {};
    characters.forEach(c => {
      const archetype = c.archetypal?.primaryArchetype || 'unknown';
      distribution[archetype] = (distribution[archetype] || 0) + 1;
    });
    return distribution;
  }

  _assessConflictPotential(characters) {
    // Characters with opposing traits create interesting conflict
    const conflicts = [];

    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        const c1 = characters[i];
        const c2 = characters[j];

        // Check for opposing archetypes
        if (c1.archetypal?.primaryArchetype === 'hero' && c2.archetypal?.primaryArchetype === 'shadow') {
          conflicts.push(`${c1.name} vs ${c2.name}: Hero vs Shadow`);
        }

        // Check for low agreeableness + different values
        const psych1 = c1.psychological;
        const psych2 = c2.psychological;

        if (psych1 && psych2 &&
            (psych1.bigFive.agreeableness < 0.4 || psych2.bigFive.agreeableness < 0.4)) {
          conflicts.push(`${c1.name} vs ${c2.name}: Personality clash`);
        }
      }
    }

    return conflicts;
  }

  _assessSynergyOpportunities(characters) {
    // Characters with complementary traits create synergy
    const synergies = [];

    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        const c1 = characters[i];
        const c2 = characters[j];

        // Check for mentor-hero synergy
        if (c1.archetypal?.primaryArchetype === 'mentor' && c2.archetypal?.primaryArchetype === 'hero') {
          synergies.push(`${c1.name} & ${c2.name}: Mentor-Hero bond`);
        }

        // Check for complementary ego states
        if (c1.transactional?.dominantState === 'parent' && c2.transactional?.dominantState === 'child') {
          synergies.push(`${c1.name} & ${c2.name}: Parent-Child synergy`);
        }
      }
    }

    return synergies;
  }

  // Default layer generators
  _getDefaultPsychological() {
    return {
      bigFive: {
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.5,
        neuroticism: 0.5
      },
      dsmCategory: 'none',
      beliefSystem: {
        core_beliefs: [],
        values: [],
        worldview: 'realistic'
      }
    };
  }

  _getDefaultTransactional() {
    return {
      egoStates: {
        parent: 0.33,
        adult: 0.34,
        child: 0.33
      },
      dominantState: 'adult',
      communicationStyle: 'assertive'
    };
  }

  _getDefaultArchetypal() {
    return {
      primaryArchetype: 'explorer',
      secondaryArchetypes: [],
      mythicJourney: {
        stage: 'ordinary_world',
        completion: 0
      },
      symbols: []
    };
  }
}

// Export for use in app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CharacterGenerator;
}

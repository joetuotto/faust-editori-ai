/**
 * CHARACTER GENERATOR - 4-Layer Deep Character System
 *
 * Generates rich, psychologically complex characters using AI with a 4-layer model:
 * 1. Psychological Layer (Big Five + DSM + Becker + Trauma)
 * 2. Transactional Layer (Berne's TA, Drama Triangle, Attachment)
 * 3. Archetypal Layer (Jung + Hero's Journey)
 * 4. Character Arc & Voice
 */

import type { Character, ArchetypalLayer, PsychologicalLayer, TransactionalLayer } from '../types';

interface GenerateCharacterParams {
  name?: string;
  role?: 'protagonist' | 'antagonist' | 'supporting';
  characterType?: string;
  realPeople?: string;
  answers?: Record<string, string>;
  archetypeInfo?: {
    archetypeFamily?: string;
    description?: string;
  };
}

interface GenerateCharacterResult {
  success: boolean;
  character?: Character;
  error?: string;
}

export class CharacterGenerator {
  private genre: string = 'fiction';
  private storyTheme: string = '';

  setStoryContext(genre: string, theme: string): void {
    this.genre = genre;
    this.storyTheme = theme;
  }

  async generateCharacter(params: GenerateCharacterParams = {}): Promise<GenerateCharacterResult> {
    const {
      name = '',
      role = 'supporting',
      characterType = '',
      realPeople = '',
      answers = {},
      archetypeInfo = {}
    } = params;

    if (!window.electronAPI) {
      return { success: false, error: 'Electron API not available' };
    }

    try {
      const prompt = this._buildCharacterPrompt(name, role, characterType, realPeople, answers, archetypeInfo);
      const response = await window.electronAPI.claudeAPI(prompt);

      if (!response.success) {
        throw new Error(response.error || 'Failed to generate character');
      }

      const characterData = this._parseAIResponse(response.data);

      const character: Character = {
        id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name || characterData.name,
        description: characterData.description,
        age: characterData.age,
        occupation: characterData.occupation,
        background: characterData.background,
        psychological: characterData.psychological,
        transactional: characterData.transactional,
        archetypal: characterData.archetypal,
        ensemble: this._calculateEnsembleMetrics(characterData, role),
        characterArc: characterData.characterArc,
        createdAt: new Date().toISOString(),

        // Legacy fields for backward compatibility
        appearance: characterData.appearance,
        psychology: characterData.psychology,
        shadow: characterData.shadow,
        voice: characterData.voice
      };

      return { success: true, character };
    } catch (error: any) {
      console.error('[CharacterGenerator] Error:', error);
      return { success: false, error: error.message };
    }
  }

  private _buildCharacterPrompt(
    name: string,
    role: string,
    characterType: string,
    realPeople: string,
    answers: Record<string, string>,
    archetypeInfo: any
  ): string {
    const answersText = Object.entries(answers || {})
      .map(([qId, answer]) => `Q: ${answer}`)
      .join('\n');

    return `Generate a ${role} character for a ${this.genre} story with theme: "${this.storyTheme}".

CHARACTER TYPE: ${characterType}
${archetypeInfo.archetypeFamily ? `ARCHETYPE: ${archetypeInfo.archetypeFamily}` : ''}
${realPeople ? `REAL PEOPLE INSPIRATION: ${realPeople}` : ''}

${answersText ? `AUTHOR'S NOTES:\n${answersText}` : ''}

Create a comprehensive 4-LAYER character profile:

1. PSYCHOLOGICAL LAYER (Big Five + DSM + Becker + Trauma + Beliefs):
   - Big Five personality: openness, conscientiousness, extraversion, agreeableness, neuroticism (0-1 scores)
   - DSM category if applicable (anxiety/mood/personality/trauma_related/none)
   - Existential terror: death anxiety (0-1), coping mechanism (heroism/religiosity/creativity/relationships/denial)
   - Trauma (if any): type (childhood/loss/violence/betrayal/other), severity (0-1), trigger words, coping strategy
   - Belief system: core beliefs, values, worldview (optimistic/pessimistic/realistic/cynical)
   - MBTI and Enneagram for reference

2. TRANSACTIONAL LAYER (Berne's Transactional Analysis):
   - Ego states: parent (0-1), adult (0-1), child (0-1)
   - Dominant ego state (parent/adult/child)
   - Social game: victim/rescuer/persecutor/none (Karpman Drama Triangle)
   - Communication style: assertive/passive/aggressive/passive_aggressive
   - Attachment style: secure/anxious/avoidant/disorganized

3. ARCHETYPAL LAYER (Jungian + Mythic Journey):
   - Primary archetype: hero/mentor/threshold_guardian/herald/shapeshifter/shadow/ally/trickster/innocent/sage/explorer/outlaw/magician/lover/jester/caregiver/creator/ruler
   - Secondary archetypes
   - Mythic journey stage: ordinary_world/call_to_adventure/refusal/meeting_mentor/crossing_threshold/tests/approach/ordeal/reward/road_back/resurrection/return_with_elixir
   - Journey completion (0-1)
   - Associated symbols
   - Shadow work: suppressed traits, projections onto others
   - Jungian shadow: hidden aspects, deepest fear, secret desire

4. CHARACTER ARC & VOICE:
   - Arc: beginning state, middle transformation, end state
   - Transformation type: positive/negative/tragic/flat
   - Voice & speech patterns with 3 example lines in character

Return ONLY valid JSON matching this EXACT structure:
{
  "name": "Character Name",
  "description": "Brief description",
  "age": 30,
  "occupation": "occupation",
  "background": "backstory",
  "appearance": "physical description",
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
  "psychology": {
    "mbti": "INTJ",
    "enneagram": "5w4",
    "traits": ["analytical", "independent", "strategic"]
  },
  "shadow": {
    "hidden": "What they hide from others",
    "fear": "Deepest fear",
    "desire": "Secret desire"
  },
  "voice": {
    "style": "Description of speech patterns",
    "examples": ["Example line 1", "Example line 2", "Example line 3"]
  },
  "characterArc": {
    "beginning": "Starting state",
    "catalyst": "What changes them",
    "end": "Final transformation",
    "transformationType": "positive"
  }
}`;
  }

  private _parseAIResponse(aiResponse: string | undefined): any {
    try {
      if (!aiResponse) {
        throw new Error('No AI response provided');
      }

      let data = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = data.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!parsed.name) {
        throw new Error('Missing name in AI response');
      }

      // Ensure all 4 layers exist with defaults
      if (!parsed.psychological) {
        parsed.psychological = this._getDefaultPsychological();
      }
      if (!parsed.transactional) {
        parsed.transactional = this._getDefaultTransactional();
      }
      if (!parsed.archetypal) {
        parsed.archetypal = this._getDefaultArchetypal();
      }

      return parsed;
    } catch (error) {
      console.error('[CharacterGenerator] Parse error:', error);
      // Return minimal valid character
      return {
        name: 'Unnamed Character',
        description: 'Character description unavailable',
        age: 30,
        occupation: 'Unknown',
        background: 'Background unavailable',
        appearance: 'Appearance unavailable',
        psychological: this._getDefaultPsychological(),
        transactional: this._getDefaultTransactional(),
        archetypal: this._getDefaultArchetypal(),
        psychology: { mbti: 'INTJ', enneagram: '5w4', traits: [] },
        shadow: { hidden: '', fear: '', desire: '' },
        voice: { style: '', examples: [] },
        characterArc: {
          beginning: 'Initial state',
          catalyst: 'Change event',
          end: 'Final state',
          transformationType: 'flat'
        }
      };
    }
  }

  private _calculateEnsembleMetrics(characterData: any, role: string): any {
    let narrativeRole = 'supporting';
    if (role === 'protagonist' || characterData.archetypal?.primaryArchetype === 'hero') {
      narrativeRole = 'protagonist';
    } else if (role === 'antagonist' || characterData.archetypal?.primaryArchetype === 'shadow') {
      narrativeRole = 'antagonist';
    }

    return {
      storyFit: {
        themeCompatibility: 0.75,
        genreAlignment: 0.75,
        narrativeRole
      },
      groupDynamics: {
        tuckmanStage: 'forming',
        roleInGroup: this._inferGroupRole(characterData),
        conflicts: [],
        synergies: []
      },
      relationshipMatrix: {},
      ensembleResonance: 0.7
    };
  }

  private _inferGroupRole(characterData: any): string {
    const psych = characterData.psychological;
    const trans = characterData.transactional;

    if (!psych || !trans) return 'follower';

    if (psych.bigFive?.extraversion > 0.7 && psych.bigFive?.conscientiousness > 0.6 && trans.dominantState === 'parent') {
      return 'leader';
    }
    if (psych.bigFive?.agreeableness > 0.7 && trans.dominantState === 'adult') {
      return 'mediator';
    }
    if (psych.bigFive?.agreeableness < 0.4 && trans.dominantState === 'child') {
      return 'rebel';
    }
    if (psych.bigFive?.extraversion < 0.3) {
      return 'outsider';
    }
    return 'follower';
  }

  private _getDefaultPsychological(): PsychologicalLayer {
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

  private _getDefaultTransactional(): TransactionalLayer {
    return {
      egoStates: {
        parent: 0.33,
        adult: 0.34,
        child: 0.33
      },
      dominantState: 'adult',
      communicationStyle: 'assertive',
      attachmentStyle: 'secure'
    };
  }

  private _getDefaultArchetypal(): ArchetypalLayer {
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

export default CharacterGenerator;

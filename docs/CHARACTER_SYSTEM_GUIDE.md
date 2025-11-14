# FAUST 4-Layer Character System

## Overview

FAUST now features a sophisticated 4-layer character generation system that creates psychologically deep and narratively coherent characters. This system goes beyond traditional character profiles by modeling characters across four integrated layers.

## The 4 Layers

### Layer 1: Psychological (Psykologinen Taso) 🧠

The foundation of character psychology, combining multiple validated models:

**Big Five Personality Traits** (0-1 scale):
- **Openness**: Curiosity, imagination, willingness to try new things
- **Conscientiousness**: Organization, discipline, reliability
- **Extraversion**: Sociability, energy, assertiveness
- **Agreeableness**: Compassion, cooperation, trust
- **Neuroticism**: Emotional stability, anxiety levels

**Additional Psychological Elements**:
- **DSM Category**: Clinical psychology categories (anxiety, mood, personality, trauma-related, or none)
- **Existential Terror** (Becker): Death anxiety and coping mechanisms (heroism, religiosity, creativity, relationships, denial)
- **Trauma**: Type, severity (0-1), trigger words, coping strategies
- **Belief System**: Core beliefs, values, worldview (optimistic/pessimistic/realistic/cynical)

**Visual Representation**: Progress bars showing Big Five scores with color coding (green >70%, yellow 40-70%, red <40%)

### Layer 2: Transactional (Transaktiivinen Taso) 🔄

Based on Eric Berne's Transactional Analysis and interpersonal dynamics:

**Ego States** (0-1 scale each):
- **Parent**: Critical or nurturing parental voice
- **Adult**: Rational, objective thinking
- **Child**: Free or adapted childlike responses

**Dominant State**: Which ego state the character primarily operates from

**Social Games**:
- **Karpman Drama Triangle**: Victim, Rescuer, or Persecutor patterns
- **Communication Style**: Assertive, passive, aggressive, or passive-aggressive
- **Attachment Style**: Secure, anxious, avoidant, or disorganized

**Visual Representation**: Three boxes showing ego state percentages, with dominant state highlighted in bronze

### Layer 3: Archetypal (Arkkityyppi Taso) ✨

Jungian archetypes and mythic journey structure:

**Primary Archetype**: Hero, Mentor, Threshold Guardian, Herald, Shapeshifter, Shadow, Ally, Trickster, Innocent, Sage, Explorer, Outlaw, Magician, Lover, Jester, Caregiver, Creator, or Ruler

**Secondary Archetypes**: Supporting archetypal patterns

**Hero's Journey**:
- **Stage**: Current position in the monomyth (Ordinary World → Return with Elixir)
- **Completion**: Progress through the journey (0-1)

**Shadow Work**:
- **Suppressed Traits**: Qualities the character hides or denies
- **Projections**: What they project onto others

**Visual Representation**:
- Primary archetype in sigil-colored box
- Hero's Journey progress bar
- Shadow work in purple-tinted panel

### Layer 4: Ensemble (Hahmokavalkadi Taso) 🎭

How the character fits into the story and ensemble:

**Story Fit**:
- **Theme Compatibility** (0-1): How well character aligns with story themes
- **Genre Alignment** (0-1): Fit to story genre conventions
- **Narrative Role**: Protagonist, Antagonist, Deuteragonist, Supporting, or Minor

**Group Dynamics**:
- **Tuckman Stage**: Team development stage (Forming, Storming, Norming, Performing)
- **Role in Group**: Leader, Mediator, Rebel, Follower, Outsider, or Scapegoat
- **Conflicts**: With which other characters
- **Synergies**: Complementary relationships

**Ensemble Resonance** (0-1): Overall harmony with the ensemble

**Visual Representation**:
- Theme/Genre fit shown as percentages
- Narrative role highlighted in bronze
- Group role clearly labeled

## How to Use the System

### Creating a Character

1. **Plan Cast** (Optional): Define character types needed for your story
2. **Build Character**: Click "Build Characters" button
3. **Select Type**: Choose from your cast plan
4. **Provide Inspiration**: Enter real people who inspire this character
5. **Answer Questions**: AI generates targeted questions based on archetype
6. **Review Profile**: Examine the complete 4-layer profile
7. **Save**: Add character to your project

### Understanding the Profile

The review screen shows each layer in sequence:

1. **Basic Info**: Name, age, occupation, appearance
2. **Layer 1 (Psychological)**: Big Five bars, trauma warnings, belief system
3. **Layer 2 (Transactional)**: Ego state boxes, drama triangle role
4. **Layer 3 (Archetypal)**: Primary archetype, Hero's Journey progress, shadow work
5. **Layer 4 (Ensemble)**: Story fit metrics, group role
6. **Voice Samples**: Example dialogue in character

### Color Coding

- **Bronze/Sigil**: Positive elements, narrative role, archetypes
- **Green**: High personality trait scores (>70%)
- **Yellow**: Moderate scores (40-70%)
- **Red**: Low scores or trauma warnings (<40%)
- **Purple**: Shadow work, suppressed elements
- **Text tones**: Light for headings, medium for content, dark for details

## Technical Implementation

### Data Structure

Characters are stored with all 4 layers as optional fields, allowing backward compatibility:

```javascript
{
  id: string,
  name: string,
  description: string,
  age: number,
  occupation: string,

  // The 4 layers
  psychological: { bigFive, dsmCategory, existentialTerror, trauma, beliefSystem },
  transactional: { egoStates, dominantState, socialGame, communicationStyle, attachmentStyle },
  archetypal: { primaryArchetype, secondaryArchetypes, mythicJourney, symbols, shadowWork },
  ensemble: { storyFit, groupDynamics, relationshipMatrix, ensembleResonance },

  // Legacy fields (for backward compatibility)
  psychology: { mbti, enneagram, traits },
  shadow: { hidden, fear, desire },
  voice: { style, examples },
  characterArc: { beginning, catalyst, end, transformationType }
}
```

### AI Prompt

The system uses a comprehensive AI prompt that instructs Claude to generate all 4 layers with specific metrics and structured output. The prompt emphasizes:

1. **Psychological depth**: Big Five scores, DSM categories, Becker's terror management
2. **Social dynamics**: Berne's TA, Drama Triangle, attachment theory
3. **Mythic structure**: Campbell's monomyth, Jungian archetypes
4. **Narrative fit**: Genre conventions, ensemble dynamics, story themes

### CharacterGenerator Class

Located in `app.js` (lines 9-337), the CharacterGenerator class handles:

- Context setting (genre, theme)
- Character generation with all 4 layers
- Ensemble metrics calculation
- Group role inference based on personality traits
- Fallback defaults for missing data

## Best Practices

### For Writers

1. **Use Cast Planning**: Define character types before generating detailed profiles
2. **Vary Personality Traits**: Ensure ensemble has diverse Big Five profiles
3. **Balance Ego States**: Mix Parent/Adult/Child dominants for dynamic interactions
4. **Complement Archetypes**: Don't create all Heroes; include Mentors, Shadows, Tricksters
5. **Check Story Fit**: Low theme compatibility may indicate character needs adjustment
6. **Leverage Conflicts**: Characters with low agreeableness create natural conflict
7. **Build Synergies**: Match complementary ego states (Parent-Child, Adult-Adult)

### For Development

1. **Validate Layer Presence**: Always check if layer exists before accessing nested properties
2. **Provide Fallbacks**: Use default values for missing personality data
3. **Respect Backward Compatibility**: Legacy fields (psychology, shadow, voice) still supported
4. **Calculate Ensemble Metrics**: Update relationships when characters are added/removed
5. **Use Consistent Scales**: All metrics use 0-1 scale for normalization

## Future Enhancements

Potential additions to the system:

- **Relationship Matrix Editor**: Visual graph of character relationships
- **Ensemble Analyzer**: Automatic conflict/synergy detection
- **Character Evolution**: Track how layers change through story
- **Voice Consistency Checker**: Ensure dialogue matches transactional layer
- **Archetype Suggester**: Recommend missing archetypes for balanced cast
- **Group Dynamics Simulator**: Preview how ensemble interacts at different Tuckman stages

## References

- **Big Five**: Costa & McCrae's Five Factor Model
- **Transactional Analysis**: Eric Berne's ego state theory
- **Drama Triangle**: Stephen Karpman's conflict model
- **Attachment Theory**: Bowlby & Ainsworth's attachment styles
- **DSM**: Diagnostic and Statistical Manual categories
- **Existential Terror**: Ernest Becker's "Denial of Death"
- **Jungian Psychology**: Carl Jung's archetypes and shadow work
- **Hero's Journey**: Joseph Campbell's monomyth structure
- **Tuckman's Stages**: Bruce Tuckman's group development model

---

**Version**: 1.0
**Last Updated**: 2025-10-23
**Author**: FAUST AI System

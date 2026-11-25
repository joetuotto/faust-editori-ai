// The old character builder's profile request (Uusi hahmo, step 5), final pass package E:
// - T-062 (E-19): the request carries max_tokens 8 000, as Analysoi luku's does. With the
//   router's default of 2 000 a reasoning model cut the long JSON and the profile failed.
// - T-096 (menu spec D.7): the prompt ends with the answer-language sentence its caller builds
//   (oldPaths.answerLanguageRule), and the fixed values it names are fields of the format.
//
// CharacterGenerator.js and AIProviderRouter.js are script-tag files that define window globals;
// this file runs in jsdom, the default environment, and loads them as they are.
const path = require('path');

const PROFILE = {
  name: 'Tove Lind',
  description: 'Kuvittaja, joka on palannut saarelle.',
  age: 43,
  occupation: 'kuvittaja',
  background: 'Kasvoi saaristossa.',
  appearance: 'Pitkä ja hoikka.',
  psychological: { bigFive: { openness: 0.8 }, dsmCategory: 'none', beliefSystem: { core_beliefs: ['Työ pelastaa'], values: ['vapaus'], worldview: 'realistic' } },
  transactional: { egoStates: { parent: 0.2, adult: 0.5, child: 0.3 }, dominantState: 'adult', communicationStyle: 'assertive', attachmentStyle: 'avoidant' },
  archetypal: { primaryArchetype: 'creator', secondaryArchetypes: ['explorer'], mythicJourney: { stage: 'return_with_elixir', completion: 0.8 }, symbols: ['meri'] },
  psychology: { mbti: 'INFP', enneagram: '4w5', traits: ['itsepäinen'] },
  shadow: { hidden: 'Yksinäisyys', fear: 'Unohdetuksi tuleminen', desire: 'Hyväksyntä' },
  voice: { style: 'Lyhyitä lauseita.', examples: ['No niin.', 'Katsotaan.', 'Meri ei odota.'] },
  characterArc: { beginning: 'Eristäytynyt', catalyst: 'Veljen kirje', end: 'Avautuu', transformationType: 'positive' }
};

const RULE = 'Write every free-text value in Finnish, names as they are. Keep the JSON keys and the values of "dsmCategory" exactly as given above, in English.';

describe('CharacterGenerator profile request (final pass E: T-062, T-096)', () => {
  let claudeAPI;

  beforeAll(() => {
    require(path.join(__dirname, '..', '..', 'src', 'services', 'ai', 'AIProviderRouter.js'));
    require(path.join(__dirname, '..', '..', 'src', 'services', 'ai', 'CharacterGenerator.js'));
  });

  beforeEach(() => {
    claudeAPI = jest.fn(async () => ({ success: true, data: '```json\n' + JSON.stringify(PROFILE) + '\n```' }));
    window.electronAPI = { claudeAPI };
  });

  afterAll(() => {
    delete window.electronAPI;
  });

  const generate = (extra = {}) => {
    const generator = new window.CharacterGenerator('anthropic', null);
    generator.setStoryContext('fiction', 'Saari');
    return generator.generateCharacter({
      characterType: 'Päähenkilö',
      realPeople: 'Tove Jansson',
      answers: { 1: 'Hän etsii veljeään.' },
      archetypeInfo: { archetypeFamily: 'Luoja' },
      ...extra
    });
  };

  test('the request that reaches main carries max_tokens 8 000, not the router default of 2 000 (T-062, E-19)', async () => {
    const result = await generate({ languageRule: RULE });
    expect(result.success).toBe(true);
    expect(result.character.name).toBe('Tove Lind');
    expect(claudeAPI).toHaveBeenCalledTimes(1);
    expect(claudeAPI.mock.calls[0][0].max_tokens).toBe(8000);
    expect(window.CharacterGenerator.ANSWER_TOKENS).toBe(8000);
  });

  test('the prompt ends with the answer-language sentence after its format (T-096)', async () => {
    await generate({ languageRule: RULE });
    const prompt = claudeAPI.mock.calls[0][0].prompt;
    expect(prompt.endsWith('"transformationType": "positive"\n  }\n}\n\n' + RULE)).toBe(true);
    expect(prompt.split(RULE).length).toBe(2);
  });

  test('without a sentence the prompt ends with its format, as before', async () => {
    await generate();
    expect(claudeAPI.mock.calls[0][0].prompt.endsWith('"transformationType": "positive"\n  }\n}')).toBe(true);
  });

  test('every fixed value the sentence names is a field of the format the model sees', async () => {
    await generate();
    const prompt = claudeAPI.mock.calls[0][0].prompt;
    const fixed = window.CharacterGenerator.FIXED_VALUES;
    expect(fixed.length).toBeGreaterThan(0);
    // The format shows trauma as null; its fields are named in the layer list (type, severity …)
    fixed.filter(field => field !== 'type').forEach(field => {
      expect(prompt).toContain(`"${field}":`);
    });
    expect(prompt).toMatch(/Trauma \(if any\): type \(childhood\/loss\/violence\/betrayal\/other\)/);
    // The free-text fields are not among them
    ['name', 'description', 'occupation', 'background', 'appearance', 'core_beliefs', 'values', 'symbols',
      'suppressedTraits', 'traits', 'hidden', 'fear', 'desire', 'style', 'examples', 'beginning', 'catalyst', 'end']
      .forEach(field => expect(fixed).not.toContain(field));
  });
});

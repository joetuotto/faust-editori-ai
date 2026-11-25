// The prompts of the consistency checker's character check and of the plot-thread detection.
//
// Final-pass review (T-096, menu spec D.7): both are old prompts whose free text reaches the author (the
// Projekti tab prints a character contradiction's message and suggestedFix as they are; a thread's name is
// its card title in Juonilangat and the entry name in Tarinakansio after migration). Like the old prompts
// of app.js, each ends with the project's answer language (oldPaths.answerLanguageRule), which app.js
// builds and hands over because both files are plain scripts. The thread detection reads the whole book:
// the author's [TODO: …] notes are not sent as text to read (report section 5, stripTodos).
const { answerLanguageRule } = require('../../src/services/ai/oldPaths');
const { stripTodos } = require('../../src/services/ai/contextBuilder');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  require('../../src/utils/annotationTypes.js');
  require('../../src/services/validation/ConsistencyChecker.js');
  require('../../src/services/story/PlotThreadTracker.js');
});

afterAll(() => {
  console.log.mockRestore();
});

const project = () => ({
  title: 'Talo mäellä',
  genre: 'literary',
  language: 'fi',
  ai: { provider: 'anthropic', models: {} },
  characters: [{ id: 'c1', name: 'Aino', description: 'Kääntäjä, 43.' }],
  structure: [
    { id: 'ch1', title: 'Saapuminen', content: 'Aino katsoi ikkunasta. [TODO: tarkista junan aikataulu] Aino nousi junasta.', annotations: [] },
    { id: 'ch2', title: 'Talo', content: 'Aino avasi oven. Aino sytytti valot.', annotations: [] }
  ]
});

describe('the consistency checker asks for the answer language (T-096)', () => {
  const RULE = answerLanguageRule('fi', ['type', 'severity']);

  test('the character check ends with the sentence it is given, after its format', async () => {
    const prompts = [];
    const call = jest.fn(async (prompt) => { prompts.push(prompt); return { success: true, data: '{"contradictions": []}' }; });
    const checker = new window.ConsistencyChecker(project(), {}, call);

    const result = await checker.runFullCheck({ languageRule: RULE });
    expect(result.success).toBe(true);
    expect(prompts).toHaveLength(1);
    expect(prompts[0].endsWith('If no contradictions found, return: {"contradictions": []}\n' + RULE)).toBe(true);
    expect(RULE).toBe('Write every free-text value in Finnish, names as they are. Keep the JSON keys and the values of "type" and "severity" exactly as given above, in English.');
  });

  test('without a sentence the prompt ends with its format, as before; a run forgets the last run\'s sentence', async () => {
    const prompts = [];
    const call = async (prompt) => { prompts.push(prompt); return { success: true, data: '{"contradictions": []}' }; };
    const checker = new window.ConsistencyChecker(project(), {}, call);
    await checker.runFullCheck({ languageRule: RULE });
    await checker.runFullCheck();
    expect(prompts[1].endsWith('If no contradictions found, return: {"contradictions": []}')).toBe(true);
  });

  test('app.js builds the sentence from the project language and hands it to the run', () => {
    const fs = require('fs');
    const path = require('path');
    const app = fs.readFileSync(path.join(__dirname, '..', '..', 'app.js'), 'utf8');
    expect(app).toContain("runFullCheck({\n        languageRule: answerLanguageRule(project.language, ['type', 'severity'])\n      })");
  });
});

describe('the thread detection asks for the answer language and reads the text without notes (T-096)', () => {
  const RULE = answerLanguageRule('fi', ['type', 'priority']);
  const api = (prompts) => ({
    claudeAPI: jest.fn(async ({ prompt }) => {
      prompts.push(prompt);
      return { success: true, data: '{"threads": [{"name": "Ainon paluu", "type": "main_plot", "introducedChapter": 1, "developments": [2], "isResolved": false, "openQuestions": ["Miksi Aino palasi?"], "priority": "high"}]}' };
    })
  });

  test('the prompt ends with the sentence after its format; the note is not in the text', async () => {
    const prompts = [];
    const tracker = new window.PlotThreadTracker(project());
    const result = await tracker.detectThreads(api(prompts), { languageRule: RULE, readText: stripTodos });

    expect(result.success).toBe(true);
    expect(result.threads[0]).toMatchObject({ name: 'Ainon paluu', type: 'main_plot', priority: 'high', openQuestions: ['Miksi Aino palasi?'] });
    expect(prompts).toHaveLength(1);
    expect(prompts[0].endsWith('      "priority": "high"\n    }\n  ]\n}\n' + RULE)).toBe(true);
    expect(prompts[0]).not.toContain('[TODO:');
    expect(prompts[0]).toContain('[Chapter 1: Saapuminen]\nAino katsoi ikkunasta. Aino nousi junasta.');
    expect(RULE).toBe('Write every free-text value in Finnish, names as they are. Keep the JSON keys and the values of "type" and "priority" exactly as given above, in English.');
  });

  test('without options the prompt is the old one: the format last, the text as it is', async () => {
    const prompts = [];
    await new window.PlotThreadTracker(project()).detectThreads(api(prompts));
    expect(prompts[0].endsWith('      "priority": "high"\n    }\n  ]\n}')).toBe(true);
    expect(prompts[0]).toContain('[TODO: tarkista junan aikataulu]');
  });

  test('app.js hands over the sentence and the context builder\'s stripTodos', () => {
    const fs = require('fs');
    const path = require('path');
    const app = fs.readFileSync(path.join(__dirname, '..', '..', 'app.js'), 'utf8');
    expect(app).toContain("detectThreads(window.electronAPI, {\n        languageRule: answerLanguageRule(project.language, ['type', 'priority']),\n        readText: stripTodos\n      })");
  });
});

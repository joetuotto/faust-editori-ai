/**
 * @jest-environment node
 */
const contextBuilder = require('../../src/services/ai/contextBuilder');
const { createContextSession, getContextSession } = require('../../src/services/ai/contextSession');

// Small fakes of the two things the session leans on (the real ones belong to the request layer)
function fakeClient(overrides = {}) {
  return {
    modelFor: jest.fn((role) => `malli-${role}`),
    budgetFor: jest.fn((model, answerTokens) => ({
      model,
      window: 32000,
      headroom: 2000,
      maxTokensSent: answerTokens + 2000,
      promptBudgetTokens: 1000,
      charsPerToken: 2.5,
      promptBudgetChars: 2500,
      calibrated: true
    })),
    ...overrides
  };
}

function fakeSettings(initial = {}) {
  const values = { ...initial };
  return {
    values,
    get: jest.fn((key, fallback) => (key in values ? values[key] : fallback)),
    set: jest.fn((key, value) => { values[key] = value; })
  };
}

const project = {
  language: 'fi',
  style: 'Lyhyet päälauseet.',
  brief: 'Romaani saaresta.',
  structure: [
    { id: 'c1', title: 'Saapuminen', content: 'x', synopsis: 'Sisarukset saapuvat saarelle.' },
    { id: 'c2', title: 'Myrsky', content: 'Ensimmäinen kappale.\nValittu kappale tässä.\nKolmas kappale.' }
  ]
};
const selection = { start: 21, end: 43 };
const call = (extra = {}) => ({ task: { id: 'edit', instruction: 'Tiivistä.' }, project, chapterId: 'c2', selection, role: 'edit', ...extra });
const partIds = (built) => built.parts.filter(part => part.state === 'sent').map(part => part.id);

afterEach(() => {
  jest.restoreAllMocks();
});

test('build asks the client for the model of the role and for that model\'s budget with the given answer size', () => {
  const aiClient = fakeClient();
  const session = createContextSession({ aiClient, settings: fakeSettings() });

  session.build(call({ role: 'edit', answerTokens: 700 }));
  expect(aiClient.modelFor).toHaveBeenCalledTimes(1);
  expect(aiClient.modelFor).toHaveBeenCalledWith('edit');
  expect(aiClient.budgetFor).toHaveBeenCalledTimes(1);
  expect(aiClient.budgetFor).toHaveBeenCalledWith('malli-edit', 700);

  session.build(call({ role: 'prose', answerTokens: 1300 }));
  expect(aiClient.modelFor).toHaveBeenLastCalledWith('prose');
  expect(aiClient.budgetFor).toHaveBeenLastCalledWith('malli-prose', 1300);

  // Without an answer size: the task's own, and 1024 tokens when it has none
  session.build(call({ task: { id: 'write', instruction: 'Jatka.', answerTokens: 500 }, role: 'prose' }));
  expect(aiClient.budgetFor).toHaveBeenLastCalledWith('malli-prose', 500);
  session.build(call({ role: 'analysis' }));
  expect(aiClient.budgetFor).toHaveBeenLastCalledWith('malli-analysis', 1024);
  session.build(call({ task: 'edit', role: 'edit', answerTokens: 0 }));
  expect(aiClient.budgetFor).toHaveBeenLastCalledWith('malli-edit', 1024);
});

test('an explicit model wins over the role\'s model and its budget is asked for', () => {
  const aiClient = fakeClient();
  const session = createContextSession({ aiClient, settings: fakeSettings() });

  const built = session.build(call({ role: 'edit', model: 'toinen-malli', answerTokens: 800 }));
  expect(aiClient.modelFor).not.toHaveBeenCalled();
  expect(aiClient.budgetFor).toHaveBeenCalledWith('toinen-malli', 800);
  expect(built.model).toBe('toinen-malli');
  expect(built.role).toBe('edit');
  expect(built.budget.model).toBe('toinen-malli');

  // An empty model is no model: the role decides
  const byRole = session.build(call({ role: 'edit', model: '' }));
  expect(aiClient.modelFor).toHaveBeenCalledWith('edit');
  expect(byRole.model).toBe('malli-edit');
});

test('build passes the budget object to buildContext unchanged and returns model, role and budget', () => {
  const budget = Object.freeze({ model: 'malli-edit', promptBudgetChars: 1800, charsPerToken: 3, calibrated: true });
  const aiClient = fakeClient({ budgetFor: jest.fn(() => budget) });
  const session = createContextSession({ aiClient, settings: fakeSettings() });
  const spy = jest.spyOn(contextBuilder, 'buildContext');

  const args = call({ text: 'Elävä teksti. Valittu kohta. Loppu.', cursor: 5, selection: { from: 14, to: 28 }, include: ['codex:d'], answerTokens: 600 });
  const built = session.build(args);

  expect(spy).toHaveBeenCalledTimes(1);
  const passed = spy.mock.calls[0][0];
  expect(passed.budget).toBe(budget);
  expect(passed).toEqual({
    task: args.task,
    project,
    chapterId: 'c2',
    text: 'Elävä teksti. Valittu kohta. Loppu.',
    cursor: 5,
    selection: { from: 14, to: 28 },
    budget,
    exclude: [],
    include: ['codex:d']
  });
  expect(passed.task).toBe(args.task);
  expect(passed.project).toBe(project);

  // The result is what buildContext returned, plus the three fields
  const plain = spy.mock.results[0].value;
  expect(built).toEqual({ ...plain, model: 'malli-edit', role: 'edit', budget });
  expect(built.budget).toBe(budget);
  expect(built.budgetTokens).toBe(600);
  expect(built.charsPerToken).toBe(3);
  expect(built.messages[0].content).toContain('<valinta>\nValittu kohta.\n</valinta>');
  expect(built.blocked).toBeNull();

  // A blocked chapter comes back blocked, still with the model it was built for
  const blockedProject = { ...project, structure: [{ ...project.structure[1], noAI: true }] };
  const blocked = session.build(call({ project: blockedProject }));
  expect(blocked).toMatchObject({ blocked: 'noAI', system: '', messages: [], model: 'malli-edit', role: 'edit' });
});

test('build uses the stored exclude list for the task when none is passed, and the given one when it is', () => {
  const settings = fakeSettings({ 'context.exclude': { edit: ['style', 'summaries'], write: ['brief'] } });
  const session = createContextSession({ aiClient: fakeClient(), settings });
  const spy = jest.spyOn(contextBuilder, 'buildContext');

  const stored = session.build(call());
  expect(spy.mock.calls[0][0].exclude).toEqual(['style', 'summaries']);
  expect(partIds(stored)).toEqual(['task', 'brief', 'before', 'payload', 'after', 'instruction']);
  expect(stored.parts.find(part => part.id === 'style').state).toBe('excluded');

  // Another kind of task has its own list; a task given as a bare id works too
  session.build(call({ task: 'write' }));
  expect(spy.mock.calls[1][0].exclude).toEqual(['brief']);
  session.build(call({ task: { id: 'review', payload: 'Teksti.' } }));
  expect(spy.mock.calls[2][0].exclude).toEqual([]);

  // A list from the caller replaces the stored one, item keys and all; an empty list means "nothing off"
  const given = session.build(call({ exclude: ['brief', 'summary:c1'] }));
  expect(spy.mock.calls[3][0].exclude).toEqual(['brief', 'summary:c1']);
  expect(partIds(given)).toEqual(['task', 'style', 'before', 'payload', 'after', 'instruction']);
  const none = session.build(call({ exclude: [] }));
  expect(spy.mock.calls[4][0].exclude).toEqual([]);
  expect(partIds(none)).toEqual(['task', 'style', 'brief', 'summaries', 'before', 'payload', 'after', 'instruction']);

  // Building never writes the settings
  expect(settings.set).not.toHaveBeenCalled();
});

test('setExclude stores part ids only and keeps other tasks\' lists', () => {
  const settings = fakeSettings({ 'context.exclude': { write: ['brief'], review: ['summaries'] } });
  const session = createContextSession({ aiClient: fakeClient(), settings });

  session.setExclude('edit', ['style', 'codex:a', 'summary:c1', 'before', 'style', 'task', 'payload', 'instruction', 'keksitty', 7, null]);
  expect(settings.set).toHaveBeenCalledTimes(1);
  expect(settings.set).toHaveBeenCalledWith('context.exclude', { write: ['brief'], review: ['summaries'], edit: ['style', 'before'] });
  expect(session.getExclude('edit')).toEqual(['style', 'before']);
  expect(session.getExclude('write')).toEqual(['brief']);

  // Every optional part can be stored, the chapter's own summary and the hand-added entries included
  const all = ['summaries', 'chapterSummary', 'after', 'codexMentioned', 'before', 'codexAlways', 'codexManual', 'names', 'avoid', 'brief', 'style'];
  session.setExclude('write', all);
  expect(session.getExclude('write')).toEqual(all);
  expect(session.getExclude('review')).toEqual(['summaries']);

  // Emptying one task's list leaves the others
  session.setExclude('edit', []);
  expect(settings.values['context.exclude']).toEqual({ write: all, review: ['summaries'], edit: [] });
  session.setExclude('edit', undefined);
  expect(session.getExclude('edit')).toEqual([]);
});

test('getExclude returns [] when nothing is stored', () => {
  const settings = fakeSettings();
  const session = createContextSession({ aiClient: fakeClient(), settings });
  expect(session.getExclude('edit')).toEqual([]);
  expect(settings.get).toHaveBeenCalledWith('context.exclude', {});
  expect(session.getExclude(undefined)).toEqual([]);

  // A stored value of the wrong shape is treated as nothing
  for (const broken of [null, 'style', ['style'], 5, { edit: 'style' }, { edit: null }]) {
    const other = createContextSession({ aiClient: fakeClient(), settings: fakeSettings({ 'context.exclude': broken }) });
    expect(other.getExclude('edit')).toEqual([]);
  }
  // Item keys that were stored by mistake are not handed out
  const mixed = createContextSession({ aiClient: fakeClient(), settings: fakeSettings({ 'context.exclude': { edit: ['codex:a', 'style', 3] } }) });
  expect(mixed.getExclude('edit')).toEqual(['style']);
  // The list handed out is a copy
  const store = fakeSettings({ 'context.exclude': { edit: ['style'] } });
  const copy = createContextSession({ aiClient: fakeClient(), settings: store });
  copy.getExclude('edit').push('brief');
  expect(store.values['context.exclude'].edit).toEqual(['style']);
});

test('getContextSession builds one session over the app\'s client and settings store, on first use', () => {
  const getAIClient = jest.fn(() => fakeClient());
  const getSettingsStore = jest.fn(() => fakeSettings({ 'context.exclude': { edit: ['brief'] } }));

  // The two modules belong to the request layer; here they are stand-ins at the same paths
  jest.doMock('../../src/services/ai/aiClient.js', () => ({ getAIClient }), { virtual: true });
  jest.doMock('../../src/services/settingsStore.js', () => ({ getSettingsStore }), { virtual: true });
  try {
    jest.isolateModules(() => {
      const isolated = require('../../src/services/ai/contextSession');
      // Nothing is asked for when the module loads
      expect(getAIClient).not.toHaveBeenCalled();
      expect(getSettingsStore).not.toHaveBeenCalled();

      const first = isolated.getContextSession();
      const second = isolated.getContextSession();
      expect(second).toBe(first);
      expect(getAIClient).toHaveBeenCalledTimes(1);
      expect(getSettingsStore).toHaveBeenCalledTimes(1);

      expect(Object.keys(first).sort()).toEqual(['build', 'getExclude', 'setExclude']);
      expect(first.getExclude('edit')).toEqual(['brief']);
      const built = first.build(call({ answerTokens: 300 }));
      expect(built).toMatchObject({ model: 'malli-edit', role: 'edit', blocked: null });
      expect(built.parts.find(part => part.id === 'brief').state).toBe('excluded');
    });
  } finally {
    jest.dontMock('../../src/services/ai/aiClient.js');
    jest.dontMock('../../src/services/settingsStore.js');
  }
});

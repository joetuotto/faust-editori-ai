/** @jest-environment node */
// The undo history and the steps of the suggestion layer (stage I-03, contracts.md 1.1).
// An accepted suggestion, or any other AI write, carries meta.noMerge: it is its own undo step,
// never joined to the typing before or after it, and its meta stays on the step for the
// suggestion controller (undo of an accept brings the suggestion back).

const { CommandManager, UpdateContentCommand } = require('../../src/utils/CommandManager');

// A project with one chapter, changed only through setProject(updater) as React would
function createProject(content) {
  let project = { structure: [{ id: 'chapter-1', content, wordCount: 0 }] };
  return {
    setProject: (update) => { project = typeof update === 'function' ? update(project) : update; },
    text: () => project.structure[0].content
  };
}

let clock = 0;
beforeEach(() => {
  clock = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// One step of the history: the text before and after, after `ms` milliseconds
function run(manager, doc, oldContent, newContent, { ms = 100, meta = null } = {}) {
  clock += ms;
  manager.execute(new UpdateContentCommand(doc.setProject, 'chapter-1', oldContent, newContent, meta));
}

test('two keystrokes within the pause merge into one step', () => {
  const manager = new CommandManager();
  const doc = createProject('Kissa');
  run(manager, doc, 'Kissa', 'Kissa ');
  run(manager, doc, 'Kissa ', 'Kissa i');
  expect(manager.undoStack).toHaveLength(1);
  expect(manager.undoStack[0].oldContent).toBe('Kissa');
  expect(manager.undoStack[0].newContent).toBe('Kissa i');
});

test('a command with meta.noMerge does not merge into the typing run before it', () => {
  const manager = new CommandManager();
  const doc = createProject('Hän sano');
  run(manager, doc, 'Hän sano', 'Hän sanoi');
  // A one-character accept 100 ms later, the size of a keystroke
  run(manager, doc, 'Hän sanoi', 'Hän sanoi,', { meta: { noMerge: true } });
  expect(manager.undoStack).toHaveLength(2);
  expect(manager.undoStack[0].newContent).toBe('Hän sanoi');
  expect(manager.undoStack[1].oldContent).toBe('Hän sanoi');
  expect(manager.undoStack[1].noMerge).toBe(true);
});

test('a keystroke after a noMerge command starts a new step', () => {
  const manager = new CommandManager();
  const doc = createProject('Hän sanoi');
  run(manager, doc, 'Hän sanoi', 'Hän sanoi,', { meta: { noMerge: true } });
  run(manager, doc, 'Hän sanoi,', 'Hän sanoi, ');
  run(manager, doc, 'Hän sanoi, ', 'Hän sanoi, e');
  expect(manager.undoStack).toHaveLength(2);
  expect(manager.undoStack[0].newContent).toBe('Hän sanoi,');
  // The two keystrokes after it are one run of their own
  expect(manager.undoStack[1].oldContent).toBe('Hän sanoi,');
  expect(manager.undoStack[1].newContent).toBe('Hän sanoi, e');
});

test('two one-character noMerge commands within 1200 ms stay two steps', () => {
  const manager = new CommandManager();
  const doc = createProject('a b c');
  run(manager, doc, 'a b c', 'a, b c', { ms: 50, meta: { noMerge: true } });
  run(manager, doc, 'a, b c', 'a, b, c', { ms: 50, meta: { noMerge: true } });
  expect(manager.undoStack).toHaveLength(2);
  expect(manager.undoStack.map(step => step.newContent)).toEqual(['a, b c', 'a, b, c']);
});

test('meta is kept on the command at the top of the undo stack', () => {
  const manager = new CommandManager();
  const doc = createProject('Hän sanoi.');
  const meta = {
    noMerge: true,
    suggestions: { ids: ['s1'], items: [{ id: 's1', groupId: 'g1', from: 4, to: 9, insert: 'kuiskasi', original: 'sanoi', meta: null }] }
  };
  run(manager, doc, 'Hän sanoi.', 'Hän kuiskasi.', { meta });
  const top = manager.undoStack[manager.undoStack.length - 1];
  expect(top.meta).toBe(meta);
  expect(top.meta.suggestions.items[0].from).toBe(4);
  // A typing step has no meta
  run(manager, doc, 'Hän kuiskasi.', 'Hän kuiskasi. ');
  expect(manager.undoStack[manager.undoStack.length - 1].meta).toBeNull();
  expect(manager.undoStack[manager.undoStack.length - 2].meta).toBe(meta);
});

test('undo of a noMerge step restores oldContent exactly; redo restores newContent', () => {
  const manager = new CommandManager();
  const before = 'Hän sanoi: ”Älä mene.” – Enkä mennyt.';
  const after = 'Hän kuiskasi: ”Älä mene.” – Enkä lähtenyt.';
  const doc = createProject(before);
  run(manager, doc, before, 'Hän sanoi: ”Älä mene.” – Enkä mennyt. ');
  run(manager, doc, 'Hän sanoi: ”Älä mene.” – Enkä mennyt. ', before, { ms: 3000 });
  run(manager, doc, before, after, { ms: 100, meta: { noMerge: true } });
  expect(doc.text()).toBe(after);

  expect(manager.undo()).toBe(true);
  expect(doc.text()).toBe(before);
  expect(manager.redo()).toBe(true);
  expect(doc.text()).toBe(after);
  // The redone step is the same step, with its meta
  expect(manager.undoStack[manager.undoStack.length - 1].noMerge).toBe(true);
});

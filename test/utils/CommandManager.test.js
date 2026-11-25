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

// ---------------------------------------------------------------------------
// Margin marks follow the steps of the history (F1). The app's project setter passes every update
// through followEdits (src/editor/annotationMapping.js); a step hands it what it knows as the
// setter's second argument: its change list, and on the way back the marks as they stood.
// ---------------------------------------------------------------------------

const { followEdits } = require('../../src/editor/annotationMapping');

const PROSE = 'Aino astui laiturille. Asemalla ei ollut ketään. Hän nosti laukkunsa ja lähti kävelemään.';
const noteOn = (text, words, id) => ({ id, type: 'user_note', position: text.indexOf(words), length: words.length, content: 'Huomautus', resolved: false });

// The project as app.js holds it: every update goes through followEdits
function createMarkedProject(content, annotations) {
  let project = { structure: [{ id: 'chapter-1', content, wordCount: 0, annotations }] };
  return {
    setProject: (update, edit) => { project = followEdits(project, typeof update === 'function' ? update(project) : update, edit); },
    change: (fn) => { project = fn(project); },
    text: () => project.structure[0].content,
    marks: () => project.structure[0].annotations,
    under: (id) => {
      const found = project.structure[0].annotations.find(item => item.id === id);
      return project.structure[0].content.slice(found.position, found.position + found.length);
    }
  };
}

function step(manager, doc, newContent, { ms = 100, meta = null, changes = null } = {}) {
  clock += ms;
  manager.execute(new UpdateContentCommand(doc.setProject, 'chapter-1', doc.text(), newContent, meta, changes));
}
const typeAt = (text, pos, chars) => text.slice(0, pos) + chars + text.slice(pos);

test('typing above a mark moves it with its text; undo returns it to where it was, redo moves it again', () => {
  const manager = new CommandManager();
  const doc = createMarkedProject(PROSE, [noteOn(PROSE, 'laukkunsa', 'm1')]);
  const start = doc.marks()[0].position;

  // A run of keystrokes at the start of the second sentence, each with the editor's change list
  const at = PROSE.indexOf('Asemalla');
  'Ilta. '.split('').forEach((char, i) => {
    step(manager, doc, typeAt(doc.text(), at + i, char), { changes: [{ from: at + i, to: at + i, insert: char }] });
  });
  expect(manager.undoStack).toHaveLength(1);                   // one typing run
  expect(doc.marks()[0].position).toBe(start + 6);
  expect(doc.under('m1')).toBe('laukkunsa');

  expect(manager.undo()).toBe(true);
  expect(doc.text()).toBe(PROSE);
  expect(doc.marks()[0]).toMatchObject({ position: start, length: 9 });

  expect(manager.redo()).toBe(true);
  expect(doc.marks()[0].position).toBe(start + 6);
  expect(doc.under('m1')).toBe('laukkunsa');
});

test('a mark whose text a step deleted is a point; undo gives it back its text and length', () => {
  const manager = new CommandManager();
  const doc = createMarkedProject(PROSE, [noteOn(PROSE, 'laukkunsa', 'm1'), noteOn(PROSE, 'Aino', 'm0')]);
  const from = PROSE.indexOf('Hän');
  const cut = PROSE.slice(0, from);
  step(manager, doc, cut, { meta: { noMerge: true }, changes: [{ from, to: PROSE.length, insert: '' }] });
  expect(doc.marks()).toHaveLength(2);                          // never dropped
  expect(doc.marks()[0]).toMatchObject({ id: 'm1', position: from, length: 0 });
  expect(doc.marks()[1]).toMatchObject({ id: 'm0', position: 0, length: 4 });

  manager.undo();
  expect(doc.under('m1')).toBe('laukkunsa');                    // mapping alone could not know the old length
  manager.redo();
  expect(doc.marks()[0]).toMatchObject({ id: 'm1', position: from, length: 0 });
  manager.undo();
  expect(doc.under('m1')).toBe('laukkunsa');
});

test('a step without a change list (a write from outside the editor) moves the marks by the two texts', () => {
  const manager = new CommandManager();
  const doc = createMarkedProject(PROSE, [noteOn(PROSE, 'ketään', 'm1'), noteOn(PROSE, 'laukkunsa', 'm2')]);
  // Lihavoi over the second sentence, then a rewrite of the first
  step(manager, doc, PROSE.replace('Asemalla ei ollut ketään.', '**Asemalla ei ollut ketään.**'), { meta: { noMerge: true } });
  step(manager, doc, doc.text().replace('Aino astui laiturille.', 'Aino Lehto astui junasta laiturille.'), { meta: { noMerge: true } });
  expect(doc.under('m1')).toBe('ketään');
  expect(doc.under('m2')).toBe('laukkunsa');
  manager.undo();
  manager.undo();
  expect(doc.text()).toBe(PROSE);
  expect(doc.under('m1')).toBe('ketään');
  expect(doc.under('m2')).toBe('laukkunsa');
});

test('on undo a mark made after the step follows the text, and a mark removed since stays removed', () => {
  const manager = new CommandManager();
  const doc = createMarkedProject(PROSE, [noteOn(PROSE, 'laukkunsa', 'm1')]);
  const longer = 'Oli jo ilta. ' + PROSE;
  step(manager, doc, longer, { meta: { noMerge: true }, changes: [{ from: 0, to: 0, insert: 'Oli jo ilta. ' }] });

  // The author removes the old note and the checker adds a mark, both outside the history
  doc.change(project => ({ ...project, structure: [{ ...project.structure[0], annotations: [noteOn(longer, 'ketään', 'm2')] }] }));
  manager.undo();
  expect(doc.text()).toBe(PROSE);
  expect(doc.marks().map(item => item.id)).toEqual(['m2']);
  expect(doc.under('m2')).toBe('ketään');
});

test('a typing run keeps no single keystroke\'s change list: its redo goes by the marks noted at the undo', () => {
  const manager = new CommandManager();
  const doc = createMarkedProject(PROSE, [noteOn(PROSE, 'laukkunsa', 'm1')]);
  step(manager, doc, typeAt(PROSE, 0, 'J'), { changes: [{ from: 0, to: 0, insert: 'J' }] });
  expect(manager.undoStack[0].changes).toEqual([{ from: 0, to: 0, insert: 'J' }]);
  step(manager, doc, typeAt(doc.text(), 1, 'a'), { changes: [{ from: 1, to: 1, insert: 'a' }] });
  expect(manager.undoStack).toHaveLength(1);
  expect(manager.undoStack[0].changes).toBeNull();
  manager.undo();
  manager.redo();
  expect(doc.text()).toBe('Ja' + PROSE);
  expect(doc.under('m1')).toBe('laukkunsa');
});

test('the marks of the state are never changed in place by a step', () => {
  const manager = new CommandManager();
  const marks = [noteOn(PROSE, 'laukkunsa', 'm1')];
  const frozen = JSON.stringify(marks);
  const doc = createMarkedProject(PROSE, marks);
  step(manager, doc, 'Yö. ' + PROSE, { meta: { noMerge: true } });
  manager.undo();
  manager.redo();
  expect(JSON.stringify(marks)).toBe(frozen);
  expect(doc.marks()).not.toBe(marks);
});

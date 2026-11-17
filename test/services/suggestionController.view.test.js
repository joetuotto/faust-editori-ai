// The controller bound to a real editor (jsdom): the flows that cross the
// controller, the facade and the model. CodeMirror comes from its CommonJS
// build here, in the test only.
const state = require('@codemirror/state');
const view = require('@codemirror/view');
const { createSuggestionKit } = require('../../src/editor/suggestionsCore');
const { createSuggestionController } = require('../../src/services/suggestions/suggestionController');
const M = require('../../src/editor/suggestionModel');

const kit = createSuggestionKit({ ...state, ...view });
const External = state.Annotation.define();

if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => [];
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
}

const SAMPLE = 'Hän sanoi: ”Älä mene.” – Enkä mennyt, vaikka åkerö [TODO: tarkista] oli <u>kypsä</u>.';
const REVISED = 'Hän taas kuiskasi: ”Älä mene.” – Enkä lähtenyt, vaikka Åkerö [TODO: tarkista] oli <u>kypsä</u>.';
const META = { source: 'faust', action: 'proofread', actionLabel: 'Kielenhuolto', instruction: '', provider: 'cherry', model: 'c91f:kimi-k2', requestLogId: 'req-1' };

const at = (text, word, insert, extra = {}) => {
  const from = text.indexOf(word);
  return { from, to: from + word.length, insert, original: word, ...extra };
};
const FOUR = [at(SAMPLE, 'mennyt', 'lähtenyt'), at(SAMPLE, 'sanoi', 'kuiskasi'), at(SAMPLE, 'åkerö', 'Åkerö'), { from: 3, to: 3, insert: ' taas' }];

// Finest word diff: words and the gaps between them, longest common subsequence
function diff(a, b) {
  const ta = a.match(/\s+|\S+/g) || [];
  const tb = b.match(/\s+|\S+/g) || [];
  const lcs = Array.from({ length: ta.length + 1 }, () => new Array(tb.length + 1).fill(0));
  for (let i = ta.length - 1; i >= 0; i--) {
    for (let j = tb.length - 1; j >= 0; j--) {
      lcs[i][j] = ta[i] === tb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const changes = [];
  let i = 0, j = 0, pos = 0, open = null;
  const edit = () => (open || (open = { from: pos, to: pos, insert: '' }));
  const close = () => { if (open) { changes.push({ ...open, original: a.slice(open.from, open.to) }); open = null; } };
  while (i < ta.length || j < tb.length) {
    if (i < ta.length && j < tb.length && ta[i] === tb[j]) {
      close();
      pos += ta[i].length; i++; j++;
    } else if (j < tb.length && (i === ta.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      edit().insert += tb[j]; j++;
    } else {
      edit().to += ta[i].length; pos += ta[i].length; i++;
    }
  }
  close();
  return changes;
}

/**
 * A small stand-in for the app around the controller: chapters, an undo
 * stack, and one editor at a time that is wired the way FaustEditor wires it.
 */
function createApp(chapters) {
  M.resetIds();
  const controller = createSuggestionController({ wordDiff: diff, rawDiff: diff, changeRatio: () => 0.1 });
  const app = {
    controller,
    chapters,
    activeChapterId: null,
    editor: null,
    undoStack: [],
    redoStack: [],
    changes: 0,
    setInfo: jest.fn(),
    reportPending: jest.fn(),
    logDecision: jest.fn(),
    takeSnapshot: jest.fn(() => 'snapshot-1'),
    info: () => app.setInfo.mock.calls[app.setInfo.mock.calls.length - 1][0],
    logged: () => app.logDecision.mock.calls.map(call => call[0])
  };
  const chapter = (id) => app.chapters.find(entry => entry.id === id);

  // What FAUSTApp does on every render
  app.render = () => controller.bind({
    getEditor: () => (app.editor ? app.editor.el : null),
    activeChapterId: app.activeChapterId,
    chapters: app.chapters,
    setInfo: app.setInfo,
    reportPending: app.reportPending,
    logDecision: app.logDecision,
    askConfirm: () => Promise.resolve(true),
    openPasteDialog: () => {},
    takeSnapshot: app.takeSnapshot
  });

  // The stand-in for FaustEditor: seed, extension, update listener, mount and cleanup events
  app.mount = (chapterId) => {
    const props = controller.editorProps(chapterId);
    const doc = chapter(chapterId).content;
    const seed = props.suggestionSeed(doc);
    const v = new view.EditorView({
      parent: document.body,
      state: state.EditorState.create({
        doc,
        extensions: [
          kit.suggestionExtension({ external: External, diff, seed: seed.state }),
          view.EditorView.updateListener.of((update) => {
            const external = update.transactions.some(tr => tr.annotation(External));
            if (update.docChanged && !external) {
              // onChange(text, meta): the app writes the chapter and keeps an undo step
              const text = update.state.doc.toString();
              app.undoStack.push({ chapterId, oldContent: chapter(chapterId).content, newContent: text, meta: kit.readSuggestionMeta(update) || null });
              app.redoStack.length = 0;
              chapter(chapterId).content = text;
              app.changes++;
            }
            for (const event of kit.suggestionEvents(update)) props.onSuggestionsChange(kit.suggestionSnapshot(update.view.state), event);
            if (update.docChanged) update.view.scrollDOM.flushQueuedSuggestions(external);
          })
        ]
      })
    });
    kit.installSuggestionFacade(v, v.scrollDOM);
    props.onSuggestionsChange(kit.suggestionSnapshot(v.state), { type: 'seeded' });
    return {
      v,
      el: v.scrollDOM,
      seed,
      unmount() {
        props.onSuggestionsChange(kit.suggestionSnapshot(v.state), { type: 'unmount', docText: v.state.doc.toString(), state: kit.suggestionState(v.state) });
        v.destroy();
      }
    };
  };

  app.open = (chapterId) => {
    app.activeChapterId = chapterId;
    app.render();
    if (app.editor) app.editor.unmount();
    app.editor = app.mount(chapterId);
    return app.editor;
  };

  // React mirrors the chapter text into the editor: one range, marked External
  app.sync = () => {
    const v = app.editor.v;
    const change = M.singleChange(v.state.doc.toString(), chapter(app.activeChapterId).content);
    if (change) v.dispatch({ changes: change, annotations: External.of(true) });
    else app.editor.el.flushQueuedSuggestions(true);
  };

  // runHistory of the app: switch to the step's chapter, the hooks around the undo, then the render
  app.history = (direction) => {
    const from = direction === 'undo' ? app.undoStack : app.redoStack;
    const step = from.pop();
    if (!step) return null;
    controller.beforeHistory(direction, step);
    chapter(step.chapterId).content = direction === 'undo' ? step.oldContent : step.newContent;
    (direction === 'undo' ? app.redoStack : app.undoStack).push(step);
    controller.afterHistory(direction, step);
    if (app.activeChapterId !== step.chapterId) app.open(step.chapterId);
    else { app.render(); app.sync(); }
    return step;
  };

  app.text = () => app.editor.v.state.doc.toString();
  app.close = () => { if (app.editor) app.editor.v.destroy(); };
  return app;
}

const apps = [];
const start = (chapters) => {
  const app = createApp(chapters || [
    { id: 'chapter-1', title: 'Luku 1', content: SAMPLE },
    { id: 'chapter-2', title: 'Luku 2', content: 'Toinen luku alkaa tästä.' }
  ]);
  apps.push(app);
  return app;
};

afterEach(() => {
  while (apps.length) apps.pop().close();
  document.body.innerHTML = '';
});

test('acceptAll takes one snapshot, accepts in one transaction and logs one group row', () => {
  const app = start();
  const { el } = app.open('chapter-1');
  expect(el.proposeChanges(FOUR, { meta: META }).ok).toBe(true);
  expect(app.info()).toMatchObject({ chapterId: 'chapter-1', pending: 4, currentIndex: 0 });
  expect(app.reportPending).toHaveBeenLastCalledWith(4);

  expect(app.controller.acceptAll()).toBe(4);
  expect(app.text()).toBe(REVISED);
  expect(app.chapters[0].content).toBe(REVISED);

  expect(app.takeSnapshot).toHaveBeenCalledTimes(1);
  expect(app.takeSnapshot).toHaveBeenCalledWith('chapter-1', 'Ennen Hyväksy kaikki -toimintoa');
  // One document change, one onChange, one undo step that knows what it accepted
  expect(app.changes).toBe(1);
  expect(app.undoStack).toHaveLength(1);
  expect(app.undoStack[0]).toMatchObject({ oldContent: SAMPLE, newContent: REVISED, meta: { noMerge: true } });
  expect(app.undoStack[0].meta.suggestions.ids).toHaveLength(4);

  expect(app.logged()).toEqual([{
    decision: 'accepted', redo: false, scope: 'group',
    source: 'faust', action: 'proofread', actionLabel: 'Kielenhuolto', instruction: '',
    provider: 'cherry', model: 'c91f:kimi-k2', requestLogId: 'req-1',
    chapterId: 'chapter-1', chapterTitle: 'Luku 1',
    count: 4, charsAdded: 26, charsRemoved: 16, before: null, after: null, snapshotId: 'snapshot-1'
  }]);
  expect(app.info()).toMatchObject({ pending: 0, rejected: 0, current: null });
  expect(app.reportPending).toHaveBeenLastCalledWith(0);

  // One Cmd+Z takes all four back out and brings all four suggestions back
  app.history('undo');
  expect(app.text()).toBe(SAMPLE);
  expect(el.getSuggestions().pending).toHaveLength(4);
  expect(app.reportPending).toHaveBeenLastCalledWith(4);
});

test('acceptAll leaves suggestions with meta.dialogue pending and the bar info counts them', () => {
  const app = start();
  const { el } = app.open('chapter-1');
  el.proposeChanges([
    at(SAMPLE, 'sanoi', 'kuiskasi'),
    at(SAMPLE, 'Älä', 'Et', { meta: { ...META, dialogue: true } }),
    at(SAMPLE, 'mene', 'tule', { meta: { ...META, dialogue: true } }),
    at(SAMPLE, 'mennyt', 'lähtenyt')
  ], { groupId: 'ajo', meta: META });
  expect(app.info()).toMatchObject({ pending: 4, dialoguePending: 2 });

  // The bar's button, the menu item and a feature's own button all end up here
  expect(app.controller.acceptAll()).toBe(2);
  expect(app.text()).toBe(SAMPLE.replace('sanoi', 'kuiskasi').replace('mennyt', 'lähtenyt'));
  expect(app.info()).toMatchObject({ pending: 2, dialoguePending: 2 });
  expect(app.info().current).toMatchObject({ original: 'Älä', insert: 'Et', meta: { dialogue: true } });
  expect(app.logged()).toEqual([expect.objectContaining({ scope: 'group', count: 2, snapshotId: 'snapshot-1' })]);

  expect(app.controller.menuCommand('accept-all')).toBe(0);
  expect(app.controller.acceptAll({ groupId: 'ajo', reason: 'Ennen pikamuokkausta: Tiivistä' })).toBe(0);
  expect(app.takeSnapshot).toHaveBeenCalledTimes(1);
  expect(app.text()).toContain('”Älä mene.”');

  // One at a time they are accepted, each as its own step and its own log row
  expect(app.controller.acceptCurrent()).toBe(true);
  expect(app.controller.acceptCurrent()).toBe(true);
  expect(app.text()).toContain('”Et tule.”');
  expect(app.undoStack).toHaveLength(3);
  expect(app.logged().slice(1).map(row => [row.scope, row.before, row.after, row.snapshotId])).toEqual([
    ['single', 'Älä', 'Et', null],
    ['single', 'mene', 'tule', null]
  ]);
  expect(app.info()).toMatchObject({ pending: 0, dialoguePending: 0 });

  // Rejecting in bulk takes dialogue suggestions like any other
  el.proposeChanges([at(app.text(), 'Enkä', 'Enpä', { meta: { ...META, dialogue: true } }), at(app.text(), 'vaikka', 'kun')], { meta: META });
  expect(app.controller.rejectAll()).toBe(2);
  expect(app.info()).toMatchObject({ pending: 0, rejected: 2, dialoguePending: 0 });
});

test('a batch proposed after an earlier accept lands on the same words', () => {
  // A run computes every offset on the text it started from and says so with each batch
  const T0 = 'Hän sanoi että käy ulos koska sataa. Sitten hän otti sateen varjon mukaan.';
  const app = start([{ id: 'chapter-1', title: 'Luku 1', content: T0 }, { id: 'chapter-2', title: 'Luku 2', content: 'Toinen.' }]);
  const { el } = app.open('chapter-1');
  const comma1 = { from: T0.indexOf(' että'), to: T0.indexOf(' että'), insert: ',' };
  const comma2 = { from: T0.indexOf(' koska'), to: T0.indexOf(' koska'), insert: ',' };
  const compound = at(T0, 'sateen varjon', 'sateenvarjon');

  const first = app.controller.propose('chapter-1', [comma1], { baseText: T0, groupId: 'ajo', meta: META });
  expect(first).toMatchObject({ ok: true, groupId: 'ajo', skipped: [] });
  // The author accepts the first comma while the second batch is still on its way
  expect(app.controller.acceptCurrent()).toBe(true);
  const T1 = app.text();
  expect(T1).toBe('Hän sanoi, että käy ulos koska sataa. Sitten hän otti sateen varjon mukaan.');

  const second = app.controller.propose('chapter-1', [comma2, compound], { baseText: T0, groupId: 'ajo', meta: META });
  expect(second).toMatchObject({ ok: true, groupId: 'ajo', skipped: [] });
  expect(second.ids).toHaveLength(2);
  const [comma, word] = el.getSuggestions().pending;
  expect(T1.slice(comma.from - 4, comma.from + 6)).toBe('ulos koska');
  expect(comma).toMatchObject({ from: comma.to, insert: ',', groupId: 'ajo' });
  expect(T1.slice(word.from, word.to)).toBe('sateen varjon');

  expect(app.controller.acceptAll({ groupId: 'ajo' })).toBe(2);
  expect(app.text()).toBe('Hän sanoi, että käy ulos, koska sataa. Sitten hän otti sateenvarjon mukaan.');

  // The same run while the author is in another chapter: the batch waits in the store
  app.open('chapter-2');
  const T2 = app.chapters[0].content;
  const late = app.controller.propose('chapter-1', [at(T0, 'Sitten', 'Silloin'), compound], { baseText: T0, groupId: 'ajo', meta: META });
  expect(late).toMatchObject({ ok: true, skipped: [{ index: 1, reason: 'target-changed' }] });
  expect(app.info().elsewhere).toEqual([{ chapterId: 'chapter-1', title: 'Luku 1', count: 1 }]);
  const back = app.open('chapter-1');
  const [waiting] = back.el.getSuggestions().pending;
  expect(T2.slice(waiting.from, waiting.to)).toBe('Sitten');
  expect(back.v.contentDOM.querySelector('.cm-faust-sugg-del').textContent).toBe('Sitten');
});

test('undo of an accept brings the suggestion back through afterHistory', () => {
  const app = start();
  const { v, el } = app.open('chapter-1');
  el.proposeChanges(FOUR, { meta: META });
  const sanoi = el.getSuggestions().pending.find(item => item.original === 'sanoi');
  expect(el.acceptSuggestion(sanoi.id)).toBe(true);
  const accepted = app.text();
  expect(accepted).toBe(SAMPLE.replace('sanoi', 'kuiskasi'));
  expect(el.getSuggestions().pending).toHaveLength(3);

  // Cmd+Z
  const step = app.history('undo');
  expect(step.meta.suggestions.ids).toEqual([sanoi.id]);
  expect(app.text()).toBe(SAMPLE);
  const back = el.getSuggestions();
  expect(back.pending.map(item => item.original)).toEqual(['', 'sanoi', 'mennyt', 'åkerö']);
  expect(back.pending[1]).toMatchObject({ id: sanoi.id, from: 4, to: 9, insert: 'kuiskasi', meta: META });
  expect(back.currentId).toBe(sanoi.id);
  // The view went to the place of the change, and nothing was asked of a model
  expect(v.state.selection.main.head).toBe(4);
  expect(app.info()).toMatchObject({ pending: 4, currentIndex: 1 });
  expect(app.logged().map(row => [row.decision, row.redo, row.count, row.before, row.after])).toEqual([
    ['accepted', false, 1, 'sanoi', 'kuiskasi'],
    ['accept_undone', false, 1, 'sanoi', 'kuiskasi']
  ]);
  expect(app.changes).toBe(1);      // the mirrored undo is not an edit of the author

  // Shift+Cmd+Z: the text is applied again and the suggestion is gone, not rejected
  app.history('redo');
  expect(app.text()).toBe(accepted);
  expect(el.getSuggestions().pending.map(item => item.original)).toEqual(['', 'mennyt', 'åkerö']);
  expect(el.getSuggestions().rejected).toEqual([]);
  expect(app.logged()[2]).toMatchObject({ decision: 'accepted', redo: true, count: 1 });
  el.getSuggestions().pending.forEach(item => expect(accepted.slice(item.from, item.to)).toBe(item.original));

  // Undo once more, from another chapter: the app switches back and the seed carries the suggestion
  app.open('chapter-2');
  expect(app.reportPending).toHaveBeenLastCalledWith(3);
  app.history('undo');
  expect(app.activeChapterId).toBe('chapter-1');
  expect(app.text()).toBe(SAMPLE);
  const again = app.editor.el.getSuggestions();
  expect(again.pending.map(item => item.id)).toContain(sanoi.id);
  expect(again.pending).toHaveLength(4);
  expect(app.editor.seed.revealPos).toBe(4);
  expect(app.reportPending).toHaveBeenLastCalledWith(4);
});

test('several accepts undone and redone in turn keep every suggestion on its words', () => {
  const app = start();
  const { el } = app.open('chapter-1');
  el.proposeChanges(FOUR, { meta: META });
  const original = el.getSuggestions().pending.map(item => [item.id, item.from, item.to, item.insert]);
  const matches = () => el.getSuggestions().pending.forEach(item => expect(app.text().slice(item.from, item.to)).toBe(item.original));

  // Three accepts, each its own undo step, each moving what is behind it
  app.controller.acceptCurrent();
  app.controller.acceptCurrent();
  app.controller.acceptCurrent();
  expect(app.undoStack).toHaveLength(3);
  expect(el.getSuggestions().pending.map(item => item.original)).toEqual(['åkerö']);
  matches();

  app.history('undo');
  expect(el.getSuggestions().pending.map(item => item.original)).toEqual(['mennyt', 'åkerö']);
  matches();
  app.history('undo');
  app.history('undo');
  expect(app.text()).toBe(SAMPLE);
  expect(el.getSuggestions().pending.map(item => [item.id, item.from, item.to, item.insert])).toEqual(original);

  // Redo two of them, undo one again
  app.history('redo');
  app.history('redo');
  expect(app.text()).toBe('Hän taas kuiskasi: ”Älä mene.” – Enkä mennyt, vaikka åkerö [TODO: tarkista] oli <u>kypsä</u>.');
  expect(el.getSuggestions().pending.map(item => item.original)).toEqual(['mennyt', 'åkerö']);
  expect(el.getSuggestions().rejected).toEqual([]);
  matches();
  app.history('undo');
  expect(el.getSuggestions().pending.map(item => item.original)).toEqual(['sanoi', 'mennyt', 'åkerö']);
  matches();

  // Accepting the rest gives the fully revised text, whatever the order was
  expect(app.controller.acceptAll()).toBe(3);
  expect(app.text()).toBe(REVISED);
  expect(app.logged().map(row => row.decision + (row.redo ? '+redo' : ''))).toEqual([
    'accepted', 'accepted', 'accepted',
    'accept_undone', 'accept_undone', 'accept_undone',
    'accepted+redo', 'accepted+redo',
    'accept_undone',
    'accepted'
  ]);
});

test('typing into a suggestion and undoing the typing keeps the count right', () => {
  const app = start();
  const { v, el } = app.open('chapter-1');
  el.proposeChanges(FOUR, { meta: META });
  v.dispatch({ changes: { from: 32, insert: 'X' }, selection: { anchor: 33 }, userEvent: 'input.type' });
  expect(app.info()).toMatchObject({ pending: 3, rejected: 1, notice: { kind: 'dropped-edit', count: 1 } });
  expect(app.reportPending).toHaveBeenLastCalledWith(3);
  // Dropped by the author's own edit: not a decision, nothing in the log
  expect(app.logged()).toEqual([]);

  app.history('undo');
  expect(app.text()).toBe(SAMPLE);
  expect(app.info()).toMatchObject({ pending: 4, rejected: 0 });
  expect(app.reportPending).toHaveBeenLastCalledWith(4);
});

test('after reset the editor of the next project starts empty although its chapter id is the same', async () => {
  const app = start();
  const old = app.open('chapter-1');
  old.el.proposeChanges(FOUR, { meta: META });
  old.el.rejectSuggestion();
  const block = old.el.startInsertBlock({ pos: 22, meta: META });
  old.el.appendInsertBlock(block.blockId, 'Sumu nousi.');
  old.el.finishInsertBlock(block.blockId, { status: 'done' });
  old.el.captureRange(11, 22, { highlight: true });
  expect(app.controller.pendingTotal()).toBe(4);     // three suggestions and the finished block

  // Tiedosto → Avaa: another project whose first chapter is also "chapter-1", with words in common
  app.controller.reset();
  expect(app.reportPending).toHaveBeenLastCalledWith(0);
  expect(app.setInfo).toHaveBeenLastCalledWith(null);
  app.chapters = [{ id: 'chapter-1', title: 'Alku', content: 'Hän sanoi jotain aivan muuta, vaikka åkerö oli mennyt.' }];
  app.activeChapterId = 'chapter-1';
  app.render();

  // The old editor unmounts one commit after the reset; its last event must not store anything
  app.reportPending.mockClear();
  old.unmount();
  expect(app.controller.pendingTotal()).toBe(0);
  expect(app.reportPending).not.toHaveBeenCalled();

  app.editor = app.mount('chapter-1');
  const fresh = app.editor.el;
  expect(app.editor.seed).toEqual({ state: null, revealPos: null });
  expect(fresh.getSuggestions()).toMatchObject({ pending: [], rejected: [], block: null, currentId: null });
  expect(fresh.restoreRejected()).toEqual({ restored: 0, failed: 0 });
  expect(app.editor.v.contentDOM.querySelector('.cm-faust-sugg-del, .cm-faust-block, .cm-faust-target')).toBeNull();
  expect(app.controller.pendingTotal()).toBe(0);
  expect(app.controller.pendingByChapter()).toEqual([]);
  expect(app.info()).toMatchObject({ chapterId: 'chapter-1', pending: 0, rejected: 0, blockStatus: null, elsewhere: [] });
  // Leaving this project asks nothing: nothing is pending
  await expect(app.controller.confirmDiscard()).resolves.toBe(true);

  // The new project works as usual
  expect(fresh.proposeChanges([{ from: 4, to: 9, insert: 'kuiskasi', original: 'sanoi' }], { meta: META }).ok).toBe(true);
  expect(app.reportPending).toHaveBeenLastCalledWith(1);
});

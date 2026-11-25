/**
 * @jest-environment node
 */
const { createSuggestionController } = require('../../src/services/suggestions/suggestionController');
const M = require('../../src/editor/suggestionModel');

const SAMPLE = 'Hän sanoi: ”Älä mene.” – Enkä mennyt, vaikka åkerö [TODO: tarkista] oli <u>kypsä</u>.';
const OTHER = 'Toinen luku alkaa tästä. Sade jatkui koko yön.';

const META = { source: 'faust', action: 'proofread', actionLabel: 'Kielenhuolto', instruction: 'korjaa pilkut', provider: 'cherry', model: 'c91f:kimi-k2', requestLogId: 'req-1' };
const LOCAL = { source: 'local', action: 'typography', actionLabel: 'Tarkista typografia', instruction: '', provider: null, model: null, requestLogId: null };

const at = (text, word, insert, extra = {}) => {
  const from = text.indexOf(word);
  return { from, to: from + word.length, insert, original: word, ...extra };
};
const FOUR = [at(SAMPLE, 'mennyt', 'lähtenyt'), at(SAMPLE, 'sanoi', 'kuiskasi'), at(SAMPLE, 'åkerö', 'Åkerö'), { from: 3, to: 3, insert: ' taas' }];

function applyChanges(text, changes) {
  let out = '';
  let pos = 0;
  for (const change of changes) {
    out += text.slice(pos, change.from) + change.insert;
    pos = change.to;
  }
  return out + text.slice(pos);
}

// Stand-ins for the text modules of another task
function wordDiff(a, b) {
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
 * A fake editor facade with the member names of the real one. It keeps a
 * model state and reports its events like the editor does, so the controller
 * sees real snapshots and events without CodeMirror.
 */
function fakeEditor(text, getProps) {
  let doc = text;
  let state = M.createState();
  let rangeCount = 0;
  const ranges = new Map();
  let selection = null;

  const emit = (event) => getProps().onSuggestionsChange(M.snapshot(state), event);
  const run = (action) => {
    const next = M.reduce(state, action);
    if (next === state) return null;
    state = next;
    if (next.event) emit(next.event);
    return next.event;
  };
  const accept = (ids) => {
    const changes = M.acceptChanges(state, ids);
    if (!changes.length) return 0;
    const mapper = M.makeMapper(changes);
    doc = applyChanges(doc, changes);
    return run({ type: 'accepted', ids, mapPos: mapper.mapPos, touchesRange: mapper.touchesRange }).ids.length;
  };
  const result = (event) => (event && event.ids.length
    ? { ok: true, groupId: event.groupId, ids: event.ids, skipped: event.skipped }
    : { ok: false, groupId: null, ids: [], skipped: event ? event.skipped : [], error: 'no-changes' });

  const editor = {
    // The facade's existing member: the document text now
    get value() { return doc; },
    text: () => doc,
    state: () => state,
    select: (from, to) => { selection = { from, to }; },
    mount() {
      const seed = getProps().suggestionSeed(doc);
      if (seed.state) state = seed.state;
      emit({ type: 'seeded' });
      return seed;
    },
    unmount() { emit({ type: 'unmount', docText: doc, state }); },
    emit,
    // A model action in the editor, as the facade's block members dispatch them (startInsertBlock …)
    reduce: (action) => run(action),
    // The text changed outside the editor (an undo mirrored by React)
    setText(next) {
      const previous = doc;
      doc = next;
      run({ type: 'rebase', oldText: previous, newText: next, diff: wordDiff });
    },

    getSuggestions: jest.fn(() => M.snapshot(state)),
    proposeChanges: jest.fn((changes, options = {}) => {
      let list = changes;
      if (options.rangeId != null) {
        const range = ranges.get(options.rangeId);
        if (!range || doc.slice(range.from, range.to) !== range.text) return { ok: false, groupId: null, ids: [], skipped: [], error: 'target-changed' };
        list = changes.map(change => ({ ...change, from: change.from + range.from, to: change.to + range.from }));
        if (!options.keepRange) ranges.delete(options.rangeId);
      }
      return result(run({ type: 'propose', docText: doc, changes: list, groupId: options.groupId, meta: options.meta, restore: options.restore, baseText: options.baseText, diff: wordDiff }));
    }),
    removeSuggestions: jest.fn((ids) => { const event = run({ type: 'remove', ids }); return event ? event.ids.length : 0; }),
    acceptSuggestion: jest.fn((id) => accept([id == null ? state.currentId : id]) > 0),
    rejectSuggestion: jest.fn((id) => !!run({ type: 'reject', ids: [id == null ? state.currentId : id] })),
    acceptGroup: jest.fn((groupId) => accept(M.bulkAcceptIds(state, groupId == null ? null : groupId))),
    rejectGroup: jest.fn((groupId) => {
      const ids = M.pendingItems(state).filter(item => groupId == null || item.groupId === groupId).map(item => item.id);
      const event = run({ type: 'reject', ids });
      return event ? event.ids.length : 0;
    }),
    restoreRejected: jest.fn(() => {
      const event = run({ type: 'restore', docText: doc });
      return event ? { restored: event.ids.length, failed: event.failed } : { restored: 0, failed: 0 };
    }),
    stepSuggestion: jest.fn((direction) => { run({ type: 'step', direction, head: 0 }); return state.currentId; }),
    setSuggestionView: jest.fn((mode) => { run({ type: 'setView', viewMode: mode }); }),
    clearSuggestionNotice: jest.fn(() => { run({ type: 'clearNotice' }); }),
    revealPos: jest.fn(),
    flushQueuedSuggestions: jest.fn(),
    captureSelection: jest.fn((options = {}) => {
      const used = !selection;
      if (used && options.fallback !== 'document') return null;
      const from = used ? 0 : selection.from;
      const to = used ? doc.length : selection.to;
      const rangeId = 'r' + (++rangeCount);
      ranges.set(rangeId, { from, to, text: doc.slice(from, to), highlight: !!options.highlight });
      return { rangeId, from, to, text: doc.slice(from, to), fallbackUsed: used };
    }),
    getRange: jest.fn((rangeId) => ranges.get(rangeId) || null),
    releaseRange: jest.fn((rangeId) => { ranges.delete(rangeId); }),
    ranges
  };
  return editor;
}

function setup(options = {}) {
  M.resetIds();
  const controller = createSuggestionController({ wordDiff: jest.fn(wordDiff), rawDiff: wordDiff, changeRatio: jest.fn(() => 0.2), ...options.deps });
  const chapters = [
    { id: 'luku-1', title: 'Ensimmäinen luku', content: SAMPLE },
    { id: 'luku-2', title: 'Toinen luku', content: OTHER },
    { id: 'luku-3', title: 'Kolmas luku', content: 'Kolmas luku on lyhyt.' }
  ];
  const settings = new Map();
  const env = {
    getEditor: () => env.editor,
    editor: null,
    activeChapterId: 'luku-1',
    chapters,
    setInfo: jest.fn(),
    reportPending: jest.fn(),
    logDecision: jest.fn(),
    askConfirm: jest.fn(() => Promise.resolve(true)),
    openPasteDialog: jest.fn(),
    getSetting: jest.fn((key, fallback) => (settings.has(key) ? settings.get(key) : fallback)),
    setSetting: jest.fn((key, value) => { settings.set(key, value); }),
    ...options.env
  };
  controller.bind(env);

  // Open a chapter the way the app does: bind with the new id, mount its editor
  const open = (chapterId, text) => {
    if (env.editor) env.editor.unmount();
    env.activeChapterId = chapterId;
    controller.bind(env);
    const chapter = chapters.find(entry => entry.id === chapterId);
    // A mounted editor keeps the two functions it was given until it is rendered again
    const props = controller.editorProps(chapterId);
    env.editor = fakeEditor(text == null ? chapter.content : text, () => props);
    env.editor.seed = env.editor.mount();
    return env.editor;
  };
  const lastInfo = () => env.setInfo.mock.calls[env.setInfo.mock.calls.length - 1][0];
  return { controller, env, chapters, open, lastInfo, settings };
}

const logged = (env) => env.logDecision.mock.calls.map(call => call[0]);
// What reportPending tells the close guard: suggestions and pending drafts apart (final pass, T-009)
const reported = (suggestions, blocks = 0) => ({ suggestions, blocks });

describe('session store', () => {
  test('the seed of a chapter without a record is null', () => {
    const { controller } = setup();
    const props = controller.editorProps('luku-1');
    expect(props.suggestionSeed(SAMPLE)).toEqual({ state: null, revealPos: null });
    // The same two functions on every call
    expect(controller.editorProps('luku-1')).toBe(props);
    expect(controller.editorProps('luku-1').onSuggestionsChange).toBe(props.onSuggestionsChange);
    expect(controller.editorProps('luku-2')).not.toBe(props);
  });

  test('an unmount event stores the record; the seed after the return keeps the pending suggestions', () => {
    const { controller, open } = setup();
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });
    first.rejectSuggestion();
    const before = first.getSuggestions();

    open('luku-2');
    expect(controller.pendingByChapter()).toEqual([{ chapterId: 'luku-1', count: 3, blocks: 0 }]);

    const back = open('luku-1');
    expect(back.seed.state).not.toBeNull();
    const after = back.getSuggestions();
    expect(after.pending.map(item => [item.id, item.from, item.to, item.insert])).toEqual(before.pending.map(item => [item.id, item.from, item.to, item.insert]));
    expect(after.rejected.map(item => item.id)).toEqual(before.rejected.map(item => item.id));
    // The record moved into the editor: it is counted once
    expect(controller.pendingTotal()).toBe(3);
  });

  test('the seed drops a pending suggestion whose text changed while the chapter was closed and sets the notice', () => {
    const { controller, env, chapters, open, lastInfo } = setup();
    open('luku-1').proposeChanges(FOUR, { meta: META });
    open('luku-2');

    // The chapter's text changes while it is closed (an undo, a replace-all)
    const changedText = SAMPLE.replace('mennyt', 'tullut');
    chapters[0].content = changedText;
    const back = open('luku-1', changedText);
    const shot = back.getSuggestions();
    expect(shot.pending.map(item => item.original)).toEqual(['', 'sanoi', 'åkerö']);
    shot.pending.forEach(item => expect(changedText.slice(item.from, item.to)).toBe(item.original));
    expect(shot.rejected.map(item => [item.original, item.reason])).toEqual([['mennyt', 'external']]);
    expect(shot.notice).toEqual({ kind: 'dropped-external', count: 1 });
    expect(lastInfo()).toMatchObject({ chapterId: 'luku-1', pending: 3, rejected: 1, notice: { kind: 'dropped-external', count: 1 } });
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(3));
  });

  test('an unmount without tracked suggestions deletes the record', () => {
    const { controller, open } = setup();
    const first = open('luku-1');
    first.proposeChanges([at(SAMPLE, 'sanoi', 'kuiskasi')], { meta: META });
    open('luku-2');
    expect(controller.pendingTotal()).toBe(1);

    const back = open('luku-1');
    back.acceptSuggestion();
    open('luku-2');
    expect(controller.pendingTotal()).toBe(0);
    expect(open('luku-1', back.text()).seed).toEqual({ state: null, revealPos: null });
  });

  test('the stored record keeps rejected suggestions, the view mode and an open notice', () => {
    const { open } = setup();
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });
    first.rejectGroup();
    first.setSuggestionView('new');
    first.proposeChanges([at(SAMPLE, 'sanoi', 'virkkoi'), at(SAMPLE, 'oli', 'on')], { meta: META });
    // The same place again: skipped as a conflict, and the notice says so
    first.proposeChanges([at(SAMPLE, 'sanoi', 'puhui')], { meta: META });
    const notice = first.getSuggestions().notice;
    expect(notice).toEqual({ kind: 'skipped', count: 1 });
    open('luku-2');

    const back = open('luku-1');
    expect(back.getSuggestions().rejected).toHaveLength(4);
    expect(back.getSuggestions().pending).toHaveLength(2);
    expect(back.getSuggestions().viewMode).toBe('new');
    expect(back.getSuggestions().notice).toEqual(notice);
    // Captured ranges die with the editor
    expect(back.state().ranges).toEqual([]);
  });

  // A draft being written when its chapter is left (stage I-09 review)
  const leaveWhileStreaming = (text, { attempts = [], deps } = {}) => {
    const harness = setup({ deps });
    const first = harness.open('luku-1');
    let state = M.reduce(first.state(), { type: 'blockStart', id: 'b1', pos: 22, meta: META, docText: SAMPLE });
    for (const earlier of attempts) {
      state = M.reduce(state, { type: 'blockAppend', id: 'b1', text: earlier.text });
      state = M.reduce(state, { type: 'blockFinish', id: 'b1', status: 'done', meta: earlier.meta });
      state = M.reduce(state, { type: 'blockRetry', id: 'b1' });
    }
    if (text) state = M.reduce(state, { type: 'blockAppend', id: 'b1', text });
    harness.controller.editorProps('luku-1').onSuggestionsChange(M.snapshot(state), state.event);
    harness.streamingTotal = harness.controller.pendingTotal();
    harness.controller.editorProps('luku-1').onSuggestionsChange(M.snapshot(state), { type: 'unmount', docText: SAMPLE, state });
    harness.env.editor = null;
    harness.stored = () => {
      const seed = harness.controller.editorProps('luku-1').suggestionSeed(SAMPLE);
      return seed.state ? M.snapshot(seed.state).block : null;
    };
    return harness;
  };

  test('a block left mid-stream by a chapter switch keeps the text up to the last full sentence with the stop note', () => {
    const { controller, stored } = leaveWhileStreaming('Sumu nousi. Sitten');
    expect(controller.pendingTotal()).toBe(1);
    expect(stored()).toMatchObject({
      id: 'b1', status: 'stopped', text: 'Sumu nousi.', state: 'pending',
      note: 'Pysäytetty. Teksti on leikattu viimeiseen kokonaiseen virkkeeseen.'
    });

    // The stored text is in the manuscript's typography, as a stop in the editor gives it
    const typed = leaveWhileStreaming('Hän sanoi: "Tule." Sitten hän').stored();
    expect(typed.text).toBe('Hän sanoi: ”Tule.”');
  });

  test('a block left before its first full sentence is dropped, and only that attempt when earlier ones exist', () => {
    const alone = leaveWhileStreaming('Sumu nousi järvel');
    expect(alone.controller.pendingTotal()).toBe(0);
    expect(alone.stored()).toBeNull();

    const kept = leaveWhileStreaming('Usva peit', { attempts: [{ text: 'Ensimmäinen virke.', meta: { ...META, requestLogId: 'req-1' } }] });
    expect(kept.controller.pendingTotal()).toBe(1);
    expect(kept.stored()).toMatchObject({ status: 'done', text: 'Ensimmäinen virke.', attempt: 0, attemptCount: 1, note: null });
  });

  test('a streaming block counts as pending for the close guard and the project-switch question', async () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    const streaming = M.reduce(M.reduce(first.state(), { type: 'blockStart', id: 'b1', pos: 22, meta: META, docText: SAMPLE }),
      { type: 'blockAppend', id: 'b1', text: 'Sumu' });
    controller.editorProps('luku-1').onSuggestionsChange(M.snapshot(streaming), streaming.event);
    expect(controller.pendingTotal()).toBe(1);
    // Final pass (T-009): the draft is named on its own, not counted as a suggestion
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(0, 1));
    await expect(controller.confirmDiscard()).resolves.toBe(true);
    expect(env.askConfirm).toHaveBeenCalledWith('Hylätäänkö käsittelemättömät ehdotukset?',
      'Käsikirjoituksessa on käsittelemätön tekoälyn luonnos. Se ei säily, kun projekti vaihtuu. Käsikirjoituksen tekstiä se ei ole muuttanut.',
      'Hylkää ehdotukset', 'Palaa ehdotuksiin');
  });

  test('the request row of a draft whose chapter was left reaches its stored attempt and its decision row', () => {
    const { controller, env, open } = leaveWhileStreaming('Sumu nousi. Sitten');
    const logMeta = { ...META, action: 'write-here', requestLogId: 'req-9' };
    expect(controller.linkStoredBlock('luku-1', 'b1', logMeta)).toBe(true);
    // Once only, and never for another block
    expect(controller.linkStoredBlock('luku-1', 'b1', { ...logMeta, requestLogId: 'req-10' })).toBe(false);
    expect(controller.linkStoredBlock('luku-1', 'b2', logMeta)).toBe(false);

    const back = open('luku-1');
    expect(back.getSuggestions().block).toMatchObject({ id: 'b1', status: 'stopped', meta: logMeta });
    // Hylkää logs the decision with the request's row
    back.emit(M.reduce(back.state(), { type: 'blockReject', id: 'b1' }).event);
    expect(logged(env).pop()).toMatchObject({ decision: 'rejected', requestLogId: 'req-9', after: 'Sumu nousi.' });

    // A draft that kept no attempt has nothing to link
    const gone = leaveWhileStreaming('Sumu nou');
    expect(gone.controller.linkStoredBlock('luku-1', 'b1', logMeta)).toBe(false);
  });
});

describe('counting and the bar', () => {
  test('pendingTotal counts the live chapter and the stored ones', () => {
    const { controller, open } = setup();
    open('luku-1').proposeChanges(FOUR, { meta: META });
    expect(controller.pendingTotal()).toBe(4);

    const second = open('luku-2');
    second.proposeChanges([at(OTHER, 'Sade', 'Sumu'), at(OTHER, 'yön', 'päivän')], { meta: META });
    expect(controller.pendingTotal()).toBe(6);
    expect(controller.pendingByChapter()).toEqual([{ chapterId: 'luku-1', count: 4, blocks: 0 }, { chapterId: 'luku-2', count: 2, blocks: 0 }]);

    second.rejectSuggestion();
    expect(controller.pendingTotal()).toBe(5);
    // A finished block is one more thing pending, counted apart from the suggestions (final pass, T-009)
    const withBlock = M.reduce(M.reduce(M.reduce(second.state(),
      { type: 'blockStart', id: 'b1', pos: OTHER.length, meta: META, docText: OTHER }),
      { type: 'blockAppend', id: 'b1', text: 'Aamulla.' }),
      { type: 'blockFinish', id: 'b1' });
    controller.editorProps('luku-2').onSuggestionsChange(M.snapshot(withBlock), withBlock.event);
    expect(controller.pendingTotal()).toBe(6);
    expect(controller.pendingCounts()).toEqual({ suggestions: 5, blocks: 1 });
    expect(controller.pendingByChapter()).toEqual([{ chapterId: 'luku-1', count: 4, blocks: 0 }, { chapterId: 'luku-2', count: 1, blocks: 1 }]);
  });

  test('reportPending is called only when the total changes', () => {
    const { env, open } = setup();
    const first = open('luku-1');
    expect(env.reportPending).not.toHaveBeenCalled();     // nothing pending, as the main process assumes

    first.proposeChanges(FOUR, { meta: META });
    expect(env.reportPending.mock.calls).toEqual([[reported(4)]]);
    first.stepSuggestion(1);
    first.setSuggestionView('new');
    first.emit({ type: 'current', id: 'x' });
    expect(env.reportPending).toHaveBeenCalledTimes(1);

    first.acceptSuggestion();
    first.rejectSuggestion();
    expect(env.reportPending.mock.calls).toEqual([[reported(4)], [reported(3)], [reported(2)]]);
    // Leaving the chapter keeps the total
    open('luku-2');
    expect(env.reportPending).toHaveBeenCalledTimes(3);
  });

  test('setInfo is called only when the bar info changes', () => {
    const { env, open, lastInfo } = setup();
    const first = open('luku-1');
    const count = () => env.setInfo.mock.calls.length;
    expect(count()).toBe(1);
    expect(lastInfo()).toEqual({
      chapterId: 'luku-1', pending: 0, rejected: 0, currentIndex: -1, viewMode: 'changes', notice: null,
      blockStatus: null, blockCurrent: false, dialoguePending: 0, elsewhere: [], closed: false, current: null
    });

    first.proposeChanges(FOUR, { meta: META });
    expect(count()).toBe(2);
    // Events that change nothing the bar shows
    first.emit({ type: 'seeded' });
    first.emit({ type: 'current', id: first.state().currentId });
    first.emit({ type: 'block', action: 'show', blockId: 'x' });
    expect(count()).toBe(2);

    first.stepSuggestion(1);
    expect(count()).toBe(3);
    expect(lastInfo()).toMatchObject({ pending: 4, currentIndex: 1 });
    first.setSuggestionView('original');
    expect(lastInfo().viewMode).toBe('original');
    expect(count()).toBe(4);
  });

  test('elsewhere lists the other chapters with their titles and counts', () => {
    const { open, lastInfo } = setup();
    open('luku-1').proposeChanges(FOUR, { meta: META });
    open('luku-3').proposeChanges([{ from: 0, to: 6, insert: 'Neljäs', original: 'Kolmas' }], { meta: META });
    open('luku-2');
    expect(lastInfo()).toMatchObject({
      chapterId: 'luku-2',
      pending: 0,
      elsewhere: [
        { chapterId: 'luku-1', title: 'Ensimmäinen luku', count: 4, blocks: 0 },
        { chapterId: 'luku-3', title: 'Kolmas luku', count: 1, blocks: 0 }
      ]
    });
    // The open chapter is never in its own list
    open('luku-1');
    expect(lastInfo().elsewhere).toEqual([{ chapterId: 'luku-3', title: 'Kolmas luku', count: 1, blocks: 0 }]);
    expect(lastInfo().pending).toBe(4);
  });

  test('the bar info carries the current suggestion with its meta', () => {
    const { open, lastInfo } = setup();
    const line = { key: 'r3', original: 'Hän sanoi niin.', revised: 'Hän kuiskasi niin.' };
    const first = open('luku-1');
    first.proposeChanges([at(SAMPLE, 'sanoi', 'kuiskasi', { meta: { ...META, line } }), at(SAMPLE, 'mennyt', 'lähtenyt')], { meta: META });
    const id = first.getSuggestions().pending[0].id;
    expect(lastInfo().current).toEqual({ id, original: 'sanoi', insert: 'kuiskasi', meta: { ...META, line } });

    first.stepSuggestion(1);
    expect(lastInfo().current).toMatchObject({ original: 'mennyt', insert: 'lähtenyt', meta: META });
    first.rejectGroup();
    expect(lastInfo().current).toBeNull();
    expect(lastInfo()).toMatchObject({ pending: 0, rejected: 2, currentIndex: -1 });
  });

  test('the bar info counts dialogue suggestions separately', () => {
    const { open, lastInfo } = setup();
    const first = open('luku-1');
    first.proposeChanges([
      at(SAMPLE, 'sanoi', 'kuiskasi'),
      at(SAMPLE, 'Älä', 'Et', { meta: { ...META, dialogue: true } }),
      at(SAMPLE, 'mene', 'tule', { meta: { ...META, dialogue: true } })
    ], { meta: META });
    expect(lastInfo()).toMatchObject({ pending: 3, dialoguePending: 2 });
    first.rejectSuggestion(first.getSuggestions().pending[1].id);
    expect(lastInfo()).toMatchObject({ pending: 2, dialoguePending: 1 });
  });

  // Final pass (T-009, lead decision "Counts"): the bar, Muissa luvuissa …, the project-switch question and
  // the close guard name the same things, the suggestions by their count and a pending draft apart
  const NINE = 'Yksi kaksi kolme neljä viisi kuusi seitsemän kahdeksan yhdeksän. Loppu.';
  const nineAndDraft = (harness) => {
    const editor = harness.open('luku-1', NINE);
    const words = NINE.split('. ')[0].split(' ');
    editor.proposeChanges(words.map(word => at(NINE, word, word.toUpperCase())), { meta: META });
    editor.reduce({ type: 'blockStart', id: 'b1', pos: NINE.length, meta: META, docText: NINE });
    editor.reduce({ type: 'blockAppend', id: 'b1', text: 'Aamu tuli.' });
    editor.reduce({ type: 'blockFinish', id: 'b1' });
    return editor;
  };

  test('nine suggestions and a finished draft are counted apart everywhere, and the bar names the draft when it is current (T-009)', async () => {
    const harness = setup();
    const { controller, env, lastInfo } = harness;
    nineAndDraft(harness);

    expect(controller.pendingCounts()).toEqual({ suggestions: 9, blocks: 1 });
    expect(controller.pendingTotal()).toBe(10);
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(9, 1));
    // The draft is the current item (blockStart made it so): the bar's count stays the suggestions'
    expect(lastInfo()).toMatchObject({ pending: 9, currentIndex: -1, blockStatus: 'done', blockCurrent: true, current: null });

    await controller.confirmDiscard();
    expect(env.askConfirm).toHaveBeenLastCalledWith('Hylätäänkö käsittelemättömät ehdotukset?',
      'Käsikirjoituksessa on 9 käsittelemätöntä ehdotusta ja tekoälyn luonnos. Ne eivät säily, kun projekti vaihtuu. Käsikirjoituksen tekstiä ne eivät ole muuttaneet.',
      'Hylkää ehdotukset', 'Palaa ehdotuksiin');

    // A suggestion current again: the draft is not
    harness.env.editor.stepSuggestion(1);
    expect(lastInfo()).toMatchObject({ pending: 9, blockCurrent: false });
    expect(lastInfo().currentIndex).toBeGreaterThanOrEqual(0);

    // From another chapter: Muissa luvuissa … gets both numbers
    harness.open('luku-2');
    expect(lastInfo().elsewhere).toEqual([{ chapterId: 'luku-1', title: 'Ensimmäinen luku', count: 9, blocks: 1 }]);
    expect(lastInfo()).toMatchObject({ pending: 0, blockCurrent: false });
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(9, 1));
  });

  test('the project-switch question names one suggestion, one draft and several drafts in the one wording (T-009)', async () => {
    const ask = async (build) => {
      const harness = setup();
      build(harness);
      await harness.controller.confirmDiscard();
      return harness.env.askConfirm.mock.calls[0][1];
    };
    const draftIn = (harness, chapterId, text) => {
      const editor = harness.open(chapterId, text);
      editor.reduce({ type: 'blockStart', id: `b-${chapterId}`, pos: text.length, meta: META, docText: text });
      editor.reduce({ type: 'blockAppend', id: `b-${chapterId}`, text: 'Aamu tuli.' });
      return editor;
    };

    expect(await ask(({ open }) => open('luku-1').proposeChanges([at(SAMPLE, 'sanoi', 'kuiskasi')], { meta: META })))
      .toBe('Käsikirjoituksessa on 1 käsittelemätön ehdotus. Se ei säily, kun projekti vaihtuu. Käsikirjoituksen tekstiä se ei ole muuttanut.');
    expect(await ask((harness) => {
      harness.open('luku-1').proposeChanges([at(SAMPLE, 'sanoi', 'kuiskasi')], { meta: META });
      draftIn(harness, 'luku-2', OTHER);
    })).toBe('Käsikirjoituksessa on 1 käsittelemätön ehdotus ja tekoälyn luonnos. Ne eivät säily, kun projekti vaihtuu. Käsikirjoituksen tekstiä ne eivät ole muuttaneet.');
    expect(await ask((harness) => {
      draftIn(harness, 'luku-1', SAMPLE);
      draftIn(harness, 'luku-2', OTHER);
    })).toBe('Käsikirjoituksessa on 2 käsittelemätöntä tekoälyn luonnosta. Ne eivät säily, kun projekti vaihtuu. Käsikirjoituksen tekstiä ne eivät ole muuttaneet.');
    expect(await ask((harness) => {
      harness.open('luku-1').proposeChanges(FOUR, { meta: META });
      draftIn(harness, 'luku-2', OTHER);
      draftIn(harness, 'luku-3', 'Kolmas luku on lyhyt.');
    })).toBe('Käsikirjoituksessa on 4 käsittelemätöntä ehdotusta ja 2 tekoälyn luonnosta. Ne eivät säily, kun projekti vaihtuu. Käsikirjoituksen tekstiä ne eivät ole muuttaneet.');
  });

  test('closeBar sets the closed flag of the open chapter, and a new proposal clears it', () => {
    const { controller, open, lastInfo } = setup();
    const first = open('luku-1');
    first.proposeChanges([at(SAMPLE, 'sanoi', 'kuiskasi')], { meta: META });
    first.rejectGroup();
    controller.closeBar();
    expect(lastInfo()).toMatchObject({ closed: true, rejected: 1 });
    expect(first.getSuggestions().rejected).toHaveLength(1);    // still restorable

    first.proposeChanges([at(SAMPLE, 'mennyt', 'lähtenyt')], { meta: META });
    expect(lastInfo()).toMatchObject({ closed: false, pending: 1 });
  });
});

describe('usage log', () => {
  test('an accepted event writes one log entry per group', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    first.proposeChanges([at(SAMPLE, 'sanoi', 'kuiskasi'), at(SAMPLE, 'mennyt', 'lähtenyt')], { groupId: 'ajo', meta: META });
    first.proposeChanges([at(SAMPLE, 'åkerö', 'Åkerö')], { groupId: 'liitos', meta: { ...META, source: 'editor', action: 'paste-edits', actionLabel: 'Liitä muokkauksina', model: null, provider: null, requestLogId: null, instruction: '' } });

    expect(controller.acceptAll()).toBe(3);
    const rows = logged(env);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      decision: 'accepted', redo: false, scope: 'group',
      source: 'faust', action: 'proofread', actionLabel: 'Kielenhuolto', instruction: 'korjaa pilkut',
      provider: 'cherry', model: 'c91f:kimi-k2', requestLogId: 'req-1',
      chapterId: 'luku-1', chapterTitle: 'Ensimmäinen luku',
      count: 2, charsAdded: 16, charsRemoved: 11, before: null, after: null, snapshotId: null
    });
    expect(rows[1]).toMatchObject({ decision: 'accepted', scope: 'single', source: 'editor', action: 'paste-edits', count: 1, model: null, provider: null, requestLogId: null });
  });

  test('a single accept carries before and after; a bulk accept carries count and chars only', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });
    controller.acceptCurrent();                 // the insertion " taas"
    expect(logged(env)[0]).toMatchObject({ scope: 'single', count: 1, before: '', after: ' taas', charsAdded: 5, charsRemoved: 0 });

    controller.acceptAll();
    expect(logged(env)[1]).toMatchObject({ scope: 'group', count: 3, before: null, after: null, charsAdded: 21, charsRemoved: 16 });
    expect(logged(env)).toHaveLength(2);
  });

  test('a rejected event is logged with the sums of what was turned down', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });
    controller.rejectCurrent();
    controller.rejectAll();
    const rows = logged(env);
    expect(rows.map(row => [row.decision, row.scope, row.count, row.charsAdded, row.charsRemoved])).toEqual([
      ['rejected', 'single', 1, 5, 0],
      ['rejected', 'group', 3, 21, 16]
    ]);
    // What was turned down is still on the single row
    expect(rows[0]).toMatchObject({ before: '', after: ' taas', redo: false, snapshotId: null });
    expect(rows[1]).toMatchObject({ before: null, after: null });
  });

  test('suggestions with source local or without meta are not logged', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    first.proposeChanges([at(SAMPLE, 'sanoi', 'kuiskasi'), { from: 3, to: 3, insert: ' taas' }], { meta: LOCAL });
    first.proposeChanges([at(SAMPLE, 'mennyt', 'lähtenyt')], {});
    first.proposeChanges([at(SAMPLE, 'åkerö', 'Åkerö')], { meta: META });

    // A typography fix is turned down, then everything else is accepted
    first.rejectSuggestion(first.getSuggestions().pending.find(item => item.original === 'sanoi').id);
    expect(logged(env)).toEqual([]);
    expect(controller.acceptAll()).toBe(3);
    // Three were accepted; only the one request of FAUST is in the log
    expect(logged(env)).toHaveLength(1);
    expect(logged(env)[0]).toMatchObject({ decision: 'accepted', source: 'faust', scope: 'single', count: 1, after: 'Åkerö' });
    expect(first.text()).toContain('lähtenyt');
    expect(first.text()).toContain('Hän taas sanoi');
  });

  test('a block that is accepted or rejected is logged like a one-item group', () => {
    const { controller, env } = setup();
    const props = controller.editorProps('luku-1');
    let state = M.reduce(M.createState(), { type: 'blockStart', id: 'b1', pos: 22, meta: { ...META, action: 'write-here', actionLabel: 'Kirjoita kohdistimeen' }, docText: SAMPLE });
    state = M.reduce(state, { type: 'blockAppend', id: 'b1', text: 'Sumu nousi.' });
    state = M.reduce(state, { type: 'blockFinish', id: 'b1' });
    const mapper = M.makeMapper([M.blockChange(state, SAMPLE)]);
    const accepted = M.reduce(state, { type: 'blockAccepted', id: 'b1', insert: ' Sumu nousi.', mapPos: mapper.mapPos, touchesRange: mapper.touchesRange });
    props.onSuggestionsChange(M.snapshot(accepted), accepted.event);
    expect(logged(env)).toEqual([expect.objectContaining({
      decision: 'accepted', scope: 'single', action: 'write-here', count: 1, before: '', after: ' Sumu nousi.', charsAdded: 12, charsRemoved: 0
    })]);
  });
});

describe('bulk commands', () => {
  const dialogue = { ...META, dialogue: true };
  const mixed = (editor) => {
    editor.proposeChanges([
      at(SAMPLE, 'sanoi', 'kuiskasi'),
      at(SAMPLE, 'Älä', 'Et', { meta: dialogue }),
      at(SAMPLE, 'mennyt', 'lähtenyt')
    ], { groupId: 'ajo', meta: META });
    editor.proposeChanges([at(SAMPLE, 'åkerö', 'Åkerö'), at(SAMPLE, 'oli', 'on')], { groupId: 'muu', meta: META });
  };

  test('acceptAll calls takeSnapshot once when it is wired and puts the id on the entry', () => {
    const takeSnapshot = jest.fn(() => 'snapshot-17');
    const { controller, env, open } = setup({ env: { takeSnapshot } });
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });

    expect(controller.acceptAll()).toBe(4);
    expect(takeSnapshot).toHaveBeenCalledTimes(1);
    expect(takeSnapshot).toHaveBeenCalledWith('luku-1', 'Ennen Hyväksy kaikki -toimintoa');
    expect(logged(env)).toEqual([expect.objectContaining({ decision: 'accepted', scope: 'group', count: 4, snapshotId: 'snapshot-17' })]);
    expect(first.text()).toBe('Hän taas kuiskasi: ”Älä mene.” – Enkä lähtenyt, vaikka Åkerö [TODO: tarkista] oli <u>kypsä</u>.');
    // The snapshot is taken before anything is accepted
    expect(takeSnapshot.mock.invocationCallOrder[0]).toBeLessThan(first.acceptGroup.mock.invocationCallOrder[0]);

    // A later single accept does not carry the old id
    first.proposeChanges([at(first.text(), 'kypsä', 'raaka')], { meta: META });
    controller.acceptCurrent();
    expect(logged(env)[1].snapshotId).toBeNull();
    // A feature gives its own reason
    first.proposeChanges([at(first.text(), 'Hän', 'Hon'), at(first.text(), 'Enkä', 'Enpä')], { groupId: 'pika', meta: META });
    controller.acceptAll({ groupId: 'pika', reason: 'Ennen pikamuokkausta: Tiivistä' });
    expect(takeSnapshot).toHaveBeenLastCalledWith('luku-1', 'Ennen pikamuokkausta: Tiivistä');
  });

  test('acceptAll with a groupId accepts only that group', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    mixed(first);
    expect(controller.acceptAll({ groupId: 'muu' })).toBe(2);
    expect(first.acceptGroup).toHaveBeenCalledWith('muu');
    expect(first.getSuggestions().pending.map(item => [item.groupId, item.original])).toEqual([['ajo', 'sanoi'], ['ajo', 'Älä'], ['ajo', 'mennyt']]);
    expect(first.text()).toBe(SAMPLE.replace('åkerö', 'Åkerö').replace('oli', 'on'));
    expect(logged(env)).toHaveLength(1);
    expect(controller.acceptAll({ groupId: 'ei-ole' })).toBe(0);
  });

  test('acceptAll leaves suggestions with meta.dialogue pending', () => {
    const takeSnapshot = jest.fn(() => 's1');
    const { controller, env, open, lastInfo } = setup({ env: { takeSnapshot } });
    const first = open('luku-1');
    mixed(first);

    expect(controller.acceptAll()).toBe(4);
    expect(first.getSuggestions().pending.map(item => item.original)).toEqual(['Älä']);
    expect(first.text()).toContain('”Älä mene.”');
    expect(lastInfo()).toMatchObject({ pending: 1, dialoguePending: 1 });
    expect(logged(env).reduce((sum, row) => sum + row.count, 0)).toBe(4);

    // Pressed again: nothing is taken, no snapshot, no log row
    expect(controller.acceptAll()).toBe(0);
    expect(controller.menuCommand('accept-all')).toBe(0);
    expect(takeSnapshot).toHaveBeenCalledTimes(1);
    expect(first.getSuggestions().pending).toHaveLength(1);
    // One at a time it is accepted
    expect(controller.acceptCurrent()).toBe(true);
    expect(first.text()).toContain('”Et mene.”');
  });

  test('the snapshot is not taken when only one non-dialogue suggestion will be accepted', () => {
    const takeSnapshot = jest.fn(() => 's1');
    const { controller, env, open } = setup({ env: { takeSnapshot } });
    const first = open('luku-1');
    first.proposeChanges([
      at(SAMPLE, 'sanoi', 'kuiskasi'),
      at(SAMPLE, 'Älä', 'Et', { meta: dialogue }),
      at(SAMPLE, 'mene', 'tule', { meta: dialogue })
    ], { meta: META });

    // Three are pending, but only one will be accepted
    expect(controller.acceptAll()).toBe(1);
    expect(takeSnapshot).not.toHaveBeenCalled();
    expect(logged(env)).toEqual([expect.objectContaining({ scope: 'single', count: 1, snapshotId: null })]);
    expect(first.getSuggestions().pending).toHaveLength(2);
  });

  test('rejectAll takes dialogue suggestions too', () => {
    const { controller, open } = setup();
    const first = open('luku-1');
    mixed(first);
    expect(controller.rejectAll({ groupId: 'ajo' })).toBe(3);
    expect(first.rejectGroup).toHaveBeenLastCalledWith('ajo');
    expect(first.getSuggestions().pending.map(item => item.groupId)).toEqual(['muu', 'muu']);
    expect(first.getSuggestions().rejected.map(item => item.original)).toEqual(['sanoi', 'Älä', 'mennyt']);

    first.restoreRejected();
    expect(controller.rejectAll()).toBe(5);
    expect(first.getSuggestions().pending).toEqual([]);
    expect(first.text()).toBe(SAMPLE);
  });

  test('menuCommand maps the seven names to the facade', () => {
    const { controller, open } = setup();
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });

    controller.menuCommand('next');
    expect(first.stepSuggestion).toHaveBeenLastCalledWith(1);
    controller.menuCommand('previous');
    expect(first.stepSuggestion).toHaveBeenLastCalledWith(-1);
    controller.menuCommand('accept');
    expect(first.acceptSuggestion).toHaveBeenCalledTimes(1);
    controller.menuCommand('reject');
    expect(first.rejectSuggestion).toHaveBeenCalledTimes(1);
    controller.menuCommand('reject-all');
    expect(first.rejectGroup).toHaveBeenCalledWith(undefined);
    controller.menuCommand('restore');
    expect(first.restoreRejected).toHaveBeenCalledTimes(1);
    controller.menuCommand('accept-all');
    expect(first.acceptGroup).toHaveBeenCalledWith(undefined);
    expect(first.getSuggestions().pending).toEqual([]);
    expect(controller.menuCommand('tuntematon')).toBeUndefined();

    // The bar's own commands
    controller.setView('new');
    expect(first.setSuggestionView).toHaveBeenLastCalledWith('new');
    controller.dismissNotice();
    expect(first.clearSuggestionNotice).toHaveBeenCalledTimes(1);
    controller.step(-1);
    expect(first.stepSuggestion).toHaveBeenLastCalledWith(-1);
  });

  test('without an editor every command does nothing', () => {
    const { controller, env } = setup();
    expect(env.getEditor()).toBeNull();
    for (const name of ['accept', 'reject', 'next', 'previous', 'accept-all', 'reject-all', 'restore']) {
      expect(() => controller.menuCommand(name)).not.toThrow();
    }
    expect(controller.acceptAll()).toBe(0);
    expect(controller.rejectAll()).toBe(0);
    expect(controller.restoreRejected()).toEqual({ restored: 0, failed: 0 });
    expect(() => { controller.setView('new'); controller.dismissNotice(); controller.confirmPaste({ source: 'editor' }); }).not.toThrow();
  });
});

describe('undo and redo', () => {
  // What the undo step of an accept holds
  function acceptedStep(editor, chapterId, ids) {
    const oldContent = editor.text();
    const taken = editor.getSuggestions().pending.filter(item => !ids || ids.includes(item.id));
    // The items as they were before the accept: valid for oldContent
    for (const item of ids ? taken : []) editor.acceptSuggestion(item.id);
    if (!ids) editor.acceptGroup();
    return { chapterId, oldContent, newContent: editor.text(), meta: { noMerge: true, suggestions: { ids: taken.map(item => item.id), items: taken } } };
  }

  test('afterHistory undo of a step with suggestions proposes them with restore and whenText = step.oldContent in the open chapter', () => {
    const { controller, open } = setup();
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });
    const step = acceptedStep(first, 'luku-1');
    first.proposeChanges.mockClear();

    controller.afterHistory('undo', step);
    expect(first.proposeChanges).toHaveBeenCalledTimes(1);
    expect(first.proposeChanges).toHaveBeenCalledWith(step.meta.suggestions.items, { restore: true, whenText: SAMPLE });
    expect(step.oldContent).toBe(SAMPLE);
  });

  test('afterHistory undo for a chapter that is not open puts them into its record, and the seed returns them', () => {
    const { controller, env, chapters, open } = setup();
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });
    // Two of the four are turned down, the other two accepted in one step
    const [insertion, sanoi, mennyt, akero] = first.getSuggestions().pending.map(item => item.id);
    first.rejectSuggestion(insertion);
    first.rejectSuggestion(akero);
    const step = acceptedStep(first, 'luku-1');
    expect(step.meta.suggestions.ids).toEqual([sanoi, mennyt]);

    const elsewhere = open('luku-2');
    elsewhere.proposeChanges.mockClear();
    expect(controller.pendingTotal()).toBe(0);

    // Cmd+Z in another chapter: the app switches to luku-1 in the same tick and undoes the text
    chapters[0].content = step.oldContent;
    controller.afterHistory('undo', step);
    expect(elsewhere.proposeChanges).not.toHaveBeenCalled();
    expect(controller.pendingByChapter()).toEqual([{ chapterId: 'luku-1', count: 2, blocks: 0 }]);
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(2));

    const back = open('luku-1', step.oldContent);
    const shot = back.getSuggestions();
    expect(shot.pending.map(item => item.id)).toEqual(step.meta.suggestions.ids);
    shot.pending.forEach(item => expect(step.oldContent.slice(item.from, item.to)).toBe(item.original));
    // The view goes to the place of the change
    expect(back.seed.revealPos).toBe(M.firstDifference(step.oldContent, step.newContent));
  });

  test('afterHistory undo logs accept_undone', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });
    const step = acceptedStep(first, 'luku-1');
    env.logDecision.mockClear();

    controller.afterHistory('undo', step);
    expect(logged(env)).toEqual([{
      decision: 'accept_undone', redo: false, scope: 'group',
      source: 'faust', action: 'proofread', actionLabel: 'Kielenhuolto', instruction: 'korjaa pilkut',
      provider: 'cherry', model: 'c91f:kimi-k2', requestLogId: 'req-1',
      chapterId: 'luku-1', chapterTitle: 'Ensimmäinen luku',
      // The same counts as the accept it takes back
      count: 4, charsAdded: 26, charsRemoved: 16, before: null, after: null, snapshotId: null
    }]);

    // The undo of an ordinary typing step logs nothing
    controller.afterHistory('undo', { chapterId: 'luku-1', oldContent: 'a', newContent: 'ab', meta: null });
    expect(logged(env)).toHaveLength(1);
  });

  test('beforeHistory redo removes the ids from the editor, or from the record of a closed chapter, and logs accepted with redo', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });
    const step = acceptedStep(first, 'luku-1');
    // Undone: the text is the old one and the suggestions are pending again in the open editor
    first.setText(step.oldContent);
    first.proposeChanges(step.meta.suggestions.items, { restore: true });
    expect(first.getSuggestions().pending).toHaveLength(4);
    env.logDecision.mockClear();

    controller.beforeHistory('redo', step);
    expect(first.removeSuggestions).toHaveBeenCalledWith(step.meta.suggestions.ids);
    expect(first.getSuggestions().pending).toEqual([]);
    expect(first.getSuggestions().rejected).toEqual([]);
    expect(logged(env)).toEqual([expect.objectContaining({ decision: 'accepted', redo: true, scope: 'group', count: 4, charsAdded: 26 })]);

    // The same with the chapter closed: the record loses them
    first.proposeChanges(step.meta.suggestions.items, { restore: true });
    const other = open('luku-2');
    expect(controller.pendingTotal()).toBe(4);
    controller.beforeHistory('redo', step);
    expect(other.removeSuggestions).not.toHaveBeenCalled();
    expect(controller.pendingTotal()).toBe(0);
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(0));
    expect(logged(env)).toHaveLength(2);
    expect(logged(env)[1]).toMatchObject({ decision: 'accepted', redo: true });

    // An undo does nothing before the step, and a redo of plain typing nothing at all
    env.logDecision.mockClear();
    controller.beforeHistory('undo', step);
    controller.beforeHistory('redo', { chapterId: 'luku-1', oldContent: 'a', newContent: 'ab', meta: null });
    expect(logged(env)).toEqual([]);
  });

  test('afterHistory reveals the first difference in the open chapter and stores it for a closed one', () => {
    const { controller, open } = setup();
    const first = open('luku-1');
    const edited = SAMPLE.replace('mennyt', 'tullut');
    controller.afterHistory('undo', { chapterId: 'luku-1', oldContent: SAMPLE, newContent: edited, meta: null });
    expect(first.revealPos).toHaveBeenCalledTimes(1);
    expect(first.revealPos).toHaveBeenCalledWith(30);
    controller.afterHistory('redo', { chapterId: 'luku-1', oldContent: SAMPLE, newContent: SAMPLE + ' Loppu.', meta: null });
    expect(first.revealPos).toHaveBeenLastCalledWith(SAMPLE.length);

    // For a chapter that is not on screen the place waits for its editor
    controller.afterHistory('undo', { chapterId: 'luku-2', oldContent: OTHER, newContent: OTHER.replace('Sade', 'Sumu'), meta: null });
    expect(first.revealPos).toHaveBeenCalledTimes(2);
    const second = open('luku-2');
    expect(second.seed).toEqual({ state: null, revealPos: OTHER.indexOf('Sade') + 1 });
    // It is used once
    expect(open('luku-1') && open('luku-2').seed.revealPos).toBeNull();
  });

  test('an undo of a smart-typing replacement puts the caret after what was typed, and so does its redo (stage I-06)', () => {
    const { controller, open } = setup();
    const first = open('luku-1');
    const typed = 'Toinen --';
    const replaced = 'Toinen –';
    const step = { chapterId: 'luku-1', oldContent: 'Alku.\n' + typed, newContent: 'Alku.\n' + replaced, meta: { noMerge: true, source: 'smart-typing' } };
    controller.afterHistory('undo', step);
    // After "--", not before it: typing on goes behind the marks, which are not converted again
    expect(first.revealPos).toHaveBeenLastCalledWith(('Alku.\n' + typed).length);
    controller.afterHistory('redo', step);
    expect(first.revealPos).toHaveBeenLastCalledWith(('Alku.\n' + replaced).length);
    // A quote in the middle of a line: the caret goes after the mark, the rest of the line stays after it
    const quote = { chapterId: 'luku-1', oldContent: 'Hän sanoi "Hei ja', newContent: 'Hän sanoi ”Hei ja', meta: { noMerge: true, source: 'smart-typing' } };
    controller.afterHistory('undo', quote);
    expect(first.revealPos).toHaveBeenLastCalledWith(11);
    // Every other step keeps the start of the change
    controller.afterHistory('undo', { ...step, meta: { noMerge: true } });
    expect(first.revealPos).toHaveBeenLastCalledWith(13);
  });

  test('afterHistory for a step without text does nothing', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    const calls = env.setInfo.mock.calls.length;
    controller.afterHistory('undo', { chapterId: 'luku-1', meta: null });
    controller.afterHistory('redo', { chapterId: 'luku-1', oldContent: null, newContent: undefined });
    controller.afterHistory('undo', { chapterId: 'luku-1', oldContent: SAMPLE, newContent: SAMPLE });
    controller.afterHistory('undo', null);
    // A step that only renamed something carries suggestions of no text: nothing to restore
    controller.afterHistory('undo', { chapterId: 'luku-1', meta: { suggestions: { ids: ['s1'], items: [{ id: 's1', from: 0, to: 3, insert: 'x', original: 'Hän', meta: META }] } } });
    expect(first.revealPos).not.toHaveBeenCalled();
    expect(first.proposeChanges).not.toHaveBeenCalled();
    expect(env.logDecision).not.toHaveBeenCalled();
    expect(env.setInfo.mock.calls.length).toBe(calls);
    expect(open('luku-2').seed).toEqual({ state: null, revealPos: null });
  });
});

describe('paste as edits', () => {
  test('pasteAsEdits without an editor opens the dialog with status no-editor', () => {
    const { controller, env } = setup();
    controller.pasteAsEdits('Jotain tekstiä.');
    expect(env.openPasteDialog).toHaveBeenCalledTimes(1);
    expect(env.openPasteDialog).toHaveBeenCalledWith({
      status: 'no-editor', scope: 'chapter', stats: { targetWords: 0, clipboardWords: 0, changeCount: 0 },
      ratio: 0, warn: false, protectedCount: 0, source: 'editor'
    });
  });

  test('pasteAsEdits without a selection targets the whole chapter', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    const clipboard = SAMPLE.replace('sanoi', 'kuiskasi').replace('mennyt', 'lähtenyt') + '\n';
    controller.pasteAsEdits(clipboard);

    expect(first.captureSelection).toHaveBeenCalledWith({ highlight: true, fallback: 'document' });
    expect(env.openPasteDialog).toHaveBeenCalledWith({
      status: 'ok', scope: 'chapter', stats: { targetWords: 13, clipboardWords: 13, changeCount: 2 },
      ratio: 0.2, warn: false, protectedCount: 0, source: 'editor'
    });
    // Nothing is proposed before the author answers
    expect(first.proposeChanges).not.toHaveBeenCalled();

    // With a selection the target is the selection, and the remembered source is offered
    env.settings = null;
    env.getSetting.mockImplementation(() => 'external-ai');
    first.select(11, 22);
    controller.pasteAsEdits('”Älä tule.”');
    expect(env.openPasteDialog).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'ok', scope: 'selection', stats: { targetWords: 2, clipboardWords: 2, changeCount: 1 }, source: 'external-ai'
    }));
    expect(env.getSetting).toHaveBeenLastCalledWith('suggestions.pasteSource', 'editor');
    // The range of the unanswered first request was given up
    expect(first.releaseRange).toHaveBeenCalledWith('r1');
  });

  test('pasteAsEdits does not propose deleting the part of a note that the selection cuts', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    const noteEnd = SAMPLE.indexOf('tarkista') + 'tarkista'.length;
    // The drag ended inside the note; the text came back from a chat without it
    first.select(SAMPLE.indexOf('Enkä'), noteEnd);
    controller.pasteAsEdits('Enkä lähtenyt, vaikka åkerö');
    expect(env.openPasteDialog).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'ok', protectedCount: 1, stats: expect.objectContaining({ changeCount: 1 })
    }));
    controller.confirmPaste({ source: 'external-ai' });
    expect(first.getSuggestions().pending.map(item => [item.original, item.insert])).toEqual([['mennyt,', 'lähtenyt,']]);

    // The whole of a cut note was all the clipboard changed: nothing to propose
    first.rejectGroup();
    first.select(SAMPLE.indexOf('[TODO') + 1, SAMPLE.indexOf(' <u>'));
    controller.pasteAsEdits('oli');
    expect(env.openPasteDialog).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'protected-only', protectedCount: 1 }));
  });

  test('pasteAsEdits reports empty, identical and protected-only, and keeps no target for them', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    const status = () => env.openPasteDialog.mock.calls[env.openPasteDialog.mock.calls.length - 1][0];

    controller.pasteAsEdits('   ');
    expect(status()).toMatchObject({ status: 'empty', scope: 'chapter' });
    controller.pasteAsEdits(SAMPLE + '\r\n');
    expect(status()).toMatchObject({ status: 'identical', stats: { targetWords: 13, clipboardWords: 13, changeCount: 0 } });
    // The clipboard lost the note and the underline: nothing may be proposed
    controller.pasteAsEdits('Hän sanoi: ”Älä mene.” – Enkä mennyt, vaikka åkerö oli kypsä.');
    expect(status()).toMatchObject({ status: 'protected-only', protectedCount: 2, stats: { targetWords: 13, clipboardWords: 11, changeCount: 0 } });

    expect(first.ranges.size).toBe(0);
    controller.confirmPaste({ source: 'editor' });
    expect(first.proposeChanges).not.toHaveBeenCalled();

    // A warning for a text that has little to do with the target
    const { controller: loud, env: loudEnv, open: openLoud } = setup({ deps: { changeRatio: () => 0.83 } });
    openLoud('luku-1');
    loud.pasteAsEdits('Aivan toinen teksti, joka ei liity lukuun.');
    expect(loudEnv.openPasteDialog).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ok', ratio: 0.83, warn: true }));
  });

  test('confirmPaste proposes with the chosen source and action paste-edits and remembers the source', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    first.select(11, 22);
    // The editor's copy lost nothing but changed two words; the note is elsewhere in the chapter
    controller.pasteAsEdits('”Et tule.”\n');
    controller.confirmPaste({ source: 'external-ai' });

    expect(first.proposeChanges).toHaveBeenCalledTimes(1);
    const [changes, options] = first.proposeChanges.mock.calls[0];
    expect(options).toEqual({
      rangeId: 'r1',
      meta: { source: 'external-ai', action: 'paste-edits', actionLabel: 'Liitä muokkauksina', instruction: '', provider: null, model: null, requestLogId: null }
    });
    // Offsets inside the captured selection, each with its original
    expect(changes).toEqual([{ from: 0, to: 4, insert: '”Et', original: '”Älä' }, { from: 5, to: 11, insert: 'tule.”', original: 'mene.”' }]);
    expect(first.getSuggestions().pending.map(item => [item.from, item.to, item.original, item.meta.source])).toEqual([
      [11, 15, '”Älä', 'external-ai'],
      [16, 22, 'mene.”', 'external-ai']
    ]);
    expect(env.setSetting).toHaveBeenCalledWith('suggestions.pasteSource', 'external-ai');
    expect(first.text()).toBe(SAMPLE);

    // The answer is used once
    controller.confirmPaste({ source: 'editor' });
    expect(first.proposeChanges).toHaveBeenCalledTimes(1);

    // Accepting them is logged with the source the author named
    controller.acceptAll();
    expect(logged(env)).toEqual([expect.objectContaining({ decision: 'accepted', source: 'external-ai', action: 'paste-edits', actionLabel: 'Liitä muokkauksina', count: 2, model: null })]);
  });

  test('pasteAsEdits hands its finest diff on, so the other words of a change that would delete a tag are proposed (X-27)', () => {
    const real = require('../../src/editor/wordDiff');
    const rawDiff = jest.fn((a, b) => real.wordDiff(a, b, { raw: true }));
    const { controller, env, open } = setup({ deps: { wordDiff: (a, b) => real.wordDiff(a, b), rawDiff, changeRatio: real.changeRatio } });
    const first = open('luku-1');
    // The text came back without the note and the underline, with two words changed
    controller.pasteAsEdits('Hän kuiskasi: ”Älä mene.” – Enkä mennyt, vaikka åkerö on kypsä.');
    expect(rawDiff).toHaveBeenCalled();
    expect(env.openPasteDialog).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'ok', protectedCount: 2, stats: expect.objectContaining({ changeCount: 2 })
    }));
    controller.confirmPaste({ source: 'external-ai' });
    expect(first.getSuggestions().pending.map(item => [item.original, item.insert])).toEqual([['sanoi', 'kuiskasi'], ['oli', 'on']]);
  });

  test('a paste whose chapter closed or changed under the open dialog answers target-changed and proposes nothing (I-04 review)', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    controller.pasteAsEdits(SAMPLE.replace('sanoi', 'kuiskasi'));
    expect(env.openPasteDialog).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'ok' }));

    // Lisää ▸ Uusi luku (or Korttinäkymä) under the dialog: the editor of the target unmounts
    const second = open('luku-2');
    expect(controller.confirmPaste({ source: 'editor' })).toMatchObject({ ok: false, error: 'target-changed' });
    expect(first.proposeChanges).not.toHaveBeenCalled();
    expect(second.proposeChanges).not.toHaveBeenCalled();
    expect(second.getSuggestions().pending).toEqual([]);
    expect(env.setSetting).not.toHaveBeenCalled();
    // Used once; and back in the first chapter nothing comes in either
    expect(controller.confirmPaste({ source: 'editor' })).toBeUndefined();
    const back = open('luku-1');
    expect(back.getSuggestions().pending).toEqual([]);

    // Peruuta of a dropped paste says nothing
    controller.pasteAsEdits(SAMPLE.replace('sanoi', 'kuiskasi'));
    env.editor.unmount();
    env.editor = null;
    expect(controller.confirmPaste(null)).toBeUndefined();

    // Without an unmount (the active chapter moved on): the same answer
    const again = open('luku-1');
    controller.pasteAsEdits(SAMPLE.replace('sanoi', 'kuiskasi'));
    env.activeChapterId = 'luku-3';
    controller.bind(env);
    expect(controller.confirmPaste({ source: 'external-ai' })).toMatchObject({ ok: false, error: 'target-changed' });
    expect(again.proposeChanges).not.toHaveBeenCalled();

    // A new ⌥⌘V after a dropped one starts clean and does not touch the new editor's ranges
    env.activeChapterId = 'luku-1';
    const fresh = open('luku-1');
    controller.pasteAsEdits(SAMPLE.replace('sanoi', 'kuiskasi'));
    open('luku-2');
    const third = open('luku-1');
    controller.pasteAsEdits(SAMPLE.replace('mennyt', 'lähtenyt'));
    expect(third.releaseRange).not.toHaveBeenCalled();
    controller.confirmPaste({ source: 'editor' });
    expect(third.getSuggestions().pending.map(item => [item.original, item.insert])).toEqual([['mennyt,', 'lähtenyt,']]);
    expect(fresh.proposeChanges).not.toHaveBeenCalled();
  });

  test('confirmPaste(null) releases the captured range and proposes nothing', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    controller.pasteAsEdits(SAMPLE.replace('sanoi', 'kuiskasi'));
    expect(first.ranges.size).toBe(1);

    controller.confirmPaste(null);
    expect(first.releaseRange).toHaveBeenCalledWith('r1');
    expect(first.ranges.size).toBe(0);
    expect(first.proposeChanges).not.toHaveBeenCalled();
    expect(env.setSetting).not.toHaveBeenCalled();
    expect(first.getSuggestions().pending).toEqual([]);
  });
});

describe('a throwing host', () => {
  test('the bar and the pending count are published although logDecision throws', () => {
    const { controller, env, open, lastInfo } = setup();
    const first = open('luku-1');
    first.proposeChanges([at(SAMPLE, 'sanoi', 'kuiskasi'), at(SAMPLE, 'mennyt', 'lähtenyt')], { meta: META });
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(2));

    env.logDecision.mockImplementation(() => { throw new Error('levy täynnä'); });
    expect(() => first.acceptSuggestion()).toThrow('levy täynnä');
    expect(controller.pendingTotal()).toBe(1);
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(1));
    expect(lastInfo().pending).toBe(1);
  });

  test('every block handler runs and the bar is published although one handler throws', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    const later = jest.fn();
    controller.onBlockAction(() => { throw new Error('rikki'); });
    controller.onBlockAction(later);
    const started = M.reduce(first.state(), { type: 'blockStart', id: 'b1', pos: 22, meta: META, docText: SAMPLE });
    const finished = M.reduce(started, { type: 'blockFinish', id: 'b1', text: 'Sumu nousi.' });
    env.setInfo.mockClear();

    expect(() => controller.editorProps('luku-1').onSuggestionsChange(M.snapshot(finished), { type: 'block-action', action: 'retry', blockId: 'b1' }))
      .toThrow('rikki');
    expect(later).toHaveBeenCalledTimes(1);
    // The finished draft is pending, and named apart from the suggestions (final pass, T-009)
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(0, 1));
    expect(env.setInfo).toHaveBeenCalled();
  });

  test('confirmDiscard returns a rejected promise when askConfirm throws', async () => {
    const { controller, env, open } = setup();
    open('luku-1').proposeChanges(FOUR, { meta: META });
    env.askConfirm.mockImplementation(() => { throw new Error('ei ikkunaa'); });
    let result;
    expect(() => { result = controller.confirmDiscard(); }).not.toThrow();
    await expect(result).rejects.toThrow('ei ikkunaa');
  });
});

describe('leaving the project', () => {
  test('confirmDiscard resolves true without asking when nothing is pending', async () => {
    const { controller, env, open } = setup();
    await expect(controller.confirmDiscard()).resolves.toBe(true);
    // Rejected suggestions are not pending
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });
    first.rejectGroup();
    await expect(controller.confirmDiscard()).resolves.toBe(true);
    expect(env.askConfirm).not.toHaveBeenCalled();
  });

  test('confirmDiscard asks with the count and resolves the answer', async () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });
    open('luku-2').proposeChanges([at(OTHER, 'Sade', 'Sumu')], { meta: META });

    env.askConfirm.mockResolvedValueOnce(false);
    await expect(controller.confirmDiscard()).resolves.toBe(false);
    expect(env.askConfirm).toHaveBeenCalledWith(
      'Hylätäänkö käsittelemättömät ehdotukset?',
      'Käsikirjoituksessa on 5 käsittelemätöntä ehdotusta. Ne eivät säily, kun projekti vaihtuu. Käsikirjoituksen tekstiä ne eivät ole muuttaneet.',
      'Hylkää ehdotukset',
      'Palaa ehdotuksiin'
    );
    await expect(controller.confirmDiscard()).resolves.toBe(true);

    // One suggestion: the singular
    open('luku-1').rejectGroup();
    env.askConfirm.mockReturnValueOnce(true);       // a plain value instead of a promise
    await expect(controller.confirmDiscard()).resolves.toBe(true);
    expect(env.askConfirm.mock.calls[2][1]).toBe(
      'Käsikirjoituksessa on 1 käsittelemätön ehdotus. Se ei säily, kun projekti vaihtuu. Käsikirjoituksen tekstiä se ei ole muuttanut.'
    );
  });

  test('reset clears the records and reports 0', () => {
    const { controller, env, open } = setup();
    open('luku-1').proposeChanges(FOUR, { meta: META });
    const second = open('luku-2');
    second.proposeChanges([at(OTHER, 'Sade', 'Sumu')], { meta: META });
    controller.afterHistory('undo', { chapterId: 'luku-3', oldContent: 'a', newContent: 'b', meta: null });
    controller.closeBar();
    expect(controller.pendingTotal()).toBe(5);

    controller.reset();
    expect(controller.pendingTotal()).toBe(0);
    expect(controller.pendingByChapter()).toEqual([]);
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(0));
    expect(env.setInfo).toHaveBeenLastCalledWith(null);
    // Records, the stored reveal position and the closed flag are gone
    expect(controller.editorProps('luku-1').suggestionSeed(SAMPLE)).toEqual({ state: null, revealPos: null });
    expect(controller.editorProps('luku-3').suggestionSeed('b')).toEqual({ state: null, revealPos: null });
    controller.editorProps('luku-2').onSuggestionsChange(M.snapshot(M.createState()), { type: 'seeded' });
    expect(env.setInfo.mock.calls[env.setInfo.mock.calls.length - 1][0]).toMatchObject({ chapterId: 'luku-2', closed: false, pending: 0, elsewhere: [] });
  });

  test('an unmount event from an editor created before reset is ignored and the pending count stays 0', () => {
    const { controller, env, open } = setup();
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });
    const oldProps = controller.editorProps('luku-1');
    expect(controller.pendingTotal()).toBe(4);

    // Tiedosto → Avaa: the controller is reset first, the old editor unmounts one commit later
    controller.reset();
    env.reportPending.mockClear();
    env.logDecision.mockClear();
    first.unmount();
    expect(controller.pendingTotal()).toBe(0);
    expect(controller.pendingByChapter()).toEqual([]);
    expect(env.reportPending).not.toHaveBeenCalled();

    // Nothing else of the old editor gets through either
    first.acceptSuggestion();
    first.rejectSuggestion();
    expect(env.logDecision).not.toHaveBeenCalled();
    expect(env.setInfo).toHaveBeenLastCalledWith(null);
    expect(controller.editorProps('luku-1')).not.toBe(oldProps);
    expect(oldProps.suggestionSeed(SAMPLE)).toEqual({ state: null, revealPos: null });
  });

  test('after reset the seed of a chapter with the same id is empty', () => {
    const { controller, env, open } = setup();
    open('luku-1').proposeChanges(FOUR, { meta: META });
    open('luku-2');
    expect(controller.pendingTotal()).toBe(4);

    controller.reset();
    env.editor.unmount();
    env.editor = null;
    // The next project also has a chapter called luku-1, even with the same text
    const fresh = open('luku-1');
    expect(fresh.seed).toEqual({ state: null, revealPos: null });
    expect(fresh.getSuggestions()).toMatchObject({ pending: [], rejected: [] });
    expect(controller.pendingTotal()).toBe(0);
    // And it works like any editor from here on
    fresh.proposeChanges([at(SAMPLE, 'sanoi', 'kuiskasi')], { meta: META });
    expect(controller.pendingTotal()).toBe(1);
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(1));
  });

  test('bind forgets the records of deleted chapters', () => {
    const { controller, env, chapters, open } = setup();
    open('luku-1').proposeChanges(FOUR, { meta: META });
    open('luku-3').proposeChanges([{ from: 0, to: 6, insert: 'Neljäs', original: 'Kolmas' }], { meta: META });
    open('luku-2');
    expect(controller.pendingByChapter().map(entry => entry.chapterId)).toEqual(['luku-1', 'luku-3']);

    // The first chapter is deleted
    env.chapters = chapters.slice(1);
    controller.bind(env);
    expect(controller.pendingByChapter()).toEqual([{ chapterId: 'luku-3', count: 1, blocks: 0 }]);
    expect(controller.editorProps('luku-1').suggestionSeed(SAMPLE)).toEqual({ state: null, revealPos: null });

    // A chapter nested under another one is still a chapter
    env.chapters = [{ id: 'osa-1', title: 'Osa', content: '', children: chapters.slice(1) }];
    controller.bind(env);
    expect(controller.pendingByChapter()).toEqual([{ chapterId: 'luku-3', count: 1, blocks: 0 }]);
  });

  test('bind reports the total again after it forgets a record', () => {
    const { controller, env, chapters, open, lastInfo } = setup();
    open('luku-1').proposeChanges(FOUR, { meta: META });
    open('luku-2');
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(4));
    expect(lastInfo().elsewhere).toHaveLength(1);
    const reports = env.reportPending.mock.calls.length;

    // A render that changes nothing reports nothing
    controller.bind(env);
    expect(env.reportPending).toHaveBeenCalledTimes(reports);

    env.chapters = chapters.slice(1);
    controller.bind(env);
    expect(env.reportPending).toHaveBeenCalledTimes(reports + 1);
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(0));
    expect(lastInfo().elsewhere).toEqual([]);
  });

  test('the editor of a deleted chapter does not store its suggestions when it unmounts', () => {
    const { controller, env, chapters, open } = setup();
    const first = open('luku-1');
    first.proposeChanges(FOUR, { meta: META });
    // The open chapter is deleted: the render binds the new list, then the editor unmounts
    env.chapters = chapters.slice(1);
    env.activeChapterId = 'luku-2';
    controller.bind(env);
    first.unmount();
    env.editor = null;
    expect(controller.pendingTotal()).toBe(0);
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(0));
  });
});

describe('features', () => {
  test('a block-action event reaches the handler registered with onBlockAction', () => {
    const { controller, open } = setup();
    const first = open('luku-1');
    const handler = jest.fn();
    const off = controller.onBlockAction(handler);

    const started = M.reduce(first.state(), { type: 'blockStart', id: 'b1', pos: 22, meta: META, docText: SAMPLE });
    const shot = M.snapshot(started);
    controller.editorProps('luku-1').onSuggestionsChange(shot, { type: 'block-action', action: 'stop', blockId: 'b1' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('stop', shot.block, 'luku-1');
    expect(shot.block).toMatchObject({ id: 'b1', status: 'streaming' });

    controller.editorProps('luku-1').onSuggestionsChange(shot, { type: 'block-action', action: 'retry', blockId: 'b1' });
    expect(handler).toHaveBeenLastCalledWith('retry', shot.block, 'luku-1');

    off();
    controller.editorProps('luku-1').onSuggestionsChange(shot, { type: 'block-action', action: 'stop', blockId: 'b1' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  test('propose for the open chapter goes to the editor with the same options', () => {
    const { controller, open } = setup();
    const first = open('luku-1');
    const options = { baseText: SAMPLE, groupId: 'ajo', meta: META };
    const result = controller.propose('luku-1', FOUR, options);
    expect(first.proposeChanges).toHaveBeenCalledWith(FOUR, options);
    expect(result).toMatchObject({ ok: true, groupId: 'ajo' });
    expect(result.ids).toHaveLength(4);
  });

  test('propose for a closed chapter with CRLF text keeps the offsets of the baseText it was given', () => {
    const { controller, chapters, open } = setup();
    const crlf = 'Eka rivi.\r\nToka rivi.\r\nHän sanoi jotain.';
    chapters[1].content = crlf;
    open('luku-1');

    // Computed on the chapter's own string, as rule 15 says
    const withOriginal = controller.propose('luku-2', [at(crlf, 'sanoi', 'kuiskasi')], { baseText: crlf, meta: META });
    expect(withOriginal).toMatchObject({ ok: true, skipped: [] });
    const withoutOriginal = controller.propose('luku-2', [{ from: crlf.indexOf('jotain'), to: crlf.indexOf('jotain') + 6, insert: 'jotakin' }], { baseText: crlf, meta: META });
    expect(withoutOriginal).toMatchObject({ ok: true, skipped: [] });

    const lf = crlf.replace(/\r\n/g, '\n');
    const second = open('luku-2', lf);
    const words = second.getSuggestions().pending.map(item => [lf.slice(item.from, item.to), item.insert]);
    expect(words).toEqual([['sanoi', 'kuiskasi'], ['jotain', 'jotakin']]);
  });

  test('propose for a closed chapter rebases from baseText onto the chapter\'s current text', () => {
    const { controller, env, chapters, open, lastInfo } = setup();
    // A run started in the second chapter; the author went on to the first one and the
    // second chapter's text changed meanwhile (an accepted comma, a rewritten word)
    const base = 'Hän sanoi että käy ulos koska sataa. Sitten hän otti sateen varjon mukaan.';
    const now = 'Hän sanoi, että käy ulos koska sataa. Sitten hän otti sateenvarjon mukaan.';
    chapters[1].content = now;
    const first = open('luku-1');
    first.proposeChanges.mockClear();

    const comma2 = { from: base.indexOf(' koska'), to: base.indexOf(' koska'), insert: ',' };
    const result = controller.propose('luku-2', [
      at(base, 'sateen varjon', 'sateenvarjon'),
      comma2,
      at(base, 'otti', 'nappasi')
    ], { baseText: base, groupId: 'ajo', meta: META });

    expect(first.proposeChanges).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, groupId: 'ajo', skipped: [{ index: 0, reason: 'target-changed' }] });
    expect(result.ids).toHaveLength(2);
    expect(controller.pendingByChapter()).toEqual([{ chapterId: 'luku-2', count: 2, blocks: 0 }]);
    expect(lastInfo().elsewhere).toEqual([{ chapterId: 'luku-2', title: 'Toinen luku', count: 2, blocks: 0 }]);
    expect(env.reportPending).toHaveBeenLastCalledWith(reported(2));

    // When the chapter opens, the suggestions sit on the same words of its current text
    const second = open('luku-2', now);
    const [comma, word] = second.getSuggestions().pending;
    expect(now.slice(comma.from - 4, comma.from + 6)).toBe('ulos koska');
    expect(comma).toMatchObject({ from: comma.to, insert: ',', groupId: 'ajo', meta: META });
    expect(now.slice(word.from, word.to)).toBe('otti');

    // A second batch of the same run appends to the group in the record
    open('luku-1');
    const more = controller.propose('luku-2', [at(base, 'Sitten', 'Silloin')], { baseText: base, groupId: 'ajo', meta: META });
    expect(more).toMatchObject({ ok: true, groupId: 'ajo' });
    expect(controller.pendingByChapter()).toEqual([{ chapterId: 'luku-2', count: 3, blocks: 0 }]);

    // A chapter that no longer exists, and a batch of which nothing survives
    expect(controller.propose('ei-ole', [at(base, 'Hän', 'Hon')], { baseText: base })).toEqual({ ok: false, groupId: null, ids: [], skipped: [], error: 'target-changed' });
    expect(controller.propose('luku-2', [at(base, 'sateen varjon', 'sateenvarjon')], { baseText: base }))
      .toEqual({ ok: false, groupId: null, ids: [], skipped: [{ index: 0, reason: 'target-changed' }], error: 'no-changes' });
  });
});

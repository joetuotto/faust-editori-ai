// The suggestion extension against a real EditorView (jsdom). CodeMirror comes
// from its CommonJS build here, in the test only; the core itself never loads it.
const state = require('@codemirror/state');
const view = require('@codemirror/view');
const { createSuggestionKit } = require('../../src/editor/suggestionsCore');
const M = require('../../src/editor/suggestionModel');

const kit = createSuggestionKit({ ...state, ...view });
const External = state.Annotation.define();

// jsdom has no layout: give the measuring code something to read
if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => [];
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
}

const SAMPLE = 'Hän sanoi: ”Älä mene.” – Enkä mennyt, vaikka åkerö [TODO: tarkista] oli <u>kypsä</u>.';
const REVISED = 'Hän taas kuiskasi: ”Älä mene.” – Enkä lähtenyt, vaikka Åkerö [TODO: tarkista] oli <u>kypsä</u>.';
const META = { source: 'faust', action: 'quick-edit', actionLabel: 'Tiivistä', instruction: '', provider: 'cherry', model: 'c91f:kimi-k2', requestLogId: 'r1' };

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
  const close = () => { if (open) { changes.push(open); open = null; } };
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

const mounted = [];

function mount(doc = SAMPLE, config = {}) {
  const updates = [];
  const v = new view.EditorView({
    parent: document.body,
    state: state.EditorState.create({
      doc,
      extensions: [
        kit.suggestionExtension({ external: External, diff, ...config }),
        view.EditorView.updateListener.of(update => updates.push(update))
      ]
    })
  });
  kit.installSuggestionFacade(v, v.scrollDOM);
  mounted.push(v);
  return {
    v,
    el: v.scrollDOM,
    updates,
    text: () => v.state.doc.toString(),
    events: () => updates.flatMap(update => kit.suggestionEvents(update)),
    docChanges: () => updates.filter(update => update.docChanged).length
  };
}

// The way FaustEditor mirrors a change made outside the editor: one range, marked External
function external(v, nextText) {
  const change = M.singleChange(v.state.doc.toString(), nextText);
  if (change) v.dispatch({ changes: change, annotations: External.of(true) });
}

const typeAt = (v, pos, text) => v.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length }, userEvent: 'input.type' });
const key = (v, init) => view.runScopeHandlers(v, new KeyboardEvent('keydown', init), 'editor');
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
const ids = (el) => el.getSuggestions().pending.map(item => item.id);
const idOf = (el, original) => el.getSuggestions().pending.find(item => item.original === original).id;

afterEach(() => {
  while (mounted.length) mounted.pop().destroy();
  document.body.innerHTML = '';
});

describe('proposing and deciding', () => {
  test('propose then accept puts the revised text into the document in one transaction', () => {
    const { v, el, text, updates, docChanges } = mount();
    const result = el.proposeChanges(FOUR, { meta: META });
    expect(result).toMatchObject({ ok: true, skipped: [] });
    expect(result.ids).toHaveLength(4);
    expect(text()).toBe(SAMPLE);
    expect(docChanges()).toBe(0);

    expect(el.acceptGroup()).toBe(4);
    expect(text()).toBe(REVISED);
    // One transaction, one document change, one undo step
    expect(docChanges()).toBe(1);
    const accepting = updates.filter(update => update.docChanged)[0];
    expect(accepting.transactions).toHaveLength(1);
    expect(accepting.transactions[0].isUserEvent('input.suggestion')).toBe(true);
    const meta = kit.readSuggestionMeta(accepting);
    expect(meta.noMerge).toBe(true);
    expect(meta.suggestions.ids).toEqual(result.ids);
    // The stored items describe the text before the accept
    meta.suggestions.items.forEach(item => expect(SAMPLE.slice(item.from, item.to)).toBe(item.original));
    expect(el.getSuggestions().pending).toEqual([]);
    expect(kit.readSuggestionMeta(updates[0])).toBeUndefined();
    expect(v.state.field(kit.suggestionField).items).toEqual([]);
  });

  test('accepting one suggestion at a time moves the caret to the next one', () => {
    const { v, el, text } = mount();
    el.proposeChanges(FOUR, { meta: META });
    expect(el.getSuggestions().currentIndex).toBe(0);

    expect(el.acceptSuggestion()).toBe(true);
    expect(text()).toBe('Hän taas sanoi: ”Älä mene.” – Enkä mennyt, vaikka åkerö [TODO: tarkista] oli <u>kypsä</u>.');
    const next = el.getSuggestions();
    expect(next.pending.map(item => item.original)).toEqual(['sanoi', 'mennyt', 'åkerö']);
    expect(next.currentIndex).toBe(0);
    expect(v.state.selection.main.head).toBe(next.pending[0].from);

    // By id, out of order
    expect(el.acceptSuggestion(idOf(el, 'åkerö'))).toBe(true);
    expect(text()).toContain('Åkerö');
    expect(el.acceptSuggestion('ei-ole')).toBe(false);

    el.acceptSuggestion();
    el.acceptSuggestion();
    expect(text()).toBe(REVISED);
    // Nothing left: the caret stands right after the last inserted text
    expect(v.state.selection.main.head).toBe(REVISED.indexOf('lähtenyt') + 'lähtenyt'.length);
    expect(el.acceptSuggestion()).toBe(false);
  });

  test('reject leaves the document unchanged', () => {
    const { el, text, docChanges, events } = mount();
    el.proposeChanges(FOUR, { meta: META });
    expect(el.rejectSuggestion()).toBe(true);
    expect(el.rejectSuggestion(idOf(el, 'mennyt'))).toBe(true);
    expect(el.getSuggestions().pending.map(item => item.original)).toEqual(['sanoi', 'åkerö']);
    expect(el.rejectGroup()).toBe(2);
    expect(el.rejectGroup()).toBe(0);

    expect(text()).toBe(SAMPLE);
    expect(docChanges()).toBe(0);
    expect(el.getSuggestions().rejected).toHaveLength(4);
    expect(events().filter(event => event.type === 'rejected').map(event => [event.ids.length, event.bulk, event.reason]))
      .toEqual([[1, false, 'user'], [1, false, 'user'], [2, true, 'user']]);

    expect(el.restoreRejected()).toEqual({ restored: 4, failed: 0 });
    expect(el.getSuggestions().pending).toHaveLength(4);
    expect(el.restoreRejected()).toEqual({ restored: 0, failed: 0 });
    expect(text()).toBe(SAMPLE);
  });

  test('nothing changes the document without an accept', () => {
    const { v, el, text, docChanges } = mount();
    const same = () => { expect(text()).toBe(SAMPLE); expect(el.value === undefined || el.value === SAMPLE).toBe(true); };

    el.proposeChanges(FOUR, { meta: META });
    same();
    el.stepSuggestion(1);
    el.stepSuggestion(-1);
    same();
    for (const mode of ['original', 'new', 'changes']) {
      el.setSuggestionView(mode);
      expect(el.getSuggestions().viewMode).toBe(mode);
      same();
    }
    el.rejectSuggestion();
    el.rejectGroup();
    same();
    el.restoreRejected();
    same();
    const target = el.captureRange(11, 22, { highlight: true });
    el.setRangeHighlight(target.rangeId, false);
    el.releaseRange(target.rangeId);
    same();
    el.removeSuggestions([idOf(el, 'mennyt')]);
    same();

    const block = el.startInsertBlock({ pos: 22, meta: META });
    expect(block.ok).toBe(true);
    el.appendInsertBlock(block.blockId, 'Sumu nousi. ');
    el.finishInsertBlock(block.blockId, { status: 'done', text: 'Sumu nousi.' });
    same();
    el.retryInsertBlock(block.blockId);
    el.finishInsertBlock(block.blockId, { status: 'stopped', text: 'Toinen yritys.' });
    el.showInsertBlockAttempt(block.blockId, 0);
    same();
    el.rejectInsertBlock(block.blockId);
    el.clearSuggestionNotice();
    el.revealPos(40);
    el.flushQueuedSuggestions(true);
    same();

    expect(docChanges()).toBe(0);
    // The inserted texts are on screen, but as widgets, never as document text
    el.restoreRejected();
    expect(v.contentDOM.textContent).toContain('kuiskasi');
    same();
  });

  test('accept, the inverse change as an external transaction, then a restore proposal bring the suggestion back', () => {
    const { v, el, text, updates } = mount();
    el.proposeChanges(FOUR, { meta: META });
    const sanoi = el.getSuggestions().pending.find(item => item.original === 'sanoi');
    el.acceptSuggestion(sanoi.id);
    const accepted = text();
    expect(accepted).toBe(SAMPLE.replace('sanoi', 'kuiskasi'));
    const stored = kit.readSuggestionMeta(updates.filter(update => update.docChanged)[0]).suggestions;
    expect(stored.ids).toEqual([sanoi.id]);

    // Cmd+Z: the app asks for the suggestions back first, then React mirrors the old text
    const queued = el.proposeChanges(stored.items, { restore: true, whenText: SAMPLE });
    expect(queued).toEqual({ ok: true, queued: true, groupId: null, ids: [], skipped: [] });
    expect(ids(el)).not.toContain(sanoi.id);

    external(v, SAMPLE);
    el.flushQueuedSuggestions(true);
    expect(text()).toBe(SAMPLE);
    const back = el.getSuggestions();
    expect(back.pending.map(item => item.original)).toEqual(['', 'sanoi', 'mennyt', 'åkerö']);
    expect(back.pending[1]).toMatchObject({ id: sanoi.id, from: 4, to: 9, insert: 'kuiskasi', meta: META });
    expect(back.currentId).toBe(sanoi.id);
    back.pending.forEach(item => expect(M.stillMatches(SAMPLE, item)).toBe(true));

    // And it can be accepted again, as the redo would find it
    expect(el.acceptSuggestion(sanoi.id)).toBe(true);
    expect(text()).toBe(accepted);
  });

  test('a restore proposal for a text that is already there is applied at once', () => {
    const { v, el, updates } = mount();
    el.proposeChanges([at(SAMPLE, 'sanoi', 'kuiskasi')], { meta: META });
    el.acceptSuggestion();
    const stored = kit.readSuggestionMeta(updates.filter(update => update.docChanged)[0]).suggestions;
    external(v, SAMPLE);
    const result = el.proposeChanges(stored.items, { restore: true, whenText: SAMPLE });
    expect(result).toMatchObject({ ok: true, ids: stored.ids });
    expect(result.queued).toBeUndefined();
    expect(el.getSuggestions().pending[0]).toMatchObject({ id: stored.ids[0], from: 4, to: 9 });
  });

  test('a queued proposal is dropped when the author types first, and after two seconds', () => {
    jest.useFakeTimers();
    try {
      const { v, el } = mount();
      const item = M.createSuggestions(SAMPLE.replace('sanoi', 'sanoo'), [{ from: 4, to: 9, insert: 'kuiskasi' }], { groupId: 'g' }).items[0];
      const awaited = SAMPLE.replace('sanoi', 'sanoo');

      // The author types before the awaited text arrives
      expect(el.proposeChanges([item], { restore: true, whenText: awaited }).queued).toBe(true);
      typeAt(v, SAMPLE.length, '!');
      el.flushQueuedSuggestions(false);
      external(v, awaited);
      el.flushQueuedSuggestions(true);
      expect(el.getSuggestions().pending).toEqual([]);

      // An external change that is not the awaited one keeps the entry; time gives it up
      external(v, SAMPLE);
      expect(el.proposeChanges([item], { restore: true, whenText: awaited }).queued).toBe(true);
      external(v, SAMPLE + ' Loppu.');
      el.flushQueuedSuggestions(true);
      expect(el.getSuggestions().pending).toEqual([]);
      jest.advanceTimersByTime(2001);
      external(v, awaited);
      el.flushQueuedSuggestions(true);
      expect(el.getSuggestions().pending).toEqual([]);

      // Within the two seconds it goes through
      external(v, SAMPLE);
      el.proposeChanges([item], { restore: true, whenText: awaited });
      jest.advanceTimersByTime(1500);
      external(v, awaited);
      el.flushQueuedSuggestions();
      expect(el.getSuggestions().pending.map(entry => entry.id)).toEqual([item.id]);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a captured range that is no longer intact gives target-changed and proposes nothing', () => {
    const { v, el, text } = mount();
    const sentence = '”Älä mene.”';
    v.dispatch({ selection: { anchor: 11, head: 22 } });
    const target = el.captureSelection({ highlight: true });
    expect(target).toMatchObject({ from: 11, to: 22, text: sentence, fallbackUsed: false });
    expect(el.getRange(target.rangeId)).toEqual({ from: 11, to: 22, text: sentence, intact: true });

    // Typing in front moves the range and leaves it intact
    typeAt(v, 0, 'Ja ');
    expect(el.getRange(target.rangeId)).toEqual({ from: 14, to: 25, text: sentence, intact: true });

    // Typing inside changes the target
    typeAt(v, 18, 'X');
    expect(el.getRange(target.rangeId)).toMatchObject({ from: 14, to: 26, intact: false });
    const before = text();
    const result = el.proposeChanges([{ from: 1, to: 4, insert: 'Et', original: 'Älä' }], { rangeId: target.rangeId, meta: META });
    expect(result).toEqual({ ok: false, groupId: null, ids: [], skipped: [], error: 'target-changed' });
    expect(el.getSuggestions().pending).toEqual([]);
    expect(text()).toBe(before);
    // The range was not asked to be kept, so it is released
    expect(el.getRange(target.rangeId)).toBeNull();
    expect(el.proposeChanges([], { rangeId: 'ei-ole' }).error).toBe('target-changed');
  });

  test('offsets relative to an intact captured range land on the right words after typing in front', () => {
    const { v, el, text } = mount();
    const target = el.captureRange(11, 22, { highlight: true });
    typeAt(v, 0, 'Ja sitten ');
    // Offsets inside "”Älä mene.”"
    const result = el.proposeChanges([
      { from: 1, to: 4, insert: 'Et', original: 'Älä' },
      { from: 5, to: 9, insert: 'tule', original: 'mene' }
    ], { rangeId: target.rangeId, keepRange: true, meta: META });
    expect(result.ok).toBe(true);
    expect(el.getSuggestions().pending.map(item => [item.original, text().slice(item.from, item.to)])).toEqual([['Älä', 'Älä'], ['mene', 'mene']]);
    expect(el.getRange(target.rangeId)).toMatchObject({ from: 21, to: 32, intact: true });

    // Another attempt for the same target swaps the group
    const second = el.proposeChanges([{ from: 1, to: 4, insert: 'Ethän', original: 'Älä' }], {
      rangeId: target.rangeId, replaceGroupId: result.groupId, meta: META
    });
    expect(second.ok).toBe(true);
    expect(el.getSuggestions().pending.map(item => item.insert)).toEqual(['Ethän']);
    expect(el.getSuggestions().rejected).toEqual([]);
    expect(el.getRange(target.rangeId)).toBeNull();
  });

  test('changes proposed with a baseText land on the same words after an earlier accept', () => {
    // Two commas are missing and a compound is written apart. The commas are close:
    // the place of the first one lies inside the 16 characters stored around the second.
    const T0 = 'Hän sanoi että käy ulos koska sataa. Sitten hän otti sateen varjon mukaan.';
    const comma1 = { from: T0.indexOf(' että'), to: T0.indexOf(' että'), insert: ',' };
    const comma2 = { from: T0.indexOf(' koska'), to: T0.indexOf(' koska'), insert: ',' };
    const compound = at(T0, 'sateen varjon', 'sateenvarjon');
    const { el, text } = mount(T0);

    expect(el.proposeChanges([comma1], { baseText: T0, groupId: 'ajo', meta: META }).ok).toBe(true);
    expect(el.acceptSuggestion()).toBe(true);
    const T1 = text();
    expect(T1).toBe('Hän sanoi, että käy ulos koska sataa. Sitten hän otti sateen varjon mukaan.');

    // The rest of the run was computed on T0 and says so
    const result = el.proposeChanges([comma2, compound], { baseText: T0, groupId: 'ajo', meta: META });
    expect(result).toMatchObject({ ok: true, groupId: 'ajo', skipped: [] });
    const [comma, word] = el.getSuggestions().pending;
    expect(comma).toMatchObject({ from: comma.to, insert: ',' });
    expect(T1.slice(comma.from - 4, comma.from)).toBe('ulos');
    expect(T1.slice(comma.from, comma.from + 6)).toBe(' koska');
    expect(T1.slice(word.from, word.to)).toBe('sateen varjon');
    expect(word).toMatchObject({ original: 'sateen varjon', insert: 'sateenvarjon' });

    expect(el.acceptGroup('ajo')).toBe(2);
    expect(text()).toBe('Hän sanoi, että käy ulos, koska sataa. Sitten hän otti sateenvarjon mukaan.');
  });

  test('a baseText change whose place was edited is skipped as target-changed', () => {
    const T0 = 'Hän sanoi että käy ulos koska sataa. Sitten hän otti sateen varjon mukaan.';
    const { v, el, text } = mount(T0);
    // The author rewrites the compound by hand while the run is still going
    const start = T0.indexOf('sateen varjon');
    v.dispatch({ changes: { from: start, to: start + 13, insert: 'varjon' } });
    const now = text();

    const comma2 = { from: T0.indexOf(' koska'), to: T0.indexOf(' koska'), insert: ',' };
    const result = el.proposeChanges([at(T0, 'sateen varjon', 'sateenvarjon'), comma2, at(T0, 'Hän', 'Hän')], { baseText: T0, meta: META });
    expect(result.ok).toBe(true);
    expect(result.skipped).toEqual([{ index: 0, reason: 'target-changed' }, { index: 2, reason: 'noop' }]);
    expect(el.getSuggestions().pending).toHaveLength(1);
    expect(now.slice(el.getSuggestions().pending[0].from).startsWith(' koska')).toBe(true);

    // When nothing survives, the call says so and the document is untouched
    const none = el.proposeChanges([at(T0, 'sateen varjon', 'sateenvarjon')], { baseText: T0, meta: META });
    expect(none).toEqual({ ok: false, groupId: null, ids: [], skipped: [{ index: 0, reason: 'target-changed' }], error: 'no-changes' });
    expect(text()).toBe(now);
  });

  test('a change whose original no longer matches is skipped as mismatch, and a second proposal in the same place as conflict', () => {
    const { el } = mount();
    const result = el.proposeChanges([
      { from: 4, to: 9, insert: 'kuiskasi', original: 'sanoo' },
      at(SAMPLE, 'mennyt', 'lähtenyt')
    ], { meta: META });
    expect(result.skipped).toEqual([{ index: 0, reason: 'mismatch' }]);
    expect(el.getSuggestions().notice).toEqual({ kind: 'skipped', count: 1 });

    const again = el.proposeChanges([at(SAMPLE, 'mennyt', 'tullut')], { meta: META });
    expect(again).toMatchObject({ ok: false, error: 'no-changes', skipped: [{ index: 0, reason: 'conflict' }] });

    // The groupId of a pending group appends to it
    const more = el.proposeChanges([at(SAMPLE, 'åkerö', 'Åkerö')], { groupId: result.groupId, meta: META });
    expect(more.groupId).toBe(result.groupId);
    expect(el.getSuggestions().pending.map(item => item.groupId)).toEqual([result.groupId, result.groupId]);
  });

  test('acceptGroup leaves a suggestion whose meta.dialogue is true pending', () => {
    const { el, text } = mount();
    el.proposeChanges([
      at(SAMPLE, 'sanoi', 'kuiskasi'),
      at(SAMPLE, 'Älä', 'Et', { meta: { ...META, dialogue: true } }),
      at(SAMPLE, 'mennyt', 'lähtenyt')
    ], { groupId: 'ajo', meta: META });

    expect(el.acceptGroup('ajo')).toBe(2);
    expect(text()).toBe(SAMPLE.replace('sanoi', 'kuiskasi').replace('mennyt', 'lähtenyt'));
    const left = el.getSuggestions();
    expect(left.pending.map(item => item.original)).toEqual(['Älä']);
    expect(left.currentId).toBe(left.pending[0].id);
    // Again: nothing more is taken, with or without the group id
    expect(el.acceptGroup('ajo')).toBe(0);
    expect(el.acceptGroup()).toBe(0);
    expect(text()).toContain('”Älä mene.”');

    // One at a time it goes through
    expect(el.acceptSuggestion()).toBe(true);
    expect(text()).toContain('”Et mene.”');
  });
});

describe('edits while suggestions are pending', () => {
  test('typing inside a suggestion drops it, and the undo of that typing brings it back', () => {
    const { v, el, events } = mount();
    el.proposeChanges(FOUR, { meta: META });
    const mennyt = idOf(el, 'mennyt');

    typeAt(v, 32, 'X');
    expect(el.getSuggestions().pending.map(item => item.original)).toEqual(['', 'sanoi', 'åkerö']);
    expect(el.getSuggestions().notice).toEqual({ kind: 'dropped-edit', count: 1 });
    expect(events().filter(event => event.type === 'dropped')).toEqual([{ type: 'dropped', ids: [mennyt], reason: 'edited' }]);

    external(v, SAMPLE);
    const back = el.getSuggestions();
    expect(back.pending.map(item => item.id)).toContain(mennyt);
    expect(back.pending).toHaveLength(4);
    back.pending.forEach(item => expect(M.stillMatches(SAMPLE, item)).toBe(true));
  });

  // An edit by the author, then its undo mirrored as an external change: the text is back exactly
  const UNDO_TEXT = 'Hän sanoi että käy ulos koska sataa.\n\nSitten hän otti sateen varjon mukaan ja lähti.';
  const UNDO_CHANGES = [
    { from: 4, to: 9, insert: 'kuiskasi', original: 'sanoi' },
    { from: 23, to: 23, insert: ',' },
    { from: 54, to: 67, insert: 'sateenvarjon', original: 'sateen varjon' }
  ];
  test.each([
    ['type a letter inside "sanoi"', { from: 6, insert: 'x' }],
    ['delete the word "sanoi"', { from: 4, to: 9 }],
    ['cut the first paragraph', { from: 0, to: 36 }],
    ['select all and type one letter', { from: 0, to: UNDO_TEXT.length, insert: 'a' }],
    ['Backspace over the character behind the comma position', { from: 23, to: 24 }]
  ])('%s, then undo: the suggestions it dropped are pending again on their words', (label, change) => {
    const { v, el, text } = mount(UNDO_TEXT);
    el.proposeChanges(UNDO_CHANGES, { meta: META });
    const proposed = el.getSuggestions().pending.map(item => [item.id, item.from, item.to]);

    const tr = v.state.update({ changes: change, userEvent: 'input.type' });
    v.dispatch(tr);
    expect(el.getSuggestions().pending.length).toBeLessThan(3);

    v.dispatch({ changes: tr.changes.invert(tr.startState.doc), annotations: External.of(true) });
    expect(text()).toBe(UNDO_TEXT);
    const back = el.getSuggestions();
    expect(back.pending.map(item => [item.id, item.from, item.to])).toEqual(proposed);
    expect(back.rejected).toEqual([]);
    back.pending.forEach(item => expect(M.stillMatches(UNDO_TEXT, item)).toBe(true));
  });

  test('a paste over a suggestion and more, then an undo mirrored as one range next to it: the suggestion is pending again', () => {
    const { v, el, text } = mount(UNDO_TEXT);
    el.proposeChanges(UNDO_CHANGES, { meta: META });
    const proposed = el.getSuggestions().pending.map(item => [item.id, item.from, item.to]);
    // "sateen varjon mukaan" pasted over with "sateenvarjon": the suggestion's range collapses to 54
    v.dispatch({ changes: { from: 54, to: 74, insert: 'sateenvarjon' }, userEvent: 'input.paste' });
    expect(el.getSuggestions().rejected).toMatchObject([{ from: 54, to: 54, reason: 'edited' }]);

    // The mirrored undo is the smallest range, " varjon mukaa" behind "sateen": it does not touch 54
    expect(M.singleChange(text(), UNDO_TEXT)).toEqual({ from: 60, to: 65, insert: ' varjon mukaa' });
    external(v, UNDO_TEXT);
    expect(el.getSuggestions().pending.map(item => [item.id, item.from, item.to])).toEqual(proposed);
    expect(el.getSuggestions().rejected).toEqual([]);
  });

  test('a suggestion rejected by the author keeps its place through an edit and its undo, for Palauta hylätyt', () => {
    const { v, el } = mount(UNDO_TEXT);
    el.proposeChanges(UNDO_CHANGES, { meta: META });
    el.rejectGroup();

    const tr = v.state.update({ changes: { from: 4, to: 9 }, userEvent: 'delete' });
    v.dispatch(tr);
    v.dispatch({ changes: tr.changes.invert(tr.startState.doc), annotations: External.of(true) });
    // Rejected by the author: it does not come back by itself
    expect(el.getSuggestions().pending).toEqual([]);
    expect(el.restoreRejected()).toEqual({ restored: 3, failed: 0 });
    expect(el.getSuggestions().pending.map(item => [item.from, item.to])).toEqual([[4, 9], [23, 23], [54, 67]]);
  });

  test('an external change elsewhere moves the suggestions without dropping any', () => {
    const { v, el, text } = mount();
    el.proposeChanges(FOUR, { meta: META });
    external(v, 'Niin. ' + SAMPLE);
    expect(el.getSuggestions().pending).toHaveLength(4);
    el.getSuggestions().pending.forEach(item => expect(text().slice(item.from, item.to)).toBe(item.original));

    // One mirrored range around all four: the word diff keeps the ones whose words are untouched
    external(v, text().replace('Niin.', 'Näin.').replace('kypsä', 'raaka'));
    expect(el.getSuggestions().pending.map(item => item.original)).toEqual(['', 'sanoi', 'mennyt', 'åkerö']);
    external(v, text().replace('mennyt', 'tullut'));
    expect(el.getSuggestions().pending.map(item => item.original)).toEqual(['', 'sanoi', 'åkerö']);
    expect(el.getSuggestions().notice).toEqual({ kind: 'dropped-external', count: 1 });
    expect(el.restoreRejected()).toEqual({ restored: 0, failed: 1 });
  });

  test('the caret inside a suggestion makes it current, and stepping moves the caret', () => {
    const { v, el } = mount();
    el.proposeChanges(FOUR, { meta: META });
    v.dispatch({ selection: { anchor: 33 } });
    expect(el.getSuggestions().currentId).toBe(idOf(el, 'mennyt'));

    expect(el.stepSuggestion(1)).toBe(idOf(el, 'åkerö'));
    expect(v.state.selection.main.head).toBe(45);
    expect(el.stepSuggestion(1)).toBe(el.getSuggestions().pending[0].id);   // wraps
    expect(v.state.selection.main.head).toBe(3);
    expect(el.stepSuggestion(-1)).toBe(idOf(el, 'åkerö'));

    const empty = mount('Ei mitään.');
    expect(empty.el.stepSuggestion(1)).toBeNull();
  });
});

describe('drawing', () => {
  test('the three view modes draw the same suggestions differently and never touch the text', () => {
    const { v, el, text } = mount();
    el.proposeChanges([at(SAMPLE, 'sanoi', 'kuiskasi'), { from: 3, to: 3, insert: ' taas' }], { meta: META });
    const content = v.contentDOM;

    const del = content.querySelector('.cm-faust-sugg-del');
    expect(del.textContent).toBe('sanoi');
    expect(del.getAttribute('data-sugg-id')).toBe(idOf(el, 'sanoi'));
    const inserted = [...content.querySelectorAll('.cm-faust-sugg-ins')];
    expect(inserted.map(node => node.textContent)).toEqual([' taas', 'kuiskasi']);
    expect(inserted[0].getAttribute('aria-label')).toBe('Lisäysehdotus:  taas');
    // The first one is current
    expect(inserted[0].classList.contains('cm-faust-sugg-current')).toBe(true);
    expect(del.classList.contains('cm-faust-sugg-current')).toBe(false);

    el.setSuggestionView('original');
    expect(content.querySelector('.cm-faust-sugg-ins')).toBeNull();
    expect(content.querySelector('.cm-faust-sugg-orig').textContent).toBe('sanoi');
    expect(content.querySelector('.cm-faust-sugg-point').textContent).toBe('‸');
    expect(content.textContent).not.toContain('kuiskasi');

    el.setSuggestionView('new');
    expect(content.querySelector('.cm-faust-sugg-del')).toBeNull();
    expect([...content.querySelectorAll('.cm-faust-sugg-new')].map(node => node.textContent)).toEqual([' taas', 'kuiskasi']);
    expect(content.querySelector('.cm-line').textContent.startsWith('Hän taas kuiskasi: ”Älä')).toBe(true);
    expect(text()).toBe(SAMPLE);
  });

  test('a deleted paragraph break is drawn as a struck-through ¶ and an inserted one as ¶ with a line break', () => {
    const doc = 'Eka kappale.\n\nToka virke. Kolmas virke.';
    const { v, el, text } = mount(doc);
    el.proposeChanges([{ from: 12, to: 14, insert: ' ' }, { from: 25, to: 26, insert: '\n\n' }], { meta: META });
    const breaks = v.contentDOM.querySelectorAll('.cm-faust-sugg-break');
    expect(breaks).toHaveLength(2);
    expect(breaks[0].textContent).toBe('¶');
    const split = [...v.contentDOM.querySelectorAll('.cm-faust-sugg-ins')].pop();
    expect(split.textContent).toBe('¶¶');
    expect(split.querySelectorAll('br')).toHaveLength(2);
    // "Uusi" marks the new break the same way
    el.setSuggestionView('new');
    const plain = [...v.contentDOM.querySelectorAll('.cm-faust-sugg-new')].pop();
    expect(plain.textContent).toBe('¶¶');
    expect(plain.querySelectorAll('br')).toHaveLength(2);
    el.setSuggestionView('changes');

    el.acceptGroup();
    expect(text()).toBe('Eka kappale. Toka virke.\n\nKolmas virke.');
  });

  test('a highlighted target is marked and the mark follows setRangeHighlight', () => {
    const { v, el } = mount();
    const target = el.captureRange(11, 22, { highlight: true });
    expect(v.contentDOM.querySelector('.cm-faust-target').textContent).toBe('”Älä mene.”');
    el.setRangeHighlight(target.rangeId, false);
    expect(v.contentDOM.querySelector('.cm-faust-target')).toBeNull();
    expect(el.getRange(target.rangeId)).toMatchObject({ intact: true });
    el.setRangeHighlight(target.rangeId, true);
    expect(v.contentDOM.querySelector('.cm-faust-target')).not.toBeNull();
    el.releaseRange(target.rangeId);
    expect(v.contentDOM.querySelector('.cm-faust-target')).toBeNull();
    expect(el.getRange(target.rangeId)).toBeNull();
  });

  test('captureSelection falls back to the paragraph, the document or the caret', () => {
    const doc = 'Eka kappale.\n\nToka kappale.';
    const { v, el } = mount(doc);
    v.dispatch({ selection: { anchor: 18 } });
    expect(el.captureSelection()).toBeNull();
    expect(el.captureSelection({ fallback: 'none' })).toBeNull();
    expect(el.captureSelection({ fallback: 'paragraph' })).toMatchObject({ from: 14, to: 27, text: 'Toka kappale.', fallbackUsed: true });
    expect(el.captureSelection({ fallback: 'document' })).toMatchObject({ from: 0, to: 27, text: doc, fallbackUsed: true });

    const caret = el.captureSelection({ fallback: 'caret' });
    expect(caret).toMatchObject({ from: 18, to: 18, text: '', fallbackUsed: true });
    // The anchor follows text typed in front of it and at it
    typeAt(v, 0, 'Ja ');
    typeAt(v, 21, 'uusi ');
    expect(el.getRange(caret.rangeId)).toEqual({ from: 26, to: 26, text: '', intact: true });

    // On an empty line there is no paragraph to take
    v.dispatch({ selection: { anchor: 16 } });
    expect(v.state.doc.lineAt(16).text).toBe('');
    expect(el.captureSelection({ fallback: 'paragraph' })).toBeNull();
  });

  test('a click on a suggestion makes it current', () => {
    const { v, el } = mount();
    el.proposeChanges(FOUR, { meta: META });
    const mennyt = idOf(el, 'mennyt');
    const node = v.contentDOM.querySelector(`.cm-faust-sugg-del[data-sugg-id="${mennyt}"]`);
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(el.getSuggestions().currentId).toBe(mennyt);
    expect(v.contentDOM.querySelector(`.cm-faust-sugg-del[data-sugg-id="${mennyt}"]`).classList.contains('cm-faust-sugg-current')).toBe(true);
  });
});

describe('insert block', () => {
  test('block: start, append, finish and accept insert exactly blockInsertText', async () => {
    const doc = 'Eka kappale.\n\nToka kappale jatkuu tässä.';
    const { v, el, text, updates, docChanges } = mount(doc);
    const started = el.startInsertBlock({ pos: 12, meta: META });
    expect(started).toEqual({ ok: true, blockId: expect.any(String) });
    expect(el.startInsertBlock({ pos: 20 })).toEqual({ ok: false, error: 'busy' });

    expect(el.appendInsertBlock(started.blockId, '\nSumu nousi ')).toBe(true);
    expect(el.appendInsertBlock(started.blockId, 'järveltä.  \n')).toBe(true);
    expect(el.appendInsertBlock('ei-ole', 'x')).toBe(false);
    // Chunks wait for the next frame, then arrive as one update
    expect(el.getInsertBlock().text).toBe('');
    await nextFrame();
    expect(el.getInsertBlock()).toMatchObject({ status: 'streaming', text: '\nSumu nousi järveltä.  \n' });

    expect(el.finishInsertBlock(started.blockId, { status: 'done' })).toBe(true);
    expect(el.appendInsertBlock(started.blockId, 'myöhässä')).toBe(false);
    expect(text()).toBe(doc);
    expect(docChanges()).toBe(0);

    const expected = M.blockInsertText(doc, 12, '\nSumu nousi järveltä.  \n');
    expect(expected).toBe('\n\nSumu nousi järveltä.');
    expect(el.acceptInsertBlock(started.blockId)).toBe(true);
    expect(text()).toBe(doc.slice(0, 12) + expected + doc.slice(12));
    expect(docChanges()).toBe(1);
    expect(el.getInsertBlock()).toBeNull();
    expect(v.state.selection.main.head).toBe(12 + expected.length);

    // The undo step keeps the block with its attempts
    const meta = kit.readSuggestionMeta(updates.filter(update => update.docChanged)[0]);
    expect(meta.suggestions.ids).toEqual([started.blockId]);
    expect(meta.suggestions.items[0]).toMatchObject({ from: 12, to: 12, insert: expected, original: '', meta: META });
    expect(meta.suggestions.items[0].block.attempts).toHaveLength(1);

    // Undo: the text goes back and the block returns as it was
    external(v, doc);
    expect(el.proposeChanges(meta.suggestions.items, { restore: true, whenText: doc }).ok).toBe(true);
    expect(el.getInsertBlock()).toMatchObject({ id: started.blockId, pos: 12, state: 'pending', status: 'done', attemptCount: 1 });
    expect(v.contentDOM.querySelector('.cm-faust-block')).not.toBeNull();
  });

  test('a block is refused where a suggestion is pending, and a suggestion where the block is', () => {
    const { el } = mount();
    el.proposeChanges([at(SAMPLE, 'sanoi', 'kuiskasi')], { meta: META });
    expect(el.startInsertBlock({ pos: 9 })).toEqual({ ok: false, error: 'conflict' });
    const started = el.startInsertBlock({ pos: 22 });
    expect(started.ok).toBe(true);
    const result = el.proposeChanges([{ from: 22, to: 23, insert: '\n' }], { meta: META });
    expect(result).toMatchObject({ ok: false, error: 'no-changes', skipped: [{ index: 0, reason: 'conflict' }] });
  });

  test('finishInsertBlock on a stopped attempt does nothing', () => {
    const { el, updates } = mount();
    const { blockId } = el.startInsertBlock({ pos: 22, meta: META });
    el.appendInsertBlock(blockId, 'Sumu nousi. Sitten al');
    const note = 'Pysäytetty. Teksti on leikattu viimeiseen kokonaiseen virkkeeseen.';
    expect(el.finishInsertBlock(blockId, { status: 'stopped', text: 'Sumu nousi.', note })).toBe(true);
    const kept = el.getInsertBlock();
    expect(kept).toMatchObject({ status: 'stopped', text: 'Sumu nousi.', note });

    // The late result of the cancelled request arrives
    const count = updates.length;
    expect(el.finishInsertBlock(blockId, { status: 'error', text: '', note: 'Pyyntö pysäytettiin.' })).toBe(false);
    expect(el.finishInsertBlock(blockId, { status: 'done', text: 'Aivan muuta.' })).toBe(false);
    expect(updates).toHaveLength(count);      // nothing was dispatched
    expect(el.getInsertBlock()).toEqual(kept);
    expect(el.finishInsertBlock('ei-ole', {})).toBe(false);
  });

  test('finishInsertBlock passes the meta of the answered request, and an empty only attempt removes the block', () => {
    const { el } = mount();
    const first = el.startInsertBlock({ pos: 22, meta: META });
    el.appendInsertBlock(first.blockId, 'Sumu nousi.');
    const logMeta = { ...META, model: 'c91f:glm-5', requestLogId: 'r9' };
    el.finishInsertBlock(first.blockId, { status: 'done', meta: logMeta });
    expect(el.getInsertBlock().meta).toEqual(logMeta);

    // A second attempt that fails disappears; the first one is shown again
    expect(el.retryInsertBlock(first.blockId)).toBe(1);
    expect(el.retryInsertBlock(first.blockId)).toBe(-1);
    expect(el.showInsertBlockAttempt(first.blockId, 0)).toBe(false);
    el.finishInsertBlock(first.blockId, { status: 'error', text: '', note: 'Ei ehdotusta.' });
    expect(el.getInsertBlock()).toMatchObject({ attempt: 0, attemptCount: 1, text: 'Sumu nousi.' });

    el.rejectInsertBlock(first.blockId);
    expect(el.getInsertBlock().state).toBe('rejected');
    const second = el.startInsertBlock({ pos: 22 });
    el.finishInsertBlock(second.blockId, { status: 'error', text: '   ' });
    expect(el.getInsertBlock()).toBeNull();
  });

  test('a block in the middle of a line is drawn between two .cm-line elements and keeps its element while text streams in', async () => {
    const doc = 'Eka kappale jatkuu tässä pitkään.\nToka kappale.';
    const { v, el, text } = mount(doc, { modelLabel: id => id.split(':').pop() });
    const { blockId } = el.startInsertBlock({ pos: 11, meta: META });

    const children = [...v.contentDOM.children];
    expect(children.map(node => node.className.split(' ')[0])).toEqual(['cm-line', 'cm-faust-block', 'cm-line', 'cm-line']);
    expect(children[0].textContent).toBe('Eka kappale');
    expect(children[2].textContent).toBe(' jatkuu tässä pitkään.');
    const block = children[1];
    expect(block.querySelector('[data-role="block-head"]').textContent).toBe('Tekoälyn luonnos · ei vielä käsikirjoituksessa · kimi-k2');
    expect(block.querySelector('[data-role="block-text"]').textContent).toBe('Odotetaan mallia…');
    const stop = block.querySelector('[data-role="block-stop"]');

    for (const chunk of ['Sumu ', 'nousi ', 'järveltä.']) {
      el.appendInsertBlock(blockId, chunk);
      await nextFrame();
      expect(v.contentDOM.querySelector('.cm-faust-block')).toBe(block);
      expect(block.querySelector('[data-role="block-stop"]')).toBe(stop);
    }
    expect(block.querySelector('[data-role="block-text"]').textContent).toBe('Sumu nousi järveltä.');

    el.finishInsertBlock(blockId, { status: 'done' });
    expect(v.contentDOM.querySelector('.cm-faust-block')).toBe(block);
    expect(block.querySelector('[data-role="block-accept"]').textContent).toBe('Hyväksy');
    expect(text()).toBe(doc);

    // Inside a paragraph the accepted text goes inline, with a space where words would touch
    block.querySelector('[data-role="block-accept"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(text()).toBe('Eka kappale Sumu nousi järveltä. jatkuu tässä pitkään.\nToka kappale.');
    expect(v.contentDOM.querySelector('.cm-faust-block')).toBeNull();
  });

  test('text that arrives after the editor was closed is dropped without an error', async () => {
    const { v, el } = mount();
    const { blockId } = el.startInsertBlock({ pos: 22, meta: META });
    expect(el.appendInsertBlock(blockId, 'Sumu nousi.')).toBe(true);
    // The chapter is left before the next frame
    const state = kit.suggestionState(v.state);
    v.destroy();
    await nextFrame();
    expect(M.snapshot(state).block).toMatchObject({ status: 'streaming', text: '' });
    expect(() => el.flushQueuedSuggestions(true)).not.toThrow();
  });

  test('Pysäytä and Uusi yritys reach the owner of the request as block-action events', () => {
    const { v, el, events } = mount();
    const { blockId } = el.startInsertBlock({ pos: 22, meta: META });
    const click = role => v.contentDOM.querySelector(`[data-role="${role}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true }));

    click('block-stop');
    expect(events().filter(event => event.type === 'block-action')).toEqual([{ type: 'block-action', action: 'stop', blockId }]);
    // The editor did not stop anything by itself
    expect(el.getInsertBlock().status).toBe('streaming');

    el.finishInsertBlock(blockId, { status: 'stopped', text: 'Sumu nousi.' });
    click('block-retry');
    expect(events().filter(event => event.type === 'block-action')[1]).toEqual({ type: 'block-action', action: 'retry', blockId });
    expect(el.getInsertBlock().attemptCount).toBe(1);

    // The attempt switcher and Hylkää act in the editor
    el.retryInsertBlock(blockId);
    el.finishInsertBlock(blockId, { status: 'done', text: 'Toinen.' });
    click('block-prev');
    expect(el.getInsertBlock()).toMatchObject({ attempt: 0, text: 'Sumu nousi.' });
    click('block-reject');
    expect(el.getInsertBlock().state).toBe('rejected');
    expect(v.contentDOM.querySelector('.cm-faust-block')).toBeNull();
    expect(el.restoreRejected()).toEqual({ restored: 1, failed: 0 });
    expect(v.contentDOM.querySelector('.cm-faust-block')).not.toBeNull();
    // Stream chunks are not reported one by one
    expect(events().some(event => event.type === 'block' && event.action === 'append')).toBe(false);
  });
});

describe('keys', () => {
  const MOD_ENTER = { key: 'Enter', ctrlKey: true };

  test('the review keys do nothing when nothing is pending', () => {
    const { v, el, text } = mount();
    // jsdom is not macOS, so Mod is Ctrl
    expect(key(v, MOD_ENTER)).toBe(false);
    expect(key(v, { key: 'Backspace', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(key(v, { key: 'ArrowDown', ctrlKey: true, altKey: true })).toBe(false);
    expect(key(v, { key: 'ArrowUp', ctrlKey: true, altKey: true })).toBe(false);

    el.proposeChanges([at(SAMPLE, 'sanoi', 'kuiskasi')], { meta: META });
    expect(key(v, MOD_ENTER)).toBe(true);
    expect(text()).toBe(SAMPLE.replace('sanoi', 'kuiskasi'));
    // Accepted: the key is free again
    expect(key(v, MOD_ENTER)).toBe(false);

    // Rejected suggestions do not hold the keys either
    el.proposeChanges([at(text(), 'mennyt', 'lähtenyt')], { meta: META });
    expect(key(v, { key: 'Backspace', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(el.getSuggestions().rejected).toHaveLength(1);
    expect(key(v, { key: 'Backspace', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(key(v, MOD_ENTER)).toBe(false);
    // Escape is never bound here
    el.restoreRejected();
    expect(key(v, { key: 'Escape' })).toBe(false);
    expect(el.getSuggestions().pending).toHaveLength(1);
  });

  test('the arrow keys step, and Mod-Enter on a streaming block is held without accepting', () => {
    const { v, el, text } = mount();
    el.proposeChanges(FOUR, { meta: META });
    expect(key(v, { key: 'ArrowDown', ctrlKey: true, altKey: true })).toBe(true);
    expect(el.getSuggestions().currentIndex).toBe(1);
    expect(key(v, { key: 'ArrowUp', ctrlKey: true, altKey: true })).toBe(true);
    expect(el.getSuggestions().currentIndex).toBe(0);

    el.rejectGroup();
    const { blockId } = el.startInsertBlock({ pos: 22, meta: META });
    el.appendInsertBlock(blockId, 'Sumu');
    expect(key(v, MOD_ENTER)).toBe(true);
    expect(key(v, { key: 'Backspace', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(text()).toBe(SAMPLE);
    expect(el.getInsertBlock()).toMatchObject({ state: 'pending', status: 'streaming' });

    el.finishInsertBlock(blockId, { status: 'done', text: 'Sumu nousi.' });
    expect(key(v, MOD_ENTER)).toBe(true);
    expect(text()).toBe(SAMPLE.slice(0, 22) + ' Sumu nousi.' + SAMPLE.slice(22));
  });

  test('Shift+Mod+. and Shift+Mod+, step by physical key while something is pending', () => {
    const { v, el } = mount();
    const press = (code, extra = {}) => {
      const event = new KeyboardEvent('keydown', { key: code === 'Period' ? ':' : ';', code, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true, ...extra });
      v.contentDOM.dispatchEvent(event);
      return event.defaultPrevented;
    };
    // Nothing pending: the key is left alone
    expect(press('Period')).toBe(false);

    el.proposeChanges(FOUR, { meta: META });
    expect(press('Period')).toBe(true);
    expect(el.getSuggestions().currentIndex).toBe(1);
    expect(press('Comma')).toBe(true);
    expect(el.getSuggestions().currentIndex).toBe(0);
    // Without Shift, or with Alt, it is another chord
    expect(press('Period', { shiftKey: false })).toBe(false);
    expect(press('Comma', { altKey: true })).toBe(false);
    expect(el.getSuggestions().currentIndex).toBe(0);
  });
});

describe('seed', () => {
  test('an editor mounted with a seed shows its suggestions at once', () => {
    let seed = M.reduce(M.createState(), { type: 'propose', docText: SAMPLE, changes: FOUR, meta: META });
    seed = M.reduce(seed, { type: 'reject', ids: [seed.items[0].id] });
    const { v, el } = mount(SAMPLE, { seed });
    expect(el.getSuggestions().pending.map(item => item.original)).toEqual(['sanoi', 'mennyt', 'åkerö']);
    expect(el.getSuggestions().rejected).toHaveLength(1);
    expect(v.contentDOM.querySelectorAll('.cm-faust-sugg-del')).toHaveLength(3);
    expect(kit.suggestionState(v.state)).toBe(seed);
    expect(kit.suggestionSnapshot(v.state)).toEqual(el.getSuggestions());

    // Without a seed the editor starts empty
    expect(mount().el.getSuggestions()).toMatchObject({ pending: [], rejected: [], block: null, currentId: null });
  });

  test('a seed made for another text is not used', () => {
    const seed = M.reduce(M.createState(), { type: 'propose', docText: SAMPLE, changes: FOUR, meta: META });
    // Positions up to 50 in a text of ten characters would be drawn and mapped outside the document
    const short = mount('Lyhyt luku', { seed });
    expect(short.el.getSuggestions()).toMatchObject({ pending: [], rejected: [], block: null });
    short.v.dispatch({ changes: { from: 10, insert: '.' } });
    expect(short.text()).toBe('Lyhyt luku.');

    // The same length but another word where two of the suggestions sit: those two would be
    // accepted into the wrong text, so they are set aside; the other two stay
    const other = SAMPLE.replace('sanoi', 'huusi');
    const wrong = mount(other, { seed });
    expect(wrong.el.getSuggestions().pending.map(item => item.original)).toEqual(['mennyt', 'åkerö']);
    expect(wrong.el.getSuggestions().rejected.map(item => item.original)).toEqual(['', 'sanoi']);
    expect(wrong.v.contentDOM.querySelectorAll('.cm-faust-sugg-del')).toHaveLength(2);
    expect(wrong.el.acceptGroup()).toBe(2);
    expect(wrong.text()).toBe(other.replace('mennyt', 'lähtenyt').replace('åkerö', 'Åkerö'));
    expect(wrong.el.restoreRejected()).toEqual({ restored: 0, failed: 2 });

    // Rejected suggestions need not match: they are only kept for a later restore
    const rejected = M.reduce(seed, { type: 'reject', ids: [seed.items.find(item => item.original === 'åkerö').id] });
    const kept = mount(SAMPLE.replace('åkerö', 'Åkerö'), { seed: rejected });
    expect(kept.el.getSuggestions().pending).toHaveLength(3);
    expect(kept.el.restoreRejected()).toEqual({ restored: 0, failed: 1 });
  });

  test('a captured range outside the document is not tracked', () => {
    const { v, el } = mount('Lyhyt luku');
    v.dispatch({ effects: kit.suggestionEffect.of({ type: 'rangeAdd', id: 'r-ulkona', from: 5, to: 500, text: '', highlight: true }) });
    expect(el.getRange('r-ulkona')).toBeNull();
    v.dispatch({ changes: { from: 0, insert: 'Aivan ' } });
    // The facade clamps what it is given
    expect(el.captureRange(3, 500)).toMatchObject({ from: 3, to: 16, text: 'an Lyhyt luku' });
  });
});

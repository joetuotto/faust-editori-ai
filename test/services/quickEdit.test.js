/**
 * @jest-environment node
 */
const { createQuickEdit } = require('../../src/services/ai/quickEdit');
const { findAction, actionsFor } = require('../../src/services/ai/actions');
const { promptMessage, LIMITS } = require('../../src/services/ai/editRequest');

const NO_AI = 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.';
const PLACEHOLDER_RULE = 'Säilytä jokainen paikkamerkki täsmälleen sellaisenaan.';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

// "Alku. |Åke käveli.| Loppu.": | marks the selection (one | = cursor)
function sel(marked) {
  const first = marked.indexOf('|');
  const rest = marked.slice(first + 1);
  const second = rest.indexOf('|');
  const text = marked.replace(/\|/g, '');
  return second === -1 ? [text, first, first] : [text, first, first + second];
}

// Word-level diff: enough to give several changes with offsets in the first text
function wordDiff(a, b) {
  const split = (value) => value.match(/\s+|\S+/g) || [];
  const x = split(a);
  const y = split(b);
  const table = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i -= 1) {
    for (let j = y.length - 1; j >= 0; j -= 1) {
      table[i][j] = x[i] === y[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const changes = [];
  let open = null;
  let pos = 0;
  let i = 0;
  let j = 0;
  const close = () => {
    if (!open) return;
    open.original = a.slice(open.from, open.to);
    changes.push(open);
    open = null;
  };
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      close();
      pos += x[i].length;
      i += 1;
      j += 1;
    } else if (j < y.length && (i === x.length || table[i][j + 1] >= table[i + 1][j])) {
      open = open || { from: pos, to: pos, insert: '' };
      open.insert += y[j];
      j += 1;
    } else {
      open = open || { from: pos, to: pos, insert: '' };
      open.to += x[i].length;
      pos += x[i].length;
      i += 1;
    }
  }
  close();
  return changes;
}

function makeText() {
  const text = {
    wordDiff: jest.fn(wordDiff),
    changeRatio: jest.fn(() => 0.1),
    // The text between the last <teksti> and its closing tag, or what has arrived of it
    cleanModelOutput: jest.fn((raw) => {
      const open = raw.lastIndexOf('<teksti>');
      if (open === -1) return { text: '', complete: false, hadOpenTag: false, hadCloseTag: false, notes: [] };
      const inner = raw.slice(open + '<teksti>'.length);
      const close = inner.indexOf('</teksti>');
      if (close === -1) return { text: inner, complete: false, hadOpenTag: true, hadCloseTag: false, notes: [] };
      return { text: inner.slice(0, close), complete: true, hadOpenTag: true, hadCloseTag: true, notes: [] };
    }),
    // Notes become ⟦n⟧, underline tags a pair ⟦n⟧…⟦/n⟧
    maskSpans: jest.fn((source) => {
      const spans = [];
      let id = 0;
      const masked = source.replace(/\[TODO:[^\]\n]*\]|<u>([^<\n]+)<\/u>/g, (match, underlined) => {
        id += 1;
        if (underlined === undefined) {
          spans.push({ id, role: null, kind: 'todo', text: match, token: `⟦${id}⟧` });
          return `⟦${id}⟧`;
        }
        spans.push({ id, role: 'open', kind: 'tag', text: '<u>', token: `⟦${id}⟧` });
        spans.push({ id, role: 'close', kind: 'tag', text: '</u>', token: `⟦/${id}⟧` });
        return `⟦${id}⟧${underlined}⟦/${id}⟧`;
      });
      return { text: masked, source, spans, hasProse: true };
    }),
    // A missing note is put back at the end and reported
    unmaskSpans: jest.fn((output, mask) => {
      let result = output;
      const restored = [];
      for (const span of mask.spans) {
        if (span.kind === 'todo' && !result.includes(span.token)) {
          result += ` ${span.token}`;
          restored.push(span.id);
        }
      }
      for (const span of mask.spans) result = result.split(span.token).join(span.text);
      return { text: result, restored, repositioned: [], displaced: [], duplicates: [], dropped: [], unknown: 0 };
    }),
    placeholderInstruction: jest.fn(() => PLACEHOLDER_RULE),
    trimToSentence: jest.fn((value) => {
      const match = /^[\s\S]*[.!?…][”"]?/.exec(value);
      return match ? match[0] : '';
    }),
    splitBlocks: jest.fn((value) => {
      const blocks = [];
      let from = 0;
      for (const line of value.split('\n')) {
        const body = line.trim();
        const bodyFrom = from + (line.length - line.trimStart().length);
        blocks.push({ n: blocks.length + 1, from, to: from + line.length, kind: body ? 'paragraph' : 'blank', text: line, prefix: '', body, bodyFrom: body ? bodyFrom : from, bodyTo: body ? bodyFrom + body.length : from });
        from += line.length + 1;
      }
      return blocks;
    }),
    blockAt: jest.fn((blocks, pos) => blocks.find((block) => pos >= block.from && pos <= block.to) || null)
  };
  return text;
}

function makeEditor(textValue, selFrom, selTo, hooks) {
  const ranges = new Map();
  let rangeCount = 0;
  let suggestionCount = 0;
  let groupCount = 0;
  let blockCount = 0;

  const readRange = (id) => {
    const range = ranges.get(id);
    if (!range) return null;
    return { from: range.from, to: range.to, text: range.text, intact: editor.value.slice(range.from, range.to) === range.text };
  };
  const capture = (from, to, options = {}) => {
    const id = `r${++rangeCount}`;
    const captured = editor.value.slice(from, to);
    ranges.set(id, { from, to, text: captured, highlight: !!options.highlight });
    return { rangeId: id, from, to, text: captured, fallbackUsed: false };
  };
  const shown = () => (editor.block ? editor.block.attempts[editor.block.attempt] : null);

  const editor = {
    value: textValue,
    selectionStart: selFrom,
    selectionEnd: selTo,
    pending: [],
    block: null,
    proposeError: null,      // set to make the next proposals fail
    blockError: null,        // set to make startInsertBlock refuse
    ranges,
    focus: jest.fn(),
    // Like the facade: the selection moves (the editor scrolls it into view)
    setSelectionRange: jest.fn((start, end) => {
      editor.selectionStart = start;
      editor.selectionEnd = end === undefined ? start : end;
    }),

    captureRange: jest.fn(capture),
    captureSelection: jest.fn((options = {}) => {
      const from = Math.min(editor.selectionStart, editor.selectionEnd);
      const to = Math.max(editor.selectionStart, editor.selectionEnd);
      if (from === to && options.fallback !== 'caret') return null;
      return { ...capture(from, to, options), fallbackUsed: from === to };
    }),
    getRange: jest.fn(readRange),
    setRangeHighlight: jest.fn((id, on) => {
      if (ranges.has(id)) ranges.get(id).highlight = on;
    }),
    releaseRange: jest.fn((id) => {
      ranges.delete(id);
      hooks.released(id);
    }),

    proposeChanges: jest.fn((changes, options = {}) => {
      if (editor.proposeError) return { ok: false, groupId: null, ids: [], skipped: [], error: editor.proposeError };
      let offset = 0;
      if (options.rangeId) {
        const range = readRange(options.rangeId);
        if (!range || !range.intact) return { ok: false, groupId: null, ids: [], skipped: [], error: 'target-changed' };
        offset = range.from;
      }
      if (options.replaceGroupId) editor.pending = editor.pending.filter((item) => item.groupId !== options.replaceGroupId);

      const ids = [];
      const skipped = [];
      const groupId = `g${groupCount + 1}`;
      changes.forEach((change, index) => {
        const from = change.from + offset;
        const to = change.to + offset;
        // With a baseText the layer moves a change onto the document or skips it
        if (options.baseText !== undefined && editor.value.slice(from, to) !== (change.original || '')) {
          skipped.push({ index, reason: 'target-changed' });
          return;
        }
        const id = `s${++suggestionCount}`;
        ids.push(id);
        editor.pending.push({ id, groupId, from, to, insert: change.insert, original: change.original, meta: { ...(options.meta || {}), ...(change.meta || {}) } });
      });
      if (ids.length === 0) return { ok: false, groupId: null, ids, skipped, error: 'no-changes' };
      groupCount += 1;
      return { ok: true, groupId, ids, skipped };
    }),
    removeSuggestions: jest.fn((ids) => {
      const before = editor.pending.length;
      editor.pending = editor.pending.filter((item) => !ids.includes(item.id));
      return before - editor.pending.length;
    }),
    acceptGroup: jest.fn(),
    rejectGroup: jest.fn(),
    getSuggestions: jest.fn(() => ({ pending: editor.pending.slice(), rejected: [] })),

    // Accept one suggestion the way the layer does: the text changes, positions behind it move
    accept(id) {
      const item = editor.pending.find((candidate) => candidate.id === id);
      const delta = item.insert.length - (item.to - item.from);
      editor.value = editor.value.slice(0, item.from) + item.insert + editor.value.slice(item.to);
      editor.pending = editor.pending.filter((candidate) => candidate !== item);
      for (const other of editor.pending) {
        if (other.from >= item.to) {
          other.from += delta;
          other.to += delta;
        }
      }
      for (const range of ranges.values()) {
        if (item.from >= range.from && item.to <= range.to) range.to += delta;
        else if (item.to <= range.from) {
          range.from += delta;
          range.to += delta;
        }
      }
    },

    startInsertBlock: jest.fn(({ pos, meta } = {}) => {
      if (editor.blockError) return { ok: false, error: editor.blockError };
      if (editor.block) return { ok: false, error: 'busy' };
      editor.block = { id: `b${++blockCount}`, pos, meta, attempts: [{ text: '', status: 'streaming', note: null }], attempt: 0 };
      return { ok: true, blockId: editor.block.id };
    }),
    appendInsertBlock: jest.fn((blockId, more) => {
      if (!editor.block || editor.block.id !== blockId || shown().status !== 'streaming') return false;
      shown().text += more;
      return true;
    }),
    // Like the real one: acts only while the shown attempt is streaming
    finishInsertBlock: jest.fn((blockId, { status = 'done', text: finalText, note = null, meta } = {}) => {
      if (!editor.block || editor.block.id !== blockId || shown().status !== 'streaming') return false;
      const attempt = shown();
      attempt.status = status;
      attempt.note = note;
      if (finalText !== undefined) attempt.text = finalText;
      if (meta) editor.block.meta = meta;
      if (!attempt.text.trim()) {
        editor.block.attempts.splice(editor.block.attempt, 1);
        editor.block.attempt = editor.block.attempts.length - 1;
        if (editor.block.attempts.length === 0) editor.block = null;
      }
      return true;
    }),
    retryInsertBlock: jest.fn((blockId) => {
      if (!editor.block || editor.block.id !== blockId || shown().status === 'streaming') return -1;
      editor.block.attempts.push({ text: '', status: 'streaming', note: null });
      editor.block.attempt = editor.block.attempts.length - 1;
      return editor.block.attempt;
    }),
    getInsertBlock: jest.fn(() => {
      if (!editor.block) return null;
      const attempt = shown();
      return {
        id: editor.block.id,
        pos: editor.block.pos,
        state: 'pending',
        status: attempt.status,
        text: attempt.text,
        attempt: editor.block.attempt,
        attemptCount: editor.block.attempts.length,
        note: attempt.note,
        meta: editor.block.meta
      };
    })
  };
  return editor;
}

function makeAI() {
  const calls = [];
  const ai = {
    calls,
    models: { edit: 'cherry:muokkaus-malli', prose: 'cherry:proosa-malli', analysis: 'cherry:analyysi-malli' },
    list: [
      { id: 'cherry:muokkaus-malli', name: 'muokkaus-malli' },
      { id: 'cherry:proosa-malli', name: 'proosa-malli' },
      { id: 'cherry:toinen-malli', name: 'toinen-malli' }
    ],
    requestEdit: jest.fn((opts) => {
      let settle;
      const result = new Promise((resolve) => { settle = resolve; });
      const model = opts.model || ai.models[opts.role];
      const logMeta = {
        source: 'faust',
        action: opts.meta.action,
        actionLabel: opts.meta.actionLabel,
        instruction: opts.meta.instruction,
        provider: 'cherry',
        model,
        requestLogId: `log-${calls.length + 1}`
      };
      const call = {
        opts,
        logMeta,
        settled: false,
        soFar: '',
        finish(value) {
          if (call.settled) return;
          call.settled = true;
          settle({ ok: true, model, logMeta, text: '', inner: null, cleaned: null, cancelled: false, accepted: false, reason: null, reasonText: null, ...value });
        },
        // The cancelled result arrives only after cancel() was called, as from the real client
        cancel: jest.fn(() => call.finish({ cancelled: true, reason: 'cancelled', reasonText: 'Pyyntö pysäytettiin.', text: call.soFar })),
        stream(full) {
          const delta = full.slice(call.soFar.length);
          call.soFar = full;
          opts.onText(delta, full);
        },
        accept(inner, extra = {}) {
          call.finish({
            accepted: true,
            inner,
            text: `<teksti>${inner}</teksti>`,
            cleaned: { text: inner, complete: true, hadOpenTag: true, hadCloseTag: true, notes: [] },
            ...extra
          });
        },
        fail(reason, reasonText, extra = {}) {
          call.finish({ reason, reasonText, ...extra });
        }
      };
      calls.push(call);
      return { id: `req-${calls.length}`, result, cancel: call.cancel };
    }),
    modelFor: jest.fn((role) => ai.models[role]),
    listModels: jest.fn(async () => ai.list)
  };
  return ai;
}

const flush = async () => {
  for (let n = 0; n < 6; n += 1) await Promise.resolve();
};

/**
 * A controller with every dependency faked.
 * options: marked (text with | marks), project, chapterId, settings (values), loaded, deps (overrides)
 */
function harness(options = {}) {
  const [textValue, selFrom, selTo] = sel(options.marked || 'Alku. |Åke käveli hyvin hitaasti pitkin öistä rantaa.| Loppu.');
  const view = { name: 'view' };
  const project = options.project || { genre: 'fiction', language: 'fi' };
  const state = { chapterId: options.chapterId || 'chapter-1', view, blockedChapters: new Set(), nextBuilt: null };

  const settings = {
    loaded: options.loaded !== false,
    values: { aiOff: false, ...(options.settings || {}) },
    isLoaded: () => settings.loaded,
    get: jest.fn((key, fallback) => (key in settings.values ? settings.values[key] : fallback)),
    set: jest.fn((key, value) => { settings.values[key] = value; })
  };

  let quick = null;
  const ui = {
    current: null,
    openPrompt: jest.fn((target, { mode, rangeId, ui: promptState }) => {
      ui.current = { mode, rangeId, ui: promptState };
      return true;
    }),
    updatePrompt: jest.fn((target, promptState) => {
      if (!ui.current) return false;
      ui.current = { ...ui.current, ui: promptState };
      return true;
    }),
    // Like the editor core: the tooltip's destroy reports prompt-closed during the close
    closePrompt: jest.fn((target) => {
      if (!ui.current) return false;
      ui.current = null;
      quick.host.handle({ type: 'prompt-closed' }, target);
      return true;
    }),
    getPrompt: jest.fn(() => ui.current),
    focusPrompt: jest.fn(() => !!ui.current)
  };

  // Releasing the range of an open prompt closes it, as in the editor core
  const editor = makeEditor(textValue, selFrom, selTo, {
    released(id) {
      if (ui.current && ui.current.rangeId === id) {
        ui.current = null;
        quick.host.handle({ type: 'prompt-closed' }, state.view);
      }
    }
  });

  const ai = makeAI();
  const text = makeText();
  const context = {
    build: jest.fn((args) => {
      const built = state.nextBuilt || {};
      state.nextBuilt = null;
      return {
        system: `JÄRJESTELMÄ ${args.task.id}`,
        messages: [{ role: 'user', content: `<valinta>${args.task.payload || ''}</valinta><ohje>${args.task.instruction}</ohje>` }],
        parts: [],
        totalTokens: 300,
        budgetTokens: 4000,
        overBudget: false,
        blocked: null,
        model: args.model || ai.models[args.role],
        ...built
      };
    }),
    isBlocked: jest.fn((current, chapterId) => state.blockedChapters.has(chapterId)),
    noAIMessage: NO_AI
  };

  let blockHandler = null;
  const controller = {
    onBlockAction: jest.fn((handler) => {
      blockHandler = handler;
      return () => { blockHandler = null; };
    }),
    // Bulk accept never takes a dialogue suggestion
    acceptAll: jest.fn(({ groupId }) => {
      const ids = editor.pending.filter((item) => item.groupId === groupId && !(item.meta && item.meta.dialogue)).map((item) => item.id);
      for (const id of ids.reverse()) editor.accept(id);
      return ids.length;
    }),
    rejectAll: jest.fn(({ groupId }) => {
      const before = editor.pending.length;
      editor.pending = editor.pending.filter((item) => item.groupId !== groupId);
      return before - editor.pending.length;
    })
  };

  const reportContext = jest.fn();
  quick = createQuickEdit({
    getView: () => state.view,
    getEditor: () => state.editor,
    getProject: () => project,
    getChapterId: () => state.chapterId,
    settings,
    ai,
    modelLabel: (id) => String(id).slice(String(id).indexOf(':') + 1),
    text,
    context,
    projectKind: (current) => (current && current.genre === 'nonfiction' ? 'nonfiction' : 'fiction'),
    controller,
    ui,
    reportContext,
    now: () => 1763300000000,
    ...(options.deps || {})
  });
  state.editor = editor;

  const send = (intent) => quick.host.handle(intent, state.view);
  return {
    quick,
    view,
    state,
    project,
    settings,
    ui,
    editor,
    ai,
    text,
    context,
    controller,
    reportContext,
    send,
    blockAction: (action) => blockHandler(action, editor.getInsertBlock(), state.chapterId),
    get prompt() { return ui.current ? ui.current.ui : null; },
    get lastCall() { return ai.calls[ai.calls.length - 1]; },
    target: () => textValue.slice(selFrom, selTo)
  };
}

// Open on the selection, send an action and answer it: the usual way to a result
async function withResult(h, inner, actionId = 'tighten') {
  h.quick.open();
  h.send({ type: 'action', actionId, extra: '' });
  h.lastCall.accept(inner);
  await flush();
}

const TARGET = 'Åke käveli hyvin hitaasti pitkin öistä rantaa.';
const SHORTER = 'Åke käveli hitaasti pitkin rantaa.';

// ---------------------------------------------------------------------------
// Opening
// ---------------------------------------------------------------------------

describe('open', () => {
  test('open does nothing when aiOff is true or the settings have not loaded', () => {
    const off = harness({ settings: { aiOff: true } });
    expect(off.quick.open()).toBe(false);
    expect(off.ui.openPrompt).not.toHaveBeenCalled();
    expect(off.editor.captureRange).not.toHaveBeenCalled();

    const loading = harness({ loaded: false });
    expect(loading.quick.open({ actionId: 'tighten' })).toBe(false);
    expect(loading.ui.openPrompt).not.toHaveBeenCalled();
    expect(loading.ai.requestEdit).not.toHaveBeenCalled();

    // Anything but an explicit false counts as "off"
    const odd = harness({ settings: { aiOff: 'kyllä' } });
    expect(odd.quick.open()).toBe(false);

    // No editor on screen
    const none = harness();
    none.state.view = null;
    expect(none.quick.open()).toBe(false);
  });

  test('open with requireSelection and an empty selection shows nothing', () => {
    const h = harness({ marked: 'Ensimmäinen.\nÅke käv|eli öisin.' });
    expect(h.quick.open({ actionId: 'tighten', requireSelection: true })).toBe(false);
    expect(h.ui.openPrompt).not.toHaveBeenCalled();
    expect(h.editor.captureRange).not.toHaveBeenCalled();
    expect(h.editor.captureSelection).not.toHaveBeenCalled();
    expect(h.ai.requestEdit).not.toHaveBeenCalled();
  });

  test('open with a selection captures the trimmed range with a highlight and opens edit mode', () => {
    const h = harness({ marked: 'Alku.| Åke käveli öisin. \n|Loppu.' });
    expect(h.quick.open()).toBe(true);

    const from = 'Alku. '.length;
    const to = from + 'Åke käveli öisin.'.length;
    expect(h.editor.captureRange).toHaveBeenCalledTimes(1);
    expect(h.editor.captureRange).toHaveBeenCalledWith(from, to, { highlight: true });

    expect(h.ui.openPrompt).toHaveBeenCalledTimes(1);
    const [view, opened] = h.ui.openPrompt.mock.calls[0];
    expect(view).toBe(h.view);
    expect(opened.mode).toBe('edit');
    expect(opened.rangeId).toBe('r1');
    expect(opened.ui).toMatchObject({
      mode: 'edit',
      kind: 'selection',
      projectType: 'fiction',
      phase: 'idle',
      model: { id: 'cherry:muokkaus-malli', name: 'muokkaus-malli' },
      length: 'paragraph',
      otherModel: null
    });
    expect(opened.ui.actions).toEqual(actionsFor('fiction').map(({ id, label, builtin }) => ({ id, label, builtin })));
    expect(h.ai.modelFor).toHaveBeenCalledWith('edit');
    // Nothing is sent by opening
    expect(h.ai.requestEdit).not.toHaveBeenCalled();
    expect(h.context.build).not.toHaveBeenCalled();
  });

  test('open reads saved prompts, the project kind and the stored preferences into the prompt', () => {
    const own = [{ id: 'user-1', label: 'Säilytä murre', prompt: 'Älä yleiskielistä.', created: 5 }];
    const h = harness({
      project: { genre: 'nonfiction', language: 'fi' },
      settings: { savedPrompts: own, quickEdit: { otherModel: 'cherry:toinen-malli', length: 'long' } }
    });
    h.quick.open();
    expect(h.prompt.projectType).toBe('nonfiction');
    expect(h.prompt.actions.map((item) => item.label)).toEqual([
      'Kielenhuolto – vain virheet', 'Tiivistä kappale', 'Selkeytä', 'Selkeytä väite', 'Yhtenäistä termit', 'Säilytä murre'
    ]);
    expect(h.prompt.otherModel).toBe('cherry:toinen-malli');
    expect(h.prompt.length).toBe('long');
  });

  test('open without a selection opens edit mode on the paragraph, and write mode when writeAtCursor is on', () => {
    const marked = 'Ensimmäinen.\n  Åke käv|eli öisin.  \nKolmas.';
    const edit = harness({ marked });
    expect(edit.quick.open()).toBe(true);
    const from = 'Ensimmäinen.\n  '.length;
    expect(edit.editor.captureRange).toHaveBeenCalledWith(from, from + 'Åke käveli öisin.'.length, { highlight: true });
    expect(edit.ui.openPrompt.mock.calls[0][1].mode).toBe('edit');
    expect(edit.prompt).toMatchObject({ mode: 'edit', kind: 'paragraph', phase: 'idle' });
    expect(edit.editor.captureSelection).not.toHaveBeenCalled();

    const write = harness({ marked, deps: { writeAtCursor: true } });
    expect(write.quick.open()).toBe(true);
    expect(write.editor.captureSelection).toHaveBeenCalledWith({ fallback: 'caret' });
    expect(write.editor.captureRange).not.toHaveBeenCalled();
    expect(write.ui.openPrompt.mock.calls[0][1].mode).toBe('write');
    expect(write.prompt).toMatchObject({
      mode: 'write',
      kind: 'cursor',
      phase: 'idle',
      canEditParagraph: true,
      model: { id: 'cherry:proosa-malli', name: 'proosa-malli' }
    });

    // With a selection nothing changes: it is an edit
    const selected = harness({ deps: { writeAtCursor: true } });
    selected.quick.open();
    expect(selected.prompt.mode).toBe('edit');
  });

  test('open on an empty line has no paragraph to edit and says so', () => {
    const h = harness({ marked: 'Ensimmäinen.\n|\nKolmas.' });
    expect(h.quick.open()).toBe(true);
    expect(h.prompt.phase).toBe('blocked');
    expect(h.prompt.blocked).toEqual({ code: 'no-paragraph', message: 'Valitse teksti tai siirrä kohdistin kappaleeseen.' });

    // With write at cursor an empty line is a place to write
    const write = harness({ marked: 'Ensimmäinen.\n|\nKolmas.', deps: { writeAtCursor: true } });
    write.quick.open();
    expect(write.prompt).toMatchObject({ mode: 'write', phase: 'idle', canEditParagraph: false });
  });

  test('open in a blocked chapter opens blocked with the builder\'s noAI sentence and sends nothing', async () => {
    const h = harness();
    h.state.blockedChapters.add('chapter-1');
    expect(h.quick.open({ actionId: 'tighten' })).toBe(true);
    await flush();

    expect(h.context.isBlocked).toHaveBeenCalledWith(h.project, 'chapter-1');
    expect(h.prompt.phase).toBe('blocked');
    expect(h.prompt.blocked).toEqual({ code: 'noAI', message: NO_AI });
    // Anchored on a caret, with no target marked
    const [from, to, options] = h.editor.captureRange.mock.calls[0];
    expect(from).toBe(to);
    expect(options).toEqual({ highlight: false });
    expect(h.ui.openPrompt.mock.calls[0][1].mode).toBe('write');   // the core keeps an empty range only in this mode

    expect(h.ai.requestEdit).not.toHaveBeenCalled();
    expect(h.context.build).not.toHaveBeenCalled();
    expect(h.text.maskSpans).not.toHaveBeenCalled();

    // Nothing can be sent from a blocked prompt either
    h.send({ type: 'submit', instruction: 'Tiivistä' });
    h.send({ type: 'action', actionId: 'tighten', extra: '' });
    expect(h.ai.requestEdit).not.toHaveBeenCalled();

    // Closing it leaves the author's selection as it was
    h.send({ type: 'close', reason: 'button' });
    expect(h.ui.closePrompt).toHaveBeenCalledWith(h.view, { restore: 'none' });
  });

  test('open on a selection over 12 000 characters opens blocked with the character counts', () => {
    const long = 'sana '.repeat(2400) + 'loppu';   // 12 005 characters
    const h = harness({ marked: `|${long}|` });
    expect(h.quick.open({ actionId: 'tighten' })).toBe(true);
    expect(h.prompt.phase).toBe('blocked');
    expect(h.prompt.blocked.code).toBe('too-long');
    expect(h.prompt.blocked.message).toBe(
      `Valinta on liian pitkä pikamuokkaukseen (${(12005).toLocaleString('fi-FI')} merkkiä, enintään ${(12000).toLocaleString('fi-FI')}). Valitse lyhyempi kohta.`
    );
    expect(h.ai.requestEdit).not.toHaveBeenCalled();

    // Exactly at the limit is fine
    const limit = harness({ marked: `|${'a'.repeat(LIMITS.maxTarget)}|` });
    limit.quick.open();
    expect(limit.prompt.phase).toBe('idle');
  });

  test('a target that contains the answer tag opens blocked', () => {
    for (const marked of ['|Tässä on <teksti> keskellä.|', '|Tässä on </teksti> keskellä.|', '|Tässä on <TEKSTI> keskellä.|']) {
      const h = harness({ marked });
      h.quick.open();
      expect(h.prompt.blocked).toEqual({
        code: 'reserved-tag',
        message: 'Valinnassa on <teksti>-tagi, jota pikamuokkaus käyttää itse. Poista se valinnasta.'
      });
    }
  });

  test('a second open focuses the existing prompt', () => {
    const h = harness();
    expect(h.quick.open()).toBe(true);
    expect(h.ui.focusPrompt).not.toHaveBeenCalled();

    expect(h.quick.open()).toBe(true);
    expect(h.ui.focusPrompt).toHaveBeenCalledTimes(1);
    expect(h.ui.focusPrompt).toHaveBeenCalledWith(h.view);
    expect(h.ui.openPrompt).toHaveBeenCalledTimes(1);
    expect(h.editor.captureRange).toHaveBeenCalledTimes(1);

    // From the context menu: the open prompt is left alone
    expect(h.quick.open({ actionId: 'clarify', requireSelection: true })).toBe(true);
    expect(h.ui.focusPrompt).toHaveBeenCalledTimes(1);
    expect(h.ai.requestEdit).not.toHaveBeenCalled();
  });

  test('open while a draft is streaming into the text does nothing and says it is handled', () => {
    const h = harness();
    h.editor.block = { id: 'b9', pos: 3, meta: null, attempts: [{ text: 'Alkua', status: 'streaming', note: null }], attempt: 0 };
    expect(h.quick.open()).toBe(true);
    expect(h.ui.openPrompt).not.toHaveBeenCalled();
    expect(h.editor.captureRange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Sending an edit
// ---------------------------------------------------------------------------

describe('edit request', () => {
  test('an action sends at once with the action prompt and adds the field text as Lisäohje', () => {
    // From the menu: the action runs as the prompt opens
    const menu = harness();
    expect(menu.quick.open({ actionId: 'tighten', requireSelection: true })).toBe(true);
    expect(menu.ai.requestEdit).toHaveBeenCalledTimes(1);
    expect(menu.context.build.mock.calls[0][0].task.instruction).toBe(findAction('tighten').prompt);
    expect(menu.prompt).toMatchObject({ phase: 'sending', waiting: true, title: 'Tiivistä', instruction: '' });

    // 'custom' only opens the prompt
    const custom = harness();
    custom.quick.open({ actionId: 'custom', requireSelection: true });
    expect(custom.ai.requestEdit).not.toHaveBeenCalled();
    expect(custom.prompt.phase).toBe('idle');

    // A chip, with text in the field
    const chip = harness();
    chip.quick.open();
    chip.send({ type: 'action', actionId: 'tighten', extra: '  säilytä Åken nimi  ' });
    expect(chip.context.build.mock.calls[0][0].task.instruction).toBe(`${findAction('tighten').prompt}\nLisäohje: säilytä Åken nimi`);
    expect(chip.ai.requestEdit).toHaveBeenCalledTimes(1);
    // What the author typed returns to the field if the request stops
    expect(chip.prompt).toMatchObject({ phase: 'sending', title: 'Tiivistä', instruction: 'säilytä Åken nimi' });

    // An unknown action sends nothing
    const unknown = harness();
    unknown.quick.open();
    unknown.send({ type: 'action', actionId: 'ei-ole', extra: '' });
    expect(unknown.ai.requestEdit).not.toHaveBeenCalled();
  });

  test('the request masks [TODO: …] and <u>, passes the placeholder rule to the task and the masked text as original', async () => {
    const h = harness({ marked: 'Alku. |Tarkista [TODO: vuosi] ja <u>tämä</u> kohta huolella.| Loppu.' });
    h.quick.open();
    h.send({ type: 'submit', instruction: 'Tiivistä' });

    const masked = 'Tarkista ⟦1⟧ ja ⟦2⟧tämä⟦/2⟧ kohta huolella.';
    expect(h.text.maskSpans).toHaveBeenCalledWith('Tarkista [TODO: vuosi] ja <u>tämä</u> kohta huolella.', { structure: false });
    expect(h.text.placeholderInstruction).toHaveBeenCalledWith('fi');

    const { task } = h.context.build.mock.calls[0][0];
    expect(task.payload).toBe(masked);
    expect(task.payloadTag).toBe('valinta');
    expect(task.rules).toContain(`- ${PLACEHOLDER_RULE}`);
    expect(h.lastCall.opts.original).toBe(masked);
    // The note and the tags themselves are in nothing that is sent
    expect(JSON.stringify(h.lastCall.opts.messages)).not.toContain('[TODO:');
    expect(JSON.stringify(h.lastCall.opts.messages)).not.toContain('<u>');

    // The answer comes back with the placeholders; the suggestions never touch the note
    h.lastCall.accept('Tarkista ⟦1⟧ ja ⟦2⟧tämä⟦/2⟧ kohta.');
    await flush();
    const [changes] = h.editor.proposeChanges.mock.calls[0];
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) {
      expect(change.original).not.toContain('TODO');
      expect(change.insert).not.toContain('⟦');
    }
  });

  test('a target without protected spans gets no placeholder rule, and a multi-line target is masked with its structure', () => {
    const plain = harness();
    plain.quick.open();
    plain.send({ type: 'submit', instruction: 'Tiivistä' });
    expect(plain.context.build.mock.calls[0][0].task.rules.some((rule) => rule.includes('paikkamerk'))).toBe(false);
    expect(plain.text.placeholderInstruction).not.toHaveBeenCalled();

    const lines = harness({ marked: '|# Otsikko\n– Älä mene, Åke sanoi.|' });
    lines.quick.open();
    lines.send({ type: 'submit', instruction: 'Selkeytä' });
    expect(lines.text.maskSpans).toHaveBeenCalledWith('# Otsikko\n– Älä mene, Åke sanoi.', { structure: true });
  });

  test('the request sends built.system and built.messages unchanged, role edit and thinking off', () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'submit', instruction: 'Tiivistä vähän' });

    const args = h.context.build.mock.calls[0][0];
    const built = h.context.build.mock.results[0].value;
    const { opts } = h.lastCall;

    expect(opts.system).toBe(built.system);
    expect(opts.messages).toBe(built.messages);
    expect(opts.role).toBe('edit');
    expect(opts.thinking).toBe('off');
    expect(opts.maxTokens).toBe(args.task.answerTokens);
    expect(opts).not.toHaveProperty('stopSequences');
    expect(opts).not.toHaveProperty('model');
    expect(typeof opts.onText).toBe('function');

    // What the builder was given
    const from = 'Alku. '.length;
    expect(args).toMatchObject({
      project: h.project,
      chapterId: 'chapter-1',
      text: h.editor.value,
      selection: { from, to: from + TARGET.length },
      role: 'edit',
      answerTokens: args.task.answerTokens
    });
    expect(args.model).toBeUndefined();
    expect(args.task).toMatchObject({ id: 'edit', instruction: 'Tiivistä vähän', payload: TARGET, limits: { before: 1500, after: 500 } });
  });

  test('the log meta carries the typed instruction, never a built-in prompt', () => {
    const builtin = harness();
    builtin.quick.open();
    builtin.send({ type: 'action', actionId: 'tighten', extra: 'säilytä nimet' });
    expect(builtin.lastCall.opts.meta).toEqual({ action: 'quick-edit', actionLabel: 'Tiivistä', instruction: 'säilytä nimet', chapterId: 'chapter-1' });

    const bare = harness();
    bare.quick.open({ actionId: 'show' });
    expect(bare.lastCall.opts.meta).toEqual({ action: 'quick-edit', actionLabel: 'Näytä, älä kerro', instruction: '', chapterId: 'chapter-1' });
    expect(JSON.stringify(bare.lastCall.opts.meta)).not.toContain('aistihavainnoissa');

    const typed = harness();
    typed.quick.open();
    const long = 'Tee tästä kappaleesta selvästi tiiviimpi, mutta säilytä ”sitaatit” – ja Åken ääni.';
    typed.send({ type: 'submit', instruction: `  ${long}  ` });
    // The title is cut at 40 characters, without the space before the cut, and says it was cut
    expect(typed.lastCall.opts.meta).toEqual({ action: 'quick-edit', actionLabel: `${long.slice(0, 40)}…`, instruction: long, chapterId: 'chapter-1' });
    expect(typed.prompt.title).toBe('Tee tästä kappaleesta selvästi tiiviimpi…');

    // A saved prompt is the author's own text
    const own = [{ id: 'user-1', label: 'Säilytä murre', prompt: 'Älä yleiskielistä vuorosanoja.', created: 1 }];
    const saved = harness({ settings: { savedPrompts: own } });
    saved.quick.open();
    saved.send({ type: 'action', actionId: 'user-1', extra: '' });
    expect(saved.lastCall.opts.meta).toMatchObject({ actionLabel: 'Säilytä murre', instruction: 'Älä yleiskielistä vuorosanoja.' });
  });

  test('a submit with nothing typed, or in a phase without a field, sends nothing', () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'submit', instruction: '   ' });
    expect(h.ai.requestEdit).not.toHaveBeenCalled();

    h.send({ type: 'submit', instruction: 'Tiivistä' });
    h.send({ type: 'submit', instruction: 'Toinen pyyntö kesken ensimmäisen' });
    h.send({ type: 'action', actionId: 'clarify', extra: '' });
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(1);   // one request at a time
  });

  test('the streamed text is shown unmasked through the scheduler', () => {
    const scheduled = [];
    const h = harness({
      marked: 'Alku. |Tarkista [TODO: vuosi] ja <u>tämä</u> kohta.| Loppu.',
      deps: { schedule: (fn) => scheduled.push(fn) }
    });
    h.quick.open();
    h.send({ type: 'submit', instruction: 'Tiivistä' });

    h.lastCall.stream('<teksti>Tarkista ⟦1⟧ ja ⟦2');
    expect(h.prompt.preview).toBe('');            // not drawn before the scheduler runs it
    scheduled.shift()();
    expect(h.prompt).toMatchObject({ phase: 'sending', waiting: false, preview: 'Tarkista [TODO: vuosi] ja ' });
    expect(h.text.cleanModelOutput).toHaveBeenCalledWith('<teksti>Tarkista ⟦1⟧ ja ⟦2', { tag: 'teksti' });

    h.lastCall.stream('<teksti>Tarkista ⟦1⟧ ja ⟦2⟧tämä⟦/2⟧.');
    scheduled.shift()();
    expect(h.prompt.preview).toBe('Tarkista [TODO: vuosi] ja <u>tämä</u>.');
  });
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

describe('edit result', () => {
  test('a good answer becomes one proposeChanges call with the rangeId, keepRange and the request\'s logMeta', async () => {
    const h = harness();
    await withResult(h, SHORTER);

    expect(h.editor.proposeChanges).toHaveBeenCalledTimes(1);
    const [changes, options] = h.editor.proposeChanges.mock.calls[0];
    expect(options).toEqual({ rangeId: 'r1', keepRange: true, replaceGroupId: undefined, meta: h.lastCall.logMeta });
    expect(options.meta).toBe(h.lastCall.logMeta);
    expect(changes).toEqual(wordDiff(TARGET, SHORTER));
    expect(changes).toHaveLength(2);

    // Nothing was written to the manuscript, and nothing was accepted on the author's behalf
    expect(h.editor.value).toBe(`Alku. ${TARGET} Loppu.`);
    expect(h.editor.acceptGroup).not.toHaveBeenCalled();
    expect(h.controller.acceptAll).not.toHaveBeenCalled();

    expect(h.prompt).toMatchObject({ phase: 'result', index: 0, draft: '' });
    expect(h.prompt.attempts).toEqual([{ id: expect.any(String), title: 'Tiivistä', modelName: 'muokkaus-malli', changeCount: 2, note: null }]);
    // The suggestions show the place now
    expect(h.editor.setRangeHighlight).toHaveBeenCalledWith('r1', false);
  });

  test('every proposed change carries original', async () => {
    const h = harness();
    // A diff that leaves `original` out: the controller fills it in from the range text
    h.text.wordDiff.mockImplementation((a, b) => wordDiff(a, b).map(({ from, to, insert }) => ({ from, to, insert })));
    await withResult(h, SHORTER);

    const [changes] = h.editor.proposeChanges.mock.calls[0];
    expect(changes).toHaveLength(2);
    for (const change of changes) {
      expect(typeof change.original).toBe('string');
      // Offsets are offsets in the captured range's text, not in the document
      expect(change.original).toBe(TARGET.slice(change.from, change.to));
    }
    expect(changes.map((change) => change.original)).toEqual(['hyvin ', 'öistä ']);
  });

  test('the answer is fitted to the target: its own whitespace at the ends is not proposed', async () => {
    const h = harness();
    await withResult(h, `\n  ${SHORTER}  \n`);
    const [changes] = h.editor.proposeChanges.mock.calls[0];
    expect(changes).toEqual(wordDiff(TARGET, SHORTER));
  });

  test('typography normalisation runs on the unmasked text with the original beside it', async () => {
    const normalizeTypography = jest.fn((value) => value.replace(/"/g, '”'));
    const h = harness({ deps: { normalizeTypography } });
    await withResult(h, 'Åke käveli "hitaasti" pitkin rantaa.');
    expect(normalizeTypography).toHaveBeenCalledWith('Åke käveli "hitaasti" pitkin rantaa.', TARGET);
    const [changes] = h.editor.proposeChanges.mock.calls[0];
    expect(changes.map((change) => change.insert).join('')).toContain('”hitaasti”');
  });

  test('a result that is not accepted proposes nothing and shows result.reasonText with the raw answer as detail', async () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'submit', instruction: 'Tiivistä tämä' });
    const reasonText = 'Ei ehdotusta: vastauksesta puuttuu sulkeva </teksti>-tagi. Vastaus katkesi tai malli vastasi muulla kuin muokatulla tekstillä.';
    const raw = `Valitettavasti en voi auttaa tässä. ${'ö'.repeat(600)}`;
    h.lastCall.fail('missing_tag', reasonText, { text: raw });
    await flush();

    expect(h.editor.proposeChanges).not.toHaveBeenCalled();
    expect(h.text.unmaskSpans).not.toHaveBeenCalled();
    expect(h.prompt.phase).toBe('error');
    expect(h.prompt.error).toEqual({ code: 'missing_tag', message: reasonText, detail: raw.slice(0, 400) });
    expect(h.prompt.error.detail).toHaveLength(400);
    // The instruction is back in the field
    expect(h.prompt.draft).toBe('Tiivistä tämä');
    expect(h.editor.focus).not.toHaveBeenCalled();
  });

  test('an unchanged answer proposes nothing and notes Malli ei ehdottanut muutoksia.', async () => {
    const h = harness();
    await withResult(h, `  ${TARGET}\n`);

    expect(h.editor.proposeChanges).not.toHaveBeenCalled();
    expect(h.text.wordDiff).not.toHaveBeenCalled();
    expect(h.prompt.phase).toBe('result');
    expect(h.prompt.attempts[0]).toMatchObject({ changeCount: 0, note: 'Malli ei ehdottanut muutoksia.' });
  });

  test('an unchanged later attempt withdraws the suggestions of the one before it', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    expect(h.editor.pending).toHaveLength(2);

    h.send({ type: 'refine', instruction: 'palauta alkuperäinen' });
    h.lastCall.accept(TARGET);
    await flush();

    expect(h.editor.removeSuggestions).toHaveBeenCalledWith(['s1', 's2']);
    expect(h.editor.pending).toHaveLength(0);
    expect(h.editor.rejectGroup).not.toHaveBeenCalled();   // no log line, nothing for "Palauta hylätyt"
    expect(h.prompt.attempts[1]).toMatchObject({ changeCount: 0, note: 'Malli ei ehdottanut muutoksia.' });
  });

  test('text edited inside the target during the request gives the changed reason and no proposal', async () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'submit', instruction: 'Tiivistä' });
    // The author types inside the target while the model works
    h.editor.value = h.editor.value.replace('hitaasti', 'nopeasti');
    h.lastCall.accept(SHORTER);
    await flush();

    expect(h.editor.proposeChanges).not.toHaveBeenCalled();
    expect(h.prompt.phase).toBe('error');
    expect(h.prompt.error).toEqual({
      code: 'changed',
      message: 'Teksti muuttui pyynnön aikana. Ehdotuksia ei tehty. Lähetä ohje uudelleen.',
      detail: ''
    });
  });

  test('a proposal the suggestion layer refuses is reported as a conflict or as changed text', async () => {
    const conflict = harness();
    conflict.quick.open();
    conflict.send({ type: 'submit', instruction: 'Tiivistä' });
    conflict.editor.proposeError = 'no-changes';
    conflict.lastCall.accept(SHORTER);
    await flush();
    expect(conflict.prompt.error).toMatchObject({ code: 'conflict', message: 'Kohdassa on jo käsittelemätön ehdotus. Käsittele se ensin.' });
    expect(conflict.prompt.attempts).toHaveLength(0);

    const changed = harness();
    changed.quick.open();
    changed.send({ type: 'submit', instruction: 'Tiivistä' });
    changed.editor.proposeError = 'target-changed';
    changed.lastCall.accept(SHORTER);
    await flush();
    expect(changed.prompt.error.code).toBe('changed');
  });

  test('an over-budget build fails before any request', () => {
    const h = harness();
    h.quick.open();
    h.state.nextBuilt = { overBudget: true, totalTokens: 5200, budgetTokens: 3900 };
    h.send({ type: 'submit', instruction: 'Tiivistä tämä' });

    expect(h.ai.requestEdit).not.toHaveBeenCalled();
    expect(h.prompt.phase).toBe('error');
    expect(h.prompt.error).toEqual({
      code: 'over-budget',
      // The token numbers are grouped with a no-break space, like every count
      message: 'Teksti on liian pitkä tälle mallille: noin 5\u00A0200 tokenia, tilaa 3\u00A0900. Lyhennä valintaa tai vaihda mallia.',
      detail: ''
    });
    // The instruction stays in the field
    expect(h.prompt.draft).toBe('Tiivistä tämä');

    // "…tai vaihda mallia": another model can be tried from here
    h.send({ type: 'try-model', modelId: 'cherry:toinen-malli' });
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(1);
    expect(h.lastCall.opts.model).toBe('cherry:toinen-malli');
  });

  test('a rewrite the suggestion layer could propose only in part is withdrawn and reported as a conflict', async () => {
    const h = harness();
    // Like the real layer when a suggestion of another feature is in the way of one change
    const real = h.editor.proposeChanges.getMockImplementation();
    h.editor.proposeChanges.mockImplementationOnce((changes, options) => {
      const res = real(changes.slice(1), options);
      return { ...res, skipped: [{ index: 0, reason: 'conflict' }] };
    });
    await withResult(h, SHORTER);

    expect(h.editor.proposeChanges).toHaveBeenCalledTimes(1);
    expect(h.editor.removeSuggestions).toHaveBeenCalledWith(['s1']);
    expect(h.editor.pending).toEqual([]);
    expect(h.prompt.phase).toBe('error');
    expect(h.prompt.error).toMatchObject({ code: 'conflict', message: 'Kohdassa on jo käsittelemätön ehdotus. Käsittele se ensin.' });
    expect(h.prompt.attempts).toEqual([]);
    // "Hyväksy muutokset" has no part of an answer to accept
    h.send({ type: 'accept-all' });
    expect(h.controller.acceptAll).not.toHaveBeenCalled();

    // Once the way is clear the same request gives the whole rewrite
    h.send({ type: 'retry' });
    h.lastCall.accept(SHORTER);
    await flush();
    expect(h.prompt).toMatchObject({ phase: 'result' });
    expect(h.prompt.attempts[0].changeCount).toBe(2);
  });

  test('a chapter the builder refuses is shown as blocked', () => {
    const h = harness();
    h.quick.open();
    h.state.nextBuilt = { blocked: 'noAI' };
    h.send({ type: 'submit', instruction: 'Tiivistä' });
    expect(h.ai.requestEdit).not.toHaveBeenCalled();
    expect(h.prompt.phase).toBe('blocked');
    expect(h.prompt.blocked).toEqual({ code: 'noAI', message: NO_AI });
  });

  test('cancel calls the handle\'s cancel and keeps the instruction', async () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'submit', instruction: 'Tiivistä tämä' });
    h.lastCall.stream('<teksti>Åke käveli');
    expect(h.prompt.phase).toBe('sending');

    h.send({ type: 'cancel' });
    expect(h.lastCall.cancel).toHaveBeenCalledTimes(1);
    await flush();

    expect(h.prompt).toMatchObject({ phase: 'idle', draft: 'Tiivistä tämä', note: 'Pyyntö pysäytettiin.', preview: '' });
    expect(h.editor.proposeChanges).not.toHaveBeenCalled();
    expect(h.ui.closePrompt).not.toHaveBeenCalled();
    // The prompt is usable again
    h.send({ type: 'submit', instruction: 'Tiivistä tämä' });
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(2);
  });

  test('after a result the controller focuses the editor and leaves the prompt open', async () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'action', actionId: 'tighten', extra: '' });
    // Opening and sending leave the focus where it is
    expect(h.editor.focus).not.toHaveBeenCalled();

    h.lastCall.accept(SHORTER);
    await flush();
    expect(h.editor.focus).toHaveBeenCalledTimes(1);
    expect(h.ui.closePrompt).not.toHaveBeenCalled();
    expect(h.ui.current).not.toBeNull();
    expect(h.prompt.phase).toBe('result');

    // The focus comes after the prompt shows the result
    const lastUpdate = h.ui.updatePrompt.mock.invocationCallOrder[h.ui.updatePrompt.mock.calls.length - 1];
    expect(h.editor.focus.mock.invocationCallOrder[0]).toBeGreaterThan(lastUpdate);

    // Cmd+K puts it back into the field
    h.quick.open();
    expect(h.ui.focusPrompt).toHaveBeenCalledTimes(1);
  });

  test('a result does not pull the focus out of another field the author went to', async () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'action', actionId: 'tighten', extra: '' });
    const notes = { tagName: 'TEXTAREA', closest: () => null };
    global.document = { activeElement: notes, body: {} };
    try {
      h.lastCall.accept(SHORTER);
      await flush();
      expect(h.prompt.phase).toBe('result');
      expect(h.editor.focus).not.toHaveBeenCalled();
    } finally {
      delete global.document;
    }
  });

  test('a result takes the focus from a button or a tab the author clicked during the wait', async () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'action', actionId: 'tighten', extra: '' });
    global.document = { activeElement: { tagName: 'BUTTON', closest: () => null }, body: {} };
    try {
      h.lastCall.accept(SHORTER);
      await flush();
      expect(h.prompt.phase).toBe('result');
      expect(h.editor.focus).toHaveBeenCalledTimes(1);

      // A text input or an editable element is typing, and keeps the focus
      for (const element of [{ tagName: 'INPUT', type: 'search' }, { tagName: 'DIV', isContentEditable: true }]) {
        const other = harness();
        other.quick.open();
        other.send({ type: 'action', actionId: 'tighten', extra: '' });
        global.document.activeElement = { ...element, closest: () => null };
        other.lastCall.accept(SHORTER);
        await flush();
        expect(other.editor.focus).not.toHaveBeenCalled();
      }
    } finally {
      delete global.document;
    }
  });

  test('a strict action with a change ratio above 0.3 adds the rewrite note', async () => {
    const strict = harness();
    strict.text.changeRatio.mockReturnValue(0.424);
    await withResult(strict, SHORTER, 'proofread');
    expect(strict.text.changeRatio).toHaveBeenCalledWith(TARGET, SHORTER);
    expect(strict.prompt.attempts[0].note).toBe('Malli kirjoitti tekstiä laajasti uudelleen (muutoksia 42 %).');

    // Exactly 0.3 is still fine
    const edge = harness();
    edge.text.changeRatio.mockReturnValue(0.3);
    await withResult(edge, SHORTER, 'proofread');
    expect(edge.prompt.attempts[0].note).toBeNull();

    // An action that is meant to rewrite is not warned about
    const free = harness();
    free.text.changeRatio.mockReturnValue(0.9);
    await withResult(free, SHORTER, 'tighten');
    expect(free.prompt.attempts[0].note).toBeNull();
  });

  test('a repaired placeholder adds the restored-marker note', async () => {
    const one = harness({ marked: 'Alku. |Tarkista [TODO: vuosi] ja tämä kohta huolella.| Loppu.' });
    one.quick.open();
    one.send({ type: 'submit', instruction: 'Tiivistä' });
    one.lastCall.accept('Tarkista tämä kohta.');   // the model dropped ⟦1⟧
    await flush();
    expect(one.prompt.attempts[0].note).toBe('1 suojattu kohta puuttui vastauksesta, ja se palautettiin paikalleen.');
    // The note is back in the proposed text: accepting everything keeps it in the manuscript
    for (const id of one.editor.pending.map((item) => item.id).reverse()) one.editor.accept(id);
    expect(one.editor.value).toBe('Alku. Tarkista tämä kohta. [TODO: vuosi] Loppu.');

    const two = harness({ marked: 'Alku. |Tarkista [TODO: vuosi] ja [TODO: nimi] huolella.| Loppu.' });
    two.quick.open();
    two.send({ type: 'submit', instruction: 'Tiivistä' });
    two.lastCall.accept('Tarkista huolella.');
    await flush();
    expect(two.prompt.attempts[0].note).toBe('2 suojattua kohtaa puuttui vastauksesta, ja ne palautettiin paikalleen.');
  });
});

// ---------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------

describe('attempts', () => {
  test('refine sends three messages and appends a second attempt that replaces the first group (replaceGroupId)', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    const first = h.ai.calls[0];
    const built = h.context.build.mock.results[0].value;

    h.send({ type: 'refine', instruction: '  vielä lyhyemmin  ' });
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(2);
    expect(h.context.build).toHaveBeenCalledTimes(1);   // the same request, continued

    const { opts } = h.lastCall;
    expect(opts.system).toBe(built.system);
    expect(opts.messages).toEqual([
      built.messages[0],
      { role: 'assistant', content: `<teksti>\n${SHORTER}\n</teksti>` },
      { role: 'user', content: 'Tarkenna edellistä versiota tällä ohjeella: vielä lyhyemmin\n\nPalauta koko teksti uudelleen <teksti>-tagien sisällä. Muuta vain se, mitä tarkennus vaatii.' }
    ]);
    expect(opts.messages[0]).toBe(built.messages[0]);
    expect(opts.maxTokens).toBe(first.opts.maxTokens);
    expect(opts.thinking).toBe('off');
    expect(opts.original).toBe(first.opts.original);
    expect(opts.role).toBe('edit');
    expect(opts.meta).toEqual({ action: 'quick-edit', actionLabel: 'vielä lyhyemmin', instruction: 'vielä lyhyemmin', chapterId: 'chapter-1' });
    expect(h.prompt).toMatchObject({ phase: 'sending', instruction: 'vielä lyhyemmin' });

    h.lastCall.accept('Åke käveli rantaa.');
    await flush();

    expect(h.editor.proposeChanges).toHaveBeenCalledTimes(2);
    expect(h.editor.proposeChanges.mock.calls[1][1]).toMatchObject({ rangeId: 'r1', keepRange: true, replaceGroupId: 'g1' });
    // Only the new attempt's suggestions are in the text
    expect(new Set(h.editor.pending.map((item) => item.groupId))).toEqual(new Set(['g2']));
    expect(h.prompt.attempts.map((item) => item.title)).toEqual(['Tiivistä', 'vielä lyhyemmin']);
    expect(h.prompt.index).toBe(1);

    // A second refinement still sends three messages, with the attempt on screen as the model's turn
    h.send({ type: 'refine', instruction: 'lisää ”hitaasti” takaisin' });
    expect(h.lastCall.opts.messages).toHaveLength(3);
    expect(h.lastCall.opts.messages[1].content).toBe('<teksti>\nÅke käveli rantaa.\n</teksti>');
  });

  test('refine after a partial accept recaptures the range and sends a fresh request on the current text', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    // The author accepts the first suggestion in the text: "hyvin " is gone
    h.editor.accept('s1');
    const current = 'Åke käveli hitaasti pitkin öistä rantaa.';
    expect(h.editor.getRange('r1').intact).toBe(false);

    h.send({ type: 'refine', instruction: 'vielä lyhyemmin' });

    // The range as it is now, without a highlight; the prompt moves to it before the old one goes
    const from = 'Alku. '.length;
    expect(h.editor.captureRange).toHaveBeenCalledTimes(2);
    expect(h.editor.captureRange).toHaveBeenLastCalledWith(from, from + current.length, { highlight: false });
    expect(h.ui.openPrompt).toHaveBeenLastCalledWith(h.view, expect.objectContaining({ mode: 'edit', rangeId: 'r2' }));
    expect(h.editor.releaseRange).toHaveBeenCalledWith('r1');
    expect(h.ui.openPrompt.mock.invocationCallOrder[1]).toBeLessThan(h.editor.releaseRange.mock.invocationCallOrder[0]);
    expect(h.ui.current).not.toBeNull();
    expect(h.ui.closePrompt).not.toHaveBeenCalled();

    // A fresh request: built again on the current text, one message
    expect(h.context.build).toHaveBeenCalledTimes(2);
    const args = h.context.build.mock.calls[1][0];
    expect(args.task.payload).toBe(current);
    expect(args.task.instruction).toBe(`${findAction('tighten').prompt}\nTarkennus: vielä lyhyemmin`);
    expect(args.selection).toEqual({ from, to: from + current.length });
    expect(h.lastCall.opts.messages).toHaveLength(1);
    expect(h.lastCall.opts.original).toBe(current);
    expect(h.lastCall.opts.meta.instruction).toBe('Tarkennus: vielä lyhyemmin');

    h.lastCall.accept('Åke käveli rantaa.');
    await flush();
    expect(h.editor.proposeChanges).toHaveBeenLastCalledWith(
      wordDiff(current, 'Åke käveli rantaa.'),
      expect.objectContaining({ rangeId: 'r2', keepRange: true, replaceGroupId: 'g1' })
    );
    expect(h.prompt.attempts).toHaveLength(2);
  });

  test('refine after a stopped fresh request is again a fresh request', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    // The author changes a word inside the target: the attempt on screen is a version of older text
    h.editor.value = h.editor.value.replace('hyvin', 'aivan');
    const current = 'Åke käveli aivan hitaasti pitkin öistä rantaa.';

    h.send({ type: 'refine', instruction: 'vielä lyhyemmin' });
    expect(h.lastCall.opts.messages).toHaveLength(1);
    expect(h.lastCall.opts.original).toBe(current);
    h.send({ type: 'cancel' });
    await flush();
    expect(h.prompt.phase).toBe('result');

    // The stopped request brought no attempt: the one on screen still belongs to the old text
    h.send({ type: 'refine', instruction: 'vielä lyhyemmin' });
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(3);
    expect(h.lastCall.opts.messages).toHaveLength(1);
    expect(h.lastCall.opts.original).toBe(current);
    expect(h.context.build).toHaveBeenCalledTimes(3);
    expect(h.context.build.mock.calls[2][0].task.payload).toBe(current);

    // Once an attempt of the new text is on screen, Tarkenna continues it
    h.lastCall.accept('Åke käveli rantaa.');
    await flush();
    h.send({ type: 'refine', instruction: 'lisää aivan' });
    expect(h.lastCall.opts.messages).toHaveLength(3);
    expect(h.lastCall.opts.messages[0]).toBe(h.context.build.mock.results[2].value.messages[0]);
    expect(h.lastCall.opts.original).toBe(current);
  });

  test('select shows the earlier attempt again as a new proposal', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    h.send({ type: 'refine', instruction: 'vielä lyhyemmin' });
    h.lastCall.accept('Åke käveli rantaa.');
    await flush();
    expect(h.prompt.index).toBe(1);
    const focused = h.editor.focus.mock.calls.length;

    h.send({ type: 'select', index: 0 });

    expect(h.ai.requestEdit).toHaveBeenCalledTimes(2);   // nothing is asked again
    expect(h.editor.proposeChanges).toHaveBeenCalledTimes(3);
    const [changes, options] = h.editor.proposeChanges.mock.calls[2];
    expect(changes).toEqual(wordDiff(TARGET, SHORTER));
    expect(options).toMatchObject({ rangeId: 'r1', keepRange: true, replaceGroupId: 'g2', meta: h.ai.calls[0].logMeta });
    expect(new Set(h.editor.pending.map((item) => item.groupId))).toEqual(new Set(['g3']));
    expect(h.prompt).toMatchObject({ phase: 'result', index: 0 });
    expect(h.prompt.attempts[0].changeCount).toBe(2);
    expect(h.prompt.attempts).toHaveLength(2);
    expect(h.editor.focus.mock.calls.length).toBe(focused + 1);

    // Out of range is clamped; the attempt already on screen is not proposed again
    h.send({ type: 'select', index: -3 });
    expect(h.editor.proposeChanges).toHaveBeenCalledTimes(3);
    h.send({ type: 'select', index: 9 });
    expect(h.prompt.index).toBe(1);
    expect(h.editor.proposeChanges).toHaveBeenCalledTimes(4);
  });

  test('try-model builds again for the other model, resends, and stores the model', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    const firstBuilt = h.context.build.mock.results[0].value;

    h.send({ type: 'try-model', modelId: 'cherry:toinen-malli' });

    expect(h.context.build).toHaveBeenCalledTimes(2);
    const args = h.context.build.mock.calls[1][0];
    expect(args.model).toBe('cherry:toinen-malli');
    expect(args.task.payload).toBe(TARGET);                       // the same task
    expect(args.task.instruction).toBe(findAction('tighten').prompt);
    const secondBuilt = h.context.build.mock.results[1].value;
    expect(secondBuilt).not.toBe(firstBuilt);

    expect(h.ai.requestEdit).toHaveBeenCalledTimes(2);
    expect(h.lastCall.opts.model).toBe('cherry:toinen-malli');
    expect(h.lastCall.opts.system).toBe(secondBuilt.system);
    expect(h.lastCall.opts.messages).toBe(secondBuilt.messages);
    expect(h.lastCall.opts.meta.actionLabel).toBe('Tiivistä');
    expect(h.settings.set).toHaveBeenCalledWith('quickEdit', { otherModel: 'cherry:toinen-malli', length: 'paragraph' });

    h.lastCall.accept('Åke käveli rantaa.');
    await flush();
    expect(h.prompt.attempts).toHaveLength(2);
    expect(h.prompt.attempts[1]).toMatchObject({ title: 'toinen-malli', modelName: 'toinen-malli' });
    expect(h.editor.proposeChanges.mock.calls[1][1]).toMatchObject({ replaceGroupId: 'g1' });

    // "Tarkenna" continues on the session's own model: the other model's request is not reused
    h.send({ type: 'refine', instruction: 'lyhyemmin' });
    expect(h.lastCall.opts.messages[0]).toBe(firstBuilt.messages[0]);
    expect(h.lastCall.opts).not.toHaveProperty('model');
  });

  test('a stopped try-model run leaves the Tarkenna field empty, so Enter does not send the first instruction as a refinement', async () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'submit', instruction: 'Tiivistä tämä kohta' });
    h.lastCall.accept(SHORTER);
    await flush();
    expect(h.prompt).toMatchObject({ phase: 'result', draft: '' });

    h.send({ type: 'try-model', modelId: 'cherry:toinen-malli' });
    h.send({ type: 'cancel' });
    await flush();
    expect(h.prompt).toMatchObject({ phase: 'result', draft: '', note: 'Pyyntö pysäytettiin.' });

    // A failed try-model run from the error phase gives the field back what it held
    const failed = harness();
    failed.quick.open();
    failed.send({ type: 'submit', instruction: 'Tiivistä tämä kohta' });
    failed.lastCall.fail('empty', 'Ei ehdotusta: malli palautti tyhjän tekstin.');
    await flush();
    failed.send({ type: 'try-model', modelId: 'cherry:toinen-malli' });
    failed.lastCall.fail('empty', 'Ei ehdotusta: malli palautti tyhjän tekstin.');
    await flush();
    expect(failed.prompt).toMatchObject({ phase: 'error', draft: 'Tiivistä tämä kohta' });
  });

  test('the model picker lists the other models and picks the stored one, the prose model or the first', async () => {
    const h = harness();
    await withResult(h, SHORTER);

    h.send({ type: 'picker', open: true });
    await flush();
    expect(h.ai.listModels).toHaveBeenCalledTimes(1);
    // Without the model of the attempt on screen
    expect(h.prompt.models.map((model) => model.id)).toEqual(['cherry:proosa-malli', 'cherry:toinen-malli']);
    expect(h.prompt.otherModel).toBe('cherry:proosa-malli');      // nothing stored: the prose model
    expect(h.prompt.pickerOpen).toBe(true);

    h.send({ type: 'picker', open: false });
    expect(h.prompt.pickerOpen).toBe(false);

    h.settings.values.quickEdit = { otherModel: 'cherry:toinen-malli', length: 'paragraph' };
    h.send({ type: 'picker', open: true });
    await flush();
    expect(h.ai.listModels).toHaveBeenCalledTimes(1);             // asked once
    expect(h.prompt.otherModel).toBe('cherry:toinen-malli');

    // Prose and edit are the same model and nothing is stored: the first entry
    const same = harness();
    same.ai.models.prose = same.ai.models.edit;
    await withResult(same, SHORTER);
    same.send({ type: 'picker', open: true });
    await flush();
    expect(same.prompt.otherModel).toBe('cherry:proosa-malli');
  });

  test('without a model list the picker opens for a typed model id', async () => {
    const empty = harness();
    empty.ai.list = [];
    await withResult(empty, SHORTER);
    empty.send({ type: 'picker', open: true });
    await flush();
    expect(empty.prompt).toMatchObject({ models: [], pickerOpen: true });

    const failing = harness();
    failing.ai.listModels.mockRejectedValue(new Error('verkko'));
    await withResult(failing, SHORTER);
    failing.send({ type: 'picker', open: true });
    await flush();
    expect(failing.prompt).toMatchObject({ models: [], pickerOpen: true });
  });

  test('retry repeats the request that failed', async () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'action', actionId: 'tighten', extra: 'säilytä nimet' });
    h.lastCall.fail('empty', 'Ei ehdotusta: malli palautti tyhjän tekstin.');
    await flush();
    expect(h.prompt.phase).toBe('error');

    h.send({ type: 'retry' });
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(2);
    expect(h.context.build.mock.calls[1][0].task.instruction).toBe(`${findAction('tighten').prompt}\nLisäohje: säilytä nimet`);
    expect(h.lastCall.opts.meta).toMatchObject({ actionLabel: 'Tiivistä', instruction: 'säilytä nimet' });

    // A failed refinement is retried as a refinement
    h.lastCall.accept(SHORTER);
    await flush();
    h.send({ type: 'refine', instruction: 'lyhyemmin' });
    h.lastCall.fail('max_tokens', 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.');
    await flush();
    h.send({ type: 'retry' });
    expect(h.lastCall.opts.messages).toHaveLength(3);
    expect(h.lastCall.opts.messages[2].content).toContain('lyhyemmin');

    // Enter in the field after a failed refinement is still a refinement, with the text as it is now
    h.lastCall.fail('empty', 'Ei ehdotusta: malli palautti tyhjän tekstin.');
    await flush();
    expect(h.prompt).toMatchObject({ phase: 'error', draft: 'lyhyemmin' });
    h.send({ type: 'submit', instruction: 'paljon lyhyemmin' });
    expect(h.lastCall.opts.messages).toHaveLength(3);
    expect(h.lastCall.opts.messages[2].content).toContain('paljon lyhyemmin');
    expect(h.context.build).toHaveBeenCalledTimes(2);   // no new base request was built
  });
});

// ---------------------------------------------------------------------------
// Deciding and closing
// ---------------------------------------------------------------------------

describe('deciding and closing', () => {
  test('accept-all goes through controller.acceptAll with the group id and a reason, and reject-all through controller.rejectAll', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    h.send({ type: 'accept-all' });

    expect(h.controller.acceptAll).toHaveBeenCalledTimes(1);
    expect(h.controller.acceptAll).toHaveBeenCalledWith({ groupId: 'g1', reason: 'Ennen pikamuokkausta: Tiivistä' });
    // Never the facade directly: the snapshot and the log row come from the controller
    expect(h.editor.acceptGroup).not.toHaveBeenCalled();
    expect(h.editor.value).toBe(`Alku. ${SHORTER} Loppu.`);
    expect(h.ui.closePrompt).toHaveBeenCalledWith(h.view, { restore: 'cursor' });
    expect(h.editor.releaseRange).toHaveBeenCalledWith('r1');
    // The prompt is closed while its range still exists: 'cursor' reads it
    expect(h.ui.closePrompt.mock.invocationCallOrder[0]).toBeLessThan(h.editor.releaseRange.mock.invocationCallOrder[0]);

    const other = harness();
    await withResult(other, SHORTER);
    other.send({ type: 'reject-all' });
    expect(other.controller.rejectAll).toHaveBeenCalledTimes(1);
    expect(other.controller.rejectAll).toHaveBeenCalledWith({ groupId: 'g1' });
    expect(other.editor.rejectGroup).not.toHaveBeenCalled();
    expect(other.editor.value).toBe(`Alku. ${TARGET} Loppu.`);
    expect(other.ui.closePrompt).toHaveBeenCalledWith(other.view, { restore: 'none' });
    expect(other.editor.releaseRange).toHaveBeenCalledWith('r1');
  });

  test('accept-all keeps the prompt open with the dialogue note while dialogue suggestions of the group are pending', async () => {
    const baseText = 'Alku. Åke käveli hyvin hitaasti pitkin öistä rantaa. Loppu.';
    const changes = [
      { from: 6, to: 9, insert: 'Åge', original: 'Åke', meta: { dialogue: true, line: { key: 'l1', original: 'a', revised: 'b' } } },
      { from: 17, to: 22, insert: 'tosi', original: 'hyvin' },
      { from: 39, to: 44, insert: 'öisää', original: 'öistä', meta: { dialogue: true } }
    ];
    const proofreadSelection = jest.fn(async () => ({ ok: true, changes, baseText, note: null, reasonText: null, logMeta: { source: 'faust', action: 'proofread', model: 'cherry:muokkaus-malli' } }));
    const h = harness({ deps: { proofreadSelection } });
    h.quick.open();
    h.send({ type: 'action', actionId: 'proofread', extra: '' });
    await flush();
    expect(h.editor.pending).toHaveLength(3);
    const focused = h.editor.focus.mock.calls.length;

    h.send({ type: 'accept-all' });

    expect(h.controller.acceptAll).toHaveBeenCalledWith({ groupId: 'g1', reason: 'Ennen pikamuokkausta: Kielenhuolto – vain virheet' });
    // The two dialogue suggestions are still there, to be decided one at a time
    expect(h.editor.pending.map((item) => item.insert)).toEqual(['Åge', 'öisää']);
    expect(h.ui.closePrompt).not.toHaveBeenCalled();
    expect(h.ui.current).not.toBeNull();
    expect(h.prompt.phase).toBe('result');
    expect(h.prompt.note).toBe('Vuorosanojen ehdotuksia: 2. Käy ne läpi yksitellen.');
    expect(h.editor.focus.mock.calls.length).toBe(focused + 1);

    // When the author has decided them, the next tick closes the prompt
    h.editor.pending = [];
    h.send({ type: 'tick' });
    expect(h.ui.closePrompt).toHaveBeenCalledWith(h.view, { restore: 'none' });
  });

  test('close leaves pending suggestions alone', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    h.send({ type: 'close', reason: 'escape' });

    expect(h.ui.closePrompt).toHaveBeenCalledWith(h.view, { restore: 'none' });
    expect(h.editor.releaseRange).toHaveBeenCalledWith('r1');
    expect(h.editor.pending).toHaveLength(2);
    expect(h.editor.removeSuggestions).not.toHaveBeenCalled();
    expect(h.controller.rejectAll).not.toHaveBeenCalled();
    expect(h.controller.acceptAll).not.toHaveBeenCalled();
    expect(h.editor.rejectGroup).not.toHaveBeenCalled();

    // The session stays: Cmd+K on the same text returns to its attempts, without marking the target again
    expect(h.quick.open()).toBe(true);
    expect(h.editor.captureRange).toHaveBeenLastCalledWith('Alku. '.length, 'Alku. '.length + TARGET.length, { highlight: false });
    expect(h.prompt).toMatchObject({ phase: 'result', index: 0 });
    expect(h.prompt.attempts).toEqual([expect.objectContaining({ title: 'Tiivistä', changeCount: 2 })]);
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(1);
    expect(h.editor.proposeChanges).toHaveBeenCalledTimes(1);
  });

  test('close before a result selects the target again, and during a request it cancels it', async () => {
    const idle = harness();
    idle.quick.open();
    idle.send({ type: 'close', reason: 'escape' });
    expect(idle.ui.closePrompt).toHaveBeenCalledWith(idle.view, { restore: 'selection' });
    expect(idle.editor.releaseRange).toHaveBeenCalledWith('r1');

    const sending = harness();
    sending.quick.open();
    sending.send({ type: 'submit', instruction: 'Tiivistä' });
    sending.send({ type: 'close', reason: 'button' });
    expect(sending.lastCall.cancel).toHaveBeenCalledTimes(1);
    await flush();
    // The cancelled result has no prompt to return to, and nothing is proposed
    expect(sending.ui.current).toBeNull();
    expect(sending.editor.proposeChanges).not.toHaveBeenCalled();
    // A new prompt can be opened and used at once
    sending.quick.open();
    sending.send({ type: 'submit', instruction: 'Tiivistä' });
    expect(sending.ai.requestEdit).toHaveBeenCalledTimes(2);
  });

  test('close on a paragraph target leaves the caret where it was', async () => {
    // Cmd+K on a bare caret: the target is the paragraph, but nothing was selected
    const caret = harness({ marked: 'Alku.\nÅke käveli |hyvin hitaasti.\nLoppu.' });
    caret.quick.open();
    expect(caret.prompt.kind).toBe('paragraph');
    caret.send({ type: 'close', reason: 'escape' });
    expect(caret.ui.closePrompt).toHaveBeenCalledWith(caret.view, { restore: 'none' });

    // Also after a failed request
    const failed = harness({ marked: 'Alku.\nÅke käveli |hyvin hitaasti.\nLoppu.' });
    failed.quick.open();
    failed.send({ type: 'submit', instruction: 'Tiivistä' });
    failed.lastCall.fail('empty', 'Ei ehdotusta: malli palautti tyhjän tekstin.');
    await flush();
    expect(failed.prompt.phase).toBe('error');
    failed.send({ type: 'close', reason: 'button' });
    expect(failed.ui.closePrompt).toHaveBeenCalledWith(failed.view, { restore: 'none' });
  });

  test('a session whose suggestions were all decided is over: Cmd+K starts afresh', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    h.send({ type: 'close', reason: 'escape' });
    // The author rejects both suggestions with the bar
    h.editor.pending = [];

    h.quick.open();
    expect(h.prompt.phase).toBe('idle');
    expect(h.prompt.attempts).toEqual([]);
    expect(h.editor.captureRange).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number), { highlight: true });

    // Also after "Hylkää muutokset"
    const rejected = harness();
    await withResult(rejected, SHORTER);
    rejected.send({ type: 'reject-all' });
    rejected.quick.open();
    expect(rejected.prompt.phase).toBe('idle');
  });

  test('a session with suggestions pending inside a larger target opens on its own text there', async () => {
    const marked = 'Alku. |Åke käveli hyvin hitaasti pitkin öistä rantaa.| Loppu.';
    const h = harness({ marked });
    await withResult(h, SHORTER);
    h.send({ type: 'close', reason: 'escape' });
    expect(h.editor.pending).toHaveLength(2);
    const from = 'Alku. '.length;

    // The whole line is selected now: the session opens in result, anchored on the sentence it rewrote
    h.editor.selectionStart = 0;
    h.editor.selectionEnd = h.editor.value.length;
    expect(h.quick.open()).toBe(true);
    expect(h.prompt).toMatchObject({ phase: 'result', index: 0 });
    expect(h.prompt.attempts).toHaveLength(1);
    expect(h.editor.captureRange).toHaveBeenLastCalledWith(from, from + TARGET.length, { highlight: false });
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(1);
    h.send({ type: 'close', reason: 'escape' });

    // A caret in the same paragraph: the same
    h.editor.selectionStart = 2;
    h.editor.selectionEnd = 2;
    h.quick.open();
    expect(h.prompt.phase).toBe('result');
    expect(h.editor.captureRange).toHaveBeenLastCalledWith(from, from + TARGET.length, { highlight: false });
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(1);
    h.send({ type: 'close', reason: 'escape' });
  });

  test('a session is found again after a partial accept and an editor remount', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    const from = 'Alku. '.length;

    // One suggestion is accepted in the text while the prompt is open; the tick follows the change
    h.editor.accept('s1');
    h.send({ type: 'tick' });
    expect(h.ui.current).not.toBeNull();
    // A chapter switch and back: the editor is replaced without the prompt being closed
    h.quick.host.handle({ type: 'view-destroyed' }, h.view);
    h.ui.current = null;
    h.state.view = { name: 'uusi' };

    // Cmd+K on the very same sentence, as it reads now
    const now = 'Åke käveli hitaasti pitkin öistä rantaa.';
    h.editor.selectionStart = from;
    h.editor.selectionEnd = from + now.length;
    h.quick.open();
    expect(h.prompt.phase).toBe('result');
    expect(h.prompt.attempts).toHaveLength(1);
    expect(h.editor.pending).toHaveLength(1);
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(1);
  });

  test('a target holding pending suggestions of a session whose text is gone opens blocked, and sends nothing', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    h.send({ type: 'close', reason: 'escape' });
    // The author edits the sentence after the prompt closed: its text is not found any more
    h.editor.value = h.editor.value.replace('pitkin', 'pitkää');

    h.editor.selectionStart = 0;
    h.editor.selectionEnd = h.editor.value.length;
    expect(h.quick.open()).toBe(true);
    expect(h.prompt.phase).toBe('blocked');
    expect(h.prompt.blocked).toEqual({ code: 'conflict', message: 'Kohdassa on jo käsittelemätön ehdotus. Käsittele se ensin.' });
    h.send({ type: 'submit', instruction: 'Tiivistä' });
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(1);   // only the first request

    // A target without the session's suggestions is free
    h.send({ type: 'close', reason: 'escape' });
    h.editor.selectionStart = h.editor.value.length - 'Loppu.'.length;
    h.editor.selectionEnd = h.editor.value.length;
    h.quick.open();
    expect(h.prompt.phase).toBe('idle');
  });

  test('a session survives the editor being replaced while its suggestions are still pending', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    // A chapter switch and back: the editor is replaced, the suggestion layer brings the suggestions back
    h.quick.host.handle({ type: 'view-destroyed' }, h.view);
    h.ui.current = null;
    h.state.view = { name: 'uusi' };

    expect(h.quick.open()).toBe(true);
    expect(h.prompt.phase).toBe('result');
    expect(h.prompt.attempts).toHaveLength(1);
    expect(h.ui.openPrompt).toHaveBeenLastCalledWith(h.state.view, expect.objectContaining({ mode: 'edit' }));
  });

  test('a session whose answer changed nothing is shown again on the same text only', async () => {
    const h = harness();
    await withResult(h, TARGET);
    h.send({ type: 'close', reason: 'button' });
    h.quick.open();
    expect(h.prompt.phase).toBe('result');
    expect(h.prompt.attempts[0]).toMatchObject({ changeCount: 0, note: 'Malli ei ehdottanut muutoksia.' });
    h.send({ type: 'close', reason: 'button' });

    // Another chapter with the same sentence is another place
    h.state.chapterId = 'chapter-2';
    h.quick.open();
    expect(h.prompt.phase).toBe('idle');
  });

  test('tick closes the prompt when the group has no pending suggestions left', async () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'tick' });                       // idle: nothing to watch
    expect(h.ui.closePrompt).not.toHaveBeenCalled();

    h.send({ type: 'action', actionId: 'tighten', extra: '' });
    h.send({ type: 'tick' });                       // sending
    h.lastCall.accept(SHORTER);
    await flush();
    h.send({ type: 'tick' });                       // two suggestions pending
    h.editor.accept('s1');
    h.send({ type: 'tick' });                       // one left
    expect(h.ui.closePrompt).not.toHaveBeenCalled();

    h.editor.pending = [];                          // the last one was decided in the text
    h.send({ type: 'tick' });
    expect(h.ui.closePrompt).toHaveBeenCalledTimes(1);
    expect(h.ui.closePrompt).toHaveBeenCalledWith(h.view, { restore: 'none' });
    expect(h.editor.releaseRange).toHaveBeenCalledWith('r1');
    expect(h.ui.current).toBeNull();
  });

  test('tick leaves a result without suggestions open', async () => {
    const h = harness();
    await withResult(h, TARGET);                   // no changes: no group
    h.send({ type: 'tick' });
    expect(h.ui.closePrompt).not.toHaveBeenCalled();
  });

  test('a prompt that closed because its target was deleted cancels its request and frees the range afterwards', async () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'submit', instruction: 'Tiivistä' });

    // The editor core reports it from inside its own update: nothing may be dispatched now
    h.ui.current = null;
    h.send({ type: 'prompt-closed' });
    expect(h.lastCall.cancel).toHaveBeenCalledTimes(1);
    expect(h.editor.releaseRange).not.toHaveBeenCalled();
    expect(h.ui.closePrompt).not.toHaveBeenCalled();
    expect(h.ui.updatePrompt).toHaveBeenCalledTimes(1);   // only the "sending" state, before the close

    await flush();
    expect(h.editor.releaseRange).toHaveBeenCalledWith('r1');
    expect(h.editor.proposeChanges).not.toHaveBeenCalled();
    // The next Cmd+K opens a new prompt
    expect(h.quick.open()).toBe(true);
    expect(h.ui.openPrompt).toHaveBeenCalledTimes(2);
  });

  test('reset cancels the request and empties the sessions', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    h.send({ type: 'close', reason: 'escape' });
    h.quick.open();
    expect(h.prompt.phase).toBe('result');          // the session is there
    h.send({ type: 'refine', instruction: 'lyhyemmin' });
    const running = h.lastCall;

    h.quick.reset();

    expect(running.cancel).toHaveBeenCalledTimes(1);
    expect(h.ui.closePrompt).toHaveBeenLastCalledWith(h.view, { restore: 'none' });
    expect(h.ui.current).toBeNull();
    await flush();
    // The late result of the old project changes nothing
    expect(h.editor.proposeChanges).toHaveBeenCalledTimes(1);

    // The same text again: a fresh prompt, no attempts of the previous project
    h.quick.open();
    expect(h.prompt.phase).toBe('idle');
    expect(h.prompt.attempts).toEqual([]);
  });

  test('cancelAll cancels the running request and is harmless without one', async () => {
    const h = harness();
    expect(() => h.quick.cancelAll()).not.toThrow();
    h.quick.open();
    h.send({ type: 'submit', instruction: 'Tiivistä tämä' });
    h.quick.cancelAll();
    expect(h.lastCall.cancel).toHaveBeenCalledTimes(1);
    await flush();
    expect(h.prompt).toMatchObject({ phase: 'idle', note: 'Pyyntö pysäytettiin.', draft: 'Tiivistä tämä' });
  });
});

// ---------------------------------------------------------------------------
// The Kielenhuolto chip
// ---------------------------------------------------------------------------

describe('proofread chip', () => {
  const baseText = `Alku. ${TARGET} Loppu.`;
  const logMeta = { source: 'faust', action: 'proofread', actionLabel: 'Kielenhuolto', instruction: '', provider: 'cherry', model: 'cherry:muokkaus-malli', requestLogId: 'log-7', runId: 'run-1' };
  const changes = [
    { from: 17, to: 22, insert: 'tosi', original: 'hyvin', meta: { line: { key: 'l1', original: 'x', revised: 'y' } } },
    { from: 39, to: 44, insert: 'öisää', original: 'öistä', meta: { dialogue: true, line: { key: 'l1', original: 'x', revised: 'y' } } }
  ];
  const run = (extra = {}) => jest.fn(async () => ({ ok: true, changes, baseText, note: null, reasonText: null, logMeta, ...extra }));

  test('the proofread chip uses proofreadSelection when it is given and the generic path when it is not', async () => {
    const proofreadSelection = run();
    const wired = harness({ deps: { proofreadSelection } });
    wired.quick.open();
    wired.send({ type: 'action', actionId: 'proofread', extra: '' });
    expect(wired.prompt).toMatchObject({ phase: 'sending', title: 'Kielenhuolto – vain virheet' });
    await flush();

    expect(proofreadSelection).toHaveBeenCalledTimes(1);
    const args = proofreadSelection.mock.calls[0][0];
    const from = 'Alku. '.length;
    expect(args).toMatchObject({ text: baseText, range: { from, to: from + TARGET.length }, chapterId: 'chapter-1' });
    expect(args.model).toBeUndefined();
    expect(typeof args.onProgress).toBe('function');
    expect(wired.ai.requestEdit).not.toHaveBeenCalled();
    expect(wired.context.build).not.toHaveBeenCalled();
    expect(wired.text.maskSpans).not.toHaveBeenCalled();
    expect(wired.prompt.phase).toBe('result');

    // Another chip does not use it
    const other = harness({ deps: { proofreadSelection: run() } });
    other.quick.open();
    other.send({ type: 'action', actionId: 'tighten', extra: '' });
    expect(other.ai.requestEdit).toHaveBeenCalledTimes(1);

    // Without it the chip is an ordinary edit with the chip's own prompt
    const generic = harness();
    generic.quick.open();
    generic.send({ type: 'action', actionId: 'proofread', extra: '' });
    expect(generic.ai.requestEdit).toHaveBeenCalledTimes(1);
    expect(generic.context.build.mock.calls[0][0].task.instruction).toBe(findAction('proofread').prompt);
  });

  test('the proofread chip proposes with the returned baseText and keeps each change\'s own meta', async () => {
    const h = harness({ deps: { proofreadSelection: run({ note: '2 korjausta.' }) } });
    h.quick.open();
    h.send({ type: 'action', actionId: 'proofread', extra: '' });
    await flush();

    expect(h.editor.proposeChanges).toHaveBeenCalledTimes(1);
    const [proposed, options] = h.editor.proposeChanges.mock.calls[0];
    // The run's own changes, in the run's own frame: no range, no conversion
    expect(proposed).toBe(changes);
    expect(options).toEqual({ baseText, replaceGroupId: undefined, meta: logMeta });
    expect(options).not.toHaveProperty('rangeId');
    expect(h.text.wordDiff).not.toHaveBeenCalled();

    // The per-change meta wins over the group meta: dialogue and line survive
    expect(h.editor.pending.map((item) => item.meta.dialogue)).toEqual([undefined, true]);
    expect(h.editor.pending.every((item) => item.meta.line.key === 'l1' && item.meta.runId === 'run-1')).toBe(true);

    expect(h.prompt.attempts).toEqual([
      { id: expect.any(String), title: 'Kielenhuolto – vain virheet', modelName: 'muokkaus-malli', changeCount: 2, note: '2 korjausta.' }
    ]);
    expect(h.editor.setRangeHighlight).toHaveBeenCalledWith('r1', false);
    expect(h.editor.focus).toHaveBeenCalledTimes(1);
  });

  test('a proofread change skipped as target-changed is reported in the note', async () => {
    const h = harness({ deps: { proofreadSelection: run() } });
    h.quick.open();
    h.send({ type: 'action', actionId: 'proofread', extra: '' });
    // The author changes one of the words while the run is on its way
    h.editor.value = h.editor.value.replace('öistä', 'öisin');
    await flush();

    expect(h.editor.proposeChanges.mock.results[0].value.skipped).toEqual([{ index: 1, reason: 'target-changed' }]);
    expect(h.prompt.attempts[0]).toMatchObject({
      changeCount: 1,
      note: '1 korjausta jäi pois, koska teksti niiden kohdalla muuttui.'
    });
  });

  test('a proofread run whose every correction was skipped says that nothing was proposed and why', async () => {
    const h = harness({ deps: { proofreadSelection: run() } });
    h.quick.open();
    h.send({ type: 'action', actionId: 'proofread', extra: '' });
    // Both corrected words change while the run is on its way
    h.editor.value = h.editor.value.replace('hyvin', 'aivan').replace('öistä', 'öisin');
    await flush();

    expect(h.editor.proposeChanges.mock.results[0].value.ids).toEqual([]);
    expect(h.prompt.attempts[0]).toMatchObject({
      changeCount: 0,
      note: 'Malli ei ehdottanut muutoksia. 2 korjausta jäi pois, koska teksti niiden kohdalla muuttui.'
    });
  });

  test('a proofread run without corrections says so, and a failed run shows its reason', async () => {
    const clean = harness({ deps: { proofreadSelection: run({ changes: [] }) } });
    clean.quick.open();
    clean.send({ type: 'action', actionId: 'proofread', extra: '' });
    await flush();
    expect(clean.prompt.attempts[0]).toMatchObject({ changeCount: 0, note: 'Malli ei ehdottanut muutoksia.' });

    const failed = harness({ deps: { proofreadSelection: run({ ok: false, changes: [], reasonText: 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.' }) } });
    failed.quick.open();
    failed.send({ type: 'action', actionId: 'proofread', extra: '' });
    await flush();
    expect(failed.prompt.phase).toBe('error');
    expect(failed.prompt.error.message).toBe('Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.');
    expect(failed.editor.proposeChanges).not.toHaveBeenCalled();
  });

  test('a proofread run can be stopped, tried on another model and refined as an ordinary edit', async () => {
    // Stop: the run is told through its signal, and the prompt returns to its field
    let seen = null;
    const slow = jest.fn((args) => new Promise((resolve) => {
      seen = args;
      args.signal.addEventListener('abort', () => resolve({ ok: false, changes: [], baseText, note: null, reasonText: 'Pyyntö pysäytettiin.', logMeta }));
    }));
    const stopped = harness({ deps: { proofreadSelection: slow } });
    stopped.quick.open();
    stopped.send({ type: 'action', actionId: 'proofread', extra: '' });
    await flush();
    stopped.send({ type: 'cancel' });
    expect(seen.signal.aborted).toBe(true);
    await flush();
    expect(stopped.prompt).toMatchObject({ phase: 'idle', note: 'Pyyntö pysäytettiin.' });

    // Another model: the same run with that model
    const proofreadSelection = run();
    const h = harness({ deps: { proofreadSelection } });
    h.quick.open();
    h.send({ type: 'action', actionId: 'proofread', extra: '' });
    await flush();
    h.send({ type: 'try-model', modelId: 'cherry:toinen-malli' });
    await flush();
    expect(proofreadSelection).toHaveBeenCalledTimes(2);
    expect(proofreadSelection.mock.calls[1][0].model).toBe('cherry:toinen-malli');
    expect(h.editor.proposeChanges.mock.calls[1][1]).toMatchObject({ baseText, replaceGroupId: 'g1' });
    expect(h.prompt.attempts[1].title).toBe('toinen-malli');

    // A refinement of a Kielenhuolto attempt is an ordinary edit with the typed instruction
    h.send({ type: 'refine', instruction: 'korjaa myös pilkut' });
    expect(proofreadSelection).toHaveBeenCalledTimes(2);
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(1);
    expect(h.context.build.mock.calls[0][0].task.instruction).toBe('korjaa myös pilkut');
    expect(h.lastCall.opts.messages).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Write at cursor
// ---------------------------------------------------------------------------

describe('write at cursor', () => {
  const MARKED = 'Ilta pimeni.\nÅke seisoi rannalla.|\nKolmas kappale.';
  const POS = 'Ilta pimeni.\nÅke seisoi rannalla.'.length;
  const writer = (options = {}) => harness({ marked: MARKED, ...options, deps: { writeAtCursor: true, ...(options.deps || {}) } });
  const start = (h, direction = 'Sumu nousee') => {
    h.quick.open();
    h.send({ type: 'submit', instruction: direction });
  };

  test('write: the block starts at the caret and streamed text reaches appendInsertBlock', () => {
    const h = writer({ settings: { quickEdit: { otherModel: null, length: 'long' } } });
    h.quick.open();
    expect(h.prompt.mode).toBe('write');
    h.send({ type: 'submit', instruction: '  Sumu nousee – Åke herää  ' });

    // The prompt gives way to the block; the caret stays where the text will come
    expect(h.ui.closePrompt).toHaveBeenCalledWith(h.view, { restore: 'cursor' });
    expect(h.editor.releaseRange).toHaveBeenCalledWith('r1');
    expect(h.ui.current).toBeNull();

    const args = h.context.build.mock.calls[0][0];
    expect(args).toMatchObject({ project: h.project, chapterId: 'chapter-1', text: h.editor.value, cursor: POS, role: 'prose', answerTokens: 1300 });
    expect(args).not.toHaveProperty('selection');
    expect(args.task).toMatchObject({ id: 'write', instruction: 'Suunta: Sumu nousee – Åke herää', answerTokens: 1300 });
    expect(args.task).not.toHaveProperty('payload');

    expect(h.editor.startInsertBlock).toHaveBeenCalledWith({
      pos: POS,
      meta: {
        source: 'faust',
        action: 'write-here',
        actionLabel: 'Kirjoita kohdistimeen',
        instruction: 'Sumu nousee – Åke herää',
        provider: null,
        model: 'cherry:proosa-malli',
        requestLogId: null
      }
    });

    const built = h.context.build.mock.results[0].value;
    const { opts } = h.lastCall;
    expect(opts).toMatchObject({ role: 'prose', maxTokens: 1300, thinking: 'off' });
    expect(opts.system).toBe(built.system);
    expect(opts.messages).toBe(built.messages);
    expect(opts).not.toHaveProperty('original');
    expect(opts).not.toHaveProperty('stopSequences');
    expect(opts.meta).toEqual({ action: 'write-here', actionLabel: 'Kirjoita kohdistimeen', instruction: 'Sumu nousee – Åke herää', chapterId: 'chapter-1' });

    // Nothing before the opening tag, then only what is new
    h.lastCall.stream('Tässä on jatko: ');
    expect(h.editor.appendInsertBlock).not.toHaveBeenCalled();
    h.lastCall.stream('Tässä on jatko: <teksti>Sumu nousi ');
    h.lastCall.stream('Tässä on jatko: <teksti>Sumu nousi järveltä. Åke ');
    h.lastCall.stream('Tässä on jatko: <teksti>Sumu nousi järveltä. Åke ');   // nothing new
    expect(h.editor.appendInsertBlock.mock.calls).toEqual([['b1', 'Sumu nousi '], ['b1', 'järveltä. Åke ']]);
    expect(h.editor.getInsertBlock().text).toBe('Sumu nousi järveltä. Åke ');
    // The manuscript is untouched
    expect(h.editor.value).toBe(MARKED.replace('|', ''));
    expect(h.editor.proposeChanges).not.toHaveBeenCalled();
  });

  test('write: an empty direction continues naturally with the stored length', () => {
    const h = writer();
    start(h, '');
    const { task } = h.context.build.mock.calls[0][0];
    expect(task.instruction).toBe('Suunta: jatka luontevasti.');
    expect(task.answerTokens).toBe(500);
    expect(h.editor.startInsertBlock.mock.calls[0][0].meta.instruction).toBe('');

    // The length chosen in the prompt is used and remembered
    const chosen = writer();
    chosen.quick.open();
    chosen.send({ type: 'length', length: 'sentence' });
    expect(chosen.settings.set).toHaveBeenCalledWith('quickEdit', { otherModel: null, length: 'sentence' });
    chosen.send({ type: 'submit', instruction: '' });
    expect(chosen.context.build.mock.calls[0][0].task.answerTokens).toBe(200);
  });

  test('write: an accepted answer finishes the block as done with the request\'s logMeta', async () => {
    const h = writer();
    start(h);
    h.lastCall.stream('<teksti>Sumu nousi järveltä.');
    h.lastCall.accept('Sumu nousi järveltä. Åke kääntyi.');
    await flush();

    expect(h.editor.finishInsertBlock).toHaveBeenCalledTimes(1);
    expect(h.editor.finishInsertBlock).toHaveBeenCalledWith('b1', { status: 'done', text: 'Sumu nousi järveltä. Åke kääntyi.', meta: h.lastCall.logMeta });
    expect(h.editor.getInsertBlock()).toMatchObject({ status: 'done', text: 'Sumu nousi järveltä. Åke kääntyi.', note: null, meta: h.lastCall.logMeta });
    // Accepting is the block's own button: nothing is inserted here
    expect(h.editor.value).toBe(MARKED.replace('|', ''));
    expect(h.ui.openPrompt).toHaveBeenCalledTimes(1);
  });

  test('write: the finished text goes through typography normalisation when it is given', async () => {
    const normalizeTypography = jest.fn((value) => value.replace(/"/g, '”'));
    const h = writer({ deps: { normalizeTypography } });
    start(h);
    h.lastCall.accept('"Sumu", Åke sanoi.');
    await flush();
    expect(normalizeTypography).toHaveBeenCalledWith('"Sumu", Åke sanoi.');
    expect(h.editor.getInsertBlock().text).toBe('”Sumu”, Åke sanoi.');
  });

  test('write: a stop keeps the text up to the last full sentence', async () => {
    const h = writer();
    start(h);
    h.lastCall.stream('<teksti>Sumu nousi järveltä. Åke kääntyi ja läh');
    h.blockAction('stop');

    // "Pysäytä" only cancels: the block is finished when the cancelled result arrives
    expect(h.lastCall.cancel).toHaveBeenCalledTimes(1);
    expect(h.editor.finishInsertBlock).not.toHaveBeenCalled();
    await flush();

    expect(h.editor.finishInsertBlock).toHaveBeenCalledTimes(1);
    expect(h.editor.finishInsertBlock).toHaveBeenCalledWith('b1', {
      status: 'stopped',
      text: 'Sumu nousi järveltä.',
      note: 'Pysäytetty. Teksti on leikattu viimeiseen kokonaiseen virkkeeseen.',
      meta: h.lastCall.logMeta
    });
    expect(h.text.trimToSentence).toHaveBeenCalledWith('Sumu nousi järveltä. Åke kääntyi ja läh');
    expect(h.editor.getInsertBlock()).toMatchObject({ status: 'stopped', text: 'Sumu nousi järveltä.' });
    expect(h.ui.openPrompt).toHaveBeenCalledTimes(1);   // the prompt is not reopened
  });

  test('write: Esc in the manuscript stops the block the same way', async () => {
    const h = writer();
    start(h);
    h.lastCall.stream('<teksti>Sumu nousi järveltä. Åke');
    h.send({ type: 'block-stop' });
    expect(h.lastCall.cancel).toHaveBeenCalledTimes(1);
    expect(h.editor.finishInsertBlock).not.toHaveBeenCalled();
    await flush();
    expect(h.editor.getInsertBlock()).toMatchObject({ status: 'stopped', text: 'Sumu nousi järveltä.' });
  });

  test('write: a stop before the first sentence empties the block and reopens the prompt with the direction', async () => {
    const h = writer();
    start(h, 'Sumu nousee');
    h.lastCall.stream('<teksti>Sumu nousi järvel');
    h.blockAction('stop');
    await flush();

    expect(h.editor.finishInsertBlock).toHaveBeenCalledWith('b1', { status: 'stopped', text: '' });
    expect(h.editor.getInsertBlock()).toBeNull();

    // The prompt is back at the same place, with the direction in its field
    expect(h.ui.openPrompt).toHaveBeenCalledTimes(2);
    expect(h.editor.captureRange).toHaveBeenLastCalledWith(POS, POS, { highlight: false });
    expect(h.ui.openPrompt.mock.calls[1][1].mode).toBe('write');
    expect(h.prompt).toMatchObject({
      mode: 'write',
      phase: 'idle',
      draft: 'Sumu nousee',
      note: 'Pysäytetty ennen ensimmäistä kokonaista virkettä.'
    });
    // And it can be sent again
    h.send({ type: 'submit', instruction: 'Sumu nousee' });
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(2);
    expect(h.editor.getInsertBlock().status).toBe('streaming');
  });

  test('write: a cancelled result after Pysäytä does not empty the block', async () => {
    const h = writer();
    start(h);
    h.lastCall.stream('<teksti>Sumu nousi järveltä. Åke kääntyi. Yö');
    h.blockAction('stop');
    await flush();
    const kept = h.editor.getInsertBlock();
    expect(kept).toMatchObject({ status: 'stopped', text: 'Sumu nousi järveltä. Åke kääntyi.' });

    // Exactly one finish, and it was the stop; the block still has its text afterwards
    expect(h.editor.finishInsertBlock).toHaveBeenCalledTimes(1);
    expect(h.editor.finishInsertBlock.mock.calls[0][1].status).toBe('stopped');
    await flush();
    expect(h.editor.getInsertBlock()).toEqual(kept);
    expect(h.editor.getInsertBlock().attemptCount).toBe(1);

    // A second "Pysäytä" on the stopped block does nothing at all
    h.blockAction('stop');
    await flush();
    expect(h.editor.finishInsertBlock).toHaveBeenCalledTimes(1);
    expect(h.editor.getInsertBlock()).toEqual(kept);
  });

  test('write: a late cancelled result does nothing to an attempt that is no longer streaming', async () => {
    const h = writer();
    start(h);
    h.lastCall.stream('<teksti>Sumu nousi järveltä. Åke');
    // Something else finished the attempt first (the chapter was left and came back as "stopped")
    h.editor.block.attempts[0].status = 'stopped';
    h.quick.cancelAll();
    await flush();
    expect(h.editor.finishInsertBlock).not.toHaveBeenCalled();
    expect(h.editor.getInsertBlock().text).toBe('Sumu nousi järveltä. Åke');
    expect(h.ui.openPrompt).toHaveBeenCalledTimes(1);
  });

  test('write: cancelAll during a write keeps the text up to the last full sentence', async () => {
    const h = writer();
    start(h);
    h.lastCall.stream('<teksti>Sumu nousi järveltä. Åke kääntyi ja läh');
    // Työkalut → Pysäytä tekoäly: no 'stop' action at all, only the cancelled result
    h.quick.cancelAll();
    await flush();

    expect(h.editor.finishInsertBlock).toHaveBeenCalledTimes(1);
    expect(h.editor.getInsertBlock()).toMatchObject({
      status: 'stopped',
      text: 'Sumu nousi järveltä.',
      note: 'Pysäytetty. Teksti on leikattu viimeiseen kokonaiseen virkkeeseen.'
    });
  });

  test('write: an answer cut by the length limit is trimmed to a sentence and says so', async () => {
    const h = writer();
    start(h);
    // As aiClient.judgeEdit gives it: a max_tokens rejection carries the raw text and no cleaned text
    h.lastCall.fail('max_tokens', 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.', {
      text: '<teksti>Sumu nousi järveltä. Åke kääntyi ja läh',
      cleaned: null
    });
    await flush();
    expect(h.editor.finishInsertBlock).toHaveBeenCalledWith('b1', {
      status: 'done',
      text: 'Sumu nousi järveltä.',
      note: 'Vastaus katkesi pituusrajaan. Teksti on leikattu viimeiseen kokonaiseen virkkeeseen.',
      meta: h.lastCall.logMeta
    });

    // Without the raw text in the result, the streamed text is used
    const streamed = writer();
    start(streamed);
    streamed.lastCall.stream('<teksti>Sumu nousi järveltä. Åke kääntyi katsomaan. Hän ei näh');
    streamed.lastCall.fail('max_tokens', 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.', { text: '', cleaned: null });
    await flush();
    expect(streamed.editor.getInsertBlock()).toMatchObject({
      status: 'done',
      text: 'Sumu nousi järveltä. Åke kääntyi katsomaan.',
      note: 'Vastaus katkesi pituusrajaan. Teksti on leikattu viimeiseen kokonaiseen virkkeeseen.'
    });

    // An answer without the opening tag has nothing to keep
    const untagged = writer();
    start(untagged);
    untagged.lastCall.fail('max_tokens', 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.', { text: 'Sumu nousi järveltä. Åke', cleaned: null });
    await flush();
    expect(untagged.editor.finishInsertBlock).toHaveBeenCalledWith('b1', { status: 'error', text: '', note: 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.' });
  });

  test('write: a failed answer empties the block and reopens the prompt with the direction and the reason', async () => {
    const h = writer();
    start(h, 'Sumu nousee');
    h.lastCall.fail('refusal', 'Ei ehdotusta: malli kieltäytyi tehtävästä.');
    await flush();

    expect(h.editor.finishInsertBlock).toHaveBeenCalledWith('b1', { status: 'error', text: '', note: 'Ei ehdotusta: malli kieltäytyi tehtävästä.' });
    expect(h.editor.getInsertBlock()).toBeNull();
    expect(h.prompt).toMatchObject({ mode: 'write', phase: 'idle', draft: 'Sumu nousee', note: 'Ei ehdotusta: malli kieltäytyi tehtävästä.' });

    // Cut by the limit before a single sentence was complete: the same
    const cut = writer();
    start(cut, 'Sumu');
    cut.lastCall.fail('max_tokens', 'Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.', {
      text: '<teksti>Sumu nousi järvel',
      cleaned: null
    });
    await flush();
    expect(cut.editor.getInsertBlock()).toBeNull();
    expect(cut.prompt.note).toBe('Ei ehdotusta: vastaus katkesi kesken, koska vastausraja täyttyi.');
  });

  test('write: a prompt that comes back after a failed request leaves the focus in the manuscript the author types in', async () => {
    const h = writer();
    start(h, 'Sumu nousee');
    expect(h.editor.focus).not.toHaveBeenCalled();
    // The author went on writing in the manuscript while the request ran
    global.document = { activeElement: { tagName: 'DIV', closest: (selector) => (selector === '.cm-content' ? {} : null) }, body: {} };
    try {
      h.lastCall.fail('refusal', 'Ei ehdotusta: malli kieltäytyi tehtävästä.');
      await flush();
      expect(h.prompt).toMatchObject({ mode: 'write', phase: 'idle', draft: 'Sumu nousee' });
      expect(h.editor.focus).toHaveBeenCalledTimes(1);
      expect(h.editor.focus.mock.invocationCallOrder[0]).toBeGreaterThan(h.ui.openPrompt.mock.invocationCallOrder[1]);
    } finally {
      delete global.document;
    }

    // Focus anywhere else (the field of the prompt): the opened prompt keeps it
    const other = writer();
    start(other, 'Sumu nousee');
    other.lastCall.fail('refusal', 'Ei ehdotusta: malli kieltäytyi tehtävästä.');
    await flush();
    expect(other.prompt.phase).toBe('idle');
    expect(other.editor.focus).not.toHaveBeenCalled();
  });

  test('write: retry starts a new attempt on the same block', async () => {
    const h = writer();
    start(h);
    h.lastCall.accept('Sumu nousi järveltä.');
    await flush();
    const first = h.ai.calls[0];

    h.blockAction('retry');

    expect(h.editor.retryInsertBlock).toHaveBeenCalledWith('b1');
    expect(h.editor.startInsertBlock).toHaveBeenCalledTimes(1);   // the same block
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(2);
    // The same request again
    expect(h.lastCall.opts.system).toBe(first.opts.system);
    expect(h.lastCall.opts.messages).toBe(first.opts.messages);
    expect(h.lastCall.opts.maxTokens).toBe(first.opts.maxTokens);
    expect(h.lastCall.opts.meta).toEqual(first.opts.meta);
    expect(h.editor.getInsertBlock()).toMatchObject({ status: 'streaming', attempt: 1, attemptCount: 2 });

    h.lastCall.stream('<teksti>Usva peitti ');
    h.lastCall.accept('Usva peitti rannan.');
    await flush();
    // Earlier attempts stay
    expect(h.editor.block.attempts.map((attempt) => [attempt.status, attempt.text])).toEqual([
      ['done', 'Sumu nousi järveltä.'],
      ['done', 'Usva peitti rannan.']
    ]);

    // A retry that fails leaves the earlier attempts and does not reopen the prompt
    h.blockAction('retry');
    h.lastCall.fail('empty', 'Ei ehdotusta: malli palautti tyhjän tekstin.');
    await flush();
    expect(h.editor.block.attempts).toHaveLength(2);
    expect(h.ui.openPrompt).toHaveBeenCalledTimes(1);
  });

  test('write: retry while an attempt is streaming, or with AI off, starts nothing', async () => {
    const h = writer();
    start(h);
    h.blockAction('retry');                       // still streaming
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(1);
    h.lastCall.accept('Sumu nousi järveltä.');
    await flush();

    h.settings.values.aiOff = true;
    h.blockAction('retry');
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(1);
    expect(h.editor.retryInsertBlock).not.toHaveBeenCalled();
  });

  test('write: a busy or conflicting block position reopens the prompt with the conflict text', () => {
    for (const error of ['busy', 'conflict']) {
      const h = writer();
      h.editor.blockError = error;
      start(h, 'Sumu nousee');

      expect(h.ai.requestEdit).not.toHaveBeenCalled();
      expect(h.ui.openPrompt).toHaveBeenCalledTimes(2);
      expect(h.prompt).toMatchObject({
        mode: 'write',
        phase: 'idle',
        draft: 'Sumu nousee',
        note: 'Kohdassa on jo käsittelemätön ehdotus. Käsittele se ensin.'
      });
    }
  });

  test('write: a build that is over budget or blocked reopens the prompt with the message', () => {
    const over = writer();
    over.quick.open();
    over.state.nextBuilt = { overBudget: true, totalTokens: 9000, budgetTokens: 4000 };
    over.send({ type: 'submit', instruction: 'Sumu' });
    expect(over.editor.startInsertBlock).not.toHaveBeenCalled();
    expect(over.ai.requestEdit).not.toHaveBeenCalled();
    expect(over.prompt).toMatchObject({
      phase: 'idle',
      draft: 'Sumu',
      note: 'Teksti on liian pitkä tälle mallille: noin 9\u00A0000 tokenia, tilaa 4\u00A0000. Lyhennä valintaa tai vaihda mallia.'
    });

    const blocked = writer();
    blocked.quick.open();
    blocked.state.nextBuilt = { blocked: 'noAI' };
    blocked.send({ type: 'submit', instruction: 'Sumu' });
    expect(blocked.editor.startInsertBlock).not.toHaveBeenCalled();
    expect(blocked.prompt.phase).toBe('blocked');
    expect(blocked.prompt.blocked.message).toBe(NO_AI);
  });

  test('write: Muokkaa tätä kappaletta reopens the prompt as an edit of the paragraph at the caret', () => {
    const h = writer();
    h.quick.open();
    h.send({ type: 'edit-paragraph' });

    expect(h.ui.closePrompt).toHaveBeenCalledWith(h.view, { restore: 'none' });
    const from = 'Ilta pimeni.\n'.length;
    expect(h.editor.captureRange).toHaveBeenLastCalledWith(from, from + 'Åke seisoi rannalla.'.length, { highlight: true });
    expect(h.ui.openPrompt).toHaveBeenCalledTimes(2);
    expect(h.ui.openPrompt.mock.calls[1][1].mode).toBe('edit');
    expect(h.prompt).toMatchObject({ mode: 'edit', kind: 'paragraph', phase: 'idle' });
    // And it edits
    h.send({ type: 'submit', instruction: 'Tiivistä' });
    expect(h.lastCall.opts.role).toBe('edit');
  });

  test('write: the editor going away cancels the request and nothing is finished elsewhere', async () => {
    const h = writer();
    start(h);
    h.lastCall.stream('<teksti>Sumu nousi järveltä. Åke');
    const oldView = h.view;
    // The chapter is switched: another editor is on screen
    h.state.view = { name: 'toinen' };
    const next = makeEditor('Toinen luku.', 0, 0, { released() {} });
    h.state.editor = next;
    h.quick.host.handle({ type: 'view-destroyed' }, oldView);
    expect(h.lastCall.cancel).toHaveBeenCalledTimes(1);
    await flush();
    expect(h.editor.finishInsertBlock).not.toHaveBeenCalled();
    expect(next.finishInsertBlock).not.toHaveBeenCalled();
    expect(h.ui.openPrompt).toHaveBeenCalledTimes(1);
  });

  test('the block buttons are registered once with the suggestion controller', () => {
    const h = writer();
    expect(h.controller.onBlockAction).toHaveBeenCalledTimes(1);
    start(h);
    expect(h.controller.onBlockAction).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Saved prompts, the context menu and the facts app.js asks for
// ---------------------------------------------------------------------------

describe('saved prompts', () => {
  test('Tallenna ohje stores the instruction and adds its chip; × removes it', () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'save-prompt', text: '  Säilytä ”sitaatit” – älä lyhennä niitä.\nToinen rivi.  ' });

    const stored = [{
      id: `user-${(1763300000000).toString(36)}`,
      label: 'Säilytä ”sitaatit” – älä lyhennä…',
      prompt: 'Säilytä ”sitaatit” – älä lyhennä niitä.\nToinen rivi.',
      created: 1763300000000
    }];
    // The stored shape: id, label, prompt, created
    expect(h.settings.set).toHaveBeenCalledWith('savedPrompts', stored);
    expect(h.prompt.actions[h.prompt.actions.length - 1]).toEqual({ id: stored[0].id, label: stored[0].label, builtin: false });
    expect(h.prompt.actions).toHaveLength(5);

    // The same text twice is not saved twice
    h.send({ type: 'save-prompt', text: 'Säilytä ”sitaatit” – älä lyhennä niitä.\nToinen rivi.' });
    expect(h.settings.set).toHaveBeenCalledTimes(1);

    // The saved prompt works as a chip
    h.send({ type: 'action', actionId: stored[0].id, extra: '' });
    expect(h.context.build.mock.calls[0][0].task.instruction).toBe(stored[0].prompt);
    h.send({ type: 'cancel' });

    const other = harness({ settings: { savedPrompts: stored } });
    other.quick.open();
    other.send({ type: 'delete-prompt', id: stored[0].id });
    expect(other.settings.set).toHaveBeenCalledWith('savedPrompts', []);
    expect(other.prompt.actions).toHaveLength(4);
  });
});

describe('context menu', () => {
  test('contextmenu reports the actions of the project kind and reports nothing when AI is off', () => {
    const own = [{ id: 'user-1', label: 'Säilytä murre', prompt: 'Älä yleiskielistä.', created: 1 }];
    const h = harness({ project: { genre: 'nonfiction', language: 'fi' }, settings: { savedPrompts: own } });
    h.send({ type: 'contextmenu', x: 320, y: 144, hasSelection: true });

    expect(h.reportContext).toHaveBeenCalledTimes(1);
    expect(h.reportContext).toHaveBeenCalledWith({
      x: 320,
      y: 144,
      hasSelection: true,
      actions: [
        { id: 'proofread', label: 'Kielenhuolto – vain virheet' },
        { id: 'tighten-paragraph', label: 'Tiivistä kappale' },
        { id: 'clarify', label: 'Selkeytä' },
        { id: 'clarify-claim', label: 'Selkeytä väite' },
        { id: 'unify-terms', label: 'Yhtenäistä termit' },
        { id: 'user-1', label: 'Säilytä murre' }
      ]
    });
    // Reporting opens nothing
    expect(h.ui.openPrompt).not.toHaveBeenCalled();

    const fiction = harness();
    fiction.send({ type: 'contextmenu', x: 1, y: 2, hasSelection: false });
    expect(fiction.reportContext.mock.calls[0][0].actions.map((item) => item.id)).toEqual(['proofread', 'tighten', 'clarify', 'show']);
    expect(fiction.reportContext.mock.calls[0][0].hasSelection).toBe(false);

    const off = harness({ settings: { aiOff: true } });
    off.send({ type: 'contextmenu', x: 320, y: 144, hasSelection: true });
    expect(off.reportContext).not.toHaveBeenCalled();

    const loading = harness({ loaded: false });
    loading.send({ type: 'contextmenu', x: 320, y: 144, hasSelection: true });
    expect(loading.reportContext).not.toHaveBeenCalled();

    // A chapter marked "Ei tekoälylle" offers no AI menu
    const blocked = harness();
    blocked.state.blockedChapters.add('chapter-1');
    blocked.send({ type: 'contextmenu', x: 320, y: 144, hasSelection: true });
    expect(blocked.reportContext).not.toHaveBeenCalled();
  });
});

describe('what app.js asks', () => {
  const inPrompt = (extra = {}) => ({ tagName: 'TEXTAREA', value: '', closest: (selector) => (selector === '.cm-faust-prompt' ? {} : null), ...extra });
  const withFocus = (element, run) => {
    global.document = { activeElement: element, body: {} };
    try {
      return run();
    } finally {
      delete global.document;
    }
  };

  test('fieldOwnsUndo: the field undoes its own text in every phase, an empty Tarkenna field after a result leaves Cmd+Z to the project (I-05 review)', async () => {
    const h = harness();
    // No document at all (a test, or before the window exists)
    expect(h.quick.fieldOwnsUndo()).toBe(false);
    expect(h.quick.isPromptFocused()).toBe(false);

    const typed = inPrompt({ value: 'Tiivistä tämä' });
    const empty = inPrompt({ value: '' });
    const button = inPrompt({ tagName: 'BUTTON', value: '' });
    const manuscript = { tagName: 'DIV', closest: () => null };

    // No prompt open
    expect(withFocus(typed, () => h.quick.fieldOwnsUndo())).toBe(false);

    h.quick.open();
    expect(withFocus(typed, () => h.quick.fieldOwnsUndo())).toBe(true);        // idle, text in the field
    // Empty again after the author's own Cmd+Z: a held Cmd+Z stops in the field, it never runs on into the manuscript
    expect(withFocus(empty, () => h.quick.fieldOwnsUndo())).toBe(true);
    expect(withFocus(button, () => h.quick.fieldOwnsUndo())).toBe(false);      // a button of the prompt
    expect(withFocus(manuscript, () => h.quick.fieldOwnsUndo())).toBe(false);  // the focus is in the text
    expect(withFocus(typed, () => h.quick.isPromptFocused())).toBe(true);
    expect(withFocus(manuscript, () => h.quick.isPromptFocused())).toBe(false);

    h.send({ type: 'submit', instruction: 'Tiivistä tämä' });
    expect(withFocus(typed, () => h.quick.fieldOwnsUndo())).toBe(false);       // sending

    h.lastCall.fail('empty', 'Ei ehdotusta: malli palautti tyhjän tekstin.');
    await flush();
    expect(withFocus(typed, () => h.quick.fieldOwnsUndo())).toBe(true);        // error, the instruction is in the field

    expect(withFocus(empty, () => h.quick.fieldOwnsUndo())).toBe(true);        // error, the field emptied

    h.send({ type: 'retry' });
    h.lastCall.accept(SHORTER);
    await flush();
    // After a result: a refinement typed in Tarkenna… is undone in the field, the manuscript does not change (X-29)
    expect(withFocus(inPrompt({ value: 'vielä' }), () => h.quick.fieldOwnsUndo())).toBe(true);
    // With the field empty Cmd+Z undoes the accept the author just made (contracts 11.4 row 9)
    expect(withFocus(empty, () => h.quick.fieldOwnsUndo())).toBe(false);
    expect(withFocus(button, () => h.quick.fieldOwnsUndo())).toBe(false);
  });

  test('blocksMenuAction is true for format-bold only while the prompt has focus', () => {
    const h = harness();
    h.quick.open();
    expect(h.quick.blocksMenuAction('format-bold')).toBe(false);               // no document: nothing has the focus

    withFocus(inPrompt({ value: 'ohje' }), () => {
      expect(h.quick.blocksMenuAction('format-bold')).toBe(true);
      expect(h.quick.blocksMenuAction('format-italic')).toBe(true);
      expect(h.quick.blocksMenuAction('text-uppercase')).toBe(true);
      expect(h.quick.blocksMenuAction('insert-text')).toBe(true);
      // Lisää ▸ Muistutus wraps the selection in a note: an insert command like the others (I-05 review)
      expect(h.quick.blocksMenuAction('insert-todo')).toBe(true);
      // Everything else goes through
      expect(h.quick.blocksMenuAction('new-chapter')).toBe(false);
      expect(h.quick.blocksMenuAction('add-bookmark')).toBe(false);
      expect(h.quick.blocksMenuAction('quick-edit')).toBe(false);
      expect(h.quick.blocksMenuAction('undo')).toBe(false);
      expect(h.quick.blocksMenuAction('save')).toBe(false);
    });
    withFocus({ tagName: 'DIV', closest: () => null }, () => {
      expect(h.quick.blocksMenuAction('format-bold')).toBe(false);
    });
  });

  test('an intent from a replaced view is ignored', async () => {
    const h = harness();
    h.quick.open();
    const stale = { name: 'vanha' };

    h.quick.host.handle({ type: 'submit', instruction: 'Tiivistä' }, stale);
    h.quick.host.handle({ type: 'action', actionId: 'tighten', extra: '' }, stale);
    h.quick.host.handle({ type: 'close', reason: 'escape' }, stale);
    h.quick.host.handle({ type: 'contextmenu', x: 1, y: 2, hasSelection: true }, stale);
    h.quick.host.handle({ type: 'tick' }, stale);
    h.quick.host.handle({ type: 'prompt-closed' }, stale);
    h.quick.host.handle({ type: 'view-destroyed' }, stale);
    h.quick.host.handle({ type: 'view-ready' }, stale);
    h.quick.host.handle({ type: 'block-stop' }, stale);

    expect(h.ai.requestEdit).not.toHaveBeenCalled();
    expect(h.ui.closePrompt).not.toHaveBeenCalled();
    expect(h.reportContext).not.toHaveBeenCalled();
    expect(h.ui.current).not.toBeNull();

    // The same intents from the current view work
    h.send({ type: 'submit', instruction: 'Tiivistä' });
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(1);

    // Garbage is ignored too
    expect(() => h.quick.host.handle(null, h.view)).not.toThrow();
    expect(() => h.quick.host.handle({ type: 'tuntematon' }, h.view)).not.toThrow();
    expect(() => h.quick.host.handle({}, h.view)).not.toThrow();
  });

  test('the editor going away cancels a running edit request without touching the editor', async () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'submit', instruction: 'Tiivistä' });
    const calls = h.ui.updatePrompt.mock.calls.length;

    h.quick.host.handle({ type: 'view-destroyed' }, h.view);
    expect(h.lastCall.cancel).toHaveBeenCalledTimes(1);
    expect(h.ui.closePrompt).not.toHaveBeenCalled();
    expect(h.editor.releaseRange).not.toHaveBeenCalled();
    await flush();
    expect(h.ui.updatePrompt.mock.calls.length).toBe(calls);
    expect(h.editor.proposeChanges).not.toHaveBeenCalled();
  });

  test('turning AI off while the prompt is open sends nothing more', () => {
    const h = harness();
    h.quick.open();
    h.settings.values.aiOff = true;
    h.send({ type: 'submit', instruction: 'Tiivistä' });
    h.send({ type: 'action', actionId: 'tighten', extra: '' });
    expect(h.ai.requestEdit).not.toHaveBeenCalled();
    expect(h.context.build).not.toHaveBeenCalled();
    // The prompt is not left on screen with dead controls: the first intent closes it
    expect(h.ui.closePrompt).toHaveBeenCalledWith(h.view, { restore: 'none' });
    expect(h.ui.current).toBeNull();
    expect(h.quick.open()).toBe(false);
  });

  test('switching AI off closes an open prompt through cancelAll and leaves the suggestions alone', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    h.send({ type: 'refine', instruction: 'lyhyemmin' });
    h.settings.values.aiOff = true;
    h.quick.cancelAll();
    expect(h.lastCall.cancel).toHaveBeenCalledTimes(1);
    expect(h.ui.closePrompt).toHaveBeenCalledWith(h.view, { restore: 'none' });
    expect(h.ui.current).toBeNull();
    expect(h.editor.pending).toHaveLength(2);
    await flush();
    expect(h.ui.current).toBeNull();

    // With AI on, cancelAll only stops the request
    const on = harness();
    on.quick.open();
    on.send({ type: 'submit', instruction: 'Tiivistä' });
    on.quick.cancelAll();
    await flush();
    expect(on.ui.closePrompt).not.toHaveBeenCalled();
    expect(on.prompt.phase).toBe('idle');
  });
});

describe('texts', () => {
  test('promptMessage is the source of the prompt-local sentences used here', () => {
    expect(promptMessage('no-changes')).toBe('Malli ei ehdottanut muutoksia.');
    expect(promptMessage('conflict')).toBe('Kohdassa on jo käsittelemätön ehdotus. Käsittele se ensin.');
    expect(promptMessage('no-sentence')).toBe('Pysäytetty ennen ensimmäistä kokonaista virkettä.');
  });
});

// ---------------------------------------------------------------------------
// Review fixes of stage I-05
// ---------------------------------------------------------------------------

describe('review fixes (I-05)', () => {
  const ownPending = (h, groupId) => h.editor.pending.filter((item) => item.groupId === groupId).sort((a, b) => a.from - b.from);

  test('after a result the selection over the target becomes a caret at the target\'s end, before the focus', async () => {
    const h = harness();
    expect(h.editor.selectionEnd - h.editor.selectionStart).toBe(TARGET.length);
    await withResult(h, SHORTER);

    // One key pressed now goes into the text after the target: it replaces neither the target
    // nor its suggestions, and touches none of them
    const end = 'Alku. '.length + TARGET.length;
    expect([h.editor.selectionStart, h.editor.selectionEnd]).toEqual([end, end]);
    expect(ownPending(h, 'g1').every((item) => item.to < end)).toBe(true);
    expect(h.editor.setSelectionRange.mock.invocationCallOrder[0]).toBeLessThan(h.editor.focus.mock.invocationCallOrder[0]);
    expect(h.editor.pending).toHaveLength(2);
  });

  test('with a suggestion at the target\'s end the caret goes to the current suggestion of the attempt, else to its first', async () => {
    // "käveli" and the last word "rantaa." both change: the end is taken
    const changed = 'Åke kulki hyvin hitaasti pitkin öistä metsää.';
    const h = harness();
    await withResult(h, changed);
    const [first, second] = ownPending(h, 'g1');
    expect(second.to).toBe('Alku. '.length + TARGET.length);
    expect([h.editor.selectionStart, h.editor.selectionEnd]).toEqual([first.from, first.from]);

    // The author selected the target again; the bar's current suggestion is the second one
    h.editor.selectionStart = 'Alku. '.length;
    h.editor.selectionEnd = 'Alku. '.length + TARGET.length;
    h.editor.getSuggestions.mockImplementation(() => ({ pending: h.editor.pending.slice(), rejected: [], currentId: second.id }));
    h.send({ type: 'close', reason: 'button' });
    expect([h.editor.selectionStart, h.editor.selectionEnd]).toEqual([second.from, second.from]);
    expect(h.ui.closePrompt).toHaveBeenCalledWith(h.view, { restore: 'none' });
  });

  test('close after a result leaves a selection elsewhere, and a result in another field moves nothing', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    h.editor.selectionStart = 0;
    h.editor.selectionEnd = 'Alku'.length;
    h.editor.setSelectionRange.mockClear();
    h.send({ type: 'close', reason: 'button' });
    expect(h.editor.setSelectionRange).not.toHaveBeenCalled();
    expect([h.editor.selectionStart, h.editor.selectionEnd]).toEqual([0, 4]);

    // Typing in the notes while the answer came: neither the focus nor the selection move
    const notes = harness();
    notes.quick.open();
    notes.send({ type: 'action', actionId: 'tighten', extra: '' });
    global.document = { activeElement: { tagName: 'TEXTAREA', closest: () => null }, body: {} };
    try {
      notes.lastCall.accept(SHORTER);
      await flush();
      expect(notes.editor.setSelectionRange).not.toHaveBeenCalled();
      expect(notes.editor.focus).not.toHaveBeenCalled();
    } finally {
      delete global.document;
    }
  });

  test('an attempt without changes leaves the selection, so Cmd+K on it shows the attempt again', async () => {
    const h = harness();
    await withResult(h, TARGET);
    expect(h.editor.setSelectionRange).not.toHaveBeenCalled();
    expect(h.editor.selectionEnd - h.editor.selectionStart).toBe(TARGET.length);
  });

  test('a part switched off in the row makes the next Tarkenna a new request built with the row\'s parts', async () => {
    const h = harness();
    // Before anything was sent there is nothing to continue: no error
    h.quick.open();
    h.quick.contextChanged();
    h.send({ type: 'action', actionId: 'tighten', extra: '' });
    h.lastCall.accept(SHORTER);
    await flush();
    expect(h.context.build).toHaveBeenCalledTimes(1);

    h.quick.contextChanged();
    h.send({ type: 'refine', instruction: 'vielä lyhyemmin' });
    // Built again (the setup's build applies the row's lists), one turn, the refinement in the instruction
    expect(h.context.build).toHaveBeenCalledTimes(2);
    expect(h.context.build.mock.calls[1][0].task.instruction).toBe(findAction('tighten', []).prompt + '\nTarkennus: vielä lyhyemmin');
    expect(h.lastCall.opts.messages).toHaveLength(1);
    expect(h.prompt).toMatchObject({ phase: 'sending', instruction: 'vielä lyhyemmin' });

    // The answer to that request is refined in three turns again: its request has the row's parts
    h.lastCall.accept('Åke käveli rantaa.');
    await flush();
    h.send({ type: 'refine', instruction: 'lisää hitaasti' });
    expect(h.context.build).toHaveBeenCalledTimes(2);
    expect(h.lastCall.opts.messages).toHaveLength(3);
  });

  test('a dry build that does not fit the model disables sending with the reason, one that fits enables it', () => {
    const h = harness();
    // No prompt: nothing to tell
    h.quick.contextChecked({ overBudget: true, totalTokens: 5200, budgetTokens: 3900 });
    expect(h.ui.updatePrompt).not.toHaveBeenCalled();

    h.quick.open();
    expect(h.prompt.sendBlocked).toBeNull();
    h.quick.contextChecked({ overBudget: true, totalTokens: 5200, budgetTokens: 3900 });
    expect(h.prompt.sendBlocked).toBe('Teksti on liian pitkä tälle mallille: noin 5 200 tokenia, tilaa 3 900. Lyhennä valintaa tai vaihda mallia.');
    const updates = h.ui.updatePrompt.mock.calls.length;
    h.quick.contextChecked({ overBudget: true, totalTokens: 5200, budgetTokens: 3900 });
    expect(h.ui.updatePrompt.mock.calls.length).toBe(updates);   // the same reason draws nothing

    h.quick.contextChecked({ overBudget: false, totalTokens: 300, budgetTokens: 3900 });
    expect(h.prompt.sendBlocked).toBeNull();
  });

  test('a send over a pending suggestion of something else in the target is refused before any request', () => {
    const h = harness();
    h.quick.open();
    // A suggestion of the bar (another group) inside the target, the way an undone accept leaves it
    h.editor.pending.push({ id: 'x1', groupId: 'muu', from: 'Alku. Åke '.length, to: 'Alku. Åke käveli'.length, insert: 'kulki', original: 'käveli', meta: {} });
    h.send({ type: 'submit', instruction: 'Tiivistä tämä' });
    expect(h.ai.requestEdit).not.toHaveBeenCalled();
    expect(h.context.build).not.toHaveBeenCalled();
    expect(h.prompt.phase).toBe('error');
    expect(h.prompt.error).toEqual({ code: 'conflict', message: promptMessage('conflict'), detail: '' });
    expect(h.prompt.draft).toBe('Tiivistä tämä');
    h.send({ type: 'action', actionId: 'tighten', extra: '' });
    expect(h.ai.requestEdit).not.toHaveBeenCalled();

    // Outside the target (in "Loppu.") it is not in the way
    const outside = harness();
    outside.quick.open();
    const end = outside.editor.value.length;
    outside.editor.pending.push({ id: 'x2', groupId: 'muu', from: end - 6, to: end - 1, insert: 'Lopuksi', original: 'Loppu', meta: {} });
    outside.send({ type: 'submit', instruction: 'Tiivistä tämä' });
    expect(outside.ai.requestEdit).toHaveBeenCalledTimes(1);
  });

  test('a refinement over a suggestion that came from elsewhere meanwhile is refused before any request', async () => {
    const h = harness();
    await withResult(h, SHORTER);
    h.editor.pending.push({ id: 'x1', groupId: 'muu', from: 'Alku. Åke '.length, to: 'Alku. Åke käveli'.length, insert: 'kulki', original: 'käveli', meta: {} });
    h.send({ type: 'refine', instruction: 'vielä lyhyemmin' });
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(1);
    expect(h.prompt).toMatchObject({ phase: 'error', draft: 'vielä lyhyemmin' });
    expect(h.prompt.error.code).toBe('conflict');
    // The attempt's own suggestions are no obstacle: without the other one the refinement goes out
    h.editor.pending = h.editor.pending.filter((item) => item.id !== 'x1');
    h.send({ type: 'retry' });
    expect(h.ai.requestEdit).toHaveBeenCalledTimes(2);
    expect(h.lastCall.opts.messages).toHaveLength(3);
  });

  test('deleting a saved prompt asks first: Peruuta keeps it, Poista ohje removes it', async () => {
    const saved = [{ id: 'user-1', label: 'Säilytä murre', prompt: 'Älä yleiskielistä vuorosanoja.', created: 1 }];
    const confirmDelete = jest.fn(() => Promise.resolve(false));
    const h = harness({ settings: { savedPrompts: saved }, deps: { confirmDelete } });
    h.quick.open();
    h.send({ type: 'delete-prompt', id: 'user-1' });
    await flush();
    expect(confirmDelete).toHaveBeenCalledWith({ id: 'user-1', label: 'Säilytä murre', prompt: 'Älä yleiskielistä vuorosanoja.' });
    expect(h.settings.set).not.toHaveBeenCalled();
    expect(h.prompt.actions.some((item) => item.id === 'user-1')).toBe(true);

    confirmDelete.mockImplementation(() => Promise.resolve(true));
    h.send({ type: 'delete-prompt', id: 'user-1' });
    await flush();
    expect(h.settings.set).toHaveBeenCalledWith('savedPrompts', []);
    expect(h.prompt.actions.some((item) => item.id === 'user-1')).toBe(false);

    // An id that is not saved asks nothing
    h.send({ type: 'delete-prompt', id: 'user-9' });
    await flush();
    expect(confirmDelete).toHaveBeenCalledTimes(2);
  });

  test('a built-in quick action\'s rule text is "ohje" in the row, the author\'s own words stay "oma ohje"', async () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'action', actionId: 'tighten', extra: '' });
    expect(h.context.build.mock.calls[0][0].task.instructionLabel).toBe('ohje');
    h.lastCall.accept(SHORTER);
    await flush();
    // A new request that continues the action keeps its name
    h.quick.contextChanged();
    h.send({ type: 'refine', instruction: 'vielä' });
    expect(h.context.build.mock.calls[1][0].task.instructionLabel).toBe('ohje');

    const typed = harness();
    typed.quick.open();
    typed.send({ type: 'submit', instruction: 'Tiivistä tämä' });
    expect(typed.context.build.mock.calls[0][0].task).not.toHaveProperty('instructionLabel');

    const saved = [{ id: 'user-1', label: 'Säilytä murre', prompt: 'Älä yleiskielistä vuorosanoja.', created: 1 }];
    const own = harness({ settings: { savedPrompts: saved } });
    own.quick.open();
    own.send({ type: 'action', actionId: 'user-1', extra: '' });
    expect(own.context.build.mock.calls[0][0].task).not.toHaveProperty('instructionLabel');
  });

  test('a title cut after a space keeps no space before the ellipsis', () => {
    const h = harness();
    h.quick.open();
    h.send({ type: 'submit', instruction: 'a'.repeat(39) + ' jatkuu tästä' });
    expect(h.prompt.title).toBe('a'.repeat(39) + '…');
    expect(h.lastCall.opts.meta.actionLabel).toBe('a'.repeat(39) + '…');
    const short = harness();
    short.quick.open();
    short.send({ type: 'submit', instruction: '  ' + 'b'.repeat(40) + '  ' });
    expect(short.prompt.title).toBe('b'.repeat(40));
  });
});

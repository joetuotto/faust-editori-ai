/**
 * Quick edit controller (Cmd+K, the right-click "Tekoäly" submenu, write at cursor)
 *
 * Owns the flow between the inline prompt, the model request and the
 * suggestion layer. Every dependency is injected, so the whole flow runs in
 * tests without an editor, a model or a DOM (test/services/quickEdit.test.js).
 *
 * Rules that hold everywhere in this file:
 * - Nothing is written to the manuscript here. An edit becomes suggestions
 *   (proposeChanges), generated text an insert block; the author accepts.
 * - One request at a time.
 * - Offsets are never converted to "the document now": changes of a model
 *   rewrite are offsets in the captured range's text and are proposed with
 *   its rangeId; changes of the Kielenhuolto run are offsets in its baseText.
 * - A result is used only when the request layer accepted it. No tags are
 *   parsed here.
 */

const { actionsFor, findAction, menuEntries, addSavedPrompt, removeSavedPrompt } = require('./actions.js');
const {
  LIMITS,
  QUICK_EDIT_THINKING,
  ACTION_SENDS_AT_ONCE,
  editTask,
  refineMessages,
  writeTask,
  previewUnmask,
  promptMessage
} = require('./editRequest.js');
const { resolveEditTarget } = require('../../editor/promptTarget.js');
const { createState, reduce } = require('../../editor/inlinePromptState.js');

const MAX_SESSIONS = 30;
const MAX_WRITES = 20;
const TITLE_CHARS = 40;
const DETAIL_CHARS = 400;
const REWRITE_RATIO = 0.3;
const WRITE_LABEL = 'Kirjoita kohdistimeen';
const STOPPED_NOTE = 'Pysäytetty. Teksti on leikattu viimeiseen kokonaiseen virkkeeseen.';
const CUT_NOTE = 'Vastaus katkesi pituusrajaan. Teksti on leikattu viimeiseen kokonaiseen virkkeeseen.';
const RESERVED_TAG = /<\/?teksti/i;

// Token numbers are grouped like every other count (5 200); the formatter is taken when the text is built
const overBudgetText = (built) => {
  const { formatCount } = require('../format.fi.js');
  return `Teksti on liian pitkä tälle mallille: noin ${formatCount(built.totalTokens)} tokenia, tilaa ${formatCount(built.budgetTokens)}. Lyhennä valintaa tai vaihda mallia.`;
};
const repairedNote = (count) => (
  count === 1
    ? '1 suojattu kohta puuttui vastauksesta, ja se palautettiin paikalleen.'
    : `${count} suojattua kohtaa puuttui vastauksesta, ja ne palautettiin paikalleen.`
);

/**
 * @param {object} deps see the list in the task brief: getView, getEditor, getProject, getChapterId, settings, ai,
 *   modelLabel, text, context, projectKind, controller, ui, and the optional normalizeTypography,
 *   proofreadSelection, reportContext, schedule, now, writeAtCursor
 * @returns {{ open(options?: object): boolean, host: { handle(intent: object, view: object): void },
 *             isPromptFocused(): boolean, fieldOwnsUndo(): boolean, blocksMenuAction(action: string): boolean,
 *             cancelAll(): void, reset(): void }}
 */
function createQuickEdit(deps) {
  const { getView, getEditor, getProject, getChapterId, settings, ai, modelLabel, text, context, projectKind, controller, ui } = deps;
  const normalizeTypography = typeof deps.normalizeTypography === 'function' ? deps.normalizeTypography : null;
  const proofreadSelection = typeof deps.proofreadSelection === 'function' ? deps.proofreadSelection : null;
  const reportContext = typeof deps.reportContext === 'function' ? deps.reportContext : () => {};
  const schedule = typeof deps.schedule === 'function' ? deps.schedule : (fn) => fn();
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
  const writeAtCursor = deps.writeAtCursor === true;

  let sessions = [];        // edit sessions of this project, oldest first (memory only)
  let writes = [];          // one record per insert block, for "Uusi yritys"
  let prompt = null;        // the open prompt: { view, mode, rangeId, state, session, chapterId, last }
  let active = null;        // the running request: { kind, handle, view, prompt?, record? }
  let closingSelf = false;  // true while this controller closes the prompt
  let modelList = null;     // the gateway's models, once loaded
  let counter = 0;

  const nextId = (prefix) => `${prefix}${++counter}`;

  // ---------------------------------------------------------------------------
  // Small readers
  // ---------------------------------------------------------------------------

  // Off, or not known yet: nothing of this feature may show
  const aiOn = () => settings.isLoaded() && settings.get('aiOff', false) === false;
  const savedPrompts = () => settings.get('savedPrompts', []);
  const prefs = () => ({ otherModel: null, length: 'paragraph', ...(settings.get('quickEdit', null) || {}) });
  const project = () => getProject() || {};
  const chipList = (kind, saved) => actionsFor(kind, saved).map(({ id, label, builtin }) => ({ id, label, builtin }));
  const viewAttempt = ({ id, title, modelName, changeCount, note }) => ({ id, title, modelName, changeCount, note });
  const titleOf = (instruction) => String(instruction).trim().slice(0, TITLE_CHARS);

  const pendingOf = (editor, groupId) => {
    if (!groupId || !editor || typeof editor.getSuggestions !== 'function') return [];
    const snapshot = editor.getSuggestions();
    return (snapshot && snapshot.pending ? snapshot.pending : []).filter((item) => item.groupId === groupId);
  };

  function setState(p, next) {
    p.state = next;
    if (prompt === p) ui.updatePrompt(p.view, next);
  }
  const dispatchState = (p, event) => setState(p, reduce(p.state, event));

  // What the field holds again after a stop or a failure: what the author typed
  // for this run. A run not started from the field (Kokeile toisella mallilla)
  // says so with its own fieldText.
  const fieldOf = (run) => (typeof run.fieldText === 'string' ? run.fieldText : run.typed);

  // A failure before anything was sent still has to keep the typed instruction in the field
  function failRun(p, run, error) {
    const sent = reduce(p.state, { type: 'send', instruction: fieldOf(run), title: run.title });
    setState(p, reduce(sent, { type: 'fail', error }));
  }
  const failWith = (p, code) => dispatchState(p, { type: 'fail', error: { code, message: promptMessage(code), detail: '' } });

  // ---------------------------------------------------------------------------
  // Opening and closing
  // ---------------------------------------------------------------------------

  function baseState(mode, kind, extra) {
    const current = project();
    const projectType = projectKind(current) === 'nonfiction' ? 'nonfiction' : 'fiction';
    const modelId = ai.modelFor(mode === 'edit' ? 'edit' : 'prose');
    const stored = prefs();
    return createState({
      mode,
      kind,
      projectType,
      actions: chipList(projectType, savedPrompts()),
      model: { id: modelId, name: modelLabel(modelId) },
      length: stored.length,
      otherModel: stored.otherModel,
      ...extra
    });
  }

  function removeSession(session) {
    sessions = sessions.filter((item) => item !== session);
  }

  // What the target says now: the next Cmd+K finds the session's place by this text
  function targetTextNow(p, editor) {
    const range = editor.getRange(p.rangeId);
    return range ? editor.value.slice(range.from, range.to) : null;
  }

  // Stop a request whose prompt is gone: its result has nowhere to go
  function abandon() {
    const request = active;
    active = null;
    if (request && request.handle) request.handle.cancel();
  }

  function closeSelf(restore) {
    const p = prompt;
    if (!p) return;
    prompt = null;
    if (active && active.prompt === p) abandon();
    if (p.session && p.session.attempts.length === 0) removeSession(p.session);

    const editor = getView() === p.view ? getEditor() : null;
    // Kept as it was when the editor is already gone
    if (p.session && editor) p.session.lastText = targetTextNow(p, editor);

    closingSelf = true;
    try {
      // First the prompt, then its range: 'cursor' and 'selection' read the range
      ui.closePrompt(p.view, { restore });
    } finally {
      closingSelf = false;
    }
    if (editor) editor.releaseRange(p.rangeId);
  }

  function showPrompt(view, coreMode, record) {
    // A caret anchor needs the core's 'write' mode: in 'edit' mode an empty range closes the prompt
    const opened = ui.openPrompt(view, { mode: coreMode, rangeId: record.rangeId, ui: record.state });
    if (opened === false) {
      const editor = getEditor();
      if (editor) editor.releaseRange(record.rangeId);
      return false;
    }
    prompt = record;
    return true;
  }

  function openBlocked(view, editor, mode, pos, code, message) {
    const captured = editor.captureRange(pos, pos, { highlight: false });
    const state = reduce(baseState(mode, mode === 'write' ? 'cursor' : 'selection'), { type: 'block', code, message });
    return showPrompt(view, 'write', { view, mode, rangeId: captured.rangeId, state, session: null, chapterId: getChapterId(), last: null });
  }

  // Where a stored session's text lies inside a new target: an occurrence of
  // `needle` that holds every given suggestion. -1 when there is none.
  function locate(needle, haystack, offset, items) {
    if (typeof needle !== 'string' || !needle) return -1;
    for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
      const from = offset + at;
      const to = from + needle.length;
      if (items.every((item) => item.from >= from && item.to <= to)) return at;
    }
    return -1;
  }

  /**
   * Resume (open, step 9): the newest stored session of this chapter whose
   * answer changed nothing and whose original is the target text, or whose
   * suggestions are still pending inside the target. A session whose
   * suggestions have all been decided is over and is dropped.
   * The attempts are rewrites of the session's own text, so they are never
   * shown on another one: when the target is larger (a paragraph around the
   * edited sentence), the session opens on its own text inside it; when that
   * text is no longer there, the place is reported as taken.
   * @returns {{ session: object, from: number, to: number } | { conflict: true } | null}
   */
  function findSession(editor, chapterId, targetText, from, to) {
    for (let i = sessions.length - 1; i >= 0; i -= 1) {
      const session = sessions[i];
      if (session.chapterId !== chapterId || session.attempts.length === 0) continue;
      if (!session.groupId) {
        if (session.original === targetText) return { session, from, to };
        continue;
      }
      const own = pendingOf(editor, session.groupId);
      if (own.length === 0) {
        sessions.splice(i, 1);
        continue;
      }
      const inside = own.filter((item) => item.from >= from && item.to <= to);
      if (inside.length === 0) continue;
      if (session.lastText === targetText) return { session, from, to };
      for (const known of [session.lastText, session.original]) {
        const at = locate(known, targetText, from, inside);
        if (at !== -1) return { session, from: from + at, to: from + at + known.length };
      }
      return { conflict: true };
    }
    return null;
  }

  function openAt(view, editor, { value, start, end, actionId, forceEdit }) {
    const current = project();
    const chapterId = getChapterId();
    const mode = start !== end || forceEdit || !writeAtCursor ? 'edit' : 'write';

    if (context.isBlocked(current, chapterId)) {
      return openBlocked(view, editor, mode, end, 'noAI', context.noAIMessage);
    }

    if (mode === 'write') {
      const captured = editor.captureSelection({ fallback: 'caret' });
      if (!captured) return false;
      const state = baseState('write', 'cursor', { canEditParagraph: resolveEditTarget(value, start, start, text).ok });
      return showPrompt(view, 'write', { view, mode, rangeId: captured.rangeId, state, session: null, chapterId, last: null });
    }

    const target = resolveEditTarget(value, start, end, text);
    if (!target.ok) return openBlocked(view, editor, mode, end, target.code, promptMessage(target.code));

    const targetText = value.slice(target.from, target.to);
    if (targetText.length > LIMITS.maxTarget) {
      const message = promptMessage('too-long', { chars: targetText.length, max: LIMITS.maxTarget });
      return openBlocked(view, editor, mode, target.to, 'too-long', message);
    }
    if (RESERVED_TAG.test(targetText)) {
      return openBlocked(view, editor, mode, target.to, 'reserved-tag', promptMessage('reserved-tag'));
    }

    // Resume: the suggestions already show the place, so the target is not marked again
    const found = findSession(editor, chapterId, targetText, target.from, target.to);
    if (found && found.conflict) {
      // A new request here would only collide with the session's own suggestions
      return openBlocked(view, editor, mode, target.to, 'conflict', promptMessage('conflict'));
    }
    const session = found ? found.session : null;
    const captured = session
      ? editor.captureRange(found.from, found.to, { highlight: false })
      : editor.captureRange(target.from, target.to, { highlight: true });
    const extra = session ? { attempts: session.attempts.map(viewAttempt), index: session.index } : {};
    const state = baseState('edit', target.kind, extra);
    if (session) session.rangeId = captured.rangeId;

    const record = { view, mode, rangeId: captured.rangeId, state, session, chapterId, last: null };
    if (!showPrompt(view, 'edit', record)) return false;

    if (actionId && actionId !== 'custom' && ACTION_SENDS_AT_ONCE) runAction(record, actionId, '');
    return true;
  }

  function open(options) {
    const { actionId = null, requireSelection = false } = options || {};
    if (!aiOn()) return false;
    const view = getView();
    const editor = getEditor();
    if (!view || !editor) return false;

    // A draft is being written into the text: Cmd+K waits for it
    const block = typeof editor.getInsertBlock === 'function' ? editor.getInsertBlock() : null;
    if (block && block.status === 'streaming') return true;

    if (prompt && prompt.view === view && ui.getPrompt(view)) {
      if (!requireSelection) ui.focusPrompt(view);
      return true;
    }
    if (prompt) {
      // The prompt went away with its target or its editor
      if (active && active.prompt === prompt) abandon();
      prompt = null;
    }

    // The selection is read from the editor now, never from an earlier copy
    const value = editor.value;
    const start = Math.min(editor.selectionStart, editor.selectionEnd);
    const end = Math.max(editor.selectionStart, editor.selectionEnd);
    if (requireSelection && start === end) return false;

    return openAt(view, editor, { value, start, end, actionId, forceEdit: false });
  }

  // ---------------------------------------------------------------------------
  // Edit flow
  // ---------------------------------------------------------------------------

  // The captured text no longer stands (part of an attempt was accepted, or the
  // author typed in the target): take the range as it is now. The prompt is
  // pointed at the new range before the old one is released, or it would
  // close with it.
  function recapture(p, editor, range, highlight) {
    const target = editor.captureRange(range.from, range.to, { highlight });
    const old = p.rangeId;
    p.rangeId = target.rangeId;
    if (p.session) p.session.rangeId = target.rangeId;
    ui.openPrompt(p.view, { mode: 'edit', rangeId: target.rangeId, ui: p.state });
    editor.releaseRange(old);
    return editor.getRange(target.rangeId) || { from: target.from, to: target.to, text: target.text, intact: true };
  }

  function sessionOf(p) {
    if (!p.session) {
      p.session = {
        id: nextId('q'),
        chapterId: p.chapterId,
        original: '',
        instruction: '',
        typed: '',
        log: '',
        title: '',
        actionId: null,
        task: null,
        built: null,
        mask: null,
        attempts: [],
        index: -1,
        groupId: null,
        lastText: null,
        rangeId: p.rangeId,
        exclude: undefined,
        include: undefined
      };
    }
    // The session in use is the newest one
    removeSession(p.session);
    sessions.push(p.session);
    while (sessions.length > MAX_SESSIONS) sessions.shift();
    return p.session;
  }

  function runAction(p, actionId, extraText) {
    const action = findAction(actionId, savedPrompts());
    if (!action) return;
    const extra = String(extraText || '').trim();
    const instruction = extra ? `${action.prompt}\nLisäohje: ${extra}` : action.prompt;
    runEdit(p, {
      kind: 'edit',
      actionId: action.id,
      instruction,
      typed: extra,
      // The log gets the author's own words: never the text of a built-in prompt
      log: action.builtin ? extra : instruction,
      title: action.label
    });
  }

  /**
   * Steps 1–8 of the edit flow.
   * run = { kind: 'edit', instruction, typed, log, title, actionId?, overrideModel?, attemptTitle? }
   */
  function runEdit(p, run) {
    const editor = getEditor();
    if (prompt !== p || !editor || active || !aiOn()) return;

    let range = editor.getRange(p.rangeId);
    if (!range || range.from === range.to) {
      closeSelf('none');
      return;
    }
    if (!range.intact) range = recapture(p, editor, range, p.state.phase !== 'result');
    const original = range.text;
    if (!original.trim()) {
      closeSelf('none');
      return;
    }

    const current = project();
    const session = sessionOf(p);
    const sameBase = session.original === original && session.instruction === run.instruction;
    session.original = original;
    session.instruction = run.instruction;
    session.typed = run.typed;
    session.log = run.log;
    session.title = run.title;
    session.actionId = run.actionId || null;
    p.last = run;

    if (run.actionId === 'proofread' && proofreadSelection) {
      session.task = null;
      session.built = null;
      session.mask = null;
      runProofread(p, session, run, range);
      return;
    }

    const mask = text.maskSpans(original, { structure: original.includes('\n') });
    const task = editTask({
      instruction: run.instruction,
      target: mask.text,
      placeholderRule: mask.spans.length ? text.placeholderInstruction(current.language) : '',
      language: current.language
    });
    const built = context.build({
      task,
      project: current,
      chapterId: p.chapterId,
      text: editor.value,
      selection: { from: range.from, to: range.to },
      role: 'edit',
      model: run.overrideModel,
      answerTokens: task.answerTokens,
      exclude: session.exclude,
      include: session.include
    });

    session.task = task;
    session.mask = mask;
    // A built request belongs to one model. The session keeps the one of its
    // own model, for "Tarkenna"; a run on another model leaves it alone as
    // long as the text and the instruction are still the same.
    if (!run.overrideModel || !sameBase) session.built = null;

    if (built.blocked) {
      const noAI = built.blocked === 'noAI';
      dispatchState(p, { type: 'block', code: built.blocked, message: noAI ? context.noAIMessage : promptMessage('no-paragraph') });
      return;
    }
    if (built.overBudget) {
      failRun(p, run, { code: 'over-budget', message: overBudgetText(built), detail: '' });
      return;
    }
    if (!run.overrideModel) session.built = built;

    // The base of the attempt this request may bring. It goes with the attempt,
    // not the session: a stopped or failed request must not make "Tarkenna"
    // continue an older attempt as if it were a version of the new text.
    const base = { original, mask, task, built: session.built };

    dispatchState(p, { type: 'send', instruction: fieldOf(run), title: run.title });
    sendEdit(p, session, {
      system: built.system,
      messages: built.messages,
      maxTokens: task.answerTokens,
      mask,
      original,
      base,
      model: run.overrideModel,
      title: run.attemptTitle || run.title,
      meta: { action: 'quick-edit', actionLabel: run.title, instruction: run.log, chapterId: p.chapterId }
    });
  }

  function sendEdit(p, session, { system, messages, maxTokens, mask, original, base, model, title, meta }) {
    const request = { kind: 'edit', prompt: p, view: p.view, handle: null };
    active = request;

    const options = {
      role: 'edit',
      system,
      messages,
      maxTokens,
      thinking: QUICK_EDIT_THINKING,
      original: mask.text,
      onText: (delta, full) => schedule(() => {
        if (active !== request || prompt !== p) return;
        const shown = previewUnmask(text.cleanModelOutput(full, { tag: 'teksti' }).text, mask);
        dispatchState(p, { type: 'delta', preview: shown });
      }),
      meta
    };
    if (model) options.model = model;

    const handle = ai.requestEdit(options);
    request.handle = handle;

    Promise.resolve(handle.result).then(
      (result) => {
        if (active !== request) return;   // reset, or the prompt was closed
        active = null;
        if (prompt !== p) return;
        onEditResult(p, session, result, { mask, original, base, title });
      },
      (error) => {
        // The client never rejects; if it ever does, the author still gets an answer
        if (active !== request) return;
        active = null;
        if (prompt !== p) return;
        const message = `Ei ehdotusta: ${error && error.message ? error.message : String(error)}`;
        dispatchState(p, { type: 'fail', error: { code: 'error', message, detail: '' } });
      }
    );
  }

  function onEditResult(p, session, result, { mask, original, base, title }) {
    if (result.cancelled) {
      dispatchState(p, { type: 'cancelled' });
      return;
    }
    if (!result.accepted) {
      const detail = String(result.text || '').slice(0, DETAIL_CHARS);
      dispatchState(p, { type: 'fail', error: { code: result.reason, message: result.reasonText || '', detail } });
      return;
    }

    const un = text.unmaskSpans(result.inner, mask);
    const core = normalizeTypography ? normalizeTypography(un.text, original) : un.text;

    // The target is checked before anything is proposed
    const editor = getEditor();
    const range = editor ? editor.getRange(p.rangeId) : null;
    if (!range || !range.intact) {
      failWith(p, 'changed');
      return;
    }

    showAttempt(p, session, {
      id: nextId('a'),
      title,
      modelId: result.model,
      modelName: modelLabel(result.model),
      core,
      masked: result.inner,
      repaired: un.restored.length + un.repositioned.length,
      base,
      logMeta: result.logMeta,
      changeCount: null,
      note: null
    }, { isNew: true });
  }

  // The Kielenhuolto chip: the same run as the panel's, limited to the target
  function runProofread(p, session, run, range) {
    const editor = getEditor();
    // "Pysäytä" reaches the run through an abort signal, where the platform has one
    const Abort = typeof globalThis === 'object' ? globalThis.AbortController : undefined;
    const abort = typeof Abort === 'function' ? new Abort() : null;
    const request = { kind: 'proofread', prompt: p, view: p.view, handle: { cancel: () => { request.cancelled = true; if (abort) abort.abort(); } }, cancelled: false };
    active = request;
    dispatchState(p, { type: 'send', instruction: fieldOf(run), title: run.title });

    const args = {
      text: editor.value,
      range: { from: range.from, to: range.to },
      chapterId: p.chapterId,
      model: run.overrideModel,
      onProgress: () => {}
    };
    if (abort) args.signal = abort.signal;

    const finish = (outcome) => {
      if (active !== request) return;
      active = null;
      if (prompt !== p) return;
      if (request.cancelled) {
        dispatchState(p, { type: 'cancelled' });
        return;
      }
      if (!outcome || !outcome.ok) {
        const message = outcome && outcome.reasonText ? outcome.reasonText : '';
        dispatchState(p, { type: 'fail', error: { code: 'proofread', message, detail: '' } });
        return;
      }
      const logMeta = outcome.logMeta || null;
      const modelId = (logMeta && logMeta.model) || run.overrideModel || ai.modelFor('edit');
      showAttempt(p, session, {
        id: nextId('a'),
        title: run.attemptTitle || run.title,
        modelId,
        modelName: modelLabel(modelId),
        proofread: { changes: outcome.changes || [], baseText: outcome.baseText },
        runNote: outcome.note || null,
        logMeta,
        changeCount: null,
        note: null
      }, { isNew: true });
    };

    Promise.resolve()
      .then(() => proofreadSelection(args))
      .then(finish, (error) => finish({ ok: false, reasonText: `Ei ehdotusta: ${error && error.message ? error.message : String(error)}` }));
  }

  // Take the suggestions of an earlier attempt out of the text without a log line
  function withdraw(editor, groupId) {
    const ids = pendingOf(editor, groupId).map((item) => item.id);
    if (ids.length > 0) editor.removeSuggestions(ids);
  }

  // After a result the keys of the suggestion bar must work without a click.
  // The focus is left alone only when the author is typing in another field
  // meanwhile (notes, Find): a button or a tab clicked during the wait does not count.
  function typingElsewhere() {
    if (typeof document === 'undefined') return false;
    const element = document.activeElement;
    if (!element || element === document.body) return false;
    if (typeof element.closest === 'function' && (element.closest('.cm-faust-prompt') || element.closest('.cm-editor'))) return false;
    if (element.isContentEditable === true) return true;
    const tag = String(element.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    const type = String(element.type || 'text').toLowerCase();
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden'].includes(type);
  }

  function focusManuscript(editor) {
    if (!typingElsewhere()) editor.focus();
  }

  /**
   * Put an attempt into the text as suggestions and show it in the prompt.
   * Used for a new answer and for showing an earlier attempt again.
   * @returns {boolean} false when nothing could be proposed
   */
  function showAttempt(p, session, attempt, { isNew }) {
    const editor = getEditor();
    if (!editor) return false;
    const notes = [];
    let changeCount = 0;

    if (attempt.proofread) {
      // Offsets of the run are offsets in its baseText; each change keeps its own meta
      const previous = session.groupId;
      const res = editor.proposeChanges(attempt.proofread.changes, {
        baseText: attempt.proofread.baseText,
        replaceGroupId: previous || undefined,
        meta: attempt.logMeta
      }) || {};
      const ids = Array.isArray(res.ids) ? res.ids : [];
      const moved = (res.skipped || []).filter((item) => item && item.reason === 'target-changed').length;
      changeCount = ids.length;
      if (attempt.runNote) notes.push(attempt.runNote);
      if (ids.length === 0) {
        withdraw(editor, previous);
        session.groupId = null;
        notes.push(promptMessage('no-changes'));
      } else {
        session.groupId = res.groupId;
      }
      if (moved > 0) notes.push(`${moved} korjausta jäi pois, koska teksti niiden kohdalla muuttui.`);
    } else {
      let range = editor.getRange(p.rangeId);
      if (!range) {
        failWith(p, 'changed');
        return false;
      }
      if (!range.intact) range = recapture(p, editor, range, false);
      const current = range.text;

      // A model trims its answer: the whitespace at the ends of the target stays as it is
      const lead = /^\s*/.exec(current)[0];
      const trail = lead.length === current.length ? '' : /\s*$/.exec(current)[0];
      const revised = lead + attempt.core.trim() + trail;

      if (revised === current) {
        withdraw(editor, session.groupId);
        session.groupId = null;
        notes.push(promptMessage('no-changes'));
      } else {
        const changes = text.wordDiff(current, revised).map((change) => (
          typeof change.original === 'string' ? change : { ...change, original: current.slice(change.from, change.to) }
        ));
        const res = editor.proposeChanges(changes, {
          rangeId: p.rangeId,
          keepRange: true,
          replaceGroupId: session.groupId || undefined,
          meta: attempt.logMeta
        });
        if (!res || res.ok === false) {
          failWith(p, res && res.error === 'target-changed' ? 'changed' : 'conflict');
          return false;
        }
        // A rewrite is proposed whole or not at all: with part of it skipped
        // (another suggestion in the way), accepting the rest would give a text
        // that is neither the original nor the model's answer
        if (Array.isArray(res.skipped) && res.skipped.length > 0) {
          if (Array.isArray(res.ids) && res.ids.length > 0) editor.removeSuggestions(res.ids);
          const previous = session.groupId;
          session.groupId = previous && pendingOf(editor, previous).length > 0 ? previous : null;
          failWith(p, res.skipped.some((item) => item && item.reason === 'target-changed') ? 'changed' : 'conflict');
          return false;
        }
        session.groupId = res.groupId;
        changeCount = Array.isArray(res.ids) ? res.ids.length : 0;
      }

      const action = session.actionId ? findAction(session.actionId, savedPrompts()) : null;
      if (action && action.strict) {
        const ratio = text.changeRatio(current, revised);
        if (ratio > REWRITE_RATIO) notes.push(`Malli kirjoitti tekstiä laajasti uudelleen (muutoksia ${Math.round(ratio * 100)} %).`);
      }
      if (attempt.repaired > 0) notes.push(repairedNote(attempt.repaired));
    }

    attempt.changeCount = changeCount;
    attempt.note = notes.length > 0 ? notes.join(' ') : null;
    // Also remembered here: the editor may go away (a chapter switch) without the prompt being closed
    session.lastText = targetTextNow(p, editor);

    // The suggestions now show the place
    editor.setRangeHighlight(p.rangeId, false);

    if (isNew) {
      session.attempts.push(attempt);
      while (session.attempts.length > LIMITS.maxAttempts) session.attempts.shift();
      session.index = session.attempts.length - 1;
      setState(p, reduce(p.state, { type: 'result', attempt: viewAttempt(attempt) }));
    } else {
      const index = session.attempts.indexOf(attempt);
      session.index = index;
      let next = reduce(p.state, { type: 'attempt', index, changeCount, note: attempt.note });
      next = reduce(next, { type: 'show', index });
      next = reduce(next, { type: 'note', note: null });
      setState(p, next);
    }

    focusManuscript(editor);
    return true;
  }

  function runRefine(p, refineText) {
    const instruction = String(refineText || '').trim();
    const editor = getEditor();
    const session = p.session;
    if (!instruction || !session || !editor || active || !aiOn()) return;

    const shown = session.attempts[session.index] || null;
    const range = editor.getRange(p.rangeId);
    if (!range || range.from === range.to) {
      closeSelf('none');
      return;
    }
    const title = titleOf(instruction);

    // A Kielenhuolto attempt has no rewrite to refine: an ordinary edit with the typed instruction
    if (shown && shown.proofread) {
      runEdit(p, { kind: 'edit', instruction, typed: instruction, log: instruction, title });
      return;
    }

    // The three-message form only while the attempt on screen is a version of
    // the target as it reads now, and with the request that attempt came from
    const base = shown && shown.base ? shown.base : null;
    const intact = !!base && range.intact && range.text === base.original;
    if (intact && base.built && base.mask && base.task && typeof shown.masked === 'string') {
      const refined = refineMessages(base.built, shown.masked, instruction);
      p.last = { kind: 'refine', instruction };
      dispatchState(p, { type: 'send', instruction, title });
      sendEdit(p, session, {
        system: refined.system,
        messages: refined.messages,
        maxTokens: base.task.answerTokens,
        mask: base.mask,
        original: base.original,
        base,
        title,
        meta: { action: 'quick-edit', actionLabel: title, instruction, chapterId: p.chapterId }
      });
      return;
    }

    // Part of an attempt was accepted, or the attempt belongs to older text: a
    // fresh request on the text as it is now
    runEdit(p, {
      kind: 'edit',
      actionId: session.actionId,
      instruction: `${session.instruction}\nTarkennus: ${instruction}`,
      typed: instruction,
      log: session.log ? `${session.log}\nTarkennus: ${instruction}` : `Tarkennus: ${instruction}`,
      title
    });
  }

  function runTryModel(p, modelValue) {
    const modelId = String(modelValue || '').trim();
    const session = p.session;
    if (!modelId || !session || active || !aiOn()) return;

    settings.set('quickEdit', { ...prefs(), otherModel: modelId });

    // The same task again; the request itself is built anew for the other model
    const shown = session.attempts[session.index] || null;
    runEdit(p, {
      kind: 'edit',
      actionId: shown && shown.proofread ? 'proofread' : session.actionId,
      instruction: session.instruction,
      typed: session.typed,
      log: session.log,
      title: session.title,
      attemptTitle: modelLabel(modelId),
      overrideModel: modelId,
      // Nothing was typed for this run: after a stop the field is as it was
      fieldText: p.state.phase === 'error' ? p.state.draft : ''
    });
  }

  function runSelect(p, wanted) {
    const session = p.session;
    if (!session || active || session.attempts.length === 0) return;
    const index = Math.max(0, Math.min(session.attempts.length - 1, Number.isFinite(wanted) ? Math.trunc(wanted) : session.index));
    if (index === session.index && p.state.phase === 'result') return;
    p.last = { kind: 'select', index };
    showAttempt(p, session, session.attempts[index], { isNew: false });
  }

  function openPicker(p) {
    const apply = (list) => {
      if (prompt !== p) return;
      const shown = p.session ? p.session.attempts[p.session.index] : null;
      const onScreen = shown ? shown.modelId : p.state.model && p.state.model.id;
      const models = list.filter((model) => model && model.id && model.id !== onScreen);
      const listed = (id) => models.some((model) => model.id === id);
      const stored = prefs().otherModel;
      const prose = ai.modelFor('prose');
      const choice = listed(stored) ? stored : listed(prose) ? prose : models.length > 0 ? models[0].id : stored || '';
      const next = reduce(p.state, { type: 'models', models, otherModel: choice });
      setState(p, reduce(next, { type: 'picker', open: true }));
    };

    if (modelList) {
      apply(modelList);
      return;
    }
    Promise.resolve()
      .then(() => ai.listModels())
      .then(
        (list) => {
          const models = Array.isArray(list) ? list : [];
          if (models.length > 0) modelList = models;
          apply(models);
        },
        () => apply([])   // no list: the author types the model id
      );
  }

  function acceptAll(p) {
    const session = p.session;
    const editor = getEditor();
    if (!session || !session.groupId || !editor || active) return;
    const attempt = session.attempts[session.index];

    // Through the suggestion controller, so the snapshot, the log row and the
    // dialogue rule are the same as for the bar's button
    controller.acceptAll({ groupId: session.groupId, reason: `Ennen pikamuokkausta: ${attempt ? attempt.title : ''}` });

    const left = pendingOf(editor, session.groupId).length;
    if (left > 0) {
      dispatchState(p, { type: 'note', note: `Vuorosanojen ehdotuksia: ${left}. Käy ne läpi yksitellen.` });
      editor.focus();
      return;
    }
    removeSession(session);
    closeSelf('cursor');
  }

  function rejectAll(p) {
    const session = p.session;
    if (!session || !session.groupId || active) return;
    controller.rejectAll({ groupId: session.groupId });
    removeSession(session);
    closeSelf('none');
  }

  // Everything of the attempt was decided in the text: the prompt has nothing left to offer
  function onTick(p) {
    const session = p.session;
    const editor = getEditor();
    if (p.state.phase !== 'result' || active || !editor || !session || !session.groupId) return;
    // The tick follows every change of the text: the next Cmd+K recognises the
    // place also after a suggestion was accepted here and the editor was replaced
    session.lastText = targetTextNow(p, editor);
    if (pendingOf(editor, session.groupId).length > 0) return;
    removeSession(session);
    closeSelf('none');
  }

  function retry(p) {
    const last = p.last;
    if (!last || active) return;
    if (last.kind === 'refine') runRefine(p, last.instruction);
    else if (last.kind === 'select') runSelect(p, last.index);
    else runEdit(p, last);
  }

  function savePrompt(p, promptText) {
    const result = addSavedPrompt(savedPrompts(), promptText, now());
    if (!result.added) return;
    storeSaved(p, result.list);
  }

  function storeSaved(p, list) {
    // The stored shape has no `builtin` field
    settings.set('savedPrompts', list.map(({ id, label, prompt: promptText, created }) => ({ id, label, prompt: promptText, created })));
    dispatchState(p, { type: 'actions', actions: chipList(p.state.projectType, list) });
  }

  // ---------------------------------------------------------------------------
  // Write flow (write at cursor)
  // ---------------------------------------------------------------------------

  const manuscriptHasFocus = () => {
    if (typeof document === 'undefined') return false;
    const element = document.activeElement;
    return !!(element && typeof element.closest === 'function' && element.closest('.cm-content'));
  };

  // afterRequest: the prompt comes back when a request ended, maybe long after
  // Enter; an author typing in the manuscript meanwhile keeps the focus there
  // (the core focuses the field of every prompt it opens). Cmd+K or a click
  // puts it into the field.
  function reopenWrite(record, pos, { note = null, blocked = null, afterRequest = false } = {}) {
    const view = getView();
    const editor = getEditor();
    if (!aiOn() || !view || !editor || view !== record.view || prompt) return;
    const keepTyping = afterRequest && manuscriptHasFocus();

    const at = Math.max(0, Math.min(editor.value.length, pos));
    const captured = editor.captureRange(at, at, { highlight: false });
    let state = baseState('write', 'cursor', {
      length: record.length,
      draft: record.direction,
      note,
      canEditParagraph: resolveEditTarget(editor.value, at, at, text).ok
    });
    if (blocked) state = reduce(state, { type: 'block', code: 'noAI', message: blocked });
    const opened = showPrompt(view, 'write', { view, mode: 'write', rangeId: captured.rangeId, state, session: null, chapterId: record.chapterId, last: null });
    if (opened && keepTyping) editor.focus();
  }

  // Task and context of a write request, stored in the record. False, with the
  // reason handed to onRefused, when it cannot be sent.
  function prepareWrite(record, editor, pos, onRefused) {
    const current = project();
    const task = writeTask({
      direction: record.direction,
      length: record.length,
      projectKind: projectKind(current),
      language: current.language
    });
    const built = context.build({
      task,
      project: current,
      chapterId: record.chapterId,
      text: editor.value,
      cursor: pos,
      role: 'prose',
      answerTokens: task.answerTokens
    });
    if (built.blocked === 'noAI') {
      onRefused({ blocked: context.noAIMessage });
      return false;
    }
    if (built.blocked) {
      onRefused({ note: promptMessage('no-paragraph') });
      return false;
    }
    if (built.overBudget) {
      onRefused({ note: overBudgetText(built) });
      return false;
    }
    record.system = built.system;
    record.messages = built.messages;
    record.maxTokens = task.answerTokens;
    return true;
  }

  function runWrite(p, directionText) {
    const editor = getEditor();
    if (prompt !== p || !editor || active || !aiOn()) return;

    const range = editor.getRange(p.rangeId);
    const pos = range ? range.from : Math.min(editor.selectionStart, editor.selectionEnd);
    const record = {
      blockId: null,
      chapterId: p.chapterId,
      view: p.view,
      pos,
      direction: String(directionText || '').trim(),
      length: p.state.length,
      system: '',
      messages: [],
      maxTokens: 0
    };

    // The prompt gives way to the block; closing returns the focus to the manuscript
    closeSelf('cursor');

    if (!prepareWrite(record, editor, pos, (reason) => reopenWrite(record, pos, reason))) return;

    const started = editor.startInsertBlock({
      pos,
      meta: {
        source: 'faust',
        action: 'write-here',
        actionLabel: WRITE_LABEL,
        instruction: record.direction,
        provider: null,
        model: ai.modelFor('prose'),
        requestLogId: null
      }
    });
    if (!started || !started.ok) {
      reopenWrite(record, pos, { note: promptMessage('conflict') });
      return;
    }
    record.blockId = started.blockId;
    writes.push(record);
    while (writes.length > MAX_WRITES) writes.shift();

    sendWrite(record);
  }

  function sendWrite(record) {
    const request = { kind: 'write', record, view: record.view, handle: null, textSoFar: '', sent: '' };
    active = request;

    const handle = ai.requestEdit({
      role: 'prose',
      system: record.system,
      messages: record.messages,
      maxTokens: record.maxTokens,
      thinking: QUICK_EDIT_THINKING,
      onText: (delta, full) => {
        if (active !== request) return;
        request.textSoFar = full;
        const editor = getView() === record.view ? getEditor() : null;
        if (!editor) return;
        // Only what is new goes to the block. If the cleaned text no longer
        // starts with what was sent, the final text will replace it.
        const shown = text.cleanModelOutput(full, { tag: 'teksti' }).text;
        if (!shown.startsWith(request.sent)) return;
        const more = shown.slice(request.sent.length);
        if (more) {
          editor.appendInsertBlock(record.blockId, more);
          request.sent = shown;
        }
      },
      meta: { action: 'write-here', actionLabel: WRITE_LABEL, instruction: record.direction, chapterId: record.chapterId }
    });
    request.handle = handle;

    const settle = (result) => {
      if (active !== request) return;   // reset: the block belonged to the previous project
      active = null;
      onWriteResult(request, result);
    };
    Promise.resolve(handle.result).then(settle, (error) => settle({
      cancelled: false,
      accepted: false,
      reason: 'error',
      reasonText: `Ei ehdotusta: ${error && error.message ? error.message : String(error)}`,
      cleaned: null,
      logMeta: null
    }));
  }

  function onWriteResult(request, result) {
    const { record } = request;
    const editor = getView() === record.view ? getEditor() : null;
    const blockNow = () => (editor && typeof editor.getInsertBlock === 'function' ? editor.getInsertBlock() : null);
    const first = blockNow();
    const ours = !!first && first.id === record.blockId;
    const pos = ours && Number.isFinite(first.pos) ? first.pos : record.pos;
    const gone = () => {
      const block = blockNow();
      return !block || block.id !== record.blockId;
    };
    const tidy = (value) => (value && normalizeTypography ? normalizeTypography(value) : value);

    // A stop is finished here and nowhere else: the block's "Pysäytä", Esc in
    // the manuscript and "Pysäytä tekoäly" only cancel the request.
    if (result.cancelled) {
      if (!ours || first.status !== 'streaming') return;
      const out = tidy(text.trimToSentence(text.cleanModelOutput(request.textSoFar, { tag: 'teksti' }).text));
      if (out) {
        editor.finishInsertBlock(record.blockId, { status: 'stopped', text: out, note: STOPPED_NOTE, meta: result.logMeta });
        return;
      }
      editor.finishInsertBlock(record.blockId, { status: 'stopped', text: '' });
      if (gone()) reopenWrite(record, pos, { note: promptMessage('no-sentence'), afterRequest: true });
      return;
    }

    // The chapter was left: the suggestion layer has stored the block as stopped
    if (!ours) return;

    let out = '';
    let note = null;
    if (result.accepted) {
      out = tidy(result.inner);
    } else if (result.reason === 'max_tokens') {
      // The client rejects a cut answer without cleaning it (cleaned: null):
      // the text inside the tags is read here, from the answer or the stream
      const raw = typeof result.text === 'string' && result.text ? result.text : request.textSoFar;
      const cleaned = result.cleaned || text.cleanModelOutput(raw || '', { tag: 'teksti' });
      if (cleaned && cleaned.hadOpenTag && cleaned.text) {
        out = tidy(text.trimToSentence(cleaned.text));
        note = CUT_NOTE;
      }
    }

    if (out && out.trim()) {
      const done = { status: 'done', text: out, meta: result.logMeta };
      if (note) done.note = note;
      editor.finishInsertBlock(record.blockId, done);
      return;
    }

    // An empty attempt disappears; when it was the only one, so does the block
    editor.finishInsertBlock(record.blockId, { status: 'error', text: '', note: result.reasonText });
    if (gone()) reopenWrite(record, pos, { note: result.reasonText || null, afterRequest: true });
  }

  // The block's own buttons that need the owner of the request
  function onBlockAction(action, block, chapterId) {
    if (action === 'stop') {
      // Nothing else: the cancelled result finishes the block
      if (active && active.kind === 'write' && active.handle) active.handle.cancel();
      return;
    }
    if (action !== 'retry' || !block || active || !aiOn()) return;

    const view = getView();
    const editor = getEditor();
    if (!view || !editor || chapterId !== getChapterId()) return;

    let record = writes.find((item) => item.blockId === block.id && item.chapterId === chapterId) || null;
    if (!record) {
      // The block outlived its record: ask again from what the block itself knows
      record = {
        blockId: block.id,
        chapterId,
        view,
        pos: block.pos,
        direction: block.meta && typeof block.meta.instruction === 'string' ? block.meta.instruction : '',
        length: prefs().length,
        system: '',
        messages: [],
        maxTokens: 0
      };
      if (!prepareWrite(record, editor, block.pos, () => {})) return;
      writes.push(record);
      while (writes.length > MAX_WRITES) writes.shift();
    }

    // Earlier attempts stay; -1 means one is still streaming
    if (editor.retryInsertBlock(block.id) < 0) return;
    record.view = view;
    sendWrite(record);
  }

  if (controller && typeof controller.onBlockAction === 'function') controller.onBlockAction(onBlockAction);

  // ---------------------------------------------------------------------------
  // Intents from the editor and the prompt
  // ---------------------------------------------------------------------------

  // The prompt closed by itself (its target was deleted). Runs inside the
  // editor's update: nothing may be dispatched here.
  function onPromptClosed(view) {
    if (closingSelf || !prompt || prompt.view !== view) return;
    const p = prompt;
    prompt = null;
    if (active && active.prompt === p) abandon();
    if (p.session && p.session.attempts.length === 0) removeSession(p.session);
    Promise.resolve().then(() => {
      const editor = getEditor();
      if (editor && getView() === p.view && editor.getRange(p.rangeId)) editor.releaseRange(p.rangeId);
    });
  }

  function onViewDestroyed(view) {
    if (prompt && prompt.view === view) prompt = null;
    if (!active || active.view !== view) return;
    // A write is only cancelled: its result finds no block and does nothing
    if (active.kind === 'write') active.handle.cancel();
    else abandon();
  }

  function onContextMenu(intent) {
    if (!aiOn()) return;
    const current = project();
    if (context.isBlocked(current, getChapterId())) return;
    reportContext({
      x: intent.x,
      y: intent.y,
      hasSelection: Boolean(intent.hasSelection),
      actions: menuEntries(projectKind(current), savedPrompts())
    });
  }

  function handle(intent, view) {
    if (!intent || typeof intent.type !== 'string') return;

    // These two come from an editor on its way out: compared with their own view
    if (intent.type === 'view-destroyed') {
      onViewDestroyed(view);
      return;
    }
    if (intent.type === 'prompt-closed') {
      onPromptClosed(view);
      return;
    }

    // Anything else from a replaced editor is ignored
    if (!view || view !== getView()) return;

    if (intent.type === 'contextmenu') {
      onContextMenu(intent);
      return;
    }
    if (intent.type === 'block-stop') {
      if (active && active.kind === 'write' && active.handle) active.handle.cancel();
      return;
    }
    if (intent.type === 'view-ready') return;   // a pending block returns through the suggestion layer's seed

    const p = prompt;
    if (!p || p.view !== view) return;
    // "Tekoäly pois" was switched on while the prompt was open: an entry point of
    // the AI is never left on screen in a dead state. Suggestions stay as they are.
    if (!aiOn()) {
      closeSelf('none');
      return;
    }
    const { phase } = p.state;

    switch (intent.type) {
      case 'submit':
        if (phase !== 'idle' && phase !== 'error') return;
        if (p.mode === 'write') {
          runWrite(p, intent.instruction);
        } else {
          const instruction = String(intent.instruction || '').trim();
          if (!instruction) return;
          // Enter after a failed refinement sends the (edited) refinement again, not a new instruction
          if (phase === 'error' && p.last && p.last.kind === 'refine') runRefine(p, instruction);
          else runEdit(p, { kind: 'edit', instruction, typed: instruction, log: instruction, title: titleOf(instruction) });
        }
        return;

      case 'action':
        if (p.mode !== 'edit' || phase === 'sending' || phase === 'blocked') return;
        runAction(p, intent.actionId, intent.extra);
        return;

      case 'retry':
        if (phase === 'error') retry(p);
        return;

      case 'cancel':
        // The cancelled result returns the prompt to its field, with the instruction in it
        if (active && active.prompt === p && active.handle) active.handle.cancel();
        return;

      case 'refine':
        if (phase === 'result') runRefine(p, intent.instruction);
        return;

      case 'try-model':
        if (phase === 'result' || phase === 'error') runTryModel(p, intent.modelId);
        return;

      case 'picker':
        if (intent.open) openPicker(p);
        else dispatchState(p, { type: 'picker', open: false });
        return;

      case 'select':
        if (phase === 'result') runSelect(p, intent.index);
        return;

      case 'accept-all':
        if (phase === 'result') acceptAll(p);
        return;

      case 'reject-all':
        if (phase === 'result') rejectAll(p);
        return;

      case 'close':
        // Suggestions in the text are left as they are; the session stays for the next Cmd+K.
        // Only a selected target is selected again: a paragraph target was opened
        // from a bare caret, which is still where the author left it.
        closeSelf(phase === 'result' || phase === 'blocked' || p.state.kind !== 'selection' ? 'none' : 'selection');
        return;

      case 'tick':
        onTick(p);
        return;

      case 'save-prompt':
        savePrompt(p, intent.text);
        return;

      case 'delete-prompt':
        storeSaved(p, removeSavedPrompt(savedPrompts(), intent.id));
        return;

      case 'length':
        dispatchState(p, { type: 'length', length: intent.length });
        settings.set('quickEdit', { ...prefs(), length: p.state.length });
        return;

      case 'edit-paragraph': {
        if (p.mode !== 'write') return;
        const editor = getEditor();
        if (!editor) return;
        const range = editor.getRange(p.rangeId);
        const pos = range ? range.from : Math.min(editor.selectionStart, editor.selectionEnd);
        closeSelf('none');
        openAt(view, editor, { value: editor.value, start: pos, end: pos, actionId: null, forceEdit: true });
        return;
      }

      default:
        return;
    }
  }

  // ---------------------------------------------------------------------------
  // For app.js
  // ---------------------------------------------------------------------------

  function isPromptFocused() {
    if (typeof document === 'undefined') return false;
    const element = document.activeElement;
    return !!(element && typeof element.closest === 'function' && element.closest('.cm-faust-prompt'));
  }

  // Cmd+Z belongs to the field only while an instruction is being written.
  // After a result the field is empty, and Cmd+Z must undo the accept just made.
  function fieldOwnsUndo() {
    if (!prompt || !isPromptFocused()) return false;
    const element = document.activeElement;
    if (element.tagName !== 'TEXTAREA' || !element.value) return false;
    return prompt.state.phase === 'idle' || prompt.state.phase === 'error';
  }

  // Cmd+B or Lisää → Erikoismerkki must not change the manuscript while an instruction is typed
  function blocksMenuAction(action) {
    return isPromptFocused() && /^(format-|text-|insert-text$)/.test(String(action));
  }

  function cancelAll() {
    // Stopping everything because the AI was switched off: the prompt goes too
    // (closing it stops its own request)
    if (prompt && !aiOn()) closeSelf('none');
    if (active && active.handle) active.handle.cancel();
  }

  // A new project: nothing of the previous one may show up in it
  function reset() {
    abandon();
    if (prompt) {
      const p = prompt;
      prompt = null;
      if (getView() === p.view) {
        closingSelf = true;
        try {
          ui.closePrompt(p.view, { restore: 'none' });
        } finally {
          closingSelf = false;
        }
        const editor = getEditor();
        if (editor) editor.releaseRange(p.rangeId);
      }
    }
    sessions = [];
    writes = [];
    modelList = null;
  }

  return { open, host: { handle }, isPromptFocused, fieldOwnsUndo, blocksMenuAction, cancelAll, reset };
}

module.exports = { createQuickEdit };

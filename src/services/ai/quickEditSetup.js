/**
 * src/services/ai/quickEditSetup.js - the quick edit (Cmd+K) assembled for the app (stage I-05)
 *
 *   setupQuickEdit({ getEditor, getProject, getChapterId, getController, getWordCheck, writeAtCursor, askConfirm })
 *     → the controller of src/services/ai/quickEdit.js: { open, host, isPromptFocused, fieldOwnsUndo,
 *       blocksMenuAction, contextChanged, contextChecked, cancelAll, reset }
 *
 * The controller gets the app's real parts here: the settings store, the one AI client, the text
 * functions, the context session, the suggestion controller and the five functions of the inline
 * prompt (src/editor/inlinePrompt.js). Nothing here decides anything about an edit.
 *
 * From stage I-06 the chip "Kielenhuolto – vain virheet" runs Kielenhuolto's own pipeline on the lines
 * of the target (createProofreadSelection of proofreadPass.js: the panel's batches, guards and per-change
 * meta, so a dialogue change is never taken by "Hyväksy muutokset"), and every answer's typographic
 * noise is written back as the original (normaliseModelText: quotes, dashes and ellipses are the
 * typography checker's job). getWordCheck gives the suspect-word guard its word list when the chip runs.
 *
 * What this file adds is the context row ("Mitä malli näkee") in the prompt: whenever there is a
 * built request for the open prompt (a dry build when the prompt opens, the real one before
 * sending), the row is mounted into the prompt's context slot. The parts the author switches off
 * or adds there go into the next build (and make the next "Tarkenna" a new request), a request
 * whose prompt the model did not see whole puts a notice in the row, a refinement shows its three
 * turns under "Näytä kehote", and a dry build that does not fit the model disables sending.
 *
 * An ES module bundled by webpack: every CommonJS module is taken with `import`, never `require`.
 */
import { createQuickEdit } from './quickEdit.js';
import { editTask, writeTask } from './editRequest.js';
import { getAIClient } from './aiClient.js';
import { getContextSession } from './contextSession.js';
import { isChapterBlocked, MESSAGES } from './contextBuilder.js';
import { cleanModelOutput } from './cleanModelOutput.js';
import { maskSpans, unmaskSpans, placeholderInstruction } from './maskSpans.js';
import { getSettingsStore } from '../settingsStore.js';
import { modelLabel } from '../format.fi.js';
import { projectKind, folderName } from '../story/codex.js';
import { wordDiff, changeRatio } from '../../editor/wordDiff.js';
import { trimToSentence } from '../../editor/sentences.js';
import { splitBlocks, blockAt } from '../../editor/blocks.js';
import { createProofreadSelection, proofBudget } from './proofreadPass.js';
import { normaliseModelText, effectiveLineStartDash } from '../../editor/typography.fi.js';
import { TEXT_DEPS } from '../language/languageTools.js';
import { openPrompt, updatePrompt, closePrompt, getPrompt, focusPrompt } from '../../editor/inlinePrompt.js';
import { mountContextRow, manualChoicesFor } from '../../components/ContextRow.js';

const TRUNCATED_NOTICE = 'Malli ei nähnyt koko kehotetta.';

// The prompt's slot for the row (inlinePromptView.js creates it once per prompt and never touches
// its children). The prompt is a tooltip in the layer host; the app has one at a time.
function contextSlotOf(view) {
  const doc = view && view.dom ? view.dom.ownerDocument : null;
  if (!doc) return null;
  const prompts = doc.querySelectorAll('.cm-tooltip.cm-faust-prompt');
  const prompt = prompts.length > 0 ? prompts[prompts.length - 1] : null;
  return prompt ? prompt.querySelector('[data-role="context"]') : null;
}

// One pending frame: the streamed preview is drawn at most once per frame, the newest text wins
function frameScheduler() {
  let frame = 0;
  let next = null;
  return (fn) => {
    next = fn;
    if (frame) return;
    const run = () => {
      frame = 0;
      const job = next;
      next = null;
      if (job) job();
    };
    frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(run) : setTimeout(run, 16);
  };
}

/**
 * @param {{ getEditor: () => object | null, getProject: () => object, getChapterId: () => string | null,
 *           getController: () => object, getWordCheck?: () => ({ current: Function } | null), writeAtCursor?: boolean,
 *           askConfirm?: (title: string, message: string, confirmLabel: string, cancelLabel: string, options: object) => Promise<boolean> }} options
 */
export function setupQuickEdit({ getEditor, getProject, getChapterId, getController, getWordCheck = null, writeAtCursor = false, askConfirm = null }) {
  const settings = getSettingsStore();
  const ai = getAIClient();
  const getView = () => {
    const editor = getEditor();
    return editor && editor.faustView ? editor.faustView : null;
  };

  // ---------------------------------------------------------------------------
  // The context row of the open prompt
  // ---------------------------------------------------------------------------

  // slot: the element the row lives in; args and built: the last build for this prompt;
  // exclude (undefined = what the session remembers for the task) and include: the row's lists;
  // sent: a request whose turns are not the build's own (a refinement), for Näytä kehote
  const row = { slot: null, unmount: null, args: null, built: null, exclude: undefined, include: [], notice: null, sent: null };

  const taskIdOf = (args) => (args && args.task && typeof args.task.id === 'string' ? args.task.id : 'edit');
  const excludeFor = (args) => (row.exclude !== undefined ? row.exclude : getContextSession().getExclude(taskIdOf(args)));
  // The row's lists belong to its prompt and its task: a build with no prompt open (an insert
  // block's retry) or for another task gets the session's own lists
  const withRowLists = (args) => {
    if (!row.slot || !row.args || taskIdOf(args) !== taskIdOf(row.args)) return args;
    return {
      ...args,
      exclude: row.exclude !== undefined ? row.exclude : args.exclude,
      include: row.include.length > 0 ? row.include : args.include
    };
  };

  // The author changed the parts: the next build takes them, and so does the next "Tarkenna"
  const changeLists = (patch) => {
    Object.assign(row, patch);
    quickEdit.contextChanged();
    rebuild();
  };

  function renderRow() {
    if (!row.slot || !row.built || !row.slot.isConnected) return;
    const { built, args } = row;
    const project = (args && args.project) || getProject() || {};
    const systemAsUser = built.model ? ai.modelSettings(built.model).systemAsUser === true : false;
    row.unmount = mountContextRow(row.slot, {
      built,
      folder: folderName(project),
      taskId: taskIdOf(args),
      exclude: excludeFor(args),
      include: row.include,
      onExcludeChange: (ids) => changeLists({ exclude: ids }),
      onIncludeChange: (ids) => changeLists({ include: ids }),
      manualChoices: manualChoicesFor(project, built, row.include),
      notice: row.notice || undefined,
      systemAsUser: row.sent ? row.sent.systemAsUser : systemAsUser,
      sent: row.sent || undefined
    });
  }

  function remember(args, built) {
    row.args = args;
    row.built = built;
    row.notice = null;
    row.sent = null;
    renderRow();
  }

  // A dry build or a rebuild of the row: the prompt learns whether the request can be sent at
  // all. A moment later, because a new prompt is only the controller's once its opening returns.
  function checkSoon(built) {
    Promise.resolve().then(() => {
      if (row.built === built) quickEdit.contextChecked(built);
    });
  }

  // The same request again with the row's lists (a part switched off or added in the row)
  function rebuild() {
    if (!row.args) return;
    remember(row.args, getContextSession().build(withRowLists(row.args)));
    checkSoon(row.built);
  }

  // The row goes with its prompt, and so do its lists. Unmounted a moment later: the prompt may
  // close inside a render.
  function dropRow() {
    const unmount = row.unmount;
    row.slot = null;
    row.unmount = null;
    row.args = null;
    row.built = null;
    row.exclude = undefined;
    row.include = [];
    row.notice = null;
    row.sent = null;
    if (unmount) setTimeout(unmount, 0);
  }
  function sweepSoon() {
    setTimeout(() => {
      if (row.slot && !row.slot.isConnected) dropRow();
    }, 0);
  }

  // A dry build when the prompt opens: everything that goes with the instruction, before it is written
  function dryBuild(view) {
    const open = getPrompt(view);
    const editor = getEditor();
    if (!open || !open.ui || open.ui.phase === 'blocked' || !editor) return;
    const project = getProject() || {};
    const value = editor.value;
    let args;
    try {
      if (open.ui.mode === 'write') {
        // A prompt reopened after a stop or a refusal keeps the author's direction (its draft): the row counts it
        const task = writeTask({ direction: open.ui.draft || '', length: open.ui.length, projectKind: projectKind(project), language: project.language });
        args = { task, project, chapterId: getChapterId(), text: value, cursor: open.from, role: 'prose', answerTokens: task.answerTokens };
      } else {
        const target = value.slice(open.from, open.to);
        if (!target.trim()) return;
        const mask = maskSpans(target, { structure: target.includes('\n') });
        // editTask wants an instruction; the row shows the request without one until it is written
        const task = {
          ...editTask({
            instruction: '-',
            target: mask.text,
            placeholderRule: mask.spans.length ? placeholderInstruction(project.language) : '',
            language: project.language
          }),
          instruction: ''
        };
        args = { task, project, chapterId: getChapterId(), text: value, selection: { from: open.from, to: open.to }, role: 'edit', answerTokens: task.answerTokens };
      }
    } catch (error) {
      return;
    }
    // The prompt's own task: the row's lists apply from here on
    row.args = args;
    remember(args, getContextSession().build(withRowLists(args)));
    checkSoon(row.built);
  }

  // A new prompt gets a new row; the same prompt pointed at a new range keeps its row
  function attachRow(view) {
    const slot = contextSlotOf(view);
    if (!slot || slot === row.slot) return;
    dropRow();
    row.slot = slot;
    dryBuild(view);
  }

  // ---------------------------------------------------------------------------
  // What the controller gets
  // ---------------------------------------------------------------------------

  const ui = {
    openPrompt(view, spec) {
      const opened = openPrompt(view, spec);
      if (opened) attachRow(view);
      return opened;
    },
    updatePrompt,
    closePrompt(view, options) {
      const closed = closePrompt(view, options);
      sweepSoon();
      return closed;
    },
    getPrompt,
    focusPrompt
  };

  const context = {
    build(args) {
      const merged = withRowLists(args);
      const built = getContextSession().build(merged);
      remember(merged, built);
      return built;
    },
    isBlocked: isChapterBlocked,
    noAIMessage: MESSAGES.noAI
  };

  // The client as it is; a result says whether the model saw the whole prompt, which the row shows.
  // A request of several turns (a refinement) is what Näytä kehote shows from then on.
  const client = {
    modelFor: (role) => ai.modelFor(role),
    listModels: () => ai.listModels(),
    requestEdit(options) {
      if (row.slot && options && Array.isArray(options.messages) && options.messages.length > 1) {
        const model = options.model || ai.modelFor(options.role);
        row.sent = {
          system: options.system || '',
          messages: options.messages,
          systemAsUser: model ? ai.modelSettings(model).systemAsUser === true : false
        };
        renderRow();
      }
      const handle = ai.requestEdit(options);
      const slot = row.slot;
      const result = Promise.resolve(handle.result).then((value) => {
        if (value && value.promptTruncated && slot && row.slot === slot) {
          row.notice = TRUNCATED_NOTICE;
          renderRow();
        }
        return value;
      });
      return { id: handle.id, result, cancel: () => handle.cancel() };
    }
  };

  // The chip's Kielenhuolto: one job, one pipeline, one name (brief I-06 step 7). Its build goes through
  // context.build, so the prompt's row shows each batch's request and its lists apply to the batches.
  const proofreadSelection = createProofreadSelection({
    getProject,
    textDeps: TEXT_DEPS,
    build: (task, { chapterId, text: runText, model }) => context.build({ task: { ...task, instructionLabel: 'ohje' }, project: getProject(), chapterId, text: runText, role: 'edit', model, answerTokens: task.answerTokens }),
    request: (opts) => client.requestEdit({ role: 'edit', ...opts }),
    // Which checker answers is looked up when the batch is checked, as in the panel: the system checker
    // answers only while Työkalut ▸ Oikoluku is on, and the switch may have changed since the app started
    getCheckWords: () => {
      const check = typeof getWordCheck === 'function' ? getWordCheck() : null;
      if (!check || typeof check.current !== 'function') return undefined;
      return (words) => Promise.resolve(typeof check.refresh === 'function' ? check.refresh() : null).then(() => {
        const current = check.current();
        return current ? current(words) : undefined;
      });
    },
    getBudget: (model) => proofBudget({ promptBudgetChars: ai.budgetFor(model || ai.modelFor('edit'), 0).promptBudgetChars }),
    dashDialogue: (project) => effectiveLineStartDash(project || {}) === 'dialogue'
  });

  const quickEdit = createQuickEdit({
    getView,
    getEditor,
    getProject,
    getChapterId,
    settings,
    ai: client,
    modelLabel,
    text: { wordDiff, changeRatio, cleanModelOutput, maskSpans, unmaskSpans, placeholderInstruction, trimToSentence, splitBlocks, blockAt },
    context,
    projectKind,
    controller: getController(),
    ui,
    normalizeTypography: normaliseModelText,
    proofreadSelection,
    reportContext: (info) => {
      const api = typeof window !== 'undefined' ? window.electronAPI : null;
      if (api && typeof api.reportManuscriptContext === 'function') api.reportManuscriptContext(info);
    },
    schedule: frameScheduler(),
    writeAtCursor: writeAtCursor === true,
    // Deleting a saved prompt asks first (rule 0.6)
    confirmDelete: typeof askConfirm === 'function'
      ? (saved) => askConfirm('Poistetaanko ohje?', `Tallennettu ohje ”${saved.label}” poistetaan.`, 'Poista ohje', 'Peruuta', { danger: true })
      : null
  });

  // The editor's intents go to the controller; a prompt that closed by itself takes its row along
  const host = {
    handle(intent, view) {
      quickEdit.host.handle(intent, view);
      if (intent && (intent.type === 'prompt-closed' || intent.type === 'view-destroyed')) sweepSoon();
      // Pituus changes the write task's length rule and answer budget: the row and Näytä kehote follow it
      if (intent && intent.type === 'length' && row.slot) dryBuild(view);
    }
  };

  return { ...quickEdit, host };
}

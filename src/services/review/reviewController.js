/**
 * Review controller: the one object app.js and the Tarkistus panel talk to
 *
 * It owns everything that must survive the tab being closed or the Inspector
 * being hidden: the running check, the selected check and filter, failure
 * details, and the link between a finding and the suggestion opened for it.
 * Nothing in it is written to disk except through env.updateChapter and
 * env.updateProject, and nothing reaches the manuscript: "Näytä ehdotus"
 * only proposes pending suggestions.
 *
 * No DOM and no React. The text modules, the request layer, the context
 * builder and the typography checker are injected; the defaults of
 * createDefaultReviewController are required inside that function, so this
 * file's tests do not need them (test/services/reviewController.test.js).
 */

const { BUILTIN_CHECKS } = require('./reviewChecks.js');
const { runLocalCheck, clampLimit } = require('./localChecks.js');
const {
  STATUSES, createFinding, normalizeFindings, statusesFor, reanchorOne, reanchorAll, mergeRun, shiftRanges,
  applyStatus, removeByCheck, storable, capStored, filterForList, countByStatus, highlightItems, runRecord,
  normalizeRuns, describeRun, textFingerprint, modelStats, feedbackGroups
} = require('./findings.js');
const { REVIEW, planReview, runReview, renderReviewRequest, buildReviewTask, fixChanges } = require('../ai/reviewPass.js');

const NOTICES = Object.freeze({
  running: 'Edellinen tarkistus on vielä käynnissä.',
  noSelection: 'Valitse ensin tekstiä tai vaihda laajuudeksi Luku.',
  empty: 'Luvussa ei ole tekstiä.',
  'not-located': 'Ehdotusta ei voi näyttää, koska kohtaa ei löytynyt tekstistä.',
  approximate: 'Sijainti on likimääräinen, joten ehdotusta ei voi näyttää muutoksena. Tee muutos käsin.',
  'text-changed': 'Teksti on muuttunut tarkistuksen jälkeen. Aja tarkistus uudelleen.',
  protected: 'Ehdotusta ei voi näyttää muutoksena, koska se osuisi muistutukseen tai alleviivaukseen. Tee muutos käsin.',
  same: 'Ehdotus ei muuta tekstiä.',
  proposeFailed: 'Ehdotusta ei voitu avata. Kohdassa on jo käsittelemätön ehdotus tai teksti on muuttunut.'
});

const CLEAR_TEXT = Object.freeze({
  title: 'Tyhjennetäänkö havainnot?',
  message: (label) => `Tarkistuksen ”${label}” kaikki havainnot tästä luvusta poistetaan, myös käsitellyt. Poistoa ei voi kumota.`,
  confirm: 'Tyhjennä havainnot',
  cancel: 'Peruuta'
});

// The one wording of each state (format.fi.js AI_OFF_SENTENCE, contextBuilder
// MESSAGES.noAI). The injected modules give their own strings; these copies
// are for a controller that was built without them.
const AI_OFF_SENTENCE = 'Tekoäly pois -asetus on päällä.';
const NO_AI_MESSAGE = 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.';

// The line a typography question turns into a dialogue line
const DASH_LINE = /^[ \t]*(-[ \t]+)/;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const asText = (value) => (typeof value === 'string' ? value : '');
const overlaps = (a, b) => a.from < b.to && a.to > b.from;
const builtinCheck = (id) => BUILTIN_CHECKS.find(check => check.id === id);

// The chapter with an id, children included
function findChapter(project, chapterId) {
  if (!project || chapterId == null) return null;
  const walk = (list) => {
    for (const item of Array.isArray(list) ? list : []) {
      if (!isRecord(item)) continue;
      if (item.id === chapterId) return item;
      const inside = walk(item.children);
      if (inside) return inside;
    }
    return null;
  };
  return walk(project.structure);
}

// A selection as a range inside the text; null when nothing is selected
function toRange(start, end, length) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const from = Math.max(0, Math.min(Math.min(start, end), length));
  const to = Math.max(0, Math.min(Math.max(start, end), length));
  return to > from ? { from, to } : null;
}

const freshState = () => ({
  check: null,
  scope: 'chapter',
  filter: { status: 'open', onlyCheck: true },
  selectedId: null,
  selectedBy: null,
  notice: null,
  run: null
});

/**
 * @param {object} deps
 * @param {object} deps.text locateQuote, splitBlocks, proseLines, splitSentences, wordDiff, batchParagraphs
 * @param {(text: string, words: string[]) => Array<{start, end, text, term}>} deps.matchTerms
 * @param {Function} [deps.checkTypography] (text, { language, lineStartDash }) → typography findings
 * @param {Function} [deps.normaliseModelText] (modelText, originalText) → string
 * @param {Function} [deps.effectiveLineStartDash] (project) → 'list' | 'dialogue'
 * @param {{request: Function, modelFor: Function, modelLabel: Function}} deps.ai
 * @param {{build: Function, isBlocked: Function, noAIMessage: string, describeParts?: Function}|null} deps.context
 * @param {(project: object) => 'fiction'|'nonfiction'} deps.projectType
 * @param {(project: object) => string} [deps.folderName]
 * @param {(iso: string) => string} deps.formatTime
 * @param {() => Date} [deps.now]
 * @param {(prefix: string) => string} [deps.makeId]
 */
function createReviewController(deps) {
  const given = deps || {};
  const textDeps = given.text || {};
  const localDeps = {
    matchTerms: given.matchTerms,
    splitBlocks: textDeps.splitBlocks,
    splitSentences: textDeps.splitSentences,
    checkTypography: given.checkTypography
  };

  let env = null;
  let state = freshState();
  // Failed batches of the last run, by chapter and check: kept in memory only
  const details = new Map();
  // Finding id → the suggestion group "Näytä ehdotus" opened for it
  const fixes = new Map();
  // In-memory local hit id → the id it was stored under. A second decision
  // can come before the next bind, while the view still shows the hit as new.
  const storedAs = new Map();

  // version: what the editor's highlights follow. rev: every change of the
  // session, the key of the memoised view. epoch: raised by reset(), so that
  // nothing of the previous project is written into the next one.
  let version = 0;
  let rev = 0;
  let epoch = 0;
  let viewMemo = null;
  let previewMemo = null;
  let highlightKey = '';
  let reconcilePending = false;
  let boundChapterId;
  let idCounter = 0;

  const nowIso = () => (typeof given.now === 'function' ? given.now() : new Date()).toISOString();
  const memoryStamp = nowIso();
  const makeId = (prefix) => {
    if (typeof given.makeId === 'function') return given.makeId(prefix);
    idCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
  };
  const detailKey = (chapterId, checkId) => `${chapterId}\n${checkId}`;
  const notify = () => {
    if (env && typeof env.notify === 'function') env.notify();
  };
  // A change of the session; with highlights when the editor must redraw them
  const touch = (highlights = false) => {
    rev += 1;
    if (highlights) version += 1;
  };

  const latestProject = () => (env && typeof env.getProject === 'function' ? env.getProject() : null) || (env ? env.project : null);
  const editorOf = () => (env && typeof env.getEditor === 'function' ? env.getEditor() : null);
  const languageOf = (project) => (project && typeof project.language === 'string' && project.language ? project.language : 'fi');
  const folderOf = (project) => {
    if (typeof given.folderName === 'function') return given.folderName(project);
    return typeof given.projectType === 'function' && given.projectType(project) === 'nonfiction' ? 'Käsikirjoituksen kansio' : 'Tarinakansio';
  };
  const noAIMessage = () => (given.context && given.context.noAIMessage) || NO_AI_MESSAGE;
  const isBlocked = (project, chapterId, chapter) => !!(chapter && chapter.noAI === true)
    || !!(given.context && typeof given.context.isBlocked === 'function' && given.context.isBlocked(project, chapterId));
  const liveTextOf = (chapter) => {
    if (env && typeof env.liveText === 'string') return env.liveText;
    return chapter ? asText(chapter.content) : '';
  };
  const modelLabelOf = (id) => {
    if (!id) return '';
    return given.ai && typeof given.ai.modelLabel === 'function' ? given.ai.modelLabel(id) || '' : String(id);
  };

  function ensureCheck() {
    if (!state.check) {
      // The first check shown is one that works at once, without a model
      const project = env ? env.project : null;
      const hasAvoidWords = !!project && Array.isArray(project.avoidWords) && project.avoidWords.some(word => asText(word).trim() !== '');
      state.check = builtinCheck(hasAvoidWords ? 'avoid-words' : 'long-sentences');
    }
    return state.check;
  }

  const scopeOf = (check) => (check.feedback ? 'chapter' : state.scope);

  // -------------------------------------------------------------------------
  // The view
  // -------------------------------------------------------------------------

  // Everything the list can show for the open chapter: stored findings where
  // their passages are now, and the fresh hits of a local check
  function compute() {
    const project = env ? env.project : null;
    const chapterId = env ? env.activeChapterId : null;
    const chapter = findChapter(project, chapterId);
    const liveText = liveTextOf(chapter);
    const check = ensureCheck();
    const scope = scopeOf(check);
    const selection = env && env.selection ? toRange(env.selection.from, env.selection.to, liveText.length) : null;

    // Open local findings are never stored; one left in an old file is recomputed like the others
    const stored = chapter
      ? reanchorAll(liveText, normalizeFindings(chapter.findings), textDeps).findings
        .filter(finding => !(finding.kind === 'local' && finding.status === 'open'))
      : [];

    let fresh = [];
    let localMessage = null;
    if (chapter && check.kind === 'local') {
      const result = runLocalCheck(check.id, {
        text: liveText,
        range: scope === 'selection' ? selection : null,
        project,
        language: languageOf(project),
        lineStartDash: typeof given.effectiveLineStartDash === 'function' ? given.effectiveLineStartDash(project) : 'dialogue'
      }, localDeps);
      localMessage = result.message;
      // A hit the author has decided on is not listed as open again
      const decided = stored.filter(finding => finding.checkId === check.id && finding.status !== 'open' && finding.located);
      fresh = result.findings
        .filter(hit => !decided.some(old => overlaps(hit, old)))
        .map(hit => createFinding(hit, { checkId: check.id, checkLabel: check.label, kind: 'local', id: hit.id, now: memoryStamp }));
    }

    const all = stored.concat(fresh);
    const checkId = state.filter.onlyCheck ? check.id : null;
    const findings = filterForList(all, { status: state.filter.status, checkId });
    const counts = countByStatus(filterForList(all, { status: 'all', checkId }));

    let lastRun = null;
    if (check.kind !== 'local') {
      const record = chapter ? normalizeRuns(chapter.reviewRuns)[check.id] || null : null;
      const stale = !!record && !!record.fingerprint && record.fingerprint !== textFingerprint(liveText);
      const failed = (details.get(detailKey(chapterId, check.id)) || []).map((entry) => {
        const row = { index: entry.index, message: entry.message };
        if (entry.answer) row.answer = entry.answer;
        return row;
      });
      lastRun = { ...describeRun(record, { stale, formatTime: given.formatTime }), failed };
    }

    const run = state.run;
    const index = state.selectedId === null ? -1 : findings.findIndex(finding => finding.id === state.selectedId);
    const analysisModel = given.ai && typeof given.ai.modelFor === 'function' ? given.ai.modelFor('analysis') : '';

    const view = {
      chapterId: chapter ? chapterId : null,
      chapterTitle: chapter ? asText(chapter.title) : '',
      hasText: liveText.trim() !== '',
      blocked: isBlocked(project, chapterId, chapter),
      check,
      scope,
      // The reading feedback is always about the whole chapter
      scopeLocked: !!check.feedback,
      hasSelection: selection !== null,
      running: run ? {
        here: run.chapterId === chapterId,
        chapterId: run.chapterId,
        chapterTitle: run.chapterTitle,
        checkLabel: run.check.label,
        // The part being worked on
        batch: run.batches > 0 ? Math.min(run.completed + 1, run.batches) : 0,
        batches: run.batches,
        found: run.found
      } : null,
      lastRun,
      localMessage,
      findings,
      counts,
      filter: { ...state.filter },
      selectedId: state.selectedId,
      selectedBy: state.selectedBy,
      position: index === -1 ? null : { index: index + 1, total: findings.length },
      notice: state.notice,
      note: project ? asText(project.keepNote) : '',
      longSentenceWords: clampLimit(project && project.review ? project.review.longSentenceWords : undefined),
      modelName: modelLabelOf(analysisModel),
      modelStats: modelStats(project ? project.structure : []),
      feedback: check.feedback ? feedbackGroups(findings) : null
    };
    return { view, all, liveText, chapter };
  }

  function current() {
    const key = [
      env ? env.project : null,
      env ? env.activeChapterId : null,
      env ? env.liveText : null,
      env && env.selection ? env.selection.from : null,
      env && env.selection ? env.selection.to : null,
      rev
    ];
    if (!viewMemo || viewMemo.key.some((value, index) => value !== key[index])) {
      viewMemo = { key, ...compute() };
    }
    return viewMemo;
  }

  /** What the panel shows. A pure read: two calls without a change in between return the same object. */
  function view() {
    return current().view;
  }

  // -------------------------------------------------------------------------
  // Binding
  // -------------------------------------------------------------------------

  function scheduleReconcile() {
    if (reconcilePending || fixes.size === 0) return;
    reconcilePending = true;
    const at = epoch;
    // In a microtask: a status change never happens during a render
    Promise.resolve().then(() => {
      reconcilePending = false;
      if (at === epoch) reconcileFixes();
    });
  }

  /** Called on every render of the app. Writes no React state. */
  function bind(nextEnv) {
    env = nextEnv || null;
    if (!env) return;

    if (env.activeChapterId !== boundChapterId) {
      boundChapterId = env.activeChapterId;
      // A finding belongs to its chapter, and so does the selection
      if (state.selectedId !== null) {
        state.selectedId = null;
        state.selectedBy = null;
        touch(true);
      }
    }
    if (env.aiOff && state.check && state.check.kind !== 'local') {
      // Controller state only: the view() of the same render already shows it
      state.check = builtinCheck('avoid-words');
      state.selectedId = null;
      state.selectedBy = null;
      touch(true);
    }
    scheduleReconcile();
  }

  // -------------------------------------------------------------------------
  // Session commands
  // -------------------------------------------------------------------------

  function selectCheck(check) {
    if (!isRecord(check) || typeof check.id !== 'string') return;
    state.check = check;
    state.selectedId = null;
    state.selectedBy = null;
    state.notice = null;
    touch(true);
    notify();
  }

  function setScope(scope) {
    if (scope !== 'chapter' && scope !== 'selection') return;
    state.scope = scope;
    touch(true);
    notify();
  }

  function setFilter(patch) {
    const next = { ...state.filter };
    if (patch && (patch.status === 'all' || STATUSES.includes(patch.status))) next.status = patch.status;
    if (patch && typeof patch.onlyCheck === 'boolean') next.onlyCheck = patch.onlyCheck;
    state.filter = next;
    touch(true);
    notify();
  }

  /** The "Tahallista / huomioi" text: one field of the project, shared with Kielenhuolto. */
  function setNote(text) {
    if (!env || typeof env.updateProject !== 'function') return;
    const note = String(text == null ? '' : text).slice(0, REVIEW.NOTE_MAX_CHARS);
    env.updateProject(project => ({ ...project, keepNote: note }));
  }

  function setLongSentenceWords(n) {
    if (!env || typeof env.updateProject !== 'function') return;
    const limit = clampLimit(n);
    env.updateProject(project => ({ ...project, review: { ...(project ? project.review : null), longSentenceWords: limit } }));
  }

  function dismissNotice() {
    if (state.notice === null) return;
    state.notice = null;
    touch();
    notify();
  }

  // -------------------------------------------------------------------------
  // Model checks: preview, run, stop
  // -------------------------------------------------------------------------

  // The context builder bound to one chapter and one text. Without a builder
  // the plain layout is used; a protected chapter is refused either way.
  function builderFor(chapterId, text, options) {
    const { exclude, include } = options || {};
    return (task) => {
      const project = latestProject();
      if (given.context && typeof given.context.build === 'function') {
        return given.context.build({ task, project, chapterId, text, role: 'analysis', answerTokens: task.answerTokens, exclude, include });
      }
      const chapter = findChapter(project, chapterId);
      if (!chapter) return { blocked: 'no-chapter' };
      if (chapter.noAI === true) return { blocked: 'noAI' };
      return { ...renderReviewRequest(task, task.payload, languageOf(project)), parts: [], blocked: null, overBudget: false };
    };
  }

  /**
   * What a run would send, for the "Mitä malli näkee" row. Sends nothing.
   * @param {{exclude?: string[], include?: string[]}} [options] the row's choices
   * @returns {{task: object, payload: string, batches: number, blocked: string|null}|null} null for a local check
   */
  function preview(options) {
    if (!env) return null;
    const check = ensureCheck();
    if (check.kind === 'local') return null;
    const project = env.project;
    const chapterId = env.activeChapterId;
    const chapter = findChapter(project, chapterId);
    if (!chapter) return null;

    const text = liveTextOf(chapter);
    const scope = scopeOf(check);
    const note = asText(project.keepNote);
    const selection = env.selection ? toRange(env.selection.from, env.selection.to, text.length) : null;
    const key = [
      check, scope, note, text, chapterId,
      selection ? selection.from : null,
      selection ? selection.to : null,
      JSON.stringify([options && options.exclude ? options.exclude : null, options && options.include ? options.include : null])
    ];
    if (previewMemo && previewMemo.key.every((value, index) => value === key[index])) return previewMemo.value;

    let value;
    if (scope === 'selection' && !selection) {
      value = { task: buildReviewTask({ check, note }), payload: '', batches: 0, blocked: NOTICES.noSelection };
    } else {
      const plan = planReview({
        check,
        text,
        range: scope === 'selection' ? selection : null,
        note,
        build: builderFor(chapterId, text, options),
        deps: textDeps,
        noAIMessage: noAIMessage()
      });
      value = {
        task: plan.task,
        payload: plan.batches.length > 0 ? plan.batches[0].text : '',
        batches: plan.batches.length,
        blocked: plan.blocked ? plan.blocked.message : null
      };
    }
    previewMemo = { key, value };
    return value;
  }

  // The run has ended: one write to the chapter it was started in, as that chapter is then
  function finishRun(run, result) {
    // Another project was opened meanwhile: its chapters are not this run's
    if (run.epoch !== epoch) return;
    if (state.run === run) state.run = null;

    const { chapterId, check, text: runText } = run;
    const failed = Array.isArray(result.failed) ? result.failed.slice() : [];
    if (failed.length > 0) details.set(detailKey(chapterId, check.id), failed);
    else details.delete(detailKey(chapterId, check.id));

    const at = nowIso();
    const model = modelLabelOf(result.model) || null;
    // A failed or blocked run changes no findings: only its record is written
    const writesFindings = result.outcome !== 'failed' && result.outcome !== 'blocked';
    // Made here, not in the update function: that one may be called more than once
    const base = writesFindings
      ? (result.drafts || []).map(draft => createFinding(draft, {
        checkId: check.id,
        checkLabel: check.label,
        kind: check.kind === 'continuity' ? 'continuity' : 'model',
        runId: result.runId,
        model,
        logId: result.logId,
        now: at,
        id: makeId('f'),
        feedback: !!check.feedback
      }))
      : [];
    const ids = new Set(base.map(finding => finding.id));
    const wholeChapter = run.scope === 'chapter';

    if (env && typeof env.updateChapter === 'function') {
      env.updateChapter(chapterId, (chapter) => {
        if (!isRecord(chapter)) return chapter;
        const content = asText(chapter.content);
        const next = { ...chapter };
        let suppressed = 0;
        let found = 0;
        let unlocated = 0;

        if (writesFindings) {
          const existing = reanchorAll(content, normalizeFindings(chapter.findings), textDeps).findings;
          // Onto the text the chapter has now: the author may have typed during the run
          const incoming = base.map(finding => reanchorOne(content, finding, textDeps));
          // A whole chapter that was read completely replaces every open finding of the check;
          // otherwise only those in the parts that were read
          const ranges = wholeChapter && result.outcome === 'ok' ? null : shiftRanges(result.covered || [], runText, content);
          const merged = mergeRun(existing, incoming, { checkId: check.id, ranges });
          next.findings = storable(merged.findings);
          suppressed = merged.suppressed;
          const kept = merged.findings.filter(finding => ids.has(finding.id));
          found = kept.length;
          unlocated = kept.filter(finding => !finding.located).length;
        }

        next.reviewRuns = {
          ...normalizeRuns(chapter.reviewRuns),
          [check.id]: runRecord(result, {
            at,
            scope: wholeChapter ? 'chapter' : 'selection',
            suppressed,
            found,
            unlocated,
            model,
            fingerprint: textFingerprint(runText)
          })
        };
        return next;
      });
    }
    touch(true);
    notify();
  }

  /**
   * Start the selected model or continuity check on the open chapter.
   * @param {{exclude?: string[], include?: string[]}} [options] from the "Mitä malli näkee" row
   * @returns {boolean} true when a run was started
   */
  function run(options) {
    if (!env) return false;
    const check = ensureCheck();
    if (check.kind === 'local') return false;

    const refuse = (notice) => {
      state.notice = notice;
      touch();
      notify();
      return false;
    };
    if (state.run) return refuse(NOTICES.running);
    if (env.aiOff) return refuse(AI_OFF_SENTENCE);

    const project = latestProject();
    const chapterId = env.activeChapterId;
    const chapter = findChapter(project, chapterId);
    if (!chapter) return false;
    if (isBlocked(project, chapterId, chapter)) return refuse(noAIMessage());

    const text = liveTextOf(chapter);
    if (text.trim() === '') return refuse(NOTICES.empty);

    const scope = scopeOf(check);
    let range = null;
    if (scope === 'selection') {
      // Read now, not from an earlier render: the selection may have moved since
      const editor = editorOf();
      range = editor ? toRange(editor.selectionStart, editor.selectionEnd, text.length) : null;
      if (!range) return refuse(NOTICES.noSelection);
    }

    const active = {
      epoch,
      chapterId,
      chapterTitle: asText(chapter.title),
      check,
      scope,
      text,
      completed: 0,
      batches: 0,
      found: 0,
      handle: null
    };
    state.run = active;
    state.notice = null;
    touch();

    active.handle = runReview({
      check,
      text,
      range,
      note: asText(project.keepNote),
      folderName: folderOf(project),
      build: builderFor(chapterId, text, options),
      request: (request) => given.ai.request({ role: 'analysis', ...request }),
      meta: { chapterId },
      deps: textDeps,
      makeId: () => makeId('r'),
      describeParts: given.context && typeof given.context.describeParts === 'function' ? given.context.describeParts : undefined,
      noAIMessage: noAIMessage(),
      onProgress: (progress) => {
        if (state.run !== active) return;
        active.completed = progress.batch;
        active.batches = progress.batches;
        active.found = progress.found;
        touch();
        notify();
      }
    });
    active.handle.done.then(result => finishRun(active, result));
    notify();
    return true;
  }

  /** Cancel the running check. Findings of finished batches are kept. */
  function stop() {
    if (state.run && state.run.handle) state.run.handle.cancel();
  }

  // -------------------------------------------------------------------------
  // Findings: status, selection, fix
  // -------------------------------------------------------------------------

  const findById = (id) => current().all.find(finding => finding.id === id) || null;

  /**
   * Give a finding another status. A local hit that exists only in memory is
   * stored when the author decides on it, and removed again when a stored one
   * is set back to Avoin.
   * @returns {boolean} true when something was written
   */
  function setStatus(id, status) {
    if (!env || typeof env.updateChapter !== 'function') return false;
    const { chapter } = current();
    const finding = findById(id);
    if (!chapter || !finding || !statusesFor(finding).includes(status) || finding.status === status) return false;

    const chapterId = chapter.id;
    const at = nowIso();
    const isStored = normalizeFindings(chapter.findings).some(entry => entry.id === id);

    if (isStored) {
      env.updateChapter(chapterId, (ch) => {
        if (!isRecord(ch)) return ch;
        const list = reanchorAll(asText(ch.content), normalizeFindings(ch.findings), textDeps).findings;
        return { ...ch, findings: storable(applyStatus(list, id, status, at)) };
      });
    } else {
      // The id of a fresh hit is its position; a stored finding needs one that stays
      const storedId = storedAs.get(id) || makeId('f');
      storedAs.set(id, storedId);
      const decided = { ...finding, id: storedId, status, statusAt: at, createdAt: at };
      env.updateChapter(chapterId, (ch) => {
        if (!isRecord(ch)) return ch;
        const list = reanchorAll(asText(ch.content), normalizeFindings(ch.findings), textDeps).findings;
        // Already stored by an earlier click: one finding, the last status
        if (list.some(entry => entry.id === storedId)) return { ...ch, findings: storable(applyStatus(list, storedId, status, at)) };
        return { ...ch, findings: storable(capStored(list.concat([decided]))) };
      });
      if (state.selectedId === id) state.selectedId = storedId;
      if (fixes.has(id)) {
        fixes.set(storedId, fixes.get(id));
        fixes.delete(id);
      }
    }
    touch(true);
    notify();
    return true;
  }

  /** From the list: select the finding and show its passage in the editor. */
  function select(id) {
    state.selectedId = id;
    state.selectedBy = 'list';
    touch(true);

    const finding = findById(id);
    const editor = editorOf();
    if (finding && finding.located && editor) {
      // The caret is placed and nothing is selected, so a key press cannot replace the passage
      if (typeof editor.setSelectionRange === 'function') editor.setSelectionRange(finding.from, finding.from);
      if (typeof editor.scrollToPos === 'function') editor.scrollToPos(finding.from);
      if (typeof editor.focus === 'function') editor.focus();
    }
    notify();
  }

  /** From the editor: the author clicked a highlighted passage. The text is not scrolled. */
  function onFindingClick(id) {
    state.selectedId = id;
    state.selectedBy = 'editor';
    touch(true);
    notify();
  }

  /** The next (1, 'next') or previous (-1, 'previous') finding of the list that has a place, wrapping. */
  function step(direction) {
    const back = direction === 'previous' || direction === 'prev' || (typeof direction === 'number' && direction < 0);
    const located = view().findings.filter(finding => finding.located);
    if (located.length === 0) return;
    const at = located.findIndex(finding => finding.id === state.selectedId);
    let next;
    if (at === -1) next = back ? located.length - 1 : 0;
    else next = (at + (back ? -1 : 1) + located.length) % located.length;
    select(located[next].id);
  }

  // The change of a typography question, taken from the line as it is now:
  // the stored one was computed when the hit was found
  function dashChange(finding, text) {
    const convert = finding.data && finding.data.convert;
    if (!isRecord(convert) || typeof convert.insert !== 'string') return null;
    const match = DASH_LINE.exec(text.slice(finding.from, finding.to));
    if (!match) return null;
    const to = finding.from + match[0].length;
    const from = to - match[1].length;
    return { from, to, insert: convert.insert, original: text.slice(from, to) };
  }

  /**
   * "Näytä ehdotus". Nothing is written to the text here: the change becomes
   * pending suggestions that the author accepts or rejects.
   * @returns {boolean} true when suggestions were opened
   */
  function showFix(id) {
    if (!env || typeof env.propose !== 'function') return false;
    const { chapter, liveText } = current();
    const finding = findById(id);
    if (!chapter || !finding) return false;

    const refuse = (notice) => {
      if (notice) {
        state.notice = notice;
        touch();
        notify();
      }
      return false;
    };

    let changes;
    let meta;
    if (finding.kind === 'local') {
      if (!(finding.data && finding.data.convert)) return false;
      if (!finding.located) return refuse(NOTICES['not-located']);
      const change = dashChange(finding, liveText);
      if (!change) return refuse(NOTICES['text-changed']);
      changes = [change];
      meta = { source: 'local', action: 'typography', actionLabel: '', instruction: '', provider: null, model: null, requestLogId: null };
    } else {
      const fix = fixChanges(liveText, finding, { wordDiff: textDeps.wordDiff, normaliseModelText: given.normaliseModelText });
      if (!fix.ok) return refuse(NOTICES[fix.reason] || null);
      changes = fix.changes;
      meta = {
        source: 'faust',
        action: 'review-fix',
        actionLabel: `Tarkistus: ${finding.checkLabel}`,
        instruction: '',
        provider: null,
        model: finding.model,
        requestLogId: finding.logId
      };
    }

    // The changes are offsets of liveText, and that is said in the same call
    const result = env.propose(chapter.id, changes, { baseText: liveText, meta });
    if (!result || !result.ok || !Array.isArray(result.ids) || result.ids.length === 0) return refuse(NOTICES.proposeFailed);

    fixes.set(id, { chapterId: chapter.id, groupId: result.groupId, count: result.ids.length, auto: false });
    select(id);
    return true;
  }

  /**
   * Keep a finding's status in step with what happened to its suggestion:
   * accepted → Tehty, the acceptance undone → Avoin again. Reads the
   * suggestion snapshot of the open chapter's editor; no hook is needed.
   */
  function reconcileFixes() {
    if (!env || fixes.size === 0) return;
    const editor = editorOf();
    if (!editor || typeof editor.getSuggestions !== 'function') return;
    const snapshot = editor.getSuggestions() || {};
    const inGroup = (list, groupId) => (Array.isArray(list) ? list : []).filter(item => item && item.groupId === groupId).length;

    for (const [id, entry] of Array.from(fixes.entries())) {
      if (entry.chapterId !== env.activeChapterId) continue;
      const pending = inGroup(snapshot.pending, entry.groupId);
      const rejected = inGroup(snapshot.rejected, entry.groupId);
      const accepted = entry.count - pending - rejected;
      const finding = findById(id);

      if (pending === 0 && accepted <= 0) {
        // Rejected: the finding stays open
        fixes.delete(id);
      } else if (!finding) {
        // The passage is no longer a finding (a typography question that was fixed)
        if (pending === 0) fixes.delete(id);
      } else if (pending === 0 && !entry.auto && finding.status === 'open') {
        entry.auto = true;
        setStatus(id, 'done');
      } else if (pending > 0 && entry.auto && finding.status === 'done') {
        // The acceptance was undone and the suggestion came back
        entry.auto = false;
        setStatus(id, 'open');
      }
    }
  }

  /** Remove every finding of the selected check from the open chapter, after asking. */
  function clearCheck() {
    if (!env || typeof env.updateChapter !== 'function' || typeof env.askConfirm !== 'function') return Promise.resolve(false);
    const check = ensureCheck();
    const chapterId = env.activeChapterId;
    if (!findChapter(env.project, chapterId)) return Promise.resolve(false);

    const at = epoch;
    return Promise.resolve(env.askConfirm(CLEAR_TEXT.title, CLEAR_TEXT.message(check.label), CLEAR_TEXT.confirm, CLEAR_TEXT.cancel))
      .then((answer) => {
        if (!answer || at !== epoch || !env) return false;
        env.updateChapter(chapterId, (chapter) => {
          if (!isRecord(chapter)) return chapter;
          const runs = { ...normalizeRuns(chapter.reviewRuns) };
          delete runs[check.id];
          return { ...chapter, findings: storable(removeByCheck(normalizeFindings(chapter.findings), check.id)), reviewRuns: runs };
        });
        details.delete(detailKey(chapterId, check.id));
        state.selectedId = null;
        state.selectedBy = null;
        touch(true);
        notify();
        return true;
      });
  }

  /**
   * The editor's highlight prop: open findings of the list that have a
   * place. null while the tab is not on screen, so the text is clean when
   * the author goes back to writing.
   * @returns {{version: number, items: Array<{id, from, to}>, activeId: string|null}|null}
   */
  function highlightProps() {
    if (!env || !env.visible) return null;
    const { view: shown, liveText } = current();
    const items = highlightItems(shown.findings, liveText.length);
    // Typing moves the marks inside the editor. A new set is needed only when
    // the findings themselves change: one lost its place, or a new hit appeared.
    const key = items.map(item => item.id).join('\n');
    if (key !== highlightKey) {
      highlightKey = key;
      version += 1;
    }
    return { version, items, activeId: state.selectedId };
  }

  /** Another project opens: cancel the run and forget the session. */
  function reset() {
    if (state.run && state.run.handle) state.run.handle.cancel();
    epoch += 1;
    state = freshState();
    details.clear();
    fixes.clear();
    storedAs.clear();
    viewMemo = null;
    previewMemo = null;
    highlightKey = '';
    boundChapterId = undefined;
    touch(true);
    notify();
  }

  return {
    bind,
    view,
    selectCheck,
    setScope,
    setFilter,
    setNote,
    setLongSentenceWords,
    run,
    preview,
    stop,
    setStatus,
    select,
    onFindingClick,
    step,
    showFix,
    reconcileFixes,
    clearCheck,
    dismissNotice,
    highlightProps,
    reset
  };
}

/**
 * The app's controller over the real modules. They are required here, not at
 * module load, so that this file's tests run without the other features' code.
 */
function createDefaultReviewController() {
  const { locateQuote } = require('../../editor/locateQuote.js');
  const { splitBlocks, proseLines } = require('../../editor/blocks.js');
  const { splitSentences } = require('../../editor/sentences.js');
  const { wordDiff } = require('../../editor/wordDiff.js');
  const { batchParagraphs } = require('../ai/batchParagraphs.js');
  const { compileTerms, findTermMatches, todoRanges } = require('../../editor/termMatch.js');
  const { checkTypography, normaliseModelText, effectiveLineStartDash } = require('../../editor/typography.fi.js');
  const { getAIClient } = require('../ai/aiClient.js');
  const { fiDateTime, modelLabel } = require('../format.fi.js');
  const { getContextSession } = require('../ai/contextSession.js');
  const { isChapterBlocked, describeParts, MESSAGES } = require('../ai/contextBuilder.js');
  const { projectKind, folderName } = require('../story/codex.js');

  // The avoid list is compiled once per list, not once per key press. The
  // caller hands over a new array each time, so the key is the words.
  let compiledFor = null;
  let compiled = null;
  const matchTerms = (text, words) => {
    const key = (Array.isArray(words) ? words : []).map(String).join('\n');
    if (compiled === null || key !== compiledFor) {
      compiledFor = key;
      compiled = compileTerms(words);
    }
    // The same call as the editor's highlight: notes are skipped
    return findTermMatches(text, compiled, { skip: todoRanges(text) }).map(match => ({
      start: match.start,
      end: match.end,
      text: match.text,
      term: compiled.terms[match.term] ? compiled.terms[match.term].text : match.text
    }));
  };

  return createReviewController({
    text: { locateQuote, splitBlocks, proseLines, splitSentences, wordDiff, batchParagraphs },
    matchTerms,
    checkTypography,
    normaliseModelText,
    effectiveLineStartDash,
    // The client is asked for at each use: it is created on its first call
    ai: {
      request: (options) => getAIClient().request(options),
      modelFor: (role) => getAIClient().modelFor(role),
      modelLabel
    },
    context: {
      build: (args) => getContextSession().build(args),
      isBlocked: isChapterBlocked,
      noAIMessage: MESSAGES.noAI,
      describeParts
    },
    projectType: projectKind,
    folderName,
    formatTime: fiDateTime
  });
}

module.exports = { createReviewController, createDefaultReviewController };

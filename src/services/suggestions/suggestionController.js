/**
 * Suggestion controller
 *
 * The one object the app talks to about suggestions. It keeps the suggestions
 * of chapters that are not open (in memory only: nothing here is ever written
 * to the project, to localStorage or to disk), counts what is pending, builds
 * the fields of the usage-log rows, hooks into undo and redo, and runs the
 * "Liitä muokkauksina" flow.
 *
 * No DOM and no React: the editor facade, the React setters and the IPC calls
 * arrive through bind(env), the diff functions through the factory. So Jest
 * drives it with fakes (test/services/suggestionController.test.js) and with a
 * real editor (test/services/suggestionController.view.test.js).
 */

const model = require('../../editor/suggestionModel.js');
const { preparePasteEdits, PROTECTED_PATTERN } = require('../../editor/pasteEdits.js');

const TEXT = {
  snapshotReason: 'Ennen Hyväksy kaikki -toimintoa',
  // The title and the buttons name the suggestions while there is one; a draft alone is named itself, as the message
  // names it (final-pass review: no question about suggestions when only Tekoälyn luonnos waits)
  discardWords: (counts) => {
    if (counts.suggestions > 0) return { title: 'Hylätäänkö käsittelemättömät ehdotukset?', confirm: 'Hylkää ehdotukset', cancel: 'Palaa ehdotuksiin' };
    return counts.blocks === 1
      ? { title: 'Hylätäänkö tekoälyn luonnos?', confirm: 'Hylkää luonnos', cancel: 'Palaa luonnokseen' }
      : { title: 'Hylätäänkö tekoälyn luonnokset?', confirm: 'Hylkää luonnokset', cancel: 'Palaa luonnoksiin' };
  },
  // The suggestions by their count and a pending draft by the name of its head (Tekoälyn luonnos), apart:
  // the bar counts suggestions only, so the questions name the draft on its own (lead decision, final pass)
  discard: (counts) => {
    const one = counts.suggestions + counts.blocks === 1;
    return `Käsikirjoituksessa on ${pendingWords(counts)}. ${one ? 'Se ei säily' : 'Ne eivät säily'}, kun projekti vaihtuu. ` +
      `Käsikirjoituksen tekstiä ${one ? 'se ei ole muuttanut' : 'ne eivät ole muuttaneet'}.`;
  },
  pasteLabel: 'Liitä muokkauksina',
  // The stop note of the insert block (contracts 8.6), also when leaving the chapter stops it
  stoppedNote: 'Pysäytetty. Teksti on leikattu viimeiseen kokonaiseen virkkeeseen.'
};

/**
 * What is pending, in the one wording (contracts 8.1): `9 käsittelemätöntä ehdotusta ja tekoälyn luonnos`,
 * `1 käsittelemätön ehdotus`, `käsittelemätön tekoälyn luonnos`. format.fi.js owns it (the import's Korvaa guard
 * says the same); it is taken when needed (contract 0.7).
 */
const pendingWords = (counts) => require('../format.fi.js').pendingWords(counts);

const PASTE_SOURCES = ['editor', 'external-ai'];
const PASTE_SOURCE_KEY = 'suggestions.pasteSource';

// The editor shows \n only; chapter text from an import may still hold \r\n
const normalizeNewlines = (text) => String(text == null ? '' : text).replace(/\r\n?/g, '\n');

/**
 * The notes and underline tags that the edges of a target cut in two, as the
 * parts inside the target (offsets in the target's text). Inside the target
 * alone they do not look like notes any more.
 */
function cutProtectedSpans(docText, from, to) {
  if (typeof docText !== 'string') return [];
  const spans = [];
  for (const match of docText.matchAll(PROTECTED_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    const cut = (start < from && end > from) || (start < to && end > to);
    const inside = { from: Math.max(start, from) - from, to: Math.min(end, to) - from };
    if (cut && inside.to > inside.from) spans.push(inside);
  }
  return spans;
}

const failed = (error, skipped = []) => ({ ok: false, groupId: null, ids: [], skipped, error });

/**
 * @param {{ wordDiff: (original: string, revised: string) => Array, rawDiff?: (a: string, b: string) => Array,
 *           changeRatio: (original: string, revised: string) => number, stopText?: (text: string) => string }} deps
 *   wordDiff and changeRatio serve "Liitä muokkauksina"; rawDiff is the finest
 *   word diff, used to keep suggestions through text changes (without it they
 *   are dropped wherever the text changed around them). stopText is what a
 *   draft that was still being written keeps when its chapter is left (default:
 *   its last full sentence in the manuscript's typography, as a stop in the editor).
 */
function createSuggestionController(deps = {}) {
  const rawDiff = typeof deps.rawDiff === 'function' ? deps.rawDiff : undefined;

  // The same cut as a stop in the editor (quickEdit.js, write flow step 5a). Taken when needed (contract 0.7).
  function stopText(text) {
    if (typeof deps.stopText === 'function') return String(deps.stopText(text) || '');
    const { trimToSentence } = require('../../editor/sentences.js');
    const { normaliseModelText } = require('../../editor/typography.fi.js');
    const kept = trimToSentence(String(text == null ? '' : text));
    return kept.trim() ? normaliseModelText(kept) : '';
  }

  let env = {};
  // Raised by reset(): editors that were created before it belong to the previous project
  let epoch = 0;
  const records = new Map();      // chapterId → { docText, state } for chapters that are not mounted
  const reveal = new Map();       // chapterId → position to show when the chapter mounts
  const closed = new Set();       // chapters whose bar was closed while nothing was pending
  let propsCache = new Map();     // chapterId → the two functions handed to the editor
  let live = null;                // { chapterId, snapshot } of the mounted editor
  let paste = null;               // the prepared "Liitä muokkauksina" request waiting for its dialog
                                  // ({ dropped: true } once its editor went: the dialog is still open)
  let bulkSnapshotId = null;      // snapshot taken for the bulk accept that is running
  const blockHandlers = new Set();
  // blockId → index of the attempt that was still being written when its chapter was left: its
  // request row exists only when the cancelled request ends, after the editor went (linkStoredBlock)
  const awaitingLog = new Map();
  let lastInfo = null;
  let lastCounts = '0/0';         // suggestions/drafts last reported; the main process starts from zero as well

  // --- Small readers ---------------------------------------------------------

  const call = (name, ...args) => (typeof env[name] === 'function' ? env[name](...args) : undefined);

  function chapterList() {
    const out = [];
    const walk = (list) => {
      for (const chapter of Array.isArray(list) ? list : []) {
        if (!chapter) continue;
        out.push(chapter);
        walk(chapter.children);
      }
    };
    walk(env.chapters);
    return out;
  }

  const chapterOf = (chapterId) => chapterList().find(chapter => chapter.id === chapterId) || null;
  const titleOf = (chapterId) => {
    const chapter = chapterOf(chapterId);
    return chapter && chapter.title != null ? String(chapter.title) : '';
  };

  // The text of the open editor, through the facade's existing members
  function documentText(editor) {
    if (typeof editor.value === 'string') return editor.value;
    const view = editor.faustView;
    return view && view.state && view.state.doc ? view.state.doc.toString() : null;
  }

  function facade() {
    const editor = typeof env.getEditor === 'function' ? env.getEditor() : null;
    return editor && typeof editor.getSuggestions === 'function' ? editor : null;
  }

  // The chapter the mounted editor shows. activeChapterId is the value of the
  // last render on purpose: in the tick where undo switches chapters, the
  // editor on screen still belongs to the old one.
  const openEditor = (chapterId) => (chapterId != null && chapterId === env.activeChapterId ? facade() : null);

  // Suggestions and the draft are counted apart (lead decision, final pass): the bar counts suggestions,
  // and the close guard and the project-switch question name a pending draft on its own. A draft is
  // pending also while it is still being written, so neither question lets it go without a word (I-09 step 6).
  const countsOf = (shot) => ({
    suggestions: shot.pending.length,
    blocks: shot.block && shot.block.state === 'pending' ? 1 : 0
  });

  const tracks = (state) => !!state && (state.items.length > 0 || !!state.block);

  // What goes into the store: the state as the author left it (view mode and an
  // open notice included), without what dies with the editor (captured ranges)
  const stored = (state) => ({ ...state, ranges: [], event: null });

  function keepRecord(chapterId, docText, state) {
    if (tracks(state)) records.set(chapterId, { docText, state: stored(state) });
    else records.delete(chapterId);
  }

  // --- Counting and the bar ----------------------------------------------------

  /** Per chapter: count = pending suggestions, blocks = a pending draft (0 or 1). Chapters with neither are left out. */
  function pendingByChapter() {
    const counts = new Map();
    if (live && live.snapshot) counts.set(live.chapterId, countsOf(live.snapshot));
    for (const [chapterId, record] of records) {
      if (!counts.has(chapterId)) counts.set(chapterId, countsOf(model.snapshot(record.state)));
    }

    const order = chapterList().map(chapter => chapter.id);
    const place = (chapterId) => {
      const index = order.indexOf(chapterId);
      return index === -1 ? order.length : index;
    };
    return Array.from(counts, ([chapterId, { suggestions, blocks }]) => ({ chapterId, count: suggestions, blocks }))
      .filter(entry => entry.count + entry.blocks > 0)
      .sort((a, b) => place(a.chapterId) - place(b.chapterId));
  }

  /** The project's pending suggestions and drafts, apart: { suggestions, blocks }. */
  const pendingCounts = () => pendingByChapter().reduce(
    (sum, entry) => ({ suggestions: sum.suggestions + entry.count, blocks: sum.blocks + entry.blocks }),
    { suggestions: 0, blocks: 0 }
  );

  // Everything that would be lost: the import's Korvaa waits while anything is pending
  const pendingTotal = () => {
    const counts = pendingCounts();
    return counts.suggestions + counts.blocks;
  };

  function barInfo() {
    const chapterId = env.activeChapterId == null ? null : env.activeChapterId;
    let shot = null;
    if (live && live.chapterId === chapterId) shot = live.snapshot;
    else if (records.has(chapterId)) shot = model.snapshot(records.get(chapterId).state);

    const current = shot && shot.currentIndex >= 0 ? shot.pending[shot.currentIndex] : null;
    const draft = shot && shot.block && shot.block.state === 'pending' ? shot.block : null;
    return {
      chapterId,
      pending: shot ? shot.pending.length : 0,
      rejected: shot ? shot.rejected.length + (shot.block && shot.block.state === 'rejected' ? 1 : 0) : 0,
      currentIndex: shot ? shot.currentIndex : -1,
      viewMode: shot ? shot.viewMode : 'changes',
      notice: shot ? shot.notice : null,
      blockStatus: draft ? draft.status : null,
      // The finished draft is the current item of the review order: the bar names it (Tekoälyn luonnos)
      blockCurrent: !!draft && shot.currentId === draft.id,
      // A bulk accept leaves these; the bar says so
      dialoguePending: shot ? shot.pending.filter(item => item.meta && item.meta.dialogue === true).length : 0,
      elsewhere: pendingByChapter()
        .filter(entry => entry.chapterId !== chapterId)
        .map(entry => ({ chapterId: entry.chapterId, title: titleOf(entry.chapterId), count: entry.count, blocks: entry.blocks })),
      closed: closed.has(chapterId),
      current: current ? { id: current.id, original: current.original, insert: current.insert, meta: current.meta } : null
    };
  }

  // Tell React and the main process, but only when something they show changed:
  // this runs inside editor updates, also for every moved caret
  function publish() {
    const info = barInfo();
    const key = JSON.stringify(info);
    if (key !== lastInfo) {
      lastInfo = key;
      call('setInfo', info);
    }
    const counts = pendingCounts();
    const reported = `${counts.suggestions}/${counts.blocks}`;
    if (reported !== lastCounts) {
      lastCounts = reported;
      call('reportPending', counts);
    }
  }

  // --- Usage log ---------------------------------------------------------------

  // One row per group per decision. Deterministic tools (source 'local') and
  // suggestions without meta are never logged.
  function logDecisions(decision, items, chapterId, extra = {}) {
    if (typeof env.logDecision !== 'function' || !Array.isArray(items)) return;

    const groups = new Map();
    for (const item of items) {
      const meta = item && item.meta;
      if (!meta || meta.source === 'local') continue;
      const key = `${item.groupId}\u0000${meta.source}`;
      if (!groups.has(key)) groups.set(key, { meta, items: [] });
      groups.get(key).items.push(item);
    }

    for (const group of groups.values()) {
      const { meta } = group;
      const single = group.items.length === 1;
      // The size of what was decided, also for a rejection: the export prints it on every row
      const sum = (pick) => group.items.reduce((total, item) => total + String(pick(item) || '').length, 0);

      env.logDecision({
        decision,
        redo: !!extra.redo,
        scope: single ? 'single' : 'group',
        source: meta.source,
        action: meta.action || '',
        actionLabel: meta.actionLabel || '',
        instruction: meta.instruction || '',
        provider: meta.provider == null ? null : meta.provider,
        model: meta.model == null ? null : meta.model,
        requestLogId: meta.requestLogId == null ? null : meta.requestLogId,
        chapterId,
        chapterTitle: titleOf(chapterId),
        count: group.items.length,
        charsAdded: sum(item => item.insert),
        charsRemoved: sum(item => item.original),
        before: single ? String(group.items[0].original || '') : null,
        after: single ? String(group.items[0].insert || '') : null,
        snapshotId: extra.snapshotId == null ? null : extra.snapshotId
      });
    }
  }

  // Every handler gets the action, whatever an earlier one did; the first error is passed on
  function runBlockHandlers(action, block, chapterId) {
    let failure = null;
    for (const handler of Array.from(blockHandlers)) {
      try {
        handler(action, block, chapterId);
      } catch (error) {
        if (!failure) failure = { error };
      }
    }
    if (failure) throw failure.error;
  }

  // --- The editor's two props --------------------------------------------------

  function storeUnmounted(chapterId, event) {
    let state = event.state;
    // Leaving the chapter stops a block that was still being written, as Pysäytä does: it keeps its text
    // up to the last full sentence with the stop note, and an attempt without one is dropped (the block
    // too, when it was the only attempt). The request itself is cancelled by its owner (quickEdit).
    const block = state && state.block;
    const shown = block && block.attempts[block.attempt];
    if (block && block.state === 'pending' && shown && shown.status === 'streaming') {
      const kept = stopText(shown.text);
      state = model.reduce(state, {
        type: 'blockFinish', id: block.id, status: 'stopped', text: kept, note: kept ? TEXT.stoppedNote : null
      });
      const left = state.block && state.block.id === block.id ? state.block : null;
      if (left && left.attempts.length === block.attempts.length) awaitingLog.set(block.id, block.attempt);
    }
    // A chapter that was deleted takes its suggestions with it
    if (Array.isArray(env.chapters) && !chapterOf(chapterId)) state = null;
    keepRecord(chapterId, normalizeNewlines(event.docText), state);
  }

  function makeProps(chapterId, madeIn) {
    return {
      // Called once when the editor mounts, with its text
      suggestionSeed(docText) {
        if (madeIn !== epoch) return { state: null, revealPos: null };

        const text = normalizeNewlines(docText);
        const record = records.get(chapterId);
        let state = null;
        if (record) {
          // Pending suggestions come back only where the text still matches
          state = record.docText === text
            ? record.state
            : model.reduce(record.state, { type: 'rebase', oldText: record.docText, newText: text, diff: rawDiff });
          records.delete(chapterId);
        }
        live = { chapterId, snapshot: model.snapshot(state || model.createState()) };

        const revealPos = reveal.has(chapterId) ? reveal.get(chapterId) : null;
        reveal.delete(chapterId);
        return { state, revealPos };
      },

      onSuggestionsChange(snapshot, event) {
        // An editor of the previous project: its late events must not bring anything back
        if (madeIn !== epoch || !event) return;

        if (event.type === 'unmount') {
          storeUnmounted(chapterId, event);
          if (live && live.chapterId === chapterId) live = null;
          // The target of a paste that was waiting for its dialog went with the editor (a chapter switch or
          // Korttinäkymä under the open dialog); its answer is told so instead of doing nothing
          if (paste && paste.chapterId === chapterId) paste = { dropped: true, chapterId };
          publish();
          return;
        }

        if (snapshot) live = { chapterId, snapshot };
        // The bar and the pending count follow the editor even when a log
        // writer or a block handler throws
        try {
          switch (event.type) {
            case 'accepted':
              logDecisions('accepted', event.items, chapterId, { snapshotId: bulkSnapshotId });
              break;
            case 'rejected':
              logDecisions('rejected', event.items, chapterId);
              break;
            case 'block-action':
              runBlockHandlers(event.action, snapshot ? snapshot.block : null, chapterId);
              break;
            case 'proposed':
            case 'restored':
              // New suggestions bring the bar back, and so do restored ones: the done state leaves by
              // itself after a while (SuggestionBar), and the next round of decisions ends with it again
              closed.delete(chapterId);
              break;
            default:
              break;
          }
        } finally {
          publish();
        }
      }
    };
  }

  // --- Undo and redo -----------------------------------------------------------

  const acceptedIn = (step) => {
    const suggestions = step && step.meta && step.meta.suggestions;
    return suggestions && Array.isArray(suggestions.ids) && Array.isArray(suggestions.items) ? suggestions : null;
  };

  function changeRecord(chapterId, text, change) {
    const record = records.get(chapterId);
    let state = record ? record.state : model.createState();
    if (record && typeof text === 'string' && record.docText !== text) {
      state = model.reduce(state, { type: 'rebase', oldText: record.docText, newText: text, diff: rawDiff });
    }
    state = change(state);
    keepRecord(chapterId, typeof text === 'string' ? text : (record ? record.docText : ''), state);
    return state;
  }

  // Where a change ends in `shown` (the text after the undo or redo), given where it starts: the
  // common tail of the two texts is not part of it
  function changeEnd(shown, other, start) {
    let tail = 0;
    const room = Math.min(shown.length, other.length) - start;
    while (tail < room && shown.charCodeAt(shown.length - 1 - tail) === other.charCodeAt(other.length - 1 - tail)) tail += 1;
    return Math.max(start, shown.length - tail);
  }

  // What an undo or a redo means for the suggestions (afterHistory publishes)
  function afterHistoryChanges(direction, step, hasText, accepted) {
    if (direction === 'undo' && accepted && hasText) {
      // The stored items are valid for oldContent, which is the chapter's text after the undo
      const text = normalizeNewlines(step.oldContent);
      const editor = openEditor(step.chapterId);
      if (editor) {
        editor.proposeChanges(accepted.items, { restore: true, whenText: text });
      } else {
        // The chapter mounts in the coming render; its seed returns them
        changeRecord(step.chapterId, text, state => model.reduce(state, {
          type: 'propose', docText: text, changes: accepted.items, restore: true
        }));
        closed.delete(step.chapterId);
      }
    }

    // Show where the text changed
    if (hasText) {
      const before = normalizeNewlines(step.oldContent);
      const after = normalizeNewlines(step.newContent);
      let pos = model.firstDifference(before, after);
      // A smart-typing step (" → ”, -- → –, stage I-06) leaves the caret behind the marks it touched, where
      // the author was typing: an undo gives back "--" with the caret after it, so typing goes on there
      if (pos >= 0 && step.meta && step.meta.source === 'smart-typing') {
        pos = changeEnd(direction === 'undo' ? before : after, direction === 'undo' ? after : before, pos);
      }
      if (pos >= 0) {
        const editor = openEditor(step.chapterId);
        if (editor) editor.revealPos(pos);
        else reveal.set(step.chapterId, pos);
      }
    }

    // Last, so that a failing log writer cannot keep the suggestions or the caret away
    if (direction === 'undo' && accepted && hasText) logDecisions('accept_undone', accepted.items, step.chapterId);
  }

  const controller = {
    /**
     * Called on every render with the current surroundings:
     * { getEditor, activeChapterId, chapters, setInfo, reportPending, logDecision, askConfirm,
     *   openPasteDialog, getSetting?, setSetting?, takeSnapshot? }
     * reportPending({ suggestions, blocks }) is called when either count changes (the close guard).
     */
    bind(nextEnv) {
      env = nextEnv || {};
      if (!Array.isArray(env.chapters)) return;

      const known = new Set(chapterList().map(chapter => chapter.id));
      let forgot = false;
      for (const chapterId of Array.from(records.keys())) {
        if (!known.has(chapterId)) {
          records.delete(chapterId);
          forgot = true;
        }
      }
      for (const chapterId of Array.from(reveal.keys())) if (!known.has(chapterId)) reveal.delete(chapterId);
      for (const chapterId of Array.from(closed)) if (!known.has(chapterId)) closed.delete(chapterId);
      // The total went down without any editor event: say so
      if (forgot) publish();
    },

    /** The same two functions for the same chapter, as long as the project stays the same. */
    editorProps(chapterId) {
      let props = propsCache.get(chapterId);
      if (!props) {
        props = makeProps(chapterId, epoch);
        propsCache.set(chapterId, props);
      }
      return props;
    },

    // --- Bar and menu commands: each acts on the open editor, or does nothing ---

    acceptCurrent() {
      const editor = facade();
      return editor ? editor.acceptSuggestion() : false;
    },

    rejectCurrent() {
      const editor = facade();
      return editor ? editor.rejectSuggestion() : false;
    },

    /**
     * Accept every pending suggestion of the open chapter, or of one group.
     * Suggestions on dialogue lines stay pending (the facade's acceptGroup
     * leaves them): they are accepted one at a time. Every bulk accept of
     * every feature comes through here, so the snapshot and the log row are
     * the same everywhere.
     * @returns {number} how many were accepted
     */
    acceptAll(options = {}) {
      const editor = facade();
      if (!editor) return 0;

      const groupId = options.groupId == null ? null : options.groupId;
      const taking = model.bulkAcceptIds({ items: editor.getSuggestions().pending }, groupId).length;
      if (!taking) return 0;

      bulkSnapshotId = null;
      if (taking > 1 && typeof env.takeSnapshot === 'function') {
        bulkSnapshotId = env.takeSnapshot(env.activeChapterId, options.reason || TEXT.snapshotReason) || null;
      }
      try {
        return editor.acceptGroup(groupId == null ? undefined : groupId);
      } finally {
        bulkSnapshotId = null;
      }
    },

    /** Reject every pending suggestion of the open chapter, or of one group; dialogue ones too. */
    rejectAll(options = {}) {
      const editor = facade();
      if (!editor) return 0;
      return editor.rejectGroup(options.groupId == null ? undefined : options.groupId);
    },

    restoreRejected() {
      const editor = facade();
      return editor ? editor.restoreRejected() : { restored: 0, failed: 0 };
    },

    step(direction) {
      const editor = facade();
      return editor ? editor.stepSuggestion(direction === -1 ? -1 : 1) : null;
    },

    setView(mode) {
      const editor = facade();
      if (editor) editor.setSuggestionView(mode);
    },

    dismissNotice() {
      const editor = facade();
      if (editor) editor.clearSuggestionNotice();
    },

    // Only hides the bar; rejected suggestions stay restorable from Muokkaa → Ehdotukset
    closeBar() {
      if (env.activeChapterId == null) return;
      closed.add(env.activeChapterId);
      publish();
    },

    menuCommand(name) {
      switch (name) {
        case 'accept': return controller.acceptCurrent();
        case 'reject': return controller.rejectCurrent();
        case 'next': return controller.step(1);
        case 'previous': return controller.step(-1);
        case 'accept-all': return controller.acceptAll();
        case 'reject-all': return controller.rejectAll();
        case 'restore': return controller.restoreRejected();
        default: return undefined;
      }
    },

    // --- Undo hooks: called around manager.undo() / redo() with the step ---

    /** A redo applies the accepted text again: its suggestions must be gone before the text arrives. */
    beforeHistory(direction, step) {
      const accepted = acceptedIn(step);
      if (direction !== 'redo' || !accepted) return;

      try {
        const editor = openEditor(step.chapterId);
        if (editor) editor.removeSuggestions(accepted.ids);
        else if (records.has(step.chapterId)) changeRecord(step.chapterId, null, state => model.reduce(state, { type: 'remove', ids: accepted.ids }));

        logDecisions('accepted', accepted.items, step.chapterId, { redo: true });
      } finally {
        publish();
      }
    },

    /** After an undo or redo succeeded, in the same tick. */
    afterHistory(direction, step) {
      if (!step) return;
      const hasText = typeof step.oldContent === 'string' && typeof step.newContent === 'string';
      const accepted = acceptedIn(step);

      try {
        afterHistoryChanges(direction, step, hasText, accepted);
      } finally {
        publish();
      }
    },

    // --- Proposing from features ---


    /**
     * Propose changes for a chapter that may not be open (a run that takes
     * time). `options` as for the facade's proposeChanges; `baseText` is the
     * text the offsets were computed on.
     */
    propose(chapterId, changes, options = {}) {
      const editor = openEditor(chapterId);
      if (editor) return editor.proposeChanges(changes, options);

      const chapter = chapterOf(chapterId);
      // A captured range lives in an editor; without the editor the target is gone
      if (!chapter || options.rangeId != null) return failed('target-changed');

      const text = normalizeNewlines(chapter.content);
      const state = changeRecord(chapterId, text, current => model.reduce(current, {
        type: 'propose',
        docText: text,
        changes,
        groupId: options.groupId || model.nextId('g'),
        meta: options.meta == null ? null : options.meta,
        select: options.select,
        replaceGroupId: options.replaceGroupId,
        // Unchanged: the offsets are offsets in this very string (the frame
        // rule); the reducer moves them onto the normalised chapter text
        baseText: typeof options.baseText === 'string' ? options.baseText : undefined,
        diff: rawDiff
      }));

      const event = state.event && state.event.type === 'proposed' ? state.event : null;
      if (event && event.ids.length) closed.delete(chapterId);
      publish();
      if (!event || !event.ids.length) return failed('no-changes', event ? event.skipped : []);
      return { ok: true, groupId: event.groupId, ids: event.ids, skipped: event.skipped };
    },

    /**
     * "Pysäytä" and "Uusi yritys" of the insert block: the editor cannot stop
     * or start a request itself.
     * @param {(action: 'stop'|'retry', block: object|null, chapterId: string) => void} handler
     * @returns {() => void} unsubscribe
     */
    onBlockAction(handler) {
      if (typeof handler !== 'function') return () => {};
      blockHandlers.add(handler);
      return () => { blockHandlers.delete(handler); };
    },

    /**
     * The request row of a draft whose chapter was left while it was being written. The row's id
     * comes with the cancelled request's result, after the editor went; the stored attempt takes the
     * request's meta then, so a decision on it names its request row (contracts 1.1 `requestLogId`).
     * @returns {boolean} whether a stored attempt took the meta
     */
    linkStoredBlock(chapterId, blockId, meta) {
      const index = awaitingLog.get(blockId);
      awaitingLog.delete(blockId);
      const record = records.get(chapterId);
      const block = record && record.state ? record.state.block : null;
      if (index === undefined || !block || block.id !== blockId || !meta || typeof meta !== 'object') return false;
      const attempt = block.attempts[index];
      if (!attempt || attempt.meta) return false;
      const attempts = block.attempts.map((entry, i) => (i === index ? { ...entry, meta } : entry));
      record.state = { ...record.state, block: { ...block, attempts, meta } };
      return true;
    },

    // --- Liitä muokkauksina ---

    /** Compare the clipboard with the selection (or the whole chapter) and open the dialog. */
    pasteAsEdits(clipboardText) {
      const remembered = call('getSetting', PASTE_SOURCE_KEY, 'editor');
      const source = PASTE_SOURCES.includes(remembered) ? remembered : 'editor';
      const editor = facade();
      const none = { targetWords: 0, clipboardWords: 0, changeCount: 0 };

      // A request that never got its answer
      if (paste && !paste.dropped && editor) editor.releaseRange(paste.rangeId);
      paste = null;

      const target = editor ? editor.captureSelection({ highlight: true, fallback: 'document' }) : null;
      if (!target) {
        call('openPasteDialog', { status: 'no-editor', scope: 'chapter', stats: none, ratio: 0, warn: false, protectedCount: 0, source });
        return;
      }

      // A selection that ends inside a note must not propose deleting the half it holds
      const cutSpans = cutProtectedSpans(documentText(editor), target.from, target.to);
      // rawDiff takes apart a merged change that would delete a note, so its other words are still proposed
      const result = preparePasteEdits(target.text, clipboardText, { wordDiff: deps.wordDiff, changeRatio: deps.changeRatio, rawDiff }, cutSpans);
      // The changes and the range stay here; the dialog only gets the numbers
      if (result.status === 'ok') paste = { rangeId: target.rangeId, changes: result.changes, chapterId: env.activeChapterId };
      else editor.releaseRange(target.rangeId);

      call('openPasteDialog', {
        status: result.status,
        scope: target.fallbackUsed ? 'chapter' : 'selection',
        stats: result.stats,
        ratio: result.ratio,
        warn: result.warn,
        protectedCount: result.protectedCount,
        source
      });
    },

    /**
     * The dialog's answer: { source } proposes the changes, null gives the target up. A paste whose
     * target went while the dialog was open (its chapter closed or another one opened) proposes nothing
     * and answers { ok: false, error: 'target-changed' }, as a target whose text changed does.
     */
    confirmPaste(choice) {
      const request = paste;
      paste = null;
      if (!request) return undefined;

      const editor = request.dropped ? null : openEditor(request.chapterId);
      if (!editor) return choice ? failed('target-changed') : undefined;
      if (!choice) {
        editor.releaseRange(request.rangeId);
        return undefined;
      }

      const source = PASTE_SOURCES.includes(choice.source) ? choice.source : 'editor';
      // The facade releases the range after proposing (and when the target changed meanwhile)
      const result = editor.proposeChanges(request.changes, {
        rangeId: request.rangeId,
        meta: {
          source,
          action: 'paste-edits',
          actionLabel: TEXT.pasteLabel,
          instruction: '',
          provider: null,
          model: null,
          requestLogId: null
        }
      });
      call('setSetting', PASTE_SOURCE_KEY, source);
      return result;
    },

    // --- Leaving the project ---

    pendingTotal,
    pendingCounts,
    pendingByChapter,

    /** Ask before a project switch throws pending suggestions and drafts away. Resolves true when it may go on. */
    confirmDiscard() {
      const counts = pendingCounts();
      if (!(counts.suggestions + counts.blocks) || typeof env.askConfirm !== 'function') return Promise.resolve(true);
      const message = TEXT.discard(counts);
      const words = TEXT.discardWords(counts);
      // A throwing askConfirm rejects the promise instead of throwing at the caller
      return new Promise(resolve => resolve(env.askConfirm(words.title, message, words.confirm, words.cancel)))
        .then(answer => !!answer);
    },

    /**
     * The project changed. Everything held here belonged to the old one, and
     * so does the editor that is still mounted for one more commit: from now
     * on its events are ignored, or its unmount would store its suggestions
     * again under a chapter id the new project also has.
     */
    reset() {
      epoch += 1;
      records.clear();
      reveal.clear();
      closed.clear();
      propsCache = new Map();
      live = null;
      paste = null;
      bulkSnapshotId = null;
      awaitingLog.clear();
      lastInfo = JSON.stringify(null);
      lastCounts = '0/0';
      call('reportPending', { suggestions: 0, blocks: 0 });
      call('setInfo', null);
    }
  };

  return controller;
}

module.exports = { createSuggestionController };

/**
 * Suggestions in the editor: the CodeMirror side
 *
 * A thin shell around suggestionModel.js. It keeps the model state in a
 * StateField, draws it with decorations, binds the review keys and gives the
 * editor facade its suggestion methods. The document changes in exactly one
 * place here: the accept transaction.
 *
 * This file must not require CodeMirror itself (that would put a second copy
 * of @codemirror/state into the bundle): the classes arrive as the argument of
 * createSuggestionKit. The app calls it once, in the ESM shell
 * src/editor/suggestions.js; tests call it with CodeMirror's CommonJS build
 * (test/editor/suggestions.view.test.js).
 */

const model = require('./suggestionModel.js');
const { createBlockView } = require('./pendingInsertView.js');

// Shift+Cmd+. and Shift+Cmd+, step by physical key. Switch off if the live
// check on a Finnish keyboard shows a clash; the arrow keys remain.
const STEP_ALIAS_BY_PHYSICAL_KEY = true;

// A proposal that waits for the document to reach a text is given up after this long
const QUEUE_LIFETIME_MS = 2000;

// Reducer actions that read the document: the shell adds the text
const TEXT_ACTIONS = new Set(['propose', 'restore', 'blockStart']);
// Reducer actions that only a document change can carry
const CHANGE_ACTIONS = new Set(['accepted', 'blockAccepted', 'map', 'rebase']);

const tint = (token, share) => `color-mix(in srgb, var(${token}, currentColor) ${share}%, transparent)`;
const ACCENT = 'var(--sugg-current, var(--sigil, var(--bronze, currentColor)))';
const MONO = "'IBM Plex Mono', monospace";
const SMALL_PRINT = { fontFamily: MONO, fontSize: '11px', color: 'var(--text-3, inherit)' };

// Colours come from the design tokens only; the --sugg-* tokens can override each one
const THEME = {
  '.cm-faust-sugg-del': {
    textDecoration: 'line-through',
    backgroundColor: `var(--sugg-del-bg, ${tint('--error', 14)})`,
    color: 'var(--sugg-del-text, var(--text-3, inherit))'
  },
  '.cm-faust-sugg-ins': {
    whiteSpace: 'pre-wrap',
    backgroundColor: `var(--sugg-ins-bg, ${tint('--success', 18)})`,
    borderBottom: `1px solid var(--sugg-ins-line, ${tint('--success', 70)})`
  },
  '.cm-faust-sugg-new': {
    whiteSpace: 'pre-wrap',
    borderBottom: `1px dotted var(--sugg-ins-line, ${tint('--success', 70)})`
  },
  '.cm-faust-sugg-orig': { borderBottom: `1px dotted ${ACCENT}` },
  '.cm-faust-sugg-point': { color: ACCENT },
  '.cm-faust-sugg-break': { textDecoration: 'line-through' },
  '.cm-faust-sugg-current': { outline: `1px solid ${ACCENT}`, borderRadius: '2px' },
  '.cm-faust-target': { backgroundColor: `var(--target-bg, ${tint('--gold', 22)})` },
  '.cm-faust-block': {
    margin: '0.4em 0',
    padding: '0.5em 0.8em',
    backgroundColor: 'var(--sugg-block-bg, var(--bg-2, var(--bg-secondary, transparent)))',
    borderLeft: '2px solid var(--bronze, currentColor)',
    color: 'var(--text-2, inherit)'
  },
  '.cm-faust-block.cm-faust-sugg-current': { borderLeftColor: ACCENT },
  '.cm-faust-block-head': SMALL_PRINT,
  '.cm-faust-block-note': SMALL_PRINT,
  '.cm-faust-block-text': { whiteSpace: 'pre-wrap', margin: '0.3em 0' },
  '.cm-faust-block-text[data-placeholder]': { color: 'var(--text-3, inherit)' },
  '.cm-faust-block-bar': {
    ...SMALL_PRINT,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5em',
    marginTop: '0.4em'
  },
  '.cm-faust-block-button': {
    fontFamily: MONO,
    fontSize: '11px',
    padding: '2px 8px',
    cursor: 'pointer',
    color: 'inherit',
    background: 'transparent',
    border: '1px solid var(--border-color, currentColor)',
    borderRadius: '3px'
  },
  '.cm-faust-block-button:disabled': { opacity: '0.4', cursor: 'default' }
};

function createSuggestionKit(cm) {
  const { StateField, StateEffect, Annotation, Prec, EditorView, Decoration, WidgetType, keymap } = cm;

  /** One effect type; its value is a reducer action. */
  const suggestionEffect = StateEffect.define();
  /** On the transaction that applies accepted suggestions: { ids, items }, positions from before it. */
  const suggestionAccept = Annotation.define();

  const eventsByTransaction = new WeakMap();
  const runtimeByView = new WeakMap();
  const decorationCache = new WeakMap();

  const DEFAULT_CONFIG = { external: null, diff: undefined, modelLabel: (modelId) => modelId };

  // What suggestionExtension was given, per editor. A field, because the kit takes no Facet.
  const configField = StateField.define({ create: () => DEFAULT_CONFIG, update: (value) => value });
  const configOf = (state) => state.field(configField, false) || DEFAULT_CONFIG;

  // -------------------------------------------------------------------------
  // The field
  // -------------------------------------------------------------------------

  const tracksAnything = (value) => value.items.length > 0 || !!value.block || value.ranges.length > 0;

  const insideDoc = (from, to, length) => Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= from && to <= length;

  /**
   * A seed must fit the document it is given to. With a position outside the
   * text it was made for another text and is dropped as a whole. A pending
   * suggestion that does not stand on the words it was made for is set aside
   * as rejected: drawn, it could be accepted into the wrong place.
   */
  function seedFor(seed, doc) {
    if (!seed || !Array.isArray(seed.items) || !Array.isArray(seed.ranges)) return model.createState();
    const text = doc.toString();
    const fits = seed.items.every(item => insideDoc(item.from, item.to, text.length)) &&
      (!seed.block || insideDoc(seed.block.pos, seed.block.pos, text.length)) &&
      seed.ranges.every(range => insideDoc(range.from, range.to, text.length));
    if (!fits) return model.createState();

    const stale = seed.items.filter(item => item.state === 'pending' && !model.stillMatches(text, item)).map(item => item.id);
    return stale.length ? model.reduce(seed, { type: 'reject', ids: stale }) : seed;
  }

  // A rejected replacement whose text an edit took out sits on a collapsed
  // range; an undo that puts the text back lands within reach of its context,
  // and only the rebase can find it there
  const reachOf = (item) => (item.state === 'rejected' && item.from === item.to && item.original
    ? item.original.length + (item.context ? item.context.before.length + item.context.after.length : 0)
    : 0);

  const touchesTracked = (value, touchesRange) => (
    value.items.some(item => {
      const reach = reachOf(item);
      return touchesRange(Math.max(0, item.from - reach), item.to + reach);
    }) ||
    (!!value.block && !!touchesRange(value.block.pos, value.block.pos)) ||
    value.ranges.some(range => touchesRange(range.from, range.to))
  );

  const suggestionField = StateField.define({
    create: () => model.createState(),

    update(value, tr) {
      const events = [];
      const apply = (state, action) => {
        const next = model.reduce(state, action);
        if (next !== state && next.event) events.push(next.event);
        return next;
      };

      let state = value;
      const accept = tr.annotation(suggestionAccept);
      let consumed = null;

      if (tr.docChanged) {
        const mapping = {
          mapPos: (pos, assoc) => tr.changes.mapPos(pos, assoc),
          touchesRange: (from, to) => tr.changes.touchesRange(from, to)
        };
        const config = configOf(tr.startState);

        if (accept) {
          // 1. An accept: its effect says which suggestions left with the change
          consumed = tr.effects.find(effect => effect.is(suggestionEffect) &&
            (effect.value.type === 'accepted' || effect.value.type === 'blockAccepted')) || null;
          state = apply(state, consumed ? { ...consumed.value, ...mapping } : { type: 'map', ...mapping });
        } else if (config.external && tr.annotation(config.external)) {
          // 2. A change mirrored from outside (undo, redo, find and replace): one range
          //    from the first to the last difference. Rebase only when it reaches something.
          if (tracksAnything(state)) {
            state = apply(state, touchesTracked(state, mapping.touchesRange)
              ? { type: 'rebase', oldText: tr.startState.doc.toString(), newText: tr.newDoc.toString(), diff: config.diff }
              : { type: 'map', ...mapping });
          }
        } else {
          // 3. The author's own edit
          state = apply(state, { type: 'map', ...mapping });
        }
      }

      // 4. Actions sent as effects
      for (const effect of tr.effects) {
        if (!effect.is(suggestionEffect) || effect === consumed) continue;
        const action = effect.value;
        if (!action || CHANGE_ACTIONS.has(action.type)) continue;
        if (action.type === 'blockAction') {
          // A button of the block that only the owner of the request can serve
          events.push({ type: 'block-action', action: action.action, blockId: action.id });
          continue;
        }
        // Every tracked position must lie inside the document, or the next edit could not map it
        if (action.type === 'rangeAdd' && !insideDoc(action.from, action.to, tr.newDoc.length)) continue;
        state = apply(state, TEXT_ACTIONS.has(action.type) ? { ...action, docText: tr.newDoc.toString() } : action);
      }

      // 5. The caret inside a suggestion makes it the current one
      if (tr.selection && !accept) state = apply(state, { type: 'cursor', head: tr.newSelection.main.head });

      if (events.length) eventsByTransaction.set(tr, events);
      return state;
    },

    provide: (field) => [
      EditorView.decorations.compute([field], state => buildDecorations(state.field(field), configOf(state)).all),
      EditorView.atomicRanges.of(view => {
        const value = view.state.field(field, false);
        return value ? buildDecorations(value, configOf(view.state)).atomic : Decoration.none;
      })
    ]
  });

  const fieldOf = (state) => state.field(suggestionField, false) || model.createState();

  // -------------------------------------------------------------------------
  // Decorations
  // -------------------------------------------------------------------------

  const currentClass = (name, current) => name + (current ? ' cm-faust-sugg-current' : '');

  class InsertWidget extends WidgetType {
    constructor(id, text, current, plain) {
      super();
      this.id = id;
      this.text = text;
      this.current = current;
      this.plain = plain;
    }

    eq(other) {
      return other.id === this.id && other.text === this.text && other.current === this.current && other.plain === this.plain;
    }

    toDOM(view) {
      const doc = view.dom.ownerDocument;
      const span = doc.createElement('span');
      span.className = currentClass(this.plain ? 'cm-faust-sugg-new' : 'cm-faust-sugg-ins', this.current);
      span.setAttribute('data-sugg-id', this.id);
      span.setAttribute('aria-label', `Lisäysehdotus: ${this.text}`);

      const lines = this.text.split('\n');
      lines.forEach((line, index) => {
        if (line) span.appendChild(doc.createTextNode(line));
        if (index === lines.length - 1) return;
        // Every view marks a new paragraph break the same way (cluster C 3.2)
        span.appendChild(doc.createTextNode('¶'));
        span.appendChild(doc.createElement('br'));
      });
      return span;
    }

    // Clicks reach the editor: the caret lands next to the widget and the click handler sees it
    ignoreEvent() { return false; }
  }

  class MarkWidget extends WidgetType {
    constructor(id, className, sign, current) {
      super();
      this.id = id;
      this.className = className;
      this.sign = sign;
      this.current = !!current;
    }

    eq(other) {
      return other.id === this.id && other.className === this.className && other.current === this.current;
    }

    toDOM(view) {
      const span = view.dom.ownerDocument.createElement('span');
      span.className = currentClass(this.className, this.current);
      span.setAttribute('data-sugg-id', this.id);
      span.textContent = this.sign;
      return span;
    }

    ignoreEvent() { return false; }
  }

  class BlockWidget extends WidgetType {
    constructor(spec, modelName) {
      super();
      this.spec = spec;
      this.modelName = modelName;
    }

    eq(other) {
      const a = this.spec;
      const b = other.spec;
      return a.id === b.id && a.text === b.text && a.status === b.status && a.attempt === b.attempt &&
        a.attemptCount === b.attemptCount && a.note === b.note && a.current === b.current &&
        this.modelName === other.modelName;
    }

    show(dom) {
      dom.faustBlockId = this.spec.id;
      dom.setAttribute('data-sugg-id', this.spec.id);
      dom.classList.toggle('cm-faust-sugg-current', !!this.spec.current);
      dom.faustBlockView.render({
        status: this.spec.status,
        text: this.spec.text,
        note: this.spec.note,
        modelName: this.modelName,
        attempt: this.spec.attempt,
        attemptCount: this.spec.attemptCount
      });
    }

    toDOM(view) {
      const blockView = createBlockView(view.dom.ownerDocument, {
        onIntent: (intent) => blockIntent(view, blockView.dom.faustBlockId, intent)
      });
      const dom = blockView.dom;
      dom.faustBlockView = blockView;
      // A click anywhere on the block makes it the current item
      dom.addEventListener('mousedown', () => setCurrent(view, dom.faustBlockId));
      this.show(dom);
      return dom;
    }

    // Streaming text re-renders the same element instead of building a new one
    updateDOM(dom) {
      if (!dom.faustBlockView) return false;
      this.show(dom);
      return true;
    }

    destroy(dom) {
      if (dom.faustBlockView) dom.faustBlockView.destroy();
    }

    // The block handles its own clicks; the editor must not move the caret for them
    ignoreEvent() { return true; }
  }

  function modelNameOf(value, config) {
    const meta = value.block && value.block.meta;
    if (!meta || !meta.model) return '';
    const name = config.modelLabel(meta.model);
    return name == null ? '' : String(name);
  }

  function buildDecorations(value, config) {
    const modelName = modelNameOf(value, config);
    const cached = decorationCache.get(value.items);
    if (cached && cached.block === value.block && cached.ranges === value.ranges &&
        cached.viewMode === value.viewMode && cached.currentId === value.currentId && cached.modelName === modelName) {
      return cached.result;
    }

    const all = [];
    const atomic = [];
    for (const spec of model.decorationSpecs(value)) {
      const idAttribute = { 'data-sugg-id': spec.id };
      switch (spec.kind) {
        case 'del':
          all.push(Decoration.mark({ class: currentClass('cm-faust-sugg-del', spec.current), attributes: idAttribute }).range(spec.from, spec.to));
          break;
        case 'ins':
          all.push(Decoration.widget({ widget: new InsertWidget(spec.id, spec.text, spec.current, spec.plain), side: 1 }).range(spec.pos));
          break;
        case 'break':
          all.push(Decoration.widget({ widget: new MarkWidget(spec.id, 'cm-faust-sugg-del cm-faust-sugg-break', '¶', false), side: 1 }).range(spec.pos));
          break;
        case 'orig':
          all.push(Decoration.mark({ class: currentClass('cm-faust-sugg-orig', spec.current), attributes: idAttribute }).range(spec.from, spec.to));
          break;
        case 'point':
          all.push(Decoration.widget({ widget: new MarkWidget(spec.id, 'cm-faust-sugg-point', '‸', spec.current), side: 1 }).range(spec.pos));
          break;
        case 'hide': {
          const hidden = Decoration.replace({}).range(spec.from, spec.to);
          all.push(hidden);
          atomic.push(hidden);
          break;
        }
        case 'block':
          all.push(Decoration.widget({ widget: new BlockWidget(spec, modelName), block: true, side: 1 }).range(spec.pos));
          break;
        case 'target':
          all.push(Decoration.mark({ class: 'cm-faust-target' }).range(spec.from, spec.to));
          break;
        default:
          break;
      }
    }

    const result = { all: Decoration.set(all, true), atomic: Decoration.set(atomic, true) };
    decorationCache.set(value.items, {
      block: value.block, ranges: value.ranges, viewMode: value.viewMode, currentId: value.currentId, modelName, result
    });
    return result;
  }

  // -------------------------------------------------------------------------
  // Dispatching
  // -------------------------------------------------------------------------

  const runtimeOf = (view) => {
    let runtime = runtimeByView.get(view);
    if (!runtime) {
      runtime = { queue: null, buffer: null };
      runtimeByView.set(view, runtime);
    }
    return runtime;
  };

  // Dispatch reducer actions and return the events they produced
  function send(view, actions, spec = {}) {
    const list = Array.isArray(actions) ? actions : [actions];
    const effects = list.map(action => suggestionEffect.of(action)).concat(spec.effects || []);
    const tr = view.state.update({ ...spec, effects });
    view.dispatch(tr);
    return eventsByTransaction.get(tr) || [];
  }

  const clampPos = (view, pos) => Math.max(0, Math.min(view.state.doc.length, Number.isFinite(pos) ? Math.trunc(pos) : 0));
  const thirdOfHeight = (view) => Math.round((view.scrollDOM.clientHeight || 0) / 3);

  function positionOf(value, id) {
    if (id == null) return null;
    if (value.block && value.block.id === id) return value.block.pos;
    const item = value.items.find(entry => entry.id === id);
    return item ? item.from : null;
  }

  const pendingBlockOf = (value, blockId) => {
    const block = value.block;
    if (!block || block.state !== 'pending') return null;
    return blockId == null || block.id === blockId ? block : null;
  };
  const shownStatus = (block) => (block.attempts[block.attempt] ? block.attempts[block.attempt].status : null);

  function setCurrent(view, id) {
    if (id == null || fieldOf(view.state).currentId === id) return;
    send(view, { type: 'setCurrent', id });
  }

  // --- Deciding ------------------------------------------------------------

  // One transaction: the document change, the annotation for the undo step and the effect for the field
  function acceptIds(view, wanted, single) {
    const value = fieldOf(view.state);
    // The last check before the one write: the text under a suggestion must be the text it was made for
    const ids = model.pendingItems(value)
      .filter(item => wanted.includes(item.id) && view.state.doc.sliceString(item.from, item.to) === item.original)
      .map(item => item.id);
    const changes = model.acceptChanges(value, ids);
    if (!changes.length) return 0;

    const changeSet = view.state.changes(changes);
    const mapping = {
      mapPos: (pos, assoc) => changeSet.mapPos(pos, assoc),
      touchesRange: (from, to) => changeSet.touchesRange(from, to)
    };
    // The reducer is pure for this action: run it ahead to learn where the caret goes
    const predicted = model.reduce(value, { type: 'accepted', ids, ...mapping });
    const event = predicted.event;

    const spec = {
      changes: changeSet,
      annotations: suggestionAccept.of({ ids: event.ids, items: event.items }),
      effects: suggestionEffect.of({ type: 'accepted', ids: event.ids }),
      userEvent: 'input.suggestion'
    };
    const next = positionOf(predicted, predicted.currentId);
    if (next != null) {
      spec.selection = { anchor: next };
      spec.scrollIntoView = true;
    } else if (single) {
      const last = event.items[event.items.length - 1];
      spec.selection = { anchor: changeSet.mapPos(last.to, 1) };
      spec.scrollIntoView = true;
    }
    view.dispatch(spec);
    return event.ids.length;
  }

  function rejectIds(view, ids) {
    const value = fieldOf(view.state);
    const predicted = model.reduce(value, { type: 'reject', ids });
    if (predicted === value || !predicted.event || predicted.event.type !== 'rejected') return 0;

    const spec = {};
    const next = positionOf(predicted, predicted.currentId);
    if (next != null) {
      spec.selection = { anchor: next };
      spec.scrollIntoView = true;
    }
    send(view, { type: 'reject', ids: predicted.event.ids }, spec);
    return predicted.event.ids.length;
  }

  function acceptBlock(view, blockId) {
    flushBuffer(view);
    const value = fieldOf(view.state);
    const block = pendingBlockOf(value, blockId);
    if (!block) return false;
    const change = model.blockChange(value, view.state.doc.toString());
    if (!change) return false;

    const changeSet = view.state.changes(change);
    const predicted = model.reduce(value, {
      type: 'blockAccepted',
      id: block.id,
      insert: change.insert,
      mapPos: (pos, assoc) => changeSet.mapPos(pos, assoc),
      touchesRange: (from, to) => changeSet.touchesRange(from, to)
    });
    const event = predicted.event;
    const next = positionOf(predicted, predicted.currentId);

    view.dispatch({
      changes: changeSet,
      annotations: suggestionAccept.of({ ids: event.ids, items: event.items }),
      effects: suggestionEffect.of({ type: 'blockAccepted', id: block.id, insert: change.insert }),
      selection: { anchor: next != null ? next : change.from + change.insert.length },
      scrollIntoView: true,
      userEvent: 'input.suggestion'
    });
    return true;
  }

  function rejectBlock(view, blockId) {
    flushBuffer(view);
    const value = fieldOf(view.state);
    const block = pendingBlockOf(value, blockId);
    if (!block) return false;
    const shown = block.attempts[block.attempt];
    const insert = model.blockInsertText(view.state.doc.toString(), block.pos, shown ? shown.text : '');
    send(view, { type: 'blockReject', id: block.id, insert });
    return true;
  }

  function stepTo(view, direction) {
    const value = fieldOf(view.state);
    const head = view.state.selection.main.head;
    const action = { type: 'step', direction: direction === -1 ? -1 : 1, head };
    const predicted = model.reduce(value, action);
    const pos = positionOf(predicted, predicted.currentId);
    if (pos == null || !model.hasReviewable(predicted)) return null;

    send(view, action, {
      selection: { anchor: pos },
      effects: [EditorView.scrollIntoView(pos, { y: 'nearest', yMargin: thirdOfHeight(view) })]
    });
    return predicted.currentId;
  }

  function acceptCurrent(view) {
    const value = fieldOf(view.state);
    if (value.currentId == null) return false;
    if (pendingBlockOf(value, value.currentId)) return acceptBlock(view, value.currentId);
    return acceptIds(view, [value.currentId], true) > 0;
  }

  function rejectCurrent(view) {
    const value = fieldOf(view.state);
    if (value.currentId == null) return false;
    if (pendingBlockOf(value, value.currentId)) return rejectBlock(view, value.currentId);
    return rejectIds(view, [value.currentId]) > 0;
  }

  // --- The block's stream --------------------------------------------------

  function schedule(view, run) {
    const win = view.dom.ownerDocument.defaultView;
    if (win && typeof win.requestAnimationFrame === 'function') {
      const id = win.requestAnimationFrame(run);
      return () => win.cancelAnimationFrame(id);
    }
    const id = setTimeout(run, 16);
    return () => clearTimeout(id);
  }

  // Stream chunks arrive far more often than the screen is painted: one dispatch per frame
  function bufferAppend(view, blockId, text) {
    const runtime = runtimeOf(view);
    if (runtime.buffer && runtime.buffer.blockId !== blockId) flushBuffer(view);
    if (!runtime.buffer) {
      runtime.buffer = { blockId, text: '', cancel: schedule(view, () => flushBuffer(view)) };
    }
    runtime.buffer.text += text;
  }

  function flushBuffer(view) {
    const runtime = runtimeOf(view);
    const buffer = runtime.buffer;
    if (!buffer) return;
    runtime.buffer = null;
    buffer.cancel();
    // The editor may have been closed between two frames
    if (buffer.text && view.destroyed !== true) send(view, { type: 'blockAppend', id: buffer.blockId, text: buffer.text });
  }

  function blockIntent(view, blockId, intent) {
    switch (intent && intent.type) {
      case 'block-accept': acceptBlock(view, blockId); break;
      case 'block-reject': rejectBlock(view, blockId); break;
      case 'block-show': showAttempt(view, blockId, intent.index); break;
      // Stopping and retrying belong to whoever owns the request: tell them
      case 'block-stop': send(view, { type: 'blockAction', action: 'stop', id: blockId }); break;
      case 'block-retry': send(view, { type: 'blockAction', action: 'retry', id: blockId }); break;
      default: break;
    }
  }

  function showAttempt(view, blockId, index) {
    flushBuffer(view);
    const block = pendingBlockOf(fieldOf(view.state), blockId);
    if (!block || blockId == null || shownStatus(block) === 'streaming' || !Number.isFinite(index)) return false;
    send(view, { type: 'blockShow', id: block.id, index });
    return true;
  }

  // --- Proposing -----------------------------------------------------------

  const failed = (error, skipped = []) => ({ ok: false, groupId: null, ids: [], skipped, error });

  function rangeOf(view, rangeId) {
    const range = fieldOf(view.state).ranges.find(entry => entry.id === rangeId);
    if (!range) return null;
    return {
      from: range.from,
      to: range.to,
      text: range.text,
      intact: view.state.doc.sliceString(range.from, range.to) === range.text
    };
  }

  function clearQueue(view) {
    const runtime = runtimeOf(view);
    if (runtime.queue) clearTimeout(runtime.queue.timer);
    runtime.queue = null;
  }

  function propose(view, changes, options = {}) {
    const docText = view.state.doc.toString();

    // Asked to wait for a text (an undo that React has not mirrored yet): one entry, for a short while
    if (typeof options.whenText === 'string' && options.whenText !== docText) {
      clearQueue(view);
      const runtime = runtimeOf(view);
      const entry = { changes, options, timer: null };
      entry.timer = setTimeout(() => { if (runtime.queue === entry) runtime.queue = null; }, QUEUE_LIFETIME_MS);
      runtime.queue = entry;
      return { ok: true, queued: true, groupId: null, ids: [], skipped: [] };
    }

    let list = Array.isArray(changes) ? changes : [];
    const actions = [];
    const usesRange = options.rangeId != null;

    if (usesRange) {
      // Offsets inside a captured target: valid only while its text is still what was captured
      const range = rangeOf(view, options.rangeId);
      if (range && !options.keepRange) actions.push({ type: 'rangeRemove', id: options.rangeId });
      if (!range || !range.intact) {
        if (actions.length) send(view, actions);
        return failed('target-changed');
      }
      list = list.map(change => (change ? { ...change, from: change.from + range.from, to: change.to + range.from } : change));
    }

    actions.unshift({
      type: 'propose',
      changes: list,
      // Restored suggestions come back with the groups they had
      groupId: options.groupId || (options.restore ? undefined : model.nextId('g')),
      meta: options.meta == null ? null : options.meta,
      select: options.select,
      replaceGroupId: options.replaceGroupId,
      restore: !!options.restore,
      // Offsets in an earlier text of the chapter: the model moves them onto the document
      baseText: !usesRange && typeof options.baseText === 'string' ? options.baseText : undefined,
      diff: configOf(view.state).diff
    });

    const event = send(view, actions).find(entry => entry.type === 'proposed');
    if (!event || !event.ids.length) return failed('no-changes', event ? event.skipped : []);

    if (options.select !== false) {
      const value = fieldOf(view.state);
      const pos = positionOf(value, value.currentId);
      if (pos != null) view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'nearest', yMargin: 80 }) });
    }
    return { ok: true, groupId: event.groupId, ids: event.ids, skipped: event.skipped };
  }

  // -------------------------------------------------------------------------
  // Keys and clicks
  // -------------------------------------------------------------------------

  const reviewing = (view) => model.hasReviewable(fieldOf(view.state));

  // Every command gives the key back while nothing is pending, so the keys do
  // what they did before whenever there is nothing to review
  const reviewKeymap = Prec.highest(keymap.of([
    {
      key: 'Mod-Enter',
      run(view) {
        if (!reviewing(view)) return false;
        const value = fieldOf(view.state);
        if (value.currentId == null) {
          stepTo(view, 1);
          return true;
        }
        const block = pendingBlockOf(value, value.currentId);
        // A block that is still being written cannot be accepted, and the key must not fall through
        if (block && shownStatus(block) === 'streaming') return true;
        acceptCurrent(view);
        return true;
      }
    },
    {
      key: 'Shift-Mod-Backspace',
      run(view) {
        if (!reviewing(view)) return false;
        const value = fieldOf(view.state);
        const block = pendingBlockOf(value, value.currentId);
        if (block && shownStatus(block) === 'streaming') return true;
        rejectCurrent(view);
        return true;
      }
    },
    {
      key: 'Alt-Mod-ArrowDown',
      run(view) {
        if (!reviewing(view)) return false;
        stepTo(view, 1);
        return true;
      }
    },
    {
      key: 'Alt-Mod-ArrowUp',
      run(view) {
        if (!reviewing(view)) return false;
        stepTo(view, -1);
        return true;
      }
    }
  ]));

  function isMac(view) {
    const win = view.dom.ownerDocument.defaultView;
    const nav = win && win.navigator;
    return !!nav && /Mac|iP(hone|ad|od)/.test(nav.platform || nav.userAgent || '');
  }

  // On a Finnish layout Shift+. and Shift+, give ":" and ";", which a keymap
  // cannot tell apart under Cmd+Shift. The physical key is the same everywhere.
  const aliasKeys = Prec.highest(EditorView.domEventHandlers({
    keydown(event, view) {
      if (!STEP_ALIAS_BY_PHYSICAL_KEY) return false;
      if (event.code !== 'Period' && event.code !== 'Comma') return false;
      const mod = isMac(view) ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (!mod || !event.shiftKey || event.altKey || !reviewing(view)) return false;
      event.preventDefault();
      stepTo(view, event.code === 'Period' ? 1 : -1);
      return true;
    }
  }));

  // A click on a suggestion makes it current; the caret still lands where the author clicked
  const clickHandler = EditorView.domEventHandlers({
    mousedown(event, view) {
      const target = event.target;
      const marked = target && typeof target.closest === 'function' ? target.closest('[data-sugg-id]') : null;
      if (marked) setCurrent(view, marked.getAttribute('data-sugg-id'));
      return false;
    }
  });

  const baseTheme = EditorView.baseTheme(THEME);

  /**
   * @param {{ external: object, diff?: (a: string, b: string) => Array, seed?: object|null, modelLabel?: (model: string) => string }} config
   *   external: the annotation type that marks a change mirrored from outside the editor
   *   diff: finest word diff, for rebasing after such a change
   *   seed: model state from the session store, already rebased onto the initial document
   *   modelLabel: turns a model id into the name shown in the block's header
   */
  function suggestionExtension(config = {}) {
    const settings = {
      external: config.external || null,
      diff: typeof config.diff === 'function' ? config.diff : undefined,
      modelLabel: typeof config.modelLabel === 'function' ? config.modelLabel : DEFAULT_CONFIG.modelLabel
    };
    return [
      configField.init(() => settings),
      suggestionField.init(state => seedFor(config.seed, state.doc)),
      reviewKeymap,
      aliasKeys,
      clickHandler,
      baseTheme
    ];
  }

  // -------------------------------------------------------------------------
  // Facade
  // -------------------------------------------------------------------------

  /**
   * Add the suggestion methods to the facade element (view.scrollDOM, what
   * editorRef.current holds). Positions are document offsets. Every method is
   * safe to call when nothing is pending.
   */
  function installSuggestionFacade(view, el) {
    const value = () => fieldOf(view.state);

    // --- Target capture: read from the editor at the moment an action starts ---

    const capture = (from, to, highlight, fallbackUsed) => {
      const start = clampPos(view, Math.min(from, to));
      const end = clampPos(view, Math.max(from, to));
      const rangeId = model.nextId('r');
      const text = view.state.doc.sliceString(start, end);
      send(view, { type: 'rangeAdd', id: rangeId, from: start, to: end, text, highlight: !!highlight });
      return { rangeId, from: start, to: end, text, fallbackUsed };
    };

    el.captureSelection = (options = {}) => {
      const selection = view.state.selection.main;
      if (!selection.empty) return capture(selection.from, selection.to, options.highlight, false);

      switch (options.fallback) {
        case 'paragraph': {
          const line = view.state.doc.lineAt(selection.head);
          return line.text.trim() ? capture(line.from, line.to, options.highlight, true) : null;
        }
        case 'document':
          return capture(0, view.state.doc.length, options.highlight, true);
        case 'caret':
          return capture(selection.head, selection.head, options.highlight, true);
        default:
          return null;
      }
    };

    el.captureRange = (from, to, options = {}) => capture(from, to, options.highlight, false);
    el.getRange = (rangeId) => rangeOf(view, rangeId);
    el.setRangeHighlight = (rangeId, on) => { send(view, { type: 'rangeHighlight', id: rangeId, highlight: !!on }); };
    el.releaseRange = (rangeId) => { send(view, { type: 'rangeRemove', id: rangeId }); };

    // --- Proposing ---

    el.proposeChanges = (changes, options) => propose(view, changes, options || {});

    el.flushQueuedSuggestions = (external = true) => {
      const entry = runtimeOf(view).queue;
      if (!entry) return;
      if (view.destroyed === true) {
        // The editor was closed while the proposal waited
        clearQueue(view);
      } else if (view.state.doc.toString() === entry.options.whenText) {
        clearQueue(view);
        propose(view, entry.changes, { ...entry.options, whenText: undefined });
      } else if (external === false) {
        // The author typed before the awaited text arrived: the proposal no longer fits
        clearQueue(view);
      }
    };

    el.removeSuggestions = (ids) => {
      const event = send(view, { type: 'remove', ids: Array.isArray(ids) ? ids : [] }).find(entry => entry.type === 'removed');
      return event ? event.ids.length : 0;
    };

    // --- Deciding ---

    el.acceptSuggestion = (id) => {
      if (id == null) return acceptCurrent(view);
      if (pendingBlockOf(value(), id)) return acceptBlock(view, id);
      return acceptIds(view, [id], true) > 0;
    };

    el.rejectSuggestion = (id) => {
      if (id == null) return rejectCurrent(view);
      if (pendingBlockOf(value(), id)) return rejectBlock(view, id);
      return rejectIds(view, [id]) > 0;
    };

    // A bulk accept never takes a suggestion on a dialogue line (bulkAcceptIds)
    el.acceptGroup = (groupId) => {
      const ids = model.bulkAcceptIds(value(), groupId == null ? null : groupId);
      return ids.length ? acceptIds(view, ids, false) : 0;
    };

    el.rejectGroup = (groupId) => {
      const ids = model.pendingItems(value())
        .filter(item => groupId == null || item.groupId === groupId)
        .map(item => item.id);
      return ids.length ? rejectIds(view, ids) : 0;
    };

    el.restoreRejected = () => {
      const event = send(view, { type: 'restore' }).find(entry => entry.type === 'restored');
      return event ? { restored: event.ids.length, failed: event.failed } : { restored: 0, failed: 0 };
    };

    el.stepSuggestion = (direction) => stepTo(view, direction);

    // --- Reading and view ---

    el.getSuggestions = () => model.snapshot(value());
    el.setSuggestionView = (mode) => { send(view, { type: 'setView', viewMode: mode }); };
    el.clearSuggestionNotice = () => { send(view, { type: 'clearNotice' }); };

    // Used by undo and redo: the caret goes to the change, the page moves only if it has to
    el.revealPos = (pos) => {
      const at = clampPos(view, pos);
      view.dispatch({
        selection: { anchor: at },
        effects: EditorView.scrollIntoView(at, { y: 'nearest', yMargin: thirdOfHeight(view) })
      });
    };

    // --- Insert block (write at cursor). Nothing here writes to the document but acceptInsertBlock. ---

    el.startInsertBlock = (options = {}) => {
      flushBuffer(view);
      const pos = clampPos(view, options.pos == null ? view.state.selection.main.head : options.pos);
      const id = model.nextId('b');
      const event = send(view, { type: 'blockStart', id, pos, meta: options.meta == null ? null : options.meta })
        .find(entry => entry.type === 'block');
      if (event && event.action === 'start') return { ok: true, blockId: id };
      return { ok: false, error: event && event.reason === 'conflict' ? 'conflict' : 'busy' };
    };

    el.appendInsertBlock = (blockId, text) => {
      const block = blockId == null ? null : pendingBlockOf(value(), blockId);
      if (!block || shownStatus(block) !== 'streaming') return false;
      if (text != null && text !== '') bufferAppend(view, block.id, String(text));
      return true;
    };

    el.finishInsertBlock = (blockId, result = {}) => {
      flushBuffer(view);
      const block = blockId == null ? null : pendingBlockOf(value(), blockId);
      // A late result must never empty an attempt the author stopped and kept
      if (!block || shownStatus(block) !== 'streaming') return false;
      send(view, {
        type: 'blockFinish',
        id: block.id,
        status: result.status,
        text: result.text,
        note: result.note,
        meta: result.meta
      });
      return true;
    };

    el.retryInsertBlock = (blockId) => {
      flushBuffer(view);
      const event = send(view, { type: 'blockRetry', id: blockId }).find(entry => entry.type === 'block' && entry.action === 'retry');
      return event && value().block ? value().block.attempt : -1;
    };

    el.showInsertBlockAttempt = (blockId, index) => showAttempt(view, blockId, index);
    el.acceptInsertBlock = (blockId) => acceptBlock(view, blockId);
    el.rejectInsertBlock = (blockId) => rejectBlock(view, blockId);
    el.getInsertBlock = () => model.snapshot(value()).block;
  }

  // -------------------------------------------------------------------------
  // For the editor's update listener
  // -------------------------------------------------------------------------

  /**
   * The undo meta of an update that accepted suggestions (second argument of
   * the editor's onChange): its own step, with what it accepted. Undefined
   * for any other update.
   */
  function readSuggestionMeta(update) {
    const ids = [];
    const items = [];
    for (const tr of update.transactions) {
      const accepted = tr.annotation(suggestionAccept);
      if (!accepted) continue;
      ids.push(...accepted.ids);
      items.push(...accepted.items);
    }
    return ids.length ? { noMerge: true, suggestions: { ids, items } } : undefined;
  }

  /** The reducer events of an update, in order. Stream chunks are left out: they would re-render the bar per chunk. */
  function suggestionEvents(update) {
    const events = [];
    for (const tr of update.transactions) {
      for (const event of eventsByTransaction.get(tr) || []) {
        if (event.type === 'block' && event.action === 'append') continue;
        events.push(event);
      }
    }
    return events;
  }

  const suggestionSnapshot = (state) => model.snapshot(fieldOf(state));
  const suggestionState = (state) => fieldOf(state);

  return {
    suggestionField,
    suggestionEffect,
    suggestionAccept,
    suggestionExtension,
    installSuggestionFacade,
    readSuggestionMeta,
    suggestionEvents,
    suggestionSnapshot,
    suggestionState
  };
}

module.exports = { createSuggestionKit };

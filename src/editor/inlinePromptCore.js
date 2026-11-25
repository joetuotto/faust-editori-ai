/**
 * The inline prompt in the editor (Cmd+K): CodeMirror extension, as a factory
 *
 * CommonJS core. The CodeMirror classes arrive as the argument `cm`, so this
 * file never requires @codemirror/* (a require would put a second copy of the
 * state package into the bundle) and Jest can run it against a real
 * EditorView (test/editor/inlinePrompt.view.test.js). The ESM shell
 * src/editor/inlinePrompt.js imports the classes and calls the factory once.
 *
 * The prompt is a tooltip under the end of its target. It holds no positions:
 * the target is a captured range of the suggestion layer (`rangeId`), read
 * from `suggestionField`. When that range disappears, the prompt closes.
 * It never covers its target: when it opens, the text scrolls to make room
 * under the target's end; when there is still no room it goes above the
 * target's start; and it is never taller than the room on its side (it then
 * scrolls inside itself).
 *
 * What the author does is reported to the host as intents:
 *   host().handle(intent, view)
 * The host is the quick-edit controller (src/services/ai/quickEdit.js).
 */

// Layout numbers of the placement (px): the space kept between the prompt and the target or the
// window edge, the least room the prompt is ever given, and the height a new prompt is expected to
// have before one was measured (the idle prompt measured 286 to 308 px in the app) and at most
const ROOM_GAP = 16;
const MIN_ROOM = 120;
const HEIGHT_ESTIMATE = 300;
const HEIGHT_ESTIMATE_MAX = 480;
// The band at the bottom of the editor pane where the dock shows the suggestion bar and the voice
// bar (.faust-dock: a bar of --h-xl, 40 px, inset by --sp-4, 16 px). The room made for a prompt
// ends above it, so that after a result the bar's buttons are not under the prompt.
const DOCK_BAND = 56;
// The custom property the stylesheet caps the prompt's height with (I-05 block of faust-components.css)
const ROOM_PROPERTY = '--cm-faust-prompt-room';

/**
 * How far to scroll the text so that a prompt of `height` fits under the target's end:
 * never further than the text can scroll, nor so far that the target's start leaves the view.
 * Pure; all values are screen pixels. Returns 0 when there is room already or none can be made.
 * @param {{ endBottom: number, startTop: number, visibleTop: number, visibleBottom: number,
 *           height: number, maxScroll: number, gap?: number }} m
 */
function scrollForRoom({ endBottom, startTop, visibleTop, visibleBottom, height, maxScroll, gap = ROOM_GAP }) {
  const need = endBottom + gap + height - visibleBottom;
  if (!(need > 0)) return 0;
  const keepStart = startTop - (visibleTop + gap);
  const delta = Math.floor(Math.min(need, maxScroll, keepStart));
  return Number.isFinite(delta) && delta > 0 ? delta : 0;
}

/**
 * @param {{ StateField, StateEffect, EditorView, Decoration, showTooltip, ViewPlugin }} cm
 * @param {{ suggestionField: object, createPromptView?: Function }} options
 */
function createInlinePromptKit(cm, options = {}) {
  const { StateField, StateEffect, EditorView, showTooltip, ViewPlugin } = cm;
  const { suggestionField } = options;
  const createPromptView = options.createPromptView || require('./inlinePromptView.js').createPromptView;

  if (!suggestionField) throw new TypeError('createInlinePromptKit: suggestionField is required');

  const setPrompt = StateEffect.define();   // { mode, rangeId, ui } opens or replaces, null closes
  const setUi = StateEffect.define();       // a new PromptState for the open prompt

  /** The captured range of the suggestion layer, or null when it is gone. */
  function rangeOf(state, rangeId) {
    const suggestions = state.field(suggestionField, false);
    const ranges = suggestions && Array.isArray(suggestions.ranges) ? suggestions.ranges : [];
    return ranges.find((range) => range.id === rangeId) || null;
  }

  const promptField = StateField.define({
    create: () => null,
    update(value, tr) {
      let next = value;
      for (const effect of tr.effects) {
        if (effect.is(setPrompt)) next = effect.value;
        else if (effect.is(setUi) && next) next = { ...next, ui: effect.value };
      }
      if (next) {
        // The target was deleted or released: nothing is left to edit
        const range = rangeOf(tr.state, next.rangeId);
        if (!range || (next.mode === 'edit' && range.from === range.to)) next = null;
      }
      return next;
    }
  });

  // The open prompt of each editor: its DOM view, for focus and for closing
  const live = new WeakMap();

  // The height the next prompt is expected to have (positioned() keeps it current)
  let expectedHeight = HEIGHT_ESTIMATE;

  /**
   * The prompt's anchor on screen: the target from the top of its first line to the bottom of
   * its last. Below, the prompt hangs under the target's end; when CodeMirror flips it above,
   * it stands over the target's start, so a wrapped target is never covered. A caret anchor
   * (write mode) and a start out of the rendered text give the end's own rectangle.
   */
  function spanRect(view, range, pos) {
    const span = !!range && range.from < range.to;
    const end = (span && view.coordsAtPos(pos, -1)) || view.coordsAtPos(pos, 1);
    if (!end || !span) return end;
    const start = view.coordsAtPos(range.from, 1);
    if (!start || !(start.top < end.top)) return end;
    return { left: end.left, right: end.right, top: start.top, bottom: end.bottom };
  }

  function anchorRect(view, pos) {
    const value = view.state.field(promptField, false);
    return spanRect(view, value ? rangeOf(view.state, value.rangeId) : null, pos);
  }

  /**
   * Room under the target for a prompt that is about to open, when the text can scroll that far
   * (never so far that the target's start leaves the view). Done before the prompt exists:
   * CodeMirror places a new tooltip before it applies a scroll of the same transaction, and then
   * keeps the side it chose, so a scroll made afterwards would leave the prompt above.
   */
  // How far the text should scroll for a prompt of `height` under the range (reads the layout)
  function roomDelta(view, range, height) {
    const rect = spanRect(view, range, range.to);
    if (!rect) return 0;
    const scroller = view.scrollDOM;
    const box = scroller.getBoundingClientRect();
    const win = view.dom.ownerDocument.defaultView;
    return scrollForRoom({
      endBottom: rect.bottom,
      startTop: rect.top,
      visibleTop: box.top,
      visibleBottom: (win && win.innerHeight ? Math.min(box.bottom, win.innerHeight) : box.bottom) - DOCK_BAND,
      height,
      maxScroll: scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
    });
  }

  function makeRoom(view, range) {
    try {
      const delta = roomDelta(view, range, expectedHeight);
      if (delta > 0) view.scrollDOM.scrollTop += delta;
    } catch (error) {
      // The layout cannot be read now (inside an update): the prompt goes where there is room
    }
  }

  const hostOf = (host) => {
    const target = typeof host === 'function' ? host() : null;
    return target && typeof target.handle === 'function' ? target : null;
  };

  // Role tokens only (styles/faust-tokens.css): no colour, no font name, no pixel font size.
  // The binding block of styles/faust-components.css outranks these rules; layout numbers stay here.
  const theme = EditorView.theme({
    '.cm-tooltip.cm-faust-prompt': {
      width: 'min(520px, 90vw)',
      boxSizing: 'border-box',
      padding: '10px 12px',
      background: 'var(--surface-raised)',
      color: 'var(--text)',
      border: '1px solid var(--border)',
      borderRadius: '4px',
      font: 'var(--type-meta)',
      outline: 'none'
    },
    '.cm-faust-prompt [hidden]': { display: 'none !important' },
    '.cm-faust-prompt.cm-faust-prompt-busy': { borderColor: 'var(--accent-line)' },
    '.cm-faust-prompt-field': {
      display: 'block',
      width: '100%',
      boxSizing: 'border-box',
      margin: '6px 0',
      padding: '6px 8px',
      resize: 'none',
      background: 'transparent',
      color: 'var(--text)',
      border: '1px solid var(--border)',
      borderRadius: '3px',
      font: 'var(--type-input)'
    },
    '.cm-faust-prompt-field:focus': { outline: 'none', borderColor: 'var(--accent-line)' },
    '.cm-faust-prompt-field[aria-invalid="true"]': { borderColor: 'var(--error)' },
    '.cm-faust-prompt-field::placeholder': { color: 'var(--text-3)' },
    // The prompt's own controls; the context row in its slot keeps the look of its component classes
    '.cm-faust-prompt button:not(:where(.cm-faust-prompt-context *)), .cm-faust-prompt select:not(:where(.cm-faust-prompt-context *)), .cm-faust-prompt input:not(:where(.cm-faust-prompt-context *))': {
      font: 'inherit',
      color: 'var(--text)',
      background: 'transparent',
      border: '1px solid var(--border)',
      borderRadius: '3px',
      padding: '3px 8px'
    },
    '.cm-faust-prompt button:not(:where(.cm-faust-prompt-context *))': { cursor: 'pointer' },
    '.cm-faust-prompt button:not(:where(.cm-faust-prompt-context *)):hover': { borderColor: 'var(--accent-line)' },
    '.cm-faust-prompt button:not(:where(.cm-faust-prompt-context *)):disabled': { color: 'var(--text-3)', cursor: 'default', borderColor: 'var(--border)' },
    '.cm-faust-prompt button.cm-faust-prompt-primary': { borderColor: 'var(--accent-line)', color: 'var(--accent-text)' },
    '.cm-faust-prompt button.cm-faust-prompt-link': {
      border: 'none',
      padding: '0',
      color: 'var(--text-2)',
      textDecoration: 'underline'
    },
    '.cm-faust-prompt-chips, .cm-faust-prompt-saved, .cm-faust-prompt-actions, .cm-faust-prompt-attempts, .cm-faust-prompt-picker': {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '6px',
      margin: '6px 0'
    },
    // Hylkää muutokset · Hyväksy muutokset: one group at the end of the row, also when it wraps
    '.cm-faust-prompt-decide': { display: 'inline-flex', gap: '6px', marginLeft: 'auto' },
    '.cm-faust-prompt-own': { display: 'inline-flex', gap: '2px' },
    '.cm-faust-prompt-caption, .cm-faust-prompt-keys, .cm-faust-prompt-hint, .cm-faust-prompt-model': { color: 'var(--text-3)' },
    '.cm-faust-prompt-length, .cm-faust-prompt-picker label': { display: 'inline-flex', alignItems: 'center', gap: '6px' },
    '.cm-faust-prompt-summary, .cm-faust-prompt-instruction': { color: 'var(--text-2)' },
    '.cm-faust-prompt-note, .cm-faust-prompt-status': { color: 'var(--text-2)', margin: '4px 0' },
    '.cm-faust-prompt-error, .cm-faust-prompt-blocked': { color: 'var(--error)', margin: '4px 0' },
    '.cm-faust-prompt-preview, .cm-faust-prompt-detail': {
      maxHeight: '9em',
      overflow: 'auto',
      whiteSpace: 'pre-wrap',
      margin: '6px 0',
      padding: '6px 8px',
      color: 'var(--text-2)',
      border: '1px solid var(--border)',
      borderRadius: '3px',
      font: 'var(--type-serif)'
    },
    '.cm-faust-prompt-foot': {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: '8px',
      marginTop: '6px'
    },
    '.cm-faust-prompt-foot .cm-faust-prompt-model': { marginRight: 'auto' }
  });

  /**
   * The extension. `host` is a function, so the editor can be created before
   * the controller exists and always reaches the current one.
   * @param {{ host: () => ({ handle(intent: object, view: object): void } | null) }} config
   */
  function inlinePrompt(config = {}) {
    const { host } = config;
    // A host error must not reach CodeMirror: thrown from the tooltip's update
    // or destroy it crashes the tooltip plugin, and no prompt is drawn again
    const send = (view, intent) => {
      try {
        const target = hostOf(host);
        if (target) target.handle(intent, view);
      } catch (error) {
        console.error('Inline prompt: the host failed on', intent && intent.type, error);
      }
    };

    // One function per extension instance: CodeMirror keeps the same tooltip
    // DOM for as long as the tooltip's `create` stays the same, also when the
    // target moves.
    const create = (view) => {
      const doc = view.dom.ownerDocument;
      const promptView = createPromptView(doc, { onIntent: (intent) => send(view, intent) });
      let shown = null;
      let tickTimer = null;

      const draw = (ui) => {
        if (!ui || ui === shown) return;
        shown = ui;
        promptView.render(ui);
        promptView.dom.classList.toggle('cm-faust-prompt-busy', ui.phase === 'sending');
      };

      const entry = { promptView, closing: false };
      live.set(view, entry);
      const first = view.state.field(promptField, false);
      draw(first && first.ui);

      // A result makes the prompt and its target taller (the marks of the suggestions) and brings
      // the suggestion bar into the dock: a prompt below its target gets the room again, by the
      // same rule as when it opened. Above the target it stays where it is.
      let lastPhase = first && first.ui ? first.ui.phase : null;
      const roomKey = {};
      const roomAgain = () => view.requestMeasure({
        key: roomKey,
        read(current) {
          const value = current.state.field(promptField, false);
          const range = value ? rangeOf(current.state, value.rangeId) : null;
          if (!range || !promptView.dom.isConnected || promptView.dom.classList.contains('cm-tooltip-above')) return 0;
          // The whole content, also the part a capped prompt scrolls inside itself
          const dom = promptView.dom;
          return roomDelta(current, range, Math.max(dom.getBoundingClientRect().height, dom.scrollHeight || 0));
        },
        write(delta, current) {
          if (delta > 0) current.scrollDOM.scrollTop += delta;
        }
      });

      // The "Mitä malli näkee" row grows when the author opens its list (Muuta): the text gives the
      // prompt room again, as far as it can scroll, so the list is not squeezed to one row above the foot
      const ownerWindow = doc.defaultView;
      const slotWatch = ownerWindow && typeof ownerWindow.ResizeObserver === 'function'
        ? new ownerWindow.ResizeObserver(() => { if (promptView.dom.isConnected) roomAgain(); })
        : null;
      if (slotWatch) slotWatch.observe(promptView.contextSlot);

      return {
        dom: promptView.dom,
        resize: false,
        overlap: true,
        // Once, when the prompt opens: the author starts typing the instruction
        mount() {
          promptView.focus();
        },
        getCoords: (pos) => anchorRect(view, pos),
        // After CodeMirror has placed it (below, or flipped above): the room on that side caps
        // the prompt's height, so it never runs past the window and its controls stay reachable
        positioned(space) {
          const dom = promptView.dom;
          if (!dom.isConnected || !space) return;
          const rect = dom.getBoundingClientRect();
          const above = dom.classList.contains('cm-tooltip-above');
          const room = Math.floor(above ? rect.bottom - space.top - ROOM_GAP : space.bottom - rect.top - ROOM_GAP);
          const value = `${Math.max(MIN_ROOM, Number.isFinite(room) ? room : MIN_ROOM)}px`;
          if (dom.style.getPropertyValue(ROOM_PROPERTY) !== value) dom.style.setProperty(ROOM_PROPERTY, value);
          // The whole content, also the part scrolled inside a capped prompt
          const natural = Math.max(rect.height, dom.scrollHeight || 0);
          if (natural > 0) expectedHeight = Math.min(HEIGHT_ESTIMATE_MAX, Math.round(natural));
        },
        update(update) {
          const value = update.state.field(promptField, false);
          if (!value) return;
          draw(value.ui);
          const phase = value.ui ? value.ui.phase : null;
          if (phase === 'result' && lastPhase !== 'result') roomAgain();
          lastPhase = phase;
          // The controller closes the prompt when the last suggestion of the
          // attempt is decided. It may dispatch, and a view cannot be
          // dispatched to during its own update: ask after it.
          if (value.ui && value.ui.phase === 'result' && update.transactions.length > 0 && tickTimer === null) {
            tickTimer = setTimeout(() => {
              tickTimer = null;
              if (live.get(view) === entry && view.state.field(promptField, false)) send(view, { type: 'tick' });
            }, 0);
          }
        },
        destroy() {
          if (slotWatch) slotWatch.disconnect();
          if (tickTimer !== null) clearTimeout(tickTimer);
          tickTimer = null;
          const hadFocus = entry.focused === true;
          if (live.get(view) === entry) live.delete(view);
          promptView.destroy();
          send(view, { type: 'prompt-closed' });
          // Closed because its target was deleted, while the author was in the
          // field: the removed field leaves the focus on <body>, where no
          // editor key works. closePrompt handles its own case.
          if (hadFocus && !entry.closing && !entry.viewGone) {
            setTimeout(() => {
              if (entry.viewGone || !view.dom.isConnected) return;
              const active = doc.activeElement;
              if (!active || active === doc.body) view.focus();
            }, 0);
          }
        }
      };
    };

    const tooltip = showTooltip.compute([promptField, suggestionField], (state) => {
      const value = state.field(promptField, false);
      if (!value) return null;
      const range = rangeOf(state, value.rangeId);
      if (!range) return null;
      return { pos: range.to, above: false, strictSide: false, arrow: false, create };
    });

    const handlers = EditorView.domEventHandlers({
      // Escape with the focus in the manuscript. It never accepts or rejects anything.
      keydown(event, view) {
        if (event.key !== 'Escape') return false;
        const value = view.state.field(promptField, false);
        if (value) {
          event.stopPropagation();
          send(view, value.ui && value.ui.phase === 'sending' ? { type: 'cancel' } : { type: 'close', reason: 'escape' });
          return true;
        }
        const facade = view.scrollDOM;
        const block = facade && typeof facade.getInsertBlock === 'function' ? facade.getInsertBlock() : null;
        if (block && block.status === 'streaming') {
          // Stopped here, or the same key press would also close the Find bar
          event.stopPropagation();
          send(view, { type: 'block-stop' });
          return true;
        }
        return false;
      },
      // The native menu still opens (false); the host only learns where it was asked for.
      // The DOM selection is read, because macOS selects the word under the
      // pointer on a right click and the editor state learns that a task later.
      contextmenu(event, view) {
        const root = view.dom.ownerDocument;
        const selection = root.getSelection ? root.getSelection() : null;
        const hasSelection = !!(selection && !selection.isCollapsed &&
          view.contentDOM.contains(selection.anchorNode) && view.contentDOM.contains(selection.focusNode));
        send(view, { type: 'contextmenu', x: event.clientX, y: event.clientY, hasSelection });
        return false;
      }
    });

    const lifecycle = ViewPlugin.fromClass(class {
      constructor(view) {
        this.view = view;
        // A view may not be dispatched to from a plugin constructor
        this.timer = setTimeout(() => {
          this.timer = null;
          send(view, { type: 'view-ready' });
        }, 0);
      }

      update(update) {
        // Runs while the prompt's DOM is still in the document or just removed:
        // remember whether the author was typing in it
        const entry = live.get(this.view);
        if (entry) {
          const active = update.view.dom.ownerDocument.activeElement;
          entry.focused = !!active && entry.promptView.dom.contains(active);
        }
      }

      destroy() {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        const entry = live.get(this.view);
        if (entry) entry.viewGone = true;
        send(this.view, { type: 'view-destroyed' });
      }
    });

    // The lifecycle plugin comes first, so its update runs before the tooltip plugin removes the DOM
    return [promptField, lifecycle, tooltip, handlers, theme];
  }

  /**
   * Open the prompt on a captured range, or replace the one that is open.
   * @returns {boolean} false when the range does not exist (or is empty in edit mode)
   */
  function openPrompt(view, { mode, rangeId, ui } = {}) {
    const range = rangeOf(view.state, rangeId);
    const kind = mode === 'write' ? 'write' : 'edit';
    if (!range || (kind === 'edit' && range.from === range.to)) return false;
    // A new prompt: room under the target first. The same prompt on a new range stays where it is.
    if (!view.state.field(promptField, false)) makeRoom(view, range);
    view.dispatch({
      effects: [
        setPrompt.of({ mode: kind, rangeId, ui }),
        // The target's end in view (it is when the author has just selected it)
        EditorView.scrollIntoView(range.to, { y: 'nearest', yMargin: ROOM_GAP })
      ]
    });
    return true;
  }

  /** Show a new PromptState. Does nothing when no prompt is open. */
  function updatePrompt(view, ui) {
    if (!view.state.field(promptField, false)) return false;
    view.dispatch({ effects: setUi.of(ui) });
    return true;
  }

  /**
   * Close the prompt. `restore`: 'selection' selects the target again,
   * 'cursor' puts the caret at its end, 'none' leaves the selection.
   * When the focus was inside the prompt it goes back to the manuscript, in
   * all three modes: the removed tooltip would leave it on <body>, and then
   * no key bound on the editor works until the author clicks in the text.
   */
  function closePrompt(view, { restore = 'none' } = {}) {
    const value = view.state.field(promptField, false);
    if (!value) return false;

    const entry = live.get(view);
    const active = view.dom.ownerDocument.activeElement;
    const hadFocus = !!(entry && active && entry.promptView.dom.contains(active));
    if (entry) entry.closing = true;

    const range = rangeOf(view.state, value.rangeId);
    const spec = { effects: setPrompt.of(null) };
    if (range && restore === 'selection') spec.selection = { anchor: range.from, head: range.to };
    else if (range && restore === 'cursor') spec.selection = { anchor: range.to };
    view.dispatch(spec);

    if (hadFocus) view.focus();
    return true;
  }

  /** The open prompt with the current position of its target, or null. */
  function getPrompt(view) {
    const value = view.state.field(promptField, false);
    if (!value) return null;
    const range = rangeOf(view.state, value.rangeId);
    if (!range) return null;
    return { mode: value.mode, rangeId: value.rangeId, from: range.from, to: range.to, ui: value.ui };
  }

  /** Put the focus into the prompt's field. False when no prompt is open. */
  function focusPrompt(view) {
    const entry = live.get(view);
    if (!entry || !view.state.field(promptField, false)) return false;
    entry.promptView.focus();
    return true;
  }

  return { inlinePrompt, openPrompt, updatePrompt, closePrompt, getPrompt, focusPrompt };
}

module.exports = { createInlinePromptKit, scrollForRoom };

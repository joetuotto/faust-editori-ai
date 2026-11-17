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
 *
 * What the author does is reported to the host as intents:
 *   host().handle(intent, view)
 * The host is the quick-edit controller (src/services/ai/quickEdit.js).
 */

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

  const hostOf = (host) => {
    const target = typeof host === 'function' ? host() : null;
    return target && typeof target.handle === 'function' ? target : null;
  };

  const theme = EditorView.theme({
    '.cm-tooltip.cm-faust-prompt': {
      width: 'min(520px, 90vw)',
      boxSizing: 'border-box',
      padding: '10px 12px',
      background: 'var(--paper)',
      color: 'var(--text)',
      border: '1px solid var(--border-color)',
      borderRadius: '4px',
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: '11px',
      lineHeight: '1.5',
      outline: 'none'
    },
    '.cm-faust-prompt [hidden]': { display: 'none !important' },
    '.cm-faust-prompt.cm-faust-prompt-busy': { borderColor: 'var(--bronze)' },
    '.cm-faust-prompt-field': {
      display: 'block',
      width: '100%',
      boxSizing: 'border-box',
      margin: '6px 0',
      padding: '6px 8px',
      resize: 'none',
      background: 'transparent',
      color: 'var(--text)',
      border: '1px solid var(--border-color)',
      borderRadius: '3px',
      font: 'inherit',
      fontSize: '13px'
    },
    '.cm-faust-prompt-field:focus': { outline: 'none', borderColor: 'var(--bronze)' },
    '.cm-faust-prompt-field[aria-invalid="true"]': { borderColor: 'var(--error)' },
    '.cm-faust-prompt-field::placeholder': { color: 'var(--text-3)' },
    '.cm-faust-prompt button, .cm-faust-prompt select, .cm-faust-prompt input': {
      font: 'inherit',
      color: 'var(--text)',
      background: 'transparent',
      border: '1px solid var(--border-color)',
      borderRadius: '3px',
      padding: '3px 8px'
    },
    '.cm-faust-prompt button': { cursor: 'pointer' },
    '.cm-faust-prompt button:hover': { borderColor: 'var(--bronze)' },
    '.cm-faust-prompt button:disabled': { color: 'var(--text-3)', cursor: 'default', borderColor: 'var(--border-color)' },
    '.cm-faust-prompt button.cm-faust-prompt-primary': { borderColor: 'var(--bronze)', color: 'var(--sigil)' },
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
      border: '1px solid var(--border-color)',
      borderRadius: '3px',
      fontSize: '13px'
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

      return {
        dom: promptView.dom,
        resize: false,
        overlap: true,
        // Once, when the prompt opens: the author starts typing the instruction
        mount() {
          promptView.focus();
        },
        update(update) {
          const value = update.state.field(promptField, false);
          if (!value) return;
          draw(value.ui);
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
    view.dispatch({
      effects: [
        setPrompt.of({ mode: kind, rangeId, ui }),
        // Room for the prompt under the target
        EditorView.scrollIntoView(range.to, { y: 'nearest', yMargin: 220 })
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

module.exports = { createInlinePromptKit };

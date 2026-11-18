/**
 * FaustEditor - the manuscript editor (CodeMirror 6)
 *
 * Replaces the plain <textarea>. What it adds:
 *  - Markdown markers are rendered while you write (**bold**, *italic*,
 *    ~~strikethrough~~, # headings, > quotes)
 *  - content changes coming from outside the editor (AI edits, toolbar
 *    formatting, find & replace, undo) are applied as the smallest possible
 *    change, so the cursor and the scroll position stay where they were
 *  - real cursor centering for typewriter mode
 *  - scene breaks (* * *) set as a centred line; a readOnly mode for reference texts
 *
 * Its colours are not here: section 14 of styles/faust-components.css themes the editor.
 *
 * The rest of app.js was written against a textarea, so the element handed to
 * `ref` is the editor's scroll element extended with the textarea members the
 * app uses: value, selectionStart, selectionEnd, setSelectionRange(), focus(),
 * select(), plus scrollTop / clientHeight / scrollHeight / scroll events, which
 * the element has natively. Extra members: replaceRange(), scrollToPos(),
 * centerCursor(), setHighlights(), clearHighlights(), faustView.
 *
 * The suggestion layer (src/editor/suggestions.js, stage I-03) adds, except in a read-only editor:
 * captureSelection(), captureRange(), getRange(), setRangeHighlight(), releaseRange(),
 * proposeChanges(), removeSuggestions(), acceptSuggestion(), rejectSuggestion(), acceptGroup(),
 * rejectGroup(), restoreRejected(), stepSuggestion(), getSuggestions(), setSuggestionView(),
 * clearSuggestionNotice(), revealPos(), flushQueuedSuggestions(), and the insert block's
 * startInsertBlock(), appendInsertBlock(), finishInsertBlock(), retryInsertBlock(),
 * showInsertBlockAttempt(), acceptInsertBlock(), rejectInsertBlock(), getInsertBlock().
 * Nothing a model proposes is document text before it is accepted: onChange(text, meta) carries the
 * accept's undo meta, and the props suggestionSeed / onSuggestionsChange connect the editor to the
 * suggestion controller (contracts.md 4.1).
 *
 * The inline prompt (src/editor/inlinePrompt.js, stage I-05) is the Cmd+K prompt under a captured
 * range of the suggestion layer: a tooltip in the layer host. Its intents go to the prop `aiHost`
 * (the quick-edit controller, { handle(intent, view) }), read through a ref, so the editor always
 * reaches the current one; the controller reaches the view through faustView. No facade member is
 * added for it.
 *
 * Smart typing (src/editor/smartTyping.js, stage I-06, "Älykäs kirjoitus"): a typed " becomes ”, ' becomes ’
 * and -- becomes – while the prop `smartTyping` ({ enabled }) says so, read through a ref, so the switch
 * changes nothing else in the editor. The replacement is a transaction of its own after the typed
 * character: onChange reports it with { noMerge: true, source: 'smart-typing' }, so one Cmd+Z right after
 * it gives back exactly what was typed.
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */

import { EditorState, Annotation, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import {
  EditorView, keymap, placeholder as placeholderExtension,
  Decoration, MatchDecorator, ViewPlugin, tooltips
} from '@codemirror/view';
import { standardKeymap, insertNewline } from '@codemirror/commands';
import { Language, defineLanguageFacet, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { parser as markdownParser, Strikethrough } from '@lezer/markdown';
import { tags } from '@lezer/highlight';
import { continueList, TODO_PATTERN_SOURCE, UNDERLINE_PATTERN_SOURCE } from '../editor/textTools.js';
import {
  suggestionExtension, installSuggestionFacade,
  readSuggestionMeta, suggestionEvents, suggestionSnapshot, suggestionState
} from '../editor/suggestions.js';
import { wordDiff } from '../editor/wordDiff.js';
import { inlinePrompt } from '../editor/inlinePrompt.js';
import { smartTyping, SmartTyping } from '../editor/smartTyping.js';
import { modelLabel } from '../services/format.fi.js';

const { createElement: e, useRef, useLayoutEffect, forwardRef } = React;

// The manuscript faces of Tietopaneeli ▸ Ulkoasu ▸ Fontti, in the order of that select: the key is
// the stored setting and the option's text, `stack` the family the editor is set in, `face` the
// width of the face relative to EB Garamond (V 2.2, measured on Finnish prose). The page element
// carries `face` as --measure-face beside --ms-size, so every face holds the same number of
// characters per line.
export const MANUSCRIPT_FONTS = {
  'EB Garamond': { stack: 'var(--font-serif)', face: 1 },
  'Georgia': { stack: 'Georgia, "Times New Roman", serif', face: 1.15 },
  'SF Pro': { stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif', face: 1.15 },
  'Times': { stack: '"Times New Roman", Times, serif', face: 1.05 },
  'Palatino': { stack: 'Palatino, "Palatino Linotype", "Book Antiqua", serif', face: 1.15 },
  'Courier': { stack: '"Courier Prime", "Courier New", Courier, monospace', face: 1.6 }
};

// Marks a transaction that mirrors a change made elsewhere in the app
const External = Annotation.define();

// Prose-friendly Markdown: no indented code blocks (authors indent paragraphs)
// and no "text + --- line = heading" rule (--- is a scene break).
const proseMarkdown = new Language(
  defineLanguageFacet({}),
  markdownParser.configure([Strikethrough, { remove: ['IndentedCode', 'SetextHeading'] }]),
  [],
  'markdown'
);

// Headings in em of the manuscript size, so they follow the zoom: a large heading is set by its
// size at the display weight, heading 3 and below keep the title weight. Links carry no
// underline: the parser reads any bracketed text as a link, a [TODO: …] note included.
const proseHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.556em', fontWeight: 'var(--w-serif-display)', lineHeight: '1.25', letterSpacing: '-0.01em' },
  { tag: tags.heading2, fontSize: '1.278em', fontWeight: 'var(--w-serif-display)', lineHeight: '1.3' },
  { tag: tags.heading3, fontSize: '1.111em', fontWeight: 'var(--w-serif-title)', lineHeight: '1.4' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: 'var(--w-serif-title)' },
  { tag: tags.strong, fontWeight: 'var(--w-serif-bold)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.quote, fontStyle: 'italic' },
  // The markers themselves (**, #, >, ***) stay visible but step back: dimmed, regular, upright
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.url], color: 'var(--text-3)', fontWeight: '400', fontStyle: 'normal' }
]);

// --- Search highlights: set from outside with setHighlights(), follow edits ---

const setHighlightsEffect = StateEffect.define();
const matchMark = Decoration.mark({ class: 'cm-faust-match' });
const currentMatchMark = Decoration.mark({ class: 'cm-faust-match-current' });

const highlightField = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setHighlightsEffect)) continue;
      const { ranges, current } = effect.value;
      const length = transaction.state.doc.length;
      const marks = ranges
        .map((range, index) => ({ from: Math.min(range.start, length), to: Math.min(range.end, length), index }))
        .filter(range => range.to > range.from)
        .sort((a, b) => a.from - b.from)
        .map(range => (range.index === current ? currentMatchMark : matchMark).range(range.from, range.to));
      next = Decoration.set(marks, true);
    }
    return next;
  },
  provide: field => EditorView.decorations.from(field)
});

// --- Markers Markdown has no syntax for: <u>underline</u> and [TODO: notes] ---
// The two patterns come from textTools.js, the one source that the modules' own copies are tested against

const underlineMark = Decoration.mark({ class: 'cm-faust-underline' });
const tagMark = Decoration.mark({ class: 'cm-faust-tag' });
const todoMark = Decoration.mark({ class: 'cm-faust-todo' });

function decoratorPlugin(decorator) {
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = decorator.createDeco(view); }
    update(update) { this.decorations = decorator.updateDeco(update, this.decorations); }
  }, { decorations: plugin => plugin.decorations });
}

const underlinePlugin = decoratorPlugin(new MatchDecorator({
  regexp: new RegExp(UNDERLINE_PATTERN_SOURCE, 'g'),
  decorate: (add, from, to) => {
    add(from, from + 3, tagMark);
    add(from + 3, to - 4, underlineMark);
    add(to - 4, to, tagMark);
  }
}));

const todoPlugin = decoratorPlugin(new MatchDecorator({
  regexp: new RegExp(TODO_PATTERN_SOURCE, 'g'),
  decoration: todoMark
}));

// --- The settled flash: text an accept has just put in fades from the strong insertion tint (VF-12) ---
// Outside the suggestion core on purpose: it is a look, not a state of the suggestions.

const setSettled = StateEffect.define();
const settledMark = Decoration.mark({ class: 'faust-mark faust-mark--settled' });
const SETTLE_MS = 1200;

const settledField = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setSettled)) next = Decoration.set(effect.value.map(range => settledMark.range(range.from, range.to)), true);
    }
    return next;
  },
  provide: field => EditorView.decorations.from(field)
});

const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Scene break: a line that holds only * * *, *** or --- is set centred and dimmed ---

const SCENE_BREAK = /^\s*([*\-_])(?:\s*\1){2,}\s*$/;
const sceneBreakLine = Decoration.line({ class: 'cm-faust-scenebreak' });

function sceneBreakDecorations(view) {
  const builder = new RangeSetBuilder();
  let lastLine = -1;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      if (line.number > lastLine && SCENE_BREAK.test(line.text)) builder.add(line.from, line.from, sceneBreakLine);
      lastLine = line.number;
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const sceneBreakPlugin = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = sceneBreakDecorations(view); }
  update(update) {
    if (update.docChanged || update.viewportChanged) this.decorations = sceneBreakDecorations(update.view);
  }
}, { decorations: plugin => plugin.decorations });

// Enter in a list or quote continues it; on an empty item it ends it
function continueListOnEnter(view) {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const line = view.state.doc.lineAt(selection.head);
  const edit = continueList(line.text, selection.head - line.from);
  if (!edit) return false;

  view.dispatch({
    changes: { from: line.from, to: line.to, insert: edit.text },
    selection: { anchor: line.from + edit.selStart },
    scrollIntoView: true,
    userEvent: 'input'
  });
  return true;
}

// Layout only. Colours, the caret, the search hits, the TODO chip, the dimmed tags and the
// placeholder come from section 14 of styles/faust-components.css (.faust-editor-host .cm-editor …),
// so they follow the theme; the selectors stay here as the editor's own list of its classes.
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    background: 'transparent',
    color: 'inherit'
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: 'inherit',
    overflow: 'auto'
  },
  '.cm-content': {
    padding: 'var(--fe-pad-top, 0px) 0 var(--fe-pad-bottom, 0px) var(--fe-pad-left, 0px)',
    cursor: 'text'
  },
  '.cm-line': {
    // Each line is a paragraph: the gap below it is the paragraph spacing
    padding: '0 0 var(--fe-para-gap, 0px) 0',
    textAlign: 'var(--fe-align, left)'
  },
  '.cm-placeholder': {},
  '.cm-faust-match': {},
  '.cm-faust-match-current': {},
  '.cm-faust-underline': {
    textDecoration: 'underline'
  },
  '.cm-faust-tag': {},
  '.cm-faust-todo': {},
  '.cm-faust-scenebreak': {}
});

const normalizeNewlines = (text) => (text || '').replace(/\r\n?/g, '\n');

const clamp = (n, max) => Math.max(0, Math.min(Number.isFinite(n) ? n : 0, max));

// Give the scroll element the textarea members the app relies on; withSuggestions adds the members
// of the suggestion layer (not in a read-only editor)
function installTextareaFacade(view, withSuggestions) {
  const el = view.scrollDOM;
  const docLength = () => view.state.doc.length;

  const setSelection = (start, end, scroll = true) => {
    const anchor = clamp(start, docLength());
    const head = clamp(end === undefined ? start : end, docLength());
    view.dispatch({ selection: { anchor, head }, scrollIntoView: scroll });
  };

  Object.defineProperties(el, {
    value: {
      configurable: true,
      get: () => view.state.doc.toString(),
      set: (text) => {
        view.dispatch({ changes: { from: 0, to: docLength(), insert: normalizeNewlines(text) } });
      }
    },
    selectionStart: {
      configurable: true,
      get: () => view.state.selection.main.from,
      set: (pos) => setSelection(pos, Math.max(pos, view.state.selection.main.to), false)
    },
    selectionEnd: {
      configurable: true,
      get: () => view.state.selection.main.to,
      set: (pos) => setSelection(Math.min(pos, view.state.selection.main.from), pos, false)
    }
  });

  el.setSelectionRange = (start, end) => setSelection(start, end, true);
  el.select = () => setSelection(0, docLength(), false);
  el.focus = () => view.focus();

  // Replace a range as one change; the cursor ends up after the inserted text
  el.replaceRange = (from, to, text) => {
    const start = clamp(from, docLength());
    const stop = clamp(to, docLength());
    const insert = normalizeNewlines(text);
    view.dispatch({
      changes: { from: start, to: stop, insert },
      selection: { anchor: start + insert.length },
      scrollIntoView: true
    });
  };

  // Scroll a document position into the middle of the editor; with topMargin (px), to that distance
  // under the editor's top edge instead (a hit kept clear of a popover lying over the pane's upper part)
  el.scrollToPos = (pos, topMargin) => {
    const target = clamp(pos, docLength());
    view.dispatch({
      effects: EditorView.scrollIntoView(target, typeof topMargin === 'number'
        ? { y: 'start', yMargin: topMargin }
        : { y: 'center' })
    });
  };

  el.centerCursor = () => el.scrollToPos(view.state.selection.main.head);

  // Mark search matches ([{ start, end }]); `current` is the index of the active one
  el.setHighlights = (ranges, current = -1) => {
    view.dispatch({ effects: setHighlightsEffect.of({ ranges: ranges || [], current }) });
  };
  el.clearHighlights = () => el.setHighlights([], -1);

  if (withSuggestions) installSuggestionFacade(view, el);
  el.faustView = view;
  return el;
}

function setRef(ref, value) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

export const FaustEditor = forwardRef(function FaustEditor(props, ref) {
  const {
    value,
    onChange,
    placeholder,
    typewriterMode,
    style,
    className,
    onMouseUp,
    onKeyUp,
    onClick,
    // A reference text that cannot be edited (the second pane, a preview). Read once, when the
    // editor is created: change it by remounting with a new key. A read-only editor has no
    // suggestion layer and sends no suggestion event.
    readOnly = false,
    // From the suggestion controller (controller.editorProps(chapterId)): the chapter's stored
    // suggestions when the editor mounts, and every change of them
    suggestionSeed,
    onSuggestionsChange,
    // The quick-edit controller ({ handle(intent, view) }) that the inline prompt reports to (I-05)
    aiHost,
    // Smart typing ({ enabled }): " → ”, ' → ’, -- → – while typing (I-06)
    smartTyping: smartTypingOptions,
    // The text's accessible name; a read-only text is never spell-checked
    label = 'Käsikirjoitus'
  } = props;

  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onSuggestionsRef = useRef(onSuggestionsChange);
  const aiHostRef = useRef(aiHost);
  const typewriterRef = useRef(!!typewriterMode);
  const smartTypingRef = useRef(null);
  // Texts this editor has reported through onChange and not yet seen come back as `value`
  const pendingRef = useRef([]);
  const centerFrameRef = useRef(0);
  const settleTimerRef = useRef(0);

  onChangeRef.current = onChange;
  onSuggestionsRef.current = onSuggestionsChange;
  aiHostRef.current = aiHost;
  typewriterRef.current = !!typewriterMode;
  // Read at every typed character, so the switch takes effect without rebuilding the editor
  smartTypingRef.current = smartTypingOptions || null;

  // Create the editor once per mount (the parent remounts it per chapter with `key`)
  useLayoutEffect(() => {
    const scheduleCenter = (view) => {
      cancelAnimationFrame(centerFrameRef.current);
      centerFrameRef.current = requestAnimationFrame(() => {
        if (viewRef.current !== view) return;
        view.dispatch({
          effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' })
        });
      });
    };

    // The text that was just put in by an accept flashes once (skipped under reduced motion)
    const settle = (update) => {
      const view = update.view;
      if (reducedMotion() || view.state.doc !== update.state.doc) return;
      const ranges = [];
      update.changes.iterChangedRanges((fromA, toA, fromB, toB) => { if (toB > fromB) ranges.push({ from: fromB, to: toB }); });
      if (!ranges.length) return;
      clearTimeout(settleTimerRef.current);
      view.dispatch({ effects: setSettled.of(ranges) });
      settleTimerRef.current = setTimeout(() => {
        if (viewRef.current === view) view.dispatch({ effects: setSettled.of([]) });
      }, SETTLE_MS);
    };

    const doc = normalizeNewlines(value);
    // The chapter's suggestions as the controller kept them, already moved onto this text
    const seed = !readOnly && suggestionSeed ? suggestionSeed(doc) : null;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc,
        // Writing aids go inside the three readOnly spreads below, never outside them: a read-only
        // editor keeps only the Markdown, the marks, the scene breaks, the tooltips and the theme.
        extensions: [
          ...(readOnly ? [] : [         // typing aids go here, before the keymap
            smartTyping(() => smartTypingRef.current)
          ]),
          keymap.of([
            { key: 'Enter', run: continueListOnEnter },
            { key: 'Enter', run: insertNewline },
            ...standardKeymap
          ]),
          EditorView.lineWrapping,
          proseMarkdown,
          syntaxHighlighting(proseHighlight),
          highlightField,
          ...(readOnly ? [] : [         // suggestion and review marks go here
            suggestionExtension({ external: External, diff: (a, b) => wordDiff(a, b, { raw: true }), seed: seed && seed.state, modelLabel }),
            settledField
          ]),
          underlinePlugin,
          todoPlugin,
          ...(readOnly ? [] : [         // story-folder mentions and the inline prompt go here
            inlinePrompt({ host: () => aiHostRef.current })
          ]),
          placeholderExtension(placeholder || ''),
          sceneBreakPlugin,
          // Spell checking is switched on and off for the whole window (Työkalut → Oikoluku)
          // A read-only reference text has its own name (label) and no spelling marks (lead, 18 Nov 2026)
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: readOnly ? 'false' : 'true' }),
          // The page is a size container that clips: tooltips (the inline prompt) render in the layer host
          tooltips({ parent: document.querySelector('.faust-layer') }),
          editorTheme,
          ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
          EditorView.updateListener.of((update) => {
            const external = update.transactions.some(tr => tr.annotation(External));

            // onChange first: the undo step of an accept exists before the controller logs it.
            // A smart-typing replacement is an undo step of its own (the typed character was the one before)
            if (update.docChanged && !external) {
              const text = update.state.doc.toString();
              pendingRef.current.push(text);
              if (pendingRef.current.length > 20) pendingRef.current.shift();
              const smart = update.transactions.some(tr => tr.annotation(SmartTyping) !== undefined);
              if (onChangeRef.current) onChangeRef.current(text, smart ? { noMerge: true, source: 'smart-typing' } : readSuggestionMeta(update));
            }

            if (!readOnly) {
              const events = suggestionEvents(update);
              if (events.length && onSuggestionsRef.current) {
                for (const event of events) onSuggestionsRef.current(suggestionSnapshot(update.view.state), event);
              }
              // Last: the flush may dispatch a nested update, whose snapshot is the newer one
              if (update.docChanged) update.view.scrollDOM.flushQueuedSuggestions(external);
              if (events.some(event => event.type === 'accepted')) settle(update);
            }

            if (typewriterRef.current && update.view.hasFocus && (update.docChanged || update.selectionSet)) {
              scheduleCenter(update.view);
            }
          })
        ]
      })
    });

    viewRef.current = view;
    setRef(ref, installTextareaFacade(view, !readOnly));

    if (!readOnly) {
      // Undo and redo of a step in this chapter show where the text changed
      if (seed && seed.revealPos != null) {
        const at = clamp(seed.revealPos, view.state.doc.length);
        view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) });
      }
      // Always once, so the bar shows this chapter's state (restored suggestions, a notice, or nothing)
      if (onSuggestionsRef.current) onSuggestionsRef.current(suggestionSnapshot(view.state), { type: 'seeded' });
    }

    return () => {
      // The controller keeps what is still pending in this chapter until it is opened again
      if (!readOnly && onSuggestionsRef.current) {
        onSuggestionsRef.current(suggestionSnapshot(view.state), {
          type: 'unmount', docText: view.state.doc.toString(), state: suggestionState(view.state)
        });
      }
      clearTimeout(settleTimerRef.current);
      cancelAnimationFrame(centerFrameRef.current);
      setRef(ref, null);
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  // Mirror content changes that were made outside the editor
  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const incoming = normalizeNewlines(value);
    const current = view.state.doc.toString();

    if (incoming === current) {
      pendingRef.current = [];
      // A proposal waiting for this text (undo of an accept) is applied now
      if (typeof view.scrollDOM.flushQueuedSuggestions === 'function') view.scrollDOM.flushQueuedSuggestions(true);
      return;
    }

    // An older text of our own arriving late (the user is typing faster than
    // React re-renders): the editor is already ahead, leave it alone
    const echoed = pendingRef.current.lastIndexOf(incoming);
    if (echoed !== -1) {
      pendingRef.current = pendingRef.current.slice(echoed + 1);
      return;
    }
    pendingRef.current = [];

    // Smallest change that turns `current` into `incoming`
    let start = 0;
    const shortest = Math.min(current.length, incoming.length);
    while (start < shortest && current.charCodeAt(start) === incoming.charCodeAt(start)) start++;

    let currentEnd = current.length;
    let incomingEnd = incoming.length;
    while (
      currentEnd > start && incomingEnd > start &&
      current.charCodeAt(currentEnd - 1) === incoming.charCodeAt(incomingEnd - 1)
    ) {
      currentEnd--;
      incomingEnd--;
    }

    view.dispatch({
      changes: { from: start, to: currentEnd, insert: incoming.slice(start, incomingEnd) },
      annotations: External.of(true)
    });
  }, [value]);

  const { paddingTop, paddingBottom, paddingLeft, textAlign, paragraphGap, ...wrapperStyle } = style || {};

  return e('div', {
    className: ['faust-editor-host', className].filter(Boolean).join(' '),
    onMouseUp,
    onKeyUp,
    onClick,
    style: {
      position: 'relative',
      minHeight: 0,
      ...wrapperStyle,
      '--fe-pad-top': paddingTop || '0px',
      '--fe-pad-bottom': paddingBottom || '0px',
      '--fe-pad-left': paddingLeft || '0px',
      '--fe-align': textAlign || 'left',
      '--fe-para-gap': paragraphGap || '0px'
    }
  },
    e('div', { ref: hostRef, style: { position: 'absolute', inset: 0 } })
  );
});

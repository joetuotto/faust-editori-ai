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
 *
 * The rest of app.js was written against a textarea, so the element handed to
 * `ref` is the editor's scroll element extended with the textarea members the
 * app uses: value, selectionStart, selectionEnd, setSelectionRange(), focus(),
 * select(), plus scrollTop / clientHeight / scrollHeight / scroll events, which
 * the element has natively. Extra members: replaceRange(), scrollToPos(),
 * centerCursor(), faustView.
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */

import { EditorState, Annotation } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view';
import { standardKeymap, insertNewline } from '@codemirror/commands';
import { Language, defineLanguageFacet, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { parser as markdownParser, Strikethrough } from '@lezer/markdown';
import { tags } from '@lezer/highlight';

const { createElement: e, useRef, useLayoutEffect, forwardRef } = React;

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

const proseHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.6em', fontWeight: '600', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.35em', fontWeight: '600', lineHeight: '1.3' },
  { tag: tags.heading3, fontSize: '1.15em', fontWeight: '600' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '600' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.quote, fontStyle: 'italic' },
  { tag: tags.link, textDecoration: 'underline' },
  // The markers themselves (**, #, >, ***) stay visible but step back
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.url], color: 'var(--text-3, rgba(128,128,128,0.8))', fontWeight: '400' }
]);

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
    caretColor: 'var(--text, currentColor)',
    cursor: 'text'
  },
  '.cm-line': {
    padding: '0',
    textAlign: 'var(--fe-align, left)'
  },
  '.cm-placeholder': {
    color: 'var(--text-3, rgba(128,128,128,0.6))'
  }
});

const normalizeNewlines = (text) => (text || '').replace(/\r\n?/g, '\n');

const clamp = (n, max) => Math.max(0, Math.min(Number.isFinite(n) ? n : 0, max));

// Give the scroll element the textarea members the app relies on
function installTextareaFacade(view) {
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

  // Scroll a document position into the middle of the editor
  el.scrollToPos = (pos) => {
    view.dispatch({ effects: EditorView.scrollIntoView(clamp(pos, docLength()), { y: 'center' }) });
  };

  el.centerCursor = () => el.scrollToPos(view.state.selection.main.head);

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
    onClick
  } = props;

  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const typewriterRef = useRef(!!typewriterMode);
  // Texts this editor has reported through onChange and not yet seen come back as `value`
  const pendingRef = useRef([]);
  const centerFrameRef = useRef(0);

  onChangeRef.current = onChange;
  typewriterRef.current = !!typewriterMode;

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

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: normalizeNewlines(value),
        extensions: [
          keymap.of([{ key: 'Enter', run: insertNewline }, ...standardKeymap]),
          EditorView.lineWrapping,
          proseMarkdown,
          syntaxHighlighting(proseHighlight),
          placeholderExtension(placeholder || ''),
          EditorView.contentAttributes.of({ 'aria-label': 'Käsikirjoitus', spellcheck: 'false' }),
          editorTheme,
          EditorView.updateListener.of((update) => {
            const external = update.transactions.some(tr => tr.annotation(External));

            if (update.docChanged && !external) {
              const text = update.state.doc.toString();
              pendingRef.current.push(text);
              if (pendingRef.current.length > 20) pendingRef.current.shift();
              if (onChangeRef.current) onChangeRef.current(text);
            }

            if (typewriterRef.current && update.view.hasFocus && (update.docChanged || update.selectionSet)) {
              scheduleCenter(update.view);
            }
          })
        ]
      })
    });

    viewRef.current = view;
    setRef(ref, installTextareaFacade(view));

    return () => {
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

  const { paddingTop, paddingBottom, paddingLeft, textAlign, ...wrapperStyle } = style || {};

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
      '--fe-align': textAlign || 'left'
    }
  },
    e('div', { ref: hostRef, style: { position: 'absolute', inset: 0 } })
  );
});

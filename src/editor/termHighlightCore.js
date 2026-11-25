/**
 * Term highlight for the manuscript editor (editor core)
 *
 * Marks the words of the avoid list and underlines the mentions of
 * Tarinakansio entries. Both lists change while the editor is open, so the
 * compiled lists live in a state field that an effect replaces: no
 * compartment is needed and the document is never touched. An effects-only
 * transaction does not count as a document change, so onChange, undo and the
 * typewriter centring are not triggered.
 *
 * This file never loads CodeMirror itself: a second copy of the editor state
 * package in the bundle breaks the editor at run time. The classes arrive as
 * the argument of the factory; the ESM shell termHighlight.js imports them
 * and calls it once (test/editor/termHighlight.view.test.js runs it with a
 * real editor view).
 */

const { compileTerms, findTermMatches, todoRanges } = require('./termMatch.js');
const { prepareEntries, matchPrepared } = require('../services/story/codex.js');

const AVOID_CLASS = 'cm-faust-avoid';
const MENTION_CLASS = 'cm-faust-mention';
const ENTRY_ATTRIBUTE = 'data-codex-id';

const HINT_MAC = '⌘-klikkaus avaa kohteen.';
const HINT_OTHER = 'Ctrl-klikkaus avaa kohteen.';

// Cmd on macOS, Ctrl elsewhere. The platform is asked from the window the
// editor lives in, so this file touches the DOM only through the view.
function isMac(view) {
  const ownerDocument = view && view.dom ? view.dom.ownerDocument : null;
  const ownerWindow = ownerDocument ? ownerDocument.defaultView : null;
  const platform = ownerWindow && ownerWindow.navigator ? ownerWindow.navigator.platform : '';
  return /Mac|iPhone|iPad|iPod/.test(platform || '');
}

/**
 * @param {object} cm { StateField, StateEffect, Decoration, ViewPlugin, EditorView }
 * @returns {{ setTermHighlightConfig, termHighlight }}
 */
function createTermHighlightKit(cm) {
  const { StateField, StateEffect, Decoration, ViewPlugin, EditorView } = cm;

  // Effect value: { avoid: string[], codex: Entry[] } or null
  const setTermHighlightConfig = StateEffect.define();

  // A term's pattern is cut at word boundaries, so the line of a mark never starts or ends on white space.
  // `trimAtWrap` asks the wrap gaps (wrapGapsCore.js) to keep it off the space at a soft wrap as well, where
  // a term of several words goes on to the next visual line.
  const avoidMark = Decoration.mark({ class: AVOID_CLASS, trimAtWrap: true });

  // null or empty lists compile to nothing to draw
  function compileConfig(config) {
    const avoid = compileTerms(config && Array.isArray(config.avoid) ? config.avoid : []);
    const prepared = prepareEntries(config && Array.isArray(config.codex) ? config.codex : []);
    const hasMentions = prepared.some(entry => entry.terms.pattern !== null);
    return { avoid, prepared, hasMentions, marksByHint: new Map() };
  }

  // One mark per entry: the tooltip and the id are the same for all its
  // mentions. Made on first use, because the hint depends on the platform.
  function mentionMarks(config, hint) {
    let marks = config.marksByHint.get(hint);
    if (!marks) {
      marks = new Map();
      for (const entry of config.prepared) {
        if (!entry.terms.pattern) continue;
        marks.set(entry.id, Decoration.mark({
          class: MENTION_CLASS,
          attributes: { [ENTRY_ATTRIBUTE]: String(entry.id), title: `${entry.label}. ${hint}` },
          trimAtWrap: true
        }));
      }
      config.marksByHint.set(hint, marks);
    }
    return marks;
  }

  const configField = StateField.define({
    create: () => compileConfig(null),
    update(value, transaction) {
      let next = value;
      for (const effect of transaction.effects) {
        if (effect.is(setTermHighlightConfig)) next = compileConfig(effect.value);
      }
      return next;
    }
  });

  // The visible ranges widened to whole lines, merged where they then touch
  function visibleLineRanges(view) {
    const doc = view.state.doc;
    const ranges = [];
    for (const visible of view.visibleRanges) {
      const from = doc.lineAt(visible.from).from;
      const to = doc.lineAt(visible.to).to;
      const last = ranges[ranges.length - 1];
      if (last && from <= last.to) last.to = Math.max(last.to, to);
      else ranges.push({ from, to });
    }
    return ranges;
  }

  // Cost follows the screen, not the chapter: only visible text is searched
  function buildDecorations(view) {
    const config = view.state.field(configField, false);
    if (!config || (!config.avoid.pattern && !config.hasMentions)) return Decoration.none;

    const entryMarks = config.hasMentions ? mentionMarks(config, isMac(view) ? HINT_MAC : HINT_OTHER) : null;
    const marks = [];
    for (const { from, to } of visibleLineRanges(view)) {
      const text = view.state.doc.sliceString(from, to);
      if (!text) continue;

      if (config.avoid.pattern) {
        for (const match of findTermMatches(text, config.avoid, { skip: todoRanges(text) })) {
          marks.push(avoidMark.range(from + match.start, from + match.end));
        }
      }
      if (entryMarks) {
        for (const match of matchPrepared(text, config.prepared).matches) {
          const mark = entryMarks.get(match.entryId);
          if (mark) marks.push(mark.range(from + match.start, from + match.end));
        }
      }
    }
    return marks.length > 0 ? Decoration.set(marks, true) : Decoration.none;
  }

  const highlightPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }

    update(update) {
      const configChanged = update.startState.field(configField, false) !== update.state.field(configField, false);
      if (update.docChanged || update.viewportChanged || configChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  }, { decorations: plugin => plugin.decorations });

  // Role tokens only (styles/faust-tokens.css). An avoid-word is a dashed line, never a fill;
  // the binding block of styles/faust-components.css outranks these rules.
  const theme = EditorView.baseTheme({
    [`.${AVOID_CLASS}`]: { textDecoration: 'underline dashed var(--hl-avoid-line)' },
    [`.${MENTION_CLASS}`]: {
      textDecoration: 'underline dotted',
      textDecorationColor: 'var(--border-control)',
      textUnderlineOffset: '3px'
    }
  });

  /**
   * The extension. callbacks: { onMentionClick?(entryId) }, read at click time.
   * @param {{ avoid: string[], codex: object[] } | null} initialConfig
   */
  function termHighlight(initialConfig, callbacks = {}) {
    const openOnClick = EditorView.domEventHandlers({
      mousedown(event, editorView) {
        const modifier = isMac(editorView) ? event.metaKey : event.ctrlKey;
        if (!modifier || !callbacks || typeof callbacks.onMentionClick !== 'function') return false;

        const target = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
        const mention = target && typeof target.closest === 'function' ? target.closest(`[${ENTRY_ATTRIBUTE}]`) : null;
        if (!mention) return false;

        callbacks.onMentionClick(mention.getAttribute(ENTRY_ATTRIBUTE));
        return true;
      }
    });

    return [
      configField.init(() => compileConfig(initialConfig || null)),
      highlightPlugin,
      openOnClick,
      theme
    ];
  }

  return { setTermHighlightConfig, termHighlight };
}

module.exports = { createTermHighlightKit };

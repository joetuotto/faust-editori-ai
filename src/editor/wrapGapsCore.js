/**
 * Wrap gaps for the manuscript editor (editor core)
 *
 * The editor wraps its lines with `white-space: break-spaces`, so the space at a soft wrap is a box at
 * the end of the upper visual line, and the underline or strike of a mark that goes on to the next line
 * is drawn under it, past the last word. No style can leave that box out: a text decoration covers the
 * whole box of the element that sets it. So the space gets a mark of its own, `cm-faust-wrapgap`, with
 * the lowest precedence: CodeMirror then draws it as the outermost element, around the piece of every
 * other mark that covers the space, and the stylesheet (section 14 of styles/faust-components.css) takes
 * the line and the ground off inside it. The other marks keep their ranges, ids and classes.
 *
 * Which spaces stand at a wrap is known only after layout. A view plugin measures the marks that ask for
 * it (`trimAtWrap: true` in the mark's spec: the suggestion layer's strike and dotted line, the Tarkistus
 * findings, the avoid words and the Tarinakansio mentions) whenever the drawn text or its geometry has
 * changed, and puts the gaps into a state field with an effects-only transaction when they differ from
 * the ones in place. The gap marks change no layout (an element around a space that is already there),
 * so the next measurement finds the same gaps and nothing more is dispatched. softWrapGaps of
 * markDrawing.js owns the rule; this file is its CodeMirror side.
 *
 * This file never loads CodeMirror itself: a second copy of the editor state package in the bundle
 * breaks the editor at run time. The classes arrive as the argument of the factory; the ESM shell
 * wrapGaps.js imports them and calls it once (test/editor/wrapGaps.view.test.js runs it with a real
 * editor view).
 */

const { softWrapGaps } = require('./markDrawing.js');

const GAP_CLASS = 'cm-faust-wrapgap';
// How many times in a row the plugin may answer its own gaps with new ones. The gap marks change no
// layout, so the second measurement agrees with the first; if a layout ever disagreed with itself, this
// stops the exchange until the text, the marks or the geometry change.
const OWN_ROUNDS = 3;

/**
 * @param {object} cm { StateField, StateEffect, EditorView, Decoration, ViewPlugin, Prec }
 * @returns {{ wrapGaps, setWrapGaps, wrapGapField, wrapGapRanges, measureWrapGaps }}
 */
function createWrapGapKit(cm) {
  const { StateField, StateEffect, EditorView, Decoration, ViewPlugin, Prec } = cm;

  // Effect value: Array<{ from, to }>, sorted, in offsets of the document the transaction leaves
  const setWrapGaps = StateEffect.define();

  const gapMark = Decoration.mark({ class: GAP_CLASS });

  function buildGaps(gaps, docLength) {
    const marks = [];
    for (const gap of Array.isArray(gaps) ? gaps : []) {
      if (!gap || !Number.isInteger(gap.from) || !Number.isInteger(gap.to)) continue;
      if (gap.from < 0 || gap.to > docLength || gap.to <= gap.from) continue;
      marks.push(gapMark.range(gap.from, gap.to));
    }
    return marks.length > 0 ? Decoration.set(marks, true) : Decoration.none;
  }

  // Between two measurements the gaps move with the text; the measurement after the change corrects them
  // before the next paint.
  const wrapGapField = StateField.define({
    create: () => Decoration.none,
    update(value, tr) {
      let gaps = value.map(tr.changes);
      for (const effect of tr.effects) {
        if (effect.is(setWrapGaps)) gaps = buildGaps(effect.value, tr.newDoc.length);
      }
      return gaps;
    },
    // Lowest precedence: the outermost element, around every other mark's piece over the same space
    provide: field => Prec.lowest(EditorView.decorations.from(field))
  });

  /** The gaps in place now. @returns {Array<{ from: number, to: number }>} */
  function wrapGapRanges(state) {
    const gaps = state.field(wrapGapField, false);
    const ranges = [];
    if (!gaps) return ranges;
    const cursor = gaps.iter();
    while (cursor.value) {
      ranges.push({ from: cursor.from, to: cursor.to });
      cursor.next();
    }
    return ranges;
  }

  // The ranges of the drawn marks that ask for wrap gaps, cut to the drawn part of the document
  function askingRanges(view) {
    const { from, to } = view.viewport;
    const ranges = [];
    for (const source of view.state.facet(EditorView.decorations)) {
      const set = typeof source === 'function' ? source(view) : source;
      if (!set || !set.size) continue;
      set.between(from, to, (start, end, value) => {
        if (value.spec && value.spec.trimAtWrap && end > start) ranges.push({ from: Math.max(start, from), to: Math.min(end, to) });
      });
    }
    return ranges;
  }

  /**
   * Measure the gaps of the view as it is laid out now. Reads the layout: call it in the read phase of a
   * measure request (the plugin does), never during an update.
   * @returns {Array<{ from: number, to: number }>} sorted, without overlaps
   */
  function measureWrapGaps(view) {
    const doc = view.state.doc;
    // The character at pos is the one before pos + 1: asked from that side, a widget that stands at pos
    // (an insertion suggestion) is not taken for it
    const rectAt = (pos) => view.coordsAtPos(pos + 1, -1);
    const found = [];
    for (const range of askingRanges(view)) {
      for (const gap of softWrapGaps(doc.sliceString(range.from, range.to), range.from, rectAt)) found.push(gap);
    }
    found.sort((a, b) => a.from - b.from || a.to - b.to);
    // Marks over the same words (a finding over a mention) find the same gap
    const gaps = [];
    for (const gap of found) {
      const last = gaps[gaps.length - 1];
      if (last && gap.from <= last.to) last.to = Math.max(last.to, gap.to);
      else gaps.push({ from: gap.from, to: gap.to });
    }
    return gaps;
  }

  const sameGaps = (a, b) => a.length === b.length && a.every((gap, index) => gap.from === b[index].from && gap.to === b[index].to);

  const isOwn = (tr) => !tr.docChanged && tr.effects.length > 0 && tr.effects.every(effect => effect.is(setWrapGaps));

  const measurePlugin = ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.destroyed = false;
      this.ownRounds = 0;
      this.request = {
        key: this,
        read: (editorView) => ({ doc: editorView.state.doc, gaps: measureWrapGaps(editorView) }),
        write: (measured, editorView) => this.settle(measured, editorView)
      };
      // A change of an ancestor's class or style (the theme, the manuscript's face, size or measure) can
      // turn the lines without changing the editor's own size, which is all CodeMirror watches
      const ownerWindow = view.dom.ownerDocument.defaultView;
      this.ancestors = null;
      if (ownerWindow && typeof ownerWindow.MutationObserver === 'function') {
        this.ancestors = new ownerWindow.MutationObserver(() => this.again());
        for (let node = view.dom.parentElement; node; node = node.parentElement) {
          this.ancestors.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
        }
      }
      view.requestMeasure(this.request);
    }

    // The author, the app or the layout changed something: measure again, and let the answer count
    again() {
      if (this.destroyed) return;
      this.ownRounds = 0;
      this.view.requestMeasure(this.request);
    }

    update(update) {
      const own = update.transactions.length > 0 && update.transactions.every(isOwn);
      if (!own && (update.transactions.length > 0 || update.geometryChanged || update.viewportChanged)) this.ownRounds = 0;
      if (update.geometryChanged) update.view.requestMeasure(this.request);
    }

    // The drawn text changed (its content, its marks or the part of the document that is drawn)
    docViewUpdate(view) {
      view.requestMeasure(this.request);
    }

    // An update cannot be started from inside a measurement: the gaps go in right after it, before the
    // browser paints. A text that changed in between has asked for a measurement of its own.
    settle(measured, view) {
      if (this.destroyed || sameGaps(measured.gaps, wrapGapRanges(view.state))) return;
      if (this.ownRounds >= OWN_ROUNDS) return;
      Promise.resolve().then(() => {
        if (this.destroyed || view.state.doc !== measured.doc) return;
        if (sameGaps(measured.gaps, wrapGapRanges(view.state))) return;
        this.ownRounds += 1;
        view.dispatch({ effects: setWrapGaps.of(measured.gaps) });
      });
    }

    destroy() {
      this.destroyed = true;
      if (this.ancestors) this.ancestors.disconnect();
    }
  });

  /** The extension: the field of the gaps and the plugin that measures them. */
  function wrapGaps() {
    return [wrapGapField, measurePlugin];
  }

  return { wrapGaps, setWrapGaps, wrapGapField, wrapGapRanges, measureWrapGaps };
}

module.exports = { createWrapGapKit, GAP_CLASS };

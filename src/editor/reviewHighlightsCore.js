/**
 * Finding highlights for the manuscript editor (editor core)
 *
 * Underlines the passages of the open findings of the Tarkistus tab and
 * tints the selected one. The marks live in a state field of their own, so
 * the search highlight and this one never touch each other and both can mark
 * the same text. Between two sets the marks follow the text through the
 * field's own mapping: typing at an edge does not grow a mark, and a mark
 * whose text is deleted disappears. Setting the marks is an effects-only
 * transaction: it does not count as a document change, so onChange, undo and
 * the typewriter centring are not triggered.
 *
 * The field keeps each finding's own range. What is drawn is cut to the
 * characters that are not white space (trimmedRange of markDrawing.js), from
 * the field and the text as they are now, so the line never lies under the
 * space after a sentence; `trimAtWrap` on a mark asks the wrap gaps
 * (wrapGapsCore.js) to keep the line off the space at a soft wrap.
 *
 * This file never loads CodeMirror itself: a second copy of the editor state
 * package in the bundle breaks the editor at run time. The classes arrive as
 * the argument of the factory; the ESM shell reviewHighlights.js imports them
 * and calls it once (test/editor/reviewHighlights.view.test.js runs it with a
 * real editor view).
 */

const { trimmedRange } = require('./markDrawing.js');

const FINDING_CLASS = 'cm-faust-finding';
const ACTIVE_CLASS = 'cm-faust-finding-active';
const FINDING_ATTRIBUTE = 'data-finding-id';
// 'note' or 'error' on a mark that is not the default warning (visual foundations 9.4: a double
// line for a note, a wave for a warning, a heavier wave for an error; drawn by the stylesheet)
const SEVERITY_ATTRIBUTE = 'data-severity';
const SEVERITIES = ['note', 'error'];

/**
 * @param {object} cm { StateField, StateEffect, EditorView, Decoration }
 * @returns {{ setFindingHighlights, findingField, reviewHighlights, findingRanges }}
 */
function createReviewHighlightsKit(cm) {
  const { StateField, StateEffect, EditorView, Decoration } = cm;

  // Effect value: { items: Array<{ id, from, to, severity? }>, activeId: string | null } or null
  const setFindingHighlights = StateEffect.define();

  // One mark per finding with a place inside the document. Marks are not
  // inclusive: text typed at an edge stays outside.
  function buildMarks(value, docLength) {
    const items = value && Array.isArray(value.items) ? value.items : [];
    const activeId = value && value.activeId != null ? String(value.activeId) : null;
    const marks = [];
    for (const item of items) {
      if (!item || !Number.isFinite(item.from) || !Number.isFinite(item.to)) continue;
      const from = Math.max(0, Math.min(item.from, docLength));
      const to = Math.max(0, Math.min(item.to, docLength));
      if (!(to > from)) continue;
      const id = String(item.id);
      const attributes = { [FINDING_ATTRIBUTE]: id };
      if (SEVERITIES.includes(item.severity)) attributes[SEVERITY_ATTRIBUTE] = item.severity;
      marks.push(Decoration.mark({
        class: id === activeId ? `${FINDING_CLASS} ${ACTIVE_CLASS}` : FINDING_CLASS,
        attributes,
        findingId: id,
        trimAtWrap: true
      }).range(from, to));
    }
    return marks.length > 0 ? Decoration.set(marks, true) : Decoration.none;
  }

  const findingField = StateField.define({
    create: () => Decoration.none,
    update(value, tr) {
      let marks = value.map(tr.changes);
      for (const effect of tr.effects) {
        if (effect.is(setFindingHighlights)) marks = buildMarks(effect.value, tr.newDoc.length);
      }
      return marks;
    },
    provide: field => EditorView.decorations.compute([field, 'doc'], state => drawnMarks(state.field(field), state.doc))
  });

  // The marks as they are drawn: each on the part of its range from the first to the last character that
  // is not white space. The field's own set is given back when no range has white space at an end.
  function drawnMarks(marks, doc) {
    if (marks.size === 0) return marks;
    const drawn = [];
    let cut = false;
    const cursor = marks.iter();
    while (cursor.value) {
      const range = trimmedRange(doc.sliceString(cursor.from, cursor.to), cursor.from);
      if (range.from !== cursor.from || range.to !== cursor.to) cut = true;
      drawn.push(cursor.value.range(range.from, range.to));
      cursor.next();
    }
    return cut ? Decoration.set(drawn, true) : marks;
  }

  // An underline, not a fill: fills are taken by search, avoid words and
  // suggestions. Colours come only from the design tokens (lead, VF-11).
  const baseTheme = EditorView.baseTheme({
    [`.${FINDING_CLASS}`]: { textDecoration: 'underline wavy var(--finding-line)' },
    [`.${ACTIVE_CLASS}`]: { backgroundColor: 'var(--finding-active-bg)' }
  });

  // The element of the mark a click landed in. A mark can hold other marks,
  // so the target may be a child of it.
  function findingElement(target) {
    let node = target && target.nodeType === 1 ? target : target && target.parentNode;
    while (node && node.nodeType === 1) {
      if (node.hasAttribute(FINDING_ATTRIBUTE)) return node;
      if (node.classList && node.classList.contains('cm-content')) return null;
      node = node.parentNode;
    }
    return null;
  }

  /**
   * The extension. callbacks: { onFindingClick?(id) }, read at click time.
   */
  function reviewHighlights(callbacks = {}) {
    const clickHandler = EditorView.domEventHandlers({
      mousedown(event) {
        const element = findingElement(event.target);
        if (element && callbacks && typeof callbacks.onFindingClick === 'function') {
          callbacks.onFindingClick(element.getAttribute(FINDING_ATTRIBUTE));
        }
        // Not handled: the caret still lands where the author clicked
        return false;
      }
    });
    return [findingField, clickHandler, baseTheme];
  }

  /**
   * The marks as they are now, mapped through every edit since they were set.
   * @returns {Array<{id: string, from: number, to: number}>}
   */
  function findingRanges(state) {
    const marks = state.field(findingField, false);
    const ranges = [];
    if (!marks) return ranges;
    const cursor = marks.iter();
    while (cursor.value) {
      ranges.push({ id: cursor.value.spec.findingId, from: cursor.from, to: cursor.to });
      cursor.next();
    }
    return ranges;
  }

  return { setFindingHighlights, findingField, reviewHighlights, findingRanges };
}

module.exports = { createReviewHighlightsKit };

/**
 * Smart typing in the manuscript editor ("Älykäs kirjoitus")
 *
 * The editor core behind src/editor/smartTyping.js: a typed " becomes ”,
 * ' becomes ’, -- becomes – (with a space after it at a line start). The rules
 * themselves are pure functions in typography.fi.js; this file only connects
 * them to CodeMirror's input handling.
 *
 * The CodeMirror classes arrive as an argument. The file never loads
 * CodeMirror itself: a second copy of its state package in the bundle would
 * break the editor at run time (test/editor/smartTyping.view.test.js).
 */
const { inputAction, smartReplace } = require('./typography.fi.js');

/**
 * @param {{ EditorView: object, Annotation: object }} cm
 * @returns {{ SmartTyping: object, smartTyping: (getOptions: () => ({ enabled: boolean } | null)) => object }}
 */
function createSmartTypingKit(cm) {
  const { EditorView, Annotation } = cm;

  // Marks the replacement transaction; the value is the rule name
  const SmartTyping = Annotation.define();

  /**
   * The input handler extension. Paste, drag and drop, dictation and other
   * multi-character input, IME composition and multiple cursors pass through
   * untouched.
   */
  function smartTyping(getOptions) {
    return EditorView.inputHandler.of((view, from, to, text, insert) => {
      const options = typeof getOptions === 'function' ? getOptions() : null;
      if (!options || !options.enabled) return false;
      if (view.composing || view.compositionStarted) return false;
      if (typeof text !== 'string' || text.length !== 1) return false;
      if (view.state.selection.ranges.length > 1) return false;

      const lineBefore = view.state.doc.lineAt(from);
      const action = inputAction(lineBefore.text, from - lineBefore.from, text, options);
      if (action === 'ignore') return false;
      // The dialogue dash already brought its space
      if (action === 'swallow') return from === to;

      // First the literal character, exactly as CodeMirror would insert it
      const docBefore = view.state.doc;
      view.dispatch(insert());

      const selection = view.state.selection.main;
      const typedAsExpected = view.state.doc !== docBefore
        && selection.empty
        && selection.head === from + 1
        && view.state.sliceDoc(from, from + 1) === text;
      if (!typedAsExpected) return true;

      // Then the replacement as a transaction of its own: one undo right after
      // it gives back exactly what was typed, and typing on does not convert it again
      const line = view.state.doc.lineAt(selection.head);
      const edit = smartReplace(line.text, selection.head - line.from, options);
      if (edit) {
        view.dispatch({
          changes: { from: line.from + edit.from, to: line.from + edit.to, insert: edit.insert },
          selection: { anchor: line.from + edit.cursor },
          annotations: SmartTyping.of(edit.rule),
          userEvent: 'input.type.smart',
          scrollIntoView: true
        });
      }
      return true;
    });
  }

  return { SmartTyping, smartTyping };
}

module.exports = { createSmartTypingKit };

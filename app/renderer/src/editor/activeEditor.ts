import type { Editor } from '@tiptap/core';

/**
 * The manuscript editors on screen (two in split view), for actions outside
 * the editor: AI panel inserts, comments, menu commands.
 */
const editors = new Map<string, Editor>();
let focused: string | null = null;

/** Register an editor; it removes itself when destroyed (unless already replaced) */
export function setActiveEditor(docId: string, editor: Editor) {
  editors.set(docId, editor);
  editor.on('destroy', () => {
    if (editors.get(docId) !== editor) return;
    editors.delete(docId);
    if (focused === docId) focused = null;
  });
}

export function setFocusedEditor(docId: string) {
  focused = docId;
}

export function getActiveEditor(docId: string): Editor | null {
  const editor = editors.get(docId);
  return editor && !editor.isDestroyed ? editor : null;
}

/** The editor the writer last typed in; falls back to the main pane's document */
export function getFocusedEditor(fallbackDocId: string | null): { docId: string; editor: Editor } | null {
  for (const docId of [focused, fallbackDocId]) {
    const editor = docId ? getActiveEditor(docId) : null;
    if (docId && editor) return { docId, editor };
  }
  return null;
}

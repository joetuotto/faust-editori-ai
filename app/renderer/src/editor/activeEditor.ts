import type { Editor } from '@tiptap/core';

/** The manuscript editor currently on screen, for actions outside the editor (AI panel inserts) */
let current: { docId: string; editor: Editor } | null = null;

export function setActiveEditor(docId: string, editor: Editor | null) {
  if (editor) current = { docId, editor };
  else if (current?.docId === docId) current = null;
}

export function getActiveEditor(docId: string): Editor | null {
  return current?.docId === docId && !current.editor.isDestroyed ? current.editor : null;
}

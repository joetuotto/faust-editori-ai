import type { Editor } from '@tiptap/core';
import { bookmarkLabel, type CommentKind } from '../../../shared/comments';
import { newId } from '../../../shared/text';
import { extractAnchors, addAnchor, removeAnchor } from './comments';
import { getActiveEditor, getFocusedEditor } from './activeEditor';
import { useStore } from '../store';

/** Anchor a new comment or bookmark at the selection and open it in the comments panel */
export function startThread(editor: Editor, docId: string, kind: CommentKind) {
  const id = newId();
  const quote = addAnchor(editor, id, kind);
  const { notify, addThread } = useStore.getState();
  if (!quote) {
    notify(kind === 'bookmark' ? 'Siirrä kursori tekstiin, johon kirjanmerkki tulee.' : 'Valitse ensin teksti, jota kommentoit.');
    return;
  }
  const { hash, anchors } = extractAnchors(editor.state.doc);
  const anchor = anchors.get(id);
  const now = new Date().toISOString();
  addThread(docId, {
    id,
    kind,
    ...(kind === 'bookmark' ? { label: bookmarkLabel(quote) } : {}),
    quote: anchor?.text ?? quote,
    start: anchor?.start ?? -1,
    end: anchor?.end ?? -1,
    messages: [],
    resolved: false,
    created: now
  });
  // Record the document hash with the new anchor so the next load is exact
  useStore.getState().setComments(docId, { hash, threads: useStore.getState().comments[docId]?.threads ?? [] });
}

/** Menu command: comment or bookmark in the document being edited */
export function startThreadInActive(kind: CommentKind) {
  const target = getFocusedEditor(useStore.getState().activeId);
  if (target) startThread(target.editor, target.docId, kind);
}

/** Delete a thread and its mark in the text */
export function deleteThread(docId: string, id: string) {
  const editor = getActiveEditor(docId);
  if (editor) removeAnchor(editor, id);
  useStore.getState().deleteThread(docId, id);
}

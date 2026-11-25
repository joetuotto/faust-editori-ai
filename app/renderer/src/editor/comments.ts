/**
 * Comment and bookmark anchors in the editor: a mark carrying only the thread
 * id. The thread itself (messages, state) lives in the store.
 */
import { Mark, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { locateQuote, type CommentKind, type CommentThread, type DocComments } from '../../../shared/comments';
import { hashText } from '../../../shared/provenance';
import { indexText } from './provenance';

export const COMMENT_META = 'faustComment';

export const CommentMark = Mark.create({
  name: 'comment',
  // Text typed at the edges is outside the comment; text typed inside stays in it
  inclusive: false,
  excludes: '',
  addAttributes() {
    return { id: { default: null }, kind: { default: 'comment' } };
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', { class: `comment-mark comment-${HTMLAttributes.kind}`, 'data-comment': HTMLAttributes.id }, 0];
  }
});

export interface Anchor {
  start: number;
  end: number;
  text: string;
}

/** Where each thread's mark currently is (plain-text offsets) */
export function extractAnchors(doc: PMNode): { hash: string; anchors: Map<string, Anchor> } {
  const { text, positions } = indexText(doc);
  const posToOffset = new Map<number, number>();
  positions.forEach((p, i) => p >= 0 && posToOffset.set(p, i));
  const anchors = new Map<string, Anchor>();

  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type.name !== 'comment' || !mark.attrs.id) continue;
      const start = posToOffset.get(pos);
      if (start === undefined) continue;
      const end = start + node.text!.length;
      const prev = anchors.get(mark.attrs.id);
      anchors.set(mark.attrs.id, prev ? { ...prev, start: Math.min(prev.start, start), end: Math.max(prev.end, end) } : { start, end, text: '' });
    }
    return false;
  });
  for (const a of anchors.values()) a.text = text.slice(a.start, a.end);
  return { hash: hashText(text), anchors };
}

/** Update thread anchors from the editor; threads whose text was deleted become detached */
export function updateThreads(doc: PMNode, current: DocComments | undefined): DocComments | undefined {
  if (!current || current.threads.length === 0) return current;
  const { hash, anchors } = extractAnchors(doc);
  let changed = hash !== current.hash;
  const threads = current.threads.map(t => {
    const a = anchors.get(t.id);
    if (!a) {
      if (t.start < 0) return t;
      changed = true;
      return { ...t, start: -1, end: -1 };
    }
    if (a.start === t.start && a.end === t.end && a.text === t.quote) return t;
    changed = true;
    const { hint: _hint, ...rest } = t;
    return { ...rest, start: a.start, end: a.end, quote: a.text };
  });
  return changed ? { hash, threads } : current;
}

/** Put stored anchors back as marks; returns the number of threads that could not be placed */
export function applyComments(editor: Editor, stored: DocComments | undefined): number {
  if (!stored || stored.threads.length === 0) return 0;
  const type = editor.schema.marks.comment;
  const { text, positions } = indexText(editor.state.doc);
  const exact = hashText(text) === stored.hash;
  const tr = editor.state.tr;
  let lost = 0;

  for (const t of stored.threads) {
    if (!t.quote) continue;
    let start = t.start;
    if (!exact || start < 0 || text.slice(t.start, t.end) !== t.quote) {
      // Re-anchor by content; with several matches take the one nearest the old place
      start = locateQuote(text, t.quote, t.start >= 0 ? t.start : (t.hint ?? -1));
      if (start < 0) {
        if (t.start >= 0) lost++;
        continue;
      }
    }
    const mark = type.create({ id: t.id, kind: t.kind });
    let runStart = -1;
    for (let i = start; i <= start + t.quote.length; i++) {
      const p = i < start + t.quote.length ? positions[i] : -1;
      if (p >= 0 && runStart < 0) runStart = p;
      if ((p < 0 || i === start + t.quote.length) && runStart >= 0) {
        tr.addMark(runStart, positions[i - 1] + 1, mark);
        runStart = -1;
      }
    }
  }
  if (tr.steps.length > 0) editor.view.dispatch(tr.setMeta(COMMENT_META, true).setMeta('addToHistory', false));
  return lost;
}

/** Anchor a new thread to the selection (or the word at the cursor); returns the anchored text */
export function addAnchor(editor: Editor, id: string, kind: CommentKind): string | null {
  let { from, to } = editor.state.selection;
  if (from === to) {
    // Expand to the word (or, for bookmarks, the paragraph) at the cursor
    const $pos = editor.state.selection.$from;
    const parentText = $pos.parent.textContent;
    const offset = $pos.parentOffset;
    if (kind === 'bookmark') {
      from = $pos.start();
      to = $pos.end();
    } else {
      const left = parentText.slice(0, offset).match(/[\p{L}\p{N}’'-]*$/u)?.[0].length ?? 0;
      const right = parentText.slice(offset).match(/^[\p{L}\p{N}’'-]*/u)?.[0].length ?? 0;
      from -= left;
      to += right;
    }
  }
  if (from === to) return null;
  const mark = editor.schema.marks.comment.create({ id, kind });
  editor.view.dispatch(editor.state.tr.addMark(from, to, mark).setMeta(COMMENT_META, true).setMeta('addToHistory', false));
  return editor.state.doc.textBetween(from, to, '\n');
}

export function removeAnchor(editor: Editor, id: string) {
  const type = editor.schema.marks.comment;
  const tr = editor.state.tr;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    for (const mark of node.marks) {
      if (mark.type === type && mark.attrs.id === id) tr.removeMark(pos, pos + node.nodeSize, mark);
    }
    return false;
  });
  if (tr.steps.length > 0) editor.view.dispatch(tr.setMeta(COMMENT_META, true).setMeta('addToHistory', false));
}

/** Select the thread's text in the editor and scroll to it */
export function revealAnchor(editor: Editor, thread: CommentThread) {
  const type = editor.schema.marks.comment;
  let from = -1;
  let to = -1;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    if (node.marks.some(m => m.type === type && m.attrs.id === thread.id)) {
      if (from < 0) from = pos;
      to = pos + node.nodeSize;
    }
    return false;
  });
  if (from >= 0) editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
}

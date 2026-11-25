/**
 * Footnotes as an inline atom. In Markdown they are Pandoc-style inline notes
 * ^[text], so the note stays next to the sentence it belongs to. The editor
 * shows a running number; clicking it opens the note for editing.
 */
import { useEffect, useRef, useState } from 'react';
import { Node, type Editor } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { footnoteEnd } from '../../../shared/markdownLite';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      /** Insert a footnote at the cursor and open it for editing */
      insertFootnote: (text?: string) => ReturnType;
    };
  }
}

/** Brackets are escaped so the note always closes where it should */
export function escapeNote(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/[[\]]/g, c => `\\${c}`);
}

export function unescapeNote(text: string): string {
  return text.replace(/\\([\\[\]])/g, '$1');
}

function FootnoteView({ node, selected, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const text = String(node.attrs.text ?? '');
  // Edits stay local until the note is closed: every attribute update replaces
  // the node, which would drop the selection and close the editor mid-word
  const [draft, setDraft] = useState<string | null>(null);
  const open = selected || draft !== null;

  useEffect(() => {
    if (selected) inputRef.current?.focus();
  }, [selected]);

  const commit = (moveCursor: boolean) => {
    if (draft !== null && draft !== text) updateAttributes({ text: draft });
    setDraft(null);
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (moveCursor && typeof pos === 'number') editor.chain().focus().setTextSelection(pos + node.nodeSize).run();
  };

  return (
    <NodeViewWrapper as="span" className={`footnote${open ? ' selected' : ''}`} title={text || 'Tyhjä alaviite'}>
      <sup className="footnote-ref" contentEditable={false} />
      {open && (
        <span className="footnote-editor" contentEditable={false}>
          <textarea
            ref={inputRef}
            className="textarea"
            rows={3}
            value={draft ?? text}
            placeholder="Alaviitteen teksti"
            onChange={e => setDraft(e.target.value)}
            onBlur={() => commit(false)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault();
                commit(true);
              }
            }}
          />
          <span className="muted">↩ valmis · ⇧↩ rivinvaihto · poista: valitse viite ja paina ⌫</span>
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { text: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'span[data-footnote]', getAttrs: el => ({ text: (el as HTMLElement).getAttribute('data-footnote') ?? '' }) }];
  },

  renderHTML({ node }) {
    return ['span', { 'data-footnote': node.attrs.text, class: 'footnote' }];
  },

  renderText({ node }) {
    return `^[${escapeNote(node.attrs.text)}]`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(FootnoteView);
  },

  markdownTokenizer: {
    name: 'footnote',
    level: 'inline',
    start: (src: string) => src.indexOf('^['),
    tokenize(src: string) {
      const end = footnoteEnd(src, 0);
      if (end < 0) return undefined;
      return { type: 'footnote', raw: src.slice(0, end), text: unescapeNote(src.slice(2, end - 1)) };
    }
  },

  parseMarkdown(token) {
    return { type: 'footnote', attrs: { text: token.text ?? '' } };
  },

  renderMarkdown(node) {
    return `^[${escapeNote(node.attrs?.text ?? '')}]`;
  },

  addCommands() {
    return {
      insertFootnote:
        (text = '') =>
        ({ chain, state }) => {
          const at = state.selection.to;
          return chain()
            .insertContentAt(at, { type: this.name, attrs: { text } })
            .setNodeSelection(at)
            .run();
        }
    };
  }
});

/** Menu command: footnote at the cursor in the given editor */
export function insertFootnote(editor: Editor | null) {
  editor?.chain().focus().insertFootnote().run();
}

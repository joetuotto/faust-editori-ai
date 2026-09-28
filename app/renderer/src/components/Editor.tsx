import { useLayoutEffect, useRef } from 'react';
import { countWords } from '../../../shared/text';
import { useStore } from '../store';

const STATUS_LABELS = { plan: 'Suunnitelma', draft: 'Luonnos', revision: 'Muokkaus', final: 'Valmis' } as const;

/** Wrap the selection in a Markdown marker (** for bold, * for italic) */
function wrapSelection(el: HTMLTextAreaElement, marker: string, onChange: (value: string) => void) {
  const { selectionStart: start, selectionEnd: end, value } = el;
  const selected = value.slice(start, end);
  const alreadyWrapped = value.slice(start - marker.length, start) === marker && value.slice(end, end + marker.length) === marker;
  const next = alreadyWrapped
    ? value.slice(0, start - marker.length) + selected + value.slice(end + marker.length)
    : value.slice(0, start) + marker + selected + marker + value.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    const offset = alreadyWrapped ? -marker.length : marker.length;
    el.setSelectionRange(start + offset, end + offset);
  });
}

export function Editor() {
  const activeId = useStore(s => s.activeId);
  const doc = useStore(s => (s.activeId ? s.project?.docs[s.activeId] : undefined));
  const { updateBody, renameNode } = useStore.getState();
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea with its content so the page scrolls, not the field
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [doc?.body, activeId]);

  if (!activeId || !doc) {
    return (
      <div className="editor-wrap">
        <div className="empty-state">
          <p>Valitse luku tai kohtaus vasemmalta, tai luo uusi.</p>
          <button className="btn" onClick={() => useStore.getState().addNode('chapter')}>
            + Uusi luku
          </button>
        </div>
      </div>
    );
  }

  const onChange = (value: string) => updateBody(activeId, value);

  return (
    <div className="editor-wrap">
      <div className="editor-page">
        <input
          key={`title-${activeId}`}
          className="doc-title"
          defaultValue={doc.meta.title}
          onBlur={e => {
            const title = e.target.value.trim();
            if (title && title !== doc.meta.title) renameNode(activeId, title);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') textRef.current?.focus();
          }}
        />
        <div className="doc-meta">
          <span>{countWords(doc.body)} sanaa</span>
          <span>{STATUS_LABELS[doc.meta.status]}</span>
          {doc.meta.pov && <span>POV: {doc.meta.pov}</span>}
        </div>
        <textarea
          ref={textRef}
          className="manuscript"
          value={doc.body}
          placeholder="Aloita kirjoittaminen…"
          spellCheck
          lang="fi"
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key.toLowerCase() === 'b') {
              e.preventDefault();
              wrapSelection(e.currentTarget, '**', onChange);
            } else if (mod && e.key.toLowerCase() === 'i') {
              e.preventDefault();
              wrapSelection(e.currentTarget, '*', onChange);
            }
          }}
        />
      </div>
    </div>
  );
}

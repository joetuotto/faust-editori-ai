import { useRef } from 'react';
import { countWords } from '../../../shared/text';
import { useStore } from '../store';
import { ManuscriptEditor } from '../editor/ManuscriptEditor';

const STATUS_LABELS = { plan: 'Suunnitelma', draft: 'Luonnos', revision: 'Muokkaus', final: 'Valmis' } as const;

export function Editor() {
  const activeId = useStore(s => s.activeId);
  const doc = useStore(s => (s.activeId ? s.project?.docs[s.activeId] : undefined));
  const language = useStore(s => s.project?.manifest.language ?? 'fi');
  const showProvenance = useStore(s => s.showProvenance);
  const { renameNode } = useStore.getState();
  const pageRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="editor-wrap">
      <div className={`editor-page${showProvenance ? ' show-prov' : ''}`} ref={pageRef}>
        <input
          key={`title-${activeId}`}
          className="doc-title"
          defaultValue={doc.meta.title}
          onBlur={e => {
            const title = e.target.value.trim();
            if (title && title !== doc.meta.title) renameNode(activeId, title);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') (pageRef.current?.querySelector('.manuscript') as HTMLElement | null)?.focus();
          }}
        />
        <div className="doc-meta">
          <span>{countWords(doc.body)} sanaa</span>
          <span>{STATUS_LABELS[doc.meta.status]}</span>
          {doc.meta.pov && <span>POV: {doc.meta.pov}</span>}
        </div>
        <ManuscriptEditor
          key={activeId}
          docId={activeId}
          body={doc.body}
          language={language}
        />
      </div>
    </div>
  );
}

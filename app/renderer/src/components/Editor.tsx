import { useRef } from 'react';
import { countWords } from '../../../shared/text';
import { flatten } from '../../../shared/tree';
import { useStore } from '../store';
import { ManuscriptEditor } from '../editor/ManuscriptEditor';
import { Corkboard } from './Corkboard';

const STATUS_LABELS = { plan: 'Suunnitelma', draft: 'Luonnos', revision: 'Muokkaus', final: 'Valmis' } as const;

/** The main area: the editor (optionally split in two) or the corkboard */
export function Editor() {
  const activeId = useStore(s => s.activeId);
  const splitId = useStore(s => s.splitId);
  const view = useStore(s => s.view);
  const hasDoc = useStore(s => !!(s.activeId && s.project?.docs[s.activeId]));

  if (view === 'corkboard') return <Corkboard />;

  if (!activeId || !hasDoc) {
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

  if (!splitId) return <EditorPane docId={activeId} primary />;

  return (
    <div className="editor-split">
      <EditorPane docId={activeId} primary />
      <EditorPane docId={splitId} primary={false} />
    </div>
  );
}

function EditorPane({ docId, primary }: { docId: string; primary: boolean }) {
  const doc = useStore(s => s.project?.docs[docId]);
  const language = useStore(s => s.project?.manifest.language ?? 'fi');
  const showProvenance = useStore(s => s.showProvenance);
  const split = useStore(s => !!s.splitId);
  const { renameNode, setActive, setSplit } = useStore.getState();
  const pageRef = useRef<HTMLDivElement>(null);

  if (!doc) return null;

  return (
    <div className={`editor-wrap${split ? ' pane' : ''}${primary ? '' : ' secondary'}`}>
      {!primary && (
        <div className="pane-head">
          <span className="label">Rinnakkain</span>
          <button
            className="btn ghost small"
            title="Vaihda puolia"
            onClick={() => {
              const main = useStore.getState().activeId;
              setActive(docId);
              setSplit(main);
            }}
          >
            ⇄
          </button>
          <button className="btn ghost small" title="Sulje rinnakkaisnäkymä (⌘\)" onClick={() => setSplit(null)}>
            ✕
          </button>
        </div>
      )}
      <div className={`editor-page${showProvenance ? ' show-prov' : ''}`} ref={pageRef}>
        <input
          key={`title-${docId}`}
          className="doc-title"
          defaultValue={doc.meta.title}
          onBlur={e => {
            const title = e.target.value.trim();
            if (title && title !== doc.meta.title) renameNode(docId, title);
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
        <ManuscriptEditor key={docId} docId={docId} body={doc.body} language={language} primary={primary} />
      </div>
    </div>
  );
}

/** Menu command: open or close the second pane (next document in the manuscript by default) */
export function toggleSplit() {
  const { splitId, activeId, project, setSplit, notify } = useStore.getState();
  if (splitId) return setSplit(null);
  const nodes = project ? flatten(project.manifest.structure) : [];
  const index = nodes.findIndex(n => n.id === activeId);
  const other = nodes[index + 1] ?? nodes[index - 1];
  if (!other) return notify('Rinnakkaisnäkymään tarvitaan toinen luku tai kohtaus.');
  setSplit(other.id);
}

import { useMemo, useState } from 'react';
import { sortThreads, type CommentThread } from '../../../shared/comments';
import { flatten } from '../../../shared/tree';
import { getActiveEditor } from '../editor/activeEditor';
import { revealAnchor } from '../editor/comments';
import { deleteThread } from '../editor/commentActions';
import { useStore } from '../store';

type Tab = 'doc' | 'bookmarks';

/** Comments of the open document and bookmarks of the whole manuscript */
export function CommentsPanel() {
  const [tab, setTab] = useState<Tab>('doc');
  const [showResolved, setShowResolved] = useState(false);
  const activeId = useStore(s => s.activeId);
  const comments = useStore(s => s.comments);
  const { toggle } = useStore.getState();

  const threads = useMemo(() => {
    const all = activeId ? sortThreads(comments[activeId]?.threads ?? []) : [];
    return showResolved ? all : all.filter(t => !t.resolved);
  }, [activeId, comments, showResolved]);
  const resolvedCount = activeId ? (comments[activeId]?.threads ?? []).filter(t => t.resolved).length : 0;

  return (
    <aside className="side-panel comments-panel">
      <div className="panel-head">
        <span className="label">Kommentit</span>
        <button className="btn ghost small" onClick={() => toggle('showComments')} aria-label="Sulje">✕</button>
      </div>
      <div className="tabs">
        <button className={`btn small ghost${tab === 'doc' ? ' active' : ''}`} onClick={() => setTab('doc')}>Tämä dokumentti</button>
        <button className={`btn small ghost${tab === 'bookmarks' ? ' active' : ''}`} onClick={() => setTab('bookmarks')}>Kirjanmerkit</button>
      </div>
      <div className="panel-body">
        {tab === 'doc' ? (
          <>
            {!activeId && <p className="muted">Ei valittua dokumenttia.</p>}
            {activeId && threads.length === 0 && (
              <p className="muted">
                Ei kommentteja. Valitse tekstiä ja paina 💬 (⌥⌘M) tai lisää kirjanmerkki 🔖 (⌥⌘B). Merkinnät eivät päädy käsikirjoitukseen
                eivätkä vientiin.
              </p>
            )}
            {activeId && threads.map(t => <Thread key={t.id} docId={activeId} thread={t} />)}
            {resolvedCount > 0 && (
              <label className="muted comment-toggle">
                <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
                Näytä ratkaistut ({resolvedCount})
              </label>
            )}
          </>
        ) : (
          <Bookmarks />
        )}
      </div>
    </aside>
  );
}

function Thread({ docId, thread }: { docId: string; thread: CommentThread }) {
  const active = useStore(s => s.activeComment === thread.id);
  const { updateThread, setActiveComment } = useStore.getState();
  const [reply, setReply] = useState('');
  const detached = thread.start < 0;
  const first = thread.messages[0];

  const select = () => {
    setActiveComment(thread.id);
    const editor = getActiveEditor(docId);
    if (editor && !detached) revealAnchor(editor, thread);
  };

  const setMessage = (index: number, text: string) => {
    const messages = [...thread.messages];
    messages[index] = { ...(messages[index] ?? { author: 'writer', at: new Date().toISOString() }), text };
    updateThread(docId, thread.id, { messages });
  };

  const addReply = () => {
    if (!reply.trim()) return;
    updateThread(docId, thread.id, { messages: [...thread.messages, { author: 'writer', text: reply.trim(), at: new Date().toISOString() }] });
    setReply('');
  };

  return (
    <div
      className={`comment-thread comment-${thread.kind}${active ? ' active' : ''}${thread.resolved ? ' resolved' : ''}`}
      data-thread={thread.id}
      onClick={select}
    >
      <div className="comment-quote" title={thread.quote}>
        {thread.kind === 'bookmark' ? '🔖 ' : ''}
        {detached ? (
          <span className="muted">{thread.hint !== undefined ? 'Kohtaa ei löytynyt tekstistä: ' : 'Kohta poistettu: '}</span>
        ) : null}
        ”{thread.quote.length > 120 ? `${thread.quote.slice(0, 120)}…` : thread.quote}”
      </div>

      {thread.kind === 'bookmark' && (
        <input
          className="input"
          value={thread.label ?? ''}
          placeholder="Kirjanmerkin nimi"
          onChange={e => updateThread(docId, thread.id, { label: e.target.value })}
        />
      )}

      <textarea
        className="textarea"
        rows={thread.kind === 'bookmark' ? 1 : 3}
        autoFocus={active && !first}
        placeholder={thread.kind === 'bookmark' ? 'Muistiinpano (valinnainen)' : 'Kirjoita kommentti…'}
        value={first?.text ?? ''}
        onChange={e => setMessage(0, e.target.value)}
      />
      {thread.messages.slice(1).map((m, i) => (
        <div key={i} className="comment-reply">
          <span className="muted">{m.author === 'import' ? 'Tuotu' : new Date(m.at).toLocaleDateString('fi-FI')}</span>
          <textarea className="textarea" rows={2} value={m.text} onChange={e => setMessage(i + 1, e.target.value)} />
        </div>
      ))}

      {active && (
        <div className="comment-actions" onClick={e => e.stopPropagation()}>
          {first?.text && (
            <input
              className="input"
              value={reply}
              placeholder="Lisää merkintä…"
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addReply()}
            />
          )}
          <div className="comment-buttons">
            <button className="btn small" onClick={() => updateThread(docId, thread.id, { resolved: !thread.resolved })}>
              {thread.resolved ? 'Avaa uudelleen' : '✓ Ratkaistu'}
            </button>
            <button
              className="btn small ghost danger"
              onClick={() => {
                if (!first?.text || confirm('Poistetaanko merkintä?')) deleteThread(docId, thread.id);
              }}
            >
              Poista
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** All bookmarks in manuscript order; a click opens the document at the mark */
function Bookmarks() {
  const project = useStore(s => s.project)!;
  const comments = useStore(s => s.comments);
  const { setActive, setActiveComment } = useStore.getState();

  const list = useMemo(
    () =>
      flatten(project.manifest.structure).flatMap(node =>
        sortThreads(comments[node.id]?.threads ?? [])
          .filter(t => t.kind === 'bookmark')
          .map(t => ({ node, thread: t }))
      ),
    [project.manifest.structure, comments]
  );

  if (list.length === 0) return <p className="muted">Ei kirjanmerkkejä. Lisää kirjanmerkki kohtaan, johon haluat palata (⌥⌘B).</p>;

  const go = (docId: string, thread: CommentThread) => {
    setActiveComment(thread.id);
    const editor = getActiveEditor(docId);
    if (editor) revealAnchor(editor, thread);
    // Another document: the editor reveals the active thread once it has loaded
    else setActive(docId);
  };

  return (
    <ul className="bookmark-list">
      {list.map(({ node, thread }) => (
        <li key={thread.id}>
          <button className="btn ghost" onClick={() => go(node.id, thread)} disabled={thread.start < 0}>
            <strong>{thread.label || thread.quote.slice(0, 40)}</strong>
            <span className="muted">{node.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

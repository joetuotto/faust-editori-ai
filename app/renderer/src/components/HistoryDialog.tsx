import { useEffect, useMemo, useState } from 'react';
import type { HistoryEntry } from '../../../shared/types';
import { parseFrontmatter } from '../../../shared/text';
import { findNode } from '../../../shared/tree';
import { diffHunks } from '../editor/rewrite';
import { snapshot } from '../actions';
import { useStore } from '../store';
import { Dialog } from './Dialog';

const dateFormat = new Intl.DateTimeFormat('fi-FI', { dateStyle: 'medium', timeStyle: 'short' });

/** Version history of the open document, with a diff against the current text */
export function HistoryDialog() {
  const project = useStore(s => s.project)!;
  const activeId = useStore(s => s.activeId);
  const { setPanel, updateBody, flush, notify } = useStore.getState();
  const node = activeId ? findNode(project.manifest.structure, activeId) : null;
  const current = activeId ? project.docs[activeId]?.body ?? '' : '';

  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [oldBody, setOldBody] = useState<string | null>(null);
  const [label, setLabel] = useState('');

  const file = node?.file;
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await flush();
      const list = file ? await window.faust.project.history(file) : [];
      if (!cancelled) setEntries(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [file, flush, reload]);

  const select = (entry: HistoryEntry) => {
    setSelected(entry);
    setOldBody(null);
    if (!file) return;
    void window.faust.project.readAt(entry.oid, file).then(text => setOldBody(text === null ? '' : parseFrontmatter(text).body));
  };

  const hunks = useMemo(() => (oldBody === null ? null : diffHunks(oldBody, current)), [oldBody, current]);

  const restore = async () => {
    if (!activeId || oldBody === null || !selected) return;
    // Save the current text as a version first so the restore can be undone
    await snapshot(`Ennen palautusta (${node?.title})`);
    updateBody(activeId, oldBody);
    notify(`Palautettu versio ${dateFormat.format(selected.timestamp)}.`);
    setPanel('none');
  };

  const saveNamed = async () => {
    await snapshot(label.trim() || 'Tallennettu versio');
    setLabel('');
    setReload(r => r + 1);
  };

  return (
    <Dialog title={`Versiohistoria${node ? ` · ${node.title}` : ''}`} large onClose={() => setPanel('none')}>
      <div className="split" style={{ margin: -18, height: 'calc(100% + 36px)', gridTemplateColumns: '280px 1fr' }}>
        <div className="list">
          <form
            style={{ display: 'flex', gap: 6, marginBottom: 10 }}
            onSubmit={e => {
              e.preventDefault();
              void saveNamed();
            }}
          >
            <input className="input" placeholder="Nimeä nykyinen versio" value={label} onChange={e => setLabel(e.target.value)} />
            <button className="btn small" type="submit">Tallenna</button>
          </form>
          {entries === null && <p className="muted">Ladataan…</p>}
          {entries?.length === 0 && <p className="muted" style={{ padding: 8 }}>Tälle dokumentille ei ole vielä tallennettuja versioita.</p>}
          {entries?.map(e => (
            <div key={e.oid} className={`list-item${selected?.oid === e.oid ? ' active' : ''}`} onClick={() => select(e)}>
              <div className="name" style={{ fontSize: 14 }}>{dateFormat.format(e.timestamp)}</div>
              <div className="summary">{e.message}</div>
            </div>
          ))}
        </div>
        <div className="detail">
          {!selected ? (
            <p className="muted">
              Valitse versio nähdäksesi, mitä on muuttunut sen jälkeen. Versiot tallentuvat automaattisesti muutaman minuutin välein ja kun
              suljet sovelluksen; ⌘S tallentaa version heti.
            </p>
          ) : hunks === null ? (
            <p className="muted">Ladataan…</p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span className="muted">
                  <del style={{ color: 'var(--error)' }}>poistettu</del> ja <ins style={{ color: 'var(--success)', textDecoration: 'none' }}>lisätty</ins>{' '}
                  tämän version jälkeen
                </span>
                <div className="spacer" />
                <button className="btn primary small" onClick={() => void restore()}>
                  Palauta tämä versio
                </button>
              </div>
              <div className="diff review-body" style={{ padding: 0 }}>
                {hunks.every(h => h.kind === 'same') && <p className="muted">Ei eroja nykyiseen tekstiin.</p>}
                {hunks.map((h, i) =>
                  h.kind === 'same' ? (
                    <span key={i}>{h.text}</span>
                  ) : (
                    <span key={i}>
                      {h.removed && <del>{h.removed}</del>}
                      {h.added && <ins>{h.added}</ins>}
                    </span>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

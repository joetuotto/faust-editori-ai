import { useEffect, useRef, useState } from 'react';
import type { BibleEntry, BibleKind } from '../../../shared/types';
import { proposeBibleUpdates, type BibleUpdateProposal } from '../ai/bibleUpdate';
import { useStore } from '../store';
import { Dialog } from './Dialog';

const KIND_LABEL: Record<BibleKind, string> = { characters: 'henkilö', locations: 'paikka', threads: 'juonilanka' };

function findEntry(entries: BibleEntry[], name: string): BibleEntry | undefined {
  const n = name.trim().toLowerCase();
  return entries.find(e => e.name.toLowerCase() === n) ?? entries.find(e => e.name.toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]);
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; proposal: BibleUpdateProposal; updates: boolean[]; newEntries: boolean[]; links: boolean };

/** Review AI-proposed story bible changes for the active document */
export function BibleUpdateDialog() {
  const activeId = useStore(s => s.activeId);
  const { setPanel, notify } = useStore.getState();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const callId = useRef<string | null>(null);

  useEffect(() => {
    const project = useStore.getState().project;
    if (!project || !activeId) return;
    let cancelled = false;
    void proposeBibleUpdates(project, activeId, id => (callId.current = id)).then(result => {
      callId.current = null;
      if (cancelled) return;
      if (!result.ok) {
        setState({ kind: 'error', message: result.error });
        return;
      }
      const p = result.data;
      setState({ kind: 'ready', proposal: p, updates: p.updates.map(() => true), newEntries: p.newEntries.map(() => true), links: true });
    });
    return () => {
      cancelled = true;
      if (callId.current) window.faust.ai.cancel(callId.current);
    };
  }, [activeId]);

  const apply = () => {
    if (state.kind !== 'ready' || !activeId) return;
    const store = useStore.getState();
    const { proposal } = state;
    let changes = 0;

    proposal.newEntries.forEach((e, i) => {
      if (!state.newEntries[i]) return;
      const id = store.addBibleEntry(e.kind, e.name);
      if (id) {
        store.updateBibleEntry(id, { summary: e.summary });
        changes++;
      }
    });

    const entries = Object.values(useStore.getState().project!.bible);
    proposal.updates.forEach((u, i) => {
      if (!state.updates[i]) return;
      const entry = findEntry(entries, u.entry);
      if (!entry) return;
      useStore.getState().updateBibleEntry(entry.id, { fields: { ...useStore.getState().project!.bible[entry.id].fields, [u.field]: u.value } });
      changes++;
    });

    if (state.links) {
      const all = Object.values(useStore.getState().project!.bible);
      const ids = (names: string[], kind: BibleKind) =>
        [...new Set(names.map(n => findEntry(all.filter(e => e.kind === kind), n)?.id).filter((x): x is string => !!x))];
      store.updateMeta(activeId, {
        characters: ids(proposal.appearing.characters, 'characters'),
        locations: ids(proposal.appearing.locations, 'locations'),
        threads: ids(proposal.appearing.threads, 'threads')
      });
    }

    notify(changes > 0 ? `Tietopankkiin tehtiin ${changes} muutosta.` : 'Kohtauksen linkit päivitetty.');
    setPanel('none');
  };

  const bible = Object.values(useStore.getState().project?.bible ?? {});

  return (
    <Dialog title="Päivitä tietopankki kohtauksesta" onClose={() => setPanel('none')}>
      {state.kind === 'loading' && <p className="muted">AI lukee kohtausta ja vertaa sitä tietopankkiin…</p>}
      {state.kind === 'error' && <p className="muted">{state.message}</p>}
      {state.kind === 'ready' && (
        <>
          {state.proposal.contradictions.length > 0 && (
            <section className="update-section">
              <div className="label">Ristiriidat</div>
              {state.proposal.contradictions.map((c, i) => (
                <div key={i} className="contradiction">
                  <strong>{c.entry}:</strong> {c.issue}
                  {c.quote && <blockquote>{c.quote}</blockquote>}
                </div>
              ))}
            </section>
          )}

          {state.proposal.updates.length > 0 && (
            <section className="update-section">
              <div className="label">Päivitykset</div>
              {state.proposal.updates.map((u, i) => {
                const entry = findEntry(bible, u.entry);
                const old = entry?.fields[u.field];
                return (
                  <label key={i} className="update-row">
                    <input
                      type="checkbox"
                      checked={state.updates[i]}
                      disabled={!entry}
                      onChange={e => setState({ ...state, updates: state.updates.map((v, j) => (j === i ? e.target.checked : v)) })}
                    />
                    <span>
                      <strong>{u.entry}</strong> · {u.field}: {old && <del>{old}</del>} <ins>{u.value}</ins>
                      <span className="muted"> — {entry ? u.reason : 'merkintää ei löydy'}</span>
                    </span>
                  </label>
                );
              })}
            </section>
          )}

          {state.proposal.newEntries.length > 0 && (
            <section className="update-section">
              <div className="label">Uudet merkinnät</div>
              {state.proposal.newEntries.map((e, i) => (
                <label key={i} className="update-row">
                  <input
                    type="checkbox"
                    checked={state.newEntries[i]}
                    onChange={ev => setState({ ...state, newEntries: state.newEntries.map((v, j) => (j === i ? ev.target.checked : v)) })}
                  />
                  <span>
                    <strong>{e.name}</strong> <span className="muted">({KIND_LABEL[e.kind]})</span> {e.summary}
                  </span>
                </label>
              ))}
            </section>
          )}

          <section className="update-section">
            <label className="update-row">
              <input type="checkbox" checked={state.links} onChange={e => setState({ ...state, links: e.target.checked })} />
              <span>
                Merkitse kohtaukseen:{' '}
                {[...state.proposal.appearing.characters, ...state.proposal.appearing.locations, ...state.proposal.appearing.threads].join(', ') || '–'}
              </span>
            </label>
          </section>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" onClick={() => setPanel('none')}>Peruuta</button>
            <button className="btn primary" onClick={apply}>Tallenna valitut</button>
          </div>
        </>
      )}
    </Dialog>
  );
}

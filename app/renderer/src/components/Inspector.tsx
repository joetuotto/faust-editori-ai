import { useMemo } from 'react';
import type { DocStatus } from '../../../shared/types';
import { useStore } from '../store';
import { provenanceStats } from '../../../shared/provenance';

const STATUSES: { value: DocStatus; label: string }[] = [
  { value: 'plan', label: 'Suunnitelma' },
  { value: 'draft', label: 'Luonnos' },
  { value: 'revision', label: 'Muokkaus' },
  { value: 'final', label: 'Valmis' }
];

export function Inspector() {
  const activeId = useStore(s => s.activeId);
  const doc = useStore(s => (s.activeId ? s.project?.docs[s.activeId] : undefined));
  const bible = useStore(s => s.project?.bible);
  const characters = useMemo(() => Object.values(bible ?? {}).filter(e => e.kind === 'characters'), [bible]);
  const provenance = useStore(s => (s.activeId ? s.provenance[s.activeId] : undefined));
  const showProvenance = useStore(s => s.showProvenance);
  const { updateMeta, toggle } = useStore.getState();
  const stats = doc ? provenanceStats(doc.body, provenance) : null;
  const percent = (n: number) => (stats && stats.total > 0 ? Math.round((n / stats.total) * 100) : 0);

  return (
    <aside className="side-panel">
      <div className="panel-head">
        <span className="label">Tarkastelija</span>
        <button className="btn ghost small" onClick={() => toggle('showInspector')}>✕</button>
      </div>
      <div className="panel-body">
        {!activeId || !doc ? (
          <p className="muted">Ei valittua dokumenttia.</p>
        ) : (
          <div key={activeId}>
            <label className="field">
              <span>Tila</span>
              <select className="select" value={doc.meta.status} onChange={e => updateMeta(activeId, { status: e.target.value as DocStatus })}>
                {STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Synopsis</span>
              <textarea
                className="textarea"
                rows={5}
                value={doc.meta.synopsis}
                placeholder="Mitä tässä tapahtuu?"
                onChange={e => updateMeta(activeId, { synopsis: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Näkökulmahenkilö</span>
              <input
                className="input"
                list="pov-characters"
                value={doc.meta.pov ?? ''}
                onChange={e => updateMeta(activeId, { pov: e.target.value || undefined })}
              />
              <datalist id="pov-characters">
                {characters.map(c => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Tarinan aika</span>
              <input
                className="input"
                placeholder="esim. Päivä 3, aamu"
                value={doc.meta.storyTime ?? ''}
                onChange={e => updateMeta(activeId, { storyTime: e.target.value || undefined })}
              />
            </label>
            {stats && stats.total > 0 && (
              <div className="field">
                <span>Alkuperä</span>
                <div className="provenance-bar" title="Oma teksti / AI:n muokkaama / AI:n kirjoittama">
                  <div className="own" style={{ width: `${percent(stats.own)}%` }} />
                  <div className="ai-edit" style={{ width: `${percent(stats.aiEdit)}%` }} />
                  <div className="ai" style={{ width: `${percent(stats.ai)}%` }} />
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Oma {percent(stats.own)} % · AI:n muokkaama {percent(stats.aiEdit)} % · AI:n kirjoittama {percent(stats.ai)} %
                </div>
                {stats.own < stats.total && (
                  <button className={`btn small${showProvenance ? ' active' : ''}`} style={{ alignSelf: 'flex-start' }} onClick={() => toggle('showProvenance')}>
                    {showProvenance ? 'Piilota AI-korostus' : 'Korosta AI-teksti'}
                  </button>
                )}
              </div>
            )}
            <label className="field">
              <span>Muistiinpanot</span>
              <textarea
                className="textarea"
                rows={8}
                value={doc.meta.notes}
                onChange={e => updateMeta(activeId, { notes: e.target.value })}
              />
            </label>
          </div>
        )}
      </div>
    </aside>
  );
}

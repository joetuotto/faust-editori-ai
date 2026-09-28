import { useMemo } from 'react';
import type { DocStatus } from '../../../shared/types';
import { useStore } from '../store';

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
  const { updateMeta, toggle } = useStore.getState();

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

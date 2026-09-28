import { useMemo, useState } from 'react';
import type { DocStatus, NodeType } from '../../../shared/types';
import { collectionNodes, describeFilter, type Collection, type CollectionFilter } from '../../../shared/collections';
import { newId } from '../../../shared/text';
import { useStore } from '../store';
import { Dialog } from './Dialog';

const STATUSES: { value: DocStatus; label: string }[] = [
  { value: 'plan', label: 'Suunnitelma' },
  { value: 'draft', label: 'Luonnos' },
  { value: 'revision', label: 'Muokkaus' },
  { value: 'final', label: 'Valmis' }
];

const TYPES: { value: NodeType; label: string }[] = [
  { value: 'chapter', label: 'Luvut' },
  { value: 'scene', label: 'Kohtaukset' },
  { value: 'folder', label: 'Kansiot' }
];

function toggle<T>(list: T[] | undefined, value: T): T[] {
  const set = new Set(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

/** Create or edit a collection (saved filter) */
export function CollectionDialog({ initial, onClose }: { initial: Collection | null; onClose(): void }) {
  const project = useStore(s => s.project)!;
  const { saveCollection, deleteCollection, setCollection } = useStore.getState();
  const [name, setName] = useState(initial?.name ?? '');
  const [filter, setFilter] = useState<CollectionFilter>(initial?.filter ?? {});

  const entries = useMemo(() => Object.values(project.bible).sort((a, b) => a.name.localeCompare(b.name, 'fi')), [project.bible]);
  const povs = useMemo(() => {
    const names = new Set<string>();
    for (const d of Object.values(project.docs)) if (d.meta.pov) names.add(d.meta.pov);
    for (const e of entries) if (e.kind === 'characters') names.add(e.name);
    return [...names].sort((a, b) => a.localeCompare(b, 'fi'));
  }, [project.docs, entries]);
  const labels = useMemo(
    () =>
      [
        ...new Set(
          Object.values(project.docs)
            .map(d => d.meta.label)
            .filter(Boolean) as string[]
        )
      ].sort(),
    [project.docs]
  );
  const matches = collectionNodes(project, filter);

  const save = () => {
    const collection: Collection = { id: initial?.id ?? newId(), name: name.trim() || describeFilter(project, filter), filter };
    saveCollection(collection);
    setCollection(collection.id);
    onClose();
  };

  return (
    <Dialog title={initial ? 'Muokkaa kokoelmaa' : 'Uusi kokoelma'} onClose={onClose}>
      <label className="field">
        <span>Nimi</span>
        <input className="input" autoFocus value={name} placeholder="esim. Ainon kohtaukset" onChange={e => setName(e.target.value)} />
      </label>

      <div className="field">
        <span>Tyyppi</span>
        <div className="chips">
          {TYPES.map(t => (
            <button
              key={t.value}
              className={`chip${filter.types?.includes(t.value) ? ' on' : ''}`}
              onClick={() => setFilter(f => ({ ...f, types: toggle(f.types, t.value) }))}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Tila</span>
        <div className="chips">
          {STATUSES.map(s => (
            <button
              key={s.value}
              className={`chip${filter.statuses?.includes(s.value) ? ' on' : ''}`}
              onClick={() => setFilter(f => ({ ...f, statuses: toggle(f.statuses, s.value) }))}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label className="field">
          <span>Näkökulmahenkilö</span>
          <select className="select" value={filter.pov ?? ''} onChange={e => setFilter(f => ({ ...f, pov: e.target.value || undefined }))}>
            <option value="">kuka tahansa</option>
            {povs.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Mukana (tietopankki)</span>
          <select
            className="select"
            value={filter.entry ?? ''}
            onChange={e => setFilter(f => ({ ...f, entry: e.target.value || undefined }))}
          >
            <option value="">ei rajausta</option>
            {entries.map(e => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Merkintä</span>
          <input
            className="input"
            list="collection-labels"
            value={filter.label ?? ''}
            onChange={e => setFilter(f => ({ ...f, label: e.target.value || undefined }))}
          />
          <datalist id="collection-labels">
            {labels.map(l => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>Sisältää tekstin</span>
          <input
            className="input"
            value={filter.text ?? ''}
            onChange={e => setFilter(f => ({ ...f, text: e.target.value || undefined }))}
          />
        </label>
      </div>

      <p className="muted">
        {matches.length} osumaa:{' '}
        {matches
          .slice(0, 6)
          .map(n => n.title)
          .join(', ')}
        {matches.length > 6 ? ', …' : ''}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {initial && (
          <button
            className="btn danger small"
            onClick={() => {
              deleteCollection(initial.id);
              onClose();
            }}
          >
            Poista kokoelma
          </button>
        )}
        <div className="spacer" />
        <button className="btn" onClick={onClose}>
          Peruuta
        </button>
        <button className="btn primary" onClick={save}>
          Tallenna
        </button>
      </div>
    </Dialog>
  );
}

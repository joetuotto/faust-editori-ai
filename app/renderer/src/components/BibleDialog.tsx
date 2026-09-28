import { useMemo, useState } from 'react';
import type { BibleEntry, BibleKind } from '../../../shared/types';
import { useStore } from '../store';
import { Dialog } from './Dialog';

const KINDS: { kind: BibleKind; label: string; singular: string; fields: string[] }[] = [
  { kind: 'characters', label: 'Henkilöt', singular: 'henkilö', fields: ['rooli', 'ikä', 'ulkonäkö', 'luonne', 'tavoite', 'pelko'] },
  { kind: 'locations', label: 'Paikat', singular: 'paikka', fields: ['tyyppi', 'tunnelma', 'aistit', 'merkitys'] },
  { kind: 'threads', label: 'Juonilangat', singular: 'juonilanka', fields: ['tila', 'alkaa', 'ratkeaa', 'panokset'] }
];

const NO_ENTRIES: Record<string, BibleEntry> = {};

export function BibleDialog() {
  const bible = useStore(s => s.project?.bible ?? NO_ENTRIES);
  const { setPanel, addBibleEntry } = useStore.getState();
  const [kind, setKind] = useState<BibleKind>('characters');
  const [selected, setSelected] = useState<string | null>(null);

  const entries = useMemo(
    () => Object.values(bible).filter(e => e.kind === kind).sort((a, b) => a.name.localeCompare(b.name, 'fi')),
    [bible, kind]
  );
  const current = selected ? bible[selected] : undefined;
  const config = KINDS.find(k => k.kind === kind)!;

  const add = () => {
    const id = addBibleEntry(kind, `Uusi ${config.singular}`);
    if (id) setSelected(id);
  };

  return (
    <Dialog
      title="Tarinan tietopankki"
      large
      onClose={() => setPanel('none')}
      tabs={
        <div className="tabs">
          {KINDS.map(k => (
            <button
              key={k.kind}
              className={k.kind === kind ? 'active' : ''}
              onClick={() => {
                setKind(k.kind);
                setSelected(null);
              }}
            >
              {k.label} ({Object.values(bible).filter(e => e.kind === k.kind).length})
            </button>
          ))}
        </div>
      }
    >
      <div className="split" style={{ margin: -18, height: 'calc(100% + 36px)' }}>
        <div className="list">
          <button className="btn small" style={{ width: '100%', marginBottom: 8 }} onClick={add}>
            + Lisää {config.singular}
          </button>
          {entries.map(e => (
            <div key={e.id} className={`list-item${e.id === selected ? ' active' : ''}`} onClick={() => setSelected(e.id)}>
              <div className="name">{e.name}</div>
              {e.summary && <div className="summary">{e.summary}</div>}
            </div>
          ))}
          {entries.length === 0 && <p className="muted" style={{ padding: 8 }}>Ei vielä merkintöjä.</p>}
        </div>
        <div className="detail">
          {current ? (
            <EntryEditor key={current.id} entry={current} suggestedFields={config.fields} onDeleted={() => setSelected(null)} />
          ) : (
            <p className="muted">Valitse merkintä tai lisää uusi. AI-avustaja käyttää tietopankkia taustatietona.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function EntryEditor({ entry, suggestedFields, onDeleted }: { entry: BibleEntry; suggestedFields: string[]; onDeleted(): void }) {
  const { updateBibleEntry, deleteBibleEntry } = useStore.getState();
  const [newField, setNewField] = useState('');
  const fieldNames = [...new Set([...suggestedFields, ...Object.keys(entry.fields)])];

  const setField = (key: string, value: string) => {
    const fields = { ...entry.fields };
    if (value) fields[key] = value;
    else delete fields[key];
    updateBibleEntry(entry.id, { fields });
  };

  return (
    <div>
      <label className="field">
        <span>Nimi</span>
        <input className="input" style={{ fontFamily: 'var(--font-serif)', fontSize: 20 }} value={entry.name} onChange={e => updateBibleEntry(entry.id, { name: e.target.value })} />
      </label>
      <label className="field">
        <span>Lyhyesti</span>
        <input className="input" value={entry.summary} placeholder="Yhden rivin kuvaus" onChange={e => updateBibleEntry(entry.id, { summary: e.target.value })} />
      </label>

      <div className="label" style={{ margin: '18px 0 8px' }}>Ominaisuudet</div>
      {fieldNames.map(key => (
        <div className="kv" key={key}>
          <span className="muted">{key}</span>
          <input className="input" value={entry.fields[key] ?? ''} onChange={e => setField(key, e.target.value)} />
          <span />
        </div>
      ))}
      <form
        className="kv"
        onSubmit={e => {
          e.preventDefault();
          const key = newField.trim();
          if (key && !(key in entry.fields)) setField(key, '–');
          setNewField('');
        }}
      >
        <input className="input" placeholder="Uusi kenttä" value={newField} onChange={e => setNewField(e.target.value)} />
        <span />
        <button className="btn small" type="submit">Lisää</button>
      </form>

      <label className="field" style={{ marginTop: 18 }}>
        <span>Muistiinpanot</span>
        <textarea className="textarea" rows={10} value={entry.body} onChange={e => updateBibleEntry(entry.id, { body: e.target.value })} />
      </label>

      <button
        className="btn danger small"
        onClick={() => {
          if (confirm(`Poistetaanko "${entry.name}"?`)) {
            void deleteBibleEntry(entry.id);
            onDeleted();
          }
        }}
      >
        Poista
      </button>
    </div>
  );
}

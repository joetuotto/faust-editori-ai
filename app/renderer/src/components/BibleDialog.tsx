import { useMemo, useState } from 'react';
import type { BibleEntry, BibleKind } from '../../../shared/types';
import { useStore } from '../store';
import { Dialog } from './Dialog';
import { generateEntry, type EntryDraft } from '../ai/entryGenerator';

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
  const [generating, setGenerating] = useState(false);
  const aiAllowed = useStore(s => s.theme === 'DEIS' || s.noxAssist);

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
          {aiAllowed && (
            <button
              className={`btn small ghost${generating ? ' active' : ''}`}
              style={{ width: '100%', marginBottom: 8 }}
              onClick={() => {
                setGenerating(true);
                setSelected(null);
              }}
            >
              ✨ Luonnostele AI:lla
            </button>
          )}
          {entries.map(e => (
            <div
              key={e.id}
              className={`list-item${e.id === selected ? ' active' : ''}`}
              onClick={() => {
                setSelected(e.id);
                setGenerating(false);
              }}
            >
              <div className="name">{e.name}</div>
              {e.summary && <div className="summary">{e.summary}</div>}
            </div>
          ))}
          {entries.length === 0 && <p className="muted" style={{ padding: 8 }}>Ei vielä merkintöjä.</p>}
        </div>
        <div className="detail">
          {generating ? (
            <EntryGenerator
              key={kind}
              kind={kind}
              singular={config.singular}
              fields={config.fields}
              onDone={id => {
                setGenerating(false);
                setSelected(id);
              }}
            />
          ) : current ? (
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

/** Describe an entry in a line, let the AI draft it, edit, then add it */
function EntryGenerator({ kind, singular, fields, onDone }: { kind: BibleKind; singular: string; fields: string[]; onDone(id: string | null): void }) {
  const [brief, setBrief] = useState('');
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [call, setCall] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { addBibleEntry, updateBibleEntry, notify } = useStore.getState();

  const run = async () => {
    setBusy(true);
    const result = await generateEntry(useStore.getState().project!, kind, brief, fields, setCall);
    setBusy(false);
    setCall(null);
    if (result.ok) setDraft({ ...result.data, fields: result.data.fields ?? [] });
    else notify(result.error, 'error');
  };

  const accept = () => {
    if (!draft) return;
    const id = addBibleEntry(kind, draft.name.trim() || `Uusi ${singular}`);
    if (!id) return;
    const entryFields: Record<string, string> = {};
    for (const f of draft.fields) if (f.name.trim() && f.value.trim()) entryFields[f.name.trim().toLowerCase()] = f.value.trim();
    updateBibleEntry(id, { summary: draft.summary, fields: entryFields, body: draft.body });
    notify(`${draft.name} lisättiin tietopankkiin.`);
    onDone(id);
  };

  const setField = (index: number, value: string) =>
    setDraft(d => (d ? { ...d, fields: d.fields.map((f, i) => (i === index ? { ...f, value } : f)) } : d));

  return (
    <div className="entry-generator">
      <label className="field">
        <span>Millainen {singular}?</span>
        <textarea
          className="textarea"
          rows={3}
          autoFocus
          value={brief}
          placeholder={kind === 'characters' ? 'esim. päähenkilön isosisko, joka jäi kotiseudulle ja kantaa kaunaa' : 'lyhyt kuvaus tai tyhjä'}
          onChange={e => setBrief(e.target.value)}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn primary small" disabled={busy} onClick={() => void run()}>
          {busy ? 'Luonnostellaan…' : draft ? 'Luonnostele uudelleen' : 'Luonnostele'}
        </button>
        {busy && call && (
          <button className="btn small" onClick={() => window.faust.ai.cancel(call)}>
            Pysäytä
          </button>
        )}
        <div className="spacer" />
        <button className="btn ghost small" onClick={() => onDone(null)}>
          Peruuta
        </button>
      </div>

      {draft && (
        <div className="draft">
          <label className="field">
            <span>Nimi</span>
            <input className="input" style={{ fontFamily: 'var(--font-serif)', fontSize: 20 }} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Lyhyesti</span>
            <input className="input" value={draft.summary} onChange={e => setDraft({ ...draft, summary: e.target.value })} />
          </label>
          {draft.fields.map((f, i) => (
            <div className="kv" key={i}>
              <span className="muted">{f.name}</span>
              <input className="input" value={f.value} onChange={e => setField(i, e.target.value)} />
              <span />
            </div>
          ))}
          <label className="field" style={{ marginTop: 12 }}>
            <span>Muistiinpanot</span>
            <textarea className="textarea" rows={6} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} />
          </label>
          <button className="btn primary" onClick={accept}>
            Lisää tietopankkiin
          </button>
        </div>
      )}
    </div>
  );
}

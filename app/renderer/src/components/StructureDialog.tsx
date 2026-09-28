import { useMemo, useRef, useState } from 'react';
import type { BibleEntry, BibleKind } from '../../../shared/types';
import { presence, sceneList, threadWarnings } from '../../../shared/structure';
import { estimateTension } from '../ai/tension';
import { useStore } from '../store';
import { Dialog } from './Dialog';
import { PacingChart } from './charts/PacingChart';
import { PresenceGrid } from './charts/PresenceGrid';

type Tab = 'pacing' | 'threads' | 'characters' | 'table';

function byKind(bible: Record<string, BibleEntry>, kind: BibleKind): BibleEntry[] {
  return Object.values(bible)
    .filter(e => e.kind === kind)
    .sort((a, b) => a.name.localeCompare(b.name, 'fi'));
}

export function StructureDialog() {
  const project = useStore(s => s.project)!;
  const aiAllowed = useStore(s => s.theme === 'DEIS' || s.noxAssist);
  const { setPanel, setActive, updateMeta, notify } = useStore.getState();
  const [tab, setTab] = useState<Tab>('pacing');
  const [progress, setProgress] = useState<string | null>(null);
  const callId = useRef<string | null>(null);

  const scenes = useMemo(() => sceneList(project), [project]);
  const bible = project.bible;
  const threads = useMemo(() => presence(scenes, byKind(bible, 'threads'), 'threads'), [scenes, bible]);
  const characters = useMemo(() => presence(scenes, byKind(bible, 'characters'), 'characters'), [scenes, bible]);
  const warnings = useMemo(() => threadWarnings(scenes, threads), [scenes, threads]);

  const open = (id: string) => {
    setActive(id);
    setPanel('none');
  };

  const toggle = (key: 'threads' | 'characters') => (sceneId: string, entryId: string) => {
    const current = project.docs[sceneId]?.meta[key] ?? [];
    updateMeta(sceneId, { [key]: current.includes(entryId) ? current.filter(x => x !== entryId) : [...current, entryId] });
  };

  const estimate = async () => {
    const missing = scenes.filter(s => s.tension === undefined && s.words > 0);
    const target = missing.length > 0 ? missing : scenes;
    setProgress(`0 / ${target.length}`);
    const { scores, error } = await estimateTension(project, target, (done, total) => setProgress(`${done} / ${total}`), id => (callId.current = id));
    callId.current = null;
    setProgress(null);
    for (const [id, tension] of Object.entries(scores)) updateMeta(id, { tension });
    if (error) notify(error, 'error');
    else notify(`Jännite arvioitu ${Object.keys(scores).length} kohtaukselle. Voit korjata arvoja tarkastelijassa.`);
  };

  const withTension = scenes.filter(s => s.tension !== undefined).length;

  return (
    <Dialog
      title="Rakenne"
      large
      onClose={() => {
        if (callId.current) window.faust.ai.cancel(callId.current);
        setPanel('none');
      }}
      tabs={
        <div className="tabs">
          <button className={tab === 'pacing' ? 'active' : ''} onClick={() => setTab('pacing')}>Rytmi</button>
          <button className={tab === 'threads' ? 'active' : ''} onClick={() => setTab('threads')}>Juonilangat</button>
          <button className={tab === 'characters' ? 'active' : ''} onClick={() => setTab('characters')}>Henkilöt</button>
          <button className={tab === 'table' ? 'active' : ''} onClick={() => setTab('table')}>Taulukko</button>
        </div>
      }
    >
      {scenes.length === 0 ? (
        <p className="muted">Ei vielä kohtauksia.</p>
      ) : tab === 'pacing' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span className="muted">
              {scenes.length} kohtausta · jännite merkitty {withTension}:lle. Klikkaa saraketta avataksesi kohtauksen.
            </span>
            <div className="spacer" />
            {aiAllowed && (
              <button className="btn small" disabled={!!progress} onClick={() => void estimate()}>
                {progress ? `Arvioidaan… ${progress}` : withTension < scenes.length ? 'Arvioi puuttuvat jännitteet (AI)' : 'Arvioi jännite uudelleen (AI)'}
              </button>
            )}
          </div>
          <PacingChart scenes={scenes} onSelect={open} />
        </>
      ) : tab === 'threads' ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Missä kohtauksissa kukin juonilanka on esillä. Klikkaa ruutua merkitäksesi.</p>
          <PresenceGrid scenes={scenes} rows={threads} onToggle={toggle('threads')} />
          {warnings.length > 0 && (
            <div className="warning-list">
              {warnings.map(w => (
                <div key={w}>{w}</div>
              ))}
            </div>
          )}
        </>
      ) : tab === 'characters' ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Missä kohtauksissa kukin henkilö esiintyy.</p>
          <PresenceGrid scenes={scenes} rows={characters} onToggle={toggle('characters')} />
        </>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Luku</th>
              <th>Kohtaus</th>
              <th className="num">Sanoja</th>
              <th className="num">Jännite</th>
              <th className="num">Dialogia</th>
              <th>Näkökulma</th>
              <th>Aika</th>
              <th>Juonilangat</th>
            </tr>
          </thead>
          <tbody>
            {scenes.map(s => (
              <tr key={s.id} onClick={() => open(s.id)} style={{ cursor: 'pointer' }}>
                <td>{s.chapter}</td>
                <td>{s.title}</td>
                <td className="num">{s.words.toLocaleString('fi-FI')}</td>
                <td className="num">{s.tension ?? '–'}</td>
                <td className="num">{Math.round(s.dialogueShare * 100)} %</td>
                <td>{s.pov ?? ''}</td>
                <td>{s.storyTime ?? ''}</td>
                <td>{s.threads.map(id => project.bible[id]?.name).filter(Boolean).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Dialog>
  );
}

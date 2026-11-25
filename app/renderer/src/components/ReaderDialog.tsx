import { useEffect, useMemo, useRef, useState } from 'react';
import { countWords } from '../../../shared/text';
import { sceneList } from '../../../shared/structure';
import { PERSONAS, manuscriptText, readAsBetaReader, type PersonaId, type QuoteNote, type SavedReport } from '../ai/reader';
import { getActiveEditor } from '../editor/activeEditor';
import { indexText } from '../editor/provenance';
import { useStore } from '../store';
import { Dialog } from './Dialog';

const MAX_SAVED = 10;
const dateFormat = new Intl.DateTimeFormat('fi-FI', { dateStyle: 'medium', timeStyle: 'short' });

/** Open the document that contains `quote` and select it */
function reveal(quote: string) {
  const { project, setActive, setPanel, notify } = useStore.getState();
  if (!project) return;
  const needle = quote.replace(/[.…"”]+$/, '').slice(0, 60);
  const docId = Object.keys(project.docs).find(id => project.docs[id].body.replace(/[*_]/g, '').includes(needle));
  if (!docId) {
    notify('Lainausta ei löytynyt tekstistä sellaisenaan.');
    return;
  }
  setActive(docId);
  setPanel('none');
  // Wait for the editor of that document to mount, then select the passage
  setTimeout(() => {
    const editor = getActiveEditor(docId);
    if (!editor) return;
    const { text, positions } = indexText(editor.state.doc);
    const i = text.indexOf(needle);
    if (i < 0) return;
    editor.chain().focus().setTextSelection({ from: positions[i], to: positions[i + needle.length - 1] + 1 }).scrollIntoView().run();
  }, 150);
}

function Notes({ title, notes }: { title: string; notes: QuoteNote[] }) {
  if (notes.length === 0) return null;
  return (
    <section className="update-section">
      <div className="label">{title}</div>
      {notes.map((n, i) => (
        <div key={i} className="reader-note">
          <button className="quote" onClick={() => reveal(n.quote)} title="Näytä tekstissä">
            ”{n.quote}”
          </button>
          <div>{n.why}</div>
        </div>
      ))}
    </section>
  );
}

export function ReaderDialog() {
  const project = useStore(s => s.project)!;
  const activeId = useStore(s => s.activeId);
  const { setPanel } = useStore.getState();
  const [persona, setPersona] = useState<PersonaId>('reader');
  const [scope, setScope] = useState<'chapter' | 'all'>('chapter');
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [shown, setShown] = useState<SavedReport | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const callId = useRef<string | null>(null);

  useEffect(() => {
    void window.faust.project.readInternal('reader.json').then(raw => {
      if (!raw) return;
      try {
        const list = JSON.parse(raw) as SavedReport[];
        setSaved(list);
        setShown(list[0] ?? null);
      } catch {
        // ignore
      }
    });
  }, []);

  const scenes = useMemo(() => sceneList(project), [project]);
  const activeChapter = scenes.find(s => s.id === activeId)?.chapterId;
  const selected = useMemo(
    () => (scope === 'all' ? scenes : scenes.filter(s => s.chapterId === (activeChapter ?? scenes[0]?.chapterId))),
    [scope, scenes, activeChapter]
  );
  const scopeLabel = scope === 'all' ? 'Koko käsikirjoitus' : (selected[0]?.chapter ?? '');
  const text = useMemo(() => manuscriptText(project, selected), [project, selected]);
  const words = countWords(text);

  const run = async () => {
    setStatus('Esilukija lukee…');
    const result = await readAsBetaReader(project, text, persona, id => (callId.current = id));
    callId.current = null;
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    setStatus(null);
    const report: SavedReport = { at: new Date().toISOString(), persona, scope: scopeLabel, report: result.data };
    const list = [report, ...saved].slice(0, MAX_SAVED);
    setSaved(list);
    setShown(report);
    void window.faust.project.writeInternal('reader.json', JSON.stringify(list, null, 1));
  };

  const r = shown?.report;

  return (
    <Dialog
      title="Esilukija"
      large
      onClose={() => {
        if (callId.current) window.faust.ai.cancel(callId.current);
        setPanel('none');
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <label className="field" style={{ margin: 0 }}>
          <span>Lukija</span>
          <select className="select" value={persona} onChange={e => setPersona(e.target.value as PersonaId)}>
            {PERSONAS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span>Luettava</span>
          <select className="select" value={scope} onChange={e => setScope(e.target.value as 'chapter' | 'all')}>
            <option value="chapter">Nykyinen luku</option>
            <option value="all">Koko käsikirjoitus</option>
          </select>
        </label>
        <span className="muted" style={{ paddingBottom: 8 }}>
          {scopeLabel}: {words.toLocaleString('fi-FI')} sanaa
          {words > 30000 ? ' (pitkä teksti: lukeminen vie aikaa ja maksaa enemmän)' : ''}
        </span>
        <div className="spacer" />
        <button className="btn primary" disabled={(!!status && status.endsWith('…')) || words === 0} onClick={() => void run()}>
          Lue ja kommentoi
        </button>
      </div>

      {status && <p className="muted">{status}</p>}

      {saved.length > 1 && (
        <div className="chart-legend">
          {saved.map(s => (
            <button key={s.at} className={`chip${s === shown ? ' active' : ''}`} style={{ background: 'none', cursor: 'pointer' }} onClick={() => setShown(s)}>
              {dateFormat.format(new Date(s.at))} · {PERSONAS.find(p => p.id === s.persona)?.label} · {s.scope}
            </button>
          ))}
        </div>
      )}

      {r ? (
        <div className="reader-report">
          <p className="first-impression">{r.firstImpression}</p>
          <p>
            <strong>Jatkaisinko lukemista? {r.wouldContinue.answer}.</strong> {r.wouldContinue.why}
          </p>
          <Notes title="Tässä mielenkiintoni herpaantui" notes={r.lostInterest} />
          <Notes title="Tässä putosin kärryiltä" notes={r.confusing} />
          <Notes title="Tämä toimi" notes={r.strongest} />
          {r.questions.length > 0 && (
            <section className="update-section">
              <div className="label">Kysymyksiä, jotka jäivät mieleen</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {r.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        !status && <p className="muted">Esilukija lukee tekstin ensikertalaisena ja kertoo, missä kohdin mielenkiinto herpaantui, mikä jäi epäselväksi ja mikä toimi. Lainauksia klikkaamalla pääset suoraan kohtaan.</p>
      )}
    </Dialog>
  );
}

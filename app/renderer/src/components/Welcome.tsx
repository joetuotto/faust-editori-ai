import { useEffect, useState } from 'react';
import type { RecentProject } from '../../../shared/types';
import { importLegacy, newProject, openProjectDialog, openRecent } from '../actions';

export function Welcome() {
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void window.faust.app.getSettings().then(s => setRecent(s.recent));
  }, []);

  const forget = async (path: string) => {
    const settings = await window.faust.app.forgetRecent(path);
    setRecent(settings.recent);
  };

  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>FAUST</h1>
        <p className="tagline">Päivä ja yö eivät ole teemoja, vaan hermoston kaksi rytmiä.</p>

        {creating ? (
          <form
            className="actions"
            onSubmit={e => {
              e.preventDefault();
              void newProject(title);
            }}
          >
            <input
              className="input"
              style={{ flex: 1 }}
              autoFocus
              placeholder="Teoksen nimi"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
            <button className="btn primary" type="submit">
              Valitse kansio ja luo
            </button>
            <button className="btn ghost" type="button" onClick={() => setCreating(false)}>
              Peruuta
            </button>
          </form>
        ) : (
          <div className="actions">
            <button className="btn primary" onClick={() => setCreating(true)}>
              Uusi projekti
            </button>
            <button className="btn" onClick={() => void openProjectDialog()}>
              Avaa projekti…
            </button>
            <button className="btn" onClick={() => void importLegacy()}>
              Tuo vanha .faust-tiedosto…
            </button>
          </div>
        )}

        {recent.length > 0 && (
          <>
            <div className="label" style={{ marginBottom: 6 }}>
              Viimeisimmät
            </div>
            {recent.map(r => (
              <div key={r.path} className="recent-item" onClick={() => void openRecent(r.path)}>
                <div>
                  <div className="name">{r.title}</div>
                  <div className="path">{r.path}</div>
                </div>
                <button
                  className="btn ghost small"
                  title="Poista listalta"
                  onClick={e => {
                    e.stopPropagation();
                    void forget(r.path);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

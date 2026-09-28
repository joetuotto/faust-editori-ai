import { useEffect, useState } from 'react';
import type { ModelInfo, ProviderId } from '../../../shared/types';
import { PROVIDERS, SUGGESTED_MODELS, resolveModel } from '../../../shared/models';
import { useStore } from '../store';
import { Dialog } from './Dialog';

type Tab = 'project' | 'ai';

export function SettingsDialog() {
  const [tab, setTab] = useState<Tab>('project');
  const { setPanel } = useStore.getState();

  return (
    <Dialog
      title="Asetukset"
      onClose={() => setPanel('none')}
      tabs={
        <div className="tabs">
          <button className={tab === 'project' ? 'active' : ''} onClick={() => setTab('project')}>Teos</button>
          <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>AI ja avaimet</button>
        </div>
      }
    >
      {tab === 'project' ? <ProjectSettings /> : <AISettings />}
    </Dialog>
  );
}

function ProjectSettings() {
  const manifest = useStore(s => s.project!.manifest);
  const spellcheck = useStore(s => s.spellcheck);
  const { updateManifest, setSpellcheck } = useStore.getState();

  return (
    <div>
      <label className="field">
        <span>Nimi</span>
        <input className="input" value={manifest.title} onChange={e => updateManifest({ title: e.target.value })} />
      </label>
      <label className="field">
        <span>Kirjoittaja</span>
        <input className="input" value={manifest.author} onChange={e => updateManifest({ author: e.target.value })} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label className="field">
          <span>Laji</span>
          <input className="input" value={manifest.genre} onChange={e => updateManifest({ genre: e.target.value })} />
        </label>
        <label className="field">
          <span>Kieli</span>
          <select className="select" value={manifest.language} onChange={e => updateManifest({ language: e.target.value })}>
            <option value="fi">suomi</option>
            <option value="sv">ruotsi</option>
            <option value="en">englanti</option>
          </select>
        </label>
        <label className="field">
          <span>Tavoite (sanaa)</span>
          <input
            className="input"
            type="number"
            min={0}
            value={manifest.targets.totalWords}
            onChange={e => updateManifest({ targets: { ...manifest.targets, totalWords: Number(e.target.value) || 0 } })}
          />
        </label>
        <label className="field">
          <span>Päivätavoite (sanaa)</span>
          <input
            className="input"
            type="number"
            min={0}
            value={manifest.targets.dailyWords}
            onChange={e => updateManifest({ targets: { ...manifest.targets, dailyWords: Number(e.target.value) || 0 } })}
          />
        </label>
      </div>
      <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={spellcheck} onChange={e => setSpellcheck(e.target.checked)} />
        <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13, color: 'var(--text)' }}>
          Oikoluku ja kielioppi (Voikko, suomenkieliset teokset). Tarkistus tehdään omalla koneellasi.
        </span>
      </label>
      <button className="btn small" onClick={() => void window.faust.project.reveal()}>
        Näytä projektikansio
      </button>
    </div>
  );
}

function AISettings() {
  const ai = useStore(s => s.project!.manifest.ai);
  const { updateManifest, notify } = useStore.getState();
  const [status, setStatus] = useState<Record<ProviderId, boolean> | null>(null);
  const [keyInput, setKeyInput] = useState<Partial<Record<ProviderId, string>>>({});
  const [liveModels, setLiveModels] = useState<Partial<Record<ProviderId, ModelInfo[]>>>({});
  const [loading, setLoading] = useState<ProviderId | null>(null);

  useEffect(() => {
    void window.faust.ai.keyStatus().then(setStatus);
  }, []);

  const saveKey = async (provider: ProviderId) => {
    const { encrypted } = await window.faust.ai.setKey(provider, keyInput[provider] ?? '');
    setKeyInput(k => ({ ...k, [provider]: '' }));
    setStatus(await window.faust.ai.keyStatus());
    notify(encrypted ? 'Avain tallennettu salattuna.' : 'Avain tallennettu (salaus ei käytettävissä tässä järjestelmässä).');
  };

  const fetchModels = async (provider: ProviderId) => {
    setLoading(provider);
    const result = await window.faust.ai.listModels(provider);
    setLoading(null);
    if (result.success) setLiveModels(m => ({ ...m, [provider]: result.models }));
    else notify(result.error ?? 'Mallilistan haku epäonnistui', 'error');
  };

  const setModel = (provider: ProviderId, model: string) =>
    updateManifest({ ai: { ...ai, models: { ...ai.models, [provider]: model } } });

  return (
    <div>
      <label className="field">
        <span>Käytettävä palvelu</span>
        <select className="select" value={ai.provider} onChange={e => updateManifest({ ai: { ...ai, provider: e.target.value as ProviderId } })}>
          {PROVIDERS.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
              {status && !status[p.id] ? ' (ei avainta)' : ''}
            </option>
          ))}
        </select>
      </label>

      {PROVIDERS.map(p => {
        const options = liveModels[p.id] ?? SUGGESTED_MODELS.filter(m => m.provider === p.id).map(m => ({ id: m.model, name: m.name }));
        const current = resolveModel(p.id, ai.models[p.id]);
        return (
          <section key={p.id} style={{ borderTop: '1px solid var(--border)', padding: '14px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontWeight: 500 }}>{p.name}</strong>
              <span className={status?.[p.id] ? '' : 'muted'}>{status?.[p.id] ? '● avain tallennettu' : '○ ei avainta'}</span>
            </div>
            <div className="kv" style={{ gridTemplateColumns: '1fr auto' }}>
              <input
                className="input"
                type="password"
                autoComplete="off"
                placeholder={status?.[p.id] ? 'Vaihda avain (tyhjä = poista)' : p.keyName}
                value={keyInput[p.id] ?? ''}
                onChange={e => setKeyInput(k => ({ ...k, [p.id]: e.target.value }))}
              />
              <button className="btn small" onClick={() => void saveKey(p.id)}>Tallenna</button>
            </div>
            <div className="kv" style={{ gridTemplateColumns: '1fr auto' }}>
              <select className="select" value={current} onChange={e => setModel(p.id, e.target.value)}>
                {!options.some(o => o.id === current) && <option value={current}>{current}</option>}
                {options.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.name === o.id ? o.id : `${o.name} (${o.id})`}
                  </option>
                ))}
              </select>
              <button className="btn small" disabled={!status?.[p.id] || loading === p.id} onClick={() => void fetchModels(p.id)}>
                {loading === p.id ? 'Haetaan…' : 'Hae mallit'}
              </button>
            </div>
          </section>
        );
      })}
      <p className="muted">
        Avaimet tallennetaan käyttöjärjestelmän avainnipulla salattuina, eivätkä ne päädy projektikansioon. Käsikirjoituksen tekstiä
        lähetetään AI-palveluun vain, kun käytät avustajaa.
      </p>
    </div>
  );
}

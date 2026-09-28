import { useEffect, useMemo, useState } from 'react';
import type { ModelInfo, ProviderId } from '../../../shared/types';
import { OLLAMA_DEFAULT_URL, PROVIDERS, SUGGESTED_MODELS, formatCost, priceFor, resolveModel, type ModelPrice } from '../../../shared/models';
import { localDate, summarizeUsage, usedModels } from '../../../shared/usage';
import { useUsage } from '../ai/usage';
import { useStore } from '../store';
import { Dialog } from './Dialog';

type Tab = 'project' | 'ai' | 'usage';

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
          <button className={tab === 'usage' ? 'active' : ''} onClick={() => setTab('usage')}>AI-kulut</button>
        </div>
      }
    >
      {tab === 'project' ? <ProjectSettings /> : tab === 'ai' ? <AISettings /> : <UsageSettings />}
    </Dialog>
  );
}

function ProjectSettings() {
  const manifest = useStore(s => s.project!.manifest);
  const spellcheck = useStore(s => s.spellcheck);
  const noxAssist = useStore(s => s.noxAssist);
  const { updateManifest, setSpellcheck, setNoxAssist } = useStore.getState();

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
      <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={noxAssist} onChange={e => setNoxAssist(e.target.checked)} />
        <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13, color: 'var(--text)' }}>
          Salli AI-muutosehdotukset NOX-tilassa. Oletuksena NOX on kirjoittamista varten, ja avustaja vain kysyy.
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
              <span className={status?.[p.id] ? '' : 'muted'}>
                {p.local ? 'omalla koneella, ei avainta' : status?.[p.id] ? '● avain tallennettu' : '○ ei avainta'}
              </span>
            </div>
            <div className="kv" style={{ gridTemplateColumns: '1fr auto' }}>
              <input
                className="input"
                type={p.local ? 'text' : 'password'}
                autoComplete="off"
                placeholder={p.local ? `Osoite (oletus ${OLLAMA_DEFAULT_URL})` : status?.[p.id] ? 'Vaihda avain (tyhjä = poista)' : p.keyName}
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
        Ollama ajaa mallit omalla koneellasi: teksti ei lähde verkkoon eikä käytöstä tule kuluja. Asenna Ollama, lataa malli (esim.{' '}
        <code>ollama pull gemma3</code>) ja valitse se yltä. Paikalliset mallit eivät hae tietoja projektista itse, joten ne saavat
        tietopankin kokonaan kehotteessa.
      </p>
      <p className="muted">
        Avaimet tallennetaan käyttöjärjestelmän avainnipulla salattuina, eivätkä ne päädy projektikansioon. Käsikirjoituksen tekstiä
        lähetetään AI-palveluun vain, kun käytät avustajaa.
      </p>
    </div>
  );
}

/** AI usage of this project and the prices used for the estimate */
function UsageSettings() {
  const usage = useUsage();
  const prices = useStore(s => s.prices);
  const [draft, setDraft] = useState<Record<string, { input: string; output: string }>>({});

  const month = localDate().slice(0, 7);
  const rows = useMemo(
    () => [
      { label: 'Tänään', summary: summarizeUsage(usage, d => d === localDate(), prices) },
      { label: 'Tämä kuukausi', summary: summarizeUsage(usage, d => d.startsWith(month), prices) },
      { label: 'Yhteensä', summary: summarizeUsage(usage, () => true, prices) }
    ],
    [usage, prices, month]
  );
  const models = useMemo(() => usedModels(usage), [usage]);

  const savePrice = (model: string, field: keyof ModelPrice, value: string) => {
    const current = draft[model] ?? { input: '', output: '' };
    const next = { ...current, [field]: value };
    setDraft(d => ({ ...d, [model]: next }));
    const input = Number(next.input.replace(',', '.'));
    const output = Number(next.output.replace(',', '.'));
    const updated = { ...prices };
    if (next.input === '' && next.output === '') delete updated[model];
    else if (Number.isFinite(input) && Number.isFinite(output)) updated[model] = { input, output };
    else return;
    useStore.setState({ prices: updated });
    void window.faust.app.setPrices(updated);
  };

  return (
    <div>
      <table className="usage-table">
        <thead>
          <tr>
            <th>Tämä projekti</th>
            <th>Kutsuja</th>
            <th>Tokenia sisään</th>
            <th>Ulos</th>
            <th>Arvio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, summary }) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{summary.calls}</td>
              <td>{summary.inputTokens.toLocaleString('fi-FI')}</td>
              <td>{summary.outputTokens.toLocaleString('fi-FI')}</td>
              <td>
                {formatCost(summary.cost)}
                {summary.unpriced.length ? ' +?' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 style={{ margin: '20px 0 6px', fontWeight: 500 }}>Hinnat (USD / miljoona tokenia)</h4>
      {models.length === 0 ? (
        <p className="muted">AI:ta ei ole vielä käytetty tässä projektissa.</p>
      ) : (
        <table className="usage-table">
          <thead>
            <tr>
              <th>Malli</th>
              <th>Sisään</th>
              <th>Ulos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {models.map(({ provider, model }) => {
              const own = prices[model];
              const list = priceFor(provider, model);
              const value = draft[model] ?? { input: own ? String(own.input) : '', output: own ? String(own.output) : '' };
              return (
                <tr key={`${provider}/${model}`}>
                  <td>{model}</td>
                  <td>
                    <input className="input" value={value.input} placeholder={list ? String(list.input) : '?'} onChange={e => savePrice(model, 'input', e.target.value)} />
                  </td>
                  <td>
                    <input className="input" value={value.output} placeholder={list ? String(list.output) : '?'} onChange={e => savePrice(model, 'output', e.target.value)} />
                  </td>
                  <td className="muted">{own ? 'oma' : list ? 'lista' : 'ei hintaa'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="muted">
        Kulut ovat arvio: tokenimäärät tulevat palvelulta, hinnat ovat julkisista hinnastoista koottuja oletuksia. Jos palvelun hinta on
        muuttunut tai mallilla ei ole hintaa, kirjoita oma hinta yllä. Välimuistista luetut tokenit lasketaan 10 %:n ja välimuistiin
        kirjoitetut 125 %:n hinnalla. Paikalliset mallit ovat ilmaisia.
      </p>
    </div>
  );
}

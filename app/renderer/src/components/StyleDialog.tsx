import { useMemo, useState } from 'react';
import type { StyleMetrics } from '../../../shared/style';
import { STYLE_DESCRIPTION_PROMPT, measureOwnStyle, ownManuscriptText, styleSample } from '../ai/style';
import { currentModel } from '../ai/request';
import { useStore } from '../store';
import { Dialog } from './Dialog';

const fmt = (n: number, digits = 1) => n.toLocaleString('fi-FI', { maximumFractionDigits: digits, minimumFractionDigits: digits });

function rows(m: StyleMetrics): { label: string; value: string; hint: string }[] {
  return [
    { label: 'Lauseen pituus', value: `${fmt(m.sentenceLength)} sanaa`, hint: 'Keskimäärin. Suomalaisessa proosassa tyypillisesti 8–14.' },
    { label: 'Rytmin vaihtelu', value: `± ${fmt(m.sentenceVariation)} sanaa`, hint: 'Suuri vaihtelu = lyhyitä ja pitkiä lauseita sekaisin.' },
    { label: 'Sanan pituus', value: `${fmt(m.wordLength)} kirjainta`, hint: 'Pitkät sanat tekevät tekstistä raskaampaa.' },
    { label: 'Sanaston rikkaus', value: fmt(m.lexicalDiversity * 100, 0), hint: 'Eri sanojen osuus 100 sanan ikkunassa (MATTR).' },
    { label: 'Dialogia', value: `${fmt(m.dialogueShare * 100, 0)} % kappaleista`, hint: m.dialogueStyle === 'dash' ? 'Repliikkiviiva (–)' : m.dialogueStyle === 'quotes' ? 'Lainausmerkit (”)' : 'Ei dialogia' },
    { label: 'Kappaleen pituus', value: `${fmt(m.paragraphLength)} virkettä`, hint: 'Keskimäärin.' },
    { label: 'Ajatusviivoja', value: `${fmt(m.dashRate)} / 1000 sanaa`, hint: '' },
    { label: 'Kysymyksiä / huudahduksia', value: `${fmt(m.questionRate)} / ${fmt(m.exclamationRate)}`, hint: 'Tuhatta sanaa kohden.' }
  ];
}

export function StyleDialog() {
  const project = useStore(s => s.project)!;
  const provenance = useStore(s => s.provenance);
  const style = useStore(s => s.style);
  const { setPanel, setStyle, notify } = useStore.getState();
  const [busy, setBusy] = useState(false);

  const metrics = useMemo(() => measureOwnStyle(project, provenance), [project, provenance]);

  const save = (description: string) =>
    setStyle({ metrics, description, updated: new Date().toISOString() });

  const describe = async () => {
    const sample = styleSample(ownManuscriptText(project, provenance));
    if (!sample) {
      notify('Tekstiä on vielä liian vähän tyylin kuvaamiseen.', 'error');
      return;
    }
    setBusy(true);
    const call = window.faust.ai.generate({
      ...currentModel(),
      messages: [{ role: 'user', content: `${STYLE_DESCRIPTION_PROMPT}\n\n<otteet>\n${sample}\n</otteet>` }],
      maxTokens: 2000
    });
    const result = await call.result;
    setBusy(false);
    if (result.success && result.text) save(result.text.trim());
    else notify(result.error ?? 'Tyylikuvauksen luonti epäonnistui', 'error');
  };

  return (
    <Dialog title="Tyylisormenjälki" onClose={() => setPanel('none')}>
      <p className="muted" style={{ marginTop: 0 }}>
        Mitattu vain omasta tekstistäsi ({metrics.words.toLocaleString('fi-FI')} sanaa); AI:n kirjoittamat ja muokkaamat kohdat on
        jätetty pois. Muutosehdotuksia verrataan näihin, ja poikkeamista kerrotaan ennen kuin hyväksyt ne.
      </p>

      {metrics.sentences < 20 ? (
        <p className="muted">Kirjoita vielä vähän lisää: luotettava profiili tarvitsee ainakin parikymmentä virkettä.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '6px 16px', marginBottom: 20 }}>
          {rows(metrics).map(r => (
            <div key={r.label} style={{ display: 'contents' }}>
              <span className="muted">{r.label}</span>
              <strong style={{ fontWeight: 500 }}>{r.value}</strong>
              <span className="muted" style={{ fontSize: 12 }}>{r.hint}</span>
            </div>
          ))}
        </div>
      )}

      <label className="field">
        <span>Tyylikuvaus (annetaan AI:lle muutosehdotuksia varten)</span>
        <textarea
          className="textarea"
          rows={9}
          placeholder="Kuvaile oma tyylisi tai anna AI:n luoda kuvaus otteista."
          value={style?.description ?? ''}
          onChange={e => save(e.target.value)}
        />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={busy || metrics.sentences < 20} onClick={() => void describe()}>
          {busy ? 'Luodaan…' : style?.description ? 'Luo kuvaus uudelleen' : 'Luo kuvaus AI:lla'}
        </button>
        <button className="btn ghost" onClick={() => save(style?.description ?? '')}>
          Päivitä mittarit
        </button>
      </div>
    </Dialog>
  );
}

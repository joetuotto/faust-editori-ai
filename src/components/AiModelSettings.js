/**
 * src/components/AiModelSettings.js - which model does which job, and each model's own numbers
 * (report 4.11, 5.5).
 *
 *   AiRoleModels({ config, models, onSave })                 Malli tehtävittäin (Cherry Studio only)
 *   AiModelSettings({ config, modelIds, calibration, onSave })  Mallin asetukset
 *   AiModelBadge({ role, onOpenSettings, config })           Malli: <name> and the link Tekoälyasetukset…
 *
 * config is the public config of the main process (ai:get-provider, never a key); onSave(patch)
 * sends a patch through ai:set-provider. No model id is written by the app itself: ids come
 * only from the lists the author fetched with Hae mallit, or from what is stored.
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app; the look is the
 * field, section and stat classes of styles/faust-components.css.
 */
import { Field, Section } from './ui.js';
import { count } from './Dialogs.js';
import { getAIClient } from '../services/ai/aiClient.js';
import { modelLabel } from '../services/format.fi.js';

const { createElement: e, useState, useEffect } = React;

const ROLE_ROWS = [
  ['prose', 'Proosa', 'Uuden tekstin kirjoittaminen'],
  ['edit', 'Muokkaus', 'Pikamuokkaus ja kielenhuolto'],
  ['analysis', 'Analyysi', 'Tarkistukset ja tiivistelmät']
];

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const textOf = (value) => (typeof value === 'string' ? value : '');

/** Malli tehtävittäin: one select per role; the first option follows the default model. */
export function AiRoleModels({ config, models, onSave }) {
  if (!config || config.provider !== 'cherry') return null;
  const roles = isRecord(config.roles) ? config.roles : {};
  const list = Array.isArray(models) ? models : [];

  return e(Section, { title: 'Malli tehtävittäin', className: 'faust-ai-provider' },
    e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
      ROLE_ROWS.map(([role, label, hint]) => {
        const stored = textOf(roles[role]);
        // Without a fetched list the stored id is the only other option, so the select shows it
        const options = list.length > 0 ? list : (stored ? [{ id: stored, name: modelLabel(stored) }] : []);
        // The 288px column cuts a long name in the closed select, and two models can share their
        // start: the role's own model is named whole under it
        const chosen = stored ? modelLabel(stored) : '';
        return e(Field, { key: role, label, hint: chosen ? e('span', null, hint, e('br'), 'Käytössä: ' + chosen) : hint },
          e('select', {
            className: 'faust-select faust-select--sm',
            value: stored,
            title: chosen || undefined,
            onChange: (ev) => onSave({ roles: { [role]: ev.target.value } })
          },
            e('option', { value: '' }, 'Sama kuin oletusmalli'),
            options.map(model => e('option', { key: model.id, value: model.id }, model.name || modelLabel(model.id)))
          )
        );
      })
    )
  );
}

// A whole number as the field shows it (32 000) and as it is read back (digits only)
const shown = (n) => (Number.isFinite(n) ? Number(n).toLocaleString('fi-FI') : '');
const digits = (text) => {
  const value = parseInt(String(text).replace(/\D/g, ''), 10);
  return Number.isFinite(value) ? value : null;
};

/** One number field that saves on blur and on Enter; an empty field goes back to the default. */
function NumberSetting({ label, stored, fallback, onSave }) {
  const [draft, setDraft] = useState(shown(stored));
  // A value saved elsewhere (another field, Hae mallit) replaces the draft
  useEffect(() => { setDraft(shown(stored)); }, [stored]);
  const commit = () => {
    const text = draft.trim();
    const next = text === '' ? null : digits(text);
    if (next === (Number.isFinite(stored) ? stored : null)) { setDraft(shown(stored)); return; }
    if (text !== '' && next === null) { setDraft(shown(stored)); return; }
    onSave(next);
  };
  // An empty field is empty: the default stands in the hint under it, once. (As the placeholder too,
  // the number read as a value already entered, and the hint repeated it.)
  return e(Field, { label, hint: draft.trim() === '' && Number.isFinite(fallback) ? `Oletus: ${shown(fallback)}` : undefined },
    e('input', {
      type: 'text',
      inputMode: 'numeric',
      className: 'faust-input faust-input--sm faust-num',
      value: draft,
      onChange: (ev) => setDraft(ev.target.value),
      onBlur: commit,
      onKeyDown: (ev) => { if (ev.key === 'Enter') ev.currentTarget.blur(); }
    })
  );
}

/** Mallin asetukset: window, reasoning headroom and system handling of each model in use. */
export function AiModelSettings({ config, modelIds, calibration, onSave }) {
  if (!config) return null;
  const ids = Array.from(new Set((Array.isArray(modelIds) ? modelIds : []).filter(id => typeof id === 'string' && id !== '')));
  const provider = config.provider === 'cherry' ? 'cherry' : 'anthropic';
  const defaults = isRecord(config.defaults) ? config.defaults : {};
  const defaultOf = (name) => (isRecord(defaults[name]) ? defaults[name][provider] : undefined);
  const all = isRecord(config.modelSettings) ? config.modelSettings : {};
  const measured = isRecord(calibration) ? calibration : {};
  const save = (id, field, value) => onSave({ modelSettings: { [id]: { [field]: value } } });

  return e(Section, { title: 'Mallin asetukset', className: 'faust-ai-provider' },
    ids.length === 0
      ? e('div', { className: 'faust-meta' }, 'Valitse ensin malli.')
      : e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' } },
          ids.map(id => {
            const stored = isRecord(all[id]) ? all[id] : {};
            const sample = isRecord(measured[id]) ? measured[id] : null;
            const ratio = sample && Number(sample.charsPerToken) > 0
              ? Number(sample.charsPerToken).toLocaleString('fi-FI', { maximumFractionDigits: 2 })
              : null;
            return e('div', { key: id, style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
              e('div', { className: 'faust-stat', title: id }, 'Malli: ', e('b', null, modelLabel(id))),
              e(NumberSetting, {
                label: 'Ikkuna (tokenia)',
                stored: Number.isFinite(stored.window) ? stored.window : undefined,
                fallback: defaultOf('window'),
                onSave: (value) => save(id, 'window', value)
              }),
              e(NumberSetting, {
                label: 'Päättelyvara (tokenia)',
                stored: Number.isFinite(stored.headroom) ? stored.headroom : undefined,
                fallback: defaultOf('headroom'),
                onSave: (value) => save(id, 'headroom', value)
              }),
              e('label', { className: 'faust-check' },
                e('input', {
                  type: 'checkbox',
                  checked: stored.systemAsUser === true,
                  onChange: (ev) => save(id, 'systemAsUser', ev.target.checked)
                }),
                'Lähetä ohjeet käyttäjäviestinä'),
              ratio
                ? e('div', { className: 'faust-kv' },
                    e('span', null, 'Mitattu:'),
                    e('span', null, `${ratio} merkkiä / token (${count(Number(sample.samples) || 0, 'pyyntö')})`))
                : e('div', { className: 'faust-meta' }, 'Ei vielä mittauksia.')
            );
          }),
          e('div', { className: 'faust-field__hint' },
            'Ikkuna on kehotteen ja vastauksen suurin yhteispituus. Päättelyvara lisätään vastausrajaan malleilla, jotka ajattelevat ennen vastaamista. Valitse ”Lähetä ohjeet käyttäjäviestinä”, jos malli hylkää järjestelmäviestin.')
        )
  );
}

/**
 * The model a role resolves to, in one line, and the way to change it. role 'default' is the
 * model the old handlers use (the default gateway model or the Claude model field). config is the
 * app's reactive copy of the public config; without it the badge reads the client's own copy.
 */
export function AiModelBadge({ role = 'prose', onOpenSettings, config }) {
  const client = getAIClient();
  const [own, setOwn] = useState(() => client.configSnapshot());
  useEffect(() => {
    if (config) return undefined;
    let alive = true;
    client.getConfig().then((cfg) => { if (alive && cfg) setOwn(cfg); });
    return () => { alive = false; };
  }, [config]);

  const cfg = config || own;
  const model = !cfg ? ''
    : role === 'default'
      ? textOf(cfg.provider === 'cherry' ? cfg.model : cfg.anthropicModel)
      : client.modelFor(role, { ...cfg, roles: isRecord(cfg.roles) ? cfg.roles : {} });
  // A text link (underlined), with the command's menu name (menu spec B.5: Tekoälyasetukset…). As a
  // quiet button it stood as plain text after the model id and read as a label without a value
  // Without onOpenSettings there is no link: the badge then stands on the Tekoäly tab itself, where
  // the link would only open the tab the author is reading
  const link = typeof onOpenSettings === 'function' ? e('button', {
    type: 'button',
    className: 'faust-link',
    title: 'Vaihda malli tietopaneelin Tekoäly-välilehdellä',
    onClick: onOpenSettings
  }, 'Tekoälyasetukset…') : null;

  // A model id that does not fit after "Malli:" (gateway ids run to 36 characters; the Kustannusarvio
  // card has 247px) goes whole onto the next line, and one wider than the column breaks at a hyphen:
  // the id is never cut and never runs out of its column
  const fits = { flexWrap: 'wrap', whiteSpace: 'normal', minWidth: 0, maxWidth: '100%' };
  return e('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-1) var(--sp-2)', minWidth: 0 } },
    model
      ? e('span', { className: 'faust-stat', title: model, style: fits }, 'Malli: ', e('b', { style: { minWidth: 0, overflowWrap: 'anywhere' } }, modelLabel(model)))
      : e('span', { className: 'faust-meta' }, 'Mallia ei ole valittu.'),
    link
  );
}

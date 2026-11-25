/**
 * AIProviderSettings - choose where FAUST's AI calls go, and how
 *
 * "anthropic": Claude directly with an Anthropic API key and a model typed or fetched here
 * "cherry":    any model configured in Cherry Studio, through its local API gateway
 *              (Cherry Studio: Settings → API Gateway); a default model and one per task
 *
 * Top to bottom: Tekoäly pois (with it on, nothing else is shown), the source, the source's key and
 * model, Malli tehtävittäin (Cherry Studio), Mallin asetukset, Koepyyntö. Keys never come back
 * from the main process: only whether each one is set. Every saved change goes to the main
 * process, then to the app (onProviderChange) and to the AI client, which reads the settings anew.
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 * Look: the section, field, chip and check classes of styles/faust-components.css (VF-29).
 */

import { icons } from './icons.js';
import { count } from './Dialogs.js';
import { useSetting } from './useSetting.js';
import { AiRoleModels, AiModelSettings } from './AiModelSettings.js';
import { AiTestRequest } from './AiTestRequest.js';
import { getAIClient } from '../services/ai/aiClient.js';

const { createElement: e, useState, useEffect, useCallback, useId } = React;

const SOURCES = [
  ['anthropic', 'Claude (Anthropic)'],
  ['cherry', 'Cherry Studio (omat mallit)']
];

// '<Toiminto> epäonnistui: <syy>.' with one full stop
const failed = (action, reason) =>
  `${action} epäonnistui: ${String(reason || 'tuntematon virhe').trim().replace(/\.+$/, '')}.`;

// A field's own action: the field at full width, the button right-aligned on the next line.
// reason: why the button is disabled (rule B.8), shown as its title; a busy-only disable is
// silent (R-68), so it passes no reason.
const actionButton = ({ label, onClick, disabled, busy, reason, danger }) => e('button', {
  type: 'button',
  className: 'faust-btn faust-btn--sm' + (danger ? ' faust-btn--danger' : ''),
  onClick,
  disabled: disabled || !!reason,
  title: reason || undefined,
  'aria-busy': busy || undefined
}, busy && e('span', { className: 'faust-spinner faust-spinner--sm' }), label);

// The two sentences of the model field's placeholder (M C.15 row 14) also give the reasons
const NEEDS_KEY = 'Tallenna ensin API-avain';
const NEEDS_MODELS = 'Hae mallit ensin';
// A key given in the environment wins over a stored one (electron.js getAIProviderConfig), so nothing
// done to the field would change the key in use: one sentence says so, in the author's words
const KEY_FROM_ENV = 'Avain on annettu FAUSTin käynnistysasetuksissa, eikä sitä voi vaihtaa tässä.';
const NO_KEY_STORED = 'Avainta ei ole tallennettu';

// fromEnv: the key in use was not saved by the author, so the chip does not say "tallennettu"
const keyChip = (set, fromEnv) => (set
  ? e('span', { className: 'faust-chip faust-chip--plain faust-chip--dot faust-chip--success' }, fromEnv ? 'Avain käytössä' : 'Avain tallennettu')
  : e('span', { className: 'faust-chip faust-chip--plain faust-chip--hollow' }, 'Avain puuttuu'));

const statusLine = (status) => status && e('div', {
  role: 'status',
  className: status.kind === 'error' ? 'faust-field__error' : 'faust-field__hint'
}, status.text);

const seconds = (ms) => (ms / 1000).toLocaleString('fi-FI', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Poista avain asks first (stage amendments 0.6): which key, and what stops working without it
const KEY_NAMES_FI = { CHERRY_API_KEY: 'Cherry Studion API-avain', ANTHROPIC_API_KEY: 'Clauden API-avain' };

export function AIProviderSettings({ onProviderChange, getEditorContext, askConfirm }) {
  const api = window.electronAPI;

  const [config, setConfig] = useState(null);
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('');
  const [anthropicModelInput, setAnthropicModelInput] = useState('');
  const [models, setModels] = useState([]);
  const [anthropicModels, setAnthropicModels] = useState([]);
  const [status, setStatus] = useState(null); // { kind: 'ok' | 'error' | 'info', text }
  const [busy, setBusy] = useState(null);     // null | 'models' | 'test'
  const [aiOff, setAiOff] = useSetting('aiOff', false);
  const [calibration] = useSetting('aiCalibration', {});
  const keyId = useId();
  const modelId = useId();
  const urlId = useId();
  const sourceName = useId();
  const claudeKeyId = useId();
  const claudeModelId = useId();
  const claudeListId = useId();
  const offHintId = useId();

  const applyConfig = useCallback((next) => {
    setConfig(next);
    setGatewayUrl(next.gatewayUrl || '');
    setAnthropicModelInput(next.anthropicModel || '');
    // The client reads the settings anew; the app follows through its own copy
    getAIClient().refreshConfig();
    if (onProviderChange) onProviderChange(next);
  }, [onProviderChange]);

  const loadModels = useCallback(async (current) => {
    if (!api?.aiListCherryModels) return;
    setBusy('models');
    const result = await api.aiListCherryModels();
    setBusy(null);

    if (!result.success) {
      setModels([]);
      setStatus({ kind: 'error', text: result.error });
      return;
    }

    setModels(result.models);
    setStatus({ kind: 'info', text: 'Löytyi ' + count(result.models.length, 'malli') });

    // Pick the first model if none is selected or the selected one is gone
    const selected = current?.model;
    if (result.models.length > 0 && !result.models.some(m => m.id === selected)) {
      const saved = await api.aiSetProvider({ model: result.models[0].id });
      if (saved.success) applyConfig(saved);
    }
  }, [api, applyConfig]);

  // Load current settings on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!api?.aiGetProvider) return;
      const result = await api.aiGetProvider();
      if (cancelled || !result.success) return;
      applyConfig(result);
      if (result.provider === 'cherry' && result.hasCherryKey) {
        loadModels(result);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!api?.aiGetProvider || !config) return null;

  const isCherry = config.provider === 'cherry';
  const keyFromEnv = config.keyFromEnv || {};

  // Tekoäly pois: the first element of the block, and with it on, the only one
  const offSwitch = [
    e('label', { key: 'off', className: 'faust-check' },
      e('input', {
        type: 'checkbox',
        checked: aiOff === true,
        'aria-describedby': offHintId,
        onChange: (ev) => setAiOff(ev.target.checked)
      }),
      'Tekoäly pois'),
    e('div', { key: 'off-hint', id: offHintId, className: 'faust-field__hint' },
      'Tekoälytoiminnot kätketään ja tekoälypyynnöt estetään. Tämä valinta ja tekoälyn käyttöloki jäävät näkyviin.')
  ];

  const head = e('div', { className: 'faust-section__head' },
    e('div', { className: 'faust-section__title' }, 'Tekoälyn lähde')
  );

  if (aiOff === true) {
    return e('div', { className: 'faust-ai-provider faust-section' }, head, ...offSwitch);
  }

  // A patch of the provider settings (roles, per-model settings, the Claude model)
  const savePatch = async (patch) => {
    const saved = await api.aiSetProvider(patch);
    if (saved.success) applyConfig(saved);
    else setStatus({ kind: 'error', text: saved.error });
    return saved;
  };

  const refresh = async () => {
    const refreshed = await api.aiGetProvider();
    if (refreshed.success) applyConfig(refreshed);
    return refreshed;
  };

  const changeProvider = async (provider) => {
    if (provider === config.provider) return;
    const saved = await api.aiSetProvider({ provider });
    if (!saved.success) {
      setStatus({ kind: 'error', text: saved.error });
      return;
    }
    applyConfig(saved);
    setStatus(null);
    if (saved.provider === 'cherry' && saved.hasCherryKey) loadModels(saved);
  };

  const saveGatewayUrl = async () => {
    const trimmed = gatewayUrl.trim();
    if (!trimmed || trimmed === config.gatewayUrl) return;
    const saved = await api.aiSetProvider({ gatewayUrl: trimmed });
    if (saved.success) {
      applyConfig(saved);
      if (saved.hasCherryKey) loadModels(saved);
    }
  };

  // One key at a time; the main process merges it with the rest and returns only booleans
  const writeKey = async (name, value) => {
    const result = await api.setApiKey(name, value);
    if (!result.success) {
      setStatus({ kind: 'error', text: failed('Avaimen tallennus', result.error) });
      return null;
    }
    return refresh();
  };

  const saveKey = async () => {
    const key = keyInput.trim();
    if (!key) return;
    const refreshed = await writeKey('CHERRY_API_KEY', key);
    if (!refreshed) return;
    setKeyInput('');
    if (refreshed.success) loadModels(refreshed);
  };

  const saveAnthropicKey = async () => {
    const key = anthropicKeyInput.trim();
    if (!key) return;
    const refreshed = await writeKey('ANTHROPIC_API_KEY', key);
    if (refreshed) setAnthropicKeyInput('');
  };

  const clearKey = async (name) => {
    if (typeof askConfirm === 'function') {
      const confirmed = await askConfirm(
        'Poistetaanko avain?',
        `${KEY_NAMES_FI[name]} poistetaan FAUSTin asetuksista. Tekoälypyynnöt eivät toimi tällä lähteellä, ennen kuin tallennat avaimen uudelleen.`,
        'Poista avain',
        'Peruuta',
        { danger: true }
      );
      if (!confirmed) return;
    }
    const refreshed = await writeKey(name, '');
    if (refreshed && name === 'CHERRY_API_KEY') setModels([]);
    if (refreshed && name === 'ANTHROPIC_API_KEY') setAnthropicModels([]);
  };

  const changeModel = async (model) => {
    const saved = await api.aiSetProvider({ model });
    if (saved.success) applyConfig(saved);
  };

  // A window the list knows is stored with the chosen model, unless one is stored already
  // (extract A 4.3: after Hae mallit, and when the model is chosen from the list)
  const storeKnownWindow = async (id, list, current) => {
    const known = id ? (list || []).find(m => m.id === id) : null;
    const stored = current && current.modelSettings && current.modelSettings[id];
    if (known && Number.isInteger(known.window) && !(stored && Number.isFinite(stored.window))) {
      await savePatch({ modelSettings: { [id]: { window: known.window } } });
    }
  };

  const saveAnthropicModel = async () => {
    const typed = anthropicModelInput.trim();
    if (typed === (config.anthropicModel || '')) return;
    const saved = await savePatch({ anthropicModel: typed });
    if (saved && saved.success) await storeKnownWindow(typed, anthropicModels, saved);
  };

  const loadAnthropicModels = async () => {
    if (!api?.aiListAnthropicModels) return;
    setBusy('models');
    const result = await api.aiListAnthropicModels();
    setBusy(null);
    if (!result.success) {
      setAnthropicModels([]);
      setStatus({ kind: 'error', text: result.error });
      return;
    }
    setAnthropicModels(result.models);
    setStatus({ kind: 'info', text: 'Löytyi ' + count(result.models.length, 'malli') });
    await storeKnownWindow(config.anthropicModel || '', result.models, config);
  };

  const testConnection = async () => {
    setBusy('test');
    setStatus({ kind: 'info', text: 'Testataan…' });
    const result = await api.aiTestProvider();
    setBusy(null);
    setStatus(result.success
      ? { kind: 'ok', text: `Yhteys toimii: malli vastasi ${seconds(result.ms)} sekunnissa.` }
      : { kind: 'error', text: result.error });
  };

  const modelPlaceholder = config.model
    ? (config.model.split(':').slice(1).join(':') || config.model)
    : config.hasCherryKey ? NEEDS_MODELS : NEEDS_KEY;

  // The models whose settings are shown: the default model and the three roles, or the Claude model
  const roles = config.roles || {};
  const modelIds = isCherry
    ? [config.model, roles.prose, roles.edit, roles.analysis]
    : [config.anthropicModel];

  // Poista avain: a key from the environment is not FAUST's to remove (M B.8 reason)
  const removeReason = (has, fromEnv) => (fromEnv ? KEY_FROM_ENV : !has ? NO_KEY_STORED : null);

  return e('div', { className: 'faust-ai-provider faust-section' },
    head,
    ...offSwitch,

    // Two radios, one per line: the option names of M A.3 stay whole in the 288px column
    e('div', { className: 'faust-check-group faust-check-group--column', role: 'radiogroup', 'aria-label': 'Tekoälyn lähde', style: { marginTop: 'var(--sp-3)' } },
      SOURCES.map(([value, label]) => e('label', { key: value, className: 'faust-check' },
        // The round wrapper carries the focus ring (the native radio paints any ring as a square)
        e('span', { className: 'faust-radio' },
          e('input', {
            type: 'radio',
            name: sourceName,
            value,
            checked: config.provider === value,
            disabled: config.providerFromEnv,
            onChange: () => changeProvider(value)
          })),
        label))
    ),

    config.providerFromEnv && e('div', { className: 'faust-field__hint', style: { marginTop: 'var(--sp-2)' } },
      'Lähde on asetettu ympäristömuuttujalla FAUST_AI_PROVIDER.'),

    isCherry && e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' } },

      e('div', { className: 'faust-field__hint' },
        'Cherry Studion pitää olla käynnissä ja sen API Gateway päällä (Cherry Studiossa: Settings → API Gateway).'),

      // API key of the gateway
      e('div', { className: 'faust-field' },
        e('label', { className: 'faust-field__label', htmlFor: keyId }, 'Cherry Studion API-avain'),
        e('input', {
          id: keyId,
          type: 'password',
          className: 'faust-input faust-input--sm',
          value: keyInput,
          onChange: (ev) => setKeyInput(ev.target.value),
          onKeyDown: (ev) => { if (ev.key === 'Enter') saveKey(); },
          disabled: !!keyFromEnv.cherry,
          placeholder: keyFromEnv.cherry ? '' : 'Liitä avain Cherry Studiosta'
        }),
        keyFromEnv.cherry && e('div', { className: 'faust-field__hint' }, KEY_FROM_ENV),
        // The chip and the two buttons wrap in the 288px column: the buttons stay right-aligned
        e('div', { className: 'faust-field__row', style: { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' } },
          keyChip(config.hasCherryKey, !!keyFromEnv.cherry),
          e('span', { style: { display: 'flex', gap: 'var(--sp-2)', marginLeft: 'auto' } },
            actionButton({ label: 'Poista avain', danger: true, onClick: () => clearKey('CHERRY_API_KEY'), reason: removeReason(config.hasCherryKey, keyFromEnv.cherry) }),
            actionButton({ label: 'Tallenna avain', onClick: saveKey, reason: keyFromEnv.cherry ? KEY_FROM_ENV : keyInput.trim() ? null : 'Liitä ensin avain' })
          )
        )
      ),

      // The default model
      e('div', { className: 'faust-field' },
        e('label', { className: 'faust-field__label', htmlFor: modelId }, 'Oletusmalli'),
        e('select', {
          id: modelId,
          className: 'faust-select faust-select--sm',
          value: config.model || '',
          disabled: models.length === 0,
          onChange: (ev) => changeModel(ev.target.value)
        },
          models.length === 0
            ? e('option', { value: config.model || '' }, modelPlaceholder)
            : models.map(m => e('option', { key: m.id, value: m.id }, m.name))
        ),
        e('div', { className: 'faust-field__hint' },
          'Tätä mallia käytetään aina, kun tehtävälle ei ole valittu omaa mallia.'),
        // What the last fetch or test found, right under the select it is about
        statusLine(status),
        // The field's two actions in one row, right-aligned (V 4.2)
        e('div', { className: 'faust-field__row' },
          actionButton({
            label: 'Hae mallit',
            onClick: () => loadModels(config),
            disabled: !!busy,
            reason: config.hasCherryKey ? null : NEEDS_KEY,
            busy: busy === 'models'
          }),
          actionButton({
            label: 'Testaa yhteys',
            onClick: testConnection,
            disabled: !!busy,
            reason: !config.hasCherryKey ? NEEDS_KEY : !config.model ? NEEDS_MODELS : null,
            busy: busy === 'test'
          })
        )
      ),

      // Address of the gateway, rarely changed
      e('details', { className: 'faust-disclosure' },
        e('summary', null, icons.chevronRight({ size: 14 }), 'Lisäasetukset'),
        e('div', { className: 'faust-field', style: { marginTop: 'var(--sp-2)' } },
          e('label', { className: 'faust-field__label', htmlFor: urlId }, 'Cherry Studion osoite'),
          e('input', {
            id: urlId,
            type: 'text',
            className: 'faust-input faust-input--sm',
            value: gatewayUrl,
            onChange: (ev) => setGatewayUrl(ev.target.value),
            onBlur: saveGatewayUrl,
            placeholder: 'http://127.0.0.1:23333'
          }),
          e('div', { className: 'faust-field__hint' },
            'Oletus: http://127.0.0.1:23333. Muuta vain, jos vaihdoit osoitteen Cherry Studiossa.')
        )
      )
    ),

    // Claude directly: its key, the link to get one, and the model (typed or picked from the list)
    !isCherry && e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' } },
      e('div', { className: 'faust-field' },
        e('label', { className: 'faust-field__label', htmlFor: claudeKeyId }, 'Clauden API-avain'),
        e('input', {
          id: claudeKeyId,
          type: 'password',
          className: 'faust-input faust-input--sm',
          value: anthropicKeyInput,
          onChange: (ev) => setAnthropicKeyInput(ev.target.value),
          onKeyDown: (ev) => { if (ev.key === 'Enter') saveAnthropicKey(); },
          disabled: !!keyFromEnv.anthropic,
          placeholder: keyFromEnv.anthropic ? '' : 'Liitä avain (sk-ant-…)'
        }),
        keyFromEnv.anthropic && e('div', { className: 'faust-field__hint' }, KEY_FROM_ENV),
        // The chip and the two buttons wrap in the 288px column: the buttons stay right-aligned
        e('div', { className: 'faust-field__row', style: { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' } },
          keyChip(config.hasAnthropicKey, !!keyFromEnv.anthropic),
          e('span', { style: { display: 'flex', gap: 'var(--sp-2)', marginLeft: 'auto' } },
            actionButton({ label: 'Poista avain', danger: true, onClick: () => clearKey('ANTHROPIC_API_KEY'), reason: removeReason(config.hasAnthropicKey, keyFromEnv.anthropic) }),
            actionButton({ label: 'Tallenna avain', onClick: saveAnthropicKey, reason: keyFromEnv.anthropic ? KEY_FROM_ENV : anthropicKeyInput.trim() ? null : 'Liitä ensin avain' })
          )
        ),
        e('div', { className: 'faust-field__hint' },
          'Hanki avain: ',
          e('a', {
            href: '#',
            onClick: (ev) => {
              ev.preventDefault();
              if (api.openExternal) api.openExternal('https://console.anthropic.com/');
            }
          }, 'console.anthropic.com')
        )
      ),

      e('div', { className: 'faust-field' },
        e('label', { className: 'faust-field__label', htmlFor: claudeModelId }, 'Claude-malli'),
        e('input', {
          id: claudeModelId,
          type: 'text',
          className: 'faust-input faust-input--sm',
          list: claudeListId,
          value: anthropicModelInput,
          spellCheck: false,
          placeholder: 'Kirjoita mallin tunnus tai hae mallit',
          onChange: (ev) => setAnthropicModelInput(ev.target.value),
          onBlur: saveAnthropicModel,
          onKeyDown: (ev) => { if (ev.key === 'Enter') ev.currentTarget.blur(); }
        }),
        e('datalist', { id: claudeListId },
          anthropicModels.map(m => e('option', { key: m.id, value: m.id }, m.name))),
        !config.anthropicModel && e('div', { className: 'faust-field__hint' }, 'Mallia ei ole valittu.'),
        statusLine(status),
        e('div', { className: 'faust-field__row' },
          actionButton({
            label: 'Hae mallit',
            onClick: loadAnthropicModels,
            disabled: !!busy,
            reason: config.hasAnthropicKey ? null : NEEDS_KEY,
            busy: busy === 'models'
          }),
          actionButton({
            label: 'Testaa yhteys',
            onClick: testConnection,
            disabled: !!busy,
            reason: !config.hasAnthropicKey ? NEEDS_KEY : !config.anthropicModel ? 'Valitse ensin malli' : null,
            busy: busy === 'test'
          })
        )
      )
    ),

    isCherry && e(AiRoleModels, { config, models, onSave: savePatch }),
    e(AiModelSettings, { config, modelIds, calibration, onSave: savePatch }),
    e('div', { style: { marginTop: 'var(--sp-3)' } },
      e(AiTestRequest, { config, getEditorContext }))
  );
}

/**
 * AIProviderSettings - choose where FAUST's AI calls go
 *
 * "anthropic": Claude directly with an Anthropic API key (the original behaviour)
 * "cherry":    any model configured in Cherry Studio, through its local API gateway
 *              (Cherry Studio: Settings → API Gateway)
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 * Look: the section, field, segmented-control and chip classes of styles/faust-components.css.
 */

import { icons } from './icons.js';
import { count } from './Dialogs.js';

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
const actionButton = ({ label, onClick, disabled, busy, reason }) => e('button', {
  type: 'button',
  className: 'faust-btn faust-btn--sm',
  onClick,
  disabled: disabled || !!reason,
  title: reason || undefined,
  'aria-busy': busy || undefined
}, busy && e('span', { className: 'faust-spinner faust-spinner--sm' }), label);

// The two sentences of the model field's placeholder (M C.15 row 14) also give the reasons
const NEEDS_KEY = 'Tallenna ensin API-avain';
const NEEDS_MODELS = 'Hae mallit ensin';

export function AIProviderSettings({ onProviderChange }) {
  const api = window.electronAPI;

  const [config, setConfig] = useState(null);
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState(null); // { kind: 'ok' | 'error' | 'info', text }
  const [busy, setBusy] = useState(null);     // null | 'models' | 'test'
  const keyId = useId();
  const modelId = useId();
  const urlId = useId();

  const applyConfig = useCallback((next) => {
    setConfig(next);
    setGatewayUrl(next.gatewayUrl || '');
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

  const saveKey = async () => {
    const key = keyInput.trim();
    if (!key) return;

    // Merge with the keys that are already stored
    const existing = await api.loadApiKeys();
    const result = await api.saveApiKeys({ ...(existing.keys || {}), CHERRY_API_KEY: key });
    if (!result.success) {
      setStatus({ kind: 'error', text: failed('Avaimen tallennus', result.error) });
      return;
    }

    setKeyInput('');
    const refreshed = await api.aiGetProvider();
    if (refreshed.success) {
      applyConfig(refreshed);
      loadModels(refreshed);
    }
  };

  const changeModel = async (model) => {
    const saved = await api.aiSetProvider({ model });
    if (saved.success) applyConfig(saved);
  };

  const testConnection = async () => {
    setBusy('test');
    setStatus({ kind: 'info', text: 'Testataan…' });
    const result = await api.aiTestProvider();
    setBusy(null);
    const seconds = (result.ms / 1000).toLocaleString('fi-FI', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    setStatus(result.success
      ? { kind: 'ok', text: `Yhteys toimii: malli vastasi ${seconds} sekunnissa.` }
      : { kind: 'error', text: result.error });
  };

  const keyChip = config.hasCherryKey
    ? e('span', { className: 'faust-chip faust-chip--plain faust-chip--dot faust-chip--success' }, 'Avain tallennettu')
    : e('span', { className: 'faust-chip faust-chip--plain faust-chip--hollow' }, 'Avain puuttuu');

  const modelPlaceholder = config.model
    ? (config.model.split(':').slice(1).join(':') || config.model)
    : config.hasCherryKey ? NEEDS_MODELS : NEEDS_KEY;

  return e('div', { className: 'faust-ai-provider faust-section' },
    e('div', { className: 'faust-section__head' },
      e('div', { className: 'faust-section__title' }, 'Tekoälyn lähde')
    ),

    e('div', { className: 'faust-segmented faust-segmented--block', role: 'group', 'aria-label': 'Tekoälyn lähde' },
      SOURCES.map(([value, label]) => e('button', {
        key: value,
        type: 'button',
        className: 'faust-segmented__option',
        'aria-pressed': config.provider === value,
        disabled: config.providerFromEnv,
        onClick: () => changeProvider(value)
      }, label))
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
          placeholder: 'Liitä avain Cherry Studiosta'
        }),
        e('div', { className: 'faust-field__row', style: { justifyContent: 'space-between', alignItems: 'center' } },
          keyChip,
          actionButton({ label: 'Tallenna avain', onClick: saveKey, disabled: !keyInput.trim() })
        )
      ),

      // Model
      e('div', { className: 'faust-field' },
        e('label', { className: 'faust-field__label', htmlFor: modelId }, 'Malli'),
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
        e('div', { className: 'faust-field__row' },
          actionButton({
            label: 'Hae mallit',
            onClick: () => loadModels(config),
            disabled: !!busy,
            reason: config.hasCherryKey ? null : NEEDS_KEY,
            busy: busy === 'models'
          })
        )
      ),

      // Connection test
      e('div', { className: 'faust-field__row' },
        actionButton({
          label: 'Testaa yhteys',
          onClick: testConnection,
          disabled: !!busy,
          reason: !config.hasCherryKey ? NEEDS_KEY : !config.model ? NEEDS_MODELS : null,
          busy: busy === 'test'
        })
      ),

      status && e('div', {
        role: 'status',
        className: status.kind === 'error' ? 'faust-field__error' : 'faust-field__hint'
      }, status.text),

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
    )
  );
}

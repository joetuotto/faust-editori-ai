/**
 * AIProviderSettings - choose where FAUST's AI calls go
 *
 * "anthropic": Claude directly with an Anthropic API key (the original behaviour)
 * "cherry":    any model configured in Cherry Studio, through its local API gateway
 *              (Cherry Studio: Settings → API Gateway)
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */

const { createElement: e, useState, useEffect, useCallback } = React;

const mono = { fontFamily: 'IBM Plex Mono' };

const labelStyle = { ...mono, fontSize: '10px', color: 'var(--text-3)', marginBottom: '4px' };

const inputStyle = {
  ...mono,
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  background: 'var(--bg)',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  color: 'var(--text)',
  fontSize: '11px'
};

const buttonStyle = (enabled) => ({
  ...mono,
  padding: '8px 12px',
  background: enabled ? 'var(--sigil)' : 'var(--bg-2)',
  border: '1px solid var(--sigil)',
  borderRadius: '4px',
  color: enabled ? '#000' : 'var(--text-3)',
  cursor: enabled ? 'pointer' : 'not-allowed',
  fontSize: '11px',
  fontWeight: 600,
  whiteSpace: 'nowrap'
});

export function AIProviderSettings({ onProviderChange }) {
  const api = window.electronAPI;

  const [config, setConfig] = useState(null);
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState(null); // { kind: 'ok' | 'error' | 'info', text }
  const [busy, setBusy] = useState(false);

  const applyConfig = useCallback((next) => {
    setConfig(next);
    setGatewayUrl(next.gatewayUrl || '');
    if (onProviderChange) onProviderChange(next);
  }, [onProviderChange]);

  const loadModels = useCallback(async (current) => {
    if (!api?.aiListCherryModels) return;
    setBusy(true);
    const result = await api.aiListCherryModels();
    setBusy(false);

    if (!result.success) {
      setModels([]);
      setStatus({ kind: 'error', text: result.error });
      return;
    }

    setModels(result.models);
    setStatus({ kind: 'info', text: `${result.models.length} mallia Cherry Studiosta` });

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
      setStatus({ kind: 'error', text: 'Virhe tallennuksessa: ' + result.error });
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
    setBusy(true);
    setStatus({ kind: 'info', text: 'Testataan...' });
    const result = await api.aiTestProvider();
    setBusy(false);
    setStatus(result.success
      ? { kind: 'ok', text: `Toimii: malli vastasi ${(result.ms / 1000).toFixed(1)} sekunnissa` }
      : { kind: 'error', text: result.error });
  };

  const statusColor = status?.kind === 'error' ? 'var(--error, #c0392b)'
    : status?.kind === 'ok' ? 'var(--sigil)'
    : 'var(--text-3)';

  return e('div', {
    className: 'faust-ai-provider',
    style: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }
  },
    e('div', { style: { ...mono, fontSize: '11px', color: 'var(--text-3)', marginBottom: '8px' } }, 'TEKOÄLYN LÄHDE'),

    e('select', {
      'aria-label': 'Tekoälyn lähde',
      value: config.provider,
      disabled: config.providerFromEnv,
      onChange: (ev) => changeProvider(ev.target.value),
      style: inputStyle
    },
      e('option', { value: 'anthropic' }, 'Claude (Anthropic)'),
      e('option', { value: 'cherry' }, 'Cherry Studio (omat mallit)')
    ),

    config.providerFromEnv && e('div', { style: { ...mono, fontSize: '10px', color: 'var(--text-3)', marginTop: '6px' } },
      'Lähde on asetettu ympäristömuuttujalla FAUST_AI_PROVIDER.'),

    isCherry && e('div', { style: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' } },

      e('div', { style: { ...mono, fontSize: '10px', color: 'var(--text-2)', lineHeight: '1.4' } },
        'Kaikki kirjoitustoiminnot käyttävät alla valittua mallia. Cherry Studion pitää olla käynnissä ja sen API Gatewayn päällä (Settings → API Gateway).'),

      // Gateway address
      e('div', null,
        e('div', { style: labelStyle }, 'Yhdyskäytävän osoite:'),
        e('input', {
          type: 'text',
          'aria-label': 'Yhdyskäytävän osoite',
          value: gatewayUrl,
          onChange: (ev) => setGatewayUrl(ev.target.value),
          onBlur: saveGatewayUrl,
          placeholder: 'http://127.0.0.1:23333',
          style: inputStyle
        })
      ),

      // Gateway key
      e('div', null,
        e('div', { style: labelStyle }, 'Yhdyskäytävän avain:'),
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          e('input', {
            type: 'password',
            'aria-label': 'Cherry Studion yhdyskäytävän avain',
            value: keyInput,
            onChange: (ev) => setKeyInput(ev.target.value),
            onKeyDown: (ev) => { if (ev.key === 'Enter') saveKey(); },
            placeholder: 'Cherry Studio → API Gateway → API Key',
            style: { ...inputStyle, flex: 1, width: 'auto', minWidth: 0 }
          }),
          e('button', {
            onClick: saveKey,
            disabled: !keyInput.trim(),
            style: buttonStyle(!!keyInput.trim())
          }, 'Tallenna')
        ),
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' } },
          e('span', { style: { fontSize: '12px' } }, config.hasCherryKey ? '◉' : '○'),
          e('span', { style: { ...mono, fontSize: '10px', color: config.hasCherryKey ? 'var(--sigil)' : 'var(--text-3)' } },
            config.hasCherryKey ? 'Avain asetettu' : 'Avain puuttuu')
        )
      ),

      // Model
      e('div', null,
        e('div', { style: labelStyle }, 'Malli:'),
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          e('select', {
            'aria-label': 'Cherry Studion malli',
            value: config.model || '',
            disabled: models.length === 0,
            onChange: (ev) => changeModel(ev.target.value),
            style: { ...inputStyle, flex: 1, width: 'auto', minWidth: 0 }
          },
            models.length === 0
              ? e('option', { value: config.model || '' },
                  config.model ? (config.model.split(':').slice(1).join(':') || config.model) : 'Hae mallit ensin')
              : models.map(m => e('option', { key: m.id, value: m.id }, m.name))
          ),
          e('button', {
            onClick: () => loadModels(config),
            disabled: busy || !config.hasCherryKey,
            style: buttonStyle(!busy && config.hasCherryKey)
          }, 'Hae mallit')
        )
      ),

      // Connection test
      e('button', {
        onClick: testConnection,
        disabled: busy || !config.hasCherryKey || !config.model,
        style: { ...buttonStyle(!busy && config.hasCherryKey && !!config.model), width: '100%' }
      }, 'Testaa yhteys'),

      status && e('div', { role: 'status', style: { ...mono, fontSize: '10px', color: statusColor, lineHeight: '1.4' } }, status.text)
    )
  );
}

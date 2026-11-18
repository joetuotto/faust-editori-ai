/**
 * src/components/AiTestRequest.js - Koepyyntö, the test request of the settings block (report 5.3).
 *
 *   AiTestRequest({ config, getEditorContext })
 *
 * One request through the one request layer (getAIClient().request, or requestEdit for an edit
 * task), streamed into a read-only field, with Pysäytä. Afterwards the status says how the answer
 * ended: done with its numbers, stopped, cut by the answer limit, refused, prompt cut, or an error;
 * an edit task also gets the verdict that decides whether its answer could become a suggestion.
 * With "Käytä avoimen luvun kontekstia" the request is assembled by the same context builder as the
 * real actions (selection or the text around the cursor, käsikirjoituksen ydin, tyyliohje), its
 * row shows what is sent and Näytä kehote shows it exactly. getEditorContext() returns
 * { project, chapterId, text, selection }.
 *
 * Composition of visual foundations entry VF-29. Bundled with app.js by webpack; global React.
 */
import { Field, Callout } from './ui.js';
import { icons } from './icons.js';
import { getAIClient, ROLE_LABELS } from '../services/ai/aiClient.js';
import { modelLabel, formatCount } from '../services/format.fi.js';
import { MESSAGES } from '../services/ai/contextBuilder.js';
import { ContextRow, useContextPreview } from './ContextRow.js';

const { createElement: e, useState, useEffect, useRef } = React;

const DEFAULTS = {
  plain: {
    system: 'Olet kirjoitusavustaja. Vastaa suomeksi.',
    message: 'Kirjoita kaksi virkettä syksyisestä metsästä.'
  },
  edit: {
    system: 'Olet kielenhuoltaja. Korjaa tekstistä vain selvät kielivirheet. Palauta koko korjattu teksti <teksti>-tagien sisällä äläkä kirjoita mitään muuta.',
    message: '<teksti>Hän käveli metsäs ja näki – kuten aina – ”vanhan” kuusen, ja ajatteli että sade alkaa pian.</teksti>'
  }
};

// The states of a request (contracts.md 8.4)
const PHASES = { connecting: 'Yhdistetään…', thinking: 'Tekoäly pohtii…', writing: 'Tekoäly kirjoittaa…' };
const RETRY_LINE = 'Tekoäly pohti pitkään. Yritetään uudelleen suuremmalla vastausrajalla…';

const seconds = (ms) => (Number(ms) / 1000).toLocaleString('fi-FI', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// Valmis: end_turn · 120 → 45 tokenia · 3,2 s · malli … (the token part only when both numbers came)
function doneLine(result) {
  const usage = result.usage || {};
  const tokens = isNumber(usage.inputTokens) && isNumber(usage.outputTokens)
    ? ` · ${formatCount(usage.inputTokens)} → ${formatCount(usage.outputTokens)} tokenia`
    : '';
  return `Valmis: ${result.stopReason}${tokens} · ${seconds(result.ms)} s · malli ${modelLabel(result.model)}` +
    (result.systemAsUser ? ' · ohjeet lähetetty käyttäjäviestinä' : '');
}

// The text inside the <teksti> tags of the message, for the edit check
const taggedText = (text) => {
  const match = /<teksti>([\s\S]*)<\/teksti>/.exec(text || '');
  return match ? match[1] : undefined;
};

export function AiTestRequest({ config, getEditorContext }) {
  const [role, setRole] = useState('edit');
  const [system, setSystem] = useState(DEFAULTS.plain.system);
  const [message, setMessage] = useState(DEFAULTS.plain.message);
  const [maxTokens, setMaxTokens] = useState('400');
  const [editMode, setEditMode] = useState(false);
  const [useContext, setUseContext] = useState(false);
  const [output, setOutput] = useState('');
  const [phase, setPhase] = useState(null);
  const [retried, setRetried] = useState(false);
  const [result, setResult] = useState(null);
  const [handle, setHandle] = useState(null);
  // The open chapter's selection lives outside React: coming back to the block reads it again
  const [, setTick] = useState(0);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const running = !!handle;
  const limit = parseInt(String(maxTokens).replace(/\D/g, ''), 10);
  const canUseContext = typeof getEditorContext === 'function';
  const context = canUseContext && useContext ? getEditorContext() : null;
  const preview = useContextPreview({
    task: { id: 'custom', role: system, instruction: message },
    ...(context || {}),
    role,
    answerTokens: limit > 0 ? limit : undefined,
    disabled: !context
  });
  const built = preview.built;

  // The defaults follow the kind of task, unless the author has written their own
  const changeEditMode = (on) => {
    const from = on ? DEFAULTS.plain : DEFAULTS.edit;
    const to = on ? DEFAULTS.edit : DEFAULTS.plain;
    if (system === from.system) setSystem(to.system);
    if (message === from.message) setMessage(to.message);
    setEditMode(on);
  };

  // Why Lähetä koepyyntö cannot be pressed (M B.8); a running request says it by itself
  const blockedReason = running ? null
    : !(limit > 0) ? 'Anna ensin vastausraja'
    : context
      ? (!built ? 'Avaa ensin luku'
        : built.blocked === 'noAI' ? MESSAGES.noAI
        : built.blocked === 'no-chapter' ? 'Avaa ensin luku'
        : built.blocked ? 'Ei lähetettävää.'
        : built.overBudget ? 'Lyhennä ensin valintaa'
        : null)
      : !message.trim() ? 'Kirjoita ensin viesti'
      : null;

  const send = () => {
    if (running || blockedReason) return;
    const request = context
      ? { system: built.system, messages: built.messages, ...(built.model ? { model: built.model } : {}) }
      : { system, messages: [{ role: 'user', content: message }] };
    const payload = context ? (built.parts || []).find(part => part.id === 'payload') : null;
    const original = context ? (payload && payload.text ? payload.text : undefined) : taggedText(message);

    setOutput('');
    setResult(null);
    setRetried(false);
    setPhase('connecting');
    const ai = getAIClient();
    const options = {
      role,
      ...request,
      maxTokens: limit,
      onText: (_delta, all) => { if (aliveRef.current) setOutput(all); },
      onPhase: (next) => {
        if (!aliveRef.current) return;
        if (next === 'retrying') { setRetried(true); setOutput(''); return; }
        setPhase(next);
      },
      meta: { action: 'koepyynto', actionLabel: 'Koepyyntö', instruction: '' }
    };
    if (editMode) options.original = original;
    const started = editMode ? ai.requestEdit(options) : ai.request(options);
    setHandle(started);
    started.result.then((done) => {
      if (!aliveRef.current) return;
      setResult(done);
      setHandle(null);
      setPhase(null);
    });
  };

  // How the answer ended
  const outcome = (() => {
    if (!result) return null;
    if (result.cancelled) return [e('div', { key: 'stopped', className: 'faust-meta' }, 'Pysäytetty. Saapunut teksti on säilytetty.')];
    const lines = [];
    if (result.ok) lines.push(e('div', { key: 'done', className: 'faust-meta' }, doneLine(result)));
    if (editMode) {
      lines.push(result.accepted
        ? e(Callout, { key: 'verdict', role: 'success' }, 'Kelpaisi ehdotukseksi.')
        : e(Callout, { key: 'verdict', role: 'error' }, result.reasonText || 'Ei ehdotusta.'));
      return lines;
    }
    if (!result.ok) {
      lines.push(e(Callout, { key: 'error', role: 'error' }, (result.error && result.error.message) || 'Tekoälypyyntö epäonnistui.'));
      return lines;
    }
    if (result.truncated) lines.push(e(Callout, { key: 'cut', role: 'warning' }, 'Vastaus katkesi, koska vastausraja täyttyi.'));
    if (result.refused) lines.push(e(Callout, { key: 'refused', role: 'warning' }, 'Malli kieltäytyi vastaamasta.'));
    if (result.promptTruncated) lines.push(e(Callout, { key: 'prompt', role: 'warning' }, 'Malli ei nähnyt koko kehotetta.'));
    return lines;
  })();

  const refresh = () => { if (useContext) setTick(tick => tick + 1); };

  return e('details', { className: 'faust-disclosure', onPointerEnter: refresh, onFocus: refresh },
    e('summary', null, icons.chevronRight({ size: 14 }), 'Koepyyntö'),
    e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', marginTop: 'var(--sp-2)' } },
      e(Field, { label: 'Tehtävä' },
        e('select', {
          className: 'faust-select faust-select--sm',
          value: role,
          disabled: running,
          onChange: (ev) => setRole(ev.target.value)
        }, Object.keys(ROLE_LABELS).map(id => e('option', { key: id, value: id }, ROLE_LABELS[id])))),
      e(Field, { label: 'Ohjeet mallille' },
        e('textarea', {
          className: 'faust-textarea',
          rows: 3,
          value: system,
          disabled: running,
          onChange: (ev) => setSystem(ev.target.value)
        })),
      e(Field, { label: 'Viesti' },
        e('textarea', {
          className: 'faust-textarea faust-textarea--author',
          rows: 3,
          value: message,
          disabled: running,
          onChange: (ev) => setMessage(ev.target.value)
        })),
      e(Field, { label: 'Vastausraja (tokenia)' },
        e('input', {
          type: 'text',
          inputMode: 'numeric',
          className: 'faust-input faust-input--sm faust-num',
          value: maxTokens,
          disabled: running,
          onChange: (ev) => setMaxTokens(ev.target.value)
        })),
      e('label', { className: 'faust-check' },
        e('input', { type: 'checkbox', checked: editMode, disabled: running, onChange: (ev) => changeEditMode(ev.target.checked) }),
        'Muokkaustehtävä (vastaus <teksti>-tagien sisään)'),
      canUseContext && e('div', { className: 'faust-field' },
        e('label', { className: 'faust-check' },
          e('input', { type: 'checkbox', checked: useContext, disabled: running, onChange: (ev) => setUseContext(ev.target.checked) }),
          'Käytä avoimen luvun kontekstia'),
        e('div', { className: 'faust-field__hint' },
          'Kehote kootaan samalla kokoajalla kuin oikeat toiminnot: valinta tai kohdistimen ympäristö, käsikirjoituksen ydin ja tyyliohje.')),
      context && (preview.rowProps
        ? e(ContextRow, preview.rowProps)
        : e('div', { className: 'faust-meta' }, 'Ei lähetettävää.')),
      running
        ? e('button', {
            type: 'button',
            className: 'faust-btn faust-btn--block',
            onClick: () => handle.cancel()
          }, icons.stop({ size: 16 }), 'Pysäytä')
        : e('button', {
            type: 'button',
            className: 'faust-btn faust-btn--block',
            disabled: !!blockedReason,
            title: blockedReason || undefined,
            onClick: send
          }, 'Lähetä koepyyntö'),
      retried && e('div', { className: 'faust-meta', role: 'status' }, RETRY_LINE),
      running && phase && PHASES[phase] && e('div', { className: 'faust-meta', role: 'status', style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
        e('span', { className: 'faust-spinner faust-spinner--sm', 'aria-hidden': 'true' }), PHASES[phase]),
      (output || running || result) && e('textarea', {
        className: 'faust-textarea faust-textarea--author',
        readOnly: true,
        rows: 6,
        value: output,
        'aria-label': 'Mallin vastaus'
      }),
      outcome
    )
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage } from '../../../shared/types';
import { estimateCost, formatCost, priceFor, resolveModel, supportsTools } from '../../../shared/models';
import { localDate, summarizeUsage } from '../../../shared/usage';
import { usageChanged, useUsage } from '../ai/usage';
import { MODE_PROMPTS, MODE_ROLES, buildSystemPrompt, sceneContext } from '../ai/context';
import { useStore } from '../store';
import { getActiveEditor } from '../editor/activeEditor';
import { applyMarkdown } from '../editor/rewrite';

/** A chat turn as shown; `lookups` never goes to the model */
interface DisplayMessage extends ChatMessage {
  lookups?: string[];
}

interface StoredChat {
  messages: DisplayMessage[];
}

const MAX_STORED = 60;

export function AIPanel() {
  const project = useStore(s => s.project)!;
  const activeId = useStore(s => s.activeId);
  const mode = useStore(s => s.theme);
  const { toggle, updateBody, notify, setPanel } = useStore.getState();

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [attachScene, setAttachScene] = useState(true);
  const [streaming, setStreaming] = useState<{
    id: string;
    text: string;
    lookups: string[];
  } | null>(null);
  const [lastCost, setLastCost] = useState<number | null>(null);
  const prices = useStore(s => s.prices);
  const usage = useUsage();
  const today = useMemo(() => summarizeUsage(usage, d => d === localDate(), prices), [usage, prices]);
  const chatRef = useRef<HTMLDivElement>(null);

  const provider = project.manifest.ai.provider;
  const model = resolveModel(provider, project.manifest.ai.models[provider]);

  useEffect(() => {
    void window.faust.project.readInternal('chat.json').then(raw => {
      if (!raw) return;
      try {
        setMessages((JSON.parse(raw) as StoredChat).messages ?? []);
      } catch {
        // ignore corrupt chat history
      }
    });
  }, [project.path]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages, streaming?.text]);

  const persist = (next: DisplayMessage[]) => {
    setMessages(next);
    void window.faust.project.writeInternal('chat.json', JSON.stringify({ messages: next.slice(-MAX_STORED) }));
  };

  const send = async (preset?: string) => {
    const question = (preset ?? input).trim();
    if (!question || streaming) return;
    // Lookups read the saved files, so pending edits are written first
    await useStore.getState().flush();
    const current = useStore.getState().project!;
    const tools = supportsTools(provider);
    const context = attachScene ? sceneContext(current, activeId) : '';
    const userMessage: DisplayMessage = { role: 'user', content: question };
    const history = [...messages, userMessage];
    if (preset === undefined) setInput('');
    setMessages(history);

    // The scene goes only into the outgoing copy of the latest message
    const outgoing: ChatMessage[] = history.map((m, i) => ({
      role: m.role,
      content: i === history.length - 1 && context ? `${context}\n\n${m.content}` : m.content
    }));

    // Keep the last turns; the conversation must start with a user message
    const recent = outgoing.slice(-20);
    while (recent[0]?.role === 'assistant') recent.shift();

    let text = '';
    const lookups: string[] = [];
    const call = window.faust.ai.generate(
      {
        provider,
        model,
        system: `${buildSystemPrompt(current, { tools })}\n\n${MODE_ROLES[mode]}`,
        messages: recent,
        tools
      },
      chunk => {
        text += chunk;
        setStreaming(s => (s ? { ...s, text } : s));
      },
      {
        onTool: label => {
          lookups.push(label);
          setStreaming(s => (s ? { ...s, lookups: [...lookups] } : s));
        }
      }
    );
    setStreaming({ id: call.id, text: '', lookups: [] });
    const result = await call.result;
    setStreaming(null);
    if (result.usage) setLastCost(estimateCost(priceFor(provider, result.model ?? model, prices), result.usage));
    usageChanged();

    const found = lookups.length ? { lookups } : {};
    if (result.success) {
      persist([...history, { role: 'assistant', content: (result.text ?? text).trim(), ...found }]);
    } else {
      if (text) persist([...history, { role: 'assistant', content: text, ...found }]);
      else persist(history);
      notify(result.error ?? 'AI-kutsu epäonnistui', 'error');
    }
  };

  const insertIntoScene = (content: string) => {
    if (!activeId) return;
    const editor = getActiveEditor(activeId);
    if (editor) {
      // Inserted through the editor so the text is recorded as AI-written
      const end = editor.state.doc.content.size;
      applyMarkdown(editor, { from: end, to: end }, 'block', content.trim(), { source: 'ai', model });
    } else {
      const doc = useStore.getState().project?.docs[activeId];
      if (!doc) return;
      updateBody(activeId, doc.body.trimEnd() + (doc.body.trim() ? '\n\n' : '') + content.trim() + '\n');
    }
    notify('Lisätty dokumentin loppuun (merkitty AI:n kirjoittamaksi).');
  };

  return (
    <aside className="side-panel wide">
      <div className="panel-head">
        <span className="label">AI-avustaja · {mode === 'NOX' ? 'NOX, kysyy' : 'DEIS, ideoi'}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="chip" onClick={() => setPanel('settings')} title="Vaihda mallia asetuksissa">
            {model}
          </button>
          <button className="btn ghost small" onClick={() => toggle('showAI')}>✕</button>
        </div>
      </div>

      <div className="chat" ref={chatRef}>
        {messages.length === 0 && !streaming && (
          <p className="muted">
            {mode === 'NOX'
              ? 'NOX-tilassa avustaja ei kirjoita puolestasi. Se vastaa lyhyesti ja auttaa kysymyksillä eteenpäin.'
              : 'Kysy teoksestasi: juonesta, henkilöistä, rytmistä tai siitä, mitä seuraavaksi voisi tapahtua. Avustaja näkee rakenteen, tietopankin ja halutessasi nykyisen kohtauksen.'}
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="who">{m.role === 'user' ? 'Sinä' : 'FAUST'}</div>
            {m.lookups && <Lookups items={m.lookups} />}
            <div className="text">{m.content}</div>
            {m.role === 'assistant' && (
              <div className="msg-actions">
                <button className="btn small" disabled={!activeId} onClick={() => insertIntoScene(m.content)}>
                  Lisää dokumenttiin
                </button>
                <button className="btn small" onClick={() => void navigator.clipboard.writeText(m.content)}>
                  Kopioi
                </button>
              </div>
            )}
          </div>
        ))}
        {streaming && (
          <div className="msg assistant">
            <div className="who">FAUST</div>
            {streaming.lookups.length > 0 && <Lookups items={streaming.lookups} />}
            <div className="text">{streaming.text || '…'}</div>
          </div>
        )}
      </div>

      <div className="chat-input">
        {!streaming && (
          <div className="quick-prompts">
            {MODE_PROMPTS[mode].map(p => (
              <button key={p.label} className="chip" onClick={() => void send(p.prompt)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
        <textarea
          className="textarea"
          placeholder="Kysy tai pyydä… (⌘↩ lähettää)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div
          className="muted usage-meter"
          title={`Arvioitu hinta listahinnoista. Tänään ${today.calls} kutsua, ${today.inputTokens.toLocaleString('fi-FI')} tokenia sisään, ${today.outputTokens.toLocaleString('fi-FI')} ulos.${today.unpriced.length ? ` Ei hintaa: ${today.unpriced.join(', ')}.` : ''}`}
        >
          {lastCost !== null ? `${formatCost(lastCost)} · ` : ''}tänään {formatCost(today.cost)}
          {today.unpriced.length ? '+' : ''}
        </div>
        <div className="row">
          <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={attachScene} onChange={e => setAttachScene(e.target.checked)} />
            Liitä nykyinen dokumentti
          </label>
          <div className="spacer" />
          {messages.length > 0 && !streaming && (
            <button className="btn ghost small" onClick={() => persist([])}>
              Tyhjennä
            </button>
          )}
          {streaming ? (
            <button className="btn" onClick={() => window.faust.ai.cancel(streaming.id)}>
              Pysäytä
            </button>
          ) : (
            <button className="btn primary" disabled={!input.trim()} onClick={() => void send()}>
              Lähetä
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function Lookups({ items }: { items: string[] }) {
  return (
    <div className="lookups" title="Avustaja haki nämä tiedot projektista">
      {items.map((l, i) => (
        <span key={i} className="lookup">
          ↳ {l}
        </span>
      ))}
    </div>
  );
}

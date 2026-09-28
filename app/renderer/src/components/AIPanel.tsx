import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../../shared/types';
import { resolveModel } from '../../../shared/models';
import { buildSystemPrompt, sceneContext } from '../ai/context';
import { useStore } from '../store';

interface StoredChat {
  messages: ChatMessage[];
}

const MAX_STORED = 60;

export function AIPanel() {
  const project = useStore(s => s.project)!;
  const activeId = useStore(s => s.activeId);
  const { toggle, updateBody, notify, setPanel } = useStore.getState();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [attachScene, setAttachScene] = useState(true);
  const [streaming, setStreaming] = useState<{ id: string; text: string } | null>(null);
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

  const persist = (next: ChatMessage[]) => {
    setMessages(next);
    void window.faust.project.writeInternal('chat.json', JSON.stringify({ messages: next.slice(-MAX_STORED) }));
  };

  const send = async () => {
    const question = input.trim();
    if (!question || streaming) return;
    const current = useStore.getState().project!;
    const context = attachScene ? sceneContext(current, activeId) : '';
    const userMessage: ChatMessage = { role: 'user', content: question };
    const history = [...messages, userMessage];
    setInput('');
    setMessages(history);

    // The scene goes only into the outgoing copy of the latest message
    const outgoing = history.map((m, i) =>
      i === history.length - 1 && context ? { ...m, content: `${context}\n\n${m.content}` } : m
    );

    // Keep the last turns; the conversation must start with a user message
    const recent = outgoing.slice(-20);
    while (recent[0]?.role === 'assistant') recent.shift();

    let text = '';
    const call = window.faust.ai.generate(
      { provider, model, system: buildSystemPrompt(current), messages: recent },
      chunk => {
        text += chunk;
        setStreaming(s => (s ? { ...s, text } : s));
      }
    );
    setStreaming({ id: call.id, text: '' });
    const result = await call.result;
    setStreaming(null);

    if (result.success) {
      persist([...history, { role: 'assistant', content: result.text ?? text }]);
    } else {
      if (text) persist([...history, { role: 'assistant', content: text }]);
      else persist(history);
      notify(result.error ?? 'AI-kutsu epäonnistui', 'error');
    }
  };

  const insertIntoScene = (content: string) => {
    if (!activeId) return;
    const doc = useStore.getState().project?.docs[activeId];
    if (!doc) return;
    updateBody(activeId, doc.body.trimEnd() + (doc.body.trim() ? '\n\n' : '') + content.trim() + '\n');
    notify('Lisätty dokumentin loppuun.');
  };

  return (
    <aside className="side-panel wide">
      <div className="panel-head">
        <span className="label">AI-avustaja</span>
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
            Kysy teoksestasi: juonesta, henkilöistä, rytmistä tai siitä, mitä seuraavaksi voisi tapahtua. Avustaja näkee rakenteen,
            tietopankin ja halutessasi nykyisen kohtauksen.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <div className="who">{m.role === 'user' ? 'Sinä' : 'FAUST'}</div>
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
            <div className="text">{streaming.text || '…'}</div>
          </div>
        )}
      </div>

      <div className="chat-input">
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

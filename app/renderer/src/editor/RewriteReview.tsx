import { useEffect, useMemo, useRef, useState } from 'react';
import { compareStyle } from '../../../shared/style';
import { measureOwnStyle } from '../ai/style';
import type { Editor } from '@tiptap/react';
import { resolveModel } from '../../../shared/models';
import { buildSystemPrompt } from '../ai/context';
import { useStore } from '../store';
import {
  REWRITE_SYSTEM,
  applyMarkdown,
  cleanModelOutput,
  diffHunks,
  getTarget,
  mergeHunks,
  setTarget,
  type Hunk,
  type RewriteSource
} from './rewrite';

export interface RewriteRequest {
  label: string;
  instruction: string;
  source: RewriteSource;
}

type Phase = { kind: 'loading'; preview: string } | { kind: 'review'; hunks: Hunk[]; model?: string } | { kind: 'error'; message: string };

export function RewriteReview({ editor, request, onClose }: { editor: Editor; request: RewriteRequest; onClose(): void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading', preview: '' });
  const [attempt, setAttempt] = useState(0);
  const callId = useRef<string | null>(null);
  const { source } = request;

  useEffect(() => {
    setTarget(editor, { from: source.from, to: source.to });
    return () => {
      if (!editor.isDestroyed) setTarget(editor, null);
    };
  }, [editor, source.from, source.to]);

  useEffect(() => {
    const { project, style } = useStore.getState();
    if (!project) return;
    const provider = project.manifest.ai.provider;
    let preview = '';

    const call = window.faust.ai.generate(
      {
        provider,
        model: resolveModel(provider, project.manifest.ai.models[provider]),
        system: [
          REWRITE_SYSTEM,
          style?.description ? `KIRJAILIJAN TYYLI (noudata tätä):\n${style.description}` : '',
          `Taustaksi teoksen tiedot:\n${buildSystemPrompt(project)}`
        ]
          .filter(Boolean)
          .join('\n\n'),
        messages: [{ role: 'user', content: `OHJE: ${request.instruction}\n\nTEKSTI:\n${source.markdown}` }],
        maxTokens: Math.max(2000, source.markdown.length * 2)
      },
      chunk => {
        preview += chunk;
        setPhase({ kind: 'loading', preview });
      }
    );
    callId.current = call.id;
    let cancelled = false;
    void call.result.then(result => {
      if (cancelled) return;
      callId.current = null;
      if (!result.success) {
        setPhase({ kind: 'error', message: result.error ?? 'AI-kutsu epäonnistui' });
        return;
      }
      const revised = cleanModelOutput(result.text ?? '');
      const hunks = diffHunks(source.markdown, revised);
      setPhase(
        hunks.some(h => h.kind === 'change')
          ? { kind: 'review', hunks, model: result.model }
          : { kind: 'error', message: 'AI ei ehdottanut muutoksia.' }
      );
    });
    return () => {
      cancelled = true;
      if (callId.current) window.faust.ai.cancel(callId.current);
    };
  }, [request, attempt, source.markdown]);

  const toggle = (index: number) =>
    setPhase(p =>
      p.kind === 'review'
        ? { ...p, hunks: p.hunks.map((h, i) => (i === index && h.kind === 'change' ? { ...h, accepted: !h.accepted } : h)) }
        : p
    );

  const setAll = (accepted: boolean) =>
    setPhase(p => (p.kind === 'review' ? { ...p, hunks: p.hunks.map(h => (h.kind === 'change' ? { ...h, accepted } : h)) } : p));

  const apply = () => {
    if (phase.kind !== 'review') return;
    const target = getTarget(editor);
    if (!target) {
      useStore.getState().notify('Muokattava kohta on poistettu, ehdotusta ei voi soveltaa.', 'error');
      onClose();
      return;
    }
    if (phase.hunks.some(h => h.kind === 'change' && h.accepted)) {
      applyMarkdown(editor, target, source.mode, mergeHunks(phase.hunks), { source: 'ai-edit', model: phase.model });
    }
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) apply();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const changes = phase.kind === 'review' ? phase.hunks.filter(h => h.kind === 'change') : [];
  // Does the result still sound like the writer? Measured from their own text in the manuscript
  const hasSuggestion = phase.kind === 'review';
  const profile = useMemo(() => {
    const { project, provenance } = useStore.getState();
    return hasSuggestion && project ? measureOwnStyle(project, provenance) : null;
  }, [hasSuggestion]);
  const warnings = useMemo(
    () => (profile && phase.kind === 'review' ? compareStyle(profile, source.markdown, mergeHunks(phase.hunks)) : []),
    [profile, phase, source.markdown]
  );
  const acceptedCount = changes.filter(h => h.kind === 'change' && h.accepted).length;

  return (
    <div className="review-card" role="dialog" aria-label="Muutosehdotus">
      <div className="review-head">
        <span className="label">Muutosehdotus · {request.label}</span>
        <button className="btn ghost small" onClick={onClose} aria-label="Sulje">✕</button>
      </div>

      <div className="review-body">
        {phase.kind === 'loading' && <div className="review-preview">{phase.preview || 'AI lukee tekstiä…'}</div>}
        {phase.kind === 'error' && <p className="muted">{phase.message}</p>}
        {phase.kind === 'review' && (
          <div className="diff">
            {phase.hunks.map((h, i) =>
              h.kind === 'same' ? (
                <span key={i}>{h.text}</span>
              ) : (
                <span
                  key={i}
                  className={`change ${h.accepted ? 'accepted' : 'rejected'}`}
                  onClick={() => toggle(i)}
                  title={h.accepted ? 'Klikkaa hylätäksesi' : 'Klikkaa hyväksyäksesi'}
                >
                  {h.removed && <del>{h.removed}</del>}
                  {h.added && <ins>{h.added}</ins>}
                </span>
              )
            )}
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="review-warnings">
          <strong>Ei kuulosta sinulta?</strong>
          {warnings.map(w => (
            <div key={w.id}>{w.message}</div>
          ))}
        </div>
      )}

      <div className="review-actions">
        {phase.kind === 'review' && (
          <>
            <span className="muted">
              {acceptedCount}/{changes.length} muutosta valittu
            </span>
            <button className="btn ghost small" onClick={() => setAll(true)}>Kaikki</button>
            <button className="btn ghost small" onClick={() => setAll(false)}>Ei mitään</button>
          </>
        )}
        <div className="spacer" />
        {phase.kind !== 'loading' && (
          <button
            className="btn small"
            onClick={() => {
              setPhase({ kind: 'loading', preview: '' });
              setAttempt(a => a + 1);
            }}
          >
            Uusi ehdotus
          </button>
        )}
        <button className="btn small" onClick={onClose}>Hylkää</button>
        <button className="btn primary small" disabled={phase.kind !== 'review' || acceptedCount === 0} onClick={apply}>
          Hyväksy valitut (⌘↩)
        </button>
      </div>
    </div>
  );
}

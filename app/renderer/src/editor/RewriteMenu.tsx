import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { REWRITE_PRESETS, getRewriteSource } from './rewrite';
import { useStore } from '../store';
import type { RewriteRequest } from './RewriteReview';

export function RewriteMenu({ editor, onRewrite }: { editor: Editor; onRewrite(r: RewriteRequest): void }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');

  const start = (label: string, instruction: string) => {
    setOpen(false);
    setCustom('');
    const source = getRewriteSource(editor);
    if (!source) {
      useStore.getState().notify('Valitse muokattava teksti.');
      return;
    }
    onRewrite({ label, instruction, source });
    // Collapse the selection so the bubble hides while the suggestion is reviewed
    editor.commands.setTextSelection(editor.state.selection.to);
  };

  return (
    <span className="rewrite-menu">
      <button onClick={() => setOpen(o => !o)} title="Pyydä AI:lta muutosehdotus">
        AI ▾
      </button>
      {open && (
        <div className="rewrite-dropdown">
          {REWRITE_PRESETS.map(p => (
            <button key={p.id} onClick={() => start(p.label, p.instruction)}>
              {p.label}
            </button>
          ))}
          <form
            onSubmit={e => {
              e.preventDefault();
              if (custom.trim()) start(custom.trim(), custom.trim());
            }}
          >
            <input className="input" placeholder="Oma ohje, esim. ”lisää jännitettä”" value={custom} onChange={e => setCustom(e.target.value)} />
          </form>
        </div>
      )}
    </span>
  );
}

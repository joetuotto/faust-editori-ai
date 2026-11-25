import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { clearSpellCache, forgetWord } from './spellcheck';
import { useStore } from '../store';

export interface SpellMenuState {
  x: number;
  y: number;
  from: number;
  to: number;
  word: string;
  grammar: { description: string; suggestions: string[] } | null;
}

export function SpellMenu({ editor, state, onClose }: { editor: Editor; state: SpellMenuState; onClose(): void }) {
  const [suggestions, setSuggestions] = useState<string[] | null>(state.grammar ? state.grammar.suggestions : null);
  const notify = useStore(s => s.notify);

  useEffect(() => {
    if (!state.grammar) void window.faust.lang.suggest(state.word).then(setSuggestions);
  }, [state.word, state.grammar]);

  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('blur', close);
    };
  }, [onClose]);

  const replace = (text: string) => {
    editor.chain().focus().insertContentAt({ from: state.from, to: state.to }, text).run();
    onClose();
  };

  const addWord = async (scope: 'project' | 'user') => {
    await window.faust.lang.addWord(state.word, scope);
    forgetWord(state.word);
    clearSpellCache();
    editor.commands.recheckSpelling();
    notify(scope === 'project' ? `"${state.word}" lisätty projektin sanakirjaan.` : `"${state.word}" lisätty omaan sanakirjaasi.`);
    onClose();
  };

  // Keep the menu on screen
  const style = { left: Math.min(state.x, window.innerWidth - 260), top: Math.min(state.y, window.innerHeight - 280) };

  return (
    <div className="context-menu" style={style} onMouseDown={e => e.stopPropagation()}>
      {state.grammar && <div className="context-note">{state.grammar.description}</div>}
      {suggestions === null && <div className="context-note">Haetaan ehdotuksia…</div>}
      {suggestions?.length === 0 && <div className="context-note">Ei ehdotuksia</div>}
      {suggestions?.map(s => (
        <button key={s} className="suggestion" onClick={() => replace(s)}>
          {s}
        </button>
      ))}
      {!state.grammar && (
        <>
          <div className="context-sep" />
          <button onClick={() => void addWord('project')}>Lisää projektin sanakirjaan</button>
          <button onClick={() => void addWord('user')}>Lisää omaan sanakirjaan</button>
        </>
      )}
    </div>
  );
}

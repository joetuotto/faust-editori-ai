import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { clearSearch, getSearch, replaceAll, replaceCurrent, setSearch, stepSearch, type SearchOptions } from './search';
import { useStore } from '../store';

/** Find & replace bar for the open document (⌘F) */
export function FindBar({ editor, initialQuery, onClose }: { editor: Editor; initialQuery: string; onClose(): void }) {
  const [query, setQuery] = useState(initialQuery);
  const [replacement, setReplacement] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [options, setOptions] = useState<SearchOptions>({ caseSensitive: false, wholeWord: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const status = useEditorState({ editor, selector: ({ editor: e }) => ({ count: getSearch(e).matches.length, current: getSearch(e).current }) });

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    setSearch(editor, query, options);
  }, [editor, query, options]);

  useEffect(() => () => clearSearch(editor), [editor]);

  const close = () => {
    onClose();
    editor.commands.focus();
  };

  return (
    <div className="find-bar" onKeyDown={e => e.key === 'Escape' && close()}>
      <div className="find-row">
        <input
          ref={inputRef}
          className="input"
          placeholder="Etsi tästä dokumentista"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') stepSearch(editor, e.shiftKey ? -1 : 1);
          }}
        />
        <span className="muted find-count">{query ? (status.count ? `${status.current + 1}/${status.count}` : '0') : ''}</span>
        <button className="btn small ghost" title="Edellinen (⇧↩)" onClick={() => stepSearch(editor, -1)}>↑</button>
        <button className="btn small ghost" title="Seuraava (↩)" onClick={() => stepSearch(editor, 1)}>↓</button>
        <button
          className={`btn small ghost${options.caseSensitive ? ' active' : ''}`}
          title="Huomioi kirjainkoko"
          onClick={() => setOptions(o => ({ ...o, caseSensitive: !o.caseSensitive }))}
        >
          Aa
        </button>
        <button
          className={`btn small ghost${options.wholeWord ? ' active' : ''}`}
          title="Vain kokonaiset sanat"
          onClick={() => setOptions(o => ({ ...o, wholeWord: !o.wholeWord }))}
        >
          «ab»
        </button>
        <button className="btn small ghost" onClick={() => setShowReplace(r => !r)} title="Korvaa">⇄</button>
        <button className="btn small ghost" onClick={() => useStore.getState().setPanel('search')} title="Etsi koko teoksesta (⇧⌘F)">
          Koko teos
        </button>
        <button className="btn small ghost" onClick={close} aria-label="Sulje">✕</button>
      </div>
      {showReplace && (
        <div className="find-row">
          <input
            className="input"
            placeholder="Korvaa tekstillä"
            value={replacement}
            onChange={e => setReplacement(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') replaceCurrent(editor, replacement);
            }}
          />
          <button className="btn small" disabled={!status.count} onClick={() => replaceCurrent(editor, replacement)}>
            Korvaa
          </button>
          <button
            className="btn small"
            disabled={!status.count}
            onClick={() => {
              const n = replaceAll(editor, replacement);
              useStore.getState().notify(`Korvattiin ${n} kohtaa.`);
            }}
          >
            Korvaa kaikki
          </button>
        </div>
      )}
    </div>
  );
}

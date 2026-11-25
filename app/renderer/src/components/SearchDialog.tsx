import { useMemo, useState } from 'react';
import { flatten } from '../../../shared/tree';
import { replaceMarkdown, searchMarkdown, type TextSearchOptions } from '../../../shared/search';
import { getActiveEditor } from '../editor/activeEditor';
import { replaceAll, setSearch } from '../editor/search';
import { useStore } from '../store';
import { Dialog } from './Dialog';

/** Search and replace across the whole manuscript (⇧⌘F) */
export function SearchDialog() {
  const project = useStore(s => s.project)!;
  const initial = useStore(s => s.find.query);
  const { setPanel, setActive, setFind, updateBody, notify } = useStore.getState();
  const [query, setQuery] = useState(initial);
  const [replacement, setReplacement] = useState('');
  const [options, setOptions] = useState<TextSearchOptions>({ caseSensitive: false, wholeWord: false });

  const nodes = useMemo(() => flatten(project.manifest.structure), [project.manifest.structure]);
  const results = useMemo(
    () =>
      query.trim()
        ? nodes
            .map(n => ({ node: n, hits: searchMarkdown(project.docs[n.id]?.body ?? '', query, options) }))
            .filter(r => r.hits.length > 0)
        : [],
    [nodes, project.docs, query, options]
  );
  const total = results.reduce((n, r) => n + r.hits.length, 0);

  const open = (docId: string) => {
    setActive(docId);
    setFind({ open: true, query });
    setPanel('none');
  };

  const replaceEverywhere = () => {
    if (!confirm(`Korvataanko ${total} osumaa tekstillä ”${replacement}” koko teoksessa? Muutoksen voi perua versiohistoriasta.`)) return;
    let replaced = 0;
    let skipped = 0;
    for (const { node } of results) {
      const editor = getActiveEditor(node.id);
      if (editor) {
        // The open document goes through the editor so undo and AI provenance keep working
        setSearch(editor, query, options);
        replaced += replaceAll(editor, replacement);
        continue;
      }
      const r = replaceMarkdown(project.docs[node.id]?.body ?? '', query, replacement, options);
      if (r.replaced > 0) updateBody(node.id, r.text);
      replaced += r.replaced;
      skipped += r.skipped;
    }
    notify(
      skipped > 0
        ? `Korvattiin ${replaced} kohtaa. ${skipped} kohtaa ohitettiin, koska korostus kulkee sanan keskeltä; korjaa ne käsin.`
        : `Korvattiin ${replaced} kohtaa.`
    );
  };

  return (
    <Dialog title="Etsi koko teoksesta" large onClose={() => setPanel('none')}>
      <div className="find-row" style={{ marginBottom: 8 }}>
        <input className="input" autoFocus placeholder="Etsi" value={query} onChange={e => setQuery(e.target.value)} />
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
      </div>
      <div className="find-row" style={{ marginBottom: 14 }}>
        <input className="input" placeholder="Korvaa tekstillä" value={replacement} onChange={e => setReplacement(e.target.value)} />
        <button className="btn small" disabled={total === 0} onClick={replaceEverywhere}>
          Korvaa kaikki ({total})
        </button>
      </div>

      {query.trim() && total === 0 && <p className="muted">Ei osumia.</p>}
      {results.map(({ node, hits }) => (
        <section key={node.id} className="search-group">
          <button className="search-doc" onClick={() => open(node.id)}>
            {node.title} <span className="muted">({hits.length})</span>
          </button>
          {hits.slice(0, 20).map((h, i) => (
            <div key={i} className="search-hit" onClick={() => open(node.id)}>
              …{h.before}
              <mark>{h.match}</mark>
              {h.after}…
            </div>
          ))}
          {hits.length > 20 && <div className="muted" style={{ fontSize: 12 }}>ja {hits.length - 20} muuta</div>}
        </section>
      ))}
    </Dialog>
  );
}

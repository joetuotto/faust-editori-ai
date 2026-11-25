import { useMemo, useState } from 'react';
import type { DocStatus, TreeNode } from '../../../shared/types';
import { canHaveChildren, findNode, findParentId } from '../../../shared/tree';
import { collectionNodes } from '../../../shared/collections';
import { countWords } from '../../../shared/text';
import { useStore } from '../store';

const STATUS_LABELS: Record<DocStatus, string> = { plan: 'Suunnitelma', draft: 'Luonnos', revision: 'Muokkaus', final: 'Valmis' };
const ICONS: Record<TreeNode['type'], string> = { folder: '▤', chapter: '§', scene: '·' };

/**
 * Index cards for the chapters or scenes of one level (or of a collection):
 * title, synopsis and status at a glance, reordered by dragging.
 */
export function Corkboard() {
  const project = useStore(s => s.project)!;
  const activeId = useStore(s => s.activeId);
  const collectionId = useStore(s => s.collectionId);
  const { setActive, setView, moveTo, addNode, setCollection } = useStore.getState();
  const structure = project.manifest.structure;
  const collection = project.manifest.collections?.find(c => c.id === collectionId);

  // Which level is shown: chosen by drilling in, otherwise the active document's level
  const [chosen, setChosen] = useState<{ id: string | null } | null>(null);
  const containerId = useMemo(() => {
    if (chosen) return chosen.id;
    const active = activeId ? findNode(structure, activeId) : null;
    if (!active) return null;
    if (canHaveChildren(active.type) && active.children?.length) return active.id;
    return findParentId(structure, active.id) ?? null;
  }, [chosen, activeId, structure]);
  const container = containerId ? findNode(structure, containerId) : null;

  const cards = collection ? collectionNodes(project, collection.filter) : container ? (container.children ?? []) : structure;
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const open = (id: string) => {
    setActive(id);
    setView('editor');
  };

  const add = () => {
    if (container) {
      setActive(container.id);
      addNode('scene');
    } else {
      addNode('chapter');
    }
  };

  return (
    <div className="corkboard">
      <div className="corkboard-head">
        {collection ? (
          <>
            <span className="label">Kokoelma</span>
            <strong>{collection.name}</strong>
            <span className="muted">({cards.length})</span>
            <button className="btn ghost small" onClick={() => setCollection(null)}>
              Näytä koko teos
            </button>
          </>
        ) : (
          <>
            <button
              className="btn ghost small"
              disabled={!container}
              onClick={() => setChosen({ id: container ? (findParentId(structure, container.id) ?? null) : null })}
            >
              ↑
            </button>
            <strong>{container ? container.title : project.manifest.title}</strong>
            <span className="muted">{cards.length} korttia · vedä järjestääksesi · kaksoisnapsautus avaa</span>
          </>
        )}
        <div className="spacer" />
        {!collection && (
          <button className="btn small" onClick={add}>
            + {container ? 'Kohtaus' : 'Luku'}
          </button>
        )}
        <button className="btn small" onClick={() => setView('editor')} title="Takaisin tekstiin (⌘4)">
          Teksti
        </button>
      </div>

      {cards.length === 0 && (
        <p className="muted" style={{ padding: 24 }}>
          Ei kortteja.
        </p>
      )}
      <div className="cards" onDragOver={e => dragId && e.preventDefault()}>
        {cards.map((node, index) => (
          <Card
            key={node.id}
            node={node}
            active={node.id === activeId}
            dropBefore={dropIndex === index && dragId !== node.id}
            draggable={!collection}
            onSelect={() => setActive(node.id)}
            onOpen={() => open(node.id)}
            onDrill={node.children?.length ? () => setChosen({ id: node.id }) : undefined}
            onDragStart={() => setDragId(node.id)}
            onDragEnd={() => {
              setDragId(null);
              setDropIndex(null);
            }}
            onDragOver={(e, el) => {
              if (!dragId || collection) return;
              e.preventDefault();
              const rect = el.getBoundingClientRect();
              const after = e.clientX > rect.left + rect.width / 2;
              const target = index + (after ? 1 : 0);
              if (dropIndex !== target) setDropIndex(target);
            }}
            onDrop={() => {
              if (dragId && dropIndex !== null) {
                const from = cards.findIndex(c => c.id === dragId);
                moveTo(dragId, containerId, from >= 0 && from < dropIndex ? dropIndex - 1 : dropIndex);
              }
              setDragId(null);
              setDropIndex(null);
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface CardProps {
  node: TreeNode;
  active: boolean;
  dropBefore: boolean;
  draggable: boolean;
  onSelect(): void;
  onOpen(): void;
  onDrill?: () => void;
  onDragStart(): void;
  onDragEnd(): void;
  onDragOver(e: React.DragEvent, el: HTMLElement): void;
  onDrop(): void;
}

function Card({ node, active, dropBefore, draggable, onSelect, onOpen, onDrill, ...drag }: CardProps) {
  const doc = useStore(s => s.project?.docs[node.id]);
  const { updateMeta } = useStore.getState();
  if (!doc) return null;
  const words = countWords(doc.body);

  return (
    <div
      className={`card${active ? ' active' : ''}${dropBefore ? ' drop-before' : ''}`}
      data-status={doc.meta.status}
      draggable={draggable}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        drag.onDragStart();
      }}
      onDragEnd={drag.onDragEnd}
      onDragOver={e => drag.onDragOver(e, e.currentTarget)}
      onDrop={e => {
        e.preventDefault();
        drag.onDrop();
      }}
    >
      <div className="card-title">
        <span className="icon">{ICONS[node.type]}</span>
        {node.title}
      </div>
      <textarea
        className="card-synopsis"
        value={doc.meta.synopsis}
        placeholder="Mitä tässä tapahtuu?"
        onChange={e => updateMeta(node.id, { synopsis: e.target.value })}
        onClick={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
      />
      <div className="card-foot">
        <span>{STATUS_LABELS[doc.meta.status]}</span>
        {doc.meta.pov && <span>POV {doc.meta.pov}</span>}
        <span>{words} sanaa</span>
        {onDrill && (
          <button
            className="btn ghost small"
            onClick={e => {
              e.stopPropagation();
              onDrill();
            }}
          >
            {node.children!.length} ▸
          </button>
        )}
      </div>
    </div>
  );
}

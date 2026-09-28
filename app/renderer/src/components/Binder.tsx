import { useState } from 'react';
import type { TreeNode } from '../../../shared/types';
import { canHaveChildren, findNode, findParentId } from '../../../shared/tree';
import { countWords } from '../../../shared/text';
import { useStore } from '../store';

const ICONS: Record<TreeNode['type'], string> = { folder: '▤', chapter: '§', scene: '·' };

type DropMode = 'before' | 'inside';

export function Binder() {
  const project = useStore(s => s.project)!;
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; mode: DropMode } | null>(null);
  const addNode = useStore(s => s.addNode);

  const structure = project.manifest.structure;

  const drop = (target: TreeNode, mode: DropMode) => {
    if (!dragId || dragId === target.id) return;
    const { moveTo } = useStore.getState();
    if (mode === 'inside') {
      moveTo(dragId, target.id, target.children?.length ?? 0);
    } else {
      const parentId = findParentId(structure, target.id) ?? null;
      const siblings = parentId ? (findNode(structure, parentId)?.children ?? []) : structure;
      const withoutDragged = siblings.filter(n => n.id !== dragId);
      moveTo(dragId, parentId, withoutDragged.findIndex(n => n.id === target.id));
    }
  };

  const renderNodes = (nodes: TreeNode[], depth: number) =>
    nodes.map(node => (
      <Row
        key={node.id}
        node={node}
        depth={depth}
        dropMode={dropTarget?.id === node.id ? dropTarget.mode : null}
        onDragStart={() => setDragId(node.id)}
        onDragEnd={() => {
          setDragId(null);
          setDropTarget(null);
        }}
        onDragOver={(e, el) => {
          if (!dragId) return;
          e.preventDefault();
          const rect = el.getBoundingClientRect();
          const lowerHalf = e.clientY > rect.top + rect.height / 2;
          const mode: DropMode = canHaveChildren(node.type) && lowerHalf ? 'inside' : 'before';
          if (dropTarget?.id !== node.id || dropTarget.mode !== mode) setDropTarget({ id: node.id, mode });
        }}
        onDrop={() => {
          if (dropTarget) drop(node, dropTarget.mode);
          setDropTarget(null);
        }}
      >
        {node.children && node.children.length > 0 && renderNodes(node.children, depth + 1)}
      </Row>
    ));

  return (
    <aside className="binder">
      <div className="binder-head">
        <span className="label">Sisällys</span>
      </div>
      <div
        className="binder-tree"
        onDragOver={e => dragId && e.preventDefault()}
        onDrop={e => {
          // Dropped on empty space: move to the end of the top level
          if (e.target === e.currentTarget && dragId) useStore.getState().moveTo(dragId, null, structure.length);
        }}
      >
        {renderNodes(structure, 0)}
        {structure.length === 0 && <p className="muted" style={{ padding: 8 }}>Ei vielä lukuja.</p>}
      </div>
      <div className="binder-foot">
        <button className="btn small" onClick={() => addNode('chapter')} title="Uusi luku (⇧⌘L)">
          + Luku
        </button>
        <button className="btn small" onClick={() => addNode('scene')} title="Uusi kohtaus (⇧⌘K)">
          + Kohtaus
        </button>
        <button className="btn small" onClick={() => addNode('folder')} title="Uusi kansio">
          + Kansio
        </button>
      </div>
    </aside>
  );
}

interface RowProps {
  node: TreeNode;
  depth: number;
  dropMode: DropMode | null;
  children?: React.ReactNode;
  onDragStart(): void;
  onDragEnd(): void;
  onDragOver(e: React.DragEvent, el: HTMLElement): void;
  onDrop(): void;
}

function Row({ node, depth, dropMode, children, ...drag }: RowProps) {
  const active = useStore(s => s.activeId === node.id);
  const doc = useStore(s => s.project?.docs[node.id]);
  const { setActive, renameNode, deleteNode, moveUpDown } = useStore.getState();
  const [editing, setEditing] = useState(false);
  const words = doc ? countWords(doc.body) : 0;

  const remove = () => {
    const sub = node.children?.length ? ' ja sen alakohdat' : '';
    if (confirm(`Poistetaanko "${node.title}"${sub}? Tiedostot siirretään projektin roskakoriin (.faust/trash).`)) {
      void deleteNode(node.id);
    }
  };

  return (
    <>
      <div
        className={`tree-row${active ? ' active' : ''}${dropMode ? ` drop-${dropMode}` : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        draggable={!editing}
        onClick={() => setActive(node.id)}
        onDoubleClick={() => setEditing(true)}
        onDragStart={e => {
          e.dataTransfer.effectAllowed = 'move';
          drag.onDragStart();
        }}
        onDragEnd={drag.onDragEnd}
        onDragOver={e => drag.onDragOver(e, e.currentTarget)}
        onDrop={e => {
          e.preventDefault();
          e.stopPropagation();
          drag.onDrop();
        }}
      >
        <span className="icon">{ICONS[node.type]}</span>
        {editing ? (
          <input
            className="input"
            autoFocus
            defaultValue={node.title}
            onClick={e => e.stopPropagation()}
            onBlur={e => {
              const title = e.target.value.trim();
              if (title && title !== node.title) renameNode(node.id, title);
              setEditing(false);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <span className="title">{node.title}</span>
        )}
        {doc && <span className={`status-dot status-${doc.meta.status}`} title={doc.meta.status} />}
        <span className="count">{words}</span>
        <span className="row-actions" onClick={e => e.stopPropagation()}>
          <button title="Siirrä ylös" onClick={() => moveUpDown(node.id, -1)}>↑</button>
          <button title="Siirrä alas" onClick={() => moveUpDown(node.id, 1)}>↓</button>
          <button title="Nimeä uudelleen" onClick={() => setEditing(true)}>✎</button>
          <button title="Poista" onClick={remove}>✕</button>
        </span>
      </div>
      {children}
    </>
  );
}

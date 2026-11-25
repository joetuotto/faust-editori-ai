/**
 * Pure helpers for the binder tree in project.json.
 * All functions return new arrays; inputs are never mutated.
 */
import type { BibleKind, NodeType, TreeNode } from './types';
import { slugify } from './text';

export function docFileFor(title: string, id: string): string {
  return `manuscript/${slugify(title)}-${id}.md`;
}

export function bibleFileFor(kind: BibleKind, name: string, id: string): string {
  return `bible/${kind}/${slugify(name)}-${id}.md`;
}

export function flatten(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap(n => [n, ...flatten(n.children ?? [])]);
}

export function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  return flatten(nodes).find(n => n.id === id) ?? null;
}

/** Parent id of a node, `null` for top level, `undefined` if not found */
export function findParentId(nodes: TreeNode[], id: string, parentId: string | null = null): string | null | undefined {
  for (const n of nodes) {
    if (n.id === id) return parentId;
    const found = findParentId(n.children ?? [], id, n.id);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function canHaveChildren(type: NodeType): boolean {
  return type === 'folder' || type === 'chapter';
}

/** Insert `node` under `parentId` (null = top level) after `afterId`, or last */
export function insertNode(nodes: TreeNode[], node: TreeNode, parentId: string | null, afterId?: string): TreeNode[] {
  const insertInto = (list: TreeNode[]): TreeNode[] => {
    const index = afterId ? list.findIndex(n => n.id === afterId) : -1;
    const copy = [...list];
    copy.splice(index >= 0 ? index + 1 : copy.length, 0, node);
    return copy;
  };
  if (parentId === null) return insertInto(nodes);
  return nodes.map(n =>
    n.id === parentId
      ? { ...n, children: insertInto(n.children ?? []) }
      : { ...n, children: n.children ? insertNode(n.children, node, parentId, afterId) : n.children }
  );
}

/** Remove a node (and its subtree). Returns the new tree and the removed nodes */
export function removeNode(nodes: TreeNode[], id: string): { tree: TreeNode[]; removed: TreeNode[] } {
  let removed: TreeNode[] = [];
  const walk = (list: TreeNode[]): TreeNode[] =>
    list.flatMap(n => {
      if (n.id === id) {
        removed = flatten([n]);
        return [];
      }
      return [{ ...n, children: n.children ? walk(n.children) : n.children }];
    });
  return { tree: walk(nodes), removed };
}

export function updateNode(nodes: TreeNode[], id: string, patch: Partial<TreeNode>): TreeNode[] {
  return nodes.map(n =>
    n.id === id
      ? { ...n, ...patch }
      : { ...n, children: n.children ? updateNode(n.children, id, patch) : n.children }
  );
}

/** Move a node up (-1) or down (+1) among its siblings */
export function moveSibling(nodes: TreeNode[], id: string, delta: -1 | 1): TreeNode[] {
  const index = nodes.findIndex(n => n.id === id);
  if (index >= 0) {
    const target = index + delta;
    if (target < 0 || target >= nodes.length) return nodes;
    const copy = [...nodes];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    return copy;
  }
  return nodes.map(n => ({ ...n, children: n.children ? moveSibling(n.children, id, delta) : n.children }));
}

/**
 * Move `id` to be a child of `parentId` (null = top level) at `index`.
 * Refuses to move a node into its own subtree.
 */
export function moveNode(nodes: TreeNode[], id: string, parentId: string | null, index: number): TreeNode[] {
  const node = findNode(nodes, id);
  if (!node) return nodes;
  if (parentId && flatten([node]).some(n => n.id === parentId)) return nodes;
  const { tree } = removeNode(nodes, id);
  const place = (list: TreeNode[]): TreeNode[] => {
    const copy = [...list];
    copy.splice(Math.max(0, Math.min(index, copy.length)), 0, node);
    return copy;
  };
  if (parentId === null) return place(tree);
  const withChild = (list: TreeNode[]): TreeNode[] =>
    list.map(n =>
      n.id === parentId
        ? { ...n, children: place(n.children ?? []) }
        : { ...n, children: n.children ? withChild(n.children) : n.children }
    );
  return withChild(tree);
}

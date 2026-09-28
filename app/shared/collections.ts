/**
 * Collections: saved filters over the manuscript ("all scenes where Aino is
 * the POV", "unfinished chapters"). Stored in project.json; a document can be
 * in any number of collections without being moved.
 */
import type { DocStatus, NodeType, OpenProject, TreeNode } from './types';
import { flatten } from './tree';

export interface CollectionFilter {
  types?: NodeType[];
  statuses?: DocStatus[];
  /** Point-of-view character name (case-insensitive) */
  pov?: string;
  /** Story bible entry id: the document is linked to it */
  entry?: string;
  label?: string;
  /** Words in the text, title or synopsis */
  text?: string;
}

export interface Collection {
  id: string;
  name: string;
  filter: CollectionFilter;
}

function lower(s: unknown): string {
  return String(s ?? '').toLocaleLowerCase('fi');
}

export function matchesFilter(project: OpenProject, node: TreeNode, filter: CollectionFilter): boolean {
  const doc = project.docs[node.id];
  if (!doc) return false;
  const m = doc.meta;
  if (filter.types?.length && !filter.types.includes(node.type)) return false;
  if (filter.statuses?.length && !filter.statuses.includes(m.status)) return false;
  if (filter.pov && lower(m.pov) !== lower(filter.pov)) return false;
  if (filter.label && lower(m.label) !== lower(filter.label)) return false;
  if (filter.entry && ![...(m.characters ?? []), ...(m.locations ?? []), ...(m.threads ?? [])].includes(filter.entry)) {
    // A character also counts when it is the POV of the scene
    const entry = project.bible[filter.entry];
    if (!entry || lower(m.pov) !== lower(entry.name)) return false;
  }
  if (filter.text) {
    const q = lower(filter.text.trim());
    if (q && ![node.title, m.synopsis, doc.body].some(s => lower(s).includes(q))) return false;
  }
  return true;
}

/** Documents in the collection, in manuscript order */
export function collectionNodes(project: OpenProject, filter: CollectionFilter): TreeNode[] {
  return flatten(project.manifest.structure).filter(n => matchesFilter(project, n, filter));
}

/** A short Finnish description of the filter */
export function describeFilter(project: OpenProject, filter: CollectionFilter): string {
  const STATUS: Record<DocStatus, string> = { plan: 'suunnitelma', draft: 'luonnos', revision: 'muokkaus', final: 'valmis' };
  const TYPES: Record<NodeType, string> = { folder: 'kansiot', chapter: 'luvut', scene: 'kohtaukset' };
  const parts = [
    filter.types?.length ? filter.types.map(t => TYPES[t]).join(' ja ') : '',
    filter.statuses?.length ? `tila: ${filter.statuses.map(s => STATUS[s]).join(', ')}` : '',
    filter.pov ? `POV: ${filter.pov}` : '',
    filter.entry ? `mukana: ${project.bible[filter.entry]?.name ?? '?'}` : '',
    filter.label ? `merkintä: ${filter.label}` : '',
    filter.text ? `sisältää ”${filter.text}”` : ''
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'kaikki';
}

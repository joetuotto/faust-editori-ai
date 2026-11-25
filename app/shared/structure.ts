/**
 * Scene-level view of the manuscript for the structure charts: pacing
 * numbers per scene and where each story bible entry appears.
 */
import type { BibleEntry, OpenProject, TreeNode } from './types';
import { countWords } from './text';
import { styleMetrics } from './style';

export interface SceneInfo {
  id: string;
  title: string;
  /** Title of the top-level chapter/folder the scene belongs to */
  chapter: string;
  chapterId: string;
  words: number;
  dialogueShare: number;
  tension?: number;
  pov?: string;
  storyTime?: string;
  characters: string[];
  locations: string[];
  threads: string[];
}

/** Scenes in binder order: leaf documents, plus chapters that have text of their own */
export function sceneList(project: OpenProject): SceneInfo[] {
  const out: SceneInfo[] = [];
  const walk = (nodes: TreeNode[], top: TreeNode | null) => {
    for (const node of nodes) {
      const chapter = top ?? node;
      const doc = project.docs[node.id];
      const body = doc?.body ?? '';
      const hasChildren = !!node.children && node.children.length > 0;
      // A chapter's own text (before its scenes) counts as a scene of its own
      if (node.type !== 'folder' && (!hasChildren || body.trim())) {
        out.push(info(node, chapter, doc, body));
      }
      if (hasChildren) walk(node.children!, chapter);
    }
  };
  const info = (node: TreeNode, chapter: TreeNode, doc: OpenProject['docs'][string] | undefined, body: string): SceneInfo => ({
    id: node.id,
    title: node.title,
    chapter: chapter.title,
    chapterId: chapter.id,
    words: countWords(body),
    dialogueShare: body.trim() ? styleMetrics(body).dialogueShare : 0,
    tension: doc?.meta.tension,
    pov: doc?.meta.pov,
    storyTime: doc?.meta.storyTime,
    characters: doc?.meta.characters ?? [],
    locations: doc?.meta.locations ?? [],
    threads: doc?.meta.threads ?? []
  });
  walk(project.manifest.structure, null);
  return out;
}

export interface Presence {
  entry: BibleEntry;
  /** Indexes of scenes where the entry appears */
  scenes: number[];
  /** Most scenes in a row without the entry, between two appearances */
  longestGap: number;
  /** Scenes after the last appearance */
  sinceLast: number;
}

export function presence(scenes: SceneInfo[], entries: BibleEntry[], key: 'characters' | 'threads' | 'locations'): Presence[] {
  return entries.map(entry => {
    const indexes = scenes.flatMap((s, i) => (s[key].includes(entry.id) ? [i] : []));
    let longestGap = 0;
    for (let i = 1; i < indexes.length; i++) longestGap = Math.max(longestGap, indexes[i] - indexes[i - 1] - 1);
    return {
      entry,
      scenes: indexes,
      longestGap,
      sinceLast: indexes.length ? scenes.length - 1 - indexes[indexes.length - 1] : scenes.length
    };
  });
}

const RESOLVED = /ratk|päät|valmis|suljettu|resolved|closed/i;

/** Plot threads that seem forgotten */
export function threadWarnings(scenes: SceneInfo[], threads: Presence[], gapLimit = 5): string[] {
  if (scenes.length < 3) return [];
  const warnings: string[] = [];
  for (const t of threads) {
    const status = t.entry.fields['tila'] ?? t.entry.fields['status'] ?? '';
    if (t.scenes.length === 0) {
      warnings.push(`”${t.entry.name}” ei ole merkitty yhteenkään kohtaukseen.`);
      continue;
    }
    if (t.longestGap >= gapLimit) {
      warnings.push(`”${t.entry.name}” katoaa ${t.longestGap} kohtauksen ajaksi.`);
    }
    if (!RESOLVED.test(status) && t.sinceLast >= gapLimit) {
      warnings.push(`”${t.entry.name}” jää auki: ei mainintaa ${t.sinceLast} viimeisessä kohtauksessa.`);
    }
  }
  return warnings;
}

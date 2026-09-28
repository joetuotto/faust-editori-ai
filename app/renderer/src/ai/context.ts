/**
 * Builds the prompts sent to the AI. The system prompt holds only stable
 * project context (so the provider can cache it across turns); the current
 * scene is attached to the user's message instead.
 */
import type { BibleEntry, OpenProject, TreeNode } from '../../../shared/types';
import { flatten } from '../../../shared/tree';

const MAX_SCENE_CHARS = 12000;

function bibleSection(title: string, entries: BibleEntry[]): string {
  if (entries.length === 0) return '';
  const lines = entries.map(e => {
    const fields = Object.entries(e.fields)
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
    return `- ${e.name}${e.summary ? ` — ${e.summary}` : ''}${fields ? ` (${fields})` : ''}`;
  });
  return `${title}:\n${lines.join('\n')}`;
}

function outline(project: OpenProject): string {
  const walk = (nodes: TreeNode[], depth: number): string[] =>
    nodes.flatMap(n => {
      const synopsis = project.docs[n.id]?.meta.synopsis;
      const line = `${'  '.repeat(depth)}- ${n.title}${synopsis ? `: ${synopsis}` : ''}`;
      return [line, ...walk(n.children ?? [], depth + 1)];
    });
  return walk(project.manifest.structure, 0).join('\n');
}

export function buildSystemPrompt(project: OpenProject): string {
  const { title, author, genre, language } = project.manifest;
  const bible = Object.values(project.bible).sort((a, b) => a.name.localeCompare(b.name, 'fi'));

  return [
    'Olet FAUST-kirjoitusohjelman kirjallinen avustaja. Autat kirjailijaa hänen omassa teoksessaan: ideoit, kysyt tarkentavia kysymyksiä, huomaat ristiriitoja ja annat palautetta.',
    'Kunnioita kirjailijan ääntä ja tyyliä. Älä kirjoita teosta hänen puolestaan, ellei hän nimenomaan pyydä tekstiä. Kun ehdotat tekstiä, pidä se lyhyenä ja merkitse selvästi ehdotukseksi.',
    `Vastaa samalla kielellä kuin kirjailija kirjoittaa (teoksen kieli: ${language || 'fi'}).`,
    '',
    `TEOS: ${title}${author ? ` (${author})` : ''}, laji: ${genre}`,
    '',
    'RAKENNE:',
    outline(project) || '(ei vielä lukuja)',
    '',
    bibleSection('HENKILÖT', bible.filter(e => e.kind === 'characters')),
    bibleSection('PAIKAT', bible.filter(e => e.kind === 'locations')),
    bibleSection('JUONILANGAT', bible.filter(e => e.kind === 'threads'))
  ]
    .filter(line => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The active scene as context for one message (tail if very long) */
export function sceneContext(project: OpenProject, id: string | null): string {
  if (!id) return '';
  const doc = project.docs[id];
  const node = flatten(project.manifest.structure).find(n => n.id === id);
  if (!doc || !node) return '';
  const body = doc.body.length > MAX_SCENE_CHARS ? `…${doc.body.slice(-MAX_SCENE_CHARS)}` : doc.body;
  return [
    `NYKYINEN ${node.type === 'scene' ? 'KOHTAUS' : 'LUKU'}: ${node.title}`,
    doc.meta.synopsis ? `Synopsis: ${doc.meta.synopsis}` : '',
    doc.meta.pov ? `Näkökulmahenkilö: ${doc.meta.pov}` : '',
    '<teksti>',
    body || '(tyhjä)',
    '</teksti>'
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Builds the prompts sent to the AI. The system prompt holds only stable
 * project context (so the provider can cache it across turns); the current
 * scene is attached to the user's message instead.
 */
import type { BibleEntry, OpenProject, TreeNode } from '../../../shared/types';
import { flatten } from '../../../shared/tree';

const MAX_SCENE_CHARS = 12000;

function bibleSection(title: string, entries: BibleEntry[], compact = false): string {
  if (entries.length === 0) return '';
  const lines = entries.map(e => {
    if (compact) return `- ${e.name}${e.summary ? ` — ${e.summary}` : ''}`;
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

export type Mode = 'DEIS' | 'NOX';

/** How the assistant behaves in each of the two rhythms */
export const MODE_ROLES: Record<Mode, string> = {
  DEIS: [
    'TILA: DEIS (päivä: ideointi ja rakenne).',
    'Ole rohkea sparraaja: ehdota useita vaihtoehtoja, haasta rakennetta ja motiiveja, kysy mitä kirjailija tavoittelee ja nosta esiin ristiriidat ja käyttämättömät mahdollisuudet.'
  ].join('\n'),
  NOX: [
    'TILA: NOX (yö: kirjoittaminen ja syvä keskittyminen).',
    'Kirjailija kirjoittaa. Älä kirjoita tekstiä hänen puolestaan äläkä ehdota valmiita lauseita tai jatkoa.',
    'Vastaa hyvin lyhyesti. Esitä korkeintaan yksi kysymys, joka auttaa häntä itse löytämään seuraavan askeleen.'
  ].join('\n')
};

export const MODE_PROMPTS: Record<Mode, { label: string; prompt: string }[]> = {
  DEIS: [
    { label: 'Viisi käännettä', prompt: 'Ehdota viisi erilaista käännettä, joihin tarina voisi tästä kohdasta edetä. Yksi rivi per ehdotus.' },
    { label: 'Haasta rakenne', prompt: 'Mikä rakenteessa on heikointa tai ennalta-arvattavinta? Ole suora.' },
    { label: 'Mitä lukija tietää?', prompt: 'Mitä lukija tietää ja mitä hän odottaa tässä vaiheessa tarinaa? Mitä kannattaisi pantata?' },
    { label: 'Henkilön motiivi', prompt: 'Kenen henkilön motiivi on tässä kohtaa epäselvin, ja mitä kysymyksiä minun pitäisi hänestä kysyä?' }
  ],
  NOX: [
    { label: 'Kysy minulta', prompt: 'Kysy minulta yksi kysymys, joka auttaa minua jatkamaan tätä kohtausta.' },
    { label: 'Kohtauksen ydin', prompt: 'Mikä on tämän kohtauksen ydin yhdellä lauseella?' }
  ]
};

/** How the model should use project lookups when it has them */
const TOOL_GUIDE = [
  'TYÖKALUT: Voit hakea tietopankin merkinnän kaikki tiedot (get_bible_entry), lukea minkä tahansa luvun tai kohtauksen (get_document) ja etsiä koko käsikirjoituksesta (search_manuscript).',
  'Hae tiedot ennen kuin väität jotain yksityiskohdista, joita et näe tässä kehotteessa. Älä hae turhaan, jos vastaus löytyy jo keskustelusta.'
].join('\n');

/**
 * Project context for the system prompt. With `tools`, the story bible is
 * only a list of names (details are looked up), which keeps the prompt small.
 */
export function buildSystemPrompt(project: OpenProject, options: { tools?: boolean } = {}): string {
  const compact = !!options.tools;
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
    bibleSection('HENKILÖT', bible.filter(e => e.kind === 'characters'), compact),
    bibleSection('PAIKAT', bible.filter(e => e.kind === 'locations'), compact),
    bibleSection('JUONILANGAT', bible.filter(e => e.kind === 'threads'), compact),
    compact ? `\n${TOOL_GUIDE}` : ''
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

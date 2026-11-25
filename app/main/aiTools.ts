/**
 * Read-only project lookups the AI can call while answering. Instead of the
 * whole story bible and long scenes in every prompt, the model fetches what
 * the question needs. Nothing here can change the project.
 */
import type { BibleEntry, OpenProject, TreeNode } from '../shared/types';
import { flatten } from '../shared/tree';
import { searchMarkdown } from '../shared/search';

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema of the input object */
  parameters: Record<string, unknown>;
}

export interface ToolRunner {
  defs: ToolDef[];
  /** Returns the text given back to the model and a short label for the writer */
  run(name: string, input: Record<string, unknown>): { output: string; label: string };
}

const MAX_DOC_CHARS = 20000;
const MAX_HITS = 30;

const KIND_LABEL = { characters: 'henkilö', locations: 'paikka', threads: 'juonilanka' } as const;

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'get_bible_entry',
    description:
      'Hakee tarinan tietopankista henkilön, paikan tai juonilangan kaikki tiedot (kentät ja muistiinpanot). Käytä, kun tarvitset yksityiskohtia, joita järjestelmäkehotteen lyhyt luettelo ei kerro.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Nimi tai sen osa, esim. "Aino" tai "mökki"' } },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'get_document',
    description:
      'Lukee käsikirjoituksen luvun tai kohtauksen koko tekstin sekä synopsiksen, tilan ja näkökulmahenkilön. Käytä, kun kysymys koskee muuta kuin kirjailijan viestiin liitettyä kohtaa.',
    parameters: {
      type: 'object',
      properties: { title: { type: 'string', description: 'Luvun tai kohtauksen otsikko rakenteesta' } },
      required: ['title'],
      additionalProperties: false
    }
  },
  {
    name: 'search_manuscript',
    description:
      'Etsii sanaa tai fraasia koko käsikirjoituksesta ja palauttaa osumat asiayhteyksineen ja lukujen nimineen. Käytä esimerkiksi tarkistaessasi, missä jokin henkilö tai esine mainitaan.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Haettava sana tai fraasi' } },
      required: ['query'],
      additionalProperties: false
    }
  }
];

function normalize(text: string): string {
  return text.toLocaleLowerCase('fi').replace(/\s+/g, ' ').trim();
}

/** Exact match first, then prefix, then substring */
function best<T>(items: T[], key: (item: T) => string, query: string): T[] {
  const q = normalize(query);
  if (!q) return [];
  for (const test of [(k: string) => k === q, (k: string) => k.startsWith(q), (k: string) => k.includes(q)]) {
    const found = items.filter(i => test(normalize(key(i))));
    if (found.length > 0) return found;
  }
  return [];
}

function describeEntry(e: BibleEntry): string {
  const fields = Object.entries(e.fields).map(([k, v]) => `${k}: ${v}`);
  return [
    `${e.name} (${KIND_LABEL[e.kind]})`,
    e.summary ? `Yhteenveto: ${e.summary}` : '',
    ...fields,
    e.body ? `\n${e.body}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

export function projectTools(project: OpenProject): ToolRunner {
  const nodes = flatten(project.manifest.structure);
  const entries = Object.values(project.bible);

  const tools: Record<string, (input: Record<string, unknown>) => { output: string; label: string }> = {
    get_bible_entry(input) {
      const name = String(input.name ?? '');
      const found = best(entries, e => e.name, name);
      const label = `tietopankki: ${name}`;
      if (found.length === 0) {
        return { output: `Tietopankissa ei ole nimeä "${name}". Nimet: ${entries.map(e => e.name).join(', ') || '(tyhjä)'}`, label };
      }
      return { output: found.slice(0, 3).map(describeEntry).join('\n\n---\n\n'), label: `tietopankki: ${found[0].name}` };
    },

    get_document(input) {
      const title = String(input.title ?? '');
      const found = best(nodes, n => n.title, title);
      if (found.length === 0) {
        return { output: `Rakenteessa ei ole otsikkoa "${title}". Otsikot: ${nodes.map(n => n.title).join(', ')}`, label: `teksti: ${title}` };
      }
      const node: TreeNode = found[0];
      const doc = project.docs[node.id];
      const body = doc?.body ?? '';
      const text = body.length > MAX_DOC_CHARS ? `${body.slice(0, MAX_DOC_CHARS)}\n…(katkaistu, ${body.length} merkkiä)` : body;
      const children = (node.children ?? []).map(c => c.title);
      return {
        output: [
          `${node.type === 'scene' ? 'KOHTAUS' : node.type === 'folder' ? 'KANSIO' : 'LUKU'}: ${node.title}`,
          doc?.meta.synopsis ? `Synopsis: ${doc.meta.synopsis}` : '',
          doc?.meta.pov ? `Näkökulmahenkilö: ${doc.meta.pov}` : '',
          doc ? `Tila: ${doc.meta.status}` : '',
          children.length ? `Sisältää: ${children.join(', ')}` : '',
          '<teksti>',
          text || '(tyhjä)',
          '</teksti>'
        ]
          .filter(Boolean)
          .join('\n'),
        label: `teksti: ${node.title}`
      };
    },

    search_manuscript(input) {
      const query = String(input.query ?? '');
      const lines: string[] = [];
      let total = 0;
      for (const node of nodes) {
        const hits = searchMarkdown(project.docs[node.id]?.body ?? '', query, { caseSensitive: false, wholeWord: false }, 60);
        total += hits.length;
        for (const h of hits) {
          if (lines.length < MAX_HITS) lines.push(`[${node.title}] …${h.before}«${h.match}»${h.after}…`);
        }
      }
      const label = `haku: ${query}`;
      if (total === 0) return { output: `Ei osumia haulle "${query}".`, label };
      return { output: `${total} osumaa${total > MAX_HITS ? ` (näytetään ${MAX_HITS})` : ''}:\n${lines.join('\n')}`, label };
    }
  };

  return {
    defs: TOOL_DEFS,
    run(name, input) {
      const tool = tools[name];
      if (!tool) return { output: `Tuntematon työkalu: ${name}`, label: name };
      try {
        return tool(input ?? {});
      } catch (error) {
        return { output: `Virhe: ${(error as Error).message}`, label: name };
      }
    }
  };
}

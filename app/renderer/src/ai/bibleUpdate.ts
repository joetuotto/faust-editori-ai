/**
 * Read a scene and propose story bible changes: new facts about existing
 * entries, new entries, contradictions with what the bible says, and which
 * entries appear in the scene.
 */
import type { BibleEntry, BibleKind, OpenProject } from '../../../shared/types';
import { buildSystemPrompt } from './context';
import { generateJSON, type JSONResult } from './request';

export interface BibleUpdateProposal {
  updates: { entry: string; field: string; value: string; reason: string }[];
  newEntries: { kind: BibleKind; name: string; summary: string }[];
  contradictions: { entry: string; issue: string; quote: string }[];
  appearing: { characters: string[]; locations: string[]; threads: string[] };
}

const stringArray = { type: 'array', items: { type: 'string' } };

export const BIBLE_UPDATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['updates', 'newEntries', 'contradictions', 'appearing'],
  properties: {
    updates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['entry', 'field', 'value', 'reason'],
        properties: { entry: { type: 'string' }, field: { type: 'string' }, value: { type: 'string' }, reason: { type: 'string' } }
      }
    },
    newEntries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'name', 'summary'],
        properties: { kind: { type: 'string', enum: ['characters', 'locations', 'threads'] }, name: { type: 'string' }, summary: { type: 'string' } }
      }
    },
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['entry', 'issue', 'quote'],
        properties: { entry: { type: 'string' }, issue: { type: 'string' }, quote: { type: 'string' } }
      }
    },
    appearing: {
      type: 'object',
      additionalProperties: false,
      required: ['characters', 'locations', 'threads'],
      properties: { characters: stringArray, locations: stringArray, threads: stringArray }
    }
  }
};

function entryDetails(entry: BibleEntry): string {
  const fields = Object.entries(entry.fields).map(([k, v]) => `  ${k}: ${v}`);
  return [`[${entry.kind}] ${entry.name}${entry.summary ? ` — ${entry.summary}` : ''}`, ...fields, entry.body ? `  muistiinpanot: ${entry.body.slice(0, 600)}` : '']
    .filter(Boolean)
    .join('\n');
}

export function proposeBibleUpdates(project: OpenProject, docId: string, onCall?: (id: string) => void): Promise<JSONResult<BibleUpdateProposal>> {
  const doc = project.docs[docId];
  const bible = Object.values(project.bible);
  return generateJSON<BibleUpdateProposal>(
    {
      system: buildSystemPrompt(project),
      schema: BIBLE_UPDATE_SCHEMA,
      effort: 'medium',
      maxTokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            'Tehtävä: pidä tarinan tietopankki ajan tasalla. Lue alla oleva kohtaus ja vertaa sitä tietopankin nykyisiin merkintöihin.',
            '- updates: uudet tai muuttuneet faktat olemassa oleviin merkintöihin (käytä merkinnän nimeä täsmälleen). Vain tekstistä suoraan ilmenevää, ei tulkintaa. Kentän nimi lyhyesti suomeksi (esim. ikä, ulkonäkö, suhde, tila).',
            '- newEntries: henkilöt, paikat ja juonilangat, jotka ovat kohtauksessa merkittäviä mutta puuttuvat tietopankista.',
            '- contradictions: kohdat, joissa teksti on ristiriidassa tietopankin kanssa; lainaa ristiriitainen kohta tekstistä täsmälleen (quote).',
            '- appearing: kohtauksessa esiintyvien tai siinä keskeisten merkintöjen nimet (myös uusien).',
            'Jos jotain ei ole, palauta tyhjä lista.',
            '',
            'TIETOPANKKI:',
            bible.length ? bible.map(entryDetails).join('\n\n') : '(tyhjä)',
            '',
            `KOHTAUS: ${doc?.meta.title ?? ''}`,
            '<teksti>',
            doc?.body ?? '',
            '</teksti>'
          ].join('\n')
        }
      ]
    },
    onCall
  );
}

/**
 * AI draft for a new story bible entry (character, place or plot thread)
 * that fits the book. The writer reviews and edits it before it is saved.
 */
import type { BibleKind, OpenProject } from '../../../shared/types';
import { buildSystemPrompt } from './context';
import { generateJSON, type JSONResult } from './request';

export interface EntryDraft {
  name: string;
  summary: string;
  fields: { name: string; value: string }[];
  body: string;
}

// Field names go in an array: Finnish keys (ikä, ulkonäkö) are not valid schema property names everywhere
const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    summary: { type: 'string' },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, value: { type: 'string' } },
        required: ['name', 'value'],
        additionalProperties: false
      }
    },
    body: { type: 'string' }
  },
  required: ['name', 'summary', 'fields', 'body'],
  additionalProperties: false
};

const WHAT: Record<BibleKind, string> = {
  characters: 'henkilön',
  locations: 'paikan',
  threads: 'juonilangan'
};

export function generateEntry(
  project: OpenProject,
  kind: BibleKind,
  brief: string,
  fieldNames: string[],
  onCall?: (id: string) => void
): Promise<JSONResult<EntryDraft>> {
  return generateJSON<EntryDraft>(
    {
      system: buildSystemPrompt(project),
      schema: SCHEMA,
      effort: 'medium',
      maxTokens: 4000,
      temperature: 0.9,
      messages: [
        {
          role: 'user',
          content: [
            `Luonnostele teokseen sopivan uuden ${WHAT[kind]} tiedot tarinan tietopankkiin.`,
            `Kirjailijan kuvaus: ${brief.trim() || '(vapaa, keksi teokseen sopiva)'}`,
            '',
            '- name: nimi (henkilölle etu- ja sukunimi, joka sopii teoksen aikaan ja paikkaan)',
            '- summary: yksi rivi, mikä tämä on tarinassa',
            `- fields: ainakin nämä kentät: ${fieldNames.join(', ')}. Arvot lyhyinä ja konkreettisina.`,
            '- body: 3–6 virkkeen muistiinpano: tausta, ristiriidat ja mitä tästä voisi seurata tarinassa. Ei valmista kaunokirjallista tekstiä.',
            'Älä toista olemassa olevia nimiä. Vältä kliseitä; anna yksi yllättävä mutta uskottava piirre.'
          ].join('\n')
        }
      ]
    },
    onCall
  );
}

/** "Beta reader": the AI reads as a first-time reader and reports where it lost interest */
import type { OpenProject } from '../../../shared/types';
import type { SceneInfo } from '../../../shared/structure';
import { generateJSON, type JSONResult } from './request';

export const PERSONAS = [
  { id: 'reader', label: 'Tavallinen lukija', brief: 'Olet tavallinen aikuinen lukija, joka lukee kirjoja iltaisin huvikseen.' },
  { id: 'fan', label: 'Lajityypin ystävä', brief: 'Olet tämän lajityypin innokas lukija, joka tuntee sen konventiot ja kyllästyy kliseisiin.' },
  { id: 'editor', label: 'Kriittinen kustannustoimittaja', brief: 'Olet kustantamon kriittinen kustannustoimittaja, joka lukee käsikirjoituspinoa ja päättää, lukeeko eteenpäin.' },
  { id: 'young', label: 'Nuori lukija', brief: 'Olet 16-vuotias lukija, jolla on paljon muutakin tekemistä kuin lukeminen.' }
] as const;

export type PersonaId = (typeof PERSONAS)[number]['id'];

export interface QuoteNote {
  quote: string;
  why: string;
}

export interface ReaderReport {
  firstImpression: string;
  lostInterest: QuoteNote[];
  confusing: QuoteNote[];
  strongest: QuoteNote[];
  questions: string[];
  wouldContinue: { answer: 'kyllä' | 'ehkä' | 'ei'; why: string };
}

export interface SavedReport {
  at: string;
  persona: PersonaId;
  scope: string;
  report: ReaderReport;
}

const quoteList = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['quote', 'why'],
    properties: { quote: { type: 'string' }, why: { type: 'string' } }
  }
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['firstImpression', 'lostInterest', 'confusing', 'strongest', 'questions', 'wouldContinue'],
  properties: {
    firstImpression: { type: 'string' },
    lostInterest: quoteList,
    confusing: quoteList,
    strongest: quoteList,
    questions: { type: 'array', items: { type: 'string' } },
    wouldContinue: {
      type: 'object',
      additionalProperties: false,
      required: ['answer', 'why'],
      properties: { answer: { type: 'string', enum: ['kyllä', 'ehkä', 'ei'] }, why: { type: 'string' } }
    }
  }
};

export function manuscriptText(project: OpenProject, scenes: SceneInfo[]): string {
  let chapter = '';
  const parts: string[] = [];
  for (const s of scenes) {
    if (s.chapter !== chapter) {
      chapter = s.chapter;
      parts.push(`## ${chapter}`);
    }
    if (s.title !== s.chapter) parts.push(`### ${s.title}`);
    parts.push(project.docs[s.id]?.body ?? '');
  }
  return parts.join('\n\n');
}

export function readAsBetaReader(
  project: OpenProject,
  text: string,
  persona: PersonaId,
  onCall?: (id: string) => void
): Promise<JSONResult<ReaderReport>> {
  const p = PERSONAS.find(x => x.id === persona)!;
  return generateJSON<ReaderReport>(
    {
      system: `${p.brief} Luet teosta ”${project.manifest.title}” (${project.manifest.genre}) ensimmäistä kertaa etkä tiedä siitä mitään etukäteen. Vastaa suomeksi, rehellisesti ja konkreettisesti, lukijan kokemuksena, älä kirjoittamisen opettajana.`,
      schema: SCHEMA,
      maxTokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            'Lue alla oleva teksti alusta loppuun lukijana ja kerro kokemuksesi:',
            '- firstImpression: ensivaikutelma parilla lauseella',
            '- lostInterest: kohdat, joissa mielenkiintosi herpaantui (lainaa lyhyesti ja täsmälleen tekstistä, enintään 15 sanaa)',
            '- confusing: kohdat, joissa et pysynyt kärryillä',
            '- strongest: kohdat, jotka toimivat parhaiten',
            '- questions: kysymykset, joita sinulle jäi mieleen tarinasta',
            '- wouldContinue: jatkaisitko lukemista ja miksi',
            '',
            '<teksti>',
            text,
            '</teksti>'
          ].join('\n')
        }
      ]
    },
    onCall
  );
}

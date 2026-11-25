/** Estimate dramatic tension (1–10) per scene with the AI, in batches */
import type { OpenProject } from '../../../shared/types';
import type { SceneInfo } from '../../../shared/structure';
import { generateJSON } from './request';

interface TensionResult {
  scores: { id: string; tension: number; reason: string }[];
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scores'],
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'tension', 'reason'],
        properties: { id: { type: 'string' }, tension: { type: 'integer', minimum: 1, maximum: 10 }, reason: { type: 'string' } }
      }
    }
  }
};

const BATCH = 12;
const EXCERPT = 2500;

function excerpt(body: string): string {
  if (body.length <= EXCERPT) return body;
  // Beginning and end carry most of a scene's movement
  return `${body.slice(0, EXCERPT * 0.6)}\n[…]\n${body.slice(-EXCERPT * 0.4)}`;
}

export async function estimateTension(
  project: OpenProject,
  scenes: SceneInfo[],
  onProgress: (done: number, total: number) => void,
  onCall?: (id: string) => void
): Promise<{ scores: Record<string, number>; error?: string }> {
  const scores: Record<string, number> = {};
  const todo = scenes.filter(s => s.words > 0);
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const result = await generateJSON<TensionResult>(
      {
        effort: 'low',
        maxTokens: 4000,
        messages: [
          {
            role: 'user',
            content: [
              `Teos: ${project.manifest.title} (${project.manifest.genre}).`,
              'Arvioi kunkin kohtauksen dramaattinen jännite asteikolla 1–10 (1 = levollinen, 10 = huipennus). Arvioi kohtauksia suhteessa toisiinsa. Perustelu yhdellä lyhyellä lauseella suomeksi.',
              '',
              ...batch.map(s => `<kohtaus id="${s.id}" otsikko="${s.title.replace(/"/g, "'")}">\n${excerpt(project.docs[s.id]?.body ?? '')}\n</kohtaus>`)
            ].join('\n')
          }
        ],
        schema: SCHEMA
      },
      onCall
    );
    if (!result.ok) return { scores, error: result.error };
    for (const s of result.data.scores) {
      if (batch.some(b => b.id === s.id)) scores[s.id] = Math.max(1, Math.min(10, Math.round(s.tension)));
    }
    onProgress(Math.min(i + BATCH, todo.length), todo.length);
  }
  return { scores };
}

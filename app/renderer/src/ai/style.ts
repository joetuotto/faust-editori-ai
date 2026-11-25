import type { OpenProject } from '../../../shared/types';
import type { DocProvenance } from '../../../shared/provenance';
import { styleMetrics, withoutAIText, type StyleMetrics } from '../../../shared/style';
import { flatten } from '../../../shared/tree';

/** The writer's own text across the manuscript, in binder order */
export function ownManuscriptText(project: OpenProject, provenance: Record<string, DocProvenance>): string[] {
  return flatten(project.manifest.structure)
    .map(n => {
      const body = project.docs[n.id]?.body ?? '';
      return withoutAIText(body, (provenance[n.id]?.spans ?? []).map(s => s.text));
    })
    .filter(t => t.trim());
}

export function measureOwnStyle(project: OpenProject, provenance: Record<string, DocProvenance>): StyleMetrics {
  return styleMetrics(ownManuscriptText(project, provenance).join('\n\n'));
}

/** Evenly spread paragraphs (with some prose, not just dialogue) up to about `maxWords` words */
export function styleSample(texts: string[], maxWords = 2500): string {
  const paragraphs = texts.flatMap(t => t.split(/\n{2,}/)).map(p => p.trim()).filter(p => p.split(/\s+/).length >= 12);
  if (paragraphs.length === 0) return '';
  const total = paragraphs.reduce((n, p) => n + p.split(/\s+/).length, 0);
  const step = Math.max(1, Math.round(total / maxWords));
  const picked: string[] = [];
  let words = 0;
  for (let i = 0; i < paragraphs.length && words < maxWords; i += step) {
    picked.push(paragraphs[i]);
    words += paragraphs[i].split(/\s+/).length;
  }
  return picked.join('\n\n');
}

export const STYLE_DESCRIPTION_PROMPT = [
  'Alla on otteita kirjailijan omasta tekstistä. Kuvaa hänen tyylinsä tiiviisti ranskalaisin viivoin, enintään 10 kohtaa:',
  'kertojan ääni ja näkökulma, lauserytmi, sanasto ja rekisteri, kuvakieli, dialogi ja sen merkintätapa sekä se, mitä hän selvästi välttää.',
  'Älä arvota tekstiä. Kirjoita kuvaus niin, että toinen kirjoittaja voisi sen avulla muokata tekstiä hänen äänellään.'
].join(' ');

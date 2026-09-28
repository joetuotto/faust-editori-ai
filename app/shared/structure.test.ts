import { describe, expect, it } from 'vitest';
import type { BibleEntry, Doc, OpenProject, TreeNode } from './types';
import { presence, sceneList, threadWarnings } from './structure';

const node = (id: string, type: TreeNode['type'], children?: TreeNode[]): TreeNode => ({ id, type, title: id, file: `${id}.md`, children });
const doc = (id: string, body: string, meta: Partial<Doc['meta']> = {}): Doc => ({
  meta: { id, title: id, type: 'scene', status: 'draft', synopsis: '', notes: '', created: '', modified: '', ...meta },
  body
});
const entry = (id: string, name: string, fields: Record<string, string> = {}): BibleEntry => ({
  id, kind: 'threads', name, summary: '', fields, body: '', file: '', created: '', modified: ''
});

function project(): OpenProject {
  const structure = [node('c1', 'chapter', [node('s1', 'scene'), node('s2', 'scene')]), node('c2', 'chapter'), node('f', 'folder')];
  const docs: Record<string, Doc> = {
    c1: doc('c1', 'Luvun oma alku.'),
    s1: doc('s1', '– Tule, hän sanoi.\n\nJärvi oli tyyni.', { tension: 3, threads: ['t1'] }),
    s2: doc('s2', 'Yö.', { threads: [] }),
    c2: doc('c2', 'Loppu tuli.', { tension: 8, threads: ['t1'] }),
    f: doc('f', '')
  };
  return { path: '', manifest: { structure } as OpenProject['manifest'], docs, bible: {} };
}

describe('structure', () => {
  it('lists leaf scenes in binder order with pacing numbers', () => {
    const scenes = sceneList(project());
    expect(scenes.map(s => `${s.chapter}/${s.id}`)).toEqual(['c1/c1', 'c1/s1', 'c1/s2', 'c2/c2']);
    expect(scenes[1]).toMatchObject({ words: 6, tension: 3, dialogueShare: 0.5 });
  });

  it('skips empty chapters that only hold scenes', () => {
    const p = project();
    p.docs.c1.body = '';
    expect(sceneList(p).map(s => s.id)).toEqual(['s1', 's2', 'c2']);
  });

  it('finds gaps and forgotten threads', () => {
    const scenes = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`, title: '', chapter: '', chapterId: '', words: 0, dialogueShare: 0,
      characters: [], locations: [], threads: [0, 7].includes(i) ? ['t1'] : i === 1 ? ['t2'] : []
    }));
    const threads = presence(scenes, [entry('t1', 'Kirje'), entry('t2', 'Perintö'), entry('t3', 'Tyhjä'), entry('t4', 'Ratkaistu', { tila: 'ratkennut' })], 'threads');
    expect(threads[0]).toMatchObject({ scenes: [0, 7], longestGap: 6, sinceLast: 2 });
    expect(threadWarnings(scenes, threads)).toEqual([
      '”Kirje” katoaa 6 kohtauksen ajaksi.',
      '”Perintö” jää auki: ei mainintaa 8 viimeisessä kohtauksessa.',
      '”Tyhjä” ei ole merkitty yhteenkään kohtaukseen.',
      '”Ratkaistu” ei ole merkitty yhteenkään kohtaukseen.'
    ]);
  });
});

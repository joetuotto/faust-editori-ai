import { describe, expect, it } from 'vitest';
import type { OpenProject } from './types';
import { collectionNodes, describeFilter } from './collections';

const doc = (id: string, meta: Record<string, unknown>, body = '') => ({ meta: { id, title: id, synopsis: '', status: 'draft', ...meta }, body });

const PROJECT = {
  manifest: {
    structure: [
      { id: 'c1', type: 'chapter', title: 'Luku 1', file: '', children: [{ id: 's1', type: 'scene', title: 'Satama', file: '' }, { id: 's2', type: 'scene', title: 'Tori', file: '' }] },
      { id: 'c2', type: 'chapter', title: 'Luku 2', file: '', children: [{ id: 's3', type: 'scene', title: 'Mökki', file: '' }] }
    ]
  },
  docs: {
    c1: doc('c1', { status: 'final' }),
    s1: doc('s1', { pov: 'Aino', status: 'revision', label: 'takauma' }, 'Laiva saapui.'),
    s2: doc('s2', { pov: 'Kalle', characters: ['e1'] }, 'Torilla oli hiljaista.'),
    c2: doc('c2', {}),
    s3: doc('s3', { pov: 'aino', status: 'plan' }, 'Järvi.')
  },
  bible: { e1: { id: 'e1', kind: 'characters', name: 'Aino' } }
} as unknown as OpenProject;

const ids = (filter: Parameters<typeof collectionNodes>[1]) => collectionNodes(PROJECT, filter).map(n => n.id);

describe('collections', () => {
  it('filters by type, status, POV, label and text, in manuscript order', () => {
    expect(ids({ types: ['scene'] })).toEqual(['s1', 's2', 's3']);
    expect(ids({ statuses: ['plan', 'revision'] })).toEqual(['s1', 's3']);
    expect(ids({ pov: 'AINO' })).toEqual(['s1', 's3']);
    expect(ids({ label: 'takauma' })).toEqual(['s1']);
    expect(ids({ text: 'tori' })).toEqual(['s2']);
    expect(ids({})).toEqual(['c1', 's1', 's2', 'c2', 's3']);
  });

  it('a bible entry matches linked documents and POV scenes', () => {
    expect(ids({ entry: 'e1' })).toEqual(['s1', 's2', 's3']);
    expect(ids({ entry: 'e1', types: ['scene'], statuses: ['draft'] })).toEqual(['s2']);
  });

  it('describes the filter', () => {
    expect(describeFilter(PROJECT, { types: ['scene'], pov: 'Aino', entry: 'e1' })).toBe('kohtaukset · POV: Aino · mukana: Aino');
    expect(describeFilter(PROJECT, {})).toBe('kaikki');
  });
});

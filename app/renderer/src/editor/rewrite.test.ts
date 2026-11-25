import { describe, expect, it } from 'vitest';
import { cleanModelOutput, diffHunks, mergeHunks } from './rewrite';

describe('rewrite diff', () => {
  const original = 'Aino käveli hitaasti rantaan. Järvi oli tyyni.';
  const revised = 'Aino käveli *hitaasti* rantaan. Järvi oli peilityyni ja hiljainen.';

  it('accepting everything gives the revised text, rejecting everything the original', () => {
    const hunks = diffHunks(original, revised);
    expect(mergeHunks(hunks)).toBe(revised);
    const rejected = hunks.map(h => (h.kind === 'change' ? { ...h, accepted: false } : h));
    expect(mergeHunks(rejected)).toBe(original);
  });

  it('never splits Markdown emphasis when changes are mixed', () => {
    const hunks = diffHunks(original, revised);
    const changes = hunks.filter(h => h.kind === 'change');
    expect(changes[0]).toMatchObject({ removed: 'hitaasti', added: '*hitaasti*' });
    // Reject only the emphasis change
    let first = true;
    const mixed = hunks.map(h => {
      if (h.kind !== 'change') return h;
      const accepted = !first;
      first = false;
      return { ...h, accepted };
    });
    const merged = mergeHunks(mixed);
    expect(merged).toBe('Aino käveli hitaasti rantaan. Järvi oli peilityyni ja hiljainen.');
    expect(merged.split('*').length % 2).toBe(1);
  });

  it('strips code fences and wrapping quotes from model output', () => {
    expect(cleanModelOutput('```markdown\nTeksti.\n```')).toBe('Teksti.');
    expect(cleanModelOutput('"Teksti."')).toBe('Teksti.');
    expect(cleanModelOutput('Hän sanoi: "ei".')).toBe('Hän sanoi: "ei".');
  });

  it('shows a near-total rewrite as one change', () => {
    const hunks = diffHunks('Järvi oli tyyni. Kukaan ei puhunut.', 'Peilityyni vesi lepäsi hämärässä, eikä kukaan sanonut sanaakaan.');
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ kind: 'change', removed: 'Järvi oli tyyni. Kukaan ei puhunut.' });
  });

  it('folds short unchanged bridges into one change', () => {
    const original = 'Aino käveli hitaasti ja varovasti rantaan illalla, kun aurinko laski metsän taakse hiljaa.';
    const revised = 'Aino hiipi hiljaa ja arasti rantaan illalla, kun aurinko laski metsän taakse hiljaa.';
    const changes = diffHunks(original, revised).filter(h => h.kind === 'change');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ removed: 'käveli hitaasti ja varovasti', added: 'hiipi hiljaa ja arasti' });
  });
});

import { describe, expect, it } from 'vitest';
import { replaceMarkdown, searchMarkdown } from './search';

const opts = { caseSensitive: false, wholeWord: false };

describe('manuscript search', () => {
  it('finds text across emphasis markers with context', () => {
    const hits = searchMarkdown('Aino sanoi. Hän *sanoi* sen uudelleen.', 'hän sanoi', opts);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ match: 'Hän sanoi', before: 'Aino sanoi. ', after: ' sen uudelleen.' });
  });

  it('respects case and whole words', () => {
    expect(searchMarkdown('Aino ja Ainon', 'aino', opts)).toHaveLength(2);
    expect(searchMarkdown('Aino ja Ainon', 'aino', { ...opts, wholeWord: true })).toHaveLength(1);
    expect(searchMarkdown('Aino ja aino', 'aino', { ...opts, caseSensitive: true })).toHaveLength(1);
  });

  it('replaces plain hits and skips ones that would break emphasis', () => {
    const r = replaceMarkdown('Kalle tuli. *Kalle* lähti. Kal*le* nauroi.', 'Kalle', 'Ville', opts);
    expect(r.text).toBe('Ville tuli. *Ville* lähti. Kal*le* nauroi.');
    expect(r).toMatchObject({ replaced: 2, skipped: 1 });
  });

  it('treats regex characters literally', () => {
    expect(searchMarkdown('Mitä? (Ei.)', '(ei.)', opts)).toHaveLength(1);
  });
});

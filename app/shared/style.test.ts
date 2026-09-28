import { describe, expect, it } from 'vitest';
import { compareStyle, ownText, splitSentences, styleMetrics } from './style';

const AUTHOR = Array(6).fill([
  '– Tule jo, Aino sanoi. Hän seisoi ovella.',
  'Järvi oli tyyni. Kukaan ei puhunut. Ilma haisi savulta ja märältä sammaleelta.',
  '– Missä sinä olit? hän kysyi.',
  'Mökin portaat narisivat. Hän istui alimmalle askelmalle ja odotti.'
].join('\n\n')).join('\n\n');

describe('style metrics', () => {
  it('splits Finnish sentences including dialogue', () => {
    expect(splitSentences('– Tule jo, Aino sanoi. Hän seisoi ovella. ”Heti!” Kukaan ei vastannut.')).toEqual([
      '– Tule jo, Aino sanoi.',
      'Hän seisoi ovella.',
      '”Heti!”',
      'Kukaan ei vastannut.'
    ]);
  });

  it('describes rhythm, vocabulary and dialogue style', () => {
    const m = styleMetrics(AUTHOR);
    expect(m.sentences).toBe(48);
    expect(m.sentenceLength).toBeGreaterThan(3);
    expect(m.sentenceLength).toBeLessThan(7);
    expect(m.dialogueStyle).toBe('dash');
    expect(m.dialogueShare).toBeCloseTo(0.5);
    expect(m.lexicalDiversity).toBeGreaterThan(0);
  });

  it('flags suggestions that drift from the writer', () => {
    const profile = styleMetrics(AUTHOR);
    const original = 'Järvi oli tyyni. Kukaan ei puhunut. Ilma haisi savulta.';
    const revised =
      'Järvi lepäsi peilityynenä iltahämärän syleilyssä, ja kukaan heistä ei sanonut sanaakaan, sillä ilmassa leijui raskas savun ja kostean, sammaloituneen metsänpohjan tuoksu. ”Missä sinä olit?” hän kysyi hiljaa, katse kaukaisuuteen suunnattuna ja ääni värähtäen.';
    const ids = compareStyle(profile, original, revised).map(w => w.id);
    expect(ids).toContain('sentence-length');
    expect(ids).toContain('dialogue');
  });

  it('does not flag suggestions in the same voice', () => {
    const profile = styleMetrics(AUTHOR);
    expect(compareStyle(profile, 'Järvi oli tyyni. Kukaan ei puhunut.', 'Järvi oli tyyni. Kukaan ei sanonut mitään.')).toEqual([]);
  });

  it('keeps only the writer’s own text', () => {
    expect(ownText('Oma. AI:n lause. Oma taas.', [{ start: 5, end: 17 }])).toBe('Oma. Oma taas.');
  });
});

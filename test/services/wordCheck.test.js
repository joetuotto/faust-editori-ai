/**
 * @jest-environment node
 */
const { createWordCheck } = require('../../src/services/language/wordCheck');

// A stand-in for window.electronAPI: every Voikko method is an IPC invoke and returns a Promise
function fakeApi({ available = false, known = () => true, spell } = {}) {
  const api = {
    voikkoStatus: jest.fn(async () => ({ available, reason: available ? null : 'not-found' })),
    voikkoAnalyze: jest.fn(async ({ words }) => ({ success: true, results: words.map(word => ({ word, known: known(word) })) }))
  };
  if (spell) {
    api.spellProbe = jest.fn(spell.probe);
    api.spellCheckWords = jest.fn(spell.check);
  }
  return api;
}

describe('createWordCheck', () => {
  test('there is no checker before the status has been awaited', async () => {
    const api = fakeApi({ available: true });
    const check = createWordCheck(api);
    expect(check.current()).toBeUndefined();
    expect(check.source()).toBeNull();
    expect(api.voikkoStatus).not.toHaveBeenCalled();

    // Still none while the status is on its way
    const pending = check.refresh();
    expect(pending).toBeInstanceOf(Promise);
    expect(check.current()).toBeUndefined();
    expect(check.source()).toBeNull();

    expect(await pending).toBe('voikko');
    expect(typeof check.current()).toBe('function');
    expect(check.source()).toBe('voikko');
  });

  test('with Voikko available the checker asks voikkoAnalyze and maps each word to known', async () => {
    const api = fakeApi({ available: true, known: (word) => word !== 'Isäisän', spell: { probe: () => true, check: () => ({}) } });
    const check = createWordCheck(api);
    expect(await check.refresh()).toBe('voikko');

    const result = await check.current()(['Isoisän', 'Isäisän', 'äiti']);
    expect(result).toEqual({ Isoisän: true, Isäisän: false, äiti: true });
    expect(api.voikkoAnalyze).toHaveBeenCalledTimes(1);
    expect(api.voikkoAnalyze).toHaveBeenCalledWith({ words: ['Isoisän', 'Isäisän', 'äiti'] });
    // Voikko wins: the system checker is not even probed
    expect(api.spellProbe).not.toHaveBeenCalled();
    expect(api.spellCheckWords).not.toHaveBeenCalled();

    // An answer without success is a failure, not "every word unknown"
    api.voikkoAnalyze.mockResolvedValueOnce({ success: false, error: 'Voikko ei ole käytettävissä' });
    await expect(check.current()(['äiti'])).rejects.toThrow();
    api.voikkoAnalyze.mockResolvedValueOnce(undefined);
    await expect(check.current()(['äiti'])).rejects.toThrow();
  });

  test('without Voikko and with a passing spell probe the system checker is used', async () => {
    const api = fakeApi({ available: false, spell: { probe: async () => true, check: (words) => Object.fromEntries(words.map(word => [word, word.length < 6])) } });
    const check = createWordCheck(api);
    expect(await check.refresh()).toBe('system');
    expect(check.source()).toBe('system');
    expect(api.spellProbe).toHaveBeenCalledTimes(1);

    const answer = check.current()(['äiti', 'kisssaa']);
    expect(answer).toBeInstanceOf(Promise);
    expect(await answer).toEqual({ äiti: true, kisssaa: false });
    expect(api.spellCheckWords).toHaveBeenCalledWith(['äiti', 'kisssaa']);
    expect(api.voikkoAnalyze).not.toHaveBeenCalled();

    // A probe that answers at once (not a Promise) counts too
    const sync = createWordCheck(fakeApi({ spell: { probe: () => true, check: () => ({ a: true }) } }));
    expect(await sync.refresh()).toBe('system');
    expect(await sync.current()(['a'])).toEqual({ a: true });

    // A system checker that throws rejects instead of throwing at the caller
    const throwing = createWordCheck(fakeApi({ spell: { probe: () => true, check: () => { throw new Error('ei sanastoa'); } } }));
    await throwing.refresh();
    await expect(throwing.current()(['a'])).rejects.toThrow('ei sanastoa');
  });

  test('with neither there is no checker and the source is null', async () => {
    // No Voikko, no system checker in the API at all
    const bare = createWordCheck(fakeApi({ available: false }));
    expect(await bare.refresh()).toBeNull();
    expect(bare.current()).toBeUndefined();
    expect(bare.source()).toBeNull();

    // A system checker without a Finnish dictionary, and a probe that fails
    for (const probe of [() => false, async () => false, async () => undefined, async () => 'yes', async () => { throw new Error('ei oikolukua'); }]) {
      const check = createWordCheck(fakeApi({ available: false, spell: { probe, check: () => ({}) } }));
      expect(await check.refresh()).toBeNull();
      expect(check.current()).toBeUndefined();
      expect(check.source()).toBeNull();
    }

    // Only a status that says available: true counts
    for (const status of [{ available: 'true' }, { available: 1 }, {}, null, undefined]) {
      const api = fakeApi();
      api.voikkoStatus = jest.fn(async () => status);
      const check = createWordCheck(api);
      expect(await check.refresh()).toBeNull();
    }
  });

  test('a status call that rejects counts as not available', async () => {
    const api = fakeApi({ available: true });
    api.voikkoStatus = jest.fn(async () => {
      throw new Error('No handler registered for voikko:status');
    });
    const check = createWordCheck(api);
    await expect(check.refresh()).resolves.toBeNull();
    expect(check.current()).toBeUndefined();

    // With a working system checker the guard still has a word list
    const withSpell = fakeApi({ spell: { probe: () => true, check: () => ({}) } });
    withSpell.voikkoStatus = jest.fn(() => Promise.reject(new Error('ipc')));
    const second = createWordCheck(withSpell);
    await expect(second.refresh()).resolves.toBe('system');
  });

  test('two refresh calls share one status request', async () => {
    const api = fakeApi({ available: true });
    const check = createWordCheck(api);
    const first = check.refresh();
    const second = check.refresh();
    expect(second).toBe(first);
    expect(await Promise.all([first, second])).toEqual(['voikko', 'voikko']);
    expect(api.voikkoStatus).toHaveBeenCalledTimes(1);

    // A refresh after that asks again, and the answer may change (Voikko was removed)
    api.voikkoStatus.mockResolvedValueOnce({ available: false, reason: 'not-found' });
    expect(await check.refresh()).toBeNull();
    expect(api.voikkoStatus).toHaveBeenCalledTimes(2);
    expect(check.current()).toBeUndefined();

    // Options go through to the status call ("Tarkista uudelleen" forces a new detection)
    await check.refresh({ force: true });
    expect(api.voikkoStatus).toHaveBeenLastCalledWith({ force: true });
    expect(check.source()).toBe('voikko');
  });
});

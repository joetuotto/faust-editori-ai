/**
 * @jest-environment node
 */
const {
  KEY_NAMES,
  ROLE_NAMES,
  publicKeyStatus,
  applyKeyWrite,
  applyProviderPatch,
  readRoles,
  readModelSettings,
  mergePrefs
} = require('../../utils/appSettings');

const TEST_KEY = 'sk-test-000';
const MODEL = 'c91f:glm-5.3-flash';

// A config.json as an existing installation has it
const stored = () => ({
  AI_PROVIDER: 'cherry',
  CHERRY_GATEWAY_URL: 'http://127.0.0.1:23333',
  CHERRY_MODEL: MODEL,
  CHERRY_API_KEY: TEST_KEY,
  ANTHROPIC_MODEL: 'claude-test-model',
  AI_ROLE_MODELS: { edit: 'c91f:deepseek-fast' },
  AI_MODEL_SETTINGS: { [MODEL]: { window: 32000, headroom: 400 } }
});

describe('names', () => {
  test('the two key names and the three roles', () => {
    expect(KEY_NAMES).toEqual(['ANTHROPIC_API_KEY', 'CHERRY_API_KEY']);
    expect(ROLE_NAMES).toEqual(['prose', 'edit', 'analysis']);
  });
});

describe('publicKeyStatus', () => {
  test('publicKeyStatus returns two booleans and nothing else', () => {
    const status = publicKeyStatus({
      provider: 'cherry',
      gatewayUrl: 'http://127.0.0.1:23333',
      model: MODEL,
      cherryKey: TEST_KEY,
      anthropicKey: ''
    });

    expect(status).toEqual({ ANTHROPIC_API_KEY: false, CHERRY_API_KEY: true });
    expect(Object.keys(status).sort()).toEqual(['ANTHROPIC_API_KEY', 'CHERRY_API_KEY']);
    expect(JSON.stringify(status)).not.toContain(TEST_KEY);

    expect(publicKeyStatus({ cherryKey: '', anthropicKey: TEST_KEY })).toEqual({ ANTHROPIC_API_KEY: true, CHERRY_API_KEY: false });
    expect(publicKeyStatus({})).toEqual({ ANTHROPIC_API_KEY: false, CHERRY_API_KEY: false });
    expect(publicKeyStatus(undefined)).toEqual({ ANTHROPIC_API_KEY: false, CHERRY_API_KEY: false });
  });
});

describe('applyKeyWrite', () => {
  test('applyKeyWrite accepts only the two key names', () => {
    expect(applyKeyWrite({}, 'ANTHROPIC_API_KEY', TEST_KEY).ok).toBe(true);
    expect(applyKeyWrite({}, 'CHERRY_API_KEY', TEST_KEY).ok).toBe(true);

    for (const name of ['AI_PROVIDER', 'CHERRY_MODEL', 'cherry_api_key', '__proto__', '', undefined, null, 7]) {
      expect(applyKeyWrite({}, name, TEST_KEY)).toEqual({ ok: false, error: 'Tuntematon avaimen nimi.' });
    }
  });

  test('applyKeyWrite rejects a value that is not text', () => {
    for (const value of [undefined, null, true, 12, { key: TEST_KEY }, [TEST_KEY]]) {
      expect(applyKeyWrite({}, 'CHERRY_API_KEY', value)).toEqual({ ok: false, error: 'Avain ei ole tekstiä.' });
    }
  });

  test('applyKeyWrite trims the value, and an empty value deletes the key', () => {
    expect(applyKeyWrite({}, 'CHERRY_API_KEY', `  ${TEST_KEY}\n`).config).toEqual({ CHERRY_API_KEY: TEST_KEY });

    const emptied = applyKeyWrite(stored(), 'CHERRY_API_KEY', '');
    expect(emptied.ok).toBe(true);
    expect('CHERRY_API_KEY' in emptied.config).toBe(false);

    const blank = applyKeyWrite(stored(), 'CHERRY_API_KEY', '   ');
    expect('CHERRY_API_KEY' in blank.config).toBe(false);
  });

  test('applyKeyWrite changes one field and leaves the provider settings and the other key alone', () => {
    const before = { ...stored(), ANTHROPIC_API_KEY: 'sk-test-111' };
    const snapshot = JSON.parse(JSON.stringify(before));

    const result = applyKeyWrite(before, 'CHERRY_API_KEY', 'sk-test-222');

    expect(result.config).toEqual({ ...snapshot, CHERRY_API_KEY: 'sk-test-222' });
    expect(result.config).not.toBe(before);
    // The stored object is not changed
    expect(before).toEqual(snapshot);
  });

  test('applyKeyWrite never returns the value outside `config`', () => {
    const written = applyKeyWrite(stored(), 'ANTHROPIC_API_KEY', 'sk-test-333');
    expect(Object.keys(written).sort()).toEqual(['config', 'ok']);
    const { config, ...rest } = written;
    expect(config.ANTHROPIC_API_KEY).toBe('sk-test-333');
    expect(JSON.stringify(rest)).not.toContain('sk-test-333');

    // Neither does a refusal repeat what was sent
    const refused = applyKeyWrite(stored(), 'MUU_AVAIN', 'sk-test-333');
    expect(JSON.stringify(refused)).not.toContain('sk-test-333');
    const notText = applyKeyWrite(stored(), 'CHERRY_API_KEY', { secret: 'sk-test-333' });
    expect(JSON.stringify(notText)).not.toContain('sk-test-333');
  });

  test('applyKeyWrite starts from an empty config when none is stored', () => {
    expect(applyKeyWrite(undefined, 'CHERRY_API_KEY', TEST_KEY)).toEqual({ ok: true, config: { CHERRY_API_KEY: TEST_KEY } });
  });
});

describe('applyProviderPatch', () => {
  test('applyProviderPatch keeps the existing provider, gatewayUrl and model rules', () => {
    const patched = applyProviderPatch({}, { provider: 'cherry', gatewayUrl: '  http://localhost:23333  ', model: MODEL });
    expect(patched).toEqual({ AI_PROVIDER: 'cherry', CHERRY_GATEWAY_URL: 'http://localhost:23333', CHERRY_MODEL: MODEL });

    expect(applyProviderPatch(stored(), { provider: 'anthropic' }).AI_PROVIDER).toBe('anthropic');
    // An unknown provider, an empty address and a model that is not text change nothing
    expect(applyProviderPatch(stored(), { provider: 'openai', gatewayUrl: '   ', model: 12 })).toEqual(stored());
    // An empty model is stored: it clears the selection, as before
    expect(applyProviderPatch(stored(), { model: '' }).CHERRY_MODEL).toBe('');
    // No patch at all
    expect(applyProviderPatch(stored(), undefined)).toEqual(stored());
    expect(applyProviderPatch(stored())).toEqual(stored());
  });

  test('applyProviderPatch never writes a key', () => {
    const patched = applyProviderPatch(stored(), { CHERRY_API_KEY: 'sk-test-999', cherryKey: 'sk-test-999', ANTHROPIC_API_KEY: 'sk-test-999' });
    expect(patched.CHERRY_API_KEY).toBe(TEST_KEY);
    expect('ANTHROPIC_API_KEY' in patched).toBe(false);
    expect(JSON.stringify(patched)).not.toContain('sk-test-999');
  });

  test('applyProviderPatch stores the Claude model id trimmed and ignores one that is too long', () => {
    expect(applyProviderPatch({}, { anthropicModel: '  claude-new-model ' }).ANTHROPIC_MODEL).toBe('claude-new-model');
    expect(applyProviderPatch(stored(), { anthropicModel: '' }).ANTHROPIC_MODEL).toBe('');
    expect(applyProviderPatch(stored(), { anthropicModel: 'm'.repeat(201) }).ANTHROPIC_MODEL).toBe('claude-test-model');
    expect(applyProviderPatch(stored(), { anthropicModel: 7 }).ANTHROPIC_MODEL).toBe('claude-test-model');
  });

  test('applyProviderPatch sets and clears a role and ignores an unknown role', () => {
    const set = applyProviderPatch(stored(), { roles: { prose: 'c91f:glm-5.3', translation: 'c91f:muu' } });
    expect(set.AI_ROLE_MODELS).toEqual({ prose: 'c91f:glm-5.3', edit: 'c91f:deepseek-fast' });

    const cleared = applyProviderPatch(set, { roles: { edit: '' } });
    expect(cleared.AI_ROLE_MODELS).toEqual({ prose: 'c91f:glm-5.3' });
    expect(readRoles(cleared)).toEqual({ prose: 'c91f:glm-5.3', edit: '', analysis: '' });

    // A role that is not text is left as it was
    expect(applyProviderPatch(stored(), { roles: { edit: null, analysis: 5 } }).AI_ROLE_MODELS).toEqual({ edit: 'c91f:deepseek-fast' });
    // Without a roles field the stored roles stay
    expect(applyProviderPatch(stored(), { provider: 'cherry' }).AI_ROLE_MODELS).toEqual({ edit: 'c91f:deepseek-fast' });
  });

  test('applyProviderPatch merges model settings per model and deletes a model with null', () => {
    const merged = applyProviderPatch(stored(), {
      modelSettings: {
        [MODEL]: { systemAsUser: true },
        'c91f:toinen': { window: 8192, headroom: 2000 }
      }
    });
    expect(merged.AI_MODEL_SETTINGS).toEqual({
      [MODEL]: { window: 32000, headroom: 400, systemAsUser: true },
      'c91f:toinen': { window: 8192, headroom: 2000 }
    });

    const removed = applyProviderPatch(merged, { modelSettings: { [MODEL]: null } });
    expect(removed.AI_MODEL_SETTINGS).toEqual({ 'c91f:toinen': { window: 8192, headroom: 2000 } });

    // A field set to null goes back to the default; the others stay
    const reset = applyProviderPatch(merged, { modelSettings: { [MODEL]: { headroom: null } } });
    expect(reset.AI_MODEL_SETTINGS[MODEL]).toEqual({ window: 32000, systemAsUser: true });

    // A model whose last field was removed leaves no empty entry behind
    const emptied = applyProviderPatch(merged, { modelSettings: { 'c91f:toinen': { window: null, headroom: null } } });
    expect('c91f:toinen' in emptied.AI_MODEL_SETTINGS).toBe(false);
  });

  test('applyProviderPatch ignores a window below 1024, a negative headroom and a non-boolean systemAsUser', () => {
    const patched = applyProviderPatch(stored(), {
      modelSettings: {
        [MODEL]: { window: 1023, headroom: -1, systemAsUser: 'true' },
        'c91f:uusi': { window: 2000001, headroom: 64001, systemAsUser: 1, extra: 'x' },
        'c91f:murto': { window: 4096.5, headroom: '400' }
      }
    });

    expect(patched.AI_MODEL_SETTINGS).toEqual({ [MODEL]: { window: 32000, headroom: 400 } });

    // The limits themselves are valid
    const limits = applyProviderPatch({}, {
      modelSettings: { a: { window: 1024, headroom: 0, systemAsUser: false }, b: { window: 2000000, headroom: 64000 } }
    });
    expect(limits.AI_MODEL_SETTINGS).toEqual({
      a: { window: 1024, headroom: 0, systemAsUser: false },
      b: { window: 2000000, headroom: 64000 }
    });

    // A model id that is empty, too long or would reach the prototype is skipped
    const odd = applyProviderPatch({}, JSON.parse(`{"modelSettings": {"": {"window": 4096}, "${'m'.repeat(201)}": {"window": 4096}, "__proto__": {"window": 4096}}}`));
    expect(odd.AI_MODEL_SETTINGS).toEqual({});
    expect({}.window).toBeUndefined();
  });

  test('applyProviderPatch does not mutate its input', () => {
    const before = stored();
    const snapshot = JSON.parse(JSON.stringify(before));
    const patch = {
      provider: 'anthropic',
      anthropicModel: 'claude-new-model',
      roles: { prose: 'c91f:glm-5.3', edit: '' },
      modelSettings: { [MODEL]: { window: 16000, headroom: null }, 'c91f:toinen': { systemAsUser: true } }
    };
    const patchSnapshot = JSON.parse(JSON.stringify(patch));

    const patched = applyProviderPatch(before, patch);

    expect(before).toEqual(snapshot);
    expect(patch).toEqual(patchSnapshot);
    expect(patched).not.toBe(before);
    expect(patched.AI_ROLE_MODELS).not.toBe(before.AI_ROLE_MODELS);
    expect(patched.AI_MODEL_SETTINGS).not.toBe(before.AI_MODEL_SETTINGS);
    expect(patched.AI_MODEL_SETTINGS[MODEL]).not.toBe(before.AI_MODEL_SETTINGS[MODEL]);
    expect(patched.AI_MODEL_SETTINGS[MODEL]).toEqual({ window: 16000 });
  });
});

describe('readRoles and readModelSettings', () => {
  test('readRoles gives every role as a string', () => {
    expect(readRoles(stored())).toEqual({ prose: '', edit: 'c91f:deepseek-fast', analysis: '' });
    expect(readRoles({})).toEqual({ prose: '', edit: '', analysis: '' });
    expect(readRoles(undefined)).toEqual({ prose: '', edit: '', analysis: '' });
    expect(readRoles({ AI_ROLE_MODELS: { prose: 5, edit: null, translation: 'x' } })).toEqual({ prose: '', edit: '', analysis: '' });
  });

  test('readModelSettings returns a copy, or an empty object', () => {
    const config = stored();
    const settings = readModelSettings(config);
    expect(settings).toEqual({ [MODEL]: { window: 32000, headroom: 400 } });

    settings[MODEL].window = 1;
    settings.uusi = {};
    expect(config.AI_MODEL_SETTINGS).toEqual({ [MODEL]: { window: 32000, headroom: 400 } });

    expect(readModelSettings({})).toEqual({});
    expect(readModelSettings(undefined)).toEqual({});
    expect(readModelSettings({ AI_MODEL_SETTINGS: 'rikki' })).toEqual({});
  });
});

describe('mergePrefs', () => {
  test('mergePrefs merges shallowly and deletes with null', () => {
    const prev = { spellCheck: true, aiOff: false, quickEdit: { otherModel: null, length: 'paragraph' }, 'typo.smartTyping': true };
    const snapshot = JSON.parse(JSON.stringify(prev));

    const merged = mergePrefs(prev, { aiOff: true, quickEdit: { length: 'long' }, 'typo.smartTyping': null, spellCheck: undefined });

    expect(merged).toEqual({ ok: true, prefs: { aiOff: true, quickEdit: { length: 'long' } } });
    // Shallow: the new object replaced the old one, it was not merged into it
    expect('otherModel' in merged.prefs.quickEdit).toBe(false);
    expect(prev).toEqual(snapshot);
    expect(merged.prefs).not.toBe(prev);

    expect(mergePrefs(undefined, { aiOff: true })).toEqual({ ok: true, prefs: { aiOff: true } });
    expect(mergePrefs({ a: 1 }, {})).toEqual({ ok: true, prefs: { a: 1 } });
    // false, 0 and '' are values, not deletions
    expect(mergePrefs({}, { aiOff: false, count: 0, name: '' }).prefs).toEqual({ aiOff: false, count: 0, name: '' });
  });

  test('mergePrefs rejects a bad key name, a non-object patch and an oversize result', () => {
    const invalid = { ok: false, error: 'Virheellinen asetus.' };

    for (const key of ['1alku', '_alku', 'väli lyönti', 'ääkkönen', 'a'.repeat(65), '', 'a/b']) {
      expect(mergePrefs({}, { [key]: 1 })).toEqual(invalid);
    }
    expect(mergePrefs({}, JSON.parse('{"__proto__": {"aiOff": true}}'))).toEqual(invalid);
    expect(mergePrefs({}, { ['a'.repeat(64)]: 1 }).ok).toBe(true);
    expect(mergePrefs({}, { 'context.exclude': {}, 'panel-sizes_2': 1 }).ok).toBe(true);

    for (const patch of [undefined, null, 'aiOff', 5, ['aiOff'], true]) {
      expect(mergePrefs({ a: 1 }, patch)).toEqual(invalid);
    }

    // One bad key refuses the whole patch
    expect(mergePrefs({ a: 1 }, { b: 2, '2c': 3 })).toEqual(invalid);

    const big = mergePrefs({}, { savedPrompts: 'x'.repeat(512 * 1024) });
    expect(big).toEqual({ ok: false, error: 'Asetukset ovat liian suuret tallennettaviksi.' });
    expect(mergePrefs({}, { savedPrompts: 'x'.repeat(512 * 1024 - 100) }).ok).toBe(true);
  });

  test('mergePrefs rejects a value that cannot be written to the file', () => {
    const loop = {};
    loop.self = loop;
    expect(mergePrefs({}, { loop })).toEqual({ ok: false, error: 'Virheellinen asetus.' });
  });

  test('mergePrefs keeps Finnish text in a saved prompt unchanged (`Tiivistä – älä muuta ”sitaatteja”`)', () => {
    const prompt = 'Tiivistä – älä muuta ”sitaatteja”';
    const savedPrompts = [
      { id: 'p1', label: 'Tiivistä', prompt, created: '2026-11-16T19:02:11.000Z' },
      { id: 'p2', label: 'Vuorosanat', prompt: '– Älä koske tähän: [TODO: tarkista] <u>Åke</u>\r\nÖljyä', created: '2026-11-16T19:03:00.000Z' }
    ];

    const merged = mergePrefs({ aiOff: false }, { savedPrompts });

    expect(merged.ok).toBe(true);
    expect(merged.prefs.savedPrompts[0].prompt).toBe(prompt);
    expect(merged.prefs.savedPrompts[1].prompt).toBe('– Älä koske tähän: [TODO: tarkista] <u>Åke</u>\r\nÖljyä');
    // And the same after the trip through the file
    expect(JSON.parse(JSON.stringify(merged.prefs)).savedPrompts).toEqual(savedPrompts);
  });
});

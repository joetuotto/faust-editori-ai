/**
 * @jest-environment node
 */
const { createSettingsStore, getSettingsStore } = require('../../src/services/settingsStore');

/**
 * Stand-in for the preload bridge and the main process behind it: it keeps
 * the "file", applies one-key patches the way main does (null deletes) and
 * can hold a write until the test lets it finish.
 */
function fakeBridge(initial = {}) {
  let file = { ...initial };
  let changed = null;
  const held = [];

  const applyPatch = (patch) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) delete file[key];
      else file[key] = value;
    }
  };

  const bridge = {
    hold: false,          // true: prefsSet waits for release()
    fail: false,          // true: prefsSet answers { success: false }
    patches: [],
    prefsGet: jest.fn(async () => ({ success: true, prefs: { ...file } })),
    prefsSet: jest.fn((patch) => {
      bridge.patches.push(patch);
      const answer = () => {
        if (bridge.fail) return { success: false, error: 'Virheellinen asetus.' };
        applyPatch(patch);
        return { success: true, prefs: { ...file } };
      };
      if (!bridge.hold) return Promise.resolve().then(answer);
      return new Promise((resolve) => held.push(() => resolve(answer())));
    }),
    onPrefsChanged: jest.fn((callback) => {
      changed = callback;
    }),
    // Let the oldest held write finish
    release() {
      const next = held.shift();
      if (next) next();
    },
    heldCount: () => held.length,
    // The main process tells the renderer that the file changed
    broadcast(next) {
      if (next) file = { ...next };
      if (changed) changed({ ...file });
    },
    file: () => ({ ...file })
  };
  return bridge;
}

// One turn of the event loop: every promise that is ready has run
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createSettingsStore', () => {
  let warn;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test('get returns the fallback before load and the stored value after', async () => {
    const bridge = fakeBridge({ aiOff: true, 'typo.smartTyping': false, panelSizes: { inspector: 320 } });
    const store = createSettingsStore(bridge);

    expect(store.isLoaded()).toBe(false);
    expect(store.get('aiOff', false)).toBe(false);
    expect(store.get('typo.smartTyping', true)).toBe(true);
    expect(store.all()).toEqual({});

    const loadedPrefs = await store.load();

    expect(store.isLoaded()).toBe(true);
    expect(store.get('aiOff', false)).toBe(true);
    expect(store.get('typo.smartTyping', true)).toBe(false);
    expect(store.get('panelSizes')).toEqual({ inspector: 320 });
    // A key the file does not have still gives the fallback
    expect(store.get('savedPrompts', [])).toEqual([]);
    expect(store.get('puuttuu')).toBeUndefined();
    expect(loadedPrefs).toEqual({ aiOff: true, 'typo.smartTyping': false, panelSizes: { inspector: 320 } });
    // A stored false is a value, not a missing key
    expect(store.get('typo.smartTyping', 'oletus')).toBe(false);
  });

  test('load is idempotent and calls the bridge once', async () => {
    const bridge = fakeBridge({ aiOff: false });
    const store = createSettingsStore(bridge);

    const first = store.load();
    const second = store.load();
    expect(second).toBe(first);
    await first;
    const third = store.load();
    expect(third).toBe(first);
    await third;

    expect(bridge.prefsGet).toHaveBeenCalledTimes(1);
    expect(bridge.onPrefsChanged).toHaveBeenCalledTimes(1);
  });

  test('a failed first load leaves an empty cache and still counts as loaded', async () => {
    const throwing = fakeBridge({ aiOff: true });
    throwing.prefsGet = jest.fn(async () => {
      throw new Error('ipc rikki');
    });
    const store = createSettingsStore(throwing);
    await expect(store.load()).resolves.toEqual({});
    expect(store.isLoaded()).toBe(true);
    expect(store.get('aiOff', false)).toBe(false);
    // Changes made elsewhere are still followed
    expect(throwing.onPrefsChanged).toHaveBeenCalledTimes(1);

    const refusing = fakeBridge();
    refusing.prefsGet = jest.fn(async () => ({ success: false, error: 'ei onnistu' }));
    const second = createSettingsStore(refusing);
    await second.load();
    expect(second.isLoaded()).toBe(true);
    expect(second.all()).toEqual({});
  });

  test('load tells the subscribers that the values are there', async () => {
    const store = createSettingsStore(fakeBridge({ aiOff: true }));
    const seen = [];
    store.subscribe((key) => seen.push([key, store.get('aiOff', false)]));

    await store.load();
    expect(seen).toEqual([[null, true]]);
  });

  test('set updates the cache and notifies subscribers before the write finishes', async () => {
    const bridge = fakeBridge({ aiOff: false });
    bridge.hold = true;
    const store = createSettingsStore(bridge);
    await store.load();
    const seen = [];
    store.subscribe((key) => seen.push([key, store.get('aiOff')]));

    let settled = false;
    const write = store.set('aiOff', true).then((ok) => {
      settled = true;
      return ok;
    });

    // Synchronously: the cache and the listener, while the write has not even been answered
    expect(store.get('aiOff')).toBe(true);
    expect(seen).toEqual([['aiOff', true]]);
    await flush();
    expect(settled).toBe(false);
    expect(bridge.prefsSet).toHaveBeenCalledWith({ aiOff: true });
    expect(bridge.file().aiOff).toBe(false);

    bridge.release();
    await expect(write).resolves.toBe(true);
    expect(bridge.file().aiOff).toBe(true);
  });

  test('set(null) deletes the key', async () => {
    const bridge = fakeBridge({ savedPrompts: [{ id: 'p1' }], aiOff: true });
    const store = createSettingsStore(bridge);
    await store.load();

    await expect(store.set('savedPrompts', null)).resolves.toBe(true);
    expect(store.get('savedPrompts', 'oletus')).toBe('oletus');
    expect('savedPrompts' in store.all()).toBe(false);
    expect(bridge.patches).toEqual([{ savedPrompts: null }]);
    expect(bridge.file()).toEqual({ aiOff: true });

    // undefined deletes too, and travels as null: an undefined field may be lost on the way to main
    await store.set('aiOff', undefined);
    expect('aiOff' in store.all()).toBe(false);
    expect(bridge.patches[1]).toEqual({ aiOff: null });
    expect(bridge.file()).toEqual({});
  });

  test('writes are sent in call order', async () => {
    const bridge = fakeBridge();
    bridge.hold = true;
    const store = createSettingsStore(bridge);
    await store.load();

    const writes = [
      store.set('quickEdit', { length: 'sentence' }),
      store.set('aiOff', true),
      store.set('quickEdit', { length: 'long' }),
      store.set('aiOff', null)
    ];
    // The cache already holds the last value of each key
    expect(store.all()).toEqual({ quickEdit: { length: 'long' } });

    // Each write goes out only after the one before it was answered
    for (let sent = 1; sent <= 4; sent += 1) {
      await flush();
      expect(bridge.patches).toHaveLength(sent);
      bridge.release();
    }
    await expect(Promise.all(writes)).resolves.toEqual([true, true, true, true]);

    expect(bridge.patches).toEqual([
      { quickEdit: { length: 'sentence' } },
      { aiOff: true },
      { quickEdit: { length: 'long' } },
      { aiOff: null }
    ]);
    expect(bridge.file()).toEqual({ quickEdit: { length: 'long' } });
  });

  test('a failed write resolves false and keeps the cached value', async () => {
    const bridge = fakeBridge({ aiOff: false });
    const store = createSettingsStore(bridge);
    await store.load();

    bridge.fail = true;
    await expect(store.set('savedPrompts', [{ id: 'p1', prompt: 'salainen kehote' }])).resolves.toBe(false);
    expect(store.get('savedPrompts')).toEqual([{ id: 'p1', prompt: 'salainen kehote' }]);
    expect(bridge.file()).toEqual({ aiOff: false });

    // The warning names the key and never the value
    expect(warn).toHaveBeenCalledTimes(1);
    const printed = JSON.stringify(warn.mock.calls);
    expect(printed).toContain('savedPrompts');
    expect(printed).not.toContain('salainen kehote');

    // A bridge that throws is a failed write too, and later writes still go through
    bridge.fail = false;
    bridge.prefsSet.mockImplementationOnce(() => Promise.reject(new Error('ipc rikki')));
    await expect(store.set('aiOff', true)).resolves.toBe(false);
    expect(store.get('aiOff')).toBe(true);
    await expect(store.set('aiOff', false)).resolves.toBe(true);
    expect(bridge.file().aiOff).toBe(false);
  });

  test('an external change replaces the cache and notifies with null', async () => {
    const bridge = fakeBridge({ aiOff: false, spellCheck: true, panelSizes: { inspector: 300 } });
    const store = createSettingsStore(bridge);
    await store.load();
    const seen = [];
    store.subscribe((key) => seen.push(key));

    // The menu switched "Tekoäly pois" on and something removed panelSizes
    bridge.broadcast({ aiOff: true, spellCheck: true });

    expect(seen).toEqual([null]);
    expect(store.all()).toEqual({ aiOff: true, spellCheck: true });
    expect(store.get('panelSizes', 'poissa')).toBe('poissa');
  });

  test('the echo of an own write does not notify again, and does not take a newer local value back', async () => {
    const bridge = fakeBridge({ count: 0 });
    bridge.hold = true;
    const store = createSettingsStore(bridge);
    await store.load();
    const seen = [];
    store.subscribe((key) => seen.push(key));

    const first = store.set('count', 1);
    const second = store.set('count', 2);
    await flush();

    // Main answers the first write and broadcasts the file as it then is: count 1
    bridge.release();
    await first;
    bridge.broadcast();
    expect(store.get('count')).toBe(2);

    await flush();
    bridge.release();
    await second;
    bridge.broadcast();
    expect(store.get('count')).toBe(2);
    expect(bridge.file()).toEqual({ count: 2 });

    // Only the two local changes were announced
    expect(seen).toEqual(['count', 'count']);
  });

  test('unsubscribe stops notifications', async () => {
    const bridge = fakeBridge();
    const store = createSettingsStore(bridge);
    await store.load();
    const first = [];
    const second = [];
    const stopFirst = store.subscribe((key) => first.push(key));
    store.subscribe((key) => second.push(key));

    await store.set('a', 1);
    stopFirst();
    await store.set('b', 2);
    bridge.broadcast({ a: 5 });
    // Calling it again is harmless
    expect(() => stopFirst()).not.toThrow();

    expect(first).toEqual(['a']);
    expect(second).toEqual(['a', 'b', null]);
  });

  test('a listener that throws does not stop the others or the write', async () => {
    const bridge = fakeBridge();
    const store = createSettingsStore(bridge);
    await store.load();
    const seen = [];
    store.subscribe(() => {
      throw new Error('komponentti rikki');
    });
    store.subscribe((key) => seen.push(key));

    await expect(store.set('a', 1)).resolves.toBe(true);
    expect(seen).toEqual(['a']);
    expect(bridge.file()).toEqual({ a: 1 });
  });

  test('update changes the stored value with a function', async () => {
    const bridge = fakeBridge({ aiCalibration: { 'c91f:glm': { charsPerToken: 2.7, samples: 3 } } });
    const store = createSettingsStore(bridge);
    await store.load();

    await expect(store.update('aiCalibration', (all) => ({ ...all, 'c91f:ds': { charsPerToken: 2.8, samples: 1 } }), {})).resolves.toBe(true);
    expect(bridge.file().aiCalibration).toEqual({
      'c91f:glm': { charsPerToken: 2.7, samples: 3 },
      'c91f:ds': { charsPerToken: 2.8, samples: 1 }
    });

    // The fallback is what the function gets for a key that is not stored
    await store.update('counter', (value) => value + 1, 10);
    expect(store.get('counter')).toBe(11);
  });

  test('update before the first load waits for it, so that the stored value is not overwritten by the fallback', async () => {
    const bridge = fakeBridge({ list: ['a', 'b'] });
    const store = createSettingsStore(bridge);

    const done = store.update('list', (list) => [...list, 'c'], []);
    expect(bridge.prefsSet).not.toHaveBeenCalled();
    await expect(done).resolves.toBe(true);

    expect(bridge.prefsGet).toHaveBeenCalledTimes(1);
    expect(bridge.file().list).toEqual(['a', 'b', 'c']);
  });

  test('a value set before the load survives it', async () => {
    const bridge = fakeBridge({ aiOff: false, other: 1 });
    bridge.hold = true;
    const store = createSettingsStore(bridge);

    const write = store.set('aiOff', true);
    // Not loaded yet: reads still answer with the fallback
    expect(store.get('aiOff', 'oletus')).toBe('oletus');

    await store.load();
    expect(store.get('aiOff')).toBe(true);
    expect(store.get('other')).toBe(1);

    await flush();
    bridge.release();
    await expect(write).resolves.toBe(true);
    expect(bridge.file()).toEqual({ aiOff: true, other: 1 });
  });

  test('a load answer read before a finished write does not take the written value back', async () => {
    const bridge = fakeBridge({ 'typo.smartTyping': true });
    // prefs:get reads the file before the write and answers only after it was confirmed
    let answerLoad = null;
    bridge.prefsGet = jest.fn(() => {
      const snapshot = bridge.file();
      return new Promise((resolve) => {
        answerLoad = () => resolve({ success: true, prefs: snapshot });
      });
    });
    const store = createSettingsStore(bridge);

    const loading = store.load();
    await flush();
    await expect(store.set('typo.smartTyping', false)).resolves.toBe(true);
    expect(bridge.file()).toEqual({ 'typo.smartTyping': false });

    answerLoad();
    await loading;
    expect(store.get('typo.smartTyping', 'oletus')).toBe(false);

    // After the load an external change is taken as it is
    bridge.broadcast({ 'typo.smartTyping': true });
    expect(store.get('typo.smartTyping')).toBe(true);
  });

  test('works in memory without a bridge', async () => {
    for (const bridge of [null, undefined, {}, { prefsGet: () => ({}) }]) {
      const store = createSettingsStore(bridge);
      const seen = [];
      store.subscribe((key) => seen.push(key));

      // Nothing to wait for: the store is usable at once
      expect(store.isLoaded()).toBe(true);
      expect(store.get('aiOff', false)).toBe(false);

      await expect(store.set('aiOff', true)).resolves.toBe(true);
      expect(store.get('aiOff', false)).toBe(true);
      await expect(store.update('count', (value) => value + 1, 0)).resolves.toBe(true);
      await store.set('aiOff', null);
      await expect(store.load()).resolves.toEqual({ count: 1 });

      expect(store.all()).toEqual({ count: 1 });
      expect(seen).toEqual(['aiOff', 'count', 'aiOff']);
    }
  });

  test('all returns a copy', async () => {
    const store = createSettingsStore(null);
    await store.set('a', 1);
    const copy = store.all();
    copy.a = 2;
    copy.b = 3;
    expect(store.all()).toEqual({ a: 1 });
  });

  test('stores a saved prompt with Finnish characters unchanged', async () => {
    const prompt = 'Tiivistä – älä muuta ”sitaatteja”.\n– Älä koske vuorosanoihin, [TODO: tarkista] tai <u>Åken</u> nimeen.\r\nÖljyä 😀';
    const savedPrompts = [{ id: 'p1', label: 'Tiivistä (älä muuta sitaatteja)', prompt, created: '2026-11-16T19:02:11.000Z' }];
    const bridge = fakeBridge();
    const store = createSettingsStore(bridge);
    await store.load();

    await expect(store.set('savedPrompts', savedPrompts)).resolves.toBe(true);

    expect(store.get('savedPrompts')[0].prompt).toBe(prompt);
    expect(bridge.patches[0].savedPrompts[0].prompt).toBe(prompt);
    expect(bridge.file().savedPrompts).toEqual(savedPrompts);

    // And it comes back the same from the file in a new session
    const next = createSettingsStore(fakeBridge(JSON.parse(JSON.stringify(bridge.file()))));
    await next.load();
    expect(next.get('savedPrompts')[0].prompt).toBe(prompt);
    expect(next.get('savedPrompts')[0].prompt.length).toBe(prompt.length);
  });
});

describe('getSettingsStore', () => {
  test('returns one store, also where there is no window', () => {
    expect(typeof window).toBe('undefined');
    const store = getSettingsStore();
    expect(getSettingsStore()).toBe(store);
    expect(typeof store.load).toBe('function');
    expect(typeof store.get).toBe('function');
    expect(typeof store.set).toBe('function');
    expect(typeof store.update).toBe('function');
    expect(typeof store.subscribe).toBe('function');
    expect(typeof store.all).toBe('function');
    expect(typeof store.isLoaded).toBe('function');
  });

  test('is built over window.electronAPI when there is one', async () => {
    const bridge = fakeBridge({ aiOff: true });
    global.window = { electronAPI: bridge };
    try {
      let store;
      jest.isolateModules(() => {
        store = require('../../src/services/settingsStore').getSettingsStore();
      });
      await store.load();
      expect(bridge.prefsGet).toHaveBeenCalledTimes(1);
      expect(store.get('aiOff', false)).toBe(true);
    } finally {
      delete global.window;
    }
  });
});

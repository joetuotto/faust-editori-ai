/**
 * Settings store (renderer)
 *
 * The renderer's view of ui-prefs.json. The main process owns the file; this
 * store loads it once through the preload bridge, answers reads from memory,
 * sends each change back as a one-key patch and follows changes made
 * elsewhere (the menu, another component). Without a bridge it works in
 * memory only, which is what the tests and a plain browser get.
 *
 * No DOM at load: `window` is touched only inside getSettingsStore().
 * Unit-tested in test/services/settingsStore.test.js.
 */

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * @param bridge { prefsGet(), prefsSet(patch), onPrefsChanged(callback) } or null
 */
function createSettingsStore(bridge) {
  const api = bridge && typeof bridge.prefsGet === 'function' && typeof bridge.prefsSet === 'function' ? bridge : null;

  let cache = {};
  let loaded = !api;            // nothing to wait for without a file
  let loadPromise = null;
  let writes = Promise.resolve();
  const unsent = [];            // local changes the file does not have yet, oldest first
  // Writes confirmed while the first load is under way: its answer may have
  // been read before them, so they are laid over it as well
  let loading = false;
  const confirmedDuringLoad = [];
  const listeners = new Set();

  function notify(key) {
    for (const listener of Array.from(listeners)) {
      try {
        listener(key);
      } catch (error) {
        console.warn('[Asetukset] Kuuntelija epäonnistui:', error && error.message);
      }
    }
  }

  function apply(target, key, value) {
    if (value === null || value === undefined) delete target[key];
    else target[key] = value;
  }

  // What the file holds, with the local changes that are still on their way
  // laid over it: an echo of an older write must not take a newer value back
  function adopt(prefs, older = []) {
    const next = { ...(isPlainObject(prefs) ? prefs : {}) };
    for (const change of older) apply(next, change.key, change.value);
    for (const change of unsent) apply(next, change.key, change.value);
    cache = next;
  }

  function onExternalChange(prefs) {
    const before = JSON.stringify(cache);
    adopt(prefs);
    loaded = true;
    // The echo of this store's own write changes nothing and needs no render
    if (JSON.stringify(cache) !== before) notify(null);
  }

  /** Load the file once. Later calls return the same promise. */
  function load() {
    if (loadPromise) return loadPromise;
    if (!api) {
      loadPromise = Promise.resolve({ ...cache });
      return loadPromise;
    }

    loading = true;
    loadPromise = Promise.resolve()
      .then(() => api.prefsGet())
      .then((result) => {
        if (result && result.success !== false && isPlainObject(result.prefs)) adopt(result.prefs, confirmedDuringLoad);
      })
      .catch((error) => {
        // A failed first load leaves an empty cache and still counts as loaded
        console.warn('[Asetukset] Asetusten lataus epäonnistui:', error && error.message);
      })
      .then(() => {
        loading = false;
        confirmedDuringLoad.length = 0;
        loaded = true;
        if (typeof api.onPrefsChanged === 'function') {
          try {
            api.onPrefsChanged(onExternalChange);
          } catch (error) {
            console.warn('[Asetukset] Muutosten seuranta epäonnistui:', error && error.message);
          }
        }
        notify(null);
        return { ...cache };
      });
    return loadPromise;
  }

  const isLoaded = () => loaded;

  /** The stored value; `fallback` when the key is absent or the file is not loaded yet. */
  function get(key, fallback) {
    if (!loaded || !own(cache, key)) return fallback;
    return cache[key];
  }

  /**
   * Change one key. The cache and the subscribers are updated at once; the
   * promise tells whether the write reached the file. null or undefined
   * deletes the key.
   */
  function set(key, value) {
    apply(cache, key, value);
    notify(key);
    if (!api) return Promise.resolve(true);

    const change = { key, value };
    unsent.push(change);
    const patch = { [key]: value === undefined ? null : value };

    // One chain, so that writes reach the main process in call order
    const result = writes
      .then(() => api.prefsSet(patch))
      .then((answer) => !(answer && answer.success === false), () => false)
      .then((ok) => {
        const index = unsent.indexOf(change);
        if (index !== -1) unsent.splice(index, 1);
        if (ok && loading) confirmedDuringLoad.push(change);
        // The value itself is never written to the console
        if (!ok) console.warn(`[Asetukset] Asetuksen "${key}" tallennus epäonnistui.`);
        return ok;
      });
    writes = result;
    return result;
  }

  /** set(key, fn(current)). Waits for the first load, so that fn sees the stored value. */
  function update(key, fn, fallback) {
    if (loaded) return set(key, fn(get(key, fallback)));
    return load().then(() => set(key, fn(get(key, fallback))));
  }

  /** listener(key) after a local change, listener(null) when the whole cache was replaced. */
  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  const all = () => ({ ...cache });

  return { load, isLoaded, get, set, update, subscribe, all };
}

let singleton = null;

/** The one store of the app, over window.electronAPI. */
function getSettingsStore() {
  if (!singleton) {
    const bridge = typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : null;
    singleton = createSettingsStore(bridge);
  }
  return singleton;
}

module.exports = { createSettingsStore, getSettingsStore };

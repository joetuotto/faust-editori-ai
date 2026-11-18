/**
 * src/components/useSetting.js - one setting of ui-prefs.json as React state.
 *
 *   const [value, setValue, loaded] = useSetting('aiOff', false);
 *
 * The value comes from the app's one settings store (src/services/settingsStore.js), which the
 * main process owns: the fallback until the file has loaded or while the key is absent. setValue
 * writes the key (a function receives the current value). The component renders again when the
 * key changes here, in another component or from the menu (prefs:changed). `loaded` tells the
 * stored value from the fallback: "Tekoäly pois" is not known until then.
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */
import { getSettingsStore } from '../services/settingsStore.js';

const { useEffect, useRef, useState, useCallback } = React;

export function useSetting(key, fallback) {
  const store = getSettingsStore();
  const [, setTick] = useState(0);
  const value = store.get(key, fallback);
  const loaded = store.isLoaded();

  // What this render showed: a change that lands between the render and the subscription below
  // (another component's load finishing) is caught when the effect compares
  const shownRef = useRef({ value, loaded });
  shownRef.current = { value, loaded };

  useEffect(() => {
    const rerender = () => setTick(tick => tick + 1);
    const stop = store.subscribe((changed) => {
      if (changed === null || changed === key) rerender();
    });
    const shown = shownRef.current;
    if (store.isLoaded() !== shown.loaded || store.get(key, fallback) !== shown.value) rerender();
    store.load();
    return stop;
  }, [key]);

  const setValue = useCallback((next) => {
    const current = store.get(key, fallback);
    return store.set(key, typeof next === 'function' ? next(current) : next);
  }, [key]);

  return [value, setValue, loaded];
}

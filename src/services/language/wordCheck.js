/**
 * The word list behind Kielenhuolto's suspect-word guard
 *
 * A model sometimes turns a correct word into a typo of its own. The guard
 * asks whether the words of a one-word change are known: from Voikko when it
 * is installed, else from the system spell checker, else nobody is asked.
 *
 * The Voikko status comes over IPC, so it is a Promise. refresh() awaits it;
 * reading `.available` straight from the call would always be undefined and
 * the guard would silently never run (test/services/wordCheck.test.js).
 */

/**
 * @param {object} api window.electronAPI, or a stand-in with the same methods
 * @param {(opts?: object) => Promise<{available: boolean}>} api.voikkoStatus
 * @param {(args: {words: string[]}) => Promise<{success: boolean, results: Array<{word: string, known: boolean}>}>} api.voikkoAnalyze
 * @param {() => boolean | Promise<boolean>} [api.spellProbe] does the system checker know Finnish
 * @param {(words: string[]) => object | Promise<object>} [api.spellCheckWords]
 * @returns {{ refresh: Function, current: Function, source: Function }}
 */
function createWordCheck(api) {
  let source = null;
  let pending = null;

  const checkers = {
    voikko: async (words) => {
      const response = await api.voikkoAnalyze({ words });
      if (!response || !response.success) throw new Error('Voikko ei ole käytettävissä');
      const known = {};
      for (const result of response.results || []) known[result.word] = result.known === true;
      return known;
    },
    // A promise also when the system checker answers at once, or throws
    system: (words) => new Promise((resolve) => resolve(api.spellCheckWords(words)))
  };

  async function findSource(options) {
    let status = null;
    try {
      status = await api.voikkoStatus(options);
    } catch (error) {
      // No answer counts as "not installed"
      status = null;
    }
    if (status && status.available === true) return 'voikko';

    if (typeof api.spellProbe === 'function' && typeof api.spellCheckWords === 'function') {
      try {
        if ((await api.spellProbe()) === true) return 'system';
      } catch (error) {
        // Fall through: no checker
      }
    }
    return null;
  }

  /**
   * Ask which checker there is. Calls made while one is under way share its answer.
   * @returns {Promise<'voikko'|'system'|null>}
   */
  function refresh(options) {
    if (!pending) {
      pending = findSource(options)
        .then((found) => {
          source = found;
          return found;
        })
        .finally(() => {
          pending = null;
        });
    }
    return pending;
  }

  /**
   * The checker to hand to a run: (words) => Promise<{ [word]: boolean }>.
   * Undefined until the first refresh() has resolved, and when there is none.
   */
  function current() {
    return source ? checkers[source] : undefined;
  }

  return { refresh, current, source: () => source };
}

module.exports = { createWordCheck };

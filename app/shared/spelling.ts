/**
 * Helpers shared by the spell checker in the main process and the editor.
 */

/** Words in running text: letters with inner apostrophes, hyphens or colons (EU:n) */
export const WORD_PATTERN = /[\p{L}][\p{L}\p{M}]*(?:[-'’:][\p{L}\p{M}]+)*/gu;

export function extractWords(text: string): { word: string; index: number }[] {
  return [...text.matchAll(WORD_PATTERN)].map(m => ({ word: m[0], index: m.index! }));
}

// Common Finnish case endings and clitics, longest first
const SUFFIXES = [
  'ineen', 'inensa', 'inensä', 'lleen', 'ltaan', 'ltään', 'staan', 'stään', 'ssaan', 'ssään',
  'lla', 'llä', 'lta', 'ltä', 'lle', 'ssa', 'ssä', 'sta', 'stä', 'ksi', 'tta', 'ttä', 'ine',
  'han', 'hen', 'hin', 'hon', 'hun', 'hyn', 'hän', 'hön', 'na', 'nä', 'ni', 'si', 'mme', 'nne',
  'kin', 'kaan', 'kään', 'ko', 'kö', 'pa', 'pä',
  'in', 'en', 'an', 'än', 'n', 'a', 'ä', 't', 'e', 'i'
];

/**
 * True if `word` is a known word or an inflected form of one, e.g. a character
 * name "Kvarnström" also accepts "Kvarnströmin", "Kvarnströmille", "Kvarnström:lle".
 */
export function matchesKnownWord(word: string, known: Set<string>): boolean {
  if (known.size === 0) return false;
  const lower = word.toLowerCase();
  if (known.has(lower)) return true;

  const base = lower.replace(/[:'’]/g, '');
  for (let cut = 0; cut <= 2; cut++) {
    // Strip up to two stacked endings (Ainollekin = Aino + lle + kin)
    const candidates = cut === 0 ? [base] : stripSuffixes(base, cut);
    for (const c of candidates) {
      if (known.has(c)) return true;
    }
  }
  // Colon-inflected abbreviations and foreign names: "EU:n", "Jean-Luc:lle"
  const colon = lower.indexOf(':');
  return colon > 0 && known.has(lower.slice(0, colon));
}

function stripSuffixes(word: string, depth: number): string[] {
  let current = [word];
  for (let i = 0; i < depth; i++) {
    current = current.flatMap(w =>
      SUFFIXES.filter(s => w.length > s.length + 1 && w.endsWith(s)).map(s => w.slice(0, -s.length))
    );
  }
  return current;
}

/** Normalize a list of dictionary words (one per line) */
export function parseWordList(text: string): Set<string> {
  return new Set(
    text
      .split(/\r?\n/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w && !w.startsWith('#'))
  );
}

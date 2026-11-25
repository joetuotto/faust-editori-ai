/**
 * Soft hyphens (U+00AD) for typeset exports. Readers and word processors
 * break long words only at these points, so justified Finnish text does not
 * get wide gaps. The hyphenation itself comes from Voikko.
 */
import type { Block, Run } from './markdownLite';

export const SOFT_HYPHEN = '­';

/** Word -> the same word with soft hyphens at the allowed break points */
export type Hyphenator = (word: string) => string;

const MIN_LENGTH = 7;

export function hyphenateText(text: string, hyphenate: Hyphenator): string {
  return text.replace(/\p{L}{7,}/gu, word => {
    if (word.length < MIN_LENGTH) return word;
    const out = hyphenate(word);
    // Never change the letters themselves, only add break points
    return out.replaceAll(SOFT_HYPHEN, '') === word ? out : word;
  });
}

function hyphenateRuns(runs: Run[], hyphenate: Hyphenator): Run[] {
  return runs.map(r => (r.note ? { ...r, note: hyphenateRuns(r.note, hyphenate) } : { ...r, text: hyphenateText(r.text, hyphenate) }));
}

/** Headings stay as they are; body text and notes get soft hyphens */
export function hyphenateBlocks(blocks: Block[], hyphenate: Hyphenator): Block[] {
  return blocks.map(b => (b.type === 'paragraph' || b.type === 'quote' ? { ...b, runs: hyphenateRuns(b.runs, hyphenate) } : b));
}

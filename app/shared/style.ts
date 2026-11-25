/**
 * Stylometric fingerprint of a text, computed locally. Used to describe the
 * writer's own voice and to flag AI suggestions that drift away from it.
 */

export interface StyleMetrics {
  words: number;
  sentences: number;
  /** Mean words per sentence */
  sentenceLength: number;
  /** Standard deviation of sentence length: rhythm variation */
  sentenceVariation: number;
  /** Mean letters per word */
  wordLength: number;
  /** Moving-average type/token ratio (window 100 words): vocabulary richness */
  lexicalDiversity: number;
  /** Share of paragraphs that are dialogue */
  dialogueShare: number;
  /** How dialogue is marked: dash (–) or quotes (”) */
  dialogueStyle: 'dash' | 'quotes' | 'none';
  /** Per 1000 words */
  dashRate: number;
  exclamationRate: number;
  questionRate: number;
  /** Mean sentences per paragraph */
  paragraphLength: number;
}

export interface StyleProfile {
  metrics: StyleMetrics;
  /** Written by the AI on request and editable by the writer */
  description: string;
  updated: string;
}

const WORD = /[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu;

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/^\s*(\*\s*\*\s*\*|-{3,})\s*$/gm, '');
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…][”"’)]*)\s+(?=[–—”"(\p{Lu}\d])/u)
    .map(s => s.trim())
    .filter(s => /[\p{L}\p{N}]/u.test(s));
}

function mattr(words: string[], window = 100): number {
  if (words.length === 0) return 0;
  if (words.length <= window) return new Set(words).size / words.length;
  let sum = 0;
  let count = 0;
  const step = Math.max(1, Math.floor((words.length - window) / 200));
  for (let i = 0; i + window <= words.length; i += step) {
    sum += new Set(words.slice(i, i + window)).size / window;
    count++;
  }
  return sum / count;
}

export function styleMetrics(markdown: string): StyleMetrics {
  const text = stripMarkdown(markdown);
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const words = (text.match(WORD) ?? []).map(w => w.toLowerCase());
  const sentences = paragraphs.flatMap(splitSentences);
  const lengths = sentences.map(s => (s.match(WORD) ?? []).length);
  const mean = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  const variance = lengths.length ? lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length : 0;

  const dashDialogue = paragraphs.filter(p => /^[–—-]\s/.test(p)).length;
  // Quoted speech can sit anywhere in a paragraph
  const quoteDialogue = paragraphs.filter(p => /[”"«][^”"»\n]{2,}[”"»]/.test(p)).length;
  const per1000 = (n: number) => (words.length ? (n / words.length) * 1000 : 0);

  return {
    words: words.length,
    sentences: sentences.length,
    sentenceLength: mean,
    sentenceVariation: Math.sqrt(variance),
    wordLength: words.length ? words.reduce((a, w) => a + w.length, 0) / words.length : 0,
    lexicalDiversity: mattr(words),
    dialogueShare: paragraphs.length ? (dashDialogue + quoteDialogue) / paragraphs.length : 0,
    dialogueStyle: dashDialogue === 0 && quoteDialogue === 0 ? 'none' : dashDialogue >= quoteDialogue ? 'dash' : 'quotes',
    dashRate: per1000((text.match(/\s[–—]\s/g) ?? []).length),
    exclamationRate: per1000((text.match(/!/g) ?? []).length),
    questionRate: per1000((text.match(/\?/g) ?? []).length),
    paragraphLength: paragraphs.length ? sentences.length / paragraphs.length : 0
  };
}

/**
 * The writer's own text from a Markdown body: AI passages (recorded as plain
 * text in provenance) are cut out before measuring.
 */
export function withoutAIText(markdown: string, aiTexts: string[]): string {
  let text = stripMarkdown(markdown);
  for (const t of aiTexts) if (t) text = text.replace(t, '');
  return text;
}

/** Remove the character ranges that are AI text, keeping only the writer's own */
export function ownText(text: string, aiRanges: { start: number; end: number }[]): string {
  if (aiRanges.length === 0) return text;
  let out = '';
  let last = 0;
  for (const r of [...aiRanges].sort((a, b) => a.start - b.start)) {
    out += text.slice(last, Math.max(last, r.start));
    last = Math.max(last, r.end);
  }
  return out + text.slice(last);
}

export interface StyleWarning {
  id: string;
  message: string;
}

/**
 * Compare a suggestion with the writer's profile and with the original
 * passage. Only clear, explainable differences are reported.
 */
export function compareStyle(profile: StyleMetrics, original: string, revised: string): StyleWarning[] {
  const warnings: StyleWarning[] = [];
  const before = styleMetrics(original);
  const after = styleMetrics(revised);
  const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);

  // Sentence length: compare against the writer's normal, and require the edit itself to change it
  if (profile.sentences >= 20 && after.sentences >= 2 && profile.sentenceLength > 0) {
    const vsProfile = pct(after.sentenceLength, profile.sentenceLength);
    const vsOriginal = before.sentenceLength > 0 ? pct(after.sentenceLength, before.sentenceLength) : 0;
    if (Math.abs(vsProfile) >= 35 && Math.abs(vsOriginal) >= 15 && Math.sign(vsProfile) === Math.sign(vsOriginal)) {
      warnings.push({
        id: 'sentence-length',
        message: `Lauseet ovat keskimäärin ${Math.abs(vsProfile)} % ${vsProfile > 0 ? 'pidempiä' : 'lyhyempiä'} kuin tekstissäsi yleensä (${after.sentenceLength.toFixed(0)} vs. ${profile.sentenceLength.toFixed(0)} sanaa).`
      });
    }
  }

  if (profile.words >= 500 && after.words >= 30 && profile.wordLength > 0) {
    const diff = pct(after.wordLength, profile.wordLength);
    if (diff >= 12 && after.wordLength > before.wordLength) {
      warnings.push({ id: 'word-length', message: `Sanasto on raskaampaa kuin sinulla (sanat keskimäärin ${diff} % pidempiä).` });
    }
  }

  if (profile.dialogueStyle === 'dash' && after.dialogueStyle === 'quotes') {
    warnings.push({ id: 'dialogue', message: 'Ehdotus merkitsee repliikit lainausmerkein, sinä käytät repliikkiviivaa.' });
  } else if (profile.dialogueStyle === 'quotes' && after.dialogueStyle === 'dash') {
    warnings.push({ id: 'dialogue', message: 'Ehdotus merkitsee repliikit viivalla, sinä käytät lainausmerkkejä.' });
  }

  if (after.words >= 30) {
    const extra = after.exclamationRate - Math.max(profile.exclamationRate, before.exclamationRate);
    if (extra > 5) warnings.push({ id: 'exclamation', message: 'Ehdotuksessa on selvästi enemmän huutomerkkejä kuin tekstissäsi.' });
  }

  return warnings;
}

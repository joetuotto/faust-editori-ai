/**
 * Manuscript-wide search on the stored Markdown. Emphasis markers are ignored
 * when matching, so "hän sanoi" also finds "hän *sanoi*".
 */
export interface TextSearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface SearchHit {
  /** Offsets in the Markdown source */
  start: number;
  end: number;
  /** Plain text around the hit */
  before: string;
  match: string;
  after: string;
}

const MARKUP = /[*_]/;

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Pattern that tolerates * and _ between characters of the query */
export function markdownPattern(query: string, options: TextSearchOptions): RegExp | null {
  const trimmed = query;
  if (!trimmed) return null;
  const body = [...trimmed].map(ch => escapeRegExp(ch)).join('[*_]*');
  const bounded = options.wholeWord ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body;
  return new RegExp(bounded, options.caseSensitive ? 'gu' : 'giu');
}

function plain(text: string) {
  return text.replace(/[*_]/g, '').replace(/\s+/g, ' ');
}

export function searchMarkdown(markdown: string, query: string, options: TextSearchOptions, context = 40): SearchHit[] {
  const pattern = markdownPattern(query, options);
  if (!pattern) return [];
  const hits: SearchHit[] = [];
  for (const m of markdown.matchAll(pattern)) {
    if (!m[0]) continue;
    const start = m.index!;
    const end = start + m[0].length;
    hits.push({
      start,
      end,
      before: plain(markdown.slice(Math.max(0, start - context), start)).trimStart(),
      match: plain(m[0]),
      after: plain(markdown.slice(end, end + context)).trimEnd()
    });
  }
  return hits;
}

/**
 * Replace every hit. A hit that contains emphasis markers keeps them
 * balanced by only replacing hits without markup inside; those are counted
 * as skipped so the writer can fix them by hand.
 */
export function replaceMarkdown(
  markdown: string,
  query: string,
  replacement: string,
  options: TextSearchOptions
): { text: string; replaced: number; skipped: number } {
  const pattern = markdownPattern(query, options);
  if (!pattern) return { text: markdown, replaced: 0, skipped: 0 };
  let replaced = 0;
  let skipped = 0;
  const text = markdown.replace(pattern, m => {
    if (MARKUP.test(m) && !MARKUP.test(query)) {
      skipped++;
      return m;
    }
    replaced++;
    return replacement;
  });
  return { text, replaced, skipped };
}

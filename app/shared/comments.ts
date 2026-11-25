/**
 * Comments and bookmarks anchored to text, stored in .faust/comments.json.
 * The anchor is the commented text plus its plain-text offsets, like AI
 * provenance, so the Markdown files stay clean.
 */

export type CommentKind = 'comment' | 'bookmark';

export interface CommentMessage {
  author: 'writer' | 'import';
  text: string;
  at: string;
}

export interface CommentThread {
  id: string;
  kind: CommentKind;
  /** Short name for bookmarks */
  label?: string;
  /** Anchored text and its plain-text offsets; start -1 = anchor lost (text deleted) */
  quote: string;
  start: number;
  end: number;
  /** Approximate offset for a thread that has never been anchored (imports) */
  hint?: number;
  messages: CommentMessage[];
  resolved: boolean;
  created: string;
}

export interface DocComments {
  /** Hash of the document text when the anchors were recorded */
  hash: string;
  threads: CommentThread[];
}

export interface CommentsFile {
  version: 1;
  docs: Record<string, DocComments>;
}

/** Threads in document order, detached ones last */
export function sortThreads(threads: CommentThread[]): CommentThread[] {
  return [...threads].sort((a, b) => (a.start < 0 ? 1 : b.start < 0 ? -1 : a.start - b.start));
}

/**
 * Where `quote` is in `text`: the only occurrence, or the one nearest to
 * `hint` (the last known offset) when there are several; -1 if not found.
 */
export function locateQuote(text: string, quote: string, hint: number): number {
  if (!quote) return -1;
  const found: number[] = [];
  for (let i = text.indexOf(quote); i >= 0; i = text.indexOf(quote, i + 1)) found.push(i);
  if (found.length <= 1) return found[0] ?? -1;
  if (hint < 0) return -1;
  return found.reduce((best, i) => (Math.abs(i - hint) < Math.abs(best - hint) ? i : best));
}

/** Short default name for a bookmark */
export function bookmarkLabel(quote: string): string {
  const words = quote.replace(/\s+/g, ' ').trim().split(' ');
  return words.length > 6 ? `${words.slice(0, 6).join(' ')}…` : words.join(' ');
}

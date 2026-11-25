/**
 * Provenance records: which parts of a document came from AI.
 * Stored in <project>/.faust/provenance.json, keyed by document id.
 */

export type ProvenanceSource = 'ai' | 'ai-edit';

export interface ProvenanceSpan {
  start: number;
  end: number;
  source: ProvenanceSource;
  model?: string;
  at?: string;
  /** The marked text, for re-anchoring when offsets no longer match */
  text: string;
}

export interface DocProvenance {
  /** Hash of the document's plain text when the spans were recorded */
  hash: string;
  spans: ProvenanceSpan[];
}

export function hashText(text: string): string {
  // FNV-1a, enough to detect that a file changed outside the app
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export interface ProvenanceFile {
  version: 1;
  docs: Record<string, DocProvenance>;
}

/** Word counts by origin for a document */
export function provenanceStats(text: string, stored: DocProvenance | undefined) {
  const words = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;
  const total = words(text);
  let ai = 0;
  let aiEdit = 0;
  for (const span of stored?.spans ?? []) {
    if (span.source === 'ai') ai += words(span.text);
    else aiEdit += words(span.text);
  }
  return { total, own: Math.max(0, total - ai - aiEdit), ai, aiEdit };
}

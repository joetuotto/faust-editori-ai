/**
 * Provenance: which text in the manuscript came from AI.
 *
 * - "ai-edit": the writer accepted an AI rewrite suggestion for this passage
 * - "ai":      text inserted from the AI assistant
 * Everything else is the writer's own. Text the writer types is always their
 * own, even inside an AI passage.
 *
 * Marks live only in the editor. The Markdown files stay clean; spans are
 * stored per document in .faust/provenance.json as plain-text offsets plus the
 * span text, so they can be re-anchored if a file was edited elsewhere.
 */
import { Extension, Mark, type Editor, type JSONContent } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { hashText, type DocProvenance, type ProvenanceSource, type ProvenanceSpan } from '../../../shared/provenance';

export type { DocProvenance, ProvenanceSource, ProvenanceSpan };

export const PROVENANCE_META = 'faustProvenance';

export const ProvenanceMark = Mark.create({
  name: 'provenance',
  inclusive: false,
  excludes: '',
  addAttributes() {
    return {
      source: { default: 'ai' },
      model: { default: null },
      at: { default: null }
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', { class: `prov prov-${HTMLAttributes.source}`, title: provenanceTitle(HTMLAttributes) }, 0];
  }
});

function provenanceTitle(attrs: Record<string, unknown>): string {
  const what = attrs.source === 'ai-edit' ? 'AI:n muokkaama' : 'AI:n kirjoittama';
  return [what, attrs.model, attrs.at ? new Date(String(attrs.at)).toLocaleString('fi-FI') : null].filter(Boolean).join(' · ');
}

/** Typing and pasting by the writer never carries AI provenance */
export const ProvenanceGuard = Extension.create({
  name: 'faustProvenanceGuard',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('faustProvenanceGuard'),
        appendTransaction(transactions, _old, state) {
          const type = state.schema.marks.provenance;
          if (!type) return null;
          const tr = state.tr;
          for (const t of transactions) {
            // Our own AI inserts and undo/redo keep their marks
            if (!t.docChanged || t.getMeta(PROVENANCE_META) || t.getMeta('history$')) continue;
            t.mapping.maps.forEach((map, index) => {
              const rest = t.mapping.slice(index + 1);
              map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                if (newEnd > newStart) tr.removeMark(rest.map(newStart, -1), rest.map(newEnd, 1), type);
              });
            });
          }
          return tr.docChanged || tr.steps.length > 0 ? tr.setMeta(PROVENANCE_META, true).setMeta('addToHistory', false) : null;
        }
      })
    ];
  }
});

/* ---------- clean Markdown ---------- */

function sameMarks(a?: JSONContent['marks'], b?: JSONContent['marks']) {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

/** Remove provenance marks and merge text nodes that became identical */
export function stripProvenance(node: JSONContent): JSONContent {
  const marks = node.marks?.filter(m => m.type !== 'provenance');
  const out: JSONContent = { ...node, ...(node.marks ? { marks: marks!.length ? marks : undefined } : {}) };
  if (!out.marks) delete out.marks;
  if (node.content) {
    const merged: JSONContent[] = [];
    for (const child of node.content.map(stripProvenance)) {
      const last = merged[merged.length - 1];
      if (last && last.type === 'text' && child.type === 'text' && sameMarks(last.marks, child.marks)) {
        merged[merged.length - 1] = { ...last, text: (last.text ?? '') + (child.text ?? '') };
      } else {
        merged.push(child);
      }
    }
    out.content = merged;
  }
  return out;
}

/** Markdown of the editor content without provenance marks */
export function cleanMarkdown(editor: Editor): string {
  return editor.markdown?.serialize(stripProvenance(editor.getJSON())) ?? editor.getMarkdown();
}

export function serializeClean(editor: Editor, doc: JSONContent): string {
  return editor.markdown?.serialize(stripProvenance(doc)) ?? '';
}

/* ---------- plain text <-> positions ---------- */

interface TextIndex {
  text: string;
  /** Document position of each character in `text` (block separators map to -1) */
  positions: number[];
}

/** Canonical plain text: blocks separated by a blank line, hard breaks as newline */
export function indexText(doc: PMNode): TextIndex {
  let text = '';
  const positions: number[] = [];
  let firstBlock = true;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (!firstBlock) {
      text += '\n\n';
      positions.push(-1, -1);
    }
    firstBlock = false;
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText) {
        text += child.text;
        for (let i = 0; i < child.text!.length; i++) positions.push(start + i);
      } else {
        text += '\n';
        positions.push(start);
      }
    });
    return false;
  });
  return { text, positions };
}

/** Read the provenance spans from the editor */
export function extractProvenance(doc: PMNode): DocProvenance {
  const { text, positions } = indexText(doc);
  const posToOffset = new Map<number, number>();
  positions.forEach((p, i) => p >= 0 && posToOffset.set(p, i));

  const spans: ProvenanceSpan[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const mark = node.marks.find(m => m.type.name === 'provenance');
    if (!mark) return false;
    const start = posToOffset.get(pos);
    if (start === undefined) return false;
    const end = start + node.text!.length;
    const last = spans[spans.length - 1];
    const attrs = { source: mark.attrs.source as ProvenanceSource, model: mark.attrs.model ?? undefined, at: mark.attrs.at ?? undefined };
    if (last && last.end === start && last.source === attrs.source && last.model === attrs.model && last.at === attrs.at) {
      last.end = end;
    } else {
      spans.push({ start, end, ...attrs, text: '' });
    }
    return false;
  });
  for (const s of spans) s.text = text.slice(s.start, s.end);
  return { hash: hashText(text), spans };
}

/** Put stored spans back as marks. Returns how many spans could not be placed. */
export function applyProvenance(editor: Editor, stored: DocProvenance | undefined): number {
  if (!stored || stored.spans.length === 0) return 0;
  const type = editor.schema.marks.provenance;
  const { text, positions } = indexText(editor.state.doc);
  const exact = hashText(text) === stored.hash;
  const tr = editor.state.tr;
  let lost = 0;

  for (const span of stored.spans) {
    let start = span.start;
    if (!exact || text.slice(span.start, span.end) !== span.text) {
      // Re-anchor by content: accept only a unique match
      const first = text.indexOf(span.text);
      if (first < 0 || text.indexOf(span.text, first + 1) >= 0 || !span.text) {
        lost++;
        continue;
      }
      start = first;
    }
    const mark = type.create({ source: span.source, model: span.model ?? null, at: span.at ?? null });
    // Mark each run of real characters (skipping block separators)
    let runStart = -1;
    for (let i = start; i <= start + span.text.length; i++) {
      const p = i < start + span.text.length ? positions[i] : -1;
      if (p >= 0 && runStart < 0) runStart = p;
      if ((p < 0 || i === start + span.text.length) && runStart >= 0) {
        tr.addMark(runStart, positions[i - 1] + 1, mark);
        runStart = -1;
      }
    }
  }
  if (tr.steps.length > 0) editor.view.dispatch(tr.setMeta(PROVENANCE_META, true).setMeta('addToHistory', false));
  return lost;
}

/** Mark a range as AI text (inside the same transaction as the insert) */
export function markRange(editor: Editor, from: number, to: number, source: ProvenanceSource, model?: string) {
  const mark = editor.schema.marks.provenance.create({ source, model: model ?? null, at: new Date().toISOString() });
  editor.view.dispatch(editor.state.tr.addMark(from, to, mark).setMeta(PROVENANCE_META, true).setMeta('addToHistory', false));
}

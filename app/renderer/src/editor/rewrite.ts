/**
 * AI rewrites as reviewable suggestions.
 *
 * The passage is sent as Markdown, the answer is diffed word by word against
 * the original, and the author accepts or rejects each change. Nothing in the
 * manuscript changes until they apply the result. The target range is tracked
 * with a decoration so edits elsewhere in the document don't break it.
 */
import type { Editor, JSONContent } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Extension } from '@tiptap/core';
import { diffArrays } from 'diff';
import { markRange, serializeClean } from './provenance';

export interface RewritePreset {
  id: string;
  label: string;
  instruction: string;
}

export const REWRITE_PRESETS: RewritePreset[] = [
  { id: 'language', label: 'Korjaa kieli', instruction: 'Korjaa kielioppi, oikeinkirjoitus ja välimerkit. Älä muuta tyyliä, sanavalintoja tai sisältöä.' },
  { id: 'tighten', label: 'Tiivistä', instruction: 'Tiivistä tekstiä: poista toistoa ja turhia sanoja. Säilytä sisältö, sävy ja kertojan ääni.' },
  { id: 'rhythm', label: 'Paranna rytmiä', instruction: 'Paranna lauserytmiä ja luettavuutta vaihtelemalla lauseiden pituutta. Muuta mahdollisimman vähän.' },
  { id: 'vivid', label: 'Elävöitä', instruction: 'Tee kuvauksesta aistivoimaisempaa ja konkreettisempaa (näytä, älä kerro). Älä pidennä tekstiä paljon.' },
  { id: 'dialogue', label: 'Luontevampi dialogi', instruction: 'Tee repliikeistä luontevampia ja henkilöille ominaisia. Käytä suomalaista repliikkiviivaa (–).' }
];

export const REWRITE_SYSTEM = [
  'Olet kokenut suomalainen kustannustoimittaja. Muokkaat kirjailijan tekstiä hänen pyynnöstään.',
  'Palauta VAIN muokattu teksti Markdown-muodossa: ei selityksiä, otsikoita, lainausmerkkejä eikä koodilohkoja.',
  'Säilytä kirjailijan ääni, aikamuoto, kertojan näkökulma ja kappalejako, ellei ohje muuta pyydä.',
  'Säilytä kursivoinnit (*näin*) ja muu muotoilu.'
].join('\n');

/* ---------- target range tracking ---------- */

const targetKey = new PluginKey<DecorationSet>('faustRewriteTarget');

export const RewriteTarget = Extension.create({
  name: 'faustRewriteTarget',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: targetKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(targetKey) as { from: number; to: number } | null | undefined;
            if (meta === null) return DecorationSet.empty;
            if (meta) return DecorationSet.create(tr.doc, [Decoration.inline(meta.from, meta.to, { class: 'rewrite-target' })]);
            return set.map(tr.mapping, tr.doc);
          }
        },
        props: { decorations: state => targetKey.getState(state) }
      })
    ];
  }
});

export function setTarget(editor: Editor, range: { from: number; to: number } | null) {
  editor.view.dispatch(editor.state.tr.setMeta(targetKey, range).setMeta('addToHistory', false));
}

export function getTarget(editor: Editor): { from: number; to: number } | null {
  const found = targetKey.getState(editor.state)?.find();
  if (!found || found.length === 0) return null;
  return { from: found[0].from, to: found[found.length - 1].to };
}

/* ---------- selection -> Markdown ---------- */

export interface RewriteSource {
  from: number;
  to: number;
  /** inline: part of one paragraph; block: whole paragraphs */
  mode: 'inline' | 'block';
  markdown: string;
}

/**
 * The passage to rewrite: the selection if it lies inside one paragraph,
 * otherwise the whole paragraphs it touches. An empty selection means the
 * paragraph under the cursor.
 */
export function getRewriteSource(editor: Editor): RewriteSource | null {
  const { state } = editor;
  const { from, to, empty, $from, $to } = state.selection;
  const serialize = (content: JSONContent[]) => serializeClean(editor, { type: 'doc', content }).trim();

  if (!empty && $from.sameParent($to) && $from.parent.isTextblock) {
    const inline = state.doc.slice(from, to).content.toJSON() as JSONContent[] | null;
    return { from, to, mode: 'inline', markdown: serialize([{ type: 'paragraph', content: inline ?? [] }]) };
  }

  // Whole top-level blocks between the selection ends
  const start = $from.depth >= 1 ? $from.before(1) : 0;
  const end = $to.depth >= 1 ? $to.after(1) : state.doc.content.size;
  const blocks = state.doc.slice(start, end).content.toJSON() as JSONContent[] | null;
  const markdown = serialize(blocks ?? []);
  if (!markdown) return null;
  return { from: start, to: end, mode: 'block', markdown };
}

/* ---------- diff ---------- */

export type Hunk =
  | { kind: 'same'; text: string }
  | { kind: 'change'; removed: string; added: string; accepted: boolean };

/**
 * Whitespace-separated tokens, so Markdown markup stays attached to its word
 * ("*hitaasti*," is one token) and accepting only some changes can never leave
 * an unbalanced * or _ behind.
 */
function tokenize(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [];
}

/**
 * Word-level diff; adjacent removals and additions form one change. Short
 * unchanged fragments between two changes are folded into one change, and a
 * near-total rewrite is shown as a single replacement, so the review stays
 * readable instead of alternating word by word.
 */
export function diffHunks(original: string, revised: string): Hunk[] {
  const hunks = rawHunks(original, revised);
  const same = hunks.reduce((n, h) => n + (h.kind === 'same' ? h.text.trim().length : 0), 0);
  const total = Math.max(original.trim().length, revised.trim().length, 1);
  if (hunks.some(h => h.kind === 'change') && same / total < 0.35) {
    return [{ kind: 'change', removed: original, added: revised, accepted: true }];
  }

  const merged: Hunk[] = [];
  for (let i = 0; i < hunks.length; i++) {
    const h = hunks[i];
    const prev = merged[merged.length - 1];
    const next = hunks[i + 1];
    const bridge = h.kind === 'same' && prev?.kind === 'change' && next?.kind === 'change' && isShortBridge(h.text);
    if (bridge && prev.kind === 'change' && next.kind === 'change') {
      prev.removed += h.text + next.removed;
      prev.added += h.text + next.added;
      i++;
    } else if (h.kind === 'change' && prev?.kind === 'change') {
      prev.removed += h.removed;
      prev.added += h.added;
    } else {
      merged.push({ ...h });
    }
  }
  return merged;
}

/** Whitespace, or at most two short words, between two changes */
function isShortBridge(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length === 0 || (words.length <= 2 && words.every(w => w.length <= 4));
}

function rawHunks(original: string, revised: string): Hunk[] {
  const hunks: Hunk[] = [];
  for (const part of diffArrays(tokenize(original), tokenize(revised))) {
    const value = part.value.join('');
    const last = hunks[hunks.length - 1];
    if (!part.added && !part.removed) {
      if (last?.kind === 'same') last.text += value;
      else hunks.push({ kind: 'same', text: value });
    } else if (last?.kind === 'change') {
      if (part.added) last.added += value;
      else last.removed += value;
    } else {
      hunks.push({ kind: 'change', removed: part.removed ? value : '', added: part.added ? value : '', accepted: true });
    }
  }
  return hunks;
}

export function mergeHunks(hunks: Hunk[]): string {
  return hunks.map(h => (h.kind === 'same' ? h.text : h.accepted ? h.added : h.removed)).join('');
}

/** Clean up common model habits: code fences, surrounding quotes */
export function cleanModelOutput(text: string): string {
  let out = text.trim();
  const fence = out.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/);
  if (fence) out = fence[1].trim();
  if (/^["”“].*["”“]$/s.test(out) && !out.slice(1, -1).includes('"')) out = out.slice(1, -1).trim();
  return out;
}

/* ---------- apply ---------- */

/**
 * Replace the target range with Markdown, keeping inline edits inside their
 * paragraph, and record the result as AI-edited (or AI-written) text.
 */
export function applyMarkdown(
  editor: Editor,
  range: { from: number; to: number },
  mode: RewriteSource['mode'],
  markdown: string,
  provenance?: { source: 'ai' | 'ai-edit'; model?: string }
) {
  const parsed = editor.markdown?.parse(markdown) ?? { type: 'doc', content: [] };
  const blocks = parsed.content ?? [];
  const content: JSONContent[] =
    mode === 'inline' && blocks.length === 1 && blocks[0].type === 'paragraph' ? (blocks[0].content ?? []) : blocks;

  const sizeBefore = editor.state.doc.content.size;
  editor.chain().focus().insertContentAt(range, content.length > 0 ? content : '').run();
  if (!provenance) return;
  // The inserted content ends where the old range ended, shifted by the size change
  const end = range.to + (editor.state.doc.content.size - sizeBefore);
  if (end > range.from) markRange(editor, range.from, end, provenance.source, provenance.model);
}

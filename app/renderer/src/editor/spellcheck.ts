/**
 * Voikko spelling and grammar marks for the manuscript editor.
 *
 * Checking runs in the main process; results are cached per word so typing
 * only sends new words. Paragraphs are re-checked shortly after they change.
 * Decorations never touch the document, so nothing is saved into the text.
 */
import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { GrammarIssue } from '../../../shared/types';
import { extractWords, matchesKnownWord } from '../../../shared/spelling';

export const spellcheckKey = new PluginKey<SpellState>('faustSpellcheck');

interface SpellState {
  decorations: DecorationSet;
  /** Bumped by the recheckSpelling command */
  version: number;
}

export interface SpellcheckOptions {
  /** Extra accepted words (e.g. names from the story bible), lowercase */
  knownWords: () => Set<string>;
  enabled: () => boolean;
}

/* ---------- word cache shared by all editors ---------- */

const wordCache = new Map<string, boolean>();
const pending = new Set<string>();
const grammarCache = new Map<string, GrammarIssue[]>();

export function forgetWord(word: string) {
  wordCache.delete(word);
}

export function clearSpellCache() {
  wordCache.clear();
  grammarCache.clear();
}

async function checkWords(words: string[]): Promise<void> {
  const unknown = words.filter(w => !wordCache.has(w) && !pending.has(w));
  if (unknown.length === 0) return;
  unknown.forEach(w => pending.add(w));
  try {
    const misspelled = new Set(await window.faust.lang.check(unknown));
    for (const w of unknown) wordCache.set(w, !misspelled.has(w));
  } finally {
    unknown.forEach(w => pending.delete(w));
  }
}

async function checkGrammar(texts: string[]): Promise<void> {
  const unknown = [...new Set(texts.filter(t => !grammarCache.has(t)))];
  if (unknown.length === 0) return;
  const results = await window.faust.lang.grammar(unknown);
  unknown.forEach((t, i) => grammarCache.set(t, results[i] ?? []));
  // Keep the cache from growing without bound during long sessions
  if (grammarCache.size > 3000) {
    for (const key of [...grammarCache.keys()].slice(0, 1000)) grammarCache.delete(key);
  }
}

/* ---------- decoration building ---------- */

interface TextBlock {
  pos: number; // position of the block's content start
  text: string;
  /** Maps text offset -> document position (inline atoms like hard breaks break text) */
  offsets: number[];
}

function textBlocks(doc: PMNode): TextBlock[] {
  const blocks: TextBlock[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const offsets: number[] = [];
    node.forEach((child, childOffset) => {
      const start = pos + 1 + childOffset;
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) offsets.push(start + i);
        text += child.text;
      } else {
        offsets.push(start);
        text += '\n';
      }
    });
    offsets.push(pos + 1 + node.content.size);
    blocks.push({ pos: pos + 1, text, offsets });
    return false;
  });
  return blocks;
}

function buildDecorations(doc: PMNode, known: Set<string>): Decoration[] {
  const decorations: Decoration[] = [];
  for (const block of textBlocks(doc)) {
    for (const { word, index } of extractWords(block.text)) {
      if (wordCache.get(word) !== false || matchesKnownWord(word, known)) continue;
      decorations.push(
        Decoration.inline(block.offsets[index], block.offsets[index + word.length - 1] + 1, {
          class: 'spell-error',
          'data-word': word
        })
      );
    }
    for (const issue of grammarCache.get(block.text) ?? []) {
      const from = block.offsets[issue.start];
      const to = block.offsets[Math.min(issue.start + issue.length, block.text.length) - 1];
      if (from === undefined || to === undefined) continue;
      decorations.push(
        Decoration.inline(from, to + 1, {
          class: 'grammar-error',
          title: issue.description,
          'data-grammar': JSON.stringify({ description: issue.description, suggestions: issue.suggestions })
        })
      );
    }
  }
  return decorations;
}

/* ---------- extension ---------- */

const RECHECK_DELAY = 350;

export const Spellcheck = Extension.create<SpellcheckOptions>({
  name: 'faustSpellcheck',

  addOptions() {
    return { knownWords: () => new Set(), enabled: () => true };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = (view: EditorView) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        if (view.isDestroyed) return;
        if (!options.enabled()) {
          view.dispatch(view.state.tr.setMeta(spellcheckKey, { decorations: DecorationSet.empty }));
          return;
        }
        const blocks = textBlocks(view.state.doc);
        const words = [...new Set(blocks.flatMap(b => extractWords(b.text).map(w => w.word)))];
        await Promise.all([checkWords(words), checkGrammar(blocks.map(b => b.text))]);
        if (view.isDestroyed) return;
        const decorations = DecorationSet.create(view.state.doc, buildDecorations(view.state.doc, options.knownWords()));
        view.dispatch(view.state.tr.setMeta(spellcheckKey, { decorations }).setMeta('addToHistory', false));
      }, RECHECK_DELAY);
    };

    return [
      new Plugin<SpellState>({
        key: spellcheckKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty, version: 0 }),
          apply(tr, value) {
            if (tr.getMeta('faustRecheck')) return { ...value, version: value.version + 1 };
            const meta = tr.getMeta(spellcheckKey) as Partial<SpellState> | undefined;
            if (meta?.decorations) return { ...value, decorations: meta.decorations };
            // Keep marks in place while typing until the next check runs
            return tr.docChanged ? { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) } : value;
          }
        },
        props: {
          decorations: (state: EditorState) => spellcheckKey.getState(state)?.decorations
        },
        view: view => {
          refresh(view);
          return {
            update: (v, prev) => {
              const versionChanged = spellcheckKey.getState(v.state)?.version !== spellcheckKey.getState(prev)?.version;
              if (v.state.doc !== prev.doc || versionChanged) refresh(v);
            },
            destroy: () => {
              if (timer) clearTimeout(timer);
            }
          };
        }
      })
    ];
  },

  addCommands() {
    return {
      recheckSpelling:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta('faustRecheck', true);
          return true;
        }
    };
  }
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    faustSpellcheck: {
      /** Re-run spelling and grammar checks (after the dictionary changed) */
      recheckSpelling: () => ReturnType;
    };
  }
}

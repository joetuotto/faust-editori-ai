/**
 * Find and replace inside the open document. Matches are decorations, so the
 * text itself is untouched until something is replaced.
 */
import { Extension, type Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { indexText } from './provenance';

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

interface SearchState {
  query: string;
  options: SearchOptions;
  matches: { from: number; to: number }[];
  current: number;
  decorations: DecorationSet;
}

export const searchKey = new PluginKey<SearchState>('faustSearch');

const EMPTY: SearchState = {
  query: '',
  options: { caseSensitive: false, wholeWord: false },
  matches: [],
  current: 0,
  decorations: DecorationSet.empty
};

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A regular expression for the query (plain text, never user regex) */
export function searchPattern(query: string, options: SearchOptions): RegExp | null {
  if (!query) return null;
  const body = escapeRegExp(query);
  const bounded = options.wholeWord ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body;
  return new RegExp(bounded, options.caseSensitive ? 'gu' : 'giu');
}

/** Match ranges in document positions; matches never cross paragraphs */
export function findMatches(doc: PMNode, query: string, options: SearchOptions): { from: number; to: number }[] {
  const pattern = searchPattern(query, options);
  if (!pattern) return [];
  const { text, positions } = indexText(doc);
  const out: { from: number; to: number }[] = [];
  for (const m of text.matchAll(pattern)) {
    if (!m[0]) continue;
    const start = positions[m.index!];
    const end = positions[m.index! + m[0].length - 1];
    if (start < 0 || end < 0 || end < start) continue;
    out.push({ from: start, to: end + 1 });
  }
  return out;
}

function build(doc: PMNode, query: string, options: SearchOptions, current: number): SearchState {
  const matches = findMatches(doc, query, options);
  const index = matches.length ? Math.min(Math.max(current, 0), matches.length - 1) : 0;
  const decorations = DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === index ? 'search-match current' : 'search-match' }))
  );
  return { query, options, matches, current: index, decorations };
}

export const Search = Extension.create({
  name: 'faustSearch',
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => EMPTY,
          apply(tr, value, _old, newState) {
            const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined;
            if (meta) {
              return build(newState.doc, meta.query ?? value.query, meta.options ?? value.options, meta.current ?? value.current);
            }
            if (tr.docChanged && value.query) return build(newState.doc, value.query, value.options, value.current);
            return value;
          }
        },
        props: { decorations: state => searchKey.getState(state)?.decorations }
      })
    ];
  }
});

export function getSearch(editor: Editor): SearchState {
  return searchKey.getState(editor.state) ?? EMPTY;
}

function reveal(editor: Editor, index: number) {
  const { matches } = getSearch(editor);
  const m = matches[index];
  if (!m) return;
  editor.chain().setTextSelection(m).scrollIntoView().run();
}

export function setSearch(editor: Editor, query: string, options: SearchOptions) {
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query, options, current: 0 }).setMeta('addToHistory', false));
  // Start from the first match after the cursor
  const { matches } = getSearch(editor);
  const after = matches.findIndex(m => m.from >= editor.state.selection.from);
  const index = after >= 0 ? after : 0;
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { current: index }).setMeta('addToHistory', false));
  reveal(editor, index);
}

export function stepSearch(editor: Editor, delta: 1 | -1) {
  const { matches, current } = getSearch(editor);
  if (matches.length === 0) return;
  const index = (current + delta + matches.length) % matches.length;
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { current: index }).setMeta('addToHistory', false));
  reveal(editor, index);
}

export function clearSearch(editor: Editor) {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query: '' }).setMeta('addToHistory', false));
}

export function replaceCurrent(editor: Editor, replacement: string) {
  const { matches, current } = getSearch(editor);
  const m = matches[current];
  if (!m) return;
  editor.chain().focus().insertContentAt(m, replacement ? { type: 'text', text: replacement } : '').run();
  reveal(editor, getSearch(editor).current);
}

/** Replace every match in one undoable step; returns how many were replaced */
export function replaceAll(editor: Editor, replacement: string): number {
  const { matches } = getSearch(editor);
  if (matches.length === 0) return 0;
  const tr = editor.state.tr;
  // Back to front so earlier positions stay valid
  for (const m of [...matches].reverse()) {
    if (replacement) tr.insertText(replacement, m.from, m.to);
    else tr.delete(m.from, m.to);
  }
  editor.view.dispatch(tr);
  return matches.length;
}

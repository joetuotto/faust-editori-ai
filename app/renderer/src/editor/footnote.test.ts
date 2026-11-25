// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Footnote } from './footnote';
import { cleanMarkdown, indexText } from './provenance';

let editor: Editor;
afterEach(() => editor?.destroy());

// The React node view needs a React renderer; the schema and Markdown are what matter here
const HeadlessFootnote = Footnote.extend({ addNodeView: () => null });

function make(markdown: string) {
  editor = new Editor({ extensions: [StarterKit, Markdown, HeadlessFootnote] });
  editor.commands.setContent(markdown, { contentType: 'markdown' });
  return editor;
}

describe('footnote node', () => {
  it('round-trips Markdown, also with brackets and emphasis in the note', () => {
    const md = 'Hän *lähti*^[Vuonna *1918*, ks. \\[1\\].] ja palasi.';
    make(md);
    const notes: string[] = [];
    editor.state.doc.descendants(n => {
      if (n.type.name === 'footnote') notes.push(n.attrs.text);
    });
    expect(notes).toEqual(['Vuonna *1918*, ks. [1].']);
    expect(cleanMarkdown(editor)).toBe(md);
  });

  it('inserts a note at the cursor and counts it as one character in plain text', () => {
    make('Ensin toinen.');
    editor.commands.setTextSelection(6);
    editor.commands.insertFootnote('Selitys');
    expect(cleanMarkdown(editor)).toBe('Ensin^[Selitys] toinen.');
    expect(indexText(editor.state.doc).text).toBe('Ensin\n toinen.');
  });
});

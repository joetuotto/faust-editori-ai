// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { ProvenanceGuard, ProvenanceMark, applyProvenance, cleanMarkdown, extractProvenance, indexText, markRange } from './provenance';
import { provenanceStats } from '../../../shared/provenance';

let editor: Editor;

function make(markdown: string) {
  editor = new Editor({ extensions: [StarterKit, Markdown, ProvenanceMark, ProvenanceGuard] });
  editor.commands.setContent(markdown, { contentType: 'markdown' });
  return editor;
}

/** Document range of the first occurrence of `text` */
function rangeOf(text: string) {
  const { text: plain, positions } = indexText(editor.state.doc);
  const i = plain.indexOf(text);
  return { from: positions[i], to: positions[i + text.length - 1] + 1 };
}

afterEach(() => editor?.destroy());

describe('provenance', () => {
  it('keeps Markdown clean when marks overlap emphasis', () => {
    make('Oma teksti. AI teksti *kursiivi*.');
    const { from } = rangeOf('AI teksti');
    const { to } = rangeOf('kursiiv');
    markRange(editor, from, to, 'ai-edit', 'claude-opus-5');
    expect(cleanMarkdown(editor)).toBe('Oma teksti. AI teksti *kursiivi*.');
  });

  it('extracts spans and restores them in a new editor', () => {
    make('Ensimmäinen kappale.\n\nToinen kappale on AI:n.');
    const r = rangeOf('Toinen kappale on AI:n.');
    markRange(editor, r.from, r.to, 'ai', 'claude-opus-5');
    const stored = extractProvenance(editor.state.doc);
    expect(stored.spans).toHaveLength(1);
    expect(stored.spans[0]).toMatchObject({ source: 'ai', model: 'claude-opus-5', text: 'Toinen kappale on AI:n.' });
    editor.destroy();

    make('Ensimmäinen kappale.\n\nToinen kappale on AI:n.');
    expect(applyProvenance(editor, stored)).toBe(0);
    expect(extractProvenance(editor.state.doc).spans.map(s => s.text)).toEqual(['Toinen kappale on AI:n.']);
  });

  it('re-anchors spans when the file changed elsewhere, and reports lost ones', () => {
    make('A.\n\nAI:n lause.');
    const r = rangeOf('AI:n lause.');
    markRange(editor, r.from, r.to, 'ai');
    const stored = extractProvenance(editor.state.doc);
    editor.destroy();

    make('Uusi alku lisätty muualla.\n\nA.\n\nAI:n lause.');
    expect(applyProvenance(editor, stored)).toBe(0);
    expect(extractProvenance(editor.state.doc).spans[0].text).toBe('AI:n lause.');
    editor.destroy();

    make('Kokonaan eri teksti.');
    expect(applyProvenance(editor, stored)).toBe(1);
  });

  it("text the writer types inside an AI passage is the writer's own", () => {
    make('AI kirjoitti tämän.');
    const r = rangeOf('AI kirjoitti tämän.');
    markRange(editor, r.from, r.to, 'ai');
    const inside = rangeOf('kirjoitti').from;
    editor.chain().setTextSelection(inside).insertContent('myös ').run();
    const spans = extractProvenance(editor.state.doc).spans;
    expect(spans.map(s => s.text)).toEqual(['AI ', 'kirjoitti tämän.']);
  });

  it('counts words by origin', () => {
    make('Oma lause tässä.\n\nAI lause.');
    const r = rangeOf('AI lause.');
    markRange(editor, r.from, r.to, 'ai');
    const stats = provenanceStats(indexText(editor.state.doc).text, extractProvenance(editor.state.doc));
    expect(stats).toEqual({ total: 5, own: 3, ai: 2, aiEdit: 0 });
  });
});

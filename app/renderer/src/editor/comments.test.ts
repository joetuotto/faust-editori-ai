// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { CommentMark, addAnchor, applyComments, extractAnchors, removeAnchor, updateThreads } from './comments';
import { ProvenanceMark, cleanMarkdown, indexText } from './provenance';
import { bookmarkLabel, locateQuote, type CommentThread, type DocComments } from '../../../shared/comments';

let editor: Editor;

function make(markdown: string) {
  editor = new Editor({ extensions: [StarterKit, Markdown, ProvenanceMark, CommentMark] });
  editor.commands.setContent(markdown, { contentType: 'markdown' });
  return editor;
}

function select(text: string) {
  const { text: plain, positions } = indexText(editor.state.doc);
  const i = plain.indexOf(text);
  editor.commands.setTextSelection({ from: positions[i], to: positions[i + text.length - 1] + 1 });
}

function thread(id: string, quote: string, start = -1): CommentThread {
  return { id, kind: 'comment', quote, start, end: start < 0 ? -1 : start + quote.length, messages: [], resolved: false, created: '' };
}

afterEach(() => editor?.destroy());

describe('comment anchors', () => {
  it('anchors the selection and never writes the mark into Markdown', () => {
    make('Hän avasi *oven* hitaasti.');
    select('avasi oven');
    expect(addAnchor(editor, 't1', 'comment')).toBe('avasi oven');
    expect(cleanMarkdown(editor)).toBe('Hän avasi *oven* hitaasti.');
    expect(extractAnchors(editor.state.doc).anchors.get('t1')).toEqual({ start: 4, end: 14, text: 'avasi oven' });
  });

  it('expands an empty selection to the word, or the paragraph for bookmarks', () => {
    make('Ensimmäinen kappale.\n\nToinen kappale tässä.');
    const { positions } = indexText(editor.state.doc);
    editor.commands.setTextSelection(positions[30]); // inside "kappale" of the 2nd paragraph
    expect(addAnchor(editor, 'w', 'comment')).toBe('kappale');
    expect(addAnchor(editor, 'b', 'bookmark')).toBe('Toinen kappale tässä.');
  });

  it('follows edits and detaches a thread whose text is deleted', () => {
    make('Alku. Kommentoitu kohta. Loppu.');
    select('Kommentoitu kohta');
    addAnchor(editor, 't1', 'comment');
    let stored: DocComments = { hash: '', threads: [thread('t1', 'Kommentoitu kohta', 6)] };

    editor.commands.insertContentAt(1, 'Uusi ');
    stored = updateThreads(editor.state.doc, stored)!;
    expect(stored.threads[0]).toMatchObject({ start: 11, quote: 'Kommentoitu kohta' });
    // Unchanged document: same object, so the store does not save again
    expect(updateThreads(editor.state.doc, stored)).toBe(stored);

    select('Kommentoitu kohta');
    editor.commands.deleteSelection();
    stored = updateThreads(editor.state.doc, stored)!;
    expect(stored.threads[0].start).toBe(-1);
  });

  it('restores anchors after reload and re-anchors after outside edits', () => {
    make('Sama lause.\n\nSama lause.\n\nToinen.');
    select('Toinen');
    addAnchor(editor, 't1', 'comment');
    const { hash, anchors } = extractAnchors(editor.state.doc);
    const stored: DocComments = { hash, threads: [{ ...thread('t1', 'Toinen', anchors.get('t1')!.start), end: anchors.get('t1')!.end }] };
    editor.destroy();

    make('Lisätty muualla.\n\nSama lause.\n\nSama lause.\n\nToinen.');
    expect(applyComments(editor, stored)).toBe(0);
    expect(extractAnchors(editor.state.doc).anchors.get('t1')!.text).toBe('Toinen');

    // A repeated phrase goes to the occurrence nearest the old offset
    const repeated: DocComments = { hash: 'x', threads: [thread('t2', 'Sama lause.', 30)] };
    applyComments(editor, repeated);
    expect(extractAnchors(editor.state.doc).anchors.get('t2')!.start).toBe(31);
  });

  it('removes an anchor', () => {
    make('Teksti tässä.');
    select('Teksti');
    addAnchor(editor, 't1', 'comment');
    removeAnchor(editor, 't1');
    expect(extractAnchors(editor.state.doc).anchors.size).toBe(0);
  });
});

describe('comment helpers', () => {
  it('locates quotes', () => {
    expect(locateQuote('a b a b', 'b', -1)).toBe(-1);
    expect(locateQuote('a b a b', 'b', 5)).toBe(6);
    expect(locateQuote('a b c', 'c', -1)).toBe(4);
    expect(locateQuote('a b c', 'd', 0)).toBe(-1);
  });

  it('names bookmarks from their text', () => {
    expect(bookmarkLabel('Yksi kaksi')).toBe('Yksi kaksi');
    expect(bookmarkLabel('yksi kaksi kolme neljä viisi kuusi seitsemän')).toBe('yksi kaksi kolme neljä viisi kuusi…');
  });
});

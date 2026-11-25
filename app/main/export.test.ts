import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { OpenProject } from '../shared/types';
import { footnoteEnd, parseInline, runsToPlain } from '../shared/markdownLite';
import { SOFT_HYPHEN, hyphenateText } from '../shared/hyphenate';
import { toDocx, toEpub, toHtml, toManuscriptDocx, toPlainText } from './export';
import { hyphenator } from './language';

const project = (bodies: string[]): OpenProject =>
  ({
    path: '/x',
    manifest: {
      id: 'p',
      title: 'Viitteet',
      author: 'Kirjoittaja',
      language: 'fi',
      structure: bodies.map((_, i) => ({ id: `c${i}`, type: 'chapter', title: `Luku ${i + 1}`, file: `manuscript/c${i}.md` }))
    },
    docs: Object.fromEntries(bodies.map((body, i) => [`c${i}`, { meta: { id: `c${i}`, title: `Luku ${i + 1}` }, body }])),
    bible: {}
  }) as unknown as OpenProject;

describe('footnotes in Markdown', () => {
  it('finds the end of a note with nested and escaped brackets', () => {
    expect(footnoteEnd('^[a [b] c] loput')).toBe(10);
    expect(footnoteEnd('^[a \\] b] x')).toBe(9);
    expect(footnoteEnd('^[kesken')).toBe(-1);
    expect(footnoteEnd('[ei viite]')).toBe(-1);
  });

  it('parses notes, also inside emphasis', () => {
    const runs = parseInline('Hän *lähti^[Vuonna *1918*.] pois* heti.');
    expect(runs).toEqual([
      { text: 'Hän ' },
      { text: 'lähti', italic: true },
      { text: '', note: [{ text: 'Vuonna ' }, { text: '1918', italic: true }, { text: '.' }] },
      { text: ' pois', italic: true },
      { text: ' heti.' }
    ]);
    expect(runsToPlain(runs)).toBe('Hän lähti pois heti.');
    expect(runsToPlain(parseInline('a^[b \\[c\\]]'), n => `(${runsToPlain(n)})`)).toBe('a(b [c])');
  });
});

describe('footnotes in exports', () => {
  const book = project(['Ensimmäinen^[Eka viite.] lause.', 'Toinen^[Toka *viite*.] lause.']);

  it('Word: real footnotes', async () => {
    for (const buffer of [await toDocx(book), await toManuscriptDocx(book)]) {
      const zip = await JSZip.loadAsync(buffer);
      const notes = await zip.file('word/footnotes.xml')!.async('string');
      expect(notes).toContain('Eka viite.');
      expect(notes).toContain('Toka ');
      const doc = await zip.file('word/document.xml')!.async('string');
      expect(doc.match(/w:footnoteReference/g)).toHaveLength(2);
      expect(doc).not.toContain('Eka viite');
    }
  });

  it('EPUB: numbered pop-up notes after each chapter', async () => {
    const zip = await JSZip.loadAsync(await toEpub(book));
    const c1 = await zip.file('OEBPS/chapter-1.xhtml')!.async('string');
    const c2 = await zip.file('OEBPS/chapter-2.xhtml')!.async('string');
    expect(c1).toContain('<a epub:type="noteref" href="#fn-1" id="ref-1">1</a>');
    expect(c1).toContain('<aside epub:type="footnote" class="footnote" id="fn-1">');
    // Numbering continues across chapters
    expect(c2).toContain('href="#fn-2"');
    expect(c2).toContain('Toka <em>viite</em>.');
  });

  it('HTML and text: endnotes', () => {
    const html = toHtml(book);
    expect(html).toContain('<sup class="fn"><a href="#fn-1" id="ref-1">1</a></sup>');
    expect(html).toMatch(/<section class="notes">[\s\S]*Eka viite\.[\s\S]*Toka <em>viite<\/em>/);
    const txt = toPlainText(book);
    expect(txt).toContain('Ensimmäinen[1] lause.');
    expect(txt).toContain('VIITTEET\n\n[1] Eka viite.\n[2] Toka viite.');
  });

  it('print HTML is a book layout', () => {
    const html = toHtml(book, { print: true });
    expect(html).toContain('@page { size: A5; }');
    expect(html).toContain('class="title-page"');
  });
});

describe('hyphenation', () => {
  it('adds soft hyphens without changing the letters', async () => {
    const hyphenate = await hyphenator();
    expect(hyphenate).not.toBeNull();
    const text = 'Kirjoituspöydän ääressä hän mietti, ettei vaa’an tasapaino riitä.';
    const out = hyphenateText(text, hyphenate!);
    expect(out.replaceAll(SOFT_HYPHEN, '')).toBe(text);
    expect(out).toContain(`Kir${SOFT_HYPHEN}joi${SOFT_HYPHEN}tus${SOFT_HYPHEN}pöy${SOFT_HYPHEN}dän`);
    // Short words are left alone
    expect(out).toContain(' hän ');
  });

  it('is used by typeset exports only when asked', async () => {
    const hyphenate = await hyphenator();
    const book = project(['Kirjoituspöydän ääressä.']);
    const withHyphens = await JSZip.loadAsync(await toDocx(book, { hyphenate }));
    expect(await withHyphens.file('word/document.xml')!.async('string')).toContain(SOFT_HYPHEN);
    const plain = await JSZip.loadAsync(await toDocx(book));
    expect(await plain.file('word/document.xml')!.async('string')).not.toContain(SOFT_HYPHEN);
    expect(toHtml(book, { hyphenate })).not.toContain(SOFT_HYPHEN);
    expect(toHtml(book, { hyphenate, print: true })).toContain(SOFT_HYPHEN);
  });
});

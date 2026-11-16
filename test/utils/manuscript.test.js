/**
 * @jest-environment node
 */
const JSZip = require('jszip');
const {
  parseInline,
  parseBlocks,
  collectChapters,
  buildManuscript,
  toPlainText,
  toMarkdown,
  toHTML,
  toRTF,
  toDocx,
  toEPUB,
  splitIntoChapters,
  docxToMarkdown,
  importDocument,
  textStatistics
} = require('../../utils/manuscript');

const project = {
  title: 'Sateen <kirja> & muut',
  author: 'Aino Älvä',
  language: 'fi',
  structure: [
    {
      id: 'c1',
      type: 'chapter',
      title: 'Ensimmäinen luku',
      content: [
        'Kissa istui **ikkunalla** ja _katseli_ sadetta.',
        'Toinen kappale, jossa on <u>alleviivaus</u> ja ~~poisto~~.',
        '',
        '* * *',
        '',
        '## Väliotsikko',
        '> Lainattu ajatus.',
        '- yksi',
        '- kaksi',
        '1. eka',
        '2. toka'
      ].join('\n'),
      children: [
        { id: 'c1a', type: 'scene', title: 'Kohtaus', content: 'Sisäkkäinen kohtaus {aaltosulkeet} \\ kenoviiva.' }
      ]
    },
    { id: 'c2', type: 'chapter', title: 'Toinen luku', content: 'Yksi rivi.\nToinen rivi.' },
    { id: 'f1', type: 'folder', title: 'Tyhjä kansio', content: '' }
  ]
};

describe('parseInline', () => {
  test('recognises bold, italic, underline and strikethrough', () => {
    expect(parseInline('a **b** _c_ *d* <u>e</u> ~~f~~ g')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', italic: true },
      { text: ' ' },
      { text: 'e', underline: true },
      { text: ' ' },
      { text: 'f', strike: true },
      { text: ' g' }
    ]);
  });

  test('nests styles', () => {
    expect(parseInline('**lihava ja _kursiivi_**')).toEqual([
      { text: 'lihava ja ', bold: true },
      { text: 'kursiivi', bold: true, italic: true }
    ]);
  });

  test('leaves snake_case, arithmetic and loose markers alone', () => {
    expect(parseInline('muuttuja_nimi_tässä')).toEqual([{ text: 'muuttuja_nimi_tässä' }]);
    expect(parseInline('2 * 3 * 4')).toEqual([{ text: '2 * 3 * 4' }]);
    expect(parseInline('** ei lihava**')).toEqual([{ text: '** ei lihava**' }]);
  });

  test('handles escapes and Finnish letters next to markers', () => {
    expect(parseInline('\\*tähti\\* ja _ääkköset_')).toEqual([
      { text: '*tähti* ja ' },
      { text: 'ääkköset', italic: true }
    ]);
  });
});

describe('parseBlocks', () => {
  test('parses headings, quotes, lists, breaks and paragraphs', () => {
    const blocks = parseBlocks(project.structure[0].content);
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'paragraph', 'break', 'heading', 'quote', 'list', 'list']);
    expect(blocks[3].level).toBe(2);
    expect(blocks[5]).toMatchObject({ ordered: false });
    expect(blocks[5].items).toHaveLength(2);
    expect(blocks[6]).toMatchObject({ ordered: true });
  });

  test('treats ---, *** and * * * as scene breaks, not as lists', () => {
    expect(parseBlocks('---\n***\n* * *').map(b => b.type)).toEqual(['break', 'break', 'break']);
  });

  test('handles empty and missing text', () => {
    expect(parseBlocks('')).toEqual([]);
    expect(parseBlocks(undefined)).toEqual([]);
    expect(parseBlocks('\r\n\r\n')).toEqual([]);
  });
});

describe('collectChapters', () => {
  test('walks nested structure in order and skips empty folders', () => {
    expect(collectChapters(project).map(c => c.id)).toEqual(['c1', 'c1a', 'c2']);
  });

  test('can pick a single chapter', () => {
    expect(collectChapters(project, { chapterId: 'c2' }).map(c => c.title)).toEqual(['Toinen luku']);
  });

  test('survives a project without structure', () => {
    expect(collectChapters({})).toEqual([]);
    expect(collectChapters(null)).toEqual([]);
  });
});

describe('text exports', () => {
  const manuscript = buildManuscript(project);

  test('plain text drops the markers', () => {
    const text = toPlainText(manuscript);
    expect(text).toContain('SATEEN <KIRJA> & MUUT');
    expect(text).toContain('Kissa istui ikkunalla ja katseli sadetta.');
    expect(text).not.toMatch(/\*\*|~~|<u>/);
    expect(text).toContain('1. eka');
  });

  test('markdown keeps the markers and adds chapter headings', () => {
    const md = toMarkdown(manuscript);
    expect(md).toContain('# Sateen <kirja> & muut');
    expect(md).toContain('## Ensimmäinen luku');
    expect(md).toContain('**ikkunalla**');
  });

  test('html escapes text and renders formatting', () => {
    const html = toHTML(manuscript);
    expect(html).toContain('<title>Sateen &lt;kirja&gt; &amp; muut</title>');
    expect(html).toContain('<strong>ikkunalla</strong>');
    expect(html).toContain('<em>katseli</em>');
    expect(html).toContain('<u>alleviivaus</u>');
    expect(html).toContain('<s>poisto</s>');
    expect(html).toContain('<ol><li>eka</li><li>toka</li></ol>');
    expect(html).toContain('<blockquote><p>Lainattu ajatus.</p></blockquote>');
    // First paragraph is not indented, the following one is
    expect(html).toContain('<p class="first">Kissa istui');
    expect(html).toContain('<p>Toinen kappale');
  });

  test('a single chapter is exported without the title page', () => {
    const html = toHTML(buildManuscript(project, { chapterId: 'c2' }));
    expect(html).not.toContain('<section class="title-page">');
    expect(html).toContain('<h1 class="chapter-title">Toinen luku</h1>');
  });

  test('rtf escapes braces, backslashes and non-ASCII characters', () => {
    const rtf = toRTF(manuscript);
    expect(rtf.startsWith('{\\rtf1')).toBe(true);
    expect(rtf.trimEnd().endsWith('}')).toBe(true);
    expect(rtf).toContain('\\{aaltosulkeet\\}');
    expect(rtf).toContain('\\\\ kenoviiva');
    expect(rtf).toContain('Ensimm\\u228?inen luku');
    expect(rtf).toContain('{\\b ikkunalla}');
    // Nothing above 7-bit may remain
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7f]/.test(rtf)).toBe(false);
    // Braces are balanced once escapes are ignored
    const bare = rtf.replace(/\\[\\{}]/g, '');
    expect(bare.split('{').length).toBe(bare.split('}').length);
  });
});

describe('docx', () => {
  test('produces a real Word package that reads back with its formatting', async () => {
    const buffer = await toDocx(buildManuscript(project));
    expect(buffer.slice(0, 2).toString()).toBe('PK');

    const zip = await JSZip.loadAsync(buffer);
    expect(zip.file('word/document.xml')).not.toBeNull();
    expect(zip.file('[Content_Types].xml')).not.toBeNull();

    const markdown = await docxToMarkdown(buffer);
    expect(markdown).toContain('# Ensimmäinen luku');
    expect(markdown).toContain('**ikkunalla**');
    expect(markdown).toContain('_katseli_');
    expect(markdown).toContain('<u>alleviivaus</u>');
    expect(markdown).toContain('~~poisto~~');
    expect(markdown).toContain('Sisäkkäinen kohtaus {aaltosulkeet} \\ kenoviiva.');
  });

  test('import splits a Word file into chapters at its headings', async () => {
    const buffer = await toDocx(buildManuscript(project));
    const imported = await importDocument(buffer, '/tmp/Käsikirjoitus.docx');
    expect(imported.title).toBe('Käsikirjoitus');
    expect(imported.chapters.map(c => c.title)).toEqual(
      expect.arrayContaining(['Ensimmäinen luku', 'Kohtaus', 'Toinen luku'])
    );
    const second = imported.chapters.find(c => c.title === 'Toinen luku');
    expect(second.content).toBe('Yksi rivi.\nToinen rivi.');
  });

  test('rejects a file that is not a Word document', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'hei');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    await expect(docxToMarkdown(buffer)).rejects.toThrow('Word');
  });
});

describe('epub', () => {
  test('is a valid container: mimetype first and stored, package and chapters present', async () => {
    const buffer = await toEPUB(buildManuscript(project), { identifier: 'urn:uuid:test', now: new Date('2026-01-01T00:00:00Z') });

    // Local file header of the first entry: name "mimetype", compression method 0
    expect(buffer.slice(0, 4).toString('hex')).toBe('504b0304');
    expect(buffer.readUInt16LE(8)).toBe(0);
    expect(buffer.slice(30, 38).toString()).toBe('mimetype');
    expect(buffer.slice(38, 58).toString()).toBe('application/epub+zip');

    const zip = await JSZip.loadAsync(buffer);
    const opf = await zip.file('OEBPS/content.opf').async('string');
    expect(opf).toContain('<dc:title>Sateen &lt;kirja&gt; &amp; muut</dc:title>');
    expect(opf).toContain('<dc:creator>Aino Älvä</dc:creator>');
    expect(opf).toContain('2026-01-01T00:00:00Z');
    expect(opf).toContain('properties="nav"');

    expect(zip.file('META-INF/container.xml')).not.toBeNull();
    expect(zip.file('OEBPS/nav.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/toc.ncx')).not.toBeNull();

    const chapter = await zip.file('OEBPS/chapter-1.xhtml').async('string');
    expect(chapter).toContain('<strong>ikkunalla</strong>');
    expect(chapter).toContain('<h2>Ensimmäinen luku</h2>');
    // Three chapters with text
    expect(zip.file('OEBPS/chapter-3.xhtml')).not.toBeNull();
    expect(zip.file('OEBPS/chapter-4.xhtml')).toBeNull();
  });

  test('works without an author', async () => {
    const buffer = await toEPUB(buildManuscript({ title: 'T', structure: [{ id: 'a', title: 'A', content: 'x' }] }));
    const zip = await JSZip.loadAsync(buffer);
    const opf = await zip.file('OEBPS/content.opf').async('string');
    expect(opf).not.toContain('dc:creator');
  });
});

describe('import', () => {
  test('splits Markdown at its top-level headings', () => {
    const result = splitIntoChapters('Esipuhe.\n\n# Yksi\nA\n\n## Ali\nB\n\n# Kaksi\nC\n', 'kirja.md');
    expect(result.chapters).toEqual([
      { title: 'kirja', content: 'Esipuhe.' },
      { title: 'Yksi', content: 'A\n\n## Ali\nB' },
      { title: 'Kaksi', content: 'C' }
    ]);
  });

  test('uses the highest heading level that exists', () => {
    const result = splitIntoChapters('## Eka\nA\n## Toka\nB', 'x.txt');
    expect(result.chapters.map(c => c.title)).toEqual(['Eka', 'Toka']);
  });

  test('text without headings becomes one chapter named after the file', () => {
    const result = splitIntoChapters('﻿Pelkkää tekstiä.\r\nToinen rivi.', '/polku/Novelli.txt');
    expect(result.chapters).toEqual([{ title: 'Novelli', content: 'Pelkkää tekstiä.\nToinen rivi.' }]);
  });

  test('importDocument reads text files and rejects unknown formats', async () => {
    const result = await importDocument(Buffer.from('# A\nteksti', 'utf-8'), 'a.md');
    expect(result.chapters).toEqual([{ title: 'A', content: 'teksti' }]);
    await expect(importDocument(Buffer.from('x'), 'kuva.png')).rejects.toThrow('.png');
  });
});

describe('textStatistics', () => {
  test('counts words and characters without the markers', () => {
    expect(textStatistics('Kissa **istui** ikkunalla.\n\n# Otsikko')).toEqual({
      words: 4,
      characters: 'Kissa istui ikkunalla.Otsikko'.length,
      charactersNoSpaces: 'Kissaistuiikkunalla.Otsikko'.length,
      paragraphs: 1
    });
  });

  test('empty text is zero everything', () => {
    expect(textStatistics('')).toEqual({ words: 0, characters: 0, charactersNoSpaces: 0, paragraphs: 0 });
  });
});

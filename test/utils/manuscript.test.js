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
  textStatistics,
  decodeText
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

  // The export dialog says "N lukua, joista M tyhjä jätetään pois": the main process has to do the same
  describe('chapters without text', () => {
    const withEmpty = {
      title: 'Lumen alla',
      structure: [
        { id: 'a', type: 'chapter', title: 'Alku', content: 'Lumi satoi.' },
        { id: 'tyhja', type: 'chapter', title: 'Kirjoittamaton luku', content: '' },
        { id: 'valit', type: 'chapter', title: 'Vain rivinvaihtoja', content: ' \n\t\n ' },
        { id: 'puuttuu', type: 'chapter', title: 'Luonnos ilman kappaleita' },
        {
          id: 'osa', type: 'chapter', title: 'Osan otsikko', content: '',
          children: [{ id: 'kohtaus', type: 'scene', title: 'Kohtaus', content: 'Sisällä oli lämmin.' }]
        },
        { id: 'z', type: 'chapter', title: 'Loppu', content: 'Kevät tuli.' }
      ]
    };
    // Titles without ä and ö, so that the same string can be looked for in RTF too (ä is \u228? there)
    const emptyTitles = ['Kirjoittamaton luku', 'Vain rivinvaihtoja', 'Luonnos ilman kappaleita', 'Osan otsikko'];

    test('are left out of the whole manuscript, their written children are kept', () => {
      expect(collectChapters(withEmpty).map(c => c.id)).toEqual(['a', 'kohtaus', 'z']);
    });

    test('are left out also when asked for by id', () => {
      expect(collectChapters(withEmpty, { chapterIds: ['a', 'tyhja', 'valit'] }).map(c => c.id)).toEqual(['a']);
      expect(collectChapters(withEmpty, { chapterId: 'tyhja' })).toEqual([]);
    });

    test('leave no heading in any export format', async () => {
      const book = buildManuscript(withEmpty);
      expect(book.chapters.map(c => c.title)).toEqual(['Alku', 'Kohtaus', 'Loppu']);

      const texts = [toPlainText(book), toMarkdown(book), toHTML(book), toRTF(book)];
      const docx = await JSZip.loadAsync(await toDocx(book));
      texts.push(await docx.file('word/document.xml').async('string'));
      const epub = await JSZip.loadAsync(await toEPUB(book));
      // The book's files as one text: chapter pages, table of contents and package file
      const epubParts = [];
      for (const name of Object.keys(epub.files)) {
        if (/\.(xhtml|ncx|opf)$/.test(name)) epubParts.push(await epub.file(name).async('string'));
      }
      expect(epubParts.length).toBeGreaterThan(3);
      texts.push(epubParts.join('\n'));

      for (const text of texts) {
        expect(text).toContain('Lumi satoi.');
        expect(text).toContain('Loppu');
        for (const title of emptyTitles) expect(text).not.toContain(title);
      }
    });

    test('the whole book with one written chapter is still a book with its title page', () => {
      const book = buildManuscript({
        title: 'Lumen alla',
        structure: [
          { id: 'a', type: 'chapter', title: 'Alku', content: 'Lumi satoi.' },
          { id: 'b', type: 'chapter', title: 'Kirjoittamaton luku', content: '' }
        ]
      });
      expect(book.chapters.map(c => c.id)).toEqual(['a']);
      expect(book.single).toBe(false);
      expect(toMarkdown(book)).toContain('# Lumen alla');
    });

    test('a project with only unwritten chapters has nothing to export', () => {
      expect(buildManuscript({ title: 'Uusi', structure: [{ id: 'a', type: 'chapter', title: 'Luku 1', content: '' }] }).chapters).toEqual([]);
    });
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
    // Lists come back as lists
    expect(markdown).toContain('- yksi\n- kaksi');
    expect(markdown).toContain('1. eka\n2. toka');
  });

  test('import splits a Word file into chapters at its headings', async () => {
    const buffer = await toDocx(buildManuscript(project));
    const imported = await importDocument(buffer, '/tmp/Käsikirjoitus.docx');
    // The Word title and the author line are metadata, not chapters
    expect(imported.title).toBe(project.title);
    expect(imported.author).toBe(project.author);
    expect(imported.chapters.map(c => c.title)).toEqual(['Ensimmäinen luku', 'Kohtaus', 'Toinen luku']);
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
      { title: 'Yksi', content: 'A\n\n# Ali\nB' },
      { title: 'Kaksi', content: 'C' }
    ]);
  });

  test('a single top heading followed by chapter headings is the book title', () => {
    const result = splitIntoChapters('# Sateen kirja\n\n*Aino Älvä*\n\n## Eka\nA\n\n## Toka\nB\n', 'tiedosto.md');
    expect(result.title).toBe('Sateen kirja');
    expect(result.author).toBe('Aino Älvä');
    expect(result.chapters).toEqual([
      { title: 'Eka', content: 'A' },
      { title: 'Toka', content: 'B' }
    ]);
  });

  test('longer text before the first chapter is kept as its own chapter', () => {
    const result = splitIntoChapters('# Kirja\n\nTämä on esipuhe, jossa on selvästi enemmän kuin muutama sana tekstiä.\n\n## Eka\nA\n\n## Toka\nB', 'x.md');
    expect(result.title).toBe('Kirja');
    expect(result.author).toBe('');
    expect(result.chapters.map(c => c.title)).toEqual(['Alkusivut', 'Eka', 'Toka']);
  });

  test('exporting to Markdown and importing it back gives the same chapters', () => {
    const back = splitIntoChapters(toMarkdown(buildManuscript(project)), 'x.md');
    expect(back.title).toBe(project.title);
    expect(back.author).toBe(project.author);
    expect(back.chapters.map(c => c.title)).toEqual(['Ensimmäinen luku', 'Kohtaus', 'Toinen luku']);
    // The heading inside the first chapter comes back at its original level
    expect(back.chapters[0].content).toContain('\n## Väliotsikko\n');
    expect(toMarkdown(buildManuscript(project))).toContain('#### Väliotsikko');
  });

  test('uses the highest heading level that exists', () => {
    const result = splitIntoChapters('## Eka\nA\n## Toka\nB', 'x.txt');
    expect(result.chapters.map(c => c.title)).toEqual(['Eka', 'Toka']);
  });

  test('text without headings becomes one chapter named after the file', () => {
    const result = splitIntoChapters('﻿Pelkkää tekstiä.\r\nToinen rivi.', '/polku/Novelli.txt');
    expect(result.chapters).toEqual([{ title: 'Novelli', content: 'Pelkkää tekstiä.\nToinen rivi.' }]);
    expect(result.title).toBe('Novelli');
  });

  test('importDocument reads text files and rejects unknown formats', async () => {
    const result = await importDocument(Buffer.from('# A\nteksti', 'utf-8'), 'a.md');
    expect(result.chapters).toEqual([{ title: 'A', content: 'teksti' }]);
    await expect(importDocument(Buffer.from('x'), 'kuva.png')).rejects.toThrow('.png');
  });
});

// Folder import (stage I-01): every file is one chapter
describe('import: one chapter per file', () => {
  const one = (text, file, known) => splitIntoChapters(text, file, known || {}, { oneChapterPerFile: true });
  const SCENES = '# Saapuminen\n\nTeksti.\n\n## Laiturilla\nA\n\n## Talossa\nB\n';

  test('a chapter file with scene headings stays one chapter and keeps its title', () => {
    expect(one(SCENES, '3 Saapuminen [12].md')).toEqual({
      title: 'Saapuminen',
      author: '',
      chapters: [{ title: 'Saapuminen', content: 'Teksti.\n\n# Laiturilla\nA\n\n# Talossa\nB', titleFrom: 'heading' }]
    });
  });

  test('the same file without the option is still read as book title plus chapters', () => {
    const result = splitIntoChapters(SCENES, '3 Saapuminen [12].md');
    expect(result.title).toBe('Saapuminen');
    expect(result.author).toBe('Teksti.');
    expect(result.chapters.map(c => c.title)).toEqual(['Laiturilla', 'Talossa']);
  });

  test('several top-level headings: the title comes from the file name and every heading stays', () => {
    const result = one('# Laiturilla\nA\n\n# Talossa\nB\n', '3 Saapuminen [12].md');
    expect(result.title).toBe('3 Saapuminen [12]');
    expect(result.chapters).toEqual([{ title: '3 Saapuminen [12]', content: '# Laiturilla\nA\n\n# Talossa\nB', titleFrom: 'file' }]);
  });

  test('dialogue dash, list dash, [TODO: …] and <u> come through unchanged', () => {
    const input = '– Tule, sanoi Aino.\n\n- Hei, sanoi Pekka.\n\n[TODO: tarkista lautan aikataulu]\n\nHän <u>juoksi</u> ”kotiin” – ja jäi.\n';
    const result = one(input, '1 Alku [10].txt');
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].titleFrom).toBe('file');
    expect(result.chapters[0].content).toBe(input.slice(0, -1));
  });

  test('an empty file is one chapter with empty content', () => {
    const result = one('\n\n   \n', '5 Tyhjä [3].txt');
    expect(result.chapters).toEqual([{ title: '5 Tyhjä [3]', content: '', titleFrom: 'file' }]);
    expect(result.title).toBe('5 Tyhjä [3]');
  });

  test('a heading that is not on the first filled line is not the title', () => {
    const text = 'Johdanto.\n\n# Otsikko keskellä\n\nTeksti.';
    const result = one(text, 'a.txt');
    expect(result.title).toBe('a');
    expect(result.chapters).toEqual([{ title: 'a', content: text, titleFrom: 'file' }]);
  });

  test('a lone lower-level heading is the title and deeper headings move up', () => {
    const result = one('## Yö\n\n### Uni\nA\n', 'a.md');
    expect(result.title).toBe('Yö');
    expect(result.chapters).toEqual([{ title: 'Yö', content: '# Uni\nA', titleFrom: 'heading' }]);
  });

  test('a Word title wins over the first heading, which stays in the text', () => {
    const result = one('# Luku\n\nTeksti.', 'a.docx', { title: 'Asiakirjan nimi' });
    expect(result.title).toBe('Asiakirjan nimi');
    expect(result.chapters).toEqual([{ title: 'Asiakirjan nimi', content: '# Luku\n\nTeksti.', titleFrom: 'document' }]);
  });

  test('#hashtag is not a heading', () => {
    const text = '#hashtag ei ole otsikko\nTeksti.';
    const result = one(text, 'b.txt');
    expect(result.title).toBe('b');
    expect(result.chapters).toEqual([{ title: 'b', content: text, titleFrom: 'file' }]);
  });

  test('byte order mark, CRLF and decomposed ä are normalised', () => {
    // U+FEFF, then "Äiti" with a decomposed Ä (A + U+0308)
    const result = one('﻿Äiti tuli.\r\nToinen rivi.\r\n\r\n\r\n\r\nKolmas.', '/polku/2 Äiti [11].txt');
    const { content } = result.chapters[0];
    expect(content).toBe('Äiti tuli.\nToinen rivi.\n\nKolmas.');
    expect(content.startsWith('Ä')).toBe(true);
  });

  // Brief 3.1 / contract H: NFC on both import paths, also for the titles a file name or Word gives
  test('titles from a decomposed file name or Word title are NFC, with and without the option', () => {
    const A = 'A' + String.fromCharCode(0x308);            // Ä as A + combining diaeresis
    const file = `/polku/${A}iti.txt`;
    const nfcTitle = 'Äiti';

    const single = splitIntoChapters('Teksti ilman otsikkoa.', file);
    expect(single.title).toBe(nfcTitle);
    expect(single.chapters[0].title).toBe(nfcTitle);
    expect(single.chapters[0].title).toHaveLength(4);

    const perFile = one('Teksti ilman otsikkoa.', file);
    expect(perFile.title).toBe(nfcTitle);
    expect(perFile.chapters[0]).toEqual({ title: nfcTitle, content: 'Teksti ilman otsikkoa.', titleFrom: 'file' });

    const known = { title: `${A}idin kirja` };
    expect(splitIntoChapters('# Luku\n\nTeksti.', 'a.docx', known).title).toBe('Äidin kirja');
    expect(one('# Luku\n\nTeksti.', 'a.docx', known).chapters[0].title).toBe('Äidin kirja');
  });

  test('a heading with nothing after it gives an empty chapter with that title', () => {
    expect(one('# Yksin', 'c.md').chapters).toEqual([{ title: 'Yksin', content: '', titleFrom: 'heading' }]);
  });

  test('inline markers are removed from a heading used as the title', () => {
    const result = one('# **Lihava** otsikko\n\nTeksti', 'c.md');
    expect(result.title).toBe('Lihava otsikko');
    expect(result.chapters[0].title).toBe('Lihava otsikko');
  });

  test('importDocument passes the option through for text and Word files', async () => {
    const md = await importDocument(Buffer.from(SCENES, 'utf-8'), '3 Saapuminen [12].md', { oneChapterPerFile: true });
    expect(md.chapters).toHaveLength(1);
    expect(md.chapters[0]).toEqual({ title: 'Saapuminen', content: 'Teksti.\n\n# Laiturilla\nA\n\n# Talossa\nB', titleFrom: 'heading' });

    const docx = await importDocument(await toDocx(buildManuscript(project)), 'Käsikirjoitus.docx', { oneChapterPerFile: true });
    expect(docx.chapters).toHaveLength(1);
    expect(docx.chapters[0].title).toBe(project.title);
    expect(docx.chapters[0].titleFrom).toBe('document');
    // Without the option the same Word file is three chapters
    expect((await importDocument(await toDocx(buildManuscript(project)), 'Käsikirjoitus.docx')).chapters).toHaveLength(3);
  });
});

describe('decodeText', () => {
  const SENTENCE = 'Äiti sanoi: ”Tule” – ja öljy, Åke.';

  test('reads UTF-8 with ä ö å, ” and –', () => {
    expect(decodeText(Buffer.from(SENTENCE, 'utf-8'))).toEqual({ text: SENTENCE, encoding: 'utf-8' });
  });

  test('removes a UTF-8 byte order mark', () => {
    const buffer = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('Äiti', 'utf-8')]);
    expect(decodeText(buffer)).toEqual({ text: 'Äiti', encoding: 'utf-8' });
  });

  test('reads UTF-16 by its byte order mark, both byte orders', () => {
    const little = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from('Äiti – ö', 'utf16le')]);
    expect(decodeText(little)).toEqual({ text: 'Äiti – ö', encoding: 'utf-16le' });

    const swapped = Buffer.from('Äiti – ö', 'utf16le').swap16();
    const big = Buffer.concat([Buffer.from([0xFE, 0xFF]), swapped]);
    expect(decodeText(big)).toEqual({ text: 'Äiti – ö', encoding: 'utf-16be' });
  });

  test('falls back to Windows-1252 and maps ” – … to the right characters', () => {
    const bytes = Buffer.from([0xC4, 0x69, 0x74, 0x69, 0x20, 0x94, 0x68, 0x65, 0x69, 0x94, 0x20, 0x96, 0x20, 0xF6, 0xE5, 0x85]);
    expect(decodeText(bytes)).toEqual({ text: 'Äiti ”hei” – öå…', encoding: 'windows-1252' });
  });

  test('an empty buffer is empty text', () => {
    expect(decodeText(Buffer.alloc(0))).toEqual({ text: '', encoding: 'utf-8' });
    expect(decodeText(undefined)).toEqual({ text: '', encoding: 'utf-8' });
  });

  test('importDocument reports the encoding of a text file', async () => {
    // "Äiti – ö" in Windows-1252
    const buffer = Buffer.from([0xC4, 0x69, 0x74, 0x69, 0x20, 0x96, 0x20, 0xF6]);
    const result = await importDocument(buffer, 'a.txt');
    expect(result.encoding).toBe('windows-1252');
    expect(result.chapters[0].content).toBe('Äiti – ö');
    expect(result.chapters[0].content).not.toMatch(/[�\u0080-\u009F]/);
    // A Word file has no encoding of its own
    expect(await importDocument(await toDocx(buildManuscript(project)), 'x.docx')).not.toHaveProperty('encoding');
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

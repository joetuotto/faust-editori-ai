/**
 * Manuscript conversion
 *
 * FAUST stores each chapter as plain text with Markdown-style markers
 * (**bold**, _italic_, <u>underline</u>, ~~strikethrough~~, # headings,
 * > quotes, - lists, * * * scene breaks). This module turns that text into
 * document formats and back:
 *
 *   export: txt, md, html, rtf, docx, epub (pdf and print reuse the HTML)
 *   import: txt, md, docx
 *
 * Pure Node code with no Electron dependency, so it is unit-tested directly.
 */

const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat } = require('docx');
const JSZip = require('jszip');

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const WORD_CHAR = 'A-Za-z0-9À-ÖØ-öø-ÿ';

// The first well-formed inline span. Markers must hug the text they wrap
// ("** bold**" is not bold) and _ only counts at word boundaries, so
// snake_case and "2 * 3 * 4" are left alone.
const INLINE_SPAN = new RegExp(
  [
    '(\\*\\*|__)(?=\\S)([\\s\\S]+?)(?<=\\S)\\1',                                   // 1,2 bold
    `(?<![${WORD_CHAR}_])_(?=\\S)([^_]+?)(?<=\\S)_(?![${WORD_CHAR}_])`,             // 3 italic _
    '(?<!\\*)\\*(?=[^\\s*])([^*]+?)(?<=[^\\s*])\\*(?!\\*)',                          // 4 italic *
    '~~(?=\\S)([\\s\\S]+?)(?<=\\S)~~',                                              // 5 strike
    '<u>([\\s\\S]+?)</u>'                                                            // 6 underline
  ].join('|')
);

// Backslash escapes (\* \_ \# \~ \> \\) are swapped for private-use
// characters while spans are matched, so an escaped marker never opens a span
const ESCAPABLE = '*_#~>\\';
const ESCAPE_BASE = 0xe000;
const protectEscapes = (text) => text.replace(/\\([*_#~>\\])/g, (_m, char) => String.fromCharCode(ESCAPE_BASE + ESCAPABLE.indexOf(char)));
const restoreEscapes = (text) => text.replace(/[\ue000-\ue005]/g, (char) => ESCAPABLE[char.charCodeAt(0) - ESCAPE_BASE]);

/**
 * Split a line of text into formatted runs.
 * @returns {Array<{text: string, bold?: boolean, italic?: boolean, underline?: boolean, strike?: boolean}>}
 */
function parseInline(text) {
  return parseSpans(protectEscapes(String(text || '')))
    .map(run => ({ ...run, text: restoreEscapes(run.text) }))
    .filter(run => run.text.length > 0);
}

function parseSpans(text, style = {}) {
  const runs = [];
  let rest = text;

  while (rest.length > 0) {
    const match = INLINE_SPAN.exec(rest);
    if (!match) {
      runs.push({ ...style, text: rest });
      break;
    }

    if (match.index > 0) {
      runs.push({ ...style, text: rest.slice(0, match.index) });
    }

    if (match[2] !== undefined) runs.push(...parseSpans(match[2], { ...style, bold: true }));
    else if (match[3] !== undefined) runs.push(...parseSpans(match[3], { ...style, italic: true }));
    else if (match[4] !== undefined) runs.push(...parseSpans(match[4], { ...style, italic: true }));
    else if (match[5] !== undefined) runs.push(...parseSpans(match[5], { ...style, strike: true }));
    else if (match[6] !== undefined) runs.push(...parseSpans(match[6], { ...style, underline: true }));

    rest = rest.slice(match.index + match[0].length);
  }

  return runs;
}

const runsToText = (runs) => runs.map(run => run.text).join('');

const SCENE_BREAK = /^\s*([-*_])(\s*\1){2,}\s*$/;

/**
 * Parse chapter text into blocks.
 * Every non-empty line is its own paragraph; blank lines only separate.
 */
function parseBlocks(text) {
  const blocks = [];
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    let match;
    if (SCENE_BREAK.test(line)) {
      blocks.push({ type: 'break' });
    } else if ((match = /^(#{1,6})\s+(.*)$/.exec(line))) {
      blocks.push({ type: 'heading', level: match[1].length, runs: parseInline(match[2].trim()) });
    } else if ((match = /^>\s?(.*)$/.exec(line))) {
      blocks.push({ type: 'quote', runs: parseInline(match[1]) });
    } else if ((match = /^\s*[-*+]\s+(.*)$/.exec(line))) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'list' && !last.ordered) last.items.push(parseInline(match[1]));
      else blocks.push({ type: 'list', ordered: false, items: [parseInline(match[1])] });
    } else if ((match = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'list' && last.ordered) last.items.push(parseInline(match[1]));
      else blocks.push({ type: 'list', ordered: true, items: [parseInline(match[1])] });
    } else {
      blocks.push({ type: 'paragraph', runs: parseInline(line.trim()) });
    }
  }

  return blocks;
}

/**
 * Chapters of a project in reading order (nested children included).
 * options.chapterId or options.chapterIds limit the result to those chapters.
 * @returns {Array<{id: string, title: string, content: string}>}
 */
function collectChapters(project, { chapterId = null, chapterIds = null } = {}) {
  const chapters = [];

  const walk = (items) => {
    for (const item of items || []) {
      if (!item) continue;
      const hasContent = typeof item.content === 'string' && item.content.trim().length > 0;
      if (item.type !== 'folder' || hasContent) {
        chapters.push({ id: item.id, title: item.title || 'Nimetön luku', content: item.content || '' });
      }
      walk(item.children);
    }
  };

  walk(project && project.structure);

  const wanted = chapterId ? [chapterId] : chapterIds;
  return Array.isArray(wanted) ? chapters.filter(chapter => wanted.includes(chapter.id)) : chapters;
}

/**
 * Everything the exporters need.
 */
function buildManuscript(project, options = {}) {
  const chapters = collectChapters(project, options).map(chapter => ({
    ...chapter,
    blocks: parseBlocks(chapter.content)
  }));

  return {
    title: (project && project.title) || 'Nimetön projekti',
    author: (project && project.author) || '',
    language: (project && project.language) || 'fi',
    chapters,
    // A single chapter is exported on its own, without the book title page
    single: !!options.chapterId || (Array.isArray(options.chapterIds) && options.chapterIds.length === 1)
  };
}

// ---------------------------------------------------------------------------
// Plain text and Markdown
// ---------------------------------------------------------------------------

function blockToPlainText(block) {
  switch (block.type) {
    case 'break': return '* * *';
    case 'heading': return runsToText(block.runs);
    case 'quote': return runsToText(block.runs);
    case 'list': return block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${runsToText(item)}`).join('\n');
    default: return runsToText(block.runs);
  }
}

function toPlainText(manuscript) {
  const parts = [];

  if (!manuscript.single) {
    parts.push(manuscript.title.toUpperCase());
    if (manuscript.author) parts.push(manuscript.author);
    parts.push('');
  }

  for (const chapter of manuscript.chapters) {
    parts.push(chapter.title, '');
    for (const block of chapter.blocks) {
      parts.push(blockToPlainText(block), '');
    }
    parts.push('');
  }

  return parts.join('\n').replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n';
}

function toMarkdown(manuscript) {
  const parts = [];

  if (!manuscript.single) {
    parts.push(`# ${manuscript.title}`, '');
    if (manuscript.author) parts.push(`*${manuscript.author}*`, '');
  }

  // Chapter titles take one heading level (two with a book title above them),
  // so headings inside the text move down by as much
  const chapterLevel = manuscript.single ? 1 : 2;

  for (const chapter of manuscript.chapters) {
    parts.push(`${'#'.repeat(chapterLevel)} ${chapter.title}`, '');
    // Chapter text already is Markdown; only make sure paragraphs are separated
    const body = String(chapter.content || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.replace(/^(#{1,6})(?=\s)/, (marks) => '#'.repeat(Math.min(6, marks.length + chapterLevel))))
      .join('\n\n');
    parts.push(body, '');
  }

  return parts.join('\n').trimEnd() + '\n';
}

// ---------------------------------------------------------------------------
// HTML (also the source for PDF, print and EPUB chapter bodies)
// ---------------------------------------------------------------------------

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function runsToHtml(runs) {
  return runs.map(run => {
    let html = escapeHtml(run.text);
    if (run.bold) html = `<strong>${html}</strong>`;
    if (run.italic) html = `<em>${html}</em>`;
    if (run.underline) html = `<u>${html}</u>`;
    if (run.strike) html = `<s>${html}</s>`;
    return html;
  }).join('');
}

function blocksToHtml(blocks) {
  const html = [];
  let previous = null;

  for (const block of blocks) {
    switch (block.type) {
      case 'break':
        html.push('<p class="scene-break">* * *</p>');
        break;
      case 'heading': {
        // Chapter titles are h1 (single chapter) or h2, so text headings start below them
        const level = Math.min(6, block.level + 2);
        html.push(`<h${level}>${runsToHtml(block.runs)}</h${level}>`);
        break;
      }
      case 'quote':
        html.push(`<blockquote><p>${runsToHtml(block.runs)}</p></blockquote>`);
        break;
      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul';
        html.push(`<${tag}>${block.items.map(item => `<li>${runsToHtml(item)}</li>`).join('')}</${tag}>`);
        break;
      }
      default:
        // Book convention: the first paragraph after a heading or break is not indented
        html.push(`<p${previous === 'paragraph' ? '' : ' class="first"'}>${runsToHtml(block.runs)}</p>`);
    }
    previous = block.type;
  }

  return html.join('\n');
}

const BOOK_CSS = `
body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #111; }
.manuscript { max-width: 38em; margin: 0 auto; padding: 2em 1.5em; }
.title-page { text-align: center; margin: 6em 0 8em; }
.title-page h1 { font-size: 2.2em; margin: 0 0 0.5em; }
.title-page .author { font-size: 1.2em; font-style: italic; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; font-weight: bold; }
.chapter-title { font-size: 1.6em; text-align: center; margin: 3em 0 2em; }
h3 { font-size: 1.25em; margin: 1.6em 0 0.6em; }
h4, h5, h6 { font-size: 1.1em; margin: 1.4em 0 0.5em; }
p { margin: 0; text-indent: 1.5em; text-align: justify; hyphens: auto; }
p.first { text-indent: 0; }
p.scene-break { text-indent: 0; text-align: center; margin: 1.4em 0; }
blockquote { margin: 1em 2em; font-style: italic; }
blockquote p { text-indent: 0; }
ul, ol { margin: 0.8em 0 0.8em 1.5em; padding: 0; }
.chapter + .chapter { page-break-before: always; break-before: page; }
.title-page + .chapter { page-break-before: always; break-before: page; }
@page { size: A4; margin: 2.5cm; }
@media print { .manuscript { max-width: none; padding: 0; } }
`;

function toHTML(manuscript) {
  const body = [];

  if (!manuscript.single) {
    body.push(
      '<section class="title-page">',
      `<h1>${escapeHtml(manuscript.title)}</h1>`,
      manuscript.author ? `<p class="author first">${escapeHtml(manuscript.author)}</p>` : '',
      '</section>'
    );
  }

  for (const chapter of manuscript.chapters) {
    const tag = manuscript.single ? 'h1' : 'h2';
    body.push(
      '<section class="chapter">',
      `<${tag} class="chapter-title">${escapeHtml(chapter.title)}</${tag}>`,
      blocksToHtml(chapter.blocks),
      '</section>'
    );
  }

  const title = manuscript.single && manuscript.chapters[0] ? manuscript.chapters[0].title : manuscript.title;

  return `<!DOCTYPE html>
<html lang="${escapeHtml(manuscript.language)}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>${BOOK_CSS}</style>
</head>
<body>
<div class="manuscript">
${body.filter(Boolean).join('\n')}
</div>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// RTF
// ---------------------------------------------------------------------------

// RTF is 7-bit: escape control characters and write everything else as \uN
function escapeRtf(text) {
  let out = '';
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    if (char === '\\' || char === '{' || char === '}') out += '\\' + char;
    else if (char === '\t') out += '\\tab ';
    else if (code < 128) out += char;
    else if (code > 0xffff) {
      // Outside the BMP: two UTF-16 units, each as a signed 16-bit number
      const offset = code - 0x10000;
      const high = 0xd800 + (offset >> 10);
      const low = 0xdc00 + (offset & 0x3ff);
      out += `\\u${high - 65536}?\\u${low - 65536}?`;
    } else {
      out += `\\u${code > 32767 ? code - 65536 : code}?`;
    }
  }
  return out;
}

function runsToRtf(runs) {
  return runs.map(run => {
    const codes = [
      run.bold ? '\\b' : '',
      run.italic ? '\\i' : '',
      run.underline ? '\\ul' : '',
      run.strike ? '\\strike' : ''
    ].join('');
    const text = escapeRtf(run.text);
    return codes ? `{${codes} ${text}}` : text;
  }).join('');
}

function toRTF(manuscript) {
  const out = ['{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1', '{\\fonttbl{\\f0\\froman Times New Roman;}}', '\\f0\\fs24'];
  const paragraph = (format, content) => out.push(`{\\pard${format} ${content}\\par}`);

  if (!manuscript.single) {
    paragraph('\\qc\\sb2400\\sa240\\b\\fs48', escapeRtf(manuscript.title));
    if (manuscript.author) paragraph('\\qc\\sa240\\i\\fs28', escapeRtf(manuscript.author));
  }

  manuscript.chapters.forEach((chapter, index) => {
    if (index > 0 || !manuscript.single) out.push('\\page');
    paragraph('\\qc\\sb480\\sa360\\b\\fs36', escapeRtf(chapter.title));

    let previous = null;
    for (const block of chapter.blocks) {
      switch (block.type) {
        case 'break':
          paragraph('\\qc\\sb240\\sa240', '* * *');
          break;
        case 'heading':
          paragraph(`\\sb360\\sa120\\b\\fs${block.level <= 1 ? 32 : 28}`, runsToRtf(block.runs));
          break;
        case 'quote':
          paragraph('\\li720\\ri720\\sb120\\sa120\\i', runsToRtf(block.runs));
          break;
        case 'list':
          block.items.forEach((item, i) => {
            paragraph('\\li720\\fi-360', `${block.ordered ? `${i + 1}.` : '\\bullet'}\\tab ${runsToRtf(item)}`);
          });
          break;
        default:
          paragraph(`\\qj\\sl360\\slmult1${previous === 'paragraph' ? '\\fi360' : ''}`, runsToRtf(block.runs));
      }
      previous = block.type;
    }
  });

  out.push('}');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

function runsToDocx(runs, base = {}) {
  return runs.map(run => new TextRun({
    text: run.text,
    bold: run.bold || base.bold || undefined,
    italics: run.italic || base.italics || undefined,
    underline: run.underline ? {} : undefined,
    strike: run.strike || undefined
  }));
}

const DOCX_HEADINGS = [
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
  HeadingLevel.HEADING_6
];

async function toDocx(manuscript) {
  const children = [];
  let listInstance = 0;

  if (!manuscript.single) {
    children.push(new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 240 },
      children: [new TextRun({ text: manuscript.title })]
    }));
    if (manuscript.author) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: manuscript.author, italics: true })]
      }));
    }
  }

  manuscript.chapters.forEach((chapter, index) => {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      pageBreakBefore: index > 0 || !manuscript.single,
      spacing: { before: 480, after: 360 },
      children: [new TextRun({ text: chapter.title })]
    }));

    let previous = null;
    for (const block of chapter.blocks) {
      switch (block.type) {
        case 'break':
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 240 },
            children: [new TextRun({ text: '* * *' })]
          }));
          break;
        case 'heading':
          children.push(new Paragraph({
            heading: DOCX_HEADINGS[block.level - 1],
            spacing: { before: 360, after: 120 },
            children: runsToDocx(block.runs)
          }));
          break;
        case 'quote':
          children.push(new Paragraph({
            indent: { left: 720, right: 720 },
            spacing: { before: 120, after: 120 },
            children: runsToDocx(block.runs, { italics: true })
          }));
          break;
        case 'list':
          listInstance += 1;
          for (const item of block.items) {
            children.push(new Paragraph({
              children: runsToDocx(item),
              ...(block.ordered
                ? { numbering: { reference: 'faust-numbered', level: 0, instance: listInstance } }
                : { bullet: { level: 0 } })
            }));
          }
          break;
        default:
          children.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { line: 360 },
            indent: previous === 'paragraph' ? { firstLine: 360 } : undefined,
            children: runsToDocx(block.runs)
          }));
      }
      previous = block.type;
    }
  });

  const doc = new Document({
    creator: manuscript.author || 'FAUST',
    title: manuscript.title,
    styles: {
      default: {
        document: { run: { font: 'Times New Roman', size: 24 } }
      }
    },
    numbering: {
      config: [{
        reference: 'faust-numbered',
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      }]
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      children
    }]
  });

  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------------------
// EPUB 3 (with an NCX so older readers show a table of contents too)
// ---------------------------------------------------------------------------

const EPUB_CSS = `
body { font-family: serif; line-height: 1.5; margin: 0 5%; }
h1, h2 { text-align: center; margin: 2em 0 1.5em; }
p { margin: 0; text-indent: 1.5em; text-align: justify; }
p.first { text-indent: 0; }
p.scene-break { text-indent: 0; text-align: center; margin: 1.2em 0; }
p.author { text-indent: 0; text-align: center; font-style: italic; }
blockquote { margin: 1em 2em; font-style: italic; }
blockquote p { text-indent: 0; }
`;

function xhtmlPage(title, language, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeHtml(language)}" lang="${escapeHtml(language)}">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>
`;
}

async function toEPUB(manuscript, { now = new Date(), identifier } = {}) {
  const zip = new JSZip();
  const language = manuscript.language || 'fi';
  const bookId = identifier || `urn:uuid:${randomUuid()}`;
  const modified = now.toISOString().replace(/\.\d+Z$/, 'Z');

  // Must be the first entry and stored uncompressed
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`);

  zip.file('OEBPS/style.css', EPUB_CSS);

  const pages = [];

  if (!manuscript.single) {
    pages.push({
      id: 'title',
      file: 'title.xhtml',
      title: manuscript.title,
      inToc: false,
      xhtml: xhtmlPage(manuscript.title, language,
        `<h1>${escapeHtml(manuscript.title)}</h1>${manuscript.author ? `\n<p class="author">${escapeHtml(manuscript.author)}</p>` : ''}`)
    });
  }

  manuscript.chapters.forEach((chapter, index) => {
    pages.push({
      id: `chapter-${index + 1}`,
      file: `chapter-${index + 1}.xhtml`,
      title: chapter.title,
      inToc: true,
      xhtml: xhtmlPage(chapter.title, language, `<h2>${escapeHtml(chapter.title)}</h2>\n${blocksToHtml(chapter.blocks)}`)
    });
  });

  for (const page of pages) {
    zip.file(`OEBPS/${page.file}`, page.xhtml);
  }

  const tocPages = pages.filter(page => page.inToc);

  zip.file('OEBPS/nav.xhtml', xhtmlPage('Sisällys', language,
    `<nav epub:type="toc" id="toc">\n<h1>Sisällys</h1>\n<ol>\n${tocPages.map(page => `<li><a href="${page.file}">${escapeHtml(page.title)}</a></li>`).join('\n')}\n</ol>\n</nav>`));

  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${escapeHtml(bookId)}"/></head>
  <docTitle><text>${escapeHtml(manuscript.title)}</text></docTitle>
  <navMap>
${tocPages.map((page, i) => `    <navPoint id="nav-${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeHtml(page.title)}</text></navLabel><content src="${page.file}"/></navPoint>`).join('\n')}
  </navMap>
</ncx>
`);

  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeHtml(bookId)}</dc:identifier>
    <dc:title>${escapeHtml(manuscript.title)}</dc:title>
    <dc:language>${escapeHtml(language)}</dc:language>
${manuscript.author ? `    <dc:creator>${escapeHtml(manuscript.author)}</dc:creator>\n` : ''}    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
${pages.map(page => `    <item id="${page.id}" href="${page.file}" media-type="application/xhtml+xml"/>`).join('\n')}
  </manifest>
  <spine toc="ncx">
${pages.map(page => `    <itemref idref="${page.id}"/>`).join('\n')}
  </spine>
</package>
`);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', mimeType: 'application/epub+zip' });
}

function randomUuid() {
  // crypto.randomUUID exists in every Node version Electron 30 ships
  return require('crypto').randomUUID();
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

// The title a file name gives, in NFC: a name from a decomposing file system (ä as a + ¨) gives
// the same title as one typed in FAUST, on both import paths
function fileTitle(fileName) {
  return String(fileName || 'Tuotu teksti').normalize('NFC').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || 'Tuotu teksti';
}

// Windows-1252 bytes 0x80–0x9F, which latin1 reads as control characters (index = byte − 0x80).
// U+FFFD marks the five bytes that Windows-1252 leaves undefined.
const CP1252_HIGH = '\u20AC\uFFFD\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\uFFFD\u017D\uFFFD\uFFFD\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\uFFFD\u017E\u0178';

/**
 * The text of a file whose encoding is not declared. First match wins: a UTF-8 or UTF-16
 * byte order mark (removed), valid UTF-8, else Windows-1252. TextDecoder('windows-1252')
 * is not used: Node may be built without the full ICU data, and then it reads latin1.
 * Never throws.
 * @param {Buffer|Uint8Array} buffer
 * @returns {{ text: string, encoding: 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252' }}
 */
function decodeText(buffer) {
  try {
    if (!buffer || !buffer.length) return { text: '', encoding: 'utf-8' };
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return { text: bytes.subarray(3).toString('utf-8'), encoding: 'utf-8' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      const body = bytes.subarray(2, 2 + ((bytes.length - 2) & ~1));
      return { text: body.toString('utf16le'), encoding: 'utf-16le' };
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      // Big endian: swap each pair, then read it as little endian
      const body = Buffer.from(bytes.subarray(2, 2 + ((bytes.length - 2) & ~1)));
      body.swap16();
      return { text: body.toString('utf16le'), encoding: 'utf-16be' };
    }

    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
    } catch (_notUtf8) {
      const text = bytes.toString('latin1').replace(/[\u0080-\u009F]/g, (char) => CP1252_HIGH[char.charCodeAt(0) - 0x80]);
      return { text, encoding: 'windows-1252' };
    }
  } catch (_error) {
    return { text: '', encoding: 'utf-8' };
  }
}

// Headings inside a chapter start from level 1 again: with level > 0 the headings below it move
// up by that many levels. Then the lines are joined, leading blank lines and runs of more than
// one blank line go, and so does the trailing white space.
function tidy(lines, level) {
  const relevelled = level > 0
    ? lines.map(line => line.replace(/^(#{2,6})(?=\s)/, (marks) => (
      marks.length > level ? '#'.repeat(marks.length - level) : marks
    )))
    : lines;
  return relevelled.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/**
 * Split text into chapters at its headings.
 *
 * - Chapters start at the highest heading level the text uses.
 * - A single top-level heading at the very start, followed by several
 *   headings one level down, is the book title, not a chapter.
 * - With a title, one short line before the first chapter is the author.
 * - Any other text before the first heading becomes a chapter of its own.
 *
 * With options.oneChapterPerFile (the folder import: one file is one chapter) the text is
 * never split. The chapter's title is, first match wins: known.title (titleFrom 'document');
 * the first filled line when it is the only heading at the highest level the text uses
 * (titleFrom 'heading': the line leaves the text and the deeper headings move up); else the
 * file name (titleFrom 'file', every heading stays). No book title or author is inferred.
 *
 * The text is normalised to Unicode NFC first, in both modes.
 *
 * @param {string} text
 * @param {string} fileName - used for the title when the text has none
 * @param {{ title?: string }} [known] - a title found elsewhere (e.g. a Word title style)
 * @param {{ oneChapterPerFile?: boolean }} [options]
 * @returns {{ title: string, author: string,
 *   chapters: Array<{ title: string, content: string, titleFrom?: 'document' | 'heading' | 'file' }> }}
 *   (titleFrom only with oneChapterPerFile)
 */
function splitIntoChapters(text, fileName, known = {}, options = {}) {
  let lines = String(text || '').normalize('NFC').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const headingLevel = (line) => ((/^(#{1,6})\s+\S/.exec(line) || [])[1] || '').length;

  // A title found elsewhere (Word's Title style) is normalised like the text
  const knownTitle = String((known && known.title) || '').normalize('NFC');
  let title = knownTitle;
  let levels = lines.map(headingLevel).filter(Boolean);
  let splitLevel = levels.length > 0 ? Math.min(...levels) : 0;

  if (options && options.oneChapterPerFile) {
    let chapterTitle = knownTitle.trim();
    let titleFrom = 'document';
    let level = 0;

    if (!chapterTitle) {
      const firstFilled = lines.findIndex(line => line.trim());
      const isOnlyTop = levels.filter(found => found === splitLevel).length === 1;
      if (splitLevel > 0 && isOnlyTop && firstFilled !== -1 && headingLevel(lines[firstFilled]) === splitLevel) {
        const raw = lines[firstFilled].replace(/^#+\s+/, '').trim();
        chapterTitle = runsToText(parseInline(raw)).trim() || raw;
        titleFrom = 'heading';
        level = splitLevel;
        lines = lines.slice(firstFilled + 1);
      } else {
        chapterTitle = fileTitle(fileName);
        titleFrom = 'file';
      }
    }

    return {
      title: chapterTitle,
      author: '',
      chapters: [{ title: chapterTitle, content: tidy(lines, level), titleFrom }]
    };
  }

  // "# Book title" + several "## Chapter" headings: the first one is the title
  if (!title && splitLevel > 0) {
    const firstFilled = lines.findIndex(line => line.trim());
    const deeper = levels.filter(level => level > splitLevel);
    const nextLevel = deeper.length > 0 ? Math.min(...deeper) : 0;
    const isOnlyTop = levels.filter(level => level === splitLevel).length === 1;

    if (isOnlyTop && firstFilled !== -1 && headingLevel(lines[firstFilled]) === splitLevel &&
        nextLevel > 0 && deeper.filter(level => level === nextLevel).length >= 2) {
      title = lines[firstFilled].replace(/^#+\s+/, '').trim();
      lines = lines.slice(firstFilled + 1);
      splitLevel = nextLevel;
    }
  }

  const headingPattern = splitLevel ? new RegExp(`^#{${splitLevel}}\\s+(.+?)\\s*$`) : null;
  const sections = [];
  let current = { title: null, lines: [] };

  for (const line of lines) {
    const match = headingPattern && headingPattern.exec(line);
    if (match) {
      sections.push(current);
      current = { title: match[1], lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);

  // Text before the first heading
  const lead = sections.shift();
  const leadLines = lead.lines.filter(line => line.trim());
  let author = '';

  if (title && sections.length > 0 && leadLines.length === 1 && leadLines[0].trim().split(/\s+/).length <= 8) {
    author = leadLines[0].trim().replace(/^[*_]+|[*_]+$/g, '');
  } else if (leadLines.length > 0 || sections.length === 0) {
    sections.unshift({ title: title && sections.length > 0 ? 'Alkusivut' : fileTitle(fileName), lines: lead.lines });
  }

  return {
    title: title || fileTitle(fileName),
    author,
    chapters: sections.map(section => ({
      title: section.title,
      // Headings inside a chapter start from level 1 again
      content: tidy(section.lines, splitLevel)
    }))
  };
}

function decodeXml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

// <w:b/> is on, <w:b w:val="0"/> is off
function docxFlag(properties, tag) {
  const match = new RegExp(`<w:${tag}(?:\\s[^>]*)?/?>`).exec(properties);
  if (!match) return false;
  const value = /w:val="([^"]*)"/.exec(match[0]);
  return !value || !['0', 'false', 'none'].includes(value[1]);
}

function wrapRun(text, format) {
  if (!text.trim()) return text;
  // Markers must touch the text, so keep surrounding spaces outside them
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  let out = core;
  if (format.strike) out = `~~${out}~~`;
  if (format.underline) out = `<u>${out}</u>`;
  if (format.italic) out = `_${out}_`;
  if (format.bold) out = `**${out}**`;
  return lead + out + trail;
}

/**
 * Read a .docx: its title (Word's "Title" style) and its text as FAUST's
 * Markdown-style text. Keeps headings, bold, italic, underline,
 * strikethrough and line breaks.
 * @returns {Promise<{ title: string, markdown: string }>}
 */
async function readDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) throw new Error('Tiedosto ei ole kelvollinen Word-asiakirja.');

  const documentXml = await documentFile.async('string');
  const stylesFile = zip.file('word/styles.xml');
  const stylesXml = stylesFile ? await stylesFile.async('string') : '';

  // styleId -> heading level. Word localises style ids ("Otsikko1") but the
  // style name stays "heading 1", so read the name. The "Title" style is the
  // name of the whole document.
  const headingLevels = {};
  const titleStyles = new Set(['Title']);
  for (const style of stylesXml.match(/<w:style\b[\s\S]*?<\/w:style>/g) || []) {
    const id = /w:styleId="([^"]+)"/.exec(style);
    const name = /<w:name w:val="([^"]+)"/.exec(style);
    if (!id || !name) continue;
    const heading = /^heading (\d)$/i.exec(name[1]);
    if (heading) headingLevels[id[1]] = parseInt(heading[1], 10);
    else if (/^title$/i.test(name[1])) titleStyles.add(id[1]);
  }

  // Lists: numId -> 'bullet' or 'numbered', read from word/numbering.xml
  const numberingFile = zip.file('word/numbering.xml');
  const numberingXml = numberingFile ? await numberingFile.async('string') : '';
  const abstractFormats = {};
  for (const abstract of numberingXml.match(/<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/g) || []) {
    const id = /w:abstractNumId="([^"]+)"/.exec(abstract);
    const format = /<w:numFmt w:val="([^"]+)"/.exec(abstract); // level 0 comes first
    if (id) abstractFormats[id[1]] = format && format[1] !== 'bullet' ? 'numbered' : 'bullet';
  }
  const listKinds = {};
  for (const num of numberingXml.match(/<w:num\b[\s\S]*?<\/w:num>/g) || []) {
    const id = /w:numId="([^"]+)"/.exec(num);
    const abstractId = /<w:abstractNumId w:val="([^"]+)"/.exec(num);
    if (id && abstractId) listKinds[id[1]] = abstractFormats[abstractId[1]] || 'bullet';
  }

  const lines = [];
  let title = '';
  let listNumber = 0;
  let lastListId = null;

  for (const paragraph of documentXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || []) {
    const styleId = (/<w:pStyle w:val="([^"]+)"/.exec(paragraph) || [])[1];
    let level = styleId ? headingLevels[styleId] : undefined;
    if (level === undefined && styleId) {
      const guess = /^(?:heading|otsikko)\s*(\d)$/i.exec(styleId);
      if (guess) level = parseInt(guess[1], 10);
    }

    // Collect runs, merging neighbours with the same formatting
    const pieces = [];
    for (const run of paragraph.match(/<w:r\b[\s\S]*?<\/w:r>/g) || []) {
      const properties = (/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(run) || [''])[0];
      const format = {
        bold: docxFlag(properties, 'b'),
        italic: docxFlag(properties, 'i'),
        underline: docxFlag(properties, 'u'),
        strike: docxFlag(properties, 'strike')
      };

      let text = '';
      for (const token of run.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>|<w:t\b[^>]*\/>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:noBreakHyphen\b[^>]*\/>/g) || []) {
        if (token.startsWith('<w:tab')) text += '\t';
        else if (token.startsWith('<w:br')) text += /w:type="page"/.test(token) ? '' : '\n';
        else if (token.startsWith('<w:noBreakHyphen')) text += '-';
        else text += decodeXml(token.replace(/<[^>]+>/g, ''));
      }
      if (!text) continue;

      const key = JSON.stringify(format);
      const last = pieces[pieces.length - 1];
      if (last && last.key === key) last.text += text;
      else pieces.push({ key, format, text });
    }

    // Headings carry their own weight: ignore bold inside them
    const text = pieces
      .map(piece => wrapRun(piece.text, level ? { ...piece.format, bold: false } : piece.format))
      .join('');

    const listId = (/<w:numPr>[\s\S]*?<w:numId w:val="([^"]+)"/.exec(paragraph) || [])[1];
    const isListItem = !!listId && listId !== '0' && !level;
    if (!isListItem || listId !== lastListId) listNumber = 0;
    lastListId = isListItem ? listId : null;

    if (!text.trim()) {
      lines.push('');
    } else if (styleId && titleStyles.has(styleId) && !title) {
      title = text.replace(/[*_~]|<\/?u>/g, '').trim();
    } else if (level) {
      lines.push(`${'#'.repeat(Math.min(level, 6))} ${text.trim()}`);
    } else if (isListItem) {
      listNumber += 1;
      const marker = listKinds[listId] === 'numbered' ? `${listNumber}.` : '-';
      lines.push(`${marker} ${text.trim().replace(/\n/g, ' ')}`);
    } else {
      lines.push(...text.split('\n'));
    }
  }

  return { title, markdown: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

/**
 * Read a .docx into FAUST's Markdown-style text (the document title, if the
 * file has one, is left out: see readDocx).
 */
async function docxToMarkdown(buffer) {
  return (await readDocx(buffer)).markdown;
}

/**
 * Import a file's contents as chapters.
 * @param {Buffer} buffer
 * @param {string} fileName - decides the format by extension
 * @param {{ oneChapterPerFile?: boolean }} [options] - passed to splitIntoChapters
 * @returns {Promise<{ title, author, chapters, encoding? }>} encoding (decodeText's) for text files only
 */
async function importDocument(buffer, fileName, options = {}) {
  const extension = (/\.([^.]+)$/.exec(fileName || '') || [])[1];
  const type = (extension || '').toLowerCase();

  if (type === 'docx') {
    const { title, markdown } = await readDocx(buffer);
    return splitIntoChapters(markdown, fileName, { title }, options);
  }
  if (['txt', 'md', 'markdown', 'text'].includes(type)) {
    const { text, encoding } = decodeText(buffer);
    return { ...splitIntoChapters(text, fileName, {}, options), encoding };
  }
  throw new Error(`Tiedostomuotoa .${type || '?'} ei voi tuoda. Tuetut muodot: .txt, .md, .docx`);
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

/**
 * Counts for a piece of chapter text. Formatting markers are not counted.
 */
function textStatistics(text) {
  const plain = parseBlocks(text).map(blockToPlainText).join('\n');
  const trimmed = plain.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return {
    words,
    characters: plain.replace(/\n/g, '').length,
    charactersNoSpaces: plain.replace(/\s/g, '').length,
    paragraphs: parseBlocks(text).filter(block => block.type === 'paragraph').length
  };
}

module.exports = {
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
  decodeText,
  splitIntoChapters,
  docxToMarkdown,
  importDocument,
  textStatistics,
  escapeHtml
};

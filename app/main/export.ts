/**
 * Compile the manuscript (in binder order) into a single file.
 * Chapters become headings, scenes are separated by scene breaks.
 */
import { AlignmentType, Document, Header, HeadingLevel, Packer, PageNumber, Paragraph, TextRun } from 'docx';
import JSZip from 'jszip';
import { countWords } from '../shared/text';
import type { ExportFormat, OpenProject, TreeNode } from '../shared/types';
import { blocksToHtml, parseBlocks, runsToPlain, type Block } from '../shared/markdownLite';

interface Section {
  node: TreeNode;
  depth: number;
  body: string;
}

function collectSections(project: OpenProject): Section[] {
  const out: Section[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      out.push({ node, depth, body: project.docs[node.id]?.body ?? '' });
      walk(node.children ?? [], depth + 1);
    }
  };
  walk(project.manifest.structure, 0);
  return out;
}

/** Headings for folders/chapters, a scene break before every scene after the first */
function manuscriptBlocks(project: OpenProject): Block[] {
  const blocks: Block[] = [];
  let previousWasScene = false;
  for (const { node, depth, body } of collectSections(project)) {
    if (node.type === 'scene') {
      if (previousWasScene) blocks.push({ type: 'break' });
      previousWasScene = true;
    } else {
      blocks.push({ type: 'heading', level: Math.min(depth + 1, 3), runs: [{ text: node.title }] });
      previousWasScene = false;
    }
    blocks.push(...parseBlocks(body));
  }
  return blocks;
}

export function toMarkdown(project: OpenProject): string {
  const parts = [`# ${project.manifest.title}`];
  if (project.manifest.author) parts.push(`*${project.manifest.author}*`);
  let previousWasScene = false;
  for (const { node, depth, body } of collectSections(project)) {
    if (node.type === 'scene') {
      if (previousWasScene) parts.push('* * *');
      previousWasScene = true;
    } else {
      parts.push(`${'#'.repeat(Math.min(depth + 2, 4))} ${node.title}`);
      previousWasScene = false;
    }
    if (body.trim()) parts.push(body.trim());
  }
  return parts.join('\n\n') + '\n';
}

export function toPlainText(project: OpenProject): string {
  const lines = [project.manifest.title.toUpperCase(), ''];
  for (const block of manuscriptBlocks(project)) {
    if (block.type === 'break') lines.push('* * *', '');
    else if (block.type === 'heading') lines.push('', runsToPlain(block.runs).toUpperCase(), '');
    else lines.push(runsToPlain(block.runs), '');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function toHtml(project: OpenProject): string {
  const { title, author, language } = project.manifest;
  const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<!doctype html>
<html lang="${escape(language || 'fi')}">
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<style>
  body { font-family: 'EB Garamond', Georgia, serif; max-width: 36em; margin: 3em auto; padding: 0 1em; line-height: 1.6; font-size: 1.15em; }
  h1, h2, h3 { text-align: center; font-weight: 500; }
  p { margin: 0; text-indent: 1.5em; }
  h1 + p, h2 + p, h3 + p, .scene-break + p { text-indent: 0; }
  .scene-break { text-align: center; text-indent: 0; margin: 1.5em 0; }
  blockquote { margin: 1em 2em; font-style: italic; }
  .author { text-align: center; text-indent: 0; margin-bottom: 3em; }
</style>
</head>
<body>
<h1>${escape(title)}</h1>
${author ? `<p class="author">${escape(author)}</p>` : ''}
${blocksToHtml(manuscriptBlocks(project).map(b => (b.type === 'heading' ? { ...b, level: b.level + 1 } : b)))}
</body>
</html>
`;
}

export async function toDocx(project: OpenProject): Promise<Buffer> {
  const { title, author } = project.manifest;
  const headingLevels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
  const paragraphs: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun(title)] })
  ];
  if (author) paragraphs.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(author)] }));

  let firstAfterBreak = true;
  for (const block of manuscriptBlocks(project)) {
    if (block.type === 'break') {
      paragraphs.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 }, children: [new TextRun('* * *')] }));
      firstAfterBreak = true;
      continue;
    }
    const runs = block.runs.map(r => new TextRun({ text: r.text, bold: r.bold, italics: r.italic || block.type === 'quote' }));
    if (block.type === 'heading') {
      paragraphs.push(new Paragraph({ heading: headingLevels[block.level - 1], alignment: AlignmentType.CENTER, pageBreakBefore: block.level === 1, children: runs }));
      firstAfterBreak = true;
    } else {
      paragraphs.push(new Paragraph({
        indent: firstAfterBreak ? undefined : { firstLine: 425 },
        spacing: { line: 360 },
        children: runs
      }));
      firstAfterBreak = false;
    }
  }

  const doc = new Document({
    creator: author || 'FAUST',
    title,
    styles: { default: { document: { run: { font: 'Times New Roman', size: 24 } } } },
    sections: [{ children: paragraphs }]
  });
  return Packer.toBuffer(doc);
}

/**
 * Standard manuscript for submitting to publishers: title page with contact
 * line and word count, 12 pt Times New Roman, 1.5 line spacing, indented
 * paragraphs, each chapter on a new page, "Author / Title / page" header.
 */
export async function toManuscriptDocx(project: OpenProject): Promise<Buffer> {
  const { title, author } = project.manifest;
  const words = Object.values(project.docs).reduce((sum, d) => sum + countWords(d.body), 0);
  const rounded = words < 1000 ? words : Math.round(words / 500) * 500;
  const surname = author.trim().split(/\s+/).pop() || 'Kirjoittaja';

  const titlePage: Paragraph[] = [
    new Paragraph({ children: [new TextRun(author || 'Kirjoittajan nimi')] }),
    new Paragraph({ children: [new TextRun(`noin ${rounded.toLocaleString('fi-FI')} sanaa`)] }),
    new Paragraph({ spacing: { before: 4800 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: title.toUpperCase(), bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 }, children: [new TextRun(author)] })
  ];

  const body: Paragraph[] = [];
  let firstAfterBreak = true;
  for (const block of manuscriptBlocks(project)) {
    if (block.type === 'break') {
      body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 360, before: 240, after: 240 }, children: [new TextRun('#')] }));
      firstAfterBreak = true;
      continue;
    }
    const runs = block.runs.map(r => new TextRun({ text: r.text, bold: r.bold, italics: r.italic || block.type === 'quote' }));
    if (block.type === 'heading') {
      body.push(new Paragraph({ alignment: AlignmentType.CENTER, pageBreakBefore: true, spacing: { before: 2400, after: 720, line: 360 }, children: runs }));
      firstAfterBreak = true;
    } else {
      body.push(new Paragraph({ indent: firstAfterBreak ? undefined : { firstLine: 709 }, spacing: { line: 360 }, children: runs }));
      firstAfterBreak = false;
    }
  }
  body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480 }, children: [new TextRun('LOPPU')] }));

  const margin = { top: 1418, bottom: 1418, left: 1418, right: 1418 };
  const doc = new Document({
    creator: author || 'FAUST',
    title,
    styles: { default: { document: { run: { font: 'Times New Roman', size: 24 } } } },
    sections: [
      { properties: { page: { margin } }, children: titlePage },
      {
        properties: { page: { margin, pageNumbers: { start: 1 } } },
        headers: {
          default: new Header({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [`${surname} / ${title} / `, PageNumber.CURRENT] })] })]
          })
        },
        children: body
      }
    ]
  });
  return Packer.toBuffer(doc);
}

function xmlEscape(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

const EPUB_CSS = `body { font-family: serif; line-height: 1.5; margin: 0 5%; }
h1, h2, h3 { text-align: center; font-weight: normal; margin: 2em 0 1em; page-break-after: avoid; }
p { margin: 0; text-indent: 1.5em; text-align: justify; }
h1 + p, h2 + p, h3 + p, .scene-break + p, .title-page p { text-indent: 0; }
.scene-break { text-align: center; text-indent: 0; margin: 1em 0; }
blockquote { margin: 1em 1.5em; font-style: italic; }
.title-page { text-align: center; margin-top: 30%; }
.title-page h1 { font-size: 2em; }
`;

function xhtml(title: string, language: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}" lang="${language}">
<head><meta charset="utf-8"/><title>${xmlEscape(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>
`;
}

/** EPUB 3 e-book: one file per top-level chapter or folder */
export async function toEpub(project: OpenProject, now = new Date()): Promise<Buffer> {
  const { title, author, language, id } = project.manifest;
  const lang = xmlEscape(language || 'fi');

  // Each top-level node with its descendants becomes one chapter file
  const chapters = project.manifest.structure.map((top, index) => {
    const sub: OpenProject = { ...project, manifest: { ...project.manifest, structure: [top] } };
    const html = blocksToHtml(manuscriptBlocks(sub)).replace(/<br>/g, '<br/>');
    return { file: `chapter-${index + 1}.xhtml`, title: top.title, html };
  });

  const zip = new JSZip();
  // The mimetype entry must come first and be stored uncompressed
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`
  );
  zip.file('OEBPS/style.css', EPUB_CSS);
  zip.file(
    'OEBPS/title.xhtml',
    xhtml(title, lang, `<section class="title-page" epub:type="titlepage"><h1>${xmlEscape(title)}</h1>${author ? `<p>${xmlEscape(author)}</p>` : ''}</section>`)
  );
  for (const c of chapters) zip.file(`OEBPS/${c.file}`, xhtml(c.title, lang, c.html));

  zip.file(
    'OEBPS/nav.xhtml',
    xhtml(
      'Sisällys',
      lang,
      `<nav epub:type="toc" id="toc"><h1>Sisällys</h1><ol>
${chapters.map(c => `  <li><a href="${c.file}">${xmlEscape(c.title)}</a></li>`).join('\n')}
</ol></nav>`
    )
  );

  const modified = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:faust:${xmlEscape(id)}</dc:identifier>
    <dc:title>${xmlEscape(title)}</dc:title>
    ${author ? `<dc:creator>${xmlEscape(author)}</dc:creator>` : ''}
    <dc:language>${lang}</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${chapters.map((c, i) => `    <item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml"/>`).join('\n')}
  </manifest>
  <spine>
    <itemref idref="title"/>
${chapters.map((_, i) => `    <itemref idref="c${i + 1}"/>`).join('\n')}
  </spine>
</package>
`
  );

  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
}

export async function exportProject(project: OpenProject, format: ExportFormat): Promise<string | Buffer> {
  switch (format) {
    case 'md':
      return toMarkdown(project);
    case 'txt':
      return toPlainText(project);
    case 'html':
      return toHtml(project);
    case 'docx':
      return toDocx(project);
    case 'manuscript':
      return toManuscriptDocx(project);
    case 'epub':
      return toEpub(project);
  }
}

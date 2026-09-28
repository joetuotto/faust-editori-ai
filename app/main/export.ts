/**
 * Compile the manuscript (in binder order) into a single file.
 * Chapters become headings, scenes are separated by scene breaks.
 * Footnotes become real footnotes in Word, pop-up notes in EPUB and
 * endnotes elsewhere. Typeset formats can get Voikko soft hyphens.
 */
import { AlignmentType, Document, FootnoteReferenceRun, Header, HeadingLevel, Packer, PageNumber, Paragraph, TextRun } from 'docx';
import JSZip from 'jszip';
import { countWords } from '../shared/text';
import { provenanceStats, type ProvenanceFile } from '../shared/provenance';
import type { ExportFormat, OpenProject, TreeNode } from '../shared/types';
import { blocksToHtml, parseBlocks, runsToHtml, runsToPlain, type Block, type Run } from '../shared/markdownLite';
import { hyphenateBlocks, type Hyphenator } from '../shared/hyphenate';

export interface ExportOptions {
  /** Soft hyphens for EPUB, Word (book) and PDF */
  hyphenate?: Hyphenator | null;
}

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
function manuscriptBlocks(project: OpenProject, hyphenate?: Hyphenator | null): Block[] {
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
  return hyphenate ? hyphenateBlocks(blocks, hyphenate) : blocks;
}

/** Numbers footnotes in reading order and keeps their text for the notes list */
function noteList(start = 0) {
  const notes: Run[][] = [];
  return {
    notes,
    add(note: Run[]): number {
      notes.push(note);
      return start + notes.length;
    },
    get next() {
      return start + notes.length;
    }
  };
}

function htmlNotesSection(notes: Run[][], start = 0): string {
  if (notes.length === 0) return '';
  const items = notes.map((n, i) => `<li id="fn-${start + i + 1}" value="${start + i + 1}">${runsToHtml(n)} <a href="#ref-${start + i + 1}" class="back">↩</a></li>`);
  return `<section class="notes"><h2>Viitteet</h2>\n<ol>\n${items.join('\n')}\n</ol></section>`;
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
  const notes = noteList();
  const mark = (note: Run[]) => `[${notes.add(note)}]`;
  for (const block of manuscriptBlocks(project)) {
    if (block.type === 'break') lines.push('* * *', '');
    else if (block.type === 'heading') lines.push('', runsToPlain(block.runs, mark).toUpperCase(), '');
    else lines.push(runsToPlain(block.runs, mark), '');
  }
  if (notes.notes.length > 0) {
    lines.push('', 'VIITTEET', '', ...notes.notes.map((n, i) => `[${i + 1}] ${runsToPlain(n)}`));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const HTML_CSS = `
  body { font-family: 'EB Garamond', Georgia, serif; max-width: 36em; margin: 3em auto; padding: 0 1em; line-height: 1.6; font-size: 1.15em; }
  h1, h2, h3 { text-align: center; font-weight: 500; }
  p { margin: 0; text-indent: 1.5em; }
  h1 + p, h2 + p, h3 + p, .scene-break + p { text-indent: 0; }
  .scene-break { text-align: center; text-indent: 0; margin: 1.5em 0; }
  blockquote { margin: 1em 2em; font-style: italic; }
  .author { text-align: center; text-indent: 0; margin-bottom: 3em; }
  sup.fn a { text-decoration: none; }
  .notes { margin-top: 3em; font-size: 0.9em; }
  .notes h2 { font-size: 1.1em; }
  .notes li { margin-bottom: 0.4em; }
  .notes .back { text-decoration: none; }`;

/** Book-like print layout for PDF: A5, justified, chapters on a new page */
const PRINT_CSS = `
  @page { size: A5; }
  body { font-family: 'EB Garamond', Georgia, serif; font-size: 11pt; line-height: 1.45; margin: 0; hyphens: manual; }
  .title-page { text-align: center; padding-top: 30%; break-after: page; }
  .title-page h1 { font-size: 24pt; font-weight: 500; margin: 0 0 12pt; }
  .title-page .author { font-size: 13pt; text-align: center; text-indent: 0; }
  h2, h3, h4 { text-align: center; font-weight: 500; break-after: avoid; }
  h2 { font-size: 15pt; break-before: page; margin: 25% 0 2em; }
  h3 { font-size: 12pt; margin: 2em 0 1em; }
  p { margin: 0; text-indent: 1.2em; text-align: justify; orphans: 2; widows: 2; }
  h2 + p, h3 + p, h4 + p, .scene-break + p { text-indent: 0; }
  .scene-break { text-align: center; text-indent: 0; margin: 1em 0; }
  blockquote { margin: 0.8em 1.5em; font-style: italic; }
  sup.fn { font-size: 0.7em; line-height: 0; }
  sup.fn a { color: inherit; text-decoration: none; }
  .notes { break-before: page; font-size: 9.5pt; }
  .notes h2 { break-before: auto; margin-top: 0; }
  .notes li { margin-bottom: 0.3em; text-align: left; }
  .notes .back { display: none; }`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function toHtml(project: OpenProject, options: ExportOptions & { print?: boolean; fontFaces?: string } = {}): string {
  const { title, author, language } = project.manifest;
  const notes = noteList();
  const ref = (note: Run[]) => {
    const n = notes.add(note);
    return `<sup class="fn"><a href="#fn-${n}" id="ref-${n}">${n}</a></sup>`;
  };
  const blocks = manuscriptBlocks(project, options.print ? options.hyphenate : null).map(b => (b.type === 'heading' ? { ...b, level: b.level + 1 } : b));
  const body = blocksToHtml(blocks, ref);
  const head = options.print
    ? `<section class="title-page"><h1>${escapeHtml(title)}</h1>${author ? `<p class="author">${escapeHtml(author)}</p>` : ''}</section>`
    : `<h1>${escapeHtml(title)}</h1>\n${author ? `<p class="author">${escapeHtml(author)}</p>` : ''}`;
  return `<!doctype html>
<html lang="${escapeHtml(language || 'fi')}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${options.fontFaces ?? ''}${options.print ? PRINT_CSS : HTML_CSS}
</style>
</head>
<body>
${head}
${body}
${htmlNotesSection(notes.notes)}
</body>
</html>
`;
}

/** Word runs for a block; footnotes become real Word footnotes */
function docxRuns(runs: Run[], italic: boolean, footnotes: Record<number, { children: Paragraph[] }>): (TextRun | FootnoteReferenceRun)[] {
  return runs.map(r => {
    if (!r.note) return new TextRun({ text: r.text, bold: r.bold, italics: r.italic || italic });
    const id = Object.keys(footnotes).length + 1;
    footnotes[id] = { children: [new Paragraph({ children: r.note.map(n => new TextRun({ text: n.text, bold: n.bold, italics: n.italic })) })] };
    return new FootnoteReferenceRun(id);
  });
}

export async function toDocx(project: OpenProject, options: ExportOptions = {}): Promise<Buffer> {
  const { title, author } = project.manifest;
  const headingLevels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
  const paragraphs: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun(title)] })
  ];
  if (author) paragraphs.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(author)] }));

  const footnotes: Record<number, { children: Paragraph[] }> = {};
  let firstAfterBreak = true;
  for (const block of manuscriptBlocks(project, options.hyphenate)) {
    if (block.type === 'break') {
      paragraphs.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 }, children: [new TextRun('* * *')] }));
      firstAfterBreak = true;
      continue;
    }
    const runs = docxRuns(block.runs, block.type === 'quote', footnotes);
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
    footnotes,
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
  const footnotes: Record<number, { children: Paragraph[] }> = {};
  let firstAfterBreak = true;
  for (const block of manuscriptBlocks(project)) {
    if (block.type === 'break') {
      body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 360, before: 240, after: 240 }, children: [new TextRun('#')] }));
      firstAfterBreak = true;
      continue;
    }
    const runs = docxRuns(block.runs, block.type === 'quote', footnotes);
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
    footnotes,
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
p { margin: 0; text-indent: 1.5em; text-align: justify; -webkit-hyphens: manual; hyphens: manual; }
sup.fn { font-size: 0.7em; line-height: 0; }
sup.fn a { text-decoration: none; }
aside.footnote { font-size: 0.85em; margin-top: 1em; }
aside.footnote p { text-indent: 0; text-align: left; }
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
export async function toEpub(project: OpenProject, now = new Date(), options: ExportOptions = {}): Promise<Buffer> {
  const { title, author, language, id } = project.manifest;
  const lang = xmlEscape(language || 'fi');

  // Each top-level node with its descendants becomes one chapter file; its notes
  // follow it as EPUB 3 footnotes (reading systems show them as pop-ups)
  let noteCount = 0;
  const chapters = project.manifest.structure.map((top, index) => {
    const sub: OpenProject = { ...project, manifest: { ...project.manifest, structure: [top] } };
    const notes = noteList(noteCount);
    const ref = (note: Run[]) => {
      const n = notes.add(note);
      return `<sup class="fn"><a epub:type="noteref" href="#fn-${n}" id="ref-${n}">${n}</a></sup>`;
    };
    const body = blocksToHtml(manuscriptBlocks(sub, options.hyphenate), ref);
    const asides = notes.notes.map(
      (n, i) => `<aside epub:type="footnote" class="footnote" id="fn-${noteCount + i + 1}"><p><a href="#ref-${noteCount + i + 1}">${noteCount + i + 1}.</a> ${runsToHtml(n)}</p></aside>`
    );
    noteCount = notes.next;
    const html = [body, ...asides].join('\n').replace(/<br>/g, '<br/>');
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

/**
 * AI use statement: words written by the author, edited with AI and written by
 * AI, per chapter. Publishers and competitions increasingly ask for this.
 */
export function toProvenanceReport(project: OpenProject, provenance: ProvenanceFile | null, now = new Date()): string {
  const docs = provenance?.docs ?? {};
  const rows: string[] = [];
  const totals = { total: 0, own: 0, ai: 0, aiEdit: 0 };
  const models = new Set<string>();
  const pct = (n: number, of: number) => (of > 0 ? `${((n / of) * 100).toFixed(1).replace('.', ',')} %` : '–');

  for (const { node, depth } of collectSections(project)) {
    const stats = provenanceStats(project.docs[node.id]?.body ?? '', docs[node.id]);
    for (const span of docs[node.id]?.spans ?? []) if (span.model) models.add(span.model);
    totals.total += stats.total;
    totals.own += stats.own;
    totals.ai += stats.ai;
    totals.aiEdit += stats.aiEdit;
    rows.push(`| ${'&nbsp;&nbsp;'.repeat(depth)}${node.title} | ${stats.total} | ${pct(stats.own, stats.total)} | ${pct(stats.aiEdit, stats.total)} | ${pct(stats.ai, stats.total)} |`);
  }

  return [
    `# AI-selvitys: ${project.manifest.title}`,
    '',
    `${project.manifest.author ? `Kirjoittaja: ${project.manifest.author}  \n` : ''}Laadittu: ${now.toLocaleDateString('fi-FI')} (FAUST)`,
    '',
    `Käsikirjoituksessa on ${totals.total.toLocaleString('fi-FI')} sanaa. Niistä kirjoittajan omaa tekstiä on ${pct(totals.own, totals.total)}, ` +
      `tekoälyn avulla muokattua ${pct(totals.aiEdit, totals.total)} ja tekoälyn kirjoittamaa ${pct(totals.ai, totals.total)}.`,
    '',
    models.size > 0 ? `Käytetyt mallit: ${[...models].sort().join(', ')}.` : 'Tekoälyn tuottamaa tai muokkaamaa tekstiä ei ole merkitty.',
    '',
    '*Muokattu* tarkoittaa kohtia, joissa kirjoittaja on hyväksynyt tekoälyn muutosehdotuksen. Tekoälyn kanssa käydyt keskustelut, joista ei ole siirretty tekstiä käsikirjoitukseen, eivät näy luvuissa.',
    '',
    '| Luku | Sanoja | Oma | AI:n muokkaama | AI:n kirjoittama |',
    '|---|---:|---:|---:|---:|',
    ...rows,
    `| **Yhteensä** | **${totals.total}** | **${pct(totals.own, totals.total)}** | **${pct(totals.aiEdit, totals.total)}** | **${pct(totals.ai, totals.total)}** |`,
    ''
  ].join('\n');
}

export async function exportProject(
  project: OpenProject,
  format: Exclude<ExportFormat, 'pdf'>,
  provenance: ProvenanceFile | null = null,
  options: ExportOptions = {}
): Promise<string | Buffer> {
  switch (format) {
    case 'md':
      return toMarkdown(project);
    case 'txt':
      return toPlainText(project);
    case 'html':
      return toHtml(project);
    case 'docx':
      return toDocx(project, options);
    case 'manuscript':
      return toManuscriptDocx(project);
    case 'epub':
      return toEpub(project, new Date(), options);
    case 'provenance':
      return toProvenanceReport(project, provenance);
  }
}

/**
 * Compile the manuscript (in binder order) into a single file.
 * Chapters become headings, scenes are separated by scene breaks.
 */
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
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
  }
}

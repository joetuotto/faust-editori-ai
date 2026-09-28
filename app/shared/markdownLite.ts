/**
 * Minimal Markdown reader for manuscript export: paragraphs, headings,
 * blockquotes, scene breaks and inline *italic* / **bold**. The manuscript
 * only ever contains this subset, so a full Markdown parser is not needed.
 */

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type Block =
  | { type: 'heading'; level: number; runs: Run[] }
  | { type: 'paragraph'; runs: Run[] }
  | { type: 'quote'; runs: Run[] }
  | { type: 'break' };

const SCENE_BREAK = /^\s*(\*\s*\*\s*\*|-{3,}|#)\s*$/;

export function parseInline(text: string): Run[] {
  const runs: Run[] = [];
  const re = /(\*\*\*|___)(.+?)\1|(\*\*|__)(.+?)\3|(\*|_)(.+?)\5/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) runs.push({ text: text.slice(last, m.index) });
    if (m[2] !== undefined) runs.push({ text: m[2], bold: true, italic: true });
    else if (m[4] !== undefined) runs.push({ text: m[4], bold: true });
    else runs.push({ text: m[6], italic: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs.map(r => ({ ...r, text: r.text.replace(/\\([\\*_#>`-])/g, '$1') }));
}

export function parseBlocks(markdown: string): Block[] {
  return markdown
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .map((chunk): Block => {
      if (SCENE_BREAK.test(chunk)) return { type: 'break' };
      const heading = chunk.match(/^(#{1,6})\s+(.*)$/s);
      if (heading) return { type: 'heading', level: heading[1].length, runs: parseInline(heading[2].replace(/\n/g, ' ')) };
      if (chunk.startsWith('>')) {
        return { type: 'quote', runs: parseInline(chunk.replace(/^>\s?/gm, '').replace(/\n/g, ' ')) };
      }
      return { type: 'paragraph', runs: parseInline(chunk.replace(/\n/g, ' ')) };
    });
}

export function runsToPlain(runs: Run[]): string {
  return runs.map(r => r.text).join('');
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function runsToHtml(runs: Run[]): string {
  return runs
    .map(r => {
      let html = escapeHtml(r.text);
      if (r.italic) html = `<em>${html}</em>`;
      if (r.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

export function blocksToHtml(blocks: Block[]): string {
  return blocks
    .map(b => {
      switch (b.type) {
        case 'heading':
          return `<h${b.level}>${runsToHtml(b.runs)}</h${b.level}>`;
        case 'quote':
          return `<blockquote><p>${runsToHtml(b.runs)}</p></blockquote>`;
        case 'break':
          return '<p class="scene-break">* * *</p>';
        default:
          return `<p>${runsToHtml(b.runs)}</p>`;
      }
    })
    .join('\n');
}

/**
 * Minimal Markdown reader for manuscript export: paragraphs, headings,
 * blockquotes, scene breaks, inline *italic* / **bold** and footnotes
 * ^[like this]. The manuscript only ever contains this subset, so a full
 * Markdown parser is not needed.
 */

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** A footnote reference; `text` is empty and the note's own text is here */
  note?: Run[];
}

/**
 * End index (exclusive) of an inline footnote `^[...]` starting at `start`,
 * or -1. Brackets inside the note must balance; `\]` is literal.
 */
export function footnoteEnd(src: string, start = 0): number {
  if (!src.startsWith('^[', start)) return -1;
  let depth = 0;
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') i++;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return i + 1;
    else if (c === '\n' && src[i + 1] === '\n') return -1;
  }
  return -1;
}

/** Private-use placeholder for a footnote while emphasis is parsed */
const NOTE_MARK = '\uE000';

export type Block =
  | { type: 'heading'; level: number; runs: Run[] }
  | { type: 'paragraph'; runs: Run[] }
  | { type: 'quote'; runs: Run[] }
  | { type: 'break' };

const SCENE_BREAK = /^\s*(\*\s*\*\s*\*|-{3,}|#)\s*$/;

export function parseInline(source: string): Run[] {
  // Footnotes may sit inside emphasis, so they are cut out first
  const notes: string[] = [];
  let text = '';
  for (let i = 0; i < source.length; ) {
    const end = source[i] === '^' ? footnoteEnd(source, i) : -1;
    if (end > 0) {
      notes.push(source.slice(i + 2, end - 1));
      text += NOTE_MARK;
      i = end;
    } else {
      text += source[i++];
    }
  }
  const runs = parseEmphasis(text);
  if (notes.length === 0) return runs;
  let n = 0;
  return runs.flatMap(r =>
    r.text.split(NOTE_MARK).flatMap((part, i): Run[] => [
      ...(i > 0 ? [{ text: '', note: parseInline(notes[n++] ?? '') }] : []),
      ...(part ? [{ ...r, text: part }] : [])
    ])
  );
}

function parseEmphasis(text: string): Run[] {
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
  return runs.map(r => ({ ...r, text: r.text.replace(/\\([\\*_#>`[\]-])/g, '$1') }));
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

/** Plain text; footnotes are left out unless `noteMark` gives them a marker */
export function runsToPlain(runs: Run[], noteMark?: (note: Run[]) => string): string {
  return runs.map(r => (r.note ? (noteMark?.(r.note) ?? '') : r.text)).join('');
}

/** Renders a footnote reference and records the note (e.g. for endnotes) */
export type NoteRenderer = (note: Run[]) => string;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function runsToHtml(runs: Run[], notes?: NoteRenderer): string {
  return runs
    .map(r => {
      if (r.note) return notes ? notes(r.note) : '';
      let html = escapeHtml(r.text);
      if (r.italic) html = `<em>${html}</em>`;
      if (r.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

export function blocksToHtml(blocks: Block[], notes?: NoteRenderer): string {
  return blocks
    .map(b => {
      switch (b.type) {
        case 'heading':
          return `<h${b.level}>${runsToHtml(b.runs, notes)}</h${b.level}>`;
        case 'quote':
          return `<blockquote><p>${runsToHtml(b.runs, notes)}</p></blockquote>`;
        case 'break':
          return '<p class="scene-break">* * *</p>';
        default:
          return `<p>${runsToHtml(b.runs, notes)}</p>`;
      }
    })
    .join('\n');
}

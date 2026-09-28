import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** Short random id, stable for the lifetime of a document */
export function newId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** File-name friendly slug that keeps Finnish letters readable */
export function slugify(text: string, maxLength = 40): string {
  const slug = text
    .toLowerCase()
    .replace(/[äå]/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/, '');
  return slug || 'nimeton';
}

/** Word count for Markdown text, ignoring markup characters */
export function countWords(markdown: string): number {
  const text = markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>#]/g, ' ')
    .trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Split a Markdown file into YAML frontmatter and body */
export function parseFrontmatter<T = Record<string, unknown>>(source: string): { data: T; body: string } {
  const match = source.match(FRONTMATTER);
  if (!match) return { data: {} as T, body: source };
  const data = (parseYaml(match[1]) ?? {}) as T;
  return { data, body: source.slice(match[0].length).replace(/^\r?\n/, '') };
}

/** Serialize frontmatter + body; undefined values are dropped */
export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  const yaml = stringifyYaml(clean, { lineWidth: 0 }).trimEnd();
  const text = body.endsWith('\n') || body === '' ? body : body + '\n';
  return `---\n${yaml}\n---\n\n${text}`;
}

/**
 * Old FAUST chapters came from a textarea where one line break meant a new
 * paragraph. Markdown needs a blank line between paragraphs.
 */
export function plainLinesToMarkdown(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(block => block.split('\n').map(line => line.trimEnd()).filter(Boolean).join('\n\n'))
    .filter(Boolean)
    .join('\n\n');
}

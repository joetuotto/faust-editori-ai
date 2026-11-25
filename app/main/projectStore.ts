/**
 * Reads and writes folder-based FAUST projects (format version 3).
 * See app/shared/types.ts for the layout.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  type BibleEntry,
  type BibleKind,
  type Doc,
  type DocMeta,
  type OpenProject,
  type ProjectManifest,
  type TreeNode
} from '../shared/types';
import { newId, parseFrontmatter, stringifyFrontmatter } from '../shared/text';
import { docFileFor, flatten } from '../shared/tree';
import { DEFAULT_MODELS } from '../shared/models';
import { exists, resolveInside, writeFileAtomic } from './fsutil';

export const MANIFEST_FILE = 'project.json';
export const PROJECT_EXTENSION = '.faust';
const BIBLE_KINDS: BibleKind[] = ['characters', 'locations', 'threads'];

export const PROJECT_GITIGNORE = `# FAUST: app caches and trash are not part of the manuscript history
.faust/trash/
.faust/cache/
.DS_Store
`;

export function emptyManifest(title: string, now = new Date().toISOString()): ProjectManifest {
  return {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    id: newId(),
    title,
    author: '',
    language: 'fi',
    genre: 'fiction',
    created: now,
    modified: now,
    targets: { totalWords: 80000, dailyWords: 1000 },
    ai: { provider: 'anthropic', models: { ...DEFAULT_MODELS } },
    structure: [],
    bible: { characters: [], locations: [], threads: [] }
  };
}

export function newDocMeta(id: string, type: DocMeta['type'], title: string, now = new Date().toISOString()): DocMeta {
  return { id, title, type, status: 'draft', synopsis: '', notes: '', created: now, modified: now };
}

export async function isProjectFolder(dir: string): Promise<boolean> {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(dir, MANIFEST_FILE), 'utf-8'));
    return manifest?.format === PROJECT_FORMAT;
  } catch {
    return false;
  }
}

/** A folder name that doesn't exist yet: "Romaani.faust", "Romaani 2.faust", ... */
export async function uniqueProjectPath(parentDir: string, title: string): Promise<string> {
  const base = title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Nimetön projekti';
  for (let i = 1; ; i++) {
    const candidate = path.join(parentDir, `${base}${i > 1 ? ` ${i}` : ''}${PROJECT_EXTENSION}`);
    if (!(await exists(candidate))) return candidate;
  }
}

export async function writeManifest(projectPath: string, manifest: ProjectManifest): Promise<void> {
  await writeFileAtomic(path.join(projectPath, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n');
}

export async function writeDoc(projectPath: string, file: string, doc: Doc): Promise<void> {
  const { meta, body } = doc;
  await writeFileAtomic(resolveInside(projectPath, file), stringifyFrontmatter(meta, body));
}

export async function readDoc(projectPath: string, node: TreeNode): Promise<Doc> {
  const now = new Date().toISOString();
  try {
    const source = await fs.readFile(resolveInside(projectPath, node.file), 'utf-8');
    const { data, body } = parseFrontmatter<Partial<DocMeta>>(source);
    return {
      meta: { ...newDocMeta(node.id, node.type, node.title, now), ...data, id: node.id, type: node.type },
      body
    };
  } catch (error) {
    // A missing file becomes an empty document instead of failing the whole project
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { meta: newDocMeta(node.id, node.type, node.title, now), body: '' };
    }
    throw error;
  }
}

export function bibleEntryToFile(entry: BibleEntry): string {
  const { body, file: _file, kind: _kind, ...meta } = entry;
  return stringifyFrontmatter(meta, body);
}

export async function writeBibleEntry(projectPath: string, entry: BibleEntry): Promise<void> {
  await writeFileAtomic(resolveInside(projectPath, entry.file), bibleEntryToFile(entry));
}

async function readBible(projectPath: string, manifest: ProjectManifest): Promise<Record<string, BibleEntry>> {
  const entries: Record<string, BibleEntry> = {};
  for (const kind of BIBLE_KINDS) {
    for (const file of manifest.bible?.[kind] ?? []) {
      try {
        const source = await fs.readFile(resolveInside(projectPath, file), 'utf-8');
        const { data, body } = parseFrontmatter<Partial<BibleEntry>>(source);
        if (!data.id) continue;
        entries[data.id] = {
          id: data.id,
          kind,
          name: data.name ?? '',
          summary: data.summary ?? '',
          fields: data.fields ?? {},
          body,
          file,
          created: data.created ?? manifest.created,
          modified: data.modified ?? manifest.modified
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
  return entries;
}

/** Fill in fields added in later format revisions */
function normalizeManifest(raw: Partial<ProjectManifest>): ProjectManifest {
  const base = emptyManifest(raw.title ?? 'Nimetön projekti', raw.created);
  return {
    ...base,
    ...raw,
    targets: { ...base.targets, ...raw.targets },
    ai: { ...base.ai, ...raw.ai, models: { ...base.ai.models, ...raw.ai?.models } },
    bible: { ...base.bible, ...raw.bible },
    structure: raw.structure ?? []
  } as ProjectManifest;
}

export async function openProject(projectPath: string): Promise<OpenProject> {
  const raw = JSON.parse(await fs.readFile(path.join(projectPath, MANIFEST_FILE), 'utf-8'));
  if (raw?.format !== PROJECT_FORMAT) {
    throw new Error('Kansio ei ole FAUST-projekti (project.json puuttuu tai on väärää muotoa).');
  }
  if (raw.formatVersion > PROJECT_FORMAT_VERSION) {
    throw new Error('Projekti on tehty uudemmalla FAUST-versiolla. Päivitä sovellus.');
  }
  const manifest = normalizeManifest(raw);

  const docs: Record<string, Doc> = {};
  for (const node of flatten(manifest.structure)) {
    docs[node.id] = await readDoc(projectPath, node);
  }

  return { path: projectPath, manifest, docs, bible: await readBible(projectPath, manifest) };
}

/** Create a new project folder with one empty chapter */
export async function createProject(parentDir: string, title: string): Promise<string> {
  const projectPath = await uniqueProjectPath(parentDir, title);
  await fs.mkdir(path.join(projectPath, 'manuscript'), { recursive: true });
  await fs.mkdir(path.join(projectPath, '.faust'), { recursive: true });

  const manifest = emptyManifest(title);
  const id = newId();
  const chapter: TreeNode = { id, type: 'chapter', title: 'Luku 1', file: docFileFor('Luku 1', id) };
  manifest.structure.push(chapter);

  await writeDoc(projectPath, chapter.file, { meta: newDocMeta(id, 'chapter', 'Luku 1'), body: '' });
  await writeManifest(projectPath, manifest);
  await writeFileAtomic(path.join(projectPath, '.gitignore'), PROJECT_GITIGNORE);
  return projectPath;
}

/**
 * Deleted documents go to .faust/trash instead of being removed, so an
 * accidental delete can always be recovered from the folder.
 */
export async function trashFiles(projectPath: string, files: string[]): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const file of files) {
    const source = resolveInside(projectPath, file);
    if (!(await exists(source))) continue;
    const target = resolveInside(projectPath, path.join('.faust', 'trash', stamp, file));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rename(source, target);
  }
}

export async function readInternal(projectPath: string, name: string): Promise<string | null> {
  try {
    return await fs.readFile(resolveInside(projectPath, path.join('.faust', name)), 'utf-8');
  } catch {
    return null;
  }
}

export async function writeInternal(projectPath: string, name: string, content: string): Promise<void> {
  await writeFileAtomic(resolveInside(projectPath, path.join('.faust', name)), content);
}

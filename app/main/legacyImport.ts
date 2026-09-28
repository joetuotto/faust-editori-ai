/**
 * One-way converter from the old single-file .faust/.json format (FAUST 1.x/2.x)
 * to the folder format. Nothing is dropped: data without a place in the new
 * format (snapshots, bookmarks, annotations, AI metadata, ...) is kept in
 * .faust/legacy.json inside the new project.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BibleEntry, BibleKind, Doc, DocMeta, DocStatus, NodeType, ProjectManifest, ProviderId, TreeNode } from '../shared/types';
import { newId, plainLinesToMarkdown } from '../shared/text';
import { bibleFileFor, docFileFor } from '../shared/tree';
import { resolveModel } from '../shared/models';
import { PROJECT_GITIGNORE, emptyManifest, uniqueProjectPath, writeBibleEntry, writeDoc, writeInternal, writeManifest } from './projectStore';
import { writeFileAtomic } from './fsutil';

/* eslint-disable @typescript-eslint/no-explicit-any */
type LegacyDoc = Record<string, any>;
type LegacyProject = Record<string, any>;

export interface ConvertedProject {
  manifest: ProjectManifest;
  docs: { node: TreeNode; doc: Doc }[];
  bible: BibleEntry[];
  leftovers: Record<string, unknown>;
}

const STATUSES: DocStatus[] = ['plan', 'draft', 'revision', 'final'];
const PROVIDERS: ProviderId[] = ['anthropic', 'openai', 'grok', 'gemini', 'deepseek'];

// Fields mapped into the new format; everything else per document is kept as-is
const MAPPED_DOC_FIELDS = new Set([
  'id', 'type', 'title', 'order', 'content', 'wordCount', 'children', 'parentId',
  'synopsis', 'synopsisManual', 'notes', 'status', 'povCharacter', 'label', 'storyTimestamp',
  'created', 'modified'
]);

function asType(value: unknown): NodeType {
  return value === 'folder' || value === 'scene' ? value : 'chapter';
}

function asStatus(value: unknown): DocStatus {
  return STATUSES.includes(value as DocStatus) ? (value as DocStatus) : 'draft';
}

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function isLegacyProject(data: unknown): data is LegacyProject {
  return !!data && typeof data === 'object' && Array.isArray((data as LegacyProject).structure) &&
    (data as LegacyProject).format !== 'faust-project';
}

function convertDocs(
  items: LegacyDoc[],
  now: string,
  out: { node: TreeNode; doc: Doc }[],
  extras: Record<string, unknown>
): TreeNode[] {
  return [...items]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(item => {
      const id = newId();
      const type = asType(item.type);
      const title = str(item.title) || 'Nimetön';
      const node: TreeNode = { id, type, title, file: docFileFor(title, id) };

      const meta: DocMeta = {
        id,
        title,
        type,
        status: asStatus(item.status),
        synopsis: str(item.synopsisManual || item.synopsis),
        notes: str(item.notes),
        created: str(item.created) || now,
        modified: str(item.modified) || now
      };
      if (item.povCharacter) meta.pov = str(item.povCharacter);
      if (item.label) meta.label = str(item.label);
      if (item.storyTimestamp) meta.storyTime = str(item.storyTimestamp);

      const unmapped = Object.fromEntries(Object.entries(item).filter(([k]) => !MAPPED_DOC_FIELDS.has(k)));
      if (Object.keys(unmapped).length > 0) extras[id] = { legacyId: item.id, ...unmapped };

      out.push({ node, doc: { meta, body: plainLinesToMarkdown(str(item.content)) } });

      if (Array.isArray(item.children) && item.children.length > 0) {
        node.children = convertDocs(item.children, now, out, extras);
      }
      return node;
    });
}

function bibleEntry(kind: BibleKind, raw: LegacyDoc, now: string): BibleEntry {
  const id = newId();
  const info = (raw.basicInfo && typeof raw.basicInfo === 'object' ? raw.basicInfo : {}) as Record<string, unknown>;
  const name = str(info.name || raw.name || raw.title) || 'Nimetön';
  const summary = str(raw.summary || raw.role || info.role || raw.type || '');

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...info, ...raw })) {
    if (['id', 'name', 'title', 'basicInfo', 'description', 'notes', 'created', 'modified'].includes(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    fields[key] = str(value);
  }

  const body = [str(raw.description), str(raw.notes)].filter(Boolean).join('\n\n');
  return {
    id,
    kind,
    name,
    summary,
    fields,
    body,
    file: bibleFileFor(kind, name, id),
    created: str(raw.created) || now,
    modified: str(raw.modified) || now
  };
}

export function convertLegacy(legacy: LegacyProject, now = new Date().toISOString()): ConvertedProject {
  const manifest = emptyManifest(str(legacy.title) || 'Nimetön projekti', str(legacy.created) || now);
  manifest.author = str(legacy.author);
  manifest.genre = str(legacy.genre) || manifest.genre;
  manifest.language = str(legacy.language) || manifest.language;
  if (legacy.targets) {
    manifest.targets = {
      totalWords: Number(legacy.targets.totalWords) || manifest.targets.totalWords,
      dailyWords: Number(legacy.targets.dailyWords) || manifest.targets.dailyWords
    };
  }

  const provider = PROVIDERS.includes(legacy.ai?.provider) ? (legacy.ai.provider as ProviderId) : 'anthropic';
  manifest.ai.provider = provider;
  for (const p of PROVIDERS) {
    const model = legacy.ai?.models?.[p];
    if (model) manifest.ai.models[p] = resolveModel(p, model);
  }

  const docs: { node: TreeNode; doc: Doc }[] = [];
  const docExtras: Record<string, unknown> = {};
  manifest.structure = convertDocs(Array.isArray(legacy.structure) ? legacy.structure : [], now, docs, docExtras);

  const bible: BibleEntry[] = [
    ...(legacy.characters ?? []).map((c: LegacyDoc) => bibleEntry('characters', c, now)),
    ...(legacy.locations ?? []).map((l: LegacyDoc) => bibleEntry('locations', l, now)),
    ...(legacy.plotThreads ?? []).map((t: LegacyDoc) => bibleEntry('threads', t, now))
  ];
  for (const entry of bible) manifest.bible[entry.kind].push(entry.file);

  const consumed = new Set([
    'title', 'author', 'genre', 'language', 'created', 'modified', 'version', 'targets',
    'structure', 'characters', 'locations', 'plotThreads', 'apiConfig'
  ]);
  const leftovers: Record<string, unknown> = Object.fromEntries(
    Object.entries(legacy).filter(([k]) => !consumed.has(k))
  );
  if (Object.keys(docExtras).length > 0) leftovers.documentExtras = docExtras;

  return { manifest, docs, bible, leftovers };
}

/** Write a converted project to a new folder next to `parentDir`; returns its path */
export async function importLegacyFile(legacyFile: string, parentDir: string): Promise<string> {
  const legacy = JSON.parse(await fs.readFile(legacyFile, 'utf-8'));
  if (!isLegacyProject(legacy)) {
    throw new Error('Tiedosto ei ole vanhan FAUST-version projekti.');
  }

  const converted = convertLegacy(legacy);
  const projectPath = await uniqueProjectPath(parentDir, converted.manifest.title);
  await fs.mkdir(projectPath, { recursive: true });

  for (const { node, doc } of converted.docs) await writeDoc(projectPath, node.file, doc);
  for (const entry of converted.bible) await writeBibleEntry(projectPath, entry);
  await writeInternal(projectPath, 'legacy.json', JSON.stringify(
    { importedFrom: path.basename(legacyFile), importedAt: new Date().toISOString(), ...converted.leftovers },
    null,
    2
  ));
  await writeFileAtomic(path.join(projectPath, '.gitignore'), PROJECT_GITIGNORE);
  await writeManifest(projectPath, converted.manifest);
  return projectPath;
}

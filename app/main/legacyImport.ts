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
import { bookmarkLabel, type CommentThread, type CommentsFile, type DocComments } from '../shared/comments';
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
  /** Legacy annotations and bookmarks as comment threads per new document id */
  comments: Record<string, DocComments>;
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

/**
 * The legacy editor stored a plain-text offset. Lines became paragraphs, so
 * an offset only roughly survives; the quoted text is the real anchor and the
 * offset only picks between repeated phrases.
 */
function legacyAnchor(content: string, position: unknown, length: unknown, wholeLine: boolean): { quote: string; hint: number } | null {
  const text = content.replace(/\r\n/g, '\n');
  const pos = Math.max(0, Math.min(Number(position) || 0, text.length));
  let start = pos;
  let end = pos + Math.max(0, Number(length) || 0);
  if (wholeLine || end === start) {
    // No range: the line (bookmark) or the word at the offset
    const boundary = wholeLine ? /\n/ : /[\s.,;:!?”"'()–—-]/;
    while (start > 0 && !boundary.test(text[start - 1])) start--;
    while (end < text.length && !boundary.test(text[end])) end++;
  }
  // Anchors stay inside one paragraph; asterisks and underscores became emphasis in Markdown
  const quote = text.slice(start, Math.min(end, text.length)).split('\n')[0].replace(/[*_]/g, '').trim();
  if (!quote) return null;
  // Every newline before the offset became a paragraph break (two characters)
  const newlines = (text.slice(0, start).match(/\n/g) ?? []).length;
  return { quote, hint: start + newlines };
}

function annotationThreads(item: LegacyDoc, now: string): CommentThread[] {
  const content = str(item.content);
  const list: LegacyDoc[] = Array.isArray(item.annotations) ? item.annotations : [];
  return list.flatMap(a => {
    const anchor = legacyAnchor(content, a.position, a.length, false);
    const text = str(a.content || a.text || a.note).trim();
    if (!anchor || !text) return [];
    const label = [a.type && String(a.type).startsWith('ai_') ? 'AI' : '', a.priority && a.priority !== 'medium' ? str(a.priority) : '']
      .filter(Boolean)
      .join(', ');
    return [
      {
        id: newId(),
        kind: 'comment' as const,
        quote: anchor.quote,
        start: -1,
        end: -1,
        hint: anchor.hint,
        messages: [{ author: 'import' as const, text: label ? `[${label}] ${text}` : text, at: str(a.createdAt) || now }],
        resolved: !!a.resolved,
        created: str(a.createdAt) || now
      }
    ];
  });
}

function convertDocs(
  items: LegacyDoc[],
  now: string,
  out: { node: TreeNode; doc: Doc }[],
  extras: Record<string, unknown>,
  legacyIds: Map<string, { id: string; content: string }>,
  comments: Record<string, DocComments>
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
      if (item.id !== undefined) legacyIds.set(String(item.id), { id, content: str(item.content) });
      const threads = annotationThreads(item, now);
      if (threads.length > 0) comments[id] = { hash: '', threads };

      if (Array.isArray(item.children) && item.children.length > 0) {
        node.children = convertDocs(item.children, now, out, extras, legacyIds, comments);
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
  const legacyIds = new Map<string, { id: string; content: string }>();
  const comments: Record<string, DocComments> = {};
  manifest.structure = convertDocs(Array.isArray(legacy.structure) ? legacy.structure : [], now, docs, docExtras, legacyIds, comments);

  for (const b of Array.isArray(legacy.bookmarks) ? (legacy.bookmarks as LegacyDoc[]) : []) {
    const target = legacyIds.get(String(b.chapterId));
    const anchor = target && legacyAnchor(target.content, b.position, 0, true);
    if (!target || !anchor) continue;
    const doc = (comments[target.id] ??= { hash: '', threads: [] });
    doc.threads.push({
      id: newId(),
      kind: 'bookmark',
      label: str(b.name) || bookmarkLabel(anchor.quote),
      quote: anchor.quote,
      start: -1,
      end: -1,
      hint: anchor.hint,
      messages: [],
      resolved: false,
      created: str(b.created) || now
    });
  }

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

  return { manifest, docs, bible, leftovers, comments };
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
  if (Object.keys(converted.comments).length > 0) {
    const file: CommentsFile = { version: 1, docs: converted.comments };
    await writeInternal(projectPath, 'comments.json', JSON.stringify(file, null, 1));
  }
  await writeFileAtomic(path.join(projectPath, '.gitignore'), PROJECT_GITIGNORE);
  await writeManifest(projectPath, converted.manifest);
  return projectPath;
}

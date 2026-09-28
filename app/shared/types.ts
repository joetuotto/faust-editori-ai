/**
 * FAUST project model (format version 3).
 *
 * A project is a folder:
 *   Romaani.faust/
 *     project.json                    manifest: metadata, settings, binder tree
 *     manuscript/<slug>-<id>.md       one file per chapter/scene (frontmatter + Markdown)
 *     bible/<kind>/<slug>-<id>.md     characters, locations, threads
 *     .faust/                         app-internal state (chat memory, legacy data)
 *     .git/                           automatic version history
 */

export const PROJECT_FORMAT = 'faust-project';
export const PROJECT_FORMAT_VERSION = 3;

export type NodeType = 'folder' | 'chapter' | 'scene';
export type DocStatus = 'plan' | 'draft' | 'revision' | 'final';

/** Binder tree node stored in project.json; text lives in the node's file */
export interface TreeNode {
  id: string;
  type: NodeType;
  title: string;
  /** Path relative to the project folder, e.g. manuscript/luku-1-a1b2c3.md */
  file: string;
  children?: TreeNode[];
}

/** Frontmatter of a manuscript document */
export interface DocMeta {
  id: string;
  title: string;
  type: NodeType;
  status: DocStatus;
  synopsis: string;
  notes: string;
  pov?: string;
  label?: string;
  storyTime?: string;
  created: string;
  modified: string;
  /** Unknown fields are preserved on round-trip */
  [key: string]: unknown;
}

export interface Doc {
  meta: DocMeta;
  /** Markdown body */
  body: string;
}

export type BibleKind = 'characters' | 'locations' | 'threads';

export interface BibleEntry {
  id: string;
  kind: BibleKind;
  name: string;
  /** Short one-line description shown in lists */
  summary: string;
  /** Free-form structured fields (role, age, appearance, ...) */
  fields: Record<string, string>;
  /** Longer notes, Markdown */
  body: string;
  file: string;
  created: string;
  modified: string;
}

export type ProviderId = 'anthropic' | 'openai' | 'grok' | 'gemini' | 'deepseek';

export interface AISettings {
  provider: ProviderId;
  models: Partial<Record<ProviderId, string>>;
}

export interface ProjectTargets {
  totalWords: number;
  dailyWords: number;
}

export interface ProjectManifest {
  format: typeof PROJECT_FORMAT;
  formatVersion: number;
  id: string;
  title: string;
  author: string;
  language: string;
  genre: string;
  created: string;
  modified: string;
  targets: ProjectTargets;
  ai: AISettings;
  structure: TreeNode[];
  bible: Record<BibleKind, string[]>;
}

/** Everything the renderer needs to show an open project */
export interface OpenProject {
  path: string;
  manifest: ProjectManifest;
  docs: Record<string, Doc>;
  bible: Record<string, BibleEntry>;
}

export interface RecentProject {
  path: string;
  title: string;
  opened: string;
}

export interface HistoryEntry {
  oid: string;
  message: string;
  timestamp: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  provider?: ProviderId;
  model?: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Ask for JSON matching this schema (native structured output where supported) */
  jsonSchema?: Record<string, unknown>;
  /** Reasoning effort for models that support it */
  effort?: 'low' | 'medium' | 'high';
}

export interface AIResult {
  success: boolean;
  text?: string;
  error?: string;
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface ModelInfo {
  id: string;
  name: string;
}

/** A grammar problem inside one paragraph (offsets relative to the paragraph text) */
export interface GrammarIssue {
  start: number;
  length: number;
  suggestions: string[];
  description: string;
}

export type ExportFormat = 'docx' | 'manuscript' | 'epub' | 'md' | 'html' | 'txt' | 'provenance';

/** File extension for each export format */
export const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  docx: 'docx',
  manuscript: 'docx',
  epub: 'epub',
  md: 'md',
  html: 'html',
  txt: 'txt',
  provenance: 'md'
};

export type Result<T = void> = { success: true; data: T } | { success: false; error: string };

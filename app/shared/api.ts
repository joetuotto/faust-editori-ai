/**
 * The API the preload script exposes to the renderer as `window.faust`.
 * Everything that touches disk, keys or the network goes through here.
 */
import type {
  AIRequest,
  AIResult,
  BibleEntry,
  Doc,
  ExportFormat,
  HistoryEntry,
  ModelInfo,
  OpenProject,
  ProjectManifest,
  ProviderId,
  RecentProject,
  Result
} from './types';

export interface AppSettingsView {
  theme: 'NOX' | 'DEIS';
  recent: RecentProject[];
  lastProject: string | null;
}

export type MenuCommand =
  | 'new-project'
  | 'open-project'
  | 'import-legacy'
  | 'snapshot'
  | 'export'
  | 'new-chapter'
  | 'new-scene'
  | 'toggle-theme'
  | 'toggle-binder'
  | 'toggle-inspector'
  | 'toggle-ai'
  | 'show-bible'
  | 'show-settings'
  | 'focus-mode';

export interface FaustAPI {
  app: {
    getSettings(): Promise<AppSettingsView>;
    setTheme(theme: 'NOX' | 'DEIS'): Promise<void>;
    forgetRecent(path: string): Promise<AppSettingsView>;
    onMenu(handler: (command: MenuCommand) => void): () => void;
  };
  project: {
    create(title: string): Promise<Result<OpenProject> | null>;
    openDialog(): Promise<Result<OpenProject> | null>;
    open(path: string): Promise<Result<OpenProject>>;
    importLegacy(): Promise<Result<OpenProject> | null>;
    close(): Promise<void>;
    saveManifest(manifest: ProjectManifest): Promise<Result>;
    saveDoc(file: string, doc: Doc): Promise<Result>;
    saveBible(entry: BibleEntry): Promise<Result>;
    trash(files: string[]): Promise<Result>;
    snapshot(message: string): Promise<Result<string | null>>;
    history(file?: string): Promise<HistoryEntry[]>;
    readAt(oid: string, file: string): Promise<string | null>;
    readInternal(name: InternalFile): Promise<string | null>;
    writeInternal(name: InternalFile, content: string): Promise<Result>;
    reveal(): Promise<void>;
    export(format: ExportFormat): Promise<Result<string> | null>;
  };
  ai: {
    keyStatus(): Promise<Record<ProviderId, boolean>>;
    setKey(provider: ProviderId, key: string): Promise<{ encrypted: boolean }>;
    listModels(provider: ProviderId): Promise<{ success: boolean; models?: ModelInfo[]; error?: string }>;
    /** Streams text through onText; resolves with the complete result */
    generate(request: AIRequest, onText?: (text: string) => void, options?: { think?: boolean }): { id: string; result: Promise<AIResult> };
    cancel(id: string): void;
  };
}

/** Internal files the renderer may read/write inside <project>/.faust/ */
export const INTERNAL_FILES = ['chat.json', 'session.json'] as const;
export type InternalFile = (typeof INTERNAL_FILES)[number];

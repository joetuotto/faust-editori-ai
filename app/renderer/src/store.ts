import { create } from 'zustand';
import type { BibleEntry, BibleKind, Doc, DocMeta, NodeType, OpenProject, ProjectManifest, TreeNode } from '../../shared/types';
import { newId } from '../../shared/text';
import type { DocProvenance, ProvenanceFile } from '../../shared/provenance';
import type { StyleProfile } from '../../shared/style';
import type { ModelPrice } from '../../shared/models';
import type { CommentThread, CommentsFile, DocComments } from '../../shared/comments';
import {
  bibleFileFor,
  canHaveChildren,
  docFileFor,
  findNode,
  findParentId,
  insertNode,
  moveNode,
  moveSibling,
  removeNode,
  updateNode
} from '../../shared/tree';

const DOC_SAVE_DELAY = 800;
const MANIFEST_SAVE_DELAY = 400;

export type Theme = 'NOX' | 'DEIS';
export type SaveState = 'saved' | 'pending' | 'saving' | 'error';
export type Panel = 'none' | 'bible' | 'bible-update' | 'settings' | 'export' | 'history' | 'style' | 'structure' | 'reader' | 'search';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

interface State {
  project: OpenProject | null;
  activeId: string | null;
  /** AI provenance per document id (.faust/provenance.json) */
  provenance: Record<string, DocProvenance>;
  showProvenance: boolean;
  /** Comments and bookmarks per document id (.faust/comments.json) */
  comments: Record<string, DocComments>;
  /** Thread selected in the comments panel or clicked in the text */
  activeComment: string | null;
  showComments: boolean;
  /** In-document find bar; `query` pre-fills it (e.g. from a project search result) */
  find: { open: boolean; query: string };
  /** Manuscript word total at the start of today (daily goal) */
  dayStart: { date: string; words: number } | null;
  /** The writer's style profile (.faust/style.json) */
  style: StyleProfile | null;
  theme: Theme;
  /** The writer's price overrides for the AI cost estimate (app setting) */
  prices: Record<string, ModelPrice>;
  spellcheck: boolean;
  noxAssist: boolean;
  showBinder: boolean;
  showInspector: boolean;
  showAI: boolean;
  focusMode: boolean;
  panel: Panel;
  saveState: SaveState;
  toasts: Toast[];

  setProject(
    project: OpenProject | null,
    activeId?: string | null,
    provenance?: Record<string, DocProvenance>,
    comments?: Record<string, DocComments>
  ): void;
  setProvenance(docId: string, value: DocProvenance): void;
  setComments(docId: string, value: DocComments | undefined): void;
  addThread(docId: string, thread: CommentThread): void;
  updateThread(docId: string, id: string, patch: Partial<CommentThread>): void;
  deleteThread(docId: string, id: string): void;
  setActiveComment(id: string | null): void;
  setFind(find: { open: boolean; query?: string }): void;
  setStyle(style: StyleProfile | null): void;
  setActive(id: string | null): void;
  setTheme(theme: Theme): void;
  setSpellcheck(enabled: boolean): void;
  setNoxAssist(enabled: boolean): void;
  toggle(key: 'showBinder' | 'showInspector' | 'showAI' | 'focusMode' | 'showProvenance' | 'showComments'): void;
  setPanel(panel: Panel): void;
  notify(text: string, kind?: Toast['kind']): void;
  dismiss(id: number): void;

  updateBody(id: string, body: string): void;
  updateMeta(id: string, patch: Partial<DocMeta>): void;
  updateManifest(patch: Partial<ProjectManifest>): void;
  addNode(type: NodeType, title?: string): string | null;
  renameNode(id: string, title: string): void;
  deleteNode(id: string): Promise<void>;
  moveUpDown(id: string, delta: -1 | 1): void;
  moveTo(id: string, parentId: string | null, index: number): void;

  addBibleEntry(kind: BibleKind, name: string): string | null;
  updateBibleEntry(id: string, patch: Partial<BibleEntry>): void;
  deleteBibleEntry(id: string): Promise<void>;

  flush(): Promise<void>;
}

/* Debounced writers live outside the store so they survive re-renders */
const docTimers = new Map<string, ReturnType<typeof setTimeout>>();
const bibleTimers = new Map<string, ReturnType<typeof setTimeout>>();
let manifestTimer: ReturnType<typeof setTimeout> | null = null;
let provenanceTimer: ReturnType<typeof setTimeout> | null = null;
let commentsTimer: ReturnType<typeof setTimeout> | null = null;
let toastCounter = 0;

export const useStore = create<State>((set, get) => {
  const markPending = () => set({ saveState: 'pending' });

  async function run(task: () => Promise<{ success: boolean; error?: string }>) {
    set({ saveState: 'saving' });
    const result = await task();
    if (!result.success) {
      set({ saveState: 'error' });
      get().notify(`Tallennus epäonnistui: ${result.error}`, 'error');
    } else if (docTimers.size === 0 && bibleTimers.size === 0 && !manifestTimer && !provenanceTimer && !commentsTimer) {
      set({ saveState: 'saved' });
    }
  }

  function saveDocNow(id: string) {
    docTimers.delete(id);
    const project = get().project;
    const node = project && findNode(project.manifest.structure, id);
    const doc = project?.docs[id];
    if (!node || !doc) return Promise.resolve();
    return run(() => window.faust.project.saveDoc(node.file, doc));
  }

  function scheduleDoc(id: string) {
    markPending();
    clearTimeout(docTimers.get(id));
    docTimers.set(id, setTimeout(() => void saveDocNow(id), DOC_SAVE_DELAY));
  }

  function saveManifestNow() {
    manifestTimer = null;
    const project = get().project;
    if (!project) return Promise.resolve();
    return run(() => window.faust.project.saveManifest(project.manifest));
  }

  function scheduleManifest() {
    markPending();
    if (manifestTimer) clearTimeout(manifestTimer);
    manifestTimer = setTimeout(() => void saveManifestNow(), MANIFEST_SAVE_DELAY);
  }

  function saveBibleNow(id: string) {
    bibleTimers.delete(id);
    const entry = get().project?.bible[id];
    if (!entry) return Promise.resolve();
    return run(() => window.faust.project.saveBible(entry));
  }

  function scheduleBible(id: string) {
    markPending();
    clearTimeout(bibleTimers.get(id));
    bibleTimers.set(id, setTimeout(() => void saveBibleNow(id), DOC_SAVE_DELAY));
  }

  function saveProvenanceNow() {
    provenanceTimer = null;
    const file: ProvenanceFile = { version: 1, docs: get().provenance };
    return run(() => window.faust.project.writeInternal('provenance.json', JSON.stringify(file, null, 1)));
  }

  function saveCommentsNow() {
    commentsTimer = null;
    const file: CommentsFile = { version: 1, docs: get().comments };
    return run(() => window.faust.project.writeInternal('comments.json', JSON.stringify(file, null, 1)));
  }

  function patchComments(docId: string, fn: (threads: CommentThread[]) => CommentThread[], hash?: string) {
    const current = get().comments[docId];
    const threads = fn(current?.threads ?? []);
    const comments = { ...get().comments };
    if (threads.length === 0) delete comments[docId];
    else comments[docId] = { hash: hash ?? current?.hash ?? '', threads };
    set({ comments });
    markPending();
    if (commentsTimer) clearTimeout(commentsTimer);
    commentsTimer = setTimeout(() => void saveCommentsNow(), DOC_SAVE_DELAY);
  }

  function patchProject(fn: (p: OpenProject) => OpenProject) {
    const project = get().project;
    if (project) set({ project: fn(project) });
  }

  function setStructure(structure: TreeNode[]) {
    patchProject(p => ({ ...p, manifest: { ...p.manifest, structure } }));
    scheduleManifest();
  }

  return {
    project: null,
    activeId: null,
    provenance: {},
    showProvenance: false,
    comments: {},
    activeComment: null,
    showComments: false,
    find: { open: false, query: '' },
    dayStart: null,
    style: null,
    theme: 'NOX',
    prices: {},
    spellcheck: true,
    noxAssist: false,
    showBinder: true,
    showInspector: false,
    showAI: false,
    focusMode: false,
    panel: 'none',
    saveState: 'saved',
    toasts: [],

    setProject(project, activeId, provenance = {}, comments = {}) {
      const initial = activeId && project?.docs[activeId] ? activeId : (project?.manifest.structure[0]?.id ?? null);
      set({ project, activeId: initial, provenance, comments, activeComment: null, style: null, panel: 'none', saveState: 'saved', find: { open: false, query: '' }, dayStart: null });
    },

    setStyle(style) {
      set({ style });
      if (style) void run(() => window.faust.project.writeInternal('style.json', JSON.stringify(style, null, 1)));
    },

    setProvenance(docId, value) {
      const previous = get().provenance[docId];
      const empty = value.spans.length === 0;
      if ((!previous && empty) || JSON.stringify(previous) === JSON.stringify(value)) return;
      const provenance = { ...get().provenance };
      if (empty) delete provenance[docId];
      else provenance[docId] = value;
      set({ provenance });
      markPending();
      if (provenanceTimer) clearTimeout(provenanceTimer);
      provenanceTimer = setTimeout(() => void saveProvenanceNow(), DOC_SAVE_DELAY);
    },

    setComments(docId, value) {
      const previous = get().comments[docId];
      if (previous === value) return;
      patchComments(docId, () => value?.threads ?? [], value?.hash);
    },

    addThread(docId, thread) {
      patchComments(docId, threads => [...threads, thread]);
      set({ activeComment: thread.id, showComments: true });
    },

    updateThread(docId, id, patch) {
      patchComments(docId, threads => threads.map(t => (t.id === id ? { ...t, ...patch } : t)));
    },

    deleteThread(docId, id) {
      patchComments(docId, threads => threads.filter(t => t.id !== id));
      if (get().activeComment === id) set({ activeComment: null });
    },

    setActiveComment(activeComment) {
      set({ activeComment });
    },

    setActive(id) {
      set({ activeId: id });
    },

    setTheme(theme) {
      // Entering NOX quiets the assistant unless the writer has asked for it
      set(theme === 'NOX' && !get().noxAssist ? { theme, showAI: false } : { theme });
      void window.faust.app.setTheme(theme);
    },

    setSpellcheck(spellcheck) {
      set({ spellcheck });
      void window.faust.app.setSpellcheck(spellcheck);
    },

    setNoxAssist(noxAssist) {
      set({ noxAssist });
      void window.faust.app.setNoxAssist(noxAssist);
    },

    setFind({ open, query }) {
      set({ find: { open, query: query ?? get().find.query } });
    },

    toggle(key) {
      set({ [key]: !get()[key] } as Pick<State, typeof key>);
    },

    setPanel(panel) {
      set({ panel });
    },

    notify(text, kind = 'info') {
      const id = ++toastCounter;
      set({ toasts: [...get().toasts, { id, text, kind }] });
      setTimeout(() => get().dismiss(id), kind === 'error' ? 8000 : 3500);
    },

    dismiss(id) {
      set({ toasts: get().toasts.filter(t => t.id !== id) });
    },

    updateBody(id, body) {
      patchProject(p => {
        const doc = p.docs[id];
        if (!doc) return p;
        return {
          ...p,
          docs: { ...p.docs, [id]: { ...doc, body, meta: { ...doc.meta, modified: new Date().toISOString() } } }
        };
      });
      scheduleDoc(id);
    },

    updateMeta(id, patch) {
      patchProject(p => {
        const doc = p.docs[id];
        if (!doc) return p;
        const meta = { ...doc.meta, ...patch, modified: new Date().toISOString() };
        return { ...p, docs: { ...p.docs, [id]: { ...doc, meta } } };
      });
      scheduleDoc(id);
    },

    updateManifest(patch) {
      patchProject(p => ({ ...p, manifest: { ...p.manifest, ...patch } }));
      scheduleManifest();
    },

    addNode(type, title) {
      const { project, activeId } = get();
      if (!project) return null;
      const structure = project.manifest.structure;
      const active = activeId ? findNode(structure, activeId) : null;
      const count = (list: TreeNode[]): number => list.reduce((n, x) => n + (x.type === type ? 1 : 0) + count(x.children ?? []), 0);
      const label = title ?? `${type === 'scene' ? 'Kohtaus' : type === 'folder' ? 'Kansio' : 'Luku'} ${count(structure) + 1}`;

      const id = newId();
      const node: TreeNode = { id, type, title: label, file: docFileFor(label, id) };
      const now = new Date().toISOString();
      const doc: Doc = { meta: { id, title: label, type, status: 'draft', synopsis: '', notes: '', created: now, modified: now }, body: '' };

      // Scenes go inside the active chapter (or next to the active scene); chapters at top level
      let parentId: string | null = null;
      let afterId: string | undefined;
      if (type === 'scene' && active) {
        if (canHaveChildren(active.type)) parentId = active.id;
        else {
          parentId = findParentId(structure, active.id) ?? null;
          afterId = active.id;
        }
      } else if (active) {
        const topLevel = structure.find(n => n.id === active.id || findNode(n.children ?? [], active.id));
        afterId = topLevel?.id;
      }

      patchProject(p => ({ ...p, docs: { ...p.docs, [id]: doc } }));
      setStructure(insertNode(structure, node, parentId, afterId));
      set({ activeId: id });
      void saveDocNow(id);
      return id;
    },

    renameNode(id, title) {
      const project = get().project;
      if (!project) return;
      setStructure(updateNode(project.manifest.structure, id, { title }));
      get().updateMeta(id, { title });
    },

    async deleteNode(id) {
      const project = get().project;
      if (!project) return;
      const { tree, removed } = removeNode(project.manifest.structure, id);
      for (const n of removed) clearTimeout(docTimers.get(n.id));
      for (const n of removed) docTimers.delete(n.id);
      const docs = { ...project.docs };
      for (const n of removed) delete docs[n.id];
      const provenance = { ...get().provenance };
      let provenanceChanged = false;
      for (const n of removed) {
        if (n.id in provenance) {
          delete provenance[n.id];
          provenanceChanged = true;
        }
      }
      if (provenanceChanged) {
        set({ provenance });
        void saveProvenanceNow();
      }
      if (removed.some(n => n.id in get().comments)) {
        const comments = { ...get().comments };
        for (const n of removed) delete comments[n.id];
        set({ comments });
        void saveCommentsNow();
      }
      set({
        project: { ...project, docs, manifest: { ...project.manifest, structure: tree } },
        activeId: get().activeId && removed.some(n => n.id === get().activeId) ? (tree[0]?.id ?? null) : get().activeId
      });
      await saveManifestNow();
      await run(() => window.faust.project.trash(removed.map(n => n.file)));
    },

    moveUpDown(id, delta) {
      const project = get().project;
      if (project) setStructure(moveSibling(project.manifest.structure, id, delta));
    },

    moveTo(id, parentId, index) {
      const project = get().project;
      if (project) setStructure(moveNode(project.manifest.structure, id, parentId, index));
    },

    addBibleEntry(kind, name) {
      const project = get().project;
      if (!project) return null;
      const id = newId();
      const now = new Date().toISOString();
      const entry: BibleEntry = { id, kind, name, summary: '', fields: {}, body: '', file: bibleFileFor(kind, name, id), created: now, modified: now };
      patchProject(p => ({
        ...p,
        bible: { ...p.bible, [id]: entry },
        manifest: { ...p.manifest, bible: { ...p.manifest.bible, [kind]: [...p.manifest.bible[kind], entry.file] } }
      }));
      scheduleManifest();
      void saveBibleNow(id);
      return id;
    },

    updateBibleEntry(id, patch) {
      patchProject(p => {
        const entry = p.bible[id];
        if (!entry) return p;
        return { ...p, bible: { ...p.bible, [id]: { ...entry, ...patch, modified: new Date().toISOString() } } };
      });
      scheduleBible(id);
    },

    async deleteBibleEntry(id) {
      const project = get().project;
      const entry = project?.bible[id];
      if (!project || !entry) return;
      clearTimeout(bibleTimers.get(id));
      bibleTimers.delete(id);
      const bible = { ...project.bible };
      delete bible[id];
      set({
        project: {
          ...project,
          bible,
          manifest: {
            ...project.manifest,
            bible: { ...project.manifest.bible, [entry.kind]: project.manifest.bible[entry.kind].filter(f => f !== entry.file) }
          }
        }
      });
      await saveManifestNow();
      await run(() => window.faust.project.trash([entry.file]));
    },

    async flush() {
      const pendingDocs = [...docTimers.keys()];
      const pendingBible = [...bibleTimers.keys()];
      for (const id of pendingDocs) clearTimeout(docTimers.get(id));
      for (const id of pendingBible) clearTimeout(bibleTimers.get(id));
      if (manifestTimer) {
        clearTimeout(manifestTimer);
        await saveManifestNow();
      }
      if (provenanceTimer) {
        clearTimeout(provenanceTimer);
        await saveProvenanceNow();
      }
      if (commentsTimer) {
        clearTimeout(commentsTimer);
        await saveCommentsNow();
      }
      await Promise.all([...pendingDocs.map(saveDocNow), ...pendingBible.map(saveBibleNow)]);
    }
  };
});

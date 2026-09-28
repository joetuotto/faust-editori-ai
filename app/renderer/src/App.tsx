import { useEffect, useMemo, useState } from 'react';
import type { MenuCommand } from '../../shared/api';
import { countWords } from '../../shared/text';
import { useShallow } from 'zustand/react/shallow';
import { closeProject, importLegacy, openProjectDialog, openRecent, saveSession, snapshot } from './actions';
import { useStore } from './store';
import { AIPanel } from './components/AIPanel';
import { BibleDialog } from './components/BibleDialog';
import { Binder } from './components/Binder';
import { Editor } from './components/Editor';
import { HistoryDialog } from './components/HistoryDialog';
import { StyleDialog } from './components/StyleDialog';
import { BibleUpdateDialog } from './components/BibleUpdateDialog';
import { StructureDialog } from './components/StructureDialog';
import { ReaderDialog } from './components/ReaderDialog';
import { SearchDialog } from './components/SearchDialog';
import { ExportDialog } from './components/ExportDialog';
import { Inspector } from './components/Inspector';
import { CommentsPanel } from './components/CommentsPanel';
import { startThreadInActive } from './editor/commentActions';
import { insertFootnote } from './editor/footnote';
import { getActiveEditor } from './editor/activeEditor';
import { NewProjectDialog } from './components/NewProjectDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { Toasts } from './components/Toasts';
import { Welcome } from './components/Welcome';

export function App() {
  const project = useStore(s => s.project);
  const theme = useStore(s => s.theme);
  const [askTitle, setAskTitle] = useState(false);

  // Theme and last project from app settings
  useEffect(() => {
    void window.faust.app.getSettings().then(async settings => {
      useStore.setState({ theme: settings.theme, spellcheck: settings.spellcheck, noxAssist: settings.noxAssist, prices: settings.prices ?? {} });
      if (settings.lastProject) await openRecent(settings.lastProject);
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('mac', navigator.userAgent.includes('Mac'));
  }, [theme]);

  // Remember the open document per project
  const activeId = useStore(s => s.activeId);
  const projectPath = project?.path;
  useEffect(() => {
    if (projectPath) void saveSession();
  }, [activeId, projectPath]);

  // Flush pending saves when the window is hidden or closed
  useEffect(() => {
    const flush = () => void useStore.getState().flush();
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  useEffect(
    () =>
      window.faust.app.onMenu((command: MenuCommand) => {
        const s = useStore.getState();
        const needsProject = !['new-project', 'open-project', 'import-legacy', 'toggle-theme'].includes(command);
        if (needsProject && !s.project) return;
        switch (command) {
          case 'new-project':
            setAskTitle(true);
            break;
          case 'open-project':
            void openProjectDialog();
            break;
          case 'import-legacy':
            void importLegacy();
            break;
          case 'snapshot':
            void snapshot();
            break;
          case 'export':
            s.setPanel('export');
            break;
          case 'new-chapter':
            s.addNode('chapter');
            break;
          case 'new-scene':
            s.addNode('scene');
            break;
          case 'toggle-theme':
            s.setTheme(s.theme === 'NOX' ? 'DEIS' : 'NOX');
            break;
          case 'toggle-binder':
            s.toggle('showBinder');
            break;
          case 'toggle-inspector':
            s.toggle('showInspector');
            break;
          case 'toggle-comments':
            s.toggle('showComments');
            break;
          case 'add-comment':
            startThreadInActive('comment');
            break;
          case 'add-bookmark':
            startThreadInActive('bookmark');
            break;
          case 'add-footnote':
            insertFootnote(s.activeId ? getActiveEditor(s.activeId) : null);
            break;
          case 'toggle-ai':
            s.toggle('showAI');
            break;
          case 'focus-mode':
            s.toggle('focusMode');
            break;
          case 'show-bible':
            s.setPanel('bible');
            break;
          case 'show-settings':
            s.setPanel('settings');
            break;
          case 'show-history':
            s.setPanel('history');
            break;
          case 'find': {
            const selected = window.getSelection()?.toString().trim() ?? '';
            s.setFind({ open: true, query: selected && !selected.includes('\n') ? selected : undefined });
            break;
          }
          case 'find-project':
            s.setPanel('search');
            break;
        }
      }),
    []
  );

  return (
    <>
      {project ? <Workspace onNewProject={() => setAskTitle(true)} /> : <Welcome />}
      {askTitle && <NewProjectDialog onClose={() => setAskTitle(false)} />}
      <Toasts />
    </>
  );
}

function Workspace({ onNewProject }: { onNewProject(): void }) {
  const project = useStore(s => s.project)!;
  const { showBinder, showInspector, showComments, showAI, focusMode, panel, theme } = useStore(
    useShallow(s => ({
      showBinder: s.showBinder,
      showInspector: s.showInspector,
      showComments: s.showComments,
      showAI: s.showAI,
      focusMode: s.focusMode,
      panel: s.panel,
      theme: s.theme
    }))
  );
  const { toggle, setTheme, setPanel } = useStore.getState();

  return (
    <div className={`app${focusMode ? ' focus' : ''}`}>
      {!focusMode && (
        <header className="topbar">
          <span className="brand">FAUST</span>
          <span className="project-title">{project.manifest.title}</span>
          <div className="spacer" />
          <button className={`btn small${showBinder ? ' active' : ''}`} onClick={() => toggle('showBinder')}>Sisällys</button>
          <button className="btn small" onClick={() => setPanel('bible')}>Tietopankki</button>
          <button className="btn small" onClick={() => setPanel('structure')}>Rakenne</button>
          <button className="btn small" onClick={() => setPanel('history')} title="Versiohistoria (⇧⌘H)">Historia</button>
          <button className={`btn small${showInspector ? ' active' : ''}`} onClick={() => toggle('showInspector')}>Tarkastelija</button>
          <button className={`btn small${showComments ? ' active' : ''}`} onClick={() => toggle('showComments')} title="Kommentit ja kirjanmerkit (⌘3)">
            Kommentit
          </button>
          <button className={`btn small${showAI ? ' active' : ''}`} onClick={() => toggle('showAI')}>AI</button>
          <button className="btn small" title="Vaihda päivä- ja yötilan välillä" onClick={() => setTheme(theme === 'NOX' ? 'DEIS' : 'NOX')}>
            {theme}
          </button>
          <button className="btn small" onClick={() => toggle('focusMode')} title="Fokustila (⇧⌘↩)">Fokus</button>
          <ProjectMenu onNewProject={onNewProject} />
        </header>
      )}

      <div className="workspace">
        {showBinder && !focusMode && <Binder />}
        <Editor />
        {showInspector && !focusMode && <Inspector />}
        {showComments && !focusMode && <CommentsPanel />}
        {showAI && !focusMode && <AIPanel />}
      </div>

      <StatusBar />

      {panel === 'bible' && <BibleDialog />}
      {panel === 'settings' && <SettingsDialog />}
      {panel === 'export' && <ExportDialog />}
      {panel === 'history' && <HistoryDialog />}
      {panel === 'style' && <StyleDialog />}
      {panel === 'bible-update' && <BibleUpdateDialog />}
      {panel === 'structure' && <StructureDialog />}
      {panel === 'reader' && <ReaderDialog />}
      {panel === 'search' && <SearchDialog />}
    </div>
  );
}

function ProjectMenu({ onNewProject }: { onNewProject(): void }) {
  const [open, setOpen] = useState(false);
  const { setPanel } = useStore.getState();
  const item = (label: string, action: () => void) => (
    <button
      className="btn ghost"
      style={{ display: 'block', width: '100%', textAlign: 'left' }}
      onClick={() => {
        setOpen(false);
        action();
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn small" onClick={() => setOpen(o => !o)}>☰</button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setOpen(false)} />
          <div className="dialog" style={{ position: 'absolute', right: 0, top: 34, width: 240, padding: 6, zIndex: 21 }}>
            {item('Tallenna versio (⌘S)', () => void snapshot())}
            {item('Vie käsikirjoitus…', () => setPanel('export'))}
            {item('Esilukija…', () => setPanel('reader'))}
            {item('Tyylisormenjälki…', () => setPanel('style'))}
            {item('Asetukset…', () => setPanel('settings'))}
            {item('Uusi projekti…', onNewProject)}
            {item('Avaa projekti…', () => void openProjectDialog())}
            {item('Tuo vanha .faust-tiedosto…', () => void importLegacy())}
            {item('Sulje projekti', () => void closeProject())}
          </div>
        </>
      )}
    </div>
  );
}

/** Local calendar date, e.g. 2026-09-28 */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Progress {
  days: Record<string, { start: number; end: number }>;
}

/**
 * Daily goal: words written today = manuscript total now minus the total at
 * the first moment the project was open today. Days are kept in
 * .faust/progress.json for a simple writing log.
 */
function useDailyProgress(total: number): number {
  const projectPath = useStore(s => s.project?.path);
  const dayStart = useStore(s => s.dayStart);
  const [loaded, setLoaded] = useState<{ path: string; progress: Progress } | null>(null);
  // Only trust a log read for the project that is open now
  const log = loaded && loaded.path === projectPath ? loaded.progress : null;

  useEffect(() => {
    let cancelled = false;
    if (!projectPath) return;
    void window.faust.project.readInternal('progress.json').then(raw => {
      if (cancelled) return;
      let parsed: Progress = { days: {} };
      try {
        if (raw) parsed = JSON.parse(raw) as Progress;
      } catch {
        // start a fresh log
      }
      setLoaded({ path: projectPath, progress: parsed });
    });
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  // Start (or roll over to) today once the log is loaded
  useEffect(() => {
    if (!log) return;
    const date = today();
    if (dayStart?.date === date) return;
    const start = log.days[date]?.start ?? total;
    useStore.setState({ dayStart: { date, words: start } });
  }, [log, dayStart, total]);

  // Record today's end count, at most every few seconds
  useEffect(() => {
    if (!log || !dayStart) return;
    const timer = setTimeout(() => {
      const next: Progress = { days: { ...log.days, [dayStart.date]: { start: dayStart.words, end: total } } };
      void window.faust.project.writeInternal('progress.json', JSON.stringify(next, null, 1));
    }, 5000);
    return () => clearTimeout(timer);
  }, [log, dayStart, total]);

  return dayStart ? total - dayStart.words : 0;
}

function StatusBar() {
  const docs = useStore(s => s.project!.docs);
  const target = useStore(s => s.project!.manifest.targets.totalWords);
  const dailyTarget = useStore(s => s.project!.manifest.targets.dailyWords);
  const activeId = useStore(s => s.activeId);
  const saveState = useStore(s => s.saveState);
  const focusMode = useStore(s => s.focusMode);

  const total = useMemo(() => Object.values(docs).reduce((sum, d) => sum + countWords(d.body), 0), [docs]);
  const current = activeId && docs[activeId] ? countWords(docs[activeId].body) : 0;
  const percent = target > 0 ? Math.min(100, (total / target) * 100) : 0;
  const todayWords = useDailyProgress(total);
  const dailyPercent = dailyTarget > 0 ? Math.min(100, (Math.max(0, todayWords) / dailyTarget) * 100) : 0;

  const saveLabel = { saved: 'Tallennettu', pending: 'Muutoksia…', saving: 'Tallennetaan…', error: 'Tallennus epäonnistui' }[saveState];

  return (
    <footer className="statusbar">
      {activeId && <span>{current} sanaa</span>}
      <span>
        {total.toLocaleString('fi-FI')} / {target.toLocaleString('fi-FI')} sanaa
      </span>
      <div className="progress" title={`${percent.toFixed(0)} %`}>
        <div style={{ width: `${percent}%` }} />
      </div>
      {dailyTarget > 0 && (
        <>
          <span title="Tänään kirjoitetut sanat (lisätyt miinus poistetut)">
            Tänään {todayWords >= 0 ? '+' : ''}
            {todayWords.toLocaleString('fi-FI')} / {dailyTarget.toLocaleString('fi-FI')}
            {todayWords >= dailyTarget ? ' ✓' : ''}
          </span>
          <div className="progress" title={`${dailyPercent.toFixed(0)} %`}>
            <div style={{ width: `${dailyPercent}%` }} />
          </div>
        </>
      )}
      <div className="spacer" />
      {focusMode && (
        <button className="btn ghost small" onClick={() => useStore.getState().toggle('focusMode')}>
          Poistu fokustilasta
        </button>
      )}
      <span className={saveState === 'error' ? 'save-error' : ''}>{saveLabel}</span>
    </footer>
  );
}

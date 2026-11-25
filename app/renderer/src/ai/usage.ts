/** Reads the project's AI usage log (.faust/usage.json, written by the main process) */
import { useEffect, useState } from 'react';
import { emptyUsage, type UsageFile } from '../../../shared/usage';
import { useStore } from '../store';

/** Bump to make open usage views re-read the log (after an AI call) */
let listeners: (() => void)[] = [];
export function usageChanged() {
  for (const l of listeners) l();
}

export function useUsage(): UsageFile {
  const projectPath = useStore(s => s.project?.path);
  const [state, setState] = useState<{ path: string | undefined; file: UsageFile }>({ path: undefined, file: emptyUsage() });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion(v => v + 1);
    listeners.push(bump);
    return () => {
      listeners = listeners.filter(l => l !== bump);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!projectPath) return;
    // The main process writes the log right after the call resolves
    const timer = setTimeout(() => {
      void window.faust.project.readInternal('usage.json').then(raw => {
        if (cancelled) return;
        let file = emptyUsage();
        try {
          if (raw) file = JSON.parse(raw) as UsageFile;
        } catch {
          // unreadable log: show nothing
        }
        setState({ path: projectPath, file });
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [projectPath, version]);

  return state.path === projectPath ? state.file : emptyUsage();
}

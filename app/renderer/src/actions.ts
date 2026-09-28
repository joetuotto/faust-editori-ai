import type { OpenProject, Result } from '../../shared/types';
import type { ProvenanceFile } from '../../shared/provenance';
import { useStore } from './store';

/**
 * Run an open/create/import call and show the result; `null` means the user
 * cancelled. Pending saves are written first: once the main process switches
 * projects, late saves would land in the wrong folder.
 */
async function openWith(call: () => Promise<Result<OpenProject> | null>): Promise<boolean> {
  const { notify, setProject, flush } = useStore.getState();
  await flush();
  if (useStore.getState().project) await saveSession();
  const result = await call();
  if (!result) return false;
  if (!result.success) {
    notify(result.error, 'error');
    return false;
  }
  setProject(result.data, await readSessionActiveId(), await readProvenance());
  const style = await window.faust.project.readInternal('style.json');
  if (style) {
    try {
      useStore.setState({ style: JSON.parse(style) });
    } catch {
      // ignore a corrupt profile; it can be rebuilt
    }
  }
  return true;
}

export async function newProject(title: string) {
  return openWith(() => window.faust.project.create(title.trim() || 'Nimetön projekti'));
}

export async function openProjectDialog() {
  return openWith(() => window.faust.project.openDialog());
}

export async function openRecent(path: string) {
  return openWith(() => window.faust.project.open(path));
}

export async function importLegacy() {
  const ok = await openWith(() => window.faust.project.importLegacy());
  if (ok) useStore.getState().notify('Vanha projekti tuotiin uuteen kansiomuotoon. Alkuperäinen tiedosto jäi ennalleen.');
  return ok;
}

export async function closeProject() {
  await useStore.getState().flush();
  await saveSession();
  await window.faust.project.close();
  useStore.getState().setProject(null);
}

export async function snapshot(message = 'Tallennettu versio') {
  const { flush, notify } = useStore.getState();
  await flush();
  const result = await window.faust.project.snapshot(message);
  if (!result.success) notify(result.error, 'error');
  else notify(result.data ? 'Versio tallennettu historiaan.' : 'Ei muutoksia edellisen version jälkeen.');
}

interface Session {
  activeId?: string | null;
}

export async function saveSession() {
  const { project, activeId } = useStore.getState();
  if (!project) return;
  const session: Session = { activeId };
  await window.faust.project.writeInternal('session.json', JSON.stringify(session));
}

async function readProvenance(): Promise<ProvenanceFile['docs']> {
  const raw = await window.faust.project.readInternal('provenance.json');
  if (!raw) return {};
  try {
    return (JSON.parse(raw) as ProvenanceFile).docs ?? {};
  } catch {
    return {};
  }
}

async function readSessionActiveId(): Promise<string | null> {
  const raw = await window.faust.project.readInternal('session.json');
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as Session).activeId ?? null;
  } catch {
    return null; // Corrupt session file: ignore
  }
}

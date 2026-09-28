/** App-level preferences: recent projects, theme, window state */
import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RecentProject } from '../shared/types';
import { writeFileAtomic } from './fsutil';

export interface AppSettings {
  theme: 'NOX' | 'DEIS';
  recent: RecentProject[];
  lastProject: string | null;
}

const DEFAULTS: AppSettings = { theme: 'NOX', recent: [], lastProject: null };
const MAX_RECENT = 10;

let cache: AppSettings | null = null;

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'faust-app.json');
}

export async function getSettings(): Promise<AppSettings> {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(await fs.readFile(settingsPath(), 'utf-8')) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache!;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  cache = { ...(await getSettings()), ...patch };
  await writeFileAtomic(settingsPath(), JSON.stringify(cache, null, 2));
  return cache;
}

export async function rememberProject(projectPath: string, title: string): Promise<AppSettings> {
  const { recent } = await getSettings();
  const entry: RecentProject = { path: projectPath, title, opened: new Date().toISOString() };
  return updateSettings({
    recent: [entry, ...recent.filter(r => r.path !== projectPath)].slice(0, MAX_RECENT),
    lastProject: projectPath
  });
}

export async function forgetProject(projectPath: string): Promise<AppSettings> {
  const settings = await getSettings();
  return updateSettings({
    recent: settings.recent.filter(r => r.path !== projectPath),
    lastProject: settings.lastProject === projectPath ? null : settings.lastProject
  });
}

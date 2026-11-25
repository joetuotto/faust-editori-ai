/**
 * API keys, encrypted with the OS keychain via Electron safeStorage.
 * Uses the same userData/config.json format as FAUST 1.x, so keys saved in
 * the old app keep working. Keys never leave the main process.
 */
import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PROVIDERS } from '../shared/models';
import type { ProviderId } from '../shared/types';
import { writeFileAtomic } from './fsutil';

type KeyMap = Record<string, string>;

let cache: KeyMap | null = null;

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

async function load(): Promise<KeyMap> {
  if (cache) return cache;
  try {
    const config = JSON.parse(await fs.readFile(configPath(), 'utf-8'));
    if (config.apiKeysEncrypted && safeStorage.isEncryptionAvailable()) {
      cache = JSON.parse(safeStorage.decryptString(Buffer.from(config.apiKeysEncrypted, 'base64')));
    } else {
      cache = config.apiKeys ?? {};
    }
  } catch {
    cache = {};
  }
  return cache!;
}

export function keyName(provider: ProviderId): string {
  return PROVIDERS.find(p => p.id === provider)!.keyName;
}

/** Environment variables win over stored keys (handy for development) */
export async function getKey(provider: ProviderId): Promise<string | null> {
  const name = keyName(provider);
  return process.env[name] || (await load())[name] || null;
}

export async function keyStatus(): Promise<Record<ProviderId, boolean>> {
  const status = {} as Record<ProviderId, boolean>;
  // A local server needs no key; whether it runs shows when models are fetched
  for (const p of PROVIDERS) status[p.id] = !!p.local || !!(await getKey(p.id));
  return status;
}

/** Set (or clear, with an empty string) one provider's key */
export async function setKey(provider: ProviderId, value: string): Promise<{ encrypted: boolean }> {
  const keys = { ...(await load()) };
  const name = keyName(provider);
  if (value.trim()) keys[name] = value.trim();
  else delete keys[name];

  const encrypted = safeStorage.isEncryptionAvailable();
  const config = encrypted
    ? {
        apiKeysEncrypted: safeStorage.encryptString(JSON.stringify(keys)).toString('base64'),
        version: '3.0',
        encryptionMethod: 'electron-safeStorage'
      }
    : { apiKeys: keys };

  await writeFileAtomic(configPath(), JSON.stringify(config, null, 2));
  cache = keys;
  return { encrypted };
}

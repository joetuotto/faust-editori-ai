import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Write via temp file + fsync + rename, so a crash mid-save leaves either the
 * old file or the new one, never a truncated manuscript.
 */
export async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );

  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(tmpPath, 'w');
    await handle.writeFile(data, typeof data === 'string' ? 'utf-8' : undefined);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

/**
 * Resolve a project-relative path, refusing anything that escapes the project
 * folder (the renderer is not trusted with arbitrary file system access).
 */
export function resolveInside(root: string, relative: string): string {
  if (path.isAbsolute(relative)) throw new Error(`Absolute path not allowed: ${relative}`);
  const resolved = path.resolve(root, relative);
  const rel = path.relative(root, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes project: ${relative}`);
  }
  return resolved;
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

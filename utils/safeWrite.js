/**
 * Crash-safe file writing for the Electron main process.
 *
 * writeFileAtomic: data goes to a temp file in the same directory, is flushed to
 * disk, and then renamed over the target. A crash or power loss mid-save leaves
 * either the old file or the new one, never a truncated manuscript.
 *
 * backupBeforeOverwrite: copies the current file into a backup directory before
 * it is replaced, keeping the newest `keep` copies per project, and at most one
 * copy per `minIntervalMs` so 30-second autosaves don't flood the directory.
 */
const fs = require('fs').promises;
const path = require('path');

async function writeFileAtomic(filePath, data, encoding = 'utf-8') {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);

  let handle;
  try {
    handle = await fs.open(tmpPath, 'w');
    await handle.writeFile(data, typeof data === 'string' ? encoding : undefined);
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

function backupPrefix(filePath) {
  const base = path.basename(filePath).replace(/[^\p{L}\p{N}._-]+/gu, '_');
  return `${base}.`;
}

// Backup names end in an ISO timestamp with ':' and '.' replaced by '-'
function backupTime(name) {
  const m = name.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.bak$/);
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : 0;
}

async function listBackups(backupDir, filePath) {
  const prefix = backupPrefix(filePath);
  const entries = await fs.readdir(backupDir).catch(() => []);
  return entries
    .filter(name => name.startsWith(prefix) && name.endsWith('.bak'))
    .sort();
}

async function backupBeforeOverwrite(filePath, backupDir, { keep = 10, minIntervalMs = 10 * 60 * 1000, now = Date.now() } = {}) {
  try {
    await fs.access(filePath);
  } catch {
    return null; // Nothing to back up yet
  }

  await fs.mkdir(backupDir, { recursive: true });
  const existing = await listBackups(backupDir, filePath);

  const latest = existing[existing.length - 1];
  if (latest && now - backupTime(latest) < minIntervalMs) return null;

  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `${backupPrefix(filePath)}${stamp}.bak`);
  await fs.copyFile(filePath, backupPath);

  const all = [...existing, path.basename(backupPath)];
  for (const old of all.slice(0, Math.max(0, all.length - keep))) {
    await fs.unlink(path.join(backupDir, old)).catch(() => {});
  }
  return backupPath;
}

module.exports = { writeFileAtomic, backupBeforeOverwrite, listBackups };

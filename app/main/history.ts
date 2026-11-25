/**
 * Automatic version history for a project folder, stored as a normal git
 * repository (isomorphic-git, no git install needed). Any git tool can read it.
 */
import fs from 'node:fs';
import git from 'isomorphic-git';
import type { HistoryEntry } from '../shared/types';

const AUTHOR = { name: 'FAUST', email: 'faust@localhost' };

async function hasCommits(dir: string): Promise<boolean> {
  try {
    await git.resolveRef({ fs, dir, ref: 'HEAD' });
    return true;
  } catch {
    return false;
  }
}

export async function ensureRepo(dir: string): Promise<void> {
  if (!fs.existsSync(`${dir}/.git`)) {
    await git.init({ fs, dir, defaultBranch: 'main' });
  }
}

/**
 * Stage every change (new, modified, deleted) and commit.
 * Returns the new commit id, or null when nothing changed.
 */
export async function commitAll(dir: string, message: string): Promise<string | null> {
  await ensureRepo(dir);
  const matrix = await git.statusMatrix({ fs, dir });
  let changed = false;

  for (const [filepath, head, workdir, stage] of matrix) {
    if (head === workdir && workdir === stage) continue;
    changed = true;
    if (workdir === 0) {
      await git.remove({ fs, dir, filepath });
    } else {
      await git.add({ fs, dir, filepath });
    }
  }

  if (!changed && (await hasCommits(dir))) return null;

  return git.commit({ fs, dir, message, author: AUTHOR });
}

/** Commits touching `filepath` (or the whole project), newest first */
export async function history(dir: string, filepath?: string, depth = 200): Promise<HistoryEntry[]> {
  try {
    const commits = await git.log({ fs, dir, depth, ...(filepath ? { filepath } : {}) });
    return commits.map(c => ({
      oid: c.oid,
      message: c.commit.message.trim(),
      timestamp: c.commit.committer.timestamp * 1000
    }));
  } catch {
    return [];
  }
}

/** Content of `filepath` as it was in commit `oid`, or null if it did not exist */
export async function readAt(dir: string, oid: string, filepath: string): Promise<string | null> {
  try {
    const { blob } = await git.readBlob({ fs, dir, oid, filepath });
    return new TextDecoder().decode(blob);
  } catch {
    return null;
  }
}

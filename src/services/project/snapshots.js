/**
 * Project snapshots
 *
 * One place that builds a snapshot of the whole project without a render
 * closure, so a state update can take the snapshot of exactly the state it
 * is about to change. The shape is the one createSnapshot in app.js writes,
 * so the existing panel lists and restores these; `auto` marks the ones the
 * app took by itself ('import' before an import, 'bulk' before a bulk accept).
 *
 * Pure functions, no DOM (test/services/snapshots.test.js).
 */

const { countProjectWords } = require('../../editor/textTools.js');

// A snapshot without `auto` is the author's own and is never removed here
const AUTO_KINDS = ['import', 'bulk'];

const DEFAULT_KEEP_BULK = 3;

/**
 * A snapshot of the project's chapters as they are now.
 * @param {{ structure: object[] }} project
 * @param {{ name: string, description?: string, now?: Date, auto?: 'import' | 'bulk' }} options
 * @returns {{ id: string, name: string, description: string, created: string, totalWords: number,
 *   chapterCount: number, structure: object[], auto?: 'import' | 'bulk' }}
 */
function buildSnapshot(project, { name, description = '', now = new Date(), auto } = {}) {
  const structure = project && Array.isArray(project.structure) ? project.structure : [];
  const snapshot = {
    id: 'snapshot-' + now.getTime(),
    name,
    description,
    created: now.toISOString(),
    totalWords: countProjectWords(structure),
    chapterCount: structure.length,
    // Deep copy: later edits of the chapters must not reach the snapshot
    structure: JSON.parse(JSON.stringify(structure))
  };
  if (AUTO_KINDS.includes(auto)) snapshot.auto = auto;
  return snapshot;
}

// Unreadable dates sort as the oldest
function createdTime(snapshot) {
  const time = Date.parse(snapshot.created);
  return Number.isNaN(time) ? 0 : time;
}

const isLimit = (value) => typeof value === 'number' && !Number.isNaN(value);

/**
 * Drop the oldest 'bulk' snapshots beyond the newest `keep`. Manual and
 * 'import' snapshots always stay, and the order of the list is kept.
 * @param {object[]} snapshots
 * @param {number} [keep]
 * @returns {object[]} a new array
 */
function pruneBulkSnapshots(snapshots, keep = DEFAULT_KEEP_BULK) {
  if (!Array.isArray(snapshots)) return [];
  // Infinity is a usable limit ("keep all"); only a value that is no number falls back
  const limit = isLimit(keep) ? Math.max(0, Math.floor(keep)) : DEFAULT_KEEP_BULK;

  const bulk = [];
  snapshots.forEach((snapshot, position) => {
    if (snapshot && snapshot.auto === 'bulk') bulk.push({ position, time: createdTime(snapshot) });
  });
  // Newest first; of two taken at the same moment the later one in the list is the newer
  bulk.sort((a, b) => (b.time - a.time) || (b.position - a.position));

  const dropped = new Set(bulk.slice(limit).map(item => item.position));
  return snapshots.filter((_snapshot, position) => !dropped.has(position));
}

/**
 * Add an automatic snapshot of the project to the project.
 *
 * A 'bulk' snapshot first replaces every older 'bulk' snapshot with the same
 * name (running the same tool twice on one chapter keeps one "before" state
 * of it, the newest), and then only the newest `keepBulk` bulk snapshots
 * stay. Manual and 'import' snapshots are never removed.
 *
 * @param {object} project - not changed
 * @param {{ name: string, description?: string, now?: Date, auto?: 'import' | 'bulk' }} options
 * @param {{ keepBulk?: number }} [limits]
 * @returns {{ project: object, snapshot: object }}
 */
function addAutoSnapshot(project, options = {}, { keepBulk = DEFAULT_KEEP_BULK } = {}) {
  const snapshot = buildSnapshot(project, options);
  const existing = project && Array.isArray(project.snapshots) ? project.snapshots : [];
  let snapshots;

  if (snapshot.auto === 'bulk') {
    const others = existing.filter(old => !(old && old.auto === 'bulk' && old.name === snapshot.name));
    // The snapshot just taken always stays, whatever the limit or the clock
    // says: the app has promised it to the author. So the older ones are
    // pruned to one place fewer, which is the same as pruning the whole list
    // whenever the new snapshot is the newest.
    const keep = isLimit(keepBulk) ? Math.max(1, Math.floor(keepBulk)) : DEFAULT_KEEP_BULK;
    snapshots = [...pruneBulkSnapshots(others, keep - 1), snapshot];
  } else {
    snapshots = [...existing, snapshot];
  }

  return { project: { ...project, snapshots }, snapshot };
}

module.exports = { buildSnapshot, addAutoSnapshot, pruneBulkSnapshots };

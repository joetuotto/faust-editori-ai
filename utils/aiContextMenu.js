/**
 * The "Tekoäly" submenu of the manuscript's context menu
 *
 * Main-process helpers with no Electron dependency, so they are unit-tested
 * directly. The renderer reports a right click inside the manuscript (point,
 * whether text is selected, the quick actions of the project); the main
 * process keeps that report for a moment and matches it to Electron's own
 * context-menu event by the click point. Electron alone cannot tell the
 * manuscript from a notes field or the chat input.
 */

const MAX_ACTIONS = 20;
const MAX_ID = 64;
const MAX_LABEL = 60;
const MAX_AGE_MS = 2000;
const MAX_DISTANCE = 4;

/**
 * Check a report from the renderer and stamp it with the time it arrived.
 * @returns {{ x: number, y: number, hasSelection: boolean, actions: Array<{id: string, label: string}>, at: number } | null}
 */
function sanitizeContext(info, now) {
  if (!info || typeof info !== 'object') return null;
  if (!Number.isFinite(info.x) || !Number.isFinite(info.y)) return null;

  const actions = [];
  for (const item of Array.isArray(info.actions) ? info.actions : []) {
    if (actions.length >= MAX_ACTIONS) break;
    if (!item || typeof item !== 'object') continue;
    if (typeof item.id !== 'string' || typeof item.label !== 'string') continue;
    if (item.id === '' || item.id.length > MAX_ID || item.label.length > MAX_LABEL) continue;
    actions.push({ id: item.id, label: item.label });
  }

  return { x: info.x, y: info.y, hasSelection: Boolean(info.hasSelection), actions, at: now };
}

/**
 * The stored report, when it belongs to this context-menu event.
 * The point ties the report to the click it came from, so a report can never
 * be used by a later right click in another field.
 * @param {object|null} stored result of sanitizeContext
 * @param {{ x: number, y: number, isEditable: boolean, selectionText: string }} params Electron's context-menu params
 */
function takeContext(stored, params, now) {
  if (!stored || !params) return null;
  if (!(now - stored.at <= MAX_AGE_MS)) return null;
  if (!(Math.abs(stored.x - params.x) <= MAX_DISTANCE) || !(Math.abs(stored.y - params.y) <= MAX_DISTANCE)) return null;
  if (!stored.hasSelection || !params.isEditable) return null;
  if (typeof params.selectionText !== 'string' || params.selectionText.trim() === '') return null;
  return stored;
}

/**
 * Menu item template for Electron: one item per action, then the free instruction.
 * @param {{ actions: Array<{id: string, label: string}> }} context
 * @param {(actionId: string) => void} onAction
 */
function buildAiSubmenu(context, onAction) {
  const actions = context && Array.isArray(context.actions) ? context.actions : [];
  return {
    label: 'Tekoäly',
    submenu: [
      ...actions.map((item) => ({ label: item.label, click: () => onAction(item.id) })),
      { type: 'separator' },
      { label: 'Oma ohje…', click: () => onAction('custom') }
    ]
  };
}

module.exports = { sanitizeContext, takeContext, buildAiSubmenu };

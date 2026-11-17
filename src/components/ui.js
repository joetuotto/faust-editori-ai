/**
 * src/components/ui.js (part: notifications) - the replacement for window.alert().
 *
 *   notify(kind, text, { detail, action, duration })   kind: 'success' | 'info' | 'warning' | 'error' | 'busy'
 *     returns { update(patch), close() }; action is { label, onClick }
 *   ToastHost                                          mounted once at the root, next to the shared dialogs
 *   installAlertShim()                                 window.alert -> notify, so the 71 legacy calls stop
 *                                                      producing native boxes on the first day
 * A native alert stays until it is dismissed, and some legacy alerts carry the only copy of a
 * result (a score with suggestions, a synopsis, comparison numbers). So: a shimmed message with
 * more than one line stays until closed, whatever its kind; its kind is read from its first line
 * only; and a notification that stays until closed is never pushed out by a newer one.
 * Uses the global React like the rest of the app; icons come from icons.js.
 */
import { Icon } from './icons.js';

const { createElement: e, useEffect, useState } = React;

const STAY = { success: 4000, info: 4000, warning: 8000, error: 0, busy: 0 };   // 0 = until closed
const MAX = 3;                    // at most three on screen, counting only those that leave by themselves
let items = [];
let waiting = [];                 // timed notifications that arrived while the stack held only persistent ones
let seq = 0;
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn(items));

// A fourth notification pushes out the oldest TIMED one. One that stays until closed (an error,
// a running task, a legacy message with content) is never evicted: a persistent newcomer is
// shown beside the others, a timed newcomer waits until one of them is closed.
function admit(item) {
  const next = [...items, item];
  while (next.length > MAX) {
    const i = next.findIndex(t => t.duration > 0 && t.id !== item.id);
    if (i === -1) break;
    next.splice(i, 1);
  }
  if (next.length > MAX && item.duration > 0) { waiting.push(item); return; }
  items = next;
}
function remove(id) {
  items = items.filter(t => t.id !== id);
  waiting = waiting.filter(t => t.id !== id);
  while (waiting.length && items.length < MAX) items = [...items, waiting.shift()];
  emit();
}

const MAX_STAYING = 5;            // a runaway of persistent notifications (a repeated failure) stops here
export function notify(kind, text, options = {}) {
  const id = ++seq;
  const item = { id, kind, text: String(text), detail: options.detail, action: options.action,
                 duration: options.duration === undefined ? STAY[kind] : options.duration };
  // The same message again replaces the one on screen instead of stacking a copy of it
  const same = t => t.kind === item.kind && t.text === item.text && t.detail === item.detail && !t.action && !item.action;
  items = items.filter(t => !same(t));
  waiting = waiting.filter(t => !same(t));
  admit(item);
  // Persistent notifications are never pushed out by timed ones; past five, the oldest persistent one goes
  const staying = items.filter(t => !(t.duration > 0));
  if (staying.length > MAX_STAYING) {
    const drop = new Set(staying.slice(0, staying.length - MAX_STAYING).map(t => t.id));
    items = items.filter(t => !drop.has(t.id));
  }
  emit();
  const close = () => remove(id);
  const update = (patch) => { items = items.map(t => (t.id === id ? { ...t, ...patch } : t)); emit(); };
  return { close, update };
}

// Interim classifier for messages that still arrive through window.alert(): order matters
// ("epäonnistui" contains "onnistui", "johdonmukaisuusvirheitä" contains "virhe").
export function inferKind(message) {
  const s = String(message);
  if (/^\s*\u2705/.test(s)) return 'success';                 // the check-mark emoji of legacy messages
  if (/^\s*\u26A0/.test(s)) return 'warning';                 // the warning sign
  if (/epäonnistui|virhe|ei voitu|ei löydy|ei käytettävissä|ei ole käytettävissä|failed|error/i.test(s)) return 'error';
  if (/valitse ensin|ei valittua|syötä|anna |et voi|ei ole valmi|eivät ole valmi|ei ole ladattu|on tyhjä|jäi kesken|ei ole kelvollinen|ei ole faust/i.test(s)) return 'warning';
  if (/valmis!|tallennettu|luotu|onnistui|lisätty|palautettu/i.test(s)) return 'success';
  return 'info';
}

export function installAlertShim() {
  window.alert = (message) => {
    const raw = String(message);
    const lines = raw.replace(/^[\s\u2705\u26A0\uFE0F\u2713\u2717]+/, '').split('\n');   // leading marks: the two emoji, a tick, a cross
    const detail = lines.slice(1).join('\n').trim();
    // The kind comes from the mark and the first line only: the rest is content, and a synopsis
    // may well contain the word "virhe". A message with content stays until it is closed.
    const kind = inferKind(raw.split('\n')[0]);
    notify(kind, lines[0], { detail: detail || undefined, duration: detail ? 0 : undefined });
  };
}

const ICON = { success: 'success', info: 'info', warning: 'warning', error: 'error' };

function Toast({ item }) {
  const [paused, setPaused] = useState(false);
  const close = () => remove(item.id);
  useEffect(() => {
    if (!item.duration || paused) return undefined;
    const timer = setTimeout(close, item.duration);
    return () => clearTimeout(timer);
  }, [item.duration, paused]);
  return e('div', {
    className: 'faust-toast faust-toast--' + item.kind,
    role: item.kind === 'error' || item.kind === 'warning' ? 'alert' : 'status',
    onMouseEnter: () => setPaused(true), onMouseLeave: () => setPaused(false),
    onFocus: () => setPaused(true), onBlur: () => setPaused(false),
    onKeyDown: (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } }   // Esc closes a toast only from inside it
  },
    e('span', { className: 'faust-toast__icon' },
      item.kind === 'busy' ? e('span', { className: 'faust-spinner' }) : Icon({ name: ICON[item.kind], size: 16 })),
    e('span', { className: 'faust-toast__text' }, item.text),
    e('button', { className: 'faust-btn faust-btn--icon faust-btn--sm faust-toast__close', 'aria-label': 'Sulje ilmoitus', onClick: close },
      Icon({ name: 'close', size: 14 })),
    item.detail ? e('span', { className: 'faust-toast__detail' }, item.detail) : null,
    item.action ? e('span', { className: 'faust-toast__actions' },
      e('button', { className: 'faust-btn faust-btn--sm', onClick: () => { item.action.onClick(); close(); } }, item.action.label)) : null,
    item.kind === 'busy' && item.progress !== undefined
      ? e('div', { className: 'faust-progress', style: { '--value': item.progress + '%' } }, e('i'))
      : null
  );
}

export function ToastHost() {
  const [list, setList] = useState(items);
  useEffect(() => {
    listeners.add(setList);
    setList(items);               // a notify() between the first render and this effect is not lost
    return () => { listeners.delete(setList); };
  }, []);
  return e('div', { className: 'faust-toast-host' }, list.map(item => e(Toast, { key: item.id, item })));
}

if (typeof window !== 'undefined') window.FaustUI = Object.assign(window.FaustUI || {}, { notify, inferKind, installAlertShim });

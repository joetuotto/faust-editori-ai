/**
 * src/components/ui.js - FAUST's shared components, drawn with the classes of
 * styles/faust-components.css. Everything here is also on window.FaustUI for the script-tag
 * components (AnnotationMargin, the Modals, ClaudeChat), which read it at render or call time.
 *
 * Part 1, notifications: the replacement for the native alert box.
 *   notify(kind, text, { detail, action, duration })   kind: 'success' | 'info' | 'warning' | 'error' | 'busy'
 *     returns { update(patch), close() }; action is { label, onClick }
 *   ToastHost                                          mounted once at the root, next to the shared dialogs
 * A notification that stays until closed (duration 0) is never pushed out by a newer one.
 *
 * Part 2, controls: Button, IconButton, SigilButton, Field, Tabs, Segmented, Chip, Row, Section,
 *   Progress, Spinner, EmptyState, Callout, Rating, VoiceButton, DiffView (+ coalesceDiff).
 * Part 3, layers: layerStack, Dialog, Popover with usePopover, Tooltip; holdLayer, returnFocus
 *   and scrimPress for the modal layers that do not render through Dialog. What opens over other content renders
 *   in the layer host (.faust-layer, the last child of .faust-app) through ReactDOM.createPortal,
 *   or in place when there is no host.
 *
 * Esc closes the topmost layer only. Dialogs and anything anchored inside a dialog take it in the
 * capture phase through layerStack; a popover outside a dialog takes it in the bubble phase on
 * document, after the focused element and before the app's own window handler.
 *
 * Uses the global React and ReactDOM like the rest of the app; icons come from icons.js.
 */
import { Icon, icons } from './icons.js';

const { createElement: e, useEffect, useLayoutEffect, useState, useRef, useCallback, useId, cloneElement, isValidElement } = React;

const STAY = { success: 4000, info: 4000, warning: 8000, error: 0, busy: 0 };   // 0 = until closed
const MAX = 3;                    // at most three on screen, counting only those that leave by themselves
let items = [];
let waiting = [];                 // timed notifications that arrived while the stack held only persistent ones
let seq = 0;
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn(items));

// A fourth notification pushes out the oldest TIMED one. One that stays until closed (an error,
// a running task, a message shown with duration 0) is never evicted: a persistent newcomer is
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
    // A number never stands at a line's end apart from its unit ('50 merkkiä', M B.13)
    e('span', { className: 'faust-toast__text' }, typeof item.text === 'string' ? item.text.replace(/(\d) (?=[^\s\d])/g, '$1\u00a0') : item.text),
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

// A notification never covers an open popover (lead, final pass: "Notifications vs. Etsi"). The host's own place is
// the stylesheet's: under the format bar, centred on the editor pane (faust-components.css section 8). While a
// popover, the inline prompt or the dock's bar lies over that place, the host stands beside it in the pane, on the
// side nearer the pane's axis, or under it, and the stylesheet's place comes back when nothing covers it. When no
// place is free of all three, the popovers and the prompt still win: the host stands under them above the dock's bar
// and scrolls, else it may cover the bar, and as a last resort it scrolls in the room left above the status bar. It
// never goes back over a popover.
const TOAST_AVOID = '.faust-popover, .cm-tooltip.cm-faust-prompt, .faust-dock > *';
const TOAST_DOCK = '.faust-dock > *';
const TOAST_GAP = 8;              // between the notifications and what they give way to (--sp-2)
const TOAST_EDGE = 16;            // from the editor pane's edges and the status bar (--sp-4), as the stylesheet keeps it
const TOAST_BESIDE_W = 280;       // beside a popover only with this much room; else under it
const TOAST_NARROW_W = 200;       // the last choice: beside it in a narrower column
const TOAST_MIN_H = 48;           // under the popovers when nothing is free: room for one line of a notification

// The newest notification when the host was last held to a height and scrolled, and where it was scrolled to
const lastScroll = new WeakMap();

function placeToastHost(host) {
  const style = host.style;
  const scrolled = { newest: lastScroll.get(host), top: host.scrollTop };
  lastScroll.delete(host);
  ['left', 'top', 'width', 'transform', 'max-height', 'overflow-y'].forEach(name => style.removeProperty(name));
  // The stack's height for the stylesheet (section 15: the page head moves down under a notification of
  // two lines or a stack, instead of lying half under it). Only in the stylesheet's own place: a host
  // moved beside or under a popover is not over the head.
  const app = host.closest('.faust-app');
  const tell = (height) => {
    if (!app) return;
    if (height > 0) app.style.setProperty('--toast-h', Math.ceil(height) + 'px');
    else app.style.removeProperty('--toast-h');
  };
  if (!host.childElementCount) { tell(0); return; }
  const own = host.getBoundingClientRect();
  tell(own.height);
  const avoided = Array.from(document.querySelectorAll(TOAST_AVOID))
    .filter(el => !host.contains(el))
    .map(el => ({ rect: el.getBoundingClientRect(), dock: el.matches(TOAST_DOCK) }))
    .filter(({ rect: r }) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight);
  const blocks = avoided.map(b => b.rect);
  // What a notification may never cover: the popovers and the prompt (the dock's bar gives way last)
  const covers = avoided.filter(b => !b.dock).map(b => b.rect);
  const meets = (r, b) => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
  const over = blocks.filter(b => meets(own, b));
  if (over.length === 0) return;
  tell(0);

  // The editor pane, as the stylesheet reads it: between the open side columns, above the status bar. The
  // properties hold expressions (a right column is clamp(360px, 30vw, 440px)), so a probe resolves them.
  const probe = document.createElement('div');
  probe.style.cssText = 'position: fixed; visibility: hidden; pointer-events: none; top: auto; height: 0; '
    + 'left: var(--left-col-w, 0px); right: var(--right-col-w, 0px); bottom: var(--footer-h, 0px);';
  (host.parentElement || document.body).appendChild(probe);
  const pane = probe.getBoundingClientRect();
  probe.remove();
  const paneLeft = pane.left + TOAST_EDGE;
  const paneRight = pane.right - TOAST_EDGE;
  const floor = pane.bottom - TOAST_EDGE;
  const axis = own.left + own.width / 2;
  const at = (left, top, width) => ({ left, top, width, right: left + width, bottom: top + own.height });
  const start = Math.min(...over.map(b => b.left));
  const end = Math.max(...over.map(b => b.right));
  const beside = (least) => {
    const found = [];
    const leftRoom = start - TOAST_GAP - paneLeft;
    if (leftRoom >= least) {
      const width = Math.min(own.width, leftRoom);
      found.push(at(Math.max(paneLeft, Math.min(axis - width / 2, start - TOAST_GAP - width)), own.top, width));
    }
    const rightRoom = paneRight - end - TOAST_GAP;
    if (rightRoom >= least) {
      const width = Math.min(own.width, rightRoom);
      found.push(at(Math.min(paneRight - width, Math.max(axis - width / 2, end + TOAST_GAP)), own.top, width));
    }
    return found.sort((a, b) => Math.abs(a.left + a.width / 2 - axis) - Math.abs(b.left + b.width / 2 - axis));
  };
  const under = at(own.left, Math.max(...over.map(b => b.bottom)) + TOAST_GAP, own.width);
  const candidates = [...beside(TOAST_BESIDE_W), under, ...beside(TOAST_NARROW_W)].filter(r => r.bottom <= floor);
  let place = candidates.find(r => !blocks.some(b => meets(r, b)));
  let room = 0;
  // The room under the popovers down to `limit` when one line fits there and nothing of `avoid` lies in it, else 0
  const underTo = (limit, avoid) => {
    const box = { ...under, bottom: limit };
    return limit - under.top >= TOAST_MIN_H && !avoid.some(b => meets(box, b)) ? limit - under.top : 0;
  };
  if (!place) {
    // Nothing free: first under the popovers and above the dock's bar, the notifications scrolling there (the
    // newest in view), so that the popovers and the bar's buttons both stay usable
    const bars = blocks.filter(b => !covers.includes(b) && b.left < under.right && b.right > under.left && b.top > under.top);
    room = underTo(Math.min(floor, ...bars.map(b => b.top - TOAST_GAP)), blocks);
    if (room > 0) place = under;
  }
  // Then free of the popovers and the prompt, over the dock's bar (its keys still work; Etsi is where the author types)
  if (!place) place = candidates.find(r => !covers.some(b => meets(r, b)));
  if (!place) {
    // The last resort: under the popovers in the room left above the status bar, over the bar
    room = underTo(floor, covers);
    if (room > 0) place = under;
  }
  if (!place) return;             // no room at all (a popover as high as the pane): the stylesheet's place
  style.transform = 'none';
  style.left = Math.round(place.left) + 'px';
  style.top = Math.round(place.top) + 'px';
  style.width = Math.round(place.width) + 'px';
  if (room > 0) {
    style.maxHeight = Math.floor(room) + 'px';
    style.overflowY = 'auto';
    // A new notification (the last one) comes into view; placed again for anything else, the host stays where the
    // author scrolled it
    const newest = host.lastElementChild;
    host.scrollTop = newest === scrolled.newest ? scrolled.top : host.scrollHeight;
    lastScroll.set(host, newest);
  }
}

export function ToastHost() {
  const [list, setList] = useState(items);
  const hostRef = useRef(null);
  useEffect(() => {
    listeners.add(setList);
    setList(items);               // a notify() between the first render and this effect is not lost
    return () => { listeners.delete(setList); };
  }, []);
  // Placed again whenever the notifications change, and while any is shown, when something opens, closes or
  // moves in the layer host (a popover follows its anchor, the prompt its text) and when the window is resized
  useLayoutEffect(() => { if (hostRef.current) placeToastHost(hostRef.current); }, [list]);
  const showing = list.length > 0;
  useEffect(() => {
    const host = hostRef.current;
    if (!showing || !host) return undefined;
    let frame = 0;
    const again = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; placeToastHost(host); });
    };
    const layer = document.querySelector('.faust-layer');
    const observer = layer && typeof MutationObserver !== 'undefined' ? new MutationObserver(again) : null;
    if (observer) observer.observe(layer, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    // The page's bottom dock is outside the layer host: a suggestion bar that comes, goes or changes its words
    // after the notifications were placed places them again (it may have come under them)
    const dock = observer ? document.querySelector('.faust-dock') : null;
    if (dock) observer.observe(dock, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });
    window.addEventListener('resize', again);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', again);
      cancelAnimationFrame(frame);
    };
  }, [showing]);
  return e('div', { className: 'faust-toast-host', ref: hostRef }, list.map(item => e(Toast, { key: item.id, item })));
}

// ===================================================================== Part 2: controls

const cx = (...parts) => parts.filter(Boolean).join(' ');
// An icon given by name ('close') or as a ready element
const iconOf = (icon, size) => (typeof icon === 'string' ? Icon({ name: icon, size }) : icon || null);

/** .faust-btn and its modifiers. busy sets disabled and aria-busy and puts a spinner before the label. */
export function Button({ variant, size, icon, busy = false, pressed, danger, block, className, children, ...props }) {
  return e('button', {
    type: 'button',
    ...props,
    className: cx('faust-btn', variant && `faust-btn--${variant}`, block && 'faust-btn--block', danger && 'faust-btn--danger', size && `faust-btn--${size}`, className),
    disabled: props.disabled || busy,
    'aria-busy': busy || undefined,
    'aria-pressed': pressed === undefined ? props['aria-pressed'] : pressed
  },
    busy ? e('span', { className: 'faust-spinner faust-spinner--sm' }) : iconOf(icon, size === 'sm' ? 14 : 16),
    children
  );
}

/** An icon-only button. label is the control's constant name (aria-label); title the tooltip for its state. */
export function IconButton({ icon, label, title, size, danger, pressed, className, ...props }) {
  return e('button', {
    type: 'button',
    ...props,
    className: cx('faust-btn faust-btn--icon', size && `faust-btn--${size}`, danger && 'faust-btn--danger', className),
    'aria-label': label,
    title: title || label,
    'aria-pressed': pressed
  }, iconOf(icon, size === 'sm' ? 14 : 16));
}

/**
 * One of FAUST's own AI verbs: the sigil and its caption (the command's name, also the aria-label).
 * tooltip is the Finnish text, latin the second line of the tooltip; busy shows the spinner;
 * tooltipOff keeps the tooltip away while the tile's own result popover stands where it would show.
 */
export function SigilButton({ sigil, label, primary, busy = false, tooltip, latin, tooltipOff = false, caption = true, size, className, disabled, ...props }) {
  const draw = icons[sigil];
  const button = e('button', {
    type: 'button',
    ...props,
    className: cx('faust-sigil-btn', caption && 'faust-sigil-btn--captioned', primary && 'faust-sigil-btn--primary', size && `faust-sigil-btn--${size}`, className),
    'aria-label': label,
    disabled: disabled || busy,
    'aria-busy': busy || undefined
  },
    busy ? e('span', { className: 'faust-spinner' }) : draw ? draw({ size: 20 }) : null,
    // One line: the command's menu name (R-58; the gloss of Magnum Opus is in its tooltip and on the Tekoäly tab, MV-60)
    caption && e('span', { className: 'faust-sigil-btn__caption' }, label)
  );
  return tooltip || latin ? e(Tooltip, { text: tooltip, title: latin, off: tooltipOff }, button) : button;
}

/**
 * A labelled field. The single child control gets the id, aria-describedby (hint, error) and
 * aria-invalid; error === '' keeps the error line's room without a message.
 */
export function Field({ label, hint, error, className, children }) {
  const id = useId();
  const single = isValidElement(children);
  const controlId = single ? children.props.id || id : undefined;
  const hasError = error !== undefined && error !== null && error !== false;
  const hintId = hint ? id + '-hint' : null;
  const errorId = hasError && error ? id + '-error' : null;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = single
    ? cloneElement(children, {
      id: controlId,
      'aria-describedby': describedBy || children.props['aria-describedby'],
      'aria-invalid': errorId ? true : children.props['aria-invalid']
    })
    : children;
  return e('div', { className: cx('faust-field', className) },
    label && e('label', { className: 'faust-field__label', htmlFor: controlId }, label),
    control,
    hint && e('div', { id: hintId, className: 'faust-field__hint' }, hint),
    hasError && e('div', { id: errorId || undefined, className: 'faust-field__error' }, error || '')
  );
}

/**
 * The tab row only (role="tablist", arrow keys, Home, End). It never owns or unmounts the panels.
 * items: [{ id, label, title?, busy?, disabled? }]
 */
export function Tabs({ value, onChange, items, label, className }) {
  const refs = useRef([]);
  const choose = (index) => {
    const item = items[index];
    if (!item) return;
    if (onChange) onChange(item.id);
    const el = refs.current[index];
    if (el) el.focus();
  };
  const onKeyDown = (ev) => {
    const enabled = items.map((item, index) => (item.disabled ? -1 : index)).filter(index => index !== -1);
    if (enabled.length === 0) return;
    const at = enabled.indexOf(items.findIndex(item => item.id === value));
    let next = null;
    if (ev.key === 'ArrowRight') next = enabled[(at + 1) % enabled.length];
    else if (ev.key === 'ArrowLeft') next = enabled[(at - 1 + enabled.length) % enabled.length];
    else if (ev.key === 'Home') next = enabled[0];
    else if (ev.key === 'End') next = enabled[enabled.length - 1];
    if (next === null || next === undefined) return;
    ev.preventDefault();
    choose(next);
  };
  return e('div', { className: cx('faust-tabs', className), role: 'tablist', 'aria-label': label, onKeyDown },
    items.map((item, index) => e('button', {
      key: item.id,
      ref: (el) => { refs.current[index] = el; },
      type: 'button',
      role: 'tab',
      className: 'faust-tab',
      'aria-selected': item.id === value,
      'aria-busy': item.busy || undefined,
      tabIndex: item.id === value ? 0 : -1,
      title: item.title,
      disabled: item.disabled,
      onClick: () => onChange && onChange(item.id)
    }, item.label))
  );
}

/** A choice of one value: items [{ value, label, title?, icon?, disabled? }]. */
export function Segmented({ value, onChange, items, block, label, disabled, className }) {
  return e('div', { className: cx('faust-segmented', block && 'faust-segmented--block', className), role: 'group', 'aria-label': label },
    items.map(item => e('button', {
      key: String(item.value),
      type: 'button',
      className: 'faust-segmented__option',
      'aria-pressed': item.value === value,
      title: item.title,
      disabled: disabled || item.disabled,
      onClick: () => onChange && onChange(item.value)
    }, iconOf(item.icon, 14), item.label))
  );
}

/** .faust-chip; role: 'accent' | 'success' | 'warning' | 'error' | 'info'. With onClick it is a button. */
export function Chip({ role, dot, hollow, count: isCount, plain, struck, pressed, onClick, className, children, ...props }) {
  const classes = cx('faust-chip', role && `faust-chip--${role}`, dot && 'faust-chip--dot', hollow && 'faust-chip--hollow',
    isCount && 'faust-chip--count', plain && 'faust-chip--plain', struck && 'faust-chip--struck', className);
  return onClick
    ? e('button', { type: 'button', ...props, className: classes, 'aria-pressed': pressed, onClick }, children)
    : e('span', { ...props, className: classes }, children);
}

/**
 * A list row. Without actions it is a button; with actions a div role="button" that Enter and
 * Space activate when the row itself has the focus (its actions are buttons of their own).
 */
export function Row({ icon, title, meta, selected, author, two, actions, onActivate, disabled, className, children, ...props }) {
  const classes = cx('faust-row', author && 'faust-row--author', two && 'faust-row--two', selected && 'is-selected', className);
  const inner = [
    icon && e('span', { className: 'faust-row__icon' }, iconOf(icon, 14)),
    e('span', { className: 'faust-row__text' },
      e('span', { className: 'faust-row__title' }, title),
      meta && e('span', { className: 'faust-row__meta' }, meta)
    ),
    children,
    actions && e('span', {
      className: 'faust-row__actions',
      onClick: (ev) => ev.stopPropagation(),
      onKeyDown: (ev) => ev.stopPropagation()
    }, actions)
  ];
  if (!actions) {
    return e('button', { type: 'button', ...props, className: classes, disabled, onClick: onActivate }, ...inner);
  }
  return e('div', {
    ...props,
    role: 'button',
    tabIndex: disabled ? -1 : 0,
    'aria-disabled': disabled || undefined,
    className: classes,
    onClick: disabled ? undefined : onActivate,
    onKeyDown: (ev) => {
      if (disabled || ev.target !== ev.currentTarget) return;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (onActivate) onActivate(ev);
      }
    }
  }, ...inner);
}

/** A section of a panel: the one caps heading, an optional small action on the right. */
export function Section({ title, action, className, children }) {
  return e('section', { className: cx('faust-section', className) },
    (title || action) && e('div', { className: 'faust-section__head' },
      title && e('div', { className: 'faust-section__title', role: 'heading', 'aria-level': 3 }, title),
      action
    ),
    children
  );
}

/** value is a percentage; goal draws the 6px goal bar; indeterminate slides. */
export function Progress({ value = 0, goal, indeterminate, complete, error, label }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return e('div', {
    className: cx('faust-progress', goal && 'faust-progress--goal', indeterminate && 'faust-progress--indeterminate', complete && 'is-complete', error && 'is-error'),
    role: 'progressbar',
    'aria-label': label,
    'aria-valuemin': indeterminate ? undefined : 0,
    'aria-valuemax': indeterminate ? undefined : 100,
    'aria-valuenow': indeterminate ? undefined : Math.round(percent),
    style: indeterminate ? undefined : { '--value': percent + '%' }
  }, e('i'));
}

/** size: 'sm' (in buttons) | 'lg' (waiting steps) */
export function Spinner({ size } = {}) {
  return e('span', { className: cx('faust-spinner', size && `faust-spinner--${size}`), 'aria-hidden': 'true' });
}

/** size: 'compact' | 'page'; busy puts a spinner in the icon slot; error shows the error icon. */
export function EmptyState({ icon, title, hint, action, size, busy, error }) {
  const shown = busy ? e('span', { className: 'faust-spinner faust-spinner--lg' })
    : iconOf(icon || (error ? 'error' : null), size === 'compact' ? 20 : 40);
  return e('div', {
    className: cx('faust-empty', size === 'compact' && 'faust-empty--compact', size === 'page' && 'faust-empty--page', error && 'is-error'),
    role: busy ? 'status' : undefined
  },
    shown && e('div', { className: 'faust-empty__icon' }, shown),
    title && e('div', { className: 'faust-empty__title' }, title),
    hint && e('div', { className: 'faust-empty__hint' }, hint),
    action && e('div', { className: 'faust-empty__action' }, action)
  );
}

const CALLOUT_ICON = { hint: 'idea', info: 'info', success: 'success', warning: 'warning', error: 'error' };

/** A message that stays true while its view is open. role: 'hint' | 'info' | 'success' | 'warning' | 'error' */
export function Callout({ role = 'info', title, actions, children }) {
  return e('div', { className: cx('faust-callout', `faust-callout--${role}`), role: role === 'error' ? 'alert' : undefined },
    e('span', { className: 'faust-callout__icon' }, Icon({ name: CALLOUT_ICON[role] || 'info', size: 16 })),
    title && e('div', { className: 'faust-callout__title' }, title),
    children !== undefined && children !== null && children !== false && e('div', { className: 'faust-callout__body' }, children),
    actions && e('div', { className: 'faust-callout__actions' }, actions)
  );
}

const STAR_LABELS = ['Anna 1 tähti', 'Anna 2 tähteä', 'Anna 3 tähteä', 'Anna 4 tähteä', 'Anna 5 tähteä'];

/** The author's own rating: five star buttons; the stars up to the value are pressed and filled. */
export function Rating({ value = 0, onChange, label, disabled }) {
  const current = Number(value) || 0;
  return e('div', { className: 'faust-rating', role: 'group', 'aria-label': label },
    STAR_LABELS.map((text, index) => {
      const n = index + 1;
      const on = n <= current;
      return e('button', {
        key: n,
        type: 'button',
        className: cx('faust-btn faust-btn--icon faust-btn--sm faust-rating__star', on && 'is-on'),
        'aria-label': text,
        title: text,
        'aria-pressed': on,
        disabled,
        onClick: () => onChange && onChange(n)
      }, icons.star({ size: 16, filled: on }));
    })
  );
}

/**
 * The microphone, one glyph in every state; the state is the button's.
 * state: 'idle' | 'listening' | 'processing' (anything else draws as idle)
 */
export function VoiceButton({ state = 'idle', onToggle, label, title, disabled, className, ...props }) {
  const listening = state === 'listening';
  const processing = state === 'processing';
  return e('button', {
    type: 'button',
    ...props,
    className: cx('faust-btn faust-btn--icon', className),
    'aria-label': label,
    title: title || label,
    'aria-pressed': listening,
    'data-state': listening ? 'listening' : undefined,
    'aria-busy': processing || undefined,
    disabled: disabled || processing,
    onClick: onToggle
  }, icons.mic({ size: 16 }));
}

/**
 * Runs of a word comparison, coalesced: adjacent pieces of one kind become one, and inside a changed
 * region every removal comes before every addition. pieces: [{ type: 'same' | 'removed' | 'added', text }]
 */
export function coalesceDiff(pieces) {
  const out = [];
  let removed = '';
  let added = '';
  const flush = () => {
    if (removed) out.push({ type: 'removed', text: removed });
    if (added) out.push({ type: 'added', text: added });
    removed = '';
    added = '';
  };
  for (const piece of pieces || []) {
    if (!piece || !piece.text) continue;
    if (piece.type === 'removed') removed += piece.text;
    else if (piece.type === 'added') added += piece.text;
    else {
      flush();
      const last = out[out.length - 1];
      if (last && last.type === 'same') last.text += piece.text;
      else out.push({ type: 'same', text: piece.text });
    }
  }
  flush();
  return out;
}

const diffRun = (piece, index) => (piece.type === 'removed'
  ? e('del', { key: index, className: 'faust-mark faust-mark--del' }, piece.text)
  : piece.type === 'added'
    ? e('ins', { key: index, className: 'faust-mark faust-mark--ins' }, piece.text)
    : piece.text);

/**
 * The shared diff renderer. mode 'unified': one column with both marks; 'split': the old text with
 * its removals on the left, the new text with its additions on the right, under the column heads
 * before and after (any content: version, date, word count).
 */
export function DiffView({ pieces, mode = 'unified', before, after, className }) {
  const runs = coalesceDiff(pieces);
  const keep = { whiteSpace: 'pre-wrap' };   // paragraph breaks are kept
  if (mode !== 'split') {
    return e('div', { className: cx('faust-diff faust-diff--unified', className), style: keep }, runs.map(diffRun));
  }
  const column = (head, type) => e('div', { className: 'faust-diff__col' },
    head && e('div', { className: 'faust-diff__colhead' }, head),
    e('div', { style: keep }, runs.filter(run => run.type === 'same' || run.type === type).map(diffRun))
  );
  return e('div', { className: cx('faust-diff faust-diff--split', className) },
    column(before, 'removed'),
    e('div', { className: 'faust-diff__rule', 'aria-hidden': 'true' }),
    column(after, 'added')
  );
}

// ===================================================================== Part 3: layers

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
const FIELDS = 'input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled)';

// The layer host, the last child of .faust-app; without it a layer renders in place
const layerHost = () => (typeof document !== 'undefined' ? document.querySelector('.faust-layer') : null);
const inLayer = (node) => {
  const host = layerHost();
  return host ? ReactDOM.createPortal(node, host) : node;
};

// Was the last input a pointer press? A popover opened by the pointer does not take the focus.
let lastInputWasPointer = false;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { lastInputWasPointer = true; }, true);
  document.addEventListener('keydown', () => { lastInputWasPointer = false; }, true);
}

/**
 * The stack of open modal layers (dialogs, questions, the script-tag forms, and popovers or menus
 * inside a dialog), topmost last. It is also the one stacking order of every modal layer.
 *   push(onEscape?) → token   remove(token)   isTop(token)   size()
 *   place(token) → how many layers are open under it (-1 when it is not open)
 *   subscribe(fn) → unsubscribe; fn runs whenever a layer opens or closes
 * One capture-phase listener on window gives Esc to the topmost layer and stops the event there.
 * A layer pushed without onEscape handles the key itself and checks isTop(token) first.
 * A layer with a scrim stands at z --z-modal + place + 1 and is stacked (its scrim not painted)
 * when its place is above 0; it follows its place through subscribe, so when a layer under it
 * closes it moves down and the new bottom layer paints the dimming again.
 */
const layers = [];
let layerSeq = 0;
let layerKeysOn = false;
const layerListeners = new Set();
const emitLayers = () => Array.from(layerListeners).forEach(fn => fn());
function onLayerKeyDown(ev) {
  if (ev.key !== 'Escape' || layers.length === 0) return;
  const top = layers[layers.length - 1];
  if (typeof top.onEscape !== 'function') return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  top.onEscape(ev);
}
export const layerStack = {
  // meta.covers: the layer is a full dialog panel, which hides a dialog lying under it (see covered)
  push(onEscape, meta) {
    if (!layerKeysOn && typeof window !== 'undefined') {
      window.addEventListener('keydown', onLayerKeyDown, true);
      layerKeysOn = true;
    }
    const token = ++layerSeq;
    layers.push({ token, onEscape, covers: !!(meta && meta.covers) });
    emitLayers();
    return token;
  },
  // Does a full dialog lie over this layer? A question, a prompt and a popover over it do not count.
  covered(token) {
    const index = layers.findIndex(layer => layer.token === token);
    return index !== -1 && layers.slice(index + 1).some(layer => layer.covers);
  },
  remove(token) {
    const index = layers.findIndex(layer => layer.token === token);
    if (index === -1) return;
    layers.splice(index, 1);
    emitLayers();
  },
  isTop(token) {
    return layers.length > 0 && layers[layers.length - 1].token === token;
  },
  size() {
    return layers.length;
  },
  place(token) {
    return layers.findIndex(layer => layer.token === token);
  },
  subscribe(fn) {
    layerListeners.add(fn);
    return () => { layerListeners.delete(fn); };
  }
};

// The background of an open dialog is inert: every sibling on the way from the scrim up to
// .faust-app (notifications excepted). Counted, so stacked dialogs release in any order.
// The layer host itself stays live, because a layer opened later renders into it (a dialog over
// a form or a question that renders in place); what is in it now is held one by one.
const inertHolds = new Map();
function holdBackground(scrim) {
  if (!scrim || typeof document === 'undefined') return () => {};
  const top = scrim.closest('.faust-app') || document.body;
  const held = [];
  const hold = (el) => {
    const holds = inertHolds.get(el) || 0;
    if (holds === 0 && el.inert) return;                   // inert for its own reasons: not ours to release
    if (holds === 0) el.inert = true;
    inertHolds.set(el, holds + 1);
    held.push(el);
  };
  for (let node = scrim; node && node !== top && node.parentElement; node = node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || sibling.classList.contains('faust-toast-host')) continue;
      if (sibling.classList.contains('faust-layer')) Array.from(sibling.children).forEach(hold);
      else hold(sibling);
    }
  }
  return () => held.forEach((el) => {
    const holds = inertHolds.get(el) || 0;
    if (holds <= 1) { inertHolds.delete(el); el.inert = false; } else inertHolds.set(el, holds - 1);
  });
}

// Tab stays inside the panel
function keepTabInside(ev) {
  if (ev.key !== 'Tab') return;
  const panel = ev.currentTarget;
  const list = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
  if (list.length === 0) { ev.preventDefault(); panel.focus(); return; }
  const first = list[0];
  const last = list[list.length - 1];
  if (ev.shiftKey && (document.activeElement === first || document.activeElement === panel)) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
}

// Where each open modal layer gives the focus back, by its scrim
const restoreOf = new WeakMap();

/**
 * Gives the focus back to previous when a modal layer closes. When previous went away with a
 * layer that closed earlier (a lower dialog closed from the menu while this one was open), the
 * focus goes where that layer would have given it, and so on down.
 */
export function returnFocus(previous) {
  let target = previous;
  for (let hops = 0; target && !target.isConnected && hops < 16; hops++) {
    const scrim = target.closest ? target.closest('.faust-scrim') : null;
    target = scrim ? restoreOf.get(scrim) : null;
  }
  if (target && target.isConnected && typeof target.focus === 'function') target.focus();
}

/**
 * What a modal layer that does not render through Dialog takes from it (the prompt, the confirm
 * and the script-tag forms, on window.FaustUI): the background inert, Tab kept inside the panel,
 * and previous (the focus before it opened) remembered for returnFocus. Call it once the scrim
 * and the panel are in the document; it returns the release.
 */
export function holdLayer(scrim, panel, previous) {
  if (scrim && previous) restoreOf.set(scrim, previous);
  const release = holdBackground(scrim);
  if (panel) panel.addEventListener('keydown', keepTabInside);
  return () => {
    if (panel) panel.removeEventListener('keydown', keepTabInside);
    release();
  };
}

/**
 * A press on a scrim: the default action of a mousedown would move the focus to the body after the
 * layer has closed and given the focus back, and out of a form that stays open. So it is always
 * prevented on the scrim itself; dismiss (a view, not busy) also closes the layer.
 */
export function scrimPress(ev, dismiss) {
  if (ev.target !== ev.currentTarget) return;
  ev.preventDefault();
  if (dismiss) dismiss();
}

/**
 * The shared dialog: scrim and panel in the layer host, Esc through the layer stack (onClose),
 * focus moved in (data-autofocus, else the first field, else the panel; initialFocus 'panel': the panel,
 * as a view whose first field belongs to one of its items) and returned on close,
 * Tab kept inside, the background inert, stacked by the order of opening. A press on the scrim
 * closes it only with dismissOnScrim (views, never forms). No Enter handler and no "discard
 * changes?" question of its own. bodyMode: 'flush' | 'fixed'. Render it only while it is open,
 * or pass open.
 */
export function Dialog(props) {
  return props.open === false ? null : e(DialogFrame, props);
}

function DialogFrame({ title, sub, icon, size = 'md', width, actions, bodyMode, onClose, dismissOnScrim = false,
  footer, footerStart, busy = false, closeTitle = 'Sulje (Esc)', className, initialFocus, children }) {
  const scrimRef = useRef(null);
  const panelRef = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Its place in the layer stack: how many layers are open under it. Before the layout effect
  // has pushed it, it is the newest, so the top.
  const [below, setBelow] = useState(() => layerStack.size());
  const [covered, setCovered] = useState(false);

  useLayoutEffect(() => {
    const token = layerStack.push(() => { if (onCloseRef.current) onCloseRef.current(); }, { covers: size !== 'sm' });
    const follow = () => {
      setBelow(Math.max(0, layerStack.place(token)));
      setCovered(layerStack.covered(token));
    };
    follow();
    const stop = layerStack.subscribe(follow);
    return () => {
      stop();
      layerStack.remove(token);
    };
  }, []);

  useEffect(() => {
    const previous = document.activeElement;
    const panel = panelRef.current;
    const target = panel && (initialFocus === 'panel' ? panel
      : panel.querySelector('[data-autofocus]') || panel.querySelector(FIELDS) || panel);
    if (target && target.focus) target.focus();
    if (scrimRef.current && previous) restoreOf.set(scrimRef.current, previous);
    const release = holdBackground(scrimRef.current);
    return () => {
      release();
      returnFocus(previous);
    };
  }, []);

  const close = () => { if (onCloseRef.current) onCloseRef.current(); };

  return inLayer(e('div', {
    ref: scrimRef,
    // is-covered: a full dialog is stacked on this one. Its panel is not drawn while that lasts: a
    // wider, lower panel over it (Versioiden vertailu over Luvun versiot) left the covered dialog's
    // frame showing above and below as a doubled, broken edge
    className: cx('faust-scrim', below > 0 && 'is-stacked', covered && 'is-covered'),
    style: { zIndex: `calc(var(--z-modal) + ${below + 1})` },
    onMouseDown: (ev) => scrimPress(ev, dismissOnScrim && !busy ? close : null)
  },
    e('div', {
      ref: panelRef,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': title ? titleId : undefined,
      'aria-busy': busy || undefined,
      tabIndex: -1,
      className: cx('faust-dialog', `faust-dialog--${size}`, className),
      style: width ? { '--dialog-w': typeof width === 'number' ? width + 'px' : width } : undefined,
      onKeyDown: keepTabInside
    },
      e('div', { className: 'faust-dialog__header' },
        e('div', { className: 'faust-dialog__heading' },
          e('h2', { id: titleId, className: 'faust-dialog__title' }, iconOf(icon, 20), title),
          sub && e('div', { className: 'faust-dialog__sub' }, sub)
        ),
        actions && e('div', { className: 'faust-dialog__actions' }, actions),
        onClose && e('button', {
          type: 'button',
          className: 'faust-btn faust-btn--icon',
          'aria-label': 'Sulje',
          title: closeTitle,
          onClick: close
        }, icons.close({ size: 16 }))
      ),
      e('div', { className: cx('faust-dialog__body', bodyMode && `faust-dialog__body--${bodyMode}`) }, children),
      (footer || footerStart) && e('div', { className: 'faust-dialog__footer' },
        footerStart && e('div', { className: 'faust-dialog__footer-start' }, footerStart),
        footer
      )
    )
  ));
}

// One popover open at a time
let currentPopover = null;

/**
 * State for one popover and its trigger: one open at a time, the trigger's aria-expanded.
 *   const pop = usePopover();
 *   e('button', { ...pop.triggerProps, … }), pop.open && e(Popover, { ...pop.popoverProps, title }, …)
 */
export function usePopover() {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen(value => !value), []);
  useEffect(() => {
    if (!open) return undefined;
    const me = { close };
    if (currentPopover && currentPopover.close !== close) currentPopover.close();
    currentPopover = me;
    return () => { if (currentPopover === me) currentPopover = null; };
  }, [open, close]);
  return {
    open, setOpen, toggle, close, anchorRef,
    triggerProps: { ref: anchorRef, 'aria-expanded': open, onClick: toggle },
    popoverProps: { anchorRef, onClose: close }
  };
}

/**
 * A popover in the layer host, placed from its anchor's rectangle (below it, or above when there is
 * no room; right-aligned at the window edge) and placed again on resize, on scroll and when the anchor
 * or a box around it changes size (a panel opening beside it, a container rule of its bar). When the anchor
 * is missing or hidden (an empty rectangle, as in focus mode) it carries data-anchor="none" and no
 * inline top or left: the stylesheet gives it a fixed place. Closes on Esc (bubble phase; with
 * layer 'modal' through the layer stack), on a press outside it and its anchor, and by its close
 * button. Opened by the keyboard it takes the focus; on closing it calls restoreFocus, or returns the
 * focus to its opener (V 7.4 row F): to the element that had the focus when it opened (the manuscript,
 * when a menu command opened it), or to the anchor when that was the anchor itself or nothing.
 * layer: 'header' | 'modal'; menu: a .faust-menu without head and body.
 */
export function Popover(props) {
  return props.open === false ? null : e(PopoverFrame, props);
}

function PopoverFrame({ anchorRef, alignRef, title, width, onClose, footer, layer, menu = false, label, restoreFocus,
  closeLabel = 'Sulje', closeTitle, className, avoid, placeKey, children }) {
  const ref = useRef(null);
  // avoid: () => DOMRect-like | null, a box in the page the popover must not lie over (Etsi: the
  // current hit). placeKey: a value that changes when that box does without a scroll or a resize.
  const avoidRef = useRef(avoid);
  avoidRef.current = avoid;
  const placeRef = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const restoreRef = useRef(restoreFocus);
  restoreRef.current = restoreFocus;
  // The opener: what had the focus when the popover first rendered (before it moves focus in)
  const openerRef = useRef(undefined);
  if (openerRef.current === undefined) openerRef.current = (typeof document !== 'undefined' && document.activeElement) || null;
  const close = () => { if (onCloseRef.current) onCloseRef.current(); };

  // Placement
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const place = () => {
      const anchor = anchorRef && anchorRef.current;
      const rect = anchor ? anchor.getBoundingClientRect() : null;
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        el.setAttribute('data-anchor', 'none');
        el.style.removeProperty('top');
        el.style.removeProperty('left');
        el.style.removeProperty('--popover-max-h');
        return;
      }
      el.removeAttribute('data-anchor');
      const gap = 4;
      const margin = 16;
      const below = window.innerHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      const upwards = below < 160 && above > below;
      el.style.setProperty('--popover-max-h', Math.max(0, upwards ? above : below) + 'px');
      const width = el.offsetWidth;
      let left = rect.left;
      if (left + width > window.innerWidth - margin) left = Math.max(margin, rect.right - width);
      // alignRef: a box whose right edge the popover keeps (Etsi stands at the editor pane's right
      // edge, so it lies over the end of the text column, not over its middle where the hits are)
      const edge = alignRef && alignRef.current;
      const edgeRect = edge ? edge.getBoundingClientRect() : null;
      if (edgeRect && edgeRect.width > 0) left = Math.max(margin, Math.min(window.innerWidth - margin, edgeRect.right - margin) - width);
      el.style.left = left + 'px';
      let top = upwards ? rect.top - gap - el.offsetHeight : rect.bottom + gap;
      // The box to keep clear (the current search hit, when the text cannot scroll it from under the
      // popover: the first lines of a chapter): the popover goes 16px under it for as long as it
      // would cover it, and back to its own place with the next hit
      const box = typeof avoidRef.current === 'function' ? avoidRef.current() : null;
      if (box) {
        const height = el.offsetHeight;
        const covers = box.left < left + width && box.right > left && box.top < top + height && box.bottom > top;
        const under = box.bottom + margin;
        const room = window.innerHeight - margin - under;
        if (covers && room >= Math.min(height, 240)) {
          top = under;
          el.style.setProperty('--popover-max-h', Math.max(0, room) + 'px');
        }
      }
      el.style.top = top + 'px';
    };
    placeRef.current = place;
    // The anchor moves without a window resize when a panel opens or closes beside it, or when a
    // container rule changes its bar: the popover also follows the anchor and every box around it.
    // The ref may give another anchor later (a "more" button while the own button is hidden); the
    // boxes watched follow it a frame later, outside the observer's own callback.
    let watched;
    let frame = 0;
    const anchorNow = () => (anchorRef && anchorRef.current) || null;
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
        place();
        if (anchorNow() !== watched && !frame) frame = requestAnimationFrame(() => { frame = 0; watch(); });
      })
      : null;
    const watch = () => {
      if (!observer) return;
      watched = anchorNow();
      observer.disconnect();
      observer.observe(el);
      for (let node = watched; node && node !== document.body; node = node.parentElement) observer.observe(node);
    };
    watch();
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      cancelAnimationFrame(frame);
      if (observer) observer.disconnect();
      placeRef.current = null;
    };
  }, []);

  // The avoided box changed in place (another hit on a page that did not scroll)
  useLayoutEffect(() => {
    if (placeRef.current) placeRef.current();
  }, [placeKey]);

  // Esc: inside a dialog through the layer stack; elsewhere in the bubble phase on document, so
  // that a dialog, the focused element and the editor's own keys come first
  useEffect(() => {
    if (layer === 'modal') {
      const token = layerStack.push(close);
      return () => layerStack.remove(token);
    }
    const onKeyDown = (ev) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented || !onCloseRef.current) return;
      ev.stopPropagation();
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [layer]);

  // A press outside the popover and its anchor closes it. A press inside a layer above it does not:
  // every dialog stands above a popover of the page or the header, and a question (--top scrim)
  // above a popover inside a dialog.
  useEffect(() => {
    const onPointerDown = (ev) => {
      const el = ref.current;
      const anchor = anchorRef && anchorRef.current;
      if ((el && el.contains(ev.target)) || (anchor && anchor.contains(ev.target))) return;
      const above = ev.target && ev.target.closest
        ? ev.target.closest(layer === 'modal' ? '.faust-scrim--top' : '.faust-scrim')
        : null;
      if (above) return;
      close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  // Focus in (keyboard only) and back
  useEffect(() => {
    const el = ref.current;
    const anchor = anchorRef && anchorRef.current;
    // A field first, then the first control of the body or the menu, then the popover itself
    if (!lastInputWasPointer && el) {
      const content = el.querySelector('.faust-popover__body') || el;
      (el.querySelector(FIELDS) || content.querySelector(FOCUSABLE) || el).focus();
    }
    return () => {
      const active = document.activeElement;
      const wasInside = !active || active === document.body || (el && el.contains(active));
      if (!wasInside) return;
      if (restoreRef.current) { restoreRef.current(); return; }
      // A menu command opens the popover with the focus in the text: Esc gives it back there, so typing
      // goes on; opened from its button (or with nothing focused), the focus returns to the button
      const opener = openerRef.current;
      const openerElsewhere = opener && opener !== document.body && opener.focus && document.contains(opener) &&
        !(anchor && anchor.contains(opener)) && !(el && el.contains(opener));
      if (openerElsewhere) opener.focus();
      else if (anchor && anchor.focus && document.contains(anchor)) anchor.focus();
    };
  }, []);

  return inLayer(e('div', {
    ref,
    role: menu ? 'menu' : 'dialog',
    'aria-labelledby': title ? titleId : undefined,
    'aria-label': title ? undefined : label,
    tabIndex: -1,
    className: cx('faust-popover', menu && 'faust-menu', layer === 'header' && 'faust-popover--header', layer === 'modal' && 'faust-popover--modal', className),
    style: width ? { '--popover-w': typeof width === 'number' ? width + 'px' : width } : undefined
  },
    title && e('div', { className: 'faust-popover__head' },
      e('span', { id: titleId, className: 'faust-popover__title' }, title),
      onClose && e('button', {
        type: 'button',
        className: 'faust-btn faust-btn--icon faust-btn--sm',
        'aria-label': closeLabel,
        title: closeTitle || closeLabel + ' (Esc)',
        onClick: close
      }, icons.close({ size: 14 }))
    ),
    menu ? children : e('div', { className: 'faust-popover__body' }, children),
    footer && e('div', { className: 'faust-popover__foot' }, footer)
  ));
}

/**
 * The custom tooltip, for the four sigil tiles only (everything else keeps the native title).
 * text first, then the title as a second line (the Latin name), then kbd. It listens on a
 * wrapping span, so it also works on a disabled control; shown after 500 ms, at once on keyboard
 * focus; gone on pointer out, blur and Esc, and whenever neither the pointer nor the focus is on
 * its control any more or the control has no box. off hides it (the control's own popover is open
 * where it would stand). Rendered in the layer host, 6px from its anchor.
 */
export function Tooltip({ title, text, kbd, off = false, children }) {
  const [shown, setShown] = useState(false);
  const wrapRef = useRef(null);
  const tipRef = useRef(null);
  const timer = useRef(0);
  const id = useId();

  const show = (now) => {
    clearTimeout(timer.current);
    if (now) setShown(true);
    else timer.current = setTimeout(() => setShown(true), 500);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setShown(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // A control that turns disabled under the pointer or the focus (a sigil tile starting its run) gets
  // no pointerleave or blur: Chromium moves the focus to the body silently. A control hidden by a
  // parent (focus mode) gets nothing at all. So while shown, every render, pointer move, press and
  // focus change asks again whether the pointer or the focus is still on the control.
  const stale = () => {
    const wrap = wrapRef.current;
    if (off || !wrap || !wrap.isConnected) return true;
    const rect = wrap.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return true;
    return !wrap.matches(':hover') && !wrap.contains(document.activeElement);
  };
  useLayoutEffect(() => {
    if (shown && stale()) hide();
  });
  useEffect(() => {
    if (!shown) return undefined;
    const check = () => { if (stale()) hide(); };
    document.addEventListener('pointermove', check, true);
    document.addEventListener('pointerdown', check, true);
    document.addEventListener('focusin', check, true);
    return () => {
      document.removeEventListener('pointermove', check, true);
      document.removeEventListener('pointerdown', check, true);
      document.removeEventListener('focusin', check, true);
    };
  }, [shown, off]);

  useLayoutEffect(() => {
    if (!shown) return;
    const wrap = wrapRef.current;
    const tip = tipRef.current;
    if (!wrap || !tip) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { setShown(false); return; }
    const gap = 6;
    const margin = 8;
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    let top = rect.bottom + gap;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - gap - height);
    const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - margin);
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
  }, [shown, text, title, kbd]);

  const visible = shown && !off;
  const child = isValidElement(children) && visible
    ? cloneElement(children, { 'aria-describedby': id })
    : children;

  return e('span', {
    ref: wrapRef,
    style: { display: 'inline-flex' },
    onPointerEnter: () => show(false),
    onPointerLeave: hide,
    // At once on keyboard focus only (V 4.9): a press, or the focus a closing popover gives back
    // after a press, waits for the pointer like a hover
    onFocus: () => { if (!lastInputWasPointer) show(true); },
    onBlur: hide,
    // Esc on a shown tooltip only hides it: the key is used here and goes to nothing else (the app's
    // Esc chain skips a used key), so it never also closes a panel or the keskustelu
    onKeyDown: (ev) => {
      if (ev.key !== 'Escape' || !visible) return;
      ev.preventDefault();
      ev.stopPropagation();
      hide();
    }
  },
    child,
    visible && (text || title || kbd) && inLayer(e('div', { ref: tipRef, id, role: 'tooltip', className: 'faust-tooltip' },
      text,
      title && e('span', { className: 'faust-tooltip__title' }, title),
      kbd && e('span', { className: 'faust-tooltip__kbd' }, kbd)
    ))
  );
}

if (typeof window !== 'undefined') {
  window.FaustUI = Object.assign(window.FaustUI || {}, {
    notify, ToastHost,
    Button, IconButton, SigilButton, Field, Tabs, Segmented, Chip, Row, Section, Progress, Spinner,
    EmptyState, Callout, Rating, VoiceButton, DiffView, coalesceDiff,
    layerStack, holdLayer, returnFocus, scrimPress, Dialog, Popover, usePopover, Tooltip
  });
}

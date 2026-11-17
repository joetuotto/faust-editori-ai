/**
 * src/components/ui.js - FAUST's shared components, drawn with the classes of
 * styles/faust-components.css. Everything here is also on window.FaustUI for the script-tag
 * components (AnnotationMargin, the Modals, ClaudeChat), which read it at render or call time.
 *
 * Part 1, notifications: the replacement for the native alert box.
 *   notify(kind, text, { detail, action, duration })   kind: 'success' | 'info' | 'warning' | 'error' | 'busy'
 *     returns { update(patch), close() }; action is { label, onClick }
 *   ToastHost                                          mounted once at the root, next to the shared dialogs
 *   installAlertShim()                                 window.alert -> notify, so the 71 legacy calls stop
 *                                                      producing native boxes on the first day
 * A native alert stays until it is dismissed, and some legacy alerts carry the only copy of a
 * result (a score with suggestions, a synopsis, comparison numbers). So: a shimmed message with
 * more than one line stays until closed, whatever its kind; its kind is read from its first line
 * only; and a notification that stays until closed is never pushed out by a newer one.
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

// Interim classifier for messages that still arrive through the alert shim: order matters
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
  push(onEscape) {
    if (!layerKeysOn && typeof window !== 'undefined') {
      window.addEventListener('keydown', onLayerKeyDown, true);
      layerKeysOn = true;
    }
    const token = ++layerSeq;
    layers.push({ token, onEscape });
    emitLayers();
    return token;
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
 * focus moved in (data-autofocus, else the first field, else the panel) and returned on close,
 * Tab kept inside, the background inert, stacked by the order of opening. A press on the scrim
 * closes it only with dismissOnScrim (views, never forms). No Enter handler and no "discard
 * changes?" question of its own. bodyMode: 'flush' | 'fixed'. Render it only while it is open,
 * or pass open.
 */
export function Dialog(props) {
  return props.open === false ? null : e(DialogFrame, props);
}

function DialogFrame({ title, sub, icon, size = 'md', width, actions, bodyMode, onClose, dismissOnScrim = false,
  footer, footerStart, busy = false, closeTitle = 'Sulje (Esc)', className, children }) {
  const scrimRef = useRef(null);
  const panelRef = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Its place in the layer stack: how many layers are open under it. Before the layout effect
  // has pushed it, it is the newest, so the top.
  const [below, setBelow] = useState(() => layerStack.size());

  useLayoutEffect(() => {
    const token = layerStack.push(() => { if (onCloseRef.current) onCloseRef.current(); });
    const follow = () => setBelow(Math.max(0, layerStack.place(token)));
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
    const target = panel && (panel.querySelector('[data-autofocus]') || panel.querySelector(FIELDS) || panel);
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
    className: cx('faust-scrim', below > 0 && 'is-stacked'),
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
 * button. Opened by the keyboard it takes the focus; on closing it returns the focus to the anchor,
 * or calls restoreFocus. layer: 'header' | 'modal'; menu: a .faust-menu without head and body.
 */
export function Popover(props) {
  return props.open === false ? null : e(PopoverFrame, props);
}

function PopoverFrame({ anchorRef, title, width, onClose, footer, layer, menu = false, label, restoreFocus,
  closeLabel = 'Sulje', closeTitle, className, children }) {
  const ref = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const restoreRef = useRef(restoreFocus);
  restoreRef.current = restoreFocus;
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
      el.style.left = left + 'px';
      el.style.top = (upwards ? rect.top - gap - el.offsetHeight : rect.bottom + gap) + 'px';
    };
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
    };
  }, []);

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

  // A press outside the popover and its anchor closes it
  useEffect(() => {
    const onPointerDown = (ev) => {
      const el = ref.current;
      const anchor = anchorRef && anchorRef.current;
      if ((el && el.contains(ev.target)) || (anchor && anchor.contains(ev.target))) return;
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
      if (restoreRef.current) restoreRef.current();
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
    onKeyDown: (ev) => { if (ev.key === 'Escape') hide(); }
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
    notify, inferKind, installAlertShim, ToastHost,
    Button, IconButton, SigilButton, Field, Tabs, Segmented, Chip, Row, Section, Progress, Spinner,
    EmptyState, Callout, Rating, VoiceButton, DiffView, coalesceDiff,
    layerStack, holdLayer, returnFocus, scrimPress, Dialog, Popover, usePopover, Tooltip
  });
}

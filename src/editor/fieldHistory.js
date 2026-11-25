/**
 * Field history: the own undo and redo of the app's text fields
 *
 * Kumoa and Tee uudelleen (Cmd+Z, ⇧⌘Z) come from the menu and reach
 * runHistory in app.js. With the focus in a text field outside the manuscript
 * (a chapter title, the notes, Etsi, the keskustelu field) the field's own
 * steps are undone. The browser's own undo (document.execCommand) is one stack
 * for the whole window: past the field's steps it went on into the
 * manuscript's editing steps and changed the text out of sight. So every field
 * keeps its steps here, and a field with none left does nothing at all.
 *
 * - A step is a run of typing (a word with the space after it, or what came
 *   before a pause of MERGE_MS), a run of deleting, or one paste, cut, drop or
 *   line break.
 * - The fields are React-controlled: a value is set through the native value
 *   setter and an `input` event, so React's onChange takes it as typed.
 * - A value that changed without the author typing in the field (the next
 *   chapter's title in the same input, a search term put in by the app)
 *   starts the field's history afresh: an undo never brings back the text the
 *   field showed for something else.
 * - A field that keeps its own history (`field.faustHistory`, the Pikamuokkaus
 *   prompt) and password fields are left alone.
 *
 * Plain DOM; the document is passed in, so it is unit-tested with jsdom
 * (test/editor/fieldHistory.test.js).
 */

const MAX_STEPS = 200;
// Typing or deleting within this many milliseconds of the last key is one step
const MERGE_MS = 1000;
// The input types that hold text; '' is an input without a type attribute
const TEXT_TYPES = new Set(['', 'text', 'search', 'url', 'email', 'tel']);

/** A text field whose history this module keeps: a textarea, or an input that holds text. */
function isTextField(el) {
  if (!el || el.nodeType !== 1 || el.disabled || el.readOnly) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return TEXT_TYPES.has(String(el.type || '').toLowerCase());
}

const tracked = (el) => isTextField(el) && typeof el.faustHistory !== 'function';

// The edits that make a step together with the one before
function kindOf(inputType) {
  if (inputType === 'insertText' || inputType === 'insertCompositionText') return 'type';
  if (inputType === 'deleteContentBackward' || inputType === 'deleteContentForward') return 'delete';
  return 'other';
}

// The value setter of the element's class: React keeps its own on the element itself
function nativeSetter(field) {
  for (let proto = Object.getPrototypeOf(field); proto; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && typeof descriptor.set === 'function') return descriptor.set;
  }
  return null;
}

// Where the caret goes after a step: at the end of what changed, in the value now shown
function changedEnd(before, after) {
  let start = 0;
  const shorter = Math.min(before.length, after.length);
  while (start < shorter && before[start] === after[start]) start += 1;
  let tail = 0;
  while (tail < shorter - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  return after.length - tail;
}

/**
 * @param {{ now?: () => number, maxSteps?: number, mergeMs?: number }} options
 * @returns {{ attach(doc: Document): () => void, step(field: Element, direction: 'undo'|'redo'): boolean,
 *             canStep(field: Element, direction: 'undo'|'redo'): boolean, isTextField: typeof isTextField }}
 */
function createFieldHistory(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const maxSteps = Number.isFinite(options.maxSteps) && options.maxSteps > 0 ? options.maxSteps : MAX_STEPS;
  const mergeMs = Number.isFinite(options.mergeMs) && options.mergeMs >= 0 ? options.mergeMs : MERGE_MS;
  const entries = new WeakMap();    // field → { undo, redo, last, kind, at, word, endsWord, armed }

  const fresh = (value) => ({ undo: [], redo: [], last: value, kind: null, at: 0, word: false, endsWord: false, armed: false });

  // The field's history, started afresh when its value changed without an edit seen here
  function entryOf(field) {
    const value = String(field.value);
    let entry = entries.get(field);
    if (!entry || entry.last !== value) {
      entry = fresh(value);
      entries.set(field, entry);
    }
    return entry;
  }

  // Before an edit of the author's: the value the edit starts from
  function onBeforeInput(event) {
    const field = event.target;
    if (!tracked(field)) return;
    entryOf(field).armed = true;
  }

  function onInput(event) {
    const field = event.target;
    if (!tracked(field)) return;
    const value = String(field.value);
    const entry = entries.get(field);
    // A step of this module's own, or nothing changed
    if (entry && entry.last === value) return;
    // An input event with no edit before it (a script set the value): nothing to go back to
    if (!entry || !entry.armed) {
      entries.set(field, fresh(value));
      return;
    }

    const kind = kindOf(event.inputType);
    const at = now();
    const joins = kind !== 'other' && kind === entry.kind && at - entry.at <= mergeMs && !entry.endsWord && entry.undo.length > 0;
    if (!joins) {
      entry.undo.push(entry.last);
      if (entry.undo.length > maxSteps) entry.undo.shift();
      entry.word = false;
    }
    // A space ends the step once the step has a word: " ja avain" is undone as "avain", then " ja"
    const data = String(event.data || '');
    entry.word = entry.word || /\S/.test(data);
    entry.redo = [];
    entry.last = value;
    entry.kind = kind;
    entry.at = at;
    entry.endsWord = kind === 'type' && entry.word && /\s$/.test(data);
    entry.armed = false;
  }

  function canStep(field, direction) {
    if (!tracked(field)) return false;
    const entry = entryOf(field);
    return (direction === 'redo' ? entry.redo : entry.undo).length > 0;
  }

  /**
   * Undo or redo one step of the field. False when it has nothing of its own to
   * undo or redo: then nothing happens, nothing reaches the manuscript.
   */
  function step(field, direction) {
    if (!tracked(field)) return false;
    const entry = entryOf(field);
    const from = direction === 'redo' ? entry.redo : entry.undo;
    const to = direction === 'redo' ? entry.undo : entry.redo;
    if (!from.length) return false;

    const before = String(field.value);
    const value = from.pop();
    to.push(before);
    entry.last = value;
    entry.kind = null;
    entry.armed = false;

    const setter = nativeSetter(field);
    if (setter) setter.call(field, value);
    else field.value = value;
    // The event of the field's own window, as React listens for it
    const view = field.ownerDocument && field.ownerDocument.defaultView;
    const EventOfView = view && typeof view.Event === 'function' ? view.Event : Event;
    field.dispatchEvent(new EventOfView('input', { bubbles: true }));

    const caret = changedEnd(before, value);
    try {
      field.setSelectionRange(caret, caret);
    } catch (error) {
      // An email field has no selection API; the value is set all the same
    }
    return true;
  }

  function attach(doc) {
    doc.addEventListener('beforeinput', onBeforeInput, true);
    doc.addEventListener('input', onInput, true);
    return () => {
      doc.removeEventListener('beforeinput', onBeforeInput, true);
      doc.removeEventListener('input', onInput, true);
    };
  }

  return { attach, step, canStep, isTextField };
}

const perDocument = new WeakMap();

/** The one field history of a document, listening from the first call on (app.js calls it on every render). */
function fieldHistoryFor(doc, options) {
  let history = perDocument.get(doc);
  if (!history) {
    history = createFieldHistory(options);
    history.attach(doc);
    perDocument.set(doc, history);
  }
  return history;
}

module.exports = { createFieldHistory, fieldHistoryFor, isTextField, MAX_STEPS, MERGE_MS };

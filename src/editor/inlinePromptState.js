/**
 * State of the inline prompt (Cmd+K)
 *
 * What the prompt shows, as one plain object and a reducer. Pure functions, no
 * imports: the view draws this state, the controller changes it with events.
 *
 * PromptState = {
 *   mode: 'edit' | 'write',
 *   kind: 'selection' | 'paragraph' | 'cursor',
 *   projectType: 'fiction' | 'nonfiction',
 *   phase: 'idle' | 'sending' | 'result' | 'error' | 'blocked',
 *   instruction: string,     // what the author typed for the last request (returns to the field)
 *   title: string,           // what the "Ohje:" line shows while sending (action label or instruction)
 *   draft: string,           // text the field gets when a phase is entered
 *   waiting: boolean,        // sending, no text yet
 *   preview: string,
 *   attempts: Array<{ id, title, modelName, changeCount: number | null, note: string | null }>,
 *   index: number,           // -1 when there is no attempt
 *   error: { code, message, detail } | null,
 *   blocked: { code, message } | null,
 *   note: string | null,
 *   model: { id, name } | null,
 *   models: Array<{ id, name }> | null,   // null = not loaded, [] = type the id
 *   otherModel: string | null,
 *   pickerOpen: boolean,
 *   actions: Array<{ id, label, builtin }>,
 *   length: 'sentence' | 'paragraph' | 'long',
 *   canEditParagraph: boolean,            // write mode: the cursor line is a paragraph
 *   sendBlocked: string | null            // why nothing can be sent (the request does not fit the model)
 * }
 */

const MAX_ATTEMPTS = 12;
const PHASES = ['idle', 'sending', 'result', 'error', 'blocked'];
const LENGTHS = ['sentence', 'paragraph', 'long'];

const clampIndex = (index, count) => {
  if (count === 0) return -1;
  const value = Number.isFinite(index) ? Math.trunc(index) : count - 1;
  return Math.max(0, Math.min(count - 1, value));
};

const text = (value) => (typeof value === 'string' ? value : '');

/** A full state from the fields given; everything else gets its default. */
function createState(init = {}) {
  const given = init || {};
  const attempts = Array.isArray(given.attempts) ? given.attempts.slice(-MAX_ATTEMPTS) : [];
  const hasAttempts = attempts.length > 0;

  let phase = PHASES.includes(given.phase) ? given.phase : 'idle';
  if (hasAttempts) phase = 'result';

  return {
    mode: given.mode === 'write' ? 'write' : 'edit',
    kind: ['selection', 'paragraph', 'cursor'].includes(given.kind) ? given.kind : 'selection',
    projectType: given.projectType === 'nonfiction' ? 'nonfiction' : 'fiction',
    phase,
    instruction: text(given.instruction),
    title: text(given.title),
    draft: text(given.draft),
    waiting: given.waiting === true,
    preview: text(given.preview),
    attempts,
    index: hasAttempts ? clampIndex(given.index, attempts.length) : -1,
    error: given.error || null,
    blocked: given.blocked || null,
    note: given.note || null,
    model: given.model || null,
    models: Array.isArray(given.models) ? given.models : null,
    otherModel: typeof given.otherModel === 'string' ? given.otherModel : null,
    pickerOpen: given.pickerOpen === true,
    actions: Array.isArray(given.actions) ? given.actions : [],
    length: LENGTHS.includes(given.length) ? given.length : 'paragraph',
    canEditParagraph: given.canEditParagraph === true,
    sendBlocked: typeof given.sendBlocked === 'string' && given.sendBlocked !== '' ? given.sendBlocked : null
  };
}

/** The next state for an event. Returns a new object; an unknown event returns the state as it is. */
function reduce(state, event) {
  if (!event || typeof event.type !== 'string') return state;

  switch (event.type) {
    case 'send': {
      const instruction = typeof event.instruction === 'string' ? event.instruction : state.instruction;
      return {
        ...state,
        phase: 'sending',
        waiting: true,
        preview: '',
        error: null,
        note: null,
        pickerOpen: false,
        instruction,
        title: typeof event.title === 'string' ? event.title : instruction
      };
    }

    case 'delta':
      if (state.phase !== 'sending') return state;
      return { ...state, waiting: false, preview: text(event.preview) };

    case 'result': {
      // The oldest attempt makes room for the thirteenth
      const attempts = state.attempts.concat([event.attempt]).slice(-MAX_ATTEMPTS);
      return { ...state, attempts, index: attempts.length - 1, phase: 'result', draft: '', waiting: false };
    }

    case 'attempt': {
      if (!state.attempts[event.index]) return state;
      const attempts = state.attempts.map((attempt, index) => (
        index === event.index
          ? { ...attempt, changeCount: event.changeCount, note: event.note == null ? null : event.note }
          : attempt
      ));
      return { ...state, attempts };
    }

    case 'fail':
      return { ...state, phase: 'error', error: event.error || null, draft: state.instruction, waiting: false };

    case 'cancelled':
      return {
        ...state,
        phase: state.attempts.length > 0 ? 'result' : 'idle',
        draft: state.instruction,
        note: 'Pyyntö pysäytettiin.',
        waiting: false,
        preview: ''
      };

    case 'select':
      if (state.phase !== 'result') return state;
      return { ...state, index: clampIndex(event.index, state.attempts.length) };

    case 'show':
      // An earlier attempt is put on screen again, also after a failed try
      if (state.attempts.length === 0) return state;
      return { ...state, phase: 'result', index: clampIndex(event.index, state.attempts.length), error: null, waiting: false };

    case 'block':
      return { ...state, phase: 'blocked', blocked: { code: text(event.code), message: text(event.message) }, waiting: false };

    case 'picker':
      return { ...state, pickerOpen: event.open === true };

    case 'models':
      return {
        ...state,
        models: Array.isArray(event.models) ? event.models : null,
        otherModel: typeof event.otherModel === 'string' ? event.otherModel : null
      };

    case 'actions':
      return { ...state, actions: Array.isArray(event.actions) ? event.actions : [] };

    case 'length':
      return LENGTHS.includes(event.length) ? { ...state, length: event.length } : state;

    case 'note':
      return { ...state, note: event.note || null };

    case 'send-blocked': {
      const reason = typeof event.reason === 'string' && event.reason !== '' ? event.reason : null;
      return reason === state.sendBlocked ? state : { ...state, sendBlocked: reason };
    }

    default:
      return state;
  }
}

/** Position among the attempts, for example "2/3" for index 1 of three. */
function attemptLabel(index, total) {
  return `${index + 1}/${total}`;
}

/** The size of an attempt in words the author reads: Ei muutoksia, 1 muutos, 7 muutosta. */
function changeCountLabel(count) {
  if (count == null) return '';
  if (count === 0) return 'Ei muutoksia';
  if (count === 1) return '1 muutos';
  return `${count} muutosta`;
}

module.exports = { createState, reduce, attemptLabel, changeCountLabel };

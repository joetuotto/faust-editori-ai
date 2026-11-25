/**
 * @jest-environment jsdom
 */
// The own undo and redo of the app's text fields (final pass, T-049): Cmd+Z in a chapter title, the notes
// or Etsi undoes the field step by step and never reaches the manuscript.
const { createFieldHistory, fieldHistoryFor, isTextField, MERGE_MS } = require('../../src/editor/fieldHistory');

let clock = 0;
let history = null;
let detach = null;

beforeEach(() => {
  document.body.innerHTML = '';
  clock = 1000;
  history = createFieldHistory({ now: () => clock });
  detach = history.attach(document);
});

afterEach(() => {
  detach();
});

const field = (html = '<input type="text">') => {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const el = holder.firstElementChild;
  document.body.appendChild(el);
  el.focus();
  return el;
};

// One edit as the browser makes it: beforeinput, the new value, input
function edit(el, inputType, next, data = null) {
  el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType, data }));
  el.value = next;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data }));
}
const type = (el, text, gap = 50) => {
  for (const ch of text) {
    clock += gap;
    edit(el, 'insertText', el.value + ch, ch);
  }
};
const backspace = (el, times = 1) => {
  for (let i = 0; i < times; i += 1) {
    clock += 50;
    edit(el, 'deleteContentBackward', el.value.slice(0, -1));
  }
};
const paste = (el, text) => { clock += 50; edit(el, 'insertFromPaste', el.value + text, text); };

describe('field history', () => {
  test('typing is undone a word at a time, redone, and a new edit clears the redo', () => {
    const title = field();
    type(title, 'Saapuminen kylään');
    expect(history.step(title, 'undo')).toBe(true);
    expect(title.value).toBe('Saapuminen ');
    expect(history.step(title, 'undo')).toBe(true);
    expect(title.value).toBe('');
    // Nothing of its own left: nothing happens
    expect(history.step(title, 'undo')).toBe(false);
    expect(title.value).toBe('');

    expect(history.step(title, 'redo')).toBe(true);
    expect(title.value).toBe('Saapuminen ');
    expect(history.step(title, 'redo')).toBe(true);
    expect(title.value).toBe('Saapuminen kylään');
    expect(history.step(title, 'redo')).toBe(false);

    history.step(title, 'undo');
    type(title, 'taloon');
    expect(title.value).toBe('Saapuminen taloon');
    expect(history.canStep(title, 'redo')).toBe(false);
    history.step(title, 'undo');
    expect(title.value).toBe('Saapuminen ');
  });

  test('a space typed first belongs to the word after it', () => {
    const title = field();
    title.value = 'Asianajajan luona';
    type(title, ' ja avain');
    expect(history.step(title, 'undo')).toBe(true);
    expect(title.value).toBe('Asianajajan luona ja ');
    expect(history.step(title, 'undo')).toBe(true);
    expect(title.value).toBe('Asianajajan luona');
    expect(history.step(title, 'undo')).toBe(false);
  });

  test('a pause, a deletion and a paste each start a step of their own', () => {
    const notes = field('<textarea></textarea>');
    type(notes, 'Sade');
    clock += MERGE_MS + 1;
    type(notes, 'tta');
    backspace(notes, 2);
    paste(notes, ' jatkui.');
    expect(notes.value).toBe('Sadet jatkui.');

    const back = [];
    while (history.step(notes, 'undo')) back.push(notes.value);
    expect(back).toEqual(['Sadet', 'Sadetta', 'Sade', '']);
  });

  test('a value the app put in the field without an edit starts its history afresh (the next chapter\'s title)', () => {
    const title = field();
    type(title, 'Luku yksi');
    // The same input now shows another chapter's title: React set it, no edit was seen
    title.value = 'Toinen luku';
    expect(history.step(title, 'undo')).toBe(false);
    expect(title.value).toBe('Toinen luku');

    // Also when the author types first: the first chapter's title never comes back here
    title.value = 'Kolmas';
    type(title, ' luku');
    while (history.step(title, 'undo'));
    expect(title.value).toBe('Kolmas');
  });

  test('an input event without an edit before it is not a step', () => {
    const search = field('<input type="search">');
    type(search, 'sade');
    search.value = 'sumu';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(history.step(search, 'undo')).toBe(false);
    expect(search.value).toBe('sumu');
  });

  test('a step never calls the browser\'s window-wide undo, so the manuscript is never reached', () => {
    const exec = jest.fn();
    document.execCommand = exec;
    const search = field('<input type="search">');
    type(search, 'sade');
    expect(history.step(search, 'undo')).toBe(true);
    expect(history.step(search, 'undo')).toBe(false);
    expect(history.step(search, 'redo')).toBe(true);
    expect(exec).not.toHaveBeenCalled();
    delete document.execCommand;
  });

  test('a React-controlled field gets the value through the native setter and an input event; the caret ends the change', () => {
    const title = field();
    type(title, 'Aamu ja ilta');
    // React keeps a setter of its own on the element: it must not see the value before onChange runs
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    let reactKnows = title.value;
    Object.defineProperty(title, 'value', {
      configurable: true,
      get() { return proto.get.call(this); },
      set(next) { reactKnows = next; proto.set.call(this, next); }
    });
    const seen = [];
    title.addEventListener('input', () => seen.push([title.value, reactKnows]));

    title.setSelectionRange(0, 0);
    expect(history.step(title, 'undo')).toBe(true);
    expect(seen).toEqual([['Aamu ja ', 'Aamu ja ilta']]);
    expect(title.selectionStart).toBe(8);
    // The event of the step is no edit of the author's: the history is unchanged by it
    expect(history.canStep(title, 'redo')).toBe(true);
    expect(history.step(title, 'undo')).toBe(true);
    expect(title.value).toBe('Aamu ');
  });

  test('isTextField: text fields only; password, checkbox, read-only and disabled fields are not', () => {
    expect(isTextField(field('<textarea></textarea>'))).toBe(true);
    expect(isTextField(field('<input>'))).toBe(true);
    expect(isTextField(field('<input type="search">'))).toBe(true);
    expect(isTextField(field('<input type="password">'))).toBe(false);
    expect(isTextField(field('<input type="checkbox">'))).toBe(false);
    expect(isTextField(field('<input type="number">'))).toBe(false);
    expect(isTextField(field('<input readonly>'))).toBe(false);
    expect(isTextField(field('<textarea disabled></textarea>'))).toBe(false);
    expect(isTextField(field('<div contenteditable="true"></div>'))).toBe(false);
    expect(isTextField(null)).toBe(false);
  });

  test('a password field and a field with its own history (the Pikamuokkaus prompt) are left alone', () => {
    const key = field('<input type="password">');
    type(key, 'salainen');
    expect(history.step(key, 'undo')).toBe(false);
    expect(key.value).toBe('salainen');

    const prompt = field('<textarea></textarea>');
    prompt.faustHistory = jest.fn(() => true);
    type(prompt, 'lyhyemmin');
    expect(history.step(prompt, 'undo')).toBe(false);
    expect(prompt.value).toBe('lyhyemmin');
  });

  test('the history keeps at most maxSteps steps', () => {
    const own = createFieldHistory({ now: () => clock, maxSteps: 3 });
    const off = own.attach(document);
    try {
      const title = field();
      for (const word of ['a ', 'b ', 'c ', 'd ', 'e ']) type(title, word);
      const back = [];
      while (own.step(title, 'undo')) back.push(title.value);
      expect(back).toEqual(['a b c d ', 'a b c ', 'a b ']);
    } finally {
      off();
    }
  });

  test('fieldHistoryFor gives one history per document, listening once', () => {
    detach();
    const first = fieldHistoryFor(document);
    expect(fieldHistoryFor(document)).toBe(first);
    const title = field();
    type(title, 'Yö ');
    type(title, 'tuli');
    expect(first.step(title, 'undo')).toBe(true);
    expect(title.value).toBe('Yö ');
    expect(first.step(title, 'undo')).toBe(true);
    expect(title.value).toBe('');
    detach = () => {};
  });
});

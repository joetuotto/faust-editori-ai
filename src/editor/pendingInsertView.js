/**
 * The DOM of the insert block (write at cursor)
 *
 * The block is a draft from the model that is shown between the lines and is
 * not manuscript text until the author accepts it. This file only draws it
 * and reports clicks as intents; the block itself lives in suggestionModel.js
 * and the widget that mounts this DOM in suggestionsCore.js. Plain DOM, the
 * document is passed in, so it is unit-tested with jsdom
 * (test/editor/pendingInsertView.test.js).
 *
 * BlockView = { status: 'streaming' | 'done' | 'stopped' | 'error', text, note,
 *               modelName, attempt (0-based), attemptCount }
 * Intents: block-stop, block-accept, block-retry, block-reject, block-show { index }
 */

const TEXT = {
  label: 'Tekoälyn luonnos',
  head: 'Tekoälyn luonnos · ei vielä käsikirjoituksessa',
  waiting: 'Odotetaan mallia…',
  empty: 'Ei tekstiä.',
  stop: 'Pysäytä',
  accept: 'Hyväksy',
  retry: 'Uusi yritys',
  reject: 'Hylkää',
  previous: 'Edellinen yritys',
  next: 'Seuraava yritys',
  // The accept key by platform: Cmd+Enter on macOS, Ctrl+Enter elsewhere
  hint: (doc) => (isMac(doc) ? '⌘↩ hyväksyy' : 'Ctrl+Enter hyväksyy')
};

// The same test as termHighlightCore.js: the platform is asked from the window
// of the document the block is drawn in, so this file needs no global
function isMac(doc) {
  const ownerWindow = doc ? doc.defaultView : null;
  const platform = ownerWindow && ownerWindow.navigator ? ownerWindow.navigator.platform : '';
  return /Mac|iPhone|iPad|iPod/.test(platform || '');
}

/**
 * @param {Document} doc
 * @param {{ onIntent: (intent: object) => void }} options
 * @returns {{ dom: HTMLElement, render(view: object): void, destroy(): void }}
 */
function createBlockView(doc, options = {}) {
  const send = (intent) => { if (typeof options.onIntent === 'function') options.onIntent(intent); };

  const element = (tag, role, className) => {
    const node = doc.createElement(tag);
    if (role) node.setAttribute('data-role', role);
    if (className) node.className = className;
    return node;
  };

  const root = element('div', null, 'cm-faust-block');
  root.setAttribute('spellcheck', 'false');
  root.setAttribute('aria-label', TEXT.label);

  const head = element('div', 'block-head', 'cm-faust-block-head');
  const text = element('div', 'block-text', 'cm-faust-block-text');
  text.style.whiteSpace = 'pre-wrap';
  const note = element('div', 'block-note', 'cm-faust-block-note');
  const bar = element('div', 'block-bar', 'cm-faust-block-bar');
  root.appendChild(head);
  root.appendChild(text);
  root.appendChild(bar);

  let shown = { status: null, attempt: 0, attemptCount: 1 };
  let controls = null;    // the elements of the bar for the status on screen

  const button = (role, label, onClick, ariaLabel) => {
    const node = element('button', role, 'cm-faust-block-button');
    node.setAttribute('type', 'button');
    node.textContent = label;
    if (ariaLabel) node.setAttribute('aria-label', ariaLabel);
    // The editor keeps the focus, so its keys go on working after a click
    node.addEventListener('mousedown', (event) => event.preventDefault());
    node.addEventListener('click', () => { if (!node.disabled) onClick(); });
    return node;
  };

  function buildControls(status) {
    while (bar.firstChild) bar.removeChild(bar.firstChild);
    const made = { switcher: null };

    if (status === 'streaming') {
      bar.appendChild(button('block-stop', TEXT.stop, () => send({ type: 'block-stop' })));
      return made;
    }

    if (status !== 'error') bar.appendChild(button('block-accept', TEXT.accept, () => send({ type: 'block-accept' })));
    bar.appendChild(button('block-retry', TEXT.retry, () => send({ type: 'block-retry' })));
    bar.appendChild(button('block-reject', TEXT.reject, () => send({ type: 'block-reject' })));

    // A failed attempt offers only Uusi yritys and Hylkää (contracts 8.6)
    if (status === 'error') return made;

    // Earlier attempts stay reachable. Created once per status; attached only
    // while there is more than one attempt.
    made.switcher = {
      attached: false,
      previous: button('block-prev', '‹', () => send({ type: 'block-show', index: shown.attempt - 1 }), TEXT.previous),
      label: element('span', 'block-label', 'cm-faust-block-label'),
      next: button('block-next', '›', () => send({ type: 'block-show', index: shown.attempt + 1 }), TEXT.next)
    };

    made.hint = element('span', 'block-hint', 'cm-faust-block-hint');
    made.hint.textContent = TEXT.hint(doc);
    bar.appendChild(made.hint);
    return made;
  }

  function updateSwitcher(switcher) {
    if (!switcher) return;
    const wanted = shown.attemptCount > 1;
    if (wanted && !switcher.attached) {
      const before = controls.hint || null;
      bar.insertBefore(switcher.previous, before);
      bar.insertBefore(switcher.label, before);
      bar.insertBefore(switcher.next, before);
    } else if (!wanted && switcher.attached) {
      bar.removeChild(switcher.previous);
      bar.removeChild(switcher.label);
      bar.removeChild(switcher.next);
    }
    switcher.attached = wanted;
    switcher.label.textContent = `${shown.attempt + 1}/${shown.attemptCount}`;
    switcher.previous.disabled = shown.attempt <= 0;
    switcher.next.disabled = shown.attempt >= shown.attemptCount - 1;
  }

  function render(view) {
    const next = view || {};
    const status = ['streaming', 'done', 'stopped', 'error'].includes(next.status) ? next.status : 'error';
    const body = typeof next.text === 'string' ? next.text : '';
    const attemptCount = Math.max(1, next.attemptCount | 0);
    const attempt = Math.max(0, Math.min(attemptCount - 1, next.attempt | 0));

    const headText = TEXT.head + (next.modelName ? ` · ${next.modelName}` : '');
    if (head.textContent !== headText) head.textContent = headText;

    // The text node changes in place, so the buttons keep their state while text streams in
    let shownText = body;
    let placeholder = false;
    if (status === 'streaming' && body === '') { shownText = TEXT.waiting; placeholder = true; }
    // A failed attempt is not offered for insertion, whatever text it got (contracts 8.6)
    if (status === 'error') { shownText = TEXT.empty; placeholder = true; }
    if (text.textContent !== shownText) text.textContent = shownText;
    if (placeholder) text.setAttribute('data-placeholder', 'true');
    else text.removeAttribute('data-placeholder');

    if (next.note) {
      if (note.textContent !== next.note) note.textContent = next.note;
      if (note.parentNode !== root) root.insertBefore(note, bar);
    } else if (note.parentNode === root) {
      root.removeChild(note);
    }

    const sameStatus = shown.status === status;
    shown = { status, attempt, attemptCount };
    root.setAttribute('data-status', status);
    if (!sameStatus) controls = buildControls(status);
    updateSwitcher(controls.switcher);
  }

  // What happens inside the block stays there: the host's own mouse and key
  // handlers (selection tracking, shortcuts) must not react to it
  const contain = (event) => event.stopPropagation();
  const CONTAINED = ['mouseup', 'keyup', 'click'];
  CONTAINED.forEach(type => root.addEventListener(type, contain));

  function destroy() {
    CONTAINED.forEach(type => root.removeEventListener(type, contain));
  }

  return { dom: root, render, destroy };
}

module.exports = { createBlockView };

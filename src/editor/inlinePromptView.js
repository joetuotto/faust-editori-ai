/**
 * The inline prompt's DOM (Cmd+K)
 *
 * Plain DOM, no CodeMirror and no React: the document is passed in, so the
 * view is tested in jsdom (test/editor/inlinePromptView.test.js). It draws a
 * PromptState (inlinePromptState.js) and reports what the author does as
 * intents; it decides nothing itself.
 *
 * Four things the view guarantees:
 * - Events never leave the prompt, so the editor host's key and mouse handlers
 *   and the window's Escape handler do not react to typing in the field.
 * - Escape cancels a running request or closes the prompt. It never rejects.
 * - The field is one textarea for the whole life of the prompt, so its text,
 *   focus and undo history survive every re-render.
 * - The field keeps its own undo history, reached through `field.faustHistory`
 *   (app.js runHistory calls it for Cmd+Z and Shift+Cmd+Z). The browser's own
 *   undo is one stack for the whole window: once the field's steps were used
 *   up it went on into the manuscript's editing steps and changed the text
 *   out of sight.
 */

const { attemptLabel, changeCountLabel } = require('./inlinePromptState.js');
// The step rule of every text field of the app (a word, a delete run, a paste), so Kumoa undoes the same here
const { createStepLog, changedEnd } = require('./fieldHistory.js');

// Bubble-phase listeners on the root; each stops the event after the view has used it
const ISOLATED_EVENTS = [
  'keydown', 'keyup', 'keypress',
  'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu',
  'input', 'change', 'cut', 'copy', 'paste',
  'compositionstart', 'compositionupdate', 'compositionend'
];

const INVALID_TEXT = 'Kirjoita ohje tai valitse pikavalinta.';
// Esc closes the prompt too, so the close button's tooltip names the key
const CLOSE_TITLE = 'Sulje (Esc)';
const MIN_ROWS = 2;
const MAX_ROWS = 6;
const MAX_HISTORY = 200;
const DETAIL_CHARS = 400;

const LENGTH_OPTIONS = [
  ['sentence', '1–2 virkettä'],
  ['paragraph', 'Kappale'],
  ['long', '2–3 kappaletta']
];

/**
 * @param {Document} doc
 * @param {{ onIntent: (intent: object) => void }} options
 * @returns {{ dom: HTMLElement, field: HTMLTextAreaElement, contextSlot: HTMLElement,
 *             render(state: object): void, focus(): void, destroy(): void }}
 */
function createPromptView(doc, options = {}) {
  const onIntent = typeof options.onIntent === 'function' ? options.onIntent : () => {};
  const emit = (intent) => onIntent(intent);

  // Small element builder: attributes, then text or child nodes
  const make = (tag, attrs, ...children) => {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attrs || {})) {
      if (value === false || value == null) continue;
      node.setAttribute(name, value === true ? '' : String(value));
    }
    for (const child of children) {
      if (child == null || child === false) continue;
      node.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child);
    }
    return node;
  };
  const button = (role, label, attrs) => make('button', { type: 'button', 'data-role': role, ...attrs }, label);
  const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

  const dom = make('div', { class: 'cm-faust-prompt', role: 'dialog', 'aria-label': 'Pikamuokkaus', tabindex: '-1' });
  const head = make('div', { class: 'cm-faust-prompt-head' });
  const field = make('textarea', { class: 'cm-faust-prompt-field', 'data-role': 'field', rows: MIN_ROWS });
  const body = make('div', { class: 'cm-faust-prompt-body' });
  // Stage I-05 mounts the "Mitä malli näkee" row here; the view never touches its children
  const contextSlot = make('div', { class: 'cm-faust-prompt-context', 'data-role': 'context' });
  const foot = make('div', { class: 'cm-faust-prompt-foot' });
  dom.append(head, field, body, contextSlot, foot);

  let state = null;
  let invalid = false;        // Enter on an empty instruction
  let detailOpen = false;     // "Näytä mallin vastaus"
  let detailError = null;     // the error the open detail belongs to
  let pickerChoice = null;    // what the author picked in the model picker, kept over re-renders
  let previewNode = null;
  let statusNode = null;
  let saveButton = null;
  // The field's own undo and redo, by the steps of the app's other text fields (fieldHistory.js)
  const history = createStepLog('', { maxSteps: MAX_HISTORY });

  const fieldShown = (phase) => phase !== 'sending' && phase !== 'blocked';
  const hasText = () => field.value.trim() !== '';
  const fiNumber = (value) => Number(value || 0).toLocaleString('fi-FI');
  const sendingStatus = (current) => (
    current.waiting ? 'Odotetaan mallia…' : `Tekoäly kirjoittaa… ${fiNumber(current.preview.length)} merkkiä`
  );

  /**
   * Undo or redo in the field. False when the field has nothing of its own to undo or redo: then
   * nothing happens at all (nothing reaches the manuscript).
   * @param {'undo'|'redo'} direction
   */
  function stepHistory(direction) {
    const before = field.value;
    const value = history.step(direction, before);
    if (value === null) return false;
    field.value = value;
    const caret = changedEnd(before, value);
    field.setSelectionRange(caret, caret);
    if (invalid) setInvalid(false);
    if (saveButton) saveButton.disabled = !hasText();
    resizeField();
    return true;
  }
  field.faustHistory = stepHistory;

  function resizeField() {
    const lines = field.value.split('\n').length;
    field.rows = Math.max(MIN_ROWS, Math.min(MAX_ROWS, lines));
    // Long lines wrap: grow until the text fits or six rows are reached
    while (field.rows < MAX_ROWS && field.scrollHeight > field.clientHeight && field.clientHeight > 0) field.rows += 1;
  }

  function setInvalid(on) {
    invalid = on;
    if (on) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
    if (statusNode && state && state.phase !== 'sending') statusNode.textContent = on ? INVALID_TEXT : '';
  }

  function placeholderFor(current) {
    if (current.phase === 'result') return 'Tarkenna…';
    if (current.mode === 'write') {
      return current.projectType === 'nonfiction' ? 'Mitä tässä kappaleessa sanotaan?' : 'Mitä seuraavaksi?';
    }
    return current.kind === 'paragraph' ? 'Miten kappaletta muokataan?' : 'Miten valintaa muokataan?';
  }

  // ---------------------------------------------------------------------------
  // Sections
  // ---------------------------------------------------------------------------

  function noteNode(lines) {
    const shown = lines.filter(Boolean);
    if (shown.length === 0) return null;
    const node = make('div', { class: 'cm-faust-prompt-note', 'data-role': 'note' }, shown.join('\n'));
    node.style.whiteSpace = 'pre-line';
    return node;
  }

  function modelNode(current) {
    return current.model && current.model.name
      ? make('span', { class: 'cm-faust-prompt-model', 'data-role': 'model' }, `Malli: ${current.model.name}`)
      : null;
  }

  // A chip sends at once: while nothing can be sent it is disabled and says why
  const sendAttrs = (current) => (current.sendBlocked ? { disabled: true, title: current.sendBlocked } : {});

  function chipsNode(current) {
    const builtins = current.actions.filter((item) => item.builtin);
    if (builtins.length === 0) return null;
    return make('div', { class: 'cm-faust-prompt-chips', 'data-role': 'chips' },
      ...builtins.map((item) => button('chip', item.label, { 'data-action': item.id, ...sendAttrs(current) })));
  }

  function savedNode(current) {
    const own = current.actions.filter((item) => !item.builtin);
    const node = make('div', { class: 'cm-faust-prompt-saved', 'data-role': 'saved' });
    if (own.length > 0) {
      node.appendChild(make('span', { class: 'cm-faust-prompt-caption' }, 'Omat ohjeet'));
      for (const item of own) {
        node.appendChild(make('span', { class: 'cm-faust-prompt-own' },
          button('chip', item.label, { 'data-action': item.id, ...sendAttrs(current) }),
          button('delete-prompt', '×', { 'data-id': item.id, title: 'Poista ohje', 'aria-label': 'Poista ohje' })));
      }
    }
    saveButton = button('save-prompt', 'Tallenna ohje', { disabled: !hasText() });
    node.appendChild(saveButton);
    return node;
  }

  function lengthNode(current) {
    const select = make('select', { 'data-role': 'length' },
      ...LENGTH_OPTIONS.map(([value, label]) => make('option', { value }, label)));
    select.value = current.length;
    return make('label', { class: 'cm-faust-prompt-length' }, make('span', {}, 'Pituus:'), select);
  }

  function pickerNode(current) {
    const models = Array.isArray(current.models) ? current.models : [];
    const node = make('div', { class: 'cm-faust-prompt-picker', 'data-role': 'picker' });
    if (models.length > 0) {
      const select = make('select', { 'data-role': 'model-picker' },
        ...models.map((model) => make('option', { value: model.id }, model.name || model.id)));
      const listed = (id) => models.some((model) => model.id === id);
      select.value = listed(pickerChoice) ? pickerChoice : listed(current.otherModel) ? current.otherModel : models[0].id;
      node.appendChild(make('label', {}, make('span', {}, 'Malli:'), select));
    } else {
      // No list (Claude direct): the author types the model id
      const input = make('input', { type: 'text', 'data-role': 'model-picker', placeholder: 'Mallin tunnus', 'aria-label': 'Malli' });
      input.value = pickerChoice != null ? pickerChoice : current.otherModel || '';
      node.appendChild(input);
    }
    node.appendChild(button('run-model', 'Aja'));
    return node;
  }

  function fillIdle(current) {
    const note = noteNode([current.note]);
    if (note) head.appendChild(note);

    if (current.mode === 'write') {
      body.appendChild(make('div', { class: 'cm-faust-prompt-hint', 'data-role': 'hint' },
        'Suunta on valinnainen. Tyhjä kenttä jatkaa tekstiä luontevasti.'));
      body.appendChild(lengthNode(current));
      if (current.canEditParagraph) {
        body.appendChild(button('edit-paragraph', 'Muokkaa tätä kappaletta', { class: 'cm-faust-prompt-link' }));
      }
    } else {
      statusNode = make('div', { class: 'cm-faust-prompt-status', 'data-role': 'status', role: 'status' }, invalid ? INVALID_TEXT : '');
      body.appendChild(statusNode);
      const chips = chipsNode(current);
      if (chips) body.appendChild(chips);
      body.appendChild(savedNode(current));
    }

    const model = modelNode(current);
    if (model) foot.appendChild(model);
    foot.appendChild(button('send', current.mode === 'write' ? 'Kirjoita' : 'Lähetä', { class: 'cm-faust-prompt-primary', ...sendAttrs(current) }));
    foot.appendChild(make('span', { class: 'cm-faust-prompt-keys', 'data-role': 'keys' },
      current.mode === 'write' ? 'Enter kirjoittaa · Esc sulkee' : 'Enter lähettää · Esc sulkee'));
  }

  function fillSending(current) {
    if (current.title) {
      head.appendChild(make('div', { class: 'cm-faust-prompt-instruction', 'data-role': 'instruction' }, `Ohje: ${current.title}`));
    }
    previewNode = make('div', { class: 'cm-faust-prompt-preview', 'data-role': 'preview' }, current.preview);
    statusNode = make('div', { class: 'cm-faust-prompt-status', 'data-role': 'status', role: 'status' }, sendingStatus(current));
    body.append(previewNode, statusNode);

    const model = modelNode(current);
    if (model) foot.appendChild(model);
    foot.appendChild(button('stop', 'Pysäytä'));
    foot.appendChild(make('span', { class: 'cm-faust-prompt-keys', 'data-role': 'keys' }, 'Esc pysäyttää pyynnön'));
  }

  function fillResult(current) {
    const count = current.attempts.length;
    const attempt = current.attempts[current.index] || null;

    const nav = make('div', { class: 'cm-faust-prompt-attempts' });
    if (count > 1) {
      nav.appendChild(button('attempt-prev', '‹', { 'aria-label': 'Edellinen yritys', title: 'Edellinen yritys', disabled: current.index <= 0 }));
    }
    nav.appendChild(make('span', { 'data-role': 'attempt-label' }, attemptLabel(current.index, count)));
    if (count > 1) {
      nav.appendChild(button('attempt-next', '›', { 'aria-label': 'Seuraava yritys', title: 'Seuraava yritys', disabled: current.index >= count - 1 }));
    }
    head.appendChild(nav);

    if (attempt) {
      // An attempt of "Kokeile toisella mallilla" is titled with the model: say the name once.
      // The count is its own span, so a line break never parts the number from its noun.
      const names = [attempt.title, attempt.modelName !== attempt.title ? attempt.modelName : ''].filter(Boolean);
      const count = changeCountLabel(attempt.changeCount);
      head.appendChild(make('div', { class: 'cm-faust-prompt-summary', 'data-role': 'summary' },
        names.join(' · ') + (names.length > 0 && count ? ' · ' : ''),
        count ? make('span', { class: 'cm-faust-prompt-count' }, count) : null));
    }
    const note = noteNode([attempt && attempt.note, current.note]);
    if (note) head.appendChild(note);

    const actions = make('div', { class: 'cm-faust-prompt-actions' });
    actions.appendChild(button('refine', 'Tarkenna'));
    if (attempt && attempt.changeCount > 0) {
      // "Hyväksy kaikki" is the bar's button and means the whole chapter; these two mean this attempt
      actions.appendChild(button('accept-all', 'Hyväksy muutokset', {
        class: 'cm-faust-prompt-primary',
        title: 'Hyväksy tämän yrityksen muutokset. Luvun muut ehdotukset jäävät odottamaan.'
      }));
      actions.appendChild(button('reject-all', 'Hylkää muutokset', { title: 'Hylkää tämän yrityksen muutokset.' }));
    }
    actions.appendChild(button('other-model', 'Kokeile toisella mallilla', { 'aria-expanded': current.pickerOpen ? 'true' : 'false' }));
    body.appendChild(actions);
    if (current.pickerOpen) body.appendChild(pickerNode(current));

    foot.appendChild(button('close', 'Sulje', { title: CLOSE_TITLE }));
  }

  function fillError(current) {
    const error = current.error || { code: '', message: '', detail: '' };
    if (detailError !== current.error) {
      detailError = current.error;
      detailOpen = false;
    }
    // The reason texts already begin with "Ei ehdotusta:", so the message is shown as it is
    head.appendChild(make('div', { class: 'cm-faust-prompt-error', 'data-role': 'error', role: 'alert' }, error.message || ''));
    if (error.detail) {
      head.appendChild(button('detail-toggle', detailOpen ? 'Kätke mallin vastaus' : 'Näytä mallin vastaus', {
        class: 'cm-faust-prompt-link',
        'aria-expanded': detailOpen ? 'true' : 'false'
      }));
      if (detailOpen) {
        head.appendChild(make('div', { class: 'cm-faust-prompt-detail', 'data-role': 'detail' }, String(error.detail).slice(0, DETAIL_CHARS)));
      }
    }

    statusNode = make('div', { class: 'cm-faust-prompt-status', 'data-role': 'status', role: 'status' }, invalid ? INVALID_TEXT : '');
    body.appendChild(statusNode);
    const actions = make('div', { class: 'cm-faust-prompt-actions' });
    actions.appendChild(button('retry', 'Yritä uudelleen', { class: 'cm-faust-prompt-primary' }));
    actions.appendChild(button('other-model', 'Kokeile toisella mallilla', { 'aria-expanded': current.pickerOpen ? 'true' : 'false' }));
    body.appendChild(actions);
    if (current.pickerOpen) body.appendChild(pickerNode(current));

    foot.appendChild(button('close', 'Sulje', { title: CLOSE_TITLE }));
  }

  function fillBlocked(current) {
    const message = current.blocked ? current.blocked.message : '';
    head.appendChild(make('div', { class: 'cm-faust-prompt-blocked', 'data-role': 'blocked', role: 'alert' }, message || ''));
    foot.appendChild(button('close', 'Sulje', { title: CLOSE_TITLE }));
  }

  function fillSections(current) {
    clear(head);
    clear(body);
    clear(foot);
    previewNode = null;
    statusNode = null;
    saveButton = null;

    if (current.phase === 'sending') fillSending(current);
    else if (current.phase === 'result') fillResult(current);
    else if (current.phase === 'error') fillError(current);
    else if (current.phase === 'blocked') fillBlocked(current);
    else fillIdle(current);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function render(next) {
    if (!next) return;
    const previous = state;
    state = next;
    const phaseChanged = !previous || previous.phase !== next.phase;

    // Streamed text: change the two text nodes in place, so the preview keeps its scroll position
    if (!phaseChanged && next.phase === 'sending' && previewNode && statusNode && previous.title === next.title) {
      previewNode.textContent = next.preview;
      statusNode.textContent = sendingStatus(next);
      previewNode.scrollTop = previewNode.scrollHeight;
      return;
    }

    const active = doc.activeElement;
    const hadFocus = !!active && dom.contains(active);
    // Which control had the focus, so that its redrawn self can get it back
    const focused = hadFocus && !phaseChanged && active !== field && active.getAttribute && active.getAttribute('data-role')
      ? { role: active.getAttribute('data-role'), action: active.getAttribute('data-action'), id: active.getAttribute('data-id') }
      : null;
    const showField = fieldShown(next.phase);

    dom.setAttribute('aria-label', next.mode === 'write' ? 'Kirjoita kohdistimeen' : 'Pikamuokkaus');
    dom.setAttribute('data-mode', next.mode);
    dom.setAttribute('data-phase', next.phase);

    // A hidden field would drop the focus on <body>, and Esc would no longer reach the prompt
    if (!showField && active === field) dom.focus({ preventScroll: true });
    field.hidden = !showField;
    field.placeholder = placeholderFor(next);
    field.setAttribute('aria-label', next.mode === 'write' ? 'Suunta' : 'Pikamuokkauksen ohje');

    if (phaseChanged) {
      // The typed text stays in the hidden field while a request runs
      if (next.phase !== 'sending') {
        field.value = next.draft || '';
        history.rebase(field.value);
        resizeField();
      }
      setInvalid(false);
    }
    if (!next.pickerOpen || !previous || previous.models !== next.models) pickerChoice = null;

    fillSections(next);
    contextSlot.hidden = next.phase === 'blocked';

    // Rebuilding removed the button that had the focus, or the field came back
    if (hadFocus) {
      const now = doc.activeElement;
      if (!now || !dom.contains(now) || (now === dom && showField)) {
        const same = focused ? findControl(focused.role, focused) : null;
        if (same) same.focus({ preventScroll: true });
        else focusInside();
      }
    }
  }

  // A control of the rebuilt sections by its role (never one inside the context row)
  function findControl(role, match = {}) {
    for (const section of [head, body, foot]) {
      for (const node of section.querySelectorAll('[data-role]')) {
        if (node.disabled || node.getAttribute('data-role') !== role) continue;
        if (match.action != null && node.getAttribute('data-action') !== match.action) continue;
        if (match.id != null && node.getAttribute('data-id') !== match.id) continue;
        return node;
      }
    }
    return null;
  }

  function focusInside() {
    if (!field.hidden) {
      field.focus({ preventScroll: true });
      return;
    }
    // Blocked: Enter on "Sulje" closes. Sending: the dialog itself, so a held Enter cannot press "Pysäytä"
    const close = state && state.phase === 'blocked' ? findControl('close') : null;
    (close || dom).focus({ preventScroll: true });
  }

  function focus() {
    focusInside();
    if (!field.hidden) {
      const end = field.value.length;
      field.setSelectionRange(end, end);
    }
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  function submitField() {
    if (!state) return;
    const value = field.value;
    if (state.phase === 'idle' || state.phase === 'error') {
      // An empty direction is fine when writing; an edit needs an instruction
      if (state.mode !== 'write' && !hasText()) {
        setInvalid(true);
        return;
      }
      emit({ type: 'submit', instruction: value });
    } else if (state.phase === 'result' && hasText()) {
      emit({ type: 'refine', instruction: value });
    }
  }

  function runModel() {
    const picker = body.querySelector('[data-role="model-picker"]');
    const modelId = picker ? String(picker.value || '').trim() : '';
    if (modelId) emit({ type: 'try-model', modelId });
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      emit(state && state.phase === 'sending' ? { type: 'cancel' } : { type: 'close', reason: 'escape' });
      return;
    }
    if (event.key !== 'Enter') return;
    // Shift+Enter is a line break. Cmd/Ctrl+Enter is not the prompt's key: after a
    // result the focus is in the manuscript, where it accepts one suggestion.
    if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.isComposing || event.keyCode === 229) return;

    if (event.target === field) {
      event.preventDefault();
      submitField();
    } else if (event.target && event.target.tagName === 'INPUT' && event.target.getAttribute('data-role') === 'model-picker') {
      event.preventDefault();
      runModel();
    }
  }

  function onInput(event) {
    if (event.target === field) {
      // An edit of the author's: a word, a delete run, a paste or a line break is one step back
      history.record(field.value, event.inputType, event.data);
      if (invalid) setInvalid(false);
      if (saveButton) saveButton.disabled = !hasText();
      resizeField();
    } else if (event.target && event.target.getAttribute && event.target.getAttribute('data-role') === 'model-picker') {
      pickerChoice = event.target.value;
    }
  }

  function onChange(event) {
    const role = event.target && event.target.getAttribute ? event.target.getAttribute('data-role') : null;
    if (role === 'length') emit({ type: 'length', length: event.target.value });
    else if (role === 'model-picker') pickerChoice = event.target.value;
  }

  function onClick(event) {
    if (!state || !event.target || !event.target.closest) return;
    // The context row has its own handlers
    if (contextSlot.contains(event.target)) return;
    const target = event.target.closest('[data-role]');
    if (!target || !dom.contains(target) || target.disabled) return;

    switch (target.getAttribute('data-role')) {
      case 'chip':
        emit({ type: 'action', actionId: target.getAttribute('data-action'), extra: field.value });
        break;
      case 'delete-prompt':
        emit({ type: 'delete-prompt', id: target.getAttribute('data-id') });
        break;
      case 'save-prompt':
        if (hasText()) emit({ type: 'save-prompt', text: field.value });
        break;
      case 'send':
      case 'refine':
        submitField();
        break;
      case 'stop':
        emit({ type: 'cancel' });
        break;
      case 'attempt-prev':
        emit({ type: 'select', index: state.index - 1 });
        break;
      case 'attempt-next':
        emit({ type: 'select', index: state.index + 1 });
        break;
      case 'accept-all':
      case 'reject-all':
      case 'retry':
      case 'edit-paragraph':
        emit({ type: target.getAttribute('data-role') });
        break;
      case 'other-model':
        emit({ type: 'picker', open: !state.pickerOpen });
        break;
      case 'run-model':
        runModel();
        break;
      case 'close':
        emit({ type: 'close', reason: 'button' });
        break;
      case 'detail-toggle':
        detailOpen = !detailOpen;
        render(state);
        break;
      default:
        break;
    }
  }

  const ownHandlers = { keydown: onKeydown, input: onInput, change: onChange, click: onClick };
  const listener = (event) => {
    try {
      const own = ownHandlers[event.type];
      if (own) own(event);
    } finally {
      event.stopPropagation();
    }
  };
  for (const type of ISOLATED_EVENTS) dom.addEventListener(type, listener);

  function destroy() {
    for (const type of ISOLATED_EVENTS) dom.removeEventListener(type, listener);
    delete field.faustHistory;
  }

  return { dom, field, contextSlot, render, focus, destroy };
}

module.exports = { createPromptView };

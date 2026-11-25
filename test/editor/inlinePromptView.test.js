/**
 * @jest-environment jsdom
 */
const { createPromptView } = require('../../src/editor/inlinePromptView');
const { createState, reduce } = require('../../src/editor/inlinePromptState');
const { actionsFor } = require('../../src/services/ai/actions');

const chips = (kind, saved = []) => actionsFor(kind, saved).map(({ id, label, builtin }) => ({ id, label, builtin }));
const attempt = (n, extra = {}) => ({ id: `a${n}`, title: 'Tiivistä', modelName: 'deepseek-v4.1-flash', changeCount: 7, note: null, ...extra });

let mounted = [];

// A prompt inside a host element, the way the tooltip sits inside the editor
function mount(init = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const intents = [];
  const view = createPromptView(document, { onIntent: (intent) => intents.push(intent) });
  host.appendChild(view.dom);
  let state = createState({ actions: chips('fiction'), model: { id: 'p:deepseek-v4.1-flash', name: 'deepseek-v4.1-flash' }, ...init });
  view.render(state);
  mounted.push({ host, view });

  return {
    host,
    view,
    intents,
    get state() { return state; },
    // Apply reducer events and draw the result
    apply(...events) {
      for (const event of events) state = reduce(state, event);
      view.render(state);
      return state;
    },
    role: (name) => view.dom.querySelector(`[data-role="${name}"]`),
    roles: (name) => Array.from(view.dom.querySelectorAll(`[data-role="${name}"]`)),
    type(text) {
      view.field.value = text;
      view.field.dispatchEvent(new Event('input', { bubbles: true }));
    },
    key(target, key, init = {}) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      return event;
    },
    click(name) {
      view.dom.querySelector(`[data-role="${name}"]`).click();
    }
  };
}

afterEach(() => {
  for (const { host, view } of mounted) {
    view.destroy();
    host.remove();
  }
  mounted = [];
});

describe('events stay inside the prompt', () => {
  test('keyup and mouseup inside the prompt do not reach a listener on the parent element', () => {
    const prompt = mount();
    const seen = [];
    for (const type of ['keyup', 'mouseup']) prompt.host.addEventListener(type, (event) => seen.push(event.type));

    prompt.view.field.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
    prompt.view.field.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    prompt.role('send').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(seen).toEqual([]);

    // The same events outside the prompt do reach it: the listener works
    prompt.host.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(seen).toEqual(['mouseup']);
  });

  test('no key, mouse, clipboard, input or composition event leaves the prompt', () => {
    const prompt = mount();
    const types = [
      'keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu',
      'input', 'change', 'cut', 'copy', 'paste', 'compositionstart', 'compositionupdate', 'compositionend'
    ];
    const seen = [];
    for (const type of types) prompt.host.addEventListener(type, () => seen.push(type));
    for (const type of types) prompt.view.field.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    expect(seen).toEqual([]);
  });

  test('Escape inside the prompt does not reach a window keydown listener and asks to close', () => {
    const prompt = mount();
    const onWindow = jest.fn();
    window.addEventListener('keydown', onWindow);
    try {
      const event = prompt.key(prompt.view.field, 'Escape');
      expect(onWindow).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
      expect(prompt.intents).toEqual([{ type: 'close', reason: 'escape' }]);

      // Also from a button of the prompt
      prompt.key(prompt.role('send'), 'Escape');
      expect(onWindow).not.toHaveBeenCalled();
      expect(prompt.intents).toHaveLength(2);
    } finally {
      window.removeEventListener('keydown', onWindow);
    }
  });

  test('Escape while sending asks to cancel, not to close', () => {
    const prompt = mount();
    prompt.type('Tiivistä tämä');
    prompt.apply({ type: 'send', instruction: 'Tiivistä tämä' });
    prompt.key(prompt.view.dom, 'Escape');
    prompt.click('stop');
    expect(prompt.intents).toEqual([{ type: 'cancel' }, { type: 'cancel' }]);
    // Escape never asks to reject anything, in any phase
    expect(prompt.intents.some((intent) => /reject/.test(intent.type))).toBe(false);
  });

  test('Cmd+Z keydown is not prevented', () => {
    const prompt = mount();
    prompt.type('ohje');
    const undo = prompt.key(prompt.view.field, 'z', { metaKey: true });
    const redo = prompt.key(prompt.view.field, 'z', { metaKey: true, shiftKey: true });
    const ctrl = prompt.key(prompt.view.field, 'z', { ctrlKey: true });
    expect(undo.defaultPrevented).toBe(false);
    expect(redo.defaultPrevented).toBe(false);
    expect(ctrl.defaultPrevented).toBe(false);
    expect(prompt.intents).toEqual([]);
    expect(prompt.view.field.value).toBe('ohje');
  });

  test('destroy removes the listeners', () => {
    const prompt = mount();
    const seen = [];
    prompt.host.addEventListener('keyup', () => seen.push('keyup'));
    prompt.view.destroy();
    prompt.view.field.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
    prompt.key(prompt.view.field, 'Escape');
    expect(seen).toEqual(['keyup']);
    expect(prompt.intents).toEqual([]);
  });
});

describe('the field and Enter', () => {
  test('Enter submits the field text; Shift+Enter does not', () => {
    const prompt = mount();
    prompt.type('Tee tästä ”tiiviimpi” – älä muuta Åken repliikkiä');

    const shifted = prompt.key(prompt.view.field, 'Enter', { shiftKey: true });
    expect(shifted.defaultPrevented).toBe(false);
    expect(prompt.intents).toEqual([]);

    const plain = prompt.key(prompt.view.field, 'Enter');
    expect(plain.defaultPrevented).toBe(true);
    expect(prompt.intents).toEqual([{ type: 'submit', instruction: 'Tee tästä ”tiiviimpi” – älä muuta Åken repliikkiä' }]);

    // The button does the same as Enter
    prompt.click('send');
    expect(prompt.intents).toHaveLength(2);
    expect(prompt.intents[1]).toEqual(prompt.intents[0]);
  });

  test('Cmd+Enter in the field sends no intent', () => {
    const idle = mount();
    idle.type('ohje');
    const result = mount({ attempts: [attempt(1)] });
    result.type('tarkennus');

    for (const prompt of [idle, result]) {
      for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
        const event = prompt.key(prompt.view.field, 'Enter', modifier);
        expect(event.defaultPrevented).toBe(false);
      }
      expect(prompt.intents).toEqual([]);
    }
  });

  test('Enter during IME composition does nothing', () => {
    const prompt = mount();
    prompt.type('ohje');
    const composing = prompt.key(prompt.view.field, 'Enter', { isComposing: true });
    expect(composing.defaultPrevented).toBe(false);
    // Some browsers report the composing Enter only with key code 229
    const legacy = prompt.key(prompt.view.field, 'Enter', { keyCode: 229 });
    expect(legacy.defaultPrevented).toBe(false);
    expect(prompt.intents).toEqual([]);
  });

  test('Enter with an empty field in edit mode marks the field invalid and sends nothing', () => {
    const prompt = mount();
    prompt.type('   ');
    const event = prompt.key(prompt.view.field, 'Enter');
    expect(event.defaultPrevented).toBe(true);
    expect(prompt.intents).toEqual([]);
    expect(prompt.view.field.getAttribute('aria-invalid')).toBe('true');
    expect(prompt.role('status').textContent).toBe('Kirjoita ohje tai valitse pikavalinta.');
    expect(prompt.role('status').getAttribute('role')).toBe('status');

    // Typing clears the mark
    prompt.type('Tiivistä');
    expect(prompt.view.field.hasAttribute('aria-invalid')).toBe(false);
    expect(prompt.role('status').textContent).toBe('');
  });

  test('Enter with an empty field in write mode submits an empty direction', () => {
    const prompt = mount({ mode: 'write', kind: 'cursor' });
    prompt.key(prompt.view.field, 'Enter');
    expect(prompt.intents).toEqual([{ type: 'submit', instruction: '' }]);
    expect(prompt.view.field.hasAttribute('aria-invalid')).toBe(false);
  });

  test('Enter in result with text asks to refine', () => {
    const prompt = mount({ attempts: [attempt(1)] });
    prompt.key(prompt.view.field, 'Enter');
    expect(prompt.intents).toEqual([]);   // an empty refinement is nothing

    prompt.type('vielä lyhyemmin');
    prompt.key(prompt.view.field, 'Enter');
    prompt.click('refine');
    expect(prompt.intents).toEqual([
      { type: 'refine', instruction: 'vielä lyhyemmin' },
      { type: 'refine', instruction: 'vielä lyhyemmin' }
    ]);
  });

  test('the field is the same element and keeps its text across idle → sending → error', () => {
    const prompt = mount();
    const field = prompt.view.field;
    prompt.type('Tee tästä tiiviimpi');

    prompt.apply({ type: 'send', instruction: 'Tee tästä tiiviimpi' });
    expect(prompt.role('field')).toBe(field);
    expect(field.hidden).toBe(true);
    expect(field.value).toBe('Tee tästä tiiviimpi');

    prompt.apply({ type: 'delta', preview: 'Tiiviimpi teksti' });
    prompt.apply({ type: 'fail', error: { code: 'empty', message: 'Ei ehdotusta: malli palautti tyhjän tekstin.', detail: '' } });
    expect(prompt.role('field')).toBe(field);
    expect(prompt.view.field).toBe(field);
    expect(field.hidden).toBe(false);
    expect(field.value).toBe('Tee tästä tiiviimpi');
    expect(field.isConnected).toBe(true);
    expect(prompt.roles('field')).toHaveLength(1);
  });

  test('a re-render inside one phase leaves the typed text alone', () => {
    const prompt = mount();
    prompt.type('kesken oleva ohje');
    prompt.apply({ type: 'actions', actions: chips('fiction', [{ id: 'user-1', label: 'Oma', prompt: 'Tee.' }]) });
    expect(prompt.view.field.value).toBe('kesken oleva ohje');
    // A new result empties the field for the refinement
    prompt.apply({ type: 'send', instruction: 'kesken oleva ohje' }, { type: 'result', attempt: attempt(1) });
    expect(prompt.view.field.value).toBe('');
    expect(prompt.view.field.placeholder).toBe('Tarkenna…');
  });

  test('a stopped request returns the instruction to the field with the note', () => {
    const prompt = mount();
    prompt.type('Tiivistä tämä');
    prompt.apply({ type: 'send', instruction: 'Tiivistä tämä' }, { type: 'cancelled' });
    expect(prompt.view.field.hidden).toBe(false);
    expect(prompt.view.field.value).toBe('Tiivistä tämä');
    expect(prompt.role('note').textContent).toBe('Pyyntö pysäytettiin.');
  });

  test('focus puts the caret at the end of the field', () => {
    const prompt = mount({ draft: 'Sumu nousee' });
    prompt.view.focus();
    expect(document.activeElement).toBe(prompt.view.field);
    expect(prompt.view.field.selectionStart).toBe('Sumu nousee'.length);
    expect(prompt.view.field.selectionEnd).toBe('Sumu nousee'.length);
  });

  test('the focus stays inside the prompt when the field is hidden and when a pressed button is rebuilt', () => {
    const prompt = mount();
    prompt.view.focus();
    prompt.type('Tiivistä');

    // Sending hides the field: the dialog itself takes the focus, so Esc still reaches the prompt
    prompt.apply({ type: 'send', instruction: 'Tiivistä' });
    expect(document.activeElement).toBe(prompt.view.dom);
    prompt.key(document.activeElement, 'Escape');
    expect(prompt.intents).toEqual([{ type: 'cancel' }]);

    // Back in a phase with the field: the author can type again at once
    prompt.apply({ type: 'fail', error: { code: 'empty', message: 'Ei ehdotusta: malli palautti tyhjän tekstin.', detail: 'x' } });
    expect(document.activeElement).toBe(prompt.view.field);

    // A button that is redrawn keeps the focus on its new self
    prompt.role('detail-toggle').focus();
    prompt.click('detail-toggle');
    expect(document.activeElement).toBe(prompt.role('detail-toggle'));
    expect(document.activeElement.textContent).toBe('Kätke mallin vastaus');
  });

  test('a redrawn chip keeps the focus on the same chip', () => {
    const own = [{ id: 'user-1', label: 'Oma', prompt: 'Tee.' }, { id: 'user-2', label: 'Toinen', prompt: 'Tee toisin.' }];
    const prompt = mount({ actions: chips('fiction', own) });
    prompt.view.dom.querySelector('[data-role="chip"][data-action="clarify"]').focus();
    // Another saved prompt goes away: the row is rebuilt
    prompt.apply({ type: 'actions', actions: chips('fiction', own.slice(1)) });
    expect(document.activeElement.getAttribute('data-action')).toBe('clarify');
    expect(document.activeElement.isConnected).toBe(true);

    // The chip itself is gone: the focus goes to the field, not out of the prompt
    prompt.view.dom.querySelector('[data-role="delete-prompt"][data-id="user-2"]').focus();
    prompt.apply({ type: 'actions', actions: chips('fiction') });
    expect(document.activeElement).toBe(prompt.view.field);
  });

  test('a prompt that never had the focus does not take it on a re-render', () => {
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();
    const prompt = mount();
    prompt.apply({ type: 'send', instruction: 'x' }, { type: 'result', attempt: attempt(1) });
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe('edit mode, idle', () => {
  test('a chip click sends the action id and the field text as extra', () => {
    const prompt = mount();
    prompt.type('säilytä nimet');
    prompt.view.dom.querySelector('[data-role="chip"][data-action="tighten"]').click();
    expect(prompt.intents).toEqual([{ type: 'action', actionId: 'tighten', extra: 'säilytä nimet' }]);
  });

  test('fiction shows Näytä, älä kerro and nonfiction shows Selkeytä väite', () => {
    const fiction = mount({ projectType: 'fiction', actions: chips('fiction') });
    expect(fiction.roles('chip').map((chip) => chip.textContent)).toEqual([
      'Kielenhuolto – vain virheet', 'Tiivistä', 'Selkeytä', 'Näytä, älä kerro'
    ]);

    const nonfiction = mount({ projectType: 'nonfiction', actions: chips('nonfiction') });
    expect(nonfiction.roles('chip').map((chip) => chip.textContent)).toEqual([
      'Kielenhuolto – vain virheet', 'Tiivistä kappale', 'Selkeytä', 'Selkeytä väite', 'Yhtenäistä termit'
    ]);
    expect(nonfiction.roles('chip').map((chip) => chip.getAttribute('data-action'))).toEqual([
      'proofread', 'tighten-paragraph', 'clarify', 'clarify-claim', 'unify-terms'
    ]);
  });

  test('the idle prompt names itself, its field, its model and its keys', () => {
    const prompt = mount();
    expect(prompt.view.dom.classList.contains('cm-faust-prompt')).toBe(true);
    expect(prompt.view.dom.getAttribute('role')).toBe('dialog');
    expect(prompt.view.dom.getAttribute('aria-label')).toBe('Pikamuokkaus');
    expect(prompt.view.field.getAttribute('aria-label')).toBe('Pikamuokkauksen ohje');
    expect(prompt.view.field.placeholder).toBe('Miten valintaa muokataan?');
    expect(prompt.view.field.rows).toBe(2);
    expect(prompt.role('model').textContent).toBe('Malli: deepseek-v4.1-flash');
    expect(prompt.role('send').textContent).toBe('Lähetä');
    expect(prompt.role('keys').textContent).toBe('Enter lähettää · Esc sulkee');

    expect(mount({ kind: 'paragraph' }).view.field.placeholder).toBe('Miten kappaletta muokataan?');
  });

  test('the field grows with its lines up to six rows', () => {
    const prompt = mount();
    prompt.type('yksi\nkaksi\nkolme');
    expect(prompt.view.field.rows).toBe(3);
    prompt.type(Array.from({ length: 9 }, (_, n) => `rivi ${n}`).join('\n'));
    expect(prompt.view.field.rows).toBe(6);
    prompt.type('');
    expect(prompt.view.field.rows).toBe(2);
  });

  test('saved prompts are listed under Omat ohjeet and can be saved and deleted', () => {
    const own = [{ id: 'user-1', label: 'Säilytä murre', prompt: 'Älä yleiskielistä.' }];
    const prompt = mount({ actions: chips('fiction', own) });

    const saved = prompt.role('saved');
    expect(saved.textContent).toContain('Omat ohjeet');
    expect(saved.querySelector('[data-role="chip"]').textContent).toBe('Säilytä murre');
    // The built-in row does not repeat the author's own prompts
    expect(prompt.role('chips').querySelectorAll('[data-role="chip"]')).toHaveLength(4);

    const remove = prompt.role('delete-prompt');
    expect(remove.textContent).toBe('×');
    expect(remove.getAttribute('title')).toBe('Poista ohje');
    remove.click();
    saved.querySelector('[data-role="chip"]').click();

    // "Tallenna ohje" needs text in the field
    const save = prompt.role('save-prompt');
    expect(save.textContent).toBe('Tallenna ohje');
    expect(save.disabled).toBe(true);
    save.click();
    prompt.type('Älä lyhennä ”sitaatteja”');
    expect(save.disabled).toBe(false);
    save.click();

    expect(prompt.intents).toEqual([
      { type: 'delete-prompt', id: 'user-1' },
      { type: 'action', actionId: 'user-1', extra: '' },
      { type: 'save-prompt', text: 'Älä lyhennä ”sitaatteja”' }
    ]);

    // Without saved prompts there is no caption, but the save button is there
    const plain = mount();
    expect(plain.role('saved').textContent).not.toContain('Omat ohjeet');
    expect(plain.role('save-prompt')).not.toBeNull();
  });
});

describe('the context slot', () => {
  test('the context slot is the same element after every render', () => {
    const prompt = mount();
    const slot = prompt.view.contextSlot;
    expect(slot.getAttribute('data-role')).toBe('context');
    expect(slot.childNodes).toHaveLength(0);

    // What the integration stage mounts into it stays untouched
    const row = document.createElement('div');
    row.textContent = 'Lähetetään: valinta 612';
    slot.appendChild(row);

    prompt.apply({ type: 'send', instruction: 'x' });
    prompt.apply({ type: 'delta', preview: 'teksti' });
    prompt.apply({ type: 'result', attempt: attempt(1) });
    prompt.apply({ type: 'send', instruction: 'y' }, { type: 'fail', error: { code: 'empty', message: 'Ei ehdotusta.', detail: '' } });
    prompt.apply({ type: 'block', code: 'noAI', message: 'x' });

    expect(prompt.view.contextSlot).toBe(slot);
    expect(prompt.role('context')).toBe(slot);
    expect(prompt.roles('context')).toHaveLength(1);
    expect(slot.isConnected).toBe(true);
    expect(slot.firstChild).toBe(row);
    expect(slot.childNodes).toHaveLength(1);
  });

  test('the view draws no context row, prompt text or earlier-attempts link of its own', () => {
    const prompt = mount({ mode: 'write', kind: 'cursor', canEditParagraph: true });
    for (const role of ['show-prompt', 'prompt-text', 'earlier']) expect(prompt.role(role)).toBeNull();
    expect(prompt.view.dom.textContent).not.toContain('Aiemmat yritykset');
    expect(prompt.view.dom.textContent).not.toContain('Lähetetään');
  });

  test('a click inside the context row is not read as one of the prompt\'s own buttons', () => {
    const prompt = mount();
    const inner = document.createElement('button');
    inner.setAttribute('data-role', 'close');
    prompt.view.contextSlot.appendChild(inner);
    inner.click();
    expect(prompt.intents).toEqual([]);
  });
});

describe('write mode', () => {
  test('write mode asks for a direction and offers the length and the paragraph edit', () => {
    const prompt = mount({ mode: 'write', kind: 'cursor', canEditParagraph: true });
    expect(prompt.view.dom.getAttribute('aria-label')).toBe('Kirjoita kohdistimeen');
    expect(prompt.view.field.getAttribute('aria-label')).toBe('Suunta');
    expect(prompt.view.field.placeholder).toBe('Mitä seuraavaksi?');
    expect(prompt.role('hint').textContent).toBe('Suunta on valinnainen. Tyhjä kenttä jatkaa tekstiä luontevasti.');
    expect(prompt.role('send').textContent).toBe('Kirjoita');
    expect(prompt.role('keys').textContent).toBe('Enter kirjoittaa · Esc sulkee');
    expect(prompt.role('chips')).toBeNull();

    const length = prompt.role('length');
    expect(length.closest('label').textContent).toContain('Pituus');
    expect(Array.from(length.options).map((option) => option.textContent)).toEqual(['1–2 virkettä', 'Kappale', '2–3 kappaletta']);
    expect(length.value).toBe('paragraph');
    length.value = 'long';
    length.dispatchEvent(new Event('change', { bubbles: true }));

    expect(prompt.role('edit-paragraph').textContent).toBe('Muokkaa tätä kappaletta');
    prompt.click('edit-paragraph');
    expect(prompt.intents).toEqual([{ type: 'length', length: 'long' }, { type: 'edit-paragraph' }]);
  });

  test('a nonfiction project is asked what the paragraph says, and the link needs a paragraph', () => {
    const prompt = mount({ mode: 'write', kind: 'cursor', projectType: 'nonfiction' });
    expect(prompt.view.field.placeholder).toBe('Mitä tässä kappaleessa sanotaan?');
    expect(prompt.role('edit-paragraph')).toBeNull();
  });
});

describe('sending', () => {
  test('sending shows the instruction, the wait, the streamed text and how to stop', () => {
    const prompt = mount();
    prompt.apply({ type: 'send', instruction: 'säilytä nimet', title: 'Tiivistä' });
    expect(prompt.role('instruction').textContent).toBe('Ohje: Tiivistä');
    expect(prompt.role('status').textContent).toBe('Odotetaan mallia…');
    expect(prompt.role('status').getAttribute('role')).toBe('status');
    expect(prompt.role('preview').textContent).toBe('');
    expect(prompt.role('stop').textContent).toBe('Pysäytä');
    expect(prompt.role('keys').textContent).toBe('Esc pysäyttää pyynnön');
    expect(prompt.role('chips')).toBeNull();

    const preview = prompt.role('preview');
    prompt.apply({ type: 'delta', preview: 'Åke käveli – hitaasti.' });
    expect(prompt.role('preview')).toBe(preview);   // the text changes in place
    expect(preview.textContent).toBe('Åke käveli – hitaasti.');
    expect(prompt.role('status').textContent).toBe('Tekoäly kirjoittaa… 22 merkkiä');
  });
});

describe('result', () => {
  test('result shows ‹ 2/3 ›, the model name and 7 muutosta', () => {
    const prompt = mount({ attempts: [attempt(1), attempt(2), attempt(3)], index: 1 });
    const previous = prompt.role('attempt-prev');
    const next = prompt.role('attempt-next');
    expect(previous.textContent).toBe('‹');
    expect(previous.getAttribute('aria-label')).toBe('Edellinen yritys');
    // Final polish round 1: the counter names what it counts
    expect(prompt.role('attempt-label').textContent).toBe('Yritys 2/3');
    expect(next.textContent).toBe('›');
    expect(next.getAttribute('aria-label')).toBe('Seuraava yritys');
    expect(prompt.role('summary').textContent).toBe('Tiivistä · deepseek-v4.1-flash · 7 muutosta');

    previous.click();
    next.click();
    expect(prompt.intents).toEqual([{ type: 'select', index: 0 }, { type: 'select', index: 2 }]);
  });

  // Changed in final polish round 1 (the rule changed): one attempt has no counter at all; a bare
  // "1/1" stood beside the bar's "Ehdotus 1 / 1"
  test('one attempt shows no counter and no arrows, and 1 muutos in the singular', () => {
    const prompt = mount({ attempts: [attempt(1, { changeCount: 1 })] });
    expect(prompt.role('attempt-label')).toBeNull();
    expect(prompt.role('attempt-prev')).toBeNull();
    expect(prompt.role('attempt-next')).toBeNull();
    expect(prompt.role('summary').textContent).toBe('Tiivistä · deepseek-v4.1-flash · 1 muutos');
  });

  test('an attempt titled with its model names the model once', () => {
    const prompt = mount({ attempts: [attempt(1, { title: 'glm-5.3-flash', modelName: 'glm-5.3-flash', changeCount: 4 })] });
    expect(prompt.role('summary').textContent).toBe('glm-5.3-flash · 4 muutosta');
  });

  test('the two bulk buttons speak of this attempt, not of the whole chapter', () => {
    const prompt = mount({ attempts: [attempt(1)] });
    const accept = prompt.role('accept-all');
    const reject = prompt.role('reject-all');
    expect(accept.textContent).toBe('Hyväksy muutokset');
    expect(accept.getAttribute('title')).toBe('Hyväksy tämän yrityksen muutokset. Luvun muut ehdotukset jäävät odottamaan.');
    expect(reject.textContent).toBe('Hylkää muutokset');
    expect(reject.getAttribute('title')).toBe('Hylkää tämän yrityksen muutokset.');
    expect(prompt.view.dom.textContent).not.toContain('Hyväksy kaikki');
    expect(prompt.role('refine').textContent).toBe('Tarkenna');
    expect(prompt.role('other-model').textContent).toBe('Kokeile toisella mallilla');
    expect(prompt.role('close').textContent).toBe('Sulje');

    accept.click();
    reject.click();
    prompt.click('close');
    expect(prompt.intents).toEqual([{ type: 'accept-all' }, { type: 'reject-all' }, { type: 'close', reason: 'button' }]);
  });

  // Final polish round 1
  test('reject stands before the primary accept, the pair last in the row', () => {
    const prompt = mount({ attempts: [attempt(1)] });
    const row = prompt.role('refine').parentNode;
    expect(Array.from(row.querySelectorAll('button'), node => node.getAttribute('data-role')))
      .toEqual(['refine', 'other-model', 'reject-all', 'accept-all']);
    expect(prompt.role('accept-all').parentNode).toBe(prompt.role('reject-all').parentNode);
    expect(prompt.role('accept-all').parentNode.className).toBe('cm-faust-prompt-decide');
    expect(prompt.role('accept-all').className).toBe('cm-faust-prompt-primary');
  });

  test('Tarkenna on an empty field sends nothing, says why and puts the focus into the field', () => {
    const prompt = mount({ attempts: [attempt(1)] });
    prompt.view.field.value = '   ';
    prompt.click('refine');
    expect(prompt.intents).toEqual([]);
    expect(prompt.role('status').textContent).toBe('Kirjoita ensin, mitä haluat muuttaa.');
    expect(prompt.view.field.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(prompt.view.field);
  });

  test('accept and reject buttons are hidden when the attempt has no changes', () => {
    const none = mount({ attempts: [attempt(1, { changeCount: 0, note: 'Malli ei ehdottanut muutoksia.' })] });
    expect(none.role('accept-all')).toBeNull();
    expect(none.role('reject-all')).toBeNull();
    expect(none.role('summary').textContent).toBe('Tiivistä · deepseek-v4.1-flash · Ei muutoksia');
    expect(none.role('note').textContent).toBe('Malli ei ehdottanut muutoksia.');
    // Refining, another model and closing are still offered
    expect(none.role('refine')).not.toBeNull();
    expect(none.role('other-model')).not.toBeNull();
    expect(none.role('close')).not.toBeNull();

    // Not counted yet: nothing to accept either
    const unknown = mount({ attempts: [attempt(1, { changeCount: null })] });
    expect(unknown.role('accept-all')).toBeNull();
    expect(unknown.role('summary').textContent).toBe('Tiivistä · deepseek-v4.1-flash');
  });

  test('a note of the state is shown under the summary, after the attempt\'s own note', () => {
    const prompt = mount({ attempts: [attempt(1)] });
    expect(prompt.role('note')).toBeNull();

    prompt.apply({ type: 'note', note: 'Vuorosanojen ehdotuksia: 2. Käy ne läpi yksitellen.' });
    const note = prompt.role('note');
    expect(note.textContent).toBe('Vuorosanojen ehdotuksia: 2. Käy ne läpi yksitellen.');
    expect(prompt.role('summary').compareDocumentPosition(note) & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    prompt.apply({ type: 'attempt', index: 0, changeCount: 7, note: '1 suojattu kohta puuttui vastauksesta, ja se palautettiin paikalleen.' });
    expect(prompt.role('note').textContent).toBe(
      '1 suojattu kohta puuttui vastauksesta, ja se palautettiin paikalleen.\nVuorosanojen ehdotuksia: 2. Käy ne läpi yksitellen.'
    );
  });

  test('the model picker is a select with a model list and a text field without one', () => {
    const models = [{ id: 'p:glm-5.3', name: 'glm-5.3' }, { id: 'p:glm-5.3-flash', name: 'glm-5.3-flash' }];
    const listed = mount({ attempts: [attempt(1)] });
    expect(listed.role('model-picker')).toBeNull();
    listed.click('other-model');
    expect(listed.intents).toEqual([{ type: 'picker', open: true }]);

    listed.apply({ type: 'models', models, otherModel: 'p:glm-5.3-flash' }, { type: 'picker', open: true });
    const select = listed.role('model-picker');
    expect(select.tagName).toBe('SELECT');
    expect(select.closest('label').textContent).toContain('Malli:');
    expect(Array.from(select.options).map((option) => [option.value, option.textContent])).toEqual([
      ['p:glm-5.3', 'glm-5.3'], ['p:glm-5.3-flash', 'glm-5.3-flash']
    ]);
    expect(select.value).toBe('p:glm-5.3-flash');   // the stored other model
    expect(listed.role('run-model').textContent).toBe('Aja');
    listed.click('run-model');

    // The author's own pick survives a re-render
    select.value = 'p:glm-5.3';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    listed.apply({ type: 'note', note: 'x' });
    expect(listed.role('model-picker').value).toBe('p:glm-5.3');
    listed.click('run-model');
    listed.click('other-model');

    expect(listed.intents.slice(1)).toEqual([
      { type: 'try-model', modelId: 'p:glm-5.3-flash' },
      { type: 'try-model', modelId: 'p:glm-5.3' },
      { type: 'picker', open: false }
    ]);

    // No list (Claude direct): the model id is typed
    const typed = mount({ attempts: [attempt(1)] });
    typed.apply({ type: 'models', models: [], otherModel: null }, { type: 'picker', open: true });
    const input = typed.role('model-picker');
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('placeholder')).toBe('Mallin tunnus');
    typed.click('run-model');                       // nothing typed: nothing to run
    input.value = '  claude-fable-5  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    typed.click('run-model');
    typed.key(input, 'Enter');
    expect(typed.intents).toEqual([
      { type: 'try-model', modelId: 'claude-fable-5' },
      { type: 'try-model', modelId: 'claude-fable-5' }
    ]);
  });
});

describe('error and blocked', () => {
  test('error shows the reason text and can show the raw answer', () => {
    const prompt = mount();
    prompt.type('Tiivistä tämä');
    const message = 'Ei ehdotusta: vastauksesta puuttuu sulkeva </teksti>-tagi. Vastaus katkesi tai malli vastasi muulla kuin muokatulla tekstillä.';
    const detail = `Valitettavasti en voi auttaa tässä. ${'ö'.repeat(500)}`;
    prompt.apply({ type: 'send', instruction: 'Tiivistä tämä' }, { type: 'fail', error: { code: 'missing_tag', message, detail } });

    const error = prompt.role('error');
    expect(error.getAttribute('role')).toBe('alert');
    // The reason is shown as it is: nothing is put in front of it
    expect(error.textContent).toBe(message);
    expect(prompt.view.dom.textContent).not.toContain('Ei ehdotusta.');

    expect(prompt.role('detail')).toBeNull();
    expect(prompt.role('detail-toggle').textContent).toBe('Näytä mallin vastaus');
    prompt.click('detail-toggle');
    expect(prompt.role('detail-toggle').textContent).toBe('Kätke mallin vastaus');
    expect(prompt.role('detail').textContent).toBe(detail.slice(0, 400));
    prompt.click('detail-toggle');
    expect(prompt.role('detail')).toBeNull();

    // The instruction is back in the field, with the three ways on
    expect(prompt.view.field.value).toBe('Tiivistä tämä');
    expect(prompt.role('retry').textContent).toBe('Yritä uudelleen');
    expect(prompt.role('other-model').textContent).toBe('Kokeile toisella mallilla');
    expect(prompt.role('close').textContent).toBe('Sulje');
    prompt.click('retry');
    prompt.key(prompt.view.field, 'Enter');
    expect(prompt.intents).toEqual([{ type: 'retry' }, { type: 'submit', instruction: 'Tiivistä tämä' }]);
  });

  test('an error without a raw answer offers no detail link, and a new error closes the detail again', () => {
    const prompt = mount();
    prompt.apply({ type: 'send', instruction: 'x' }, { type: 'fail', error: { code: 'changed', message: 'Teksti muuttui pyynnön aikana. Ehdotuksia ei tehty. Lähetä ohje uudelleen.', detail: '' } });
    expect(prompt.role('detail-toggle')).toBeNull();

    prompt.apply({ type: 'send', instruction: 'x' }, { type: 'fail', error: { code: 'empty', message: 'Ei ehdotusta: malli palautti tyhjän tekstin.', detail: 'raaka vastaus' } });
    prompt.click('detail-toggle');
    expect(prompt.role('detail').textContent).toBe('raaka vastaus');
    prompt.apply({ type: 'send', instruction: 'x' }, { type: 'fail', error: { code: 'empty', message: 'Ei ehdotusta: malli palautti tyhjän tekstin.', detail: 'toinen vastaus' } });
    expect(prompt.role('detail')).toBeNull();
  });

  test('blocked shows only the message and Sulje', () => {
    const message = 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.';
    const prompt = mount();
    prompt.apply({ type: 'block', code: 'noAI', message });

    expect(prompt.role('blocked').textContent).toBe(message);
    expect(prompt.view.field.hidden).toBe(true);
    expect(prompt.view.contextSlot.hidden).toBe(true);
    const buttons = Array.from(prompt.view.dom.querySelectorAll('button'));
    expect(buttons.map((button) => button.textContent)).toEqual(['Sulje']);
    expect(prompt.view.dom.querySelectorAll('select, input')).toHaveLength(0);
    // Everything visible is the message and the button
    const visible = Array.from(prompt.view.dom.children).filter((node) => !node.hidden).map((node) => node.textContent).join('');
    expect(visible).toBe(`${message}Sulje`);

    prompt.click('close');
    prompt.key(prompt.role('close'), 'Escape');
    expect(prompt.intents).toEqual([{ type: 'close', reason: 'button' }, { type: 'close', reason: 'escape' }]);
  });

  test('the Sulje button of result, error and blocked names Esc in its tooltip', () => {
    // Esc closes the prompt too, so each of the three Sulje buttons says so
    const closeOf = (prompt) => {
      const close = prompt.role('close');
      return [close.textContent, close.getAttribute('title')];
    };
    const result = mount({ attempts: [attempt(1)] });
    expect(closeOf(result)).toEqual(['Sulje', 'Sulje (Esc)']);

    const failed = mount();
    failed.apply({ type: 'send', instruction: 'x' }, { type: 'fail', error: { code: 'empty', message: 'Ei ehdotusta: malli palautti tyhjän tekstin.', detail: '' } });
    expect(closeOf(failed)).toEqual(['Sulje', 'Sulje (Esc)']);

    const blocked = mount();
    blocked.apply({ type: 'block', code: 'noAI', message: 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.' });
    expect(closeOf(blocked)).toEqual(['Sulje', 'Sulje (Esc)']);
    // Only these three phases draw a Sulje button
    expect(result.roles('close')).toHaveLength(1);
    expect(failed.roles('close')).toHaveLength(1);
    expect(blocked.roles('close')).toHaveLength(1);
  });
});

describe('review fixes (I-05)', () => {
  const REASON = 'Teksti on liian pitkä tälle mallille: noin 296 tokenia, tilaa 244. Lyhennä valintaa tai vaihda mallia.';

  test('a request that cannot fit the model disables Lähetä and the chips, each saying why', () => {
    const saved = [{ id: 'user-1', label: 'Säilytä murre', prompt: 'Älä yleiskielistä vuorosanoja.', created: 1 }];
    const prompt = mount({ actions: chips('fiction', saved) });
    expect(prompt.role('send').disabled).toBe(false);
    expect(prompt.role('send').hasAttribute('title')).toBe(false);

    prompt.apply({ type: 'send-blocked', reason: REASON });
    expect(prompt.role('send').disabled).toBe(true);
    expect(prompt.role('send').getAttribute('title')).toBe(REASON);
    for (const chip of prompt.roles('chip')) {
      expect(chip.disabled).toBe(true);
      expect(chip.getAttribute('title')).toBe(REASON);
    }
    // A disabled control sends nothing; deleting a saved prompt is not sending
    prompt.click('send');
    prompt.roles('chip')[0].click();
    expect(prompt.intents).toEqual([]);
    expect(prompt.role('delete-prompt').disabled).toBe(false);

    // A build that fits again
    prompt.apply({ type: 'send-blocked', reason: null });
    expect(prompt.role('send').disabled).toBe(false);
    expect(prompt.roles('chip').every((chip) => !chip.disabled)).toBe(true);
  });

  test('write mode: Kirjoita is disabled the same way', () => {
    const prompt = mount({ mode: 'write', kind: 'cursor' });
    prompt.apply({ type: 'send-blocked', reason: REASON });
    expect(prompt.role('send').textContent).toBe('Kirjoita');
    expect(prompt.role('send').disabled).toBe(true);
  });

  test('the change count is one unit of the summary that a line break never parts', () => {
    const prompt = mount({ attempts: [attempt(1, { changeCount: 2 })] });
    const count = prompt.role('summary').querySelector('.cm-faust-prompt-count');
    expect(count.textContent).toBe('2 muutosta');
    expect(prompt.role('summary').textContent).toBe('Tiivistä · deepseek-v4.1-flash · 2 muutosta');
    const none = mount({ attempts: [attempt(1, { changeCount: 0 })] });
    expect(none.role('summary').querySelector('.cm-faust-prompt-count').textContent).toBe('Ei muutoksia');
    // No count yet: no empty span
    const unknown = mount({ attempts: [attempt(1, { changeCount: null })] });
    expect(unknown.role('summary').querySelector('.cm-faust-prompt-count')).toBeNull();
    expect(unknown.role('summary').textContent).toBe('Tiivistä · deepseek-v4.1-flash');
  });

  test('the field has its own undo history: steps back and forward, and nothing past its first edit', () => {
    const prompt = mount();
    const field = prompt.view.field;
    expect(typeof field.faustHistory).toBe('function');
    // Nothing typed: nothing to undo, and nothing changes (the browser's undo is never asked)
    expect(field.faustHistory('undo')).toBe(false);
    prompt.type('T');
    prompt.type('Ti');
    prompt.type('Tii');
    expect(prompt.role('save-prompt').disabled).toBe(false);
    expect(field.faustHistory('undo')).toBe(true);
    expect(field.value).toBe('Ti');
    expect(field.faustHistory('redo')).toBe(true);
    expect(field.value).toBe('Tii');
    expect(field.faustHistory('redo')).toBe(false);
    for (let n = 0; n < 3; n += 1) field.faustHistory('undo');
    expect(field.value).toBe('');
    expect(prompt.role('save-prompt').disabled).toBe(true);
    expect(field.faustHistory('undo')).toBe(false);
    expect(field.value).toBe('');
    // A new edit drops what could be redone
    prompt.type('x');
    expect(field.faustHistory('redo')).toBe(false);
    // The instruction put back after a stop keeps the steps that led to it
    prompt.apply({ type: 'send', instruction: 'x' }, { type: 'cancelled' });
    expect(field.value).toBe('x');
    expect(field.faustHistory('undo')).toBe(true);
    expect(field.value).toBe('');
    // Undo never emits an intent
    expect(prompt.intents).toEqual([]);
    prompt.view.destroy();
    expect(field.faustHistory).toBeUndefined();
  });

  // Final-pass review: the prompt undid one character per Kumoa while every other field undid by words
  test('the field undoes typing by words, as the app\'s other text fields do (fieldHistory.createStepLog)', () => {
    const prompt = mount();
    const field = prompt.view.field;
    const typeChars = (text) => {
      for (const ch of text) {
        field.value += ch;
        field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
      }
    };
    typeChars('Tee tästä');
    typeChars(' lyhyempi');
    expect(field.faustHistory('undo')).toBe(true);
    expect(field.value).toBe('Tee tästä ');
    expect(field.faustHistory('undo')).toBe(true);
    expect(field.value).toBe('Tee ');
    expect(field.faustHistory('redo')).toBe(true);
    expect(field.value).toBe('Tee tästä ');
    // A delete run is one step
    for (let n = 0; n < 3; n += 1) {
      field.value = field.value.slice(0, -1);
      field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    }
    expect(field.value).toBe('Tee täs');
    expect(field.faustHistory('undo')).toBe(true);
    expect(field.value).toBe('Tee tästä ');
    expect(prompt.intents).toEqual([]);
  });

  test('the model picker\'s label ends in a colon (M B.19)', () => {
    const prompt = mount({ attempts: [attempt(1)], models: [{ id: 'p:glm', name: 'glm' }], pickerOpen: true });
    expect(prompt.role('model-picker').closest('label').firstChild.textContent).toBe('Malli:');
  });
});

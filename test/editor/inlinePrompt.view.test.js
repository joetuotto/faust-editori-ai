/**
 * @jest-environment jsdom
 */
// The inline prompt's editor core against a real EditorView. CodeMirror comes
// from its CommonJS build here, in a test file; the core itself never requires it.
const fs = require('fs');
const path = require('path');
const cmState = require('@codemirror/state');
const cmView = require('@codemirror/view');
const { createInlinePromptKit } = require('../../src/editor/inlinePromptCore');
const { createState, reduce } = require('../../src/editor/inlinePromptState');

const { EditorState, StateField, StateEffect } = cmState;
const { EditorView, Decoration, showTooltip, ViewPlugin } = cmView;
const cm = { StateField, StateEffect, EditorView, Decoration, showTooltip, ViewPlugin };

// jsdom has no layout: give CodeMirror's measuring code something to read when a frame runs
const rangeProto = window.Range.prototype;
if (!rangeProto.getClientRects) rangeProto.getClientRects = () => [];
if (!rangeProto.getBoundingClientRect) {
  rangeProto.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
}

const DOC = 'Ensimmäinen kappale on tässä.\nÅke käveli öisin – hitaasti ja ”ääneti”.\nKolmas kappale.';
const FROM = DOC.indexOf('Åke');
const TO = DOC.indexOf('\nKolmas');

// ---------------------------------------------------------------------------
// The layer that owns the captured ranges
// ---------------------------------------------------------------------------

// A field of the test's own: its value has `ranges`, mapped through changes
function stubLayer() {
  const add = StateEffect.define();
  const remove = StateEffect.define();
  let counter = 0;
  const field = StateField.define({
    create: () => ({ ranges: [] }),
    update(value, tr) {
      let ranges = value.ranges;
      if (tr.docChanged) {
        ranges = ranges.map((range) => {
          const from = tr.changes.mapPos(range.from, 1);
          return { ...range, from, to: Math.max(from, tr.changes.mapPos(range.to, -1)) };
        });
      }
      for (const effect of tr.effects) {
        if (effect.is(add)) ranges = ranges.concat([effect.value]);
        if (effect.is(remove)) ranges = ranges.filter((range) => range.id !== effect.value);
      }
      return ranges === value.ranges ? value : { ranges };
    }
  });
  return {
    name: 'a range field of the test',
    field,
    extension: field,
    install() {},
    capture(view, from, to) {
      const id = `r${++counter}`;
      view.dispatch({ effects: add.of({ id, from, to, text: view.state.sliceDoc(from, to), highlight: true }) });
      return id;
    },
    release(view, id) {
      view.dispatch({ effects: remove.of(id) });
    }
  };
}

// The suggestion layer's own field, when that package is in the tree
function kitLayer() {
  const { createSuggestionKit } = require('../../src/editor/suggestionsCore.js');
  const suggestions = createSuggestionKit({
    StateField,
    StateEffect,
    Annotation: cmState.Annotation,
    Prec: cmState.Prec,
    EditorView,
    Decoration,
    WidgetType: cmView.WidgetType,
    keymap: cmView.keymap
  });
  const External = cmState.Annotation.define();
  const diff = (a, b) => (a === b ? [] : [{ from: 0, to: a.length, insert: b, original: a }]);
  return {
    name: 'the field of suggestionsCore.js',
    field: suggestions.suggestionField,
    extension: suggestions.suggestionExtension({ external: External, diff }),
    install(view) {
      suggestions.installSuggestionFacade(view, view.scrollDOM);
    },
    capture: (view, from, to) => view.scrollDOM.captureRange(from, to, { highlight: true }).rangeId,
    release: (view, id) => view.scrollDOM.releaseRange(id)
  };
}

const layers = [stubLayer()];
let kitProblem = null;
if (fs.existsSync(path.join(__dirname, '../../src/editor/suggestionsCore.js'))) {
  try {
    layers.push(kitLayer());
  } catch (error) {
    // Another package of the same change, possibly still being written
    kitProblem = error;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let open = [];

function setup(layer, doc = DOC) {
  const intents = [];
  const host = { handle: jest.fn((intent, view) => intents.push({ ...intent, view })) };
  const kit = createInlinePromptKit(cm, { suggestionField: layer.field });
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [layer.extension, kit.inlinePrompt({ host: () => host })] }),
    parent
  });
  layer.install(view);
  open.push({ view, parent });

  const types = () => intents.map((intent) => intent.type);
  const promptDom = () => view.dom.querySelector('.cm-tooltip.cm-faust-prompt');
  const field = () => view.dom.querySelector('.cm-faust-prompt [data-role="field"]');
  const tooltips = () => view.state.facet(showTooltip).filter(Boolean);
  const openEdit = (ui = createState()) => {
    const rangeId = layer.capture(view, FROM, TO);
    const opened = kit.openPrompt(view, { mode: 'edit', rangeId, ui });
    return { rangeId, opened };
  };
  return { view, kit, host, intents, types, promptDom, field, tooltips, openEdit, parent };
}

const pressEscape = (target) => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const resultState = () => createState({ attempts: [{ id: 'a1', title: 'Tiivistä', modelName: 'malli', changeCount: 3, note: null }] });

afterEach(() => {
  for (const { view, parent } of open) {
    view.destroy();
    parent.remove();
  }
  open = [];
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------

describe.each(layers.map((layer) => [layer.name, layer]))('inline prompt with %s', (_name, layer) => {
  test('openPrompt shows the prompt at the end of the captured range and focuses its field', () => {
    const editor = setup(layer);
    const effects = [];
    const dispatch = jest.spyOn(editor.view, 'dispatch');

    const ui = createState();
    const { rangeId, opened } = editor.openEdit(ui);
    for (const [spec] of dispatch.mock.calls) effects.push(...[].concat(spec.effects || []));

    expect(opened).toBe(true);
    expect(editor.promptDom()).not.toBeNull();
    expect(editor.promptDom().getAttribute('role')).toBe('dialog');

    // One tooltip, under the end of the target, never above it
    expect(editor.tooltips()).toHaveLength(1);
    expect(editor.tooltips()[0]).toMatchObject({ pos: TO, above: false, strictSide: false, arrow: false });

    expect(editor.field()).not.toBeNull();
    expect(document.activeElement).toBe(editor.field());
    expect(editor.kit.getPrompt(editor.view)).toEqual({ mode: 'edit', rangeId, from: FROM, to: TO, ui });

    // Room is made for the prompt under the target
    const scroll = effects.find((effect) => effect.value && effect.value.yMargin === 220);
    expect(scroll).toBeDefined();
    expect(scroll.value.y).toBe('nearest');
    expect(scroll.value.range.head).toBe(TO);
  });

  test('openPrompt on a missing range, or on an empty range in edit mode, opens nothing', () => {
    const editor = setup(layer);
    expect(editor.kit.openPrompt(editor.view, { mode: 'edit', rangeId: 'ei-ole', ui: createState() })).toBe(false);
    const caret = layer.capture(editor.view, FROM, FROM);
    expect(editor.kit.openPrompt(editor.view, { mode: 'edit', rangeId: caret, ui: createState() })).toBe(false);
    expect(editor.promptDom()).toBeNull();
    expect(editor.kit.getPrompt(editor.view)).toBeNull();
    expect(editor.kit.focusPrompt(editor.view)).toBe(false);
    expect(editor.kit.updatePrompt(editor.view, createState())).toBe(false);
    expect(editor.kit.closePrompt(editor.view, { restore: 'selection' })).toBe(false);
  });

  test('a write prompt stays open on a caret, and typing before it moves it along', () => {
    const editor = setup(layer);
    const caret = layer.capture(editor.view, TO, TO);
    expect(editor.kit.openPrompt(editor.view, { mode: 'write', rangeId: caret, ui: createState({ mode: 'write', kind: 'cursor' }) })).toBe(true);
    expect(editor.promptDom().getAttribute('aria-label')).toBe('Kirjoita kohdistimeen');
    expect(editor.kit.getPrompt(editor.view)).toMatchObject({ mode: 'write', from: TO, to: TO });

    editor.view.dispatch({ changes: { from: 0, insert: 'Alku. ' } });
    expect(editor.kit.getPrompt(editor.view)).toMatchObject({ from: TO + 6, to: TO + 6 });
    expect(editor.promptDom()).not.toBeNull();
  });

  test('the prompt keeps the same DOM element while text is typed in front of the range', () => {
    const editor = setup(layer);
    editor.openEdit();
    const dom = editor.promptDom();
    const field = editor.field();
    field.value = 'kesken oleva ohje';

    editor.view.dispatch({ changes: { from: 0, insert: 'Uusi alku. ' } });
    editor.view.dispatch({ changes: { from: 3, insert: 'ä' } });

    expect(editor.promptDom()).toBe(dom);
    expect(dom.isConnected).toBe(true);
    expect(editor.field()).toBe(field);
    expect(field.value).toBe('kesken oleva ohje');
    expect(document.activeElement).toBe(field);
    // The target moved with the text, and the tooltip with the target
    expect(editor.kit.getPrompt(editor.view)).toMatchObject({ from: FROM + 12, to: TO + 12 });
    expect(editor.tooltips()[0].pos).toBe(TO + 12);
    expect(editor.view.state.sliceDoc(FROM + 12, TO + 12)).toBe(DOC.slice(FROM, TO));
    expect(editor.types()).not.toContain('prompt-closed');
  });

  test('updatePrompt redraws the open prompt, and the root is marked busy while sending', () => {
    const editor = setup(layer);
    editor.openEdit();
    const dom = editor.promptDom();
    expect(dom.classList.contains('cm-faust-prompt-busy')).toBe(false);

    const sending = reduce(createState(), { type: 'send', instruction: 'Tiivistä', title: 'Tiivistä' });
    expect(editor.kit.updatePrompt(editor.view, sending)).toBe(true);
    expect(editor.promptDom()).toBe(dom);
    expect(dom.classList.contains('cm-faust-prompt-busy')).toBe(true);
    expect(dom.querySelector('[data-role="status"]').textContent).toBe('Odotetaan mallia…');
    expect(editor.kit.getPrompt(editor.view).ui).toBe(sending);

    editor.kit.updatePrompt(editor.view, reduce(sending, { type: 'cancelled' }));
    expect(dom.classList.contains('cm-faust-prompt-busy')).toBe(false);
    expect(dom.querySelector('[data-role="note"]').textContent).toBe('Pyyntö pysäytettiin.');
  });

  test('the prompt stays in place through the editor\'s measure passes', async () => {
    const editor = setup(layer);
    editor.openEdit();
    const dom = editor.promptDom();
    // Two frames: the tooltip is measured and placed, then measured again after a change
    await nextFrame();
    editor.view.dispatch({ changes: { from: 0, insert: 'Alku. ' } });
    await nextFrame();
    await nextFrame();
    expect(editor.promptDom()).toBe(dom);
    expect(dom.classList.contains('cm-tooltip')).toBe(true);
    expect(dom.isConnected).toBe(true);
    expect(document.activeElement).toBe(editor.field());
    expect(editor.types()).not.toContain('prompt-closed');
  });

  test('what the author does in the prompt reaches the host with the editor it belongs to', () => {
    const editor = setup(layer);
    editor.openEdit();
    const field = editor.field();
    field.value = 'Tiivistä vähän';
    const before = editor.view.state.doc.toString();
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    const submit = editor.intents.find((intent) => intent.type === 'submit');
    expect(submit).toEqual({ type: 'submit', instruction: 'Tiivistä vähän', view: editor.view });
    // A key pressed in the field is not a key pressed in the manuscript
    expect(editor.view.state.doc.toString()).toBe(before);
  });

  test('focusPrompt puts the focus back into the field', () => {
    const editor = setup(layer);
    editor.openEdit(resultState());
    editor.view.focus();
    expect(document.activeElement).not.toBe(editor.field());
    expect(editor.kit.focusPrompt(editor.view)).toBe(true);
    expect(document.activeElement).toBe(editor.field());
  });

  test('the prompt closes when its range is deleted', () => {
    const editor = setup(layer);
    editor.openEdit();
    editor.view.focus();
    expect(editor.promptDom()).not.toBeNull();

    editor.view.dispatch({ changes: { from: FROM, to: TO, insert: '' } });
    expect(editor.kit.getPrompt(editor.view)).toBeNull();
    expect(editor.promptDom()).toBeNull();
    expect(editor.tooltips()).toHaveLength(0);
    expect(editor.types()).toContain('prompt-closed');
  });

  test('the prompt closes when its range is released', () => {
    const editor = setup(layer);
    const { rangeId } = editor.openEdit();
    layer.release(editor.view, rangeId);
    expect(editor.kit.getPrompt(editor.view)).toBeNull();
    expect(editor.promptDom()).toBeNull();
    expect(editor.types()).toContain('prompt-closed');
  });

  test('a prompt that closed with its target gives the focus back when the author was in its field', async () => {
    const editor = setup(layer);
    editor.openEdit();
    expect(document.activeElement).toBe(editor.field());
    // Something else than the author's typing removes the target (an undo of the project history, for example)
    editor.view.dispatch({ changes: { from: FROM, to: TO, insert: '' } });
    expect(editor.promptDom()).toBeNull();
    // The removed field left the focus on <body>; it is given back after the update
    expect(document.activeElement).toBe(document.body);
    await nextTask();
    expect(document.activeElement).toBe(editor.view.contentDOM);
  });

  test('closing the prompt returns the focus to the manuscript in all three restore modes', () => {
    const expected = {
      selection: { from: FROM, to: TO },
      cursor: { from: TO, to: TO },
      none: { from: 2, to: 2 }
    };
    for (const restore of ['selection', 'cursor', 'none']) {
      const editor = setup(layer);
      editor.view.dispatch({ selection: { anchor: 2 } });
      editor.openEdit();
      expect(document.activeElement).toBe(editor.field());
      const focus = jest.spyOn(editor.view, 'focus');

      expect(editor.kit.closePrompt(editor.view, { restore })).toBe(true);

      expect(focus).toHaveBeenCalledTimes(1);
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(editor.view.contentDOM);
      expect(editor.promptDom()).toBeNull();
      const { from, to } = editor.view.state.selection.main;
      expect({ from, to }).toEqual(expected[restore]);
    }
  });

  test('closing while the focus is outside the prompt does not move the focus', () => {
    const editor = setup(layer);
    editor.openEdit();
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    const focus = jest.spyOn(editor.view, 'focus');

    editor.kit.closePrompt(editor.view, { restore: 'cursor' });
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(elsewhere);

    // The same with the focus in the manuscript: it is already where it belongs
    const second = setup(layer);
    second.openEdit();
    second.view.focus();
    const again = jest.spyOn(second.view, 'focus');
    second.kit.closePrompt(second.view);
    expect(again).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(second.view.contentDOM);
  });

  test('Esc in the manuscript with an open prompt asks to close and does not reach a window listener', () => {
    const editor = setup(layer);
    editor.openEdit();
    editor.view.focus();
    const onWindow = jest.fn();
    window.addEventListener('keydown', onWindow);
    try {
      const event = pressEscape(editor.view.contentDOM);
      expect(onWindow).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
      expect(editor.intents[editor.intents.length - 1]).toEqual({ type: 'close', reason: 'escape', view: editor.view });

      // While a request runs the same key cancels it
      editor.kit.updatePrompt(editor.view, reduce(createState(), { type: 'send', instruction: 'x' }));
      pressEscape(editor.view.contentDOM);
      expect(editor.intents[editor.intents.length - 1]).toEqual({ type: 'cancel', view: editor.view });
      expect(onWindow).not.toHaveBeenCalled();
      // Escape never asks to accept or reject anything
      expect(editor.types().some((type) => /accept|reject/.test(type))).toBe(false);
    } finally {
      window.removeEventListener('keydown', onWindow);
    }
  });

  test('Esc in the manuscript with a streaming block asks to stop it and does not reach a window listener', () => {
    const editor = setup(layer);
    editor.view.scrollDOM.getInsertBlock = () => ({ status: 'streaming' });
    editor.view.focus();
    const onWindow = jest.fn();
    window.addEventListener('keydown', onWindow);
    try {
      const event = pressEscape(editor.view.contentDOM);
      expect(onWindow).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
      expect(editor.intents[editor.intents.length - 1]).toEqual({ type: 'block-stop', view: editor.view });
    } finally {
      window.removeEventListener('keydown', onWindow);
    }
  });

  test('Esc with neither is not handled', () => {
    const editor = setup(layer);
    editor.view.focus();
    const onWindow = jest.fn();
    window.addEventListener('keydown', onWindow);
    try {
      // No block at all, and a block that has finished
      editor.view.scrollDOM.getInsertBlock = () => null;
      const first = pressEscape(editor.view.contentDOM);
      editor.view.scrollDOM.getInsertBlock = () => ({ status: 'done' });
      const second = pressEscape(editor.view.contentDOM);

      expect(first.defaultPrevented).toBe(false);
      expect(second.defaultPrevented).toBe(false);
      expect(onWindow).toHaveBeenCalledTimes(2);
      expect(editor.types().filter((type) => type !== 'view-ready')).toEqual([]);
    } finally {
      window.removeEventListener('keydown', onWindow);
    }
  });

  test('a right click reports the point and whether manuscript text is selected, and the native menu still opens', () => {
    const editor = setup(layer);
    const click = () => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 80 });
      editor.view.contentDOM.dispatchEvent(event);
      return event;
    };

    document.getSelection().removeAllRanges();
    const bare = click();
    expect(bare.defaultPrevented).toBe(false);
    expect(editor.intents[editor.intents.length - 1]).toEqual({ type: 'contextmenu', x: 120, y: 80, hasSelection: false, view: editor.view });

    // A selection inside the manuscript
    const textNode = editor.view.contentDOM.querySelector('.cm-line').firstChild;
    document.getSelection().setBaseAndExtent(textNode, 0, textNode, 11);
    click();
    expect(editor.intents[editor.intents.length - 1]).toMatchObject({ type: 'contextmenu', hasSelection: true });

    // A selection somewhere else on the page is not the manuscript's
    const outside = document.createElement('p');
    outside.textContent = 'Muistiinpano sivupaneelissa';
    document.body.appendChild(outside);
    document.getSelection().setBaseAndExtent(outside.firstChild, 0, outside.firstChild, 5);
    click();
    expect(editor.intents[editor.intents.length - 1]).toMatchObject({ type: 'contextmenu', hasSelection: false });
  });

  test('the result tick is scheduled, not sent during the update', async () => {
    const editor = setup(layer);
    await nextTask();   // view-ready is out of the way
    editor.openEdit(resultState());
    editor.intents.length = 0;

    editor.view.dispatch({ selection: { anchor: 1 } });
    editor.view.dispatch({ changes: { from: 0, insert: 'A' } });
    editor.view.dispatch({ selection: { anchor: 2 } });
    // Nothing yet: a view cannot be dispatched to during its own update
    expect(editor.types()).not.toContain('tick');

    await nextTask();
    // Three updates, one question
    expect(editor.types().filter((type) => type === 'tick')).toHaveLength(1);
    expect(editor.intents.find((intent) => intent.type === 'tick').view).toBe(editor.view);

    editor.view.dispatch({ selection: { anchor: 3 } });
    await nextTask();
    expect(editor.types().filter((type) => type === 'tick')).toHaveLength(2);
  });

  test('no tick is sent before a result, nor after the prompt has closed', async () => {
    const editor = setup(layer);
    await nextTask();
    editor.openEdit(createState());
    editor.intents.length = 0;
    editor.view.dispatch({ selection: { anchor: 1 } });
    await nextTask();
    expect(editor.types()).not.toContain('tick');

    editor.kit.updatePrompt(editor.view, resultState());
    editor.view.dispatch({ selection: { anchor: 2 } });
    editor.kit.closePrompt(editor.view);
    await nextTask();
    expect(editor.types()).not.toContain('tick');
  });

  test('destroying the tooltip reports prompt-closed', () => {
    const editor = setup(layer);
    editor.openEdit();
    expect(editor.types()).not.toContain('prompt-closed');

    // Closed by the controller
    editor.kit.closePrompt(editor.view);
    expect(editor.types().filter((type) => type === 'prompt-closed')).toHaveLength(1);
    expect(editor.intents.find((intent) => intent.type === 'prompt-closed').view).toBe(editor.view);

    // Destroyed with its editor
    editor.openEdit();
    editor.view.destroy();
    expect(editor.types().filter((type) => type === 'prompt-closed')).toHaveLength(2);
    expect(editor.types()).toContain('view-destroyed');
  });

  test('a host that throws in prompt-closed does not stop later prompts', () => {
    const editor = setup(layer);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      editor.host.handle.mockImplementationOnce(() => { throw new Error('host'); });
      editor.openEdit();
      // The first intent the host sees is prompt-closed, from the tooltip's destroy
      editor.kit.closePrompt(editor.view);
      expect(editor.promptDom()).toBeNull();
      expect(errors.mock.calls.some((call) => /CodeMirror plugin crashed/.test(String(call[0])))).toBe(false);

      const { opened } = editor.openEdit();
      expect(opened).toBe(true);
      expect(editor.promptDom()).not.toBeNull();
      expect(editor.kit.focusPrompt(editor.view)).toBe(true);
    } finally {
      errors.mockRestore();
    }
  });

  test('the editor announces itself after its constructor, and its end at once', async () => {
    const editor = setup(layer);
    expect(editor.types()).toEqual([]);
    await nextTask();
    expect(editor.intents).toEqual([{ type: 'view-ready', view: editor.view }]);
    editor.view.destroy();
    expect(editor.types()).toEqual(['view-ready', 'view-destroyed']);

    // An editor that goes away before the timer never says it is ready
    const brief = setup(layer);
    brief.view.destroy();
    await nextTask();
    expect(brief.types()).toEqual(['view-destroyed']);
  });

  test('a missing host is not an error', async () => {
    const kit = createInlinePromptKit(cm, { suggestionField: layer.field });
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({ doc: DOC, extensions: [layer.extension, kit.inlinePrompt({ host: () => null })] }),
      parent
    });
    layer.install(view);
    open.push({ view, parent });

    const rangeId = layer.capture(view, FROM, TO);
    expect(kit.openPrompt(view, { mode: 'edit', rangeId, ui: createState() })).toBe(true);
    expect(() => pressEscape(view.contentDOM)).not.toThrow();
    await nextTask();
    expect(() => kit.closePrompt(view)).not.toThrow();
  });
});

describe('the core as a module', () => {
  if (kitProblem) {
    test.todo(`run these cases against src/editor/suggestionsCore.js as well (it does not load yet: ${String(kitProblem.message).slice(0, 80)})`);
  }

  test('a custom prompt view can be passed in', () => {
    const layer = stubLayer();
    const calls = [];
    const createPromptView = (doc, { onIntent }) => {
      const dom = doc.createElement('div');
      dom.className = 'cm-faust-prompt';
      return {
        dom,
        field: null,
        contextSlot: null,
        render: (ui) => calls.push(['render', ui.phase]),
        focus: () => calls.push(['focus']),
        destroy: () => calls.push(['destroy']),
        onIntent
      };
    };
    const kit = createInlinePromptKit(cm, { suggestionField: layer.field, createPromptView });
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({ state: EditorState.create({ doc: DOC, extensions: [layer.extension, kit.inlinePrompt({ host: () => null })] }), parent });
    open.push({ view, parent });

    const rangeId = layer.capture(view, FROM, TO);
    kit.openPrompt(view, { mode: 'edit', rangeId, ui: createState() });
    const idle = kit.getPrompt(view).ui;
    kit.updatePrompt(view, idle);                                   // the same state: nothing to draw
    kit.updatePrompt(view, reduce(idle, { type: 'send', instruction: 'x' }));
    kit.closePrompt(view);
    expect(calls).toEqual([['render', 'idle'], ['focus'], ['render', 'sending'], ['destroy']]);
  });

  test('the kit needs the field of the suggestion layer', () => {
    expect(() => createInlinePromptKit(cm, {})).toThrow(TypeError);
  });

  test('no source file of this package requires CodeMirror', () => {
    const files = [
      'src/editor/inlinePromptCore.js',
      'src/editor/inlinePromptView.js',
      'src/editor/inlinePromptState.js',
      'src/editor/promptTarget.js',
      'src/services/ai/actions.js',
      'src/services/ai/editRequest.js',
      'src/services/ai/quickEdit.js',
      'utils/aiContextMenu.js'
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
      expect(source).not.toMatch(/require\(\s*['"`]@(codemirror|lezer)/);
      expect(source).not.toMatch(/from\s+['"`]@(codemirror|lezer)/);
    }
  });
});

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

    // The target's end is kept in view (room under it is made before the dispatch, see placement)
    const scroll = effects.find((effect) => effect.value && effect.value.yMargin === 16);
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

describe('placement: the prompt never covers its target and never runs past the window (I-05 review)', () => {
  const { scrollForRoom } = require('../../src/editor/inlinePromptCore');
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top });

  test('scrollForRoom scrolls the target\'s end up until the prompt fits under it, never further than the text or the target\'s start allow', () => {
    // 1440 × 900: the end line's bottom at 652, a 300 px prompt, the scroller from 60 to 860
    const base = { endBottom: 652, startTop: 564, visibleTop: 60, visibleBottom: 860, height: 300, maxScroll: 913, gap: 16 };
    expect(scrollForRoom(base)).toBe(108);                                   // 652 + 16 + 300 - 860
    expect(scrollForRoom({ ...base, maxScroll: 40 })).toBe(40);              // the end of the document
    expect(scrollForRoom({ ...base, startTop: 120 })).toBe(44);              // the target's start stays in view (120 - 76)
    expect(scrollForRoom({ ...base, endBottom: 400 })).toBe(0);              // room enough already
    expect(scrollForRoom({ ...base, startTop: 70 })).toBe(0);                // a start at the top: nothing to give
    expect(scrollForRoom({ ...base, maxScroll: 0 })).toBe(0);
    expect(scrollForRoom({ ...base, height: NaN })).toBe(0);
  });

  test('the anchor spans the target from its first line to its last, so a prompt flipped above stands over the target\'s start', () => {
    const layer = layers[0];
    const editor = setup(layer);
    editor.openEdit();
    const tip = cmView.getTooltip(editor.view, editor.tooltips()[0]);
    expect(typeof tip.getCoords).toBe('function');
    // Measured in the app: a three-line target, its start at 564, its end line 634 to 652
    const coords = new Map([[FROM, rect(120, 564, 121, 582)], [TO, rect(800, 634, 801, 652)]]);
    jest.spyOn(editor.view, 'coordsAtPos').mockImplementation((pos) => coords.get(pos) || null);
    expect(tip.getCoords(TO)).toEqual({ left: 800, right: 801, top: 564, bottom: 652 });
    // The start out of the rendered text, or on the end's own line: the end alone
    coords.delete(FROM);
    expect(tip.getCoords(TO)).toEqual(rect(800, 634, 801, 652));
    coords.set(FROM, rect(120, 634, 121, 652));
    expect(tip.getCoords(TO)).toEqual(rect(800, 634, 801, 652));
    // The end out of the rendered text: hidden, as before
    coords.delete(TO);
    expect(tip.getCoords(TO)).toBeNull();
    // The prompt is still not resized by CodeMirror (its own content changes; see positioned)
    expect(tip.resize).toBe(false);
  });

  test('a write prompt on a caret is anchored at the caret', () => {
    const layer = layers[0];
    const editor = setup(layer);
    const caret = layer.capture(editor.view, TO, TO);
    editor.kit.openPrompt(editor.view, { mode: 'write', rangeId: caret, ui: createState({ mode: 'write' }) });
    const tip = cmView.getTooltip(editor.view, editor.tooltips()[0]);
    jest.spyOn(editor.view, 'coordsAtPos').mockImplementation((pos, side) => (pos === TO && side === 1 ? rect(5, 10, 6, 28) : null));
    expect(tip.getCoords(TO)).toEqual(rect(5, 10, 6, 28));
  });

  test('a result makes room again under a prompt below its target, never over one above it', async () => {
    const layer = layers[0];
    const editor = setup(layer);
    const scroller = editor.view.scrollDOM;
    let top = 0;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => top, set: (value) => { top = value; } });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => 2000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => 800 });
    jest.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(rect(0, 60, 1440, 700));
    // The end line low enough that no room is made when the prompt opens (its start at the top)
    const coords = new Map([[FROM, rect(120, 70, 121, 88)], [TO, rect(800, 400, 801, 418)]]);
    jest.spyOn(editor.view, 'coordsAtPos').mockImplementation((pos) => coords.get(pos) || null);
    editor.openEdit();
    expect(top).toBe(0);                                                     // 418 + 16 + 300 - 644 = 90, but the start may not move
    coords.set(FROM, rect(120, 300, 121, 318));
    const tip = cmView.getTooltip(editor.view, editor.tooltips()[0]);
    jest.spyOn(tip.dom, 'getBoundingClientRect').mockReturnValue(rect(0, 418, 520, 718));

    editor.kit.updatePrompt(editor.view, resultState());
    await nextFrame();
    await nextFrame();
    expect(top).toBe(90);                                                    // 418 + 16 + 300 - 644

    // Above its target: no scroll
    const above = setup(layer);
    let aboveTop = 0;
    Object.defineProperty(above.view.scrollDOM, 'scrollTop', { configurable: true, get: () => aboveTop, set: (value) => { aboveTop = value; } });
    Object.defineProperty(above.view.scrollDOM, 'scrollHeight', { configurable: true, get: () => 2000 });
    Object.defineProperty(above.view.scrollDOM, 'clientHeight', { configurable: true, get: () => 800 });
    jest.spyOn(above.view.scrollDOM, 'getBoundingClientRect').mockReturnValue(rect(0, 60, 1440, 700));
    jest.spyOn(above.view, 'coordsAtPos').mockImplementation((pos) => (pos === FROM ? rect(120, 70, 121, 88) : pos === TO ? rect(800, 400, 801, 418) : null));
    above.openEdit();
    const aboveTip = cmView.getTooltip(above.view, above.tooltips()[0]);
    aboveTip.dom.classList.add('cm-tooltip-above');
    above.kit.updatePrompt(above.view, resultState());
    await nextFrame();
    await nextFrame();
    expect(aboveTop).toBe(0);
  });

  test('positioned caps the prompt by the room on the side it was placed, with a floor', () => {
    const layer = layers[0];
    const editor = setup(layer);
    editor.openEdit();
    const tip = cmView.getTooltip(editor.view, editor.tooltips()[0]);
    const space = { left: 0, top: 0, right: 1024, bottom: 640 };
    const box = jest.spyOn(tip.dom, 'getBoundingClientRect');
    const room = () => tip.dom.style.getPropertyValue('--cm-faust-prompt-room');

    // Below the target: from its top to the window's bottom, less the gap
    tip.dom.classList.remove('cm-tooltip-above');
    box.mockReturnValue(rect(504, 294, 1024, 864));
    tip.positioned(space);
    expect(room()).toBe('330px');                                            // 640 - 294 - 16
    // Above the target: from the window's top to its bottom
    tip.dom.classList.add('cm-tooltip-above');
    box.mockReturnValue(rect(504, 40, 1024, 330));
    tip.positioned(space);
    expect(room()).toBe('314px');                                            // 330 - 0 - 16
    // Hardly any room: never less than 120 px
    box.mockReturnValue(rect(504, 0, 1024, 60));
    tip.positioned(space);
    expect(room()).toBe('120px');
  });

  test('before a new prompt is placed, the text scrolls so that it fits under the target; the same prompt on a new range does not scroll', async () => {
    const layer = layers[0];
    const editor = setup(layer);
    const scroller = editor.view.scrollDOM;
    let top = 0;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => top, set: (value) => { top = value; } });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => 2000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => 800 });
    jest.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(rect(0, 60, 1440, 700));
    const coords = new Map([[FROM, rect(120, 564, 121, 582)], [TO, rect(800, 634, 801, 652)]]);
    jest.spyOn(editor.view, 'coordsAtPos').mockImplementation((pos) => coords.get(pos) || null);
    // Synchronously, before the dispatch: CodeMirror places a new tooltip before it scrolls
    const { rangeId } = editor.openEdit();
    // 652 + 16 + 300 (the expected height of a prompt not yet measured) - (700 - 56): the scroller
    // ends above the bottom of jsdom's 768 px window, and the dock's band of 56 px stays clear
    expect(top).toBe(324);
    editor.kit.openPrompt(editor.view, { mode: 'edit', rangeId, ui: createState() });
    expect(top).toBe(324);
    // Placed: its own height is the next prompt's estimate (at most 480)
    const tip = cmView.getTooltip(editor.view, editor.tooltips()[0]);
    jest.spyOn(tip.dom, 'getBoundingClientRect').mockReturnValue(rect(0, 400, 520, 640));
    tip.positioned({ left: 0, top: 0, right: 1024, bottom: 900 });
    editor.kit.closePrompt(editor.view);
    top = 0;
    editor.openEdit();
    expect(top).toBe(264);                                                   // 652 + 16 + 240 - 644
  });
});

// F3 (lead decision of 25 Nov 2026): the opened "Mitä malli näkee" list. The rule of final polish round 2
// (listRoomFor: the list was capped to what the room on the prompt's side left, and under 96px the prompt
// scrolled as a whole) is replaced by promptLayoutFor, so the cases of that rule are rewritten here for the
// new one: one-line rows first, then the prompt over the lines next to its anchor, and only then a scroller.
describe('the layout of a prompt whose context list is open (F3)', () => {
  const { promptLayoutFor } = require('../../src/editor/inlinePromptCore');
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top });
  // Measured in the app with the sample project: the other rows of the idle prompt take 261px at
  // 1440 × 900 and 201px at 1024 × 640 (the quick actions step aside there), its edges 2px; the list of
  // four parts is 276px with two-line rows and 212px with one-line rows
  const SAMPLE = { border: 2, twoLine: 276, oneLine: 212 };

  test('1440 × 900: a two-line list that fits the room on the prompt\'s side changes nothing', () => {
    const big = { ...SAMPLE, sideRoom: 602, fullRoom: 836, others: 261 };
    expect(promptLayoutFor(big)).toEqual({ compact: false, room: 602, shift: 0, listRoom: 339, capped: false });
    // The one-line form is not even measured then
    expect(promptLayoutFor({ ...big, oneLine: NaN })).toEqual({ compact: false, room: 602, shift: 0, listRoom: 339, capped: false });
    // Exactly as high as the room: still the two-line rows
    expect(promptLayoutFor({ ...big, sideRoom: 539 })).toEqual({ compact: false, room: 539, shift: 0, listRoom: 276, capped: false });
  });

  test('the rows go onto one line each before anything else gives way', () => {
    // One pixel short for the two-line rows; the one-line rows fit the same room, and the prompt stays on its side
    expect(promptLayoutFor({ ...SAMPLE, sideRoom: 538, fullRoom: 836, others: 261 }))
      .toEqual({ compact: true, room: 538, shift: 0, listRoom: 275, capped: false });
    expect(promptLayoutFor({ ...SAMPLE, sideRoom: 415, fullRoom: 576, others: 201 }))
      .toEqual({ compact: true, room: 415, shift: 0, listRoom: 212, capped: false });
  });

  test('1024 × 640: when the one-line rows do not fit the side either, the prompt takes the height it needs over its anchor', () => {
    // 371px under the target (624 - 237 - 16), 576px between the ends the prompt keeps on either side
    expect(promptLayoutFor({ ...SAMPLE, sideRoom: 371, fullRoom: 576, others: 201 }))
      .toEqual({ compact: true, room: 416, shift: 45, listRoom: 213, capped: false });
    // No more than it needs: a bigger window gives the same prompt
    expect(promptLayoutFor({ ...SAMPLE, sideRoom: 371, fullRoom: 836, others: 201 }).room).toBe(416);
  });

  test('only a list that does not fit the whole height is capped, and scrolls under the foot', () => {
    // Fifteen Tarinakansio entries: 772px in two lines, 676px in one
    const long = { border: 2, twoLine: 772, oneLine: 676, others: 201 };
    expect(promptLayoutFor({ ...long, sideRoom: 371, fullRoom: 576 }))
      .toEqual({ compact: true, room: 576, shift: 205, listRoom: 373, capped: true });
    // A list one pixel over its room is not a scroller (the browser rounds heights)
    expect(promptLayoutFor({ border: 2, twoLine: 500, oneLine: 374, others: 201, sideRoom: 371, fullRoom: 576 }).capped).toBe(false);
    expect(promptLayoutFor({ border: 2, twoLine: 500, oneLine: 375, others: 201, sideRoom: 371, fullRoom: 576 }).capped).toBe(true);
  });

  test('the list never gets less than 96px, the prompt never more than the whole height, and a layout that cannot be read caps the list', () => {
    // Other rows that leave less than 96px of the whole height (no window the application allows is that low)
    expect(promptLayoutFor({ ...SAMPLE, sideRoom: 200, fullRoom: 300, others: 250 }))
      .toEqual({ compact: true, room: 300, shift: 100, listRoom: 96, capped: true });
    // Never less room than the least a prompt is given, never a whole height under the side's
    expect(promptLayoutFor({ ...SAMPLE, sideRoom: NaN, fullRoom: NaN, others: 201 }))
      .toEqual({ compact: true, room: 120, shift: 0, listRoom: 96, capped: true });
    expect(promptLayoutFor({ ...SAMPLE, sideRoom: 371, fullRoom: 576, others: 201, twoLine: NaN, oneLine: NaN }))
      .toEqual({ compact: true, room: 576, shift: 205, listRoom: 373, capped: true });
  });

  // jsdom has no layout: the prompt's and the list's heights follow what the core has written, as a browser's would
  function fakeLayout(tip, heights) {
    const dom = tip.dom;
    const slot = dom.querySelector('[data-role="context"]');
    const list = document.createElement('div');
    list.className = 'faust-context-row__list';
    slot.appendChild(list);
    const px = (name) => parseFloat(dom.style.getPropertyValue(name));
    const natural = () => (dom.hasAttribute('data-list-compact') ? heights.oneLine : heights.twoLine);
    const shown = () => (list.isConnected ? Math.min(natural(), Number.isFinite(px('--cm-faust-prompt-list-room')) ? px('--cm-faust-prompt-list-room') : Infinity) : 0);
    const content = () => heights.others + shown();
    const height = () => Math.min(content(), Number.isFinite(px('--cm-faust-prompt-room')) ? px('--cm-faust-prompt-room') : Infinity);
    Object.defineProperty(list, 'scrollHeight', { configurable: true, get: natural });
    Object.defineProperty(list, 'clientHeight', { configurable: true, get: shown });
    Object.defineProperty(dom, 'scrollHeight', { configurable: true, get: content });
    // Where CodeMirror put the prompt (`top` below its target, `bottom` above it), plus the bridge margin
    const at = { top: 0, bottom: null };
    jest.spyOn(dom, 'getBoundingClientRect').mockImplementation(() => {
      const bridge = px('--cm-faust-prompt-bridge') || 0;
      const top = (at.bottom === null ? at.top : at.bottom - at.height) + bridge;
      return rect(488, top, 1008, top + height());
    });
    const state = () => ({
      compact: dom.hasAttribute('data-list-compact'),
      capped: dom.hasAttribute('data-list-capped'),
      room: dom.style.getPropertyValue('--cm-faust-prompt-room'),
      listRoom: dom.style.getPropertyValue('--cm-faust-prompt-list-room'),
      bridge: dom.style.getPropertyValue('--cm-faust-prompt-bridge'),
      offset: tip.offset.y
    });
    return { list, at, height, state, drawn: () => dom.getBoundingClientRect() };
  }
  // As CodeMirror places a tooltip: under the anchor's bottom or over its top, moved by the view's offset
  const cmPlace = (tip, layout, anchor, space) => {
    const above = tip.dom.classList.contains('cm-tooltip-above');
    layout.at.height = layout.height();
    layout.at.top = anchor.bottom + tip.offset.y;
    layout.at.bottom = above ? anchor.top - tip.offset.y : null;
    tip.positioned(space);
  };

  test('positioned lays an open list out by the rule: one-line rows, the prompt over its anchor at once, and CodeMirror takes the place over', () => {
    const editor = setup(layers[0]);
    editor.openEdit();
    const tip = cmView.getTooltip(editor.view, editor.tooltips()[0]);
    expect(tip.offset).toEqual({ x: 0, y: 0 });
    const space = { left: 16, top: 16, right: 1008, bottom: 624 };                 // 1024 × 640 less the gutters
    const anchor = { top: 200, bottom: 237 };
    const layout = fakeLayout(tip, { others: 203, twoLine: 276, oneLine: 212 });   // the edges counted with the rows

    // CodeMirror has the prompt under its target, with no offset yet
    cmPlace(tip, layout, anchor, space);
    expect(layout.state()).toEqual({ compact: true, capped: false, room: '416px', listRoom: '213px', bridge: '-45px', offset: -45 });
    // Drawn at once where it belongs: 45px over the target, its lower end where the side's room ends
    expect(layout.drawn()).toMatchObject({ top: 192, bottom: 607 });
    // CodeMirror's next placement uses the offset: the same place, and the bridge goes
    cmPlace(tip, layout, anchor, space);
    expect(layout.state()).toEqual({ compact: true, capped: false, room: '416px', listRoom: '213px', bridge: '', offset: -45 });
    expect(layout.drawn()).toMatchObject({ top: 192, bottom: 607 });

    // The window grows to 1440 × 900: the two-line rows fit under the target again, nothing is moved
    const big = { left: 16, top: 16, right: 1424, bottom: 884 };
    cmPlace(tip, layout, anchor, big);
    expect(layout.state()).toEqual({ compact: false, capped: false, room: '631px', listRoom: '428px', bridge: '45px', offset: 0 });
    expect(layout.drawn()).toMatchObject({ top: 237, bottom: 716 });
    cmPlace(tip, layout, anchor, big);
    expect(layout.state()).toMatchObject({ bridge: '', offset: 0 });

    // Back in the low window, and the list closes: the prompt stands under its target again at once, in its side's room
    cmPlace(tip, layout, anchor, space);
    cmPlace(tip, layout, anchor, space);
    expect(layout.drawn()).toMatchObject({ top: 192, bottom: 607 });
    layout.list.remove();
    cmPlace(tip, layout, anchor, space);                                           // CodeMirror still places it by the old offset
    expect(layout.state()).toEqual({ compact: false, capped: false, room: '371px', listRoom: '', bridge: '45px', offset: 0 });
    expect(layout.drawn()).toMatchObject({ top: 237, bottom: 440 });
    cmPlace(tip, layout, anchor, space);
    expect(layout.state()).toMatchObject({ bridge: '', offset: 0 });
    expect(layout.drawn()).toMatchObject({ top: 237, bottom: 440 });
  });

  test('a prompt above its target reaches down over it, and a long list scrolls in the whole height', () => {
    const editor = setup(layers[0]);
    editor.openEdit();
    const tip = cmView.getTooltip(editor.view, editor.tooltips()[0]);
    tip.dom.classList.add('cm-tooltip-above');
    const space = { left: 16, top: 16, right: 1008, bottom: 624 };
    const anchor = { top: 385, bottom: 408 };
    const layout = fakeLayout(tip, { others: 203, twoLine: 276, oneLine: 212 });

    // The idle prompt stands on its target, in the 353px over it (385 - 16 - 16)
    layout.list.remove();
    cmPlace(tip, layout, anchor, space);
    expect(layout.state()).toMatchObject({ room: '353px', bridge: '', offset: 0 });
    expect(layout.drawn()).toMatchObject({ top: 182, bottom: 385 });
    // The list opens and CodeMirror measures the grown prompt: the one-line list needs 416, so the prompt
    // reaches 63px down over its target, and its upper end stays where the side's room starts
    tip.dom.querySelector('[data-role="context"]').appendChild(layout.list);
    cmPlace(tip, layout, anchor, space);
    expect(layout.state()).toMatchObject({ compact: true, capped: false, room: '416px', listRoom: '213px', offset: -63 });
    expect(layout.drawn()).toMatchObject({ top: 33, bottom: 448 });
    cmPlace(tip, layout, anchor, space);
    expect(layout.state()).toMatchObject({ bridge: '', offset: -63 });
    expect(layout.drawn()).toMatchObject({ top: 33, bottom: 448 });

    // Fifteen entries more: the prompt takes the whole height (32 to 608), the list scrolls in what is left
    const long = fakeLayout(tip, { others: 203, twoLine: 772, oneLine: 676 });
    layout.list.remove();
    cmPlace(tip, long, anchor, space);
    cmPlace(tip, long, anchor, space);
    expect(long.state()).toEqual({ compact: true, capped: true, room: '576px', listRoom: '373px', bridge: '', offset: -223 });
    expect(long.drawn()).toMatchObject({ top: 32, bottom: 608 });
  });

  test('when the list opens, the text first gives the two-line list room, and the prompt follows it in the same frame', () => {
    const editor = setup(layers[0]);
    const scroller = editor.view.scrollDOM;
    let top = 0;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => top, set: (value) => { top = value; } });
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => 2000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, get: () => 800 });
    jest.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(rect(0, 60, 1440, 700));
    // The target's start at the top of the view: no room is made when the prompt opens
    const coords = new Map([[FROM, rect(120, 70, 121, 88)], [TO, rect(800, 400, 801, 418)]]);
    jest.spyOn(editor.view, 'coordsAtPos').mockImplementation((pos) => coords.get(pos) || null);

    // jsdom has no ResizeObserver: the prompt's own one is caught here and run by hand
    const watchers = [];
    window.ResizeObserver = class { constructor(run) { this.run = run; } observe(target) { watchers.push({ run: this.run, target }); } disconnect() {} unobserve() {} };
    let tip;
    try {
      editor.openEdit();
      tip = cmView.getTooltip(editor.view, editor.tooltips()[0]);
    } finally {
      delete window.ResizeObserver;
    }
    const slot = tip.dom.querySelector('[data-role="context"]');
    const watcher = watchers.find((item) => item.target === slot);
    expect(watcher).toBeTruthy();
    expect(top).toBe(0);

    const space = { left: 16, top: 16, right: 1424, bottom: 884 };
    const layout = fakeLayout(tip, { others: 263, twoLine: 276, oneLine: 212 });
    layout.list.remove();
    cmPlace(tip, layout, { top: 70, bottom: 418 }, space);
    expect(layout.state()).toMatchObject({ room: '450px', listRoom: '', bridge: '', offset: 0 });   // 884 - 418 - 16

    // Muuta: the list is in the slot. The author has scrolled meanwhile, so the target's start has room to give
    slot.appendChild(layout.list);
    coords.set(FROM, rect(120, 300, 121, 318));
    watcher.run();
    // 418 + 16 + 539 - (700 - 56) = 329 wanted; the start may go up 300 - 76 = 224
    expect(top).toBe(224);
    // The room is the one the scroll made (450 + 224), and the prompt went up with the text before CodeMirror moved it
    expect(layout.state()).toEqual({ compact: false, capped: false, room: '674px', listRoom: '411px', bridge: '-224px', offset: 0 });
    expect(layout.drawn()).toMatchObject({ top: 194, bottom: 733 });
    // CodeMirror follows the scroll in the next frame
    cmPlace(tip, layout, { top: 76, bottom: 194 }, space);
    expect(layout.state()).toEqual({ compact: false, capped: false, room: '674px', listRoom: '411px', bridge: '', offset: 0 });
  });

  test('the stylesheet draws what the core writes: the list\'s cap, the one-line rows and the bridge', () => {
    const css = fs.readFileSync(path.join(__dirname, '../..', 'styles/faust-components.css'), 'utf8');
    const core = fs.readFileSync(path.join(__dirname, '../..', 'src/editor/inlinePromptCore.js'), 'utf8');
    const row = fs.readFileSync(path.join(__dirname, '../..', 'src/components/ContextRow.js'), 'utf8');
    const PROMPT = ':is(.faust-editor-host, .faust-layer) .cm-tooltip.cm-tooltip.cm-faust-prompt';
    // Round 2, unchanged: the list is its own scroller, and the quick actions step aside in a low window
    expect(css).toMatch(/\.cm-faust-prompt \.faust-context-row__list \{ max-height: var\(--cm-faust-prompt-list-room, none\); overflow-y: auto;/);
    expect(css).toMatch(/@media \(max-height: 719px\) \{\s*[^}]*\.cm-faust-prompt:has\(\.faust-context-row__list\) :is\(\.cm-faust-prompt-chips, \.cm-faust-prompt-saved\) \{ display: none; \}/);
    expect(row).toContain("className: 'faust-context-row__list'");
    // F3: the names the core writes are the ones the stylesheet reads
    expect(core).toContain("const LIST_COMPACT_ATTRIBUTE = 'data-list-compact';");
    expect(core).toContain("const BRIDGE_PROPERTY = '--cm-faust-prompt-bridge';");
    expect(css).toContain(`${PROMPT} { margin-top: var(--cm-faust-prompt-bridge, 0px); }`);
    expect(css).toContain(`${PROMPT}[data-list-compact] .faust-context-row__words { display: block; flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }`);
    // The two-line form is the component's own (it was an inline style, which no rule could change)
    expect(css).toContain('.faust-context-row__words { display: flex; flex-direction: column; }');
    expect(row).toContain("'faust-context-row__words'");
    expect(row).not.toMatch(/flexDirection: 'column' \} \},\s*alone\(part\.label\)/);
    // A cut row carries its whole text as a title; a whole row has none
    expect(row).toContain("el.title = el.scrollWidth > el.clientWidth ? text : '';");
    // The row's first render is drawn before the prompt is first measured
    expect(row).toContain('ReactDOM.flushSync(() => root.render(e(ContextRow, props)));');
  });
});

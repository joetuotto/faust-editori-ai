/**
 * @jest-environment jsdom
 */
// Stage I-05: the editor's tooltip host in the layer host.
//
// FaustEditor.js renders CodeMirror tooltips (the Pikamuokkaus prompt) in .faust-layer with
// tooltips({ parent }). CodeMirror then creates a container in the layer and gives it the
// editor's theme classes, so the editor root's rules (display: flex and position: relative,
// both !important, and height: 100%) apply to it as well. In the app column that made the empty
// container a page-high item: the main area lost its height and the box took the pointer
// (seen live at I-05, before the rule of styles/faust-components.css existed). The rule targets
// the container by its generated theme class (ͼ…). These cases check what the rule relies on,
// with CodeMirror's CommonJS build and the real prompt kit, and that the rule says what it must.
const fs = require('fs');
const path = require('path');
const cmState = require('@codemirror/state');
const cmView = require('@codemirror/view');
const { createInlinePromptKit } = require('../../src/editor/inlinePromptCore');
const { createSuggestionKit } = require('../../src/editor/suggestionsCore');

const { EditorState, StateField, StateEffect, Annotation, Prec } = cmState;
const { EditorView, Decoration, WidgetType, keymap, showTooltip, ViewPlugin, tooltips } = cmView;

const rangeProto = window.Range.prototype;
if (!rangeProto.getClientRects) rangeProto.getClientRects = () => [];
if (!rangeProto.getBoundingClientRect) {
  rangeProto.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
}

const CSS = fs.readFileSync(path.join(__dirname, '../../styles/faust-components.css'), 'utf8');
const HOST_SELECTOR = '.faust-layer > [class^="ͼ"]';

// The declarations of the one rule whose selector is exactly `selector`
function declarationsOf(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = CSS.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) return null;
  const out = {};
  for (const part of match[1].split(';')) {
    const at = part.indexOf(':');
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

function mountEditor() {
  document.body.innerHTML = '<div class="faust-app"><div class="faust-main"><div id="host"></div></div><div class="faust-layer"></div></div>';
  const layer = document.querySelector('.faust-layer');
  const suggestions = createSuggestionKit({ StateField, StateEffect, Annotation, Prec, EditorView, Decoration, WidgetType, keymap });
  const prompt = createInlinePromptKit({ StateField, StateEffect, EditorView, Decoration, showTooltip, ViewPlugin },
    { suggestionField: suggestions.suggestionField });
  const view = new EditorView({
    parent: document.getElementById('host'),
    state: EditorState.create({
      doc: 'Juna pysähtyi asemalle hieman ennen puoltayötä.',
      extensions: [
        suggestions.suggestionExtension({ external: Annotation.define(), diff: () => [] }),
        prompt.inlinePrompt({ host: () => null }),
        tooltips({ parent: layer }),
        EditorView.theme({ '&': { height: '100%' } })
      ]
    })
  });
  return { view, layer };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the tooltip host of the editor in the layer host (stage I-05)', () => {
  test('the inline prompt makes CodeMirror put a container into the layer host, with the editor theme classes', () => {
    const { view, layer } = mountEditor();
    const children = Array.from(layer.children);
    expect(children).toHaveLength(1);
    const host = children[0];
    // The theme classes of the editor root are the container's classes: the root's rules reach it
    const themeClasses = view.themeClasses.split(/\s+/).filter(Boolean);
    expect(themeClasses.length).toBeGreaterThan(0);
    expect(Array.from(host.classList)).toEqual(themeClasses);
    expect(Array.from(view.dom.classList)).toEqual(expect.arrayContaining(themeClasses));
    view.destroy();
  });

  test('the rule of styles/faust-components.css matches that container and nothing else in the layer', () => {
    const { view, layer } = mountEditor();
    const host = layer.firstElementChild;
    expect(host.matches(HOST_SELECTOR)).toBe(true);
    // Every generated class starts with ͼ, so a container with any of them in front still matches
    expect(host.className.split(/\s+/).every((name) => name.startsWith('ͼ'))).toBe(true);
    // A dialog or a toast in the layer is not touched
    const dialog = document.createElement('div');
    dialog.className = 'faust-scrim';
    layer.appendChild(dialog);
    expect(dialog.matches(HOST_SELECTOR)).toBe(false);
    view.destroy();
  });

  test('the rule takes the container out of the layout and away from the pointer, and gives the pointer back to the tooltips', () => {
    const host = declarationsOf(HOST_SELECTOR);
    expect(host).not.toBeNull();
    // Both !important: CodeMirror's base theme sets position and display with !important
    expect(host.position).toBe('absolute !important');
    expect(host.display).toBe('block !important');
    expect(host.height).toBe('0');
    expect(host.width).toBe('0');
    expect(host['pointer-events']).toBe('none');
    expect(declarationsOf(`${HOST_SELECTOR} > .cm-tooltip`)).toEqual({ 'pointer-events': 'auto' });
  });

  test('the prompt is capped by the room the core writes, scrolls inside itself and keeps its foot in view (I-05 review)', () => {
    const PROMPT = ':is(.faust-editor-host, .faust-layer) .cm-tooltip.cm-tooltip.cm-faust-prompt';
    const block = CSS.slice(CSS.indexOf('/* I-05:'), CSS.indexOf('/* end I-05 */'));
    expect(block.length).toBeGreaterThan(0);
    // The cap and the foot are rules of the I-05 block, the property is the one the core writes
    const core = fs.readFileSync(path.join(__dirname, '../../src/editor/inlinePromptCore.js'), 'utf8');
    expect(core).toContain("const ROOM_PROPERTY = '--cm-faust-prompt-room';");
    expect(block).toContain(`${PROMPT} { max-height: var(--cm-faust-prompt-room, none); overflow-y: auto;`);
    const foot = declarationsOf(`${PROMPT} .cm-faust-prompt-foot`);
    expect(foot).toMatchObject({ position: 'sticky', bottom: 'calc(-1 * var(--sp-3))', background: 'var(--surface-raised)' });
    // Its padding stands in for the prompt's own bottom padding (var(--sp-3)), so a prompt that fits looks as before
    expect(foot['margin-bottom']).toBe('calc(-1 * var(--sp-3))');
    expect(foot['padding-bottom']).toBe('var(--sp-3)');
    expect(declarationsOf(`${PROMPT} .cm-faust-prompt-count`)).toEqual({ 'white-space': 'nowrap' });
    // Typed in, it is above the editor pane's popovers (Etsi) and below the header's menus and the dialogs
    expect(declarationsOf(`${PROMPT}:focus-within`)).toEqual({ 'z-index': 'calc(var(--z-popover) + 1)' });
    const tokens = fs.readFileSync(path.join(__dirname, '../../styles/faust-tokens.css'), 'utf8');
    const z = (name) => Number(new RegExp(`--z-${name}:\\s*(\\d+)`).exec(tokens)[1]);
    expect(z('popover') + 1).toBeLessThan(z('dropdown'));
  });

  // Changed by the final pass (T-003, lead decision on I-05 live-14): the one tooltips() call also gives the
  // tooltips a 16px gutter at the window's edges, so the line it matched is now a call of several lines.
  test('the editor still renders its tooltips in the layer host, in one tooltips() call', () => {
    const editor = fs.readFileSync(path.join(__dirname, '../../src/components/FaustEditor.js'), 'utf8');
    expect(editor.match(/\btooltips\(/g)).toHaveLength(1);
    expect(editor).toMatch(/tooltips\(\{\s*parent: document\.querySelector\('\.faust-layer'\),\s*tooltipSpace:/);
  });

  test('the prompt keeps a 16px gutter at every window edge: the tooltip space of the editor (T-003)', () => {
    const editor = fs.readFileSync(path.join(__dirname, '../../src/components/FaustEditor.js'), 'utf8');
    const source = /tooltipSpace: (\(view\) => \{[^}]*\{[^}]*\};\s*\})/.exec(editor);
    expect(source).not.toBeNull();
    // The function as written in FaustEditor.js, called as CodeMirror calls it: with the view
    const tooltipSpace = new Function(`return ${source[1]};`)();
    const viewIn = (clientWidth, clientHeight) => ({ dom: { ownerDocument: { documentElement: { clientWidth, clientHeight } } } });
    expect(tooltipSpace(viewIn(1024, 640))).toEqual({ top: 16, left: 16, right: 1008, bottom: 624 });
    expect(tooltipSpace(viewIn(1400, 900))).toEqual({ top: 16, left: 16, right: 1384, bottom: 884 });
  });
});

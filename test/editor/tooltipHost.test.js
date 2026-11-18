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

  test('the editor still renders its tooltips in the layer host', () => {
    const editor = fs.readFileSync(path.join(__dirname, '../../src/components/FaustEditor.js'), 'utf8');
    expect(editor).toMatch(/tooltips\(\{ parent: document\.querySelector\('\.faust-layer'\) \}\)/);
  });
});

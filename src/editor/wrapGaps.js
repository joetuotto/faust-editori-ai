// The ESM shell of wrapGapsCore.js (F4): the CodeMirror imports and one factory call.
// No line of a mark under the space at a soft wrap (cm-faust-wrapgap, drawn by section 14 of faust-components.css).
import { StateField, StateEffect, Prec } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin } from '@codemirror/view';
import { createWrapGapKit } from './wrapGapsCore.js';
export const { wrapGaps, setWrapGaps, wrapGapField, wrapGapRanges, measureWrapGaps } = createWrapGapKit({ StateField, StateEffect, EditorView, Decoration, ViewPlugin, Prec });

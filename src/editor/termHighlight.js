// The ESM shell of termHighlightCore.js (stage I-07): the CodeMirror imports and one factory call.
// Vältettävät sanat (cm-faust-avoid) and the mentions of Tarinakansio entries (cm-faust-mention).
import { StateField, StateEffect } from '@codemirror/state';
import { Decoration, ViewPlugin, EditorView } from '@codemirror/view';
import { createTermHighlightKit } from './termHighlightCore.js';
export const { setTermHighlightConfig, termHighlight } = createTermHighlightKit({ StateField, StateEffect, Decoration, ViewPlugin, EditorView });

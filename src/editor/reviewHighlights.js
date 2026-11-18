// The ESM shell of reviewHighlightsCore.js (stage I-08): the CodeMirror imports and one factory call.
// The passages of the Tarkistus tab's open findings (cm-faust-finding, the selected one cm-faust-finding-active).
import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import { createReviewHighlightsKit } from './reviewHighlightsCore.js';
export const { setFindingHighlights, findingField, reviewHighlights, findingRanges } = createReviewHighlightsKit({ StateField, StateEffect, EditorView, Decoration });

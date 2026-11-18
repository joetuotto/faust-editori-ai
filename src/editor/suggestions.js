// src/editor/suggestions.js — ESM shell. All logic is in suggestionsCore.js (CommonJS, tested).
// The kit is created once, here, at module load: there is one suggestionField in the app.
import { StateField, StateEffect, Annotation, Prec } from '@codemirror/state';
import { EditorView, Decoration, WidgetType, keymap } from '@codemirror/view';
import { createSuggestionKit } from './suggestionsCore.js';

export const {
  suggestionField, suggestionEffect, suggestionAccept, suggestionExtension, installSuggestionFacade,
  readSuggestionMeta, suggestionEvents, suggestionSnapshot, suggestionState
} = createSuggestionKit({ StateField, StateEffect, Annotation, Prec, EditorView, Decoration, WidgetType, keymap });

// src/editor/inlinePrompt.js — ESM shell. All logic is in inlinePromptCore.js (CommonJS, tested).
// The kit is created once, here, at module load, with the app's one suggestionField (./suggestions.js).
import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration, showTooltip, ViewPlugin } from '@codemirror/view';
import { createInlinePromptKit } from './inlinePromptCore.js';
import { suggestionField } from './suggestions.js';

export const { inlinePrompt, openPrompt, updatePrompt, closePrompt, getPrompt, focusPrompt } =
  createInlinePromptKit({ StateField, StateEffect, EditorView, Decoration, showTooltip, ViewPlugin }, { suggestionField });

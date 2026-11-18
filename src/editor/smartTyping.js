// The ESM shell of smartTypingCore.js (stage I-06): the CodeMirror imports and one factory call
import { EditorView } from '@codemirror/view';
import { Annotation } from '@codemirror/state';
import { createSmartTypingKit } from './smartTypingCore.js';
export const { SmartTyping, smartTyping } = createSmartTypingKit({ EditorView, Annotation });

/**
 * PasteEditsDialog - Liitä muokkauksina (report 4.5, stage I-04)
 *
 *   PasteEditsDialog({ request, onDone })
 *     request  the PasteRequest of suggestionController.pasteAsEdits, or null (renders nothing):
 *              { status: 'no-editor' | 'empty' | 'identical' | 'protected-only' | 'ok',
 *                scope: 'selection' | 'chapter', stats, ratio, warn, protectedCount, source }
 *     onDone   (choice: { source: 'editor' | 'external-ai' } | null) => void
 *
 * Muokkaa ▸ Liitä muokkauksina… (⌥⌘V) compares the clipboard with the selection, or with the whole
 * chapter when nothing is selected, and opens this dialog with the numbers. "Liitä muokkauksina"
 * hands back who edited the text; the controller then proposes the differences as suggestions. No
 * model is called. A request that cannot paste (no chapter open, nothing on the clipboard, the same
 * text, only changes that would delete a note or an underline) shows why and offers Sulje only.
 *
 * The words are pasteDialogText / PASTE_TEXT of src/editor/pasteEdits.js (unit-tested); this file
 * holds the radio state and the markup. The frame is the shared Dialog of ui.js (layer host, Esc,
 * focus in and back to the manuscript, inert background); composition of visual foundations
 * entry VF-20 with the strings of reconcile R-81. Focus starts on the button that ends the dialog,
 * so Enter pastes (or closes). The body is a form whose submit button is the footer's
 * "Liitä muokkauksina", so Enter on a source radio pastes too (the browser's implicit submission);
 * there is no key listener here.
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */

import { Dialog, Callout } from './ui.js';
import { PASTE_TEXT, pasteDialogText } from '../editor/pasteEdits.js';

const { createElement: e, useState, useId } = React;

const SOURCE_IDS = PASTE_TEXT.sources.map(option => option.id);
const startSource = (request) => (request && SOURCE_IDS.includes(request.source) ? request.source : 'editor');

export function PasteEditsDialog({ request, onDone }) {
  const [source, setSource] = useState(() => startSource(request));
  // A new request (⌥⌘V again while the dialog is open) starts from its own remembered source
  const [shown, setShown] = useState(request);
  if (request !== shown) {
    setShown(request);
    setSource(startSource(request));
  }
  const labelId = useId();
  const radioName = useId();
  const formId = useId();
  if (!request) return null;

  const text = pasteDialogText(request);
  const done = (choice) => { if (onDone) onDone(choice); };
  const paste = () => done({ source });

  // An inline row: the label and its value on one line (menu-spec B.19). The rows are one grid: the
  // labels in one column, every value on the same left edge beside them (as flush-right rows the
  // three values shared no edge, and the result stood without a label)
  const row = (item) => e('div', { className: 'faust-kv faust-kv--pair' }, e('span', null, item.key), e('span', null, item.value));

  const counts = text.target && e('div', null,
    e('div', { className: 'faust-kv-list', style: { '--kv-label': '0px' } },
      row(text.target),
      text.clipboard && row(text.clipboard),
      text.result && row({ key: 'Tulos:', value: text.result })),
    text.protectedLine && e('div', { className: 'faust-meta' }, text.protectedLine)
  );

  const sources = text.canPaste && e('div', { className: 'faust-field' },
    e('div', { id: labelId, className: 'faust-field__label' }, PASTE_TEXT.sourceLabel),
    // Box, label and hint in three columns, so the two hints share one edge
    e('div', { className: 'faust-check-group faust-check-group--grid', role: 'radiogroup', 'aria-labelledby': labelId },
      PASTE_TEXT.sources.map(option => e('label', { key: option.id, className: 'faust-check faust-check--serif' },
        // The round wrapper carries the focus ring (the native radio paints any ring as a square)
        e('span', { className: 'faust-radio' },
          e('input', { type: 'radio', name: radioName, value: option.id, checked: source === option.id, onChange: () => setSource(option.id) })),
        e('span', null, option.label),
        e('span', { className: 'faust-check__hint' }, option.hint)
      ))
    )
  );

  const footer = text.canPaste
    ? e(React.Fragment, null,
      e('button', { type: 'button', className: 'faust-btn faust-btn--lg', onClick: () => done(null) }, PASTE_TEXT.cancel),
      // The form's submit button, although the footer lies outside the body
      e('button', { type: 'submit', form: formId, className: 'faust-btn faust-btn--lg faust-btn--primary', 'data-autofocus': true }, PASTE_TEXT.confirm))
    : e('button', { type: 'button', className: 'faust-btn faust-btn--lg', 'data-autofocus': true, title: 'Sulje (Esc)', onClick: () => done(null) }, PASTE_TEXT.close);

  // A form (a choice and an action): a press on the scrim closes nothing (VF-20)
  return e(Dialog, {
    title: PASTE_TEXT.title,
    size: 'md',
    width: 480,
    dismissOnScrim: false,
    className: 'faust-paste',
    onClose: () => done(null),
    footer
  },
    e(text.canPaste ? 'form' : 'div', {
      id: text.canPaste ? formId : undefined,
      onSubmit: text.canPaste ? (ev) => { ev.preventDefault(); paste(); } : undefined,
      style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }
    },
      counts,
      text.warning && e(Callout, { role: 'warning' }, text.warning),
      text.notice && e(Callout, { role: 'info' }, text.notice),
      sources
    )
  );
}

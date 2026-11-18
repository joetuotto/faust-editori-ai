/**
 * src/components/ReviewCheckDialog.js - Oma tarkistus: the author's own check of the Tarkistus tab
 * (stage I-08, report 4.9).
 *
 *   ReviewCheckDialog({ request, existing, onDone, askConfirm })
 *     request      null (closed) | { check: StoredCustom | null } (null: a new check)
 *     existing     the stored own checks (ui-prefs review.customChecks), for the name rule
 *     onDone(result)   { label, instruction, suggest } | { delete: true } | null (cancelled)
 *     askConfirm   the app's question: Poista tarkistus asks it before onDone({ delete: true })
 *
 *   saveCustomCheck(result, request, controller) → boolean
 *     writes a result of the dialog (or of the panel's own Poista tarkistus) into review.customChecks and
 *     selects the check in the review controller: a saved check is selected, a deleted one gives way to
 *     the first check of the picker. Findings a check has made stay in the chapters (they carry its name).
 *     A new check is not added when the list already holds 30 (canAddCustomCheck): it would be stored
 *     but never listed. Returns false when nothing was written.
 *
 * The shared Dialog of ui.js (reconcile R-81, visual foundations entry VF-24): it portals into the layer
 * host, keeps Tab inside, closes on Esc (Peruuta) and is mounted by app.js with the other stage dialogs
 * (stage amendments 0.5). No key listener of its own; Enter is not wired to Tallenna (R-69). The rules and
 * the messages of the two fields are validateCustomCheck's (src/services/review/reviewChecks.js).
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */
import { Dialog, Field, Callout } from './ui.js';
import { validateCustomCheck, makeCustomCheck, findCheck, canAddCustomCheck } from '../services/review/reviewChecks.js';
import { getSettingsStore } from '../services/settingsStore.js';

const { createElement: e, useState } = React;

const SETTING = 'review.customChecks';
// The check shown after an own check is deleted: the first of the picker, which works without a model
const FIRST_CHECK = 'avoid-words';

const TEXT = Object.freeze({
  title: 'Oma tarkistus',
  name: 'Nimi',
  namePlaceholder: 'Esimerkiksi: Näkökulman vaihdot',
  instruction: 'Ohje tekoälylle',
  instructionPlaceholder: 'Kirjoita yksi asia, jota tekoäly etsii. Esimerkiksi: Etsi kohdat, joissa näkökulma vaihtuu kesken kappaleen.',
  suggest: 'Pyydä korjausehdotus',
  suggestHint: 'Tekoäly kirjoittaa lainatun kohdan korjattuna. Näet sen ehdotuksena ennen kuin mikään muuttuu.',
  cancel: 'Peruuta',
  save: 'Tallenna',
  remove: 'Poista tarkistus'
});

// The one question before an own check goes (reconcile R-36)
export const DELETE_QUESTION = Object.freeze({
  title: 'Poistetaanko oma tarkistus?',
  message: 'Tarkistuksen jo tekemät havainnot säilyvät luvuissa.',
  confirm: 'Poista tarkistus'
});

const storedList = () => {
  const value = getSettingsStore().get(SETTING, []);
  return Array.isArray(value) ? value : [];
};

/**
 * Write the dialog's result into the settings and select the check in the review controller.
 * @param {object|null} result onDone's value
 * @param {{check: object|null}|null} request the dialog's request (check: the stored own check being edited)
 * @param {object} [controller] the review controller (selectCheck, view)
 */
export function saveCustomCheck(result, request, controller) {
  if (!result || !request) return false;
  const list = storedList();
  const own = request.check || null;
  let next;
  let selectId = null;

  if (result.delete) {
    if (!own) return false;
    next = list.filter(entry => !(entry && entry.id === own.id));
  } else if (own) {
    next = list.map(entry => (entry && entry.id === own.id
      ? { ...entry, label: String(result.label || '').trim(), instruction: String(result.instruction || '').trim(), suggest: !!result.suggest }
      : entry));
    selectId = own.id;
  } else {
    if (!canAddCustomCheck(list).ok) return false;
    const made = makeCustomCheck(result);
    next = list.concat([made]);
    selectId = made.id;
  }
  getSettingsStore().set(SETTING, next);

  if (!controller) return true;
  if (selectId) {
    const check = findCheck(selectId, next);
    if (check) controller.selectCheck(check);
  } else {
    const shown = controller.view().check;
    if (shown && own && shown.id === own.id) controller.selectCheck(findCheck(FIRST_CHECK));
  }
  return true;
}

function CheckForm({ check, existing, onDone, askConfirm }) {
  const [label, setLabel] = useState(check ? String(check.label || '') : '');
  const [instruction, setInstruction] = useState(check ? String(check.instruction || '') : '');
  const [suggest, setSuggest] = useState(check ? !!check.suggest : false);
  const [errors, setErrors] = useState({});

  const cancel = () => onDone(null);
  const save = () => {
    const verdict = validateCustomCheck({ label, instruction }, existing, check ? check.id : null);
    if (!verdict.ok) {
      setErrors(verdict.errors);
      return;
    }
    onDone({ label: label.trim(), instruction: instruction.trim(), suggest });
  };
  const remove = async () => {
    const yes = typeof askConfirm === 'function'
      ? await askConfirm(DELETE_QUESTION.title, DELETE_QUESTION.message, DELETE_QUESTION.confirm, 'Peruuta', { danger: true })
      : false;
    if (yes) onDone({ delete: true });
  };

  return e(Dialog, {
    title: TEXT.title,
    size: 'md',
    className: 'faust-review-check',
    dismissOnScrim: false,
    onClose: cancel,
    footerStart: check
      ? e('button', { type: 'button', className: 'faust-btn faust-btn--lg faust-btn--danger', onClick: remove }, TEXT.remove)
      : null,
    footer: [
      e('button', { key: 'cancel', type: 'button', className: 'faust-btn faust-btn--lg', onClick: cancel }, TEXT.cancel),
      e('button', { key: 'save', type: 'button', className: 'faust-btn faust-btn--lg faust-btn--primary', onClick: save }, TEXT.save)
    ]
  },
    // No room for another own check (the picker does not offer one then; this is the dialog's own guard)
    errors.limit && e(Callout, { role: 'error' }, errors.limit),
    e(Field, { label: TEXT.name, error: errors.label || null },
      e('input', {
        type: 'text',
        className: 'faust-input',
        value: label,
        placeholder: TEXT.namePlaceholder,
        onChange: (ev) => {
          setLabel(ev.target.value);
          if (errors.label) setErrors(prev => ({ ...prev, label: undefined }));
        }
      })),
    e(Field, { label: TEXT.instruction, error: errors.instruction || null },
      e('textarea', {
        className: 'faust-textarea faust-textarea--author',
        rows: 5,
        value: instruction,
        placeholder: TEXT.instructionPlaceholder,
        onChange: (ev) => {
          setInstruction(ev.target.value);
          if (errors.instruction) setErrors(prev => ({ ...prev, instruction: undefined }));
        }
      })),
    e('label', { className: 'faust-check faust-check--serif', style: { marginTop: 'var(--sp-4)' } },
      e('input', { type: 'checkbox', checked: suggest, onChange: (ev) => setSuggest(ev.target.checked) }),
      e('span', { style: { display: 'flex', flexDirection: 'column' } },
        TEXT.suggest,
        e('span', { className: 'faust-check__hint', style: { marginLeft: 0 } }, TEXT.suggestHint)))
  );
}

export function ReviewCheckDialog({ request, existing, onDone, askConfirm }) {
  if (!request) return null;
  return e(CheckForm, {
    key: request.check ? request.check.id : 'new',
    check: request.check || null,
    existing: Array.isArray(existing) ? existing : [],
    onDone: (result) => { if (onDone) onDone(result); },
    askConfirm
  });
}

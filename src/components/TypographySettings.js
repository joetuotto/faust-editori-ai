/**
 * src/components/TypographySettings.js - the two settings of the Finnish typing rules (stage I-06).
 *
 *   SmartTypingSwitch({ value, onChange, disabledReason })
 *       Tietopaneeli ▸ Ulkoasu, directly after Kirjoituskonetila and drawn like it: a two-option
 *       segmented control (Päällä / Pois) with the hint under it. value is the ui-prefs key
 *       typo.smartTyping; with disabledReason (a project in another language) both options are
 *       disabled and the reason is the hint.
 *   LineStartDashSelect({ project, onChange })
 *       Projektin asetukset, after the five fields: Rivin alun viiva (Luettelo / Vuorosanaviiva) shows
 *       effectiveLineStartDash(project) and writes project.typography.lineStartDash. It decides how
 *       existing "- " lines are read by Tarkista typografia and Kielenhuolto; a typed "- " at a line
 *       start always stays a list (contracts.md 8.5).
 *
 * Strings: contracts.md 8.5, reconcile R-41. Classes of styles/faust-components.css; no style object.
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */
import { Field } from './ui.js';
import { shortcut } from './Dialogs.js';
import { effectiveLineStartDash } from '../editor/typography.fi.js';

const { createElement: e } = React;

const DASH_HINTS = {
  list: 'Rivin alun ”- ” on luettelo. Vuorosanaviivan saat kirjoittamalla kaksi yhdysmerkkiä (--).',
  dialogue: 'Rivin alun ”- ” -rivit tulkitaan vuorosanoiksi tarkistuksissa ja kielenhuollossa. Kirjoittaessa vuorosanaviiva syntyy kahdesta yhdysmerkistä (--).'
};
const FOLLOWS_GENRE = 'Oletus tulee projektin genrestä.';

export function SmartTypingSwitch({ value, onChange, disabledReason }) {
  const on = value !== false;
  const disabled = !!disabledReason;
  const option = (label, checked, next) => e('button', {
    type: 'button',
    className: 'faust-segmented__option',
    role: 'radio',
    'aria-checked': checked,
    disabled,
    onClick: () => { if (onChange && checked !== true) onChange(next); }
  }, label);

  return e('div', { className: 'faust-field' },
    e('div', { className: 'faust-field__label' }, 'Älykäs kirjoitus'),
    e('div', { className: 'faust-segmented faust-segmented--block', role: 'radiogroup', 'aria-label': 'Älykäs kirjoitus' },
      option('Päällä', on, true),
      option('Pois', !on, false)
    ),
    e('div', { className: 'faust-field__hint' }, disabled
      ? disabledReason
      : `Lainausmerkki ” ja ajatusviiva – syntyvät kirjoittaessa. ${shortcut('CmdOrCtrl+Z')} heti muunnoksen jälkeen palauttaa kirjoittamasi merkit.`)
  );
}

export function LineStartDashSelect({ project, onChange }) {
  const value = effectiveLineStartDash(project || {});
  const stored = project && project.typography ? project.typography.lineStartDash : null;
  const followsGenre = stored !== 'list' && stored !== 'dialogue';
  return e(Field, {
    label: 'Rivin alun viiva',
    hint: e(React.Fragment, null,
      DASH_HINTS[value] || DASH_HINTS.dialogue,
      followsGenre && e('br'),
      followsGenre && FOLLOWS_GENRE)
  },
    e('select', {
      id: 'project-line-start-dash',
      name: 'projectLineStartDash',
      className: 'faust-select',
      value,
      onChange: (ev) => { if (onChange) onChange(ev.target.value === 'list' ? 'list' : 'dialogue'); }
    },
      e('option', { value: 'list' }, 'Luettelo'),
      e('option', { value: 'dialogue' }, 'Vuorosanaviiva')
    )
  );
}

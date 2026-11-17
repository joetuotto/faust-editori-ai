/**
 * Small dialogs shared across the app, and the helpers that name keys and count things
 *
 * TextPromptDialog - asks for one line of text. Electron has no window.prompt(),
 *                    so this is what "name this bookmark" and friends use.
 * ConfirmDialog    - a yes/no question inside the app window (askConfirm in app.js).
 * ShortcutsDialog  - the list of keyboard shortcuts (Ohje → Pikanäppäimet).
 * ExportDialog     - Vie käsikirjoitus.
 * CollectionDialog - Uusi kokoelma.
 *
 * shortcut(), shortcutKeys() - an Electron accelerator ('CmdOrCtrl+Shift+N') as the running
 *                    platform writes it ('⇧⌘N' on macOS, 'Ctrl+Shift+N' elsewhere).
 * count(), countParts() - a number and its noun in Finnish ('1 luku', '2 lukua').
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */

import { icons } from './icons.js';
import { layerStack } from './ui.js';

const { createElement: e, useState, useEffect, useLayoutEffect, useRef, useId } = React;

// Frame (styles/faust-components.css, sections 3, 4 and 9). Prompt and confirm are one-box
// panels above every modal (--top); shortcuts, export and collection have header, body and footer.
const SCRIM = 'faust-scrim';
const SCRIM_TOP = 'faust-scrim faust-scrim--top';
const plainPanel = (size) => `faust-dialog faust-dialog--${size} faust-dialog--plain`;
const buttonClass = ({ primary = false, danger = false } = {}) =>
  'faust-btn faust-btn--lg' + (primary ? ' faust-btn--primary' : '') + (danger ? ' faust-btn--danger' : '');
// The button row of a one-box panel: Peruuta first, the action last and right-aligned
const buttonRowStyle = { display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-5)' };

// The close control of a dialog header (Esc closes these dialogs too)
const closeButton = (onClose) => e('button', {
  type: 'button',
  className: 'faust-btn faust-btn--icon',
  'aria-label': 'Sulje',
  title: 'Sulje (Esc)',
  onClick: onClose
}, icons.close({ size: 16 }));

const dialogHeader = (titleId, title, onClose) => e('div', { className: 'faust-dialog__header' },
  e('div', { className: 'faust-dialog__heading' },
    e('h2', { id: titleId, className: 'faust-dialog__title' }, title)
  ),
  closeButton(onClose)
);

/**
 * An open dialog of this file is a layer of the layer stack in ui.js (R-70). Esc reaches the
 * topmost layer only, through the stack's one capture listener on window, and runs onEscape
 * (a function that does nothing: the layer takes Esc and ignores it). Returns how many layers were
 * open under it when it opened, so that it can stand above them; closing it gives the focus back
 * to where it was.
 */
function useLayer(active, onEscape) {
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;
  const [below, setBelow] = useState(0);
  useLayoutEffect(() => {
    if (!active) return undefined;
    const previous = document.activeElement;
    setBelow(layerStack.size());
    const token = layerStack.push((ev) => escapeRef.current(ev));
    return () => {
      layerStack.remove(token);
      if (previous && previous.focus && document.contains(previous)) previous.focus();
    };
  }, [active]);
  return below;
}

// The scrim of shortcuts, export and collection: above the layers that were open before it, in
// the order of opening, with the dimming painted once (V 4.8, stacking). Prompt and confirm stay
// on --top, above every dialog.
const stackedScrim = (below) => (below > 0
  ? { className: SCRIM + ' is-stacked', style: { zIndex: `calc(var(--z-modal) + ${below + 1})` } }
  : { className: SCRIM });

// ---------------------------------------------------------------------------
// Keys

export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || '');
const isLinux = !isMac && typeof navigator !== 'undefined' && /Linux/i.test(navigator.platform || '');

// Modifier words of Electron's accelerator syntax
const MODIFIER = {
  CmdOrCtrl: 'cmdOrCtrl', CommandOrControl: 'cmdOrCtrl',
  Cmd: 'cmd', Command: 'cmd', Super: 'super', Meta: 'super',
  Ctrl: 'ctrl', Control: 'ctrl',
  Alt: 'alt', Option: 'alt', AltGr: 'alt',
  Shift: 'shift'
};
// Display order: macOS ⌃ ⌥ ⇧ ⌘ then the key; elsewhere Ctrl, Alt, Shift then the key
const MAC_MODIFIERS = [['ctrl', '⌃'], ['alt', '⌥'], ['shift', '⇧'], ['cmd', '⌘']];
const OTHER_MODIFIERS = [['super', 'Super'], ['ctrl', 'Ctrl'], ['alt', 'Alt'], ['shift', 'Shift']];
// Keys with a name: [macOS, elsewhere]
const KEY_NAME = {
  Plus: ['+', '+'],
  Enter: ['↩', 'Enter'], Return: ['↩', 'Enter'],
  Backspace: ['⌫', 'Backspace'], Delete: ['⌦', 'Delete'],
  Up: ['↑', 'Up'], Down: ['↓', 'Down'], Left: ['←', 'Left'], Right: ['→', 'Right'],
  Escape: ['Esc', 'Esc'], Esc: ['Esc', 'Esc'],
  Space: ['Space', 'Space'], Tab: ['⇥', 'Tab']
};

/**
 * The keys of an Electron accelerator as the running platform writes them, one entry per keycap:
 * shortcutKeys('CmdOrCtrl+Shift+N') is ['⇧', '⌘', 'N'] on macOS and ['Ctrl', 'Shift', 'N'] elsewhere.
 * @param {string} accelerator
 * @returns {string[]}
 */
export function shortcutKeys(accelerator) {
  const parts = String(accelerator || '').split('+');
  let key = parts.pop();
  // 'CmdOrCtrl++' names the plus key itself
  if (key === '' && parts.length && parts[parts.length - 1] === '') { parts.pop(); key = '+'; }

  const held = new Set();
  for (const part of parts) {
    const role = MODIFIER[part];
    if (role === 'cmdOrCtrl') held.add(isMac ? 'cmd' : 'ctrl');
    else if (role === 'cmd') held.add(isMac ? 'cmd' : 'super');
    else if (role === 'super') held.add(isMac ? 'cmd' : 'super');
    else if (role) held.add(role);
  }

  const order = isMac ? MAC_MODIFIERS : OTHER_MODIFIERS;
  const keys = order.filter(([role]) => held.has(role)).map(([, face]) => face);
  if (key) {
    const named = KEY_NAME[key];
    keys.push(named ? named[isMac ? 0 : 1] : key.length === 1 ? key.toUpperCase() : key);
  }
  return keys;
}

/**
 * An Electron accelerator as one string for a tooltip: '⇧⌘N' on macOS, 'Ctrl+Shift+N' elsewhere.
 * @param {string} accelerator
 */
export function shortcut(accelerator) {
  return shortcutKeys(accelerator).join(isMac ? '' : '+');
}

// The menu's accelerators, group by group in menu order (labels are the menu labels without
// the ellipsis). Kept next to the menu definition in electron.js: change both together.
// A row is [label, accelerator] or [label, accelerator, flag]; the flag 'ai' marks a row whose
// menu item is a tekoäly command (hidden with aiDisabled). The accelerators are Electron's own
// strings; the role items carry Electron's default accelerators (the FAUST group exists on
// macOS only, where CmdOrCtrl is ⌘).
export const SHORTCUT_GROUPS = [
  ...(isMac ? [{
    title: 'FAUST',
    items: [
      ['Asetukset', 'CmdOrCtrl+,'],
      ['Kätke FAUST', 'CmdOrCtrl+H'],
      ['Kätke muut', 'CmdOrCtrl+Alt+H'],
      ['Lopeta FAUST', 'CmdOrCtrl+Q']
    ]
  }] : []),
  {
    title: 'Tiedosto',
    items: [
      ['Uusi projekti', 'CmdOrCtrl+N'],
      ['Avaa', 'CmdOrCtrl+O'],
      ['Tallenna', 'CmdOrCtrl+S'],
      ['Tallenna nimellä', 'CmdOrCtrl+Shift+S'],
      ['Vie', 'CmdOrCtrl+E'],
      ['Tulosta', 'CmdOrCtrl+P'],
      ['Sulje ikkuna', 'CmdOrCtrl+W'],
      ...(isMac ? [] : [['Asetukset', 'CmdOrCtrl+,']]),
      ...(isLinux ? [['Lopeta', 'CmdOrCtrl+Q']] : [])
    ]
  },
  {
    title: 'Muokkaa',
    items: [
      ['Kumoa', 'CmdOrCtrl+Z'],
      ['Tee uudelleen', 'CmdOrCtrl+Shift+Z'],
      ['Leikkaa', 'CmdOrCtrl+X'],
      ['Kopioi', 'CmdOrCtrl+C'],
      ['Liitä', 'CmdOrCtrl+V'],
      ['Valitse kaikki', 'CmdOrCtrl+A'],
      ['Etsi', 'CmdOrCtrl+F'],
      ['Etsi seuraava', 'CmdOrCtrl+G'],
      ['Etsi edellinen', 'CmdOrCtrl+Shift+G'],
      ['Etsi ja korvaa', 'CmdOrCtrl+Alt+F']
    ]
  },
  {
    title: 'Muotoile',
    items: [
      ['Lihavointi', 'CmdOrCtrl+B'],
      ['Kursivointi', 'CmdOrCtrl+I'],
      ['Alleviivaus', 'CmdOrCtrl+U'],
      ['Yliviivaus', 'CmdOrCtrl+Shift+X'],
      ['Otsikko 1', 'CmdOrCtrl+Alt+1'],
      ['Otsikko 2', 'CmdOrCtrl+Alt+2'],
      ['Otsikko 3', 'CmdOrCtrl+Alt+3'],
      ['Leipäteksti', 'CmdOrCtrl+Alt+0'],
      ['Luettelo', 'CmdOrCtrl+Shift+8'],
      ['Numeroitu luettelo', 'CmdOrCtrl+Shift+7'],
      ['Isoiksi kirjaimiksi', 'CmdOrCtrl+Shift+U'],
      ['Pieniksi kirjaimiksi', 'CmdOrCtrl+Shift+L']
    ]
  },
  {
    title: 'Lisää',
    items: [
      ['Uusi luku', 'CmdOrCtrl+Shift+N']
    ]
  },
  {
    title: 'Näytä',
    items: [
      ['Sivupalkki', 'CmdOrCtrl+1'],
      ['Tietopaneeli', 'CmdOrCtrl+2'],
      ['Liminal Engine (tekoälyavustaja)', 'CmdOrCtrl+Shift+K', 'ai'],
      ['Keskittymistila', 'CmdOrCtrl+Shift+F'],
      ['Lähennä', 'CmdOrCtrl+Plus'],
      ['Loitonna', 'CmdOrCtrl+-'],
      ['Todellinen koko', 'CmdOrCtrl+0'],
      ['Teema: NOX (tumma) / DEIS (vaalea)', 'CmdOrCtrl+Shift+D'],
      ['Koko näyttö', isMac ? 'Ctrl+Command+F' : 'F11']
    ]
  },
  {
    title: 'Työkalut',
    items: [
      ['Aikajana', 'CmdOrCtrl+Shift+T'],
      ['Tutkimuskansio', 'CmdOrCtrl+Shift+R']
    ]
  },
  {
    title: 'Ikkuna',
    items: [
      ['Pienennä', 'CmdOrCtrl+M']
    ]
  },
  {
    title: 'Ohje',
    items: [
      ['Kehittäjätyökalut', isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I']
    ]
  }
];

// Keys that live only in the text and have no menu item, shown under the heading 'Tekstissä'.
// Same row shape; the flag 'typed' marks a typed sequence (its first word is one keycap, the
// rest follows as text). The feature stages add their groups here.
export const EDITOR_SHORTCUT_GROUPS = [];

const shortcutRow = ([label, keys, flag]) => {
  if (flag === 'typed') {
    const text = String(keys);
    const space = text.search(/\s/);
    const typed = space === -1 ? text : text.slice(0, space);
    const rest = space === -1 ? '' : text.slice(space + 1);
    return e('div', { key: label, className: 'faust-shortcut' },
      e('span', null, label),
      e('span', { className: 'faust-shortcut__keys' },
        e('kbd', { className: 'faust-kbd' }, typed),
        rest && e('span', { className: 'faust-meta' }, rest)
      )
    );
  }
  return e('div', { key: label, className: 'faust-shortcut' },
    e('span', null, label),
    e('span', { className: 'faust-shortcut__keys' },
      shortcutKeys(keys).map((key, index) => e('kbd', { key: index, className: 'faust-kbd' }, key))
    )
  );
};

// Two columns of groups; a group's rows that are tekoäly commands leave while tekoäly is off
const shortcutGrid = (groups, aiDisabled) => e('div', { className: 'faust-shortcuts' },
  groups
    .map(group => ({ ...group, items: group.items.filter(item => !(aiDisabled && item[2] === 'ai')) }))
    .filter(group => group.items.length > 0)
    .map(group =>
      e('div', { key: group.title, style: { marginBottom: 'var(--sp-4)' } },
        e('div', { className: 'faust-section__title', style: { marginBottom: 'var(--sp-1)' } }, group.title),
        group.items.map(shortcutRow)
      )
    )
);

// ---------------------------------------------------------------------------
// Counting

// Partitive of the nouns the app counts (rule B.13); a phrase is inflected word by word
// ('muu juonilanka' → 'muuta juonilankaa')
const PARTITIVE = {
  luku: 'lukua', sana: 'sanaa', merkki: 'merkkiä', sivu: 'sivua',
  hahmo: 'hahmoa', paikka: 'paikkaa', juonilanka: 'juonilankaa', versio: 'versiota',
  ristiriita: 'ristiriitaa', varoitus: 'varoitusta', merkintä: 'merkintää', osuma: 'osumaa',
  pyyntö: 'pyyntöä', tähti: 'tähteä', malli: 'mallia', muu: 'muuta'
};

/**
 * A count as [number, noun], for readouts that set the number apart: countParts(2, 'luku') is ['2', 'lukua'].
 * @param {number} n
 * @param {string} word the noun in the nominative singular
 * @returns {[string, string]}
 */
export function countParts(n, word) {
  const value = Number(n) || 0;
  const noun = value === 1 ? word : String(word).split(' ').map(part => PARTITIVE[part] || part).join(' ');
  return [value.toLocaleString('fi-FI'), noun];
}

/**
 * A count in Finnish: count(1, 'luku') is '1 luku', count(80000, 'sana') is '80 000 sanaa'.
 * @param {number} n
 * @param {string} word
 */
export function count(n, word) {
  return countParts(n, word).join(' ');
}

// '<Toiminto> epäonnistui: <syy>.' with one full stop (rule B.12)
const failure = (action, reason) =>
  `${action} epäonnistui: ${String(reason || 'tuntematon virhe').trim().replace(/\.+$/, '')}.`;

// ---------------------------------------------------------------------------
// Dialogs

/**
 * @param {{ request: null | { title: string, defaultValue?: string, placeholder?: string, confirmLabel?: string }, onDone: (value: string|null) => void }} props
 * onDone gets the text, or null if the dialog was cancelled.
 */
export function TextPromptDialog({ request, onDone }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const titleId = useId();
  // Esc cancels, wherever the focus is (the layer stack)
  useLayer(!!request, () => onDone(null));

  useEffect(() => {
    if (!request) return;
    setValue(request.defaultValue || '');
    // Focus after the dialog is in the document, with the default text selected
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [request]);

  if (!request) return null;

  // Esc never reaches the field: the layer stack takes it first
  const onKeyDown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      onDone(value);
    }
  };

  // A form: a press on the scrim closes nothing (R-69); Esc and Peruuta cancel
  return e('div', { className: SCRIM_TOP },
    e('div', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, className: plainPanel('sm') },
      e('h2', { id: titleId, className: 'faust-dialog__title', style: { whiteSpace: 'pre-line' } }, request.title),
      e('input', {
        ref: inputRef,
        type: 'text',
        className: 'faust-input',
        'aria-labelledby': titleId,
        value,
        placeholder: request.placeholder || '',
        onChange: (ev) => setValue(ev.target.value),
        onKeyDown
      }),
      e('div', { style: buttonRowStyle },
        e('button', { type: 'button', onClick: () => onDone(null), className: buttonClass() }, 'Peruuta'),
        e('button', { type: 'button', onClick: () => onDone(value), className: buttonClass({ primary: true }) }, request.confirmLabel || 'OK')
      )
    )
  );
}

/**
 * @param {{ open: boolean, onClose: () => void, aiDisabled?: boolean }} props
 * aiDisabled leaves out the rows of tekoäly commands.
 */
export function ShortcutsDialog({ open, onClose, aiDisabled = false }) {
  const titleId = useId();
  const below = useLayer(open, () => onClose());

  if (!open) return null;

  return e('div', {
    ...stackedScrim(below),
    onMouseDown: (ev) => { if (ev.target === ev.currentTarget) onClose(); }
  },
    e('div', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      className: 'faust-dialog faust-dialog--lg',
      style: { '--dialog-w': '800px' }
    },
      dialogHeader(titleId, 'Pikanäppäimet', onClose),
      e('div', { className: 'faust-dialog__body' },
        // Two columns of rows: the command in serif, each key a keycap
        shortcutGrid(SHORTCUT_GROUPS, aiDisabled),
        EDITOR_SHORTCUT_GROUPS.length > 0 && e('div', { className: 'faust-section' },
          e('div', { className: 'faust-section__head' },
            e('div', { className: 'faust-section__title', role: 'heading', 'aria-level': 3 }, 'Tekstissä')
          ),
          shortcutGrid(EDITOR_SHORTCUT_GROUPS, aiDisabled)
        )
      )
    )
  );
}

const EXPORT_FORMATS = [
  { id: 'docx', label: 'Word (.docx)', hint: 'Kustantajalle ja jatkomuokkaukseen' },
  { id: 'pdf', label: 'PDF', hint: 'Valmis sivuasettelu, sivunumerot' },
  { id: 'epub', label: 'EPUB', hint: 'E-kirja lukulaitteisiin' },
  { id: 'rtf', label: 'RTF', hint: 'Vanhemmat tekstinkäsittelyohjelmat' },
  { id: 'html', label: 'HTML', hint: 'Verkkosivu' },
  { id: 'md', label: 'Markdown (.md)', hint: 'Teksti muotoilumerkkeineen' },
  { id: 'txt', label: 'Teksti (.txt)', hint: 'Pelkkä teksti ilman muotoiluja' }
];

/**
 * Export dialog: what to export and in which format.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   chapters: Array<{ id: string, title: string, words: number }>,
 *   activeChapterId: string|null,
 *   onExport: (choice: { format: string, chapterIds: string[]|null }) => Promise<{ success: boolean, canceled?: boolean, path?: string, error?: string }>
 * }} props
 */
export function ExportDialog({ open, onClose, chapters, activeChapterId, onExport }) {
  const [scope, setScope] = useState('all'); // 'all' | 'current' | 'selected'
  const [format, setFormat] = useState('docx');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { kind: 'ok' | 'error', text }
  const titleId = useId();

  // Start clean every time the dialog opens
  useEffect(() => {
    if (open) {
      setMessage(null);
      setBusy(false);
    }
  }, [open]);

  const below = useLayer(open, () => onClose());

  if (!open) return null;

  const currentAvailable = chapters.some(chapter => chapter.id === activeChapterId);
  const chapterIds = scope === 'all' ? null
    : scope === 'current' ? (currentAvailable ? [activeChapterId] : [])
    : chapters.filter(chapter => selected.includes(chapter.id)).map(chapter => chapter.id);
  const canExport = !busy && chapters.length > 0 && (chapterIds === null || chapterIds.length > 0);

  const runExport = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await onExport({ format, chapterIds });
      if (result.success) {
        setMessage({ kind: 'ok', text: `Viety: ${result.path}` });
      } else if (!result.canceled) {
        setMessage({ kind: 'error', text: failure('Vienti', result.error) });
      }
    } catch (error) {
      setMessage({ kind: 'error', text: failure('Vienti', error && error.message) });
    }
    setBusy(false);
  };

  const sectionTitle = (text) => e('div', { className: 'faust-section__head' },
    e('div', { className: 'faust-section__title' }, text)
  );

  // Box, label and hint in three columns (.faust-check-group--grid), so the hints share one edge
  const radio = (name, value, current, onChange, label, hint, disabled) => e('label', {
    key: value,
    className: 'faust-check faust-check--serif'
  },
    e('input', { type: 'radio', name, value, checked: current === value, disabled, onChange: () => onChange(value) }),
    e('span', null, label),
    e('span', { className: 'faust-check__hint' }, hint || '')
  );

  // A form (choices and an action): a press on the scrim closes nothing (R-69)
  return e('div', stackedScrim(below),
    e('div', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      'aria-busy': busy || undefined,
      className: 'faust-dialog faust-dialog--md'
    },
      dialogHeader(titleId, 'Vie käsikirjoitus', onClose),

      e('div', { className: 'faust-dialog__body' },
        chapters.length === 0 && e('p', { className: 'faust-serif' },
          'Projektissa ei ole vielä tekstiä vietäväksi.'),

        e('div', { className: 'faust-section' },
          sectionTitle('Mitä viedään'),
          e('div', { className: 'faust-check-group faust-check-group--grid', role: 'radiogroup', 'aria-label': 'Mitä viedään' },
            radio('export-scope', 'all', scope, setScope, 'Koko käsikirjoitus', count(chapters.length, 'luku')),
            radio('export-scope', 'current', scope, setScope, 'Avoin luku', currentAvailable ? null : 'luvussa ei ole tekstiä', !currentAvailable),
            radio('export-scope', 'selected', scope, setScope, 'Valitut luvut', null)
          ),

          scope === 'selected' && e('div', {
            className: 'faust-card faust-card--compact',
            style: { maxHeight: '160px', overflowY: 'auto', margin: 'var(--sp-2) 0 0 var(--sp-5)' }
          },
            chapters.map(chapter => e('label', {
              key: chapter.id,
              className: 'faust-check faust-check--serif'
            },
              e('input', {
                type: 'checkbox',
                checked: selected.includes(chapter.id),
                onChange: (ev) => setSelected(prev => ev.target.checked
                  ? [...prev, chapter.id]
                  : prev.filter(id => id !== chapter.id))
              }),
              e('span', { style: { flex: 1, minWidth: 0 } }, chapter.title),
              e('span', { className: 'faust-check__hint' }, count(chapter.words, 'sana'))
            ))
          )
        ),

        e('div', { className: 'faust-section' },
          sectionTitle('Muoto'),
          e('div', { className: 'faust-check-group faust-check-group--grid', role: 'radiogroup', 'aria-label': 'Muoto' },
            EXPORT_FORMATS.map(item => radio('export-format', item.id, format, setFormat, item.label, item.hint))
          )
        ),

        message && e('div', {
          role: message.kind === 'error' ? 'alert' : 'status',
          className: 'faust-callout ' + (message.kind === 'error' ? 'faust-callout--error' : 'faust-callout--success')
        },
          e('span', { className: 'faust-callout__icon' },
            message.kind === 'error' ? icons.error({ size: 16 }) : icons.success({ size: 16 })),
          e('div', { className: 'faust-callout__title', style: { overflowWrap: 'anywhere' } }, message.text)
        )
      ),

      e('div', { className: 'faust-dialog__footer' },
        e('button', { type: 'button', onClick: onClose, className: buttonClass(), title: 'Sulje (Esc)' }, 'Sulje'),
        e('button', {
          type: 'button',
          onClick: runExport,
          disabled: !canExport,
          'aria-busy': busy || undefined,
          className: buttonClass({ primary: true })
        }, busy && e('span', { className: 'faust-spinner faust-spinner--sm' }), busy ? 'Viedään…' : 'Vie…')
      )
    )
  );
}

/**
 * A yes/no question inside the app window. Unlike the native confirm box it does
 * not freeze the app while it waits.
 *
 * Request fields besides the texts:
 *  - danger:        the confirm button is the destructive one (it deletes, replaces or discards)
 *  - requireChoice: Esc answers nothing; only a button closes the question (the recovery question)
 *  - dangerCancel:  the cancel button is the destructive choice (it discards something)
 * Focus starts on the confirm button, so Enter confirms.
 *
 * @param {{ request: null | { title: string, message?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean, requireChoice?: boolean, dangerCancel?: boolean }, onDone: (confirmed: boolean) => void }} props
 */
export function ConfirmDialog({ request, onDone }) {
  const confirmRef = useRef(null);
  const titleId = useId();
  // Esc answers Peruuta; a question that must be answered with a button takes Esc and does
  // nothing with it (BUG-1), so nothing under it closes either
  useLayer(!!request, () => { if (!request.requireChoice) onDone(false); });

  useEffect(() => {
    if (!request) return;
    const timer = setTimeout(() => confirmRef.current && confirmRef.current.focus(), 0);
    return () => clearTimeout(timer);
  }, [request]);

  if (!request) return null;

  return e('div', { className: SCRIM_TOP },
    e('div', { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': titleId, className: plainPanel('sm') },
      e('h2', { id: titleId, className: 'faust-dialog__title' }, request.title),
      request.message && e('div', { className: 'faust-serif', style: { whiteSpace: 'pre-line' } }, request.message),
      e('div', { style: buttonRowStyle },
        e('button', {
          type: 'button',
          onClick: () => onDone(false),
          className: buttonClass({ danger: !!request.dangerCancel })
        }, request.cancelLabel || 'Peruuta'),
        e('button', {
          type: 'button',
          ref: confirmRef,
          onClick: () => onDone(true),
          className: buttonClass({ primary: true, danger: !!request.danger })
        }, request.confirmLabel || 'OK')
      )
    )
  );
}

// The four chapter states in the order of the chapter form; the stored keys stay English
const STATUS_OPTIONS = [
  ['plan', 'Suunnitteilla'],
  ['draft', 'Luonnos'],
  ['revision', 'Muokattavana'],
  ['final', 'Valmis']
];

const COLLECTION_KINDS = [
  ['status', 'Luvut tilan mukaan'],
  ['character', 'Luvut, joissa esiintyy hahmo'],
  ['search', 'Luvut, joissa on hakusana']
];

/**
 * Uusi kokoelma (BUG-2): one dialog in place of the chain of prompts.
 * onCreate(name, type, filter): type 'status' | 'character' | 'search'; filter is a status key
 * (plan, draft, revision, final), a character name or a search term. Peruuta, Esc, an empty
 * name and an empty character name or search term create nothing (M D.4 BUG-2: an empty step
 * creates nothing); an empty field shows its error under it (R-68).
 *
 * @param {{ open: boolean, onCancel: () => void, onCreate: (name: string, type: string, filter: string) => void }} props
 */
export function CollectionDialog({ open, onCancel, onCreate }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('status');
  const [status, setStatus] = useState('plan');
  const [character, setCharacter] = useState('');
  const [term, setTerm] = useState('');
  const [nameMissing, setNameMissing] = useState(false);
  const [filterMissing, setFilterMissing] = useState(false);
  const nameRef = useRef(null);
  const filterRef = useRef(null);
  const titleId = useId();
  const nameErrorId = useId();
  const filterErrorId = useId();

  // Start clean every time the dialog opens, with the name field focused
  useEffect(() => {
    if (!open) return;
    setName('');
    setType('status');
    setStatus('plan');
    setCharacter('');
    setTerm('');
    setNameMissing(false);
    setFilterMissing(false);
    const timer = setTimeout(() => nameRef.current && nameRef.current.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  const below = useLayer(open, () => onCancel());

  if (!open) return null;

  const create = () => {
    const trimmed = name.trim();
    const filter = type === 'status' ? status : type === 'character' ? character.trim() : term.trim();
    // A character or search collection without its word could never hold a chapter
    const noName = !trimmed;
    const noFilter = !filter;
    if (noName || noFilter) {
      setNameMissing(noName);
      setFilterMissing(noFilter);
      const first = noName ? nameRef.current : filterRef.current;
      if (first) first.focus();
      return;
    }
    onCreate(trimmed, type, filter);
  };

  // The text field of a character or search collection, with its error under it
  const filterInput = (value, setValue) => e('input', {
    ref: filterRef,
    type: 'text',
    className: 'faust-input faust-input--author',
    value,
    'aria-invalid': filterMissing || undefined,
    'aria-describedby': filterErrorId,
    onChange: (ev) => { setValue(ev.target.value); if (filterMissing) setFilterMissing(false); }
  });
  const filterError = (text) => e('span', { id: filterErrorId, className: 'faust-field__error' }, filterMissing ? text : '');

  const field = (label, control, extra) => e('label', { className: 'faust-field' },
    e('span', { className: 'faust-field__label' }, label),
    control,
    extra
  );

  return e('div', stackedScrim(below),
    e('div', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, className: 'faust-dialog faust-dialog--sm' },
      dialogHeader(titleId, 'Uusi kokoelma', onCancel),

      e('div', { className: 'faust-dialog__body' },
        field('Nimi',
          e('input', {
            ref: nameRef,
            type: 'text',
            className: 'faust-input faust-input--author',
            value: name,
            'aria-invalid': nameMissing || undefined,
            'aria-describedby': nameErrorId,
            onChange: (ev) => { setName(ev.target.value); if (nameMissing) setNameMissing(false); }
          }),
          e('span', { id: nameErrorId, className: 'faust-field__error' }, nameMissing ? 'Nimi puuttuu.' : '')
        ),

        field('Kokoelmaan kuuluvat',
          e('select', {
            className: 'faust-select',
            value: type,
            onChange: (ev) => { setType(ev.target.value); setFilterMissing(false); }
          }, COLLECTION_KINDS.map(([value, label]) => e('option', { key: value, value }, label)))
        ),

        type === 'status' && field('Luvun tila',
          e('select', {
            className: 'faust-select',
            value: status,
            onChange: (ev) => setStatus(ev.target.value)
          }, STATUS_OPTIONS.map(([value, label]) => e('option', { key: value, value }, label)))
        ),

        type === 'character' && field('Hahmon nimi',
          filterInput(character, setCharacter),
          filterError('Hahmon nimi puuttuu.')
        ),

        type === 'search' && field('Hakusana',
          filterInput(term, setTerm),
          filterError('Hakusana puuttuu.')
        )
      ),

      e('div', { className: 'faust-dialog__footer' },
        e('button', { type: 'button', onClick: onCancel, className: buttonClass() }, 'Peruuta'),
        e('button', { type: 'button', onClick: create, className: buttonClass({ primary: true }) }, 'Luo kokoelma')
      )
    )
  );
}

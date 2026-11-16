/**
 * Small dialogs shared across the app
 *
 * TextPromptDialog - asks for one line of text. Electron has no window.prompt(),
 *                    so this is what "name this bookmark" and friends use.
 * ShortcutsDialog  - the list of keyboard shortcuts (Ohje → Pikanäppäimet).
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */

const { createElement: e, useState, useEffect, useRef } = React;

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000
};

const panelStyle = {
  background: 'var(--bg-1, var(--bg))',
  color: 'var(--text)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
  padding: '20px',
  maxWidth: '90vw'
};

const buttonStyle = (primary) => ({
  padding: '8px 16px',
  background: primary ? 'var(--sigil, var(--bronze))' : 'transparent',
  border: `1px solid ${primary ? 'var(--sigil, var(--bronze))' : 'var(--border-color)'}`,
  borderRadius: '4px',
  color: primary ? '#000' : 'var(--text)',
  cursor: 'pointer',
  fontFamily: 'IBM Plex Mono',
  fontSize: '12px',
  fontWeight: primary ? 600 : 400
});

/**
 * @param {{ request: null | { title: string, defaultValue?: string, placeholder?: string }, onDone: (value: string|null) => void }} props
 * onDone gets the text, or null if the dialog was cancelled.
 */
export function TextPromptDialog({ request, onDone }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

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

  const onKeyDown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      onDone(value);
    } else if (ev.key === 'Escape') {
      // Close this dialog only, not whatever is open behind it
      ev.preventDefault();
      ev.stopPropagation();
      onDone(null);
    }
  };

  return e('div', {
    style: overlayStyle,
    onMouseDown: (ev) => { if (ev.target === ev.currentTarget) onDone(null); }
  },
    e('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': request.title, style: { ...panelStyle, width: '420px' } },
      e('div', {
        style: { fontFamily: 'EB Garamond', fontSize: '17px', marginBottom: '12px', whiteSpace: 'pre-line' }
      }, request.title),
      e('input', {
        ref: inputRef,
        type: 'text',
        value,
        placeholder: request.placeholder || '',
        onChange: (ev) => setValue(ev.target.value),
        onKeyDown,
        style: {
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 10px',
          background: 'var(--bg-2, var(--bg))',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          color: 'var(--text)',
          fontFamily: 'IBM Plex Mono',
          fontSize: '13px'
        }
      }),
      e('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' } },
        e('button', { onClick: () => onDone(null), style: buttonStyle(false) }, 'Peruuta'),
        e('button', { onClick: () => onDone(value), style: buttonStyle(true) }, 'OK')
      )
    )
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || '');
const MOD = isMac ? '⌘' : 'Ctrl+';
const SHIFT = isMac ? '⇧' : 'Shift+';
const ALT = isMac ? '⌥' : 'Alt+';

// Kept next to the menu definition in electron.js: change both together
const SHORTCUT_GROUPS = [
  {
    title: 'Tiedosto',
    items: [
      ['Uusi projekti', `${MOD}N`],
      ['Avaa', `${MOD}O`],
      ['Tallenna', `${MOD}S`],
      ['Tallenna nimellä', `${SHIFT}${MOD}S`],
      ['Vie', `${MOD}E`],
      ['Tulosta', `${MOD}P`]
    ]
  },
  {
    title: 'Muokkaa',
    items: [
      ['Kumoa', `${MOD}Z`],
      ['Tee uudelleen', `${SHIFT}${MOD}Z`],
      ['Etsi', `${MOD}F`],
      ['Etsi seuraava / edellinen', `${MOD}G / ${SHIFT}${MOD}G`],
      ['Etsi ja korvaa', `${ALT}${MOD}F`]
    ]
  },
  {
    title: 'Muotoile',
    items: [
      ['Lihavointi', `${MOD}B`],
      ['Kursivointi', `${MOD}I`],
      ['Alleviivaus', `${MOD}U`],
      ['Yliviivaus', `${SHIFT}${MOD}X`],
      ['Otsikko 1 / 2 / 3', `${ALT}${MOD}1 / 2 / 3`],
      ['Leipäteksti', `${ALT}${MOD}0`],
      ['Luettelo / numeroitu luettelo', `${SHIFT}${MOD}8 / ${SHIFT}${MOD}7`],
      ['Isoiksi / pieniksi kirjaimiksi', `${SHIFT}${MOD}U / ${SHIFT}${MOD}L`]
    ]
  },
  {
    title: 'Näytä',
    items: [
      ['Sivupalkki', `${MOD}1`],
      ['Inspector', `${MOD}2`],
      ['AI-avustaja', `${MOD}K`],
      ['Keskittymistila', `${SHIFT}${MOD}F`],
      ['Suurenna / pienennä / todellinen koko', `${MOD}+ / ${MOD}- / ${MOD}0`],
      ['Vaihda teema', `${SHIFT}${MOD}D`],
      ['Uusi luku', `${SHIFT}${MOD}N`]
    ]
  }
];

/**
 * @param {{ open: boolean, onClose: () => void }} props
 */
export function ShortcutsDialog({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (ev) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return e('div', {
    style: overlayStyle,
    onMouseDown: (ev) => { if (ev.target === ev.currentTarget) onClose(); }
  },
    e('div', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Pikanäppäimet',
      style: { ...panelStyle, width: '640px', maxHeight: '80vh', overflowY: 'auto' }
    },
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' } },
        e('div', { style: { fontFamily: 'EB Garamond', fontSize: '20px', fontWeight: 600 } }, 'Pikanäppäimet'),
        e('button', { onClick: onClose, style: buttonStyle(false) }, 'Sulje')
      ),
      e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 32px' } },
        SHORTCUT_GROUPS.map(group =>
          e('div', { key: group.title },
            e('div', {
              style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: '8px' }
            }, group.title),
            group.items.map(([label, keys]) =>
              e('div', {
                key: label,
                style: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '3px 0', fontSize: '13px' }
              },
                e('span', { style: { fontFamily: 'EB Garamond', fontSize: '15px' } }, label),
                e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '12px', color: 'var(--text-2)', whiteSpace: 'nowrap' } }, keys)
              )
            )
          )
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

  // Start clean every time the dialog opens
  useEffect(() => {
    if (open) {
      setMessage(null);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (ev) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

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
        setMessage({ kind: 'error', text: result.error || 'Vienti epäonnistui' });
      }
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    }
    setBusy(false);
  };

  const sectionTitle = (text) => e('div', {
    style: { fontFamily: 'IBM Plex Mono', fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', margin: '16px 0 8px' }
  }, text);

  const radio = (name, value, current, onChange, label, hint, disabled) => e('label', {
    key: value,
    style: { display: 'flex', alignItems: 'baseline', gap: '8px', padding: '3px 0', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }
  },
    e('input', { type: 'radio', name, value, checked: current === value, disabled, onChange: () => onChange(value) }),
    e('span', { style: { fontFamily: 'EB Garamond', fontSize: '15px' } }, label),
    hint && e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } }, hint)
  );

  return e('div', {
    style: overlayStyle,
    onMouseDown: (ev) => { if (ev.target === ev.currentTarget) onClose(); }
  },
    e('div', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Vie käsikirjoitus',
      style: { ...panelStyle, width: '520px', maxHeight: '85vh', overflowY: 'auto' }
    },
      e('div', { style: { fontFamily: 'EB Garamond', fontSize: '20px', fontWeight: 600 } }, 'Vie käsikirjoitus'),

      chapters.length === 0 && e('div', { style: { fontFamily: 'EB Garamond', fontSize: '15px', marginTop: '12px' } },
        'Projektissa ei ole vielä tekstiä vietäväksi.'),

      sectionTitle('Mitä viedään'),
      radio('export-scope', 'all', scope, setScope, 'Koko käsikirjoitus', `${chapters.length} lukua`),
      radio('export-scope', 'current', scope, setScope, 'Avoin luku', currentAvailable ? null : 'luvussa ei ole tekstiä', !currentAvailable),
      radio('export-scope', 'selected', scope, setScope, 'Valitut luvut', null),

      scope === 'selected' && e('div', {
        style: { maxHeight: '160px', overflowY: 'auto', margin: '6px 0 0 24px', padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: '4px' }
      },
        chapters.map(chapter => e('label', {
          key: chapter.id,
          style: { display: 'flex', alignItems: 'baseline', gap: '8px', padding: '2px 0', cursor: 'pointer' }
        },
          e('input', {
            type: 'checkbox',
            checked: selected.includes(chapter.id),
            onChange: (ev) => setSelected(prev => ev.target.checked
              ? [...prev, chapter.id]
              : prev.filter(id => id !== chapter.id))
          }),
          e('span', { style: { fontFamily: 'EB Garamond', fontSize: '14px', flex: 1 } }, chapter.title),
          e('span', { style: { fontFamily: 'IBM Plex Mono', fontSize: '10px', color: 'var(--text-3)' } }, `${chapter.words} sanaa`)
        ))
      ),

      sectionTitle('Muoto'),
      EXPORT_FORMATS.map(item => radio('export-format', item.id, format, setFormat, item.label, item.hint)),

      message && e('div', {
        role: 'status',
        style: {
          marginTop: '14px',
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          lineHeight: '1.4',
          wordBreak: 'break-all',
          color: message.kind === 'error' ? 'var(--error, #c0392b)' : 'var(--sigil, var(--bronze))'
        }
      }, message.text),

      e('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' } },
        e('button', { onClick: onClose, style: buttonStyle(false) }, 'Sulje'),
        e('button', {
          onClick: runExport,
          disabled: !canExport,
          style: { ...buttonStyle(true), opacity: canExport ? 1 : 0.5, cursor: canExport ? 'pointer' : 'not-allowed' }
        }, busy ? 'Viedään...' : 'Vie...')
      )
    )
  );
}

/**
 * A yes/no question inside the app window. Unlike window.confirm() it does
 * not freeze the app while it waits.
 *
 * @param {{ request: null | { title: string, message?: string, confirmLabel?: string, cancelLabel?: string }, onDone: (confirmed: boolean) => void }} props
 */
export function ConfirmDialog({ request, onDone }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!request) return;
    const timer = setTimeout(() => confirmRef.current && confirmRef.current.focus(), 0);
    const onKeyDown = (ev) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        onDone(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [request]);

  if (!request) return null;

  return e('div', { style: overlayStyle },
    e('div', { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': request.title, style: { ...panelStyle, width: '460px' } },
      e('div', { style: { fontFamily: 'EB Garamond', fontSize: '19px', fontWeight: 600, marginBottom: '10px' } }, request.title),
      request.message && e('div', {
        style: { fontFamily: 'EB Garamond', fontSize: '15px', lineHeight: '1.5', whiteSpace: 'pre-line' }
      }, request.message),
      e('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' } },
        e('button', { onClick: () => onDone(false), style: buttonStyle(false) }, request.cancelLabel || 'Peruuta'),
        e('button', { ref: confirmRef, onClick: () => onDone(true), style: buttonStyle(true) }, request.confirmLabel || 'OK')
      )
    )
  );
}

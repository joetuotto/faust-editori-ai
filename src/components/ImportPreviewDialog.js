/**
 * ImportPreviewDialog - Tuonnin esikatselu (report 4.14, stage I-01)
 *
 * Shows what Tiedosto ▸ Tuo tekstiä… or Tuo kansio… read, before anything is written to the
 * project: one row per chapter (include, order, title), where the chapters go (after the
 * existing ones, or in their place) and the text of the selected row as it will look in the
 * manuscript (a read-only FaustEditor). "Tuo" hands the choices back as an ImportSelection;
 * app.js applies it (finishImport). A folder without chapter files shows an empty state that
 * offers its sub-folders.
 *
 * All logic is in src/services/project/importPlan.js (unit-tested); this file holds state and
 * events only. The frame is the shared Dialog of ui.js (layer host, Esc, focus, inert
 * background); the look is the import preview of section 13 of faust-components.css
 * (composition VF-21).
 *
 * Bundled with app.js by webpack. Uses the global React like the rest of the app.
 */

import { Dialog, Field, Section, Callout, EmptyState, IconButton, Chip } from './ui.js';
import { FaustEditor } from './FaustEditor.js';
import {
  buildRows, hasOrderNumbers, applyStripNumbers, moveRow, renameRow, setRowIncluded, setAllIncluded,
  resetOrder, isReordered, summaryLine, importButtonLabel, noticeLines, isBlankProject, buildSelection
} from '../services/project/importPlan.js';
import { formatCount } from '../services/format.fi.js';

const { createElement: e, useState, useLayoutEffect, useRef } = React;

const DEFAULT_PROJECT_TITLE = 'Nimetön projekti';
// The empty state offers at most this many sub-folders, in the order the folder lists them
const MAX_SUBFOLDER_BUTTONS = 6;
const EXCERPT_LENGTH = 60;
// Notices that ask the author to act (a warning) and those that only report (info), VF-21
const WARNING_KINDS = ['scrivener', 'rtf', 'cloud', 'failed', 'duplicate-synopsis', 'encoding'];

const lukua = (n) => (n === 1 ? '1 luku' : formatCount(n) + ' lukua');

// The first characters of a chapter on one line
function excerpt(content) {
  const line = String(content || '').replace(/\s+/g, ' ').trim();
  return line.length > EXCERPT_LENGTH ? line.slice(0, EXCERPT_LENGTH).trimEnd() + '…' : line;
}

// The dialog's own state for one source. Choices are not remembered between imports.
function initialState(source, project) {
  const rows = source ? buildRows(source) : [];
  const projectTitle = (project && project.title) || '';
  const keepTitle = isBlankProject(project) && projectTitle && projectTitle !== DEFAULT_PROJECT_TITLE;
  return {
    rows,
    strip: true,
    mode: 'append',
    bookTitle: keepTitle ? projectTitle : ((source && source.title) || ''),
    snapshot: true,
    dragKey: null,
    dropIndex: null,
    shownKey: rows.length > 0 ? rows[0].key : null,
    refused: false
  };
}

function NoticeCallouts({ notices }) {
  const warnings = notices.filter(notice => WARNING_KINDS.includes(notice.kind));
  const infos = notices.filter(notice => !WARNING_KINDS.includes(notice.kind));
  const lines = (list) => list.map((notice, index) => e('div', { key: index, className: 'faust-import__notice' }, notice.text));
  return e(React.Fragment, null,
    warnings.length > 0 && e(Callout, { role: 'warning' }, lines(warnings)),
    infos.length > 0 && e(Callout, { role: 'info' }, lines(infos))
  );
}

/**
 * @param {{
 *   source: object | null,                       ImportSource (contracts 1.9); null renders nothing
 *   project: object,                              the open project (title, structure), read only
 *   getReplaceBlockedReason: () => string | null, asked on every render and again on "Tuo"
 *   onPickFolder: (request?: { subfolder: string }) => void,   folder imports only
 *   onDone: (selection: object | null) => void    ImportSelection, or null when cancelled
 * }} props
 */
export function ImportPreviewDialog({ source, project, getReplaceBlockedReason, onPickFolder, onDone }) {
  const [state, setState] = useState(() => initialState(source, project));
  const [seenSource, setSeenSource] = useState(source);
  const titleRefs = useRef({});
  const rowRefs = useRef({});
  const focusAfterMove = useRef(null);

  // A new source starts the dialog over. Done while rendering, so the first frame of a new
  // source already shows its rows (an effect would draw the old rows once and focus them).
  let current = state;
  if (source !== seenSource) {
    current = initialState(source, project);
    setSeenSource(source);
    setState(current);
  }

  // After a keyboard move the row's own title field has the focus again: React moved the row's
  // element, and a moved element loses the focus
  useLayoutEffect(() => {
    const key = focusAfterMove.current;
    if (!key) return;
    focusAfterMove.current = null;
    const field = titleRefs.current[key];
    if (field && document.activeElement !== field) field.focus();
  });

  if (!source) return null;

  const { rows, strip, mode, bookTitle, snapshot, dragKey, dropIndex, shownKey, refused } = current;
  const update = (patch) => setState(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));

  const folder = source.kind === 'folder';
  const blank = isBlankProject(project);
  // Recomputed on every render: a project that changes under the dialog is handled
  const effectiveMode = blank ? 'replace' : mode;
  const replacing = effectiveMode === 'replace';
  const blockedReason = replacing && !blank && getReplaceBlockedReason ? getReplaceBlockedReason() : null;
  const takesSnapshot = !blank && (replacing || snapshot);
  const notices = noticeLines(source, rows);
  const includedCount = rows.filter(row => row.included).length;
  const existing = project && Array.isArray(project.structure) ? project.structure.length : 0;

  const cancel = () => onDone(null);
  const sub = folder
    ? e('span', { title: source.path || source.name }, 'Kansio: ' + source.name)
    : 'Tiedosto: ' + source.name;
  const pickFolder = folder && e('button', {
    key: 'folder', type: 'button', className: 'faust-btn faust-btn--lg', onClick: () => onPickFolder()
  }, 'Valitse toinen kansio…');
  const cancelButton = e('button', { key: 'cancel', type: 'button', className: 'faust-btn faust-btn--lg', onClick: cancel }, 'Peruuta');

  // ---- A folder without chapter files: say why and offer its sub-folders
  if (rows.length === 0) {
    const subfolders = (source.report && Array.isArray(source.report.subfolders)) ? source.report.subfolders : [];
    const hasDraft = subfolders.some(name => String(name).toLocaleLowerCase('fi') === 'draft');
    return e(Dialog, {
      title: 'Tuonnin esikatselu',
      sub,
      icon: 'importIn',
      size: 'md',
      onClose: cancel,
      initialFocus: 'panel',
      footer: [cancelButton, pickFolder].filter(Boolean)
    },
      e(EmptyState, {
        icon: 'folder',
        title: 'Kansiossa ei ole tuotavia tiedostoja',
        hint: e(React.Fragment, null,
          e('div', null, 'FAUST tuo .txt-, .md- ja .docx-tiedostot. Alikansioita ei lueta.'),
          hasDraft && e('div', { className: 'faust-import__draft' }, 'Scrivenerin synkronointikansiossa käsikirjoitus on yleensä alikansiossa Draft.'))
      }),
      notices.length > 0 && e('div', { className: 'faust-import__notices' }, e(NoticeCallouts, { notices })),
      subfolders.length > 0 && e('div', { className: 'faust-import__subfolders' },
        subfolders.slice(0, MAX_SUBFOLDER_BUTTONS).map(name => e('button', {
          key: name, type: 'button', className: 'faust-btn', onClick: () => onPickFolder({ subfolder: name })
        }, 'Avaa ' + name)))
    );
  }

  // ---- Rows
  const shown = rows.find(row => row.key === shownKey) || rows[0];
  const dragFrom = dragKey ? rows.findIndex(row => row.key === dragKey) : -1;

  const setRows = (next) => update({ rows: next });
  const move = (from, to, { refocus = false } = {}) => {
    const next = moveRow(rows, from, to);
    if (next === rows) return;
    if (refocus) focusAfterMove.current = rows[from].key;
    update({ rows: next, refused: false });
  };

  const onRowKeyDown = (ev, index) => {
    if (!ev.altKey || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    ev.preventDefault();
    ev.stopPropagation();
    move(index, ev.key === 'ArrowUp' ? index - 1 : index + 1, { refocus: true });
  };

  const endDrag = () => update({ dragKey: null, dropIndex: null });

  let running = 0;
  const rowElements = rows.map((row, index) => {
    const number = row.included ? String(++running) : '–';
    const dropClass = dropIndex === index && dragFrom !== -1 && dragFrom !== index
      // The line shows where the row lands: above the target when it moves up, below it when it moves down
      ? (dragFrom > index ? ' is-drop-before' : ' is-drop-after')
      : '';
    const meta = [row.sourceFile, excerpt(row.content)].filter(Boolean).join(' · ');

    return e('div', {
      key: row.key,
      ref: (el) => { rowRefs.current[row.key] = el; },
      tabIndex: 0,
      role: 'group',
      'aria-label': row.title,
      className: 'faust-row faust-row--two faust-row--author' +
        (row.key === shown.key ? ' is-selected' : '') + (row.included ? '' : ' is-excluded') + dropClass,
      onClick: () => { if (shownKey !== row.key) update({ shownKey: row.key }); },
      onFocus: () => { if (shownKey !== row.key) update({ shownKey: row.key }); },
      onKeyDown: (ev) => onRowKeyDown(ev, index),
      onDragOver: (ev) => {
        if (!dragKey) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        if (dropIndex !== index) update({ dropIndex: index });
      },
      onDrop: (ev) => {
        if (!dragKey) return;
        ev.preventDefault();
        const from = rows.findIndex(item => item.key === dragKey);
        update({ rows: moveRow(rows, from, index), dragKey: null, dropIndex: null, refused: false });
      }
    },
      e('span', { className: 'faust-import__cell' },
        e('input', {
          type: 'checkbox',
          checked: row.included,
          'aria-label': 'Tuo tämä luku',
          title: 'Tuo tämä luku',
          onChange: (ev) => setRows(setRowIncluded(rows, row.key, ev.target.checked))
        })),
      e('span', { className: 'faust-import__cell faust-row__meta faust-import__num' }, number),
      e('span', { className: 'faust-import__cell' },
        // HTML5 drag on the handle only. No text payload: a drop on a text field must not type into it.
        e(IconButton, {
          icon: 'grip',
          size: 'sm',
          label: 'Järjestä vetämällä',
          className: 'faust-import__grip',
          draggable: true,
          onDragStart: (ev) => {
            ev.dataTransfer.effectAllowed = 'move';
            // The whole row follows the pointer, not only the handle
            if (rowRefs.current[row.key]) ev.dataTransfer.setDragImage(rowRefs.current[row.key], 24, 16);
            update({ dragKey: row.key, dropIndex: null });
          },
          onDragEnd: endDrag
        })),
      e('div', { className: 'faust-row__text' },
        e('input', {
          ref: (el) => { titleRefs.current[row.key] = el; },
          type: 'text',
          className: 'faust-input faust-input--sm faust-input--author',
          value: row.title,
          'aria-label': 'Otsikko',
          spellCheck: false,
          onChange: (ev) => setRows(renameRow(rows, row.key, ev.target.value)),
          onKeyDown: (ev) => {
            if (ev.key !== 'Enter') return;
            ev.preventDefault();
            // Leaves the field; the focus stays on the row, inside the dialog
            if (rowRefs.current[row.key]) rowRefs.current[row.key].focus();
          }
        }),
        e('div', { className: 'faust-import__meta' },
          meta && e('span', { className: 'faust-row__meta' }, meta),
          row.words === 0 && e(Chip, { plain: true }, 'tyhjä'),
          row.encodingGuessed && e(Chip, {
            plain: true, role: 'warning', dot: true,
            title: 'Tiedosto ei ollut UTF-8-muodossa. Tarkista, että ä ja ö näkyvät oikein.'
          }, 'merkistö arvattu'))
      ),
      e('span', { className: 'faust-import__cell faust-row__meta faust-import__count' }, formatCount(row.words)),
      e('span', { className: 'faust-import__cell faust-row__meta faust-import__syn' },
        row.synopsis ? e('span', { title: row.synopsis }, 'on') : '–'),
      e('span', { className: 'faust-import__cell faust-row__actions' },
        e(IconButton, { icon: 'arrowUp', size: 'sm', label: 'Siirrä lukua ylemmäs', onClick: () => move(index, index - 1) }),
        e(IconButton, { icon: 'arrowDown', size: 'sm', label: 'Siirrä lukua alemmas', onClick: () => move(index, index + 1) }))
    );
  });

  const allIncluded = rows.every(row => row.included);
  const someIncluded = rows.some(row => row.included);

  const runImport = () => {
    if (includedCount === 0) return;
    if (replacing && !blank) {
      const reason = getReplaceBlockedReason ? getReplaceBlockedReason() : null;
      if (reason) { update({ refused: true }); return; }
    }
    onDone(buildSelection(rows, {
      mode: effectiveMode,
      bookTitle,
      author: source.author,
      sourceName: source.name,
      snapshot
    }));
  };

  const projectTitle = (project && project.title) || DEFAULT_PROJECT_TITLE;
  const choice = (value, label, hint) => e('label', { key: value, className: 'faust-check faust-check--serif faust-import__choice' },
    e('input', {
      type: 'radio',
      name: 'faust-import-target',
      value,
      checked: mode === value,
      onChange: () => update({ mode: value, refused: false })
    }),
    e('span', null, label, e('span', { className: 'faust-check__hint' }, hint))
  );

  const left = e('div', { className: 'faust-import__col faust-import__col--rows' },
    notices.length > 0 && e('div', { className: 'faust-import__notices' }, e(NoticeCallouts, { notices })),
    hasOrderNumbers(rows) && e('label', { className: 'faust-check' },
      e('input', {
        type: 'checkbox',
        checked: strip,
        onChange: (ev) => update({ strip: ev.target.checked, rows: applyStripNumbers(rows, ev.target.checked) })
      }),
      'Poista järjestysnumero otsikoiden alusta'),
    e('div', { className: 'faust-import__head' },
      e('label', { className: 'faust-import__cell faust-import__all' },
        e('input', {
          type: 'checkbox',
          checked: allIncluded,
          ref: (el) => { if (el) el.indeterminate = someIncluded && !allIncluded; },
          'aria-label': 'Valitse kaikki',
          title: 'Valitse kaikki',
          onChange: (ev) => setRows(setAllIncluded(rows, ev.target.checked))
        }),
        e('span', { className: 'faust-label' }, 'Tuo')),
      e('span', { className: 'faust-label' }, 'Nro'),
      e('span', null),
      e('span', { className: 'faust-label' }, 'Otsikko'),
      e('span', { className: 'faust-label faust-import__count' }, 'Sanoja'),
      e('span', { className: 'faust-label faust-import__syn' }, 'Tiivistelmä'),
      e('span', null)
    ),
    e('div', {
      className: 'faust-import__list',
      onDragLeave: (ev) => {
        if (dragKey && !ev.currentTarget.contains(ev.relatedTarget)) update({ dropIndex: null });
      }
    }, rowElements),
    isReordered(rows) && e('div', null,
      e('button', {
        type: 'button',
        className: 'faust-btn faust-btn--quiet faust-btn--sm faust-btn--flush-start',
        onClick: () => update({ rows: resetOrder(rows), refused: false })
      }, 'Palauta alkuperäinen järjestys'))
  );

  const right = e('div', { className: 'faust-import__col faust-import__col--target' },
    e('div', { className: 'faust-import__target' },
      e(Section, { title: 'Minne luvut tuodaan' },
        blank
          ? e('div', { className: 'faust-dialog__lede' }, 'Projektissa ei ole vielä tekstiä. Luvut tuodaan sen sisällöksi.')
          : e('div', { className: 'faust-check-group faust-check-group--column', role: 'radiogroup', 'aria-label': 'Minne luvut tuodaan' },
              choice('append', 'Lisää nykyisen projektin loppuun', `”${projectTitle}”, ${lukua(existing)} ennestään`),
              choice('replace', 'Korvaa nykyisen projektin luvut', existing === 1
                ? 'Nykyinen luku korvataan. Siitä otetaan ensin tilannekuva.'
                : `Nykyiset ${formatCount(existing)} lukua korvataan. Niistä otetaan ensin tilannekuva.`)),
        refused && blockedReason && e(Callout, { role: 'error' }, blockedReason),
        replacing && e(Field, { label: 'Projektin nimi' },
          e('input', {
            type: 'text',
            className: 'faust-input faust-input--author',
            value: bookTitle,
            onChange: (ev) => update({ bookTitle: ev.target.value })
          })),
        !blank && !replacing && e('label', { className: 'faust-check' },
          e('input', { type: 'checkbox', checked: snapshot, onChange: (ev) => update({ snapshot: ev.target.checked }) }),
          'Ota tilannekuva ennen tuontia'),
        takesSnapshot && e('div', { className: 'faust-meta' }, `Ennen tuontia otetaan tilannekuva ”Ennen tuontia: ${source.name}”.`)
      )
    ),
    e('div', { className: 'faust-import__preview faust-page' },
      e(FaustEditor, {
        key: shown.key,
        value: shown.content,
        readOnly: true,
        label: 'Tuonnin esikatselu (vain luku)',
        style: { paddingTop: 'var(--sp-5)', paddingBottom: 'var(--sp-5)' }
      }))
  );

  return e(Dialog, {
    title: 'Tuonnin esikatselu',
    sub,
    icon: 'importIn',
    size: 'xl',
    bodyMode: 'fixed',
    onClose: cancel,
    initialFocus: 'panel',
    className: 'faust-import-dialog',
    footerStart: e('span', { className: 'faust-stat' }, summaryLine(rows)),
    footer: [
      cancelButton,
      pickFolder,
      e('button', {
        key: 'import',
        type: 'button',
        className: 'faust-btn faust-btn--lg faust-btn--primary',
        disabled: includedCount === 0,
        onClick: runImport
      }, importButtonLabel(rows))
    ].filter(Boolean)
  },
    e('div', { className: 'faust-import faust-import--table' },
      left,
      e('div', { className: 'faust-import__rule' }),
      right
    )
  );
}

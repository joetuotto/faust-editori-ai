/**
 * src/components/CodexPanel.js - Tarinakansio (report 4.10, slices A and B; stage I-07).
 *
 *   CodexPanel({ project, activeChapterId, onChange, confirm, focusRequest, openRequest,
 *                onShowMentions, mentionsEnabled = true, isCurrent, onDirty, draftsRef,
 *                focusMode, focusEditor })
 *       The last section of the sidebar: the entries grouped by type, each with its state mark and
 *       its mentions in the whole manuscript, the banner that offers the old character, place and
 *       thread records, and `+ Uusi kohde…`. A click opens the entry form, a non-modal sheet in the
 *       layer host beside the sidebar, so the manuscript stays readable while a description is
 *       written. In a nonfiction project the section is Käsikirjoituksen kansio.
 *   CopyToCodexButton({ item, project, onChange, onOpen })
 *       On a note of Tutkimuskansio: copies it into Tarinakansio as an entry that is never sent,
 *       once; afterwards the button opens that entry.
 *
 * onChange(patch | (prev) => patch) merges into the project and marks it changed; the panel always
 * uses the function form, so a debounced write never overwrites a newer project. confirm is the
 * app's askConfirm. focusRequest (a number) scrolls the section into view and focuses its filter
 * (or its first row) when it changes; openRequest ({ id, tick }) opens the form of an entry when
 * its tick changes. onShowMentions(ranges) marks [{ start, end }] in the open chapter (an empty
 * list clears them). isCurrent() is false once another project is open: a draft of the old
 * project is then dropped, never written into the new one.
 *
 * The form writes typed text 300 ms after the last key. So that those 300 ms are never lost:
 * onDirty() is called with the first key of every such batch (the app marks the project changed,
 * and the close guard and Avaa ask), and draftsRef.current = { flush(), pending() } lets the app
 * write the batch before a save. focusMode true closes the form (a floating window of the
 * keskustelu's kind, VF-40, R-9); focusEditor() takes the focus when the form closes and the place
 * it came from is hidden.
 *
 * Every rule (matching, selection, migration, the research copy) is in src/services/story/codex.js
 * and src/editor/termMatch.js, which Jest tests; this file only draws them. Composition of reconcile
 * R-44, R-84 and visual foundations entries VF-25 and VF-40: ui.js components and the classes of
 * styles/faust-components.css, style objects for layout only.
 *
 * Bundled with app.js by webpack. Uses the global React and ReactDOM like the rest of the app.
 */
import { Section, Field, Callout, EmptyState, IconButton, notify } from './ui.js';
import { icons } from './icons.js';
import { count } from './Dialogs.js';
import { formatCount } from '../services/format.fi.js';
import {
  TYPE_LABELS, TYPE_PLURALS, STATES, STATE_LABELS, projectKind, folderName, typesFor,
  createEntry, updateEntry, removeEntry, prepareEntries, matchPrepared, countMentions, listGroups,
  pendingLegacy, migrateLegacy, entryFromResearchNote, findBySource
} from '../services/story/codex.js';
import { parseTermList, formatTermList } from '../editor/termMatch.js';

const { createElement: e, Fragment, useState, useEffect, useLayoutEffect, useMemo, useRef } = React;

// The folder's name (folderName) in the three other cases the strings need; a nonfiction project has
// Käsikirjoituksen kansio
const FOLDER = {
  fiction: { into: 'Tarinakansioon', in: 'Tarinakansiossa', from: 'Tarinakansiosta' },
  nonfiction: { into: 'Käsikirjoituksen kansioon', in: 'Käsikirjoituksen kansiossa', from: 'Käsikirjoituksen kansiosta' }
};
const folderOf = (project) => ({ name: folderName(project), ...FOLDER[projectKind(project)] });

const EMPTY_HINT = {
  fiction: 'Lisää hahmo, paikka tai muu asia, jonka tekoälyn pitää tietää.',
  nonfiction: 'Lisää termi, henkilö tai lähde, jonka tekoälyn pitää tietää.'
};

// What each state means, under its radio
const STATE_HINTS = {
  always: 'Lähetetään jokaiseen tehtävään.',
  mentioned: 'Lähetetään, kun nimi tai alias on lähetettävässä tekstissä.',
  manual: 'Lähetetään vain, kun lisäät sen itse Mitä malli näkee -riviltä.',
  never: 'Ei lähetetä millekään mallille.'
};
// Slice A alone (mentionsEnabled false): "Kun mainitaan" cannot be told from "Vain käsin" yet
const MENTIONED_SLICE_A = 'Mainintoja ei vielä tunnisteta. Toimii nyt kuten Vain käsin.';

const UNNAMED = 'Nimetön kohde';
const COUNT_DELAY = 500;          // the mention counts follow the text 500 ms after the last change
const WRITE_DELAY = 300;          // a typed field is written 300 ms after the last keystroke
const NONE = [];

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const listOf = (value) => (Array.isArray(value) ? value : NONE);
const nameOf = (entry) => (typeof entry.name === 'string' ? entry.name.trim() : '');
const stateOf = (entry) => (STATES.includes(entry.state) ? entry.state : 'mentioned');

// ---------------------------------------------------------------------------
// Mention counts: the whole manuscript through countMentions, 500 ms after the last change; its cache
// keeps each chapter's result while the chapter's text and the entries are the same, so typing
// rescans the open chapter only
// ---------------------------------------------------------------------------

function useMentionCounts(chapters, entries, enabled) {
  const cacheRef = useRef(new Map());
  const firstRef = useRef(true);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setResult(null);
      return undefined;
    }
    const run = () => setResult(countMentions(chapters, entries, { cache: cacheRef.current }));
    // The first count comes at once; after it the counters wait for a pause in typing
    const timer = setTimeout(run, firstRef.current ? 0 : COUNT_DELAY);
    firstRef.current = false;
    return () => clearTimeout(timer);
  }, [chapters, entries, enabled]);

  return result;
}

// ---------------------------------------------------------------------------
// The banner: old character, place and thread records that are not in the folder
// ---------------------------------------------------------------------------

function LegacyBanner({ pending, folder, onImport, onSkip }) {
  const [withNames, setWithNames] = useState(false);
  const n = pending.items.length;
  const k = pending.nameOnly;
  return e(Callout, {
    role: 'info',
    actions: e(Fragment, null,
      e('button', { type: 'button', className: 'faust-btn faust-btn--sm faust-btn--block', onClick: () => onImport(withNames) },
        'Tuo ' + folder.into),
      e('button', { type: 'button', className: 'faust-btn faust-btn--quiet faust-btn--sm faust-btn--block', onClick: onSkip }, 'Ohita'))
  },
    e('div', null,
      `Vanhoissa hahmo-, paikka- ja juonilankatiedoissa on ${count(n, 'kohde')}, ${n === 1 ? 'jota' : 'joita'} ei ole ${folder.in}.`),
    k > 0 && e('label', { className: 'faust-check' },
      e('input', { type: 'checkbox', checked: withNames, onChange: (ev) => setWithNames(ev.target.checked) }),
      `Tuo myös pelkät nimet (${formatCount(k)})`),
    e('div', { className: 'faust-field__hint' },
      'Tuodut kohteet lähetetään vain käsin lisättyinä, kunnes muutat asetusta. Vanhat tiedot säilyvät projektitiedostossa.')
  );
}

// ---------------------------------------------------------------------------
// The entry form: a non-modal sheet in the layer host
// ---------------------------------------------------------------------------

// The typed fields of an entry, as the form shows them
const draftOf = (entry) => ({
  name: typeof entry.name === 'string' ? entry.name : '',
  aliases: formatTermList(listOf(entry.aliases), ', '),
  exclude: formatTermList(listOf(entry.exclude), ', '),
  description: typeof entry.description === 'string' ? entry.description : '',
  notes: typeof entry.notes === 'string' ? entry.notes : ''
});

// A typed field → the entry field it writes
const patchFor = (field, value) => (
  field === 'aliases' || field === 'exclude' ? { [field]: parseTermList(value) } : { [field]: value }
);

const isBlank = (draft) => !draft.name.trim() && !draft.aliases.trim() && !draft.exclude.trim()
  && !draft.description.trim() && !draft.notes.trim();

function CodexSheet({
  entry, isNew, project, folder, mentionsEnabled, mentions, activeChapterId, activeText, prepared,
  onPatch, onRemove, onClose, onShowMentions, askConfirm, onDirty, apiRef
}) {
  const [draft, setDraft] = useState(() => draftOf(entry));
  const sheetRef = useRef(null);
  const nameRef = useRef(null);
  const excludeRef = useRef(null);
  const pendingRef = useRef(null);       // the typed fields not yet written
  const timerRef = useRef(0);
  const goneRef = useRef(false);         // deleted or discarded: nothing more is written
  const shownRef = useRef(false);        // this form marked mentions in the text
  const ownApiRef = useRef(null);        // this form's api, so that its unmount clears only its own

  const flush = () => {
    clearTimeout(timerRef.current);
    const patch = pendingRef.current;
    pendingRef.current = null;
    if (patch && !goneRef.current) onPatch(patch);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Nothing typed is kept: a new entry left empty, closed or replaced by another form
  const discard = () => {
    goneRef.current = true;
    clearTimeout(timerRef.current);
    pendingRef.current = null;
  };

  const edit = (field, value) => {
    setDraft(current => ({ ...current, [field]: value }));
    // The project counts as changed from the first key on, not from the write 300 ms later, so a
    // window closed or a project opened meanwhile still asks about saving
    if (!pendingRef.current && onDirty) onDirty();
    pendingRef.current = { ...(pendingRef.current || {}), ...patchFor(field, value) };
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), WRITE_DELAY);
  };
  // A choice (type, state) is written at once, after what was typed before it
  const choose = (patch) => {
    flush();
    if (!goneRef.current) onPatch(patch);
  };

  // A new entry starts in its name; an existing one gives the sheet the focus, so Esc closes it
  useLayoutEffect(() => {
    const target = isNew ? nameRef.current : sheetRef.current;
    if (target) target.focus({ preventScroll: true });
    // Whatever is still typed is written when the form goes (closed, another entry opened)
    return () => {
      flushRef.current();
      if (apiRef && apiRef.current === ownApiRef.current) apiRef.current = null;
    };
  }, []);

  const close = () => {
    // A new entry left empty is not kept: there is nothing in it to lose
    const blank = isNew && isBlank(draft);
    if (blank) discard();
    else flush();
    if (shownRef.current) onShowMentions([]);
    onClose({ removeBlank: blank });
  };

  // What the section and the app may ask of the open form: write the typed batch now (a save), is
  // one waiting, close as Valmis does (focus mode), and, when another form replaces this one, drop
  // a new entry that is still empty (true) or keep what was typed (false)
  const api = {
    flush,
    pending: () => !!pendingRef.current,
    close,
    leave: () => {
      if (!(isNew && isBlank(draft))) return false;
      discard();
      return true;
    }
  };
  ownApiRef.current = api;
  if (apiRef) apiRef.current = api;

  const remove = async () => {
    const shown = draft.name.trim() || UNNAMED;
    const ok = await askConfirm('Poistetaanko kohde?', `”${shown}” poistetaan ${folder.from}. Poistoa ei voi kumota.`,
      'Poista kohde', 'Peruuta', { danger: true });
    if (!ok) return;
    discard();
    if (shownRef.current) onShowMentions([]);
    onRemove();
  };

  // Älä laske: the spelling, in quotation marks, joins the exclusions; written at once. Its row goes
  // when the counts follow, so the focus moves on inside the form first (the next Älä laske, else
  // the exclusions field), where Esc still reaches the form
  const dontCount = (form, button) => {
    const list = parseTermList(draft.exclude);
    const quoted = '”' + form + '”';
    if (list.includes(quoted)) return;
    const next = [...list, quoted];
    setDraft(current => ({ ...current, exclude: formatTermList(next, ', ') }));
    pendingRef.current = { ...(pendingRef.current || {}), exclude: next };
    flush();
    const sheet = sheetRef.current;
    const buttons = sheet ? Array.from(sheet.querySelectorAll('.faust-codex__form > .faust-btn')) : [];
    const at = buttons.indexOf(button);
    const target = (at >= 0 && (buttons[at + 1] || buttons[at - 1])) || excludeRef.current || sheet;
    if (target) target.focus();
  };

  const showHere = () => {
    const ranges = matchPrepared(activeText, prepared).matches
      .filter(match => match.entryId === entry.id)
      .map(match => ({ start: match.start, end: match.end }));
    if (!ranges.length) return;
    shownRef.current = true;
    onShowMentions(ranges);
  };

  const state = stateOf(entry);
  const types = typesFor(project);
  const typeChoices = types.includes(entry.type) ? types : [...types, entry.type];
  const title = draft.name.trim() || (isNew ? 'Uusi kohde' : UNNAMED);

  const here = mentions && mentions.byChapter[activeChapterId] ? mentions.byChapter[activeChapterId][entry.id] || 0 : 0;
  const total = mentions ? mentions.total[entry.id] || 0 : 0;
  const forms = mentions ? mentions.forms[entry.id] || NONE : NONE;

  const field = (label, control, hint) => e(Field, { label, hint }, control);
  const input = (name, ref) => e('input', {
    ref,
    className: 'faust-input faust-input--sm' + (name === 'name' ? ' faust-input--author' : ''),
    value: draft[name],
    spellCheck: name === 'name',
    onChange: (ev) => edit(name, ev.target.value),
    onBlur: flush
  });
  const textarea = (name, rows) => e('textarea', {
    className: 'faust-textarea faust-textarea--author',
    rows,
    value: draft[name],
    onChange: (ev) => edit(name, ev.target.value),
    onBlur: flush
  });

  const mentionsBlock = mentionsEnabled && e('div', { className: 'faust-codex__mentions' },
    e('div', { className: 'faust-meta' },
      `Mainintoja: tässä luvussa ${formatCount(here)} · koko käsikirjoituksessa ${formatCount(total)}`),
    total === 0
      ? e('div', { className: 'faust-field__hint' }, 'Ei mainintoja. Jos nimen alku muuttuu taivutettaessa, lisää vartalo aliaksiin.')
      : e(Fragment, null,
          e('div', { className: 'faust-label' }, 'Osuneet muodot'),
          forms.map(({ form, count: n }) => e('div', { key: form, className: 'faust-kv' },
            e('span', { className: 'faust-serif' }, form),
            e('span', { className: 'faust-codex__form' },
              '×' + formatCount(n),
              e('button', {
                type: 'button',
                className: 'faust-btn faust-btn--quiet faust-btn--sm',
                title: `Lisää ”${form}” kohtaan Älä laske näitä`,
                onClick: (ev) => dontCount(form, ev.currentTarget)
              }, 'Älä laske')))),
          here > 0 && e('div', null,
            e('button', { type: 'button', className: 'faust-btn faust-btn--sm', onClick: showHere }, 'Näytä tässä luvussa')))
  );

  const sheet = e('div', {
    ref: sheetRef,
    className: 'faust-popover faust-popover--sheet',
    role: 'dialog',
    'aria-label': title,
    tabIndex: -1,
    style: { '--popover-w': '380px', left: 'calc(var(--left-col-w) + var(--sp-2))', top: 'calc(var(--header-h) + var(--sp-3))' },
    // Esc closes the form only while the focus is in it, and goes no further (R-70 step 4)
    onKeyDown: (ev) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented) return;
      ev.preventDefault();
      ev.stopPropagation();
      close();
    }
  },
    e('div', { className: 'faust-popover__head' },
      e('span', { className: 'faust-popover__title' }, title),
      e(IconButton, { icon: 'close', size: 'sm', label: 'Sulje', title: 'Sulje (Esc)', onClick: close })),
    e('div', { className: 'faust-popover__body' },
      field('Tyyppi', e('select', {
        className: 'faust-select faust-select--sm',
        value: entry.type,
        onChange: (ev) => choose({ type: ev.target.value })
      }, typeChoices.map(type => e('option', { key: type, value: type }, TYPE_LABELS[type] || type)))),
      field('Nimi', input('name', nameRef)),
      field('Aliakset ja sanavartalot', input('aliases'),
        'Pilkulla erotettuna. Osuma lasketaan sanan alusta: Mari löytää myös muodot Maria ja Marin. Jos sanan alku muuttuu taivutettaessa, lisää vartalo: Pekka → Peka (Pekan, Pekalle).'),
      field('Älä laske näitä', input('exclude', excludeRef),
        'Sanat, jotka alkavat samoin mutta tarkoittavat muuta, esimerkiksi Marianne.'),
      field('Kuvaus (tekoäly lukee tämän)', textarea('description', 5)),
      !draft.description.trim() && state !== 'never' && e(Callout, { role: 'warning' }, 'Kuvaus on tyhjä, joten kohteesta ei lähetetä mitään.'),
      field('Omat muistiinpanot (ei lähetetä koskaan)', textarea('notes', 3)),
      e(Field, { label: 'Lähetys tekoälylle' },
        e('div', { className: 'faust-check-group faust-check-group--grid', role: 'radiogroup', 'aria-label': 'Lähetys tekoälylle' },
          STATES.map(value => e('label', { key: value, className: 'faust-check' },
            e('span', { className: 'faust-radio' },
              e('input', {
                type: 'radio',
                name: 'codex-state-' + entry.id,
                value,
                checked: state === value,
                onChange: () => choose({ state: value })
              })),
            e('span', null, STATE_LABELS[value]),
            e('span', { className: 'faust-check__hint' },
              value === 'mentioned' && !mentionsEnabled ? MENTIONED_SLICE_A : STATE_HINTS[value]))))),
      mentionsBlock),
    e('div', { className: 'faust-popover__foot' },
      e('button', { type: 'button', className: 'faust-btn faust-btn--sm faust-btn--danger faust-codex__delete', onClick: remove }, 'Poista kohde'),
      e('button', { type: 'button', className: 'faust-btn faust-btn--sm faust-btn--primary', onClick: close }, 'Valmis'))
  );

  const host = typeof document !== 'undefined' ? document.querySelector('.faust-layer') : null;
  return host ? ReactDOM.createPortal(sheet, host) : sheet;
}

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------

export function CodexPanel({
  project, activeChapterId, onChange, confirm: askConfirm, focusRequest, openRequest, onShowMentions,
  mentionsEnabled = true, isCurrent, onDirty, draftsRef, focusMode = false, focusEditor
}) {
  const entries = listOf(project.codex);
  const chapters = listOf(project.structure);
  const kind = projectKind(project);
  const folder = folderOf(project);

  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(null);          // { id, isNew, entry (a new one), returnTo }
  const listRef = useRef(null);
  const addRef = useRef(null);
  const focusBackRef = useRef(null);
  const sheetApiRef = useRef(null);                // the open form's { flush, pending, close, leave }

  // The app writes the form's typed batch before a save, and asks whether one is waiting
  useLayoutEffect(() => {
    if (!draftsRef) return undefined;
    const drafts = {
      flush: () => { if (sheetApiRef.current) sheetApiRef.current.flush(); },
      pending: () => !!(sheetApiRef.current && sheetApiRef.current.pending())
    };
    draftsRef.current = drafts;
    return () => { if (draftsRef.current === drafts) draftsRef.current = null; };
  }, [draftsRef]);

  // Nothing is written once another project is open (its panel is a new one)
  const write = (patch) => {
    if (typeof isCurrent === 'function' && !isCurrent()) return false;
    onChange(patch);
    return true;
  };

  const prepared = useMemo(() => prepareEntries(entries), [entries]);
  const mentions = useMentionCounts(chapters, entries, mentionsEnabled);

  const pending = useMemo(
    () => pendingLegacy(project),
    [project.characters, project.continuity, project.locations, project.plotThreads, project.codexLegacyHandled, project.genre]
  );

  const isListed = (id) => entries.some(entry => isRecord(entry) && entry.id === id);
  // A new entry is in the form only until its first change writes it into the project
  const openEntry = open
    ? entries.find(entry => isRecord(entry) && entry.id === open.id) || (open.isNew ? open.entry : null)
    : null;
  // The entry went (deleted, another project): the form goes with it
  useEffect(() => {
    if (open && !openEntry) setOpen(null);
  }, [open, openEntry]);

  // Focus mode shows only the text: the form closes as Valmis closes it (the keskustelu closes too)
  useEffect(() => {
    if (focusMode && sheetApiRef.current) sheetApiRef.current.close();
  }, [focusMode]);

  // Back to where the author was when the form opened, unless the focus has gone somewhere else meanwhile.
  // A place in a closed sidebar (focus mode, or the sidebar hidden since) cannot take it: the manuscript does.
  useEffect(() => {
    if (open || !focusBackRef.current) return;
    const target = focusBackRef.current;
    focusBackRef.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const shown = (el) => !!(el && el.isConnected && el.getClientRects().length > 0 && !el.closest('[data-state="closed"]'));
    const place = [target, addRef.current].find(shown);
    if (place) place.focus({ preventScroll: true });
    if ((!place || document.activeElement !== place) && focusEditor) focusEditor();
  }, [open]);

  // Nothing of a removed entry stays, and an entry that never reached the project changes nothing
  const removeListed = (id) => {
    if (isListed(id)) write(prev => ({ codex: removeEntry(listOf(prev.codex), id) }));
  };

  const openSheet = (id, isNew, entry = null) => {
    const active = document.activeElement;
    // A new entry left empty is not kept when another form takes its place
    if (open && open.isNew && open.id !== id && sheetApiRef.current && sheetApiRef.current.leave()) removeListed(open.id);
    setOpen(current => ({
      id,
      isNew,
      entry,
      // A form that replaces another keeps the first one's way back
      returnTo: current ? current.returnTo : (active && active !== document.body ? active : null)
    }));
  };

  const closeSheet = ({ removeBlank } = {}) => {
    if (!open) return;
    const sheetHasFocus = !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.faust-popover--sheet'));
    if (removeBlank) removeListed(open.id);
    focusBackRef.current = sheetHasFocus ? (open.returnTo || addRef.current) : null;
    setOpen(null);
  };

  const removeOpen = () => {
    if (!open) return;
    removeListed(open.id);
    focusBackRef.current = addRef.current;
    setOpen(null);
  };

  // fresh: a new entry, added to the project with its first change
  const patchOpen = (id, fresh) => (patch) => write(prev => {
    const list = listOf(prev.codex);
    const base = fresh && !list.some(entry => isRecord(entry) && entry.id === id) ? [...list, fresh] : list;
    return { codex: updateEntry(base, id, patch) };
  });

  // Näytä ▸ Tarinakansio and the menu's ⇧⌘J: the section comes into view and its filter (or first row) takes the focus
  const focusSeenRef = useRef(focusRequest);
  useEffect(() => {
    if (focusRequest === focusSeenRef.current) return;
    focusSeenRef.current = focusRequest;
    const list = listRef.current;
    const section = list && list.closest('.faust-section');
    const body = section && section.closest('.faust-panel__body');
    if (body) {
      const pad = parseFloat(getComputedStyle(body).scrollPaddingTop) || 0;
      body.scrollTop += section.getBoundingClientRect().top - body.getBoundingClientRect().top - pad;
    }
    const target = section && (section.querySelector('.faust-codex__filter') || section.querySelector('.faust-codex__row') || addRef.current);
    if (target) target.focus({ preventScroll: true });
  }, [focusRequest]);

  // A ⌘-click on an underlined name, or Avaa Tarinakansiossa: the form of that entry
  const openSeenRef = useRef(openRequest ? openRequest.tick : 0);
  useEffect(() => {
    if (!openRequest || openRequest.tick === openSeenRef.current) return;
    openSeenRef.current = openRequest.tick;
    if (openRequest.id) openSheet(openRequest.id, false);
  }, [openRequest && openRequest.tick]);

  // + Uusi kohde…: the form opens on a new entry, which reaches the project with its first change, so an
  // untouched form closed again changes nothing
  const addEntry = () => {
    if (typeof isCurrent === 'function' && !isCurrent()) return;
    setFilter('');
    const entry = createEntry({}, { project });
    openSheet(entry.id, true, entry);
  };

  const importLegacy = (includeNameOnly) => {
    const result = migrateLegacy(project, { includeNameOnly });
    // Things already in the folder: what an empty folder would have taken in, less what was taken now
    // (records of one thing in two old stores make one entry either way)
    const inFolder = migrateLegacy({ ...project, codex: [] }, { includeNameOnly }).counts.imported - result.counts.imported;
    const written = write(prev => {
      const list = listOf(prev.codex);
      const handled = listOf(prev.codexLegacyHandled);
      const known = new Set(handled);
      return {
        codex: [...list, ...result.entries.filter(entry => !findBySource(list, entry.source.key))],
        codexLegacyHandled: [...handled, ...result.handled.filter(key => !known.has(key))]
      };
    });
    if (!written) return;
    let text = 'Tuotu ' + count(result.counts.imported, 'kohde') + '.';
    if (result.counts.nameOnlySkipped > 0) text += ' ' + count(result.counts.nameOnlySkipped, 'pelkkä nimi') + ' ohitettiin.';
    if (inFolder > 0) text += ' ' + formatCount(inFolder) + ' oli jo ' + folder.in + '.';
    notify('success', text);
  };

  const skipLegacy = () => {
    const keys = pending.items.map(item => item.key);
    write(prev => {
      const handled = listOf(prev.codexLegacyHandled);
      const known = new Set(handled);
      return { codexLegacyHandled: [...handled, ...keys.filter(key => !known.has(key))] };
    });
  };

  // The list: groups in the order of the project's types (others after them), names alphabetically. The
  // filter field shows from nine entries on and filters only while it shows (listGroups); a filter whose
  // field went with deleted entries is emptied, so it does not come back by itself
  const { showFilter, groups } = useMemo(() => listGroups(entries, { project, filter }), [entries, filter, kind]);
  useEffect(() => {
    if (!showFilter && filter) setFilter('');
  }, [showFilter]);

  const openId = open ? open.id : null;
  const totals = mentions ? mentions.total : null;
  const list = useMemo(() => groups.map(group => e('div', { key: group.type, className: 'faust-codex__group' },
    e('div', { className: 'faust-label faust-codex__grouphead' },
      TYPE_PLURALS[group.type] || group.type,
      e('span', { className: 'faust-chip faust-chip--count' }, formatCount(group.items.length))),
    group.items.map(entry => {
      const state = stateOf(entry);
      const selected = entry.id === openId;
      return e('button', {
        key: entry.id,
        type: 'button',
        className: 'faust-row faust-row--author faust-codex__row' + (selected ? ' is-selected' : ''),
        'aria-current': selected || undefined,
        onClick: () => openSheet(entry.id, false)
      },
        e('span', { className: 'faust-codex-state', 'data-state': state, role: 'img', 'aria-label': STATE_LABELS[state], title: STATE_LABELS[state] }),
        e('span', { className: 'faust-row__text' }, e('span', { className: 'faust-row__title' }, nameOf(entry) || UNNAMED)),
        mentionsEnabled && totals && e('span', { className: 'faust-chip faust-chip--count', title: 'Mainintoja koko käsikirjoituksessa' },
          formatCount(totals[entry.id] || 0)));
    })
  )), [groups, openId, totals, mentionsEnabled]);

  const activeChapter = chapters.find(chapter => isRecord(chapter) && chapter.id === activeChapterId) || null;

  return e(Section, {
    className: 'faust-codex',
    title: e(Fragment, null, icons.salt({ size: 14 }), folder.name)
  },
    pending.items.length > 0 && e('div', { className: 'faust-codex__banner' },
      e(LegacyBanner, { pending, folder, onImport: importLegacy, onSkip: skipLegacy })),
    showFilter && e('input', {
      className: 'faust-input faust-input--sm faust-codex__filter',
      type: 'text',
      value: filter,
      placeholder: 'Suodata nimellä',
      'aria-label': 'Suodata nimellä',
      onChange: (ev) => setFilter(ev.target.value)
    }),
    e('div', { ref: listRef, className: 'faust-codex__list' },
      entries.length === 0
        ? e(EmptyState, { size: 'compact', title: 'Ei vielä kohteita.', hint: EMPTY_HINT[kind] })
        : groups.length === 0
          ? e('div', { className: 'faust-meta' }, 'Ei osumia')
          : list),
    e('button', {
      ref: addRef,
      type: 'button',
      className: 'faust-btn faust-btn--block faust-btn--sm faust-codex__add',
      onClick: addEntry
    }, '+ Uusi kohde…'),
    openEntry && e(CodexSheet, {
      key: openEntry.id,
      entry: openEntry,
      isNew: !!open.isNew,
      project,
      folder,
      mentionsEnabled,
      mentions,
      activeChapterId,
      activeText: activeChapter && typeof activeChapter.content === 'string' ? activeChapter.content : '',
      prepared,
      onPatch: patchOpen(openEntry.id, open.isNew ? open.entry : null),
      onRemove: removeOpen,
      onClose: closeSheet,
      onShowMentions: (ranges) => { if (onShowMentions) onShowMentions(ranges); },
      askConfirm,
      onDirty,
      apiRef: sheetApiRef
    })
  );
}

// ---------------------------------------------------------------------------
// Tutkimuskansio: a note into the folder
// ---------------------------------------------------------------------------

export function CopyToCodexButton({ item, project, onChange, onOpen }) {
  if (!isRecord(item)) return null;
  const folder = folderOf(project);
  const key = 'research:' + item.id;
  const copy = findBySource(listOf(project.codex), key);

  const click = () => {
    if (copy) {
      onOpen(copy.id);
      return;
    }
    const entry = entryFromResearchNote(item, project);
    // A copy that reached the project after this render is not made twice
    onChange(prev => (findBySource(listOf(prev.codex), key) ? {} : { codex: [...listOf(prev.codex), entry] }));
    onOpen(entry.id);
  };

  return e('div', { className: 'faust-codex__copy' },
    e('button', { type: 'button', className: 'faust-btn faust-btn--sm', onClick: click },
      copy ? 'Avaa ' + folder.in : 'Kopioi ' + folder.into),
    (!copy || stateOf(copy) === 'never') && e('div', { className: 'faust-field__hint' },
      'Kopiota ei lähetetä tekoälylle, ennen kuin muutat asetusta.'));
}

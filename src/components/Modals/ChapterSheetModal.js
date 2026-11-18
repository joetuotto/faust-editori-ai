/**
 * ChapterSheetModal - the chapter form (Luvun tiedot)
 * DEVELOPMENT_ROADMAP.md:117 - Complete implementation
 *
 * Script-tag compatible version for app.js integration. index.html loads this file in <head>,
 * before the bundle that assigns window.FaustIcons and window.FaustUI, so those globals are read
 * only inside the render function (R-89). The look comes from the dialog, field, section and row
 * classes of styles/faust-components.css. Esc, the stacking order, the inert background and the
 * focus go through window.FaustUI.layerStack and window.FaustUI.holdLayer (useLayer below).
 *
 * Saving hands onSave only the form's own fields (W22): the chapter's text, versions and word
 * count are never part of the payload, and synopsisManual is computed by the parent
 * (handleChapterSheetSave), which alone sees synopsisAI.
 */

(function(window) {
  'use strict';

  const { createElement: e, useState, useEffect, useLayoutEffect, useRef } = React;

  // Read at render time only: the bundle has not run yet when this file loads.
  const icons = () => window.FaustIcons || {};
  const icon = (name, size) => (icons()[name] ? icons()[name]({ size }) : null);

  // The form is a layer of window.FaustUI.layerStack (R-70; read here, at call time, R-89). Esc does
  // what Peruuta does; the form stands above the layers open under it (its list window) in the one
  // stacking order of the stack, with the dimming painted once, and follows its place when a layer
  // under it closes; window.FaustUI.holdLayer makes the background inert and keeps Tab inside the
  // form; the focus moves into the form and, when it closes, back to where it was. Without the
  // bundle's globals the form only has no Esc, no stacking and no hold.
  const FIELDS = 'input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled)';
  const useLayer = (isOpen, onEscape, panelRef, scrimRef) => {
    const escapeRef = useRef(onEscape);
    escapeRef.current = onEscape;
    const [below, setBelow] = useState(0);
    useLayoutEffect(() => {
      if (!isOpen) return undefined;
      const ui = window.FaustUI || {};
      const stack = ui.layerStack;
      const previous = document.activeElement;
      const token = stack ? stack.push(() => escapeRef.current()) : null;
      const follow = () => setBelow(token !== null ? Math.max(0, stack.place(token)) : 0);
      follow();
      const stop = token !== null ? stack.subscribe(follow) : () => {};
      const release = ui.holdLayer ? ui.holdLayer(scrimRef.current, panelRef.current, previous) : () => {};
      const restore = ui.returnFocus || ((el) => { if (el && el.focus && document.contains(el)) el.focus(); });
      const panel = panelRef.current;
      const first = panel && (panel.querySelector('[data-autofocus]') || panel.querySelector(FIELDS));
      if (first) first.focus(); else if (panel) panel.focus();
      return () => {
        stop();
        if (token !== null) stack.remove(token);
        release();
        restore(previous);
      };
    }, [isOpen]);
    return below;
  };

  // Display maps for the stored values (menu spec A.4). A plain script cannot import the bundle's
  // maps, so this file keeps a copy of the ones it needs; constants.js is not touched. The stored
  // values stay English; a missing status counts as `plan`.
  const CHAPTER_STATE = { plan: 'Suunnitteilla', draft: 'Luonnos', revision: 'Muokattavana', final: 'Valmis' };
  // The narrator options keep the labels of constants.js; the keys are the fallback list.
  const NARRATOR = {
    first: '1. persoona', third_limited: '3. persoona (rajoitettu)',
    third_omniscient: '3. persoona (kaikkitietävä)', second: '2. persoona'
  };

  // The lists come from window.CONSTANTS as { value, label } objects; without it, from the map's keys.
  // Labels are overridden by value with the maps above (menu spec C.13 row 18).
  const toOptions = (items, map) => (items || Object.keys(map)).map(item => {
    const value = typeof item === 'string' ? item : item.value;
    const fallback = typeof item === 'string' ? String(item).replace(/_/g, ' ') : item.label;
    return { value, label: map[value] || fallback };
  });
  // A stored value outside the list (an older entry) stays selectable under its own name, so that
  // opening and saving the form never changes it.
  const withCurrent = (options, value) => (value && !options.some(option => option.value === value)
    ? [{ value, label: ({ ...CHAPTER_STATE, ...NARRATOR })[value] || String(value).replace(/_/g, ' ') }, ...options]
    : options);
  // The stored status is read as the rest of the app reads it (menu spec A.4, section 1 normStatus):
  // the legacy 'revised' is 'revision', a missing status is 'plan'
  const normStatus = (value) => (value === 'revised' ? 'revision' : (value || 'plan'));

  const CHAPTER_STATUS = toOptions(window.CONSTANTS?.CHAPTER_STATUS, CHAPTER_STATE);
  const POV_TYPES = toOptions(window.CONSTANTS?.POV_TYPES, NARRATOR);
  const VALIDATION_RULES = window.CONSTANTS?.VALIDATION_RULES || {
    DESCRIPTION_MAX_LENGTH: 5000
  };
  const TITLE_MAX = 200;
  const PLACE_MAX = 200;

  // A small copy of count() in Dialogs.js, for the one word this form needs (menu spec B.13).
  const FORMS = { merkki: ['merkki', 'merkkiä'] };
  const count = (n, word) => {
    const forms = FORMS[word] || [word, word];
    return Number(n).toLocaleString('fi-FI') + ' ' + (Number(n) === 1 ? forms[0] : forms[1]);
  };
  const tooLong = (what, max) => `${what} on liian pitkä (enintään ${count(max, 'merkki')}).`;
  const tooLongPlural = (what, max) => `${what} ovat liian pitkät (enintään ${count(max, 'merkki')}).`;

  const ID = 'faust-chapter';

  // The fields of the form, and nothing else: they are also the save payload. Not rendered and
  // not written: the free-text point of view (Näkökulmahahmo lives on the Luku tab), the number,
  // the word-count goal and the word count (menu spec C.13 rows 13 and 15).
  // A chapter without a narrator keeps none: the select shows the first option as its default, and
  // povType is written only once the author picks one (menu spec E: no pass invents stored values).
  const fromChapter = (chapter) => ({
    title: chapter?.title || '',
    status: normStatus(chapter?.status),
    povType: chapter?.povType || '',
    location: chapter?.location || '',
    synopsis: chapter?.synopsis || '',
    keyScenes: chapter?.keyScenes || [],
    goals: chapter?.goals || '',
    conflicts: chapter?.conflicts || '',
    outcome: chapter?.outcome || '',
    emotionalArc: chapter?.emotionalArc || '',
    notes: chapter?.notes || ''
  });

  // ---- Markup helpers ----

  // aria-invalid draws the error edge (the stylesheet), aria-describedby links the message.
  const invalid = (id, error) => (error ? { 'aria-invalid': 'true', 'aria-describedby': id + '-error' } : {});

  // One field: the label above, the control, the message under it. `reserve` keeps the message's
  // line under a required field, so the form does not jump when it appears.
  const field = (id, label, control, error, reserve) => e('div', { className: 'faust-field' },
    label && e('label', { className: 'faust-field__label', htmlFor: id }, label),
    control,
    (error || reserve) && e('div', { className: 'faust-field__error', id: id + '-error' }, error || null)
  );

  // Fields side by side; the row stands in the dialog's vertical rhythm as one field.
  const fieldRow = (columns, cells) => e('div', {
    className: 'faust-field',
    style: { display: 'grid', gridTemplateColumns: columns, gap: 'var(--sp-4)', alignItems: 'start' }
  }, cells.map((cell, index) => e('div', { key: index }, cell)));

  const section = (title, ...children) => e('section', { className: 'faust-section' },
    e('div', { className: 'faust-section__head' }, e('h3', { className: 'faust-section__title' }, title)),
    ...children
  );

  // A list the author adds items to: the field and Lisää, then one row per item with its delete.
  const tagEditor = ({ id, label, input, setInput, onAdd, items, onRemove, placeholder, emptyText, isViewMode }) => [
    !isViewMode && e('div', { key: 'add', style: { display: 'flex', gap: 'var(--sp-2)' } },
      e('input', {
        id,
        type: 'text',
        className: 'faust-input faust-input--author',
        style: { flex: '1 1 auto' },
        value: input,
        onChange: (ev) => setInput(ev.target.value),
        onKeyPress: (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            onAdd();
          }
        },
        placeholder,
        'aria-label': label
      }),
      e('button', { type: 'button', className: 'faust-btn faust-btn--lg', onClick: onAdd }, 'Lisää')
    ),
    e('div', { key: 'list', style: { marginTop: isViewMode ? 0 : 'var(--sp-2)' } },
      items.length > 0
        ? items.map(item => e('div', { key: item, className: 'faust-row faust-row--static faust-row--author' },
            e('span', { className: 'faust-row__text' }, e('span', { className: 'faust-row__title', title: item }, item)),
            !isViewMode && e('span', { className: 'faust-row__actions' },
              e('button', {
                type: 'button',
                className: 'faust-btn faust-btn--icon faust-btn--sm faust-btn--danger',
                title: 'Poista',
                'aria-label': 'Poista',
                onClick: () => onRemove(item)
              }, icon('trash', 14))
            )
          ))
        : e('div', { className: 'faust-meta' }, emptyText)
    )
  ];

  function ChapterSheetModal(props) {
    const {
      isOpen,
      onClose,
      chapter = null,
      onSave,
      mode = 'create' // 'create', 'edit', 'view'
    } = props;

    // Hooks run on every render, also while the form is closed (isOpen is checked after them).
    const [formData, setFormData] = useState(() => fromChapter(chapter));
    const [errors, setErrors] = useState({});
    const [sceneInput, setSceneInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [scrollRequest, setScrollRequest] = useState(0);
    const dialogRef = useRef(null);
    const scrimRef = useRef(null);
    const below = useLayer(isOpen, () => onClose(), dialogRef, scrimRef);

    // Loaded once per chapter: a change to the chapter object while the form is open (an analysis
    // finishing in the background) does not wipe what the author has typed.
    const chapterId = chapter ? chapter.id : null;
    useEffect(() => {
      if (chapter) setFormData(fromChapter(chapter));
    }, [chapterId]);

    // A failed save brings its first invalid field (or the save error) into view (BUG-3, C.13 row 8).
    useEffect(() => {
      if (!scrollRequest || !dialogRef.current) return;
      const target = dialogRef.current.querySelector('[aria-invalid="true"], .faust-callout--error');
      if (!target) return;
      target.scrollIntoView({ block: 'center' });
      if (typeof target.focus === 'function') target.focus({ preventScroll: true });
    }, [scrollRequest]);

    if (!isOpen) return null;

    const validateForm = () => {
      const newErrors = {};
      const max = VALIDATION_RULES.DESCRIPTION_MAX_LENGTH;

      if (!formData.title.trim()) {
        newErrors.title = 'Otsikko puuttuu.';
      } else if (formData.title.length > TITLE_MAX) {
        newErrors.title = tooLong('Otsikko', TITLE_MAX);
      }
      if (formData.location.length > PLACE_MAX) {
        newErrors.location = tooLong('Tapahtumapaikka', PLACE_MAX);
      }
      if (formData.synopsis.length > max) {
        newErrors.synopsis = tooLong('Tiivistelmä', max);
      }
      if (formData.goals.length > max) {
        newErrors.goals = tooLongPlural('Hahmojen tavoitteet', max);
      }
      if (formData.conflicts.length > max) {
        newErrors.conflicts = tooLongPlural('Konfliktit', max);
      }
      if (formData.outcome.length > max) {
        newErrors.outcome = tooLong('Lopputulos', max);
      }
      if (formData.emotionalArc.length > 2000) {
        newErrors.emotionalArc = tooLong('Tunnekaari', 2000);
      }
      if (formData.notes.length > max) {
        newErrors.notes = tooLongPlural('Muistiinpanot', max);
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (ev) => {
      ev.preventDefault();

      if (mode === 'view') {
        onClose();
        return;
      }

      if (!validateForm()) {
        setScrollRequest(n => n + 1);
        return;
      }

      setIsSaving(true);

      try {
        // The form's fields only (synopsis among them); the parent merges them into the chapter.
        // An empty narrator is left out, so the chapter's own (missing) value stays as it was.
        const { povType, ...fields } = formData;
        const chapterData = {
          ...(chapter && chapter.id ? { id: chapter.id } : {}),
          ...fields,
          ...(povType ? { povType } : {})
        };

        await onSave(chapterData);
        onClose();
      } catch (error) {
        console.error('[ChapterSheet] Save error:', error);
        const reason = String((error && error.message) || 'tuntematon virhe').replace(/\.\s*$/, '');
        setErrors({ submit: 'Tallennus epäonnistui: ' + reason + '.' });
        setScrollRequest(n => n + 1);
      } finally {
        setIsSaving(false);
      }
    };

    const handleInputChange = (field, value) => {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
      if (errors[field]) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[field];
          return newErrors;
        });
      }
    };

    const addScene = () => {
      if (sceneInput.trim() && !formData.keyScenes.includes(sceneInput.trim())) {
        setFormData(prev => ({
          ...prev,
          keyScenes: [...prev.keyScenes, sceneInput.trim()]
        }));
        setSceneInput('');
      }
    };

    const removeScene = (scene) => {
      setFormData(prev => ({
        ...prev,
        keyScenes: prev.keyScenes.filter(s => s !== scene)
      }));
    };

    const isViewMode = mode === 'view';
    const title = 'Luvun tiedot';

    // The first message in the order of the form, repeated beside the footer buttons.
    const firstError = ['title', 'location', 'synopsis', 'goals', 'conflicts', 'outcome', 'emotionalArc', 'notes']
      .map(key => errors[key]).find(Boolean);

    // extra: more attributes (the one required field: aria-required; its error says it, not a mark, M B.6)
    const input = (id, key, placeholder, extra) => e('input', {
      id,
      type: 'text',
      className: 'faust-input faust-input--author',
      value: formData[key],
      onChange: (ev) => handleInputChange(key, ev.target.value),
      disabled: isViewMode,
      placeholder,
      ...extra,
      ...invalid(id, errors[key])
    });

    const textarea = (id, key, placeholder, rows, label) => e('textarea', {
      id,
      className: 'faust-textarea faust-textarea--author',
      value: formData[key],
      onChange: (ev) => handleInputChange(key, ev.target.value),
      disabled: isViewMode,
      placeholder,
      rows,
      'aria-label': label,
      ...invalid(id, errors[key])
    });

    // An empty value shows the first option without storing it (the narrator of a chapter that has none).
    const select = (id, key, options) => e('select', {
      id,
      className: 'faust-select',
      value: formData[key] || (options[0] ? options[0].value : ''),
      onChange: (ev) => handleInputChange(key, ev.target.value),
      disabled: isViewMode
    },
      withCurrent(options, formData[key]).map(option =>
        e('option', { key: option.value, value: option.value }, option.label)
      )
    );

    return e('div', {
      ref: scrimRef,
      className: below > 0 ? 'faust-scrim is-stacked' : 'faust-scrim',
      style: { zIndex: 'calc(var(--z-modal) + ' + (below + 1) + ')' },
      // A press on the scrim closes the view-only window, never the form (R-69). Its default action
      // is prevented, so the focus stays in the form, or goes back to the opener, not to the body.
      onMouseDown: (ev) => {
        if (ev.target !== ev.currentTarget) return;
        ev.preventDefault();
        if (isViewMode) onClose();
      }
    },
      e('form', {
        ref: dialogRef,
        tabIndex: -1,
        className: 'faust-dialog faust-dialog--lg',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': ID + '-heading',
        noValidate: true,
        onSubmit: handleSubmit
      },
        // Header
        e('div', { className: 'faust-dialog__header' },
          e('div', { className: 'faust-dialog__heading' },
            e('h2', { className: 'faust-dialog__title', id: ID + '-heading' }, icon('hexagon', 20), title)
          ),
          e('button', {
            type: 'button',
            className: 'faust-btn faust-btn--icon',
            'aria-label': 'Sulje',
            title: 'Sulje (Esc)',
            onClick: onClose
          }, icon('close', 16))
        ),

        // Body
        e('div', { className: 'faust-dialog__body' },
          errors.submit && e('div', { className: 'faust-callout faust-callout--error', role: 'alert' },
            e('span', { className: 'faust-callout__icon' }, icon('error', 16)),
            e('div', { className: 'faust-callout__body' }, errors.submit)
          ),

          section('Perustiedot',
            // One column grid for the form: both rows split in halves, so the field edges line up
            fieldRow('repeat(2, minmax(0, 1fr))', [
              field(ID + '-title', 'Otsikko', input(ID + '-title', 'title', 'Luvun otsikko', { 'aria-required': true }), errors.title, true),
              field(ID + '-status', 'Tila', select(ID + '-status', 'status', CHAPTER_STATUS))
            ]),
            fieldRow('repeat(2, minmax(0, 1fr))', [
              field(ID + '-narrator', 'Kertoja', select(ID + '-narrator', 'povType', POV_TYPES)),
              field(ID + '-place', 'Tapahtumapaikka', input(ID + '-place', 'location', 'Missä luku tapahtuu?'), errors.location)
            ])
          ),

          section('Tiivistelmä',
            field(ID + '-synopsis', null,
              textarea(ID + '-synopsis', 'synopsis', 'Lyhyt tiivistelmä luvun tapahtumista…', 4, 'Tiivistelmä'),
              errors.synopsis)
          ),

          section('Keskeiset kohtaukset',
            ...tagEditor({
              id: ID + '-scene',
              label: 'Keskeiset kohtaukset',
              input: sceneInput,
              setInput: setSceneInput,
              onAdd: addScene,
              items: formData.keyScenes,
              onRemove: removeScene,
              placeholder: 'Kirjoita kohtaus ja paina Enter',
              emptyText: 'Ei keskeisiä kohtauksia',
              isViewMode
            })
          ),

          section('Juoni',
            field(ID + '-goals', 'Hahmojen tavoitteet',
              textarea(ID + '-goals', 'goals', 'Mitä hahmot yrittävät saavuttaa tässä luvussa?', 3),
              errors.goals),
            field(ID + '-conflicts', 'Konfliktit',
              textarea(ID + '-conflicts', 'conflicts', 'Mitä esteitä tai ongelmia ilmenee?', 3),
              errors.conflicts),
            field(ID + '-outcome', 'Lopputulos',
              textarea(ID + '-outcome', 'outcome', 'Miten luku päättyy?', 3),
              errors.outcome)
          ),

          section('Tunnekaari',
            field(ID + '-arc', null,
              textarea(ID + '-arc', 'emotionalArc', 'Miten hahmojen tunnelmat muuttuvat luvun aikana?', 3, 'Tunnekaari'),
              errors.emotionalArc)
          ),

          section('Muistiinpanot',
            field(ID + '-notes', null,
              textarea(ID + '-notes', 'notes', 'Vapaat muistiinpanot…', 3, 'Muistiinpanot'),
              errors.notes)
          )
        ),

        // Footer: Peruuta, then Tallenna. A view-only window has no footer.
        !isViewMode && e('div', { className: 'faust-dialog__footer' },
          e('div', { className: 'faust-dialog__footer-start' },
            firstError && e('span', { className: 'faust-field__error' }, firstError)
          ),
          e('button', {
            type: 'button',
            className: 'faust-btn faust-btn--lg',
            onClick: onClose
          }, 'Peruuta'),
          e('button', {
            type: 'submit',
            className: 'faust-btn faust-btn--lg faust-btn--primary',
            disabled: isSaving,
            'aria-busy': isSaving ? 'true' : undefined
          },
            isSaving && e('span', { className: 'faust-spinner faust-spinner--sm', 'aria-hidden': 'true' }),
            isSaving ? 'Tallennetaan…' : 'Tallenna'
          )
        )
      )
    );
  }

  // Export to window
  window.ChapterSheetModal = ChapterSheetModal;

})(window);

/**
 * ThreadSheetModal - the plot thread form (Juonilanka)
 * DEVELOPMENT_ROADMAP.md:93 - Complete implementation
 *
 * Script-tag compatible version for app.js integration. index.html loads this file in <head>,
 * before the bundle that assigns window.FaustIcons and window.FaustUI, so those globals are read
 * only inside the render function (R-89). The look comes from the dialog, field, section and row
 * classes of styles/faust-components.css. Esc, the stacking order, the inert background and the
 * focus go through window.FaustUI.layerStack and window.FaustUI.holdLayer (useLayer below).
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
  // values stay English.
  const THREAD_TYPE = {
    main_plot: 'Pääjuoni', subplot: 'Sivujuoni', character_arc: 'Hahmon kehityskaari',
    theme: 'Teema', mystery: 'Arvoitus', romance: 'Rakkausjuoni'
  };
  const THREAD_STATE = {
    planned: 'Suunniteltu', active: 'Avoin', developing: 'Kehittyvä', resolved: 'Ratkaistu', abandoned: 'Hylätty'
  };
  const PRIORITY = { critical: 'Kriittinen', high: 'Suuri', medium: 'Tavallinen', low: 'Pieni' };

  // The lists come from window.CONSTANTS as { value, label } objects; without it, from the map's keys.
  // Labels are overridden by value with the map above (menu spec C.13 row 10).
  const toOptions = (items, map) => (items || Object.keys(map)).map(item => {
    const value = typeof item === 'string' ? item : item.value;
    const fallback = typeof item === 'string' ? String(item).replace(/_/g, ' ') : item.label;
    return { value, label: map[value] || fallback };
  });
  // A stored value outside the list (an older entry) stays selectable under its own name, so that
  // opening and saving the form never changes it.
  const withCurrent = (options, value) => (value && !options.some(option => option.value === value)
    ? [{ value, label: String(value).replace(/_/g, ' ') }, ...options]
    : options);

  const THREAD_TYPES = toOptions(window.CONSTANTS?.THREAD_TYPES, THREAD_TYPE);
  const THREAD_STATUS = toOptions(window.CONSTANTS?.THREAD_STATUS, THREAD_STATE);
  const THREAD_PRIORITY = toOptions(window.CONSTANTS?.THREAD_PRIORITY, PRIORITY);
  const VALIDATION_RULES = window.CONSTANTS?.VALIDATION_RULES || {
    DESCRIPTION_MAX_LENGTH: 5000
  };
  const NAME_MAX = 200;

  // A small copy of count() in Dialogs.js, for the one word this form needs (menu spec B.13).
  const FORMS = { merkki: ['merkki', 'merkkiä'] };
  const count = (n, word) => {
    const forms = FORMS[word] || [word, word];
    return Number(n).toLocaleString('fi-FI') + ' ' + (Number(n) === 1 ? forms[0] : forms[1]);
  };
  const tooLong = (what, max) => `${what} on liian pitkä (enintään ${count(max, 'merkki')}).`;
  const tooLongPlural = (what, max) => `${what} ovat liian pitkät (enintään ${count(max, 'merkki')}).`;

  const ID = 'faust-thread';

  const fromThread = (thread) => ({
    name: thread?.name || '',
    type: thread?.type || THREAD_TYPES[0].value,
    status: thread?.status || THREAD_STATUS[0].value,
    priority: thread?.priority || THREAD_PRIORITY[0].value,
    description: thread?.description || '',
    relatedCharacters: thread?.relatedCharacters || [],
    relatedLocations: thread?.relatedLocations || [],
    keyEvents: thread?.keyEvents || [],
    resolution: thread?.resolution || '',
    notes: thread?.notes || ''
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

  function ThreadSheetModal(props) {
    const {
      isOpen,
      onClose,
      thread = null,
      onSave,
      onDelete,
      mode = 'create' // 'create', 'edit', 'view'
    } = props;

    // Hooks run on every render, also while the form is closed (isOpen is checked after them).
    const [formData, setFormData] = useState(() => fromThread(thread));
    const [errors, setErrors] = useState({});
    const [characterInput, setCharacterInput] = useState('');
    const [locationInput, setLocationInput] = useState('');
    const [eventInput, setEventInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [scrollRequest, setScrollRequest] = useState(0);
    const dialogRef = useRef(null);
    const scrimRef = useRef(null);
    const below = useLayer(isOpen, () => onClose(), dialogRef, scrimRef);

    useEffect(() => {
      if (thread) setFormData(fromThread(thread));
    }, [thread]);

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

      if (!formData.name.trim()) {
        newErrors.name = 'Nimi puuttuu.';
      } else if (formData.name.length > NAME_MAX) {
        newErrors.name = tooLong('Nimi', NAME_MAX);
      }
      if (formData.description.length > max) {
        newErrors.description = tooLong('Kuvaus', max);
      }
      if (formData.resolution.length > max) {
        newErrors.resolution = tooLong('Ratkaisu', max);
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
        const threadData = {
          ...thread,
          ...formData,
          id: thread?.id || `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          modified: new Date().toISOString(),
          created: thread?.created || new Date().toISOString()
        };

        await onSave(threadData);
        onClose();
      } catch (error) {
        console.error('[ThreadSheet] Save error:', error);
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

    const addCharacter = () => {
      if (characterInput.trim() && !formData.relatedCharacters.includes(characterInput.trim())) {
        setFormData(prev => ({
          ...prev,
          relatedCharacters: [...prev.relatedCharacters, characterInput.trim()]
        }));
        setCharacterInput('');
      }
    };

    const removeCharacter = (character) => {
      setFormData(prev => ({
        ...prev,
        relatedCharacters: prev.relatedCharacters.filter(c => c !== character)
      }));
    };

    const addLocation = () => {
      if (locationInput.trim() && !formData.relatedLocations.includes(locationInput.trim())) {
        setFormData(prev => ({
          ...prev,
          relatedLocations: [...prev.relatedLocations, locationInput.trim()]
        }));
        setLocationInput('');
      }
    };

    const removeLocation = (location) => {
      setFormData(prev => ({
        ...prev,
        relatedLocations: prev.relatedLocations.filter(l => l !== location)
      }));
    };

    const addEvent = () => {
      if (eventInput.trim() && !formData.keyEvents.includes(eventInput.trim())) {
        setFormData(prev => ({
          ...prev,
          keyEvents: [...prev.keyEvents, eventInput.trim()]
        }));
        setEventInput('');
      }
    };

    const removeEvent = (event) => {
      setFormData(prev => ({
        ...prev,
        keyEvents: prev.keyEvents.filter(item => item !== event)
      }));
    };

    const isViewMode = mode === 'view';
    const title = mode === 'create' ? 'Uusi juonilanka' :
                  mode === 'edit' ? 'Muokkaa juonilankaa' :
                  'Juonilanka';
    const canDelete = Boolean(onDelete) && mode === 'edit';

    // The first message in the order of the form, repeated beside the footer buttons.
    const firstError = ['name', 'description', 'resolution', 'notes'].map(key => errors[key]).find(Boolean);

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

    const select = (id, key, options) => e('select', {
      id,
      className: 'faust-select',
      value: formData[key],
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
            e('h2', { className: 'faust-dialog__title', id: ID + '-heading' }, icon('lemniscate', 20), title)
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
            field(ID + '-name', 'Nimi *', e('input', {
              id: ID + '-name',
              type: 'text',
              className: 'faust-input faust-input--author',
              value: formData.name,
              onChange: (ev) => handleInputChange('name', ev.target.value),
              disabled: isViewMode,
              placeholder: 'Esim. Sankarin matka, Romanttinen juonilanka',
              ...invalid(ID + '-name', errors.name)
            }), errors.name, true),

            fieldRow('repeat(3, minmax(0, 1fr))', [
              field(ID + '-type', 'Tyyppi', select(ID + '-type', 'type', THREAD_TYPES)),
              field(ID + '-status', 'Tila', select(ID + '-status', 'status', THREAD_STATUS)),
              field(ID + '-priority', 'Tärkeys', select(ID + '-priority', 'priority', THREAD_PRIORITY))
            ]),

            field(ID + '-description', 'Kuvaus',
              textarea(ID + '-description', 'description', 'Mitä tässä juonilangassa tapahtuu?', 4),
              errors.description)
          ),

          section('Liittyvät hahmot',
            ...tagEditor({
              id: ID + '-character',
              label: 'Liittyvät hahmot',
              input: characterInput,
              setInput: setCharacterInput,
              onAdd: addCharacter,
              items: formData.relatedCharacters,
              onRemove: removeCharacter,
              placeholder: 'Kirjoita hahmon nimi ja paina Enter',
              emptyText: 'Ei liittyviä hahmoja',
              isViewMode
            })
          ),

          section('Liittyvät paikat',
            ...tagEditor({
              id: ID + '-location',
              label: 'Liittyvät paikat',
              input: locationInput,
              setInput: setLocationInput,
              onAdd: addLocation,
              items: formData.relatedLocations,
              onRemove: removeLocation,
              placeholder: 'Kirjoita paikan nimi ja paina Enter',
              emptyText: 'Ei liittyviä paikkoja',
              isViewMode
            })
          ),

          section('Keskeiset tapahtumat',
            ...tagEditor({
              id: ID + '-event',
              label: 'Keskeiset tapahtumat',
              input: eventInput,
              setInput: setEventInput,
              onAdd: addEvent,
              items: formData.keyEvents,
              onRemove: removeEvent,
              placeholder: 'Kirjoita tapahtuma ja paina Enter',
              emptyText: 'Ei keskeisiä tapahtumia',
              isViewMode
            })
          ),

          section('Ratkaisu',
            field(ID + '-resolution', null,
              textarea(ID + '-resolution', 'resolution', 'Miten juonilanka ratkeaa?', 4, 'Ratkaisu'),
              errors.resolution)
          ),

          section('Muistiinpanot',
            field(ID + '-notes', null,
              textarea(ID + '-notes', 'notes', 'Vapaat muistiinpanot…', 3, 'Muistiinpanot'),
              errors.notes)
          )
        ),

        // Footer: a delete at the left (edit mode, when the parent can delete); Peruuta, then the action.
        // A view-only window has no footer.
        !isViewMode && e('div', { className: 'faust-dialog__footer' },
          e('div', { className: 'faust-dialog__footer-start' },
            canDelete && e('button', {
              type: 'button',
              className: 'faust-btn faust-btn--sm faust-btn--danger',
              disabled: isSaving,
              onClick: () => onDelete(thread)
            }, 'Poista juonilanka'),
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
            isSaving ? 'Tallennetaan…' : mode === 'create' ? 'Luo juonilanka' : 'Tallenna'
          )
        )
      )
    );
  }

  // Export to window
  window.ThreadSheetModal = ThreadSheetModal;

})(window);

/**
 * ThreadSheetModal - Full Thread Form with Validation
 * DEVELOPMENT_ROADMAP.md:93 - Complete implementation
 * 
 * Script-tag compatible version for app.js integration
 */

(function(window) {
  'use strict';

  const { createElement: e, useState, useEffect } = React;

  // Access constants from window (loaded from constants.js)
  const THREAD_TYPES = window.CONSTANTS?.THREAD_TYPES || ['Pääjuoni', 'Sivujuoni', 'Hahmon kehitys'];
  const THREAD_STATUS = window.CONSTANTS?.THREAD_STATUS || ['Aktiivinen', 'Odottaa', 'Ratkaistu'];
  const THREAD_PRIORITY = window.CONSTANTS?.THREAD_PRIORITY || ['Korkea', 'Keskitaso', 'Matala'];
  const VALIDATION_RULES = window.CONSTANTS?.VALIDATION_RULES || {
    DESCRIPTION_MAX_LENGTH: 5000
  };

  function ThreadSheetModal({ 
    isOpen, 
    onClose, 
    thread = null, 
    threads = [],
    onSave,
    mode = 'create' // 'create', 'edit', 'view'
  }) {
    if (!isOpen) return null;

    const [formData, setFormData] = useState({
      name: '',
      type: THREAD_TYPES[0],
      status: THREAD_STATUS[0],
      priority: THREAD_PRIORITY[0],
      description: '',
      relatedCharacters: [],
      relatedLocations: [],
      keyEvents: [],
      resolution: '',
      notes: ''
    });

    const [errors, setErrors] = useState({});
    const [characterInput, setCharacterInput] = useState('');
    const [locationInput, setLocationInput] = useState('');
    const [eventInput, setEventInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
      if (thread) {
        setFormData({
          name: thread.name || '',
          type: thread.type || THREAD_TYPES[0],
          status: thread.status || THREAD_STATUS[0],
          priority: thread.priority || THREAD_PRIORITY[0],
          description: thread.description || '',
          relatedCharacters: thread.relatedCharacters || [],
          relatedLocations: thread.relatedLocations || [],
          keyEvents: thread.keyEvents || [],
          resolution: thread.resolution || '',
          notes: thread.notes || ''
        });
      }
    }, [thread]);

    const validateForm = () => {
      const newErrors = {};

      // Name validation (required)
      if (!formData.name.trim()) {
        newErrors.name = 'Nimi on pakollinen';
      } else if (formData.name.length > 200) {
        newErrors.name = 'Nimi on liian pitkä (max 200 merkkiä)';
      }

      // Type enum validation
      if (formData.type && !THREAD_TYPES.includes(formData.type)) {
        newErrors.type = 'Valitse kelvollinen tyyppi';
      }

      // Status enum validation
      if (formData.status && !THREAD_STATUS.includes(formData.status)) {
        newErrors.status = 'Valitse kelvollinen tila';
      }

      // Priority enum validation
      if (formData.priority && !THREAD_PRIORITY.includes(formData.priority)) {
        newErrors.priority = 'Valitse kelvollinen prioriteetti';
      }

      // Description validation
      if (formData.description.length > VALIDATION_RULES.DESCRIPTION_MAX_LENGTH) {
        newErrors.description = `Kuvaus on liian pitkä (max ${VALIDATION_RULES.DESCRIPTION_MAX_LENGTH} merkkiä)`;
      }

      // Resolution validation
      if (formData.resolution.length > VALIDATION_RULES.DESCRIPTION_MAX_LENGTH) {
        newErrors.resolution = `Ratkaisu on liian pitkä (max ${VALIDATION_RULES.DESCRIPTION_MAX_LENGTH} merkkiä)`;
      }

      // Notes validation
      if (formData.notes.length > VALIDATION_RULES.DESCRIPTION_MAX_LENGTH) {
        newErrors.notes = `Muistiinpanot ovat liian pitkät (max ${VALIDATION_RULES.DESCRIPTION_MAX_LENGTH} merkkiä)`;
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
        setErrors({ submit: 'Tallennus epäonnistui: ' + error.message });
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
        keyEvents: prev.keyEvents.filter(e => e !== event)
      }));
    };

    const isViewMode = mode === 'view';
    const title = mode === 'create' ? '🧵 Luo Juonilanka' : 
                  mode === 'edit' ? '✏️ Muokkaa Juonilankaa' : 
                  '🧵 Juonilangan Tiedot';

    return e('div', {
      className: 'modal-overlay',
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px'
      },
      onClick: (ev) => {
        if (ev.target.className === 'modal-overlay') {
          onClose();
        }
      }
    },
      e('div', {
        style: {
          background: 'var(--bg-primary)',
          border: '2px solid var(--bronze)',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '900px',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '32px',
          position: 'relative'
        }
      },
        // Header
        e('div', {
          style: {
            marginBottom: '24px',
            paddingBottom: '16px',
            borderBottom: '1px solid var(--border-color)'
          }
        },
          e('h2', {
            style: {
              fontFamily: 'EB Garamond',
              fontSize: '28px',
              color: 'var(--text)',
              margin: 0
            }
          }, title),

          // Close button
          e('button', {
            onClick: onClose,
            style: {
              position: 'absolute',
              top: '24px',
              right: '24px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-2)',
              cursor: 'pointer',
              fontSize: '32px',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }
          }, '×')
        ),

        // Form
        e('form', {
          onSubmit: handleSubmit,
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }
        },
          // Basic Information Section
          e('div', {
            style: {
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '20px'
            }
          },
            e('h3', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                marginBottom: '16px'
              }
            }, '📋 Perustiedot'),

            // Name
            e('div', { style: { marginBottom: '16px' } },
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Nimi *'),
              e('input', {
                type: 'text',
                value: formData.name,
                onChange: (ev) => handleInputChange('name', ev.target.value),
                disabled: isViewMode,
                placeholder: 'Esim. Sankarin matka, Romanttinen juonilanka',
                style: {
                  width: '100%',
                  padding: '10px',
                  background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                  border: errors.name ? '2px solid #ff4444' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '16px'
                }
              }),
              errors.name && e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: '#ff4444',
                  marginTop: '4px'
                }
              }, errors.name)
            ),

            // Type, Status, Priority row
            e('div', {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '16px',
                marginBottom: '16px'
              }
            },
              // Type
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'Tyyppi'),
                e('select', {
                  value: formData.type,
                  onChange: (ev) => handleInputChange('type', ev.target.value),
                  disabled: isViewMode,
                  style: {
                    width: '100%',
                    padding: '10px',
                    background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '14px'
                  }
                },
                  THREAD_TYPES.map(type =>
                    e('option', { key: type, value: type }, type)
                  )
                )
              ),

              // Status
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'Tila'),
                e('select', {
                  value: formData.status,
                  onChange: (ev) => handleInputChange('status', ev.target.value),
                  disabled: isViewMode,
                  style: {
                    width: '100%',
                    padding: '10px',
                    background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '14px'
                  }
                },
                  THREAD_STATUS.map(status =>
                    e('option', { key: status, value: status }, status)
                  )
                )
              ),

              // Priority
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'Prioriteetti'),
                e('select', {
                  value: formData.priority,
                  onChange: (ev) => handleInputChange('priority', ev.target.value),
                  disabled: isViewMode,
                  style: {
                    width: '100%',
                    padding: '10px',
                    background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '14px'
                  }
                },
                  THREAD_PRIORITY.map(priority =>
                    e('option', { key: priority, value: priority }, priority)
                  )
                )
              )
            ),

            // Description
            e('div', null,
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Kuvaus'),
              e('textarea', {
                value: formData.description,
                onChange: (ev) => handleInputChange('description', ev.target.value),
                disabled: isViewMode,
                placeholder: 'Mitä tässä juonilangassa tapahtuu?',
                rows: 4,
                style: {
                  width: '100%',
                  padding: '10px',
                  background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                  border: errors.description ? '2px solid #ff4444' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              }),
              errors.description && e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: '#ff4444',
                  marginTop: '4px'
                }
              }, errors.description)
            )
          ),

          // Related Characters Section
          e('div', {
            style: {
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '20px'
            }
          },
            e('h3', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                marginBottom: '16px'
              }
            }, '👥 Liittyvät Hahmot'),

            !isViewMode && e('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } },
              e('input', {
                type: 'text',
                value: characterInput,
                onChange: (ev) => setCharacterInput(ev.target.value),
                onKeyDown: (ev) => {
                  if (ev.key === 'Enter') {
                    ev.preventDefault();
                    addCharacter();
                  }
                },
                placeholder: 'Lisää hahmo ja paina Enter',
                style: {
                  flex: 1,
                  padding: '8px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '13px'
                }
              }),
              e('button', {
                type: 'button',
                onClick: addCharacter,
                style: {
                  padding: '8px 16px',
                  background: 'var(--bronze)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#000',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '13px',
                  fontWeight: 600
                }
              }, 'Lisää')
            ),

            e('div', {
              style: {
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px'
              }
            },
              formData.relatedCharacters.length > 0 ?
                formData.relatedCharacters.map(character =>
                  e('div', {
                    key: character,
                    style: {
                      padding: '6px 12px',
                      background: 'var(--bronze)',
                      color: '#000',
                      borderRadius: '16px',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }
                  },
                    e('span', null, character),
                    !isViewMode && e('button', {
                      type: 'button',
                      onClick: () => removeCharacter(character),
                      style: {
                        background: 'transparent',
                        border: 'none',
                        color: '#000',
                        cursor: 'pointer',
                        fontSize: '16px',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center'
                      }
                    }, '×')
                  )
                ) :
                e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px',
                    color: 'var(--text-3)',
                    fontStyle: 'italic'
                  }
                }, 'Ei liittyviä hahmoja')
            )
          ),

          // Related Locations Section
          e('div', {
            style: {
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '20px'
            }
          },
            e('h3', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                marginBottom: '16px'
              }
            }, '📍 Liittyvät Paikat'),

            !isViewMode && e('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } },
              e('input', {
                type: 'text',
                value: locationInput,
                onChange: (ev) => setLocationInput(ev.target.value),
                onKeyDown: (ev) => {
                  if (ev.key === 'Enter') {
                    ev.preventDefault();
                    addLocation();
                  }
                },
                placeholder: 'Lisää paikka ja paina Enter',
                style: {
                  flex: 1,
                  padding: '8px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '13px'
                }
              }),
              e('button', {
                type: 'button',
                onClick: addLocation,
                style: {
                  padding: '8px 16px',
                  background: 'var(--bronze)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#000',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '13px',
                  fontWeight: 600
                }
              }, 'Lisää')
            ),

            e('div', {
              style: {
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px'
              }
            },
              formData.relatedLocations.length > 0 ?
                formData.relatedLocations.map(location =>
                  e('div', {
                    key: location,
                    style: {
                      padding: '6px 12px',
                      background: 'var(--bronze)',
                      color: '#000',
                      borderRadius: '16px',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }
                  },
                    e('span', null, location),
                    !isViewMode && e('button', {
                      type: 'button',
                      onClick: () => removeLocation(location),
                      style: {
                        background: 'transparent',
                        border: 'none',
                        color: '#000',
                        cursor: 'pointer',
                        fontSize: '16px',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center'
                      }
                    }, '×')
                  )
                ) :
                e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px',
                    color: 'var(--text-3)',
                    fontStyle: 'italic'
                  }
                }, 'Ei liittyviä paikkoja')
            )
          ),

          // Key Events Section
          e('div', {
            style: {
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '20px'
            }
          },
            e('h3', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                marginBottom: '16px'
              }
            }, '⚡ Keskeiset Tapahtumat'),

            !isViewMode && e('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } },
              e('input', {
                type: 'text',
                value: eventInput,
                onChange: (ev) => setEventInput(ev.target.value),
                onKeyDown: (ev) => {
                  if (ev.key === 'Enter') {
                    ev.preventDefault();
                    addEvent();
                  }
                },
                placeholder: 'Lisää tapahtuma ja paina Enter',
                style: {
                  flex: 1,
                  padding: '8px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '13px'
                }
              }),
              e('button', {
                type: 'button',
                onClick: addEvent,
                style: {
                  padding: '8px 16px',
                  background: 'var(--bronze)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#000',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '13px',
                  fontWeight: 600
                }
              }, 'Lisää')
            ),

            e('div', {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }
            },
              formData.keyEvents.length > 0 ?
                formData.keyEvents.map((event, index) =>
                  e('div', {
                    key: index,
                    style: {
                      padding: '8px 12px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '13px',
                      color: 'var(--text)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }
                  },
                    e('span', null, event),
                    !isViewMode && e('button', {
                      type: 'button',
                      onClick: () => removeEvent(event),
                      style: {
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-3)',
                        cursor: 'pointer',
                        fontSize: '16px',
                        padding: 0
                      }
                    }, '×')
                  )
                ) :
                e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px',
                    color: 'var(--text-3)',
                    fontStyle: 'italic'
                  }
                }, 'Ei keskeisiä tapahtumia')
            )
          ),

          // Resolution Section
          e('div', {
            style: {
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '20px'
            }
          },
            e('h3', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                marginBottom: '16px'
              }
            }, '✅ Ratkaisu'),

            e('textarea', {
              value: formData.resolution,
              onChange: (ev) => handleInputChange('resolution', ev.target.value),
              disabled: isViewMode,
              placeholder: 'Miten juonilanka ratkeaa?',
              rows: 4,
              style: {
                width: '100%',
                padding: '10px',
                background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                border: errors.resolution ? '2px solid #ff4444' : '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'EB Garamond',
                fontSize: '14px',
                resize: 'vertical'
              }
            }),
            errors.resolution && e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: '#ff4444',
                marginTop: '4px'
              }
            }, errors.resolution)
          ),

          // Notes Section
          e('div', {
            style: {
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '20px'
            }
          },
            e('h3', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                marginBottom: '16px'
              }
            }, '📝 Muistiinpanot'),

            e('textarea', {
              value: formData.notes,
              onChange: (ev) => handleInputChange('notes', ev.target.value),
              disabled: isViewMode,
              placeholder: 'Vapaat muistiinpanot...',
              rows: 3,
              style: {
                width: '100%',
                padding: '10px',
                background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                border: errors.notes ? '2px solid #ff4444' : '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'EB Garamond',
                fontSize: '14px',
                resize: 'vertical'
              }
            }),
            errors.notes && e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: '#ff4444',
                marginTop: '4px'
              }
            }, errors.notes)
          ),

          // Submit error
          errors.submit && e('div', {
            style: {
              padding: '12px',
              background: 'rgba(255, 68, 68, 0.1)',
              border: '1px solid rgba(255, 68, 68, 0.3)',
              borderRadius: '4px',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: '#ff4444'
            }
          }, errors.submit),

          // Form actions
          !isViewMode && e('div', {
            style: {
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-color)'
            }
          },
            e('button', {
              type: 'button',
              onClick: onClose,
              style: {
                padding: '12px 24px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '13px'
              }
            }, 'Peruuta'),

            e('button', {
              type: 'submit',
              disabled: isSaving,
              style: {
                padding: '12px 24px',
                background: isSaving ? 'var(--bg-2)' : 'var(--bronze)',
                border: 'none',
                borderRadius: '4px',
                color: isSaving ? 'var(--text-3)' : '#000',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '13px',
                fontWeight: 600
              }
            }, isSaving ? 'Tallennetaan...' : mode === 'create' ? 'Luo' : 'Tallenna')
          ),

          // View mode close button
          isViewMode && e('div', {
            style: {
              display: 'flex',
              justifyContent: 'flex-end',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-color)'
            }
          },
            e('button', {
              type: 'button',
              onClick: onClose,
              style: {
                padding: '12px 24px',
                background: 'var(--bronze)',
                border: 'none',
                borderRadius: '4px',
                color: '#000',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '13px',
                fontWeight: 600
              }
            }, 'Sulje')
          )
        )
      )
    );
  }

  // Export to window
  window.ThreadSheetModal = ThreadSheetModal;

})(window);

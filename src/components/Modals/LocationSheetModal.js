/**
 * LocationSheetModal - Full Location Form with Validation
 * DEVELOPMENT_ROADMAP.md:73 - Complete implementation
 * 
 * Script-tag compatible version for app.js integration
 */

(function(window) {
  'use strict';

  const { createElement: e, useState, useEffect } = React;

  // Access constants from window (loaded from constants.js)
  const LOCATION_TYPES = window.CONSTANTS?.LOCATION_TYPES || ['Kaupunki', 'Luonto', 'Sisätila', 'Muu'];
  const LOCATION_ATMOSPHERES = window.CONSTANTS?.LOCATION_ATMOSPHERES || ['Rauhallinen', 'Jännittävä', 'Synkkä', 'Valoisa'];
  const LOCATION_IMPORTANCE = window.CONSTANTS?.LOCATION_IMPORTANCE || ['Tärkeä', 'Keskitärkeä', 'Vähäinen'];
  const VALIDATION_RULES = window.CONSTANTS?.VALIDATION_RULES || {
    LOCATION_NAME_MAX_LENGTH: 100,
    DESCRIPTION_MAX_LENGTH: 5000
  };

  function LocationSheetModal({ 
    isOpen, 
    onClose, 
    location = null, 
    locations = [],
    onSave,
    mode = 'create' // 'create', 'edit', 'view'
  }) {
    if (!isOpen) return null;

    const [formData, setFormData] = useState({
      name: '',
      type: LOCATION_TYPES[0],
      description: '',
      atmosphere: LOCATION_ATMOSPHERES[0],
      importance: LOCATION_IMPORTANCE[0],
      associatedCharacters: [],
      historicalContext: '',
      sensoryDetails: {
        visual: '',
        auditory: '',
        olfactory: '',
        tactile: ''
      },
      symbolicMeaning: '',
      notes: ''
    });

    const [errors, setErrors] = useState({});
    const [characterInput, setCharacterInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
      if (location) {
        setFormData({
          name: location.name || '',
          type: location.type || LOCATION_TYPES[0],
          description: location.description || '',
          atmosphere: location.atmosphere || LOCATION_ATMOSPHERES[0],
          importance: location.importance || LOCATION_IMPORTANCE[0],
          associatedCharacters: location.associatedCharacters || [],
          historicalContext: location.historicalContext || '',
          sensoryDetails: {
            visual: location.sensoryDetails?.visual || '',
            auditory: location.sensoryDetails?.auditory || '',
            olfactory: location.sensoryDetails?.olfactory || '',
            tactile: location.sensoryDetails?.tactile || ''
          },
          symbolicMeaning: location.symbolicMeaning || '',
          notes: location.notes || ''
        });
      }
    }, [location]);

    const validateForm = () => {
      const newErrors = {};

      // Name validation (required)
      if (!formData.name.trim()) {
        newErrors.name = 'Nimi on pakollinen';
      } else if (formData.name.length > VALIDATION_RULES.LOCATION_NAME_MAX_LENGTH) {
        newErrors.name = `Nimi on liian pitkä (max ${VALIDATION_RULES.LOCATION_NAME_MAX_LENGTH} merkkiä)`;
      }

      // Type enum validation
      if (formData.type && !LOCATION_TYPES.includes(formData.type)) {
        newErrors.type = 'Valitse kelvollinen tyyppi';
      }

      // Atmosphere enum validation
      if (formData.atmosphere && !LOCATION_ATMOSPHERES.includes(formData.atmosphere)) {
        newErrors.atmosphere = 'Valitse kelvollinen tunnelma';
      }

      // Importance enum validation
      if (formData.importance && !LOCATION_IMPORTANCE.includes(formData.importance)) {
        newErrors.importance = 'Valitse kelvollinen tärkeys';
      }

      // Description validation
      if (formData.description.length > VALIDATION_RULES.DESCRIPTION_MAX_LENGTH) {
        newErrors.description = `Kuvaus on liian pitkä (max ${VALIDATION_RULES.DESCRIPTION_MAX_LENGTH} merkkiä)`;
      }

      // Historical context validation
      if (formData.historicalContext.length > VALIDATION_RULES.DESCRIPTION_MAX_LENGTH) {
        newErrors.historicalContext = `Historiallinen konteksti on liian pitkä (max ${VALIDATION_RULES.DESCRIPTION_MAX_LENGTH} merkkiä)`;
      }

      // Sensory details validation
      Object.keys(formData.sensoryDetails).forEach(sense => {
        if (formData.sensoryDetails[sense].length > 1000) {
          newErrors[`sensoryDetails.${sense}`] = `Aistikuvaus on liian pitkä (max 1000 merkkiä)`;
        }
      });

      // Symbolic meaning validation
      if (formData.symbolicMeaning.length > 2000) {
        newErrors.symbolicMeaning = 'Symbolinen merkitys on liian pitkä (max 2000 merkkiä)';
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
        const locationData = {
          ...location,
          ...formData,
          id: location?.id || `loc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          modified: new Date().toISOString(),
          created: location?.created || new Date().toISOString()
        };

        await onSave(locationData);
        onClose();
      } catch (error) {
        console.error('[LocationSheet] Save error:', error);
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

    const handleSensoryChange = (sense, value) => {
      setFormData(prev => ({
        ...prev,
        sensoryDetails: {
          ...prev.sensoryDetails,
          [sense]: value
        }
      }));
      const errorKey = `sensoryDetails.${sense}`;
      if (errors[errorKey]) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[errorKey];
          return newErrors;
        });
      }
    };

    const addCharacter = () => {
      if (characterInput.trim() && !formData.associatedCharacters.includes(characterInput.trim())) {
        setFormData(prev => ({
          ...prev,
          associatedCharacters: [...prev.associatedCharacters, characterInput.trim()]
        }));
        setCharacterInput('');
      }
    };

    const removeCharacter = (character) => {
      setFormData(prev => ({
        ...prev,
        associatedCharacters: prev.associatedCharacters.filter(c => c !== character)
      }));
    };

    const isViewMode = mode === 'view';
    const title = mode === 'create' ? '📍 Luo Paikka' : 
                  mode === 'edit' ? '✏️ Muokkaa Paikkaa' : 
                  '📍 Paikan Tiedot';

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
                placeholder: 'Esim. Pääkaupunki, Metsä, Kahvila',
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

            // Type, Atmosphere, Importance row
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
                  LOCATION_TYPES.map(type =>
                    e('option', { key: type, value: type }, type)
                  )
                )
              ),

              // Atmosphere
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'Tunnelma'),
                e('select', {
                  value: formData.atmosphere,
                  onChange: (ev) => handleInputChange('atmosphere', ev.target.value),
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
                  LOCATION_ATMOSPHERES.map(atmosphere =>
                    e('option', { key: atmosphere, value: atmosphere }, atmosphere)
                  )
                )
              ),

              // Importance
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'Tärkeys'),
                e('select', {
                  value: formData.importance,
                  onChange: (ev) => handleInputChange('importance', ev.target.value),
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
                  LOCATION_IMPORTANCE.map(importance =>
                    e('option', { key: importance, value: importance }, importance)
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
                placeholder: 'Yleinen kuvaus paikasta...',
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

          // Associated Characters Section
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
                onKeyPress: (ev) => {
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
              formData.associatedCharacters.length > 0 ? 
                formData.associatedCharacters.map(character =>
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

          // Historical Context Section
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
            }, '📜 Historiallinen Konteksti'),

            e('textarea', {
              value: formData.historicalContext,
              onChange: (ev) => handleInputChange('historicalContext', ev.target.value),
              disabled: isViewMode,
              placeholder: 'Paikan historia ja merkitys tarinassa...',
              rows: 4,
              style: {
                width: '100%',
                padding: '10px',
                background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                border: errors.historicalContext ? '2px solid #ff4444' : '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'EB Garamond',
                fontSize: '14px',
                resize: 'vertical'
              }
            }),
            errors.historicalContext && e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: '#ff4444',
                marginTop: '4px'
              }
            }, errors.historicalContext)
          ),

          // Sensory Details Section
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
            }, '👁️ Aistikokemukset'),

            // Visual
            e('div', { style: { marginBottom: '16px' } },
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Visuaalinen'),
              e('textarea', {
                value: formData.sensoryDetails.visual,
                onChange: (ev) => handleSensoryChange('visual', ev.target.value),
                disabled: isViewMode,
                placeholder: 'Miltä paikka näyttää? Värit, muodot, valo...',
                rows: 2,
                style: {
                  width: '100%',
                  padding: '10px',
                  background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                  border: errors['sensoryDetails.visual'] ? '2px solid #ff4444' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              }),
              errors['sensoryDetails.visual'] && e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: '#ff4444',
                  marginTop: '4px'
                }
              }, errors['sensoryDetails.visual'])
            ),

            // Auditory
            e('div', { style: { marginBottom: '16px' } },
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Kuuloaistimus'),
              e('textarea', {
                value: formData.sensoryDetails.auditory,
                onChange: (ev) => handleSensoryChange('auditory', ev.target.value),
                disabled: isViewMode,
                placeholder: 'Mitä ääniä paikassa kuuluu?',
                rows: 2,
                style: {
                  width: '100%',
                  padding: '10px',
                  background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                  border: errors['sensoryDetails.auditory'] ? '2px solid #ff4444' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              }),
              errors['sensoryDetails.auditory'] && e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: '#ff4444',
                  marginTop: '4px'
                }
              }, errors['sensoryDetails.auditory'])
            ),

            // Olfactory
            e('div', { style: { marginBottom: '16px' } },
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Hajuaistimus'),
              e('textarea', {
                value: formData.sensoryDetails.olfactory,
                onChange: (ev) => handleSensoryChange('olfactory', ev.target.value),
                disabled: isViewMode,
                placeholder: 'Miltä paikka tuoksuu?',
                rows: 2,
                style: {
                  width: '100%',
                  padding: '10px',
                  background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                  border: errors['sensoryDetails.olfactory'] ? '2px solid #ff4444' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              }),
              errors['sensoryDetails.olfactory'] && e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: '#ff4444',
                  marginTop: '4px'
                }
              }, errors['sensoryDetails.olfactory'])
            ),

            // Tactile
            e('div', null,
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Tuntoaistimus'),
              e('textarea', {
                value: formData.sensoryDetails.tactile,
                onChange: (ev) => handleSensoryChange('tactile', ev.target.value),
                disabled: isViewMode,
                placeholder: 'Miltä paikka tuntuu? Lämpötila, kosteus, pinnat...',
                rows: 2,
                style: {
                  width: '100%',
                  padding: '10px',
                  background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                  border: errors['sensoryDetails.tactile'] ? '2px solid #ff4444' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              }),
              errors['sensoryDetails.tactile'] && e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: '#ff4444',
                  marginTop: '4px'
                }
              }, errors['sensoryDetails.tactile'])
            )
          ),

          // Symbolic Meaning Section
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
            }, '✨ Symbolinen Merkitys'),

            e('textarea', {
              value: formData.symbolicMeaning,
              onChange: (ev) => handleInputChange('symbolicMeaning', ev.target.value),
              disabled: isViewMode,
              placeholder: 'Mitä paikka symboloi tarinassa?',
              rows: 3,
              style: {
                width: '100%',
                padding: '10px',
                background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                border: errors.symbolicMeaning ? '2px solid #ff4444' : '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'EB Garamond',
                fontSize: '14px',
                resize: 'vertical'
              }
            }),
            errors.symbolicMeaning && e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: '#ff4444',
                marginTop: '4px'
              }
            }, errors.symbolicMeaning)
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
  window.LocationSheetModal = LocationSheetModal;

})(window);

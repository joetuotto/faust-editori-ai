/**
 * ChapterSheetModal - Full Chapter Form with Validation
 * DEVELOPMENT_ROADMAP.md:117 - Complete implementation
 * 
 * Script-tag compatible version for app.js integration
 */

(function(window) {
  'use strict';

  const { createElement: e, useState, useEffect } = React;

  // Access constants from window (loaded from constants.js)

  // Option lists come from window.CONSTANTS as { value, label } objects, or as
  // plain strings in the fallback. Rendering the object itself as an <option>
  // child throws.
  const toOptions = (items) => (items || []).map(item => (
    typeof item === 'string' ? { value: item, label: item } : item
  ));
  const CHAPTER_STATUS = toOptions(window.CONSTANTS?.CHAPTER_STATUS || ['Suunniteltu', 'Keskeneräinen', 'Valmis']);
  const POV_TYPES = toOptions(window.CONSTANTS?.POV_TYPES || ['Ensimmäinen persoona', 'Kolmas persoona', 'Toiseen persoonaan']);
  const VALIDATION_RULES = window.CONSTANTS?.VALIDATION_RULES || {
    DESCRIPTION_MAX_LENGTH: 5000
  };

  function ChapterSheetModal({ 
    isOpen, 
    onClose, 
    chapter = null, 
    chapters = [],
    onSave,
    mode = 'create' // 'create', 'edit', 'view'
  }) {
    if (!isOpen) return null;

    const [formData, setFormData] = useState({
      title: '',
      number: '',
      status: CHAPTER_STATUS[0].value,
      pov: '',
      povType: POV_TYPES[0].value,
      location: '',
      wordCountTarget: '',
      actualWordCount: 0,
      synopsis: '',
      keyScenes: [],
      goals: '',
      conflicts: '',
      outcome: '',
      emotionalArc: '',
      notes: ''
    });

    const [errors, setErrors] = useState({});
    const [sceneInput, setSceneInput] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
      if (chapter) {
        setFormData({
          title: chapter.title || '',
          number: chapter.number || '',
          status: chapter.status || CHAPTER_STATUS[0].value,
          pov: chapter.pov || '',
          povType: chapter.povType || POV_TYPES[0].value,
          location: chapter.location || '',
          wordCountTarget: chapter.wordCountTarget || '',
          actualWordCount: chapter.actualWordCount || 0,
          synopsis: chapter.synopsis || '',
          keyScenes: chapter.keyScenes || [],
          goals: chapter.goals || '',
          conflicts: chapter.conflicts || '',
          outcome: chapter.outcome || '',
          emotionalArc: chapter.emotionalArc || '',
          notes: chapter.notes || ''
        });
      }
    }, [chapter]);

    const validateForm = () => {
      const newErrors = {};

      // Title validation (required)
      if (!formData.title.trim()) {
        newErrors.title = 'Otsikko on pakollinen';
      } else if (formData.title.length > 200) {
        newErrors.title = 'Otsikko on liian pitkä (max 200 merkkiä)';
      }

      // Number validation
      if (formData.number && isNaN(formData.number)) {
        newErrors.number = 'Luvun numeron on oltava numero';
      }

      // POV validation
      if (formData.pov.length > 100) {
        newErrors.pov = 'POV on liian pitkä (max 100 merkkiä)';
      }

      // Location validation
      if (formData.location.length > 200) {
        newErrors.location = 'Sijainti on liian pitkä (max 200 merkkiä)';
      }

      // Word count target validation
      if (formData.wordCountTarget && isNaN(formData.wordCountTarget)) {
        newErrors.wordCountTarget = 'Sanamäärätavoitteen on oltava numero';
      }

      // Synopsis validation
      if (formData.synopsis.length > VALIDATION_RULES.DESCRIPTION_MAX_LENGTH) {
        newErrors.synopsis = `Yhteenveto on liian pitkä (max ${VALIDATION_RULES.DESCRIPTION_MAX_LENGTH} merkkiä)`;
      }

      // Goals validation
      if (formData.goals.length > VALIDATION_RULES.DESCRIPTION_MAX_LENGTH) {
        newErrors.goals = `Tavoitteet ovat liian pitkät (max ${VALIDATION_RULES.DESCRIPTION_MAX_LENGTH} merkkiä)`;
      }

      // Conflicts validation
      if (formData.conflicts.length > VALIDATION_RULES.DESCRIPTION_MAX_LENGTH) {
        newErrors.conflicts = `Konfliktit ovat liian pitkät (max ${VALIDATION_RULES.DESCRIPTION_MAX_LENGTH} merkkiä)`;
      }

      // Outcome validation
      if (formData.outcome.length > VALIDATION_RULES.DESCRIPTION_MAX_LENGTH) {
        newErrors.outcome = `Lopputulos on liian pitkä (max ${VALIDATION_RULES.DESCRIPTION_MAX_LENGTH} merkkiä)`;
      }

      // Emotional arc validation
      if (formData.emotionalArc.length > 2000) {
        newErrors.emotionalArc = 'Tunnekaari on liian pitkä (max 2000 merkkiä)';
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
        const chapterData = {
          ...chapter,
          ...formData,
          id: chapter?.id || `chapter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          modified: new Date().toISOString(),
          created: chapter?.created || new Date().toISOString()
        };

        await onSave(chapterData);
        onClose();
      } catch (error) {
        console.error('[ChapterSheet] Save error:', error);
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
    const title = mode === 'create' ? '📖 Luo Luku' : 
                  mode === 'edit' ? '✏️ Muokkaa Lukua' : 
                  '📖 Luvun Tiedot';

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

            // Title and Number row
            e('div', {
              style: {
                display: 'grid',
                gridTemplateColumns: '3fr 1fr 2fr',
                gap: '16px',
                marginBottom: '16px'
              }
            },
              // Title
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'Otsikko *'),
                e('input', {
                  type: 'text',
                  value: formData.title,
                  onChange: (ev) => handleInputChange('title', ev.target.value),
                  disabled: isViewMode,
                  placeholder: 'Luvun otsikko',
                  style: {
                    width: '100%',
                    padding: '10px',
                    background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                    border: errors.title ? '2px solid #ff4444' : '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'EB Garamond',
                    fontSize: '16px'
                  }
                }),
                errors.title && e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: '#ff4444',
                    marginTop: '4px'
                  }
                }, errors.title)
              ),

              // Number
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'Numero'),
                e('input', {
                  type: 'text',
                  value: formData.number,
                  onChange: (ev) => handleInputChange('number', ev.target.value),
                  disabled: isViewMode,
                  placeholder: '1',
                  style: {
                    width: '100%',
                    padding: '10px',
                    background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                    border: errors.number ? '2px solid #ff4444' : '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '14px'
                  }
                }),
                errors.number && e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: '#ff4444',
                    marginTop: '4px'
                  }
                }, errors.number)
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
                  CHAPTER_STATUS.map(option =>
                    e('option', { key: option.value, value: option.value }, option.label)
                  )
                )
              )
            ),

            // POV, POV Type, Location row
            e('div', {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '16px',
                marginBottom: '16px'
              }
            },
              // POV
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'POV-hahmo'),
                e('input', {
                  type: 'text',
                  value: formData.pov,
                  onChange: (ev) => handleInputChange('pov', ev.target.value),
                  disabled: isViewMode,
                  placeholder: 'Hahmon nimi',
                  style: {
                    width: '100%',
                    padding: '10px',
                    background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                    border: errors.pov ? '2px solid #ff4444' : '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'EB Garamond',
                    fontSize: '14px'
                  }
                }),
                errors.pov && e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: '#ff4444',
                    marginTop: '4px'
                  }
                }, errors.pov)
              ),

              // POV Type
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'POV-tyyppi'),
                e('select', {
                  value: formData.povType,
                  onChange: (ev) => handleInputChange('povType', ev.target.value),
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
                  POV_TYPES.map(option =>
                    e('option', { key: option.value, value: option.value }, option.label)
                  )
                )
              ),

              // Location
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'Pääsijainti'),
                e('input', {
                  type: 'text',
                  value: formData.location,
                  onChange: (ev) => handleInputChange('location', ev.target.value),
                  disabled: isViewMode,
                  placeholder: 'Missä luku tapahtuu',
                  style: {
                    width: '100%',
                    padding: '10px',
                    background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                    border: errors.location ? '2px solid #ff4444' : '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'EB Garamond',
                    fontSize: '14px'
                  }
                }),
                errors.location && e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: '#ff4444',
                    marginTop: '4px'
                  }
                }, errors.location)
              )
            ),

            // Word Count row
            e('div', {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px'
              }
            },
              // Word Count Target
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'Sanamäärätavoite'),
                e('input', {
                  type: 'text',
                  value: formData.wordCountTarget,
                  onChange: (ev) => handleInputChange('wordCountTarget', ev.target.value),
                  disabled: isViewMode,
                  placeholder: '3000',
                  style: {
                    width: '100%',
                    padding: '10px',
                    background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                    border: errors.wordCountTarget ? '2px solid #ff4444' : '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '14px'
                  }
                }),
                errors.wordCountTarget && e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: '#ff4444',
                    marginTop: '4px'
                  }
                }, errors.wordCountTarget)
              ),

              // Actual Word Count
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'Todellinen sanamäärä'),
                e('input', {
                  type: 'text',
                  value: formData.actualWordCount,
                  disabled: true,
                  placeholder: '0',
                  style: {
                    width: '100%',
                    padding: '10px',
                    background: 'var(--bg-1)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-3)',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '14px'
                  }
                }),
                e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '10px',
                    color: 'var(--text-3)',
                    marginTop: '4px'
                  }
                }, 'Lasketaan automaattisesti')
              )
            )
          ),

          // Synopsis Section
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
            }, '📝 Yhteenveto'),

            e('textarea', {
              value: formData.synopsis,
              onChange: (ev) => handleInputChange('synopsis', ev.target.value),
              disabled: isViewMode,
              placeholder: 'Lyhyt yhteenveto luvun tapahtumista...',
              rows: 4,
              style: {
                width: '100%',
                padding: '10px',
                background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                border: errors.synopsis ? '2px solid #ff4444' : '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'EB Garamond',
                fontSize: '14px',
                resize: 'vertical'
              }
            }),
            errors.synopsis && e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: '#ff4444',
                marginTop: '4px'
              }
            }, errors.synopsis)
          ),

          // Key Scenes Section
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
            }, '🎬 Keskeiset Kohtaukset'),

            !isViewMode && e('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } },
              e('input', {
                type: 'text',
                value: sceneInput,
                onChange: (ev) => setSceneInput(ev.target.value),
                onKeyPress: (ev) => {
                  if (ev.key === 'Enter') {
                    ev.preventDefault();
                    addScene();
                  }
                },
                placeholder: 'Lisää kohtaus ja paina Enter',
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
                onClick: addScene,
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
              formData.keyScenes.length > 0 ?
                formData.keyScenes.map((scene, index) =>
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
                    e('span', null, scene),
                    !isViewMode && e('button', {
                      type: 'button',
                      onClick: () => removeScene(scene),
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
                }, 'Ei keskeisiä kohtauksia')
            )
          ),

          // Plot Details Section
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
            }, '🎭 Juonitiedot'),

            // Goals
            e('div', { style: { marginBottom: '16px' } },
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Tavoitteet'),
              e('textarea', {
                value: formData.goals,
                onChange: (ev) => handleInputChange('goals', ev.target.value),
                disabled: isViewMode,
                placeholder: 'Mitä hahmot yrittävät saavuttaa tässä luvussa?',
                rows: 3,
                style: {
                  width: '100%',
                  padding: '10px',
                  background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                  border: errors.goals ? '2px solid #ff4444' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              }),
              errors.goals && e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: '#ff4444',
                  marginTop: '4px'
                }
              }, errors.goals)
            ),

            // Conflicts
            e('div', { style: { marginBottom: '16px' } },
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Konfliktit'),
              e('textarea', {
                value: formData.conflicts,
                onChange: (ev) => handleInputChange('conflicts', ev.target.value),
                disabled: isViewMode,
                placeholder: 'Mitä esteitä tai ongelmia ilmenee?',
                rows: 3,
                style: {
                  width: '100%',
                  padding: '10px',
                  background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                  border: errors.conflicts ? '2px solid #ff4444' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              }),
              errors.conflicts && e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: '#ff4444',
                  marginTop: '4px'
                }
              }, errors.conflicts)
            ),

            // Outcome
            e('div', null,
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Lopputulos'),
              e('textarea', {
                value: formData.outcome,
                onChange: (ev) => handleInputChange('outcome', ev.target.value),
                disabled: isViewMode,
                placeholder: 'Miten luku päättyy?',
                rows: 3,
                style: {
                  width: '100%',
                  padding: '10px',
                  background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                  border: errors.outcome ? '2px solid #ff4444' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              }),
              errors.outcome && e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: '#ff4444',
                  marginTop: '4px'
                }
              }, errors.outcome)
            )
          ),

          // Emotional Arc Section
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
            }, '💫 Tunnekaari'),

            e('textarea', {
              value: formData.emotionalArc,
              onChange: (ev) => handleInputChange('emotionalArc', ev.target.value),
              disabled: isViewMode,
              placeholder: 'Miten hahmojen tunnelmat muuttuvat luvun aikana?',
              rows: 3,
              style: {
                width: '100%',
                padding: '10px',
                background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                border: errors.emotionalArc ? '2px solid #ff4444' : '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text)',
                fontFamily: 'EB Garamond',
                fontSize: '14px',
                resize: 'vertical'
              }
            }),
            errors.emotionalArc && e('div', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: '#ff4444',
                marginTop: '4px'
              }
            }, errors.emotionalArc)
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
  window.ChapterSheetModal = ChapterSheetModal;

})(window);

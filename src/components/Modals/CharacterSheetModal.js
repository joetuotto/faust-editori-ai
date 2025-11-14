/**
 * CharacterSheetModal - Full Character Form with Validation
 * DEVELOPMENT_ROADMAP.md:35 - Complete implementation
 * 
 * Script-tag compatible version for app.js integration
 */

(function(window) {
  'use strict';

  const { createElement: e, useState, useEffect } = React;

  function CharacterSheetModal({ 
    isOpen, 
    onClose, 
    character = null, 
    characters = [],
    onSave,
    mode = 'create' // 'create', 'edit', 'view'
  }) {
    if (!isOpen) return null;

    // Form state
    const [formData, setFormData] = useState({
      name: '',
      age: '',
      gender: '',
      appearance: '',
      traits: [],
      motivations: [],
      fears: [],
      relationships: [],
      arc: {
        beginning: '',
        development: '',
        end: ''
      }
    });

    const [currentTrait, setCurrentTrait] = useState('');
    const [currentMotivation, setCurrentMotivation] = useState('');
    const [currentFear, setCurrentFear] = useState('');
    const [errors, setErrors] = useState({});
    const [isSaving, setIsSaving] = useState(false);

    // Load character data if editing
    useEffect(() => {
      if (character) {
        setFormData({
          name: character.name || '',
          age: character.age || '',
          gender: character.gender || '',
          appearance: character.appearance || '',
          traits: character.traits || [],
          motivations: character.motivations || [],
          fears: character.fears || [],
          relationships: character.relationships || [],
          arc: character.arc || {
            beginning: '',
            development: '',
            end: ''
          }
        });
      }
    }, [character]);

    // Validation
    const validateForm = () => {
      const newErrors = {};

      // Name is required
      if (!formData.name.trim()) {
        newErrors.name = 'Nimi on pakollinen';
      } else if (formData.name.length > 100) {
        newErrors.name = 'Nimi on liian pitkä (max 100 merkkiä)';
      }

      // Age validation (if provided)
      if (formData.age && (isNaN(formData.age) || formData.age < 0 || formData.age > 200)) {
        newErrors.age = 'Anna kelvollinen ikä (0-200)';
      }

      // Appearance max length
      if (formData.appearance.length > 5000) {
        newErrors.appearance = 'Ulkonäkökuvaus on liian pitkä (max 5000 merkkiä)';
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    };

    // Handle form submission
    const handleSubmit = async (ev) => {
      ev.preventDefault();

      if (!validateForm()) {
        return;
      }

      setIsSaving(true);

      try {
        // Prepare character data
        const characterData = {
          ...character,
          ...formData,
          id: character?.id || `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          modified: new Date().toISOString(),
          created: character?.created || new Date().toISOString()
        };

        await onSave(characterData);
        onClose();
      } catch (error) {
        console.error('[CharacterSheet] Save error:', error);
        setErrors({ submit: 'Tallennus epäonnistui: ' + error.message });
      } finally {
        setIsSaving(false);
      }
    };

    // Handle adding trait
    const addTrait = () => {
      if (currentTrait.trim() && !formData.traits.includes(currentTrait.trim())) {
        setFormData({
          ...formData,
          traits: [...formData.traits, currentTrait.trim()]
        });
        setCurrentTrait('');
      }
    };

    // Handle removing trait
    const removeTrait = (trait) => {
      setFormData({
        ...formData,
        traits: formData.traits.filter(t => t !== trait)
      });
    };

    // Handle adding motivation
    const addMotivation = () => {
      if (currentMotivation.trim() && !formData.motivations.includes(currentMotivation.trim())) {
        setFormData({
          ...formData,
          motivations: [...formData.motivations, currentMotivation.trim()]
        });
        setCurrentMotivation('');
      }
    };

    // Handle removing motivation
    const removeMotivation = (motivation) => {
      setFormData({
        ...formData,
        motivations: formData.motivations.filter(m => m !== motivation)
      });
    };

    // Handle adding fear
    const addFear = () => {
      if (currentFear.trim() && !formData.fears.includes(currentFear.trim())) {
        setFormData({
          ...formData,
          fears: [...formData.fears, currentFear.trim()]
        });
        setCurrentFear('');
      }
    };

    // Handle removing fear
    const removeFear = (fear) => {
      setFormData({
        ...formData,
        fears: formData.fears.filter(f => f !== fear)
      });
    };

    const isViewMode = mode === 'view';

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
          }, mode === 'create' ? '✨ Luo Hahmo' : mode === 'edit' ? '✏️ Muokkaa Hahmoa' : '👤 Hahmon Tiedot'),

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
          // Bio Section
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
                onChange: (ev) => setFormData({ ...formData, name: ev.target.value }),
                disabled: isViewMode,
                placeholder: 'Esim. Maria Virtanen',
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

            // Age and Gender row
            e('div', {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '16px'
              }
            },
              // Age
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'Ikä'),
                e('input', {
                  type: 'number',
                  value: formData.age,
                  onChange: (ev) => setFormData({ ...formData, age: ev.target.value }),
                  disabled: isViewMode,
                  placeholder: 'Esim. 35',
                  min: 0,
                  max: 200,
                  style: {
                    width: '100%',
                    padding: '10px',
                    background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                    border: errors.age ? '2px solid #ff4444' : '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '14px'
                  }
                }),
                errors.age && e('div', {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: '#ff4444',
                    marginTop: '4px'
                  }
                }, errors.age)
              ),

              // Gender
              e('div', null,
                e('label', {
                  style: {
                    display: 'block',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    color: 'var(--text-2)',
                    marginBottom: '6px'
                  }
                }, 'Sukupuoli'),
                e('select', {
                  value: formData.gender,
                  onChange: (ev) => setFormData({ ...formData, gender: ev.target.value }),
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
                  e('option', { value: '' }, '— Valitse —'),
                  e('option', { value: 'male' }, 'Mies'),
                  e('option', { value: 'female' }, 'Nainen'),
                  e('option', { value: 'non-binary' }, 'Muu'),
                  e('option', { value: 'other' }, 'Muu')
                )
              )
            ),

            // Appearance
            e('div', null,
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Ulkonäkö'),
              e('textarea', {
                value: formData.appearance,
                onChange: (ev) => setFormData({ ...formData, appearance: ev.target.value }),
                disabled: isViewMode,
                placeholder: 'Kuvaa hahmon ulkonäköä...',
                rows: 4,
                style: {
                  width: '100%',
                  padding: '10px',
                  background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                  border: errors.appearance ? '2px solid #ff4444' : '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              }),
              errors.appearance && e('div', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: '#ff4444',
                  marginTop: '4px'
                }
              }, errors.appearance)
            )
          ),

          // Personality Section
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
            }, '🧠 Persoonallisuus'),

            // Traits
            e('div', { style: { marginBottom: '16px' } },
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Luonteenpiirteet'),
              !isViewMode && e('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } },
                e('input', {
                  type: 'text',
                  value: currentTrait,
                  onChange: (ev) => setCurrentTrait(ev.target.value),
                  onKeyPress: (ev) => {
                    if (ev.key === 'Enter') {
                      ev.preventDefault();
                      addTrait();
                    }
                  },
                  placeholder: 'Esim. Rohkea, Sarkastinen...',
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
                  onClick: addTrait,
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
                formData.traits.map(trait =>
                  e('div', {
                    key: trait,
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
                    e('span', null, trait),
                    !isViewMode && e('button', {
                      type: 'button',
                      onClick: () => removeTrait(trait),
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
                )
              )
            ),

            // Motivations
            e('div', { style: { marginBottom: '16px' } },
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Motivaatiot'),
              !isViewMode && e('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } },
                e('input', {
                  type: 'text',
                  value: currentMotivation,
                  onChange: (ev) => setCurrentMotivation(ev.target.value),
                  onKeyPress: (ev) => {
                    if (ev.key === 'Enter') {
                      ev.preventDefault();
                      addMotivation();
                    }
                  },
                  placeholder: 'Esim. Suojella perhettä, Etsiä totuutta...',
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
                  onClick: addMotivation,
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
                  gap: '4px'
                }
              },
                formData.motivations.map(motivation =>
                  e('div', {
                    key: motivation,
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
                    e('span', null, motivation),
                    !isViewMode && e('button', {
                      type: 'button',
                      onClick: () => removeMotivation(motivation),
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
                )
              )
            ),

            // Fears
            e('div', null,
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Pelot'),
              !isViewMode && e('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } },
                e('input', {
                  type: 'text',
                  value: currentFear,
                  onChange: (ev) => setCurrentFear(ev.target.value),
                  onKeyPress: (ev) => {
                    if (ev.key === 'Enter') {
                      ev.preventDefault();
                      addFear();
                    }
                  },
                  placeholder: 'Esim. Epäonnistua, Menettää kontrolli...',
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
                  onClick: addFear,
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
                  gap: '4px'
                }
              },
                formData.fears.map(fear =>
                  e('div', {
                    key: fear,
                    style: {
                      padding: '8px 12px',
                      background: 'rgba(255, 68, 68, 0.1)',
                      border: '1px solid rgba(255, 68, 68, 0.3)',
                      borderRadius: '4px',
                      fontFamily: 'IBM Plex Mono',
                      fontSize: '13px',
                      color: 'var(--text)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }
                  },
                    e('span', null, fear),
                    !isViewMode && e('button', {
                      type: 'button',
                      onClick: () => removeFear(fear),
                      style: {
                        background: 'transparent',
                        border: 'none',
                        color: '#ff4444',
                        cursor: 'pointer',
                        fontSize: '16px',
                        padding: 0
                      }
                    }, '×')
                  )
                )
              )
            )
          ),

          // Character Arc Section
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
            }, '📈 Tarinan Kaari'),

            // Beginning
            e('div', { style: { marginBottom: '16px' } },
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Aloitus'),
              e('textarea', {
                value: formData.arc.beginning,
                onChange: (ev) => setFormData({
                  ...formData,
                  arc: { ...formData.arc, beginning: ev.target.value }
                }),
                disabled: isViewMode,
                placeholder: 'Miten hahmo aloittaa tarinassa?',
                rows: 3,
                style: {
                  width: '100%',
                  padding: '10px',
                  background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              })
            ),

            // Development
            e('div', { style: { marginBottom: '16px' } },
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Kehitys'),
              e('textarea', {
                value: formData.arc.development,
                onChange: (ev) => setFormData({
                  ...formData,
                  arc: { ...formData.arc, development: ev.target.value }
                }),
                disabled: isViewMode,
                placeholder: 'Miten hahmo muuttuu tarinan aikana?',
                rows: 3,
                style: {
                  width: '100%',
                  padding: '10px',
                  background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              })
            ),

            // End
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
                value: formData.arc.end,
                onChange: (ev) => setFormData({
                  ...formData,
                  arc: { ...formData.arc, end: ev.target.value }
                }),
                disabled: isViewMode,
                placeholder: 'Mihin hahmo päätyy?',
                rows: 3,
                style: {
                  width: '100%',
                  padding: '10px',
                  background: isViewMode ? 'var(--bg-1)' : 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'EB Garamond',
                  fontSize: '14px',
                  resize: 'vertical'
                }
              })
            )
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
            }, isSaving ? 'Tallennetaan...' : 'Tallenna')
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
  window.CharacterSheetModal = CharacterSheetModal;

})(window);

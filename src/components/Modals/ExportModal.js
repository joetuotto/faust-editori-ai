/**
 * ExportModal - Interactive Export Dialog with Progress Tracking
 * SESSION 2 - Export modal implementation
 *
 * Script-tag compatible version for app.js integration
 */

(function(window) {
  'use strict';

  const { createElement: e, useState } = React;

  function ExportModal({
    isOpen,
    onClose,
    project,
    activeChapter,
    onExport,
    exportPresets = [],
    onSavePreset,
    onDeletePreset
  }) {
    if (!isOpen) return null;

    // Export options state
    const [exportScope, setExportScope] = useState('full'); // 'current', 'full', 'selection'
    const [exportFormat, setExportFormat] = useState('docx'); // 'txt', 'docx', 'pdf', 'epub', 'mobi'
    const [selectedChapters, setSelectedChapters] = useState([]);
    const [includeMetadata, setIncludeMetadata] = useState(true);
    const [includeSynopsis, setIncludeSynopsis] = useState(true);
    const [includeTableOfContents, setIncludeTableOfContents] = useState(true);
    const [chapterLimit, setChapterLimit] = useState(0); // 0 = no limit

    // Apply preset
    const applyPreset = (preset) => {
      setExportFormat(preset.format || 'docx');
      setIncludeMetadata(preset.includeMetadata !== false);
      setIncludeSynopsis(preset.includeSynopsis || false);
      setIncludeTableOfContents(preset.includeToc !== false);
      setChapterLimit(preset.chapterLimit || 0);
      if (preset.chapterLimit > 0) {
        setExportScope('selection');
        // Select first N chapters
        const firstNChapters = project.structure.slice(0, preset.chapterLimit).map(ch => ch.id);
        setSelectedChapters(firstNChapters);
      } else {
        setExportScope('full');
      }
    };

    // Save current settings as preset
    const saveAsPreset = () => {
      const name = prompt('Presetin nimi:');
      if (name && onSavePreset) {
        onSavePreset({
          name,
          format: exportFormat,
          includeMetadata,
          includeSynopsis,
          includeToc: includeTableOfContents,
          chapterLimit: chapterLimit
        });
      }
    };

    // Metadata
    const [metadata, setMetadata] = useState({
      title: project?.title || '',
      author: project?.author || '',
      language: project?.language || 'fi',
      description: project?.synopsis || '',
      publisher: project?.author || 'Self-published'
    });

    // Export progress
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [exportStatus, setExportStatus] = useState('');
    const [exportError, setExportError] = useState('');

    // Toggle chapter selection
    const toggleChapter = (chapterId) => {
      setSelectedChapters(prev =>
        prev.includes(chapterId)
          ? prev.filter(id => id !== chapterId)
          : [...prev, chapterId]
      );
    };

    // Handle export
    const handleExport = async () => {
      setIsExporting(true);
      setExportProgress(0);
      setExportStatus('Valmistellaan vientiä...');
      setExportError('');

      try {
        // Prepare export data based on scope
        let chaptersToExport = [];

        if (exportScope === 'current') {
          if (!activeChapter) {
            throw new Error('Ei aktiivista lukua');
          }
          chaptersToExport = [activeChapter];
        } else if (exportScope === 'full') {
          chaptersToExport = project.structure.filter(ch => ch.content && ch.content.trim());
        } else if (exportScope === 'selection') {
          chaptersToExport = project.structure.filter(ch =>
            selectedChapters.includes(ch.id) && ch.content && ch.content.trim()
          );
        }

        if (chaptersToExport.length === 0) {
          throw new Error('Ei vietäviä lukuja');
        }

        setExportProgress(20);
        setExportStatus(`Viedään ${chaptersToExport.length} lukua...`);

        // Prepare export payload
        const exportData = {
          format: exportFormat,
          scope: exportScope,
          chapters: chaptersToExport.map((ch, idx) => ({
            id: `chapter-${idx + 1}`,
            title: ch.title,
            content: ch.content
          })),
          metadata: includeMetadata ? metadata : null,
          options: {
            includeSynopsis: includeSynopsis,
            includeTableOfContents: includeTableOfContents
          }
        };

        setExportProgress(40);

        // Call export handler
        const result = await onExport(exportData);

        setExportProgress(100);
        setExportStatus('Vienti valmis!');

        // Close modal after success
        setTimeout(() => {
          onClose();
        }, 1500);

      } catch (error) {
        console.error('[ExportModal] Export failed:', error);
        setExportError(error.message || 'Vienti epäonnistui');
        setExportProgress(0);
      } finally {
        setTimeout(() => {
          setIsExporting(false);
        }, 2000);
      }
    };

    const canExport = exportScope === 'current'
      ? activeChapter && activeChapter.content
      : exportScope === 'selection'
        ? selectedChapters.length > 0
        : project.structure.some(ch => ch.content && ch.content.trim());

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
        if (ev.target.className === 'modal-overlay' && !isExporting) {
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
          maxWidth: '700px',
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
          }, '📤 Vie Projekti'),

          // Close button
          !isExporting && e('button', {
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

        // Export presets (quick actions)
        exportPresets && exportPresets.length > 0 && e('div', {
          style: {
            marginBottom: '24px',
            padding: '16px',
            background: 'rgba(143,122,83,0.1)',
            border: '1px solid var(--bronze)',
            borderRadius: '6px'
          }
        },
          e('div', {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px'
            }
          },
            e('h3', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--bronze)',
                textTransform: 'uppercase',
                margin: 0
              }
            }, '⚡ Pikavienti'),
            onSavePreset && e('button', {
              onClick: saveAsPreset,
              disabled: isExporting,
              style: {
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-2)',
                cursor: isExporting ? 'not-allowed' : 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '10px',
                padding: '4px 8px'
              }
            }, '+ Tallenna preset')
          ),
          e('div', {
            style: {
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px'
            }
          },
            exportPresets.map(preset =>
              e('div', {
                key: preset.id,
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }
              },
                e('button', {
                  onClick: () => applyPreset(preset),
                  disabled: isExporting,
                  style: {
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text)',
                    cursor: isExporting ? 'not-allowed' : 'pointer',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '11px',
                    padding: '6px 12px',
                    transition: 'all 0.2s'
                  },
                  onMouseEnter: (ev) => {
                    if (!isExporting) {
                      ev.target.style.background = 'var(--bronze)';
                      ev.target.style.color = '#000';
                    }
                  },
                  onMouseLeave: (ev) => {
                    ev.target.style.background = 'var(--bg-secondary)';
                    ev.target.style.color = 'var(--text)';
                  }
                }, preset.name),
                // Delete custom presets (not default ones)
                onDeletePreset && !preset.id.startsWith('preset-kindle') &&
                !preset.id.startsWith('preset-epub') &&
                !preset.id.startsWith('preset-pdf') &&
                !preset.id.startsWith('preset-sample') &&
                e('button', {
                  onClick: () => {
                    if (confirm(`Poista preset "${preset.name}"?`)) {
                      onDeletePreset(preset.id);
                    }
                  },
                  style: {
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--error)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '2px'
                  }
                }, '×')
              )
            )
          )
        ),

        // Export scope
        e('div', {
          style: {
            marginBottom: '24px',
            padding: '20px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px'
          }
        },
          e('h3', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              marginBottom: '12px'
            }
          }, '📋 Mitä viedään?'),

          // Radio: Current chapter
          e('label', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text)'
            }
          },
            e('input', {
              type: 'radio',
              name: 'exportScope',
              value: 'current',
              checked: exportScope === 'current',
              onChange: (ev) => setExportScope(ev.target.value),
              disabled: isExporting
            }),
            'Nykyinen luku',
            activeChapter && e('span', {
              style: {
                color: 'var(--text-3)',
                fontSize: '11px',
                marginLeft: '4px'
              }
            }, `(${activeChapter.title})`)
          ),

          // Radio: Full project
          e('label', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text)'
            }
          },
            e('input', {
              type: 'radio',
              name: 'exportScope',
              value: 'full',
              checked: exportScope === 'full',
              onChange: (ev) => setExportScope(ev.target.value),
              disabled: isExporting
            }),
            'Koko projekti',
            e('span', {
              style: {
                color: 'var(--text-3)',
                fontSize: '11px',
                marginLeft: '4px'
              }
            }, `(${project.structure?.length || 0} lukua)`)
          ),

          // Radio: Selected chapters
          e('label', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text)'
            }
          },
            e('input', {
              type: 'radio',
              name: 'exportScope',
              value: 'selection',
              checked: exportScope === 'selection',
              onChange: (ev) => setExportScope(ev.target.value),
              disabled: isExporting
            }),
            'Valitut luvut',
            exportScope === 'selection' && e('span', {
              style: {
                color: 'var(--text-3)',
                fontSize: '11px',
                marginLeft: '4px'
              }
            }, `(${selectedChapters.length} valittu)`)
          ),

          // Chapter selection
          exportScope === 'selection' && e('div', {
            style: {
              marginTop: '12px',
              marginLeft: '24px',
              maxHeight: '200px',
              overflow: 'auto',
              padding: '8px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px'
            }
          },
            project.structure.map((ch, idx) =>
              e('label', {
                key: ch.id,
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px',
                  cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  color: 'var(--text-2)'
                }
              },
                e('input', {
                  type: 'checkbox',
                  checked: selectedChapters.includes(ch.id),
                  onChange: () => toggleChapter(ch.id),
                  disabled: isExporting || !ch.content || !ch.content.trim()
                }),
                `${idx + 1}. ${ch.title || 'Nimetön luku'}`,
                (!ch.content || !ch.content.trim()) && e('span', {
                  style: {
                    fontSize: '10px',
                    color: 'var(--text-3)',
                    marginLeft: '4px'
                  }
                }, '(tyhjä)')
              )
            )
          )
        ),

        // Format selection
        e('div', {
          style: {
            marginBottom: '24px',
            padding: '20px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px'
          }
        },
          e('h3', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              marginBottom: '12px'
            }
          }, '📄 Tiedostomuoto'),

          e('select', {
            value: exportFormat,
            onChange: (ev) => setExportFormat(ev.target.value),
            disabled: isExporting,
            style: {
              width: '100%',
              padding: '10px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px'
            }
          },
            e('option', { value: 'txt' }, 'Tekstitiedosto (.txt)'),
            e('option', { value: 'docx' }, 'Word-dokumentti (.docx)'),
            e('option', { value: 'pdf' }, 'PDF-tiedosto (.pdf)'),
            e('option', { value: 'epub' }, 'EPUB eKirja (.epub)'),
            e('option', { value: 'mobi' }, 'Kindle eKirja (.mobi)')
          )
        ),

        // Export options
        e('div', {
          style: {
            marginBottom: '24px',
            padding: '20px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px'
          }
        },
          e('h3', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              marginBottom: '12px'
            }
          }, '⚙️ Asetukset'),

          e('label', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text)'
            }
          },
            e('input', {
              type: 'checkbox',
              checked: includeMetadata,
              onChange: (ev) => setIncludeMetadata(ev.target.checked),
              disabled: isExporting
            }),
            'Sisällytä metatiedot (kirjailija, kieli, jne.)'
          ),

          e('label', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text)'
            }
          },
            e('input', {
              type: 'checkbox',
              checked: includeSynopsis,
              onChange: (ev) => setIncludeSynopsis(ev.target.checked),
              disabled: isExporting
            }),
            'Sisällytä synopsis'
          ),

          e('label', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text)'
            }
          },
            e('input', {
              type: 'checkbox',
              checked: includeTableOfContents,
              onChange: (ev) => setIncludeTableOfContents(ev.target.checked),
              disabled: isExporting
            }),
            'Sisällytä sisällysluettelo'
          )
        ),

        // Metadata (if enabled)
        includeMetadata && e('div', {
          style: {
            marginBottom: '24px',
            padding: '20px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px'
          }
        },
          e('h3', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px',
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              marginBottom: '12px'
            }
          }, '✍️ Metatiedot'),

          e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
            // Author
            e('div', null,
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Kirjailija'),
              e('input', {
                type: 'text',
                value: metadata.author,
                onChange: (ev) => setMetadata({ ...metadata, author: ev.target.value }),
                disabled: isExporting,
                style: {
                  width: '100%',
                  padding: '8px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '13px'
                }
              })
            ),

            // Language
            e('div', null,
              e('label', {
                style: {
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: 'var(--text-2)',
                  marginBottom: '6px'
                }
              }, 'Kieli'),
              e('select', {
                value: metadata.language,
                onChange: (ev) => setMetadata({ ...metadata, language: ev.target.value }),
                disabled: isExporting,
                style: {
                  width: '100%',
                  padding: '8px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '13px'
                }
              },
                e('option', { value: 'fi' }, 'Suomi'),
                e('option', { value: 'en' }, 'English'),
                e('option', { value: 'sv' }, 'Svenska')
              )
            )
          )
        ),

        // Progress indicator
        isExporting && e('div', {
          style: {
            marginBottom: '24px',
            padding: '20px',
            background: 'rgba(199, 179, 134, 0.1)',
            border: '1px solid var(--bronze)',
            borderRadius: '6px'
          }
        },
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text)',
              marginBottom: '12px',
              textAlign: 'center'
            }
          }, exportStatus),

          // Progress bar
          e('div', {
            style: {
              width: '100%',
              height: '24px',
              background: 'var(--bg-2)',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid var(--border-color)'
            }
          },
            e('div', {
              style: {
                width: `${exportProgress}%`,
                height: '100%',
                background: 'var(--bronze)',
                transition: 'width 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }
            },
              e('span', {
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '11px',
                  color: '#000',
                  fontWeight: 600
                }
              }, `${exportProgress}%`)
            )
          )
        ),

        // Error message
        exportError && e('div', {
          style: {
            marginBottom: '24px',
            padding: '12px',
            background: 'rgba(255, 68, 68, 0.1)',
            border: '1px solid rgba(255, 68, 68, 0.3)',
            borderRadius: '4px',
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: '#ff4444'
          }
        }, exportError),

        // Actions
        e('div', {
          style: {
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-color)'
          }
        },
          !isExporting && e('button', {
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
            onClick: handleExport,
            disabled: !canExport || isExporting,
            style: {
              padding: '12px 24px',
              background: (!canExport || isExporting) ? 'var(--bg-2)' : 'var(--bronze)',
              border: 'none',
              borderRadius: '4px',
              color: (!canExport || isExporting) ? 'var(--text-3)' : '#000',
              cursor: (!canExport || isExporting) ? 'not-allowed' : 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              fontWeight: 600
            }
          }, isExporting ? 'Viedään...' : 'Vie')
        )
      )
    );
  }

  // Export to window
  window.ExportModal = ExportModal;

})(window);

/**
 * FindReplaceDialog Component
 * Search and replace functionality for the editor
 */

import React from 'react';

interface FindReplaceDialogProps {
  isOpen: boolean;
  showReplace: boolean;
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  matchWholeWord: boolean;
  useRegex: boolean;
  searchInAllChapters: boolean;
  searchHistory: string[];
  searchResults: any[];
  currentSearchIndex: number;
  onSearchTermChange: (value: string) => void;
  onReplaceTermChange: (value: string) => void;
  onCaseSensitiveChange: (value: boolean) => void;
  onMatchWholeWordChange: (value: boolean) => void;
  onUseRegexChange: (value: boolean) => void;
  onSearchInAllChaptersChange: (value: boolean) => void;
  onClose: () => void;
  onSearch: (term?: string) => void;
  onFindNext: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
}

export const FindReplaceDialog: React.FC<FindReplaceDialogProps> = ({
  isOpen,
  showReplace,
  searchTerm,
  replaceTerm,
  caseSensitive,
  matchWholeWord,
  useRegex,
  searchInAllChapters,
  searchHistory,
  searchResults,
  currentSearchIndex,
  onSearchTermChange,
  onReplaceTermChange,
  onCaseSensitiveChange,
  onMatchWholeWordChange,
  onUseRegexChange,
  onSearchInAllChaptersChange,
  onClose,
  onSearch,
  onFindNext,
  onReplaceCurrent,
  onReplaceAll
}) => {
  if (!isOpen) return null;

  return React.createElement('div', {
    style: {
      position: 'absolute',
      top: '16px',
      right: '16px',
      background: 'var(--bg-1)',
      border: '2px solid var(--border-color)',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      minWidth: '320px',
      zIndex: 300
    }
  },
    // Header
    React.createElement('div', {
      style: {
        marginBottom: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }
    },
      React.createElement('h3', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '14px',
          margin: 0
        }
      }, showReplace ? 'Etsi ja korvaa' : 'Etsi'),
      React.createElement('button', {
        onClick: onClose,
        style: {
          background: 'transparent',
          border: 'none',
          color: 'var(--text-2)',
          cursor: 'pointer',
          fontSize: '18px'
        }
      }, '×')
    ),

    // Search input
    React.createElement('input', {
      type: 'text',
      value: searchTerm,
      onChange: (ev) => onSearchTermChange(ev.target.value),
      onKeyDown: (ev) => {
        if (ev.key === 'Enter') onSearch();
        if (ev.key === 'Escape') onClose();
      },
      placeholder: 'Hae...',
      autoFocus: true,
      style: {
        width: '100%',
        padding: '8px',
        background: 'var(--bg-2)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        color: 'var(--text)',
        fontFamily: 'IBM Plex Mono',
        fontSize: '13px',
        marginBottom: '8px'
      }
    }),

    // Replace input (conditional)
    showReplace ? React.createElement('input', {
      type: 'text',
      value: replaceTerm,
      onChange: (ev) => onReplaceTermChange(ev.target.value),
      placeholder: 'Korvaa...',
      style: {
        width: '100%',
        padding: '8px',
        background: 'var(--bg-2)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        color: 'var(--text)',
        fontFamily: 'IBM Plex Mono',
        fontSize: '13px',
        marginBottom: '8px'
      }
    }) : null,

    // Options
    React.createElement('div', {
      style: {
        display: 'flex',
        gap: '8px',
        marginBottom: '4px',
        flexWrap: 'wrap'
      }
    },
      React.createElement('label', {
        style: {
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }
      },
        React.createElement('input', {
          type: 'checkbox',
          checked: caseSensitive,
          onChange: (ev) => onCaseSensitiveChange(ev.target.checked)
        }),
        'Aa (case)'
      ),
      React.createElement('label', {
        style: {
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }
      },
        React.createElement('input', {
          type: 'checkbox',
          checked: matchWholeWord,
          onChange: (ev) => onMatchWholeWordChange(ev.target.checked)
        }),
        'Koko sana'
      ),
      React.createElement('label', {
        style: {
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }
      },
        React.createElement('input', {
          type: 'checkbox',
          checked: useRegex,
          onChange: (ev) => onUseRegexChange(ev.target.checked)
        }),
        'Regex'
      ),
      React.createElement('label', {
        style: {
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }
      },
        React.createElement('input', {
          type: 'checkbox',
          checked: searchInAllChapters,
          onChange: (ev) => onSearchInAllChaptersChange(ev.target.checked)
        }),
        'Kaikki luvut'
      )
    ),

    // Search history
    searchHistory.length > 0 ? React.createElement('details', {
      style: { marginBottom: '8px' }
    },
      React.createElement('summary', {
        style: {
          fontSize: '11px',
          color: 'var(--text-3)',
          cursor: 'pointer',
          userSelect: 'none',
          fontFamily: 'IBM Plex Mono'
        }
      }, `Historia (${searchHistory.length})`),
      React.createElement('div', {
        style: {
          marginTop: '4px',
          maxHeight: '150px',
          overflowY: 'auto'
        }
      },
        ...searchHistory.map((term, idx) =>
          React.createElement('div', {
            key: idx,
            onClick: () => {
              onSearchTermChange(term);
              onSearch(term);
            },
            style: {
              padding: '4px 8px',
              fontSize: '12px',
              fontFamily: 'IBM Plex Mono',
              color: 'var(--text-2)',
              cursor: 'pointer',
              borderRadius: '3px',
              background: 'var(--bg-2)',
              marginBottom: '2px'
            },
            onMouseEnter: (ev) => (ev.target as HTMLElement).style.background = 'var(--bg-3)',
            onMouseLeave: (ev) => (ev.target as HTMLElement).style.background = 'var(--bg-2)'
          }, term.length > 40 ? term.substring(0, 40) + '...' : term)
        )
      )
    ) : null,

    // Results counter
    searchResults.length > 0 ? React.createElement('div', {
      style: {
        fontSize: '11px',
        color: 'var(--text-2)',
        marginBottom: '8px'
      }
    }, `${currentSearchIndex + 1} / ${searchResults.length}`) : null,

    // Action buttons
    React.createElement('div', {
      style: {
        display: 'flex',
        gap: '4px',
        flexWrap: 'wrap'
      }
    },
      React.createElement('button', {
        onClick: () => onSearch(),
        style: {
          padding: '6px 12px',
          background: 'var(--bronze)',
          border: 'none',
          borderRadius: '4px',
          color: '#000',
          cursor: 'pointer',
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px'
        }
      }, 'Etsi'),
      React.createElement('button', {
        onClick: onFindNext,
        disabled: searchResults.length === 0,
        style: {
          padding: '6px 12px',
          background: searchResults.length === 0 ? 'var(--bg-2)' : 'transparent',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          color: 'var(--text)',
          cursor: searchResults.length === 0 ? 'not-allowed' : 'pointer',
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px'
        }
      }, 'Seuraava'),
      showReplace ? React.createElement('button', {
        onClick: onReplaceCurrent,
        disabled: currentSearchIndex < 0,
        style: {
          padding: '6px 12px',
          background: currentSearchIndex < 0 ? 'var(--bg-2)' : 'transparent',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          color: 'var(--text)',
          cursor: currentSearchIndex < 0 ? 'not-allowed' : 'pointer',
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px'
        }
      }, 'Korvaa') : null,
      showReplace ? React.createElement('button', {
        onClick: onReplaceAll,
        disabled: searchResults.length === 0,
        style: {
          padding: '6px 12px',
          background: searchResults.length === 0 ? 'var(--bg-2)' : 'transparent',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          color: 'var(--text)',
          cursor: searchResults.length === 0 ? 'not-allowed' : 'pointer',
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px'
        }
      }, 'Korvaa kaikki') : null
    )
  );
};

export default FindReplaceDialog;

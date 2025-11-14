/**
 * CharacterSheet Modal
 * View and manage story characters with list/view modes
 */

import React from 'react';
import Modal from './Modal';
import type { Character, Project } from '../../types';

interface CharacterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[];
  mode: 'list' | 'view';
  selectedCharacter: Character | null;
  onSelectCharacter: (character: Character) => void;
  onBackToList: () => void;
  onDeleteCharacter: (character: Character) => void;
  characterEngineLogo?: (size?: number) => React.ReactNode;
}

export const CharacterSheet: React.FC<CharacterSheetProps> = ({
  isOpen,
  onClose,
  characters,
  mode,
  selectedCharacter,
  onSelectCharacter,
  onBackToList,
  onDeleteCharacter,
  characterEngineLogo
}) => {
  const handleClose = () => {
    onClose();
    if (mode === 'view') {
      onBackToList();
    }
  };

  const handleDelete = () => {
    if (!selectedCharacter) return;

    const name = selectedCharacter.basicInfo?.name || selectedCharacter.name || 'this character';
    if (confirm(`Delete character "${name}"?`)) {
      onDeleteCharacter(selectedCharacter);
      onBackToList();
    }
  };

  return React.createElement(Modal, {
    isOpen,
    onClose: handleClose,
    title: mode === 'list'
      ? React.createElement('span', null,
          characterEngineLogo ? characterEngineLogo(20) : '👥',
          ' Characters')
      : React.createElement('span', null,
          characterEngineLogo ? characterEngineLogo(20) : '👤',
          ` ${selectedCharacter?.basicInfo?.name || selectedCharacter?.name || 'Character'}`),
    maxWidth: '900px'
  },
    // Subtitle
    React.createElement('p', {
      style: {
        fontFamily: 'IBM Plex Mono',
        fontSize: '12px',
        color: 'var(--text-2)',
        marginBottom: '24px'
      }
    }, mode === 'list'
      ? `${characters.length} characters in your story`
      : 'View character profile'),

    // LIST MODE: Show all characters
    mode === 'list' && React.createElement('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px'
      }
    },
      characters.map((char, idx) => {
        const name = char.basicInfo?.name || char.name || `Character ${idx + 1}`;
        const role = char.basicInfo?.role || char.role || '';
        const archetype = char.archetype?.primaryArchetype || '';

        return React.createElement('div', {
          key: idx,
          onClick: () => onSelectCharacter(char),
          style: {
            padding: '16px',
            background: 'var(--bg-2)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }
        },
          React.createElement('h3', {
            style: {
              fontFamily: 'EB Garamond',
              fontSize: '18px',
              color: 'var(--text)',
              marginBottom: '6px'
            }
          }, name),

          role && React.createElement('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text-2)',
              marginBottom: '4px'
            }
          }, role),

          archetype && React.createElement('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '10px',
              color: 'var(--bronze)',
              marginTop: '8px'
            }
          }, `Archetype: ${archetype}`)
        );
      })
    ),

    // VIEW MODE: Show character details
    mode === 'view' && selectedCharacter && React.createElement('div', null,
      // Basic Info
      selectedCharacter.basicInfo && React.createElement('div', {
        style: {
          marginBottom: '24px',
          padding: '16px',
          background: 'var(--bg-2)',
          borderRadius: '6px',
          border: '1px solid var(--border-color)'
        }
      },
        React.createElement('h3', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: 'var(--text-3)',
            marginBottom: '12px'
          }
        }, 'BASIC INFO'),

        Object.entries(selectedCharacter.basicInfo).map(([key, value]) =>
          React.createElement('div', {
            key,
            style: {
              marginBottom: '8px',
              display: 'flex',
              gap: '8px'
            }
          },
            React.createElement('span', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '11px',
                color: 'var(--text-3)',
                minWidth: '120px'
              }
            }, key + ':'),
            React.createElement('span', {
              style: {
                fontFamily: 'IBM Plex Mono',
                fontSize: '12px',
                color: 'var(--text)'
              }
            }, String(value))
          )
        )
      ),

      // Psychological Layer
      selectedCharacter.psychological && React.createElement('div', {
        style: {
          marginBottom: '24px',
          padding: '16px',
          background: 'var(--bg-2)',
          borderRadius: '6px',
          border: '1px solid var(--border-color)'
        }
      },
        React.createElement('h3', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: 'var(--text-3)',
            marginBottom: '12px'
          }
        }, 'PSYCHOLOGICAL PROFILE'),

        React.createElement('div', {
          style: {
            fontFamily: 'EB Garamond',
            fontSize: '14px',
            lineHeight: '1.7',
            color: 'var(--text)',
            whiteSpace: 'pre-wrap'
          }
        }, typeof selectedCharacter.psychological === 'string'
          ? selectedCharacter.psychological
          : JSON.stringify(selectedCharacter.psychological, null, 2))
      ),

      // Transactional Layer
      selectedCharacter.transactional && React.createElement('div', {
        style: {
          marginBottom: '24px',
          padding: '16px',
          background: 'var(--bg-2)',
          borderRadius: '6px',
          border: '1px solid var(--border-color)'
        }
      },
        React.createElement('h3', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: 'var(--text-3)',
            marginBottom: '12px'
          }
        }, 'TRANSACTIONAL ANALYSIS'),

        React.createElement('div', {
          style: {
            fontFamily: 'EB Garamond',
            fontSize: '14px',
            lineHeight: '1.7',
            color: 'var(--text)',
            whiteSpace: 'pre-wrap'
          }
        }, typeof selectedCharacter.transactional === 'string'
          ? selectedCharacter.transactional
          : JSON.stringify(selectedCharacter.transactional, null, 2))
      ),

      // Archetypal Layer
      selectedCharacter.archetypal && React.createElement('div', {
        style: {
          marginBottom: '24px',
          padding: '16px',
          background: 'var(--bg-2)',
          borderRadius: '6px',
          border: '1px solid var(--border-color)'
        }
      },
        React.createElement('h3', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: 'var(--text-3)',
            marginBottom: '12px'
          }
        }, 'ARCHETYPAL LAYER'),

        React.createElement('div', {
          style: {
            fontFamily: 'EB Garamond',
            fontSize: '14px',
            lineHeight: '1.7',
            color: 'var(--text)',
            whiteSpace: 'pre-wrap'
          }
        }, typeof selectedCharacter.archetypal === 'string'
          ? selectedCharacter.archetypal
          : JSON.stringify(selectedCharacter.archetypal, null, 2))
      ),

      // Ensemble Dynamics
      selectedCharacter.ensemble && React.createElement('div', {
        style: {
          marginBottom: '24px',
          padding: '16px',
          background: 'var(--bg-2)',
          borderRadius: '6px',
          border: '1px solid var(--border-color)'
        }
      },
        React.createElement('h3', {
          style: {
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px',
            color: 'var(--text-3)',
            marginBottom: '12px'
          }
        }, 'ENSEMBLE DYNAMICS'),

        React.createElement('div', {
          style: {
            fontFamily: 'EB Garamond',
            fontSize: '14px',
            lineHeight: '1.7',
            color: 'var(--text)',
            whiteSpace: 'pre-wrap'
          }
        }, typeof selectedCharacter.ensemble === 'string'
          ? selectedCharacter.ensemble
          : JSON.stringify(selectedCharacter.ensemble, null, 2))
      ),

      // Action buttons
      React.createElement('div', {
        style: {
          marginTop: '24px',
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-start'
        }
      },
        React.createElement('button', {
          onClick: onBackToList,
          style: {
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            color: 'var(--text)',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px'
          }
        }, '← Back to List'),

        React.createElement('button', {
          onClick: handleDelete,
          style: {
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid #f44336',
            borderRadius: '4px',
            color: '#f44336',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono',
            fontSize: '12px'
          }
        }, '🗑️ Delete Character')
      )
    )
  );
};

export default CharacterSheet;

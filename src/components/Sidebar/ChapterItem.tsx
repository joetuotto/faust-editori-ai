/**
 * ChapterItem Component
 * Individual chapter in the sidebar list with controls
 */

import React from 'react';
import type { Chapter } from '../../types';

interface ChapterItemProps {
  chapter: Chapter;
  isActive: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDelete: boolean;
  onClick: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

export const ChapterItem: React.FC<ChapterItemProps> = ({
  chapter,
  isActive,
  canMoveUp,
  canMoveDown,
  canDelete,
  onClick,
  onMoveUp,
  onMoveDown,
  onDelete
}) => {
  return React.createElement('div', {
    key: chapter.id,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '8px 12px',
      borderRadius: '4px',
      background: isActive ? 'var(--bg-tertiary, rgba(143,122,83,0.1))' : 'transparent',
      borderLeft: isActive ? '2px solid var(--bronze)' : '2px solid transparent',
      transition: 'all 0.2s'
    }
  },
    // Chapter info (clickable)
    React.createElement('div', {
      onClick: onClick,
      style: {
        flex: 1,
        cursor: 'pointer',
        fontFamily: 'IBM Plex Mono',
        fontSize: '13px',
        color: isActive ? 'var(--text)' : 'var(--text-2)'
      }
    },
      React.createElement('div', { style: { marginBottom: '4px' } }, chapter.title),
      React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-3)' } },
        `${chapter.wordCount} sanaa`)
    ),

    // Chapter controls (only show for active chapter)
    isActive ? React.createElement('div', { style: { display: 'flex', gap: '2px' } },
      // Move up
      canMoveUp ? React.createElement('button', {
        onClick: onMoveUp,
        title: 'Siirrä ylös',
        style: {
          background: 'transparent',
          border: 'none',
          color: 'var(--text-3)',
          cursor: 'pointer',
          padding: '2px 4px',
          fontSize: '14px'
        }
      }, '↑') : null,

      // Move down
      canMoveDown ? React.createElement('button', {
        onClick: onMoveDown,
        title: 'Siirrä alas',
        style: {
          background: 'transparent',
          border: 'none',
          color: 'var(--text-3)',
          cursor: 'pointer',
          padding: '2px 4px',
          fontSize: '14px'
        }
      }, '↓') : null,

      // Delete
      canDelete ? React.createElement('button', {
        onClick: onDelete,
        title: 'Poista luku',
        style: {
          background: 'transparent',
          border: 'none',
          color: 'var(--error)',
          cursor: 'pointer',
          padding: '2px 4px',
          fontSize: '14px',
          transition: 'all 0.2s'
        }
      }, '×') : null
    ) : null
  );
};

export default ChapterItem;

/**
 * EditorStatusBar Component
 * Displays chapter metadata: word count, AI quality, status, and pacing
 */

import React from 'react';
import type { Chapter } from '../../types';

interface EditorStatusBarProps {
  chapter: Chapter;
}

export const EditorStatusBar: React.FC<EditorStatusBarProps> = ({ chapter }) => {
  return React.createElement('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      marginBottom: '8px'
    }
  },
    // Word count
    React.createElement('div', {
      style: {
        fontFamily: 'IBM Plex Mono',
        fontSize: '13px',
        color: 'var(--text-3)'
      }
    }, `${chapter.wordCount} sanaa`),

    // AI Quality score
    chapter.aiQuality && chapter.aiQuality.score > 0 ? React.createElement('div', {
      style: {
        fontFamily: 'IBM Plex Mono',
        fontSize: '12px',
        color: chapter.aiQuality.score >= 8 ? '#4CAF50' :
               chapter.aiQuality.score >= 6 ? '#FFA726' : '#EF5350',
        padding: '2px 8px',
        borderRadius: '4px',
        background: 'var(--bg-2)',
        border: '1px solid currentColor'
      }
    }, `AI: ${chapter.aiQuality.score.toFixed(1)}/10`) : null,

    // Status badge
    React.createElement('div', {
      style: {
        fontFamily: 'IBM Plex Mono',
        fontSize: '11px',
        color: 'var(--text-3)',
        padding: '2px 8px',
        borderRadius: '4px',
        background: 'var(--bg-2)',
        textTransform: 'uppercase'
      }
    }, chapter.status || 'draft'),

    // Pacing indicator
    chapter.pacing && chapter.pacing.speed ? React.createElement('div', {
      style: {
        fontFamily: 'IBM Plex Mono',
        fontSize: '11px',
        color: 'var(--text-3)'
      }
    }, `Tempo: ${chapter.pacing.speed}`) : null
  );
};

export default EditorStatusBar;

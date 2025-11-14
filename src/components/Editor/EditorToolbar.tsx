/**
 * EditorToolbar Component
 * Floating AI toolbar with analysis and generation buttons
 */

import React from 'react';
import type { Chapter } from '../../types';

interface EditorToolbarProps {
  chapter: Chapter;
  isGenerating: boolean;
  onAnalyze: () => Promise<void>;
  onQuickCheck: () => Promise<void>;
  onGenerateSynopsis: () => Promise<void>;
  onGenerateChapter: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  chapter,
  isGenerating,
  onAnalyze,
  onQuickCheck,
  onGenerateSynopsis,
  onGenerateChapter
}) => {
  const hasMinimumContent = chapter.content && chapter.content.length >= 50;

  return React.createElement('div', {
    style: {
      position: 'absolute',
      top: isGenerating ? '104px' : '80px', // Below title area and loading indicator
      right: '20px',
      display: 'flex',
      gap: '6px',
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      padding: '8px',
      zIndex: 100,
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
      animation: 'fadeIn 0.3s ease'
    }
  },
    // Analyze button
    React.createElement('button', {
      onClick: async () => {
        console.log('[UI] Analysoi clicked');
        const result = await onAnalyze();
        if (result) {
          alert('Analyysi valmis! Tarkista luvun AI Quality -arvosana.');
        } else {
          alert('Analyysi epäonnistui. Tarkista että:\n1. Claude API-avain on asetettu\n2. Luvussa on tekstiä (vähintään 50 merkkiä)');
        }
      },
      disabled: !hasMinimumContent,
      title: 'Analysoi luvun laatu ja sisältö AI:lla',
      style: {
        padding: '8px 12px',
        background: 'var(--bg-2)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        color: !hasMinimumContent ? 'var(--text-3)' : 'var(--text)',
        cursor: !hasMinimumContent ? 'not-allowed' : 'pointer',
        fontFamily: 'IBM Plex Mono',
        fontSize: '13px',
        opacity: !hasMinimumContent ? 0.5 : 1,
        minWidth: '36px'
      }
    }, '🤖'),

    // Quick quality check
    React.createElement('button', {
      onClick: async () => {
        console.log('[UI] Pika-arvio clicked');
        const result = await onQuickCheck();
        if (result && result.score) {
          alert(`Pika-arvio valmis!\n\nPisteet: ${result.score}/10\n\nEhdotukset:\n${result.suggestions?.join('\n') || 'Ei ehdotuksia'}`);
        } else {
          alert('Pika-arvio epäonnistui. Tarkista että:\n1. Claude API-avain on asetettu\n2. Luvussa on tekstiä');
        }
      },
      disabled: !hasMinimumContent,
      title: 'Pikainen laatutarkistus AI:lla',
      style: {
        padding: '8px 12px',
        background: 'var(--bg-2)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        color: !hasMinimumContent ? 'var(--text-3)' : 'var(--text)',
        cursor: !hasMinimumContent ? 'not-allowed' : 'pointer',
        fontFamily: 'IBM Plex Mono',
        fontSize: '13px',
        opacity: !hasMinimumContent ? 0.5 : 1,
        minWidth: '36px'
      }
    }, '⚡'),

    // Generate synopsis
    React.createElement('button', {
      onClick: async () => {
        console.log('[UI] Synopsis clicked');
        const result = await onGenerateSynopsis();
        if (result) {
          alert(`Synopsis luotu:\n\n${result}`);
        } else {
          alert('Synopsis-luonti epäonnistui. Tarkista että:\n1. Claude API-avain on asetettu\n2. Luvussa on tekstiä');
        }
      },
      disabled: !hasMinimumContent,
      title: 'Luo tiivistelmä luvusta AI:lla',
      style: {
        padding: '8px 12px',
        background: 'var(--bg-2)',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        color: !hasMinimumContent ? 'var(--text-3)' : 'var(--text)',
        cursor: !hasMinimumContent ? 'not-allowed' : 'pointer',
        fontFamily: 'IBM Plex Mono',
        fontSize: '13px',
        opacity: !hasMinimumContent ? 0.5 : 1,
        minWidth: '36px'
      }
    }, '📝'),

    // Generate chapter
    React.createElement('button', {
      onClick: onGenerateChapter,
      disabled: isGenerating,
      title: isGenerating ? 'Generoidaan...' : 'Generoi luku AI:lla',
      style: {
        padding: '8px 12px',
        background: isGenerating ? 'var(--bg-2)' : 'var(--bronze)',
        border: '1px solid var(--bronze)',
        borderRadius: '6px',
        color: isGenerating ? 'var(--text-3)' : '#000',
        cursor: isGenerating ? 'not-allowed' : 'pointer',
        fontFamily: 'IBM Plex Mono',
        fontSize: '13px',
        fontWeight: 600,
        opacity: isGenerating ? 0.5 : 1,
        minWidth: '36px'
      }
    }, isGenerating ? '⏳' : '✨')
  );
};

export default EditorToolbar;

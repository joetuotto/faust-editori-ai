/**
 * Inspector Chapter Tab
 * Chapter metadata editor in the Inspector panel
 */

import React from 'react';
import type { Chapter, Character, Project } from '../../types';

interface InspectorChapterTabProps {
  chapter: Chapter;
  project: Project;
  onUpdateChapter: (updater: (prev: Project) => Project) => void;
  onSetUnsavedChanges: (value: boolean) => void;
  onShowChapterSheet: () => void;
}

export const InspectorChapterTab: React.FC<InspectorChapterTabProps> = ({
  chapter,
  project,
  onUpdateChapter,
  onSetUnsavedChanges,
  onShowChapterSheet
}) => {
  const e = React.createElement;

  if (!chapter) return null;

  return e('div', {
    style: {
      marginBottom: '24px',
      paddingBottom: '20px',
      borderBottom: '1px solid var(--border-color)'
    }
  },
    e('div', {
      style: {
        fontFamily: 'IBM Plex Mono',
        fontSize: '11px',
        color: 'var(--text-3)',
        marginBottom: '12px',
        textTransform: 'uppercase'
      }
    }, 'Chapter Metadata'),

    // Status
    e('div', { style: { marginBottom: '16px' } },
      e('label', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-3)',
          display: 'block',
          marginBottom: '4px'
        }
      }, 'Status:'),
      e('select', {
        value: chapter.status || 'plan',
        onChange: (ev: React.ChangeEvent<HTMLSelectElement>) => {
          onUpdateChapter(prev => ({
            ...prev,
            structure: prev.structure.map(ch =>
              ch.id === chapter.id ? { ...ch, status: ev.target.value } : ch
            )
          }));
          onSetUnsavedChanges(true);
        },
        style: {
          width: '100%',
          padding: '6px 8px',
          background: 'var(--bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          color: 'var(--text)',
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px'
        }
      },
        e('option', { value: 'plan' }, '📋 Plan'),
        e('option', { value: 'draft' }, '✍️ Draft'),
        e('option', { value: 'revision' }, '🔄 Revision'),
        e('option', { value: 'final' }, '✅ Final')
      )
    ),

    // POV Character
    e('div', { style: { marginBottom: '16px' } },
      e('label', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-3)',
          display: 'block',
          marginBottom: '4px'
        }
      }, 'POV Character:'),
      e('select', {
        value: chapter.povCharacter || '',
        onChange: (ev: React.ChangeEvent<HTMLSelectElement>) => {
          onUpdateChapter(prev => ({
            ...prev,
            structure: prev.structure.map(ch =>
              ch.id === chapter.id ? { ...ch, povCharacter: ev.target.value || null } : ch
            )
          }));
          onSetUnsavedChanges(true);
        },
        style: {
          width: '100%',
          padding: '6px 8px',
          background: 'var(--bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          color: 'var(--text)',
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px'
        }
      },
        e('option', { value: '' }, '— None —'),
        project.characters.map((char: Character) =>
          e('option', {
            key: char.id || char.name,
            value: char.id || char.name
          }, char.basicInfo?.name || char.name || 'Unnamed')
        )
      )
    ),

    // Story Timestamp
    e('div', { style: { marginBottom: '16px' } },
      e('label', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-3)',
          display: 'block',
          marginBottom: '4px'
        }
      }, 'Story Time:'),
      e('input', {
        type: 'text',
        value: chapter.storyTimestamp || '',
        onChange: (ev: React.ChangeEvent<HTMLInputElement>) => {
          onUpdateChapter(prev => ({
            ...prev,
            structure: prev.structure.map(ch =>
              ch.id === chapter.id ? { ...ch, storyTimestamp: ev.target.value } : ch
            )
          }));
          onSetUnsavedChanges(true);
        },
        placeholder: 'e.g., Day 3, Morning',
        style: {
          width: '100%',
          padding: '6px 8px',
          background: 'var(--bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          color: 'var(--text)',
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px'
        }
      })
    ),

    // Mood/Tone
    e('div', { style: { marginBottom: '16px' } },
      e('label', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-3)',
          display: 'block',
          marginBottom: '4px'
        }
      }, 'Mood/Tone:'),
      e('input', {
        type: 'text',
        value: chapter.mood || '',
        onChange: (ev: React.ChangeEvent<HTMLInputElement>) => {
          onUpdateChapter(prev => ({
            ...prev,
            structure: prev.structure.map(ch =>
              ch.id === chapter.id ? { ...ch, mood: ev.target.value } : ch
            )
          }));
          onSetUnsavedChanges(true);
        },
        placeholder: 'e.g., Tense, Melancholic',
        style: {
          width: '100%',
          padding: '6px 8px',
          background: 'var(--bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          color: 'var(--text)',
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px'
        }
      })
    ),

    // Custom Notes
    e('div', { style: { marginBottom: '8px' } },
      e('label', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-3)',
          display: 'block',
          marginBottom: '4px'
        }
      }, 'Notes:'),
      e('textarea', {
        value: chapter.notes || '',
        onChange: (ev: React.ChangeEvent<HTMLTextAreaElement>) => {
          onUpdateChapter(prev => ({
            ...prev,
            structure: prev.structure.map(ch =>
              ch.id === chapter.id ? { ...ch, notes: ev.target.value } : ch
            )
          }));
          onSetUnsavedChanges(true);
        },
        placeholder: 'Chapter notes...',
        style: {
          width: '100%',
          minHeight: '60px',
          padding: '6px 8px',
          background: 'var(--bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          color: 'var(--text)',
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px',
          resize: 'vertical'
        }
      })
    ),

    // Open ChapterSheet button
    e('button', {
      onClick: onShowChapterSheet,
      style: {
        width: '100%',
        padding: '10px',
        marginTop: '16px',
        background: 'var(--bronze)',
        border: 'none',
        borderRadius: '4px',
        color: '#000',
        cursor: 'pointer',
        fontFamily: 'IBM Plex Mono',
        fontSize: '12px',
        fontWeight: 600
      }
    }, '📋 Open Chapter Sheet')
  );
};

export default InspectorChapterTab;

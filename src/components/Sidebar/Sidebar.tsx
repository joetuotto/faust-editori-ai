/**
 * Sidebar Component
 * Left sidebar with chapter list, project stats, and collapse functionality
 */

import React from 'react';
import ChapterList from './ChapterList';
import type { Project } from '../../types';

interface SidebarProps {
  project: Project;
  activeChapterId: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onChapterClick: (chapterId: string) => void;
  onAddChapter: () => void;
  onMoveChapterUp: (chapterId: string) => void;
  onMoveChapterDown: (chapterId: string) => void;
  onDeleteChapter: (chapterId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  project,
  activeChapterId,
  isCollapsed,
  onToggleCollapse,
  onChapterClick,
  onAddChapter,
  onMoveChapterUp,
  onMoveChapterDown,
  onDeleteChapter
}) => {
  return React.createElement('div', {
    className: isCollapsed ? 'faust-sidebar collapsed' : 'faust-sidebar'
  },
    // Collapse button (always visible)
    React.createElement('button', {
      onClick: onToggleCollapse,
      title: isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar',
      style: {
        position: 'absolute',
        top: '12px',
        right: isCollapsed ? '4px' : '8px',
        width: isCollapsed ? '32px' : '24px',
        height: '24px',
        background: 'var(--bg-2)',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        color: 'var(--text-2)',
        cursor: 'pointer',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s',
        zIndex: 10
      }
    }, isCollapsed ? '→' : '←'),

    // Sidebar content (hidden when collapsed)
    !isCollapsed && React.createElement('div', {
      style: { padding: '16px', color: 'var(--text)' }
    },
      // Project title
      React.createElement('h3', {
        style: {
          fontFamily: 'EB Garamond',
          fontSize: '16px',
          marginBottom: '12px'
        }
      }, project.title),

      // Project stats
      React.createElement('div', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-3)',
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-color)'
        }
      },
        React.createElement('div', null,
          `${project.targets.currentTotal} / ${project.targets.totalWords} sanaa`),
        React.createElement('div', null,
          `${project.structure.length} lukua`)
      ),

      // Chapter list
      React.createElement(ChapterList, {
        chapters: project.structure,
        activeChapterId: activeChapterId,
        onChapterClick: onChapterClick,
        onMoveChapterUp: onMoveChapterUp,
        onMoveChapterDown: onMoveChapterDown,
        onDeleteChapter: onDeleteChapter
      }),

      // Add chapter button
      React.createElement('button', {
        onClick: onAddChapter,
        style: {
          width: '100%',
          padding: '8px',
          background: 'transparent',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          color: 'var(--text-2)',
          cursor: 'pointer',
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px',
          transition: 'all 0.2s'
        }
      }, '+ Uusi luku')
    )
  );
};

export default Sidebar;

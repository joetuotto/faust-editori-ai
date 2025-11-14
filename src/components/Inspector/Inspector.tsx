/**
 * Inspector Component
 * Right panel with tabbed interface for editor, chapter, project, and AI settings
 */

import React from 'react';
import InspectorEditorTab from './InspectorEditorTab';
import InspectorProjectTab from './InspectorProjectTab';
import type { Project, Chapter } from '../../types';

export type InspectorTabType = 'editor' | 'chapter' | 'project' | 'ai';

interface InspectorProps {
  isVisible: boolean;
  isCollapsed: boolean;
  activeTab: InspectorTabType;
  project: Project;
  activeChapter: Chapter | null;
  // Editor tab props
  editorFont: string;
  textAlign: string;
  lineSpacing: string;
  editorZoom: string;
  paragraphSpacing: string;
  onToggleCollapse: () => void;
  onTabChange: (tab: InspectorTabType) => void;
  onFontChange: (font: string) => void;
  onAlignChange: (align: string) => void;
  onLineSpacingChange: (spacing: string) => void;
  onZoomChange: (zoom: string) => void;
  onParagraphSpacingChange: (spacing: string) => void;
  onLanguageChange: (language: string) => void;
  // Chapter tab - to be implemented
  onShowChapterSheet?: () => void;
  // AI tab - to be implemented
  children?: React.ReactNode; // For custom tab content (Chapter, AI)
}

export const Inspector: React.FC<InspectorProps> = ({
  isVisible,
  isCollapsed,
  activeTab,
  project,
  activeChapter,
  editorFont,
  textAlign,
  lineSpacing,
  editorZoom,
  paragraphSpacing,
  onToggleCollapse,
  onTabChange,
  onFontChange,
  onAlignChange,
  onLineSpacingChange,
  onZoomChange,
  onParagraphSpacingChange,
  onLanguageChange,
  onShowChapterSheet,
  children
}) => {
  if (!isVisible) return null;

  const tabLabels: Record<InspectorTabType, string> = {
    editor: 'Editor',
    chapter: 'Chapter',
    project: 'Project',
    ai: 'AI'
  };

  return React.createElement('div', {
    className: isCollapsed ? 'faust-inspector collapsed' : 'faust-inspector visible'
  },
    // Collapse button
    React.createElement('button', {
      onClick: onToggleCollapse,
      title: isCollapsed ? 'Expand Inspector' : 'Collapse Inspector',
      style: {
        position: 'absolute',
        top: '12px',
        right: isCollapsed ? '4px' : '268px',
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

    // Inspector content
    !isCollapsed && React.createElement('div', {
      style: { padding: '16px', color: 'var(--text)' }
    },
      // Header
      React.createElement('h3', {
        style: {
          fontFamily: 'EB Garamond',
          fontSize: '16px',
          marginBottom: '12px'
        }
      }, 'Inspector'),

      // Tab Navigation
      React.createElement('div', {
        style: {
          display: 'flex',
          gap: '4px',
          marginBottom: '16px',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '8px'
        }
      },
        (['editor', 'chapter', 'project', 'ai'] as InspectorTabType[]).map(tab =>
          React.createElement('button', {
            key: tab,
            onClick: () => onTabChange(tab),
            style: {
              flex: 1,
              padding: '6px 8px',
              background: activeTab === tab ? 'var(--bg-2)' : 'transparent',
              border: activeTab === tab ? '1px solid var(--bronze)' : '1px solid var(--border-color)',
              borderBottom: activeTab === tab ? '2px solid var(--bronze)' : '1px solid var(--border-color)',
              borderRadius: '4px 4px 0 0',
              color: activeTab === tab ? 'var(--text)' : 'var(--text-3)',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              textTransform: 'uppercase',
              fontWeight: activeTab === tab ? 600 : 400,
              transition: 'all 0.2s'
            }
          }, tabLabels[tab])
        )
      ),

      // Tab Content
      activeTab === 'editor' && React.createElement(InspectorEditorTab, {
        editorFont,
        textAlign,
        lineSpacing,
        editorZoom,
        paragraphSpacing,
        onFontChange,
        onAlignChange,
        onLineSpacingChange,
        onZoomChange,
        onParagraphSpacingChange
      }),

      activeTab === 'project' && React.createElement(InspectorProjectTab, {
        project,
        onLanguageChange
      }),

      // Chapter and AI tabs render children (to be passed from parent app.js for now)
      (activeTab === 'chapter' || activeTab === 'ai') && children
    )
  );
};

export default Inspector;

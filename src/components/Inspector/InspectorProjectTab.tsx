/**
 * InspectorProjectTab Component
 * Project-level information and settings in the Inspector panel
 */

import React from 'react';
import type { Project } from '../../types';

interface InspectorProjectTabProps {
  project: Project;
  onLanguageChange: (language: string) => void;
}

export const InspectorProjectTab: React.FC<InspectorProjectTabProps> = ({
  project,
  onLanguageChange
}) => {
  const progressPercent = Math.round(
    (project.targets.currentTotal / project.targets.totalWords) * 100
  );

  return React.createElement('div', {
    style: {
      marginBottom: '24px',
      paddingBottom: '20px',
      borderBottom: '1px solid var(--border-color)'
    }
  },
    React.createElement('div', {
      style: {
        fontFamily: 'IBM Plex Mono',
        fontSize: '11px',
        color: 'var(--text-3)',
        marginBottom: '12px',
        textTransform: 'uppercase'
      }
    }, 'Project Info'),

    React.createElement('div', {
      style: {
        fontFamily: 'IBM Plex Mono',
        fontSize: '13px',
        color: 'var(--text-2)',
        marginBottom: '4px'
      }
    }, `Genre: ${project.genre}`),

    // Language selector
    React.createElement('div', { style: { marginBottom: '8px' } },
      React.createElement('div', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-3)',
          marginBottom: '4px'
        }
      }, 'Tarinan kieli:'),
      React.createElement('select', {
        value: project.language || 'fi',
        onChange: (ev) => onLanguageChange(ev.target.value),
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
        React.createElement('option', { value: 'fi' }, '🇫🇮 Suomi'),
        React.createElement('option', { value: 'en' }, '🇬🇧 English')
      )
    ),

    React.createElement('div', {
      style: {
        fontFamily: 'IBM Plex Mono',
        fontSize: '13px',
        color: 'var(--text-2)',
        marginBottom: '4px'
      }
    }, `Tavoite: ${project.targets.totalWords} sanaa`),

    React.createElement('div', {
      style: {
        fontFamily: 'IBM Plex Mono',
        fontSize: '13px',
        color: 'var(--text-2)'
      }
    }, `Edistyminen: ${progressPercent}%`)
  );
};

export default InspectorProjectTab;

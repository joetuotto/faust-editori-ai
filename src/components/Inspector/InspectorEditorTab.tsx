/**
 * InspectorEditorTab Component
 * Editor formatting controls in the Inspector panel
 */

import React from 'react';

interface InspectorEditorTabProps {
  editorFont: string;
  textAlign: string;
  lineSpacing: string;
  editorZoom: string;
  paragraphSpacing: string;
  onFontChange: (font: string) => void;
  onAlignChange: (align: string) => void;
  onLineSpacingChange: (spacing: string) => void;
  onZoomChange: (zoom: string) => void;
  onParagraphSpacingChange: (spacing: string) => void;
}

export const InspectorEditorTab: React.FC<InspectorEditorTabProps> = ({
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
}) => {
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
    }, 'Editor Controls'),

    // Font selector
    React.createElement('div', { style: { marginBottom: '16px' } },
      React.createElement('label', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-3)',
          display: 'block',
          marginBottom: '4px'
        }
      }, 'Fontti:'),
      React.createElement('select', {
        value: editorFont,
        onChange: (ev) => onFontChange(ev.target.value),
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
        React.createElement('option', { value: 'EB Garamond' }, 'EB Garamond'),
        React.createElement('option', { value: 'Georgia' }, 'Georgia'),
        React.createElement('option', { value: 'SF Pro' }, 'SF Pro'),
        React.createElement('option', { value: 'Times' }, 'Times'),
        React.createElement('option', { value: 'Palatino' }, 'Palatino'),
        React.createElement('option', { value: 'Courier' }, 'Courier')
      )
    ),

    // Text alignment
    React.createElement('div', { style: { marginBottom: '16px' } },
      React.createElement('label', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-3)',
          display: 'block',
          marginBottom: '4px'
        }
      }, 'Tasaus:'),
      React.createElement('div', { style: { display: 'flex', gap: '4px' } },
        ['left', 'center', 'right', 'justify'].map(align =>
          React.createElement('button', {
            key: align,
            onClick: () => onAlignChange(align),
            title: { left: 'Vasen', center: 'Keskitetty', right: 'Oikea', justify: 'Tasattu' }[align],
            style: {
              flex: 1,
              padding: '6px',
              background: textAlign === align ? 'var(--sigil)' : 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: textAlign === align ? '#000' : 'var(--text-2)',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '10px',
              transition: 'all 0.2s'
            }
          }, { left: '⬅️', center: '↔️', right: '➡️', justify: '⬌' }[align])
        )
      )
    ),

    // Line spacing
    React.createElement('div', { style: { marginBottom: '16px' } },
      React.createElement('label', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-3)',
          display: 'block',
          marginBottom: '4px'
        }
      }, 'Riviväli:'),
      React.createElement('select', {
        value: lineSpacing,
        onChange: (ev) => onLineSpacingChange(ev.target.value),
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
        React.createElement('option', { value: '1.0' }, '1.0'),
        React.createElement('option', { value: '1.15' }, '1.15'),
        React.createElement('option', { value: '1.5' }, '1.5'),
        React.createElement('option', { value: '1.8' }, '1.8 (oletus)'),
        React.createElement('option', { value: '2.0' }, '2.0')
      )
    ),

    // Zoom
    React.createElement('div', { style: { marginBottom: '16px' } },
      React.createElement('label', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-3)',
          display: 'block',
          marginBottom: '4px'
        }
      }, 'Zoomaus:'),
      React.createElement('select', {
        value: editorZoom,
        onChange: (ev) => onZoomChange(ev.target.value),
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
        React.createElement('option', { value: '80' }, '80%'),
        React.createElement('option', { value: '90' }, '90%'),
        React.createElement('option', { value: '100' }, '100% (oletus)'),
        React.createElement('option', { value: '110' }, '110%'),
        React.createElement('option', { value: '120' }, '120%')
      )
    ),

    // Paragraph spacing
    React.createElement('div', { style: { marginBottom: '8px' } },
      React.createElement('label', {
        style: {
          fontFamily: 'IBM Plex Mono',
          fontSize: '11px',
          color: 'var(--text-3)',
          display: 'block',
          marginBottom: '4px'
        }
      }, 'Kappaleväli:'),
      React.createElement('select', {
        value: paragraphSpacing,
        onChange: (ev) => onParagraphSpacingChange(ev.target.value),
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
        React.createElement('option', { value: '1.0' }, 'Normaali'),
        React.createElement('option', { value: '1.5' }, 'Keskisuuri (oletus)'),
        React.createElement('option', { value: '2.0' }, 'Suuri')
      )
    )
  );
};

export default InspectorEditorTab;

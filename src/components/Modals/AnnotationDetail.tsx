/**
 * AnnotationDetail Modal
 * Displays detailed information about an annotation with delete functionality
 */

import React from 'react';
import Modal from './Modal';
import type { Annotation } from '../../types';

interface AnnotationDetailProps {
  isOpen: boolean;
  annotation: Annotation | null;
  onClose: () => void;
  onDelete: (annotationId: string) => void;
}

export const AnnotationDetail: React.FC<AnnotationDetailProps> = ({
  isOpen,
  annotation,
  onClose,
  onDelete
}) => {
  if (!isOpen || !annotation) return null;

  const handleDelete = () => {
    if (window.confirm('Delete this annotation?')) {
      onDelete(annotation.id);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📝 Annotation Details"
      maxWidth="600px"
    >
      {/* Annotation Type */}
      <div style={{ marginBottom: '16px' }}>
        <div
          style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            color: 'var(--text-3)',
            marginBottom: '4px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}
        >
          Type
        </div>
        <div
          style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '14px',
            color: 'var(--text)',
            padding: '8px 12px',
            background: 'var(--bg-2)',
            borderRadius: '4px',
            border: '1px solid var(--border-color)'
          }}
        >
          {annotation.type || 'N/A'}
        </div>
      </div>

      {/* Content */}
      {annotation.content && (
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text-3)',
              marginBottom: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            Content
          </div>
          <div
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: '14px',
              color: 'var(--text)',
              padding: '12px',
              background: 'var(--bg-2)',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.6'
            }}
          >
            {annotation.content}
          </div>
        </div>
      )}

      {/* Priority */}
      {annotation.priority && (
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text-3)',
              marginBottom: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            Priority
          </div>
          <div
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: '14px',
              color: 'var(--text)',
              padding: '8px 12px',
              background: 'var(--bg-2)',
              borderRadius: '4px',
              border: '1px solid var(--border-color)'
            }}
          >
            {annotation.priority.toUpperCase()}
          </div>
        </div>
      )}

      {/* Position Info */}
      <div style={{ marginBottom: '16px' }}>
        <div
          style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '11px',
            color: 'var(--text-3)',
            marginBottom: '4px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}
        >
          Position
        </div>
        <div
          style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: '13px',
            color: 'var(--text-2)',
            padding: '8px 12px',
            background: 'var(--bg-2)',
            borderRadius: '4px',
            border: '1px solid var(--border-color)'
          }}
        >
          Start: {annotation.position || 0}, Length: {annotation.length || 0}
        </div>
      </div>

      {/* Timestamp */}
      {annotation.timestamp && (
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text-3)',
              marginBottom: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            Created
          </div>
          <div
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text-2)',
              padding: '8px 12px',
              background: 'var(--bg-2)',
              borderRadius: '4px',
              border: '1px solid var(--border-color)'
            }}
          >
            {new Date(annotation.timestamp).toLocaleString('fi-FI')}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          justifyContent: 'flex-end',
          borderTop: '1px solid var(--border-color)',
          paddingTop: '16px'
        }}
      >
        <button
          onClick={handleDelete}
          style={{
            padding: '10px 20px',
            background: 'transparent',
            border: '1px solid var(--bronze)',
            borderRadius: '4px',
            color: 'var(--bronze)',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono',
            fontSize: '13px',
            fontWeight: 500
          }}
        >
          🗑️ Delete
        </button>

        <button
          onClick={onClose}
          style={{
            padding: '10px 20px',
            background: 'var(--bronze)',
            border: 'none',
            borderRadius: '4px',
            color: '#000',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono',
            fontSize: '13px',
            fontWeight: 600
          }}
        >
          Close
        </button>
      </div>
    </Modal>
  );
};

export default AnnotationDetail;

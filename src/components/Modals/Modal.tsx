/**
 * Base Modal Component
 * Reusable modal with overlay, ESC key handling, and click-outside-to-close
 */

import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  maxWidth?: string;
  children: React.ReactNode;
  closeOnOverlayClick?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  maxWidth = '700px',
  children,
  closeOnOverlayClick = true
}) => {
  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={handleOverlayClick}
    >
      <div
        style={{
          background: 'var(--bg-1)',
          border: '2px solid var(--bronze)',
          borderRadius: '8px',
          padding: '32px',
          maxWidth,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px'
          }}
        >
          <h2
            style={{
              fontFamily: 'EB Garamond',
              fontSize: '24px',
              color: 'var(--text)',
              margin: 0
            }}
          >
            {title}
          </h2>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text-3)',
              padding: '4px 12px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px'
            }}
          >
            Sulje
          </button>
        </div>

        {/* Content */}
        {children}
      </div>
    </div>
  );
};

export default Modal;

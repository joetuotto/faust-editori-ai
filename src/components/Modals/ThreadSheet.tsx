/**
 * ThreadSheet Modal
 * Displays all plot threads in the story
 */

import React from 'react';
import Modal from './Modal';
import type { PlotThread } from '../../types';

interface ThreadSheetProps {
  isOpen: boolean;
  onClose: () => void;
  threads: PlotThread[];
}

export const ThreadSheet: React.FC<ThreadSheetProps> = ({
  isOpen,
  onClose,
  threads
}) => {
  const threadCount = threads?.length || 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🧵 Plot Threads"
      maxWidth="900px"
    >
      <p
        style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px',
          color: 'var(--text-2)',
          marginBottom: '24px'
        }}
      >
        {threadCount} thread{threadCount !== 1 ? 's' : ''} in your story
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {threads && threads.map((thread, idx) => (
          <div
            key={thread.id || idx}
            style={{
              padding: '16px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px'
            }}
          >
            <h3
              style={{
                fontFamily: 'EB Garamond',
                fontSize: '18px',
                color: 'var(--text)',
                marginBottom: '8px'
              }}
            >
              {thread.name || `Thread ${idx + 1}`}
            </h3>

            {thread.description && (
              <div
                style={{
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '12px',
                  color: 'var(--text-2)',
                  marginBottom: '8px',
                  lineHeight: '1.5'
                }}
              >
                {thread.description}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                gap: '12px',
                marginTop: '8px'
              }}
            >
              {thread.type && (
                <span
                  style={{
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '10px',
                    color: 'var(--sigil)',
                    textTransform: 'capitalize'
                  }}
                >
                  Type: {thread.type.replace('_', ' ')}
                </span>
              )}

              {thread.status && (
                <span
                  style={{
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '10px',
                    color: thread.status === 'resolved' ? '#4CAF50' : '#FFA726',
                    textTransform: 'capitalize'
                  }}
                >
                  Status: {thread.status}
                </span>
              )}
            </div>

            {/* Additional info */}
            {thread.linkedCharacters && thread.linkedCharacters.length > 0 && (
              <div
                style={{
                  marginTop: '8px',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '10px',
                  color: 'var(--text-3)'
                }}
              >
                Characters: {thread.linkedCharacters.join(', ')}
              </div>
            )}

            {thread.chapterAppearances && thread.chapterAppearances.length > 0 && (
              <div
                style={{
                  marginTop: '4px',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '10px',
                  color: 'var(--text-3)'
                }}
              >
                Appears in {thread.chapterAppearances.length} chapter{thread.chapterAppearances.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        ))}

        {threadCount === 0 && (
          <div
            style={{
              padding: '32px',
              textAlign: 'center',
              color: 'var(--text-3)',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px'
            }}
          >
            No plot threads yet. Plot threads are tracked automatically by the AI consistency checker.
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ThreadSheet;

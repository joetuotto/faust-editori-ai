/**
 * LocationSheet Modal
 * Displays all story locations tracked by continuity system
 */

import React from 'react';
import Modal from './Modal';

interface Location {
  name: string;
  firstMentioned: number;
  appearances: number[];
}

interface LocationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  locations: Record<string, Location>;
}

export const LocationSheet: React.FC<LocationSheetProps> = ({
  isOpen,
  onClose,
  locations
}) => {
  const locationCount = Object.keys(locations || {}).length;
  const locationList = Object.values(locations || {});

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📍 Story Locations"
      maxWidth="800px"
    >
      <p
        style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: '12px',
          color: 'var(--text-2)',
          marginBottom: '24px'
        }}
      >
        {locationCount} locations tracked
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '12px'
        }}
      >
        {locationList.map((loc) => (
          <div
            key={loc.name}
            style={{
              padding: '12px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px'
            }}
          >
            <h3
              style={{
                fontFamily: 'EB Garamond',
                fontSize: '16px',
                color: 'var(--text)',
                marginBottom: '6px'
              }}
            >
              {loc.name}
            </h3>
            <div
              style={{
                fontFamily: 'IBM Plex Mono',
                fontSize: '10px',
                color: 'var(--text-3)',
                marginBottom: '4px'
              }}
            >
              First mentioned: Chapter {loc.firstMentioned + 1}
            </div>
            <div
              style={{
                fontFamily: 'IBM Plex Mono',
                fontSize: '10px',
                color: 'var(--text-3)'
              }}
            >
              Appearances: {(loc.appearances || []).length}
            </div>
          </div>
        ))}

        {locationCount === 0 && (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: '32px',
              textAlign: 'center',
              color: 'var(--text-3)',
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px'
            }}
          >
            No locations tracked yet. Locations are automatically detected by the AI continuity tracker.
          </div>
        )}
      </div>
    </Modal>
  );
};

export default LocationSheet;

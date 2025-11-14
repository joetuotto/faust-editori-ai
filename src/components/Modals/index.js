/**
 * Modal Components Index
 * 
 * Since components are loaded via script tags and exported to window,
 * this file re-exports them for convenience.
 */

// Components are loaded globally via script tags in index.html
// and exported to window object

export const CharacterSheetModal = window.CharacterSheetModal;
export const LocationSheetModal = window.LocationSheetModal;
export const ThreadSheetModal = window.ThreadSheetModal;
export const ChapterSheetModal = window.ChapterSheetModal;

// Constants are also available globally
export const CONSTANTS = window.CONSTANTS;

console.log('[Modals] Components loaded:', {
  CharacterSheetModal: !!window.CharacterSheetModal,
  LocationSheetModal: !!window.LocationSheetModal,
  ThreadSheetModal: !!window.ThreadSheetModal,
  ChapterSheetModal: !!window.ChapterSheetModal,
  CONSTANTS: !!window.CONSTANTS
});

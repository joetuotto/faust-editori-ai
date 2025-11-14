/**
 * Inspector Components Index
 * Export all inspector-related components
 */

export { Inspector, default as DefaultInspector } from './Inspector';
export type { InspectorTabType } from './Inspector';
export { InspectorEditorTab } from './InspectorEditorTab';
export { InspectorProjectTab } from './InspectorProjectTab';
export { InspectorChapterTab } from './InspectorChapterTab';

// Note: InspectorAITab (1208 lines) is extremely complex and tightly coupled
// to app.js state with 50+ props and multiple ref dependencies.
// Deferred to Phase 5 for extraction after state management refactoring.

/**
 * Inspector Components Index
 * Export all inspector-related components
 */

export { Inspector, default as DefaultInspector } from './Inspector';
export type { InspectorTabType } from './Inspector';
export { InspectorEditorTab } from './InspectorEditorTab';
export { InspectorProjectTab } from './InspectorProjectTab';

// Note: InspectorChapterTab and InspectorAITab are complex and tightly coupled
// to app.js state. They will be extracted in a future phase with proper
// state management refactoring.

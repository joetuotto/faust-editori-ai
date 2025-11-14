/**
 * Annotation Types and Utilities for FAUST Editor
 * Supports AI-generated and user-created annotations
 */

(function(window) {
  'use strict';

  // Annotation types
  const ANNOTATION_TYPES = {
    AI_CONSISTENCY: 'ai_consistency',      // From ConsistencyChecker
    AI_QUALITY: 'ai_quality',              // From quality analysis
    AI_SUGGESTION: 'ai_suggestion',        // AI improvement suggestions
    AI_PLOT_THREAD: 'ai_plot_thread',      // From PlotThreadTracker
    USER_NOTE: 'user_note',                // User sticky note
    USER_COMMENT: 'user_comment',          // User comment
    HIGHLIGHT: 'highlight'                 // User highlight
  };

  // Annotation severity/priority
  const ANNOTATION_PRIORITY = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info'
  };

  // Annotation colors
  const ANNOTATION_COLORS = {
    critical: '#ff4444',      // Red
    high: '#ff9800',          // Orange
    medium: '#ffc107',        // Yellow
    low: '#4caf50',           // Green
    info: '#2196f3',          // Blue
    user_yellow: '#ffeb3b',   // Post-it yellow
    user_green: '#8bc34a',    // Post-it green
    user_blue: '#03a9f4',     // Post-it blue
    user_pink: '#e91e63'      // Post-it pink
  };

  /**
   * Create a new annotation
   */
  function createAnnotation(options) {
    const {
      type,
      position,
      length = 0,
      content,
      priority = ANNOTATION_PRIORITY.MEDIUM,
      color = null,
      source = 'user',
      aiSuggestion = null,
      metadata = {}
    } = options;

    return {
      id: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      position,
      length,
      content,
      priority,
      color: color || ANNOTATION_COLORS[priority],
      source,
      aiSuggestion,
      metadata,
      resolved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Get annotation color based on priority
   */
  function getAnnotationColor(annotation) {
    if (annotation.color) return annotation.color;
    return ANNOTATION_COLORS[annotation.priority] || ANNOTATION_COLORS.info;
  }

  /**
   * Get annotation icon based on type
   */
  function getAnnotationIcon(annotation) {
    const icons = {
      [ANNOTATION_TYPES.AI_CONSISTENCY]: '⚠️',
      [ANNOTATION_TYPES.AI_QUALITY]: '💡',
      [ANNOTATION_TYPES.AI_SUGGESTION]: '✨',
      [ANNOTATION_TYPES.AI_PLOT_THREAD]: '🧵',
      [ANNOTATION_TYPES.USER_NOTE]: '📝',
      [ANNOTATION_TYPES.USER_COMMENT]: '💬',
      [ANNOTATION_TYPES.HIGHLIGHT]: '🖍️'
    };
    return icons[annotation.type] || '📌';
  }

  /**
   * Sort annotations by position
   */
  function sortAnnotations(annotations) {
    return [...annotations].sort((a, b) => a.position - b.position);
  }

  /**
   * Get annotations in visible range
   */
  function getVisibleAnnotations(annotations, startPos, endPos) {
    return annotations.filter(ann =>
      ann.position >= startPos && ann.position <= endPos
    );
  }

  /**
   * Update annotation
   */
  function updateAnnotation(annotation, updates) {
    return {
      ...annotation,
      ...updates,
      updatedAt: new Date().toISOString()
    };
  }

  // Export to window
  window.AnnotationUtils = {
    ANNOTATION_TYPES,
    ANNOTATION_PRIORITY,
    ANNOTATION_COLORS,
    createAnnotation,
    getAnnotationColor,
    getAnnotationIcon,
    sortAnnotations,
    getVisibleAnnotations,
    updateAnnotation
  };

  console.log('[AnnotationUtils] Loaded');

})(window);

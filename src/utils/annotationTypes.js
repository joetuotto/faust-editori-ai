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

  // Annotation colours by priority, on the review scale: critical and high are errors, medium a
  // warning, low and info a note. Design tokens, resolved when the marker is drawn, so they follow
  // the theme; the margin marker takes the same colours from its data-priority attribute.
  const ANNOTATION_COLORS = {
    critical: 'var(--error)',
    high: 'var(--error)',
    medium: 'var(--warning)',
    low: 'var(--info)',
    info: 'var(--info)'
  };

  /**
   * Create a new annotation.
   *
   * chapterId and chapterIndex say which chapter the annotation belongs to. They are kept when
   * they are given: the consistency checker places its marks into the chapters by them (and the
   * app carries them into the project by chapter id). A note made in the open chapter passes
   * neither and has neither key.
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
      metadata = {},
      chapterId,
      chapterIndex
    } = options;

    const annotation = {
      id: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      position,
      length,
      content,
      priority,
      // The priority decides the colour when the marker is drawn; a colour is stored only if one was given
      color: color || null,
      source,
      aiSuggestion,
      metadata,
      resolved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (chapterId !== undefined && chapterId !== null && chapterId !== '') annotation.chapterId = chapterId;
    if (Number.isInteger(chapterIndex) && chapterIndex >= 0) annotation.chapterIndex = chapterIndex;
    return annotation;
  }

  /**
   * Get annotation colour (a design token) based on priority. A colour stored in older projects
   * (a hex value from the time before the tokens) is not used: the priority decides.
   */
  function getAnnotationColor(annotation) {
    return ANNOTATION_COLORS[annotation.priority] || ANNOTATION_COLORS.info;
  }

  /**
   * Get the name of the annotation's icon (src/components/icons.js, window.FaustIcons) by type
   */
  function getAnnotationIcon(annotation) {
    const icons = {
      [ANNOTATION_TYPES.AI_CONSISTENCY]: 'warning',
      [ANNOTATION_TYPES.AI_QUALITY]: 'idea',
      [ANNOTATION_TYPES.AI_SUGGESTION]: 'star8',
      [ANNOTATION_TYPES.AI_PLOT_THREAD]: 'lemniscate',
      [ANNOTATION_TYPES.USER_NOTE]: 'note',
      [ANNOTATION_TYPES.USER_COMMENT]: 'comment',
      [ANNOTATION_TYPES.HIGHLIGHT]: 'highlighter'
    };
    return icons[annotation.type] || 'pin';
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

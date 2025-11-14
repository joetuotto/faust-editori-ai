/**
 * AnnotationMargin Component
 * Displays annotations (AI suggestions, user notes, highlights) in the editor margin
 * Uses window.AnnotationUtils from annotationTypes.js
 */

(function(window) {
  'use strict';

  const { createElement: e } = React;

  /**
   * AnnotationMargin Component
   * @param {Object} props
   * @param {Array} props.annotations - Array of annotation objects
   * @param {string} props.content - Current chapter content (for position calculation)
   * @param {Function} props.onAnnotationClick - Callback when annotation is clicked
   * @param {Function} props.onCreateAnnotation - Callback to create new annotation
   * @param {Function} props.onUpdateAnnotation - Callback to update annotation
   * @param {Function} props.onDeleteAnnotation - Callback to delete annotation
   * @param {Object} props.editorDimensions - { scrollTop, clientHeight, scrollHeight }
   */
  const AnnotationMargin = (props) => {
    const {
      annotations = [],
      content = '',
      onAnnotationClick,
      onCreateAnnotation,
      onUpdateAnnotation,
      onDeleteAnnotation,
      editorDimensions = { scrollTop: 0, clientHeight: 600, scrollHeight: 1000 }
    } = props;

    const [hoveredAnnotationId, setHoveredAnnotationId] = React.useState(null);
    const [expandedAnnotationId, setExpandedAnnotationId] = React.useState(null);

    // Access AnnotationUtils from global scope
    const AnnotationUtils = window.AnnotationUtils;
    if (!AnnotationUtils) {
      console.error('[AnnotationMargin] AnnotationUtils not loaded');
      return null;
    }

    // Calculate visible range based on editor scroll position
    const calculateVisibleRange = () => {
      const { scrollTop, clientHeight, scrollHeight } = editorDimensions;
      const contentLength = content.length;

      if (scrollHeight === 0 || contentLength === 0) {
        return { start: 0, end: contentLength };
      }

      // Estimate visible character range from scroll position
      const scrollRatio = scrollTop / (scrollHeight - clientHeight);
      const start = Math.floor(scrollRatio * contentLength);
      const visibleRatio = clientHeight / scrollHeight;
      const end = Math.min(contentLength, Math.floor(start + visibleRatio * contentLength));

      return { start, end };
    };

    // Get visible annotations
    const visibleRange = calculateVisibleRange();
    const visibleAnnotations = AnnotationUtils.getVisibleAnnotations(
      annotations,
      visibleRange.start,
      visibleRange.end
    );

    // Calculate annotation position on screen
    const calculateAnnotationTop = (annotation) => {
      const { scrollTop, clientHeight, scrollHeight } = editorDimensions;
      const contentLength = content.length;

      if (contentLength === 0 || scrollHeight === 0) return 0;

      // Calculate position ratio based on annotation position in content
      const positionRatio = annotation.position / contentLength;
      
      // Convert to scroll position
      const annotationScrollPos = positionRatio * scrollHeight;
      
      // Calculate relative position in viewport
      const relativePos = annotationScrollPos - scrollTop;
      
      // Clamp to visible area
      return Math.max(0, Math.min(clientHeight - 40, relativePos));
    };

    // Group overlapping annotations (within 30px)
    const groupAnnotations = (annotations) => {
      const groups = [];
      const sorted = [...annotations].sort((a, b) => {
        const posA = calculateAnnotationTop(a);
        const posB = calculateAnnotationTop(b);
        return posA - posB;
      });

      sorted.forEach(annotation => {
        const pos = calculateAnnotationTop(annotation);
        
        // Find group within 30px
        const group = groups.find(g => Math.abs(g.position - pos) < 30);
        
        if (group) {
          group.annotations.push(annotation);
          // Update group position to average
          const avgPos = group.annotations.reduce((sum, a) => sum + calculateAnnotationTop(a), 0) / group.annotations.length;
          group.position = avgPos;
        } else {
          groups.push({
            position: pos,
            annotations: [annotation]
          });
        }
      });

      return groups;
    };

    const annotationGroups = groupAnnotations(visibleAnnotations);

    // Handle annotation click
    const handleAnnotationClick = (annotation, event) => {
      event.stopPropagation();
      
      if (expandedAnnotationId === annotation.id) {
        setExpandedAnnotationId(null);
      } else {
        setExpandedAnnotationId(annotation.id);
      }

      if (onAnnotationClick) {
        onAnnotationClick(annotation);
      }
    };

    // Render annotation marker
    const renderAnnotationMarker = (annotation, isGrouped = false) => {
      const isExpanded = expandedAnnotationId === annotation.id;
      const isHovered = hoveredAnnotationId === annotation.id;
      const color = AnnotationUtils.getAnnotationColor(annotation);
      const icon = AnnotationUtils.getAnnotationIcon(annotation);

      return e('div', {
        key: annotation.id,
        onClick: (ev) => handleAnnotationClick(annotation, ev),
        onMouseEnter: () => setHoveredAnnotationId(annotation.id),
        onMouseLeave: () => setHoveredAnnotationId(null),
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: isExpanded ? '8px' : '4px',
          padding: isExpanded ? '8px' : '4px',
          background: isExpanded ? color + '22' : (isHovered ? color + '11' : 'transparent'),
          border: `1px solid ${color}`,
          borderRadius: '4px',
          cursor: 'pointer',
          transition: 'all 0.2s',
          marginBottom: isGrouped ? '4px' : '0',
          minWidth: isExpanded ? '200px' : '32px'
        }
      },
        // Icon
        e('div', {
          style: {
            fontSize: '14px',
            lineHeight: '1',
            flexShrink: 0
          }
        }, icon),

        // Expanded content
        isExpanded && e('div', {
          style: {
            flex: 1,
            overflow: 'hidden'
          }
        },
          // Type badge
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '9px',
              color: 'var(--text-3)',
              marginBottom: '4px',
              textTransform: 'uppercase'
            }
          }, annotation.type.replace(/_/g, ' ')),

          // Content preview
          annotation.content && e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '11px',
              color: 'var(--text)',
              marginBottom: '4px',
              maxHeight: '60px',
              overflow: 'hidden',
              lineHeight: '1.4'
            }
          }, annotation.content.substring(0, 100) + (annotation.content.length > 100 ? '...' : '')),

          // AI Suggestion preview
          annotation.aiSuggestion && e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '10px',
              color: 'var(--sigil)',
              fontStyle: 'italic',
              marginBottom: '4px'
            }
          }, '💡 ' + annotation.aiSuggestion.substring(0, 80) + '...'),

          // Priority indicator
          annotation.priority && annotation.priority !== 'INFO' && e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '9px',
              color: color,
              fontWeight: 600
            }
          }, annotation.priority),

          // Action buttons
          e('div', {
            style: {
              display: 'flex',
              gap: '4px',
              marginTop: '8px'
            }
          },
            // Resolve button (for AI annotations)
            !annotation.resolved && annotation.source === 'ai' && e('button', {
              onClick: (ev) => {
                ev.stopPropagation();
                if (onUpdateAnnotation) {
                  onUpdateAnnotation(annotation.id, { resolved: true });
                }
              },
              style: {
                padding: '2px 6px',
                background: 'var(--sigil)',
                border: 'none',
                borderRadius: '2px',
                color: '#000',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '9px',
                fontWeight: 600
              }
            }, '✓'),

            // Delete button
            e('button', {
              onClick: (ev) => {
                ev.stopPropagation();
                if (confirm('Delete this annotation?')) {
                  if (onDeleteAnnotation) {
                    onDeleteAnnotation(annotation.id);
                  }
                }
              },
              style: {
                padding: '2px 6px',
                background: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '2px',
                color: 'var(--text-3)',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono',
                fontSize: '9px'
              }
            }, '×')
          )
        )
      );
    };

    // Render annotation group
    const renderAnnotationGroup = (group) => {
      const { position, annotations: groupAnnotations } = group;
      const isMultiple = groupAnnotations.length > 1;

      return e('div', {
        key: `group-${position}`,
        style: {
          position: 'absolute',
          top: `${position}px`,
          right: '8px',
          zIndex: expandedAnnotationId ? 200 : 100,
          maxWidth: '300px'
        }
      },
        isMultiple ? e('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '4px',
            background: 'var(--bg-1)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }
        },
          // Group header
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '9px',
              color: 'var(--text-3)',
              padding: '4px',
              borderBottom: '1px solid var(--border-color)'
            }
          }, `${groupAnnotations.length} annotations`),

          // Individual annotations
          ...groupAnnotations.map(annotation => renderAnnotationMarker(annotation, true))
        ) : renderAnnotationMarker(groupAnnotations[0], false)
      );
    };

    // Render the margin
    return e('div', {
      style: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: '40px',
        height: '100%',
        pointerEvents: 'none', // Allow clicks to pass through to editor
        zIndex: 50
      }
    },
      // Annotation markers (with pointer events enabled)
      e('div', {
        style: {
          position: 'relative',
          width: '100%',
          height: '100%',
          pointerEvents: 'auto' // Re-enable pointer events for markers
        }
      },
        annotationGroups.map(group => renderAnnotationGroup(group))
      )
    );
  };

  // Export to global scope
  window.AnnotationMargin = AnnotationMargin;

  console.log('[AnnotationMargin] Component loaded');

})(window);

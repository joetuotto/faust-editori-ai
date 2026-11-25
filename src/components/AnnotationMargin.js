/**
 * AnnotationMargin Component
 * Displays annotations (merkinnät: AI findings, the author's own notes, highlights) in the
 * strip beside the text: one 20px marker each, an icon in the colour of its priority.
 * Uses window.AnnotationUtils from annotationTypes.js.
 *
 * Loaded as a plain script before the bundle: window.FaustIcons (icons.js) is read only inside
 * the render, never at the top of this file.
 */

(function(window) {
  'use strict';

  const { createElement: e } = React;

  // The icon module is assigned by the bundle, which loads after this file
  const icons = () => window.FaustIcons || {};
  const icon = (name, size) => {
    const draw = icons()[name];
    return draw ? draw({ size }) : null;
  };

  // Display names of the stored values (menu spec A.4); an unknown value is shown as it is stored.
  // nameOf takes a table, so it is not the app's shared labelOf(group, value).
  const TYPE_LABEL = {
    ai_consistency: 'Ristiriita',
    ai_quality: 'Laatu',
    ai_suggestion: 'Parannusehdotus',
    ai_plot_thread: 'Juonilanka',
    user_note: 'Reunahuomautus',
    user_comment: 'Kommentti',
    highlight: 'Korostus'
  };
  const PRIORITY_LABEL = {
    critical: 'Kriittinen',
    high: 'Suuri',
    medium: 'Tavallinen',
    low: 'Pieni',
    info: 'Tiedoksi'
  };
  const nameOf = (table, value) => table[value] || String(value).replace(/_/g, ' ');

  // The one noun this file counts: '1 merkintä', '3 merkintää'
  const countMerkinta = (n) => `${Number(n).toLocaleString('fi-FI')} ${n === 1 ? 'merkintä' : 'merkintää'}`;

  const clip = (text, length) => (text.length > length ? text.substring(0, length) + '…' : text);

  /**
   * AnnotationMargin Component
   * @param {Object} props
   * @param {Array} props.annotations - Array of annotation objects
   * @param {string} props.content - Current chapter content (for position calculation)
   * @param {Function} props.onAnnotationClick - Callback when annotation is clicked
   * @param {Function} props.onCreateAnnotation - Callback to create new annotation
   * @param {Function} props.onUpdateAnnotation - Callback to update annotation
   * @param {Function} props.onDeleteAnnotation - Callback to delete annotation
   * @param {Function} props.askConfirm - The app's question dialog (askConfirm in app.js); without it
   *   the delete control is not offered
   * @param {Object} props.editorDimensions - { scrollTop, clientHeight, scrollHeight }; a new object on every
   *   scroll and resize of the editor, so the markers follow the text
   * @param {Function} [props.lineTopOf] - (position) => { top, bottom } | null: where the text of a position
   *   stands in px from the top of the editor's visible area (FaustEditor's lineTopOf). With it a marker stands
   *   at its line and a marker whose line is out of view is not drawn; without it (no editor mounted) the
   *   position's share of the scroll height is the estimate, as before.
   */
  const AnnotationMargin = (props) => {
    const {
      annotations = [],
      content = '',
      onAnnotationClick,
      onCreateAnnotation,
      onUpdateAnnotation,
      onDeleteAnnotation,
      askConfirm,
      editorDimensions = { scrollTop: 0, clientHeight: 600, scrollHeight: 1000 },
      lineTopOf
    } = props;

    const [expandedAnnotationId, setExpandedAnnotationId] = React.useState(null);

    // Access AnnotationUtils from global scope
    const AnnotationUtils = window.AnnotationUtils;
    if (!AnnotationUtils) {
      console.error('[AnnotationMargin] AnnotationUtils not loaded');
      return null;
    }

    // The marker is 20px high (.faust-annot-marker): its middle goes on the middle of its line
    const MARKER = 20;

    // Where each marker stands, from the editor itself: the line of its position. null when the editor cannot say
    const measured = (annotation) => {
      if (typeof lineTopOf !== 'function') return null;
      const box = lineTopOf(annotation.position);
      if (!box || !Number.isFinite(box.top) || !Number.isFinite(box.bottom)) return null;
      return (box.top + box.bottom) / 2 - MARKER / 2;
    };

    // Calculate visible range based on editor scroll position (the estimate without the editor)
    const calculateVisibleRange = () => {
      const { scrollTop, clientHeight, scrollHeight } = editorDimensions;
      const contentLength = content.length;

      // Nothing scrolls (or nothing is measured yet): the whole text is visible. Without this
      // the ratio below is 0 / 0 and no annotation is shown.
      if (scrollHeight === 0 || scrollHeight <= clientHeight || contentLength === 0) {
        return { start: 0, end: contentLength };
      }

      // Estimate visible character range from scroll position
      const scrollRatio = scrollTop / (scrollHeight - clientHeight);
      const start = Math.floor(scrollRatio * contentLength);
      const visibleRatio = clientHeight / scrollHeight;
      const end = Math.min(contentLength, Math.floor(start + visibleRatio * contentLength));

      return { start, end };
    };

    // The estimate without the editor: the position's share of the scroll height, held inside the strip
    const estimatedTop = (annotation) => {
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

    // The markers on screen and their places. Measured: a marker stands at its line, and one whose line is out of
    // view is not drawn (it is never pinned to the strip's edge, where it would point at another line).
    const tops = new Map();
    let visibleAnnotations;
    const firstTop = annotations.length > 0 ? measured(annotations[0]) : null;
    if (firstTop !== null) {
      const height = editorDimensions.clientHeight > 0 ? editorDimensions.clientHeight : Infinity;
      visibleAnnotations = annotations.filter(annotation => {
        const top = measured(annotation);
        if (top === null || top + MARKER <= 0 || top >= height) return false;
        tops.set(annotation, top);
        return true;
      });
    } else {
      const visibleRange = calculateVisibleRange();
      visibleAnnotations = AnnotationUtils.getVisibleAnnotations(annotations, visibleRange.start, visibleRange.end);
      visibleAnnotations.forEach(annotation => tops.set(annotation, estimatedTop(annotation)));
    }

    // Calculate annotation position on screen
    const calculateAnnotationTop = (annotation) => (tops.has(annotation) ? tops.get(annotation) : estimatedTop(annotation));

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

    const handleDelete = async (annotation, event) => {
      event.stopPropagation();
      if (!askConfirm || !onDeleteAnnotation) return;
      const confirmed = await askConfirm(
        'Poistetaanko merkintä?',
        'Merkintä poistuu marginaalista. Luvun teksti ei muutu.',
        'Poista merkintä',
        'Peruuta',
        { danger: true }
      );
      if (confirmed) onDeleteAnnotation(annotation.id);
    };

    // The opened merkintä: a card to the left of its marker
    const renderAnnotationCard = (annotation, typeLabel) => {
      const priority = annotation.priority && annotation.priority !== 'info'
        ? nameOf(PRIORITY_LABEL, annotation.priority).toLowerCase()
        : null;
      const canResolve = !annotation.resolved && annotation.source === 'ai' && !!onUpdateAnnotation;
      const canDelete = !!askConfirm && !!onDeleteAnnotation;

      return e('div', {
        className: 'faust-card faust-card--compact',
        style: { width: '240px' },
        onClick: (ev) => ev.stopPropagation()
      },
        e('div', { className: 'faust-card__head' },
          e('span', { className: 'faust-card__title' }, typeLabel),
          (canResolve || canDelete) && e('span', { style: { display: 'flex', gap: 'var(--sp-half)' } },
            // Resolve (for AI findings)
            canResolve && e('button', {
              type: 'button',
              className: 'faust-btn faust-btn--icon faust-btn--sm',
              title: 'Merkitse käsitellyksi',
              'aria-label': 'Merkitse käsitellyksi',
              onClick: (ev) => {
                ev.stopPropagation();
                onUpdateAnnotation(annotation.id, { resolved: true });
              }
            }, icon('check', 14)),
            canDelete && e('button', {
              type: 'button',
              className: 'faust-btn faust-btn--icon faust-btn--sm faust-btn--danger',
              title: 'Poista merkintä',
              'aria-label': 'Poista merkintä',
              onClick: (ev) => handleDelete(annotation, ev)
            }, icon('trash', 14))
          )
        ),

        priority && e('div', { className: 'faust-meta' }, 'Tärkeys: ' + priority),

        annotation.content && e('div', { className: 'faust-card__body' }, clip(annotation.content, 100)),

        annotation.aiSuggestion && e('div', { className: 'faust-card__body' },
          'Korjausehdotus: ' + clip(annotation.aiSuggestion, 80))
      );
    };

    // One merkintä: its marker and, while it is open, its card
    const renderAnnotationMarker = (annotation) => {
      const isExpanded = expandedAnnotationId === annotation.id;
      const typeLabel = nameOf(TYPE_LABEL, annotation.type);

      return e('div', {
        key: annotation.id,
        style: { display: 'flex', flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 'var(--sp-2)' }
      },
        e('button', {
          type: 'button',
          className: 'faust-annot-marker' + (isExpanded ? ' is-active' : ''),
          'data-priority': annotation.priority || 'info',
          title: `${typeLabel}: avaa merkintä`,
          'aria-label': `${typeLabel}: avaa merkintä`,
          'aria-expanded': isExpanded,
          onClick: (ev) => handleAnnotationClick(annotation, ev)
        }, icon(AnnotationUtils.getAnnotationIcon(annotation), 14)),
        isExpanded && renderAnnotationCard(annotation, typeLabel)
      );
    };

    // Render annotation group: the markers one under another; several carry their count
    const renderAnnotationGroup = (group) => {
      const { position, annotations: groupAnnotations } = group;
      const isMultiple = groupAnnotations.length > 1;
      const holdsExpanded = groupAnnotations.some(annotation => annotation.id === expandedAnnotationId);

      return e('div', {
        key: `group-${position}`,
        role: isMultiple ? 'group' : undefined,
        'aria-label': isMultiple ? countMerkinta(groupAnnotations.length) : undefined,
        style: {
          position: 'absolute',
          top: `${position}px`,
          right: 0,
          zIndex: holdsExpanded ? 'var(--z-float)' : 'var(--z-raised)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 'var(--sp-1)',
          pointerEvents: 'auto' // Markers and their cards take the pointer; the strip itself does not
        }
      },
        isMultiple && e('span', {
          className: 'faust-chip faust-chip--count',
          title: countMerkinta(groupAnnotations.length)
        }, groupAnnotations.length.toLocaleString('fi-FI')),
        ...groupAnnotations.map(annotation => renderAnnotationMarker(annotation))
      );
    };

    // Render the margin
    return e('div', {
      className: 'faust-annot-margin',
      style: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: '40px',
        height: '100%',
        pointerEvents: 'none', // Allow clicks to pass through to editor
        zIndex: 'var(--z-raised)'
      }
    },
      // Annotation markers (each group takes pointer events itself)
      e('div', {
        style: {
          position: 'relative',
          width: '100%',
          height: '100%'
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

# Annotation System Test Guide

## Overview
Test guide for AI-powered Margin Notes and Annotation system implemented in FAUST.

## Implementation Status

### ✅ Completed Components

1. **src/utils/annotationTypes.js**
   - Annotation type definitions (AI_CONSISTENCY, AI_QUALITY, AI_SUGGESTION, AI_PLOT_THREAD, USER_NOTE, etc.)
   - Priority levels (CRITICAL, HIGH, MEDIUM, LOW, INFO)
   - Color scheme and icon mappings
   - Utility functions for creating and managing annotations

2. **src/components/AnnotationMargin.js**
   - Visual margin component for displaying annotations
   - Scroll-aware positioning system
   - Annotation grouping (overlaps within 30px)
   - Expandable annotation cards with actions
   - Priority-based coloring and icons

3. **src/services/validation/ConsistencyChecker.js**
   - Integration with annotation system
   - `errorToAnnotation()` method converts consistency errors to annotations
   - `mergeAnnotationsIntoProject()` injects annotations into chapters
   - Returns both errors and annotations arrays from `runFullCheck()`

4. **index.html**
   - Script loading order verified
   - annotationTypes.js loaded before AnnotationMargin.js

5. **app.js**
   - Annotation handlers already implemented
   - AnnotationMargin component already integrated
   - editorDimensions tracking already in place

### 🐛 Bug Fixed
- **ConsistencyChecker.js line 171**: Fixed incorrect condition `!annotation.chapterIndex !== undefined` → `annotation.chapterIndex === undefined`

## Testing Procedures

### Test 1: Visual Components Load
**Objective**: Verify annotation components load without errors

**Steps**:
1. Open FAUST application
2. Open browser DevTools (Cmd+Option+I)
3. Check Console for loading messages:
   ```
   [AnnotationUtils] Loaded
   [AnnotationMargin] Component loaded
   ```
4. Verify no JavaScript errors

**Expected Result**: All components load successfully

---

### Test 2: Create Manual Annotation
**Objective**: Test user-created annotations

**Steps**:
1. Open or create a project with some text
2. Select a section of text in the editor
3. Right-click or use annotation button (if available)
4. Create a new annotation

**Expected Result**: Annotation marker appears in the right margin

---

### Test 3: AI-Generated Annotations
**Objective**: Test ConsistencyChecker generates annotations

**Prerequisites**:
- Project with at least 2 characters
- Characters mentioned in multiple chapters
- AI API key configured

**Steps**:
1. Open project with characters
2. Run consistency check (via Tools menu or button)
3. Wait for analysis to complete
4. Check active chapter for annotations

**Testing via DevTools**:
```javascript
// In browser console:

// Check if ConsistencyChecker available
console.log('ConsistencyChecker:', window.ConsistencyChecker);

// Check if AnnotationUtils available
console.log('AnnotationUtils:', window.AnnotationUtils);

// Manually create test annotation (if needed)
const testAnnotation = window.AnnotationUtils.createAnnotation({
  type: window.AnnotationUtils.ANNOTATION_TYPES.AI_CONSISTENCY,
  position: 100,
  length: 50,
  content: 'Test consistency issue',
  priority: window.AnnotationUtils.ANNOTATION_PRIORITY.HIGH,
  aiSuggestion: 'Fix this issue by...',
  source: 'ai'
});
console.log('Test annotation:', testAnnotation);
```

**Expected Results**:
- Annotations created for detected inconsistencies
- Annotations visible in margin
- Clicking annotation expands details
- AI suggestion displayed

---

### Test 4: Annotation Display & Interaction
**Objective**: Verify annotation UI behavior

**Steps**:
1. Ensure chapter has annotations (from Test 3)
2. Scroll through the document
3. Observe annotation markers move with scroll
4. Click on annotation marker
5. Verify expanded card shows:
   - Type badge
   - Content preview
   - AI suggestion (if AI-generated)
   - Priority indicator
   - Action buttons (Resolve, Delete)

**Expected Results**:
- Annotations track scroll position correctly
- Overlapping annotations are grouped
- Expanded view shows all information
- Buttons are functional

---

### Test 5: Annotation Grouping
**Objective**: Test overlapping annotation grouping

**Steps**:
1. Create or generate multiple annotations close together (within 30px vertical distance)
2. Observe how they display in margin

**Expected Results**:
- Annotations within 30px are grouped together
- Group header shows count "X annotations"
- Each annotation expandable independently

---

### Test 6: Annotation Actions
**Objective**: Test resolve and delete actions

**Steps**:
1. Find an AI-generated annotation
2. Click to expand
3. Click "Resolve" button (✓)
4. Verify annotation marked as resolved
5. Click "Delete" button (×)
6. Confirm deletion
7. Verify annotation removed

**Expected Results**:
- Resolve marks annotation as resolved
- Delete removes annotation after confirmation

---

### Test 7: Scroll Performance
**Objective**: Verify smooth scrolling with many annotations

**Steps**:
1. Generate project with many annotations (run consistency check on large book)
2. Scroll rapidly through document
3. Observe annotation rendering

**Expected Results**:
- No lag or stuttering
- Annotations appear/disappear smoothly
- Only visible annotations are rendered

---

### Test 8: Edge Cases
**Objective**: Test boundary conditions

**Test Cases**:
1. Empty chapter (no annotations)
2. Chapter with 1 annotation at start
3. Chapter with 1 annotation at end
4. Very long content with annotations
5. Very short content with annotations

**Expected Results**:
- System handles all edge cases gracefully
- No JavaScript errors
- Positions calculated correctly

---

## Manual DevTools Testing Script

Run this in the browser DevTools console to test annotation system:

```javascript
// Test 1: Check components loaded
console.log('=== ANNOTATION SYSTEM TEST ===');
console.log('AnnotationUtils:', window.AnnotationUtils ? '✓' : '✗');
console.log('AnnotationMargin:', window.AnnotationMargin ? '✓' : '✗');
console.log('ConsistencyChecker:', window.ConsistencyChecker ? '✓' : '✗');

// Test 2: Create test annotations
if (window.AnnotationUtils) {
  const testAnnotations = [
    window.AnnotationUtils.createAnnotation({
      type: window.AnnotationUtils.ANNOTATION_TYPES.AI_CONSISTENCY,
      position: 100,
      length: 50,
      content: 'Character eye color changes from blue to brown',
      priority: window.AnnotationUtils.ANNOTATION_PRIORITY.CRITICAL,
      aiSuggestion: 'Standardize eye color to blue throughout',
      source: 'ai'
    }),
    window.AnnotationUtils.createAnnotation({
      type: window.AnnotationUtils.ANNOTATION_TYPES.AI_SUGGESTION,
      position: 500,
      length: 30,
      content: 'Consider adding more description here',
      priority: window.AnnotationUtils.ANNOTATION_PRIORITY.MEDIUM,
      aiSuggestion: 'Add sensory details to make the scene more vivid',
      source: 'ai'
    }),
    window.AnnotationUtils.createAnnotation({
      type: window.AnnotationUtils.ANNOTATION_TYPES.USER_NOTE,
      position: 800,
      length: 20,
      content: 'Remember to fact-check this date',
      priority: window.AnnotationUtils.ANNOTATION_PRIORITY.HIGH,
      source: 'user'
    })
  ];
  
  console.log('Created test annotations:', testAnnotations);
  
  // Test 3: Check annotation utilities
  testAnnotations.forEach(ann => {
    console.log(`Annotation ${ann.id}:`);
    console.log('  Color:', window.AnnotationUtils.getAnnotationColor(ann));
    console.log('  Icon:', window.AnnotationUtils.getAnnotationIcon(ann));
  });
  
  // Test 4: Test visible annotations filter
  const visible = window.AnnotationUtils.getVisibleAnnotations(testAnnotations, 0, 1000);
  console.log('Visible annotations (0-1000):', visible.length);
}

console.log('=== TEST COMPLETE ===');
```

---

## Common Issues & Solutions

### Issue 1: Annotations not appearing
**Possible Causes**:
- AnnotationUtils not loaded
- Chapter has no annotations array
- editorDimensions not tracking properly

**Solution**:
- Check console for loading messages
- Verify `chapter.annotations` exists
- Check `editorDimensions` state in React DevTools

### Issue 2: Annotations in wrong position
**Possible Causes**:
- Scroll position not tracked correctly
- Content length mismatch
- Position calculation error

**Solution**:
- Verify `editorDimensions.scrollTop` updates
- Check annotation.position vs content.length
- Review `calculateAnnotationTop()` logic

### Issue 3: ConsistencyChecker not generating annotations
**Possible Causes**:
- No consistency errors detected
- AI API not configured
- AnnotationUtils not available when check runs

**Solution**:
- Add test characters with intentional contradictions
- Verify AI API keys in settings
- Check console for errors during consistency check

### Issue 4: Annotations don't persist
**Possible Causes**:
- Project not saved after annotations added
- Annotations not included in save data

**Solution**:
- Ensure annotations are part of chapter object
- Save project after consistency check
- Verify save/load includes annotations array

---

## API Reference

### AnnotationUtils.createAnnotation(options)
```javascript
const annotation = window.AnnotationUtils.createAnnotation({
  type: string,              // ANNOTATION_TYPES enum value
  position: number,          // Character position in content
  length: number,            // Length of annotated text
  content: string,           // Annotation message
  priority: string,          // ANNOTATION_PRIORITY enum value
  color: string,             // Optional custom color
  source: 'ai' | 'user',     // Annotation source
  aiSuggestion: string,      // Optional AI suggestion
  metadata: object           // Optional metadata
});
```

### ConsistencyChecker.runFullCheck()
```javascript
const checker = new ConsistencyChecker(project, electronAPI, callAIWithMode);
const result = await checker.runFullCheck();
// Returns: { success, errors, annotations, summary }
```

### Annotation Object Structure
```javascript
{
  id: string,                // Unique ID
  type: string,              // Annotation type
  position: number,          // Position in content
  length: number,            // Length of annotated span
  content: string,           // Annotation message
  priority: string,          // Priority level
  color: string,             // Display color
  source: 'ai' | 'user',     // Source
  aiSuggestion: string,      // AI suggestion (if any)
  metadata: object,          // Additional data
  resolved: boolean,         // Resolution status
  createdAt: string,         // ISO timestamp
  updatedAt: string          // ISO timestamp
}
```

---

## Success Criteria

✅ **Phase 1 - Component Loading**
- [ ] annotationTypes.js loads without errors
- [ ] AnnotationMargin.js loads without errors
- [ ] ConsistencyChecker integration complete
- [ ] No console errors on startup

✅ **Phase 2 - Visual Display**
- [ ] Annotations visible in margin
- [ ] Correct positioning and colors
- [ ] Icons display correctly
- [ ] Grouping works for overlapping annotations

✅ **Phase 3 - Interaction**
- [ ] Click to expand/collapse annotations
- [ ] Resolve button works
- [ ] Delete button works
- [ ] Scroll tracking works smoothly

✅ **Phase 4 - AI Integration**
- [ ] ConsistencyChecker generates annotations
- [ ] Annotations injected into chapters correctly
- [ ] AI suggestions displayed
- [ ] Priority levels correct

---

## Next Steps (Future Enhancements)

1. **PlotThreadTracker Integration**
   - Add annotation generation from plot thread analysis
   - Track thread continuity issues

2. **Quality Analysis Integration**
   - Integrate with QualityEnhancer for writing quality annotations
   - Show style and grammar suggestions

3. **User Annotation Tools**
   - Add UI for creating manual annotations
   - Text selection → annotation creation
   - Annotation categories (research, revision, fact-check)

4. **Annotation Management**
   - Annotation list/panel view
   - Filter by type, priority, resolved status
   - Batch operations (resolve all, delete all)

5. **Persistence & Sync**
   - Save annotations with project
   - Import/export annotations
   - Annotation history/undo

---

## Contact & Support

For bugs or questions:
- Use `/reportbug` command in Cline chat
- Check console for error messages
- Review this test guide for troubleshooting

---

*Document generated: 2025-10-30*
*Version: 1.0*

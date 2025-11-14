# FAUST src/ - Modular Architecture

**Sprint 2 Phase 1** - ✅ Complete (4h)
**Sprint 2 Phase 2** - ⏸️ Partial (6h - Hooks & Modals done)
**Date:** 2025-11-14
**Status:** 🔄 In Progress - Components & App.js refactoring remaining

---

## 📁 Directory Structure

```
src/
├── components/          # React components (Phase 2)
│   ├── Editor/
│   ├── Sidebar/
│   ├── Inspector/
│   ├── Modals/
│   └── Common/
├── hooks/              # Custom React hooks (Phase 2)
│   ├── useProject.ts
│   ├── useChapters.ts
│   └── useUndoRedo.ts
├── modules/            # ✅ AI and business logic modules
│   └── CharacterGenerator.ts
├── utils/              # ✅ Utility functions
│   ├── fileIO.ts
│   └── validators.ts
└── types/              # ✅ TypeScript type definitions
    └── index.ts
```

---

## ✅ Phase 1 Complete (4h)

### 1. **Modular Architecture Designed**
- Planned component hierarchy
- Defined clear separation of concerns
- Created directory structure

### 2. **TypeScript Infrastructure**
- ✅ Created `src/types/index.ts` with 40+ interfaces
- ✅ Updated `tsconfig.json` to include src/
- ✅ Updated `webpack.config.js` with TypeScript support:
  - ts-loader for .ts/.tsx files
  - Path aliases (@components, @modules, @hooks, @utils, @types)
  - Source maps for development
  - Performance hints

### 3. **Extracted Modules**

#### `src/modules/CharacterGenerator.ts` ✅
- 4-layer character generation system
- Full TypeScript conversion
- Type-safe interfaces
- 350+ lines extracted from app.js

#### `src/utils/fileIO.ts` ✅
- Project save/load operations
- Backup management
- Type-safe Electron API wrappers
- Error handling

#### `src/utils/validators.ts` ✅
- Project/Chapter/Character validation
- Text sanitization
- API key validation
- Email validation
- Type guards

---

## ✅ Phase 2 Partial Complete (6h)

### What's Done:

#### 1. **Base Modal Component** ✅
`src/components/Modals/Modal.tsx`
- Reusable modal with overlay
- ESC key handling (via parent)
- Click-outside-to-close
- Customizable max width
- Consistent FAUST styling

#### 2. **Modal Components** (1/5 done)
- ✅ `AnnotationDetail.tsx` - Full implementation with delete functionality
- ⏸️ CharacterSheet, LocationSheet, ThreadSheet, Settings (deferred)

#### 3. **Custom Hooks** ✅✅

**useProject.ts** (200+ lines)
- Complete project state management
- Chapter CRUD: add, update, delete, reorder
- Character CRUD operations
- Location CRUD operations
- Plot thread CRUD operations
- Save/autosave/load with validation
- Active chapter tracking
- Total word count calculation
- Full TypeScript types

**useUndoRedo.ts** (150+ lines)
- Command pattern implementation
- Configurable history size (default 50)
- execute(), undo(), redo() operations
- Helper functions:
  - `createStateUpdateCommand()`
  - `createTextEditCommand()`
- History tracking & navigation
- canUndo/canRedo state

#### 4. **Index Files for Easy Imports** ✅
- `src/components/Modals/index.ts`
- `src/hooks/index.ts`
- `src/modules/index.ts`
- `src/utils/index.ts`

### Usage Examples:

**Using useProject:**
```typescript
import { useProject } from '@hooks';

function App() {
  const {
    project,
    activeChapter,
    addChapter,
    updateChapter,
    saveProject,
    totalWordCount
  } = useProject();

  // Add a chapter
  const chapterId = addChapter('Chapter 1');

  // Update chapter content
  updateChapter(chapterId, {
    content: 'New content',
    wordCount: 150
  });

  // Save project
  await saveProject();
}
```

**Using useUndoRedo:**
```typescript
import { useUndoRedo, createTextEditCommand } from '@hooks';

function Editor() {
  const { execute, undo, redo, canUndo, canRedo } = useUndoRedo({ maxHistorySize: 100 });

  const handleEdit = (oldText: string, newText: string) => {
    const command = createTextEditCommand(
      oldText,
      newText,
      (text) => setContent(text),
      'Edit chapter content'
    );
    execute(command);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.metaKey && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [undo, redo]);
}
```

**Using Modal Components:**
```typescript
import { AnnotationDetail } from '@components/Modals';

function Editor() {
  const [showModal, setShowModal] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState(null);

  return (
    <AnnotationDetail
      isOpen={showModal}
      annotation={selectedAnnotation}
      onClose={() => setShowModal(false)}
      onDelete={(id) => {
        handleDeleteAnnotation(id);
        setShowModal(false);
      }}
    />
  );
}
```

---

## 🔄 Phase 2 Remaining (10-15h)

### Still To Do:

1. **Extract More Modal Components** (4-6h)
   - CharacterSheet (complex, 4-layer system)
   - LocationSheet
   - ThreadSheet
   - Settings modal
   - Project Settings modal

2. **Extract Editor Components** (3-5h)
   - EditorToolbar
   - EditorStatusBar
   - EditorContent wrapper

3. **Extract Sidebar Components** (2-3h)
   - Sidebar container
   - ChapterList
   - ChapterItem

4. **Extract Inspector Components** (3-4h)
   - Inspector container
   - EditorTab
   - ChapterTab
   - ProjectTab
   - AITab

5. **Refactor App.js** (5-8h)
   - Import and integrate all extracted components
   - Use useProject hook
   - Use useUndoRedo hook
   - Remove extracted code
   - Target: 10,872 lines → ~500 lines

6. **TypeScript Migration** (Optional, 2-3h)
   - Convert remaining .js files to .tsx
   - Add strict type checking
   - Fix any type errors

---

## 📋 Installation Requirements

Before Phase 2, install required dependencies:

```bash
npm install --save-dev ts-loader typescript @types/react @types/react-dom
```

---

## 🎯 Benefits

### Current State (Phase 1):
- ✅ TypeScript infrastructure ready
- ✅ Modular architecture defined
- ✅ First modules extracted and typed
- ✅ Utilities separated and reusable
- ✅ Webpack configured for TypeScript

### After Phase 2:
- 🎯 app.js reduced by 95% (from 10,872 → ~500 lines)
- 🎯 All components reusable and testable
- 🎯 Full TypeScript type safety
- 🎯 Better IDE autocomplete
- 🎯 Easier onboarding for new developers
- 🎯 Faster development velocity

---

## 🧪 Testing Strategy (Phase 3)

After refactoring, add comprehensive tests:

1. **Unit Tests** (Jest)
   - Test utilities (validators, fileIO)
   - Test modules (CharacterGenerator)
   - Test hooks in isolation

2. **Component Tests** (React Testing Library)
   - Test modal interactions
   - Test editor functionality
   - Test sidebar operations

3. **Integration Tests**
   - Test complete user flows
   - Test save/load operations
   - Test AI generation workflows

---

## 📝 Migration Guide

### How to use extracted modules:

**Before (app.js):**
```javascript
class CharacterGenerator {
  // 350+ lines of code...
}
```

**After (anywhere in codebase):**
```typescript
import CharacterGenerator from '@modules/CharacterGenerator';

const generator = new CharacterGenerator();
generator.setStoryContext('sci-fi', 'AI awakening');
const result = await generator.generateCharacter({
  name: 'Ada',
  role: 'protagonist'
});
```

### How to use utilities:

```typescript
import { validateProject, sanitizeText } from '@utils/validators';
import { saveProject, loadProject } from '@utils/fileIO';

// Validation
if (validateProject(data)) {
  // Save
  const result = await saveProject(data);
}

// Text sanitization
const clean = sanitizeText(userInput);
```

---

## 🚀 Next Session Tasks

1. Start Phase 2
2. Extract modal components first (easiest win)
3. Create useProject hook
4. Test each extraction incrementally
5. Ensure app still builds and runs after each change

---

**Remember:** This is a LARGE refactoring. Take it step by step, test frequently, and commit often!

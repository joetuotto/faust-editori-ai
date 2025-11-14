# FAUST src/ - Modular Architecture

**Sprint 2 Phase 1** - Foundation Complete
**Date:** 2025-11-14
**Status:** ✅ Ready for Phase 2

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

## 🔄 Phase 2 (Pending - 15-25h)

### Next Steps:

1. **Extract React Components** (10-15h)
   - Create base component structure
   - Extract modals (CharacterSheet, LocationSheet, Settings, etc.)
   - Extract Inspector tabs
   - Extract Editor components
   - Extract Sidebar components

2. **Create Custom Hooks** (3-5h)
   - `useProject.ts` - Project state management
   - `useChapters.ts` - Chapter CRUD operations
   - `useCharacters.ts` - Character management
   - `useUndoRedo.ts` - Command pattern for undo/redo
   - `useKeyboardShortcuts.ts` - Keyboard handling
   - `useAutosave.ts` - Debounced autosave

3. **Refactor App.js** (5-8h)
   - Import and use extracted components
   - Import and use hooks
   - Remove extracted code
   - Simplify main App component
   - Target: Reduce app.js from 10,872 → ~500 lines

4. **TypeScript Migration** (3-5h)
   - Convert components to .tsx
   - Add proper type annotations
   - Enable strict mode
   - Fix type errors

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

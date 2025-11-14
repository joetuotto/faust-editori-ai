# Modal Components Implementation Guide

## Overview
Created separate, reusable modal components for Character, Location, Thread, and Chapter management per DEVELOPMENT_ROADMAP.md requirements.

## Created Files

### 1. `src/utils/constants.js`
Centralized application constants (ROADMAP:271):
- `GENRE_OPTIONS` - Story genre types
- `LOCATION_TYPES` - Location categories
- `LOCATION_ATMOSPHERES` - Atmospheric descriptions
- `LOCATION_IMPORTANCE` - Importance levels
- `THREAD_TYPES` - Plot thread categories
- `THREAD_STATUS` - Thread completion states
- `THREAD_PRIORITY` - Priority levels
- `CHAPTER_STATUS` - Chapter completion states
- `GENDER_OPTIONS` - Character gender options
- `POV_TYPES` - Point of view types
- `VALIDATION_RULES` - Form validation constraints

### 2. `src/components/Modals/CharacterSheetModal.js`
Full character form (ROADMAP:35):
- **Bio Section**: name*, age, gender, appearance
- **Personality**: traits, motivations, fears (dynamic add/remove)
- **Character Arc**: beginning, development, end
- **Modes**: create, edit, view
- **Validation**: Required fields, length limits
- **Features**: Tag-based UI for dynamic lists

### 3. `src/components/Modals/LocationSheetModal.js`
Full location form (ROADMAP:73):
- **Basic Info**: name*, type, atmosphere, importance, description
- **Associated Characters**: Dynamic list with tags
- **Historical Context**: Backstory and significance
- **Sensory Details**: visual, auditory, olfactory, tactile
- **Symbolic Meaning**: Thematic significance
- **Notes**: Free-form text
- **Modes**: create, edit, view
- **Validation**: Required fields, length limits

### 4. `src/components/Modals/ThreadSheetModal.js`
Full thread form (ROADMAP:93):
- **Basic Info**: name*, type, status, priority, description
- **Related Characters**: Dynamic list with tags
- **Related Locations**: Dynamic list with tags
- **Key Events**: Dynamic list with tags
- **Resolution**: How the thread resolves
- **Notes**: Free-form text
- **Modes**: create, edit, view
- **Validation**: Required fields, length limits

### 5. `src/components/Modals/ChapterSheetModal.js`
Full chapter form (ROADMAP:117):
- **Basic Info**: title*, number, status, POV, location
- **Word Count**: target and actual (auto-calculated)
- **Synopsis**: Chapter summary
- **Key Scenes**: Dynamic list with tags
- **Plot Details**: goals, conflicts, outcome
- **Emotional Arc**: Character emotional journey
- **Notes**: Free-form text
- **Modes**: create, edit, view
- **Validation**: Required fields, length limits, numeric validation

### 6. `src/components/Modals/index.js`
Export file for easy imports

## Component API

All modals follow the same pattern:

```javascript
<ModalComponent
  isOpen={boolean}           // Control modal visibility
  onClose={function}         // Called when modal closes
  item={object|null}         // Data to edit (null for create)
  items={array}              // All items of this type
  onSave={function}          // Called with saved data
  mode={'create'|'edit'|'view'} // Operation mode
/>
```

## Integration into app.js

### Step 1: Import Constants and Modals
Add to the top of app.js after React imports:

```javascript
import {
  GENRE_OPTIONS,
  LOCATION_TYPES,
  LOCATION_ATMOSPHERES,
  LOCATION_IMPORTANCE,
  THREAD_TYPES,
  THREAD_STATUS,
  THREAD_PRIORITY,
  CHAPTER_STATUS,
  GENDER_OPTIONS,
  POV_TYPES,
  VALIDATION_RULES
} from './utils/constants.js';

import {
  CharacterSheetModal,
  LocationSheetModal,
  ThreadSheetModal,
  ChapterSheetModal
} from './components/Modals/index.js';
```

### Step 2: Replace Hardcoded Constants
Replace hardcoded genre options (around line 9742) with:
```javascript
const genres = GENRE_OPTIONS;
```

### Step 3: Replace Existing Modals
Replace the existing modal implementations at:
- Line 10005: CharacterSheet → Use `<CharacterSheetModal />`
- Line 10272: LocationSheet → Use `<LocationSheetModal />`
- Line 10342: ThreadSheet → Use `<ThreadSheetModal />`
- Add new: ChapterSheet → Use `<ChapterSheetModal />`

### Step 4: Update Modal State Management
Example for Character modal:

```javascript
// State
const [characterModalState, setCharacterModalState] = useState({
  isOpen: false,
  character: null,
  mode: 'create' // 'create', 'edit', 'view'
});

// Open handlers
const openCharacterModal = (mode, character = null) => {
  setCharacterModalState({
    isOpen: true,
    character,
    mode
  });
};

// Close handler
const closeCharacterModal = () => {
  setCharacterModalState({
    isOpen: false,
    character: null,
    mode: 'create'
  });
};

// Save handler
const saveCharacter = (characterData) => {
  // Update state with new/modified character
  if (characterModalState.mode === 'create') {
    setCharacters([...characters, characterData]);
  } else {
    setCharacters(characters.map(c => 
      c.id === characterData.id ? characterData : c
    ));
  }
};

// In render
<CharacterSheetModal
  isOpen={characterModalState.isOpen}
  onClose={closeCharacterModal}
  character={characterModalState.character}
  characters={characters}
  onSave={saveCharacter}
  mode={characterModalState.mode}
/>
```

## Validation Rules

All modals implement validation per ROADMAP:156:

- **Required fields**: Marked with * in labels
- **Length limits**: Applied per VALIDATION_RULES
- **Type validation**: Numeric fields check for valid numbers
- **Real-time feedback**: Errors clear as user types
- **Error messages**: Finnish language, clear and helpful
- **Submit blocking**: Form won't submit with validation errors

## Features

### Dynamic Tag System
Used for:
- Character traits, motivations, fears
- Location associated characters
- Thread related characters, locations, events
- Chapter key scenes

**User Experience**:
- Type and press Enter to add
- Click button to add
- Click × to remove
- Duplicate prevention
- Empty state messages

### Mode System
Three modes for each modal:
1. **Create**: Empty form, save creates new item
2. **Edit**: Pre-filled form, save updates existing item
3. **View**: Read-only display, no save button

### Form Layout
- **form-section**: Logical grouping with headers
- **form-row**: Horizontal layout for related fields
- **form-group**: Individual field containers
- **error-message**: Validation feedback
- **empty-state**: Friendly messages for empty lists

## Styling Requirements

These CSS classes are used by the modals:

```css
/* Modal structure */
.modal-overlay
.modal-content
.modal-large
.modal-header
.modal-body
.modal-footer
.modal-close

/* Form structure */
.form-section
.form-row
.form-group
.form-hint

/* Tags */
.tag-input-container
.tags-container
.tag
.tag-remove

/* States */
.error
.error-message
.empty-state

/* Buttons */
.btn-primary
.btn-secondary
```

Ensure these classes exist in your CSS files (faust-theme.css, faust-layout-robust.css).

## Testing Checklist

- [ ] All modals open and close correctly
- [ ] Create mode starts with empty form
- [ ] Edit mode pre-fills data correctly
- [ ] View mode disables all inputs
- [ ] Validation errors display correctly
- [ ] Required fields prevent submission
- [ ] Tag system adds/removes items
- [ ] Forms submit and save data

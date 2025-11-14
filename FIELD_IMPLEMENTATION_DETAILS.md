# FIELD & FORM IMPLEMENTATION - TECHNICAL REFERENCE

## ABSOLUTE FILE PATHS

All form implementations:

1. `/home/user/faust-editori-ai/src/components/Modals/CharacterSheetModal.js` (949 lines, 36,900 bytes)
2. `/home/user/faust-editori-ai/src/components/Modals/ChapterSheetModal.js` (1,105 lines, 36,400 bytes)
3. `/home/user/faust-editori-ai/src/components/Modals/LocationSheetModal.js` (1,005 lines, 34,038 bytes)
4. `/home/user/faust-editori-ai/src/components/Modals/ThreadSheetModal.js` (600+ lines, 32,632 bytes)
5. `/home/user/faust-editori-ai/app.js` (10,872 lines - inline forms scattered throughout)

---

## SPECIFIC BUGS WITH LINE NUMBERS

### BUG #1: ChapterSheetModal Number Field Type Mismatch
**File:** `/home/user/faust-editori-ai/src/components/Modals/ChapterSheetModal.js`
**Line:** 367
**Severity:** HIGH
**Type:** Input validation bypassed

**Current Code:**
```javascript
e('input', {
  type: 'text',              // ← BUG: Should be 'number'
  value: formData.number,
  onChange: (ev) => handleInputChange('number', ev.target.value),
  disabled: isViewMode,
  placeholder: '1',
  style: { ... }
})
```

**Validation Code (Line 85-87):**
```javascript
if (formData.number && isNaN(formData.number)) {
  newErrors.number = 'Luvun numeron on oltava numero';
}
```

**Impact:** User can type "abc123" and it won't be caught until form submission

**Fix Required:** Change type to "number" or add regex validation

---

### BUG #2: ChapterSheetModal Word Count Target Text Input
**File:** `/home/user/faust-editori-ai/src/components/Modals/ChapterSheetModal.js`
**Line:** 564
**Severity:** HIGH
**Type:** Inconsistent field type

**Current Code:**
```javascript
e('input', {
  type: 'text',                           // ← BUG: Should be 'number'
  value: formData.wordCountTarget,
  onChange: (ev) => handleInputChange('wordCountTarget', ev.target.value),
  disabled: isViewMode,
  placeholder: '3000',
  style: { ... }
})
```

**Validation (Line 100-102):**
```javascript
if (formData.wordCountTarget && isNaN(formData.wordCountTarget)) {
  newErrors.wordCountTarget = 'Sanamäärätavoitteen on oltava numero';
}
```

**Impact:** Same as BUG #1

---

### BUG #3: CharacterSheetModal Missing Gender Validation
**File:** `/home/user/faust-editori-ai/src/components/Modals/CharacterSheetModal.js`
**Line:** 68-90 (validateForm function)
**Severity:** MEDIUM
**Type:** Missing enum validation

**Current Code:**
```javascript
const validateForm = () => {
  const newErrors = {};
  
  if (!formData.name.trim()) {
    newErrors.name = 'Nimi on pakollinen';
  } else if (formData.name.length > 100) {
    newErrors.name = 'Nimi on liian pitkä (max 100 merkkiä)';
  }
  
  if (formData.age && (isNaN(formData.age) || formData.age < 0 || formData.age > 200)) {
    newErrors.age = 'Anna kelvollinen ikä (0-200)';
  }
  
  if (formData.appearance.length > 5000) {
    newErrors.appearance = 'Ulkonäkökuvaus on liian pitkä (max 5000 merkkiä)';
  }
  
  // ← NO VALIDATION for gender field (line 381)
  // ← NO VALIDATION for arc object (lines 768-856)
  
  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};
```

**Gender Field (Line 380-400):**
```javascript
e('select', {
  value: formData.gender,
  onChange: (ev) => setFormData({ ...formData, gender: ev.target.value }),
  disabled: isViewMode,
  style: { ... }
},
  e('option', { value: '' }, '— Valitse —'),
  e('option', { value: 'male' }, 'Mies'),
  e('option', { value: 'female' }, 'Nainen'),
  e('option', { value: 'non-binary' }, 'Muu'),
  e('option', { value: 'other' }, 'Muu')
)
```

**Missing Validation:**
- No check that gender is one of valid options
- No check that arc fields aren't all empty

---

### BUG #4: AllModals Missing Select Field Validation
**Files:** All 4 modal files
**Locations:**
- CharacterSheetModal.js: Line 380 (gender select)
- ChapterSheetModal.js: Line 404 (status), Line 484 (povType)
- LocationSheetModal.js: Line 363 (type), Line 395 (atmosphere), Line 427 (importance)
- ThreadSheetModal.js: Multiple select fields

**Severity:** MEDIUM
**Type:** Enum validation missing

**No validation checks that select values are in allowed arrays:**

```javascript
// VALID VALUES DEFINED (LineXX)
const CHAPTER_STATUS = ['Suunniteltu', 'Keskeneräinen', 'Valmis'];
const POV_TYPES = ['Ensimmäinen persoona', 'Kolmas persoona', 'Toiseen persoonaan'];

// BUT validateForm() NEVER CHECKS THEM
const validateForm = () => {
  const newErrors = {};
  // status and povType NOT validated
  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};
```

---

### BUG #5: LocationSheetModal Error Key Format Issue
**File:** `/home/user/faust-editori-ai/src/components/Modals/LocationSheetModal.js`
**Lines:** 172, 686, 725, 764, 803
**Severity:** LOW
**Type:** Potential nested error key display issue

**Problem Code:**
```javascript
const handleSensoryChange = (sense, value) => {
  setFormData(prev => ({
    ...prev,
    sensoryDetails: { ...prev.sensoryDetails, [sense]: value }
  }));
  const errorKey = `sensoryDetails.${sense}`;  // ← Dot notation key
  if (errors[errorKey]) {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[errorKey];
      return newErrors;
    });
  }
};

// Error display (lines 694-701)
errors['sensoryDetails.visual'] && e('div', {
  style: { ... }
}, errors['sensoryDetails.visual'])
```

**Issue:** Using dot notation for nested keys works but is unconventional. Should use underscore or nested structure.

---

## DUPLICATE CODE LOCATIONS

### Duplicate #1: Add Item to Array Pattern (9 implementations)

**CharacterSheetModal.js - addTrait (Line 123-131):**
```javascript
const addTrait = () => {
  if (currentTrait.trim() && !formData.traits.includes(currentTrait.trim())) {
    setFormData({ ...formData, traits: [...formData.traits, currentTrait.trim()] });
    setCurrentTrait('');
  }
};
```

**CharacterSheetModal.js - addMotivation (Line 142-150):**
```javascript
const addMotivation = () => {
  if (currentMotivation.trim() && !formData.motivations.includes(currentMotivation.trim())) {
    setFormData({ ...formData, motivations: [...formData.motivations, currentMotivation.trim()] });
    setCurrentMotivation('');
  }
};
```

**CharacterSheetModal.js - addFear (Line 161-169):**
```javascript
const addFear = () => {
  if (currentFear.trim() && !formData.fears.includes(currentFear.trim())) {
    setFormData({ ...formData, fears: [...formData.fears, currentFear.trim()] });
    setCurrentFear('');
  }
};
```

**ChapterSheetModal.js - addScene (Line 185-193):**
```javascript
const addScene = () => {
  if (sceneInput.trim() && !formData.keyScenes.includes(sceneInput.trim())) {
    setFormData(prev => ({
      ...prev,
      keyScenes: [...prev.keyScenes, sceneInput.trim()]
    }));
    setSceneInput('');
  }
};
```

**LocationSheetModal.js - addCharacter (Line 182-190):**
```javascript
const addCharacter = () => {
  if (characterInput.trim() && !formData.associatedCharacters.includes(characterInput.trim())) {
    setFormData(prev => ({
      ...prev,
      associatedCharacters: [...prev.associatedCharacters, characterInput.trim()]
    }));
    setCharacterInput('');
  }
};
```

**ThreadSheetModal.js - addCharacter (Line 143-151):**
```javascript
const addCharacter = () => {
  if (characterInput.trim() && !formData.relatedCharacters.includes(characterInput.trim())) {
    setFormData(prev => ({
      ...prev,
      relatedCharacters: [...prev.relatedCharacters, characterInput.trim()]
    }));
    setCharacterInput('');
  }
};
```

**ThreadSheetModal.js - addLocation (Line 160-168):**
```javascript
const addLocation = () => {
  if (locationInput.trim() && !formData.relatedLocations.includes(locationInput.trim())) {
    setFormData(prev => ({
      ...prev,
      relatedLocations: [...prev.relatedLocations, locationInput.trim()]
    }));
    setLocationInput('');
  }
};
```

**ThreadSheetModal.js - addEvent (Line 177-185):**
```javascript
const addEvent = () => {
  if (eventInput.trim() && !formData.keyEvents.includes(eventInput.trim())) {
    setFormData(prev => ({
      ...prev,
      keyEvents: [...prev.keyEvents, eventInput.trim()]
    }));
    setEventInput('');
  }
};
```

**Count:** 9 identical implementations

---

### Duplicate #2: Remove Item from Array Pattern (6 implementations)

**CharacterSheetModal.js - removeTrait (Line 134-139):**
```javascript
const removeTrait = (trait) => {
  setFormData({
    ...formData,
    traits: formData.traits.filter(t => t !== trait)
  });
};
```

**CharacterSheetModal.js - removeMotivation (Line 153-158):**
```javascript
const removeMotivation = (motivation) => {
  setFormData({
    ...formData,
    motivations: formData.motivations.filter(m => m !== motivation)
  });
};
```

**CharacterSheetModal.js - removeFear (Line 172-177):**
```javascript
const removeFear = (fear) => {
  setFormData({
    ...formData,
    fears: formData.fears.filter(f => f !== fear)
  });
};
```

**ChapterSheetModal.js - removeScene (Line 195-200):**
```javascript
const removeScene = (scene) => {
  setFormData(prev => ({
    ...prev,
    keyScenes: prev.keyScenes.filter(s => s !== scene)
  }));
};
```

**LocationSheetModal.js - removeCharacter (Line 192-197):**
```javascript
const removeCharacter = (character) => {
  setFormData(prev => ({
    ...prev,
    associatedCharacters: prev.associatedCharacters.filter(c => c !== character)
  }));
};
```

**ThreadSheetModal.js & Similar:** 3 more implementations

**Count:** 9+ identical implementations

---

## INCONSISTENT ERROR HANDLING

### Inconsistency #1: Error Auto-Clearing

**CharacterSheetModal.js (Lines 293-318):**
```javascript
// NO error clearing on input change
e('input', {
  type: 'text',
  value: formData.name,
  onChange: (ev) => setFormData({ ...formData, name: ev.target.value }),
  // ← Errors persist until resubmit
  disabled: isViewMode,
  placeholder: 'Esim. Maria Virtanen',
  style: {
    border: errors.name ? '2px solid #ff4444' : '1px solid var(--border-color)',
    // ← Error styling stays until resubmit
  }
})
```

**ChapterSheetModal.js (Lines 171-183):**
```javascript
// WITH error clearing on input change
const handleInputChange = (field, value) => {
  setFormData(prev => ({
    ...prev,
    [field]: value
  }));
  if (errors[field]) {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];  // ← Auto-clear on edit
      return newErrors;
    });
  }
};
```

**LocationSheetModal.js (Lines 150-162):**
```javascript
// WITH error clearing on input change (identical to ChapterSheetModal)
const handleInputChange = (field, value) => {
  setFormData(prev => ({
    ...prev,
    [field]: value
  }));
  if (errors[field]) {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];  // ← Auto-clear on edit
      return newErrors;
    });
  }
};
```

---

### Inconsistency #2: Form State Mutation Pattern

**CharacterSheetModal (SPREAD OPERATOR):**
Lines 296, 125, 135, 145, 155, 165, 175
```javascript
onChange: (ev) => setFormData({ ...formData, name: ev.target.value })
```

**ChapterSheetModal & LocationSheetModal (FUNCTIONAL UPDATE):**
```javascript
const handleInputChange = (field, value) => {
  setFormData(prev => ({ ...prev, [field]: value }));
  // ← Uses functional update
};
```

---

## INPUT FIELD TYPE ANALYSIS

### Textarea Fields (8 total)

**CharacterSheetModal (2):**
- Line 415: Appearance (4 rows)
- Line 768-788: Arc beginning
- Line 802-822: Arc development
- Line 836-856: Arc end

**ChapterSheetModal (5):**
- Line 648-674: Synopsis (4 rows)
- Line 815-841: Goals (3 rows)
- Line 854-880: Conflicts (3 rows)
- Line 893-919: Outcome (3 rows)
- Line 941-967: Emotional arc (3 rows)
- Line 988-1014: Notes (3 rows)

**LocationSheetModal (5):**
- Line 460-486: Description (4 rows)
- Line 618-644: Historical context (4 rows)
- Lines 676-702: Visual sensory (2 rows)
- Lines 715-741: Auditory sensory (2 rows)
- Lines 754-780: Olfactory sensory (2 rows)
- Lines 793-819: Tactile sensory (2 rows)
- Lines 841-867: Symbolic meaning (3 rows)
- Lines 888-914: Notes (3 rows)

**ThreadSheetModal & app.js:** Additional textareas

---

### Select Fields (10+ total)

**CharacterSheetModal:**
- Line 380: gender (male, female, non-binary, other)

**ChapterSheetModal:**
- Line 404: status (Suunniteltu, Keskeneräinen, Valmis)
- Line 484: povType (Ensimmäinen persoona, Kolmas persoona, Toiseen persoonaan)

**LocationSheetModal:**
- Line 363: type (Kaupunki, Luonto, Sisätila, Muu)
- Line 395: atmosphere (Rauhallinen, Jännittävä, Synkkä, Valoisa)
- Line 427: importance (Tärkeä, Keskitärkeä, Vähäinen)

**ThreadSheetModal:**
- type, status, priority dropdowns

**app.js:**
- Line 5628: Font selector (editorFont)
- Line 5680: Line spacing (lineSpacing)
- Line 5705: Editor zoom (editorZoom)
- Multiple provider selectors in settings

---

### Checkbox Fields (10+ total)

**app.js Find & Replace (Lines 5295-5327):**
- caseSensitive (line 5299)
- matchWholeWord (line 5307)
- useRegex (line 5315)
- searchInAllChapters (line 5323)

**Settings Panels:**
- Various toggles for AI features, formatting options

---

## VALIDATION RULES CONSTANTS

### ChapterSheetModal (Lines 14-18)
```javascript
const CHAPTER_STATUS = window.CONSTANTS?.CHAPTER_STATUS || 
  ['Suunniteltu', 'Keskeneräinen', 'Valmis'];
const POV_TYPES = window.CONSTANTS?.POV_TYPES || 
  ['Ensimmäinen persoona', 'Kolmas persoona', 'Toiseen persoonaan'];
const VALIDATION_RULES = window.CONSTANTS?.VALIDATION_RULES || {
  DESCRIPTION_MAX_LENGTH: 5000
};
```

### LocationSheetModal (Lines 14-20)
```javascript
const LOCATION_TYPES = window.CONSTANTS?.LOCATION_TYPES || 
  ['Kaupunki', 'Luonto', 'Sisätila', 'Muu'];
const LOCATION_ATMOSPHERES = window.CONSTANTS?.LOCATION_ATMOSPHERES || 
  ['Rauhallinen', 'Jännittävä', 'Synkkä', 'Valoisa'];
const LOCATION_IMPORTANCE = window.CONSTANTS?.LOCATION_IMPORTANCE || 
  ['Tärkeä', 'Keskitärkeä', 'Vähäinen'];
const VALIDATION_RULES = window.CONSTANTS?.VALIDATION_RULES || {
  LOCATION_NAME_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 5000
};
```

### ThreadSheetModal (Lines 14-19)
```javascript
const THREAD_TYPES = window.CONSTANTS?.THREAD_TYPES || 
  ['Pääjuoni', 'Sivujuoni', 'Hahmon kehitys'];
const THREAD_STATUS = window.CONSTANTS?.THREAD_STATUS || 
  ['Aktiivinen', 'Odottaa', 'Ratkaistu'];
const THREAD_PRIORITY = window.CONSTANTS?.THREAD_PRIORITY || 
  ['Korkea', 'Keskitaso', 'Matala'];
```

---

## STATE INITIALIZATION PATTERNS

### CharacterSheetModal Initial State (Lines 24-38)
```javascript
const [formData, setFormData] = useState({
  name: '',
  age: '',
  gender: '',
  appearance: '',
  traits: [],
  motivations: [],
  fears: [],
  relationships: [],
  arc: {
    beginning: '',
    development: '',
    end: ''
  }
});
```

### ChapterSheetModal Initial State (Lines 30-46)
```javascript
const [formData, setFormData] = useState({
  title: '',
  number: '',
  status: CHAPTER_STATUS[0],
  pov: '',
  povType: POV_TYPES[0],
  location: '',
  wordCountTarget: '',
  actualWordCount: 0,
  synopsis: '',
  keyScenes: [],
  goals: '',
  conflicts: '',
  outcome: '',
  emotionalArc: '',
  notes: ''
});
```

### LocationSheetModal Initial State (Lines 32-48)
```javascript
const [formData, setFormData] = useState({
  name: '',
  type: LOCATION_TYPES[0],
  description: '',
  atmosphere: LOCATION_ATMOSPHERES[0],
  importance: LOCATION_IMPORTANCE[0],
  associatedCharacters: [],
  historicalContext: '',
  sensoryDetails: {
    visual: '',
    auditory: '',
    olfactory: '',
    tactile: ''
  },
  symbolicMeaning: '',
  notes: ''
});
```

---

## ARRAY FIELD MANAGEMENT

### Add/Remove Pattern Usage

**Fields using add/remove pattern:**
1. CharacterSheetModal: traits, motivations, fears
2. ChapterSheetModal: keyScenes
3. LocationSheetModal: associatedCharacters
4. ThreadSheetModal: relatedCharacters, relatedLocations, keyEvents

**HTML Input for array items (CharacterSheetModal Line 475-511):**
```javascript
!isViewMode && e('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } },
  e('input', {
    type: 'text',
    value: currentTrait,
    onChange: (ev) => setCurrentTrait(ev.target.value),
    onKeyPress: (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        addTrait();
      }
    },
    placeholder: 'Esim. Rohkea, Sarkastinen...',
    style: { ... }
  }),
  e('button', {
    type: 'button',
    onClick: addTrait,
    style: { ... }
  }, 'Lisää')
)
```

**Array display (CharacterSheetModal Line 520-552):**
```javascript
e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } },
  formData.traits.map(trait =>
    e('div', {
      key: trait,
      style: { padding: '6px 12px', background: 'var(--bronze)', ... }
    },
      e('span', null, trait),
      !isViewMode && e('button', {
        type: 'button',
        onClick: () => removeTrait(trait),
        style: { ... }
      }, '×')
    )
  )
)
```


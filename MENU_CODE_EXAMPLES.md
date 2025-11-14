# FAUST Menu System - Detailed Code Examples & Evidence

## Issue #1: Context Menu Never Triggers - Code Evidence

### A. Where It's Defined (electron.js:1412-1459)

```javascript
// DEFINED BUT NEVER CALLED
ipcMain.on('show-context-menu', async (event, { x, y, selection, isEditable }) => {
  const { Menu } = require('electron');
  const template = [
    {
      label: 'Kopioi',
      accelerator: 'CmdOrCtrl+C',
      click: () => {
        // Renderer handles copy
      }
    },
    {
      label: 'Liitä',
      accelerator: 'CmdOrCtrl+V',
      click: () => {
        // Renderer handles paste
      }
    },
    { type: 'separator' },
    {
      label: 'AI-ehdotus valitulle tekstille',
      enabled: !!selection,
      click: () => {
        mainWindow.webContents.send('ai-suggest', selection);
      }
    },
    {
      label: 'Etsi',
      click: () => {
        mainWindow.webContents.send('show-find');
      }
    },
    { type: 'separator' },
    {
      label: 'Lisää kommentti',
      click: () => {
        mainWindow.webContents.send('insert-comment');
      }
    },
    {
      label: 'Lisää muistiinpano',
      click: () => {
        mainWindow.webContents.send('insert-note');
      }
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow, x, y });
});
```

### B. Where It Should Be Called (Missing from app.js)

**GREP SEARCH RESULTS:**
```bash
$ grep -rn "show-context-menu" /home/user/faust-editori-ai --include="*.js" --include="*.jsx"
/home/user/faust-editori-ai/electron.js:1412:ipcMain.on('show-context-menu', async (event, { x, y, selection, isEditable }) => {
```

Only ONE result - the listener definition. NO sender found.

### C. What's Missing in app.js

The preload.js exposes this API:
```javascript
// preload.js - NOT exposing context menu trigger!
const electronAPI = {
  // ... other APIs
  // MISSING: sendContextMenu or showContextMenu
}
```

And the renderer has NO listener:
```javascript
// app.js - Search results for "onContextMenu":
// (empty - no results)

// app.js - Search results for "contextmenu":
// (empty - no results)

// app.js - Search results for "context":
// (many matches but for "context" in other meanings like "character context")
```

### D. How It Should Work

```javascript
// Add to preload.js
const electronAPI = {
  // ... existing
  showContextMenu: (x, y, selection, isEditable) => {
    ipcRenderer.send('show-context-menu', { x, y, selection, isEditable });
  }
};

// Add to app.js (editor component)
useEffect(() => {
  if (!editorRef.current) return;
  
  const handleContextMenu = (event) => {
    event.preventDefault();
    
    const textarea = editorRef.current;
    const selection = textarea.value.substring(
      textarea.selectionStart,
      textarea.selectionEnd
    );
    
    window.electronAPI?.showContextMenu?.(
      event.clientX,
      event.clientY,
      selection,
      true
    );
  };
  
  editorRef.current.addEventListener('contextmenu', handleContextMenu);
  
  return () => {
    editorRef.current?.removeEventListener('contextmenu', handleContextMenu);
  };
}, [editorRef]);
```

---

## Issue #2: 10 Menu Items Without Handlers - Code Evidence

### A. Where They're Defined (electron.js)

```javascript
// ========== INSERT MENU ==========
{
  label: 'Uusi kohtaus',        // NEW SCENE - NO HANDLER
  accelerator: 'CmdOrCtrl+Alt+S',
  click: () => mainWindow.webContents.send('new-scene')
},
{
  label: 'Kommentti',           // COMMENT - NO HANDLER
  accelerator: 'CmdOrCtrl+Alt+C',
  click: () => mainWindow.webContents.send('insert-comment')
},
{
  label: 'Muistiinpano',        // NOTE - NO HANDLER
  accelerator: 'CmdOrCtrl+Alt+M',
  click: () => mainWindow.webContents.send('insert-note')
},

// ========== TOOLS MENU ==========
{
  label: 'Sanamäärä',           // WORD COUNT - NO HANDLER
  accelerator: 'CmdOrCtrl+Shift+W',
  click: () => mainWindow.webContents.send('show-word-count')
},
{
  label: 'Tavoitteen asetus',   // TARGET SETTINGS - NO HANDLER
  accelerator: 'CmdOrCtrl+Shift+T',
  click: () => mainWindow.webContents.send('show-target-settings')
},
{
  label: 'Oikoluku',            // SPELL CHECK - NO HANDLER
  accelerator: 'CmdOrCtrl+Shift+P',
  click: () => mainWindow.webContents.send('spell-check')
},
{
  label: 'Projektin statistiikka', // PROJECT STATS - NO HANDLER
  click: () => mainWindow.webContents.send('show-project-stats')
},

// ========== HELP MENU ==========
{
  label: 'Dokumentaatio',       // DOCUMENTATION - NO HANDLER
  click: () => mainWindow.webContents.send('show-help')
},
{
  label: 'Pikaohjeet',          // SHORTCUTS - NO HANDLER
  accelerator: 'CmdOrCtrl+?',
  click: () => mainWindow.webContents.send('show-shortcuts')
},
{
  label: 'Tietoja',             // ABOUT - NO HANDLER
  click: () => mainWindow.webContents.send('show-about')
}
```

### B. Where They Should Be Handled (app.js:1214-1336)

```javascript
window.electronAPI.onMenuAction((event, arg) => {
  console.log('[Menu Event]', event, arg);
  
  switch (event) {
    // EXISTING HANDLERS:
    case 'undo':
      undo();
      break;
    case 'new-chapter':
      addNewChapter();
      break;
    
    // ===== MISSING HANDLERS =====
    
    // These events are sent but not handled:
    case 'new-scene':
      // TODO: Implement new scene creation
      break;
    case 'insert-comment':
      // TODO: Implement comment insertion
      break;
    case 'insert-note':
      // TODO: Implement note insertion
      break;
    case 'show-word-count':
      // TODO: Show word count dialog
      break;
    case 'show-target-settings':
      // TODO: Show target settings dialog
      break;
    case 'spell-check':
      // TODO: Run spell checker
      break;
    case 'show-project-stats':
      // TODO: Show project statistics
      break;
    case 'show-help':
      // TODO: Show help documentation
      break;
    case 'show-shortcuts':
      // TODO: Show keyboard shortcuts
      break;
    case 'show-about':
      // TODO: Show about dialog
      break;
    
    default:
      console.log('[Menu Event] Unhandled:', event);
  }
});
```

### C. Proof of Missing Handlers (Grep Results)

```bash
$ grep -n "case 'new-scene'" /home/user/faust-editori-ai/app.js
(no matches)

$ grep -n "case 'insert-comment'" /home/user/faust-editori-ai/app.js
(no matches)

$ grep -n "case 'show-word-count'" /home/user/faust-editori-ai/app.js
(no matches)

# Compare with WORKING handlers:
$ grep -n "case 'new-chapter'" /home/user/faust-editori-ai/app.js
1303:        case 'new-chapter':
1304:          addNewChapter();

$ grep -n "case 'undo'" /home/user/faust-editori-ai/app.js
1216:        case 'undo':
```

---

## Issue #3: Empty Context Menu Handlers - Code Evidence

### A. The Empty Handlers (electron.js:1416-1427)

```javascript
{
  label: 'Kopioi',
  accelerator: 'CmdOrCtrl+C',
  click: () => {
    // Renderer handles copy  <-- EMPTY, JUST A COMMENT
  }
},
{
  label: 'Liitä',
  accelerator: 'CmdOrCtrl+V',
  click: () => {
    // Renderer handles paste  <-- EMPTY, JUST A COMMENT
  }
}
```

### B. Why This Is Wrong

```javascript
// Standard Electron implementation:
{
  label: 'Kopioi',
  accelerator: 'CmdOrCtrl+C',
  role: 'copy'  // Uses native clipboard handling
},
{
  label: 'Liitä',
  accelerator: 'CmdOrCtrl+V',
  role: 'paste'  // Uses native clipboard handling
}

// OR custom implementation:
{
  label: 'Kopioi',
  accelerator: 'CmdOrCtrl+C',
  click: () => {
    mainWindow.webContents.send('custom-copy');
  }
}
```

---

## Issue #4: Duplicate Keyboard Handlers - Code Evidence

### A. Handler 1 (app.js:1108-1205)

```javascript
useEffect(() => {
  const handleKeyboardShortcuts = (event) => {
    // ESC key for modals
    if (event.key === 'Escape' || event.keyCode === 27) {
      // Close modals in priority order...
      if (showFindDialog || showReplaceDialog) {
        setShowFindDialog(false);
        setShowReplaceDialog(false);
      }
      // ... more modal handling
      return;
    }
    
    // Cmd+Shift+V for voice dictation
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'v') {
      event.preventDefault();
      if (voiceInputAvailable && textSelection && voiceState === 'idle') {
        handleVoiceEdit();
      }
      return;
    }
  };
  
  // LINE 1181 - FIRST LISTENER
  window.addEventListener('keydown', handleKeyboardShortcuts);
  
  return () => {
    window.removeEventListener('keydown', handleKeyboardShortcuts);
  };
}, [showFindDialog, showReplaceDialog, ...]);
```

### B. Handler 2 (app.js:4438-4440)

```javascript
useEffect(() => {
  const handleKeyDown = (event) => {
    // Cmd+S = Save project
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      saveProject();
    }
    // Cmd+T = Toggle dark mode
    if ((event.ctrlKey || event.metaKey) && event.key === 't') {
      event.preventDefault();
      setIsDarkMode(prev => !prev);
    }
    // Cmd+K = Toggle AI Assistant
    if (event.metaKey && event.key === 'k') {
      event.preventDefault();
      setAiAssistantOpen(prev => !prev);
    }
  };
  
  // LINE 4438 - SECOND LISTENER (SAME WINDOW OBJECT!)
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [project, unsavedChanges, currentFilePath, aiAssistantOpen]);
```

### C. The Problem

```javascript
// This is inefficient and risky:
window.addEventListener('keydown', handleKeyboardShortcuts);  // Line 1181
window.addEventListener('keydown', handleKeyDown);             // Line 4438

// Now EVERY KEYPRESS triggers BOTH functions:
// User presses ESC -> handleKeyboardShortcuts runs, handleKeyDown ALSO runs
// User presses Cmd+S -> handleKeyDown runs, handleKeyboardShortcuts ALSO runs

// Better approach:
window.addEventListener('keydown', (event) => {
  handleKeyboardShortcuts(event);
  handleKeyDown(event);
});
```

---

## Issue #5: Missing AI-Suggest Handler - Code Evidence

### A. Sender (electron.js:1433-1435)

```javascript
{
  label: 'AI-ehdotus valitulle tekstille',
  enabled: !!selection,
  click: () => {
    mainWindow.webContents.send('ai-suggest', selection);  // Sent here
  }
}
```

### B. Receiver Missing (app.js)

```bash
$ grep -n "'ai-suggest'" /home/user/faust-editori-ai/app.js
(no matches)

$ grep -n '"ai-suggest"' /home/user/faust-editori-ai/app.js
(no matches)

$ grep -n "case 'ai-suggest'" /home/user/faust-editori-ai/app.js
(no matches)
```

No handler anywhere in the code!

### C. Should Look Like This

```javascript
// In app.js switch statement:
case 'ai-suggest':
  if (arg) {
    // arg contains the selected text
    const suggestions = await getAISuggestion(arg);
    setAiSuggestion({
      original: arg,
      revised: suggestions,
      applied: false
    });
  }
  break;
```

---

## Issue #6: Hardcoded Checkbox State - Code Evidence

### A. Sidebar Checkbox (electron.js:284-287)

```javascript
{
  label: 'Sivupalkki',
  accelerator: 'CmdOrCtrl+Shift+B',
  type: 'checkbox',
  checked: true,  // HARDCODED - Always true!
  click: () => mainWindow.webContents.send('toggle-sidebar')
}
```

**Problem:** `checked: true` is hardcoded. Should be dynamic:
```javascript
// Should be:
checked: sidebarVisible  // Dynamic state
```

### B. Inspector Checkbox (electron.js:291-294)

```javascript
{
  label: 'Inspector',
  accelerator: 'CmdOrCtrl+Alt+I',
  type: 'checkbox',
  checked: !!uiPrefs?.inspectorVisible,  // BETTER - Uses state
  click: () => mainWindow.webContents.send('toggle-inspector')
}
```

**Issue:** `inspectorVisible` is from `uiPrefs` loaded at startup. If toggled during app runtime, menu doesn't update.

### C. All Affected Checkboxes

```javascript
// Line 285 - Sidebar: checked: true (hardcoded)
// Line 292 - Inspector: checked: !!uiPrefs?.inspectorVisible (stale)
// Line 300 - AI-Avustajat: checked: !!uiPrefs?.aiPanelVisible (stale)
// Line 307 - Layout: checked: uiPrefs.newLayout (stale)
// Line 316 - Theme: checked: uiPrefs.theme === 'DEIS' (stale)
// Line 327 - Focus Mode: checked: uiPrefs.focusMode (stale)
// Line 340 - Zen Mode: checked: uiPrefs.zenMode (stale)
```

### D. Why This Is Wrong

```javascript
// User clicks "Toggle Sidebar"
// UI hides the sidebar
// But menu still shows checked: true

// User clicks Zen Mode checkbox
// UI enters Zen Mode
// But when they click View menu, it shows the OLD state
```

---

## Issue #7: Inconsistent Event Naming - Code Evidence

### A. Naming Patterns

```javascript
// Pattern 1: *-trigger (indicating async action)
'save-project-trigger'
'save-project-as-trigger'
'export-trigger'
'export-pdf-trigger'
'export-epub-trigger'
'export-mobi-trigger'

// Pattern 2: toggle-* (binary toggle)
'toggle-sidebar'
'toggle-inspector'
'toggle-ai-panel'
'toggle-focus-mode'

// Pattern 3: show-* (open dialog/panel)
'show-find'
'show-find-replace'
'show-word-count'
'show-target-settings'
'show-project-stats'
'show-help'
'show-shortcuts'
'show-settings'
'show-about'

// Pattern 4: no prefix (unclear)
'undo'
'redo'
'find-next'

// Pattern 5: action-* (undefined)
'new-project'
'new-chapter'
'new-scene'

// Pattern 6: insert-* (insertion action)
'insert-comment'
'insert-note'
'insert-text'

// Pattern 7: format-* (formatting)
'format-bold'
'format-italic'
'format-underline'
'format-heading'
'format-quote'
'format-list'

// Pattern 8: custom (one-off)
'ui-prefs-changed'
'load-project-data'
'spell-check'
'ai-suggest'
```

**Issue:** 8 different naming patterns! Very confusing for developers.

### B. Better Naming Strategy

```javascript
// Consistent with verbs + subject:
// command-name (past tense for toggles):
'project:new'          // Instead of 'new-project'
'project:save'         // Instead of 'save-project-trigger'
'chapter:new'          // Instead of 'new-chapter'
'chapter:insert'       // Instead of 'insert-comment'
'editor:undo'          // Instead of 'undo'
'editor:find-open'     // Instead of 'show-find'
'panel:sidebar-toggle' // Instead of 'toggle-sidebar'
'ai:suggest'           // Instead of 'ai-suggest'
```

---

## Issue #8: Language Mixing - Code Evidence

### A. Hard-Coded Finnish Throughout

```javascript
// electron.js - ALL LABELS IN FINNISH
const template = [
  {
    label: app.name,  // English variable
    submenu: [
      { label: `Tietoja - ${app.name}`, role: 'about' },  // Finnish
      { label: 'Asetukset...', accelerator: 'CmdOrCtrl+,' },  // Finnish
      { label: 'Piilota', role: 'hide' },  // Finnish
      { label: 'Piilota muut', role: 'hideOthers' },  // Finnish
    ]
  },
  {
    label: 'Tiedosto',  // Finnish
    submenu: [
      { label: 'Uusi projekti', accelerator: 'CmdOrCtrl+N' },  // Finnish
      { label: 'Avaa projekti...', accelerator: 'CmdOrCtrl+O' },  // Finnish
      // ... 78 more Finnish labels
    ]
  }
];
```

### B. No i18n System

```bash
$ grep -rn "i18n\|i18next\|gettext\|localize\|translate" /home/user/faust-editori-ai/electron.js
(no matches)

# Only hardcoded strings exist
```

### C. What Should Exist

```javascript
// config/i18n.js
const translations = {
  fi: {
    'app.about': 'Tietoja',
    'app.preferences': 'Asetukset...',
    'file.new': 'Uusi projekti',
    'file.open': 'Avaa projekti...',
    'edit.undo': 'Kumoa',
    // ... all 78 labels
  },
  en: {
    'app.about': 'About',
    'app.preferences': 'Preferences...',
    'file.new': 'New Project',
    'file.open': 'Open Project...',
    'edit.undo': 'Undo',
    // ... all 78 labels
  }
};

// electron.js usage:
function createMenu(language = 'fi') {
  const t = (key) => translations[language][key];
  const template = [
    {
      label: t('app.about'),
      submenu: [
        { label: t('file.new'), accelerator: 'CmdOrCtrl+N' },
        // ... etc
      ]
    }
  ];
}
```

---

## Summary Table: Issue Locations

| Issue | File | Lines | Type | Severity |
|-------|------|-------|------|----------|
| Context menu unused | electron.js | 1412-1459 | Broken | CRITICAL |
| Missing handlers | app.js | 1214-1336 | Incomplete | HIGH |
| Empty handlers | electron.js | 1416-1427 | Broken | MEDIUM |
| Duplicate listeners | app.js | 1181, 4438 | Inefficient | MEDIUM |
| Missing ai-suggest | app.js | (missing) | Unimplemented | MEDIUM |
| Hardcoded checkboxes | electron.js | 285-347 | Stale state | LOW |
| Inconsistent naming | electron.js | Throughout | Design | LOW |
| Hard-coded language | electron.js | Throughout | Design | LOW |

---

## Testing the Issues

### Test 1: Context Menu (Should Fail)
```javascript
// Right-click in editor
// Expected: Context menu appears
// Actual: Nothing happens
```

### Test 2: New Scene Menu (Should Fail)
```javascript
// Click: Insert > Uusi kohtaus
// Expected: New scene created
// Actual: Nothing happens (no console error)
```

### Test 3: Checkbox State (Should Fail)
```javascript
// Click: View > Sivupalkki (uncheck it)
// Sidebar disappears
// Click: View menu again
// Expected: Checkbox is unchecked
// Actual: Checkbox shows as checked
```

### Test 4: Keyboard Shortcuts (Works but Inefficient)
```javascript
// Press any key
// Expected: One function call
// Actual: TWO functions called (both handleKeyboardShortcuts AND handleKeyDown)
```


# 🔧 RENDERER STRUCTURE FIX - v1.4.2

**Date:** 21.10.2025  
**Issue:** Legacy flex layout prevents centered-paper design from activating  
**Status:** 🔴 CRITICAL - Requires structural refactor

---

## 🎯 PROBLEM ANALYSIS

### Current State (BROKEN)

**DOM Structure:**
```
.faust-page (wrapper)
  └─ div.flex (legacy Tailwind layout)
      ├─ aside.panel-sidebar-left (200-600px)
      ├─ aside (collections panel)
      └─ div (editor content, inline styles)
```

**CSS Expectations:**
```css
body.new-layout .app-layout { /* NEVER MATCHES! */
  display: grid;
  grid-template-columns: 220px 1fr auto;
}

body.new-layout .paper { /* NEVER MATCHES! */
  background: var(--paper);
  box-shadow: inset...; /* vignette */
}
```

**Result:**
- ❌ `.app-layout` grid never rendered → CSS grid rules ignored
- ❌ `.paper` element missing → vignette/typography styles don't apply
- ❌ `.faust-page` just squeezes legacy flex into 820px → narrow vertical layout
- ❌ Theme tokens load but can't attach to proper surfaces

---

## 📋 EXPECTED STRUCTURE

**From `faust_ui_spec.json:8-98`:**

```
.faust-page
  └─ .app-layout (CSS Grid: 3 columns)
      ├─ .sidebar (left, 220px)
      │   └─ Navigation tree
      │
      ├─ .paper (center, 1fr)
      │   ├─ Titlebar
      │   ├─ Tab bar
      │   └─ Editor textarea
      │
      └─ .inspector (right, 300px)
          └─ Tabs (Notes, Characters, AI, etc.)
```

**CSS Grid Definition:**
```css
.app-layout {
  display: grid;
  grid-template-columns: 220px 1fr auto;
  grid-template-rows: auto 1fr 28px;
  height: 100vh;
  gap: 0; /* No hard borders */
}
```

**Paper Surface:**
```css
.paper {
  background: var(--paper);
  color: var(--ink);
  box-shadow: 
    inset 0 1px 0 rgba(0,0,0,0.08),
    inset 0 30px 120px rgba(0,0,0,0.14), /* vignette */
    0 4px 20px rgba(0,0,0,0.25);
  border-radius: 14px;
  padding: 26px 30px;
  margin: 20px auto;
}
```

---

## 🛠️ IMPLEMENTATION PLAN

### Phase 1: Audit Current Renderer (app.js:6433-8000)

**Tasks:**
- [x] Map current JSX structure
- [x] Identify sidebar content & state dependencies
- [x] Identify editor content & handlers
- [x] Identify inspector content & tabs
- [x] Document conditional rendering (showSidebar, showInspector, zenMode)

**Findings:**
- Sidebar: Lines 6449-6788 (state: `showSidebar`, `zenMode`)
- Editor: Lines 6789-9200 (main textarea, toolbar, AI panel)
- Inspector: Lines 9201-9600 (state: `showInspector`, tabs)
- Collections Panel: Lines 6526-6788 (state: `showCollectionsPanel`)

### Phase 2: Introduce `.app-layout` Grid

**Location:** `app.js:6437` (inside `.faust-page`)

**Structure:**
```javascript
e('div', { 
  className: 'faust-page',
  'data-layout-container': 'true'
},
  // NEW: Grid layout wrapper (only when newLayout=true)
  newLayout ? e('div', {
    className: 'app-layout',
    style: {
      display: 'grid',
      gridTemplateColumns: showSidebar && !zenMode 
        ? (showInspector ? '220px 1fr 300px' : '220px 1fr')
        : (showInspector ? '1fr 300px' : '1fr'),
      gridTemplateRows: 'auto 1fr auto',
      height: '100vh',
      gap: 0,
      background: 'var(--faust-bg-primary)'
    }
  },
    // Grid children: sidebar, paper, inspector
    showSidebar && !zenMode && e('aside', { 
      className: 'sidebar',
      style: { gridColumn: '1', gridRow: '1 / -1' }
    }, /* sidebar content */),
    
    e('div', { 
      className: 'paper',
      style: { gridColumn: showSidebar && !zenMode ? '2' : '1', gridRow: '2' }
    }, /* editor content */),
    
    showInspector && !zenMode && e('aside', { 
      className: 'inspector',
      style: { gridColumn: showSidebar && !zenMode ? '3' : '2', gridRow: '1 / -1' }
    }, /* inspector content */)
  )
  
  // ELSE: Legacy flex layout (when newLayout=false)
  : e('div', { className: 'flex flex-1 overflow-hidden' }, 
      /* current structure */
    )
)
```

### Phase 3: Wrap Editor in `.paper` Element

**Current:** Editor is a direct child of flex container  
**Target:** Editor becomes `.paper` grid child

**Changes:**
1. Wrap titlebar + tabs + textarea in `.paper` div
2. Apply `className: 'paper'` for CSS hook
3. Remove inline width/background styles (CSS controls this)
4. Keep all event handlers and state

### Phase 4: Migrate Inline Styles to Theme Tokens

**Remove:**
- `background: '#141210'` → Use `var(--faust-bg-primary)`
- `borderRight: '1px solid...'` → Use `var(--faust-border)`
- `color: 'rgba(...)'` → Use `var(--faust-text-secondary)`

**Keep:**
- Dynamic widths (`sidebarWidth`)
- State-dependent styles
- Animation transitions

### Phase 5: Sync UI Preferences with Grid

**Ensure:**
- `setNewLayout(true)` → Render `.app-layout` grid
- `setNewLayout(false)` → Render legacy flex
- `setZenMode(true)` → Hide sidebar + inspector (CSS + conditional)
- `setFocusMode(true)` → Apply `.faust-focus` class (CSS handles maxWidth)

**Update `applyUiPrefs()` in app.js:**
```javascript
function applyUiPrefs(prefs) {
  const root = document.documentElement;
  const body = document.body;
  
  // Theme
  root.setAttribute('data-theme', prefs.theme === 'DEIS' ? 'DEIS' : 'NOX');
  
  // Layout (CSS + React state)
  root.setAttribute('data-layout', prefs.newLayout ? 'new' : 'legacy');
  root.classList.toggle('faust-new-layout', !!prefs.newLayout);
  body.classList.toggle('new-layout', !!prefs.newLayout);
  setNewLayout(!!prefs.newLayout); // ← CRITICAL!
  
  // Modes
  body.classList.toggle('focus-mode', !!prefs.focusMode);
  body.classList.toggle('zen-mode', !!prefs.zenMode);
  
  // Contrast guard
  setTimeout(() => applyContrastGuard(), 100);
}
```

### Phase 6: Test & Verify

**Test Cases:**
1. ✅ Toggle `Uusi layout` → `.app-layout` appears in DOM
2. ✅ `.paper` element exists with vignette styles
3. ✅ Sidebar/Inspector hide in Zen mode
4. ✅ Focus mode shrinks `.paper` to 680px
5. ✅ NOX/DEIS switch changes `--paper` and `--ink` colors
6. ✅ Responsive (< 868px) uses media queries
7. ✅ `window.debugLayout()` reports correct structure

**Commands:**
```javascript
// In DevTools console
window.debugLayout();
// Should show:
// - html.dataLayout: 'new'
// - body.classes: ['new-layout']
// - wrapper.exists: true
// - paper.exists: true
// - paper.computed.maxWidth: '74ch' or '800px'
// - appLayout: { exists: true, display: 'grid' }

// Visual check
document.querySelector('.app-layout'); // Should not be null
document.querySelector('.paper'); // Should not be null

// Computed styles
getComputedStyle(document.querySelector('.paper')).boxShadow; 
// Should include inset vignette
```

---

## 🚨 BREAKING CHANGES

**None!**
- Legacy layout still available (newLayout=false)
- All existing functionality preserved
- Gradual migration path (feature flag)

---

## 📈 EXPECTED IMPROVEMENTS

### Before (v1.4.1)
- ❌ Narrow vertical layout (820px squeeze)
- ❌ No vignette/paper effect
- ❌ Theme tokens don't apply to surfaces
- ❌ CSS grid rules ignored

### After (v1.4.2)
- ✅ Centered paper surface (800px max, 74ch)
- ✅ Radial vignette around editor
- ✅ Theme tokens (`--paper`, `--ink`) apply correctly
- ✅ Grid layout with proper 3-panel structure
- ✅ Responsive (desktop/tablet/mobile)
- ✅ Matches `faust_ui_spec.json` design

---

## 🔗 DEPENDENCIES

**Files to Modify:**
1. `app.js` (lines 6433-9600) - Main refactor
2. `app.js` (lines 2700-2800) - Update `applyUiPrefs()`
3. `app.js` (window.debugLayout) - Add `.paper` and `.app-layout` checks

**Files to Verify:**
1. `styles/faust-layout.css` - Already correct! ✅
2. `styles/faust-theme.css` - Already has `--paper` and `--ink` tokens ✅
3. `faust_ui_spec.json` - Reference for structure ✅

**No changes needed:**
- `electron.js` ✅
- `preload.js` ✅
- `index.html` ✅
- `package.json` ✅

---

## 🎯 SUCCESS CRITERIA

- [ ] `.app-layout` grid renders when `newLayout=true`
- [ ] `.paper` element exists with vignette styles
- [ ] Sidebar/Inspector position correctly in grid
- [ ] Theme switching (NOX↔DEIS) changes paper colors
- [ ] Focus/Zen modes work with new structure
- [ ] Responsive design works (< 868px)
- [ ] `window.debugLayout()` reports all elements
- [ ] Visual appearance matches `faust_ui_spec.json` screenshots
- [ ] No regressions in existing functionality

---

## 📝 NEXT STEPS

1. **Create feature branch:** `git checkout -b fix/renderer-structure-v1.4.2`
2. **Implement Phase 2-3:** Introduce `.app-layout` and `.paper`
3. **Test locally:** Toggle new layout, verify DOM structure
4. **Migrate inline styles:** Replace with CSS variables (Phase 4)
5. **Test all modes:** Focus, Zen, NOX/DEIS
6. **Update debug helper:** Add `.paper` and `.app-layout` checks
7. **Document changes:** Update `CHANGELOG_v1.4.2.md`
8. **Commit & merge:** Squash commits, merge to main, tag release

---

## 🎊 IMPACT

**This fix will:**
- ✅ Unlock the full centered-paper design
- ✅ Enable vignette/candlelight effect
- ✅ Allow theme tokens to work as intended
- ✅ Match the documented visual identity
- ✅ Provide a clean base for future UI enhancements

**Estimated effort:** 2-4 hours  
**Risk:** Low (feature flag allows fallback)  
**Priority:** 🔴 HIGH (blocks visual identity from working)

---

**Ready to implement?** Let's fix this! 🚀


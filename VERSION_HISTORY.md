# 📜 FAUST VERSION HISTORY

Täydellinen versiohistoria kaikista julkaisuista.

---

## v1.4.1 (21.10.2025) - Backend Improvements 🔧

**Type:** Minor improvements & stability  
**Commits:** 3 (afb3fc2, 1453e8c, eb86733)  
**Files:** +781 lines, -25 lines (4 files)

### ✨ NEW FEATURES
1. **UI Preferences Persistence** - Settings saved to `ui-prefs.json`
2. **Enhanced View Menu** - Synced checkboxes for theme, layout, modes
3. **AI Call Timeout Protection** - 30s timeout for API calls
4. **Improved PDF Export** - Better cleanup & error messages
5. **Spec Runner** - Internal testing framework (IPC-based)
6. **Enhanced Security** - Sandbox mode enabled

### 🔧 TECHNICAL
- `electron.js`: +160 lines (UI prefs, timeout, menu, PDF, spec runner, sandbox)
- `preload.js`: +15 lines (new IPC bridges)
- `CHANGELOG_v1.4.1.md`: Complete documentation
- `V1.4.1_SUMMARY.md`: Technical summary
- `QUICK_TEST_v1.4.1.md`: 2-minute test guide

### 🎯 IMPACT
- **Stability:** Improved (AI calls won't hang, PDF export safer)
- **UX:** Better (settings persist, menu shows state)
- **Security:** Enhanced (sandbox mode)
- **Testing:** New framework for CI/CD

---

## v1.4.0 (21.10.2025) - UI Overhaul 🎨

**Type:** Major UI improvements  
**Commits:** 6 PRs (PR1-PR3 + 3 existing features)  
**Files:** +1589 lines, -2 lines (11 files)

### ✨ NEW FEATURES

#### PR1: Themes & Typography (e5ee820)
- **NOX/DEIS Theme System** - CSS variables for colors
- **WCAG AA Contrast Guard** - 12.68:1 ratio
- **Fonts:** EB Garamond (headers), IBM Plex Mono (UI)
- Files: `styles/faust-theme.css`, `utils/contrast.js`

#### PR2: Centered Paper Layout (fa7c461)
- **NEW_LAYOUT Feature Flag** - Centered paper (800px)
- **Vignette Effect** - Layered shadows & overlay
- **Narrow Sidebar** - 220px width
- Files: `styles/faust-layout.css`

#### PR3: Focus Mode Shortcut (b4f0b34)
- **Cmd/Ctrl+Shift+F** - Toggle Focus Mode
- Already existed: Zen Mode, Inspector toggle
- Files: `app.js` (keyboard shortcut)

#### PR4-PR6: Already Existing (Documented)
- **Quick Actions** - Auto-popup on text selection
- **/ai Inline Mode** - Ghost text with Tab/Esc
- **AI Panel Tabs** - Chat, Quick, Techniques, Continuity

### 🎯 IMPACT
- **Visual:** Modern, professional (NOX dark, DEIS light)
- **UX:** Improved (centered paper, quick actions)
- **Accessibility:** WCAG AA compliant
- **Productivity:** Focus/Zen modes for distraction-free writing

---

## v1.3.0 (Before 21.10.2025) - Faust Spec Complete ✨

**Phase 1:** Inspector + Zen Mode  
**Phase 2:** Mode Transition + Sigil Effects  
**Phase 3:** /ai Inline Mode + Ghost Text  

### ✨ FEATURES
- Inspector default hidden
- Zen Mode (Cmd/Ctrl+Enter)
- Mode transition animations (NOX ↔ DEIS)
- Sigil hover/active effects (golden aura)
- /ai inline mode with ghost text
- Tab = accept, Esc = reject

### 📊 STATS
- 100% Faust spec compliance
- Complete modals (Character, Location, Chapter, Thread)
- AI integration in all modals
- HybridWritingFlow + BatchProcessor + CostOptimizer

---

## Earlier Versions (Pre-v1.3.0)

### Development Phase
- **Core Editor** - React-based text editor
- **Project Structure** - Hierarchical items (folders, chapters, scenes)
- **Story Elements** - Characters, Locations, Threads, Timeline
- **AI Integration** - Claude, GPT, Gemini, Grok, DeepSeek
- **Export** - TXT, MD, HTML, RTF, PDF, DOCX
- **Modals** - CharacterSheet, LocationSheet, ChapterSheet, ThreadSheet
- **Modules:**
  - `StoryContinuityTracker.js` - Timeline & fact checking
  - `HybridWritingFlow.js` - AI-assisted writing
  - `CostOptimizer.js` - API cost optimization
  - `BatchProcessor.js` - Bulk operations

---

## 📊 OVERALL STATISTICS

### Code Base
```
app.js:                   12,000+ lines (main application)
electron.js:               1,070 lines (main process)
preload.js:                   73 lines (IPC bridge)
modules/:                  4 files, 31 KB (AI modules)
styles/:                   2 files (theme + layout)
utils/:                    2 files (contrast, converters)
```

### Features Count
- **Core Features:** 20+ (editor, project, export, etc.)
- **AI Features:** 10+ (providers, inline, quick actions, etc.)
- **UI Features:** 15+ (themes, modes, panels, etc.)
- **Story Features:** 8+ (characters, locations, threads, etc.)

### Dependencies
- React 18
- Electron 32
- Anthropic SDK (Claude)
- OpenAI SDK
- Google Generative AI (Gemini)
- Webpack 5

---

## 🔮 ROADMAP

### v1.4.2 (Suggested)
- Apply timeout to all AI providers
- Add rate limiting (3 req/s)
- Implement spec runner in renderer
- Add CSP headers

### v1.5.0 (Future)
- Finalize New Layout (remove flag)
- UI toggle for layout in settings
- Component refactoring (JSX files)

### v2.0.0 (Long-term)
- Full TypeScript migration
- State management (Zustand/Jotai)
- Testing suite (Jest + RTL)
- Plugin system

---

## 📝 MAINTENANCE LOG

### Active Development
- **2025-10-21:** v1.4.0 + v1.4.1 (UI overhaul + backend improvements)
- **2025-10-XX:** v1.3.0 (Faust spec compliance)

### Stable Versions
- **v1.4.1** - Latest stable (backend improvements)
- **v1.4.0** - Stable (UI overhaul)
- **v1.3.0-stable** - Stable (Faust spec complete)

---

## 🏷️ TAG CONVENTIONS

- `vX.Y.Z` - Release versions
- `vX.Y.Z-stable` - Explicitly stable releases
- `vX.Y.Z-beta` - Beta releases (not yet used)
- `vX.Y.Z-rc` - Release candidates (not yet used)

---

**Last Updated:** 21.10.2025  
**Current Version:** v1.4.1  
**Status:** ✅ Stable, fully functional, ready for production


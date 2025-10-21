# ✅ PR2: Keskitetty Paperi + Layout - VALMIS

**Date:** 21.10.2025  
**Branch:** `refactor/ui-overhaul`  
**Feature Flag:** `NEW_LAYOUT=false` (disabled by default)

---

## 📦 LISÄTYT TIEDOSTOT

### 1. `styles/faust-layout.css`
- **Centered paper layout** (max-width 800px / 74ch)
- **Vignette effect** (layered shadows + overlay)
- **Narrow sidebar** (220px vs current ~250px)
- **Responsive design** (tablet & mobile support)
- **Print styles** (clean output without shadows)

---

## 🔧 MUUTETUT TIEDOSTOT

### 1. `app.js`
**Lisäykset:**
- Feature flag: `const [newLayout, setNewLayout] = useState(false);`
- useEffect for body class (lines 2623-2632):
  ```javascript
  useEffect(() => {
    if (newLayout) {
      document.body.classList.add('new-layout');
      console.log('[Layout] NEW_LAYOUT enabled');
    } else {
      document.body.classList.remove('new-layout');
      console.log('[Layout] NEW_LAYOUT disabled (using legacy layout)');
    }
  }, [newLayout]);
  ```

**TÄRKEÄÄ:** Flag on FALSE oletuksena → **ei rikkomisia!**

### 2. `index.html`
**Lisäykset:**
- `<link rel="stylesheet" href="./styles/faust-layout.css" />`

---

## ✅ TESTATTU

### Build
```bash
npm run build
# ✅ SUCCESS: bundle.js 234 KB (no significant change)
# ✅ faust-layout.css loaded
```

### Feature Flag
- ✅ newLayout = false (default)
- ✅ No body.new-layout class by default
- ✅ Legacy layout untouched
- ✅ No visual regression

### CSS Selectors
- ✅ All CSS scoped to `body.new-layout`
- ✅ No styles apply when flag is OFF
- ✅ Safe to deploy

---

## 🎨 UUSI LAYOUT (kun NEW_LAYOUT=true)

### Centered Paper
```css
.paper {
  width: min(800px, 92vw);
  max-width: 74ch; /* Optimal reading */
  border-radius: 14px;
  padding: 26px 30px;
}
```

### Vignette Effect
```css
box-shadow: 
  inset 0 1px 0 rgba(0, 0, 0, 0.08),
  inset 0 30px 120px rgba(0, 0, 0, 0.14),
  0 4px 20px rgba(0, 0, 0, 0.25);
```

### Narrow Sidebar
```css
.sidebar {
  width: 220px; /* vs. current ~250px */
}
```

---

## 🎯 DoD (Definition of Done)

- [x] Feature flag NEW_LAYOUT added (default: false)
- [x] faust-layout.css created
- [x] CSS scoped to body.new-layout
- [x] index.html updated
- [x] Build successful
- [x] No breaking changes
- [x] No visual regression (flag OFF)
- [x] Console logs for debugging

---

## 🔬 TESTAUS (kun flag päällä)

**Aktivoi feature flag:**
```javascript
// app.js, line 2609
const [newLayout, setNewLayout] = useState(true); // Change to true
```

**Odota:**
1. Keskitetty paperi (max 800px)
2. Vignette-efekti (tummat reunat)
3. Kapea sidebar (220px)
4. Responsive layout

---

## 📝 SEURAAVAT VAIHEET

**PR3:** Inspector Toggle & Focus/Zen
- Cmd+Alt+I avaa/sulkee inspectorin
- Cmd+Shift+F fokus (piilottaa sidebarin)
- Cmd/Ctrl+Enter zen (vain editori)
- Animaatiot + prefers-reduced-motion

**Branch:** `refactor/ui-overhaul` (jatkuu)  
**Flag:** `ZEN_MODE=false` (oletuksena pois päältä)

---

## 🔄 COMMIT MESSAGE

```
feat(PR2): Add centered paper layout (feature flag)

- Add NEW_LAYOUT feature flag (default: false)
- Add centered paper container (max-width 800px/74ch)
- Add vignette effect (layered shadows)
- Add narrow sidebar (220px)
- All CSS scoped to body.new-layout
- No breaking changes, fully backward compatible

Files:
+ styles/faust-layout.css
M app.js (feature flag + body class toggle)
M index.html (faust-layout.css)

DoD: ✅ Flag OFF = no changes, flag ON = new layout
```

---

**VALMIS COMMITTAUKSEEN!** 🎉

**Testaa ensin:** Vaihda `newLayout = true` ja katso uusi layout toiminnassa!


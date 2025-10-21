# 🎯 Faust Specification Gap Analysis

**Päivämäärä**: 21.10.2025  
**Speksi**: v1.0.0 (2025-10-21)  
**Toteutus**: app.js (11,823 riviä)

---

## ❌ KRIITTISET PUUTTEET

### 1️⃣ Inspector default_hidden: true
**Speksi sanoo:**
```json
"right": {
  "default_hidden": true,  // piilossa oletuksena
}
```

**Toteutus:**
```javascript
const [showInspector, setShowInspector] = useState(true);  // ❌ VÄÄRIN!
```

**Korjaus:** Muuta `useState(false)`

**Prioriteetti:** 🔴 KRIITTINEN

---

### 2️⃣ Zen Mode (Cmd/Ctrl+Enter)
**Speksi sanoo:**
```json
"zen_mode": {
  "shortcut": "CmdOrCtrl+Enter",
  "hides": ["left", "right", "status_bar"],
  "exit_key": "Esc"
}
```

**Toteutus:** ❌ EI LÖYDY

**Korjaus:** Lisää zenMode-tila + pikanäppäin

**Prioriteetti:** 🟠 TÄRKEÄ

---

### 3️⃣ /ai inline mode
**Speksi sanoo:**
```json
"inline": {
  "enabled": true,
  "trigger": "/ai",
  "ghost_text": true,
  "accept_key": "Tab",
  "reject_key": "Esc"
}
```

**Toteutus:** ❌ EI LÖYDY

**Korjaus:** Lisää /ai-trigger editoriin

**Prioriteetti:** 🟠 TÄRKEÄ

---

### 4️⃣ Mode Transition Animation
**Speksi sanoo:**
```json
"mode_transition": [
  { "step": "dim_to_80%", "duration_ms": 150 },
  { "step": "golden_gradient_swipe", "duration_ms": 800 },
  { "step": "reilluminate_to_100%", "duration_ms": 250 }
]
```

**Toteutus:** ⚠️ Osittainen (`faust-ritual-swipe` löytyy CSS:stä, mutta ei integroitu NOX/DEIS-vaihtoon)

**Korjaus:** Integroida animaatio `toggleDarkMode`-funktioon

**Prioriteetti:** 🟡 KESKITASO

---

### 5️⃣ Cursor Breathe Animation
**Speksi sanoo:**
```json
"cursor_breathe": { 
  "opacity_from_to": [0.7, 1.0], 
  "duration_ms": 1200 
}
```

**Toteutus:** ✅ LÖYTYY (rivi 323-331)
```css
@keyframes cursor-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

**Status:** ✅ OK

---

## ⚠️ PIENEMPIÄ PUUTTEITA

### 6️⃣ Left Panel width_px: 200
**Speksi:** 200px  
**Toteutus:** Tarkista

**Prioriteetti:** 🟢 PIENI

---

### 7️⃣ Center max_width_px: 800
**Speksi:** 800px  
**Toteutus:** Tarkista

**Prioriteetti:** 🟢 PIENI

---

### 8️⃣ Sigil Hover/Active Effects
**Speksi sanoo:**
```json
"sigil_hover": { "aura": "soft-gold", "duration_ms": 200 },
"sigil_active": { "pulse": true, "duration_ms": 400 }
```

**Toteutus:** ❌ EI LÖYDY

**Korjaus:** Lisää hover/active efektit sigil-nappeihin

**Prioriteetti:** 🟡 KESKITASO

---

### 9️⃣ Context Menu
**Speksi sanoo:**
```json
"context_menu": {
  "target": "editor_surface",
  "ipc_event": "show-context-menu",
  "template": [...]
}
```

**Toteutus:** ⚠️ Osittainen (editorissa on onContextMenu, mutta ei täydellistä implementaatiota)

**Korjaus:** Varmista täysi context menu

**Prioriteetti:** 🟡 KESKITASO

---

### 🔟 Flat Navigation (single-level)
**Speksi sanoo:**
```json
"left": {
  "mode": "flat",  // yksitasoinen lista
  "items": ["Workspace title", "Chapters (flat list)", "[+ New chapter]"],
  "show_icons": false
}
```

**Toteutus:** Tarkista onko flat vai nested

**Prioriteetti:** 🟢 PIENI

---

## ✅ MITÄ ON VALMIINA

### Värit (NOX/DEIS) ✅
- NOX: #141210, #100F0D, #1A1815 ✅
- DEIS: #F8F2E8, #EDE4D8, #E6DED2 ✅
- Gold: #9A7B4F, #C89D5E ✅
- Bronze: #715C38 ✅

### Typografia ✅
- Heading: EB Garamond ✅
- Body: IBM Plex Mono ✅
- UI: Space Mono ✅
- Sigil: Faust Rune Sans ✅

### Layout ✅
- Three-panel (left, center, right) ✅
- AI unified panel ✅
- Command Palette ✅

### Quick Actions ✅
- Selection-based ✅
- Improve, Shorten, Expand, Fix ✅
- Faust-värit ✅

### Golden Aura ✅
- Tallenna-napit 4 modaalissa ✅
- Hover-efekti ✅

### Insert Modes ✅
- append, at-cursor, replace-selection, replace-all ✅

### Automatic Continuity Check ✅
- Debounced (3s) ✅
- Inline warnings ✅

---

## 📊 YHTEENVETO

| Kategoria | Status | Prioriteetti |
|-----------|--------|--------------|
| **Inspector default hidden** | ❌ Väärin | 🔴 KRIITTINEN |
| **Zen Mode** | ❌ Puuttuu | 🟠 TÄRKEÄ |
| **/ai inline** | ❌ Puuttuu | 🟠 TÄRKEÄ |
| **Mode transition anim** | ⚠️ Osittainen | 🟡 KESKITASO |
| **Sigil hover/active** | ❌ Puuttuu | 🟡 KESKITASO |
| **Context menu** | ⚠️ Osittainen | 🟡 KESKITASO |
| **Cursor breathe** | ✅ Valmis | - |
| **Värit** | ✅ Valmis | - |
| **Typografia** | ✅ Valmis | - |
| **Quick Actions** | ✅ Valmis | - |
| **Golden Aura** | ✅ Valmis | - |

**Compliance:** ⚠️ **~85%**

---

## 🎯 SUOSITELLUT TOIMENPITEET

### Prioriteetti 1 (NOPEAT KORJAUKSET - 5 min)
1. ✅ Muuta `showInspector` → `useState(false)`

### Prioriteetti 2 (TÄRKEÄT - 30-60 min)
2. ⚠️ Zen Mode (Cmd/Ctrl+Enter)
3. ⚠️ /ai inline mode

### Prioriteetti 3 (HIENOUSÄÄDÖT - 30-60 min)
4. ⚠️ Mode transition animation (NOX/DEIS swap)
5. ⚠️ Sigil hover/active effects
6. ⚠️ Context menu täydennys

---

## 🚀 SUOSITUS

**Option A: Nopea korjaus (5 min)** ⭐⭐⭐⭐⭐
- Korjaa Inspector default hidden
- Testaa → 90% compliance
- **Suositus:** TEE TÄMÄ NYT!

**Option B: Keskitason korjaus (40 min)** ⭐⭐⭐⭐
- Option A + Zen Mode
- Testaa → 95% compliance

**Option C: Täysi compliance (2-3h)** ⭐⭐⭐
- Kaikki yllä + /ai inline + animaatiot
- Testaa → 100% compliance
- **Huom:** Iso työmäärä, mutta täysi speksin mukainen!

---

## ✅ SEURAAVA VAIHE

**EHDOTUS: Option A (5 min)**

1. Korjaa `showInspector` → `useState(false)`
2. Testaa build
3. Commitoi
4. Kysy käyttäjältä haluaako Option B vai C

**Hyödyt:**
- Nopea (5 min)
- Kriittinen korjaus
- 85% → 90% compliance
- Voidaan jatkaa siitä

**Haitat:**
- Ei Zen Mode
- Ei /ai inline

**ALOITETAANKO?**


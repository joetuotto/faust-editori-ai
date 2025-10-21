# 🧪 DevTools Test Commands (v1.4.1)

## Avaa DevTools
```
macOS: Cmd+Alt+I
Windows/Linux: Ctrl+Shift+I
```

---

## 1️⃣ Tarkista Teema-attribuutti

```javascript
document.documentElement.getAttribute('data-theme')
```

**Odotettu:**
- `"NOX"` (default, tumma)
- tai `"DEIS"` (jos vaihdoit teeman)

---

## 2️⃣ Tarkista CSS-muuttujat

```javascript
getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')
```

**Odotettu:**
- NOX: `#141210` (tumma)
- DEIS: `#F8F2E8` (vaalea beige)

---

## 3️⃣ Tarkista CSS-tiedostojen lataus

```javascript
[...document.querySelectorAll('link[rel=stylesheet]')].map(l => ({
  href: l.getAttribute('href'),
  loaded: l.sheet ? 'OK' : 'FAIL'
}))
```

**Odotettu:**
```javascript
[
  { href: "./styles/faust-theme.css", loaded: "OK" },
  { href: "./styles/faust-layout.css", loaded: "OK" }
]
```

---

## 4️⃣ Tarkista Layout-luokka

```javascript
document.documentElement.classList.contains('faust-new-layout')
```

**Odotettu:**
- `false` (default)
- `true` (kun "Uusi layout" valittu valikosta)

---

## 5️⃣ Tarkista kaikkien CSS-muuttujien lataus

```javascript
const root = document.documentElement;
const style = getComputedStyle(root);
({
  bgPrimary: style.getPropertyValue('--bg-primary'),
  text: style.getPropertyValue('--text'),
  gold: style.getPropertyValue('--gold'),
  paper: style.getPropertyValue('--paper'),
  ink: style.getPropertyValue('--ink')
})
```

**Odotettu (NOX):**
```javascript
{
  bgPrimary: "#141210",
  text: "#E9E4DA",
  gold: "#9A7B4F",
  paper: "#F0E8DC",
  ink: "#2B241C"
}
```

**Odotettu (DEIS):**
```javascript
{
  bgPrimary: "#F8F2E8",
  text: "#2B241C",
  gold: "#C89D5E",
  paper: "#F2EADF",
  ink: "#2B241C"
}
```

---

## 6️⃣ Testaa Teeman Vaihto (Live)

**Konsoli valmiiksi auki:**

```javascript
// 1. Tallenna tämä funktio
function watchTheme() {
  const check = () => {
    const theme = document.documentElement.getAttribute('data-theme');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary');
    console.log(`[Theme] ${theme} → bg: ${bg}`);
  };
  setInterval(check, 1000);
}

// 2. Käynnistä valvonta
watchTheme()

// 3. Vaihda teema valikosta: Näytä → Teema: DEIS
//    → Konsoli tulostaa muutokset automaattisesti
```

---

## 7️⃣ Tarkista UI Prefs API

```javascript
// Hae nykyiset asetukset
await window.electronAPI.getUiPrefs()
```

**Odotettu:**
```javascript
{
  success: true,
  data: {
    theme: "NOX",
    newLayout: false,
    focusMode: false,
    zenMode: false,
    inspectorVisible: false,
    aiPanelVisible: false
  }
}
```

---

## 8️⃣ Testaa Asetuksen Tallennus

```javascript
// Aseta DEIS-teema
await window.electronAPI.setUiPrefs({ theme: 'DEIS' })

// Tarkista että muutos tapahtui
document.documentElement.getAttribute('data-theme')
// → "DEIS"

getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')
// → "#F8F2E8" (vaalea)
```

---

## 9️⃣ Tarkista Console-logit

**Käynnistyksessä pitäisi näkyä:**
```
[UI Prefs] Loaded: { theme: 'NOX', ... }
[UI Prefs] Applied { theme: 'NOX', newLayout: false, focus: false, zen: false }
[Theme] Switched to NOX
[Layout] NEW_LAYOUT disabled (using legacy layout)
```

**Teeman vaihdon jälkeen:**
```
[UI Prefs] Changed from menu: { theme: 'DEIS', ... }
[UI Prefs] Applied { theme: 'DEIS', newLayout: false, focus: false, zen: false }
```

---

## 🔟 Network Tab - Tarkista CSS-lataus

**Vaiheet:**
1. DevTools → Network tab
2. Refresh: Cmd+R / Ctrl+R
3. Filter: "CSS"

**Odotettu:**
```
./styles/faust-theme.css   200 OK   ~3KB
./styles/faust-layout.css  200 OK   ~2KB
```

**❌ EI SAA NÄKYÄ:**
```
ERR_FILE_NOT_FOUND
```

---

## ✅ KAIKKI TOIMII JOS:

1. ✅ `data-theme` attribuutti vaihtuu
2. ✅ `--bg-primary` muuttuja vaihtuu
3. ✅ CSS-tiedostot ladataan ilman virheitä
4. ✅ Visuaalinen ulkoasu muuttuu välittömästi
5. ✅ Console ei näytä virheitä
6. ✅ Asetukset persistoituvat (säilyvät uudelleenkäynnistyksen jälkeen)

---

## 🐛 Debuggaus

**Jos teema ei vaihdu:**
```javascript
// 1. Tarkista että bootstrap ajoi
console.log('[DEBUG] Bootstrap ran?', !!window.electronAPI)

// 2. Tarkista että applyUiPrefs on määritelty
console.log('[DEBUG] applyUiPrefs exists?', typeof applyUiPrefs)

// 3. Tarkista että CSS on ladattu
console.log('[DEBUG] CSS loaded?', !!document.querySelector('link[href*="faust-theme"]')?.sheet)

// 4. Pakota uudelleenlataus
location.reload()
```

**Jos CSS ei lataa:**
```javascript
// Tarkista polku
console.log('[DEBUG] CSS paths:', [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href))

// Tarkista onko dist/styles olemassa
// → Terminal: ls -la dist/styles/
```

---

**Päivitetty:** 21.10.2025  
**Versio:** v1.4.1  
**Status:** ✅ Kaikki toiminnot toteutettu


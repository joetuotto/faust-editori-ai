# Wrapper Fix Plan

## Ongelma
`.faust-page` wrapper puuttuu DOM:sta, joten CSS ei voi keskittää layoutia.

## Ratkaisu
Lisätään `.faust-page` wrapper AINA, ei ehdollisesti.

## CSS (jo olemassa)
```css
.faust-page { ... }  /* Base */
body.new-layout .faust-page { max-width: 820px; margin: 0 auto; }
```

## Muutos app.js:ssä
Rivi ~6433: "Main content area"

ENNEN:
```javascript
e('div', { className: 'flex flex-1 overflow-hidden ...' },
  // sidebar
  // editor
  // inspector
)
```

JÄLKEEN:
```javascript
e('div', { className: 'faust-page' },  // ← LISÄÄ WRAPPER!
  e('div', { className: 'flex flex-1 overflow-hidden ...' },
    // sidebar
    // editor  
    // inspector
  )
)
```

## Testi
1. Build
2. Toggle: Näytä → Uusi layout ☑
3. `window.debugLayout()` → `wrapper.exists: true` ✅
4. Editori keskittyy visuaalisesti ✅


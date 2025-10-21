# 🚨 Emergency Fix - ReferenceError 'tt'

**Ongelma:** Bundle.js ei päivity, vaikka build tehdään

**Syy:** Webpack cache tai vanha bundle jää muistiin

---

## 🔧 RATKAISU

**1. Puhdas build:**
```bash
rm -rf dist/*
npm run build
npm start
```

**2. Jos ei toimi, tarkista:**
```bash
# Onko bundle uusi?
ls -la dist/bundle.js

# Onko app.js muuttunut?
git diff app.js | grep "window.electronAPI.generateWithAI"
```

**3. Varmista että electron.js lataa oikean bundlen:**
```javascript
// electron.js rivit ~50:
win.loadFile('dist/index.html');  // ✅ Oikea
// EI: win.loadFile('index.html');  // ❌ Väärä
```

---

## 🐛 DEBUGGAUS

**Virhe:**
```
ReferenceError: Cannot access 'tt' before initialization
at file:///Volumes/kovalevy%203/editori%20ai/dist/bundle.js:1:54194
```

**Minified koodi:**
- `tt` = React-sisäinen muuttuja
- Virheen syy: TDZ (Temporal Dead Zone)
- Todellinen ongelma: `callAI()` käytetään ennen määrittelyä

**Korjaus tehty:**
- Rivi 6883-6897: Vaihdettu `window.electronAPI.generateWithAI()`

---

## ✅ CHECKLIST

- [ ] `rm -rf dist/*` - Poistettu vanha bundle
- [ ] `npm run build` - Rakennettu uusi bundle
- [ ] Bundle.js päivitetty (tarkista timestamp)
- [ ] `npm start` - Käynnistetty uusi versio
- [ ] Sovellus käynnistyy ilman virhettä

---

## 🎯 SEURAAVAT VAIHEET

**Jos toimii:**
- Testaa Inspector (pitäisi olla piilotettu)
- Testaa Zen Mode (Cmd/Ctrl+Enter)
- Testaa /ai inline mode

**Jos ei toimi:**
- Tarkista electron.js loadFile() polku
- Tarkista webpack.config.js output
- Tarkista index.html script src


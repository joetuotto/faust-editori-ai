# 🚨 CRITICAL BUG - ReferenceError TDZ

**Status**: KRIITTINEN - Sovellus ei käynnisty

---

## 🐛 VIRHE

```
ReferenceError: Cannot access 'tt' before initialization
ReferenceError: Cannot access 'Xe' before initialization
```

**Minified muuttujat:**
- `tt` = React-sisäinen (Phase 3)
- `Xe` = React-sisäinen (Phase 2)

**Stack trace:**
```
at file:///Volumes/kovalevy%203/editori%20ai/dist/bundle.js:1:54194
at mf (react-dom.production.min.js:105:412)
at Qk (react-dom.production.min.js:250:214)
```

---

## 📊 TESTATTUJA VERSIOITA

| Versio | Commit | Status | Virhe |
|--------|--------|--------|-------|
| Phase 3 | e273fe5 + ede0d4d | ❌ Ei toimi | `'tt'` |
| Phase 2 | 7c87401 | ❌ Ei toimi | `'Xe'` |
| Phase 1 | 9d4e2ae | ⏳ Testataan | ? |
| Ennen Faust | a0acfff | ⏳ Testataan | ? |

---

## 🔍 MAHDOLLISET SYYT

### 1. useState-ongelma
**Hypoteesi:** Uudet state-muuttujat käytetään ennen määrittelyä

**Phase 1-3 lisätyt statet:**
```javascript
const [isTransitioning, setIsTransitioning] = useState(false);  // Phase 2
const [zenMode, setZenMode] = useState(false);  // Phase 1
const [aiInlineActive, setAiInlineActive] = useState(false);  // Phase 3
const [aiGhostText, setAiGhostText] = useState('');  // Phase 3
```

**Ratkaisu:** Varmista että nämä määritellään ennen käyttöä

### 2. Funktio-ongelma
**Hypoteesi:** Joku funktio kutsutaan ennen määrittelyä

**Tarkista:**
- Onko kaikki funktiot määritelty ennen kuin niitä kutsutaan?
- Käytetäänkö `useCallback` oikein?

### 3. React-setup ongelma
**Hypoteesi:** CDN React vs bundled React konflikti

**index.html:**
```html
<!-- React ladataan CDN:stä -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<!-- Sitten bundle.js -->
<script src="bundle.js"></script>
```

**Ongelma:** Bundle saattaa sisältää oman React-kopion?

### 4. Webpack-ongelma
**Hypoteesi:** Minification rikkoo koodin

**Ratkaisu:** Testaa development build:
```bash
npm run dev  # Jos komento on olemassa
# TAI
webpack --mode=development
```

---

## 🎯 SEURAAVAT ASKELEET

1. ✅ Testaa Phase 0 (a0acfff) - Ennen Faust spec -muutoksia
2. Jos toimii → Ongelma on Faust spec -muutoksissa
3. Jos ei toimi → Ongelma on React-setupissa tai aiemmissa muutoksissa

---

## 🔧 RATKAISUEHDOTUKSET

### A) Poista uudet statet väliaikaisesti
```javascript
// Kommentoi pois rivit 2595, 2598, 2599, 2600
```

### B) Testaa development build
```bash
webpack --mode=development
```

### C) Tarkista webpack.config.js
```javascript
externals: {
  react: 'React',  // Käytä globaalia Reactia
  'react-dom': 'ReactDOM'
}
```

### D) Poista React CDN:stä (bundlaa mukaan)
```javascript
// webpack.config.js
// Poista externals tai muuta setuppia
```

---

## 📝 DEBUGGING KOMENNOT

```bash
# 1. Testaa vanhaa versiota
git checkout a0acfff
npm run build
npm start

# 2. Jos toimii, etsi ensimmäinen rikki commitit
git bisect start
git bisect bad HEAD
git bisect good a0acfff

# 3. Development build
webpack --mode=development
npm start

# 4. Tarkista bundle
ls -la dist/bundle.js
head -100 dist/bundle.js  # Katso mitä sisältää
```

---

## ⚠️ STATUS

**Testataan nyt:** Phase 0 (a0acfff)  
**Jos toimii:** Aloitetaan git bisect löytämään rikki commit  
**Jos ei toimi:** Ongelma on React-setupissa


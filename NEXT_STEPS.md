# 🎯 Seuraavat Askeleet - Aloitusopas

**Luotu:** 20.10.2024  
**Tilanne:** Sovellus toimii täydellisesti! ✅  
**Seuraava tavoite:** v1.2.0 - Modals Complete

---

## 🚀 Quick Start - Seuraava Kehitysistunto

### 1. Tarkista Tilanne (5 min)

```bash
# Avaa projekti
cd "/Volumes/kovalevy 3/editori ai"

# Tarkista git-tila
git status

# Tarkista että olet main-branchissa
git branch

# Testaa että sovellus toimii
npm start
```

**Pitäisi nähdä:**
- ✅ Sovellus aukeaa
- ✅ UI renderöi
- ✅ Voit avata modaaleja
- ✅ ChapterSheet tallentaa

---

### 2. Lue Dokumentaatio (10 min)

**Tärkeysjärjestyksessä:**

1. **`DEVELOPMENT_ROADMAP.md`** ⭐⭐⭐⭐⭐
   - Täydellinen kehityssuunnitelma
   - Priorisoitu backlog
   - Aikatauluehdotukset

2. **`MODALS_REBUILT.md`** ⭐⭐⭐⭐
   - Modaalien rakenne
   - Mitä puuttuu
   - Miten laajentaa

3. **`DEBUG_SESSION_SUMMARY.md`** ⭐⭐⭐
   - Mitä korjattiin
   - Miten korjattiin
   - Mitä opittiin

---

### 3. Valitse Tehtävä (5 min)

**Suositellut aloituskohdat:**

#### A) Quick Wins (1-2h, helppo)
- [ ] ESC-näppäin modaalien sulkemiseen
- [ ] Autosave-indikaattori
- [ ] Validointi: Nimi pakollinen

#### B) CharacterSheet (4-6h, keskitaso)
- [ ] Lisää bio-kentät
- [ ] Persoonallisuus-ominaisuudet
- [ ] Tallenna-nappi

#### C) Refaktorointi (3-4h, turvallinen)
- [ ] Siirrä GENRE_OPTIONS → constants.js
- [ ] Testaa että toimii

---

### 4. Luo Feature Branch (2 min)

```bash
# Aloita aina uudesta branchista!
git checkout -b feature/character-sheet-bio

# TAI
git checkout -b feature/esc-key-modals

# TAI
git checkout -b refactor/move-constants
```

---

### 5. Aloita Kehitys

**Esimerkki: ESC-näppäin modaaleihin**

#### Vaihe 1: Lisää useEffect app.js:ään

```javascript
// Lisää noin riville 2700 (muiden useEffect:ien jälkeen)

// ESC-näppäin sulkee modaalit
useEffect(() => {
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      // Sulje kaikki modaalit
      setShowCharacterSheet(false);
      setShowLocationSheet(false);
      setShowChapterSheet(false);
      setShowThreadSheet(false);
      setShowCommandPalette(false);
    }
  };
  
  window.addEventListener('keydown', handleEsc);
  return () => window.removeEventListener('keydown', handleEsc);
}, []); // Tyhjä deps = mount vain kerran
```

#### Vaihe 2: Testaa

```bash
# Käynnistä sovellus
npm start

# Testaa:
# 1. Avaa modal
# 2. Paina ESC
# 3. Modal sulkeutuu?
```

#### Vaihe 3: Committaa

```bash
git add app.js
git commit -m "feat: Lisätty ESC-näppäin modaalien sulkemiseen

- ESC sulkee kaikki modaalit
- Toimii Character, Location, Chapter, Thread ja CommandPalette
- Event listener siivotaan unmount:issa
"

# Merge main-branchiin
git checkout main
git merge feature/esc-key-modals

# Poista feature branch
git branch -d feature/esc-key-modals
```

---

## 📝 Kehityksen Workflow

### Joka Kerta:

```
1. Lue mitä pitää tehdä (Roadmap/Modals docs)
   ↓
2. Luo feature branch
   ↓
3. Tee muutos
   ↓
4. Testaa perusteellisesti
   ↓
5. Committaa
   ↓
6. Merge main-branchiin
   ↓
7. Testaa että kaikki toimii
   ↓
8. Jatka seuraavaan
```

### Jos Menee Pieleen:

```bash
# 1. Palauta viimeisin commit
git reset --hard HEAD~1

# 2. TAI palauta v1.1.0-stable
git reset --hard v1.1.0-stable

# 3. TAI hylkää muutokset
git checkout -- app.js
```

---

## 🎯 Ensimmäisen Istunnon Tavoite

**Valitse YKSI näistä:**

### Vaihtoehto A: Quick Win (1-2h)
```
✅ ESC-näppäin toimii
✅ Testattu
✅ Commitoitu
✅ Yksi ominaisuus lisää!
```

### Vaihtoehto B: CharacterSheet Aloitus (2-3h)
```
✅ Bio-kentät lisätty
✅ Nimi + Ikä + Sukupuoli
✅ Tallentaminen toimii
✅ Modal parantunut!
```

### Vaihtoehto C: Refaktorointi Aloitus (2-3h)
```
✅ constants.js luotu
✅ GENRE_OPTIONS siirretty
✅ Testattu että toimii
✅ app.js 50 riviä pienempi!
```

---

## 🧰 Hyödylliset Komennot

### Kehitys:
```bash
# Käynnistä dev-serveri
npm start

# Rakenna production build
npm run build

# Tarkista syntaksi
node -c app.js

# Webpack watch mode
npx webpack --watch --mode=development
```

### Git:
```bash
# Tila
git status

# Muutokset
git diff

# Historia
git log --oneline -10

# Branchit
git branch

# Palaa
git checkout <branch>
```

### Debuggaus:
```bash
# Avaa Chrome DevTools
# Cmd+Option+I (macOS)

# Console logs
console.log('🔍 Debug:', variable)

# React DevTools
# Asenna: chrome://extensions
```

---

## 📚 Koodin Navigointi

### app.js - Tärkeät Rivit:

```
Rivi 81-170:    Icons
Rivi 174-800:   FAUST_STYLES
Rivi 1200+:     UI Components
Rivi 2400-2700: FaustEditor - State & Functions
Rivi 2700-3000: useEffect hooks
Rivi 3000-5800: Event handlers & Functions
Rivi 5800-9400: JSX Rendering
Rivi 9400-9550: Modals
```

### Missä Muokata:

**Modaalit:**
- CharacterSheet: Rivi 9418-9440
- LocationSheet: Rivi 9442-9464
- ChapterSheet: Rivi 9466-9515
- ThreadSheet: Rivi 9517-9539

**State:**
- useState declarations: Rivi 2430-2700
- useEffect hooks: Rivi 2700-3000

**Event Handlers:**
- Rivi 3000-5800

---

## 🐛 Yleisimmät Ongelmat & Ratkaisut

### Ongelma: "Cannot read property of undefined"
```javascript
// Huono:
const value = editingCharacter.name;

// Hyvä:
const value = editingCharacter?.name || '';
```

### Ongelma: "Missing parenthesis"
```javascript
// Tarkista että jokaisella e():llä on:
// 1. Oikea määrä argumentteja
// 2. Oikea määrä sulkeita
// 3. Oikea sisennys

// Oikein:
e('div', { className: 'test' },
  e('span', null, 'Text')
)
```

### Ongelma: State ei päivity
```javascript
// Huono:
setProject({ ...project, items: newItems });

// Hyvä:
setProject(prev => ({ ...prev, items: newItems }));
```

---

## 🎊 Motivaatio

**Muista:**
- ✅ Sovellus toimii nyt!
- 🎯 Pienillä askeleilla eteenpäin
- 💪 Committaa usein
- 🧪 Testaa aina
- 📝 Dokumentoi samalla

**Seuraava milestone:**  
v1.2.0 (2 viikkoa) → Kaikki modaalit valmiit!

---

## 📞 Apua Tarvittaessa

### Dokumentaatio:
1. `DEVELOPMENT_ROADMAP.md` - Mitä tehdä
2. `DEBUG_GUIDE.md` - Miten debugata
3. `MODALS_REBUILT.md` - Modaalien rakenne
4. `REFACTORING_STATUS_CURRENT.md` - Refaktorointi

### Git-apua:
```bash
# Ohje
git --help

# Tila
git status

# Hätä: Palauta kaikki
git reset --hard v1.1.0-stable
```

---

## ✅ Checklist - Ennen Aloitusta

- [ ] Lukenut DEVELOPMENT_ROADMAP.md
- [ ] Testattu että sovellus toimii (npm start)
- [ ] Valittu tehtävä
- [ ] Luotu feature branch
- [ ] Avattu app.js editorissa
- [ ] Chrome DevTools auki
- [ ] Kahvi keitetty ☕

**→ Nyt voit aloittaa kehityksen! 🚀**

---

*Opas luotu: 20.10.2024 23:00*  
*Versio: 1.0*  
*Status: 🟢 Valmis käytettäväksi*


# 🎯 Käyttäjän pyydettyjen ominaisuuksien analyysi

**Päivämäärä**: 19.10.2025  
**Analyysi**: Erikoisominaisuudet

---

## 📋 KÄYTTÄJÄN TOIVEET

Käyttäjä halusi seuraavat ominaisuudet:

### 1. **AI-agentit tarinan jatkuvuuden valvontaan**
- **Yksi agentti**: Seuraa suurta kuvaa (tarinan jatkuvuus, kausaalisuus)
- **Toinen agentti**: Seuraa yksityiskohtia (hahmot, resurssit, ristiriidat)

### 2. **Tarinan rungon kehittely AI:n kanssa**
- Syötä tarinan runko AI:lle
- Tarkenna ja kehittele yhdessä AI:n kanssa
- Yhteistyöllinen suunnittelu

### 3. **AI voi muokata editorin tekstiä**
- AI:n täytyy kyetä pyydettäessä muokkaamaan tekstiä suoraan editorissa
- Ei pelkästään ehdotuksia, vaan suora muokkaus

---

## ✅ MITÄ LÖYTYY

### 1. **AI-Agentit** - ⚠️ OSITTAIN TOTEUTETTU

#### ✅ CharacterKeeper (Yksityiskohdat)
**Sijainti**: app.js rivit 3411-3458

**Toiminnallisuus**:
```javascript
const checkCharacterContinuity = (character) => {
  // Tarkistaa:
  // - Dialogin tyyli
  // - Psykologinen johdonmukaisuus
  // - Resurssit ja esineet
  // - Loukkaantumiset
  // - Ulkonäön muutokset
}
```

**Käyttö**: Inspector → Hahmot → 🔍 Tarkista

**Puutteet**:
- ❌ **Ei automaattinen** - Vaatii manuaalisen aktivoinnin
- ❌ **Ei jatkuva seuranta** - Ei seuraa kirjoittaessa

#### ✅ StoryKeeper (Iso kuva)
**Sijainti**: app.js rivit 3185-3246

**Toiminnallisuus**:
```javascript
const checkStoryLogic = async () => {
  // Tarkistaa:
  // - Juonen logiikka
  // - Kausaalinen yhteys
  // - Aikajana
  // - Juonilangat
  // - Ristiriidat
}
```

**Käyttö**: Inspector → Tarina → 🔍 Tarkista juoni

**Puutteet**:
- ❌ **Ei automaattinen** - Vaatii manuaalisen aktivoinnin
- ❌ **Ei reaaliaikainen** - Tarkistaa vasta kun pyydetään

#### ✅ LocationKeeper (Paikat)
**Toiminto löytyy**, mutta ei suoraan agenttimainen

---

### 2. **Tarinan rungon kehittely** - ❌ EI KUNNOLLA TOTEUTETTU

#### ⚠️ Mitä on:
- ✅ AI-paneeli (Cmd+Alt+A)
- ✅ Vapaa keskustelu AI:n kanssa
- ✅ Tekniikat-kategoria (20+ kirjoitustekniikoita)
- ✅ Story-välilehti (lukujen hallinta)

#### ❌ Mitä puuttuu:
- ❌ **Spesifinen "Tarinan runko" -työkalu**
- ❌ **Yhteistyöllinen outline-editori**
- ❌ **AI:n ehdottamat juonenkäänteet** automaattisesti
- ❌ **Rakenteen visualisointi**

**Nykyinen tapa**:
1. Avaa AI-paneeli
2. Kysy: "Auta minua kehittämään tarina jossa..."
3. AI vastaa tekstinä
4. Kopioi/liitä manuaalisesti

**Mitä pitäisi olla**:
1. "Tarinan runko" -painike
2. Interaktiivinen lomake (genren valinta, teema, hahmot)
3. AI generoi rakenteen
4. Käyttäjä muokkaa, AI reagoi
5. Tallennus suoraan project.story.outline:en

---

### 3. **AI muokkaa tekstiä editorissa** - ❌ EI TOTEUTETTU

#### ⚠️ Nykyinen tilanne:
```javascript
// AI-vastaus näytetään vain AI-paneelissa
const callAIAPI = async (prompt) => {
  // ...
  setAiResponse(result.data); // Vain AI-paneelin tekstialueella
}
```

**Mitä on**:
- ✅ AI vastaa kysymyksiin
- ✅ AI antaa ehdotuksia
- ✅ Vastaus näkyy AI-paneelissa

**Mitä EI ole**:
- ❌ **Ei funktiota joka muokkaa editorin sisältöä**
- ❌ **Ei "Korvaa teksti AI:n ehdotuksella" -nappia**
- ❌ **Ei inline-ehdotusten hyväksymistä**
- ❌ **Ei valitun tekstin korvaamista**

**Mitä pitäisi olla**:
```javascript
// Esimerkki puuttuvasta funktiosta:
const applyAISuggestion = (newText, replaceSelection = false) => {
  const activeItem = getActiveItem();
  
  if (replaceSelection && editorRef.current) {
    const editor = editorRef.current;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const currentContent = editor.value;
    
    const newContent = 
      currentContent.substring(0, start) + 
      newText + 
      currentContent.substring(end);
    
    updateItem(activeItemId, { content: newContent });
    editor.value = newContent;
    editor.focus();
  } else {
    // Lisää loppuun tai korvaa koko sisältö
    updateItem(activeItemId, { content: newText });
    if (editorRef.current) {
      editorRef.current.value = newText;
    }
  }
};
```

---

## 🔴 KRIITTISET PUUTTEET

### 1. **Automaattinen valvonta puuttuu** - PRIORITEETTI #1

**Nyt**:
- Käyttäjä kirjoittaa luvun
- Käyttäjä painaa "🔍 Tarkista"
- AI tarkistaa ja raportoi

**Pitäisi olla**:
- Käyttäjä kirjoittaa
- AI **seuraa automaattisesti** taustalla
- AI näyttää **reaaliaikaisia** varoituksia:
  - ⚠️ "Hahmo käyttää esinettä jota hänellä ei ole"
  - ⚠️ "Tämä ristiriidassa aikaisemman luvun kanssa"
  - ⚠️ "Aikajana ei täsmää"

**Toteutus**:
```javascript
// Lisää debounced watcher
useEffect(() => {
  const timer = setTimeout(() => {
    if (autoCheckEnabled && getActiveItem()?.content.length > 100) {
      // Tarkista hahmot
      checkCharacterContinuity(allCharacters, silent=true);
      // Tarkista juoni
      checkStoryLogic(silent=true);
      // Näytä inline-varoitukset editorissa
    }
  }, 3000); // 3s kirjoituksen jälkeen
  
  return () => clearTimeout(timer);
}, [activeItem?.content]);
```

---

### 2. **Tarinan runko -työkalu puuttuu** - PRIORITEETTI #2

**Tarvitaan**:
- Spesifinen modal/view "Tarinan runko"
- Interaktiivinen lomake
- AI-avusteinen generointi
- Rakenteen muokkaus
- Tallennus project.story.outline:een

**UI-mockup**:
```
┌─────────────────────────────────────────┐
│  📖 Kehitä tarinan runko AI:n kanssa    │
├─────────────────────────────────────────┤
│                                         │
│  Genre: [Psychological Thriller ▼]     │
│  Teema: [_______________________]       │
│  Päähenkilö: [___________________]      │
│                                         │
│  [🤖 Generoi runko AI:lla]              │
│                                         │
│  ┌──────────────────────────────┐      │
│  │ AI:n ehdotus:                │      │
│  │                              │      │
│  │ 1. Avaus: [____________]     │      │
│  │ 2. Triggeri: [__________]    │      │
│  │ 3. Nousu: [_____________]    │      │
│  │ 4. Käännekohta: [_______]    │      │
│  │ 5. Lasku: [_____________]    │      │
│  │ 6. Resoluutio: [________]    │      │
│  │                              │      │
│  │ [Muokkaa] [Hyväksy]          │      │
│  └──────────────────────────────┘      │
│                                         │
│  [💾 Tallenna runkoon]                  │
└─────────────────────────────────────────┘
```

---

### 3. **Tekstin muokkaus AI:lla puuttuu** - PRIORITEETTI #3

**Tarvitaan**:

#### A. Valitun tekstin muokkaus
```javascript
// Käyttäjä valitsee tekstin
// Painaa: "🤖 Paranna AI:lla"
// AI ehdottaa parannusta
// Käyttäjä hyväksyy → teksti korvataan
```

#### B. AI-vastauksen lisääminen editoriin
```javascript
// AI-paneelissa on vastaus
// Painike: "➕ Lisää editoriin"
// Käyttäjä valitsee: [Lisää loppuun / Korvaa valinta / Korvaa kaikki]
```

#### C. Inline-ehdotukset
```javascript
// AI havaitsee ongelman
// Näyttää inline-ehdotuksen editorissa
// <span class="inline-suggestion">korjattu teksti</span>
// Käyttäjä klikkaa → hyväksyy/hylkää
```

**Tarvittavat funktiot**:
```javascript
// 1. Lisää editoriin
const insertAIResponseToEditor = (text, mode) => {
  // mode: 'append', 'replace-selection', 'replace-all'
};

// 2. Korvaa valittu teksti
const replaceSelectedText = (newText) => {
  // Käytä editor.selectionStart/End
};

// 3. Näytä inline-ehdotus
const showInlineSuggestion = (position, suggestion) => {
  // Lisää overlay editoriin
};

// 4. Hyväksy ehdotus
const acceptSuggestion = (suggestionId) => {
  // Päivitä editor.value
};
```

---

## 📊 YHTEENVETO

| Ominaisuus | Status | Puuttuu |
|------------|--------|---------|
| CharacterKeeper | ⚠️ Osittain | Automaattinen seuranta |
| StoryKeeper | ⚠️ Osittain | Automaattinen seuranta |
| Tarinan runko -työkalu | ❌ Ei | Koko ominaisuus |
| AI muokkaa tekstiä | ❌ Ei | Koko ominaisuus |

**Kokonaisarvio**: 
- ✅ **Pohja on olemassa** (CharacterKeeper, StoryKeeper)
- ⚠️ **Toteutus puutteellinen** (ei automaattinen, ei reaaliaikainen)
- ❌ **2/3 pääominaisuutta puuttuu** (runko-työkalu, tekstin muokkaus)

---

## 🚀 TOTEUTUSSUUNNITELMA

### Vaihe 1: AI muokkaa tekstiä (2-3h)
**Prioriteetti**: KORKEA - Tämä on käyttäjän tärkein toive

```javascript
// 1. Lisää funktiot (30 min)
const applyAISuggestion = (newText, mode) => { /* ... */ };
const replaceSelectedText = (newText) => { /* ... */ };

// 2. Lisää UI-napit AI-paneeliin (30 min)
"➕ Lisää editoriin" → dropdown:
  - Lisää loppuun
  - Korvaa valinta
  - Korvaa kaikki

// 3. Lisää "Quick Actions" valitulle tekstille (1h)
- Valitse teksti editorissa
- Näytä popup: [Paranna] [Lyhennä] [Laajenna] [Korjaa]
- AI muokkaa, käyttäjä hyväksyy

// 4. Testaus (1h)
```

---

### Vaihe 2: Automaattinen valvonta (3-4h)
**Prioriteetti**: KESKITASO

```javascript
// 1. Lisää auto-check toggle (15 min)
<input type="checkbox" onChange={() => setAutoCheckEnabled(!autoCheckEnabled)} />
"⚙️ Automaattinen jatkuvuuden tarkistus"

// 2. Lisää debounced watcher (1h)
useEffect(() => {
  if (autoCheckEnabled) {
    // Tarkista kun käyttäjä pysähtyy kirjoittamaan
  }
}, [activeItem?.content]);

// 3. Inline-varoitukset (2h)
const showInlineWarning = (lineNumber, message) => {
  // Näytä punainen aaltoviiva + tooltip
};

// 4. Testaus (1h)
```

---

### Vaihe 3: Tarinan runko -työkalu (4-6h)
**Prioriteetti**: MATALA (mutta kiva lisä)

```javascript
// 1. Luo modal (1h)
const StoryOutlineModal = () => { /* ... */ };

// 2. AI-generointi (1h)
const generateOutlineWithAI = async (genre, theme, protagonist) => {
  // Pyydä AI:lta runko
};

// 3. Interaktiivinen muokkaus (2h)
// Käyttäjä voi muokata AI:n ehdotuksia

// 4. Tallennus (1h)
// Tallenna project.story.outline:een

// 5. Testaus (1h)
```

---

## 🎯 SUOSITUS

**Aloita Vaiheesta 1** - "AI muokkaa tekstiä"

**Miksi?**
1. Käyttäjän tärkein toive
2. Nopein toteuttaa (2-3h)
3. Näkyvä parannus UX:ään
4. Perusta muille ominaisuuksille

**Sitten Vaihe 2** - Automaattinen valvonta
**Lopuksi Vaihe 3** - Tarinan runko -työkalu

---

**Päivitetty**: 19.10.2025  
**Analyysin teki**: AI (kattava koodianalyysi)


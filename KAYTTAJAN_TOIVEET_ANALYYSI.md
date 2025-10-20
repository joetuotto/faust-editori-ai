# 🎯 Käyttäjän toiveiden toteutumisen analyysi

**Päivämäärä**: 19.10.2025  
**Tarkistus**: Erikoisominaisuudet

---

## 📋 KÄYTTÄJÄN KOLME TOIVETTA

### 1️⃣ **AI-agentit tarinan jatkuvuuden valvontaan**
- Yksi agentti seuraa **suurta kuvaa** (tarinan jatkuvuus)
- Toinen agentti seuraa **yksityiskohtia** (hahmot, resurssit)

### 2️⃣ **Tarinan rungon kehittely AI:n kanssa**
- Syötä tarinan runko AI:lle
- Tarkenna ja kehittele **yhdessä** AI:n kanssa

### 3️⃣ **AI voi muokata editorin tekstiä**
- AI:n täytyy kyetä **pyydettäessä** muokkaamaan tekstiä suoraan editorissa

---

## ✅❌ TOTEUTUMINEN

### 1️⃣ AI-agentit - ⚠️ **OSITTAIN TOTEUTETTU** (70%)

#### ✅ **LÖYTYY:**

**A. CharacterKeeper** - Yksityiskohtien valvoja
- **Sijainti**: `app.js:3411-3458`
- **Toiminto**: `checkCharacterContinuity(character)`
- **Tarkistaa**:
  - Dialogin tyyli ja ääni
  - Psykologinen johdonmukaisuus (tavoitteet vs. teot)
  - Resurssit ja esineet (käyttääkö jotain mitä ei ole?)
  - Loukkaantumiset (mainitaanko, huomioidaanko?)
  - Ulkonäön muutokset

**Käyttö**: `Inspector → Hahmot → 🔍 Tarkista`

**B. StoryKeeper** - Ison kuvan valvoja
- **Sijainti**: `app.js:3185-3246`
- **Toiminto**: `checkStoryLogic()`
- **Tarkistaa**:
  - Juonen logiikka
  - Kausaalinen yhteys (syy-seuraussuhteet)
  - Aikajana
  - Juonilangat
  - Ristiriidat aikaisempien lukujen kanssa

**Käyttö**: `Inspector → Tarina → 🔍 Tarkista juoni`

**C. LocationKeeper** - Paikkojen valvoja
- **Sijainti**: `app.js (LocationKeeper)`
- **Toiminto**: Tunnistaa paikat, tarkistaa kuvaukset
- **Käyttö**: `Inspector → Paikat`

#### ❌ **PUUTTUU:**

1. **Automaattinen seuranta**
   - Agentit eivät seuraa **reaaliaikaisesti** kun kirjoitat
   - Täytyy manuaalisesti painaa "🔍 Tarkista"
   - Ei debounced auto-tarkistusta

2. **Inline-varoitukset**
   - Ei näytä varoituksia suoraan editorissa
   - Ei punaisia aaltoviivoja ristiriitakohdissa
   - Kaikki palaute AI-paneelissa

**Esimerkki mitä pitäisi olla**:
```
Käyttäjä kirjoittaa: "Hän otti taskustaan avaimen..."
                                    ^^^^^^^^
                                    ⚠️ Hänellä ei ole avainta!
                                    (Lisätty luvussa 3, mutta hän 
                                     antoi sen pois luvussa 5)
```

#### 🎯 **ARVIO**: ⚠️ 70% valmis
- ✅ Logiikka toimii
- ✅ AI-tarkistukset toimivat
- ❌ Ei automaattinen
- ❌ Ei reaaliaikainen

---

### 2️⃣ Tarinan runko - ⚠️ **OSITTAIN TOTEUTETTU** (60%)

#### ✅ **LÖYTYY:**

**A. AI-keskustelu**
- Voit avata AI-paneelin (`Cmd+Alt+A`)
- Kysyä: "Auta minua kehittämään tarina jossa..."
- AI vastaa ja antaa ideoita

**B. Story-välilehti**
- `Inspector → Tarina`
- Voit luoda lukuja
- Lisätä juonilankoja (threads)
- Seurata timeline:a

**C. Kirjoitustekniikat**
- 20+ tekniikkaa tarinan suunnitteluun
- "Tarinan rakenne", "Juonenkäänteet" jne.
- AI:lta voi pyytää apua

#### ❌ **PUUTTUU:**

1. **Spesifinen "Kehitä runko" -työkalu**
   - Ei erillistä modaalia/näkymää rungon kehittelyyn
   - Ei interaktiivista lomaketta
   - Ei strukturoitua prosessia

2. **Yhteistyöllinen kehittely**
   - AI ei "muista" aikaisempia vaiheita
   - Jokainen kysymys on erillinen
   - Ei vaiheittaista prosessia (Step 1 → 2 → 3)

3. **Visuaalinen runko**
   - Ei visuaalista rakennetta (kaavio, kortit)
   - Ei drag & drop -muokkausta
   - Kaikki tekstimuodossa

**Mitä pitäisi olla**:
```
┌──────────────────────────────────────┐
│  📖 Kehitä tarinan runko             │
├──────────────────────────────────────┤
│  Vaihe 1/5: Perustiedot              │
│                                      │
│  Genre: [Psychological Thriller ▼]  │
│  Teema: [Luottamus ja pettämys]     │
│  Sävy: [Tumma, jännittävä]          │
│                                      │
│  [Seuraava] →                        │
└──────────────────────────────────────┘

↓ AI ehdottaa

┌──────────────────────────────────────┐
│  Vaihe 2/5: Päähenkilö               │
│                                      │
│  AI:n ehdotus:                       │
│  "Sarah, 35, psykiatri, jonka       │
│   menneisyydessä pimeä salaisuus..." │
│                                      │
│  [Muokkaa] [Hyväksy] [Ehdota uusi]  │
└──────────────────────────────────────┘

...jne.
```

#### 🎯 **ARVIO**: ⚠️ 60% valmis
- ✅ AI auttaa kysyttäessä
- ✅ Voit tallentaa rakenteen
- ❌ Ei strukturoitua prosessia
- ❌ Ei yhteistyöllistä kehittelyä

---

### 3️⃣ AI muokkaa tekstiä - ✅ **OSITTAIN TOTEUTETTU** (50%)

#### ✅ **LÖYTYY:**

**"Lisää tekstiin" -nappi**
- **Sijainti**: `app.js:2502-2511` + `app.js:4786-4788`
- **Toiminto**: `insertAiResponse()`
- **Mitä tekee**:
  ```javascript
  const insertAiResponse = () => {
    const newContent = 
      (activeItem?.content || '') + 
      '\n\n' + 
      aiResponse;
    
    updateItem(activeItemId, { content: newContent });
    editorRef.current.value = newContent;
  };
  ```

**Käyttö**:
1. Kysy AI:lta jotain
2. AI vastaa
3. Paina **"Lisää tekstiin"** -nappia
4. AI:n vastaus lisätään editorin **loppuun**

#### ❌ **PUUTTUU:**

1. **Valitun tekstin korvaaminen**
   ```
   Käyttäjä: Valitsee tekstin editorissa
            → Painaa "🤖 Paranna AI:lla"
            → AI ehdottaa parannusta
            → Käyttäjä hyväksyy
            → Valittu teksti KORVATAAN
   
   NYT: Ei mahdollista! Vain lisääminen loppuun.
   ```

2. **Valinnat mitä tehdä**
   ```
   NYT:  [Lisää tekstiin] → Lisää vain loppuun
   
   PITÄISI:  [Lisää tekstiin ▼]
              ├─ Lisää loppuun
              ├─ Korvaa valinta
              ├─ Korvaa kaikki
              └─ Lisää kursorin kohtaan
   ```

3. **Inline-ehdotukset**
   ```
   AI: "Havaitsin ongelman rivillä 45"
       
       NYT: Vain teksti AI-paneelissa
       
       PITÄISI: Näkyy editorissa:
                "Hän meni taloon" 
                  ~~~~~~~~~~~
                  💡 AI ehdottaa: "Hän käveli taloon"
                  [Hyväksy] [Hylkää]
   ```

4. **Quick Actions valitulle tekstille**
   ```
   Valitse teksti → Popup:
   [✨ Paranna]
   [📏 Lyhennä]
   [📖 Laajenna]
   [✅ Korjaa kielioppi]
   [🎨 Muuta sävy...]
   ```

#### 🎯 **ARVIO**: ⚠️ 50% valmis
- ✅ AI-vastauksen lisääminen toimii
- ❌ Ei voi korvata valintaa
- ❌ Ei inline-ehdotuksia
- ❌ Ei quick actions:ia

---

## 📊 YHTEENVETO

| Toive | Toteutuminen | Puuttuu | Prioriteetti |
|-------|--------------|---------|--------------|
| 1. AI-agentit | ⚠️ 70% | Automaattinen seuranta | 🟡 Keskitaso |
| 2. Tarinan runko | ⚠️ 60% | Strukturoitu prosessi | 🟢 Matala |
| 3. Tekstin muokkaus | ⚠️ 50% | Valitun tekstin korvaus | 🔴 Korkea |

### Kokonaisarvio: ⚠️ **60% VALMIS**

**Mitä toimii hyvin:**
- ✅ CharacterKeeper ja StoryKeeper -logiikka
- ✅ AI-keskustelu
- ✅ "Lisää tekstiin" -nappi

**Mitä tarvitaan:**
1. **Valitun tekstin korvaaminen AI:lla** ← TÄRKEIN!
2. **Automaattinen jatkuvuuden valvonta** ← HYÖDYLLISIN!
3. **Strukturoitu runko-työkalu** ← NICE-TO-HAVE

---

## 🚀 TOTEUTUSSUUNNITELMA (Prioriteettijärjestyksessä)

### 🔴 PRIORITEETTI #1: Valitun tekstin korvaaminen (2-3h)

**Miksi tämä ensin?**
- Käyttäjän tärkein toive
- Nopea toteuttaa
- Suurin UX-parannus
- Perusta muille ominaisuuksille

**Toteutus:**

```javascript
// 1. Lisää funktio valitun tekstin korvaamiseen
const replaceSelectedText = (newText) => {
  if (!editorRef.current) return;
  
  const editor = editorRef.current;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  
  if (start === end) {
    // Ei valintaa → lisää kursorin kohtaan
    const content = editor.value;
    const newContent = 
      content.substring(0, start) + 
      newText + 
      content.substring(start);
    
    updateItem(activeItemId, { content: newContent });
    editor.value = newContent;
    editor.setSelectionRange(start + newText.length, start + newText.length);
  } else {
    // Korvaa valinta
    const content = editor.value;
    const newContent = 
      content.substring(0, start) + 
      newText + 
      content.substring(end);
    
    updateItem(activeItemId, { content: newContent });
    editor.value = newContent;
    editor.setSelectionRange(start, start + newText.length);
  }
  
  editor.focus();
};

// 2. Muokkaa insertAiResponse dropdown:iksi
const insertAiResponse = (mode = 'append') => {
  if (!aiResponse) return;
  
  switch (mode) {
    case 'append':
      // Nykyinen toiminta
      const activeItem = getActiveItem();
      const newContent = (activeItem?.content || '') + '\n\n' + aiResponse;
      updateItem(activeItemId, { content: newContent });
      if (editorRef.current) {
        editorRef.current.value = newContent;
      }
      break;
      
    case 'replace-selection':
      replaceSelectedText(aiResponse);
      break;
      
    case 'replace-all':
      updateItem(activeItemId, { content: aiResponse });
      if (editorRef.current) {
        editorRef.current.value = aiResponse;
      }
      break;
      
    case 'at-cursor':
      replaceSelectedText(aiResponse);
      break;
  }
  
  setAiResponse('');
};

// 3. Lisää Quick Actions valitulle tekstille
const [selectedText, setSelectedText] = useState('');
const [showQuickActions, setShowQuickActions] = useState(false);
const [quickActionsPosition, setQuickActionsPosition] = useState({ top: 0, left: 0 });

const handleTextSelection = () => {
  if (!editorRef.current) return;
  
  const editor = editorRef.current;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  
  if (start !== end) {
    const selected = editor.value.substring(start, end);
    setSelectedText(selected);
    
    // Laske position (yksinkertaistettu)
    const rect = editor.getBoundingClientRect();
    setQuickActionsPosition({
      top: rect.top - 60,
      left: rect.left + (rect.width / 2)
    });
    
    setShowQuickActions(true);
  } else {
    setShowQuickActions(false);
  }
};

// 4. Quick Actions -komponentti
const QuickActions = () => {
  if (!showQuickActions) return null;
  
  const actions = [
    { icon: '✨', label: 'Paranna', action: 'improve' },
    { icon: '📏', label: 'Lyhennä', action: 'shorten' },
    { icon: '📖', label: 'Laajenna', action: 'expand' },
    { icon: '✅', label: 'Korjaa', action: 'fix' }
  ];
  
  const handleAction = async (action) => {
    const prompts = {
      improve: `Paranna tätä tekstiä (säilytä merkitys, paranna tyyliä):\n\n${selectedText}`,
      shorten: `Lyhennä tätä tekstiä puoleen (säilytä ydinsisältö):\n\n${selectedText}`,
      expand: `Laajenna tätä tekstiä (lisää yksityiskohtia):\n\n${selectedText}`,
      fix: `Korjaa kielioppi- ja tyylvirheet:\n\n${selectedText}`
    };
    
    setShowQuickActions(false);
    await callAIAPI(prompts[action], false);
    // Kun AI vastaa, näytä "Korvaa valinta" -nappi
  };
  
  return e('div', {
    className: 'fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-2 flex gap-1',
    style: {
      top: `${quickActionsPosition.top}px`,
      left: `${quickActionsPosition.left}px`,
      transform: 'translateX(-50%)'
    }
  },
    actions.map(({ icon, label, action }) =>
      e('button', {
        key: action,
        onClick: () => handleAction(action),
        className: 'px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm',
        title: label
      }, icon)
    )
  );
};

// 5. Lisää editoriin onMouseUp-event
<textarea
  ref={editorRef}
  onMouseUp={handleTextSelection}
  onKeyUp={handleTextSelection}
  // ... muut propsit
/>
```

**UI-muutokset:**

```javascript
// AI-paneelissa: Muuta "Lisää tekstiin" -nappi dropdown:iksi
aiResponse && e('div', { className: 'flex gap-2' },
  e('button', {
    onClick: () => insertAiResponse('replace-selection'),
    disabled: !selectedText,
    className: 'flex-1 px-3 py-2 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50',
    title: selectedText ? 'Korvaa valittu teksti' : 'Valitse ensin teksti editorissa'
  }, selectedText ? '↺ Korvaa valinta' : 'Valitse teksti'),
  
  e('div', { className: 'relative' },
    e('button', {
      onClick: () => setShowInsertMenu(!showInsertMenu),
      className: 'px-3 py-2 rounded bg-purple-600 text-white hover:bg-purple-700'
    }, '▼'),
    
    showInsertMenu && e('div', {
      className: 'absolute right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-1 min-w-[150px]'
    },
      e('button', {
        onClick: () => insertAiResponse('append'),
        className: 'w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm'
      }, '➕ Lisää loppuun'),
      
      e('button', {
        onClick: () => insertAiResponse('at-cursor'),
        className: 'w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm'
      }, '📍 Lisää kursorin kohtaan'),
      
      e('button', {
        onClick: () => insertAiResponse('replace-all'),
        className: 'w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm text-red-600'
      }, '⚠️ Korvaa kaikki')
    )
  )
)
```

**Aika**: 2-3h  
**Vaikeus**: Keskitaso  
**Vaikutus**: ⭐⭐⭐⭐⭐ (Erittäin suuri)

---

### 🟡 PRIORITEETTI #2: Automaattinen jatkuvuuden valvonta (3-4h)

**Toteutus:**

```javascript
// 1. Lisää toggle Inspector:iin
const [autoCheckEnabled, setAutoCheckEnabled] = useState(false);

// Inspector → Hahmot
e('div', { className: 'flex items-center justify-between mb-2' },
  e('label', { className: 'text-xs flex items-center gap-2' },
    e('input', {
      type: 'checkbox',
      checked: autoCheckEnabled,
      onChange: (ev) => setAutoCheckEnabled(ev.target.checked)
    }),
    '⚙️ Automaattinen valvonta'
  )
);

// 2. Debounced watcher
useEffect(() => {
  if (!autoCheckEnabled) return;
  
  const timer = setTimeout(async () => {
    const content = getActiveItem()?.content;
    if (!content || content.length < 100) return;
    
    // Tarkista hahmot (silent mode)
    const issues = await checkAllCharactersQuietly(content);
    
    // Tarkista juoni
    const storyIssues = await checkStoryQuietly(content);
    
    // Näytä inline-varoitukset
    setInlineWarnings([...issues, ...storyIssues]);
    
  }, 3000); // 3s kirjoituksen jälkeen
  
  return () => clearTimeout(timer);
}, [activeItem?.content, autoCheckEnabled]);

// 3. Inline-varoitukset editorissa
const [inlineWarnings, setInlineWarnings] = useState([]);

// Renderöi varoitukset editorin päällä
{inlineWarnings.length > 0 && e('div', {
  className: 'absolute top-2 right-2 bg-yellow-500/90 text-black px-3 py-2 rounded-lg shadow-xl max-w-xs'
},
  e('div', { className: 'text-xs font-bold mb-1' }, '⚠️ Jatkuvuusvaroitukset'),
  ...inlineWarnings.map((warning, i) =>
    e('div', { key: i, className: 'text-xs mt-1' }, `• ${warning}`)
  )
)}
```

**Aika**: 3-4h  
**Vaikeus**: Keskitaso  
**Vaikutus**: ⭐⭐⭐⭐ (Suuri)

---

### 🟢 PRIORITEETTI #3: Strukturoitu runko-työkalu (4-6h)

**Jätetään myöhemmäksi** - Saat saman tuloksen nykyisellä AI-paneelilla, vaikka ei olekaan yhtä elegantisti.

---

## 💡 SUOSITUS KÄYTTÄJÄLLE

### ✅ **MITÄ VOI TEHDÄ HETI NYT:**

1. **Hahmomjen jatkuvuuden valvonta:**
   - Inspector → Hahmot → Lisää hahmot
   - Kirjoita luku
   - Paina "🔍 Tarkista" → AI tarkistaa jatkuvuuden

2. **Juonen valvonta:**
   - Inspector → Tarina → Lisää lukuja
   - Paina "🔍 Tarkista juoni" → AI tarkistaa logiikan

3. **Tarinan rungon kehittely:**
   - Avaa AI-paneeli (Cmd+Alt+A)
   - Kysy: "Auta minua luomaan runko tarinalle jossa..."
   - AI vastaa
   - Kopioi ideat Story-välilehdelle

4. **Tekstin lisääminen:**
   - Kysy AI:lta jotain
   - Paina "Lisää tekstiin" → Teksti lisätään loppuun

---

### 🔧 **MITÄ VOIN LISÄTÄ SINULLE:**

Jos haluat, voin toteuttaa **Prioriteetin #1** (Valitun tekstin korvaaminen) nyt:

**Lisättävät ominaisuudet:**
- ✅ Valitse teksti editorissa
- ✅ Quick Actions -popup (Paranna/Lyhennä/Laajenna/Korjaa)
- ✅ "Korvaa valinta" -nappi AI-paneelissa
- ✅ Dropdown: Lisää loppuun / Korvaa valinta / Korvaa kaikki

**Aika**: ~2-3h koodausta

**Haluatko että teen tämän?** 🚀

---

**Yhteenveto**: Projektissasi ON jo hyvä pohja kaikille kolmelle toiveelle, mutta ne tarvitsevat lisäkehitystä ollakseen täysin käyttäjän vision mukaisia. Tärkein puute on valitun tekstin korvaaminen AI:lla.


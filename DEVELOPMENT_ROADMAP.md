# 🗺️ FAUST - Kehityssuunnitelma

**Luotu:** 20.10.2024 22:55  
**Versio:** v1.1.0-stable → v2.0.0  
**Arvioitu kokonaisaika:** 40-60 tuntia

---

## 🎯 Tavoitteet

### Lyhyen Aikavälin (1-2 viikkoa)
1. ✅ **Sovellus toimii** (VALMIS!)
2. 🔄 Täydennä modaalien toiminnallisuus
3. 🔄 Paranna käyttäjäkokemusta
4. 🔄 Lisää puuttuvat ominaisuudet

### Keskipitkän Aikavälin (1-2 kuukautta)
1. Refaktoroi koodi modulaariseksi
2. Lisää automaattiset testit
3. Paranna suorituskykyä
4. Julkaise beta-versio

### Pitkän Aikavälin (3-6 kuukautta)
1. Lisää cloud-synkronointi
2. Multi-projekti tuki
3. Plugin-järjestelmä
4. Virallinen julkaisu v2.0

---

## 📅 Priorisoitu Backlog

### 🔥 KRIITTINEN (Viikko 1-2)

#### 1. CharacterSheet Modal - Täydellinen Toiminnallisuus
**Aika:** 4-6h  
**Prioriteetti:** ⭐⭐⭐⭐⭐

**Tehtävät:**
- [ ] Bio-kentät
  - [ ] Nimi (teksti-input)
  - [ ] Ikä (numero-input)
  - [ ] Sukupuoli (dropdown)
  - [ ] Ulkonäkö (textarea)
- [ ] Persoonallisuus
  - [ ] Traits (tags/chips)
  - [ ] Motivaatiot (lista)
  - [ ] Pelot (lista)
- [ ] Suhteet
  - [ ] Suhdelista muihin hahmoihin
  - [ ] Suhteen tyyppi (ystävä, vihollinen, perhe)
  - [ ] Kuvaus
- [ ] Tarinan kaari
  - [ ] Aloitus (textarea)
  - [ ] Kehitys (textarea)
  - [ ] Lopputulos (textarea)
- [ ] Tallenna & Peruuta -napit
- [ ] Validointi (nimi pakollinen)

**Tekninen toteutus:**
```javascript
// app.js sisällä (later: separate file)
const CharacterSheetForm = () => {
  // Form fields
  // Validation
  // Save handler
  return e('form', { onSubmit: handleSave }, ...)
}
```

---

#### 2. LocationSheet Modal - Täydellinen Toiminnallisuus
**Aika:** 3-4h  
**Prioriteetti:** ⭐⭐⭐⭐

**Tehtävät:**
- [ ] Perustiedot
  - [ ] Nimi (teksti)
  - [ ] Tyyppi (dropdown: Koti, Kaupunki, Luonto, jne.)
  - [ ] Kuvaus (textarea)
- [ ] Atmosfääri
  - [ ] Tunnelma (dropdown: Rauhallinen, Jännittävä, jne.)
  - [ ] Väripaletti (color picker tai preset)
  - [ ] Äänet/tuoksut (textarea)
- [ ] Käyttö tarinassa
  - [ ] Esiintymiskerrat (automaattinen laskuri)
  - [ ] Tärkeys (dropdown: Pää, Sivu, Mainittu)
- [ ] Tallenna & Peruuta

---

#### 3. ThreadSheet Modal - Täydellinen Toiminnallisuus
**Aika:** 3-4h  
**Prioriteetti:** ⭐⭐⭐⭐

**Tehtävät:**
- [ ] Perustiedot
  - [ ] Nimi (teksti)
  - [ ] Tyyppi (dropdown: Pääjuoni, Sivujuoni, Teema)
  - [ ] Kuvaus (textarea)
- [ ] Status
  - [ ] Tila (dropdown: Avoin, Kehittyy, Ratkaistu)
  - [ ] Progress bar (%)
- [ ] Liitokset
  - [ ] Liittyvät hahmot (multi-select)
  - [ ] Liittyvät paikat (multi-select)
  - [ ] Liittyvät luvut (multi-select)
- [ ] Timeline
  - [ ] Aloitusluku
  - [ ] Nykyinen vaihe
  - [ ] Arvioitu ratkaisu (luku)
- [ ] Tallenna & Peruuta

---

#### 4. ChapterSheet - Lisää Ominaisuuksia
**Aika:** 2-3h  
**Prioriteetti:** ⭐⭐⭐

**Tehtävät:**
- [ ] Yhteenveto (synopsis)
- [ ] Tavoite (word count goal)
- [ ] Status (dropdown: Suunnitelma, Luonnos, Revisio, Valmis)
- [ ] Muistiinpanot (textarea)
- [ ] Metadata
  - [ ] POV-hahmo
  - [ ] Aikaleima (aika tarinassa)
  - [ ] Tunnelma

---

### 🎨 TÄRKEÄ (Viikko 3-4)

#### 5. ESC-näppäin Modaalien Sulkemiseen
**Aika:** 1-2h  
**Prioriteetti:** ⭐⭐⭐

**Toteutus:**
```javascript
useEffect(() => {
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      setShowCharacterSheet(false);
      setShowLocationSheet(false);
      // etc...
    }
  };
  window.addEventListener('keydown', handleEsc);
  return () => window.removeEventListener('keydown', handleEsc);
}, []);
```

---

#### 6. Modaalien Validointi
**Aika:** 2-3h  
**Prioriteetti:** ⭐⭐⭐

**Tehtävät:**
- [ ] Pakollisten kenttien tarkistus
- [ ] Error-viestit
- [ ] Estä tallennus jos virheitä
- [ ] Visual feedback (punainen border virheellisillä kentillä)

---

#### 7. Autosave-indikaattori
**Aika:** 1-2h  
**Prioriteetti:** ⭐⭐⭐

**Tehtävät:**
- [ ] "Tallennettu" -teksti (fade out 2s jälkeen)
- [ ] "Tallentaa..." spinner
- [ ] "Tallennus epäonnistui" -varoitus
- [ ] Sijainti: Yläpalkin oikeassa reunassa

---

#### 8. Undo/Redo -historia
**Aika:** 4-6h  
**Prioriteetti:** ⭐⭐⭐

**Tehtävät:**
- [ ] Command pattern -toteutus
- [ ] Max 50 undo-askelta
- [ ] Cmd+Z / Cmd+Shift+Z toimii kaikille muutoksille
- [ ] Visual feedback (toast: "Muutos peruttu")

---

### 🚀 KEHITTÄMINEN (Viikko 5-8)

#### 9. Projektin Vienti - Parempi Export
**Aika:** 6-8h  
**Prioriteetti:** ⭐⭐⭐

**Tehtävät:**
- [ ] **PDF-vienti:**
  - [ ] Oikea sivutus
  - [ ] Sisällysluettelo
  - [ ] Metadata (kirjailija, otsikko)
  - [ ] Fontti-asetukset
- [ ] **DOCX-vienti:**
  - [ ] Muotoilut säilyvät
  - [ ] Luvut omina kappaleina
  - [ ] Metadata
- [ ] **Export-modaali:**
  - [ ] Valitse formaatti
  - [ ] Asetukset per formaatti
  - [ ] Progress bar
  - [ ] Tallennuspaikan valinta

---

#### 10. Hakutoiminto - Parannettu Search
**Aika:** 4-6h  
**Prioriteetti:** ⭐⭐⭐

**Tehtävät:**
- [ ] Hae koko projektista
- [ ] Regex-tuki
- [ ] Case-sensitive toggle
- [ ] Korvaa kaikki -toiminto
- [ ] Hakuhistoria (viimeiset 10)
- [ ] Tulokset: Näytä luku ja konteksti
- [ ] Navigoi tuloksiin (ylös/alas -nuolet)

---

#### 11. Hahmojen Visuaalinen Kartta
**Aika:** 8-10h  
**Prioriteetti:** ⭐⭐

**Tehtävät:**
- [ ] Hahmot verkkokarttana
- [ ] Suhteet viivoina
- [ ] Zoom & pan
- [ ] Klikkaa hahmoa → avaa CharacterSheet
- [ ] Värikoodaus (protagonisti, antagonisti, sivu)
- [ ] Käytä library: react-force-graph tai d3.js

**Toteutus:**
```javascript
// Uusi komponentti
const CharacterMap = ({ characters }) => {
  // Force-directed graph
  // Nodes = characters
  // Links = relationships
}
```

---

#### 12. Juonen Timeline-visualisointi
**Aika:** 6-8h  
**Prioriteetti:** ⭐⭐

**Tehtävät:**
- [ ] Aikajana (vaaka tai pysty)
- [ ] Luvut ajanjanalla
- [ ] Juonenlangat värillisina kaistoina
- [ ] Hahmot ikoneina
- [ ] Hover: Näytä yhteenveto
- [ ] Klikkaa → avaa luku

---

### 🏗️ REFAKTOROINTI (Jatkuva)

#### 13. Vakioiden Erottaminen (VAIHE 1)
**Aika:** 3-4h  
**Prioriteetti:** ⭐⭐

**Tehtävät:**
- [x] Icons → `src/utils/icons.js` (VALMIS!)
- [ ] GENRE_OPTIONS → `src/utils/constants.js`
- [ ] LOCATION_TYPES → `src/utils/constants.js`
- [ ] FAUST_STYLES → `src/utils/styles.js`
- [ ] Testaa että sovellus toimii

---

#### 14. Modaalien Erottaminen (VAIHE 2)
**Aika:** 8-12h  
**Prioriteetti:** ⭐⭐

**Tehtävät:**
- [ ] CharacterSheet → `src/components/modals/CharacterSheet.js`
- [ ] LocationSheet → `src/components/modals/LocationSheet.js`
- [ ] ChapterSheet → `src/components/modals/ChapterSheet.js`
- [ ] ThreadSheet → `src/components/modals/ThreadSheet.js`
- [ ] Props-välitys suunnittelu
- [ ] Testaa jokainen erikseen

---

#### 15. State Management (VAIHE 3)
**Aika:** 12-16h  
**Prioriteetti:** ⭐

**Tehtävät:**
- [ ] useContext + useReducer
- [ ] ProjectContext
- [ ] UIContext (modals, panels)
- [ ] Siirrä state pois FaustEditor:ista
- [ ] Custom hooks (useProject, useUI)

---

### 🧪 TESTAUS & LAATU (Viikko 9-10)

#### 16. Yksikkötestit
**Aika:** 10-15h  
**Prioriteetti:** ⭐⭐

**Tehtävät:**
- [ ] Jest + React Testing Library
- [ ] Testaa modaalit
- [ ] Testaa utils-funktiot
- [ ] Testaa state-muutokset
- [ ] Coverage > 60%

---

#### 17. E2E-testit
**Aika:** 8-12h  
**Prioriteetti:** ⭐

**Tehtävät:**
- [ ] Playwright tai Cypress
- [ ] Testaa päätoiminnot:
  - [ ] Luo projekti
  - [ ] Lisää luku
  - [ ] Kirjoita tekstiä
  - [ ] Tallenna
  - [ ] Vie PDF
- [ ] CI/CD pipeline (GitHub Actions)

---

### 🎁 UUDET OMINAISUUDET (Viikko 11+)

#### 18. Dark/Light Mode - Parannettu Siirtymä
**Aika:** 3-4h  
**Prioriteetti:** ⭐⭐

**Tehtävät:**
- [ ] Alkemialliset symbolit transition:ssa
- [ ] Ääniefekti (optionaalinen)
- [ ] "Rituaali" animaatio
- [ ] Muista valinta (localStorage)

---

#### 19. AI-integraatio - Parannus
**Aika:** 8-12h  
**Prioriteetti:** ⭐⭐

**Tehtävät:**
- [ ] Multiple AI providers
- [ ] Streaming responses
- [ ] Token-laskuri
- [ ] Kustannusarvio
- [ ] Prompt-templaatit
- [ ] Chat-historia eri AI:lle

---

#### 20. Yhteistyöominaisuudet (Futuuri)
**Aika:** 20-30h  
**Prioriteetti:** ⭐

**Tehtävät:**
- [ ] Cloud-synkronointi
- [ ] Useampi käyttäjä per projekti
- [ ] Kommentointi
- [ ] Versionhallinta (kuin Git)
- [ ] Conflict resolution

---

## 📊 Aikatauluehdotus

### Viikko 1-2: Modaalit (Kriittinen)
```
Ma-Ti:  CharacterSheet täydentäminen (6h)
Ke-To:  LocationSheet + ThreadSheet (8h)
Pe:     ChapterSheet lisäominaisuudet (3h)
La-Su:  Testaus ja bugit (4h)

Yhteensä: ~21h
```

### Viikko 3-4: UX-parannus (Tärkeä)
```
Ma:     ESC-näppäin + validointi (4h)
Ti-Ke:  Autosave-indikaattori + Undo/Redo (8h)
To-Pe:  Hakutoiminto (6h)
La-Su:  Testaus (3h)

Yhteensä: ~21h
```

### Viikko 5-8: Kehittäminen
```
Export-parannus (8h)
Visualisoinnit (16h)
Refaktorointi Vaihe 1 (4h)
Testaus (4h)

Yhteensä: ~32h
```

### Viikko 9-12: Laatu & Uudet
```
Refaktorointi Vaihe 2-3 (24h)
Testit (20h)
AI-parannus (10h)
Polish (6h)

Yhteensä: ~60h
```

---

## 🎯 Milestone-tavoitteet

### v1.2.0 - "Modals Complete" (2 viikkoa)
- ✅ Kaikki modaalit täysin toiminnalliset
- ✅ Validointi
- ✅ ESC-näppäin
- ✅ Bugit korjattu

### v1.5.0 - "Enhanced UX" (1 kuukausi)
- ✅ Undo/Redo
- ✅ Parannettu haku
- ✅ Parempi export
- ✅ Autosave-indikaattori

### v1.8.0 - "Visualizations" (2 kuukautta)
- ✅ Hahmokartta
- ✅ Timeline
- ✅ Refaktorointi Vaihe 1

### v2.0.0 - "Production Ready" (3 kuukautta)
- ✅ Täysin refaktoroitu
- ✅ Testit (>60% coverage)
- ✅ CI/CD
- ✅ Dokumentaatio
- ✅ Installer

---

## 💡 Quick Wins (Helpot & Nopeat)

Nämä voi tehdä nopeasti välissä:

1. **ESC-näppäin modaaleihin** (1h) ⚡
2. **Tallenna-nappi ChapterSheet:iin** (30min) ⚡
3. **Validointi: Nimi pakollinen** (1h) ⚡
4. **Autosave-indikaattori** (1h) ⚡
5. **Dark mode -valinta säilyy** (30min) ⚡
6. **Hahmojen lukumäärä sidebar:iin** (30min) ⚡
7. **Word count per luku** (1h) ⚡
8. **Viimeisin muokkaus -aika** (30min) ⚡

**Yhteensä:** ~6h, mutta suuri vaikutus käyttökokemukseen!

---

## 🚨 Tärkeät Muistutukset

### Ennen Uutta Ominaisuutta:
1. ✅ Committaa nykytila
2. ✅ Luo feature-branch
3. ✅ Testaa perusteellisesti
4. ✅ Merge vain jos toimii

### Kehityksen Aikana:
- 📝 Dokumentoi samalla
- 🧪 Testaa usein
- 🐛 Korjaa bugit heti
- ⏱️ Pidä taukoja (Pomodoro)

### Jälkeen:
- ✅ Code review (itse tai työkalu)
- ✅ Testaa koko sovellus
- ✅ Päivitä README
- ✅ Committaa

---

## 📚 Resurssit

### Dokumentaatio:
- `README.md` - Yleiskatsaus
- `DEBUG_SESSION_SUMMARY.md` - Mitä korjattiin
- `MODALS_REBUILT.md` - Modaalien rakenne
- `REFACTORING_STATUS_CURRENT.md` - Refaktoroinnin tila

### Koodin Rakenne:
```
app.js (9500 riviä)
├── Icons (rivi 81-170)
├── FAUST_STYLES (rivi 174-800+)
├── Components (rivi 1200+)
├── FaustEditor (rivi 2400+)
└── Modals (rivi 9418-9539)
```

### Työkalut:
- Git (version control)
- VS Code (editor)
- Chrome DevTools (debugging)
- React DevTools (component inspection)

---

## 🎊 Motivaatio

**Muista:**
- ✅ Sovellus toimii NYT!
- 🎯 Jokainen parannus tekee siitä paremman
- 🚀 Pienillä askelilla pitkälle
- 💪 Sinä pystyt tähän!

**Seuraava milestone:**  
v1.2.0 - Modals Complete (2 viikkoa)

**Aloita:**  
CharacterSheet-modalin täydentäminen (4-6h)

---

*Roadmap luotu: 20.10.2024 22:55*  
*Versio: 1.0*  
*Status: 🟢 Aktiivinen*


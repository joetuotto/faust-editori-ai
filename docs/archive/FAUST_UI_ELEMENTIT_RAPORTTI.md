# FAUST EDITOR - UI ELEMENTTIEN KATTAVA RAPORTTI

**Päivitetty:** 20.10.2025  
**Versio:** FAUST v1.0 (NOX/DEIS)  
**Komponenttien määrä:** 50+ pääkomponenttia

---

## 📐 PÄÄRAKENNE

### 1. KOLMEN PANEELIN LAYOUT

```
┌────────────────────────────────────────────────────┐
│  [Titlebar - macOS native]                         │
├──────────┬──────────────────────┬──────────────────┤
│          │                      │                  │
│  VASEN   │     KESKIALUE       │  OIKEA           │
│  PANEELI │     (Editori)       │  PANEELI         │
│          │                      │  (Inspector)     │
│  200px   │     flex-grow        │  300px           │
│          │                      │                  │
└──────────┴──────────────────────┴──────────────────┘
```

---

## 🎨 VISUAALINEN DESIGN SYSTEM

### Väripaletti (NOX - Dark Mode)

| Muuttuja | Väri | Käyttö |
|----------|------|--------|
| `--faust-dark` | #100F0D | Vasen navigaatio |
| `--faust-shadow` | #1A1815 | Oikea paneeli |
| `--faust-bg-primary` | #141210 | Pääalue tausta + radial vignetting |
| `--faust-paper` | #F0E8DC | Kirjoitusalue (paperi-efekti) |
| `--faust-ink` | #E9E4DA | Pääteksti |
| `--faust-gold` | #9A7B4F | Aksentti & korostus |
| `--faust-gold-hover` | #C89D5E | Hover-tila |
| `--faust-bronze` | #715C38 | Toissijainen aksentti |
| `--faust-text-primary` | #E9E4DA | Ensisijainen teksti |
| `--faust-text-secondary` | #AFA699 | Toissijainen teksti |
| `--faust-text-tertiary` | #8C806C | Meta-teksti |

### Typography

| Käyttötarkoitus | Fontti | Koko | Paino | Letter-spacing |
|-----------------|--------|------|-------|----------------|
| Otsikot (H1-H4) | EB Garamond | 18-24px | 600 | 0.5px |
| Body | IBM Plex Mono | 15px | Regular | 0.01em |
| Editori | IBM Plex Mono | 15px | Regular | 0.01em |
| Meta-teksti | IBM Plex Mono | 13px | 300 | Normal |
| Tagit/napit | IBM Plex Mono | 13px | 500 | 1px (uppercase) |
| Sigilit | Faust Rune Sans | Variable | - | - |

### Spacing (Hierarkkinen)

- **Komponentti sisäinen:** 12-16px
- **Osioiden välinen:** 28-32px
- **Line height:** 1.65-1.7

### Efektit

- **Radial vignetting:** `radial-gradient(ellipse at center, #141210 60%, #100F0D 100%)`
- **Paperi-efekti:** `inset 0 0 16px rgba(0, 0, 0, 0.2)`
- **Kultainen hehku (hover):** `box-shadow: 0 0 0 3px rgba(154, 123, 79, 0.2)`
- **Sigil-hehku:** `filter: drop-shadow(0 0 4px rgba(154, 123, 79, 0.4))`
- **Kursori-hengitys:** `animation: cursor-breathe 1.2s ease-in-out infinite`

---

## 🗂️ VASEN PANEELI (Navigaatio)

**Tausta:** `--faust-dark` (#100F0D)

### Komponentit:

1. **KIRJOITTAJAN TYÖTILA -otsikko**
   - Fontti: EB Garamond 18px
   - Väri: `--faust-text-primary`

2. **Tarina (Root)**
   - Ikoni: 📖
   - Klikkaus → laajentaa/supistaa

3. **Maailma (Root)**
   - Ikoni: 🌍
   - Alavalikkot: Hahmot, Paikat

4. **TIEDOSTOT -osiö**
   - "+ Lisää" -nappi

5. **Hierarkkinen puurakenne:**
   - **Käsikirjoitus**
     - Luku 1
     - Tutkimus (kansio)
   - Drag & drop toiminnallisuus
   - Sisennys: 20px per taso

### Toiminnot:
- Klikkaus → valitsee aktiivisen dokumentin
- Oikea klikkaus → kontekstivalikko
- Drag & drop → järjestely

---

## 📝 KESKIALUE (Editori)

**Tausta:** `--faust-paper` (#F0E8DC)  
**Efekti:** Inset shadow (kynttilänvalo-efekti)

### 1. TITLEBAR (yläpalkki)

| Elementti | Sijainti | Toiminto |
|-----------|----------|----------|
| 📖 Kirja-ikoni | Vasen | Näytä/piilota sidebar |
| Dokumentin nimi | Keskellä | Muokattava otsikko |
| Sanamäärä | Oikea | Live-päivittyvä laskuri |
| 🔍 Haku | Oikea | Haku projektista |
| 🎯 Tavoite | Oikea | Kirjoitustavoite |
| 🔔 Ilmoitukset | Oikea | AI-ehdotukset |
| 🌙 NOX/DEIS toggle | Oikea | Dark/Light mode |
| ☰ Menu | Oikea | Lisävalikot |
| 👁️ Inspector toggle | Oikea | Näytä/piilota oikea paneeli |

### 2. TAB BAR (Välilehdet)

- **Muistiinpanot**
- **Metatiedot**
- **Tilannekuva**

Välilehti-indikaattori: Kultainen alaviiva (`--faust-gold`)

### 3. EDITORI-ALUE

**Tekstikenttä:**
- Koko ikkunan korkuinen textarea
- Fontti: IBM Plex Mono 15px
- Line-height: 1.65
- Tausta: `--faust-paper` (#F0E8DC)
- Tekstin väri: #26231E (tumma ruskea)
- Placeholder: "Aloita kirjoittaminen..."
- Cursor: Hengittävä animaatio

**Ominaisuudet:**
- Auto-save (debounced)
- Undo/Redo
- Sananlaskenta reaaliajassa
- Typewriter mode (valinnainen)
- Focus mode (valinnainen)

---

## 🔍 OIKEA PANEELI (Inspector)

**Tausta:** `--faust-shadow` (#1A1815)  
**Leveys:** 300px (muuttuva)

### VÄLILEHDET:

#### 1. 📝 MUISTIINPANOT
- Vapaamuotoinen tekstikenttä
- Sidottu aktiiviseen dokumenttiin
- Fontti: Plex Mono 13px

#### 2. 📊 METATIEDOT
Lomake-elementit:
- **Tila:** Dropdown (Luonnos, Ensimmäinen vedos, etc.)
- **Merkintä:** Dropdown (Ei merkintää, Tärkeä, etc.)
- **Käsikirjoittaja:** Tekstikenttä
- **Luku:** Numero-kenttä
- **Kohtaus:** Numero-kenttä
- **Sijainti:** Tekstikenttä
- **Päivä/aika:** Date picker
- **Tagit:** Pilkulla erotettu lista

#### 3. 📸 TILANNEKUVA (Snapshots)
- "+ Luo uusi tilannekuva" -nappi
- Lista aiemmista versioista:
  - Aikaleima
  - Sanamäärä
  - "Palauta" -nappi
  - "Poista" -nappi

#### 4. 👥 HAHMOT (CharacterKeeper)

**Hahmojen lista:**
- Valittavat hahmot (dropdown tai lista)
- "+ Lisää hahmo" -nappi

**Hahmon tiedot:**
- **Nimi:** Tekstikenttä
- **Ikä:** Numero
- **Ammatti:** Tekstikenttä
- **Bio:** Pitkä tekstikenttä

**Psykologia:**
- **Tavoite (Want):** Mitä hahmo haluaa
- **Pelko (Fear):** Mitä hahmo pelkää
- **Heikkous (Weakness):**
- **Arvot:** Lista

**Ääni (Voice):**
- **Kuvaus:** Miten hahmo puhuu
- **Leksikko:** Toistuvat sanat/ilmaisut
- **Keskimääräinen lausepituus:** Numero

**Tila (State):**
- **Resurssit:** Lista esineitä/taitoja
- **Vammat:** Lista vammoista
- **Uskomukset:** Key-value parit

**Suhteet:**
- Toinen hahmo → Suhteen tyyppi → Voimakkuus (0-1)

**Toiminnot:**
- "🔍 Tarkista jatkuvuus" -nappi
- "⚙️ Automaattinen valvonta" -toggle

#### 5. 📍 PAIKAT (LocationKeeper)

**Paikkojen lista:**
- Valittavat paikat
- "+ Lisää paikka" -nappi

**Paikan tiedot:**
- **Nimi:** Tekstikenttä
- **Tyyppi:** Dropdown (Sisätila, Ulkotila, Julkinen, Yksityinen)
- **Kuvaus:** Pitkä tekstikenttä

**Faktat:**
- **Värit:** Lista
- **Äänet:** Lista
- **Hajut:** Lista
- **Kosketus:** Lista
- **Lämpötila:** Tekstikenttä

**Visuaaliset elementit:**
- **Valaistus:** Kuvaus
- **Kalustus:** Lista
- **Erikoispiirteet:** Lista

**Emotionaalinen lataus:**
- **Tunnelma:** Dropdown
- **Assosiaatiot:** Lista

**Toiminnot:**
- "🎨 Generoi kuvaus" -nappi
- "📋 Täytä puuttuvat" -nappi

#### 6. 📖 TARINA (StoryKeeper)

**Juonenlanka-seuranta:**
- **Nimi:** Juonilannan nimi
- **Tärkeys:** High/Medium/Low
- **Tila:** Auki/Suljettu/Paussilla
- **Avattu luku:** Numero
- **Suljettu luku:** Numero
- **Kuvaus:** Tekstikenttä

**Toiminnot:**
- "+ Lisää juonenlanka" -nappi
- "✓ Tarkista juoni" -nappi
- "⚠️ Näytä epäjohdonmukaisuudet" -toggle

#### 7. 🧠 GRIMOIRE (Project Memory)

**AI:n oppimismuisti:**

**Keskusteluhistoria:**
- Aikaleimallinen lista AI-vuorovaikutuksista
- Filtteröitävissä tyypin mukaan

**Hylätyt ehdotukset:**
- "AI ehdotti: [teksti]"
- "Hylättiin koska: [syy]"
- → AI oppii mitä EI haluta

**Hyväksytyt muutokset:**
- "AI ehdotti: [teksti]"
- "Hyväksyttiin: [aikaleima]"
- → AI oppii mitä halutaan

**Tyylivaiheet:**
- Käyttäjän määrittelemät tyyliohjeet
- "+ Lisää tyylisääntö" -nappi

**Projektin ääni:**
- Vapaamuotoinen tekstikenttä
- Kuvaa projektin yleistä tyyliä

#### 8. 🗂️ CONTEXTUS (Hierarchical Context)

**Kontekstin hallinta pitkälle tarinalle:**

**Globaali metadata:**
- **Synopsis:** 200 sanan tiivistelmä
- **Teemat:** Lista teemoista
- **Aikajana:** Aloitus/Lopetus
- **POV:** Kerronnallinen näkökulma
- **Tyyli-DNA:** Yleiskuvaus tyylistä

**Luvun tiivistelmät:**
- Automaattisesti luodut yhteenvedot
- **Tapahtumat:** Lista keskeisistä tapahtumista
- **Esitellyt hahmot:** Lista
- **Emotionaalinen kaari:** Kuvaus
- **Juonilangat:** Mitkä langat aktiivisia

**Aktiivinen työmuisti:**
- **Nykyinen luku:** Täysi teksti
- **Edellinen luku:** Täysi teksti
- **Seuraava luku:** Suunnitelma
- **Relevantit chunkit:** Semanttisesti haetut kohdat

**Tapahtumaverkko:**
- Visualisoi syy-seuraus-suhteet
- Näyttää riippuvuudet

**Toiminnot:**
- "🔄 Päivitä tiivistelmät" -nappi
- "🔍 Hae relevanttia" -haku
- "📊 Näytä verkko" -nappi

#### 9. ✍️ TEKNIIKAT (Writing Techniques)

**AI-avusteiset kirjoitustekniikat:**

Kategoriat gradient-väreillä:

**📚 KIRJALLISUUSTIEDE** (kulta-pronssi gradient)
- Defamiliarisaatio
- Aistillisuus
- Symbolinen redundanssi
- Rytmi & Hengitys
- Tyhjä tila

**🧠 PSYKOLOGIA** (pronssi-kupari gradient)
- Peak-End Rule
- Tunnetartunta
- Zeigarnik-efekti
- Affektiivinen dissonanssi
- Kognitiivinen priming

**🎭 VAIKUTTAMINEN** (kupari-ruskea gradient)
- Ethos (luottavuus)
- Pathos (tunteet)
- Logos (logiikka)
- Suspense
- Kontrastin voima
- Ankkurointi

**🔮 EDISTYNEET** (ruskea-tumma gradient)
- Meta-tason itsetietoisuus
- Kerroksellisuus
- Epäluotettava kertoja
- Hiljaisuuden voima

**Tagien tyyli:**
- Uppercase teksti
- Letter-spacing: 1px
- Läpikuultava tausta: `rgba(200, 157, 94, 0.15)`
- Hover → `rgba(200, 157, 94, 0.25)` + kultainen aura
- 8px pyöristys
- Varjo: `0 1px 2px rgba(0, 0, 0, 0.3)`

---

## 🤖 AI-AVUSTAJA PANEELI

**Avautuu oikeasta reunasta** (overlay tai sliding panel)

### Komponentit:

1. **AI-palvelun valinta**
   - Dropdown: Claude / OpenAI / Gemini / Grok / Cursor
   - API-key status indikaattori

2. **Pikatoiminnot**
   - "Jatka kirjoittamista" -nappi
   - "Paranna kappaletta" -nappi
   - "Luo juonisynopsis" -nappi

3. **Chat-alue**
   - Viestien historia (scrollattava)
   - Käyttäjän viestit: oikea puoli
   - AI:n vastaukset: vasen puoli
   - Aikaleima jokaisessa viestissä

4. **Ehdotetut muutokset (Diff view)**
   - Näyttää AI:n ehdottamat tekstimuutokset
   - "Muuta 'X' → 'Y'" format
   - "✓ Apply" -nappi
   - "✗ Reject" -nappi
   - "Apply all" -nappi

5. **Input-kenttä**
   - Pitkä tekstikenttä AI-promptille
   - "Lähetä" -nappi
   - "📎 Sisällytä konteksti" -checkbox
   - Placeholder: "Kysy AI:lta..."

6. **Insertion mode**
   - Radio buttons:
     - "Lisää loppuun"
     - "Lisää kursorin kohtaan"
     - "Korvaa valinta"
     - "Korvaa kaikki"

---

## 💬 QUICK ACTIONS (Pikavalikko)

**Näkyy kun teksti on valittuna**

Popup ilmestyy valinnan yläpuolelle:

| Nappi | Toiminto |
|-------|----------|
| "Paranna" | Pyytää AI:ta parantamaan tekstiä |
| "Lyhennä" | Tiivistää tekstiä |
| "Laajenna" | Lisää yksityiskohtia |
| "Korjaa" | Korjaa kielioppi/tyyli |

---

## ⌨️ TYÖKALUPALKIT JA TOIMINNOT

### Tiedosto-valikko (macOS native)
- Uusi projekti
- Avaa projekti
- Tallenna
- Tallenna nimellä
- Vie (PDF, RTF, HTML, DOCX, TXT)
- Tuonti
- Tulosta
- Asetukset

### Muokkaa-valikko
- Kumoa
- Tee uudelleen
- Leikkaa
- Kopioi
- Liitä
- Valitse kaikki
- Etsi & Korvaa

### Näkymä-valikko
- Näytä/Piilota sivupaneeli
- Näytä/Piilota Inspector
- Typewriter Mode
- Focus Mode
- Koko näyttö

### AI-valikko
- Avaa AI-avustaja
- Kirjoitustekniikat
- Hahmon analyysi
- Juonen tarkistus

---

## 📊 STATUS BAR (Alapalkki)

Näytetään alareunassa (valinnainen):

| Elementti | Sijainti | Sisältö |
|-----------|----------|---------|
| Sanamäärä | Vasen | "🜕 1,234 sanaa" |
| Merkkimäärä | Vasen | "5,678 merkkiä" |
| Lukuaika | Vasen | "~6 min" |
| Kursori-positio | Keskellä | "Rivi 45, Sarake 12" |
| Kirjoitusnopeus | Oikea | "42 spm" (sanat/minuutti) |
| Edistymispalkki | Oikea | Tavoitteen edistyminen |

Fontti: IBM Plex Mono Light 12px  
Väri: `--faust-text-tertiary`

---

## 🎯 MODAL-IKKUNAT

### 1. PROJEKTIN ASETUKSET
- Projektin nimi
- Kirjoittaja
- Genren valinta
- Tavoite-sanamäärä
- Automaattinen tallennus
- Backup-asetukset

### 2. KIRJOITUSTAVOITE
- Päivittäinen sanamäärä
- Deadline
- Edistymisen seuranta
- Muistutukset

### 3. EXPORT-ASETUKSET
- Formaatin valinta
- Sisällytettävät osat
- Metatiedot
- Kansilehti

### 4. HAKU & KORVAA
- Hakukenttä
- Korvauskenttä
- Case-sensitive toggle
- Regex-tuki
- "Korvaa kaikki" / "Korvaa yksi"

---

## 🔔 ILMOITUKSET (Toast Notifications)

**Sijainit:** Oikea yläkulma

**Tyypit:**
- **Success** (vihreä): "Tallennettu onnistuneesti"
- **Error** (punainen): "Tallennusvirhe"
- **Warning** (keltainen): "Jatkuvuusvaroitus"
- **Info** (sininen): "AI-ehdotus saatavilla"

**Kesto:** 3-5 sekuntia  
**Animaatio:** Slide-in from right + fade-out

---

## ⚡ PIKANÄPPÄIMET

| Toiminto | macOS | Windows/Linux |
|----------|-------|---------------|
| Uusi dokumentti | Cmd+N | Ctrl+N |
| Tallenna | Cmd+S | Ctrl+S |
| Avaa | Cmd+O | Ctrl+O |
| Etsi | Cmd+F | Ctrl+F |
| Kumoa | Cmd+Z | Ctrl+Z |
| Tee uudelleen | Cmd+Shift+Z | Ctrl+Y |
| AI-avustaja | Cmd+J | Ctrl+J |
| Focus Mode | Cmd+Shift+F | Ctrl+Shift+F |
| Typewriter Mode | Cmd+Shift+T | Ctrl+Shift+T |
| Koko näyttö | Cmd+Ctrl+F | F11 |

---

## 🎨 ANIMAATIOT JA SIIRTYMÄT

### Mode Transition (NOX ⇄ DEIS)
1. Fade current → 80% opacity (150ms)
2. Gradient swipe left→right (800ms ease-in-out)
   - Gradient: Kulta → pronssi
3. Reilluminate → 100% (250ms)

### Cursor Breathe
- Opacity: 70% → 100%
- Kesto: 1.2s
- Easing: ease-in-out
- Loop: infinite

### Hover Effects
- Tagit: transform translateY(-1px) + kultainen aura
- Painikkeet: background-color change + box-shadow spread
- Kesto: 200ms ease-in-out

### Panel Transitions
- Sidebar toggle: 300ms ease-in-out
- Inspector toggle: 300ms ease-in-out
- Modal fade-in: 250ms

---

## 🔧 ASETUKSET JA KONFIGURAATIO

### Visuaaliset asetukset
- NOX / DEIS mode toggle
- Fonttikoko (12-20px)
- Line-height (1.4-2.0)
- Editor-leveys (500-1000px)
- Typewriter Mode
- Focus Mode

### Toiminnalliset asetukset
- Auto-save interval (30s-5min)
- Backup tiheys
- AI-palvelun valinta
- Automaattinen continuity-check
- Inline warnings

### Pikanäppäinten kustomointi
- Näppäinyhdistelmien muokkaus

---

## 📈 OMINAISUUKSIEN YHTEENVETO

### Peruseditori
✅ Hierarkkinen dokumenttipuu  
✅ Drag & drop -järjestely  
✅ Undo/Redo  
✅ Auto-save  
✅ Snapshot-versiointi  
✅ Sanamäärälaskuri  
✅ Tavoitteen seuranta  
✅ Haku & Korvaa  
✅ Export (6 formaattia)  

### AI-ominaisuudet
✅ Multi-provider (Claude/OpenAI/Gemini/Grok/Cursor)  
✅ Chat-käyttöliittymä  
✅ Diff-view (Apply/Reject)  
✅ Quick actions (valittu teksti)  
✅ 30+ kirjoitustekniikkaa  
✅ Story-wide changes  
✅ Context-aware prompting  

### Jatkuvuuden valvonta
✅ CharacterKeeper (hahmot)  
✅ LocationKeeper (paikat)  
✅ StoryKeeper (juoni)  
✅ Inline-varoitukset  
✅ Automaattinen tarkistus  

### Muistijärjestelmät
✅ Grimoire (Project Memory)  
✅ Contextus (Hierarchical Context)  
✅ Semantic search  
✅ Embedding-based retrieval  

### Visual Masters -ominaisuudet
✅ NATSUME: Emotionaalinen analyysi  
✅ KRUG: Flow-tilan tunnistus  
✅ SAGMEISTER: Emotional color arcs  
✅ SUPERSIDE: Adaptive layout  
✅ NORMAN: Affordance-indikaattorit  
✅ IDEO: Cognitive load tracking  

---

## 📝 YHTEENVETO

**Kokonaiselementtimäärä:** 150+ yksittäistä UI-komponenttia  
**Pääpaneelit:** 3 (Vasen, Keski, Oikea)  
**Inspector-välilehdet:** 9  
**AI-tekniikoita:** 30+  
**Modal-ikkunoita:** 4  
**Työkalupalkit:** 4  
**Export-formaatit:** 6  

**Koodiriveä yhteensä:** ~5,800 (app.js)  
**CSS-muuttujia:** 25+  
**Fontit:** 3 (IBM Plex Mono, EB Garamond, Space Mono)  
**Animaatioita:** 10+  

---

## 🎯 TEKNOLOGIAT

- **Frontend:** React (Hooks-based)
- **Backend:** Electron (Node.js)
- **AI APIs:** Claude, OpenAI, Gemini, Grok, Cursor
- **Styling:** CSS-in-JS (inline styles) + CSS Variables
- **Typography:** Google Fonts (IBM Plex Mono, EB Garamond, Space Mono)
- **Icons:** Unicode + custom sigils
- **State Management:** React useState/useEffect
- **IPC:** Electron IPC (main ↔ renderer)

---

*Tämä raportti dokumentoi FAUST-editorin täydellisen UI-rakenteen tämänhetkisessä tilassa.*


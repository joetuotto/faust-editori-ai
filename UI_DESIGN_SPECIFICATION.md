# FAUST 2.1.0 - UI Design Specification
## Kattava kuvaus toiminnallisuuksista ja käyttöliittymästä

**Versio:** 2.1.0
**Päivitetty:** 2025-10-24
**Tyyli:** Bioresonance Philosophy - harmonia, tasapaino, luonnollinen virtaus

---

## 📐 LAYOUT ARKKITEHTUURI

### Kolmijako-rakenne (Three-Column Layout)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Menu Bar (macOS native)                                              │
├─────────────┬────────────────────────────────┬──────────────────────┤
│             │                                │                      │
│   SIDEBAR   │      EDITOR AREA               │    INSPECTOR         │
│   (220px)   │      (keskitetty)              │    (320px)           │
│             │                                │                      │
│  • Luvut    │  [Editori tyhjänä]             │  • Projekti-info     │
│  • Kansiot  │  tai                           │  • Luku-metadata     │
│  • AI Panel │  [Aktiivinen luku tekstinä]    │  • AI-toiminnot      │
│  • Asetukset│                                │  • Hahmot            │
│             │                                │  • Juonilangat       │
│             │                                │                      │
└─────────────┴────────────────────────────────┴──────────────────────┘
```

**Mitat:**
- Sidebar: 220px (kiinteä)
- Inspector: 320px (kiinteä)
- Editor: Joustava (täyttää tilan)
- Min. leveys: 1024px (suositeltu 1440px+)

---

## 🎨 VÄRIPALETTI - Bioresonance Theme

### Perusteemat

**Vaalea teema (oletus):**
```css
--bg-1: #f5f1e8        /* Pehmeä beige - pääosa */
--bg-2: #e8e3d8        /* Hieman tummempi - korostukset */
--bg-3: #dcd5c7        /* Rajat ja erottimet */

--text: #1a1a1a        /* Musta - pääteksti */
--text-2: #4a4a4a      /* Tummanharmaa - aputeksti */
--text-3: #787878      /* Keskiharmaa - sivuteksti */

--bronze: #B68B5C      /* Pronssi/kulta - korostukset */
--bronze-hover: #9d7549 /* Tummempi pronssi - hover */

--border-color: #dcd5c7 /* Rajaviivat */
```

**Tumma teema:**
```css
--bg-1: #1a1814
--bg-2: #242218
--bg-3: #2e2a20
--text: #e8e3d8
--text-2: #c4bfb4
--text-3: #9d988d
```

### Tilat (States)

```css
/* Onnistuminen */
--success: #4CAF50
--success-bg: rgba(76, 175, 80, 0.1)

/* Varoitus */
--warning: #FF9800
--warning-bg: rgba(255, 152, 0, 0.1)

/* Virhe */
--error: #EF5350
--error-bg: rgba(239, 83, 80, 0.1)

/* Info */
--info: #2196F3
--info-bg: rgba(33, 150, 243, 0.1)
```

---

## 📚 TYPOGRAFIA

### Fontit

```css
/* Otsikot ja lukija-teksti */
font-family: 'EB Garamond', serif;

/* Käyttöliittymä ja metadata */
font-family: 'IBM Plex Mono', monospace;
```

### Hierarkia

```
H1 (Pääotsikko):     EB Garamond, 32px, bold
H2 (Alaotsikko):     EB Garamond, 24px, bold
H3 (Osion otsikko):  EB Garamond, 18px, semibold
Body (Editori):      EB Garamond, 18px, regular, line-height: 1.8
UI Label:            IBM Plex Mono, 11px, medium
UI Text:             IBM Plex Mono, 12-13px, regular
Tiny UI:             IBM Plex Mono, 9-10px, regular
```

---

## 🗂️ SIDEBAR - Vasen paneeli (220px)

### Rakenne (ylhäältä alas)

#### 1. Projektin otsikko
```
┌────────────────────┐
│ PROJEKTIN NIMI     │ ← EB Garamond 18px
│ Kirjoittaja        │ ← IBM Plex Mono 11px
└────────────────────┘
```

#### 2. Lukujen lista (Structure Tree)
- Hierarkinen puurakenne
- Kansiot ja luvut sisäkkäin
- Drag & drop -järjestys
- Aktiivinen luku korostettuna (pronssi reunus)

**Luku-elementti:**
```
┌────────────────────┐
│ 📄 Luku 1          │ ← Otsikko
│    1,234 sanaa     │ ← Sanamäärä (harmaa)
└────────────────────┘
```

**Kansio-elementti:**
```
┌────────────────────┐
│ 📁 Osa I           │ ← Kansion nimi
│   ▼ 3 lukua        │ ← Sisällön määrä
└────────────────────┘
```

#### 3. Toimintopainikkeet (alareunassa)
```
[+ Uusi luku]     [⚙️ Asetukset]
```

### Interaktiot
- **Klikkaus:** Avaa luvun editoriin
- **Drag:** Siirrä järjestystä
- **Right-click:** Kontekstivalikko (poista, kopioi, metadata)
- **Hover:** Näytä sanamäärä tooltip

---

## ✍️ EDITOR AREA - Keskipaneeli

### Tyhjä tila (ei lukua valittuna)
```
┌─────────────────────────────────────┐
│                                     │
│         Valitse luku vasemmalta     │
│         tai luo uusi luku           │
│                                     │
│         [+ Luo ensimmäinen luku]    │
│                                     │
└─────────────────────────────────────┘
```

### Aktiivinen editori
```
┌─────────────────────────────────────┐
│ [Luku 1: Alku]            1,234 w   │ ← Otsikko + sanamäärä
├─────────────────────────────────────┤
│                                     │
│  Tekstiä kirjoitetaan tähän...      │
│  Editori on keskitetty (max 720px)  │
│  line-height 1.8 luettavuuden vuoksi│
│                                     │
│  AI voi generoida jatkoa tähän.     │
│                                     │
└─────────────────────────────────────┘
```

### Editorin työkalut (alaosa)
```
[B] [I] [U]  | [◄] [►] |  [🎤] [🤖]
 ↑            ↑          ↑     ↑
Muotoilu    Undo/Redo  Puhe   AI
```

### Editorin ominaisuudet
- **Markdown-tuki:** **bold**, *italic*, # otsikot
- **Auto-save:** Tallentaa automaattisesti 30s välein
- **Sanamäärälaskuri:** Reaaliaikainen päivitys
- **Undo/Redo:** Cmd+Z / Cmd+Shift+Z (Command Pattern)
- **Find/Replace:** Cmd+F / Cmd+Shift+F
- **Focus Mode:** F11 (piilottaa sivupaneelit)

---

## 🎯 INSPECTOR - Oikea paneeli (320px)

### Rakenne (scrollattava)

#### 1. PROJEKTI-osio
```
┌──────────────────────────┐
│ PROJEKTI                 │
│                          │
│ Nimi: [_______________]  │
│ Kirjoittaja: [________]  │
│ Genre: [scifi ▼]         │
│ Kieli: [fi ▼]            │
│                          │
│ Tavoite: 80,000 sanaa    │
│ Edistyminen: ████░ 45%   │
│                          │
└──────────────────────────┘
```

#### 2. LUKU-osio (kun luku aktiivinen)
```
┌──────────────────────────┐
│ CHAPTER                  │
│                          │
│ Otsikko: [___________]   │
│ Sanat: 1,234 / 3,000     │
│                          │
│ Status: [Draft ▼]        │ ← Plan/Draft/Revision/Final
│ POV: [Emma ▼]            │ ← Valinta hahmoista
│ Aika: [Day 3, Morning]   │
│ Mood: [Jännittävä]       │
│ Muistiinpanot:           │
│ [____________________]   │
│                          │
└──────────────────────────┘
```

#### 3. AI KIRJOITUSTYÖKALUT
```
┌──────────────────────────┐
│ AI                       │
│                          │
│ Tila: [Production ▼]     │ ← Exploration/Production/Polish
│                          │
│ [📝 Jatka kirjoitusta]   │
│ [✨ Regenerate Section]  │
│ [🎨 Ideoi vaihtoehtoja]  │
│ [🔍 Analysoi luku]       │
│                          │
│ Provider: [Anthropic ▼]  │
│ Model: claude-3.5-son... │
│                          │
└──────────────────────────┘
```

#### 4. HAHMOT (Characters)
```
┌──────────────────────────┐
│ CHARACTERS               │
│                          │
│ 📊 Cast Planning         │
│ [🎭 Plan Cast]           │
│                          │
│ ⚙️ Character Engine      │
│ [Build Characters]       │
│                          │
│ 👤 Hahmoluettelo         │
│ [View Characters (5)]    │ ← Logo + määrä
│                          │
└──────────────────────────┘
```

#### 5. JATKUVUUS (Continuity)
```
┌──────────────────────────┐
│ CONTINUITY               │
│                          │
│ Juonilangat: 3 aktiivista│
│ Konfliktit: 2            │
│ Ristiriidat: 0 ⚠️        │
│                          │
│ [🔍 Analyse Continuity]  │
│ [📊 View Plot Threads]   │
│                          │
└──────────────────────────┘
```

---

## 🎭 CHARACTER ENGINE - Modal

### Avataan: Inspector → "Build Characters"

```
┌──────────────────────────────────────────────────────────┐
│ [Character Engine Logo] Characters              [Sulje] │
│ 5 characters in your story                               │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Emma        │  │ Marcus      │  │ Dr. Chen    │     │
│  │ Protagonist │  │ Antagonist  │  │ Mentor      │     │
│  │ ───────     │  │ ───────     │  │ ───────     │     │
│  │ Määrätiet.  │  │ Tavoitteel. │  │ Viisas      │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
│                                                          │
│  [+ Add Character]                                       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Hahmon tarkastelu (View Mode)

```
┌──────────────────────────────────────────────────────────┐
│ [Logo] Emma Thompson                            [Muokkaa] │
│ View character profile                          [Takaisin]│
├──────────────────────────────────────────────────────────┤
│                                                          │
│ PERUSTIEDOT                                              │
│ • Nimi: Emma Thompson                                    │
│ • Ikä: 28                                                │
│ • Rooli: Protagonist                                     │
│                                                          │
│ PSYKOLOGINEN PROFIILI (4 kerrosta)                       │
│                                                          │
│ Kerros 1: Perusluonne                                    │
│ • Määrätietoinen, utelias, empaattinen                   │
│                                                          │
│ Kerros 2: Tausta                                         │
│ • Kasvoi pienessä kylässä                                │
│ • Menetti äitinsä nuorena                                │
│                                                          │
│ Kerros 3: Sisäiset konfliktit                            │
│ • Pelkää pettymästä muita                                │
│ • Kamppailee itsetunnon kanssa                           │
│                                                          │
│ Kerros 4: Transformaatio                                 │
│ • Aloitus: Epävarma ja passiivinen                       │
│ • Loppu: Itsevarma johtaja                               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## ⚙️ ASETUKSET - Modal

### Avataan: Cmd+, tai Inspector → Asetukset

```
┌──────────────────────────────────────────────────────────┐
│ ⚙️ Asetukset                                    [Sulje] │
│ Konfiguroi FAUST AI -asetukset                           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ [API Asetukset] [Yleiset]                                │
│                                                          │
│ API TYPE                                                 │
│ [☁️ Cloud API] [🖥️ Local Server]                        │
│                                                          │
│ API KEY                                                  │
│ [sk-ant-......................................]         │
│ 🔑 Hanki avain: console.anthropic.com, platform.openai..│
│                                                          │
│ MODEL NAME                                               │
│ [claude-3-5-sonnet-20241022........................]     │
│ 📝 Syötä täsmällinen mallin nimi                         │
│                                                          │
│ PIKA-VALINTA:                                            │
│ [Claude 3.5 Sonnet] [GPT-4 Turbo]                       │
│ [Grok 2]            [DeepSeek V3]                        │
│                                                          │
│ ────────────────────────────────────────────────         │
│                                                          │
│ [🔍 Testaa yhteyttä]                                     │
│                                                          │
│ API KÄYTTÖ                                               │
│ Pyyntöjä: 42                                             │
│ Tokeneita: 125,420                                       │
│ Kustannukset: ~$2.34                                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 🤖 AI TOIMINNOT

### 1. AI Writing Modes (3 tilaa)

**Exploration Mode** 🔆
- Lämpötila: 0.9 (korkea luovuus)
- Käyttö: Ideointivaihe, kokeilevaa kirjoittamista
- Väri: #B68B5C (vaalea pronssi)

**Production Mode** ⭐ (oletus)
- Lämpötila: 0.7 (tasapainoinen)
- Käyttö: Normaali kirjoitus, seuraa suunnitelmaa
- Väri: #8F7A53 (pronssi)

**Polish Mode** ✨
- Lämpötila: 0.3 (alhainen, täsmällinen)
- Käyttö: Viimeistely, kielioppi, tyyli
- Väri: #715C38 (tumma pronssi)

### 2. AI Generointitoiminnot

**Continue Writing** (Jatka kirjoitusta)
```
Käyttäjä on kirjoittanut:
"Emma astui huoneeseen ja pysähtyi kuin seinään."

[🤖 Jatka kirjoitusta]

AI jatkaa:
"Hänen silmänsä tottui hämärään hitaasti. Edessä oli..."
```

**Regenerate Section** (Uudelleenkirjoitus)
```
Valitse teksti → [✨ Regenerate]

AI kirjoittaa uudelleen eri tavalla, säilyttäen kontekstin.
```

**Ideate Alternatives** (Ideoi vaihtoehtoja)
```
Luo 3-5 vaihtoehtoista versiota valitusta kohdasta.
Näytetään rinnakkain, käyttäjä valitsee parhaan.
```

**Analyze Chapter** (Analysoi luku)
```
AI analysoi:
• Pacing (tahti): Medium, tasainen
• Mood (tunnelma): Jännittävä, mystinen
• Character Consistency: ✓ Johdonmukainen
• Plot Threads: 2 aktiivista, 1 kesken
• Issues: Ei ongelmia
```

### 3. Hybrid Writing Flow

**Vuorottele ihmis- ja AI-kirjoitus:**
```
1. Käyttäjä kirjoittaa: 200 sanaa
2. AI jatkaa: 150 sanaa
3. Käyttäjä muokkaa AI:n tekstiä
4. Käyttäjä kirjoittaa lisää
5. Toistetaan
```

**Batch Generation:**
```
Generoi useita lukuja kerralla:
[✓] Luku 5
[✓] Luku 6
[ ] Luku 7

Progress: 2/3 valmiina (65%)
```

---

## 📊 JATKUVUUSSEURANTA (Continuity Tracking)

### Plot Thread Tracker

```
┌────────────────────────────────────────────┐
│ Juonilangat                       [Sulje] │
├────────────────────────────────────────────┤
│                                            │
│ 🧵 Mysteeri: Kadonnut artefakti           │
│    Status: ACTIVE                          │
│    Chapters: 1, 3, 5, 7                    │
│    Next: Luku 9 (ennuste)                  │
│                                            │
│ 🧵 Romanttinen jännite: Emma & Marcus     │
│    Status: BUILDING                        │
│    Chapters: 2, 4, 6                       │
│    Tension: ████░ 75%                      │
│                                            │
│ 🧵 Sivujuoni: Dr. Chen'in salaisuus       │
│    Status: RESOLVED                        │
│    Chapters: 1, 3, 5                       │
│    Resolved: Luku 5                        │
│                                            │
│ [+ Add Plot Thread]                        │
│                                            │
└────────────────────────────────────────────┘
```

### Continuity Issues

```
⚠️ JATKUVUUSONGELMAT:

Luku 7:
• Emma mainittu silmälaseista (ei ole koskaan ollut)
• Marcus'in ikä vaihtunut (31 → 28)

Luku 9:
• Aika: "talvi" mutta Luku 8 oli "kesä"

[🔧 Korjaa automaattisesti] [Ohita]
```

---

## 📄 VERSIOHISTORIA

### Version History Modal

```
┌────────────────────────────────────────────┐
│ 📄 Version History: Luku 5       [Sulje] │
├────────────────────────────────────────────┤
│                                            │
│ ┌────────────────────────────────────────┐│
│ │ v5.3 - 2025-10-24 15:30               ││
│ │ ⭐⭐⭐⭐⭐ (5 stars)                    ││
│ │ "Parannettu dialogia ja pacing"       ││
│ │ 1,456 words                           ││
│ │ [View] [Restore]                      ││
│ └────────────────────────────────────────┘│
│                                            │
│ ┌────────────────────────────────────────┐│
│ │ v5.2 - 2025-10-24 14:15               ││
│ │ ⭐⭐⭐⭐ (4 stars)                      ││
│ │ "Lisätty Emma'n sisäinen monologi"    ││
│ │ 1,234 words                           ││
│ │ [View] [Restore]                      ││
│ └────────────────────────────────────────┘│
│                                            │
│ ┌────────────────────────────────────────┐│
│ │ v5.1 - 2025-10-24 10:00 (Original)    ││
│ │ ⭐⭐⭐ (3 stars)                        ││
│ │ 1,100 words                           ││
│ │ [View] [Restore]                      ││
│ └────────────────────────────────────────┘│
│                                            │
└────────────────────────────────────────────┘
```

### Version Comparison (Diff View)

```
┌────────────────────────────────────────────┐
│ Compare: v5.2 ↔ v5.3                       │
├────────────────────────────────────────────┤
│                                            │
│ v5.2 (Old)        │  v5.3 (New)           │
│ ──────────────────┼───────────────────────│
│ Emma katsoi       │  Emma katsoi          │
│ ulos ikkunasta.   │  ulos ikkunasta ja    │
│                   │  huokaisi syvään.     │
│ ──────────────────┼───────────────────────│
│ "En tiedä,"       │  "En tiedä," hän      │
│ hän sanoi.        │  kuiskasi hiljaa.     │
│ ──────────────────┼───────────────────────│
│ Poisto: 2 lausetta                         │
│ Lisäys: 3 lausetta                         │
│ Muutos: 5 lausetta                         │
│                                            │
└────────────────────────────────────────────┘
```

---

## 📤 VIENTI (Export)

### Export Modal

```
┌────────────────────────────────────────────┐
│ 📤 Vie projekti                   [Sulje] │
├────────────────────────────────────────────┤
│                                            │
│ FORMAATTI:                                 │
│ [○] PDF - Ammattimainen ulkoasu           │
│ [○] EPUB - E-lukijat (Kindle, Kobo)       │
│ [○] MOBI - Kindle-muoto                    │
│ [○] DOCX - Microsoft Word                  │
│ [○] TXT - Pelkkä teksti                    │
│                                            │
│ SISÄLLYTÄ:                                 │
│ [✓] Kansilehti                             │
│ [✓] Sisällysluettelo                       │
│ [✓] Metadata (kirjoittaja, genre)          │
│ [✓] Sivunumerot                            │
│ [ ] Luonnosmerkit (Draft watermark)        │
│                                            │
│ KANSIOT/LUVUT:                             │
│ [✓] Kaikki luvut                           │
│ [ ] Vain valitut                           │
│                                            │
│ ────────────────────────────────────────   │
│                                            │
│ [Vie tiedosto]                             │
│                                            │
└────────────────────────────────────────────┘
```

### PDF Export - Ominaisuudet
- Kansilehti automaattinen
- Sisällysluettelo hyperlinkeillä
- Sivunumerot (alhaalla keskellä)
- Älykkäät lainausmerkit (" → ")
- Em-dashit (-- → —)
- Kappalevälit optimoidut

### EPUB Export - Ominaisuudet
- XHTML 1.1 -standardin mukainen
- Metatiedot (DC metadata)
- TOC.ncx navigaatio
- Yhteensopiva: Kindle, Kobo, Apple Books

---

## 🎤 PUHEOHJAUS (Voice Control)

### Voice Dictation

**Aktivointi:** Cmd+Shift+V

```
┌────────────────────────────────────────────┐
│ 🎤 Puheentunnistus käynnissä...            │
│                                            │
│ ┌────────────────────────────────────────┐│
│ │  [●]  Nauhoitetaan...                  ││
│ │                                        ││
│ │  "Emma astui huoneeseen ja näki        ││
│ │   hämmästyttävän näyn."                ││
│ │                                        ││
│ │  [◼ Lopeta]                            ││
│ └────────────────────────────────────────┘│
│                                            │
└────────────────────────────────────────────┘
```

Teksti ilmestyy editoriin reaaliajassa.

### Voice AI Chat

**Avataan:** Inspector → AI → "Chat with AI"

```
┌────────────────────────────────────────────┐
│ 💬 AI Chat                        [Sulje] │
├────────────────────────────────────────────┤
│                                            │
│ Sinä: Miten jatkan tästä? Emma on juuri   │
│       saanut tietää, että...               │
│                                            │
│ AI: Voisit jatkaa esimerkiksi näin:       │
│     1. Emma joutuu päätöksen eteen         │
│     2. Hän keskustelee Marcuksen kanssa    │
│     3. Paljastus tapahtuu...               │
│                                            │
│ [Kirjoita kysymys.....................] 🎤│
│                                            │
└────────────────────────────────────────────┘
```

---

## 🔍 HAKU JA KORVAA (Find & Replace)

### Find Dialog - Cmd+F

```
┌────────────────────────────────────────────┐
│ 🔍 Find                           [Sulje] │
├────────────────────────────────────────────┤
│                                            │
│ Search: [Emma.........................] ▼ │
│                                            │
│ [ ] Case sensitive                         │
│ [ ] Whole word                             │
│                                            │
│ Results: 23 matches in 5 chapters          │
│                                            │
│ ┌────────────────────────────────────────┐│
│ │ Luku 1 (3 matches)                     ││
│ │ • Line 12: "Emma katsoi..."            ││
│ │ • Line 45: "Emma huomasi..."           ││
│ │ • Line 89: "Emma päätti..."            ││
│ └────────────────────────────────────────┘│
│                                            │
│ [◄ Previous] [Next ►]                      │
│                                            │
└────────────────────────────────────────────┘
```

### Replace Dialog - Cmd+Shift+F

```
┌────────────────────────────────────────────┐
│ 🔄 Find & Replace                 [Sulje] │
├────────────────────────────────────────────┤
│                                            │
│ Find:    [Emma.........................] ▼ │
│ Replace: [Emma Thompson................] ▼ │
│                                            │
│ [ ] Case sensitive                         │
│ [ ] Whole word                             │
│                                            │
│ Results: 23 matches                        │
│                                            │
│ [Replace] [Replace All] [Skip]             │
│                                            │
└────────────────────────────────────────────┘
```

---

## ⌨️ KEYBOARD SHORTCUTS

### Yleisiä

```
Cmd + S         Tallenna projekti
Cmd + O         Avaa projekti
Cmd + N         Uusi projekti
Cmd + ,         Asetukset
Cmd + W         Sulje ikkuna
Cmd + Q         Lopeta sovellus
```

### Muokkaus

```
Cmd + Z         Undo
Cmd + Shift + Z Redo
Cmd + C         Kopioi
Cmd + V         Liitä
Cmd + X         Leikkaa
Cmd + A         Valitse kaikki
Cmd + F         Etsi
Cmd + Shift + F Etsi ja korvaa
```

### AI ja Erikoisominaisuudet

```
Cmd + Enter     AI: Jatka kirjoitusta
Cmd + Shift + R AI: Regeneroi valinta
Cmd + Shift + V Puhesaneluväri
Cmd + L         Luo uusi luku
Cmd + E         Vie projekti
F11             Focus mode (piilota sivupaneelit)
ESC             Sulje modal/dialog
```

---

## 🎨 UI KOMPONENTIT

### Painikkeet (Buttons)

**Primary Button (pääpainike)**
```css
background: #B68B5C (pronssi)
color: #000 (musta teksti)
padding: 12px 24px
border-radius: 4px
font: IBM Plex Mono, 13px, 600

hover: background: #9d7549
active: transform: scale(0.98)
```

**Secondary Button**
```css
background: transparent
border: 1px solid #B68B5C
color: #B68B5C
padding: 12px 24px

hover: background: rgba(182, 139, 92, 0.1)
```

**Icon Button**
```css
background: transparent
border: 1px solid var(--border-color)
width: 36px, height: 36px
border-radius: 4px

hover: background: var(--bg-2)
```

### Input Fields

```css
background: var(--bg-2)
border: 1px solid var(--border-color)
padding: 12px
border-radius: 4px
color: var(--text)
font: IBM Plex Mono, 13px

focus: border-color: #B68B5C
       outline: none
```

### Dropdowns

```css
Sama tyyli kuin input
Icon: ▼ (oikealla)
hover: background: var(--bg-3)
```

### Modal-ikkunat

```css
Overlay:
  background: rgba(0, 0, 0, 0.85)
  backdrop-filter: blur(4px)

Modal:
  background: var(--bg-1)
  border: 2px solid #B68B5C
  border-radius: 8px
  padding: 32px
  max-width: 900px
  box-shadow: 0 20px 60px rgba(0,0,0,0.3)
```

---

## 📐 RESPONSIVE DESIGN

### Breakpoints

```
Minimum: 1024px (pienin tuettu leveys)
Optimal: 1440px - 1920px
Maximum: 2560px (4K)
```

### Layout-muutokset

**1024px - 1280px:** Sidebar ja Inspector kapeammat
**1280px - 1920px:** Normaali layout
**1920px+:** Editor max-width 900px (parempi luettavuus)

---

## 🎭 ANIMAATIOT JA SIIRTYMÄT

### Yleisiä periaatteita

```css
/* Nopeat interaktiot */
transition: 150ms ease-out

/* Modaalit ja suuret muutokset */
transition: 300ms cubic-bezier(0.4, 0, 0.2, 1)

/* Fade-in */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Hover-efektit */
hover: transform: translateY(-2px)
       box-shadow: 0 4px 12px rgba(0,0,0,0.15)
```

### Mikro-interaktiot

- Button hover: Kevyt nosto + varjo
- Input focus: Reunaväri muuttuu pronssiksi
- Modal open: Fade-in + hienovarainen scale
- List item select: Hiipuva highlight-väri
- AI generation: Pulsating indicator

---

## 🌟 ERIKOISOMINAISUUDET

### Auto-save Indicator

```
┌─────────────────┐
│ ● Tallentamaton │ ← Punainen piste
│ ✓ Tallennettu   │ ← Vihreä check (3s, häipyy)
│ ⟳ Tallentaa...  │ ← Pyörivä ikoni
└─────────────────┘

Sijainti: Yläoikealla, lähellä sanamäärää
```

### Progress Bar (edistyminen)

```
Tavoite: 80,000 sanaa
Nyt: 36,240 sanaa

████████████░░░░░░░░ 45%

Väri: Pronssi (#B68B5C)
```

### Notifications (ilmoitukset)

```
┌────────────────────────────────────┐
│ ✓ Projekti tallennettu             │
└────────────────────────────────────┘

Sijainti: Yläreunassa, keskellä
Kesto: 3 sekuntia
Animaatio: Slide down + fade out
```

### Context Menu (Right-click)

```
┌──────────────────┐
│ Kopioi           │
│ Liitä            │
│ ──────────────── │
│ AI: Jatka        │
│ AI: Regeneroi    │
│ ──────────────── │
│ Poista           │
└──────────────────┘

Väri: var(--bg-1)
Border: 1px solid var(--border-color)
Shadow: 0 4px 12px rgba(0,0,0,0.2)
```

---

## 🔧 TEKNINEN IMPLEMENTAATIO

### React komponentit

```
App.jsx
├── Sidebar
│   ├── ProjectTitle
│   ├── ChapterTree
│   │   ├── ChapterItem
│   │   └── FolderItem
│   └── ActionButtons
├── Editor
│   ├── EditorHeader
│   ├── ContentArea
│   └── EditorToolbar
├── Inspector
│   ├── ProjectSection
│   ├── ChapterSection
│   ├── AISection
│   ├── CharactersSection
│   └── ContinuitySection
└── Modals
    ├── SettingsModal
    ├── CharacterSheetModal
    ├── VersionHistoryModal
    ├── ExportModal
    └── AIAssistantModal
```

### State Management

```javascript
// Project state (useState)
project: {
  title, author, genre, language,
  structure: [...chapters],
  characters: [...],
  plotThreads: [...],
  ai: {...config},
  apiConfig: {...}
}

// UI state
activeChapterId
unsavedChanges
showSettings
showCharacterSheet
// ...
```

### Styling System

- **CSS Variables** (themes)
- **Inline styles** (React.createElement)
- **No CSS-in-JS libraries**
- **Responsive units** (px, rem)

---

## 📊 KÄYTTÄJÄVIRRAT (User Flows)

### 1. Uusi käyttäjä - Ensikäyttö

```
1. Avaa FAUST
2. Tervetuloa-ruutu: "Luo uusi projekti"
3. Syötä projektin nimi, kirjoittaja, genre
4. API-avain-dialogi: "Aseta API-avain aloittaaksesi"
5. Ensimmäinen luku luotu automaattisesti
6. Tooltip-opastus: "Aloita kirjoittaminen tähän"
```

### 2. AI-avusteinen kirjoitus

```
1. Käyttäjä kirjoittaa 200 sanaa
2. Painaa "Jatka kirjoitusta" (Cmd+Enter)
3. AI generoi 150 sanaa
4. Käyttäjä lukee ja muokkaa AI:n tekstiä
5. Tallentuu automaattisesti
```

### 3. Hahmon luominen

```
1. Inspector → Characters → "Build Characters"
2. Character Engine modal avautuu
3. "Add Character"
4. Täytä perustiedot (nimi, rooli)
5. Character Engine täyttää 4-kerroksisen profiilin
6. Käyttäjä muokkaa ja hyväksyy
7. Hahmo näkyy listassa
```

### 4. Projektin vienti

```
1. File → Export (Cmd+E)
2. Valitse formaatti (PDF/EPUB/MOBI/DOCX)
3. Määritä asetukset (kansilehti, metadata)
4. "Vie tiedosto"
5. Valitse tallennuskohde
6. Ilmoitus: "✓ Projekti viety onnistuneesti"
```

---

## 🎯 KÄYTETTÄVYYSPERIAATTEET

### 1. Clarity (Selkeys)
- Selkeät otsikot jokaiselle osiolle
- Looginen hierarkia
- Ei turhia elementtejä

### 2. Consistency (Johdonmukaisuus)
- Sama tyyli kaikkialla
- Yhteneväiset ikonit ja värit
- Predictable behavior

### 3. Feedback (Palaute)
- Välitön palaute käyttäjän toiminnoista
- Loading-indikaattorit pitkissä prosesseissa
- Onnistumis-/virheilmoitukset

### 4. Efficiency (Tehokkuus)
- Keyboard shortcuts kaikille tärkeille toiminnoille
- AI nopeuttaa kirjoitusta
- Auto-save säästää aikaa

### 5. Aesthetics (Estetiikka)
- Rauhallinen, harmoninen värimaailma
- Hyvä typografia (EB Garamond + IBM Plex Mono)
- Bioresonance-filosofia: tasapaino ja virtaus

---

## 📱 ACCESSIBILITY (Saavutettavuus)

### Näppäimistö-navigointi
- Tab: Seuraava elementti
- Shift+Tab: Edellinen
- Enter: Aktivoi
- ESC: Sulje modal/peruuta

### Ruudunlukijat
- ARIA-labelit kaikille interaktiivisille elementeille
- Semantic HTML (heading hierarchy)
- Alt-tekstit kuville

### Värikontrastit
- WCAG AA -standardin mukainen (4.5:1)
- Testattu värisokeille

---

## 🚀 TULEVAISUUDEN OMINAISUUDET (Roadmap)

### Suunnitteilla v2.2:
- [ ] Collaborative Writing (yhteiskirjoitus)
- [ ] Cloud Sync (pilvisynkronointi)
- [ ] Mobile app (iOS/Android)
- [ ] Advanced Plot Visualization (juonikaaviot)
- [ ] AI Character Voice Training (hahmojen tyyli)

### Suunnitteilla v3.0:
- [ ] Full Graph Memory (Neo4j)
- [ ] Multi-language Support
- [ ] Publishing Integration (Amazon KDP, etc.)
- [ ] Screenplay mode (käsikirjoitusmuoto)

---

## 📚 YHTEENVETO

FAUST 2.1.0 on täysimittainen AI-avusteinen kirjoitusympäristö, joka yhdistää:

✨ **Ammattimaiset kirjoitustyökalut**
🤖 **Tehokkaat AI-ominaisuudet**
🎭 **Syvällinen Character Engine**
📊 **Jatkuvuusseuranta**
🎨 **Harmoninen, bioresonanssi-inspiroitu UI**

**Kohderyhmä:** Kirjoittajat (aloittelijat ja ammattilaiset)
**Käyttöympäristö:** macOS 10.12+
**Lisenssi:** Kaupallinen/Enterprise
**Koko:** 177 KB (bundle) + 109 MB (DMG)

---

*Dokumentti laadittu UI-suunnittelun ja kehityksen pohjaksi.*
*Versio 1.0 - 2025-10-24*

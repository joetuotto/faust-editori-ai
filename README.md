# 🜍 FAUST

**Esoteerinen kirjoituseditori DEIS ja NOX -moodeilla**

> *"Päivä ja yö eivät ole teemoja, vaan hermoston kaksi rytmiä."*

Modernin UX/UI-filosofian, Scrivener-tyyppisen organisoinnin ja AI-avustajien yhdistelmä. Rakennettu Electronilla, Reactilla ja alkemian periaatteilla.

---

## 🌓 **DEIS & NOX - Kaksi tietoisuustilaa**

### 🜕 **DEIS - Päivän mieli (Light Mode)**
- Lämmin luunvalkoinen tausta (#F9F6F0)
- Messinki-kultaiset korostukset (#C89D5E)
- Rationaalinen, järjestävä, ilmava
- **Käyttö**: Ideointi, rakenteiden luonnostelu, hahmojen suhteet

### 🌑 **NOX - Yön mieli (Dark Mode)**
- Lämmin tummanruskea-musta tausta (#141210)
- Vanhan kullan hehku (#9A7B4F)
- Introspektiivinen, meditatiivinen, immersiivinen
- **Käyttö**: Kirjoittaminen, revisio, tematiikan syventäminen

**Rituaalinen vaihto**: Moodien välinen siirtymä on 1.2s valo-rituaali (fade → gradient swipe → reilluminate)

---

## ✨ **Ominaisuudet**

### 🜍 **Alkemialliset sigilit ja typografia**
- **EB Garamond** - Otsikot ja klassinen teksti
- **IBM Plex Mono** - Runko-teksti ja editori
- **Space Mono** - UI-elementit ja AI-paneelit
- **Sigilit**: 6 alkemiallista symbolia hover/click-animaatioilla

### 🎨 **World-Class UX/UI Design**
Integroitu viiden maailman huippusuunnittelijan filosofia:
- **Sagmeister & Walsh**: Emotionaalinen typografia, orgaaniset värikaaret
- **Pentagram/Bierut**: Typografinen harmonia, golden ratio, whitespace-arkkitehtuuri
- **Superside**: Design tokens, adaptiivinen layout
- **IDEO**: Kognitiivisen kuorman hallinta, mielentilan rakentaminen
- **Clement Mok**: Ajaton selkeys, semanttinen visuaalisuus

### 📚 **Scrivener-Style Ominaisuudet**
- **Inspector-paneeli**: Synopsis, status, tavoitteet, muistiinpanot per luku
- **Hierarkkinen rakenne**: Kansiot ja luvut
- **Projektin statistiikka**: Kokonaisword count, progress tracking
- **Metadata**: Per-item metadata + statukset

### 🤖 **Cursor-Style AI-Avustajat**
- **Useita AI-chatteja**: GPT-4, Claude, Gemini, Grok
- **Adaptiivinen layout**: 1-2 chättiä ruudun koon mukaan
- **Quick actions**: Valittu teksti → AI, jatka kirjoitus
- **Chat history**: Keskustelut tallentuvat automaattisesti

### ⌨️ **Täydelliset Pikanäppäimet**
- `Cmd+S` - Tallenna (automaattinen)
- `Cmd+Z` / `Cmd+Shift+Z` - Undo/Redo
- `Cmd+F` - Etsi & Korvaa
- `Cmd+B` / `Cmd+I` - Lihavointi / Kursivointi
- `Cmd+/` - Näytä kaikki pikanäppäimet
- `Cmd+Alt+I` - Inspector
- `Cmd+Alt+A` - AI-avustajat
- `ESC` - Sulje modaalit

### 📤 **Vienti (Export)**
- **PDF** - Ammattimaiset dokumentit
- **DOCX** - Word-yhteensopivuus (tulossa)
- **Markdown** - .md-tiedostot
- **HTML** - Web-valmis
- **TXT** - Puhdas teksti
- **RTF** - Rich Text Format

### 🚀 **Suorituskyky**
- **useMemo/useCallback**: Optimoidut renderöinnit
- **Debounced save**: 1.5s debounce tallennukselle
- **Throttled analytics**: Emotionaalinen analyysi 2s debounce
- **Large document detection**: 10k+ merkit optimoitu
- **LocalStorage**: Instant load/save

---

## 🖥️ **Asennus & Käyttö**

### **Kehitysympäristö**

```bash
# 1. Kloonaa repo
git clone https://github.com/yourusername/faust.git
cd faust

# 2. Asenna riippuvuudet
npm install

# 3. Käynnistä FAUST
npm start
```

### **Tuotantoversio (tulossa)**

```bash
# Rakenna sovellus
npm run build

# Luo jaettava paketti
npm run dist
```

---

## 📦 **Teknologia**

- **Electron** - Desktop-sovelluskehys
- **React 18** - UI-kirjasto (ilman JSX, pure `createElement`)
- **Tailwind CSS** - Utility-first CSS (CDN)
- **LocalStorage** - Paikallinen tallennus
- **IPC (Inter-Process Communication)** - Electron main ↔ renderer

---

## 🎯 **Arkkitehtuuri**

```
faust/
├── app.js              # React UI (6000+ riviä, FAUST Editor)
├── electron.js         # Electron main process + IPC handlers
├── preload.js          # Electron preload (context bridge)
├── index.html          # HTML entry point
├── package.json        # Dependencies
└── README.md           # Tämä tiedosto
```

### **Keskeiset komponentit**

1. **KirjoitusStudio** (React) - Pääkomponentti
2. **Design Tokens** - Keskitetty tyyli-hallinta
3. **IPC Handlers** (Electron) - File I/O, export, menu actions
4. **Toast System** - Kauniit notifikaatiot
5. **Shortcuts Modal** - Pikanäppäinohje

---

## 🧪 **Testaus**

### **Perusominaisuudet**
- [x] Tallennus & lataus LocalStorageen
- [x] Undo/Redo historia (50 steps)
- [x] Find & Replace
- [x] Inspector metadata
- [x] AI-chats
- [x] Export PDF/TXT/MD/HTML/RTF
- [x] Keyboard shortcuts
- [x] Toast notifications

### **Suorituskyky**
- [x] useMemo optimoinnit
- [x] Debounced save
- [x] Throttled analytics
- [x] Large document support

---

## 📝 **Käyttöohjeet**

### **1. Luo uusi projekti**
- `Tiedosto → Uusi projekti` tai `Cmd+N`

### **2. Lisää lukuja**
- Klikkaa `Käsikirjoitus` -kansio
- Klikkaa `+` -nappi sivupalkissa

### **3. Kirjoita**
- Valitse luku sivupalkista
- Kirjoita editorissa
- **Automaattinen tallennus** aktivoituu 1.5s tyhjäkäynnin jälkeen

### **4. Käytä Inspector-paneelia**
- `Cmd+Alt+I` tai klikkaa 🛈-ikonia
- Lisää synopsis, status, tavoite, muistiinpanot

### **5. AI-avustajat**
- `Cmd+Alt+A` tai klikkaa AI-ikonia
- Valitse malli (GPT-4, Claude, etc.)
- Kysy mitä vain tai valitse tekstiä → paina Quick action

### **6. Vie valmis teos**
- `Tiedosto → Vie → PDF/DOCX/Markdown...`
- Valitse sijainti
- Valmis!

---

## 🎨 **Design Philosophy**

### **Typografia**
- **Font**: System fonts (-apple-system, SF Pro)
- **Sizes**: Fibonacci/Golden ratio (13px, 17px, 27px, 44px)
- **Line height**: 1.6 (optimal reading)
- **Letter spacing**: Minimaalinen (0-0.02em)

### **Colors**
- **Primary**: #0a84ff (Blue)
- **Success**: #30d158 (Green)
- **Warning**: #ff9f0a (Orange)
- **Error**: #ff453a (Red)
- **Background**: Gradient dark grays

### **Spacing**
- **Base**: 8px grid
- **Scale**: 4px, 8px, 12px, 16px, 24px, 32px, 48px, 72px

### **Emotional Arc**
Värit reagoivat tekstin tunnetilaan:
- **Positiivinen** → Lämpimät sävyt (pink)
- **Negatiivinen** → Kylmät sävyt (blue)
- **Neutraali** → Klassinen tumma

---

## 🐛 **Tiedossa olevat rajoitukset**

1. **AI-vastaukset**: Tällä hetkellä demo-vastauksia (ei oikeaa API-integraatiota)
2. **DOCX-vienti**: Tulee tulevassa versiossa
3. **Cloud sync**: Ei vielä pilvisynkronointia
4. **Collaboration**: Ei reaaliaikaista yhteistyötä

---

## 🚀 **Tulevat ominaisuudet**

- [ ] Oikeat AI API -integraatiot (OpenAI, Anthropic, etc.)
- [ ] DOCX-vienti täydellä muotoilulla
- [ ] Dark/Light mode toggle
- [ ] Snapshots (versiohistoria)
- [ ] Research-kansio (liitteet, kuvat)
- [ ] Cloud backup (Google Drive, Dropbox)
- [ ] Auto-update
- [ ] Crash reporting

---

## 📄 **Lisenssi**

MIT License - Vapaa käyttöön ja muokkaukseen.

---

## 👨‍💻 **Tekijä**

Rakennettu Claude AI:n ja Cursorin avulla, yhdistäen maailman parhaiden suunnittelijoiden periaatteet yhteen saumattomaan kirjoituskokemukseen.

**Versio**: 1.0.0  
**Viimeisin päivitys**: $(date +%Y-%m-%d)

---

## 🙏 **Kiitokset**

- **Sagmeister & Walsh** - Emotionaalinen rohkeus
- **Pentagram / Michael Bierut** - Typografinen täydellisyys
- **Superside** - Skaalautuvuus
- **IDEO** - Kokemuksellisuus
- **Clement Mok** - Ajaton selkeys
- **Scrivener** - Kirjoittajan työkalu
- **Cursor** - AI-avusteinen kehitys



# 🜍 GRIMOIRE - FAUST:n projektimuisti

**"AI joka oppii projektistasi ja kirjoitustyylisi"**

---

## 📖 Konsepti

GRIMOIRE on FAUST:n **kontekstuaalinen muistijärjestelmä** joka tallentaa ja oppii koko projektin aikana:

### Mitä se muistaa?

#### 1. **Kaikki AI-keskustelut**
```javascript
{
  conversations: [
    {
      id: 1729350000000,
      timestamp: "2025-10-19T12:00:00Z",
      prompt: "Paranna tämä dialogi luonnollisemmaksi",
      response: "...",
      model: "claude",
      applied: false
    }
  ]
}
```

**Hyöty**: Voit palata aikaisempiin keskusteluihin ja AI muistaa mitä olet aiemmin pyytänyt.

#### 2. **Tyylivalidit ja säännöt**
```javascript
{
  styleRules: [
    {
      id: 1,
      rule: "Käytä lyhyitä lauseita (max 15 sanaa)",
      example: "Hän käveli. Pysähtyi. Katsoi taakseen.",
      priority: "high"
    },
    {
      id: 2,
      rule: "Vältä passivia",
      example: "Hän avasi oven (EI: Ovi avattiin)",
      priority: "medium"
    }
  ]
}
```

**Hyöty**: AI noudattaa automaattisesti määrittämiäsi tyylisääntöjä jokaisessa ehdotuksessa.

#### 3. **Hylätyt ehdotukset** - AI oppii mitä ET halua
```javascript
{
  rejections: [
    {
      id: 1,
      original: "Hän käveli nopeasti",
      suggestion: "Hän ryntäsi",
      reason: "Liian dramaattinen, hahmo on rauhallinen",
      timestamp: "2025-10-19T12:30:00Z"
    }
  ]
}
```

**Hyöty**: AI EI ehdota samoja asioita uudelleen. Oppii mitä vältät.

#### 4. **Hyväksytyt muutokset** - AI oppii mitä pidät
```javascript
{
  acceptances: [
    {
      id: 1,
      original: "sanoi hiljaa",
      modified: "kuiskasi",
      context: "Chapter: Luku 3",
      timestamp: "2025-10-19T12:45:00Z"
    }
  ]
}
```

**Hyöty**: AI toistaa samaa tyyliä tulevissa ehdotuksissa.

#### 5. **Projektin "ääni"** - Oppii automaattisesti
```javascript
{
  projectVoice: {
    avgSentenceLength: 12,
    lexicon: ["kuiskasi", "varjo", "hiljaisuus", "kylmä"],
    avoidedWords: ["ryntäsi", "huusi", "äkillinen"],
    preferredStructures: ["subject-verb-object", "short-sentences"],
    tone: "dark-atmospheric",
    pov: "3rd person limited",
    tense: "past"
  }
}
```

**Hyöty**: AI tunnistaa ja jäljittelee projektin tyyliä automaattisesti.

#### 6. **Teemat ja symbolit**
```javascript
{
  themes: [
    {
      name: "Eristäytyminen",
      occurrences: [
        { chapter: 1, context: "Emma sulkeutuu asuntoonsa" },
        { chapter: 5, context: "Emma hylkää puhelun" }
      ]
    }
  ],
  symbols: [
    {
      symbol: "Kello",
      meaning: "Ajan kuluminen, kuolema",
      first_appearance: "Luku 2",
      recurrences: ["Luku 4", "Luku 8", "Luku 12"]
    }
  ]
}
```

**Hyöty**: AI tietää projektin syvemmät merkitykset ja voi ehdottaa johdonmukaisia symboleja.

---

## 🎯 Miten se toimii?

### Automaattinen oppiminen

**Jokaisella AI-kutsulla:**
1. AI saa **Grimoire-kontekstin** mukaan promptiin
2. AI näkee:
   - Aikaisemmat tyylivalidit
   - Hylätyt ehdotukset (mitä ei saa ehdottaa)
   - Hyväksytyt muutokset (toista tätä tyyliä)
   - Projektin ääni (sävy, näkökulma, lausepituus)
   - Keskeiset teemat

**Esimerkki promptista:**
```
Olet luova kirjoitusavustaja...

[Käyttäjän alkuperäinen pyyntö]

🜍 PROJEKTIN MUISTI (GRIMOIRE):

**Tyylivalidit:**
- Käytä lyhyitä lauseita (max 15 sanaa)
  Esimerkki: Hän käveli. Pysähtyi. Katsoi taakseen.
- Vältä passivia

**Vältetään (hylätyt ehdotukset):**
- Älä ehdota: "ryntäsi"
  Syy: Liian dramaattinen, hahmo on rauhallinen
- Älä ehdota: "huusi"

**Hyväksytyt muutokset (toista tätä tyyliä):**
- "sanoi hiljaa" → "kuiskasi"
- "katsoi" → "tuijotti"

**Projektin ääni:**
- Sävy: dark-atmospheric
- Näkökulma: 3rd person limited
- Aikamuoto: past
- Vältä sanoja: ryntäsi, huusi, äkillinen

**Keskeiset teemat:**
- Eristäytyminen (5 kertaa)
- Menneisyyden varjot (3 kertaa)

**Noudata näitä ohjeita ja oppimistasi tässä projektissa.**
```

---

## 📊 Oppiminen käytössä

### Skenario: Kirjoitat psykologisen trillerin

**Vaihe 1: Ensimmäinen AI-kutsu (ei muistia)**
```
Käyttäjä: "Paranna tämä dialogi: 'Hän sanoi ääneen että kaikki on hyvin'"

AI ehdottaa: "Hän huusi: 'Kaikki on hyvin!'"

Käyttäjä: [Reject] - "Liian dramaattinen"
```

**→ Grimoire tallentaa hylkäyksen**

**Vaihe 2: Toinen AI-kutsu (muisti toimii)**
```
Käyttäjä: "Paranna tämä dialogi: 'Hän puhui hiljaa'"

AI näkee Grimoiresta: "Älä ehdota: huusi (Syy: Liian dramaattinen)"

AI ehdottaa nyt: "Hän kuiskasi"

Käyttäjä: [Apply] ✓
```

**→ Grimoire tallentaa hyväksynnän**

**Vaihe 3: Kolmas AI-kutsu (syvempi oppiminen)**
```
Käyttäjä: "Paranna tämä dialogi: 'Hän vastasi'"

AI näkee:
- Hylätty: "huusi" (liian dramaattinen)
- Hyväksytty: "hiljaa" → "kuiskasi"
- Projektin ääni: dark-atmospheric, hillitty

AI ehdottaa: "Hän mutisi"

Käyttäjä: [Apply] ✓
```

**→ AI on oppinut projektin tyylin!**

---

## 🛠️ Tekninen toteutus

### Tietorakenne

```javascript
project: {
  title: "Kesän viimeinen päivä",
  characters: [...],
  locations: [...],
  
  grimoire: {
    conversations: [],       // Viimeiset 100 keskustelua
    styleRules: [],          // Käyttäjän määrittelemät säännöt
    rejections: [],          // AI:n hylätyt ehdotukset
    acceptances: [],         // AI:n hyväksytyt muutokset
    projectVoice: {...},     // Automaattisesti opittu tyyli
    themes: [],              // Teemat
    symbols: [],             // Symbolit
    created: "2025-10-19",
    lastUpdated: "2025-10-19",
    totalInteractions: 47
  }
}
```

### Funktiot

```javascript
// Lisää muistiin
addToGrimoire(type, data)
// Tyypes: 'conversation', 'styleRule', 'rejection', 'acceptance'

// Hae konteksti AI:lle
getGrimoireContext()
// Palauttaa formatted string joka lisätään promptiin

// Tallenna projektiin
// Grimoire tallennetaan automaattisesti projektin mukana
```

### Integraatio

**callAIAPI():**
- Hakee `getGrimoireContext()`
- Lisää sen promptiin
- Tallentaa vastauksen `addToGrimoire('conversation', ...)`

**applyEdit():**
- Tallentaa hyväksynnän `addToGrimoire('acceptance', ...)`

**rejectEdit():**
- Tallentaa hylkäyksen `addToGrimoire('rejection', ...)`

---

## 🎨 UI (Tulossa)

### Inspector → Grimoire-välilehti

**Välilehdet:**
1. **Keskustelut** - Historia kaikista AI-keskusteluista
2. **Tyylisäännöt** - Lisää/muokkaa sääntöjä
3. **Oppiminen** - Näytä hylätyt vs. hyväksytyt
4. **Projektin ääni** - Visualisoi opittua tyyliä
5. **Teemat & Symbolit** - Tracker

**Toiminnot:**
- Lisää uusi tyylisääntö
- Poista vanhentunut hylkäys
- Näytä keskusteluhistoria
- Vie Grimoire (JSON)
- Tuo Grimoire toisesta projektista

---

## 💡 Käyttötapaukset

### 1. **Johdonmukainen tyyli koko projektissa**

**Ongelma**: Kirjoitat 300-sivuista romaania. Luvussa 1 käytit tiettyä tyyliä, mutta luvussa 20 AI ehdottaa eri tyyliä.

**Ratkaisu**: Grimoire muistaa koko projektin tyylin ja noudattaa sitä johdonmukaisesti.

### 2. **Älä toista samoja virheitä**

**Ongelma**: AI ehdottaa jatkuvasti "huusi", vaikka olet hylännyt sen 5 kertaa.

**Ratkaisu**: Grimoire tallentaa hylkäykset → AI ei enää ehdota.

### 3. **Opi käyttäjän preferenssit**

**Ongelma**: Jokaisella AI-kutsulla joutuu selittämään haluamasi tyyli uudelleen.

**Ratkaisu**: Grimoire oppii automaattisesti → AI tietää mitä haluat.

### 4. **Tuo tyyli toisesta projektista**

**Ongelma**: Kirjoitat sarjan toista osaa. Haluat saman tyylin kuin ensimmäisessä.

**Ratkaisu**: Vie Grimoire ensimmäisestä projektista → Tuo toiseen projektiin.

---

## 📈 Tulevaisuuden parannukset

### Automaattinen Voice Detection
- Analysoi kirjoitettua tekstiä automaattisesti
- Päivittää `projectVoice` ilman manuaalista syöttöä
- Machine learning -pohjainen tyylintunnistus

### Smart Suggestions
- "Olet hylännyt 'ryntäsi' 3 kertaa. Haluatko lisätä sen vältettyjen sanojen listaan?"
- "Olet hyväksynyt samantyyppisiä muutoksia 5 kertaa. Haluatko luoda tyylisäännön?"

### Cross-Project Learning
- Vie Grimoire-profiili
- Tuo toisen kirjailijan Grimoire
- "Stephen King -tyyli" Grimoire-template

### Collaborative Grimoire
- Jaa Grimoire tiimin kesken
- Kaikki käyttävät samoja tyylisääntöjä
- Synkronoi oppiminen

---

## 🏆 Kilpailuetu

**Vs. ChatGPT / Notion AI:**
- ❌ Ei projektikohtaista muistia
- ❌ Ei opi käyttäjän tyylistä
- ❌ Toistaa samoja ehdotuksia

**FAUST Grimoire:**
- ✅ Projektikohtainen muisti
- ✅ Oppii käyttäjän tyylistä
- ✅ Ei toista hylättyjä ehdotuksia
- ✅ Johdonmukainen 300-sivuisen romaanin yli

---

## 🜍 Yhteenveto

GRIMOIRE tekee FAUST:sta **ensimmäisen AI-kirjoitustyökalun joka todella oppii**.

**Ei enää:**
- ❌ "AI, muista käyttää lyhyitä lauseita" (joka kerta)
- ❌ "Älä ehdota 'ryntäsi', sanoin jo 5 kertaa"
- ❌ "Miksi AI ehdottaa eri tyyliä kuin luvussa 1?"

**Nyt:**
- ✅ AI muistaa kaiken
- ✅ AI oppii jokaisesta vuorovaikutuksesta
- ✅ AI noudattaa projektin tyyliä automaattisesti

**GRIMOIRE = Alkemiallinen muistikirja joka kasvaa projektin mukana.**

---

**Toteutettu:** 19.10.2025  
**Versio:** 1.0.0  
**Status:** ✅ CORE FUNCTIONALITY COMPLETE

**Seuraavat vaiheet:**
1. UI Grimoire-välilehti Inspectoriin
2. Visualisoi oppimista (graafit, statistiikka)
3. Export/Import Grimoire
4. Smart suggestions


# 🜍 CONTEXTUS - FAUST:n hierarkkinen muistijärjestelmä

**"Hallitse 300,000 sanan romaani täydellisellä konsistenssilla"**

---

## 🎯 Ongelma

**Pitkien kirjojen haaste:**
- ChatGPT/Claude: 200K tokenia = ~150,000 sanaa maksimissa
- 300-sivuinen romaani ei mahdu kokonaan kontekstiin
- AI "unohtaa" luvun 1 tapahtumat kun kirjoitat lukua 20
- Hahmot käyttäytyvät epäjohdonmukaisesti
- Juonilangat jäävät ratkaisematta

**FAUST:n ratkaisu:**  
CONTEXTUS = Hierarkkinen 3-tasoinen muistijärjestelmä + älykäs relevanssin arviointi

---

## 🏗️ Arkkitehtuuri

### 3 tasoa kontekstia

```
┌─────────────────────────────────────────────────────┐
│ TASO 1: GLOBAALI METADATA (~2K tokenia)            │
│ ✓ Aina mukana jokaisessa AI-kutsussa               │
├─────────────────────────────────────────────────────┤
│ - Synopsis (200 sanaa)                              │
│ - Teemat                                            │
│ - Aikajana                                          │
│ - POV & tyyli                                       │
│ - GRIMOIRE:n tyylivalidit                          │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ TASO 2: DYNAAMISET TIIVISTELMÄT (~5-10K tokenia)   │
│ ✓ Lukujen tiivistelmät + hahmojen tilat            │
├─────────────────────────────────────────────────────┤
│ - Jokaisen luvun 100-200 sanan tiivistelmä         │
│ - Hahmojen tila kunkin luvun lopussa               │
│ - Juonilankojenstatus per luku                     │
│ - Keskeiset tapahtumat                              │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ TASO 3: AKTIIVINEN TYÖMUISTI (~20-30K tokenia)     │
│ ✓ Dynaamisesti ladattu kyselykohtaisesti           │
├─────────────────────────────────────────────────────┤
│ - Nykyinen luku (täysi teksti)                     │
│ - Edellinen luku (täysi teksti)                    │
│ - Seuraavan luvun outline                          │
│ - Relevantit kohdat aiemmista luvuista            │
│ - Hahmojen dialogihistoria                         │
└─────────────────────────────────────────────────────┘
```

---

## 🧠 Character State Machine

### Hahmon tilan seuranta

Jokaiselle hahmolle per luku/kohtaus:

```javascript
{
  character: "Anna",
  position: "Ch8.Scene3",
  timestamp: "1996-02-15 14:30",
  
  // FYYSINEN TILA
  physical: {
    location: "Kahvila, keskusta",
    appearance: ["siniset farkut", "musta takki", "märät hiukset"],
    injuries: ["mustelma poskessa (Ch8.Sc1)"],
    possessions: ["avaimet", "lompakko", "Markuksen kirje"],
    fatigue: 0.6  // 0-1
  },
  
  // PSYKOLOGINEN TILA
  mental: {
    primary_emotion: "vihainen",
    secondary_emotion: "pettynyt",
    intensity: 0.8,
    trajectory: "eskaloituva",  // vs. "rauhoittuva"
    stress_level: 0.7
  },
  
  // TIEDOLLINEN TILA (kriittinen jatkuvuudelle!)
  knowledge: {
    knows: ["Markuksen salaisuus", "tapaamispaikka"],
    suspects: ["äidin osallisuus"],
    wrong_beliefs: ["luulee Saraa syylliseksi"],
    seeking: ["todiste petoksesta"]
  },
  
  // SUHTEET (muutokset tässä kohtauksessa)
  relationships: {
    "Markus": {
      trust: 0.2,      // -1 to 1
      anger: 0.9,
      recent_interaction: "Ch8.Sc1 - konfrontaatio"
    },
    "Sara": {
      trust: 0.5,
      suspicion: 0.7
    }
  },
  
  // TAVOITTEET
  active_goals: ["selvittää totuus", "kostaa petos"],
  abandoned_goals: ["yhteinen loma (Ch5)"],
  
  // HAHMON ÄÄNI (konsistenssiin)
  voice: {
    formality: 0.3,           // 0=arkinen, 1=muodollinen
    verbosity: 0.6,           // 0=niukkasanainen, 1=vuolas
    directness: 0.8,          // 0=kiertelevä, 1=suora
    emotional_expression: 0.7 // 0=pidättyväinen, 1=avoin
  }
}
```

### Persoonallisuuden ytimen määrittely

```javascript
{
  character: "Anna",
  
  personality_core: {
    // Big Five -mallin mukaan
    traits: {
      openness: 0.4,          // Varovainen uuden suhteen
      conscientiousness: 0.8, // Tunnollinen, järjestelmällinen
      extraversion: 0.3,      // Introvertti
      agreeableness: 0.3,     // Konfrontatiivinen
      neuroticism: 0.6        // Ahdistuva
    },
    
    values: ["rehellisyys", "oikeudenmukaisuus", "perhe"],
    fears: ["hylätyksi tuleminen", "kontrollin menettäminen"],
    
    coping_mechanisms: [
      "vetäytyminen",    // Stressin alla
      "analysointi",     // Ongelmien ratkaisussa
      "konfrontaatio"    // Kun on pakko
    ],
    
    // Hahmon "quick reference"
    archetype: "The Investigator",
    core_wound: "Isän petos lapsuudessa",
    core_desire: "Luottaa ihmisiin ilman pelkoa"
  }
}
```

---

## 🕸️ Plot Causality Engine

### Tapahtumien kausaalisuus

```javascript
{
  event: {
    id: "ch8_ev3",
    type: "revelation",  // 'action', 'decision', 'revelation', 'twist'
    description: "Anna löytää Markuksen päiväkirjan",
    chapter: 8,
    scene: 2,
    story_time: "1996-02-15 14:45",
    location: "Markuksen asunto",
    characters_involved: ["Anna"],
    
    // EDELLYTYKSET (mitä täytyy olla tapahtunut ennen)
    requires: [
      "ch7_ev1: Anna saa avaimen",
      "ch6_ev5: Markus poissa kotoa",
      "ch5_ev2: Anna epäilee petosta"
    ],
    
    // SEURAUKSET (mitä tämän pitäisi aiheuttaa)
    should_cause: [
      {
        type: "knowledge",
        target: "Anna",
        info: "Markuksen todellinen motiivi",
        deadline: "within 1 chapter"
      },
      {
        type: "emotional",
        target: "Anna",
        changes: { trust: -0.3, anger: +0.4 }
      },
      {
        type: "plot_advancement",
        thread: "petos-juonilanka",
        progression: 0.6  // 60% valmis
      }
    ],
    
    // LOOGISET RAJOITTEET
    constraints: {
      cannot_happen_before: ["ch7_ev1"],
      must_happen_before: ["ch10_ev1"],
      excludes: ["ch8_ev5"]  // Ei voi tapahtua samaan aikaan
    },
    
    // TENSION & PACING
    tension_level: 0.8,  // 0-1
    scene_duration: "10 min",
    pacing: "fast"
  }
}
```

### Juonilangan seuranta

```javascript
{
  thread: "Markuksen petos",
  type: "A-plot",  // 'A-plot', 'B-plot', 'subplot'
  
  // Klassinen juonilangan kaari
  arc: {
    setup: {
      target_percentage: 0.10,   // 10% tarinasta
      actual_percentage: 0.12,
      chapters: [1, 2],
      completed: true
    },
    development: {
      target_percentage: 0.30,
      actual_percentage: 0.28,
      chapters: [3, 4, 5, 6, 7],
      completed: true
    },
    complication: {
      target_percentage: 0.20,
      actual_percentage: 0.15,
      chapters: [8, 9],
      completed: false,
      warning: "Tarvitsee lisää käänteitä"
    },
    climax: {
      target_percentage: 0.20,
      actual_percentage: 0,
      chapters: [],
      completed: false
    },
    resolution: {
      target_percentage: 0.20,
      actual_percentage: 0,
      chapters: [],
      completed: false
    }
  },
  
  // Jännityksen kehitys
  tension_curve: [
    { chapter: 1, tension: 0.2 },
    { chapter: 2, tension: 0.3 },
    { chapter: 3, tension: 0.4 },
    { chapter: 8, tension: 0.7 },
    // Pitäisi kasvaa kohti climaxia
  ],
  
  // Yhteydet muihin lankoihin
  entanglement: {
    "Sara-mystery": {
      connection: "Sara might be involved",
      merge_point: "ch12"
    }
  },
  
  // Checkovs guns - lupaukset jotka pitää lunastaa
  promises: [
    {
      setup: "ch2: Gun shown in drawer",
      must_resolve_by: "ch15",
      resolved: false,
      warning: "Unfired Chekhov's gun"
    }
  ]
}
```

---

## ⚡ Älykäs kontekstin lataus

### Query-tyypin mukaan

```javascript
class ContextLoader {
  
  getRelevantContext(query_type, current_chapter) {
    let context = {
      tokens_used: 0,
      max_tokens: 100000  // GPT-4o / Claude 3.5
    };
    
    // AINA mukana (2K tokenia)
    context.add(this.global_metadata);
    context.add(this.grimoire.styleRules);
    
    // QUERY TYYPISTÄ RIIPPUEN
    
    if (query_type === 'dialogue') {
      // Hae kaikkia aikaisempia dialogeja näiden hahmojen välillä
      context.add(this.get_character_interactions(characters));
      context.add(this.get_character_voices(characters));
      context.add(this.get_relationship_history(characters));
    }
    
    else if (query_type === 'description') {
      // Hae aikaisemmat kuvaukset samasta paikasta/henkilöstä
      context.add(this.get_previous_descriptions(entity));
      context.add(this.get_sensory_details(location));
    }
    
    else if (query_type === 'plot_consistency') {
      // Hae kaikki juoneen liittyvät setup-kohdat
      context.add(this.get_plot_thread_history(active_threads));
      context.add(this.get_event_causality_chain());
      context.add(this.get_unfulfilled_promises());
    }
    
    else if (query_type === 'character_action') {
      // Hae hahmon persoonallisuus ja aikaisempi käyttäytyminen
      context.add(this.get_personality_core(character));
      context.add(this.get_character_arc(character));
      context.add(this.get_similar_situations(character));
    }
    
    else if (query_type === 'chapter_summary') {
      // Hae kaikki lukutiivistelmät
      context.add(this.get_all_chapter_summaries());
      context.add(this.get_plot_progression());
    }
    
    // Täytä loput tila relevanteimmilla chunkeilla
    if (context.tokens_used < context.max_tokens) {
      context.add(this.get_recent_chapters(3));
    }
    
    return context;
  }
}
```

---

## 📊 Adaptiivinen tiivistys

### Etäisyysperusteinen kompressio

```javascript
class AdaptiveCompressor {
  
  compress_by_distance(chapter, distance_from_current) {
    
    if (distance_from_current === 0) {
      // Nykyinen luku - täysi teksti
      return chapter.full_text;
    }
    
    else if (distance_from_current === 1) {
      // Edellinen luku - täysi teksti
      return chapter.full_text;
    }
    
    else if (distance_from_current <= 3) {
      // 2-3 lukua taaksepäin - kohtausten pääkohdat
      return this.extract_scene_beats(chapter);
      // "Anna ja Markus kohtaavat kahvilassa. Kiihkeä väittely. 
      //  Markus paljastaa olevansa naimisissa."
    }
    
    else if (distance_from_current <= 10) {
      // 4-10 lukua taaksepäin - vain tärkeät tapahtumat
      return this.extract_key_events(chapter);
      // "TAPAHTUMAT: Anna saa kirjeen, Markus saapuu kaupunkiin"
    }
    
    else {
      // 10+ lukua taaksepäin - yhden kappaleen tiivistelmä
      return this.one_paragraph_summary(chapter);
      // "Luku esittelee Annan ja hänen tyttärensä. Anna työpaikan 
      //  ongelmat. Ensimmäiset vihjeet menneisyydestä."
    }
  }
  
  // Automaattinen tiivistys AI:lla
  auto_summarize_chapter(chapter) {
    const prompt = `
      Tiivistä tämä luku 3 eri tasolle:
      
      LEVEL 1 (Scene beats): Listaa jokainen kohtaus 1-2 lauseessa
      LEVEL 2 (Key events): Vain 3-5 tärkeintä tapahtumaa
      LEVEL 3 (One paragraph): Koko luku 100 sanassa
      
      LUKU:
      ${chapter.full_text}
    `;
    
    return callAI(prompt);
  }
}
```

---

## 🚨 Live Consistency Monitor

### Reaaliaikainen valvonta editorissa

```javascript
class LiveConsistencyMonitor {
  
  on_paragraph_complete(paragraph, context) {
    const issues = [];
    
    // 1. HAHMOJEN TARKISTUS
    const characters = this.extract_characters(paragraph);
    
    for (const char of characters) {
      const current_state = this.character_states.get(char);
      
      // Onko hahmo oikeassa paikassa?
      if (current_state.location !== context.current_location) {
        if (!this.has_travel_explanation(char)) {
          issues.push({
            type: 'location_inconsistency',
            severity: 'high',
            character: char,
            message: `${char} oli juuri ${current_state.location}. 
                     Miten pääsi tänne (${context.current_location})?`,
            suggestion: "Lisää siirtymä tai selitä matka"
          });
        }
      }
      
      // Tietääkö hahmo tämän asian?
      const mentioned_info = this.extract_information(paragraph);
      for (const info of mentioned_info) {
        if (!current_state.knowledge.knows.includes(info)) {
          issues.push({
            type: 'knowledge_inconsistency',
            severity: 'medium',
            character: char,
            message: `${char} ei voi tietää: "${info}"`,
            suggestion: "Näytä miten hahmo saa tiedon tai poista viittaus"
          });
        }
      }
      
      // Käyttäytyykö hahmo persoonallisuutensa mukaisesti?
      const action = this.extract_action(paragraph, char);
      if (action) {
        const personality_check = this.validate_against_personality(
          char, 
          action, 
          current_state
        );
        if (!personality_check.consistent) {
          issues.push({
            type: 'personality_inconsistency',
            severity: 'low',
            character: char,
            message: personality_check.reason,
            suggestion: personality_check.alternative
          });
        }
      }
    }
    
    // 2. JUONEN TARKISTUS
    const events = this.extract_events(paragraph);
    for (const event of events) {
      const causality = this.plot_engine.check_causality(event);
      if (causality.violations.length > 0) {
        issues.push(...causality.violations);
      }
    }
    
    // 3. NÄYTÄ UI:SSA
    if (issues.length > 0) {
      this.show_inline_warnings(issues);
    }
    
    return issues;
  }
}
```

---

## 🎨 UI-visualisoinnit

### 1. Context Usage Indicator

```
┌─────────────────────────────────────────────────┐
│ 🧠 CONTEXT: [████████░░] 80K / 100K used       │
│                                                 │
│ Loaded:                                         │
│ ✓ Global metadata (2K)                         │
│ ✓ Current chapter (5K)                         │
│ ✓ Previous chapter (5K)                        │
│ ✓ Character states (3K)                        │
│ ✓ Plot threads (4K)                            │
│ ✓ Relevant chunks x15 (45K)                    │
│ ✓ GRIMOIRE rules (2K)                          │
│                                                 │
│ [⚙️ Customize] [🔄 Refresh] [🔍 Deep Mode]     │
└─────────────────────────────────────────────────┘
```

### 2. Character Status Panel

```
┌─────────────────────────────────────────────────┐
│ 👥 CHARACTERS - Ch 8, Scene 3                  │
├─────────────────────────────────────────────────┤
│ 📍 Anna [ACTIVE]                               │
│ Location: Kahvila, keskusta ✓                  │
│ Emotion: Vihainen (↑ eskaloituva)             │
│ Knows: Markuksen salaisuus, tapaamispaikka    │
│ Goal: Selvittää totuus                         │
│                                                 │
│ 📍 Markus [MENTIONED]                          │
│ Location: ⚠️ Epäselvä (viimeksi: Helsinki)    │
│ Emotion: Peloissaan                            │
│ Knows: ⚠️ Ei tiedä Annan olevan perässä       │
│                                                 │
│ [Show full states] [Timeline] [Relationships]  │
└─────────────────────────────────────────────────┘
```

### 3. Plot Thread Tracker

```
┌─────────────────────────────────────────────────┐
│ 🕸️ PLOT THREADS                                │
├─────────────────────────────────────────────────┤
│ A: Markuksen petos [████████░░] 80%            │
│    Phase: Complication → Climax                │
│    ⚠️ Needs higher tension (current: 0.6)      │
│                                                 │
│ B: Sara-mysteeri [████░░░░░░] 40%              │
│    Phase: Development                          │
│    ✓ On track                                  │
│                                                 │
│ C: Äidin salaisuus [██░░░░░░░░] 20%            │
│    Phase: Setup                                │
│    ⚠️ Stagnant for 3 chapters                  │
│                                                 │
│ [Add thread] [Merge threads] [Resolve]         │
└─────────────────────────────────────────────────┘
```

### 4. Inline Warnings (kuten VS Code)

```
[Kirjoitat:]

Anna astui kahvilaan ja näki Markuksen pöydässä.
                              ~~~~~~~~
                              ⚠️ Continuity Warning

[Hover tooltip:]
┌──────────────────────────────────────────────┐
│ ⚠️ Location Inconsistency                    │
│                                              │
│ Markus was last seen in:                    │
│ Ch 7, Sc 4 - "Helsinki train station"       │
│ Time since: 2 hours                          │
│                                              │
│ No travel explanation found.                 │
│                                              │
│ Suggestions:                                 │
│ • Add: "Hän oli palannut hiljaa takaisin"   │
│ • Change location to Helsinki               │
│ • Move this scene to later time             │
│                                              │
│ [Ignore] [Fix automatically] [Add note]     │
└──────────────────────────────────────────────┘
```

---

## 🔗 Integraatio GRIMOIRE:n kanssa

### Yhdistetty muistijärjestelmä

```
GRIMOIRE (oppiminen)    +    CONTEXTUS (konteksti)
         ↓                            ↓
    ┌─────────────────────────────────────────┐
    │         FAUST MEMORY SYSTEM             │
    ├─────────────────────────────────────────┤
    │                                         │
    │  GRIMOIRE:                              │
    │  ✓ Tyylivalidit                        │
    │  ✓ Hylätyt ehdotukset                  │
    │  ✓ Hyväksytyt muutokset                │
    │  ✓ Projektin ääni                      │
    │                                         │
    │  CONTEXTUS:                             │
    │  ✓ Globaali metadata                   │
    │  ✓ Lukutiivistelmät                    │
    │  ✓ Hahmojen tilat                      │
    │  ✓ Juonen kausaalisuus                 │
    │  ✓ Aktiivinen työmuisti                │
    │                                         │
    │  → Yhdessä jokaisessa AI-kutsussa      │
    └─────────────────────────────────────────┘
```

Kun AI saa pyynnön:
1. GRIMOIRE kertoo "miten" (tyyli, preferenssit)
2. CONTEXTUS kertoo "mitä" (hahmot, juoni, historia)
3. Yhdessä = Johdonmukainen, tyyliltään oikea vastaus

---

## 📈 Tekninen toteutus FAUST:ssa

### Vaihe 1: Ydinrakenteet (VALMIS / HELPPO)

```javascript
// Lisätään project-stateen:
{
  contextus: {
    // Globaali metadata
    global: {
      synopsis: "",
      themes: [],
      timeline: {},
      pov: "",
      style_dna: ""
    },
    
    // Lukutiivistelmät
    chapter_summaries: [
      {
        chapter: 1,
        summary_short: "",    // 100 sanaa
        summary_medium: "",   // 300 sanaa
        key_events: [],
        tension: 0.3
      }
    ],
    
    // Hahmojen tilat per luku
    character_states: [
      {
        chapter: 1,
        character: "Anna",
        state: { /* kuten yllä */ }
      }
    ],
    
    // Juonilankojen seuranta
    plot_threads: [
      {
        name: "Markuksen petos",
        arc: { /* kuten yllä */ },
        tension_curve: []
      }
    ],
    
    // Tapahtumien kausaliteetti
    event_graph: {
      events: [],
      connections: []
    }
  }
}
```

### Vaihe 2: Funktiot (KESKIVAIKEA)

```javascript
// Kontekstin rakentaja
function buildContextForQuery(query_type, current_chapter) {
  let context = "";
  
  // Globaali metadata (aina)
  context += formatGlobalMetadata();
  context += grimoire.getContext();  // GRIMOIRE integraatio!
  
  // Query-tyypin mukaan
  if (query_type === 'dialogue') {
    context += getCharacterVoices();
    context += getDialogueHistory();
  } else if (query_type === 'plot') {
    context += getPlotThreads();
    context += getEventHistory();
  }
  
  // Nykyinen ja lähiluvut
  context += getCurrentChapter(current_chapter);
  context += getPreviousChapter(current_chapter - 1);
  
  return context;
}

// Jatkuvuuden tarkistus
function checkContinuity(paragraph, context) {
  const issues = [];
  
  // Hahmojen sijainnit
  const characters = extractCharacters(paragraph);
  for (const char of characters) {
    const state = getCharacterState(char, context.current_chapter);
    if (state.location !== context.current_location) {
      issues.push({
        type: 'location',
        message: `${char} oli ${state.location}, nyt ${context.current_location}`
      });
    }
  }
  
  return issues;
}
```

### Vaihe 3: UI-komponentit (HELPPO)

- Context usage indicator
- Character status panel
- Plot thread tracker
- Inline warnings

### Vaihe 4: Embedding-haku (VAIKEA - Tulevaisuus)

- Vector database (Chroma/Pinecone)
- Semanttinen haku relevanteille kohdille
- Automaattinen chunking

---

## 🎯 Käyttötapaukset

### Use Case 1: Kirjoitat lukua 15

**Ongelma:** Anna kohtaa Markuksen. Mitä Anna tietää? Mikä on heidän suhteensa nyt?

**CONTEXTUS vastaa:**
```
Anna's knowledge state (Ch 15):
✓ Knows: Markuksen salaisuus (Ch 8)
✓ Knows: Saran osallisuus (Ch 12)
✗ Doesn't know: Äidin rooli (revealed Ch 18)

Anna-Markus relationship:
Ch 1: Trust 0.8, Love 0.9 → "Rakastunut"
Ch 5: Trust 0.6, Love 0.7 → "Epäilyksiä"
Ch 8: Trust 0.2, Love 0.3 → "Petetty"
Ch 15: Trust 0.1, Love 0.1 → "Vihainen, loukkaantunut"

Suggest tone: Cold, guarded, seeking answers
```

### Use Case 2: AI ehdottaa dialogia

**Ehdotus ilman CONTEXTUS:ia:**
```
"Hei Markus, miten menee?" Anna sanoi iloisesti.
```

**⚠️ ONGELMA:** Anna on vihainen Markukselle (Ch 8)

**Ehdotus CONTEXTUS:in kanssa:**
```
"Mitä sinä täällä teet?" Anna kysyi kylmästi.
```

**✓ KONSISTENTTI:** Heijastaa Annan vihamielisyyttä

---

## 💡 Yhteenveto

CONTEXTUS + GRIMOIRE = Täydellinen muisti pitkille kirjoille

**Mitä se ratkaisee:**
- ✅ 300,000 sanan romaani hallittavissa
- ✅ Hahmot pysyvät johdonmukaisina
- ✅ Juoni ei unohdu
- ✅ Tiedollinen tila realistinen
- ✅ Tapahtumien kausaalisuus varmistetaan
- ✅ Juonilangat eivät jää auki

**Seuraavat vaiheet:**
1. ✅ GRIMOIRE toteutettu (tyyli, preferenssit)
2. 🔄 CONTEXTUS ydinrakenteet (tämä dokumentti)
3. ⏳ UI-visualisoinnit
4. ⏳ Live consistency monitor
5. ⏳ Embedding-pohjainen haku (tulevaisuus)

---

**Luotu:** 19.10.2025  
**Versio:** 1.0.0  
**Status:** 📋 SPECIFICATION COMPLETE - READY FOR IMPLEMENTATION


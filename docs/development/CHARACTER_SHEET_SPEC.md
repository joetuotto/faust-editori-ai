# 🎭 CharacterSheet - Täydellinen Spesifikaatio

**Versio:** v1.2.0  
**Aika-arvio:** 4-6h  
**Tila:** 🚧 Suunnittelu

---

## 🎯 Tavoite

Luoda täysin toiminnallinen CharacterSheet-modal, joka:
- ✅ Tallentaa kaikki hahmon tiedot
- ✅ Validoi pakolliset kentät
- ✅ Tarjoaa intuitiivisen käyttöliittymän
- ✅ Tukee monipuolisia datatyyppejä (teksti, lista, suhteet)

---

## 📐 Rakenne

### 1. Bio-osio (Perustiedot)

**Kentät:**
- **Nimi*** (teksti, pakollinen)
  - Input: `<input type="text">`
  - Validointi: Ei tyhjä
  - Placeholder: "Hahmon nimi"

- **Ikä** (numero, valinnainen)
  - Input: `<input type="number">`
  - Min: 0, Max: 999
  - Placeholder: "Ikä (esim. 25)"

- **Sukupuoli** (dropdown, valinnainen)
  - Options: ["Ei määritelty", "Nainen", "Mies", "Muu"]
  - Default: "Ei määritelty"

- **Ulkonäkö** (pitkä teksti, valinnainen)
  - Input: `<textarea rows="3">`
  - Placeholder: "Fyysinen ulkonäkö, vaatetus, erityispiirteet..."

---

### 2. Persoonallisuus-osio

**Kentät:**
- **Luonteenpiirteet (Traits)** (tag-lista)
  - Input: `<input>` + "Lisää"-nappi
  - Näytetään chipseinä (poisto-X per chip)
  - Esimerkit: "Rohkea", "Ujo", "Viisas"

- **Motivaatiot** (lista)
  - Input: `<textarea>` (yksi per rivi)
  - Placeholder: "Mitä hahmo haluaa saavuttaa?"

- **Pelot** (lista)
  - Input: `<textarea>` (yksi per rivi)
  - Placeholder: "Mitä hahmo pelkää?"

---

### 3. Suhteet-osio

**Rakenne:**
```
Suhdelista:
  - Hahmo: [Dropdown: Muut hahmot]
  - Tyyppi: [Dropdown: Ystävä, Vihollinen, Perhe, Romanttinen, Neutraali]
  - Kuvaus: [Textarea]
  - [Lisää suhde] -nappi
```

**Toteutus:**
- State: `editingCharacter.relationships = []`
- Array of: `{ targetCharacterId, type, description }`

---

### 4. Tarinan Kaari -osio

**Kentät:**
- **Aloitus** (textarea)
  - Placeholder: "Missä hahmo on tarinan alussa?"

- **Kehitys** (textarea)
  - Placeholder: "Miten hahmo muuttuu tarinan aikana?"

- **Lopputulos** (textarea)
  - Placeholder: "Missä hahmo päättyy?"

---

### 5. Footer (Napit)

**Napit:**
- **Tallenna** (sininen)
  - Validoi: Nimi pakollinen
  - Tallenna `project.characters`
  - Sulje modal

- **Peruuta** (harmaa)
  - Älä tallenna muutoksia
  - Sulje modal

---

## 🎨 UI-komponentit

### Osiot (Sections)
```javascript
e('div', { className: 'border-b pb-4 mb-4' },
  e('h4', { className: 'font-bold mb-2' }, 'OSION OTSIKKO'),
  // Kentät tähän
)
```

### Input-kenttä
```javascript
e('div', { className: 'mb-3' },
  e('label', { className: 'text-xs block mb-1' }, 
    'Kentän nimi',
    pakollinen && e('span', { className: 'text-red-500 ml-1' }, '*')
  ),
  e('input', {
    value: editingCharacter?.fieldName || '',
    onChange: (ev) => setEditingCharacter({
      ...editingCharacter,
      fieldName: ev.target.value
    }),
    className: `w-full p-2 rounded border text-sm ${
      isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'
    }`,
    placeholder: 'Placeholder-teksti'
  })
)
```

### Textarea-kenttä
```javascript
e('textarea', {
  rows: 3,
  value: editingCharacter?.fieldName || '',
  onChange: (ev) => setEditingCharacter({
    ...editingCharacter,
    fieldName: ev.target.value
  }),
  className: `w-full p-2 rounded border text-sm ${
    isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'
  }`,
  placeholder: 'Placeholder-teksti'
})
```

### Dropdown
```javascript
e('select', {
  value: editingCharacter?.fieldName || 'default',
  onChange: (ev) => setEditingCharacter({
    ...editingCharacter,
    fieldName: ev.target.value
  }),
  className: `w-full p-2 rounded border text-sm ${
    isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'
  }`
},
  e('option', { value: 'default' }, 'Ei määritelty'),
  e('option', { value: 'option1' }, 'Vaihtoehto 1')
)
```

### Trait Chips (Tagit)
```javascript
e('div', { className: 'flex flex-wrap gap-2 mb-2' },
  editingCharacter?.traits?.map((trait, idx) =>
    e('div', {
      key: idx,
      className: `flex items-center gap-1 px-2 py-1 rounded text-xs ${
        isDarkMode ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'
      }`
    },
      e('span', null, trait),
      e('button', {
        onClick: () => {
          const newTraits = [...editingCharacter.traits];
          newTraits.splice(idx, 1);
          setEditingCharacter({
            ...editingCharacter,
            traits: newTraits
          });
        },
        className: 'hover:text-red-500'
      }, '×')
    )
  )
)
```

---

## 💾 Data-struktuuri

```javascript
character = {
  id: 'char-1',
  name: 'Päähenkilö',
  
  // Bio
  age: 25,
  gender: 'Nainen',
  appearance: 'Pitkä tumma tukka...',
  
  // Persoonallisuus
  traits: ['Rohkea', 'Ujo', 'Viisas'],
  motivations: 'Pelastaa maailma\nLöytää perhe',
  fears: 'Pimeä\nMenettää rakkaansa',
  
  // Suhteet
  relationships: [
    {
      targetCharacterId: 'char-2',
      type: 'Ystävä',
      description: 'Lapsuusystävä'
    }
  ],
  
  // Tarinan kaari
  arc: {
    beginning: 'Tavallinen opiskelija...',
    development: 'Oppii magiaa...',
    end: 'Sankari joka pelasti kaikki'
  }
}
```

---

## ✅ Validointi

### Pakollinen Kenttä: Nimi
```javascript
if (!editingCharacter?.name?.trim()) {
  console.warn('⚠️ Validointivirhe: Nimi on pakollinen');
  return;
}
```

### Visual Feedback:
- Punainen border: `border-red-500`
- Virheilmoitus: "Nimi on pakollinen tieto"
- Disabled nappi: `disabled={!editingCharacter?.name?.trim()}`

---

## 🔄 Tallennuslogiikka

```javascript
const handleSave = () => {
  // Validointi
  if (!editingCharacter?.name?.trim()) {
    console.warn('⚠️ Validointivirhe: Nimi on pakollinen');
    return;
  }
  
  // Tallenna project-stateen
  setProject(prev => ({
    ...prev,
    characters: prev.characters.map(c =>
      c.id === editingCharacter.id ? editingCharacter : c
    )
  }));
  
  // Sulje modal
  setShowCharacterSheet(false);
  console.log('✅ Hahmo tallennettu:', editingCharacter.name);
};
```

---

## 📊 Toteutusjärjestys

### Vaihe 1: Bio-osio (1-2h)
- [x] Nimi (pakollinen, validointi)
- [ ] Ikä
- [ ] Sukupuoli
- [ ] Ulkonäkö

### Vaihe 2: Persoonallisuus (1-2h)
- [ ] Traits (chip-lista)
- [ ] Motivaatiot
- [ ] Pelot

### Vaihe 3: Suhteet (1-2h)
- [ ] Suhdelista-komponentti
- [ ] Lisää/poista suhteita
- [ ] Dropdown muille hahmoille

### Vaihe 4: Tarinan kaari (30min-1h)
- [ ] Aloitus
- [ ] Kehitys
- [ ] Lopputulos

### Vaihe 5: Viimeistely (30min-1h)
- [ ] Tallenna & Peruuta -napit
- [ ] Täysi validointi
- [ ] Testaus
- [ ] Dokumentaatio

---

## 🎨 Esikatselu

```
┌──────────────────────────────────────────────┐
│ Hahmo: Päähenkilö                        [X] │
├──────────────────────────────────────────────┤
│                                              │
│ PERUSTIEDOT                                  │
│ Nimi *                                       │
│ [Päähenkilö________________]                 │
│                                              │
│ Ikä                    Sukupuoli             │
│ [25_____]              [Nainen ▼]            │
│                                              │
│ Ulkonäkö                                     │
│ [Pitkä tumma tukka,_________________]        │
│ [sininen takki..._____________________]      │
│ [___________________________________]        │
│                                              │
│ ─────────────────────────────────────────    │
│                                              │
│ PERSOONALLISUUS                              │
│ Luonteenpiirteet                             │
│ [Rohkea×] [Ujo×] [Viisas×]                   │
│ [Lisää piirre_______] [+ Lisää]              │
│                                              │
│ Motivaatiot                                  │
│ [Pelastaa maailma________________]           │
│ [Löytää perhe____________________]           │
│                                              │
│ Pelot                                        │
│ [Pimeä___________________________]           │
│ [Menettää rakkaansa_______________]          │
│                                              │
│ ─────────────────────────────────────────    │
│                                              │
│ SUHTEET                                      │
│ → Ystävä: [Lapsuusystävä ▼]                  │
│   "Lapsuusystävä, aina tukena"               │
│ [+ Lisää suhde]                              │
│                                              │
│ ─────────────────────────────────────────    │
│                                              │
│ TARINAN KAARI                                │
│ Aloitus                                      │
│ [Tavallinen opiskelija...________]           │
│                                              │
│ Kehitys                                      │
│ [Oppii magiaa...__________________]          │
│                                              │
│ Lopputulos                                   │
│ [Sankari joka pelasti kaikki______]          │
│                                              │
├──────────────────────────────────────────────┤
│            [Peruuta]  [Tallenna]             │
└──────────────────────────────────────────────┘
```

---

## 🚀 Aloitus

1. Lue tämä spesifikaatio
2. Aloita Vaiheesta 1 (Bio-osio)
3. Testaa jokainen osio erikseen
4. Committaa vähintään 2-3 kertaa matkan varrella
5. Lopullinen commit kun valmis

---

*Dokumentti luotu: 20.10.2024 23:50*  
*Status: 📝 Suunnitelma valmis, aloitetaan toteutus!*


# 🎨 Modaalien Korjaus - Faustin UI-spesifikaatio

**Tavoite:** Kaikki 4 modaalia noudattavat Faustin visuaalista identiteettiä ja sisältävät AI-integraation.

---

## ❌ Nykyiset ongelmat:

### 1. Värit (Kaikki modaalit)
```javascript
// ENNEN (väärä):
className: 'bg-blue-500 hover:bg-blue-600'    // Geneerinen sininen
className: 'bg-green-500'                     // Geneerinen vihreä
className: 'border-red-500'                   // Geneerinen punainen
className: 'bg-gray-700'                      // Geneerinen harmaa

// JÄLKEEN (Faust):
className: `${isDarkMode 
  ? 'bg-[#9A7B4F] hover:bg-[#C89D5E]'        // NOX kulta + hover
  : 'bg-[#C89D5E] hover:bg-[#9A7B4F]'        // DEIS kulta + hover
}`
```

### 2. Typografia
```javascript
// ENNEN (ei määritelty):
e('h3', { className: 'text-lg font-bold' }, 'Hahmo')

// JÄLKEEN (Faust):
e('h3', { 
  className: 'text-lg font-bold',
  style: { fontFamily: 'EB Garamond' }      // Otsikot
}, 'Hahmo')

// Input/Textarea:
style: { fontFamily: 'IBM Plex Mono', fontSize: '15px' }
```

### 3. Efektit
```javascript
// Modal fade-in:
style: { 
  animation: 'fadeIn 250ms ease-in-out'
}

// Inset shadow (paperi):
boxShadow: 'inset 0 0 16px rgba(0,0,0,0.2)'

// Kultainen hehku (hover):
boxShadow: '0 0 0 3px rgba(154,123,79,0.2)'
```

### 4. AI-integraatio (Puuttuu!)
```javascript
// Esim. Ulkonäkö-kentän vieressä:
e('button', {
  onClick: async () => {
    const prompt = `Luo ulkonäkökuvaus hahmolle: ${editingCharacter.name}, ikä: ${editingCharacter.age}, sukupuoli: ${editingCharacter.gender}`;
    const result = await window.electronAPI.generateWithAI({
      prompt,
      model: 'claude-3-5-sonnet-20241022'
    });
    setEditingCharacter({
      ...editingCharacter,
      appearance: result
    });
  },
  className: `px-2 py-1 rounded text-xs ${
    isDarkMode ? 'bg-[#9A7B4F] hover:bg-[#C89D5E]' : 'bg-[#C89D5E] hover:bg-[#9A7B4F]'
  }`,
  title: 'Generoi ulkonäkö AI:n avulla'
}, '🜓 Luo AI:lla')
```

---

## ✅ Korjattavat kohdat per modal:

### CharacterSheet (~325 riviä)
**Rivit:** 9508-9832

#### Värit:
- [ ] Tallenna-nappi: sininen → **kulta**
- [ ] Lisää trait -nappi: sininen → **kulta**
- [ ] Lisää suhde -nappi: vihreä → **kulta**
- [ ] Poista-napit (X): punainen → **pronssi**
- [ ] Trait chipit: sininen → **kultainen/pronssinen**
- [ ] Punainen border (virhe): punainen → **varoitus-pronssi**

#### Typografia:
- [ ] h3 "Hahmo": **EB Garamond 18px**
- [ ] h4 osiot: **EB Garamond 14px**
- [ ] Inputit/textareat: **IBM Plex Mono 15px**
- [ ] Label: **IBM Plex Mono 13px**

#### AI-napit:
- [ ] Ulkonäkö → 🜓 "Luo ulkonäkö AI:lla"
- [ ] Traits → 🜓 "Ehdota piirteitä AI:lla"
- [ ] Motivaatiot → 🜓 "Luo motivaatiot AI:lla"
- [ ] Pelot → 🜓 "Luo pelot AI:lla"
- [ ] Tarinan kaari (3 kenttää) → 3x 🜓 AI-napit

#### Efektit:
- [ ] Modal: 250ms fade-in
- [ ] Hover: kultainen hehku

---

### LocationSheet (~200 riviä)
**Rivit:** 9834-10033

#### Värit:
- [ ] Tallenna-nappi: sininen → **kulta**
- [ ] Punainen border (virhe): punainen → **varoitus-pronssi**

#### Typografia:
- [ ] h3 "Paikka": **EB Garamond 18px**
- [ ] h4 osiot: **EB Garamond 14px**
- [ ] Inputit/textareat: **IBM Plex Mono 15px**

#### AI-napit:
- [ ] Kuvaus → 🜓 "Luo kuvaus AI:lla"
- [ ] Äänet/tuoksut → 🜓 "Luo atmosfääri AI:lla"

#### Efektit:
- [ ] Modal: 250ms fade-in

---

### ChapterSheet (~70 riviä)
**Rivit:** 9732-9801

#### Värit:
- [ ] Tallenna-nappi: sininen → **kulta**
- [ ] Punainen border (virhe): punainen → **varoitus-pronssi**

#### Typografia:
- [ ] h3 "Luku": **EB Garamond 18px**
- [ ] Input: **IBM Plex Mono 15px**

#### AI-napit:
- [ ] Otsikko → 🜓 "Ehdota otsikko AI:lla"

#### Efektit:
- [ ] Modal: 250ms fade-in

---

### ThreadSheet (~245 riviä)
**Rivit:** 10006-10250

#### Värit:
- [ ] Tallenna-nappi: sininen → **kulta**
- [ ] Progress bar: sininen → **kulta/pronssi gradient**
- [ ] Punainen border (virhe): punainen → **varoitus-pronssi**

#### Typografia:
- [ ] h3 "Juonenlanka": **EB Garamond 18px**
- [ ] h4 osiot: **EB Garamond 14px**
- [ ] Inputit/textareat: **IBM Plex Mono 15px**

#### AI-napit:
- [ ] Kuvaus → 🜓 "Luo juonikuvaus AI:lla"

#### Efektit:
- [ ] Modal: 250ms fade-in
- [ ] Progress bar: kultainen gradient

---

## 📝 Toteutusjärjestys:

1. **Lisää CSS-animaatio** (fade-in)
2. **CharacterSheet** (suurin, 8 AI-nappia)
3. **LocationSheet** (2 AI-nappia)
4. **ChapterSheet** (1 AI-nappi)
5. **ThreadSheet** (1 AI-nappi + progress bar)
6. **Testaa** (värit, fontti, AI-toiminnot)
7. **Commitoi** yhtenä isona korjauksena

---

## 🎨 Värikoodi-referenssi:

### NOX (Dark):
```javascript
gold: '#9A7B4F'
goldHover: '#C89D5E'
bronze: '#715C38'
bg: '#141210'
bgDark: '#100F0D'
bgShadow: '#1A1815'
paper: '#F0E8DC'
ink: '#E9E4DA'
```

### DEIS (Light):
```javascript
gold: '#C89D5E'
bronze: '#715C38'
bg: '#F8F2E8'
paper: '#F2EADF'
ink: '#2B241C'
shadow: '#E6DED2'
```

---

**Arvioitu aika:** 2-3h  
**Rivejä muutettava:** ~840 riviä (4 modaalia yhteensä)  
**AI-nappeja lisättävä:** 12 kpl


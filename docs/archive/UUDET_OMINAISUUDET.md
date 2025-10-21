# 🎉 Uudet ominaisuudet - Valitun tekstin muokkaus AI:lla

**Päivitetty**: 19.10.2025  
**Versio**: 1.1.0

---

## ✨ MITÄ UUTTA?

### 1. ️ **Quick Actions - Muokkaa valittua tekstiä AI:lla**

**Miten toimii:**
1. Valitse teksti editorissa (hiirellä tai näppäimistöllä)
2. Näkyviin ilmestyy Quick Actions -popup keskelle ruutua
3. Valitse toiminto:
   - **✨ Paranna** - Parantaa tyyliä ja sujuvuutta
   - **📏 Lyhennä** - Lyhentää tekstin noin puoleen
   - **📖 Laajenna** - Lisää yksityiskohtia ja syvyyttä
   - **✅ Korjaa** - Korjaa kielioppi ja tyylvirheet

**Käyttöesimerkki:**
```
1. Kirjoita: "Hän meni taloon ja katsoi ympärilleen."
2. Valitse teksti
3. Paina "✨ Paranna"
4. AI ehdottaa: "Hän astui talon kynnykselle ja antoi katseensa harhailla huoneen poikki."
5. Paina "↺ Korvaa valinta" AI-paneelissa
6. Valmis!
```

---

### 2. 📍 **Parannettu "Lisää tekstiin" -nappi**

**Uusi dropdown-valikko:**
- **➕ Lisää loppuun** - Lisää AI:n vastauksen dokumentin loppuun
- **📍 Lisää kursorin kohtaan** - Lisää kursorin kohdalle
- **↺ Korvaa valinta** - Korvaa valitun tekstin (näkyy kun teksti valittuna)
- **⚠️ Korvaa kaikki** - Korvaa koko dokumentin sisältö (varoitus!)

**Käyttö:**
1. Kysy AI:lta jotain
2. Kun AI vastaa, paina "Lisää tekstiin ▼"
3. Valitse mitä haluat tehdä

---

### 3. ⚙️ **Automaattinen jatkuvuuden valvonta**

**Mitä se tekee:**
- Valvoo automaattisesti kirjoitustasi
- Tarkistaa hahmojen jatkuvuuden
- Havaitsee ristiriitoja juonessa
- Näyttää varoitukset Inspector-paneelissa

**Miten aktivoida:**
1. Avaa Inspector-paneeli (Cmd+Alt+I)
2. Siirry "Hahmot"-välilehdelle
3. Aktivoi "⚙️ Automaattinen valvonta" -valinta
4. Kirjoita - AI tarkistaa tekstin 3 sekunnin kuluttua kun lopetat kirjoittamisen

**Varoitukset:**
- Jos löytyy ongelmia, ne näkyvät Hahmot-välilehden ylhäällä
- Toast-notifikaatio ilmoittaa löydetyistä varoituksista

---

## 🎯 KÄYTTÖTAPAUSESIMERKIT

### Esimerkki 1: Paranna dialogia

**Alkuperäinen:**
```
"Minä en tiedä mitä tehdä", hän sanoi.
```

**Toiminta:**
1. Valitse teksti
2. Paina "✨ Paranna"
3. AI ehdottaa: "Hän painoi sormensa ohimoilleen. 'En vain... en tiedä. Mikään ei tunnu oikealta.'"
4. Korvaa valinta

---

### Esimerkki 2: Lyhennä pitkä kuvaus

**Alkuperäinen (200 sanaa):**
```
Huone oli suuri ja avara. Katosta roikkui kristallikruunu, joka heijasti valoa kaikkialle...
[pitkä kuvaus jatkuu]
```

**Toiminta:**
1. Valitse koko kuvaus
2. Paina "📏 Lyhennä"
3. AI lyhentää ~100 sanaan säilyttäen olennaisen

---

### Esimerkki 3: Laajenna tunnekohtausta

**Alkuperäinen:**
```
Hän oli vihainen.
```

**Toiminta:**
1. Valitse teksti
2. Paina "📖 Laajenna"
3. AI lisää: "Viha kuplii hänen sisällään kuin kiehuvavesi kattilassa. Kädet puristuivat nyrkkiin, leukapäät kireytyivät. Hän nieleskeli sanoja jotka uhkasivat purkautua ulos - sanoja joita ei voisi ottaa takaisin."

---

## 📊 TEKNINEN KUVAUS

### Uudet funktiot (app.js)

```javascript
// 1. Tekstin valinnan käsittely
const handleTextSelection = () => {
  // Tallentaa valitun tekstin ja sen sijainnin
  // Näyttää Quick Actions -popupin
}

// 2. Quick Actions -toiminnot
const handleQuickAction = async (action) => {
  // improve, shorten, expand, fix
  // Lähettää promptin AI:lle
  // Avaa AI-paneelin automaattisesti
}

// 3. Valitun tekstin korvaaminen
const replaceSelectedText = (newText) => {
  // Korvaa valitun tekstin editorissa
  // Säilyttää kursorin sijainnin
}

// 4. Parannettu insertAiResponse
const insertAiResponse = (mode) => {
  // mode: 'append', 'replace-selection', 'replace-all', 'at-cursor'
  // Lisää AI:n vastauksen valitulla tavalla
}

// 5. Automaattinen valvonta
const checkContinuityQuietly = async (content) => {
  // Tarkistaa hahmot ja juonen
  // Palauttaa varoitukset
}
```

### Uudet state-muuttujat

```javascript
const [selectedText, setSelectedText] = useState('');
const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 });
const [showQuickActions, setShowQuickActions] = useState(false);
const [showInsertMenu, setShowInsertMenu] = useState(false);
const [autoCheckEnabled, setAutoCheckEnabled] = useState(false);
const [inlineWarnings, setInlineWarnings] = useState([]);
```

### Event handlerit editorissa

```javascript
<textarea
  ref={editorRef}
  onMouseUp={handleTextSelection}
  onKeyUp={handleTextSelection}
  // ... muut propsit
/>
```

---

## 🐛 TUNNETUT RAJOITUKSET

### 1. Quick Actions -sijainti
- Popup näkyy aina keskellä ruutua
- Ei seuraa valitun tekstin sijaintia
- **Parannus tulevassa versiossa**: Popup ilmestyy valitun tekstin viereen

### 2. Automaattinen valvonta
- Perustarkistus - ei täysin kattava
- Liian hidas täyteen AI-analyysiin reaaliajassa
- **Suositus**: Käytä manuaalista "🔍 Tarkista" -nappia syvempään analyysiin

### 3. Useita valintoja
- Ei tue useita valintoja yhtä aikaa
- Vain yksi valinta kerrallaan

---

## 💡 VINKIT JA NIKSIT

### Vinkki 1: Nopea muokkaus
```
1. Valitse teksti
2. Paina haluttu Quick Action
3. Odota AI:n vastausta
4. Paina "↺ Korvaa valinta" välittömästi
   (ei tarvitse lukea koko vastausta)
```

### Vinkki 2: Vertaile versioita
```
1. Valitse teksti
2. Käytä "✨ Paranna"
3. ÄLÄ korvaa heti - lue AI:n ehdotus
4. Päätä kumpaa käytät
5. Jos korvaat, käytä Undo (Cmd+Z) palauttaaksesi alkuperäisen
```

### Vinkki 3: Ketjuta toimintoja
```
1. Kirjoita nopea luonnos
2. "📖 Laajenna" → Lisää yksityiskohtia
3. "✨ Paranna" → Hio tyyliä
4. "✅ Korjaa" → Viimeistele
```

---

## 🎓 PARHAAT KÄYTÄNNÖT

### DO ✅

- **Valitse tarpeeksi tekstiä** - Vähintään lause, mieluiten kappale
- **Käytä "Lyhennä" ennen "Paranna"** - Saat paremman rytmin
- **Tarkista aina lopputulos** - AI ei ole täydellinen
- **Käytä automaattista valvontaa isommissa projekteissa** - Säästää aikaa

### DON'T ❌

- **Älä korvaa koko kirjaa kerralla** - AI menettää kontekstin
- **Älä luota sokeasti** - Lue aina AI:n ehdotukset
- **Älä käytä "Korvaa kaikki" vahingossa** - Se on peruuttamaton!
- **Älä valitse liian lyhyttä tekstiä** - AI tarvitsee kontekstia

---

## 🔧 VIANMÄÄRITYS

### Ongelma: Quick Actions ei näy

**Ratkaisu:**
1. Varmista että olet valinnut tekstin (ei vain kursori välissä)
2. Yritä valita uudelleen hiirellä
3. Jos ei toimi, päivitä sivu (Cmd+R)

### Ongelma: "Korvaa valinta" -nappi ei näy

**Syy:** Teksti ei ole valittuna enää kun AI vastasi

**Ratkaisu:**
1. Valitse teksti uudelleen
2. Nappi ilmestyy AI-paneeliin

### Ongelma: Automaattinen valvonta ei toimi

**Tarkista:**
1. Onko valvonta aktivoitu Inspector → Hahmot?
2. Onko projektissa hahmoja?
3. Onko dokumentissa yli 100 merkkiä tekstiä?

---

## 📈 SUORITUSKYKY

### Quick Actions
- **Nopeus**: ~2-5s (riippuu AI:sta)
- **Kuormitus**: Kevyt
- **Suositus**: Toimii hyvin jopa isoilla tekstipätkillä (max ~1000 sanaa)

### Automaattinen valvonta
- **Viive**: 3s kirjoituksen lopettamisen jälkeen
- **Kuormitus**: Kevyt (ei käytä AI:ta, vain yksinkertainen analyysi)
- **Suositus**: Pidä päällä aina

---

## 🚀 TULEVAT PARANNUKSET

### v1.2 (tulossa pian)
- [ ] Quick Actions -popup seuraa valitun tekstin sijaintia
- [ ] Inline-ehdotukset (näkyvät suoraan editorissa)
- [ ] Undo/Redo Quick Actions -toiminnoille
- [ ] Oma pikanäppäin Quick Actions:ille (Cmd+Shift+A)

### v1.3 (myöhemmin)
- [ ] Täysi AI-pohjainen jatkuvuuden valvonta
- [ ] Inline-varoitukset editorissa (punainen aaltoviiva)
- [ ] Custom Quick Actions (luo omia)
- [ ] Quick Actions historia

---

## ❓ UKK

**K: Voinko muokata AI:n vastausta ennen korvaamista?**  
V: Kyllä! Kopioi vastaus, muokkaa se editorissa, ja käytä sitten.

**K: Kuluttaako automaattinen valvonta API-kutsuja?**  
V: EI! Se on paikallinen toiminto, ei käytä AI:ta.

**K: Voinko käyttää Quick Actions:ia ilman AI-avaimia?**  
V: Et. Tarvitset vähintään yhden AI API -avaimen (.env-tiedostossa).

**K: Mikä on paras AI Quick Actions:ille?**  
V: Claude 3.5 Sonnet (nopea + hyvä) tai GPT-4 (hitaampi mutta loistava).

**K: Toimiiko automaattinen valvonta offline?**  
V: Kyllä! Se ei tarvitse nettiyhteyttä.

---

## 📞 TUKI

Jos sinulla on ongelmia:
1. Tarkista `API_KEYS.md` - onko API-avaimet oikein?
2. Tarkista konsoli (Cmd+Option+I) - näkyykö virheitä?
3. Yritä päivittää sivu (Cmd+R)
4. Viimeisenä keinona: Käynnistä sovellus uudelleen

---

**Nauti uusista ominaisuuksista!** 🎉

Jos sinulla on ideoita parannuksista, kerro ihmeessä! 💡


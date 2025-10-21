# 🧪 Testausohje - Uudet ominaisuudet

**Versio**: 1.1.0  
**Päivitetty**: 19.10.2025

---

## 🎯 MITÄ TESTATAAN?

1. ✨ **Quick Actions** - Valitun tekstin muokkaus AI:lla
2. 📍 **Parannettu "Lisää tekstiin"** - Dropdown-valikko
3. ⚙️ **Automaattinen jatkuvuuden valvonta**

---

## 📋 TESTI 1: Quick Actions

### Valmistelu
1. Käynnistä sovellus: `npm start`
2. Avaa projekti tai luo uusi
3. Kirjoita testimateriaalia (esim. muutama kappale)
4. Varmista että AI API -avaimet on .env-tiedostossa

### Testaus

#### 1.1 Tekstin valinta näyttää Quick Actions:in

**Vaiheet:**
1. Valitse tekstiä editorissa hiirellä
2. Tarkista että Quick Actions -popup ilmestyy keskelle ruutua
3. Näkyykö 4 nappia: ✨📏📖✅ ja × (sulje)?

**Odotettu tulos:** ✅ Popup näkyy, 5 nappia

**Toimii:** [ ] Kyllä [ ] Ei

---

#### 1.2 Quick Action: Paranna (✨)

**Vaiheet:**
1. Kirjoita: "Hän meni ulos ja katsoi aurinkoa."
2. Valitse teksti
3. Paina "✨ Paranna"
4. Odota AI:n vastausta
5. Tarkista AI-paneeli (Cmd+Alt+A)

**Odotettu tulos:** 
- ✅ AI-paneeli avautuu automaattisesti
- ✅ AI:n vastaus näkyy paneelissa
- ✅ "↺ Korvaa valinta" -nappi näkyy (sininen)

**Toimii:** [ ] Kyllä [ ] Ei

**AI:n vastaus:**
```
[Kopioi tähän mitä AI vastasi]
```

---

#### 1.3 Valitun tekstin korvaaminen

**Vaiheet:**
1. (Jatka edellisestä)
2. Paina "↺ Korvaa valinta" AI-paneelissa
3. Tarkista editori

**Odotettu tulos:**
- ✅ Valittu teksti korvattu AI:n vastauksella
- ✅ Kursori on korvatun tekstin lopussa
- ✅ AI-paneelin vastaus tyhjeni

**Toimii:** [ ] Kyllä [ ] Ei

---

#### 1.4 Quick Action: Lyhennä (📏)

**Vaiheet:**
1. Kirjoita pitkä kappale (~200 sanaa)
2. Valitse koko kappale
3. Paina "📏 Lyhennä"
4. Odota vastausta
5. Paina "↺ Korvaa valinta"

**Odotettu tulos:**
- ✅ AI lyhentää tekstin noin puoleen
- ✅ Olennainen sisältö säilyy
- ✅ Teksti korvataan editorissa

**Toimii:** [ ] Kyllä [ ] Ei

**Sanamäärä:**
- Ennen: ___ sanaa
- Jälkeen: ___ sanaa

---

#### 1.5 Quick Action: Laajenna (📖)

**Vaiheet:**
1. Kirjoita lyhyt lause: "Hän oli surullinen."
2. Valitse teksti
3. Paina "📖 Laajenna"
4. Odota vastausta
5. Paina "↺ Korvaa valinta"

**Odotettu tulos:**
- ✅ AI lisää yksityiskohtia ja syvyyttä
- ✅ Teksti on pidempi (ainakin 2-3x)
- ✅ Sävy ja merkitys säilyvät

**Toimii:** [ ] Kyllä [ ] Ei

---

#### 1.6 Quick Action: Korjaa (✅)

**Vaiheet:**
1. Kirjoita teksti virheillä: "Minä menin kaupungin ja ostan leipa."
2. Valitse teksti
3. Paina "✅ Korjaa"
4. Odota vastausta
5. Paina "↺ Korvaa valinta"

**Odotettu tulos:**
- ✅ AI korjaa kielioppivirheet
- ✅ Korjattu: "Minä menin kaupunkiin ja ostin leipää."
- ✅ Teksti korvataan

**Toimii:** [ ] Kyllä [ ] Ei

---

#### 1.7 Quick Actions sulkeminen

**Vaiheet:**
1. Valitse tekstiä
2. Quick Actions ilmestyy
3. Paina "×" (sulje-nappi)

**Odotettu tulos:**
- ✅ Popup sulkeutuu
- ✅ Teksti pysyy valittuna

**Toimii:** [ ] Kyllä [ ] Ei

---

#### 1.8 Quick Actions katoaa kun teksti devalitaan

**Vaiheet:**
1. Valitse tekstiä → Quick Actions näkyy
2. Klikkaa editoria muualla (poista valinta)

**Odotettu tulos:**
- ✅ Quick Actions katoaa automaattisesti

**Toimii:** [ ] Kyllä [ ] Ei

---

## 📋 TESTI 2: Parannettu "Lisää tekstiin"

### Valmistelu
- Sama kuin Testi 1

### Testaus

#### 2.1 Dropdown-valikon näyttäminen

**Vaiheet:**
1. Kysy AI:lta jotain: "Kirjoita lyhyt runo"
2. Odota vastausta
3. Tarkista AI-paneeli
4. Paina "Lisää tekstiin ▼"

**Odotettu tulos:**
- ✅ Dropdown-valikko avautuu
- ✅ 3 vaihtoehtoa näkyy:
  - ➕ Lisää loppuun
  - 📍 Lisää kursorin kohtaan
  - ⚠️ Korvaa kaikki

**Toimii:** [ ] Kyllä [ ] Ei

---

#### 2.2 Lisää loppuun

**Vaiheet:**
1. (Jatka edellisestä)
2. Valitse "➕ Lisää loppuun"
3. Tarkista editori

**Odotettu tulos:**
- ✅ AI:n vastaus lisätään dokumentin loppuun
- ✅ Väliin lisätään 2 rivinvaihtoa
- ✅ Editori scrollaa alas automaattisesti

**Toimii:** [ ] Kyllä [ ] Ei

---

#### 2.3 Lisää kursorin kohtaan

**Vaiheet:**
1. Kysy AI:lta: "Kirjoita dialogi"
2. Aseta kursori dokumentin keskelle
3. Paina "Lisää tekstiin ▼" → "📍 Lisää kursorin kohtaan"

**Odotettu tulos:**
- ✅ AI:n vastaus lisätään kursorin kohtaan
- ✅ Kursori siirtyy lisätyn tekstin loppuun

**Toimii:** [ ] Kyllä [ ] Ei

---

#### 2.4 Korvaa valinta (kun teksti valittuna)

**Vaiheet:**
1. Kirjoita: "Placeholder-teksti tähän"
2. Valitse "Placeholder-teksti tähän"
3. Kysy AI:lta: "Kirjoita kuvaus talosta"
4. Kun AI vastaa, näkyykö "↺ Korvaa valinta" -nappi?
5. Paina sitä

**Odotettu tulos:**
- ✅ "↺ Korvaa valinta" -nappi näkyy (sininen, ennen dropdown:ia)
- ✅ Valittu teksti korvataan AI:n vastauksella

**Toimii:** [ ] Kyllä [ ] Ei

---

#### 2.5 Korvaa kaikki (VAROITUS)

**Vaiheet:**
1. Kirjoita dokumenttiin jotain
2. Kysy AI:lta jotain
3. Paina "Lisää tekstiin ▼" → "⚠️ Korvaa kaikki"
4. **HUOM:** Varmista että sinulla on varmuuskopio!

**Odotettu tulos:**
- ✅ KOKO dokumentin sisältö korvataan
- ✅ Vanha sisältö häviää (palauta Cmd+Z:llä)

**Toimii:** [ ] Kyllä [ ] Ei

**Palautus toimii (Cmd+Z):** [ ] Kyllä [ ] Ei

---

## 📋 TESTI 3: Automaattinen jatkuvuuden valvonta

### Valmistelu
1. Avaa projekti
2. Luo ainakin yksi hahmo (Inspector → Hahmot → + Lisää hahmo)
   - Nimi: "Anna"
   - Lisää jokin yksityiskohta (esim. "Käyttää punaisä laukkua")

### Testaus

#### 3.1 Valvonnan aktivointi

**Vaiheet:**
1. Avaa Inspector (Cmd+Alt+I)
2. Siirry "Hahmot"-välilehdelle
3. Etsi "⚙️ Automaattinen valvonta" -valinta
4. Aktivoi se (checkbox)

**Odotettu tulos:**
- ✅ Checkbox näkyy
- ✅ Kuvaus: "Tarkistaa jatkuvuuden automaattisesti kirjoituksen aikana"
- ✅ Checkbox pysyy aktivoituna

**Toimii:** [ ] Kyllä [ ] Ei

---

#### 3.2 Valvonta toimii

**Vaiheet:**
1. (Automaattinen valvonta päällä)
2. Kirjoita editoriin ~150 merkkiä tekstiä
3. Lopeta kirjoittaminen
4. Odota 3 sekuntia
5. Tarkista Hahmot-välilehti

**Odotettu tulos:**
- ✅ Ei varoituksia (jos teksti on OK)
- ✅ TAI varoitukset näkyvät välilehden alla

**Toimii:** [ ] Kyllä [ ] Ei

---

#### 3.3 Varoitusten näyttäminen

**Vaiheet:**
1. (Automaattinen valvonta päällä)
2. Kirjoita: "Anna otti laukustaan avaimen. Hän avasi oven."
3. Kirjoita myöhemmin: "Anna otti taskustaan rahaa."
4. Lopeta kirjoittaminen
5. Odota 3 sekuntia

**Odotettu tulos:**
- ✅ Varoitus (jos AI huomaa):
  - ⚠️ "Anna käyttää laukkua, mutta myöhemmin taskua"
- ✅ Varoitukset näkyvät Hahmot-välilehdellä

**Toimii:** [ ] Kyllä [ ] Ei

**Huom:** Tämä on yksinkertainen tarkistus, ei täydellinen AI-analyysi.

---

#### 3.4 Valvonnan deaktivointi

**Vaiheet:**
1. (Automaattinen valvonta päällä)
2. Poista checkbox
3. Kirjoita tekstiä
4. Odota 3 sekuntia

**Odotettu tulos:**
- ✅ Ei varoituksia (koska valvonta pois päältä)

**Toimii:** [ ] Kyllä [ ] Ei

---

## 📋 TESTI 4: Integraatiotestit

### 4.1 Quick Actions + Korvaa valinta

**Vaiheet:**
1. Valitse teksti editorissa
2. Paina "✨ Paranna" (Quick Actions)
3. Kun AI vastaa, paina "↺ Korvaa valinta" (AI-paneelissa)

**Odotettu tulos:**
- ✅ Kaikki toimii saumattomasti
- ✅ Valittu teksti korvataan

**Toimii:** [ ] Kyllä [ ] Ei

---

### 4.2 Useat Quick Actions peräkkäin

**Vaiheet:**
1. Valitse teksti
2. "📖 Laajenna"
3. Kun valmis, valitse SAMA teksti uudelleen
4. "✨ Paranna"
5. Kun valmis, valitse SAMA teksti uudelleen
6. "✅ Korjaa"

**Odotettu tulos:**
- ✅ Jokainen toiminto toimii
- ✅ Teksti paranee vaiheittain

**Toimii:** [ ] Kyllä [ ] Ei

---

### 4.3 Automaattinen valvonta + Quick Actions

**Vaiheet:**
1. Aktivoi automaattinen valvonta
2. Kirjoita tekstiä
3. Käytä Quick Actions:ia muokkaamaan
4. Tarkista onko varoituksia

**Odotettu tulos:**
- ✅ Molemmat toimivat rinnakkain
- ✅ Ei konflikteja

**Toimii:** [ ] Kyllä [ ] Ei

---

## 🐛 VIRHETILANTEET

### Virhetesti 1: AI API puuttuu

**Vaiheet:**
1. Poista .env-tiedosto (tai tyhjennä API-avaimet)
2. Yritä käyttää Quick Actions:ia

**Odotettu tulos:**
- ✅ Virheilmoitus: "API_KEY puuttuu..."
- ✅ Sovellus ei kaadu

**Toimii:** [ ] Kyllä [ ] Ei

---

### Virhetesti 2: Valitse liian lyhyt teksti

**Vaiheet:**
1. Valitse yksi sana
2. Käytä Quick Actions:ia

**Odotettu tulos:**
- ✅ AI vastaa (vaikka konteksti vähäinen)
- ✅ TAI virheilmoitus

**Toimii:** [ ] Kyllä [ ] Ei

---

### Virhetesti 3: Tyhjä valinta

**Vaiheet:**
1. Klikkaa editoria (kursori ilman valintaa)
2. Tarkista näkyykö Quick Actions

**Odotettu tulos:**
- ✅ Quick Actions EI näy (koska ei valintaa)

**Toimii:** [ ] Kyllä [ ] Ei

---

## 📊 TESTAUSRAPORTTI

### Yhteenveto

| Testi | Toimii | Ei toimi | Huomiot |
|-------|--------|----------|---------|
| 1.1 Quick Actions näkyy | [ ] | [ ] | |
| 1.2 Paranna | [ ] | [ ] | |
| 1.3 Korvaa valinta | [ ] | [ ] | |
| 1.4 Lyhennä | [ ] | [ ] | |
| 1.5 Laajenna | [ ] | [ ] | |
| 1.6 Korjaa | [ ] | [ ] | |
| 1.7 Sulkeminen | [ ] | [ ] | |
| 1.8 Katoaa automaattisesti | [ ] | [ ] | |
| 2.1 Dropdown näkyy | [ ] | [ ] | |
| 2.2 Lisää loppuun | [ ] | [ ] | |
| 2.3 Lisää kursorin kohtaan | [ ] | [ ] | |
| 2.4 Korvaa valinta | [ ] | [ ] | |
| 2.5 Korvaa kaikki | [ ] | [ ] | |
| 3.1 Valvonta aktivointi | [ ] | [ ] | |
| 3.2 Valvonta toimii | [ ] | [ ] | |
| 3.3 Varoitukset | [ ] | [ ] | |
| 3.4 Deaktivointi | [ ] | [ ] | |
| 4.1 Quick + Korvaa | [ ] | [ ] | |
| 4.2 Useat Quick | [ ] | [ ] | |
| 4.3 Valvonta + Quick | [ ] | [ ] | |

### Löydetyt bugit

1. **Bugi #1:** _____________________________
   - **Toistettavuus:** [ ] Aina [ ] Joskus [ ] Kerran
   - **Vakavuus:** [ ] Kriittinen [ ] Kohtalainen [ ] Pieni

2. **Bugi #2:** _____________________________
   - **Toistettavuus:** [ ] Aina [ ] Joskus [ ] Kerran
   - **Vakavuus:** [ ] Kriittinen [ ] Kohtalainen [ ] Pieni

### Kokonaistulos

- **Toimii täysin:** ___/21 testiä
- **Osittain toimii:** ___/21 testiä  
- **Ei toimi:** ___/21 testiä

**Prosentti:** ___% toimivuus

### Suositus

[ ] ✅ Valmis tuotantoon  
[ ] ⚠️ Vaatii pieniä korjauksia  
[ ] ❌ Vaatii merkittäviä korjauksia

---

## 🎉 TESTAUS VALMIS!

**Testaaja:** _____________________________  
**Päivämäärä:** _______________  
**Aika:** ___________  

**Lisäkommentit:**
```




```

**Kiitos testauksesta!** 🙏


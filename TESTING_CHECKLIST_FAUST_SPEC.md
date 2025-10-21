# ✅ Faust Spec Testing Checklist

**Päivämäärä**: 21.10.2025  
**Speksi**: v1.0.0  
**Status**: 100% Compliance - Testausvaihe

---

## 🎯 TESTATTAVAT OMINAISUUDET

### 1️⃣ Inspector Default Hidden
**Odotus:** Inspector piilossa sovelluksen avautuessa

- [ ] Avaa sovellus → Inspector EI näy oletuksena
- [ ] Paina `Cmd/Ctrl+Alt+I` → Inspector avautuu
- [ ] Paina uudelleen → Inspector sulkeutuu

**Speksi:** `"default_hidden": true`

---

### 2️⃣ Zen Mode (Cmd/Ctrl+Enter)
**Odotus:** Zen Mode piilottaa kaikki paneelit

- [ ] Paina `Cmd+Enter` (Mac) tai `Ctrl+Enter` (Win/Linux)
- [ ] **Left panel** katoaa
- [ ] **Right panel** (Inspector) katoaa
- [ ] Näkyy vain editor
- [ ] Paina `Esc` → Paneelit palaavat

**Speksi:** `"hides": ["left", "right"]`

---

### 3️⃣ Mode Transition Animation (NOX ⇄ DEIS)
**Odotus:** 3-vaiheinen kultainen siirtymä

- [ ] Klikkaa 🌙 NOX / ☀️ DEIS nappia (titlebar oikealla)
- [ ] **Vaihe 1** (150ms): Näyttö himmenee 80%:iin
- [ ] **Vaihe 2** (800ms): Kultainen gradient swipe
- [ ] **Vaihe 3** (250ms): Moodi vaihtuu + kirkastuu 100%:iin
- [ ] Yhteensä ~1200ms rituaalinen siirtymä

**Speksi:** `"mode_transition": [dim → swipe → reilluminate]`

---

### 4️⃣ Sigil Hover/Active Effects
**Odotus:** Kultainen hehku hover/active -tiloissa

- [ ] Hover AI-napin päällä → Soft-gold aura näkyy
- [ ] Klikkaa AI-nappia → Pulse + scale -animaatio (400ms)
- [ ] Efekti kestää 200ms (hover) / 400ms (active)

**Speksi:** `"sigil_hover": { "aura": "soft-gold" }`

**Huom:** Tarvitsee `className="sigil-btn"` napissa

---

### 5️⃣ /ai Inline Mode
**Odotus:** Ghost text preview + Tab/Esc

**Testausvaiheet:**
- [ ] Kirjoita editoriin: `"Kerran eräänä pimeänä yönä"`
- [ ] Kirjoita `/ai ` (välilyönnillä)
- [ ] Näet "Generating..." -tekstin
- [ ] AI generoi jatko-ehdotuksen
- [ ] **Ghost text** näkyy himmeänä kultaisena
- [ ] Paina **Tab** → Teksti hyväksytään
- [ ] Tai paina **Esc** → Ghost text katoaa

**Toinen testi:**
- [ ] Kirjoita `/ai ` uudelleen
- [ ] Odota ghost textiä
- [ ] Paina **Esc** → Ghost text hylätään
- [ ] `/ai ` jää editoriin

**Speksi:** `"trigger": "/ai", "accept_key": "Tab", "reject_key": "Esc"`

---

## 🎨 VISUAALINEN TARKISTUS

### NOX (Tumma tila)
- [ ] Tausta: `#141210` (melkein musta)
- [ ] Teksti: `#E9E4DA` (vaalea beige)
- [ ] Kulta: `#9A7B4F` / `#C89D5E`
- [ ] Pronssi: `#715C38`

### DEIS (Valoisa tila)
- [ ] Tausta: `#F8F2E8` (pergamentti)
- [ ] Teksti: `#2B241C` (tumma ruskea)
- [ ] Kulta: `#C89D5E` (kirkkaampi)
- [ ] Pronssi: `#715C38`

### Fontit
- [ ] Otsikot: **EB Garamond**
- [ ] Body/Input: **IBM Plex Mono**
- [ ] Editor: Valittu fontti (default: serif)

---

## ✅ MUUT OMINAISUUDET (Aiemmin testattu)

### Quick Actions
- [ ] Valitse tekstiä editorissa
- [ ] Popup ilmestyy: ✨ Paranna, 📏 Lyhennä, 📖 Laajenna, ✅ Korjaa
- [ ] Faust-värit (kulta/pronssi)

### Golden Aura (Modaalit)
- [ ] Avaa CharacterSheet / LocationSheet / ThreadSheet / ChapterSheet
- [ ] Tallenna-nappi hehkuu kultaisesti
- [ ] Hover → Vahvempi hehku

### Command Palette
- [ ] Paina `Cmd+K` (Mac) tai `Ctrl+K` (Win/Linux)
- [ ] Palette avautuu
- [ ] Esc sulkee

### Autosave Indicator
- [ ] Kirjoita tekstiä
- [ ] Näkyy "Tallennetaan..." (sininen)
- [ ] Muuttuu "✓ Tallennettu" (vihreä)
- [ ] Fade out 2s kuluttua

---

## 🐛 ONGELMIEN RAPORTOINTI

Jos löydät bugeja, raportoi:

**Format:**
```
Feature: [Ominaisuuden nimi]
Odotus: [Mitä pitäisi tapahtua]
Tulos: [Mitä tapahtui]
Repro: [Miten toistaa]
```

**Esimerkki:**
```
Feature: /ai inline mode
Odotus: Ghost text näkyy himmeänä kultana
Tulos: Ghost text ei näy ollenkaan
Repro: Kirjoita "/ai " editoriin
```

---

## 📊 TESTAUSRAPORTTI

**Testattu:** [Päivämäärä]  
**Testaaja:** [Nimi]  
**Versio:** 1.0.0  
**Build:** 372 KiB

### Tulokset:
- [ ] Inspector default hidden: ✅ / ❌
- [ ] Zen Mode: ✅ / ❌
- [ ] Mode Transition: ✅ / ❌
- [ ] Sigil Effects: ✅ / ❌
- [ ] /ai Inline Mode: ✅ / ❌

**Kokonaisarvio:** ✅ LÄPÄISTY / ❌ HYLÄTTY

**Huomiot:**
```
[Kirjoita tähän havaintoja]
```

---

## 🎯 SEURAAVAT VAIHEET

**Jos kaikki toimii:**
1. ✅ Merkitse TUOTANTOVALMIIKSI
2. ✅ Luo release v1.0.0
3. ✅ Päivitä README
4. ✅ Julkaise!

**Jos löytyy bugeja:**
1. Raportoi bugit
2. Korjaa
3. Testaa uudelleen
4. Toista kunnes läpäisee

---

## 💡 TESTAUSVINKIT

### Zen Mode:
- Kokeile kirjoittaa Zen Modessa → Kirjoituselämys paranee?

### Mode Transition:
- Vaihda modia useita kertoja → Animaatio sujuva?

### /ai Inline:
- Vaihda AI-provideria → Toimiiko kaikkien kanssa?
- Kirjoita pitkä teksti + `/ai ` → Hyödyntääkö kontekstia?

### Inspector:
- Avaa/sulje useita kertoja → Muistuttaako piilotetun tilan?

---

## 🎉 ONNEA TESTAUKSEEN!

**FAUST 100% spec compliance** odottaa testaustasi! ✨


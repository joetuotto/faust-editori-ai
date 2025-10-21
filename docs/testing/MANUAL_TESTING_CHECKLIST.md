# ✅ MANUAALINEN TESTAUSLISTA

**FAUST v1.3.0 on valmis testattavaksi!**

---

## 🎯 PERUS TESTIT (5 min)

### 1. Sovelluksen käynnistys
- [ ] Sovellus käynnistyy ilman virheitä
- [ ] FAUST-ikkuna näkyy
- [ ] Sidebar näkyy vasemmalla
- [ ] Inspector EI näy oikealla (piilotettu oletuksena)

### 2. Inspector-toiminnot
- [ ] Paina 👁-kuvaketta oikeassa yläkulmassa
- [ ] Inspector ilmestyy oikealle
- [ ] Paina uudelleen → Inspector piiloutuu

### 3. Editori
- [ ] Klikkaa luku (esim. "Luku 1")
- [ ] Kirjoita jotain editoriin
- [ ] Sananlaskenta päivittyy reaaliajassa
- [ ] Tallennusindikaattori näkyy (💾 Tallennetaan... → ✓ Tallennettu)

---

## 🎨 FAUST UI TESTIT (10 min)

### 4. NOX ⇄ DEIS Mode Transition
- [ ] Paina "🌙 NOX" / "☀️ DEIS" -painiketta yläpalkissa
- [ ] Näkyy 3-vaiheinen animaatio:
  1. Himmennys
  2. Kultainen gradient pyyhkäisee ruudun yli
  3. Uusi värimaailma ilmestyy
- [ ] Värit vaihtuvat oikein (dark ⇄ light)

### 5. Sigil Effects (AI-painikkeet)
- [ ] Avaa jokin modaali (esim. Character)
- [ ] Vie hiiri AI-painikkeen (🜓 AI) päälle
- [ ] Näkyy kultainen aura (hover effect)
- [ ] Klikkaa painiketta
- [ ] Näkyy pulssi-animaatio

### 6. Zen Mode
- [ ] Paina `Cmd+Enter` (Mac) tai `Ctrl+Enter` (Win)
- [ ] Sidebar ja Inspector piiloutuvat
- [ ] Näkyy vain editori
- [ ] Paina `Esc` → Kaikki palaa

---

## 🤖 AI-OMINAISUUDET (15 min)

### 7. /ai Inline Mode
- [ ] Kirjoita editoriin jotain, esim: "Tarina alkaa pimeässä metsässä"
- [ ] Kirjoita perään: `/ai `
- [ ] Näkyy "Generating..."
- [ ] AI generoi tekstiä, näkyy haaleana (ghost text)
- [ ] Paina `Tab` → Teksti hyväksytään, lisätään editoriin
- [ ] TAI paina `Esc` → Teksti hylätään

### 8. Quick Actions (Selected Text)
- [ ] Valitse tekstiä editorissa
- [ ] Popup ilmestyy: "✨ Improve | ✂️ Shorten | ➕ Expand | 🔧 Fix"
- [ ] Klikkaa jotain (esim. "✨ Improve")
- [ ] AI generoi parannetun version
- [ ] Teksti korvautuu editorissa

### 9. AI Panel - Chat
- [ ] Paina "🤖 AI" oikeassa yläkulmassa
- [ ] AI Panel aukeaa
- [ ] Kirjoita jotain promptiin, esim: "Kerro minulle tarinan idea"
- [ ] Paina "🜓 Generoi"
- [ ] AI vastaa

### 10. AI Panel - Continuity (Jatkuvuus)
- [ ] Vaihda välilehti: "Jatkuvuus"
- [ ] Näkyy muistin statistiikka (Timeline, Characters, Plot Threads, Facts)
- [ ] Näkyy kustannusten seuranta (DeepSeek checks, total cost)
- [ ] Kokeile "✍️ Kirjoita jatkuvuuden kanssa"

---

## 📝 MODAALIT (10 min)

### 11. CharacterSheet
- [ ] Paina "+ Hahmo"
- [ ] Modaali aukeaa
- [ ] Täytä "Nimi" (pakollinen)
- [ ] Kokeile AI-painiketta "🜓 AI" (generoi esim. Ulkonäkö)
- [ ] Tallenna
- [ ] Hahmo ilmestyy Inspector → Hahmot -välilehdelle

### 12. LocationSheet
- [ ] Paina "+ Paikka"
- [ ] Täytä "Nimi" (pakollinen)
- [ ] Valitse "Tyyppi" dropdownista
- [ ] Kokeile AI-painiketta
- [ ] Tallenna

### 13. ThreadSheet
- [ ] Paina "+ Juonilanka"
- [ ] Täytä "Nimi" (pakollinen)
- [ ] Säädä "Eteneminen" -slider
- [ ] Kokeile AI-painiketta
- [ ] Tallenna

### 14. ChapterSheet
- [ ] Klikkaa luku → ⚙️ (gear icon)
- [ ] Modaali aukeaa
- [ ] Muuta "Otsikko" tai "Kuvaus"
- [ ] Kokeile AI-painiketta
- [ ] Tallenna

---

## 🔧 ADVANCED TESTIT (15 min)

### 15. Automaattinen Jatkuvuustarkistus
- [ ] Avaa Inspector → Hahmot
- [ ] Lisää hahmo (esim. "Liisa, 25v, lääkäri")
- [ ] Ruksita "⚙️ Automaattinen valvonta"
- [ ] Kirjoita editoriin jotain joka liittyy hahmoon
- [ ] Odota 3 sekuntia
- [ ] Jos AI havaitsee ongelman, näkyy varoitus editorin yläpuolella

### 16. Batch Processing
- [ ] AI Panel → Jatkuvuus → Batch
- [ ] Valitse "Operation" (esim. "Continuity Check")
- [ ] Syötä luvut (esim. 1-3)
- [ ] Paina "🔄 Käynnistä batch-prosessi"
- [ ] Seuraa progressia

### 17. "Lisää tekstiin" -toiminnot
- [ ] Generoi jotain AI:lla (AI Panel → Chat)
- [ ] Valitse tekstiä editorissa
- [ ] Paina "↺ Korvaa valinta"
- [ ] TAI avaa dropdown ja valitse:
  - "➕ Lisää loppuun"
  - "📍 Lisää kursorin kohtaan"
  - "⚠️ Korvaa kaikki"

### 18. ESC Key
- [ ] Avaa jokin modaali
- [ ] Paina `Esc`
- [ ] Modaali sulkeutuu
- [ ] Avaa Command Palette (`Cmd/Ctrl+K`)
- [ ] Paina `Esc`
- [ ] Palette sulkeutuu

---

## 🐛 BUGI-RAPORTOINTI

Jos löydät bugeja, raportoi:
1. **Mitä teit?** (tarkat vaiheet)
2. **Mitä odotit tapahtuvan?**
3. **Mitä tapahtui sen sijaan?**
4. **Konsolissa virheitä?** (Avaa DevTools: `Cmd+Opt+I` tai `Ctrl+Shift+I`)

---

## ✅ YHTEENVETO

Kun olet testannut nämä, FAUST on valmis tuotantokäyttöön! 🎉

**Mitä seuraavaksi?**
- Jatka kirjoittamista
- Kokeile kaikkia ominaisuuksia käytännössä
- Anna palautetta puuttuvista ominaisuuksista
- Katso `DEVELOPMENT_ROADMAP.md` tuleville versioille


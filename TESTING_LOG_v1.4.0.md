# 🧪 TESTAUSLOKI - v1.4.0 UI Overhaul

**Date:** 21.10.2025  
**Branch:** `refactor/ui-overhaul`  
**Tester:** AI Assistant + User

---

## ✅ TEEMAT & KONTRASTI

### NOX (Dark) Theme
- [ ] Background: `#141210` (dark brown-black)
- [ ] Text: `#E9E4DA` (warm off-white)
- [ ] Gold accent: `#9A7B4F`
- [ ] Fontti: EB Garamond (headers)
- [ ] Fontti: IBM Plex Mono (UI)
- [ ] Console logi: `[Contrast Guard] Paper/Ink ratio: 12.68:1`

### DEIS (Light) Theme
- [ ] Background: `#F8F2E8` (warm cream)
- [ ] Text: `#2B241C` (dark brown)
- [ ] Gold accent: `#C89D5E`
- [ ] Theme switch toimii (painike oikeassa yläkulmassa)

---

## ✅ LAYOUT (NEW_LAYOUT flag)

### Flag OFF (default)
- [ ] Vanha layout säilyy
- [ ] Console: `[Layout] NEW_LAYOUT disabled (using legacy layout)`

### Flag ON (valinnainen)
- [ ] Keskitetty paperi (max-width ~800px)
- [ ] Vignette-efekti reunoilla
- [ ] Sidebar 220px

---

## ✅ NÄPPÄINKOMENNOT

### Inspector Toggle
- [ ] Cmd/Ctrl+I → Toggle Inspector
- [ ] 👁-painike oikeassa yläkulmassa
- [ ] Inspector piilotettu oletuksena

### Focus Mode
- [ ] Cmd/Ctrl+Shift+F → Toggle Focus Mode
- [ ] Sidebar piiloutuu, inspector jää
- [ ] Console: `🔑 Cmd/Ctrl+Shift+F - Focus Mode toggled`

### Zen Mode
- [ ] Cmd/Ctrl+Enter → Toggle Zen Mode
- [ ] KAIKKI piiloutuu paitsi editori
- [ ] ESC → Poistuu Zen Modesta
- [ ] Console: `🔑 Cmd/Ctrl+Enter - Zen Mode toggled`

---

## ✅ QUICK ACTIONS

### Tekstivalinta
- [ ] Valitse tekstiä editorissa (hiirellä)
- [ ] Popup ilmestyy automaattisesti keskelle näyttöä
- [ ] Näkyy valittu teksti (ensimmäiset 50 merkkiä)
- [ ] 4 painiketta: ✨ Paranna, 📏 Lyhennä, 📖 Laajenna, ✅ Korjaa

### AI-toiminnot
- [ ] Klikkaa "✨ Paranna" → AI parantaa tekstiä
- [ ] Klikkaa "📏 Lyhennä" → AI lyhentää tekstiä
- [ ] Klikkaa "📖 Laajenna" → AI laajentaa tekstiä
- [ ] Klikkaa "✅ Korjaa" → AI korjaa virheet
- [ ] Teksti korvataan valitussa kohdassa
- [ ] Popup katoaa kun tekstivalinta poistetaan

---

## ✅ /AI INLINE MODE

### Trigger
- [ ] Kirjoita editoriin: "Olipa kerran " ja lisää "/ai "
- [ ] Ghost text ilmestyy (harmaa overlay)
- [ ] Console: `[AI Inline] Generating suggestion...`

### Hyväksyminen
- [ ] Paina Tab → Ghost text lisätään tekstiin
- [ ] Console: `✅ Tab - Ghost text accepted`
- [ ] "/ai " poistetaan

### Hylkääminen
- [ ] Kirjoita uudelleen "/ai " ja paina ESC
- [ ] Ghost text katoaa
- [ ] Console: `❌ Esc - Ghost text rejected`

---

## ✅ AI PANEL

### Tabs
- [ ] Avaa AI Assistant (painike)
- [ ] Tab: 📝 **Chat** - Free-form prompts
- [ ] Tab: ⚡ **Quick** - Pre-defined prompts
- [ ] Tab: 🎭 **Techniques** - Writing techniques
- [ ] Tab: 🔗 **Jatkuvuus** - Continuity tracker

### Toiminnallisuus
- [ ] Valitse AI provider (Claude, GPT, Gemini, DeepSeek)
- [ ] Kirjoita prompt → Saat vastauksen
- [ ] "Lisää tekstiin" -painike toimii
- [ ] Progress indicator näkyy

---

## ✅ VANHAT OMINAISUUDET (Regression Test)

### Perus kirjoittaminen
- [ ] Tekstin kirjoittaminen toimii
- [ ] Autosave toimii (näkyy oikeassa yläkulmassa)
- [ ] Undo/Redo toimii (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z)

### Projektihallinta
- [ ] Luo uusi luku (sidebar)
- [ ] Avaa luku → Tekstieditori lataa sisällön
- [ ] Tallenna → localStorage päivittyy

### Modaalit
- [ ] CharacterSheet modal aukeaa ja tallentaa
- [ ] LocationSheet modal aukeaa ja tallentaa
- [ ] ChapterSheet modal aukeaa ja tallentaa
- [ ] ThreadSheet modal aukeaa ja tallentaa
- [ ] ESC sulkee modaalit

### Story Elements
- [ ] Hahmot näkyvät Inspectorissa
- [ ] Lokaatiot näkyvät Inspectorissa
- [ ] Juonet näkyvät Inspectorissa
- [ ] Timeline näkyvät Inspectorissa

---

## 🐛 BUGIT (jos löytyy)

### Kriittiset
_Ei vielä löydetty_

### Ei-kriittiset
_Ei vielä löydetty_

---

## 📊 YHTEENVETO

**Testattu:** _/35 ominaisuutta_  
**Onnistui:** _TBD_  
**Bugia:** _TBD_

---

**TILA:** 🟡 Testaaminen käynnissä
**PÄIVITETTY:** 21.10.2025 11:58


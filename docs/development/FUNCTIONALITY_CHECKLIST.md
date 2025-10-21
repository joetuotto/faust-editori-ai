# 📋 Toiminnallisuuksien tarkistuslista

## ✅ TOIMII (testattu)

### Perustoiminnot
- [x] Tekstieditori - Tekstin kirjoitus
- [x] Automaattinen tallennus (LocalStorage, 1.5s debounce)
- [x] Projektin lataus sivun päivityksen jälkeen
- [x] Lukujen luominen ja poisto
- [x] Luvun valinta sivupalkista

### Muokkaus
- [x] Undo/Redo (`Cmd+Z`, `Cmd+Shift+Z`)
- [x] Find & Replace (`Cmd+F`)
- [x] Bold markdown (`Cmd+B` → `**teksti**`)
- [x] Italic markdown (`Cmd+I` → `*teksti*`)

### Panelit
- [x] Sivupalkin näyttö/piilotus
- [x] Inspector-paneeli toggle
- [x] AI-paneeli toggle
- [x] Adaptiivinen layout (responsiivinen)

### UI/UX
- [x] Toast-notifikaatiot
- [x] Keyboard shortcuts modal (`Cmd+/`)
- [x] Flow modes (normal/focus/rhythm/review)
- [x] Emotionaalinen värikaari
- [x] Living typography
- [x] Cognitive load tracking

---

## ⚠️ EI TOIMII / PUUTTUU

### Dark/Light Mode
- [ ] **Light mode puuttuu kokonaan** ← PRIORITEETTI #1
- [ ] Toggle-nappi theme-vaihdolle
- [ ] Design tokens molemmille teemoille
- [ ] Smooth transition teemojen välillä

### Export-toiminnot
- [ ] **PDF-export ei toimi** (ei oikeaa implementaatiota)
- [ ] DOCX-export puuttuu
- [ ] HTML/TXT/MD/RTF - testattu, mutta ei varmistettu

### AI-integraatio
- [ ] **API-avaimet puuttuvat** (.env ei ole)
- [ ] AI vastaukset eivät toimi ilman avaimia
- [ ] Gemini API endpoint puuttuu preload.js:stä
- [ ] Error handling pitää testata

### Inspector
- [ ] Synopsis tallentuu, mutta ei näy uudelleen latauksen jälkeen?
- [ ] Status dropdown toimii?
- [ ] Progress bars toimivat?

### Valikot
- [ ] **Useimmat valikkokomennot eivät tee mitään**
- [ ] "Uusi projekti" - ei toteutettu
- [ ] "Avaa projekti" - ei toteutettu
- [ ] "Tallenna nimellä" - ei toteutettu
- [ ] Insert-valikko (kommentit, muistiinpanot) - ei toteutettu
- [ ] Format-valikko (heading 1-3, quote, list) - ei toteutettu
- [ ] Tools-valikko - ei toteutettu

### Muut
- [ ] Scrivener-snapshots (versiohistoria) - ei toteutettu
- [ ] Research-kansio - ei toteutettu
- [ ] Spell check - ei toteutettu
- [ ] Word count modal - ei toteutettu
- [ ] Project stats modal - ei toteutettu

---

## 🚀 PRIORISOINTI

### 🔴 KRIITTISET (tee nyt)
1. **Dark/Light mode toggle** - Käyttäjä odottaa tätä
2. **Valikkokomennot** - Useimmat eivät tee mitään
3. **Export PDF** - Tärkeä toiminto
4. **AI API:t** - Tarvitaan .env + testaus

### 🟡 TÄRKEÄT (seuraavaksi)
5. Inspector metadata persistence
6. Format-valikko toiminnot (headings, quotes, lists)
7. Insert-valikko (comments, notes)
8. Export DOCX

### 🟢 NICE-TO-HAVE (myöhemmin)
9. Snapshots (versiohistoria)
10. Research-kansio
11. Spell check
12. Auto-update

---

## 📝 TOIMENPITEET

### 1. Dark/Light Mode (30 min)
```javascript
// Lisää state
const [theme, setTheme] = useState('dark');

// Toggle-nappi
const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

// Design tokens molemmille
const themes = {
  dark: { bg: '#1e1e1e', text: '#fff', ... },
  light: { bg: '#ffffff', text: '#000', ... }
};
```

### 2. Valikkokomennot (1h)
- Toteuta IPC-kuuntelijat puuttuville komennoille
- Lisää funktiot app.js:ään
- Testaa jokainen valikkokomento

### 3. Export PDF (30 min)
- Korjaa PDF-export käyttämään Electronin `printToPDF`
- Testaa eri formaateilla

### 4. AI API testaus (15 min)
- Luo .env-tiedosto
- Testaa yksi API (esim. Gemini ilmainen)
- Varmista error handling

---

**Yhteensä korjattavaa**: ~2-3h työtä
**Prioriteetti**: Dark/Light mode → Valikot → Export → AI

- [x] Offline mode: Core editor works without net; AI graceful degradation with message.
- [x] Local backups to userData/backup.json auto every 5 min.
- [x] Bundled assets (fonts, React) for no CDN dependency.



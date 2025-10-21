# 🧪 NOPEA TESTI - v1.4.1

**Testaa nämä 5 asiaa:**

---

## 1️⃣ UI PREFERENCES (30 sek)

```bash
npm start
```

1. **Avaa Näytä-valikko**
2. **Klikkaa "Teema: DEIS (valoisa)"** → Sovellus muuttuu vaaleaksi
3. **Sulje sovellus** (Cmd+Q)
4. **Avaa uudelleen** → Teeman pitäisi säilyä valoisana ✅
5. **Avaa Näytä-valikko** → Ruksi pitäisi olla "Teema: DEIS" kohdalla ✅

**Odotettu tulos:**
- Teema säilyy sovelluksen uudelleenkäynnistyksen yli
- Valikon ruksi oikeassa paikassa

---

## 2️⃣ FOCUS/ZEN MODES (30 sek)

1. **Avaa Näytä-valikko**
2. **Klikkaa "Focus Mode"** → Sidebar piiloutuu, ruksi ilmestyy ✅
3. **Klikkaa "Zen Mode"** → Kaikki piiloutuu, Focus Mode ruksi poistuu ✅
4. **Paina ESC** → Kaikki palaa, Zen Mode ruksi poistuu ✅

**Odotettu tulos:**
- Focus Mode ja Zen Mode toimivat
- Ruksit synkronoituvat oikein
- ESC poistaa Zen Moden

---

## 3️⃣ NEW LAYOUT TOGGLE (15 sek)

1. **Avaa Näytä-valikko**
2. **Klikkaa "Uusi layout (paperi keskellä)"** → Ruksi ilmestyy ✅
3. **Odota hetki** → Paperi keskittyy (jos toteutettu rendererissä) ✅

**Odotettu tulos:**
- Ruksi ilmestyy
- (Layout muuttuu kun renderer toteuttaa `ui-prefs-changed` handlern)

---

## 4️⃣ PDF EXPORT (30 sek)

1. **Kirjoita tekstiä editoriin** (vähintään 1 kappale)
2. **File → Vie → Vie PDF...** (Cmd+P)
3. **Tallenna tiedosto**
4. **Avaa PDF** → Tarkista että sisältö on oikein ✅

**Odotettu tulos:**
- PDF luodaan onnistuneesti
- Sisältö näkyy oikein
- Ei jää "haamuprosesseja" taustalle

---

## 5️⃣ CONSOLE LOG (15 sek)

1. **Avaa Developer Tools** (Cmd+Alt+I)
2. **Console-välilehti**
3. **Etsi näitä logeja:**
   - `[UI Prefs] Loaded: { theme: 'DEIS', ... }` ✅
   - `[Theme] Switched to DEIS` (kun vaihdat teemaa) ✅
   - `[Contrast Guard] Paper/Ink ratio: ...` ✅

**Odotettu tulos:**
- UI Prefs ladataan oikein
- Console-logit näkyvät
- Ei error-viestejä

---

## ✅ YHTEENVETO

**Jos kaikki 5 testiä meni läpi:**
→ **v1.4.1 toimii täydellisesti!** 🎉

**Jos jotain meni pieleen:**
→ Raportoi:
1. Mikä testi epäonnistui?
2. Mitä tapahtui?
3. Mitä console-logissa näkyy?

---

**Testiaika yhteensä:** ~2 minuuttia

**Seuraava askel:** Käytä sovellusta normaalisti ja katso pysyykö kaikki stabiilina!


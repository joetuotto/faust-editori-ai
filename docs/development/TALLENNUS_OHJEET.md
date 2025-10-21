# 💾 FAUST - Projektin tallennus ja jatkaminen

## 🎯 **Nopea tallennusohje**

### **Vaihtoehto 1: Git (SUOSITUS)**

```bash
# 1. Alusta Git (JO TEHTY!)
git init

# 2. Luo ensimmäinen commit
git add -A
git commit -m "🜍 FAUST v1.0.0 - Initial commit with all features"

# 3. Yhdistä GitHubiin/GitLabiin
# Luo uusi repository osoitteessa: https://github.com/new
# Sitten:
git remote add origin https://github.com/KÄYTTÄJÄNIMI/faust-editor.git
git branch -M main
git push -u origin main
```

**TÄRKEÄÄ:**
- ❌ **ÄLÄ** tallenna `.env` tiedostoa (API-avaimet!)
- ✅ `.gitignore` estää sen automaattisesti
- 💡 Tallenna API-avaimet turvallisesti erikseen (esim. 1Password, LastPass)

---

### **Vaihtoehto 2: Yksinkertainen kopio**

```bash
# Kopioi koko kansio uuteen paikkaan
cp -r "/Volumes/kovalevy 3/editori ai" ~/Documents/FAUST-backup-$(date +%Y%m%d)

# TAI pakkaa ZIP-tiedostoksi
cd "/Volumes/kovalevy 3"
zip -r FAUST-backup.zip "editori ai" -x "*/node_modules/*" "*/dist-installer/*"
```

---

## 📦 **Mitä tiedostoja TÄYTYY tallentaa:**

### **Kriittiset tiedostot:**
```
✅ app.js                    # Pääsovellus (8975 riviä!)
✅ electron.js               # Electron-prosessi
✅ preload.js                # Preload-skripti
✅ index.html                # HTML-pohja
✅ package.json              # Riippuvuudet ja build-config
✅ utils/documentConverters.js
```

### **Build-tiedostot:**
```
✅ build/icon.icns           # Ikoni
✅ build/icon.svg            # Vektoriversio
✅ build/entitlements.mac.plist
```

### **Dokumentaatio:**
```
✅ README.md
✅ PROGRESS_SUMMARY.md
✅ BUILD_INSTRUCTIONS.md
✅ FAUST_VISUAL_IDENTITY.json
✅ FAUST_INTEGRATION_GUIDE.json
✅ TALLENNUS_OHJEET.md (tämä tiedosto!)
```

---

## ❌ **Mitä EI tarvitse tallentaa:**

```
❌ node_modules/            # Ladataan uudelleen: npm install
❌ dist-installer/          # Rakennetaan uudelleen: npm run build-mac
❌ .env                     # Tallenna erikseen turvallisesti!
❌ .DS_Store               # macOS-roskat
❌ .cursor/                # Cursor-väliaikaistiedostot
❌ *.log                   # Logit
❌ *-backup.js, *.bak      # Vanhat varmuuskopiot
```

---

## 🔄 **Kuinka jatkaa projektia myöhemmin:**

### **1. Kloonaa Git-repositorio:**
```bash
git clone https://github.com/KÄYTTÄJÄNIMI/faust-editor.git
cd faust-editor
```

### **2. Asenna riippuvuudet:**
```bash
npm install
```

### **3. Luo `.env` tiedosto:**
```bash
# Kopioi API-avaimet turvallisesta paikasta
nano .env
```

```env
ANTHROPIC_API_KEY=sk-ant-xxx...
OPENAI_API_KEY=sk-xxx...
GOOGLE_API_KEY=xxx...
```

### **4. Käynnistä sovellus:**
```bash
npm start
```

### **5. Rakenna .dmg (jos tarvitaan):**
```bash
npm run build-mac
```

---

## 🌐 **GitHub-repositorion luonti:**

### **1. Mene osoitteeseen:**
https://github.com/new

### **2. Täytä tiedot:**
- **Repository name:** `faust-editor`
- **Description:** `FAUST - Esoteerinen kirjoituseditori NOX ja DEIS -moodeilla`
- **Visibility:** Private (jos haluat pitää yksityisenä)
- ❌ **ÄLÄ** lisää README, .gitignore tai LICENSE (ne on jo projektissa)

### **3. Yhdistä paikallinen repositorio:**
```bash
cd "/Volumes/kovalevy 3/editori ai"
git remote add origin https://github.com/KÄYTTÄJÄNIMI/faust-editor.git
git branch -M main
git push -u origin main
```

---

## 📤 **Pilvipalvelut (vaihtoehto)**

### **Dropbox / Google Drive / OneDrive:**
```bash
# Kopioi kansio pilvipalveluun
cp -r "/Volumes/kovalevy 3/editori ai" ~/Dropbox/FAUST/

# MUISTA poistaa .env ensin (turvallisuus!)
rm ~/Dropbox/FAUST/.env
```

---

## 🔐 **Turvallisuus:**

### **API-avainten hallinta:**

**Vaihtoehto A: 1Password / LastPass**
- Tallenna `.env` sisältö "Secure Note" -muodossa

**Vaihtoehto B: Erillinen tiedosto (salattu)**
```bash
# Luo salattu arkisto .env-tiedostolle
zip -e FAUST-env.zip .env
# Syötä salasana
# Tallenna FAUST-env.zip turvalliseen paikkaan
```

**Vaihtoehto C: Ympäristömuuttujat**
```bash
# Lisää ~/.zshrc tai ~/.bashrc:
export ANTHROPIC_API_KEY="sk-ant-xxx..."
export OPENAI_API_KEY="sk-xxx..."
```

---

## ✅ **Tarkistuslista ennen tallennusta:**

- [ ] Git-repositorio alustettu
- [ ] .gitignore luotu
- [ ] Ensimmäinen commit tehty
- [ ] GitHub/GitLab-repo luotu ja yhdistetty
- [ ] API-avaimet tallennettu turvallisesti erikseen
- [ ] Tärkeät dokumentit mukana
- [ ] `.env` POISTETTU Git-repositoriosta

---

## 🎉 **Valmista!**

Projektisi on nyt turvallisesti tallennettu ja voit jatkaa sitä milloin tahansa!

**Hyödyllisiä komentoja:**

```bash
# Tallenna muutokset
git add -A
git commit -m "Kuvaava viesti muutoksista"
git push

# Lataa viimeisimmät muutokset
git pull

# Katso mitä on muuttunut
git status
git diff

# Tarkastele historiaa
git log --oneline
```





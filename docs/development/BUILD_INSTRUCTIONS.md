# 🜍 FAUST - Build Instructions

## 📦 Rakenna macOS .dmg -asennuspaketti

### 1. **Valmistele ympäristö**

```bash
# Varmista että kaikki riippuvuudet on asennettu
npm install
```

### 2. **Rakenna .dmg tiedosto**

```bash
# Rakenna macOS-versio (Intel + Apple Silicon)
npm run build-mac
```

### 3. **Löydä valmis asennuspaketti**

Asennuspaketti löytyy:
```
dist-installer/FAUST-1.0.0-arm64.dmg  (Apple Silicon)
dist-installer/FAUST-1.0.0-x64.dmg    (Intel)
dist-installer/FAUST-1.0.0-universal.dmg (Molemmat)
```

### 4. **Asenna FAUST**

1. Avaa `.dmg`-tiedosto
2. Vedä FAUST-ikoni Applications-kansioon
3. Avaa FAUST Launchpadista tai Applications-kansiosta

---

## ⚙️ **Build-konfiguraatio**

### **Sisällytetyt tiedostot:**
- ✅ `app.js` - Pääsovellus
- ✅ `electron.js` - Electron-pääprosessi
- ✅ `preload.js` - Preload-skripti
- ✅ `index.html` - HTML-pohja
- ✅ `package.json` - Riippuvuudet
- ✅ `.env` - Ympäristömuuttujat (jos olemassa)
- ✅ `node_modules/` - Tarvittavat moduulit
- ❌ Test-tiedostot
- ❌ Dokumentaatio (*.md)
- ❌ Kehitystyökalut

### **Koko:**
- Arvioitu: ~150-200 MB (riippuu riippuvuuksista)

---

## 🎨 **Valinnainen: Lisää ikoni**

Jos haluat mukautetun ikonin:

1. Luo `build/icon.icns` tiedosto (1024x1024 PNG → ICNS)
2. Luo `build/background.png` (DMG-tausta, 540x380 px)
3. Rakenna uudelleen: `npm run build-mac`

### Ikonin luonti:

```bash
# Macilla voit käyttää:
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o build/icon.icns
```

---

## 🐛 **Vianmääritys**

### **Ongelma: "electron-builder not found"**
```bash
npm install --save-dev electron-builder
```

### **Ongelma: "Code signing failed"**
Lisää `package.json`:iin:
```json
"mac": {
  "identity": null
}
```

### **Ongelma: DMG ei avaudu**
- Varmista että macOS-versio on >= 10.13
- Yritä: `xattr -cr /Applications/FAUST.app`

---

## 📤 **Jakaminen**

### **Suora jakelu:**
1. Lataa `.dmg` pilvipalveluun (Dropbox, Google Drive)
2. Jaa linkki

### **Notarisointi (valinnainen):**
Jos haluat jakaa sovellusta laajasti, suosittelen Apple Notarization:
```bash
# Vaatii Apple Developer -tilin
xcrun notarytool submit dist-installer/FAUST-1.0.0.dmg \
  --apple-id "your@email.com" \
  --password "app-specific-password" \
  --team-id "TEAM_ID"
```

---

## ✅ **Valmis!**

FAUST on nyt pakattu asennettavaksi macOS-sovellukseksi! 🎉


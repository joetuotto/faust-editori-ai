#!/bin/bash
# FAUST Editor - Tiedostojen siivous
# Suorita: bash cleanup_files.sh

set -e  # Lopeta jos virhe

echo "🧹 FAUST Editor - Tiedostojen siivous"
echo "======================================"
echo ""

# Tarkista että olemme oikeassa kansiossa
if [ ! -f "app.js" ] || [ ! -f "webpack.config.js" ]; then
    echo "❌ Virhe: Suorita tämä skripti projektin juurikansiossa!"
    exit 1
fi

# Näytä nykyinen tilanne
echo "📊 Nykyiset tiedostot:"
ls -lh app.js faust.js faustapp2.0.js 2>/dev/null | awk '{print "  " $9 " - " $5}'
echo ""

# Kysy vahvistus
read -p "❓ Haluatko siivota tiedostot? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Peruutettu."
    exit 0
fi

echo ""
echo "🔧 Suoritetaan siivous..."
echo ""

# 1. Luo backup-kansio
echo "1️⃣  Luodaan backups/ kansio..."
mkdir -p backups/

# 2. Tarkista että app.js toimii
echo "2️⃣  Tarkistetaan app.js syntaksi..."
if node -c app.js 2>/dev/null; then
    echo "   ✅ app.js syntaksi OK"
else
    echo "   ⚠️  VAROITUS: app.js:ssä syntaksivirhe!"
    echo "   Jatketaanko silti? (y/n)"
    read -p "   " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Peruutettu."
        exit 0
    fi
fi

# 3. Siirrä faust.js backuppiin
if [ -f "faust.js" ]; then
    echo "3️⃣  Siirretään faust.js backuppiin..."
    mv faust.js "backups/faust_old_7567lines_$(date +%Y%m%d_%H%M%S).js"
    echo "   ✅ Siirretty"
fi

# 4. Siirrä faustapp2.0.js backuppiin
if [ -f "faustapp2.0.js" ]; then
    echo "4️⃣  Siirretään faustapp2.0.js backuppiin..."
    mv faustapp2.0.js "backups/faustapp2.0_duplicate_$(date +%Y%m%d_%H%M%S).js"
    echo "   ✅ Siirretty"
fi

echo ""
echo "✅ Siivous valmis!"
echo ""
echo "📁 Lopputulos:"
echo "   app.js              ← Ainoa päätiedosto"
echo "   backups/            ← Vanhat versiot tallessa"
echo ""
echo "🔍 Backupit:"
ls -lh backups/ | tail -n +2 | awk '{print "   " $9 " - " $5}'
echo ""
echo "📝 Seuraavaksi:"
echo "   1. Testaa sovellus: npm start (tai vastaava)"
echo "   2. Jos toimii, commit: git add . && git commit -m 'chore: Siivottu tiedostorakenne'"
echo "   3. Jos ei toimi, palauta: mv backups/faust*.js ."
echo ""


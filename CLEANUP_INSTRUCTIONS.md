# Tiedostojen siivousohje

## Nykyinen tilanne

```
app.js         ← KÄYTÖSSÄ (webpack entry: './app.js')
faustapp2.0.js ← DUPLIKAATTI (poista)
faust.js       ← VANHA VERSIO (siirrä backuppiin)
```

## Suositeltu toimenpide

### Vaihtoehto A: Säilytä app.js (SUOSITELTU)

```bash
# 1. Luo backup-kansio
mkdir -p backups/

# 2. Siirrä vanhat versiot backuppiin
mv faust.js backups/faust_old_7567lines_$(date +%Y%m%d).js
mv faustapp2.0.js backups/faustapp2.0_duplicate_$(date +%Y%m%d).js

# 3. Tarkista että app.js toimii
node -c app.js
npm run build  # tai tarvittava build-komento

# 4. Commit muutokset
git add .
git commit -m "chore: Siivottu tiedostorakenne - poistettu duplikaatit"
```

### Vaihtoehto B: Jos haluat käyttää faustapp2.0.js nimeä

```bash
# 1. Nimeä app.js → faust_old.js
mv app.js backups/app_$(date +%Y%m%d).js

# 2. Nimeä faustapp2.0.js → app.js
mv faustapp2.0.js app.js

# 3. Siirrä vanha faust.js backuppiin
mv faust.js backups/faust_old_7567lines_$(date +%Y%m%d).js

# HUOM: Tämä EI suositeltu koska webpack.config.js käyttää app.js
```

## Lopputulos (Vaihtoehto A)

```
editori ai/
├── app.js              ← AINOA päätiedosto
├── backups/
│   ├── faust_old_7567lines_20251020.js
│   └── faustapp2.0_duplicate_20251020.js
└── src/                ← Tulevaisuudessa refaktoroidut moduulit
```

## Miksi app.js on oikea valinta?

1. ✅ Webpack käyttää sitä: `entry: './app.js'`
2. ✅ Selkeä nimi ilman version numeroita
3. ✅ Yhdenmukainen projektin rakenteen kanssa
4. ✅ Vähemmän muutoksia konfiguraatioon

## Huomiot

- **ÄLÄ POISTA** tiedostoja ennen backupin tekemistä
- **TESTAA** että sovellus toimii muutosten jälkeen
- **COMMIT** muutokset git:iin
- **DOKUMENTOI** mitä teit (tämä tiedosto)

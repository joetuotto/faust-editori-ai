# FAUST Editor - Refaktörointisuunnitelma

## Nykyinen tilanne

`app.js` on kasvanut yli 10,000 riviin, mikä tekee:
- Debuggauksesta vaikeaa
- Ylläpidosta hankalaa
- Virheistä vaikeasti löydettäviä

## Löydetyt ja korjatut bugit

### Korjatut:
1. **Rivi 6753**: Puuttuva button-elementin sulku ja teksti (`'🗑'`)
2. **Rivi 7896**: Virheellinen spread-operaattori `...(array)` → `array`
3. **Rivi 7937**: Virheellinen spread-operaattori `...(array)` → `array`
4. **Rivi 7999**: Virheellinen spread-operaattori `...(array)` → `array`
5. **Rivi 7531**: Virheellinen spread-operaattori ternary-operaattorissa

### Jäljellä oleva ongelma:
- **Rivi 10110**: SyntaxError: missing ) after argument list
- Ongelma on jossain React.Fragment:in rakenteessa
- Sulkeet täsmäävät määrällisesti (4321/4321) mutta ovat väärissä paikoissa

## Moduulirakenne-suunnitelma

```
src/
├── components/
│   ├── modals/
│   │   ├── CharacterSheet.js    # Hahmon muokkausmoduuli
│   │   ├── LocationSheet.js     # Paikan muokkausmoduuli
│   │   ├── ChapterSheet.js      # Luvun muokkausmoduuli
│   │   └── ThreadSheet.js       # Juonilangan muokkausmoduuli
│   │
│   ├── indicators/
│   │   ├── CognitiveLoadIndicator.js
│   │   ├── WorkPhaseIndicator.js
│   │   ├── TransparentAIIndicator.js
│   │   └── FlowModeIndicator.js
│   │
│   ├── panels/
│   │   ├── AIFeedbackPanel.js
│   │   ├── InspirationPanel.js
│   │   └── CommandPalette.js
│   │
│   └── editor/
│       ├── EditorCore.js        # Pääeditori
│       ├── Sidebar.js           # Sivupalkki
│       └── Inspector.js         # Tarkastaja-paneeli
│
├── utils/
│   ├── constants.js             # GENRE_OPTIONS, LOCATION_TYPES, jne.
│   ├── icons.js                 # Icons-objekti
│   └── helpers.js               # Apufunktiot
│
└── app.js                       # Pääsovellus (huomattavasti pienempi)
```

## Toteutusj

ärjestys

### Vaihe 1: Vakioiden erottaminen
- [ ] Siirrä `Icons` → `src/utils/icons.js`
- [ ] Siirrä `GENRE_OPTIONS` → `src/utils/constants.js`
- [ ] Siirrä `LOCATION_TYPES` → `src/utils/constants.js`
- [ ] Siirrä `FAUST_STYLES` → `src/utils/styles.js`

### Vaihe 2: Modaalien erottaminen
- [ ] Luo `CharacterSheet.js` (rivit 9375-9615)
- [ ] Luo `LocationSheet.js` (rivit 9617-9752)
- [ ] Luo `ChapterSheet.js` (rivit 9754-9915)
- [ ] Luo `ThreadSheet.js` (rivit 9917-10068)

### Vaihe 3: Indikaattorien erottaminen
- [ ] Luo `CognitiveLoadIndicator.js`
- [ ] Luo `WorkPhaseIndicator.js`
- [ ] Luo `TransparentAIIndicator.js`
- [ ] Luo `FlowModeIndicator.js`

### Vaihe 4: Paneelien erottaminen
- [ ] Luo `AIFeedbackPanel.js`
- [ ] Luo `InspirationPanel.js`
- [ ] Luo `CommandPalette.js`

### Vaihe 5: Pää-editorin refaktorointi
- [ ] Jaa pitkät funktiot pienempiin osiin
- [ ] Erottele state-management
- [ ] Erottele event handlerit

## Edut refaktoroinnista

1. **Helpompi debuggaus**: Pienemmät tiedostot → helpompi löytää virheet
2. **Uudelleenkäytettävyys**: Komponentit voi käyttää muualla
3. **Testattavuus**: Jokainen moduuli voidaan testata erikseen
4. **Ylläpidettävyys**: Muutokset yhteen komponenttiin eivät vaikuta muihin
5. **Tiimityö**: Useampi henkilö voi työstää eri moduuleja samanaikaisesti

## Seuraavat askeleet

1. Korjaa ensin nykyinen syntaksivirhe rivillä 10110
2. Aloita vakioiden erottaminen (Vaihe 1)
3. Jatka modaaleihin (Vaihe 2)
4. Testaa jokainen moduuli erikseen ennen jatkamista

## Huomioita

- Pidä `app.js` toimivana koko refaktoroinnin ajan
- Tee muutokset pienissä osissa
- Testaa aina muutosten jälkeen
- Käytä git-versionhallintaa (commit jokaisen vaiheen jälkeen)



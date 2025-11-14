# Arkistoidut TypeScript-tiedostot

Nämä tiedostot ovat vanhoja TypeScript-refaktorointiyrityksiä eivätkä ole käytössä tuotannossa.

## Tiedostot

- **app.tsx** - Vanha TypeScript versio pääsovelluksesta (822B)
- **AIManager.ts** - AI-hallintalogiikan prototyyppi (2.5KB)
- **FileManager.ts** - Tiedostohallintalogiikan prototyyppi (1.6KB)
- **StoryManager.tsx** - React Context -pohjainen tilanhallinnan prototyyppi (2.6KB)
- **UIComponents.tsx** - UI-komponenttien prototyyppi (2.0KB)
- **ErrorBoundary.tsx** - React Error Boundary komponentti (959B)

## Tuotantotiedosto

Varsinainen tuotantosovellus on:
- **app.js** (265KB) - Täydellinen toimiva sovellus React createElement -syntaksilla

## Miksi arkistoitu?

TypeScript-tiedostot olivat keskeneräisiä refaktorointeja, jotka:
1. Eivät ole mukana webpack-buildissa (webpack.config.js käyttää vain app.js)
2. Puuttui monta komponenttia (Sidebar, TimelineModal jne.)
3. Aiheuttivat TypeScript-kääntämisvirheitä
4. Eivät tarjonneet lisäarvoa toimivaan app.js -tiedostoon nähden

TypeScript-virheet on nyt korjattu näissä arkistoiduissa tiedostoissa.

## Tulevaisuus

Jos haluat ottaa TypeScript käyttöön:
1. Aloita migrointi app.js → app.tsx asteittain
2. Käytä näitä tiedostoja referenssinä, mutta älä suoraan
3. Varmista että kaikki komponentit toteutetaan ennen siirtoa

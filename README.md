# FAUST

**Suomenkielinen kirjoituseditori kaunokirjallisuudelle, DEIS- ja NOX-rytmillä**

> *"Päivä ja yö eivät ole teemoja, vaan hermoston kaksi rytmiä."*

- **DEIS** (päivä): ideointi, rakenne, tarinan tietopankki
- **NOX** (yö): kirjoittaminen, syvä fokus

FAUST 3 on uudelleenrakennettu versio. Vanha 1.x/2.x-sovellus on vielä repossa siirtymävaiheen ajan (ks. [Vanha sovellus](#vanha-sovellus)).

---

## Käyttö

```bash
npm install
npm run dev        # kehitystila (hot reload)
npm run build      # tuotantokäännös kansioon out/
npm start          # käynnistää käännetyn sovelluksen
npm run build-mac  # macOS-asennuspaketti (myös build-win, build-linux)
```

AI-avaimet syötetään sovelluksen Asetuksissa, ja ne tallennetaan käyttöjärjestelmän avainnippuun salattuina. Kehityksessä avaimet voi antaa myös ympäristömuuttujina (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `GROK_API_KEY`, `DEEPSEEK_API_KEY`).

## Kirjoittaminen

- **Editori** (TipTap/ProseMirror): kursiivi ja lihavointi, otsikot, sitaatit ja kohtauskatko (`***`). Teksti tallennetaan Markdownina.
- **Suomen typografia** kirjoitettaessa: `"` → ”, `'` → ’, `--` → – (ajatusviiva), `...` → …, ja `- ` kappaleen alussa → repliikkiviiva (–).
- **Oikoluku ja kielioppi Voikolla**, paikallisesti omalla koneella. Virheen päällä oikea painike näyttää korjausehdotukset. Sanan voi lisätä projektin sanakirjaan (`.faust/words.txt`, kulkee projektin mukana) tai omaan sanakirjaan. Tietopankin nimet hyväksytään taivutettuina (esim. *Kvarnströmille*).
- **AI-muutosehdotukset**: valitse teksti ja valitse *AI ▾* (esim. Korjaa kieli, Tiivistä, Paranna rytmiä tai oma ohje). Ehdotus näytetään sanatason muutoksina, ja jokaisen muutoksen voi hyväksyä tai hylätä erikseen. Teksti muuttuu vasta, kun hyväksyt valitut muutokset.
- **Versiohistoria** (⇧⌘H): dokumentin aiemmat versiot, erot nykyiseen tekstiin ja palautus. Nykyinen teksti tallennetaan versioksi ennen palautusta, joten palautuksenkin voi perua.
- **Vienti** (⌘E): käsikirjoitus kustantamolle (DOCX: nimiösivu, sanamäärä, 12 pt, riviväli 1,5, ylätunniste ja sivunumerot), EPUB 3 -e-kirja, Word, Markdown, HTML ja teksti.

## Projekti on kansio

Teos tallennetaan tavallisina tiedostoina, jotka voi lukea millä tahansa ohjelmalla:

```
Romaani.faust/
  project.json                  nimi, asetukset ja sisällyksen rakenne
  manuscript/luku-1-a1b2c3.md   yksi Markdown-tiedosto per luku/kohtaus (+ YAML-otsake)
  bible/characters/*.md         henkilöt, paikat (locations) ja juonilangat (threads)
  .faust/                       sovelluksen tiedot: projektin sanakirja, keskusteluhistoria, roskakori
  .git/                         automaattinen versiohistoria
```

- **Tallennus on atominen**: tiedosto kirjoitetaan ensin väliaikaiseksi ja vaihdetaan paikalleen, joten kaatuminen kesken tallennuksen ei riko tekstiä.
- **Versiohistoria**: muutokset tallentuvat gittiin automaattisesti (pari minuuttia viimeisen muokkauksen jälkeen ja sovellusta suljettaessa). `Cmd+S` tallentaa version heti.
- **Poistetut** luvut siirtyvät kansioon `.faust/trash/`.
- **Synkronointi**: kansion voi pitää iCloudissa, Dropboxissa tai omassa git-repossa.
- **Vanhat `.faust`-tiedostot** (FAUST 1.x/2.x) tuodaan kohdasta *Tiedosto → Tuo vanha .faust-tiedosto*. Alkuperäinen tiedosto jää ennalleen, eikä mitään tietoa hävitetä: uudelle muodolle vieraat tiedot (snapshotit, kirjanmerkit, merkinnät) säilyvät tiedostossa `.faust/legacy.json`.

## Rakenne

```
app/
  shared/     tietomalli, puurakenne, Markdown-apurit, AI-mallirekisteri (ajetaan molemmissa prosesseissa)
  main/       Electronin pääprosessi: projektin tallennus, git-historia, AI-palvelut, vienti
  preload/    tyypitetty silta window.faust
  renderer/   React 19 -käyttöliittymä (zustand-tila)
```

- AI-kutsut tehdään vain pääprosessissa, joten avaimet eivät koskaan päädy käyttöliittymään. Kaikki palveluntarjoajat (Anthropic, OpenAI, Gemini, xAI, DeepSeek) käyttävät samaa rajapintaa, ja vastaukset striimataan.
- Mallien nimiä ei ole kovakoodattu kutsuihin. Oletukset ovat tiedostossa `app/shared/models.ts`, käytöstä poistetut mallit vaihtuvat automaattisesti oletukseen, ja Asetuksista voi hakea avaimella käytettävissä olevat mallit suoraan palveluntarjoajalta.
- Käyttöliittymä toimii ilman verkkoa: fontit ja kirjastot on paketoitu sovellukseen.

## Kehitys

```bash
npm test           # vitest (app/) + jest (vanha sovellus)
npm run lint
npm run type-check
```

## Vanha sovellus

FAUST 1.x/2.x (`electron.js`, `app.js`, `src/`) toimii vielä rinnalla, kunnes kaikki sen ominaisuudet on siirretty:

```bash
npm run legacy:start
```

Molemmat versiot käyttävät samoja tallennettuja API-avaimia.

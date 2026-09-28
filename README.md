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

AI-avaimet syötetään sovelluksen Asetuksissa, ja ne tallennetaan käyttöjärjestelmän avainnippuun salattuina. Kehityksessä avaimet voi antaa myös ympäristömuuttujina (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `GROK_API_KEY`, `DEEPSEEK_API_KEY`). Paikallinen [Ollama](https://ollama.com) ei tarvitse avainta; sen osoitteen voi vaihtaa Asetuksissa tai muuttujalla `OLLAMA_HOST`.

## Kirjoittaminen

- **Editori** (TipTap/ProseMirror): kursiivi ja lihavointi, otsikot, sitaatit ja kohtauskatko (`***`). Teksti tallennetaan Markdownina.
- **Suomen typografia** kirjoitettaessa: `"` → ”, `'` → ’, `--` → – (ajatusviiva), `...` → …, ja `- ` kappaleen alussa → repliikkiviiva (–).
- **Oikoluku ja kielioppi Voikolla**, paikallisesti omalla koneella. Virheen päällä oikea painike näyttää korjausehdotukset. Sanan voi lisätä projektin sanakirjaan (`.faust/words.txt`, kulkee projektin mukana) tai omaan sanakirjaan. Tietopankin nimet hyväksytään taivutettuina (esim. *Kvarnströmille*).
- **AI-muutosehdotukset**: valitse teksti ja valitse *AI ▾* (esim. Korjaa kieli, Tiivistä, Paranna rytmiä tai oma ohje). Ehdotus näytetään sanatason muutoksina, ja jokaisen muutoksen voi hyväksyä tai hylätä erikseen. Teksti muuttuu vasta, kun hyväksyt valitut muutokset.
- **Etsi ja korvaa**: ⌘F dokumentissa, ⇧⌘F koko teoksessa (osumat asiayhteyksineen, korvaus kaikkiin lukuihin kerralla). Kirjainkoko ja kokonaiset sanat valittavissa; korostuksen yli menevät osumat löytyvät myös.
- **Päivän sanatavoite**: tilarivi näyttää tänään kirjoitetut sanat tavoitetta vasten. Päivät kirjautuvat tiedostoon `.faust/progress.json`.
- **Kommentit ja kirjanmerkit** (⌥⌘M, ⌥⌘B, paneeli ⌘3): kommentti kiinnittyy valittuun tekstiin ja seuraa sitä muokattaessa. Ketjuun voi lisätä merkintöjä, sen voi merkitä ratkaistuksi, ja kirjanmerkeistä on koko teoksen luettelo. Kommentit eivät päädy käsikirjoitukseen eivätkä vientiin (`.faust/comments.json`).
- **Alaviitteet** (⌥⌘F): viite näkyy tekstissä numerona ja avautuu muokattavaksi napsauttamalla. Markdownissa muoto on `^[viitteen teksti]`.
- **Korttitaulu** (⌘4): luvut tai kohtaukset kortteina (synopsis, tila, näkökulmahenkilö, sanamäärä). Synopsiksen voi kirjoittaa suoraan korttiin, ja järjestystä muutetaan vetämällä.
- **Rinnakkaisnäkymä** (⌘\\ tai ⫽ sisällyksessä): kaksi lukua tai kohtausta vierekkäin, esimerkiksi suunnitelma ja teksti.
- **Kokoelmat**: tallennetut rajaukset (tyyppi, tila, näkökulmahenkilö, tietopankin merkintä, merkintä tai teksti), esim. *kaikki Ainon kohtaukset* tai *keskeneräiset luvut*. Kokoelma näkyy sisällyksessä ja korttitaululla.
- **Sanelu** (⌥⌘D tai tilarivin 🎙): puhe litteroidaan OpenAI:lla tai Geminillä, kun lopetat, ja teksti lisätään kursorin kohtaan omana tekstinäsi.
- **Versiohistoria** (⇧⌘H): dokumentin aiemmat versiot, erot nykyiseen tekstiin ja palautus. Nykyinen teksti tallennetaan versioksi ennen palautusta, joten palautuksenkin voi perua.
- **Vienti** (⌘E): käsikirjoitus kustantamolle (DOCX: nimiösivu, sanamäärä, 12 pt, riviväli 1,5, ylätunniste ja sivunumerot), taitettu A5-kirja PDF:nä (sivunumerot, EB Garamond), EPUB 3 -e-kirja, Word, Markdown, HTML ja teksti. Alaviitteet ovat Wordissa oikeina alaviitteinä, e-kirjassa ponnahdusviitteinä ja muualla loppuviitteinä. Suomenkieliset tekstit voi tavuttaa Voikolla (PDF, EPUB, Word), jotta tasattuun tekstiin ei jää suuria välejä.

## Tekoäly kirjailijan ehdoilla

- **DEIS ja NOX ovat myös avustajan roolit.** DEIS-tilassa avustaja ideoi, ehdottaa vaihtoehtoja ja haastaa rakennetta. NOX-tilassa se ei kirjoita puolestasi: se vastaa lyhyesti ja auttaa korkeintaan kysymyksellä. AI-muutosehdotukset piilotetaan NOX-tilassa, ellei niitä erikseen sallita asetuksissa.
- **Alkuperän seuranta**: jokaisesta kohdasta tiedetään, onko se omaa tekstiä, AI:n muokkaamaa (hyväksytty muutosehdotus) vai AI:n kirjoittamaa (lisätty avustajasta). Itse kirjoitettu teksti on aina omaa, myös AI-kohdan keskellä. Merkinnät tallentuvat tiedostoon `.faust/provenance.json`, eivätkä ne päädy käsikirjoituksen tekstitiedostoihin. Tarkastelija näyttää osuudet ja voi korostaa AI-tekstin. **AI-selvitys** viedään luvuittaisena taulukkona kustantamolle tai kilpailuun.
- **Tyylisormenjälki**: omasta tekstistä (ilman AI-kohtia) lasketaan paikallisesti mm. lauseiden pituus ja vaihtelu, sanojen pituus, sanaston rikkaus ja repliikkityyli. Halutessasi AI kirjoittaa tyylikuvauksen, jota voit muokata ja jota muutosehdotukset noudattavat. Jos ehdotus poikkeaa selvästi äänestäsi, näet varoituksen **”Ei kuulosta sinulta?”** ennen hyväksymistä.
- **Tietopankki päivittyy tekstistä**: tarkastelijan *Päivitä tietopankki tekstistä* lukee kohtauksen ja ehdottaa uusia faktoja, uusia henkilöitä, paikkoja ja juonilankoja, merkitsee kohtaukseen siinä esiintyvät merkinnät ja huomauttaa ristiriidoista. Jokaisen muutoksen voi hyväksyä erikseen.
- **Rakenne** (DEIS): *Rytmi*-näkymä näyttää kohtauksittain jännitteen, pituuden, dialogin osuuden ja näkökulmahenkilön; jännitteen voi merkitä itse tai arvioida AI:lla. *Juonilangat* ja *Henkilöt* näyttävät, missä kohtauksissa kukin on mukana, ja varoittavat unohtuneista langoista. *Taulukko* näyttää samat tiedot tekstinä.
- **Avustaja hakee tiedot itse**: keskustelussa avustaja voi lukea tietopankin merkinnän kokonaan, minkä tahansa luvun tai kohtauksen ja etsiä koko käsikirjoituksesta. Keskustelussa näkyy, mitä se haki. Näin kehote pysyy pienenä eikä koko tietopankkia tarvitse lähettää joka viestissä.
- **Paikallinen malli**: Ollaman kautta mallit toimivat omalla koneella. Teksti ei lähde verkkoon, eikä käytöstä tule kuluja.
- **Kulut näkyvissä**: jokaisen kutsun tokenimäärät kirjataan projektiin (`.faust/usage.json`). AI-paneeli näyttää viimeisen kutsun ja päivän arvioidun hinnan, ja *Asetukset → AI-kulut* päivän, kuukauden ja koko projektin summat. Hinnat ovat muokattavia arvioita.
- **Tietopankin luonnokset**: *✨ Luonnostele AI:lla* ehdottaa lyhyen kuvauksen perusteella teokseen sopivan henkilön, paikan tai juonilangan. Luonnosta voi muokata ennen tallennusta.
- **Esilukija** lukee luvun tai koko käsikirjoituksen valitsemanasi lukijana (tavallinen lukija, lajityypin ystävä, kriittinen kustannustoimittaja, nuori lukija) ja kertoo, missä mielenkiinto herpaantui, mikä jäi epäselväksi ja mikä toimi. Lainauksista pääsee suoraan tekstikohtaan.

## Projekti on kansio

Teos tallennetaan tavallisina tiedostoina, jotka voi lukea millä tahansa ohjelmalla:

```
Romaani.faust/
  project.json                  nimi, asetukset ja sisällyksen rakenne
  manuscript/luku-1-a1b2c3.md   yksi Markdown-tiedosto per luku/kohtaus (+ YAML-otsake)
  bible/characters/*.md         henkilöt, paikat (locations) ja juonilangat (threads)
  .faust/                       sovelluksen tiedot: sanakirja, AI-alkuperä, kommentit, tyyliprofiili, esilukijan
                                raportit, keskusteluhistoria, AI-kulut, kirjoitusloki, roskakori
  .git/                         automaattinen versiohistoria
```

- **Tallennus on atominen**: tiedosto kirjoitetaan ensin väliaikaiseksi ja vaihdetaan paikalleen, joten kaatuminen kesken tallennuksen ei riko tekstiä.
- **Versiohistoria**: muutokset tallentuvat gittiin automaattisesti (pari minuuttia viimeisen muokkauksen jälkeen ja sovellusta suljettaessa). `Cmd+S` tallentaa version heti.
- **Poistetut** luvut siirtyvät kansioon `.faust/trash/`.
- **Synkronointi**: kansion voi pitää iCloudissa, Dropboxissa tai omassa git-repossa.
- **Vanhat `.faust`-tiedostot** (FAUST 1.x/2.x) tuodaan kohdasta *Tiedosto → Tuo vanha .faust-tiedosto*. Alkuperäinen tiedosto jää ennalleen, eikä mitään tietoa hävitetä: vanhat merkinnät ja kirjanmerkit tulevat kommenteiksi ja kirjanmerkeiksi tekstiin kiinnitettyinä, ja uudelle muodolle vieraat tiedot (esim. snapshotit) säilyvät tiedostossa `.faust/legacy.json`.

## Rakenne

```
app/
  shared/     tietomalli, puurakenne, Markdown-apurit, AI-mallirekisteri (ajetaan molemmissa prosesseissa)
  main/       Electronin pääprosessi: projektin tallennus, git-historia, AI-palvelut, vienti
  preload/    tyypitetty silta window.faust
  renderer/   React 19 -käyttöliittymä (zustand-tila)
```

- AI-kutsut tehdään vain pääprosessissa, joten avaimet eivät koskaan päädy käyttöliittymään. Kaikki palveluntarjoajat (Anthropic, OpenAI, Gemini, xAI, DeepSeek, paikallinen Ollama) käyttävät samaa rajapintaa, ja vastaukset striimataan. Avustajan projektihaut ajetaan pääprosessissa, eivätkä ne voi muuttaa projektia.
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

# Askel 0: mallikoe kielenhuollolle

Ajettu 16.11.2026 Cherry Studion yhdyskäytävää vasten (`http://127.0.0.1:23333`, Anthropic-yhteensopiva `/v1/messages`). Sovellukseen ei tehty muutoksia. Koe vastaa selvityksen kohdan 4.4 kysymykseen: osaako jokin yhdyskäytävän malli korjata suomea kirjoittamatta tekstiä uusiksi?

## Tulos

- **Osaa.** Kaikki neljä maksullista mallia täyttävät kohdan 4.4 päätössäännön jokaisessa kolmessa ajossa, ja selvällä erolla rajoihin. Kielenhuolto (4.4) saa luvan askeleeseen 8.
- **Suositus tehtäväroolille ”Muokkaus”:** `c91fb219-b725-43d2-925d-3c6e66bef527:deepseek-v4.1-flash-abliterated-fast`. Se korjasi varsinaisessa kokeessa 55 virhettä 57:stä (96 %), teki yhden väärän korjauksen 28 riviä kohti, oli 2–5 kertaa muita nopeampi ja antoi kahdessa ajossa merkilleen saman tuloksen.
- Yksikään malli ei kirjoittanut yhtään riviä uusiksi (suurin muutossuhde 0,12, raja 0,3). Yksikään rivi ei kadonnut, yhdistynyt tai saanut väärää numeroa, yksikään paikkamerkki ei kadonnut, lopputagi oli jokaisessa vastauksessa, eikä yksikään malli vaihtanut merkkejä ” ja – suoriksi.
- Kolme asiaa meni vikaan, ja koodin on varauduttava niihin: mallit ”korjaavat” murremuotoja repliikeissä (sama rivi 10 ajossa 12:sta), kolme mallia teki yhteensä neljä virhettä oikeaan tekstiin (`Isoisän` → `Isäisän`, `tikitti` → `tikittivät`), ja GLM-mallien tulos vaihteli ajosta toiseen sen mukaan, kuinka paljon malli sattui päättelemään (erissä, joissa päättelyä oli alle 1 000 merkkiä, korjattiin 73 %, muissa 95 %).
- Aineisto on tätä koetta varten kirjoitettu, ei omaa käsikirjoitustasi, ja istutetut virheet ovat selviä perusvirheitä. Tulos kertoo, että perusta toimii. Se ei kerro, miten mallit käsittelevät oman tekstisi hienovaraisempia kohtia. Sama koe kannattaa ajaa omilla kappaleillasi ennen askelta 8; skriptit ovat valmiina.

## Koeasetelma

**Aineisto** (`dataset.json`): 28 lyhyttä kappaletta, yhteensä 788 sanaa. Jokainen kappale on yksi rivi, kuten FAUSTissa.

| Laji | Rivejä | Istutettuja virheitä |
|---|---|---|
| Kaunokirjallinen kerronta | 9 | 30 |
| Tietoproosa | 7 | 23 |
| Puhekielinen tai murteellinen vuorosana (alkaa vuorosanaviivalla) | 7 | 4 aitoa lyöntivirhettä neljällä rivillä |
| Virheetön kontrolli | 5 | 0 |

Virheitä on 57: yhdyssana 15, pilkku 13, oikeinkirjoitus 13, kongruenssi 11 ja typografia 5. Lähdetekstissä on oikea suomalainen typografia (”, –, …), joten väärän suunnan merkinvaihto näkyisi. Viidellä rivillä on yhteensä seitsemän paikkamerkkiä (⟦1⟧–⟦7⟧) `[TODO: …]`-merkintöjen ja `<u>`-tagien tilalla. Vuorosanoissa on Helsingin puhekieltä, savoa, Tampereen puhetta, eteläpohjalaista ja pohjoista murretta.

**Kehote** (`prompt.txt`, järjestelmäteksti myös tämän tiedoston lopussa): suomenkielinen ”vain korjaukset” -ohje. Rivit lähetetään muodossa `[1] …` `<teksti>`-tagien sisällä ja pyydetään takaisin samassa muodossa.

**Pyynnöt:** FAUSTin oma `@anthropic-ai/sdk`, suoratoisto, `temperature: 0`, `max_tokens: 12000` (28 rivin erässä 32 000), ei `thinking`-parametria. Kaikki neljä mallia palauttivat silti päättelylohkon jokaisessa vastauksessa. Mallit ajettiin rinnakkain, yhden mallin erät peräkkäin.

**Ajot:** 36 generointipyyntöä (raja oli noin 60).

| Ajo | Sisältö | Pyyntöjä |
|---|---|---|
| `v1` | Varsinainen koe: 4 erää × 7 riviä × 4 mallia | 16 |
| `v1-toisto` | Sama uudelleen, jotta satunnaisvaihtelu näkyy | 16 |
| `v1-era28` | Kaikki 28 riviä yhtenä eränä (noin 6 000 merkkiä, eli suunniteltu oletuserä) | 4 |

Kehotteen toista versiota ei tehty, koska ensimmäinen täytti päätössäännön kaikilla malleilla.

**Pisteytys** (`score.js`): Istutettu virhe on korjattu, kun vastausrivillä on oikea muoto eikä väärää. Väärä korjaus on mikä tahansa muu ero vastauksen ja virheettömän version välillä, paitsi korjaamatta jäänyt istutettu virhe ja pelkkä typografinen merkinvaihto, joka lasketaan erikseen. Muutossuhde on (poistetut + lisätyt sanat) / (sanat ennen + sanat jälkeen).

## Taulukko: varsinainen koe (ajo v1, 7 rivin erät)

| Mittari | deepseek-v4.1-flash-abliterated-fast | deepseek-v4.1-flash-abliterated | glm-5.3-abliterated | glm-5.3-flash-abliterated |
|---|---|---|---|---|
| Korjatut istutetut virheet | 55/57 (96 %) | 55/57 (96 %) | 53/57 (93 %) | 46/57 (81 %) |
| Väärät korjaukset | 1 | 2 | 2 | 0 |
| Typografian suoristukset (” → ", – → -) | 0 | 0 | 0 | 0 |
| Uusiksi kirjoitetut rivit (muutossuhde yli 0,3) | 0/28 | 0/28 | 0/28 | 0/28 |
| Suurin muutossuhde yhdellä rivillä | 0,10 | 0,11 | 0,12 | 0,10 |
| Kadonneet, yhdistyneet tai väärin numeroidut rivit | 0 | 0 | 0 | 0 |
| Muutetut vuorosanarivit (muu kuin lyöntivirheen korjaus) | 1/7 | 1/7 | 1/7 | 0/7 |
| Muutetut kontrollirivit | 0/5 | 0/5 | 0/5 | 0/5 |
| Kadonneet paikkamerkit | 0/7 | 0/7 | 0/7 | 0/7 |
| Puuttuva lopputagi | 0/4 | 0/4 | 0/4 | 0/4 |
| Sekuntia per erä, keskiarvo (vaihtelu) | 12,8 (12,1–13,4) | 58,7 (44,3–89,7) | 39,6 (21,7–49,8) | 28,9 (8,0–52,1) |
| Päätössääntö | täyttyy | täyttyy | täyttyy | täyttyy |

## Taulukko: toisto ja 28 rivin erä

| Mittari | deepseek-v4.1-flash-abliterated-fast | deepseek-v4.1-flash-abliterated | glm-5.3-abliterated | glm-5.3-flash-abliterated |
|---|---|---|---|---|
| Toisto: korjatut virheet | 55/57 (96 %) | 53/57 (93 %) | 45/57 (79 %) | 49/57 (86 %) |
| Toisto: väärät korjaukset | 1 | 2 | 3 | 3 |
| Toisto: sekuntia per erä (vaihtelu) | 10,9 (10,0–11,6) | 48,1 (38,4–52,7) | 63,6 (23,0–134,8) | 30,0 (15,3–52,1) |
| 28 rivin erä: korjatut virheet | 53/57 (93 %) | 55/57 (96 %) | 51/57 (89 %) | 52/57 (91 %) |
| 28 rivin erä: väärät korjaukset | 1 | 0 | 1 | 1 |
| 28 rivin erä: palautuneet rivit oikeilla numeroilla | 28/28 | 28/28 | 28/28 | 28/28 |
| 28 rivin erä: sekuntia | 35,8 | 230,7 | 93,9 | 124,9 |
| 28 rivin erä: tulostokenit päättelyineen | 4 886 | 9 968 | 4 864 | 5 966 |
| **Kaikki kolme ajoa: korjatut virheet** | **163/171 (95 %)** | **163/171 (95 %)** | **149/171 (87 %)** | **147/171 (86 %)** |
| **Kaikki kolme ajoa: väärät korjaukset** | **3** | **4** | **6** | **4** |
| Kaikki kolme ajoa: uusiksi kirjoitetut rivit | 0/84 | 0/84 | 0/84 | 0/84 |
| Kaikki kolme ajoa: kadonneet paikkamerkit | 0/21 | 0/21 | 0/21 | 0/21 |
| Aika tuhatta sanaa kohti, 7 rivin erät peräkkäin | noin 1 min | 4–5 min | 3,5–5,5 min | noin 2,5 min |

Korjatut virheet tyypeittäin, kaikki kolme ajoa yhteensä:

| Malli | Yhdyssana | Pilkku | Kongruenssi | Oikeinkirjoitus | Typografia |
|---|---|---|---|---|---|
| deepseek-v4.1-flash-abliterated-fast | 45/45 | 38/39 | 33/33 | 35/39 | 12/15 |
| deepseek-v4.1-flash-abliterated | 45/45 | 38/39 | 32/33 | 35/39 | 13/15 |
| glm-5.3-abliterated | 44/45 | 35/39 | 29/33 | 29/39 | 12/15 |
| glm-5.3-flash-abliterated | 43/45 | 36/39 | 30/33 | 26/39 | 12/15 |

Kaksi istutettua virhettä jäi lähes aina korjaamatta. `ylimäärinen` (pitäisi olla `ylimääräinen`) jäi kaikissa 12 malliajossa, ja `...` (pitäisi olla `…`) jäi 11 ajossa 12:sta. Kaikki muut virheet korjattiin vähintään seitsemässä ajossa 12:sta.

## Päätös malleittain

Sääntö (4.4): vähintään puolet istutetuista virheistä korjattu, vääriä korjauksia vähemmän kuin oikeita, alle viidesosa riveistä kirjoitettu uusiksi.

| Malli | Korjattu, heikoin ajo | Väärät vastaan oikeat, heikoin ajo | Uusiksi kirjoitettu | Päätös |
|---|---|---|---|---|
| deepseek-v4.1-flash-abliterated-fast | 93 % | 1 vastaan 53 | 0 % | täyttyy kaikissa kolmessa ajossa |
| deepseek-v4.1-flash-abliterated | 93 % | 2 vastaan 53 | 0 % | täyttyy kaikissa kolmessa ajossa |
| glm-5.3-abliterated | 79 % | 3 vastaan 45 | 0 % | täyttyy kaikissa kolmessa ajossa |
| glm-5.3-flash-abliterated | 81 % | 3 vastaan 49 | 0 % | täyttyy kaikissa kolmessa ajossa |

Yksikään ajo ei ollut lähellä rajaa. 4.4 rakennetaan askeleessa 8 suunnitellusti typografian (4.8) ja Voikko-kokeilun (4.16) jälkeen, eikä sitä tarvitse siirtää taemmas.

## Suositus tehtäväroolille ”Muokkaus”

**`c91fb219-b725-43d2-925d-3c6e66bef527:deepseek-v4.1-flash-abliterated-fast`**

- Tarkin yhdessä hitaamman DeepSeek-version kanssa: 163/171 kolmessa ajossa.
- Vähiten vääriä korjauksia: kolme, ja kaikki olivat sama murremuoto (`markkinoolla` → `markkinoilla`). Kerronnassa, tietoproosassa ja kontrolliriveissä se ei tehnyt yhtään väärää muutosta.
- Nopein: 10–13 sekuntia seitsemän rivin erää kohti ja 36 sekuntia 28 rivin erää kohti. Tuhat sanaa vie noin minuutin, kun muilla menee 2,5–5,5 minuuttia.
- Vakain: kahden ajon vastaukset olivat kaikissa neljässä erässä merkilleen samat, ja aika vaihteli vain 10,0–13,4 sekuntia. Se päätteli joka erässä 2 400–4 000 merkkiä eikä koskaan jättänyt päättelyä lyhyeksi, toisin kuin GLM-mallit.
- Korjasi kaikki 12 vuorosanoihin istutettua lyöntivirhettä koskematta puhekieleen muuten kuin yhdessä sanassa.

Varamalli on `c91fb219-b725-43d2-925d-3c6e66bef527:deepseek-v4.1-flash-abliterated`: sama tarkkuus, mutta 4–6 kertaa hitaampi, vaatii enimmillään 2,7 tokenia vastaustekstin merkkiä kohti ja teki kaksi virhettä oikeaan tekstiin. GLM-malleja ei kannata asettaa tähän rooliin oletukseksi, koska niiden tulos vaihteli ajosta toiseen 79–93 % ja 81–91 %.

Kahden DeepSeek-version ero tarkkuudessa (0–2 virhettä ajoa kohti) mahtuu satunnaisvaihteluun. Suositus perustuu nopeuteen ja vakauteen, ei tarkkuuseroon.

## Virhemallit, joilta koodin on suojauduttava

### Havaittu tässä kokeessa

1. **Murremuotoja ”korjataan” repliikeissä.** Rivi `– Kyllä mä sen tierän, notta se on vaikiaa, mutta ei auta itkiä markkinoolla.` muuttui 10 malliajossa 12:sta: `markkinoolla` → `markkinoilla` 10 kertaa ja `tierän` → `tiedän` 3 kertaa. Kehotteen kielto ei estänyt tätä yhdelläkään mallilla luotettavasti. Muut kuusi vuorosanariviä säilyivät kaikissa ajoissa. Seuraukset:
   - Paikallinen vuorosanojen ohitus (4.4) tarvitaan, eikä sitä voi korvata kehotteella.
   - Kun vuorosanat lähetetään, niiden ehdotukset kannattaa jättää ”Hyväksy loput” -toiminnon ulkopuolelle tai kysyä niistä erikseen. Malli näkee murremuodon lyöntivirheenä, eikä mikään paikallinen tarkistus erota niitä toisistaan.
   - Vastapainona: suositeltu malli korjasi vuorosanojen aidot lyöntivirheet 12/12. Ohitus päällä ne jäävät korjaamatta.
2. **Malli tekee virheen oikeaan tekstiin.** Neljä tapausta 336 rivistä, kaikki kerronnassa:
   - `Isoisän` → `Isäisän` (deepseek-v4.1-flash-abliterated ajossa v1 ja glm-5.3-abliterated toistossa). Malli tuotti lyöntivirheen sanaan, jossa ei ollut vikaa. Molemmilla kerroilla sana oli rivin ensimmäinen heti numeron jälkeen.
   - `siellä tikitti kolme kelloa` → `tikittivät` (deepseek-v4.1-flash-abliterated ja glm-5.3-flash-abliterated toistossa). Ylikorjaus: lukusanasubjektin kanssa yksikkö on oikein.
   - Suojaus: ehdotusta ei koskaan hyväksytä automaattisesti, ja ”Hyväksy loput” ottaa tilannekuvan (jo suunnitelmassa). Lisäksi kannattaa ajaa jokaisen ehdotuksen uusi sana oikeinkirjoituksen tarkistuksen läpi (järjestelmän oikoluku tai Voikko, 4.16): jos vanha sana kelpaa ja uusi ei, ehdotus merkitään epäilyttäväksi tai siirretään sivuun. Se olisi pysäyttänyt muodon `Isäisän` mutta ei muotoa `tikittivät`, joka on oikea sana väärässä paikassa.
3. **Päättelyn määrä vaihtelee, ja laatu seuraa sitä.** Seitsemän rivin erissä päättelyä oli 352–9 061 merkkiä. Seitsemässä erässä 32:sta päättelyä oli alle 1 000 merkkiä, ja niissä korjattiin 72/99 (73 %); muissa 25 erässä korjattiin 339/357 (95 %). Kaikki lyhyen päättelyn erät olivat GLM-malleilta (glm-5.3-abliterated 3 erää 8:sta, glm-5.3-flash-abliterated 4 erää 8:sta). Sama malli, sama kehote ja sama erä antoivat eri ajossa 9/14 tai 14/14. Sovellus ei ohjaa tätä: yhdyskäytävän asiakas poistaa `thinking`-parametrin (`electron.js:132`), eikä koe lähettänyt sitä. Seuraukset:
   - Käyttölokiin (4.12) kannattaa kirjata pyynnön tulostokenit ja se, tuliko päättelylohko. Poikkeuksellisen pieni tokenimäärä selittää jälkikäteen heikon ajon.
   - ”Kokeile toisella mallilla” (4.11) on tälle tehtävälle hyödyllinen myös samalla mallilla: uusi ajo voi löytää virheitä, jotka edellinen ohitti.
   - `temperature: 0` ei takaa samaa tulosta. Vain suositeltu malli toisti vastauksensa.
4. **Päättely vie enemmän tokeneita kuin itse vastaus.** Tulostokeneita kului 0,48–2,70 vastaustekstin merkkiä kohti: suositellulla mallilla 0,82–1,49, hitaammalla DeepSeekillä enimmillään 2,70. Pelkkä teksti vie arviolta 0,4–0,5 tokenia merkkiä kohti (arvio eristä, joissa päättelyä oli vähiten). Seuraukset:
   - Rinnakkaisissa suunnitelmaluonnoksissa (`F-finnish-language.md`, `A-request-layer.md`) vastausraja on ”merkit / 2 + 500” ja päättelyvaran oletus 2 000 tokenia. Niillä 1 370 merkin erä saisi 3 185 tokenia ja 28 rivin erä noin 5 500. deepseek-v4.1-flash-abliterated käytti näihin 3 701 ja 9 968 tokenia, joten vastaus katkeaisi. glm-5.3-flash-abliterated käytti 28 rivin erään 5 966 tokenia ja katkeaisi myös. Suositeltu malli mahtuu rajaan (2 042 ja 4 886), 28 rivin erässä noin kymmenen prosentin varalla.
   - Turvallinen raja tälle tehtävälle on `max_tokens` = 3 × merkit + 1 000 (kattaa kaikki 36 havaintoa), suositellulle mallille riittää 1,5 × merkit + 1 000. Yläraja 32 000 hyväksyttiin yhdyskäytävässä.
   - Yhtään katkennutta vastausta ei tullut (`stop_reason` oli `end_turn` 36/36), koska raja oli väljä. Katkennut erä on silti hylättävä kokonaan eikä tulkittava riveittäin.
5. **Vastausaika vaihtelee paljon.** Seitsemän rivin erä vei GLM-malleilla 8–135 sekuntia (sama erä samalla mallilla eri ajossa esimerkiksi 8 ja 52 sekuntia), ja 28 rivin erä vei mallista riippuen 36–231 sekuntia. Seuraukset:
   - Pyynnön aikaraja ei saa olla alle viiden minuutin oletuskokoiselle erälle, tai erän on oltava pienempi.
   - Edistyminen ja pysäytys tarvitaan (jo suunnitelmassa). Suositellulla mallilla 7–10 rivin erä (1 500–2 000 merkkiä) antaa ensimmäiset ehdotukset noin 12 sekunnissa. Se oli myös hieman tarkempi kuin 28 rivin erä (55/57 vastaan 53/57), mutta ero perustuu yhteen ajoon eikä riitä johtopäätökseen.
6. **Malli ei korvaa oikeinkirjoituksen tarkistinta eikä typografiamoduulia.**
   - `...` ei muuttunut merkiksi `…` 11 ajossa 12:sta, vaikka muut typografiavirheet (suorat lainausmerkit, yhdysmerkki vuosiluvuissa ja ajatusviivana, `62%`) korjattiin 12/12. Deterministinen typografiamoduuli (4.8) hoitaa tämän varmemmin.
   - `ylimäärinen` jäi korjaamatta 12/12: sanalta näyttävä lyöntivirhe meni kaikilta ohi. GLM-mallit ohittivat lyöntivirheistä neljänneksen tai kolmanneksen (29/39 ja 26/39). Kielenhuolto ja järjestelmän oikoluku tai Voikko täydentävät toisiaan; tässä kokeessa ei testattu, löytääkö kumpikaan tämän sanan.

### Ei havaittu, mutta suojaus kannattaa pitää

Nämä eivät toteutuneet kertaakaan 36 pyynnössä ja 336 rivissä. Suojaukset ovat halpoja, ja tulos koskee vain näitä neljää mallia ja tätä kehotetta.

| Virhemalli | Havaintoja |
|---|---|
| Typografian suoristus (” → ", – → -, … → ...) | 0 |
| Kadonnut, kahdesti palautettu, jaettu tai ylimääräinen rivi | 0/336 |
| Väärä numerointimuoto (muu kuin `[n]`) | 0/36 |
| Kadonnut tai siirtynyt paikkamerkki | 0/84 |
| Puuttuva `<teksti>`- tai `</teksti>`-tagi | 0/36 |
| Tekstiä, selityksiä tai koodiaitoja tagien ulkopuolella | 0/36 |
| `<think>`-tagi vastaustekstissä (päättely tuli aina erillisenä lohkona) | 0/36 |
| Uusiksi kirjoitettu rivi (muutossuhde yli 0,3) | 0/336, suurin 0,12 |
| Muutettu kontrollirivi | 0/60 |
| Pilkun lisäys tai poisto muualla kuin istutetussa kohdassa | 0 |

Kaksi päätelmää suunnitelmaan:

- Kohdan 4.4 oletus, että mallit palauttavat usein suorat lainausmerkit ja yhdysmerkit, ei toteutunut näillä malleilla, kun kehote kieltää sen. Näiden mallien takia typografiamoduulia ei tarvita kielenhuollon ehdoksi. Varotoimena se suojaa malleilta, jotka käyttäytyvät toisin.
- Raja 0,3 uusiksi kirjoitetulle riville on sopiva: neljä korjausta 32 sanan rivillä antoi suhteen 0,10 ja suurin havaittu suhde oli 0,12, joten oikea korjaus ei jää rajan taakse.

## Esimerkkirivit

Ajosta v1. Poistettu on ~~yliviivattu~~, lisätty **lihavoitu**.

**deepseek-v4.1-flash-abliterated-fast**

- Tietoproosa, 4/4 korjattu:
  Lukeminen ei ole ~~synnynäinen~~ **synnynnäinen** taito, vaan aivot ~~joutuu~~ **joutuvat** opettelemaan sen yhdistämällä näkö- ja kielialueita uudella tavalla. Tutkijat ovat havainneet**,** että sujuvan lukijan aivoissa kirjainten tunnistus tapahtuu alle sekunnin ~~kymmenes osassa~~ **kymmenesosassa**. Siksi harjoittelun määrä ratkaisee enemmän kuin menetelmä.
- Savolainen vuorosana, lyöntivirhe korjattu ja murre ennallaan:
  – Elä sinä poeka hättäele, kyllä tässä vielä keritään, mummo sanoi ja kaatoi lisää ~~kahiva~~ **kahvia**.
- Eteläpohjalainen vuorosana, väärä korjaus:
  – Kyllä mä sen tierän, notta se on vaikiaa, mutta ei auta itkiä ~~markkinoolla~~ **markkinoilla**.

**deepseek-v4.1-flash-abliterated**

- Kerronta, 4/4 korjattu:
  Talvi tuli sinä vuonna aikaisin. Lokakuun lopussa satama oli jo jäässä, ja kalastajat ~~veti~~ **vetivät** veneensä rantaan, ~~ennenkuin~~ **ennen kuin** ehtivät paikata verkkojaan. Me lapset ~~luistellimme~~ **luistelimme** laiturin ympärillä iltaan asti**,** kunnes äidit huusivat meidät kotiin.
- Kerronta, 3/3 korjattu, mutta malli teki oman virheen ensimmäiseen sanaan:
  ~~Isoisän~~ **Isäisän** verstaassa tuoksui terva ja tuore puu. Höylät ~~riippui~~ **riippuivat** seinällä ~~suuruus järjestyksessä~~ **suuruusjärjestyksessä**, ja jokaisella työkalulla oli oma paikkansa, jota ei saanut muuttaa. Kun hän kuoli**,** kukaan ei raaskinut koskea niihin moneen vuoteen.
- Pohjoinen vuorosana, lyöntivirhe korjattu, paikkamerkki ja murre ennallaan:
  – Mie oon sanonu sulle monta ~~ketraa~~ **kertaa**, että sinne ei mennä yksin ⟦5⟧. Jää pettää keväällä ennen ko arvaakaan.

**glm-5.3-abliterated**

- Tietoproosa, 4/4 korjattu, paikkamerkit ennallaan:
  Vuosina ~~1867-1868~~ **1867–1868** Suomea koetteli nälänhätä, joka tappoi lähes kahdeksan prosenttia väestöstä. Katastrofin syynä oli ⟦2⟧poikkeuksellisen kylmä kevät⟦3⟧, mutta yhtä paljon siihen vaikuttivat hallinnon hidas ~~reakointi~~ **reagointi** ja huonot ~~kulku yhteydet~~ **kulkuyhteydet**. Viljaa olisi ollut saatavilla**,** mutta sitä ei ehditty kuljettaa perille ennen jäiden tuloa.
- Eteläpohjalainen vuorosana, kaksi väärää korjausta:
  – Kyllä mä sen ~~tierän~~ **tiedän**, notta se on vaikiaa, mutta ei auta itkiä ~~markkinoolla~~ **markkinoilla**.
- Kerronta, 2/4 korjattu: `narisi` ja `...` jäivät:
  Myrsky katkaisi sähköt puoli yhdeksältä. Sytytin kynttilän ja kuuntelin**,** miten tuuli riuhtoi ~~pelti kattoa~~ **peltikattoa** ja miten vanhat hirret narisi sen otteessa. Pimeässä talo tuntui suuremmalta kuin päivällä, melkein vieraalta... Silti en olisi vaihtanut sitä mihinkään.

**glm-5.3-flash-abliterated**

- Kerronta, 4/4 korjattu, suorat lainausmerkit vaihdettu oikeiksi:
  Mummo kutsui sitä ~~"~~**”**hiljaiseksi huoneeksi~~"~~**”**, vaikka siellä tikitti kolme kelloa yhtä aikaa. Lapsena kuvittelin**,** että kellot ~~kävi~~ **kävivät** kilpaa ja että se, joka ehtisi ensin ~~keski yöhön~~ **keskiyöhön**, saisi palkinnoksi koko talon.
- Puhekielinen vuorosana, lyöntivirhe `pöydläle` jäi (malli ei koskenut riviin):
  – Oottekste nähny mun avaimia? Mä jätin ne eilen tohon pöydläle, ja nyt niitä ei oo missään.
- Kerronta, 2/4 korjattu: `luistellimme` ja pilkku sanan `kunnes` edeltä jäivät:
  Talvi tuli sinä vuonna aikaisin. Lokakuun lopussa satama oli jo jäässä, ja kalastajat ~~veti~~ **vetivät** veneensä rantaan, ~~ennenkuin~~ **ennen kuin** ehtivät paikata verkkojaan. Me lapset luistellimme laiturin ympärillä iltaan asti kunnes äidit huusivat meidät kotiin.

## Mitä koe ei kerro

- **Oma tekstisi puuttuu.** Selvityksen askel 0 pyytää 20–30 omaa kappalettasi. Tässä aineisto on kirjoitettu koetta varten, ja virheet ovat yksiselitteisiä perusvirheitä. Tulkinnanvaraiset pilkut, rektiot, viittaussuhteet ja tahallinen tyyli kerronnassa jäivät mittaamatta. Sama ajo omilla kappaleillasi vaatii vain uuden `dataset.json`-tiedoston.
- **Otos on pieni.** 57 virhettä ja kolme ajoa mallia kohti. Päätössäännön täyttyminen on selvä, mallien keskinäinen järjestys tarkkuudessa ei ole.
- **Kokonaista lukua ei ajettu.** Pisin erä oli 28 riviä. Se, pysyykö numerointi koossa 40 rivin erissä tai laatu sadan rivin luvussa, on mittaamatta.
- **Mallit voivat muuttua.** Tulos koskee yhdyskäytävän tunnisteita 16.11.2026. Kaksi havaintoa viittaa siihen, että tunnisteiden takana voi olla jaettua palvelua: kaksi GLM-tunnistetta antoi toistossa erälle 1 merkilleen saman puutteellisen vastauksen, ja virheet `Isäisän` ja `tikittivät` tulivat kumpikin kahdelta eri mallilta. Tätä ei voitu varmistaa. Vastauksen `model`-kenttä vastasi pyydettyä tunnistetta niissä neljässä pyynnössä, joissa se tallennettiin.
- **Ilmaismallia ei kokeiltu** (`deepseek-v4.1-flash-abliterated-free`), kuten tehtävä rajasi.
- **”Miksi?”-perustelua ei kokeiltu.** Koe mittasi vain korjaamisen.

## Tiedostot

Kansio: `test/fixtures/step0-gateway/` (aineisto ja mallien vastaukset) ja `scripts/step0/` (ajo- ja pisteytysskriptit). Koe ajettiin alun perin istunnon väliaikaiskansiossa; aineisto on kopioitu tänne mallivertailua (4.11) ja testejä varten.

| Tiedosto | Sisältö |
|---|---|
| `dataset.json` | 28 riviä: lähetettävä teksti, virheetön versio, istutetut virheet `{wrong, right, type}`, paikkamerkit |
| `build_dataset.js` | Rakentaa aineiston ja tarkistaa, että jokainen virhe on tekstissä täsmälleen kerran |
| `prompt.txt` | Kehote: järjestelmäteksti ja käyttäjäviestin pohja |
| `run.js` | Ajaa erät kaikille maksullisille malleille; avain luetaan ympäristöstä |
| `raw/v1/`, `raw/v1-toisto/`, `raw/v1-era28/` | Raakavastaukset malleittain (teksti, aika, tokenit, päättelyn pituus; päättelytekstiä ei tallennettu) |
| `score.js`, `scores/*.json` | Pisteytys ja rivikohtaiset tulokset |
| `summary.js` | Ajojen yhteenvedot, joista tämän tiedoston luvut on otettu |
| `examples.js` | Esimerkkirivien muotoilu |

Uusi ajo: `python3 <withkey.py> CHERRY_API_KEY node run.js --prompt prompt.txt --tag <nimi>`, sitten `node score.js --tag <nimi> --details`. Avain ei ole yhdessäkään kansion tiedostossa (tarkistettu skriptillä `keycheck.js`).

## Liite: kokeiltu järjestelmäteksti

Tämä teksti täytti päätössäännön kaikilla neljällä mallilla. Käyttäjäviesti on `Oikolue nämä {N} riviä. Palauta {N} riviä samoilla numeroilla <teksti>-tagien sisällä.` ja sen perässä rivit muodossa `[1] …` `<teksti>`-tagien sisällä.

```
Olet suomen kielen oikolukija. Saat numeroituja rivejä kirjan käsikirjoituksesta. Jokainen rivi on yksi kappale.

Korjaa vain selvät kielivirheet: lyöntivirheet, yhdyssanavirheet, pilkkuvirheet, väärät taivutusmuodot, kongruenssivirheet ja selvät typografiset virheet.

Säännöt:
1. Älä muuta tyyliä, sanavalintoja, sanajärjestystä tai rytmiä. Älä tiivistä, selkeytä tai paranna tekstiä.
2. Jos rivillä ei ole virhettä, palauta se merkilleen samana.
3. Palauta jokainen rivi omalla rivillään ja samalla numerolla: [1], [2] ja niin edelleen. Rivejä on vastauksessa täsmälleen yhtä monta kuin sait. Älä yhdistä, jaa, lisää tai poista rivejä.
4. Älä muuta, siirrä tai poista merkintöjä, jotka näyttävät tältä: ⟦1⟧. Ne ovat paikkamerkkejä, ja jokaisen on oltava vastauksessa samassa kohdassa.
5. Vuorosanaviivalla (–) alkavat rivit ovat repliikkejä. Niiden puhekieli ja murre ovat tahallisia: älä muuta niitä yleiskieleksi. Korjaa repliikistä vain selvä lyöntivirhe.
6. Suomen lainausmerkki on ” ja ajatusviiva –. Älä vaihda niitä suoriin lainausmerkkeihin (") tai yhdysmerkkeihin (-).
7. Vastaa vain korjatuilla riveillä <teksti>-tagien sisällä. Ei selityksiä, ei otsikoita, ei koodilohkoja, ei mitään tagien ulkopuolella.

Vastauksen muoto:
<teksti>
[1] ensimmäinen rivi korjattuna
[2] toinen rivi korjattuna
</teksti>
```

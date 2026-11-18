# FAUST ja tekoäly: lisättävät, hiottavat ja poistettavat ominaisuudet

*16.11.2026. Selvitys perustuu alan editorien julkisiin ohjeisiin ja muutoslokeihin sekä FAUSTin koodin lukemiseen (haara `cherry-gateway-codemirror`, HEAD `2d68cfb`). Sovellusta ei ajettu eikä repoa muutettu. Työmäärät yhdelle kehittäjälle: S = alle päivä, M = 2–4 päivää, M–L = noin viikko, L = yli viikko.*

## 1. Yhteenveto

> **Päivitys 16.11.2026 illalla (commit `8c0e7f3`):** askeleen 1 tietojen menetyksen polut on korjattu, ja korjaukset on ajettu sovelluksessa esimerkkiprojektilla. Tekoälykutsu ei enää kirjoita projektia vanhalla tilalla eikä hävitä pyynnön aikana kirjoitettua tekstiä (5.1). Aktiivisen luvun tunniste korjautuu aina olemassa olevaan lukuun (5.2). Tilannekuvan palautus ottaa ensin kopion nykytilasta. Paikka-, lanka- ja lukulomakkeet avautuvat. Jokaisella ikkunalla on virheraja, joten yksi rikkinäinen näkymä ei tyhjennä sovellusta. Johdonmukaisuustarkistus kertoo epäonnistuneista kutsuista.
>
> **Askeleesta 1 tekemättä:** generointipainikkeiden, ”Korvaa luku” -polun ja ⚗-pikatarkistuksen piilotus (kysymys 1 luvussa 6 on sinun päätöksesi) sekä tilannekuva ennen keskustelun ”Lisää”-liittämistä. Koko kirjan generointia ei ole ajettu korjauksen jälkeen: kokeile sitä ensin projektin kopiolla. Alla olevat rivinumerot viittaavat koodiin ennen näitä korjauksia.

FAUSTin tekoäly on rakennettu kokonaisten lukujen generointiin ja pisteytykseen. Alan editorit ja pienet, pääosin vuosien 2023–2024 tutkimukset viittaavat toiseen suuntaan. Kirjoittajat käyttävät pysyvästi neljää asiaa: pieniä muokkauksia valittuun tekstiin, oikolukua, palautetta ja kirjan muistia. Suositus on yksi periaate: tekoälyn muutos on ehdotus tekstin päällä, eikä käsikirjoitus muutu ennen hyväksyntää.

Ensin suljetaan kaksi koodista luettua tietojen menetyksen polkua. Sitten rakennetaan yksi pyyntökerros, sanatason ehdotuskerros, Cmd+K-pikamuokkaus, typografia ja kielenhuolto, joka tekee vain korjauksia. Toisessa vaiheessa tulevat kirjan muisti (tiivistelmät, Tarinakansio) ja palaute (Tarkistus). Generointipinnat poistetaan, jos hyväksyt sen (luku 6).

Mikään ominaisuus ei vaadi mallilta JSONia, työkalukutsuja tai yhden valmistajan erikoisominaisuuksia, koska erot lasketaan paikallisesti. Rakenteen puolesta mikä tahansa yhdyskäytävän malli käy; käytännön toimivuutta Cherry Studion kanssa ei ole vielä kokeiltu (luku 8). Suurin avoin kysymys on, osaavatko yhdyskäytävän mallit korjata suomea kirjoittamatta tekstiä uusiksi; sitä ei ole mitattu yhdessäkään lähteessä, ja se kokeillaan ennen rakentamista.

## 2. Miten parhaat editorit integroivat tekoälyn

Tuotteet jakautuvat kahtia; FAUSTiin valitaan tiukempi malli (a), koska käsikirjoituksessa hiljainen muutos ei kaadu kuten koodi. Mallit ovat (a) **pidätetty ehdotus**, jossa teksti ei muutu ennen hyväksyntää, ja (b) **sovella ja tarkista**, jossa muokkaus tehdään heti ja kirjoittaja pitää tai kumoaa sen jälkikäteen. Muut erot syntyvät siitä, missä tekoäly asuu. Alla ovat ne mallit, joilla on merkitystä FAUSTille. Sulkeissa oleva vuosi kertoo, jos tieto on vanha tai sivu päiväämätön.

### 2.1 Tekstissä

**Pikamuokkaus valintaan paikan päällä.** Kirjoittaja valitsee tekstin, painaa yhtä näppäinyhdistelmää ja kirjoittaa ohjeen pieneen kenttään valinnan kohdalla. Tulos palaa samaan kohtaan.
- *Käyttävät:* Sudowrite Quick Edit, Cmd/Ctrl+K ja enintään 1 000 sanaa ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/quick-edit/2asL35fds36oHAFJN7bYzz)). VS Code inline chat ([ohje](https://code.visualstudio.com/docs/copilot/chat/inline-chat)). Zed Inline Assistant, jossa on valmiiksi täytetyt kehotteet ja usean mallin vaihtoehdot ([ohje](https://zed.dev/docs/ai/inline-assistant)). Devin Desktopin Command, jossa hyväksyntä, hylkäys ja jatko-ohje ovat diffin kohdalla ([ohje](https://docs.devin.ai/desktop/command/windsurf-overview.md)). Novelcrafterin tekstinkorvauskehotteet, jotka on nimetty kirjoittamisen termein ([ohje](https://www.novelcrafter.com/help/docs/write/text-replacement-prompts)). Word (Copilot): valinnan uudelleenkirjoituksen tuloksella on kolme kohtaloa: korvaa, lisää alle, uusi yritys ([ohje](https://support.microsoft.com/en-us/word/edit-with-copilot-in-word)).
- *Miksi toimii:* suurin osa kirjoittajan tarvitsemasta avusta on paikallista, eikä katseen tarvitse siirtyä sivupaneeliin. Tukeva näyttö: Cursor poisti Cmd+K-toiminnon 26.10.2026 (henkilökunnan mukaan mukaan lukien päätteen komentojen generointi), ja foorumiketjussa kymmenet käyttäjät vastustivat, koska sivupaneeli on pienissä muokkauksissa hitaampi ja raskaampi ([foorumi](https://forum.cursor.com/t/cmd-k-has-been-retired-from-terminal/176251)). Ketju on itse valikoitunut otos. Cursorin oma perustelu (28.10.2026): käyttö oli pudonnut kauas huipustaan, eikä toista rinnakkaista järjestelmää kannattanut ylläpitää. Opetus: yksi nopea paikallinen polku, joka jakaa koneiston avustajan kanssa.

**Muutokset näkyvinä, päätös muutos kerrallaan: kaksi mallia.** Tekoälyn muokkaus näkyy tekstissä lisäyksinä ja yliviivauksina, ja kirjoittaja ratkaisee jokaisen. Tuotteet eroavat siinä, onko teksti jo muuttunut.
- *(a) Pidätetty ehdotus, teksti ei muutu ennen hyväksyntää:* Google Docs: Geminin muokkaukset ovat ehdotuksia (Accept suggestion, Accept all, Reject all), ja Googlen blogin mukaan ne näkyvät vain pyytäjälle hyväksyntään asti ([ohje](https://support.google.com/docs/answer/13951448?hl=en), [blogi](https://workspace.google.com/blog/product-announcements/reimagining-content-creation)). Revise: muutoskortit, Ctrl+Enter kohdistimen alla olevaan muutokseen ja läpikäynti askel kerrallaan ([ohje](https://revise.io/help/ai-reviewing-changes.md)). Sudowrite Quick Edit: alkuperäinen jää paikalleen yliviivattuna; hyväksy, hylkää tai tarkenna ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/quick-edit/2asL35fds36oHAFJN7bYzz)). Type: vihreät ja punaiset merkinnät sekä näppäimet hyväksynnälle, hylkäykselle ja siirtymiselle ([blogi](https://blog.type.ai/post/introducing-a-faster-way-to-edit-with-ai); dokumentoitu 2024–25, voi olla muuttunut). Mediachance Editorial: tekoälyn tulos on lohkon vaihtoehtoinen versio, josta kirjoittaja ottaa yksittäisiä paloja tai kokonaisia virkkeitä ([sivu](https://www.mediachance.com/editorial)). Draftline AI Studio: jokainen muutos diffinä, hyväksy tai hylkää ([sivu](https://draftline.ink)). Craftin Explore-tila ehdottaa ja odottaa hyväksyntää ([ohje](https://support.craft.do/en/ai-assistant/editing.md)).
- *(b) Sovella ja tarkista, muokkaus tehdään heti:* VS Code: muokkaukset on jo tallennettu levylle; Keep poistaa vain odottaa-merkinnän ja Undo peruu, muutoksen, tiedoston ja kaiken tasolla ([ohje](https://code.visualstudio.com/docs/copilot/chat/review-code-edits)). Cursor: Keep/Undo muutoksittain editori-ikkunassa (henkilökunnan foorumivastaus 12.10.2026, [foorumi](https://forum.cursor.com/t/bring-back-the-review-tool-from-earlier-cursor-ide-versions/174469)). Devin Desktop: diff-alueet, ja Code-tilassa työtilan muokkaukset hyväksytään automaattisesti ([diff-alueet](https://docs.devin.ai/desktop/advanced.md), [tilat](https://docs.devin.ai/desktop/devin-local/modes.md)). Zed: hyväksy tai hylkää muutoslohko kerrallaan tarkistusnäkymässä ([ohje](https://zed.dev/docs/ai/agent-panel)). Obsidian Copilot: muutoslista, diff ja Revoke ajon jälkeen ([ohje](https://docs.obsidiancopilot.com/agent-mode-and-tools/)). Word: keskustelu avautuu Edit-tilassa ja suora muokkaus on oletus ([ohje](https://support.microsoft.com/en-us/Word/welcome-to-copilot-in-word), [tiekartta](https://mc.merill.net/message/RM557673)); Copilot voi tehdä muutokset sanatasolla jäljitettyinä, Windows ja Mac, käyttöönotto kesä–heinäkuussa 2026 ([Microsoftin blogi](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/copilot-in-word-new-capabilities-for-document-workflows/4508974), [MC1384426](https://mc.merill.net/message/MC1384426)). Notionin oletustila ”Review for me” etenee itse ja pysähtyy vain kohdissa, jotka se itse arvioi riskialttiiksi ([ohje](https://www.notion.com/help/choose-how-notion-agent-asks-for-your-approval)). Claude Docsissa ei ole dokumentoitua ehdotustilaa: muutos tehdään suoraan ja merkitään tekijälleen ([ohje](https://support.claude.com/en/articles/16923645)).
- *Miksi (a) FAUSTiin:* tapa on sama kuin kustannustoimittajan kanssa, kirjoittaja näkee tarkalleen, mitkä sanat muuttuivat, eikä tallennus tai vienti koskaan sisällä tarkistamatonta tekstiä. Koodissa hiljainen virhe kaatuu testissä; proosassa se jää huomaamatta. Malli (b) on nopeampi mekaanisissa läpikäynneissä, ja koodieditorit ovat valinneet sen. Applen Rewrite ei tammikuussa 2025 näyttänyt eroja; Pixel Envyn mukaan ponnahdusikkunassa ei näyttänyt Proofreadkaan ([Pixel Envy](https://pxlnv.com/blog/undesign-of-apple-intelligence-features/)). Koodieditorit näyttävät erot riveittäin. Sanan ja virkkeen tarkkuus proosalle on tämän selvityksen oma päätelmä, ei mitattu tulos.

**Oikoluku ohjattuna läpikäyntinä, korjaukset erillään uudelleenkirjoituksesta.** Korjaukset merkitään tekstiin, kirjoittaja käy ne läpi yksi kerrallaan ja näkee perustelun.
- *Käyttävät:* Apple Proofread (macOS 15, 2024–25; nykytila macOS 27:ssä varmistamatta): alleviivaukset, seuraava ja edellinen, selitys, alkuperäisen näyttö ja palautus ([WWDC 2024](https://developer.apple.com/videos/play/wwdc2024/10168/), [macOS 15 -opas](https://support.apple.com/en-euro/guide/mac-help/mchldcd6c260/15.0/mac/15.1)). DeepL Write: ”Corrections only” ja erilliset rajapinnat korjaukselle ja uudelleenmuotoilulle ([tuotesivu](https://www.deepl.com/en/write), [API](https://developers.deepl.com/docs/api-reference/improve-text)). Lex Checks (Lex ei ota uusia asiakkaita; viitesuunnitelma, tiedot 2024–25): yksi nimetty tarkistus kerrallaan, perustelu pyydettäessä ([opas](https://lex.page/read/c563b895-d226-40c6-988f-33add2ff1dac), [etusivu](https://lex.page)). Notion: ehdotetut muokkaukset hyväksytään ylhäältä alas ([julkaisutiedot](https://www.notion.com/releases/2026-08-28)).
- *Miksi toimii:* oikoluvusta tulee rajattu tehtävä, jolla on loppu, ja kirjoittajan ääni säilyy.
- *Suomi:* Apple Intelligence ei tue suomea ([Apple](https://support.apple.com/en-us/121115)). macOS:n kieliopin tarkistus kattaa vain englannin, mutta suomen automaattinen korjaus on listattu, ja Electron käyttää Macissa järjestelmän oikeinkirjoituksen tarkistusta ([Apple](https://www.apple.com/macos/feature-availability/), [Electron](https://www.electronjs.org/docs/latest/tutorial/spellchecker)). DeepL:n uudelleenmuotoilussa ei ole suomea ([API](https://developers.deepl.com/docs/api-reference/improve-text)). LanguageToolissa ei ole suomea ([kielilista](https://dev.languagetool.org/languages)). Grammarly listaa suomen perusehdotuksiin mutta ei kappaleiden uudelleenkirjoitukseen ([ohje](https://support.grammarly.com/hc/en-us/articles/115000090971-What-languages-does-Grammarly-support)). Wordissa on suomen kielentarkistus ja Copilot tukee suomea ([Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365-apps/deploy/overview-deploying-languages-microsoft-365-apps), [Copilotin kielet](https://support.microsoft.com/en-us/office/supported-languages-for-microsoft-copilot-94518d61-644b-4118-9492-617eea4801d8)), mutta ne toimivat Wordissa, eivät FAUSTissa. Voikko on avoin suomen oikeinkirjoituksen ja kieliopin tarkistin, tavuttaja ja perusmuotoistaja, joka toimii ilman verkkoa; kielioppisääntöjä on 18, enimmäkseen mekaanisia ([sivu](https://voikko.puimula.org/), [sääntökoodit](https://raw.githubusercontent.com/voikko/corevoikko/master/libvoikko/src/grammar/error.hpp)). Lingsoftin tarkistin kattaa suomen ja selittää ehdotuksensa, mutta se on organisaatioille myytävä palvelu ([sivu](https://lingsoft.ai/services/language-intelligence-solutions/quality-checker/)). Suomen kielentarkistuksen työkaluista ei tehty hakuja; vain nämä yksittäiset sivut luettiin.

**Uusi teksti vaiheistettuna kohdistimeen.** Generoitu teksti ilmestyy kohdalleen odottavana, ja kirjoittaja hyväksyy, yrittää uudelleen tai hylkää.
- *Käyttävät:* Novelcrafterin scene beat: Apply, Retry, Discard ja Section; Stop säilyttää osittaisen tekstin. Retry tuhoaa edellisen tuloksen, mistä valmistajan oma FAQ varoittaa ([ohje](https://www.novelcrafter.com/help/docs/write/generating-prose), [FAQ](https://www.novelcrafter.com/help/faq/ai-and-prompting/how-can-i-stop-prose-generation)). Sudowrite Write: 1–6 korttia sivupalkkiin, Insert ja ohjattu suunta ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/write/pvxUvbQqYybfEosqx1sXjY)). NovelAI: jatko suoraan tekstiin ja haarautuva historia ([ohje](https://docs.novelai.net/en/text/editor/)). DreamGen: ohjelohkot tekstin seassa ([ohje](https://v2.dreamgen.com/docs/how-to-write-story)).
- *Miksi toimii:* kirjoittaja arvioi tekstin siinä, missä se tulee olemaan, ja pieni yksikkö on ohjattavissa.
- *Raja:* ulkopuolinen arvostelija piti kokonaisen luvun generointia epätasaisena ([Kindlepreneur](https://kindlepreneur.com/sudowrite-review)). Koulutetut kirjoittajat säilyttivät alle 35 % generoidusta luonnoksesta puolessa tarinoista, tosin vuoden 2023 mallilla ([tutkimus](https://ar5iv.labs.arxiv.org/html/2309.12570)).

**Ulkoa tuotu muokkaus muutoksina.** Kirjoittaja valitsee alkuperäisen ja liittää muualla muokatun version; ohjelma näyttää vain erot.
- *Käyttävät:* iA Writer ”Paste Edits From” ([ohje](https://ia.net/writer/support/editor/authorship)). Dabble: päälle liittäminen vaihtaa vain eroavat sanat ([julkaisutiedot](https://www.dabblewriter.com/docs/reference/release-notes)).
- *Miksi toimii:* toimii minkä tahansa ulkoisen työkalun kanssa, eikä ohjelman tarvitse lähettää tekstiä minnekään.

**Mitä ei kannata kopioida: harmaa automaattitäydennys.** Yhdestäkään fiktiotyökalusta sitä ei löytynyt. Copilotin oletusasetus pitää täydennykset pois päältä Markdownille ja pelkälle tekstille ([asetukset](https://code.visualstudio.com/docs/copilot/reference/copilot-settings)). CHI 2026 -tutkimuksen mukaan ehdotusten arviointi syrjäyttää kirjoittajan oman ideoinnin ([tutkimus](https://arxiv.org/abs/2603.10374); noin 112 sanan mielipidekirjoitukset, avustajalla tahallinen kanta; Tab-hyväksyntä; ei fiktiota eikä pitkää tekstiä).

### 2.2 Tekstin vieressä

**Keskustelu, joka tuntee käsikirjoituksen, ja näkyvä kytkin ”vain keskustelu / saa muokata”.**
- *Käyttävät:* Sudowrite: Chat only ja Allow edits ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/chat/5vbuELXf6LZQnGfVzsEXCV)). Word: Edit mode ja Chat only; keskustelu avautuu muokkaustilassa ([ohje](https://support.microsoft.com/en-us/Word/welcome-to-copilot-in-word)). Craft: Explore ehdottaa, Execute tekee ([ohje](https://support.craft.do/en/ai-assistant/editing.md)). Notion: kolme hyväksyntätilaa ([ohje](https://www.notion.com/help/choose-how-notion-agent-asks-for-your-approval)). Novelcrafterin chat ei dokumentaation mukaan muokkaa käsikirjoitusta ([ohje](https://www.novelcrafter.com/help/docs/chat/the-chat-interface)).
- *Miksi toimii:* rakenteesta ja tahdista puhutaan keskustellen, ja kytkin kertoo, onko kysyminen turvallista. Oletus ratkaisee: Wordissa muokkaus on päällä, ellei sitä itse vaihda.
- *Varoitus:* Sudowriten muokkaava chat tarvitsi korjauksia heinä-, elo- ja syyskuussa 2026: kumoaminen hyppäsi liian kauas, chat viittasi väärään tiedostoon, muokkaukset osuivat väärään kohtaan ja pitkät pyynnöt päättyivät virheeseen tallentamatta ([muutosloki](https://sudowrite.featurebase.app/changelog/kimi-k3-safer-undo-chat-reliability-and-more-fixes), [kaikki merkinnät](https://feedback.sudowrite.com/changelog)).

**Selkeät tavat siirtää keskustelun tulos tekstiin.**
- *Käyttävät:* Type Chat (dokumentoitu 1/2025): vedä, korvaa valinta tai kopioi ([blogi](https://blog.type.ai/post/type-ai-overview)). Sudowrite: kortit sivupalkissa ja erillinen Insert ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/write/pvxUvbQqYybfEosqx1sXjY)). Google Docsin sivupaneeli: Preview, Insert, Copy, Retry ([ohje](https://support.google.com/docs/answer/14206696?hl=en)).
- *Miksi toimii:* keskustelun tuotos ei päädy käsikirjoitukseen tarkistamatta.

**Vaihtoehdot säilyvät, uusi yritys ei tuhoa edellistä.**
- *Käyttävät:* Wordtune (sivut 2025, nykytila varmistamatta) näyttää listan, josta valitaan ([sivu](https://www.wordtune.com/rewrite)). Zed ajaa saman kehotteen usealla mallilla ([ohje](https://zed.dev/docs/ai/inline-assistant)). NovelAI säilyttää jokaisen generoinnin haarautuvassa historiassa ([ohje](https://docs.novelai.net/en/text/editor/)). LivingWriter (päiväämätön ohje) tarjoaa alkuperäisen siirtämistä talteen hyväksynnän yhteydessä ([ohje](https://guides.livingwriter.com/product-documentation/ai-features/ai-rewrite)). Wordin ”lisää alle” pitää molemmat versiot (ks. 2.1).
- *Miksi toimii:* paras kappale kootaan usein monesta yrityksestä. Paikalleen tallennetut variaatiot kevensivät työtä 12 kirjoittajan tutkimuksessa ([ABScribe](https://arxiv.org/abs/2310.00117); vain tiivistelmä luettu).

**Tallennetut omat kehotteet.**
- *Käyttävät:* Craft Saved Prompts ([ohje](https://support.craft.do/en/ai-assistant/custom-prompts.md)). Lex Prompt Builder ([opas](https://lex.page/read/e359fcf7-deae-47a5-bbfe-13159143bd15)). LivingWriter (päiväämätön ohje) tallentaa kirjoitetut uudelleenkirjoitusohjeet ([ohje](https://guides.livingwriter.com/product-documentation/ai-features/ai-rewrite)). Zed sitoo valmiin kehotteen näppäimeen ([ohje](https://zed.dev/docs/ai/inline-assistant)).
- *Miksi toimii:* kirjoittaja toistaa muutamaa samaa ohjetta satojen sivujen läpi.

**Hiljainen käyttöliittymä ja pois-kytkin.**
- *Näyttö:* Googlen alapalkista jouduttiin kirjoittamaan ohje, miten sen saa pois ([TechCrunch](https://techcrunch.com/2026/06/17/how-to-turn-off-ai-in-your-google-docs/)). Ulyssesissa on sovelluskohtainen kytkin ([ohje](https://help.ulysses.app/dive-into-editing/writing-tools)). Craftin avustajan saa pois työtilakohtaisesti ([ohje](https://support.craft.do/en/ai-assistant/using.md)). Draftlinen AI-osa on uudessa asennuksessa pois päältä ([sivu](https://draftline.ink)).
- *Miksi toimii:* pitkän tekstin kirjoittaja varjelee keskittymistään. Helppo pois-kytkin on edellytys sille, että tekoälyä käytetään silloin kun sitä halutaan.

### 2.3 Käsikirjoituksen ympärillä: muisti ja konteksti

**Tarinakansio pysyvänä kontekstina, maininnasta laukeava.** Hahmot, paikat ja faktat ovat yhdessä muokattavassa paikassa. Merkintä lähtee mallille, kun sen nimi esiintyy käsiteltävässä tekstissä.
- *Käyttävät:* Novelcrafter Codex, jossa on neljä tilaa: aina mukana, mukana kun havaitaan, vain käsin, ei koskaan ([FAQ](https://www.novelcrafter.com/help/faq/ai-and-prompting/codex-context-in-prompting), [merkinnän rakenne](https://www.novelcrafter.com/help/docs/codex/anatomy-codex-entry)). Sudowrite Story Bible ja silmäkytkin kortille ja yksittäiselle piirteelle ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/visibility-settings/4KL8gFeLZP6ep8keUhKVGp)). NovelAI Lorebook ([ohje](https://docs.novelai.net/en/text/lorebook)). SillyTavern World Info ([ohje](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)).
- *Miksi toimii:* kirjan mittainen johdonmukaisuus ei mahdu kehotteeseen, ja kirjoittaja voi pitää salaisuudet poissa mallilta. NovelAI:n uusimmilla malleilla sijoitteluasetukset eivät ole käytettävissä (syytä ei kerrota; tilalla ovat ehtosäännöt) ([ohje](https://docs.novelai.net/en/text/lorebook)). Tulkinta: sijoittelun hienosäätö ei ole välttämätön.

**Tiivistelmät kirjan muistina.**
- *Käyttävät:* Novelcrafter käyttää aiempien kohtausten tiivistelmiä ”tarina tähän asti” -taustana ([FAQ](https://www.novelcrafter.com/help/faq/plan/outline-impact)). Sudowrite linkittää dokumentit lukutiivistelmiin ja lähettää enintään 20 000 sanaa enintään 25 aiemmasta dokumentista ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/chapter-continuity/4KL8gFeLZQ6GSBjDWtSbV6)).
- *Miksi toimii:* malli saa koko kirjan pääpiirteet pienellä kustannuksella.
- *Raja:* SillyTavernin oma ohje sanoo, että tiivistelmät kadottavat yksityiskohtia ja ne on korjattava käsin ([ohje](https://docs.sillytavern.app/extensions/summarize/)). Novelcrafter varoittaa, että tiivistelmän sisältö nousee tekstissä esiin, joten sen pitää olla lyhyt ([FAQ](https://www.novelcrafter.com/help/faq/plan/outline-impact)). Yksi testaaja raportoi yksityiskohtien ajelehtimista noin luvun 15 kohdalla ([arvostelu](https://ucstrategies.com/news/sudowrite-review-i-tested-the-22-month-ai-against-chatgpt-across-70000-words/)).

**Näkyvä konteksti: mitä malli näkee.**
- *Käyttävät:* Novelcrafter Prompt Preview ([ohje](https://www.novelcrafter.com/help/docs/prompts/prompt-preview)). NovelAI Context Viewer, joka kertoo merkintäkohtaisesti, miksi se otettiin mukaan ([ohje](https://docs.novelai.net/en/text/editor/advancedsettings)). Sudowrite näyttää luetut dokumentit ja julkaisee pudotusjärjestyksen ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/chapter-continuity/4KL8gFeLZQ6GSBjDWtSbV6)). Mediachance Prompt Log ([sivu](https://www.mediachance.com/editorial)). Obsidian Copilotin kontekstimerkit ([ohje](https://docs.obsidiancopilot.com/context-and-mentions/)). Lexin token-mittari (10/2024, [uutiskirje](https://buttondown.com/lex/archive/new-in-lex-import-files-ask-lex-subtle-redesign)).
- *Miksi toimii:* kun tulos on ristiriidassa kirjan kanssa, kirjoittaja näkee, puuttuiko fakta kontekstista vai ohitettiinko se.

**Tyyliohje näkyvänä tekstinä, ei piilomuistina.**
- *Käyttävät:* Lex Style Guides ([opas](https://lex.page/read/3492a59e-ea19-4733-964a-3adc25b5f3e0)). Google näyttää tyylistä tekemänsä yhteenvedon vahvistettavaksi ([ohje](https://support.google.com/docs/answer/13951448?hl=en)). Cursorin sääntötiedostot ([ohje](https://cursor.com/docs/rules)). Devin Desktop korvasi automaattiset muistot näkyvillä säännöillä ([FAQ](https://docs.devin.ai/desktop/devin-desktop-faq.md)). Novelcrafterin ”AI-isms”-merkintä korostaa kuluneet sanat käsikirjoituksessa ([FAQ](https://www.novelcrafter.com/help/faq/ai-and-prompting/ai-isms)).
- *Miksi toimii:* kirjoittaja näkee ja voi korjata sen, mitä tekoälylle on kerrottu.
- *Raja:* lukijat eivät erottaneet äänessä eroa personoinnin kanssa ja ilman ([tutkimus](https://arxiv.org/html/2411.13032v1)).

**Oma päätepiste ja malli tehtävittäin.**
- *Käyttävät:* Novelcrafterissa ei ole omaa mallia, vaan käyttäjä liittää oman ([FAQ](https://www.novelcrafter.com/help/faq/ai-connections/does-novelcrafter-provide-its-own-ai)). Mediachance toimii paikallisilla moottoreilla ([sivu](https://www.mediachance.com/editorial)). Zedissä on ominaisuuskohtainen malliasetus ([ohje](https://zed.dev/docs/ai/inline-assistant)).
- *Sudenkuopat:* Cherry Studiosta ei ole tässä aineistossa yhtään lähdettä; alla olevat kohdat ovat muista palvelimista (ks. luku 8). Koskee vain, jos yhdyskäytävän takana on Ollama: oletusikkuna on 4 000 tokenia alle 24 GiB:n näyttömuistilla ([ohje](https://docs.ollama.com/context-length)), ja Anthropic-yhteensopivasta päätepisteestä puuttuvat tokenien laskenta, `tool_choice` ja kehotevälimuisti ([ohje](https://docs.ollama.com/api/anthropic-compatibility)). Osa malleista hylkää järjestelmäviestin; Novelcrafterissa on sitä varten mallikohtainen ”System msg.” -asetus ([LM Studio -ohje](https://www.novelcrafter.com/help/docs/ai-connections/lm-studio)).

**Käyttöloki ja alkuperä.**
- *Käyttävät:* iA Writer Authorship ([ohje](https://ia.net/writer/support/editor/authorship)). Dabblen Certificate of Authorship, jonka valmistaja esittää tukevana näyttönä, ei todisteena ([ohje](https://www.dabblewriter.com/docs/reference/certificate-of-authorship/)). Revise kirjaa jokaisen hyväksynnän ja hylkäyksen ([ohje](https://revise.io/help/ai-reviewing-changes.md)).
- *Miksi toimii täällä:* WSOY pyytää tietokirjailijaa kertomaan, miten tekoälyä on käytetty ([WSOY](https://www.wsoy.fi/haluatko-kirjailijaksi/)). Siltala, Teos ja Orava-kirjat pyytävät, ettei tekoälyn luomia tekstejä lähetetä ([Siltala](https://siltala.fi/sivu/haluatko-kirjailijaksi/)).

### 2.4 Kirjoittamisen jälkeen: kritiikki

**Yksi nimetty tarkistus kerrallaan.**
- *Käyttävät:* Lex Checks: hyväksy, muokkaa tai ohita; omat tarkistukset yhdellä ohjeella ([opas](https://lex.page/read/c563b895-d226-40c6-988f-33add2ff1dac)). Sudowrite Feedback: kehitys-, rivi-, dialogi- ja kielenhuoltotyypit sekä omat ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/feedback/7Ew1KgpEwabQSgvijq8QNr)). Ulysses: tarkistus on oma välilehtensä, jossa on kategoriat ja ohitus ([ohje](https://help.ulysses.app/en_US/the-dashboard/grammar-and-style-check)). Hemingway: ensin korostuskerrokset, tekoäly vain valinnaisena korjauksena ([ohje](https://hemingwayapp.com/help/docs/highlighted-issues)).
- *Miksi toimii:* epämääräinen ”anna palautetta” muuttuu toistettavaksi läpikäynniksi, yksi asia kerrallaan.

**Havainto ankkuroituna tekstikohtaan.**
- *Käyttävät:* ProWritingAidin ”Where in your text” hyppää kohtaan ja lakkaa toimimasta, jos teksti on muuttunut ([ohje](https://help.prowritingaid.com/article/390-how-to-use-the-text-location-function)). Sudowrite Feedback jättää marginaalikommentin, jossa on havainto, seuraava askel ja yhdellä napilla sovellettava muokkaus ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/feedback/7Ew1KgpEwabQSgvijq8QNr)). Google Docsissa Geminin kommentti lisätään vasta napin painalluksella ([ohje](https://support.google.com/docs/answer/17133843?hl=en)).
- *Miksi toimii:* palaute on käyttökelpoista vain, jos todisteen näkee. Ankkuri paljastaa myös mallin virheen heti.

**Havainnolle tila ja kirjoittajan ennakkotiedot.**
- *Käyttävät:* ProWritingAidin tiloihin kuuluvat Disagree ja Incorrect ([ohje](https://help.prowritingaid.com/article/382-how-to-change-the-status-of-feedback-in-manuscript-analysis)), ja kirjoittaja voi ennen ajoa kertoa tahalliset ratkaisunsa ([ohje](https://help.prowritingaid.com/article/422-how-to-fine-tune-your-feedback-in-manuscript-analysis)). AutoCritissä on Added Context ennen lukukertaa ([ohje](https://help.autocrit.com/en/articles/12910482-how-to-use-the-added-context-and-history-features)).
- *Miksi toimii:* suuri osa huonosta palautteesta johtuu siitä, ettei malli tiedä, mikä on tahallista.

**Kritiikki ei koske tekstiin.**
- *Käyttävät:* ProWritingAid erottaa julkisesti analysoivat raportit generoivista toiminnoista ([ohje](https://help.prowritingaid.com/article/297-does-prowritingaid-use-ai)). Craft Document Review antaa vain palautetta ([ohje](https://support.craft.do/en/ai-assistant/document-review.md)). Ellipsus laskee toistot ja lauserytmin paikallisesti ilman mallia ([blogi](https://ellipsus.com/blog/introducing-ellipsus-plus)).
- *Miksi toimii:* palaute ja tarinan hallinta olivat tutkimuksessa ne vaiheet, joihin useimmat kirjoittajatyypit, myös tekoälyä eniten vastustava, olivat avoimia (37 yhdysvaltalaista kirjoittajaa; arviot perustuivat osin staattisiin luonnoksiin, eivät toimivaan työkaluun) ([tutkimus](https://arxiv.org/html/2404.13165v1)).

**Rajat, jotka on otettava vakavasti.** Ulkopuoliset arvostelut löysivät väärälle hahmolle merkittyjä tekoja ja paisuteltua kehua ([The Write Practice](https://thewritepractice.com/prowritingaid-review-manuscript-analysis-and-virtual-beta-reader/), [Ironshrink](https://ironshrink.substack.com/p/alpha-reader-versus-the-robot)). Lukijapersoonien palaute oli tutkimuksessa monisanaista ja epätarkkaa ([tutkimus](https://arxiv.org/abs/2309.10433)). AutoCrit sanoo itse, ettei sen pistemäärä ole laatuarvio ([ohje](https://www.autocrit.com/editing/support/the-new-summary-report/)).

## 3. FAUSTin nykytila

Tekstinkäsittelypohja on vahva ja testattu. Sen päällä oleva tekoälykerros on vanhempaa koodia, ja suuri osa siitä ei toimi, koska kutsut pääprosessiin epäonnistuvat tai palauttavat väärän muodon. Yksikään tekoälyominaisuus ei käytä CodeMirror-julkisivua (`replaceRange`, `setHighlights`, `scrollToPos`). Tila perustuu koodin lukemiseen; mitään ei ajettu. Rivikohtaiset tarkistukset ovat liitteessä A.

| Alue | Tila | Olennaisin |
|---|---|---|
| Muotoilu, haku ja korvaus, kumoaminen, tallennus, palautuskopio | Toimii | `textTools.js` 35 testiä, `manuscript.js` 29 testiä, atominen tallennus |
| Oikeinkirjoitus (Työkalut → Oikoluku) | Toimii | macOS:n oma oikeinkirjoituksen tarkistus, ehdotukset hiiren oikealla painikkeella (`electron.js:555`, `292–294`, `FaustEditor.js:305`). Kielioppia ei tarkista mikään |
| Erikoismerkit (Lisää → Erikoismerkki) | Toimii | –, ”, … ja sitova välilyönti valikosta (`electron.js:509–518`). Automaattista muunnosta ei ole |
| Tutkimuskansio (Näytä → Tutkimuskansio, Cmd+Shift+R) | Toimii | Käsin kirjoitetut muistiinpanot, linkit ja tiedostoviitteet kentässä `project.research[]` (`electron.js:540`, `app.js:11645–11960`). Mitään niistä ei lähetetä mallille |
| Vienti (docx, pdf, epub, rtf, html, md, txt) ja tuonti (txt, md, docx) | Toimii | Asettelu on jo 12 pt ja riviväli 1,5, ja nimiösivu on (`utils/manuscript.js:510`, `524`, `381`, `411`). `[TODO:]`-merkinnät menevät vientiin sellaisinaan |
| Yksi AI-kutsupolku ja Cherry Studio -yhdyskäytävä | Osittain | Lähteen valinta, yhdyskäytävän osoite, avain, mallilista (”Hae mallit”) ja yhteystesti ovat olemassa (`AIProviderSettings.js`), samoin selkeät suomenkieliset virheilmoitukset. Ei peruutusta, kolme eri sopimusta, `max_tokens` puuttuu neljältä kutsujalta. Claude-suoran tilan kovakoodatut mallitunnisteet ovat vanhentuneet (5.5) |
| ◉ MAGNUM OPUS, ”Generoi Kaikki Luvut”, ”Generoi Uudelleen” | Rikki ja vaarallinen | Lukemalla: korvaa avoimen projektin tyhjällä oletusprojektilla, ja automaattitallennus kirjoittaa sen levylle |
| Liminal Engine -paneeli | Rikki | ”Apply” ei tee mitään (`app.js:3410`); englanninkielinen; ei keskusteluhistoriaa |
| Claude Assistentti (ClaudeChat) | Osittain | Suoratoistaa; ei historiaa eikä pysäytystä; ”Lisää” liittää koko vastauksen luvun loppuun |
| Hybrid-dialogi (Jatka, Laajenna, Uudelleenkirjoita, Luo kohtaus) | Osittain | Esikatselu on; ”Korvaa luku” korvaa koko luvun (`app.js:3095–3105`); `max_tokens` puuttuu |
| Analyysit ☿ ⚗ 🜍 | Osittain | Tulos `alert()`-ikkunassa; huomioita ei ole ankkuroitu tekstiin; ⚗ arvioi 2 000 ensimmäistä merkkiä |
| Äänellä ohjattu muokkaus | Poistetaan (askel 6) | Sovelluksen paras vertailunäkymä, mutta vain mikrofonin takana. Nojaa selaimen puheentunnistukseen (`app.js:3447`, `src/utils/voiceInput.js:18`), jota ei ole ajettu Electronissa |
| Johdonmukaisuus, juonilangat, jatkuvuusseuranta | Osittain | Epäonnistunut kutsu raportoidaan ”ei ristiriitoja”; juonilangat lähettävät koko käsikirjoituksen yhdessä pyynnössä; englanninkieliset säännölliset lausekkeet |
| Hahmot, paikat ja juonilangat tietoina | Rikki tai tavoittamaton | Vain tekoälyn kautta; paikka- ja lankalomakkeet kaatavat ikkunan avattaessa (lukemalla); kaksi hahmomuotoa, kaksi paikkavarastoa |
| Luvun tiivistelmä ja Chapter Sheet | Ei avaudu | `isOpen` puuttuu (`app.js:11315`); tiivistelmää ei voi kirjoittaa käsin |
| Tilannekuvat, tekoälyversiot, kumoaminen | Osittain | Kolme erillistä mekanismia; tilannekuvan vertailu on sanamäärä `alert()`-ikkunassa; palautus ei ota ensin kopiota |
| Annotaatiomarginaali | Rikki | Mikään ei luo annotaatioita; sijainti on arvio |
| Kirjoitustilat, kustannusseuranta, muistiloki | Osittain | Tilat eroavat lähinnä lämpötilalla; dollariluvut ovat arvioita; muistiloki laukeaa englanninkielisistä avainsanoista |
| Testit | Puuttuu | Yksikään testi ei koske tekoälypalveluja tai hyväksyntäpolkuja |

## 4. Lisättävät ominaisuudet

Kohdat on ryhmitelty aiheittain. Sitova järjestys on luvussa 7; jokaisen kohdan otsikossa on askeleen numero. Luvun lopussa (4.18) on kartta siitä, mistä kukin toiminto avataan.

Kohdat 4.1–4.8 ja luvun 5 korjaukset palvelevat kaunokirjaa ja tietokirjaa samalla tavalla: ehdotukset, pikamuokkaus, kielenhuolto, typografia ja konteksti eivät riipu lajista. Tietokirjassa muuttuvat oletukset, ja projektin tyyppi valitsee ne:
- pikavalinnat (4.3): ”Selkeytä väite”, ”Tiivistä kappale” ja ”Yhtenäistä termit” kaunokirjan ”Näytä, älä kerro” -valinnan tilalle
- tarkistukset (4.9): ”väite ilman lähdettä”, ”termin vaihtelu” ja ”kappaleen pääasia” kliseiden ja dialogin tilalle
- kansio (4.10): termit, henkilöt ja lähteet, ja osion nimi on ”Kirjan kansio”
- rivin alun viiva (4.8): luettelo, ei vuorosanaviiva.

### 4.1 Ehdotuskerros: tekoälyn muutokset sanatason ehdotuksina käsikirjoituksessa (askel 5)

- **Mitä:** Jokainen tekoälyn muutos olemassa olevaan tekstiin näkyy paikallaan: poistettava yliviivattuna, uusi sen vieressä korostettuna. Teksti ei muutu ennen hyväksyntää. Kapea palkki näyttää ”Ehdotus 3/12 · Hyväksy · Hylkää · Hyväksy kaikki · Hylkää kaikki · Palauta hylätyt” ja näkymävalinnan Muutokset / Alkuperäinen / Uusi. Cmd+Enter hyväksyy kohdistimen alla olevan muutoksen ja Shift+Cmd+Backspace hylkää sen. Siirtymisnäppäimet valitaan kokeilemalla suomalaisella näppäimistöllä; ehdokkaat ovat Shift+Cmd+. / Shift+Cmd+, ja varalla nuolinäppäinyhdistelmä. Palkin painikkeet toimivat aina. Esc ei koskaan hylkää tarkistettua joukkoa. Jos kirjoitat ehdotuksen sisään, se yksi ehdotus putoaa pois ja palkki kertoo sen. Kun virkkeen sanoista muuttuu yli noin puolet, virke näytetään yhtenä muutoksena. Odottavat ehdotukset säilyvät luvuittain, vaikka käyt välillä toisessa luvussa.
- **Mikään askel ei jää kumoamattomaksi:** Hylätyt ja hyväksytyt ehdotukset säilyvät istunnon ajan. ”Palauta hylätyt” tuo takaisin ne, joiden alkuperäinen teksti on yhä paikallaan. Kun kumoat hyväksynnän, teksti palaa ja sama ehdotus palaa odottavaksi, joten mallia ei tarvitse ajaa uudelleen. Jos suljet sovelluksen, kun ehdotuksia odottaa, sulkemisdialogi kysyy ensin.
- **Miksi:** Tämä tekee säännöstä ”ei mitään ilman näkyvää, kumottavaa askelta” konkreettisen. Koska dokumentti ei muutu ennen hyväksyntää, automaattitallennus, palautuskopio ja vienti eivät koskaan sisällä tarkistamatonta tekoälytekstiä. Kaikki myöhemmät ominaisuudet käyttävät tätä. Tämä on luvun 2.1 malli (a). Se on tiukempi kuin koodieditorien tapa, ja se on valittu sinun prioriteettiesi takia, ei siksi että kaikki tekisivät niin.
- **Missä nähty:** Malli (a): Sudowrite Quick Edit ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/quick-edit/2asL35fds36oHAFJN7bYzz)), Revise ([ohje](https://revise.io/help/ai-reviewing-changes.md)), Type ([blogi](https://blog.type.ai/post/introducing-a-faster-way-to-edit-with-ai)), Google Docs ([ohje](https://support.google.com/docs/answer/13951448?hl=en)), Mediachance Editorial ([sivu](https://www.mediachance.com/editorial)). Mallista (b) lainataan vain läpikäynnin ohjaimet: VS Coden kolme tasoa ja siirtyminen muutosten välillä ([ohje](https://code.visualstudio.com/docs/copilot/chat/review-code-edits)) ja Devin Desktopin diff-alueet ([ohje](https://docs.devin.ai/desktop/advanced.md)). Sudowrite joutui korjaamaan kumoamista kahdesti julkaisun jälkeen ([29.7.2026](https://sudowrite.featurebase.app/changelog/kimi-k3-safer-undo-chat-reliability-and-more-fixes), [14.8.2026](https://feedback.sudowrite.com/changelog/improved-draft-estimates-plus-a-bunch-of-fixes)); kun dokumentti ei muutu ennen hyväksyntää, tätä virheluokkaa ei synny.
- **Miten FAUSTissa:**
  - `src/editor/wordDiff.js` ja `src/editor/suggestionModel.js` puhtaina CommonJS-moduuleina (ks. 4.2). Malli on lista `{id, groupId, from, to, insert, original, meta}`. Ehdotus pudotetaan, jos muutos osuu sen alueelle.
  - Sääntö: `suggestionModel.js` ei tuo mitään `@codemirror/*`-paketeista. `@codemirror/state` on kaksoispaketti (`import` → `dist/index.js`, `require` → `dist/index.cjs`), ja `FaustEditor.js` kootaan webpackilla ESM-tuonnein. Jos CommonJS-moduuli lataa paketin `require`-kutsulla, webpack ottaa mukaan toisen kopion ja CodeMirror kaatuu ajon aikana omaan virheeseensä (`node_modules/@codemirror/state/dist/index.js:2016`). Siksi sijaintien kartoitus saa takaisinkutsun: `mapSuggestions(list, mapPos, touchesRange)`, ja ESM-laajennus antaa sille `(pos, assoc) => tr.changes.mapPos(pos, assoc)`. Vain Jest-testitiedosto saa ladata `.cjs`-koosteen `ChangeSet`ien rakentamiseen, koska testit eivät kulje webpackin läpi.
  - `src/editor/suggestions.js` on CodeMirror-laajennus: oma `StateField`, poisto `Decoration.mark`-merkintänä ja lisäys `Decoration.widget`-elementtinä. Kartoitus tehdään samoin kuin `highlightField`issä (`FaustEditor.js:67–85`). Hakukorostuksen kenttää ei käytetä uudelleen.
  - Julkisivuun (`installTextareaFacade`, `FaustEditor.js:183–244`) lisätään `proposeChanges`, `acceptSuggestion`, `rejectSuggestion`, `acceptGroup`, `rejectGroup`, `restoreRejected`, `stepSuggestion` ja `getSuggestions`.
  - Hyväksyntä on tavallinen `view.dispatch`. Se kulkee nykyisen `onChange`-kutsun kautta `updateChapterContent`-funktioon ja kumoamispinoon. ”Hyväksy kaikki” on yksi lähetys ja yksi kumoaskel.
  - `onChange` välittää nyt vain tekstin (`app.js:5657`). Ilman lisätietoa peräkkäiset yhden tai kahden merkin hyväksynnät, esimerkiksi pilkkukorjaukset alle 1,2 sekunnin välein, sulautuvat yhdeksi kumoaskeleeksi. Ratkaisu: hyväksyntälähetykseen oma annotaatio samaan tapaan kuin `External` (`FaustEditor.js:36`), `onChange(text, meta)` ja `UpdateContentCommand`in metaan `noMerge`-lippu sekä hyväksyttyjen ehdotusten tunnisteet.
  - FAUSTin kumoaminen on `CommandManager`, joka tallettaa kokonaisia lukutekstejä (`src/utils/CommandManager.js`), ei CodeMirrorin oma historia, ja ehdotukset elävät sen ulkopuolella. Siksi palautus tehdään erikseen: kun `runHistory` (`app.js:902–923`) kumoaa askeleen, jonka metassa on ehdotusten tunnisteita, samat ehdotukset ehdotetaan uudelleen.
  - Ratkaistut ehdotukset (hyväksytyt ja hylätyt) ja odottavat ryhmät pidetään luvuittain `app.js`:n refissä istunnon ajan. Editori luodaan uudelleen luvun vaihtuessa (`key` rivillä `app.js:5654`), joten ryhmät ehdotetaan palatessa uudelleen vain, jos `original` vastaa yhä tekstiä.
  - Renderöijä ilmoittaa odottavien ehdotusten määrän pääprosessille, ja sulkemisvahti (`electron.js:352–371`, tuntee nyt vain tallentamattoman tekstin) kysyy ennen sulkemista.
  - Näppäimet sidotaan laajennuksen omassa näppäinkartassa, joka on voimassa vain, kun ehdotuksia on odottamassa. Cmd+Enter ja Shift+Cmd+Backspace ovat vapaita sekä valikossa että editorin nykyisessä näppäinkartassa (liite A).
  - Palkki on oma komponenttitiedostonsa `src/components/SuggestionBar.js`; `app.js` vain kiinnittää sen.
- **Työmäärä:** L. **Vaikutus:** korkea.
- **Riskit:** Tekstin sekaan piirrettävät lisäykset on kokeiltava oikealla tekstillä rivityksen, kirjoituskonetilan ja oikeinkirjoituksen alleviivausten kanssa. Kumoaminen peilataan editoriin yhtenä alueena ensimmäisestä erosta viimeiseen (`FaustEditor.js:361–376`), jolloin alueelle osuvat odottavat ehdotukset putoavat; ne ehdotetaan uudelleen samalla säännöllä kuin luvun vaihdossa. Ensimmäisessä versiossa odottavat ehdotukset eivät säily sovelluksen sulkemisen yli, ja siksi sulkemisdialogi kysyy.

### 4.2 Puhtaat, testatut tekstimoduulit ennen käyttöliittymää (askel 4)

- **Mitä:** Kahdeksan funktiota, joista kaikki myöhempi kootaan. Määritelmä ensin: FAUSTissa kappale on yksi rivi, ja tyhjät rivit vain erottavat (`utils/manuscript.js:87`).
  - `wordDiff`: sanarajat Unicoden mukaan, myös ä, ö, å, ” ja –; yhden muuttumattoman sanan erottamat muutokset yhdistetään; virke tiivistetään yhdeksi muutokseksi raskaassa uudelleenkirjoituksessa. Se korvaa nykyisen `computeTextDiff`-funktion (`app.js:1110`, käyttäjät `app.js:6017` ja `10521`), joka poistetaan askeleessa 6.
  - `changeRatio`: kuinka suuri osa tekstistä muuttui.
  - `cleanModelOutput`: poistaa tagit, koodiaidat ja esipuheet.
  - `locateQuote`: tarkka osuma, sitten välilyönnit ja lainausmerkit normalisoituna, sitten pisin alku.
  - `splitBlocks(text)`: käyttää `parseBlocks`-funktion rivisääntöjä. Vain proosarivit lähetetään mallille; otsikot, `* * *`, luettelomerkit ja `>` jäävät paikallisiksi.
  - `maskSpans` ja `unmaskSpans`: `[TODO: …]`-merkinnät, `<u>`-tagit ja muotoilumerkit korvataan ennen lähetystä pysyvillä paikkamerkeillä ja palautetaan ennen diffin laskemista. Jos paikkamerkki puuttuu vastauksesta, merkintä palautetaan alkuperäiseen kohtaansa eikä siitä synny poistoehdotusta.
  - `batchParagraphs(lines, budget)`: jakaa rivit eriin mallin ikkunan mukaan.
  - `trimToSentence`: leikkaa keskeytetyn tekstin kokonaiseen virkkeeseen.
- **Miksi:** Avoimien mallien oikut jäävät kiinni testeissä eivätkä käsikirjoituksessa. Ilman rivien numerointia ja suojausta kielenhuolto (4.4) hylkäisi tai sotkisi suurimman osan tuloksestaan: mallit lisäävät tyhjiä rivejä tai yhdistävät rivejä, ja ennen lähetystä poistettu TODO-merkintä palaisi diffissä poistoehdotuksena. Tämä päättää myös tilan, jossa tekoälykoodilla ei ole yhtään testiä.
- **Missä nähty:** Ei tuotelähdettä. Malli on FAUSTin oma `textTools.js`, jonka testit kattavat 35 tapausta.
- **Miten FAUSTissa:** Moduulit kansioihin `src/editor/` ja `src/services/ai/`, testit kansioihin `test/editor/` ja `test/services/`. Niiden on oltava CommonJS-muotoa ilman DOMia, koska Jestille ei ole Babel-asetuksia, eivätkä ne tuo mitään `@codemirror/*`-paketeista (ks. 4.1). Sanan määritelmä tulee yhdestä paikasta: `wordDiff`, vältettävät sanat (4.7) ja Tarinakansion osumat (4.10) käyttävät `textTools.js`:n `WORD_CHAR`-sääntöä (rivi 12) ja `buildSearchPattern`- ja `findMatches`-funktioita (rivit 279–310), jotta editori ja diffi ovat samaa mieltä siitä, mikä on sana. `fast-diff` on vain välillinen riippuvuus, joten siihen ei nojata. `app.js` ei muutu tässä vaiheessa.
- **Työmäärä:** M. **Vaikutus:** korkea edellytyksenä; ei näy sinulle vielä.

### 4.3 Cmd+K: pikamuokkaus valinnalle (askel 7)

- **Mitä:** Valitse teksti ja paina Cmd+K. Valinnan kohdalle avautuu pieni kenttä: ohje, suomenkieliset pikavalinnat (”Kielenhuolto – vain virheet”, ”Tiivistä”, ”Selkeytä” ja lajin mukaan ”Näytä, älä kerro” tai ”Selkeytä väite”), omat tallennetut kehotteesi ja käytössä olevan mallin nimi. Enter lähettää, Esc peruu pyynnön. Tulos saapuu ehdotuksina, ja vain valittu alue voi muuttua. ”Tarkenna” jatkaa samasta tuloksesta, ja aiempi yritys säilyy (‹ 2/3 ›) istunnon ajan. Jos vastaus katkesi tai malli kieltäytyi, kenttä kertoo syyn eikä ehdota mitään (5.3). Ilman valintaa Cmd+K käsittelee kohdistimen kappaleen, kunnes 4.13 on tehty.
- **Miksi:** Tämä on päivittäin käytettävä ominaisuus. Se korvaa kolme nykyistä uudelleenkirjoitusta, joista yksi on kuollut (`app.js:3410`). Cmd+K käyttää samaa pyyntökerrosta (5.3) ja samaa ehdotuskerrosta (4.1) kuin Avustaja (5.16), joten ylläpidettävänä ei ole toista rinnakkaista järjestelmää. Juuri rinnakkaisen järjestelmän takia Cursor luopui omastaan (2.1).
- **Missä nähty:** Sudowrite Quick Edit ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/quick-edit/2asL35fds36oHAFJN7bYzz)), VS Code inline chat ([ohje](https://code.visualstudio.com/docs/copilot/chat/inline-chat)), Zed Inline Assistant ([ohje](https://zed.dev/docs/ai/inline-assistant)), Devin Command ([ohje](https://docs.devin.ai/desktop/command/windsurf-overview.md)), Novelcrafterin tekstinkorvaus ([ohje](https://www.novelcrafter.com/help/docs/write/text-replacement-prompts)), Typen muokkaus valintaan koko dokumentti kontekstina ([blogi](https://blog.type.ai/post/type-ai-overview)). Cursorin käyttäjien vastalause viittaa siihen, että paikan päällä tehtävä muokkaus on tärkeä ([foorumi](https://forum.cursor.com/t/cmd-k-has-been-retired-from-terminal/176251)).
- **Miten FAUSTissa:**
  - `src/editor/inlinePrompt.js`: `showTooltip`-kenttä valinnan kohdalla, pelkkää DOMia. Neljä asiaa on tehtävä, jotta kenttä ei riko editoria:
    1. Kumoaminen. `runHistory` (`app.js:902–908`) ohjaa Cmd+Z:n kentän omaan kumoamiseen vain, kun kohdistettu kenttä ei ole `.faust-editor-host`-elementin sisällä. CodeMirror sijoittaa vihje-elementit oletuksena editorin sisään, joten ohjetta kirjoittaessa Cmd+Z kumoaisi käsikirjoitusta. Korjaus: testi muotoon `closest('.cm-content')` tai vihjeet asetuksella `tooltips({ parent: document.body })`.
    2. Tapahtumat. Kentän `keyup`- ja `mouseup`-tapahtumien eteneminen pysäytetään, koska editorin isäntäelementti kutsuu niistä `handleTextSelection`-funktiota (`app.js:5658–5659`, `3108`) ja piirtäisi koko komponentin uudelleen joka näppäimellä.
    3. Kohteen näkyvyys. Kohdealue merkitään `Decoration.mark`-korostuksella niin kauan kuin kenttä on auki, koska selaimen oma valintakorostus katoaa, kun kohdistus siirtyy kenttään (editori ei käytä `drawSelection`-laajennusta). Muuten et näe, mitä tekstiä muokataan.
    4. Esc. Kenttä käsittelee Esc-näppäimen itse ja pysäyttää sen etenemisen. Ikkunatason Esc-käsittelijä (`app.js:590–637`) sulkee muut dialogit tärkeysjärjestyksessä, joten ilman pysäytystä sama painallus sulkisi myös esimerkiksi hakudialogin.
  - `src/services/ai/editRequest.js`, puhdas: järjestelmäteksti projektin kielellä, noin 1 500 merkkiä ennen ja 500 jälkeen vain luettavana kontekstina, ohje ja pyyntö palauttaa vain muokattu teksti `<teksti>`-tagien sisällä. `maskSpans` suojaa merkinnät ja `cleanModelOutput` siivoaa vastauksen (4.2).
  - Teksti suoratoistetaan kenttään ja ero lasketaan kerran lopussa paikallisesti. JSONia, työkalukutsuja tai esitäyttöä ei tarvita, joten rakenteen puolesta mikä tahansa yhdyskäytävän malli käy.
  - Kohdealue pidetään editorin sisällä kartoitettuna alueena. Hiiren vapautuksessa tallennettuja siirtymiä (`app.js:3108–3122`) ei enää käytetä.
  - Toiminnot ovat dataa tiedostossa `src/services/ai/actions.js`, jotta sama lista syöttää pikavalinnat ja oikean painikkeen valikon (4.15), ja projektin tyyppi valitsee oletusjoukon. Omat kehotteet tallennetaan renderöijän asetusvarastoon (ks. 5.3, asetusten paikat).
  - Cmd+K avaa nyt paneelin (`electron.js:528`). Paneeli siirretään yhdistelmään Shift+Cmd+K, joka on vapaa.
- **Työmäärä:** M, kun 4.1 ja pyyntökerros (5.3) ovat olemassa. **Vaikutus:** korkea.
- **Riskit:** Avoimet mallit lisäävät esipuheita tai kirjoittavat enemmän uusiksi kuin pyydettiin. Siivoaja ja diff tekevät sen näkyväksi. Sitä, lopettaako yhdyskäytävä generoinnin peruutuksen jälkeen, ei ole varmistettu.

### 4.4 Kielenhuolto: tekoälyn oikoluku, joka tekee vain korjauksia (askel 8, ehdollinen)

Nimi on ”Kielenhuolto”, koska ”Oikoluku” on jo käytössä järjestelmän oikeinkirjoituksen tarkistukselle (Työkalut → Oikoluku).

- **Mitä:** Työkalut → ”Kielenhuolto: tämä luku”, tai valinnalle Cmd+K:n pikavalinta. Ajo etenee rivierissä, näyttää edistymisen ja sen voi pysäyttää. Korjaukset saapuvat ehdotuksina laskurin kanssa, ja käyt ne läpi näppäimillä. Yksittäisen ehdotuksen kohdalla ”Miksi?” pyytää mallilta yhden virkkeen perustelun juuri sille muutokselle. ”Hyväksy loput” ottaa ensin automaattisen tilannekuvan. Rivit, jotka malli kirjoitti uudelleen korjaamisen sijaan, siirretään sivuun otsikon ”malli kirjoitti uudelleen” alle. Lainausrivit (`>`) ohitetaan oletuksena. Vuorosanat voi ohittaa kokonaan: asetus ohittaa vuorosanaviivalla alkavat rivit ja lainausmerkkien sisällä olevan tekstin, ja se toimii paikallisesti samalla tavalla kuin lainausrivien ohitus. Lopuksi yhteenveto, esimerkiksi ”37 korjausta, 2 riviä ohitettu”.
- **Miksi:** Tämä olisi suurin viikoittainen ajansäästö muokkausvaiheessa, jos jokin yhdyskäytävän malli osaa sen. Sitä ei tiedetä (ks. Riskit). macOS antaa suomen oikeinkirjoituksen, mutta kielioppia ei tarkista mikään. Wordin kielentarkistus ja Copilot kattavat suomen, mutta teksti pitäisi viedä Wordiin ja takaisin. Diffiin perustuva tapa ei vaadi mallilta JSONia.
- **Päätössääntö:** Askel 0 ratkaisee, rakennetaanko tämä nyt. Ehdotus rajaksi, jota voit säätää: jos yksikään kokeiltu malli ei korjaa vähintään puolta istutetuista virheistä niin, että vääriä korjauksia on vähemmän kuin oikeita ja alle viidesosa kappaleista on kirjoitettu uusiksi, 4.4 siirtyy taemmas ja typografia (4.8) sekä Voikko-kokeilu (4.16) tulevat ensin.
- **Missä nähty:** Apple Proofread (macOS 15, 2024–25; nykytila varmistamatta) ([WWDC 2024](https://developer.apple.com/videos/play/wwdc2024/10168/)), DeepL Writen ”Corrections only” ([tuotesivu](https://www.deepl.com/en/write)), Lex Checks ja sen pyydettäessä näytettävä perustelu ([opas](https://lex.page/read/c563b895-d226-40c6-988f-33add2ff1dac)), Draftline AI Studio ([sivu](https://draftline.ink)). Torjuttava virhe: Wordin jäljitetyissä muutoksissa Copilot kirjoitti lukijakommentin mukaan kokonaisia kappaleita uusiksi ([Microsoftin blogi](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/copilot-in-word-new-capabilities-for-document-workflows/4508974)).
- **Miten FAUSTissa:** `src/services/ai/proofreadPass.js`.
  - `splitBlocks` valitsee proosarivit ja `batchParagraphs` jakaa ne eriin mallin ikkunan mukaan. Pyynnöt ajetaan peräkkäin, ja ne voi perua.
  - Rivit lähetetään numeroituina, ja vastaus kohdistetaan numeron mukaan. Yksittäinen kohdistumaton tai liikaa muuttunut rivi (`changeRatio` yli noin 0,3) siirretään sivuun; koko erää ei hylätä yhden rivin takia. Ehdotus ei saa ylittää rivinvaihtoa.
  - Mallin vastaus ajetaan `typography.fi.js`:n läpi ennen `wordDiff`-laskentaa. Mallit palauttavat usein suorat lainausmerkit ja yhdysmerkit merkkien ” ja – tilalle, ja ne näkyisivät diffissä kymmeninä väärän suunnan ”korjauksina” (yleinen kokemus, ei testattu tässä). Siksi typografiamoduuli (4.8) tehdään ensin.
  - `maskSpans` suojaa TODO-merkinnät ja tagit, joten ”Hyväksy kaikki” ei voi poistaa niitä.
  - ”Miksi?” on pieni erillinen pyyntö, joka selittää sen yhden muutoksen yhdellä virkkeellä; JSONia ei tarvita.
  - Tulokset menevät `proposeChanges`-kutsuun.
- **Työmäärä:** M, kun 4.1, 4.2, 4.8 ja 5.3 ovat olemassa. **Vaikutus:** korkea, jos askel 0 antaa luvan.
- **Riskit:** Aineistosta ei löytynyt mittausta minkään mallin suomen oikoluvusta, eikä suomen kielentarkistuksesta tehty yhtään hakua. Lähin näyttö on EuroEvalin hyväksyttävyystehtävä (scala_fi, tilanne 5/2026, monet rivit validointijoukolla): Gemma 4 31B 58, Poro 2 70B 46, muut avoimet mallit 31–38 ([taulukko](https://raw.githubusercontent.com/EuroEval/leaderboards/main/leaderboards/finnish_all.csv)). Se mittaa virheen tunnistamista, ei korjaamista, ja luvut ovat niin matalia, että ne ovat varoitus. Murre ja tahallinen tyyli ”korjataan”: vuorosanojen ohitus toimii paikallisesti, mutta lyhyt ”Tahallista”-kenttä auttaa vain, jos malli noudattaa sitä. Pitkät luvut ovat paikallisilla malleilla hitaita.

### 4.5 Liitä muokkauksina (askel 6)

- **Mitä:** Valitse alkuperäinen kohta ja valitse Muokkaa → ”Liitä muokkauksina”. Leikepöydällä oleva muokattu versio muuttuu sanatason ehdotuksiksi. Liittäessä valitset lähteen, ”kustannustoimittaja” tai ”tekoäly muualla”. Mallikutsua ei tehdä, ja toiminto toimii ilman verkkoa.
- **Miksi:** Cherry Studion omassa keskustelussa tai kustannustoimittajalla käynyt teksti tulee saman tarkistuksen alle. Tämä on myös halvin tapa kokeilla ehdotuskerrosta oikealla tekstillä ilman mallia, jolloin kerroksen viat erottuvat mallin vioista.
- **Missä nähty:** iA Writer ”Paste Edits From” ([ohje](https://ia.net/writer/support/editor/authorship), [taustakirjoitus](https://ia.net/topics/how-to-stay-in-control-of-apples-ai-writing-tools)), Dabble ([julkaisutiedot](https://www.dabblewriter.com/docs/reference/release-notes)).
- **Miten FAUSTissa:** Valikkokohta Muokkaa-valikkoon `electron.js`:ssä. Pääprosessi lukee leikepöydän ja lähettää tekstin nykyisellä `menuAction(action, arg)` -kanavalla (`electron.js:253–256`, käsittelijä `app.js:685`). Renderöijä laskee `wordDiff(valinta, leike)` ja kutsuu `proposeChanges`-funktiota valitsemallasi lähdemerkinnällä, jotta käyttöloki (4.12) erottaa kustannustoimittajan korjaukset muualla tekoälyllä muokatusta tekstistä. `changeRatio` varoittaa, jos leikepöydällä on jokin aivan muu teksti.
- **Näppäin:** Shift+Cmd+V. Se on nyt äänimuokkauksen käytössä (`app.js:640`) ja vapautuu, kun äänimuokkaus poistetaan samassa askeleessa. Jos päätät säilyttää äänimuokkauksen (luku 6, Päätettävää), toiminto jää valikkoon ilman näppäintä.
- **Työmäärä:** S. **Vaikutus:** keskisuuri–korkea.

### 4.6 Kontekstin kokoaja ja ”Mitä malli näkee” -rivi (pienin versio askel 3, täysi askel 9)

- **Mitä:** Yksi funktio kokoaa jokaisen tekoälytoiminnon järjestelmätekstin ja viestit. Toiminnon alla on rivi, esimerkiksi ”Lähetetään: valinta 600 · ympäröivä teksti 2 000 · tyyliohje 300 · tiivistelmät 1–7 1 200”. Osat voi ottaa pois, ja ”Näytä kehote” näyttää tarkan tekstin. Mallikohtainen ikkunan koko on asetus. Kun budjetti ylittyy, osat pudotetaan kiinteässä, näkyvässä järjestyksessä ja valinta viimeisenä. Vastauksen kieli tulee yhdestä säännöstä (`project.language`).
- **Mitä ei lähetetä:** Luvun voi merkitä ”Ei tekoälylle”: valintaruutu Inspectorin Luku-välilehdellä, kenttä `chapter.noAI`. Kokoaja ei lähetä tällaisen luvun tekstiä eikä tiivistelmää, eivätkä tekoälytoiminnot käynnisty siinä. Vain luettavasta kontekstista `[TODO: …]`-merkinnät jätetään pois. Muokattavalla alueella TODO-merkinnät ja `<u>`-tagit ovat suojattuja: ne korvataan ennen lähetystä paikkamerkillä ja palautetaan ennen diffin laskemista; jos paikkamerkki puuttuu vastauksesta, merkintä palautetaan alkuperäiseen kohtaansa eikä siitä synny poistoehdotusta (4.2).
- **Vaiheet:** Pienin versio pyyntökerroksen kanssa (askel 3): valinta, naapurikappaleet, kieli, tyyliohje ja `chapter.noAI`. Täysi versio, kun tiivistelmät ja Tarinakansion siivu A ovat olemassa (askel 9).
- **Miksi:** Nyt noin tusina kutsupaikkaa kokoaa kehotteensa käsin eri kielillä. Osa lähettää tekstiä ilman rajaa: juonilankojen tunnistus lähettää koko käsikirjoituksen yhdessä pyynnössä.
- **Missä nähty:** Novelcrafter Prompt Preview ([ohje](https://www.novelcrafter.com/help/docs/prompts/prompt-preview)), NovelAI Context Viewer ([ohje](https://docs.novelai.net/en/text/editor/advancedsettings)), Sudowriten pudotusjärjestys ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/chapter-continuity/4KL8gFeLZQ6GSBjDWtSbV6)), Mediachance Prompt Log ([sivu](https://www.mediachance.com/editorial)), Obsidian Copilot ([ohje](https://docs.obsidiancopilot.com/context-and-mentions/)), Lexin token-mittari (10/2024, [uutiskirje](https://buttondown.com/lex/archive/new-in-lex-import-files-ask-lex-subtle-redesign)).
- **Miten FAUSTissa:** `src/services/ai/contextBuilder.js`, puhdas ja testattu: `buildContext({task, project, chapterId, cursor, selection, budget})` palauttaa `{system, messages, parts[]}`. Tokenarvion lähtöarvo on merkit jaettuna kolmella, ja se tarkentuu mallikohtaisesti palvelimen ilmoittamista luvuista (ks. Riskit). Vastauksen tokenit varataan budjetista, koska suuri vastausraja syö kehotetilaa ([text-generation-webui](https://github.com/oobabooga/text-generation-webui/wiki/03-%E2%80%90-Parameters-Tab)). Pysyvä aines tulee ensin ja muuttuva loppuun, jotta paikallinen palvelin voi käyttää käsitellyn alun uudelleen ([KoboldCpp](https://github.com/LostRuins/koboldcpp/wiki)). Leikkaukset tehdään rivirajoista.
- **Työmäärä:** M; pienin versio S. **Vaikutus:** korkea.
- **Riskit:** Tarkkaa tokenlaskentaa ei voi olettaa: Ollaman Anthropic-päätepisteessä sitä ei ole ([ohje](https://docs.ollama.com/api/anthropic-compatibility)), eikä Cherry Studion käyttäytymistä ole varmistettu. Liian pitkä kehote voidaan katkaista hiljaa. Tarkistuskierroksella löytyi useita vuoden 2026 käyttäjäkirjoituksia, joiden mukaan Ollama katkaisee ylipitkän kehotteen ilmoittamatta ja palauttaa onnistuneen vastauksen; nämä ovat yhteisön raportteja, eivät valmistajan dokumentaatiota, eikä linkkejä tallennettu. Jos näin käy, rivi näyttäisi kontekstia, jota malli ei nähnyt. Siksi kokoajan kutsuja vertaa jokaisen vastauksen jälkeen palvelimen `usage.input_tokens`-arvoa omaan arvioonsa. Jos palvelimen luku on selvästi pienempi tai pysyy kiinteässä katossa, näytetään ”malli ei nähnyt koko kehotetta” ja muokkaustehtävän tulos hylätään. Samoista luvuista kalibroidaan merkkiä per token mallikohtaisesti; kiinteä jako kolmella ei ole suomelle todettu luku, vaan se riippuu mallin tokenisoijasta. Kirjoittajat ovat pyytäneet kontekstin näkyvyyttä, mutta sen vaikutusta tuloksiin ei ole tutkimuksissa testattu.

### 4.7 Kirjan ydin, Tyyliohje ja vältettävien sanojen lista (kentät askel 3, korostus askel 9)

- **Mitä:** Projektin asetuksiin kaksi tavallista tekstikenttää. ”Kirjan ydin” kertoo premissin tai tietokirjassa aiheen ja väitteen, aikamuodon ja näkökulman. ”Tyyliohje” sisältää säännöt, asiat joita ei koskaan tehdä ja yhden tai kaksi näytettä omasta proosastasi. Lisäksi oma lista vältettävistä sanoista, jotka korostetaan käsikirjoituksessa. Kentät lähtevät jokaiseen proosa- ja muokkaustehtävään.
- **Miksi:** Pieni työ. Vaikutus ääneen on tutkimuksen mukaan epävarma, mutta kentät antavat säännöille näkyvän, muokattavan paikan ja korvaavat englanninkieliset piilokehotteet ja muistilokin. Suomenkielinen sanalista on joka tapauksessa koottava itse, koska julkiset listat ovat englanninkielisiä.
- **Missä nähty:** Lex Style Guides ([opas](https://lex.page/read/3492a59e-ea19-4733-964a-3adc25b5f3e0)), NovelAI Memory ja Author's Note ([ohje](https://docs.novelai.net/en/text/editor/storysettings)), Cursorin säännöt ([ohje](https://cursor.com/docs/rules)), Devin Desktop ([FAQ](https://docs.devin.ai/desktop/devin-desktop-faq.md)), Novelcrafterin AI-isms ([FAQ](https://www.novelcrafter.com/help/faq/ai-and-prompting/ai-isms)).
- **Miten FAUSTissa:** Kentät `project.brief`, `project.style` ja `project.avoidWords[]` projektin asetusdialogiin (`app.js:10256–10514`). Kontekstin kokoaja lukee ne. Korostus tehdään samaan tapaan kuin `todoPlugin` (`FaustEditor.js:109–112`), mutta lista on muuttuva, joten se tarvitsee uudelleenkonfiguroitavan laajennuksen. Osuma lasketaan sanan alusta `textTools.js`:n `buildSearchPattern`-funktiolla (4.2), jotta taivutetut muodot löytyvät; tätä ei ole testattu.
- **Työmäärä:** S; korostus S–M. **Vaikutus:** keskisuuri; edellytys kontekstin kokoajalle.
- **Riskit:** Lukijat eivät tutkimuksessa erottaneet personoitua tekstiä personoimattomasta ([tutkimus](https://arxiv.org/html/2411.13032v1)). Authors Guild neuvoo olemaan jäljittelemättä nimettyjä kirjoittajia ([ohje](https://authorsguild.org/resource/ai-best-practices-for-authors/)), joten kenttä on omia sääntöjä ja omia näytteitä varten.

### 4.8 Suomen typografia: älykäs kirjoitus ja deterministinen tarkistin (askel 8, ennen kielenhuoltoa)

- **Mitä, kirjoittaessa:** `"` muuttuu merkiksi ” ja `--` merkiksi –. Rivin alussa `--` muuttuu vuorosanaviivaksi (– ja väli). Yksittäinen `- ` rivin alussa jää luetteloksi. Projektikohtainen asetus ”Rivin alun viiva: luettelo / vuorosanaviiva” saa oletuksensa kirjan tyypistä. Yksi kytkin ottaa älykkään kirjoituksen pois.
- **Mitä, tarkistin:** ”Tarkista typografia” listaa suorat lainausmerkit, yhdysmerkit ajatusviivan paikalla, väärät välit viivan ympärillä, puuttuvan välin ennen %-merkkiä sekä päiväysten ja kellonaikojen muodot. Korjaukset tehdään yksi kerrallaan tai kaikki ehdotuskerroksen kautta. Rivin alun `- ` -rivit tarkistin näyttää kysymyksenä ”luettelo vai vuorosana?” ja tarjoaa lukukohtaisen ”muunna kaikki” -toiminnon ehdotuskerroksen kautta; se ei koskaan korjaa niitä itse. Jokainen sääntö linkittää Kielitoimiston ohjepankin sivulle.
- **Ensin tunnin kokeilu:** Electron 30 tarjoaa macOS:n valikkoroolit `toggleSmartQuotes`, `toggleSmartDashes`, `toggleTextReplacement` ja `showSubstitutions` (`node_modules/electron/electron.d.ts:19462–19470`). Kokeile niitä suomenkielisessä järjestelmässä: toimivatko ne CodeMirrorin sisältöelementissä, ja tuleeko suomessa merkki ”. Tätä ei ole testattu. Päätä sitten jompikumpi: järjestelmän korvaus lainausmerkeille ja viivoille ja oma käsittelijä vain rivin alun vuorosanaviivalle, tai oma käsittelijä kaikelle ja järjestelmän roolit tarkoituksella pois. Molempia ei pidetä päällä, koska ne muuntaisivat kahdesti. Tarkistin ei riipu tästä valinnasta.
- **Miksi:** Toimii ilman verkkoa ja ilman mallia, ja sitä käytetään joka kirjoituspäivä. Nyt merkit saa vain valikosta Lisää → Erikoismerkki (`electron.js:509–518`). Aineistosta ei löytynyt tuotetta, joka tarkistaa vuorosanaviivan tai ajatusviivan; Wordin ja Lingsoftin suomen sääntöjä ei päästy tarkistamaan, ja Voikossa on kaksi lainausmerkkisääntöä ([sääntökoodit](https://raw.githubusercontent.com/voikko/corevoikko/master/libvoikko/src/grammar/error.hpp)). Lisäksi kielenhuolto (4.4) tarvitsee tämän moduulin.
- **Nykyinen vika, jonka tämä tuo näkyviin:** rivin alun `- ` on FAUSTissa luettelomerkintä (`src/editor/textTools.js:129`, `utils/manuscript.js:103`, luettelon jatko Enterillä `FaustEditor.js:114`). Vuorosana, joka on kirjoitettu muodossa `- Hei, sanoi Pekka.`, viedään siksi jo nyt luettelokohtana.
- **Missä nähty:** Tiptapin Typography-laajennus näyttää sääntökohtaisen tavan, mutta sen oletukset ovat englannin ([ohje](https://tiptap.dev/docs/editor/extensions/functionality/typography)). Word muuntaa heittomerkin automaattisesti suomalaiseksi puolilainausmerkiksi ([Kielitoimisto](https://kielitoimistonohjepankki.fi/ohje/puolilainausmerkki/)). Säännöt: lainausmerkit ([ohje](https://www.kielitoimistonohjepankki.fi/ohje/lainausmerkit/)), ajatusviiva ([ohje](https://kielitoimistonohjepankki.fi/ohje/ajatusviiva/)), vuorosanaviiva ([ohje](https://kielitoimistonohjepankki.fi/ohje/lainausmerkit-ja-vuorosanaviiva/)), prosentti ([ohje](https://kielitoimistonohjepankki.fi/ohje/prosentti/)), päiväys ([ohje](https://kielitoimistonohjepankki.fi/ohje/ajanilmaukset-paivays-ja-vuosiluku/)), kellonajat ([ohje](https://kielitoimistonohjepankki.fi/ohje/ajanilmaukset-kellonajat-merkinta-ja-taivutus/)).
- **Miten FAUSTissa:** `src/editor/typography.fi.js`, puhdas ja testattu kuten `textTools.js`; testeihin luettelon ja vuorosanaviivan törmäystapaukset. CodeMirrorin syötekäsittelijä `FaustEditor.js`:ään kokeilun tuloksen mukaan. Linkit avataan nykyisellä `electronAPI.openExternal`-kutsulla. Ohjepankin tekstiä ei kopioida, koska lisenssi on CC BY-NC-ND 4.0.
- **Työmäärä:** S–M. **Vaikutus:** keskisuuri–korkea.
- **Riskit:** Rivin alun viiva törmää luetteloihin, joita tietokirjassa on paljon; siksi yllä oleva sääntö, asetus ja kysymys. Muunnos ei saa koskea `<u>`-tageihin tai `[TODO:]`-merkintöihin, ja sen on oltava yksi kumoaskel. Vuorosanatyylin yhtenäisyys on talon tapa, ei normi.

### 4.9 Tarkistus: nimetyt tarkistukset ja lainaukseen ankkuroidut havainnot (siivut 1–2 askel 10, siivu 3 askel 12, siivu 4 myöhemmin)

- **Mitä:** Oma ”Tarkistus”-välilehti erillään kirjoittamisesta. Valitset yhden tarkistuksen ja laajuuden (valinta tai luku). Havainnot näkyvät listana ja korostuksina; napsautus hyppää kohtaan. Toimitetaan siivuina:
  1. Listapaneeli, oma korostuskenttä ja hyppy. Paikalliset tarkistukset ilman mallia: vältettävät sanat, sitten pitkät virkkeet. ”Tarkista typografia” (4.8) ja ”Kielenhuolto” (4.4) saavat täältä toisen käynnistyspaikan, ja typografian kysymykset näkyvät tässä listassa. Tilat Avoin, Tehty ja Eri mieltä.
  2. Mallitarkistukset, yksi ohje kerrallaan. Kaunokirjassa täytesanat, kliseet ja dialogi; tietokirjassa ”väite ilman lähdettä”, ”termin vaihtelu” ja ”kappaleen pääasia”; lisäksi oma tarkistus. Mallin on lainattava kohta sanatarkasti, ja FAUST etsii lainauksen tekstistä. Jos sitä ei löydy, havainto näytetään merkinnällä ”sijaintia ei löytynyt” eikä sitä pudoteta. Tila Virheellinen tulee mukaan. ”Tahallista / huomioi” -kenttä lähtee ajon mukana. ”Näytä ehdotus” avaa muokkauksen ehdotuskerroksessa. Epäonnistunut kutsu näytetään epäonnistuneena.
  3. Jatkuvuus Tarinakansiota ja aiempia tiivistelmiä vasten, molemmat kohdat lainattuina (5.11).
  4. Luvun lukupalaute viimeisenä: mikä toimii ja huolet vakavuuden mukaan.
- **Miksi:** Muokkausvaihe on se, jossa kirja pysähtyy. Suomesta on näyttöä vain ymmärtämistehtävistä; proosan tuottamisesta sitä ei ole, joten lukutehtävät ovat avoimille malleille turvallisempi veto. Tämä korvaa kolme työkalupalkin analyysia, molemmat johdonmukaisuuspainikkeet ja annotaatiomarginaalin.
- **Missä nähty:** Lex Checks ([opas](https://lex.page/read/c563b895-d226-40c6-988f-33add2ff1dac)), Sudowrite Feedback ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/feedback/7Ew1KgpEwabQSgvijq8QNr)), ProWritingAidin tekstisijainnit ([ohje](https://help.prowritingaid.com/article/390-how-to-use-the-text-location-function)), tilat ([ohje](https://help.prowritingaid.com/article/382-how-to-change-the-status-of-feedback-in-manuscript-analysis)) ja ennakkotiedot ([ohje](https://help.prowritingaid.com/article/422-how-to-fine-tune-your-feedback-in-manuscript-analysis)), Ulysses ([ohje](https://help.ulysses.app/en_US/the-dashboard/grammar-and-style-check)), Hemingway ([ohje](https://hemingwayapp.com/help/docs/highlighted-issues)), Ellipsus ([blogi](https://ellipsus.com/blog/introducing-ellipsus-plus)).
- **Miten FAUSTissa:** `src/services/ai/reviewPass.js` pyytää rivimuotoa (`LAINAUS:` / `HUOMIO:` / `EHDOTUS:`) eikä JSONia, ja jäsennin on suvaitseva. `locateQuote` etsii kohdan; mallin ilmoittamiin sijainteihin ei luoteta koskaan. Havainnot tallennetaan lukuun lainauksineen ja ankkuroidaan uudelleen latauksessa. Korostuksille tehdään oma `StateField`, koska `setHighlights` korvaa hakukorostukset. Hyppy käyttää nykyistä `scrollToPos`-toimintoa. Tarkistukset ovat dataa, yksi ohje kukin, ja projektin tyyppi valitsee oletusjoukon. Paneeli on oma komponenttitiedostonsa `src/components/ReviewPanel.js`.
- **Työmäärä:** L siivuina; siivut 1 ja 2 kumpikin M. **Vaikutus:** korkea.
- **Riskit:** Vertailukelpoisten työkalujen ulkopuolisissa arvosteluissa on raportoitu asiavirheitä ja paisuteltua kehua ([The Write Practice](https://thewritepractice.com/prowritingaid-review-manuscript-analysis-and-virtual-beta-reader/)); tila Virheellinen on vastaus siihen. Lainauksen haku epäonnistuu, kun malli mukailee tekstiä. Numeerista pistemäärää ei näytetä.

### 4.10 Tarinakansio: käsin muokattava, yksi lista ja yksi lomake (siivu A askel 9, siivu B askel 12)

- **Mitä:** Sivupalkkiin osio ”Tarinakansio”, tietokirjaprojektissa ”Kirjan kansio”. Merkintätyypit ovat kaunokirjassa hahmo, paikka, esine, käsite ja juonilanka; tietokirjassa termi, henkilö ja lähde. Kentät: nimi, aliakset ja sanavartalot, kuvaus jonka tekoäly lukee, omat muistiinpanot joita ei lähetetä koskaan, ja tila: Aina mukana / Kun mainitaan (oletus) / Vain käsin / Ei koskaan.
  - Siivu A: lista, yksi lomake, neljä tilaa ja siirto vanhoista tiedoista. Ei mainintojen tunnistusta, joten ”Kun mainitaan” toimii vielä kuten ”Vain käsin”, ja lomake sanoo sen. Pelkkää tietojen syöttöä; mallia ei tarvita.
  - Siivu B: mainintojen tunnistus, alleviivaus ja laskurit.
- **Miksi:** Faktat voi jo kirjoittaa käsin Tutkimuskansioon, mutta mitään sieltä ei lähetetä mallille. Hahmoilla, paikoilla ja juonilangoilla ei ole toimivaa käsin muokattavaa lomaketta: paikka- ja lankalomakkeet kaatuvat, ja hahmoja voi luoda vain tekoälyllä. Kontekstin kokoajalla ei siis ole luotettavaa luettavaa ennen tätä.
- **Suhde Tutkimuskansioon:** Tutkimuskansio jää ennalleen aineistoksi, jota ei koskaan lähetetä mallille (muistiinpanot, linkit, tiedostot; `project.research[]`). Tarinakansio on ainoa varasto, jota mallit lukevat. Tutkimusmuistiinpanoon tulee toiminto ”Kopioi Tarinakansioon”, joka luo merkinnän tilassa ”Ei koskaan”, kunnes muutat sen. Näin omat faktasi eivät päädy mallille huomaamatta eivätkä jää kahteen paikkaan sattumalta.
- **Missä nähty:** Novelcrafter Codex ([FAQ](https://www.novelcrafter.com/help/faq/ai-and-prompting/codex-context-in-prompting), [rakenne](https://www.novelcrafter.com/help/docs/codex/anatomy-codex-entry)), Sudowriten näkyvyysasetukset ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/visibility-settings/4KL8gFeLZP6ep8keUhKVGp)), NovelAI Lorebook ([ohje](https://docs.novelai.net/en/text/lorebook)), SillyTavern World Info ([ohje](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)).
- **Miten FAUSTissa:** `src/services/story/codex.js`, puhdas ja testattu: `matchEntries(text, entries)` ja `selectForContext(...)`. Tiedot kenttään `project.codex[]`. Siirto kahdesta hahmomuodosta, kahdesta paikkavarastosta ja juonilangoista; Tutkimuskansiota ei siirretä, ja vanhat kentät säilyvät projektitiedostossa (luku 6). Yksi yleinen lomake korvaa hahmonäkymän sekä paikka- ja lankalomakkeet; se on oma komponenttitiedostonsa `src/components/CodexPanel.js`. Siivussa B osuma lasketaan antamistasi vartaloista ja aliaksista `textTools.js`:n `buildSearchPattern`-funktiolla (4.2), ja poissulkulista estää väärät osumat. ”Mari” osuu muotoihin Maria ja Marian; astevaihtelu (Pekka, Pekan) tarvitsee aliaksen. Lomake näyttää mainintojen määrän, jolloin näet, toimiiko osuma.
- **Työmäärä:** siivu A M; siivu B M–L. **Vaikutus:** korkea.
- **Riskit:** Se, että tarkka nimiosuma epäonnistuu suomen taivutuksessa, on päätelmä, jota mikään lähde ei testannut. Novelcrafterin muutosloki näyttää toistuvia osumakorjauksia jopa englannille ([muutosloki](https://www.novelcrafter.com/changelog/)). Voikon sanasto on GPL 2+; se rajoittaa jakelua, ei omaa käyttöä. Lisenssi tarkistetaan vasta, jos sovellusta jaetaan ([README](https://raw.githubusercontent.com/voikko/corevoikko/master/voikko-fi/README.md)). Voikko-kokeilu (4.16) kertoo ennen siivua B, löytyvätkö taivutetut nimet perusmuodoilla paremmin kuin itse annetuilla vartaloilla.

### 4.11 Malli tehtävittäin ja ”Kokeile toisella mallilla” (askel 7)

- **Mitä:** Kolme valitsinta, jotka täytetään yhdyskäytävän mallilistasta: Proosa, Muokkaus ja Analyysi. Pikamuokkauksen tuloksessa on ”Kokeile toisella mallilla”, joka ajaa saman ohjeen peräkkäin toisella mallilla.
- **Miksi:** Aineistosta ei löytynyt mittausta avointen mallien suomenkielisestä proosasta tai oikoluvusta; suomen osuudesta ei tehty yhtään hakua. Vertailu omalla kappaleellasi on ainoa näyttö, jonka saat.
- **Missä nähty:** Zedin ominaisuuskohtaiset mallit ja usean mallin vaihtoehdot ([ohje](https://zed.dev/docs/ai/inline-assistant)), Novelcrafterin pikamallivalinta generoinnin yhteydessä ([ohje](https://www.novelcrafter.com/help/docs/write/generating-prose)).
- **Miten FAUSTissa:** Kolme valitsinta laajentavat nykyistä mallivalitsinta (`src/components/AIProviderSettings.js`: lähde, osoite, avain, ”Hae mallit”, ”Testaa yhteys”), ja siksi työ on pieni. Tunnisteet talletetaan samaan `config.json`-asetukseen, jossa `CHERRY_MODEL` on nyt, kanavan `ai:set-provider` kautta (`electron.js:892–902`). `createCherryClient` päästää jo läpi tunnisteet, joissa on kaksoispiste (`electron.js:128–134`). `aiClient` ottaa mallin kutsukohtaisesti.
- **Lähtökohta kokeilulle:** Gemma 4 31B -luokan malli; Poro 2:n ikkuna on 8 192 tokenia ([EuroEval](https://raw.githubusercontent.com/EuroEval/leaderboards/main/leaderboards/finnish_all.csv), [Poro 2](https://huggingface.co/LumiOpen/Llama-Poro-2-70B-Instruct)). Tämä ei ole suositus: näyttö koskee ymmärtämistehtäviä ([FIN-bench-v2](https://arxiv.org/html/2512.13330)). Askeleen 0 koeaineisto säilytetään ja ajetaan uudelleen aina, kun vaihdat mallia.
- **Työmäärä:** S. **Vaikutus:** keskisuuri; korkea mallien arvioinnissa.

### 4.12 Tekoälyn käyttöloki (askel 5)

- **Mitä:** Rivi kirjoitetaan, kun ehdotus hyväksytään tai hylätään: päivä, toiminto, ohje, malli, lähde (FAUSTin pyyntö, kustannustoimittaja tai tekoäly muualla), hyväksytty vai hylätty ja hyväksytyt merkit luvuittain. Tokenmäärät kirjataan, jos yhdyskäytävä palauttaa ne; muuten kenttä jää tyhjäksi. Lokin voi viedä tekstinä. Loki kattaa käytön vasta käyttöönotostaan alkaen, ja viennin alkuun tulee tämä päivämäärä.
- **Miksi:** Antaa pohjan vastata rehellisesti kustantajan kysymykseen tekoälyn käytöstä käyttöönotosta eteenpäin ([WSOY](https://www.wsoy.fi/haluatko-kirjailijaksi/), [Siltala](https://siltala.fi/sivu/haluatko-kirjailijaksi/)). Aiempi käyttö, myös vanhat generointitoiminnot, ei ole lokissa. Korvaa dollarimääräisen kustannusseurannan.
- **Missä nähty:** Mediachance Prompt Log ([sivu](https://www.mediachance.com/editorial)), Dabble ([ohje](https://www.dabblewriter.com/docs/reference/certificate-of-authorship/)), iA Writer ([ohje](https://ia.net/writer/support/editor/authorship)), Revise ([ohje](https://revise.io/help/ai-reviewing-changes.md)).
- **Miten FAUSTissa:** `project.aiLog`, johon ehdotuskerroksen hyväksyntä- ja hylkäyspolku ja pyyntökerros lisäävät rivin. Yksittäisestä muutoksesta talletetaan ennen- ja jälkeen-teksti, koska ne ovat lyhyitä. ”Hyväksy kaikki” tallettaa määrät ja viittauksen automaattiseen tilannekuvaan, jotta 30 sekunnin välein kirjoitettava tiedosto ei paisu.
- **Työmäärä:** S. **Vaikutus:** keskisuuri.

### 4.13 Kirjoita kohdistimeen, pieni ja vaiheistettu (askel 13)

- **Mitä:** Kun mitään ei ole valittu, Cmd+K avaa kentän ”Mitä seuraavaksi?”, tietokirjassa ”Mitä tässä kappaleessa sanotaan?”. Yhden virkkeen suunta on valinnainen. Teksti suoratoistetaan odottavaan lohkoon kohdistimen kohdalle. Pysäytys säilyttää saapuneen tekstin kokonaiseen virkkeeseen leikattuna. Sitten Hyväksy / Uusi yritys / Hylkää, ja aiemmat yritykset säilyvät istunnon ajan. Oletuspituus on kappale. Lohko ei koskaan korvaa lukua.
- **Miksi:** Päätehtävä on korvata Hybrid-dialogin turvattomat polut. Ominaisuus pidetään myöhäisenä ja valinnaisena: yhdessä tutkimuksessa (GPT-3.5, 2023) kokonaisesta generoidusta luonnoksesta säilyi vähän ([tutkimus](https://ar5iv.labs.arxiv.org/html/2309.12570)); lyhyitä ehdotuksia hyväksyttiin toisessa tutkimuksessa paljon ([CoAuthor](https://ar5iv.labs.arxiv.org/html/2201.06796); joukkoistetut kirjoittajat, vuoden 2021 malli). Se puoltaa kappaleen kokoista oletusta. Suomen proosan laatua ei ole mitattu.
- **Missä nähty:** Novelcrafter ([ohje](https://www.novelcrafter.com/help/docs/write/generating-prose), [FAQ](https://www.novelcrafter.com/help/faq/ai-and-prompting/how-can-i-stop-prose-generation)), Sudowrite Write ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/write/pvxUvbQqYybfEosqx1sXjY)), NovelAI ([ohje](https://docs.novelai.net/en/text/editor/)), DreamGen ([ohje](https://v2.dreamgen.com/docs/how-to-write-story)).
- **Miten FAUSTissa:** Pelkän lisäyksen sisältävä ehdotus, joka piirretään lohkoelementtinä ja jota tilatehoste päivittää suoratoiston aikana. `trimToSentence` leikkaa pysäytetyn tekstin. Konteksti: teksti ennen kohdistinta budjetin rajoissa, lyhyt häntä sen jälkeen ja luvun tiivistelmä.
- **Työmäärä:** M, kun 4.1 ja 5.3 ovat olemassa. **Vaikutus:** keskisuuri.

### 4.14 Scrivener-reitti: kansion tuonti ja tuonnin esikatselu (askel 2)

- **Mitä:** ”Tuo kansio” tuo kansion .txt-, .md- ja .docx-tiedostot luvuiksi, yksi luku tiedostoa kohti, numerot huomioivassa järjestyksessä (2 ennen 10:tä). Otsikosta poistetaan alun järjestysnumero ja lopun `[n]`-tunniste. Esikatselu näyttää järjestyksen, otsikot ja sanamäärät, ja järjestystä voi muuttaa siinä. Sama esikatselu tulee yksittäisen tiedoston tuontiin. Alikansioita ei lueta ensimmäisessä versiossa; esikatselu kertoo, jos niitä löytyi. FAUST ei kirjoita kansioon takaisin.
- **Ohje sinulle:** Valitse Scrivenerin synkronointiasetuksista muodoksi pelkkä teksti ja ota tiedostonimien numerointi käyttöön. Toinen, jo toimiva reitti on Scrivenerin Compile → .docx → ”Tuo tekstiä” ([Scrivenerin yleiskuva](https://www.literatureandlatte.com/scrivener/overview)).
- **Selvitys samassa askeleessa (puoli päivää, yhden projektin kopiolla):** saako synopsikset mukaan, joko Compile-muodolla, joka sisältää ne, tai lukemalla synopsis-tekstitiedostot, ja kirjoitettua luvun tiivistelmäkenttään (5.8). Scrivenerin synopsis vastaa suoraan tiivistelmää, josta 5.8 tekee kirjan muistin, ja se täyttäisi kentän omalla tekstilläsi ilman mallia. Tarkistuskierroksen mukaan foorumilistauksissa Scrivener 3 -projektin kohdekansiossa näkyy `synopsis.txt` tiedoston `content.rtf` vieressä; tämä on epävirallinen tieto, ei määrittely.
- **Miksi:** Sinulla on paljon Scrivener-projekteja. Ehdotuskerrosta ja kielenhuoltoa pitää kokeilla oikealla käsikirjoituksella, joten tuonti tehdään heti turvakorjausten jälkeen.
- **Missä nähty:** Yhtiön nimissä annetun foorumivastauksen mukaan Scrivenerin projektimuoto on helppo jäsentää, mutta omatekoista käyttöä ei tueta, ja tuettu reitti on ”Sync with External Folder” ([foorumi](https://forum.literatureandlatte.com/t/adding-ai-tools-to-scrivener/133222?page=19); vastaajan henkilökunta-asema on päätelty sanamuodosta). PlotForge Desktop listaa Scrivener-tuonnin ([hakemistosivu](https://alternativeto.net/software/plotforge-desktop/about/)).
- **Synkronointikansion muoto (varmistamatta):** Tarkistuskierroksen foorumihaun mukaan synkronointi kirjoittaa RTF- tai tekstitiedostoja, nimen lopussa on hakasulkutunniste (esimerkiksi `nimi [10].ext`), jota ei saa muuttaa, valinnainen numeroetuliite antaa järjestyksen eikä sitä täytetä nollilla, ja sisäkkäiset kansiot litistetään. Nämä ovat käyttäjäraportteja, joista yksi lainaa Scrivenerin käsikirjaa; ne eivät ole aineistossa eikä linkkejä tallennettu. RTF-synkronointi ei toisi mitään, koska tuonti lukee vain .txt-, .md- ja .docx-tiedostoja. Varmista ensimmäisellä projektilla.
- **Miten FAUSTissa:** Uusi käsittelijä nykyisen `import-document`-käsittelijän viereen (`electron.js:841–860`): kansion valinta, lajittelu `localeCompare`-vertailulla (`numeric: true`) ja `manuscript.importDocument(buffer, fileName)` tiedosto kerrallaan. Funktio on jo tiedostokohtainen ja lukee myös .docx-tiedostot (`utils/manuscript.js:912–923`). `splitIntoChapters` saa valinnan `{ oneChapterPerFile: true }` testeineen. Ilman sitä nykyinen kirjan nimen päättely (`utils/manuscript.js:701–713`) tulkitsee tiedoston, jossa on yksi ylätason otsikko ja vähintään kaksi alaotsikkoa, muotoon ”kirjan nimi + luvut”: kohtausotsikoita sisältävä lukutiedosto menettäisi otsikkonsa ja hajoaisi useaksi luvuksi. Luvun otsikko tulee ylimmästä otsikosta tai tiedostonimestä. Esikatselu näytetään ennen kuin `app.js`:n tuonti (`1583–1608`) kirjoittaa projektiin, ja tuontia ennen otetaan tilannekuva.
- **Työmäärä:** S–M ja selvitys puoli päivää. **Vaikutus:** keskisuuri–korkea sinulle.
- **Riskit:** Synkronointikansion muoto ja nimet on kuvattu vain käyttäjäraporttien varassa; se selviää ensimmäisellä projektilla.

### 4.15 Hiiren oikean painikkeen ”Tekoäly”-alivalikko (askel 7)

- **Mitä:** Samat toiminnot kuin Cmd+K:n pikavalinnoissa näkyvät oikean painikkeen valikossa, kun käsikirjoituksessa on valittu tekstiä. Kelluvaa valikkoa, joka ilmestyy jokaisella hiiren vapautuksella, ei tehdä oletukseksi.
- **Miksi:** Kirjassa tekstiä valitaan jatkuvasti leikkaamista ja siirtämistä varten. Joka kerta ilmestyvä valikko kytkettäisiin pois päivässä.
- **Missä nähty:** NovelAI Writer's Toolbox avautuu kontekstivalikosta ([ohje](https://docs.novelai.net/en/text/editor/writerstoolbox)). Sudowriten valintavalikko ilmestyy, kun tekstiä on valittu ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/selection-menu/of43eZdiHYoyCtrofDerCZ)). Sudowrite joutui itse siirtämään valikon hiiren vapautukseen, koska se peitti tekstiä (14.8.2026, [muutosloki](https://feedback.sudowrite.com/changelog/improved-draft-estimates-plus-a-bunch-of-fixes)). Tätä osaa ei kopioida.
- **Miten FAUSTissa:** Pääprosessi ei tiedä, missä kentässä oikeaa painiketta painettiin: `attachContextMenu` (`electron.js:299–340`) näkee muokattavuuden ja valitun tekstin mille tahansa kentälle, myös luvun muistiinpanoille, hakukentälle ja keskustelun syötteelle. Ilman lisätietoa alivalikko ilmestyisi niissäkin ja toimisi sen mukaan, mitä käsikirjoituksessa sattuu olemaan valittuna. Siksi renderöijä kuuntelee `contextmenu`-tapahtumaa `.faust-editor-host`-elementissä ja kertoo pääprosessille yhdellä IPC-viestillä (`hasSelection`) ennen valikon rakentamista. Alivalikko lisätään vain, kun lippu on asetettu. Napsautus lähettää `menuAction('ai-action', id)`, ja renderöijän `menuHandlerRef` (`app.js:685`) lukee editorin valinnan uudelleen, ei tee mitään jos se on tyhjä, ja avaa muuten pikamuokkauksen valmiilla ohjeella.
- **Työmäärä:** S johdotuksineen, kun 4.3 on olemassa. **Vaikutus:** keskisuuri.

### 4.16 Voikko-kokeilu: suomen perusmuodot ja kielioppi ilman mallia (askel 8, puoli päivää)

- **Mitä:** Kutsu koneelle asennettua Voikkoa pääprosessista valinnaisena riippuvuutena, jota ei paketoida sovellukseen. Kokeile yhdellä oikealla luvulla kahta asiaa: (a) oikeinkirjoitus- ja kielioppihavainnot ehdotuskerroksen kautta ja (b) perusmuodot nimien osumiin verrattuna itse antamiisi vartaloihin.
- **Miksi:** Voikko on aineiston ainoa deterministinen, verkotta toimiva suomen moottori: oikeinkirjoitus, kielioppi, tavutus ja perusmuotoistus. Se voisi vastata kolmeen avoimeen kohtaan: taivutettujen nimien osumat (4.10), toiston tarkistus (4.17) ja vaatimus toimia verkotta. Jos askel 0 ei anna lupaa kielenhuollolle (4.4), tämä on sen varasuunnitelma.
- **Missä nähty:** Voikko, libvoikko 4.3.3 (5/2025) ja sanasto 2.6 (4/2026) ([sivu](https://voikko.puimula.org/), [julkaisut](https://voikko.puimula.org/releases.html)). Homebrew-kaava 4.3.3, valmiit paketit Apple Siliconille ([Homebrew](https://formulae.brew.sh/formula/libvoikko)). JavaScript-käännös on olemassa, virallista npm-pakettia ei ([wiki](https://github.com/voikko/corevoikko/wiki/JavaScript)). Oikofix näyttää Voikon tulokset alleviivauksina ja tarjoaa murteiden ja vanhan kielen sanaston ([sivu](https://oikofix.com/)).
- **Miten FAUSTissa:** Pääprosessin moduuli `src/services/language/voikko.js`, joka otetaan käyttöön vain, jos kirjasto löytyy koneelta; muuten toiminto on harmaana. Kutsutapa (natiivisidonta vai JavaScript-käännös) on osa kokeilua.
- **Lisenssi:** Kirjasto on kolmoislisensoitu ja sanasto GPL 2+ ([kirjasto](https://raw.githubusercontent.com/voikko/corevoikko/master/libvoikko/README), [sanasto](https://raw.githubusercontent.com/voikko/corevoikko/master/voikko-fi/README.md)). GPL koskee jakelua. Omassa käytössä se ei rajoita; jos FAUST joskus jaetaan, Voikko jätetään käyttäjän itse asennettavaksi lisäosaksi.
- **Työmäärä:** S (puoli päivää). **Vaikutus:** tuntematon; kokeilu kertoo.
- **Riskit:** Kielioppitarkistin on suppea (18 sääntötyyppiä), ja kehitys on hidasta. Kolmannen osapuolen npm-paketin ylläpitoa ja käännöstyön määrää ei ole tarkistettu.

### 4.17 Myöhemmin tai vain, jos tarve osoittautuu

Näitä ei rakenneta neljäntoista ensimmäisen askeleen aikana.

- **Tekoälytekstin sävytys tekstissä.** Tutkimusnäyttö on yksi 13 kirjoittajan tutkimus ([HaLLMark](https://arxiv.org/html/2311.13057v4)); tuotteista sen tekevät Sudowrite, NovelAI, iA Writer ja Dabble ([Sudowrite](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/write/pvxUvbQqYybfEosqx1sXjY), [NovelAI](https://docs.novelai.net/en/text/editor/), [iA Writer](https://ia.net/writer/support/editor/authorship), [Dabble](https://www.dabblewriter.com/docs/reference/certificate-of-authorship/)). Siirretään taemmas, koska merkinnät ajelehtivat korvaa kaikki -toiminnon, kumoamisen ja tilannekuvan palautuksen läpi. Käyttöloki vastaa kustantajan kysymykseen.
- **Kelluva valintavalikko.** Vain erikseen päälle kytkettävänä asetuksena.
- **Tarinakansion täyttö käsikirjoituksesta.** Hyödyllinen tuoduille kirjoille ja nähty Sudowritessa vahvistusvaiheen kanssa ([ohje](https://docs.sudowrite.com/resources/ktuxRrzphwp3uTNneRtaos/can-i-import-a-half-finished-work/vxLuRibYRPoDBbtx4EepgL)) sekä Scribsyssä, jossa mikään ei ole kaanonia ennen vahvistusta ([sivu](https://scribsy.ai)). Suomen taivutettujen nimien palautus perusmuotoon avoimella mallilla on testaamatta. Tehdään vasta käsin muokattavan kansion jälkeen ja vain vahvistuksen kanssa.
- **Suora .scriv-lukija.** Iso työ, vaatii RTF-lukijan jota ei ole, ja muodon yksityiskohdat ovat varmistamatta.
- **@-maininnat kehotekentässä ja ”voimassa luvusta N alkaen” -muutokset.** Jälkimmäinen on Novelcrafterin Progressions ([ohje](https://www.novelcrafter.com/help/docs/codex/progressions-additions)). Harkitaan, kun peruskonteksti ja kansio ovat päivittäisessä käytössä.
- **Hylättyjen versioiden pysyvä varasto ja kahden mallin rinnakkaisajo.** Istunnon aikaiset yritykset ja peräkkäinen ”Kokeile toisella mallilla” riittävät.
- **Toiston tarkistus.** Tarvitsee suomessa perusmuodot tai vartalologiikan; Voikko-kokeilu (4.16) ratkaisee, kumman.
- **Lukijapersoona.** Persoonapalaute oli tutkimuksessa monisanaista ([tutkimus](https://arxiv.org/abs/2309.10433)).
- **Marginaalimerkit ja ponnahduskommentit editorissa.** Listapaneeli ensin; merkit myöhemmin.
- **”Jatka”-painike katkenneen vastauksen jälkeen.** Jatkaminen nojaa esitäyttöön, joka ei toimi kaikilla yhdyskäytävän malleilla.
- **Työkalukutsut.** Ne ovat yhdyskäytävässä käytettävissä, mutta suunnitelman askeleet eivät käytä niitä, jotta jokainen ominaisuus toimii myös malleilla, joilta ne puuttuvat. Myöhempi, valinnainen käyttö: avustaja hakee itse luvun tiivistelmän tai Tarinakansion merkinnän. Se tehdään mallikohtaisena lisänä, ja rivimuotoinen polku jää oletukseksi.
- **Angloamerikkalainen ”Standard manuscript” -vienti ja lähetyksen esitarkistus.** Ks. 5.13.

### 4.18 Kartta: mistä mikin toiminto avataan

Yhdellä työllä on yksi nimi. Tekoälyn tekemä oikoluku on kaikkialla ”Kielenhuolto”; ”Oikoluku” tarkoittaa vain järjestelmän oikeinkirjoituksen tarkistusta. Valikkopaikat ovat ehdotuksia.

| Toiminto | Mistä avataan | Askel |
|---|---|---|
| Tuo kansio | Tiedosto → Tuo kansio | 2 |
| Mitä malli näkee | Rivi jokaisen tekoälytoiminnon alla | 3 (täysi 9) |
| Ehdotusten läpikäynti | Palkki editorin yllä; Cmd+Enter, Shift+Cmd+Backspace | 5 |
| Tekoälyn käyttöloki | Projektin asetukset → Tekoälyn käyttö → Vie | 5 |
| Liitä muokkauksina | Muokkaa → Liitä muokkauksina; Shift+Cmd+V | 6 |
| Tilannekuvat ja vertailu | Nykyinen tilannekuvapaneeli, nyt luvuittain | 6 |
| Pikamuokkaus | Cmd+K valinnalla; hiiren oikea painike → Tekoäly | 7 |
| Tekoäly pois | Asetukset | 7 |
| Älykäs kirjoitus | Toimii kirjoittaessa; kytkin asetuksissa | 8 |
| Tarkista typografia | Työkalut → Tarkista typografia; askeleesta 10 myös Tarkistus-välilehti | 8 |
| Kielenhuolto | Työkalut → Kielenhuolto: tämä luku; valinnalle Cmd+K:n pikavalinta; askeleesta 10 myös Tarkistus-välilehti | 8 |
| Oikoluku (oikeinkirjoitus) | Työkalut → Oikoluku | on jo |
| Tutkimuskansio | Näytä → Tutkimuskansio; Cmd+Shift+R | on jo |
| Tarinakansio / Kirjan kansio | Sivupalkin osio | 9 (A), 12 (B) |
| Luvun tiivistelmä | Korttinäkymän kortti; Inspectorin Luku-välilehti | 9 |
| Tarkistus | Tarkistus-välilehti | 10 |
| Avustaja | Shift+Cmd+K; painike | 11 |
| Tarkista jatkuvuus | Tarkistus-välilehden tarkistus | 12 |
| Kirjoita kohdistimeen | Cmd+K ilman valintaa | 13 |

## 5. Muokattavat ja hiottavat ominaisuudet

Kaksi ensimmäistä kohtaa ovat tietojen menetyksen polkuja, ja ne tehdään ennen mitään muuta. Kolmas on edellytys jokaiselle uudelle ominaisuudelle. Otsikossa on askeleen numero.

### 5.1 `callAIWithMode`: tilan takaisinkirjoitus ja vanhentuneet sulkeumat (askel 1)

- **Nykytila:** `app.js:1828–1884`. Rivi 1877 ajaa `setProject({ ...project })` jokaisen kutsun jälkeen. BatchProcessor ja RefinementManager saavat ensimmäisen renderöinnin funktion (`app.js:3553–3569`), eikä sitä päivitetä.
- **Ongelma (lukemalla, ei ajettu):** Generointipainikkeet korvaavat avoimen kirjan tyhjällä oletusprojektilla, myös silloin kun pyyntö epäonnistuu, ja automaattitallennus kirjoittaa sen tiedostoon 30 sekunnissa. Kaikilla muilla kutsujilla pyynnön aikana kirjoitettu teksti palautuu ennalleen.
- **Muutos:**
  - Rivi 1877 poistetaan, ja käyttöluvut pidetään omassa tilassaan. Palveluille annetaan `() => projectRef.current`; viite on jo olemassa (`app.js:483`, `506`).
  - Piilotetaan heti: ◉-painike, ”Generoi Kaikki Luvut” ja ”Generoi Uudelleen”; ”Locations”- ja ”Threads”-painikkeet (`app.js:7497–7525`), koska niiden lomakkeet kaatavat ikkunan; Hybrid-dialogin ”Korvaa luku” -polku (`app.js:3095–3105`); johdonmukaisuuspainikkeet, jotka raportoivat epäonnistuneen kutsun tuloksena ”ei ristiriitoja”; ja ⚗-pikatarkistus, joka arvioi 2 000 ensimmäistä merkkiä.
  - Keskustelun ”Lisää” (`app.js:12380–12385`) ottaa automaattisen tilannekuvan ennen liittämistä, kunnes Avustaja korvaa sen (askel 11).
  - `claude-api`-käsittelijään `max_tokens`-oletus (`electron.js:1084`). Oletus pysyy, kunnes koko käsittelijä poistetaan (5.3:n taulukko). Se ei yksin saa Claude-suoria kutsuja toimimaan, koska kovakoodatut mallitunnisteet ovat vanhentuneet (5.5); se korjataan askeleessa 3.
  - Virheraja sovelluksen juureen, jotta yksittäinen renderöintivirhe ei tyhjennä ikkunaa.
  - Vika kannattaa todeta ensin kertakäyttöisessä projektissa.
- **Sillä välin:** kun paikka- ja lankalomakkeet ovat piilossa, Tutkimuskansio on käsin kirjoitettujen faktojen paikka askeleeseen 9 asti.
- **Työmäärä:** S, piilotukset S. **Vaikutus:** kriittinen.

### 5.2 Aktiivisen luvun tunniste poiston, palautuksen ja kirjanmerkkihypyn jälkeen (askel 1)

- **Nykytila:** `app.js:1721` valitsee uuden aktiivisen luvun poistoa edeltävästä taulukosta. Sama tila syntyy tilannekuvan palautuksessa (`app.js:1189–1207`) ja hypyssä poistetun luvun kirjanmerkkiin (`app.js:1088–1107`). Palautus ei ota ensin kopiota; sen vahvistusikkuna vain suosittelee sellaista.
- **Ongelma:** Editori näyttää luvun varavalinnan kautta, mutta kirjoitus menee vanhalle tunnisteelle ja katoaa hiljaa. Jokainen ehdotuksen hyväksyntä kirjoittaisi saman tunnisteen kautta.
- **Muutos:** Uusi tunniste lasketaan suodatetusta taulukosta. Yksi tarkistus korjaa tunnisteen aina, kun sitä ei löydy rakenteesta. Ennen palautusta otetaan automaattinen tilannekuva nykyisellä toiminnolla (`app.js:1159–1177`); sen jälkeen kumoamishistoria tyhjennetään, koska vanhat komennot viittaavat lukuihin, joita ei enää ole. Askeleessa 6 tyhjennys korvataan kumottavalla palautuskomennolla (5.9), ja automaattinen tilannekuva jää.
- **Työmäärä:** S. **Vaikutus:** korkea.
- **Siirretty taemmas:** lukujen lisäyksen, poiston ja järjestyksen kumoaminen käyttämättömillä komentoluokilla.

### 5.3 Yksi AI-pyyntökerros (askel 3)

- **Nykytila:** Kolme käsittelijää ja kolme sopimusta (`electron.js:1078`, `1108`, `1170`; `preload.js:29–99`). `claude-api` ei välitä järjestelmäviestiä eikä viestihistoriaa eikä palauta lopetussyytä. Suoratoiston paloissa ei ole pyyntötunnistetta. Peruutusta ei ole.
- **Ongelma:** Pitkää ajoa ei voi pysäyttää, katkennut vastaus näyttää valmiilta, ja kaksi samanaikaista virtaa sekoittuisi.
- **Ensin 30 minuutin tarkistus yhdyskäytävästä:** Avaa Cherry Studion API-palvelimen oma rajapintakuvaus, jos asetuksissa on sellainen, tai tee yksi käsin kirjoitettu kutsu. Kirjaa: onko polku `/v1/messages` olemassa, vaaditaanko `max_tokens`, hyväksytäänkö `system`-kenttä, onko tokenlaskennan reittiä, mitä tapahtuu kun virta suljetaan, ja tulevatko `stop_reason` ja `usage` läpi muuttamattomina. Vastaukset kirjataan lukuun 8. FAUSTin nykyinen yhteys käyttää jo Anthropic-muotoista kutsua (`electron.js:125–134`), joten tarkistus koskee yksityiskohtia.
- **Muutos:**
  - Yksi `ai:request {id, system, messages, model, maxTokens, temperature?}`, aina suoratoistona, palat tunnisteella. `ai:cancel {id}` kutsuu virran `abort()`-metodia; pääprosessi pitää virrat taulussa tunnisteen mukaan. Paluuarvo on `{text, stopReason, usage}`. Renderöijään tulee `src/services/ai/aiClient.js`, jota kaikki uudet ominaisuudet käyttävät.
  - Mallikenttä (siirretty tänne kohdasta 5.5): Anthropic-tilaan yksi vapaa tekstikenttä, ja kaikki kovakoodatut tunnisteet poistetaan, myös yhteystestistä (`electron.js:957`, `1090`, `1128`, `1191`; `app.js:134–135`). Ilman tätä pyyntökerrosta ei voi kokeilla Claude-suoralla polulla.
  - Lämpötila: Anthropic-tilassa sitä ei lähetetä koskaan; yhdyskäytävätilassa vain, jos olet asettanut sen. Nykyinen suoratoistokäsittelijä lähettää aina arvon 0,7 (`electron.js:1114`).
  - Hyväksymissääntö `aiClient`issa: muokkaustehtävän tulos saa muuttua ehdotukseksi vain, jos lopetussyy on `end_turn` tai `stop_sequence` ja sulkeva `</teksti>`-tagi on mukana. `max_tokens`, kieltäytyminen (`refusal`), puuttuva tagi tai tyhjä teksti tarkoittavat ”ei ehdotusta”, ja syy näytetään. Puuttuva sulkutagi paljastaa katkeamisen ja kieltäytymisen millä tahansa mallilla siitä riippumatta, mitä yhdyskäytävä raportoi. Avoimet mallit kieltäytyvät tavallisena tekstinä, ja ilman sääntöä diffi ehdottaisi valinnan korvaamista pahoittelulla.
  - Päättelyvara: päättelevät mallit kuluttavat `maxTokens`-rajaa ajatteluun (yhdyskäytävän ajattelulohkot on jo huomioitu, `electron.js:115–119`), joten valinnan pituuden mukaan mitoitettu raja voi päättyä tyhjään vastaukseen. Rajaan lisätään mallikohtainen vara.
  - Keskustelussa katkennut vastaus näytetään merkinnällä ”vastaus katkesi” ja saapunut teksti säilytetään.
  - Asetus ”Lähetä ohjeet käyttäjäviestinä” on malleille, jotka hylkäävät järjestelmäviestin.
  - Virheet näytetään sovelluksen omissa dialogeissa oikealla tekstillä.
- **Claude-suoran polun tausta:** Työkalun mukana tulleen API-viitteen mukaan (välimuistissa 3.11.2026, ei tarkistettu elävästä lähteestä) nykyiset Claude-mallit hylkäävät lämpötila-asetuksen virheellä 400 ja voivat palauttaa lopetussyyn `refusal` muuten onnistuneessa vastauksessa. Siksi yllä olevat kaksi sääntöä.
- **Vanhat kutsujat ja niiden poistuminen:**

| Kutsuja | Käsittelijä | Poistuu askeleessa |
|---|---|---|
| `callAIWithMode` (`app.js:1851`): analyysit, äänimuokkaus, johdonmukaisuus | `claude-api` | äänimuokkaus 6, analyysit 10, johdonmukaisuus 12, funktio itse 14 |
| Liminal-paneeli (`app.js:3323`) | `claude-api` | 11 |
| `HybridWritingFlow` (rivi 214) | `claude-api` | ”Uudelleenkirjoita” 7, loput 13 |
| `PlotThreadTracker` (rivit 78–84) | `claude-api` | piiloon 9, koodi 14 |
| `ConsistencyChecker` (rivit 294–300) | `claude-api` | piiloon 1, koodi 12 |
| ClaudeChat, tavallinen keskustelu (rivi 138) | `claude-api-stream` | 11 |
| ClaudeChat, ”extended thinking” -valinta (rivit 107 ja 224) | ajattelukäsittelijä | 3 |

  - `claude-api` ja `claude-api-stream` jäädytetään: niille ei tule uusia kutsujia, ja ne poistetaan, kun viimeinen kutsuja lähtee (`claude-api-stream` askeleessa 11, `claude-api` askeleessa 14). `max_tokens`-oletus (5.1) pysyy siihen asti.
  - Ajattelukäsittelijä (`electron.js:1170–1256`) ja ClaudeChatin valintaruutu poistetaan yhdessä askeleessa 3. Käsittelijän mallitunniste on kovakoodattu ja vanhentunut (`electron.js:1191`), ja yhdyskäytävällä ajatteluparametri pudotetaan pois (`electron.js:132`), joten valinta ei kummassakaan tilassa tee sitä, mitä se lupaa. Jos käsittelijä poistettaisiin ilman valintaruutua, valinta päättyisi virheeseen puuttuvasta käsittelijästä.
- **Asetusten paikat:** Nyt varastoja on kolme (renderöijän localStorage, `ui-prefs.json` ja salattu `config.json`). Uudet asetukset jaetaan näin: mallitunnisteet, mallikohtainen ikkuna ja päättelyvara sekä ”Lähetä ohjeet käyttäjäviestinä” talletetaan `config.json`-tiedostoon kanavan `ai:set-provider` kautta, koska pääprosessi tarvitsee ne. Tallennetut kehotteet, ”Tekoäly pois” ja ikkunoiden koot talletetaan yhteen renderöijän käyttämään varastoon; ehdotus on `ui-prefs.json`, jota Oikoluku-valinta jo käyttää. localStoragea ei käytetä uusiin asetuksiin.
- **Säännöt mille tahansa mallille:** Ollaman päätepisteestä puuttuvat tokenlaskenta, `tool_choice` ja kehotevälimuisti ([ohje](https://docs.ollama.com/api/anthropic-compatibility)); tämä koskee vain, jos yhdyskäytävän takana on Ollama. Ajatteluun ja rakenteisiin vastauksiin ei nojata varmuuden vuoksi; niitä ei ole tarkistettu yhdyskäytävästä. Työkalukutsut ovat yhdyskäytävässä käytettävissä, mutta kymmenen ensimmäistä askelta eivät käytä niitä, jotta jokainen ominaisuus toimii myös malleilla, joilta ne puuttuvat (myöhempi käyttö: 4.17).
- **Missä nähty:** Novelcrafterin Stop säilyttää osittaisen tekstin ([FAQ](https://www.novelcrafter.com/help/faq/ai-and-prompting/how-can-i-stop-prose-generation)). VS Codessa on jonotus, ohjaus ja ”Stop and Send” ([ohje](https://code.visualstudio.com/docs/copilot/chat/copilot-chat)).
- **Työmäärä:** M; mallikenttä S. **Vaikutus:** korkea.

### 5.4 API-avaimet eivät palaa renderöijälle (askel 3)

- **Nykytila:** `load-api-keys` palauttaa puretut avaimet (`electron.js:872–874`). Renderöijässä on kolme kutsujaa: tilan lukija (`app.js:536–553`), joka tarvitsee vain tiedon siitä, onko avain asetettu, sekä kaksi kohtaa, jotka lukevat avaimet, yhdistävät uuden ja kirjoittavat koko olion takaisin (`app.js:1790–1800`, `AIProviderSettings.js:126–127`).
- **Ongelma:** Renderöijä saa avaimet selväkielisinä, vaikka se tarvitsee vain tiedon siitä, onko avain asetettu. Muu asetuskoodi on jo rakennettu niin, ettei avainten arvoja lähetetä renderöijälle.
- **Muutos:** Lataus palauttaa vain totuusarvot. Uusi kirjoituskäsittelijä ottaa yhden avaimen nimen ja arvon ja yhdistää sen pääprosessissa, koska renderöijä ei enää voi tehdä yhdistämistä.
- **Työmäärä:** S. **Vaikutus:** keskisuuri. Tehdään pyyntökerroksen yhteydessä.

### 5.5 Malliasetukset yhdyskäytävälle (mallikenttä askel 3, loput askel 7)

- **Nykytila:** Yhdyskäytävän mallin voi jo valita. `src/components/AIProviderSettings.js`:ssä on lähteen valinta, yhdyskäytävän osoite, avain, yhdyskäytävästä haettu mallilista (”Hae mallit”) ja ”Testaa yhteys”. Cherry-tilassa jokainen kutsu ohjataan valittuun malliin, koska `createCherryClient` korvaa tunnisteet, joissa ei ole kaksoispistettä (`electron.js:128–134`). Lisäksi on kaksi pudotusvalikkoa päivättyjä Claude-tunnisteita (`app.js:7247–7279`, `9567–9655`); ”Mukautettu malli” -kentän arvo on aina tyhjä (`app.js:9629`), joten siihen ei voi kirjoittaa. Tunnisteita on kovakoodattu pääprosessiin neljään kohtaan (`electron.js:957`, `1090`, `1128`, `1191`). Keskustelu on nimetty ”Claude Assistentiksi”.
- **Ongelma:** Cherry-tilassa kaksi Claude-pudotusvalikkoa ohitetaan hiljaa. Kaikille tehtäville on yksi malli. Sekä projektitiedosto että sovelluksen asetus väittävät valitsevansa mallin. Käyttöliittymä puhuu Claudesta silloinkin, kun vastaaja on avoin malli. Claude-suorassa tilassa jokainen kovakoodattu tunniste on vanhentunut: `claude-3-5-sonnet-20241022` poistui käytöstä 28.10.2025 ja `claude-sonnet-4-20250514` 15.6.2026, ja projektin oletus `claude-sonnet-4-5` (`app.js:134`) poistuu 30.11.2026. Päivämäärät ovat työkalun mukana tulleesta API-viitteestä (välimuistissa 3.11.2026), eivät elävästä tarkistuksesta.
- **Muutos:** Askeleessa 3: Anthropic-tilaan yksi vapaa tekstikenttä ja yhteystesti, kovakoodatut tunnisteet pois (ks. 5.3). Askeleessa 7: yksi asetuslohko. Cherry-tilassa näkyvät vain tehtäväkohtaiset valitsimet (4.11), projektin mallikenttä poistuu ja nimet seuraavat valittua lähdettä.
- **Työmäärä:** S ja S–M. **Vaikutus:** korkea.

### 5.6 Kumoaminen tekoälymuutoksille (askel 5)

- **Nykytila:** `CommandManager.js:130–175`. Enintään kahden merkin muutos voi yhdistyä kirjoitusjaksoon. Kumoaminen ei vieritä muutoksen kohdalle, koska ulkoinen muutos lähetetään ilman vieritystä (`FaustEditor.js:373–376`). Useat tekoälypolut ohittavat historian.
- **Ongelma:** Hyväksytty pilkkukorjaus voi sulautua viereiseen kumoaskeleeseen, ja kumottu muutos voi jäädä näkymän ulkopuolelle. Historian ohittavaa tekoälymuutosta ei voi kumota lainkaan. Hylkäys ja ”Hylkää kaikki” eivät muuta tekstiä, joten ilman erillistä ratkaisua niitä ei voisi perua.
- **Muutos:** `noMerge`-lippu ja ehdotusten tunnisteet hyväksyntöjen metaan, ja kumottaessa ehdotusten palautus (ks. 4.1). `runHistory` (`app.js:902–923`) vierittää ensimmäiseen eroavaan kohtaan `scrollToPos`-toiminnolla. Avoimen luvun tekoälykirjoitukset kulkevat `updateChapterContent`-funktion kautta; muun kuin avoimen luvun kirjoitukset kulkevat `setChapterText`-funktion kautta (`app.js:1321`), joka vie minkä tahansa luvun muutoksen kumoamishistoriaan. Valikkotekstiä ”Kumoa: Tiivistä” ei tehdä, koska se vaatisi valikon uudelleenrakennuksen joka muutoksella.
- **Missä nähty:** Craftissa yksi kumoaminen peruu avustajan koko edellisen vastauksen ([ohje](https://support.craft.do/en/ai-assistant/editing.md)). VS Coden käyttäjä raportoi menettäneensä odottavat muutokset väärällä näppäimellä ([raportti](https://learn.microsoft.com/en-ca/answers/questions/5768240/ctrl-n-undo-behavior-destroys-in-progress-copilot); yksittäinen, vastaamaton).
- **Työmäärä:** S. **Vaikutus:** korkea.

### 5.7 Valinnan kaappaus ja liittäminen siirtymillä (askel 5)

- **Nykytila:** `handleTextSelection` (`app.js:3108–3122`) tallettaa siirtymät Reactin tilaan hiiren vapautuksessa. `acceptRewrite` (`3079–3093`) ja `acceptVoiceEdit` (`2899–2914`) liittävät niillä myöhemmin tarkistamatta tekstiä.
- **Ongelma:** Väliin kirjoitettu teksti siirtää kohtaa. Haku ja korvaus tarkistaa tekstin ensin, nämä eivät.
- **Muutos:** Valinta luetaan editorista toiminnon alkaessa. Kohde pidetään kartoitettuna alueena editorissa, ja `original` tarkistetaan ennen soveltamista. Tulee ehdotuskerroksen mukana.
- **Työmäärä:** S. **Vaikutus:** korkea.

### 5.8 Luvun tiivistelmä kirjan muistina (askel 9)

- **Nykytila:** Tiivistelmä syntyy vain 🜍-painikkeesta ja näytetään `alert()`-ikkunassa (`app.js:2071–2110`). Chapter Sheet ei avaudu (`app.js:11315`). Kentällä `synopsisManual` ei ole käyttöliittymää. ClaudeChatia lukuun ottamatta tiivistelmät eivät päädy yhteenkään kehotteeseen.
- **Ongelma:** Tiivistelmää ei voi kirjoittaa käsin, vaikka korttinäkymä ja jaetun näkymän tiivistelmälista nojaavat siihen. Kirjalla ei ole halpaa muistia: aiemmat luvut päätyvät kehotteeseen vain raakatekstinä tai eivät lainkaan.
- **Muutos:** Tiivistelmä muokattavaksi kahdessa paikassa, korttinäkymän kortissa ja Inspectorin Luku-välilehdellä, ja nykyiset tiivistelmäkentät yhdistetään yhdeksi. ”Ehdota tiivistelmä” täyttää luonnoksen esikatseluun eikä koskaan korvaa käsin kirjoitettua. Sisällön tiiviste tallennetaan, ja kortti näyttää ”vanhentunut”, kun luku on muuttunut. Kontekstin kokoaja käyttää aiempien lukujen tiivistelmiä. Tiivistelmät pidetään lyhyinä. Jos Scrivenerin synopsikset saadaan tuotua (4.14), ne täyttävät kentän ilman mallia.
- **Missä nähty:** Novelcrafter ([FAQ](https://www.novelcrafter.com/help/faq/plan/outline-impact)), Sudowrite ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/chapter-continuity/4KL8gFeLZQ6GSBjDWtSbV6)), SillyTavernin varoitus ([ohje](https://docs.sillytavern.app/extensions/summarize/)).
- **Työmäärä:** S–M. **Vaikutus:** korkea.

### 5.9 Tilannekuvat luvuittain ja oikea vertailu (askel 6)

- **Nykytila:** Tilannekuva kopioi koko rakenteen projektitiedostoon (`app.js:1159–1177`). Vertailu on sanamäärä `alert()`-ikkunassa (`1209–1230`). Palautus korvaa kaikki luvut eikä ole kumottavissa (`1189–1207`). Hyvä vertailudialogi on olemassa, mutta se on sidottu tekoälyversioihin ja vanhaan `computeTextDiff`-funktioon (`app.js:10517–10527`, `1110`).
- **Ongelma:** Luvun laajuiselta ajolta puuttuu taattu paluureitti. Palautus on kaikki tai ei mitään, eikä vertailusta näe, mikä muuttui. Jokainen tilannekuva on koko käsikirjoituksen kopio tiedostossa, joka kirjoitetaan uudelleen 30 sekunnin välein.
- **Muutos:** Tilannekuvat luvuittain. Automaattinen tilannekuva ennen ”Hyväksy kaikki” -toimintoa, luvun laajuista ajoa, tuontia ja palautusta, kerran ajoa kohti eikä joka hyväksynnällä. Vertailudialogi yleistetään ottamaan kaksi tekstiä ja otsikot, ja se käyttää `wordDiff`-funktiota; vanha `computeTextDiff` poistetaan tässä askeleessa. Askeleen 1 historian tyhjennys korvataan kumottavalla palautuskomennolla, ja automaattinen tilannekuva ennen palautusta jää. Nykyiset tekoälyversiot siirretään tilannekuviksi. Tallennus pysyy aluksi projektitiedostossa, lukukohtaisella enimmäismäärällä. Erilliseen tiedostoon siirrytään vasta, jos tiedoston koko mitataan ongelmaksi, koska siirto muuttaa atomisen tallennuksen ja palautuksen logiikkaa.
- **Missä nähty:** Scrivenerin dokumenttikohtaiset Snapshots ja Compare ([blogi](https://www.literatureandlatte.com/blog/use-snapshots-in-scrivener-to-save-versions-of-your-projects)). Dabble ottaa varmuuskopion ennen palautusta ja voi tuoda yhden dokumentin historiasta ([sanasto](https://www.dabblewriter.com/docs/reference/glossary)). LivingWriter (päiväämätön ohje, [ohje](https://guides.livingwriter.com/product-documentation/ai-features/ai-rewrite)).
- **Työmäärä:** M. **Vaikutus:** korkea. Edellytys jokaiselle luvun laajuiselle ajolle.

### 5.10 Työkalupalkin analyysit ☿ ⚗ 🜍 (⚗ piiloon askel 1, 🜍 askel 9, ☿ askel 10)

- **Nykytila:** `app.js:1962–2157` ja `5080–5247`. Tulokset tulevat `alert()`-ikkunaan, suurinta osaa kentistä ei näytetä missään, ja ⚗ arvioi luvun 2 000 ensimmäisen merkin perusteella.
- **Ongelma:** Huomiota ei voi jäljittää tekstikohtaan, pistemäärä on ankkuroimaton luku, ja jäsennysvirhe ilmoitetaan puuttuvana API-avaimena. Kehotteessa ei ole vastauskielen ohjetta, joten suomenkielinen luku voi saada englanninkieliset huomiot.
- **Muutos:** ☿ muuttuu Tarkistus-välilehden tarkistuksiksi (4.9). ⚗ poistetaan. 🜍 muuttuu ”Ehdota tiivistelmä” -toiminnoksi, jolla on esikatselu ja projektin kieli (5.8). Pistemäärää ei näytetä ([AutoCritin oma varaus](https://www.autocrit.com/editing/support/the-new-summary-report/)).
- **Työmäärä:** M yhdessä kohdan 4.9 kanssa. **Vaikutus:** korkea.

### 5.11 Johdonmukaisuustarkistus (painikkeet piiloon askel 1, uusi tarkistus askel 12)

- **Nykytila:** Kaksi painiketta ja kaksi koodipolkua (`app.js:7835–7935`, `8018–8087`; `ConsistencyChecker.js:81–196`, `245–339`). Jäsennysvirhe raportoidaan ”ei ristiriitoja”. Nimi haetaan tarkalla osumalla. Annotaatioita ei koskaan liitetä.
- **Ongelma:** Saat väärän ”ei ristiriitoja” -tuloksen, kun kutsu epäonnistuu. Taivutetut muodot (Marian, Marialle) jäävät löytymättä, ja todisteeksi otetaan vain viisi ensimmäistä virkettä lukua kohti. Löydöstä ei voi avata tekstissä.
- **Muutos:** Yksi ”Tarkista jatkuvuus” luvulle Tarkistus-välilehdellä, Tarinakansion vartaloita ja aiempia tiivistelmiä vasten. Havainto lainaa molemmat kohdat. Epäonnistunut kutsu näkyy epäonnistuneena.
- **Työmäärä:** S, kun 4.9 ja 4.10:n siivu B ovat olemassa. **Vaikutus:** keskisuuri–korkea.

### 5.12 Kirjoitustilat (askel 9)

- **Nykytila:** Kolme tilaa, jotka eroavat lämpötilalla ja yhdellä englanninkielisellä lauseella, joka liitetään jokaisen kutsun alkuun, myös JSON-analyysiin (`app.js:156–182`, `1836`).
- **Ongelma:** Luova tilalause päätyy analyysikutsuihin, joissa se on haitaksi. Tila ei muuta mitään, minkä näkisit. Omalle tyyliohjeelle ei ole paikkaa.
- **Muutos:** Tilat poistetaan. Tehtävät kantavat omat kehotteensa muokattavassa kehotetiedostossa, ja ääni tulee Tyyliohjeesta (4.7). Avustajan kytkin ”Vain keskustelu / Saa ehdottaa muutoksia” määritellään kohdassa 5.16. Nelikenttäistä projektikohtaista oikeusmatriisia ei tehdä.
- **Missä nähty:** Sudowrite ([ohje](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/chat/5vbuELXf6LZQnGfVzsEXCV)), Craft ([ohje](https://support.craft.do/en/ai-assistant/editing.md)).
- **Työmäärä:** S. **Vaikutus:** keskisuuri.

### 5.13 Vienti: puhdas tuloste ja valinnainen saatesivu (riippumaton, ennen seuraavaa lähetystä)

- **Nykytila:** Nykyinen vienti täyttää jo kustantajien pyytämän asettelun. Docx on Times New Roman 12 pt (`utils/manuscript.js:524`, koko 24 puolipistettä) rivivälillä 1,5 (`:510`, `line: 360`). RTF on sama (`:381` `\fs24`, `:411` `\sl360\slmult1`). HTML ja PDF ovat 12 pt rivivälillä 1,6, A4-arkilla 2,5 cm:n marginaalein (`:281`, `:298`). Tulos on yksi tiedosto, ja nimiösivu tekijän nimellä on olemassa. `[TODO:]`-merkinnöille ei ole käsittelyä (`electron.js:767–817`).
- **Ongelma:** Työmerkinnät päätyvät kustantajalle lähtevään tiedostoon. Saatetta ei voi liittää tiedoston ensimmäiseksi sivuksi.
- **Muutos:** (a) `[TODO: …]`-merkinnät poistetaan `buildManuscript`-funktiossa, testit mukaan. (b) Valinnainen saatesivu ennen nimiösivua valitsemillasi yhteystiedoilla: yksi lisälohko `toDocx`-, `toHTML`- ja `toRTF`-funktioihin. Erillistä ”Kustantamo (FI)” -esiasetusta ei tehdä, koska kiinteä asettelu on jo se. Odottavat ehdotukset eivät koskaan ole tekstissä, joten ne eivät voi päätyä vientiin.
- **Missä nähty:** Gummerus pyytää selkeää 12 pisteen fonttia, riviväliä 1,5, yhtä tiedostoa ja saatetta nimellä ja yhteystiedoilla ([Gummerus](https://gummerus.fi/pages/kasikirjoitukset)). Siltala, Teos ja Orava-kirjat pyytävät 12 pistettä ja vähintään riviväliä 1,5 ([Siltala](https://siltala.fi/sivu/haluatko-kirjailijaksi/)). Into pyytää saatteen nimellä ja yhteystiedoilla ([Into](https://intokustannus.fi/into-kirjailijaksi/)). Atena haluaa saatteen käsikirjoitustiedoston ensimmäiselle sivulle ([Atena](https://atena.fi/haluatko-kirjailijaksi); Atena ottaa tällä hetkellä vain tietokirjoja). Dabblessa on käsikirjoitusasettelu oman ulkoasun rinnalla ([ohje](https://www.dabblewriter.com/docs/import-export-printing/export-your-manuscript)).
- **Työmäärä:** (a) S, (b) S–M. **Vaikutus:** korkea lähetysvaiheessa.
- **Siirretty taemmas:** angloamerikkalainen ”Standard manuscript” -esiasetus ja lähetyksen esitarkistus.

### 5.14 Hiljainen tekoäly, ”Tekoäly pois” ja selkeät nimet (”Tekoäly pois” askel 7, nimet ja virheilmoitukset askel 14)

- **Nykytila:** Kelluva alkemistinen työkalupalkki (`app.js:5061–5345`) ja keskustelupainike (`12389–12418`) näkyvät myös keskittymistilassa, jonka tyylit piilottavat vain otsakkeen, alapalkin ja muotoilupalkin (`styles/faust-simple-layout.css:167–174`). Nimet ovat latinaa ja englantia. `app.js`:ssä on noin 70 `alert()`-kutsua.
- **Ongelma:** Tekoälyn sisäänkäyntejä ei saa pois näkyvistä edes keskittymistilassa, eikä painikkeen nimestä näe, mitä se tekee. Yleinen ”tarkista API-avain” -ilmoitus peittää todellisen virheen, myös silloin kun vika on yhdyskäytävässä tai vastauksen jäsennyksessä.
- **Muutos:** Yksi asetus ”Tekoäly pois” piilottaa kaikki sisäänkäynnit, ja keskittymistila piilottaa ne aina. Tekoälyn virheet näytetään sovelluksen omissa dialogeissa oikealla viestillä. Nimet: vähimmäismuutos on, että jokainen symboli saa suomenkielisen tekstin ja työkaluvihjeen ja englanninkieliset käyttöliittymätekstit suomennetaan. Alkemistinen nimistö on FAUSTin identiteettiä, joten sen vaihtaminen on sinun päätöksesi (luku 6, Päätettävää).
- **Missä nähty:** ks. 2.2, Hiljainen käyttöliittymä.
- **Työmäärä:** M yhteensä: ”Tekoäly pois” S, nimet ja `alert()`-kutsujen tekoälyosuus S–M. **Vaikutus:** keskisuuri.

### 5.15 Kustannusseuranta (askel 14)

- **Nykytila:** `CostOptimizer.js:41–188` arvioi tokenit merkkimäärästä ja hinnoittelee ne vuoden 2025 Claude-taulukolla. Vain osa kutsuista lasketaan.
- **Ongelma:** Luvut ovat arvioita, ja paikallisella mallilla dollarimäärät ovat merkityksettömiä. Seurannan päivitysrivi on kohdan 5.1 vian juuri.
- **Muutos:** Dollariluvut poistetaan. Käyttölokiin (4.12) tulevat palvelimen ilmoittamat tokenmäärät, jos yhdyskäytävä palauttaa ne, ja käytetty konteksti suhteessa ikkunaan.
- **Työmäärä:** S. **Vaikutus:** matala–keskisuuri.

### 5.16 Yksi avustaja kahden keskustelun tilalle (askel 11)

- **Nykytila:** Kaksi erillistä keskustelua. Liminal Engine -paneeli (`app.js:3281–3363`, käyttöliittymä `9465–9898`) on englanninkielinen, ei suoratoista eikä lähetä käsikirjoituksen tekstiä, ellei sitä ole valittu. ClaudeChat (`src/components/ClaudeChat/ClaudeChat.js:86–174`, kiinnitys `app.js:12375–12386`) suoratoistaa suomeksi ja lähettää luvusta 500 viimeistä merkkiä.
- **Ongelma:** Kumpikaan ei lähetä keskusteluhistoriaa, joten jatkokysymyksellä ei ole pohjaa. Kumpaakaan ei voi pysäyttää. ”Lisää” liittää koko vastauksen luvun loppuun ilman esikatselua (`app.js:12380–12385`), ja paneelin ”Apply” on kuollut (`app.js:3410`). Kaksi keskustelua eivät tiedä toisistaan.
- **Muutos:** Yksi ”Avustaja” ClaudeChatin pohjalta: suomenkielinen, suoratoistava, lähettää historian `aiClient`in kautta, Pysäytä-painike, ”Mitä malli näkee” -rivi ja laajuuden valinta (valinta, luku, tiivistelmät). Nimi seuraa mallia. Tallennettuihin kehotteisiin tulee esimerkiksi ”Haastattele minua tästä luvusta”.
- **Kytkin, kaksi asentoa:**
  - *Vain keskustelu* (oletus): vastauksessa on vain ”Kopioi”. Mikään ei voi päätyä käsikirjoitukseen.
  - *Saa ehdottaa muutoksia:* avustajaa pyydetään palauttamaan muokattu valinta `<teksti>`-tagien sisällä, ja vastaukseen tulevat painikkeet ”Lisää kohdistimeen” ja ”Korvaa valinta” ehdotuksena. Kumpikaan ei muuta tekstiä ilman ehdotuskerroksen hyväksyntää.
  - Kysyminen on siis turvallista kummassakin asennossa; asento ratkaisee vain, tarjotaanko ehdotuspainikkeita.
- **Missä nähty:** Siirtotavat ja kytkin, ks. 2.2. iA suosittelee, että tekoäly haastattelee kirjoittajaa kysymys kerrallaan ja listaa ongelmia uudelleenkirjoittamisen sijaan ([kirjoitus](https://ia.net/topics/turning-the-tables-on-ai)).
- **Työmäärä:** M. **Vaikutus:** keskisuuri; poistaa suurimman päällekkäisen pinnan.

## 6. Yhdistettävät ja poistettavat

Poistot ovat yhtä tärkeitä kuin lisäykset: `app.js` lyhenee noin 2 500 riviä, ja jokainen poistettu pinta on yksi rinnakkainen toteutus vähemmän. Jokaisella vanhalla pinnalla on yksi askel, jossa se piilotetaan, ja yksi, jossa sen koodi poistetaan. Osa poistoista on sinun päätöksiäsi, ei tämän selvityksen löydöksiä; ne on koottu luvun loppuun.

Askel 14 poistaa käyttöliittymän ja generaattorit, ei projektitiedoston kenttiä. Hahmo-, paikka- ja lankatiedot säilyvät tiedostossa Tarinakansion siirtoa (4.10) varten ja sen jälkeenkin.

**Yhdistetään**

| Nyt | Tilalle | Piiloon | Koodi pois |
|---|---|---|---|
| Kolme valinnan uudelleenkirjoitusta: Liminal-paneelin ehdotuslaatikko (`app.js:3407–3428`, kuollut), Hybridin ”Uudelleenkirjoita” (`3012–3093`), äänimuokkaus (`2802–2920`) | Cmd+K-pikamuokkaus (4.3) ja ehdotuskerros (4.1). Äänimuokkauksen vertailunäkymän idea ja kehotteen sanamuoto siirtyvät pikamuokkaukseen. | äänimuokkaus 6, muut 7 | 6 ja 7 |
| Kaksi keskustelua: Liminal Engine (`app.js:3281–3363`, `9465–9898`) ja ClaudeChat | Yksi ”Avustaja” (5.16) | ”Lisää” saa tilannekuvan 1; Liminal 11 | 11 |
| Hybrid-dialogi: Jatka, Laajenna, Luo kohtaus (`app.js:11971–12372`) | Kirjoita kohdistimeen (4.13) | ”Korvaa luku” (`3095–3105`) 1; muut 13 | 13 |
| Kolme analyysipainiketta ☿ ⚗ 🜍 ja kaksi johdonmukaisuuspainiketta | Tarkistus-välilehti (4.9), ”Ehdota tiivistelmä” (5.8), ”Tarkista jatkuvuus” (5.11) | ⚗ ja johdonmukaisuus 1; 🜍 9; ☿ 10 | 🜍 9; ☿ ja ⚗ 10; johdonmukaisuus 12 |
| Tekoälyversiot, tilannekuvat ja kumoaminen | Kaksi mekanismia: kumoaminen askelille ja lukukohtaiset tilannekuvat (5.9). Tähtiarviot poistuvat, koska mikään ei lue niitä. | – | 6 |
| Vanha `computeTextDiff` (`app.js:1110`) ja uusi `wordDiff` | `wordDiff` (4.2) kaikkialla | – | 6 |
| Paikka-, lanka- ja lukulomakkeet sekä AnnotationMargin | Tarinakansion lomake (4.10), tiivistelmä kortissa (5.8) ja Tarkistus-lista (4.9) | paikka ja lanka 1 | lomakkeet 9; AnnotationMargin 10 |
| Juonilankojen tunnistus koko käsikirjoituksesta | Juonilanka on Tarinakansion merkintätyyppi. Jos tunnistus halutaan myöhemmin, se ajetaan tiivistelmistä ja se ehdottaa eikä korvaa käsin tehtyjä lankoja. | 9 | 14 |
| Kaksi paikkaa omille faktoille: Tutkimuskansio ja Tarinakansio | Tutkimuskansio jää aineistoksi, jota ei koskaan lähetetä mallille; Tarinakansio on ainoa varasto, jota mallit lukevat; ”Kopioi Tarinakansioon” yhdistää ne (4.10) | – | ei poisteta; kopiointitoiminto 9 |

**Poistetaan**

| Mitä | Piiloon | Koodi pois | Huomio |
|---|---|---|---|
| ◉ MAGNUM OPUS, ”Generoi Kaikki Luvut” ja regenerointi palautteella: `BatchProcessor.js`, `RefinementManager.js`:n generaattori ja `app.js:2160–2495` | 1 | 14 | Sinun päätöksesi, kysymys 1 |
| Cast planner ja nelikerroksinen hahmonrakentaja (`app.js:8210–9460`, `CharacterGenerator.js`): noin 1 250 riviä, tavoittamaton, englanninkielinen, eikä profiilia käytetä missään kirjoitusominaisuudessa | on jo tavoittamaton | 14 | Sinun päätöksesi, kysymys 4. Hahmotiedot siirretään ensin (askel 9) |
| Äänimuokkaus, mikrofonipainikkeet ja äänen kelluva palkki | 6 | 6 | Sinun päätöksesi, kysymys 3 |
| Ajattelukäsittelijä (”Syvä analyysi”, `electron.js:1170–1256`) ja ClaudeChatin valintaruutu | – | 3 | Yhden valmistajan ominaisuus, ajattelu ei näy koskaan, ja yhdyskäytävällä se pudotetaan pois |
| ⚗-pikatarkistus ja numeerinen laatupistemäärä | 1 | 10 | |
| Kirjoitustilat lämpötila-asetuksina ja Liminal-muistiloki (`liminal-memory.json`) | – | 9 | Muistiloki on yhteinen kaikille kirjoille, laukeaa englanninkielisistä avainsanoista, etkä näe sitä |
| `StoryContinuityTracker` | – | 14 | Englanninkieliset säännölliset lausekkeet tuottavat suomenkielisestä tekstistä kohinaa |
| Dollarimääräinen kustannusseuranta | – | 14 | 5.15 |
| Kuollut koodi: `applyAiSuggestion`, `handleAnnotationClick`, `HybridWritingFlow.getSuggestions`, `onBatchProgress`-kuuntelija, `BatchProcessor.cancel`, poistettujen palveluntarjoajien haarat, `checkBudget`, `applyAutoFix`, käyttämättömät `project.ai.*`-kentät ja paneelin rikkinäinen mallikenttä | – | 14 | |

Äänimuokkaus poistetaan askeleessa 6. Selaimen puheentunnistus (`app.js:3447`, `src/utils/voiceInput.js:18`) lähettää tarkistuskierroksella löytyneiden foorumitietojen mukaan äänen ulkopuoliseen palveluun, joten se ei sovi vaatimukseen toimia verkotta; tätä ei ole ajettu eikä linkkiä tallennettu. Äänimuokkauksen vertailunäkymän idea ja kehotteen sanamuoto siirtyvät pikamuokkaukseen.

**Poistojen tarkistuslista.** Poistoilla on piilojohdotuksia, jotka on hoidettava ennen kuin yhtään palvelutiedostoa poistetaan:
1. Siirrä `CommandManager` ensin pois tekoälymoduulien lataajasta tavalliseksi tuonniksi. Lataajan lista (`app.js:3490–3499`) lataa tekoälypalvelut, ja sama lataaja luo `CommandManager`in (`app.js:3527`), eli kumoamisen. Tämä tehdään askeleessa 5.
2. `new window.RefinementManager` (`app.js:3563`) on vartioimaton. Jos tiedosto poistetaan, sen jälkeinen alustus jää ajamatta.
3. `scripts/post-build.js` päättyy virheeseen, jos listattu lähdetiedosto puuttuu (`CRITICAL_FILES`, rivit 10–36 ja 76–80). Poista rivi samalla kuin tiedosto.
4. `index.html`:n script-tagit (rivit 40–53).
5. Lataajan lista (`app.js:3490–3499`).

**Siirretään sivuun**

- MCP-palvelin (`mcp-server/`) pois toimitettavasta sovelluksesta (kysymys 6). Se kirjoittaa eri kansioon ilman lukitusta automaattitallennusta vastaan. Jos se herätetään, ulkoiset muokkaukset tuodaan ehdotuksina, kuten Revisessä ([ohje](https://revise.io/help/mcp-server.md)).

**Ei rakenneta nyt**

- Harmaa automaattitäydennys (ks. 2.1).
- Keskusteluagentti, joka muokkaa lukuja suoraan. Sudowrite tarvitsi kuukausien korjaukset ([muutosloki](https://feedback.sudowrite.com/changelog)).
- Vektorihaku. SillyTavernin oma ohje sanoo, ettei se takaa parannusta ja että se on ristiriidassa kehotevälimuistin kanssa ([ohje](https://docs.sillytavern.app/extensions/chat-vectorization/)).
- Lukijapersoonat avatareineen ja numeeriset laatupisteet.
- Sovellukseen paketoitu Voikko. Koneelle asennettua Voikkoa kokeillaan (4.16).
- Erillinen ”Kustantamo (FI)” -vientiesiasetus. Nykyinen asettelu on jo se (5.13).

**Päätettävää: kuusi kysymystä sinulle**

Nämä ovat sinun ratkaisujasi. Suositus on kussakin mukana, mutta suunnitelma toimii kummallakin vastauksella.

1. *Poistetaanko koko kirjan generointi kokonaan, vai jätetäänkö se asetuksen taakse niin, että se ajetaan aina erilliseen projektikopioon?* Suositus: poisto. Se on nyt rikki ja vaarallinen (5.1), ja kokonaisen luvun generointi on ristiriidassa periaatteen ”ei mitään ilman näkyvää, kumottavaa askelta” kanssa. Jos säilytät sen, vähimmäisehdot ovat korjattu 5.1 ja erillinen kopio.
2. *Säilytetäänkö alkemistiset symbolit ja nimet (◉, ☿, ⚗, 🜍, MAGNUM OPUS, Liminal Engine)?* Suositus: symbolit säilyvät ja saavat suomenkielisen tekstin ja työkaluvihjeen; englanninkieliset käyttöliittymätekstit suomennetaan. Nimistö on FAUSTin identiteettiä, joten nimien vaihto on sinun valintasi, ei välttämättömyys.
3. *Poistetaanko äänimuokkaus?* Suositus: kyllä, askeleessa 6. Jos säilytät sen, ”Liitä muokkauksina” jää ilman näppäintä ja puheentunnistuksen toimivuus Electronissa on ensin kokeiltava.
4. *Poistetaanko cast planner ja nelikerroksinen hahmonrakentaja (noin 1 250 riviä omaa työtäsi)?* Suositus: kyllä, mutta vasta kun hahmotiedot on siirretty Tarinakansioon; kentät säilyvät tiedostossa.
5. *Kokeillaanko Voikkoa?* Suositus: kyllä, puolen päivän kokeilu askeleessa 8 (4.16). Sitä ei paketoida mukaan.
6. *Irrotetaanko MCP-palvelin toimitettavasta sovelluksesta?* Suositus: kyllä, kunnes ulkoiset muokkaukset voidaan tuoda ehdotuksina.

## 7. Etenemisjärjestys

Ensin turvallisuus ja halpa koe, sitten yksi pyyntökerros ja yksi ehdotuskerros, ja vasta sen jälkeen näkyvät ominaisuudet. Ydin (askeleet 0–8) on noin 39–53 työpäivää ja koko kymmenen askeleen ohjelma noin 54–73 työpäivää, eli kahdesta ja puolesta kolmeen ja puoleen kuukautta yhden ihmisen täyttä työaikaa. Luvut ovat karkeita, koska mitään ei ajettu.

Säännöt joka askeleelle:
- Työmäärä on osien summa, ja sen perässä on arvio työpäivinä.
- Jokainen askel on oma moduulinsa testeineen ja päättyy kohtaan ”Valmis, kun”.
- Jokainen uusi paneeli on oma komponenttitiedostonsa kansiossa `src/components`, kuten ClaudeChat; `app.js` vain kiinnittää sen, eikä sen rivimäärä kasva yhdessäkään askeleessa.

**Ensimmäinen vaihe: ydin**

0. **Mallikoe (puoli päivää, ei muutoksia sovellukseen).** Ota 20–30 omaa kappalettasi, istuta niihin tunnettuja virheitä (yhdyssanat, pilkut, kongruenssi, typografia) ja ota mukaan muutama kappale puhekielistä vuoropuhelua. Aja ne käsin yhdyskäytävän omassa keskustelussa suunnitellulla ”vain korjaukset” -kehotteella kahdella tai kolmella mallilla. Laske kolme lukua: korjatut virheet, väärät korjaukset ja uusiksi kirjoitettujen kappaleiden osuus. Aluksi käsin; askeleen 4 funktioilla sama lasketaan pienellä Node-skriptillä. *Miksi ensin:* suunnitelman riskialttein oletus on, että jokin malli osaa korjata suomea kirjoittamatta tekstiä uusiksi. Sitä ei kannata kokeilla vasta viiden infrastruktuuriaskeleen jälkeen. *Valmis, kun:* jokaisesta mallista on kolme lukua ja päätös kohdan 4.4 säännöllä. Aineisto säilytetään mallivertailua (4.11) ja testejä varten.
1. **Sulje tietojen menetyksen polut (S + S + S, 2–3 pv).** 5.1 tilan takaisinkirjoitus ja 5.2 aktiivisen luvun tunniste: rivi `app.js:1877` pois, `projectRef` palveluille, piilotuslista (generointi, kaatuvat lomakkeet, ”Korvaa luku”, väärän tuloksen antavat johdonmukaisuuspainikkeet, ⚗), tilannekuva ennen keskustelun ”Lisää”-liittämistä ja ennen palautusta, aktiivisen luvun tunnisteen tarkistus, `max_tokens`-oletus ja virheraja. *Miksi ensin:* sovellus voi nyt lukemalla arvioiden kirjoittaa kirjatiedoston yli generointipainikkeen painalluksesta tai kesken olevan tekoälypyynnön aikana. Mitään muuta ei ole turvallista kokeilla tämän päällä. *Valmis, kun:* kertakäyttöisessä projektissa vika on ensin todettu ja korjauksen jälkeen generointi ei tyhjennä projektia, pyynnön aikana kirjoitettu teksti säilyy, ja luvun poiston jälkeen kirjoitettu teksti säilyy tallennuksen yli.
2. **Kansion tuonti ja tuonnin esikatselu (S–M + selvitys, 2–3 pv).** 4.14 Scrivener-reitti ja synopsisten selvitys. *Miksi heti:* kaikkea myöhempää pitää kokeilla oikealla käsikirjoituksella, ja sinun käsikirjoituksesi ovat Scrivenerissä. *Valmis, kun:* yksi Scrivener-projektisi on FAUSTissa luvut oikeassa järjestyksessä ja otsikot siisteinä, ja tiedät, saako synopsikset mukaan.
3. **Yksi pyyntökerros, mallikenttä ja pienin kontekstin kokoaja (M + S + S + S + S, 6–8 pv).** Alussa 30 minuutin tarkistus yhdyskäytävästä. Sitten 5.3 pyyntökerros, 5.4 avainten käsittely, 5.5:n mallikenttä ja kovakoodattujen tunnisteiden poisto, 4.6:n pienin kontekstin kokoaja ja `chapter.noAI`, 4.7:n kaksi tekstikenttää; ajattelukäsittelijä ja sen valintaruutu poistetaan. *Miksi:* peruutusta, suoratoistoa, katkeamisen ja kieltäytymisen tunnistusta tarvitsee jokainen myöhempi ominaisuus. Yksi kokoaja estää kolmannentoista käsin kootun kehotteen syntymisen. *Valmis, kun:* sama koepyyntö toimii yhdyskäytävän mallilla ja Claude-suoralla polulla, Pysäytä katkaisee virran, katkennut tai kieltäytynyt vastaus näkyy syyn kanssa eikä ehdotuksena, ja luvun 8 yhdyskäytäväkysymyksiin on vastaukset.
4. **Puhtaat tekstimoduulit (M, 3–4 pv).** 4.2 `wordDiff`, `splitBlocks`, `maskSpans` ja muut. *Miksi:* ne eivät vaadi muutoksia `app.js`:ään, sopivat nykyiseen Jest-asetukseen, ja kaikki myöhempi kootaan niistä. *Valmis, kun:* testit menevät läpi nykyisellä asetuksella, mukana suomen tapaukset (ä, ö, ”, –), TODO-merkinnän suojaus ja askeleen 0 koeaineisto.
5. **Ehdotuskerros, kumoaminen ja käyttöloki (L + S + S + S, 9–12 pv).** 4.1 ehdotuskerros, 5.6 kumoaminen tekoälymuutoksille, 5.7 valinnan kaappaus, 4.12 käyttöloki; `CommandManager` siirretään pois tekoälylataajasta. *Miksi:* tämä on ainoa reitti, jota pitkin tekoälyn teksti saa päästä käsikirjoitukseen. *Valmis, kun:* käsin syötetyllä ehdotusjoukolla oikeassa luvussa toimivat hyväksy, hylkää, palauta hylätyt, hyväksynnän kumoaminen (ehdotus palaa), luvun vaihto ja paluu sekä sulkemisdialogi, eikä tallennettu tiedosto missään vaiheessa sisällä hyväksymätöntä tekstiä.
6. **Liitä muokkauksina ja lukukohtaiset tilannekuvat (S + M + S, 4–6 pv).** 4.5 liitä muokkauksina, 5.9 tilannekuvat ja vertailu, äänimuokkauksen poisto; vanha `computeTextDiff` poistuu. *Miksi:* ensimmäinen näkyvä käyttö kerrokselle ilman mallia, jolloin kerroksen viat erottuvat mallin vioista. Tilannekuvat ovat taattu paluureitti ennen kuin yksikään luvun laajuinen ajo on olemassa. *Valmis, kun:* toisessa ohjelmassa muokattu kappale tulee sisään sanatason ehdotuksina ilman verkkoa, ja tilannekuvan palautuksen voi kumota.
7. **Cmd+K-pikamuokkaus ja sen sisäänkäynnit (M + S + S + S + S + S, 7–9 pv).** 4.3 pikamuokkaus, 4.15 oikean painikkeen valikko, 4.11 malli tehtävittäin, 5.5:n loput malliasetukset, ”Tekoäly pois” -asetus kohdasta 5.14 sekä Liminal-ehdotuslaatikon ja Hybridin ”Uudelleenkirjoita”-polun poisto. *Miksi:* suurin päivittäinen hyöty. Vanhojen polkujen poisto samalla estää neljännen rinnakkaisen toteutuksen. *Valmis, kun:* valinta → Cmd+K → ohje → ehdotukset toimii kahdella yhdyskäytävän mallilla, Cmd+Z ohjekentässä kumoaa ohjetta eikä käsikirjoitusta, ja ”Tekoäly pois” piilottaa kaikki sisäänkäynnit.
8. **Typografia, Voikko-kokeilu ja kielenhuolto (S–M + S + M, 5–7 pv).** Ensin 4.8 typografia, sitten 4.16 Voikko-kokeilu, sitten 4.4 kielenhuolto, jos askel 0 antoi luvan. *Miksi tässä:* suurin sinulle ominainen hyöty. Typografia toimii ilman mallia, ja kielenhuolto tarvitsee sen moduulin. Kielenhuolto riippuu askelista 3 (pyyntökerros), 4 (`splitBlocks`, `batchParagraphs`, `wordDiff`, `changeRatio`), 5 (ehdotuskerros) ja 6 (tilannekuva ennen ”Hyväksy loput”). *Valmis, kun:* älykäs kirjoitus tuottaa oikeat merkit eikä riko luetteloita, ”Tarkista typografia” löytää istutetut virheet, ja kielenhuolto käy yhden oikean luvun läpi niin, ettei yksikään TODO-merkintä tai otsikko muutu.

**Välietappi askeleen 8 jälkeen: ydin valmis.** Turvallinen sovellus, Scrivener-tuonti, pikamuokkaus, liitä muokkauksina, typografia ja kielenhuolto. Välisumma on noin 39–53 työpäivää. Tähän voi pysähtyä: kaikki siihen asti tehty on käytössä ilman toista vaihetta.

**Toinen vaihe: kirjan muisti ja palaute**

9. **Kirjan muisti: tiivistelmä, Tarinakansion siivu A ja täysi kontekstin kokoaja (S–M + M + S–M + M + S, 9–12 pv).** 5.8 muokattava tiivistelmä, 4.10:n siivu A, 4.7:n vältettävien sanojen korostus, 4.6:n täysi kokoaja ja 5.12 kirjoitustilojen poisto; Liminal-muistiloki poistuu. *Miksi:* kokoajalla on nyt oikeaa, käsin kirjoitettua aineistoa koottavaksi, ja loput käsin kootut kehotteet poistuvat. *Valmis, kun:* ”Mitä malli näkee” -rivillä näkyvät aiempien lukujen tiivistelmät ja ”Aina mukana” -merkinnät, ja vanhat hahmo-, paikka- ja lankatiedot ovat Tarinakansiossa.
10. **Tarkistus-välilehti, siivut 1–2 (M + M, 6–8 pv).** 4.9 Tarkistus ja 5.10 työkalupalkin analyysien korvaaminen. *Miksi tässä:* se käyttää askelia 4, 5 ja 9 ja korvaa viimeiset `alert()`-pohjaiset analyysit. *Valmis, kun:* paikallinen tarkistus ja yksi mallitarkistus tuottavat listan, josta jokainen havainto hyppää oikeaan kohtaan tai näkyy merkinnällä ”sijaintia ei löytynyt”, ja epäonnistunut kutsu näkyy epäonnistuneena.

Toinen vaihe on noin 15–20 työpäivää.

Miksi kaksi ”korkea”-vaikutuksen kohtaa tulee muutaman ”keskisuuren” jälkeen: käyttöloki (4.12), oikean painikkeen valikko (4.15) ja malli tehtävittäin (4.11) ovat alle päivän lisäyksiä askeleisiin, joissa sama koodi on jo auki. Tarkistus ja Tarinakansio taas ovat hyödyllisiä vasta, kun ehdotuskerros, tiivistelmät ja kontekstin kokoaja ovat olemassa.

**Kymmenen jälkeen, tässä järjestyksessä**

11. Yksi avustaja (5.16); ClaudeChatin ja Liminal-paneelin vanhat polut poistuvat. M.
12. Tarinakansion siivu B (maininnat ja laskurit, 4.10), jatkuvuustarkistus (5.11) ja Tarkistuksen siivu 3. M–L + S.
13. Kirjoita kohdistimeen (4.13); Hybrid-dialogi poistuu. M.
14. Iso siivous (luvun 6 poistot tarkistuslistoineen), nimet ja virheilmoitukset (5.14) ja dollariseurannan poisto (5.15). L.

Sen jälkeen luvun lukupalaute (4.9:n siivu 4).

**Riippumaton, mihin tahansa väliin:** viennin siivous ja valinnainen saatesivu (5.13). Se tehdään viimeistään ennen seuraavaa lähetystä kustantajalle.

## 8. Epävarmuudet

Suurimmat epävarmuudet ovat mallien suomi ja yhdyskäytävän käyttäytyminen, eivät koodi. Koodiväitteet ovat tarkkoja mutta ajamattomia.

**Koodi**
- Mitään ei ajettu. Väitteet tietojen menetyksestä, kaatuvista lomakkeista ja Claude-suorien kutsujen hylkäämisestä ovat päätelmiä koodipolusta. Ne kannattaa todeta kertakäyttöisessä projektissa.
- HEAD siirtyi koodin ensimmäisen läpikäynnin jälkeen kohdasta `dd1d1e6` kohtaan `2d68cfb` (korjaus tiedostoon `PlotThreadTracker.js`). `app.js`:n rivinumerot täsmäävät, tuon tiedoston eivät välttämättä.
- Tekstin sekaan piirrettävien lisäysten käyttäytymistä rivityksen, kirjoituskonetilan ja oikeinkirjoituksen kanssa ei voi päätellä lukemalla.
- Näppäimet Shift+Cmd+. ja Shift+Cmd+, on lainattu Typestä (dokumentoitu 2024–25). Suomalaisella näppäimistöllä Shift+. tuottaa kaksoispisteen ja Shift+, puolipisteen, joten ne on kokeiltava (4.1).
- macOS:n valikkoroolien (älykkäät lainausmerkit ja viivat) toimivuutta CodeMirrorissa ei ole kokeiltu (4.8).
- Selaimen puheentunnistusta ei ole ajettu Electronissa. Tieto, että se lähettää äänen ulkopuoliseen palveluun eikä toimi ilman avainta, on foorumitasoa.

**Yhdyskäytävä ja mallit**
- Cherry Studiosta ei ole aineistossa yhtään lähdettä. Tarkistuskierroksen haku löysi sen dokumentaatiosivun (docs.cherry-ai.com/advanced-basic/api-server), mutta sivu ei auennut, joten sen sisältöä ei ole luettu. Kaikki raportin yhdyskäytävähuomiot ovat Ollaman, KoboldCpp:n ja muiden palvelimien sivuilta.
- Askeleen 3 alussa vastataan näihin: onko `/v1/messages` olemassa, vaaditaanko `max_tokens`, hyväksytäänkö `system`-kenttä, onko tokenlaskennan reittiä, lopettaako yhdyskäytävä generoinnin kun virta suljetaan, tulevatko `stop_reason` ja `usage` läpi muuttamattomina, ja mikä on valitun mallin todellinen ikkuna.

  **Vastaukset (mitattu 16.11.2026, tarkemmin `docs/YHDYSKAYTAVA_2026-11.md`):** `/v1/messages` on olemassa, virtana ja ilman. `max_tokens` ei ole pakollinen. `system`-kenttä hyväksytään merkkijonona ja lohkoina, ja kaikki neljä mallia noudattavat sitä. Tokenlaskennan reitti on, mutta se on mallista riippumaton arvio, joka jää 14–17 % todellisesta, joten sitä ei käytetä. Kun virta suljetaan, yhdyskäytävä katkaisee oman virtansa samalla sekunnilla (4/4); sitä, lopettaako mallin tarjoaja generoinnin ja laskutuksen, ei voitu mitata. `stop_reason` tulee läpi (`end_turn`, `max_tokens`), paitsi että lopetusjonon osuma raportoidaan arvona `end_turn`, joten lopetusjonoja ei käytetä. `usage` tulee virran lopussa, ja kehotteen koko on `input_tokens` ja välimuistitokenit yhteensä. Mallin todellinen ikkuna: mittaamatta, 36 800 kehotetokenia meni läpi kahdella mallilla ja 7 500 kahdella muulla (mittaus, skenaario A-L26, odottaa omistajan lupaa, koska se vaatii noin 280 000 kehotetokenia mallia kohti).
- Aineistosta ei löytynyt mittausta minkään mallin suomenkielisestä proosasta tai oikoluvusta. Lähin on EuroEvalin hyväksyttävyystehtävä (4.4); tilanne on toukokuulta 2026, ja monet kärkirivit on pisteytetty validointijoukolla. Askel 0 on tämän selvityksen ainoa vastaus kysymykseen.
- Tieto, että Ollama katkaisee ylipitkän kehotteen hiljaa, on yhteisön raportteja ilman tallennettua linkkiä; valmistajan sivu ei sano kumpaakaan (4.6).
- Tiedot Claude-tunnisteiden vanhenemisesta, lämpötila-asetuksen hylkäämisestä ja `refusal`-lopetussyystä tulevat työkalun mukana tulleesta API-viitteestä (välimuistissa 3.11.2026), eivät elävästä tarkistuksesta.

**Aineisto ja sen tarkistus**
- Kaikki kymmenen aineistoryhmää käytiin tarkistuskierroksella läpi; tarkistamatonta ryhmää ei ole. Sivut luettiin tiivistävän hakutyökalun läpi, eikä yhtäkään tuotetta kokeiltu käsin. Tarkat painikkeiden nimet ja näppäimet on varmistettava tuotteesta ennen kuin niitä kopioidaan.
- Suomen kielentarkistuksesta ja kustantajien ohjeista ei tehty hakuja, vain yksittäisiä sivuja luettiin. Kolmessa muussa aiheessa hakuja tehtiin vähän: klassiset kirjoitussovellukset (12), tutkimus ja mielipiteet (7) ja paikalliset mallit (4). Käyttäjien mielipiteet ovat näissä ohuet.
- Noin 45 linkkiä avattiin uudelleen 16.11.2026. Kolme osoitti sivulle, jolla väitettä ei ollut (Copilotin oletusasetukset, Novelcrafterin järjestelmäviestiasetus, Sudowriten valikon ajoitus); ne on korjattu. Noin kahdeksan virkettä tarkennettiin.
- Muutama tieto on lisätty tarkistuskierroksella suoraan linkitetyltä sivulta eikä aineiston tiivistelmästä: Sudowriten valikon siirron syy, CHI 2026 -tutkimuksen tehtävän kuvaus ja EuroEvalin lisäarvot.
- Lex ei ota uusia asiakkaita, ChatGPT canvas on poistettu päämalleista ja RaptorWrite on lopetettu. Ne ovat viitesuunnitelmia, eivät kehittyviä kilpailijoita. Typen, Wordtunen ja LivingWriterin tiedot ovat osin vuodelta 2025 tai päiväämättömiä.
- Tutkimukset ovat pieniä (12–63 osallistujaa), pääosin vuosilta 2022–2024 ja tehty lyhyillä englanninkielisillä teksteillä. Yksikään ei seurannut kokonaisen kirjan kirjoittamista.
- Sanan ja virkkeen tarkkuus diffille proosassa on tämän selvityksen oma päätelmä. Yksikään koodieditori ei tee sitä, eikä sitä ole mitattu.
- Se, että tarkka nimiosuma epäonnistuu suomen taivutuksessa, on päätelmä. Vartalo-osuman toimivuus on yhtä lailla testaamatta.
- Kolmen valmistajan sivuilla (Sudowrite, Type, LivingWriter) oli tekoälylukijoille suunnattua ohjetekstiä. Se käsiteltiin sivun sisältönä, eikä sitä noudatettu.

**Scrivener**
- .scriv-muodon yksityiskohdat ovat varmistamatta. Synkronointikansion tiedostomuodot ja nimet sekä synopsis-tiedostojen sijainti on kuvattu vain käyttäjäraporttien varassa ilman tallennettua linkkiä (4.14).

**Tarkistuskierroksen kysymykset, joissa suositus pysyy**
- Kysyttiin, onko ”teksti ei muutu ennen hyväksyntää” alan yhteinen ratkaisu. Ei ole: tuotteet jakautuvat kahtia (2.1). Sääntö pysyy silti suosituksena, koska se seuraa sinun prioriteeteistasi eikä markkinasta.
- Kysyttiin Cursorin ketjun vastustajien määrää. Yksi tarkistaja laski 78 viestiä ja 58 osallistujaa, toinen näki vain ensimmäisen sivun. Luku on jätetty pois; johtopäätös pysyy, koska yhtään poistoa tukevaa viestiä ei löytynyt ja valmistajan oma perustelu on nyt mukana.

**Valinnat, joissa oli kaksi perusteltua vaihtoehtoa**

Voit kumota jokaisen näistä.
- *Tilannekuvien tallennus:* automaattitallennetun tiedoston ulkopuolelle vai sen sisään. Valinta: lukukohtaiset tilannekuvat projektitiedostoon enimmäismäärällä, mittaus ja erillinen tiedosto vasta tarpeen mukaan.
- *Paikalliset tarkistukset:* toisto ja virkepituus heti vai myöhemmin. Valinta: vältettävät sanat ensin, virkepituus toisena, koska se ei riipu kielestä, ja toisto Voikko-kokeilun jälkeen.
- *Tilojen määrä:* viisi tilaa vai kolme ensin. Valinta: kolme paikallisille tarkistuksille ja Virheellinen mallitarkistusten mukana. Virheellisten määrä mallia kohti on samalla näyttöä mallin laadusta; tämä on oma päätelmäni.
- *Lokin sisältö:* ennen- ja jälkeen-tekstit vai pieni tiedosto. Valinta: tekstit vain yksittäisille muutoksille, joukkohyväksynnälle viittaus tilannekuvaan.
- *Vienti:* erillinen ”Kustantamo (FI)” -esiasetus vai ei. Valinta: ei esiasetusta, koska nykyinen asettelu täyttää jo vaatimukset; saatesivu on valinnainen lisä, koska Atena, Gummerus ja Into pyytävät saatetta.
- *Tutkimuskansio ja Tarinakansio:* muistiinpanojen siirto Tarinakansioon vai kaksi erillistä varastoa. Valinta: Tutkimuskansio jää aineistoksi, jota ei lähetetä, ja kopiointitoiminto yhdistää ne.
- *Tarinakansion ja Tarkistuksen paikka järjestyksessä:* heti ehdotuskerroksen jälkeen vai ytimen jälkeen. Valinta: ytimen jälkeen askelissa 9 ja 10, ennen avustajaa ja siivousta.
- *Kontekstin kokoajan täysi versio:* Tarinakansion jälkeen vai heti tiivistelmien jälkeen. Valinta: samassa askeleessa 9 kuin tiivistelmät ja Tarinakansion siivu A.
- *Äänimuokkaus, generointi, nimistö, hahmonrakentaja, Voikko ja MCP-palvelin:* ks. luvun 6 kuusi kysymystä.

## 9. Lähteet

Kaikki linkit ovat tätä selvitystä varten kerätystä aineistosta. Noin 45 avattiin uudelleen 16.11.2026; kolme osoitti sivulle, jolla väitettä ei ollut, ja ne on korjattu. Loput ovat aineiston kerääjien lukemia samalta päivältä. Sulkeissa on sivun päiväys tai viimeisin päivitys; ”pvm –” tarkoittaa päiväämätöntä sivua, joka luettiin 11/2026. Ainoa aineiston ulkopuolinen osoite on luvussa 8 mainittu Cherry Studion dokumentaatiosivu, jota ei saatu auki.

**Fiktiotyökalut**
- Sudowrite: [Quick Edit](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/quick-edit/2asL35fds36oHAFJN7bYzz) (1/2026), [Write](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/write/pvxUvbQqYybfEosqx1sXjY) (1/2026), [Chat](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/chat/5vbuELXf6LZQnGfVzsEXCV) (5/2026), [Feedback](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/feedback/7Ew1KgpEwabQSgvijq8QNr) (5/2026), [Selection Menu](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/selection-menu/of43eZdiHYoyCtrofDerCZ) (1/2026), [Visibility Settings](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/visibility-settings/4KL8gFeLZP6ep8keUhKVGp) (1/2026), [Chapter Continuity](https://docs.sudowrite.com/using-sudowrite/1ow1qkGqof9rtcyGnrWUBS/chapter-continuity/4KL8gFeLZQ6GSBjDWtSbV6) (1/2026), [tuonti](https://docs.sudowrite.com/resources/ktuxRrzphwp3uTNneRtaos/can-i-import-a-half-finished-work/vxLuRibYRPoDBbtx4EepgL) (1/2026), [muutosloki](https://feedback.sudowrite.com/changelog) (uusin 11/2026), [kumoamiskorjaus](https://sudowrite.featurebase.app/changelog/kimi-k3-safer-undo-chat-reliability-and-more-fixes) (7/2026), [valikon ajoitus ja toinen kumoamiskorjaus](https://feedback.sudowrite.com/changelog/improved-draft-estimates-plus-a-bunch-of-fixes) (8/2026)
- Arvostelut: [Kindlepreneur](https://kindlepreneur.com/sudowrite-review) (6/2026), [ucstrategies](https://ucstrategies.com/news/sudowrite-review-i-tested-the-22-month-ai-against-chatgpt-across-70000-words/) (1/2026)
- Novelcrafter: [proosan generointi](https://www.novelcrafter.com/help/docs/write/generating-prose) (6/2025), [pysäytys-FAQ](https://www.novelcrafter.com/help/faq/ai-and-prompting/how-can-i-stop-prose-generation) (8/2026), [Codex kontekstina](https://www.novelcrafter.com/help/faq/ai-and-prompting/codex-context-in-prompting) (12/2025), [merkinnän rakenne](https://www.novelcrafter.com/help/docs/codex/anatomy-codex-entry) (8/2026), [tiivistelmien vaikutus](https://www.novelcrafter.com/help/faq/plan/outline-impact) (5/2025), [tekstinkorvaus](https://www.novelcrafter.com/help/docs/write/text-replacement-prompts) (12/2025), [Prompt Preview](https://www.novelcrafter.com/help/docs/prompts/prompt-preview) (5/2025), [Progressions](https://www.novelcrafter.com/help/docs/codex/progressions-additions) (3/2025), [chat](https://www.novelcrafter.com/help/docs/chat/the-chat-interface) (5/2025), [AI-isms](https://www.novelcrafter.com/help/faq/ai-and-prompting/ai-isms) (6/2025), [oma malli](https://www.novelcrafter.com/help/faq/ai-connections/does-novelcrafter-provide-its-own-ai) (5/2025), [LM Studio -yhteys](https://www.novelcrafter.com/help/docs/ai-connections/lm-studio) (9/2026), [muutosloki](https://www.novelcrafter.com/changelog/) (uusin 10/2026)
- NovelAI (pvm –): [editori](https://docs.novelai.net/en/text/editor/), [Lorebook](https://docs.novelai.net/en/text/lorebook), [Context Viewer](https://docs.novelai.net/en/text/editor/advancedsettings), [Writer's Toolbox](https://docs.novelai.net/en/text/editor/writerstoolbox), [Memory ja Author's Note](https://docs.novelai.net/en/text/editor/storysettings)
- Muut: [DreamGen](https://v2.dreamgen.com/docs/how-to-write-story) (pvm –), [Mediachance Editorial](https://www.mediachance.com/editorial) (2026), [Draftline](https://draftline.ink) (2026), [Scribsy](https://scribsy.ai) (11/2026), [LivingWriter AI Rewrite](https://guides.livingwriter.com/product-documentation/ai-features/ai-rewrite) (pvm –)

**Yleiset ja tekoälylähtöiset editorit**
- Revise: [muutosten tarkistus](https://revise.io/help/ai-reviewing-changes.md) (11/2026), [MCP](https://revise.io/help/mcp-server.md) (2026)
- Type: [nopeampi muokkaus](https://blog.type.ai/post/introducing-a-faster-way-to-edit-with-ai) (9/2024), [yleiskuva](https://blog.type.ai/post/type-ai-overview) (1/2025)
- Google Docs: [kirjoitus ja muokkaus](https://support.google.com/docs/answer/13951448?hl=en) (2026), [sivupaneeli](https://support.google.com/docs/answer/14206696?hl=en) (2026), [kommentit](https://support.google.com/docs/answer/17133843?hl=en) (2026), [blogi](https://workspace.google.com/blog/product-announcements/reimagining-content-creation) (3/2026), [TechCrunch](https://techcrunch.com/2026/06/17/how-to-turn-off-ai-in-your-google-docs/) (6/2026)
- Microsoft Word: [muokkaus Copilotilla](https://support.microsoft.com/en-us/word/edit-with-copilot-in-word) (2026), [tervetuloa](https://support.microsoft.com/en-us/Word/welcome-to-copilot-in-word) (2026), [blogi](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/copilot-in-word-new-capabilities-for-document-workflows/4508974) (4/2026), [MC1384426](https://mc.merill.net/message/MC1384426) (6/2026), [tiekartta RM557673](https://mc.merill.net/message/RM557673) (2/2026)
- Apple: [WWDC 2024](https://developer.apple.com/videos/play/wwdc2024/10168/) (2024), [macOS 15 -opas](https://support.apple.com/en-euro/guide/mac-help/mchldcd6c260/15.0/mac/15.1) (2024–25), [Apple Intelligencen kielet](https://support.apple.com/en-us/121115) (11/2026), [macOS:n ominaisuudet kielittäin](https://www.apple.com/macos/feature-availability/) (2026), [Pixel Envy](https://pxlnv.com/blog/undesign-of-apple-intelligence-features/) (1/2025)
- Notion: [hyväksyntätilat](https://www.notion.com/help/choose-how-notion-agent-asks-for-your-approval) (2026), [ehdotetut muokkaukset](https://www.notion.com/releases/2026-08-28) (8/2026)
- Craft (pvm –): [muokkaus](https://support.craft.do/en/ai-assistant/editing.md), [Document Review](https://support.craft.do/en/ai-assistant/document-review.md), [Saved Prompts](https://support.craft.do/en/ai-assistant/custom-prompts.md), [käyttö](https://support.craft.do/en/ai-assistant/using.md)
- Lex (ei ota uusia asiakkaita): [etusivu](https://lex.page) (11/2026), [Checks](https://lex.page/read/c563b895-d226-40c6-988f-33add2ff1dac) (2025), [Style Guides](https://lex.page/read/3492a59e-ea19-4733-964a-3adc25b5f3e0) (2025), [Prompt Builder](https://lex.page/read/e359fcf7-deae-47a5-bbfe-13159143bd15) (2025), [token-mittari](https://buttondown.com/lex/archive/new-in-lex-import-files-ask-lex-subtle-redesign) (10/2024)
- [Claude Docs](https://support.claude.com/en/articles/16923645) (2026), [Wordtune](https://www.wordtune.com/rewrite) (2025), [DeepL Write](https://www.deepl.com/en/write) (pvm –), [DeepL API](https://developers.deepl.com/docs/api-reference/improve-text) (pvm –)

**Koodieditorit**
- Cursor: [Cmd+K:n poisto](https://forum.cursor.com/t/cmd-k-has-been-retired-from-terminal/176251) (10–11/2026), [tarkistustyökalun ketju](https://forum.cursor.com/t/bring-back-the-review-tool-from-earlier-cursor-ide-versions/174469) (10/2026), [säännöt](https://cursor.com/docs/rules) (2026)
- VS Code: [inline chat](https://code.visualstudio.com/docs/copilot/chat/inline-chat) (11/2026), [muutosten tarkistus](https://code.visualstudio.com/docs/copilot/chat/review-code-edits) (11/2026), [Copilotin asetukset](https://code.visualstudio.com/docs/copilot/reference/copilot-settings) (2026), [chat](https://code.visualstudio.com/docs/copilot/chat/copilot-chat) (11/2026), [käyttäjäraportti](https://learn.microsoft.com/en-ca/answers/questions/5768240/ctrl-n-undo-behavior-destroys-in-progress-copilot) (2/2026)
- Zed (2026): [Inline Assistant](https://zed.dev/docs/ai/inline-assistant), [Agent Panel](https://zed.dev/docs/ai/agent-panel)
- Devin Desktop (2026): [Command](https://docs.devin.ai/desktop/command/windsurf-overview.md), [diff-alueet](https://docs.devin.ai/desktop/advanced.md), [tilat](https://docs.devin.ai/desktop/devin-local/modes.md), [FAQ](https://docs.devin.ai/desktop/devin-desktop-faq.md)
- Obsidian Copilot (2026): [konteksti](https://docs.obsidiancopilot.com/context-and-mentions/), [agenttitila](https://docs.obsidiancopilot.com/agent-mode-and-tools/)

**Kritiikkityökalut**
- ProWritingAid: [tekstisijainti](https://help.prowritingaid.com/article/390-how-to-use-the-text-location-function) (7/2026), [tilat](https://help.prowritingaid.com/article/382-how-to-change-the-status-of-feedback-in-manuscript-analysis) (11/2025), [ennakkotiedot](https://help.prowritingaid.com/article/422-how-to-fine-tune-your-feedback-in-manuscript-analysis) (4/2026), [tekoälyn käyttö](https://help.prowritingaid.com/article/297-does-prowritingaid-use-ai) (11/2026)
- Arvostelut: [The Write Practice](https://thewritepractice.com/prowritingaid-review-manuscript-analysis-and-virtual-beta-reader/) (8/2025), [Ironshrink](https://ironshrink.substack.com/p/alpha-reader-versus-the-robot) (9/2025)
- AutoCrit: [pistemäärän varaus](https://www.autocrit.com/editing/support/the-new-summary-report/) (pvm –), [Added Context](https://help.autocrit.com/en/articles/12910482-how-to-use-the-added-context-and-history-features) (11/2025)
- [Hemingway](https://hemingwayapp.com/help/docs/highlighted-issues) (pvm –), [Ellipsus](https://ellipsus.com/blog/introducing-ellipsus-plus) (2026)

**Klassiset kirjoitussovellukset**
- Scrivener: [Snapshots](https://www.literatureandlatte.com/blog/use-snapshots-in-scrivener-to-save-versions-of-your-projects) (7/2022), [foorumi](https://forum.literatureandlatte.com/t/adding-ai-tools-to-scrivener/133222?page=19) (5–6/2026), [yleiskuva](https://www.literatureandlatte.com/scrivener/overview) (2026)
- Ulysses: [Writing Tools](https://help.ulysses.app/dive-into-editing/writing-tools) (9/2026), [kielioppi- ja tyylitarkistus](https://help.ulysses.app/en_US/the-dashboard/grammar-and-style-check) (2025–26)
- iA Writer: [Authorship](https://ia.net/writer/support/editor/authorship) (10/2025), [Applen työkalut hallinnassa](https://ia.net/topics/how-to-stay-in-control-of-apples-ai-writing-tools) (10/2024), [tekoäly haastattelijana](https://ia.net/topics/turning-the-tables-on-ai) (6/2024)
- Dabble: [Certificate of Authorship](https://www.dabblewriter.com/docs/reference/certificate-of-authorship/) (11/2026), [julkaisutiedot](https://www.dabblewriter.com/docs/reference/release-notes) (11/2026), [sanasto](https://www.dabblewriter.com/docs/reference/glossary) (2026), [vienti](https://www.dabblewriter.com/docs/import-export-printing/export-your-manuscript) (2026)
- [PlotForge Desktop](https://alternativeto.net/software/plotforge-desktop/about/) (5/2026)

**Tutkimus** (vuosi ja osallistujat)
- [Holding the Line](https://arxiv.org/html/2404.13165v1) (2024; 37 kirjoittajaa)
- [MFA-kirjoittajat](https://ar5iv.labs.arxiv.org/html/2309.12570) (2023; 17 kirjoittajaa, 30 tarinaa, GPT-3.5)
- [HaLLMark](https://arxiv.org/html/2311.13057v4) (2024; 13 kirjoittajaa, 20 minuutin istunnot)
- [personointi ja ääni](https://arxiv.org/html/2411.13032v1) (2024; 19 kirjoittajaa ja 30 lukijaa)
- [lukijapersoonat](https://arxiv.org/abs/2309.10433) (2024; 5 ja 11 osallistujaa)
- [ABScribe](https://arxiv.org/abs/2310.00117) (2024; 12 kirjoittajaa; vain tiivistelmä luettu)
- [CoAuthor](https://ar5iv.labs.arxiv.org/html/2201.06796) (2022; 63 joukkoistettua kirjoittajaa, 1 445 istuntoa)
- [CHI 2026, ehdotusten arviointi](https://arxiv.org/abs/2603.10374) (2026; 19 haastattelua ja 1 291 kirjoitusistuntoa)
- [Authors Guild, parhaat käytännöt](https://authorsguild.org/resource/ai-best-practices-for-authors/) (5/2026)

**Paikalliset mallit ja muisti**
- Ollama (2026): [kontekstin pituus](https://docs.ollama.com/context-length), [Anthropic-yhteensopivuus](https://docs.ollama.com/api/anthropic-compatibility)
- [KoboldCpp](https://github.com/LostRuins/koboldcpp/wiki) (10/2026), [text-generation-webui, parametrit](https://github.com/oobabooga/text-generation-webui/wiki/03-%E2%80%90-Parameters-Tab) (3/2026)
- SillyTavern (2026): [World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/), [Summarize](https://docs.sillytavern.app/extensions/summarize/), [vektorointi](https://docs.sillytavern.app/extensions/chat-vectorization/)

**Suomi ja käsikirjoitus**
- Mallit: [EuroEval, suomi, täysi taulukko](https://raw.githubusercontent.com/EuroEval/leaderboards/main/leaderboards/finnish_all.csv) (5/2026), [FIN-bench-v2](https://arxiv.org/html/2512.13330) (12/2025), [Poro 2](https://huggingface.co/LumiOpen/Llama-Poro-2-70B-Instruct) (2025)
- Kielentarkistus: [LanguageTool](https://dev.languagetool.org/languages) (3/2025), [Grammarly](https://support.grammarly.com/hc/en-us/articles/115000090971-What-languages-does-Grammarly-support) (pvm –), [Microsoft 365:n kielet](https://learn.microsoft.com/en-us/microsoft-365-apps/deploy/overview-deploying-languages-microsoft-365-apps) (12/2025), [Copilotin kielet](https://support.microsoft.com/en-us/office/supported-languages-for-microsoft-copilot-94518d61-644b-4118-9492-617eea4801d8) (9/2026), [Electronin oikeinkirjoitus](https://www.electronjs.org/docs/latest/tutorial/spellchecker) (pvm –), [Lingsoft](https://lingsoft.ai/services/language-intelligence-solutions/quality-checker/) (pvm –)
- Voikko: [sivu](https://voikko.puimula.org/) (2026), [julkaisut](https://voikko.puimula.org/releases.html) (5/2025 ja 4/2026), [kirjaston lisenssi](https://raw.githubusercontent.com/voikko/corevoikko/master/libvoikko/README) (pvm –), [sanaston lisenssi](https://raw.githubusercontent.com/voikko/corevoikko/master/voikko-fi/README.md) (pvm –), [kielioppisäännöt](https://raw.githubusercontent.com/voikko/corevoikko/master/libvoikko/src/grammar/error.hpp) (pvm –), [JavaScript-käännös](https://github.com/voikko/corevoikko/wiki/JavaScript) (pvm –), [Homebrew](https://formulae.brew.sh/formula/libvoikko) (4.3.3), [Oikofix](https://oikofix.com/) (2021)
- Kielitoimiston ohjepankki (2026, sivuilla ei päiväystä): [lainausmerkit](https://www.kielitoimistonohjepankki.fi/ohje/lainausmerkit/), [puolilainausmerkki](https://kielitoimistonohjepankki.fi/ohje/puolilainausmerkki/), [ajatusviiva](https://kielitoimistonohjepankki.fi/ohje/ajatusviiva/), [vuorosanaviiva](https://kielitoimistonohjepankki.fi/ohje/lainausmerkit-ja-vuorosanaviiva/), [prosentti](https://kielitoimistonohjepankki.fi/ohje/prosentti/), [päiväys](https://kielitoimistonohjepankki.fi/ohje/ajanilmaukset-paivays-ja-vuosiluku/), [kellonajat](https://kielitoimistonohjepankki.fi/ohje/ajanilmaukset-kellonajat-merkinta-ja-taivutus/)
- [Tiptap Typography](https://tiptap.dev/docs/editor/extensions/functionality/typography) (pvm –)
- Kustantajat (pvm –): [WSOY](https://www.wsoy.fi/haluatko-kirjailijaksi/), [Siltala](https://siltala.fi/sivu/haluatko-kirjailijaksi/), [Gummerus](https://gummerus.fi/pages/kasikirjoitukset), [Atena](https://atena.fi/haluatko-kirjailijaksi), [Into](https://intokustannus.fi/into-kirjailijaksi/)

**FAUSTin koodi (luettu, ei ajettu)**
- `/Volumes/kovalevy 3/editori ai/app.js`, `electron.js`, `preload.js`, `index.html`, `package.json`, `scripts/post-build.js`
- `/Volumes/kovalevy 3/editori ai/src/components/FaustEditor.js`, `AIProviderSettings.js`, `ClaudeChat/ClaudeChat.js`, `Modals/LocationSheetModal.js`, `Modals/ChapterSheetModal.js`
- `/Volumes/kovalevy 3/editori ai/src/utils/CommandManager.js`, `src/utils/voiceInput.js`, `src/utils/constants.js`, `src/editor/textTools.js`, `utils/manuscript.js`
- `/Volumes/kovalevy 3/editori ai/src/services/ai/HybridWritingFlow.js`, `src/services/story/PlotThreadTracker.js`, `src/services/validation/ConsistencyChecker.js`
- `/Volumes/kovalevy 3/editori ai/test/utils/manuscript.test.js`, `test/editor/textTools.test.js`

## Liite A. Koodista tarkistetut kohdat (16.11.2026)

Kaikki on luettu haarasta `cherry-gateway-codemirror` (HEAD `2d68cfb`). Mitään ei ajettu, ja työpuu oli puhdas.

**Tietojen menetys ja tila**
- `app.js:1877` ajaa `setProject({ ...project })` jokaisen kutsun jälkeen. BatchProcessor ja RefinementManager saavat ensimmäisen renderöinnin `callAIWithMode`-funktion (`app.js:3553–3569`, riippuvuuslista `[]` rivillä 3594). Päivitysefekti (`3598–3622`) vaihtaa funktion vain ConsistencyCheckerille.
- `app.js:1721` valitsee uuden aktiivisen luvun poistoa edeltävästä taulukosta. `updateChapterContent` kirjoittaa `activeChapterId`:llä (`app.js:776–781`), vaikka näkyvä luku tulee varavalinnasta (`app.js:501`).
- `projectRef` on jo olemassa (`app.js:483`, `506`). `setChapterText` (`app.js:1321`) vie minkä tahansa luvun muutoksen kumoamishistoriaan.
- Tilannekuvan palautus (`app.js:1189–1207`) korvaa rakenteen ottamatta kopiota; vahvistusikkuna vain suosittelee sitä. Tilannekuvan luonti on rivillä `1159–1177`.
- ”Korvaa luku” (`app.js:3095–3105`) kirjoittaa esikatselun koko luvun tilalle. Keskustelun ”Lisää” (`app.js:12380–12385`) liittää vastauksen luvun loppuun.
- `LocationSheetModal.js:378–380` renderöi `{value, label}` -olion `<option>`-elementin sisällöksi. Virherajaa ei ole koko sovelluksessa.

**Tekoälykutsut**
- `electron.js:1084`: `max_tokens` jää määrittelemättä, kun kutsuja antaa olion. `electron.js:872–874` palauttaa puretut avaimet; kutsujat `app.js:536–553`, `1790–1800` ja `AIProviderSettings.js:126–127`.
- Peruutusta ei ole missään: haku `abort`, `AbortController` ja `signal` ei tuota osumia tiedostoista `electron.js`, `preload.js`, `src/services/ai` eikä ClaudeChatista.
- Kovakoodatut mallitunnisteet: `electron.js:957` (yhteystesti), `1090`, `1128`, `1191`; projektin oletukset `app.js:134–135`. Suoratoistokäsittelijän lämpötilan oletus on 0,7 (`electron.js:1114`).
- `createCherryClient` (`electron.js:125–134`) vaihtaa tunnisteet, joissa ei ole kaksoispistettä, valittuun yhdyskäytävän malliin ja poistaa `thinking`-parametrin. `messageText` (`electron.js:115–119`) ohittaa ajattelulohkot.
- Vanhat kutsujat: `callAIWithMode` (`app.js:1851`), Liminal-paneeli (`app.js:3323`), `HybridWritingFlow.js:214`, `PlotThreadTracker.js:78–84`, `ConsistencyChecker.js:294–300`, ClaudeChat (`ClaudeChat.js:107` ajattelu, `138` suoratoisto, `224` valintaruutu).
- Asetusvarastot: `config.json` (`electron.js:20`), `ui-prefs.json` (`electron.js:205`), kanava `ai:set-provider` (`electron.js:892–902`). Mallivalitsin: `AIProviderSettings.js:238–254` (”Hae mallit”, ”Testaa yhteys”).
- Anthropic SDK 0.67.1:n `MessageStream.abort()` on olemassa, ja Cherry-kääre palauttaa saman virtaolion (`electron.js:155`).

**Editori, kumoaminen ja näppäimet**
- `FaustEditor.js`: `setHighlights` korvaa hakukorostukset (rivit 67–85), joten tarkistushavainnot tarvitsevat oman kenttänsä. Editorin oma muutos kulkee `onChange`-kutsun kautta `updateChapterContent`-funktioon (rivit 307–313, `app.js:5657`), ja `onChange` välittää vain tekstin.
- `app.js:5658–5659`: editorin isäntä kutsuu `handleTextSelection`-funktiota (`3108`) jokaisesta hiiren ja näppäimen vapautuksesta.
- `runHistory` (`app.js:902–908`) käyttää kentän omaa kumoamista vain, kun kohdistettu kenttä ei ole `.faust-editor-host`-elementin sisällä.
- Ikkunatason Esc-käsittelijä (`app.js:590–637`) sulkee dialogit tärkeysjärjestyksessä.
- `CommandManager.js:140–175`: enintään kahden merkin muutos on ”näppäily” ja voi yhdistyä edelliseen kumoaskeleeseen. `CommandManager` luodaan tekoälymoduulien lataajassa (`app.js:3490–3499`, `3527`); `new window.RefinementManager` (`3563`) on vartioimaton.
- Sulkemisvahti (`electron.js:352–371`) tuntee vain tallentamattoman tekstin (`rendererDirty`).
- Näppäimet: editori asentaa vain `standardKeymap`in (`FaustEditor.js:292–296`). Siinä ei ole sidontaa yhdistelmille Cmd+Enter (`Mod-Enter` kuuluu `defaultKeymap`iin, jota FAUST ei käytä) eikä Shift+Cmd+Backspace. Valikossa (`electron.js`) ei ole kumpaakaan, eikä yhdistelmää Shift+Cmd+K. Cmd+, on jo ”Asetukset…” (`electron.js:424`). Shift+Cmd+V on äänimuokkauksen käytössä (`app.js:640`).
- `attachContextMenu` (`electron.js:299–340`) rakentaa valikon mille tahansa muokattavalle kentälle.

**Tekstimalli, vienti ja tuonti**
- Kappale on yksi rivi (`utils/manuscript.js:87`). Rivin alun `- ` on luettelo (`utils/manuscript.js:103`, `src/editor/textTools.js:129`), ja Enter jatkaa luetteloa (`FaustEditor.js:114`).
- Vienti: docx 12 pt (`utils/manuscript.js:524`) ja riviväli 1,5 (`:510`); RTF `\fs24` (`:381`) ja `\sl360\slmult1` (`:411`); HTML ja PDF 12 pt, riviväli 1,6, A4 ja 2,5 cm:n marginaalit (`:281`, `:298`).
- Tuonti: `importDocument` on tiedostokohtainen ja lukee txt-, md- ja docx-tiedostot (`utils/manuscript.js:912–923`). Kirjan nimen päättely on riveillä `701–713`.
- Nykyinen sanadiffi `computeTextDiff` (`app.js:1110`) on käytössä äänimuokkauksen vertailussa (`6017`) ja versioiden vertailussa (`10521`). Sanan määritelmä `WORD_CHAR` on rivillä `src/editor/textTools.js:12` ja `buildSearchPattern` rivillä `279`.
- Testit: `test/editor/textTools.test.js` 35 tapausta, `test/utils/manuscript.test.js` 29 tapausta. Jestille ei ole Babel-asetuksia, ja `textTools.js` on CommonJS-moduuli, joka testataan node-ympäristössä.

**Paketit ja ympäristö**
- `@codemirror/state` 6.7.6 on kaksoispaketti (`import` → `dist/index.js`, `require` → `dist/index.cjs`); usean kopion virheilmoitus on rivillä `dist/index.js:2016`. Vain Jest-testitiedosto saa ladata `.cjs`-koosteen (4.1).
- `@codemirror/view` vie `showTooltip`-toiminnon; `@codemirror/merge` ei ole asennettu; `fast-diff` on vain välillinen riippuvuus.
- Electron ^30.5.1; macOS:n valikkoroolit `toggleSmartQuotes`, `toggleSmartDashes`, `toggleTextReplacement` ja `showSubstitutions` ovat tyyppimäärittelyssä (`node_modules/electron/electron.d.ts:19462–19470`).
- Oikeinkirjoitus on päällä ikkunassa ja editorissa (`electron.js:269`, `292–294`, `555`; `FaustEditor.js:305`). Lisää → Erikoismerkki on riveillä `electron.js:509–518`. Tutkimuskansio: `electron.js:540`, `app.js:11645–11960` (muistiinpanon luonti `11719`).
- Puheentunnistus käyttää selaimen rajapintaa (`app.js:3447`, `src/utils/voiceInput.js:18`).
- `package.json`:ssa ei ole lisenssikenttää; jakelukohde on dmg.
- Poistojen johdotus: `scripts/post-build.js:10–36` ja `76–80`, `index.html:40–53`, lataajan lista `app.js:3490–3499`.

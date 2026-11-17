// Askeleen 0 mallikoe 16.11.2026. Uusinta: python3 <withkey.py> CHERRY_API_KEY node scripts/step0/run.js --tag <nimi>; sitten node scripts/step0/score.js --tag <nimi>.
//
// Rakentaa tiedoston dataset.json. Jokainen kappale kirjoitetaan ensin virheettömänä (clean),
// ja virheet istutetaan korvaamalla oikea muoto väärällä. Näin oikea ja väärä muoto ovat aina
// tiedossa ja yksikäsitteisiä. Tekstit on kirjoitettu tätä koetta varten; ne eivät ole lainauksia.
//
// Paikkamerkit ⟦n⟧ vastaavat sitä, mitä maskSpans tekisi: [TODO: …] on yksi merkki,
// <u>…</u> on kaksi merkkiä (avaus ja sulku).
//
// Käyttö: node scripts/step0/build_dataset.js [--data <kansio>] [--out <kansio>]
//   --data  kansio, jonka dataset.json-tiedostoon tulosta verrataan (oletus test/fixtures/step0-gateway)
//   --out   kansio, johon dataset.json kirjoitetaan (oletus: uusi kansio käyttöjärjestelmän
//           väliaikaiskansiossa; kansioon test/fixtures ei kirjoiteta, ellei --out osoita sinne)
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const n = process.argv[i + 1]; if (n && !n.startsWith('--')) { args[a.slice(2)] = n; i++; } else args[a.slice(2)] = true; }
}
const DATA_DIR = path.resolve(typeof args.data === 'string' ? args.data : path.join(ROOT, 'test', 'fixtures', 'step0-gateway'));

// genre: fiktio | tieto | vuorosana | kontrolli
// errors: [oikea, väärä, tyyppi]
const ITEMS = [
  // ---------- erä 1 ----------
  { id: 'F1', genre: 'fiktio', batch: 1,
    clean: 'Aamulla järvi oli tyyni kuin lasi. Aino seisoi laiturilla paljain jaloin ja katseli, kuinka sumu nousi hitaasti vastarannan kuusikosta. Hän tiesi, että isä palaisi vasta illalla. Kukaan ei kysyisi, missä hän oli ollut.',
    errors: [['tiesi, että', 'tiesi että', 'pilkku'], ['vastarannan', 'vasta rannan', 'yhdyssana'], ['kuusikosta', 'kuusikkosta', 'oikeinkirjoitus']] },
  { id: 'N1', genre: 'tieto', batch: 1,
    clean: 'Suomen metsistä noin kaksi kolmasosaa on yksityisten perheiden omistuksessa. Tämä selittää, miksi metsäpolitiikka herättää niin voimakkaita tunteita: päätökset koskevat suoraan lähes joka kymmenennen suomalaisen omaisuutta. Keskustelussa unohtuu usein, että omistajien tavoitteet vaihtelevat suuresti.',
    errors: [['metsäpolitiikka', 'metsä politiikka', 'yhdyssana'], ['selittää, miksi', 'selittää miksi', 'pilkku'], ['tavoitteet vaihtelevat', 'tavoitteet vaihtelee', 'kongruenssi']] },
  { id: 'D1', genre: 'vuorosana', batch: 1,
    clean: '– Mä en tiiä, mitä sä oikein odotit. Emmä voi olla joka paikassa yhtä aikaa.',
    errors: [] },
  { id: 'C1', genre: 'kontrolli', batch: 1,
    clean: 'Sade alkoi iltapäivällä ja jatkui koko yön. Aamulla piha oli täynnä lammikoita, ja omenapuun alimmat oksat roikkuivat melkein maassa. Kissa istui ikkunalaudalla ja seurasi pisaroita, jotka valuivat lasia pitkin.',
    errors: [] },
  { id: 'F2', genre: 'fiktio', batch: 1,
    clean: 'Vanha kirjakauppa sijaitsi kapealla kujalla, jonne aurinko ei paistanut edes keskikesällä. Hyllyt notkuivat pölyisiä niteitä, ja tiskin takana istui mies, joka ei nostanut katsettaan sanomalehdestä. Ovikello kilahti, kun astuin sisään.',
    errors: [['Hyllyt notkuivat', 'Hyllyt notkui', 'kongruenssi'], ['sanomalehdestä', 'sanoma lehdestä', 'yhdyssana'], ['mies, joka', 'mies joka', 'pilkku']] },
  { id: 'N2', genre: 'tieto', batch: 1,
    placeholders: { '⟦2⟧': '<u>', '⟦3⟧': '</u>' },
    clean: 'Vuosina 1867–1868 Suomea koetteli nälänhätä, joka tappoi lähes kahdeksan prosenttia väestöstä. Katastrofin syynä oli ⟦2⟧poikkeuksellisen kylmä kevät⟦3⟧, mutta yhtä paljon siihen vaikuttivat hallinnon hidas reagointi ja huonot kulkuyhteydet. Viljaa olisi ollut saatavilla, mutta sitä ei ehditty kuljettaa perille ennen jäiden tuloa.',
    errors: [['1867–1868', '1867-1868', 'typografia'], ['kulkuyhteydet', 'kulku yhteydet', 'yhdyssana'], ['reagointi', 'reakointi', 'oikeinkirjoitus'], ['saatavilla, mutta', 'saatavilla mutta', 'pilkku']] },
  { id: 'D2', genre: 'vuorosana', batch: 1,
    clean: '– Elä sinä poeka hättäele, kyllä tässä vielä keritään, mummo sanoi ja kaatoi lisää kahvia.',
    errors: [['lisää kahvia', 'lisää kahiva', 'oikeinkirjoitus']] },

  // ---------- erä 2 ----------
  { id: 'F3', genre: 'fiktio', batch: 2,
    placeholders: { '⟦1⟧': '[TODO: tarkista aikataulu]' },
    clean: 'Juna lähti Kouvolasta kello kuusi ⟦1⟧, ja vaunussa oli vain kolme matkustajaa. Ikkunan takana pellot liukuivat ohi harmaina ja märkinä. Elias painoi otsansa kylmää lasia vasten ja yritti olla ajattelematta kirjettä, joka poltteli hänen povitaskussaan.',
    errors: [['povitaskussaan', 'povi taskussaan', 'yhdyssana'], ['kylmää lasia', 'kylmä lasia', 'kongruenssi'], ['ajattelematta', 'ajatelematta', 'oikeinkirjoitus']] },
  { id: 'N3', genre: 'tieto', batch: 2,
    clean: 'Lukeminen ei ole synnynnäinen taito, vaan aivot joutuvat opettelemaan sen yhdistämällä näkö- ja kielialueita uudella tavalla. Tutkijat ovat havainneet, että sujuvan lukijan aivoissa kirjainten tunnistus tapahtuu alle sekunnin kymmenesosassa. Siksi harjoittelun määrä ratkaisee enemmän kuin menetelmä.',
    errors: [['aivot joutuvat', 'aivot joutuu', 'kongruenssi'], ['havainneet, että', 'havainneet että', 'pilkku'], ['synnynnäinen', 'synnynäinen', 'oikeinkirjoitus'], ['kymmenesosassa', 'kymmenes osassa', 'yhdyssana']] },
  { id: 'D3', genre: 'vuorosana', batch: 2,
    clean: '– Kattokaas nääs, ei toi moottori lähe käyntiin, jos siihen ei tuu bensaa.',
    errors: [['käyntiin', 'käynttiin', 'oikeinkirjoitus']] },
  { id: 'C2', genre: 'kontrolli', batch: 2,
    placeholders: { '⟦6⟧': '<u>', '⟦7⟧': '</u>' },
    clean: 'Opettaja kirjoitti taululle yhden sanan: ”kärsivällisyys”. Sitten hän kääntyi luokan puoleen ja odotti niin kauan, että ⟦6⟧viimeinenkin kuiskaus⟦7⟧ oli vaiennut.',
    errors: [] },
  { id: 'F4', genre: 'fiktio', batch: 2,
    clean: 'Mummo kutsui sitä ”hiljaiseksi huoneeksi”, vaikka siellä tikitti kolme kelloa yhtä aikaa. Lapsena kuvittelin, että kellot kävivät kilpaa ja että se, joka ehtisi ensin keskiyöhön, saisi palkinnoksi koko talon.',
    errors: [['”hiljaiseksi huoneeksi”', '"hiljaiseksi huoneeksi"', 'typografia'], ['kuvittelin, että', 'kuvittelin että', 'pilkku'], ['keskiyöhön', 'keski yöhön', 'yhdyssana'], ['kellot kävivät', 'kellot kävi', 'kongruenssi']] },
  { id: 'N4', genre: 'tieto', batch: 2,
    clean: 'Kyselyn mukaan 62 % vastaajista piti etätyötä ”selvästi tehokkaampana” kuin toimistolla työskentelyä. Tulosta on kuitenkin tulkittava varoen, koska otos painottui asiantuntijatehtäviin eikä mukana ollut juuri lainkaan palvelualojen työntekijöitä.',
    errors: [['62 %', '62%', 'typografia'], ['varoen, koska', 'varoen koska', 'pilkku'], ['asiantuntijatehtäviin', 'asiantuntija tehtäviin', 'yhdyssana']] },
  { id: 'D4', genre: 'vuorosana', batch: 2,
    clean: '– Kyllä mä sen tierän, notta se on vaikiaa, mutta ei auta itkiä markkinoolla.',
    errors: [] },

  // ---------- erä 3 ----------
  { id: 'F5', genre: 'fiktio', batch: 3,
    clean: 'Talvi tuli sinä vuonna aikaisin. Lokakuun lopussa satama oli jo jäässä, ja kalastajat vetivät veneensä rantaan, ennen kuin ehtivät paikata verkkojaan. Me lapset luistelimme laiturin ympärillä iltaan asti, kunnes äidit huusivat meidät kotiin.',
    errors: [['ennen kuin', 'ennenkuin', 'yhdyssana'], ['kalastajat vetivät', 'kalastajat veti', 'kongruenssi'], ['luistelimme', 'luistellimme', 'oikeinkirjoitus'], ['asti, kunnes', 'asti kunnes', 'pilkku']] },
  { id: 'N5', genre: 'tieto', batch: 3,
    placeholders: { '⟦4⟧': '[TODO: lähde ja tarkka vuosi]' },
    clean: 'Kahvi saapui Suomeen 1700-luvun alussa ⟦4⟧, mutta tavallisen kansan juomaksi se yleistyi vasta sata vuotta myöhemmin. Aluksi viranomaiset yrittivät rajoittaa sen käyttöä ylellisyysveroilla ja jopa täyskielloilla, jotka eivät kuitenkaan tehonneet. Nykyään suomalaiset juovat kahvia enemmän kuin mikään muu kansa.',
    errors: [['viranomaiset yrittivät', 'viranomaiset yritti', 'kongruenssi'], ['ylellisyysveroilla', 'ylellisyys veroilla', 'yhdyssana'], ['myöhemmin', 'myöhemin', 'oikeinkirjoitus']] },
  { id: 'D5', genre: 'vuorosana', batch: 3,
    clean: '– Oottekste nähny mun avaimia? Mä jätin ne eilen tohon pöydälle, ja nyt niitä ei oo missään.',
    errors: [['pöydälle', 'pöydläle', 'oikeinkirjoitus']] },
  { id: 'C3', genre: 'kontrolli', batch: 3,
    clean: 'Suomen kirjakielen perusta luotiin 1500-luvulla, kun Mikael Agricola käänsi Uuden testamentin suomeksi. Hänen ratkaisunsa – esimerkiksi monien äänteiden merkintätavat – vaikuttivat kirjoitettuun kieleen vuosisatojen ajan.',
    errors: [] },
  { id: 'F6', genre: 'fiktio', batch: 3,
    clean: 'Hän avasi laatikon – sen saman, jota oli vältellyt koko syksyn – ja nosti esiin nipun valokuvia. Kuvissa nauroi nuori nainen, jonka kasvoja hän ei aluksi tunnistanut omikseen. Kädet alkoivat vapista.',
    errors: [['laatikon – sen', 'laatikon - sen', 'typografia'], ['Kädet alkoivat', 'Kädet alkoi', 'kongruenssi'], ['tunnistanut', 'tunistanut', 'oikeinkirjoitus']] },
  { id: 'N6', genre: 'tieto', batch: 3,
    clean: 'Hyvä tietokirja ei tyydy luettelemaan faktoja. Se rakentaa niistä väitteen. Kirjoittajan on päätettävä, mitä hän jättää pois, sillä jokainen ylimääräinen sivupolku heikentää pääajatusta. Karsiminen on vaikeaa juuri siksi, että kaikki kerätty aineisto tuntuu tärkeältä.',
    errors: [['päätettävä, mitä', 'päätettävä mitä', 'pilkku'], ['pääajatusta', 'pää ajatusta', 'yhdyssana'], ['ylimääräinen', 'ylimäärinen', 'oikeinkirjoitus']] },
  { id: 'D6', genre: 'vuorosana', batch: 3,
    placeholders: { '⟦5⟧': '[TODO: kuka puhuu?]' },
    clean: '– Mie oon sanonu sulle monta kertaa, että sinne ei mennä yksin ⟦5⟧. Jää pettää keväällä ennen ko arvaakaan.',
    errors: [['monta kertaa', 'monta ketraa', 'oikeinkirjoitus']] },

  // ---------- erä 4 ----------
  { id: 'F7', genre: 'fiktio', batch: 4,
    clean: 'Kirkonkylän raitilla ei liikkunut ketään. Kaupan ikkunassa paloi yksinäinen valo, ja jossain haukkui koira, jonka ääni kantoi kauas pakkasessa. Marketta veti kaulahuivin tiukemmalle ja lähti kävelemään kohti asemaa, vaikka tiesi, ettei viimeinen bussi enää odottaisi.',
    errors: [['kaulahuivin', 'kaula huivin', 'yhdyssana'], ['bussi enää', 'bussi enään', 'oikeinkirjoitus'], ['asemaa, vaikka', 'asemaa vaikka', 'pilkku']] },
  { id: 'N7', genre: 'tieto', batch: 4,
    clean: 'Itämeri on matala ja lähes suljettu allas, minkä vuoksi sen vesi vaihtuu erittäin hitaasti. Ravinteet, jotka päätyvät mereen pelloilta ja jätevesistä, kiertävät siellä vuosikymmeniä. Tästä syystä rehevöitymisen pysäyttäminen vaatii kärsivällisyyttä: tulokset näkyvät vasta pitkän ajan kuluttua.',
    errors: [['vuosikymmeniä', 'vuosi kymmeniä', 'yhdyssana'], ['tulokset näkyvät', 'tulokset näkyy', 'kongruenssi'], ['Ravinteet, jotka', 'Ravinteet jotka', 'pilkku']] },
  { id: 'D7', genre: 'vuorosana', batch: 4,
    clean: '– Siis ihan oikeesti, se vaan käveli ohi eikä sanonu mitään. Mä olin sillee et okei, ei sit.',
    errors: [] },
  { id: 'C4', genre: 'kontrolli', batch: 4,
    clean: 'Uni vaikuttaa muistiin enemmän kuin yleensä ajatellaan. Syvän unen aikana aivot siirtävät päivän tapahtumia pitkäkestoiseen muistiin, ja siksi valvottu yö heikentää oppimista vielä seuraavanakin päivänä.',
    errors: [] },
  { id: 'F8', genre: 'fiktio', batch: 4,
    clean: 'Isoisän verstaassa tuoksui terva ja tuore puu. Höylät riippuivat seinällä suuruusjärjestyksessä, ja jokaisella työkalulla oli oma paikkansa, jota ei saanut muuttaa. Kun hän kuoli, kukaan ei raaskinut koskea niihin moneen vuoteen.',
    errors: [['Höylät riippuivat', 'Höylät riippui', 'kongruenssi'], ['suuruusjärjestyksessä', 'suuruus järjestyksessä', 'yhdyssana'], ['kuoli, kukaan', 'kuoli kukaan', 'pilkku']] },
  { id: 'F9', genre: 'fiktio', batch: 4,
    clean: 'Myrsky katkaisi sähköt puoli yhdeksältä. Sytytin kynttilän ja kuuntelin, miten tuuli riuhtoi peltikattoa ja miten vanhat hirret narisivat sen otteessa. Pimeässä talo tuntui suuremmalta kuin päivällä, melkein vieraalta… Silti en olisi vaihtanut sitä mihinkään.',
    errors: [['vieraalta…', 'vieraalta...', 'typografia'], ['peltikattoa', 'pelti kattoa', 'yhdyssana'], ['hirret narisivat', 'hirret narisi', 'kongruenssi'], ['kuuntelin, miten', 'kuuntelin miten', 'pilkku']] },
  { id: 'C5', genre: 'kontrolli', batch: 4,
    clean: 'Laiva irtosi laiturista hitaasti, melkein vastahakoisesti. Kannella seisoi ihmisiä, jotka vilkuttivat rannalle jääneille, mutta Henrik ei kääntynyt katsomaan taakseen. Hän oli päättänyt, ettei jättäisi tälle kaupungille edes hyvästejä.',
    errors: [] }
];

const TYPES = ['yhdyssana', 'pilkku', 'kongruenssi', 'oikeinkirjoitus', 'typografia'];
// Osuma lasketaan vain sanarajalla, jotta "kellot kävi" ei osu muotoon "kellot kävivät".
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bounded = (needle) => new RegExp(
  (/^[\p{L}\p{N}]/u.test(needle) ? '(?<![\\p{L}\\p{N}])' : '') + esc(needle) + (/[\p{L}\p{N}]$/u.test(needle) ? '(?![\\p{L}\\p{N}])' : ''), 'gu');
const count = (hay, needle) => (hay.match(bounded(needle)) || []).length;

const out = [];
const problems = [];
for (const it of ITEMS) {
  let text = it.clean;
  const errors = [];
  for (const [right, wrong, type] of it.errors) {
    if (!TYPES.includes(type)) problems.push(`${it.id}: tuntematon tyyppi ${type}`);
    if (count(it.clean, right) !== 1) problems.push(`${it.id}: "${right}" esiintyy ${count(it.clean, right)} kertaa puhtaassa tekstissä`);
    if (count(it.clean, wrong) !== 0) problems.push(`${it.id}: väärä muoto "${wrong}" on jo puhtaassa tekstissä`);
    text = text.replace(right, wrong);
    errors.push({ wrong, right, type });
  }
  for (const e of errors) {
    if (count(text, e.wrong) !== 1) problems.push(`${it.id}: "${e.wrong}" esiintyy ${count(text, e.wrong)} kertaa virheellisessä tekstissä`);
    if (count(text, e.right) !== 0) problems.push(`${it.id}: oikea muoto "${e.right}" on yhä virheellisessä tekstissä`);
  }
  const marks = text.match(/⟦\d+⟧/g) || [];
  const declared = Object.keys(it.placeholders || {});
  if (marks.slice().sort().join() !== declared.slice().sort().join()) problems.push(`${it.id}: paikkamerkit eivät täsmää`);
  if (/["']|\.\.\.| - /.test(it.clean)) problems.push(`${it.id}: puhtaassa tekstissä on suora lainausmerkki, kolme pistettä tai yhdysmerkki viivana`);
  if (it.genre === 'vuorosana' && !it.clean.startsWith('– ')) problems.push(`${it.id}: vuorosana ei ala viivalla`);
  if (it.genre === 'kontrolli' && errors.length) problems.push(`${it.id}: kontrollissa on virheitä`);
  if ((it.genre === 'fiktio' || it.genre === 'tieto') && (errors.length < 2 || errors.length > 4)) problems.push(`${it.id}: virheitä ${errors.length}`);
  out.push({
    id: it.id,
    genre: it.genre,
    batch: it.batch,
    text,
    clean: it.clean,
    errors,
    placeholders: it.placeholders || {}
  });
}

const byGenre = {};
const byType = {};
for (const o of out) {
  byGenre[o.genre] = (byGenre[o.genre] || 0) + 1;
  for (const e of o.errors) byType[e.type] = (byType[e.type] || 0) + 1;
}
const batches = {};
for (const o of out) batches[o.batch] = (batches[o.batch] || 0) + 1;

if (problems.length) {
  console.error('ONGELMIA:\n' + problems.join('\n'));
  process.exit(1);
}

const dataset = {
  description: 'Askeleen 0 mallikoe (Kielenhuolto, selvitys 4.4). 28 tätä koetta varten kirjoitettua suomenkielistä kappaletta. Kenttä text on mallille lähetettävä rivi (virheet istutettu), clean on virheetön versio. Vuorosanojen puhekieli ja murre ovat tahallisia. Paikkamerkit ⟦n⟧ vastaavat [TODO: …]-merkintöjä ja <u>-tageja.',
  created: '2026-11-16',
  counts: { lines: out.length, byGenre, plantedErrors: Object.values(byType).reduce((a, b) => a + b, 0), byType, placeholders: out.reduce((n, o) => n + Object.keys(o.placeholders).length, 0) },
  items: out
};
const OUT_DIR = typeof args.out === 'string' ? path.resolve(args.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'faust-step0-'));
fs.mkdirSync(OUT_DIR, { recursive: true });
const built = JSON.stringify(dataset, null, 2) + '\n';
fs.writeFileSync(path.join(OUT_DIR, 'dataset.json'), built);
console.log(JSON.stringify(dataset.counts), 'erät', JSON.stringify(batches));
console.log(`Kirjoitettu: ${path.join(OUT_DIR, 'dataset.json')}`);
// Tallessa olevaan aineistoon ei kosketa, mutta ero siihen kerrotaan
const stored = path.join(DATA_DIR, 'dataset.json');
if (fs.existsSync(stored)) {
  console.log(fs.readFileSync(stored, 'utf8') === built ? `Sama kuin ${stored}.` : `Eroaa tiedostosta ${stored}.`);
}

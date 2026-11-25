// The pattern rules of the consistency checker (lead decision F2, 25 Nov 2026).
//
// Precision before recall: a rule that cannot tell reliably reports nothing. Every rule has a true
// positive and its named false positives here, with Finnish fixtures. The form rule for names is
// the Tarinakansio matcher (termMatch / codex); nothing in the rules inflects a word.
const {
  readable,
  mentionSentences,
  differsByDoubledLetter,
  nameFindings,
  planNameFix,
  extractDates,
  timelineFindings,
  locationFindings
} = require('../../src/services/validation/consistencyRules');
const { stripTodos } = require('../../src/services/ai/contextBuilder');

const TITLES = ['Eka', 'Toka', 'Kolmas', 'Neljäs'];
const chapters = (...texts) => texts.map((content, index) => ({ id: `ch${index + 1}`, title: TITLES[index], content, annotations: [] }));
const book = (characters, texts, more = {}) => ({
  language: 'fi',
  characters: characters.map((name, index) => ({ id: `c${index + 1}`, name })),
  structure: chapters(...texts),
  ...more
});
const spellings = (project) => nameFindings(project).map(finding => finding.variations.join(', '));
const lines = (findings) => findings.map(finding => finding.description);
const at = (project, occurrence) => {
  const chapter = project.structure.find(item => item.id === occurrence.chapterId);
  return chapter.content.slice(occurrence.position, occurrence.position + occurrence.length);
};

describe('the text a rule reads: notes out, places in the real text', () => {
  test('the read text is stripTodos of the chapter, and a range of it maps back to the real text', () => {
    const real = 'Hän tuli. [TODO: tarkista 1.5.2020] Ovi kävi 1.5.2020.\n[TODO: koko rivi]\n\n– Niin [TODO: x], hän sanoi.\nSitten.';
    const read = readable(real);
    expect(read.text).toBe(stripTodos(real));
    expect(read.text).toBe('Hän tuli. Ovi kävi 1.5.2020.\n\n– Niin, hän sanoi.\nSitten.');

    for (const piece of ['1.5.2020', 'Ovi kävi', 'Niin', ', hän sanoi.', 'Sitten.', 'H']) {
      const from = read.text.indexOf(piece);
      const place = read.toReal(from, from + piece.length);
      expect(real.slice(place.position, place.position + place.length)).toBe(piece);
    }
    // The date of the text, not the same date inside the note before it
    expect(read.toReal(read.text.indexOf('1.5.2020'), read.text.indexOf('1.5.2020') + 8).position).toBe(real.lastIndexOf('1.5.2020'));
  });

  test('a text without notes is read as it is; an unclosed note is not a note', () => {
    const read = readable('Aino tuli. [TODO: auki');
    expect(read.text).toBe('Aino tuli. [TODO: auki');
    expect(read.toReal(5, 9)).toEqual({ position: 5, length: 4 });
    expect(readable(null).text).toBe('');
    expect(readable('').toReal(0, 0)).toEqual({ position: 0, length: 0 });
  });

  test('a word of the read text that follows a note with the same words lands on the text', () => {
    const real = 'a [TODO: b c] b c';
    const read = readable(real);
    expect(read.text).toBe('a b c');
    expect(read.toReal(2, 5)).toEqual({ position: 14, length: 3 });
  });
});

describe('name variations', () => {
  test('one doubled letter is the only difference taken as two spellings of one name', () => {
    expect(differsByDoubledLetter('Katariina', 'Katarina')).toBe(true);
    expect(differsByDoubledLetter('Katarina', 'Katariina')).toBe(true);
    expect(differsByDoubledLetter('Aino', 'Ainno')).toBe(true);
    expect(differsByDoubledLetter('Väinö', 'Väinnö')).toBe(true);
    expect(differsByDoubledLetter('Eeva', 'Eva')).toBe(true);
    // Inflected forms whose stem changes
    expect(differsByDoubledLetter('Pekka', 'Pekan')).toBe(false);
    expect(differsByDoubledLetter('Pekka', 'Pekalle')).toBe(false);
    expect(differsByDoubledLetter('Virtanen', 'Virtasen')).toBe(false);
    expect(differsByDoubledLetter('Lehto', 'Lehdon')).toBe(false);
    // The partitive of another spelling is not a base spelling
    expect(differsByDoubledLetter('Saara', 'Saraa')).toBe(false);
    // Other names
    expect(differsByDoubledLetter('Maria', 'Marja')).toBe(false);
    expect(differsByDoubledLetter('Kirsi', 'Kirsti')).toBe(false);
    expect(differsByDoubledLetter('Aino', 'Aina')).toBe(false);
    expect(differsByDoubledLetter('Aino', 'Aino')).toBe(false);
    expect(differsByDoubledLetter('Aino', 'Aionn')).toBe(false);
  });

  test('true positive: Katariina / Katarina, with the place of the variation', () => {
    const project = book(['Katariina Lehto'], [
      'Illalla Katariina tuli kotiin. Ovella seisoi Katarina, joka ei sanonut mitään.',
      'Aamulla he hakivat Katarinan laukun ja veivät sen Katariinan huoneeseen.'
    ]);
    const findings = nameFindings(project);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: 'name-c1',
      type: 'name_variation',
      severity: 'medium',
      category: 'naming',
      characterId: 'c1',
      characterName: 'Katariina',
      variations: ['Katariina', 'Katarina'],
      autoFixable: true
    });
    expect(findings[0].occurrences).toHaveLength(1);
    expect(findings[0].occurrences[0]).toMatchObject({ chapterId: 'ch1', chapterTitle: 'Eka', content: 'Katarina' });
    expect(at(project, findings[0].occurrences[0])).toBe('Katarina');
  });

  test('true positive: Aino / Ainno, and a surname gets its own finding', () => {
    expect(spellings(book(['Aino'], ['Illalla Aino tuli kotiin, ja ovella seisoi Ainno.']))).toEqual(['Aino, Ainno']);

    const findings = nameFindings(book(['Aino Lehto'], ['Illalla rouva Lehtto soitti, ja sitten Aino vastasi.']));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'name-c1-1', characterName: 'Lehto', variations: ['Lehto', 'Lehtto'] });
  });

  test('inflected forms of one name are one name: Aino, Ainon, Ainolle, Ainoa', () => {
    expect(spellings(book(['Aino'], [
      'Illalla Aino tuli kotiin. Sitten Ainon puhelin soi, ja joku antoi Ainolle kirjeen. Kukaan ei nähnyt Ainoa.',
      'Aamulla posti toi Ainolta kortin, ja koko talo puhui Ainosta.'
    ]))).toEqual([]);
  });

  test('consonant gradation: Pekka, Pekan, Pekalle are one name, with or without the stem as an alias', () => {
    const texts = ['Illalla Pekka tuli kotiin. Sitten Pekan puhelin soi, ja joku antoi Pekalle kirjeen.', 'Aamulla he puhuivat Pekasta ja Pekkaa nauratti.'];
    expect(spellings(book(['Pekka'], texts))).toEqual([]);
    // Tarinakansio: "Jos sanan alku muuttuu taivutettaessa, lisää vartalo: Pekka → Peka"
    const withStem = book(['Pekka'], texts, { codex: [{ id: 'k1', type: 'hahmo', name: 'Pekka', aliases: ['Peka'] }] });
    expect(spellings(withStem)).toEqual([]);
  });

  test('names in -nen: Virtanen, Virtasen, Virtaselle are one name', () => {
    expect(spellings(book(['Matti Virtanen'], [
      'Aamulla herra Virtanen heräsi. Koko talo kuuli Virtasen askeleet, ja joku huusi Virtaselle. Illalla he näkivät Virtasta ja Mattia torilla.'
    ]))).toEqual([]);
  });

  test('a name of another character is never a variation', () => {
    expect(spellings(book(['Katariina', 'Katarina Salmi'], ['Illalla Katariina tuli kotiin, ja ovella seisoi Katarina.']))).toEqual([]);
  });

  test('an alias of the same entry is never a variation', () => {
    const project = book(['Katariina'], ['Illalla Katariina tuli kotiin, ja ovella huudettiin Katarina.'], {
      codex: [{ id: 'k1', type: 'hahmo', name: 'Katariina', aliases: ['Katarina', 'Kati'] }]
    });
    expect(spellings(project)).toEqual([]);
  });

  test('a known place or entry name is never a variation', () => {
    const text = 'Illalla Saara tuli kotiin, ja baarin nimi oli Sara.';
    expect(spellings(book(['Saara'], [text]))).toEqual(['Saara, Sara']);
    expect(spellings(book(['Saara'], [text], { locations: [{ id: 'l1', name: 'Sara' }] }))).toEqual([]);
    expect(spellings(book(['Saara'], [text], { codex: [{ id: 'k1', type: 'esine', name: 'Sara', aliases: [] }] }))).toEqual([]);
  });

  test('another name is no variation: Maria and Marja, Aino and Aina, Kirsi and Kirsti', () => {
    expect(spellings(book(['Maria'], ['Illalla Maria tuli kotiin. Marketta ei ollut paikalla, mutta sitten Marja soitti.']))).toEqual([]);
    expect(spellings(book(['Aino'], ['Illalla Aino tuli kotiin, ja sitten Aina soitti.']))).toEqual([]);
    expect(spellings(book(['Kirsi'], ['Illalla Kirsi tuli kotiin, ja sitten Kirsti soitti.']))).toEqual([]);
  });

  test('the start of a sentence and the word after a colon say nothing: Kukka and Kuka', () => {
    expect(spellings(book(['Kukka'], ['Illalla Kukka tuli kotiin ja kysyi: Kuka siellä? Kuka tahansa olisi kysynyt.']))).toEqual([]);
    expect(spellings(book(['Tuuli'], ['Illalla Tuuli tuli kotiin. Tuli paloi takassa.']))).toEqual([]);
  });

  test('a [TODO: …] note is not manuscript text, and the place is counted in the real text', () => {
    expect(spellings(book(['Katariina'], ['Illalla Katariina tuli kotiin. [TODO: onko nimi Katarina vai Katariina]']))).toEqual([]);

    const project = book(['Katariina'], ['Illalla Katariina tuli kotiin. [TODO: tarkista, onko Katarina oikein] Ovella seisoi Katarina.']);
    const [finding] = nameFindings(project);
    expect(finding.variations).toEqual(['Katariina', 'Katarina']);
    expect(finding.occurrences[0].position).toBe(project.structure[0].content.lastIndexOf('Katarina'));
    expect(at(project, finding.occurrences[0])).toBe('Katarina');
  });

  test('a variation is listed once, and two characters of one family give one finding', () => {
    const findings = nameFindings(book(['Aino Lehto', 'Eero Lehto'], ['Illalla rouva Lehtto soitti, ja sitten herra Lehtto vastasi.']));
    expect(findings).toHaveLength(1);
    expect(findings[0].variations).toEqual(['Lehto', 'Lehtto']);
  });

  test('a project without characters, names or text gives nothing', () => {
    expect(nameFindings({})).toEqual([]);
    expect(nameFindings({ characters: [{ id: 'c1', name: 'Li' }, { id: 'c2' }, null], structure: chapters('Illalla Lii tuli.') })).toEqual([]);
    expect(nameFindings({ characters: [{ id: 'c1', name: 'Aino' }], structure: [null, { id: 'x' }] })).toEqual([]);
  });
});

describe('the auto-fix of a name variation', () => {
  const finding = (keep, ...variants) => ({ type: 'name_variation', characterName: keep, variations: [keep, ...variants], autoFixable: true });

  test('only the stem is replaced and the ending stays: Katarina → Katariina, Katarinan → Katariinan', () => {
    const project = book(['Katariina'], [
      'Illalla Katariina tuli. Sitten Katarina söi. Hän otti Katarinan lautasen ja Katariinan lasin.',
      'KATARINA! huusi joku. Katarina ei vastannut.'
    ]);
    const plan = planNameFix(project, finding('Katariina', 'Katarina'));
    expect(plan.safe).toBe(true);
    expect(plan.count).toBe(4);
    expect(plan.chapters.map(chapter => chapter.content)).toEqual([
      'Illalla Katariina tuli. Sitten Katariina söi. Hän otti Katariinan lautasen ja Katariinan lasin.',
      'KATARIINA! huusi joku. Katariina ei vastannut.'
    ]);
    expect(plan.chapters[0].changes).toEqual([
      { from: 31, to: 39, insert: 'Katariina' },
      { from: 54, to: 63, insert: 'Katariinan' }
    ]);
    // The project is not touched
    expect(project.structure[0].content).toContain('Sitten Katarina söi');
  });

  test('word boundaries know ä and ö: Väinnö and Väinnön', () => {
    const project = book(['Väinö'], ['Illalla Väinö tuli kotiin. Sitten Väinnö söi, ja Väinnön kissa nukkui Väinön sylissä.']);
    const plan = planNameFix(project, finding('Väinö', 'Väinnö'));
    expect(plan.safe).toBe(true);
    expect(plan.chapters[0].content).toBe('Illalla Väinö tuli kotiin. Sitten Väinö söi, ja Väinön kissa nukkui Väinön sylissä.');
  });

  test('an ending the manuscript never writes with the kept spelling makes the plan unsafe', () => {
    // Peka for Pekka: "Pekan" is the right form of both, and "Pekkan" is written nowhere
    const gradation = book(['Pekka'], ['Illalla Pekka tuli kotiin. Sitten Peka söi, ja Pekan kissa nukkui.']);
    expect(planNameFix(gradation, finding('Pekka', 'Peka'))).toMatchObject({ safe: false, count: 0, chapters: [] });
    expect(nameFindings(gradation)).toMatchObject([{ variations: ['Pekka', 'Peka'], autoFixable: false }]);

    // Another word that only starts like the variation
    const other = book(['Anna'], ['Illalla Anna tuli kotiin. Sitten Ana söi, ja Anastasia nukkui.']);
    expect(planNameFix(other, finding('Anna', 'Ana')).safe).toBe(false);
  });

  test('a known name that starts like the variation is left alone', () => {
    const project = book(['Anna', 'Anastasia'], ['Illalla Anna tuli kotiin. Sitten Ana söi, ja Anastasia nukkui.']);
    const plan = planNameFix(project, finding('Anna', 'Ana'));
    expect(plan.safe).toBe(true);
    expect(plan.chapters[0].content).toBe('Illalla Anna tuli kotiin. Sitten Anna söi, ja Anastasia nukkui.');
  });

  test('a note is not changed, and the name is read as text, not as a pattern', () => {
    const project = book(['Katariina'], ['Illalla Katariina tuli. [TODO: Katarina vai Katariina?] Sitten Katarina söi.']);
    const plan = planNameFix(project, finding('Katariina', 'Katarina'));
    expect(plan.chapters[0].content).toBe('Illalla Katariina tuli. [TODO: Katarina vai Katariina?] Sitten Katariina söi.');
    expect(plan.count).toBe(1);

    const odd = book(['Aino'], ['Illalla Aino tuli, ja Ainxo ja Ain.o söivät.']);
    const dotted = planNameFix(odd, finding('Aino', 'Ain.o'));
    expect(dotted.safe).toBe(true);
    expect(dotted.chapters[0].content).toBe('Illalla Aino tuli, ja Ainxo ja Aino söivät.');
    expect(() => planNameFix(odd, finding('Aino', 'Ain(o', '[Aino', 'A*'))).not.toThrow();
  });

  test('nothing to fix, or no spelling to keep, is not a safe plan', () => {
    const project = book(['Aino'], ['Illalla Aino tuli kotiin.']);
    expect(planNameFix(project, finding('Aino', 'Ainno')).safe).toBe(false);
    expect(planNameFix(project, finding('Aino')).safe).toBe(false);
    expect(planNameFix(project, {}).safe).toBe(false);
    expect(planNameFix(project, null).safe).toBe(false);
  });
});

describe('the sentences the model step reads', () => {
  test('a date does not cut a sentence, a note is left out, the first sentences of each chapter', () => {
    const project = book(['Aino'], [
      'Aino saapui saarelle 1.5.2020 iltapäivällä. [TODO: tarkista, tuliko Aino lautalla] Satoi. Illalla Ainon laukku löytyi.',
      'Ainolle tuli kirje. Aino, Aino, Aino. Aino luki. Aino nousi. Aino lähti. Aino palasi.'
    ]);
    expect(mentionSentences(project, project.characters[0], 5)).toEqual([
      { chapterIndex: 0, chapterTitle: 'Eka', sentences: ['Aino saapui saarelle 1.5.2020 iltapäivällä.', 'Illalla Ainon laukku löytyi.'] },
      { chapterIndex: 1, chapterTitle: 'Toka', sentences: ['Ainolle tuli kirje.', 'Aino, Aino, Aino.', 'Aino luki.', 'Aino nousi.', 'Aino lähti.'] }
    ]);
  });

  test('the form rule is the Tarinakansio one: first name, alias, stem alias and exclusion', () => {
    const project = book(['Pekka Virtanen', 'Mari'], [
      'Illalla Pekan puhelin soi. Sitten Virtasen ovi kävi. Pate nauroi. Marianne tuli, ja Marin takki jäi.'
    ], {
      codex: [
        { id: 'k1', type: 'hahmo', name: 'Pekka Virtanen', aliases: ['Peka', 'Virtase', 'Pate'] },
        { id: 'k2', type: 'hahmo', name: 'Mari', aliases: [], exclude: ['Marianne'] }
      ]
    });
    expect(mentionSentences(project, project.characters[0])[0].sentences).toEqual(['Illalla Pekan puhelin soi.', 'Sitten Virtasen ovi kävi.', 'Pate nauroi.']);
    expect(mentionSentences(project, project.characters[1])[0].sentences).toEqual(['Marianne tuli, ja Marin takki jäi.']);
    // Without the stem the rule does not find a form whose stem changes
    expect(mentionSentences(book(['Pekka'], ['Illalla Pekan puhelin soi.']), { id: 'c1', name: 'Pekka' })).toEqual([]);
    expect(mentionSentences(project, { id: 'x', name: '' })).toEqual([]);
  });
});

describe('dates', () => {
  const texts = (text) => extractDates(text).map(item => item.dateText);

  test('the three forms, in the order they stand in the text', () => {
    const text = 'Kirje tuli 2020-05-03, vaikka se oli päivätty 1.5.2020. Vastaus lähti 3. toukokuuta 2020 ja toinen 12/5/2020.';
    const dates = extractDates(text);
    expect(dates.map(item => item.dateText)).toEqual(['2020-05-03', '1.5.2020', '3. toukokuuta 2020', '12/5/2020']);
    expect(dates.map(item => [item.date.getFullYear(), item.date.getMonth() + 1, item.date.getDate()])).toEqual([[2020, 5, 3], [2020, 5, 1], [2020, 5, 3], [2020, 5, 12]]);
    for (const item of dates) expect(text.slice(item.position, item.position + item.dateText.length)).toBe(item.dateText);
    expect(texts('Joulukuussa, 24. joulukuuta 1999 ja 1 tammikuu 2000.')).toEqual(['24. joulukuuta 1999', '1 tammikuu 2000']);
    expect(texts('Matka kesti 1.5.2020–3.5.2020 eli 1.5.2020-3.5.2020.')).toEqual(['1.5.2020', '3.5.2020', '1.5.2020', '3.5.2020']);
  });

  test('numbers that are not dates', () => {
    // No such day or month
    expect(texts('Laite näytti lukemaa 45.13.2019, sitten 31.2.2020, 0.5.2020, 12.40.2020 ja 2020-13-45.')).toEqual([]);
    // A piece of a longer run of numbers, a version, an address, a book number, a phone number
    expect(texts('Versio 1.2.3.2019, osoite 192.168.1.2019, v1.5.2020, 1.5.2020.3 ja 11.5.20201.')).toEqual([]);
    expect(texts('ISBN 978-952-1234-05-12-3, puhelin 2019-10-12-345 ja tilaus A2019-10-12.')).toEqual([]);
    // Two separators, a year of three digits or one that starts with a zero
    expect(texts('Suhde 1.5/2020, luku 1.5.202 ja 1.5.0999.')).toEqual([]);
    expect(texts('')).toEqual([]);
    expect(texts(null)).toEqual([]);
  });
});

describe('the timeline', () => {
  test('true positive: the later chapter lies before the earlier one (R2 fixture kaksi)', () => {
    const project = book(['Aino'], ['Aino saapui saarelle 1.5.2020 iltapäivällä. Aino oli väsynyt matkasta.', 'Aino lähti kotoa 1.3.2019 aamulla. Aino oli iloinen ja levännyt.']);
    const findings = timelineFindings(project);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: 'timeline-1',
      type: 'timeline_error',
      severity: 'critical',
      category: 'timeline',
      description: 'Toka (1.3.2019) tapahtuu ennen Eka (1.5.2020)',
      suggestedFix: 'Tarkista aikajana – tapahtumat ovat väärässä järjestyksessä.',
      autoFixable: false
    });
    expect(findings[0].occurrences.map(item => [item.chapterId, item.content, item.position, item.length])).toEqual([['ch1', '1.5.2020', 21, 8], ['ch2', '1.3.2019', 17, 8]]);
  });

  test('true positive with month names and with ISO dates; chapters without dates are passed over', () => {
    expect(lines(timelineFindings(book([], ['Aino saapui saarelle 3. toukokuuta 2020.', 'Satoi koko päivän.', 'Aino lähti kotoa 1. maaliskuuta 2019.']))))
      .toEqual(['Kolmas (1. maaliskuuta 2019) tapahtuu ennen Eka (3. toukokuuta 2020)']);
    expect(lines(timelineFindings(book([], ['Loki 2020-05-01.', 'Loki 2019-03-01.'])))).toEqual(['Toka (2019-03-01) tapahtuu ennen Eka (2020-05-01)']);
  });

  test('dates in order give nothing', () => {
    expect(timelineFindings(book([], ['Kokous pidettiin 1.3.2019.', 'Seuraava kokous pidettiin 1.5.2020.', 'Viimeinen pidettiin 1.5.2020.']))).toEqual([]);
    expect(timelineFindings(book([], ['Ei päivämääriä.']))).toEqual([]);
    expect(timelineFindings({})).toEqual([]);
  });

  test('no finding from numbers that are not dates', () => {
    expect(timelineFindings(book([], ['Kokous pidettiin 1.5.2020.', 'Laite näytti lukemaa 45.13.2019 ja versiota 1.2.3.2019.']))).toEqual([]);
  });

  test('a date inside a [TODO: …] note is not manuscript text', () => {
    expect(timelineFindings(book([], ['Kokous pidettiin 1.5.2020.', 'Aino heräsi. [TODO: tarkista, oliko tämä 1.3.2019]']))).toEqual([]);

    // The mark goes on the date of the text, not on the same date in the note before it
    const project = book([], ['[TODO: siirrä 1.5.2020 myöhemmäksi?] Kokous pidettiin 1.5.2020.', 'Aino lähti 1.3.2019.']);
    const [finding] = timelineFindings(project);
    expect(finding.occurrences[0].position).toBe(project.structure[0].content.lastIndexOf('1.5.2020'));
    expect(at(project, finding.occurrences[0])).toBe('1.5.2020');
  });

  test('an earlier day named beside the chapter\'s own time gives nothing, in any order', () => {
    expect(timelineFindings(book([], ['Kokous pidettiin 1.5.2020.', 'Kirje oli päivätty 3.5.1970. Aino luki sen 2.5.2020.']))).toEqual([]);
    expect(timelineFindings(book([], ['Kokous pidettiin 1.5.2020.', 'Aino luki 2.5.2020 kirjeen, joka oli päivätty 3.5.1970.']))).toEqual([]);
    expect(timelineFindings(book([], ['Aino oli syntynyt 3.5.1970. Kokous pidettiin 1.5.2020.', 'Seuraava kokous pidettiin 2.5.2020.']))).toEqual([]);
  });
});

describe('places', () => {
  const places = (characters, texts, more) => lines(locationFindings(book(characters, texts, more)));

  test('true positive: clearly in one town, then clearly in another, no move told', () => {
    const project = book(['Aino Lehto'], ['Satoi. Aino oli Helsingissä. Ilta pimeni.', 'Aamu valkeni. Aino oli jo Turussa, kun puhelin soi.']);
    const findings = locationFindings(project);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: 'location-c1-1',
      type: 'location_inconsistency',
      severity: 'medium',
      category: 'location',
      characterId: 'c1',
      characterName: 'Aino Lehto',
      description: 'Aino Lehto: Helsingissä (Eka) → Turussa (Toka)',
      suggestedFix: 'Lisää kohtaus, jossa Aino Lehto siirtyy paikasta toiseen, tai korjaa sijaintiviittaukset.',
      autoFixable: false
    });
    expect(findings[0].occurrences.map(item => [item.chapterId, at(project, item)])).toEqual([['ch1', 'Aino oli Helsingissä'], ['ch2', 'Aino oli jo Turussa']]);
  });

  test('true positive with places the project knows, in the outer cases', () => {
    const more = {
      locations: [{ id: 'l1', name: 'Asema' }],
      codex: [
        { id: 'k1', type: 'paikka', name: 'Asema', aliases: ['asema'] },
        { id: 'k2', type: 'paikka', name: 'Kirjasto', aliases: ['kirjasto'] },
        { id: 'k3', type: 'hahmo', name: 'Aino', aliases: ['Aikku'] }
      ]
    };
    expect(places(['Aino'], ['Aino saapui asemalle.', 'Aikku oli kirjastossa.'], more)).toEqual(['Aino: asemalle (Eka) → kirjastossa (Toka)']);
    // The same place under two records is one place
    expect(places(['Aino'], ['Aino oli Asemalla.', 'Aino oli asemalla.'], more)).toEqual([]);
  });

  test('the eye-colour fixture gives no place (R2 fixture silmat)', () => {
    expect(places(['Aino'], [
      'Aino saapui saarelle iltapäivällä. Ainon siniset silmät olivat väsyneet matkasta.',
      'Aino lähti kotoa aamulla. Ainon ruskeat silmät loistivat, kun hän katsoi peiliin.'
    ])).toEqual([]);
  });

  test('a guess gives no finding', () => {
    const second = 'Aino oli Turussa.';
    // Another person's place, speech, a claim, a condition, a negation
    expect(places(['Aino'], ['Aino kuuli, että Eero oli Helsingissä.', second])).toEqual([]);
    expect(places(['Aino'], ['Eero väitti, että Aino oli Helsingissä.', second])).toEqual([]);
    expect(places(['Aino'], ['– Aino oli Helsingissä, Eero sanoi.', second])).toEqual([]);
    expect(places(['Aino'], ['”Aino on Helsingissä”, Eero sanoi.', second])).toEqual([]);
    expect(places(['Aino'], ['Aino olisi Helsingissä. Aino ei ollut Helsingissä.', second])).toEqual([]);
    // A visit in the past, a place she comes from, more words in the clause
    expect(places(['Aino'], ['Aino oli käynyt Helsingissä.', second])).toEqual([]);
    expect(places(['Aino'], ['Aino tuli Helsingistä.', second])).toEqual([]);
    expect(places(['Aino'], ['Aino oli Helsingissä käydessään nähnyt merta.', second])).toEqual([]);
    // A person, a word that is no name, the name inside another word
    expect(places(['Aino'], ['Aino oli Liisalla.', second])).toEqual([]);
    expect(places(['Aino', 'Liisa'], ['Aino oli Liisassa.', second])).toEqual([]);
    expect(places(['Aino'], ['Aino oli sairaalassa.', second])).toEqual([]);
    expect(places(['Aino'], ['Ainoa oli Helsingissä.', second])).toEqual([]);
    // A note
    expect(places(['Aino'], ['Satoi. [TODO: Aino oli Helsingissä.]', second])).toEqual([]);
  });

  test('a move that the text tells of is no contradiction', () => {
    // Arriving is the move
    expect(places(['Aino'], ['Aino oli Helsingissä.', 'Aino saapui Turkuun. Aino oli Turussa.'])).toEqual([]);
    // Travel words keep their exemption: the later chapter's title and text, the earlier chapter after the statement
    expect(lines(locationFindings({ characters: [{ id: 'c1', name: 'Aino' }], structure: [
      { id: 'a', title: 'Koti', content: 'Aino oli Helsingissä.' },
      { id: 'b', title: 'Matka länteen', content: 'Aino oli Turussa.' }
    ] }))).toEqual([]);
    expect(places(['Aino'], ['Aino oli Helsingissä.', 'Juna matkusti hitaasti. Aino oli Turussa.'])).toEqual([]);
    expect(places(['Aino'], ['Aino oli Helsingissä. Illalla hän lähti asemalle.', 'Aino oli Turussa.'])).toEqual([]);
    // A chapter between the two
    expect(places(['Aino'], ['Aino oli Helsingissä.', 'Satoi.', 'Aino oli Turussa.'])).toEqual([]);
  });

  test('one place in two cases is one place', () => {
    expect(places(['Aino'], ['Aino saapui Helsinkiin.', 'Aino oli Helsingissä.'])).toEqual([]);
    expect(places(['Aino'], ['Aino meni Turkuun.', 'Aino asui Turussa.'])).toEqual([]);
    expect(places(['Aino'], ['Aino saapui Helsinkiin.', 'Aino oli Turussa.'])).toEqual(['Aino: Helsinkiin (Eka) → Turussa (Toka)']);
  });

  test('the last place of the earlier chapter is compared with the first of the later one', () => {
    expect(places(['Aino'], ['Aino oli Turussa. Yö tuli. Aino oli Helsingissä.', 'Aino oli Helsingissä. Sitten Aino oli Turussa.'])).toEqual([]);
  });

  test('a name word that two characters share names neither of them', () => {
    expect(places(['Aino Lehto', 'Eero Lehto'], ['Lehto oli Helsingissä.', 'Lehto oli Turussa.'])).toEqual([]);
    expect(places(['Aino Lehto', 'Eero Lehto'], ['Aino oli Helsingissä.', 'Aino Lehto oli Turussa.'])).toEqual(['Aino Lehto: Helsingissä (Eka) → Turussa (Toka)']);
  });

  test('a project without characters or text gives nothing', () => {
    expect(locationFindings({})).toEqual([]);
    expect(locationFindings({ characters: [{ id: 'c1' }], structure: chapters('Aino oli Helsingissä.') })).toEqual([]);
    expect(locationFindings({ characters: [{ id: 'c1', name: 'Aino' }], structure: [{ id: 'a', content: 'Aino oli Helsingissä.' }, { id: 'b', content: 'Aino oli Turussa.' }] }))
      .toMatchObject([{ description: 'Aino: Helsingissä (Nimetön luku) → Turussa (Nimetön luku)' }]);
  });
});

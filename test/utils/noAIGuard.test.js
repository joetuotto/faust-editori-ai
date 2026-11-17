/**
 * @jest-environment node
 */
const {
  MIN_SEGMENT,
  WINDOW,
  squash,
  protectedChapters,
  buildGuardIndex,
  findProtected,
  collectStrings
} = require('../../utils/noAIGuard');

// One paragraph of 300 characters: in FAUST a paragraph is one line
const SENTENCES = [
  'Aamulla järvi oli tyyni kuin lasi, eikä kukaan liikkunut rannalla.',
  'Aino seisoi laiturilla paljain jaloin ja vaikeni.',
  'Hän katseli sumua, joka nousi hitaasti vedestä.',
  'Hän tiesi, että isä palaisi vasta illalla, kun valo jo taittui.',
  'Kukaan ei kysyisi häneltä, missä hän oli ollut koko pitkän päivän ajan.'
];
const PARAGRAPH = SENTENCES.join(' ');
const INNER_SENTENCE = SENTENCES[1];

// Dialogue lines of 8 to 15 characters
const DIALOGUE = ['– Tuletko?', '– En tule.', '– Miksi et?', '– Koska sataa.', '– Ei sada enää.', '– Sataa vielä.', '– No ei.'];

const SHORT_SENTENCE = 'Isä palasi vasta illalla.';
const SUMMARY = 'Aino odottaa isää laiturilla ja päättää vaieta.';

function makeProject() {
  return {
    structure: [
      {
        id: 'c1',
        title: 'Luku 1',
        noAI: false,
        content: 'Tavallinen luku. Hän sanoi hiljaa jotakin. Ovi kävi ja tuuli toi lehtiä eteiseen asti.',
        synopsis: 'Tavallisen luvun tiivistelmä, jota saa lähettää vapaasti.'
      },
      {
        id: 'c2',
        title: 'Luku 2',
        noAI: true,
        content: `${PARAGRAPH}\n${DIALOGUE.join('\n')}\n${SHORT_SENTENCE}`,
        synopsis: SUMMARY
      }
    ]
  };
}

const chapters = () => protectedChapters(makeProject());

describe('protectedChapters', () => {
  test('protectedChapters returns the squashed text and summaries of noAI chapters and nothing for other chapters', () => {
    const project = {
      structure: [
        { id: 'a', title: 'Avoin', content: 'Tämän luvun tekstiä saa lähettää niin paljon kuin haluaa.', synopsis: 'Avoin tiivistelmä.' },
        {
          id: 'b',
          title: '  Suljettu  ',
          noAI: true,
          content: 'Ensimmäinen   kappale\ton tässä.\r\n\r\nToinen\u00A0kappale\u202Fon tässä.  ',
          synopsis: 'Tiivistelmä yksi.',
          synopsisManual: 'Tiivistelmä kaksi.',
          synopsisAI: 'Tiivistelmä kolme.',
          children: [
            { id: 'b1', title: 'Alaluku', noAI: true, content: 'Alaluvun suojattu teksti on tässä.' },
            { id: 'b2', title: 'Avoin alaluku', content: 'Alaluvun avoin teksti on tässä näin.' }
          ]
        },
        { id: 'c', noAI: true, content: 'Nimettömän luvun suojattu teksti.' },
        { id: 'd', title: 'Lyhyt', noAI: true, content: 'Liian lyhyt.' },
        { id: 'e', title: 'Tyhjä', noAI: true },
        { id: 'f', title: 'Melkein', noAI: 'true', content: 'Tässä luvussa merkintä ei ole tosi vaan tekstiä.' },
        null
      ]
    };

    expect(protectedChapters(project)).toEqual([
      {
        title: 'Suljettu',
        text: 'Ensimmäinen kappale on tässä. Toinen kappale on tässä. Tiivistelmä yksi. Tiivistelmä kaksi. Tiivistelmä kolme.'
      },
      { title: 'Alaluku', text: 'Alaluvun suojattu teksti on tässä.' },
      { title: 'Nimetön luku', text: 'Nimettömän luvun suojattu teksti.' }
    ]);

    // A chapter with only a summary is protected by its summary
    expect(protectedChapters({ structure: [{ title: 'Vain tiivistelmä', noAI: true, synopsisAI: 'Koneen kirjoittama tiivistelmä.' }] }))
      .toEqual([{ title: 'Vain tiivistelmä', text: 'Koneen kirjoittama tiivistelmä.' }]);

    expect(protectedChapters(makeProject()).map(chapter => chapter.title)).toEqual(['Luku 2']);
    expect(protectedChapters({ structure: [] })).toEqual([]);
    expect(protectedChapters({})).toEqual([]);
    expect(protectedChapters(null)).toEqual([]);
    expect(MIN_SEGMENT).toBe(20);
    expect(WINDOW).toBe(40);
  });

  test('squash: NFC, every run of whitespace as one space, trimmed', () => {
    expect(squash('  Yksi \t kaksi\r\n\r\nkolme\u00A0neljä\u202Fviisi  ')).toBe('Yksi kaksi kolme neljä viisi');
    // "ä" as a + combining diaeresis
    expect(squash('ha\u0308ma\u0308ra\u0308')).toBe('hämärä');
    expect(squash('')).toBe('');
    expect(squash(null)).toBe('');
    expect(squash(undefined)).toBe('');
    expect(squash(42)).toBe('42');
  });
});

describe('findProtected', () => {
  test('whitespace differences do not hide a match', () => {
    const spaced = INNER_SENTENCE
      .replace('seisoi laiturilla', 'seisoi   laiturilla')
      .replace('paljain jaloin', 'paljain\njaloin')
      .replace('jaloin ja', 'jaloin\t ja')
      .replace('ja vaikeni', 'ja\u00A0vaikeni');
    expect(spaced).not.toBe(INNER_SENTENCE);
    expect(findProtected(`Muokkaa tätä:\n${spaced}`, chapters())).toMatchObject({ title: 'Luku 2' });

    // A request that arrives in decomposed Unicode is the same text
    expect(findProtected(INNER_SENTENCE.normalize('NFD'), chapters())).toMatchObject({ title: 'Luku 2' });
    // … and so is protected text that was stored decomposed
    const stored = protectedChapters({ structure: [{ title: 'NFD', noAI: true, content: PARAGRAPH.normalize('NFD') }] });
    expect(findProtected(INNER_SENTENCE, stored)).toMatchObject({ title: 'NFD' });
    // Windows line breaks between lines
    expect(findProtected(DIALOGUE.slice(3, 6).join('\r\n'), chapters())).toMatchObject({ title: 'Luku 2' });
  });

  test('a whole protected paragraph in the request is found', () => {
    expect(PARAGRAPH).toHaveLength(300);
    expect(findProtected(PARAGRAPH, chapters())).toEqual({ title: 'Luku 2', snippet: PARAGRAPH.slice(0, 40) });
    expect(findProtected(`Analysoi tämä luku ja kerro mielipiteesi.\n\n${PARAGRAPH}\n\nVastaa suomeksi.`, chapters()))
      .toEqual({ title: 'Luku 2', snippet: PARAGRAPH.slice(0, 40) });
    // The summary is protected like the text
    expect(findProtected(`Edellinen luku: ${SUMMARY}`, chapters())).toMatchObject({ title: 'Luku 2' });
  });

  test('a sentence from inside a protected paragraph is found', () => {
    expect(INNER_SENTENCE).toHaveLength(49);
    expect(PARAGRAPH.indexOf(INNER_SENTENCE)).toBeGreaterThan(60);
    expect(PARAGRAPH.indexOf(INNER_SENTENCE) + 49).toBeLessThan(240);

    // The frame the voice edit builds around a selection
    const request = `ORIGINAL TEXT:\n${INNER_SENTENCE}\n\nUSER INSTRUCTION (spoken):\n"tiivistä"`;
    expect(findProtected(request, chapters())).toEqual({ title: 'Luku 2', snippet: 'Aino seisoi laiturilla paljain jaloin ja' });
    // Part of two neighbouring sentences, starting and ending in the middle of each
    expect(findProtected('jaloin ja vaikeni. Hän katseli sumua, joka nousi hitaasti', chapters())).toMatchObject({ title: 'Luku 2' });
  });

  test('a chapter of short lines is found when three of its lines are sent together', () => {
    for (const line of DIALOGUE) {
      expect(line.length).toBeGreaterThanOrEqual(8);
      expect(line.length).toBeLessThanOrEqual(15);
    }
    const three = DIALOGUE.slice(3, 6).join('\n');
    expect(findProtected(`Jatka tästä:\n${three}`, chapters())).toEqual({
      title: 'Luku 2',
      snippet: '– Koska sataa. – Ei sada enää. – Sataa v'
    });
    expect(findProtected(DIALOGUE.join('\n'), chapters())).toMatchObject({ title: 'Luku 2' });

    // One such line alone is too short to be told apart from ordinary text
    for (const line of DIALOGUE) expect(findProtected(line, chapters())).toBeNull();
    // The same three lines in another order are not the protected text
    expect(findProtected([DIALOGUE[5], DIALOGUE[3], DIALOGUE[4]].join('\n'), chapters())).toBeNull();
  });

  test('a paragraph cut at 2 000 characters in the middle of a word is found', () => {
    const long = Array.from({ length: 40 }, (_, i) => `Kappaleen virke numero ${i + 1} kertoo järven rannasta ja sen hiljaisimmista asukkaista.`).join(' ');
    expect(long.length).toBeGreaterThan(2500);
    const cut = long.slice(0, 2000);
    // The cut falls inside a word
    expect(long.slice(1999, 2001)).toMatch(/^\p{L}{2}$/u);

    const protectedText = protectedChapters({ structure: [{ title: 'Pitkä luku', noAI: true, content: long }] });
    expect(findProtected(`Chapter content:\n${cut}`, protectedText)).toEqual({ title: 'Pitkä luku', snippet: long.slice(0, 40) });
    // Also when the cut starts in the middle of a word and ends in the middle of another
    expect(long.slice(700, 702)).toMatch(/^\p{L}{2}$/u);
    expect(long.slice(899, 901)).toMatch(/^\p{L}{2}$/u);
    expect(findProtected(long.slice(701, 900), protectedText)).toMatchObject({ title: 'Pitkä luku' });
  });

  test('a protected sentence inside triple quotes and a prompt frame is found', () => {
    const sentence = SENTENCES[3];
    const request = `The user has selected this text:\n"""${sentence}"""\n\nUser instruction: lyhennä`;
    expect(findProtected(request, chapters())).toMatchObject({ title: 'Luku 2' });

    // A shorter one, where no 40-character window starts at a word start: found as a whole sentence
    const short = `The user has selected this text:\n"""${SHORT_SENTENCE}"""\n\nUser instruction: lyhennä`;
    expect(findProtected(short, chapters())).toEqual({ title: 'Luku 2', snippet: 'Isä palasi vasta illalla' });
    // Finnish quotation marks and a dialogue dash around it
    expect(findProtected(`Muokkaa tätä:\n”${SHORT_SENTENCE}”`, chapters())).toMatchObject({ title: 'Luku 2' });
    expect(findProtected(`– ${SHORT_SENTENCE}`, chapters())).toMatchObject({ title: 'Luku 2' });
  });

  test('a 25-character sentence that stands in a protected chapter is found and a 15-character one is not', () => {
    expect(SHORT_SENTENCE).toHaveLength(25);
    expect(findProtected(SHORT_SENTENCE, chapters())).toEqual({ title: 'Luku 2', snippet: 'Isä palasi vasta illalla' });
    // As one sentence among the request's own
    expect(findProtected(`Kirjoita tämä uudelleen. ${SHORT_SENTENCE} Säilytä sävy.`, chapters())).toMatchObject({ title: 'Luku 2' });

    expect(DIALOGUE[4]).toHaveLength(15);
    expect(findProtected(DIALOGUE[4], chapters())).toBeNull();
    expect(findProtected(`Kirjoita tämä uudelleen. ${DIALOGUE[4]} Säilytä sävy.`, chapters())).toBeNull();

    // On purpose: 20 to 39 protected characters that are not a whole line or sentence of the request get through
    const fragment = 'eikä kukaan liikkunut rannalla';
    expect(fragment).toHaveLength(30);
    expect(PARAGRAPH).toContain(fragment);
    expect(findProtected(`Jatka lausetta niin, että ${fragment} koko aamuna.`, chapters())).toBeNull();
    // … but the same fragment as a line of its own does not
    expect(findProtected(`Jatka tätä:\n${fragment}`, chapters())).toMatchObject({ title: 'Luku 2' });
    // The same limit: a short protected sentence that shares its line with a label is part of a longer piece
    expect(findProtected(`Muokkaa: ”${SHORT_SENTENCE}”`, chapters())).toBeNull();
  });

  test('a whole line of two short protected sentences is found', () => {
    const list = protectedChapters({
      structure: [{
        title: 'Salaisuus',
        noAI: true,
        content: 'Yö oli pitkä ja tuuli kääntyi kahdesti ennen aamua. Hän nousi. Aino ei nukkunut. Tuuli yltyi. Sitten satama heräsi hitaasti, vene kerrallaan.\n– Tule. – En tule.\n– Miksi et tule? – En jaksa.'
      }]
    });
    const index = buildGuardIndex(list);
    const check = (request) => {
      const hit = findProtected(request, list);
      expect(findProtected(request, index)).toEqual(hit);
      return hit;
    };

    const two = 'Hän nousi. Aino ei nukkunut.';
    expect(two).toHaveLength(28);
    const found = { title: 'Salaisuus', snippet: 'Hän nousi. Aino ei nukkunut' };
    // The three old senders that stay put the selection on a line of its own:
    // voice editing, the Hybrid rewrite and the Liminal panel
    expect(check(`ORIGINAL TEXT:\n${two}\n\nUSER INSTRUCTION (spoken):\n"lyhennä"`)).toEqual(found);
    expect(check(`Rewrite the following text according to this instruction: "lyhennä"\n\nORIGINAL TEXT:\n${two}\n\nREWRITTEN VERSION:`)).toEqual(found);
    expect(check(`The user has selected this text:\n"""${two}"""\n\nUser instruction: lyhennä`)).toEqual(found);

    // Three sentences cut in the middle of a word, 39 characters
    expect(check('ORIGINAL TEXT:\nHän nousi. Aino ei nukkunut. Tuuli ylty\n')).toEqual({
      title: 'Salaisuus',
      snippet: 'Hän nousi. Aino ei nukkunut. Tuuli ylty'
    });
    // Three whole sentences inside triple quotes, 41 characters: the snippet is the first 40
    expect(check('The user has selected this text:\n"""Hän nousi. Aino ei nukkunut. Tuuli yltyi."""')).toEqual({
      title: 'Salaisuus',
      snippet: 'Hän nousi. Aino ei nukkunut. Tuuli yltyi'
    });
    // A dialogue line of two replies, each too short alone
    expect(check('ORIGINAL TEXT:\n– Miksi et tule? – En jaksa.\n')).toEqual({ title: 'Salaisuus', snippet: 'Miksi et tule? – En jaksa' });

    // Still let through: each sentence alone, and a whole line under 20 characters
    expect(check('Hän nousi.')).toBeNull();
    expect(check('Aino ei nukkunut.')).toBeNull();
    expect(check('ORIGINAL TEXT:\n– Tule. – En tule.\n')).toBeNull();
    // … and the two sentences in the middle of a longer line, which are neither a whole line nor a whole sentence
    expect(check(`Muokkaa tämä: ${two} Kiitos.`)).toBeNull();
    // A line of the request's own that shares one short sentence with the chapter is not refused
    expect(check('Hän nousi. Sitten hän lähti kotiin.')).toBeNull();
  });

  test('protected text right after an opening quotation mark, bracket or tag is found', () => {
    const paragraph = 'Aino seisoi laiturilla ja katsoi merelle päin. Tuuli oli kääntynyt yöllä, ja aallot löivät kiviin raskaasti. Hän ei ollut nukkunut.';
    const list = protectedChapters({ structure: [{ title: 'Salaisuus', noAI: true, content: paragraph }] });
    const index = buildGuardIndex(list);

    // 43 characters from a word start of the chapter, on a line with other words: no whole line or sentence
    const fragment = 'Tuuli oli kääntynyt yöllä, ja aallot löivät';
    expect(fragment).toHaveLength(43);
    expect(paragraph).toContain(` ${fragment}`);
    const found = { title: 'Salaisuus', snippet: 'Tuuli oli kääntynyt yöllä, ja aallot löi' };
    const requests = [
      `Muokkaa tätä: ${fragment}`,
      `Muokkaa tätä: "${fragment}"`,
      `Muokkaa tätä: ”${fragment}”`,
      `Katkelma (${fragment}) on liian pitkä.`,
      `Valinta: <teksti>${fragment}</teksti>`,
      `{"selection":"${fragment}","instruction":"lyhennä"}`
    ];
    for (const request of requests) {
      expect(findProtected(request, list)).toEqual(found);
      expect(findProtected(request, index)).toEqual(found);
    }

    // The limit is unchanged: 39 protected characters inside quotation marks on a shared line get through
    expect(findProtected(`Muokkaa tätä: "${fragment.slice(0, 39)}"`, list)).toBeNull();
    // … and so do 43 characters that start in the middle of a word of the chapter
    const midWord = paragraph.slice(paragraph.indexOf('uuli oli'), paragraph.indexOf('uuli oli') + 43);
    expect(midWord).toBe('uuli oli kääntynyt yöllä, ja aallot löivät ');
    expect(findProtected(`Muokkaa tätä: "${midWord.trim()}"`, list)).toBeNull();
    // The chapter's own windows still start only where a word starts after a space
    expect(index[0].windows.has('Tuuli oli kääntynyt yöllä, ja aallot löi')).toBe(true);
    expect(index[0].windows.has('aallot löivät kiviin raskaasti. Hän ei o')).toBe(true);
    for (const window of index[0].windows) {
      const at = list[0].text.indexOf(window);
      expect(at === 0 || list[0].text[at - 1] === ' ').toBe(true);
    }
    // … also where the chapter itself has a quotation mark in front of a word
    const quoted = buildGuardIndex(protectedChapters({
      structure: [{ title: 'Lainaus', noAI: true, content: 'Hän sanoi: ”Tuuli oli kääntynyt yöllä, ja aallot löivät kiviin raskaasti.”' }]
    }));
    expect(quoted[0].windows.has('”Tuuli oli kääntynyt yöllä, ja aallot lö')).toBe(true);
    expect(quoted[0].windows.has('Tuuli oli kääntynyt yöllä, ja aallot löi')).toBe(false);
    expect(quoted[0].windows.size).toBe(6);
  });

  test('the last window of a chapter and the last window of a request both count', () => {
    const text = 'Yö oli pitkä ja tuuli kääntyi kahdesti ennen aamua. Ilta tuli. Hän nousi ylös. Aino ei nukkunut. Tuuli yltyi yhä.';
    const list = protectedChapters({ structure: [{ title: 'Salaisuus', noAI: true, content: text }] });

    // The chapter ends with exactly 40 characters from a word start, across two sentence breaks.
    // On a line with a label and a closing word they are no whole line and no sentence of 20 characters.
    const last = text.slice(-40);
    expect(last).toBe('ylös. Aino ei nukkunut. Tuuli yltyi yhä.');
    expect(text[text.length - 41]).toBe(' ');
    expect(buildGuardIndex(list)[0].windows.has(last)).toBe(true);
    expect(findProtected(`Muokkaa: ${last} Kiitos.`, list)).toEqual({ title: 'Salaisuus', snippet: last });

    // A request that ends with exactly 40 protected characters from the middle of the chapter
    const middle = 'Ilta tuli. Hän nousi ylös. Aino ei nukku';
    expect(middle).toHaveLength(40);
    expect(text).toContain(` ${middle}`);
    expect(findProtected(`Muokkaa: ${middle}`, list)).toEqual({ title: 'Salaisuus', snippet: middle });
    // One character less is under the window and no whole piece: let through
    expect(findProtected(`Muokkaa: ${middle.slice(0, 39)}`, list)).toBeNull();
  });

  test('a short protected sentence is found after any sentence end on the same line: . ! ? …', () => {
    const found = { title: 'Luku 2', snippet: 'Isä palasi vasta illalla' };
    for (const before of ['Hän odotti.', 'Tule jo!', 'Missä hän on?', 'Hän odotti…']) {
      expect(findProtected(`${before} ${SHORT_SENTENCE}`, chapters())).toEqual(found);
    }
    // Without a sentence end in front it is part of a longer piece
    expect(findProtected(`Hän odotti, ${SHORT_SENTENCE}`, chapters())).toBeNull();
    expect(findProtected(`Hän odotti: ${SHORT_SENTENCE}`, chapters())).toBeNull();
  });

  test('text of another chapter that shares only short phrases with the protected one is not refused', () => {
    const project = makeProject();
    const open = project.structure[0];
    expect(findProtected(open.content, chapters())).toBeNull();
    expect(findProtected(open.synopsis, chapters())).toBeNull();

    // Words and short phrases of the protected chapter in other sentences
    const other = 'Hän sanoi hiljaa jotakin ja katseli sumua. Isä palaisi kai joskus, mutta kukaan ei tiennyt milloin. Aino seisoi rannalla.';
    expect(findProtected(other, chapters())).toBeNull();
    expect(findProtected('Aamulla järvi oli sileä. Kukaan ei kysyisi mitään. Hän tiesi sen.', chapters())).toBeNull();

    // Nothing protected: nothing is refused
    expect(findProtected(PARAGRAPH, [])).toBeNull();
    expect(findProtected(PARAGRAPH, undefined)).toBeNull();
    expect(findProtected(PARAGRAPH, protectedChapters({ structure: [open] }))).toBeNull();
    // Nothing sent: nothing to refuse
    expect(findProtected('', chapters())).toBeNull();
    expect(findProtected('   \n ', chapters())).toBeNull();
    expect(findProtected(undefined, chapters())).toBeNull();
  });

  test('the result names the chapter and carries a snippet of at most 40 characters', () => {
    const project = makeProject();
    project.structure.push({ id: 'c3', noAI: true, content: 'Kolmannen luvun suojattu kappale kertoo aivan muusta kuin toinen luku.' });
    const list = protectedChapters(project);
    const text = Object.fromEntries(list.map(chapter => [chapter.title, chapter.text]));

    const requests = [
      PARAGRAPH,
      INNER_SENTENCE,
      SHORT_SENTENCE,
      DIALOGUE.slice(2, 6).join('\n'),
      'suojattu kappale kertoo aivan muusta kuin toinen luku',
      `"""${SUMMARY}"""`
    ];
    for (const request of requests) {
      const hit = findProtected(request, list);
      expect(Object.keys(hit).sort()).toEqual(['snippet', 'title']);
      expect(hit.snippet.length).toBeGreaterThanOrEqual(MIN_SEGMENT);
      expect(hit.snippet.length).toBeLessThanOrEqual(40);
      // The snippet is protected text of the chapter that is named, and it is in the request
      expect(text[hit.title]).toContain(hit.snippet);
      expect(squash(request)).toContain(hit.snippet);
    }
    expect(findProtected(PARAGRAPH, list).title).toBe('Luku 2');
    // A chapter without a title still gets a name the author can read
    expect(findProtected('Kolmannen luvun suojattu kappale kertoo aivan muusta', list)).toEqual({
      title: 'Nimetön luku',
      snippet: 'Kolmannen luvun suojattu kappale kertoo '
    });
    // A false refusal can be read from the snippet: this sentence of the request stands word for word in the chapter
    expect(findProtected('Uusi kohtaus alkaa. Aino seisoi laiturilla. Tuuli yltyi.', list)).toEqual({
      title: 'Luku 2',
      snippet: 'Aino seisoi laiturilla'
    });
    // A whole piece longer than 40 characters that no window finds (the request starts in the
    // middle of a long word, and only 31 characters follow the next word start): the snippet is its first 40
    const cut = protectedChapters({
      structure: [{ title: 'Luku 2', noAI: true, content: 'Illalla erikoissairaanhoitopiirin kuntayhtymän hallitus kokoontui.' }]
    });
    const piece = 'rikoissairaanhoitopiirin kuntayhtymän hallitus kokoontui';
    expect(piece).toHaveLength(56);
    expect(findProtected(piece, cut)).toEqual({ title: 'Luku 2', snippet: 'rikoissairaanhoitopiirin kuntayhtymän ha' });
    expect(findProtected(piece, cut).snippet).toHaveLength(40);
    // With text of two protected chapters, the first match in the request decides
    expect(findProtected(`${list[1].text}\n${PARAGRAPH}`, list).title).toBe('Nimetön luku');
  });

  test('findProtected gives the same answer for a chapter list and for a prepared index', () => {
    const list = chapters();
    const index = buildGuardIndex(list);

    expect(index).toHaveLength(1);
    expect(index[0].title).toBe('Luku 2');
    expect(index[0].text).toBe(list[0].text);
    expect(index[0].windows).toBeInstanceOf(Set);
    // Every window is 40 characters of the text, starting at a word start
    expect(index[0].windows.size).toBeGreaterThan(40);
    for (const window of index[0].windows) {
      expect(window).toHaveLength(40);
      const at = list[0].text.indexOf(window);
      expect(at === 0 || list[0].text[at - 1] === ' ').toBe(true);
    }
    expect(index[0].windows.has(PARAGRAPH.slice(0, 40))).toBe(true);
    expect(index[0].windows.has(PARAGRAPH.slice(1, 41))).toBe(false);

    const requests = [
      PARAGRAPH,
      INNER_SENTENCE,
      `ORIGINAL TEXT:\n${INNER_SENTENCE}\n\nUSER INSTRUCTION (spoken):\n"tiivistä"`,
      DIALOGUE.slice(3, 6).join('\n'),
      DIALOGUE[0],
      SHORT_SENTENCE,
      `"""${SHORT_SENTENCE}"""`,
      SUMMARY,
      'Hän sanoi hiljaa jotakin ja katseli sumua.',
      makeProject().structure[0].content,
      ''
    ];
    let hits = 0;
    for (const request of requests) {
      const fromList = findProtected(request, list);
      expect(findProtected(request, index)).toEqual(fromList);
      if (fromList) hits += 1;
    }
    expect(hits).toBe(7);

    // A text shorter than the window has no windows and is still protected as a whole sentence
    const small = buildGuardIndex([{ title: 'Pieni', text: 'Lyhyt suojattu virke tässä.' }]);
    expect(small[0].windows.size).toBe(0);
    expect(findProtected('Lyhyt suojattu virke tässä.', small)).toEqual({ title: 'Pieni', snippet: 'Lyhyt suojattu virke tässä' });

    // An index that is indexed again stays as it is; a broken list does not throw
    expect(buildGuardIndex(index)[0]).toBe(index[0]);
    expect(buildGuardIndex(undefined)).toEqual([]);
    expect(buildGuardIndex([null, 'x', { title: 'Tyhjä' }])).toEqual([{ title: 'Tyhjä', text: '', windows: new Set() }]);
    expect(findProtected(PARAGRAPH, [null, { title: 'Tyhjä' }])).toBeNull();
  });

  test('a long protected chapter is indexed and searched quickly', () => {
    const words = Array.from({ length: 60000 }, (_, i) => `sana${i % 977}`).join(' ');
    const started = Date.now();
    const index = buildGuardIndex([{ title: 'Iso', text: words }]);
    const request = Array.from({ length: 20000 }, (_, i) => `muu${i % 311}`).join(' ');
    expect(findProtected(request, index)).toBeNull();
    expect(findProtected(`${request} ${words.slice(6000, 6100)}`, index)).toMatchObject({ title: 'Iso' });
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe('collectStrings', () => {
  test('collectStrings reads a prompt string, an options object, and messages with string and block content', () => {
    // The old handler takes a bare prompt …
    expect(collectStrings('Pelkkä kehote.')).toBe('Pelkkä kehote.');
    // … or an options object
    expect(collectStrings({ prompt: 'Kehote objektissa.', model: 'malli', temperature: 0.7, max_tokens: 2000 })).toBe('Kehote objektissa.');

    // The streaming handler and the new request layer: system and messages
    const payload = {
      id: 'r1',
      model: 'malli',
      system: 'Järjestelmäteksti.',
      messages: [
        { role: 'user', content: 'Ensimmäinen viesti.' },
        { role: 'assistant', content: [{ type: 'text', text: 'Lohko yksi.' }, { type: 'image', source: { data: 'EI-TEKSTIÄ' } }, { type: 'text', text: 'Lohko kaksi.' }] },
        { role: 'user', content: ['Paljas merkkijono lohkona.', null, 5] },
        null,
        { role: 'user' }
      ]
    };
    expect(collectStrings(payload)).toBe([
      'Järjestelmäteksti.',
      'Ensimmäinen viesti.',
      'Lohko yksi.',
      'Lohko kaksi.',
      'Paljas merkkijono lohkona.'
    ].join('\n'));
    expect(collectStrings(payload)).not.toContain('EI-TEKSTIÄ');
    expect(collectStrings(payload)).not.toContain('malli');

    // Prompt, system and messages together; a system text given as blocks
    expect(collectStrings({ prompt: 'Kehote.', system: [{ type: 'text', text: 'Lohkoina.' }], messages: [{ role: 'user', content: 'Viesti.' }] }))
      .toBe('Kehote.\nLohkoina.\nViesti.');

    for (const nothing of [undefined, null, 5, true, {}, [], { messages: 'x' }, { prompt: 7, system: null }]) {
      expect(collectStrings(nothing)).toBe('');
    }

    // What it is for: protected text is found wherever in the payload it travels
    const sentence = INNER_SENTENCE;
    const list = chapters();
    expect(findProtected(collectStrings(`Muokkaa: ${sentence}`), list)).toMatchObject({ title: 'Luku 2' });
    expect(findProtected(collectStrings({ prompt: `Muokkaa: ${sentence}` }), list)).toMatchObject({ title: 'Luku 2' });
    expect(findProtected(collectStrings({ system: `Konteksti: ${sentence}`, messages: [{ role: 'user', content: 'Jatka.' }] }), list)).toMatchObject({ title: 'Luku 2' });
    expect(findProtected(collectStrings({ messages: [{ role: 'user', content: [{ type: 'text', text: sentence }] }] }), list)).toMatchObject({ title: 'Luku 2' });
    expect(findProtected(collectStrings({ messages: [{ role: 'user', content: 'Jatka tarinaa.' }] }), list)).toBeNull();
  });
});

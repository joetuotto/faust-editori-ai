/**
 * @jest-environment node
 */
const plan = require('../../src/services/project/importPlan');
const {
  buildRows,
  hasOrderNumbers,
  applyStripNumbers,
  moveRow,
  renameRow,
  setRowIncluded,
  setAllIncluded,
  resetOrder,
  isReordered,
  summarizeRows,
  summaryLine,
  importButtonLabel,
  noticeLines,
  isBlankProject,
  buildSelection,
  buildChapterDocs,
  buildImportSnapshot,
  applyImport,
  replaceBlockedReason
} = plan;

const NBSP = String.fromCharCode(0xa0);

const ALKU_TEXT = '– Tule, sanoi Aino.\n\n[TODO: tarkista]';
const TALO_TEXT = 'Hän <u>juoksi</u> ”kotiin” – ja jäi.';

const EMPTY_REPORT = {
  subfolders: [], rtfFiles: [], otherFiles: [], cloudPlaceholders: 0, scrivenerProject: false,
  duplicateSynopses: [], failed: []
};

// What the main process returns for a folder; `report` fields can be overridden
function makeSource(report = {}) {
  return {
    kind: 'folder',
    name: 'Draft',
    title: 'Saaren kirja',
    author: '',
    chapters: [
      { title: 'Alku', titleFrom: 'file', fileTitle: '1 Alku', cleanTitle: 'Alku', content: ALKU_TEXT, sourceFile: '1 Alku [10].txt', synopsis: 'Aino saapuu saarelle.', encoding: 'utf-8' },
      { title: 'Äidin talo', titleFrom: 'heading', fileTitle: '2 Talo', cleanTitle: 'Talo', content: TALO_TEXT, sourceFile: '2 Talo [11].txt', synopsis: '', encoding: 'windows-1252' },
      { title: 'Osa II', titleFrom: 'file', fileTitle: '3 Osa II', cleanTitle: 'Osa II', content: '', sourceFile: '3 Osa II [12].txt', synopsis: '' },
      { title: 'luku', titleFrom: 'file', fileTitle: '4. luku', cleanTitle: 'luku', content: 'Yksi kaksi kolme.', sourceFile: '4. luku [13].txt', synopsis: '' }
    ],
    report: { ...EMPTY_REPORT, ...report }
  };
}

function makeProject() {
  return {
    title: 'Vanha kirja',
    author: '',
    snapshots: [],
    structure: [
      { id: 'a', title: 'Eka', content: 'yksi kaksi', order: 0 },
      { id: 'b', title: 'Toka', content: 'kolme', order: 1 }
    ]
  };
}

function makeBlankProject() {
  return {
    title: 'Nimetön projekti',
    author: '',
    structure: [{ id: 'chapter-1', title: 'Luku 1', content: '  ', synopsis: '', notes: '', children: [] }]
  };
}

// Stands in for the app's createDocument('chapter', title)
function makeCreateChapter() {
  let n = 0;
  return (title) => ({
    id: `chapter-${++n}`, type: 'chapter', title, content: '', wordCount: 0,
    synopsis: '', synopsisAI: '', synopsisManual: '', order: 0
  });
}

const now = new Date('2026-11-16T10:00:00.000Z');

const keys = (rows) => rows.map(row => row.key).join(' ');
const titles = (rows) => rows.map(row => row.title);
const kinds = (lines) => lines.map(line => line.kind);
const textOf = (lines, kind) => lines.filter(line => line.kind === kind).map(line => line.text);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// Rows with given word counts, all ticked, for the count sentences
const countRows = (wordCounts) => wordCounts.map((words, index) => ({
  key: `r${index}`, index, title: `Luku ${index + 1}`, words, synopsis: '', included: true, encodingGuessed: false
}));

describe('rows', () => {
  test('buildRows: words, keys, and an empty folder file starts excluded', () => {
    const rows = buildRows(makeSource());

    expect(keys(rows)).toBe('r0 r1 r2 r3');
    expect(rows.map(row => row.index)).toEqual([0, 1, 2, 3]);
    expect(rows.map(row => row.words)).toEqual([6, 6, 0, 3]);
    expect(rows.map(row => row.included)).toEqual([true, true, false, true]);
    expect(rows.map(row => row.encodingGuessed)).toEqual([false, true, false, false]);
    expect(rows[0]).toEqual({
      key: 'r0',
      index: 0,
      title: 'Alku',
      titleFrom: 'file',
      fileTitle: '1 Alku',
      cleanTitle: 'Alku',
      renamed: false,
      content: ALKU_TEXT,
      words: 6,
      synopsis: 'Aino saapuu saarelle.',
      sourceFile: '1 Alku [10].txt',
      encodingGuessed: false,
      included: true
    });
    expect(rows[1].titleFrom).toBe('heading');
    expect(rows[1].content).toBe(TALO_TEXT);
  });

  test('buildRows: every chapter of a single file starts included, also an empty one', () => {
    const rows = buildRows({ kind: 'file', chapters: [{ title: 'A', content: '' }] });

    expect(rows).toEqual([{
      key: 'r0', index: 0, title: 'A', titleFrom: 'heading', fileTitle: null, cleanTitle: null, renamed: false,
      content: '', words: 0, synopsis: '', sourceFile: null, encodingGuessed: false, included: true
    }]);
  });

  test('buildRows: a title is trimmed, an empty one is Nimetön luku, and no source gives no rows', () => {
    const rows = buildRows({ kind: 'file', chapters: [{ title: '  Äidin yö  ', content: 'x' }, { title: '   ', content: 'y' }, { content: 'z' }] });
    expect(titles(rows)).toEqual(['Äidin yö', 'Nimetön luku', 'Nimetön luku']);

    expect(buildRows(null)).toEqual([]);
    expect(buildRows({ kind: 'folder' })).toEqual([]);
  });

  test('buildRows: a single file read as Windows-1252 marks every chapter, a UTF-8 file none', () => {
    const chapters = [{ title: 'A', content: 'Äiti' }, { title: 'B', content: 'Öljy' }];
    expect(buildRows({ kind: 'file', encoding: 'windows-1252', chapters }).map(row => row.encodingGuessed)).toEqual([true, true]);
    expect(buildRows({ kind: 'file', encoding: 'utf-8', chapters }).map(row => row.encodingGuessed)).toEqual([false, false]);
    expect(buildRows({ kind: 'file', chapters }).map(row => row.encodingGuessed)).toEqual([false, false]);
  });

  test('hasOrderNumbers is true for the folder and false for a single file', () => {
    expect(hasOrderNumbers(buildRows(makeSource()))).toBe(true);
    expect(hasOrderNumbers(buildRows({ kind: 'file', chapters: [{ title: '1 Alku', content: 'x' }] }))).toBe(false);

    // A folder whose file names carry no number has nothing to strip
    const plain = makeSource();
    plain.chapters = [{ title: 'Alku', titleFrom: 'file', fileTitle: 'Alku', cleanTitle: 'Alku', content: 'x', sourceFile: 'Alku.txt', synopsis: '' }];
    expect(hasOrderNumbers(buildRows(plain))).toBe(false);

    // Nor has one whose only numbered file has a heading for a title
    const headed = makeSource();
    headed.chapters = [headed.chapters[1]];
    expect(hasOrderNumbers(buildRows(headed))).toBe(false);
  });

  test('applyStripNumbers(false) puts the numbers back on file-name titles only', () => {
    const rows = buildRows(makeSource());
    const numbered = applyStripNumbers(rows, false);

    expect(titles(numbered)).toEqual(['1 Alku', 'Äidin talo', '3 Osa II', '4. luku']);
    expect(titles(applyStripNumbers(numbered, true))).toEqual(['Alku', 'Äidin talo', 'Osa II', 'luku']);
    // The heading row is returned as it is
    expect(numbered[1]).toBe(rows[1]);
    expect(numbered.every(row => row.renamed === false)).toBe(true);
  });

  test('a renamed row is left alone by the checkbox', () => {
    const renamed = renameRow(buildRows(makeSource()), 'r0', 'Saapuminen');

    expect(renamed[0].renamed).toBe(true);
    expect(titles(applyStripNumbers(renamed, false))).toEqual(['Saapuminen', 'Äidin talo', '3 Osa II', '4. luku']);
    expect(titles(applyStripNumbers(renamed, true))).toEqual(['Saapuminen', 'Äidin talo', 'Osa II', 'luku']);
  });

  test('renameRow keeps what was typed, spaces included, and touches only its row', () => {
    const rows = buildRows(makeSource());
    const renamed = renameRow(rows, 'r1', '  Äidin ”talo” – yö ');

    expect(renamed[1].title).toBe('  Äidin ”talo” – yö ');
    expect(renamed[1].renamed).toBe(true);
    expect(renamed[0]).toBe(rows[0]);
    expect(renamed).not.toBe(rows);
    expect(renameRow(rows, 'r1', '')[1].title).toBe('');
    expect(titles(renameRow(rows, 'puuttuu', 'x'))).toEqual(titles(rows));
  });

  test('moveRow moves, clamps and returns the same array when nothing moves', () => {
    const rows = buildRows(makeSource());

    expect(keys(moveRow(rows, 3, 0))).toBe('r3 r0 r1 r2');
    expect(keys(moveRow(rows, 0, 99))).toBe('r1 r2 r3 r0');
    expect(keys(moveRow(rows, 1, 2))).toBe('r0 r2 r1 r3');
    expect(keys(moveRow(rows, 2, -5))).toBe('r2 r0 r1 r3');
    expect(moveRow(rows, 1, 1)).toBe(rows);
    expect(moveRow(rows, -1, 2)).toBe(rows);
    expect(moveRow(rows, 4, 0)).toBe(rows);
    expect(moveRow(rows, 3, 99)).toBe(rows);
    expect(moveRow(rows, 0, -1)).toBe(rows);
    expect(moveRow(rows, 1, undefined)).toBe(rows);
    // A drop without a target moves nothing; it does not throw the row to the top
    expect(moveRow(rows, 2, null)).toBe(rows);
    expect(moveRow(rows, 2, NaN)).toBe(rows);
    expect(moveRow(rows, 2, '0')).toBe(rows);
    expect(moveRow(rows, '2', 0)).toBe(rows);
    expect(keys(moveRow(rows, 0, Infinity))).toBe('r1 r2 r3 r0');
    expect(keys(moveRow(rows, 3, -Infinity))).toBe('r3 r0 r1 r2');
    expect(moveRow(rows, 1.5, 0)).toBe(rows);
    // A move gives a new array and leaves the old one as it was
    expect(moveRow(rows, 3, 0)).not.toBe(rows);
    expect(keys(rows)).toBe('r0 r1 r2 r3');
  });

  test('isReordered and resetOrder', () => {
    const rows = buildRows(makeSource());
    const moved = moveRow(rows, 3, 0);

    expect(isReordered(rows)).toBe(false);
    expect(isReordered(moved)).toBe(true);
    expect(keys(resetOrder(moved))).toBe('r0 r1 r2 r3');
    expect(isReordered(resetOrder(moved))).toBe(false);
    expect(keys(moved)).toBe('r3 r0 r1 r2');
    expect(isReordered([])).toBe(false);
  });

  test('setRowIncluded and setAllIncluded give new arrays', () => {
    const rows = buildRows(makeSource());

    const ticked = setRowIncluded(rows, 'r2', true);
    expect(ticked.map(row => row.included)).toEqual([true, true, true, true]);
    expect(ticked).not.toBe(rows);
    expect(ticked[0]).toBe(rows[0]);
    expect(rows[2].included).toBe(false);

    expect(setAllIncluded(rows, false).map(row => row.included)).toEqual([false, false, false, false]);
    expect(setAllIncluded(rows, true).map(row => row.included)).toEqual([true, true, true, true]);
    expect(setRowIncluded(rows, 'r0', false).map(row => row.included)).toEqual([false, true, false, true]);
  });

  test('no row function changes the rows it is given', () => {
    const rows = deepFreeze(buildRows(makeSource()));

    applyStripNumbers(rows, false);
    moveRow(rows, 0, 3);
    renameRow(rows, 'r0', 'Uusi');
    setRowIncluded(rows, 'r2', true);
    setAllIncluded(rows, false);
    resetOrder(moveRow(rows, 3, 0));
    summarizeRows(rows);
    noticeLines(makeSource(), rows);
    buildSelection(rows, { mode: 'replace' });

    expect(titles(rows)).toEqual(['Alku', 'Äidin talo', 'Osa II', 'luku']);
  });
});

describe('counts and sentences', () => {
  test('summary counts only included rows', () => {
    const rows = buildRows(makeSource());

    expect(summarizeRows(rows)).toEqual({ included: 3, excluded: 1, words: 15, synopses: 1 });
    expect(summaryLine(rows)).toBe('Tuodaan 3 lukua, 15 sanaa.');
    expect(importButtonLabel(rows)).toBe('Tuo 3 lukua');

    // Unticking the row with the synopsis takes its words and its synopsis out of the counts
    expect(summarizeRows(setRowIncluded(rows, 'r0', false))).toEqual({ included: 2, excluded: 2, words: 9, synopses: 0 });
  });

  test('summary for one and for none', () => {
    const none = setAllIncluded(buildRows(makeSource()), false);
    const one = setRowIncluded(none, 'r3', true);

    expect(summaryLine(one)).toBe('Tuodaan 1 luku, 3 sanaa.');
    expect(importButtonLabel(one)).toBe('Tuo 1 luku');
    expect(summaryLine(none)).toBe('Yhtään lukua ei ole valittu.');
    expect(importButtonLabel(none)).toBe('Tuo');
    expect(summaryLine([])).toBe('Yhtään lukua ei ole valittu.');
    expect(importButtonLabel([])).toBe('Tuo');
  });

  test('summary: one word is 1 sana, an empty ticked chapter is 0 sanaa, and thousands are grouped with a no-break space', () => {
    expect(summaryLine(countRows([1]))).toBe('Tuodaan 1 luku, 1 sana.');
    expect(summaryLine(countRows([0]))).toBe('Tuodaan 1 luku, 0 sanaa.');

    const book = countRows([...Array(30).fill(2800), 512]);
    expect(summaryLine(book)).toBe(`Tuodaan 31 lukua, 84${NBSP}512 sanaa.`);
    expect(importButtonLabel(book)).toBe('Tuo 31 lukua');
    expect(summaryLine(countRows([1234567]))).toBe(`Tuodaan 1 luku, 1${NBSP}234${NBSP}567 sanaa.`);
    expect(summaryLine(countRows([999]))).toBe('Tuodaan 1 luku, 999 sanaa.');
    expect(importButtonLabel(countRows(Array(1200).fill(1)))).toBe(`Tuo 1${NBSP}200 lukua`);
  });

  // True before and after I-01 replaces the private copy; the STUB marker
  // itself is policed by the contract's grep, not by this file
  test('formatCount is not exported', () => {
    expect(plan.formatCount).toBeUndefined();
  });

  test('noticeLines: RTF advice names plain text in Scrivener, one and many', () => {
    const one = makeSource({ rtfFiles: ['5 Vanha [14].rtf'] });
    const many = makeSource({ rtfFiles: Array.from({ length: 12 }, (_item, index) => `${index + 1}.rtf`) });

    expect(textOf(noticeLines(one, buildRows(one)), 'rtf')).toEqual([
      'Kansiossa on 1 RTF-tiedosto, jota FAUST ei tuo. Valitse Scrivenerin synkronointiasetuksista muodoksi pelkkä teksti (Plain Text) ja synkronoi uudelleen.'
    ]);
    expect(textOf(noticeLines(many, buildRows(many)), 'rtf')).toEqual([
      'Kansiossa on 12 RTF-tiedostoa, joita FAUST ei tuo. Valitse Scrivenerin synkronointiasetuksista muodoksi pelkkä teksti (Plain Text) ja synkronoi uudelleen.'
    ]);
    for (const source of [one, many]) {
      expect(textOf(noticeLines(source, buildRows(source)), 'rtf')[0]).toContain('pelkkä teksti (Plain Text)');
    }
  });

  test('noticeLines: sub-folders are named, at most five', () => {
    const one = makeSource({ subfolders: ['Notes'] });
    const three = makeSource({ subfolders: ['Notes', 'Research', 'Trashed Files'] });
    const five = makeSource({ subfolders: ['a', 'b', 'c', 'd', 'e'] });
    const seven = makeSource({ subfolders: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });

    expect(textOf(noticeLines(one, buildRows(one)), 'subfolders')).toEqual(['Alikansiota ei luettu: Notes.']);
    expect(textOf(noticeLines(three, buildRows(three)), 'subfolders')).toEqual(['Alikansioita ei luettu: Notes, Research, Trashed Files.']);
    expect(textOf(noticeLines(five, buildRows(five)), 'subfolders')).toEqual(['Alikansioita ei luettu: a, b, c, d, e.']);
    expect(textOf(noticeLines(seven, buildRows(seven)), 'subfolders')).toEqual(['Alikansioita ei luettu: a, b, c, d, e ja 2 muuta.']);
  });

  test('noticeLines: empty, encoding, synopsis, failed and other lines in the fixed order', () => {
    const source = makeSource({
      otherFiles: ['kansi.png'],
      failed: [{ name: '6 Rikki.docx', error: 'Tiedostoa ei voitu lukea' }]
    });
    const lines = noticeLines(source, buildRows(source));

    expect(kinds(lines)).toEqual(['failed', 'encoding', 'empty', 'synopses', 'other']);
    expect(lines.map(line => line.text)).toEqual([
      'Tiedostoa 6 Rikki.docx ei voitu lukea: Tiedostoa ei voitu lukea',
      '1 tiedosto ei ollut UTF-8-muodossa, ja sen merkistö arvattiin. Tarkista, että ä ja ö näkyvät oikein.',
      '1 tyhjä tiedosto on jätetty pois. Voit ottaa sen mukaan rastimalla.',
      'Tiivistelmä löytyi 1 luvulle.',
      '1 muu tiedosto ohitettiin.'
    ]);
  });

  test('noticeLines: the empty line disappears when the empty row is ticked', () => {
    const source = makeSource();
    const rows = buildRows(source);

    expect(kinds(noticeLines(source, rows))).toContain('empty');
    expect(kinds(noticeLines(source, setRowIncluded(rows, 'r2', true)))).not.toContain('empty');
    // A row with text that the author unticked is not an empty file
    expect(textOf(noticeLines(source, setRowIncluded(rows, 'r3', false)), 'empty')).toEqual([
      '1 tyhjä tiedosto on jätetty pois. Voit ottaa sen mukaan rastimalla.'
    ]);
  });

  test('noticeLines: every kind, in the fixed order, with the sentences for many', () => {
    const source = makeSource({
      scrivenerProject: true,
      rtfFiles: ['a.rtf', 'b.rtfd'],
      cloudPlaceholders: 3,
      subfolders: ['Notes', 'Trashed Files'],
      failed: [
        { name: '6 Rikki.docx', error: 'Tiedostoa ei voitu lukea' },
        { name: '7 Iso.txt', error: 'Tiedosto on liian suuri (yli 20 Mt).' }
      ],
      duplicateSynopses: ['Alku-synopsis.md', 'Alku (tiivistelmä).txt'],
      otherFiles: ['kansi.png', 'käsis.fdx']
    });
    source.chapters.push(
      { title: 'Yö', titleFrom: 'file', fileTitle: '5 Yö', cleanTitle: 'Yö', content: '', sourceFile: '5 Yö [14].txt', synopsis: 'Yö tulee.', encoding: 'windows-1252' }
    );
    const lines = noticeLines(source, buildRows(source));

    expect(lines).toEqual([
      { kind: 'scrivener', text: 'Tämä näyttää Scrivener-projektilta (.scriv). FAUST ei lue projektitiedostoa suoraan. Tuo Scrivenerin synkronointikansio (Sync with External Folder) tai käännä kirja .docx-tiedostoksi ja valitse Tiedosto → Tuo tekstiä.' },
      { kind: 'rtf', text: 'Kansiossa on 2 RTF-tiedostoa, joita FAUST ei tuo. Valitse Scrivenerin synkronointiasetuksista muodoksi pelkkä teksti (Plain Text) ja synkronoi uudelleen.' },
      { kind: 'cloud', text: '3 tiedostoa on vain iCloudissa, eikä niitä voitu lukea. Lataa kansio Finderissa tälle koneelle ja tuo uudelleen.' },
      { kind: 'subfolders', text: 'Alikansioita ei luettu: Notes, Trashed Files.' },
      { kind: 'failed', text: 'Tiedostoa 6 Rikki.docx ei voitu lukea: Tiedostoa ei voitu lukea' },
      { kind: 'failed', text: 'Tiedostoa 7 Iso.txt ei voitu lukea: Tiedosto on liian suuri (yli 20 Mt).' },
      { kind: 'duplicate-synopsis', text: 'Luvulle löytyi useampi tiivistelmätiedosto. Ohitettiin: Alku-synopsis.md, Alku (tiivistelmä).txt.' },
      { kind: 'encoding', text: '2 tiedostoa ei ollut UTF-8-muodossa, ja niiden merkistö arvattiin. Tarkista, että ä ja ö näkyvät oikein.' },
      { kind: 'empty', text: '2 tyhjää tiedostoa on jätetty pois. Voit ottaa ne mukaan rastimalla.' },
      { kind: 'synopses', text: 'Tiivistelmä löytyi 2 luvulle.' },
      { kind: 'other', text: '2 muuta tiedostoa ohitettiin.' }
    ]);
  });

  test('noticeLines: the sentences for one', () => {
    const source = makeSource({ cloudPlaceholders: 1, duplicateSynopses: ['Alku-synopsis.md'] });
    const lines = noticeLines(source, buildRows(source));

    expect(textOf(lines, 'cloud')).toEqual(['1 tiedosto on vain iCloudissa, eikä sitä voitu lukea. Lataa kansio Finderissa tälle koneelle ja tuo uudelleen.']);
    expect(textOf(lines, 'duplicate-synopsis')).toEqual(['Luvulle löytyi useampi tiivistelmätiedosto. Ohitettiin: Alku-synopsis.md.']);
    expect(kinds(lines)).toEqual(['cloud', 'duplicate-synopsis', 'encoding', 'empty', 'synopses']);
  });

  test('noticeLines: counts are grouped with a no-break space', () => {
    const source = makeSource({
      rtfFiles: Array.from({ length: 1234 }, (_item, index) => `${index}.rtf`),
      otherFiles: Array.from({ length: 84512 }, (_item, index) => `${index}.png`),
      cloudPlaceholders: 2000
    });
    const lines = noticeLines(source, buildRows(source));

    expect(textOf(lines, 'rtf')[0]).toContain(`Kansiossa on 1${NBSP}234 RTF-tiedostoa, joita`);
    expect(textOf(lines, 'cloud')[0]).toContain(`2${NBSP}000 tiedostoa on vain iCloudissa`);
    expect(textOf(lines, 'other')).toEqual([`84${NBSP}512 muuta tiedostoa ohitettiin.`]);
  });

  test('noticeLines: a single file has no report, and its guessed encoding is one file however many chapters it has', () => {
    const guessed = { kind: 'file', name: 'kirja.txt', encoding: 'windows-1252', chapters: [{ title: 'A', content: 'Äiti' }, { title: 'B', content: '' }, { title: 'C', content: 'Öljy' }] };
    const rows = buildRows(guessed);

    expect(noticeLines(guessed, rows)).toEqual([
      { kind: 'encoding', text: '1 tiedosto ei ollut UTF-8-muodossa, ja sen merkistö arvattiin. Tarkista, että ä ja ö näkyvät oikein.' }
    ]);
    // An unticked empty chapter of a single file is not an empty file
    expect(kinds(noticeLines(guessed, setRowIncluded(rows, 'r1', false)))).toEqual(['encoding']);

    const clean = { kind: 'file', name: 'kirja.md', encoding: 'utf-8', chapters: [{ title: 'A', content: 'Teksti.' }] };
    expect(noticeLines(clean, buildRows(clean))).toEqual([]);
  });

  test('noticeLines: a folder with nothing to report says nothing', () => {
    const source = makeSource();
    source.chapters = [{ title: 'Alku', titleFrom: 'file', fileTitle: '1 Alku', cleanTitle: 'Alku', content: 'Teksti.', sourceFile: '1 Alku.txt', synopsis: '', encoding: 'utf-8' }];
    expect(noticeLines(source, buildRows(source))).toEqual([]);
    expect(noticeLines({ kind: 'folder', chapters: [] }, [])).toEqual([]);
  });

  test('replaceBlockedReason', () => {
    expect(replaceBlockedReason({})).toBeNull();
    expect(replaceBlockedReason()).toBeNull();
    expect(replaceBlockedReason({ pendingSuggestions: 0, activeRequests: 0 })).toBeNull();
    expect(replaceBlockedReason({ pendingSuggestions: 1 }))
      .toBe('Projektissa on 1 käsittelemätön ehdotus. Käsittele se ensin tai lisää luvut projektin loppuun.');
    expect(replaceBlockedReason({ pendingSuggestions: 12 }))
      .toBe('Projektissa on 12 käsittelemätöntä ehdotusta. Käsittele ne ensin tai lisää luvut projektin loppuun.');
    expect(replaceBlockedReason({ activeRequests: 1 }))
      .toBe('Tekoälypyyntö on käynnissä. Pysäytä se tai odota sen valmistumista ennen lukujen korvaamista.');
    expect(replaceBlockedReason({ activeRequests: 3 }))
      .toBe('Tekoälypyyntö on käynnissä. Pysäytä se tai odota sen valmistumista ennen lukujen korvaamista.');
    expect(replaceBlockedReason({ pendingSuggestions: 2, activeRequests: 1 })).toContain('2 käsittelemätöntä ehdotusta');
    expect(replaceBlockedReason({ pendingSuggestions: 1500 })).toContain(`1${NBSP}500 käsittelemätöntä ehdotusta`);
  });
});

describe('applying the import', () => {
  test('isBlankProject', () => {
    expect(isBlankProject({ structure: [{ content: '  ', synopsis: '', notes: '', children: [] }] })).toBe(true);
    expect(isBlankProject({ structure: [] })).toBe(true);
    expect(isBlankProject(makeBlankProject())).toBe(true);
    expect(isBlankProject({ structure: [{ title: 'Luku 1' }] })).toBe(true);

    expect(isBlankProject({ structure: [{ content: '', synopsis: 'Aino saapuu.', notes: '' }] })).toBe(false);
    expect(isBlankProject({ structure: [{ content: 'Teksti.', synopsis: '', notes: '' }] })).toBe(false);
    expect(isBlankProject({ structure: [{ content: '' }, { content: '' }] })).toBe(false);
    expect(isBlankProject({ structure: [{ content: '', notes: 'Muista lautta.' }] })).toBe(false);
    expect(isBlankProject({ structure: [{ content: '', children: [{ content: '' }] }] })).toBe(false);
    expect(isBlankProject(makeProject())).toBe(false);
  });

  test('buildSelection keeps order, trims titles and names an untitled chapter', () => {
    let rows = buildRows(makeSource());
    rows = renameRow(rows, 'r0', '   ');
    rows = renameRow(rows, 'r1', '  Äidin talo ');
    rows = moveRow(rows, 3, 0);

    const selection = buildSelection(rows, { mode: 'replace', bookTitle: ' Saaren kirja ', author: 'Aino Älvä', sourceName: 'Draft', snapshot: false });

    expect(selection).toEqual({
      mode: 'replace',
      bookTitle: 'Saaren kirja',
      author: 'Aino Älvä',
      sourceName: 'Draft',
      snapshot: true,
      chapters: [
        { title: 'luku', content: 'Yksi kaksi kolme.', synopsis: '' },
        { title: 'Nimetön luku', content: ALKU_TEXT, synopsis: 'Aino saapuu saarelle.' },
        { title: 'Äidin talo', content: TALO_TEXT, synopsis: '' }
      ]
    });
    // The excluded empty row is absent
    expect(selection.chapters.map(chapter => chapter.title)).not.toContain('Osa II');
  });

  test('buildSelection: any other mode is append, and only append can go without a snapshot', () => {
    const rows = buildRows(makeSource());

    expect(buildSelection(rows, { mode: 'append', snapshot: false })).toMatchObject({ mode: 'append', snapshot: false });
    expect(buildSelection(rows, { mode: 'append', snapshot: true })).toMatchObject({ mode: 'append', snapshot: true });
    expect(buildSelection(rows, { mode: 'append' })).toMatchObject({ mode: 'append', snapshot: true });
    expect(buildSelection(rows, { mode: 'uusi projekti', snapshot: false })).toMatchObject({ mode: 'append', snapshot: false });
    expect(buildSelection(rows)).toMatchObject({ mode: 'append', snapshot: true, bookTitle: '', author: '', sourceName: '' });
    expect(buildSelection(rows, { mode: 'replace' })).toMatchObject({ mode: 'replace', snapshot: true });
  });

  test('buildSelection trims the synopsis and takes an empty ticked row as an empty chapter', () => {
    const source = makeSource();
    source.chapters[0].synopsis = '\n  Aino saapuu saarelle. \n';
    const rows = setRowIncluded(buildRows(source), 'r2', true);
    const selection = buildSelection(rows, { mode: 'append' });

    expect(selection.chapters.map(chapter => chapter.synopsis)).toEqual(['Aino saapuu saarelle.', '', '', '']);
    expect(selection.chapters[2]).toEqual({ title: 'Osa II', content: '', synopsis: '' });
  });

  test('the chapter text goes through buildSelection and buildChapterDocs byte for byte', () => {
    const source = makeSource();
    source.chapters[3].content = '  Sisennetty alku.\n';
    const selection = buildSelection(buildRows(source), { mode: 'append' });
    expect(selection.chapters[2].content).toBe('  Sisennetty alku.\n');
    let n = 0;
    const docs = buildChapterDocs(selection, title => ({ id: 'chapter-' + (++n), type: 'chapter', title, content: '', synopsis: '', synopsisManual: '' }));
    expect(docs[2].content).toBe('  Sisennetty alku.\n');
  });

  test('buildChapterDocs writes the synopsis to synopsis and synopsisManual and counts words', () => {
    const selection = buildSelection(buildRows(makeSource()), { mode: 'append', bookTitle: 'Saaren kirja', sourceName: 'Draft' });
    const docs = buildChapterDocs(selection, makeCreateChapter());

    expect(docs).toHaveLength(3);
    expect(docs[0]).toEqual({
      id: 'chapter-1', type: 'chapter', title: 'Alku', content: ALKU_TEXT, wordCount: 6,
      synopsis: 'Aino saapuu saarelle.', synopsisAI: '', synopsisManual: 'Aino saapuu saarelle.', order: 0
    });
    expect(docs[0].content).toContain('[TODO: tarkista]');
    expect(docs[1].synopsis).toBe('');
    expect(docs[1].synopsisManual).toBe('');
    expect(docs[1].content).toBe(TALO_TEXT);
    expect(docs[1].content).toContain('<u>juoksi</u> ”kotiin” – ja jäi.');
    expect(docs[1].wordCount).toBe(6);
    expect(docs.map(doc => doc.title)).toEqual(['Alku', 'Äidin talo', 'luku']);
  });

  test('buildChapterDocs keeps every field createChapter gives, and its summary when none was imported', () => {
    const createChapter = (title) => ({ id: `c-${title}`, title: 'toinen', content: 'vanha', wordCount: 99, synopsis: 'Pohjan tiivistelmä', synopsisManual: '', noAI: false, status: 'draft' });
    const selection = {
      chapters: [
        { title: 'Alku', content: 'Yksi kaksi.', synopsis: 'Tuotu tiivistelmä.' },
        { title: 'Loppu', content: '', synopsis: '' }
      ]
    };
    const docs = buildChapterDocs(selection, createChapter);

    expect(docs[0]).toEqual({ id: 'c-Alku', title: 'Alku', content: 'Yksi kaksi.', wordCount: 2, synopsis: 'Tuotu tiivistelmä.', synopsisManual: 'Tuotu tiivistelmä.', noAI: false, status: 'draft' });
    expect(docs[1]).toEqual({ id: 'c-Loppu', title: 'Loppu', content: '', wordCount: 0, synopsis: 'Pohjan tiivistelmä', synopsisManual: '', noAI: false, status: 'draft' });
  });

  test('applyImport appends after the existing chapters and takes a snapshot first', () => {
    const project = makeProject();
    const selection = buildSelection(buildRows(makeSource()), { mode: 'append', bookTitle: 'Saaren kirja', sourceName: 'Draft' });
    const docs = buildChapterDocs(selection, makeCreateChapter());
    const result = applyImport(project, selection, docs, { now });

    expect(result.structure.map(chapter => [chapter.id, chapter.order])).toEqual([
      ['a', 0], ['b', 1], ['chapter-1', 2], ['chapter-2', 3], ['chapter-3', 4]
    ]);
    expect(result.title).toBe('Vanha kirja');
    expect(result.author).toBe('');
    expect(result.modified).toBe('2026-11-16T10:00:00.000Z');

    expect(result.snapshots).toHaveLength(1);
    const [snapshot] = result.snapshots;
    expect(snapshot).toEqual({
      id: 'snapshot-1794823200000',
      name: 'Ennen tuontia: Draft',
      description: 'Automaattinen tilannekuva ennen tuontia.',
      created: '2026-11-16T10:00:00.000Z',
      totalWords: 3,
      chapterCount: 2,
      structure: project.structure,
      auto: 'import'
    });
    expect(snapshot.auto).toBe('import');
    expect(snapshot.structure).toHaveLength(2);
    expect(snapshot.structure.map(chapter => chapter.id)).toEqual(['a', 'b']);
  });

  test('applyImport does not change its input', () => {
    const project = deepFreeze(makeProject());
    const selection = deepFreeze(buildSelection(buildRows(makeSource()), { mode: 'append', sourceName: 'Draft' }));
    const docs = deepFreeze(buildChapterDocs(selection, makeCreateChapter()));
    const result = applyImport(project, selection, docs, { now });

    expect(project.structure).toHaveLength(2);
    expect(project.snapshots).toHaveLength(0);
    expect(project.modified).toBeUndefined();
    expect(result).not.toBe(project);
    expect(result.snapshots[0].structure).not.toBe(project.structure);
    expect(result.snapshots[0].structure[0]).not.toBe(project.structure[0]);
    // The existing chapters are carried over as they are; the docs are copied, not renumbered in place
    expect(result.structure[0]).toBe(project.structure[0]);
    expect(docs.map(doc => doc.order)).toEqual([0, 0, 0]);
  });

  test('applyImport replace: new chapters only, new title, and the old title in the snapshot', () => {
    const project = makeProject();
    const selection = buildSelection(buildRows(makeSource()), { mode: 'replace', bookTitle: 'Saaren kirja', sourceName: 'Draft', snapshot: false });
    const docs = buildChapterDocs(selection, makeCreateChapter());
    const result = applyImport(project, selection, docs, { now });

    expect(result.structure.map(chapter => [chapter.id, chapter.order])).toEqual([['chapter-1', 0], ['chapter-2', 1], ['chapter-3', 2]]);
    expect(result.title).toBe('Saaren kirja');
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0].name).toBe('Ennen tuontia: Draft');
    expect(result.snapshots[0].description).toBe('Automaattinen tilannekuva ennen tuontia. Projektin nimi oli ”Vanha kirja”.');
    expect(result.snapshots[0].structure.map(chapter => chapter.id)).toEqual(['a', 'b']);
    expect(result.snapshots[0].auto).toBe('import');

    // A replace always takes the snapshot, whatever the selection says
    const forced = applyImport(project, { ...selection, snapshot: false }, docs, { now });
    expect(forced.snapshots).toHaveLength(1);
    expect(forced.structure).toHaveLength(3);
  });

  test('applyImport replace keeps the name when the title field was left empty or unchanged', () => {
    const project = makeProject();
    const rows = buildRows(makeSource());
    const docsFor = (selection) => buildChapterDocs(selection, makeCreateChapter());

    const untitled = buildSelection(rows, { mode: 'replace', bookTitle: '   ', sourceName: 'Draft' });
    const kept = applyImport(project, untitled, docsFor(untitled), { now });
    expect(kept.title).toBe('Vanha kirja');
    expect(kept.snapshots[0].description).toBe('Automaattinen tilannekuva ennen tuontia.');

    const same = buildSelection(rows, { mode: 'replace', bookTitle: 'Vanha kirja', sourceName: 'Draft' });
    expect(applyImport(project, same, docsFor(same), { now }).snapshots[0].description).toBe('Automaattinen tilannekuva ennen tuontia.');
  });

  test('applyImport: the author of the project stays, and the imported one is taken only on a replace without one', () => {
    const rows = buildRows(makeSource());
    const replace = buildSelection(rows, { mode: 'replace', bookTitle: 'Saaren kirja', author: 'Aino Älvä', sourceName: 'Draft' });
    const append = buildSelection(rows, { mode: 'append', author: 'Aino Älvä', sourceName: 'Draft' });
    const docs = buildChapterDocs(replace, makeCreateChapter());

    expect(applyImport(makeProject(), replace, docs, { now }).author).toBe('Aino Älvä');
    expect(applyImport({ ...makeProject(), author: 'Åke Öhman' }, replace, docs, { now }).author).toBe('Åke Öhman');
    expect(applyImport(makeProject(), append, docs, { now }).author).toBe('');
    expect(applyImport({ ...makeProject(), author: 'Åke Öhman' }, append, docs, { now }).author).toBe('Åke Öhman');
  });

  test('applyImport into a blank project replaces the empty chapter and takes no snapshot', () => {
    const project = makeBlankProject();
    const selection = buildSelection(buildRows(makeSource()), { mode: 'append', bookTitle: 'Saaren kirja', sourceName: 'Draft' });
    const docs = buildChapterDocs(selection, makeCreateChapter());
    const result = applyImport(project, selection, docs, { now });

    expect(result.structure.map(chapter => [chapter.id, chapter.order])).toEqual([['chapter-1', 0], ['chapter-2', 1], ['chapter-3', 2]]);
    expect(result.title).toBe('Saaren kirja');
    expect(result.snapshots).toHaveLength(0);
    expect(result.modified).toBe('2026-11-16T10:00:00.000Z');
  });

  test('applyImport append without a snapshot when the author unticked it', () => {
    const project = makeProject();
    const selection = buildSelection(buildRows(makeSource()), { mode: 'append', sourceName: 'Draft', snapshot: false });
    const docs = buildChapterDocs(selection, makeCreateChapter());
    const result = applyImport(project, selection, docs, { now });

    expect(result.snapshots).toHaveLength(0);
    expect(result.structure).toHaveLength(5);
  });

  test('applyImport with no chapters returns the same project object', () => {
    const project = makeProject();
    const selection = buildSelection(setAllIncluded(buildRows(makeSource()), false), { mode: 'replace', bookTitle: 'Saaren kirja' });

    expect(selection.chapters).toEqual([]);
    expect(applyImport(project, selection, buildChapterDocs(selection, makeCreateChapter()), { now })).toBe(project);
    expect(applyImport(project, selection, undefined, { now })).toBe(project);
  });

  test('applyImport leaves everything else in the project as it is and keeps earlier snapshots', () => {
    const earlier = { id: 'snapshot-1', name: 'Oma', created: '2026-11-01T08:00:00.000Z', structure: [] };
    const project = {
      ...makeProject(),
      snapshots: [earlier],
      bookmarks: [{ id: 'bm1' }],
      collections: [{ id: 'col1' }],
      characters: [{ name: 'Aino' }],
      settings: { theme: 'NOX' },
      created: '2026-01-01T00:00:00.000Z'
    };
    const selection = buildSelection(buildRows(makeSource()), { mode: 'replace', bookTitle: 'Saaren kirja', sourceName: 'Draft' });
    const result = applyImport(project, selection, buildChapterDocs(selection, makeCreateChapter()), { now });

    expect(result.bookmarks).toBe(project.bookmarks);
    expect(result.collections).toBe(project.collections);
    expect(result.characters).toBe(project.characters);
    expect(result.settings).toBe(project.settings);
    expect(result.created).toBe('2026-01-01T00:00:00.000Z');
    expect(result.snapshots.map(snapshot => snapshot.name)).toEqual(['Oma', 'Ennen tuontia: Draft']);
    expect(result.snapshots[0]).toBe(earlier);
  });

  test('applyImport uses the time of the call when none is given', () => {
    const before = Date.now();
    const selection = buildSelection(buildRows(makeSource()), { mode: 'append', sourceName: 'Draft' });
    const result = applyImport(makeProject(), selection, buildChapterDocs(selection, makeCreateChapter()));

    expect(Date.parse(result.modified)).toBeGreaterThanOrEqual(before);
    expect(result.snapshots[0].created).toBe(result.modified);
  });

  test('buildImportSnapshot names the source, and says the old name only when a replace changes it', () => {
    const project = makeProject();
    const snapshot = buildImportSnapshot(project, { mode: 'append', bookTitle: 'Saaren kirja', sourceName: 'kirja.docx' }, now);

    expect(snapshot.name).toBe('Ennen tuontia: kirja.docx');
    expect(snapshot.description).toBe('Automaattinen tilannekuva ennen tuontia.');
    expect(snapshot.auto).toBe('import');
    expect(snapshot.id).toBe('snapshot-1794823200000');
    expect(buildImportSnapshot(project, { mode: 'replace', bookTitle: 'Saaren kirja', sourceName: '' }, now)).toMatchObject({
      name: 'Ennen tuontia: tuotu teksti',
      description: 'Automaattinen tilannekuva ennen tuontia. Projektin nimi oli ”Vanha kirja”.'
    });
    expect(buildImportSnapshot({ title: '', structure: [] }, { mode: 'replace', bookTitle: 'Saaren kirja' }, now).description)
      .toBe('Automaattinen tilannekuva ennen tuontia.');
  });

  test('the text keeps ä ö å, ”, –, the dialogue dash, [TODO: …] and <u> from the source to the project', () => {
    const content = '– Tule, sanoi Åke.\n\n- Hei, sanoi Äiti.\n\n[TODO: tarkista lautan aikataulu]\n\nHän <u>juoksi</u> ”kotiin” – ja jäi öljyyn.';
    const source = {
      kind: 'folder', name: 'Äidin kirja', title: 'Äidin kirja', author: '',
      chapters: [{ title: 'Åke ja ”Äiti” – yö', titleFrom: 'heading', fileTitle: '1 Yö', cleanTitle: 'Yö', content, sourceFile: '1 Yö.txt', synopsis: 'Åke – ”öisin” [TODO: nimi]' }],
      report: { ...EMPTY_REPORT }
    };
    const rows = buildRows(source);
    const selection = buildSelection(rows, { mode: 'replace', bookTitle: source.title, sourceName: source.name });
    const result = applyImport(makeProject(), selection, buildChapterDocs(selection, makeCreateChapter()), { now });

    expect(rows[0].content).toBe(content);
    expect(result.structure[0].content).toBe(content);
    expect(result.structure[0].title).toBe('Åke ja ”Äiti” – yö');
    expect(result.structure[0].synopsis).toBe('Åke – ”öisin” [TODO: nimi]');
    expect(result.structure[0].synopsisManual).toBe('Åke – ”öisin” [TODO: nimi]');
    expect(result.title).toBe('Äidin kirja');
    expect(result.snapshots[0].name).toBe('Ennen tuontia: Äidin kirja');
  });
});

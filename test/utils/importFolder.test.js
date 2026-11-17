/**
 * @jest-environment node
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  CHAPTER_EXTENSIONS,
  naturalCompare,
  fileStem,
  cleanImportTitle,
  pairSynopsisFiles,
  classifyEntries,
  readImportFolder,
  resolveSubfolder
} = require('../../utils/importFolder');

// Three cases need decodeText and oneChapterPerFile of utils/manuscript.js.
// Stage I-01 adds them; until then those cases are skipped.
const real = typeof require('../../utils/manuscript').decodeText === 'function';
const realTest = real ? test : test.skip;

const NBSP = String.fromCharCode(0xa0);
const BOM = String.fromCharCode(0xfeff);
const decomposed = (text) => text.normalize('NFD');

// Stands in for the two functions of utils/manuscript.js
const stubManuscript = {
  decodeText(buffer) {
    const text = buffer.toString('utf-8');
    return { text: text.startsWith(BOM) ? text.slice(1) : text, encoding: 'utf-8' };
  },

  async importDocument(buffer, name, { oneChapterPerFile } = {}) {
    if (oneChapterPerFile !== true) throw new Error('oneChapterPerFile puuttuu');
    if (/\.docx$/i.test(name) && buffer.slice(0, 2).toString('latin1') !== 'PK') {
      throw new Error('Tiedostoa ei voitu lukea');
    }
    const { text, encoding } = stubManuscript.decodeText(buffer);
    const lines = text.split('\n');
    const onlyTopHeading = lines[0].startsWith('# ') && lines.filter(line => line.startsWith('# ')).length === 1;
    const chapter = onlyTopHeading
      ? { title: lines[0].slice(2).trim(), content: lines.slice(1).join('\n').trim(), titleFrom: 'heading' }
      : { title: name.replace(/\.[^.]+$/, ''), content: text.trim(), titleFrom: 'file' };
    return { title: chapter.title, author: '', chapters: [chapter], encoding };
  }
};

const ALKU_TEXT = '– Tule, sanoi Aino.\n\n- Hei, sanoi Pekka.\n\n[TODO: tarkista lautan aikataulu]\n\nHän <u>juoksi</u> ”kotiin” – ja jäi.\n';

// The folder Scrivener's sync writes, with the things macOS adds around it
function writeFixture(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const files = [
    ['1 Alku [10].txt', ALKU_TEXT],
    ['1 Alku [10].synopsis.txt', 'Aino saapuu saarelle.\n'],
    [decomposed('2 Äiti [11].txt'), 'Äiti odotti.\n'],
    ['3 Saapuminen [12].md', '# Saapuminen\n\nTeksti.\n\n## Laiturilla\nA\n\n## Talossa\nB\n'],
    ['4 Osa II [13].txt', ''],
    ['10 Loppu [3].txt', 'Loppu.\n'],
    ['5 Vanha [14].rtf', '{\\rtf1 x}'],
    ['._1 Alku [10].txt', 'xx'],
    ['.DS_Store', 'xx'],
    ['kansi.png', 'xx']
  ];
  for (const [name, content] of files) fs.writeFileSync(path.join(dir, name), content);
  fs.mkdirSync(path.join(dir, 'Notes'));
  fs.writeFileSync(path.join(dir, 'Notes', 'muistio.txt'), 'EI SAA NÄKYÄ');
  return dir;
}

// [name, modification time, size] of everything under a folder, the folder itself included
function listTree(dir, prefix = '') {
  const rows = prefix ? [] : [['.', fs.statSync(dir).mtimeMs, 0]];
  for (const name of fs.readdirSync(dir).sort()) {
    const stat = fs.lstatSync(path.join(dir, name));
    rows.push([prefix + name, stat.mtimeMs, stat.isDirectory() ? 0 : stat.size]);
    if (stat.isDirectory()) rows.push(...listTree(path.join(dir, name), `${prefix}${name}/`));
  }
  return rows;
}

const file = (name) => ({ name, isFile: true, isDirectory: false });
const folder = (name) => ({ name, isFile: false, isDirectory: true });

test('CHAPTER_EXTENSIONS are the formats the single-file import accepts', () => {
  expect(CHAPTER_EXTENSIONS).toEqual(['txt', 'md', 'markdown', 'docx']);
});

describe('naturalCompare', () => {
  test('2 comes before 10', () => {
    expect(['10 Loppu [3].txt', '2 Äiti [11].txt', '1 Alku [10].txt'].sort(naturalCompare))
      .toEqual(['1 Alku [10].txt', '2 Äiti [11].txt', '10 Loppu [3].txt']);
  });

  test('å ä ö come after z, in that order', () => {
    expect(['Öljy.txt', 'Zeta.txt', 'Aamu.txt', 'Åke.txt', 'Äiti.txt'].sort(naturalCompare))
      .toEqual(['Aamu.txt', 'Zeta.txt', 'Åke.txt', 'Äiti.txt', 'Öljy.txt']);
  });

  test('nested numbers and letter case', () => {
    expect(['1-10 y.txt', '1-2 x.txt'].sort(naturalCompare)).toEqual(['1-2 x.txt', '1-10 y.txt']);
    expect(['luku10.md', 'luku2.md', 'Luku1.md'].sort(naturalCompare)).toEqual(['Luku1.md', 'luku2.md', 'luku10.md']);
  });

  test('composed and decomposed ä are the same name', () => {
    const composed = 'Äiti.txt';
    expect(decomposed(composed)).not.toBe(composed);
    expect(naturalCompare(decomposed(composed), composed)).toBe(0);
    expect(naturalCompare(composed, decomposed(composed))).toBe(0);
  });

  test('different zero padding has a stable order', () => {
    expect(['1 a.txt', '001 a.txt', '01 a.txt'].sort(naturalCompare)).toEqual(['001 a.txt', '01 a.txt', '1 a.txt']);
    expect(['01 a.txt', '1 a.txt', '001 a.txt'].sort(naturalCompare)).toEqual(['001 a.txt', '01 a.txt', '1 a.txt']);
    expect(naturalCompare('1 a.txt', '1 a.txt')).toBe(0);
  });

  test('names that differ only in letter case are equal in the Finnish order and then go by code unit', () => {
    expect(['luku.md', 'Luku.md'].sort(naturalCompare)).toEqual(['Luku.md', 'luku.md']);
    expect(['a 10.txt', 'A 2.txt', 'a 1.txt'].sort(naturalCompare)).toEqual(['a 1.txt', 'A 2.txt', 'a 10.txt']);
  });

  test('the order is the same from either side', () => {
    const names = ['10 Loppu [3].txt', 'Öljy.txt', '2 Äiti [11].txt', 'Zeta.txt', '01 a.txt', '1 a.txt', 'Åke.txt'];
    for (const a of names) {
      for (const b of names) {
        expect(Math.sign(naturalCompare(a, b)) + Math.sign(naturalCompare(b, a))).toBe(0);
        expect(naturalCompare(a, b) === 0).toBe(a === b);
      }
    }
  });
});

describe('fileStem', () => {
  test('drops the directory and the last extension only', () => {
    expect(fileStem('/polku/kansio/1 Alku [10].txt')).toBe('1 Alku [10]');
    expect(fileStem('C:\\kansio\\Luku.md')).toBe('Luku');
    expect(fileStem('Nimi.v2.txt')).toBe('Nimi.v2');
    expect(fileStem('Notes')).toBe('Notes');
  });

  test('a name that is only an extension is kept, and a decomposed name is composed', () => {
    expect(fileStem('.txt')).toBe('.txt');
    expect(fileStem(decomposed('Äiti.txt'))).toBe('Äiti');
    expect(fileStem(decomposed('Äiti.txt'))).toHaveLength(4);
    expect(fileStem('')).toBe('');
  });
});

describe('cleanImportTitle', () => {
  test.each([
    ['1 Alku [10].txt', 'Alku', '1 Alku'],
    ['10 Loppu [3].txt', 'Loppu', '10 Loppu'],
    ['02 - Äidin talo.md', 'Äidin talo', '02 - Äidin talo'],
    ['3. Yö.docx', 'Yö', '3. Yö'],
    ['4) Aamu.txt', 'Aamu', '4) Aamu'],
    ['5_Ilta.txt', 'Ilta', '5_Ilta'],
    ['6-Paluu.txt', 'Paluu', '6-Paluu'],
    ['7 – Viiva.txt', 'Viiva', '7 – Viiva'],
    ['9 ”Lainaus” – ja viiva [2].txt', '”Lainaus” – ja viiva', '9 ”Lainaus” – ja viiva'],
    ['1-2 Kohtaus [14].txt', 'Kohtaus', '1-2 Kohtaus'],
    ['  8   Väli  [9] .txt', 'Väli', '8 Väli'],
    ['/polku/kansio/11 Polku [1].txt', 'Polku', '11 Polku'],
    ['Luku [TODO: nimi] [7].txt', 'Luku [TODO: nimi]', 'Luku [TODO: nimi]'],
    ['Luku 7.txt', 'Luku 7', 'Luku 7'],
    ['1984.txt', '1984', '1984'],
    ['12 [3].txt', '12', '12'],
    ['2nd draft.txt', '2nd draft', '2nd draft'],
    ['3D-malli.txt', '3D-malli', '3D-malli'],
    ['Nimi.v2.txt', 'Nimi.v2', 'Nimi.v2'],
    ['[12].txt', 'Nimetön luku', 'Nimetön luku'],
    ['1. luku [4].txt', 'luku', '1. luku'],
    // A name that is only a number chain stays whole, like 1984
    ['1-2.txt', '1-2', '1-2'],
    ['1.5.txt', '1.5', '1.5'],
    ['17.11.2026.txt', '17.11.2026', '17.11.2026'],
    ['2026-11-17 [4].txt', '2026-11-17', '2026-11-17'],
    ['17.11.2026 Aamu.txt', 'Aamu', '17.11.2026 Aamu']
  ])('%j', (fileName, cleaned, withNumber) => {
    expect(cleanImportTitle(fileName)).toBe(cleaned);
    expect(cleanImportTitle(fileName, { stripNumber: false })).toBe(withNumber);
  });

  test('a decomposed name gives a composed title', () => {
    const title = cleanImportTitle(decomposed('Äiti [5].txt'));
    expect(title).toBe('Äiti');
    expect(title).toHaveLength(4);
  });

  test('a name with nothing in it is Nimetön luku', () => {
    expect(cleanImportTitle('')).toBe('Nimetön luku');
    expect(cleanImportTitle('   [3].md')).toBe('Nimetön luku');
    expect(cleanImportTitle(undefined)).toBe('Nimetön luku');
  });

  test('only a tag of digits is removed from the end: a note in brackets stays', () => {
    expect(cleanImportTitle('Luku [TODO: nimi].txt')).toBe('Luku [TODO: nimi]');
    expect(cleanImportTitle('3 Yö [luonnos].txt')).toBe('Yö [luonnos]');
    expect(cleanImportTitle('3 Yö [luonnos].txt', { stripNumber: false })).toBe('3 Yö [luonnos]');
    // One tag, the last one
    expect(cleanImportTitle('Yö [1] [22].txt')).toBe('Yö [1]');
  });

  test('a decimal order number and an em dash are removed too', () => {
    expect(cleanImportTitle('1.2 Kohtaus.txt')).toBe('Kohtaus');
    expect(cleanImportTitle('3 — Yö.txt')).toBe('Yö');
    expect(cleanImportTitle('12: Åke ja Öljy.md')).toBe('Åke ja Öljy');
  });
});

describe('pairSynopsisFiles', () => {
  test('pairs by the full name and by the name without the [n] tag', () => {
    const result = pairSynopsisFiles([
      '1 Alku [10].txt', '1 Alku [10].synopsis.txt', '2 Äiti [11].txt', '2 Äiti synopsis.txt', '3 Loppu [12].txt'
    ]);
    expect(result.chapters).toEqual(['1 Alku [10].txt', '2 Äiti [11].txt', '3 Loppu [12].txt']);
    expect(result.pairs).toEqual({
      '1 Alku [10].txt': '1 Alku [10].synopsis.txt',
      '2 Äiti [11].txt': '2 Äiti synopsis.txt'
    });
    expect(result.duplicates).toEqual([]);
  });

  test('a document called Synopsis with no partner is a chapter', () => {
    const result = pairSynopsisFiles(['12 Synopsis [44].txt', '1 Alku [10].txt']);
    expect(result.chapters).toEqual(['1 Alku [10].txt', '12 Synopsis [44].txt']);
    expect(result.pairs).toEqual({});
    expect(result.duplicates).toEqual([]);
  });

  test('Scrivener 2 style 10_synopsis.txt belongs to 10.md', () => {
    const result = pairSynopsisFiles(['10.md', '10_synopsis.txt', '11.md']);
    expect(result.chapters).toEqual(['10.md', '11.md']);
    expect(result.pairs).toEqual({ '10.md': '10_synopsis.txt' });
  });

  test('Finnish keyword, and a second synopsis file is reported, not imported', () => {
    const result = pairSynopsisFiles(['Alku.docx', 'Alku tiivistelmä.txt', 'Alku-synopsis.md']);
    expect(result.chapters).toEqual(['Alku.docx']);
    expect(result.pairs).toEqual({ 'Alku.docx': 'Alku tiivistelmä.txt' });
    expect(result.duplicates).toEqual(['Alku-synopsis.md']);
  });

  test('the tag may come after the keyword', () => {
    const result = pairSynopsisFiles(['1 Alku [10].txt', '1 Alku synopsis [10].txt']);
    expect(result.chapters).toEqual(['1 Alku [10].txt']);
    expect(result.pairs).toEqual({ '1 Alku [10].txt': '1 Alku synopsis [10].txt' });
  });

  test('a tag after the keyword picks the chapter with that tag among namesakes', () => {
    const result = pairSynopsisFiles(['1 Alku [10].txt', '1 Alku [11].txt', '1 Alku synopsis [11].txt']);
    expect(result.chapters).toEqual(['1 Alku [10].txt', '1 Alku [11].txt']);
    expect(result.pairs).toEqual({ '1 Alku [11].txt': '1 Alku synopsis [11].txt' });

    // Without a tag there is no telling which of the two is meant
    const unclear = pairSynopsisFiles(['1 Alku [10].txt', '1 Alku [11].txt', '1 Alku synopsis.txt']);
    expect(unclear.pairs).toEqual({});
    expect(unclear.chapters).toHaveLength(3);
  });

  test('the tags are ignored on both sides when no chapter has the full name', () => {
    expect(pairSynopsisFiles(['1 Alku.txt', '1 Alku [10].synopsis.txt']).pairs)
      .toEqual({ '1 Alku.txt': '1 Alku [10].synopsis.txt' });
    expect(pairSynopsisFiles(['1 Alku [7].txt', '1 Alku synopsis [10].txt']).pairs)
      .toEqual({ '1 Alku [7].txt': '1 Alku synopsis [10].txt' });
  });

  test('two chapters with the same stem: the synopsis file stays a chapter', () => {
    const result = pairSynopsisFiles(['Alku.txt', 'Alku.md', 'Alku synopsis.txt']);
    expect(result.chapters).toEqual(['Alku synopsis.txt', 'Alku.md', 'Alku.txt']);
    expect(result.pairs).toEqual({});
    expect(result.duplicates).toEqual([]);
  });

  test('case, parentheses and decomposed letters', () => {
    const names = ['1 Alku [10].txt', '1 Alku (synopsis).txt', decomposed('Äiti.txt'), decomposed('ÄITI.Synopsis.TXT')]
      .map(name => name.normalize('NFC'));
    const result = pairSynopsisFiles(names);
    expect(result.chapters).toEqual(['1 Alku [10].txt', 'Äiti.txt']);
    expect(result.pairs).toEqual({
      '1 Alku [10].txt': '1 Alku (synopsis).txt',
      'Äiti.txt': 'ÄITI.Synopsis.TXT'
    });
  });

  test('a .docx is never a synopsis file', () => {
    const result = pairSynopsisFiles(['Alku.txt', 'Alku synopsis.docx']);
    expect(result.chapters).toEqual(['Alku synopsis.docx', 'Alku.txt']);
    expect(result.pairs).toEqual({});
  });

  test('a bare synopsis.txt is a chapter', () => {
    const result = pairSynopsisFiles(['synopsis.txt', 'Alku.txt']);
    expect(result.chapters).toEqual(['Alku.txt', 'synopsis.txt']);
    expect(result.pairs).toEqual({});
  });

  test('the keyword needs a separator before it, and tiivistelma without dots counts', () => {
    expect(pairSynopsisFiles(['Alku.txt', 'Alkusynopsis.txt']).pairs).toEqual({});
    expect(pairSynopsisFiles(['Alku.txt', 'Alku_tiivistelma.md']).pairs).toEqual({ 'Alku.txt': 'Alku_tiivistelma.md' });
    expect(pairSynopsisFiles(['Alku.txt', 'Alku.TIIVISTELMÄ.markdown']).pairs)
      .toEqual({ 'Alku.txt': 'Alku.TIIVISTELMÄ.markdown' });
  });

  test('a decomposed keyword is still a synopsis file', () => {
    const synopsis = decomposed('Alku tiivistelmä.txt');
    expect(pairSynopsisFiles(['Alku.txt', synopsis]).pairs).toEqual({ 'Alku.txt': synopsis });
  });

  test('the short keyword synopsi pairs, and runs of spaces count as one', () => {
    expect(pairSynopsisFiles(['Alku.txt', 'Alku synopsi.txt']).pairs).toEqual({ 'Alku.txt': 'Alku synopsi.txt' });
    expect(pairSynopsisFiles(['1  Alku.txt', '1 Alku synopsis.txt']).pairs).toEqual({ '1  Alku.txt': '1 Alku synopsis.txt' });
  });

  test('nothing in, nothing out', () => {
    expect(pairSynopsisFiles([])).toEqual({ chapters: [], pairs: {}, duplicates: [] });
  });
});

describe('classifyEntries', () => {
  test('sorts every entry into its group', () => {
    const result = classifyEntries([
      file('2 Äiti [11].txt'),
      file('1 Alku [10].txt'),
      file('1 Alku [10].synopsis.txt'),
      file('._1 Alku [10].txt'),
      file('.DS_Store'),
      file('~$3 Yö.docx'),
      file('3 Yö.docx'),
      file('4 Vanha.rtf'),
      folder('5 Kuva.rtfd'),
      folder('Notes'),
      folder('Trashed Files'),
      file('kansi.png'),
      file('käsis.fdx'),
      { name: 'linkki.txt', isFile: false, isDirectory: false },
      file('LUKU.MD')
    ]);

    expect(result).toEqual({
      chapterFiles: ['1 Alku [10].txt', '2 Äiti [11].txt', '3 Yö.docx', 'LUKU.MD'],
      synopsisFor: { '1 Alku [10].txt': '1 Alku [10].synopsis.txt' },
      duplicateSynopses: [],
      rtfFiles: ['4 Vanha.rtf', '5 Kuva.rtfd'],
      subfolders: ['Notes', 'Trashed Files'],
      otherFiles: ['kansi.png', 'käsis.fdx', 'linkki.txt'],
      cloudPlaceholders: 0,
      scrivenerProject: false
    });
  });

  test('counts iCloud placeholders and notices a Scrivener project file', () => {
    const result = classifyEntries([file('.1 Alku [10].txt.icloud'), file('Kirja.scrivx')]);
    expect(result.cloudPlaceholders).toBe(1);
    expect(result.scrivenerProject).toBe(true);
    expect(result.chapterFiles).toEqual([]);
    expect(result.otherFiles).toEqual(['Kirja.scrivx']);
  });

  test('a visible name ending in .icloud is an ordinary other file, not a placeholder', () => {
    const result = classifyEntries([file('x.icloud')]);
    expect(result.cloudPlaceholders).toBe(0);
    expect(result.otherFiles).toEqual(['x.icloud']);
  });

  test('every group comes out in natural order, whatever order the folder was listed in', () => {
    const result = classifyEntries([
      file('10 Loppu.rtf'), file('2 Alku.rtf'), folder('9 Kuva.rtfd'),
      folder('Zeta'), folder('Äänet'), folder('Aamu'), folder('10 Liitteet'), folder('2 Liitteet'),
      file('kuva10.png'), file('kuva9.png'), file('Öljy.pdf'), file('aamu.pdf'),
      file('10 Loppu.txt'), file('2 Keski.md'), file('1 Alku.txt')
    ]);
    expect(result.rtfFiles).toEqual(['2 Alku.rtf', '9 Kuva.rtfd', '10 Loppu.rtf']);
    expect(result.subfolders).toEqual(['2 Liitteet', '10 Liitteet', 'Aamu', 'Zeta', 'Äänet']);
    expect(result.otherFiles).toEqual(['aamu.pdf', 'kuva9.png', 'kuva10.png', 'Öljy.pdf']);
    expect(result.chapterFiles).toEqual(['1 Alku.txt', '2 Keski.md', '10 Loppu.txt']);
  });

  test('decomposed names come out composed', () => {
    const result = classifyEntries([file(decomposed('2 Äiti [11].txt')), folder(decomposed('Äänet'))]);
    expect(result.chapterFiles).toEqual(['2 Äiti [11].txt']);
    expect(result.subfolders).toEqual(['Äänet']);
  });

  test('a hidden folder is ignored, and only a folder counts as an .rtfd package', () => {
    const result = classifyEntries([folder('.git'), folder('Kuva.RTFD'), file('outo.rtfd'), folder('Luku.txt')]);
    expect(result.subfolders).toEqual(['Luku.txt']);
    expect(result.rtfFiles).toEqual(['Kuva.RTFD']);
    expect(result.otherFiles).toEqual(['outo.rtfd']);
    expect(result.chapterFiles).toEqual([]);
  });

  test('reads the kind of an entry from a method too, as readdir gives it', () => {
    const result = classifyEntries([
      { name: 'Luku.txt', isFile: () => true, isDirectory: () => false },
      { name: 'Notes', isFile: () => false, isDirectory: () => true },
      { name: 'linkki.md', isFile: () => false, isDirectory: () => false }
    ]);
    expect(result.chapterFiles).toEqual(['Luku.txt']);
    expect(result.subfolders).toEqual(['Notes']);
    expect(result.otherFiles).toEqual(['linkki.md']);
  });

  test('an empty folder gives empty groups', () => {
    expect(classifyEntries([])).toEqual({
      chapterFiles: [], synopsisFor: {}, duplicateSynopses: [], rtfFiles: [], subfolders: [], otherFiles: [],
      cloudPlaceholders: 0, scrivenerProject: false
    });
  });
});

describe('readImportFolder', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'faust-import-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('reads a Scrivener-style folder in order with clean titles', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    const result = await readImportFolder(dir, {}, stubManuscript);

    expect(result.kind).toBe('folder');
    expect(result.path).toBe(dir);
    expect(result.name).toBe('Kirja');
    expect(result.author).toBe('');
    expect(result.chapters.map(chapter => chapter.title)).toEqual(['Alku', 'Äiti', 'Saapuminen', 'Osa II', 'Loppu']);
    expect(result.chapters.map(chapter => chapter.titleFrom)).toEqual(['file', 'file', 'heading', 'file', 'file']);
    expect(result.chapters[0].fileTitle).toBe('1 Alku');
    expect(result.chapters[0].cleanTitle).toBe('Alku');
    expect(result.chapters[1].title).toHaveLength(4);
    expect(result.chapters.map(chapter => chapter.sourceFile)).toEqual([
      '1 Alku [10].txt', '2 Äiti [11].txt', '3 Saapuminen [12].md', '4 Osa II [13].txt', '10 Loppu [3].txt'
    ]);
    expect(result.chapters.map(chapter => chapter.fileTitle)).toEqual(['1 Alku', '2 Äiti', '3 Saapuminen', '4 Osa II', '10 Loppu']);
    expect(result.chapters.map(chapter => chapter.encoding)).toEqual(['utf-8', 'utf-8', 'utf-8', 'utf-8', 'utf-8']);
  });

  realTest('reads a Scrivener-style folder in order with clean titles: titleFrom with the real manuscript module', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    const result = await readImportFolder(dir);

    expect(result.chapters.map(chapter => chapter.title)).toEqual(['Alku', 'Äiti', 'Saapuminen', 'Osa II', 'Loppu']);
    expect(result.chapters.map(chapter => chapter.titleFrom)).toEqual(['file', 'file', 'heading', 'file', 'file']);
    expect(result.report.failed).toEqual([]);
  });

  realTest('a chapter file with scene headings stays one chapter', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    const result = await readImportFolder(dir);

    expect(result.chapters).toHaveLength(5);
    expect(result.chapters[2].content).toBe('Teksti.\n\n# Laiturilla\nA\n\n# Talossa\nB');
  });

  test('protected text comes through unchanged', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    const { content } = (await readImportFolder(dir, {}, stubManuscript)).chapters[0];

    expect(content).toContain('– Tule, sanoi Aino.');
    expect(content).toContain('- Hei, sanoi Pekka.');
    expect(content).toContain('[TODO: tarkista lautan aikataulu]');
    expect(content).toContain('<u>juoksi</u> ”kotiin” – ja jäi.');
  });

  test('reads a synopsis file next to its chapter and does not import it as a chapter', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    const result = await readImportFolder(dir, {}, stubManuscript);

    expect(result.chapters).toHaveLength(5);
    expect(result.chapters[0].synopsis).toBe('Aino saapuu saarelle.');
    expect(result.chapters[0].synopsisFile).toBe('1 Alku [10].synopsis.txt');
    for (const chapter of result.chapters.slice(1)) {
      expect(chapter.synopsis).toBe('');
      expect(chapter.synopsisFile).toBeNull();
    }
  });

  test('reports RTF files, sub-folders and other files without reading them', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    const result = await readImportFolder(dir, {}, stubManuscript);

    expect(result.report).toEqual({
      subfolders: ['Notes'],
      rtfFiles: ['5 Vanha [14].rtf'],
      otherFiles: ['kansi.png'],
      cloudPlaceholders: 0,
      scrivenerProject: false,
      duplicateSynopses: [],
      failed: []
    });
    expect(JSON.stringify(result)).not.toContain('EI SAA NÄKYÄ');
  });

  test('an empty file is a chapter with no text', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    const result = await readImportFolder(dir, {}, stubManuscript);

    expect(result.chapters[3].sourceFile).toBe('4 Osa II [13].txt');
    expect(result.chapters[3].content).toBe('');
    expect(result.chapters[3].title).toBe('Osa II');
  });

  test('a file that cannot be read is reported and the rest are imported', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    fs.writeFileSync(path.join(dir, '6 Rikki.docx'), Buffer.from('ei zip'));
    const result = await readImportFolder(dir, {}, stubManuscript);

    expect(result.report.failed).toEqual([{ name: '6 Rikki.docx', error: 'Tiedostoa ei voitu lukea' }]);
    expect(result.chapters).toHaveLength(5);
    expect(result.chapters.map(chapter => chapter.sourceFile)).not.toContain('6 Rikki.docx');
  });

  realTest('guesses Windows-1252 and says so', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    fs.writeFileSync(path.join(dir, '7 Vanha.txt'), Buffer.from([0xc4, 0x69, 0x74, 0x69, 0x20, 0x96, 0x20, 0xf6]));
    const result = await readImportFolder(dir);

    const guessed = result.chapters.find(chapter => chapter.sourceFile === '7 Vanha.txt');
    expect(guessed.content).toBe('Äiti – ö');
    expect(guessed.encoding).toBe('windows-1252');
    expect(result.chapters[0].encoding).toBe('utf-8');
  });

  test('uses the parent folder name as the book title when the folder is called Draft', async () => {
    const book = path.join(root, 'Saaren kirja');
    const draft = writeFixture(path.join(book, 'Draft'));

    const fromDraft = await readImportFolder(draft, {}, stubManuscript);
    expect(fromDraft.name).toBe('Draft');
    expect(fromDraft.title).toBe('Saaren kirja');

    const fromBook = await readImportFolder(book, {}, stubManuscript);
    expect(fromBook.name).toBe('Saaren kirja');
    expect(fromBook.title).toBe('Saaren kirja');
  });

  test('refuses a folder with more importable files than maxFiles', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    await expect(readImportFolder(dir, { maxFiles: 3 }, stubManuscript)).rejects.toThrow('tuotavaa tiedostoa');
    await expect(readImportFolder(dir, { maxFiles: 3 }, stubManuscript)).rejects.toThrow(
      'Kansiossa on yli 3 tuotavaa tiedostoa. Valitse kansio, jossa on vain käsikirjoituksen luvut.'
    );
  });

  test('Infinity as maxFiles means no limit, not the default', async () => {
    const dir = path.join(root, 'Iso');
    fs.mkdirSync(dir);
    for (let i = 1; i <= 1001; i++) fs.writeFileSync(path.join(dir, `${i}.txt`), 'sana');
    await expect(readImportFolder(dir, {}, stubManuscript)).rejects.toThrow('tuotavaa tiedostoa');
    const result = await readImportFolder(dir, { maxFiles: Infinity, maxFileBytes: Infinity }, stubManuscript);
    expect(result.chapters).toHaveLength(1001);
    expect(result.report.failed).toEqual([]);
  });

  test('skips a file over maxFileBytes and reports it', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    const result = await readImportFolder(dir, { maxFileBytes: 20 }, stubManuscript);

    // The first file and the .md file are longer than 20 bytes
    expect(result.report.failed).toEqual([
      { name: '1 Alku [10].txt', error: 'Tiedosto on liian suuri (yli 20 Mt).' },
      { name: '3 Saapuminen [12].md', error: 'Tiedosto on liian suuri (yli 20 Mt).' }
    ]);
    expect(result.report.failed[0].error).toContain('liian suuri');
    expect(result.chapters.map(chapter => chapter.sourceFile)).toEqual(['2 Äiti [11].txt', '4 Osa II [13].txt', '10 Loppu [3].txt']);
  });

  test('a file of exactly maxFileBytes is still read', async () => {
    const dir = path.join(root, 'Kirja');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '1 Tasan.txt'), 'x'.repeat(20));
    fs.writeFileSync(path.join(dir, '2 Yli.txt'), 'x'.repeat(21));
    const result = await readImportFolder(dir, { maxFileBytes: 20 }, stubManuscript);

    expect(result.chapters.map(chapter => chapter.sourceFile)).toEqual(['1 Tasan.txt']);
    expect(result.report.failed).toEqual([{ name: '2 Yli.txt', error: 'Tiedosto on liian suuri (yli 20 Mt).' }]);
  });

  test('a folder that does not exist is a Finnish error', async () => {
    await expect(readImportFolder(path.join(root, 'Puuttuu'), {}, stubManuscript)).rejects.toThrow('Kansiota ei voitu lukea');
    await expect(readImportFolder(path.join(root, 'Puuttuu'), {}, stubManuscript)).rejects.toThrow(/^Kansiota ei voitu lukea: .*ENOENT/);
  });

  test('resolveSubfolder finds a direct child folder and refuses everything else', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    fs.mkdirSync(path.join(dir, '.piilo'));
    fs.mkdirSync(path.join(dir, decomposed('Äänet')));

    expect(await resolveSubfolder(dir, 'Notes')).toBe(path.join(dir, 'Notes'));
    for (const name of ['..', 'Notes/..', 'Puuttuu', '1 Alku [10].txt', '.piilo']) {
      expect(await resolveSubfolder(dir, name)).toBeNull();
    }

    // Found by its composed name; the path uses the name the file system gave
    const found = await resolveSubfolder(dir, 'Äänet');
    expect(found).not.toBeNull();
    expect(path.dirname(found)).toBe(dir);
    expect(path.basename(found).normalize('NFC')).toBe('Äänet');
    expect(fs.readdirSync(dir)).toContain(path.basename(found));
    expect(fs.statSync(found).isDirectory()).toBe(true);
  });

  test('never writes: names and modification times are the same after the read', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    fs.writeFileSync(path.join(dir, '6 Rikki.docx'), Buffer.from('ei zip'));
    const before = listTree(dir);

    await readImportFolder(dir, {}, stubManuscript);
    await readImportFolder(dir, { maxFileBytes: 20 }, stubManuscript);
    await resolveSubfolder(dir, 'Notes');

    expect(before.length).toBeGreaterThan(12);
    expect(listTree(dir)).toEqual(before);
  });

  test('the module contains no write calls', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../utils/importFolder.js'), 'utf-8');
    expect(source).not.toMatch(/\b(writeFile|appendFile|unlink|rename|rm|rmdir|mkdir|copyFile|truncate|utimes|chmod|createWriteStream)\b/);
  });

  test('the module uses only readdir, stat and readFile of fs, and never requires electron', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../utils/importFolder.js'), 'utf-8');
    const fsCalls = [...source.matchAll(/\bfs\.(\w+)/g)].map(match => match[1]);
    expect([...new Set(fsCalls)].sort()).toEqual(['readFile', 'readdir', 'stat']);

    const required = [...source.matchAll(/require\('([^']+)'\)/g)].map(match => match[1]);
    expect([...new Set(required)].sort()).toEqual(['./manuscript', 'fs', 'path']);
    // The conversion module is required inside the function, not when this module loads
    expect(source).not.toMatch(/^const .*require\('\.\/manuscript'\)/m);
  });

  test('passes the composed file name and oneChapterPerFile to importDocument', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    const importDocument = jest.fn(stubManuscript.importDocument);
    await readImportFolder(dir, {}, { importDocument, decodeText: stubManuscript.decodeText });

    expect(importDocument.mock.calls.map(call => call[1])).toEqual([
      '1 Alku [10].txt', '2 Äiti [11].txt', '3 Saapuminen [12].md', '4 Osa II [13].txt', '10 Loppu [3].txt'
    ]);
    for (const call of importDocument.mock.calls) {
      expect(Buffer.isBuffer(call[0])).toBe(true);
      expect(call[2]).toEqual({ oneChapterPerFile: true });
    }
  });

  test('every path that is read is built from the name the file system returned', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    const returned = fs.readdirSync(dir).map(name => path.join(dir, name));
    const stat = jest.spyOn(fs.promises, 'stat');
    const readFile = jest.spyOn(fs.promises, 'readFile');

    const result = await readImportFolder(dir, {}, stubManuscript);

    const touched = [...stat.mock.calls, ...readFile.mock.calls].map(call => call[0]);
    // Five chapters and one synopsis, each checked for size and then read
    expect(touched).toHaveLength(12);
    for (const filePath of touched) expect(returned).toContain(filePath);
    expect(result.chapters[1].sourceFile).toBe('2 Äiti [11].txt');
    expect(touched.some(filePath => filePath.includes('Notes'))).toBe(false);
  });

  test('a Word title wins over the file name, and a file without an encoding reports none', async () => {
    const dir = path.join(root, 'Kirja');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '3 Yö [5].docx'), 'PK');
    const deps = {
      decodeText: stubManuscript.decodeText,
      importDocument: async () => ({
        title: 'Yön ääni', author: '', chapters: [{ title: decomposed('Yön ääni'), content: 'Teksti.', titleFrom: 'document' }]
      })
    };
    const [chapter] = (await readImportFolder(dir, {}, deps)).chapters;

    expect(chapter).toEqual({
      title: 'Yön ääni',
      titleFrom: 'document',
      fileTitle: '3 Yö',
      cleanTitle: 'Yö',
      content: 'Teksti.',
      sourceFile: '3 Yö [5].docx',
      synopsis: '',
      synopsisFile: null
    });
    expect('encoding' in chapter).toBe(false);
  });

  test('a file whose own title is empty is named after the file', async () => {
    const dir = path.join(root, 'Kirja');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '2 Talo.md'), 'x');
    const deps = {
      decodeText: stubManuscript.decodeText,
      importDocument: async () => ({ chapters: [{ title: '   ', content: 'x', titleFrom: 'heading' }], encoding: 'utf-8' })
    };
    const [chapter] = (await readImportFolder(dir, {}, deps)).chapters;

    expect(chapter.title).toBe('Talo');
    expect(chapter.titleFrom).toBe('file');
  });

  test('tidies a synopsis without shortening it: BOM, CRLF, blank lines and decomposed letters', async () => {
    const dir = path.join(root, 'Kirja');
    fs.mkdirSync(dir);
    const long = 'Pitkä tiivistelmä – ”lainaus” ja [TODO: tarkista]. '.repeat(400).trim();
    fs.writeFileSync(path.join(dir, 'Alku.txt'), 'Teksti.');
    fs.writeFileSync(path.join(dir, 'Alku synopsis.txt'), `${BOM}\r\n${decomposed('Äiti saapuu.')}\r\n\r\n\r\n\r\nToinen kappale.\r${long}\r\n\r\n`);
    const [chapter] = (await readImportFolder(dir, {}, stubManuscript)).chapters;

    expect(chapter.synopsis).toBe(`Äiti saapuu.\n\nToinen kappale.\n${long}`);
    expect(chapter.synopsis.length).toBeGreaterThan(20000);
    expect(chapter.synopsisFile).toBe('Alku synopsis.txt');
    expect(chapter.content).toBe('Teksti.');
  });

  test('an empty synopsis file gives an empty synopsis and still names the file', async () => {
    const dir = path.join(root, 'Kirja');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'Alku.txt'), 'Teksti.');
    fs.writeFileSync(path.join(dir, 'Alku.synopsis.txt'), ' \n\n');
    const result = await readImportFolder(dir, {}, stubManuscript);

    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].synopsis).toBe('');
    expect(result.chapters[0].synopsisFile).toBe('Alku.synopsis.txt');
    expect(result.report.failed).toEqual([]);
  });

  test('a synopsis that cannot be read is reported under its own name and the chapter is still imported', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    const deps = {
      importDocument: stubManuscript.importDocument,
      decodeText: () => { throw new Error('Merkistöä ei tunnistettu'); }
    };
    const result = await readImportFolder(dir, {}, deps);

    expect(result.report.failed).toEqual([{ name: '1 Alku [10].synopsis.txt', error: 'Merkistöä ei tunnistettu' }]);
    expect(result.chapters).toHaveLength(5);
    expect(result.chapters[0].title).toBe('Alku');
    expect(result.chapters[0].synopsis).toBe('');
    expect(result.chapters[0].synopsisFile).toBeNull();
  });

  test('a synopsis file over maxFileBytes is reported, not read', async () => {
    const dir = path.join(root, 'Kirja');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'Alku.txt'), 'Teksti.');
    fs.writeFileSync(path.join(dir, 'Alku synopsis.txt'), 'x'.repeat(200));
    const readFile = jest.spyOn(fs.promises, 'readFile');
    const result = await readImportFolder(dir, { maxFileBytes: 50 }, stubManuscript);

    expect(result.report.failed).toEqual([{ name: 'Alku synopsis.txt', error: 'Tiedosto on liian suuri (yli 20 Mt).' }]);
    expect(result.chapters.map(chapter => [chapter.title, chapter.synopsis, chapter.synopsisFile])).toEqual([['Alku', '', null]]);
    expect(readFile.mock.calls.map(call => path.basename(call[0]))).toEqual(['Alku.txt']);
  });

  test('a second synopsis file for the same chapter is reported and not imported', async () => {
    const dir = path.join(root, 'Kirja');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'Alku.txt'), 'Teksti.');
    fs.writeFileSync(path.join(dir, 'Alku tiivistelmä.txt'), 'Ensimmäinen.');
    fs.writeFileSync(path.join(dir, 'Alku-synopsis.md'), 'Toinen.');
    const result = await readImportFolder(dir, {}, stubManuscript);

    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].synopsis).toBe('Ensimmäinen.');
    expect(result.chapters[0].synopsisFile).toBe('Alku tiivistelmä.txt');
    expect(result.report.duplicateSynopses).toEqual(['Alku-synopsis.md']);
    expect(JSON.stringify(result)).not.toContain('Toinen.');
  });

  test('counts iCloud placeholders and knows a Scrivener project by its file or its folder name', async () => {
    const plain = path.join(root, 'Kirja');
    fs.mkdirSync(plain);
    fs.writeFileSync(path.join(plain, '.1 Alku [10].txt.icloud'), 'x');
    fs.writeFileSync(path.join(plain, '.2 Loppu [11].txt.icloud'), 'x');
    fs.writeFileSync(path.join(plain, 'Kirja.scrivx'), '<x/>');
    const withFile = await readImportFolder(plain, {}, stubManuscript);
    expect(withFile.report.cloudPlaceholders).toBe(2);
    expect(withFile.report.scrivenerProject).toBe(true);
    expect(withFile.report.otherFiles).toEqual(['Kirja.scrivx']);
    expect(withFile.chapters).toEqual([]);

    const scriv = path.join(root, 'Saari.SCRIV');
    fs.mkdirSync(scriv);
    expect((await readImportFolder(scriv, {}, stubManuscript)).report.scrivenerProject).toBe(true);

    const other = path.join(root, 'Muu');
    fs.mkdirSync(other);
    expect((await readImportFolder(other, {}, stubManuscript)).report.scrivenerProject).toBe(false);
  });

  test('a symbolic link is listed and never followed', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    fs.symlinkSync(path.join(dir, 'Notes', 'muistio.txt'), path.join(dir, 'linkki.txt'));
    fs.symlinkSync(path.join(dir, 'Notes'), path.join(dir, 'Linkkikansio'));
    const result = await readImportFolder(dir, {}, stubManuscript);

    // Both links are "other files": a full stop sorts before a letter
    expect(result.report.otherFiles).toEqual(['kansi.png', 'linkki.txt', 'Linkkikansio']);
    expect(result.report.subfolders).toEqual(['Notes']);
    expect(result.chapters).toHaveLength(5);
    expect(JSON.stringify(result)).not.toContain('EI SAA NÄKYÄ');
    expect(await resolveSubfolder(dir, 'Linkkikansio')).toBeNull();
  });

  test('the title of a Draft folder: any letter case, a trailing slash and a decomposed parent name', async () => {
    const book = path.join(root, decomposed('Äidin kirja'));
    const draft = path.join(book, 'DRAFT');
    fs.mkdirSync(draft, { recursive: true });

    const result = await readImportFolder(draft + path.sep, {}, stubManuscript);
    expect(result.name).toBe('DRAFT');
    expect(result.title).toBe('Äidin kirja');
    expect(result.title).toHaveLength(11);
    expect(result.path).toBe(draft + path.sep);
    expect(result.chapters).toEqual([]);

    // The folder's own name is composed too, while the path stays as it was given
    const own = await readImportFolder(book, {}, stubManuscript);
    expect(own.name).toBe('Äidin kirja');
    expect(own.name).toHaveLength(11);
    expect(own.title).toBe('Äidin kirja');
    expect(own.path).toBe(book);
    expect(own.report.subfolders).toEqual(['DRAFT']);
  });

  test('the limit counts chapter files only, and exactly maxFiles is allowed', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    const result = await readImportFolder(dir, { maxFiles: 5 }, stubManuscript);
    expect(result.chapters).toHaveLength(5);
    await expect(readImportFolder(dir, { maxFiles: 4 }, stubManuscript)).rejects.toThrow('yli 4 tuotavaa tiedostoa');
  });

  test('the default limit is 1 000 files, written with a no-break space, and nothing is read past it', async () => {
    const listing = Array.from({ length: 1001 }, (_item, index) => ({
      name: `${index + 1} Luku.txt`, isFile: () => true, isDirectory: () => false
    }));
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue(listing);
    const stat = jest.spyOn(fs.promises, 'stat');
    const readFile = jest.spyOn(fs.promises, 'readFile');

    await expect(readImportFolder(path.join(root, 'Iso'), {}, stubManuscript)).rejects.toThrow(
      `Kansiossa on yli 1${NBSP}000 tuotavaa tiedostoa. Valitse kansio, jossa on vain käsikirjoituksen luvut.`
    );
    expect(stat).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  test('two files whose names differ only in composition are both read, each from its own path', async () => {
    const composed = '1 Äiti.txt';
    const listing = [composed, decomposed(composed)].map(name => ({ name, isFile: () => true, isDirectory: () => false }));
    jest.spyOn(fs.promises, 'readdir').mockResolvedValue(listing);
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({ size: 5 });
    const readFile = jest.spyOn(fs.promises, 'readFile').mockImplementation(async (filePath) => (
      Buffer.from(path.basename(filePath) === composed ? 'koottu' : 'hajotettu')
    ));

    const result = await readImportFolder(path.join(root, 'Kirja'), {}, stubManuscript);

    expect(readFile.mock.calls.map(call => path.basename(call[0]))).toEqual([composed, decomposed(composed)]);
    expect(result.chapters.map(chapter => chapter.content)).toEqual(['koottu', 'hajotettu']);
    expect(result.chapters.map(chapter => chapter.sourceFile)).toEqual([composed, composed]);
  });

  test('an empty folder gives no chapters and an empty report', async () => {
    const dir = path.join(root, 'Tyhjä');
    fs.mkdirSync(dir);
    expect(await readImportFolder(dir, {}, stubManuscript)).toEqual({
      kind: 'folder',
      path: dir,
      name: 'Tyhjä',
      title: 'Tyhjä',
      author: '',
      chapters: [],
      report: {
        subfolders: [], rtfFiles: [], otherFiles: [], cloudPlaceholders: 0, scrivenerProject: false,
        duplicateSynopses: [], failed: []
      }
    });
  });

  test('without deps the two functions come from utils/manuscript.js', async () => {
    const dir = path.join(root, 'Tyhjä');
    fs.mkdirSync(dir);
    const result = await readImportFolder(dir);
    expect(result.chapters).toEqual([]);
    expect(result.report.failed).toEqual([]);

    // A plain text file with Windows line ends goes through the real importDocument
    fs.writeFileSync(path.join(dir, '1 Alku.txt'), 'Äiti tuli – ja jäi.\r\n\r\n[TODO: tarkista] Hän <u>jäi</u> ”kotiin”.\r\n');
    const withFile = await readImportFolder(dir);
    expect(withFile.report.failed).toEqual([]);
    expect(withFile.chapters.map(chapter => [chapter.title, chapter.content])).toEqual([
      ['Alku', 'Äiti tuli – ja jäi.\n\n[TODO: tarkista] Hän <u>jäi</u> ”kotiin”.']
    ]);
  });

  test('resolveSubfolder refuses a package, a link, an empty name and a folder that cannot be listed', async () => {
    const dir = writeFixture(path.join(root, 'Kirja'));
    fs.mkdirSync(path.join(dir, 'Kuva.rtfd'));

    expect(await resolveSubfolder(dir, 'Kuva.rtfd')).toBeNull();
    expect(await resolveSubfolder(dir, '')).toBeNull();
    expect(await resolveSubfolder(dir, '.')).toBeNull();
    expect(await resolveSubfolder(dir, undefined)).toBeNull();
    expect(await resolveSubfolder(dir, path.join(dir, 'Notes'))).toBeNull();
    expect(await resolveSubfolder(dir, 'notes')).toBeNull();
    expect(await resolveSubfolder(path.join(root, 'Puuttuu'), 'Notes')).toBeNull();
  });
});

describe('loading utils/manuscript.js', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'faust-import-'));
  });

  afterEach(() => {
    jest.dontMock('../../utils/manuscript');
    jest.resetModules();
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('it is loaded only when a function is missing from deps, never when the module loads', async () => {
    let loads = 0;
    let isolated;
    jest.isolateModules(() => {
      jest.doMock('../../utils/manuscript', () => {
        loads += 1;
        return stubManuscript;
      });
      isolated = require('../../utils/importFolder');
    });
    expect(loads).toBe(0);

    fs.writeFileSync(path.join(root, '1 Alku.txt'), 'Teksti.');
    await isolated.readImportFolder(root, {}, stubManuscript);
    expect(loads).toBe(0);

    const result = await isolated.readImportFolder(root);
    expect(loads).toBe(1);
    expect(result.chapters.map(chapter => chapter.content)).toEqual(['Teksti.']);
  });
});

/**
 * Folder import
 *
 * Reads the .txt, .md and .docx files of one folder as chapters, one chapter
 * per file, in number-aware order. The typical source is the folder that
 * Scrivener's "Sync with External Folder" writes: "1 Alku [10].txt",
 * "2 Äiti [11].txt", sometimes with a synopsis file next to a chapter.
 * Sub-folders, RTF files and everything else are listed in a report and
 * never opened.
 *
 * Read only: the only file-system calls in this module are readdir, stat and
 * readFile. Pure Node code with no Electron dependency, so it is unit-tested
 * directly (test/utils/importFolder.test.js).
 */

const fs = require('fs').promises;
const path = require('path');

// .markdown is accepted next to .md because the single-file dialog accepts it
const CHAPTER_EXTENSIONS = ['txt', 'md', 'markdown', 'docx'];

// A synopsis file is plain text; a .docx next to a chapter is another chapter
const SYNOPSIS_EXTENSIONS = ['txt', 'md', 'markdown'];

const UNTITLED = 'Nimetön luku';
const TOO_LARGE = 'Tiedosto on liian suuri (yli 20 Mt).';

const DEFAULT_MAX_FILES = 1000;
const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;

// Scrivener's sync ends each file name with the document id: "1 Alku [10]".
// Only digits count, so a note like [TODO: nimi] in a name stays.
const ID_TAG = /\s*\[\d+\]\s*$/;

// A leading order number: "1 ", "02 - ", "3. ", "4) ", "5_", "1-2 ". A number
// glued to letters ("2nd draft") or a name that is only a number ("1984") is
// not one, because something must follow the separator.
const ORDER_NUMBER = /^\s*\d+(?:[.-]\d+)*(?:\s*[.)\-_:–—]+\s*|\s+)(?=\S)/;

const NUMBER_CHAIN = /^\d+(?:[.-]\d+)*$/;

// "<chapter name> synopsis", "<name>.synopsis", "<name>_tiivistelmä", "<name> (synopsis)"
const SYNOPSIS_NAME = /^(.*\S)\s*[ ._-]\s*\(?(?:synopsis|synopsi|tiivistelmä|tiivistelma)\)?$/i;

// A file that iCloud has not downloaded is a hidden placeholder: ".name.txt.icloud"
const CLOUD_PLACEHOLDER = /^\..+\.icloud$/i;

// macOS stores decomposed names on some volumes: "ä" as "a" + a combining mark
const nfc = (value) => String(value === null || value === undefined ? '' : value).normalize('NFC');

const extensionOf = (name) => ((/\.([^.\\/]+)$/.exec(name) || [])[1] || '').toLowerCase();

// For comparing names: composed, lower case, single spaces
const fold = (value) => nfc(value).toLocaleLowerCase('fi').replace(/\s+/g, ' ').trim();

// Same result as a.localeCompare(b, 'fi', options), without a new collator for every pair
const finnishOrder = new Intl.Collator('fi', { numeric: true, sensitivity: 'base' });

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/**
 * Order of file names as a person reads them: 2 before 10, and å ä ö after z.
 * Names that the Finnish order holds equal ("001 a", "01 a", "1 a") are told
 * apart by code unit, so the order is total and stable.
 */
function naturalCompare(a, b) {
  const x = nfc(a);
  const y = nfc(b);
  const byLocale = finnishOrder.compare(x, y);
  if (byLocale !== 0) return byLocale;
  return x < y ? -1 : x > y ? 1 : 0;
}

/** File name without its directory and last extension, composed. */
function fileStem(fileName) {
  const base = nfc(fileName).replace(/^.*[\\/]/, '');
  return base.replace(/\.[^.]+$/, '') || base;
}

/**
 * A chapter title from a file name: "02 - Äidin talo [11].md" → "Äidin talo".
 * @param {string} fileName
 * @param {{ stripNumber?: boolean }} [options] - false keeps the order number
 */
function cleanImportTitle(fileName, { stripNumber = true } = {}) {
  let title = fileStem(fileName).replace(ID_TAG, '').replace(/\s+/g, ' ').trim();
  // A name that is only a number chain ("1984", "1-2", "17.11.2026") stays whole:
  // the regex would otherwise take its last group as the title
  if (stripNumber && !NUMBER_CHAIN.test(title)) {
    const rest = title.replace(ORDER_NUMBER, '').trim();
    if (rest) title = rest;
  }
  return title || UNTITLED;
}

// The chapter name a synopsis file points at, or null when the file is not
// named like a synopsis file. "1 Alku synopsis [10].txt" → "1 Alku [10]".
function synopsisBase(fileName) {
  if (!SYNOPSIS_EXTENSIONS.includes(extensionOf(fileName))) return null;
  const stem = fileStem(fileName);

  const direct = SYNOPSIS_NAME.exec(stem);
  if (direct) return direct[1];

  // The id tag may come after the keyword
  const tag = ID_TAG.exec(stem);
  if (tag) {
    const inner = SYNOPSIS_NAME.exec(stem.replace(ID_TAG, ''));
    if (inner) return inner[1] + tag[0].trimEnd();
  }
  return null;
}

/**
 * Find the synopsis files among the importable files of a folder.
 *
 * A file named like a synopsis belongs to the one chapter file with the same
 * name, or, failing that, to the one chapter file with the same name when the
 * [n] tags are ignored. Without such a chapter it is an ordinary chapter (a
 * document really called "Synopsis" is imported). A second synopsis for the
 * same chapter is reported and not imported.
 *
 * @param {string[]} fileNames - composed names of files with a chapter extension
 * @returns {{ chapters: string[], pairs: Object<string, string>, duplicates: string[] }}
 */
function pairSynopsisFiles(fileNames) {
  const sorted = [...(fileNames || [])].sort(naturalCompare);
  const candidates = sorted.filter(name => synopsisBase(name) !== null);
  const plain = sorted.filter(name => synopsisBase(name) === null);

  // The chapter files by folded name, with and without the [n] tag, so a
  // folder of a thousand files is not compared pair by pair
  const byName = new Map();
  const byLooseName = new Map();
  const index = (map, key, name) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(name);
  };
  for (const name of plain) {
    const stem = fileStem(name);
    index(byName, fold(stem), name);
    index(byLooseName, fold(stem.replace(ID_TAG, '')), name);
  }

  const pairs = {};
  const duplicates = [];
  const unmatched = [];

  for (const candidate of candidates) {
    const base = synopsisBase(candidate);
    const exact = byName.get(fold(base)) || [];
    const loose = byLooseName.get(fold(base.replace(ID_TAG, ''))) || [];

    let match = null;
    if (exact.length === 1) match = exact[0];
    else if (exact.length === 0 && loose.length === 1) match = loose[0];

    if (match === null) unmatched.push(candidate);
    else if (Object.prototype.hasOwnProperty.call(pairs, match)) duplicates.push(candidate);
    else pairs[match] = candidate;
  }

  return { chapters: [...plain, ...unmatched].sort(naturalCompare), pairs, duplicates };
}

// ---------------------------------------------------------------------------
// Folder contents
// ---------------------------------------------------------------------------

// A directory entry may carry its kind as a boolean or, like the entries of readdir, as a method
const entryIs = (entry, key) => (typeof entry[key] === 'function' ? !!entry[key]() : entry[key] === true);

/**
 * Sort the entries of a folder into what is imported and what is reported.
 *
 * @param {Array<{ name: string, isFile: boolean, isDirectory: boolean }>} entries
 * @returns {{
 *   chapterFiles: string[], synopsisFor: Object<string, string>, duplicateSynopses: string[],
 *   rtfFiles: string[], subfolders: string[], otherFiles: string[],
 *   cloudPlaceholders: number, scrivenerProject: boolean
 * }} names are composed and in natural order; synopsis files are not among the chapter files
 */
function classifyEntries(entries) {
  const result = {
    chapterFiles: [],
    synopsisFor: {},
    duplicateSynopses: [],
    rtfFiles: [],
    subfolders: [],
    otherFiles: [],
    cloudPlaceholders: 0,
    scrivenerProject: false
  };
  const importable = [];

  for (const entry of entries || []) {
    if (!entry || typeof entry.name !== 'string' || entry.name === '') continue;
    const name = nfc(entry.name);
    const extension = extensionOf(name);

    if (CLOUD_PLACEHOLDER.test(name)) {
      result.cloudPlaceholders += 1;
    } else if (name.startsWith('.') || name.startsWith('~$')) {
      // Hidden files, .DS_Store, the ._name files macOS writes on external
      // volumes, and Word's lock files
    } else if (entryIs(entry, 'isDirectory')) {
      if (extension === 'rtfd') result.rtfFiles.push(name);
      else result.subfolders.push(name);
    } else if (!entryIs(entry, 'isFile')) {
      // A symbolic link or another special entry: listed, never followed
      result.otherFiles.push(name);
    } else if (extension === 'rtf') {
      result.rtfFiles.push(name);
    } else if (CHAPTER_EXTENSIONS.includes(extension)) {
      importable.push(name);
    } else {
      result.otherFiles.push(name);
      if (extension === 'scrivx') result.scrivenerProject = true;
    }
  }

  const paired = pairSynopsisFiles(importable);
  result.chapterFiles = paired.chapters;
  result.synopsisFor = paired.pairs;
  result.duplicateSynopses = paired.duplicates;
  result.rtfFiles.sort(naturalCompare);
  result.subfolders.sort(naturalCompare);
  result.otherFiles.sort(naturalCompare);
  return result;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// Infinity is a usable limit ("no limit"); only a value that is no number falls back
const atLeastZero = (value, fallback) => (typeof value === 'number' && value >= 0 ? value : fallback);

// "1 000": a no-break space between groups of three digits. The same rule as
// formatCount of src/services/format.fi.js, which the packaged main process cannot load.
const groupThousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, String.fromCharCode(0xa0));

// Menu spec B.12: a reason is a Finnish sentence, never Node's or a library's English text
// ("ENOENT: no such file or directory, scandir '/…'", JSZip's "Corrupted zip ?"). A system error
// is told by its code; the sentences of this module and of utils/manuscript.js all begin with
// "Tiedosto" and pass as they are.
const FOLDER_REASONS = {
  missing: 'Kansiota ei löytynyt.',
  denied: 'Kansioon ei ole lukuoikeutta.',
  other: 'Kansiota ei voitu lukea.'
};
const FILE_REASONS = {
  missing: 'Tiedostoa ei löytynyt.',
  denied: 'Tiedostoon ei ole lukuoikeutta.',
  other: 'Tiedostoa ei voitu lukea.',
  notWord: 'Tiedosto ei ole kelvollinen Word-asiakirja.'
};
const OWN_REASON = /^Tiedosto/;

const codeOf = (error) => (error && typeof error.code === 'string' ? error.code : '');

function systemReason(code, reasons) {
  if (code === 'ENOENT' || code === 'ENOTDIR') return reasons.missing;
  if (code === 'EACCES' || code === 'EPERM') return reasons.denied;
  return reasons.other;
}

// Why one file of the folder could not be read: report.failed[].error
function fileReason(error, name) {
  const code = codeOf(error);
  if (code) return systemReason(code, FILE_REASONS);
  const message = String((error && error.message) || error || '').trim();
  if (OWN_REASON.test(message)) return message;
  // A .docx that the Word reader cannot open throws the zip library's English message
  return extensionOf(name) === 'docx' ? FILE_REASONS.notWord : FILE_REASONS.other;
}

// The folder itself cannot be listed. The Error keeps the system code (electron.js maps the
// failure by it) and the original error as its cause.
function folderError(error) {
  const code = codeOf(error);
  const failure = new Error(systemReason(code, FOLDER_REASONS), { cause: error });
  if (code) failure.code = code;
  return failure;
}

// A file over the limit is never read into memory
async function readWithinLimit(filePath, maxFileBytes) {
  const { size } = await fs.stat(filePath);
  if (size > maxFileBytes) throw new Error(TOO_LARGE);
  return fs.readFile(filePath);
}

/**
 * Read the importable files of a folder as chapters. Only the direct
 * children of the folder are read, one at a time, and nothing is logged.
 *
 * A file that cannot be read goes to report.failed, with its reason as a
 * Finnish sentence, and the rest are still imported. The promise is rejected,
 * with a Finnish message, only when the folder cannot be listed (the Error
 * keeps the system's code, such as ENOENT or EACCES) or holds more than
 * maxFiles chapter files.
 *
 * @param {string} folderPath
 * @param {{ maxFiles?: number, maxFileBytes?: number }} [options]
 * @param {{ importDocument?: Function, decodeText?: Function }} [deps] - the two
 *   functions of utils/manuscript.js; tests pass their own
 * @returns {Promise<{
 *   kind: 'folder', path: string, name: string, title: string, author: '',
 *   chapters: Array<{
 *     title: string, titleFrom: 'document' | 'heading' | 'file', fileTitle: string, cleanTitle: string,
 *     content: string, sourceFile: string, synopsis: string, synopsisFile: string | null, encoding?: string
 *   }>,
 *   report: {
 *     subfolders: string[], rtfFiles: string[], otherFiles: string[], cloudPlaceholders: number,
 *     scrivenerProject: boolean, duplicateSynopses: string[], failed: Array<{ name: string, error: string }>
 *   }
 * }>}
 */
async function readImportFolder(folderPath, options = {}, deps) {
  const maxFiles = atLeastZero(options && options.maxFiles, DEFAULT_MAX_FILES);
  const maxFileBytes = atLeastZero(options && options.maxFileBytes, DEFAULT_MAX_FILE_BYTES);
  // Required here, not at the top, so that this module loads without the
  // conversion module and a caller can pass the two functions itself
  const importDocument = (deps && deps.importDocument) || require('./manuscript').importDocument;
  const decodeText = (deps && deps.decodeText) || require('./manuscript').decodeText;

  let listing;
  try {
    listing = await fs.readdir(folderPath, { withFileTypes: true });
  } catch (error) {
    throw folderError(error);
  }

  // External volumes are not always normalisation-insensitive, so every path
  // is built from the name exactly as the file system returned it. Two files
  // whose names differ only in composition keep their own paths, in listing order.
  const returnedNames = new Map();
  const entries = listing.map((entry) => {
    const name = nfc(entry.name);
    const isFile = entry.isFile();
    if (isFile) {
      if (!returnedNames.has(name)) returnedNames.set(name, []);
      returnedNames.get(name).push(entry.name);
    }
    return { name, isFile, isDirectory: entry.isDirectory() };
  });
  const pathOf = (name) => {
    const returned = returnedNames.get(name) || [];
    const own = returned.length > 1 ? returned.shift() : returned[0];
    return path.join(folderPath, own === undefined ? name : own);
  };

  const classified = classifyEntries(entries);
  if (classified.chapterFiles.length > maxFiles) {
    throw new Error(`Kansiossa on yli ${groupThousands(maxFiles)} tuotavaa tiedostoa. Valitse kansio, jossa on vain käsikirjoituksen luvut.`);
  }

  const chapters = [];
  const failed = [];

  for (const name of classified.chapterFiles) {
    let imported;
    try {
      const buffer = await readWithinLimit(pathOf(name), maxFileBytes);
      imported = await importDocument(buffer, name, { oneChapterPerFile: true });
    } catch (error) {
      failed.push({ name, error: fileReason(error, name) });
      continue;
    }

    const first = (imported && Array.isArray(imported.chapters) && imported.chapters[0]) || {};
    const cleanTitle = cleanImportTitle(name);
    // A heading or a Word title inside the file wins over the file name
    const fromDocument = first.titleFrom === 'document' || first.titleFrom === 'heading';
    const ownTitle = fromDocument ? nfc(first.title).trim() : '';

    const chapter = {
      title: ownTitle || cleanTitle,
      titleFrom: ownTitle ? first.titleFrom : 'file',
      fileTitle: cleanImportTitle(name, { stripNumber: false }),
      cleanTitle,
      content: typeof first.content === 'string' ? first.content : '',
      sourceFile: name,
      synopsis: '',
      synopsisFile: null
    };
    // A .docx has no encoding to report
    if (imported && typeof imported.encoding === 'string') chapter.encoding = imported.encoding;

    const synopsisFile = classified.synopsisFor[name];
    if (synopsisFile) {
      try {
        const { text } = decodeText(await readWithinLimit(pathOf(synopsisFile), maxFileBytes));
        // Tidied, never shortened
        chapter.synopsis = nfc(text).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        chapter.synopsisFile = synopsisFile;
      } catch (error) {
        // The chapter is still imported, without a synopsis
        failed.push({ name: synopsisFile, error: fileReason(error, synopsisFile) });
      }
    }

    chapters.push(chapter);
  }

  const resolved = path.resolve(folderPath);
  const name = nfc(path.basename(resolved));
  const parentName = nfc(path.basename(path.dirname(resolved)));
  // Scrivener's sync writes the manuscript into a sub-folder called Draft,
  // so the book is named after the folder above it
  const title = name.toLowerCase() === 'draft' && parentName ? parentName : name;

  return {
    kind: 'folder',
    path: folderPath,
    name,
    title,
    author: '',
    chapters,
    report: {
      subfolders: classified.subfolders,
      rtfFiles: classified.rtfFiles,
      otherFiles: classified.otherFiles,
      cloudPlaceholders: classified.cloudPlaceholders,
      scrivenerProject: classified.scrivenerProject || /\.scriv$/i.test(name),
      duplicateSynopses: classified.duplicateSynopses,
      failed
    }
  };
}

/**
 * The path of a direct sub-folder, by name, or null.
 *
 * This is the only way the renderer can ask for a folder it did not pick in
 * the native dialog. The name must equal a name the file system lists for a
 * direct child directory, so "..", a nested path, a file name or an invented
 * name all give null. Hidden folders and .rtfd packages are refused too.
 *
 * @param {string} folderPath
 * @param {string} name
 * @returns {Promise<string | null>}
 */
async function resolveSubfolder(folderPath, name) {
  if (typeof name !== 'string' || name === '') return null;
  const wanted = nfc(name);
  if (wanted.startsWith('.') || extensionOf(wanted) === 'rtfd') return null;

  let listing;
  try {
    listing = await fs.readdir(folderPath, { withFileTypes: true });
  } catch {
    return null;
  }

  const entry = listing.find(item => item.isDirectory() && nfc(item.name) === wanted);
  return entry ? path.join(folderPath, entry.name) : null;
}

module.exports = {
  CHAPTER_EXTENSIONS,
  naturalCompare,
  fileStem,
  cleanImportTitle,
  pairSynopsisFiles,
  classifyEntries,
  readImportFolder,
  resolveSubfolder
};

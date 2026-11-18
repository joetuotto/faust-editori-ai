/**
 * Import plan
 *
 * The row model of the import preview and the function that applies an
 * import to a project. Every Finnish sentence that depends on a count is
 * built here, so the dialog holds only state and events and all of this is
 * unit-tested (test/services/importPlan.test.js).
 *
 * An import source is what the main process returns: a folder
 * ({ kind: 'folder', chapters, report }, see utils/importFolder.js) or a
 * single file ({ kind: 'file', chapters, encoding? }).
 *
 * Pure functions, no DOM. Rows and projects are never changed in place.
 */

const { countWords } = require('../../editor/textTools.js');
const { buildSnapshot } = require('./snapshots.js');
const { formatCount } = require('../format.fi.js');

const UNTITLED = 'Nimetön luku';
const UNTITLED_PROJECT = 'Nimetön projekti';

// A longer list of sub-folder names is cut and the rest are counted
const MAX_NAMED_SUBFOLDERS = 5;

// The row shows the first characters of its text under the title
const EXCERPT_LENGTH = 60;

// "1 luku", "31 lukua", "84 512 sanaa"
const counted = (n, one, many) => `${formatCount(n)} ${n === 1 ? one : many}`;

const isFilled = (value) => typeof value === 'string' && value.trim().length > 0;

// ---------------------------------------------------------------------------
// Rows of the preview
// ---------------------------------------------------------------------------

/**
 * One row per chapter of the source, in the given order.
 *
 * A folder file with no text starts unticked (Scrivener writes its folder
 * documents as empty files); every chapter of a single file starts ticked.
 */
function buildRows(source) {
  const folder = !!source && source.kind === 'folder';
  const chapters = source && Array.isArray(source.chapters) ? source.chapters : [];

  return chapters.map((item, index) => {
    const chapter = item || {};
    const content = typeof chapter.content === 'string' ? chapter.content : '';
    const words = countWords(content);
    const fromDocument = chapter.titleFrom === 'document' || chapter.titleFrom === 'heading';

    return {
      key: `r${index}`,
      index,
      title: String(chapter.title || '').trim() || UNTITLED,
      // A single file is split at its headings, so each title is a heading
      titleFrom: folder ? (fromDocument ? chapter.titleFrom : 'file') : 'heading',
      fileTitle: folder ? (chapter.fileTitle || null) : null,
      cleanTitle: folder ? (chapter.cleanTitle || null) : null,
      renamed: false,
      content,
      words,
      synopsis: typeof chapter.synopsis === 'string' ? chapter.synopsis : '',
      sourceFile: folder ? (chapter.sourceFile || null) : null,
      encodingGuessed: chapter.encoding === 'windows-1252' || source.encoding === 'windows-1252',
      included: folder ? words > 0 : true
    };
  });
}

/** True when the "remove the order number" checkbox would change some title. */
function hasOrderNumbers(rows) {
  return rows.some(row => row.titleFrom === 'file' && !!row.fileTitle && row.fileTitle !== row.cleanTitle);
}

/**
 * Show file-name titles with or without their order number. A title that
 * came from inside the file, or that the author has typed, is left alone.
 */
function applyStripNumbers(rows, strip) {
  return rows.map((row) => {
    if (row.titleFrom !== 'file' || !row.fileTitle || row.renamed) return row;
    return { ...row, title: strip ? (row.cleanTitle || row.fileTitle) : row.fileTitle };
  });
}

/** Move a row; the same array comes back when nothing moves. */
function moveRow(rows, from, to) {
  if (!Number.isInteger(from) || from < 0 || from >= rows.length) return rows;
  // A missing target (null, undefined, NaN, a string) is no place in the list:
  // a drop without one must not throw the row to the top. ±Infinity clamps.
  if (typeof to !== 'number' || Number.isNaN(to)) return rows;
  const target = Math.max(0, Math.min(rows.length - 1, Math.trunc(to)));
  if (from === target) return rows;

  const next = rows.slice();
  const [row] = next.splice(from, 1);
  next.splice(target, 0, row);
  return next;
}

/** The author's own title. Not trimmed here: this runs on every key press. */
function renameRow(rows, key, title) {
  const typed = title === null || title === undefined ? '' : String(title);
  return rows.map(row => (row.key === key ? { ...row, title: typed, renamed: true } : row));
}

function setRowIncluded(rows, key, included) {
  return rows.map(row => (row.key === key ? { ...row, included: !!included } : row));
}

function setAllIncluded(rows, included) {
  return rows.map(row => ({ ...row, included: !!included }));
}

/** The rows in the order the source gave them. */
function resetOrder(rows) {
  return rows.slice().sort((a, b) => a.index - b.index);
}

function isReordered(rows) {
  return rows.some((row, position) => position > 0 && row.index < rows[position - 1].index);
}

// ---------------------------------------------------------------------------
// Counts and sentences
// ---------------------------------------------------------------------------

/** Words and summaries are counted over the ticked rows only. */
function summarizeRows(rows) {
  const included = rows.filter(row => row.included);
  return {
    included: included.length,
    excluded: rows.length - included.length,
    words: included.reduce((sum, row) => sum + (row.words || 0), 0),
    synopses: included.filter(row => isFilled(row.synopsis)).length
  };
}

function summaryLine(rows) {
  const { included, words } = summarizeRows(rows);
  if (included === 0) return 'Yhtään lukua ei ole valittu.';
  return `Tuodaan ${counted(included, 'luku', 'lukua')}, ${counted(words, 'sana', 'sanaa')}.`;
}

function importButtonLabel(rows) {
  const { included } = summarizeRows(rows);
  return included === 0 ? 'Tuo' : `Tuo ${counted(included, 'luku', 'lukua')}`;
}

/**
 * The first characters of a chapter on one line, as the row shows them under its title.
 * Markdown markers are left out, as everywhere outside the editor (V 6.3, app.js stripMarkers):
 * heading signs, **, __, ~~, *, _, ` and the <u> of an underline.
 */
function rowExcerpt(content, length = EXCERPT_LENGTH) {
  const line = String(content || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/<\/?u>/gi, '')
    .replace(/\*\*|__|~~|[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return line.length > length ? line.slice(0, length).trimEnd() + '…' : line;
}

/**
 * The hints under the two targets of a project that has text (strings of brief 6.3):
 * append `”Lumen alla”, 6 lukua ennestään`, replace `Nykyiset 6 lukua korvataan. …`.
 */
function targetHints(project) {
  const title = (project && project.title) || UNTITLED_PROJECT;
  const existing = project && Array.isArray(project.structure) ? project.structure.length : 0;
  return {
    append: `”${title}”, ${counted(existing, 'luku', 'lukua')} ennestään`,
    replace: existing === 1
      ? 'Nykyinen luku korvataan. Siitä otetaan ensin tilannekuva.'
      : `Nykyiset ${formatCount(existing)} lukua korvataan. Niistä otetaan ensin tilannekuva.`
  };
}

// "Notes." / "Notes, Research." / "a, b, c, d, e ja 2 muuta."
function subfolderList(names) {
  if (names.length <= MAX_NAMED_SUBFOLDERS) return names.join(', ');
  const rest = names.length - MAX_NAMED_SUBFOLDERS;
  return `${names.slice(0, MAX_NAMED_SUBFOLDERS).join(', ')} ja ${formatCount(rest)} muuta`;
}

/**
 * What the author should know about the source, as sentences in a fixed
 * order. Each line is there only when its count is above zero.
 * @returns {Array<{ kind: string, text: string }>}
 */
function noticeLines(source, rows) {
  const folder = !!source && source.kind === 'folder';
  const report = (source && source.report) || {};
  const list = (value) => (Array.isArray(value) ? value : []);
  const lines = [];
  const add = (kind, text) => lines.push({ kind, text });

  if (report.scrivenerProject) {
    add('scrivener', 'Tämä näyttää Scrivener-projektilta (.scriv). FAUST ei lue projektitiedostoa suoraan. Tuo Scrivenerin synkronointikansio (Sync with External Folder) tai käännä käsikirjoitus .docx-tiedostoksi ja valitse Tiedosto → Tuo tekstiä.');
  }

  const rtf = list(report.rtfFiles).length;
  if (rtf > 0) {
    const advice = 'Valitse Scrivenerin synkronointiasetuksista muodoksi pelkkä teksti (Plain Text) ja synkronoi uudelleen.';
    add('rtf', rtf === 1
      ? `Kansiossa on 1 RTF-tiedosto, jota FAUST ei tuo. ${advice}`
      : `Kansiossa on ${formatCount(rtf)} RTF-tiedostoa, joita FAUST ei tuo. ${advice}`);
  }

  const cloud = Number.isFinite(report.cloudPlaceholders) ? report.cloudPlaceholders : 0;
  if (cloud > 0) {
    const advice = 'Lataa kansio Finderissa tälle koneelle ja tuo uudelleen.';
    add('cloud', cloud === 1
      ? `1 tiedosto on vain iCloudissa, eikä sitä voitu lukea. ${advice}`
      : `${formatCount(cloud)} tiedostoa on vain iCloudissa, eikä niitä voitu lukea. ${advice}`);
  }

  const subfolders = list(report.subfolders);
  if (subfolders.length === 1) add('subfolders', `Alikansiota ei luettu: ${subfolders[0]}.`);
  if (subfolders.length > 1) add('subfolders', `Alikansioita ei luettu: ${subfolderList(subfolders)}.`);

  for (const failure of list(report.failed)) {
    if (!failure) continue;
    add('failed', `Tiedostoa ${failure.name} ei voitu lukea: ${failure.error}`);
  }

  const duplicates = list(report.duplicateSynopses);
  if (duplicates.length > 0) {
    add('duplicate-synopsis', `Luvulle löytyi useampi tiivistelmätiedosto. Ohitettiin: ${duplicates.join(', ')}.`);
  }

  // The sentence counts files. A row of a folder import is a file; the
  // chapters of a single file all come from that one file.
  const guessedRows = rows.filter(row => row.encodingGuessed).length;
  const guessed = folder ? guessedRows : Math.min(1, guessedRows);
  if (guessed > 0) {
    const advice = 'Tarkista, että ä ja ö näkyvät oikein.';
    add('encoding', guessed === 1
      ? `1 tiedosto ei ollut UTF-8-muodossa, ja sen merkistö arvattiin. ${advice}`
      : `${formatCount(guessed)} tiedostoa ei ollut UTF-8-muodossa, ja niiden merkistö arvattiin. ${advice}`);
  }

  // Only a folder has empty files; an empty chapter of a single file starts
  // ticked, and the author who unticks it needs no sentence about a file
  const empty = folder ? rows.filter(row => row.words === 0 && !row.included).length : 0;
  if (empty > 0) {
    add('empty', empty === 1
      ? '1 tyhjä tiedosto on jätetty pois. Voit ottaa sen mukaan rastimalla.'
      : `${formatCount(empty)} tyhjää tiedostoa on jätetty pois. Voit ottaa ne mukaan rastimalla.`);
  }

  const synopses = rows.filter(row => isFilled(row.synopsis)).length;
  if (synopses > 0) add('synopses', `Tiivistelmä löytyi ${formatCount(synopses)} luvulle.`);

  const other = list(report.otherFiles).length;
  if (other > 0) {
    add('other', other === 1 ? '1 muu tiedosto ohitettiin.' : `${formatCount(other)} muuta tiedostoa ohitettiin.`);
  }

  return lines;
}

/**
 * Why the chapters of the project cannot be replaced right now, or null.
 * A replace would take the text away from under a pending suggestion or a
 * running request.
 */
function replaceBlockedReason({ pendingSuggestions = 0, activeRequests = 0 } = {}) {
  const pending = Number(pendingSuggestions) || 0;
  const active = Number(activeRequests) || 0;

  // The wording of contracts 8.1 (format.fi.js pendingSuggestions), carried
  // here as a literal because the sentence around it changes with the number
  if (pending === 1) {
    return 'Projektissa on 1 käsittelemätön ehdotus. Käsittele se ensin tai lisää luvut projektin loppuun.';
  }
  if (pending > 1) {
    return `Projektissa on ${formatCount(pending)} käsittelemätöntä ehdotusta. Käsittele ne ensin tai lisää luvut projektin loppuun.`;
  }
  if (active > 0) {
    return 'Tekoälypyyntö on käynnissä. Pysäytä se tai odota sen valmistumista ennen lukujen korvaamista.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Applying the import
// ---------------------------------------------------------------------------

/**
 * A project with nothing to lose: no chapters, or one chapter without text,
 * summary, notes or sub-documents (what a new project starts with).
 */
function isBlankProject(project) {
  const structure = project && Array.isArray(project.structure) ? project.structure : [];
  if (structure.length === 0) return true;
  if (structure.length > 1) return false;

  const only = structure[0] || {};
  const hasChildren = Array.isArray(only.children) && only.children.length > 0;
  return !isFilled(only.content) && !isFilled(only.synopsis) && !isFilled(only.notes) && !hasChildren;
}

/**
 * What the author chose in the preview: the ticked rows in their order.
 * @returns {{ mode: 'append' | 'replace', bookTitle: string, author: string, sourceName: string,
 *   snapshot: boolean, chapters: Array<{ title: string, content: string, synopsis: string }> }}
 */
function buildSelection(rows, { mode, bookTitle, author, sourceName, snapshot } = {}) {
  const replace = mode === 'replace';
  return {
    mode: replace ? 'replace' : 'append',
    bookTitle: String(bookTitle || '').trim(),
    author: String(author || '').trim(),
    sourceName: String(sourceName || '').trim(),
    // Replacing chapters without a way back is not offered
    snapshot: replace ? true : snapshot !== false,
    chapters: rows.filter(row => row.included).map(row => ({
      title: String(row.title || '').trim() || UNTITLED,
      content: row.content,
      synopsis: String(row.synopsis || '').trim()
    }))
  };
}

/**
 * The chapter documents of a selection. `createChapter(title)` is the app's
 * createDocument('chapter', title), so the chapter shape has one source.
 *
 * An imported summary goes to both `synopsis` (what cards and the context
 * read) and `synopsisManual` (which marks it as the author's own, so the AI
 * summary writers never replace it).
 */
function buildChapterDocs(selection, createChapter) {
  return selection.chapters.map((chapter) => {
    const doc = {
      ...createChapter(chapter.title),
      title: chapter.title,
      content: chapter.content,
      wordCount: countWords(chapter.content)
    };
    if (chapter.synopsis) {
      doc.synopsis = chapter.synopsis;
      doc.synopsisManual = chapter.synopsis;
    }
    return doc;
  });
}

/** The snapshot of the project as it is before the import changes it. */
function buildImportSnapshot(project, selection, now) {
  const oldTitle = (project && project.title) || '';
  const titleChanges = selection.mode === 'replace' && !!selection.bookTitle && !!oldTitle &&
    selection.bookTitle !== oldTitle;

  return buildSnapshot(project, {
    name: 'Ennen tuontia: ' + (selection.sourceName || 'tuotu teksti'),
    description: 'Automaattinen tilannekuva ennen tuontia.' + (titleChanges ? ` Projektin nimi oli ”${oldTitle}”.` : ''),
    now,
    auto: 'import'
  });
}

/**
 * The project with the imported chapters in it. Pure: the snapshot and the
 * import happen in one step, so the snapshot is exactly the state that the
 * import changes.
 *
 * A blank project is always replaced and needs no snapshot. A replace always
 * takes one; an append takes one unless the author unticked it.
 */
function applyImport(project, selection, docs, { now = new Date() } = {}) {
  if (!Array.isArray(docs) || docs.length === 0) return project;

  const blank = isBlankProject(project);
  const replace = blank || selection.mode === 'replace';
  const takeSnapshot = !blank && (replace || selection.snapshot !== false);

  const kept = replace || !Array.isArray(project.structure) ? [] : project.structure;
  const structure = [...kept, ...docs.map((doc, position) => ({ ...doc, order: kept.length + position }))];
  const snapshots = Array.isArray(project.snapshots) ? project.snapshots : [];

  return {
    ...project,
    title: replace ? (selection.bookTitle || project.title) : project.title,
    author: replace ? (project.author || selection.author || '') : project.author,
    structure,
    snapshots: takeSnapshot ? [...snapshots, buildImportSnapshot(project, selection, now)] : snapshots,
    modified: now.toISOString()
  };
}

module.exports = {
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
  rowExcerpt,
  targetHints,
  noticeLines,
  isBlankProject,
  buildSelection,
  buildChapterDocs,
  buildImportSnapshot,
  applyImport,
  replaceBlockedReason
};

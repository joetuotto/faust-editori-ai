/**
 * Tarinakansio: the entries of a book (project.codex)
 *
 * An entry is a character, a place, a term or another thing a model should
 * know about. Its description is the only text a model ever reads; its notes
 * are never sent by any function here. The entry's state decides when the
 * description is sent: always, when the text mentions it, only when the
 * author adds it by hand, or never.
 *
 * Pure functions, no DOM (test/services/codex.test.js). Entries are replaced,
 * never mutated, when they are edited: the compiled matchers are cached per
 * entry object.
 */

const { parseTermList, compileTerms, findTermMatches, todoRanges } = require('../../editor/termMatch.js');

const TYPES = {
  fiction: ['hahmo', 'paikka', 'esine', 'kasite', 'juonilanka'],
  nonfiction: ['termi', 'henkilo', 'lahde']
};

const TYPE_LABELS = {
  hahmo: 'Hahmo',
  paikka: 'Paikka',
  esine: 'Esine',
  kasite: 'Käsite',
  juonilanka: 'Juonilanka',
  termi: 'Termi',
  henkilo: 'Henkilö',
  lahde: 'Lähde'
};

const TYPE_PLURALS = {
  hahmo: 'Hahmot',
  paikka: 'Paikat',
  esine: 'Esineet',
  kasite: 'Käsitteet',
  juonilanka: 'Juonilangat',
  termi: 'Termit',
  henkilo: 'Henkilöt',
  lahde: 'Lähteet'
};

const STATES = ['always', 'mentioned', 'manual', 'never'];

const STATE_LABELS = {
  always: 'Aina mukana',
  mentioned: 'Kun mainitaan',
  manual: 'Vain käsin',
  never: 'Ei koskaan'
};

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const asText = (value) => (typeof value === 'string' ? value : '');

// ---------------------------------------------------------------------------
// Project kind
// ---------------------------------------------------------------------------

/** The one project-type rule: a book is nonfiction only when its genre says so. */
function projectKind(project) {
  return project && project.genre === 'nonfiction' ? 'nonfiction' : 'fiction';
}

/** The visible name of the section. */
function folderName(project) {
  return projectKind(project) === 'nonfiction' ? 'Käsikirjoituksen kansio' : 'Tarinakansio';
}

/** The entry types offered in this project. */
function typesFor(project) {
  return TYPES[projectKind(project)];
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

function defaultMakeId() {
  const random = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `cx-${Date.now().toString(36)}-${random}`;
}

// An id that is not in use. A generator that keeps returning the same value
// (a test stub) gets a running number instead of an endless loop.
function unusedId(used, makeId) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = makeId();
    if (typeof id === 'string' && id && !used.has(id)) return id;
  }
  const base = defaultMakeId();
  let number = 2;
  while (used.has(`${base}-${number}`)) number += 1;
  return `${base}-${number}`;
}

// A list field: an array keeps its strings, typed text is split like the form does
function termList(value) {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string');
  if (typeof value === 'string') return parseTermList(value);
  return [];
}

const typeOf = (entry) => (entry && has(TYPE_LABELS, entry.type) ? entry.type : 'kasite');
const stateOf = (entry) => (entry && STATES.includes(entry.state) ? entry.state : 'mentioned');

/**
 * Repair one stored entry. Unknown extra fields are kept, so data written by
 * a later version survives a round trip.
 * @returns {object|null} null when the value is not an object
 */
function normalizeEntry(raw, opts = {}) {
  if (!isRecord(raw)) return null;

  const now = opts.now || new Date().toISOString();
  const makeId = opts.makeId || defaultMakeId;
  const { id, type, name, aliases, exclude, description, notes, state, created, modified, source, ...extra } = raw;
  const createdAt = typeof created === 'string' && created ? created : now;

  const entry = {
    id: typeof id === 'string' && id ? id : makeId(),
    type: typeOf({ type }),
    name: asText(name),
    aliases: termList(aliases),
    exclude: termList(exclude),
    description: asText(description),
    notes: asText(notes),
    state: stateOf({ state }),
    created: createdAt,
    modified: typeof modified === 'string' && modified ? modified : createdAt,
    ...extra
  };
  if (isRecord(source) && typeof source.key === 'string') entry.source = { ...source };
  return entry;
}

/**
 * A new entry. opts: { project, now, makeId }.
 * The type defaults to the first type of the project's kind.
 */
function createEntry(fields = {}, opts = {}) {
  const now = opts.now || new Date().toISOString();
  return normalizeEntry({
    type: typesFor(opts.project)[0],
    name: '',
    aliases: [],
    exclude: [],
    description: '',
    notes: '',
    state: 'mentioned',
    created: now,
    modified: now,
    ...(isRecord(fields) ? fields : {})
  }, { ...opts, now });
}

/** Repair the stored list: no nulls, and no id twice. */
function normalizeCodex(value, opts = {}) {
  if (!Array.isArray(value)) return [];

  const makeId = opts.makeId || defaultMakeId;
  const used = new Set();
  const entries = [];
  for (const raw of value) {
    const entry = normalizeEntry(raw, opts);
    if (!entry) continue;
    if (used.has(entry.id)) entry.id = unusedId(used, makeId);
    used.add(entry.id);
    entries.push(entry);
  }
  return entries;
}

/** A new list in which one entry is a new object with the patch applied. */
function updateEntry(list, id, patch, now = new Date().toISOString()) {
  return (list || []).map(entry => (
    entry && entry.id === id ? { ...entry, ...(isRecord(patch) ? patch : {}), id: entry.id, modified: now } : entry
  ));
}

/** A new list without the entry. */
function removeEntry(list, id) {
  return (list || []).filter(entry => !entry || entry.id !== id);
}

/** The line a model reads. Aliases, exclusions and notes are never part of it. */
function formatEntry(entry) {
  const label = TYPE_LABELS[typeOf(entry)].toLowerCase();
  return `${asText(entry && entry.name).trim()} (${label}): ${asText(entry && entry.description).trim()}`;
}

// ---------------------------------------------------------------------------
// The list in the sidebar (stage I-07)
// ---------------------------------------------------------------------------

/** The section shows its name filter from this many entries on: more than eight. */
const FILTER_FROM = 9;

/**
 * The entries as the Tarinakansio section lists them: one group per type, in
 * the order of the project's types and then the other types (an unknown type
 * under Käsitteet); named entries alphabetically, unnamed ones last.
 *
 * The name filter (part of the name or of an alias, in any case) is shown only
 * from FILTER_FROM entries on, and it filters only while it is shown: a filter
 * typed before entries were deleted never hides entries behind a field that is
 * no longer there.
 *
 * @returns {{ showFilter: boolean, groups: Array<{ type: string, items: object[] }> }}
 */
function listGroups(entries, { project, filter = '' } = {}) {
  const records = (Array.isArray(entries) ? entries : []).filter(isRecord);
  const showFilter = records.length >= FILTER_FROM;
  const needle = showFilter ? asText(filter).trim().toLocaleLowerCase('fi') : '';

  const own = typesFor(project);
  const order = [...own, ...Object.keys(TYPE_LABELS).filter(type => !own.includes(type))];
  const byType = new Map(order.map(type => [type, []]));
  for (const entry of records) {
    if (needle) {
      const words = [entry.name, ...termList(entry.aliases)].map(word => asText(word).toLocaleLowerCase('fi'));
      if (!words.some(word => word.includes(needle))) continue;
    }
    byType.get(typeOf(entry)).push(entry);
  }

  const nameOf = (entry) => asText(entry.name).trim();
  const byName = (a, b) => (nameOf(a) ? 0 : 1) - (nameOf(b) ? 0 : 1) || nameOf(a).localeCompare(nameOf(b), 'fi');
  const groups = order
    .map(type => ({ type, items: byType.get(type).sort(byName) }))
    .filter(group => group.items.length > 0);
  return { showFilter, groups };
}

// ---------------------------------------------------------------------------
// Mentions
// ---------------------------------------------------------------------------

const preparedCache = new WeakMap();

function prepareEntry(entry) {
  let prepared = preparedCache.get(entry);
  if (!prepared) {
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    prepared = {
      id: entry.id,
      label: `${asText(entry.name)} · ${TYPE_LABELS[typeOf(entry)].toLowerCase()} · ${STATE_LABELS[stateOf(entry)]}`,
      terms: compileTerms([entry.name, ...aliases]),
      exclude: compileTerms(Array.isArray(entry.exclude) ? entry.exclude : [])
    };
    preparedCache.set(entry, prepared);
  }
  return prepared;
}

/** Compile the matchers of a list of entries once. The result is opaque. */
function prepareEntries(entries) {
  return (entries || []).filter(isRecord).map(prepareEntry);
}

// Spellings with their counts: most frequent first, then alphabetically
function sortedForms(counts) {
  return Array.from(counts, ([form, count]) => ({ form, count }))
    .sort((a, b) => b.count - a.count || a.form.localeCompare(b.form, 'fi'));
}

/**
 * Find the mentions of prepared entries in a text.
 *
 * Every entry takes part whatever its state: matching is local, and the state
 * decides only what is sent. Where two entries match the same words the
 * longest match wins, so nothing is counted twice. [TODO: …] notes are
 * skipped unless options.skipTodo is false.
 *
 * @returns {{ matches: Array<{entryId, start, end, text}>, counts: object, forms: object }}
 */
function matchPrepared(text, prepared, options = {}) {
  const list = prepared || [];
  const counts = {};
  const formCounts = {};
  for (const item of list) {
    counts[item.id] = 0;
    formCounts[item.id] = new Map();
  }

  const matches = [];
  const value = typeof text === 'string' ? text : '';
  if (value) {
    const skip = options && options.skipTodo === false ? undefined : todoRanges(value);

    const pool = [];
    list.forEach((item, order) => {
      if (!item.terms.pattern) return;
      for (const hit of findTermMatches(value, item.terms, { exclude: item.exclude, skip })) {
        pool.push({ entryId: item.id, start: hit.start, end: hit.end, text: hit.text, order });
      }
    });
    pool.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.order - b.order);

    let lastEnd = 0;
    for (const hit of pool) {
      if (hit.start < lastEnd) continue;
      lastEnd = hit.end;
      matches.push({ entryId: hit.entryId, start: hit.start, end: hit.end, text: hit.text });
      counts[hit.entryId] += 1;
      // One spelling is one row, however its letters are encoded in the text
      const form = hit.text.normalize('NFC');
      formCounts[hit.entryId].set(form, (formCounts[hit.entryId].get(form) || 0) + 1);
    }
  }

  const forms = {};
  for (const item of list) forms[item.id] = sortedForms(formCounts[item.id]);
  return { matches, counts, forms };
}

/** matchPrepared for a plain list of entries. */
function matchEntries(text, entries, options = {}) {
  return matchPrepared(text, prepareEntries(entries), options);
}

/**
 * Mention counts over a book. chapters: [{ id, content }].
 * Chapters marked "Ei tekoälylle" are counted too: nothing is sent.
 *
 * options.cache: a Map the caller keeps from one call to the next (the
 * Tarinakansio list counts again after every pause in typing). A chapter whose
 * content string and entries list are the very ones of the previous call is
 * not scanned again, so typing rescans only the open chapter; a new entries
 * list rescans every chapter; chapters that are gone leave the cache.
 * @returns {{ total: object, byChapter: object, forms: object }}
 */
function countMentions(chapters, entries, options = {}) {
  const cache = options && options.cache instanceof Map ? options.cache : null;
  const prepared = prepareEntries(entries);
  const total = {};
  const merged = {};
  for (const item of prepared) {
    total[item.id] = 0;
    merged[item.id] = new Map();
  }

  const byChapter = {};
  const seen = new Set();
  for (const chapter of chapters || []) {
    if (!chapter) continue;
    const content = asText(chapter.content);
    const hit = cache ? cache.get(chapter.id) : null;
    let result;
    if (hit && hit.content === content && hit.entries === entries) {
      result = hit.result;
    } else {
      result = matchPrepared(content, prepared);
      if (cache) cache.set(chapter.id, { content, entries, result });
    }
    seen.add(chapter.id);
    byChapter[chapter.id] = result.counts;
    for (const item of prepared) {
      total[item.id] += result.counts[item.id];
      for (const { form, count } of result.forms[item.id]) {
        merged[item.id].set(form, (merged[item.id].get(form) || 0) + count);
      }
    }
  }
  if (cache) for (const id of Array.from(cache.keys())) if (!seen.has(id)) cache.delete(id);

  const forms = {};
  for (const item of prepared) forms[item.id] = sortedForms(merged[item.id]);
  return { total, byChapter, forms };
}

/**
 * Choose the entries for one request.
 *
 * include and exclude hold keys of the form 'codex:<id>'. An entry in state
 * "Ei koskaan" or without a name or a description is never returned.
 * With detectMentions false nothing is matched and "Kun mainitaan" behaves
 * like "Vain käsin".
 *
 * @returns {{ always: object[], mentioned: object[], manual: object[], mentionCounts: object }}
 */
function selectForContext({ entries, text, include = [], exclude = [], detectMentions = true } = {}) {
  const list = (entries || []).filter(isRecord);
  const excluded = new Set(exclude || []);
  const eligible = (entry) => stateOf(entry) !== 'never'
    && asText(entry.name).trim() !== ''
    && asText(entry.description).trim() !== ''
    && !excluded.has(`codex:${entry.id}`);

  const always = list.filter(entry => eligible(entry) && stateOf(entry) === 'always');

  const manual = [];
  const manualIds = new Set();
  for (const key of include || []) {
    if (typeof key !== 'string' || !key.startsWith('codex:')) continue;
    const id = key.slice('codex:'.length);
    const entry = list.find(candidate => candidate.id === id);
    if (!entry || manualIds.has(id) || !eligible(entry) || stateOf(entry) === 'always') continue;
    manualIds.add(id);
    manual.push(entry);
  }

  let mentioned = [];
  let mentionCounts = {};
  if (detectMentions) {
    // The counts are the ones the folder shows: every entry takes part
    mentionCounts = matchEntries(text, list).counts;

    // What is sent is decided among the entries that can go out as mentions.
    // Matched together with the rest, an entry that is never sent, has no
    // description or was switched off for this request would take the words
    // away from an entry of the same name that can be sent.
    const candidates = list.filter(entry => eligible(entry) && stateOf(entry) === 'mentioned' && !manualIds.has(entry.id));
    const own = matchEntries(text, candidates);

    const firstAt = {};
    for (const match of own.matches) {
      if (firstAt[match.entryId] === undefined) firstAt[match.entryId] = match.start;
    }
    mentioned = candidates
      .filter(entry => own.counts[entry.id] > 0)
      .sort((a, b) => own.counts[b.id] - own.counts[a.id] || firstAt[a.id] - firstAt[b.id]);
  }

  return { always, mentioned, manual, mentionCounts };
}

// ---------------------------------------------------------------------------
// Migration from the old character, location and thread data
// ---------------------------------------------------------------------------
// The old fields are read, never written or removed.

// Finnish labels of the old forms' enum values (src/utils/constants.js)
const LEGACY_LABELS = {
  locationType: {
    home: 'Koti',
    city: 'Kaupunki',
    nature: 'Luonto',
    building: 'Rakennus',
    vehicle: 'Ajoneuvo',
    fantasy: 'Fantasiamaailma',
    other: 'Muu'
  },
  atmosphere: {
    peaceful: 'Rauhallinen',
    tense: 'Jännittävä',
    mysterious: 'Mystinen',
    dangerous: 'Vaarallinen',
    cozy: 'Viihtyisä',
    eerie: 'Aavemainen',
    busy: 'Vilkas',
    abandoned: 'Hylätty'
  },
  threadType: {
    main_plot: 'Pääjuoni',
    subplot: 'Sivujuoni',
    character_arc: 'Hahmon kehityskaari',
    theme: 'Teema',
    mystery: 'Arvoitus',
    romance: 'Rakkausjuoni'
  },
  threadStatus: {
    planned: 'Suunniteltu',
    active: 'Avoin',
    developing: 'Kehittyvä',
    resolved: 'Ratkaistu',
    abandoned: 'Hylätty'
  }
};

// A value that can be written on a line: a string or a number, else nothing
function plain(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.trim() : '';
}

const labelled = (label, value) => (plain(value) ? `${label}: ${plain(value)}` : '');

// An unknown enum value is written as it is
function enumLabel(table, value) {
  const key = plain(value);
  return key && has(LEGACY_LABELS[table], key) ? LEGACY_LABELS[table][key] : key;
}

const joined = (list, separator) => (Array.isArray(list) ? list.map(plain).filter(Boolean).join(separator) : '');
const hasKeys = (value) => isRecord(value) && Object.keys(value).length > 0;
const idOrName = (record, name) => plain(record.id) || name;

function flatCharacterLines(record) {
  const arc = isRecord(record.characterArc) ? record.characterArc : {};
  const arcText = [plain(arc.beginning), plain(arc.end)].filter(Boolean).join(' → ');
  return [
    plain(record.description),
    labelled('Ikä', record.age),
    labelled('Ammatti', record.occupation),
    labelled('Tausta', record.background),
    labelled('Ulkonäkö', record.appearance),
    labelled('Puhetapa', isRecord(record.voice) ? record.voice.style : ''),
    labelled('Kaari', arcText)
  ];
}

function basicInfoCharacterLines(record) {
  const lines = Object.keys(record.basicInfo)
    .filter(key => key !== 'name')
    .map(key => labelled(key, record.basicInfo[key]));
  if (typeof record.psychological === 'string') lines.push(record.psychological.trim());
  return lines;
}

// The tracker's record: whatever it noted about the character, one value per line
function trackedCharacterLines(record) {
  const lines = [];
  for (const group of [record.traits, record.state]) {
    if (Array.isArray(group)) lines.push(joined(group, ', '));
    else if (isRecord(group)) lines.push(...Object.keys(group).map(key => labelled(key, group[key])));
  }
  return lines;
}

function locationLines(record) {
  const senses = isRecord(record.sensoryDetails) ? record.sensoryDetails : {};
  const tracked = Array.isArray(record.descriptions) ? record.descriptions.map(plain) : [];
  return [
    plain(record.description),
    labelled('Tyyppi', enumLabel('locationType', record.type)),
    labelled('Tunnelma', enumLabel('atmosphere', record.atmosphere)),
    labelled('Näkö', senses.visual),
    labelled('Kuulo', senses.auditory),
    labelled('Haju', senses.olfactory),
    labelled('Tunto', senses.tactile),
    labelled('Historia', record.historicalContext),
    labelled('Merkitys', record.symbolicMeaning),
    ...tracked
  ];
}

function threadLines(record, name) {
  // The tracker copies the name into the description
  const description = plain(record.description);
  return [
    description === name ? '' : description,
    labelled('Tyyppi', enumLabel('threadType', record.type)),
    labelled('Tila', enumLabel('threadStatus', record.status)),
    labelled('Hahmot', joined(record.relatedCharacters, ', ')),
    labelled('Paikat', joined(record.relatedLocations, ', ')),
    labelled('Tapahtumat', joined(record.keyEvents, '; ')),
    labelled('Ratkaisu', record.resolution)
  ];
}

// A tracker location that holds nothing but its name. Such records come from
// a regex for capitalised words and are mostly not names.
function locationIsNameOnly(record) {
  const fields = ['description', 'type', 'atmosphere', 'notes', 'historicalContext', 'symbolicMeaning'];
  if (fields.some(field => plain(record[field]))) return false;
  if (isRecord(record.sensoryDetails) && Object.values(record.sensoryDetails).some(value => plain(value))) return false;
  if (Array.isArray(record.descriptions) && record.descriptions.some(value => plain(value))) return false;
  return true;
}

// Records of a store that is either a list or an object keyed by name
function recordsOf(store) {
  if (Array.isArray(store)) return store.filter(isRecord).map(record => ({ record, keyName: '' }));
  if (isRecord(store)) {
    return Object.keys(store)
      .filter(keyName => isRecord(store[keyName]))
      .map(keyName => ({ record: store[keyName], keyName }));
  }
  return [];
}

// Every old record that has a name, in the order the sources are imported
function legacyItems(project) {
  const items = [];
  const seen = new Set();
  const add = (key, kind, name, nameOnly, lines, record) => {
    if (!name || seen.has(key)) return;
    seen.add(key);
    items.push({
      key,
      kind,
      name,
      nameOnly,
      description: lines.filter(Boolean).join('\n'),
      notes: typeof record.notes === 'string' ? record.notes.trim() : ''
    });
  };

  const data = isRecord(project) ? project : {};
  const continuity = isRecord(data.continuity) ? data.continuity : {};

  for (const { record } of recordsOf(data.characters)) {
    if (isRecord(record.basicInfo)) {
      const name = plain(record.basicInfo.name);
      add(`characters:${idOrName(record, name)}`, 'character', name, false, basicInfoCharacterLines(record), record);
    } else {
      const name = plain(record.name);
      add(`characters:${idOrName(record, name)}`, 'character', name, false, flatCharacterLines(record), record);
    }
  }

  for (const { record, keyName } of recordsOf(continuity.characters)) {
    const name = plain(record.name) || keyName.trim();
    const nameOnly = !hasKeys(record.traits) && !hasKeys(record.state);
    add(`continuity.characters:${keyName || name}`, 'character', name, nameOnly, trackedCharacterLines(record), record);
  }

  for (const { record } of recordsOf(data.locations)) {
    const name = plain(record.name);
    add(`locations:${idOrName(record, name)}`, 'location', name, false, locationLines(record), record);
  }

  for (const { record, keyName } of recordsOf(continuity.locations)) {
    const name = plain(record.name) || keyName.trim();
    add(`continuity.locations:${keyName || name}`, 'location', name, locationIsNameOnly(record), locationLines(record), record);
  }

  for (const { record } of recordsOf(data.plotThreads)) {
    const name = plain(record.name);
    add(`plotThreads:${idOrName(record, name)}`, 'thread', name, false, threadLines(record, name), record);
  }

  return items;
}

function pendingItems(project) {
  const handled = new Set(project && Array.isArray(project.codexLegacyHandled) ? project.codexLegacyHandled : []);
  return legacyItems(project).filter(item => !handled.has(item.key));
}

/**
 * Old records that have not been offered to Tarinakansio yet.
 * kind is 'character', 'location' or 'thread'.
 * @returns {{ items: Array<{key, kind, name, nameOnly}>, full: number, nameOnly: number }}
 */
function pendingLegacy(project) {
  const items = pendingItems(project).map(({ key, kind, name, nameOnly }) => ({ key, kind, name, nameOnly }));
  const nameOnly = items.filter(item => item.nameOnly).length;
  return { items, full: items.length - nameOnly, nameOnly };
}

const LEGACY_TYPES = {
  fiction: { character: 'hahmo', location: 'paikka', thread: 'juonilanka' },
  nonfiction: { character: 'henkilo', location: 'termi', thread: 'termi' }
};

/**
 * Turn the pending old records into entries. The project is not changed:
 * the caller appends `entries` to project.codex and `handled` to
 * project.codexLegacyHandled. Because every pending key is in `handled`, a
 * second run imports nothing and a deleted entry does not come back.
 *
 * opts: { includeNameOnly = false, now, makeId }
 * @returns {{ entries: object[], handled: string[], counts: { imported, duplicates, nameOnlySkipped } }}
 */
function migrateLegacy(project, opts = {}) {
  const { includeNameOnly = false, now = new Date().toISOString(), makeId = defaultMakeId } = opts;
  const types = LEGACY_TYPES[projectKind(project)];
  const sameThing = (type, name) => `${type}\n${name.toLowerCase()}`;

  const existing = project && Array.isArray(project.codex) ? project.codex.filter(isRecord) : [];
  const inFolder = new Set(existing.map(entry => sameThing(typeOf(entry), asText(entry.name).trim())));
  const usedIds = new Set(existing.map(entry => entry.id));

  const entries = [];
  const inBatch = new Map();
  const handled = [];
  const counts = { imported: 0, duplicates: 0, nameOnlySkipped: 0 };

  for (const item of pendingItems(project)) {
    handled.push(item.key);
    // Bare names are left out first, so the count matches what pendingLegacy announced
    if (item.nameOnly && !includeNameOnly) {
      counts.nameOnlySkipped += 1;
      continue;
    }

    const type = types[item.kind];
    const identity = sameThing(type, item.name);
    if (inFolder.has(identity)) {
      counts.duplicates += 1;
      continue;
    }
    if (inBatch.has(identity)) {
      // The same thing from a second store: keep one entry, and take the text the first one lacked
      const earlier = inBatch.get(identity);
      if (!earlier.description && item.description) earlier.description = item.description;
      if (!earlier.notes && item.notes) earlier.notes = item.notes;
      counts.duplicates += 1;
      continue;
    }

    const entry = createEntry({
      id: unusedId(usedIds, makeId),
      type,
      name: item.name,
      aliases: [],
      exclude: [],
      description: item.description,
      notes: item.notes,
      state: 'manual',
      source: { key: item.key }
    }, { project, now });
    usedIds.add(entry.id);
    inBatch.set(identity, entry);
    entries.push(entry);
    counts.imported += 1;
  }

  return { entries, handled, counts };
}

/** A copy of a research note as an entry that is not sent until the author says so. */
function entryFromResearchNote(item, project, opts = {}) {
  const note = isRecord(item) ? item : {};
  return createEntry({
    type: projectKind(project) === 'nonfiction' ? 'termi' : 'kasite',
    name: asText(note.title),
    description: asText(note.content),
    notes: '',
    state: 'never',
    source: { key: `research:${note.id}` }
  }, { ...opts, project });
}

/** The entry that was made from a legacy record or a research note, or null. */
function findBySource(entries, key) {
  return (entries || []).find(entry => isRecord(entry) && isRecord(entry.source) && entry.source.key === key) || null;
}

module.exports = {
  TYPES,
  TYPE_LABELS,
  TYPE_PLURALS,
  STATES,
  STATE_LABELS,
  projectKind,
  folderName,
  typesFor,
  createEntry,
  normalizeEntry,
  normalizeCodex,
  updateEntry,
  removeEntry,
  prepareEntries,
  matchPrepared,
  matchEntries,
  countMentions,
  selectForContext,
  formatEntry,
  pendingLegacy,
  migrateLegacy,
  entryFromResearchNote,
  findBySource,
  // Stage I-07: the section's list (src/components/CodexPanel.js draws it)
  FILTER_FROM,
  listGroups
};

/**
 * @jest-environment node
 */
const {
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
  findBySource
} = require('../../src/services/story/codex');

const NOW = '2026-11-17T10:00:00.000Z';

// Ids 'cx-1', 'cx-2', … so that results can be compared whole
function counter() {
  let next = 0;
  return () => `cx-${++next}`;
}

function entry(fields) {
  return { type: 'hahmo', aliases: [], exclude: [], description: 'Kuvaus.', notes: '', state: 'mentioned', ...fields };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

const texts = (result) => result.matches.map(match => match.text);

describe('shape', () => {
  test('typesFor: fiction and nonfiction', () => {
    expect(typesFor({ genre: 'fantasy' })).toEqual(['hahmo', 'paikka', 'esine', 'kasite', 'juonilanka']);
    expect(typesFor({})).toEqual(TYPES.fiction);
    expect(typesFor(undefined)).toEqual(TYPES.fiction);
    expect(typesFor({ genre: 'nonfiction' })).toEqual(['termi', 'henkilo', 'lahde']);

    expect(projectKind({ genre: 'nonfiction' })).toBe('nonfiction');
    expect(projectKind({ genre: 'literary' })).toBe('fiction');
    expect(projectKind({ genre: 'Nonfiction' })).toBe('fiction');
    expect(projectKind(null)).toBe('fiction');

    // Every type has both labels
    for (const type of [...TYPES.fiction, ...TYPES.nonfiction]) {
      expect(typeof TYPE_LABELS[type]).toBe('string');
      expect(typeof TYPE_PLURALS[type]).toBe('string');
    }
    // The labels reach the screen: every one is pinned
    expect(TYPE_LABELS).toEqual({
      hahmo: 'Hahmo',
      paikka: 'Paikka',
      esine: 'Esine',
      kasite: 'Käsite',
      juonilanka: 'Juonilanka',
      termi: 'Termi',
      henkilo: 'Henkilö',
      lahde: 'Lähde'
    });
    expect(TYPE_PLURALS).toEqual({
      hahmo: 'Hahmot',
      paikka: 'Paikat',
      esine: 'Esineet',
      kasite: 'Käsitteet',
      juonilanka: 'Juonilangat',
      termi: 'Termit',
      henkilo: 'Henkilöt',
      lahde: 'Lähteet'
    });
    expect(STATES).toEqual(['always', 'mentioned', 'manual', 'never']);
    expect(STATE_LABELS).toEqual({
      always: 'Aina mukana', mentioned: 'Kun mainitaan', manual: 'Vain käsin', never: 'Ei koskaan'
    });
  });

  test('folderName: Tarinakansio and Käsikirjoituksen kansio', () => {
    expect(folderName({ genre: 'fiction' })).toBe('Tarinakansio');
    expect(folderName(undefined)).toBe('Tarinakansio');
    expect(folderName({ genre: 'nonfiction' })).toBe('Käsikirjoituksen kansio');
  });

  test('createEntry defaults: state mentioned, empty lists, type by project kind', () => {
    expect(createEntry({}, { now: NOW, makeId: () => 'cx-1' })).toEqual({
      id: 'cx-1',
      type: 'hahmo',
      name: '',
      aliases: [],
      exclude: [],
      description: '',
      notes: '',
      state: 'mentioned',
      created: NOW,
      modified: NOW
    });
    expect(createEntry({}, { project: { genre: 'nonfiction' } }).type).toBe('termi');
    expect(createEntry({ name: 'Mari', type: 'paikka', state: 'always' }, { project: { genre: 'fantasy' } }))
      .toMatchObject({ name: 'Mari', type: 'paikka', state: 'always' });

    // The default id: cx-<base36 time>-<four base36 characters>, new every time
    const first = createEntry();
    const second = createEntry();
    expect(first.id).toMatch(/^cx-[0-9a-z]+-[0-9a-z]{4}$/);
    expect(Math.abs(parseInt(first.id.split('-')[1], 36) - Date.now())).toBeLessThan(60000);
    expect(second.id).not.toBe(first.id);
    expect(first.created).toBe(first.modified);
    expect(Number.isNaN(Date.parse(first.created))).toBe(false);
  });

  test('normalizeEntry repairs bad fields, keeps unknown extra fields and a valid source', () => {
    const repaired = normalizeEntry({
      id: 42,
      type: 'lohikäärme',
      name: null,
      aliases: 'Peka, Pekkis; ”Pekka-setä”',
      exclude: ['Pekkala', 7, null],
      description: undefined,
      notes: 12,
      state: 'sometimes',
      created: NOW,
      colour: 'red',
      source: { key: 'characters:char_1' }
    }, { now: '2026-12-01T00:00:00.000Z', makeId: () => 'cx-new' });

    expect(repaired).toEqual({
      id: 'cx-new',
      type: 'kasite',
      name: '',
      aliases: ['Peka', 'Pekkis', '”Pekka-setä”'],
      exclude: ['Pekkala'],
      description: '',
      notes: '',
      state: 'mentioned',
      created: NOW,
      modified: NOW,
      colour: 'red',
      source: { key: 'characters:char_1' }
    });

    // A good entry comes back equal, with its own id
    const good = entry({ id: 'cx-a', name: 'Mari', created: NOW, modified: NOW });
    expect(normalizeEntry(good)).toEqual(good);
    expect(normalizeEntry(good)).not.toBe(good);

    // A source without a string key is dropped; aliases of a wrong type become empty
    expect(normalizeEntry({ id: 'x', source: { key: 5 } })).not.toHaveProperty('source');
    expect(normalizeEntry({ id: 'x', source: 'characters:1' })).not.toHaveProperty('source');
    expect(normalizeEntry({ id: 'x', aliases: { a: 1 } }).aliases).toEqual([]);
    // A type name that is a property of every object is still unknown
    expect(normalizeEntry({ id: 'x', type: 'constructor' }).type).toBe('kasite');

    for (const bad of [null, undefined, 'Mari', 7, ['Mari']]) expect(normalizeEntry(bad)).toBeNull();
  });

  test('normalizeCodex returns [] for a non-array and gives a repeated id a new id', () => {
    expect(normalizeCodex(undefined)).toEqual([]);
    expect(normalizeCodex({ 0: entry({ id: 'a' }) })).toEqual([]);
    expect(normalizeCodex('x')).toEqual([]);

    const list = normalizeCodex([
      entry({ id: 'a', name: 'Mari' }),
      null,
      'roskaa',
      entry({ id: 'a', name: 'Pekka' }),
      entry({ id: 'b', name: 'Satama' })
    ], { now: NOW, makeId: counter() });

    expect(list.map(item => item.name)).toEqual(['Mari', 'Pekka', 'Satama']);
    expect(list[0].id).toBe('a');
    expect(list[1].id).toBe('cx-1');
    expect(list[2].id).toBe('b');
    expect(new Set(list.map(item => item.id)).size).toBe(3);

    // A generator that keeps repeating itself still ends with distinct ids
    const stubborn = normalizeCodex([{ name: 'A' }, { name: 'B' }, { name: 'C' }], { makeId: () => 'sama' });
    expect(new Set(stubborn.map(item => item.id)).size).toBe(3);
  });

  test('updateEntry returns a new array and a new entry object and sets modified', () => {
    const list = [entry({ id: 'a', name: 'Mari', modified: NOW }), entry({ id: 'b', name: 'Pekka', modified: NOW })];
    const next = updateEntry(list, 'a', { description: 'Uusi kuvaus.', id: 'vaihdettu' }, '2026-11-18T08:00:00.000Z');

    expect(next).not.toBe(list);
    expect(next[0]).not.toBe(list[0]);
    expect(next[1]).toBe(list[1]);
    expect(next[0]).toMatchObject({ id: 'a', name: 'Mari', description: 'Uusi kuvaus.', modified: '2026-11-18T08:00:00.000Z' });
    // The old list is untouched
    expect(list[0]).toMatchObject({ description: 'Kuvaus.', modified: NOW });

    // Without a time the clock is used; an unknown id changes nothing but still copies the list
    expect(Math.abs(Date.parse(updateEntry(list, 'b', { name: 'Pekko' })[1].modified) - Date.now())).toBeLessThan(60000);
    const same = updateEntry(list, 'zzz', { name: 'x' });
    expect(same).toEqual(list);
    expect(same).not.toBe(list);
  });

  test('removeEntry removes one', () => {
    const list = [entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })];
    const next = removeEntry(list, 'b');
    expect(next.map(item => item.id)).toEqual(['a', 'c']);
    expect(list).toHaveLength(3);
    expect(removeEntry(list, 'zzz')).toEqual(list);
    expect(removeEntry(undefined, 'a')).toEqual([]);
  });
});

describe('matchEntries', () => {
  test('the name is a stem: Mari counts Mari, Maria, Marin', () => {
    const result = matchEntries('Mari tuli. Maria ei näkynyt, mutta Marin takki oli naulassa.', [entry({ id: 'a', name: 'Mari' })]);
    expect(texts(result)).toEqual(['Mari', 'Maria', 'Marin']);
    expect(result.counts).toEqual({ a: 3 });
    expect(result.matches[0]).toEqual({ entryId: 'a', start: 0, end: 4, text: 'Mari' });
  });

  test('an alias as stem for consonant gradation: Pekka with Peka counts Pekka, Pekan, Pekalle', () => {
    const text = 'Pekka antoi Pekan kirjan Pekalle.';
    expect(matchEntries(text, [entry({ id: 'c', name: 'Pekka' })]).counts.c).toBe(1);
    const result = matchEntries(text, [entry({ id: 'c', name: 'Pekka', aliases: ['Peka'] })]);
    expect(texts(result)).toEqual(['Pekka', 'Pekan', 'Pekalle']);
    expect(result.counts.c).toBe(3);
  });

  test('the exclusion list: Mariannen is not counted for Mari', () => {
    const text = 'Mari näki Mariannen ja Marian.';
    expect(matchEntries(text, [entry({ id: 'a', name: 'Mari' })]).counts.a).toBe(3);
    const result = matchEntries(text, [entry({ id: 'a', name: 'Mari', exclude: ['Marianne'] })]);
    expect(texts(result)).toEqual(['Mari', 'Marian']);
    expect(result.counts.a).toBe(2);
  });

  test('two entries on the same words: the longest match wins and nothing is counted twice', () => {
    const entries = [
      entry({ id: 'mari', name: 'Mari' }),
      entry({ id: 'virtanen', name: 'Mari Virtanen', aliases: ['Mari Virtase'] })
    ];
    const result = matchEntries('Mari Virtasen talo ja Mari. Mari Virtanen tuli.', entries);
    expect(result.matches).toEqual([
      { entryId: 'virtanen', start: 0, end: 13, text: 'Mari Virtasen' },
      { entryId: 'mari', start: 22, end: 26, text: 'Mari' },
      { entryId: 'virtanen', start: 28, end: 41, text: 'Mari Virtanen' }
    ]);
    expect(result.counts).toEqual({ mari: 1, virtanen: 2 });

    // Two entries with the very same name: the first in the list gets the match
    const twins = matchEntries('Satama oli hiljainen.', [entry({ id: 'x', name: 'Satama' }), entry({ id: 'y', name: 'Satama' })]);
    expect(twins.counts).toEqual({ x: 1, y: 0 });

    for (let index = 1; index < result.matches.length; index++) {
      expect(result.matches[index].start).toBeGreaterThanOrEqual(result.matches[index - 1].end);
    }
  });

  test('counts has a key for every entry', () => {
    const result = matchEntries('Ei ketään täällä.', [
      entry({ id: 'a', name: 'Mari' }),
      entry({ id: 'b', name: 'Satama' }),
      entry({ id: 'c', name: '' })
    ]);
    expect(result.counts).toEqual({ a: 0, b: 0, c: 0 });
    expect(result.forms).toEqual({ a: [], b: [], c: [] });
    expect(result.matches).toEqual([]);

    // Also for an empty text
    expect(matchEntries('', [entry({ id: 'a', name: 'Mari' })])).toEqual({ matches: [], counts: { a: 0 }, forms: { a: [] } });
    expect(matchEntries(undefined, [])).toEqual({ matches: [], counts: {}, forms: {} });
  });

  test('forms lists the matched spellings with counts, most frequent first', () => {
    const result = matchEntries('Marin takki. Mari tuli. Marin hattu. Marille, Marin ja Maria. Mari.', [entry({ id: 'a', name: 'Mari' })]);
    expect(result.forms.a).toEqual([
      { form: 'Marin', count: 3 },
      { form: 'Mari', count: 2 },
      // Equal counts are in alphabetical order
      { form: 'Maria', count: 1 },
      { form: 'Marille', count: 1 }
    ]);
    expect(result.counts.a).toBe(7);
  });

  test('names with ä and ö after a dialogue dash and inside ” ”: "– Äiti, missä Öljymäki on?"', () => {
    const entries = [entry({ id: 'aiti', name: 'Äiti', aliases: ['Äidi'] }), entry({ id: 'maki', type: 'paikka', name: 'Öljymäki', aliases: ['Öljymäe'] })];
    const result = matchEntries('– Äiti, missä Öljymäki on?\n”Öljymäellä”, Äidin ääni sanoi. ”Äiti!”', entries);
    expect(texts(result)).toEqual(['Äiti', 'Öljymäki', 'Öljymäellä', 'Äidin', 'Äiti']);
    expect(result.counts).toEqual({ aiti: 3, maki: 2 });
    expect(result.matches[0]).toEqual({ entryId: 'aiti', start: 2, end: 6, text: 'Äiti' });
  });

  test('TODO markers are skipped by default and counted with skipTodo false', () => {
    const text = 'Mari tuli. [TODO: kysy Marilta, missä Satama on] Satama oli hiljainen.';
    const entries = [entry({ id: 'a', name: 'Mari' }), entry({ id: 'b', name: 'Satama' })];
    expect(matchEntries(text, entries).counts).toEqual({ a: 1, b: 1 });
    expect(matchEntries(text, entries, { skipTodo: false }).counts).toEqual({ a: 2, b: 2 });
    // An unclosed marker protects nothing
    expect(matchEntries('[TODO: kysy Marilta', entries).counts.a).toBe(1);
  });

  test('a name inside `<u>` tags is counted', () => {
    const result = matchEntries('Tämä on <u>Marin</u> kirja.', [entry({ id: 'a', name: 'Mari' })]);
    expect(result.matches).toEqual([{ entryId: 'a', start: 11, end: 16, text: 'Marin' }]);
  });

  test('a name in italics is counted, and a spelling is one form however its letters are encoded', () => {
    const italic = matchEntries('He nousivat _Auroran_ kannelle. _Aurora_ oli vanha laiva.', [entry({ id: 'a', type: 'esine', name: 'Aurora' })]);
    expect(italic.matches).toEqual([
      { entryId: 'a', start: 13, end: 20, text: 'Auroran' },
      { entryId: 'a', start: 33, end: 39, text: 'Aurora' }
    ]);

    // The same word once with "Ä" as one character and once as "A" and a combining diaeresis
    const text = `Äiti tuli. ${'Äiti'.normalize('NFD')} lähti.`;
    const result = matchEntries(text, [entry({ id: 'aiti', name: 'Äiti' })]);
    expect(result.counts).toEqual({ aiti: 2 });
    expect(result.forms).toEqual({ aiti: [{ form: 'Äiti', count: 2 }] });
    // A match is the text as it stands
    expect(result.matches[1]).toEqual({ entryId: 'aiti', start: 11, end: 16, text: 'Äiti'.normalize('NFD') });
    expect(countMentions([{ id: 'c1', content: text }], [entry({ id: 'aiti', name: 'Äiti' })]).forms).toEqual({ aiti: [{ form: 'Äiti', count: 2 }] });
  });

  test('an entry in state never is still matched', () => {
    const result = matchEntries('Aino ja Mari.', [
      entry({ id: 'e', name: 'Aino', state: 'never' }),
      entry({ id: 'd', name: 'Mari', state: 'manual', description: '' })
    ]);
    expect(result.counts).toEqual({ e: 1, d: 1 });
  });

  test('an entry without a name and aliases never matches', () => {
    const entries = [entry({ id: 'x', name: '' }), entry({ id: 'y', name: '   ', aliases: ['...', ''] }), entry({ id: 'z', name: '', aliases: ['Zorro'] })];
    const result = matchEntries('Mikä tahansa teksti, jossa on sanoja ja Zorro.', entries);
    expect(result.counts).toEqual({ x: 0, y: 0, z: 1 });
  });

  test('matchPrepared gives the same result as matchEntries, and an unchanged entry is compiled once', () => {
    const entries = [entry({ id: 'a', name: 'Mari', exclude: ['Marianne'] }), entry({ id: 'b', name: 'Satama', aliases: ['satama'] })];
    const text = 'Mari käveli satamaan. Marianne jäi.';
    const prepared = prepareEntries(entries);
    expect(matchPrepared(text, prepared)).toEqual(matchEntries(text, entries));
    expect(matchPrepared(text, prepared).counts).toEqual({ a: 1, b: 1 });

    // The cache is per entry object: the same object gives the same compiled item
    const again = prepareEntries([entries[1], entries[0]]);
    expect(again[0]).toBe(prepared[1]);
    expect(again[1]).toBe(prepared[0]);
    // An edited entry is a new object and is compiled anew
    const edited = updateEntry(entries, 'a', { name: 'Maija' }, NOW);
    expect(matchEntries('Maija ja Mari.', edited).counts).toEqual({ a: 1, b: 0 });

    expect(prepared[0].label).toBe('Mari · hahmo · Kun mainitaan');
    expect(prepareEntries([entry({ id: 'k', type: 'kasite', name: 'Perintö', state: 'always' })])[0].label).toBe('Perintö · käsite · Aina mukana');
    expect(prepareEntries(undefined)).toEqual([]);
    expect(prepareEntries([null, 'x'])).toEqual([]);
  });
});

describe('countMentions', () => {
  test('totals, per chapter and merged forms; a noAI chapter is counted', () => {
    const entries = [entry({ id: 'a', name: 'Mari' }), entry({ id: 'b', name: 'Satama', aliases: ['satama'] })];
    const chapters = [
      { id: 'c1', content: 'Mari tuli satamaan. Marin laukku.' },
      { id: 'c2', content: 'Satama. Mari ja Marin veli.', noAI: true },
      { id: 'c3', content: '' },
      { id: 'c4' }
    ];
    const result = countMentions(chapters, entries);

    expect(result.total).toEqual({ a: 4, b: 2 });
    expect(result.byChapter).toEqual({
      c1: { a: 2, b: 1 },
      c2: { a: 2, b: 1 },
      c3: { a: 0, b: 0 },
      c4: { a: 0, b: 0 }
    });
    expect(result.forms).toEqual({
      a: [{ form: 'Mari', count: 2 }, { form: 'Marin', count: 2 }],
      b: [{ form: 'Satama', count: 1 }, { form: 'satamaan', count: 1 }]
    });

    expect(countMentions([], entries)).toEqual({ total: { a: 0, b: 0 }, byChapter: {}, forms: { a: [], b: [] } });
    expect(countMentions(undefined, undefined)).toEqual({ total: {}, byChapter: {}, forms: {} });
  });
});

describe('selectForContext', () => {
  const entries = [
    entry({ id: 'a', name: 'Mari', state: 'always' }),
    entry({ id: 'b', type: 'paikka', name: 'Satama', aliases: ['satama'], state: 'mentioned' }),
    entry({ id: 'c', name: 'Pekka', aliases: ['Peka'], state: 'mentioned' }),
    entry({ id: 'd', type: 'esine', name: 'Kirje', state: 'manual' }),
    entry({ id: 'e', name: 'Aino', state: 'never' }),
    entry({ id: 'f', name: 'Saari', state: 'always' }),
    entry({ id: 'g', name: 'Lokki', state: 'mentioned' })
  ];
  const ids = (list) => list.map(item => item.id);

  test('always entries in list order', () => {
    const result = selectForContext({ entries, text: '' });
    expect(ids(result.always)).toEqual(['a', 'f']);
    expect(result.always[0]).toBe(entries[0]);
    expect(ids(result.mentioned)).toEqual([]);
    expect(ids(result.manual)).toEqual([]);
    // An always entry is not also a manual one when it is included by hand
    const included = selectForContext({ entries, text: '', include: ['codex:a'] });
    expect(ids(included.always)).toEqual(['a', 'f']);
    expect(ids(included.manual)).toEqual([]);
  });

  test('mentioned entries only when the text mentions them, most mentions first', () => {
    const result = selectForContext({ entries, text: 'Pekan ääni kuului satamasta. Satama oli hiljainen, satamassa ei ollut ketään.' });
    expect(ids(result.mentioned)).toEqual(['b', 'c']);
    expect(result.mentionCounts).toMatchObject({ b: 3, c: 1, g: 0, a: 0 });

    // Equal counts: the one mentioned first comes first
    const tie = selectForContext({ entries, text: 'Lokki lensi Pekan yli satamaan.' });
    expect(ids(tie.mentioned)).toEqual(['g', 'c', 'b']);

    // Kirje is mentioned but its state is manual; Aino's is never
    const others = selectForContext({ entries, text: 'Kirje oli Ainon pöydällä.' });
    expect(ids(others.mentioned)).toEqual([]);
    expect(others.mentionCounts).toMatchObject({ d: 1, e: 1 });
  });

  test('an entry that cannot be sent does not hide a mention of one that can', () => {
    // A bare name left by the migration (no description, earlier in the list) and the entry the author wrote later
    const migrated = [
      entry({ id: 'old', name: 'Mari', state: 'manual', description: '' }),
      entry({ id: 'new', name: 'Mari Virtanen', aliases: ['Mari'], description: 'Vanhin sisar.' })
    ];
    const first = selectForContext({ entries: migrated, text: 'Mari tuli.' });
    expect(ids(first.mentioned)).toEqual(['new']);
    // The counts stay the folder's own: there the first entry in the list owns the word
    expect(first.mentionCounts).toEqual({ old: 1, new: 0 });

    // A copied research note (state never) before an entry of the same name
    const copied = [
      entry({ id: 'note', type: 'kasite', name: 'Majakka', state: 'never' }),
      entry({ id: 'place', type: 'paikka', name: 'Majakka' })
    ];
    expect(ids(selectForContext({ entries: copied, text: 'Majakka näkyi kauas.' }).mentioned)).toEqual(['place']);

    // An entry switched off for this request does not take the words with it
    const pair = [entry({ id: 'mv', name: 'Mari Virtanen' }), entry({ id: 'm', name: 'Mari' })];
    expect(ids(selectForContext({ entries: pair, text: 'Mari Virtanen tuli.' }).mentioned)).toEqual(['mv']);
    expect(ids(selectForContext({ entries: pair, text: 'Mari Virtanen tuli.', exclude: ['codex:mv'] }).mentioned)).toEqual(['m']);

    // Among the entries that can be sent, the longest match still wins and the order is by their own counts
    const order = selectForContext({ entries: [...migrated, entry({ id: 'p', name: 'Pekka' })], text: 'Pekka ja Mari. Pekka nauroi.' });
    expect(ids(order.mentioned)).toEqual(['p', 'new']);
  });

  test('manual entries only through include, in include order', () => {
    expect(ids(selectForContext({ entries, text: 'Kirje.' }).manual)).toEqual([]);
    const result = selectForContext({ entries, text: 'Lokki.', include: ['codex:g', 'codex:d', 'summary:c1', 'codex:zzz', 'codex:d', 7] });
    expect(ids(result.manual)).toEqual(['g', 'd']);
    // An entry added by hand is not listed among the mentioned ones as well
    expect(ids(result.mentioned)).toEqual([]);
  });

  test('a never entry is not returned even when included', () => {
    const result = selectForContext({ entries, text: 'Aino tuli.', include: ['codex:e'] });
    expect(ids([...result.always, ...result.mentioned, ...result.manual])).not.toContain('e');
  });

  test('an entry with an empty description is not returned', () => {
    const list = [
      entry({ id: 'a', name: 'Mari', state: 'always', description: '   ' }),
      entry({ id: 'b', name: 'Satama', state: 'mentioned', description: '' }),
      entry({ id: 'd', name: 'Kirje', state: 'manual', description: '\n' }),
      entry({ id: 'n', name: '  ', state: 'always' })
    ];
    const result = selectForContext({ entries: list, text: 'Mari, Satama ja Kirje.', include: ['codex:d'] });
    expect(result.always).toEqual([]);
    expect(result.mentioned).toEqual([]);
    expect(result.manual).toEqual([]);
  });

  test('exclude removes one entry by key', () => {
    const text = 'Pekka meni satamaan.';
    const result = selectForContext({ entries, text, include: ['codex:d'], exclude: ['codex:a', 'codex:c', 'codex:d', 'style'] });
    expect(ids(result.always)).toEqual(['f']);
    expect(ids(result.mentioned)).toEqual(['b']);
    expect(ids(result.manual)).toEqual([]);
  });

  test('detectMentions false: mentioned is empty and a mentioned-state entry can still be included by hand', () => {
    const text = 'Pekka meni satamaan.';
    const result = selectForContext({ entries, text, include: ['codex:c'], detectMentions: false });
    expect(ids(result.mentioned)).toEqual([]);
    expect(ids(result.manual)).toEqual(['c']);
    expect(ids(result.always)).toEqual(['a', 'f']);
    expect(result.mentionCounts).toEqual({});
  });

  test('missing lists do not throw', () => {
    expect(selectForContext({})).toEqual({ always: [], mentioned: [], manual: [], mentionCounts: {} });
    expect(selectForContext()).toEqual({ always: [], mentioned: [], manual: [], mentionCounts: {} });
  });
});

describe('formatEntry', () => {
  test('name, lowercase type label and description; aliases, exclusions and notes never appear', () => {
    const line = formatEntry(entry({
      id: 'a',
      type: 'kasite',
      name: '  Öljymäki ',
      aliases: ['ALIAS-SANA'],
      exclude: ['POISSULJETTU'],
      description: ' Kukkula kylän laidalla.\nSiellä on vanha torni. ',
      notes: 'SALAINEN muistiinpano'
    }));
    expect(line).toBe('Öljymäki (käsite): Kukkula kylän laidalla.\nSiellä on vanha torni.');
    expect(line).not.toMatch(/ALIAS|POISSULJETTU|SALAINEN/);
    expect(formatEntry(entry({ type: 'henkilo', name: 'Aino Älvä', description: 'Tutkija.' }))).toBe('Aino Älvä (henkilö): Tutkija.');
  });
});

describe('migration', () => {
  const opts = () => ({ now: NOW, makeId: counter() });

  test('a flat character becomes a hahmo with Finnish field lines', () => {
    const project = {
      characters: [{
        id: 'char_1',
        name: ' Mari Virtanen ',
        description: 'Vanhin sisar.',
        age: 41,
        occupation: 'merikapteeni',
        background: 'Kasvoi saarella.',
        appearance: 'Pitkä, harmaat silmät.',
        voice: { style: 'Lyhyitä lauseita.', examples: ['– No niin.'] },
        characterArc: { beginning: 'Sulkeutunut', end: 'Antaa anteeksi' },
        psychological: { openness: 0.4 },
        transactional: { parent: 0.7 },
        archetypal: { hero: 0.2 },
        ensemble: { weight: 0.9 },
        notes: 'Muista veneen nimi.'
      }]
    };
    const result = migrateLegacy(project, opts());

    expect(result.entries).toEqual([{
      id: 'cx-1',
      type: 'hahmo',
      name: 'Mari Virtanen',
      aliases: [],
      exclude: [],
      description: [
        'Vanhin sisar.',
        'Ikä: 41',
        'Ammatti: merikapteeni',
        'Tausta: Kasvoi saarella.',
        'Ulkonäkö: Pitkä, harmaat silmät.',
        'Puhetapa: Lyhyitä lauseita.',
        'Kaari: Sulkeutunut → Antaa anteeksi'
      ].join('\n'),
      notes: 'Muista veneen nimi.',
      state: 'manual',
      created: NOW,
      modified: NOW,
      source: { key: 'characters:char_1' }
    }]);
    expect(result.handled).toEqual(['characters:char_1']);
    expect(result.counts).toEqual({ imported: 1, duplicates: 0, nameOnlySkipped: 0 });

    // Empty values and values that are not text leave no line; without an id the key is the name
    const sparse = migrateLegacy({ characters: [{ name: 'Pekka', description: '', age: null, occupation: { a: 1 }, background: '  ', voice: {}, notes: 5 }] }, opts());
    expect(sparse.entries[0]).toMatchObject({ name: 'Pekka', description: '', notes: '', source: { key: 'characters:Pekka' } });
  });

  test('a basicInfo character becomes a hahmo named after basicInfo.name', () => {
    const project = {
      characters: [{
        basicInfo: { name: 'Aino', role: 'päähenkilö', age: 17, tags: ['a'], nickname: '' },
        psychological: 'Varautunut ja tarkka.',
        archetype: 'etsijä'
      }]
    };
    const result = migrateLegacy(project, opts());
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      type: 'hahmo',
      name: 'Aino',
      description: 'role: päähenkilö\nage: 17\nVarautunut ja tarkka.',
      state: 'manual',
      source: { key: 'characters:Aino' }
    });
  });

  test('a continuity character with only a name is name-only and skipped by default', () => {
    const project = {
      continuity: {
        characters: {
          Aamulla: { name: 'Aamulla', appearances: [0, 2], traits: {}, state: {} },
          Mari: { name: 'Mari', appearances: [0], traits: { luonne: 'itsepäinen' }, state: { paikka: 'saari', ikä: 41 } }
        }
      }
    };
    expect(pendingLegacy(project).items).toEqual([
      { key: 'continuity.characters:Aamulla', kind: 'character', name: 'Aamulla', nameOnly: true },
      { key: 'continuity.characters:Mari', kind: 'character', name: 'Mari', nameOnly: false }
    ]);

    const result = migrateLegacy(project, opts());
    expect(result.entries.map(item => item.name)).toEqual(['Mari']);
    expect(result.entries[0].description).toBe('luonne: itsepäinen\npaikka: saari\nikä: 41');
    expect(result.counts).toEqual({ imported: 1, duplicates: 0, nameOnlySkipped: 1 });
    // The skipped one is handled too: it is not offered again
    expect(result.handled).toEqual(['continuity.characters:Aamulla', 'continuity.characters:Mari']);
  });

  test('includeNameOnly imports it with an empty description', () => {
    const project = { continuity: { characters: { Aamulla: { name: 'Aamulla', appearances: [0], traits: {}, state: {} } } } };
    const result = migrateLegacy(project, { ...opts(), includeNameOnly: true });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      type: 'hahmo', name: 'Aamulla', description: '', notes: '', state: 'manual', source: { key: 'continuity.characters:Aamulla' }
    });
    expect(result.counts).toEqual({ imported: 1, duplicates: 0, nameOnlySkipped: 0 });

    // The tracker also lists real characters by their bare names. Left out by default, such a
    // record is one of the skipped names; ticked, it is found to be in the folder already.
    const both = {
      characters: [{ id: 'char_1', name: 'Mari', description: 'Vanhin sisar.' }],
      continuity: { characters: { Mari: { name: 'Mari', traits: {}, state: {} }, Aamulla: { name: 'Aamulla', traits: {}, state: {} } } }
    };
    expect(pendingLegacy(both)).toMatchObject({ full: 1, nameOnly: 2 });
    const unticked = migrateLegacy(both, opts());
    expect(unticked.entries.map(item => item.name)).toEqual(['Mari']);
    expect(unticked.counts).toEqual({ imported: 1, duplicates: 0, nameOnlySkipped: 2 });
    const ticked = migrateLegacy(both, { ...opts(), includeNameOnly: true });
    expect(ticked.entries.map(item => item.name)).toEqual(['Mari', 'Aamulla']);
    expect(ticked.entries[0].description).toBe('Vanhin sisar.');
    expect(ticked.counts).toEqual({ imported: 2, duplicates: 1, nameOnlySkipped: 0 });
    expect(ticked.handled).toEqual(unticked.handled);
  });

  test('project.locations and continuity.locations with the same name become one entry', () => {
    const project = {
      locations: [{ id: 'loc_1', name: 'Satama', description: '' }],
      continuity: {
        locations: {
          satama: { id: 'loc_9', name: 'SATAMA', description: 'Pieni kalasatama saaren eteläkärjessä.', notes: 'Kartta kansiossa.' },
          Majakka: { name: 'Majakka', firstMentioned: 1, appearances: [1], descriptions: [] }
        }
      }
    };
    const result = migrateLegacy(project, opts());

    expect(result.entries).toHaveLength(1);
    // The first store names the entry; the description it lacked comes from the second
    expect(result.entries[0]).toMatchObject({
      type: 'paikka',
      name: 'Satama',
      description: 'Pieni kalasatama saaren eteläkärjessä.',
      notes: 'Kartta kansiossa.',
      source: { key: 'locations:loc_1' }
    });
    expect(result.counts).toEqual({ imported: 1, duplicates: 1, nameOnlySkipped: 1 });
    expect(result.handled).toEqual(['locations:loc_1', 'continuity.locations:satama', 'continuity.locations:Majakka']);

    // A description that is already there is not replaced by the later one
    const kept = migrateLegacy({
      locations: [{ name: 'Satama', description: 'Ensimmäinen kuvaus.' }],
      continuity: { locations: { Satama: { name: 'Satama', description: 'Toinen kuvaus.' } } }
    }, opts());
    expect(kept.entries.map(item => item.description)).toEqual(['Ensimmäinen kuvaus.']);
  });

  test('location form fields go to the description, notes go to notes, enum values use Finnish labels', () => {
    const project = {
      continuity: {
        locations: {
          Kaupunki: {
            id: 'loc_2',
            name: 'Kaupunki',
            type: 'city',
            atmosphere: 'tense',
            description: 'Satamakaupunki mantereella.',
            importance: 'major',
            associatedCharacters: ['Mari'],
            sensoryDetails: { visual: 'Harmaita kattoja.', auditory: 'Lokkien huutoa.', olfactory: 'Tervaa.', tactile: 'Karheaa kiveä.' },
            historicalContext: 'Paloi 1827.',
            symbolicMeaning: 'Paluu.',
            notes: 'Tarkista vuosiluku.'
          },
          Suo: { name: 'Suo', type: 'räme', atmosphere: 'eerie', descriptions: ['Sumuinen suo.', '', 'Pitkospuut lahoavat.'] }
        }
      }
    };
    const result = migrateLegacy(project, opts());

    expect(result.entries[0]).toMatchObject({
      type: 'paikka',
      name: 'Kaupunki',
      description: [
        'Satamakaupunki mantereella.',
        'Tyyppi: Kaupunki',
        'Tunnelma: Jännittävä',
        'Näkö: Harmaita kattoja.',
        'Kuulo: Lokkien huutoa.',
        'Haju: Tervaa.',
        'Tunto: Karheaa kiveä.',
        'Historia: Paloi 1827.',
        'Merkitys: Paluu.'
      ].join('\n'),
      notes: 'Tarkista vuosiluku.'
    });
    // An unknown enum value is written as it is; the tracker's descriptions come one per line
    expect(result.entries[1].description).toBe('Tyyppi: räme\nTunnelma: Aavemainen\nSumuinen suo.\nPitkospuut lahoavat.');
    expect(result.entries[1].notes).toBe('');
    expect(pendingLegacy(project)).toMatchObject({ full: 2, nameOnly: 0 });

    // An empty sense leaves no line
    const noTouch = migrateLegacy({ locations: [{ name: 'Ranta', sensoryDetails: { visual: 'Hiekkaa.', tactile: '  ' } }] }, opts());
    expect(noTouch.entries[0].description).toBe('Näkö: Hiekkaa.');
  });

  test('every value of the old forms\' lists is written with its Finnish label', () => {
    // A literal copy of the 26 pairs in src/utils/constants.js (LOCATION_TYPES,
    // LOCATION_ATMOSPHERES, THREAD_TYPES, THREAD_STATUS)
    const LOCATION_TYPES = {
      home: 'Koti',
      city: 'Kaupunki',
      nature: 'Luonto',
      building: 'Rakennus',
      vehicle: 'Ajoneuvo',
      fantasy: 'Fantasiamaailma',
      other: 'Muu'
    };
    const LOCATION_ATMOSPHERES = {
      peaceful: 'Rauhallinen',
      tense: 'Jännittävä',
      mysterious: 'Mystinen',
      dangerous: 'Vaarallinen',
      cozy: 'Viihtyisä',
      eerie: 'Aavemainen',
      busy: 'Vilkas',
      abandoned: 'Hylätty'
    };
    const THREAD_TYPES = {
      main_plot: 'Pääjuoni',
      subplot: 'Sivujuoni',
      character_arc: 'Hahmon kehityskaari',
      theme: 'Teema',
      mystery: 'Arvoitus',
      romance: 'Rakkausjuoni'
    };
    const THREAD_STATUS = {
      planned: 'Suunniteltu',
      active: 'Avoin',
      developing: 'Kehittyvä',
      resolved: 'Ratkaistu',
      abandoned: 'Hylätty'
    };
    const pairs = [LOCATION_TYPES, LOCATION_ATMOSPHERES, THREAD_TYPES, THREAD_STATUS].flatMap(Object.entries);
    expect(pairs).toHaveLength(26);

    const described = (project) => migrateLegacy(project, opts()).entries[0].description;
    for (const [value, label] of Object.entries(LOCATION_TYPES)) {
      expect(described({ locations: [{ name: 'Paikka', type: value }] })).toBe(`Tyyppi: ${label}`);
    }
    for (const [value, label] of Object.entries(LOCATION_ATMOSPHERES)) {
      expect(described({ locations: [{ name: 'Paikka', atmosphere: value }] })).toBe(`Tunnelma: ${label}`);
    }
    for (const [value, label] of Object.entries(THREAD_TYPES)) {
      expect(described({ plotThreads: [{ name: 'Lanka', type: value }] })).toBe(`Tyyppi: ${label}`);
    }
    for (const [value, label] of Object.entries(THREAD_STATUS)) {
      expect(described({ plotThreads: [{ name: 'Lanka', status: value }] })).toBe(`Tila: ${label}`);
    }

    // The tables are separate: a thread type is not a location type, and "abandoned" is in two of them
    expect(described({ locations: [{ name: 'Paikka', type: 'subplot', atmosphere: 'abandoned' }] })).toBe('Tyyppi: subplot\nTunnelma: Hylätty');
    expect(described({ plotThreads: [{ name: 'Lanka', type: 'city', status: 'abandoned' }] })).toBe('Tyyppi: city\nTila: Hylätty');
  });

  test('a plot thread whose description equals its name does not repeat it; type and status in Finnish', () => {
    const project = {
      plotThreads: [
        { id: 'thread-1', name: 'Kadonnut kirje', description: 'Kadonnut kirje', type: 'subplot', status: 'active', priority: 'medium', developments: [] },
        {
          id: 'thread_2',
          name: 'Perintöriita',
          description: 'Sisarukset riitelevät saaresta.',
          type: 'main_plot',
          status: 'resolved',
          relatedCharacters: ['Mari', 'Pekka'],
          relatedLocations: ['Satama'],
          keyEvents: ['Testamentti luetaan', 'Myrsky'],
          resolution: 'Saari jaetaan.',
          notes: 'Ratkaisu vielä auki?'
        }
      ]
    };
    const result = migrateLegacy(project, opts());

    expect(result.entries[0]).toMatchObject({
      type: 'juonilanka',
      name: 'Kadonnut kirje',
      description: 'Tyyppi: Sivujuoni\nTila: Avoin',
      source: { key: 'plotThreads:thread-1' }
    });
    expect(result.entries[1]).toMatchObject({
      name: 'Perintöriita',
      description: [
        'Sisarukset riitelevät saaresta.',
        'Tyyppi: Pääjuoni',
        'Tila: Ratkaistu',
        'Hahmot: Mari, Pekka',
        'Paikat: Satama',
        'Tapahtumat: Testamentti luetaan; Myrsky',
        'Ratkaisu: Saari jaetaan.'
      ].join('\n'),
      notes: 'Ratkaisu vielä auki?'
    });
  });

  test('migrated entries are in state manual and carry a source key', () => {
    const project = {
      characters: [{ id: 'char_1', name: 'Mari', description: 'Sisar.' }],
      locations: [{ id: 'loc_1', name: 'Satama', description: 'Kalasatama.' }],
      continuity: {
        characters: { Pekka: { name: 'Pekka', traits: { ikä: 30 }, state: {} } },
        locations: { Majakka: { name: 'Majakka', description: 'Vanha majakka.' } }
      },
      plotThreads: [{ id: 'thread-1', name: 'Perintö', description: 'Kuka saa saaren?' }]
    };
    const result = migrateLegacy(project, opts());

    // In the order of the sources
    expect(result.entries.map(item => [item.name, item.type, item.source.key])).toEqual([
      ['Mari', 'hahmo', 'characters:char_1'],
      ['Pekka', 'hahmo', 'continuity.characters:Pekka'],
      ['Satama', 'paikka', 'locations:loc_1'],
      ['Majakka', 'paikka', 'continuity.locations:Majakka'],
      ['Perintö', 'juonilanka', 'plotThreads:thread-1']
    ]);
    for (const item of result.entries) {
      expect(item).toMatchObject({ state: 'manual', aliases: [], exclude: [], created: NOW, modified: NOW });
      expect(findBySource(result.entries, item.source.key)).toBe(item);
    }
    expect(new Set(result.entries.map(item => item.id)).size).toBe(5);
  });

  test('handled keys make a second run import nothing', () => {
    const project = {
      codex: [],
      codexLegacyHandled: [],
      characters: [{ id: 'char_1', name: 'Mari', description: 'Sisar.' }],
      continuity: { characters: { Aamulla: { name: 'Aamulla', traits: {}, state: {} } } }
    };
    const first = migrateLegacy(project, opts());
    expect(first.counts.imported).toBe(1);

    // The author deleted the imported entry afterwards: it does not come back
    const after = { ...project, codex: [], codexLegacyHandled: [...project.codexLegacyHandled, ...first.handled] };
    const second = migrateLegacy(after, opts());
    expect(second).toEqual({ entries: [], handled: [], counts: { imported: 0, duplicates: 0, nameOnlySkipped: 0 } });
    expect(pendingLegacy(after)).toEqual({ items: [], full: 0, nameOnly: 0 });
  });

  test('an existing entry with the same name and type is counted as a duplicate', () => {
    const project = {
      codex: [
        entry({ id: 'cx-old', type: 'hahmo', name: 'mari ', description: 'Kirjoitettu käsin.' }),
        entry({ id: 'cx-place', type: 'paikka', name: 'Pekka' })
      ],
      characters: [
        { id: 'char_1', name: 'Mari', description: 'Vanha kuvaus.' },
        { id: 'char_2', name: 'Pekka', description: 'Veli.' }
      ]
    };
    const result = migrateLegacy(project, opts());

    // Pekka exists only as a place, so the character Pekka is new
    expect(result.entries.map(item => item.name)).toEqual(['Pekka']);
    expect(result.counts).toEqual({ imported: 1, duplicates: 1, nameOnlySkipped: 0 });
    expect(result.handled).toEqual(['characters:char_1', 'characters:char_2']);
    // The existing entry is not rewritten
    expect(project.codex[0].description).toBe('Kirjoitettu käsin.');
  });

  test('the project is not mutated (deep-frozen input)', () => {
    const project = deepFreeze({
      genre: 'fantasy',
      codex: [entry({ id: 'cx-old', name: 'Mari' })],
      codexLegacyHandled: ['plotThreads:thread-0'],
      characters: [
        { id: 'char_1', name: 'Mari', description: 'Sisar.' },
        { id: 'char_2', name: 'Pekka', voice: { style: 'Hiljainen.' }, characterArc: { beginning: 'a', end: 'b' } },
        { basicInfo: { name: 'Aino', role: 'sivuhenkilö' } }
      ],
      locations: [{ id: 'loc_1', name: 'Satama', sensoryDetails: { visual: 'Sumua.' } }],
      continuity: {
        characters: { Pekka: { name: 'Pekka', traits: { a: 'b' }, state: {} }, Illalla: { name: 'Illalla', traits: {}, state: {} } },
        locations: { Satama: { name: 'Satama', descriptions: ['Laituri.'] } }
      },
      plotThreads: [{ id: 'thread-0', name: 'Vanha' }, { id: 'thread-1', name: 'Perintö', keyEvents: ['Myrsky'] }]
    });
    const before = JSON.stringify(project);

    expect(() => pendingLegacy(project)).not.toThrow();
    let result;
    expect(() => { result = migrateLegacy(project, { ...opts(), includeNameOnly: true }); }).not.toThrow();
    expect(JSON.stringify(project)).toBe(before);

    expect(result.entries.map(item => item.name)).toEqual(['Pekka', 'Aino', 'Illalla', 'Satama', 'Perintö']);
    // Satama is in two stores: the first one's description is kept
    expect(result.entries[3].description).toBe('Näkö: Sumua.');
    expect(result.counts).toEqual({ imported: 5, duplicates: 3, nameOnlySkipped: 0 });
    expect(result.handled).not.toContain('plotThreads:thread-0');
  });

  // Tarinakansio's import result (stage I-07) says how many things were already in the folder: what an
  // empty folder would have taken in, less what was taken now. Two old records of one thing count once.
  test('what an empty folder would import, less what is imported, counts the things already in the folder (I-07)', () => {
    const project = {
      codex: [entry({ id: 'cx-old', type: 'hahmo', name: 'Mari' }), entry({ id: 'cx-sea', type: 'paikka', name: 'Satama' })],
      characters: [{ id: 'char_1', name: 'Mari', description: 'Sisar.' }, { id: 'char_2', name: 'Pekka', description: 'Veli.' }],
      locations: [{ id: 'loc_1', name: 'Satama', description: 'Laituri.' }, { id: 'loc_2', name: 'Majakka', description: 'Valo.' }],
      continuity: { locations: { satama: { name: 'SATAMA', description: 'Sama paikka toisessa tallennuksessa.' } } }
    };
    const now = migrateLegacy(project, opts());
    const empty = migrateLegacy({ ...project, codex: [] }, opts());
    // Mari and Satama are in the folder (Satama also from a second store): two things, three records
    expect(now.counts).toEqual({ imported: 2, duplicates: 3, nameOnlySkipped: 0 });
    expect(empty.counts).toEqual({ imported: 4, duplicates: 1, nameOnlySkipped: 0 });
    expect(empty.counts.imported - now.counts.imported).toBe(2);
    // Nothing in the folder: the two records of Satama still make one entry and no "already there"
    const fresh = { ...project, codex: [] };
    expect(migrateLegacy({ ...fresh, codex: [] }, opts()).counts.imported - migrateLegacy(fresh, opts()).counts.imported).toBe(0);
  });

  test('a nonfiction project maps characters to henkilo and the rest to termi', () => {
    const project = {
      genre: 'nonfiction',
      characters: [{ id: 'char_1', name: 'Elias Lönnrot', description: 'Kerääjä.' }],
      locations: [{ id: 'loc_1', name: 'Kajaani', description: 'Kaupunki.' }],
      continuity: { characters: { Castrén: { name: 'Castrén', traits: { ala: 'kielitiede' }, state: {} } } },
      plotThreads: [{ id: 'thread-1', name: 'Runonkeruu', description: 'Matkat itään.' }]
    };
    const result = migrateLegacy(project, opts());
    expect(result.entries.map(item => [item.name, item.type])).toEqual([
      ['Elias Lönnrot', 'henkilo'],
      ['Castrén', 'henkilo'],
      ['Kajaani', 'termi'],
      ['Runonkeruu', 'termi']
    ]);
  });

  test('pendingLegacy counts full and name-only items and ignores handled keys', () => {
    const project = {
      codexLegacyHandled: ['characters:char_2', 'continuity.locations:Ranta'],
      characters: [
        { id: 'char_1', name: 'Mari' },
        { id: 'char_2', name: 'Pekka' },
        { id: 'char_3', name: '   ' },
        { id: 'char_4' },
        'roskaa'
      ],
      locations: [{ name: 'Satama' }],
      continuity: {
        characters: {
          Aamulla: { name: 'Aamulla', traits: {}, state: {} },
          Sitten: { name: 'Sitten', appearances: [1] },
          Aino: { name: 'Aino', traits: {}, state: { mieliala: 'vihainen' } }
        },
        locations: {
          Ranta: { name: 'Ranta', descriptions: [] },
          Luoto: { name: 'Luoto', firstMentioned: 0, appearances: [0], descriptions: [] },
          Kari: { name: 'Kari', sensoryDetails: { visual: '', auditory: 'Kohinaa.' } }
        }
      },
      plotThreads: [{ id: 'thread-1', name: 'Perintö' }]
    };
    const pending = pendingLegacy(project);

    expect(pending.items).toEqual([
      { key: 'characters:char_1', kind: 'character', name: 'Mari', nameOnly: false },
      { key: 'continuity.characters:Aamulla', kind: 'character', name: 'Aamulla', nameOnly: true },
      { key: 'continuity.characters:Sitten', kind: 'character', name: 'Sitten', nameOnly: true },
      { key: 'continuity.characters:Aino', kind: 'character', name: 'Aino', nameOnly: false },
      { key: 'locations:Satama', kind: 'location', name: 'Satama', nameOnly: false },
      { key: 'continuity.locations:Luoto', kind: 'location', name: 'Luoto', nameOnly: true },
      { key: 'continuity.locations:Kari', kind: 'location', name: 'Kari', nameOnly: false },
      { key: 'plotThreads:thread-1', kind: 'thread', name: 'Perintö', nameOnly: false }
    ]);
    expect(pending.full).toBe(5);
    expect(pending.nameOnly).toBe(3);

    expect(pendingLegacy({})).toEqual({ items: [], full: 0, nameOnly: 0 });
    expect(pendingLegacy(undefined)).toEqual({ items: [], full: 0, nameOnly: 0 });
    expect(migrateLegacy(undefined)).toEqual({ entries: [], handled: [], counts: { imported: 0, duplicates: 0, nameOnlySkipped: 0 } });
  });
});

describe('research copy', () => {
  test('entryFromResearchNote: state never, description is the note text, source key research:<id>', () => {
    const item = { id: 'research-1763370000000', type: 'note', title: 'Majakoiden historia', content: 'Suomen vanhin majakka on Utössä.', created: NOW };
    expect(entryFromResearchNote(item, { genre: 'fantasy' }, { now: NOW, makeId: () => 'cx-r' })).toEqual({
      id: 'cx-r',
      type: 'kasite',
      name: 'Majakoiden historia',
      aliases: [],
      exclude: [],
      description: 'Suomen vanhin majakka on Utössä.',
      notes: '',
      state: 'never',
      created: NOW,
      modified: NOW,
      source: { key: 'research:research-1763370000000' }
    });
    expect(entryFromResearchNote(item, { genre: 'nonfiction' }).type).toBe('termi');
    // A link or an image has no text of its own
    expect(entryFromResearchNote({ id: 'research-2', type: 'link', title: 'Lähde', url: 'https://example.org' }, {}))
      .toMatchObject({ name: 'Lähde', description: '', state: 'never', source: { key: 'research:research-2' } });
  });

  test('findBySource finds it and returns null for an unknown key', () => {
    const copy = entryFromResearchNote({ id: 'research-1', title: 'Muistio', content: 'Teksti.' }, {});
    const entries = [entry({ id: 'a', name: 'Mari' }), copy, entry({ id: 'b', name: 'Pekka', source: { key: 'characters:char_2' } })];
    expect(findBySource(entries, 'research:research-1')).toBe(copy);
    expect(findBySource(entries, 'characters:char_2')).toBe(entries[2]);
    expect(findBySource(entries, 'research:research-2')).toBeNull();
    expect(findBySource([], 'research:research-1')).toBeNull();
    expect(findBySource(undefined, 'research:research-1')).toBeNull();
  });
});

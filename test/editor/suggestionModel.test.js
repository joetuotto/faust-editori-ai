/**
 * @jest-environment node
 */
const M = require('../../src/editor/suggestionModel');

// One line, so offsets are easy to state
const SAMPLE = 'Hän sanoi: ”Älä mene.” – Enkä mennyt, vaikka åkerö [TODO: tarkista] oli <u>kypsä</u>.';

const at = (text, word, insert, extra = {}) => {
  const from = text.indexOf(word);
  return { from, to: from + word.length, insert, original: word, ...extra };
};
const insertAt = (pos, insert, extra = {}) => ({ from: pos, to: pos, insert, ...extra });

const typed = (pos, text = 'X') => M.makeMapper([{ from: pos, to: pos, insert: text }]);
const deleted = (from, to) => M.makeMapper([{ from, to, insert: '' }]);
const typeInto = (text, pos, chars = 'X') => text.slice(0, pos) + chars + text.slice(pos);

function applyChanges(text, changes) {
  let out = '';
  let pos = 0;
  for (const change of changes) {
    out += text.slice(pos, change.from) + change.insert;
    pos = change.to;
  }
  return out + text.slice(pos);
}

// Finest word diff for the tests: words and the gaps between them, longest common subsequence
function wordDiff(a, b) {
  const ta = a.match(/\s+|\S+/g) || [];
  const tb = b.match(/\s+|\S+/g) || [];
  const lcs = Array.from({ length: ta.length + 1 }, () => new Array(tb.length + 1).fill(0));
  for (let i = ta.length - 1; i >= 0; i--) {
    for (let j = tb.length - 1; j >= 0; j--) {
      lcs[i][j] = ta[i] === tb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const changes = [];
  let i = 0, j = 0, pos = 0, open = null;
  const edit = () => (open || (open = { from: pos, to: pos, insert: '' }));
  const close = () => { if (open) { changes.push(open); open = null; } };
  while (i < ta.length || j < tb.length) {
    if (i < ta.length && j < tb.length && ta[i] === tb[j]) {
      close();
      pos += ta[i].length; i++; j++;
    } else if (j < tb.length && (i === ta.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      edit().insert += tb[j]; j++;
    } else {
      edit().to += ta[i].length; pos += ta[i].length; i++;
    }
  }
  close();
  return changes;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

const META = { source: 'faust', action: 'quick-edit', actionLabel: 'Tiivistä', instruction: '', provider: 'cherry', model: 'm1', requestLogId: 'r1' };

// The four suggestions most cases use: an insertion and three replacements
const FOUR = [
  at(SAMPLE, 'mennyt', 'lähtenyt'),
  at(SAMPLE, 'sanoi', 'kuiskasi'),
  at(SAMPLE, 'åkerö', 'Åkerö'),
  insertAt(3, ' taas')
];
const REVISED = 'Hän taas kuiskasi: ”Älä mene.” – Enkä lähtenyt, vaikka Åkerö [TODO: tarkista] oli <u>kypsä</u>.';

const propose = (state, docText, changes, extra = {}) => M.reduce(state, { type: 'propose', docText, changes, meta: META, ...extra });
const proposed = (changes = FOUR, extra = {}) => propose(M.createState(), SAMPLE, changes, extra);
const byOriginal = (state, original) => state.items.find(item => item.original === original);
const mapWith = (state, mapper) => M.reduce(state, { type: 'map', mapPos: mapper.mapPos, touchesRange: mapper.touchesRange });
const acceptWith = (state, ids) => {
  const mapper = M.makeMapper(M.acceptChanges(state, ids));
  return M.reduce(state, { type: 'accepted', ids, mapPos: mapper.mapPos, touchesRange: mapper.touchesRange });
};

beforeEach(() => M.resetIds());

describe('ids and constants', () => {
  test('nextId counts per prefix and resetIds starts over', () => {
    expect([M.nextId('s'), M.nextId('s'), M.nextId('g'), M.nextId('s')]).toEqual(['s1', 's2', 'g1', 's3']);
    M.resetIds();
    expect(M.nextId('s')).toBe('s1');
  });

  test('the constants are the ones of the contract', () => {
    expect(M.CONTEXT_CHARS).toBe(16);
    expect(M.REBASE_DIFF_LIMIT).toBe(200000);
  });
});

describe('normalizeChanges', () => {
  test('sorts changes by position and keeps input order for equal positions', () => {
    const { changes, skipped } = M.normalizeChanges('abc def ghi', [
      { from: 8, to: 11, insert: 'GHI' },
      { from: 0, to: 3, insert: 'ABC' },
      { from: 4, to: 4, insert: '1' },
      { from: 4, to: 4, insert: '2' }
    ]);
    expect(skipped).toEqual([]);
    // The two insertions at 4 are one change, first input first
    expect(changes.map(c => [c.from, c.to, c.insert, c.index])).toEqual([
      [0, 3, 'ABC', 1],
      [4, 4, '12', 2],
      [8, 11, 'GHI', 0]
    ]);
  });

  test('skips a change outside the text with reason range', () => {
    const { changes, skipped } = M.normalizeChanges('abc', [
      { from: 2, to: 5, insert: 'x' },
      { from: -1, to: 1, insert: 'x' },
      { from: 2, to: 1, insert: 'x' },
      { from: 0.5, to: 1, insert: 'x' },
      { from: '0', to: 1, insert: 'x' },
      null,
      { from: 3, to: 3, insert: '!' }
    ]);
    expect(skipped).toEqual([0, 1, 2, 3, 4, 5].map(index => ({ index, reason: 'range' })));
    expect(changes.map(c => [c.from, c.to, c.insert])).toEqual([[3, 3, '!']]);
  });

  test('skips a change that would split a surrogate pair with reason range', () => {
    const text = 'a😀b';   // the emoji is two UTF-16 units, at 1 and 2
    const { changes, skipped } = M.normalizeChanges(text, [
      { from: 2, to: 2, insert: 'x' },
      { from: 0, to: 2, insert: 'x' },
      { from: 1, to: 3, insert: ':)' }
    ]);
    expect(skipped).toEqual([{ index: 0, reason: 'range' }, { index: 1, reason: 'range' }]);
    expect(changes.map(c => [c.from, c.to])).toEqual([[1, 3]]);
  });

  test('skips a change whose original does not match the text with reason mismatch', () => {
    const { changes, skipped } = M.normalizeChanges(SAMPLE, [
      { from: 4, to: 9, insert: 'kuiskasi', original: 'sanoo' },
      { from: 30, to: 36, insert: 'lähtenyt', original: 'mennyt' }
    ]);
    expect(skipped).toEqual([{ index: 0, reason: 'mismatch' }]);
    expect(changes).toHaveLength(1);
  });

  test('skips a change that changes nothing with reason noop', () => {
    const { changes, skipped } = M.normalizeChanges(SAMPLE, [
      { from: 0, to: 3, insert: 'Hän' },
      { from: 5, to: 5, insert: '' }
    ]);
    expect(changes).toEqual([]);
    expect(skipped).toEqual([{ index: 0, reason: 'noop' }, { index: 1, reason: 'noop' }]);
  });

  test('merges two changes that touch end to start: "" → ”” becomes one suggestion', () => {
    const text = 'Hän sanoi: "" ja lähti.';
    const open = text.indexOf('"');
    const { changes, skipped } = M.normalizeChanges(text, [
      { from: open + 1, to: open + 2, insert: '”', original: '"' },
      { from: open, to: open + 1, insert: '”', original: '"' }
    ]);
    expect(skipped).toEqual([]);
    expect(changes.map(c => [c.from, c.to, c.insert])).toEqual([[open, open + 2, '””']]);

    // A merge that ends up changing nothing is a no-op
    const swap = M.normalizeChanges('ab', [{ from: 0, to: 1, insert: 'ab' }, { from: 1, to: 2, insert: '' }]);
    expect(swap.changes).toEqual([]);
    expect(swap.skipped).toEqual([{ index: 0, reason: 'noop' }]);
  });

  test('skips the later of two overlapping changes with reason overlap', () => {
    const { changes, skipped } = M.normalizeChanges(SAMPLE, [
      { from: 6, to: 12, insert: 'zzz' },
      { from: 4, to: 9, insert: 'kuiskasi' }
    ]);
    expect(changes.map(c => [c.from, c.to])).toEqual([[4, 9]]);
    expect(skipped).toEqual([{ index: 0, reason: 'overlap' }]);
  });

  test('turns CRLF in inserted text into LF', () => {
    const { changes } = M.normalizeChanges('yksi kaksi', [
      { from: 4, to: 5, insert: '\r\n\r\n' },
      { from: 10, to: 10, insert: '\rloppu' },
      { from: 0, to: 0, insert: null }
    ]);
    expect(changes.map(c => c.insert)).toEqual(['\n\n', '\nloppu']);
  });

  test('an empty list and an empty text give nothing', () => {
    expect(M.normalizeChanges('', [])).toEqual({ changes: [], skipped: [] });
    expect(M.normalizeChanges('', undefined)).toEqual({ changes: [], skipped: [] });
    expect(M.normalizeChanges('', [{ from: 0, to: 0, insert: 'Alku' }]).changes).toHaveLength(1);
  });
});

describe('createSuggestions', () => {
  test('records original and 16 characters of context on each side; ä ö å ” – count as one position each', () => {
    const { items } = M.createSuggestions(SAMPLE, [at(SAMPLE, 'mennyt', 'lähtenyt')], { groupId: 'g1' });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ from: 30, to: 36, original: 'mennyt', insert: 'lähtenyt', state: 'pending' });
    expect(items[0].context).toEqual({ before: 'ä mene.” – Enkä ', after: ', vaikka åkerö [' });
    expect(items[0].context.before).toHaveLength(16);
    expect(items[0].context.after).toHaveLength(16);

    // Near the edges the context is what there is
    const edge = M.createSuggestions(SAMPLE, [at(SAMPLE, 'Hän', 'Hon'), at(SAMPLE, 'kypsä', 'raaka')], { groupId: 'g2' }).items;
    expect(edge[0].context).toEqual({ before: '', after: ' sanoi: ”Älä men' });
    expect(edge[1].context).toEqual({ before: 'arkista] oli <u>', after: '</u>.' });
  });

  test('replacing "sanoi" after "Hän " has from 4 and to 9 although the text before it contains ä', () => {
    const { items } = M.createSuggestions(SAMPLE, [at(SAMPLE, 'sanoi', 'kuiskasi')], { groupId: 'g1' });
    expect([items[0].from, items[0].to]).toEqual([4, 9]);
    expect(SAMPLE.slice(items[0].from, items[0].to)).toBe('sanoi');
  });

  test('replacing the hyphen of a dialogue line "- Älä mene" with "–" gives from 0, to 1 and leaves the rest of the line outside the suggestion', () => {
    const text = '- Älä mene, hän sanoi.\n- En mene.';
    const { items } = M.createSuggestions(text, [{ from: 0, to: 1, insert: '–', original: '-' }], { groupId: 'g1' });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ from: 0, to: 1, original: '-', insert: '–' });
    expect(items[0].context).toEqual({ before: '', after: ' Älä mene, hän s' });
    expect(applyChanges(text, items)).toBe('– Älä mene, hän sanoi.\n- En mene.');
  });

  test('one call gives one groupId and one meta; a per-change meta wins', () => {
    const own = { ...META, dialogue: true };
    const { items } = M.createSuggestions(SAMPLE, [
      at(SAMPLE, 'sanoi', 'kuiskasi'),
      at(SAMPLE, 'mennyt', 'lähtenyt', { meta: own }),
      at(SAMPLE, 'åkerö', 'Åkerö', { id: 'oma' })
    ], { groupId: 'g7', meta: META });
    expect(items.map(item => item.groupId)).toEqual(['g7', 'g7', 'g7']);
    expect(items[0].meta).toBe(META);
    expect(items[1].meta).toBe(own);
    expect(items[2].meta).toBe(META);
    expect(items.map(item => item.id)).toEqual(['s1', 's2', 'oma']);
  });

  test('a change touching a pending suggestion is skipped with reason conflict', () => {
    const existing = M.createSuggestions(SAMPLE, [at(SAMPLE, 'sanoi', 'kuiskasi')], { groupId: 'g1' }).items;
    const result = M.createSuggestions(SAMPLE, [
      { from: 9, to: 10, insert: ';' },          // starts where "sanoi" ends
      { from: 3, to: 4, insert: '  ' },          // ends where it starts
      { from: 6, to: 6, insert: 'x' },           // inside
      { from: 11, to: 12, insert: '"' }          // two characters behind it
    ], { groupId: 'g2', existing });
    expect(result.skipped).toEqual([0, 1, 2].map(index => ({ index, reason: 'conflict' })));
    expect(result.items.map(item => [item.from, item.to])).toEqual([[11, 12]]);
    expect(result.indexes).toEqual([3]);
  });

  test('a change touching only a rejected suggestion is accepted', () => {
    const rejected = M.createSuggestions(SAMPLE, [at(SAMPLE, 'sanoi', 'kuiskasi')], { groupId: 'g1' }).items
      .map(item => ({ ...item, state: 'rejected', reason: 'user' }));
    const result = M.createSuggestions(SAMPLE, [at(SAMPLE, 'sanoi', 'sanoo')], { groupId: 'g2', existing: rejected });
    expect(result.skipped).toEqual([]);
    expect(result.items[0]).toMatchObject({ from: 4, to: 9, insert: 'sanoo', state: 'pending' });
  });

  test('a change touching the block position is skipped with reason conflict', () => {
    const result = M.createSuggestions(SAMPLE, [
      at(SAMPLE, 'sanoi', 'kuiskasi'),
      insertAt(9, '!'),
      at(SAMPLE, 'mennyt', 'lähtenyt')
    ], { groupId: 'g1', blockPos: 9 });
    expect(result.skipped).toEqual([{ index: 0, reason: 'conflict' }]);
    expect(result.items.map(item => item.original)).toEqual(['mennyt']);
  });

  test('an id that is already tracked is not used twice', () => {
    const existing = M.createSuggestions(SAMPLE, [at(SAMPLE, 'sanoi', 'kuiskasi', { id: 's9' })], { groupId: 'g1' }).items;
    const { items } = M.createSuggestions(SAMPLE, [at(SAMPLE, 'mennyt', 'lähtenyt', { id: 's9' })], { groupId: 'g2', existing });
    expect(items[0].id).not.toBe('s9');
  });
});

describe('makeMapper', () => {
  test('mapPos follows insertions by assoc and collapses positions inside a deletion', () => {
    const insert = typed(5, 'abc');
    expect([insert.mapPos(4), insert.mapPos(5, -1), insert.mapPos(5, 1), insert.mapPos(6)]).toEqual([4, 5, 8, 9]);

    const cut = deleted(5, 8);
    expect([cut.mapPos(5, 1), cut.mapPos(6, 1), cut.mapPos(6, -1), cut.mapPos(8, -1), cut.mapPos(9)]).toEqual([5, 5, 5, 5, 6]);
  });

  test('touchesRange counts both ends and tells a covering change apart', () => {
    const cut = deleted(5, 8);
    expect(cut.touchesRange(0, 4)).toBe(false);
    expect(cut.touchesRange(0, 5)).toBe(true);
    expect(cut.touchesRange(8, 12)).toBe(true);
    expect(cut.touchesRange(9, 12)).toBe(false);
    expect(cut.touchesRange(6, 7)).toBe('cover');
    expect(cut.touchesRange(6)).toBe('cover');
    expect(typed(5).touchesRange(5)).toBe(true);
  });
});

describe('mapSuggestions', () => {
  const items = () => M.createSuggestions(SAMPLE, FOUR, { groupId: 'g1' }).items;
  const run = (list, mapper) => M.mapSuggestions(list, mapper.mapPos, mapper.touchesRange);

  test('typing at the end of the text keeps every suggestion in place', () => {
    const list = items();
    const { kept, dropped } = run(list, typed(SAMPLE.length, '!'));
    expect(dropped).toEqual([]);
    expect(kept).toEqual(list);
    kept.forEach((item, index) => expect(item).toBe(list[index]));
  });

  test('typing before a suggestion shifts it by the typed length', () => {
    const list = items();
    const { kept, dropped } = run(list, typed(0, 'Ja '));
    expect(dropped).toEqual([]);
    expect(kept.map(item => [item.from, item.to])).toEqual(list.map(item => [item.from + 3, item.to + 3]));
    const text = typeInto(SAMPLE, 0, 'Ja ');
    kept.forEach(item => expect(text.slice(item.from, item.to)).toBe(item.original));
  });

  test('typing inside "mennyt" drops only that suggestion', () => {
    const { kept, dropped } = run(items(), typed(32));
    expect(dropped.map(item => item.original)).toEqual(['mennyt']);
    expect(kept.map(item => item.original)).toEqual(['', 'sanoi', 'åkerö']);
    // What came after the typed letter moved by one, what came before did not
    expect(kept.map(item => item.from)).toEqual([3, 4, 46]);
  });

  test('typing exactly at the start or the end of a suggestion drops it', () => {
    expect(run(items(), typed(30)).dropped.map(item => item.original)).toEqual(['mennyt']);
    expect(run(items(), typed(36)).dropped.map(item => item.original)).toEqual(['mennyt']);
  });

  test('typing one character past the end keeps it', () => {
    const { kept, dropped } = run(items(), typed(37));
    expect(dropped).toEqual([]);
    expect(kept.find(item => item.original === 'mennyt')).toMatchObject({ from: 30, to: 36 });
    expect(run(items(), typed(29)).dropped).toEqual([]);
  });

  test('a deletion that covers two suggestions drops both', () => {
    const { kept, dropped } = run(items(), deleted(2, 33));
    expect(dropped.map(item => item.original).sort()).toEqual(['', 'mennyt', 'sanoi']);
    expect(kept.map(item => item.original)).toEqual(['åkerö']);

    const two = run(items(), deleted(5, 33));
    expect(two.dropped.map(item => item.original)).toEqual(['sanoi', 'mennyt']);
  });

  test('typing at the position of an insert-only suggestion drops it', () => {
    const { kept, dropped } = run(items(), typed(3));
    expect(dropped.map(item => item.insert)).toEqual([' taas']);
    expect(kept).toHaveLength(3);
  });

  test('rejected suggestions are mapped and never dropped', () => {
    const list = items().map(item => ({ ...item, state: 'rejected', reason: 'user' }));
    const { kept, dropped } = run(list, deleted(2, 33));
    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(4);
    expect(kept.every(item => item.state === 'rejected')).toBe(true);
    // The ones inside the deletion collapse onto its place
    expect(kept.find(item => item.original === 'sanoi')).toMatchObject({ from: 2, to: 2 });
    expect(kept.find(item => item.original === 'åkerö')).toMatchObject({ from: 14, to: 19 });
  });

  test('a suggestion whose position did not change is returned as the same object', () => {
    const list = items();
    const { kept } = run(list, typed(20));
    const before = name => list.find(item => item.original === name);
    const after = name => kept.find(item => item.original === name);
    expect(after('sanoi')).toBe(before('sanoi'));
    expect(after('mennyt')).not.toBe(before('mennyt'));
    expect(after('mennyt')).toMatchObject({ from: 31, to: 37 });
  });

  test('typing inside [TODO: tarkista] between two suggestions drops neither', () => {
    const list = M.createSuggestions(SAMPLE, [at(SAMPLE, 'åkerö', 'Åkerö'), at(SAMPLE, 'oli', 'on')], { groupId: 'g1' }).items;
    const inNote = SAMPLE.indexOf('tarkista') + 3;
    const { kept, dropped } = run(list, typed(inNote, 'kk'));
    expect(dropped).toEqual([]);
    expect(kept.map(item => [item.original, item.from])).toEqual([['åkerö', 45], ['oli', 70]]);
    const text = typeInto(SAMPLE, inNote, 'kk');
    expect(text.slice(70, 73)).toBe('oli');
  });
});

describe('singleChange, firstDifference, stillMatches', () => {
  test('singleChange returns the smallest range and null for equal texts', () => {
    expect(M.singleChange(SAMPLE, SAMPLE)).toBeNull();
    expect(M.singleChange('Hän sanoi niin.', 'Hän kuiskasi niin.')).toEqual({ from: 4, to: 8, insert: 'kuiskas' });
    expect(M.singleChange('abc', 'abXc')).toEqual({ from: 2, to: 2, insert: 'X' });
    expect(M.singleChange('abXc', 'abc')).toEqual({ from: 2, to: 3, insert: '' });
    expect(M.singleChange('', 'ä')).toEqual({ from: 0, to: 0, insert: 'ä' });
    // Two differences far apart are one range from the first to the last
    const change = M.singleChange(SAMPLE, SAMPLE.replace('Hän', 'Hon').replace('kypsä', 'raaka'));
    expect(change).toEqual({ from: 1, to: 80, insert: SAMPLE.replace('Hän', 'Hon').replace('kypsä', 'raaka').slice(1, 80) });
  });

  test('firstDifference is the common prefix length and -1 for equal texts', () => {
    expect(M.firstDifference(SAMPLE, SAMPLE)).toBe(-1);
    expect(M.firstDifference('Hän sanoi', 'Hän kuiskasi')).toBe(4);
    expect(M.firstDifference('abc', 'abcd')).toBe(3);
    expect(M.firstDifference('', 'a')).toBe(0);
  });

  test('stillMatches is true while the text at the range equals original', () => {
    const item = M.createSuggestions(SAMPLE, [at(SAMPLE, 'Älä', 'Et')], { groupId: 'g1' }).items[0];
    expect(M.stillMatches(SAMPLE, item)).toBe(true);
    // A change elsewhere does not matter for a replacement, its context is not compared
    expect(M.stillMatches(SAMPLE.replace('mene', 'tule'), item)).toBe(true);
  });

  test('stillMatches is false after "Älä" became "Äla"', () => {
    const item = M.createSuggestions(SAMPLE, [at(SAMPLE, 'Älä', 'Et')], { groupId: 'g1' }).items[0];
    expect(M.stillMatches(SAMPLE.replace('Älä', 'Äla'), item)).toBe(false);
  });

  test('stillMatches for an insert-only suggestion needs the stored context on both sides', () => {
    const comma = SAMPLE.indexOf(' vaikka') - 1;   // between "mennyt" and ","
    const item = M.createSuggestions(SAMPLE, [insertAt(comma, ' enää')], { groupId: 'g1' }).items[0];
    expect(M.stillMatches(SAMPLE, item)).toBe(true);
    expect(M.stillMatches(SAMPLE.replace('Enkä', 'Enka'), item)).toBe(false);     // before
    expect(M.stillMatches(SAMPLE.replace('vaikka', 'vaikkei'), item)).toBe(false); // after
    // Far outside the 16 characters nothing is compared
    expect(M.stillMatches(SAMPLE.replace('kypsä', 'raaka'), item)).toBe(true);
    // Without any context only the position can be checked
    expect(M.stillMatches('abc', { from: 1, to: 1, original: '' })).toBe(true);
  });
});

describe('rebaseSuggestions', () => {
  const items = () => M.createSuggestions(SAMPLE, FOUR, { groupId: 'g1' }).items;

  test('equal texts keep everything', () => {
    const list = items();
    const { kept, dropped } = M.rebaseSuggestions(list, SAMPLE, SAMPLE, wordDiff);
    expect(dropped).toEqual([]);
    expect(kept).toEqual(list);
    kept.forEach((item, index) => expect(item).toBe(list[index]));
  });

  test('a change in front shifts the suggestions', () => {
    const next = 'Ja ' + SAMPLE;
    const { kept, dropped } = M.rebaseSuggestions(items(), SAMPLE, next);
    expect(dropped).toEqual([]);
    expect(kept.map(item => item.from)).toEqual([6, 7, 33, 48]);
    kept.forEach(item => expect(M.stillMatches(next, item)).toBe(true));
  });

  test('a change mirrored as one range keeps the suggestions inside it whose words the fine diff leaves alone', () => {
    // "Hän" and "kypsä" changed: one range from 1 to 80 that holds all four suggestions
    const next = SAMPLE.replace('Hän', 'Hon').replace('kypsä', 'raaka');
    const { kept, dropped } = M.rebaseSuggestions(items(), SAMPLE, next, wordDiff);
    // The insertion sat right behind "Hän", which changed
    expect(dropped.map(item => item.insert)).toEqual([' taas']);
    expect(kept.map(item => item.original)).toEqual(['sanoi', 'mennyt', 'åkerö']);
    kept.forEach(item => expect(next.slice(item.from, item.to)).toBe(item.original));
  });

  test('without a diff function the suggestions inside the changed range are dropped', () => {
    const next = SAMPLE.replace('Hän', 'Hon').replace('kypsä', 'raaka');
    const { kept, dropped } = M.rebaseSuggestions(items(), SAMPLE, next);
    expect(kept).toEqual([]);
    expect(dropped).toHaveLength(4);

    // A diff that is not an edit script from the old to the new text is not trusted either
    const wrong = M.rebaseSuggestions(items(), SAMPLE, next, () => [{ from: 0, to: 1, insert: 'zzz' }]);
    expect(wrong.kept).toEqual([]);
    const throwing = M.rebaseSuggestions(items(), SAMPLE, next, () => { throw new Error('diff failed'); });
    expect(throwing.dropped).toHaveLength(4);
  });

  test('a suggestion whose original text changed is dropped', () => {
    const next = SAMPLE.replace('mennyt', 'mennyt enää');
    const { kept, dropped } = M.rebaseSuggestions(items(), SAMPLE, next, wordDiff);
    expect(dropped.map(item => item.original)).toEqual(['mennyt']);
    expect(kept.map(item => item.original)).toEqual(['', 'sanoi', 'åkerö']);
    expect(kept.find(item => item.original === 'åkerö').from).toBe(50);

    // A list that was not valid for the old text does not get through either
    const stale = items().map(item => (item.original === 'sanoi' ? { ...item, original: 'sanoo' } : item));
    const result = M.rebaseSuggestions(stale, SAMPLE, 'Ja ' + SAMPLE, wordDiff);
    expect(result.dropped.map(item => item.original)).toEqual(['sanoo']);
  });

  test('a region above REBASE_DIFF_LIMIT is not diffed and drops what it touches', () => {
    const middle = 'b'.repeat(100000) + ' sana ' + 'c'.repeat(20);
    const oldText = 'Alku A' + middle + 'D loppu';
    const newText = 'Alku X' + middle + 'Y loppu';
    const list = M.createSuggestions(oldText, [at(oldText, 'sana', 'sanaa'), at(oldText, 'Alku', 'Alussa'), at(oldText, 'loppu', 'lopussa')], { groupId: 'g1' }).items;
    const diff = jest.fn(wordDiff);
    const { kept, dropped } = M.rebaseSuggestions(list, oldText, newText, diff);
    expect(diff).not.toHaveBeenCalled();
    expect(dropped.map(item => item.original)).toEqual(['sana']);
    expect(kept.map(item => item.original)).toEqual(['Alku', 'loppu']);
    kept.forEach(item => expect(newText.slice(item.from, item.to)).toBe(item.original));
  });

  test('a region above REBASE_DIFF_LIMIT is aligned by lines first: the word diff sees only the lines that changed', () => {
    const line = (i) => `Rivi ${i}: lumi satoi hiljaa kadulle.\n`;
    const lines = Array.from({ length: 6000 }, (_, i) => line(i));
    const oldText = lines.join('');
    const next = lines.slice();
    next[0] = 'Ensimmäinen rivi muuttui.\n';
    next[3000] = line(3000).replace('lumi', 'vesi');
    next.splice(5999, 1, 'Viimeinen rivi muuttui.\n', 'Ja yksi uusi rivi.\n');
    const newText = next.join('');
    const word = (i, w, insert) => {
      const from = oldText.indexOf(line(i)) + line(i).indexOf(w);
      return { from, to: from + w.length, insert, original: w };
    };
    const list = M.createSuggestions(oldText, [word(2000, 'hiljaa', 'äänettömästi'), word(3000, 'lumi', 'räntä'), word(4500, 'kadulle', 'torille')], { groupId: 'g1' }).items;
    const diff = jest.fn(wordDiff);
    const { kept, dropped } = M.rebaseSuggestions(list, oldText, newText, diff);

    expect(M.singleChange(oldText, newText).to - M.singleChange(oldText, newText).from).toBeGreaterThan(M.REBASE_DIFF_LIMIT / 2);
    expect(diff).toHaveBeenCalled();
    diff.mock.calls.forEach(([a, b]) => expect(a.length + b.length).toBeLessThan(200));
    expect(dropped.map(item => item.original)).toEqual(['lumi']);
    expect(kept.map(item => item.original)).toEqual(['hiljaa', 'kadulle']);
    kept.forEach(item => expect(newText.slice(item.from, item.to)).toBe(item.original));
  });

  test('rejected suggestions are kept and mapped', () => {
    const list = items().map(item => ({ ...item, state: 'rejected', reason: 'user' }));
    const next = SAMPLE.replace('mennyt', 'mennyt enää');
    const { kept, dropped } = M.rebaseSuggestions(list, SAMPLE, next);
    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(4);
    expect(kept.find(item => item.original === 'åkerö')).toMatchObject({ from: 50, to: 55, state: 'rejected' });
    expect(kept.find(item => item.original === 'sanoi')).toMatchObject({ from: 4, to: 9 });
  });

  test('a word taken out or put in right in front of a suggested word does not drop the suggestion', () => {
    // The undo of an accepted " taas" is mirrored as the deletion of "taas ", which ends
    // exactly where "sanoi" starts. The same deletion one character to the left touches nothing.
    const withWord = 'Hän taas sanoi niin.';
    const without = 'Hän sanoi niin.';
    expect(M.singleChange(withWord, without)).toEqual({ from: 4, to: 9, insert: '' });
    const list = M.createSuggestions(withWord, [at(withWord, 'sanoi', 'kuiskasi')], { groupId: 'g1' }).items;
    expect(list[0]).toMatchObject({ from: 9, to: 14 });

    for (const diff of [undefined, wordDiff]) {
      const out = M.rebaseSuggestions(list, withWord, without, diff);
      expect(out.dropped).toEqual([]);
      expect(out.kept[0]).toMatchObject({ from: 4, to: 9, original: 'sanoi' });
    }

    // And the other way: the word comes back in front of the suggestion
    const back = M.createSuggestions(without, [at(without, 'sanoi', 'kuiskasi')], { groupId: 'g2' }).items;
    expect(M.singleChange(without, withWord)).toEqual({ from: 4, to: 4, insert: 'taas ' });
    const again = M.rebaseSuggestions(back, without, withWord, wordDiff);
    expect(again.dropped).toEqual([]);
    expect(again.kept[0]).toMatchObject({ from: 9, to: 14 });

    // Behind the suggested word as well
    const behind = M.rebaseSuggestions(back, without, 'Hän sanoi aina niin.');
    expect(behind.kept[0]).toMatchObject({ from: 4, to: 9 });
    const gone = M.rebaseSuggestions(M.createSuggestions('Hän sanoi aina niin.', [{ from: 4, to: 9, insert: 'kuiskasi' }], { groupId: 'g3' }).items, 'Hän sanoi aina niin.', without);
    expect(gone.kept[0]).toMatchObject({ from: 4, to: 9 });
  });

  test('letters added directly to a suggested word still drop the suggestion', () => {
    const text = 'Hän sanoi niin.';
    const list = M.createSuggestions(text, [at(text, 'sanoi', 'kuiskasi')], { groupId: 'g1' }).items;
    // "sanoikin" and "eisanoi": the word itself is no longer the word the suggestion was made for
    expect(M.rebaseSuggestions(list, text, 'Hän sanoikin niin.').dropped).toHaveLength(1);
    expect(M.rebaseSuggestions(list, text, 'Hän eisanoi niin.').dropped).toHaveLength(1);
    expect(M.rebaseSuggestions(list, text, 'Hän sanoikin niin.', wordDiff).dropped).toHaveLength(1);
    // A replacement that ends exactly at the word has no other form either
    const tight = 'x:sanoi niin.';
    const tightList = M.createSuggestions(tight, [at(tight, 'sanoi', 'kuiskasi')], { groupId: 'g2' }).items;
    expect(M.singleChange(tight, 'yy sanoi niin.')).toEqual({ from: 0, to: 2, insert: 'yy ' });
    expect(M.rebaseSuggestions(tightList, tight, 'yy sanoi niin.').dropped).toHaveLength(1);
    // A change one character away is no neighbour at all
    expect(M.rebaseSuggestions(list, text, 'Me sanoi niin.').kept[0]).toMatchObject({ from: 3, to: 8 });
  });

  test('an insertion point keeps its place when a word next to it is taken out, and is dropped when text lands on it', () => {
    const withWord = 'Hän taas sanoi niin.';
    // "ja " would be inserted between "taas " and "sanoi"
    const point = M.createSuggestions(withWord, [insertAt(9, 'ja ')], { groupId: 'g1' }).items;
    const out = M.rebaseSuggestions(point, withWord, 'Hän sanoi niin.', wordDiff);
    expect(out.dropped).toEqual([]);
    expect(out.kept[0]).toMatchObject({ from: 4, to: 4 });
    expect(M.stillMatches('Hän sanoi niin.', out.kept[0])).toBe(true);

    // Other text arrives exactly at the point: before it or after it? Nobody can say.
    const landed = M.rebaseSuggestions(point, withWord, 'Hän taas vainsanoi niin.');
    expect(landed.dropped).toHaveLength(1);
  });

  test('text typed right at an insertion point keeps it only when the text has an equal form one character away', () => {
    // Documented behaviour of the rebase: "Xs" typed behind "ulos" equals "sX" typed in front of
    // its last letter, which does not touch the point; "X" has no such form and lands on it
    const text = 'Hän käy ulos koska sataa.';
    const comma = M.createSuggestions(text, [insertAt(text.indexOf(' koska'), ',')], { groupId: 'g1' }).items;
    const slid = M.rebaseSuggestions(comma, text, 'Hän käy ulosXs koska sataa.');
    expect(slid.dropped).toEqual([]);
    expect(slid.kept[0]).toMatchObject({ from: 14, to: 14 });
    expect('Hän käy ulosXs koska sataa.'.slice(10, 14)).toBe('osXs');
    expect(M.rebaseSuggestions(comma, text, 'Hän käy ulosX koska sataa.').dropped).toHaveLength(1);
  });

  test('a rejected insertion point keeps a context cut back to what a change left alone', () => {
    const text = 'Hän sanoi että hän käy ulos koska sataa.';
    const comma = M.createSuggestions(text, [insertAt(text.indexOf(' koska'), ',')], { groupId: 'g1' }).items
      .map(item => ({ ...item, state: 'rejected', reason: 'user' }));
    const now = text.replace('sataa', 'satoi');
    const { kept } = M.rebaseSuggestions(comma, text, now, wordDiff);
    expect(kept[0]).toMatchObject({ from: text.indexOf(' koska'), state: 'rejected' });
    expect(M.stillMatches(now, kept[0])).toBe(true);
  });

  test('an insertion next to a change keeps its place: only the text the change left alone is compared', () => {
    // Two commas are missing; the first one was accepted after the changes were computed
    const base = 'Hän sanoi että tulee kun ehtii.';
    const first = base.indexOf(' että');
    const second = base.indexOf(' kun');
    const list = M.createSuggestions(base, [insertAt(second, ',')], { groupId: 'g1' }).items;
    expect(list[0].context.before).toContain('sanoi että');   // the first comma's place is inside the stored context

    const now = typeInto(base, first, ',');
    const { kept, dropped } = M.rebaseSuggestions(list, base, now, wordDiff);
    expect(dropped).toEqual([]);
    expect(kept[0]).toMatchObject({ from: second + 1, to: second + 1 });
    expect(now.slice(kept[0].from - 5, kept[0].from + 4)).toBe('tulee kun');
    expect(M.stillMatches(now, kept[0])).toBe(true);
  });
});

describe('reduce', () => {
  test('propose adds pending items, makes the first one current and reports proposed', () => {
    const state = proposed();
    expect(state.items.map(item => [item.from, item.to, item.insert, item.state])).toEqual([
      [3, 3, ' taas', 'pending'],
      [4, 9, 'kuiskasi', 'pending'],
      [30, 36, 'lähtenyt', 'pending'],
      [45, 50, 'Åkerö', 'pending']
    ]);
    // The first one by position, not by input order
    expect(state.currentId).toBe(state.items[0].id);
    expect(state.event).toEqual({ type: 'proposed', ids: state.items.map(item => item.id), groupId: 'g1', skipped: [] });
    expect(state.rev).toBe(1);
    expect(state.notice).toBeNull();
    expect(new Set(state.items.map(item => item.groupId))).toEqual(new Set(['g1']));
    expect(state.items.every(item => item.meta === META)).toBe(true);
  });

  test('propose with select false leaves current alone', () => {
    const first = proposed([at(SAMPLE, 'mennyt', 'lähtenyt')]);
    const second = propose(first, SAMPLE, [at(SAMPLE, 'sanoi', 'kuiskasi')], { select: false });
    expect(second.currentId).toBe(first.currentId);
    expect(second.items).toHaveLength(2);

    // Without the flag the new one takes over
    const taken = propose(first, SAMPLE, [at(SAMPLE, 'sanoi', 'kuiskasi')]);
    expect(taken.currentId).toBe(byOriginal(taken, 'sanoi').id);

    // Nothing was current before: select false keeps it that way only if something else is current
    const fresh = proposed([at(SAMPLE, 'sanoi', 'kuiskasi')], { select: false });
    expect(fresh.items).toHaveLength(1);
  });

  test('propose with replaceGroupId removes the old group\'s pending items without rejecting them', () => {
    let state = proposed([at(SAMPLE, 'sanoi', 'kuiskasi'), at(SAMPLE, 'mennyt', 'lähtenyt')], { groupId: 'yritys1' });
    state = M.reduce(state, { type: 'reject', ids: [byOriginal(state, 'mennyt').id] });
    state = propose(state, SAMPLE, [at(SAMPLE, 'åkerö', 'Åkerö')], { groupId: 'muu' });

    const next = propose(state, SAMPLE, [at(SAMPLE, 'sanoi', 'huusi')], { groupId: 'yritys2', replaceGroupId: 'yritys1' });
    // The pending one of the old group is gone for good; its rejected one and the other group stay
    expect(next.items.map(item => [item.groupId, item.insert, item.state])).toEqual([
      ['yritys2', 'huusi', 'pending'],
      ['yritys1', 'lähtenyt', 'rejected'],
      ['muu', 'Åkerö', 'pending']
    ]);
    expect(next.event.skipped).toEqual([]);
    expect(M.rejectedItems(next)).toHaveLength(1);
  });

  test('propose with the groupId of a pending group appends to it', () => {
    const first = proposed([at(SAMPLE, 'sanoi', 'kuiskasi')], { groupId: 'ajo' });
    const second = propose(first, SAMPLE, [at(SAMPLE, 'mennyt', 'lähtenyt'), at(SAMPLE, 'sanoi', 'huusi')], { groupId: 'ajo' });
    expect(second.items.map(item => [item.groupId, item.insert])).toEqual([['ajo', 'kuiskasi'], ['ajo', 'lähtenyt']]);
    // The same conflict rules: the second change for "sanoi" is not taken
    expect(second.event).toMatchObject({ type: 'proposed', groupId: 'ajo', ids: [byOriginal(second, 'mennyt').id], skipped: [{ index: 1, reason: 'conflict' }] });
    expect(M.bulkAcceptIds(second, 'ajo')).toHaveLength(2);
  });

  test('propose with restore reuses ids and turns a touching pending suggestion into rejected/external', () => {
    let state = proposed();
    const sanoi = byOriginal(state, 'sanoi');
    state = acceptWith(state, [sanoi.id]);
    const acceptedItems = state.event.items;
    const afterAccept = applyChanges(SAMPLE, [sanoi]);

    // The accept is undone: the text is the sample again. Meanwhile something else was proposed in the same place.
    state = M.reduce(state, { type: 'rebase', oldText: afterAccept, newText: SAMPLE, diff: wordDiff });
    state = M.reduce(state, { type: 'reject', ids: [byOriginal(state, '').id] });
    state = propose(state, SAMPLE, [{ from: 2, to: 6, insert: 'n  s' }], { groupId: 'muu' });
    const squatter = state.items.find(item => item.groupId === 'muu');

    const next = M.reduce(state, { type: 'propose', docText: SAMPLE, changes: acceptedItems, restore: true });
    const back = next.items.find(item => item.id === sanoi.id);
    expect(back).toMatchObject({ id: sanoi.id, groupId: 'g1', from: 4, to: 9, insert: 'kuiskasi', state: 'pending', meta: META });
    expect(next.items.find(item => item.id === squatter.id)).toMatchObject({ state: 'rejected', reason: 'external' });
    expect(next.event).toMatchObject({ type: 'proposed', ids: [sanoi.id] });
    expect(next.currentId).toBe(sanoi.id);
    expect(next.items.filter(item => item.id === sanoi.id)).toHaveLength(1);
  });

  test('propose sets the skipped notice for conflicts and mismatches but not for no-ops', () => {
    const state = proposed([at(SAMPLE, 'sanoi', 'kuiskasi')]);
    const noops = propose(state, SAMPLE, [at(SAMPLE, 'mennyt', 'mennyt'), at(SAMPLE, 'åkerö', 'Åkerö')]);
    expect(noops.event.skipped).toEqual([{ index: 0, reason: 'noop' }]);
    expect(noops.notice).toBeNull();

    const blocked = propose(state, SAMPLE, [
      at(SAMPLE, 'sanoi', 'huusi'),
      { from: 30, to: 36, insert: 'lähtenyt', original: 'tullut' },
      at(SAMPLE, 'Enkä', 'Enkä')
    ]);
    expect(blocked.event.skipped).toEqual([
      { index: 0, reason: 'conflict' },
      { index: 1, reason: 'mismatch' },
      { index: 2, reason: 'noop' }
    ]);
    expect(blocked.notice).toEqual({ kind: 'skipped', count: 2 });
    expect(blocked.event.ids).toEqual([]);

    // The next proposal that goes through clears it
    expect(propose(blocked, SAMPLE, [at(SAMPLE, 'åkerö', 'Åkerö')]).notice).toBeNull();
  });

  test('propose with a baseText moves the changes onto the document and skips what changed as target-changed', () => {
    // The changes were computed on SAMPLE; since then a word was typed in front and "mennyt" was edited
    const now = 'Niin ' + SAMPLE.replace('mennyt', 'mennyt enää');
    const state = M.reduce(M.createState(), {
      type: 'propose', docText: now, baseText: SAMPLE, diff: wordDiff, meta: META,
      changes: [at(SAMPLE, 'mennyt', 'lähtenyt'), at(SAMPLE, 'sanoi', 'kuiskasi'), at(SAMPLE, 'åkerö', 'åkerö'), insertAt(0, 'Ja ')]
    });
    expect(state.items.map(item => [item.original, now.slice(item.from, item.to)])).toEqual([['sanoi', 'sanoi']]);
    expect(state.event.skipped).toEqual([
      { index: 0, reason: 'target-changed' },
      { index: 2, reason: 'noop' },
      { index: 3, reason: 'target-changed' }
    ]);
    // The surroundings are the ones of the document, not of the older text
    expect(state.items[0].context.before).toBe('Niin Hän ');
  });

  test('acceptChanges returns the changes of the given ids sorted by position, and of all pending for null', () => {
    const state = proposed();
    const ids = [byOriginal(state, 'åkerö').id, byOriginal(state, 'sanoi').id];
    expect(M.acceptChanges(state, ids)).toEqual([
      { from: 4, to: 9, insert: 'kuiskasi' },
      { from: 45, to: 50, insert: 'Åkerö' }
    ]);
    expect(applyChanges(SAMPLE, M.acceptChanges(state, null))).toBe(REVISED);

    const rejected = M.reduce(state, { type: 'reject', ids: [byOriginal(state, 'sanoi').id] });
    expect(M.acceptChanges(rejected, null)).toHaveLength(3);
    expect(M.acceptChanges(rejected, ['ei-ole'])).toEqual([]);
  });

  test('accepted removes the ids, maps the rest and moves current to the next pending suggestion', () => {
    const state = proposed();
    const sanoi = byOriginal(state, 'sanoi');
    const next = acceptWith(state, [sanoi.id]);
    const text = applyChanges(SAMPLE, [sanoi]);

    expect(next.items.map(item => item.original)).toEqual(['', 'mennyt', 'åkerö']);
    next.items.forEach(item => expect(text.slice(item.from, item.to)).toBe(item.original));
    expect(byOriginal(next, 'mennyt')).toMatchObject({ from: 33, to: 39 });
    expect(next.currentId).toBe(byOriginal(next, 'mennyt').id);

    // The last one accepted: current wraps to the first pending one
    const last = acceptWith(next, [byOriginal(next, 'åkerö').id]);
    expect(last.currentId).toBe(byOriginal(last, '').id);
  });

  test('accepted with all ids reports bulk true and leaves current null', () => {
    const state = proposed();
    const ids = state.items.map(item => item.id);
    const next = acceptWith(state, ids);
    expect(next.items).toEqual([]);
    expect(next.currentId).toBeNull();
    expect(next.event).toMatchObject({ type: 'accepted', ids, bulk: true });
    expect(acceptWith(state, [ids[0]]).event.bulk).toBe(false);
  });

  test('the accepted event carries the items with their positions from before the accept', () => {
    const state = proposed();
    const ids = [byOriginal(state, 'sanoi').id, byOriginal(state, 'åkerö').id];
    const next = acceptWith(state, ids);
    expect(next.event.items.map(item => [item.id, item.from, item.to, item.original, item.insert])).toEqual([
      [ids[0], 4, 9, 'sanoi', 'kuiskasi'],
      [ids[1], 45, 50, 'åkerö', 'Åkerö']
    ]);
    // They are valid for the text before the accept, which is the text after an undo
    next.event.items.forEach(item => expect(M.stillMatches(SAMPLE, item)).toBe(true));
  });

  test('reject marks the items rejected with reason user and keeps mapping them', () => {
    const state = proposed();
    const mennyt = byOriginal(state, 'mennyt');
    const next = M.reduce(state, { type: 'reject', ids: [mennyt.id] });
    expect(byOriginal(next, 'mennyt')).toMatchObject({ state: 'rejected', reason: 'user', from: 30, to: 36 });
    expect(next.event).toEqual({ type: 'rejected', ids: [mennyt.id], items: [mennyt], bulk: false, reason: 'user' });
    expect(M.pendingItems(next)).toHaveLength(3);
    expect(M.rejectedItems(next)).toHaveLength(1);

    const moved = mapWith(next, typed(0, 'Ja '));
    expect(byOriginal(moved, 'mennyt')).toMatchObject({ state: 'rejected', from: 33, to: 39 });
    // An edit inside a rejected one neither drops nor reports it
    const inside = mapWith(next, typed(32));
    expect(inside.event).toBeNull();
    expect(byOriginal(inside, 'mennyt')).toMatchObject({ state: 'rejected', reason: 'user', from: 30, to: 37 });
  });

  test('reject moves current to the next pending suggestion and bulk is true for several', () => {
    const state = proposed();
    const next = M.reduce(state, { type: 'reject', ids: [state.items[0].id, state.items[1].id] });
    expect(next.event.bulk).toBe(true);
    expect(next.currentId).toBe(byOriginal(next, 'mennyt').id);
    const none = M.reduce(next, { type: 'reject', ids: M.pendingItems(next).map(item => item.id) });
    expect(none.currentId).toBeNull();
    // Unknown ids: nothing happens, only the old event is cleared
    const again = M.reduce(none, { type: 'reject', ids: ['ei-ole'] });
    expect(again).toEqual({ ...none, event: null });
    expect(M.reduce(again, { type: 'reject', ids: [] })).toBe(again);
  });

  test('restore brings back the rejected items whose original still matches and reports the failed count', () => {
    let state = proposed();
    const ids = state.items.map(item => item.id);
    state = M.reduce(state, { type: 'reject', ids });
    expect(state.currentId).toBeNull();

    // "mennyt" was rewritten by hand in the meantime
    const edit = M.singleChange(SAMPLE, SAMPLE.replace('mennyt', 'tullut'));
    const now = SAMPLE.replace('mennyt', 'tullut');
    state = mapWith(state, M.makeMapper([edit]));

    const next = M.reduce(state, { type: 'restore', docText: now });
    expect(M.pendingItems(next).map(item => item.original)).toEqual(['', 'sanoi', 'åkerö']);
    expect(byOriginal(next, 'mennyt').state).toBe('rejected');
    expect(next.event).toMatchObject({ type: 'restored', auto: false, failed: 1 });
    expect(next.event.ids).toHaveLength(3);
    expect(next.notice).toEqual({ kind: 'restore-failed', count: 1 });
    expect(next.currentId).toBe(next.items[0].id);
    expect(M.pendingItems(next).every(item => !('reason' in item))).toBe(true);

    // Nothing rejected: nothing happens
    const clean = proposed();
    expect(M.reduce(clean, { type: 'restore', docText: SAMPLE }).event).toBeNull();
  });

  test('restore leaves a rejected item alone when it touches the pending block', () => {
    let state = proposed([at(SAMPLE, 'sanoi', 'kuiskasi')]);
    state = M.reduce(state, { type: 'reject', ids: [state.items[0].id] });
    // The suggestion is rejected, so a block may start inside its word
    state = M.reduce(state, { type: 'blockStart', id: 'b1', pos: 6, meta: META, docText: SAMPLE });
    expect(state.block).toMatchObject({ pos: 6, state: 'pending' });
    state = M.reduce(state, { type: 'blockFinish', id: 'b1', text: 'Uusi virke.' });

    const next = M.reduce(state, { type: 'restore', docText: SAMPLE });
    expect(byOriginal(next, 'sanoi').state).toBe('rejected');
    expect(next.block).toMatchObject({ id: 'b1', state: 'pending' });
    expect(next.event).toMatchObject({ type: 'restored', ids: [], failed: 1 });
    expect(next.notice).toEqual({ kind: 'restore-failed', count: 1 });
  });

  test('a rejected insertion point can be restored after a suggestion within its context was accepted', () => {
    const text = 'Hän sanoi että hän käy ulos koska sataa.';
    let state = propose(M.createState(), text, [insertAt(text.indexOf(' koska'), ','), at(text, 'sataa', 'satoi')]);
    const [comma, word] = state.items;
    state = M.reduce(state, { type: 'reject', ids: [comma.id] });

    const changes = M.acceptChanges(state, [word.id]);
    const mapper = M.makeMapper(changes);
    state = M.reduce(state, { type: 'accepted', ids: [word.id], mapPos: mapper.mapPos, touchesRange: mapper.touchesRange });
    const now = applyChanges(text, changes);

    const next = M.reduce(state, { type: 'restore', docText: now });
    expect(next.event).toMatchObject({ type: 'restored', ids: [comma.id], failed: 0 });
    expect(M.pendingItems(next)[0]).toMatchObject({ id: comma.id, from: text.indexOf(' koska') });
  });

  test('restore leaves a rejected item alone when it now touches a pending one', () => {
    let state = proposed([at(SAMPLE, 'sanoi', 'kuiskasi')]);
    state = M.reduce(state, { type: 'reject', ids: [state.items[0].id] });
    state = propose(state, SAMPLE, [{ from: 9, to: 10, insert: ';' }]);   // borders the rejected one

    const next = M.reduce(state, { type: 'restore', docText: SAMPLE });
    expect(byOriginal(next, 'sanoi').state).toBe('rejected');
    expect(next.event).toMatchObject({ type: 'restored', ids: [], failed: 1 });
  });

  test('map with an edit inside a suggestion turns it into rejected/edited and sets dropped-edit with count 1', () => {
    const state = proposed();
    const mennyt = byOriginal(state, 'mennyt');
    const next = mapWith(state, typed(32));
    expect(byOriginal(next, 'mennyt')).toMatchObject({ state: 'rejected', reason: 'edited', from: 30, to: 37 });
    expect(next.notice).toEqual({ kind: 'dropped-edit', count: 1 });
    expect(next.event).toEqual({ type: 'dropped', ids: [mennyt.id], reason: 'edited' });
    expect(next.rev).toBe(state.rev + 1);
    expect(M.pendingItems(next)).toHaveLength(3);
    expect(byOriginal(next, 'åkerö')).toMatchObject({ from: 46, to: 51 });
  });

  test('a second drop while the notice shows raises its count', () => {
    let state = mapWith(proposed(), typed(32));
    state = mapWith(state, typed(6));
    expect(state.notice).toEqual({ kind: 'dropped-edit', count: 2 });
    // After the notice was closed the count starts again
    state = M.reduce(state, { type: 'clearNotice' });
    expect(state.event).toEqual({ type: 'notice' });
    state = mapWith(state, typed(3));
    expect(state.notice).toEqual({ kind: 'dropped-edit', count: 1 });
  });

  test('a dropped current suggestion hands current to the next pending one', () => {
    const state = proposed();
    expect(state.currentId).toBe(state.items[0].id);
    const next = mapWith(state, typed(3));
    expect(next.currentId).toBe(byOriginal(next, 'sanoi').id);
  });

  test('map without any drop returns event null and the same rev', () => {
    const state = proposed();
    const moved = mapWith(state, typed(20));
    expect(moved.event).toBeNull();
    expect(moved.rev).toBe(state.rev);
    expect(byOriginal(moved, 'mennyt')).toMatchObject({ from: 31, to: 37 });
    expect(byOriginal(moved, 'sanoi')).toBe(byOriginal(state, 'sanoi'));

    // Nothing moved at all: the only change is that the old event is gone, and then not even that
    const still = mapWith(state, typed(SAMPLE.length));
    expect(still.event).toBeNull();
    expect(still.items).toBe(state.items);
    expect(mapWith(still, typed(SAMPLE.length + 1))).toBe(still);
    expect(mapWith(M.createState(), typed(0))).toEqual(M.createState());
  });

  test('rebase after "typed X into the suggestion, then undo" makes the suggestion pending again', () => {
    const state = proposed();
    const typedText = typeInto(SAMPLE, 32);
    const dropped = mapWith(state, typed(32));
    expect(byOriginal(dropped, 'mennyt').state).toBe('rejected');

    const next = M.reduce(dropped, { type: 'rebase', oldText: typedText, newText: SAMPLE, diff: wordDiff });
    expect(byOriginal(next, 'mennyt')).toMatchObject({ state: 'pending', from: 30, to: 36 });
    expect(byOriginal(next, 'mennyt')).not.toHaveProperty('reason');
    expect(next.event).toEqual({ type: 'restored', ids: [byOriginal(state, 'mennyt').id], auto: true, failed: 0 });
    expect(M.pendingItems(next)).toHaveLength(4);
    next.items.forEach(item => expect(M.stillMatches(SAMPLE, item)).toBe(true));

    // The same for an insertion point, and without a diff function
    const droppedInsert = mapWith(state, typed(3, 'Q'));
    const back = M.reduce(droppedInsert, { type: 'rebase', oldText: typeInto(SAMPLE, 3, 'Q'), newText: SAMPLE });
    expect(byOriginal(back, '')).toMatchObject({ state: 'pending', from: 3, to: 3 });
  });

  test('rebase with a change elsewhere does not bring a rejected suggestion back', () => {
    const dropped = mapWith(proposed(), typed(32));
    const typedText = typeInto(SAMPLE, 32);
    // The author takes the letter out again by hand: the text matches, but nothing external touched the place
    const fixed = mapWith(dropped, deleted(32, 33));
    expect(byOriginal(fixed, 'mennyt')).toMatchObject({ state: 'rejected', from: 30, to: 36 });

    const next = M.reduce(fixed, { type: 'rebase', oldText: SAMPLE, newText: SAMPLE.replace('kypsä', 'raaka'), diff: wordDiff });
    expect(byOriginal(next, 'mennyt').state).toBe('rejected');
    expect(next.event).toBeNull();
    expect(typedText).not.toBe(SAMPLE);
  });

  test('rebase never brings back a suggestion rejected by the user', () => {
    const state = proposed();
    const rejected = M.reduce(state, { type: 'reject', ids: [byOriginal(state, 'mennyt').id] });
    const typedText = typeInto(SAMPLE, 32);
    const edited = mapWith(rejected, typed(32));
    const next = M.reduce(edited, { type: 'rebase', oldText: typedText, newText: SAMPLE, diff: wordDiff });
    expect(byOriginal(next, 'mennyt')).toMatchObject({ state: 'rejected', reason: 'user', from: 30, to: 36 });
  });

  test('rebase drops a pending suggestion whose text changed and says so', () => {
    const state = proposed();
    const next = M.reduce(state, { type: 'rebase', oldText: SAMPLE, newText: SAMPLE.replace('mennyt', 'tullut'), diff: wordDiff });
    expect(byOriginal(next, 'mennyt')).toMatchObject({ state: 'rejected', reason: 'external' });
    expect(next.event).toEqual({ type: 'dropped', ids: [byOriginal(state, 'mennyt').id], reason: 'external', restored: [] });
    expect(next.notice).toEqual({ kind: 'dropped-external', count: 1 });
    expect(M.pendingItems(next)).toHaveLength(3);
  });

  test('remove deletes ids whatever their state', () => {
    let state = proposed();
    const sanoi = byOriginal(state, 'sanoi').id;
    const mennyt = byOriginal(state, 'mennyt').id;
    state = M.reduce(state, { type: 'reject', ids: [mennyt] });
    const next = M.reduce(state, { type: 'remove', ids: [sanoi, mennyt, 'ei-ole'] });
    expect(next.items.map(item => item.original)).toEqual(['', 'åkerö']);
    expect(next.event).toEqual({ type: 'removed', ids: [sanoi, mennyt] });
    expect(M.reduce(next, { type: 'remove', ids: ['ei-ole'] }).event).toBeNull();
  });

  test('cursor inside a pending suggestion makes it current; cursor elsewhere changes nothing', () => {
    const state = proposed();
    const mennyt = byOriginal(state, 'mennyt');
    const inside = M.reduce(state, { type: 'cursor', head: 33 });
    expect(inside.currentId).toBe(mennyt.id);
    expect(inside.event).toEqual({ type: 'current', id: mennyt.id });
    // Both ends count
    expect(M.reduce(state, { type: 'cursor', head: 30 }).currentId).toBe(mennyt.id);
    expect(M.reduce(state, { type: 'cursor', head: 36 }).currentId).toBe(mennyt.id);

    const elsewhere = M.reduce(inside, { type: 'cursor', head: 60 });
    expect(elsewhere.currentId).toBe(mennyt.id);
    expect(elsewhere.event).toBeNull();
    expect(elsewhere.rev).toBe(inside.rev);
    expect(M.reduce(elsewhere, { type: 'cursor', head: 60 })).toBe(elsewhere);

    // A rejected one does not take the cursor
    const rejected = M.reduce(state, { type: 'reject', ids: [mennyt.id] });
    expect(M.reduce(rejected, { type: 'cursor', head: 33 }).currentId).toBe(rejected.currentId);
  });

  test('setCurrent takes a pending id and ignores unknown ones', () => {
    const state = proposed();
    const last = state.items[3].id;
    expect(M.reduce(state, { type: 'setCurrent', id: last }).currentId).toBe(last);
    expect(M.reduce(state, { type: 'setCurrent', id: 'ei-ole' }).currentId).toBe(state.currentId);
    expect(M.reduce(state, { type: 'setCurrent', id: 'ei-ole' }).event).toBeNull();
  });

  test('step wraps around in both directions', () => {
    const state = proposed();
    const ids = state.items.map(item => item.id);
    let forward = state;
    const seen = [];
    for (let i = 0; i < 4; i++) {
      forward = M.reduce(forward, { type: 'step', direction: 1, head: 0 });
      seen.push(forward.currentId);
    }
    expect(seen).toEqual([ids[1], ids[2], ids[3], ids[0]]);
    expect(forward.event).toEqual({ type: 'current', id: ids[0] });

    const back = M.reduce(state, { type: 'step', direction: -1, head: 0 });
    expect(back.currentId).toBe(ids[3]);
    expect(M.reduce(back, { type: 'step', direction: -1, head: 0 }).currentId).toBe(ids[2]);
  });

  test('step without a current item picks the first one after the cursor', () => {
    const state = proposed(FOUR, { select: false });
    const ids = state.items.map(item => item.id);
    const none = { ...state, currentId: null };
    expect(M.reduce(none, { type: 'step', direction: 1, head: 10 }).currentId).toBe(ids[2]);
    expect(M.reduce(none, { type: 'step', direction: 1, head: 70 }).currentId).toBe(ids[0]);      // wraps
    expect(M.reduce(none, { type: 'step', direction: -1, head: 40 }).currentId).toBe(ids[2]);
    expect(M.reduce(none, { type: 'step', direction: -1, head: 0 }).currentId).toBe(ids[3]);      // wraps
    expect(M.reduce(M.createState(), { type: 'step', direction: 1, head: 0 })).toEqual(M.createState());
  });

  test('setView changes only viewMode', () => {
    const state = proposed();
    const next = M.reduce(state, { type: 'setView', viewMode: 'new' });
    expect(next).toEqual({ ...state, viewMode: 'new', rev: state.rev + 1, event: { type: 'view', viewMode: 'new' } });
    expect(next.items).toBe(state.items);
    expect(M.reduce(next, { type: 'setView', viewMode: 'new' }).event).toBeNull();
    expect(M.reduce(next, { type: 'setView', viewMode: 'kaikki' }).viewMode).toBe('new');
  });

  test('reduce never mutates its input (deep-frozen state and action)', () => {
    const mapper = typed(32);
    const run = (state, action) => M.reduce(deepFreeze(state), deepFreeze(action));

    let state = run(M.createState(), { type: 'propose', docText: SAMPLE, changes: FOUR.map(c => ({ ...c })), meta: { ...META } });
    state = run(state, { type: 'rangeAdd', id: 'r1', from: 0, to: 9, text: SAMPLE.slice(0, 9), highlight: true });
    state = run(state, { type: 'rangeHighlight', id: 'r1', highlight: false });
    state = run(state, { type: 'cursor', head: 33 });
    state = run(state, { type: 'step', direction: 1, head: 0 });
    state = run(state, { type: 'setCurrent', id: state.items[0].id });
    state = run(state, { type: 'setView', viewMode: 'original' });
    state = run(state, { type: 'map', mapPos: mapper.mapPos, touchesRange: mapper.touchesRange });
    state = run(state, { type: 'rebase', oldText: typeInto(SAMPLE, 32), newText: SAMPLE, diff: wordDiff });
    state = run(state, { type: 'reject', ids: [state.items[1].id] });
    state = run(state, { type: 'restore', docText: SAMPLE });
    state = run(state, { type: 'clearNotice' });
    state = run(state, { type: 'blockStart', id: 'b1', pos: 20, meta: { ...META }, docText: SAMPLE });
    state = run(state, { type: 'blockAppend', id: 'b1', text: 'Uusi virke.' });
    state = run(state, { type: 'blockFinish', id: 'b1', status: 'done' });
    state = run(state, { type: 'blockRetry', id: 'b1' });
    state = run(state, { type: 'blockFinish', id: 'b1', status: 'stopped', text: 'Toinen.' });
    state = run(state, { type: 'blockShow', id: 'b1', index: 0 });
    state = run(state, { type: 'blockReject', id: 'b1' });
    state = run(state, { type: 'restore', docText: SAMPLE });

    const changes = M.acceptChanges(state, [state.items[0].id]);
    const accept = M.makeMapper(changes);
    const before = state;
    state = run(state, { type: 'accepted', ids: [state.items[0].id], mapPos: accept.mapPos, touchesRange: accept.touchesRange });
    expect(before.items).toHaveLength(4);
    expect(state.items).toHaveLength(3);

    const insert = M.blockChange(state, applyChanges(SAMPLE, changes));
    const blockMap = M.makeMapper([insert]);
    state = run(state, { type: 'blockAccepted', id: 'b1', insert: insert.insert, mapPos: blockMap.mapPos, touchesRange: blockMap.touchesRange });
    state = run(state, { type: 'remove', ids: state.items.map(item => item.id) });
    state = run(state, { type: 'rangeRemove', id: 'r1' });
    expect(state.items).toEqual([]);
    expect(state.block).toBeNull();
    expect(state.ranges).toEqual([]);
    expect(run(state, { type: 'tuntematon' })).toEqual({ ...state, event: null });
  });

  test('every pending suggestion still matches the text after a run of typing, accepting and undoing', () => {
    // Commas close to each other: each one's stored surroundings hold the place of its neighbour
    let text = 'Hän sanoi että tulee kun ehtii mutta ei tullut vaikka lupasi.';
    const places = [' että', ' kun', ' mutta', ' vaikka'].map(word => text.indexOf(word));
    let state = propose(M.createState(), text, places.map(pos => insertAt(pos, ',')));
    const check = () => M.pendingItems(state).forEach(item => expect(M.stillMatches(text, item)).toBe(true));
    check();

    // Accept the second comma
    const second = state.items[1];
    let mapper = M.makeMapper(M.acceptChanges(state, [second.id]));
    text = applyChanges(text, M.acceptChanges(state, [second.id]));
    state = M.reduce(state, { type: 'accepted', ids: [second.id], mapPos: mapper.mapPos, touchesRange: mapper.touchesRange });
    check();

    // Type a word two characters in front of the third comma's place
    const third = state.items[1];
    mapper = typed(third.from - 2, 'XY');
    text = typeInto(text, third.from - 2, 'XY');
    state = mapWith(state, mapper);
    expect(M.pendingItems(state)).toHaveLength(3);
    check();

    // An external change elsewhere in the same sentence, mirrored as one range around everything
    const next = text.replace('Hän', 'Hon').replace('lupasi', 'lupasikin');
    state = M.reduce(state, { type: 'rebase', oldText: text, newText: next, diff: wordDiff });
    text = next;
    expect(M.pendingItems(state)).toHaveLength(3);
    check();
    expect(M.pendingItems(state).map(item => text.slice(item.from, item.from + 4))).toEqual([' ett', ' mut', ' vai']);
  });
});

describe('captured ranges', () => {
  const withRange = (extra = {}) => M.reduce(proposed(), { type: 'rangeAdd', id: 'r1', from: 11, to: 22, text: SAMPLE.slice(11, 22), highlight: true, ...extra });

  test('a highlighted captured range gives a target spec', () => {
    const state = withRange();
    expect(state.ranges).toEqual([{ id: 'r1', from: 11, to: 22, text: '”Älä mene.”', highlight: true }]);
    expect(state.event).toBeNull();
    expect(M.decorationSpecs(state).filter(spec => spec.kind === 'target')).toEqual([{ kind: 'target', from: 11, to: 22, id: 'r1' }]);
    // The drawing changed, so rev grew although there is no event
    expect(state.rev).toBe(proposed().rev + 1);

    const plain = withRange({ highlight: false });
    expect(M.decorationSpecs(plain).some(spec => spec.kind === 'target')).toBe(false);
    expect(plain.rev).toBe(proposed().rev);

    const gone = M.reduce(state, { type: 'rangeRemove', id: 'r1' });
    expect(gone.ranges).toEqual([]);
    expect(gone.event).toBeNull();
    expect(gone.rev).toBe(state.rev + 1);
    expect(M.reduce(gone, { type: 'rangeRemove', id: 'r1' })).toBe(gone);
  });

  test('rangeHighlight switches the target spec on and off', () => {
    const on = withRange();
    const off = M.reduce(on, { type: 'rangeHighlight', id: 'r1', highlight: false });
    expect(off.ranges[0].highlight).toBe(false);
    expect(off.event).toBeNull();
    expect(off.rev).toBe(on.rev + 1);
    expect(M.decorationSpecs(off).some(spec => spec.kind === 'target')).toBe(false);

    const again = M.reduce(off, { type: 'rangeHighlight', id: 'r1', highlight: true });
    expect(M.decorationSpecs(again).filter(spec => spec.kind === 'target')).toHaveLength(1);
    expect(again.rev).toBe(off.rev + 1);

    // The same value or an unknown range: nothing
    expect(M.reduce(again, { type: 'rangeHighlight', id: 'r1', highlight: true })).toBe(again);
    expect(M.reduce(again, { type: 'rangeHighlight', id: 'r9', highlight: false })).toBe(again);
  });

  test('a zero-length range follows text typed in front of it', () => {
    let state = M.reduce(M.createState(), { type: 'rangeAdd', id: 'r1', from: 22, to: 22, text: '', highlight: false });
    expect(state.ranges[0]).toMatchObject({ from: 22, to: 22 });

    state = mapWith(state, typed(0, 'Ja '));
    expect(state.ranges[0]).toMatchObject({ from: 25, to: 25 });
    // Typed exactly at the anchor: the anchor stays behind the typed text, and stays zero-length
    state = mapWith(state, typed(25, ' hiljaa'));
    expect(state.ranges[0]).toMatchObject({ from: 32, to: 32 });
    // Typed behind it: it does not move
    state = mapWith(state, typed(40));
    expect(state.ranges[0]).toMatchObject({ from: 32, to: 32 });
    expect(M.decorationSpecs(state)).toEqual([]);
  });

  test('a range does not grow over text typed at its edges and shrinks with a deletion inside', () => {
    let state = M.reduce(M.createState(), { type: 'rangeAdd', id: 'r1', from: 11, to: 22, text: SAMPLE.slice(11, 22), highlight: true });
    state = mapWith(state, typed(11, '('));
    state = mapWith(state, typed(23, ')'));
    expect(state.ranges[0]).toMatchObject({ from: 12, to: 23 });
    state = mapWith(state, deleted(14, 16));
    expect(state.ranges[0]).toMatchObject({ from: 12, to: 21 });
  });
});

describe('block', () => {
  const start = (state = M.createState(), pos = 22, extra = {}) => M.reduce(state, { type: 'blockStart', id: 'b1', pos, meta: META, docText: SAMPLE, ...extra });
  const finished = (text = 'Uusi virke.') => {
    let state = start();
    state = M.reduce(state, { type: 'blockAppend', id: 'b1', text });
    return M.reduce(state, { type: 'blockFinish', id: 'b1', status: 'done' });
  };

  test('blockStart is refused as busy when a block is pending and as conflict when a suggestion touches the position', () => {
    const state = start();
    expect(state.block).toMatchObject({ id: 'b1', pos: 22, attempt: 0, state: 'pending', meta: META });
    expect(state.block.attempts).toEqual([{ text: '', status: 'streaming', note: null }]);
    expect(state.block.context).toEqual({ before: SAMPLE.slice(6, 22), after: SAMPLE.slice(22, 38) });
    expect(state.currentId).toBe('b1');
    expect(state.event).toEqual({ type: 'block', action: 'start', blockId: 'b1' });

    const busy = M.reduce(state, { type: 'blockStart', id: 'b2', pos: 60, meta: META, docText: SAMPLE });
    expect(busy.event).toEqual({ type: 'block', action: 'refused', blockId: 'b2', reason: 'busy' });
    expect(busy.block.id).toBe('b1');

    const withSuggestion = proposed([at(SAMPLE, 'sanoi', 'kuiskasi')]);
    for (const pos of [4, 6, 9]) {
      const refused = start(withSuggestion, pos);
      expect(refused.event).toEqual({ type: 'block', action: 'refused', blockId: 'b1', reason: 'conflict' });
      expect(refused.block).toBeNull();
    }
    expect(start(withSuggestion, 10).block).not.toBeNull();
    // Nothing touches the document: the model has no text of its own
    expect(M.hasReviewable(state)).toBe(true);
  });

  test('blockAppend adds text only while the shown attempt is streaming', () => {
    let state = start();
    state = M.reduce(state, { type: 'blockAppend', id: 'b1', text: 'Sumu ' });
    state = M.reduce(state, { type: 'blockAppend', id: 'b1', text: 'nousi.\r\n' });
    expect(state.block.attempts[0]).toEqual({ text: 'Sumu nousi.\n', status: 'streaming', note: null });
    expect(state.event).toEqual({ type: 'block', action: 'append', blockId: 'b1' });

    const done = M.reduce(state, { type: 'blockFinish', id: 'b1' });
    const late = M.reduce(done, { type: 'blockAppend', id: 'b1', text: ' Lisää.' });
    expect(late.block).toBe(done.block);
    expect(late.event).toBeNull();
    expect(M.reduce(state, { type: 'blockAppend', id: 'b9', text: 'x' }).block).toBe(state.block);
  });

  test('blockFinish with status stopped keeps the given text', () => {
    let state = start();
    state = M.reduce(state, { type: 'blockAppend', id: 'b1', text: 'Sumu nousi. Sitten al' });
    state = M.reduce(state, { type: 'blockFinish', id: 'b1', status: 'stopped', text: 'Sumu nousi.', note: 'Pysäytetty. Teksti on leikattu viimeiseen kokonaiseen virkkeeseen.' });
    expect(state.block.attempts[0]).toEqual({
      text: 'Sumu nousi.',
      status: 'stopped',
      note: 'Pysäytetty. Teksti on leikattu viimeiseen kokonaiseen virkkeeseen.'
    });
    expect(state.event).toEqual({ type: 'block', action: 'finish', blockId: 'b1' });
    // Without a text the streamed one stays; done is the default status
    expect(finished('Sumu.').block.attempts[0]).toEqual({ text: 'Sumu.', status: 'done', note: null });
  });

  test('blockFinish on a stopped attempt changes nothing', () => {
    let state = start();
    state = M.reduce(state, { type: 'blockAppend', id: 'b1', text: 'Sumu nousi. Sitten al' });
    state = M.reduce(state, { type: 'blockFinish', id: 'b1', status: 'stopped', text: 'Sumu nousi.' });

    // The late result of the request the author stopped
    const late = M.reduce(state, { type: 'blockFinish', id: 'b1', status: 'error', text: '', note: 'Pyyntö pysäytettiin.' });
    expect(late.block).toBe(state.block);
    expect(late.event).toBeNull();
    expect(late.rev).toBe(state.rev);
    expect(M.reduce(late, { type: 'blockFinish', id: 'b1', status: 'done', text: 'Aivan muuta.' })).toBe(late);

    for (const status of ['done', 'error']) {
      const settled = M.reduce(M.reduce(start(), { type: 'blockAppend', id: 'b1', text: 'Teksti.' }), { type: 'blockFinish', id: 'b1', status });
      expect(M.reduce(settled, { type: 'blockFinish', id: 'b1', text: '' }).block).toBe(settled.block);
    }
  });

  test('blockFinish with meta replaces the block meta', () => {
    const logMeta = { ...META, model: 'vastannut-malli', requestLogId: 'req-7' };
    let state = M.reduce(start(), { type: 'blockAppend', id: 'b1', text: 'Sumu nousi.' });
    state = M.reduce(state, { type: 'blockFinish', id: 'b1', status: 'done', meta: logMeta });
    expect(state.block.meta).toBe(logMeta);
    expect(M.snapshot(state).block.meta).toBe(logMeta);
    // Without it the meta given at the start stays
    expect(finished().block.meta).toBe(META);
  });

  test('each attempt keeps the meta of its own request, and a decision names the request of the attempt on screen', () => {
    const first = { ...META, requestLogId: 'req-1' };
    const second = { ...META, requestLogId: 'req-2' };
    let state = M.reduce(start(), { type: 'blockAppend', id: 'b1', text: 'Ensimmäinen.' });
    state = M.reduce(state, { type: 'blockFinish', id: 'b1', status: 'done', meta: first });
    state = M.reduce(state, { type: 'blockRetry', id: 'b1' });
    state = M.reduce(state, { type: 'blockFinish', id: 'b1', status: 'done', text: 'Toinen.', meta: second });
    expect(state.block.attempts.map(attempt => attempt.meta)).toEqual([first, second]);
    // The block's own meta is the newest request's (the head names its model)
    expect(state.block.meta).toBe(second);

    // ‹ 1/2 › and Hyväksy: the decision row links to the request that wrote attempt 1
    const shown = M.reduce(state, { type: 'blockShow', id: 'b1', index: 0 });
    const change = M.blockChange(shown, SAMPLE);
    const mapper = M.makeMapper([change]);
    const accepted = M.reduce(shown, { type: 'blockAccepted', id: 'b1', insert: change.insert, mapPos: mapper.mapPos, touchesRange: mapper.touchesRange });
    expect(accepted.event.items[0].meta.requestLogId).toBe('req-1');
    // So does a rejection of the attempt on screen
    expect(M.reduce(shown, { type: 'blockReject', id: 'b1' }).event.items[0].meta.requestLogId).toBe('req-1');
    expect(M.reduce(state, { type: 'blockReject', id: 'b1' }).event.items[0].meta.requestLogId).toBe('req-2');
    // An attempt finished without meta (the facade's own test calls) falls back on the block's
    expect(finished().block.attempts[0]).not.toHaveProperty('meta');
  });

  test('blockFinish with empty text removes the attempt, and the block when it was the only attempt', () => {
    const only = M.reduce(start(), { type: 'blockFinish', id: 'b1', status: 'error', text: '', note: 'Ei ehdotusta.' });
    expect(only.block).toBeNull();
    expect(only.currentId).toBeNull();
    expect(only.event).toEqual({ type: 'block', action: 'empty', blockId: 'b1' });

    let state = M.reduce(finished('Ensimmäinen.'), { type: 'blockRetry', id: 'b1' });
    state = M.reduce(state, { type: 'blockAppend', id: 'b1', text: '  \n ' });
    state = M.reduce(state, { type: 'blockFinish', id: 'b1' });
    expect(state.block.attempts).toEqual([{ text: 'Ensimmäinen.', status: 'done', note: null }]);
    expect(state.block.attempt).toBe(0);
    expect(state.event).toEqual({ type: 'block', action: 'empty', blockId: 'b1' });
  });

  test('blockRetry keeps earlier attempts and is refused while one is streaming', () => {
    const streaming = M.reduce(start(), { type: 'blockAppend', id: 'b1', text: 'Kesken' });
    expect(M.reduce(streaming, { type: 'blockRetry', id: 'b1' }).block).toBe(streaming.block);

    const state = M.reduce(finished('Ensimmäinen.'), { type: 'blockRetry', id: 'b1' });
    expect(state.block.attempts).toEqual([
      { text: 'Ensimmäinen.', status: 'done', note: null },
      { text: '', status: 'streaming', note: null }
    ]);
    expect(state.block.attempt).toBe(1);
    expect(state.event).toEqual({ type: 'block', action: 'retry', blockId: 'b1' });
  });

  test('blockShow switches the attempt only when none is streaming', () => {
    let state = M.reduce(finished('Ensimmäinen.'), { type: 'blockRetry', id: 'b1' });
    expect(M.reduce(state, { type: 'blockShow', id: 'b1', index: 0 }).block.attempt).toBe(1);

    state = M.reduce(state, { type: 'blockFinish', id: 'b1', text: 'Toinen.' });
    const shown = M.reduce(state, { type: 'blockShow', id: 'b1', index: 0 });
    expect(shown.block.attempt).toBe(0);
    expect(shown.event).toEqual({ type: 'block', action: 'show', blockId: 'b1' });
    expect(M.snapshot(shown).block).toMatchObject({ text: 'Ensimmäinen.', attempt: 0, attemptCount: 2 });
    // Out of range is clamped
    expect(M.reduce(shown, { type: 'blockShow', id: 'b1', index: 9 }).block.attempt).toBe(1);
    expect(M.reduce(shown, { type: 'blockShow', id: 'b1', index: 0 }).event).toBeNull();
  });

  test('typing at the block position keeps the block and moves it behind the typed text', () => {
    const state = finished();
    const next = mapWith(state, typed(22, ' Hiljaa.'));
    expect(next.block).toMatchObject({ pos: 30, state: 'pending' });
    expect(next.event).toBeNull();
    expect(mapWith(state, typed(0, 'Ja ')).block.pos).toBe(25);
    // A deletion that starts or ends at the position does not reach across it
    expect(mapWith(state, deleted(22, 25)).block).toMatchObject({ pos: 22, state: 'pending' });
    expect(mapWith(state, deleted(19, 22)).block).toMatchObject({ pos: 19, state: 'pending' });
  });

  test('a change at the block position keeps the context of the side it did not reach', () => {
    const text = 'Hän sanoi niin. Sitten hän lähti kotiin.';
    const begun = M.reduce(M.createState(), { type: 'blockStart', id: 'b1', pos: 15, meta: META, docText: text });
    const block = M.reduce(begun, { type: 'blockFinish', id: 'b1', text: 'Hän huusi.' });
    const full = block.block.context;
    expect(full).toEqual({ before: text.slice(0, 15), after: text.slice(15, 31) });

    // Typed at the position: the typed text goes in front, the text behind is as it was
    const typedState = mapWith(block, typed(15, '!'));
    expect(typedState.block).toMatchObject({ pos: 16, context: { before: '', after: full.after } });
    // A deletion that starts at the position leaves the text in front; one that ends there, the text behind
    expect(mapWith(block, deleted(15, 22)).block.context).toEqual({ before: full.before, after: '' });
    expect(mapWith(block, deleted(10, 15)).block.context).toEqual({ before: '', after: full.after });

    // Restore still checks the side that is known
    const typedText = typeInto(text, 15, '!');
    const rejected = M.reduce(typedState, { type: 'blockReject', id: 'b1' });
    expect(M.reduce(rejected, { type: 'restore', docText: typedText }).block).toMatchObject({ pos: 16, state: 'pending' });
    const rewritten = 'Hän huusi kovaa.! Lopulta me lähti kotiin.';
    const stay = M.reduce(rejected, { type: 'restore', docText: rewritten });
    expect(stay.block.state).toBe('rejected');
    expect(stay.event).toMatchObject({ type: 'restored', ids: [], failed: 1 });
  });

  test('a failed attempt is not offered for insertion: blockChange is null', () => {
    let state = start();
    state = M.reduce(state, { type: 'blockFinish', id: 'b1', status: 'error', text: 'Osa tekstistä', note: 'Vastaus katkesi.' });
    expect(M.snapshot(state).block).toMatchObject({ status: 'error', text: 'Osa tekstistä' });
    expect(M.blockChange(state, SAMPLE)).toBeNull();
    // Another attempt that finishes is offered again
    state = M.reduce(state, { type: 'blockRetry', id: 'b1' });
    state = M.reduce(state, { type: 'blockFinish', id: 'b1', text: 'Uusi virke.' });
    expect(M.blockChange(state, SAMPLE)).toMatchObject({ from: 22, to: 22 });
  });

  test('a deletion across the block position rejects the block', () => {
    const state = finished();
    const next = mapWith(state, deleted(15, 30));
    expect(next.block).toMatchObject({ pos: 15, state: 'rejected', reason: 'edited' });
    expect(next.event).toEqual({ type: 'dropped', ids: ['b1'], reason: 'edited' });
    expect(next.notice).toEqual({ kind: 'dropped-edit', count: 1 });
    expect(next.currentId).toBeNull();
    expect(M.hasReviewable(next)).toBe(false);
    expect(M.decorationSpecs(next)).toEqual([]);
  });

  test('an external change at the block position rejects the block, and its undo brings it back', () => {
    const state = finished();
    const other = SAMPLE.replace('mene.”', 'mene!');   // the characters right in front of the block
    const gone = M.reduce(state, { type: 'rebase', oldText: SAMPLE, newText: other, diff: wordDiff });
    expect(gone.block).toMatchObject({ pos: 21, state: 'rejected', reason: 'external' });
    expect(gone.event).toEqual({ type: 'dropped', ids: ['b1'], reason: 'external', restored: [] });
    expect(gone.notice).toEqual({ kind: 'dropped-external', count: 1 });

    const back = M.reduce(gone, { type: 'rebase', oldText: other, newText: SAMPLE, diff: wordDiff });
    expect(back.block).toMatchObject({ pos: 22, state: 'pending' });
    expect(back.block).not.toHaveProperty('reason');
    expect(back.event).toEqual({ type: 'restored', ids: ['b1'], auto: true, failed: 0 });

    // A change that does not reach the position moves the block and leaves it pending
    const near = M.reduce(state, { type: 'rebase', oldText: SAMPLE, newText: SAMPLE.replace('Älä', 'Et'), diff: wordDiff });
    expect(near.block).toMatchObject({ pos: 21, state: 'pending' });
    const far = M.reduce(state, { type: 'rebase', oldText: SAMPLE, newText: 'Niin ' + SAMPLE.replace('kypsä', 'raaka'), diff: wordDiff });
    expect(far.block).toMatchObject({ pos: 27, state: 'pending' });
    expect(far.event).toBeNull();
  });

  // Final pass (T-077): the rule changed. A settled draft was kept with the text it had, half a sentence
  // included; now it is stopped as Pysäytä stops it.
  const STOP_NOTE = 'Pysäytetty. Teksti on leikattu viimeiseen kokonaiseen virkkeeseen.';

  test('a block that is still streaming when it leaves the screen is kept as stopped, cut to its last full sentence', () => {
    let state = M.reduce(start(), { type: 'blockAppend', id: 'b1', text: 'Sumu nousi. Sitten' });
    state = M.reduce(state, { type: 'blockReject', id: 'b1', insert: ' Sumu nousi. Sitten' });
    expect(state.block).toMatchObject({ state: 'rejected', reason: 'user' });
    expect(state.block.attempts).toEqual([{ text: 'Sumu nousi.', status: 'stopped', note: STOP_NOTE }]);
    // The decision row names what was kept, not the half sentence on screen
    expect(state.event.items[0]).toMatchObject({ id: 'b1', insert: 'Sumu nousi.' });
    // Without any text, or without one full sentence, there is nothing to keep
    expect(M.reduce(start(), { type: 'blockReject', id: 'b1' }).block).toBeNull();
    const half = M.reduce(start(), { type: 'blockAppend', id: 'b1', text: 'Sumu nousi järvel' });
    expect(M.reduce(half, { type: 'blockReject', id: 'b1' }).block).toBeNull();
  });

  test('a streaming block pushed aside by an edit across its place keeps its last full sentence with the stop note, and Palauta hylätyt brings back only that (T-077)', () => {
    let state = M.reduce(start(), { type: 'blockAppend', id: 'b1', text: 'Sumu nousi järveltä. "Tule jo," hän sanoi, ja' });
    const gone = mapWith(state, deleted(15, 30));
    expect(gone.block).toMatchObject({ pos: 15, state: 'rejected', reason: 'edited' });
    expect(gone.block.attempts).toEqual([{ text: 'Sumu nousi järveltä.', status: 'stopped', note: STOP_NOTE }]);
    expect(gone.event).toEqual({ type: 'dropped', ids: ['b1'], reason: 'edited' });

    // The undo of the edit brings the stopped draft back, never the half sentence
    const back = M.reduce(gone, { type: 'rebase', oldText: SAMPLE.slice(0, 15) + SAMPLE.slice(30), newText: SAMPLE, diff: wordDiff });
    expect(M.snapshot(back).block).toMatchObject({ state: 'pending', status: 'stopped', text: 'Sumu nousi järveltä.', note: STOP_NOTE });
    // Palauta hylätyt of a draft rejected mid-stream, where the text still stands: what it inserts is the full sentence
    const rejected = M.reduce(state, { type: 'blockReject', id: 'b1' });
    const restored = M.reduce(rejected, { type: 'restore', docText: SAMPLE });
    expect(M.snapshot(restored).block).toMatchObject({ state: 'pending', status: 'stopped', text: 'Sumu nousi järveltä.', note: STOP_NOTE });
    expect(M.blockChange(restored, SAMPLE)).toEqual({ from: 22, to: 22, insert: ' Sumu nousi järveltä.' });

    // The text is in the manuscript's typography, as a stop in the editor gives it
    state = M.reduce(start(), { type: 'blockAppend', id: 'b1', text: 'Hän sanoi: "Tule." Sitten hän' });
    expect(mapWith(state, deleted(15, 30)).block.attempts[0].text).toBe('Hän sanoi: ”Tule.”');

    // Before its first full sentence the draft goes; a draft of one attempt goes with it
    state = M.reduce(start(), { type: 'blockAppend', id: 'b1', text: 'Sumu nousi järvel' });
    const none = mapWith(state, deleted(15, 30));
    expect(none.block).toBeNull();
    expect(none.event).toEqual({ type: 'dropped', ids: ['b1'], reason: 'edited' });
  });

  test('a streaming retry pushed aside keeps the earlier attempts, and is dropped itself without a full sentence (T-077)', () => {
    let state = M.reduce(start(), { type: 'blockAppend', id: 'b1', text: 'Ensimmäinen virke.' });
    state = M.reduce(state, { type: 'blockFinish', id: 'b1', status: 'done' });
    state = M.reduce(state, { type: 'blockRetry', id: 'b1' });
    const withHalf = M.reduce(state, { type: 'blockAppend', id: 'b1', text: 'Toinen yri' });
    const dropped = mapWith(withHalf, deleted(15, 30));
    expect(dropped.block.attempts).toEqual([{ text: 'Ensimmäinen virke.', status: 'done', note: null }]);
    expect(dropped.block.attempt).toBe(0);

    const withWhole = M.reduce(state, { type: 'blockAppend', id: 'b1', text: 'Toinen yritys. Ja kolm' });
    const kept = mapWith(withWhole, deleted(15, 30));
    expect(kept.block.attempts).toEqual([
      { text: 'Ensimmäinen virke.', status: 'done', note: null },
      { text: 'Toinen yritys.', status: 'stopped', note: STOP_NOTE }
    ]);
    expect(kept.block.attempt).toBe(1);
  });

  test('a streaming block that a restored suggestion or an external change pushes aside is stopped the same way (T-077)', () => {
    // An external change at the block's place (an undo of another step, a replace-all)
    let state = M.reduce(start(), { type: 'blockAppend', id: 'b1', text: 'Sumu nousi. Sitten' });
    const other = SAMPLE.replace('mene.”', 'mene!');
    const gone = M.reduce(state, { type: 'rebase', oldText: SAMPLE, newText: other, diff: wordDiff });
    expect(gone.block).toMatchObject({ state: 'rejected', reason: 'external' });
    expect(gone.block.attempts).toEqual([{ text: 'Sumu nousi.', status: 'stopped', note: STOP_NOTE }]);

    // A suggestion that comes back onto the block's place (the undo of its accept)
    const item = at(SAMPLE, 'mene.”', 'tule.”');
    let withItem = propose(M.createState(), SAMPLE, [item]);
    const accepted = withItem.items[0];
    state = start(M.reduce(withItem, { type: 'remove', ids: [accepted.id] }), 22);
    state = M.reduce(state, { type: 'blockAppend', id: 'b1', text: 'Sumu nousi. Sitten' });
    const landed = M.reduce(state, { type: 'propose', docText: SAMPLE, changes: [accepted], restore: true });
    expect(landed.block).toMatchObject({ state: 'rejected', reason: 'external' });
    expect(landed.block.attempts).toEqual([{ text: 'Sumu nousi.', status: 'stopped', note: STOP_NOTE }]);
  });

  test('blockReject keeps the block for restore and reports it like a one-item group', () => {
    const state = finished('Uusi virke.');
    const next = M.reduce(state, { type: 'blockReject', id: 'b1', insert: ' Uusi virke.' });
    expect(next.block).toMatchObject({ id: 'b1', state: 'rejected' });
    expect(next.event).toMatchObject({ type: 'rejected', ids: ['b1'], bulk: false, reason: 'user', block: true });
    expect(next.event.items[0]).toMatchObject({ id: 'b1', groupId: 'b1', from: 22, to: 22, insert: ' Uusi virke.', original: '', meta: META });
    expect(M.decorationSpecs(next)).toEqual([]);
    expect(M.snapshot(next).block.state).toBe('rejected');
  });

  test('blockAccepted removes the block and reports its attempts in the event', () => {
    let state = M.reduce(finished('Ensimmäinen.'), { type: 'blockRetry', id: 'b1' });
    state = M.reduce(state, { type: 'blockFinish', id: 'b1', text: 'Toinen.' });
    state = propose(state, SAMPLE, [at(SAMPLE, 'mennyt', 'lähtenyt')], { select: false });
    const change = M.blockChange(state, SAMPLE);
    expect(change).toEqual({ from: 22, to: 22, insert: ' Toinen.' });

    const mapper = M.makeMapper([change]);
    const next = M.reduce(state, { type: 'blockAccepted', id: 'b1', insert: change.insert, mapPos: mapper.mapPos, touchesRange: mapper.touchesRange });
    expect(next.block).toBeNull();
    expect(next.event).toMatchObject({ type: 'accepted', ids: ['b1'], bulk: false });
    expect(next.event.block).toEqual({
      attempts: [{ text: 'Ensimmäinen.', status: 'done', note: null }, { text: 'Toinen.', status: 'done', note: null }],
      attempt: 1
    });
    expect(next.event.items[0]).toMatchObject({ id: 'b1', groupId: 'b1', from: 22, to: 22, insert: ' Toinen.', original: '', meta: META });
    expect(next.event.items[0].block).toEqual(next.event.block);
    // The suggestion behind it moved by the inserted text and is current now
    expect(byOriginal(next, 'mennyt')).toMatchObject({ from: 38, to: 44 });
    expect(next.currentId).toBe(byOriginal(next, 'mennyt').id);

    // The undo of the accept brings the block back with every attempt
    const restored = M.reduce(next, { type: 'propose', docText: SAMPLE, changes: next.event.items, restore: true });
    expect(restored.block).toMatchObject({ id: 'b1', pos: 22, attempt: 1, state: 'pending', meta: META });
    expect(restored.block.attempts).toHaveLength(2);
    expect(restored.event).toMatchObject({ type: 'proposed', ids: ['b1'] });
  });

  test('a streaming block cannot be accepted and is not in the review order', () => {
    let state = propose(M.createState(), SAMPLE, [at(SAMPLE, 'mennyt', 'lähtenyt')]);
    state = start(state, 22);
    state = M.reduce(state, { type: 'blockAppend', id: 'b1', text: 'Kesken' });
    expect(M.blockChange(state, SAMPLE)).toBeNull();
    const stepped = M.reduce(state, { type: 'step', direction: 1, head: 0 });
    expect(stepped.currentId).toBe(byOriginal(state, 'mennyt').id);
    expect(M.reduce(stepped, { type: 'step', direction: 1, head: 0 }).currentId).toBe(stepped.currentId);

    // Once finished it is one stop of the round, at its place
    const done = M.reduce(stepped, { type: 'blockFinish', id: 'b1' });
    expect(M.reduce(done, { type: 'step', direction: 1, head: 0 }).currentId).toBe('b1');
    expect(M.reduce(done, { type: 'setCurrent', id: 'b1' }).currentId).toBe('b1');
  });

  test('restore brings a rejected block back while the text around it is unchanged', () => {
    const rejected = M.reduce(finished(), { type: 'blockReject', id: 'b1' });
    const back = M.reduce(rejected, { type: 'restore', docText: SAMPLE });
    expect(back.block).toMatchObject({ id: 'b1', pos: 22, state: 'pending' });
    expect(back.block).not.toHaveProperty('reason');
    expect(back.event).toEqual({ type: 'restored', ids: ['b1'], auto: false, failed: 0 });
    expect(back.currentId).toBe('b1');

    // The sentence in front of it was rewritten: the place is no longer the same
    const changedText = SAMPLE.replace('mene.”', 'tule!”');
    const stay = M.reduce(rejected, { type: 'restore', docText: changedText });
    expect(stay.block.state).toBe('rejected');
    expect(stay.event).toMatchObject({ type: 'restored', ids: [], failed: 1 });
    // The notice says the draft is the one that failed (final-pass review; was { kind, count } only)
    expect(stay.notice).toEqual({ kind: 'restore-failed', count: 1, block: true });
  });
});

describe('blockInsertText', () => {
  const BLANK = 'Eka kappale.\n\nToka kappale jatkuu tässä.\n\n';
  const TIGHT = 'Eka kappale.\nToka kappale jatkuu tässä.\n';

  test('on an empty line the text is inserted as it is', () => {
    expect(M.blockInsertText(BLANK, BLANK.length, 'Loppuun.')).toBe('Loppuun.');
    expect(M.blockInsertText(BLANK, 13, 'Väliin.')).toBe('Väliin.');
    expect(M.blockInsertText('', 0, 'Alku.')).toBe('Alku.');
    expect(M.blockInsertText('Eka.\n   \nToka.', 6, 'Väliin.')).toBe('Väliin.');
  });

  test('at the end of a paragraph the text becomes a new paragraph with a blank line when the chapter uses blank lines', () => {
    expect(M.blockInsertText(BLANK, 12, 'Uusi kappale.')).toBe('\n\nUusi kappale.');
    expect(M.blockInsertText(BLANK, BLANK.indexOf('tässä.') + 6, 'Uusi kappale.')).toBe('\n\nUusi kappale.');
  });

  test('at the end of a paragraph the text becomes a new paragraph with a single break when the chapter uses none', () => {
    expect(M.blockInsertText(TIGHT, 12, 'Uusi kappale.')).toBe('\nUusi kappale.');
    expect(M.blockInsertText('Yksi ainoa kappale.', 19, 'Toinen.')).toBe('\nToinen.');
  });

  test('at the start of a paragraph the text is followed by the paragraph gap', () => {
    expect(M.blockInsertText(BLANK, 14, 'Uusi kappale.')).toBe('Uusi kappale.\n\n');
    expect(M.blockInsertText(TIGHT, 13, 'Uusi kappale.')).toBe('Uusi kappale.\n');
    expect(M.blockInsertText(BLANK, 0, 'Aivan alkuun.')).toBe('Aivan alkuun.\n\n');
  });

  test('inside a paragraph the text is inserted inline with a space on each side where words would touch', () => {
    const text = 'Toka kappale jatkuu tässä.';
    expect(M.blockInsertText(text, 12, 'vielä')).toBe(' vielä');              // before " jatkuu": a space is there already
    expect(M.blockInsertText(text, 13, 'vielä')).toBe('vielä ');              // behind the space, in front of "jatkuu"
    expect(M.blockInsertText(text, 8, 'XX')).toBe(' XX ');                    // in the middle of a word
    expect(M.blockInsertText('Yksi  kaksi', 5, 'ja')).toBe('ja');             // between two spaces
  });

  test('no space is added before , . ; : ! ? … ) ” »', () => {
    const text = 'Hän tuli (myöhään) ja sanoi ”hei”.';
    for (const mark of [',', '.', ';', ':', '!', '?', '…', ')', '”', '»']) {
      // The model text starts with the mark: nothing in front of it
      expect(M.blockInsertText('Hän tuli kotiin', 8, mark + ' ja')).toBe(mark + ' ja');
      expect(M.blockInsertText('Hän tulikotiin', 8, mark + ' ja')).toBe(mark + ' ja ');
      // The manuscript goes on with the mark: nothing behind the inserted text
      const follow = 'Hän tuli' + mark + ' Sitten';
      expect(M.blockInsertText(follow, 8, 'kotiin')).toBe(' kotiin');
    }
    expect(M.blockInsertText(text, text.indexOf(')'), 'eilen')).toBe(' eilen');
    expect(M.blockInsertText(text, text.indexOf('”.'), 'vaan')).toBe(' vaan');
  });

  test('a dialogue paragraph "– Älä mene, hän sanoi." keeps its en dash and is not turned into a list item', () => {
    const text = 'Ovi kävi.\n\nHän kääntyi.';
    const out = M.blockInsertText(text, 9, '– Älä mene, hän sanoi.');
    expect(out).toBe('\n\n– Älä mene, hän sanoi.');
    expect(out).not.toMatch(/^\s*[-*+] /m);
    // Several lines of dialogue stay as they came, the breaks between them too
    expect(M.blockInsertText(text, 9, '– Älä mene.\n– Menen silti.')).toBe('\n\n– Älä mene.\n– Menen silti.');
    expect(M.blockInsertText('', 0, '– ”Älä”, hän sanoi – ja lähti.')).toBe('– ”Älä”, hän sanoi – ja lähti.');
  });

  test('leading line breaks and trailing whitespace of the model text are removed', () => {
    expect(M.blockInsertText('', 0, '\n\nSumu nousi.  \n\n')).toBe('Sumu nousi.');
    expect(M.blockInsertText('', 0, '\r\nSumu.\r\nSade.\r\n')).toBe('Sumu.\nSade.');
    expect(M.blockInsertText('Eka.', 4, '\n\n  ')).toBe('');
    expect(M.blockInsertText('Eka.', 4, '')).toBe('');
    expect(M.blockInsertText('Eka.', 4, undefined)).toBe('');
  });
});

describe('decorationSpecs and snapshot', () => {
  const kinds = (state) => M.decorationSpecs(state).map(spec => spec.kind);

  test('changes mode gives del for the original and ins at its end', () => {
    const state = proposed([at(SAMPLE, 'sanoi', 'kuiskasi')]);
    const id = state.items[0].id;
    expect(M.decorationSpecs(state)).toEqual([
      { kind: 'del', from: 4, to: 9, id, current: true },
      { kind: 'ins', pos: 9, id, text: 'kuiskasi', current: true, plain: false }
    ]);
  });

  test('a pure insertion gives only ins; a pure deletion gives only del', () => {
    const state = proposed([insertAt(3, ' taas'), at(SAMPLE, ' mennyt', '')]);
    expect(M.decorationSpecs(state).map(spec => [spec.kind, spec.from != null ? spec.from : spec.pos])).toEqual([
      ['ins', 3],
      ['del', 29]
    ]);
  });

  test('a deleted paragraph break gives a break spec; an inserted one stays in the ins text', () => {
    const text = 'Eka kappale.\n\nToka kappale.';
    const joined = propose(M.createState(), text, [{ from: 12, to: 14, insert: ' ' }]);
    const id = joined.items[0].id;
    expect(M.decorationSpecs(joined)).toEqual([
      { kind: 'del', from: 12, to: 14, id, current: true },
      { kind: 'break', pos: 12, id },
      { kind: 'break', pos: 13, id },
      { kind: 'ins', pos: 14, id, text: ' ', current: true, plain: false }
    ]);

    const split = propose(M.createState(), 'Eka virke. Toka virke.', [{ from: 10, to: 11, insert: '\n\n' }]);
    expect(kinds(split)).toEqual(['del', 'ins']);
    expect(M.decorationSpecs(split)[1].text).toBe('\n\n');
  });

  test('original mode gives orig and point and no inserted text', () => {
    const state = M.reduce(proposed(), { type: 'setView', viewMode: 'original' });
    const specs = M.decorationSpecs(state);
    expect(specs.map(spec => spec.kind)).toEqual(['point', 'orig', 'orig', 'orig']);
    expect(specs[0]).toEqual({ kind: 'point', pos: 3, id: state.items[0].id, current: true });
    expect(specs[1]).toEqual({ kind: 'orig', from: 4, to: 9, id: state.items[1].id, current: false });
    expect(specs.some(spec => 'text' in spec)).toBe(false);
  });

  test('new mode gives hide and plain ins', () => {
    const state = M.reduce(proposed([at(SAMPLE, 'sanoi', 'kuiskasi'), at(SAMPLE, ' mennyt', ''), insertAt(3, ' taas')]), { type: 'setView', viewMode: 'new' });
    const ids = state.items.map(item => item.id);
    expect(M.decorationSpecs(state)).toEqual([
      { kind: 'ins', pos: 3, id: ids[0], text: ' taas', current: true, plain: true },
      { kind: 'hide', from: 4, to: 9, id: ids[1] },
      { kind: 'ins', pos: 9, id: ids[1], text: 'kuiskasi', current: false, plain: true },
      { kind: 'hide', from: 29, to: 36, id: ids[2] }
    ]);
  });

  test('only the current suggestion has current true', () => {
    let state = proposed();
    state = M.reduce(state, { type: 'setCurrent', id: byOriginal(state, 'mennyt').id });
    for (const mode of ['changes', 'original', 'new']) {
      const specs = M.decorationSpecs(M.reduce(state, { type: 'setView', viewMode: mode }));
      const current = specs.filter(spec => spec.current === true);
      expect(current.length).toBeGreaterThan(0);
      expect(new Set(current.map(spec => spec.id))).toEqual(new Set([byOriginal(state, 'mennyt').id]));
    }
  });

  test('rejected suggestions produce no spec', () => {
    const state = proposed();
    const rejected = M.reduce(state, { type: 'reject', ids: state.items.map(item => item.id) });
    for (const mode of ['changes', 'original', 'new']) {
      expect(M.decorationSpecs({ ...rejected, viewMode: mode })).toEqual([]);
    }
  });

  test('a suggestion next to <u>kypsä</u> and [TODO: tarkista] leaves both outside every spec range', () => {
    const note = [SAMPLE.indexOf('[TODO'), SAMPLE.indexOf(']') + 1];
    const underline = [SAMPLE.indexOf('<u>'), SAMPLE.indexOf('</u>') + 4];
    const state = proposed([at(SAMPLE, 'oli', 'on'), insertAt(SAMPLE.indexOf(' oli'), ' vielä'), at(SAMPLE, 'åkerö', 'Åkerö')]);
    expect(state.items).toHaveLength(3);

    for (const mode of ['changes', 'original', 'new']) {
      for (const spec of M.decorationSpecs({ ...state, viewMode: mode })) {
        const from = spec.from != null ? spec.from : spec.pos;
        const to = spec.to != null ? spec.to : spec.pos;
        for (const [start, end] of [note, underline]) {
          // No spec reaches into the note or the tags (touching their outer edge is all right)
          expect(to <= start || from >= end).toBe(true);
        }
      }
    }
    // The texts of the note and the underline are in no original either
    expect(state.items.some(item => /TODO|<u>|<\/u>/.test(item.original + item.insert))).toBe(false);
  });

  test('the block is drawn in changes and new mode, not in original', () => {
    let state = M.reduce(M.createState(), { type: 'blockStart', id: 'b1', pos: 22, meta: META, docText: SAMPLE });
    state = M.reduce(state, { type: 'blockAppend', id: 'b1', text: 'Sumu nousi.' });
    expect(M.decorationSpecs(state)).toEqual([
      { kind: 'block', pos: 22, id: 'b1', text: 'Sumu nousi.', status: 'streaming', attempt: 0, attemptCount: 1, note: null, current: true }
    ]);
    expect(kinds({ ...state, viewMode: 'new' })).toEqual(['block']);
    expect(kinds({ ...state, viewMode: 'original' })).toEqual([]);
  });

  test('specs are sorted by position', () => {
    let state = proposed();
    state = M.reduce(state, { type: 'rangeAdd', id: 'r1', from: 11, to: 22, text: SAMPLE.slice(11, 22), highlight: true });
    state = M.reduce(state, { type: 'blockStart', id: 'b1', pos: 24, meta: META, docText: SAMPLE });
    const starts = M.decorationSpecs(state).map(spec => (spec.from != null ? spec.from : spec.pos));
    expect(starts).toEqual(starts.slice().sort((a, b) => a - b));
    expect(kinds(state)).toEqual(['ins', 'del', 'ins', 'target', 'block', 'del', 'ins', 'del', 'ins']);
  });

  test('snapshot lists pending by position and gives currentIndex -1 when the block is current', () => {
    let state = proposed();
    state = M.reduce(state, { type: 'reject', ids: [byOriginal(state, 'sanoi').id] });
    state = M.reduce(state, { type: 'setCurrent', id: byOriginal(state, 'åkerö').id });
    let shot = M.snapshot(state);
    expect(shot.pending.map(item => item.original)).toEqual(['', 'mennyt', 'åkerö']);
    expect(shot.rejected.map(item => item.original)).toEqual(['sanoi']);
    expect(shot.currentIndex).toBe(2);
    expect(shot).toMatchObject({ currentId: byOriginal(state, 'åkerö').id, viewMode: 'changes', notice: null, rev: state.rev, block: null });

    state = M.reduce(state, { type: 'blockStart', id: 'b1', pos: 22, meta: META, docText: SAMPLE });
    state = M.reduce(state, { type: 'blockAppend', id: 'b1', text: 'Sumu nousi.' });
    shot = M.snapshot(state);
    expect(shot.currentId).toBe('b1');
    expect(shot.currentIndex).toBe(-1);
    expect(shot.block).toEqual({ id: 'b1', pos: 22, state: 'pending', status: 'streaming', text: 'Sumu nousi.', attempt: 0, attemptCount: 1, note: null, meta: META });
  });
});

describe('bulkAcceptIds', () => {
  const mixed = () => {
    let state = propose(M.createState(), SAMPLE, [
      at(SAMPLE, 'sanoi', 'kuiskasi'),
      at(SAMPLE, 'Älä', 'Et', { meta: { ...META, dialogue: true } }),
      at(SAMPLE, 'mennyt', 'lähtenyt')
    ], { groupId: 'ajo' });
    return propose(state, SAMPLE, [at(SAMPLE, 'åkerö', 'Åkerö'), at(SAMPLE, 'mene', 'tule', { meta: { ...META, dialogue: true } })], { groupId: 'muu', select: false });
  };

  test('bulkAcceptIds leaves out suggestions whose meta says dialogue', () => {
    const state = mixed();
    expect(M.pendingItems(state)).toHaveLength(5);
    const ids = M.bulkAcceptIds(state, null);
    expect(ids.map(id => state.items.find(item => item.id === id).original)).toEqual(['sanoi', 'mennyt', 'åkerö']);
    // Only the flag itself counts
    const loose = propose(M.createState(), SAMPLE, [at(SAMPLE, 'sanoi', 'kuiskasi', { meta: { ...META, dialogue: 'ehkä' } }), at(SAMPLE, 'mennyt', 'lähtenyt', { meta: null })], { meta: null });
    expect(M.bulkAcceptIds(loose, null)).toHaveLength(2);
  });

  test('bulkAcceptIds with a group id returns only that group', () => {
    const state = mixed();
    expect(M.bulkAcceptIds(state, 'ajo').map(id => state.items.find(item => item.id === id).original)).toEqual(['sanoi', 'mennyt']);
    expect(M.bulkAcceptIds(state, 'muu').map(id => state.items.find(item => item.id === id).original)).toEqual(['åkerö']);
    expect(M.bulkAcceptIds(state, 'ei-ole')).toEqual([]);
    // Rejected ones are not taken
    const rejected = M.reduce(state, { type: 'reject', ids: M.bulkAcceptIds(state, 'ajo') });
    expect(M.bulkAcceptIds(rejected, 'ajo')).toEqual([]);
  });
});

describe('relocateTarget', () => {
  const sentence = '”Älä mene.”';
  const start = SAMPLE.indexOf(sentence);
  const target = { text: sentence, start, end: start + sentence.length };

  test('relocateTarget returns the stored offsets while the text is still there', () => {
    expect(M.relocateTarget(SAMPLE, target)).toEqual({ from: 11, to: 22 });
    // Also when the same words occur a second time elsewhere
    expect(M.relocateTarget(SAMPLE + ' ' + sentence, target)).toEqual({ from: 11, to: 22 });
  });

  test('relocateTarget finds the single occurrence after text was typed in front of it', () => {
    expect(M.relocateTarget('Ja sitten ' + SAMPLE, target)).toEqual({ from: 21, to: 32 });
    expect(M.relocateTarget(SAMPLE.replace('Hän sanoi: ', ''), target)).toEqual({ from: 0, to: 11 });
  });

  test('relocateTarget returns null when the text occurs twice or not at all', () => {
    expect(M.relocateTarget('Ja ' + SAMPLE + ' ' + sentence, target)).toBeNull();
    expect(M.relocateTarget(SAMPLE.replace('Älä', 'Äla'), target)).toBeNull();
    expect(M.relocateTarget('', target)).toBeNull();
  });

  test('relocateTarget returns null for a missing target', () => {
    expect(M.relocateTarget(SAMPLE, null)).toBeNull();
    expect(M.relocateTarget(SAMPLE, undefined)).toBeNull();
    expect(M.relocateTarget(SAMPLE, { text: '', start: 3, end: 3 })).toBeNull();
    expect(M.relocateTarget(SAMPLE, { start: 0, end: 3 })).toBeNull();
    // Offsets that are missing do not stop the search by text
    expect(M.relocateTarget(SAMPLE, { text: sentence })).toEqual({ from: 11, to: 22 });
  });
});

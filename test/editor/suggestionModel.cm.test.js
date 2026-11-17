/**
 * @jest-environment node
 */
// The only test file of the model that loads CodeMirror: it checks that the
// pure model agrees with the real ChangeSet the editor will hand it.
const { ChangeSet, Text } = require('@codemirror/state');
const M = require('../../src/editor/suggestionModel');

const SAMPLE = 'Hän sanoi: ”Älä mene.” – Enkä mennyt, vaikka åkerö [TODO: tarkista] oli <u>kypsä</u>.';
const REVISED = 'Hän taas kuiskasi: ”Älä mene.” – Enkä lähtenyt, vaikka Åkerö [TODO: tarkista] oli <u>kypsä</u>.';

const at = (word, insert) => {
  const from = SAMPLE.indexOf(word);
  return { from, to: from + word.length, insert, original: word };
};
const FOUR = [at('mennyt', 'lähtenyt'), at('sanoi', 'kuiskasi'), at('åkerö', 'Åkerö'), { from: 3, to: 3, insert: ' taas' }];

const docOf = (text) => Text.of(text.split('\n'));
const through = (set) => ({
  mapPos: (pos, assoc) => set.mapPos(pos, assoc),
  touchesRange: (from, to) => set.touchesRange(from, to)
});

// Small seeded generator, so that a failure can be repeated
function randomSource(seed) {
  let state = seed >>> 0;
  return (limit) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * limit);
  };
}

// Sorted changes that never overlap; they may touch end to start
function randomChanges(random, length, most = 4) {
  const changes = [];
  let pos = random(6);
  while (pos <= length && changes.length < most) {
    const to = Math.min(length, pos + random(4));
    const insert = 'xyzå'.slice(0, random(5));
    if (to > pos || insert) changes.push({ from: pos, to, insert });
    pos = to + random(4) + (to === pos && !insert ? 1 : 0);
  }
  return changes;
}

beforeEach(() => M.resetIds());

test('makeMapper agrees with ChangeSet.mapPos and touchesRange on 500 random change lists', () => {
  const random = randomSource(20261117);
  let lists = 0;
  let checks = 0;

  while (lists < 500) {
    const length = 5 + random(40);
    const changes = randomChanges(random, length);
    if (!changes.length) continue;
    lists++;

    const set = ChangeSet.of(changes, length);
    const mapper = M.makeMapper(changes);
    for (let pos = 0; pos <= length; pos++) {
      for (const assoc of [-1, 1]) {
        checks++;
        if (mapper.mapPos(pos, assoc) !== set.mapPos(pos, assoc)) {
          throw new Error(`mapPos(${pos}, ${assoc}) differs for ${JSON.stringify(changes)} in a text of ${length}`);
        }
      }
      for (let end = pos; end <= Math.min(length, pos + 6); end++) {
        checks++;
        if (mapper.touchesRange(pos, end) !== set.touchesRange(pos, end)) {
          throw new Error(`touchesRange(${pos}, ${end}) differs for ${JSON.stringify(changes)} in a text of ${length}`);
        }
      }
    }
    // The default arguments are CodeMirror's as well
    expect(mapper.mapPos(0)).toBe(set.mapPos(0));
    expect(mapper.touchesRange(length)).toBe(set.touchesRange(length));
  }

  expect(lists).toBe(500);
  expect(checks).toBeGreaterThan(50000);
});

test('mapSuggestions driven by a real ChangeSet: accepting "sanoi → kuiskasi" keeps the other three suggestions and their text', () => {
  const { items } = M.createSuggestions(SAMPLE, FOUR, { groupId: 'g1' });
  const sanoi = items.find(item => item.original === 'sanoi');
  const rest = items.filter(item => item !== sanoi);

  const set = ChangeSet.of([{ from: sanoi.from, to: sanoi.to, insert: sanoi.insert }], SAMPLE.length);
  const text = set.apply(docOf(SAMPLE)).toString();
  expect(text).toBe(SAMPLE.replace('sanoi', 'kuiskasi'));

  const { kept, dropped } = M.mapSuggestions(rest, through(set).mapPos, through(set).touchesRange);
  expect(dropped).toEqual([]);
  expect(kept.map(item => item.original)).toEqual(['', 'mennyt', 'åkerö']);
  for (const item of kept) {
    expect(text.slice(item.from, item.to)).toBe(item.original);
  }
  // The insertion in front of the accepted word did not move, the two behind it moved by three
  expect(kept.map(item => item.from)).toEqual([3, 33, 48]);
});

test('one ChangeSet built from acceptChanges(null) turns the sample into the revised text', () => {
  const state = M.reduce(M.createState(), { type: 'propose', docText: SAMPLE, changes: FOUR });
  const changes = M.acceptChanges(state, null);
  expect(changes).toHaveLength(4);

  const set = ChangeSet.of(changes, SAMPLE.length);
  expect(set.apply(docOf(SAMPLE)).toString()).toBe(REVISED);

  // The reducer, fed by the same ChangeSet, has nothing left
  const next = M.reduce(state, { type: 'accepted', ids: state.items.map(item => item.id), ...through(set) });
  expect(next.items).toEqual([]);
  expect(next.event.bulk).toBe(true);
});

test('after that ChangeSet is inverted, the stored items match the text again (undo re-proposal)', () => {
  const state = M.reduce(M.createState(), { type: 'propose', docText: SAMPLE, changes: FOUR });
  const set = ChangeSet.of(M.acceptChanges(state, null), SAMPLE.length);
  const accepted = M.reduce(state, { type: 'accepted', ids: state.items.map(item => item.id), ...through(set) });
  const stored = accepted.event.items;       // what the undo step keeps

  const revised = set.apply(docOf(SAMPLE));
  const undone = set.invert(docOf(SAMPLE)).apply(revised).toString();
  expect(undone).toBe(SAMPLE);
  for (const item of stored) {
    expect(M.stillMatches(undone, item)).toBe(true);
  }

  // Proposed again as they were: the same ids, the same places
  const back = M.reduce(accepted, { type: 'propose', docText: undone, changes: stored, restore: true });
  expect(back.items.map(item => [item.id, item.from, item.to, item.insert])).toEqual(
    state.items.map(item => [item.id, item.from, item.to, item.insert])
  );
  expect(back.items.every(item => item.state === 'pending')).toBe(true);
  expect(ChangeSet.of(M.acceptChanges(back, null), undone.length).apply(docOf(undone)).toString()).toBe(REVISED);
});

test('after random edits and accepts every pending suggestion still matches the document', () => {
  const random = randomSource(4.1);
  const words = ['sade', 'ja', 'tuuli', 'että', 'kun', 'Åke', 'öinen', '–', '”niin”', 'mutta'];

  for (let round = 0; round < 60; round++) {
    let text = Array.from({ length: 30 }, () => words[random(words.length)]).join(' ');
    // Insertions (commas) and replacements, close to each other
    const proposals = [];
    for (let pos = 3 + random(5); pos < text.length - 2; pos += 2 + random(9)) {
      if (random(2)) proposals.push({ from: pos, to: pos, insert: ',' });
      else proposals.push({ from: pos, to: Math.min(text.length, pos + 1 + random(3)), insert: 'Ö' });
    }
    let state = M.reduce(M.createState(), { type: 'propose', docText: text, changes: proposals });

    for (let step = 0; step < 12; step++) {
      const pending = M.pendingItems(state);
      let set;
      if (pending.length && random(3) === 0) {
        // Accept one or two suggestions
        const ids = [pending[random(pending.length)].id, pending[random(pending.length)].id];
        set = ChangeSet.of(M.acceptChanges(state, ids), text.length);
        state = M.reduce(state, { type: 'accepted', ids, ...through(set) });
      } else {
        // The author types or deletes somewhere
        const changes = randomChanges(random, text.length, 1 + random(2));
        if (!changes.length) continue;
        set = ChangeSet.of(changes, text.length);
        state = M.reduce(state, { type: 'map', ...through(set) });
      }
      text = set.apply(docOf(text)).toString();

      const now = M.pendingItems(state);
      for (const item of now) {
        if (!M.stillMatches(text, item)) {
          throw new Error(`round ${round}, step ${step}: ${JSON.stringify(item)} does not match ${JSON.stringify(text)}`);
        }
      }
      // Pending suggestions never touch each other, so any of them can be accepted alone
      for (let i = 1; i < now.length; i++) {
        expect(now[i].from).toBeGreaterThan(now[i - 1].to);
      }
    }
  }
});

// Finest word diff for the rebase: words and the gaps between them, longest common subsequence
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

test('a suggestion that survives an external change does what it would have done before the change', () => {
  // The check: accepting the suggestion and then making the outside change gives the same text
  // as making the outside change and then accepting the moved suggestion (CodeMirror's own
  // change mapping is the referee). Words repeat and edits sit next to suggestions on purpose,
  // so that changes often border a suggestion and have two equal forms.
  const random = randomSource(57);
  const words = ['ja', 'ja', 'se', 'oli', 'oli', 'niin', 'Åke'];
  let survived = 0;
  let dropped = 0;

  for (let round = 0; round < 400; round++) {
    const tokens = Array.from({ length: 8 + random(6) }, () => words[random(words.length)]);
    const oldText = tokens.join(' ');
    const starts = [];
    for (let i = 0, pos = 0; i < tokens.length; pos += tokens[i].length + 1, i++) starts.push(pos);

    // Suggestions on every third word or so: a replacement of the word, or an insertion in front of it
    const proposals = [];
    for (let i = random(3); i < tokens.length; i += 2 + random(3)) {
      if (random(2)) proposals.push({ from: starts[i], to: starts[i] + tokens[i].length, insert: 'UUSI' });
      else proposals.push({ from: starts[i], to: starts[i], insert: 'lisä ' });
    }
    const state = M.reduce(M.createState(), { type: 'propose', docText: oldText, changes: proposals });

    // The outside change: a word taken out, put in or replaced
    const next = tokens.slice();
    const at = random(tokens.length);
    const kind = random(3);
    if (kind === 0) next.splice(at, 1);
    else if (kind === 1) next.splice(at, 0, words[random(words.length)]);
    else next[at] = 'muu';
    const newText = next.join(' ');
    if (newText === oldText) continue;

    const rebased = M.reduce(state, { type: 'rebase', oldText, newText, diff: random(2) ? wordDiff : undefined });
    const outside = ChangeSet.of([M.singleChange(oldText, newText)], oldText.length);

    for (const before of M.pendingItems(state)) {
      const after = rebased.items.find(item => item.id === before.id);
      if (after.state !== 'pending') { dropped++; continue; }
      survived++;

      const own = ChangeSet.of([{ from: before.from, to: before.to, insert: before.insert }], oldText.length);
      const accepted = own.apply(docOf(oldText));
      const either = [false, true].map(first => outside.map(own, first).apply(accepted).toString());
      const moved = newText.slice(0, after.from) + after.insert + newText.slice(after.to);
      if (!either.includes(moved)) {
        throw new Error(`round ${round}: ${JSON.stringify(before)} on ${JSON.stringify(oldText)} → ${JSON.stringify(newText)} gave ${JSON.stringify(moved)}, expected one of ${JSON.stringify(either)}`);
      }
      expect(M.stillMatches(newText, after)).toBe(true);
    }
  }

  // Both outcomes occur, or the check proves nothing
  expect(survived).toBeGreaterThan(500);
  expect(dropped).toBeGreaterThan(50);
});

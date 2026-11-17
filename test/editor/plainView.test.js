/**
 * @jest-environment node
 */
const { plainView, PLAIN_PATTERNS } = require('../../src/editor/plainView');

// The raw text of a plain range
function rawOf(raw, view, plainFrom, plainTo) {
  const range = view.rawRange(plainFrom, plainTo);
  return raw.slice(range.from, range.to);
}

// The plain range of a word or phrase of the plain text
function plainRangeOf(view, phrase) {
  const from = view.text.indexOf(phrase);
  if (from === -1) throw new Error(`"${phrase}" is not in the plain text`);
  return [from, from + phrase.length];
}

describe('what is taken out', () => {
  test('text without notes or tags comes back unchanged with identity maps', () => {
    const raw = '– Tuletko sinä jo? hän huusi.\n\nÅke-setä sanoi: ”Älä!” – ja lähti.';
    const view = plainView(raw);

    expect(view.text).toBe(raw);
    expect(view.removed).toEqual([]);
    for (let pos = 0; pos <= raw.length; pos++) {
      expect(view.toRaw(pos)).toBe(pos);
      expect(view.toRaw(pos, 'end')).toBe(pos);
      expect(view.toPlain(pos)).toBe(pos);
    }
    expect(view.rawRange(3, 10)).toEqual({ from: 3, to: 10 });
    expect(view.protectedIn(0, raw.length)).toEqual([]);
  });

  test('a TODO note in the middle of a sentence takes the space before it', () => {
    const raw = 'Antti [TODO: ikä] tuli.';
    const view = plainView(raw);

    expect(view.text).toBe('Antti tuli.');
    expect(view.removed).toEqual([{ from: 5, to: 17, kind: 'todo', at: 5 }]);
    expect(raw.slice(5, 17)).toBe(' [TODO: ikä]');
  });

  test('a TODO note at the end of a line takes the space before it', () => {
    const view = plainView('Loppu [TODO: x]\nSeuraava rivi');
    expect(view.text).toBe('Loppu\nSeuraava rivi');
    expect(view.removed).toEqual([{ from: 5, to: 15, kind: 'todo', at: 5 }]);

    // The end of the text counts as a line end
    expect(plainView('Loppu [TODO: x]').text).toBe('Loppu');
  });

  test('a TODO note at the start of a line takes the space after it', () => {
    const raw = 'Eka rivi\n[TODO: tarkista] Toka rivi';
    const view = plainView(raw);

    expect(view.text).toBe('Eka rivi\nToka rivi');
    expect(view.removed).toEqual([{ from: 9, to: 26, kind: 'todo', at: 9 }]);
    expect(raw.slice(9, 26)).toBe('[TODO: tarkista] ');

    // The start of the text counts as a line start
    expect(plainView('[TODO: x] Alku').text).toBe('Alku');
  });

  test('a line that is only a TODO note becomes an empty line', () => {
    const view = plainView('Ennen\n[TODO: koko rivi]\nJälkeen');
    expect(view.text).toBe('Ennen\n\nJälkeen');
    expect(view.removed).toEqual([{ from: 6, to: 23, kind: 'todo', at: 6 }]);
  });

  test('a note before a full stop leaves no space before the stop', () => {
    expect(plainView('Loppu [TODO: x].').text).toBe('Loppu.');
    // The same for the other marks that close a clause
    expect(plainView('Hän tuli [TODO: milloin], ja lähti.').text).toBe('Hän tuli, ja lähti.');
    expect(plainView('”Tule [TODO: sävy]”, hän sanoi.').text).toBe('”Tule”, hän sanoi.');
    expect(plainView('Tuliko hän [TODO: kuka]?').text).toBe('Tuliko hän?');
  });

  test('an unclosed [TODO: is not a note and stays', () => {
    const raw = 'Sana [TODO: kesken\njatkuu] ja loppu.';
    const view = plainView(raw);
    expect(view.text).toBe(raw);
    expect(view.removed).toEqual([]);

    // Other brackets are text
    expect(plainView('Hän [nauroi] ja [todo: pieni] meni.').text).toBe('Hän [nauroi] ja [todo: pieni] meni.');
  });

  test('<u> and </u> are removed and the underlined word stays', () => {
    const raw = 'Hän käveli <u>hitaasti</u> rantaa kohti.';
    const view = plainView(raw);

    expect(view.text).toBe('Hän käveli hitaasti rantaa kohti.');
    expect(view.removed).toEqual([
      { from: 11, to: 14, kind: 'tag', at: 11 },
      { from: 22, to: 26, kind: 'tag', at: 19 }
    ]);
  });

  test('a tag inside a TODO note is not counted twice', () => {
    const raw = 'Alku [TODO: onko <u>tämä</u> oikein] loppu.';
    const view = plainView(raw);

    expect(view.text).toBe('Alku loppu.');
    expect(view.removed).toHaveLength(1);
    expect(view.removed[0]).toMatchObject({ kind: 'todo', from: 4, at: 4 });
    // The maps count the note once: what follows it is where it should be
    expect(view.toRaw(view.text.indexOf('loppu'))).toBe(raw.indexOf('loppu'));
    expect(view.toPlain(raw.indexOf('loppu'))).toBe(view.text.indexOf('loppu'));
  });

  test('a single tag without its pair is removed too', () => {
    expect(plainView('Sana <u>jäi auki.').text).toBe('Sana jäi auki.');
    expect(plainView('Sana jäi</u> kiinni.').text).toBe('Sana jäi kiinni.');
  });

  test('two notes in a row leave one space and their ranges do not overlap', () => {
    const cases = [
      ['a [TODO: x] [TODO: y] b', 'a b'],
      ['a [TODO: x][TODO: y] b', 'a b'],
      ['a [TODO: x][TODO: y].', 'a.'],
      ['a [TODO: x] [TODO: y]', 'a'],
      ['[TODO: x] [TODO: y] z', 'z'],
      ['Rivi\n[TODO: x] [TODO: y]\nToinen', 'Rivi\n\nToinen']
    ];
    for (const [raw, plain] of cases) {
      const view = plainView(raw);
      expect(view.text).toBe(plain);
      for (let i = 1; i < view.removed.length; i++) {
        expect(view.removed[i].from).toBeGreaterThanOrEqual(view.removed[i - 1].to);
      }
      // What was taken out and what is left add up to the raw text
      const removedLength = view.removed.reduce((sum, range) => sum + (range.to - range.from), 0);
      expect(view.text.length + removedLength).toBe(raw.length);
    }
  });

  test('a note after a no-break space or a tab takes that space', () => {
    expect(plainView('Hinta 5\u00a0[TODO: valuutta], sanoi hän.').text).toBe('Hinta 5, sanoi hän.');
    expect(plainView('Sarake\t[TODO: x]\nRivi').text).toBe('Sarake\nRivi');
  });

  test('CRLF line ends count as line ends around a note', () => {
    expect(plainView('Loppu [TODO: x]\r\nSeuraava').text).toBe('Loppu\r\nSeuraava');
    expect(plainView('Eka\r\n[TODO: x] Toka').text).toBe('Eka\r\nToka');
  });

  test('empty and missing input give an empty view', () => {
    for (const input of ['', null, undefined]) {
      const view = plainView(input);
      expect(view.text).toBe('');
      expect(view.removed).toEqual([]);
      expect(view.toRaw(0)).toBe(0);
      expect(view.toPlain(0)).toBe(0);
      expect(view.rawRange(0, 0)).toEqual({ from: 0, to: 0 });
      expect(view.protectedIn(0, 10)).toEqual([]);
    }
  });

  test('the exported patterns are the note and tag rules and keep no position between calls', () => {
    expect(PLAIN_PATTERNS.todo.source).toBe('\\[TODO:[^\\]\\n]*\\]');
    expect(PLAIN_PATTERNS.tag.source).toBe('<\\/?u>');
    expect(Object.isFrozen(PLAIN_PATTERNS)).toBe(true);

    // plainView works on copies: a lastIndex left on the exported expressions changes nothing
    PLAIN_PATTERNS.todo.lastIndex = 7;
    PLAIN_PATTERNS.tag.lastIndex = 7;
    expect(plainView('[TODO: a] <u>b</u> c').text).toBe('b c');
    expect(plainView('[TODO: a] <u>b</u> c').text).toBe('b c');
    PLAIN_PATTERNS.todo.lastIndex = 0;
    PLAIN_PATTERNS.tag.lastIndex = 0;
  });
});

describe('the maps', () => {
  const raw = 'Hän käveli <u>hitaasti</u> rantaa kohti. [TODO: tarkista] Antti tuli.';
  const view = plainView(raw);

  test('the plain range of an underlined word maps to the word without its tags', () => {
    const [from, to] = plainRangeOf(view, 'hitaasti');
    expect(view.rawRange(from, to)).toEqual({ from: raw.indexOf('hitaasti'), to: raw.indexOf('</u>') });
    expect(rawOf(raw, view, from, to)).toBe('hitaasti');
  });

  test('a plain range across an underlined word maps to a raw range that contains both tags', () => {
    const [from, to] = plainRangeOf(view, 'käveli hitaasti rantaa');
    expect(rawOf(raw, view, from, to)).toBe('käveli <u>hitaasti</u> rantaa');
  });

  test('protectedIn returns the tags inside a range and nothing for the inner word', () => {
    const [outerFrom, outerTo] = plainRangeOf(view, 'käveli hitaasti rantaa');
    const outer = view.rawRange(outerFrom, outerTo);
    expect(view.protectedIn(outer.from, outer.to).map(range => [range.kind, raw.slice(range.from, range.to)]))
      .toEqual([['tag', '<u>'], ['tag', '</u>']]);

    const [innerFrom, innerTo] = plainRangeOf(view, 'hitaasti');
    const inner = view.rawRange(innerFrom, innerTo);
    expect(view.protectedIn(inner.from, inner.to)).toEqual([]);

    // A range that reaches over the note returns the note
    const [from] = plainRangeOf(view, 'kohti.');
    const [, to] = plainRangeOf(view, 'Antti');
    const across = view.rawRange(from, to);
    expect(view.protectedIn(across.from, across.to).map(range => range.kind)).toEqual(['todo']);
    // Touching is not intersecting: a range that ends where the note begins is free
    const note = view.removed.find(range => range.kind === 'todo');
    expect(view.protectedIn(0, note.from).map(range => range.kind)).toEqual(['tag', 'tag']);
    expect(view.protectedIn(note.to, raw.length)).toEqual([]);
  });

  test('an empty range maps in front of a note at that position', () => {
    const note = view.removed.find(range => range.kind === 'todo');
    // The note stood at this plain position: an insertion there goes in front of it
    expect(view.rawRange(note.at, note.at)).toEqual({ from: note.from, to: note.from });
    // The same in front of an opening tag
    const tag = view.removed[0];
    expect(view.rawRange(tag.at, tag.at)).toEqual({ from: tag.from, to: tag.from });
    // A range that starts there starts after it
    expect(view.rawRange(note.at, note.at + 6)).toEqual({ from: note.to, to: note.to + 6 });
    expect(raw.slice(note.to, note.to + 6)).toBe(' Antti');
  });

  test('toPlain of a position inside a removed note is the note\'s plain position', () => {
    const note = view.removed.find(range => range.kind === 'todo');
    for (let pos = note.from; pos <= note.to; pos++) {
      expect(view.toPlain(pos)).toBe(note.at);
    }
    expect(view.toPlain(note.to + 1)).toBe(note.at + 1);
    // Inside a tag as well
    expect(view.toPlain(raw.indexOf('<u>') + 1)).toBe(view.text.indexOf('hitaasti'));
  });

  test('toRaw and toPlain round-trip for every character of a text with ä, ö, å, ” and –', () => {
    const source = '– Älä mene, Åke sanoi. [TODO: murre?] ”Jää <u>tänne</u> yöksi” – hän jatkoi [TODO: tauko].\n[TODO: uusi kohtaus]\nÖisin järvi oli tyyni.';
    const mapped = plainView(source);
    expect(mapped.text).toBe('– Älä mene, Åke sanoi. ”Jää tänne yöksi” – hän jatkoi.\n\nÖisin järvi oli tyyni.');

    for (let pos = 0; pos < mapped.text.length; pos++) {
      // The character at a plain position is the character at its raw position
      expect(source[mapped.toRaw(pos)]).toBe(mapped.text[pos]);
      expect(mapped.toPlain(mapped.toRaw(pos))).toBe(pos);
      expect(mapped.toPlain(mapped.toRaw(pos, 'end'))).toBe(pos);
    }
    expect(mapped.toRaw(mapped.text.length)).toBe(source.length);
    // Raw positions never map backwards
    let last = 0;
    for (let pos = 0; pos <= source.length; pos++) {
      const plain = mapped.toPlain(pos);
      expect(plain).toBeGreaterThanOrEqual(last);
      expect(plain).toBeLessThanOrEqual(mapped.text.length);
      last = plain;
    }
  });

  test('the documented vector: käveli <u>hitaasti</u> … [TODO: koko rivi] … Loppu [TODO: x].', () => {
    const vector = 'Hän käveli <u>hitaasti</u> rantaa kohti. [TODO: tarkista] Antti [TODO: ikä] tuli.\n[TODO: koko rivi]\nLoppu [TODO: x].';
    const mapped = plainView(vector);

    expect(mapped.text).toBe('Hän käveli hitaasti rantaa kohti. Antti tuli.\n\nLoppu.');
    expect(mapped.removed.map(range => range.kind)).toEqual(['tag', 'tag', 'todo', 'todo', 'todo', 'todo']);

    const [wordFrom, wordTo] = plainRangeOf(mapped, 'hitaasti');
    expect(rawOf(vector, mapped, wordFrom, wordTo)).toBe('hitaasti');

    const [from, to] = plainRangeOf(mapped, 'käveli hitaasti rantaa');
    const range = mapped.rawRange(from, to);
    expect(vector.slice(range.from, range.to)).toBe('käveli <u>hitaasti</u> rantaa');
    expect(mapped.protectedIn(range.from, range.to).map(found => vector.slice(found.from, found.to))).toEqual(['<u>', '</u>']);

    expect(mapped.toPlain(vector.indexOf('rantaa'))).toBe(mapped.text.indexOf('rantaa'));
    expect(mapped.toPlain(vector.indexOf('Loppu'))).toBe(mapped.text.indexOf('Loppu'));
  });
});

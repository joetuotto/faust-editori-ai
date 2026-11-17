/**
 * @jest-environment node
 */
const { splitBlocks, proseLines, blockAt } = require('../../src/editor/blocks');
const { parseBlocks } = require('../../utils/manuscript');

const text = [
  '# Otsikko',             // 1
  '',                      // 2
  'Kissa istui.',          // 3
  '- yksi',                // 4
  '> Lainaus.',            // 5
  '– Hei, sanoi Pekka.',   // 6
  '* * *',                 // 7
  '- Hei, sanoi Liisa.'    // 8
].join('\n');

describe('splitBlocks', () => {
  test('numbers every line and says what it is', () => {
    expect(splitBlocks(text).map(b => [b.n, b.kind])).toEqual([
      [1, 'heading'], [2, 'blank'], [3, 'paragraph'], [4, 'list'], [5, 'quote'], [6, 'paragraph'], [7, 'break'], [8, 'list']
    ]);
  });

  test('from/to and bodyFrom/bodyTo point into the text; the prefix stays outside the body', () => {
    const blocks = splitBlocks(text);
    expect(blocks[0]).toEqual({
      n: 1, from: 0, to: 9, kind: 'heading', text: '# Otsikko', prefix: '# ', body: 'Otsikko', bodyFrom: 2, bodyTo: 9, level: 1, marker: '#'
    });
    expect(blocks[3]).toEqual({
      n: 4, from: 24, to: 30, kind: 'list', text: '- yksi', prefix: '- ', body: 'yksi', bodyFrom: 26, bodyTo: 30, ordered: false, marker: '-'
    });
    for (const block of blocks) {
      expect(text.slice(block.from, block.to)).toBe(block.text);
      expect(text.slice(block.bodyFrom, block.bodyTo)).toBe(block.body);
      expect(text.slice(block.from, block.bodyFrom)).toBe(block.prefix);
    }
  });

  test('a dialogue dash line is a paragraph marked as dialogue; a hyphen line is a list', () => {
    const blocks = splitBlocks(text);
    expect(blocks[5]).toMatchObject({ kind: 'paragraph', dialogue: true, body: '– Hei, sanoi Pekka.' });
    expect(blocks[2]).toMatchObject({ kind: 'paragraph', dialogue: false });
    expect(blocks[7]).toMatchObject({ kind: 'list', marker: '-', body: 'Hei, sanoi Liisa.' });
    // only paragraphs carry the flag
    expect(blocks[7]).not.toHaveProperty('dialogue');
    expect(blocks[0]).not.toHaveProperty('dialogue');
  });

  test('---, ***, * * *, ___ and - - - are scene breaks with nothing to edit', () => {
    for (const line of ['---', '***', '* * *', '___', '- - -']) {
      const block = splitBlocks(line)[0];
      expect(block).toMatchObject({ kind: 'break', body: '', prefix: '', text: line, bodyFrom: 0, bodyTo: 0 });
    }
  });

  test('numbered lists, quotes without text and headings without text', () => {
    expect(splitBlocks('12) kohta')[0]).toMatchObject({ kind: 'list', ordered: true, marker: '12)', prefix: '12) ', body: 'kohta' });
    expect(splitBlocks('1. eka')[0]).toMatchObject({ kind: 'list', ordered: true, marker: '1.', prefix: '1. ', body: 'eka' });
    expect(splitBlocks('> ')[0]).toMatchObject({ kind: 'quote', body: '', marker: '>', prefix: '> ' });
    expect(splitBlocks('### ')[0]).toMatchObject({ kind: 'heading', level: 3, body: '', marker: '###', prefix: '### ' });
  });

  test('#tagi, -- Hei and 10.30 are ordinary paragraphs', () => {
    expect(splitBlocks('#tagi\n-- Hei\n10.30 lähdimme.').map(b => b.kind)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    // as in export today, a date at the start of a line is a numbered list item
    expect(splitBlocks('10. kesäkuuta lähdimme.')[0]).toMatchObject({ kind: 'list', ordered: true, marker: '10.', body: 'kesäkuuta lähdimme.' });
  });

  test('an indented paragraph: the indentation is the prefix, trailing spaces are outside the body', () => {
    expect(splitBlocks('  sisennetty kappale  ')[0]).toMatchObject({ prefix: '  ', body: 'sisennetty kappale', bodyFrom: 2, bodyTo: 20 });
  });

  test('CRLF and a lone CR are line breaks; offsets stay those of the text', () => {
    expect(splitBlocks('a\r\nb\rc').map(b => [b.n, b.from, b.to, b.text])).toEqual([[1, 0, 1, 'a'], [2, 3, 4, 'b'], [3, 5, 6, 'c']]);
    const crlf = '# Otsikko\r\n- kohta\r\n';
    expect(splitBlocks(crlf).map(b => [b.kind, b.from, b.to, b.bodyFrom, b.bodyTo, b.body])).toEqual([
      ['heading', 0, 9, 2, 9, 'Otsikko'], ['list', 11, 18, 13, 18, 'kohta'], ['blank', 20, 20, 20, 20, '']
    ]);
  });

  test('empty and missing text are one blank line; a trailing line break adds one', () => {
    expect(splitBlocks('')).toEqual([{ n: 1, from: 0, to: 0, kind: 'blank', text: '', prefix: '', body: '', bodyFrom: 0, bodyTo: 0 }]);
    expect(splitBlocks(undefined)).toHaveLength(1);
    expect(splitBlocks(null)).toHaveLength(1);
    expect(splitBlocks('a\n').map(b => b.kind)).toEqual(['paragraph', 'blank']);
  });

  test('agrees with parseBlocks of utils/manuscript.js on what every line is', () => {
    const sample = [
      'Kissa istui **ikkunalla**.', '', '* * *', '## Väliotsikko', '> Lainattu ajatus.', '- yksi', '  * kaksi', '1. eka', '2) toka',
      '– Hei, sanoi Pekka.', '- Hei, sanoi Pekka.', '---', '#tagi', '  sisennetty kappale  ', '-- Hei', '> ', '# ', '___', '- - -',
      '10.30 lähdimme.', '10. kesäkuuta lähdimme.', '+ plus', '>ilman väliä', '####### seitsemän'
    ].join('\n');
    expect(sample.split('\n')).toHaveLength(24);
    // parseBlocks joins neighbouring list lines into one list block
    const mine = [];
    let previous = null;
    for (const block of splitBlocks(sample)) {
      if (block.kind === 'blank') continue;
      const key = block.kind === 'list' ? `list-${block.ordered}` : block.kind;
      if (!(block.kind === 'list' && previous === key)) mine.push(block.kind);
      previous = key;
    }
    expect(mine).toEqual(parseBlocks(sample).map(b => b.type));
  });

  // Cases beyond the named list

  test('the count equals the number of lines, blank ones included', () => {
    const lines = 'eka\n\n\ntoka\n  \nkolmas\n';
    const blocks = splitBlocks(lines);
    expect(blocks).toHaveLength(lines.split('\n').length);
    blocks.forEach((block, index) => expect(block.n).toBe(index + 1));
  });

  test('a line of spaces is blank: no prefix, no body, both body offsets at its start', () => {
    expect(splitBlocks('a\n   \nb')[1]).toEqual({ n: 2, from: 2, to: 5, kind: 'blank', text: '   ', prefix: '', body: '', bodyFrom: 2, bodyTo: 2 });
  });

  test('heading levels 1 to 6; the bullets -, * and +; an indented bullet keeps its indentation in the prefix', () => {
    expect(splitBlocks('###### kuusi')[0]).toMatchObject({ kind: 'heading', level: 6, marker: '######', body: 'kuusi' });
    expect(splitBlocks('####### seitsemän')[0]).toMatchObject({ kind: 'paragraph', body: '####### seitsemän' });
    expect(splitBlocks('* tähti\n+ plus').map(b => [b.kind, b.ordered, b.marker])).toEqual([['list', false, '*'], ['list', false, '+']]);
    expect(splitBlocks('  * kaksi')[0]).toMatchObject({ kind: 'list', marker: '*', prefix: '  * ', body: 'kaksi', bodyFrom: 4, bodyTo: 9 });
    expect(splitBlocks('>ilman väliä')[0]).toMatchObject({ kind: 'quote', prefix: '>', body: 'ilman väliä', bodyFrom: 1 });
  });

  test('an em dash and an indented dash line are dialogue; a dash later in the line is not', () => {
    expect(splitBlocks('— Hei, sanoi Pekka.')[0]).toMatchObject({ kind: 'paragraph', dialogue: true });
    expect(splitBlocks('  – Hei.')[0]).toMatchObject({ kind: 'paragraph', dialogue: true, prefix: '  ', body: '– Hei.' });
    expect(splitBlocks('Hän sanoi – hiljaa – ettei tule.')[0]).toMatchObject({ kind: 'paragraph', dialogue: false });
  });

  test('ä, ö and å and an emoji do not disturb the offsets', () => {
    const line = '- Äiti näki 😀 öisin Åken.';
    const block = splitBlocks(`Eka.\n${line}`)[1];
    expect(block).toMatchObject({ from: 5, to: 5 + line.length, bodyFrom: 7, body: 'Äiti näki 😀 öisin Åken.' });
  });
});

describe('proseLines', () => {
  const blocks = splitBlocks(text);

  test('gives paragraphs and list items, not headings, scene breaks or quotes', () => {
    expect(proseLines(blocks)).toEqual([
      { n: 3, from: 11, to: 23, text: 'Kissa istui.', kind: 'paragraph' },
      { n: 4, from: 26, to: 30, text: 'yksi', kind: 'list' },
      { n: 6, from: 42, to: 61, text: '– Hei, sanoi Pekka.', kind: 'paragraph' },
      { n: 8, from: 70, to: 87, text: 'Hei, sanoi Liisa.', kind: 'list' }
    ]);
  });

  test('quotes: true adds quote lines; lists: false drops list items', () => {
    expect(proseLines(blocks, { quotes: true, lists: false }).map(l => l.n)).toEqual([3, 5, 6]);
    expect(proseLines(blocks, { quotes: true })[2]).toEqual({ n: 5, from: 33, to: 41, text: 'Lainaus.', kind: 'quote' });
  });

  test('dialogue: false skips dash lines; with dashDialogue a "- " line is dialogue too', () => {
    expect(proseLines(blocks, { dialogue: false }).map(l => l.n)).toEqual([3, 4, 8]);
    expect(proseLines(blocks, { dialogue: false, dashDialogue: true }).map(l => l.n)).toEqual([3]);
    expect(proseLines(blocks, { lists: false, dashDialogue: true }).map(l => l.n)).toEqual([3, 4, 6, 8]);
  });

  test('from and to keep only the lines a selection touches', () => {
    expect(proseLines(blocks, { from: 11, to: 23 }).map(l => l.n)).toEqual([3]);
    expect(proseLines(blocks, { from: 20, to: 45 }).map(l => l.n)).toEqual([3, 4, 6]);
  });

  test('a line with nothing after its marker is skipped', () => {
    expect(proseLines(splitBlocks('- \n> \nteksti'), { quotes: true }).map(l => l.n)).toEqual([3]);
  });

  // Cases beyond the named list

  test('with dashDialogue only the "-" marker is dialogue; * and numbered lines still follow lists', () => {
    const mixed = splitBlocks('- Hei, sanoi Pekka.\n* kohta\n1. eka\n– Niin.');
    expect(proseLines(mixed, { dashDialogue: true, dialogue: false }).map(l => l.n)).toEqual([2, 3]);
    expect(proseLines(mixed, { dashDialogue: true, lists: false }).map(l => l.n)).toEqual([1, 4]);
  });

  test('a caret at the end or the start of a line touches that line; the marker never leaves', () => {
    expect(proseLines(blocks, { from: 30, to: 30 }).map(l => l.n)).toEqual([4]);
    expect(proseLines(blocks, { from: 24, to: 24 })).toEqual([{ n: 4, from: 26, to: 30, text: 'yksi', kind: 'list' }]);
    // a selection that only covers a heading and a blank line has no prose
    expect(proseLines(blocks, { from: 0, to: 10 })).toEqual([]);
  });

  test('missing blocks and missing options are fine', () => {
    expect(proseLines(undefined)).toEqual([]);
    expect(proseLines(blocks, null).map(l => l.n)).toEqual([3, 4, 6, 8]);
  });
});

describe('blockAt', () => {
  test('finds the line of a position; the end of the line belongs to it', () => {
    const blocks = splitBlocks(text);
    expect(blockAt(blocks, 0).n).toBe(1);
    expect(blockAt(blocks, 9).n).toBe(1);
    expect(blockAt(blocks, 10).n).toBe(2);
    expect(blockAt(blocks, 23).n).toBe(3);
    expect(blockAt(blocks, 999)).toBeNull();
  });

  // Cases beyond the named list

  test('every position of the text has a line; positions outside it, and no blocks at all, give null', () => {
    const blocks = splitBlocks(text);
    for (let pos = 0; pos <= text.length; pos++) {
      const block = blockAt(blocks, pos);
      expect(pos).toBeGreaterThanOrEqual(block.from);
      expect(pos).toBeLessThanOrEqual(block.to);
    }
    expect(blockAt(blocks, text.length).n).toBe(8);
    expect(blockAt(blocks, -1)).toBeNull();
    expect(blockAt(blocks, text.length + 1)).toBeNull();
    expect(blockAt(blocks, NaN)).toBeNull();
    expect(blockAt([], 0)).toBeNull();
    expect(blockAt(undefined, 0)).toBeNull();
  });

  test('a position between \\r and \\n belongs to the line that the break ends', () => {
    const blocks = splitBlocks('a\r\nb');
    expect(blockAt(blocks, 1).n).toBe(1);
    expect(blockAt(blocks, 2).n).toBe(1);
    expect(blockAt(blocks, 3).n).toBe(2);
  });

  test('a list of lines with gaps (proseLines-style) gives null for a position in a gap', () => {
    const some = splitBlocks(text).filter(b => b.kind === 'paragraph');
    expect(blockAt(some, 11).n).toBe(3);
    expect(blockAt(some, 30)).toBeNull();
  });
});

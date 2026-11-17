/**
 * @jest-environment node
 */
const { resolveEditTarget } = require('../../src/editor/promptTarget');

// A small stand-in for src/editor/blocks.js (another package of the same
// change): the Block shape for the kinds of lines these tests use. The
// integration stage switches this file to the real module.
const stubBlocks = {
  splitBlocks(text) {
    const blocks = [];
    let from = 0;
    for (const line of text.split('\n')) {
      const to = from + line.length;
      let kind = 'paragraph';
      let prefix = '';
      let rest = line;
      let match;
      if (!line.trim()) kind = 'blank';
      else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) kind = 'break';
      else if ((match = /^(#{1,6}\s+)(.*)$/.exec(line))) [kind, prefix, rest] = ['heading', match[1], match[2]];
      else if ((match = /^(>\s?)(.*)$/.exec(line))) [kind, prefix, rest] = ['quote', match[1], match[2]];
      else if ((match = /^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/.exec(line))) [kind, prefix, rest] = ['list', match[1], match[2]];

      const plain = kind === 'blank' || kind === 'break';
      const body = plain ? '' : rest.trim();
      const bodyFrom = plain ? from : from + prefix.length + (rest.length - rest.trimStart().length);
      const block = { n: blocks.length + 1, from, to, kind, text: line, prefix: plain ? '' : text.slice(from, bodyFrom), body, bodyFrom, bodyTo: bodyFrom + body.length };
      if (kind === 'paragraph') block.dialogue = /^[–—]/.test(body);
      blocks.push(block);
      from = to + 1;
    }
    return blocks;
  },
  blockAt(blocks, pos) {
    return blocks.find((block) => pos >= block.from && pos <= block.to) || null;
  }
};

// "Kissa |istui| tässä": | marks the selection (one | = cursor)
function sel(marked) {
  const first = marked.indexOf('|');
  const rest = marked.slice(first + 1);
  const second = rest.indexOf('|');
  const text = marked.replace(/\|/g, '');
  return second === -1 ? [text, first, first] : [text, first, first + second];
}

// The resolved target shown the same way, with its kind in front
function show(marked) {
  const [text, from, to] = sel(marked);
  const result = resolveEditTarget(text, from, to, stubBlocks);
  if (!result.ok) return result.code;
  return `${result.kind}: ${text.slice(0, result.from)}|${text.slice(result.from, result.to)}|${text.slice(result.to)}`;
}

describe('resolveEditTarget with a selection', () => {
  test('resolveEditTarget shrinks a selection past spaces and line breaks at both ends', () => {
    expect(show('Kissa| istui |tässä.')).toBe('selection: Kissa |istui| tässä.');
    expect(show('Ensimmäinen.|\n\n Åke käveli öisin. \n|Kolmas.')).toBe('selection: Ensimmäinen.\n\n |Åke käveli öisin.| \nKolmas.');
    expect(show('Alku |\t”Lainaus” – ja loppu |.')).toBe('selection: Alku \t|”Lainaus” – ja loppu| .');
    // Nothing to shrink: the selection is the target
    expect(show('|Koko rivi.|')).toBe('selection: |Koko rivi.|');
  });

  test('a selection keeps its markers: only whitespace is cut', () => {
    expect(show('|# Otsikko\n- kohta |\nLoppu')).toBe('selection: |# Otsikko\n- kohta| \nLoppu');
    expect(show('Sana |[TODO: tarkista] ja <u>tämä</u>| loppu')).toBe('selection: Sana |[TODO: tarkista] ja <u>tämä</u>| loppu');
  });

  test('a selection made backwards gives the same target', () => {
    const text = 'Kissa istui tässä.';
    expect(resolveEditTarget(text, 12, 5, stubBlocks)).toEqual(resolveEditTarget(text, 5, 12, stubBlocks));
    expect(resolveEditTarget(text, 12, 5, stubBlocks)).toEqual({ ok: true, from: 6, to: 11, kind: 'selection' });
  });

  test('a selection of only whitespace falls back to the paragraph at its start', () => {
    expect(show('Ensimmäinen kappale.|  |Jatkuu.')).toBe('paragraph: |Ensimmäinen kappale.  Jatkuu.|');
    // The selection starts at the end of the first line and covers only the line break
    expect(show('Ensimmäinen kappale.|\n|Toinen kappale.')).toBe('paragraph: |Ensimmäinen kappale.|\nToinen kappale.');
    // Only blank lines selected: there is no paragraph at its start
    expect(show('Ensimmäinen.\n|\n\n|Kolmas.')).toBe('no-paragraph');
  });
});

describe('resolveEditTarget with a cursor', () => {
  test('resolveEditTarget on a cursor returns the whole paragraph body', () => {
    expect(show('Ensimmäinen.\nÅke käv|eli öisin.\nKolmas.')).toBe('paragraph: Ensimmäinen.\n|Åke käveli öisin.|\nKolmas.');
    // Cursor at the very start and at the very end of the line
    expect(show('Ensimmäinen.\n|Åke käveli öisin.\nKolmas.')).toBe('paragraph: Ensimmäinen.\n|Åke käveli öisin.|\nKolmas.');
    expect(show('Ensimmäinen.\nÅke käveli öisin.|\nKolmas.')).toBe('paragraph: Ensimmäinen.\n|Åke käveli öisin.|\nKolmas.');
    // Indentation and spaces at the line end stay outside
    expect(show('  Sisennetty ka|ppale.  \nSeuraava.')).toBe('paragraph:   |Sisennetty kappale.|  \nSeuraava.');
    // Notes and underline tags are part of the body; masking protects them later
    expect(show('Sana [TODO: tar|kista] ja <u>tämä</u>.')).toBe('paragraph: |Sana [TODO: tarkista] ja <u>tämä</u>.|');
  });

  test('resolveEditTarget leaves the list marker, quote marker and heading marker outside the target', () => {
    expect(show('- Maitoa ja lei|pää')).toBe('paragraph: - |Maitoa ja leipää|');
    expect(show('12) Kahdestoista ko|hta')).toBe('paragraph: 12) |Kahdestoista kohta|');
    expect(show('> Lainattu vir|ke.')).toBe('paragraph: > |Lainattu virke.|');
    expect(show('## Toinen lu|ku')).toBe('paragraph: ## |Toinen luku|');
    // Also with the cursor inside the marker itself
    expect(show('#|# Toinen luku')).toBe('paragraph: ## |Toinen luku|');
  });

  test('resolveEditTarget keeps a leading dialogue dash – inside the target', () => {
    expect(show('– Älä mene, Åke sa|noi.')).toBe('paragraph: |– Älä mene, Åke sanoi.|');
    expect(show('Kertoja.\n— Pitkä vii|va käy myös.\nLoppu.')).toBe('paragraph: Kertoja.\n|— Pitkä viiva käy myös.|\nLoppu.');
  });

  test('resolveEditTarget reports no-paragraph on an empty line and on * * *', () => {
    expect(show('Ensimmäinen.\n|\nKolmas.')).toBe('no-paragraph');
    expect(show('Ensimmäinen.\n  | \nKolmas.')).toBe('no-paragraph');
    expect(show('Ensimmäinen.\n* *| *\nKolmas.')).toBe('no-paragraph');
    expect(show('Ensimmäinen.\n--|-\nKolmas.')).toBe('no-paragraph');
    // A marker with nothing after it has no body to edit
    expect(show('#| ')).toBe('no-paragraph');
    expect(show('|')).toBe('no-paragraph');
    expect(resolveEditTarget('', 0, 0, stubBlocks)).toEqual({ ok: false, code: 'no-paragraph' });
  });

  test('positions outside the text are clamped', () => {
    expect(resolveEditTarget('Yksi rivi.', 99, 99, stubBlocks)).toEqual({ ok: true, from: 0, to: 10, kind: 'paragraph' });
    expect(resolveEditTarget('Yksi rivi.', -5, 4, stubBlocks)).toEqual({ ok: true, from: 0, to: 4, kind: 'selection' });
    expect(resolveEditTarget(undefined, 0, 0, stubBlocks)).toEqual({ ok: false, code: 'no-paragraph' });
  });

  test('a block reader that finds no block gives no-paragraph', () => {
    const none = { splitBlocks: () => [], blockAt: () => null };
    expect(resolveEditTarget('Teksti.', 2, 2, none)).toEqual({ ok: false, code: 'no-paragraph' });
  });
});

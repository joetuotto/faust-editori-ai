/**
 * @jest-environment node
 */
const { maskSpans, unmaskSpans, placeholder, placeholderInstruction, PLACEHOLDER } = require('../../src/services/ai/maskSpans');
const { wordDiff, tokenize } = require('../../src/editor/wordDiff');
const { parseInline } = require('../../utils/manuscript');

const source = 'Kissa istui **ikkunalla** ja _katseli_ <u>sadetta</u> [TODO: tarkista *vuodenaika*]. \\*Tähti\\* ja 2 * 3.';
const masked = 'Kissa istui ⟦1⟧ikkunalla⟦/1⟧ ja ⟦2⟧katseli⟦/2⟧ ⟦3⟧sadetta⟦/3⟧ ⟦4⟧. ⟦5⟧Tähti⟦6⟧ ja 2 * 3.';
const mask = maskSpans(source);
const clean = { restored: [], repositioned: [], displaced: [], duplicates: [], dropped: [], unknown: 0 };

describe('maskSpans', () => {
  test('replaces notes, <u> tags, emphasis markers and escapes; a loose * stays', () => {
    expect(mask.text).toBe(masked);
    expect(mask.source).toBe(source);
    expect(mask.spans.map(s => [s.id, s.role, s.kind, s.text])).toEqual([
      [1, 'open', 'marker', '**'], [1, 'close', 'marker', '**'],
      [2, 'open', 'marker', '_'], [2, 'close', 'marker', '_'],
      [3, 'open', 'tag', '<u>'], [3, 'close', 'tag', '</u>'],
      [4, null, 'todo', '[TODO: tarkista *vuodenaika*]'],
      [5, null, 'escape', '\\*'], [6, null, 'escape', '\\*']
    ]);
  });

  test('every span knows where it was, its placeholder and where the placeholder is', () => {
    for (const span of mask.spans) {
      expect(source.slice(span.from, span.to)).toBe(span.text);
      expect(span.token).toBe(placeholder(span.id, span.role));
      expect(mask.text.slice(span.at, span.at + span.token.length)).toBe(span.token);
    }
    expect(mask.spans.map(s => s.token).slice(0, 3)).toEqual(['⟦1⟧', '⟦/1⟧', '⟦2⟧']);
    expect(mask.spans[0]).toEqual({ id: 1, role: 'open', kind: 'marker', text: '**', token: '⟦1⟧', from: 12, to: 14, at: 12 });
  });

  test('a pair shares one number; nested pairs nest', () => {
    expect(maskSpans('**lihava ja _kursiivi_** sekä ~~yli~~ ja snake_case_nimi').text)
      .toBe('⟦1⟧lihava ja ⟦2⟧kursiivi⟦/2⟧⟦/1⟧ sekä ⟦3⟧yli⟦/3⟧ ja snake_case_nimi');
  });

  test('the markers found are the spans parseInline formats', () => {
    const lines = [
      'a **b** _c_ *d* <u>e</u> ~~f~~ g', '**lihava ja _kursiivi_**', 'muuttuja_nimi_tässä', '2 * 3 * 4', '** ei lihava**',
      '\\*tähti\\* ja _ääkköset_', '__lihava__ ja *kursiivi*', 'Hän sanoi _ei_.'
    ];
    for (const line of lines) {
      const formatted = parseInline(line).filter(run => run.bold || run.italic || run.underline || run.strike).length > 0;
      const pairs = maskSpans(line).spans.filter(s => s.role === 'open').length;
      expect(pairs > 0).toBe(formatted);
    }
    // the text between the markers is what parseInline formats, run for run
    for (const line of lines) {
      const m = maskSpans(line);
      const formattedText = parseInline(line).filter(run => run.bold || run.italic || run.underline || run.strike).map(run => run.text).join('');
      const openers = m.spans.filter(s => s.role === 'open');
      const outermost = openers.filter(o => !openers.some(other => other !== o && other.from < o.from &&
        m.spans.find(s => s.id === other.id && s.role === 'close').from > o.from));
      const inside = outermost.map((o) => {
        const closer = m.spans.find(s => s.id === o.id && s.role === 'close');
        return parseInline(line.slice(o.to, closer.from)).map(run => run.text).join('');
      }).join('');
      expect(inside).toBe(formattedText);
    }
  });

  test('a note with markers or quotation marks inside is one span', () => {
    expect(maskSpans('[TODO: tarkista ”sitaatti” ja *tämä*]', { quoted: true }).text).toBe('⟦1⟧');
  });

  test('quoted: true protects speech in quotation marks; a quotation swallows a note inside it', () => {
    const result = maskSpans('”Tule tänne”, äiti sanoi. ”Puhe [TODO: nimi] jatkuu.”', { quoted: true });
    expect(result.text).toBe('⟦1⟧, äiti sanoi. ⟦2⟧');
    expect(result.spans.map(s => [s.kind, s.text])).toEqual([['quoted', '”Tule tänne”'], ['quoted', '”Puhe [TODO: nimi] jatkuu.”']]);
  });

  test('structure: true protects headings, scene breaks and quote lines, and the markers of list lines', () => {
    const result = maskSpans('# Otsikko\n\nKappale.\n- Hei, sanoi Pekka.\n* * *\n> Lainaus tässä.', { structure: true });
    expect(result.text).toBe('⟦1⟧\n\nKappale.\n⟦2⟧Hei, sanoi Pekka.\n⟦3⟧\n⟦4⟧');
    expect(result.spans.map(s => [s.kind, s.text])).toEqual([
      ['line', '# Otsikko'], ['prefix', '- '], ['line', '* * *'], ['line', '> Lainaus tässä.']
    ]);
    expect(maskSpans('> Lainaus tässä.', { structure: true, quotes: true }).text).toBe('⟦1⟧Lainaus tässä.');
  });

  test('extra patterns are protected too', () => {
    expect(maskSpans('Katso kuva {{kuva 3}} tästä.', { extra: [/\{\{[^}]*\}\}/g] }).text).toBe('Katso kuva ⟦1⟧ tästä.');
  });

  test('hasProse tells whether anything is left for the model', () => {
    expect(maskSpans('[TODO: kirjoita tämä kohtaus]').hasProse).toBe(false);
    expect(maskSpans('Kissa [TODO: x]').hasProse).toBe(true);
    expect(maskSpans('').hasProse).toBe(false);
    // the digits of a placeholder are not prose
    expect(maskSpans('**[TODO: a]** – [TODO: b]…').hasProse).toBe(false);
    expect(maskSpans('[TODO: a] 7').hasProse).toBe(true);
  });

  test('text that already looks like a placeholder is protected', () => {
    const odd = maskSpans('Merkki ⟦3⟧ ja **sana**.');
    expect(odd.text).toBe('Merkki ⟦1⟧ ja ⟦2⟧sana⟦/2⟧.');
    expect(odd.spans[0]).toMatchObject({ kind: 'literal', text: '⟦3⟧' });
    expect(unmaskSpans(odd.text, odd).text).toBe('Merkki ⟦3⟧ ja **sana**.');
  });

  test('unmasking the untouched masked text gives the source back', () => {
    expect(unmaskSpans(mask.text, mask)).toEqual({ text: source, ...clean });
    expect(unmaskSpans('', maskSpans(''))).toEqual({ text: '', ...clean });
  });

  // Cases beyond the named list

  test('missing text and missing options are an empty text and the defaults', () => {
    expect(maskSpans(undefined)).toEqual({ text: '', source: '', spans: [], hasProse: false });
    expect(maskSpans(null, null)).toEqual({ text: '', source: '', spans: [], hasProse: false });
  });

  test('without the options, speech, headings and list markers stay editable', () => {
    const plain = '# Otsikko\n- ”Hei”, sanoi Pekka.\n> Lainaus.';
    expect(maskSpans(plain)).toMatchObject({ text: plain, spans: [], hasProse: true });
  });

  test('quoted: the four kinds of marks, each on one line only', () => {
    const result = maskSpans('”yksi” "kaksi" »kolme» “neljä” ja ”avoin\nrivi”', { quoted: true });
    expect(result.text).toBe('⟦1⟧ ⟦2⟧ ⟦3⟧ ⟦4⟧ ja ”avoin\nrivi”');
    expect(result.spans.every(s => s.kind === 'quoted' && s.role === null)).toBe(true);
  });

  test('every escape is protected, and an escaped marker opens no span', () => {
    const result = maskSpans('\\* \\_ \\# \\~ \\> \\\\ ja \\*ei kursiivia\\*');
    expect(result.spans.map(s => [s.kind, s.text])).toEqual([
      ['escape', '\\*'], ['escape', '\\_'], ['escape', '\\#'], ['escape', '\\~'], ['escape', '\\>'], ['escape', '\\\\'],
      ['escape', '\\*'], ['escape', '\\*']
    ]);
    expect(result.text).toBe('⟦1⟧ ⟦2⟧ ⟦3⟧ ⟦4⟧ ⟦5⟧ ⟦6⟧ ja ⟦7⟧ei kursiivia⟦8⟧');
  });

  test('a <u> or </u> that belongs to no pair is a single tag', () => {
    const result = maskSpans('Alku <u>ilman loppua ja </u> yksin.\nToinen <u>rivi');
    expect(result.spans.map(s => [s.role, s.kind, s.text])).toEqual([
      ['open', 'tag', '<u>'], ['close', 'tag', '</u>'], [null, 'tag', '<u>']
    ]);
    expect(maskSpans('loppu</u> yksin').spans).toMatchObject([{ id: 1, role: null, kind: 'tag', text: '</u>' }]);
  });

  test('structure: a note inside a heading stays inside the protected line; indented and numbered markers', () => {
    expect(maskSpans('# Otsikko [TODO: parempi nimi]', { structure: true })).toMatchObject({
      text: '⟦1⟧', hasProse: false, spans: [{ kind: 'line', text: '# Otsikko [TODO: parempi nimi]' }]
    });
    const list = maskSpans('  12) kohta **yksi**\n+ plus', { structure: true });
    expect(list.text).toBe('⟦1⟧kohta ⟦2⟧yksi⟦/2⟧\n⟦3⟧plus');
    expect(list.spans.filter(s => s.kind === 'prefix').map(s => s.text)).toEqual(['  12) ', '+ ']);
    // a dialogue dash line is a paragraph: nothing to protect
    expect(maskSpans('– Hei, sanoi Pekka.', { structure: true }).spans).toEqual([]);
  });

  test('extra: a single expression works, its flags do not matter, and it swallows a note it contains', () => {
    expect(maskSpans('Katso {{kuva 3}} ja {{kuva 4}}.', { extra: /\{\{[^}]*\}\}/ }).text).toBe('Katso ⟦1⟧ ja ⟦2⟧.');
    const sticky = /\{\{[^}]*\}\}/y;
    expect(maskSpans('Katso {{kuva 3}}.', { extra: [sticky] }).text).toBe('Katso ⟦1⟧.');
    expect(sticky.lastIndex).toBe(0);
    const swallowed = maskSpans('Kuva {{a [TODO: x] b}} tässä.', { extra: [/\{\{[^}]*\}\}/] });
    expect(swallowed.spans.map(s => [s.kind, s.text])).toEqual([['extra', '{{a [TODO: x] b}}']]);
    // a pattern that matches exactly a note does not replace it: the note stays pinned
    expect(maskSpans('Kissa [TODO: x] istui.', { extra: [/\[TODO:[^\]]*\]/] }).spans.map(s => s.kind)).toEqual(['todo']);
  });

  test('a marker that would cut through a note is dropped with its partner', () => {
    const result = maskSpans('_alku [TODO: a_b] loppu_');
    expect(result.spans.map(s => s.kind)).toEqual(['todo']);
    expect(unmaskSpans(result.text, result).text).toBe('_alku [TODO: a_b] loppu_');
  });

  test('line breaks: spans of every line have offsets of the whole text, CRLF included', () => {
    const lines = 'Eka **rivi**.\r\nToka _rivi_ [TODO: x].\r\n';
    const result = maskSpans(lines);
    expect(result.text).toBe('Eka ⟦1⟧rivi⟦/1⟧.\r\nToka ⟦2⟧rivi⟦/2⟧ ⟦3⟧.\r\n');
    for (const span of result.spans) expect(lines.slice(span.from, span.to)).toBe(span.text);
    // emphasis never runs over a line break
    expect(maskSpans('*alku\nloppu*').spans).toEqual([]);
  });
});

describe('unmaskSpans: a model dropped placeholders', () => {
  test('a dropped note goes back where it was, and the diff is empty', () => {
    const result = unmaskSpans(mask.text.replace(' ⟦4⟧', ''), mask);
    expect(result).toEqual({ text: source, ...clean, restored: [4] });
    expect(wordDiff(source, result.text)).toEqual([]);
  });

  test('with every placeholder dropped the source comes back unchanged', () => {
    const result = unmaskSpans(mask.text.replace(PLACEHOLDER, ''), mask);
    expect(result.text).toBe(source);
    expect(result.restored).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('a note dropped from a rewritten passage goes back between the changes, with its spaces', () => {
    const m = maskSpans('Hän käveli hitaasti [TODO: mihin?] pitkin rantaa ja katseli merta.');
    const result = unmaskSpans('Hän asteli verkkaisesti rantaa pitkin ja katseli merta.', m);
    expect(result.text).toBe('Hän asteli verkkaisesti [TODO: mihin?] rantaa pitkin ja katseli merta.');
    expect(wordDiff(m.source, result.text)).toEqual([
      { from: 4, to: 19, insert: 'asteli verkkaisesti', original: 'käveli hitaasti' },
      { from: 35, to: 48, insert: 'rantaa pitkin', original: 'pitkin rantaa' }
    ]);
  });

  test('dropped emphasis markers go back around the same word', () => {
    const result = unmaskSpans('Kissa istui ikkunalla ja ⟦2⟧katseli⟦/2⟧ ⟦3⟧sadetta⟦/3⟧, joka ropisi ⟦4⟧. ⟦5⟧Tähti⟦6⟧ ja 2 * 3.', mask);
    expect(result.text).toBe('Kissa istui **ikkunalla** ja _katseli_ <u>sadetta</u>, joka ropisi [TODO: tarkista *vuodenaika*]. \\*Tähti\\* ja 2 * 3.');
    expect(result.restored).toEqual([1]);
  });

  // Cases beyond the named list

  test('a pair dropped while its word was replaced comes back around the replacement', () => {
    const m = maskSpans('Se oli _todella_ väsynyt.');
    expect(unmaskSpans('Se oli tosi väsynyt.', m)).toEqual({ text: 'Se oli _tosi_ väsynyt.', ...clean, restored: [1] });
  });

  test('with structure, a dropped heading and a dropped list marker come back in place', () => {
    const m = maskSpans('# Otsikko\n- Hei, sanoi Pekka.', { structure: true });
    expect(m.text).toBe('⟦1⟧\n⟦2⟧Hei, sanoi Pekka.');
    expect(unmaskSpans('Hei, sanoi Pekka hiljaa.', m)).toEqual({ text: '# Otsikko\n- Hei, sanoi Pekka hiljaa.', ...clean, restored: [1, 2] });
  });

  test('with structure, a heading, scene break or list marker put back stays a line or the start of one', () => {
    const lines = (src, reply) => unmaskSpans(reply, maskSpans(src, { structure: true })).text;
    // the text condensed into one paragraph: the scene break gets a line of its own
    expect(lines('Aamu valkeni hitaasti.\n* * *\nIllalla hän palasi kotiin.', 'Aamu valkeni, ja illalla hän palasi kotiin.'))
      .toBe('Aamu valkeni, ja illalla\n* * *\nhän palasi kotiin.');
    // a section dropped: its heading stays a heading line
    expect(lines('# Alku\nEka kappale.\n## Loppu\nToka kappale.', '⟦1⟧\nEka kappale.'))
      .toBe('# Alku\nEka kappale.\n## Loppu');
    // a list item dropped: its marker starts a line
    expect(lines('- eka\n- toka\n- kolmas', '⟦1⟧eka\n⟦3⟧kolmas')).toBe('- eka\n- \n- kolmas');
    // a scene break the model kept inline goes back on its own line
    expect(lines('Aamu valkeni.\n* * *\nIllalla hän palasi.', 'Aamu valkeni. ⟦1⟧ Illalla hän palasi.'))
      .toBe('Aamu valkeni.\n* * *\nIllalla hän palasi.');
  });

  test('a note put back into a rewritten passage keeps its spacing; an escape gets no spaces', () => {
    const reply = 'Hinta on viisi kertaa kolme euroa.';
    // the placeholder stood where "kertaa" now is, with a space on both sides
    const note = maskSpans('Hinta on 5 [TODO: x] 3 euroa.');
    expect(unmaskSpans(reply, note)).toEqual({ text: 'Hinta on viisi [TODO: x] kertaa kolme euroa.', ...clean, restored: [1] });
    const escape = maskSpans('Hinta on 5 \\* 3 euroa.');
    expect(unmaskSpans(reply, escape)).toEqual({ text: 'Hinta on viisi \\*kertaa kolme euroa.', ...clean, restored: [1] });
    // dropped with one of its spaces and nothing else changed: back exactly as it was
    expect(unmaskSpans('Hinta on 5 3 euroa.', escape)).toEqual({ text: 'Hinta on 5 \\* 3 euroa.', ...clean, restored: [1] });
  });

  test('a note at the start or the end of a rewritten text does not get a space outside the text', () => {
    const first = maskSpans('[TODO: alku] Kissa istui.');
    expect(unmaskSpans('Koira makasi.', first).text).toBe('[TODO: alku] Koira makasi.');
    const last = maskSpans('Kissa istui [TODO: loppu]');
    expect(unmaskSpans('Koira makasi', last).text).toBe('Koira makasi [TODO: loppu]');
  });

  test('an empty reply gets every protected span back and nothing else', () => {
    const m = maskSpans('Kissa [TODO: väri?] istui **hiljaa**.');
    const result = unmaskSpans('', m);
    expect(result.text).toContain('[TODO: väri?]');
    expect(result.text).not.toMatch(/⟦/);
    expect(result.restored).toEqual([1]);
    // the emphasis had nothing left to mark
    expect(result.dropped).toEqual([2]);
  });
});

describe('unmaskSpans: a model moved placeholders', () => {
  test('a note moved to the end of the paragraph is put back in its place', () => {
    const m = maskSpans('Talo seisoi mäen päällä [TODO: mikä mäki?] ja sen ikkunat olivat pimeät.');
    const result = unmaskSpans('Mäen päällä seisoi talo, jonka ikkunat olivat pimeät. ⟦1⟧', m);
    expect(result.text).toBe('Mäen päällä [TODO: mikä mäki?] seisoi talo, jonka ikkunat olivat pimeät.');
    expect(result.repositioned).toEqual([1]);
    expect(wordDiff(m.source, result.text).some(c => c.original.includes('[TODO') || c.insert.includes('[TODO'))).toBe(false);
  });

  test('a note moved a little is put back exactly', () => {
    const result = unmaskSpans('Kissa istui ⟦1⟧ikkunalla⟦/1⟧ ⟦4⟧ ja ⟦2⟧katseli⟦/2⟧ ⟦3⟧sadetta⟦/3⟧. ⟦5⟧Tähti⟦6⟧ ja 2 * 3.', mask);
    expect(result).toEqual({ text: source, ...clean, repositioned: [4] });
  });

  test('a heading line and a literal placeholder are pinned too', () => {
    const heading = maskSpans('# Otsikko\nKappale tässä.', { structure: true });
    const moved = unmaskSpans('Kappale tässä.\n⟦1⟧', heading);
    expect(moved.repositioned).toEqual([1]);
    expect(moved.text).toBe('# Otsikko\nKappale tässä.');
    const scene = maskSpans('Eka.\n* * *\nToka.', { structure: true });
    expect(unmaskSpans('Eka.\nToka.\n⟦1⟧', scene)).toMatchObject({ text: 'Eka.\n* * *\nToka.', repositioned: [1] });
    expect(unmaskSpans('⟦1⟧\nEka.\nToka.', scene)).toMatchObject({ text: 'Eka.\n* * *\nToka.', repositioned: [1] });
    const literal = maskSpans('Merkki ⟦3⟧ ja sana.');
    expect(unmaskSpans('Merkki ja sana. ⟦1⟧', literal)).toMatchObject({ text: 'Merkki ⟦3⟧ ja sana.', repositioned: [1] });
  });

  test('emphasis moved with its word stays with the word', () => {
    const m = maskSpans('**Kissa** istui ikkunalla.');
    expect(unmaskSpans('Ikkunalla istui ⟦1⟧kissa⟦/1⟧.', m)).toEqual({ text: 'Ikkunalla istui **kissa**.', ...clean, displaced: [1] });
  });

  test('a closing marker before its opening marker is swapped', () => {
    expect(unmaskSpans(mask.text.replace('⟦2⟧katseli⟦/2⟧', '⟦/2⟧katseli⟦2⟧'), mask).text).toBe(source);
  });

  // Cases beyond the named list

  test('with structure, a list marker the model moved into the line is put back at its start', () => {
    const m = maskSpans('- Hei, sanoi Pekka.', { structure: true });
    expect(unmaskSpans('Hei, ⟦1⟧sanoi Pekka.', m)).toEqual({ text: '- Hei, sanoi Pekka.', ...clean, repositioned: [1] });
  });

  test('protected speech travels with the model, a note inside it included', () => {
    const m = maskSpans('”Tule [TODO: nimi] tänne”, äiti sanoi hiljaa.', { quoted: true });
    expect(unmaskSpans('Äiti sanoi hiljaa: ⟦1⟧', m)).toEqual({ text: 'Äiti sanoi hiljaa: ”Tule [TODO: nimi] tänne”', ...clean, displaced: [1] });
  });

  test('two notes pushed to the end both return, in their old order', () => {
    const m = maskSpans('Aamulla [TODO: kello?] kissa heräsi ja [TODO: missä?] lähti ulos.');
    const result = unmaskSpans('Aamulla kissa heräsi ja lähti ulos. ⟦2⟧ ⟦1⟧', m);
    expect(result.text).toBe(m.source);
    expect(result.repositioned).toEqual([1, 2]);
  });
});

describe('unmaskSpans: a model deleted or mangled things', () => {
  test('a pair whose word was deleted goes with the word', () => {
    const result = unmaskSpans(mask.text.replace('⟦1⟧ikkunalla⟦/1⟧ ', ''), mask);
    expect(result.text).toBe('Kissa istui ja _katseli_ <u>sadetta</u> [TODO: tarkista *vuodenaika*]. \\*Tähti\\* ja 2 * 3.');
    expect(result.dropped).toEqual([1]);
    expect(result.restored).toEqual([]);
  });

  test('a pair left empty is removed', () => {
    const result = unmaskSpans(mask.text.replace('⟦2⟧katseli⟦/2⟧', '⟦2⟧⟦/2⟧'), mask);
    expect(result.text).toBe('Kissa istui **ikkunalla** ja  <u>sadetta</u> [TODO: tarkista *vuodenaika*]. \\*Tähti\\* ja 2 * 3.');
    expect(result.dropped).toEqual([2]);
  });

  test('look-alikes [[4]], ⟦ 1 ⟧, [5] and [[/3]] are read as placeholders', () => {
    const reply = mask.text.replace('⟦4⟧', '[[4]]').replace('⟦1⟧', '⟦ 1 ⟧').replace('⟦5⟧', '[5]').replace('⟦/3⟧', '[[/3]]');
    expect(unmaskSpans(reply, mask)).toEqual({ text: source, ...clean });
  });

  test('a footnote [1] that was in the text is not taken for a placeholder', () => {
    const m = maskSpans('Lähde [1] ja **lihava** sana.');
    expect(m.text).toBe('Lähde [1] ja ⟦1⟧lihava⟦/1⟧ sana.');
    expect(unmaskSpans('Lähde [1] ja lihava sana.', m)).toEqual({ text: 'Lähde [1] ja **lihava** sana.', ...clean, restored: [1] });
  });

  test('of a repeated placeholder the first is kept; unknown numbers are removed', () => {
    const result = unmaskSpans(`${mask.text} ⟦4⟧ ⟦42⟧ ⟦/5⟧`, mask);
    expect(result.text.trimEnd()).toBe(source);
    expect(result.duplicates).toEqual([4]);
    expect(result.unknown).toBe(2);
  });

  test('half a placeholder left by a cut reply is removed', () => {
    const m = maskSpans('Kissa **istui** ja [TODO: mitä?] lähti.');
    const result = unmaskSpans('Kissa ⟦1⟧istui⟦/1⟧ ja ⟦2⟧ lähti ⟧ pois ⟦3', m);
    expect(result.text).toBe('Kissa **istui** ja [TODO: mitä?] lähti  pois ');
    expect(result.unknown).toBe(2);
  });

  test('CRLF in the reply becomes LF', () => {
    const m = maskSpans('Eka **rivi**.\nToka.');
    expect(unmaskSpans('Eka ⟦1⟧rivi⟦/1⟧.\r\nToka.', m).text).toBe('Eka **rivi**.\nToka.');
    expect(unmaskSpans('Eka ⟦1⟧rivi⟦/1⟧.\rToka.', m)).toEqual({ text: 'Eka **rivi**.\nToka.', ...clean });
  });

  // Cases beyond the named list

  test('a pair that was empty in the text (<u> </u>) is not taken for a deleted word', () => {
    const m = maskSpans('Sana <u> </u> ja **toinen**.');
    expect(unmaskSpans(m.text, m)).toEqual({ text: 'Sana <u> </u> ja **toinen**.', ...clean });
    expect(unmaskSpans('Sana ⟦1⟧ ⟦/1⟧ ja ⟦2⟧kolmas⟦/2⟧.', m).text).toBe('Sana <u> </u> ja **kolmas**.');
  });

  test('a pair around a pair that was left empty goes too', () => {
    const m = maskSpans('**lihava _kurs_** loppu');
    expect(unmaskSpans('⟦1⟧⟦2⟧⟦/2⟧⟦/1⟧ loppu', m)).toEqual({ text: ' loppu', ...clean, dropped: [1, 2] });
    // with a word left inside, only the empty inner pair goes
    expect(unmaskSpans('⟦1⟧lihava ⟦2⟧⟦/2⟧⟦/1⟧ loppu', m)).toEqual({ text: '**lihava ** loppu', ...clean, dropped: [2] });
  });

  test('a placeholder written with a leading zero is the same placeholder', () => {
    const m = maskSpans('Kissa [TODO: a] istui **hiljaa**.');
    expect(unmaskSpans('Kissa ⟦01⟧ istui ⟦02⟧hiljaa⟦/02⟧.', m)).toEqual({ text: m.source, ...clean });
    // and when it also moved, it is still found and put back
    expect(unmaskSpans('Kissa istui ⟦2⟧hiljaa⟦/2⟧. ⟦01⟧', m)).toEqual({ text: 'Kissa [TODO: a] istui **hiljaa**.', ...clean, repositioned: [1] });
  });

  test('a moved note takes the space before it along only between spaces or at the end', () => {
    const m = maskSpans('Kissa [TODO: a] istui hiljaa.');
    expect(unmaskSpans('Kissa istui ⟦1⟧ hiljaa.', m).text).toBe('Kissa [TODO: a] istui hiljaa.');
    expect(unmaskSpans('Kissa istui hiljaa. ⟦1⟧', m).text).toBe('Kissa [TODO: a] istui hiljaa.');
    // before closing punctuation the space was the note's, and it goes with the note
    expect(unmaskSpans('Kissa istui hiljaa ⟦1⟧.', m).text).toBe('Kissa [TODO: a] istui hiljaa.');
    expect(unmaskSpans('Kissa istui ⟦1⟧, hiljaa.', maskSpans('Kissa [TODO: a] istui, hiljaa.')).text).toBe('Kissa [TODO: a] istui, hiljaa.');
    expect(unmaskSpans('”Tule tänne ⟦1⟧”, hän sanoi.', maskSpans('”Tule [TODO: a] tänne”, hän sanoi.')).text).toBe('”Tule [TODO: a] tänne”, hän sanoi.');
    // after a word the space stays: it is not the note's
    expect(unmaskSpans('Kissa istui hiljaa⟦1⟧.', m).text).toBe('Kissa [TODO: a] istui hiljaa.');
  });

  test('empty brackets ⟦⟧ and ⟦/⟧ are removed and counted as unknown', () => {
    const m = maskSpans('Kissa [TODO: väri?] istui.');
    const result = unmaskSpans('Kissa ⟦1⟧ istui⟦⟧.⟦/⟧', m);
    expect(result.text).toBe('Kissa [TODO: väri?] istui.');
    expect(result.unknown).toBe(2);
  });

  test('a closing form of a single placeholder and a number never issued are unknown', () => {
    const m = maskSpans('Kissa [TODO: a] istui.');
    expect(unmaskSpans('Kissa ⟦1⟧ istui⟦/1⟧⟦7⟧⟦/7⟧.', m)).toEqual({ text: m.source, ...clean, unknown: 3 });
  });

  test('a look-alike is read only for a placeholder that is missing; a second one stays as text', () => {
    const m = maskSpans('Kissa [TODO: a] istui.');
    expect(unmaskSpans('Kissa ⟦1⟧ istui [1].', m).text).toBe('Kissa [TODO: a] istui [1].');
    expect(unmaskSpans('Kissa [[1]] istui [[1]].', m).text).toBe('Kissa [TODO: a] istui [[1]].');
    // other bracket shapes models produce
    expect(unmaskSpans('Kissa 【1】 istui.', m)).toEqual({ text: m.source, ...clean });
    expect(unmaskSpans('Kissa 〚 1 〛 istui.', m)).toEqual({ text: m.source, ...clean });
  });

  test('half placeholders stay when the author\'s own text uses the brackets', () => {
    const m = maskSpans('Joukko ⟦a, b⟧ ja **sana**.');
    expect(m.spans.map(s => s.kind)).toEqual(['marker', 'marker']);
    expect(unmaskSpans(m.text, m)).toEqual({ text: m.source, ...clean });
    expect(unmaskSpans('Joukko ⟦a, b⟧ ja ⟦1⟧sana⟦/1⟧ ⟦2', m).text).toBe('Joukko ⟦a, b⟧ ja **sana** ⟦2');
  });

  test('without a mask every placeholder is unknown and goes', () => {
    expect(unmaskSpans('Kissa ⟦1⟧ istui⟦/2⟧.', null)).toEqual({ text: 'Kissa  istui.', ...clean, unknown: 2 });
    expect(unmaskSpans(null, undefined)).toEqual({ text: '', ...clean });
  });

  test('the result never holds a placeholder, whatever came back', () => {
    const replies = ['⟦1⟧⟦1⟧⟦1⟧', '⟦/1⟧ ⟦3⟧ ⟦/3⟧ ⟦2⟧', '[[1]] [[2]] [[/2]] [[3]]', '⟦⟦1⟧⟧ ⟦ 2 ⟧ ⟦/ 2 ⟧', '⟦', '⟧⟧⟧', '⟦/', '⟦12', 'ei mitään'];
    const m = maskSpans('Kissa [TODO: a] istui **hiljaa** ja [TODO: b] lähti.');
    for (const reply of replies) {
      const result = unmaskSpans(reply, m);
      expect(result.text).not.toMatch(/[⟦⟧]/);
      expect(result.text.split('[TODO: a]')).toHaveLength(2);
      expect(result.text.split('[TODO: b]')).toHaveLength(2);
      expect(result.text.split('**').length % 2).toBe(1);
    }
  });
});

describe('unmaskSpans: no suggestion ever touches a note', () => {
  let state = 987654321;
  const random = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const WORDS = ['kissa', 'koira', 'äiti', 'öinen', 'Åke', 'ja', 'on', 'linja-auto', 'talo', 'sade', 'hän', 'meni', 'tuli', 'katu'];
  const PIECES = [
    () => pick(WORDS), () => pick(WORDS), () => pick(WORDS),
    () => `**${pick(WORDS)}**`,
    () => `_${pick(WORDS)} ${pick(WORDS)}_`,
    () => `<u>${pick(WORDS)}</u>`,
    () => `[TODO: ${pick(WORDS)} ${Math.floor(random() * 1000)}]`,
    () => `~~${pick(WORDS)}~~`,
    () => '\\*'
  ];
  const SEPARATORS = [' ', ' ', ' ', ', ', '. ', ' – ', '! '];
  const count = (hay, needle) => hay.split(needle).length - 1;

  // What a careless model does: drops, repeats, moves and rewrites placeholders, and edits words
  const careless = (text) => {
    const out = [];
    // Placeholders pushed towards the end come back after a later token
    const later = [];
    for (const token of tokenize(text, { atomic: /⟦\/?\d+⟧/ })) {
      const r = random();
      if (token.type === 'atom') {
        if (r < 0.25) continue;
        if (r < 0.30) out.push(token.text, token.text);
        else if (r < 0.33) out.unshift(token.text);
        else if (r < 0.35) later.push(token.text);
        else if (r < 0.40) out.push(token.text.replace('⟦', '[[').replace('⟧', ']]'));
        else out.push(token.text);
      } else if (token.type === 'word' && r < 0.10) {
        continue;
      } else if (token.type === 'word' && r < 0.20) {
        out.push(pick(WORDS));
      } else if (token.type === 'word' && r < 0.25) {
        out.push(token.text, ' ', pick(WORDS));
      } else {
        out.push(token.text);
      }
      if (later.length > 0 && random() < 0.3) out.push(' ', later.shift());
    }
    out.push(...later.map(t => ` ${t}`));
    // Now and then a run of tokens moves elsewhere, as when a model reorders sentences
    if (out.length > 6 && random() < 0.3) {
      const from = Math.floor(random() * (out.length - 3));
      const run = out.splice(from, 1 + Math.floor(random() * Math.min(8, out.length - from - 1)));
      out.splice(Math.floor(random() * (out.length + 1)), 0, ...run);
    }
    return out.join('');
  };

  test('two notes the model reordered come back in their order (step 4 runs until nothing moves)', () => {
    const source = 'se [TODO: a] [TODO: b] yö';
    const result = unmaskSpans('se mutta ⟦1⟧ yö ⟦2⟧', maskSpans(source));
    expect(result.text).toBe('se [TODO: a] mutta [TODO: b] yö');
    expect(wordDiff(source, result.text)).toEqual([{ from: 13, to: 13, original: '', insert: 'mutta ' }]);
  });

  test('a moved run of text cannot carry a note into a change', () => {
    const source = 'äiti [TODO: 1] kissa sade tuli talo. talo koira [TODO: 2] hän katu kissa [TODO: 3] tuli äiti. hän aamu ilta.';
    const m = maskSpans(source);
    const result = unmaskSpans('äiti ⟦1⟧  koira ⟦2⟧ talo talo kissa ⟦3⟧ tuli äiti. hän kissa sade tuli talo. katuaamu ilta.', m);
    const notes = result.text.match(/\[TODO: \d\]/g);
    expect(notes).toEqual(['[TODO: 1]', '[TODO: 2]', '[TODO: 3]']);
    for (const c of wordDiff(source, result.text)) {
      expect(c.original).not.toContain('[TODO:');
      expect(c.insert).not.toContain('[TODO:');
    }
  });

  test('500 generated replies: every note survives exactly once, pairs stay whole, no change touches a note', () => {
    for (let i = 0; i < 500; i++) {
      let text = '';
      const pieces = 2 + Math.floor(random() * 14);
      for (let j = 0; j < pieces; j++) text += pick(PIECES)() + pick(SEPARATORS);
      text = text.trim();

      const m = maskSpans(text);
      const result = unmaskSpans(careless(m.text), m);

      expect(result.text).not.toMatch(/⟦\/?\d+⟧/);
      for (const span of m.spans.filter(s => s.kind === 'todo' || s.kind === 'escape')) {
        expect(count(result.text, span.text)).toBe(count(text, span.text));
      }
      for (const marker of ['**', '<u>', '</u>', '~~']) {
        const expected = m.spans.filter(s => s.text === marker && !result.dropped.includes(s.id)).length;
        expect(count(result.text, marker)).toBe(expected);
      }
      for (const c of wordDiff(text, result.text)) {
        expect(c.original).not.toContain('[TODO:');
        expect(c.insert).not.toContain('[TODO:');
      }
    }
  });

  test('300 generated texts with every option: the untouched masked text always gives the source back', () => {
    const MORE = PIECES.concat([
      () => '<u> </u>', () => `”${pick(WORDS)} ${pick(WORDS)}”`, () => `[${1 + Math.floor(random() * 5)}]`,
      () => `**[TODO: ${pick(WORDS)}]**`, () => `<u>${pick(WORDS)}`, () => `*${pick(WORDS)}*`, () => '⟦7⟧'
    ]);
    const BREAKS = SEPARATORS.concat(['\n', '\n- ', '\n# ', '\n> ', '\n\n']);
    for (let i = 0; i < 300; i++) {
      let text = '';
      const pieces = 1 + Math.floor(random() * 14);
      for (let j = 0; j < pieces; j++) text += pick(MORE)() + pick(BREAKS);
      for (const options of [undefined, { quoted: true }, { structure: true }, { structure: true, quotes: true }, { extra: [/\[\d\]/] }]) {
        const m = maskSpans(text, options);
        expect(unmaskSpans(m.text, m)).toEqual({ text, ...clean });
        for (const span of m.spans) {
          expect(text.slice(span.from, span.to)).toBe(span.text);
          expect(m.text.slice(span.at, span.at + span.token.length)).toBe(span.token);
        }
        // numbers run from 1 in text order, and every pair has both halves
        const firstUse = [...new Set(m.spans.map(s => s.id))];
        expect(firstUse).toEqual(firstUse.map((_id, index) => index + 1));
        for (const span of m.spans.filter(s => s.role === 'open')) {
          expect(m.spans.filter(s => s.id === span.id).map(s => s.role)).toEqual(['open', 'close']);
        }
      }
    }
  });
});

describe('placeholder helpers', () => {
  test('placeholder() writes single, opening and closing forms', () => {
    expect([placeholder(3), placeholder(3, 'open'), placeholder(3, 'close')]).toEqual(['⟦3⟧', '⟦3⟧', '⟦/3⟧']);
  });

  test('the instruction for the model is Finnish by default and English for en', () => {
    expect(placeholderInstruction('fi')).toContain('⟦2⟧…⟦/2⟧');
    expect(placeholderInstruction()).toBe(placeholderInstruction('fi'));
    expect(placeholderInstruction('en')).toMatch(/^The text contains placeholders/);
    // exact wording: clusters D and F send this sentence, and it was the one tested on the gateway
    expect(placeholderInstruction('fi')).toBe('Tekstissä on paikkamerkkejä: yksittäisiä muotoa ⟦1⟧ ja pareja muotoa ⟦2⟧…⟦/2⟧, jotka ympäröivät sanaa tai sanoja. Ne suojaavat muotoiluja ja muistiinpanoja. Säilytä jokainen paikkamerkki täsmälleen sellaisenaan. Yksittäinen paikkamerkki pysyy samassa kohdassa, ja pari pysyy saman tekstin ympärillä. Älä lisää, poista tai numeroi paikkamerkkejä uudelleen.');
    expect(placeholderInstruction('en')).toBe('The text contains placeholders: single ones like ⟦1⟧ and pairs like ⟦2⟧…⟦/2⟧ that wrap a word or words. They protect formatting and notes. Keep every placeholder exactly as it is. A single placeholder stays in the same place, and a pair stays around the same text. Do not add, remove or renumber placeholders.');
    expect(placeholderInstruction('sv')).toBe(placeholderInstruction('fi'));
  });

  // Cases beyond the named list

  test('PLACEHOLDER is the global expression of both forms, with the slash and the number as groups', () => {
    expect(PLACEHOLDER.source).toBe('⟦(\\/?)(\\d+)⟧');
    expect(PLACEHOLDER.flags).toBe('g');
    expect('a ⟦1⟧ b ⟦/12⟧ c'.replace(PLACEHOLDER, 'x')).toBe('a x b x c');
    expect([...'⟦3⟧⟦/3⟧'.matchAll(PLACEHOLDER)].map(m => [m[1], m[2]])).toEqual([['', '3'], ['/', '3']]);
    // the brackets are U+27E6 and U+27E7
    expect([placeholder(1).codePointAt(0), placeholder(1).codePointAt(2)]).toEqual([0x27e6, 0x27e7]);
    // masking and unmasking leave the shared expression ready to use
    const m = maskSpans('**a** [TODO: b]');
    unmaskSpans(m.text, m);
    expect(PLACEHOLDER.lastIndex).toBe(0);
  });
});

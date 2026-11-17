/**
 * @jest-environment node
 */
const {
  tokenize,
  wordDiff,
  applyChanges,
  offsetChanges,
  diffSegments,
  changeStats,
  changeRatio,
  rawHunks,
  normalizeOptions
} = require('../../src/editor/wordDiff');

const kinds = (text, options) => tokenize(text, options).map(t => `${t.type}:${t.text}`);
const change = (from, to, original, insert) => ({ from, to, insert, original });
// "ä" written as a + combining dots; an escape, so that no editor composes it silently
const DECOMPOSED_AE = 'A\u0308';

describe('tokenize', () => {
  test('splits words, spaces and punctuation, with offsets', () => {
    expect(tokenize('Kissa istui, ja')).toEqual([
      { text: 'Kissa', start: 0, end: 5, type: 'word' },
      { text: ' ', start: 5, end: 6, type: 'space' },
      { text: 'istui', start: 6, end: 11, type: 'word' },
      { text: ',', start: 11, end: 12, type: 'punct' },
      { text: ' ', start: 12, end: 13, type: 'space' },
      { text: 'ja', start: 13, end: 15, type: 'word' }
    ]);
  });

  test('keeps ä, ö, å and apostrophes inside words', () => {
    expect(kinds('Äiti näki öisin Åken vaa’an.').filter(k => k.startsWith('word'))).toEqual([
      'word:Äiti', 'word:näki', 'word:öisin', 'word:Åken', 'word:vaa’an'
    ]);
  });

  test('a hyphenated compound is one word, a dialogue dash and a loose hyphen are not', () => {
    expect(kinds('– Linja-auto tuli - vihdoin.')).toEqual([
      'punct:–', 'space: ', 'word:Linja-auto', 'space: ', 'word:tuli', 'space: ', 'punct:-', 'space: ', 'word:vihdoin', 'punct:.'
    ]);
    expect(kinds('maa- ja sana--sana')).toEqual([
      'word:maa', 'punct:-', 'space: ', 'word:ja', 'space: ', 'word:sana', 'punct:-', 'punct:-', 'word:sana'
    ]);
  });

  test('every line break is its own token and never part of a space run', () => {
    expect(kinds('a \n\n b')).toEqual(['word:a', 'space: ', 'newline:\n', 'newline:\n', 'space: ', 'word:b']);
  });

  test('every punctuation mark is its own token: ” – % …', () => {
    expect(kinds('”Hei” – 5 %…')).toEqual([
      'punct:”', 'word:Hei', 'punct:”', 'space: ', 'punct:–', 'space: ', 'word:5', 'space: ', 'punct:%', 'punct:…'
    ]);
  });

  test('offsets are UTF-16 offsets: an emoji is one token of length 2', () => {
    expect(tokenize('a 😀 b').map(t => [t.text, t.start, t.end])).toEqual([
      ['a', 0, 1], [' ', 1, 2], ['😀', 2, 4], [' ', 4, 5], ['b', 5, 6]
    ]);
  });

  test('a decomposed ä stays inside its word', () => {
    expect(DECOMPOSED_AE).toHaveLength(2);
    expect(kinds(`${DECOMPOSED_AE}iti`)).toEqual([`word:${DECOMPOSED_AE}iti`]);
    expect(kinds(`na\u0308ki o\u0308isin`)).toEqual(['word:na\u0308ki', 'space: ', 'word:o\u0308isin']);
  });

  test('a [TODO: …] note is one token; brackets without TODO: are not', () => {
    expect(kinds('Kissa [TODO: väri?] ja [TODO ilman]')).toEqual([
      'word:Kissa', 'space: ', 'atom:[TODO: väri?]', 'space: ', 'word:ja', 'space: ',
      'punct:[', 'word:TODO', 'space: ', 'word:ilman', 'punct:]'
    ]);
  });

  test('options.atomic makes every match one token', () => {
    expect(kinds('a ⟦1⟧b⟦/1⟧', { atomic: /⟦\/?\d+⟧/ })).toEqual(['word:a', 'space: ', 'atom:⟦1⟧', 'word:b', 'atom:⟦/1⟧']);
  });

  test('empty and missing text give no tokens', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize(null)).toEqual([]);
  });

  // Cases beyond the named list

  test('a tab, a carriage return, a no-break space and a narrow no-break space are spaces', () => {
    expect(kinds('a\t \u00a0\u202fb\r\nc')).toEqual(['word:a', 'space:\t \u00a0\u202f', 'word:b', 'space:\r', 'newline:\n', 'word:c']);
  });

  test('a number range, a soft hyphen and a non-breaking hyphen join; a hyphen at the end of a word does not', () => {
    expect(kinds('10-12')).toEqual(['word:10-12']);
    expect(kinds('yhdys\u00adsana ja ala\u2011arvo')).toEqual(['word:yhdys\u00adsana', 'space: ', 'word:ja', 'space: ', 'word:ala\u2011arvo']);
    expect(kinds('sana-')).toEqual(['word:sana', 'punct:-']);
    expect(kinds('- sana')).toEqual(['punct:-', 'space: ', 'word:sana']);
  });

  test('a note needs its closing bracket on the same line', () => {
    expect(kinds('[TODO: kesken')[0]).toBe('punct:[');
    expect(kinds('[TODO: a\nb]').filter(k => k.startsWith('atom'))).toEqual([]);
    expect(kinds('[TODO:]')).toEqual(['atom:[TODO:]']);
  });

  test('options.atomic: flags g and y are ignored and the expression itself is left alone', () => {
    const atomic = /⟦\/?\d+⟧/gy;
    atomic.lastIndex = 3;
    expect(kinds('a ⟦1⟧ b ⟦2⟧', { atomic })).toEqual(['word:a', 'space: ', 'atom:⟦1⟧', 'space: ', 'word:b', 'space: ', 'atom:⟦2⟧']);
    expect(atomic.lastIndex).toBe(3);
  });

  test('options.atomic: a match that begins inside a word or a space run is still its own token', () => {
    expect(kinds('abc123 45', { atomic: /\d+/ })).toEqual(['word:abc', 'atom:123', 'space: ', 'atom:45']);
    // the hyphen does not join a word to an atom
    expect(kinds('sivu-12', { atomic: /\d+/ })).toEqual(['word:sivu', 'punct:-', 'atom:12']);
    expect(kinds('a  \u00a0b', { atomic: /\u00a0/ })).toEqual(['word:a', 'space:  ', 'atom:\u00a0', 'word:b']);
  });

  test('options.atomic is tried before the note rule', () => {
    expect(kinds('[TODO: a] ja b', { atomic: /\[TODO: a\] ja/ })).toEqual(['atom:[TODO: a] ja', 'space: ', 'word:b']);
  });

  test('the tokens cover the text completely and in order', () => {
    const text = `– ”Hei!” [TODO: x]\t${DECOMPOSED_AE}iti 😀  10–12 %…\r\n\n<u>loppu</u>`;
    const tokens = tokenize(text);
    expect(tokens.map(t => t.text).join('')).toBe(text);
    let position = 0;
    for (const token of tokens) {
      expect(token.start).toBe(position);
      expect(token.end).toBe(position + token.text.length);
      expect(text.slice(token.start, token.end)).toBe(token.text);
      position = token.end;
    }
  });
});

describe('wordDiff: single changes', () => {
  test('identical texts give no changes', () => {
    expect(wordDiff('Kissa istui ikkunalla.', 'Kissa istui ikkunalla.')).toEqual([]);
    expect(wordDiff(null, undefined)).toEqual([]);
    expect(wordDiff('', '')).toEqual([]);
  });

  test('empty to text is one insertion, text to empty one deletion', () => {
    expect(wordDiff('', 'Uusi teksti.')).toEqual([change(0, 0, '', 'Uusi teksti.')]);
    expect(wordDiff('Vanha teksti.', '')).toEqual([change(0, 13, 'Vanha teksti.', '')]);
    expect(wordDiff('Vanha teksti.', null)).toEqual([change(0, 13, 'Vanha teksti.', '')]);
  });

  test('missing commas are pure insertions', () => {
    expect(wordDiff('Hän sanoi että tulee kun ehtii.', 'Hän sanoi, että tulee, kun ehtii.')).toEqual([
      change(9, 9, '', ','),
      change(20, 20, '', ',')
    ]);
  });

  test('a replaced word is one change with the whole word, ä ö å included', () => {
    expect(wordDiff('Äiti näki öisin åkerin.', 'Äiti näki öisin Åkerin.')).toEqual([change(16, 22, 'åkerin', 'Åkerin')]);
  });

  test('an inserted word carries its space; a deleted word takes its space', () => {
    expect(wordDiff('kissa istui', 'kissa musta istui')).toEqual([change(6, 6, '', 'musta ')]);
    expect(wordDiff('kissa musta istui', 'kissa istui')).toEqual([change(6, 12, 'musta ', '')]);
  });

  test('straight quotes to ” and a hyphen to – are one-character changes', () => {
    expect(wordDiff('"Hei", hän sanoi - ja lähti.', '”Hei”, hän sanoi – ja lähti.')).toEqual([
      change(0, 1, '"', '”'),
      change(4, 5, '"', '”'),
      change(17, 18, '-', '–')
    ]);
  });

  test('a compound written apart is replaced as a whole', () => {
    expect(wordDiff('linja auto', 'linja-auto')).toEqual([change(0, 10, 'linja auto', 'linja-auto')]);
    expect(wordDiff('ja laski kahvi kupin pöydälle.', 'ja laski kahvikupin pöydälle.')).toEqual([
      change(9, 20, 'kahvi kupin', 'kahvikupin')
    ]);
  });

  test('a hyphen in a number range is changed with its numbers', () => {
    expect(wordDiff('sivut 10-12', 'sivut 10–12')).toEqual([change(6, 11, '10-12', '10–12')]);
  });

  test('a missing space before % is an insertion', () => {
    expect(wordDiff('Hinta on 5%.', 'Hinta on 5 %.')).toEqual([change(10, 10, '', ' ')]);
  });

  test('a hyphen at the start of a line becomes a dialogue dash', () => {
    expect(wordDiff('- Hei, sanoi Pekka.', '– Hei, sanoi Pekka.')).toEqual([change(0, 1, '-', '–')]);
    expect(wordDiff('Eka.\n- Hei, sanoi Pekka.', 'Eka.\n– Hei, sanoi Pekka.')).toEqual([change(5, 6, '-', '–')]);
  });

  test('a double space is a change of its own', () => {
    expect(wordDiff('Hän meni  kotiin.', 'Hän meni kotiin.')).toEqual([change(8, 10, '  ', ' ')]);
  });

  test('offsets after an emoji count two units for it', () => {
    expect(wordDiff('Emoji 😀 tässä.', 'Emoji 😀 täällä.')).toEqual([change(9, 14, 'tässä', 'täällä')]);
  });

  test('a decomposed ä does not split the word', () => {
    expect(wordDiff(`${DECOMPOSED_AE}iti tuli.`, `${DECOMPOSED_AE}iti meni.`)).toEqual([change(6, 10, 'tuli', 'meni')]);
    // the word itself changes as a whole, combining mark included
    expect(wordDiff(`${DECOMPOSED_AE}iti tuli.`, 'Isä tuli.')).toEqual([change(0, 5, `${DECOMPOSED_AE}iti`, 'Isä')]);
  });

  test('a changed note is replaced as a whole, never in part', () => {
    expect(wordDiff('Kissa [TODO: väri?] istui.', 'Kissa [TODO: rotu?] istui.')).toEqual([
      change(6, 19, '[TODO: väri?]', '[TODO: rotu?]')
    ]);
  });
});

describe('wordDiff: merging near changes', () => {
  test('changes separated by one unchanged word are merged', () => {
    expect(wordDiff('vanha kissa istui', 'nuori kissa makasi')).toEqual([
      change(0, 17, 'vanha kissa istui', 'nuori kissa makasi')
    ]);
  });

  test('changes separated by only a space are merged', () => {
    expect(wordDiff('vanha kissa', 'nuori koira')).toEqual([change(0, 11, 'vanha kissa', 'nuori koira')]);
  });

  test('swapped words are one change', () => {
    expect(wordDiff('yksi kaksi kolme neljä', 'yksi kolme kaksi neljä')).toEqual([change(5, 16, 'kaksi kolme', 'kolme kaksi')]);
  });

  test('changes separated by two words stay apart', () => {
    expect(wordDiff('vanha kissa istui tässä hiljaa', 'nuori kissa istui tässä ääneti')).toEqual([
      change(0, 5, 'vanha', 'nuori'),
      change(24, 30, 'hiljaa', 'ääneti')
    ]);
  });

  test('a comma is never merged with a word change next to it', () => {
    expect(wordDiff('Hän sanoi että tulee.', 'Hän sanoi, jotta tulee.')).toEqual([
      change(9, 9, '', ','),
      change(10, 14, 'että', 'jotta')
    ]);
    expect(wordDiff('sanoi että kun', 'sanoi, että, kun')).toEqual([change(5, 5, '', ','), change(10, 10, '', ',')]);
  });

  test('changes are not merged across punctuation or a line break', () => {
    expect(wordDiff('Hän lähti. Sitten satoi.', 'Hän meni. Sen jälkeen satoi.')).toEqual([
      change(4, 9, 'lähti', 'meni'),
      change(11, 17, 'Sitten', 'Sen jälkeen')
    ]);
    expect(wordDiff('Eka kissa.\nToka koira.', 'Eka kisu.\nToka hauva.')).toEqual([
      change(4, 9, 'kissa', 'kisu'),
      change(16, 21, 'koira', 'hauva')
    ]);
    // one word and a line break between them: still two changes
    expect(wordDiff('vanha\nkissa istui', 'nuori\nkissa makasi')).toEqual([
      change(0, 5, 'vanha', 'nuori'),
      change(12, 17, 'istui', 'makasi')
    ]);
  });

  test('changes on both sides of a [TODO: …] note stay apart and leave it alone', () => {
    expect(wordDiff('kissa [TODO: väri?] istui', 'kisu [TODO: väri?] makasi')).toEqual([
      change(0, 5, 'kissa', 'kisu'),
      change(20, 25, 'istui', 'makasi')
    ]);
  });

  test('merge: false (or raw: true) returns the raw word changes', () => {
    const raw = [change(0, 5, 'vanha', 'nuori'), change(12, 17, 'istui', 'makasi')];
    expect(wordDiff('vanha kissa istui', 'nuori kissa makasi', { merge: false })).toEqual(raw);
    expect(wordDiff('vanha kissa istui', 'nuori kissa makasi', { raw: true })).toEqual(raw);
  });

  test('merging chains over several one-word gaps', () => {
    expect(wordDiff('yksi ja kaksi ja kolme', 'eka ja toka ja kolmas')).toEqual([
      change(0, 22, 'yksi ja kaksi ja kolme', 'eka ja toka ja kolmas')
    ]);
  });

  test('a merged change gives back the tokens both sides share at its ends', () => {
    // the raw diff deletes "kahvi " and keeps "kupin" → the merged change is trimmed to the words
    expect(wordDiff('Hän joi kahvi kupin tyhjäksi.', 'Hän joi kahvikupin tyhjäksi.')).toEqual([
      change(8, 19, 'kahvi kupin', 'kahvikupin')
    ]);
  });
});

describe('wordDiff: heavily rewritten sentences', () => {
  const original = 'Kissa istui ikkunalla, ja koira nukkui lattialla sohvan vieressä.';

  test('scattered changes under half of a sentence stay apart', () => {
    expect(wordDiff(original, 'Kissa makasi ikkunalla, ja koira torkkui lattialla nojatuolin vieressä.')).toEqual([
      change(6, 11, 'istui', 'makasi'),
      change(32, 55, 'nukkui lattialla sohvan', 'torkkui lattialla nojatuolin')
    ]);
  });

  test('over half of a sentence changed is one change from the first to the last changed word', () => {
    expect(wordDiff(original, 'Kissanpentu makasi ikkunalla, ja mäyräkoira torkkui lattialla nojatuolin vieressä.')).toEqual([
      change(
        0, 55,
        'Kissa istui ikkunalla, ja koira nukkui lattialla sohvan',
        'Kissanpentu makasi ikkunalla, ja mäyräkoira torkkui lattialla nojatuolin'
      )
    ]);
  });

  test('sentenceThreshold moves the limit', () => {
    expect(wordDiff(original, 'Kissanpentu makasi ikkunalla, ja mäyräkoira torkkui lattialla nojatuolin vieressä.', { sentenceThreshold: 0.9 })).toHaveLength(2);
    // 8 of 18 words is 0.44: over a limit of 0.4, under the default 0.5
    expect(wordDiff(original, 'Kissa makasi ikkunalla, ja koira torkkui lattialla nojatuolin vieressä.', { sentenceThreshold: 0.4 })).toEqual([
      change(6, 55, 'istui ikkunalla, ja koira nukkui lattialla sohvan', 'makasi ikkunalla, ja koira torkkui lattialla nojatuolin')
    ]);
  });

  test('the measure counts the words of both sentences: (removed + added) / (2 × total − removed + added)', () => {
    // 4 removed, 0 added in 9 words: 4 / 14 = 0.29 is over 0.25 (4 / 18 = 0.22 would not be)
    expect(wordDiff('Hän oli todella hyvin erittäin väsynyt ja aivan loppu.', 'Hän oli väsynyt ja loppu.', { sentenceThreshold: 0.25 })).toEqual([
      change(8, 47, 'todella hyvin erittäin väsynyt ja aivan', 'väsynyt ja')
    ]);
    // exactly at the limit is not over it: 8 / 18 with a limit of 8 / 18 stays two changes
    expect(wordDiff(original, 'Kissa makasi ikkunalla, ja koira torkkui lattialla nojatuolin vieressä.', { sentenceThreshold: 8 / 18 })
      .map(c => [c.from, c.to])).toEqual([[6, 11], [32, 55]]);
  });

  test('a fully edited long chapter falls back paragraph by paragraph, not to one change', () => {
    const paragraphs = [];
    const edited = [];
    for (let i = 0; i < 260; i++) {
      const words = Array.from({ length: 40 }, (_, j) => `sana${i}x${j}`);
      paragraphs.push(words.join(' '));
      edited.push(words.map((word, j) => (j % 10 === 5 ? `uusi${i}x${j}` : word)).join(' '));
    }
    const changes = wordDiff(paragraphs.join('\n'), edited.join('\n'));
    expect(changes).toHaveLength(1040);
    expect(Math.max(...changes.map(c => c.to - c.from))).toBeLessThan(20);
    expect(applyChanges(paragraphs.join('\n'), changes)).toBe(edited.join('\n'));
  });

  test('the collapse stops at the sentence boundary', () => {
    const changes = wordDiff(
      'Vanha mies käveli kotiin, ja hänen koiransa juoksi edellä iloisena. Ilta oli kaunis, ja aurinko laski hitaasti metsän taakse punaisena.',
      'Nuori mies juoksi kotiin, ja hänen kissansa käveli perässä väsyneenä. Aamu oli kylmä, ja aurinko nousi nopeasti metsän takaa kalpeana.'
    );
    expect(changes.map(c => [c.from, c.to])).toEqual([[0, 66], [68, 134]]);
  });

  test('a note between the changes blocks the collapse', () => {
    const changes = wordDiff(
      'Kissa istui ikkunalla, [TODO: x] ja koira nukkui lattialla sohvan vieressä.',
      'Kissanpentu makasi ikkunalla, [TODO: x] ja mäyräkoira torkkui lattialla nojatuolin vieressä.'
    );
    expect(changes.map(c => c.original)).toEqual(['Kissa istui', 'koira nukkui lattialla sohvan']);
  });

  test('a single change is never widened, and plain deletions stay as they are', () => {
    expect(wordDiff('Hän käveli hitaasti kotiin.', 'Hän käveli nopeasti kotiin.')).toEqual([change(11, 19, 'hitaasti', 'nopeasti')]);
    expect(wordDiff('Hän oli todella hyvin erittäin väsynyt ja aivan loppu.', 'Hän oli väsynyt ja loppu.')).toEqual([
      change(8, 31, 'todella hyvin erittäin ', ''),
      change(41, 47, ' aivan', '')
    ]);
  });

  test('the collapse never crosses a line break', () => {
    // each line: one change, two words kept, a merged change. 8 of 12 words changed, so each line collapses,
    // but the two lines stay two changes
    const changes = wordDiff(
      'Vanha harmaa mies käveli hitaasti kotiin\nPieni musta kissa istui hiljaa ikkunalla',
      'Nuori harmaa mies juoksi hitaasti töihin\nSuuri musta kissa makasi hiljaa lattialla'
    );
    expect(changes).toEqual([
      change(0, 40, 'Vanha harmaa mies käveli hitaasti kotiin', 'Nuori harmaa mies juoksi hitaasti töihin'),
      change(41, 81, 'Pieni musta kissa istui hiljaa ikkunalla', 'Suuri musta kissa makasi hiljaa lattialla')
    ]);
  });
});

describe('wordDiff: lines', () => {
  test('an inserted paragraph is one insertion with its line break', () => {
    expect(wordDiff('Eka kappale.\nToka kappale.', 'Eka kappale.\nUusi väli.\nToka kappale.')).toEqual([
      change(13, 13, '', 'Uusi väli.\n')
    ]);
  });

  test('a deleted paragraph is one deletion with its line break', () => {
    expect(wordDiff('Eka.\nToka.\nKolmas.', 'Eka.\nKolmas.')).toEqual([change(5, 11, 'Toka.\n', '')]);
  });

  test('joined and split paragraphs change only the line break', () => {
    expect(wordDiff('Eka kappale.\nToka kappale.', 'Eka kappale. Toka kappale.')).toEqual([change(12, 13, '\n', ' ')]);
    expect(wordDiff('Eka kappale. Toka kappale.', 'Eka kappale.\nToka kappale.')).toEqual([change(12, 13, ' ', '\n')]);
  });

  test('CRLF in the revised text is no change when the original uses LF', () => {
    expect(wordDiff('Hän tuli.\nSitten lähti.', 'Hän tuli.\r\nSitten meni.')).toEqual([change(17, 22, 'lähti', 'meni')]);
    expect(wordDiff('Eka.\nToka.', 'Eka.\r\nToka.')).toEqual([]);
    expect(wordDiff('Eka.\nToka.', 'Eka.\rToka.')).toEqual([]);
  });

  test('offsets count the \\r when the original uses CRLF', () => {
    expect(wordDiff('Hän tuli.\r\nSitten lähti.', 'Hän tuli.\r\nSitten meni.')).toEqual([change(18, 23, 'lähti', 'meni')]);
  });
});

describe('wordDiff: size guard', () => {
  const original = 'yksi kaksi kolme\nneljä viisi kuusi\nseitsemän kahdeksan';

  test('over the cap the diff goes line by line and stays word-level inside each line', () => {
    expect(wordDiff(original, 'yksi KAKSI kolme\nneljä viisi kuusi\nSEITSEMÄN KAHDEKSAN', { maxEdits: 5 })).toEqual([
      change(5, 10, 'kaksi', 'KAKSI'),
      change(35, 54, 'seitsemän kahdeksan', 'SEITSEMÄN KAHDEKSAN')
    ]);
  });

  test('a block that is over the cap by itself is replaced as a whole, trimmed to what differs', () => {
    expect(wordDiff(original, 'yksi kaksi kolme\nneljä VIISI kuusi\nseitsemän kahdeksan', { maxEdits: 0 })).toEqual([
      change(23, 28, 'viisi', 'VIISI')
    ]);
    expect(wordDiff('a b c d e f', 'a X c d Y f', { maxEdits: 2 })).toEqual([change(2, 9, 'b c d e', 'X c d Y')]);
  });

  test('whatever the cap, the changes turn the original into the revised text', () => {
    const revised = 'aa bb cc dd ee\nneljä viisi kuusi\nseitsemän kahdeksan yhdeksän';
    for (const maxEdits of [0, 1, 2, 3, 5, 8, 2000]) {
      expect(applyChanges(original, wordDiff(original, revised, { maxEdits }))).toBe(revised);
    }
  });

  test('two unrelated 9 000-word texts are handled in well under two seconds', () => {
    const a = Array.from({ length: 9000 }, (_, i) => `sana${i}`).join(' ');
    const b = Array.from({ length: 9000 }, (_, i) => `muu${i}`).join(' ');
    const started = Date.now();
    const changes = wordDiff(a, b);
    expect(applyChanges(a, changes)).toBe(b);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test('a line replaced as a whole leaves the line break both versions end with outside the change', () => {
    // without merging nothing is trimmed, so the kept block shows as it is
    expect(wordDiff('a b c d\nloppu', 'e f g h\nloppu', { maxEdits: 1, merge: false })).toEqual([
      change(0, 7, 'a b c d', 'e f g h')
    ]);
  });

  test('when even the lines are over the cap, one change runs from the first to the last line that differs', () => {
    expect(wordDiff('alku\na\nb\nc\nloppu', 'alku\nd\ne\nf\ng\nloppu', { maxEdits: 1 })).toEqual([
      change(5, 10, 'a\nb\nc', 'd\ne\nf\ng')
    ]);
  });

  test('over the cap an added line is kept whole, with its line break', () => {
    // 8 token edits, 3 line edits: with a cap of 3 the lines are aligned, and the changed line
    // (4 token edits by itself) is replaced as a whole and trimmed
    expect(wordDiff('a b c\nloppu x y', 'uusi rivi\na b c\nloppu z w', { maxEdits: 3 })).toEqual([
      change(0, 0, '', 'uusi rivi\n'),
      change(12, 15, 'x y', 'z w')
    ]);
    // with a cap of 2 not even the lines fit: everything is one change
    expect(wordDiff('a b c\nloppu x y', 'uusi rivi\na b c\nloppu z w', { maxEdits: 2 })).toEqual([
      change(0, 15, 'a b c\nloppu x y', 'uusi rivi\na b c\nloppu z w')
    ]);
  });
});

describe('wordDiff: invariants', () => {
  // Small deterministic generator, so a failure can be repeated
  let state = 20261116;
  const random = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const WORDS = ['kissa', 'koira', 'äiti', 'öinen', 'Åke', 'ja', 'on', 'linja-auto', 'vaa’an', 'talo', 'hän', 'meni'];
  const SEPARATORS = [' ', ' ', ' ', ', ', '. ', ' – ', '\n', '\n\n', ' ”', '” ', '! ', '? ', '  ', '… '];
  const text = (words) => {
    let out = '';
    for (let i = 0; i < words; i++) out += pick(WORDS) + pick(SEPARATORS);
    return out;
  };
  const edit = (source) => tokenize(source).map((t) => {
    const r = random();
    if (r < 0.08) return '';
    if (r < 0.16) return pick(WORDS);
    if (r < 0.22) return t.text + pick(SEPARATORS) + pick(WORDS);
    return t.text;
  }).join('');

  test('300 generated edits: sorted, at least one unchanged character apart, original matches, applies', () => {
    for (let i = 0; i < 300; i++) {
      const original = text(1 + Math.floor(random() * 40));
      const revised = random() < 0.1 ? text(1 + Math.floor(random() * 40)) : edit(original);
      for (const options of [undefined, { merge: false }, { maxEdits: 3 }]) {
        const changes = wordDiff(original, revised, options);
        expect(applyChanges(original, changes)).toBe(revised);
        let previousEnd = -1;
        for (const c of changes) {
          expect(c.from).toBeGreaterThan(previousEnd);
          expect(c.to).toBeGreaterThanOrEqual(c.from);
          expect(original.slice(c.from, c.to)).toBe(c.original);
          expect(c.insert).not.toBe(c.original);
          previousEnd = c.to;
        }
      }
    }
  });

  test('200 generated edits around notes: a note both texts keep in the same order is in no change', () => {
    const NOTES = ['[TODO: tarkista]', '[TODO: nimi?]', '[TODO: 3]'];
    for (let i = 0; i < 200; i++) {
      let original = '';
      const words = 2 + Math.floor(random() * 20);
      for (let j = 0; j < words; j++) original += (random() < 0.2 ? pick(NOTES) : pick(WORDS)) + pick(SEPARATORS);
      // edit everything except the notes
      const revised = tokenize(original).map((t) => {
        if (t.type === 'atom') return t.text;
        const r = random();
        if (r < 0.15) return '';
        if (r < 0.3) return pick(WORDS);
        if (r < 0.4) return t.text + ' ' + pick(WORDS);
        return t.text;
      }).join('');
      for (const options of [undefined, { merge: false }, { maxEdits: 2 }, { sentenceThreshold: 0 }]) {
        const changes = wordDiff(original, revised, options);
        expect(applyChanges(original, changes)).toBe(revised);
        for (const c of changes) {
          expect(c.original).not.toContain('[TODO:');
          expect(c.insert).not.toContain('[TODO:');
        }
      }
    }
  });

  test('200 generated edits: a change made of several raw changes never contains a line break', () => {
    for (let i = 0; i < 200; i++) {
      const original = text(1 + Math.floor(random() * 40));
      const revised = edit(original);
      const raw = wordDiff(original, revised, { merge: false });
      for (const options of [undefined, { sentenceThreshold: 0 }]) {
        for (const c of wordDiff(original, revised, options)) {
          const parts = raw.filter(r => r.from >= c.from && r.to <= c.to);
          if (parts.length < 2) continue;
          expect(c.original).not.toContain('\n');
          expect(c.insert).not.toContain('\n');
        }
      }
    }
  });
});

describe('helpers', () => {
  test('applyChanges applies changes and refuses overlapping ones', () => {
    expect(applyChanges('Kissa istui.', [change(6, 11, 'istui', 'makasi')])).toBe('Kissa makasi.');
    expect(applyChanges('abc', [])).toBe('abc');
    expect(() => applyChanges('abc', [change(2, 3, 'c', 'x'), change(1, 2, 'b', 'y')])).toThrow(RangeError);
  });

  test('offsetChanges moves changes of a selection to chapter offsets', () => {
    expect(offsetChanges(wordDiff('kissa istui', 'kissa makasi'), 100)).toEqual([change(106, 111, 'istui', 'makasi')]);
  });

  test('diffSegments gives same, removed and added pieces that rebuild both texts', () => {
    const segments = diffSegments('Kissa istui ikkunalla.', 'Kissa makasi ikkunalla hiljaa.');
    expect(segments).toEqual([
      { type: 'same', text: 'Kissa ' },
      { type: 'removed', text: 'istui ikkunalla' },
      { type: 'added', text: 'makasi ikkunalla hiljaa' },
      { type: 'same', text: '.' }
    ]);
    expect(segments.filter(s => s.type !== 'added').map(s => s.text).join('')).toBe('Kissa istui ikkunalla.');
    expect(segments.filter(s => s.type !== 'removed').map(s => s.text).join('')).toBe('Kissa makasi ikkunalla hiljaa.');
  });

  test('applyChanges: the three refused shapes, the message, and changes that only touch', () => {
    const message = 'applyChanges: changes must be sorted, non-overlapping and inside the text';
    expect(() => applyChanges('abc', [change(1, 2, 'b', 'x'), change(1, 1, '', 'y')])).toThrow(message);
    expect(() => applyChanges('abc', [{ from: 2, to: 1, insert: 'x' }])).toThrow(message);
    expect(() => applyChanges('abc', [{ from: 2, to: 4, insert: 'x' }])).toThrow(message);
    // an insertion right where the previous change ended is allowed; so is a change without `original`
    expect(applyChanges('abc', [{ from: 0, to: 1, insert: 'X' }, { from: 1, to: 1, insert: '-' }])).toBe('X-bc');
    expect(applyChanges('abc', [{ from: 3, to: 3, insert: '!' }])).toBe('abc!');
    expect(applyChanges(null, null)).toBe('');
  });

  test('offsetChanges returns copies and leaves the changes it was given alone', () => {
    const changes = wordDiff('kissa istui', 'kissa makasi');
    const moved = offsetChanges(changes, -6);
    expect(moved).toEqual([change(0, 5, 'istui', 'makasi')]);
    expect(changes).toEqual([change(6, 11, 'istui', 'makasi')]);
    expect(moved[0]).not.toBe(changes[0]);
    expect(offsetChanges(undefined, 5)).toEqual([]);
  });

  test('diffSegments: equal texts are one piece, empty texts none, and CRLF from a model is no difference', () => {
    expect(diffSegments('Kissa istui.', 'Kissa istui.')).toEqual([{ type: 'same', text: 'Kissa istui.' }]);
    expect(diffSegments('', '')).toEqual([]);
    expect(diffSegments('', 'Uusi.')).toEqual([{ type: 'added', text: 'Uusi.' }]);
    expect(diffSegments('Eka.\nToka.', 'Eka.\r\nKolmas.')).toEqual([
      { type: 'same', text: 'Eka.\n' },
      { type: 'removed', text: 'Toka' },
      { type: 'added', text: 'Kolmas' },
      { type: 'same', text: '.' }
    ]);
  });

  test('normalizeOptions fills in the defaults and is safe on its own result', () => {
    const defaults = { maxEdits: 2000, sentenceThreshold: 0.5, merge: true, atomic: null, anchor: true };
    expect(normalizeOptions()).toEqual(defaults);
    expect(normalizeOptions(null)).toEqual(defaults);
    expect(normalizeOptions({ maxEdits: -1, sentenceThreshold: 'x' })).toEqual(defaults);
    const custom = normalizeOptions({ maxEdits: 7.9, raw: true, anchor: false, sentenceThreshold: 0 });
    expect(custom).toEqual({ maxEdits: 7, sentenceThreshold: 0, merge: false, atomic: null, anchor: false });
    expect(normalizeOptions(custom)).toEqual(custom);
    expect(normalizeOptions({ merge: false }).merge).toBe(false);
  });

  test('rawHunks gives the unmerged ranges of both texts and takes plain options', () => {
    expect(rawHunks('vanha kissa istui', 'nuori kissa makasi')).toEqual([
      { from: 0, to: 5, rFrom: 0, rTo: 5 },
      { from: 12, to: 17, rFrom: 12, rTo: 18 }
    ]);
    // a placeholder is one token, and with anchor: false it is not a fixed point: a moved one shows
    const hunks = rawHunks('a ⟦1⟧ b', 'a b ⟦1⟧', { atomic: /⟦\/?\d+⟧/g, anchor: false });
    expect(hunks).toEqual([{ from: 2, to: 6, rFrom: 2, rTo: 2 }, { from: 7, to: 7, rFrom: 3, rTo: 7 }]);
    expect(rawHunks('sama', 'sama')).toEqual([]);
    expect(rawHunks(null, 'uusi')).toEqual([{ from: 0, to: 0, rFrom: 0, rTo: 4 }]);
  });
});

describe('changeStats and changeRatio', () => {
  test('punctuation-only corrections change no words: ratio 0', () => {
    expect(changeStats('Hän sanoi että tulee.', 'Hän sanoi, että tulee.')).toEqual({
      ratio: 0, originalWords: 4, revisedWords: 4, commonWords: 4, removedWords: 0, addedWords: 0, approximate: false
    });
  });

  test('one word of four replaced is 0.25', () => {
    expect(changeRatio('Hän tuli kotiin illalla.', 'Hän saapui kotiin illalla.')).toBe(0.25);
  });

  test('a compound fix in a ten-word line stays far under 0.3', () => {
    expect(changeRatio(
      'linja auto on täällä tänään taas kerran myöhässä aikataulusta',
      'linja-auto on täällä tänään taas kerran myöhässä aikataulusta'
    )).toBeCloseTo(0.176, 3);
  });

  test('a colloquial line turned into standard Finnish is over 0.3', () => {
    expect(changeRatio('– Mä tuun kohta.', '– Minä tulen kohta.')).toBeCloseTo(0.667, 3);
  });

  test('empty against empty is 0, anything against empty is 1, unrelated texts are 1', () => {
    expect(changeRatio('', '')).toBe(0);
    expect(changeRatio('', 'uusi teksti')).toBe(1);
    expect(changeRatio('vanha teksti', null)).toBe(1);
    expect(changeRatio('yksi kaksi kolme', 'neljä viisi kuusi')).toBe(1);
  });

  test('over the cap the result is marked approximate and never below (cap + 1) / words', () => {
    const stats = changeStats('a b c d e f g h', 'h g f e d c b a', { maxEdits: 4 });
    expect(stats.approximate).toBe(true);
    expect(stats.ratio).toBeGreaterThanOrEqual(5 / 16);
    // the smaller of the two bounds: 8 shared words, or floor((16 - 5) / 2) = 5
    expect(stats).toMatchObject({ commonWords: 5, removedWords: 3, addedWords: 3, ratio: 6 / 16 });
    // and never above the exact ratio, which the default cap gives
    const exact = changeStats('a b c d e f g h', 'h g f e d c b a');
    expect(exact.approximate).toBe(false);
    expect(stats.ratio).toBeLessThanOrEqual(exact.ratio);
  });

  test('notes, spaces and punctuation are not words; a word in another case is another word', () => {
    expect(changeStats('Kissa [TODO: tarkista väri] istui.', 'Kissa istui!')).toMatchObject({
      ratio: 0, originalWords: 2, revisedWords: 2, commonWords: 2
    });
    expect(changeStats('Kissa istui', 'kissa istui')).toMatchObject({ ratio: 0.5, commonWords: 1, removedWords: 1, addedWords: 1 });
  });

  test('the default cap of changeStats is 6000 edits', () => {
    const words = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(' ');
    expect(changeStats(words('s', 3000), words('t', 3000)).approximate).toBe(false);
    expect(changeStats(words('s', 3001), words('t', 3000)).approximate).toBe(true);
  });

  test('removed and added words are counted apart', () => {
    expect(changeStats('Hän oli todella hyvin väsynyt.', 'Hän oli väsynyt, ihan loppu.')).toEqual({
      ratio: 4 / 10, originalWords: 5, revisedWords: 5, commonWords: 3, removedWords: 2, addedWords: 2, approximate: false
    });
  });

  test('CRLF in the revised text does not count', () => {
    expect(changeRatio('Eka rivi.\nToka rivi.', 'Eka rivi.\r\nToka rivi.')).toBe(0);
  });
});

/**
 * @jest-environment node
 */
const { splitSentences, trimToSentence, ABBREVIATIONS } = require('../../src/editor/sentences');

// Sentences as strings; an unfinished one is marked with ¶
const sentences = (text) => splitSentences(text).map(s => text.slice(s.from, s.to) + (s.terminated ? '' : '¶'));

describe('splitSentences', () => {
  test('splits after . ! ? and … when a capital letter follows', () => {
    expect(sentences('Kissa istui. Koira nukkui! Mitä nyt? Hän epäröi… Sitten lähti')).toEqual([
      'Kissa istui.', 'Koira nukkui!', 'Mitä nyt?', 'Hän epäröi…', 'Sitten lähti¶'
    ]);
    // Ä, Ö and Å are capitals too
    expect(sentences('Kissa istui. Äiti tuli. Öisin satoi. Åke lähti.')).toEqual(['Kissa istui.', 'Äiti tuli.', 'Öisin satoi.', 'Åke lähti.']);
  });

  test('a quotation and its reporting clause are one sentence', () => {
    expect(sentences('”Mitä sinä teet?” hän kysyi. ”En mitään.” Hän lähti.')).toEqual([
      '”Mitä sinä teet?” hän kysyi.', '”En mitään.”', 'Hän lähti.'
    ]);
  });

  test('dialogue dash: the reporting clause stays with the line', () => {
    expect(sentences('– Tule tänne! hän huusi. – En tule.')).toEqual(['– Tule tänne! hän huusi.', '– En tule.']);
  });

  test('abbreviations and initials do not end a sentence', () => {
    expect(sentences('Hän osti esim. Helsingistä mm. kirjoja. J. K. Rowling kirjoitti ne.')).toEqual([
      'Hän osti esim. Helsingistä mm. kirjoja.', 'J. K. Rowling kirjoitti ne.'
    ]);
  });

  test('dates, times and decimals', () => {
    expect(sentences('Se tapahtui 12. toukokuuta 2020. Kello oli 10.30. Lämpötila oli 3,5 astetta.')).toEqual([
      'Se tapahtui 12. toukokuuta 2020.', 'Kello oli 10.30.', 'Lämpötila oli 3,5 astetta.'
    ]);
  });

  test('lines are hard boundaries; a line without a full stop is an unfinished sentence', () => {
    expect(sentences('Eka rivi ilman pistettä\nToka rivi. Kolmas virke\n\n  Sisennetty.  ')).toEqual([
      'Eka rivi ilman pistettä¶', 'Toka rivi.', 'Kolmas virke¶', 'Sisennetty.'
    ]);
  });

  test('closing quotation marks, brackets and emphasis markers belong to the sentence', () => {
    expect(sentences('*Hän lähti.* Sitten tuli **yö.** Ja aamu.')).toEqual(['*Hän lähti.*', 'Sitten tuli **yö.**', 'Ja aamu.']);
    expect(sentences('Hän sanoi: ”Tule.” (Ei tullut.) Loppu.')).toEqual(['Hän sanoi: ”Tule.”', '(Ei tullut.)', 'Loppu.']);
    expect(sentences('_Hän lähti._ Sitten tuli yö.')).toEqual(['_Hän lähti._', 'Sitten tuli yö.']);
  });

  test('?! and ... are one ending', () => {
    expect(sentences('Mitä?! Ei voi olla... Vai voiko?')).toEqual(['Mitä?!', 'Ei voi olla...', 'Vai voiko?']);
  });

  test('offsets point into the text', () => {
    expect(splitSentences('  Eka. Toka')).toEqual([
      { from: 2, to: 6, terminated: true },
      { from: 7, to: 11, terminated: false }
    ]);
  });

  test('empty and missing text give []', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences(undefined)).toEqual([]);
    expect(splitSentences(null)).toEqual([]);
    expect(splitSentences('  \n \n')).toEqual([]);
  });

  // Cases beyond the named list

  test('an ending with nothing after it but text is not a boundary: 3.5, 10.30, www.fi', () => {
    expect(sentences('Sivu www.fi aukesi 10.30 ja arvo oli 3.5 astetta.')).toEqual(['Sivu www.fi aukesi 10.30 ja arvo oli 3.5 astetta.']);
  });

  test('a lowercase letter after the ending keeps the sentence going', () => {
    expect(sentences('Hän osti kirjoja esim. näin ja lähti. Loppu.')).toEqual(['Hän osti kirjoja esim. näin ja lähti.', 'Loppu.']);
    expect(sentences('”Tule jo!” äiti huusi. Ei kuulunut mitään.')).toEqual(['”Tule jo!” äiti huusi.', 'Ei kuulunut mitään.']);
  });

  test('a number with a full stop: digits after it keep the date together, a capital ends the sentence', () => {
    expect(sentences('Se oli 12. 5. 2026. Sitten satoi.')).toEqual(['Se oli 12. 5. 2026.', 'Sitten satoi.']);
    expect(sentences('Vuosi oli 2020. Sitten tuli talvi.')).toEqual(['Vuosi oli 2020.', 'Sitten tuli talvi.']);
  });

  test('abbreviations are compared in lowercase; jne. and ym. do end a sentence', () => {
    expect(sentences('Katso Esim. Helsinki ja Prof. Virtanen. Loppu.')).toEqual(['Katso Esim. Helsinki ja Prof. Virtanen.', 'Loppu.']);
    expect(sentences('Hän osti kirjoja, lehtiä jne. Sitten hän lähti.')).toEqual(['Hän osti kirjoja, lehtiä jne.', 'Sitten hän lähti.']);
    expect(sentences('Mukana olivat Aino, Eino ym. Kaikki nauroivat.')).toEqual(['Mukana olivat Aino, Eino ym.', 'Kaikki nauroivat.']);
  });

  test('the abbreviation list is the documented one', () => {
    expect([...ABBREVIATIONS].sort()).toEqual([
      'esim', 'mm', 'ns', 'ks', 'vrt', 'ts', 'nk', 'so', 'ko', 'ao', 'em', 'ed', 'po', 'ml', 'pl', 'huom', 'nro', 'puh', 'os',
      'tri', 'prof', 'dos', 'fil', 'toim', 'suom', 'synt', 'kuoll', 'klo', 'vs', 'ca', 'mr', 'mrs', 'dr', 'st'
    ].sort());
    for (const word of ['jne', 'ym', 'yms', 'tms']) expect(ABBREVIATIONS.has(word)).toBe(false);
  });

  test('an initial with ä, ö or å, also a decomposed one, is an initial', () => {
    expect(sentences('Ä. Koskinen ja Ö. Virta tulivat. Loppu.')).toEqual(['Ä. Koskinen ja Ö. Virta tulivat.', 'Loppu.']);
    expect(sentences('A\u0308. Koskinen tuli. Loppu.')).toEqual(['A\u0308. Koskinen tuli.', 'Loppu.']);
  });

  test('a weak full stop at the end of a line still closes the sentence', () => {
    expect(sentences('Hän osti kirjoja esim.\nToinen rivi')).toEqual(['Hän osti kirjoja esim.', 'Toinen rivi¶']);
    expect(splitSentences('Se tapahtui 12.  ')).toEqual([{ from: 0, to: 15, terminated: true }]);
  });

  test('CRLF: the \\r is trailing space of its line, never part of a sentence', () => {
    const text = 'Eka virke.\r\nToka virke\r\n';
    expect(splitSentences(text)).toEqual([
      { from: 0, to: 10, terminated: true },
      { from: 12, to: 22, terminated: false }
    ]);
  });

  test('a sentence may start with a dash, a quotation mark or an ellipsis', () => {
    expect(sentences('– Niin. ”Ei.” …ja sitten hän lähti. Loppu')).toEqual(['– Niin.', '”Ei.”', '…ja sitten hän lähti.', 'Loppu¶']);
  });
});

describe('trimToSentence', () => {
  test('cuts an interrupted text back to the last full stop', () => {
    expect(trimToSentence('Kissa istui ikkunalla. Koira nukk')).toBe('Kissa istui ikkunalla.');
  });

  test('leaves a finished text alone, without trailing space', () => {
    expect(trimToSentence('Kissa istui ikkunalla. Koira nukkui.')).toBe('Kissa istui ikkunalla. Koira nukkui.');
    expect(trimToSentence('Kissa istui ikkunalla. Koira nukkui. ')).toBe('Kissa istui ikkunalla. Koira nukkui.');
  });

  test('no complete sentence gives an empty string', () => {
    expect(trimToSentence('Kissa istui ikkunal')).toBe('');
    expect(trimToSentence('”Mitä?” hän kysyi ja')).toBe('');
    expect(trimToSentence('')).toBe('');
    expect(trimToSentence(null)).toBe('');
  });

  test('earlier lines are complete, with or without a full stop', () => {
    expect(trimToSentence('Eka kappale.\nToka kappale alkaa ja')).toBe('Eka kappale.');
    expect(trimToSentence('– Niin\nToka kappale alkaa ja')).toBe('– Niin');
    expect(trimToSentence('Eka kappale.\n\nToka. Kolmas alk')).toBe('Eka kappale.\n\nToka.');
    expect(trimToSentence('Eka.\nToka.\n')).toBe('Eka.\nToka.');
  });

  test('prefers a cut where the quotation marks are balanced', () => {
    expect(trimToSentence('Hän sanoi: ”Tule tänne. Minä odotan.” Sitten hän')).toBe('Hän sanoi: ”Tule tänne. Minä odotan.”');
    expect(trimToSentence('”Mitä?” hän kysyi. ”Ei mit')).toBe('”Mitä?” hän kysyi.');
  });

  test('keeps an open quotation rather than dropping the paragraph', () => {
    expect(trimToSentence('Hän sanoi: ”Tule tänne. Minä')).toBe('Hän sanoi: ”Tule tänne.');
  });

  test('does not stop at esim., an initial or an ordinal at the very end', () => {
    expect(trimToSentence('Kissa nukkui. Hän osti kirjoja esim.')).toBe('Kissa nukkui.');
    expect(trimToSentence('Kissa nukkui. Kirjailija oli J.')).toBe('Kissa nukkui.');
    expect(trimToSentence('Kissa nukkui. Se tapahtui 12.')).toBe('Kissa nukkui.');
    expect(trimToSentence('Vuosi oli 2020. Sitten')).toBe('Vuosi oli 2020.');
  });

  test('an ellipsis and an exclamation mark end a sentence', () => {
    expect(trimToSentence('Hän epäröi… Sitten hän')).toBe('Hän epäröi…');
    expect(trimToSentence('– Tule tänne! hän huusi. – En')).toBe('– Tule tänne! hän huusi.');
  });

  test('keeps the closing ” and * after the full stop', () => {
    expect(trimToSentence('Loppu hyvin.”')).toBe('Loppu hyvin.”');
    expect(trimToSentence('*Hän lähti.* Sitten')).toBe('*Hän lähti.*');
  });

  // Cases beyond the named list

  test('balance is counted for ", for “ ” and for « » as well', () => {
    // the cut inside the open quotation is passed over for the earlier balanced one
    expect(trimToSentence('Hän tuli. "Tule tänne. Minä')).toBe('Hän tuli.');
    expect(trimToSentence('Hän tuli. “Tule tänne. Minä')).toBe('Hän tuli.');
    expect(trimToSentence('Hän tuli. «Tule tänne. Minä')).toBe('Hän tuli.');
    expect(trimToSentence('Hän tuli. »Tule tänne. Minä')).toBe('Hän tuli.');
    expect(trimToSentence('Hän sanoi: “Tule tänne. Minä odotan.” Sitten hän')).toBe('Hän sanoi: “Tule tänne. Minä odotan.”');
  });

  test('quotation marks of earlier lines do not count', () => {
    expect(trimToSentence('”Avoin lainaus jäi\nToka rivi loppui. Kolmas alk')).toBe('”Avoin lainaus jäi\nToka rivi loppui.');
  });

  test('a weak full stop in the middle of the last line is a cut; only the one at the very end is not', () => {
    expect(trimToSentence('Se tapahtui 12. Sitten hän')).toBe('Se tapahtui 12.');
    expect(trimToSentence('Se tapahtui 12. ')).toBe('');
    expect(trimToSentence('Eka rivi\nKirjailija oli J.')).toBe('Eka rivi');
  });

  test('the result is a beginning of the text and never ends in whitespace, CRLF included', () => {
    for (const text of ['Eka.\r\nToka kesk', 'Eka.  \n  ', 'Eka. Toka.\t', ' \n ', 'Eka.\n\n\nToka', 'Eka! Toka? Kolmas… Nelj']) {
      const trimmed = trimToSentence(text);
      expect(text.startsWith(trimmed)).toBe(true);
      expect(trimmed).toBe(trimmed.trimEnd());
    }
    expect(trimToSentence('Eka.\r\nToka kesk')).toBe('Eka.');
    expect(trimToSentence('Eka.\n\n\nToka')).toBe('Eka.');
    expect(trimToSentence('Eka! Toka? Kolmas… Nelj')).toBe('Eka! Toka? Kolmas…');
  });
});

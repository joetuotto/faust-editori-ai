/**
 * @jest-environment node
 */
const { tokenizeWords, buildVoikkoInput, voikkoFindings, nameHits } = require('../../src/services/language/voikkoCheck');

// Lines of a text in the shape of src/editor/blocks.js (kind, from, text)
function splitBlocks(text) {
  const blocks = [];
  let from = 0;
  text.split('\n').forEach((line, index) => {
    let kind = 'paragraph';
    if (!line.trim()) kind = 'blank';
    else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) kind = 'break';
    else if (/^#{1,6}\s/.test(line)) kind = 'heading';
    else if (/^>/.test(line)) kind = 'quote';
    else if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) kind = 'list';
    blocks.push({ n: index + 1, from, to: from + line.length, kind, text: line });
    from += line.length + 1;
  });
  return blocks;
}

const deps = { splitBlocks };
const words = (text) => tokenizeWords(text).map(token => token.word);
const known = (word, analyses = []) => ({ word, known: true, analyses, suggestions: [] });
const unknown = (word, suggestions = []) => ({ word, known: false, analyses: [], suggestions });

describe('tokenizeWords', () => {
  test('tokenizeWords keeps maa-, Marja-Liisa, EU:n and vaa’an whole', () => {
    const text = 'Marja-Liisa tutki maa- ja metsätaloutta EU:n vaa’an ja vaa\'an avulla.';
    expect(words(text)).toEqual(['Marja-Liisa', 'tutki', 'maa-', 'ja', 'metsätaloutta', 'EU:n', 'vaa’an', 'ja', 'vaa\'an', 'avulla']);
    for (const token of tokenizeWords(text)) expect(text.slice(token.from, token.to)).toBe(token.word);
  });

  test('ä, ö and å, later lines and plain numbers', () => {
    const text = 'Äiti söi åtta\npäärynää vuonna 1939 ja 2 kpl A4-arkkeja.';
    const tokens = tokenizeWords(text);
    expect(tokens.map(token => token.word)).toEqual(['Äiti', 'söi', 'åtta', 'päärynää', 'vuonna', 'ja', 'kpl', 'A4-arkkeja']);
    expect(tokens[3]).toEqual({ word: 'päärynää', from: 14, to: 22 });
    for (const token of tokens) expect(text.slice(token.from, token.to)).toBe(token.word);
    expect(tokenizeWords('')).toEqual([]);
    expect(tokenizeWords(undefined)).toEqual([]);
    expect(words('– Hei, ”sanoi” Pekka… **lihava** _kursiivi_')).toEqual(['Hei', 'sanoi', 'Pekka', 'lihava', 'kursiivi']);
  });

  test('tokenizeWords skips words inside a TODO note', () => {
    expect(words('Juna lähti [TODO: tarkista aikataulu] illalla.')).toEqual(['Juna', 'lähti', 'illalla']);
    // An unclosed note runs to the end of its line only
    expect(words('Alku [TODO: kesken jäänyt\nSeuraava rivi.')).toEqual(['Alku', 'Seuraava', 'rivi']);
    // The tags are skipped, the underlined word is not; a placeholder has no letters
    expect(words('Hän oli <u>hyvin</u> väsynyt ⟦12⟧.')).toEqual(['Hän', 'oli', 'hyvin', 'väsynyt']);
  });
});

describe('buildVoikkoInput', () => {
  const TEXT = [
    '# Otsikko jossa virhhe',
    '',
    'Äiti söi **päärynän** ja _omenan_ [TODO: tarkista] illalla.',
    '- luettelon kohta',
    '> lainattu rivi',
    '* * *',
    'Toinen <u>kappale</u> ja ~~poisto~~ sekä \\*tähti\\* ja snake_case ja 2 * 3 * 4.'
  ].join('\n');

  test('buildVoikkoInput keeps paragraph offsets equal to document offsets', () => {
    const input = buildVoikkoInput(TEXT, deps);
    expect(input.paragraphs).toHaveLength(2);
    for (const paragraph of input.paragraphs) {
      const line = TEXT.slice(paragraph.from, paragraph.from + paragraph.text.length);
      expect(paragraph.text).toHaveLength(line.length);
      expect(TEXT[paragraph.from - 1]).toBe('\n');
      // Every character that was kept is the document's character at the same place
      [...paragraph.text].forEach((ch, index) => {
        if (ch !== ' ') expect(ch).toBe(TEXT[paragraph.from + index]);
      });
    }
    expect(input.paragraphs[0].from).toBe(TEXT.indexOf('Äiti'));
    expect(input.paragraphs[1].from).toBe(TEXT.indexOf('Toinen'));
    // A word of the paragraph sits at its document offset minus `from`
    const at = input.paragraphs[0].text.indexOf('omenan');
    expect(TEXT.slice(input.paragraphs[0].from + at, input.paragraphs[0].from + at + 6)).toBe('omenan');
  });

  test('buildVoikkoInput blanks Markdown markers and tags without changing length', () => {
    const input = buildVoikkoInput(TEXT, deps);
    expect(input.paragraphs[0].text).toBe('Äiti söi   päärynän   ja  omenan                   illalla.');
    // Escaped markers, snake_case and a product of numbers are text, not markers
    expect(input.paragraphs[1].text).toBe('Toinen    kappale     ja   poisto   sekä \\*tähti\\* ja snake_case ja 2 * 3 * 4.');
    // Bold around an underline, nested emphasis, placeholders
    const nested = buildVoikkoInput('**<u>sana</u>** ja **lihava _ja kursiivi_** ⟦3⟧ loppu', deps).paragraphs[0].text;
    expect(nested).toBe('     sana       ja   lihava  ja kursiivi        loppu');
    expect(buildVoikkoInput('', deps)).toEqual({ words: [], tokens: [], paragraphs: [] });
  });

  test('the words are the distinct words of the whole text, headings and lists included', () => {
    const input = buildVoikkoInput('# Sana\nSana ja sana.\n- sana ja Sana', deps);
    expect(input.words).toEqual(['Sana', 'ja', 'sana']);
    expect(input.tokens).toHaveLength(7);
    expect(input.tokens).toEqual(tokenizeWords('# Sana\nSana ja sana.\n- sana ja Sana'));
    // Only paragraph lines go to the grammar check
    expect(input.paragraphs).toEqual([{ from: 7, text: 'Sana ja sana.' }]);
  });
});

describe('voikkoFindings', () => {
  test('voikkoFindings lists every occurrence of an unknown word', () => {
    const text = 'Kisssa istui. Toinen kisssa nukkui.\nKolmas kisssa ja koirra.';
    const input = buildVoikkoInput(text, deps);
    const findings = voikkoFindings({
      text,
      tokens: input.tokens,
      wordResults: [
        unknown('kisssa', ['kissa', 'kisassa', 'kissaa', 'kisoissa', 'kissan', 'kiss']),
        unknown('Kisssa', ['Kissa']),
        unknown('koirra', []),
        known('istui'), known('Toinen'), known('nukkui'), known('Kolmas'), known('ja')
      ]
    });
    expect(findings.map(finding => [finding.quote, finding.from, finding.count])).toEqual([
      ['Kisssa', 0, 1], ['kisssa', 21, 2], ['kisssa', 43, 2], ['koirra', 53, 1]
    ]);
    expect(findings[1]).toEqual({
      id: 'oikeinkirjoitus@21',
      kind: 'oikeinkirjoitus',
      from: 21,
      to: 27,
      quote: 'kisssa',
      message: 'Voikko ei tunne sanaa.',
      code: null,
      // At most five suggestions
      suggestions: ['kissa', 'kisassa', 'kissaa', 'kisoissa', 'kissan'],
      count: 2
    });
    expect(new Set(findings.map(finding => finding.id)).size).toBe(4);
    for (const finding of findings) expect(text.slice(finding.from, finding.to)).toBe(finding.quote);

    // A word without a result was not checked: it is not a finding
    expect(voikkoFindings({ text, tokens: input.tokens, wordResults: [] })).toEqual([]);
    expect(voikkoFindings({ text: '', tokens: [], wordResults: [] })).toEqual([]);
  });

  test('grammar findings carry Voikko\'s own explanation and document offsets', () => {
    const text = '# Otsikko\n\nHän on on täällä.\nPuhdas kappale.';
    const input = buildVoikkoInput(text, deps);
    const findings = voikkoFindings({
      text,
      tokens: input.tokens,
      wordResults: [],
      paragraphs: input.paragraphs,
      grammarResults: [
        [
          { code: 8, start: 4, end: 9, suggestions: ['on'], explanation: 'Sana on kirjoitettu kahteen kertaan.' },
          // Spelling is listed word by word already
          { code: 1, start: 10, end: 16, suggestions: [], explanation: 'Virheellinen kirjoitusasu' }
        ],
        []
      ]
    });
    expect(findings).toEqual([{
      id: 'kielioppi-8@15',
      kind: 'kielioppi',
      from: 15,
      to: 20,
      quote: 'on on',
      message: 'Sana on kirjoitettu kahteen kertaan.',
      code: 8,
      suggestions: ['on']
    }]);
  });

  test('voikkoFindings drops whitespace errors caused by blanked regions', () => {
    const text = 'Hän tuli **kotiin** [TODO: milloin?] , ja meni  nukkumaan.';
    const input = buildVoikkoInput(text, deps);
    const paragraph = input.paragraphs[0].text;
    expect(paragraph).toBe('Hän tuli   kotiin                    , ja meni  nukkumaan.');
    const at = (needle) => paragraph.indexOf(needle);

    const findings = voikkoFindings({
      text,
      tokens: input.tokens,
      wordResults: [],
      paragraphs: input.paragraphs,
      grammarResults: [[
        // Caused by the blanks: extra spaces where the markers and the note were
        { code: 2, start: 8, end: 11, suggestions: [' '], explanation: 'Poista ylimääräinen väli.' },
        { code: 2, start: at('kotiin') + 6, end: at(','), suggestions: [' '], explanation: 'Poista ylimääräinen väli.' },
        { code: 3, start: at(',') - 1, end: at(',') + 1, suggestions: [','], explanation: 'Välimerkin edessä on väli.' },
        // The author's own double space, far from any blank: kept
        { code: 2, start: at('meni') + 4, end: at('nukkumaan'), suggestions: [' '], explanation: 'Poista ylimääräinen väli.' },
        // Another kind of error next to a blank: kept
        { code: 8, start: at('kotiin'), end: at('kotiin') + 6, suggestions: [], explanation: 'Jokin muu huomio.' }
      ]]
    });
    expect(findings.map(finding => [finding.code, finding.quote])).toEqual([[8, 'kotiin'], [2, '  ']]);
    expect(findings[1].from).toBe(text.indexOf('meni') + 4);
  });

  // Final polish round 1: voikkogc 4.3.3 answers `[code=7 … stpos=24, len=3, suggs={"Hän"}]` for the
  // first line below (run live). The speech tag after ? or ! of a dialogue line is correct in lower case.
  test('voikkoFindings drops the capital-letter error on a speech tag after ? or ! of a dialogue line', () => {
    const capital = 'Sana on kirjoitettava isolla alkukirjaimella.';
    const text = [
      '– Onko tämä pääteasema? hän kysyi konduktööriltä.',
      '— Tule tänne! hän huusi.',
      'Onko tämä pääteasema? hän kysyi.',
      '– Niin. hän sanoi.',
      '– Tästä ei mennä pidemmälle. Miksi? hän ihmetteli.'
    ].join('\n\n');
    const input = buildVoikkoInput(text, deps);
    expect(input.paragraphs).toHaveLength(5);
    const error = (line) => {
      const start = input.paragraphs[line].text.indexOf('hän');
      return [{ code: 7, start, end: start + 3, suggestions: ['Hän'], explanation: capital }];
    };
    const findings = voikkoFindings({
      text,
      tokens: input.tokens,
      wordResults: [],
      paragraphs: input.paragraphs,
      grammarResults: [error(0), error(1), error(2), error(3), error(4)]
    });
    // Kept: prose outside a dialogue line, and a tag after a full stop
    expect(findings.map(finding => text.slice(0, finding.from).split('\n\n').length - 1)).toEqual([2, 3]);
    expect(findings.every(finding => finding.code === 7 && finding.quote === 'hän')).toBe(true);
  });
});

describe('nameHits', () => {
  test('nameHits compares base-form hits with stem hits for an inflected name (Ainon, Ainolle, ainoa)', () => {
    const text = 'Ainon kirje tuli. Ainolle se oli ainoa. Aino luki sen, ja Ainon äiti myös. Aamulla Aino-täti soitti.';
    const tokens = tokenizeWords(text);
    const wordResults = [
      known('Ainon', [{ BASEFORM: 'Aino', CLASS: 'etunimi' }, { BASEFORM: 'aino', CLASS: 'laatusana' }]),
      known('Ainolle', [{ BASEFORM: 'Aino' }]),
      known('ainoa', [{ BASEFORM: 'ainoa', CLASS: 'laatusana' }]),
      known('Aino', [{ BASEFORM: 'Aino' }]),
      known('Aino-täti', [{ BASEFORM: 'Aino-täti' }]),
      known('kirje', [{ BASEFORM: 'kirje' }])
    ];
    const hits = nameHits({ text, tokens, wordResults, name: 'Aino' });

    expect(hits.byLemma.map(token => token.word)).toEqual(['Ainon', 'Ainolle', 'Aino', 'Ainon']);
    expect(hits.byStem.map(token => token.word)).toEqual(['Ainon', 'Ainolle', 'ainoa', 'Aino', 'Ainon', 'Aino-täti']);
    // What only one of the two ways finds
    expect(hits.onlyLemma).toEqual([]);
    expect(hits.onlyStem).toEqual(['ainoa', 'Aino-täti']);
    for (const token of [...hits.byLemma, ...hits.byStem]) expect(text.slice(token.from, token.to)).toBe(token.word);
  });

  test('a stem of its own, and a form only the base form finds', () => {
    const text = 'Tuomen kukat ja Tuomelle annettu lahja, tuomi kukki.';
    const tokens = tokenizeWords(text);
    const wordResults = [
      known('Tuomen', [{ BASEFORM: 'Tuomi' }]),
      known('Tuomelle', [{ BASEFORM: 'tuomi' }]),
      known('tuomi', [{ BASEFORM: 'tuomi' }])
    ];
    // The stem "Tuomi" misses the inflected forms; the base form finds them, whatever the case
    const byName = nameHits({ text, tokens, wordResults, name: 'Tuomi' });
    expect(byName.byLemma.map(token => token.word)).toEqual(['Tuomen', 'Tuomelle', 'tuomi']);
    expect(byName.byStem.map(token => token.word)).toEqual(['tuomi']);
    expect(byName.onlyLemma).toEqual(['Tuomen', 'Tuomelle']);
    expect(byName.onlyStem).toEqual([]);

    const byStem = nameHits({ text, tokens, wordResults, name: 'Tuomi', stem: 'Tuome' });
    expect(byStem.byStem.map(token => token.word)).toEqual(['Tuomen', 'Tuomelle']);
    expect(byStem.onlyLemma).toEqual(['tuomi']);

    expect(nameHits({ text, tokens, wordResults: [], name: '' })).toEqual({ byLemma: [], byStem: [], onlyLemma: [], onlyStem: [] });
  });
});

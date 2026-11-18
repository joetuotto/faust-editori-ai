/**
 * @jest-environment node
 */
const {
  LIMITS,
  WRITE_LENGTHS,
  QUICK_EDIT_THINKING,
  ACTION_SENDS_AT_ONCE,
  editTask,
  refineMessages,
  writeTask,
  answerTokensFor,
  previewUnmask,
  promptMessage
} = require('../../src/services/ai/editRequest');

const PLACEHOLDER_RULE = 'Säilytä jokainen paikkamerkki täsmälleen sellaisenaan.';

// A mask as maskSpans returns it, for "Tarkista [TODO: vuosi] ja <u>tämä</u> kohta."
const mask = {
  text: 'Tarkista ⟦1⟧ ja ⟦2⟧tämä⟦/2⟧ kohta.',
  spans: [
    { id: 1, role: null, kind: 'todo', text: '[TODO: vuosi]', token: '⟦1⟧' },
    { id: 2, role: 'open', kind: 'tag', text: '<u>', token: '⟦2⟧' },
    { id: 2, role: 'close', kind: 'tag', text: '</u>', token: '⟦/2⟧' }
  ]
};

describe('constants', () => {
  test('the limits, the thinking hint and the send-at-once switch are the agreed values', () => {
    expect(LIMITS).toEqual({ maxTarget: 12000, maxAttempts: 12, before: 1500, after: 500 });
    expect(QUICK_EDIT_THINKING).toBe('off');
    expect(ACTION_SENDS_AT_ONCE).toBe(true);
    expect(WRITE_LENGTHS).toEqual({
      sentence: { rule: 'Kirjoita yksi tai kaksi virkettä.', answerTokens: 200 },
      paragraph: { rule: 'Kirjoita yksi kappale, enintään noin 120 sanaa.', answerTokens: 500 },
      long: { rule: 'Kirjoita kaksi tai kolme kappaletta, yhteensä enintään noin 350 sanaa.', answerTokens: 1300 }
    });
  });
});

describe('editTask', () => {
  test('editTask puts the masked target into payload with ⟦1⟧ untouched and uses the tag valinta', () => {
    const task = editTask({ instruction: '  Tiivistä.  ', target: mask.text, placeholderRule: PLACEHOLDER_RULE, language: 'fi' });
    expect(task.id).toBe('edit');
    expect(task.payload).toBe('Tarkista ⟦1⟧ ja ⟦2⟧tämä⟦/2⟧ kohta.');
    expect(task.payloadTag).toBe('valinta');
    expect(task.payloadLabel).toBe('valinta');
    expect(task.instruction).toBe('Tiivistä.');
    expect(task.role).toBe('Olet kustannustoimittaja, joka muokkaa käsikirjoitusta kirjoittajan ohjeen mukaan.');
    // The target is nowhere else: not in the rules, not in the instruction
    expect(task.rules.join('\n')).not.toContain('⟦1⟧');
  });

  test('editTask keeps the target exactly: spaces at the ends, CRLF, ä ö å, ” and a dialogue dash', () => {
    const target = '  – Älä mene, Åke sanoi. ”Yö on pitkä.”\r\nÖinen tie oli tyhjä.  ';
    expect(editTask({ instruction: 'Selkeytä.', target }).payload).toBe(target);
  });

  test('editTask includes the placeholder rule only when one is given', () => {
    const withRule = editTask({ instruction: 'Tiivistä.', target: mask.text, placeholderRule: PLACEHOLDER_RULE });
    expect(withRule.rules).toContain(`- ${PLACEHOLDER_RULE}`);
    expect(withRule.rules.indexOf(`- ${PLACEHOLDER_RULE}`)).toBe(3);

    for (const placeholderRule of ['', undefined, null]) {
      const without = editTask({ instruction: 'Tiivistä.', target: 'Teksti.', placeholderRule });
      expect(without.rules.some((rule) => rule.includes('paikkamerkki'))).toBe(false);
      expect(without.rules).toHaveLength(withRule.rules.length - 1);
    }
  });

  test('editTask includes the Finnish quotation rule for fi and for a missing language, not for en', () => {
    const rule = '- Käytä suomalaisia lainausmerkkejä ” ja ajatusviivaa –.';
    expect(editTask({ instruction: 'Tiivistä.', target: 'Teksti.', language: 'fi' }).rules).toContain(rule);
    expect(editTask({ instruction: 'Tiivistä.', target: 'Teksti.' }).rules).toContain(rule);
    expect(editTask({ instruction: 'Tiivistä.', target: 'Teksti.', language: null }).rules).toContain(rule);
    expect(editTask({ instruction: 'Tighten.', target: 'Text.', language: 'en' }).rules).not.toContain(rule);
    // The other rules stay Finnish for an English project: the builder's language rule decides the answer language
    expect(editTask({ instruction: 'Tighten.', target: 'Text.', language: 'en' }).rules[0]).toMatch(/^- Muokkaa vain <valinta>/);
  });

  test('editTask asks for the answer inside <teksti> tags and for the unchanged text when the instruction cannot be followed', () => {
    const { rules } = editTask({ instruction: 'Tiivistä.', target: 'Teksti.' });
    expect(rules[rules.length - 2]).toBe(
      '- Vastaa vain näin: <teksti>muokattu teksti</teksti>. Ei selityksiä, ei otsikoita eikä muuta tekstiä tagien ulkopuolella.'
    );
    expect(rules[rules.length - 1]).toBe('- Jos ohjetta ei voi noudattaa, palauta teksti muuttamattomana tagien sisällä.');
  });

  test('editTask throws on an empty target or instruction', () => {
    expect(() => editTask({ instruction: 'Tiivistä.', target: '' })).toThrow(TypeError);
    expect(() => editTask({ instruction: 'Tiivistä.', target: ' \n ' })).toThrow(TypeError);
    expect(() => editTask({ instruction: '', target: 'Teksti.' })).toThrow(TypeError);
    expect(() => editTask({ instruction: '  \n', target: 'Teksti.' })).toThrow(TypeError);
    expect(() => editTask({ target: 'Teksti.' })).toThrow(TypeError);
    expect(() => editTask()).toThrow(TypeError);
  });

  test('editTask asks for 1 500 characters before and 500 after', () => {
    const task = editTask({ instruction: 'Tiivistä.', target: 'Teksti.' });
    expect(task.limits).toEqual({ before: 1500, after: 500 });
    // A new object each time, so a caller cannot change the limits of the next task
    task.limits.before = 1;
    expect(editTask({ instruction: 'Tiivistä.', target: 'Teksti.' }).limits.before).toBe(1500);
  });

  test('answerTokensFor has a floor of 256 and grows with the target', () => {
    expect(answerTokensFor(0)).toBe(256);
    expect(answerTokensFor(90)).toBe(256);            // 54 + 200
    expect(answerTokensFor(100)).toBe(260);           // 60 + 200
    expect(answerTokensFor(1000)).toBe(800);
    expect(answerTokensFor(1001)).toBe(801);          // rounded up
    expect(answerTokensFor(12000)).toBe(7400);
    expect(editTask({ instruction: 'Tiivistä.', target: 'a'.repeat(1000) }).answerTokens).toBe(800);
    expect(editTask({ instruction: 'Tiivistä.', target: 'Lyhyt.' }).answerTokens).toBe(256);
  });
});

describe('refineMessages', () => {
  const built = {
    system: 'Olet kustannustoimittaja.',
    messages: [{ role: 'user', content: '<valinta>\nTarkista ⟦1⟧.\n</valinta>\n\n<ohje>\nTiivistä.\n</ohje>' }]
  };

  test('refineMessages always returns three messages with the shown attempt as the assistant turn', () => {
    const first = refineMessages(built, 'Tarkista ⟦1⟧ lyhyesti.', '  vielä lyhyemmin  ');
    expect(first.system).toBe(built.system);
    expect(first.messages).toHaveLength(3);
    expect(first.messages[0]).toBe(built.messages[0]);
    expect(first.messages[1]).toEqual({ role: 'assistant', content: '<teksti>\nTarkista ⟦1⟧ lyhyesti.\n</teksti>' });
    expect(first.messages[2]).toEqual({
      role: 'user',
      content: 'Tarkenna edellistä versiota tällä ohjeella: vielä lyhyemmin\n\nPalauta koko teksti uudelleen <teksti>-tagien sisällä. Muuta vain se, mitä tarkennus vaatii.'
    });

    // A second refinement replaces the assistant turn; the conversation does not grow
    const second = refineMessages(built, 'Tarkista ⟦1⟧.', 'säilytä ”lainaus” – älä muuta');
    expect(second.messages).toHaveLength(3);
    expect(second.messages[1].content).toBe('<teksti>\nTarkista ⟦1⟧.\n</teksti>');
    expect(second.messages[2].content).toContain('säilytä ”lainaus” – älä muuta');
    expect(built.messages).toHaveLength(1);
  });

  test('refineMessages throws on an empty instruction', () => {
    expect(() => refineMessages(built, 'Teksti.', '')).toThrow(TypeError);
    expect(() => refineMessages(built, 'Teksti.', '   ')).toThrow(TypeError);
    expect(() => refineMessages(built, 'Teksti.', undefined)).toThrow(TypeError);
  });
});

describe('writeTask', () => {
  test('writeTask uses the paragraph rule by default and the two other length rules on request', () => {
    const byDefault = writeTask({ direction: 'Sumu nousee' });
    expect(byDefault.rules[1]).toBe('- Kirjoita yksi kappale, enintään noin 120 sanaa.');
    expect(byDefault.answerTokens).toBe(500);
    expect(writeTask({ direction: '', length: 'tuntematon' }).rules[1]).toBe('- Kirjoita yksi kappale, enintään noin 120 sanaa.');
    // A property of Object.prototype is not a length
    expect(writeTask({ direction: '', length: 'constructor' }).answerTokens).toBe(500);

    const sentence = writeTask({ direction: '', length: 'sentence' });
    expect(sentence.rules[1]).toBe('- Kirjoita yksi tai kaksi virkettä.');
    expect(sentence.answerTokens).toBe(200);

    const long = writeTask({ direction: '', length: 'long' });
    expect(long.rules[1]).toBe('- Kirjoita kaksi tai kolme kappaletta, yhteensä enintään noin 350 sanaa.');
    expect(long.answerTokens).toBe(1300);
  });

  test('writeTask adds the no-invented-sources rule and the tietokirja role for nonfiction', () => {
    const fiction = writeTask({ direction: 'Sumu nousee', projectKind: 'fiction', language: 'fi' });
    const nonfiction = writeTask({ direction: 'Sumu nousee', projectKind: 'nonfiction', language: 'fi' });
    const sources = '- Älä keksi lähteitä, lukuja tai sitaatteja. Jos väite tarvitsee lähteen, merkitse kohta näin: [TODO: lähde].';

    expect(fiction.role).toBe('Kirjoitat jatkoa käsikirjoitukseen kirjoittajan omalla äänellä.');
    expect(nonfiction.role).toBe('Kirjoitat jatkoa tietokirjan käsikirjoitukseen kirjoittajan omalla äänellä.');
    expect(fiction.rules).not.toContain(sources);
    expect(nonfiction.rules).toContain(sources);
    // It is the rule before the answer format
    expect(nonfiction.rules.indexOf(sources)).toBe(nonfiction.rules.length - 2);
    expect(nonfiction.rules).toHaveLength(fiction.rules.length + 1);
  });

  test('writeTask lists its rules in the agreed order, with the dialogue rule only for Finnish', () => {
    expect(writeTask({ direction: '', language: 'fi' }).rules).toEqual([
      '- Jatka täsmälleen siitä, mihin <edeltava_teksti> päättyy. Älä toista aiempaa tekstiä äläkä tiivistä sitä.',
      '- Kirjoita yksi kappale, enintään noin 120 sanaa.',
      '- Säilytä aikamuoto, näkökulma, henkilöiden nimet ja tyyli.',
      '- Jos <seuraava_teksti> on annettu, uuden tekstin pitää sopia sen eteen. Älä kirjoita sitä uudelleen.',
      '- Käytä suomalaisia lainausmerkkejä ” ja ajatusviivaa –. Merkitse vuorosanat samalla tavalla kuin edeltävässä tekstissä.',
      '- Vastaa vain näin: <teksti>uusi teksti</teksti>. Ei selityksiä, ei otsikoita eikä muuta tekstiä tagien ulkopuolella.'
    ]);
    expect(writeTask({ direction: '' }).rules).toHaveLength(6);
    const english = writeTask({ direction: '', language: 'en' }).rules;
    expect(english).toHaveLength(5);
    expect(english.some((rule) => rule.includes('lainausmerkkejä'))).toBe(false);
  });

  test('writeTask writes Suunta: jatka luontevasti. for an empty direction', () => {
    expect(writeTask({ direction: '' }).instruction).toBe('Suunta: jatka luontevasti.');
    expect(writeTask({ direction: '  \n ' }).instruction).toBe('Suunta: jatka luontevasti.');
    expect(writeTask({}).instruction).toBe('Suunta: jatka luontevasti.');
    expect(writeTask({ direction: '  Sumu nousee – Åke herää.  ' }).instruction).toBe('Suunta: Sumu nousee – Åke herää.');
  });

  test('writeTask has no payload', () => {
    const task = writeTask({ direction: 'Sumu nousee', length: 'paragraph', projectKind: 'fiction', language: 'fi' });
    expect(Object.keys(task).sort()).toEqual(['answerTokens', 'id', 'instruction', 'role', 'rules']);
    expect(task.id).toBe('write');
    expect('payload' in task).toBe(false);
    expect('payloadTag' in task).toBe(false);
  });
});

describe('previewUnmask', () => {
  test('previewUnmask restores complete placeholders for [TODO: …] and <u> and hides a trailing half placeholder', () => {
    expect(previewUnmask('Tarkista ⟦1⟧ ja ⟦2⟧tämä⟦/2⟧ kohta.', mask)).toBe('Tarkista [TODO: vuosi] ja <u>tämä</u> kohta.');

    // The answer is still arriving: a half placeholder at the end is not shown
    expect(previewUnmask('Tarkista ⟦', mask)).toBe('Tarkista ');
    expect(previewUnmask('Tarkista ⟦1', mask)).toBe('Tarkista ');
    expect(previewUnmask('Tarkista ⟦1⟧ ja ⟦2⟧tämä⟦/', mask)).toBe('Tarkista [TODO: vuosi] ja <u>tämä');
    expect(previewUnmask('Tarkista ⟦1⟧ ja ⟦2⟧tämä⟦/2', mask)).toBe('Tarkista [TODO: vuosi] ja <u>tämä');

    // A missing placeholder is not put back here
    expect(previewUnmask('Tarkista ja ⟦2⟧tämä⟦/2⟧.', mask)).toBe('Tarkista ja <u>tämä</u>.');
  });

  test('previewUnmask leaves text without placeholders, an unknown placeholder and a missing mask alone', () => {
    expect(previewUnmask('Åke käveli – hitaasti.\nÖinen ”tie”.', mask)).toBe('Åke käveli – hitaasti.\nÖinen ”tie”.');
    expect(previewUnmask('Outo ⟦9⟧ merkki.', mask)).toBe('Outo ⟦9⟧ merkki.');
    expect(previewUnmask('Teksti ⟦1⟧', null)).toBe('Teksti ⟦1⟧');
    expect(previewUnmask('Teksti ⟦', { spans: [] })).toBe('Teksti ⟦');
    expect(previewUnmask('', mask)).toBe('');
    expect(previewUnmask(undefined, mask)).toBe('');
  });

  test('previewUnmask does not unmask twice when a protected span itself looks like a placeholder', () => {
    const literal = {
      spans: [
        { id: 1, role: null, kind: 'literal', text: '⟦2⟧', token: '⟦1⟧' },
        { id: 2, role: null, kind: 'todo', text: '[TODO: x]', token: '⟦2⟧' }
      ]
    };
    expect(previewUnmask('Merkki ⟦1⟧ ja ⟦2⟧.', literal)).toBe('Merkki ⟦2⟧ ja [TODO: x].');
  });
});

describe('promptMessage', () => {
  test('promptMessage returns the Finnish text for every code and fills in the numbers', () => {
    expect(promptMessage('changed')).toBe('Teksti muuttui pyynnön aikana. Ehdotuksia ei tehty. Lähetä ohje uudelleen.');
    expect(promptMessage('no-paragraph')).toBe('Valitse teksti tai siirrä kohdistin kappaleeseen.');
    expect(promptMessage('reserved-tag')).toBe('Valinnassa on <teksti>-tagi, jota pikamuokkaus käyttää itse. Poista se valinnasta.');
    expect(promptMessage('no-changes')).toBe('Malli ei ehdottanut muutoksia.');
    expect(promptMessage('conflict')).toBe('Kohdassa on jo käsittelemätön ehdotus. Käsittele se ensin.');
    expect(promptMessage('no-sentence')).toBe('Pysäytetty ennen ensimmäistä kokonaista virkettä.');

    const chars = (12345).toLocaleString('fi-FI');
    const max = (12000).toLocaleString('fi-FI');
    expect(promptMessage('too-long', { chars: 12345, max: 12000 })).toBe(
      `Valinta on liian pitkä pikamuokkaukseen (${chars} merkkiä, enintään ${max}). Valitse lyhyempi kohta.`
    );
    // Finnish grouping, not 12,345 or 12345
    expect(chars).toMatch(/^12\s345$/);

    // Any other code: the message that came with it, or nothing
    expect(promptMessage('over-budget', { message: 'Teksti on liian pitkä tälle mallille.' })).toBe('Teksti on liian pitkä tälle mallille.');
    expect(promptMessage('tuntematon')).toBe('');
    expect(promptMessage(undefined, null)).toBe('');
  });
});

describe('wording', () => {
  test('every rule keeps ä ö ” and – as written', () => {
    const edit = editTask({ instruction: 'Tiivistä.', target: 'Teksti.', placeholderRule: PLACEHOLDER_RULE, language: 'fi' });
    expect(edit.rules).toEqual([
      '- Muokkaa vain <valinta>-osan tekstiä. Kaikki muut osat ovat vain taustaa: älä toista äläkä muuta niitä.',
      '- Tee vain se, mitä <ohje> pyytää. Säilytä kaikki muu sanasta sanaan, myös välimerkit ja rivinvaihdot.',
      '- Säilytä kirjoittajan ääni, aikamuoto ja näkökulma.',
      `- ${PLACEHOLDER_RULE}`,
      '- Käytä suomalaisia lainausmerkkejä ” ja ajatusviivaa –.',
      '- Vastaa vain näin: <teksti>muokattu teksti</teksti>. Ei selityksiä, ei otsikoita eikä muuta tekstiä tagien ulkopuolella.',
      '- Jos ohjetta ei voi noudattaa, palauta teksti muuttamattomana tagien sisällä.'
    ]);

    const write = writeTask({ direction: 'Sumu nousee', projectKind: 'nonfiction', language: 'fi', length: 'long' });
    expect(write.rules).toEqual([
      '- Jatka täsmälleen siitä, mihin <edeltava_teksti> päättyy. Älä toista aiempaa tekstiä äläkä tiivistä sitä.',
      '- Kirjoita kaksi tai kolme kappaletta, yhteensä enintään noin 350 sanaa.',
      '- Säilytä aikamuoto, näkökulma, henkilöiden nimet ja tyyli.',
      '- Jos <seuraava_teksti> on annettu, uuden tekstin pitää sopia sen eteen. Älä kirjoita sitä uudelleen.',
      '- Käytä suomalaisia lainausmerkkejä ” ja ajatusviivaa –. Merkitse vuorosanat samalla tavalla kuin edeltävässä tekstissä.',
      '- Älä keksi lähteitä, lukuja tai sitaatteja. Jos väite tarvitsee lähteen, merkitse kohta näin: [TODO: lähde].',
      '- Vastaa vain näin: <teksti>uusi teksti</teksti>. Ei selityksiä, ei otsikoita eikä muuta tekstiä tagien ulkopuolella.'
    ]);

    // The typographic characters are the Finnish ones, not their ASCII look-alikes
    const all = edit.rules.concat(write.rules).join('\n');
    expect(all).toContain('”');   // ”
    expect(all).toContain('–');   // –
    expect(all).not.toContain('"');
    expect(all).toContain('ä');
    expect(all).toContain('ö');
  });
});

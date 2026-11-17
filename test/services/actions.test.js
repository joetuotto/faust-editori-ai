/**
 * @jest-environment node
 */
const {
  BUILTIN_ACTIONS,
  DEFAULT_ACTION_IDS,
  actionsFor,
  findAction,
  menuEntries,
  normalizeSavedPrompts,
  addSavedPrompt,
  removeSavedPrompt,
  labelFromPrompt
} = require('../../src/services/ai/actions');

const saved = (n, extra = {}) => ({ id: `user-${n}`, label: `Ohje ${n}`, prompt: `Tee asia ${n}.`, created: n, ...extra });
const labels = (list) => list.map((item) => item.label);

describe('built-in actions', () => {
  test('fiction defaults are Kielenhuolto, Tiivistä, Selkeytä and Näytä, älä kerro in that order', () => {
    expect(labels(actionsFor('fiction'))).toEqual([
      'Kielenhuolto – vain virheet',
      'Tiivistä',
      'Selkeytä',
      'Näytä, älä kerro'
    ]);
    expect(DEFAULT_ACTION_IDS.fiction).toEqual(['proofread', 'tighten', 'clarify', 'show']);
    // Anything that is not nonfiction is fiction
    expect(labels(actionsFor('runous'))).toEqual(labels(actionsFor('fiction')));
    expect(labels(actionsFor(undefined))).toEqual(labels(actionsFor('fiction')));
  });

  test('nonfiction defaults replace Tiivistä and Näytä, älä kerro with the paragraph, claim and term actions', () => {
    expect(labels(actionsFor('nonfiction'))).toEqual([
      'Kielenhuolto – vain virheet',
      'Tiivistä kappale',
      'Selkeytä',
      'Selkeytä väite',
      'Yhtenäistä termit'
    ]);
    expect(DEFAULT_ACTION_IDS.nonfiction).toEqual(['proofread', 'tighten-paragraph', 'clarify', 'clarify-claim', 'unify-terms']);
    expect(labels(actionsFor('nonfiction'))).not.toContain('Tiivistä');
    expect(labels(actionsFor('nonfiction'))).not.toContain('Näytä, älä kerro');
  });

  test('every built-in prompt is non-empty and labels are unique', () => {
    expect(BUILTIN_ACTIONS).toHaveLength(7);
    for (const item of BUILTIN_ACTIONS) {
      expect(item.prompt.trim().length).toBeGreaterThan(20);
      expect(item.builtin).toBe(true);
      expect(item.types.length).toBeGreaterThan(0);
    }
    expect(new Set(labels(BUILTIN_ACTIONS)).size).toBe(BUILTIN_ACTIONS.length);
    expect(new Set(BUILTIN_ACTIONS.map((item) => item.id)).size).toBe(BUILTIN_ACTIONS.length);
    // Every default id names a built-in of that kind
    for (const kind of ['fiction', 'nonfiction']) {
      for (const id of DEFAULT_ACTION_IDS[kind]) {
        expect(BUILTIN_ACTIONS.find((item) => item.id === id).types).toContain(kind);
      }
    }
  });

  test('only the proofreading action is strict, and its prompt keeps dialect and style alone', () => {
    expect(BUILTIN_ACTIONS.filter((item) => item.strict).map((item) => item.id)).toEqual(['proofread']);
    const proofread = findAction('proofread');
    expect(proofread.prompt).toBe(
      'Korjaa vain kielivirheet: oikeinkirjoitus, yhdyssanat, pilkut ja muut välimerkit, kongruenssi ja sijamuodot. Älä muuta sanavalintoja, tyyliä, sanajärjestystä tai rytmiä. Älä muuta puhekielisiä tai murteellisia vuorosanoja yleiskielisiksi. Jos virheitä ei ole, palauta teksti muuttamattomana.'
    );
    expect(findAction('show').prompt).toBe(
      'Kirjoita kohta niin, että tunteet ja tilanne näkyvät teoissa, aistihavainnoissa ja vuorosanoissa sen sijaan, että kertoja nimeää ne. Älä lisää uusia tapahtumia tai henkilöitä. Pidä pituus suunnilleen samana.'
    );
  });

  test('the built-in list cannot be changed by a caller', () => {
    expect(Object.isFrozen(BUILTIN_ACTIONS)).toBe(true);
    expect(Object.isFrozen(BUILTIN_ACTIONS[0])).toBe(true);
    expect(Object.isFrozen(DEFAULT_ACTION_IDS.fiction)).toBe(true);
  });
});

describe('finding and listing', () => {
  test('findAction finds a nonfiction action in a fiction project and returns null for custom and write', () => {
    expect(findAction('clarify-claim').label).toBe('Selkeytä väite');
    expect(findAction('custom')).toBeNull();
    expect(findAction('write')).toBeNull();
    // Not even a saved prompt can take a reserved id
    expect(findAction('custom', [{ id: 'custom', label: 'Oma', prompt: 'Tee jotain.' }])).toBeNull();
    expect(findAction('ei-ole')).toBeNull();
    expect(findAction(undefined)).toBeNull();
    expect(findAction('user-2', [saved(1), saved(2)]).prompt).toBe('Tee asia 2.');
  });

  test('actionsFor puts saved prompts after the built-ins', () => {
    const list = actionsFor('fiction', [saved(1), saved(2)]);
    expect(list.map((item) => item.id)).toEqual(['proofread', 'tighten', 'clarify', 'show', 'user-1', 'user-2']);
    expect(list.slice(0, 4).every((item) => item.builtin === true)).toBe(true);
    expect(list.slice(4).every((item) => item.builtin === false)).toBe(true);
  });

  test('menuEntries cuts labels to 60 characters and lists at most 12 saved prompts', () => {
    const many = Array.from({ length: 20 }, (_, n) => saved(n + 1));
    many[0].label = 'Ö'.repeat(100);
    const entries = menuEntries('nonfiction', many);

    // Five built-ins of nonfiction and the first twelve saved prompts
    expect(entries).toHaveLength(5 + 12);
    expect(entries.map((entry) => entry.id).slice(5)).toEqual(many.slice(0, 12).map((item) => item.id));
    expect(Object.keys(entries[0]).sort()).toEqual(['id', 'label']);
    for (const entry of entries) expect(entry.label.length).toBeLessThanOrEqual(60);
    // A stored label is already cut to 40 when it is read and every built-in label is shorter,
    // so the menu's own cut to 60 cannot be reached through these functions: it is a guard,
    // and this test can only pin the ceiling it promises
    expect(entries[5].label).toBe('Ö'.repeat(40));
    expect(menuEntries('fiction')).toHaveLength(4);
  });
});

describe('saved prompts', () => {
  test('normalizeSavedPrompts drops malformed entries, empty prompts, duplicate and reserved ids', () => {
    expect(normalizeSavedPrompts(null)).toEqual([]);
    expect(normalizeSavedPrompts('user-1')).toEqual([]);
    expect(normalizeSavedPrompts({ id: 'user-1' })).toEqual([]);

    const list = normalizeSavedPrompts([
      saved(1),
      null,
      'teksti',
      { id: 'user-x', label: 'Ei kehotetta' },                 // no prompt
      { id: 7, label: 'Numero', prompt: 'Tee.' },              // id is not a string
      { id: 'user-2', label: 'Tyhjä', prompt: '   ' },         // empty prompt
      saved(1, { label: 'Kaksoiskappale' }),                   // duplicate id
      { id: 'custom', label: 'Varattu', prompt: 'Tee.' },      // reserved
      { id: 'write', label: 'Varattu', prompt: 'Tee.' },       // reserved
      { id: 'proofread', label: 'Varjo', prompt: 'Tee.' },     // would hide behind a built-in
      { id: ' user-3 ', label: '  Älä tiivistä  ', prompt: '  Säilytä pituus.  ', created: 'eilen' }
    ]);

    expect(list).toEqual([
      { id: 'user-1', label: 'Ohje 1', prompt: 'Tee asia 1.', created: 1, builtin: false },
      { id: 'user-3', label: 'Älä tiivistä', prompt: 'Säilytä pituus.', created: 0, builtin: false }
    ]);
  });

  test('normalizeSavedPrompts cuts long fields, keeps at most 30 and gives a label to an entry without one', () => {
    const long = normalizeSavedPrompts([{ id: 'user-1', label: 'a'.repeat(80), prompt: 'ö'.repeat(2500) }])[0];
    expect(long.label).toHaveLength(40);
    expect(long.prompt).toHaveLength(2000);

    expect(normalizeSavedPrompts(Array.from({ length: 45 }, (_, n) => saved(n)))).toHaveLength(30);
    expect(normalizeSavedPrompts([{ id: 'user-1', label: ' ', prompt: 'Lyhennä virkkeitä.\nÄlä muuta sisältöä.' }])[0].label)
      .toBe('Lyhennä virkkeitä.');
  });

  test('addSavedPrompt keeps ä ö å and ” – in the prompt text and builds the label from the first line', () => {
    const prompt = 'Säilytä ”sitaatit” ja vuorosanaviiva – älä yleiskielistä Åken puhetta.\nToinen rivi öisin.';
    const before = [saved(1)];
    const copy = JSON.parse(JSON.stringify(before));
    const result = addSavedPrompt(before, `  ${prompt}  `, 1763300000000);

    expect(result.reason).toBeUndefined();
    expect(result.added).toEqual({
      id: `user-${(1763300000000).toString(36)}`,
      label: 'Säilytä ”sitaatit” ja vuorosanav…',
      prompt,
      created: 1763300000000,
      builtin: false
    });
    expect(result.list).toHaveLength(2);
    expect(result.list[1]).toBe(result.added);
    // The list given is not changed
    expect(before).toEqual(copy);
    expect(result.list).not.toBe(before);
  });

  test('labels are cut between characters, never inside an emoji', () => {
    const emoji = '\u{1F642}';
    // The 32nd and 33rd units are the two halves of the emoji
    const label = labelFromPrompt(`${'x'.repeat(31)}${emoji} loppu`);
    expect(label).toBe(`${'x'.repeat(31)}…`);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(label)).toBe(false);

    const stored = normalizeSavedPrompts([{ id: 'user-1', label: `${'y'.repeat(39)}${emoji}`, prompt: 'Tee.' }])[0];
    expect(stored.label).toBe('y'.repeat(39));
    // An emoji that fits stays whole
    expect(labelFromPrompt(`Ohje ${emoji}`)).toBe(`Ohje ${emoji}`);
  });

  test('a prompt longer than 2 000 characters is stored the same way twice and saved only once', () => {
    // The cut lands just after a space: the stored text must not change when it is read back
    const long = `${'a'.repeat(1999)} ${'b'.repeat(50)}`;
    const first = addSavedPrompt([], long, 1000);
    expect(first.added.prompt).toBe('a'.repeat(1999));
    expect(normalizeSavedPrompts(first.list)[0].prompt).toBe(first.added.prompt);

    const again = addSavedPrompt(first.list, long, 2000);
    expect(again.reason).toBe('duplicate');
    expect(again.list).toHaveLength(1);
  });

  test('addSavedPrompt gives a second prompt of the same millisecond its own id', () => {
    const first = addSavedPrompt([], 'Yksi.', 1000);
    const second = addSavedPrompt(first.list, 'Kaksi.', 1000);
    const third = addSavedPrompt(second.list, 'Kolme.', 1000);
    expect(first.added.id).toBe('user-rs');
    expect(second.added.id).toBe('user-rs-2');
    expect(third.added.id).toBe('user-rs-3');
  });

  test('addSavedPrompt refuses an empty text, a duplicate and the 31st entry without changing the list', () => {
    const list = [saved(1)];
    const copy = JSON.parse(JSON.stringify(list));

    const empty = addSavedPrompt(list, '  \n ', 5);
    expect(empty).toEqual({ list: normalizeSavedPrompts(list), added: null, reason: 'empty' });

    const duplicate = addSavedPrompt(list, ' Tee asia 1. ', 5);
    expect(duplicate.added).toBeNull();
    expect(duplicate.reason).toBe('duplicate');
    expect(duplicate.list).toHaveLength(1);

    const full = Array.from({ length: 30 }, (_, n) => saved(n));
    const fullCopy = JSON.parse(JSON.stringify(full));
    const refused = addSavedPrompt(full, 'Kolmaskymmenesensimmäinen.', 5);
    expect(refused.added).toBeNull();
    expect(refused.reason).toBe('full');
    expect(refused.list).toHaveLength(30);

    expect(list).toEqual(copy);
    expect(full).toEqual(fullCopy);
    // A missing list is an empty list
    expect(addSavedPrompt(undefined, 'Ensimmäinen.', 5).list).toHaveLength(1);
  });

  test('removeSavedPrompt returns a new list', () => {
    const list = [saved(1), saved(2), saved(3)];
    const result = removeSavedPrompt(list, 'user-2');
    expect(result.map((item) => item.id)).toEqual(['user-1', 'user-3']);
    expect(result).not.toBe(list);
    expect(list).toHaveLength(3);
    // An unknown id removes nothing, and the result is still a new array
    const same = removeSavedPrompt(list, 'user-9');
    expect(same).toHaveLength(3);
    expect(same).not.toBe(list);
  });

  test('labelFromPrompt takes the first line, collapses whitespace and cuts at 32 characters', () => {
    expect(labelFromPrompt('Tiivistä   vähän\tenemmän\nmutta älä liikaa')).toBe('Tiivistä vähän enemmän');
    expect(labelFromPrompt('\n\n  Ensimmäinen rivi vasta täällä\r\ntoinen')).toBe('Ensimmäinen rivi vasta täällä');
    expect(labelFromPrompt('a'.repeat(32))).toBe('a'.repeat(32));
    expect(labelFromPrompt('ä'.repeat(33))).toBe(`${'ä'.repeat(32)}…`);
    expect(labelFromPrompt('')).toBe('');
    expect(labelFromPrompt(undefined)).toBe('');
  });
});

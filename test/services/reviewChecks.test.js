/**
 * @jest-environment node
 */
const {
  BUILTIN_CHECKS,
  DEFAULT_CHECK_IDS,
  GROUP_LABELS,
  CUSTOM_LIMITS,
  checksFor,
  findCheck,
  describeCheck,
  makeCustomCheck,
  validateCustomCheck,
  normalizeCustomChecks,
  canAddCustomCheck
} = require('../../src/services/review/reviewChecks');

const byId = (id) => BUILTIN_CHECKS.find(check => check.id === id);
const ids = (group) => group.checks.map(check => check.id);
const groupOf = (groups, name) => groups.find(group => group.group === name);

const OWN = [
  { id: 'custom:b', label: 'Näkökulman vaihdot', instruction: 'Etsi kohdat, joissa näkökulma vaihtuu kesken kappaleen.', suggest: false, created: '2026-11-16T10:00:00.000Z' },
  { id: 'custom:a', label: 'Aikamuodot', instruction: 'Etsi kohdat, joissa aikamuoto vaihtuu ilman syytä.', suggest: true, created: '2026-11-16T11:00:00.000Z' }
];

describe('the built-in checks', () => {
  test('every built-in check has a Finnish label, a description and the documented id', () => {
    expect(BUILTIN_CHECKS.map(check => [check.id, check.kind, check.label])).toEqual([
      ['avoid-words', 'local', 'Vältettävät sanat'],
      ['long-sentences', 'local', 'Pitkät virkkeet'],
      ['typography-questions', 'local', 'Typografian kysymykset'],
      ['filler', 'model', 'Täytesanat'],
      ['cliche', 'model', 'Kliseet'],
      ['dialogue', 'model', 'Dialogi'],
      ['unsourced-claim', 'model', 'Väite ilman lähdettä'],
      ['term-variation', 'model', 'Termin vaihtelu'],
      ['paragraph-point', 'model', 'Kappaleen pääasia'],
      ['continuity', 'continuity', 'Jatkuvuus'],
      ['reading-feedback', 'model', 'Lukupalaute']
    ]);

    for (const check of BUILTIN_CHECKS) {
      expect(check.builtin).toBe(true);
      expect(check.description.length).toBeGreaterThan(10);
      expect(check.description.endsWith('.')).toBe(true);
      expect(check.types.length).toBeGreaterThan(0);
      expect(Object.isFrozen(check)).toBe(true);
    }
    expect(Object.isFrozen(BUILTIN_CHECKS)).toBe(true);

    expect(byId('avoid-words').description).toBe('Tarkistus näyttää kohdat, joissa käytät projektin vältettävien sanojen listan sanoja. Se toimii ilman mallia.');
    expect(byId('long-sentences').description).toBe('Tarkistus näyttää virkkeet, joissa on enemmän sanoja kuin asettamasi raja. Se toimii ilman mallia.');
    expect(byId('typography-questions').description).toBe('Tarkistus näyttää rivit, joista ohjelma ei voi päätellä, onko kyseessä luettelo vai vuorosana. Se toimii ilman mallia.');
    expect(byId('cliche').description).toBe('Malli etsii kuluneet kielikuvat ja valmiit fraasit.');
    expect(byId('reading-feedback').description).toBe('Malli lukee koko luvun ja kertoo, mikä toimii ja mikä huolettaa, tärkein ensin. Ei arvosanaa.');
  });

  test('model checks have one instruction and a suggest flag; local checks have neither', () => {
    for (const check of BUILTIN_CHECKS) {
      if (check.kind === 'local') {
        expect(check).not.toHaveProperty('instruction');
        expect(check).not.toHaveProperty('suggest');
      } else if (check.kind === 'model') {
        expect(typeof check.instruction).toBe('string');
        expect(check.instruction.length).toBeGreaterThan(20);
        expect(typeof check.suggest).toBe('boolean');
      } else {
        // The continuity check has its one instruction; no EHDOTUS exists in its format
        expect(check.instruction).toBe('Vertaa tekstiä taustatietoihin ja raportoi ristiriidat.');
        expect(check).not.toHaveProperty('suggest');
      }
    }

    // A suggestion is asked only where the fix is mechanical
    expect(BUILTIN_CHECKS.filter(check => check.suggest === true).map(check => check.id)).toEqual(['filler', 'dialogue', 'term-variation']);
    expect(byId('filler').instruction).toBe('Etsi täytesanat ja -ilmaukset: sanat, jotka eivät lisää virkkeeseen mitään (esimerkiksi jotenkin, ikään kuin, oikeastaan, vain, aika, melko, tavallaan, itse asiassa). Huomauta vain kohdista, joissa sanan voi poistaa merkityksen muuttumatta. Älä huomauta repliikkien puhekielestä.');
    expect(byId('paragraph-point').instruction).toBe('Etsi kappaleet, joissa ei ole yhtä selvää pääasiaa: kappale käsittelee kahta asiaa, pääasia tulee vasta lopussa tai sitä ei sanota lainkaan. Lainaa kappaleen ensimmäinen virke ja kerro huomiossa yhdellä virkkeellä, mikä kappaleen pääasia näyttää olevan.');
  });

  test('fiction defaults are täytesanat, kliseet, dialogi after the three local checks, jatkuvuus last', () => {
    // "Last" among the checks that look for faults: the reading feedback was added after it
    expect(DEFAULT_CHECK_IDS.fiction).toEqual([
      'avoid-words', 'long-sentences', 'typography-questions', 'filler', 'cliche', 'dialogue', 'continuity', 'reading-feedback'
    ]);
    expect(ids(groupOf(checksFor('fiction'), 'local'))).toEqual(['avoid-words', 'long-sentences', 'typography-questions']);
    expect(ids(groupOf(checksFor('fiction'), 'model'))).toEqual(['filler', 'cliche', 'dialogue', 'continuity', 'reading-feedback']);
  });

  test('nonfiction defaults are väite ilman lähdettä, termin vaihtelu, kappaleen pääasia', () => {
    expect(DEFAULT_CHECK_IDS.nonfiction).toEqual([
      'avoid-words', 'long-sentences', 'typography-questions', 'unsourced-claim', 'term-variation', 'paragraph-point', 'continuity', 'reading-feedback'
    ]);
    expect(ids(groupOf(checksFor('nonfiction'), 'model'))).toEqual(['unsourced-claim', 'term-variation', 'paragraph-point', 'continuity', 'reading-feedback']);
  });

  test('the reading feedback check is last in both default lists and has feedback true', () => {
    for (const type of ['fiction', 'nonfiction']) {
      const list = DEFAULT_CHECK_IDS[type];
      expect(list[list.length - 1]).toBe('reading-feedback');
      expect(list[list.length - 2]).toBe('continuity');
    }
    const check = byId('reading-feedback');
    expect(check).toMatchObject({ kind: 'model', suggest: false, feedback: true, builtin: true, label: 'Lukupalaute' });
    expect(check.types).toEqual(['fiction', 'nonfiction']);
    expect(check.instruction).toBe('Lue teksti kokonaan lukijana. Kerro ensin kaksi tai kolme asiaa, jotka toimivat. Kerro sitten huolet tärkeimmästä alkaen: kohdat, joissa lukija putoaa kärryiltä, kiinnostus laskee tai jokin ei ole uskottavaa tai perusteltua.');
    // It is the only check with the flag, and the last row of the table
    expect(BUILTIN_CHECKS.filter(entry => entry.feedback).map(entry => entry.id)).toEqual(['reading-feedback']);
    expect(BUILTIN_CHECKS[BUILTIN_CHECKS.length - 1]).toBe(check);
  });

  test('every default id names a built-in check', () => {
    for (const list of Object.values(DEFAULT_CHECK_IDS)) {
      for (const id of list) expect(byId(id)).toBeDefined();
    }
  });
});

describe('checksFor', () => {
  test('checksFor puts the other type\'s checks under Muut tarkistukset', () => {
    const fiction = checksFor('fiction');
    expect(fiction.map(group => [group.group, group.label])).toEqual([
      ['local', 'Ilman mallia'], ['model', 'Mallin tarkistukset'], ['other', 'Muut tarkistukset']
    ]);
    expect(ids(groupOf(fiction, 'other'))).toEqual(['unsourced-claim', 'term-variation', 'paragraph-point']);

    const nonfiction = checksFor('nonfiction');
    expect(ids(groupOf(nonfiction, 'other'))).toEqual(['filler', 'cliche', 'dialogue']);
    // Checks of both types are never listed twice
    for (const groups of [fiction, nonfiction]) {
      const all = groups.flatMap(ids);
      expect(new Set(all).size).toBe(all.length);
      expect(all).toHaveLength(BUILTIN_CHECKS.length);
    }
  });

  test('checksFor with aiOff returns only the Ilman mallia group', () => {
    const groups = checksFor('fiction', { aiOff: true, customChecks: OWN });
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Ilman mallia');
    expect(ids(groups[0])).toEqual(['avoid-words', 'long-sentences', 'typography-questions']);
  });

  test('checksFor with continuity false leaves Jatkuvuus out', () => {
    expect(ids(groupOf(checksFor('fiction', { continuity: false }), 'model'))).toEqual(['filler', 'cliche', 'dialogue', 'reading-feedback']);
    expect(ids(groupOf(checksFor('nonfiction', { continuity: false }), 'model')))
      .toEqual(['unsourced-claim', 'term-variation', 'paragraph-point', 'reading-feedback']);
  });

  test('an unknown project type is treated as fiction', () => {
    for (const type of [undefined, null, '', 'poetry']) {
      expect(checksFor(type)).toEqual(checksFor('fiction'));
    }
  });

  test('own checks appear under Omat tarkistukset in stored order', () => {
    const groups = checksFor('fiction', { customChecks: OWN });
    expect(groups.map(group => group.group)).toEqual(['local', 'model', 'custom', 'other']);

    const custom = groupOf(groups, 'custom');
    expect(custom.label).toBe('Omat tarkistukset');
    expect(ids(custom)).toEqual(['custom:b', 'custom:a']);
    expect(custom.checks[0]).toMatchObject({ kind: 'model', builtin: false, suggest: false, types: ['fiction', 'nonfiction'] });
    expect(custom.checks[1].suggest).toBe(true);

    // Without own checks the group is left out
    expect(checksFor('fiction', { customChecks: [] }).some(group => group.group === 'custom')).toBe(false);
  });

  test('the group labels are the four of the picker', () => {
    expect(GROUP_LABELS).toEqual({
      local: 'Ilman mallia', model: 'Mallin tarkistukset', custom: 'Omat tarkistukset', other: 'Muut tarkistukset'
    });
  });
});

describe('own checks', () => {
  const valid = { label: 'Näkökulma', instruction: 'Etsi kohdat, joissa näkökulma vaihtuu.' };

  test('validateCustomCheck rejects an empty name, a name over 40 characters and a duplicate name in any case', () => {
    expect(validateCustomCheck(valid)).toEqual({ ok: true, errors: {} });

    expect(validateCustomCheck({ ...valid, label: '   ' })).toEqual({ ok: false, errors: { label: 'Anna tarkistukselle nimi.' } });
    expect(validateCustomCheck({ ...valid, label: undefined }).errors.label).toBe('Anna tarkistukselle nimi.');

    expect(validateCustomCheck({ ...valid, label: 'a'.repeat(40) }).ok).toBe(true);
    expect(validateCustomCheck({ ...valid, label: 'a'.repeat(41) }).errors.label).toBe('Nimi on liian pitkä (enintään 40 merkkiä).');

    // The same name as a built-in check or as another own check, whatever the case and the outer spaces
    expect(validateCustomCheck({ ...valid, label: ' täytesanat ' }).errors.label).toBe('Samanniminen tarkistus on jo olemassa.');
    expect(validateCustomCheck({ ...valid, label: 'LUKUPALAUTE' }).errors.label).toBe('Samanniminen tarkistus on jo olemassa.');
    expect(validateCustomCheck({ ...valid, label: 'aikamuodot' }, OWN).errors.label).toBe('Samanniminen tarkistus on jo olemassa.');
    expect(validateCustomCheck({ ...valid, label: 'Aikamuodot 2' }, OWN).ok).toBe(true);
  });

  test('validateCustomCheck rejects an instruction under 10 or over 1000 characters', () => {
    expect(validateCustomCheck({ label: 'Nimi', instruction: 'Etsi nää.' }).errors.instruction).toBe('Kirjoita ohje tekoälylle (vähintään 10 merkkiä).');
    expect(validateCustomCheck({ label: 'Nimi', instruction: '' }).errors.instruction).toBe('Kirjoita ohje tekoälylle (vähintään 10 merkkiä).');
    expect(validateCustomCheck({ label: 'Nimi', instruction: 'Etsi nämä.' }).ok).toBe(true);

    expect(validateCustomCheck({ label: 'Nimi', instruction: 'ä'.repeat(1000) }).ok).toBe(true);
    expect(validateCustomCheck({ label: 'Nimi', instruction: 'ä'.repeat(1001) }).errors.instruction).toBe('Ohje on liian pitkä (enintään 1 000 merkkiä).');

    // Both fields can be wrong at once
    expect(validateCustomCheck({ label: '', instruction: '' })).toEqual({
      ok: false,
      errors: { label: 'Anna tarkistukselle nimi.', instruction: 'Kirjoita ohje tekoälylle (vähintään 10 merkkiä).' }
    });
    expect(CUSTOM_LIMITS).toEqual({ labelMax: 40, instructionMin: 10, instructionMax: 1000, max: 30 });
  });

  test('validateCustomCheck lets a check keep its own name when edited', () => {
    expect(validateCustomCheck({ ...valid, label: 'Aikamuodot' }, OWN, 'custom:a').ok).toBe(true);
    // Another check's name is still taken
    expect(validateCustomCheck({ ...valid, label: 'Näkökulman vaihdot' }, OWN, 'custom:a').errors.label).toBe('Samanniminen tarkistus on jo olemassa.');
  });

  // I-08 review fixes (conformance-1): review.customChecks holds at most 30; a 31st would be stored
  // and never listed, so none is made
  const ownChecks = (n) => Array.from({ length: n }, (_unused, index) => ({
    id: `custom:${index}`, label: `Oma ${index}`, instruction: 'Etsi kohdat, joissa jotain tapahtuu.', suggest: false, created: '2026-11-18T10:00:00.000Z'
  }));
  const FULL = 'Omia tarkistuksia voi olla enintään 30. Poista ensin jokin niistä.';

  test('canAddCustomCheck makes room for 30 own checks and no more, counting only the ones that are listed', () => {
    expect(canAddCustomCheck(undefined)).toEqual({ ok: true, message: null });
    expect(canAddCustomCheck(ownChecks(29))).toEqual({ ok: true, message: null });
    expect(canAddCustomCheck(ownChecks(30))).toEqual({ ok: false, message: FULL });
    expect(canAddCustomCheck(ownChecks(31))).toEqual({ ok: false, message: FULL });
    // Malformed entries and a second entry with one id are not listed, so they take no room
    expect(canAddCustomCheck([...ownChecks(29), { id: 'custom:x', label: '', instruction: 'x' }, ownChecks(1)[0], 'rikki']).ok).toBe(true);
  });

  test('validateCustomCheck refuses a new check when 30 are stored and lets one of them be edited', () => {
    expect(validateCustomCheck(valid, ownChecks(30))).toEqual({ ok: false, errors: { limit: FULL } });
    expect(validateCustomCheck(valid, ownChecks(29))).toEqual({ ok: true, errors: {} });
    expect(validateCustomCheck(valid, ownChecks(30), 'custom:4')).toEqual({ ok: true, errors: {} });
  });

  test('normalizeCustomChecks drops entries without custom: id, label or instruction and keeps at most 30', () => {
    expect(normalizeCustomChecks(null)).toEqual([]);
    expect(normalizeCustomChecks('custom:a')).toEqual([]);
    expect(normalizeCustomChecks({ id: 'custom:a' })).toEqual([]);

    const kept = normalizeCustomChecks([
      OWN[0],
      null,
      'teksti',
      { id: 'filler', label: 'Väärä tunniste', instruction: 'Ohje jota ei käytetä.' },
      { id: 'custom:c', label: '  ', instruction: 'Ohje ilman nimeä.' },
      { id: 'custom:d', label: 'Ilman ohjetta', instruction: '' },
      { id: 'custom:b', label: 'Sama tunniste uudelleen', instruction: 'Myöhempi jää pois.' },
      { id: 'custom:e', label: ' Tila ', instruction: ' Etsi tilan kuvaukset. ', suggest: 1 }
    ]);
    expect(kept.map(check => check.id)).toEqual(['custom:b', 'custom:e']);
    expect(kept[0]).toEqual({
      id: 'custom:b',
      kind: 'model',
      types: ['fiction', 'nonfiction'],
      builtin: false,
      label: 'Näkökulman vaihdot',
      instruction: 'Etsi kohdat, joissa näkökulma vaihtuu kesken kappaleen.',
      suggest: false,
      description: 'Etsi kohdat, joissa näkökulma vaihtuu kesken kappaleen.',
      created: '2026-11-16T10:00:00.000Z'
    });
    expect(kept[1]).toMatchObject({ label: 'Tila', instruction: 'Etsi tilan kuvaukset.', suggest: true });

    const many = Array.from({ length: 35 }, (_unused, index) => ({ id: `custom:${index}`, label: `Tarkistus ${index}`, instruction: 'Etsi jotakin tekstistä.' }));
    const capped = normalizeCustomChecks(many);
    expect(capped).toHaveLength(30);
    expect(capped[29].id).toBe('custom:29');
  });

  test('makeCustomCheck trims the fields and makes a custom: id', () => {
    const check = makeCustomCheck(
      { label: '  Näkökulma ', instruction: ' Etsi kohdat, joissa näkökulma vaihtuu. ', suggest: 'yes' },
      { now: '2026-11-17T08:00:00.000Z', makeId: () => 'abc1' }
    );
    expect(check).toEqual({
      id: 'custom:abc1',
      label: 'Näkökulma',
      instruction: 'Etsi kohdat, joissa näkökulma vaihtuu.',
      suggest: true,
      created: '2026-11-17T08:00:00.000Z'
    });
    // What it makes is what normalizeCustomChecks keeps
    expect(normalizeCustomChecks([check])).toHaveLength(1);

    // The default id: base-36 time and four random characters
    const generated = makeCustomCheck({ label: 'A', instruction: 'Etsi jotakin.' });
    expect(generated.id).toMatch(/^custom:[0-9a-z]{10,}$/);
    expect(generated.suggest).toBe(false);
    expect(Number.isNaN(Date.parse(generated.created))).toBe(false);
  });

  test('findCheck finds a built-in check and an own check, and null for anything else', () => {
    expect(findCheck('filler')).toBe(byId('filler'));
    expect(findCheck('custom:a', OWN)).toMatchObject({ id: 'custom:a', label: 'Aikamuodot', builtin: false });
    expect(findCheck('custom:a')).toBeNull();
    expect(findCheck('missing', OWN)).toBeNull();
    expect(findCheck(undefined)).toBeNull();
  });
});

describe('describeCheck', () => {
  test('describeCheck names Käsikirjoituksen kansio for a nonfiction folder name', () => {
    const continuity = byId('continuity');
    expect(describeCheck(continuity)).toBe('Malli vertaa lukua Tarinakansioon ja aiempien lukujen tiivistelmiin. Havainto lainaa molemmat kohdat.');
    expect(describeCheck(continuity, 'Tarinakansio')).toBe(describeCheck(continuity));
    expect(describeCheck(continuity, 'Käsikirjoituksen kansio')).toBe('Malli vertaa lukua Käsikirjoituksen kansioon ja aiempien lukujen tiivistelmiin. Havainto lainaa molemmat kohdat.');
    // The stored description is the fiction wording
    expect(continuity.description).toBe(describeCheck(continuity));
  });

  test('describeCheck gives the description of a built-in check and the cut instruction of an own check', () => {
    expect(describeCheck(byId('filler'), 'Käsikirjoituksen kansio')).toBe('Malli etsii sanat, jotka voi poistaa merkityksen muuttumatta.');

    const [short] = normalizeCustomChecks([OWN[1]]);
    expect(describeCheck(short)).toBe('Etsi kohdat, joissa aikamuoto vaihtuu ilman syytä.');

    const long = normalizeCustomChecks([{ id: 'custom:x', label: 'Pitkä', instruction: 'ö'.repeat(150) }])[0];
    expect(describeCheck(long)).toBe(`${'ö'.repeat(120)}…`);
    // An emoji across the cut is left out whole, not halved
    const emoji = { id: 'custom:y', builtin: false, kind: 'model', instruction: `${'a'.repeat(119)}😀b` };
    expect(describeCheck(emoji)).toBe(`${'a'.repeat(119)}…`);
    expect(describeCheck(null)).toBe('');
  });
});

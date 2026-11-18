/**
 * The checks of the Tarkistus tab
 *
 * Checks are data: adding one is adding a row. A local check runs without a
 * model, a model check sends one instruction with the text, and the
 * continuity check compares the text with Tarinakansio and the summaries of
 * earlier chapters. The author's own checks are model checks stored in the
 * settings. Pure functions (test/services/reviewChecks.test.js).
 */

const BOTH = ['fiction', 'nonfiction'];

const CONTINUITY_DESCRIPTION = (folder) => `Malli vertaa lukua ${folder} ja aiempien lukujen tiivistelmiin. Havainto lainaa molemmat kohdat.`;

const freezeCheck = (check) => Object.freeze({ ...check, types: Object.freeze(check.types.slice()) });

// suggest: EHDOTUS is asked only where the fix is mechanical (a filler word, a
// dialogue tag, the earlier term). A replacement image for a cliché would be
// prose generation; there the model reports and the author writes.
const BUILTIN_CHECKS = Object.freeze([
  {
    id: 'avoid-words',
    kind: 'local',
    types: BOTH,
    builtin: true,
    label: 'Vältettävät sanat',
    description: 'Tarkistus näyttää kohdat, joissa käytät projektin vältettävien sanojen listan sanoja. Se toimii ilman mallia.'
  },
  {
    id: 'long-sentences',
    kind: 'local',
    types: BOTH,
    builtin: true,
    label: 'Pitkät virkkeet',
    description: 'Tarkistus näyttää virkkeet, joissa on enemmän sanoja kuin asettamasi raja. Se toimii ilman mallia.'
  },
  {
    id: 'typography-questions',
    kind: 'local',
    types: BOTH,
    builtin: true,
    label: 'Typografian kysymykset',
    description: 'Tarkistus näyttää rivit, joista ohjelma ei voi päätellä, onko kyseessä luettelo vai vuorosana. Se toimii ilman mallia.'
  },
  {
    id: 'filler',
    kind: 'model',
    types: ['fiction'],
    suggest: true,
    builtin: true,
    label: 'Täytesanat',
    description: 'Malli etsii sanat, jotka voi poistaa merkityksen muuttumatta.',
    instruction: 'Etsi täytesanat ja -ilmaukset: sanat, jotka eivät lisää virkkeeseen mitään (esimerkiksi jotenkin, ikään kuin, oikeastaan, vain, aika, melko, tavallaan, itse asiassa). Huomauta vain kohdista, joissa sanan voi poistaa merkityksen muuttumatta. Älä huomauta repliikkien puhekielestä.'
  },
  {
    id: 'cliche',
    kind: 'model',
    types: ['fiction'],
    suggest: false,
    builtin: true,
    label: 'Kliseet',
    description: 'Malli etsii kuluneet kielikuvat ja valmiit fraasit.',
    instruction: 'Etsi kuluneet kielikuvat ja valmiit fraasit, jotka lukija on nähnyt monta kertaa (esimerkiksi sydän hakkasi rinnassa, aika pysähtyi, hiljaisuus oli käsinkosketeltava). Älä huomauta tavallisista sanonnoista repliikeissä.'
  },
  {
    id: 'dialogue',
    kind: 'model',
    types: ['fiction'],
    suggest: true,
    builtin: true,
    label: 'Dialogi',
    description: 'Malli etsii kirjoitetulta kuulostavat repliikit, selittävän dialogin ja turhat johtolauseet.',
    instruction: 'Etsi repliikit, jotka kuulostavat kirjoitetuilta eivätkä puhutuilta, repliikit, joissa henkilö selittää toiselle asian, jonka molemmat jo tietävät, ja johtolauseet, jotka toistavat sen, minkä repliikki jo sanoo.'
  },
  {
    id: 'unsourced-claim',
    kind: 'model',
    types: ['nonfiction'],
    suggest: false,
    builtin: true,
    label: 'Väite ilman lähdettä',
    description: 'Malli etsii asiaväitteet, joilta puuttuu lähde.',
    instruction: 'Etsi asiaväitteet, jotka tarvitsevat lähteen mutta joilla ei ole sitä: luvut, tutkimustulokset, historialliset tapahtumat ja toisten näkemykset. Älä huomauta kirjoittajan omista kokemuksista, yleistiedosta äläkä kohdista, joissa lähde on jo mainittu tai merkitty.'
  },
  {
    id: 'term-variation',
    kind: 'model',
    types: ['nonfiction'],
    suggest: true,
    builtin: true,
    label: 'Termin vaihtelu',
    description: 'Malli etsii kohdat, joissa samasta asiasta käytetään eri termiä.',
    instruction: 'Etsi kohdat, joissa samasta asiasta käytetään eri termiä kuin aiemmin tässä tekstissä. Lainaa kohta, jossa poikkeava termi on, ja kerro huomiossa, mitä termiä aiemmin käytettiin. Tyylillinen vaihtelu tavallisissa sanoissa ei ole virhe.'
  },
  {
    id: 'paragraph-point',
    kind: 'model',
    types: ['nonfiction'],
    suggest: false,
    builtin: true,
    label: 'Kappaleen pääasia',
    description: 'Malli etsii kappaleet, joiden pääasia jää epäselväksi.',
    instruction: 'Etsi kappaleet, joissa ei ole yhtä selvää pääasiaa: kappale käsittelee kahta asiaa, pääasia tulee vasta lopussa tai sitä ei sanota lainkaan. Lainaa kappaleen ensimmäinen virke ja kerro huomiossa yhdellä virkkeellä, mikä kappaleen pääasia näyttää olevan.'
  },
  {
    id: 'continuity',
    kind: 'continuity',
    types: BOTH,
    builtin: true,
    label: 'Jatkuvuus',
    description: CONTINUITY_DESCRIPTION('Tarinakansioon'),
    instruction: 'Vertaa tekstiä taustatietoihin ja raportoi ristiriidat.'
  },
  // The reading feedback reads the whole chapter and reports what works and
  // what worries a reader. It has a severity word per finding and no score.
  {
    id: 'reading-feedback',
    kind: 'model',
    types: BOTH,
    suggest: false,
    feedback: true,
    builtin: true,
    label: 'Lukupalaute',
    description: 'Malli lukee koko luvun ja kertoo, mikä toimii ja mikä huolettaa, tärkein ensin. Ei arvosanaa.',
    instruction: 'Lue teksti kokonaan lukijana. Kerro ensin kaksi tai kolme asiaa, jotka toimivat. Kerro sitten huolet tärkeimmästä alkaen: kohdat, joissa lukija putoaa kärryiltä, kiinnostus laskee tai jokin ei ole uskottavaa tai perusteltua.'
  }
].map(freezeCheck));

const DEFAULT_CHECK_IDS = Object.freeze({
  fiction: Object.freeze([
    'avoid-words', 'long-sentences', 'typography-questions',
    'filler', 'cliche', 'dialogue', 'continuity', 'reading-feedback'
  ]),
  nonfiction: Object.freeze([
    'avoid-words', 'long-sentences', 'typography-questions',
    'unsourced-claim', 'term-variation', 'paragraph-point', 'continuity', 'reading-feedback'
  ])
});

const GROUP_LABELS = Object.freeze({
  local: 'Ilman mallia',
  model: 'Mallin tarkistukset',
  custom: 'Omat tarkistukset',
  other: 'Muut tarkistukset'
});

const CUSTOM_LIMITS = Object.freeze({ labelMax: 40, instructionMin: 10, instructionMax: 1000, max: 30 });

const CUSTOM_PREFIX = 'custom:';
const DESCRIPTION_MAX = 120;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const asText = (value) => (typeof value === 'string' ? value : '');
const builtin = (id) => BUILTIN_CHECKS.find(check => check.id === id) || null;

// A custom check is described by its own instruction
function shortInstruction(instruction) {
  const text = asText(instruction).trim();
  if (text.length <= DESCRIPTION_MAX) return text;
  // Never cut an emoji in half: a lone surrogate shows as a broken character
  const cut = text.slice(0, DESCRIPTION_MAX);
  return `${/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut}…`;
}

/**
 * The stored own checks as Check objects: malformed entries are dropped, the
 * first of two entries with one id wins, at most 30 are kept.
 * @returns {Array<object>}
 */
function normalizeCustomChecks(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const checks = [];
  for (const entry of value) {
    if (checks.length >= CUSTOM_LIMITS.max) break;
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.startsWith(CUSTOM_PREFIX)) continue;
    const label = asText(entry.label).trim();
    const instruction = asText(entry.instruction).trim();
    if (!label || !instruction || seen.has(entry.id)) continue;
    seen.add(entry.id);
    checks.push({
      ...entry,
      id: entry.id,
      kind: 'model',
      types: BOTH.slice(),
      builtin: false,
      label,
      instruction,
      suggest: !!entry.suggest,
      description: shortInstruction(instruction)
    });
  }
  return checks;
}

// Shown when no more own checks fit: under the picker, whose "Uusi oma tarkistus…" is then disabled,
// and by the dialog (stage I-08 review fixes; the settings key holds at most CUSTOM_LIMITS.max)
const CUSTOM_FULL_MESSAGE = `Omia tarkistuksia voi olla enintään ${CUSTOM_LIMITS.max}. Poista ensin jokin niistä.`;

/**
 * Is there room for one more own check? Counted as normalizeCustomChecks counts, so a check
 * that would be saved is also one that is listed.
 * @param {Array} value the stored own checks
 * @returns {{ok: boolean, message: string|null}}
 */
function canAddCustomCheck(value) {
  const full = normalizeCustomChecks(value).length >= CUSTOM_LIMITS.max;
  return { ok: !full, message: full ? CUSTOM_FULL_MESSAGE : null };
}

/**
 * The picker of the tab: groups in the order local, model, custom, other.
 * An empty group is left out; with aiOff only the local group is returned.
 * @param {'fiction'|'nonfiction'} projectType anything else is read as fiction
 * @param {{customChecks?: Array, aiOff?: boolean, continuity?: boolean}} [options]
 * @returns {Array<{group: string, label: string, checks: Array<object>}>}
 */
function checksFor(projectType, options) {
  const { customChecks = [], aiOff = false, continuity = true } = options || {};
  const type = projectType === 'nonfiction' ? 'nonfiction' : 'fiction';
  const defaults = DEFAULT_CHECK_IDS[type].map(builtin).filter(Boolean);

  const groups = [{ group: 'local', checks: defaults.filter(check => check.kind === 'local') }];
  if (!aiOff) {
    groups.push({
      group: 'model',
      checks: defaults.filter(check => check.kind === 'model' || (check.kind === 'continuity' && continuity))
    });
    groups.push({ group: 'custom', checks: normalizeCustomChecks(customChecks) });
    groups.push({
      group: 'other',
      checks: BUILTIN_CHECKS.filter(check => check.kind === 'model' && !check.types.includes(type))
    });
  }
  return groups
    .filter(entry => entry.checks.length > 0)
    .map(entry => ({ group: entry.group, label: GROUP_LABELS[entry.group], checks: entry.checks }));
}

/** A built-in check or one of the author's own, by id; null when there is none. */
function findCheck(id, customChecks = []) {
  if (typeof id !== 'string' || !id) return null;
  return builtin(id) || normalizeCustomChecks(customChecks).find(check => check.id === id) || null;
}

/**
 * The line under the picker. The continuity check names the folder as the
 * project calls it; an own check shows the beginning of its instruction.
 */
function describeCheck(check, folderName = 'Tarinakansio') {
  if (!check) return '';
  if (check.kind === 'continuity') {
    return CONTINUITY_DESCRIPTION(folderName === 'Käsikirjoituksen kansio' ? 'Käsikirjoituksen kansioon' : 'Tarinakansioon');
  }
  if (check.builtin === false) return shortInstruction(check.instruction);
  return asText(check.description);
}

// Base-36 time and four random base-36 characters
function defaultId() {
  const random = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, '0');
  return `${Date.now().toString(36)}${random}`;
}

/**
 * A new own check as it is stored in the settings.
 * @param {{label: string, instruction: string, suggest?: boolean}} fields
 * @param {{now?: string, makeId?: () => string}} [options]
 * @returns {{id: string, label: string, instruction: string, suggest: boolean, created: string}}
 */
function makeCustomCheck(fields, options) {
  const { label, instruction, suggest } = fields || {};
  const { now = new Date().toISOString(), makeId = defaultId } = options || {};
  return {
    id: CUSTOM_PREFIX + makeId(),
    label: asText(label).trim(),
    instruction: asText(instruction).trim(),
    suggest: !!suggest,
    created: now
  };
}

/**
 * Check the two fields of the own-check dialog.
 * @param {{label: string, instruction: string}} fields
 * @param {Array} existing the stored own checks
 * @param {string|null} ownId the check being edited keeps its own name; null for a new check, which
 *   needs room in the list (canAddCustomCheck)
 * @returns {{ok: boolean, errors: {label?: string, instruction?: string, limit?: string}}}
 */
function validateCustomCheck(fields, existing = [], ownId = null) {
  const label = asText(fields && fields.label).trim();
  const instruction = asText(fields && fields.instruction).trim();
  const errors = {};

  const folded = label.toLowerCase();
  const taken = BUILTIN_CHECKS.some(check => check.label.toLowerCase() === folded)
    || (Array.isArray(existing) ? existing : []).some(check => isRecord(check)
      && check.id !== ownId
      && asText(check.label).trim().toLowerCase() === folded);

  if (!label) errors.label = 'Anna tarkistukselle nimi.';
  else if (label.length > CUSTOM_LIMITS.labelMax) errors.label = 'Nimi on liian pitkä (enintään 40 merkkiä).';
  else if (taken) errors.label = 'Samanniminen tarkistus on jo olemassa.';

  if (instruction.length < CUSTOM_LIMITS.instructionMin) {
    errors.instruction = 'Kirjoita ohje tekoälylle (vähintään 10 merkkiä).';
  } else if (instruction.length > CUSTOM_LIMITS.instructionMax) {
    errors.instruction = 'Ohje on liian pitkä (enintään 1 000 merkkiä).';
  }

  if (ownId == null) {
    const room = canAddCustomCheck(existing);
    if (!room.ok) errors.limit = room.message;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

module.exports = {
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
};

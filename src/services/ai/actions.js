/**
 * Quick actions of the inline prompt (Cmd+K)
 *
 * The built-in actions per project kind and the author's own saved prompts.
 * Pure data and list functions: no DOM, no settings access. The caller reads
 * and writes the settings key `savedPrompts` and passes the project kind
 * ('fiction' | 'nonfiction'), which comes from projectKind() of codex.js.
 *
 * A built-in is { id, label, prompt, types, strict?, builtin: true }.
 * A saved prompt is { id, label, prompt, created, builtin: false }.
 */

const MAX_SAVED = 30;
const MAX_LABEL = 40;
const MAX_PROMPT = 2000;
const MENU_SAVED = 12;
const MENU_LABEL = 60;
const AUTO_LABEL = 32;

// 'custom' is the free instruction, 'write' the write-at-cursor mode
const RESERVED_IDS = ['custom', 'write'];

const BOTH = ['fiction', 'nonfiction'];

const action = (id, label, types, prompt, strict) => {
  const item = { id, label, prompt, types: Object.freeze(types.slice()), builtin: true };
  if (strict) item.strict = true;
  return Object.freeze(item);
};

const BUILTIN_ACTIONS = Object.freeze([
  action(
    'proofread',
    'Kielenhuolto – vain virheet',
    BOTH,
    'Korjaa vain kielivirheet: oikeinkirjoitus, yhdyssanat, pilkut ja muut välimerkit, kongruenssi ja sijamuodot. Älä muuta sanavalintoja, tyyliä, sanajärjestystä tai rytmiä. Älä muuta puhekielisiä tai murteellisia vuorosanoja yleiskielisiksi. Jos virheitä ei ole, palauta teksti muuttamattomana.',
    true
  ),
  action(
    'tighten',
    'Tiivistä',
    ['fiction'],
    'Tiivistä teksti noin kolmanneksen lyhyemmäksi. Poista toisto ja täytesanat. Säilytä sisältö, tapahtumat, ääni ja aikamuoto.'
  ),
  action(
    'clarify',
    'Selkeytä',
    BOTH,
    'Selkeytä virkkeet, joiden rakenne on raskas tai monitulkintainen. Pidä sisältö ja sävy ennallaan äläkä lisää uutta tietoa.'
  ),
  action(
    'show',
    'Näytä, älä kerro',
    ['fiction'],
    'Kirjoita kohta niin, että tunteet ja tilanne näkyvät teoissa, aistihavainnoissa ja vuorosanoissa sen sijaan, että kertoja nimeää ne. Älä lisää uusia tapahtumia tai henkilöitä. Pidä pituus suunnilleen samana.'
  ),
  action(
    'tighten-paragraph',
    'Tiivistä kappale',
    ['nonfiction'],
    'Tiivistä jokainen kappale niin, että siinä on yksi pääasia. Poista toisto ja varaukset, jotka eivät muuta merkitystä. Säilytä termit ja lähdeviitteet sellaisinaan.'
  ),
  action(
    'clarify-claim',
    'Selkeytä väite',
    ['nonfiction'],
    'Muotoile kohdan pääväite yhdeksi selkeäksi virkkeeksi kohdan alkuun ja varmista, että muut virkkeet tukevat sitä. Älä lisää tietoa, jota tekstissä ei ole.'
  ),
  action(
    'unify-terms',
    'Yhtenäistä termit',
    ['nonfiction'],
    'Jos samasta asiasta käytetään kohdassa useaa termiä, valitse niistä ensimmäisenä esiintyvä ja käytä sitä johdonmukaisesti. Älä muuta mitään muuta.'
  )
]);

// In nonfiction "Tiivistä kappale" takes the slot of "Tiivistä" and the claim
// and term actions the slot of "Näytä, älä kerro"
const DEFAULT_ACTION_IDS = Object.freeze({
  fiction: Object.freeze(['proofread', 'tighten', 'clarify', 'show']),
  nonfiction: Object.freeze(['proofread', 'tighten-paragraph', 'clarify', 'clarify-claim', 'unify-terms'])
});

const builtinById = (id) => BUILTIN_ACTIONS.find((item) => item.id === id) || null;

// Cut a string to at most `max` UTF-16 units without leaving half of a
// surrogate pair (an emoji) at the end: the lone half would reach the screen
function cutText(value, max) {
  const cut = value.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

// A label cut with an ellipsis that keeps the whole within `max`
// (labelFromPrompt adds the ellipsis after its 32 characters, as specified)
const ellipsis = (value, max) => `${cutText(value, max)}…`;

// The stored prompt text. Trimmed again after the cut, so that reading it
// back (normalizeSavedPrompts) gives the same string and the duplicate test holds.
const promptText = (value) => cutText(value.trim(), MAX_PROMPT).trimEnd();

/** A button label for a saved prompt: its first line, at most 32 characters. */
function labelFromPrompt(text) {
  const firstLine = String(text == null ? '' : text).trim().split(/\r\n|\r|\n/)[0] || '';
  const line = firstLine.replace(/\s+/g, ' ').trim();
  return line.length > AUTO_LABEL ? ellipsis(line, AUTO_LABEL) : line;
}

/**
 * Repair the stored list: only well-formed entries, no duplicate ids, at most 30.
 * An id that a built-in or a mode already uses is dropped, because findAction
 * would never reach that entry.
 */
function normalizeSavedPrompts(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const list = [];
  for (const entry of value) {
    if (list.length >= MAX_SAVED) break;
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.id !== 'string' || typeof entry.label !== 'string' || typeof entry.prompt !== 'string') continue;

    const id = entry.id.trim();
    const prompt = promptText(entry.prompt);
    if (!id || !prompt) continue;
    if (seen.has(id) || RESERVED_IDS.includes(id) || builtinById(id)) continue;

    seen.add(id);
    list.push({
      id,
      label: cutText(entry.label.trim(), MAX_LABEL).trimEnd() || labelFromPrompt(prompt),
      prompt,
      created: Number.isFinite(entry.created) ? entry.created : 0,
      builtin: false
    });
  }
  return list;
}

/** The buttons of a project kind: its built-ins in order, then the saved prompts. */
function actionsFor(kind, saved = []) {
  const ids = kind === 'nonfiction' ? DEFAULT_ACTION_IDS.nonfiction : DEFAULT_ACTION_IDS.fiction;
  return ids.map(builtinById).concat(normalizeSavedPrompts(saved));
}

/** Any built-in by id (whatever the project kind), else a saved prompt, else null. */
function findAction(id, saved = []) {
  if (typeof id !== 'string' || RESERVED_IDS.includes(id)) return null;
  return builtinById(id) || normalizeSavedPrompts(saved).find((item) => item.id === id) || null;
}

/** The entries of the right-click "Tekoäly" submenu: built-ins plus at most 12 saved prompts. */
function menuEntries(kind, saved = []) {
  const items = actionsFor(kind, saved);
  const builtins = items.filter((item) => item.builtin);
  const own = items.filter((item) => !item.builtin).slice(0, MENU_SAVED);
  return builtins.concat(own).map((item) => ({
    id: item.id,
    label: item.label.length > MENU_LABEL ? ellipsis(item.label, MENU_LABEL - 1) : item.label
  }));
}

/**
 * Save an instruction as a new prompt. Never changes the list given.
 * @returns {{ list: Array, added: object|null, reason?: 'empty'|'duplicate'|'full' }}
 */
function addSavedPrompt(list, text, now = Date.now()) {
  const current = normalizeSavedPrompts(list);
  const prompt = promptText(String(text == null ? '' : text));

  if (!prompt) return { list: current, added: null, reason: 'empty' };
  if (current.some((item) => item.prompt === prompt)) return { list: current, added: null, reason: 'duplicate' };
  if (current.length >= MAX_SAVED) return { list: current, added: null, reason: 'full' };

  // Two prompts saved within the same millisecond still get different ids
  const base = `user-${Number(now).toString(36)}`;
  let id = base;
  for (let n = 2; current.some((item) => item.id === id); n += 1) id = `${base}-${n}`;

  const added = { id, label: labelFromPrompt(prompt), prompt, created: now, builtin: false };
  return { list: current.concat([added]), added };
}

/** The list without one prompt; always a new array. */
function removeSavedPrompt(list, id) {
  return normalizeSavedPrompts(list).filter((item) => item.id !== id);
}

module.exports = {
  BUILTIN_ACTIONS,
  DEFAULT_ACTION_IDS,
  actionsFor,
  findAction,
  menuEntries,
  normalizeSavedPrompts,
  addSavedPrompt,
  removeSavedPrompt,
  labelFromPrompt
};

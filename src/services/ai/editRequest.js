/**
 * Tasks of the inline prompt (Cmd+K)
 *
 * Builds the task objects that the context builder turns into a request:
 * a quick edit of a selection, a refinement of an attempt, and writing at the
 * cursor. Pure functions, no imports. Nothing here assembles a prompt or reads
 * an answer: the builder adds the context around the task, and the request
 * layer decides whether an answer is acceptable.
 *
 * The rules are Finnish for every project language; the builder's language
 * rule decides the language of the answer.
 */

const LIMITS = Object.freeze({ maxTarget: 12000, maxAttempts: 12, before: 1500, after: 500 });

const WRITE_LENGTHS = Object.freeze({
  sentence: Object.freeze({ rule: 'Kirjoita yksi tai kaksi virkettä.', answerTokens: 200 }),
  paragraph: Object.freeze({ rule: 'Kirjoita yksi kappale, enintään noin 120 sanaa.', answerTokens: 500 }),
  long: Object.freeze({ rule: 'Kirjoita kaksi tai kolme kappaletta, yhteensä enintään noin 350 sanaa.', answerTokens: 1300 })
});

// First text arrives in about 3 s without reasoning, in about 13 s with it
const QUICK_EDIT_THINKING = 'off';

// A quick action chosen from a menu is sent as the prompt opens. With false
// the prompt only opens, and the author presses the action there.
const ACTION_SENDS_AT_ONCE = true;

const EDIT_ROLE = 'Olet kustannustoimittaja, joka muokkaa käsikirjoitusta kirjoittajan ohjeen mukaan.';
const WRITE_ROLE = 'Kirjoitat jatkoa käsikirjoitukseen kirjoittajan omalla äänellä.';
const WRITE_ROLE_NONFICTION = 'Kirjoitat jatkoa tietokirjan käsikirjoitukseen kirjoittajan omalla äänellä.';

const isFinnish = (language) => language == null || language === '' || language === 'fi';

/** Answer budget of an edit: the target may grow by half, plus the tags. */
function answerTokensFor(targetChars) {
  return Math.max(256, Math.ceil((targetChars / 2.5) * 1.5) + 200);
}

/**
 * The task of a quick edit. `target` is the masked selection.
 * @param {{ instruction: string, target: string, placeholderRule?: string, language?: string, instructionLabel?: string }} input
 */
function editTask({ instruction, target, placeholderRule, language, instructionLabel } = {}) {
  const text = typeof target === 'string' ? target : '';
  const order = typeof instruction === 'string' ? instruction.trim() : '';
  if (!text.trim()) throw new TypeError('editTask: target is empty');
  if (!order) throw new TypeError('editTask: instruction is empty');

  const rules = [
    '- Muokkaa vain <valinta>-osan tekstiä. Kaikki muut osat ovat vain taustaa: älä toista äläkä muuta niitä.',
    '- Tee vain se, mitä <ohje> pyytää. Säilytä kaikki muu sanasta sanaan, myös välimerkit ja rivinvaihdot.',
    '- Säilytä kirjoittajan ääni, aikamuoto ja näkökulma.'
  ];
  if (typeof placeholderRule === 'string' && placeholderRule !== '') rules.push(`- ${placeholderRule}`);
  if (isFinnish(language)) rules.push('- Käytä suomalaisia lainausmerkkejä ” ja ajatusviivaa –.');
  rules.push('- Vastaa vain näin: <teksti>muokattu teksti</teksti>. Ei selityksiä, ei otsikoita eikä muuta tekstiä tagien ulkopuolella.');
  rules.push('- Jos ohjetta ei voi noudattaa, palauta teksti muuttamattomana tagien sisällä.');

  return {
    id: 'edit',
    role: EDIT_ROLE,
    rules,
    instruction: order,
    payload: text,
    payloadTag: 'valinta',
    payloadLabel: 'valinta',
    // Without these the builder's edit profile would send 6 000 and 1 500
    // characters of read-only text around every quick edit
    limits: { before: LIMITS.before, after: LIMITS.after },
    answerTokens: answerTokensFor(text.length),
    // The context row's name for the instruction when it is not the author's own (a quick action's rule text)
    ...(typeof instructionLabel === 'string' && instructionLabel.trim() !== '' ? { instructionLabel: instructionLabel.trim() } : {})
  };
}

/**
 * The messages of "Tarkenna": the first request, the attempt on screen as the
 * model's own turn, and the refinement. Always three messages, so a second
 * refinement replaces the assistant turn instead of growing the conversation.
 */
function refineMessages(built, attemptMasked, refineInstruction) {
  const order = typeof refineInstruction === 'string' ? refineInstruction.trim() : '';
  if (!order) throw new TypeError('refineMessages: instruction is empty');

  return {
    system: built.system,
    messages: [
      built.messages[0],
      { role: 'assistant', content: `<teksti>\n${attemptMasked}\n</teksti>` },
      {
        role: 'user',
        content: `Tarkenna edellistä versiota tällä ohjeella: ${order}\n\nPalauta koko teksti uudelleen <teksti>-tagien sisällä. Muuta vain se, mitä tarkennus vaatii.`
      }
    ]
  };
}

/**
 * The task of writing at the cursor. It has no payload: the builder gives the
 * text before and after the cursor.
 * @param {{ direction?: string, length?: 'sentence'|'paragraph'|'long', projectKind?: string, language?: string }} input
 */
function writeTask({ direction, length, projectKind, language } = {}) {
  const size = Object.prototype.hasOwnProperty.call(WRITE_LENGTHS, length) ? WRITE_LENGTHS[length] : WRITE_LENGTHS.paragraph;
  const nonfiction = projectKind === 'nonfiction';
  const aim = typeof direction === 'string' ? direction.trim() : '';

  const rules = [
    '- Jatka täsmälleen siitä, mihin <edeltava_teksti> päättyy. Älä toista aiempaa tekstiä äläkä tiivistä sitä.',
    `- ${size.rule}`,
    '- Säilytä aikamuoto, näkökulma, henkilöiden nimet ja tyyli.',
    '- Jos <seuraava_teksti> on annettu, se jatkuu heti uuden tekstin jälkeen. Kirjoita vain se, mikä mahtuu edeltävän ja seuraavan tekstin väliin. Älä toista seuraavaa tekstiä äläkä kerro sen tapahtumia etukäteen.'
  ];
  if (isFinnish(language)) {
    rules.push('- Käytä suomalaisia lainausmerkkejä ” ja ajatusviivaa –. Merkitse vuorosanat samalla tavalla kuin edeltävässä tekstissä.');
  }
  if (nonfiction) {
    rules.push('- Älä keksi lähteitä, lukuja tai sitaatteja. Jos väite tarvitsee lähteen, merkitse kohta näin: [TODO: lähde].');
  }
  rules.push('- Vastaa vain näin: <teksti>uusi teksti</teksti>. Ei selityksiä, ei otsikoita eikä muuta tekstiä tagien ulkopuolella.');

  return {
    id: 'write',
    role: nonfiction ? WRITE_ROLE_NONFICTION : WRITE_ROLE,
    rules,
    instruction: aim ? `Suunta: ${aim}` : 'Suunta: jatka luontevasti.',
    answerTokens: size.answerTokens,
    // Without a direction the instruction is this task's own wording, not the author's: the context
    // row names it "ohje", as it does a quick action's rule text ("oma ohje" is what the author wrote)
    ...(aim ? {} : { instructionLabel: 'ohje' })
  };
}

/**
 * Streaming preview only: show the protected spans again while the answer is
 * still arriving, and hide a placeholder that has only half arrived. A span
 * the model dropped is not put back here; unmaskSpans does that on the final
 * text.
 */
function previewUnmask(text, mask) {
  let shown = String(text == null ? '' : text);
  const spans = mask && Array.isArray(mask.spans) ? mask.spans : [];
  if (spans.length === 0) return shown;

  const tokens = new Map();
  for (const span of spans) {
    if (span && typeof span.token === 'string' && span.token) tokens.set(span.token, String(span.text == null ? '' : span.text));
  }

  // A trailing piece such as "⟦", "⟦1" or "⟦/" is the start of a placeholder
  const open = shown.lastIndexOf('⟦');
  if (open !== -1 && shown.indexOf('⟧', open) === -1) {
    const tail = shown.slice(open);
    for (const token of tokens.keys()) {
      if (token.length > tail.length && token.startsWith(tail)) {
        shown = shown.slice(0, open);
        break;
      }
    }
  }

  // One pass, so a span whose own text looks like a placeholder stays as it is
  return shown.replace(/⟦\/?\d+⟧/g, (token) => (tokens.has(token) ? tokens.get(token) : token));
}

const fiNumber = (value) => Number(value || 0).toLocaleString('fi-FI');

/**
 * Texts that only the prompt itself produces. Reasons of a failed request come
 * ready from the request layer (result.reasonText).
 */
function promptMessage(code, vars = {}) {
  const values = vars || {};
  switch (code) {
    case 'changed':
      return 'Teksti muuttui pyynnön aikana. Ehdotuksia ei tehty. Lähetä ohje uudelleen.';
    case 'no-paragraph':
      return 'Valitse teksti tai siirrä kohdistin kappaleeseen.';
    case 'too-long':
      return `Valinta on liian pitkä pikamuokkaukseen (${fiNumber(values.chars)} merkkiä, enintään ${fiNumber(values.max)}). Valitse lyhyempi kohta.`;
    case 'reserved-tag':
      return 'Valinnassa on <teksti>-tagi, jota pikamuokkaus käyttää itse. Poista se valinnasta.';
    case 'no-changes':
      return 'Malli ei ehdottanut muutoksia.';
    case 'conflict':
      return 'Kohdassa on jo käsittelemätön ehdotus. Käsittele se ensin.';
    case 'no-sentence':
      return 'Pysäytetty ennen ensimmäistä kokonaista virkettä.';
    default:
      return values.message || '';
  }
}

module.exports = {
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
};

/**
 * @jest-environment node
 */
const {
  QUOTE,
  APOSTROPHE,
  DASH,
  SCENE_BREAK,
  TYPOGRAPHY_RULES,
  protectedRanges,
  effectiveLineStartDash,
  inputAction,
  smartReplace,
  toFinnishTypography,
  normaliseModelText,
  checkTypography,
  fixesFor,
  dashLineChanges,
  countDashLines,
  isDialogueLine,
  quoteSpans
} = require('../../src/editor/typography.fi');

const ON = { enabled: true };
const OFF = { enabled: false };
const NBSP = '\u00A0';

// Type a string one character at a time, the way the editor's input handler
// does it: ask inputAction, insert the character, apply the smartReplace edit
function type(keys, options = ON, start = '', startCol = start.length) {
  let line = start;
  let col = startCol;
  const rules = [];
  for (const key of keys) {
    const action = inputAction(line, col, key, options);
    if (action === 'swallow') continue;
    line = line.slice(0, col) + key + line.slice(col);
    col += 1;
    if (action !== 'check') continue;
    const edit = smartReplace(line, col, options);
    if (!edit) continue;
    line = line.slice(0, edit.from) + edit.insert + line.slice(edit.to);
    col = edit.cursor;
    rules.push(edit.rule);
  }
  return { line, col, rules };
}

const typed = (keys, options, start, startCol) => type(keys, options, start, startCol).line;

function apply(text, changes) {
  let out = '';
  let cursor = 0;
  for (const change of changes) {
    out += text.slice(cursor, change.from) + change.insert;
    cursor = change.to;
  }
  return out + text.slice(cursor);
}

const rulesOf = (text, options) => checkTypography(text, options).map(finding => finding.ruleId);
const findingsOf = (text, ruleId, options) => checkTypography(text, options).filter(finding => finding.ruleId === ruleId);
const fixed = (text, options = { levels: ['normi', 'suositus'] }) => apply(text, fixesFor(checkTypography(text), options));

describe('constants', () => {
  test('the Finnish marks and the scene break rule', () => {
    expect(QUOTE).toBe('”');
    expect(APOSTROPHE).toBe('’');
    expect(DASH).toBe('–');
    expect(['---', '* * *', '- - -', '___'].every(line => SCENE_BREAK.test(line))).toBe(true);
    expect(SCENE_BREAK.test('- kohta')).toBe(false);
    expect(SCENE_BREAK.test('--')).toBe(false);
  });

  test('the rule table has 14 rules, each with its id, level, title, message and link', () => {
    const ids = Object.keys(TYPOGRAPHY_RULES);
    expect(ids).toHaveLength(14);
    for (const id of ids) {
      const info = TYPOGRAPHY_RULES[id];
      expect(info.id).toBe(id);
      expect(['normi', 'suositus', 'kysymys']).toContain(info.level);
      expect(info.title.length).toBeGreaterThan(0);
      expect(info.message.length).toBeGreaterThan(0);
      expect(info.url).toMatch(/^https:\/\/(www\.)?kielitoimistonohjepankki\.fi\/ohje\/[a-z0-9-]+\/$/);
    }
    expect(ids.filter(id => TYPOGRAPHY_RULES[id].level === 'suositus').sort())
      .toEqual(['ajatusviivan-valit', 'kellonaika-kaksoispiste', 'kolme-pistetta']);
    expect(ids.filter(id => TYPOGRAPHY_RULES[id].level === 'kysymys')).toEqual(['rivin-alun-viiva']);
    expect(TYPOGRAPHY_RULES['kolme-pistetta']).toEqual({
      id: 'kolme-pistetta',
      level: 'suositus',
      title: 'Kolme pistettä erillisinä merkkeinä',
      message: 'Kolme pistettä voi kirjoittaa yhdellä merkillä (…). Painetussa tekstissä se on tavallisin muoto.',
      url: 'https://kielitoimistonohjepankki.fi/ohje/kolme-pistetta/'
    });
  });

  test('the titles and messages of the 14 rules are the specified wording', () => {
    // Written out here on purpose: the panel shows these as they are
    const wording = {
      'suora-lainausmerkki': ['Suora lainausmerkki',
        'Suomenkielisessä tekstissä lainaus alkaa ja päättyy samalla kaarevalla merkillä ”.'],
      'vieras-lainausmerkki': ['Vieraan kielen lainausmerkki',
        'Merkit “ ja „ kuuluvat muiden kielten käytäntöön. Suomessa lainauksen molemmin puolin on ”.'],
      'suora-heittomerkki': ['Suora heittomerkki',
        'Heittomerkkinä ja puolilainausmerkkinä käytetään kaarevaa merkkiä ’.'],
      'kaksi-yhdysmerkkia': ['Kaksi yhdysmerkkiä',
        'Kaksi peräkkäistä yhdysmerkkiä on ajatusviivan korvike. Oikea merkki on –.'],
      'yhdysmerkki-ajatusviivana': ['Yhdysmerkki ajatusviivan paikalla',
        'Kun viivan molemmin puolin on väli, kyse on ajatusviivasta (–), ei yhdysmerkistä.'],
      'ajatusviivan-valit': ['Väli puuttuu ajatusviivan toiselta puolelta',
        'Virkkeen sisällä ajatusviivan molemmin puolin on väli. Rajakohtien välissä (2–3, Helsinki–Tampere) välejä ei ole kummallakaan puolella.'],
      'vuorosanaviivan-vali': ['Väli puuttuu vuorosanaviivan jälkeen',
        'Vuorosanaviivan ja repliikin väliin tulee väli.'],
      'lukuvali-yhdysmerkki': ['Yhdysmerkki lukujen välissä',
        'Kun ilmaistaan rajakohtia, lukujen väliin kirjoitetaan ajatusviiva ilman välejä: 2–3, 1939–1945.'],
      'prosentti-vali': ['Väli puuttuu ennen prosenttimerkkiä',
        'Luvun ja prosenttimerkin väliin tulee väli: 11 %.'],
      'paivays-muoto': ['Päiväyksen muoto',
        'Päiväys kirjoitetaan ilman välejä ja ilman etunollia: 3.4.2025.'],
      'paivays-jarjestyspiste': ['Piste puuttuu päivän numerosta',
        'Kun kuukausi kirjoitetaan sanana, päivän numeron perään tulee piste: 16. marraskuuta.'],
      'kellonaika-kaksoispiste': ['Kaksoispiste kellonajassa',
        'Yleiskielisessä tekstissä tuntien ja minuuttien väliin suositellaan pistettä: kello 9.15. Kaksoispiste on digitaalisten näyttöjen tapa.'],
      'kolme-pistetta': ['Kolme pistettä erillisinä merkkeinä',
        'Kolme pistettä voi kirjoittaa yhdellä merkillä (…). Painetussa tekstissä se on tavallisin muoto.'],
      'rivin-alun-viiva': ['Luettelo vai vuorosana?',
        'Rivi alkaa yhdysmerkillä ja välillä, joten FAUST käsittelee sen luettelokohtana. Jos rivi on repliikki, sen alkuun kuuluu vuorosanaviiva (– ).']
    };
    expect(Object.keys(TYPOGRAPHY_RULES).sort()).toEqual(Object.keys(wording).sort());
    for (const [id, [title, message]] of Object.entries(wording)) {
      expect([id, TYPOGRAPHY_RULES[id].title, TYPOGRAPHY_RULES[id].message]).toEqual([id, title, message]);
    }
  });
});

describe('protectedRanges', () => {
  test('finds a closed [TODO: …] note', () => {
    expect(protectedRanges('Hän tuli [TODO: tarkista kellonaika] kotiin.')).toEqual([[9, 36]]);
    expect(protectedRanges('Ei merkintöjä.')).toEqual([]);
    expect(protectedRanges('')).toEqual([]);
  });

  test('treats an unclosed [TODO: as protected to the end of the line', () => {
    const line = 'alku [TODO: kesken "jää';
    expect(protectedRanges(line)).toEqual([[5, line.length]]);
    // A closed note first, then an open one
    expect(protectedRanges('[TODO: a] ja [TODO: b')).toEqual([[0, 9], [13, 21]]);
  });

  test('protects the <u> and </u> tags but not the text between them', () => {
    expect(protectedRanges('a <u>sana</u> b')).toEqual([[2, 5], [9, 13]]);
  });

  test('returns sorted ranges for a line with a note, tags and an open note', () => {
    expect(protectedRanges('a [TODO: x] b <u>c</u> [TODO: open')).toEqual([[2, 11], [14, 17], [18, 22], [23, 34]]);
  });

  test('protects single and closing mask placeholders', () => {
    expect(protectedRanges('a ⟦1⟧ b ⟦2⟧c⟦/2⟧ d')).toEqual([[2, 5], [8, 11], [12, 16]]);
    expect(protectedRanges('⟦x⟧ ja ⟦⟧')).toEqual([]);
  });

  test('a tag inside a note does not make overlapping ranges', () => {
    expect(protectedRanges('[TODO: <u>x</u>] loppu')).toEqual([[0, 16]]);
  });
});

describe('effectiveLineStartDash', () => {
  test('nonfiction defaults to list', () => {
    expect(effectiveLineStartDash({ genre: 'nonfiction' })).toBe('list');
    expect(effectiveLineStartDash({ genre: 'nonfiction', typography: { lineStartDash: null } })).toBe('list');
  });

  test('fiction, fantasy and literary default to dialogue', () => {
    for (const genre of ['fiction', 'fantasy', 'literary']) {
      expect(effectiveLineStartDash({ genre, typography: { lineStartDash: null } })).toBe('dialogue');
    }
  });

  test('an explicit project setting wins over the genre', () => {
    expect(effectiveLineStartDash({ genre: 'nonfiction', typography: { lineStartDash: 'dialogue' } })).toBe('dialogue');
    expect(effectiveLineStartDash({ genre: 'fiction', typography: { lineStartDash: 'list' } })).toBe('list');
    expect(effectiveLineStartDash({ genre: 'nonfiction', typography: { lineStartDash: 'muu' } })).toBe('list');
  });

  test('a missing project or typography object gives dialogue', () => {
    expect(effectiveLineStartDash(undefined)).toBe('dialogue');
    expect(effectiveLineStartDash(null)).toBe('dialogue');
    expect(effectiveLineStartDash({})).toBe('dialogue');
    expect(effectiveLineStartDash({ genre: 'fiction' })).toBe('dialogue');
  });
});

describe('inputAction', () => {
  test('ignores everything when smart typing is off', () => {
    for (const key of ['"', "'", '-', ' ', '“']) {
      expect(inputAction('– ', 2, key, OFF)).toBe('ignore');
      expect(inputAction('sana', 4, key, null)).toBe('ignore');
    }
  });

  test('ignores a letter', () => {
    expect(inputAction('san', 3, 'a', ON)).toBe('ignore');
    expect(inputAction('san', 3, 'ä', ON)).toBe('ignore');
    expect(inputAction('san', 3, '.', ON)).toBe('ignore');
    // Pasted or dictated text is more than one character
    expect(inputAction('san', 3, '--', ON)).toBe('ignore');
    expect(inputAction('san', 3, '', ON)).toBe('ignore');
  });

  test('checks a straight quote, an apostrophe and a hyphen', () => {
    for (const key of ['"', "'", '-', '“', '„', '‘']) {
      expect(inputAction('Hän sanoi ', 10, key, ON)).toBe('check');
    }
  });

  test('ignores a space in the middle of a line', () => {
    expect(inputAction('Hän sanoi', 9, ' ', ON)).toBe('ignore');
    expect(inputAction('sana –', 6, ' ', ON)).toBe('ignore');
  });

  test('ignores a space after a line-start hyphen', () => {
    expect(inputAction('-', 1, ' ', ON)).toBe('ignore');
    expect(inputAction('  -', 3, ' ', ON)).toBe('ignore');
    // The retired per-project option changes nothing while typing
    expect(inputAction('-', 1, ' ', { enabled: true, lineStartDash: 'dialogue' })).toBe('ignore');
  });

  test('swallows a space typed right after a line-start "– "', () => {
    expect(inputAction('– ', 2, ' ', ON)).toBe('swallow');
    expect(inputAction('\t – ', 4, ' ', ON)).toBe('swallow');
    // Only right after the dash and its space, and only at the line start
    expect(inputAction('– Hei', 5, ' ', ON)).toBe('ignore');
    expect(inputAction('–', 1, ' ', ON)).toBe('ignore');
    expect(inputAction('sana – ', 7, ' ', ON)).toBe('ignore');
  });
});

describe('smartReplace', () => {
  test('Hän sanoi "Hei" becomes Hän sanoi ”Hei”', () => {
    expect(typed('Hän sanoi "Hei"')).toBe('Hän sanoi ”Hei”');
  });

  test("vaa'an becomes vaa’an", () => {
    expect(typed("vaa'an")).toBe('vaa’an');
  });

  test('Äiti sanoi "Älä" keeps ä and Ä and gets ” on both sides', () => {
    expect(typed('Äiti sanoi "Älä"')).toBe('Äiti sanoi ”Älä”');
    expect(typed('Åke sanoi "öisin"')).toBe('Åke sanoi ”öisin”');
  });

  test('sana -- sana becomes sana – sana', () => {
    const result = type('sana -- sana');
    expect(result.line).toBe('sana – sana');
    expect(result.rules).toEqual(['ajatusviiva']);
  });

  test('sana--sana becomes sana–sana', () => {
    expect(typed('sana--sana')).toBe('sana–sana');
  });

  test('2--3 becomes 2–3', () => {
    expect(typed('2--3')).toBe('2–3');
  });

  test('line-start --Hei becomes – Hei in both settings', () => {
    const plain = type('--Hei');
    expect(plain.line).toBe('– Hei');
    expect(plain.rules).toEqual(['vuorosanaviiva']);
    // The project setting steers the checker, not typing
    expect(typed('--Hei', { enabled: true, lineStartDash: 'list' })).toBe('– Hei');
    expect(typed('--Hei', { enabled: true, lineStartDash: 'dialogue' })).toBe('– Hei');
  });

  test('line-start -- Hei becomes – Hei with one space', () => {
    expect(typed('-- Hei')).toBe('– Hei');
  });

  test('an indented line-start -- keeps its indentation', () => {
    expect(typed('--Hei', ON, '  ')).toBe('  – Hei');
    expect(typed('-- Hei', ON, '\t')).toBe('\t– Hei');
  });

  test('-- before an existing space adds no second space', () => {
    // Caret at the start of " Hei"
    const result = type('--', ON, ' Hei', 0);
    expect(result.line).toBe('– Hei');
    expect(result.col).toBe(2);
    expect(smartReplace('-- Hei', 2, ON)).toEqual({ from: 0, to: 2, insert: '–', cursor: 2, rule: 'vuorosanaviiva' });
  });

  test('a single line-start "- " always stays a list', () => {
    expect(typed('- Hei')).toBe('- Hei');
    expect(typed('- maito', ON, '  ')).toBe('  - maito');
    expect(smartReplace('- ', 2, ON)).toBeNull();
    // Also with the project setting "Vuorosanaviiva"
    expect(typed('- Hei', { enabled: true, lineStartDash: 'dialogue' })).toBe('- Hei');
    expect(smartReplace('- ', 2, { enabled: true, lineStartDash: 'dialogue' })).toBeNull();
  });

  test('--- stays --- in both settings', () => {
    const result = type('---');
    expect(result.line).toBe('---');
    expect(result.col).toBe(3);
    expect(result.rules).toEqual(['vuorosanaviiva', 'kohtauksen-erotin']);
    expect(typed('---', { enabled: true, lineStartDash: 'dialogue' })).toBe('---');
    expect(typed('---', ON, '  ')).toBe('  ---');
    expect(typed('----')).toBe('----');
  });

  test('- - - stays - - -', () => {
    expect(typed('- - -')).toBe('- - -');
    expect(SCENE_BREAK.test(typed('- - -'))).toBe(true);
  });

  test('a single hyphen in maa-ala is not changed', () => {
    expect(typed('maa-ala')).toBe('maa-ala');
    expect(typed('maa- ja metsätalous')).toBe('maa- ja metsätalous');
    expect(smartReplace('maa-', 4, ON)).toBeNull();
  });

  test('nothing changes inside [TODO: tarkista "lainaus" -- lähde]', () => {
    const note = '[TODO: tarkista "lainaus" -- lähde]';
    expect(typed(note)).toBe(note);
    // Typing inside a note that is already closed
    expect(typed('"--', ON, 'a [TODO: x] b', 10)).toBe('a [TODO: x"--] b');
  });

  test('nothing changes inside an unclosed [TODO: ', () => {
    expect(typed('"lainaus" -- \'x\'', ON, 'alku [TODO: ')).toBe('alku [TODO: "lainaus" -- \'x\'');
  });

  test('a quote typed after a closed TODO note is converted', () => {
    expect(typed('"Hei"', ON, 'a [TODO: x] ')).toBe('a [TODO: x] ”Hei”');
  });

  test('a quote typed inside <u>…</u> text is converted and the tags are intact', () => {
    expect(typed('"', ON, '<u>sana</u>', 7)).toBe('<u>sana”</u>');
    expect(typed('"näin"', ON, '<u>sana</u>', 3)).toBe('<u>”näin”sana</u>');
    expect(typed(' "', ON, '<u>sana</u>')).toBe('<u>sana</u> ”');
  });

  test('“ and „ delivered by the system become ”', () => {
    expect(typed('“Hei“ ja „Hei„')).toBe('”Hei” ja ”Hei”');
    expect(typed('‘Hei‘')).toBe('’Hei’');
  });

  test('returns null for every input when enabled is false', () => {
    for (const [line, col] of [['"', 1], ["'", 1], ['--', 2], ['sana--', 6], ['– -', 3], ['“', 1]]) {
      expect(smartReplace(line, col, OFF)).toBeNull();
      expect(smartReplace(line, col, null)).toBeNull();
    }
    expect(typed('Hän sanoi "Hei" -- \'x\'', OFF)).toBe('Hän sanoi "Hei" -- \'x\'');
  });

  test('the returned cursor is right after the inserted mark', () => {
    expect(smartReplace('Hän "', 5, ON)).toEqual({ from: 4, to: 5, insert: '”', cursor: 5, rule: 'lainausmerkki' });
    expect(smartReplace("vaa'", 4, ON)).toEqual({ from: 3, to: 4, insert: '’', cursor: 4, rule: 'heittomerkki' });
    expect(smartReplace('sana--', 6, ON)).toEqual({ from: 4, to: 6, insert: '–', cursor: 5, rule: 'ajatusviiva' });
    expect(smartReplace('--', 2, ON)).toEqual({ from: 0, to: 2, insert: '– ', cursor: 2, rule: 'vuorosanaviiva' });
    expect(smartReplace('  – -', 5, ON)).toEqual({ from: 2, to: 5, insert: '---', cursor: 5, rule: 'kohtauksen-erotin' });
    // A mark typed in the middle of a line: the caret stays between the mark and the rest
    expect(type('"', ON, 'ab', 1)).toEqual({ line: 'a”b', col: 2, rules: ['lainausmerkki'] });
  });

  test('three typed dots stay three dots', () => {
    expect(typed('Hän odotti...')).toBe('Hän odotti...');
  });

  test('a mark typed inside a web address stays as typed, as the checker leaves it (I-06 review)', () => {
    // An apostrophe and "--" inside an address are part of it
    expect(typed("Katso www.x.fi/'b' ja https://esim.fi/?q=a--b tästä.")).toBe("Katso www.x.fi/'b' ja https://esim.fi/?q=a--b tästä.");
    expect(rulesOf("Katso www.x.fi/'b ja https://esim.fi/?q=a--b tästä.")).toEqual([]);
    // A quotation mark is never part of an address: around one it is converted, as the checker asks
    expect(typed('Osoite "https://esim.fi/a" tässä.')).toBe('Osoite ”https://esim.fi/a” tässä.');
    expect(typed('Osoite https://esim.fi/"a"')).toBe('Osoite https://esim.fi/”a”');
    // After the address, prose again
    expect(typed("www.x.fi -- ja vaa'n")).toBe('www.x.fi – ja vaa’n');
  });

  test('a caret outside the line gives null', () => {
    expect(smartReplace('"', 0, ON)).toBeNull();
    expect(smartReplace('"', 5, ON)).toBeNull();
    expect(smartReplace('', 1, ON)).toBeNull();
  });
});

describe('toFinnishTypography', () => {
  test('converts straight and English quotes to ”', () => {
    expect(toFinnishTypography('Hän sanoi "Hei" ja “moi” ja „terve‟.')).toBe('Hän sanoi ”Hei” ja ”moi” ja ”terve”.');
  });

  test("converts ' to ’", () => {
    expect(toFinnishTypography("vaa'an ‘kieli‚")).toBe('vaa’an ’kieli’');
  });

  test('converts " - " between words to " – " and leaves a line-start "- " alone', () => {
    expect(toFinnishTypography('Minä - siis me - tulimme.')).toBe('Minä – siis me – tulimme.');
    expect(toFinnishTypography(`Minä${NBSP}-${NBSP}siis`)).toBe(`Minä${NBSP}–${NBSP}siis`);
    expect(toFinnishTypography('- maito - kevyt')).toBe('- maito – kevyt');
    expect(toFinnishTypography('  - sisennetty kohta')).toBe('  - sisennetty kohta');
    expect(toFinnishTypography('maa- ja metsätalous, New York -tyylinen')).toBe('maa- ja metsätalous, New York -tyylinen');
  });

  test('converts a spaced and an unspaced em dash to a spaced en dash', () => {
    expect(toFinnishTypography('sana — sana')).toBe('sana – sana');
    expect(toFinnishTypography('sana—sana')).toBe('sana – sana');
    expect(toFinnishTypography('— Hei')).toBe('– Hei');
    expect(toFinnishTypography('—Hei')).toBe('– Hei');
  });

  test('converts exactly two hyphens, and at a line start adds one space', () => {
    expect(toFinnishTypography('sana -- sana')).toBe('sana – sana');
    expect(toFinnishTypography('2--3')).toBe('2–3');
    expect(toFinnishTypography('--Hei')).toBe('– Hei');
    expect(toFinnishTypography('--   Hei')).toBe('– Hei');
    expect(toFinnishTypography('a---b ja ----')).toBe('a---b ja ----');
  });

  test('leaves [TODO: "x" - y] and <u> tags untouched', () => {
    expect(toFinnishTypography('[TODO: "x" - y] <u>"a"</u> "b"')).toBe('[TODO: "x" - y] <u>”a”</u> ”b”');
    expect(toFinnishTypography('alku [TODO: "auki" -- vielä')).toBe('alku [TODO: "auki" -- vielä');
    expect(toFinnishTypography('⟦1⟧ "a" ⟦2⟧b⟦/2⟧')).toBe('⟦1⟧ ”a” ⟦2⟧b⟦/2⟧');
  });

  test('leaves scene breaks alone', () => {
    for (const line of ['- - -', '---', '* * *']) expect(toFinnishTypography(line)).toBe(line);
  });

  test('is idempotent', () => {
    const samples = [
      'Hän sanoi "Hei" ja “moi” - sitten -- lähti—pois — nyt',
      '--Hei', '-- Hei', '--', '— Hei', '—', "it's", '- kohta - toinen', '  --Hei',
      '[TODO: "x" - y] "b" -- c', 'sana—', 'a\n--b\n- c - d\n\n"e"',
      // A hyphen right beside an em dash: the dash brings a space to that side
      'a—- b', 'x -— y', '—- a', 'sana —- sana', 'a -—b', 'a—-— b', 'a —-', '-— a'
    ];
    for (const sample of samples) {
      const once = toFinnishTypography(sample);
      expect([sample, toFinnishTypography(once)]).toEqual([sample, once]);
    }
    expect(toFinnishTypography('a—- b')).toBe('a – – b');
    expect(toFinnishTypography('x -— y')).toBe('x – – y');
    expect(toFinnishTypography('sana —- sana')).toBe('sana – – sana');
    // Only a gap or an em dash counts: a hyphen that touches a letter stays
    expect(toFinnishTypography('a—-b')).toBe('a – -b');
    expect(toFinnishTypography('-— a')).toBe('- – a');
  });

  test('keeps the number of lines', () => {
    const text = 'Eka "rivi"\n\n-- toka\n\n\n- kolmas - rivi\n';
    const out = toFinnishTypography(text);
    expect(out.split('\n')).toHaveLength(text.split('\n').length);
    expect(out).toBe('Eka ”rivi”\n\n– toka\n\n\n- kolmas – rivi\n');
  });

  test('empty input and CRLF line ends', () => {
    expect(toFinnishTypography('')).toBe('');
    expect(toFinnishTypography(undefined)).toBe('');
    expect(toFinnishTypography('a "b"\r\n-- c\r\n')).toBe('a ”b”\r\n– c\r\n');
  });
});

describe('normaliseModelText', () => {
  test('restores ” and – when the model returns straight quotes and a hyphen', () => {
    expect(normaliseModelText('Hän sanoi: "Tule tänne" - ja lähti pois.', 'Hän sanoi: ”Tule tänne” – ja lähti.'))
      .toBe('Hän sanoi: ”Tule tänne” – ja lähti pois.');
  });

  test('keeps the original\'s straight quotes when the model returns ” for them', () => {
    expect(normaliseModelText('”Hei”, hän sanoi.', '"Hei", hän sanoi.')).toBe('"Hei", hän sanoi.');
    // The same for a hyphen used as a dash, a number range and three dots: the checker's job
    expect(normaliseModelText('Hän avasi laatikon – sen saman.', 'Hän avasi laatikon - sen saman.')).toBe('Hän avasi laatikon - sen saman.');
    expect(normaliseModelText('Vuosina 1867–1868 oli nälkä…', 'Vuosina 1867-1868 oli nälkä...')).toBe('Vuosina 1867-1868 oli nälkä...');
  });

  test('gives new tokens Finnish typography', () => {
    expect(normaliseModelText('Hän sanoi, että "tulee".', 'Hän sanoi että tulee.')).toBe('Hän sanoi, että ”tulee”.');
    expect(normaliseModelText('Hän tuli - kai - kotiin.', 'Hän tuli kotiin.')).toBe('Hän tuli – kai – kotiin.');
    expect(normaliseModelText('Hän tuli -- kai.', 'Hän tuli.')).toBe('Hän tuli – kai.');
    // A line-start hyphen of the model is a list marker, not a dash
    expect(normaliseModelText('- uusi kohta', 'vanha kohta')).toBe('- uusi kohta');
  });

  test('keeps a space the model adds before a per cent sign', () => {
    expect(normaliseModelText('Kyselyn mukaan 62 % vastasi.', 'Kyselyn mukaan 62% vastasi.')).toBe('Kyselyn mukaan 62 % vastasi.');
  });

  test('returns the original for an NFD original and an NFC model answer', () => {
    const original = 'A\u0308iti ja o\u0308inen ta\u0308hti';
    expect(original).not.toBe(original.normalize('NFC'));
    expect(normaliseModelText(original.normalize('NFC'), original)).toBe(original);
    // An NFD answer is brought to NFC before anything else
    expect(normaliseModelText('ta\u0308hti')).toBe('tähti');
  });

  test('keeps an NBSP of the original', () => {
    const original = `Hinta nousi 11${NBSP}%.`;
    expect(normaliseModelText('Hinta nousi 11 %.', original)).toBe(original);
  });

  test('keeps the original\'s leading and trailing whitespace', () => {
    expect(normaliseModelText('Hän tuli, kun ehti.', '  Hän tuli kun ehti. \t')).toBe('  Hän tuli, kun ehti. \t');
    expect(normaliseModelText('  Hän tuli.  ', 'Hän tuli.')).toBe('Hän tuli.');
    expect(normaliseModelText('', '  sana ')).toBe('   ');
    expect(normaliseModelText('sana', '')).toBe('sana');
  });

  test('falls back to toFinnishTypography when line counts differ', () => {
    expect(normaliseModelText('Eka "rivi"\nToka - rivi', 'Eka "rivi" Toka - rivi')).toBe('Eka ”rivi”\nToka – rivi');
    expect(normaliseModelText('Hän sanoi "Hei" -- nyt.')).toBe('Hän sanoi ”Hei” – nyt.');
  });

  test('a line pair too long to align falls back to toFinnishTypography', () => {
    // 3 000 × 3 000 tokens is over the 4 000 000 cells of the alignment table
    const original = Array.from({ length: 3000 }, (unused, index) => `"sana${index}"`).join(' ');
    const model = original.replace('"sana7"', '"sanat7"');
    const started = Date.now();
    const out = normaliseModelText(model, original);
    expect(Date.now() - started).toBeLessThan(2000);
    // No alignment: the straight quotes of the original are not written back
    expect(out).toBe(toFinnishTypography(model));
    expect(out.startsWith('”sana0” ”sana1”')).toBe(true);
    // Just under the limit the tokens are aligned and the original's marks stay
    const shorter = Array.from({ length: 2000 }, (unused, index) => `"sana${index}"`).join(' ');
    const aligned = normaliseModelText(shorter.replace('"sana7"', '"sanat7"'), shorter);
    expect(aligned).toBe(shorter.replace('"sana7"', '”sanat7”'));
  });

  test('pairs the lines of a multi-line text and keeps the line ends of the original', () => {
    expect(normaliseModelText('"Eka", hän sanoi.\r\nToka rivi on pitkä.', '”Eka”, hän sanoi.\nToka rivi on.'))
      .toBe('”Eka”, hän sanoi.\nToka rivi on pitkä.');
  });

  test('never changes a TODO note or a mask placeholder', () => {
    const original = 'Juna lähti [TODO: tarkista "aika" - ehkä 6] ja ⟦1⟧ <u>vaunu</u> oli tyhjä.';
    expect(normaliseModelText(original, original)).toBe(original);
    // The note and the placeholders are new to the original: they are still written as the model gave them
    expect(normaliseModelText('Juna [TODO: "x" - y] ⟦2⟧ "lähti" ⟦/2⟧.', 'Juna lähti.'))
      .toBe('Juna [TODO: "x" - y] ⟦2⟧ ”lähti” ⟦/2⟧.');
  });
});

describe('checkTypography', () => {
  test('suora-lainausmerkki: Hän sanoi "Hei".', () => {
    const findings = checkTypography('Hän sanoi "Hei".');
    expect(findings.map(f => [f.ruleId, f.from, f.to, f.quote])).toEqual([
      ['suora-lainausmerkki', 10, 11, '"'],
      ['suora-lainausmerkki', 14, 15, '"']
    ]);
    expect(findings[0]).toEqual({
      id: 'suora-lainausmerkki@10',
      ruleId: 'suora-lainausmerkki',
      level: 'normi',
      line: 1,
      from: 10,
      to: 11,
      quote: '"',
      message: TYPOGRAPHY_RULES['suora-lainausmerkki'].message,
      url: 'https://www.kielitoimistonohjepankki.fi/ohje/lainausmerkit/',
      fix: { from: 10, to: 11, insert: '”' }
    });
    expect(rulesOf('Hän sanoi ”Hei”.')).toEqual([]);
  });

  test('vieras-lainausmerkki: “Hei”, and »Hei» is accepted', () => {
    expect(findingsOf('“Hei” ja „Hei‟', 'vieras-lainausmerkki').map(f => [f.from, f.fix.insert]))
      .toEqual([[0, '”'], [9, '”'], [13, '”']]);
    expect(rulesOf('»Hei» ja «Hei»')).toEqual([]);
  });

  test("suora-heittomerkki: vaa'an", () => {
    expect(findingsOf("vaa'an", 'suora-heittomerkki').map(f => f.fix)).toEqual([{ from: 3, to: 4, insert: '’' }]);
    expect(fixed("vaa'an ja ‘sana‘, rock´n ja rock`n")).toBe('vaa’an ja ’sana’, rock’n ja rock’n');
    // An accent or a backtick that is not between two letters is left alone
    expect(rulesOf('vaa’an, ´ yksin ja `koodi`')).toEqual([]);
  });

  test('kaksi-yhdysmerkkia: mid-line and line-start, --- is not flagged', () => {
    expect(findingsOf('sana -- sana', 'kaksi-yhdysmerkkia').map(f => f.fix)).toEqual([{ from: 5, to: 7, insert: '–' }]);
    expect(findingsOf('--Hei', 'kaksi-yhdysmerkkia').map(f => f.fix)).toEqual([{ from: 0, to: 2, insert: '– ' }]);
    expect(findingsOf('  --  Hei', 'kaksi-yhdysmerkkia').map(f => [f.from, f.to, f.fix])).toEqual([[2, 4, { from: 2, to: 6, insert: '– ' }]]);
    expect(fixed('  --  Hei -- nyt')).toBe('  – Hei – nyt');
    expect(rulesOf('---')).toEqual([]);
    expect(rulesOf('a---b ja ----')).toEqual([]);
  });

  test('yhdysmerkki-ajatusviivana: Minä - siis me - tulimme. gives two findings; maa- ja metsätalous and New York -tyylinen give none', () => {
    const findings = findingsOf('Minä - siis me - tulimme.', 'yhdysmerkki-ajatusviivana');
    expect(findings.map(f => f.from)).toEqual([5, 15]);
    expect(fixed('Minä - siis me - tulimme.')).toBe('Minä – siis me – tulimme.');
    expect(fixed('Mutta minä -')).toBe('Mutta minä –');
    expect(rulesOf('maa- ja metsätalous')).toEqual([]);
    expect(rulesOf('New York -tyylinen')).toEqual([]);
    expect(rulesOf('  - sisennetty luettelo', { lineStartDash: 'list' })).toEqual([]);
  });

  test('ajatusviivan-valit: sana– sana and sana –sana; Helsinki–Tampere and oli –5 astetta give none', () => {
    const before = findingsOf('sana– sana', 'ajatusviivan-valit');
    expect(before.map(f => [f.level, f.from, f.to, f.fix])).toEqual([['suositus', 4, 5, { from: 4, to: 4, insert: ' ' }]]);
    const after = findingsOf('sana –sana', 'ajatusviivan-valit');
    expect(after.map(f => [f.from, f.to, f.fix])).toEqual([[5, 6, { from: 6, to: 6, insert: ' ' }]]);
    expect(fixed('sana– sana ja sana –sana')).toBe('sana – sana ja sana – sana');
    expect(rulesOf('Helsinki–Tampere')).toEqual([]);
    expect(rulesOf('1939–1945')).toEqual([]);
    expect(rulesOf('oli –5 astetta')).toEqual([]);
    expect(rulesOf('sana – sana')).toEqual([]);
    expect(rulesOf('– Hei')).toEqual([]);
  });

  test('vuorosanaviivan-vali: –Hei, sanoi Pekka.', () => {
    expect(findingsOf('–Hei, sanoi Pekka.', 'vuorosanaviivan-vali').map(f => [f.from, f.to, f.fix]))
      .toEqual([[0, 1, { from: 1, to: 1, insert: ' ' }]]);
    expect(fixed('  –Niin')).toBe('  – Niin');
    expect(rulesOf('– Hei, sanoi Pekka.')).toEqual([]);
    expect(rulesOf('–5 astetta')).toEqual([]);
  });

  test('lukuvali-yhdysmerkki: every positive and negative sample listed for the rule in 3.1', () => {
    const hits = (line) => findingsOf(line, 'lukuvali-yhdysmerkki').map(f => f.quote);
    expect(hits('vuosina 1939-1945 sota')).toEqual(['1939-1945']);
    expect(hits('s. 15-20.')).toEqual(['15-20']);
    expect(hits('2-3 kertaa')).toEqual(['2-3']);
    expect(hits('kello 9-12')).toEqual(['9-12']);
    expect(fixed('vuosina 1939-1945, s. 15-20.')).toBe('vuosina 1939–1945, s. 15–20.');

    for (const line of ['tulos 3-2', '050-1234567', '978-951-0-12345-6', '2026-11-16', '1,2-3,5',
      'klo 8.30-16.00', '20-29-vuotiaat', '5-vuotias', '10.6.-14.7.', '100-50', '1939–1945']) {
      expect(hits(line)).toEqual([]);
    }
  });

  test('prosentti-vali: 11%, 25%:n, 0,5‰; 11 % and a URL give none', () => {
    expect(findingsOf('noussut 11% vuodessa', 'prosentti-vali').map(f => [f.quote, f.fix]))
      .toEqual([['11%', { from: 10, to: 10, insert: ' ' }]]);
    expect(fixed('11%, 25%:n alennus ja 0,5‰')).toBe('11 %, 25 %:n alennus ja 0,5 ‰');
    expect(rulesOf('11 %')).toEqual([]);
    expect(rulesOf(`11${NBSP}%`)).toEqual([]);
    expect(rulesOf('http://x.fi/a%20b ja https://y.fi/50%')).toEqual([]);
    expect(rulesOf('www.x.fi/100%')).toEqual([]);
  });

  test('paivays-muoto: 16. 11. 2026 → 16.11.2026, 01.05.2026 → 1.5.2026, 32.1.2020 gives none', () => {
    expect(findingsOf('Se oli 16. 11. 2026 illalla', 'paivays-muoto').map(f => [f.quote, f.fix]))
      .toEqual([['16. 11. 2026', { from: 7, to: 19, insert: '16.11.2026' }]]);
    expect(fixed('01.05.2026 ja 03. 04. 1999')).toBe('1.5.2026 ja 3.4.1999');
    for (const line of ['32.1.2020', '1.13.2020', '16.11.2026', 'versio 1.4.2025', 'luku 3.4.20255']) {
      expect(rulesOf(line)).toEqual([]);
    }
  });

  test('paivays-jarjestyspiste: 16 marraskuuta 2026; vuoden 2025 marraskuuta gives none', () => {
    expect(findingsOf('Hän tuli 16 marraskuuta 2026.', 'paivays-jarjestyspiste').map(f => [f.quote, f.fix]))
      .toEqual([['16 marraskuuta', { from: 11, to: 11, insert: '.' }]]);
    expect(fixed('Välillä 3 toukokuuta ja 24 joulukuuta')).toBe('Välillä 3. toukokuuta ja 24. joulukuuta');
    expect(rulesOf('vuoden 2025 marraskuuta')).toEqual([]);
    expect(rulesOf('16. marraskuuta')).toEqual([]);
    expect(rulesOf('kolme toukokuuta')).toEqual([]);
  });

  test('paivays-jarjestyspiste at the start of a line is listed without a fix: the full stop would make the line a numbered list (I-06 review)', () => {
    const { splitBlocks } = require('../../src/editor/blocks');
    const { parseBlocks } = require('../../utils/manuscript');
    // What the fix would have written is item 1 of a numbered list, in the editor and in every export
    // (the day number is lost: the export numbers the item itself)
    expect(splitBlocks('16. marraskuuta oli kylmä.')[0]).toMatchObject({ kind: 'list', ordered: true });
    expect(parseBlocks('16. marraskuuta oli kylmä.')).toEqual([{ type: 'list', ordered: true, items: [[{ text: 'marraskuuta oli kylmä.' }]] }]);

    for (const line of ['16 marraskuuta oli kylmä.', '  3 toukokuuta alkoi sade.']) {
      const findings = findingsOf(line, 'paivays-jarjestyspiste');
      expect(findings).toHaveLength(1);
      expect(findings[0].fix).toBeNull();
      // Neither "Ehdota kaikki korjaukset" nor the finding's own Ehdota can propose it
      expect(fixesFor(checkTypography(line), { levels: ['normi', 'suositus'] })).toEqual([]);
    }
    // Later in the line the fix stays, and so does the next line's
    expect(fixed('3 toukokuuta ja 24 joulukuuta')).toBe('3 toukokuuta ja 24. joulukuuta');
    const text = 'Ensin.\n16 marraskuuta oli kylmä, 17 marraskuuta lämmin.';
    const changes = fixesFor(checkTypography(text));
    expect(apply(text, changes)).toBe('Ensin.\n16 marraskuuta oli kylmä, 17. marraskuuta lämmin.');
    expect(splitBlocks(apply(text, changes)).map(block => block.kind)).toEqual(['paragraph', 'paragraph']);
  });

  test('kellonaika-kaksoispiste: kello 16:30, klo 9:15; Joh. 3:16 and kello 25:99 give none', () => {
    expect(findingsOf('kello 16:30 alkaen', 'kellonaika-kaksoispiste').map(f => [f.level, f.quote, f.fix]))
      .toEqual([['suositus', '16:30', { from: 8, to: 9, insert: '.' }]]);
    expect(fixed('Kello 16:30 ja klo 9:15')).toBe('Kello 16.30 ja klo 9.15');
    for (const line of ['Joh. 3:16', 'kello 25:99', 'kello 8:05:30', 'kello 16.30', 'suhde 3:16']) {
      expect(rulesOf(line)).toEqual([]);
    }
  });

  test('rivin-alun-viiva: a "- Hei, sanoi Pekka." line is a question with fix: null and a convert change', () => {
    const findings = checkTypography('- Hei, sanoi Pekka.');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: 'rivin-alun-viiva@0',
      ruleId: 'rivin-alun-viiva',
      level: 'kysymys',
      from: 0,
      to: 2,
      quote: '- ',
      fix: null,
      convert: { from: 0, to: 2, insert: '– ' }
    });
    // The default reading is dialogue, also without options
    expect(rulesOf('- Hei', undefined)).toEqual(['rivin-alun-viiva']);
    expect(rulesOf('- Hei', { lineStartDash: 'dialogue' })).toEqual(['rivin-alun-viiva']);
    expect(rulesOf('-ei väliä')).toEqual([]);
    expect(rulesOf('* kohta')).toEqual([]);
  });

  test('with lineStartDash list a "- " line is a list and no question is asked', () => {
    expect(checkTypography('- maito\n- leipä\n  - voi', { lineStartDash: 'list' })).toEqual([]);
    // Other rules still run on a list line
    expect(rulesOf('- "maito"', { lineStartDash: 'list' })).toEqual(['suora-lainausmerkki', 'suora-lainausmerkki']);
  });

  test('three dots are flagged as a recommendation with the fix …', () => {
    const findings = checkTypography('Hän odotti... ja lähti.');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: 'kolme-pistetta@10',
      ruleId: 'kolme-pistetta',
      level: 'suositus',
      from: 10,
      to: 13,
      quote: '...',
      fix: { from: 10, to: 13, insert: '…' }
    });
    expect(fixed('Hän odotti... ja lähti.')).toBe('Hän odotti… ja lähti.');
  });

  test('four dots, and dots inside a [TODO: …] note, are not flagged', () => {
    expect(rulesOf('Hän odotti.... ja lähti.')).toEqual([]);
    expect(rulesOf('Hän odotti [TODO: jatka...] ja lähti.')).toEqual([]);
    expect(rulesOf('Hän odotti… ja lähti.')).toEqual([]);
  });

  test('nothing inside a web address is flagged', () => {
    // "--", an apostrophe, a number range, a date and three dots that are part of an address
    expect(rulesOf('Osoite on http://esimerkki.fi/polku-tässä--ja-lisää?x=100%25')).toEqual([]);
    expect(rulesOf("Katso https://x.fi/it's-2019-2020/01.05.2026/a...b")).toEqual([]);
    expect(rulesOf('Katso www.esimerkki.fi/2019-2020--a')).toEqual([]);
    expect(fixed('Osoite on http://esimerkki.fi/a--b ja www.x.fi/1-2.')).toBe('Osoite on http://esimerkki.fi/a--b ja www.x.fi/1-2.');

    // The prose around the address is still checked: quotation marks around it, text after it
    const around = 'Hän kirjoitti "http://esimerkki.fi/a--b" seinään -- ja s. 15-20.';
    expect(rulesOf(around)).toEqual(['suora-lainausmerkki', 'suora-lainausmerkki', 'kaksi-yhdysmerkkia', 'lukuvali-yhdysmerkki']);
    expect(fixed(around)).toBe('Hän kirjoitti ”http://esimerkki.fi/a--b” seinään – ja s. 15–20.');
    // Punctuation after an address belongs to the sentence
    expect(rulesOf('Katso www.x.fi/a...')).toEqual(['kolme-pistetta']);
    // A word that only looks like one is prose
    expect(rulesOf('awww.x--y')).toEqual(['kaksi-yhdysmerkkia']);
    // A line-start "- " before an address is still asked about
    expect(rulesOf('- http://x.fi/a--b')).toEqual(['rivin-alun-viiva']);
  });

  test('findings inside [TODO: …] are dropped', () => {
    expect(rulesOf('Hän tuli [TODO: tarkista "lainaus" -- 11% - kello 16:30] kotiin.')).toEqual([]);
    expect(rulesOf('Hän tuli [TODO: auki "lainaus" -- 11%')).toEqual([]);
    // Outside the note the same marks are flagged
    expect(rulesOf('"a" [TODO: "b"] "c"')).toEqual(Array(4).fill('suora-lainausmerkki'));
    expect(rulesOf('⟦1⟧ ja <u>sana</u>')).toEqual([]);
  });

  test('scene breaks * * *, --- and - - - produce nothing', () => {
    expect(checkTypography('* * *\n---\n- - -\n___')).toEqual([]);
  });

  test('headings are checked like other lines', () => {
    expect(rulesOf('# Luku "yksi"')).toEqual(['suora-lainausmerkki', 'suora-lainausmerkki']);
    expect(rulesOf('> Lainaus -- pitkä')).toEqual(['kaksi-yhdysmerkkia']);
  });

  test('every finding has a message and an https URL from the rule table', () => {
    const text = [
      'Hän sanoi "Hei" ja “moi”, vaa\'an -- kai.',
      '–Niin, sanoi Pekka - siis hän.',
      'Vuosina 1939-1945 hinta nousi 11%, sana– sana.',
      'Se oli 16. 11. 2026, siis 16 marraskuuta kello 16:30...',
      '- Hei, sanoi Pekka.'
    ].join('\n');
    const findings = checkTypography(text);
    expect(new Set(findings.map(f => f.ruleId)).size).toBe(14);
    for (const finding of findings) {
      const info = TYPOGRAPHY_RULES[finding.ruleId];
      expect(finding.message).toBe(info.message);
      expect(finding.url).toBe(info.url);
      expect(finding.url.startsWith('https://')).toBe(true);
      expect(finding.level).toBe(info.level);
      expect(finding.id).toBe(`${finding.ruleId}@${finding.from}`);
      expect(finding.quote).toBe(text.slice(finding.from, finding.to));
    }
    // Reading order
    expect(findings.map(f => f.from)).toEqual([...findings.map(f => f.from)].sort((a, b) => a - b));
  });

  test('offsets are correct on the third line of a text with ä, ö and å before the finding', () => {
    const text = 'Äiti söi åtta päärynää.\n\nYöllä hän sanoi "näin".';
    const findings = checkTypography(text);
    expect(findings.map(f => [f.line, f.from])).toEqual([[3, 41], [3, 46]]);
    expect(findings.map(f => text.slice(f.from, f.to))).toEqual(['"', '"']);
    expect(apply(text, fixesFor(findings))).toBe('Äiti söi åtta päärynää.\n\nYöllä hän sanoi ”näin”.');
  });

  test('returns nothing for language: \'en\'', () => {
    expect(checkTypography('He said "hi" -- twice, 11%.', { language: 'en' })).toEqual([]);
    expect(checkTypography('He said "hi".', { language: 'fi' })).toHaveLength(2);
  });

  test('empty input and CRLF text', () => {
    expect(checkTypography('')).toEqual([]);
    expect(checkTypography(undefined)).toEqual([]);
    const text = 'Eka rivi.\r\nMutta minä -\r\n"Toka".';
    const findings = checkTypography(text);
    expect(findings.map(f => [f.ruleId, f.line, text.slice(f.from, f.to)])).toEqual([
      ['yhdysmerkki-ajatusviivana', 2, '-'],
      ['suora-lainausmerkki', 3, '"'],
      ['suora-lainausmerkki', 3, '"']
    ]);
    expect(apply(text, fixesFor(findings))).toBe('Eka rivi.\r\nMutta minä –\r\n”Toka”.');
  });
});

describe('fixesFor, dashLineChanges', () => {
  const SAMPLE = [
    '# Luku "yksi"',
    'Hän sanoi "Hei" ja lähti -- kai.',
    '–Niin, sanoi Pekka.',
    'Minä - siis me - tulimme vuosina 1939-1945.',
    'Hinta nousi 11% eli 0,5‰.',
    'Se tapahtui 16. 11. 2026 ja 01.05.2026, siis 16 marraskuuta.',
    'Tapaaminen on kello 16:30 tai klo 9:15...',
    'Äidin vaa\'an “kieli” oli jäykkä.',
    'sana– sana ja sana –sana',
    '',
    '* * *',
    '',
    '[TODO: tarkista "lainaus" -- lähde] jäi ennalleen.'
  ].join('\n');

  test('fixes are ascending and do not overlap', () => {
    const changes = fixesFor(checkTypography(SAMPLE), { levels: ['normi', 'suositus'] });
    expect(changes.length).toBeGreaterThan(15);
    for (let i = 1; i < changes.length; i++) {
      expect(changes[i].from).toBeGreaterThanOrEqual(changes[i - 1].to);
    }
    // Findings handed over in any order still come out ascending
    const shuffled = [...checkTypography(SAMPLE)].reverse();
    expect(fixesFor(shuffled, { levels: ['normi', 'suositus'] })).toEqual(changes);
    // Two fixes on the same characters: the earlier one stays
    const clash = [
      { ruleId: 'a', level: 'normi', fix: { from: 2, to: 6, insert: 'x' } },
      { ruleId: 'b', level: 'normi', fix: { from: 4, to: 8, insert: 'y' } },
      { ruleId: 'c', level: 'normi', fix: { from: 6, to: 7, insert: 'z' } }
    ];
    expect(fixesFor(clash).map(change => change.meta.ruleId)).toEqual(['a', 'c']);
  });

  test('a \'kysymys\' finding never yields a fix, even with levels: [\'kysymys\']', () => {
    const findings = checkTypography('- Hei, sanoi Pekka.');
    expect(fixesFor(findings, { levels: ['kysymys'] })).toEqual([]);
    expect(fixesFor(findings, { levels: ['normi', 'suositus', 'kysymys'] })).toEqual([]);
    // Not even when someone hands in a question that carries a fix
    const forged = [{ ...findings[0], fix: findings[0].convert }];
    expect(fixesFor(forged, { levels: ['kysymys'] })).toEqual([]);
  });

  test('fixesFor leaves recommendations out unless levels lists them', () => {
    const text = 'Hän sanoi "Hei" kello 16:30... sana– sana';
    const findings = checkTypography(text);
    expect(apply(text, fixesFor(findings))).toBe('Hän sanoi ”Hei” kello 16:30... sana– sana');
    expect(fixesFor(findings).map(change => change.meta.ruleId)).toEqual(['suora-lainausmerkki', 'suora-lainausmerkki']);
    expect(apply(text, fixesFor(findings, { levels: ['normi', 'suositus'] }))).toBe('Hän sanoi ”Hei” kello 16.30… sana – sana');
    expect(apply(text, fixesFor(findings, { levels: ['suositus'] }))).toBe('Hän sanoi "Hei" kello 16.30… sana – sana');
    expect(fixesFor(findings, { levels: [] })).toEqual([]);
    expect(fixesFor([])).toEqual([]);
  });

  test('every fix carries source local and action typography', () => {
    const changes = fixesFor(checkTypography(SAMPLE), { levels: ['normi', 'suositus'] });
    for (const change of changes) {
      expect(Object.keys(change).sort()).toEqual(['from', 'insert', 'meta', 'to']);
      expect(Object.keys(change.meta).sort()).toEqual(['action', 'ruleId', 'source']);
      expect(change.meta.source).toBe('local');
      expect(change.meta.action).toBe('typography');
      expect(TYPOGRAPHY_RULES[change.meta.ruleId]).toBeDefined();
    }
    expect(dashLineChanges('- Hei')).toEqual([
      { from: 0, to: 2, insert: '– ', meta: { source: 'local', action: 'typography', ruleId: 'rivin-alun-viiva' } }
    ]);
  });

  test('applying all fixes to the planted-error sample gives the expected clean text', () => {
    expect(fixed(SAMPLE)).toBe([
      '# Luku ”yksi”',
      'Hän sanoi ”Hei” ja lähti – kai.',
      '– Niin, sanoi Pekka.',
      'Minä – siis me – tulimme vuosina 1939–1945.',
      'Hinta nousi 11 % eli 0,5 ‰.',
      'Se tapahtui 16.11.2026 ja 1.5.2026, siis 16. marraskuuta.',
      'Tapaaminen on kello 16.30 tai klo 9.15…',
      'Äidin vaa’an ”kieli” oli jäykkä.',
      'sana – sana ja sana – sana',
      '',
      '* * *',
      '',
      '[TODO: tarkista "lainaus" -- lähde] jäi ennalleen.'
    ].join('\n'));
    // A clean text has nothing left to fix
    expect(checkTypography(fixed(SAMPLE))).toEqual([]);
  });

  test('dashLineChanges converts every "- " line and keeps indentation', () => {
    const text = '- Hei, sanoi Pekka.\nKerrontaa välissä.\n  -   Niin, sanoi Liisa.\n– Jo valmis.\n- - -\n-ei väliä';
    const changes = dashLineChanges(text);
    expect(changes.map(change => [change.from, change.to, change.insert])).toEqual([[0, 2, '– '], [41, 45, '– ']]);
    expect(apply(text, changes)).toBe('– Hei, sanoi Pekka.\nKerrontaa välissä.\n  – Niin, sanoi Liisa.\n– Jo valmis.\n- - -\n-ei väliä');
    expect(dashLineChanges('')).toEqual([]);
  });

  test('countDashLines ignores scene breaks', () => {
    expect(countDashLines('- yksi\n- - -\n---\n- kaksi\n* * *\n* kolme\n– neljä')).toBe(2);
    expect(countDashLines('- - -')).toBe(0);
    expect(countDashLines('')).toBe(0);
  });
});

describe('isDialogueLine, quoteSpans', () => {
  test('– Hei and — Hei are dialogue lines, - Hei is not', () => {
    expect(isDialogueLine('– Hei')).toBe(true);
    expect(isDialogueLine('— Hei')).toBe(true);
    expect(isDialogueLine('  –Hei')).toBe(true);
    expect(isDialogueLine('- Hei')).toBe(false);
    expect(isDialogueLine('Hän sanoi – hei')).toBe(false);
    expect(isDialogueLine('')).toBe(false);
  });

  test('quoteSpans(\'Hän sanoi ”tule” ja ”mene”.\') gives two spans', () => {
    const line = 'Hän sanoi ”tule” ja ”mene”.';
    expect(quoteSpans(line)).toEqual([[10, 16], [20, 26]]);
    expect(quoteSpans(line).map(([from, to]) => line.slice(from, to))).toEqual(['”tule”', '”mene”']);
    expect(quoteSpans('Hän sanoi "a" ja »b» ja “c”.')).toEqual([[10, 13], [17, 20], [24, 27]]);
    expect(quoteSpans('Ei lainauksia.')).toEqual([]);
  });

  test('an unpaired quote runs to the end of the line', () => {
    expect(quoteSpans('Hän sanoi ”tule ja mene.')).toEqual([[10, 24]]);
    expect(quoteSpans('”a” ja ”b')).toEqual([[0, 3], [7, 9]]);
  });

  test('quotation marks inside a note do not open a span', () => {
    expect(quoteSpans('[TODO: "auki] Hän sanoi ”tule”.')).toEqual([[24, 30]]);
  });
});

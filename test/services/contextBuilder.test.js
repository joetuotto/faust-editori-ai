/**
 * @jest-environment node
 */
const contextBuilder = require('../../src/services/ai/contextBuilder');
const {
  buildContext,
  describeParts,
  isChapterBlocked,
  chaptersInOrder,
  readSummary,
  normalizeContextFields,
  stripTodos,
  tailLines,
  headLines,
  DROP_ORDER,
  TASK_PROFILES,
  LANGUAGE_RULES,
  UNCALIBRATED_MARGIN,
  MENTION_DETECTION,
  MESSAGES
} = contextBuilder;

const NBSP = '\u00A0';

// n lines "Ennen 1. Aamulla satama oli hiljainen, …"
const para = (n, s) => Array.from({ length: n }, (_, i) => `${s} ${i + 1}. Aamulla satama oli hiljainen, ja lokit kiertelivät laiturin yllä.`).join('\n');

const SELECTED = 'Pekan ääni kuului satamasta. Tämä on <u>valinta</u> [TODO: tarkista], jota muokataan.';

function makeProject(overrides = {}) {
  return {
    language: 'fi',
    style: 'Lyhyet päälauseet. Ei huutomerkkejä. Vuoropuhelu ajatusviivalla.',
    brief: 'Romaani kolmesta sisaruksesta, jotka perivät saaren. Imperfekti, hän-kerronta.',
    avoidWords: ['jotenkin', '”vain”', 'hehku'],
    codex: [
      { id: 'a', type: 'hahmo', name: 'Mari', aliases: [], exclude: ['Marianne'], description: 'Vanhin sisar, 41, merikapteeni.', notes: 'SALAINEN muistiinpano', state: 'always' },
      { id: 'b', type: 'paikka', name: 'Satama', aliases: ['satama'], exclude: [], description: 'Pieni kalasatama saaren eteläkärjessä.', notes: '', state: 'mentioned' },
      { id: 'c', type: 'hahmo', name: 'Pekka', aliases: ['Peka'], exclude: [], description: 'Nuorin veli.', notes: '', state: 'mentioned' },
      { id: 'd', type: 'esine', name: 'Kirje', aliases: [], exclude: [], description: 'Isän viimeinen kirje.', notes: '', state: 'manual' },
      { id: 'e', type: 'hahmo', name: 'Aino', aliases: [], exclude: [], description: 'Ei koskaan lähetettävä.', notes: '', state: 'never' }
    ],
    structure: [
      { id: 'c1', title: 'Saapuminen', content: 'x', synopsis: 'Sisarukset saapuvat saarelle. [TODO: tarkista lautan aikataulu]' },
      { id: 'c2', title: 'Salaisuus', content: 'SALAINEN LUKU', synopsis: 'Ei saa näkyä.', noAI: true },
      { id: 'c3', title: 'Perintö', content: 'x', synopsis: '', synopsisAI: 'Testamentti luetaan.' },
      {
        id: 'c4',
        title: 'Myrsky',
        content: `${para(6, 'Ennen')}\n– Tuletko sinä jo? Mari kysyi. [TODO: repliikki uusiksi]\n${SELECTED}\n${para(4, 'Jälkeen')}`
      }
    ],
    ...overrides
  };
}

function selectionOf(project) {
  const content = project.structure[3].content;
  const start = content.indexOf('Pekan ääni');
  return { start, end: content.indexOf('jota muokataan.') + 'jota muokataan.'.length };
}

// The fixture call of the spec
function buildFixture(extra = {}) {
  const project = extra.project || makeProject();
  return buildContext({
    task: { id: 'edit', instruction: 'Tiivistä.' },
    project,
    chapterId: 'c4',
    selection: selectionOf(project),
    include: ['codex:d', 'codex:e'],
    ...extra
  });
}

describe('the instruction part names what it is (I-05 review)', () => {
  test('a task with an instructionLabel names its instruction part so; the author\'s own instruction is oma ohje', () => {
    const own = buildFixture();
    expect(part(own, 'instruction').label).toBe('oma ohje');
    const action = buildFixture({ task: { id: 'edit', instruction: 'Tiivistä.', instructionLabel: 'ohje' } });
    expect(part(action, 'instruction').label).toBe('ohje');
    expect(describeParts(action).line.endsWith(' · ohje 9')).toBe(true);
    expect(describeParts(action).line).not.toContain('oma ohje');
    // The text sent does not change with the label
    expect(sent(action)).toBe(sent(own));
  });
});

// The drop-order rows of the spec: a calibrated budget of floor(T × 2.25) characters at 3 characters per token
function buildAt(tokens, extra = {}) {
  return buildFixture({
    include: ['codex:d'],
    budget: { promptBudgetChars: Math.floor(tokens * 2.25), charsPerToken: 3, calibrated: true },
    ...extra
  });
}

const part = (built, id) => built.parts.find(item => item.id === id);
const states = (built) => Object.fromEntries(built.parts.map(item => [item.id, item.state]));
const user = (built) => (built.messages[0] ? built.messages[0].content : '');
const sent = (built) => built.system + '\n' + user(built);

const EXPECTED_SYSTEM = `Olet kirjailijan toimittaja. Muokkaat vain annettua tekstiä kirjailijan ohjeen mukaan.
Kirjoita ja vastaa suomeksi.

<tyyliohje>
Lyhyet päälauseet. Ei huutomerkkejä. Vuoropuhelu ajatusviivalla.
</tyyliohje>

<kirjan_ydin>
Romaani kolmesta sisaruksesta, jotka perivät saaren. Imperfekti, hän-kerronta.
</kirjan_ydin>

<valtettavat_sanat>
Älä käytä näitä sanoja tai ilmauksia: jotenkin, vain, hehku
</valtettavat_sanat>

<tarinakansio>
Mari (hahmo): Vanhin sisar, 41, merikapteeni.
</tarinakansio>`;

const EXPECTED_USER = `<aiemmat_luvut>
Luku 1: Saapuminen – Sisarukset saapuvat saarelle.
Luku 3: Perintö – Testamentti luetaan.
</aiemmat_luvut>

<tarinakansio_mainitut>
Satama (paikka): Pieni kalasatama saaren eteläkärjessä.
Pekka (hahmo): Nuorin veli.
</tarinakansio_mainitut>

<tarinakansio_lisatyt>
Kirje (esine): Isän viimeinen kirje.
</tarinakansio_lisatyt>

<edeltava_teksti>
${para(6, 'Ennen')}
– Tuletko sinä jo? Mari kysyi.
</edeltava_teksti>

<valinta>
Pekan ääni kuului satamasta. Tämä on <u>valinta</u> [TODO: tarkista], jota muokataan.
</valinta>

<seuraava_teksti>
${para(4, 'Jälkeen')}
</seuraava_teksti>

<ohje>
Tiivistä.
</ohje>`;

describe('layout', () => {
  test('the fixture produces exactly the system and user text above', () => {
    const built = buildFixture();
    expect(built.system).toBe(EXPECTED_SYSTEM);
    expect(built.messages).toEqual([{ role: 'user', content: EXPECTED_USER }]);
    expect(built.totalChars).toBe(1835);
    expect(built.totalChars).toBe(built.system.length + built.messages[0].content.length);
    expect(built).toMatchObject({ blocked: null, overBudget: false, dropped: [], language: 'fi', charsPerToken: 2.7 });
    expect(built.parts.map(item => item.id)).toEqual([
      'task', 'style', 'brief', 'avoid', 'codexAlways', 'summaries', 'codexMentioned', 'codexManual', 'before', 'payload', 'after', 'instruction'
    ]);
  });

  test('the language rule appears once and comes from project.language: fi, en, another code, missing', () => {
    const ruleOf = (language) => {
      const project = makeProject({ language });
      const built = buildFixture({ project });
      return { built, lines: built.system.split('\n') };
    };

    const fi = ruleOf('fi');
    expect(fi.lines[1]).toBe('Kirjoita ja vastaa suomeksi.');
    expect(sent(fi.built).split('Kirjoita ja vastaa suomeksi.')).toHaveLength(2);
    expect(fi.built.language).toBe('fi');

    const en = ruleOf('en');
    expect(en.lines[1]).toBe('Write and answer in English.');
    expect(sent(en.built).split('Write and answer in English.')).toHaveLength(2);
    expect(sent(en.built)).not.toContain('suomeksi');
    // The scaffolding stays Finnish for every language
    expect(en.built.system).toContain('<tyyliohje>');
    expect(en.built.language).toBe('en');

    const sv = ruleOf('sv');
    expect(sv.lines[1]).toBe('Kirjoita ja vastaa tällä kielellä: sv.');
    expect(sv.built.language).toBe('sv');

    for (const missing of [undefined, null, '', '  ']) {
      const none = ruleOf(missing);
      expect(none.lines[1]).toBe('Kirjoita ja vastaa suomeksi.');
      expect(none.built.language).toBe('fi');
    }
    expect(LANGUAGE_RULES).toEqual({ fi: 'Kirjoita ja vastaa suomeksi.', en: 'Write and answer in English.' });
  });

  test('task.role and task.rules replace and extend the head', () => {
    const built = buildFixture({
      task: {
        id: 'edit',
        role: 'Olet tarkka oikolukija.',
        rules: ['Palauta teksti <teksti>-tagien sisällä.', 'Älä selitä muutoksia.'],
        instruction: 'Tiivistä.'
      }
    });
    expect(built.system.split('\n\n')[0]).toBe([
      'Olet tarkka oikolukija.',
      'Kirjoita ja vastaa suomeksi.',
      'Palauta teksti <teksti>-tagien sisällä.',
      'Älä selitä muutoksia.'
    ].join('\n'));
    expect(built.system).not.toContain('Olet kirjailijan toimittaja.');
    expect(part(built, 'task')).toMatchObject({ where: 'system', locked: true, state: 'sent', label: 'tehtävän säännöt' });
    expect(part(built, 'task').text).toBe(built.system.split('\n\n')[0]);

    // Every profile has its own default role as the first line
    const roles = {
      edit: 'Olet kirjailijan toimittaja. Muokkaat vain annettua tekstiä kirjailijan ohjeen mukaan.',
      write: 'Olet kirjailijan kirjoitusapuri. Jatkat tekstiä kirjailijan omalla äänellä.',
      proofread: 'Olet suomen kielen kielenhuoltaja. Korjaat vain virheet etkä muuta tyyliä.',
      review: 'Olet kustannustoimittaja. Luet tekstin ja raportoit havaintosi.',
      custom: 'Olet kirjailijan avustaja.',
      'jokin-muu': 'Olet kirjailijan avustaja.'
    };
    for (const [id, role] of Object.entries(roles)) {
      expect(buildFixture({ task: id }).system.split('\n')[0]).toBe(role);
    }
  });

  test('stable first: with a different selection and instruction the system text is identical', () => {
    const project = makeProject();
    const first = buildFixture({ project });
    const other = buildContext({
      task: { id: 'edit', instruction: 'Kirjoita tämä vilkkaammaksi ja lisää yksi repliikki.' },
      project,
      chapterId: 'c4',
      selection: { start: 0, end: 20 },
      include: ['codex:d']
    });
    expect(other.system).toBe(first.system);
    expect(user(other)).not.toBe(user(first));
    // What changes with the request comes last
    expect(user(other).endsWith('<ohje>\nKirjoita tämä vilkkaammaksi ja lisää yksi repliikki.\n</ohje>')).toBe(true);
  });

  test('a block is not written for an empty part', () => {
    const project = makeProject({ style: '   ', brief: '', avoidWords: [], codex: [] });
    project.structure[0].synopsis = '';
    project.structure[2].synopsisAI = '';
    const selection = selectionOf(project);
    const built = buildContext({ task: 'edit', project, chapterId: 'c4', selection: { start: 0, end: selection.end } });

    expect(built.system).toBe('Olet kirjailijan toimittaja. Muokkaat vain annettua tekstiä kirjailijan ohjeen mukaan.\nKirjoita ja vastaa suomeksi.');
    expect(user(built).startsWith('<valinta>\n')).toBe(true);
    for (const tag of ['tyyliohje', 'kirjan_ydin', 'valtettavat_sanat', 'tarinakansio', 'erisnimet', 'aiemmat_luvut', 'edeltava_teksti', 'ohje']) {
      expect(sent(built)).not.toContain(`<${tag}`);
    }
    expect(sent(built)).not.toMatch(/<[a-z_]+>\n\n?<\//);
    expect(built.parts.map(item => item.id)).toEqual(['task', 'payload', 'after']);
  });

  test('a write task has no working-text block and uses the cursor', () => {
    const project = makeProject();
    const cursor = selectionOf(project).start;
    const built = buildContext({ task: { id: 'write', instruction: 'Jatka kohtausta.' }, project, chapterId: 'c4', cursor });

    expect(part(built, 'payload')).toBeUndefined();
    expect(sent(built)).not.toContain('<valinta>');
    expect(built.system.split('\n')[0]).toBe('Olet kirjailijan kirjoitusapuri. Jatkat tekstiä kirjailijan omalla äänellä.');
    // Everything before the cursor is "before", everything from it on is "after"
    expect(part(built, 'before').text.endsWith('– Tuletko sinä jo? Mari kysyi.')).toBe(true);
    expect(part(built, 'after').text.startsWith('Pekan ääni kuului satamasta. Tämä on <u>valinta</u>, jota muokataan.\nJälkeen 1.')).toBe(true);
    expect(user(built)).toContain('</edeltava_teksti>\n\n<seuraava_teksti>');
    expect(user(built).endsWith('<ohje>\nJatka kohtausta.\n</ohje>')).toBe(true);

    // Without a cursor the place is the end of the chapter
    const atEnd = buildContext({ task: 'write', project, chapterId: 'c4' });
    expect(part(atEnd, 'after')).toBeUndefined();
    expect(part(atEnd, 'before').text.endsWith('Jälkeen 4. Aamulla satama oli hiljainen, ja lokit kiertelivät laiturin yllä.')).toBe(true);
  });

  test('a write task\'s following text ends at the next scene break or heading; an edit keeps the rest of the chapter', () => {
    const project = makeProject();
    const scene = 'Hotellin aulassa paloi yksi lamppu.\n\nVastaanoton takana istui vanha nainen.';
    const later = 'Aamulla lumi oli lakannut. Aino lähti pankkiin.';
    const lead = 'Hän oli lähtenyt täältä kaksikymmentä vuotta sitten.';
    for (const mark of ['* * *', '***', '---', '# Toinen osa']) {
      const text = `${lead}\n\n${scene}\n\n${mark}\n\n${later}`;
      const built = buildContext({ task: { id: 'write', instruction: 'Jatka.' }, project, chapterId: 'c4', text, cursor: lead.length });
      expect(part(built, 'after').text).toBe(scene);
      expect(part(built, 'after').fullChars).toBe(scene.length);
      expect(sent(built)).not.toContain('pankkiin');
      // Not a missing part: the scene is all there is to fit in front of
      expect(describeParts(built).dropped).toBe('');

      const edit = buildContext({ task: { id: 'edit', instruction: 'Tiivistä.' }, project, chapterId: 'c4', text, selection: { start: 0, end: lead.length } });
      expect(part(edit, 'after').text).toContain('pankkiin');
    }

    // A list item or a dialogue line is not a scene break; the caret right before a break sends no following text
    const listed = `${lead}\n- käydä pankissa\n– Tule jo, Mari sanoi.\n\n* * *\n${later}`;
    expect(part(buildContext({ task: 'write', project, chapterId: 'c4', text: listed, cursor: lead.length }), 'after').text)
      .toBe('- käydä pankissa\n– Tule jo, Mari sanoi.');
    const atBreak = buildContext({ task: 'write', project, chapterId: 'c4', text: `${lead}\n\n* * *\n${later}`, cursor: lead.length });
    expect(part(atBreak, 'after')).toBeUndefined();
    expect(user(atBreak)).not.toContain('<seuraava_teksti>');
  });

  test('a write task includes the summary of its own chapter in <luvun_tiivistelma>, without TODO notes', () => {
    const project = makeProject();
    project.structure[3].synopsis = 'Myrsky nousee. [TODO: tarkista tuulen suunta]\nSisarukset jäävät saareen.';
    const built = buildContext({ task: { id: 'write', instruction: 'Jatka.' }, project, chapterId: 'c4', cursor: selectionOf(project).start });

    expect(user(built)).toContain([
      '</aiemmat_luvut>',
      '',
      '<luvun_tiivistelma>',
      'Myrsky nousee. Sisarukset jäävät saareen.',
      '</luvun_tiivistelma>',
      '',
      '<tarinakansio_mainitut>'
    ].join('\n'));
    expect(sent(built)).not.toContain('tuulen suunta');
    expect(part(built, 'chapterSummary')).toMatchObject({
      label: 'luvun tiivistelmä',
      where: 'user',
      text: 'Myrsky nousee. Sisarukset jäävät saareen.',
      state: 'sent',
      locked: false
    });
    // In the list of parts it comes right after the summaries
    const ids = built.parts.map(item => item.id);
    expect(ids).toEqual(['task', 'style', 'brief', 'avoid', 'codexAlways', 'summaries', 'chapterSummary', 'codexMentioned', 'before', 'after', 'instruction']);
    expect(describeParts(built).line).toContain(' · tiivistelmät 1, 3 89 · luvun tiivistelmä 41 · oma ohje 6');

    // At most 1 200 characters, cut at a sentence: 39 sentences of 30 characters
    // without the last space, and " …"
    project.structure[3].synopsis = 'Myrsky nousee ja vene irtoaa. '.repeat(60).trim();
    const long = buildContext({ task: 'write', project, chapterId: 'c4', cursor: 0 });
    expect(part(long, 'chapterSummary').chars).toBe(1171);
    expect(part(long, 'chapterSummary').text).toBe(`${'Myrsky nousee ja vene irtoaa. '.repeat(39).trim()} …`);
    // A summary of exactly 1 200 characters is sent whole
    const exact = `${'Myrsky nousee ja vene irtoaa. '.repeat(39)}Myrsky nousee, ja vene irtoaa.`;
    expect(exact).toHaveLength(1200);
    project.structure[3].synopsis = exact;
    const whole = buildContext({ task: 'write', project, chapterId: 'c4', cursor: 0 });
    expect(part(whole, 'chapterSummary').text).toBe(exact);
    project.structure[3].synopsis = 'Myrsky nousee ja vene irtoaa. '.repeat(60).trim();

    // It can be switched off like any other part
    const off = buildContext({ task: 'write', project, chapterId: 'c4', cursor: 0, exclude: ['chapterSummary'] });
    expect(part(off, 'chapterSummary')).toMatchObject({ state: 'excluded', text: '' });
    expect(user(off)).not.toContain('<luvun_tiivistelma>');
  });

  test('an edit task does not', () => {
    const project = makeProject();
    project.structure[3].synopsis = 'Myrsky nousee.';
    const built = buildFixture({ project });
    expect(part(built, 'chapterSummary')).toBeUndefined();
    expect(sent(built)).not.toContain('luvun_tiivistelma');
    expect(sent(built)).not.toContain('Myrsky nousee.');
    for (const id of ['proofread', 'review', 'custom']) {
      expect(sent(buildFixture({ project, task: id }))).not.toContain('luvun_tiivistelma');
    }
    // A task can ask for it by listing the part
    const asked = buildFixture({ project, task: { id: 'review', parts: ['style', 'chapterSummary'], payload: 'Teksti.' } });
    expect(user(asked).startsWith('<luvun_tiivistelma>\nMyrsky nousee.\n</luvun_tiivistelma>')).toBe(true);
  });

  test('an unknown task id uses the custom profile with the aineisto tag', () => {
    const built = buildFixture({ task: { id: 'kokeilu', instruction: 'Tee jotain.' } });
    expect(user(built)).toContain(`<aineisto>\n${SELECTED}\n</aineisto>`);
    expect(part(built, 'payload').label).toBe('teksti');
    expect(describeParts(built).line.startsWith('Lähetetään: teksti 85 · ')).toBe(true);
    expect(TASK_PROFILES.custom).toMatchObject({ payloadTag: 'aineisto', payloadLabel: 'teksti' });
    expect(TASK_PROFILES.edit).toMatchObject({ payloadTag: 'valinta', payloadLabel: 'valinta', limits: { before: 6000, after: 1500, summaries: 3000 } });
    expect(TASK_PROFILES.write).toMatchObject({ payloadTag: null, limits: { before: 12000, after: 1500, summaries: 6000 } });
    expect(TASK_PROFILES.proofread).toMatchObject({ payloadTag: 'kappaleet', parts: ['style', 'names', 'before'], limits: { before: 600 } });
    expect(TASK_PROFILES.review).toMatchObject({ payloadTag: 'luku', limits: { summaries: 6000 } });
    expect(TASK_PROFILES.write.parts).toContain('chapterSummary');
    expect(TASK_PROFILES.edit.parts).not.toContain('chapterSummary');
  });

  test('task.parts, task.limits, payloadTag and payloadLabel override the profile', () => {
    const built = buildFixture({
      task: { id: 'edit', parts: ['style', 'before'], limits: { before: 80 }, payloadTag: 'teksti', payloadLabel: 'tarkistettava teksti', instruction: 'Tarkista.' }
    });
    expect(built.parts.map(item => item.id)).toEqual(['task', 'style', 'codexManual', 'before', 'payload', 'instruction']);
    expect(part(built, 'before').text).toBe('– Tuletko sinä jo? Mari kysyi.');
    expect(user(built)).toContain(`<teksti>\n${SELECTED}\n</teksti>`);
    expect(part(built, 'payload').label).toBe('tarkistettava teksti');

    // A limit that is not a size leaves the profile's own in place; zero switches the part off
    const odd = buildFixture({ task: { id: 'edit', limits: { before: undefined, after: 'paljon', summaries: Number.NaN } } });
    expect(part(odd, 'before').chars).toBe(480);
    expect(part(odd, 'after').chars).toBe(307);
    expect(part(odd, 'summaries').state).toBe('sent');
    const zero = buildFixture({ task: { id: 'edit', limits: { before: 0, summaries: 0 } } });
    expect(part(zero, 'before')).toBeUndefined();
    expect(part(zero, 'summaries')).toBeUndefined();
    expect(part(zero, 'after').chars).toBe(307);

    // payloadTag null: no working-text block at all
    const none = buildFixture({ task: { id: 'edit', payloadTag: null, payload: 'EI LÄHETETÄ', instruction: 'Ohje.' } });
    expect(part(none, 'payload')).toBeUndefined();
    expect(sent(none)).not.toContain('EI LÄHETETÄ');
  });
});

describe('never sent', () => {
  test('private notes never appear in system or messages', () => {
    const project = makeProject();
    project.codex = project.codex.map(item => ({ ...item, notes: `SALAINEN muistiinpano ${item.id}`, state: item.state === 'never' ? 'never' : 'always' }));
    for (const task of ['edit', 'write', 'proofread', 'review', 'custom']) {
      const built = buildFixture({ project, task: { id: task, instruction: 'Ohje.' }, include: project.codex.map(item => `codex:${item.id}`) });
      expect(sent(built)).not.toContain('SALAINEN');
      expect(JSON.stringify(built)).not.toContain('SALAINEN');
    }
    // Aliases and exclusions are local too
    expect(sent(buildFixture())).not.toContain('Marianne');
  });

  test('an entry in state never is not sent even when it is in include', () => {
    const built = buildFixture({ include: ['codex:d', 'codex:e'] });
    expect(sent(built)).not.toContain('Ei koskaan lähetettävä.');
    expect(sent(built)).not.toContain('Aino');
    expect(part(built, 'codexManual').items.map(item => item.key)).toEqual(['codex:d']);

    // Not even its name, in a proofread task's list of names
    const project = makeProject();
    project.structure[3].content += '\nAino tuli ovelle.';
    const proofread = buildContext({ task: 'proofread', project, chapterId: 'c4', selection: { start: 0, end: project.structure[3].content.length }, include: ['codex:e'] });
    expect(part(proofread, 'names').text).toBe('Erisnimet ja termit, joita ei korjata: Mari, Satama, Pekka');
  });

  test('an entry with an empty description is not sent', () => {
    const project = makeProject();
    project.codex[0].description = '   ';
    project.codex[1].description = '';
    project.codex[3].description = '\n';
    const built = buildFixture({ project });
    expect(part(built, 'codexAlways')).toBeUndefined();
    expect(part(built, 'codexManual')).toBeUndefined();
    expect(part(built, 'codexMentioned').items.map(item => item.key)).toEqual(['codex:c']);
    expect(sent(built)).not.toContain('Mari (hahmo)');
    expect(sent(built)).not.toContain('Satama (paikka)');
    expect(sent(built)).not.toContain('Kirje (esine)');
  });

  test('a noAI target chapter gives blocked noAI, empty system and no messages', () => {
    const project = makeProject();
    const built = buildContext({ task: { id: 'edit', instruction: 'Tiivistä.' }, project, chapterId: 'c2', selection: { start: 0, end: 8 } });
    expect(built).toEqual({
      system: '',
      messages: [],
      parts: [],
      totalChars: 0,
      totalTokens: 0,
      budgetTokens: 4500,
      charsPerToken: 2.7,
      overBudget: false,
      blocked: 'noAI',
      dropped: [],
      language: 'fi'
    });
    // Also when the caller hands the text in itself
    const withText = buildContext({ task: 'write', project, chapterId: 'c2', text: 'SALAINEN LUKU', cursor: 3 });
    expect(withText.blocked).toBe('noAI');
    expect(JSON.stringify(withText)).not.toContain('SALAINEN');
    // Only the literal true blocks
    project.structure[1].noAI = 'yes';
    expect(buildContext({ task: 'edit', project, chapterId: 'c2', selection: { start: 0, end: 8 } }).blocked).toBeNull();
  });

  test('the text and summary of another noAI chapter never appear; skippedNoAI lists its number', () => {
    const built = buildFixture();
    expect(sent(built)).not.toContain('SALAINEN');
    expect(sent(built)).not.toContain('Ei saa näkyä');
    expect(sent(built)).not.toContain('Salaisuus');
    expect(part(built, 'summaries').skippedNoAI).toEqual([2]);
    expect(part(built, 'summaries').items.map(item => item.key)).toEqual(['summary:c1', 'summary:c3']);

    // A protected chapter after the target is not a summary anyway and is not listed
    const project = makeProject();
    project.structure.push({ id: 'c5', title: 'Loppu', content: 'SALAINEN LOPPU', synopsis: 'Ei näy.', noAI: true });
    expect(part(buildFixture({ project }), 'summaries').skippedNoAI).toEqual([2]);
    expect(sent(buildFixture({ project }))).not.toContain('SALAINEN');
  });

  test('isChapterBlocked is true only for a noAI chapter', () => {
    const project = makeProject();
    project.structure[3].children = [{ id: 'c4a', title: 'Alaluku', content: 'y', noAI: true }];
    expect(isChapterBlocked(project, 'c2')).toBe(true);
    expect(isChapterBlocked(project, 'c4a')).toBe(true);
    expect(isChapterBlocked(project, 'c1')).toBe(false);
    expect(isChapterBlocked(project, 'c4')).toBe(false);
    expect(isChapterBlocked(project, 'ei-ole')).toBe(false);
    expect(isChapterBlocked(null, 'c2')).toBe(false);
    expect(isChapterBlocked({ structure: [{ id: 'x', noAI: 1 }] }, 'x')).toBe(false);
  });
});

describe('read-only context', () => {
  test('TODO markers are stripped from the text before and after and from summaries', () => {
    const project = makeProject();
    project.structure[3].content = project.structure[3].content.replace('Jälkeen 2.', 'Jälkeen 2. [TODO: lisää lokki]');
    const built = buildFixture({ project });

    expect(part(built, 'before').text).not.toContain('TODO');
    expect(part(built, 'before').text.endsWith('\n– Tuletko sinä jo? Mari kysyi.')).toBe(true);
    expect(part(built, 'after').text).not.toContain('TODO');
    expect(part(built, 'after').text).toContain('Jälkeen 2. Aamulla satama');
    expect(part(built, 'summaries').text).toBe('Luku 1: Saapuminen – Sisarukset saapuvat saarelle.\nLuku 3: Perintö – Testamentti luetaan.');
    for (const hidden of ['repliikki uusiksi', 'lautan aikataulu', 'lisää lokki']) expect(sent(built)).not.toContain(hidden);

    // A summary that is nothing but a note is no summary
    project.structure[0].synopsis = '[TODO: kirjoita tiivistelmä]';
    expect(part(buildFixture({ project }), 'summaries').text).toBe('Luku 3: Perintö – Testamentti luetaan.');
  });

  test('a selection that cuts a note in two leaves the whole note out', () => {
    const project = makeProject();
    const content = project.structure[3].content;
    const inside = content.indexOf('[TODO: tarkista]') + 6;
    const built = buildContext({ task: 'write', project, chapterId: 'c4', cursor: inside });
    expect(part(built, 'before').text.endsWith('Tämä on <u>valinta</u> ')).toBe(true);
    expect(part(built, 'after').text.startsWith(', jota muokataan.\nJälkeen 1.')).toBe(true);
    expect(sent(built)).not.toContain('TODO');
    expect(sent(built)).not.toContain('tarkista]');
  });

  test('the working text is sent unchanged: its [TODO: …] and `<u>` stay', () => {
    const built = buildFixture();
    expect(part(built, 'payload').text).toBe(SELECTED);
    expect(user(built)).toContain(`<valinta>\n${SELECTED}\n</valinta>`);
    expect(part(built, 'payload')).toMatchObject({ label: 'valinta', where: 'user', locked: true, state: 'sent', chars: 85 });
  });

  test('task.payload is used verbatim instead of the selection', () => {
    const payload = '  1| Pekan ääni kuului ⟦1⟧satamasta⟦/1⟧. [TODO: jää]\r\n2| <u>Toinen</u> rivi.  ';
    const built = buildFixture({ task: { id: 'edit', payload, instruction: 'Korjaa.' } });
    expect(part(built, 'payload').text).toBe(payload);
    expect(user(built)).toContain(`<valinta>\n${payload}\n</valinta>`);
    // The selection still decides what counts as before and after
    expect(part(built, 'before').text.endsWith('– Tuletko sinä jo? Mari kysyi.')).toBe(true);
    expect(user(built)).not.toContain('Tämä on <u>valinta</u>');

    // An empty payload is a payload too: nothing is taken from the selection
    const probe = buildFixture({ task: { id: 'review', payload: '', instruction: 'Tarkistus: tyyli' } });
    expect(part(probe, 'payload')).toMatchObject({ state: 'empty', text: '', chars: 0, locked: true });
    expect(user(probe)).not.toContain('<luku>');
    expect(probe.blocked).toBeNull();
  });

  test('stripTodos: the four cases of the example in 3.3', () => {
    expect(stripTodos('Hän tuli. [TODO: tarkista kellonaika] Ovi kävi.\n[TODO: kirjoita kohtaus]\n\n– Niin [TODO: x], hän sanoi.\n[TODO: auki'))
      .toBe('Hän tuli. Ovi kävi.\n\n– Niin, hän sanoi.\n[TODO: auki');

    // One by one
    expect(stripTodos('Hän tuli. [TODO: tarkista kellonaika] Ovi kävi.')).toBe('Hän tuli. Ovi kävi.');
    expect(stripTodos('Ensin.\n[TODO: kirjoita kohtaus]\nSitten.')).toBe('Ensin.\nSitten.');
    expect(stripTodos('Ensin.\n\nSitten.')).toBe('Ensin.\n\nSitten.');
    expect(stripTodos('– Niin [TODO: x], hän sanoi.')).toBe('– Niin, hän sanoi.');
    expect(stripTodos('[TODO: auki')).toBe('[TODO: auki');

    // Other places a note can stand in
    expect(stripTodos('[TODO: alku] Teksti jatkuu.')).toBe('Teksti jatkuu.');
    expect(stripTodos('Teksti loppuu. [TODO: loppu]')).toBe('Teksti loppuu.');
    expect(stripTodos('Yksi [TODO: a] [TODO: b] kaksi.')).toBe('Yksi kaksi.');
    expect(stripTodos('Miksi [TODO: syy]? Siksi [TODO: b]…')).toBe('Miksi? Siksi…');
    expect(stripTodos('  [TODO: a] [TODO: b]  ')).toBe('');
    // Spacing the author typed elsewhere on the line is not touched
    expect(stripTodos('Hän sanoi … ja  lähti. [TODO: x]')).toBe('Hän sanoi … ja  lähti.');
    expect(stripTodos('')).toBe('');
    expect(stripTodos(undefined)).toBe('');
  });

  test('the summary field order: synopsis, then synopsisManual, then synopsisAI', () => {
    expect(readSummary({ synopsis: ' Yksi. ', synopsisManual: 'Kaksi.', synopsisAI: 'Kolme.' })).toBe('Yksi.');
    expect(readSummary({ synopsis: '  ', synopsisManual: 'Kaksi.', synopsisAI: 'Kolme.' })).toBe('Kaksi.');
    expect(readSummary({ synopsis: '', synopsisAI: 'Kolme.' })).toBe('Kolme.');
    expect(readSummary({ synopsis: null, synopsisManual: 5 })).toBe('');
    expect(readSummary({})).toBe('');
    expect(readSummary(undefined)).toBe('');

    // And the builder reads through it
    const project = makeProject();
    project.structure[0] = { id: 'c1', title: 'Saapuminen', content: 'x', synopsis: '', synopsisManual: 'Käsin kirjoitettu.', synopsisAI: 'Koneen kirjoittama.' };
    expect(part(buildFixture({ project }), 'summaries').text.split('\n')[0]).toBe('Luku 1: Saapuminen – Käsin kirjoitettu.');
  });

  test('summaries over the limit lose the oldest first and the label shows the ranges sent ("tiivistelmät 5–9")', () => {
    const structure = [];
    for (let n = 1; n <= 9; n++) {
      structure.push({ id: `k${n}`, title: `Osa ${n}`, content: 'x', synopsis: `Tapahtuma numero ${n} kuvataan tässä.` });
    }
    structure.push({ id: 'k10', title: 'Viimeinen', content: 'Tässä on valittu teksti.' });
    const project = makeProject({ structure, codex: [] });
    const lineOf = (n) => `Luku ${n}: Osa ${n} – Tapahtuma numero ${n} kuvataan tässä.`;
    const call = (limits) => buildContext({ task: { id: 'edit', limits }, project, chapterId: 'k10', selection: { start: 0, end: 5 } });

    // Each line is 50 characters; five lines with their line breaks are 254
    expect(lineOf(5)).toHaveLength(50);
    const built = call({ summaries: 254 });
    const summaries = part(built, 'summaries');
    expect(summaries.label).toBe('tiivistelmät 5–9');
    expect(summaries.state).toBe('cut');
    expect(summaries.text).toBe([5, 6, 7, 8, 9].map(lineOf).join('\n'));
    expect(summaries.fullChars).toBe([1, 2, 3, 4, 5, 6, 7, 8, 9].map(lineOf).join('\n').length);
    expect(describeParts(built).line).toContain('tiivistelmät 5–9 254');
    expect(describeParts(built).dropped).toBe('Ei mahtunut: tiivistelmät 5–9 (osa)');
    // The limit is not the budget: nothing was touched by the drop order
    expect(built.dropped).toEqual([]);

    expect(part(call({ summaries: 253 }), 'summaries').label).toBe('tiivistelmät 6–9');
    // A limit under one line leaves nothing, and the part says so
    expect(part(call({ summaries: 49 }), 'summaries')).toMatchObject({ label: 'tiivistelmät', state: 'dropped', text: '', items: [] });
    expect(part(call({ summaries: 6000 }), 'summaries')).toMatchObject({ label: 'tiivistelmät 1–9', state: 'sent' });

    // Ranges with gaps: chapters without a summary and excluded ones are left out of the label
    project.structure[3].synopsis = '';
    const gaps = buildContext({ task: 'edit', project, chapterId: 'k10', selection: { start: 0, end: 5 }, exclude: ['summary:k8'] });
    expect(part(gaps, 'summaries').label).toBe('tiivistelmät 1–3, 5–7, 9');

    // A long summary is one line of at most 600 characters
    project.structure[0].synopsis = `${'Pitkä virke toistuu tässä monta kertaa. '.repeat(30)}\nToinen rivi.`;
    const first = part(buildContext({ task: 'edit', project, chapterId: 'k10', selection: { start: 0, end: 5 } }), 'summaries').items[0];
    expect(first.text.startsWith('Luku 1: Osa 1 – Pitkä virke toistuu')).toBe(true);
    expect(first.text).not.toContain('\n');
    expect(first.text.length).toBeLessThanOrEqual('Luku 1: Osa 1 – '.length + 600);
    expect(first.text.endsWith('monta kertaa. …')).toBe(true);
  });

  test('a dialogue line "– Tuletko sinä jo?" is kept whole with its dash', () => {
    // Room for the last line only: it is never split to fill the rest
    const built = buildFixture({ task: { id: 'edit', limits: { before: 100 }, instruction: 'Tiivistä.' } });
    expect(part(built, 'before').text).toBe('– Tuletko sinä jo? Mari kysyi.');
    expect(part(built, 'before')).toMatchObject({ state: 'sent', fullChars: 480 });
    expect(user(built)).toContain('<edeltava_teksti>\n– Tuletko sinä jo? Mari kysyi.\n</edeltava_teksti>');

    expect(tailLines('Pitkä kertova kappale ennen repliikkiä.\n– Tuletko sinä jo?', 30)).toBe('– Tuletko sinä jo?');
    expect(headLines('– Tuletko sinä jo?\nPitkä kertova kappale repliikin jälkeen.', 30)).toBe('– Tuletko sinä jo?');
  });

  test('” and – in the text arrive unchanged', () => {
    const project = makeProject();
    project.structure[3].content = [
      '”Äiti”, hän sanoi – ja lähti. Yö oli pitkä…',
      '– Älä mene, Åke huusi. ”Ei vielä!”',
      'Kolmas kappale – täynnä ”lainauksia” ja ajatusviivoja – loppui näin.'
    ].join('\n');
    const content = project.structure[3].content;
    const start = content.indexOf('– Älä mene');
    const end = content.indexOf('\nKolmas');
    const built = buildContext({ task: { id: 'edit', instruction: 'Säilytä ”tyyli” – kiitos.' }, project, chapterId: 'c4', selection: { start, end } });

    expect(user(built)).toContain('<edeltava_teksti>\n”Äiti”, hän sanoi – ja lähti. Yö oli pitkä…\n</edeltava_teksti>');
    expect(user(built)).toContain('<valinta>\n– Älä mene, Åke huusi. ”Ei vielä!”\n</valinta>');
    expect(user(built)).toContain('<seuraava_teksti>\nKolmas kappale – täynnä ”lainauksia” ja ajatusviivoja – loppui näin.\n</seuraava_teksti>');
    expect(user(built)).toContain('<ohje>\nSäilytä ”tyyli” – kiitos.\n</ohje>');
    expect(sent(built)).not.toMatch(/["']Äiti|--/);
  });

  test('tailLines and headLines: whole lines only; the three examples for an over-long single line', () => {
    expect(tailLines('Eka rivi.\nToka rivi on pidempi.\n– Kolmas?', 30)).toBe('– Kolmas?');
    expect(tailLines('Yksi pitkä kappale. Toinen virke tässä. Kolmas virke lopussa.', 40)).toBe('… Kolmas virke lopussa.');
    expect(headLines('Yksi pitkä kappale. Toinen virke tässä. Kolmas virke lopussa.', 40)).toBe('Yksi pitkä kappale. …');

    // Whole lines: as many as fit, counted from the right end
    const text = 'Eka rivi.\nToka rivi on pidempi.\n– Kolmas?';
    expect(tailLines(text, 41)).toBe(text);
    expect(tailLines(text, 40)).toBe('Toka rivi on pidempi.\n– Kolmas?');
    expect(tailLines(text, 31)).toBe('Toka rivi on pidempi.\n– Kolmas?');
    expect(tailLines(text, 9)).toBe('– Kolmas?');
    expect(headLines(text, 41)).toBe(text);
    expect(headLines(text, 40)).toBe('Eka rivi.\nToka rivi on pidempi.');
    expect(headLines(text, 31)).toBe('Eka rivi.\nToka rivi on pidempi.');
    expect(headLines(text, 30)).toBe('Eka rivi.');
    expect(headLines(text, 9)).toBe('Eka rivi.');

    // Blank lines at the ends are not content; blank lines inside stay
    expect(tailLines('\n\nYksi.\n\nKaksi.\n \n', 100)).toBe('Yksi.\n\nKaksi.');
    expect(headLines('\n\nYksi.\n\nKaksi.\n \n', 100)).toBe('Yksi.\n\nKaksi.');
    expect(tailLines('Yksi.\n\nKaksi.', 8)).toBe('Kaksi.');
    expect(headLines('Yksi.\n\nKaksi.', 8)).toBe('Yksi.');

    // No sentence start in reach: a word start; a closing quotation mark belongs to the sentence before
    expect(tailLines('Sana toinen kolmas neljäs viides', 16)).toBe('… neljäs viides');
    expect(headLines('Sana toinen kolmas neljäs viides', 16)).toBe('Sana toinen …');
    expect(tailLines('”Mene pois!” Hän kääntyi ja lähti kotiin.', 32)).toBe('… Hän kääntyi ja lähti kotiin.');
    expect(headLines('Hän kääntyi. ”Mene pois!” Sitten hän lähti kotiin.', 30)).toBe('Hän kääntyi. ”Mene pois!” …');
    // A cut that lands exactly on a sentence boundary loses nothing more
    expect(tailLines('Alku on tässä. Loppu on tässä.', 17)).toBe('… Loppu on tässä.');
    expect(headLines('Alku on tässä. Loppu on tässä.', 16)).toBe('Alku on tässä. …');

    // Nothing sensible fits
    expect(tailLines('Yhtäpitkääsanaailmanvälejä', 10)).toBe('');
    expect(headLines('Yhtäpitkääsanaailmanvälejä', 10)).toBe('');
    expect(tailLines('Kaksi sanaa', 2)).toBe('');
    expect(headLines('Kaksi sanaa', 2)).toBe('');
    for (const max of [0, -5, undefined]) {
      expect(tailLines('Teksti.', max)).toBe('');
      expect(headLines('Teksti.', max)).toBe('');
    }
    for (const nothing of ['', '  \n ', undefined, null]) {
      expect(tailLines(nothing, 100)).toBe('');
      expect(headLines(nothing, 100)).toBe('');
    }

    // The result never exceeds the limit
    const long = `${para(3, 'Rivi')}\n${'Pitkä virke ilman loppua jatkuu ja jatkuu. '.repeat(8).trim()}`;
    for (let max = 0; max <= long.length + 5; max += 7) {
      expect(tailLines(long, max).length).toBeLessThanOrEqual(max);
      expect(headLines(long, max).length).toBeLessThanOrEqual(max);
    }
  });

  test('CRLF text is treated like LF text', () => {
    const lf = makeProject();
    const crlf = makeProject();
    crlf.structure[3].content = crlf.structure[3].content.replace(/\n/g, '\r\n');
    crlf.structure[0].synopsis = 'Sisarukset saapuvat saarelle.\r\n[TODO: tarkista lautan aikataulu]';

    // The offsets are those of the editor, where a line break is one character
    const selection = selectionOf(lf);
    const fromLf = buildFixture({ project: lf, selection });
    const fromCrlf = buildFixture({ project: crlf, selection });
    expect(fromCrlf.system).toBe(fromLf.system);
    expect(user(fromCrlf)).toBe(user(fromLf));
    expect(sent(fromCrlf)).not.toContain('\r');
    expect(fromCrlf.totalChars).toBe(1835);

    // The same for a text handed in by the caller
    const live = buildFixture({ project: lf, selection, text: crlf.structure[3].content });
    expect(user(live)).toBe(user(fromLf));

    // A lone carriage return (old Mac files) is a line break as well
    const cr = buildFixture({ project: lf, selection, text: lf.structure[3].content.replace(/\n/g, '\r') });
    expect(user(cr)).toBe(user(fromLf));
    expect(sent(cr)).not.toContain('\r');
  });
});

describe('budget', () => {
  test('no budget given: 5 000 tokens at 2.7 characters with the 0.9 margin gives budgetTokens 4 500', () => {
    expect(buildFixture().budgetTokens).toBe(4500);
    expect(buildFixture().charsPerToken).toBe(2.7);
    expect(buildFixture({ budget: {} }).budgetTokens).toBe(4500);
    expect(buildFixture({ budget: undefined }).budgetTokens).toBe(4500);
    expect(buildFixture({ budget: null }).budgetTokens).toBe(4500);
    expect(UNCALIBRATED_MARGIN).toBe(0.9);
    expect(describeParts(buildFixture()).total).toBe(`noin 680 / 4${NBSP}500 tokenia`);
    expect(buildFixture().totalTokens).toBe(Math.ceil(1835 / 2.7));
  });

  test('cluster A\'s budget object is read: promptBudgetChars wins over promptBudgetTokens', () => {
    const budget = {
      model: 'malli', window: 32000, headroom: 2000, maxTokensSent: 3024,
      promptBudgetTokens: 28776, charsPerToken: 2.5, promptBudgetChars: 50000, calibrated: true
    };
    const built = buildFixture({ budget });
    expect(built.charsPerToken).toBe(2.5);
    // 50 000 characters, not 28 776 × 2.5 = 71 940
    expect(built.budgetTokens).toBe(20000);
    expect(built.totalTokens).toBe(Math.ceil(1835 / 2.5));
    expect(part(built, 'payload').tokens).toBe(Math.ceil(85 / 2.5));

    // Without promptBudgetChars the tokens are turned into characters at the given rate
    expect(buildFixture({ budget: { promptBudgetTokens: 1000, charsPerToken: 2.5, calibrated: true } }).budgetTokens).toBe(1000);
    // … and the product is rounded to the nearest character: 3 × 0.5 = 1.5 → 2 characters → 4 tokens
    // (cut to 1 it would be 2), 4 × 0.3 = 1.2 → 1 character → 3 tokens (raised to 2 it would be 7)
    expect(buildFixture({ budget: { promptBudgetTokens: 3, charsPerToken: 0.5, calibrated: true } }).budgetTokens).toBe(4);
    expect(buildFixture({ budget: { promptBudgetTokens: 4, charsPerToken: 0.3, calibrated: true } }).budgetTokens).toBe(3);
    // 1 001 × 2.7 = 2 702.7 → 2 703 characters, of which the margin leaves floor(2 432.7) = 2 432
    expect(buildFixture({ budget: { promptBudgetTokens: 1001 } }).budgetTokens).toBe(901);
    expect(buildFixture({ budget: { promptBudgetTokens: 1000, calibrated: true } })).toMatchObject({ budgetTokens: 1000, charsPerToken: 2.7 });
    // A rate of zero or less falls back to 2.7
    expect(buildFixture({ budget: { promptBudgetTokens: 1000, charsPerToken: 0, calibrated: true } }).charsPerToken).toBe(2.7);
    // Values that are not numbers count as not given
    expect(buildFixture({ budget: { promptBudgetChars: 'paljon', promptBudgetTokens: null, charsPerToken: '3', calibrated: true } }))
      .toMatchObject({ budgetTokens: 5000, charsPerToken: 2.7, overBudget: false });
    expect(buildFixture({ budget: { promptBudgetChars: Number.NaN, promptBudgetTokens: 2000, charsPerToken: 2, calibrated: true } }).budgetTokens).toBe(2000);
    // A budget of zero characters is a budget, not a missing value
    expect(buildFixture({ budget: { promptBudgetChars: 0, charsPerToken: 3, calibrated: true } })).toMatchObject({ budgetTokens: 0, overBudget: true });
  });

  test('a calibrated budget is used as given; any other budget gets the 0.9 margin', () => {
    const calibrated = buildFixture({ budget: { promptBudgetChars: 3000, charsPerToken: 3, calibrated: true } });
    expect(calibrated.budgetTokens).toBe(1000);

    // The value 3 means nothing by itself any more: only the flag counts
    for (const flag of [false, undefined, 'true', 1]) {
      const other = buildFixture({ budget: { promptBudgetChars: 3000, charsPerToken: 3, calibrated: flag } });
      expect(other.budgetTokens).toBe(900);
    }
    expect(buildFixture({ budget: { promptBudgetChars: 3000, charsPerToken: 2.5 } }).budgetTokens).toBe(1080);

    // The spec's last example
    const example = buildFixture({ include: ['codex:d'], budget: { promptBudgetChars: 1500, charsPerToken: 2.5, calibrated: true } });
    expect(example.budgetTokens).toBe(600);
    expect(example.dropped).toEqual(['summaries', 'after']);
    expect(part(example, 'summaries').state).toBe('dropped');
    expect(part(example, 'after')).toMatchObject({ state: 'cut', chars: 76 });
    // The same characters without the flag: the margin takes a tenth and more has to go
    const unflagged = buildFixture({ include: ['codex:d'], budget: { promptBudgetChars: 1500, charsPerToken: 2.5 } });
    expect(unflagged.budgetTokens).toBe(540);
    expect(unflagged.totalChars).toBeLessThanOrEqual(1350);
    expect(part(unflagged, 'after').state).toBe('dropped');
  });

  test('task.overheadChars is subtracted from the budget', () => {
    const budget = { promptBudgetChars: 3000, charsPerToken: 3, calibrated: true };
    const plain = buildFixture({ budget });
    const withOverhead = buildFixture({ budget, task: { id: 'edit', instruction: 'Tiivistä.', overheadChars: 1500 } });
    expect(plain.budgetTokens).toBe(1000);
    expect(plain.dropped).toEqual([]);
    expect(withOverhead.budgetTokens).toBe(500);
    expect(withOverhead.totalChars).toBeLessThanOrEqual(1500);
    expect(withOverhead.dropped).toEqual(['summaries', 'after']);

    // More overhead than budget: zero, never negative
    const none = buildFixture({ budget, task: { id: 'edit', instruction: 'Tiivistä.', overheadChars: 5000 } });
    expect(none).toMatchObject({ budgetTokens: 0, overBudget: true });
    // With the margin: floor(3000 × 0.9) − 700 = 2000
    expect(buildFixture({ budget: { promptBudgetChars: 3000, charsPerToken: 2 }, task: { id: 'edit', overheadChars: 700 } }).budgetTokens).toBe(1000);
  });

  test('the drop order table above, row by row', () => {
    const allSent = {
      task: 'sent', style: 'sent', brief: 'sent', avoid: 'sent', codexAlways: 'sent', summaries: 'sent',
      codexMentioned: 'sent', codexManual: 'sent', before: 'sent', payload: 'sent', after: 'sent', instruction: 'sent'
    };

    // 876: nothing dropped
    let built = buildAt(876);
    expect(built.budgetTokens).toBe(657);
    expect(built.dropped).toEqual([]);
    expect(states(built)).toEqual(allSent);
    expect(built.totalChars).toBe(1835);

    // 776: summaries dropped
    built = buildAt(776);
    expect(built.budgetTokens).toBe(582);
    expect(built.dropped).toEqual(['summaries']);
    expect(states(built)).toEqual({ ...allSent, summaries: 'dropped' });
    expect(user(built)).not.toContain('<aiemmat_luvut>');

    // 676: + after cut to one line (76 characters)
    built = buildAt(676);
    expect(built.budgetTokens).toBe(507);
    expect(built.dropped).toEqual(['summaries', 'after']);
    expect(states(built)).toEqual({ ...allSent, summaries: 'dropped', after: 'cut' });
    expect(part(built, 'after')).toMatchObject({ chars: 76, fullChars: 307 });
    expect(part(built, 'after').text).toBe('Jälkeen 1. Aamulla satama oli hiljainen, ja lokit kiertelivät laiturin yllä.');

    // 626: + after dropped
    built = buildAt(626);
    expect(built.budgetTokens).toBe(469);
    expect(built.dropped).toEqual(['summaries', 'after']);
    expect(states(built)).toEqual({ ...allSent, summaries: 'dropped', after: 'dropped' });
    expect(user(built)).not.toContain('<seuraava_teksti>');

    // 576: + codexMentioned dropped
    built = buildAt(576);
    expect(built.budgetTokens).toBe(432);
    expect(built.dropped).toEqual(['summaries', 'after', 'codexMentioned']);
    expect(states(built)).toEqual({ ...allSent, summaries: 'dropped', after: 'dropped', codexMentioned: 'dropped' });

    // 536: + before cut (405 of 480): the farthest line went
    built = buildAt(536);
    expect(built.budgetTokens).toBe(402);
    expect(built.dropped).toEqual(['summaries', 'after', 'codexMentioned', 'before']);
    expect(states(built)).toEqual({ ...allSent, summaries: 'dropped', after: 'dropped', codexMentioned: 'dropped', before: 'cut' });
    expect(part(built, 'before')).toMatchObject({ chars: 405, fullChars: 480 });
    expect(part(built, 'before').text.startsWith('Ennen 2. ')).toBe(true);
    expect(part(built, 'before').text.endsWith('– Tuletko sinä jo? Mari kysyi.')).toBe(true);

    // 276: before, codexAlways, codexManual dropped too; style, brief and avoid still sent
    built = buildAt(276);
    expect(built.budgetTokens).toBe(207);
    expect(built.dropped).toEqual(['summaries', 'after', 'codexMentioned', 'before', 'codexAlways', 'codexManual']);
    expect(states(built)).toEqual({
      ...allSent, summaries: 'dropped', after: 'dropped', codexMentioned: 'dropped', before: 'dropped', codexAlways: 'dropped', codexManual: 'dropped'
    });
    expect(built.system).toContain('<tyyliohje>');
    expect(built.system).toContain('<kirjan_ydin>');
    expect(built.system).toContain('<valtettavat_sanat>');

    // 120: style, brief and avoid dropped as well; only rules, working text and instruction are sent (83 tokens)
    built = buildAt(120);
    expect(built.budgetTokens).toBe(90);
    expect(built.dropped).toEqual(['summaries', 'after', 'codexMentioned', 'before', 'codexAlways', 'codexManual', 'avoid', 'brief', 'style']);
    expect(built.parts.filter(item => item.state === 'sent').map(item => item.id)).toEqual(['task', 'payload', 'instruction']);
    expect(built.totalTokens).toBe(83);
    expect(built.overBudget).toBe(false);
    expect(built.system).toBe('Olet kirjailijan toimittaja. Muokkaat vain annettua tekstiä kirjailijan ohjeen mukaan.\nKirjoita ja vastaa suomeksi.');
    expect(user(built)).toBe(`<valinta>\n${SELECTED}\n</valinta>\n\n<ohje>\nTiivistä.\n</ohje>`);

    // 60: overBudget
    built = buildAt(60);
    expect(built.budgetTokens).toBe(45);
    expect(built.overBudget).toBe(true);

    expect(DROP_ORDER).toEqual([
      'summaries', 'chapterSummary', 'after', 'codexMentioned', 'before', 'codexAlways', 'codexManual', 'names', 'avoid', 'brief', 'style'
    ]);
  });

  test('each part shrinks from its far end: the oldest summary and the last entry go first', () => {
    const at = (chars, extra = {}) => buildFixture({ include: ['codex:d'], budget: { promptBudgetChars: chars, charsPerToken: 3, calibrated: true }, ...extra });

    // Ten characters short: the summary of chapter 1 goes, chapter 3 stays
    const oneLess = at(1825);
    expect(oneLess.dropped).toEqual(['summaries']);
    expect(part(oneLess, 'summaries')).toMatchObject({ state: 'cut', label: 'tiivistelmät 3', text: 'Luku 3: Perintö – Testamentti luetaan.', fullChars: 89 });
    expect(part(oneLess, 'summaries').items.map(item => item.key)).toEqual(['summary:c3']);
    expect(describeParts(oneLess).dropped).toBe('Ei mahtunut: tiivistelmät 3 (osa)');
    expect(oneLess.totalChars).toBe(1835 - 51);

    // Entries: the last of the list first. Two always entries, room for one.
    const project = makeProject();
    project.codex.push({ id: 'f', type: 'paikka', name: 'Saari', aliases: [], exclude: [], description: 'Pieni saari ulkomerellä.', notes: '', state: 'always' });
    const all = buildFixture({ project, include: ['codex:d'], exclude: ['summaries', 'after', 'codexMentioned', 'before'] });
    expect(part(all, 'codexAlways').items.map(item => item.key)).toEqual(['codex:a', 'codex:f']);
    const tight = buildFixture({
      project,
      include: ['codex:d'],
      exclude: ['summaries', 'after', 'codexMentioned', 'before'],
      budget: { promptBudgetChars: all.totalChars - 1, charsPerToken: 3, calibrated: true }
    });
    expect(tight.dropped).toEqual(['codexAlways']);
    expect(part(tight, 'codexAlways')).toMatchObject({ state: 'cut', text: 'Mari (hahmo): Vanhin sisar, 41, merikapteeni.' });
    expect(part(tight, 'codexManual').state).toBe('sent');
  });

  test('chapterSummary is dropped right after summaries', () => {
    const project = makeProject();
    project.structure[3].synopsis = 'Myrsky nousee ja sisarukset jäävät saareen.';
    const call = (chars, exclude = []) => buildContext({
      task: { id: 'write', instruction: 'Jatka.' },
      project,
      chapterId: 'c4',
      cursor: selectionOf(project).start,
      exclude,
      budget: { promptBudgetChars: chars, charsPerToken: 3, calibrated: true }
    });

    const everything = call(100000);
    const withoutSummaries = call(100000, ['summaries']);
    expect(everything.dropped).toEqual([]);
    expect(part(everything, 'chapterSummary').state).toBe('sent');

    // One character short: the summaries of earlier chapters go, the chapter's own stays
    const first = call(everything.totalChars - 1);
    expect(first.dropped).toEqual(['summaries']);
    expect(part(first, 'chapterSummary').state).toBe('sent');

    // One character short again: the chapter's own summary goes next, whole, and the text after is untouched
    const second = call(withoutSummaries.totalChars - 1);
    expect(second.dropped).toEqual(['summaries', 'chapterSummary']);
    expect(part(second, 'chapterSummary')).toMatchObject({ state: 'dropped', text: '', chars: 0, fullChars: 43 });
    expect(part(second, 'after').state).toBe('sent');
    expect(part(second, 'before').state).toBe('sent');
    expect(user(second)).not.toContain('<luvun_tiivistelma>');
    expect(describeParts(second).dropped).toBe('Ei mahtunut: tiivistelmät, luvun tiivistelmä');
  });

  test('names, avoid, brief and style are dropped whole, never cut', () => {
    const project = makeProject();
    project.style = `${project.style}\n${'Toinen sääntö on tämä. '.repeat(40).trim()}`;
    const textOf = (id) => part(buildFixture({ project, include: ['codex:d'] }), id).text;
    const full = { style: textOf('style'), brief: textOf('brief'), avoid: textOf('avoid') };

    for (let chars = 200; chars <= 3200; chars += 13) {
      const built = buildFixture({ project, include: ['codex:d'], budget: { promptBudgetChars: chars, charsPerToken: 3, calibrated: true } });
      for (const id of ['style', 'brief', 'avoid']) {
        const item = part(built, id);
        expect(['sent', 'dropped']).toContain(item.state);
        expect(item.text).toBe(item.state === 'sent' ? full[id] : '');
      }
    }

    // The same for the list of names of a proofread task
    const names = 'Erisnimet ja termit, joita ei korjata: Mari, Satama, Pekka';
    const seen = new Set();
    for (let chars = 150; chars <= 1000; chars += 7) {
      const built = buildFixture({ project: makeProject(), task: 'proofread', include: [], budget: { promptBudgetChars: chars, charsPerToken: 3, calibrated: true } });
      const item = part(built, 'names');
      expect(['sent', 'dropped']).toContain(item.state);
      expect(item.text).toBe(item.state === 'sent' ? names : '');
      seen.add(item.state);
      // names goes before style
      if (part(built, 'style').state === 'dropped') expect(item.state).toBe('dropped');
    }
    expect(seen).toEqual(new Set(['sent', 'dropped']));
  });

  test('the working text and the instruction are never dropped; when they alone exceed the budget, overBudget is true and every other part is dropped', () => {
    const built = buildAt(60);
    expect(built.overBudget).toBe(true);
    expect(states(built)).toEqual({
      task: 'sent', style: 'dropped', brief: 'dropped', avoid: 'dropped', codexAlways: 'dropped', summaries: 'dropped',
      codexMentioned: 'dropped', codexManual: 'dropped', before: 'dropped', payload: 'sent', after: 'dropped', instruction: 'sent'
    });
    expect(built.dropped).toEqual(['summaries', 'after', 'codexMentioned', 'before', 'codexAlways', 'codexManual', 'avoid', 'brief', 'style']);
    expect(part(built, 'payload').text).toBe(SELECTED);
    expect(part(built, 'instruction').text).toBe('Tiivistä.');
    expect(user(built)).toBe(`<valinta>\n${SELECTED}\n</valinta>\n\n<ohje>\nTiivistä.\n</ohje>`);
    expect(built.totalChars).toBe(247);
    expect(built.totalChars).toBeGreaterThan(135);
    expect(built.blocked).toBeNull();

    // At every budget the three locked parts are whole
    for (let chars = 0; chars <= 2000; chars += 50) {
      const any = buildFixture({ budget: { promptBudgetChars: chars, charsPerToken: 3, calibrated: true } });
      for (const id of ['task', 'payload', 'instruction']) expect(part(any, id)).toMatchObject({ state: 'sent', locked: true });
      expect(any.system.startsWith('Olet kirjailijan toimittaja.')).toBe(true);
      expect(user(any)).toContain(SELECTED);
      expect(user(any)).toContain('<ohje>\nTiivistä.\n</ohje>');
      // 247 characters are the fixed size
      expect(any.overBudget).toBe(chars < 247);
    }
  });

  test('the total never exceeds the budget unless overBudget', () => {
    const project = makeProject();
    project.structure[3].synopsis = 'Myrsky nousee.';
    let cuts = 0;
    for (const task of ['edit', 'write', 'proofread', 'review']) {
      for (let chars = 0; chars <= 2100; chars += 11) {
        const built = buildFixture({ project, task: { id: task, instruction: 'Tiivistä.' }, budget: { promptBudgetChars: chars, charsPerToken: 3, calibrated: true } });
        expect(built.totalChars).toBe(built.system.length + user(built).length);
        if (!built.overBudget) expect(built.totalChars).toBeLessThanOrEqual(chars);
        cuts += built.parts.filter(item => item.state === 'cut').length;

        // What the drop order touched is exactly what is cut or dropped
        const touched = built.parts.filter(item => item.state === 'cut' || item.state === 'dropped').map(item => item.id).sort();
        expect(built.dropped.slice().sort()).toEqual(touched);
        // … and it was touched in the fixed order
        const order = built.dropped.map(id => DROP_ORDER.indexOf(id));
        expect(order).toEqual(order.slice().sort((a, b) => a - b));
      }
    }
    expect(cuts).toBeGreaterThan(20);
  });

  test('exclude removes a part and marks it excluded; a locked part cannot be excluded', () => {
    const built = buildFixture({ exclude: ['style', 'before', 'summaries', 'codexMentioned', 'task', 'payload', 'instruction'] });

    for (const id of ['style', 'before', 'summaries', 'codexMentioned']) {
      expect(part(built, id)).toMatchObject({ state: 'excluded', text: '', chars: 0, tokens: 0 });
      expect(part(built, id).fullChars).toBeGreaterThan(0);
    }
    expect(part(built, 'summaries')).toMatchObject({ label: 'tiivistelmät', items: [], fullChars: 89 });
    expect(part(built, 'before').fullChars).toBe(480);
    for (const tag of ['tyyliohje', 'edeltava_teksti', 'aiemmat_luvut', 'tarinakansio_mainitut']) expect(sent(built)).not.toContain(`<${tag}>`);

    for (const id of ['task', 'payload', 'instruction']) expect(part(built, id).state).toBe('sent');
    expect(built.system.startsWith('Olet kirjailijan toimittaja.')).toBe(true);
    expect(user(built)).toContain('<valinta>');
    expect(user(built)).toContain('<ohje>');

    // Excluded is not "did not fit"
    expect(built.dropped).toEqual([]);
    expect(describeParts(built).dropped).toBe('');
    expect(describeParts(built).line).toBe('Lähetetään: valinta 85 · ympäröivä teksti 307 · käsikirjoituksen ydin 78 · vältettävät sanat 59 · Tarinakansio 81 · oma ohje 9');

    // An excluded before or after is not searched for mentions: Satama is only there
    const project = makeProject();
    project.structure[3].content = project.structure[3].content.replace('kuului satamasta', 'kuului rannasta');
    const searched = buildFixture({ project });
    expect(part(searched, 'codexMentioned').items.map(item => item.key)).toEqual(['codex:b', 'codex:c']);
    const notSearched = buildFixture({ project, exclude: ['before', 'after'] });
    expect(part(notSearched, 'codexMentioned').items.map(item => item.key)).toEqual(['codex:c']);

    // Every optional part can be switched off, also the entries added by hand
    const all = buildFixture({ exclude: DROP_ORDER });
    expect(all.parts.filter(item => item.state !== 'excluded').map(item => item.id)).toEqual(['task', 'payload', 'instruction']);
    expect(all.totalChars).toBe(247);
  });

  test('mentions are looked for in the working text, the text around it and the instruction', () => {
    const project = makeProject({
      codex: [{ id: 'k', type: 'esine', name: 'Kirje', aliases: [], exclude: [], description: 'Isän kirje.', notes: '', state: 'mentioned' }]
    });
    project.structure[3].content = 'Hän avasi laatikon.';
    const build = (task, extra = {}) => buildContext({ task, project, chapterId: 'c4', selection: { start: 0, end: 19 }, ...extra });

    // Named nowhere: not sent
    expect(part(build({ id: 'edit', instruction: 'Tiivistä.' }), 'codexMentioned')).toBeUndefined();

    // Named only in the author's instruction
    const byInstruction = build({ id: 'edit', instruction: 'Mainitse Kirje tässä.' });
    expect(part(byInstruction, 'codexMentioned')).toMatchObject({ state: 'sent', text: 'Kirje (esine): Isän kirje.' });
    expect(user(byInstruction)).toContain('<tarinakansio_mainitut>\nKirje (esine): Isän kirje.\n</tarinakansio_mainitut>');

    // Named only in a payload the caller made
    expect(part(build({ id: 'edit', payload: 'Kirjeen kuori oli auki.' }), 'codexMentioned').text).toBe('Kirje (esine): Isän kirje.');

    // Named only in the text before, in italics
    const live = '_Kirjettä_ ei löytynyt.\nHän avasi laatikon.';
    const byBefore = build({ id: 'edit', instruction: 'Tiivistä.' }, { text: live, selection: { start: live.indexOf('Hän'), end: live.length } });
    expect(part(byBefore, 'before').text).toBe('_Kirjettä_ ei löytynyt.');
    expect(part(byBefore, 'codexMentioned').text).toBe('Kirje (esine): Isän kirje.');
  });

  test('exclude with codex:<id> and summary:<chapterId> removes one item', () => {
    const built = buildFixture({ exclude: ['codex:b', 'summary:c1'] });
    expect(part(built, 'codexMentioned')).toMatchObject({ state: 'sent', text: 'Pekka (hahmo): Nuorin veli.' });
    expect(part(built, 'codexMentioned').items.map(item => item.key)).toEqual(['codex:c']);
    expect(part(built, 'summaries')).toMatchObject({ state: 'sent', label: 'tiivistelmät 3', text: 'Luku 3: Perintö – Testamentti luetaan.' });
    expect(sent(built)).not.toContain('Pieni kalasatama');
    expect(sent(built)).not.toContain('Saapuminen');

    // The always entry and the one added by hand, one by one
    const others = buildFixture({ exclude: ['codex:a', 'codex:d'] });
    expect(part(others, 'codexAlways')).toBeUndefined();
    expect(part(others, 'codexManual')).toBeUndefined();
    expect(sent(others)).not.toContain('Mari (hahmo)');
    expect(sent(others)).not.toContain('Kirje (esine)');
  });

  test('a proofread task sends style, names and the text before, and no summaries or entries', () => {
    const built = buildFixture({ task: { id: 'proofread', payload: '1| Pekan ääni kuului satamasta.' }, include: [] });

    expect(built.parts.map(item => item.id)).toEqual(['task', 'style', 'names', 'before', 'payload']);
    expect(built.system).toBe([
      'Olet suomen kielen kielenhuoltaja. Korjaat vain virheet etkä muuta tyyliä.\nKirjoita ja vastaa suomeksi.',
      '<tyyliohje>\nLyhyet päälauseet. Ei huutomerkkejä. Vuoropuhelu ajatusviivalla.\n</tyyliohje>',
      '<erisnimet>\nErisnimet ja termit, joita ei korjata: Mari, Satama, Pekka\n</erisnimet>'
    ].join('\n\n'));
    expect(user(built)).toBe([
      `<edeltava_teksti>\n${para(6, 'Ennen')}\n– Tuletko sinä jo? Mari kysyi.\n</edeltava_teksti>`,
      '<kappaleet>\n1| Pekan ääni kuului satamasta.\n</kappaleet>'
    ].join('\n\n'));
    expect(part(built, 'names')).toMatchObject({ label: 'erisnimet', where: 'system', state: 'sent', locked: false });
    for (const absent of ['aiemmat_luvut', 'tarinakansio', 'kirjan_ydin', 'valtettavat_sanat', 'seuraava_teksti', 'merikapteeni', 'Nuorin veli']) {
      expect(sent(built)).not.toContain(absent);
    }
    expect(describeParts(built).line).toBe('Lähetetään: kappaleet 31 · ympäröivä teksti 480 · tyyliohje 64 · erisnimet 58');

    // The names line also lists an entry the author added by hand
    const added = buildFixture({ task: { id: 'proofread', payload: '1| Pekan ääni kuului satamasta.' }, include: ['codex:d'] });
    expect(part(added, 'names').text).toBe('Erisnimet ja termit, joita ei korjata: Mari, Satama, Pekka, Kirje');
    expect(added.system.endsWith('<erisnimet>\nErisnimet ja termit, joita ei korjata: Mari, Satama, Pekka, Kirje\n</erisnimet>')).toBe(true);

    // The limit of this profile: 600 characters before the working text
    const project = makeProject();
    project.structure[3].content = `${para(20, 'Alku')}\n${project.structure[3].content}`;
    const limited = buildFixture({ project, task: 'proofread', include: [] });
    expect(part(limited, 'before').chars).toBeLessThanOrEqual(600);
    expect(part(limited, 'before').text.split('\n')[0]).toMatch(/^(Alku|Ennen) \d+\. Aamulla/);
    expect(part(limited, 'before').fullChars).toBeGreaterThan(1500);
  });
});

describe('inputs', () => {
  test('text overrides the chapter\'s content', () => {
    const project = makeProject();
    const live = 'Tallennettua vanhempi teksti on poissa.\nElävä teksti on tässä. Valittu virke.\nJa loppu.';
    const start = live.indexOf('Valittu virke.');
    const built = buildContext({ task: { id: 'edit', instruction: 'Ohje.' }, project, chapterId: 'c4', text: live, selection: { start, end: start + 14 } });

    expect(part(built, 'payload').text).toBe('Valittu virke.');
    // The text before ends where the selection starts, mid-line here
    expect(part(built, 'before').text).toBe('Tallennettua vanhempi teksti on poissa.\nElävä teksti on tässä. ');
    expect(part(built, 'after').text).toBe('Ja loppu.');
    expect(sent(built)).not.toContain('Aamulla satama');
    // The project itself is not changed
    expect(project.structure[3].content.startsWith('Ennen 1.')).toBe(true);

    // An empty live text is a text: the stored content is not used instead
    const emptied = buildContext({ task: { id: 'write', instruction: 'Aloita luku.' }, project, chapterId: 'c4', text: '', cursor: 0 });
    expect(part(emptied, 'before')).toBeUndefined();
    expect(sent(emptied)).not.toContain('Aamulla satama');
  });

  test('selection is accepted as { start, end } and as { from, to }', () => {
    const project = makeProject();
    const { start, end } = selectionOf(project);
    const first = buildFixture({ project, selection: { start, end } });
    const second = buildFixture({ project, selection: { from: start, to: end } });
    expect(second).toEqual(first);
    expect(part(second, 'payload').text).toBe(SELECTED);

    // A selection made from right to left is the same selection
    expect(buildFixture({ project, selection: { start: end, end: start } })).toEqual(first);
    expect(buildFixture({ project, selection: { from: end, to: start } })).toEqual(first);
    // The cursor is used only when there is no selection
    expect(buildFixture({ project, selection: { start, end }, cursor: 3 })).toEqual(first);
    expect(part(buildFixture({ project, selection: null, cursor: start }), 'payload')).toMatchObject({ text: '', state: 'empty' });
  });

  test('offsets outside the text are clamped', () => {
    const project = makeProject({ codex: [] });
    project.structure[3].content = 'Lyhyt teksti.';
    const call = (extra) => buildContext({ task: 'edit', project, chapterId: 'c4', exclude: ['summaries'], ...extra });

    const all = call({ selection: { start: -50, end: 9999 } });
    expect(part(all, 'payload').text).toBe('Lyhyt teksti.');
    expect(part(all, 'before')).toBeUndefined();
    expect(part(all, 'after')).toBeUndefined();

    const tail = call({ selection: { from: 6, to: 400 } });
    expect(part(tail, 'payload').text).toBe('teksti.');
    expect(part(tail, 'before').text).toBe('Lyhyt ');

    const beyond = call({ task: 'write', cursor: 9999 });
    expect(part(beyond, 'before').text).toBe('Lyhyt teksti.');
    const negative = call({ task: 'write', cursor: -3 });
    expect(part(negative, 'after').text).toBe('Lyhyt teksti.');
    expect(part(negative, 'before')).toBeUndefined();

    // Offsets that are not numbers do not throw: the place is the end of the text
    const bad = call({ task: 'write', selection: { start: 'a', end: undefined }, cursor: Number.NaN });
    expect(part(bad, 'before').text).toBe('Lyhyt teksti.');
  });

  test('MESSAGES.noAI is the Finnish sentence of section 6', () => {
    expect(MESSAGES.noAI).toBe('Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.');
    expect(MESSAGES).toEqual({ noAI: 'Tämä luku on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.' });
    expect(MENTION_DETECTION).toBe(true);
  });

  test('an unknown chapter gives blocked no-chapter', () => {
    const project = makeProject();
    for (const chapterId of ['ei-ole', undefined, null]) {
      const built = buildContext({ task: 'edit', project, chapterId, selection: { start: 0, end: 5 } });
      expect(built).toMatchObject({ blocked: 'no-chapter', system: '', messages: [], parts: [], totalChars: 0, overBudget: false, dropped: [] });
    }
    expect(buildContext({ task: 'edit', project: null, chapterId: 'c4' }).blocked).toBe('no-chapter');
    expect(buildContext({ task: 'edit', project: {}, chapterId: 'c4' }).blocked).toBe('no-chapter');
    expect(buildContext().blocked).toBe('no-chapter');
  });

  test('nothing to say gives blocked empty', () => {
    const project = { language: 'fi', structure: [{ id: 'c1', title: 'Luku 1', content: '' }] };
    const built = buildContext({ task: 'write', project, chapterId: 'c1', cursor: 0 });
    expect(built.blocked).toBe('empty');
    expect(built.messages).toEqual([]);
    expect(describeParts(built).line).toBe('Lähetetään:');

    // An edit with an empty selection in an empty chapter, without an instruction
    expect(buildContext({ task: 'edit', project, chapterId: 'c1' }).blocked).toBe('empty');
    // An instruction alone is something to say
    const instructed = buildContext({ task: { id: 'write', instruction: 'Aloita luku sateesta.' }, project, chapterId: 'c1', cursor: 0 });
    expect(instructed.blocked).toBeNull();
    expect(user(instructed)).toBe('<ohje>\nAloita luku sateesta.\n</ohje>');
    // A whitespace-only instruction is none
    expect(buildContext({ task: { id: 'write', instruction: '  \n ' }, project, chapterId: 'c1' }).blocked).toBe('empty');
  });

  test('chaptersInOrder walks children and skips a folder without text', () => {
    const project = {
      structure: [
        { id: 'osa1', type: 'folder', title: 'Osa I', content: '', children: [
          { id: 'l1', type: 'chapter', title: 'Yksi', content: 'a', synopsis: 'Ensimmäinen.' },
          { id: 'l2', type: 'chapter', title: 'Kaksi', content: '', synopsis: 'Toinen.', children: [{ id: 'l2a', title: 'Kaksi A', content: 'b', synopsis: 'Alaluku.' }] }
        ] },
        null,
        { id: 'osa2', type: 'folder', title: 'Osa II', content: 'Johdanto osaan.', synopsis: 'Kansio, jolla on tekstiä.', children: [
          { id: 'l3', type: 'chapter', title: 'Kolme', content: 'Tämä on kohde.' }
        ] }
      ]
    };
    expect(chaptersInOrder(project).map(item => item.id)).toEqual(['l1', 'l2', 'l2a', 'osa2', 'l3']);
    expect(chaptersInOrder(project)[0]).toBe(project.structure[0].children[0]);
    expect(chaptersInOrder({})).toEqual([]);
    expect(chaptersInOrder(null)).toEqual([]);
    expect(chaptersInOrder({ structure: 'x' })).toEqual([]);

    // The numbers of the summaries are positions in that order
    const built = buildContext({ task: 'edit', project, chapterId: 'l3', selection: { start: 0, end: 4 } });
    expect(part(built, 'summaries').text).toBe([
      'Luku 1: Yksi – Ensimmäinen.',
      'Luku 2: Kaksi – Toinen.',
      'Luku 3: Kaksi A – Alaluku.',
      'Luku 4: Osa II – Kansio, jolla on tekstiä.'
    ].join('\n'));
    expect(part(built, 'summaries').label).toBe('tiivistelmät 1–4');
  });
});

describe('parts and describeParts', () => {
  test('every part has text, chars, tokens, fullChars, state, locked and where; chars equals text.length', () => {
    const builds = [buildFixture(), buildAt(676), buildAt(536), buildAt(60), buildFixture({ exclude: ['style', 'after'] }), buildFixture({ task: 'proofread' })];
    for (const built of builds) {
      for (const item of built.parts) {
        expect(Object.keys(item)).toEqual(expect.arrayContaining(['id', 'label', 'where', 'text', 'chars', 'tokens', 'fullChars', 'state', 'locked']));
        expect(typeof item.text).toBe('string');
        expect(typeof item.label).toBe('string');
        expect(item.label).not.toBe('');
        expect(item.chars).toBe(item.text.length);
        expect(item.tokens).toBe(Math.ceil(item.chars / built.charsPerToken));
        expect(item.fullChars).toBeGreaterThanOrEqual(item.chars);
        expect(['sent', 'cut', 'dropped', 'excluded', 'empty']).toContain(item.state);
        expect(['system', 'user']).toContain(item.where);
        expect(item.locked).toBe(['task', 'payload', 'instruction'].includes(item.id));
        if (item.state === 'dropped' || item.state === 'excluded') expect(item.text).toBe('');
        if (item.state === 'sent' && item.id !== 'before' && item.id !== 'after') expect(item.chars).toBe(item.fullChars);
      }
    }

    const full = buildFixture();
    expect(full.parts.map(item => [item.id, item.where, item.label])).toEqual([
      ['task', 'system', 'tehtävän säännöt'],
      ['style', 'system', 'tyyliohje'],
      ['brief', 'system', 'käsikirjoituksen ydin'],
      ['avoid', 'system', 'vältettävät sanat'],
      ['codexAlways', 'system', 'Tarinakansio: aina mukana'],
      ['summaries', 'user', 'tiivistelmät 1, 3'],
      ['codexMentioned', 'user', 'Tarinakansio: mainitut'],
      ['codexManual', 'user', 'Tarinakansio: käsin lisätyt'],
      ['before', 'user', 'teksti ennen'],
      ['payload', 'user', 'valinta'],
      ['after', 'user', 'teksti jälkeen'],
      ['instruction', 'user', 'oma ohje']
    ]);
    expect(full.parts.map(item => item.chars)).toEqual([115, 64, 78, 59, 45, 89, 83, 36, 480, 85, 307, 9]);
  });

  test('the texts of the parts in state sent or cut all appear in system or the user message', () => {
    const builds = [buildFixture(), buildAt(676), buildAt(536), buildAt(276), buildFixture({ task: 'proofread' }), buildFixture({ task: { id: 'write', instruction: 'Jatka.' } })];
    for (const built of builds) {
      let live = 0;
      for (const item of built.parts) {
        if (item.state !== 'sent' && item.state !== 'cut') continue;
        live += 1;
        expect(item.text).not.toBe('');
        expect(item.where === 'system' ? built.system : user(built)).toContain(item.text);
      }
      expect(live).toBeGreaterThanOrEqual(3);
      // … and nothing of a part that is not sent
      for (const item of built.parts.filter(other => other.state === 'dropped')) {
        expect(sent(built)).not.toContain(`<${{ summaries: 'aiemmat_luvut', after: 'seuraava_teksti', before: 'edeltava_teksti', codexMentioned: 'tarinakansio_mainitut', codexAlways: 'tarinakansio>', codexManual: 'tarinakansio_lisatyt', style: 'tyyliohje', brief: 'kirjan_ydin', avoid: 'valtettavat_sanat' }[item.id]}`);
      }
    }
  });

  test('every item of the entry and summary parts carries its own text, and the texts joined with a line break equal the part\'s text', () => {
    const builds = [buildFixture(), buildAt(676), buildFixture({ exclude: ['codex:b'] })];
    for (const built of builds) {
      for (const id of ['codexAlways', 'codexMentioned', 'codexManual', 'summaries']) {
        const item = part(built, id);
        expect(Array.isArray(item.items)).toBe(true);
        expect(item.items.map(entry => entry.text).join('\n')).toBe(item.text);
        for (const entry of item.items) {
          expect(entry.chars).toBe(entry.text.length);
          expect(typeof entry.key).toBe('string');
          expect(typeof entry.label).toBe('string');
        }
      }
    }

    const full = buildFixture();
    expect(part(full, 'codexMentioned').items).toEqual([
      { key: 'codex:b', label: 'Satama', chars: 55, text: 'Satama (paikka): Pieni kalasatama saaren eteläkärjessä.' },
      { key: 'codex:c', label: 'Pekka', chars: 27, text: 'Pekka (hahmo): Nuorin veli.' }
    ]);
    expect(part(full, 'codexAlways').items).toEqual([
      { key: 'codex:a', label: 'Mari', chars: 45, text: 'Mari (hahmo): Vanhin sisar, 41, merikapteeni.' }
    ]);
    expect(part(full, 'codexManual').items).toEqual([
      { key: 'codex:d', label: 'Kirje', chars: 36, text: 'Kirje (esine): Isän viimeinen kirje.' }
    ]);
    expect(part(full, 'summaries').items).toEqual([
      { key: 'summary:c1', label: 'Luku 1: Saapuminen', chars: 50, text: 'Luku 1: Saapuminen – Sisarukset saapuvat saarelle.' },
      { key: 'summary:c3', label: 'Luku 3: Perintö', chars: 38, text: 'Luku 3: Perintö – Testamentti luetaan.' }
    ]);
    // A dropped part has no items left
    expect(part(buildAt(776), 'summaries').items).toEqual([]);
    // A part that is cut from the list keeps the items that are still sent
    const cut = buildFixture({ include: ['codex:d'], budget: { promptBudgetChars: 1340, charsPerToken: 3, calibrated: true } });
    expect(part(cut, 'codexMentioned')).toMatchObject({ state: 'cut', text: 'Satama (paikka): Pieni kalasatama saaren eteläkärjessä.' });
    expect(part(cut, 'codexMentioned').items.map(entry => entry.key)).toEqual(['codex:b']);
    // The least mentioned entry went first
    expect(sent(cut)).not.toContain('Nuorin veli');
    expect(describeParts(cut).dropped).toBe('Ei mahtunut: tiivistelmät, Tarinakansio: mainitut (osa), teksti jälkeen');
  });

  test('the row line of the fixture', () => {
    const row = describeParts(buildFixture());
    expect(row.line).toBe('Lähetetään: valinta 85 · ympäröivä teksti 787 · tyyliohje 64 · käsikirjoituksen ydin 78 · vältettävät sanat 59 · Tarinakansio 164 · tiivistelmät 1, 3 89 · oma ohje 9');
    expect(row.total).toBe(`noin 680 / 4${NBSP}500 tokenia`);
    expect(row.dropped).toBe('');

    // Thousands are grouped with a no-break space, in the line and in the total
    const project = makeProject();
    project.structure[3].content = `${para(40, 'Alku')}\n${project.structure[3].content}`;
    const big = describeParts(buildFixture({ project, budget: { promptBudgetChars: 5400000, charsPerToken: 3, calibrated: true } }));
    expect(big.line).toContain(`ympäröivä teksti 3${NBSP}778 · `);
    expect(big.total).toBe(`noin 1${NBSP}609 / 1${NBSP}800${NBSP}000 tokenia`);
    // … and not with an ordinary space, which could break the number over two lines
    expect(big.line).not.toContain('3 778');
    expect(big.total).not.toContain('1 609');
  });

  test('dropped line: "Ei mahtunut: tiivistelmät, teksti jälkeen (osa)"', () => {
    const row = describeParts(buildAt(676));
    expect(row.dropped).toBe('Ei mahtunut: tiivistelmät, teksti jälkeen (osa)');
    expect(row.line).toBe('Lähetetään: valinta 85 · ympäröivä teksti 556 · tyyliohje 64 · käsikirjoituksen ydin 78 · vältettävät sanat 59 · Tarinakansio 164 · oma ohje 9');
    expect(row.total).toBe('noin 494 / 507 tokenia');

    expect(describeParts(buildAt(876)).dropped).toBe('');
    expect(describeParts(buildAt(626)).dropped).toBe('Ei mahtunut: tiivistelmät, teksti jälkeen');
    expect(describeParts(buildAt(536)).dropped).toBe('Ei mahtunut: tiivistelmät, Tarinakansio: mainitut, teksti ennen (osa), teksti jälkeen');
  });

  test('a nonfiction project says Käsikirjoituksen kansio in labels and in the row', () => {
    const project = makeProject({ genre: 'nonfiction' });
    const built = buildFixture({ project });
    expect(part(built, 'codexAlways').label).toBe('Käsikirjoituksen kansio: aina mukana');
    expect(part(built, 'codexMentioned').label).toBe('Käsikirjoituksen kansio: mainitut');
    expect(part(built, 'codexManual').label).toBe('Käsikirjoituksen kansio: käsin lisätyt');
    expect(describeParts(built, 'Käsikirjoituksen kansio').line).toContain(' · Käsikirjoituksen kansio 164 · ');
    expect(describeParts(built, 'Käsikirjoituksen kansio').line).not.toContain('Tarinakansio');
    expect(describeParts(buildAt(536, { project }), 'Käsikirjoituksen kansio').dropped).toContain('Käsikirjoituksen kansio: mainitut');
    // The tags the model reads do not change with the project kind
    expect(built.system).toContain('<tarinakansio>');
    // The default folder name of the row is Tarinakansio
    expect(describeParts(buildFixture()).line).toContain(' · Tarinakansio 164 · ');
  });

  test('describeParts takes a blocked or missing result without throwing', () => {
    const blocked = buildContext({ task: 'edit', project: makeProject(), chapterId: 'c2' });
    expect(describeParts(blocked)).toEqual({ line: 'Lähetetään:', total: `noin 0 / 4${NBSP}500 tokenia`, dropped: '' });
    expect(describeParts(undefined)).toEqual({ line: 'Lähetetään:', total: 'noin 0 / 0 tokenia', dropped: '' });
  });

  test('the module exports what the contract lists and nothing that moved elsewhere', () => {
    expect(Object.keys(contextBuilder).sort()).toEqual([
      'DROP_ORDER', 'LANGUAGE_RULES', 'MENTION_DETECTION', 'MESSAGES', 'TASK_PROFILES', 'UNCALIBRATED_MARGIN',
      'buildContext', 'chaptersInOrder', 'describeParts', 'headLines', 'isChapterBlocked', 'normalizeContextFields',
      'readSummary', 'stripTodos', 'tailLines'
    ]);
    for (const moved of ['estimateTokens', 'formatCount', 'DEFAULT_CHARS_PER_TOKEN']) expect(contextBuilder).not.toHaveProperty(moved);
  });
});

describe('normalizeContextFields', () => {
  test('missing fields get defaults; wrong types are repaired; a string avoid list is parsed', () => {
    const defaults = { brief: '', style: '', avoidWords: [], codex: [], codexLegacyHandled: [] };
    expect(normalizeContextFields({})).toEqual(defaults);
    expect(normalizeContextFields(undefined)).toEqual(defaults);
    expect(normalizeContextFields(null)).toEqual(defaults);
    expect(normalizeContextFields({ title: 'Kirja', structure: [] })).toEqual(defaults);

    expect(normalizeContextFields({
      brief: 12,
      style: ['a'],
      avoidWords: { 0: 'hehku' },
      codex: 'ei lista',
      codexLegacyHandled: 'characters:1'
    })).toEqual(defaults);

    const repaired = normalizeContextFields({
      brief: 'Romaani saaresta.',
      style: 'Lyhyet lauseet.',
      avoidWords: 'hehku, jotenkin; ”vain”\nHehku',
      codex: [{ id: 'a', name: 'Mari', type: 'hahmo', aliases: 'Maija, Marjatta', state: 'always' }, null, { id: 'a', name: 'Pekka' }],
      codexLegacyHandled: ['characters:char_1', 7, null, 'locations:Satama'],
      title: 'Ei kuulu tähän'
    });
    expect(Object.keys(repaired)).toEqual(['brief', 'style', 'avoidWords', 'codex', 'codexLegacyHandled']);
    expect(repaired.brief).toBe('Romaani saaresta.');
    expect(repaired.style).toBe('Lyhyet lauseet.');
    expect(repaired.avoidWords).toEqual(['hehku', 'jotenkin', '”vain”']);
    expect(repaired.codexLegacyHandled).toEqual(['characters:char_1', 'locations:Satama']);
    expect(repaired.codex).toHaveLength(2);
    expect(repaired.codex[0]).toMatchObject({ id: 'a', name: 'Mari', aliases: ['Maija', 'Marjatta'], exclude: [], description: '', state: 'always' });
    expect(repaired.codex[1]).toMatchObject({ name: 'Pekka', type: 'kasite', state: 'mentioned' });
    expect(repaired.codex[1].id).not.toBe('a');

    // A list keeps its strings as they were typed
    expect(normalizeContextFields({ avoidWords: ['hehku', 5, '”vain”', null] }).avoidWords).toEqual(['hehku', '”vain”']);
    // The builder also copes with a project that was not repaired
    const project = makeProject({ avoidWords: 'jotenkin, ”vain”; hehku' });
    expect(buildFixture({ project }).system).toContain('Älä käytä näitä sanoja tai ilmauksia: jotenkin, vain, hehku');
  });
});

/**
 * @jest-environment node
 */
const fs = require('fs');
const path = require('path');
const { scoreParagraph, scoreModel, loadTrials, report, maskSheet, REWRITTEN_RATIO } = require('../../scripts/score-step0');

const root = path.join(__dirname, '..', '..');
const folder = path.join(__dirname, '..', 'fixtures', 'step0');
const privateFolder = path.join(folder, 'private');
const sample = loadTrials([path.join(folder, 'sample.json')])[0];

// The model trial of 16 Nov 2026 (override 5 of the brief). Its cases are skipped when the material is not there.
const gatewayFolder = path.join(__dirname, '..', 'fixtures', 'step0-gateway');
const trialScripts = path.join(root, 'scripts', 'step0');
const gatewayTest = fs.existsSync(path.join(gatewayFolder, 'scores', 'v1.json')) ? test : test.skip;
const scorerTest = fs.existsSync(path.join(gatewayFolder, 'raw')) && fs.existsSync(path.join(trialScripts, 'score.js')) ? test : test.skip;
const scriptsTest = fs.existsSync(path.join(trialScripts, 'run.js')) ? test : test.skip;
// The volume writes "._name" files next to the real ones
const visible = (dir) => fs.readdirSync(dir).filter(name => !name.startsWith('.')).sort();

describe('step 0 trial: the sample', () => {
  test('counts fixed errors, wrong corrections and rewritten paragraphs per model', () => {
    const scores = {};
    for (const [model, replies] of Object.entries(sample.replies)) {
      const { rows, ...summary } = scoreModel(sample.paragraphs, replies);
      scores[model] = [summary.fixed, summary.errors, summary.wrong, summary.rewritten, summary.unusable, summary.passes];
      expect(rows).toHaveLength(3);
    }
    expect(scores).toEqual({
      'glm-5.3-flash-abliterated': [7, 7, 0, 0, 0, true],
      'deepseek-v4.1-flash-abliterated-fast': [5, 7, 2, 0, 0, true],
      'glm-5.3-abliterated': [7, 7, 2, 0, 0, true]
    });
  });

  test('a reply without the closing tag is unusable, not a row of corrections', () => {
    const paragraph = sample.paragraphs[0];
    expect(scoreParagraph(paragraph, '<teksti>Kissa istui ikkunalla ja kats')).toMatchObject({ usable: false, fixed: 0, wrong: 0 });
    // the errors are still counted, so a model that never finishes cannot pass
    expect(scoreModel([paragraph], { proosa: '<teksti>Kissa istui ikkunalla ja kats' })).toMatchObject({
      paragraphs: 1, unusable: 1, errors: 3, fixed: 0, passes: false
    });
  });

  test('corrections are counted on raw changes, and the wrapping quotation marks of a model go first', () => {
    const paragraph = { clean: 'Vanha kissa istui, kun satoi.', planted: 'Vanha kissa istui kun satoi.' };
    // merged, the rewrite would swallow the comma and count as no wrong correction
    expect(scoreParagraph(paragraph, '<teksti>Nuori kissa makasi, kun satoi.</teksti>')).toMatchObject({ fixed: 0, wrong: 1 });
    // without the original, the two quotation marks would be two wrong corrections
    expect(scoreParagraph(paragraph, '<teksti>”Vanha kissa istui, kun satoi.”</teksti>')).toMatchObject({ fixed: 1, wrong: 0 });
  });

  test('a reply that rewrites the paragraph and drops every placeholder is counted as rewritten; the notes are put back', () => {
    const paragraph = sample.paragraphs[0];
    const row = scoreParagraph(paragraph, '<teksti>Kissa katseli sadetta ikkunasta eikä saanut unta, sillä naapurin koira piti meteliä.</teksti>');
    expect(row.rewritten).toBe(true);
    expect(row.ratio).toBeGreaterThan(REWRITTEN_RATIO);
    expect(row.notesKept).toBe(true);
    // two notes and the emphasis around the one word that was replaced; two pairs went with their deleted words
    expect(row.repaired).toBe(3);
  });

  test('the report is in Finnish and the mask sheet shows what to send', () => {
    expect(report(sample)).toContain('korjatut virheet          7/7 (100 %)');
    expect(report(sample)).toContain('päätössääntö              täyttyy');
    expect(maskSheet(sample)).toContain('<teksti>Kissa istui ⟦1⟧ikkunalla⟦/1⟧ ja katseli kun sade ⟦2⟧ piiskasi');
  });

  // Cases beyond the named list

  test('the report of the sample begins exactly as documented', () => {
    const shown = report({ ...sample, file: 'test/fixtures/step0/sample.json' });
    expect(shown.split('\n').slice(0, 9).join('\n')).toBe([
      'Aineisto: test/fixtures/step0/sample.json (3 kappaletta)',
      'glm-5.3-flash-abliterated',
      '  korjatut virheet          7/7 (100 %)',
      '  väärät korjaukset         0',
      '  uusiksi kirjoitetut       0/3 (0 %)',
      '  käyttökelvottomat         0',
      '  TODO-merkinnät tallella   kyllä',
      '  palautetut paikkamerkit   0',
      '  päätössääntö              täyttyy'
    ].join('\n'));
    expect(shown.split('\n')).toHaveLength(1 + 3 * 8);
  });

  test('the other values of the report: no replies, a lost note, a rule that is not met', () => {
    expect(report({ file: 'oma.json', paragraphs: sample.paragraphs })).toBe(
      'Aineisto: oma.json (3 kappaletta)\n  Ei vastauksia. Aja --mask, lähetä tekstit mallille ja liitä vastaukset kohtaan "replies".'
    );
    const paragraphs = [
      { id: 'a', clean: 'Kissa istui, kun satoi.', planted: 'Kissa istui kun satoi.' },
      { id: 'b', clean: 'Koira nukkui [TODO: missä?] koko päivän.', planted: 'Koira nukkui [TODO: missä?] koko päivän.' }
    ];
    // nothing fixed, and a note of the model's own in the text
    const replies = { malli: { a: '<teksti>Kissa istui kun satoi.</teksti>', b: '<teksti>Koira nukkui ⟦1⟧ koko päivän. [TODO: lisäys]</teksti>' } };
    const shown = report({ file: 'oma.json', paragraphs, replies });
    expect(shown).toContain('  korjatut virheet          0/1 (0 %)');
    expect(shown).toContain('  TODO-merkinnät tallella   EI');
    expect(shown).toContain('  päätössääntö              ei täyty');
  });

  test('the rule of report 4.4: half of the errors, fewer wrong than fixed, under a fifth rewritten', () => {
    const paragraph = { id: 'a', clean: 'Kissa istui, kun satoi, ja koira nukkui.', planted: 'Kissa istui kun satoi ja koira nukkui.' };
    const score = (reply) => scoreModel([paragraph], { a: `<teksti>${reply}</teksti>` });
    expect(score('Kissa istui, kun satoi ja koira nukkui.')).toMatchObject({ errors: 2, fixed: 1, wrong: 0, passes: true });
    expect(score('Kissa istui kun satoi ja koira nukkui.')).toMatchObject({ fixed: 0, wrong: 0, passes: false });
    // one fixed, one wrong correction away from the errors: not fewer wrong than fixed
    expect(score('Kissa istui, kun satoi ja hauva nukkui.')).toMatchObject({ fixed: 1, wrong: 1, passes: false });
    // a change right next to an error counts as that error left unfixed, not as a wrong correction
    expect(score('Kissa makasi, kun satoi ja koira nukkui.')).toMatchObject({ fixed: 0, wrong: 0, passes: false });
    // everything right, but the only paragraph rewritten
    expect(score('Kissa istui, kun satoi, ja hauva torkkui sohvalla sikeästi.')).toMatchObject({ fixed: 2, rewritten: 1, passes: false });
    expect(scoreModel([paragraph], {})).toMatchObject({ paragraphs: 0, passes: false });
  });

  test('the mask sheet starts with the instruction and gives every paragraph in tags', () => {
    const sheet = maskSheet(sample).split('\n');
    expect(sheet[0]).toMatch(/^Ohje mallille: Tekstissä on paikkamerkkejä: /);
    expect(sheet.filter(line => line.startsWith('<teksti>') && line.endsWith('</teksti>'))).toHaveLength(3);
    expect(sheet.filter(line => /^\[\w+\]$/.test(line))).toEqual(['[proosa]', '[dialogi]', '[puhekieli]']);
    // the notes never leave the app
    expect(maskSheet(sample)).not.toContain('[TODO:');
  });

  test('loadTrials takes files and folders, skips dot files, and a file in another shape does not break the report', () => {
    const viaFolder = loadTrials([folder]);
    expect(viaFolder.map(trial => path.basename(trial.file))).toContain('sample.json');
    expect(viaFolder.every(trial => !path.basename(trial.file).startsWith('.'))).toBe(true);
    expect(loadTrials([])).toEqual([]);
    expect(report({ file: 'dataset.json', items: [] })).toContain('(0 kappaletta)');
    expect(report({ file: 'yksi.json', paragraphs: sample.paragraphs.slice(0, 1) })).toContain('Aineisto: yksi.json (1 kappale)');
    expect(maskSheet({ file: 'dataset.json', items: [] })).toMatch(/^Ohje mallille: /);
  });
});

describe('step 0 trial: every trial file', () => {
  const targets = [folder].concat(fs.existsSync(privateFolder) ? [privateFolder] : []);
  const trials = loadTrials(targets);

  test('there is at least the sample', () => {
    expect(trials.length).toBeGreaterThan(0);
  });

  test.each(trials.map(trial => [path.basename(trial.file), trial]))('%s: no reply loses or changes a [TODO: …] note', (_name, trial) => {
    for (const replies of Object.values(trial.replies || {})) {
      const score = scoreModel(trial.paragraphs, replies);
      expect(score.rows.filter(row => row.usable && !row.notesKept)).toEqual([]);
    }
  });
});

describe('step 0 trial: the model trial of 16 Nov 2026', () => {
  const MODELS = ['deepseek-v4.1-flash-abliterated-fast', 'deepseek-v4.1-flash-abliterated', 'glm-5.3-abliterated', 'glm-5.3-flash-abliterated'];
  const RUNS = ['v1', 'v1-toisto', 'v1-era28'];
  const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(gatewayFolder, ...parts), 'utf8'));

  gatewayTest('the stored scores of the trial say 55, 55, 53 and 46 of 57 for the main run', () => {
    const scores = readJson('scores', 'v1.json');
    expect(scores.map(score => score.model)).toEqual(MODELS);
    expect(scores.map(score => [score.fixed, score.planted])).toEqual([[55, 57], [55, 57], [53, 57], [46, 57]]);
    // the rest of the published row: wrong corrections, rewritten lines of 28
    expect(scores.map(score => [score.wrong, score.rewritten, score.lines])).toEqual([[1, 0, 28], [2, 0, 28], [2, 0, 28], [0, 0, 28]]);
  });

  // Cases beyond the named list

  gatewayTest('the material is whole: 28 lines, 57 planted errors, the prompt, four models in three runs', () => {
    const dataset = readJson('dataset.json');
    expect(Object.keys(dataset)).toEqual(['description', 'created', 'counts', 'items']);
    expect(dataset.items).toHaveLength(28);
    expect(dataset.items.reduce((sum, item) => sum + item.errors.length, 0)).toBe(57);
    expect(dataset.counts).toMatchObject({ lines: 28, plantedErrors: 57 });
    for (const item of dataset.items) {
      expect(Object.keys(item)).toEqual(['id', 'genre', 'batch', 'text', 'clean', 'errors', 'placeholders']);
      for (const error of item.errors) {
        expect(item.text).toContain(error.wrong);
        expect(item.clean).toContain(error.right);
      }
    }
    expect(fs.readFileSync(path.join(gatewayFolder, 'prompt.txt'), 'utf8')).toMatch(/^=== SYSTEM ===\n[\s\S]+\n=== USER ===\n/);
    expect(fs.existsSync(path.join(gatewayFolder, 'results.md'))).toBe(true);
    for (const run of RUNS) {
      expect(visible(path.join(gatewayFolder, 'raw', run))).toEqual(MODELS.map(model => `${model}.json`).sort());
      for (const model of MODELS) {
        const raw = readJson('raw', run, `${model}.json`);
        expect(raw.batches.length).toBeGreaterThan(0);
        for (const batch of raw.batches) expect(typeof batch.text).toBe('string');
        expect(raw.batches.flatMap(batch => batch.ids).sort()).toEqual(dataset.items.map(item => item.id).sort());
      }
      expect(readJson('scores', `${run}.json`).map(score => score.model)).toEqual(MODELS);
    }
  });

  gatewayTest('no stored reply or score holds a request header', () => {
    const files = [];
    const walk = (dir) => {
      for (const name of visible(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else files.push(full);
      }
    };
    walk(gatewayFolder);
    expect(files.length).toBeGreaterThanOrEqual(19);
    for (const file of files) {
      expect([path.basename(file), /x-api-key|Authorization|Bearer /.test(fs.readFileSync(file, 'utf8'))]).toEqual([path.basename(file), false]);
    }
  });

  scorerTest('the scorer of the trial gives the stored scores again, for all three runs', () => {
    const { scoreModel: scoreTrialModel } = require('../../scripts/step0/score.js');
    const items = readJson('dataset.json').items;
    for (const run of RUNS) {
      const results = visible(path.join(gatewayFolder, 'raw', run))
        .filter(name => name.endsWith('.json'))
        .map(name => scoreTrialModel(path.join(gatewayFolder, 'raw', run, name), { items, tag: run }));
      // through JSON, as the stored file went
      expect(JSON.parse(JSON.stringify(results))).toEqual(readJson('scores', `${run}.json`));
    }
    // the tag and the items have defaults: the file's own tag, the stored dataset
    const one = scoreTrialModel(path.join(gatewayFolder, 'raw', 'v1', `${MODELS[0]}.json`));
    expect([one.tag, one.fixed, one.planted]).toEqual(['v1', 55, 57]);
  });

  scorerTest('isFixed is the rule of the trial: the right form is there and the wrong one is not, at word boundaries', () => {
    const { isFixed } = require('../../scripts/step0/score.js');
    const error = { wrong: 'kellot kävi', right: 'kellot kävivät', type: 'kongruenssi' };
    expect(isFixed('Lapsena kuvittelin, että kellot kävivät kilpaa.', error)).toBe(true);
    // the wrong form is a beginning of the right one: only a boundary tells them apart
    expect(isFixed('Lapsena kuvittelin, että kellot kävi kilpaa.', error)).toBe(false);
    // changed to something else, or both forms present
    expect(isFixed('Lapsena kuvittelin, että kellot juoksivat kilpaa.', error)).toBe(false);
    expect(isFixed('kellot kävivät ja kellot kävi', error)).toBe(false);
    // an accepted alternative counts as the right form
    expect(isFixed('että kellot kulkivat kilpaa', { ...error, accept: ['kellot kulkivat'] })).toBe(true);
    // punctuation at the edge of a form needs no boundary: 62% inside 62%:n is still the wrong form
    expect(isFixed('Kyselyn mukaan 62 % vastaajista', { wrong: '62%', right: '62 %' })).toBe(true);
    expect(isFixed('Kyselyn mukaan 62% vastaajista', { wrong: '62%', right: '62 %' })).toBe(false);
    // ä and ö are letters for the boundary
    expect(isFixed('yönä', { wrong: 'yön', right: 'yö' })).toBe(false);
    // a form inside a longer word is not that form, on either side
    expect(isFixed('aamu ja hiilta', { wrong: 'ilta', right: 'aamu' })).toBe(true);
    expect(isFixed('aamulla', { wrong: 'ilta', right: 'aamu' })).toBe(false);
    expect(isFixed('huomenaamu', { wrong: 'ilta', right: 'aamu' })).toBe(false);
    expect(isFixed('', error)).toBe(false);
    expect(isFixed(null, error)).toBe(false);
  });

  scorerTest('parseResponse reads the numbered lines between the tags', () => {
    const { parseResponse } = require('../../scripts/step0/score.js');
    const parsed = parseResponse('Tässä:\n<teksti>\n[1] Eka rivi.\n[2] Toka rivi.\n</teksti>\nMuutin pilkun.', 2);
    expect([parsed.hasOpen, parsed.hasClose, parsed.format, parsed.outside]).toEqual([true, true, 'brackets', 'Tässä:\n\nMuutin pilkun.']);
    expect([...parsed.entries]).toEqual([[1, ['Eka rivi.']], [2, ['Toka rivi.']]]);
    expect(parseResponse('<teksti>\n1. Eka\n2. Toka\n3. Kolmas', 2)).toMatchObject({ hasClose: false, format: 'dotted', extraNumbers: [3] });
  });

  scriptsTest('the four trial scripts carry the re-run line, name no absolute path, and only run.js reads the key', () => {
    const header = '// Askeleen 0 mallikoe 16.11.2026. Uusinta: python3 <withkey.py> CHERRY_API_KEY node scripts/step0/run.js --tag <nimi>; sitten node scripts/step0/score.js --tag <nimi>.';
    for (const name of ['run.js', 'score.js', 'build_dataset.js', 'summary.js']) {
      const source = fs.readFileSync(path.join(trialScripts, name), 'utf8');
      expect([name, source.split('\n')[0]]).toEqual([name, header]);
      expect([name, /['"`]\/(?:Volumes|Users|private|tmp|var)\//.test(source)]).toEqual([name, false]);
      expect([name, source.includes('--data') && source.includes('--out')]).toEqual([name, true]);
      expect([name, source.includes('process.env.CHERRY_API_KEY')]).toEqual([name, name === 'run.js']);
    }
    const run = fs.readFileSync(path.join(trialScripts, 'run.js'), 'utf8');
    expect(run).toContain("require('@anthropic-ai/sdk')");
    expect(run).toContain('--base');
    expect(run).toContain("'http://127.0.0.1:23333'");
    // the key goes into the client and the request headers, and into redact(); never into a log line
    const keyLines = run.split('\n').filter(line => /\bKEY\b/.test(line));
    expect(keyLines.filter(line => /console\.|writeFileSync|appendFileSync/.test(line) && !line.includes('CHERRY_API_KEY puuttuu'))).toEqual([]);
    // an error text is redacted before it is cut: a key cut in half would not be found
    const redactArgs = [];
    for (let at = run.indexOf('redact('); at !== -1; at = run.indexOf('redact(', at + 1)) {
      let depth = 0;
      let end = at + 'redact'.length;
      do {
        if (run[end] === '(') depth += 1;
        if (run[end] === ')') depth -= 1;
        end += 1;
      } while (depth > 0 && end < run.length);
      redactArgs.push(run.slice(at, end));
    }
    expect(redactArgs.length).toBeGreaterThanOrEqual(2);
    expect(redactArgs.filter(call => call.includes('.slice('))).toEqual([]);
  });
});

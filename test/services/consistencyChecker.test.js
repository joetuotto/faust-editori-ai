// The consistency checker with its pattern rules (lead decision F2, 25 Nov 2026).
//
// The rules are tested one by one in consistencyRules.test.js. Here: what a whole run reports for
// the fixtures of the live checks (the sample project and the R2 fixtures kaksi and silmat), where
// the marks land, the auto-fix, and the wiring (the checker is a plain script; app.js hands it the
// rules).
const fs = require('fs');
const path = require('path');
const rules = require('../../src/services/validation/consistencyRules');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  require('../../src/utils/annotationTypes.js');
  require('../../src/services/validation/ConsistencyChecker.js');
});

afterAll(() => {
  console.log.mockRestore();
});

const NO_CONTRADICTION = '{"contradictions": []}';
const chapter = (id, title, content) => ({ id, title, content, annotations: [] });
const book = (characters, chapters, more = {}) => ({
  title: 'Koe',
  language: 'fi',
  ai: { provider: 'anthropic', models: {} },
  characters,
  locations: [{ id: 'loc-1', name: 'Asema' }, { id: 'loc-2', name: 'Talo mäellä' }],
  structure: chapters,
  ...more
});
// A checker whose model answers with the given text; the prompts it was sent are kept
const checkerFor = (project, answer = NO_CONTRADICTION) => {
  const prompts = [];
  const call = async (prompt) => { prompts.push(prompt); return { success: true, data: answer }; };
  return { checker: new window.ConsistencyChecker(project, {}, call), prompts };
};
// What the Projekti tab and the margin show of a finding
const shown = (error) => [window.ConsistencyChecker.markText(error), window.ConsistencyChecker.markFix(error)];

const KAKSI = () => book([{ id: 'char-1', name: 'Aino' }], [
  chapter('a', 'Eka', 'Aino saapui saarelle 1.5.2020 iltapäivällä. Aino oli väsynyt matkasta.'),
  chapter('b', 'Toka', 'Aino lähti kotoa 1.3.2019 aamulla. Aino oli iloinen ja levännyt.')
]);
const SILMAT = () => book([{ id: 'char-1', name: 'Aino' }], [
  chapter('a', 'Eka', 'Aino saapui saarelle iltapäivällä. Ainon siniset silmät olivat väsyneet matkasta.'),
  chapter('b', 'Toka', 'Aino lähti kotoa aamulla. Ainon ruskeat silmät loistivat, kun hän katsoi peiliin.')
]);
// The people and the kind of text of the sample project (visual/esimerkki.pohja.faust)
const SAMPLE = () => book([{ id: 'char-1', name: 'Aino Lehto' }, { id: 'char-2', name: 'Eero Salmi' }, { id: 'char-3', name: 'Asianajaja Koskinen' }], [
  chapter('chapter-1', 'Saapuminen', '# Saapuminen\n\nJuna pysähtyi asemalle hieman ennen puoltayötä. **Aino** nosti laukkunsa hyllyltä.\n\n– Onko tämä pääteasema? hän kysyi konduktööriltä.\n\n[TODO: tarkista junan aikataulu vuodelta 1998]\n\nVastaanoton takana istui vanha nainen, joka nosti katseensa vasta, kun Aino laski laukkunsa lattialle.\n\n- soittaa Eerolle'),
  chapter('chapter-2', 'Asianajajan luona', 'Asianajajan toimisto oli torin toisella puolella.\n\nAino nyökkäsi. Avaimeen oli kaiverrettu numero **17**.'),
  chapter('chapter-3', 'Talo mäellä', 'Talo seisoi mäen päällä, niin kuin se oli aina seissyt. Portti oli jäätynyt kiinni, ja Aino joutui kiipeämään aidan yli.')
]);

describe('a whole run reports only what a reader would agree with', () => {
  test('the sample project: no finding from any pattern rule', async () => {
    const { checker, prompts } = checkerFor(SAMPLE());
    const result = await checker.runFullCheck();
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.annotations).toEqual([]);
    // Aino is in three chapters: one request, with whole sentences and without the note
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('[Saapuminen]\n**Aino** nosti laukkunsa hyllyltä.');
    expect(prompts[0]).not.toContain('TODO');
  });

  test('R2 fixture silmat: only the model\'s finding; no place read from the eyes', async () => {
    const answer = JSON.stringify({ contradictions: [{
      type: 'physical_appearance', severity: 'high', message: 'Ainon silmien väri vaihtuu sinisestä ruskeaksi.',
      chapters: ['Eka', 'Toka'], evidence: ['siniset silmät', 'ruskeat silmät'], suggestedFix: 'Yhdenmukaista silmien väri.'
    }] });
    const { checker, prompts } = checkerFor(SILMAT(), answer);
    const result = await checker.runFullCheck();

    expect(result.errors.map(error => [error.type, ...shown(error)])).toEqual([
      ['character_inconsistency', 'Ainon silmien väri vaihtuu sinisestä ruskeaksi.', 'Yhdenmukaista silmien väri.']
    ]);
    // Nothing can fix what the model finds, so it is not marked as fixable
    expect(result.errors[0].autoFixable).toBe(false);
    await expect(checker.applyAutoFix(result.errors[0])).rejects.toThrow();
    expect(prompts[0]).toContain('[Eka]\nAino saapui saarelle iltapäivällä. Ainon siniset silmät olivat väsyneet matkasta.\n\n[Toka]\nAino lähti kotoa aamulla. Ainon ruskeat silmät loistivat, kun hän katsoi peiliin.');
  });

  test('R2 fixture kaksi: the timeline finding, its mark on the date, and the date reaches the model whole', async () => {
    const { checker, prompts } = checkerFor(KAKSI());
    const result = await checker.runFullCheck();

    expect(result.errors.map(error => [error.type, ...shown(error)])).toEqual([
      ['timeline_error', 'Toka (1.3.2019) tapahtuu ennen Eka (1.5.2020)', 'Tarkista aikajana – tapahtumat ovat väärässä järjestyksessä.']
    ]);
    expect(result.annotations).toHaveLength(1);
    expect(result.annotations[0]).toMatchObject({ type: 'ai_consistency', chapterId: 'a', position: 21, length: 8, priority: 'critical' });
    expect(checker.project.structure[0].annotations).toHaveLength(1);
    // Before F2 the sentence was cut at the first full stop of the date
    expect(prompts[0]).toContain('Aino saapui saarelle 1.5.2020 iltapäivällä. Aino oli väsynyt matkasta.');
  });

  test('a note is not manuscript text for any rule', async () => {
    const project = book([{ id: 'char-1', name: 'Katariina' }], [
      chapter('a', 'Eka', 'Katariina saapui saarelle 1.5.2020. [TODO: Katariina oli Helsingissä. Onko nimi Katarina? Päivä 1.1.2021?]'),
      chapter('b', 'Toka', 'Katariina heräsi 2.5.2020. [TODO: Katariina oli Turussa. Vai 1.3.2019? Katarina!]')
    ]);
    const { checker, prompts } = checkerFor(project);
    const result = await checker.runFullCheck();
    expect(result.errors).toEqual([]);
    expect(prompts[0]).not.toContain('TODO');
    expect(prompts[0]).not.toContain('Turussa');
  });

  test('a mark stands on the text, not on the same words inside a note before it', async () => {
    const project = book([{ id: 'char-1', name: 'Katariina' }], [
      chapter('a', 'Eka', '[TODO: 1.5.2020 vai myöhemmin? Katarina?] Illalla Katariina saapui saarelle 1.5.2020, ja ovella seisoi Katarina.'),
      chapter('b', 'Toka', 'Aamulla Katariina lähti kotoa 1.3.2019.')
    ]);
    const { checker } = checkerFor(project);
    const result = await checker.runFullCheck();
    const text = project.structure[0].content;

    expect(result.errors.map(error => error.type).sort()).toEqual(['name_variation', 'timeline_error']);
    const marks = result.annotations.map(mark => [mark.content, text.slice(mark.position, mark.position + mark.length), mark.position]).sort();
    expect(marks).toEqual([
      ['Nimen kirjoitusasu vaihtelee: Katariina, Katarina', 'Katarina', text.lastIndexOf('Katarina')],
      ['Toka (1.3.2019) tapahtuu ennen Eka (1.5.2020)', '1.5.2020', text.lastIndexOf('1.5.2020')]
    ]);
    expect(result.annotations.find(mark => mark.content.startsWith('Nimen')).aiSuggestion).toBe('Käytä kaikkialla muotoa ”Katariina”.');
  });

  test('an occurrence without a place of its own is still found by its words', () => {
    const { checker } = checkerFor(KAKSI());
    const mark = checker.errorToAnnotation({
      id: 'x', type: 'timeline_error', severity: 'critical', description: 'd',
      occurrences: [{ chapterId: 'b', chapterTitle: 'Toka', content: '1.3.2019' }]
    });
    expect(mark).toMatchObject({ chapterId: 'b', position: 17, length: 8 });
    // A place that does not fit the chapter's text is not used
    const odd = checker.errorToAnnotation({
      id: 'y', type: 'timeline_error', severity: 'critical', description: 'd',
      occurrences: [{ chapterId: 'b', content: '1.3.2019', position: 900, length: 8 }]
    });
    expect(odd).toMatchObject({ position: 17, length: 8 });
  });
});

describe('the auto-fix of a name variation', () => {
  const project = () => book([{ id: 'char-1', name: 'Väinö Lehto' }], [
    chapter('a', 'Eka', 'Illalla Väinö tuli kotiin. Sitten Väinnö söi, ja Väinnön kissa nukkui Väinön sylissä. [TODO: Väinnö?]'),
    chapter('b', 'Toka', 'Aamulla herra Lehto ja Väinö lähtivät.')
  ]);

  test('the stem is replaced, the ending and the note stay, and the app\'s objects are not changed', async () => {
    const before = project();
    const { checker } = checkerFor(before);
    const [error] = await checker.checkNamingConsistency();
    expect(error).toMatchObject({ characterName: 'Väinö', variations: ['Väinö', 'Väinnö'], autoFixable: true });

    const firstChapter = before.structure[0];
    const text = firstChapter.content;
    const result = await checker.applyAutoFix(error);

    expect(result).toMatchObject({ success: true, correctName: 'Väinö', fixCount: 2 });
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]).toMatchObject({ id: 'a', content: 'Illalla Väinö tuli kotiin. Sitten Väinö söi, ja Väinön kissa nukkui Väinön sylissä. [TODO: Väinnö?]' });
    expect(checker.project.structure[0].content).toBe(result.chapters[0].content);
    // New objects: the project and the chapter the app holds are as they were
    expect(checker.project).not.toBe(before);
    expect(checker.project.structure[0]).not.toBe(firstChapter);
    expect(checker.project.structure[1]).toBe(before.structure[1]);
    expect(firstChapter.content).toBe(text);
    // Nothing is left to report
    expect(await checker.checkNamingConsistency()).toEqual([]);
  });

  test('a variation that cannot be fixed safely is not auto-fixable, and nothing changes', async () => {
    const before = book([{ id: 'char-1', name: 'Pekka' }], [chapter('a', 'Eka', 'Illalla Pekka tuli kotiin. Sitten Peka söi, ja Pekan kissa nukkui.')]);
    const { checker } = checkerFor(before);
    const [error] = await checker.checkNamingConsistency();
    expect(error).toMatchObject({ variations: ['Pekka', 'Peka'], autoFixable: false });
    await expect(checker.applyAutoFix(error)).rejects.toThrow('Error is not auto-fixable');
    // Also when a caller claims it is fixable
    expect(() => checker.fixNameVariations({ ...error, autoFixable: true })).toThrow('Error is not auto-fixable');
    expect(checker.project).toBe(before);
    expect(before.structure[0].content).toBe('Illalla Pekka tuli kotiin. Sitten Peka söi, ja Pekan kissa nukkui.');
  });
});

describe('the checker gets its rules from app.js', () => {
  test('the rules handed to the constructor are the ones used', async () => {
    const own = { ...rules, nameFindings: jest.fn(() => []), timelineFindings: jest.fn(() => []), locationFindings: jest.fn(() => []) };
    const checker = new window.ConsistencyChecker(KAKSI(), null, null, own);
    const result = await checker.runFullCheck();
    expect(result.errors).toEqual([]);
    expect(own.nameFindings).toHaveBeenCalledWith(checker.project);
    expect(own.timelineFindings).toHaveBeenCalledTimes(1);
    expect(own.locationFindings).toHaveBeenCalledTimes(1);
  });

  test('app.js imports the rules and hands every one the checker calls', () => {
    const app = fs.readFileSync(path.join(__dirname, '..', '..', 'app.js'), 'utf8');
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'services', 'validation', 'ConsistencyChecker.js'), 'utf8');
    const called = [...new Set(Array.from(source.matchAll(/(?:rules|this\.patternRules\(\))\.(\w+)\(/g), match => match[1]))].sort();
    expect(called).toEqual(['locationFindings', 'mentionSentences', 'nameFindings', 'planNameFix', 'timelineFindings']);

    const imported = /import \{([^}]*)\} from '\.\/src\/services\/validation\/consistencyRules\.js';/.exec(app);
    const handed = /new window\.ConsistencyChecker\(\s*project,\s*window\.electronAPI,\s*callAIStable,[^\n]*\n\s*\{([^}]*)\}\s*\)/.exec(app);
    expect(imported).not.toBeNull();
    expect(handed).not.toBeNull();
    const names = (list) => list.split(',').map(name => name.trim()).filter(Boolean).sort();
    expect(names(imported[1])).toEqual(called);
    expect(names(handed[1])).toEqual(called);
    for (const name of called) expect(typeof rules[name]).toBe('function');
  });

  test('the checker has no pattern of its own for names, dates or places', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'services', 'validation', 'ConsistencyChecker.js'), 'utf8');
    expect(source).not.toMatch(/new RegExp\(/);
    expect(source).not.toMatch(/\\b/);
    for (const gone of ['isFormOfName', 'mentionPattern', 'extractCharacterLocation']) expect(source).not.toContain(gone);
  });
});

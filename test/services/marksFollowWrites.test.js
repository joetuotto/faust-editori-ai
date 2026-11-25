// Margin marks follow every path that writes a chapter's text (F1).
//
// The rule is in src/editor/annotationMapping.js (test/editor/annotationMapping.test.js) and the history's part in
// src/utils/CommandManager.js (test/utils/CommandManager.test.js). This file checks the paths around them: the one
// project setter of app.js that every write passes, the change list from the editor and from Korvaa kaikki, the
// version restore (which used to change the chapter in place, so no update ever saw the text before it), and the
// consistency checker's marks arriving on a text that changed during the run.
//
// No docblock: jsdom, because RefinementManager.js is a plain script that hangs itself on window.
const fs = require('fs');
const path = require('path');
const { followEdits } = require('../../src/editor/annotationMapping');

const read = (file) => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  require('../../src/services/ai/RefinementManager.js');
});
afterAll(() => console.log.mockRestore());

const V1 = 'Aino astui laiturille. Asemalla ei ollut ketään. Hän nosti laukkunsa ja lähti kävelemään.';
const V2 = 'Oli jo ilta, kun juna pysähtyi. Aino astui laiturille. Asemalla ei ollut ketään. Hän nosti laukkunsa ja lähti kävelemään.';
const noteOn = (text, words, id) => ({ id, type: 'user_note', position: text.indexOf(words), length: words.length, content: 'Huomautus' });

describe('Palauta versio (RefinementManager.restoreVersion)', () => {
  // The app's state and its setter: every update through followEdits, as in app.js
  function setup() {
    const marks = [noteOn(V2, 'laukkunsa', 'm1')];
    let project = {
      title: 'Talo mäellä',
      structure: [{
        id: 'ch1', title: 'Saapuminen', content: V2, wordCount: 18, currentVersion: 'v2', annotations: marks,
        versions: [{ id: 'v1', content: V1, timestamp: '2026-11-01T10:00:00.000Z' }, { id: 'v2', content: V2, timestamp: '2026-11-02T10:00:00.000Z' }]
      }]
    };
    const setProject = (update, edit) => { project = followEdits(project, typeof update === 'function' ? update(project) : update, edit); };
    const manager = new window.RefinementManager(project, setProject, async () => '');
    return { manager, marks, state: () => project, rendered: project };
  }

  test('the restored text is written as a new chapter object: the state before is not changed in place', () => {
    const { manager, state, rendered } = setup();
    const before = rendered.structure[0];
    manager.restoreVersion('ch1', 'v1');
    expect(before.content).toBe(V2);                 // was overwritten in place before F1
    expect(before.currentVersion).toBe('v2');
    expect(state().structure[0]).not.toBe(before);
    expect(state().structure[0]).toMatchObject({ content: V1, currentVersion: 'v1', wordCount: 13 });
    expect(state().structure[0].versions).toHaveLength(2);
  });

  test('the chapter\'s marks follow the restored text', () => {
    const { manager, marks, state } = setup();
    manager.restoreVersion('ch1', 'v1');
    const [moved] = state().structure[0].annotations;
    expect(V1.slice(moved.position, moved.position + moved.length)).toBe('laukkunsa');
    expect(moved.position).toBe(marks[0].position - 'Oli jo ilta, kun juna pysähtyi. '.length);
    expect(marks[0].position).toBe(V2.indexOf('laukkunsa'));
  });

  test('an unknown version or chapter still throws, and nothing is written', () => {
    const { manager, state, rendered } = setup();
    expect(() => manager.restoreVersion('ch1', 'v9')).toThrow('Version v9 not found');
    expect(() => manager.restoreVersion('ch9', 'v1')).toThrow('Chapter ch9 not found');
    expect(state()).toBe(rendered);
  });
});

describe('the wiring of app.js and FaustEditor.js', () => {
  const app = read('app.js');
  const editor = read('src/components/FaustEditor.js');

  test('there is one project setter, and every update goes through followEdits in it', () => {
    expect(app).toContain("import { followEdits, mapAnnotationsBetween } from './src/editor/annotationMapping.js';");
    expect(app).toMatch(/const \[project, setProjectState\] = useState\(createDefaultProject\);/);
    expect(app).toMatch(/const setProject = useRef\(\(update, edit\) => setProjectState\(prev =>\s*followEdits\(prev, typeof update === 'function' \? update\(prev\) : update, edit\)\)\)\.current;/);
    // React's own setter is used nowhere else: no write of the project can pass the marks by
    expect(app.match(/setProjectState\(/g)).toHaveLength(1);
  });

  test('the editor hands its change list to onChange, and the app hands it to the step of the history', () => {
    expect(editor).toMatch(/onChangeRef\.current\(text, smart \? \{ noMerge: true, source: 'smart-typing' \} : readSuggestionMeta\(update\), changes\);/);
    expect(app).toContain('onChange: (text, meta, changes) => updateChapterContent(text, false, meta, changes),');
    expect(app).toContain('const updateChapterContent = (newContent, skipHistory = false, meta = null, changes = null) => {');
    expect(app).toMatch(/new window\.UpdateContentCommand\(\s*setProject,\s*activeChapter\.id,\s*oldContent,\s*newContent,\s*meta,\s*changes\s*\)/);
    // The two writes without a history step tell the setter the same
    expect(app).toMatch(/\}\), \{ chapterId: activeChapter\.id, changes \}\);/);
    expect(app).toMatch(/\}\), \{ chapterId, changes \}\);/);
  });

  test('Korvaa kaikki hands the hits of each chapter as its change list', () => {
    expect(app).toContain('changes.push({ chapter, content, text: replaced.text, ranges: replaced.changes });');
    expect(app).toContain('changes.forEach(change => setChapterText(change.chapter.id, change.content, change.text, null, change.ranges));');
    expect(app).toContain('new window.UpdateContentCommand(setProject, chapterId, oldContent, newContent, meta, changes)');
  });

  test('a change from outside the editor has the margin measured again, only where there are marks', () => {
    // In the effect that mirrors an outside change, after the change has been dispatched into the editor
    const mirrored = editor.indexOf('annotations: External.of(true)');
    const called = editor.indexOf('if (onExternalChangeRef.current) onExternalChangeRef.current();');
    const effectEnd = editor.indexOf('}, [value]);');
    expect(mirrored).toBeGreaterThan(-1);
    expect(called).toBeGreaterThan(mirrored);
    expect(effectEnd).toBeGreaterThan(called);
    expect(editor).toContain('onExternalChangeRef.current = onExternalChange;');
    expect(app).toMatch(/onExternalChange: \(\) => \{\s*if \(\(activeChapter\.annotations \|\| \[\]\)\.length > 0\) setEditorDimensions\(dimensions => \(\{ \.\.\.dimensions \}\)\);\s*\},/);
  });

  test('the consistency checker\'s marks are moved onto the text as it is when they arrive', () => {
    expect(app).toContain('...mapAnnotationsBetween((stale.annotations || []).filter(a => a.type === AI_CONSISTENCY), stale.content, ch.content)');
  });
});

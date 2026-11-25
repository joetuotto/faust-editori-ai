// AnnotationUtils (src/utils/annotationTypes.js) and the consistency checker's marks.
//
// Final pass, T-004 (lead decision "Pre-existing defect"; I-01 finding 1): createAnnotation dropped
// chapterId and chapterIndex, so ConsistencyChecker.mergeAnnotationsIntoProject skipped every mark
// and the checker never wrote one into a chapter. Both files are plain scripts that set
// window.AnnotationUtils and window.ConsistencyChecker; jsdom gives them their window.

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  require('../../src/utils/annotationTypes.js');
  require('../../src/services/validation/ConsistencyChecker.js');
});

afterAll(() => {
  console.log.mockRestore();
});

const utils = () => window.AnnotationUtils;

describe('createAnnotation', () => {
  test('keeps chapterId and chapterIndex when they are given, as the consistency checker gives them', () => {
    const { createAnnotation, ANNOTATION_TYPES, ANNOTATION_PRIORITY } = utils();
    const annotation = createAnnotation({
      type: ANNOTATION_TYPES.AI_CONSISTENCY,
      position: 12,
      length: 5,
      content: 'Luku 2 tapahtuu ennen lukua 1',
      priority: ANNOTATION_PRIORITY.CRITICAL,
      metadata: { errorId: 'timeline-1' },
      aiSuggestion: 'Tarkista aikajana.',
      source: 'ai',
      chapterId: 'ch-2',
      chapterIndex: 1
    });

    expect(annotation).toMatchObject({
      type: 'ai_consistency',
      position: 12,
      length: 5,
      content: 'Luku 2 tapahtuu ennen lukua 1',
      priority: 'critical',
      color: null,
      source: 'ai',
      aiSuggestion: 'Tarkista aikajana.',
      metadata: { errorId: 'timeline-1' },
      resolved: false,
      chapterId: 'ch-2',
      chapterIndex: 1
    });
    expect(annotation.id).toMatch(/^ann_\d+_[a-z0-9]+$/);
    // The first chapter is index 0, not "no index"
    expect(createAnnotation({ type: 'ai_consistency', position: 0, content: 'x', chapterId: 'ch-1', chapterIndex: 0 }).chapterIndex).toBe(0);
  });

  test('a note made without a chapter has neither key, as before', () => {
    const { createAnnotation, ANNOTATION_TYPES, ANNOTATION_PRIORITY } = utils();
    const note = createAnnotation({ type: ANNOTATION_TYPES.USER_NOTE, position: 3, length: 0, content: 'Tarkista.', priority: ANNOTATION_PRIORITY.INFO });

    expect('chapterId' in note).toBe(false);
    expect('chapterIndex' in note).toBe(false);
    expect(Object.keys(note).sort()).toEqual([
      'aiSuggestion', 'color', 'content', 'createdAt', 'id', 'length', 'metadata', 'position', 'priority', 'resolved', 'source', 'type', 'updatedAt'
    ]);
    // A value that is no chapter id or index is not stored
    const odd = createAnnotation({ type: 'user_note', position: 0, content: 'x', chapterId: '', chapterIndex: -1 });
    expect('chapterId' in odd || 'chapterIndex' in odd).toBe(false);
    expect('chapterIndex' in createAnnotation({ type: 'user_note', position: 0, content: 'x', chapterIndex: 1.5 })).toBe(false);
  });
});

describe('the consistency checker puts its marks into the chapters (T-004)', () => {
  const timelineError = (chapterId) => ({
    id: 'timeline-1',
    type: 'timeline_error',
    severity: 'critical',
    category: 'timeline',
    message: 'Timeline contradiction',
    description: 'Saapuminen (1.3.2024) tapahtuu ennen Lähtö (5.3.2024)',
    occurrences: [{ chapterId, chapterTitle: 'Lähtö', content: '5.3.2024', context: '' }],
    suggestedFix: 'Tarkista aikajana – tapahtumat ovat väärässä järjestyksessä.',
    autoFixable: false
  });

  const project = () => ({
    structure: [
      { id: 'ch-a', title: 'Lähtö', content: 'Aino lähti 5.3.2024 kotoa.', annotations: [] },
      { id: 'ch-b', title: 'Saapuminen', content: 'Aino saapui 1.3.2024.', annotations: [] }
    ]
  });

  test('a mark lands in the chapter of its occurrence, by id, with its Finnish text', () => {
    const checker = new window.ConsistencyChecker(project(), null, null);
    const annotation = checker.errorToAnnotation(timelineError('ch-a'));

    expect(annotation).toMatchObject({
      type: 'ai_consistency',
      chapterId: 'ch-a',
      chapterIndex: 0,
      position: 'Aino lähti '.length,
      length: '5.3.2024'.length,
      priority: 'critical',
      source: 'ai',
      // The margin never shows the checker's English message
      content: 'Saapuminen (1.3.2024) tapahtuu ennen Lähtö (5.3.2024)',
      aiSuggestion: 'Tarkista aikajana – tapahtumat ovat väärässä järjestyksessä.'
    });

    const before = checker.project;
    checker.mergeAnnotationsIntoProject([annotation], { replaceAll: true });
    expect(checker.project.structure[0].annotations).toEqual([annotation]);
    expect(checker.project.structure[1].annotations).toEqual([]);
    // The app's state is not mutated: the checker holds a new project
    expect(before.structure[0].annotations).toEqual([]);
    expect(checker.project).not.toBe(before);
    expect(checker.project.structure[1]).toBe(before.structure[1]);
  });

  test('a reordered project and a note added meanwhile: the mark goes by id and the note stays', () => {
    const checker = new window.ConsistencyChecker(project(), null, null);
    const annotation = checker.errorToAnnotation(timelineError('ch-a'));

    // While the check ran the author moved Saapuminen first and added a note to Lähtö
    const note = utils().createAnnotation({ type: 'user_note', position: 0, content: 'Oma huomautus.', priority: 'info' });
    const now = project();
    checker.project = { ...now, structure: [now.structure[1], { ...now.structure[0], annotations: [note] }] };
    checker.mergeAnnotationsIntoProject([annotation], { replaceAll: true });

    expect(checker.project.structure.map(ch => ch.id)).toEqual(['ch-b', 'ch-a']);
    expect(checker.project.structure[0].annotations).toEqual([]);
    expect(checker.project.structure[1].annotations).toEqual([note, annotation]);
  });

  test('a complete run replaces the earlier marks everywhere; a run with failures only where it marked', () => {
    const old = utils().createAnnotation({ type: 'ai_consistency', position: 0, content: 'Vanha.', chapterId: 'ch-b', chapterIndex: 1 });
    const note = utils().createAnnotation({ type: 'user_note', position: 0, content: 'Oma.' });
    const start = project();
    start.structure[1].annotations = [old, note];

    const incomplete = new window.ConsistencyChecker(start, null, null);
    incomplete.mergeAnnotationsIntoProject([], { replaceAll: false });
    expect(incomplete.project).toBe(start);

    const complete = new window.ConsistencyChecker(start, null, null);
    complete.mergeAnnotationsIntoProject([], { replaceAll: true });
    expect(complete.project.structure[1].annotations).toEqual([note]);
    expect(complete.project.structure[0]).toBe(start.structure[0]);
  });

  test('runFullCheck writes the mark of a timeline contradiction it finds itself', async () => {
    const checker = new window.ConsistencyChecker(project(), null, null);
    // Only the local checks run: without electronAPI the character check asks nothing
    jest.spyOn(checker, 'checkTimeline').mockResolvedValue([timelineError('ch-a')]);
    const result = await checker.runFullCheck();

    expect(result.success).toBe(true);
    expect(result.annotations).toHaveLength(1);
    expect(checker.project.structure.find(ch => ch.id === 'ch-a').annotations).toEqual(result.annotations);
  });

  test('the fix texts the local checks write: an en dash, the relative clause in commas, a full stop (final-pass review)', async () => {
    // Shown on the margin card and the Projekti tab as "Korjausehdotus: …" (menu spec A, B.13)
    // F2 (25 Nov 2026), by the lead's decision: a place is taken only from a clear statement, so the
    // place stands alone in its clause here; and the place words are shown as the text writes them
    // (no ending is cut off any more: "Helsingi", "Turu"), so the fix sentence no longer repeats them.
    const checker = new window.ConsistencyChecker({
      characters: [{ id: 'c1', name: 'Aino' }],
      structure: [
        { id: 'ch-a', title: 'Eka', content: 'Aino oli Helsingissä. Oli 1.5.2020.', annotations: [] },
        { id: 'ch-b', title: 'Toka', content: 'Aino oli Turussa. Oli 1.3.2019.', annotations: [] }
      ]
    }, null, null);
    const [timeline] = await checker.checkTimeline();
    expect(timeline.suggestedFix).toBe('Tarkista aikajana – tapahtumat ovat väärässä järjestyksessä.');
    expect(window.ConsistencyChecker.markFix(timeline)).toBe('Tarkista aikajana – tapahtumat ovat väärässä järjestyksessä.');
    const [location] = await checker.checkLocationConsistency();
    expect(location.description).toBe('Aino: Helsingissä (Eka) → Turussa (Toka)');
    expect(location.suggestedFix).toBe('Lisää kohtaus, jossa Aino siirtyy paikasta toiseen, tai korjaa sijaintiviittaukset.');
  });

  test('the English texts the checker writes itself become Finnish in the margin', () => {
    const { markText, markFix } = window.ConsistencyChecker;
    const naming = { type: 'name_variation', characterName: 'Aino', variations: ['Aino', 'Ainoa'], message: 'Possible name variations: Ainoa', suggestedFix: 'Standardize to "Aino"' };
    expect(markText(naming)).toBe('Nimen kirjoitusasu vaihtelee: Aino, Ainoa');
    expect(markFix(naming)).toBe('Käytä kaikkialla muotoa ”Aino”.');

    const location = { type: 'location_inconsistency', message: "Aino's location changes without explanation", description: 'Aino: asema (Lähtö) → talo (Saapuminen)', suggestedFix: 'Lisää kohtaus.' };
    expect(markText(location)).toBe('Aino: asema (Lähtö) → talo (Saapuminen)');
    expect(markFix(location)).toBe('Lisää kohtaus.');

    const character = { type: 'character_inconsistency', message: 'Silmien väri vaihtuu.', suggestedFix: 'Manual review needed' };
    expect(markText(character)).toBe('Silmien väri vaihtuu.');
    expect(markFix(character)).toBe('Tarkista käsin.');
    expect(markFix({ type: 'character_inconsistency', message: 'x' })).toBeNull();
  });
});

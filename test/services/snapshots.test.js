/**
 * @jest-environment node
 */
const { buildSnapshot, addAutoSnapshot, pruneBulkSnapshots } = require('../../src/services/project/snapshots');

const now = new Date('2026-11-16T10:00:00.000Z');
const minutesLater = (minutes) => new Date(now.getTime() + minutes * 60000);

function makeProject() {
  return {
    title: 'Saaren kirja',
    structure: [
      { id: 'a', title: 'Eka', content: 'yksi kaksi', order: 0 },
      { id: 'b', title: 'Toka', content: 'kolme', order: 1, children: [{ id: 'b1', title: 'Kohtaus', content: 'neljä viisi kuusi' }] }
    ],
    snapshots: []
  };
}

// A stored snapshot, as the list in the project file holds it
function stored(name, minutes, auto) {
  const snapshot = { id: `snapshot-${name}-${minutes}`, name, created: minutesLater(minutes).toISOString(), structure: [] };
  if (auto) snapshot.auto = auto;
  return snapshot;
}

const names = (snapshots) => snapshots.map(snapshot => snapshot.name);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe('buildSnapshot', () => {
  test('buildSnapshot copies the structure deeply and counts words and chapters', () => {
    const project = makeProject();
    const snapshot = buildSnapshot(project, { name: 'Ennen muutosta', description: 'Kuvaus', now });

    expect(snapshot).toEqual({
      id: 'snapshot-1794823200000',
      name: 'Ennen muutosta',
      description: 'Kuvaus',
      created: '2026-11-16T10:00:00.000Z',
      totalWords: 6,
      chapterCount: 2,
      structure: project.structure
    });
    expect(snapshot.structure).not.toBe(project.structure);
    expect(snapshot.structure[0]).not.toBe(project.structure[0]);
    expect(snapshot.structure[1].children[0]).not.toBe(project.structure[1].children[0]);

    // Later edits of the project do not reach the snapshot
    project.structure[0].content = 'muutettu teksti kokonaan toiseksi';
    project.structure[1].children[0].content = '';
    project.structure.push({ id: 'c', content: 'uusi' });
    expect(snapshot.structure[0].content).toBe('yksi kaksi');
    expect(snapshot.structure[1].children[0].content).toBe('neljä viisi kuusi');
    expect(snapshot.structure).toHaveLength(2);
  });

  test('buildSnapshot marks an automatic snapshot and leaves a manual one unmarked', () => {
    const project = makeProject();
    expect(buildSnapshot(project, { name: 'Tuonti', now, auto: 'import' }).auto).toBe('import');
    expect(buildSnapshot(project, { name: 'Hyväksy kaikki', now, auto: 'bulk' }).auto).toBe('bulk');

    const manual = buildSnapshot(project, { name: 'Oma', now });
    expect('auto' in manual).toBe(false);
    expect(manual.description).toBe('');
    // Only the two kinds of the project file are written
    expect('auto' in buildSnapshot(project, { name: 'Oma', now, auto: 'muu' })).toBe(false);
  });

  test('the snapshot keeps ä ö å, ”, – and [TODO: …] of the chapter text unchanged', () => {
    const content = '– Tule, sanoi Åke.\n\n- Hei, sanoi Äiti.\n\n[TODO: tarkista lautan aikataulu]\n\nHän <u>juoksi</u> ”kotiin” – ja jäi öljyyn.';
    const project = { structure: [{ id: 'a', title: 'Äidin yö', content, synopsis: 'Åke ja ”Äiti” – öisin.' }], snapshots: [] };
    const snapshot = buildSnapshot(project, { name: 'Ennen tuontia: Äidin kirja', now, auto: 'import' });

    expect(snapshot.structure[0].content).toBe(content);
    expect(snapshot.structure[0].title).toBe('Äidin yö');
    expect(snapshot.structure[0].synopsis).toBe('Åke ja ”Äiti” – öisin.');
    expect(snapshot.name).toBe('Ennen tuontia: Äidin kirja');
    expect(snapshot.totalWords).toBe(19);
  });

  test('the shape is the one the snapshot panel reads, in the same key order as createSnapshot', () => {
    const snapshot = buildSnapshot(makeProject(), { name: 'Oma', description: 'x', now, auto: 'bulk' });
    expect(Object.keys(snapshot)).toEqual(['id', 'name', 'description', 'created', 'totalWords', 'chapterCount', 'structure', 'auto']);
  });

  test('a project without chapters gives an empty snapshot, and the time defaults to now', () => {
    const before = Date.now();
    const snapshot = buildSnapshot({}, { name: 'Tyhjä' });
    expect(snapshot.totalWords).toBe(0);
    expect(snapshot.chapterCount).toBe(0);
    expect(snapshot.structure).toEqual([]);
    expect(Date.parse(snapshot.created)).toBeGreaterThanOrEqual(before);
    expect(snapshot.id).toBe(`snapshot-${Date.parse(snapshot.created)}`);
  });
});

describe('pruneBulkSnapshots', () => {
  test('pruneBulkSnapshots keeps the newest three bulk snapshots', () => {
    const snapshots = [
      stored('b1', 1, 'bulk'), stored('b2', 2, 'bulk'), stored('b3', 3, 'bulk'), stored('b4', 4, 'bulk'), stored('b5', 5, 'bulk')
    ];
    expect(names(pruneBulkSnapshots(snapshots))).toEqual(['b3', 'b4', 'b5']);
    expect(names(pruneBulkSnapshots(snapshots, 1))).toEqual(['b5']);
    expect(names(pruneBulkSnapshots(snapshots, 0))).toEqual([]);
    expect(names(pruneBulkSnapshots(snapshots, 9))).toEqual(['b1', 'b2', 'b3', 'b4', 'b5']);
    // Infinity keeps all; only a value that is no number falls back to three
    expect(names(pruneBulkSnapshots(snapshots, Infinity))).toEqual(['b1', 'b2', 'b3', 'b4', 'b5']);
    expect(names(pruneBulkSnapshots(snapshots, NaN))).toEqual(['b3', 'b4', 'b5']);
  });

  test('pruneBulkSnapshots never removes manual or import snapshots', () => {
    const snapshots = [
      stored('oma 1', 0), stored('b1', 1, 'bulk'), stored('tuonti', 2, 'import'), stored('b2', 3, 'bulk'),
      stored('oma 2', 4), stored('b3', 5, 'bulk'), stored('b4', 6, 'bulk'), stored('tuonti 2', 7, 'import')
    ];
    expect(names(pruneBulkSnapshots(snapshots))).toEqual(['oma 1', 'tuonti', 'b2', 'oma 2', 'b3', 'b4', 'tuonti 2']);
    expect(names(pruneBulkSnapshots(snapshots, 0))).toEqual(['oma 1', 'tuonti', 'oma 2', 'tuonti 2']);
  });

  test('newest is by the time taken, not by the place in the list', () => {
    const snapshots = [stored('uusin', 9, 'bulk'), stored('vanhin', 1, 'bulk'), stored('keski', 5, 'bulk'), stored('toka', 7, 'bulk')];
    expect(names(pruneBulkSnapshots(snapshots))).toEqual(['uusin', 'keski', 'toka']);
    expect(names(pruneBulkSnapshots(snapshots, 2))).toEqual(['uusin', 'toka']);
  });

  test('of snapshots taken at the same moment the later one in the list is the newer', () => {
    const snapshots = [stored('a', 1, 'bulk'), stored('b', 1, 'bulk'), stored('c', 1, 'bulk'), stored('d', 1, 'bulk')];
    expect(names(pruneBulkSnapshots(snapshots))).toEqual(['b', 'c', 'd']);
    expect(names(pruneBulkSnapshots(snapshots, 1))).toEqual(['d']);
  });

  test('gives a new array, leaves the input alone, and a non-array gives an empty list', () => {
    const snapshots = deepFreeze([stored('b1', 1, 'bulk'), stored('oma', 2)]);
    const pruned = pruneBulkSnapshots(snapshots);
    expect(pruned).toEqual(snapshots);
    expect(pruned).not.toBe(snapshots);

    expect(pruneBulkSnapshots(undefined)).toEqual([]);
    expect(pruneBulkSnapshots(null)).toEqual([]);
    expect(pruneBulkSnapshots('snapshot')).toEqual([]);
    expect(pruneBulkSnapshots({ length: 2 })).toEqual([]);
  });
});

describe('addAutoSnapshot', () => {
  test('addAutoSnapshot appends, prunes only for bulk and does not change its input', () => {
    const project = deepFreeze({
      ...makeProject(),
      snapshots: [stored('b1', 1, 'bulk'), stored('oma', 2), stored('b2', 3, 'bulk'), stored('b3', 4, 'bulk')]
    });

    // An import snapshot is appended and nothing is pruned
    const imported = addAutoSnapshot(project, { name: 'Ennen tuontia: Draft', now: minutesLater(10), auto: 'import' });
    expect(names(imported.project.snapshots)).toEqual(['b1', 'oma', 'b2', 'b3', 'Ennen tuontia: Draft']);
    expect(imported.snapshot).toBe(imported.project.snapshots[4]);
    expect(imported.snapshot.auto).toBe('import');

    // A manual one too
    const manual = addAutoSnapshot(project, { name: 'Oma 2', now: minutesLater(10) });
    expect(names(manual.project.snapshots)).toEqual(['b1', 'oma', 'b2', 'b3', 'Oma 2']);

    // A bulk snapshot pushes the oldest bulk snapshot out
    const bulk = addAutoSnapshot(project, { name: 'Ennen hyväksymistä: Eka', description: 'Kuvaus', now: minutesLater(10), auto: 'bulk' });
    expect(names(bulk.project.snapshots)).toEqual(['oma', 'b2', 'b3', 'Ennen hyväksymistä: Eka']);
    expect(bulk.snapshot).toMatchObject({ name: 'Ennen hyväksymistä: Eka', description: 'Kuvaus', auto: 'bulk', totalWords: 6, chapterCount: 2 });
    expect(bulk.project.snapshots[3]).toBe(bulk.snapshot);

    // The input is as it was (it is frozen, so a write would have thrown), and the rest of the project is carried over
    expect(names(project.snapshots)).toEqual(['b1', 'oma', 'b2', 'b3']);
    expect(bulk.project).not.toBe(project);
    expect(bulk.project.title).toBe('Saaren kirja');
    expect(bulk.project.structure).toBe(project.structure);
  });

  test('a new bulk snapshot replaces an older bulk snapshot with the same name and leaves a manual one with that name alone', () => {
    const name = 'Ennen kielenhuoltoa: Eka';
    const project = {
      ...makeProject(),
      snapshots: [stored(name, 1, 'bulk'), stored(name, 2), stored('Ennen kielenhuoltoa: Toka', 3, 'bulk'), stored(name, 4, 'import')]
    };
    const result = addAutoSnapshot(project, { name, now: minutesLater(10), auto: 'bulk' });

    expect(result.project.snapshots.map(snapshot => [snapshot.name, snapshot.auto || 'manual'])).toEqual([
      [name, 'manual'],
      ['Ennen kielenhuoltoa: Toka', 'bulk'],
      [name, 'import'],
      [name, 'bulk']
    ]);
    expect(result.project.snapshots[3]).toBe(result.snapshot);
    expect(result.snapshot.created).toBe(minutesLater(10).toISOString());
  });

  test('running the same tool twice on one chapter uses one of the three places', () => {
    let project = makeProject();
    const take = (name, minutes) => {
      project = addAutoSnapshot(project, { name, now: minutesLater(minutes), auto: 'bulk' }).project;
    };
    take('Eka', 1);
    take('Eka', 2);
    take('Toka', 3);
    take('Eka', 4);
    take('Kolmas', 5);
    expect(project.snapshots.map(snapshot => [snapshot.name, snapshot.created])).toEqual([
      ['Toka', minutesLater(3).toISOString()],
      ['Eka', minutesLater(4).toISOString()],
      ['Kolmas', minutesLater(5).toISOString()]
    ]);

    take('Neljäs', 6);
    expect(names(project.snapshots)).toEqual(['Eka', 'Kolmas', 'Neljäs']);
  });

  test('keepBulk sets how many bulk snapshots stay', () => {
    const project = { ...makeProject(), snapshots: [stored('b1', 1, 'bulk'), stored('b2', 2, 'bulk'), stored('b3', 3, 'bulk')] };
    const options = { name: 'b4', now: minutesLater(10), auto: 'bulk' };
    expect(names(addAutoSnapshot(project, options, { keepBulk: 2 }).project.snapshots)).toEqual(['b3', 'b4']);
    expect(names(addAutoSnapshot(project, options, { keepBulk: 5 }).project.snapshots)).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(names(addAutoSnapshot(project, options, { keepBulk: Infinity }).project.snapshots)).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(names(addAutoSnapshot(project, options).project.snapshots)).toEqual(['b2', 'b3', 'b4']);
  });

  test('the snapshot just taken always stays, whatever the limit or the clock says', () => {
    const project = { ...makeProject(), snapshots: [stored('b1', 20, 'bulk'), stored('b2', 30, 'bulk'), stored('b3', 40, 'bulk')] };

    // The clock went backwards: the new snapshot is the oldest by its time
    const early = addAutoSnapshot(project, { name: 'uusi', now, auto: 'bulk' });
    expect(names(early.project.snapshots)).toEqual(['b2', 'b3', 'uusi']);

    const none = addAutoSnapshot(project, { name: 'uusi', now: minutesLater(50), auto: 'bulk' }, { keepBulk: 0 });
    expect(names(none.project.snapshots)).toEqual(['uusi']);
  });

  test('a project without a snapshot list gets one', () => {
    const project = { title: 'Kirja', structure: [{ id: 'a', content: 'yksi' }] };
    const result = addAutoSnapshot(project, { name: 'Ennen tuontia: Draft', now, auto: 'import' });
    expect(result.project.snapshots).toEqual([result.snapshot]);
    expect('snapshots' in project).toBe(false);
  });

  test('an import snapshot survives any number of bulk snapshots', () => {
    let project = addAutoSnapshot(makeProject(), { name: 'Ennen tuontia: Draft', now, auto: 'import' }).project;
    for (let i = 1; i <= 6; i++) {
      project = addAutoSnapshot(project, { name: `Massa ${i}`, now: minutesLater(i), auto: 'bulk' }).project;
    }
    expect(names(project.snapshots)).toEqual(['Ennen tuontia: Draft', 'Massa 4', 'Massa 5', 'Massa 6']);
  });
});

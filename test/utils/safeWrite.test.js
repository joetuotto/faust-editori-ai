const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeFileAtomic, backupBeforeOverwrite, listBackups } = require('../../utils/safeWrite');

describe('safeWrite', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faust-safewrite-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('writeFileAtomic writes content and leaves no temp files', async () => {
    const target = path.join(dir, 'Romaani.faust');
    await writeFileAtomic(target, '{"title":"Ä"}');
    await writeFileAtomic(target, '{"title":"Ö"}');

    expect(fs.readFileSync(target, 'utf-8')).toBe('{"title":"Ö"}');
    expect(fs.readdirSync(dir)).toEqual(['Romaani.faust']);
  });

  test('writeFileAtomic keeps the old file when the write fails', async () => {
    const target = path.join(dir, 'Romaani.faust');
    fs.writeFileSync(target, 'vanha');

    await expect(writeFileAtomic(path.join(dir, 'missing', 'x.faust'), 'uusi')).rejects.toThrow();
    expect(fs.readFileSync(target, 'utf-8')).toBe('vanha');
  });

  test('backupBeforeOverwrite does nothing for a new file', async () => {
    const result = await backupBeforeOverwrite(path.join(dir, 'uusi.faust'), path.join(dir, 'backups'));
    expect(result).toBeNull();
  });

  test('backupBeforeOverwrite throttles and rotates copies', async () => {
    const target = path.join(dir, 'Romaani.faust');
    const backups = path.join(dir, 'backups');
    fs.writeFileSync(target, 'v1');

    const t0 = Date.parse('2026-01-01T00:00:00Z');
    expect(await backupBeforeOverwrite(target, backups, { now: t0 })).not.toBeNull();
    // Within the interval: skipped
    expect(await backupBeforeOverwrite(target, backups, { now: t0 + 1000 })).toBeNull();

    for (let i = 1; i <= 4; i++) {
      await backupBeforeOverwrite(target, backups, { keep: 3, minIntervalMs: 0, now: t0 + i * 60000 });
    }

    const kept = await listBackups(backups, target);
    expect(kept).toHaveLength(3);
    expect(kept[kept.length - 1]).toContain('2026-01-01T00-04-00');
  });
});

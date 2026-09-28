import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, promises as fs, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProject, openProject, trashFiles, writeDoc, writeManifest } from './projectStore';
import { convertLegacy, importLegacyFile } from './legacyImport';
import { commitAll, history, readAt } from './history';
import { toDocx, toEpub, toManuscriptDocx, toMarkdown, toPlainText, toProvenanceReport } from './export';
import JSZip from 'jszip';
import { JSDOM } from 'jsdom';
import { resolveInside, writeFileAtomic } from './fsutil';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'faust-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const LEGACY = {
  title: 'Vanha romaani',
  author: 'Kirjailija',
  genre: 'fiction',
  version: '2.0',
  apiConfig: { anthropic: { apiKey: 'sk-secret' } },
  ai: { provider: 'anthropic', models: { anthropic: 'claude-3-5-sonnet-20241022', openai: 'gpt-4-turbo-preview' } },
  targets: { totalWords: 90000, dailyWords: 500 },
  structure: [
    {
      id: 'chapter-2', type: 'chapter', title: 'Toinen', order: 1, content: 'B', status: 'final',
      children: []
    },
    {
      id: 'chapter-1', type: 'chapter', title: 'Ensimmäinen', order: 0,
      content: 'Rivi yksi.\nRivi *kaksi*.', synopsis: 'Alku', povCharacter: 'Aino',
      annotations: [{ id: 'n1', text: 'huom' }],
      children: [{ id: 'scene-1', type: 'scene', title: 'Kohtaus', content: 'Sisällä.', order: 0 }]
    }
  ],
  characters: [{ id: 'c1', basicInfo: { name: 'Aino', age: 34 }, psychological: { fear: 'hylkääminen' }, description: 'Päähenkilö' }],
  locations: [{ id: 'l1', name: 'Mökki', description: 'Järven rannalla' }],
  plotThreads: [{ id: 't1', title: 'Kadonnut kirje', status: 'open' }],
  snapshots: [{ id: 's1', name: 'Vanha versio' }],
  bookmarks: []
};

describe('fsutil', () => {
  it('refuses paths outside the project', () => {
    expect(() => resolveInside(dir, '../x')).toThrow();
    expect(() => resolveInside(dir, '/etc/passwd')).toThrow();
    expect(resolveInside(dir, 'manuscript/a.md')).toBe(path.join(dir, 'manuscript/a.md'));
  });

  it('writes atomically without leaving temp files', async () => {
    const file = path.join(dir, 'sub', 'a.txt');
    await writeFileAtomic(file, 'yksi');
    await writeFileAtomic(file, 'kaksi');
    expect(await fs.readFile(file, 'utf-8')).toBe('kaksi');
    expect(readdirSync(path.dirname(file))).toEqual(['a.txt']);
  });
});

describe('projectStore', () => {
  it('creates and reopens a project', async () => {
    const projectPath = await createProject(dir, 'Romaani');
    expect(path.basename(projectPath)).toBe('Romaani.faust');
    expect(path.basename(await createProject(dir, 'Romaani'))).toBe('Romaani 2.faust');

    const project = await openProject(projectPath);
    expect(project.manifest.title).toBe('Romaani');
    expect(project.manifest.structure).toHaveLength(1);
    const [chapter] = project.manifest.structure;

    await writeDoc(projectPath, chapter.file, { ...project.docs[chapter.id], body: 'Hän tuli.\n' });
    const reopened = await openProject(projectPath);
    expect(reopened.docs[chapter.id].body).toBe('Hän tuli.\n');
    expect(reopened.docs[chapter.id].meta.title).toBe('Luku 1');
  });

  it('treats a missing document file as empty and trashes deleted files', async () => {
    const projectPath = await createProject(dir, 'T');
    const project = await openProject(projectPath);
    const [chapter] = project.manifest.structure;

    await trashFiles(projectPath, [chapter.file]);
    const reopened = await openProject(projectPath);
    expect(reopened.docs[chapter.id].body).toBe('');
    const trash = await fs.readdir(path.join(projectPath, '.faust', 'trash'));
    expect(trash).toHaveLength(1);
  });

  it('rejects projects from a newer format', async () => {
    const projectPath = await createProject(dir, 'T');
    const project = await openProject(projectPath);
    await writeManifest(projectPath, { ...project.manifest, formatVersion: 99 });
    await expect(openProject(projectPath)).rejects.toThrow(/uudemmalla/);
  });
});

describe('legacy import', () => {
  it('converts structure, bible and settings without losing data', () => {
    const converted = convertLegacy(LEGACY);
    const { manifest } = converted;

    expect(manifest.title).toBe('Vanha romaani');
    expect(manifest.targets).toEqual({ totalWords: 90000, dailyWords: 500 });
    expect(manifest.ai.models.anthropic).toBe('claude-opus-5');
    // Chapters sorted by legacy order, scene nested
    expect(manifest.structure.map(n => n.title)).toEqual(['Ensimmäinen', 'Toinen']);
    expect(manifest.structure[0].children!.map(n => n.title)).toEqual(['Kohtaus']);

    const first = converted.docs.find(d => d.node.title === 'Ensimmäinen')!;
    expect(first.doc.body).toBe('Rivi yksi.\n\nRivi *kaksi*.');
    expect(first.doc.meta.synopsis).toBe('Alku');
    expect(first.doc.meta.pov).toBe('Aino');
    expect(converted.docs.find(d => d.node.title === 'Toinen')!.doc.meta.status).toBe('final');

    const names = converted.bible.map(e => `${e.kind}:${e.name}`);
    expect(names).toEqual(['characters:Aino', 'locations:Mökki', 'threads:Kadonnut kirje']);
    expect(converted.bible[0].fields.age).toBe('34');
    expect(converted.bible[0].body).toBe('Päähenkilö');

    // Unmapped data is kept, API keys are not
    expect(converted.leftovers.snapshots).toEqual(LEGACY.snapshots);
    expect(JSON.stringify(converted.leftovers.documentExtras)).toContain('huom');
    expect(JSON.stringify(converted)).not.toContain('sk-secret');
  });

  it('imports a legacy file into a new folder that opens', async () => {
    const legacyFile = path.join(dir, 'vanha.faust');
    await fs.writeFile(legacyFile, JSON.stringify(LEGACY));
    const projectPath = await importLegacyFile(legacyFile, dir);

    const project = await openProject(projectPath);
    expect(Object.keys(project.docs)).toHaveLength(3);
    expect(Object.values(project.bible).map(e => e.name).sort()).toEqual(['Aino', 'Kadonnut kirje', 'Mökki']);
    const legacyJson = JSON.parse(await fs.readFile(path.join(projectPath, '.faust', 'legacy.json'), 'utf-8'));
    expect(legacyJson.importedFrom).toBe('vanha.faust');
    // Original file untouched
    expect(JSON.parse(await fs.readFile(legacyFile, 'utf-8')).title).toBe('Vanha romaani');
  });
});

describe('history', () => {
  it('commits changes and reads old versions', async () => {
    const projectPath = await createProject(dir, 'H');
    const first = await commitAll(projectPath, 'Alku');
    expect(first).toBeTruthy();
    expect(await commitAll(projectPath, 'Ei muutoksia')).toBeNull();

    const project = await openProject(projectPath);
    const [chapter] = project.manifest.structure;
    await writeDoc(projectPath, chapter.file, { ...project.docs[chapter.id], body: 'Uusi teksti.\n' });
    await commitAll(projectPath, 'Muokattu');

    const log = await history(projectPath, chapter.file);
    expect(log.map(e => e.message)).toEqual(['Muokattu', 'Alku']);
    const old = await readAt(projectPath, log[1].oid, chapter.file);
    expect(old).not.toContain('Uusi teksti');

    // Trashed files are removed from history's working tree but ignored in .faust/trash
    await trashFiles(projectPath, [chapter.file]);
    expect(await commitAll(projectPath, 'Poistettu')).toBeTruthy();
  });
});

describe('export', () => {
  it('compiles the manuscript in binder order', async () => {
    const legacyFile = path.join(dir, 'vanha.json');
    await fs.writeFile(legacyFile, JSON.stringify(LEGACY));
    const project = await openProject(await importLegacyFile(legacyFile, dir));

    const md = toMarkdown(project);
    expect(md.indexOf('Ensimmäinen')).toBeLessThan(md.indexOf('Toinen'));
    expect(md).toContain('Rivi *kaksi*.');

    const txt = toPlainText(project);
    expect(txt).toContain('Rivi kaksi.');
    expect(txt).not.toContain('*');

    const docx = await toDocx(project);
    expect(docx.subarray(0, 2).toString()).toBe('PK');
  });

  it('builds a valid EPUB 3 package', async () => {
    const legacyFile = path.join(dir, 'vanha.json');
    await fs.writeFile(legacyFile, JSON.stringify({ ...LEGACY, title: 'Kirja & "lainaus"' }));
    const project = await openProject(await importLegacyFile(legacyFile, dir));

    const zip = await JSZip.loadAsync(await toEpub(project, new Date('2026-01-01T00:00:00Z')));
    const names = Object.keys(zip.files);
    expect(names[0]).toBe('mimetype');
    expect(await zip.file('mimetype')!.async('string')).toBe('application/epub+zip');

    const { DOMParser } = new JSDOM().window;
    for (const name of names.filter(n => /\.(xhtml|opf|xml)$/.test(n))) {
      const xml = await zip.file(name)!.async('string');
      const parsed = new DOMParser().parseFromString(xml, 'application/xml');
      expect(parsed.getElementsByTagName('parsererror').length, name).toBe(0);
    }
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:title>Kirja &amp; &quot;lainaus&quot;</dc:title>');
    expect(opf).toContain('2026-01-01T00:00:00Z');
    const chapter = await zip.file('OEBPS/chapter-1.xhtml')!.async('string');
    expect(chapter).toContain('<em>kaksi</em>');
  });

  it('builds a manuscript with a title page', async () => {
    const legacyFile = path.join(dir, 'vanha.json');
    await fs.writeFile(legacyFile, JSON.stringify(LEGACY));
    const project = await openProject(await importLegacyFile(legacyFile, dir));
    const zip = await JSZip.loadAsync(await toManuscriptDocx(project));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('VANHA ROMAANI');
    expect(xml).toContain('sanaa');
    expect(Object.keys(zip.files).some(n => n.startsWith('word/header'))).toBe(true);
  });

  it('writes an AI use statement from provenance records', async () => {
    const legacyFile = path.join(dir, 'vanha.json');
    await fs.writeFile(legacyFile, JSON.stringify(LEGACY));
    const project = await openProject(await importLegacyFile(legacyFile, dir));
    const scene = project.manifest.structure[0].children![0];
    const report = toProvenanceReport(project, {
      version: 1,
      docs: { [scene.id]: { hash: 'x', spans: [{ start: 0, end: 8, source: 'ai-edit', model: 'claude-opus-5', text: 'Sisällä.' }] } }
    });
    expect(report).toContain('&nbsp;&nbsp;Kohtaus | 1 | 0,0 % | 100,0 % | 0,0 % |');
    expect(report).toContain('Käytetyt mallit: claude-opus-5.');
    expect(report).toMatch(/Käsikirjoituksessa on \d+ sanaa/);
  });
});

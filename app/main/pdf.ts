/**
 * PDF export: the book-layout HTML printed by a hidden Chromium window.
 * EB Garamond is embedded from the app's own font files (the ones the
 * renderer build ships) so the PDF looks the same on every machine; page
 * numbers go in the footer.
 */
import { BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import type { OpenProject } from '../shared/types';
import { toHtml, type ExportOptions } from './export';

const require = createRequire(import.meta.url);

const FONTS: [name: string, weight: number, style: 'normal' | 'italic'][] = [
  ['eb-garamond-latin-400-normal', 400, 'normal'],
  ['eb-garamond-latin-400-italic', 400, 'italic'],
  ['eb-garamond-latin-600-normal', 600, 'normal']
];

/** The built renderer's copy (hashed name), or the package in development */
async function fontFile(name: string): Promise<string> {
  const assets = path.join(__dirname, '../renderer/assets');
  try {
    const hit = (await fs.readdir(assets)).find(f => f.startsWith(`${name}-`) && f.endsWith('.woff2'));
    if (hit) return path.join(assets, hit);
  } catch {
    // not built yet
  }
  return require.resolve(`@fontsource/eb-garamond/files/${name}.woff2`);
}

async function fontFaces(): Promise<string> {
  const rules: string[] = [];
  for (const [name, weight, style] of FONTS) {
    try {
      const data = await fs.readFile(await fontFile(name));
      rules.push(
        `@font-face { font-family: 'EB Garamond'; font-style: ${style}; font-weight: ${weight}; src: url(data:font/woff2;base64,${data.toString('base64')}) format('woff2'); }`
      );
    } catch {
      // Falls back to Georgia / the system serif
    }
  }
  return rules.join('\n');
}

const FOOTER = `<div style="width:100%;font-family:Georgia,serif;font-size:8pt;text-align:center;color:#444"><span class="pageNumber"></span></div>`;

export async function toPdf(project: OpenProject, options: ExportOptions = {}): Promise<Buffer> {
  const html = toHtml(project, { ...options, print: true, fontFaces: await fontFaces() });
  // A file rather than a data: URL: manuscripts can be several megabytes
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'faust-pdf-'));
  const file = path.join(dir, 'book.html');
  await fs.writeFile(file, html, 'utf-8');

  const win = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
  try {
    await win.loadFile(file);
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)').catch(() => true);
    return await win.webContents.printToPDF({
      pageSize: 'A5',
      printBackground: false,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: FOOTER,
      margins: { top: 0.75, bottom: 0.85, left: 0.7, right: 0.7 },
      generateDocumentOutline: true
    });
  } finally {
    win.destroy();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

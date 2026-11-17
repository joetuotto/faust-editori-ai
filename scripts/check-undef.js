#!/usr/bin/env node
/**
 * Gate: identifiers used without an import (contract rule 13)
 *
 * Webpack builds a file that uses a name nobody imported, and the app then
 * throws a ReferenceError on the first render. Jest loads no ES module, so
 * neither `npm test` nor `npm run build` sees the mistake. This script runs
 * ESLint's no-undef over app.js and every ES module under src/, with the
 * one-rule config next to it (the repo's own eslint.config.js parses files as
 * scripts and cannot read them).
 *
 * Usage: node scripts/check-undef.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ESLINT = path.join(ROOT, 'node_modules', '.bin', 'eslint');
// --no-config-lookup keeps the repo's eslint.config.js out: only the one rule of the wiring config runs
const ESLINT_OPTIONS = ['--no-config-lookup', '--config', 'scripts/eslint.wiring.config.js'];

// A line that starts with import or export makes the file an ES module.
// CommonJS files are not linted here: Jest loads them.
const ESM_LINE = /^(?:import|export)\s/m;

function isEsm(text) {
  return ESM_LINE.test(text);
}

/** Every .js file under a folder, as paths relative to root with forward slashes, in a stable order. */
function jsFilesUnder(root, folder) {
  const found = [];
  const entries = fs
    .readdirSync(path.join(root, folder), { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const entry of entries) {
    // The external macOS volume writes a ._name twin next to every file
    if (entry.name.startsWith('._') || entry.name === 'node_modules') continue;
    const relative = `${folder}/${entry.name}`;
    if (entry.isDirectory()) found.push(...jsFilesUnder(root, relative));
    else if (entry.isFile() && entry.name.endsWith('.js')) found.push(relative);
  }
  return found;
}

/** app.js plus the ES modules under src/. */
function listFiles(root = ROOT) {
  const modules = jsFilesUnder(root, 'src').filter((file) => isEsm(fs.readFileSync(path.join(root, file), 'utf8')));
  return ['app.js', ...modules];
}

function main() {
  const files = listFiles(ROOT);
  const result = spawnSync(ESLINT, [...ESLINT_OPTIONS, ...files], { cwd: ROOT, stdio: 'inherit' });

  if (result.error) {
    console.error(`check-undef: ESLint did not start (${result.error.message})`);
    return 1;
  }
  // A null status means ESLint was killed by a signal
  if (result.status !== 0) return result.status === null ? 1 : result.status;

  console.log(`check-undef: ok (${files.length} files)`);
  return 0;
}

module.exports = { ESLINT, ESLINT_OPTIONS, ESM_LINE, isEsm, listFiles };

if (require.main === module) process.exitCode = main();

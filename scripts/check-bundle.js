#!/usr/bin/env node
/**
 * Gate: the bundle builds clean and holds one copy of CodeMirror (contract rule 13)
 *
 * `npm run build` exits 0 on two mistakes that break the app at run time:
 * - a named import that an ES module does not export: webpack only prints a
 *   "WARNING in" block and the value is undefined;
 * - require('@codemirror/…') in any bundled file: webpack adds the CommonJS
 *   build as a second copy of @codemirror/state, and CodeMirror then throws
 *   because the classes of the two copies are not the same.
 * This script builds, fails on any warning and counts the copies by an error
 * text that @codemirror/state contains exactly once (and @lezer/common, which
 * has no such gate of its own, by one of its texts: at most once).
 *
 * Usage: node scripts/check-bundle.js [--no-build] [--bundle <path>]
 *   --no-build       check the dist/bundle.js that is already there
 *   --bundle <path>  check that file instead of dist/bundle.js; builds nothing
 *
 * The script writes nothing itself. The build writes dist/, which is git-ignored.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEFAULT_BUNDLE = path.join(ROOT, 'dist', 'bundle.js');

// An error message of @codemirror/state (RangeSetBuilder). A minifier keeps string literals, so each copy has it once.
const STATE_MARKER = 'Ranges must be added sorted by';
// An error message of @lezer/common (NodeProp). The bundle may lack the package, but never holds it twice.
const LEZER_MARKER = "Can't add per-node props to node types";
const WARNING_START = 'WARNING in';
// Colour codes: with FORCE_COLOR set (to any value) webpack prints "WARNING" and " in" with codes between them
const ANSI_CODE = /\u001b\[[0-9;]*[A-Za-z]/g;

// Lines that end a warning block: the next block, webpack's closing lines, the header of the next npm script
// ("> faust@1.0.0 postbuild"; a bare "> " would also match the marked line of a Babel code frame)
const BLOCK_END = /^(?:(?:WARNING|ERROR) in |webpack \S+ compiled|\d+ (?:warnings?|errors?) ha(?:s|ve) detailed information|> \S+@\S+ \S+\s*$)/;

function parseArgs(argv) {
  const options = { build: true, bundle: null, error: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-build') {
      options.build = false;
    } else if (arg === '--bundle') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        options.error = '--bundle needs a path';
        return options;
      }
      options.bundle = value;
      options.build = false;
      i += 1;
    } else {
      options.error = `unknown argument ${arg}`;
      return options;
    }
  }
  return options;
}

/** Non-overlapping occurrences of needle in text. */
function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let at = text.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = text.indexOf(needle, at + needle.length);
  }
  return count;
}

/** A build output without its colour codes. */
function plainText(output) {
  return String(output || '').replace(ANSI_CODE, '');
}

/** Whether a webpack output holds a warning, coloured or not. */
function hasWarning(output) {
  return plainText(output).includes(WARNING_START);
}

/** The "WARNING in …" blocks of a webpack output, each as one string. */
function warningBlocks(output) {
  const lines = plainText(output).split(/\r?\n/);
  const blocks = [];
  let current = null;

  const close = () => {
    if (!current) return;
    // Blocks are separated by empty lines; they are not part of the warning
    while (current.length > 0 && current[current.length - 1].trim() === '') current.pop();
    blocks.push(current.join('\n'));
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith(WARNING_START)) {
      close();
      current = [line];
    } else if (current && BLOCK_END.test(line)) {
      close();
    } else if (current) {
      current.push(line);
    }
  }
  close();
  return blocks;
}

/** Runs `npm run build`; returns { status, output }. */
function build(root = ROOT) {
  // No colours, so the output is plain text; plainText still strips any that come anyway
  const env = { ...process.env, NO_COLOR: '1' };
  delete env.FORCE_COLOR;
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    env,
    encoding: 'utf8',
    // The default of 1 MB would cut a long list of errors and report it as a failed start
    maxBuffer: 64 * 1024 * 1024
  });
  const output = plainText(`${result.stdout || ''}${result.stderr || ''}`);
  if (result.error) return { status: 1, output: `${output}\nnpm run build did not run: ${result.error.message}` };
  // A null status means the build was killed by a signal
  return { status: result.status === null ? 1 : result.status, output };
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.error) {
    console.error(`check-bundle: ${options.error}`);
    console.error('Usage: node scripts/check-bundle.js [--no-build] [--bundle <path>]');
    return 1;
  }

  if (options.build) {
    const built = build(ROOT);
    if (built.status !== 0) {
      console.error(built.output);
      console.error(`check-bundle: npm run build failed (exit ${built.status}).`);
      return 1;
    }
    if (hasWarning(built.output)) {
      const blocks = warningBlocks(built.output);
      // A warning in a form this script does not know is still a failure: show everything
      console.error(blocks.length > 0 ? blocks.join('\n\n') : built.output);
      console.error(`check-bundle: the build printed ${blocks.length > 1 ? `${blocks.length} warnings` : 'a warning'}. ` +
        'A named import that the target ES module does not export shows up only this way.');
      return 1;
    }
  }

  const bundlePath = options.bundle ? path.resolve(options.bundle) : DEFAULT_BUNDLE;
  let bundle;
  try {
    bundle = fs.readFileSync(bundlePath, 'utf8');
  } catch (error) {
    console.error(`check-bundle: cannot read ${bundlePath} (${error.code || error.message}).`);
    return 1;
  }

  const copies = countOccurrences(bundle, STATE_MARKER);
  if (copies !== 1) {
    console.error(`@codemirror/state is in the bundle ${copies} times. Some bundled file calls require('@codemirror/…') ` +
      "or require('@lezer/…'); only import statements in ESM files may name them.");
    if (copies === 0) {
      console.error(`(0 times: the text "${STATE_MARKER}" was not found at all. Either the editor is not in this ` +
        'bundle or an update of @codemirror/state changed the text this script counts.)');
    }
    return 1;
  }

  const lezerCopies = countOccurrences(bundle, LEZER_MARKER);
  if (lezerCopies > 1) {
    console.error(`@lezer/common is in the bundle ${lezerCopies} times. Some bundled file calls require('@lezer/…') ` +
      "or require('@codemirror/…'); only import statements in ESM files may name them.");
    return 1;
  }

  // The same line in every mode, so that whatever looks for it finds it; the caveat goes on a line of its own
  console.log('check-bundle: ok (one copy of @codemirror/state, no warnings)');
  if (!options.build) console.log('(nothing was built: warnings were not checked)');
  return 0;
}

module.exports = { STATE_MARKER, LEZER_MARKER, parseArgs, countOccurrences, plainText, hasWarning, warningBlocks };

// exitCode, not process.exit(): a long build output on a pipe must be written out before the process ends
if (require.main === module) process.exitCode = main(process.argv.slice(2));

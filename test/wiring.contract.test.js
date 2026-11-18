// Wiring contract (contract rule 13)
//
// Jest loads no ES module, and webpack builds these mistakes without failing:
// a named import that the target does not export (the value is undefined), a
// lazy `require` with a wrong path (it throws when the function first runs),
// and a `require` of a CodeMirror package in a bundled file (a second copy of
// CodeMirror in the bundle). This file checks the wiring that no other test
// sees. Its two companions are scripts/check-bundle.js and
// scripts/check-undef.js.
//
// The file has no docblock on purpose: it runs in jsdom, the default
// environment, because the lazy getters read `window`.
//
// The tables come first. A stage that adds a module, an export, an editor
// shell or a retired wording adds its row here in the same stage.
//
// FAUST_WIRING_PARTIAL=1 turns "this file is not in the tree yet" into a todo.
// Only the done-checks of the P tasks set it; the stages run without it.

// contracts.md section 2.1 as data: path → the names the module must export
const MODULES = {
  'src/editor/wordDiff.js': ['tokenize', 'wordDiff', 'applyChanges', 'offsetChanges', 'diffSegments', 'changeStats', 'changeRatio', 'rawHunks', 'normalizeOptions'],
  'src/editor/sentences.js': ['splitSentences', 'trimToSentence', 'ABBREVIATIONS'],
  'src/editor/blocks.js': ['splitBlocks', 'proseLines', 'blockAt'],
  'src/editor/locateQuote.js': ['locateQuote', 'foldForMatch'],
  'src/services/ai/cleanModelOutput.js': ['cleanModelOutput'],
  'src/services/ai/maskSpans.js': ['maskSpans', 'unmaskSpans', 'placeholder', 'placeholderInstruction', 'PLACEHOLDER'],
  'src/services/ai/batchParagraphs.js': ['batchParagraphs'],
  'scripts/score-step0.js': ['scoreParagraph', 'scoreModel', 'loadTrials', 'report', 'maskSheet', 'REWRITTEN_RATIO'],
  'scripts/step0/score.js': ['parseResponse', 'isFixed', 'scoreModel'],
  'src/services/format.fi.js': ['formatCount', 'fiDate', 'fiDateTime', 'modelLabel', 'plural', 'pendingSuggestions', 'AI_OFF_SENTENCE'],
  'utils/aiRequest.js': ['AI_CONSTANTS', 'AI_OFF_MESSAGE', 'CANCELLED_MESSAGE', 'codedError', 'validateRequest', 'resolveModel', 'modelSettingsFor', 'buildParams', 'normalizeStopReason', 'normalizeUsage', 'createThinkFilter', 'classifyAIError', 'createRequestTable'],
  'utils/appSettings.js': ['KEY_NAMES', 'ROLE_NAMES', 'publicKeyStatus', 'applyKeyWrite', 'applyProviderPatch', 'readRoles', 'readModelSettings', 'mergePrefs'],
  'src/services/ai/aiClient.js': ['CLIENT_CONSTANTS', 'ROLES', 'ROLE_LABELS', 'judgeEdit', 'reasonText', 'stopNote', 'createAIClient', 'getAIClient'],
  'src/services/ai/tokenStats.js': ['DEFAULT_CHARS_PER_TOKEN', 'MIN_CALIBRATION_CHARS', 'MAX_PLAUSIBLE_CHARS_PER_TOKEN', 'MIN_PLAUSIBLE_CHARS_PER_TOKEN', 'estimateTokens', 'updateCalibration', 'looksTruncated'],
  'src/services/ai/usageLog.js': ['MAX_ROWS', 'MAX_TEXT', 'SOURCES', 'SOURCE_LABELS', 'createLog', 'normalizeLog', 'appendRow', 'requestRow', 'decisionRow', 'summarize', 'exportText'],
  'src/services/settingsStore.js': ['createSettingsStore', 'getSettingsStore'],
  'src/editor/suggestionModel.js': ['nextId', 'resetIds', 'makeMapper', 'mapSuggestions', 'singleChange', 'firstDifference', 'stillMatches', 'rebaseSuggestions', 'normalizeChanges', 'createSuggestions', 'createState', 'reduce', 'pendingItems', 'rejectedItems', 'hasReviewable', 'acceptChanges', 'blockInsertText', 'blockChange', 'decorationSpecs', 'snapshot', 'bulkAcceptIds', 'relocateTarget', 'CONTEXT_CHARS', 'REBASE_DIFF_LIMIT'],
  'src/editor/suggestionsCore.js': ['createSuggestionKit'],
  'src/editor/pasteEdits.js': ['PASTE_WARN_RATIO', 'PROTECTED_PATTERN', 'paragraphBreakStyle', 'normalizeClipboard', 'preparePasteEdits'],
  'src/editor/pendingInsertView.js': ['createBlockView'],
  'src/services/suggestions/suggestionController.js': ['createSuggestionController'],
  'src/services/ai/actions.js': ['BUILTIN_ACTIONS', 'DEFAULT_ACTION_IDS', 'actionsFor', 'findAction', 'menuEntries', 'normalizeSavedPrompts', 'addSavedPrompt', 'removeSavedPrompt', 'labelFromPrompt'],
  'src/services/ai/editRequest.js': ['LIMITS', 'WRITE_LENGTHS', 'QUICK_EDIT_THINKING', 'ACTION_SENDS_AT_ONCE', 'editTask', 'refineMessages', 'writeTask', 'answerTokensFor', 'previewUnmask', 'promptMessage'],
  'src/editor/promptTarget.js': ['resolveEditTarget'],
  'src/editor/inlinePromptState.js': ['createState', 'reduce', 'attemptLabel', 'changeCountLabel'],
  'src/editor/inlinePromptView.js': ['createPromptView'],
  'src/editor/inlinePromptCore.js': ['createInlinePromptKit'],
  'src/services/ai/quickEdit.js': ['createQuickEdit'],
  'utils/aiContextMenu.js': ['sanitizeContext', 'takeContext', 'buildAiSubmenu'],
  'src/editor/termMatch.js': ['parseTerm', 'parseTermList', 'formatTermList', 'compileTerms', 'findTermMatches', 'todoRanges', 'countTerms'],
  'src/services/story/codex.js': ['TYPES', 'TYPE_LABELS', 'TYPE_PLURALS', 'STATES', 'STATE_LABELS', 'projectKind', 'folderName', 'typesFor', 'createEntry', 'normalizeEntry', 'normalizeCodex', 'updateEntry', 'removeEntry', 'prepareEntries', 'matchPrepared', 'matchEntries', 'countMentions', 'selectForContext', 'formatEntry', 'pendingLegacy', 'migrateLegacy', 'entryFromResearchNote', 'findBySource'],
  'src/services/ai/contextBuilder.js': ['buildContext', 'describeParts', 'isChapterBlocked', 'chaptersInOrder', 'readSummary', 'normalizeContextFields', 'stripTodos', 'tailLines', 'headLines', 'DROP_ORDER', 'TASK_PROFILES', 'LANGUAGE_RULES', 'UNCALIBRATED_MARGIN', 'MENTION_DETECTION', 'MESSAGES'],
  'src/services/ai/contextSession.js': ['createContextSession', 'getContextSession'],
  'src/editor/termHighlightCore.js': ['createTermHighlightKit'],
  'utils/noAIGuard.js': ['MIN_SEGMENT', 'WINDOW', 'squash', 'protectedChapters', 'buildGuardIndex', 'findProtected', 'collectStrings'],
  'src/editor/typography.fi.js': ['QUOTE', 'APOSTROPHE', 'DASH', 'SCENE_BREAK', 'TYPOGRAPHY_RULES', 'protectedRanges', 'effectiveLineStartDash', 'inputAction', 'smartReplace', 'toFinnishTypography', 'normaliseModelText', 'checkTypography', 'fixesFor', 'dashLineChanges', 'countDashLines', 'isDialogueLine', 'quoteSpans'],
  'src/services/ai/proofreadPass.js': ['PROOFREAD_DEFAULTS', 'PROOFREAD_ROLE', 'proofreadRules', 'EXPLAIN_SYSTEM', 'proofBudget', 'selectProofLines', 'formatBatch', 'proofreadTask', 'renderProofreadRequest', 'answerTokensForBatch', 'parseNumberedLines', 'alignBatch', 'reviseLine', 'locateLines', 'guardChanges', 'runProofread', 'buildExplainRequest', 'explainChange', 'summaryLine', 'meetsProofreadThreshold', 'modelNote', 'createProofreadSelection'],
  'src/services/ai/proofreadModelNotes.js': ['testedAt', 'ownText', 'scope', 'typography', 'models'],
  'src/services/language/wordCheck.js': ['createWordCheck'],
  'src/editor/smartTypingCore.js': ['createSmartTypingKit'],
  'utils/voikko.js': ['createVoikko', 'parseSpellOutput', 'parseGrammarOutput', 'parseSuggestions', 'codePointToUtf16', 'sanitizeLine', 'CANDIDATE_DIRS', 'GC_ARG_SETS'],
  'src/services/language/voikkoCheck.js': ['tokenizeWords', 'buildVoikkoInput', 'voikkoFindings', 'nameHits'],
  'src/editor/plainView.js': ['plainView', 'PLAIN_PATTERNS'],
  'src/services/review/reviewChecks.js': ['BUILTIN_CHECKS', 'DEFAULT_CHECK_IDS', 'GROUP_LABELS', 'CUSTOM_LIMITS', 'checksFor', 'findCheck', 'describeCheck', 'makeCustomCheck', 'validateCustomCheck', 'normalizeCustomChecks'],
  'src/services/ai/reviewPass.js': ['REVIEW', 'LABELS', 'NONE_MARKERS', 'SEVERITY_WORDS', 'buildReviewTask', 'renderReviewRequest', 'selectReviewLines', 'planBatches', 'planReview', 'parseFindings', 'judgeBatch', 'anchorQuote', 'anchorFindings', 'contextSources', 'resolveSource', 'anchorReference', 'fixChanges', 'runReview'],
  'src/services/review/localChecks.js': ['LOCAL', 'avoidWordFindings', 'longSentenceFindings', 'typographyQuestionFindings', 'runLocalCheck', 'sentenceWordCount', 'clampLimit'],
  'src/services/review/findings.js': ['STATUSES', 'STATUS_LABELS', 'STATUS_HINTS', 'FINDINGS', 'createFinding', 'normalizeFindings', 'statusesFor', 'reanchorOne', 'reanchorAll', 'mergeRun', 'shiftRanges', 'applyStatus', 'removeByCheck', 'storable', 'capStored', 'filterForList', 'countByStatus', 'highlightItems', 'runRecord', 'normalizeRuns', 'describeRun', 'textFingerprint', 'modelStats', 'feedbackGroups'],
  'src/services/review/reviewController.js': ['createReviewController', 'createDefaultReviewController'],
  'src/editor/reviewHighlightsCore.js': ['createReviewHighlightsKit'],
  'utils/importFolder.js': ['CHAPTER_EXTENSIONS', 'naturalCompare', 'fileStem', 'cleanImportTitle', 'pairSynopsisFiles', 'classifyEntries', 'readImportFolder', 'resolveSubfolder'],
  'src/services/project/importPlan.js': ['buildRows', 'hasOrderNumbers', 'applyStripNumbers', 'moveRow', 'renameRow', 'setRowIncluded', 'setAllIncluded', 'resetOrder', 'isReordered', 'summarizeRows', 'summaryLine', 'importButtonLabel', 'rowExcerpt', 'targetHints', 'noticeLines', 'isBlankProject', 'buildSelection', 'buildChapterDocs', 'applyImport', 'replaceBlockedReason'],
  'src/services/project/snapshots.js': ['buildSnapshot', 'addAutoSnapshot', 'pruneBulkSnapshots'],
  // I-02 review: what the old AI paths of app.js share
  'src/services/ai/oldPaths.js': ['failureReason', 'asIsNotice', 'bookRunPlan'],
  // contracts.md 2.2: existing files that a stage extended (I-01, I-03)
  'utils/manuscript.js': ['decodeText', 'splitIntoChapters', 'importDocument'],
  'src/editor/textTools.js': ['WORD_CHAR', 'TODO_PATTERN_SOURCE', 'UNDERLINE_PATTERN_SOURCE', 'continueList', 'buildSearchPattern', 'countWords'],
  'src/utils/CommandManager.js': ['CommandManager', 'UpdateContentCommand']
};

// The editor cores: the factory is called with CodeMirror and must return these names.
// `cm` is the `cm = { … }` of contracts.md 2.1: the kit is built with only these names, and a shell must pass
// every one of them. `optionsFrom` builds the second argument from what another kit returned:
// option → [core file, returned name].
const KITS = {
  'src/editor/suggestionsCore.js': {
    factory: 'createSuggestionKit',
    cm: ['StateField', 'StateEffect', 'Annotation', 'Prec', 'EditorView', 'Decoration', 'WidgetType', 'keymap'],
    returns: ['suggestionField', 'suggestionEffect', 'suggestionAccept', 'suggestionExtension', 'installSuggestionFacade', 'readSuggestionMeta', 'suggestionEvents', 'suggestionSnapshot', 'suggestionState']
  },
  'src/editor/inlinePromptCore.js': {
    factory: 'createInlinePromptKit',
    cm: ['StateField', 'StateEffect', 'EditorView', 'Decoration', 'showTooltip', 'ViewPlugin'],
    optionsFrom: { suggestionField: ['src/editor/suggestionsCore.js', 'suggestionField'] },
    returns: ['inlinePrompt', 'openPrompt', 'updatePrompt', 'closePrompt', 'getPrompt', 'focusPrompt']
  },
  'src/editor/smartTypingCore.js': {
    factory: 'createSmartTypingKit',
    cm: ['EditorView', 'Annotation'],
    returns: ['SmartTyping', 'smartTyping']
  },
  'src/editor/termHighlightCore.js': {
    factory: 'createTermHighlightKit',
    cm: ['StateField', 'StateEffect', 'Decoration', 'ViewPlugin', 'EditorView'],
    returns: ['setTermHighlightConfig', 'termHighlight']
  },
  'src/editor/reviewHighlightsCore.js': {
    factory: 'createReviewHighlightsKit',
    cm: ['StateField', 'StateEffect', 'EditorView', 'Decoration'],
    returns: ['setFindingHighlights', 'findingField', 'reviewHighlights', 'findingRanges']
  }
};

// contracts.md section 2.3: ESM shell → its core. A shell is read only once it exists (stages I-03 to I-08).
const SHELLS = {
  'src/editor/suggestions.js': 'src/editor/suggestionsCore.js',
  'src/editor/inlinePrompt.js': 'src/editor/inlinePromptCore.js',
  'src/editor/smartTyping.js': 'src/editor/smartTypingCore.js',
  'src/editor/termHighlight.js': 'src/editor/termHighlightCore.js',
  'src/editor/reviewHighlights.js': 'src/editor/reviewHighlightsCore.js'
};

// contracts.md section 8.1, column "Not": wordings that were replaced and must not come back
const RETIRED_WORDINGS = [
  'tarkistamaton',
  'tarkistamatonta',
  'tarkistamattomat',
  'odottava ehdotus',
  'odottavat ehdotukset',
  'odottavaa ehdotusta',
  'Tekoäly on kytketty pois',
  'Tekoäly on pois päältä',
  // impl/reconcile.md R-37 (stage I-00): the menu spec's names win over these
  'Claude Assistentti',
  'AI-avustaja',
  '(Cmd+,)',
  'napsautus',
  'Piilota mallin',
  'Malli ajattelee',
  'Malli ajatteli',
  'Malli kirjoittaa…',
  'Kirjan kansio',
  'Kirjan ydin'
];

// contracts.md section 2.2: names that a later stage adds to an existing file and that a module of a P task
// already asks for (with a fallback of its own), so the require is not a mistake yet. A row goes as soon as
// the name exists: the stage that adds the name deletes the row and lists the name in MODULES (a case fails
// on a stale row).
const PENDING_EXPORTS = {};

// Relative requires that may be absent or cannot be loaded under Jest (an optional module behind try/catch,
// a main-process module that uses Electron at load): requiring file → the require paths as written.
const OPTIONAL_REQUIRES = {};

// What reaches the bundle or the main process; the text rules read all of it
const SOURCE_FILES = ['app.js', 'electron.js', 'preload.js'];
const SOURCE_FOLDERS = ['src', 'utils'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// CodeMirror from its CommonJS build. Allowed here: a test file does not go through webpack.
const state = require('@codemirror/state');
const view = require('@codemirror/view');
const cm = { ...state, ...view }; // every kit takes only the names it needs

const ROOT = path.join(__dirname, '..');
const PARTIAL = process.env.FAUST_WIRING_PARTIAL === '1';
// Cases that start node or ESLint: the external volume can be slow while other suites run
const SPAWN_TIMEOUT = 60000;

// A line that starts with import or export makes a file an ES module (the same rule as scripts/check-undef.js)
const ESM_LINE = /^(?:import|export)\s/m;
// The brief's spellings, matched in the raw text (a comment included) ...
const CODEMIRROR_REQUIRE = /require\(\s*['"]@(?:codemirror|lezer)\//g;
const REQUIRE_CALL = /require\(/g;
// ... and the other spellings webpack also bundles (`require ('…')`, a template literal), matched in code only
const CODEMIRROR_REQUIRE_CODE = /\brequire\s*\(\s*['"`]@(?:codemirror|lezer)\//g;
const REQUIRE_CALL_CODE = /\brequire\s*\(/g;

// The statement readers run over the text with its comments blanked out (scanCode). A statement starts a line
// or follows a `;` on the same line; indentation does not matter, because import and export can only stand at
// the top level of a module.
const STATEMENT_START = String.raw`(?<=^|;)[ \t]*`;
const NAME = String.raw`[\p{ID_Continue}$\u200c\u200d]+`;
// import { a, b as c } from './x.js', also over several lines, after a default import, and export { a } from './x.js'
const NAMED_IMPORT = new RegExp(String.raw`${STATEMENT_START}(?:import|export)\s*(?:${NAME}\s*,\s*)?\{([^}]*)\}\s*from\s*(['"])(.+?)\2`, 'gmsu');
// Anything that starts like an import with a list; one that NAMED_IMPORT cannot read is reported, never skipped
const IMPORT_WITH_LIST = new RegExp(String.raw`${STATEMENT_START}import\b(?!\s*[(.])[^;'"\x60]*?\{`, 'gmu');
// require('./x.js') anywhere in code, with the names it is asked for: const { a, b } = require(…) or require(…).a
const RELATIVE_REQUIRE = new RegExp(
  String.raw`(?:\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*)?\brequire\s*\(\s*(['"\x60])(\.{1,2}\/[^'"\x60]*)\2\s*\)(?:\s*\.\s*(${NAME}))?`,
  'gu'
);

const abs = (file) => path.join(ROOT, file);
const repoPath = (absolute) => path.relative(ROOT, absolute).split(path.sep).join('/');
const exists = (file) => fs.existsSync(abs(file));
const read = (file) => fs.readFileSync(abs(file), 'utf8');
const isEsm = (text) => ESM_LINE.test(text);
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * A case that needs files of other tasks. With a file missing it fails, or,
 * in a partial tree, waits as a todo.
 */
function gated(name, needs, run) {
  const missing = needs.filter((file) => !exists(file));
  if (missing.length === 0) {
    test(name, run);
  } else if (PARTIAL) {
    test.todo(`${name} (not in the tree yet: ${missing.join(', ')})`);
  } else {
    test(name, () => {
      throw new Error(`Not in the tree: ${missing.join(', ')}`);
    });
  }
}

/** The names that a module or a kit does not give. An undefined value counts: the importer would get undefined. */
function missingNames(holder, names) {
  const usable = holder !== null && (typeof holder === 'object' || typeof holder === 'function');
  return names.filter((name) => !usable || !(name in holder) || holder[name] === undefined);
}

/** Every .js file under a folder as a repo-relative path. The volume's ._name twins are not source files. */
function jsFilesUnder(folder, root = ROOT) {
  const found = [];
  const entries = fs
    .readdirSync(path.join(root, folder), { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.name.startsWith('._') || entry.name === 'node_modules') continue;
    const relative = `${folder}/${entry.name}`;
    if (entry.isDirectory()) found.push(...jsFilesUnder(relative, root));
    else if (entry.isFile() && entry.name.endsWith('.js')) found.push(relative);
  }
  return found;
}

/** [{ file, text }] of everything the text rules read. */
function sourceFiles() {
  const files = [...SOURCE_FILES, ...SOURCE_FOLDERS.flatMap((folder) => jsFilesUnder(folder))];
  return files.map((file) => ({ file, text: read(file) }));
}

/** The items of a { … } list. Comments between the braces are not names. */
function listItems(list) {
  return list
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** The property names of a destructuring list: `a`, `a: b` and `a = 1` all take `a` from the object. */
function destructuredKeys(list) {
  return listItems(list).map((item) => item.split(/[:=]/)[0].trim());
}

// After these a `/` starts a regular expression, after anything else it divides
const REGEX_AFTER = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);
const ID_START = /[\p{ID_Start}$_]/u;
const ID_PART = /[\p{ID_Continue}$\u200c\u200d]/u;

/**
 * What each character of a JavaScript text is: 0 code, 1 inside a string,
 * template or regular expression, 2 inside a comment, 3 code inside the
 * ${ … } of a template. `blanked` is the text
 * with its comments turned into spaces (line breaks kept), so offsets and line
 * numbers stay the same. `complete` is false when the text ends inside a
 * string, template or comment, that is when this reader lost its way.
 * A plain scanner, not a parser: enough to keep comments and strings away
 * from the statement readers.
 */
function scanCode(text) {
  const n = text.length;
  const kinds = new Uint8Array(n);
  const out = text.split('');
  const stack = []; // brace depth of the code around each open ${ … }
  let depth = 0;
  let mode = 'code';
  let prev = ''; // the last code token: one punctuator, or 'w' plus a word or value
  let complete = true;
  let i = 0;

  const regexMayStart = () =>
    prev === '' || (prev.length === 1 && REGEX_AFTER.has(prev)) || (prev[0] === 'w' && REGEX_AFTER_WORD.has(prev.slice(1)));

  while (i < n) {
    const ch = text[i];
    if (mode === 'template') {
      kinds[i] = 1;
      if (ch === '\\') {
        if (i + 1 < n) kinds[i + 1] = 1;
        i += 2;
      } else if (ch === '`') {
        mode = 'code';
        prev = 'w';
        i += 1;
      } else if (ch === '$' && text[i + 1] === '{') {
        kinds[i + 1] = 1;
        stack.push(depth);
        depth = 0;
        mode = 'code';
        prev = '{';
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    // Code inside a ${ … } is kind 3: a statement reader must not take it for a statement of the file
    if (stack.length > 0) kinds[i] = 3;
    const next = text[i + 1];
    if (ch === '/' && next === '/') {
      for (; i < n && text[i] !== '\n'; i += 1) {
        kinds[i] = 2;
        if (text[i] !== '\r') out[i] = ' ';
      }
    } else if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) complete = false;
      const stop = end === -1 ? n : end + 2;
      for (; i < stop; i += 1) {
        kinds[i] = 2;
        if (text[i] !== '\n' && text[i] !== '\r') out[i] = ' ';
      }
    } else if (ch === '"' || ch === "'") {
      kinds[i] = 1;
      i += 1;
      while (i < n && text[i] !== ch && text[i] !== '\n') {
        if (text[i] === '\\' && i + 1 < n) kinds[i++] = 1;
        kinds[i++] = 1;
      }
      if (i < n && text[i] === ch) kinds[i++] = 1;
      else complete = false;
      prev = 'w';
    } else if (ch === '`') {
      kinds[i] = 1;
      mode = 'template';
      i += 1;
    } else if (ch === '/' && regexMayStart()) {
      // A regular expression ends at an unescaped / outside a [class], on the same line
      let j = i + 1;
      let inClass = false;
      while (j < n && text[j] !== '\n') {
        const c = text[j];
        if (c === '\\') j += 1;
        else if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
        j += 1;
      }
      if (j < n && text[j] === '/') {
        j += 1;
        while (j < n && /[a-z]/i.test(text[j])) j += 1;
        kinds.fill(1, i, j);
        prev = 'w';
        i = j;
      } else {
        prev = '/';
        i += 1;
      }
    } else if (ch === '{') {
      depth += 1;
      prev = '{';
      i += 1;
    } else if (ch === '}') {
      if (depth === 0 && stack.length > 0) {
        // The end of a ${ … }: back into the template
        kinds[i] = 1;
        depth = stack.pop();
        mode = 'template';
      } else {
        depth -= 1;
        prev = '}';
      }
      i += 1;
    } else if (/\s/.test(ch)) {
      i += 1;
    } else if (ID_START.test(ch) || /[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(next || ''))) {
      let j = i + 1;
      while (j < n && (ID_PART.test(text[j]) || (text[j] === '.' && /[0-9.]/.test(ch)))) j += 1;
      if (stack.length > 0) kinds.fill(3, i, j);
      prev = `w${text.slice(i, j)}`;
      i = j;
    } else {
      prev = ch;
      i += 1;
    }
  }
  if (mode !== 'code' || stack.length > 0) complete = false;
  return { blanked: out.join(''), kinds, complete };
}

const scans = new Map();
/** scanCode, once per text. */
function scanOf(text) {
  if (!scans.has(text)) scans.set(text, scanCode(text));
  return scans.get(text);
}

/** The matches of a statement pattern over the blanked text whose first word is code, with that word's offset. */
function codeStatements(text, pattern) {
  const { blanked, kinds } = scanOf(text);
  const found = [];
  for (const match of blanked.matchAll(pattern)) {
    const keyword = match.index + (match[0].length - match[0].trimStart().length);
    if (kinds[keyword] === 0) found.push({ match, keyword });
  }
  return found;
}

/** The names a shell takes from its kit: the keys of its `export const { … } =` lists, or null without one. */
function shellNames(text) {
  const shell = readShell(text);
  return shell ? shell.names : null;
}

const SHELL_EXPORT = new RegExp(String.raw`${STATEMENT_START}export\s+const\s*\{([^}]*)\}\s*=\s*(?:(${NAME})\s*\(\s*\{([^}]*)\})?`, 'gmu');

/**
 * A shell's `export const { … } = factory({ … })`: the names it takes, and
 * for each list the factory it calls and the CodeMirror names it passes
 * (factory null when the right side is not a call with an object).
 */
function readShell(text) {
  const lists = codeStatements(text, SHELL_EXPORT);
  if (lists.length === 0) return null;
  return {
    names: lists.flatMap(({ match }) => destructuredKeys(match[1])),
    calls: lists.map(({ match }) => ({ factory: match[2] || null, args: match[3] === undefined ? [] : destructuredKeys(match[3]) }))
  };
}

/**
 * What is wrong with a shell: it exports a name that its kit does not return,
 * calls another factory, or leaves a CodeMirror name of its kit out of the
 * object it passes (the kit then builds and throws only in the running editor).
 */
function shellProblems(shell, text, kit) {
  const read = readShell(text);
  if (!read) {
    return [`no "export const { … } = ${kit.factory}({ … })" (it may also follow a ; on the same line)`];
  }
  const problems = read.names
    .filter((name) => !kit.returns.includes(name))
    .map((name) => `exports ${name}, which ${kit.factory} does not return`);
  for (const { factory, args } of read.calls) {
    if (factory !== kit.factory) {
      problems.push(`the export list is not taken from ${kit.factory}({ … }) but from ${factory ? `${factory}(…)` : 'something else'}`);
      continue;
    }
    for (const name of kit.cm.filter((wanted) => !args.includes(wanted))) {
      problems.push(`passes no ${name} to ${kit.factory} (contracts.md 2.1: ${kit.cm.join(', ')})`);
    }
  }
  return problems;
}

/** "file:line found text" for every match of a global pattern; `codeOnly` skips matches in comments and strings. */
function matchesIn(files, pattern, { codeOnly = false, seen = null } = {}) {
  const hits = [];
  for (const { file, text } of files) {
    const kinds = codeOnly ? scanOf(text).kinds : null;
    for (const match of text.matchAll(pattern)) {
      if (codeOnly && kinds[match.index] !== 0 && kinds[match.index] !== 3) continue;
      const key = `${file}:${match.index}`;
      if (seen) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      hits.push(`${file}:${lineOf(text, match.index)} ${match[0]}`);
    }
  }
  return hits;
}

/** The brief's spelling anywhere in the text, then every other spelling in code. */
function rawAndCode(files, raw, code) {
  const seen = new Set();
  return [...matchesIn(files, raw, { seen }), ...matchesIn(files, code, { codeOnly: true, seen })];
}

/** Rule: no file names @codemirror or @lezer in a require call. */
function codemirrorRequires(files) {
  return rawAndCode(files, CODEMIRROR_REQUIRE, CODEMIRROR_REQUIRE_CODE);
}

/** Rule: an ES module never calls require. */
function esmRequires(files) {
  return rawAndCode(
    files.filter(({ text }) => isEsm(text)),
    REQUIRE_CALL,
    REQUIRE_CALL_CODE
  );
}

/** The named import statements of a text: [{ line, names, from, statement }]. `b as c` imports the name b. */
function namedImports(text) {
  return codeStatements(text, NAMED_IMPORT).map(({ match, keyword }) => ({
    line: lineOf(text, keyword),
    names: listItems(match[1]).map((item) => item.split(/\s+as\s+/)[0].trim()),
    from: match[3],
    statement: match[0].trim().replace(/\s+/g, ' ')
  }));
}

/** Imports with a { … } list that namedImports cannot read: [{ line, statement }]. They are reported, not skipped. */
function unreadableImports(text) {
  const read = new Set(codeStatements(text, NAMED_IMPORT).map(({ keyword }) => keyword));
  return codeStatements(text, IMPORT_WITH_LIST)
    .filter(({ keyword }) => !read.has(keyword))
    .map(({ keyword }) => ({ line: lineOf(text, keyword), statement: text.slice(keyword).split('\n')[0].trim() }));
}

// At the end of a line these let an expression go on to the next line, and so do these at the start of the next
const CONTINUES_AFTER = '=,+-*/%&|^!?:<>(.[{';
const CONTINUES_BEFORE = ',.?:+-*/%&|=<>';

/** The names of `export const a = 1, b = 2;` (and let, var), read from the first declarator on. */
function declaratorNames(text, start) {
  const { blanked, kinds } = scanOf(text);
  const n = blanked.length;
  const word = new RegExp(NAME, 'uy');
  const names = [];
  let i = start;
  for (;;) {
    while (i < n && /\s/.test(blanked[i])) i += 1;
    word.lastIndex = i;
    const found = word.exec(blanked);
    // A destructuring pattern is the list reader's business
    if (!found) return names;
    names.push(found[0]);
    i = word.lastIndex;

    // Skip the initializer: up to a comma at depth 0 (the next declarator) or the end of the statement
    let depth = 0;
    let last = '';
    let nextDeclarator = false;
    for (; i < n && !nextDeclarator; i += 1) {
      const ch = blanked[i];
      if (kinds[i] === 2) continue;
      if (kinds[i] === 1 || kinds[i] === 3) {
        last = 'x';
        continue;
      }
      if ('([{'.includes(ch)) depth += 1;
      else if (')]}'.includes(ch)) {
        if (depth === 0) return names;
        depth -= 1;
      } else if (depth === 0 && ch === ';') return names;
      else if (depth === 0 && ch === ',') nextDeclarator = true;
      else if (depth === 0 && ch === '\n') {
        const goesOn = last !== '' && CONTINUES_AFTER.includes(last);
        const following = blanked.slice(i + 1).match(/^\s*(\S)/);
        if (!goesOn && !(following && CONTINUES_BEFORE.includes(following[1]))) return names;
      }
      if (!/\s/.test(ch)) last = ch;
    }
    if (!nextDeclarator) return names;
  }
}

const EXPORT_DECLARATION = new RegExp(String.raw`${STATEMENT_START}export\s+(?:async\s+)?(?:function\s*\*?|class)\s*(${NAME})`, 'gmu');
const EXPORT_VARIABLES = new RegExp(String.raw`${STATEMENT_START}export\s+(?:const|let|var)\s+(?=[\p{ID_Start}$_])`, 'gmu');
const EXPORT_PATTERN = new RegExp(String.raw`${STATEMENT_START}export\s+(?:const|let|var)\s*\{([^}]*)\}\s*=`, 'gmu');
const EXPORT_LIST = new RegExp(String.raw`${STATEMENT_START}export\s*\{([^}]*)\}`, 'gmu');
const EXPORT_DEFAULT = new RegExp(String.raw`${STATEMENT_START}export\s+default\b`, 'gmu');
const EXPORT_STAR = new RegExp(String.raw`${STATEMENT_START}export\s*\*\s*(?:as\s+(${NAME})\s+)?from\s*(['"])(.+?)\2`, 'gmu');

/** The names an ES module declares as exports, read from its text (an `export * from` is followed by esmExportsOf). */
function esmExports(text) {
  const names = new Set();
  // export function name, export async function name, export function* name, export class name
  for (const { match } of codeStatements(text, EXPORT_DECLARATION)) names.add(match[1]);
  // export const name = …, also export const a = 1, b = 2
  for (const { match } of codeStatements(text, EXPORT_VARIABLES)) {
    for (const name of declaratorNames(text, match.index + match[0].length)) names.add(name);
  }
  // export const { a, b: c } = …  (the exported name of `b: c` is c)
  for (const { match } of codeStatements(text, EXPORT_PATTERN)) {
    for (const item of listItems(match[1])) names.add(item.split('=')[0].split(':').pop().trim());
  }
  // export { a, b as c } and export { a } from './x.js'  (the exported name of `b as c` is c)
  for (const { match } of codeStatements(text, EXPORT_LIST)) {
    for (const item of listItems(match[1])) names.add(item.split(/\s+as\s+/).pop().trim());
  }
  // export * as ns from './x.js'
  for (const { match } of codeStatements(text, EXPORT_STAR)) if (match[1]) names.add(match[1]);
  if (codeStatements(text, EXPORT_DEFAULT).length > 0) names.add('default');
  return names;
}

/** The sources of the `export * from './x.js'` statements of a text. */
function starExports(text) {
  return codeStatements(text, EXPORT_STAR)
    .filter(({ match }) => !match[1])
    .map(({ match }) => match[3]);
}

/** The file a relative import names, the way webpack.config.js resolves it, or null. */
function resolveImport(importer, from) {
  const base = path.resolve(path.dirname(abs(importer)), from);
  const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js')];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

/** Runs fn with a stand-in window.electronAPI, and puts back what was there. */
function withBridge(fn) {
  const before = Object.getOwnPropertyDescriptor(window, 'electronAPI');
  window.electronAPI = bridgeStub();
  try {
    return fn();
  } finally {
    if (before) Object.defineProperty(window, 'electronAPI', before);
    else delete window.electronAPI;
  }
}

/**
 * Loads a CommonJS file: { module } or { error }. A renderer module may read
 * window.electronAPI at load, which the app always has; it gets a second try
 * over a stand-in bridge.
 */
function loadCommonJs(target) {
  try {
    return { module: require(target) };
  } catch (error) {
    if (typeof window === 'undefined' || window.electronAPI) return { error };
    try {
      let loaded;
      withBridge(() => jest.isolateModules(() => {
        loaded = require(target);
      }));
      return { module: loaded };
    } catch {
      return { error };
    }
  }
}

/**
 * The export names of a file as an importer sees them: an ES module read as
 * text (following `export * from`), a CommonJS module loaded. Returns
 * { has(name) } or { error }.
 */
function exportsOf(target, seen = new Set()) {
  const text = fs.readFileSync(target, 'utf8');
  if (!isEsm(text)) {
    const { module: loaded, error } = loadCommonJs(target);
    if (error) return { error };
    // webpack gives module.exports itself as the default of a CommonJS module
    return { has: (name) => name === 'default' || missingNames(loaded, [name]).length === 0 };
  }

  seen.add(target);
  const declared = esmExports(text);
  const inner = [];
  for (const from of starExports(text)) {
    const next = resolveImport(repoPath(target), from);
    if (!next || seen.has(next)) continue;
    const found = exportsOf(next, seen);
    if (found.error) return { error: found.error };
    inner.push(found);
  }
  // export * never passes on a default
  return { has: (name) => declared.has(name) || (name !== 'default' && inner.some((found) => found.has(name))) };
}

/**
 * Rule: every name of a named import from a relative path exists in the
 * target. A CommonJS target is loaded and asked; an ES module is read as text,
 * because Jest cannot load it. An import with a list that this reader cannot
 * read is a problem too. Returns { problems, checked }.
 */
function unresolvedImports(files) {
  const problems = [];
  let checked = 0;

  for (const { file, text } of files) {
    if (!isEsm(text)) continue;
    for (const { line, statement } of unreadableImports(text)) {
      problems.push(`${file}:${line} ${statement}: this test cannot read the import; write it as import { a, b } from './x.js'`);
    }
    for (const statement of namedImports(text)) {
      // A package import is webpack's business: a missing package fails the build
      if (!statement.from.startsWith('.')) continue;

      const where = `${file}:${statement.line}`;
      const target = resolveImport(file, statement.from);
      if (!target) {
        problems.push(`${where} ${statement.statement}: the file does not exist`);
        continue;
      }
      const targetName = repoPath(target);
      const found = exportsOf(target);
      if (found.error) {
        problems.push(`${where} ${statement.statement}: ${targetName} cannot be loaded (${found.error.message})`);
        continue;
      }
      for (const name of statement.names) {
        checked += 1;
        if (!found.has(name)) problems.push(`${where} imports ${name} from '${statement.from}', but ${targetName} does not export it`);
      }
    }
  }
  return { problems, checked };
}

const OPTIONAL_HINT = '(a require that may be absent or cannot load under Jest goes into OPTIONAL_REQUIRES at the top of this file)';

/**
 * Rule: every require of a relative path, at the top of a CommonJS file or
 * inside a function, names a file that exists, and the names it takes from
 * the module exist. This reads the lazy defaults that no case runs. Comments
 * and strings are not read.
 * A name with a default (`{ a = 1 }`) or behind `...` is the author's own risk.
 * Returns { problems, checked, waiting }: `waiting` are files of the module
 * table that a partial tree does not have yet.
 */
function unresolvedRequires(files, { partial = PARTIAL, pending = PENDING_EXPORTS, optional = OPTIONAL_REQUIRES } = {}) {
  const problems = [];
  const waiting = [];
  let checked = 0;

  for (const { file, text } of files) {
    if (isEsm(text)) continue;
    const { blanked, kinds } = scanOf(text);
    for (const match of blanked.matchAll(RELATIVE_REQUIRE)) {
      if (kinds[match.index] !== 0 && kinds[match.index] !== 3) continue;
      const [found, list, , from, member] = match;
      if ((optional[file] || []).includes(from)) continue;
      const where = `${file}:${lineOf(text, match.index)}`;
      const base = path.resolve(path.dirname(abs(file)), from);
      checked += 1;

      let target;
      try {
        target = require.resolve(base);
      } catch {
        const expected = repoPath(/\.\w+$/.test(base) ? base : `${base}.js`);
        if (partial && MODULES[expected] && !exists(expected)) waiting.push(expected);
        else problems.push(`${where} require('${from}'): the file does not exist ${OPTIONAL_HINT}`);
        continue;
      }

      const keys = list
        ? listItems(list)
            .filter((item) => !item.includes('=') && !item.startsWith('...'))
            .map((item) => item.split(':')[0].trim())
        : [];
      if (keys.length === 0 && !member) continue;

      const targetName = repoPath(target);
      const { module: loaded, error } = loadCommonJs(target);
      if (error) {
        problems.push(`${where} ${found.replace(/\s+/g, ' ')}: ${targetName} cannot be loaded (${error.message}) ${OPTIONAL_HINT}`);
        continue;
      }
      const allowed = pending[targetName] || [];
      const report = (name, holder) => {
        if (!allowed.includes(name) || holder) problems.push(`${where} takes ${name} from require('${from}')${holder ? `.${holder}` : ''}, but ${holder ? `${holder} of ${targetName} has no ${name}` : `${targetName} does not export it`}`);
      };

      // require(…).a takes a from the module; const { b } = require(…).a takes b from a
      if (member && missingNames(loaded, [member]).length > 0) report(member, null);
      else if (member) missingNames(loaded[member], keys).forEach((name) => report(name, member));
      else missingNames(loaded, keys).forEach((name) => report(name, null));
    }
  }
  return { problems, checked, waiting: [...new Set(waiting)] };
}

/** Rule: no retired wording, whatever its letter case or the composition of its ä and ö. */
function retiredWordings(files, wordings = RETIRED_WORDINGS) {
  const fold = (value) => value.normalize('NFC').toLowerCase();
  const needles = wordings.map((wording) => ({ wording, folded: fold(wording) }));
  const hits = [];
  for (const { file, text } of files) {
    fold(text)
      .split('\n')
      .forEach((line, index) => {
        for (const { wording, folded } of needles) {
          if (line.includes(folded)) hits.push(`${file}:${index + 1} ${wording}`);
        }
      });
  }
  return hits;
}

/** Fails with every problem in one message. */
function expectNone(problems, heading) {
  if (problems.length > 0) throw new Error(`${heading}\n  ${problems.join('\n  ')}`);
}

// The kits are built once: the inline prompt takes the suggestion field of the suggestion kit
const builtKits = {};
function buildKit(file) {
  if (!builtKits[file]) {
    const { factory, optionsFrom, cm: names } = KITS[file];
    const core = require(abs(file));
    if (typeof core[factory] !== 'function') throw new Error(`${file} does not export the function ${factory}`);

    // Only the names of contracts 2.1, as the shell passes them
    const given = Object.fromEntries(names.map((name) => [name, cm[name]]));
    let options;
    if (optionsFrom) {
      options = {};
      for (const [option, [sourceFile, name]] of Object.entries(optionsFrom)) options[option] = buildKit(sourceFile)[name];
    }
    builtKits[file] = options ? core[factory](given, options) : core[factory](given);
  }
  return builtKits[file];
}

/**
 * A stand-in for window.electronAPI: whatever method a getter asks for is a
 * jest.fn that resolves { success: true }, as an IPC invoke does.
 */
function bridgeStub() {
  const methods = {};
  return new Proxy(
    {},
    {
      get(target, name) {
        // Not a thenable, and no answers to the symbols that Jest and Node probe
        if (typeof name !== 'string' || name === 'then') return undefined;
        if (!methods[name]) methods[name] = jest.fn(async () => ({ success: true }));
        return methods[name];
      }
    }
  );
}

/** Calls a getter of a freshly loaded module with window.electronAPI in place. */
function callWithBridge(file, name) {
  return withBridge(() => {
    let result;
    // A fresh registry: the singletons are created now, over this bridge
    jest.isolateModules(() => {
      result = require(abs(file))[name]();
    });
    return result;
  });
}

// Files that the request client of P-02 loads when it is required
const AI_CLIENT_FILES = [
  'src/services/ai/aiClient.js',
  'src/services/ai/tokenStats.js',
  'src/services/ai/usageLog.js',
  'src/services/format.fi.js',
  'src/services/settingsStore.js'
];
const CONTEXT_SESSION_FILES = ['src/services/ai/contextSession.js', 'src/services/ai/contextBuilder.js', ...AI_CLIENT_FILES];
// What createDefaultReviewController requires inside the function (P-07 brief), with P-07's own modules
const REVIEW_CONTROLLER_FILES = [
  'src/services/review/reviewController.js',
  'src/services/review/reviewChecks.js',
  'src/services/review/localChecks.js',
  'src/services/review/findings.js',
  'src/services/ai/reviewPass.js',
  'src/editor/plainView.js',
  'src/editor/locateQuote.js',
  'src/editor/blocks.js',
  'src/editor/sentences.js',
  'src/editor/wordDiff.js',
  'src/services/ai/batchParagraphs.js',
  'src/editor/termMatch.js',
  'src/editor/typography.fi.js',
  'src/services/story/codex.js',
  ...CONTEXT_SESSION_FILES
];

// ---------------------------------------------------------------------------
// 1. Every listed export exists
// ---------------------------------------------------------------------------

describe('every export of contracts 2.1 exists', () => {
  for (const [file, names] of Object.entries(MODULES)) {
    gated(file, [file], () => {
      // Requiring a script must not run its command line
      if (file.startsWith('scripts/') && !read(file).includes('require.main === module')) {
        throw new Error(`${file} does not guard its command line with require.main === module`);
      }
      const missing = missingNames(require(abs(file)), names);
      expectNone(missing, `${file} does not export:`);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. The editor kits build and return what the shells export
// ---------------------------------------------------------------------------

describe("the editor kits build with CodeMirror's CommonJS build and return the shell names", () => {
  for (const [file, kit] of Object.entries(KITS)) {
    const sources = Object.values(kit.optionsFrom || {}).map(([sourceFile]) => sourceFile);
    gated(`${file}: ${kit.factory}(cm)`, [file, ...sources], () => {
      const missing = missingNames(buildKit(file), kit.returns);
      expectNone(missing, `${kit.factory} of ${file} does not return:`);
    });
  }

  test('every shell of the table belongs to a kit of the table, and every kit names its CodeMirror values', () => {
    const unknown = Object.entries(SHELLS).filter(([, core]) => !KITS[core]);
    expect(unknown).toEqual([]);
    const notInCodeMirror = Object.values(KITS).flatMap((kit) => kit.cm.filter((name) => cm[name] === undefined));
    expect(notInCodeMirror).toEqual([]);
  });

  for (const [shell, core] of Object.entries(SHELLS)) {
    if (!exists(shell)) continue;
    test(`${shell} exports only names that ${KITS[core] ? KITS[core].factory : core} returns`, () => {
      expectNone(shellProblems(shell, read(shell), KITS[core]), `${shell} is not the shell of ${core} (contracts.md 2.3):`);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. The lazy defaults resolve
// ---------------------------------------------------------------------------

// Each default of a `deps` argument is a require inside a function, so a wrong
// path or name stays hidden until the function runs. Each one runs once here.
describe('lazy defaults resolve', () => {
  gated('judgeEdit cleans the answer without a clean function', [...AI_CLIENT_FILES, 'src/services/ai/cleanModelOutput.js'], () => {
    const { judgeEdit } = require(abs('src/services/ai/aiClient.js'));
    const verdict = judgeEdit(
      { ok: true, text: '<teksti>a</teksti>', stopReason: 'end_turn', promptTruncated: false, sawThinking: false },
      {}
    );
    expect(verdict.accepted).toBe(true);
    expect(verdict.inner).toBe('a');
  });

  gated('resolveEditTarget finds the paragraph without deps', ['src/editor/promptTarget.js', 'src/editor/blocks.js'], () => {
    const { resolveEditTarget } = require(abs('src/editor/promptTarget.js'));
    expect(resolveEditTarget('Yksi kappale.', 3, 3).ok).toBe(true);
  });

  gated('readImportFolder reads an empty folder with its default deps', ['utils/importFolder.js', 'utils/manuscript.js'], async () => {
    const { readImportFolder } = require(abs('utils/importFolder.js'));
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'faust-wiring-'));
    try {
      const result = await readImportFolder(folder);
      expect(result).toEqual(expect.objectContaining({ chapters: [] }));
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  const getters = [
    ['src/services/settingsStore.js', 'getSettingsStore', ['src/services/settingsStore.js']],
    ['src/services/ai/aiClient.js', 'getAIClient', AI_CLIENT_FILES],
    ['src/services/ai/contextSession.js', 'getContextSession', CONTEXT_SESSION_FILES],
    ['src/services/review/reviewController.js', 'createDefaultReviewController', REVIEW_CONTROLLER_FILES]
  ];
  for (const [file, name, needs] of getters) {
    gated(`${name}() returns an object over window.electronAPI`, needs, async () => {
      const result = callWithBridge(file, name);
      expect(result).not.toBeNull();
      expect(typeof result).toBe('object');
      // Whatever the getter started (loading the settings, say) may finish before the next case
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
});

// voikkoStatus is an IPC invoke: it returns a Promise. A caller that reads
// .available from it without await never gets a word checker. This is the guard.
gated('a word checker is available after the Voikko status has been awaited', ['src/services/language/wordCheck.js'], async () => {
  const { createWordCheck } = require(abs('src/services/language/wordCheck.js'));
  const voikkoAnalyze = jest.fn(async () => ({ success: true, results: [{ word: 'kirja', known: true }] }));
  const check = createWordCheck({ voikkoStatus: async () => ({ available: true }), voikkoAnalyze });
  expect(check.current()).toBeUndefined();

  await check.refresh();
  expect(check.source()).toBe('voikko');
  expect(typeof check.current()).toBe('function');
  await expect(check.current()(['kirja'])).resolves.toEqual({ kirja: true });
  expect(voikkoAnalyze).toHaveBeenCalledTimes(1);
});

// ---------------------------------------------------------------------------
// 4. Text rules over the files that reach the bundle or the main process
// ---------------------------------------------------------------------------

test('no bundled file requires @codemirror or @lezer', () => {
  expectNone(
    codemirrorRequires(sourceFiles()),
    'Only import statements in ESM files may name @codemirror or @lezer (a require adds a second copy to the bundle):'
  );
});

test('no ESM file calls require', () => {
  expectNone(esmRequires(sourceFiles()), 'An ES module takes a CommonJS module with import, never with require:');
});

test('every named import of an ESM file resolves', () => {
  const { problems, checked } = unresolvedImports(sourceFiles());
  expectNone(problems, 'webpack builds these imports and the names are undefined at run time:');
  // app.js imports its components and the text tools by name; reading nothing would mean the rule is blind
  expect(checked).toBeGreaterThan(0);
});

// The lazy defaults of section 3 are the ones the plan names. This rule reads every other require too.
test('every relative require names a file and an export that exist', () => {
  const { problems, checked } = unresolvedRequires(sourceFiles());
  expectNone(problems, 'A require with a wrong path or name fails only when its function first runs:');
  // electron.js requires ./utils/manuscript today; reading nothing would mean the rule is blind
  expect(checked).toBeGreaterThan(0);
});

// The statement readers skip comments and strings. A file they cannot follow to its end would hide its imports.
test('the statement readers follow every source file to its end', () => {
  const lost = sourceFiles()
    .filter(({ text }) => !scanOf(text).complete)
    .map(({ file }) => `${file}: ends inside a string, template or comment as this test reads it`);
  expectNone(lost, 'The wiring rules cannot read these files (a regular expression the scanner takes for a division?):');
});

// A row of PENDING_EXPORTS would keep a mistake hidden for good once the name has come
test('PENDING_EXPORTS lists only names that are still to come', () => {
  const stale = [];
  for (const [file, names] of Object.entries(PENDING_EXPORTS)) {
    if (!exists(file)) continue;
    const loaded = require(abs(file));
    for (const name of names) if (missingNames(loaded, [name]).length === 0) stale.push(`${file}: ${name}`);
  }
  expectNone(stale, 'These names exist now: delete them from PENDING_EXPORTS and list them in MODULES:');
});

test('retired wordings are gone', () => {
  expectNone(retiredWordings(sourceFiles()), 'Retired wordings (contracts.md 8.1):');
});

// ---------------------------------------------------------------------------
// 5. The gates see the mistakes they exist for
// ---------------------------------------------------------------------------

describe('the gates fail on the mistakes they are for', () => {
  const tempFolders = [];
  const tempFile = (name, content) => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'faust-wiring-'));
    tempFolders.push(folder);
    const file = path.join(folder, name);
    fs.writeFileSync(file, content);
    return file;
  };
  afterAll(() => {
    for (const folder of tempFolders) fs.rmSync(folder, { recursive: true, force: true });
  });

  test('a require of @codemirror or @lezer is found in CommonJS and ESM text alike, in any spelling', () => {
    const files = [
      { file: 'src/a.js', text: "const { StateField } = require('@codemirror/state');\nmodule.exports = { StateField };\n" },
      { file: 'src/b.js', text: 'import { x } from "./x.js";\n\nconst tags = require(\n  "@lezer/highlight");\n' },
      { file: 'src/c.js', text: "import { EditorView } from '@codemirror/view';\nconst own = require('./codemirrorLike.js');\n" },
      // webpack bundles these spellings too
      { file: 'src/d.js', text: "const common = require ('@lezer/common');\nconst view = require(`@codemirror/view`);\nmodule.exports = { common, view };\n" },
      // Words in a comment or a string are not a call
      { file: 'src/e.js', text: "// we require ('@lezer/common') nowhere\nconst hint = \"never require (`@codemirror/state`)\";\nmodule.exports = { hint };\n" }
    ];
    expect(codemirrorRequires(files)).toEqual([
      "src/a.js:1 require('@codemirror/",
      'src/b.js:3 require(\n  "@lezer/',
      "src/d.js:1 require ('@lezer/",
      'src/d.js:2 require(`@codemirror/'
    ]);
  });

  test('a require call in an ESM file is found, and a CommonJS file may call require', () => {
    const files = [
      { file: 'src/esm.js', text: "import { a } from './a.js';\nexport function b() {\n  return require('./c.js');\n}\n" },
      { file: 'src/cjs.js', text: "const a = require('./a.js');\nmodule.exports = { a };\n" },
      // A comment line that starts with * import is not an import statement
      { file: 'src/doc.js', text: "/**\n * import { a } from './a.js';\n */\nconst a = require('./a.js');\nmodule.exports = { a };\n" },
      { file: 'src/spaced.js', text: "export const a = 1;\nconst b = require ('./b.js');\nconst words = 'these require (at most) one';\n" }
    ];
    expect(esmRequires(files)).toEqual(['src/esm.js:3 require(', 'src/spaced.js:2 require (']);
  });

  test('a name that the target of a named import does not export is found, with file and line', () => {
    const files = [
      {
        file: 'src/scratch/wiringTrial.js',
        text: [
          "import { EditorView } from '@codemirror/view';",
          'import {',
          '  continueList, // a real export of the CommonJS text tools, see {@link continueList}',
          '  countWords as words,',
          '  eiOlemassa',
          "} from '../editor/textTools.js';",
          "import { FaustEditor, EiKomponentti } from '../components/FaustEditor.js';",
          "import { jotain } from './puuttuva.js';",
          "import { ErrorBoundary } from '../components/ErrorBoundary.js'; import { toinenRivilla } from '../editor/textTools.js';",
          "const x = 1; import { kolmas } from '../editor/textTools.js';",
          'export const ready = true;',
          ''
        ].join('\n')
      },
      // Not an ES module, so its text is not read for imports
      { file: 'src/scratch/plain.js', text: "const text = 'import { nope } from ./x';\nmodule.exports = { text };\n" }
    ];
    const { problems, checked } = unresolvedImports(files);
    expect(problems).toEqual([
      "src/scratch/wiringTrial.js:2 imports eiOlemassa from '../editor/textTools.js', but src/editor/textTools.js does not export it",
      "src/scratch/wiringTrial.js:7 imports EiKomponentti from '../components/FaustEditor.js', but src/components/FaustEditor.js does not export it",
      "src/scratch/wiringTrial.js:8 import { jotain } from './puuttuva.js': the file does not exist",
      "src/scratch/wiringTrial.js:9 imports toinenRivilla from '../editor/textTools.js', but src/editor/textTools.js does not export it",
      "src/scratch/wiringTrial.js:10 imports kolmas from '../editor/textTools.js', but src/editor/textTools.js does not export it"
    ]);
    // Five names of textTools.js, two of FaustEditor.js, one of ErrorBoundary.js; the package import is not counted
    expect(checked).toBe(8);
  });

  test('an ES module target is read through export *, with non-ASCII names, several declarators and comments', () => {
    const folder = path.dirname(tempFile('TrialInner.js', 'export function syvä() {}\nexport default function ohitettu() {}\n'));
    const write = (name, content) => fs.writeFileSync(path.join(folder, name), content);
    write(
      'TrialTarget.js',
      [
        "export * from './TrialInner.js';",
        'export const määrä = 1, toinen = { a: [1, 2] }, kolmas = (x, y) => x + y;',
        '/* earlier version:',
        'export function vanha() {}',
        '*/',
        "const ohje = 'export function merkkijonossa() {}';",
        'export function uusi() {}',
        ''
      ].join('\n')
    );
    // A renderer module that reads window.electronAPI when it is loaded
    write('trialBridge.js', 'const api = window.electronAPI;\nmodule.exports = { on: api.onMenuAction };\n');
    const importer = repoPath(path.join(folder, 'Trial.js'));
    const text = [
      "import { syvä, määrä, toinen, kolmas, uusi } from './TrialTarget.js';",
      "import { vanha, merkkijonossa, default as oletus } from './TrialTarget.js';",
      "import { on } from './trialBridge.js';",
      'export const ready = true;',
      ''
    ].join('\n');
    const where = `${importer}:2 imports`;
    const target = repoPath(path.join(folder, 'TrialTarget.js'));
    expect(unresolvedImports([{ file: importer, text }]).problems).toEqual([
      `${where} vanha from './TrialTarget.js', but ${target} does not export it`,
      `${where} merkkijonossa from './TrialTarget.js', but ${target} does not export it`,
      `${where} default from './TrialTarget.js', but ${target} does not export it`
    ]);
    expect(window.electronAPI).toBeUndefined();
  });

  test('an import with a list that the reader cannot read is reported, not skipped', () => {
    const text = "import { a } from './a.js';\nimport { b } from\n  someName;\nexport const c = 1;\n";
    expect(unreadableImports(text)).toEqual([{ line: 2, statement: 'import { b } from' }]);
    expect(unreadableImports("import(\n  './x.js').then(({ a }) => a);\nimport.meta;\n")).toEqual([]);
  });

  test('a lazy require with a wrong path or a name the module does not export is found', () => {
    const files = [
      {
        file: 'src/scratch/lazyTrial.js',
        text: [
          "const { continueList, eiOle: alias } = require('../editor/textTools.js');",
          '',
          'function later(deps) {',
          "  const count = (deps && deps.countWords) || require('../editor/textTools').countWords;",
          "  const missing = require('../editor/textTools.js').puuttuu;",
          "  const { valinnainen = null, ...rest } = require('../editor/textTools.js');",
          "  const pattern = require('../editor/textTools.js').WORD_CHAR || /x/;",
          "  const gone = require(\"./ei-tiedostoa.js\");",
          "  const sdk = require('@anthropic-ai/sdk');",
          '  return { count, missing, valinnainen, rest, pattern, gone, sdk, alias, continueList };',
          '}',
          '',
          'module.exports = { later };',
          ''
        ].join('\n')
      },
      // An ES module cannot call require at all; that is another rule's finding
      { file: 'src/scratch/esm.js', text: "import { a } from './a.js';\nconst b = require('./ei-tiedostoa.js');\n" }
    ];
    const { problems, checked, waiting } = unresolvedRequires(files, { partial: false });
    expect(problems).toEqual([
      "src/scratch/lazyTrial.js:1 takes eiOle from require('../editor/textTools.js'), but src/editor/textTools.js does not export it",
      "src/scratch/lazyTrial.js:5 takes puuttuu from require('../editor/textTools.js'), but src/editor/textTools.js does not export it",
      `src/scratch/lazyTrial.js:8 require('./ei-tiedostoa.js'): the file does not exist ${OPTIONAL_HINT}`
    ]);
    // Six relative requires; the package is not this rule's business
    expect(checked).toBe(6);
    expect(waiting).toEqual([]);

    // A name that a later stage adds is a mistake once nobody has promised it
    const strict = unresolvedRequires(files, { partial: false, pending: {} });
    expect(strict.problems.filter((problem) => problem.includes('WORD_CHAR'))).toHaveLength(
      'WORD_CHAR' in require(abs('src/editor/textTools.js')) ? 0 : 1
    );
  });

  test('a require reads the list of a member, and not comments, strings or the OPTIONAL_REQUIRES', () => {
    const files = [
      {
        file: 'src/services/trialLimits.js',
        text: [
          '/**',
          ' * Usage, from a service:',
          " *   const { trial } = require('../../editor/trialDoc.js');",
          ' */',
          "// const { old } = require('./removedLongAgo.js');",
          // The target is the tracked package.json, so the case does not wait for any other package
          "const { test: testScript } = require('../../package.json').scripts;",
          "const { eiSkriptia } = require('../../package.json').scripts;",
          "const hint = \"let the default require('./real-thing.js') run\";",
          "const tmpl = `require('./template-thing.js')`;",
          'let local = null;',
          'try {',
          "  local = require('./local-overrides.js');",
          '} catch {',
          '  local = null;',
          '}',
          'module.exports = { testScript, eiSkriptia, hint, tmpl, local };',
          ''
        ].join('\n')
      }
    ];
    const optional = { 'src/services/trialLimits.js': ['./local-overrides.js'] };
    const result = unresolvedRequires(files, { partial: false, optional });
    expect(result.problems).toEqual([
      "src/services/trialLimits.js:7 takes eiSkriptia from require('../../package.json').scripts, but scripts of package.json has no eiSkriptia"
    ]);
    expect(result.checked).toBe(2);
    // Without the table row the optional module is a missing file
    expect(unresolvedRequires(files, { partial: false, optional: {} }).problems).toHaveLength(2);
  });

  test('in a partial tree a require of a module that is not there yet waits instead of failing', () => {
    const absent = 'src/services/wiring/notWrittenYet.js';
    const importer = [{ file: 'src/services/wiring/user.js', text: "const later = () => require('./notWrittenYet.js').run;\n" }];
    MODULES[absent] = ['run'];
    try {
      expect(unresolvedRequires(importer, { partial: true })).toEqual({ problems: [], checked: 1, waiting: [absent] });
      expect(unresolvedRequires(importer, { partial: false }).problems).toEqual([
        `src/services/wiring/user.js:1 require('./notWrittenYet.js'): the file does not exist ${OPTIONAL_HINT}`
      ]);
    } finally {
      delete MODULES[absent];
    }
    // A file that the module table does not know is a wrong path in any tree
    expect(unresolvedRequires(importer, { partial: true }).problems).toHaveLength(1);
  });

  test('the import reader reads a list broken over lines, renames, comments, a default beside the list and two statements on a line', () => {
    const text = [
      "import React, { useState, useEffect as effect } from 'react';",
      'import {',
      '  yksi, /* the first */',
      '  kaksi as toinen, // renamed, see {@link x}',
      '  kolme,',
      "} from './luvut.js';",
      "export { neljä as viisi } from \"./lisää.js\";",
      "  import { sisennetty } from './sisennetty.js';",
      "// import { kommentti } from './ei.js';",
      "import * as kaikki from './kaikki.js';",
      "import oletus from './oletus.js';",
      "import { a } from './a.js'; import { b } from './b.js';",
      "const ohje = \"; import { merkkijono } from './ei.js'\";",
      ''
    ].join('\n');
    expect(namedImports(text)).toEqual([
      { line: 1, names: ['useState', 'useEffect'], from: 'react', statement: "import React, { useState, useEffect as effect } from 'react'" },
      { line: 2, names: ['yksi', 'kaksi', 'kolme'], from: './luvut.js', statement: "import { yksi, kaksi as toinen, kolme, } from './luvut.js'" },
      { line: 7, names: ['neljä'], from: './lisää.js', statement: 'export { neljä as viisi } from "./lisää.js"' },
      { line: 8, names: ['sisennetty'], from: './sisennetty.js', statement: "import { sisennetty } from './sisennetty.js'" },
      { line: 12, names: ['a'], from: './a.js', statement: "import { a } from './a.js'" },
      { line: 12, names: ['b'], from: './b.js', statement: "import { b } from './b.js'" }
    ]);
    expect(unreadableImports(text)).toEqual([]);
  });

  test('the export reader knows the export forms of an ES module', () => {
    const text = [
      'export function plain() {}',
      'export async function later() {}',
      'export function* steps() {}',
      'export class Boundary extends React.Component {}',
      'export const FaustEditor = forwardRef(function Inner() {});',
      'export let counter = 0;',
      'export const { suggestionField, suggestionEffect: effect,',
      '  suggestionAccept = null } =',
      '  createSuggestionKit({});',
      'const local = 1, other = 2;',
      'export { local, other as renamed };',
      "export { moved } from './moved.js';",
      "export * as kaikki from './kaikki.js';",
      'export default plain;',
      'function notExported() {}',
      '  export function indented() {}',
      'export const määrä = 1, lisää = { a: [1, 2], b: f(3, 4) },',
      '  kolmas = 3;',
      'export const pattern = /,/g, jälkeen = `${a, b}`;',
      'export const pitkä = a',
      '  + b, viimeinen = 0',
      'const eiVienti = 1, eiKään = 2;',
      '/*',
      'export function kommentissa() {}',
      '*/',
      "const s = 'export function merkkijonossa() {}';",
      'export const yksi = 1; export const kaksi = 2;',
      ''
    ].join('\n');
    expect([...esmExports(text)].sort()).toEqual(
      [
        'Boundary', 'FaustEditor', 'counter', 'default', 'effect', 'later', 'local', 'moved', 'plain', 'renamed', 'steps',
        'suggestionAccept', 'suggestionField', 'kaikki', 'indented', 'määrä', 'lisää', 'kolmas', 'pattern', 'jälkeen',
        'pitkä', 'viimeinen', 'yksi', 'kaksi'
      ].sort()
    );
    expect(starExports("export * from './a.js';\nexport * as b from './b.js';\n")).toEqual(['./a.js']);
    // A shell is checked by the names it takes from its kit, not by what it calls them
    expect(destructuredKeys('suggestionField, suggestionEffect: effect,\n  suggestionAccept = null')).toEqual([
      'suggestionField',
      'suggestionEffect',
      'suggestionAccept'
    ]);
  });

  test('the shell reader takes every name of the export list, so a name the kit does not return is seen', () => {
    // The shell of contracts.md 2.3, word for word
    const shell = [
      "import { StateField, StateEffect, Annotation, Prec } from '@codemirror/state';",
      "import { EditorView, Decoration, WidgetType, keymap } from '@codemirror/view';",
      "import { createSuggestionKit } from './suggestionsCore.js';",
      'export const { suggestionField, suggestionEffect, suggestionAccept, suggestionExtension, installSuggestionFacade,',
      '  readSuggestionMeta, suggestionEvents, suggestionSnapshot, suggestionState } =',
      '  createSuggestionKit({ StateField, StateEffect, Annotation, Prec, EditorView, Decoration, WidgetType, keymap });',
      ''
    ].join('\n');
    const kit = KITS['src/editor/suggestionsCore.js'];
    expect(shellNames(shell)).toEqual(kit.returns);
    expect(shellProblems('s.js', shell, kit)).toEqual([]);

    const misspelled = shellNames(shell.replace('suggestionSnapshot,', 'suggestionSnapshots,').replace(/\n/g, '\r\n'));
    expect(misspelled.filter((name) => !kit.returns.includes(name))).toEqual(['suggestionSnapshots']);

    // A file that only re-exports one name at a time has no list to check, and that is reported
    expect(shellNames("import { a } from './a.js';\nexport const b = a;\n")).toBeNull();
    expect(shellNames('')).toBeNull();
  });

  test('a shell written on one line is read, and one that calls another factory or leaves out a CodeMirror name is not a shell', () => {
    const smart = KITS['src/editor/smartTypingCore.js'];
    // The table cell of stage I-06, copied as it is printed
    const oneLine =
      "import { EditorView } from '@codemirror/view'; import { Annotation } from '@codemirror/state'; " +
      "import { createSmartTypingKit } from './smartTypingCore.js'; " +
      'export const { SmartTyping, smartTyping } = createSmartTypingKit({ EditorView, Annotation });\n';
    expect(shellProblems('src/editor/smartTyping.js', oneLine, smart)).toEqual([]);
    expect(namedImports(oneLine).map(({ names }) => names)).toEqual([['EditorView'], ['Annotation'], ['createSmartTypingKit']]);

    const review = KITS['src/editor/reviewHighlightsCore.js'];
    const noDecoration =
      "import { StateField, StateEffect } from '@codemirror/state';\nimport { EditorView } from '@codemirror/view';\n" +
      "import { createReviewHighlightsKit } from './reviewHighlightsCore.js';\n" +
      'export const { setFindingHighlights, findingField, reviewHighlights, findingRanges } =\n' +
      '  createReviewHighlightsKit({ StateField, StateEffect, EditorView });\n';
    expect(shellProblems('src/editor/reviewHighlights.js', noDecoration, review)).toEqual([
      'passes no Decoration to createReviewHighlightsKit (contracts.md 2.1: StateField, StateEffect, EditorView, Decoration)'
    ]);

    const term = KITS['src/editor/termHighlightCore.js'];
    const otherFactory =
      "import { createReviewHighlightsKit } from './reviewHighlightsCore.js';\n" +
      'export const { setTermHighlightConfig, termHighlight } = createReviewHighlightsKit({ StateField, StateEffect, Decoration, ViewPlugin, EditorView });\n';
    expect(shellProblems('src/editor/termHighlight.js', otherFactory, term)).toEqual([
      'the export list is not taken from createTermHighlightKit({ … }) but from createReviewHighlightsKit(…)'
    ]);
    expect(shellProblems('src/editor/termHighlight.js', 'export const { termHighlight } = kit;\n', term)).toEqual([
      'the export list is not taken from createTermHighlightKit({ … }) but from something else'
    ]);
    expect(shellProblems('src/editor/termHighlight.js', 'export const termHighlight = 1;\n', term)).toHaveLength(1);
  });

  test('the code scanner keeps comments, strings, templates and regular expressions apart', () => {
    const text = [
      "const a = 'x // not a comment'; // a comment",
      'const b = `t ${c /* inside */ + `n ${d}`} // still template`;',
      "const r = /\\/\\/ not a comment ['\"]/g, q = x / y / z;",
      'if (ok) return /[/]/.test(s);',
      ''
    ].join('\n');
    const { blanked, complete } = scanCode(text);
    expect(complete).toBe(true);
    expect(blanked.split('\n')).toEqual([
      `const a = 'x // not a comment';${' '.repeat(13)}`,
      `const b = \`t \${c${' '.repeat(14)}+ \`n \${d}\`} // still template\`;`,
      "const r = /\\/\\/ not a comment ['\"]/g, q = x / y / z;",
      'if (ok) return /[/]/.test(s);',
      ''
    ]);
    expect(scanCode("const a = 'open\n").complete).toBe(false);
    expect(scanCode('/* open').complete).toBe(false);
  });

  test('a retired wording is found in any letter case and with decomposed ä and ö', () => {
    const files = [
      { file: 'src/a.js', text: "const a = 'Tekoäly pois -asetus on päällä.';\nconst b = '1 käsittelemätön ehdotus';\n" },
      { file: 'src/b.js', text: "const a = 'Tarkistamattomat ehdotukset';\n\nconst b = 'koska tekoäly on pois päältä';\n" },
      // The same sentence typed with a + U+0308 instead of ä
      { file: 'src/c.js', text: "const a = 'Tekoäly on kytketty pois asetuksista.';\n" },
      {
        file: 'src/d.js',
        text: [
          "const a = '3 odottavaa ehdotusta';",
          "const b = 'Muissa luvuissa odottaa 5 ehdotusta';",
          "const c = '1 odottava ehdotus';",
          "const d = 'Odottavat ehdotukset';",
          "const e = '4 ehdotusta odottaa tekstissä';",
          ''
        ].join('\n')
      }
    ];
    expect(retiredWordings(files)).toEqual([
      'src/b.js:1 tarkistamattomat',
      'src/b.js:3 Tekoäly on pois päältä',
      'src/c.js:1 Tekoäly on kytketty pois',
      'src/d.js:1 odottavaa ehdotusta',
      'src/d.js:3 odottava ehdotus',
      'src/d.js:4 odottavat ehdotukset'
    ]);
    expect(retiredWordings([{ file: 'src/e.js', text: '' }])).toEqual([]);
  });

  test('the wordings of stage I-00 are found in strings and in comments, in any letter case', () => {
    const files = [
      { file: 'src/a.js', text: "// Opens the AI-avustaja panel\nconst a = 'Avaa asetukset (Cmd+,) ja valitse malli.';\n" },
      { file: 'src/b.js', text: "/** @param folderName 'Tarinakansio' or 'Kirjan kansio' */\nconst b = 'KIRJAN YDIN';\n" },
      { file: 'src/c.js', text: "const c = '⌘-napsautus avaa';\nconst d = 'Piilota mallin vastaus';\nconst e = 'Malli kirjoittaa… 22 merkkiä';\n" },
      { file: 'src/d.js', text: "const f = 'Malli ajattelee…';\nconst g = 'Malli ajatteli pitkään.';\nconst h = 'Claude Assistentti';\n" },
      // The words that replaced them are not hits, and an ellipsis-less "Malli kirjoittaa" is not either
      { file: 'src/e.js', text: "const i = 'Tekoäly kirjoittaa… 22 merkkiä';\nconst j = 'Käsikirjoituksen kansio';\nconst k = 'Malli kirjoittaa vastausta';\n" }
    ];
    expect(retiredWordings(files)).toEqual([
      'src/a.js:1 AI-avustaja',
      'src/a.js:2 (Cmd+,)',
      'src/b.js:1 Kirjan kansio',
      'src/b.js:2 Kirjan ydin',
      'src/c.js:1 napsautus',
      'src/c.js:2 Piilota mallin',
      'src/c.js:3 Malli kirjoittaa…',
      'src/d.js:1 Malli ajattelee',
      'src/d.js:2 Malli ajatteli',
      'src/d.js:3 Claude Assistentti'
    ]);
  });

  test('the text rules read app.js, the main process files and src and utils, and no ._ file', () => {
    const files = sourceFiles().map(({ file }) => file);
    expect(files).toEqual(expect.arrayContaining(['app.js', 'electron.js', 'preload.js', 'src/editor/textTools.js', 'utils/manuscript.js']));
    expect(files.filter((file) => path.basename(file).startsWith('._'))).toEqual([]);
    expect(files.filter((file) => !file.endsWith('.js'))).toEqual([]);
  });

  test('the ._ twins of the external volume and files that are not .js are never read', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'faust-wiring-'));
    tempFolders.push(root);
    const write = (file, content) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), content);
    };
    const esm = "import { a } from './a.js';\nexport const b = a;\n";
    write('app.js', esm);
    write('src/b.js', esm);
    write('src/a.js', 'module.exports = { a: 1 };\n');
    write('src/._b.js', esm);
    write('src/editor/shell.js', esm);
    write('src/editor/._shell.js', '\u0000\u0005\u0016\u0007');
    write('src/editor/notes.md', esm);
    write('src/._hidden/c.js', esm);

    expect(jsFilesUnder('src', root)).toEqual(['src/a.js', 'src/b.js', 'src/editor/shell.js']);
    // The lint gate lists the same files, less the CommonJS one
    const { listFiles } = require(abs('scripts/check-undef.js'));
    expect(listFiles(root)).toEqual(['app.js', 'src/b.js', 'src/editor/shell.js']);
  });

  test('check-bundle passes a bundle with one copy of @codemirror/state and fails one with two or none', () => {
    const { STATE_MARKER } = require(abs('scripts/check-bundle.js'));
    const copy = `(()=>{throw new Error("${STATE_MARKER} from position and startSide")})();\n`;
    const run = (content) =>
      spawnSync(process.execPath, [abs('scripts/check-bundle.js'), '--bundle', tempFile('bundle.js', content)], {
        encoding: 'utf8'
      });

    const one = run(copy);
    expect(one.status).toBe(0);
    // The brief's line, word for word, in every mode; the caveat of a run without a build follows on its own line
    expect(one.stdout).toBe('check-bundle: ok (one copy of @codemirror/state, no warnings)\n(nothing was built: warnings were not checked)\n');

    // @lezer/common has no gate of its own: twice is a second copy, none is a bundle without the parser
    const { LEZER_MARKER } = require(abs('scripts/check-bundle.js'));
    const lezer = `(()=>{throw new RangeError("${LEZER_MARKER}")})();\n`;
    expect(run(copy + lezer).status).toBe(0);
    const lezerTwice = run(copy + lezer + lezer);
    expect(lezerTwice.status).toBe(1);
    expect(lezerTwice.stderr).toContain('@lezer/common is in the bundle 2 times.');

    const two = run(copy + copy);
    expect(two.status).toBe(1);
    expect(two.stderr).toContain('@codemirror/state is in the bundle 2 times.');
    expect(two.stderr).toContain("require('@codemirror/…') or require('@lezer/…'); only import statements in ESM files may name them.");

    const none = run('console.log("ei editoria");\n');
    expect(none.status).toBe(1);
    expect(none.stderr).toContain('@codemirror/state is in the bundle 0 times.');

    const absent = spawnSync(process.execPath, [abs('scripts/check-bundle.js'), '--bundle', path.join(os.tmpdir(), 'faust-wiring-no-such-bundle.js')], {
      encoding: 'utf8'
    });
    expect(absent.status).toBe(1);
  }, SPAWN_TIMEOUT);

  test('check-bundle reads its arguments, counts a text and finds every warning block of a webpack output', () => {
    const { parseArgs, countOccurrences, warningBlocks, hasWarning } = require(abs('scripts/check-bundle.js'));

    expect(parseArgs([])).toEqual({ build: true, bundle: null, error: null });
    expect(parseArgs(['--no-build'])).toEqual({ build: false, bundle: null, error: null });
    expect(parseArgs(['--bundle', '/tmp/kopio.js'])).toEqual({ build: false, bundle: '/tmp/kopio.js', error: null });
    expect(parseArgs(['--bundle']).error).toBe('--bundle needs a path');
    expect(parseArgs(['--watch']).error).toBe('unknown argument --watch');

    expect(countOccurrences('', 'a')).toBe(0);
    expect(countOccurrences('äöå – äöå ” äöå', 'äöå')).toBe(3);
    expect(countOccurrences('aaaa', 'aa')).toBe(2);

    const output = [
      '> faust@1.0.0 build',
      '> webpack --mode=production',
      '',
      'asset bundle.js 530 KiB [emitted] [minimized] (name: main)',
      '',
      'WARNING in ./app.js 7100:12-23',
      "export 'useNoAIGuard' (imported as 'useNoAIGuard') was not found in './src/components/ContextFields.js' (possible exports: BookBriefFields)",
      '',
      'WARNING in ./src/components/FaustEditor.js',
      'Module Warning (from ./node_modules/babel-loader/lib/index.js):',
      '',
      '  1 | const a = 1;',
      '> 2 | const b = 2;',
      '',
      'webpack 5.104.1 compiled with 2 warnings in 4000 ms',
      '',
      '> faust@1.0.0 postbuild',
      '> node scripts/post-build.js',
      ''
    ].join('\r\n');
    expect(warningBlocks(output)).toEqual([
      "WARNING in ./app.js 7100:12-23\nexport 'useNoAIGuard' (imported as 'useNoAIGuard') was not found in './src/components/ContextFields.js' (possible exports: BookBriefFields)",
      'WARNING in ./src/components/FaustEditor.js\nModule Warning (from ./node_modules/babel-loader/lib/index.js):\n\n  1 | const a = 1;\n> 2 | const b = 2;'
    ]);
    expect(warningBlocks('webpack 5.104.1 compiled successfully in 3000 ms\n')).toEqual([]);
    expect(warningBlocks('')).toEqual([]);
    expect(hasWarning(output)).toBe(true);
    expect(hasWarning('webpack 5.104.1 compiled successfully in 3000 ms\n')).toBe(false);

    // webpack-cli with FORCE_COLOR set (to any value, 0 too): codes between "WARNING" and " in"
    const coloured = [
      '\u001b[1m\u001b[33mWARNING\u001b[39m\u001b[22m in \u001b[1m./app.js 11:12-24\u001b[39m\u001b[22m',
      "\u001b[1mexport 'showTooltips' (imported as 'showTooltips') was not found in '@codemirror/view'\u001b[39m\u001b[22m",
      '',
      'webpack 5.104.1 compiled with \u001b[1m\u001b[33m1 warning\u001b[39m\u001b[22m in 4000 ms',
      ''
    ].join('\n');
    expect(coloured.includes('WARNING in')).toBe(false);
    expect(hasWarning(coloured)).toBe(true);
    expect(warningBlocks(coloured)).toEqual([
      "WARNING in ./app.js 11:12-24\nexport 'showTooltips' (imported as 'showTooltips') was not found in '@codemirror/view'"
    ]);
  });

  test('check-undef lints app.js and exactly the ES modules under src', () => {
    const { listFiles, isEsm: scriptIsEsm } = require(abs('scripts/check-undef.js'));
    const expected = ['app.js', ...jsFilesUnder('src').filter((file) => isEsm(read(file)))];
    expect(listFiles()).toEqual(expected);
    expect(listFiles()).toContain('src/components/FaustEditor.js');
    // CommonJS files are Jest's business
    expect(listFiles()).not.toContain('src/editor/textTools.js');

    expect(scriptIsEsm("const a = 1;\nexport const b = 2;\n")).toBe(true);
    expect(scriptIsEsm("import { a } from './a.js';\r\n")).toBe(true);
    expect(scriptIsEsm("const a = require('./a.js');\nmodule.exports = { a };\n")).toBe(false);
    expect(scriptIsEsm(" * import { a } from './a.js';\n")).toBe(false);
    expect(scriptIsEsm('')).toBe(false);
  });

  test('the lint config of check-undef reports an identifier that nobody imported and accepts the app globals', () => {
    const { ESLINT, ESLINT_OPTIONS } = require(abs('scripts/check-undef.js'));
    const config = require(abs('scripts/eslint.wiring.config.js'));
    // The same command as check-undef.js, with the text on stdin instead of a file in src/.
    // (ESLint's Linter class cannot run inside jsdom, which has no structuredClone.)
    const lint = (code) => {
      const result = spawnSync(
        ESLINT,
        [...ESLINT_OPTIONS, '--format', 'json', '--stdin', '--stdin-filename', 'src/components/WiringTrial.js'],
        { cwd: ROOT, input: code, encoding: 'utf8' }
      );
      const messages = JSON.parse(result.stdout)[0].messages;
      return { status: result.status, messages: messages.map((m) => `${m.line} ${m.ruleId} ${m.message}`) };
    };

    const broken = lint(
      [
        "import { BookBriefFields } from './ContextFields.js';",
        'const { createElement: e } = React;',
        'export function Trial({ project }) {',
        '  const guard = useNoAIGuard(project);',
        '  return e(BookBriefFields, { project, guard });',
        '}',
        ''
      ].join('\n')
    );
    expect(broken).toEqual({ status: 1, messages: ["4 no-undef 'useNoAIGuard' is not defined."] });

    const clean = lint(
      [
        "import { continueList } from '../editor/textTools.js';",
        'const { useState } = React;',
        'export function Trial() {',
        '  const [value] = useState(() => window.localStorage.getItem("faust") || document.title);',
        '  setTimeout(() => console.log(continueList, value, navigator.platform), 0);',
        '  return ReactDOM.createPortal(null, document.body);',
        '}',
        ''
      ].join('\n')
    );
    expect(clean).toEqual({ status: 0, messages: [] });

    expect(config).toHaveLength(1);
    expect(config[0].rules).toEqual({ 'no-undef': 'error' });
    expect(config[0].languageOptions.sourceType).toBe('module');
  }, SPAWN_TIMEOUT);
});
